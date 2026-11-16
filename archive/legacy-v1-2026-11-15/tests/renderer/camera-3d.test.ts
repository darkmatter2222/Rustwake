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
import {
  SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX,
  SHELL_DESKTOP_MIN_WIDTH_PX,
  SHELL_PHONE_MAX_WIDTH_PX,
  SHELL_RIGHT_GUTTER_PX,
  SHELL_SHEET_COLLAPSED_VH,
  SHELL_SHEET_EXPANDED_VH,
} from "../../src/ui/shell/layout";

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
 * Resize coverage is full V03 (#151): the usable-band rectangle at every shell
 * breakpoint (layout.ts phone/tablet/desktop/landscape bands), orbit-aware
 * refit across those bands, exact selection/placement projection round-trips
 * at the world edge cells, camera reset, the desktop inspector gutter and the
 * phone sheet. Geometric/numeric assertions only — visual fidelity remains a
 * vision-capable review verdict, never self-certified here.
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

/* The real shell breakpoint bands: layout.ts is the one source of truth the
 * CSS blocks and the App camera-fit share. Both sides of the phone (767/768)
 * and desktop (1023/1024) breakpoints are present so the resize sweep actually
 * crosses them; the landscape band is the short-viewport composition. */
const RESIZE_BANDS: Array<{ name: string; view: ViewState; insets: { top: number; bottom: number } }> = [
  { name: "phone-small", view: { width: 360, height: 640 }, insets: { top: 64, bottom: 96 } },
  { name: "phone", view: { width: 390, height: 844 }, insets: { top: 64, bottom: 96 } },
  {
    name: "phone-sheet",
    view: { width: 390, height: 844 },
    insets: { top: 64, bottom: Math.round((844 * SHELL_SHEET_COLLAPSED_VH) / 100) },
  },
  { name: "phone-max", view: { width: SHELL_PHONE_MAX_WIDTH_PX, height: 800 }, insets: { top: 64, bottom: 96 } },
  { name: "tablet-min", view: { width: SHELL_PHONE_MAX_WIDTH_PX + 1, height: 800 }, insets: { top: 64, bottom: 96 } },
  { name: "desktop-min-minus", view: { width: SHELL_DESKTOP_MIN_WIDTH_PX - 1, height: 800 }, insets: { top: 64, bottom: 96 } },
  { name: "desktop-min", view: { width: SHELL_DESKTOP_MIN_WIDTH_PX, height: 768 }, insets: { top: 64, bottom: 96 } },
  { name: "desktop", view: { width: 1440, height: 900 }, insets: { top: 64, bottom: 96 } },
  { name: "landscape-phone", view: { width: 844, height: 390 }, insets: { top: 64, bottom: 96 } },
];

/** World corners, edge midpoints and centre — the V03 "no unreachable edge
 *  cells" probe set for the projection and usable-band assertions. */
const EDGE_POINTS: Array<[number, number]> = [
  [0, 0],
  [WORLD_W, 0],
  [0, WORLD_H],
  [WORLD_W, WORLD_H],
  [WORLD_W / 2, 0],
  [WORLD_W / 2, WORLD_H],
  [0, WORLD_H / 2],
  [WORLD_W, WORLD_H / 2],
  [WORLD_W / 2, WORLD_H / 2],
];

/** The V03 clamp invariant at any viewport/orbit: the visible ground never
 *  leaves the world, and an axis the whole world fits on pins to the composed
 *  fit centre (which carries the usable-band offset). */
function expectGroundInsideWorld(cam: Camera, v: ViewState, fit: Camera): void {
  const { hx, hy } = groundHalfExtents(cam, v);
  if (hx < WORLD_W / 2) {
    expect(cam.x - hx).toBeGreaterThanOrEqual(-1e-9);
    expect(cam.x + hx).toBeLessThanOrEqual(WORLD_W + 1e-9);
  } else {
    expect(cam.x).toBe(fit.x);
  }
  if (hy < WORLD_H / 2) {
    expect(cam.y - hy).toBeGreaterThanOrEqual(-1e-9);
    expect(cam.y + hy).toBeLessThanOrEqual(WORLD_H + 1e-9);
  } else {
    expect(cam.y).toBe(fit.y);
  }
}

describe("resize: the usable world rectangle (full V03, #151)", () => {
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

  it("the band table straddles the real shell breakpoints (layout.ts)", () => {
    expect(SHELL_PHONE_MAX_WIDTH_PX).toBe(767);
    expect(SHELL_DESKTOP_MIN_WIDTH_PX).toBe(1024);
    expect(SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX).toBe(460);
    const widths = RESIZE_BANDS.map((b) => b.view.width);
    expect(widths).toContain(SHELL_PHONE_MAX_WIDTH_PX);
    expect(widths).toContain(SHELL_PHONE_MAX_WIDTH_PX + 1);
    expect(widths).toContain(SHELL_DESKTOP_MIN_WIDTH_PX - 1);
    expect(widths).toContain(SHELL_DESKTOP_MIN_WIDTH_PX);
    const landscape = RESIZE_BANDS.find((b) => b.name === "landscape-phone");
    expect(landscape!.view.height).toBeLessThanOrEqual(SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX);
  });

  it("every breakpoint band fits and centres the world in its usable band", () => {
    for (const band of RESIZE_BANDS) {
      const { view: v, insets } = band;
      const fit = fitCamera(v, insets);
      const usableH = v.height - insets.top - insets.bottom;
      const bandCentre = insets.top + usableH / 2;
      const bandScale = usableH / (WORLD_H + 12);
      const raw = Math.min(4, v.width / (WORLD_W + 8));
      // scene.ts floors the band scale at the private BAND_MIN_SCALE = 1.1 so
      // the yard never zooms below a readable size. On a band shorter than the
      // floor's yard (WORLD_H * 1.1 = 246.4 px) the frozen fit deliberately
      // overflows the band; App.tsx's #117 fitToShell override then re-fits
      // below the floor at the shell layer. The frozen helper's contract is
      // the floor itself, pinned here exactly rather than a false universal fit.
      const floorBinds = bandScale < raw && bandScale < 1.1;
      expect(WORLD_W * fit.scale).toBeLessThanOrEqual(v.width + 1e-9);
      if (floorBinds) {
        expect(fit.scale).toBe(1.1);
        expect(WORLD_H * fit.scale).toBeGreaterThan(usableH);
      } else {
        expect(WORLD_H * fit.scale).toBeLessThanOrEqual(usableH + 1e-9);
      }
      const centre = worldToScreen(fit, v, WORLD_W / 2, WORLD_H / 2);
      expect(centre.x).toBeCloseTo(v.width / 2, 9);
      expect(centre.y).toBeCloseTo(bandCentre, 6);
      // No unreachable edge cells: every world corner and edge midpoint
      // projects inside the viewport horizontally on every band, and inside
      // the usable band vertically whenever the readable-size floor is slack.
      for (const [gx, gy] of EDGE_POINTS) {
        const p = worldToScreen(fit, v, gx, gy);
        expect(p.x).toBeGreaterThanOrEqual(-1e-6);
        expect(p.x).toBeLessThanOrEqual(v.width + 1e-6);
        if (!floorBinds) {
          expect(p.y).toBeGreaterThanOrEqual(insets.top - 1e-6);
          expect(p.y).toBeLessThanOrEqual(v.height - insets.bottom + 1e-6);
        }
      }
    }
  });

  it("orbit-aware resize keeps intent and the visible ground inside the world at every band", () => {
    for (const band of RESIZE_BANDS) {
      const fit = fitCamera(band.view, band.insets);
      for (const yaw of [0, 45, 90, 180, 270, 315]) {
        for (const elev of [ELEV_MIN, 35, ELEV_MAX]) {
          const intent: Camera = { x: 30, y: 25, scale: 4, yaw, elev };
          const kept = refitCamera(intent, fit, band.view, true);
          // Zoom and orbit are the player's; they survive the resize exactly.
          expect(kept.scale).toBe(4);
          expect(kept.yaw).toBe(yaw);
          expect(kept.elev).toBe(elev);
          expectGroundInsideWorld(kept, band.view, fit);
        }
      }
    }
  });

  it("selection and placement projection stay exact through resize + orbit", () => {
    const orientations: Array<Partial<Pick<Camera, "yaw" | "elev">>> = [
      {},
      { yaw: 45, elev: 35 },
      { yaw: 90, elev: ELEV_MIN },
      { yaw: 315, elev: 60 },
    ];
    for (const band of RESIZE_BANDS) {
      const fit = fitCamera(band.view, band.insets);
      for (const orient of orientations) {
        const cam = refitCamera(
          { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3, ...orient },
          fit,
          band.view,
          true,
        );
        // A tap on any edge cell maps back to the same ground point (the
        // selection/placement ray cast), at every breakpoint and orbit.
        for (const [gx, gy] of EDGE_POINTS) {
          const s = worldToScreen(cam, band.view, gx, gy);
          const back = screenToWorld(cam, band.view, s.x, s.y);
          expect(back.x).toBeCloseTo(gx, 6);
          expect(back.y).toBeCloseTo(gy, 6);
        }
      }
      // Top-down keeps the legacy bit-exact mapping at every band width.
      const plain: Camera = { x: 100, y: 80, scale: 2 };
      const s = worldToScreen(plain, band.view, 37, 91);
      expect(s.x).toBe((37 - 100) * 2 + band.view.width / 2);
      expect(s.y).toBe((91 - 80) * 2 + band.view.height / 2);
      const back = screenToWorld(plain, band.view, s.x, s.y);
      expect(back.x).toBeCloseTo(37, 9);
      expect(back.y).toBeCloseTo(91, 9);
    }
  });

  it("camera reset restores the composed fit exactly at every breakpoint", () => {
    for (const band of RESIZE_BANDS) {
      const fit = fitCamera(band.view, band.insets);
      const orbited = orbitCamera({ x: 30, y: 25, scale: 5, yaw: 40, elev: 30 }, band.view, 120, -50, fit);
      const reset = refitCamera(orbited, fit, band.view, false);
      expect(reset).toEqual({ ...fit });
      expect(reset.yaw).toBeUndefined();
      expect(reset.elev).toBeUndefined();
      const centre = worldToScreen(reset, band.view, WORLD_W / 2, WORLD_H / 2);
      const usableH = band.view.height - band.insets.top - band.insets.bottom;
      expect(centre.y).toBeCloseTo(band.insets.top + usableH / 2, 6);
    }
  });

  it("a desktop -> phone -> desktop journey with orbit between resizes never strands the yard", () => {
    const desktop: ViewState = { width: 1440, height: 900 };
    const phone: ViewState = { width: 390, height: 844 };
    const insets = { top: 64, bottom: 96 };
    let cam: Camera = { x: WORLD_W - 20, y: 20, scale: 5, yaw: 30, elev: 40 };
    const steps: Array<{ view: ViewState; act: (c: Camera, v: ViewState, f: Camera) => Camera }> = [
      { view: desktop, act: (c, v, f) => orbitCamera(c, v, 60, -15, f) },
      { view: phone, act: (c, v, f) => refitCamera(c, f, v, true) },
      { view: phone, act: (c, v, f) => quarterTurn(c, v, 1, f) },
      { view: phone, act: (c, v, f) => panCamera(c, v, 200, -300, f) },
      { view: desktop, act: (c, v, f) => refitCamera(c, f, v, true) },
    ];
    for (const step of steps) {
      const fit = fitCamera(step.view, insets);
      cam = step.act(cam, step.view, fit);
      expect(cam.scale).toBeGreaterThanOrEqual(CAMERA_MIN_SCALE);
      expect(cam.scale).toBeLessThanOrEqual(CAMERA_MAX_SCALE);
      expectGroundInsideWorld(cam, step.view, fit);
    }
    // The orbit intent accumulated exactly across the breakpoint switches.
    expect(cam.yaw).toBe(180);
    expect(cam.elev).toBe(25);
    expect(cam.scale).toBe(5);
  });

  it("the desktop inspector gutter refits without leaving the desktop band", () => {
    const wide: ViewState = { width: 1440, height: 900 };
    const docked: ViewState = { width: wide.width - SHELL_RIGHT_GUTTER_PX, height: 900 };
    expect(docked.width).toBeGreaterThanOrEqual(SHELL_DESKTOP_MIN_WIDTH_PX);
    const insets = { top: 64, bottom: 96 };
    const fit = fitCamera(docked, insets);
    const usableH = docked.height - insets.top - insets.bottom;
    expect(WORLD_W * fit.scale).toBeLessThanOrEqual(docked.width + 1e-9);
    expect(WORLD_H * fit.scale).toBeLessThanOrEqual(usableH + 1e-9);
    const intent: Camera = { x: WORLD_W - 15, y: WORLD_H - 15, scale: 5, yaw: 270, elev: 30 };
    const kept = refitCamera(intent, fit, docked, true);
    expect(kept.scale).toBe(5);
    expect(kept.yaw).toBe(270);
    expect(kept.elev).toBe(30);
    expectGroundInsideWorld(kept, docked, fit);
    expect(refitCamera(kept, fit, docked, false)).toEqual({ ...fit });
  });

  it("the phone sheet expansion refits into the shorter band and keeps the centre anchor", () => {
    const phone: ViewState = { width: 390, height: 844 };
    const collapsed = { top: 64, bottom: Math.round((phone.height * SHELL_SHEET_COLLAPSED_VH) / 100) };
    const expanded = { top: 64, bottom: Math.round((phone.height * SHELL_SHEET_EXPANDED_VH) / 100) };
    const before = fitCamera(phone, collapsed);
    const after = fitCamera(phone, expanded);
    expect(after.scale).toBeLessThan(before.scale);
    // The band centre stays the composition anchor even where the shipped
    // BAND_MIN_SCALE floor (scene.ts) binds and the yard exceeds the short
    // expanded band: the centre never drifts under the chrome.
    for (const [fit, insets] of [[before, collapsed], [after, expanded]] as const) {
      const centre = worldToScreen(fit, phone, WORLD_W / 2, WORLD_H / 2);
      expect(centre.x).toBeCloseTo(phone.width / 2, 9);
      expect(centre.y).toBeCloseTo(insets.top + (phone.height - insets.top - insets.bottom) / 2, 6);
    }
    // Intent survives the sheet opening, clamped into the shorter band.
    const intent: Camera = { x: 40, y: 30, scale: 4, yaw: 45, elev: 35 };
    const kept = refitCamera(intent, after, phone, true);
    expect(kept.scale).toBe(4);
    expect(kept.yaw).toBe(45);
    expect(kept.elev).toBe(35);
    expectGroundInsideWorld(kept, phone, after);
    expect(refitCamera(kept, after, phone, false)).toEqual({ ...after });
  });
});