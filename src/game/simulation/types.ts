import {
  BLUEPRINTS,
  RECIPES,
  TUNING,
  type ResourceId,
  type ItemStack,
} from "../content/defs";

export interface MachineState {
  readonly id: number;
  readonly blueprint: string;
  tile: number;
  orientation: number;
  level: number;
  /** Reserved inputs held for a starting batch, per resource. */
  inBuf: Partial<Record<ResourceId, number>>;
  inBufUnits: number;
  /** Completed batch waiting for a free destination (spec 9.5). */
  tray: TrayItem[];
  trayUnits: number;
  /** Inputs reserved by the active batch until it completes (spec 9.5). */
  batch: ItemStack[];
  /** Milli-ticks of completed work on the current batch. */
  progress: number;
  progressRem: number;
  progressDen: number;
  /** Milli-tick requirement of the current batch, from level. */
  batchMilli: number;
  batchPower: number;
  status: MachineStatus;
  inRoutes: number[];
  outRoute: number | null;
  starvedTicks: number;
  /** Count of batches completed, for rate measurement. */
  batchesDone: number;
  /** Measured occupancy evidence for the bottleneck assistant (spec 10.5). */
  ageTicks: number;
  busyTicks: number;
  fullTicks: number;
  /** Rolling rate window (spec 9.4): newest sample, at machine age `rateAge`. */
  rateAge: number;
  rateFrom: number;
  /** Previous sample, exactly one window earlier, so the published span is fixed. */
  rateAgePrev: number;
  rateFromPrev: number;
  /**
   * Named quantities this machine's upgrades bought, in purchase order
   * (STRAT-002/A1). Optional and `undefined` while untouched, so `JSON.stringify`
   * drops the key and a pre-fork save stays byte-identical (checksum `eede3c4f`).
   */
  branch?: UpgradeBranch[];
}

/** Which named quantity one purchased level improved (STRAT-002/A1). */
export type UpgradeBranch = "speed" | "buffer" | "draw";

/** Dock order of the three named outcomes at the fork; also the respec order. */
export const UPGRADE_BRANCHES: readonly UpgradeBranch[] = ["speed", "buffer", "draw"];

/** Input units one `buffer` rank adds, the same step the Smart Buffers node takes. */
export const BUFFER_RANK_UNITS = 6;

/** How many times each named quantity was bought on this machine. */
export function upgradeRanks(m: MachineState): {
  readonly speed: number;
  readonly buffer: number;
  readonly draw: number;
} {
  const picks = m.branch;
  // The pre-fork ladder bought the one scalar it always had; that scalar was the
  // batch clock, so an untouched record reads as speed ranks and nothing else.
  if (picks === undefined) return { speed: m.level - 1, buffer: 0, draw: 0 };
  let speed = 0;
  let buffer = 0;
  let draw = 0;
  for (const pick of picks) {
    if (pick === "speed") speed += 1;
    else if (pick === "buffer") buffer += 1;
    else if (pick === "draw") draw += 1;
  }
  // A level paid for without naming a branch still moves the batch clock.
  speed += m.level - 1 - picks.length;
  return { speed, buffer, draw };
}

/** Milli-tick requirement of the current level, from the speed ranks. */
export function batchMilliOf(m: MachineState): number {
  const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
  return Math.ceil((recipe.cycleTicks * 10000) / (10 + upgradeRanks(m).speed));
}

/** Input capacity in units: the blueprint's own, plus Smart Buffers and buffer ranks. */
export function inputCapacityOf(m: MachineState, bufferBonus: number): number {
  return (
    BLUEPRINTS[m.blueprint].inputBuffer +
    bufferBonus +
    BUFFER_RANK_UNITS * upgradeRanks(m).buffer
  );
}

/** Power units one running batch of this machine draws. */
export function powerOf(m: MachineState): number {
  const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
  return Math.max(1, recipe.power - upgradeRanks(m).draw);
}

export type MachineStatus =
  "idle" | "running" | "starved" | "outputFull" | "powerLimited" | "paused";

export interface RouteState {
  readonly id: number;
  from: Endpoint;
  to: Endpoint;
  filter: ResourceId | null;
  capacity: number;
  latency: number;
  /**
   * Ordered tile indices the belt crosses, from the source tile to the destination
   * tile (BELT-001). The walk is the deterministic Manhattan path in `manhattanRun`.
   * Optional and `undefined` on saves written before the price existed, where the
   * stored `latency` keeps its constant meaning, so an old save behaves identically.
   */
  run?: number[];
  items: RouteItem[];
  inFlight: number;
  /** Measured utilisation: ticks with cargo in transit, over `ageTicks`. */
  busyTicks: number;
  ageTicks: number;
}

export interface RouteItem {
  resource: ResourceId;
  qty: number;
  arrive: number;
}

/** A material waiting in a machine's tray; its `qty` shrinks as cargo ships
 * onto a link, so the tray never reallocates while it waits (spec 9.5). */
export interface TrayItem {
  readonly resource: ResourceId;
  qty: number;
}

export interface Endpoint {
  readonly kind: "store" | "machine";
  readonly id: number;
}

export interface DroneState {
  repaired: boolean;
  accumulated: number;
  nextDeliveryTick: number;
  inFlight: { qty: number; arrive: number } | null;
  deliveries: number;
}

export interface LogEntry {
  readonly tick: number;
  readonly key: string;
  readonly value: number;
}

export interface SimState {
  schemaVersion: number;
  contentVersion: number;
  revision: number;
  tick: number;
  /** Dock store: the yard's bulk storage (spec 8.2 destination storage). */
  store: Partial<Record<ResourceId, number>>;
  storeUnits: number;
  storeCapacity: number;
  /** Material returned from removed routes beyond free capacity (spec 28.2). */
  overflow: ItemStack[];
  machines: MachineState[];
  routes: RouteState[];
  wreck: {
    remaining: number;
    generation: number;
    pulses: number;
    nextPulseTick: number;
  };
  drone: DroneState;
  /** Extra recovery drones, in purchase order; the starter stays in `drone` (B-28). */
  spares: DroneState[];
  credits: number;
  exportSteelDelivered: number;
  exportClaimed: boolean;
  /** Number of completed tutorial steps (spec 4.2). 10 means independent. */
  tutorial: number;
  nextMachineId: number;
  nextRouteId: number;
  machineCursor: number;
  routeCursor: number;
  powerRatio: number;
  log: LogEntry[];
  seenCommands: Record<string, number>;
  /** Purchased research nodes, id to rank; each node's effect applies once. */
  research: Record<string, number>;
}

export const SCHEMA_VERSION = 1;
export const CONTENT_VERSION = 1;

const STORE_ENDPOINT: Endpoint = { kind: "store", id: 0 };

export function createInitialState(): SimState {
  return {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    revision: 0,
    tick: 0,
    store: {},
    storeUnits: 0,
    storeCapacity: TUNING.dockCapacity,
    overflow: [],
    machines: [],
    routes: [],
    wreck: {
      remaining: TUNING.starterWreckPool,
      generation: 1,
      pulses: 0,
      nextPulseTick: 0,
    },
    drone: {
      repaired: false,
      accumulated: 0,
      nextDeliveryTick: 0,
      inFlight: null,
      deliveries: 0,
    },
    spares: [],
    credits: 0,
    exportSteelDelivered: 0,
    exportClaimed: false,
    tutorial: 0,
    nextMachineId: 1,
    nextRouteId: 1,
    machineCursor: 0,
    routeCursor: 0,
    powerRatio: 1,
    log: [],
    seenCommands: {},
    research: {},
  };
}

/** Integer store access keeps undefined out of arithmetic. */
export function qty(s: SimState, r: ResourceId): number {
  return s.store[r] ?? 0;
}

/** One working drone's starting record; every unit runs the same starter route. */
export function createUnit(): DroneState {
  return { repaired: true, accumulated: 0, nextDeliveryTick: 0, inFlight: null, deliveries: 0 };
}

/**
 * Every drone in stable order: the repaired starter then each spare in purchase
 * order (B-28). The order is fixed, so iteration is deterministic.
 */
export function fleetUnits(s: SimState): readonly DroneState[] {
  return [s.drone, ...s.spares];
}

/** Deliveries landed by the whole fleet, for the return report and the fixtures. */
export function fleetDeliveries(s: SimState): number {
  let total = s.drone.deliveries;
  for (const d of s.spares) total += d.deliveries;
  return total;
}

/** Units lifted from the wreck by the whole fleet, the ledger's flight leg. */
export function fleetAccumulated(s: SimState): number {
  let total = s.drone.accumulated;
  for (const d of s.spares) total += d.accumulated;
  return total;
}

/** Quantity the priced transactions may spend (spec 8.2 rule). */
export function spendable(s: SimState, r: ResourceId): number {
  return qty(s, r);
}

export function pushLog(s: SimState, key: string, value: number): void {
  s.log.push({ tick: s.tick, key, value });
  if (s.log.length > 24) s.log.shift();
}

export function machineById(s: SimState, id: number): MachineState | undefined {
  for (const m of s.machines) if (m.id === id) return m;
  return undefined;
}

/** Milli-tick requirement for a level, from the additive rate curve. */
export function batchMilliFor(blueprint: string, level: number): number {
  const recipe = RECIPES[BLUEPRINTS[blueprint].recipeId];
  return Math.ceil((recipe.cycleTicks * 10000) / (10 + (level - 1)));
}

export function powerFor(blueprint: string): number {
  return RECIPES[BLUEPRINTS[blueprint].recipeId].power;
}

/**
 * The deterministic Manhattan walk between two grid tiles (BELT-001): the ordered
 * tile indices from `fromTile` to `toTile`, closing the row difference first
 * (row-major first, one whole row per step) and then the column difference, so at
 * every corner exactly one next tile is legal and no tie ever needs breaking. A
 * 6-column yard means a step of one row is `cols` tile indices and one column is 1.
 * The list includes both endpoints, so two adjacent tiles run over 2 tiles.
 */
export function manhattanRun(fromTile: number, toTile: number, cols: number): number[] {
  const run = [fromTile];
  if (fromTile === toTile) return run;
  const r0 = Math.floor(fromTile / cols);
  const c0 = fromTile % cols;
  const r1 = Math.floor(toTile / cols);
  const c1 = toTile % cols;
  let tile = fromTile;
  const rowStep = r1 > r0 ? cols : -cols;
  for (let r = r0; r !== r1; r += r1 > r0 ? 1 : -1) {
    tile += rowStep;
    run.push(tile);
  }
  const colStep = c1 > c0 ? 1 : -1;
  for (let c = c0; c !== c1; c += c1 > c0 ? 1 : -1) {
    tile += colStep;
    run.push(tile);
  }
  return run;
}

export { STORE_ENDPOINT };
