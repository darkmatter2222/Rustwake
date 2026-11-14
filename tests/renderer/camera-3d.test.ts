import { describe, expect, it } from "vitest";
import {
  CAMERA_MAX_SCALE,
  CAMERA_MIN_SCALE,
  ZOOM_STEP,
  clampCamera,
  clampScale,
  orbitCamera,
  panCamera,
  quarterTurn,
  refitCamera,
  zoomAtPoint,
  zoomStep,
} from "../../src/game/renderer/camera";
import {
  ELEV_MAX,
  ELEV_MIN,
  groundHalfExtents,
  screenToWorld,
  worldToScreen,
  type Camera,
  type ViewState,
} from "../../src/game/renderer/projection";
import { WORLD_H, WORLD_W, fitCamera } from "../../src/game/renderer/scene";

/**
 * RW3D T07 (#134): the orbit-aware camera contract.
 *
 * Two layers are pinned here:
 *  1. TOP-DOWN BIT PARITY — with no yaw/elev keys every operation must equal the
 *     legacy 2D expression exactly (toBe, not closeTo) and return exactly
 *     `{ x, y, scale }`, because the frozen shell tests (tests/ui/camera-50)
 *     still steer the default orientation.
 *  2. ORBIT GEOMETRY — pan follows the finger on the ground plane, zoom keeps
 *     the anchored ground point under the pointer, quarter turns snap to exact
 *     multiples of 90, and the pan clamp uses the projected view AABB so the
 *     visible ground never leaves the world under any orbit.
 *
 * Resize coverage here is the usable-band rectangle (V03 partial): full V03
 * breakpoint/orbit resize coverage is owed at G1 (#151).
 */

const view: ViewState = { width: 960, height: 640 };
const fitted: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 1.4 };

/** The legacy clamp, re-implemented independently for the parity assertions. */
function legacyClamp(camera: Camera, v: ViewState, fit: Camera): Camera {
  const scale = Math.min(CAMERA_MAX_SCALE, Math.max(CAMERA_MIN_SCALE, camera.scale));
  const halfW = v.width / (2 * scale);
  const halfH = v.height / (2 * scale);
  return {
    x: halfW >= WORLD_W / 2 ? fit.x : Math.min(WORLD_W - halfW, Math.max(halfW, camera.x)),
    y: halfH >= WORLD_H / 2 ? fit.y : Math.min(WORLD_H - halfH, Math.max(halfH, camera.y)),
    scale,
  };
}

describe("top-down bit parity with the legacy 2D contract", () => {
  const cameras: Camera[] = [
    { x: WORLD_W / 2, y: WORLD_H / 2, scale: 1.4 },
    { x: 40, y: 60, scale: 6 },
    { x: WORLD_W - 10, y: WORLD_H - 10, scale: 2.5 },
    { x: -500, y: 9999, scale: 0.01 },
    { x: 123.456, y: 78.9, scale: 3.14159 },
  ];

  it("clampCamera equals the legacy expression bit for bit", () => {
    for (const camera of cameras) {
      const got = clampCamera(camera, view, fitted);
      const want = legacyClamp(camera, view, fitted);
      expect(got.x).toBe(want.x);
      expect(got.y).toBe(want.y);
      expect(got.scale).toBe(want.scale);
      expect(Object.keys(got)).toEqual(["x", "y", "scale"]);
    }
  });

  it("panCamera equals the legacy screen-delta pan bit for bit", () => {
    for (const camera of cameras) {
      for (const [dx, dy] of [[37, -21], [-100, 100], [0, 0]] as const) {
        const got = panCamera(camera, view, dx, dy, fitted);
        const want = legacyClamp(
          { x: camera.x - dx / camera.scale, y: camera.y - dy / camera.scale, scale: camera.scale },
          view,
          fitted
        );
        expect(got.x).toBe(want.x);
        expect(got.y).toBe(want.y);
        expect(got.scale).toBe(want.scale);
        expect(Object.keys(got)).toEqual(["x", "y", "scale"]);
      }
    }
  });

  it("zoomAtPoint equals the legacy anchor expression bit for bit", () => {
    for (const camera of cameras) {
      for (const [factor, sx, sy] of [[1.25, 100, 120], [0.8, 900, 600], [2, 480, 320]] as const) {
        const got = zoomAtPoint(camera, view, factor, sx, sy, fitted);
        const scale = Math.min(CAMERA_MAX_SCALE, Math.max(CAMERA_MIN_SCALE, camera.scale * factor));
        const wx = (sx - view.width / 2) / camera.scale + camera.x;
        const wy = (sy - view.height / 2) / camera.scale + camera.y;
        const want = legacyClamp(
          { x: wx - (sx - view.width / 2) / scale, y: wy - (sy - view.height / 2) / scale, scale },
          view,
          fitted
        );
        expect(got.x).toBe(want.x);
        expect(got.y).toBe(want.y);
        expect(got.scale).toBe(want.scale);
        expect(Object.keys(got)).toEqual(["x", "y", "scale"]);
      }
    }
  });

  it("zoomStep and refitCamera keep the legacy shape and values", () => {
    const camera: Camera = { x: 200, y: 150, scale: 2 };
    const inStep = zoomStep(camera, view, 1, fitted);
    expect(inStep.scale).toBe(Math.min(CAMERA_MAX_SCALE, 2 * ZOOM_STEP));
    expect(Object.keys(inStep)).toEqual(["x", "y", "scale"]);
    const kept = refitCamera(camera, fitted, view, true);
    const want = legacyClamp(camera, view, fitted);
    expect(kept.x).toBe(want.x);
    expect(kept.y).toBe(want.y);
    expect(refitCamera(camera, fitted, view, false)).toEqual({ ...fitted });
  });

  it("clampScale keeps the one shared zoom range and rejects non-finite input", () => {
    expect(clampScale(0)).toBe(CAMERA_MIN_SCALE);
    expect(clampScale(100)).toBe(CAMERA_MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(Number.NaN)).toBe(CAMERA_MIN_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(CAMERA_MIN_SCALE);
  });
});

describe("orbit geometry", () => {
  const orbit: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 2.5, yaw: 45, elev: 35 };

  it("ground half-extents grow with orbit and reduce exactly at top-down", () => {
    const top = groundHalfExtents({ x: 0, y: 0, scale: 2 }, view);
    expect(top.hx).toBe(view.width / (2 * 2));
    expect(top.hy).toBe(view.height / (2 * 2));
    const tilted = groundHalfExtents({ ...orbit, scale: 2 }, view);
    expect(tilted.hx).toBeGreaterThan(view.width / (2 * 2));
    expect(tilted.hy).toBeGreaterThan(view.height / (2 * 2));
  });

  it("the pan clamp keeps the projected view rectangle inside the world", () => {
    for (const yaw of [0, 45, 90, 180, 270]) {
      for (const elev of [20, 35, 90]) {
        const camera: Camera = { x: -9000, y: 99999, scale: 4, yaw, elev };
        const clamped = clampCamera(camera, view, fitted);
        const { hx, hy } = groundHalfExtents(clamped, view);
        if (hx < WORLD_W / 2) {
          expect(clamped.x - hx).toBeGreaterThanOrEqual(-1e-9);
          expect(clamped.x + hx).toBeLessThanOrEqual(WORLD_W + 1e-9);
        } else {
          expect(clamped.x).toBe(fitted.x);
        }
        if (hy < WORLD_H / 2) {
          expect(clamped.y - hy).toBeGreaterThanOrEqual(-1e-9);
          expect(clamped.y + hy).toBeLessThanOrEqual(WORLD_H + 1e-9);
        } else {
          expect(clamped.y).toBe(fitted.y);
        }
      }
    }
  });

  // The anchor invariants apply while the view is smaller than the world (zoomed
  // in). A phone-sized region at scale 4-6 keeps both axes inside the pan clamp;
  // when the whole yard fits, the legacy pin-to-fit rule takes over (tested above).
  const closeView: ViewState = { width: 320, height: 240 };
  const closeFit: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 1.4 };

  it("pan follows the finger: the grabbed ground point stays under the pointer", () => {
    for (const yaw of [0, 45, 90, 270]) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 4, yaw, elev: 40 };
      const sx = 240;
      const sy = 60;
      const grabbed = screenToWorld(camera, closeView, sx, sy);
      const panned = panCamera(camera, closeView, 60, -40, closeFit);
      const after = screenToWorld(panned, closeView, sx + 60, sy - 40);
      expect(after.x).toBeCloseTo(grabbed.x, 6);
      expect(after.y).toBeCloseTo(grabbed.y, 6);
    }
  });

  it("pointer-centered zoom keeps the anchored ground point under the pointer", () => {
    for (const [yaw, elev] of [[0, 90], [45, 35], [90, 20], [315, 60]] as const) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 5, yaw, elev };
      // Near-centre anchor: at the extreme tilt a far-corner anchor would zoom
      // out past the world edge, where the clamp (correctly) takes over.
      const sx = 200;
      const sy = 100;
      const anchor = screenToWorld(camera, closeView, sx, sy);
      for (const factor of [1.25, 0.8]) {
        const zoomed = zoomAtPoint(camera, closeView, factor, sx, sy, closeFit);
        const after = screenToWorld(zoomed, closeView, sx, sy);
        expect(after.x).toBeCloseTo(anchor.x, 6);
        expect(after.y).toBeCloseTo(anchor.y, 6);
      }
    }
  });

  it("orbitCamera wraps yaw, clamps elev and preserves the ground target intent", () => {
    const turned = orbitCamera(orbit, view, 400, 0, fitted);
    expect(turned.yaw).toBeCloseTo(85, 9);
    const tilted = orbitCamera(orbit, view, 0, -100, fitted);
    expect(tilted.elev).toBe(ELEV_MIN);
    const up = orbitCamera(orbit, view, 0, 100, fitted);
    expect(up.elev).toBe(ELEV_MAX);
    const negative = orbitCamera({ ...orbit, yaw: 10 }, view, -30, 0, fitted);
    expect(negative.yaw).toBeCloseTo(340, 9);
  });

  it("quarter turns snap to exact multiples of 90 and close the loop", () => {
    let camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 2.5 };
    const seen: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      camera = quarterTurn(camera, view, 1, fitted);
      seen.push(camera.yaw as number);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
    const back = quarterTurn({ ...camera, yaw: 0 }, view, -1, fitted);
    expect(back.yaw).toBe(270);
    expect(camera.scale).toBe(2.5);
  });

  it("orientation keys survive only when the input carried them", () => {
    const plain = panCamera({ x: 100, y: 100, scale: 3 }, view, 10, 10, fitted);
    expect(Object.keys(plain)).toEqual(["x", "y", "scale"]);
    const orbited = panCamera(orbit, view, 10, 10, fitted);
    expect(orbited.yaw).toBe(45);
    expect(orbited.elev).toBe(35);
  });
});

describe("resize: the usable world rectangle (V03 partial; full coverage owed at #151)", () => {
  it("fitCamera centres the world in the usable band, not the canvas", () => {
    const insets = { top: 64, bottom: 96 };
    const fit = fitCamera(view, insets);
    const centre = worldToScreen(fit, view, WORLD_W / 2, WORLD_H / 2);
    const bandCentre = insets.top + (view.height - insets.top - insets.bottom) / 2;
    expect(centre.x).toBeCloseTo(view.width / 2, 9);
    expect(centre.y).toBeCloseTo(bandCentre, 6);
  });

  it("the fitted world rectangle fits the usable band on both axes", () => {
    for (const v of [view, { width: 390, height: 844 }, { width: 1440, height: 900 }] as const) {
      for (const insets of [{ top: 64, bottom: 96 }, { top: 120, bottom: 200 }] as const) {
        const fit = fitCamera(v, insets);
        const usableH = v.height - insets.top - insets.bottom;
        expect(WORLD_W * fit.scale).toBeLessThanOrEqual(v.width + 1e-9);
        expect(WORLD_H * fit.scale).toBeLessThanOrEqual(usableH + 1e-9);
        const tl = worldToScreen(fit, v, 0, 0);
        const br = worldToScreen(fit, v, WORLD_W, WORLD_H);
        expect(tl.y).toBeGreaterThanOrEqual(insets.top - 1e-6);
        expect(br.y).toBeLessThanOrEqual(v.height - insets.bottom + 1e-6);
      }
    }
  });

  it("an opening inspector (narrower region) refits without stranding the yard", () => {
    const insets = { top: 64, bottom: 96 };
    const wide: ViewState = { width: 960, height: 640 };
    const narrow: ViewState = { width: 600, height: 640 };
    const before = fitCamera(wide, insets);
    const intent: Camera = { x: 120, y: 90, scale: 4, yaw: 45, elev: 35 };
    const afterFit = fitCamera(narrow, insets);
    const kept = refitCamera(intent, afterFit, narrow, true);
    // Intent survives: zoom and orbit are the player's, clamped into the new region.
    expect(kept.scale).toBe(4);
    expect(kept.yaw).toBe(45);
    expect(kept.elev).toBe(35);
    const { hx, hy } = groundHalfExtents(kept, narrow);
    if (hx < WORLD_W / 2) {
      expect(kept.x - hx).toBeGreaterThanOrEqual(-1e-9);
      expect(kept.x + hx).toBeLessThanOrEqual(WORLD_W + 1e-9);
    } else {
      expect(kept.x).toBe(afterFit.x);
    }
    if (hy < WORLD_H / 2) {
      expect(kept.y - hy).toBeGreaterThanOrEqual(-1e-9);
      expect(kept.y + hy).toBeLessThanOrEqual(WORLD_H + 1e-9);
    } else {
      expect(kept.y).toBe(afterFit.y);
    }
    // Without intent the fresh fit wins, and it still fits the narrower band.
    const fresh = refitCamera(intent, afterFit, narrow, false);
    expect(fresh).toEqual({ ...afterFit });
    expect(WORLD_W * fresh.scale).toBeLessThanOrEqual(narrow.width + 1e-9);
    expect(before.scale).toBeGreaterThanOrEqual(fresh.scale);
  });

  it("a zoomed-out axis re-pins to the new fit after a breakpoint switch", () => {
    const wide: ViewState = { width: 1440, height: 900 };
    const phone: ViewState = { width: 390, height: 844 };
    const insets = { top: 64, bottom: 96 };
    const zoomedOut: Camera = { x: 10, y: 10, scale: CAMERA_MIN_SCALE };
    const afterFit = fitCamera(phone, insets);
    const kept = refitCamera(zoomedOut, afterFit, phone, true);
    const { hx, hy } = groundHalfExtents(kept, phone);
    if (hx >= WORLD_W / 2) expect(kept.x).toBe(afterFit.x);
    if (hy >= WORLD_H / 2) expect(kept.y).toBe(afterFit.y);
    expect(kept.scale).toBe(CAMERA_MIN_SCALE);
    expect(wide.width).toBeGreaterThan(phone.width);
  });
});