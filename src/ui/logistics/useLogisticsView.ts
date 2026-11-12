/**
 * UI-RESET-59 (G3): the React binding for the logistics view bridge. Kept separate from
 * `view.ts` so the renderer can import the plain store without pulling React into the
 * game module graph. `useSyncExternalStore` reads the stable snapshot and re-renders only
 * when visibility or focus actually changes.
 */
import { useSyncExternalStore } from "react";
import { getLogisticsView, subscribeLogisticsView, type LogisticsView } from "./view";

export function useLogisticsView(): LogisticsView {
  return useSyncExternalStore(subscribeLogisticsView, getLogisticsView, getLogisticsView);
}
