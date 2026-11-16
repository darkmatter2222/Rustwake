/**
 * Atomic road tool (issue #139, RW3D T12).
 *
 * One command = one transaction: ALL validation is pure and complete before
 * the first mutation, so a rejected command leaves BOTH the world ledger and
 * the road network byte-identical (structural atomicity, fingerprint-tested).
 * Commands are idempotent by id, mirroring applyWorldCommand.
 *
 * Placement law (fixed validation order, typed rejections):
 *   path shape -> lanes -> land -> terrain -> occupancy -> crane keep-out ->
 *   lane downgrade -> material.
 *
 * Entrance corridors are deliberately NOT a blocker: corridors are keep-clear
 * zones for footprints and crane swings, never occupancy (binding ruling, PR
 * #188 comment 6871139430). Roads are the shared surface two corridors may
 * overlap on, so a road inside a corridor is legal — that is exactly how a
 * lane reaches a bay approach socket.
 *
 * Cost: ROAD_CELL_COST_SCRAP per NEW or lane-upgraded cell (prototype default,
 * #148). Re-using an existing segment at the same lane count is free, so
 * overlapping placements never double-charge. Dismantle refunds 80% (integer
 * floor) of each removed cell's paid ledger; a neighbor left roadless by the
 * cut is refunded in the same transaction so no paid cell is ever orphaned.
 *
 * Roads build instantly (no construction site): they are ground work, not
 * assembled assets. Material moves stock -> committed in one ledger step.
 */
import type { ResourceId } from "../content/defs";
import {
  cellKey,
  cellRectMu,
  centerMu,
  footprintCells,
  rectIntersectsDisc,
  sameCell,
} from "./geometry";
import { WORLD_KIT, type WorldAssetId } from "./kit";
import {
  ROAD_CELL_COST_SCRAP,
  ROAD_REFUND_PCT,
  isAdjacent,
  isRoadCell,
  isRoadLanes,
  roadEdgeKey,
  roadEdgesAt,
  roadStep,
  type RoadEdge,
  type RoadLanes,
  type RoadNetworkState,
} from "./roadGraph";
import { roadSocketLinks, type RoadSocketLink } from "./roadSockets";
import { cellOwned, terrainAt } from "./terrain";
import type { Cell, WorldState } from "./types";

/** Stable, typed rejection reasons. Tags are API; payloads carry recovery data. */
export type RoadRejection =
  | { reason: "invalid-path"; detail: "empty" | "too-short" | "non-integer" | "duplicate" | "discontiguous" }
  | { reason: "invalid-lanes"; lanes: number }
  | { reason: "outside-land"; cells: Cell[] }
  | { reason: "terrain-unsupported"; cells: Cell[]; terrain: string }
  | { reason: "occupied"; cells: Cell[]; occupantId: number }
  | { reason: "keepout"; craneId: number; cells: Cell[] }
  | { reason: "lane-downgrade"; cells: Cell[]; have: RoadLanes; want: RoadLanes }
  | { reason: "insufficient-material"; resource: ResourceId; need: number; have: number }
  | { reason: "no-road"; cells: Cell[] }
  | { reason: "read-only" };

export type RoadCommand =
  | { id: string; type: "road.place"; cells: Cell[]; lanes?: RoadLanes }
  | { id: string; type: "road.remove"; cells: Cell[] };

export type RoadCommandResult =
  | { ok: true; revision: number }
  | { ok: false; rejection: RoadRejection };

export interface RoadPlacePreview {
  readonly kind: "place";
  readonly valid: boolean;
  readonly rejection: RoadRejection | null;
  /** The validated orthogonal route (input order). */
  readonly route: Cell[];
  /** Cells with no road today; each costs ROAD_CELL_COST_SCRAP. */
  readonly newCells: Cell[];
  /** Existing road cells kept at the requested lane count; free. */
  readonly reusedCells: Cell[];
  /** Existing cells whose path edges gain lanes; each costs the cell price. */
  readonly upgradedCells: Cell[];
  readonly costScrap: number;
  /** Route cells where a perpendicular existing segment becomes a junction. */
  readonly crossings: Cell[];
  /** Bay sockets whose approach cell lies on the route (connected after commit). */
  readonly sockets: RoadSocketLink[];
}

export interface RoadRemovePreview {
  readonly kind: "remove";
  readonly valid: boolean;
  readonly rejection: RoadRejection | null;
  /** Target cells that actually carry road (sorted, deduped). */
  readonly cells: Cell[];
  /** Canonical keys of every edge the cut removes (sorted). */
  readonly removedEdgeKeys: string[];
  /** Cells refunded: targets plus neighbors left roadless by the cut. */
  readonly refundCells: Cell[];
  readonly refundScrap: number;
  /** Bay sockets that lose their last road edge at the approach cell. */
  readonly disconnected: RoadSocketLink[];
}

function isIntegerCell(cell: Cell): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y);
}

/** Shape validation shared by both commands: integers, no duplicates. */
function pathShape(cells: readonly Cell[], minLen: number): RoadRejection | null {
  if (cells.length === 0) return { reason: "invalid-path", detail: "empty" };
  if (cells.length < minLen) return { reason: "invalid-path", detail: "too-short" };
  const seen = new Set<string>();
  for (const cell of cells) {
    if (!isIntegerCell(cell)) return { reason: "invalid-path", detail: "non-integer" };
    const key = cellKey(cell);
    if (seen.has(key)) return { reason: "invalid-path", detail: "duplicate" };
    seen.add(key);
  }
  for (let i = 1; i < cells.length; i += 1) {
    if (!isAdjacent(cells[i - 1], cells[i])) {
      return { reason: "invalid-path", detail: "discontiguous" };
    }
  }
  return null;
}

interface Occupant {
  readonly id: number;
  readonly cells: Cell[];
}

/** Footprint occupancy of completed buildings AND live construction sites. */
function occupants(w: WorldState): Occupant[] {
  const list: Occupant[] = [];
  for (const b of w.buildings) {
    list.push({
      id: b.id,
      cells: footprintCells(b.cell, WORLD_KIT[b.asset as WorldAssetId].footprint, b.rotation),
    });
  }
  for (const s of w.sites) {
    list.push({
      id: s.id,
      cells: footprintCells(s.cell, WORLD_KIT[s.asset as WorldAssetId].footprint, s.rotation),
    });
  }
  return list;
}

function craneDiscs(w: WorldState): { id: number; cx: number; cz: number; r: number }[] {
  const discs: { id: number; cx: number; cz: number; r: number }[] = [];
  const all = [
    ...w.buildings.map((b) => ({ id: b.id, asset: b.asset, cell: b.cell, rotation: b.rotation })),
    ...w.sites.map((s) => ({ id: s.id, asset: s.asset, cell: s.cell, rotation: s.rotation })),
  ];
  for (const o of all) {
    if (o.asset !== "crane") continue;
    const r = WORLD_KIT.crane.keepoutRadiusMu;
    if (r === undefined) continue;
    const [cx, cz] = centerMu(o.cell, WORLD_KIT.crane.footprint, o.rotation);
    discs.push({ id: o.id, cx, cz, r });
  }
  return discs;
}

/** Axis of the route at index i: true when the walk is horizontal there. */
function routeHorizontal(route: readonly Cell[], i: number): boolean {
  const step =
    i > 0 ? roadStep(route[i - 1], route[i]) : roadStep(route[i], route[i + 1]);
  return step.x !== 0;
}

/**
 * Pure placement preview: route, cost, crossings and socket connections,
 * plus the first rejection in the fixed order. Never touches state, so the
 * UI can paint the ghost on every pointer move.
 */
export function previewRoadPlace(
  world: WorldState,
  net: RoadNetworkState,
  cells: readonly Cell[],
  lanes: RoadLanes = 1,
): RoadPlacePreview {
  const empty: RoadPlacePreview = {
    kind: "place",
    valid: false,
    rejection: null,
    route: [],
    newCells: [],
    reusedCells: [],
    upgradedCells: [],
    costScrap: 0,
    crossings: [],
    sockets: [],
  };
  const shape = pathShape(cells, 2);
  if (shape !== null) return { ...empty, rejection: shape };
  if (!isRoadLanes(lanes)) return { ...empty, rejection: { reason: "invalid-lanes", lanes } };
  const route = cells.map((c) => ({ x: c.x, y: c.y }));

  const unowned = route.filter((c) => !cellOwned(world, c.x, c.y));
  if (unowned.length > 0) return { ...empty, route, rejection: { reason: "outside-land", cells: unowned } };

  for (const c of route) {
    const kind = terrainAt(world, c.x, c.y);
    if (kind !== "flat") {
      return {
        ...empty,
        route,
        rejection: { reason: "terrain-unsupported", cells: [c], terrain: kind ?? "void" },
      };
    }
  }

  const byCell = new Map<string, Occupant>();
  for (const o of occupants(world)) {
    for (const c of o.cells) byCell.set(cellKey(c), o);
  }
  for (const c of route) {
    const hit = byCell.get(cellKey(c));
    if (hit !== undefined) {
      return { ...empty, route, rejection: { reason: "occupied", cells: [c], occupantId: hit.id } };
    }
  }

  for (const disc of craneDiscs(world)) {
    const hit = route.filter((c) => rectIntersectsDisc(cellRectMu(c), disc.cx, disc.cz, disc.r));
    if (hit.length > 0) {
      return { ...empty, route, rejection: { reason: "keepout", craneId: disc.id, cells: hit } };
    }
  }

  // Classify cells against the path edges only; crossing segments elsewhere
  // in the same cell do not change the price.
  const pathEdges: (RoadEdge | undefined)[] = [];
  for (let i = 1; i < route.length; i += 1) {
    pathEdges.push(net.edges[roadEdgeKey(route[i - 1], route[i])]);
  }
  const downgradeCells: Cell[] = [];
  let downgradeHave: RoadLanes = lanes;
  for (let i = 0; i < route.length; i += 1) {
    const incident = [pathEdges[i - 1], pathEdges[i]].filter(
      (e): e is RoadEdge => e !== undefined,
    );
    const wider = incident.filter((e) => e.lanes > lanes);
    if (wider.length > 0) {
      downgradeCells.push(route[i]);
      for (const e of wider) if (e.lanes > downgradeHave) downgradeHave = e.lanes;
    }
  }
  if (downgradeCells.length > 0) {
    return {
      ...empty,
      route,
      rejection: { reason: "lane-downgrade", cells: downgradeCells, have: downgradeHave, want: lanes },
    };
  }

  const newCells: Cell[] = [];
  const reusedCells: Cell[] = [];
  const upgradedCells: Cell[] = [];
  for (let i = 0; i < route.length; i += 1) {
    const c = route[i];
    if (!isRoadCell(net, c)) {
      newCells.push(c);
      continue;
    }
    const incident = [pathEdges[i - 1], pathEdges[i]].filter(
      (e): e is RoadEdge => e !== undefined,
    );
    if (incident.some((e) => e.lanes < lanes)) upgradedCells.push(c);
    else reusedCells.push(c);
  }

  const crossings: Cell[] = [];
  for (let i = 0; i < route.length; i += 1) {
    const c = route[i];
    if (!isRoadCell(net, c)) continue;
    const horizontal = routeHorizontal(route, i);
    const perpendicular = roadEdgesAt(net, c).filter((edge) => {
      const edgeHorizontal = edge.a.y === edge.b.y;
      return edgeHorizontal !== horizontal;
    });
    if (perpendicular.length > 0) crossings.push(c);
  }

  const costScrap = (newCells.length + upgradedCells.length) * ROAD_CELL_COST_SCRAP;
  const have = world.stock.scrap ?? 0;
  if (have < costScrap) {
    return {
      ...empty,
      route,
      rejection: { reason: "insufficient-material", resource: "scrap", need: costScrap, have },
    };
  }

  const onRoute = new Set(route.map(cellKey));
  const sockets = roadSocketLinks(net, world)
    .filter((link) => onRoute.has(cellKey(link.approach)))
    .map((link) => ({ ...link, connected: true }));

  return {
    kind: "place",
    valid: true,
    rejection: null,
    route,
    newCells,
    reusedCells,
    upgradedCells,
    costScrap,
    crossings,
    sockets,
  };
}

/** Cells that still carry at least one edge after the given keys are cut. */
function remainingDegree(net: RoadNetworkState, removed: Set<string>, cell: Cell): number {
  let degree = 0;
  for (const edge of roadEdgesAt(net, cell)) {
    if (!removed.has(roadEdgeKey(edge.a, edge.b))) degree += 1;
  }
  return degree;
}

/**
 * Pure dismantle preview: the exact edge cut, the exact refund (targets plus
 * any neighbor left roadless), and the bays that lose their connection.
 */
export function previewRoadRemove(
  world: WorldState,
  net: RoadNetworkState,
  cells: readonly Cell[],
): RoadRemovePreview {
  const empty: RoadRemovePreview = {
    kind: "remove",
    valid: false,
    rejection: null,
    cells: [],
    removedEdgeKeys: [],
    refundCells: [],
    refundScrap: 0,
    disconnected: [],
  };
  if (cells.length === 0) {
    return { ...empty, rejection: { reason: "invalid-path", detail: "empty" } };
  }
  for (const cell of cells) {
    if (!isIntegerCell(cell)) {
      return { ...empty, rejection: { reason: "invalid-path", detail: "non-integer" } };
    }
  }
  const targets = [...new Map(cells.map((c) => [cellKey(c), { x: c.x, y: c.y }])).values()].sort(
    (a, b) => (cellKey(a) < cellKey(b) ? -1 : cellKey(a) > cellKey(b) ? 1 : 0),
  );
  const roadTargets = targets.filter((c) => isRoadCell(net, c));
  if (roadTargets.length === 0) {
    return { ...empty, rejection: { reason: "no-road", cells: targets } };
  }

  const removed = new Set<string>();
  for (const cell of roadTargets) {
    for (const edge of roadEdgesAt(net, cell)) removed.add(roadEdgeKey(edge.a, edge.b));
  }
  const removedEdgeKeys = [...removed].sort();

  // Refund closure: every paid cell the cut leaves roadless — the targets
  // themselves plus any neighbor whose last edge was part of the cut.
  const refundCells: Cell[] = [];
  let refundScrap = 0;
  for (const key of Object.keys(net.cells).sort()) {
    const [x, y] = key.split(",").map(Number);
    const cell = { x, y };
    if (remainingDegree(net, removed, cell) > 0) continue;
    refundCells.push(cell);
    refundScrap += Math.floor((net.cells[key].paidScrap * ROAD_REFUND_PCT) / 100);
  }

  const disconnected = roadSocketLinks(net, world).filter(
    (link) =>
      link.connected &&
      removedEdgeKeys.some((key) => {
        const edge = net.edges[key];
        return sameCell(edge.a, link.approach) || sameCell(edge.b, link.approach);
      }) &&
      remainingDegree(net, removed, link.approach) === 0,
  );

  return {
    kind: "remove",
    valid: true,
    rejection: null,
    cells: roadTargets,
    removedEdgeKeys,
    refundCells,
    refundScrap,
    disconnected,
  };
}

/** Internal outcome: `changed` distinguishes real topology edits from no-ops. */
type ExecuteOutcome = { ok: true; changed: boolean } | { ok: false; rejection: RoadRejection };

function executePlace(
  world: WorldState,
  net: RoadNetworkState,
  cmd: Extract<RoadCommand, { type: "road.place" }>,
): ExecuteOutcome {
  const lanes: RoadLanes = cmd.lanes ?? 1;
  const preview = previewRoadPlace(world, net, cmd.cells, lanes);
  if (!preview.valid) return { ok: false, rejection: preview.rejection as RoadRejection };
  // Past this point every check passed; mutations are total and cannot fail.
  let changed = false;
  for (let i = 1; i < preview.route.length; i += 1) {
    const from = preview.route[i - 1];
    const to = preview.route[i];
    const key = roadEdgeKey(from, to);
    const existing = net.edges[key];
    if (existing !== undefined) {
      // Lane upgrade only; direction/flow of an existing segment is preserved.
      if (existing.lanes < lanes) {
        existing.lanes = lanes;
        changed = true;
      }
      continue;
    }
    changed = true;
    const ka = cellKey(from);
    const kb = cellKey(to);
    const a = ka <= kb ? from : to;
    const b = ka <= kb ? to : from;
    net.edges[key] = {
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      lanes,
      direction: "two-way",
      flow: roadStep(a, b),
    };
  }
  for (const cell of preview.newCells) {
    net.cells[cellKey(cell)] = { paidScrap: ROAD_CELL_COST_SCRAP };
  }
  for (const cell of preview.upgradedCells) {
    net.cells[cellKey(cell)].paidScrap += ROAD_CELL_COST_SCRAP;
  }
  world.stock.scrap = (world.stock.scrap ?? 0) - preview.costScrap;
  world.committed.scrap = (world.committed.scrap ?? 0) + preview.costScrap;
  return { ok: true, changed };
}

function executeRemove(
  world: WorldState,
  net: RoadNetworkState,
  cmd: Extract<RoadCommand, { type: "road.remove" }>,
): ExecuteOutcome {
  const preview = previewRoadRemove(world, net, cmd.cells);
  if (!preview.valid) return { ok: false, rejection: preview.rejection as RoadRejection };
  for (const key of preview.removedEdgeKeys) delete net.edges[key];
  for (const cell of preview.refundCells) {
    const key = cellKey(cell);
    const refund = Math.floor((net.cells[key].paidScrap * ROAD_REFUND_PCT) / 100);
    world.stock.scrap = (world.stock.scrap ?? 0) + refund;
    world.committed.scrap = (world.committed.scrap ?? 0) - refund;
    delete net.cells[key];
  }
  // A valid remove always cuts at least one edge (targets carry road).
  return { ok: true, changed: true };
}

/**
 * Apply a road command to the world ledger and the network. Idempotent by
 * command id: a replayed id returns the original topology revision without
 * charging or mutating anything. The topology revision increments only on a
 * REAL topology change (new segment, lane upgrade, cut); a free reuse no-op
 * leaves both revisions untouched so valid cargo paths are not invalidated.
 * world.revision tracks the material ledger change in the same step.
 *
 * Cargo path invalidation is orchestrated one layer up
 * (simulation/roadPaths.ts applyRoadTransaction) so the world module stays
 * free of cargo semantics.
 */
export function applyRoadCommand(
  world: WorldState,
  net: RoadNetworkState,
  command: RoadCommand,
): RoadCommandResult {
  const seen = net.seenCommands[command.id];
  if (seen !== undefined) return { ok: true, revision: seen };
  let outcome: ExecuteOutcome;
  switch (command.type) {
    case "road.place":
      outcome = executePlace(world, net, command);
      break;
    case "road.remove":
      outcome = executeRemove(world, net, command);
      break;
  }
  if (!outcome.ok) return { ok: false, rejection: outcome.rejection };
  // A pure reuse (no new segment, no lane upgrade) is a free no-op: it must
  // NOT bump the topology version, or every idempotent repaint would
  // invalidate cargo paths that are still perfectly valid.
  if (outcome.changed) {
    net.revision += 1;
    world.revision += 1;
  }
  net.seenCommands[command.id] = net.revision;
  return { ok: true, revision: net.revision };
}