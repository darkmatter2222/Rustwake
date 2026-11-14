/**
 * Atomic world transactions (issue #133).
 *
 * Every command runs validate -> reserve -> commit with ALL validation pure
 * and complete before the first mutation: a rejected command leaves the state
 * byte-identical (structural atomicity, verified by fingerprint tests).
 *
 * Material is reserved exactly once at placement (stock -> reservation),
 * never again at completion (reservation -> committed) or cancellation
 * (refund + committed). Credits use the same ledger shape, kept separate
 * from cargo quantities (architecture README section 1).
 *
 * Rejections are a stable discriminated union: UI and tests match on the
 * `reason` tag, never on prose. Validation order is fixed and deterministic:
 * asset -> rotation -> cell -> land -> terrain -> occupancy -> keep-out ->
 * entrances -> entrance obstruction -> vertical clearance -> materials ->
 * credits.
 */
import type { ItemStack, ResourceId } from "../content/defs";
import { checksum } from "../persistence/save";
import {
  cellKey,
  cellRectMu,
  entranceCorridor,
  footprintCells,
  isRotation,
  rectCellsMu,
  rectIntersectsDisc,
  rectsIntersect,
  centerMu,
} from "./geometry";
import {
  GATE_EFFECTIVE_MARGIN_MU,
  PRODUCTION_MIN_MARGIN_MU,
  WORLD_KIT,
  buildCostOf,
  isWorldAssetId,
  type KitAsset,
  type WorldAssetId,
} from "./kit";
import { cellOwned, terrainAt } from "./terrain";
import type { Cell, ConstructionSite, Rotation, WorldState } from "./types";

/** Stable, typed rejection reasons. Tags are API; payloads carry recovery data. */
export type WorldRejection =
  | { reason: "unknown-asset"; asset: string }
  | { reason: "invalid-rotation"; rotation: number }
  | { reason: "invalid-cell"; cell: Cell }
  | { reason: "outside-land"; cells: Cell[] }
  | { reason: "terrain-unsupported"; cells: Cell[]; terrain: string }
  | { reason: "occupied"; cells: Cell[]; occupantId: number }
  | { reason: "keepout"; craneId: number; cells: Cell[] }
  | {
      reason: "entrance-blocked";
      socket: string;
      blocker: "land" | "terrain" | "occupancy" | "keepout";
      cells: Cell[];
    }
  | { reason: "entrance-obstructed"; ownerId: number; socket: string; cells: Cell[] }
  | { reason: "vertical-clearance"; asset: WorldAssetId; effectiveMu: number; requiredMu: number }
  | { reason: "insufficient-material"; resource: ResourceId; need: number; have: number }
  | { reason: "insufficient-credits"; need: number; have: number }
  | { reason: "site-not-found"; siteId: number }
  | { reason: "parcel-not-found"; parcelId: number }
  | { reason: "already-owned"; parcelId: number }
  | { reason: "not-contiguous"; parcelId: number }
  | { reason: "milestone-locked"; parcelId: number };

export type WorldCommand =
  | { id: string; type: "world.place"; asset: string; cell: Cell; rotation: number }
  | { id: string; type: "world.cancel"; siteId: number }
  | { id: string; type: "world.expand"; parcelId: number };

export type WorldCommandResult =
  | { ok: true; revision: number }
  | { ok: false; rejection: WorldRejection };

/**
 * Expansion parcel price. Prototype tuning default: GAME_SYSTEMS requires
 * scrap + credits after a milestone but does not author the numbers yet
 * (#148 content bump). Milestone tokens are granted by progression later.
 */
export const PARCEL_COST: ItemStack[] = [{ resource: "scrap", qty: 30 }];
export const PARCEL_CREDIT_COST = 25;
export const PARCEL_MILESTONE_COST = 1;

/** Cancel refunds: 100% before any work, 90% after (GAME_SYSTEMS). */
export const CANCEL_REFUND_BEFORE_PCT = 100;
export const CANCEL_REFUND_STARTED_PCT = 90;

interface Occupant {
  readonly id: number;
  readonly asset: string;
  readonly cell: Cell;
  readonly rotation: Rotation;
  readonly cells: Cell[];
}

function occupants(w: WorldState): Occupant[] {
  const list: Occupant[] = [];
  for (const b of w.buildings) {
    list.push({
      id: b.id,
      asset: b.asset,
      cell: b.cell,
      rotation: b.rotation,
      cells: footprintCells(b.cell, WORLD_KIT[b.asset as WorldAssetId].footprint, b.rotation),
    });
  }
  for (const s of w.sites) {
    list.push({
      id: s.id,
      asset: s.asset,
      cell: s.cell,
      rotation: s.rotation,
      cells: footprintCells(s.cell, WORLD_KIT[s.asset as WorldAssetId].footprint, s.rotation),
    });
  }
  return list;
}

/** Crane keep-out discs of every placed crane (buildings and sites). */
function craneDiscs(list: Occupant[]): { id: number; cx: number; cz: number; r: number }[] {
  const discs: { id: number; cx: number; cz: number; r: number }[] = [];
  for (const o of list) {
    if (o.asset !== "crane") continue;
    const r = WORLD_KIT.crane.keepoutRadiusMu;
    if (r === undefined) continue;
    const [cx, cz] = centerMu(o.cell, WORLD_KIT.crane.footprint, o.rotation);
    discs.push({ id: o.id, cx, cz, r });
  }
  return discs;
}

/**
 * Pure placement validation. Returns the first rejection in the fixed order,
 * or null when the placement is legal. Exported so the UI (#138) can preview
 * validity without touching state.
 */
export function validatePlacement(
  w: WorldState,
  assetId: string,
  cell: Cell,
  rotation: number,
): WorldRejection | null {
  if (!isWorldAssetId(assetId)) return { reason: "unknown-asset", asset: assetId };
  if (!isRotation(rotation)) return { reason: "invalid-rotation", rotation };
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    return { reason: "invalid-cell", cell };
  }
  const asset: KitAsset = WORLD_KIT[assetId];
  const cells = footprintCells(cell, asset.footprint, rotation);

  const unowned = cells.filter((c) => !cellOwned(w, c.x, c.y));
  if (unowned.length > 0) return { reason: "outside-land", cells: unowned };

  for (const c of cells) {
    const kind = terrainAt(w, c.x, c.y);
    if (kind !== "flat") {
      return { reason: "terrain-unsupported", cells: [c], terrain: kind ?? "void" };
    }
  }

  const others = occupants(w);
  const byCell = new Map<string, Occupant>();
  for (const o of others) {
    for (const c of o.cells) byCell.set(cellKey(c), o);
  }
  for (const c of cells) {
    const hit = byCell.get(cellKey(c));
    if (hit !== undefined) {
      return { reason: "occupied", cells: [c], occupantId: hit.id };
    }
  }

  // Keep-out: crane swing is clearance, never occupancy. Candidate footprint
  // cells must stay out of every existing crane disc; a candidate crane must
  // keep every existing footprint out of its own disc.
  const discs = craneDiscs(others);
  for (const disc of discs) {
    const hit = cells.filter((c) => rectIntersectsDisc(cellRectMu(c), disc.cx, disc.cz, disc.r));
    if (hit.length > 0) return { reason: "keepout", craneId: disc.id, cells: hit };
  }
  if (assetId === "crane") {
    const r = asset.keepoutRadiusMu;
    if (r !== undefined) {
      const [cx, cz] = centerMu(cell, asset.footprint, rotation);
      for (const o of others) {
        const hit = o.cells.filter((c) => rectIntersectsDisc(cellRectMu(c), cx, cz, r));
        if (hit.length > 0) return { reason: "keepout", craneId: w.nextBuildingId, cells: hit };
      }
    }
  }

  // Entrance corridors: owned, flat, unoccupied, outside every crane disc.
  for (const socket of asset.sockets) {
    const corridor = entranceCorridor(asset, cell, rotation, socket);
    const corridorCells = rectCellsMu(corridor);
    const offLand = corridorCells.filter((c) => !cellOwned(w, c.x, c.y));
    if (offLand.length > 0) {
      return { reason: "entrance-blocked", socket: socket.name, blocker: "land", cells: offLand };
    }
    for (const c of corridorCells) {
      const kind = terrainAt(w, c.x, c.y);
      if (kind !== "flat") {
        return {
          reason: "entrance-blocked",
          socket: socket.name,
          blocker: "terrain",
          cells: [c],
        };
      }
    }
    for (const c of corridorCells) {
      const hit = byCell.get(cellKey(c));
      if (hit !== undefined) {
        return {
          reason: "entrance-blocked",
          socket: socket.name,
          blocker: "occupancy",
          cells: [c],
        };
      }
    }
    for (const disc of discs) {
      if (rectIntersectsDisc(corridor, disc.cx, disc.cz, disc.r)) {
        const hit = corridorCells.filter((c) =>
          rectIntersectsDisc(cellRectMu(c), disc.cx, disc.cz, disc.r),
        );
        return {
          reason: "entrance-blocked",
          socket: socket.name,
          blocker: "keepout",
          cells: hit.length > 0 ? hit : corridorCells,
        };
      }
    }
  }

  // Symmetric clearance: the candidate must not obstruct any EXISTING
  // entrance corridor, with its footprint or (if a crane) its swing disc.
  // Corridors are keep-clear zones, not occupancy: two corridors may overlap
  // (shared road), but no footprint or swing may enter one.
  const candidateRects = cells.map(cellRectMu);
  const candidateDisc =
    assetId === "crane" && asset.keepoutRadiusMu !== undefined
      ? { cx: centerMu(cell, asset.footprint, rotation)[0], cz: centerMu(cell, asset.footprint, rotation)[1], r: asset.keepoutRadiusMu }
      : null;
  for (const o of others) {
    const oAsset = WORLD_KIT[o.asset as WorldAssetId];
    for (const socket of oAsset.sockets) {
      const corridor = entranceCorridor(oAsset, o.cell, o.rotation, socket);
      const hitCells = cells.filter((_, i) => rectsIntersect(candidateRects[i], corridor));
      if (hitCells.length > 0) {
        return { reason: "entrance-obstructed", ownerId: o.id, socket: socket.name, cells: hitCells };
      }
      if (candidateDisc !== null && rectIntersectsDisc(corridor, candidateDisc.cx, candidateDisc.cz, candidateDisc.r)) {
        const hit = rectCellsMu(corridor).filter((c) =>
          rectIntersectsDisc(cellRectMu(c), candidateDisc.cx, candidateDisc.cz, candidateDisc.r),
        );
        return {
          reason: "entrance-obstructed",
          ownerId: o.id,
          socket: socket.name,
          cells: hit.length > 0 ? hit : cells,
        };
      }
    }
  }

  // Vertical clearance: production mode enforces the >= 0.15 u rest margin.
  if (assetId === "wall_gate" && w.clearanceMode === "production") {
    if (GATE_EFFECTIVE_MARGIN_MU < PRODUCTION_MIN_MARGIN_MU) {
      return {
        reason: "vertical-clearance",
        asset: assetId,
        effectiveMu: GATE_EFFECTIVE_MARGIN_MU,
        requiredMu: PRODUCTION_MIN_MARGIN_MU,
      };
    }
  }

  for (const item of asset.buildCost) {
    const have = w.stock[item.resource] ?? 0;
    if (have < item.qty) {
      return { reason: "insufficient-material", resource: item.resource, need: item.qty, have };
    }
  }
  if (w.credits < asset.creditCost) {
    return { reason: "insufficient-credits", need: asset.creditCost, have: w.credits };
  }
  return null;
}

function addToStock(w: WorldState, resource: ResourceId, qty: number): void {
  w.stock[resource] = (w.stock[resource] ?? 0) + qty;
}

function addToCommitted(w: WorldState, resource: ResourceId, qty: number): void {
  if (qty === 0) return;
  w.committed[resource] = (w.committed[resource] ?? 0) + qty;
}

function executePlace(w: WorldState, cmd: Extract<WorldCommand, { type: "world.place" }>): WorldCommandResult {
  const rejection = validatePlacement(w, cmd.asset, cmd.cell, cmd.rotation);
  if (rejection !== null) return { ok: false, rejection };
  // Past this point every check passed; mutations are total and cannot fail.
  const asset = WORLD_KIT[cmd.asset as WorldAssetId];
  const rotation = cmd.rotation as Rotation;
  for (const item of asset.buildCost) {
    w.stock[item.resource] = (w.stock[item.resource] ?? 0) - item.qty;
  }
  w.credits -= asset.creditCost;

  const siteId = w.nextSiteId;
  const reservationId = w.nextReservationId;
  const buildingId = w.nextBuildingId;
  w.nextSiteId += 1;
  w.nextReservationId += 1;
  w.nextBuildingId += 1;

  w.reservations.push({
    id: reservationId,
    siteId,
    items: buildCostOf(asset.id),
    credits: asset.creditCost,
  });
  const site: ConstructionSite = {
    id: siteId,
    buildingId,
    asset: asset.id,
    cell: { x: cmd.cell.x, y: cmd.cell.y },
    rotation,
    startTick: w.tick,
    durationTicks: asset.constructionTicks,
    progressTicks: 0,
    reservationId,
  };
  w.sites.push(site);
  return { ok: true, revision: w.revision + 1 };
}

function executeCancel(w: WorldState, cmd: Extract<WorldCommand, { type: "world.cancel" }>): WorldCommandResult {
  const site = w.sites.find((s) => s.id === cmd.siteId);
  if (site === undefined) return { ok: false, rejection: { reason: "site-not-found", siteId: cmd.siteId } };
  const reservation = w.reservations.find((r) => r.id === site.reservationId);
  // Structural invariant: a live site always owns exactly one reservation.
  if (reservation === undefined) {
    return { ok: false, rejection: { reason: "site-not-found", siteId: cmd.siteId } };
  }
  const pct = site.progressTicks === 0 ? CANCEL_REFUND_BEFORE_PCT : CANCEL_REFUND_STARTED_PCT;
  for (const item of reservation.items) {
    const refund = Math.floor((item.qty * pct) / 100);
    addToStock(w, item.resource, refund);
    addToCommitted(w, item.resource, item.qty - refund);
  }
  const creditRefund = Math.floor((reservation.credits * pct) / 100);
  w.credits += creditRefund;
  w.committedCredits += reservation.credits - creditRefund;
  w.reservations = w.reservations.filter((r) => r.id !== reservation.id);
  w.sites = w.sites.filter((s) => s.id !== site.id);
  return { ok: true, revision: w.revision + 1 };
}

function parcelsShareEdge(a: { x: number; y: number; size: number }, b: { x: number; y: number; size: number }): boolean {
  const yOverlap = Math.min(a.y + a.size, b.y + b.size) - Math.max(a.y, b.y);
  const xOverlap = Math.min(a.x + a.size, b.x + b.size) - Math.max(a.x, b.x);
  const verticalTouch = (a.x + a.size === b.x || b.x + b.size === a.x) && yOverlap > 0;
  const horizontalTouch = (a.y + a.size === b.y || b.y + b.size === a.y) && xOverlap > 0;
  return verticalTouch || horizontalTouch;
}

function executeExpand(w: WorldState, cmd: Extract<WorldCommand, { type: "world.expand" }>): WorldCommandResult {
  const parcel = w.parcels.find((p) => p.id === cmd.parcelId);
  if (parcel === undefined) return { ok: false, rejection: { reason: "parcel-not-found", parcelId: cmd.parcelId } };
  if (parcel.owned) return { ok: false, rejection: { reason: "already-owned", parcelId: parcel.id } };
  const contiguous = w.parcels.some((p) => p.owned && parcelsShareEdge(p, parcel));
  if (!contiguous) return { ok: false, rejection: { reason: "not-contiguous", parcelId: parcel.id } };
  if (w.milestoneTokens < PARCEL_MILESTONE_COST) {
    return { ok: false, rejection: { reason: "milestone-locked", parcelId: parcel.id } };
  }
  for (const item of PARCEL_COST) {
    const have = w.stock[item.resource] ?? 0;
    if (have < item.qty) {
      return { ok: false, rejection: { reason: "insufficient-material", resource: item.resource, need: item.qty, have } };
    }
  }
  if (w.credits < PARCEL_CREDIT_COST) {
    return { ok: false, rejection: { reason: "insufficient-credits", need: PARCEL_CREDIT_COST, have: w.credits } };
  }
  for (const item of PARCEL_COST) {
    w.stock[item.resource] = (w.stock[item.resource] ?? 0) - item.qty;
    addToCommitted(w, item.resource, item.qty);
  }
  w.credits -= PARCEL_CREDIT_COST;
  w.committedCredits += PARCEL_CREDIT_COST;
  w.milestoneTokens -= PARCEL_MILESTONE_COST;
  parcel.owned = true;
  return { ok: true, revision: w.revision + 1 };
}

/**
 * Apply a world command. Idempotent by command id, mirroring the sim core's
 * applyCommand: a replayed id returns the original revision without charging
 * or mutating anything (acceptance E02). Revision increments only on success.
 */
export function applyWorldCommand(w: WorldState, command: WorldCommand): WorldCommandResult {
  const seen = w.seenCommands[command.id];
  if (seen !== undefined) return { ok: true, revision: seen };
  let result: WorldCommandResult;
  switch (command.type) {
    case "world.place":
      result = executePlace(w, command);
      break;
    case "world.cancel":
      result = executeCancel(w, command);
      break;
    case "world.expand":
      result = executeExpand(w, command);
      break;
  }
  if (result.ok) {
    w.revision += 1;
    w.seenCommands[command.id] = w.revision;
  }
  return result;
}

/**
 * Deterministic fingerprint of the full state (FNV-1a over canonical JSON,
 * reusing the persistence checksum read-only). Used by tests to prove that a
 * rejected command leaves the state byte-identical.
 */
export function worldFingerprint(w: WorldState): string {
  return checksum(JSON.stringify(w));
}