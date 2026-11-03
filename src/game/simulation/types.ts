import { BLUEPRINTS, RECIPES, TUNING, type ResourceId, type ItemStack } from "../content/defs";

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
  tray: ItemStack[];
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
}

export type MachineStatus =
  | "idle"
  | "running"
  | "starved"
  | "outputFull"
  | "powerLimited"
  | "paused";

export interface RouteState {
  readonly id: number;
  from: Endpoint;
  to: Endpoint;
  filter: ResourceId | null;
  capacity: number;
  latency: number;
  items: RouteItem[];
  inFlight: number;
}

export interface RouteItem {
  resource: ResourceId;
  qty: number;
  arrive: number;
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
  wreck: { remaining: number; generation: number; pulses: number; nextPulseTick: number };
  drone: DroneState;
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
  };
}

/** Integer store access keeps undefined out of arithmetic. */
export function qty(s: SimState, r: ResourceId): number {
  return s.store[r] ?? 0;
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

export { STORE_ENDPOINT };
