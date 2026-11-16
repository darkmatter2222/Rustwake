/**
 * UI-RESET-60: the renderer's own reduced-motion source.
 *
 * The OS preference is read live here (`window.matchMedia`) and OR'd with the caller's
 * `DrawOptions.reducedMotion`, so the yard honours `prefers-reduced-motion: reduce` even
 * when the persisted setting is off, and follows an OS change without a new persisted
 * flag, a `drawScene` signature change, or any param threaded through `App.tsx`.
 *
 * Pure read, no clock, no subscription, no DOM mutation. Guarded for non-browser contexts:
 * the jsdom unit tests have no usable `matchMedia`, so the OS term is `false` there and the
 * caller's option remains the whole answer - byte for byte the previous behaviour. The
 * existing boot latch in `App.tsx` (which persists the preference once) is left untouched;
 * this is the live, renderer-side complement to it.
 */

/** The one media query the renderer reads; mirrors the CSS `@media` blocks. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The OS preference; `false` wherever `matchMedia` is unavailable or throws. */
export function osPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return !!window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/** The effective flag: the caller's option OR the live OS preference (never AND). */
export function effectiveReducedMotion(option: boolean): boolean {
  return option || osPrefersReducedMotion();
}

// ---------------------------------------------------------------------------
// RW3D T23 (#150): layered machine activity.
//
// A pure, state-derived activity model. Every channel is a function of the
// machine's own identity and the simulation's own clock (`tick + framePhase`,
// 0.1 s units) - never a wall clock, never storage, never a shared yard phase.
// Two machines therefore never reset together: each carries a stable seed
// offset, and the batch-driven channels read the machine's real progress, so
// the motion is truthful (a starved or unpowered machine does not fake work).
//
// The model allocates nothing per tick: the vent pool is a fixed-size slot
// array (MAX_VENT_PUFFS) and every channel is a small integer stage. Reduced
// motion freezes every channel at a discrete, readable stage - the information
// survives, only the movement stops.
// ---------------------------------------------------------------------------

import type { MachineState } from "../simulation/types";

/** Fan period: 1.7 s at TICK_MS = 100 (ART_AND_MOTION independent channel). */
export const FAN_PERIOD_TICKS = 17;
/** Vent period range: 11-19 s, chosen per entity by its stable seed. */
export const VENT_MIN_TICKS = 110;
export const VENT_MAX_TICKS = 190;
/** Core swell / bar settle cycle, per machine (was one shared 6-frame yard pulse). */
export const PULSE_PERIOD_TICKS = 17;
/** Discrete fan blade positions per revolution (pixel-snapped, never continuous). */
export const FAN_STEPS = 8;
/** Discrete roller positions per batch (batch-driven, not clock-driven). */
export const ROLLER_STEPS = 4;
/** Bounded vent pool: at most two puff slots exist per machine, ever. */
export const MAX_VENT_PUFFS = 2;

/**
 * Stable per-entity seed in [0, 1). A small FNV-1a-style mix of the machine id:
 * deterministic across saves and sessions, never fed back into production.
 */
export function machineSeed(id: number): number {
  let h = 0x811c9dc5;
  let n = Math.abs(Math.trunc(id));
  do {
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    n = Math.floor(n / 256);
  } while (n > 0);
  // One more mix so adjacent ids do not land on adjacent phases.
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 0x100000000;
}

/** One vent puff slot: a discrete stage and a fixed lateral offset, pool-bounded. */
export interface VentPuff {
  /** 0 = invisible, 1..3 = rise stage (quantised, never a continuous drift). */
  stage: number;
  /** Fixed lateral slot offset in sheet units (-1 or +1); no per-tick allocation. */
  slot: number;
}

export interface MachineActivity {
  /** True only while the simulation says the machine is actually working. */
  active: boolean;
  /** Per-machine swell/settle frame pair (replaces the shared yard pulse). */
  pulse: boolean;
  /** Quantised fan blade position 0..FAN_STEPS-1; frozen when not working. */
  fanStep: number;
  /** Vent cycle stage 0..3; puffs only exist while working. */
  ventStage: number;
  /** Bounded pool, length <= MAX_VENT_PUFFS; empty unless a vent puff is due. */
  ventPuffs: readonly VentPuff[];
  /** Batch-driven roller position 0..ROLLER_STEPS-1; 0 when no batch is live. */
  rollerStep: number;
  /** Magnet sweep: the first quarter of a live batch, once per batch. */
  sweep: boolean;
}

const NO_PUFFS: readonly VentPuff[] = [];
const ONE_PUFF: readonly VentPuff[] = [{ stage: 1, slot: -1 }];
const TWO_PUFFS: readonly VentPuff[] = [{ stage: 2, slot: -1 }, { stage: 1, slot: 1 }];

/** The entity's own vent period in ticks, inside the documented 11-19 s band. */
export function ventPeriodTicks(id: number): number {
  const span = VENT_MAX_TICKS - VENT_MIN_TICKS;
  return VENT_MIN_TICKS + Math.floor(machineSeed(id) * (span + 1));
}

/**
 * Derive one machine's activity for the frame at `tick + framePhase`.
 * Pure: reads only its arguments, mutates nothing, allocates only the small
 * fixed pool constants above. `reducedMotion` freezes every channel at a
 * discrete stage (fan holds its seed angle, vent holds its stage, roller holds
 * its batch position) so the state stays readable without movement.
 */
export function machineActivity(
  machine: MachineState,
  tick: number,
  framePhase: number,
  reducedMotion: boolean
): MachineActivity {
  const seed = machineSeed(machine.id);
  const t = Math.max(0, tick) + Math.min(1, Math.max(0, framePhase));
  const active = machine.status === "running";

  // Per-machine pulse: the same 6-step grammar as before, but each machine runs
  // its own 1.7 s cycle offset by its seed, so the yard never swells in unison.
  const pulseCycle = ((t + seed * PULSE_PERIOD_TICKS) % PULSE_PERIOD_TICKS) / PULSE_PERIOD_TICKS;
  const q = reducedMotion ? 0 : Math.min(5, Math.floor(pulseCycle * 6));
  const pulse = q === 2 || q === 3;

  // Fan: spins only while working; otherwise it holds the seed angle (a stopped
  // fan is a truthful reading, not a decorative loop).
  const fanBase = seed * FAN_STEPS;
  const fanStep = active && !reducedMotion
    ? Math.floor((fanBase + (t / FAN_PERIOD_TICKS) * FAN_STEPS) % FAN_STEPS)
    : Math.floor(fanBase % FAN_STEPS);

  // Vent: the entity's own 11-19 s cycle. A puff is due only in stage 1 while
  // working; reduced motion holds the stage but never emits a moving puff.
  const period = ventPeriodTicks(machine.id);
  const ventCycle = ((t + seed * period) % period) / period;
  const ventStage = Math.min(3, Math.floor(ventCycle * 4));
  const ventPuffs = active && !reducedMotion && ventStage === 1
    ? (ventCycle > 0.375 ? TWO_PUFFS : ONE_PUFF)
    : NO_PUFFS;

  // Batch-driven channels: read the real batch progress, so rollers and the
  // magnet sweep move exactly when the simulation says a batch is live.
  const ratio = machine.batchMilli > 0 ? Math.min(1, Math.max(0, machine.progress / machine.batchMilli)) : 0;
  const liveBatch = active && ratio > 0;
  const rollerStep = liveBatch ? Math.min(ROLLER_STEPS - 1, Math.floor(ratio * ROLLER_STEPS)) : 0;
  const sweep = liveBatch && ratio < 0.25;

  return { active, pulse, fanStep, ventStage, ventPuffs, rollerStep, sweep };
}
