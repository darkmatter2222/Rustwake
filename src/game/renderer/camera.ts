/*
 * UI-RESET-50 (G2 wave 2): the camera math the interaction layer steers.
 *
 * `fitCamera` (scene.ts) stays the pinned fit into the usable chrome band; this
 * module owns what happens AFTER the fit — scale clamps, pan limits that know
 * the view and the zoom, zoom anchored at a screen point, and the refit rule
 * that keeps the player's intent across a resize or an opening inspector.
 * Everything here is pure: no DOM, no React, no save bytes.
 */
import {
  WORLD_H,
  WORLD_W,
  fitCamera,
  screenToWorld,
  type Camera,
  type CameraInsets,
  type ViewState,
} from "./scene";

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
 * Keep the camera sensible for the view it renders into:
 *  - scale stays inside the one shared zoom range;
 *  - while the world is larger than the view on an axis, the centre stays far
 *    enough from the world edge that the view never leaves the world;
 *  - while the world fits entirely on an axis, that axis pins to the fitted
 *    centre — which carries the band offset and the shell's rail/inspector
 *    shift, so a zoomed-out yard stays composed in its usable region instead
 *    of drifting under the chrome.
 * `fitted` is the current shell fit (fitToShell), the anchor for the pinned axes.
 */
export function clampCamera(camera: Camera, view: ViewState, fitted: Camera): Camera {
  const scale = clampScale(camera.scale);
  const halfW = view.width / (2 * scale);
  const halfH = view.height / (2 * scale);
  const x =
    halfW >= WORLD_W / 2
      ? fitted.x
      : Math.min(WORLD_W - halfW, Math.max(halfW, camera.x));
  const y =
    halfH >= WORLD_H / 2
      ? fitted.y
      : Math.min(WORLD_H - halfH, Math.max(halfH, camera.y));
  return { x, y, scale };
}

/** Pan by a screen-pixel delta (drag or arrow key), then clamp. */
export function panCamera(
  camera: Camera,
  view: ViewState,
  dxScreen: number,
  dyScreen: number,
  fitted: Camera
): Camera {
  return clampCamera(
    {
      x: camera.x - dxScreen / camera.scale,
      y: camera.y - dyScreen / camera.scale,
      scale: camera.scale,
    },
    view,
    fitted
  );
}

/**
 * Zoom by `factor` while the world point under (sx, sy) — canvas-local CSS px —
 * stays under that point, then clamp. Wheel, pinch and the discrete controls
 * all steer through here, so every zoom keeps the same anchor contract.
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
  const world = screenToWorld(camera, view, sx, sy);
  return clampCamera(
    {
      x: world.x - (sx - view.width / 2) / scale,
      y: world.y - (sy - view.height / 2) / scale,
      scale,
    },
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
 * The refit rule for a layout change (resize, chrome band move, inspector
 * opening): without user intent the fresh fit wins; with intent the player's
 * centre and zoom survive, clamped into what the new view can still show. A
 * zoomed-out axis re-pins to the new fit, so the yard never strands itself
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
