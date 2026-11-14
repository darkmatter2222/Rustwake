/**
 * Versioned world grid state (issue #133, RW3D T06).
 *
 * The world module is the 3D placement authority: parcels, terrain, rotated
 * footprints, occupancy, crane keep-out zones and construction transactions.
 * It is deliberately separate from the audited 2D simulation core
 * (`src/game/simulation`), which stays the single economy authority and is
 * reused READ-ONLY here (content tables, quantity math, content version).
 *
 * Boundary rules (architecture README section 1): integer/fixed-point state
 * only, no DOM, no wall-clock, every transition a pure function of
 * (state, command/ticks). All geometry is integer milli-units: 1 world unit
 * (u) = 1 cell = 1000 mu, so clearance math never leaves integer space.
 *
 * Save impact in this issue: NONE. WorldState is not yet part of the save
 * envelope; the 2D -> 3D cutover (#148 T21) will attach it additively through
 * the existing optional-field seam (`run`/`branch` precedent). Untouched v1
 * saves stay byte fixed points.
 */
import type { ItemStack, ResourceId } from "../content/defs";
import { CONTENT_VERSION } from "../simulation/types";

export const WORLD_SCHEMA_VERSION = 1;

/** Integer milli-units per world unit; 1 cell = 1 u (kit.json "units"). */
export const MU_PER_UNIT = 1000;

/** P1 starts with owned 24x24 flat land (GAME_SYSTEMS "World and placement"). */
export const START_SIZE = 24;
/** Expansion buys contiguous 8x8 parcels after milestones. */
export const PARCEL_SIZE = 8;
/** The full parcel plan covers [-8, 32) on both axes: start land plus one ring. */
export const GRID_MIN = -PARCEL_SIZE;
export const GRID_MAX = START_SIZE + PARCEL_SIZE;
export const GRID_SIZE = GRID_MAX - GRID_MIN;

/**
 * The starter clear zone: a central 12x12 block the seed may never fill with
 * salvage or rough ground, so no seed produces an inaccessible starting layout
 * (GAME_SYSTEMS: "Seed determines salvage locations, not arbitrary inaccessible
 * starting layouts").
 */
export const START_CLEAR_MIN = 6;
export const START_CLEAR_MAX = 18;

/** Deterministic terrain counts (prototype tuning, content-defined). */
export const SALVAGE_DEPOSITS = 12;
export const ROUGH_CELLS = 10;

export type Rotation = 0 | 90 | 180 | 270;
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** Grid axes map to world axes: grid +x = world +X, grid +y = world +Z. */
export type TerrainKind = "flat" | "salvage" | "rough";

export interface Parcel {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  owned: boolean;
}

/** A finished building. The id is assigned at placement and never changes. */
export interface PlacedBuilding {
  readonly id: number;
  readonly asset: string;
  readonly cell: Cell;
  readonly rotation: Rotation;
  /** Absolute tick the construction settled (startTick + durationTicks). */
  readonly completedTick: number;
}

/**
 * A confirmed placement under construction. Occupies its footprint from the
 * moment material is reserved, so a second placement can never overlap it.
 */
export interface ConstructionSite {
  readonly id: number;
  readonly buildingId: number;
  readonly asset: string;
  readonly cell: Cell;
  readonly rotation: Rotation;
  readonly startTick: number;
  readonly durationTicks: number;
  /** Integer ticks of assembly work done; derived from elapsed tick. */
  progressTicks: number;
  readonly reservationId: number;
}

/**
 * The single material reservation for one site (GAME_SYSTEMS: "consume/reserve
 * materials in one ledger entry, never again on animation completion").
 * Created exactly once at placement, removed exactly once at completion or
 * cancellation.
 */
export interface MaterialReservation {
  readonly id: number;
  readonly siteId: number;
  readonly items: ItemStack[];
  readonly credits: number;
}

/**
 * Clearance mode (product ruling b on PR #188, comment 6871139430): blockout
 * accepts the wall_gate effective rest margin of 0.05 u; production requires
 * >= 0.15 u, which the current kit cannot pass until #164/#142 fix the gate
 * and truck. The mode is state, not a global, so saves carry their own rule.
 */
export type ClearanceMode = "blockout" | "production";

/**
 * Lifecycle formula version (issue #146). Move fees, dismantle refunds and
 * overflow entries are stamped with it so a later content bump (#148) can
 * migrate or re-price old purchases without double-paying refunds (E09:
 * "upgrade/refund formulas are versioned").
 */
export const LIFECYCLE_FORMULA_VERSION = 1;

/** Provenance of one overflow ledger entry; recovery never erases the source. */
export type OverflowSource = {
  readonly kind: "dismantle";
  readonly buildingId: number;
  readonly asset: string;
};

/**
 * Visible overflow cargo (GAME_SYSTEMS: "Overflow is a non-spend-duplicating
 * ledger with visible recovery, not deleted material"). Units here are real
 * cargo held outside free stock: they count in conservation
 * (stock + reserved + committed + overflow = initial stock) and can only leave
 * via `world.recall` into free stock room. Never spendable while overflowed.
 */
export interface OverflowEntry {
  readonly id: number;
  readonly resource: ResourceId;
  /** Mutable: a partial recall drains the entry in place, never duplicates. */
  qty: number;
  readonly source: OverflowSource;
  /** World tick the overflow was created. */
  readonly tick: number;
  readonly formulaVersion: number;
}

export interface WorldState {
  schemaVersion: number;
  contentVersion: number;
  /** Increments only on a successful command, mirroring the sim core. */
  revision: number;
  /** Integer simulation tick; TICK_MS 100, no wall-clock anywhere. */
  tick: number;
  readonly seed: number;
  clearanceMode: ClearanceMode;
  parcels: Parcel[];
  /** Row-major terrain over the full [GRID_MIN, GRID_MAX) plan extent. */
  terrain: TerrainKind[];
  buildings: PlacedBuilding[];
  sites: ConstructionSite[];
  reservations: MaterialReservation[];
  /** Construction material stock (integer cargo units). */
  stock: Partial<Record<ResourceId, number>>;
  credits: number;
  /**
   * Material permanently committed: embedded in completed buildings plus the
   * non-refunded share of cancelled work. The closed-system conservation law
   * is stock + reserved + committed (+ overflow, issue #146) = initial stock,
   * per resource.
   */
  committed: Partial<Record<ResourceId, number>>;
  committedCredits: number;
  /**
   * Expansion milestones granted by progression (later issue). Each parcel
   * purchase consumes one. A plain field seam, like the sim's `tutorial`.
   */
  milestoneTokens: number;
  nextBuildingId: number;
  nextSiteId: number;
  nextReservationId: number;
  seenCommands: Record<string, number>;
  /**
   * Issue #146 lifecycle seam, all optional and lazily initialized by the
   * lifecycle transactions. `createWorld` (terrain.ts) does not set them and
   * JSON.stringify omits undefined, so worlds untouched by lifecycle commands
   * keep byte-identical fingerprints (run/branch optional-field precedent).
   * Undefined capacity = unlimited stock (legacy behavior); overflow entries
   * only exist once a capacity is declared and a refund cannot fit.
   */
  storageCapacity?: number;
  overflow?: OverflowEntry[];
  nextOverflowId?: number;
}

export { CONTENT_VERSION };