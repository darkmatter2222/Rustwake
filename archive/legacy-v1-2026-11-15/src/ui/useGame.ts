import { useSyncExternalStore } from "react";
import type { GameStore } from "../app/store";
import type { SimState } from "../game/simulation/types";
import type { SaveSettings } from "../game/persistence/save";

/**
 * The simulation state object is mutated in place for allocation economy, so
 * the numeric revision is the stable snapshot that drives re-renders.
 */
function subscribeOf(store: GameStore) {
  return (onChange: () => void) => store.subscribe(onChange);
}

export function useRevision(store: GameStore): number {
  return useSyncExternalStore(
    subscribeOf(store),
    () => store.getViewVersion(),
    () => store.getViewVersion()
  );
}

export function useSim(store: GameStore): SimState {
  useRevision(store);
  return store.getState();
}

export function useSettings(store: GameStore): SaveSettings {
  useRevision(store);
  return store.getSettings();
}
