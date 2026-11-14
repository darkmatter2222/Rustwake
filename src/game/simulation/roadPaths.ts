/**
 * Cargo paths over the road graph (issue #139, RW3D T12).
 *
 * GAME_SYSTEMS "Logistics": "Dynamic topology version invalidates affected
 * routes; unreachable jobs back off and remain inspectable." ACCEPTANCE E04:
 * deleting a road preserves cargo and reservations; the job either recovers
 * on a later topology revision or displays the exact blocker.
 *
 * Binding rules implemented here:
 *  - A cargo batch is NEVER deleted by a topology change. Invalidation only
 *    re-routes it (new path stamped with the new topology version) or holds
 *    it with a typed, inspectable reason. Amount and resource are untouched.
 *  - Every path carries the topology version (RoadNetworkState.revision) it
 *    was routed against. A path whose stamp differs from the live revision,
 *    or whose walk no longer validates, is AFFECTED and must be re-resolved.
 *  - Re-route continues from the batch's current cell when that cell still
 *    carries road; if the road was cut under the batch it holds with
 *    `road-removed` at that exact cell. Held batches retry from their origin
 *    on every topology revision, so a later repair recovers them.
 *  - Pathfinding is deterministic BFS over the sorted, flow-respecting
 *    neighbor order of roadGraph.ts: same network + same request = same walk.
 *
 * Session-only, exactly like WorldState and the road network: the 2D economy
 * remains the save authority and the cutover (#148 T21) owns persistence.
 * Pure integer transitions; no DOM, no wall-clock, no randomness.
 */
import type { ResourceId } from "../content/defs";
import { checksum } from "../persistence/save";
import { cellKey, sameCell } from "../world/geometry";
import {
  isRoadCell,
  roadNeighbors,
  roadWalkValid,
  type RoadNetworkState,
} from "../world/roadGraph";
import { applyRoadCommand, type RoadCommand, type RoadCommandResult } from "../world/roadTool";
import type { Cell, WorldState } from "../world/types";

export const ROAD_CARGO_SCHEMA_VERSION = 1;

/** Why a batch is held. Typed so the UI can show the exact blocker (E04). */
export type CargoHoldReason =
  | { kind: "no-route"; from: Cell; to: Cell }
  | { kind: "road-removed"; at: Cell };

export type CargoPhase = "moving" | "held" | "delivered";

export interface CargoPath {
  /** Traversable walk, inclusive of both endpoints, in travel order. */
  cells: Cell[];
  /** Topology revision the walk was routed against. */
  topologyVersion: number;
}

export interface CargoBatch {
  id: number;
  resource: ResourceId;
  /** Positive integer amount; topology changes never modify it. */
  amount: number;
  /** Origin road cell (e.g. a source bay approach). */
  from: Cell;
  /** Destination road cell (e.g. a warehouse bay approach). */
  to: Cell;
  phase: CargoPhase;
  /** Present while moving; null while held or before first routing. */
  path: CargoPath | null;
  /** Index into path.cells of the batch's current cell. */
  progress: number;
  /** Exact blocker while held; null otherwise. */
  heldReason: CargoHoldReason | null;
}

export interface RoadCargoState {
  schemaVersion: number;
  nextBatchId: number;
  batches: CargoBatch[];
}

export function createRoadCargo(): RoadCargoState {
  return { schemaVersion: ROAD_CARGO_SCHEMA_VERSION, nextBatchId: 1, batches: [] };
}

/**
 * Deterministic shortest walk over the road graph (BFS, unit cost per cell,
 * one-way flow respected). Returns null when no route exists. A trivial
 * from == to request on a road cell yields the single-cell walk.
 */
export function findRoadPath(
  net: RoadNetworkState,
  from: Cell,
  to: Cell,
): Cell[] | null {
  if (!isRoadCell(net, from) || !isRoadCell(net, to)) return null;
  if (sameCell(from, to)) return [{ x: from.x, y: from.y }];
  const startKey = cellKey(from);
  const goalKey = cellKey(to);
  const parent = new Map<string, string>();
  const cellsByKey = new Map<string, Cell>([[startKey, { x: from.x, y: from.y }]]);
  const queue: Cell[] = [{ x: from.x, y: from.y }];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const currentKey = cellKey(current);
    if (currentKey === goalKey) {
      const walk: Cell[] = [];
      let key: string | undefined = goalKey;
      while (key !== undefined) {
        walk.push(cellsByKey.get(key) as Cell);
        key = parent.get(key);
      }
      walk.reverse();
      return walk;
    }
    for (const next of roadNeighbors(net, current)) {
      const nextKey = cellKey(next);
      if (nextKey === startKey || parent.has(nextKey)) continue;
      parent.set(nextKey, currentKey);
      cellsByKey.set(nextKey, next);
      queue.push(next);
    }
  }
  return null;
}

export interface CargoRequest {
  resource: ResourceId;
  amount: number;
  from: Cell;
  to: Cell;
}

/**
 * Register a cargo batch and route it immediately. An unreachable request
 * still creates the batch (held, inspectable) — jobs back off, they are not
 * dropped. Amount must be a positive integer; the caller (store/tests) owns
 * request validation, mirroring the command layer.
 */
export function spawnCargoBatch(
  cargo: RoadCargoState,
  net: RoadNetworkState,
  request: CargoRequest,
): CargoBatch {
  const batch: CargoBatch = {
    id: cargo.nextBatchId,
    resource: request.resource,
    amount: request.amount,
    from: { x: request.from.x, y: request.from.y },
    to: { x: request.to.x, y: request.to.y },
    phase: "held",
    path: null,
    progress: 0,
    heldReason: { kind: "no-route", from: { ...request.from }, to: { ...request.to } },
  };
  cargo.nextBatchId += 1;
  cargo.batches.push(batch);
  routeBatch(batch, net, batch.from);
  return batch;
}

/** Route (or hold) one batch from `start`; never touches amount/resource. */
function routeBatch(batch: CargoBatch, net: RoadNetworkState, start: Cell): void {
  // A stamped path means the batch was in transit: if its start cell no
  // longer carries road, a cut landed under it (exact E04 blocker). A fresh
  // request or a held retry simply has no route — nothing was "removed".
  const wasInTransit = batch.path !== null;
  const walk = findRoadPath(net, start, batch.to);
  if (walk !== null) {
    batch.path = { cells: walk, topologyVersion: net.revision };
    batch.progress = 0;
    batch.phase = "moving";
    batch.heldReason = null;
    return;
  }
  batch.path = null;
  batch.progress = 0;
  batch.phase = "held";
  batch.heldReason =
    wasInTransit && !isRoadCell(net, start)
      ? { kind: "road-removed", at: { x: start.x, y: start.y } }
      : { kind: "no-route", from: { x: start.x, y: start.y }, to: { ...batch.to } };
}

export interface PathInvalidationReport {
  /** Batch ids re-routed onto a fresh path at the new topology version. */
  rerouted: number[];
  /** Batch ids held with an exact blocker (cargo preserved). */
  held: number[];
  /** Batch ids whose stamped path still validates; untouched. */
  unchanged: number[];
  /** Delivered batches, never re-examined. */
  delivered: number[];
}

/**
 * Resolve every batch against the live topology. A path is AFFECTED when its
 * stamp differs from net.revision or its walk no longer validates; affected
 * batches re-route from their current cell (or origin when held) and either
 * recover or hold with the exact blocker. Cargo is never deleted or resized.
 */
export function invalidateAffectedPaths(
  net: RoadNetworkState,
  cargo: RoadCargoState,
): PathInvalidationReport {
  const report: PathInvalidationReport = {
    rerouted: [],
    held: [],
    unchanged: [],
    delivered: [],
  };
  for (const batch of cargo.batches) {
    if (batch.phase === "delivered") {
      report.delivered.push(batch.id);
      continue;
    }
    const stamped =
      batch.path !== null &&
      batch.path.topologyVersion === net.revision &&
      roadWalkValid(net, batch.path.cells);
    if (stamped && batch.phase === "moving") {
      report.unchanged.push(batch.id);
      continue;
    }
    const start =
      batch.path !== null && batch.path.cells.length > 0
        ? batch.path.cells[Math.min(batch.progress, batch.path.cells.length - 1)]
        : batch.from;
    routeBatch(batch, net, start);
    // Recovered-from-held and re-routed-while-moving both land here: the
    // batch now carries a fresh path stamped at the live topology version.
    if (batch.phase === "moving") report.rerouted.push(batch.id);
    else report.held.push(batch.id);
  }
  return report;
}

/**
 * Advance moving batches one cell per tick along their stamped path. A batch
 * that reaches the end of its walk is delivered. Held and delivered batches
 * do not move. Pure integer arithmetic; no economy side effects (the 2D
 * economy stays the authority until the #148 cutover).
 */
export function tickRoadCargo(cargo: RoadCargoState, ticks: number): void {
  if (!Number.isInteger(ticks) || ticks <= 0) return;
  for (const batch of cargo.batches) {
    if (batch.phase !== "moving" || batch.path === null) continue;
    const last = batch.path.cells.length - 1;
    batch.progress = Math.min(last, batch.progress + ticks);
    if (batch.progress >= last) batch.phase = "delivered";
  }
}

export interface RoadTransactionResult {
  result: RoadCommandResult;
  /** Null when the command was rejected or an idempotent replay (no change). */
  invalidation: PathInvalidationReport | null;
}

/**
 * The atomic road transaction: world ledger + road network + cargo paths in
 * one step. A rejected command changes NOTHING (all three states stay
 * byte-identical); an idempotent replay returns the original revision without
 * re-invalidating. Only a real topology change triggers path invalidation,
 * and invalidation never deletes cargo.
 */
export function applyRoadTransaction(
  world: WorldState,
  net: RoadNetworkState,
  cargo: RoadCargoState,
  command: RoadCommand,
): RoadTransactionResult {
  const before = net.revision;
  const result = applyRoadCommand(world, net, command);
  if (!result.ok || net.revision === before) {
    return { result, invalidation: null };
  }
  return { result, invalidation: invalidateAffectedPaths(net, cargo) };
}

/** Deterministic fingerprint for byte-identity assertions in tests. */
export function roadCargoFingerprint(cargo: RoadCargoState): string {
  return checksum(JSON.stringify(cargo));
}