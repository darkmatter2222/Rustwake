/**
 * RW3D T10 (#137): mechanical building assembly + upgrade presentation.
 *
 * Pure presentation controller over deterministic simulation state. The
 * economy (world reservations / sim upgrade charges) is the only timing
 * authority; this module derives WHAT to show from integer progress, never
 * WHEN to charge. No THREE, no DOM, no clock, no storage — the three.js
 * layer (three/assemblyView.ts) consumes these poses, and the boundary
 * suite (tests/renderer/boundary-3d.test.ts) enforces that split.
 *
 * Stage model (ART_AND_MOTION assembly timeline, 5 s default = 50 ticks):
 *   0.0-0.6 s  base        foundation settles
 *   0.6-1.6 s  frame       columns/piers rise
 *   1.6-2.8 s  walls       wall modules translate in
 *   2.8-3.8 s  roof        roof + machinery housings settle
 *   3.8-5.0 s  activation  doors align, lights/idle mechanisms switch on
 * V05 names five stages (base/frame/walls/roof/activation); the art
 * timeline's door (3.8-4.5 s) and light (4.5-5.0 s) windows both live in
 * "activation". Boundaries are integer ticks scaled from the 50-tick
 * reference so any duration keeps the same proportions without floats
 * entering the decision path.
 *
 * Reduced motion (U07): discrete static stages — parts appear at their
 * stage boundary with rest transforms; no interpolation, no idle loops.
 * Economic completion is identical either way.
 */
import type { WorldAssetId } from "../world/kit";
import type { Cell, Rotation, WorldState } from "../world/types";
import { KIT_GEOMETRY, type KitMaterialToken } from "./kitGeometry";

export const ASSEMBLY_STAGES = ["base", "frame", "walls", "roof", "activation"] as const;
export type AssemblyStageName = (typeof ASSEMBLY_STAGES)[number];
export const ASSEMBLY_STAGE_COUNT = ASSEMBLY_STAGES.length;

/**
 * Stage boundaries as numerators over the 50-tick reference duration
 * (0.6/1.6/2.8/3.8/5.0 s at TICK_MS 100). boundary(i, d) = floor(d*n/50)
 * is exact for d = 50 and integer for every duration.
 */
const BOUNDARY_NUMERATORS = [0, 6, 16, 28, 38, 50] as const;
const REFERENCE_DURATION = 50;

export function stageBoundary(index: number, durationTicks: number): number {
  return Math.floor((durationTicks * BOUNDARY_NUMERATORS[index]) / REFERENCE_DURATION);
}

export interface AssemblyStage {
  /** 0..4 index into ASSEMBLY_STAGES. */
  readonly stage: number;
  readonly name: AssemblyStageName;
  /** Local progress within the stage, integer 0..1000. */
  readonly localT: number;
  /** True once progress >= duration (economic completion). */
  readonly done: boolean;
}

/** Clamp helper: progress is presentation input, never negative work. */
function clampProgress(progressTicks: number, durationTicks: number): number {
  if (!(durationTicks > 0)) return 0;
  return Math.min(durationTicks, Math.max(0, Math.floor(progressTicks)));
}

/**
 * The stage shown at a given construction progress. Pure and monotone:
 * stage never decreases as progress advances, and completion is exactly
 * progress >= duration (the same instant the world engine settles).
 */
export function assemblyStageAt(progressTicks: number, durationTicks: number): AssemblyStage {
  const d = Math.max(0, Math.floor(durationTicks));
  const p = clampProgress(progressTicks, d);
  if (d === 0 || p >= d) {
    return { stage: 4, name: ASSEMBLY_STAGES[4], localT: 1000, done: true };
  }
  let stage = 0;
  for (let i = 1; i < ASSEMBLY_STAGE_COUNT; i += 1) {
    if (p >= stageBoundary(i, d)) stage = i;
  }
  const lo = stageBoundary(stage, d);
  const hi = stageBoundary(stage + 1, d);
  const span = Math.max(1, hi - lo);
  const localT = Math.min(1000, Math.floor(((p - lo) * 1000) / span));
  return { stage, name: ASSEMBLY_STAGES[stage], localT, done: false };
}

/**
 * Part -> stage table, per asset. Every kit part appears exactly once, at
 * the start of its stage, and stays visible. Small assets hold some stages
 * (no new parts in that window) — the stage clock still advances; the
 * warehouse (the V05 subject) shows all five distinct stages.
 */
export const PART_STAGE: Readonly<Record<WorldAssetId, Readonly<Record<string, number>>>> = {
  warehouse: {
    foundation: 0,
    centerPier: 1,
    frontLintel: 1,
    back: 2,
    "side-1": 2,
    side1: 2,
    roofBase: 3,
    "roofStep-1": 3,
    roofStep1: 3,
    ridge: 3,
    ventHousing: 3,
    doorPanel0: 4,
    doorPanel1: 4,
    ventAxle: 4,
    ventBladeX: 4,
    ventBladeZ: 4,
    liftPlatform: 4,
    liftPallet: 4,
  },
  depot: {
    foundation: 0,
    lintel: 1,
    back: 2,
    "side-1": 2,
    side1: 2,
    roofBase: 3,
    "roofStep-1": 3,
    roofStep1: 3,
    ridge: 3,
    ventHousing: 3,
    doorPanel: 4,
    ventAxle: 4,
    ventBladeX: 4,
    ventBladeZ: 4,
  },
  sorter: {
    body: 0,
    gantryPostL: 1,
    gantryPostR: 1,
    hopper: 2,
    belt: 2,
    gantryBar: 3,
    rollerMesh: 4,
    rollerMesh2: 4,
    magnetBody: 4,
    magnetTip: 4,
  },
  furnace: {
    base: 0,
    lintel: 1,
    chimney: 1,
    back: 2,
    left: 2,
    right: 2,
    fanHousing: 3,
    glow: 3,
    door: 4,
    fanBladeY: 4,
    fanBladeZ: 4,
    spout: 4,
    puff: 4,
  },
  generator: {
    housing: 0,
    fanFrame: 1,
    shaftBar: 2,
    fanX: 4,
    fanY: 4,
  },
  crane: {
    base: 0,
    tower: 1,
    boom: 2,
    cable: 3,
    grip: 4,
  },
  turret: {
    base: 0,
    housing: 1,
    barrel: 4,
  },
  wall_gate: {
    left: 0,
    right: 0,
    panel: 4,
  },
};

/** Kit groups whose parts are doors/gates: they "align" in activation. */
const DOOR_GROUPS: ReadonlySet<string> = new Set(["door0", "door1", "door", "intakeDoor", "gate"]);

export interface PartPose {
  readonly visible: boolean;
  /** Additive offset from the kit rest center, world units. */
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  /** Y scale factor (1 = rest). Frame parts rise from a pinned bottom. */
  readonly sy: number;
}

const REST: PartPose = { visible: true, dx: 0, dy: 0, dz: 0, sy: 1 };
const HIDDEN: PartPose = { visible: false, dx: 0, dy: 0, dz: 0, sy: 1 };

/** Smoothstep on the integer local parameter; presentation-only easing. */
function ease(localT: number): number {
  const t = Math.min(1, Math.max(0, localT / 1000));
  return t * t * (3 - 2 * t);
}

/**
 * Pose of one kit part at a given construction progress.
 *
 * Motion recipe (ART_AND_MOTION: no balloon scaling of whole buildings;
 * separate pivots, fixed geometry):
 *   base        settles down from +0.25 u
 *   frame       rises: scaleY 0.001 -> 1 with the bottom edge pinned
 *   walls       translate in from the part's own side (±0.6 u on X)
 *   roof        settles down from +0.8 u
 *   activation  doors align from +0.5 u; mechanisms simply switch on
 *               (their idle loops are the view layer's job, framePhase)
 *
 * Reduced motion: visibility is still staged (discrete static stages are
 * an accepted U07 path) but every transform is the rest pose — no motion.
 */
export function partAssemblyPose(
  asset: WorldAssetId,
  partName: string,
  progressTicks: number,
  durationTicks: number,
  reducedMotion: boolean,
): PartPose {
  const stageOfPart = PART_STAGE[asset][partName];
  if (stageOfPart === undefined) return HIDDEN;
  const { stage, localT, done } = assemblyStageAt(progressTicks, durationTicks);
  if (done) return REST;
  if (stage < stageOfPart) return HIDDEN;
  if (reducedMotion || stage > stageOfPart) return REST;

  // Inside the part's own stage: interpolate its entrance.
  const e = ease(localT);
  const geo = KIT_GEOMETRY[asset].parts.find((p) => p.name === partName);
  const centerX = geo !== undefined ? geo.center[0] : 0;
  const sizeY = geo !== undefined ? geo.size[1] : 0;
  switch (stageOfPart) {
    case 0:
      return { visible: true, dx: 0, dy: 0.25 * (1 - e), dz: 0, sy: 1 };
    case 1: {
      const sy = Math.max(0.001, e);
      // Pin the bottom edge: the part grows upward, never balloons.
      return { visible: true, dx: 0, dy: -(sizeY / 2) * (1 - sy), dz: 0, sy };
    }
    case 2: {
      const side = centerX < 0 ? -1 : 1;
      return { visible: true, dx: side * 0.6 * (1 - e), dy: 0, dz: 0, sy: 1 };
    }
    case 3:
      return { visible: true, dx: 0, dy: 0.8 * (1 - e), dz: 0, sy: 1 };
    default: {
      const parent = geo !== undefined ? geo.parent : "";
      if (DOOR_GROUPS.has(parent)) {
        return { visible: true, dx: 0, dy: 0.5 * (1 - e), dz: 0, sy: 1 };
      }
      return REST;
    }
  }
}

/**
 * Upgrade modules: one named annex module per level above 1, capped for
 * presentation sanity. Pure function of (asset footprint, level) — the sim
 * already charged exactly once per upgrade (commands.ts upgradeMachine,
 * idempotent by command id); this never replays or triggers any cost.
 */
export const UPGRADE_MODULE_CAP = 4;

export interface UpgradeModuleSpec {
  readonly name: string;
  readonly center: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly material: KitMaterialToken;
}

export function upgradeModulesFor(asset: WorldAssetId, level: number): UpgradeModuleSpec[] {
  const lv = Math.max(1, Math.floor(level));
  const count = Math.min(UPGRADE_MODULE_CAP, lv - 1);
  if (count <= 0) return [];
  const [w, d] = KIT_GEOMETRY[asset].footprint;
  const xOff = Math.min(w / 4, 1.2);
  const specs: UpgradeModuleSpec[] = [];
  for (let n = 0; n < count; n += 1) {
    const x = (n % 2 === 0 ? -1 : 1) * xOff;
    const y = 0.45 + Math.floor(n / 2) * 0.55;
    const z = -(d / 2) + 0.5;
    specs.push({
      name: `upgradeModule${n + 1}`,
      center: [x, y, z],
      size: [0.7, 0.5, 0.7],
      material: n % 2 === 0 ? "steel" : "oxideLight",
    });
  }
  return specs;
}

/**
 * Renderer-owned snapshot of everything the assembly view needs. The
 * adapter below builds it from WorldState; the harness/tests may build it
 * directly. Levels come from the 2D sim authority via the caller-supplied
 * lookup (the app cutover #148 / shell wiring #199 owns that join).
 */
export interface AssemblyBuildingSnapshot {
  readonly id: number;
  readonly asset: WorldAssetId;
  readonly cell: Cell;
  readonly rotation: Rotation;
  readonly progressTicks: number;
  readonly durationTicks: number;
  readonly completed: boolean;
  readonly level: number;
}

export interface AssemblySnapshot {
  readonly tick: number;
  readonly buildings: readonly AssemblyBuildingSnapshot[];
}

/**
 * Adapt world state to the presentation snapshot. Sites render their
 * integer progress; completed buildings render fully assembled at the
 * sim-reported level. Unknown assets are skipped (never invented).
 * Deterministic order: ascending id.
 */
export function worldAssemblySnapshot(
  w: WorldState,
  levelOf?: (buildingId: number) => number,
): AssemblySnapshot {
  const buildings: AssemblyBuildingSnapshot[] = [];
  for (const s of w.sites) {
    if (!(s.asset in KIT_GEOMETRY)) continue;
    buildings.push({
      id: s.buildingId,
      asset: s.asset as WorldAssetId,
      cell: s.cell,
      rotation: s.rotation,
      progressTicks: s.progressTicks,
      durationTicks: s.durationTicks,
      completed: false,
      level: 1,
    });
  }
  for (const b of w.buildings) {
    if (!(b.asset in KIT_GEOMETRY)) continue;
    const level = levelOf !== undefined ? levelOf(b.id) : 1;
    buildings.push({
      id: b.id,
      asset: b.asset as WorldAssetId,
      cell: b.cell,
      rotation: b.rotation,
      progressTicks: 1,
      durationTicks: 1,
      completed: true,
      level: Math.max(1, Math.floor(level)),
    });
  }
  buildings.sort((a, b) => a.id - b.id);
  return { tick: w.tick, buildings };
}

/** Numerical stage report for evidence/QA (observed, not simulated). */
export interface BuildingStageReport {
  readonly id: number;
  readonly asset: WorldAssetId;
  readonly stage: number;
  readonly stageName: AssemblyStageName;
  readonly done: boolean;
  readonly visibleParts: number;
  readonly totalParts: number;
  readonly upgradeModules: number;
}

export function buildingStageReport(b: AssemblyBuildingSnapshot): BuildingStageReport {
  const st = assemblyStageAt(b.progressTicks, b.durationTicks);
  const parts = KIT_GEOMETRY[b.asset].parts;
  let visibleParts = 0;
  for (const p of parts) {
    if (partAssemblyPose(b.asset, p.name, b.progressTicks, b.durationTicks, true).visible) {
      visibleParts += 1;
    }
  }
  return {
    id: b.id,
    asset: b.asset,
    stage: st.stage,
    stageName: st.name,
    done: st.done,
    visibleParts,
    totalParts: parts.length,
    upgradeModules: upgradeModulesFor(b.asset, b.level).length,
  };
}
