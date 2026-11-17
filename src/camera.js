/**
 * Rustwake V2 camera math. Engine-independent, deterministic orthographic
 * screen <-> Y=0 ground projection shared by mouse, touch and tests.
 *
 * Coordinate contract: world is right-handed (X east, Y up, Z south);
 * yaw=0 looks from +Z, yaw=45 is the approved isometric camera;
 * elevation is measured up from the ground; zoom is unitless.
 * Camera frustum has vertical world span 80/zoom, as in world.js.
 *
 * Ground-anchored interaction (CRITICAL UX INVARIANT):
 * For a drag from screen p0 to p1, the world point under p0 at mouse-down
 * remains under p1 afterward. Delta-only pan is wrong at low elevations
 * because it omits the 1/sin(elevation) correction.
 */
export const CAMERA_LIMITS = Object.freeze({
  minZoom: 0.20,
  maxZoom: 12,
  minElevation: 20,
  maxElevation: 80,
  panExtent: 90,
  frustumHeight: 80
});

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const degrees = (v) => v * Math.PI / 180;
export const wrapAngle = value => ((value % 360) + 360) % 360;

export function normalizeCamera(view) {
  return {
    ...view,
    yaw: wrapAngle(Number.isFinite(view.yaw) ? view.yaw : 45),
    elevation: clamp(Number.isFinite(view.elevation) ? view.elevation : 35.264, CAMERA_LIMITS.minElevation, CAMERA_LIMITS.maxElevation),
    zoom: clamp(Number.isFinite(view.zoom) ? view.zoom : 1, CAMERA_LIMITS.minZoom, CAMERA_LIMITS.maxZoom),
    x: clamp(Number.isFinite(view.x) ? view.x : 0, -CAMERA_LIMITS.panExtent, CAMERA_LIMITS.panExtent),
    z: clamp(Number.isFinite(view.z) ? view.z : 0, -CAMERA_LIMITS.panExtent, CAMERA_LIMITS.panExtent)
  };
}

/** CSS-pixel location relative to the actual canvas, NOT to the window. */
export function groundAtScreen(camera, pixel, viewport) {
  const c = normalizeCamera(camera);
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
      viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("Camera viewport needs nonzero CSS width and height");
  }
  const worldPerPixel = CAMERA_LIMITS.frustumHeight / (viewport.height * c.zoom);
  const u = (pixel.x - viewport.width / 2) * worldPerPixel;
  const v = (viewport.height / 2 - pixel.y) * worldPerPixel;
  const theta = degrees(c.yaw);
  const sine = Math.sin(degrees(c.elevation)); // bounded away from zero
  const cs = Math.cos(theta), sn = Math.sin(theta);
  return {
    x: c.x + cs * u - sn * (v / sine),
    z: c.z - sn * u - cs * (v / sine)
  };
}

/** Move only the camera target: keeps a selected ground coordinate under pixel. */
export function pinGroundToPixel(camera, ground, pixel, viewport) {
  const c = normalizeCamera(camera);
  const belowPixel = groundAtScreen(c, pixel, viewport);
  return normalizeCamera({
    ...c,
    x: c.x + (ground.x - belowPixel.x),
    z: c.z + (ground.z - belowPixel.z)
  });
}

/** Zoom about a cursor / gesture centroid without letting its terrain slide. */
export function zoomAtPixel(camera, nextZoom, pixel, viewport) {
  const c = normalizeCamera(camera);
  const anchor = groundAtScreen(c, pixel, viewport);
  return pinGroundToPixel({ ...c, zoom:nextZoom }, anchor, pixel, viewport);
}

/** Change orbit/tilt while preserving a point under the gesture's centroid. */
export function orbitAtPixel(camera, deltaYaw, deltaElevation, pixel, viewport) {
  const c = normalizeCamera(camera), anchor = groundAtScreen(c, pixel, viewport);
  return pinGroundToPixel({
    ...c,
    yaw: c.yaw + deltaYaw,
    elevation: c.elevation + deltaElevation
  },anchor,pixel,viewport);
}

/** For a drag, use the ground anchor stored at pointer-down, not the last frame.
    This prevents accumulated drift and makes 1px cursor motion track 1px terrain. */
export function panWithAnchor(camera, pointerDownGround, currentPixel, viewport) {
  return pinGroundToPixel(camera, pointerDownGround, currentPixel, viewport);
}

/** Two-touch gesture: simultaneous rotate+pinch+pan around original ground. */
export function transformGesture(camera, anchorGround, nextPixel, viewport, zoomRatio, deltaYaw) {
  const c = normalizeCamera(camera);
  return pinGroundToPixel({
    ...c,
    zoom: clamp(c.zoom * zoomRatio, CAMERA_LIMITS.minZoom, CAMERA_LIMITS.maxZoom),
    yaw: c.yaw + deltaYaw
  }, anchorGround, nextPixel, viewport);
}
