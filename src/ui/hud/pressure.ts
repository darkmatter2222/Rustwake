import { wholePercent } from "../../game/content/strings";
import type { SimState } from "../../game/simulation/types";

/**
 * UI-RESET-51: capacity pressure and critical power/production reads.
 *
 * These are pure derivations of the authoritative SimState. They never mutate
 * state and never infer from colors; the components turn the result into text
 * plus a non-color glyph so the cue survives grayscale and screen readers.
 */

export type StorageTier = "ok" | "high" | "full";

export interface StoragePressure {
  tier: StorageTier;
  units: number;
  capacity: number;
  percent: number;
  overflowUnits: number;
}

/**
 * `full` when the store has reached capacity; `high` at >= 90% or when anything
 * is already held outside the store (overflow). A zero/negative capacity is
 * treated as `ok` rather than dividing by zero - a fresh yard has no store yet.
 */
export function storagePressure(state: SimState): StoragePressure {
  const capacity = Math.max(0, Math.floor(state.storeCapacity));
  const units = Math.max(0, Math.floor(state.storeUnits));
  const overflowUnits = state.overflow.reduce(
    (total, item) => total + Math.max(0, Math.floor(item.qty)),
    0,
  );
  const percent = capacity > 0 ? wholePercent(units / capacity) : 0;
  const tier: StorageTier =
    capacity > 0 && units >= capacity
      ? "full"
      : percent >= 90 || overflowUnits > 0
        ? "high"
        : "ok";
  return { tier, units, capacity, percent, overflowUnits };
}

export interface PowerCue {
  percent: number;
  limited: number;
}

/**
 * Null when the yard is comfortably powered (ratio >= 99.9%) and no machine is
 * power-limited, so a healthy yard shows no power chip at all. Otherwise the
 * whole-percent draw and the count of limited machines, both as text.
 */
export function powerCue(state: SimState): PowerCue | null {
  const limited = state.machines.filter((m) => m.status === "powerLimited").length;
  if (state.powerRatio >= 0.999 && limited === 0) return null;
  return { percent: wholePercent(state.powerRatio), limited };
}

export interface ProductionCue {
  starved: number;
  outputFull: number;
}

/**
 * Null unless at least one machine is starved or output-full. Counts only; the
 * component names the condition in words next to a gear glyph.
 */
export function productionCue(state: SimState): ProductionCue | null {
  let starved = 0;
  let outputFull = 0;
  for (const m of state.machines) {
    if (m.status === "starved") starved += 1;
    else if (m.status === "outputFull") outputFull += 1;
  }
  return starved + outputFull > 0 ? { starved, outputFull } : null;
}