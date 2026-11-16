/**
 * RW3D #147 (T20): the pure read model behind the road fleet / routes panels.
 *
 * Everything here is a projection of the session-only logistics + traffic
 * slices the store already owns (#140/#141). No simulation state is invented,
 * no command is dispatched, and nothing touches the save envelope — the
 * 2D -> 3D persistence cutover (#148) owns that. The panels read these rows;
 * the engine remains the single authority on stock, room and movement.
 *
 * Wait reasons stay TYPED end to end (E04/U06): the engine's `LogisticsHoldReason`
 * and `TrafficHoldReason` unions are mapped to player text plus the exact cell
 * the camera should focus, so "blocked" always names its blocker and its fix.
 */
import type { Cell } from "../../game/world/types";
import type { ResourceId } from "../../game/content/defs";
import type {
  CargoJob,
  Carrier,
  CreateJobResult,
  CancelJobResult,
  LogisticsBuilding,
  LogisticsJobRequest,
  LogisticsState,
} from "../../game/simulation/logistics";
import type { TrafficState, TruckConfig, TruckRuntime } from "../../game/simulation/traffic";
import type { RoadSocketLink } from "../../game/world/roadSockets";
import type { StoreRole } from "../../app/store";

/**
 * The narrow store surface the road panels need. `createStore` already returns
 * the full intersection (LogisticsApi & TrafficApi & RoadApi); App casts once
 * at the registration site, exactly like the #139 road tool, so existing store
 * doubles and the GameStore surface stay untouched.
 */
export interface RoadLogisticsApi {
  getRole(): StoreRole;
  subscribe(listener: () => void): () => void;
  getLogistics(): LogisticsState;
  getLogisticsJobs(): CargoJob[];
  createLogisticsJob(request: LogisticsJobRequest): CreateJobResult;
  cancelLogisticsJob(jobId: number): CancelJobResult;
  registerLogisticsBuilding(site: LogisticsBuilding): boolean;
  registerLogisticsCarrier(request: { capacity: number; cell: Cell }): Carrier | null;
  getTraffic(): TrafficState;
  isTrafficEnabled(): boolean;
  enableTraffic(): boolean;
  setTrafficDefaultTruck(config: Partial<TruckConfig>): boolean;
  configureTrafficTruck(carrierId: number, config: Partial<TruckConfig>): boolean;
  setTrafficBayCapacity(cell: Cell, capacity: number): boolean;
  setTrafficJunctionCapacity(capacity: number | null): boolean;
  setTrafficJunctionCost(cost: number): boolean;
  setTrafficRetryPolicy(policy: {
    maxRetries?: number;
    baseBackoff?: number;
    maxBackoff?: number;
  }): boolean;
  getRoadSockets(): RoadSocketLink[];
}

/** The engine's two hold unions, unified for display. Tags are the engine's. */
export type WaitReason =
  | { kind: "no-route"; from: Cell; to: Cell }
  | { kind: "road-removed"; at: Cell }
  | { kind: "destination-full"; buildingId: number; room: number }
  | { kind: "no-carrier"; needCapacity: number }
  | { kind: "bay-full"; at: Cell; capacity: number }
  | { kind: "junction-full"; at: Cell; capacity: number };

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export function cellLabel(cell: Cell): string {
  return `(${cell.x}, ${cell.y})`;
}

/**
 * The exact blocker for a job: the logistics hold wins (it is the cargo-level
 * truth), then the carrier's traffic hold. Mirrors the fleet adapter's
 * precedence in `renderer/fleet.ts` without importing renderer code.
 */
export function jobWaitReason(
  job: CargoJob,
  traffic: TrafficState,
): WaitReason | null {
  if (job.heldReason !== null) return job.heldReason;
  if (job.carrierId === null) return null;
  const runtime = traffic.trucks[job.carrierId];
  return runtime?.heldReason ?? null;
}

/** Player text for a typed hold. Names the blocker, never a generic "blocked". */
export function waitReasonText(reason: WaitReason): string {
  switch (reason.kind) {
    case "no-route":
      return `No road route ${cellLabel(reason.from)} → ${cellLabel(reason.to)}`;
    case "road-removed":
      return `Road removed at ${cellLabel(reason.at)}`;
    case "destination-full":
      return `Destination ${reason.buildingId} full (room for ${reason.room})`;
    case "no-carrier":
      return `No idle truck fits ${reason.needCapacity} units`;
    case "bay-full":
      return `Bay ${cellLabel(reason.at)} full (capacity ${reason.capacity})`;
    case "junction-full":
      return `Junction ${cellLabel(reason.at)} full (capacity ${reason.capacity})`;
  }
}

/** The recovery hint shown beside a hold (U06: focus AND fix, no reset). */
export function waitReasonRecovery(reason: WaitReason): string {
  switch (reason.kind) {
    case "no-route":
      return "Build or repair road between the two approach cells; the job retries on the next topology change.";
    case "road-removed":
      return "Rebuild the missing road segment; the job revalidates automatically.";
    case "destination-full":
      return "Free storage at the destination, raise its capacity, or cancel the job to return the cargo.";
    case "no-carrier":
      return "Add a truck with enough capacity, or wait for one to finish its job.";
    case "bay-full":
      return "Raise this bay's capacity below, or wait for a loading slot to free.";
    case "junction-full":
      return "Raise the junction capacity, or wait for a truck to clear the junction.";
  }
}

/**
 * The cell the camera should center when the player focuses a hold. Capacity
 * blockers point at the contested cell; route blockers at the far end of the
 * missing leg; destination-full at the destination approach.
 */
export function waitReasonFocusCell(reason: WaitReason, job: CargoJob): Cell {
  switch (reason.kind) {
    case "no-route":
      return reason.to;
    case "road-removed":
      return reason.at;
    case "destination-full":
      return job.destCell;
    case "no-carrier":
      return job.sourceCell;
    case "bay-full":
      return reason.at;
    case "junction-full":
      return reason.at;
  }
}

/** The truck profile actually in force for a carrier (override, else default). */
export function effectiveTruckConfig(traffic: TrafficState, carrierId: number): TruckConfig {
  return traffic.trucks[carrierId]?.config ?? traffic.defaultTruck;
}

export interface FleetRow {
  readonly carrier: Carrier;
  /** The one job this carrier serves, or null when idle. */
  readonly job: CargoJob | null;
  readonly runtime: TruckRuntime | null;
  readonly config: TruckConfig;
  readonly wait: WaitReason | null;
  /** Where the truck is right now (engine cell, not interpolated paint). */
  readonly cell: Cell;
}

/** Fleet rows in the engine's own carrier order (stable ids). */
export function fleetRows(logistics: LogisticsState, traffic: TrafficState): FleetRow[] {
  const jobsById = new Map(logistics.jobs.map((job) => [job.id, job]));
  return logistics.carriers.map((carrier) => {
    const job = carrier.jobId === null ? null : (jobsById.get(carrier.jobId) ?? null);
    const runtime = traffic.trucks[carrier.id] ?? null;
    const wait = job === null ? (runtime?.heldReason ?? null) : jobWaitReason(job, traffic);
    return {
      carrier,
      job,
      runtime,
      config: runtime?.config ?? traffic.defaultTruck,
      wait,
      cell: carrier.cell,
    };
  });
}

export interface JobRow {
  readonly job: CargoJob;
  readonly wait: WaitReason | null;
  /** Units still to move (atSource + inTransit); 0 once terminal. */
  readonly remaining: number;
}

/** Job rows, newest first, terminal history included (inspectable per #140). */
export function jobRows(logistics: LogisticsState, traffic: TrafficState): JobRow[] {
  return [...logistics.jobs]
    .sort((a, b) => b.id - a.id)
    .map((job) => ({
      job,
      wait: jobWaitReason(job, traffic),
      remaining: job.atSource + job.inTransit,
    }));
}

/** Free (unreserved) stock of one resource at a building. */
export function freeStock(
  logistics: LogisticsState,
  buildingId: number,
  resource: ResourceId,
): number {
  return logistics.stocks[buildingId]?.[resource] ?? 0;
}

/** Total free units across resources at a building (its remaining room). */
export function freeRoom(logistics: LogisticsState, building: LogisticsBuilding): number {
  const stocks = logistics.stocks[building.id] ?? {};
  let used = 0;
  for (const qty of Object.values(stocks)) used += qty ?? 0;
  return Math.max(0, building.capacity - used);
}

/**
 * Typed engine rejection -> player text. The engine's tags are API; this map
 * only renders them, so a new tag fails loudly in tests instead of silently
 * showing nothing.
 */
export function rejectionText(result: CreateJobResult): string {
  if (result.ok) return "";
  const r = result.reason;
  switch (r.reason) {
    case "invalid-amount":
      return `Amount must be a positive whole number (got ${r.amount}).`;
    case "invalid-resource":
      return `Unknown material "${r.resource}".`;
    case "invalid-building":
      return `Building id must be a positive whole number (got ${r.buildingId}).`;
    case "invalid-priority":
      return `Priority must be a whole number (got ${r.priority}).`;
    case "unknown-building":
      return `Building ${r.buildingId} is not registered. Register its approach cell first.`;
    case "same-building":
      return "Source and destination must be different buildings.";
    case "same-location":
      return "Source and destination share an approach cell.";
    case "insufficient-stock":
      return `Only ${r.have} ${r.resource} free at the source (need ${r.need}).`;
    case "insufficient-room":
      return `Destination ${r.buildingId} has room for ${r.have} (need ${r.need}).`;
    case "read-only":
      return "Another tab owns the save; this tab is read-only.";
  }
}

export function cancelRejectionText(result: CancelJobResult): string {
  if (result.ok) return "";
  return result.reason.reason === "unknown-job"
    ? "That job no longer exists."
    : "Another tab owns the save; this tab is read-only.";
}

/**
 * One declared loading bay for the capacity editor: the #139 socket's approach
 * cell (the exact key the traffic authority leases), its current cap and live
 * occupancy. Deduped by cell so two sockets sharing an approach show once.
 */
export interface BayRow {
  readonly cell: Cell;
  readonly label: string;
  readonly connected: boolean;
  /** null = unlimited (the legacy default). */
  readonly capacity: number | null;
  readonly leases: number;
}

export function bayRows(traffic: TrafficState, sockets: RoadSocketLink[]): BayRow[] {
  const byCell = new Map<string, BayRow>();
  for (const socket of sockets) {
    const key = cellKey(socket.approach);
    const leases = traffic.bayLeases.filter((lease) => cellKey(lease.cell) === key).length;
    const existing = byCell.get(key);
    if (existing !== undefined) {
      byCell.set(key, {
        ...existing,
        label: `${existing.label} + ${socket.buildingId}/${socket.socket}`,
        connected: existing.connected || socket.connected,
        leases: Math.max(existing.leases, leases),
      });
      continue;
    }
    byCell.set(key, {
      cell: socket.approach,
      label: `${socket.buildingId}/${socket.socket}`,
      connected: socket.connected,
      capacity: traffic.bayCapacity[key] ?? null,
      leases,
    });
  }
  return [...byCell.values()];
}
