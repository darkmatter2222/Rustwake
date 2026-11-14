/**
 * T11 (#138): the explicit build catalog and pure placement preview.
 *
 * The catalog enumerates the placement kit (#133/#136) with the facts a player
 * needs BEFORE committing: name, footprint, cost, unlock condition and rotation
 * support. Every helper here is a pure function of (world, catalog inputs) —
 * no DOM, no wall clock, no randomness — so the UI ghost and the transaction
 * layer share one source of truth. `validatePlacement` (#133) remains the only
 * placement authority; this module only reads it.
 *
 * Unlock rules are PROTOTYPE tuning, flagged for the #148 content bump exactly
 * like the kit's crane/turret/wall_gate costs: the P1 core loop (warehouse,
 * depot, sorter, furnace, generator) is always available; the crane unlocks
 * with the audited Route Dispatch research node; defense assets (turret,
 * wall_gate) stay locked until progression grants a milestone token
 * (GAME_SYSTEMS: "Start defense only after the player unlocks and builds the
 * first defense capability"). Locked entries are never hidden — the catalog
 * prints the reason and keeps the player's selection context (U03).
 *
 * Session-only: nothing here reads or writes the save envelope (#148 owns
 * persistence of the world grid).
 */
import type { ItemStack, ResourceId } from "../content/defs";
import { resourceWord } from "../content/strings";
import { frontageDir, footprintCells, rotatedSize } from "./geometry";
import { WORLD_ASSET_IDS, WORLD_KIT, type WorldAssetId } from "./kit";
import { START_SIZE, type Cell, type Rotation, type WorldState } from "./types";
import { validatePlacement, type WorldRejection } from "./transactions";

/** Quarter-turn support: every kit asset rotates by 0/90/180/270. */
export type BuildRotationSupport = "quarter-turns";

export interface BuildUnlockRule {
  readonly kind: "always" | "research" | "milestone";
  /** Research node id required when kind === "research". */
  readonly researchNode?: string;
  /** Milestone tokens required when kind === "milestone". */
  readonly milestoneTokens?: number;
  /** Player-facing unlock description, printed verbatim on locked cards. */
  readonly label: string;
}

export interface BuildCatalogEntry {
  readonly id: WorldAssetId;
  readonly name: string;
  /** Nominal (unrotated) footprint in cells; front faces +y at rotation 0. */
  readonly footprint: { readonly w: number; readonly h: number };
  readonly cost: readonly ItemStack[];
  readonly credits: number;
  readonly constructionTicks: number;
  readonly rotation: BuildRotationSupport;
  readonly unlock: BuildUnlockRule;
  /** Loading sockets, summarized for the card (kind only, no geometry). */
  readonly sockets: readonly { readonly name: string; readonly kind: string }[];
}

const NAMES: Readonly<Record<WorldAssetId, string>> = {
  warehouse: "Warehouse",
  depot: "Depot",
  sorter: "Sorter",
  furnace: "Furnace",
  generator: "Generator",
  crane: "Crane",
  turret: "Turret",
  wall_gate: "Wall Gate",
};

const UNLOCKS: Readonly<Record<WorldAssetId, BuildUnlockRule>> = {
  warehouse: { kind: "always", label: "Available from the start" },
  depot: { kind: "always", label: "Available from the start" },
  sorter: { kind: "always", label: "Available from the start" },
  furnace: { kind: "always", label: "Available from the start" },
  generator: { kind: "always", label: "Available from the start" },
  // Prototype rule (#148): heavy logistics arrives with Route Dispatch.
  crane: { kind: "research", researchNode: "dispatch", label: "Requires Route Dispatch research" },
  // Prototype rule (#148): defense stays locked until a progression milestone.
  turret: { kind: "milestone", milestoneTokens: 1, label: "Requires a defense milestone" },
  wall_gate: { kind: "milestone", milestoneTokens: 1, label: "Requires a defense milestone" },
};

/** The catalog in kit order; one entry per placeable asset, never hidden. */
export const BUILD_CATALOG: readonly BuildCatalogEntry[] = WORLD_ASSET_IDS.map((id) => {
  const asset = WORLD_KIT[id];
  return {
    id,
    name: NAMES[id],
    footprint: { w: asset.footprint[0], h: asset.footprint[1] },
    cost: asset.buildCost.map((item) => ({ ...item })),
    credits: asset.creditCost,
    constructionTicks: asset.constructionTicks,
    rotation: "quarter-turns" as BuildRotationSupport,
    unlock: UNLOCKS[id],
    sockets: asset.sockets.map((socket) => ({ name: socket.name, kind: socket.kind })),
  };
});

export function catalogEntry(id: WorldAssetId): BuildCatalogEntry {
  const entry = BUILD_CATALOG.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`unknown catalog asset: ${id}`);
  return entry;
}

/** The progression facts an unlock rule reads. Pure data, no SimState import. */
export interface BuildUnlockContext {
  readonly research: Readonly<Record<string, number>>;
  readonly milestoneTokens: number;
}

export interface BuildUnlockStatus {
  readonly unlocked: boolean;
  /** Why the entry is locked, or null when unlocked. */
  readonly reason: string | null;
}

export function unlockStatusFor(id: WorldAssetId, ctx: BuildUnlockContext): BuildUnlockStatus {
  const rule = UNLOCKS[id];
  if (rule.kind === "always") return { unlocked: true, reason: null };
  if (rule.kind === "research") {
    const rank = ctx.research[rule.researchNode ?? ""] ?? 0;
    return rank > 0
      ? { unlocked: true, reason: null }
      : { unlocked: false, reason: rule.label };
  }
  const need = rule.milestoneTokens ?? 1;
  return ctx.milestoneTokens >= need
    ? { unlocked: true, reason: null }
    : { unlocked: false, reason: rule.label };
}

/** One missing ledger line: exact need/have, never a vague "can't afford". */
export interface BuildShortfall {
  readonly resource: ResourceId | "credits";
  readonly need: number;
  readonly have: number;
}

/**
 * Exact shortfalls against the WORLD ledger (stock + credits), in kit cost
 * order then credits. Empty when affordable. Reservation accounting is the
 * transaction layer's job: stock is already net of reservations (#133).
 */
export function buildShortfalls(w: WorldState, id: WorldAssetId): BuildShortfall[] {
  const asset = WORLD_KIT[id];
  const out: BuildShortfall[] = [];
  for (const item of asset.buildCost) {
    const have = w.stock[item.resource] ?? 0;
    if (have < item.qty) out.push({ resource: item.resource, need: item.qty, have });
  }
  if (w.credits < asset.creditCost) {
    out.push({ resource: "credits", need: asset.creditCost, have: w.credits });
  }
  return out;
}

export function canAffordBuild(w: WorldState, id: WorldAssetId): boolean {
  return buildShortfalls(w, id).length === 0;
}

/** The next quarter turn (0 -> 90 -> 180 -> 270 -> 0). */
export function rotateQuarter(rotation: Rotation): Rotation {
  return (((rotation + 90) % 360) as Rotation);
}

/**
 * Player-facing rejection text with the recovery path. Covers every
 * WorldRejection tag so no refusal can render as a silent dead end (U01/U03).
 */
export function labelForBuildReject(rejection: WorldRejection): string {
  switch (rejection.reason) {
    case "unknown-asset":
      return "Unknown building.";
    case "invalid-rotation":
      return "Invalid rotation — use quarter turns.";
    case "invalid-cell":
      return "Invalid cell coordinates.";
    case "outside-land":
      return "Outside owned land — expand the yard first.";
    case "terrain-unsupported": {
      // Name the actual ground (rough/salvage/void) so the player never reads a
      // site refusal as a cost problem — validatePlacement checks terrain first.
      const kind = rejection.terrain.charAt(0).toUpperCase() + rejection.terrain.slice(1);
      return `${kind} terrain cannot support this building — pick flat ground.`;
    }
    case "occupied":
      return "Cells already occupied — move the ghost to free ground.";
    case "keepout":
      return "Inside a crane's swing clearance — keep the disc free.";
    case "entrance-blocked":
      return `Entrance "${rejection.socket}" is blocked — clear its approach corridor.`;
    case "entrance-obstructed":
      return "Would block another building's entrance — shift the footprint.";
    case "vertical-clearance":
      return "Not enough vertical clearance for production traffic.";
    case "insufficient-material":
      return `Need ${rejection.need} ${resourceWord(rejection.resource)} (have ${rejection.have}).`;
    case "insufficient-credits":
      return `Need ${rejection.need} credits (have ${rejection.have}).`;
    case "site-not-found":
      return "Construction site no longer exists.";
    case "parcel-not-found":
      return "Unknown parcel.";
    case "already-owned":
      return "Parcel already owned.";
    case "not-contiguous":
      return "Expansion must touch owned land.";
    case "milestone-locked":
      return "Expansion requires a milestone token.";
  }
}

/** Everything the ghost paints, derived once per (world, asset, cell, rotation). */
export interface BuildGhostPreview {
  readonly asset: WorldAssetId;
  readonly cell: Cell;
  readonly rotation: Rotation;
  /** Rotated footprint size in cells. */
  readonly footprint: { readonly w: number; readonly h: number };
  /** Occupied cells, row-major (the exact cells the transaction checks). */
  readonly cells: readonly Cell[];
  /** Unit direction the front faces (orientation indicator). */
  readonly front: { readonly dx: number; readonly dy: number };
  readonly valid: boolean;
  readonly rejection: WorldRejection | null;
  /** Ready text or the exact refusal reason. */
  readonly reason: string;
  readonly shortfalls: readonly BuildShortfall[];
}

export const BUILD_READY_TEXT = "Clear to place — confirm to reserve the cost.";

/**
 * Pure ghost preview: the SAME validatePlacement the confirm transaction runs,
 * so the ghost can never promise a placement the ledger would refuse.
 */
export function previewBuildPlacement(
  w: WorldState,
  asset: WorldAssetId,
  cell: Cell,
  rotation: Rotation,
): BuildGhostPreview {
  const rejection = validatePlacement(w, asset, cell, rotation);
  const footprint = rotatedSize(WORLD_KIT[asset].footprint, rotation);
  const front = frontageDir(rotation);
  return {
    asset,
    cell,
    rotation,
    footprint: { w: footprint[0], h: footprint[1] },
    cells: footprintCells(cell, WORLD_KIT[asset].footprint, rotation),
    front: { dx: front.x, dy: front.y },
    valid: rejection === null,
    rejection,
    reason: rejection === null ? BUILD_READY_TEXT : labelForBuildReject(rejection),
    shortfalls: buildShortfalls(w, asset),
  };
}

/**
 * Cost refusals are ledger facts, not site facts. `validatePlacement` checks
 * terrain/occupancy/clearance BEFORE materials, so a cost-only rejection proves
 * the site itself is buildable — the ghost must still arm there and print the
 * exact shortfall (U03), never fall back to arbitrary (possibly rough) ground.
 */
function isCostRejection(rejection: WorldRejection): boolean {
  return (
    rejection.reason === "insufficient-material" || rejection.reason === "insufficient-credits"
  );
}

/**
 * First start-land cell (row-major) whose SITE accepts the asset at this
 * rotation — terrain, occupancy and clearance all pass — or null when the yard
 * is full. Affordability does not gate arming: when the ledger cannot pay, the
 * scan still returns the first buildable site (the only refusal there is cost)
 * so the ghost shows the exact have/need line. When the ledger CAN pay this is
 * identical to the full legal scan. Deterministic: the same world always arms
 * the same ghost.
 */
export function firstFitCell(w: WorldState, asset: WorldAssetId, rotation: Rotation): Cell | null {
  for (let y = 0; y < START_SIZE; y += 1) {
    for (let x = 0; x < START_SIZE; x += 1) {
      const cell = { x, y };
      const rejection = validatePlacement(w, asset, cell, rotation);
      if (rejection === null || isCostRejection(rejection)) return cell;
    }
  }
  return null;
}