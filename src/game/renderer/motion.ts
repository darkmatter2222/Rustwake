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
