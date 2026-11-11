import type { SimState } from "../../game/simulation/types";

/**
 * UI-RESET-51: a tiny render-time bridge between HudTop and the dock's alert.
 *
 * The App mount contract gives HudTop the `state` prop but gives DockButtons no
 * state at all, and both are rendered in the same pass with HudTop first. Rather
 * than change App/store (owned by the sibling shell issue), HudTop publishes the
 * SimState it is rendering and StorageAlert reads it back.
 *
 * Precedent: `src/ui/text.ts` already keeps module-level `spoken` state for
 * `priceLine`. SimState is mutated in place by the engine, so the published
 * reference always reads the current tick's values - no stale snapshot.
 */
let latest: SimState | null = null;

export function publishHudState(state: SimState): void {
  latest = state;
}

export function hudState(): SimState | null {
  return latest;
}