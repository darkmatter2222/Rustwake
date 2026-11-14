/**
 * Road network graph (issue #139, RW3D T12).
 *
 * Roads are an independent graph (GAME_SYSTEMS "Logistics"): nodes are
 * intersections and bay approach sockets, edges are orthogonal grid-aligned
 * segments carrying a lane count and a direction. The graph lives BESIDE the
 * world grid (#133), not inside WorldState: WorldState stays the placement
 * authority and the save cutover (#148 T21) attaches both additively later.
 *
 * Representation choices (binding for this issue):
 *  - Edges are stored, keyed by the canonical unordered cell pair. Nodes are
 *    DERIVED (degree >= 3 junctions, degree 1 endpoints, plus the socket
 *    approach nodes from roadSockets.ts), so a node can never drift out of
 *    sync with its edges.
 *  - Every road cell carries a paid-scrap ledger entry so dismantle refunds
 *    are exact (80%, integer floor) and upgrades are accountable.
 *  - `revision` is the TOPOLOGY VERSION: it increments only on a successful
 *    topology change and is the stamp cargo paths are invalidated against
 *    (GAME_SYSTEMS: "Dynamic topology version invalidates affected routes").
 *
 * Boundary rules (architecture README section 1): integer state only, no DOM,
 * no wall-clock, every transition a pure function of (state, command).
 *
 * Save impact in this issue: NONE. The network is session-only, exactly like
 * WorldState; the 2D -> 3D cutover (#148) owns persistence.
 */
import { checksum } from "../persistence/save";
import { cellKey, sameCell } from "./geometry";
import type { Cell } from "./types";

export const ROAD_SCHEMA_VERSION = 1;

/**
 * Prototype tuning default: GAME_SYSTEMS requires a material cost for roads
 * but the P1 table does not author one yet (#148 content bump), the same
 * precedent as crane/turret/wall_gate in kit.ts. 5 scrap per cell keeps the
 * 80% dismantle refund an exact integer (4) at the prototype price.
 */
export const ROAD_CELL_COST_SCRAP = 5;
/** Dismantle refunds 80% (GAME_SYSTEMS), integer floor per cell. */
export const ROAD_REFUND_PCT = 80;

export type RoadLanes = 1 | 2;
export type RoadDirection = "two-way" | "one-way";

export function isRoadLanes(v: unknown): v is RoadLanes {
  return v === 1 || v === 2;
}

/** One orthogonal segment between adjacent cells. `a`/`b` are canonical order. */
export interface RoadEdge {
  readonly a: Cell;
  readonly b: Cell;
  lanes: RoadLanes;
  direction: RoadDirection;
  /**
   * Unit grid step of the canonical a -> b orientation. For a one-way edge
   * it is the ONLY permitted travel direction; two-way edges accept both.
   */
  flow: Cell;
}

/** Paid-scrap ledger for one road cell (new build + lane upgrades). */
export interface RoadCellLedger {
  paidScrap: number;
}

export interface RoadNetworkState {
  schemaVersion: number;
  /** Topology version; increments only on a successful topology change. */
  revision: number;
  /** Canonical edge key -> segment. */
  edges: Record<string, RoadEdge>;
  /** cellKey -> paid ledger; every road cell has exactly one entry. */
  cells: Record<string, RoadCellLedger>;
  /** Command id -> topology revision at application (idempotent replay). */
  seenCommands: Record<string, number>;
}

export function createRoadNetwork(): RoadNetworkState {
  return {
    schemaVersion: ROAD_SCHEMA_VERSION,
    revision: 0,
    edges: {},
    cells: {},
    seenCommands: {},
  };
}

/** Canonical unordered edge key: the two cell keys in sorted order. */
export function roadEdgeKey(a: Cell, b: Cell): string {
  const ka = cellKey(a);
  const kb = cellKey(b);
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Unit grid step from one cell to an adjacent cell. */
export function roadStep(from: Cell, to: Cell): Cell {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function isAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** Canonical endpoints of an edge key, ordered exactly like roadEdgeKey. */
export function edgeEndpoints(edge: RoadEdge): [Cell, Cell] {
  return [edge.a, edge.b];
}

/** True when travel from -> to is permitted along this edge. */
export function canTraverse(edge: RoadEdge, from: Cell, to: Cell): boolean {
  const forward = sameCell(edge.a, from) && sameCell(edge.b, to);
  const backward = sameCell(edge.b, from) && sameCell(edge.a, to);
  if (!forward && !backward) return false;
  if (edge.direction === "two-way") return true;
  const step = roadStep(from, to);
  return step.x === edge.flow.x && step.y === edge.flow.y;
}

export function isRoadCell(net: RoadNetworkState, cell: Cell): boolean {
  return net.cells[cellKey(cell)] !== undefined;
}

/** Every edge incident to a cell, sorted by canonical key (deterministic). */
export function roadEdgesAt(net: RoadNetworkState, cell: Cell): RoadEdge[] {
  const key = cellKey(cell);
  const out: RoadEdge[] = [];
  for (const edgeKey of Object.keys(net.edges).sort()) {
    const edge = net.edges[edgeKey];
    if (cellKey(edge.a) === key || cellKey(edge.b) === key) out.push(edge);
  }
  return out;
}

export function roadDegree(net: RoadNetworkState, cell: Cell): number {
  return roadEdgesAt(net, cell).length;
}

/** All road cells, sorted by cell key (deterministic iteration order). */
export function roadCells(net: RoadNetworkState): Cell[] {
  return Object.keys(net.cells)
    .sort()
    .map((key) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y };
    });
}

/**
 * Outgoing travel neighbors of a cell, respecting one-way flow, sorted by
 * cell key. Deterministic order is part of the pathfinding contract.
 */
export function roadNeighbors(net: RoadNetworkState, cell: Cell): Cell[] {
  const out: Cell[] = [];
  for (const edge of roadEdgesAt(net, cell)) {
    const other = sameCell(edge.a, cell) ? edge.b : edge.a;
    if (canTraverse(edge, cell, other)) out.push(other);
  }
  return out.sort((p, q) => (cellKey(p) < cellKey(q) ? -1 : cellKey(p) > cellKey(q) ? 1 : 0));
}

export interface RoadNode {
  cell: Cell;
  kind: "junction" | "endpoint";
  degree: number;
}

/**
 * Derived graph nodes: degree >= 3 junctions and degree 1 endpoints, sorted
 * by cell key. Bay socket approach nodes are derived separately from the
 * placed buildings (roadSockets.ts) so they always track the kit.
 */
export function roadNodes(net: RoadNetworkState): RoadNode[] {
  const out: RoadNode[] = [];
  for (const cell of roadCells(net)) {
    const degree = roadDegree(net, cell);
    if (degree >= 3) out.push({ cell, kind: "junction", degree });
    else if (degree === 1) out.push({ cell, kind: "endpoint", degree });
  }
  return out;
}

/**
 * True when every consecutive pair of the walk is a traversable edge.
 * A single-cell walk (from == to) is trivially valid.
 */
export function roadWalkValid(net: RoadNetworkState, cells: readonly Cell[]): boolean {
  if (cells.length === 0) return false;
  for (let i = 1; i < cells.length; i += 1) {
    const from = cells[i - 1];
    const to = cells[i];
    if (!isAdjacent(from, to)) return false;
    const edge = net.edges[roadEdgeKey(from, to)];
    if (edge === undefined || !canTraverse(edge, from, to)) return false;
  }
  return true;
}

/**
 * Deterministic fingerprint (FNV-1a over canonical JSON, reusing the
 * persistence checksum read-only) so tests can prove a rejected road command
 * leaves the network byte-identical.
 */
export function roadFingerprint(net: RoadNetworkState): string {
  return checksum(JSON.stringify(net));
}