/**
 * Atomic world transactions (issue #133, lifecycle extension issue #146).
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
 * Lifecycle commands (#146) follow the SAME pattern:
 * - world.move: re-runs the full placement law with the moving building
 *   excluded from occupancy/keep-out/entrance checks, charges a service fee
 *   (ceil 10% of build cost per material) stock -> committed, and repositions
 *   the building preserving its id and completedTick.
 * - world.dismantle: completed buildings only (sites use world.cancel).
 *   Refunds floor 80% of build materials committed -> stock; whatever does
 *   not fit free storage goes to the visible overflow ledger, never deleted.
 *   The non-refunded share stays committed (lost, listed in the preview).
 * - world.recall: drains overflow entries back into free stock room, exactly
 *   once per unit, optionally filtered by source building. Never duplicates.
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
import {
  LIFECYCLE_FORMULA_VERSION,
  type Cell,
  type ConstructionSite,
  type OverflowEntry,
  type PlacedBuilding,
  type Rotation,
  type WorldState,
} from "./types";

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
  | { reason: "milestone-locked"; parcelId: number }
  | { reason: "building-not-found"; buildingId: number }
  | { reason: "under-construction"; buildingId: number; siteId: number }
  | { reason: "same-position"; buildingId: number };

export type WorldCommand =
  | { id: string; type: "world.place"; asset: string; cell: Cell; rotation: number }
  | { id: string; type: "world.cancel"; siteId: number }
  | { id: string; type: "world.expand"; parcelId: number }
  | { id: string; type: "world.move"; buildingId: number; cell: Cell; rotation: number }
  | { id: string; type: "world.dismantle"; buildingId: number }
  | { id: string; type: "world.recall"; buildingId?: number };

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

/**
 * Lifecycle percentages (GAME_SYSTEMS "Buildings and lifecycle", issue #146).
 * Move: 10% of the ORIGINAL build cost, rounded UP per material, charged as a
 * service sink (stock -> committed). The first-teaching-placement waiver is a
 * tutorial-system concern and is not modeled in the world yet (follow-up).
 * Dismantle: 80% of build materials refunded, rounded DOWN per material;
 * credits are not refunded (the spec refunds materials only).
 * Costs are read dynamically from the kit/defs at call time, never hardcoded,
 * so the #214 economy retune applies without code changes here.
 */
export const MOVE_FEE_PCT = 10;
export const DISMANTLE_REFUND_PCT = 80;

interface Occupant {
  readonly id: number;
  readonly asset: string;
  readonly cell: Cell;
  readonly rotation: Rotation;
  readonly cells: Cell[];
}

function occupants(w: WorldState, excludeBuildingId?: number): Occupant[] {
  const list: Occupant[] = [];
  for (const b of w.buildings) {
    if (b.id === excludeBuildingId) continue;
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
 * The geometry half of the placement law, shared by place and move (#146).
 * `excludeBuildingId` removes one completed building from occupancy, keep-out
 * and entrance checks (a move must not collide with its own footprint); sites
 * are never excluded. Order is fixed: asset -> rotation -> cell -> land ->
 * terrain -> occupancy -> keep-out -> entrances -> entrance obstruction ->
 * vertical clearance.
 */
function validatePlacementGeometry(
  w: WorldState,
  assetId: string,
  cell: Cell,
  rotation: number,
  excludeBuildingId?: number,
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

  const others = occupants(w, excludeBuildingId);
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
        // A move keeps the building's id; a fresh placement gets the next one.
        const craneId = excludeBuildingId ?? w.nextBuildingId;
        if (hit.length > 0) return { reason: "keepout", craneId, cells: hit };
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
  return null;
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
  const geometry = validatePlacementGeometry(w, assetId, cell, rotation);
  if (geometry !== null) return geometry;
  const asset: KitAsset = WORLD_KIT[assetId as WorldAssetId];
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

// ---------------------------------------------------------------------------
// Lifecycle transactions (issue #146): move, dismantle, cargo recall.
// Same atomic validate -> commit pattern; previews are pure and share their
// arithmetic with the executors so what is shown is exactly what is charged.
// ---------------------------------------------------------------------------

/** Move service fee per material: ceil(pct% of the current kit build cost). */
export function moveFeeOf(assetId: WorldAssetId): ItemStack[] {
  return WORLD_KIT[assetId].buildCost.map((item) => ({
    resource: item.resource,
    qty: Math.ceil((item.qty * MOVE_FEE_PCT) / 100),
  }));
}

/** Dismantle refund per material: floor(pct% of the current kit build cost). */
export function dismantleRefundOf(assetId: WorldAssetId): ItemStack[] {
  return WORLD_KIT[assetId].buildCost.map((item) => ({
    resource: item.resource,
    qty: Math.floor((item.qty * DISMANTLE_REFUND_PCT) / 100),
  }));
}

/** Total free-stock units across all resources (integer cargo units). */
export function stockUnits(w: WorldState): number {
  let total = 0;
  for (const key of Object.keys(w.stock) as ResourceId[]) total += w.stock[key] ?? 0;
  return total;
}

/**
 * Free storage room. Undefined capacity = unlimited (legacy worlds created
 * before #146); MAX_SAFE_INTEGER keeps the arithmetic in integer space.
 */
function freeRoom(w: WorldState): number {
  if (w.storageCapacity === undefined) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, w.storageCapacity - stockUnits(w));
}

/**
 * Pure refund split used by BOTH preview and commit: fill free stock room in
 * build-cost order, the remainder becomes visible overflow. Never deletes or
 * duplicates a unit.
 */
function splitRefund(
  w: WorldState,
  refund: ItemStack[],
): { toStock: ItemStack[]; toOverflow: ItemStack[] } {
  let room = freeRoom(w);
  const toStock: ItemStack[] = [];
  const toOverflow: ItemStack[] = [];
  for (const item of refund) {
    const intoStock = Math.min(item.qty, room);
    room -= intoStock;
    if (intoStock > 0) toStock.push({ resource: item.resource, qty: intoStock });
    if (item.qty - intoStock > 0) toOverflow.push({ resource: item.resource, qty: item.qty - intoStock });
  }
  return { toStock, toOverflow };
}

/** One overflow entry's recall plan; `recovered` units move overflow -> stock. */
export interface RecallPlanEntry {
  readonly id: number;
  readonly resource: ResourceId;
  readonly qty: number;
  readonly recovered: number;
}

/** Pure recall plan shared by preview and commit (id order, room in order). */
function planRecall(w: WorldState, buildingId?: number): RecallPlanEntry[] {
  let room = freeRoom(w);
  const plan: RecallPlanEntry[] = [];
  for (const entry of w.overflow ?? []) {
    if (buildingId !== undefined && entry.source.buildingId !== buildingId) continue;
    const recovered = Math.min(entry.qty, room);
    room -= recovered;
    plan.push({ id: entry.id, resource: entry.resource, qty: entry.qty, recovered });
  }
  return plan;
}

/**
 * Pure move validation (#146): lookup -> same-position -> the full placement
 * law with the moving building excluded -> fee affordability. A building under
 * construction must be cancelled (world.cancel), not moved.
 */
export function validateMove(
  w: WorldState,
  buildingId: number,
  cell: Cell,
  rotation: number,
): WorldRejection | null {
  const site = w.sites.find((s) => s.buildingId === buildingId);
  if (site !== undefined) return { reason: "under-construction", buildingId, siteId: site.id };
  const building = w.buildings.find((b) => b.id === buildingId);
  if (building === undefined) return { reason: "building-not-found", buildingId };
  if (building.cell.x === cell.x && building.cell.y === cell.y && building.rotation === rotation) {
    return { reason: "same-position", buildingId };
  }
  const geometry = validatePlacementGeometry(w, building.asset, cell, rotation, buildingId);
  if (geometry !== null) return geometry;
  for (const item of moveFeeOf(building.asset as WorldAssetId)) {
    const have = w.stock[item.resource] ?? 0;
    if (have < item.qty) {
      return { reason: "insufficient-material", resource: item.resource, need: item.qty, have };
    }
  }
  return null;
}

/** Pure dismantle validation: completed buildings only, never sites. */
export function validateDismantle(w: WorldState, buildingId: number): WorldRejection | null {
  const site = w.sites.find((s) => s.buildingId === buildingId);
  if (site !== undefined) return { reason: "under-construction", buildingId, siteId: site.id };
  const building = w.buildings.find((b) => b.id === buildingId);
  if (building === undefined) return { reason: "building-not-found", buildingId };
  return null;
}

export interface MovePreview {
  readonly buildingId: number;
  readonly asset: string | null;
  readonly rejection: WorldRejection | null;
  /** Service charge per material (stock -> committed) on success. */
  readonly fee: ItemStack[];
  readonly formulaVersion: number;
}

export interface DismantlePreview {
  readonly buildingId: number;
  readonly asset: string | null;
  readonly rejection: WorldRejection | null;
  /** Materials returned (committed -> stock/overflow), floor pct per item. */
  readonly refund: ItemStack[];
  /** Non-refunded share permanently lost; listed before confirmation. */
  readonly lost: ItemStack[];
  /** Exact split at current free room: into stock vs into overflow. */
  readonly toStock: ItemStack[];
  readonly toOverflow: ItemStack[];
  readonly formulaVersion: number;
}

export interface RecallPreview {
  readonly buildingId: number | null;
  readonly entries: RecallPlanEntry[];
  readonly recoveredUnits: number;
  readonly remainingOverflowUnits: number;
}

/** Pure move preview: fee and validity BEFORE any commit (issue #146). */
export function previewMove(
  w: WorldState,
  buildingId: number,
  cell: Cell,
  rotation: number,
): MovePreview {
  const rejection = validateMove(w, buildingId, cell, rotation);
  const building = w.buildings.find((b) => b.id === buildingId);
  return {
    buildingId,
    asset: building?.asset ?? null,
    rejection,
    fee: building !== undefined ? moveFeeOf(building.asset as WorldAssetId) : [],
    formulaVersion: LIFECYCLE_FORMULA_VERSION,
  };
}

/** Pure dismantle preview: refund, lost share and overflow split BEFORE commit. */
export function previewDismantle(w: WorldState, buildingId: number): DismantlePreview {
  const rejection = validateDismantle(w, buildingId);
  const building = w.buildings.find((b) => b.id === buildingId);
  if (building === undefined) {
    return {
      buildingId,
      asset: null,
      rejection,
      refund: [],
      lost: [],
      toStock: [],
      toOverflow: [],
      formulaVersion: LIFECYCLE_FORMULA_VERSION,
    };
  }
  const cost = WORLD_KIT[building.asset as WorldAssetId].buildCost;
  const refund = dismantleRefundOf(building.asset as WorldAssetId);
  const lost = cost.map((item, i) => ({ resource: item.resource, qty: item.qty - refund[i].qty }));
  const split = splitRefund(w, refund);
  return {
    buildingId,
    asset: building.asset,
    rejection,
    refund,
    lost,
    toStock: split.toStock,
    toOverflow: split.toOverflow,
    formulaVersion: LIFECYCLE_FORMULA_VERSION,
  };
}

/** Pure recall preview: exactly which overflow units return to free stock. */
export function previewRecall(w: WorldState, buildingId?: number): RecallPreview {
  const entries = planRecall(w, buildingId);
  let recoveredUnits = 0;
  let remainingOverflowUnits = 0;
  for (const e of entries) {
    recoveredUnits += e.recovered;
    remainingOverflowUnits += e.qty - e.recovered;
  }
  return { buildingId: buildingId ?? null, entries, recoveredUnits, remainingOverflowUnits };
}

function executeMove(w: WorldState, cmd: Extract<WorldCommand, { type: "world.move" }>): WorldCommandResult {
  const rejection = validateMove(w, cmd.buildingId, cmd.cell, cmd.rotation);
  if (rejection !== null) return { ok: false, rejection };
  // Past this point every check passed; mutations are total and cannot fail.
  const building = w.buildings.find((b) => b.id === cmd.buildingId) as PlacedBuilding;
  for (const item of moveFeeOf(building.asset as WorldAssetId)) {
    if (item.qty === 0) continue;
    w.stock[item.resource] = (w.stock[item.resource] ?? 0) - item.qty;
    addToCommitted(w, item.resource, item.qty); // service sink, like expansion
  }
  const rotation = cmd.rotation as Rotation;
  // Preserve id, asset and completedTick; only position/orientation change.
  w.buildings = w.buildings.map((b) =>
    b.id === building.id
      ? { id: b.id, asset: b.asset, cell: { x: cmd.cell.x, y: cmd.cell.y }, rotation, completedTick: b.completedTick }
      : b,
  );
  return { ok: true, revision: w.revision + 1 };
}

function pushOverflow(w: WorldState, item: ItemStack, building: PlacedBuilding): void {
  if (item.qty <= 0) return;
  if (w.overflow === undefined) w.overflow = [];
  const id = w.nextOverflowId ?? 1;
  w.nextOverflowId = id + 1;
  const entry: OverflowEntry = {
    id,
    resource: item.resource,
    qty: item.qty,
    source: { kind: "dismantle", buildingId: building.id, asset: building.asset },
    tick: w.tick,
    formulaVersion: LIFECYCLE_FORMULA_VERSION,
  };
  w.overflow.push(entry);
}

function executeDismantle(w: WorldState, cmd: Extract<WorldCommand, { type: "world.dismantle" }>): WorldCommandResult {
  const rejection = validateDismantle(w, cmd.buildingId);
  if (rejection !== null) return { ok: false, rejection };
  const building = w.buildings.find((b) => b.id === cmd.buildingId) as PlacedBuilding;
  const refund = dismantleRefundOf(building.asset as WorldAssetId);
  const split = splitRefund(w, refund);
  // The refunded share leaves committed exactly once; the lost share stays.
  for (const item of refund) {
    w.committed[item.resource] = (w.committed[item.resource] ?? 0) - item.qty;
  }
  for (const item of split.toStock) addToStock(w, item.resource, item.qty);
  for (const item of split.toOverflow) pushOverflow(w, item, building);
  w.buildings = w.buildings.filter((b) => b.id !== building.id);
  return { ok: true, revision: w.revision + 1 };
}

function executeRecall(w: WorldState, cmd: Extract<WorldCommand, { type: "world.recall" }>): WorldCommandResult {
  // Recall moves overflow -> free stock only; it has no failure mode. A recall
  // with nothing to recover is a successful no-op (still idempotent by id).
  const plan = planRecall(w, cmd.buildingId);
  const recoveredById = new Map<number, number>();
  for (const p of plan) recoveredById.set(p.id, p.recovered);
  for (const entry of w.overflow ?? []) {
    const recovered = recoveredById.get(entry.id) ?? 0;
    if (recovered > 0) {
      entry.qty -= recovered;
      addToStock(w, entry.resource, recovered);
    }
  }
  if (w.overflow !== undefined) w.overflow = w.overflow.filter((e) => e.qty > 0);
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
    case "world.move":
      result = executeMove(w, command);
      break;
    case "world.dismantle":
      result = executeDismantle(w, command);
      break;
    case "world.recall":
      result = executeRecall(w, command);
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