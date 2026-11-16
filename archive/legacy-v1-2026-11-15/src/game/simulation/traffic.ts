/**
 * Road traffic: path-cost arrival ticks, bay/intersection capacity and stuck
 * recovery (issue #141, RW3D T14).
 *
 * GAME_SYSTEMS "Logistics" + TECHNICAL_CONTRACT "Navigation and physical
 * presentation": "Roads declare lane and intersection occupancy; bay slots use
 * leases/reservations with release on every terminal path." "Vehicles follow
 * splines/interpolated path segments visually but economic arrival is
 * tick-based." ACCEPTANCE E05 (travel length, speed, load/unload and bay
 * contention affect measured throughput; decorative vehicles alone fail) and
 * E04 (full destination / deleted road / moved building / recalled carrier
 * preserve cargo and reservations; recover or display the exact blocker).
 *
 * Boundary with #140 logistics (binding for this issue):
 *  - This module is the TRAFFIC authority: path cost, per-truck speed and
 *    load/unload duration, bay + intersection capacity leases, fair queue
 *    grants and bounded retry/backoff. It owns NO cargo. It never imports
 *    logistics.ts (no cycle): logistics imports this and keeps every cargo
 *    transition (load/unload/recall/settle) so the #140 conservation invariant
 *    `amount = atSource + inTransit + delivered + returned` is untouched.
 *  - Routing reuses the read-only #139 API (`findRoadPath`, `roadWalkValid`,
 *    `roadDegree`). A truck rides the same discrete cell walk as a logistics
 *    carrier; traffic only decides HOW FAST it may advance and WHETHER a
 *    bay/intersection slot is free. With the default profile (speed 1, zero
 *    load/unload ticks, unlimited capacity, zero junction surcharge) the
 *    traffic-aware movement reduces EXACTLY to the #140 one-cell-per-tick
 *    behaviour, so legacy ledgers are reproduced tick-for-tick.
 *  - Capacity is reserved, not simulated as rigid bodies: a truck that cannot
 *    enter a full junction or claim a full bay QUEUES (waits in place) with a
 *    typed, inspectable blocker and a fair grant order; it never overlaps another
 *    truck's reserved slot. Leases release on every terminal path.
 *  - Stuck recovery is bounded: a failed route attempt backs off exponentially
 *    up to a cap and stops spinning after `maxRetries`; a topology revision
 *    change always re-attempts immediately and resets the counter, so a later
 *    repair recovers the job. Cargo is never deleted or resized by any of this.
 *
 * Session-only, exactly like WorldState, the road network, road cargo and the
 * logistics ledger: the 2D economy remains the save authority and the cutover
 * (#148 T21) owns persistence. Nothing here reads or writes SAVE_KEY, migration
 * or recovery. Pure integer transitions; no DOM, no wall-clock, no randomness.
 */
import { checksum } from "../persistence/save";
import { cellKey } from "../world/geometry";
import { roadDegree, type RoadNetworkState } from "../world/roadGraph";
import type { Cell } from "../world/types";
import type { CargoHoldReason } from "./roadPaths";

export const TRAFFIC_SCHEMA_VERSION = 1;

/** Base movement-point cost of entering one road cell. */
export const TRAFFIC_CELL_COST = 1;
/** Default truck profile: reproduces #140 one-cell-per-tick, instant load/unload. */
export const DEFAULT_TRUCK_CONFIG: TruckConfig = { speed: 1, loadTicks: 0, unloadTicks: 0 };
/** Default retry policy: bounded exponential backoff, recoverable on topology change. */
export const DEFAULT_MAX_RETRIES = 6;
export const DEFAULT_BASE_BACKOFF = 2;
export const DEFAULT_MAX_BACKOFF = 64;

/**
 * Why a truck is blocked. Typed so the UI can show the exact blocker (E04).
 * Reuses the #139 road reasons (`no-route`, `road-removed`) and adds the two
 * capacity blockers this issue introduces. Logistics' own `destination-full` /
 * `no-carrier` reasons remain on the job; a traffic hold never replaces cargo.
 */
export type TrafficHoldReason =
  | CargoHoldReason
  | { kind: "bay-full"; at: Cell; capacity: number }
  | { kind: "junction-full"; at: Cell; capacity: number };

/** Per-truck movement profile. All integers; speed >= 1, durations >= 0. */
export interface TruckConfig {
  /** Cells (movement points) the truck may spend per tick. */
  speed: number;
  /** Ticks spent loading at the source bay before cargo moves onto the truck. */
  loadTicks: number;
  /** Ticks spent unloading at the destination bay before cargo settles. */
  unloadTicks: number;
}

/** Live movement bookkeeping for one carrier (keyed by carrier id). */
export interface TruckRuntime {
  carrierId: number;
  config: TruckConfig;
  /** Accumulated movement points not yet spent on a cell entry. */
  moveBudget: number;
  /** Ticks left to finish loading; 0 when not loading. */
  loadRemaining: number;
  /** Ticks left to finish unloading; 0 when not unloading. */
  unloadRemaining: number;
  /** Failed route attempts since the last success/topology change (bounded). */
  retryCount: number;
  /** Session tick before which no backoff-driven route retry is made. */
  backoffUntil: number;
  /** Topology revision of the last route attempt (detects a repair). */
  lastAttemptRevision: number;
  /** Exact traffic blocker while held; null otherwise. */
  heldReason: TrafficHoldReason | null;
  /** Active bay lease id while loading/unloading; null otherwise. */
  bayLeaseId: number | null;
  /** Tick the truck began waiting for capacity (fair FIFO grant order). */
  queuedSince: number;
}

/** One exclusive bay slot lease. Released on every terminal path. */
export interface BayLease {
  id: number;
  carrierId: number;
  jobId: number;
  cell: Cell;
}

export interface TrafficState {
  schemaVersion: number;
  /** Session tick counter, advanced by the logistics tick that owns traffic. */
  tick: number;
  defaultTruck: TruckConfig;
  /** Per-carrier runtime; created lazily when a carrier first moves. */
  trucks: Record<number, TruckRuntime>;
  /** cellKey -> bay slot capacity. Absent means unlimited (legacy default). */
  bayCapacity: Record<string, number>;
  /** Active bay leases only. */
  bayLeases: BayLease[];
  /** Max trucks occupying one junction cell; null means unlimited (default). */
  junctionCapacity: number | null;
  /** Extra movement-point cost of entering a junction cell (default 0). */
  junctionCost: number;
  nextLeaseId: number;
  maxRetries: number;
  baseBackoff: number;
  maxBackoff: number;
}

export function createTraffic(): TrafficState {
  return {
    schemaVersion: TRAFFIC_SCHEMA_VERSION,
    tick: 0,
    defaultTruck: { ...DEFAULT_TRUCK_CONFIG },
    trucks: {},
    bayCapacity: {},
    bayLeases: [],
    junctionCapacity: null,
    junctionCost: 0,
    nextLeaseId: 1,
    maxRetries: DEFAULT_MAX_RETRIES,
    baseBackoff: DEFAULT_BASE_BACKOFF,
    maxBackoff: DEFAULT_MAX_BACKOFF,
  };
}

function isNonNegativeInteger(v: number): boolean {
  return Number.isInteger(v) && v >= 0;
}

/** Set the profile new trucks inherit. Returns false on invalid input. */
export function setDefaultTruck(traffic: TrafficState, config: Partial<TruckConfig>): boolean {
  const next: TruckConfig = { ...traffic.defaultTruck, ...config };
  if (!Number.isInteger(next.speed) || next.speed < 1) return false;
  if (!isNonNegativeInteger(next.loadTicks) || !isNonNegativeInteger(next.unloadTicks)) return false;
  traffic.defaultTruck = next;
  return true;
}

/** Override one carrier's profile (e.g. a faster truck). False on invalid input. */
export function configureTruck(traffic: TrafficState, carrierId: number, config: Partial<TruckConfig>): boolean {
  if (!Number.isInteger(carrierId) || carrierId <= 0) return false;
  const runtime = ensureTruck(traffic, carrierId);
  const next: TruckConfig = { ...runtime.config, ...config };
  if (!Number.isInteger(next.speed) || next.speed < 1) return false;
  if (!isNonNegativeInteger(next.loadTicks) || !isNonNegativeInteger(next.unloadTicks)) return false;
  runtime.config = next;
  return true;
}

/** Reserve `capacity` simultaneous load/unload slots at a bay approach cell. */
export function setBayCapacity(traffic: TrafficState, cell: Cell, capacity: number): boolean {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return false;
  if (!Number.isInteger(capacity) || capacity < 1) return false;
  traffic.bayCapacity[cellKey(cell)] = capacity;
  return true;
}

/** Limit trucks per junction cell; null restores unlimited. False on invalid. */
export function setJunctionCapacity(traffic: TrafficState, capacity: number | null): boolean {
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return false;
  traffic.junctionCapacity = capacity;
  return true;
}

/** Extra movement-point cost of entering a junction (path-cost dimension). */
export function setJunctionCost(traffic: TrafficState, cost: number): boolean {
  if (!isNonNegativeInteger(cost)) return false;
  traffic.junctionCost = cost;
  return true;
}

/** Tune the bounded retry/backoff policy. False on invalid input. */
export function setRetryPolicy(
  traffic: TrafficState,
  policy: { maxRetries?: number; baseBackoff?: number; maxBackoff?: number },
): boolean {
  const maxRetries = policy.maxRetries ?? traffic.maxRetries;
  const baseBackoff = policy.baseBackoff ?? traffic.baseBackoff;
  const maxBackoff = policy.maxBackoff ?? traffic.maxBackoff;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) return false;
  if (!Number.isInteger(baseBackoff) || baseBackoff < 1) return false;
  if (!Number.isInteger(maxBackoff) || maxBackoff < baseBackoff) return false;
  traffic.maxRetries = maxRetries;
  traffic.baseBackoff = baseBackoff;
  traffic.maxBackoff = maxBackoff;
  return true;
}

/** Lazily create (or fetch) a carrier's runtime, inheriting the default profile. */
export function ensureTruck(traffic: TrafficState, carrierId: number): TruckRuntime {
  const existing = traffic.trucks[carrierId];
  if (existing !== undefined) return existing;
  const runtime: TruckRuntime = {
    carrierId,
    config: { ...traffic.defaultTruck },
    moveBudget: 0,
    loadRemaining: 0,
    unloadRemaining: 0,
    retryCount: 0,
    backoffUntil: 0,
    lastAttemptRevision: -1,
    heldReason: null,
    bayLeaseId: null,
    queuedSince: 0,
  };
  traffic.trucks[carrierId] = runtime;
  return runtime;
}

/** A junction is a degree >= 3 road cell (roadGraph derived-node definition). */
export function isJunction(net: RoadNetworkState, cell: Cell): boolean {
  return roadDegree(net, cell) >= 3;
}

/** Movement-point cost of entering one cell: base + junction surcharge. */
export function cellEntryCost(traffic: TrafficState, net: RoadNetworkState, cell: Cell): number {
  return TRAFFIC_CELL_COST + (isJunction(net, cell) ? traffic.junctionCost : 0);
}

/**
 * Total movement-point cost of a walk (sum of entry costs, excluding the start
 * cell which the truck already occupies). Deterministic; a longer or more
 * junction-heavy walk costs more, so it arrives later (E05 path cost).
 */
export function roadPathCost(traffic: TrafficState, net: RoadNetworkState, walk: readonly Cell[]): number {
  let cost = 0;
  for (let i = 1; i < walk.length; i += 1) cost += cellEntryCost(traffic, net, walk[i]);
  return cost;
}

/**
 * Ticks to traverse a cost at a speed: ceil(cost / speed), at least one tick for
 * any positive cost (a truck never teleports). Zero cost yields zero ticks.
 */
export function travelTicks(cost: number, speed: number): number {
  if (cost <= 0) return 0;
  return Math.max(1, Math.ceil(cost / Math.max(1, speed)));
}

/** Bay slot capacity at a cell; Infinity when unconfigured (legacy default). */
export function bayCapacityAt(traffic: TrafficState, cell: Cell): number {
  return traffic.bayCapacity[cellKey(cell)] ?? Number.POSITIVE_INFINITY;
}

/** Active bay leases at a cell. */
export function bayLeasesAt(traffic: TrafficState, cell: Cell): BayLease[] {
  const key = cellKey(cell);
  return traffic.bayLeases.filter((lease) => cellKey(lease.cell) === key);
}

/** True when a bay slot is free for `carrierId` (its own lease never blocks it). */
export function bayFree(traffic: TrafficState, cell: Cell, carrierId: number): boolean {
  const leases = bayLeasesAt(traffic, cell);
  if (leases.some((lease) => lease.carrierId === carrierId)) return true;
  return leases.length < bayCapacityAt(traffic, cell);
}

/** Claim an exclusive bay slot; null when full. Idempotent per carrier. */
export function reserveBay(traffic: TrafficState, cell: Cell, carrierId: number, jobId: number): BayLease | null {
  const existing = traffic.bayLeases.find((lease) => lease.carrierId === carrierId);
  if (existing !== undefined) return existing;
  if (!bayFree(traffic, cell, carrierId)) return null;
  const lease: BayLease = { id: traffic.nextLeaseId, carrierId, jobId, cell: { x: cell.x, y: cell.y } };
  traffic.nextLeaseId += 1;
  traffic.bayLeases.push(lease);
  return lease;
}

/** Release a carrier's bay lease (every terminal path calls this). */
export function releaseBay(traffic: TrafficState, carrierId: number): void {
  traffic.bayLeases = traffic.bayLeases.filter((lease) => lease.carrierId !== carrierId);
  const runtime = traffic.trucks[carrierId];
  if (runtime !== undefined) runtime.bayLeaseId = null;
}

/** Release every bay lease held by a job (cancel/complete safety net). */
export function releaseJobBays(traffic: TrafficState, jobId: number): void {
  const carriers = traffic.bayLeases.filter((lease) => lease.jobId === jobId).map((lease) => lease.carrierId);
  traffic.bayLeases = traffic.bayLeases.filter((lease) => lease.jobId !== jobId);
  for (const carrierId of carriers) {
    const runtime = traffic.trucks[carrierId];
    if (runtime !== undefined) runtime.bayLeaseId = null;
  }
}

/**
 * True when a truck may enter a junction cell. `occupied` maps cellKey -> count
 * of OTHER carriers currently on that cell (a multiset, so capacity > 1 is
 * counted exactly); a junction at capacity queues the truck (no pileup).
 * Non-junction cells and unlimited junctions always pass. The moving truck is
 * excluded from the map, so its own current cell never counts against it.
 */
export function junctionFree(
  traffic: TrafficState,
  net: RoadNetworkState,
  cell: Cell,
  occupied: ReadonlyMap<string, number>,
): boolean {
  if (traffic.junctionCapacity === null) return true;
  if (!isJunction(net, cell)) return true;
  const count = occupied.get(cellKey(cell)) ?? 0;
  return count < traffic.junctionCapacity;
}

/** Bounded exponential backoff: base * 2^retryCount, capped at maxBackoff. */
export function backoffTicks(traffic: TrafficState, retryCount: number): number {
  const exponent = Math.max(0, Math.min(retryCount, 30));
  const raw = traffic.baseBackoff * 2 ** exponent;
  return Math.min(traffic.maxBackoff, raw);
}

/**
 * Whether a held truck should re-attempt routing this tick. A topology revision
 * change ALWAYS re-attempts (a repair recovers the job) and resets the counter;
 * otherwise backoff gates retries and, once `maxRetries` is exhausted, the truck
 * stops spinning until the topology changes (bounded retry, E04).
 */
export function retryDue(traffic: TrafficState, runtime: TruckRuntime, tick: number, revision: number): boolean {
  if (revision !== runtime.lastAttemptRevision) return true;
  if (runtime.retryCount >= traffic.maxRetries) return false;
  return tick >= runtime.backoffUntil;
}

/** Record a failed route attempt: bounded counter + exponential backoff. */
export function recordRetry(traffic: TrafficState, runtime: TruckRuntime, tick: number, revision: number): void {
  runtime.retryCount = Math.min(traffic.maxRetries, runtime.retryCount + 1);
  runtime.lastAttemptRevision = revision;
  runtime.backoffUntil = tick + backoffTicks(traffic, runtime.retryCount);
}

/** Clear retry state after a successful route (or a topology repair). */
export function clearRetry(runtime: TruckRuntime, revision: number): void {
  runtime.retryCount = 0;
  runtime.backoffUntil = 0;
  runtime.lastAttemptRevision = revision;
  runtime.heldReason = null;
}

/**
 * Fair grant order for trucks waiting on capacity: earliest waiter first, ties
 * by carrier id (deterministic, no starvation). Logistics uses this to grant
 * bay/junction slots in a stable order independent of job iteration order.
 */
export function queueOrder(runtimes: readonly TruckRuntime[]): TruckRuntime[] {
  return [...runtimes].sort((a, b) => a.queuedSince - b.queuedSince || a.carrierId - b.carrierId);
}

/** Deterministic fingerprint for byte-identity assertions in tests. */
export function trafficFingerprint(traffic: TrafficState): string {
  const truckIds = Object.keys(traffic.trucks).map(Number).sort((a, b) => a - b);
  const bayKeys = Object.keys(traffic.bayCapacity).sort();
  const canonical = {
    schemaVersion: traffic.schemaVersion,
    tick: traffic.tick,
    defaultTruck: traffic.defaultTruck,
    trucks: truckIds.map((id) => traffic.trucks[id]),
    bayCapacity: bayKeys.map((key) => [key, traffic.bayCapacity[key]]),
    bayLeases: [...traffic.bayLeases].sort((a, b) => a.id - b.id),
    junctionCapacity: traffic.junctionCapacity,
    junctionCost: traffic.junctionCost,
    nextLeaseId: traffic.nextLeaseId,
    maxRetries: traffic.maxRetries,
    baseBackoff: traffic.baseBackoff,
    maxBackoff: traffic.maxBackoff,
  };
  return checksum(JSON.stringify(canonical));
}