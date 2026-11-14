/**
 * Placement kit table for the world grid (issue #133).
 *
 * Geometry is transcribed from `docs/vision/assets/kit.json` (T04, PR #190)
 * and verified against the generated glTF by tests/game/world/kit-parity.test.ts.
 * The table is embedded so the simulation never reads docs at runtime; the
 * parity test is the guard against drift.
 *
 * Costs:
 *  - sorter/furnace reuse the audited v1 content tables (BLUEPRINTS) read-only.
 *    The GAME_SYSTEMS P1 table lists different numbers (sorter 30 scrap etc.);
 *    those belong to the #148 content-version bump and must not silently
 *    reprice the v1 economy here (architecture README section 2/3).
 *  - warehouse/depot/generator use the GAME_SYSTEMS P1 expansion cost table.
 *  - crane/turret/wall_gate have no authored cost yet; the values below are
 *    prototype tuning defaults, flagged for #148.
 *
 * Vehicles (truck, forklift, drone) and the worker are entities, not placed
 * assets; they are excluded from the placement kit.
 */
import { BLUEPRINTS, type ItemStack, type ResourceId } from "../content/defs";
import { isqrt } from "../economy/quantity";
import { MU_PER_UNIT } from "./types";

export type WorldAssetId =
  | "warehouse"
  | "depot"
  | "sorter"
  | "furnace"
  | "generator"
  | "crane"
  | "turret"
  | "wall_gate";

export type SocketKind = "truck" | "pallet" | "belt" | "cargo" | "road";

export interface KitSocket {
  readonly name: string;
  /** Local socket position in integer mu, footprint-center origin, front +Z. */
  readonly x: number;
  readonly z: number;
  readonly kind: SocketKind;
  /** Nominal approach clearance width in integer mu (kit.json). */
  readonly clearanceWidth: number;
}

export interface KitAsset {
  readonly id: WorldAssetId;
  /** Nominal footprint [width, depth] in cells; front faces +Z at rotation 0. */
  readonly footprint: readonly [number, number];
  readonly sockets: readonly KitSocket[];
  readonly buildCost: readonly ItemStack[];
  readonly creditCost: number;
  /** P1 assembly duration: 5 simulated seconds for every asset (GAME_SYSTEMS). */
  readonly constructionTicks: number;
  /**
   * Crane keep-out disc radius in integer mu. The swing is CLEARANCE, never
   * occupancy (binding ruling, PR #188 comment 6871139430): the footprint
   * stays 3x3 while the swept boom keeps other footprints and entrance
   * corridors out of the disc. Derived from the authored boom corner
   * (2.5 u, 0.2 u) at the slew axis: ceil(sqrt(2500^2 + 200^2)) = 2508 mu.
   */
  readonly keepoutRadiusMu?: number;
}

/**
 * Crane boom geometry from kit.json (crane boom: center [1, 2, 0], size
 * [3, 0.3, 0.4], parent slew at the footprint axis). The far corner sweeps
 * x = 2.5 u, z = 0.2 u about the slew axis.
 */
const CRANE_BOOM_REACH_MU = 2500;
const CRANE_BOOM_HALF_WIDTH_MU = 200;
const CRANE_SWING_SQUARED =
  CRANE_BOOM_REACH_MU * CRANE_BOOM_REACH_MU +
  CRANE_BOOM_HALF_WIDTH_MU * CRANE_BOOM_HALF_WIDTH_MU;
const craneRadiusFloor = isqrt(CRANE_SWING_SQUARED);
/** Integer ceil(sqrt(2500^2 + 200^2)); 2508^2 = 6290064 exactly. */
export const CRANE_SWING_RADIUS_MU =
  craneRadiusFloor * craneRadiusFloor === CRANE_SWING_SQUARED
    ? craneRadiusFloor
    : craneRadiusFloor + 1;

/**
 * Authored overhangs (binding ruling: clearance uses max(nominal, actual)).
 * Truck wheel groups sit at x = +/-0.5 u with 0.18 u wide meshes, so the
 * wheel-inclusive width is 2 * (500 + 90) = 1180 mu > nominal 1000 mu.
 */
export const TRUCK_ACTUAL_WIDTH_MU = 1180;
/**
 * Truck height above ground: cab top 1.30 u minus the blockout wheel-bottom
 * float of 0.05 u = 1.25 u (T04 evidence). The float is real geometry, not a
 * rounding artifact.
 */
export const TRUCK_HEIGHT_MU = 1250;
export const TRUCK_GROUND_FLOAT_MU = 50;
/**
 * wall_gate open clearance: the gate_open animation lifts the panel group to
 * y = 2.0 u; the panel is 1.3 u tall, so the open underside is 1.35 u.
 */
export const GATE_OPEN_CLEAR_MU = 1350;
/** Effective rest margin = open clear - truck height - ground float. */
export const GATE_EFFECTIVE_MARGIN_MU =
  GATE_OPEN_CLEAR_MU - TRUCK_HEIGHT_MU - TRUCK_GROUND_FLOAT_MU;
/** Production requires >= 0.15 u effective margin (product ruling b). */
export const PRODUCTION_MIN_MARGIN_MU = 150;

/** Per-side clearance margin added to the max(nominal, actual) width. */
export const CLEARANCE_MARGIN_MU = 150;

/** Vehicle staging depth: the 3 u truck must be able to stand at the socket. */
export const VEHICLE_ENTRANCE_DEPTH_MU = 3000;
/** Belt/cargo docking approach: one cell of run-up. */
export const DOCK_ENTRANCE_DEPTH_MU = 1000;

/** Actual vehicle width by socket kind; 0 where no vehicle docks. */
const ACTUAL_WIDTH_BY_KIND: Record<SocketKind, number> = {
  truck: TRUCK_ACTUAL_WIDTH_MU,
  road: TRUCK_ACTUAL_WIDTH_MU,
  pallet: 900, // forklift body 0.9 u wide
  belt: 0,
  cargo: 0,
};

/** Clearance width = max(nominal, actual authored geometry) + 2 * 0.15 u. */
export function socketClearanceWidth(socket: KitSocket): number {
  const actual = ACTUAL_WIDTH_BY_KIND[socket.kind];
  return Math.max(socket.clearanceWidth, actual) + 2 * CLEARANCE_MARGIN_MU;
}

export function entranceDepthMu(socket: KitSocket): number {
  return socket.kind === "belt" || socket.kind === "cargo"
    ? DOCK_ENTRANCE_DEPTH_MU
    : VEHICLE_ENTRANCE_DEPTH_MU;
}

/** P1 assembly: 5 simulated seconds (TICKS_PER_SECOND = 10 -> 50 ticks). */
export const P1_CONSTRUCTION_TICKS = 50;

function u(v: number): number {
  return Math.round(v * MU_PER_UNIT);
}

export const WORLD_KIT: Readonly<Record<WorldAssetId, KitAsset>> = {
  warehouse: {
    id: "warehouse",
    footprint: [6, 4],
    sockets: [
      { name: "bay0", x: u(-1.55), z: u(2.15), kind: "truck", clearanceWidth: u(2.2) },
      { name: "bay1", x: u(1.55), z: u(2.15), kind: "truck", clearanceWidth: u(2.2) },
    ],
    buildCost: [
      { resource: "scrap", qty: 30 },
      { resource: "steel", qty: 8 },
    ],
    creditCost: 20,
    constructionTicks: P1_CONSTRUCTION_TICKS,
  },
  depot: {
    id: "depot",
    footprint: [4, 4],
    sockets: [
      { name: "serviceBay", x: u(0), z: u(2.2), kind: "truck", clearanceWidth: u(3.2) },
    ],
    buildCost: [
      { resource: "scrap", qty: 45 },
      { resource: "steel", qty: 8 },
    ],
    creditCost: 30,
    constructionTicks: P1_CONSTRUCTION_TICKS,
  },
  sorter: {
    id: "sorter",
    footprint: [3, 3],
    sockets: [
      { name: "output", x: u(0), z: u(1.6), kind: "belt", clearanceWidth: u(1.0) },
    ],
    buildCost: BLUEPRINTS.sorter.buildCost,
    creditCost: 0,
    constructionTicks: P1_CONSTRUCTION_TICKS,
  },
  furnace: {
    id: "furnace",
    footprint: [3, 3],
    sockets: [
      { name: "input", x: u(0), z: u(1.7), kind: "pallet", clearanceWidth: u(1.3) },
    ],
    buildCost: BLUEPRINTS.furnace.buildCost,
    creditCost: 0,
    constructionTicks: P1_CONSTRUCTION_TICKS,
  },
  generator: {
    id: "generator",
    footprint: [2, 2],
    sockets: [],
    buildCost: [
      { resource: "scrap", qty: 20 },
      { resource: "steel", qty: 8 },
    ],
    creditCost: 25,
    constructionTicks: P1_CONSTRUCTION_TICKS,
  },
  crane: {
    id: "crane",
    footprint: [3, 3],
    sockets: [],
    // Prototype tuning default: no authored cost yet (#148 content bump).
    buildCost: [
      { resource: "scrap", qty: 25 },
      { resource: "steel", qty: 6 },
    ],
    creditCost: 0,
    constructionTicks: P1_CONSTRUCTION_TICKS,
    keepoutRadiusMu: CRANE_SWING_RADIUS_MU,
  },
  turret: {
    id: "turret",
    footprint: [2, 2],
    sockets: [],
    // Prototype tuning default: defense content lands in P3 (#148).
    buildCost: [
      { resource: "scrap", qty: 20 },
      { resource: "steel", qty: 5 },
    ],
    creditCost: 15,
    constructionTicks: P1_CONSTRUCTION_TICKS,
  },
  wall_gate: {
    id: "wall_gate",
    footprint: [3, 1],
    sockets: [
      { name: "passage", x: u(0), z: u(0.7), kind: "road", clearanceWidth: u(1.8) },
    ],
    // Prototype tuning default: perimeter content lands with walls (#148).
    buildCost: [
      { resource: "scrap", qty: 10 },
      { resource: "steel", qty: 2 },
    ],
    creditCost: 0,
    constructionTicks: P1_CONSTRUCTION_TICKS,
  },
};

export const WORLD_ASSET_IDS: readonly WorldAssetId[] = Object.keys(
  WORLD_KIT,
) as WorldAssetId[];

export function isWorldAssetId(v: unknown): v is WorldAssetId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(WORLD_KIT, v);
}

/** Total build cost as a fresh mutable list (callers must not mutate the kit). */
export function buildCostOf(asset: WorldAssetId): ItemStack[] {
  return WORLD_KIT[asset].buildCost.map((i) => ({ ...i }));
}

export function costResourceIds(): ResourceId[] {
  const seen = new Set<ResourceId>();
  for (const asset of WORLD_ASSET_IDS) {
    for (const item of WORLD_KIT[asset].buildCost) seen.add(item.resource);
  }
  return [...seen];
}