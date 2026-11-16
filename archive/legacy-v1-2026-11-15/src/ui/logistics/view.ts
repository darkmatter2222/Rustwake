/**
 * UI-RESET-59 (G3): the logistics view bridge.
 *
 * The canvas renderer (`src/game/renderer/scene.ts`) and the inspector panels need to
 * share two pieces of ephemeral view state — whether belt routes are painted at all, and
 * which single route is focused from a bottleneck list — without editing `App.tsx` or
 * `Hud.tsx` (owned by #62). This module is that bridge: a plain, framework-free store with
 * a stable snapshot reference, so `useSyncExternalStore` can subscribe without tearing and
 * the renderer can read the current value synchronously inside `drawRoutes`.
 *
 * It holds NO simulation state and dispatches NO command. Routes visibility and focus are
 * presentation only: hiding routes never removes them, and focusing a route never changes
 * the machine selection. Defaults keep the world exactly as it shipped (routes visible,
 * nothing focused), so the rest frame adds nothing.
 */

export interface LogisticsView {
  /** When false the canvas skips the route layer entirely (avoids permanent clutter). */
  readonly routesVisible: boolean;
  /** A single route revealed from the bottleneck overview, or null. */
  readonly focusedRouteId: number | null;
}

const DEFAULT_VIEW: LogisticsView = { routesVisible: true, focusedRouteId: null };

let snapshot: LogisticsView = DEFAULT_VIEW;
const listeners = new Set<() => void>();

/** The current snapshot. Stable reference between changes (safe for useSyncExternalStore). */
export function getLogisticsView(): LogisticsView {
  return snapshot;
}

function publish(next: LogisticsView): void {
  if (
    next.routesVisible === snapshot.routesVisible &&
    next.focusedRouteId === snapshot.focusedRouteId
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

export function setRoutesVisible(visible: boolean): void {
  publish({ ...snapshot, routesVisible: visible });
}

export function toggleRoutesVisible(): void {
  setRoutesVisible(!snapshot.routesVisible);
}

export function setFocusedRoute(routeId: number | null): void {
  publish({ ...snapshot, focusedRouteId: routeId });
}

export function subscribeLogisticsView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Test helper: restore the shipped defaults and notify subscribers. The bridge is a
 * module global, so a test that toggles visibility or focus must reset it between cases
 * to avoid leaking view state into the next mount.
 */
export function resetLogisticsView(): void {
  snapshot = DEFAULT_VIEW;
  for (const listener of listeners) listener();
}
