import { addRational } from "../economy/quantity";
import { researchBonus } from "../content/research";
import {
  BLUEPRINTS,
  RECIPES,
  RESOURCES,
  TUNING,
  type ResourceId,
  type ItemStack,
} from "../content/defs";
import {
  machineById,
  STORE_ENDPOINT,
  type DroneState,
  type MachineState,
  type RouteState,
  type SimState,
} from "./types";

/**
 * Deterministic simulation advance (spec 9.5, 21.4).
 *
 * Phase order per tick: finish eligible batches, enqueue cargo, settle
 * arriving cargo, allocate shared power, start next batches fairly, then
 * resolve drone and contract events. The order is fixed so equal-priority
 * consumers do not depend on insertion order alone.
 */
export function advance(s: SimState, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) stepTick(s);
}

/**
 * Advance to an absolute tick, jumping ranges with no pending event.
 * Identical results to `advance` for the same target (spec 21.4 equivalence).
 */
export function advanceTo(s: SimState, target: number): void {
  let guard = 0;
  while (s.tick < target) {
    if (guard++ > 20_000_000) break;
    const due = nextDueTick(s, target);
    if (due > s.tick + 1 && target > s.tick + 1 && !hasContinuousWork(s)) {
      const next = Math.min(due, target);
      // A jump covers only idle ticks: no batch runs and no cargo flies, so
      // only the measured ages advance. Keeps `advance` and `advanceTo`
      // numerically identical for one target (spec 21.4).
      const delta = next - s.tick;
      for (const m of s.machines) {
        m.ageTicks += delta;
        if (m.progress === 0 && m.trayUnits === 0 && m.inBufUnits === 0) {
          m.starvedTicks += delta;
          m.status = "starved";
        }
        rollRateWindow(m);
      }
      for (const r of s.routes) r.ageTicks += delta;
      s.tick = next;
      continue;
    }
    stepTick(s);
  }
  if (s.tick > target) s.tick = target;
}

/** Derived lookup for one state, rebuilt when a command changes the topology.
 * The tick loop resolves machines and outgoing links through it so per-tick
 * work stays linear in the entity count rather than quadratic (spec 21.5). */
interface SimIndex {
  readonly state: SimState;
  readonly revision: number;
  readonly machineCount: number;
  readonly routeCount: number;
  readonly machines: Map<number, MachineState>;
  readonly outputs: Map<number, RouteState[]>;
  /** Smart Buffers units, read once per rebuild (spec 12.2). */
  readonly bufferBonus: number;
}

let simIndex: SimIndex | null = null;

function indexOf(s: SimState): SimIndex {
  const current = simIndex;
  if (
    current &&
    current.state === s &&
    current.revision === s.revision &&
    current.machineCount === s.machines.length &&
    current.routeCount === s.routes.length
  ) {
    return current;
  }
  const machines = new Map<number, MachineState>();
  for (const m of s.machines) machines.set(m.id, m);
  const outputs = new Map<number, RouteState[]>();
  for (const route of s.routes) {
    if (route.from.kind !== "machine") continue;
    const bucket = outputs.get(route.from.id);
    if (bucket) bucket.push(route);
    else outputs.set(route.from.id, [route]);
  }
  simIndex = {
    state: s,
    revision: s.revision,
    machineCount: s.machines.length,
    routeCount: s.routes.length,
    machines,
    outputs,
    bufferBonus: researchBonus(s).inputBuffer,
  };
  return simIndex;
}

function indexedMachine(idx: SimIndex, id: number): MachineState | undefined {
  return idx.machines.get(id);
}

function hasContinuousWork(s: SimState): boolean {
  if (s.overflow.length > 0) return true;
  for (const m of s.machines) {
    if (m.progress > 0 || m.trayUnits > 0) return true;
    if (inBufTotal(m) > 0) return true;
  }
  for (const r of s.routes) if (r.inFlight > 0) return true;
  if (s.routes.length > 0 && s.storeUnits > 0) return true;
  if (s.drone.repaired) return true;
  for (const d of s.spares) if (d.repaired) return true;
  return false;
}

/** Earliest tick a repaired unit does something: launch, or land. */
function unitDueTick(s: SimState, d: DroneState, due: number): number {
  if (!d.repaired) return due;
  let next = Math.min(due, Math.max(s.tick + 1, d.nextDeliveryTick));
  if (d.inFlight) next = Math.min(next, Math.max(s.tick + 1, d.inFlight.arrive));
  return next;
}

function nextDueTick(s: SimState, target: number): number {
  let due = target;
  due = unitDueTick(s, s.drone, due);
  for (const d of s.spares) due = unitDueTick(s, d, due);
  for (const r of s.routes) {
    for (const item of r.items)
      due = Math.min(due, Math.max(s.tick + 1, item.arrive));
  }
  for (const m of s.machines) {
    if (m.progress > 0) {
      const remaining = Math.ceil((m.batchMilli - m.progress) / 1000);
      due = Math.min(due, s.tick + Math.max(1, remaining));
    }
  }
  return due;
}

function inBufTotal(m: MachineState): number {
  return m.inBufUnits;
}

function stepTick(s: SimState): void {
  const idx = indexOf(s);
  finishBatches(s);
  enqueueCargo(s, idx);
  settleArrivals(s, idx);
  drainOverflow(s);
  const requested = allocatePower(s);
  startBatches(s, requested);
  advanceProgress(s, requested);
  updateDrone(s);
  measure(s);
  s.tick += 1;
  syncTutorial(s);
}

/** Occupancy counters the bottleneck assistant reports (spec 10.5). */
function measure(s: SimState): void {
  for (const m of s.machines) {
    m.ageTicks += 1;
    if (m.progress > 0) m.busyTicks += 1;
    else if (m.status === "outputFull") m.fullTicks += 1;
    // One integer compare per machine per tick; the sample rolls once a minute.
    if (m.ageTicks - m.rateAge >= RATE_WINDOW_TICKS) rollRateWindow(m);
  }
  for (const r of s.routes) {
    r.ageTicks += 1;
    if (r.inFlight > 0) r.busyTicks += 1;
  }
}

/**
 * Fixed-grid rate samples for the measured window (spec 9.4).
 *
 * The grid advances by whole windows from the machine's own age, so a tick-by-tick
 * run and an event-jump run reach the same sample ticks and, because a jump covers
 * only ticks where nothing completes, the same sample values.
 */
function rollRateWindow(m: MachineState): void {
  while (m.ageTicks - m.rateAge >= RATE_WINDOW_TICKS) {
    m.rateAgePrev = m.rateAge;
    m.rateFromPrev = m.rateFrom;
    m.rateAge += RATE_WINDOW_TICKS;
    m.rateFrom = m.batchesDone;
  }
}

/** Phase 1: complete batches whose work is finished and whose tray is free. */
function finishBatches(s: SimState): void {
  for (const m of s.machines) {
    if (m.progress <= 0) continue;
    if (m.progress < m.batchMilli) {
      m.status = "running";
      continue;
    }
    const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
    const outputs = recipe.outputs;
    const outUnits = totalUnits(outputs);
    if (m.trayUnits + outUnits > BLUEPRINTS[m.blueprint].outputBuffer) {
      m.status = "outputFull";
      continue;
    }
    for (const out of outputs) {
      m.tray.push({ ...out });
      m.trayUnits += out.qty;
    }
    m.batch = [];
    m.progress = 0;
    m.progressRem = 0;
    m.batchesDone += 1;
    m.status = "idle";
  }
}

/** Phase 2: move each tray item onto the link that carries its material.
 * A recipe with two outputs (R01) needs two links, and a null-filter link
 * carries anything, so one connection still works for one-material recipes.
 * Whatever cannot move stays in the tray and the machine reads `Cargo full`. */
function enqueueCargo(s: SimState, idx: SimIndex): void {
  const outputs = idx.outputs;
  for (const m of s.machines) {
    if (m.trayUnits === 0) continue;
    const links = outputs.get(m.id);
    let keptUnits = 0;
    let keep = 0;
    for (let i = 0; i < m.tray.length; i += 1) {
      const item = m.tray[i];
      const route = links
        ? pickOutputLink(idx, links, item.resource)
        : undefined;
      const room = route ? route.capacity - route.inFlight : 0;
      const moved = Math.min(item.qty, Math.max(0, room));
      if (moved > 0 && route) {
        route.items.push({
          resource: item.resource,
          qty: moved,
          arrive: s.tick + route.latency,
        });
        route.inFlight += moved;
      }
      const left = item.qty - moved;
      if (left > 0) {
        item.qty = left; // compacts in place, so a waiting tray allocates nothing
        m.tray[keep] = item;
        keep += 1;
        keptUnits += left;
      }
    }
    if (keep !== m.tray.length) m.tray.length = keep;
    m.trayUnits = keptUnits;
    m.status = keptUnits > 0 ? "outputFull" : "running";
  }
  pullFromStore(s, idx);
}

/** Chooses among one machine's outgoing links for one material. The least busy
 * link that can take it this tick wins, so a direct machine link and the dock
 * link share the flow instead of one starving the other. A link that carries
 * anything, then the machine's first link, follow, so a half-connected machine
 * still ships its tray instead of halting. */
function pickOutputLink(
  idx: SimIndex,
  links: RouteState[],
  resource: ResourceId,
): RouteState | undefined {
  let unfiltered: RouteState | undefined;
  let best: RouteState | undefined;
  for (let i = 0; i < links.length; i += 1) {
    const route = links[i];
    if (route.filter === resource && route.capacity - route.inFlight > 0) {
      if (
        destinationRoom(idx, route) > 0 &&
        (!best || route.busyTicks < best.busyTicks)
      ) {
        best = route;
      }
    }
    if (route.filter === null && unfiltered === undefined) unfiltered = route;
  }
  return best ?? unfiltered ?? links[0];
}

/** Store-sourced routes draw material into transit, honouring their filter.
 * A small reserve floor keeps construction affordable and prevents a
 * starved-then-stranded starter account (spec 4.3, 7.5).
 *
 * A machine-destination route draws only what its machine still has in hand:
 * two batches' worth of the filtered resource, counted across the machine's
 * input buffer and this route's in-transit cargo, widened by the Smart Buffers
 * node and capped by the machine's effective input capacity. The running
 * batch's own reserved inputs are separate, so two ready batches cover the
 * link's 5-tick latency while the surplus stays in the store, where build
 * costs, sells, and prices are read (spec 8.2, B-19). */
const RESERVE_FLOOR = TUNING.reserveFloor;

/** Ready units a fed machine keeps in hand: the next batch plus one still flying. */
export const PULL_LOOKAHEAD_BATCHES = 2;

/** Sample spacing for the measured rate window, in ticks (spec 9.4). */
const RATE_WINDOW_TICKS = TUNING.rateWindowTicks;

function pullFromStore(s: SimState, idx: SimIndex): void {
  for (const route of s.routes) {
    if (route.from.kind !== "store") continue;
    const resources = route.filter === null ? RESOURCES : [route.filter];
    for (const resource of resources) {
      const space = route.capacity - route.inFlight;
      if (space <= 0) break;
      const need = pullNeed(idx, route, resource, space);
      if (need <= 0) continue;
      const available = Math.max(0, (s.store[resource] ?? 0) - RESERVE_FLOOR);
      if (available <= 0) continue;
      const moved = Math.min(space, available, need);
      const left = (s.store[resource] ?? 0) - moved;
      s.store[resource] = left > 0 ? left : 0;
      s.storeUnits -= moved;
      route.items.push({
        resource,
        qty: moved,
        arrive: s.tick + route.latency,
      });
      route.inFlight += moved;
    }
  }
}

/** Units this store-sourced route may still draw for one resource. */
function pullNeed(
  idx: SimIndex,
  route: RouteState,
  resource: ResourceId,
  space: number,
): number {
  if (route.to.kind !== "machine") return space;
  const machine = indexedMachine(idx, route.to.id);
  if (!machine) return space;
  const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
  let perBatch = 0;
  for (const input of recipe.inputs) {
    if (input.resource === resource) perBatch += input.qty;
  }
  if (perBatch === 0) return 0;
  let ready = machine.inBuf[resource] ?? 0;
  for (const item of route.items) {
    if (item.resource === resource) ready += item.qty;
  }
  const window = perBatch * PULL_LOOKAHEAD_BATCHES + idx.bufferBonus;
  const capacity = BLUEPRINTS[machine.blueprint].inputBuffer + idx.bufferBonus;
  return Math.max(0, Math.min(capacity, window) - ready);
}

/** Phase 3: deliver route cargo whose latency elapsed, if the input has room. */
function settleArrivals(s: SimState, idx: SimIndex): void {
  for (let index = 0; index < s.routes.length; index += 1) {
    const route = s.routes[(s.routeCursor + index) % s.routes.length];
    if (!route || route.items.length === 0) continue;
    const head = route.items[0];
    if (head.arrive > s.tick) continue;
    const room = destinationRoom(idx, route);
    if (room <= 0) continue;
    const moved = Math.min(head.qty, room);
    if (moved <= 0) continue;
    deliver(s, route, head.resource, moved);
    if (head.qty === moved) route.items.shift();
    else head.qty -= moved;
    route.inFlight -= moved;
    s.routeCursor = (s.routeCursor + 1) % Math.max(1, s.routes.length);
  }
}

function drainOverflow(s: SimState): void {
  while (s.overflow.length > 0 && s.storeUnits < s.storeCapacity) {
    const head = s.overflow[0];
    const moved = Math.min(head.qty, s.storeCapacity - s.storeUnits);
    addToStore(s, head.resource, moved);
    if (head.qty === moved) s.overflow.shift();
    else s.overflow[0] = { resource: head.resource, qty: head.qty - moved };
  }
}

/** Phase 4: shared power budget (spec 10.4). Returns requested power. */
function allocatePower(s: SimState): number {
  let requested = 0;
  for (const m of s.machines) if (m.progress > 0) requested += m.batchPower;
  const capacity = TUNING.yardPowerCapacity;
  s.powerRatio = requested === 0 ? 1 : Math.min(1, capacity / requested);
  return requested;
}

/** Phase 5: start batches in persistent fair order, reserving inputs once. */
function startBatches(s: SimState, requested: number): void {
  const count = s.machines.length;
  if (count === 0) return;
  const capacity = TUNING.yardPowerCapacity;
  const start = s.machineCursor % count;
  let lastStarted = -1;
  for (let offset = 0; offset < count; offset += 1) {
    const slot = (start + offset) % count;
    const m = s.machines[slot];
    if (m.progress > 0) continue;
    if (m.trayUnits > 0) {
      m.status = "outputFull";
      continue;
    }
    const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
    if (!hasInputs(m, recipe.inputs)) {
      m.starvedTicks += 1;
      m.status = "starved";
      continue;
    }
    if (m.inBufUnits < totalUnits(recipe.inputs)) continue;
    for (const input of recipe.inputs) {
      m.inBuf[input.resource] = (m.inBuf[input.resource] ?? 0) - input.qty;
      m.inBufUnits -= input.qty;
    }
    m.batch = recipe.inputs.map((input) => ({ ...input }));
    m.batchMilli = batchMilli(m);
    m.batchPower = recipe.power;
    m.progress = 1;
    m.progressRem = 0;
    m.progressDen =
      requested === 0 ? recipe.power : Math.max(requested, capacity);
    m.status = "running";
    lastStarted = slot;
  }
  if (lastStarted >= 0) s.machineCursor = (lastStarted + 1) % count;
  if (requested > capacity) {
    for (const m of s.machines) if (m.progress > 0) m.status = "powerLimited";
  }
}

/** Phase 5b: accrue work using the shared power ratio. */
function advanceProgress(s: SimState, requested: number): void {
  const capacity = TUNING.yardPowerCapacity;
  const denom = requested === 0 ? capacity : Math.max(requested, capacity);
  for (const m of s.machines) {
    if (m.progress <= 0) continue;
    if (m.progressDen !== denom) {
      m.progressDen = denom;
      m.progressRem = 0;
    }
    if (requested !== 0 && requested <= capacity) {
      m.progress += 1000;
      continue;
    }
    const step = addRational(m.progress, m.progressRem, 1000 * capacity, denom);
    m.progress = step.whole;
    m.progressRem = step.remainder;
  }
}

/** One pass per working unit: the repaired starter, then each spare (B-28). */
function updateDrone(s: SimState): void {
  updateUnit(s, s.drone);
  for (const d of s.spares) updateUnit(s, d);
}

function updateUnit(s: SimState, d: DroneState): void {
  if (!d.repaired) return;
  if (d.inFlight) {
    if (d.inFlight.arrive <= s.tick) {
      const room = s.storeCapacity - s.storeUnits;
      const moved = Math.min(d.inFlight.qty, Math.max(0, room));
      if (moved <= 0) return;
      addToStore(s, "scrap", moved);
      if (moved === d.inFlight.qty) d.inFlight = null;
      else
        d.inFlight = { qty: d.inFlight.qty - moved, arrive: d.inFlight.arrive };
      d.deliveries += 1;
    }
    return;
  }
  if (s.tick >= d.nextDeliveryTick) {
    const taken = Math.min(TUNING.droneDeliveryUnits, s.wreck.remaining);
    s.wreck.remaining -= taken;
    d.accumulated += taken;
    if (s.wreck.remaining === 0) {
      s.wreck.generation += 1;
      s.wreck.remaining = TUNING.starterWreckPool;
    }
    d.inFlight = { qty: taken, arrive: s.tick + TUNING.droneTravelTicks };
    d.nextDeliveryTick = s.tick + TUNING.droneDeliveryTicks;
  }
}

export function batchMilli(m: MachineState): number {
  const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
  return Math.ceil((recipe.cycleTicks * 10000) / (10 + (m.level - 1)));
}

function hasInputs(m: MachineState, inputs: readonly ItemStack[]): boolean {
  for (const input of inputs) {
    if ((m.inBuf[input.resource] ?? 0) < input.qty) return false;
  }
  return true;
}

export function totalUnits(items: readonly ItemStack[]): number {
  let total = 0;
  for (const item of items) total += item.qty;
  return total;
}

export function routeById(s: SimState, id: number): RouteState | undefined {
  for (const r of s.routes) if (r.id === id) return r;
  return undefined;
}

function destinationRoom(idx: SimIndex, route: RouteState): number {
  if (route.to.kind === "store")
    return idx.state.storeCapacity - idx.state.storeUnits;
  const machine = indexedMachine(idx, route.to.id);
  if (!machine) return 0;
  return (
    BLUEPRINTS[machine.blueprint].inputBuffer +
    idx.bufferBonus -
    machine.inBufUnits
  );
}

function deliver(
  s: SimState,
  route: RouteState,
  resource: ResourceId,
  amount: number,
): void {
  if (route.to.kind === "store") {
    addToStore(s, resource, amount);
    return;
  }
  const machine = machineById(s, route.to.id);
  if (!machine) {
    addToStore(s, resource, amount);
    return;
  }
  machine.inBuf[resource] = (machine.inBuf[resource] ?? 0) + amount;
  machine.inBufUnits += amount;
}

export function addToStore(
  s: SimState,
  resource: ResourceId,
  amount: number,
): void {
  if (amount <= 0) return;
  s.store[resource] = (s.store[resource] ?? 0) + amount;
  s.storeUnits += amount;
}

export function spendFromStore(
  s: SimState,
  items: readonly ItemStack[],
): boolean {
  for (const item of items) {
    if ((s.store[item.resource] ?? 0) < item.qty) return false;
  }
  for (const item of items) {
    const left = (s.store[item.resource] ?? 0) - item.qty;
    s.store[item.resource] = left > 0 ? left : 0;
    s.storeUnits -= item.qty;
  }
  return true;
}

/** Tutorial progression from authoritative state only (spec 4.2). */
function syncTutorial(s: SimState): void {
  if (s.tutorial === 0 && s.wreck.pulses >= 1) s.tutorial = 1;
  if (s.tutorial === 1 && s.wreck.pulses >= 6) s.tutorial = 2;
  if (s.tutorial === 2 && s.drone.repaired) s.tutorial = 3;
  if (s.tutorial === 3 && s.drone.deliveries >= 1) s.tutorial = 4;
  if (s.tutorial === 4 && s.machines.some((m) => m.blueprint === "sorter"))
    s.tutorial = 5;
  if (s.tutorial === 5 && s.routes.length >= 1) s.tutorial = 6;
  if (s.tutorial === 6 && qtyOf(s, "steel") > 0) s.tutorial = 7;
  if (s.tutorial === 7 && s.credits > 0) s.tutorial = 8;
  if (s.tutorial === 8 && s.machines.some((m) => m.level > 1)) s.tutorial = 9;
}

function qtyOf(s: SimState, resource: ResourceId): number {
  return s.store[resource] ?? 0;
}

export { STORE_ENDPOINT };
