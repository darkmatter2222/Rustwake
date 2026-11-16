/**
 * Fleet transport adapter (issue #143, RW3D T16).
 *
 * Maps REAL cargo jobs (#140 logistics ledger + #141 traffic runtime) onto
 * carrier animation states. ACCEPTANCE E05/V04: every visible load belongs to
 * a real job — the cargo box is drawn strictly from `job.inTransit`, never
 * from a decorative loop; brake/align/lift-load/depart/unload stages follow
 * the actual phase + timer + hold transitions; a paused, held or queued job
 * freezes in place instead of continuing a fake delivery.
 *
 * Presentation-only, session-only, additive:
 *  - This module holds NO simulation state and dispatches NO command. It only
 *    reads immutable snapshots the caller passes in and derives render data.
 *    The logistics/traffic ledgers, their conservation invariant
 *    (`amount = atSource + inTransit + delivered + returned`) and their
 *    fingerprints are untouched by construction.
 *  - Interpolation is BACKWARD-LOOKING: a carrier slides from the cell it
 *    occupied at the previous tick towards its authoritative current cell,
 *    driven solely by the caller's sub-tick phase. It never predicts future
 *    movement, so a blocked job (k = 0 cells advanced) cannot drift.
 *  - The bridge below follows the plain logistics-view pattern: a stable
 *    snapshot between publishes, empty by default. With no publish the
 *    renderer paints exactly what it painted before (fingerprint parity).
 *
 * Boundary (ADR-0001, frozen boundary-3d test): renderer-root module — no
 * three.js import, no wall-clock, no browser storage, simulation types only.
 */
import type { ResourceId } from "../content/defs";
import type { CargoJob, LogisticsState } from "../simulation/logistics";
import type { TrafficState, TruckRuntime } from "../simulation/traffic";
import type { Cell } from "../world/types";

/**
 * Animation stage derived from the real job phase, traffic timers and typed
 * blockers. `parked` = idle carrier; `move-empty`/`move-loaded` = travelling
 * without/with cargo; `align` = braking into the destination bay; `depart` =
 * first moved tick out of the source bay; `load`/`unload` = bay timers running;
 * `queue-bay`/`queue-junction` = capacity holds; `held` = typed job blocker
 * (no-route, road-removed, destination-full, no-carrier); `recall` = cancelled
 * job returning its cargo to the source.
 */
export type FleetStage =
  | "parked"
  | "move-empty"
  | "align"
  | "queue-bay"
  | "queue-junction"
  | "held"
  | "load"
  | "depart"
  | "move-loaded"
  | "unload"
  | "recall";

export interface FleetUnit {
  readonly carrierId: number;
  readonly jobId: number | null;
  readonly stage: FleetStage;
  /** Authoritative simulation cell (tick-end truth). */
  readonly cell: Cell;
  /** Render position in tile units (cell centres at +0.5); equals the cell when frozen. */
  readonly pos: { readonly x: number; readonly y: number };
  /** Facing in radians, 0 = grid +x; kept from the last moved segment. */
  readonly heading: number;
  /** Units physically on the carrier (`job.inTransit`); 0 means no cargo box. */
  readonly cargo: number;
  readonly cargoType: ResourceId | null;
  readonly capacity: number;
  /** Lift height 0..1 while a load/unload timer runs; 0 otherwise. */
  readonly lift: number;
  /** Cumulative cells travelled; wheel rotation derives from this, never a clock. */
  readonly wheelTurns: number;
  /** Typed blocker kind while held/queued; null otherwise. */
  readonly heldKind: string | null;
  /** True only when the carrier actually advanced cells during this tick. */
  readonly moving: boolean;
}

export interface FleetFrame {
  /** Logistics session tick the frame was derived from. */
  readonly tick: number;
  readonly units: readonly FleetUnit[];
}

/** Per-carrier presentation memory; the only state the adapter keeps. */
interface CarrierMemory {
  /** Logistics tick the current interpolation window belongs to. */
  tick: number;
  /** Path progress at the window start (previous tick's end). */
  fromProgress: number;
  /** Path progress last observed inside the window. */
  lastProgress: number;
  /** Cumulative cells travelled through the end of the previous window. */
  distance: number;
  heading: number;
}

export type FleetMemory = Map<number, CarrierMemory>;

const EMPTY_FRAME: FleetFrame = Object.freeze({ tick: 0, units: Object.freeze([]) });

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Point along the walked polyline from path[a] to path[b] (inclusive indices,
 * adjacent cells), parameter t in [0,1]. Returns tile-unit coordinates with
 * cell centres at +0.5.
 */
function pointAlong(path: readonly Cell[], a: number, b: number, t: number): { x: number; y: number } {
  const segments = b - a;
  if (segments <= 0) return { x: path[b].x + 0.5, y: path[b].y + 0.5 };
  const s = clamp01(t) * segments;
  const i = Math.min(Math.floor(s), segments - 1);
  const frac = s - i;
  const p0 = path[a + i];
  const p1 = path[a + i + 1];
  return { x: p0.x + (p1.x - p0.x) * frac + 0.5, y: p0.y + (p1.y - p0.y) * frac + 0.5 };
}

function stageOf(
  carrierJob: CargoJob | undefined,
  rt: TruckRuntime | undefined,
  k: number
): { stage: FleetStage; heldKind: string | null } {
  if (!carrierJob) return { stage: "parked", heldKind: null };
  const job = carrierJob;
  if (job.phase === "waiting" || job.phase === "done") return { stage: "parked", heldKind: null };
  if (job.phase === "to-source" && rt && rt.loadRemaining > 0) return { stage: "load", heldKind: null };
  if (job.phase === "to-dest" && rt && rt.unloadRemaining > 0) return { stage: "unload", heldKind: null };
  const trafficHold = rt?.heldReason ?? null;
  if (trafficHold && trafficHold.kind === "bay-full") return { stage: "queue-bay", heldKind: "bay-full" };
  if (trafficHold && trafficHold.kind === "junction-full") {
    return { stage: "queue-junction", heldKind: "junction-full" };
  }
  const held = job.heldReason ?? trafficHold;
  if (held || !job.path) return { stage: "held", heldKind: held ? held.kind : "no-route" };
  if (job.phase === "returning") return { stage: "recall", heldKind: null };
  if (job.phase === "to-source") return { stage: "move-empty", heldKind: null };
  // to-dest, carrying real cargo.
  const moving = k > 0;
  if (moving && job.progress <= k) return { stage: "depart", heldKind: null };
  if (moving && job.path && job.progress >= job.path.length - 2) return { stage: "align", heldKind: null };
  return { stage: "move-loaded", heldKind: null };
}

function liftOf(stage: FleetStage, rt: TruckRuntime | undefined, t: number, reducedMotion: boolean): number {
  if (stage === "load" && rt && rt.config.loadTicks > 0) {
    if (reducedMotion) return 1;
    const done = rt.config.loadTicks - rt.loadRemaining;
    return clamp01((done + t) / rt.config.loadTicks);
  }
  if (stage === "unload" && rt && rt.config.unloadTicks > 0) {
    if (reducedMotion) return 1;
    const done = rt.config.unloadTicks - rt.unloadRemaining;
    return clamp01((done + t) / rt.config.unloadTicks);
  }
  return stage === "load" || stage === "unload" ? 1 : 0;
}

/**
 * Pure derivation: real ledgers in, presentation frame out. `memory` carries
 * the previous window per carrier (pass null on the first call); the returned
 * memory must be fed back on the next call. No input is mutated.
 */
export function deriveFleetFrame(
  logistics: LogisticsState,
  traffic: TrafficState | null,
  memory: FleetMemory | null,
  phase: number,
  reducedMotion: boolean
): { frame: FleetFrame; memory: FleetMemory } {
  const t = clamp01(phase);
  const next: FleetMemory = new Map();
  const jobs = new Map<number, CargoJob>();
  for (const job of logistics.jobs) jobs.set(job.id, job);
  const units: FleetUnit[] = [];
  for (const carrier of logistics.carriers) {
    const job = carrier.jobId === null ? undefined : jobs.get(carrier.jobId);
    const path = job && job.path ? job.path : null;
    const progress = job ? job.progress : 0;
    const cell: Cell =
      path && progress >= 0 && progress < path.length ? path[progress] : carrier.cell;
    const prev = memory ? memory.get(carrier.id) ?? null : null;
    const newWindow = !prev || prev.tick !== logistics.tick;
    const fromProgress = newWindow ? (prev ? prev.lastProgress : progress) : prev.fromProgress;
    const prevK = prev ? clampInt(prev.lastProgress - prev.fromProgress, 0, prev.lastProgress) : 0;
    const distance = (prev ? prev.distance : 0) + (newWindow ? prevK : 0);
    // Backward-looking advance: never more than the cells actually walked this
    // tick, never negative. A held/queued/loading carrier has k = 0 and freezes.
    const k = path ? clampInt(progress - fromProgress, 0, progress) : 0;
    const moving = k > 0;
    const rt = traffic ? traffic.trucks[carrier.id] : undefined;
    const { stage, heldKind } = stageOf(job, rt, k);
    let pos: { x: number; y: number };
    let heading = prev ? prev.heading : 0;
    if (moving && path && !reducedMotion) {
      pos = pointAlong(path, progress - k, progress, t);
      const a = progress - k;
      const i = Math.min(Math.floor(clamp01(t) * k), k - 1);
      const p0 = path[a + i];
      const p1 = path[a + i + 1];
      if (p1.x !== p0.x || p1.y !== p0.y) heading = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    } else {
      pos = { x: cell.x + 0.5, y: cell.y + 0.5 };
      if (moving && path) {
        // Reduced motion keeps the discrete facing of the walked segment.
        const p0 = path[progress - k];
        const p1 = path[progress];
        if (p1.x !== p0.x || p1.y !== p0.y) heading = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      }
    }
    const wheelTurns = reducedMotion ? distance + k : distance + (moving ? k * t : 0);
    units.push({
      carrierId: carrier.id,
      jobId: carrier.jobId,
      stage,
      cell,
      pos,
      heading,
      cargo: job ? job.inTransit : 0,
      cargoType: job && job.inTransit > 0 ? job.cargoType : null,
      capacity: carrier.capacity,
      lift: liftOf(stage, rt, t, reducedMotion),
      wheelTurns,
      heldKind,
      moving,
    });
    next.set(carrier.id, {
      tick: logistics.tick,
      fromProgress,
      lastProgress: progress,
      distance,
      heading,
    });
  }
  units.sort((a, b) => a.carrierId - b.carrierId);
  return { frame: { tick: logistics.tick, units }, memory: next };
}

/*
 * Plain bridge (ui/logistics/view.ts pattern): the renderer pulls the latest
 * published frame once per draw; between publishes the reference is stable.
 * Default is the empty frame, so an un-wired session paints zero fleet ink.
 * The production feed (store tick -> publish) is the #148 cutover's join, the
 * same deferred wiring the QA-accepted #137 assembly view uses; the rw3d-t16
 * harness drives this bridge from the real engine for evidence.
 */
let current: FleetFrame = EMPTY_FRAME;
let bridgeMemory: FleetMemory = new Map();

/** Derive from the real ledgers and publish the presentation frame. */
export function publishFleetFrame(
  logistics: LogisticsState,
  traffic: TrafficState | null,
  phase: number,
  reducedMotion: boolean
): FleetFrame {
  const derived = deriveFleetFrame(logistics, traffic, bridgeMemory, phase, reducedMotion);
  bridgeMemory = derived.memory;
  current = derived.frame;
  return current;
}

/** Latest published frame; the empty frame until the first publish. */
export function getFleetFrame(): FleetFrame {
  return current;
}

/** Drop back to the empty frame (tests, teardown). */
export function resetFleetFrame(): void {
  current = EMPTY_FRAME;
  bridgeMemory = new Map();
}
