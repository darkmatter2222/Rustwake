// State-driven hoist pivot for the crane blockout (issue #130).
// Bounds come from the authored glTF clip "hoist_lift": translation y
// 0.4 -> 1.2 over 1.8s (docs/vision/assets/generated/crane.gltf).
// Pure module: no DOM, no wall clock; callers supply dt.
export const HOIST_MIN_Y = 0.4;
export const HOIST_MAX_Y = 1.2;
export const HOIST_CLIP_SECONDS = 1.8;
export const HOIST_SPEED = (HOIST_MAX_Y - HOIST_MIN_Y) / HOIST_CLIP_SECONDS;
export const GRIP_HOLD_SECONDS = 0.6;

export function createHoistController({ reducedMotion = false } = {}) {
  let state = "idle"; // idle | lowering | gripping | raising
  let y = HOIST_MAX_Y;
  let holdTimer = 0;

  const clampY = (v) => Math.min(HOIST_MAX_Y, Math.max(HOIST_MIN_Y, v));

  return {
    get state() { return state; },
    get y() { return y; },
    get reducedMotion() { return reducedMotion; },
    /** Begin one bounded lift cycle. No-op unless idle (no re-charge, no restart mid-cycle). */
    startCycle() {
      if (state !== "idle") return false;
      if (reducedMotion) { state = "gripping"; y = HOIST_MIN_Y; holdTimer = 0; }
      else { state = "lowering"; }
      return true;
    },
    /** Advance visual time by dt seconds. Bounds are invariant. */
    tick(dt) {
      if (!(dt > 0)) return;
      if (state === "lowering") {
        y = clampY(y - HOIST_SPEED * dt);
        if (y <= HOIST_MIN_Y) { y = HOIST_MIN_Y; state = "gripping"; holdTimer = 0; }
      } else if (state === "gripping") {
        holdTimer += dt;
        if (holdTimer >= GRIP_HOLD_SECONDS) {
          if (reducedMotion) { state = "idle"; y = HOIST_MAX_Y; }
          else { state = "raising"; }
        }
      } else if (state === "raising") {
        y = clampY(y + HOIST_SPEED * dt);
        if (y >= HOIST_MAX_Y) { y = HOIST_MAX_Y; state = "idle"; }
      }
    },
    reset() { state = "idle"; y = HOIST_MAX_Y; holdTimer = 0; },
  };
}
