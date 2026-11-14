/**
 * Conserved logistics jobs and reservations (issue #140, RW3D T13).
 *
 * GAME_SYSTEMS "Logistics": request -> reserve source stock and destination
 * room -> assign a compatible carrier -> travel to source -> load -> travel ->
 * unload -> settle -> release reservations. Reservation IDs prevent double
 * assignment; cargo cannot exist simultaneously at source and on the carrier;
 * a partial unload retains the remainder; a blocked job reports its exact
 * reason; deleting a route cancels only unstarted jobs and safely recalls
 * active cargo. ACCEPTANCE E01 (conservation), E03 (last pallet + fairness),
 * E04 (full destination / deleted road preserve cargo, recover or display the
 * exact blocker).
 *
 * Binding rules implemented here:
 *  - CONSERVATION. Every unit lives in exactly one container: a building's
 *    free stock, a job's `atSource` (reserved, not yet loaded) or a job's
 *    `inTransit` (on the carrier). Delivered units land in the destination's
 *    free stock; recalled units land back in the source's free stock.
 *    `amount = atSource + inTransit + delivered + returned` always holds, and
 *    `logisticsTotals` (free stock + atSource + inTransit over every job) is
 *    invariant across every lifecycle command and tick. Cargo is never created
 *    or destroyed by create/cancel/dispatch/load/unload/recall/topology change;
 *    `seedStock` is the single documented entry boundary (session fixtures).
 *  - NO DOUBLE-BOOKING. Source stock is deducted into the job at reservation
 *    time, so two jobs racing for the last pallet resolve to exactly one
 *    success (E03). A carrier serves one job at a time (`carrier.jobId`).
 *    Destination room is reserved exclusively against other jobs' outstanding
 *    intent (`amount - delivered`); external deposits (`seedStock`) can still
 *    fill the destination mid-transit, which is the E04 full-storage case: the
 *    job partial-unloads what fits and holds the remainder in transit.
 *  - DETERMINISM + FAIRNESS. Dispatch order is (priority desc, createdTick asc,
 *    id asc) — oldest-first at equal priority, so no job starves while carriers
 *    free up. Carrier choice is (distance to source asc, id asc). Unreachable
 *    jobs back off: route resolution is cached per (topology revision, carrier)
 *    and only re-attempted when the topology changes or a different carrier is
 *    candidate. All arithmetic is integer; no DOM, no wall-clock, no randomness.
 *  - TOPOLOGY. Paths are routed with the read-only roadPaths.ts API
 *    (`findRoadPath`) and stamped with `RoadNetworkState.revision`. A stale
 *    stamp revalidates the remaining walk; a cut re-routes from the carrier's
 *    current cell or holds with the exact typed blocker (`road-removed` under
 *    the carrier, `no-route` otherwise). Held jobs retry from their leg origin
 *    on every topology revision, mirroring roadPaths held-batch semantics, so
 *    a later repair recovers them. Cargo amounts are never touched by any of
 *    this. Movement is one cell per tick, like `tickRoadCargo`.
 *
 * Session-only, exactly like WorldState, the road network and road cargo: the
 * 2D economy remains the save authority and the cutover (#148 T21) owns
 * persistence. Nothing here reads or writes SAVE_KEY, migration or recovery.
 * Building ids reference the session world; `cell` is the road approach cell
 * (the store/UI resolves bay sockets via roadSockets in a later issue).
 */
import { RESOURCES, type ResourceId } from "../content/defs";
import { checksum } from "../persistence/save";
import { sameCell } from "../world/geometry";
import { isRoadCell, roadWalkValid, type RoadNetworkState } from "../world/roadGraph";
import type { Cell } from "../world/types";
import { findRoadPath, type CargoHoldReason } from "./roadPaths";

export const LOGISTICS_SCHEMA_VERSION = 1;

export type JobStatus = "pending" | "active" | "partial" | "cancelled" | "complete";

/**
 * Transport detail behind the coarse status. `waiting` = pending dispatch;
 * `to-source` = carrier travelling to load; `to-dest` = loaded, travelling or
 * unloading; `returning` = cancelled with loaded cargo, recalling to source;
 * `done` = terminal (complete or cancelled).
 */
export type JobPhase = "waiting" | "to-source" | "to-dest" | "returning" | "done";

/** Why a job is blocked. Typed so the UI can show the exact blocker (E04). */
export type LogisticsHoldReason =
  | CargoHoldReason
  | { kind: "destination-full"; buildingId: number; room: number }
  | { kind: "no-carrier"; needCapacity: number };

export interface CargoJob {
  id: number;
  /** Caller-owned command id; creation is idempotent by it (mirrors dispatch). */
  commandId: string;
  sourceBuildingId: number;
  destBuildingId: number;
  /** Approach cells captured at creation; retargeted if a building re-registers. */
  sourceCell: Cell;
  destCell: Cell;
  carrierId: number | null;
  cargoType: ResourceId;
  /** Original requested amount; immutable. amount = atSource + inTransit + delivered + returned. */
  amount: number;
  /** Reserved units still physically at the source (deducted from free stock). */
  atSource: number;
  /** Units on the carrier. */
  inTransit: number;
  /** Cumulative units unloaded into the destination's free stock. */
  delivered: number;
  /** Cumulative units returned to the source's free stock by cancellation. */
  returned: number;
  status: JobStatus;
  phase: JobPhase;
  /** Player dispatch priority; higher goes first. Default 0. */
  priority: number;
  /** Tick the job (and its source/destination reservations) was created. */
  createdTick: number;
  /** Tick the source stock was reserved (equals createdTick). */
  reservedAt: number;
  /** Current walk, inclusive of both endpoints; null while held. */
  path: Cell[] | null;
  /** Index into path of the carrier's current cell. */
  progress: number;
  /** Topology revision the walk was routed against. */
  pathRevision: number;
  /** Origin of the current leg; held jobs retry from here (roadPaths parity). */
  legFrom: Cell;
  heldReason: LogisticsHoldReason | null;
  /** Dispatch backoff: last topology revision a route attempt was made at. */
  lastAttemptRevision: number;
  /** Cached route resolution, keyed by (revision, carrier); null once assigned. */
  routeCache: { revision: number; carrierId: number; path: Cell[] | null } | null;
}

export type ReservationKind = "source" | "destination" | "carrier";

/**
 * One reservation per (job, kind) with a globally unique id. Source and
 * destination reservations exist from creation; the carrier reservation from
 * dispatch. All are released exactly once, when the job reaches a terminal
 * status (complete, or cancelled with cargo settled back at the source).
 */
export interface Reservation {
  id: number;
  jobId: number;
  kind: ReservationKind;
  /** Set for source/destination reservations. */
  buildingId: number | null;
  /** Set for carrier reservations. */
  carrierId: number | null;
  resource: ResourceId;
  /** Reserved units (source stock / destination room intent / carrier payload). */
  amount: number;
  createdTick: number;
}

export interface Carrier {
  id: number;
  /** Max units per trip; a job dispatches only onto a carrier that fits it whole. */
  capacity: number;
  cell: Cell;
  /** The one job this carrier serves; null when idle. */
  jobId: number | null;
}

export interface LogisticsBuilding {
  id: number;
  /** Road approach cell used for loading/unloading. */
  cell: Cell;
  /** Total storage capacity in units, across all resources. */
  capacity: number;
}

export interface LogisticsState {
  schemaVersion: number;
  /** Session tick counter, advanced by tickLogistics (not the 2D sim tick). */
  tick: number;
  nextJobId: number;
  nextReservationId: number;
  nextCarrierId: number;
  jobs: CargoJob[];
  /** Active reservations only; terminal jobs release theirs. */
  reservations: Reservation[];
  carriers: Carrier[];
  buildings: Record<number, LogisticsBuilding>;
  /** Free (unreserved) stock per building. Delivered cargo lands here. */
  stocks: Record<number, Partial<Record<ResourceId, number>>>;
  /** Idempotent creation: command id -> job id. */
  seenCommands: Record<string, number>;
}

export interface LogisticsJobRequest {
  id: string;
  sourceBuildingId: number;
  destBuildingId: number;
  cargoType: ResourceId;
  amount: number;
  priority?: number;
}

/** Stable, typed rejection reasons. Tags are API; payloads carry recovery data. */
export type LogisticsRejection =
  | { reason: "invalid-amount"; amount: number }
  | { reason: "invalid-resource"; resource: string }
  | { reason: "invalid-building"; buildingId: number }
  | { reason: "invalid-priority"; priority: number }
  | { reason: "unknown-building"; buildingId: number }
  | { reason: "same-building" }
  | { reason: "same-location" }
  | { reason: "insufficient-stock"; resource: ResourceId; need: number; have: number }
  | { reason: "insufficient-room"; buildingId: number; need: number; have: number }
  | { reason: "read-only" };

export type CreateJobResult =
  | { ok: true; job: CargoJob; replayed: boolean }
  | { ok: false; reason: LogisticsRejection };

export type CancelJobResult =
  | { ok: true; job: CargoJob }
  | { ok: false; reason: { reason: "unknown-job" } | { reason: "read-only" } };

export function createLogistics(): LogisticsState {
  return {
    schemaVersion: LOGISTICS_SCHEMA_VERSION,
    tick: 0,
    nextJobId: 1,
    nextReservationId: 1,
    nextCarrierId: 1,
    jobs: [],
    reservations: [],
    carriers: [],
    buildings: {},
    stocks: {},
    seenCommands: {},
  };
}

/**
 * Register (or re-register) a building's approach cell and storage capacity.
 * Re-registering retargets non-terminal jobs: their captured cells update and
 * any stamped path is forced to revalidate on the next tick (E04 moved
 * building). Existing stock is preserved. Returns false on invalid input.
 */
export function registerBuilding(state: LogisticsState, site: LogisticsBuilding): boolean {
  if (
    !Number.isInteger(site.id) ||
    site.id <= 0 ||
    !Number.isInteger(site.cell.x) ||
    !Number.isInteger(site.cell.y) ||
    !Number.isInteger(site.capacity) ||
    site.capacity < 0
  ) {
    return false;
  }
  const previous = state.buildings[site.id];
  state.buildings[site.id] = { id: site.id, cell: { x: site.cell.x, y: site.cell.y }, capacity: site.capacity };
  if (previous !== undefined && !sameCell(previous.cell, site.cell)) {
    for (const job of state.jobs) {
      if (job.status === "complete" || job.status === "cancelled") continue;
      if (job.sourceBuildingId === site.id) job.sourceCell = { x: site.cell.x, y: site.cell.y };
      if (job.destBuildingId === site.id) job.destCell = { x: site.cell.x, y: site.cell.y };
      job.pathRevision = -1; // force revalidation against the new target
      job.lastAttemptRevision = -1;
      job.routeCache = null;
    }
  }
  return true;
}

/**
 * The single cargo entry boundary (session fixtures / later economy cutover):
 * adds free stock to a building. Every other transition conserves totals.
 */
export function seedStock(
  state: LogisticsState,
  buildingId: number,
  resource: ResourceId,
  qty: number,
): boolean {
  if (
    state.buildings[buildingId] === undefined ||
    !Number.isInteger(qty) ||
    qty <= 0 ||
    !RESOURCES.includes(resource)
  ) {
    return false;
  }
  const stock = state.stocks[buildingId] ?? (state.stocks[buildingId] = {});
  stock[resource] = (stock[resource] ?? 0) + qty;
  return true;
}

export function registerCarrier(
  state: LogisticsState,
  request: { capacity: number; cell: Cell },
): Carrier | null {
  if (
    !Number.isInteger(request.capacity) ||
    request.capacity <= 0 ||
    !Number.isInteger(request.cell.x) ||
    !Number.isInteger(request.cell.y)
  ) {
    return null;
  }
  const carrier: Carrier = {
    id: state.nextCarrierId,
    capacity: request.capacity,
    cell: { x: request.cell.x, y: request.cell.y },
    jobId: null,
  };
  state.nextCarrierId += 1;
  state.carriers.push(carrier);
  return carrier;
}

function stockOf(state: LogisticsState, buildingId: number, resource: ResourceId): number {
  return state.stocks[buildingId]?.[resource] ?? 0;
}

function addStock(state: LogisticsState, buildingId: number, resource: ResourceId, qty: number): void {
  if (qty <= 0) return;
  const stock = state.stocks[buildingId] ?? (state.stocks[buildingId] = {});
  stock[resource] = (stock[resource] ?? 0) + qty;
}

/** Total free units stored at a building, across resources. */
export function buildingUnits(state: LogisticsState, buildingId: number): number {
  const stock = state.stocks[buildingId];
  if (stock === undefined) return 0;
  let total = 0;
  for (const resource of RESOURCES) total += stock[resource] ?? 0;
  return total;
}

/** Physical room left at a building (can go negative after external over-fill). */
function physicalRoom(state: LogisticsState, buildingId: number): number {
  return (state.buildings[buildingId]?.capacity ?? 0) - buildingUnits(state, buildingId);
}

/** Destination room already promised to other jobs' outstanding deliveries. */
function reservedDestRemaining(state: LogisticsState, buildingId: number): number {
  let total = 0;
  for (const job of state.jobs) {
    if (job.destBuildingId !== buildingId) continue;
    if (job.status === "complete" || job.status === "cancelled") continue;
    total += job.amount - job.delivered;
  }
  return total;
}

function makeReservation(
  state: LogisticsState,
  job: CargoJob,
  kind: ReservationKind,
  carrierId: number | null,
): Reservation {
  const reservation: Reservation = {
    id: state.nextReservationId,
    jobId: job.id,
    kind,
    buildingId: kind === "carrier" ? null : kind === "source" ? job.sourceBuildingId : job.destBuildingId,
    carrierId,
    resource: job.cargoType,
    amount: job.amount,
    createdTick: state.tick,
  };
  state.nextReservationId += 1;
  state.reservations.push(reservation);
  return reservation;
}

/**
 * Create a job and reserve source stock + destination room immediately (the
 * carrier is reserved at dispatch). Idempotent by request.id: a replay returns
 * the original job without reserving twice. A rejection changes NOTHING.
 */
export function createJob(state: LogisticsState, request: LogisticsJobRequest): CreateJobResult {
  const seen = state.seenCommands[request.id];
  if (seen !== undefined) {
    const job = state.jobs.find((candidate) => candidate.id === seen);
    if (job !== undefined) return { ok: true, job, replayed: true };
  }
  if (!Number.isInteger(request.amount) || request.amount <= 0) {
    return { ok: false, reason: { reason: "invalid-amount", amount: request.amount } };
  }
  if (!RESOURCES.includes(request.cargoType)) {
    return { ok: false, reason: { reason: "invalid-resource", resource: String(request.cargoType) } };
  }
  if (!Number.isInteger(request.sourceBuildingId) || request.sourceBuildingId <= 0) {
    return { ok: false, reason: { reason: "invalid-building", buildingId: request.sourceBuildingId } };
  }
  if (!Number.isInteger(request.destBuildingId) || request.destBuildingId <= 0) {
    return { ok: false, reason: { reason: "invalid-building", buildingId: request.destBuildingId } };
  }
  const priority = request.priority ?? 0;
  if (!Number.isInteger(priority)) {
    return { ok: false, reason: { reason: "invalid-priority", priority } };
  }
  if (request.sourceBuildingId === request.destBuildingId) {
    return { ok: false, reason: { reason: "same-building" } };
  }
  const source = state.buildings[request.sourceBuildingId];
  const dest = state.buildings[request.destBuildingId];
  if (source === undefined) {
    return { ok: false, reason: { reason: "unknown-building", buildingId: request.sourceBuildingId } };
  }
  if (dest === undefined) {
    return { ok: false, reason: { reason: "unknown-building", buildingId: request.destBuildingId } };
  }
  if (sameCell(source.cell, dest.cell)) {
    return { ok: false, reason: { reason: "same-location" } };
  }
  const have = stockOf(state, request.sourceBuildingId, request.cargoType);
  if (have < request.amount) {
    return {
      ok: false,
      reason: { reason: "insufficient-stock", resource: request.cargoType, need: request.amount, have },
    };
  }
  const room = physicalRoom(state, request.destBuildingId) - reservedDestRemaining(state, request.destBuildingId);
  if (room < request.amount) {
    return {
      ok: false,
      reason: { reason: "insufficient-room", buildingId: request.destBuildingId, need: request.amount, have: room },
    };
  }
  const job: CargoJob = {
    id: state.nextJobId,
    commandId: request.id,
    sourceBuildingId: request.sourceBuildingId,
    destBuildingId: request.destBuildingId,
    sourceCell: { x: source.cell.x, y: source.cell.y },
    destCell: { x: dest.cell.x, y: dest.cell.y },
    carrierId: null,
    cargoType: request.cargoType,
    amount: request.amount,
    atSource: request.amount,
    inTransit: 0,
    delivered: 0,
    returned: 0,
    status: "pending",
    phase: "waiting",
    priority,
    createdTick: state.tick,
    reservedAt: state.tick,
    path: null,
    progress: 0,
    pathRevision: -1,
    legFrom: { x: source.cell.x, y: source.cell.y },
    heldReason: null,
    lastAttemptRevision: -1,
    routeCache: null,
  };
  state.nextJobId += 1;
  // Reserve: deduct source free stock into the job (no double-booking, E03)
  // and record the exclusive destination-room intent.
  const stock = state.stocks[request.sourceBuildingId] ?? (state.stocks[request.sourceBuildingId] = {});
  stock[request.cargoType] = have - request.amount;
  state.jobs.push(job);
  makeReservation(state, job, "source", null);
  makeReservation(state, job, "destination", null);
  state.seenCommands[request.id] = job.id;
  return { ok: true, job, replayed: false };
}

function carrierById(state: LogisticsState, carrierId: number | null): Carrier | null {
  if (carrierId === null) return null;
  return state.carriers.find((carrier) => carrier.id === carrierId) ?? null;
}

/** Release every reservation of a terminal job and free its carrier. */
function finish(
  state: LogisticsState,
  job: CargoJob,
  carrier: Carrier | null,
  status: "complete" | "cancelled",
): void {
  job.status = status;
  job.phase = "done";
  job.path = null;
  job.progress = 0;
  job.heldReason = null;
  job.routeCache = null;
  state.reservations = state.reservations.filter((reservation) => reservation.jobId !== job.id);
  if (carrier !== null) carrier.jobId = null;
}

/**
 * Cancel a job. Unloaded cargo (still reserved at the source) returns to free
 * stock immediately — it never left. Loaded cargo is safely recalled: the
 * carrier walks back to the source and the units return on arrival (no
 * teleporting). A cut route holds the recall with the exact blocker; cargo is
 * conserved in transit until the road recovers. Idempotent on terminal jobs.
 */
export function cancelJob(state: LogisticsState, net: RoadNetworkState, jobId: number): CancelJobResult {
  const job = state.jobs.find((candidate) => candidate.id === jobId);
  if (job === undefined) return { ok: false, reason: { reason: "unknown-job" } };
  if (job.status === "complete" || job.status === "cancelled") return { ok: true, job };
  const carrier = carrierById(state, job.carrierId);
  if (job.inTransit > 0 && carrier !== null) {
    job.phase = "returning";
    job.status = "active";
    job.legFrom = { x: carrier.cell.x, y: carrier.cell.y };
    const walk = findRoadPath(net, carrier.cell, job.sourceCell);
    if (walk !== null) {
      job.path = walk;
      job.progress = 0;
      job.pathRevision = net.revision;
      job.heldReason = null;
    } else {
      job.path = null;
      job.progress = 0;
      job.heldReason = !isRoadCell(net, carrier.cell)
        ? { kind: "road-removed", at: { x: carrier.cell.x, y: carrier.cell.y } }
        : { kind: "no-route", from: { x: carrier.cell.x, y: carrier.cell.y }, to: { ...job.sourceCell } };
      job.lastAttemptRevision = net.revision;
    }
    return { ok: true, job };
  }
  // Not loaded: the reserved units never left the source.
  addStock(state, job.sourceBuildingId, job.cargoType, job.atSource);
  job.returned += job.atSource;
  job.atSource = 0;
  finish(state, job, carrier, "cancelled");
  return { ok: true, job };
}

function phaseTarget(job: CargoJob): Cell {
  return job.phase === "to-dest" ? job.destCell : job.sourceCell;
}

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Nearest idle carrier that fits the whole job; ties by id (deterministic). */
function pickCarrier(state: LogisticsState, job: CargoJob): Carrier | null {
  const idle = state.carriers.filter(
    (carrier) => carrier.jobId === null && carrier.capacity >= job.amount,
  );
  idle.sort(
    (a, b) => manhattan(a.cell, job.sourceCell) - manhattan(b.cell, job.sourceCell) || a.id - b.id,
  );
  return idle[0] ?? null;
}

/** Stamp a fresh leg, or hold with the exact no-route blocker (E04). */
function startLeg(net: RoadNetworkState, job: CargoJob, walk: Cell[] | null, target: Cell): void {
  if (walk !== null) {
    job.path = walk;
    job.progress = 0;
    job.pathRevision = net.revision;
    job.heldReason = null;
    return;
  }
  job.path = null;
  job.progress = 0;
  job.heldReason = { kind: "no-route", from: { ...job.legFrom }, to: { ...target } };
  job.lastAttemptRevision = net.revision;
}

/** Unload what fits; retain the remainder in transit (partial) or settle. */
function attemptUnload(state: LogisticsState, job: CargoJob, carrier: Carrier): void {
  const room = physicalRoom(state, job.destBuildingId);
  const deliver = Math.min(job.inTransit, Math.max(0, room));
  if (deliver > 0) {
    addStock(state, job.destBuildingId, job.cargoType, deliver);
    job.inTransit -= deliver;
    job.delivered += deliver;
  }
  if (job.inTransit === 0) {
    finish(state, job, carrier, "complete");
    return;
  }
  job.status = "partial";
  job.heldReason = {
    kind: "destination-full",
    buildingId: job.destBuildingId,
    room: Math.max(0, physicalRoom(state, job.destBuildingId)),
  };
}

function arrive(state: LogisticsState, net: RoadNetworkState, job: CargoJob, carrier: Carrier): void {
  if (job.phase === "to-source") {
    // Load: the reserved units move from source container onto the carrier.
    job.inTransit += job.atSource;
    job.atSource = 0;
    job.phase = "to-dest";
    job.legFrom = { x: job.sourceCell.x, y: job.sourceCell.y };
    startLeg(net, job, findRoadPath(net, job.sourceCell, job.destCell), job.destCell);
    return;
  }
  if (job.phase === "to-dest") {
    attemptUnload(state, job, carrier);
    return;
  }
  if (job.phase === "returning") {
    // Recall arrival: the cargo returns to source free stock, conserved.
    addStock(state, job.sourceBuildingId, job.cargoType, job.inTransit);
    job.returned += job.inTransit;
    job.inTransit = 0;
    finish(state, job, carrier, "cancelled");
  }
}

/**
 * Revalidate a stamped path against the live topology (roadPaths semantics):
 * a still-valid remaining walk is re-stamped; otherwise re-route from the
 * carrier's current cell, or hold with the exact blocker when the cut landed
 * under the carrier (`road-removed`) or no walk exists (`no-route`).
 */
function revalidate(net: RoadNetworkState, job: CargoJob, carrier: Carrier): void {
  const target = phaseTarget(job);
  const path = job.path as Cell[];
  const remaining = path.slice(job.progress);
  const at = carrier.cell;
  if (
    isRoadCell(net, at) &&
    roadWalkValid(net, remaining) &&
    sameCell(remaining[remaining.length - 1], target)
  ) {
    job.pathRevision = net.revision;
    return;
  }
  const walk = isRoadCell(net, at) ? findRoadPath(net, at, target) : null;
  if (walk !== null) {
    job.path = walk;
    job.progress = 0;
    job.pathRevision = net.revision;
    job.heldReason = null;
    return;
  }
  job.heldReason = !isRoadCell(net, at)
    ? { kind: "road-removed", at: { x: at.x, y: at.y } }
    : { kind: "no-route", from: { x: at.x, y: at.y }, to: { ...target } };
  job.path = null;
  job.progress = 0;
  job.lastAttemptRevision = net.revision;
  // legFrom stays at the leg origin: held jobs retry from there (roadPaths parity).
}

function tickJob(state: LogisticsState, net: RoadNetworkState, job: CargoJob): void {
  if (job.status !== "active" && job.status !== "partial") return;
  const carrier = carrierById(state, job.carrierId);
  if (carrier === null) return;
  // Arrived at the destination: unload (possibly partially) every tick until
  // the remainder fits. Topology changes never disturb an unloading carrier.
  if (job.phase === "to-dest" && job.path !== null && job.progress >= job.path.length - 1) {
    attemptUnload(state, job, carrier);
    return;
  }
  if (job.path !== null && job.pathRevision !== net.revision) {
    revalidate(net, job, carrier);
  }
  if (job.path === null) {
    // Held: back off, retry from the leg origin on each topology revision.
    if (job.lastAttemptRevision !== net.revision) {
      job.lastAttemptRevision = net.revision;
      const target = phaseTarget(job);
      const walk = findRoadPath(net, job.legFrom, target);
      if (walk !== null) {
        job.path = walk;
        job.progress = 0;
        job.pathRevision = net.revision;
        job.heldReason = null;
        carrier.cell = { x: walk[0].x, y: walk[0].y };
      } else {
        job.heldReason = { kind: "no-route", from: { ...job.legFrom }, to: { ...target } };
      }
    }
    if (job.path === null) return;
  }
  const last = (job.path as Cell[]).length - 1;
  job.progress = Math.min(last, job.progress + 1);
  carrier.cell = { x: (job.path as Cell[])[job.progress].x, y: (job.path as Cell[])[job.progress].y };
  if (job.progress >= last) arrive(state, net, job, carrier);
}

/**
 * Dispatch pass: oldest-first at equal priority (fairness — a job never starves
 * while carriers free up), nearest compatible carrier, deterministic ties by
 * id. Route resolution backs off per (topology revision, carrier) so an
 * unreachable job stays inspectable without re-running BFS every tick.
 */
function dispatch(state: LogisticsState, net: RoadNetworkState): void {
  const pending = state.jobs
    .filter((job) => job.status === "pending")
    .sort((a, b) => b.priority - a.priority || a.createdTick - b.createdTick || a.id - b.id);
  for (const job of pending) {
    const carrier = pickCarrier(state, job);
    if (carrier === null) {
      job.heldReason = { kind: "no-carrier", needCapacity: job.amount };
      continue;
    }
    let walk: Cell[] | null;
    const cache = job.routeCache;
    if (cache !== null && cache.revision === net.revision && cache.carrierId === carrier.id) {
      walk = cache.path;
    } else {
      walk = findRoadPath(net, carrier.cell, job.sourceCell);
      job.routeCache = { revision: net.revision, carrierId: carrier.id, path: walk };
    }
    if (walk === null) {
      job.heldReason = { kind: "no-route", from: { x: carrier.cell.x, y: carrier.cell.y }, to: { ...job.sourceCell } };
      continue;
    }
    carrier.jobId = job.id;
    job.carrierId = carrier.id;
    makeReservation(state, job, "carrier", carrier.id);
    job.status = "active";
    job.phase = "to-source";
    job.path = walk;
    job.progress = 0;
    job.pathRevision = net.revision;
    job.legFrom = { x: carrier.cell.x, y: carrier.cell.y };
    job.heldReason = null;
    job.routeCache = null;
    job.lastAttemptRevision = net.revision;
  }
}

/**
 * Advance the session logistics ledger. Per tick: move/load/unload/recall
 * every active job (id order), then dispatch pending jobs oldest-first. One
 * cell per tick, integer-only, deterministic. Never touches the 2D economy or
 * any persisted state; the store calls this beside tickRoadCargo.
 */
export function tickLogistics(state: LogisticsState, net: RoadNetworkState, ticks: number): void {
  if (!Number.isInteger(ticks) || ticks <= 0) return;
  for (let i = 0; i < ticks; i += 1) {
    for (const job of state.jobs) tickJob(state, net, job);
    dispatch(state, net);
    state.tick += 1;
  }
}

/**
 * Conserved totals per resource: free stock + reserved-at-source + in-transit.
 * Delivered units already sit in destination free stock. Invariant across
 * every lifecycle command and tick (E01); only seedStock changes it.
 */
export function logisticsTotals(state: LogisticsState): Partial<Record<ResourceId, number>> {
  const totals: Partial<Record<ResourceId, number>> = {};
  for (const buildingId of Object.keys(state.stocks)) {
    const stock = state.stocks[Number(buildingId)];
    for (const resource of RESOURCES) {
      const qty = stock[resource] ?? 0;
      if (qty !== 0) totals[resource] = (totals[resource] ?? 0) + qty;
    }
  }
  for (const job of state.jobs) {
    const held = job.atSource + job.inTransit;
    if (held !== 0) totals[job.cargoType] = (totals[job.cargoType] ?? 0) + held;
  }
  return totals;
}

/** Deterministic fingerprint for byte-identity assertions in tests. */
export function logisticsFingerprint(state: LogisticsState): string {
  const buildingIds = Object.keys(state.buildings).map(Number).sort((a, b) => a - b);
  const stockIds = Object.keys(state.stocks).map(Number).sort((a, b) => a - b);
  const canonical = {
    schemaVersion: state.schemaVersion,
    tick: state.tick,
    nextJobId: state.nextJobId,
    nextReservationId: state.nextReservationId,
    nextCarrierId: state.nextCarrierId,
    buildings: buildingIds.map((id) => state.buildings[id]),
    stocks: stockIds.map((id) => ({
      buildingId: id,
      entries: Object.keys(state.stocks[id]).sort().map((resource) => [resource, state.stocks[id][resource as ResourceId]]),
    })),
    jobs: [...state.jobs].sort((a, b) => a.id - b.id),
    reservations: [...state.reservations].sort((a, b) => a.id - b.id),
    carriers: [...state.carriers].sort((a, b) => a.id - b.id),
    seenCommands: Object.keys(state.seenCommands).sort().map((key) => [key, state.seenCommands[key]]),
  };
  return checksum(JSON.stringify(canonical));
}