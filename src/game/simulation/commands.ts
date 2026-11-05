import {
  BLUEPRINTS,
  RESOURCES,
  RECIPES,
  TUNING,
  exportPrice,
  type ResourceId,
} from "../content/defs";
import { RESEARCH, researchBonus } from "../content/research";
import {
  SCHEMA_VERSION,
  batchMilliOf,
  createUnit,
  inputCapacityOf,
  machineById,
  pushLog,
  upgradeRanks,
  type MachineState,
  type RouteState,
  type SimState,
  type UpgradeBranch,
} from "./types";
import {
  addToStore,
  PULL_LOOKAHEAD_BATCHES,
  routeById,
  spendFromStore,
  totalUnits,
} from "./engine";

export const YARD_COLS = 6;
export const YARD_ROWS = 6;
export const YARD_TILES = YARD_COLS * YARD_ROWS;
export const DOCK_TILE = 2;

export type CommandReject =
  | "insufficient"
  | "blocked-placement"
  | "not-found"
  | "no-room"
  | "duplicate"
  | "cooldown"
  | "cycle"
  | "already-claimed"
  | "locked"
  | "already-known"
  | "prereq"
  | "fleet-full"
  | "no-drone"
  | "read-only"
  | "reconciling";

export type CommandResult = { ok: true; revision: number } | { ok: false; reason: CommandReject };

export type Command =
  | { id: string; type: "manual.salvage" }
  | { id: string; type: "drone.repair" }
  | { id: string; type: "drone.add" }
  | { id: string; type: "machine.build"; blueprint: string; tile: number }
  | { id: string; type: "machine.upgrade"; machineId: number; branch?: UpgradeBranch }
  | { id: string; type: "machine.respec"; machineId: number; branch: UpgradeBranch }
  | { id: string; type: "machine.dismantle"; machineId: number }
  | { id: string; type: "machine.move"; machineId: number; tile: number }
  | { id: string; type: "route.connect"; from: number; to: number; filter: ResourceId | null }
  | { id: string; type: "route.remove"; routeId: number }
  | { id: string; type: "contract.export" }
  | { id: string; type: "contract.sell"; resource: ResourceId; qty: number }
  | { id: string; type: "research.buy"; node: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CommandBody = DistributiveOmit<Command, "id">;

/** Applies a validated command once; retries of the same id return the first result. */
export function applyCommand(s: SimState, command: Command): CommandResult {
  const seen = s.seenCommands[command.id];
  if (seen !== undefined) return { ok: true, revision: seen };
  const result = execute(s, command);
  if (result.ok) {
    s.revision += 1;
    s.seenCommands[command.id] = s.revision;
  }
  return result;
}

function execute(s: SimState, command: Command): CommandResult {
  switch (command.type) {
    case "manual.salvage":
      return manualSalvage(s);
    case "drone.repair":
      return repairDrone(s);
    case "drone.add":
      return addDrone(s);
    case "machine.build":
      return buildMachine(s, command.blueprint, command.tile);
    case "machine.upgrade":
      return upgradeMachine(s, command.machineId, command.branch);
    case "machine.respec":
      return respecMachine(s, command.machineId, command.branch);
    case "machine.dismantle":
      return dismantleMachine(s, command.machineId);
    case "machine.move":
      return moveMachine(s, command.machineId, command.tile);
    case "route.connect":
      return connectRoute(s, command.from, command.to, command.filter);
    case "route.remove":
      return removeRoute(s, command.routeId);
    case "contract.export":
      return exportContract(s);
    case "contract.sell":
      return sellResource(s, command.resource, command.qty);
    case "research.buy":
      return buyResearch(s, command.node);
    default:
      return { ok: false, reason: "not-found" };
  }
}

function commit(s: SimState, key: string, value: number): CommandResult {
  pushLog(s, key, value);
  return { ok: true, revision: s.revision + 1 };
}

function manualSalvage(s: SimState): CommandResult {
  if (s.tick < s.wreck.nextPulseTick) return { ok: false, reason: "cooldown" };
  const perPulse = TUNING.manualSalvagePerPulse + researchBonus(s).pulseScrap;
  const taken = Math.min(perPulse, s.wreck.remaining);
  if (taken <= 0) {
    s.wreck.generation += 1;
    s.wreck.remaining = TUNING.starterWreckPool;
  }
  const amount = Math.min(perPulse, s.wreck.remaining);
  s.wreck.remaining -= amount;
  s.wreck.pulses += 1;
  s.wreck.nextPulseTick = s.tick + TUNING.manualPulseTicks;
  const room = s.storeCapacity - s.storeUnits;
  const placed = Math.min(amount, Math.max(0, room));
  addToStore(s, "scrap", placed);
  if (placed < amount) {
    s.overflow.push({ resource: "scrap", qty: amount - placed });
  }
  if (s.wreck.remaining === 0) {
    s.wreck.generation += 1;
    s.wreck.remaining = TUNING.starterWreckPool;
  }
  return commit(s, "salvage", placed);
}

function repairDrone(s: SimState): CommandResult {
  if (s.drone.repaired) return { ok: false, reason: "duplicate" };
  const cost = [{ resource: "scrap" as ResourceId, qty: TUNING.repairCostScrap }];
  if (!spendFromStore(s, cost)) return { ok: false, reason: "insufficient" };
  s.drone.repaired = true;
  s.drone.nextDeliveryTick = s.tick + TUNING.droneDeliveryTicks;
  return commit(s, "repair", 1);
}

/**
 * Credit price of the next spare: 45 then double each time, so the fleet is a real
 * choice against upgrades instead of a flat list (spec 8.6, B-28).
 */
export function droneAddCost(s: SimState): number {
  return TUNING.droneAddBaseCost * 2 ** s.spares.length;
}

/**
 * Buys one additional recovery drone (B-28). Every unit works the same starter route
 * independently, so two units double what the wreck hands over per second while the
 * finite pool still decides the total (spec 7.2: efficiency and work, not new matter).
 */
function addDrone(s: SimState): CommandResult {
  if (!s.drone.repaired) return { ok: false, reason: "no-drone" };
  if (1 + s.spares.length >= TUNING.fleetCap) return { ok: false, reason: "fleet-full" };
  const cost = droneAddCost(s);
  if (s.credits < cost) return { ok: false, reason: "insufficient" };
  s.credits -= cost;
  const unit = createUnit();
  unit.nextDeliveryTick = s.tick + TUNING.droneDeliveryTicks;
  s.spares.push(unit);
  return commit(s, "drone", s.spares.length);
}

function buildMachine(s: SimState, blueprint: string, tile: number): CommandResult {
  const def = BLUEPRINTS[blueprint];
  if (!def) return { ok: false, reason: "not-found" };
  if (!validTile(s, tile)) return { ok: false, reason: "blocked-placement" };
  if (!spendFromStore(s, def.buildCost)) return { ok: false, reason: "insufficient" };
  const machine: MachineState = {
    id: s.nextMachineId++,
    blueprint,
    tile,
    orientation: 0,
    level: 1,
    inBuf: {},
    inBufUnits: 0,
    tray: [],
    trayUnits: 0,
    batch: [],
    progress: 0,
    progressRem: 0,
    progressDen: 0,
    batchMilli: RECIPES[def.recipeId].cycleTicks * 1000,
    batchPower: RECIPES[def.recipeId].power,
    status: "idle",
    inRoutes: [],
    outRoute: null,
    starvedTicks: 0,
    batchesDone: 0,
    ageTicks: 0,
    busyTicks: 0,
    fullTicks: 0,
    rateAge: 0,
    rateFrom: 0,
    rateAgePrev: 0,
    rateFromPrev: 0,
  };
  s.machines.push(machine);
  return commit(s, "build", machine.id);
}

/**
 * Pays the one price for the next level and records which named quantity it bought
 * (STRAT-002/A1). An unnamed purchase keeps the pre-fork scalar, so the old ladder,
 * the offline catch-up and every save written before the fork read unchanged.
 */
function upgradeMachine(
  s: SimState,
  machineId: number,
  branch?: UpgradeBranch
): CommandResult {
  const machine = machineById(s, machineId);
  if (!machine) return { ok: false, reason: "not-found" };
  const def = BLUEPRINTS[machine.blueprint];
  const cost = upgradeCost(def.baseUpgradeCost, machine.level);
  if (s.credits < cost) return { ok: false, reason: "insufficient" };
  s.credits -= cost;
  machine.level += 1;
  if (branch !== undefined) {
    const picks = machine.branch ?? [];
    picks.push(branch);
    machine.branch = picks;
  }
  machine.batchMilli = batchMilliOf(machine);
  return commit(s, "upgrade", machine.level);
}

/**
 * Re-chooses the newest named outcome at no cost (STRAT-002/A1). The credits were paid
 * once with the level, so a re-pick only moves one rank between the three quantities:
 * `level`, `credits` and every stored counter stay where they are, which makes the fork
 * reversible by the same number of taps it took to take.
 */
function respecMachine(
  s: SimState,
  machineId: number,
  branch: UpgradeBranch
): CommandResult {
  const machine = machineById(s, machineId);
  if (!machine) return { ok: false, reason: "not-found" };
  const picks = machine.branch;
  if (picks === undefined || picks.length === 0) return { ok: true, revision: s.revision };
  if (picks[picks.length - 1] === branch) return { ok: true, revision: s.revision };
  picks[picks.length - 1] = branch;
  machine.batchMilli = batchMilliOf(machine);
  return commit(s, "respec", machine.level);
}

function dismantleMachine(s: SimState, machineId: number): CommandResult {
  const index = s.machines.findIndex((m) => m.id === machineId);
  if (index < 0) return { ok: false, reason: "not-found" };
  const machine = s.machines[index];
  const def = BLUEPRINTS[machine.blueprint];
  const refundUnits = totalUnits(def.buildCost) + machine.trayUnits + machine.inBufUnits;
  if (s.storeCapacity - s.storeUnits < refundUnits) return { ok: false, reason: "no-room" };
  for (const item of def.buildCost) addToStore(s, item.resource, item.qty);
  for (const item of machine.tray) addToStore(s, item.resource, item.qty);
  for (const item of machine.batch) addToStore(s, item.resource, item.qty);
  for (const key of Object.keys(machine.inBuf) as ResourceId[]) {
    addToStore(s, key, machine.inBuf[key] ?? 0);
  }
  const outRouteId = machine.outRoute;
  const inRouteIds = [...machine.inRoutes];
  s.machines.splice(index, 1);
  if (outRouteId !== null) dropRoute(s, outRouteId);
  for (const id of inRouteIds) dropRoute(s, id);
  return commit(s, "dismantle", machine.id);
}

function moveMachine(s: SimState, machineId: number, tile: number): CommandResult {
  const machine = machineById(s, machineId);
  if (!machine) return { ok: false, reason: "not-found" };
  if (!validTile(s, tile)) return { ok: false, reason: "blocked-placement" };
  machine.tile = tile;
  return commit(s, "move", tile);
}

function connectRoute(
  s: SimState,
  from: number,
  to: number,
  filter: ResourceId | null
): CommandResult {
  if (from === to) return { ok: false, reason: "cycle" };
  if (to !== 0 && !machineById(s, to)) return { ok: false, reason: "not-found" };
  if (from !== 0 && !machineById(s, from)) return { ok: false, reason: "not-found" };
  for (const route of s.routes) {
    if (route.from.id === from && route.to.id === to && route.filter === filter) {
      return { ok: false, reason: "duplicate" };
    }
    // The store is a hub, so store↔machine pairs are not treated as cycles.
    if (from !== 0 && to !== 0 && route.from.id === to && route.to.id === from) {
      return { ok: false, reason: "cycle" };
    }
  }
  const route: RouteState = {
    id: s.nextRouteId++,
    from: { kind: from === 0 ? "store" : "machine", id: from },
    to: { kind: to === 0 ? "store" : "machine", id: to },
    filter,
    capacity: TUNING.routeCapacity + researchBonus(s).routeCapacity,
    latency: TUNING.routeLatencyTicks,
    items: [],
    inFlight: 0,
    busyTicks: 0,
    ageTicks: 0,
  };
  s.routes.push(route);
  if (to !== 0) {
    const target = machineById(s, to);
    if (target) target.inRoutes.push(route.id);
  }
  if (from !== 0) {
    const source = machineById(s, from);
    if (source) source.outRoute = route.id;
  }
  return commit(s, "connect", route.id);
}

function removeRoute(s: SimState, routeId: number): CommandResult {
  if (!routeById(s, routeId)) return { ok: false, reason: "not-found" };
  dropRoute(s, routeId);
  return commit(s, "route-remove", routeId);
}

/** Returns in-flight material deterministically, never deleting it (spec 28.2). */
function dropRoute(s: SimState, routeId: number): void {
  const index = s.routes.findIndex((r) => r.id === routeId);
  if (index < 0) return;
  const route = s.routes[index];
  for (const item of route.items) {
    const room = s.storeCapacity - s.storeUnits;
    const moved = Math.min(item.qty, Math.max(0, room));
    addToStore(s, item.resource, moved);
    if (item.qty > moved) s.overflow.push({ resource: item.resource, qty: item.qty - moved });
  }
  const target = route.to.kind === "machine" ? machineById(s, route.to.id) : undefined;
  if (target) {
    target.inRoutes = target.inRoutes.filter((id) => id !== routeId);
  }
  const source = route.from.kind === "machine" ? machineById(s, route.from.id) : undefined;
  if (source && source.outRoute === routeId) source.outRoute = null;
  s.routes.splice(index, 1);
}

function exportContract(s: SimState): CommandResult {
  if (s.exportClaimed) return { ok: false, reason: "already-claimed" };
  const cost = [{ resource: "steel" as ResourceId, qty: TUNING.exportContractSteel }];
  if (!spendFromStore(s, cost)) return { ok: false, reason: "insufficient" };
  s.exportClaimed = true;
  s.credits += TUNING.exportContractCredits;
  s.exportSteelDelivered = TUNING.exportContractSteel;
  return commit(s, "export", s.credits);
}

/**
 * Repeatable export at a content-defined price (spec 8.4). Supply is limited by
 * the yard's own throughput and by the per-resource reserve floor, so no
 * unbounded credit loop exists. Opens after the onboarding contract teaches the
 * exchange, keeping the tutorial's one-off rate distinct.
 */
function sellResource(s: SimState, resource: ResourceId, qty: number): CommandResult {
  if (!s.exportClaimed) return { ok: false, reason: "locked" };
  const price = exportPrice(resource);
  if (price <= 0) return { ok: false, reason: "not-found" };
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: "not-found" };
  const amount = Math.min(qty, sellableAmount(s, resource));
  if (amount <= 0) return { ok: false, reason: "insufficient" };
  if (!spendFromStore(s, [{ resource, qty: amount }])) return { ok: false, reason: "insufficient" };
  s.credits += price * amount;
  return commit(s, "sell", amount);
}

/** Units of one resource the store must keep so its consumers can start their next
 * batches: the same two-batch window `pullFromStore` asks for, per consumer, minus
 * what that machine already holds. A sell may only take what sits above this demand
 * and the reserve floor, so the store keeps one meaning for both readers - what the
 * yard does not itself need right now (spec 8.2, 10.5). Without this the deep chain
 * halts: a saturated store sold to the floor leaves a machine-destination link with
 * nothing to draw, so the last stage never runs (B-29). */
function machineInputDemand(s: SimState, resource: ResourceId): number {
  const bonus = researchBonus(s).inputBuffer;
  let need = 0;
  for (const machine of s.machines) {
    const def = BLUEPRINTS[machine.blueprint];
    if (!def) continue;
    const recipe = RECIPES[def.recipeId];
    let perBatch = 0;
    for (const input of recipe.inputs) {
      if (input.resource === resource) perBatch += input.qty;
    }
    if (perBatch === 0) continue;
    const window = Math.min(
      inputCapacityOf(machine, bonus),
      perBatch * (PULL_LOOKAHEAD_BATCHES + upgradeRanks(machine).buffer) + bonus
    );
    need += Math.max(0, window - (machine.inBuf[resource] ?? 0));
  }
  return need;
}

/** Units of one resource a sell may take: above the floor and above what the
 * machines still need, within one tranche. */
export function sellableAmount(s: SimState, resource: ResourceId): number {
  const held = s.store[resource] ?? 0;
  const floor = TUNING.reserveFloor + machineInputDemand(s, resource);
  return Math.min(Math.max(0, held - floor), TUNING.sellBatchCap);
}

/**
 * Buys one research rank (spec 12.2). Costs data, needs the prerequisite, and
 * stops at the declared rank so an effect can never be applied twice.
 */
function buyResearch(s: SimState, node: string): CommandResult {
  const def = RESEARCH[node];
  if (!def) return { ok: false, reason: "not-found" };
  const rank = s.research[def.id] ?? 0;
  if (rank >= def.maxRank) return { ok: false, reason: "already-known" };
  if (def.requires && (s.research[def.requires] ?? 0) <= 0) {
    return { ok: false, reason: "prereq" };
  }
  if ((s.store.data ?? 0) < def.cost) return { ok: false, reason: "insufficient" };
  if (!spendFromStore(s, [{ resource: "data", qty: def.cost }])) {
    return { ok: false, reason: "insufficient" };
  }
  s.research[def.id] = rank + 1;
  return commit(s, "research", def.cost);
}

export function upgradeCost(baseUpgradeCost: number, level: number): number {
  let cost = baseUpgradeCost;
  for (let i = 1; i < level; i += 1) cost = Math.ceil(cost * 1.16);
  return cost;
}

function validTile(s: SimState, tile: number): boolean {
  if (!Number.isInteger(tile) || tile < 0 || tile >= YARD_TILES) return false;
  if (tile === DOCK_TILE) return false;
  return !s.machines.some((m) => m.tile === tile);
}

export const RESOURCE_ORDER: readonly ResourceId[] = RESOURCES;
export { SCHEMA_VERSION };
