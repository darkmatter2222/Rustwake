/*
 * RW3D T07 (#134): the orthographic ground-plane projection the 3D camera and
 * the interaction layer share.
 *
 * The world is a flat yard on the ground plane (world X = yard x, world Z = yard
 * y, world Y = up). The camera looks at a ground target `(x, y)` from a spherical
 * offset given by `yaw` (orbit about the up axis, degrees) and `elev` (elevation
 * above the ground, degrees). `scale` is CSS pixels per world unit, exactly the
 * legacy zoom quantity.
 *
 * DEFAULT ORIENTATION IS TOP-DOWN (yaw 0, elev 90). That is not an art choice —
 * it is the orientation the frozen shell contract (tests/ui/camera-50) pins: at
 * top-down the projection collapses to the legacy 2D mapping byte for byte, so
 * `screenToWorld`/`worldToScreen`, the pan/zoom clamps and the tap mapping keep
 * their exact geometry. Orbit and tilt are additive: setting `yaw`/`elev` engages
 * the general orthographic basis below, which reduces to the same 2D formulas at
 * the default. The isometric art target (yaw 45, elev ~35.264) is a shell/art
 * decision for #135 / G1; flipping the default here would break the pinned tap
 * mapping, so it is documented as a wiring delta rather than silently changed.
 *
 * Everything here is pure: no DOM, no THREE, no React, no save bytes. The THREE
 * module imports these helpers to place its orthographic camera; the 2D overlay
 * imports them to project information glyphs onto the same view.
 */

export interface Camera {
  /** Ground-plane target, yard world units. */
  x: number;
  y: number;
  /** CSS pixels per world unit (the one shared zoom quantity). */
  scale: number;
  /** Orbit about the up axis, degrees. Absent => 0 (top-down). */
  yaw?: number;
  /** Elevation above the ground plane, degrees. Absent => 90 (top-down). */
  elev?: number;
}

export interface ViewState {
  width: number;
  height: number;
}

/**
 * L-1: the unobstructed vertical band the world has to live in, as measured edges
 * of the chrome painted over the canvas. Re-exported from scene.ts for the fit.
 */
export interface CameraInsets {
  top: number;
  bottom: number;
}

export const DEFAULT_YAW = 0;
export const DEFAULT_ELEV = 90;
/** Tilt floor: keeps sin(elev) well away from zero so the ground inverse is stable. */
export const ELEV_MIN = 20;
export const ELEV_MAX = 90;

export function yawOf(camera: Camera): number {
  return camera.yaw ?? DEFAULT_YAW;
}

export function elevOf(camera: Camera): number {
  return camera.elev ?? DEFAULT_ELEV;
}

/** True when the camera is the pinned top-down default (the legacy 2D mapping). */
export function isTopDown(camera: Camera): boolean {
  return yawOf(camera) === DEFAULT_YAW && elevOf(camera) === DEFAULT_ELEV;
}

/** Wrap an orbit angle into [0, 360). Quarter turns land on exact multiples of 90. */
export function normalizeYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return DEFAULT_YAW;
  return ((yaw % 360) + 360) % 360;
}

export function clampElev(elev: number): number {
  if (!Number.isFinite(elev)) return DEFAULT_ELEV;
  return Math.min(ELEV_MAX, Math.max(ELEV_MIN, elev));
}

/** The horizontal right / ground-depth basis for the current orbit, in radians. */
function basis(camera: Camera): { cosT: number; sinT: number; sinP: number } {
  const theta = (yawOf(camera) * Math.PI) / 180;
  const phi = (elevOf(camera) * Math.PI) / 180;
  return { cosT: Math.cos(theta), sinT: Math.sin(theta), sinP: Math.sin(phi) };
}

/**
 * Project a ground point to canvas-local CSS pixels.
 *
 * General orthographic basis (right = (cosT, 0, -sinT), up projected to ground =
 * (-sinT*sinP, 0, -cosT*sinP)):
 *   sx = (dx*cosT - dz*sinT) * scale + width/2
 *   sy = sinP * (dx*sinT + dz*cosT) * scale + height/2
 * At yaw 0 / elev 90 this is exactly `(dx*scale + width/2, dz*scale + height/2)`,
 * so the top-down fast path below is bit-identical to the legacy mapping.
 */
export function worldToScreen(
  camera: Camera,
  view: ViewState,
  x: number,
  y: number
): { x: number; y: number } {
  if (isTopDown(camera)) {
    return {
      x: (x - camera.x) * camera.scale + view.width / 2,
      y: (y - camera.y) * camera.scale + view.height / 2,
    };
  }
  const { cosT, sinT, sinP } = basis(camera);
  const dx = x - camera.x;
  const dz = y - camera.y;
  return {
    x: (dx * cosT - dz * sinT) * camera.scale + view.width / 2,
    y: sinP * (dx * sinT + dz * cosT) * camera.scale + view.height / 2,
  };
}

/**
 * Inverse of `worldToScreen`: the ground point under a canvas-local CSS pixel.
 * This is the orthographic ray cast onto the y=0 plane, so a tap maps to the same
 * ground cell the 3D raycaster hits at ground level. Top-down is the legacy 2D
 * inverse, byte for byte.
 */
export function screenToWorld(
  camera: Camera,
  view: ViewState,
  sx: number,
  sy: number
): { x: number; y: number } {
  if (isTopDown(camera)) {
    return {
      x: (sx - view.width / 2) / camera.scale + camera.x,
      y: (sy - view.height / 2) / camera.scale + camera.y,
    };
  }
  const { cosT, sinT, sinP } = basis(camera);
  const a = (sx - view.width / 2) / camera.scale;
  const b = (sy - view.height / 2) / camera.scale;
  const c = b / sinP;
  return {
    x: camera.x + a * cosT + c * sinT,
    y: camera.y - a * sinT + c * cosT,
  };
}

/**
 * Half-extents of the view rectangle projected onto the ground plane (the AABB of
 * the inverse-projected corners). The pan clamp uses these so the visible ground
 * never leaves the world under any orbit. At top-down they are exactly the legacy
 * `width/(2*scale)` / `height/(2*scale)`.
 */
export function groundHalfExtents(
  camera: Camera,
  view: ViewState
): { hx: number; hy: number } {
  const { cosT, sinT, sinP } = basis(camera);
  const halfW = view.width / (2 * camera.scale);
  const halfD = view.height / (2 * camera.scale * sinP);
  const ac = Math.abs(cosT);
  const as = Math.abs(sinT);
  return {
    hx: halfW * ac + halfD * as,
    hy: halfW * as + halfD * ac,
  };
}

/**
 * The ground-plane target delta that makes the world follow a screen-pixel drag
 * `(dxScreen, dyScreen)`. Pan subtracts this from the target. Top-down reduces to
 * `(dxScreen/scale, dyScreen/scale)`.
 */
export function screenDeltaToWorld(
  camera: Camera,
  _view: ViewState,
  dxScreen: number,
  dyScreen: number
): { dx: number; dy: number } {
  if (isTopDown(camera)) {
    return { dx: dxScreen / camera.scale, dy: dyScreen / camera.scale };
  }
  const { cosT, sinT, sinP } = basis(camera);
  const a = dxScreen / camera.scale;
  const c = dyScreen / camera.scale / sinP;
  return { dx: a * cosT + c * sinT, dy: -a * sinT + c * cosT };
}

/**
 * The new ground target that keeps the world point under `(sx, sy)` fixed when the
 * scale changes to `newScale` (pointer-centered zoom). The caller clamps the scale
 * and the result. Top-down reduces to the legacy anchor expression.
 */
export function zoomAnchorTarget(
  camera: Camera,
  view: ViewState,
  sx: number,
  sy: number,
  newScale: number
): { x: number; y: number } {
  const world = screenToWorld(camera, view, sx, sy);
  if (isTopDown(camera)) {
    return {
      x: world.x - (sx - view.width / 2) / newScale,
      y: world.y - (sy - view.height / 2) / newScale,
    };
  }
  const { cosT, sinT, sinP } = basis(camera);
  const a = (sx - view.width / 2) / newScale;
  const c = (sy - view.height / 2) / newScale / sinP;
  return {
    x: world.x - (a * cosT + c * sinT),
    y: world.y - (-a * sinT + c * cosT),
  };
}

/** A quarter turn (visible rotate buttons / Q,E) snaps yaw by +/-90 degrees. */
export function quarterTurnYaw(camera: Camera, direction: 1 | -1): number {
  return normalizeYaw(yawOf(camera) + direction * 90);
}