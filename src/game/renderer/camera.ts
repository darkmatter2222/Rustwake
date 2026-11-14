/*
 * RW3D T07 (#134): the camera math the interaction layer steers, now orbit-aware.
 *
 * `fitCamera` (scene.ts) stays the pinned fit into the usable chrome band; this
 * module owns what happens AFTER the fit — scale clamps, pan limits that know
 * the view, the zoom and the orbit, zoom anchored at a screen point, and the
 * refit rule that keeps the player's intent across a resize or an opening
 * inspector. Everything here is pure: no DOM, no React, no save bytes.
 *
 * Top-down (no yaw/elev keys) is bit-identical to the legacy 2D contract the
 * frozen shell tests pin: every helper reduces to the exact old expression and
 * the returned object carries no orientation keys unless the input had them.
 * Orbit/tilt engage the general ground-plane basis from projection.ts; the pan
 * clamp uses the projected view AABB (groundHalfExtents) so the visible ground
 * never leaves the world under any orbit.
 */
import {
  WORLD_H,
  WORLD_W,
  fitCamera,
  type Camera,
  type CameraInsets,
  type ViewState,
} from "./scene";
import {
  clampElev,
  elevOf,
  groundHalfExtents,
  normalizeYaw,
  quarterTurnYaw,
  screenDeltaToWorld,
  yawOf,
  zoomAnchorTarget,
} from "./projection";

/** One shared zoom range for wheel, pinch, keys and the visible controls. */
export const CAMERA_MIN_SCALE = 1.2;
export const CAMERA_MAX_SCALE = 6;
/** One step of the discrete controls (buttons, +/- keys). */
export const ZOOM_STEP = 1.25;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return CAMERA_MIN_SCALE;
  return Math.min(CAMERA_MAX_SCALE, Math.max(CAMERA_MIN_SCALE, scale));
}

/**
 * Orientation keys survive a camera operation only when the input carried them,
 * so the top-down object shape stays exactly `{ x, y, scale }`. Present keys are
 * normalized (yaw wrapped to [0,360), elev clamped to the tilt floor/ceiling).
 */
function orientationOf(camera: Camera): Partial<Pick<Camera, "yaw" | "elev">> {
  const out: Partial<Pick<Camera, "yaw" | "elev">> = {};
  if (camera.yaw !== undefined) out.yaw = normalizeYaw(camera.yaw);
  if (camera.elev !== undefined) out.elev = clampElev(camera.elev);
  return out;
}

/**
 * Keep the camera sensible for the view it renders into:
 *  - scale stays inside the one shared zoom range;
 *  - while the projected view rectangle is larger than the world on an axis,
 *    the centre stays far enough from the world edge that the visible ground
 *    never leaves the world (the AABB half-extents know the orbit);
 *  - while the world fits entirely on an axis, that axis pins to the fitted
 *    centre — which carries the band offset and the shell's rail/inspector
 *    shift, so a zoomed-out yard stays composed in its usable region instead
 *    of drifting under the chrome.
 * `fitted` is the current shell fit (fitToShell), the anchor for the pinned axes.
 * At top-down the half-extents are exactly `width/(2*scale)` / `height/(2*scale)`,
 * so this is the legacy clamp byte for byte.
 */
export function clampCamera(camera: Camera, view: ViewState, fitted: Camera): Camera {
  const scale = clampScale(camera.scale);
  const { hx, hy } = groundHalfExtents({ ...camera, scale }, view);
  const x =
    hx >= WORLD_W / 2
      ? fitted.x
      : Math.min(WORLD_W - hx, Math.max(hx, camera.x));
  const y =
    hy >= WORLD_H / 2
      ? fitted.y
      : Math.min(WORLD_H - hy, Math.max(hy, camera.y));
  return { x, y, scale, ...orientationOf(camera) };
}

/** Pan by a screen-pixel delta (drag or arrow key), then clamp. Under orbit the
 * delta is rotated/un-tilted onto the ground plane so the world follows the finger. */
export function panCamera(
  camera: Camera,
  view: ViewState,
  dxScreen: number,
  dyScreen: number,
  fitted: Camera
): Camera {
  const d = screenDeltaToWorld(camera, view, dxScreen, dyScreen);
  return clampCamera(
    {
      x: camera.x - d.dx,
      y: camera.y - d.dy,
      scale: camera.scale,
      ...orientationOf(camera),
    },
    view,
    fitted
  );
}

/**
 * Zoom by `factor` while the world point under (sx, sy) — canvas-local CSS px —
 * stays under that point, then clamp. Wheel, pinch and the discrete controls
 * all steer through here, so every zoom keeps the same anchor contract, also
 * under orbit (the anchor is the ground point, not a screen-space shortcut).
 */
export function zoomAtPoint(
  camera: Camera,
  view: ViewState,
  factor: number,
  sx: number,
  sy: number,
  fitted: Camera
): Camera {
  const scale = clampScale(camera.scale * factor);
  const target = zoomAnchorTarget(camera, view, sx, sy, scale);
  return clampCamera(
    { x: target.x, y: target.y, scale, ...orientationOf(camera) },
    view,
    fitted
  );
}

/** One discrete step (button / key) anchored at the view centre. */
export function zoomStep(
  camera: Camera,
  view: ViewState,
  direction: 1 | -1,
  fitted: Camera
): Camera {
  return zoomAtPoint(
    camera,
    view,
    direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
    view.width / 2,
    view.height / 2,
    fitted
  );
}

/**
 * Orbit by screen-space deltas (right-drag / two-finger twist): yaw wraps, elev
 * clamps to [ELEV_MIN, ELEV_MAX], then the pan clamp re-composes the view for the
 * new orientation. The ground target and zoom are untouched by the rotation.
 */
export function orbitCamera(
  camera: Camera,
  view: ViewState,
  dYaw: number,
  dElev: number,
  fitted: Camera
): Camera {
  return clampCamera(
    {
      x: camera.x,
      y: camera.y,
      scale: camera.scale,
      yaw: normalizeYaw(yawOf(camera) + dYaw),
      elev: clampElev(elevOf(camera) + dElev),
    },
    view,
    fitted
  );
}

/** A quarter turn (visible rotate buttons / Q,E) snaps yaw by exactly +/-90. */
export function quarterTurn(
  camera: Camera,
  view: ViewState,
  direction: 1 | -1,
  fitted: Camera
): Camera {
  return clampCamera(
    {
      x: camera.x,
      y: camera.y,
      scale: camera.scale,
      yaw: quarterTurnYaw(camera, direction),
      elev: elevOf(camera),
    },
    view,
    fitted
  );
}

/**
 * The refit rule for a layout change (resize, chrome band move, inspector
 * opening): without user intent the fresh fit wins; with intent the player's
 * centre, zoom and orbit survive, clamped into what the new view can still show.
 * A zoomed-out axis re-pins to the new fit, so the yard never strands itself
 * under the rail or off the band after a breakpoint switch.
 */
export function refitCamera(
  previous: Camera,
  fitted: Camera,
  view: ViewState,
  keepIntent: boolean
): Camera {
  return keepIntent ? clampCamera(previous, view, fitted) : { ...fitted };
}

/** Re-exported so interaction code has one import surface for the fit itself. */
export { fitCamera };
export type { Camera, CameraInsets, ViewState };