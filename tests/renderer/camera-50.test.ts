import { describe, expect, it } from "vitest";
import {
  CAMERA_MAX_SCALE,
  CAMERA_MIN_SCALE,
  ZOOM_STEP,
  clampCamera,
  clampScale,
  panCamera,
  refitCamera,
  zoomAtPoint,
  zoomStep,
} from "../../src/game/renderer/camera";
import {
  WORLD_H,
  WORLD_W,
  fitCamera,
  screenToWorld,
  type Camera,
  type ViewState,
} from "../../src/game/renderer/scene";

/**
 * UI-RESET-50 (G2 wave 2): the camera math contract.
 *
 * One shared zoom range for every input; pan limits that know the view and the
 * zoom (the old clamp always returned span/2, so panning was a no-op); zoom
 * anchored at a screen point; and a refit rule that keeps the player's intent
 * across a resize or an opening inspector while a zoomed-out axis re-pins to
 * the shell fit — band offset and rail/inspector shift included.
 */

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("clampScale", () => {
  it("keeps one shared range for wheel, pinch, keys and controls", () => {
    expect(CAMERA_MIN_SCALE).toBe(1.2);
    expect(CAMERA_MAX_SCALE).toBe(6);
    expect(ZOOM_STEP).toBe(1.25);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(0.01)).toBe(CAMERA_MIN_SCALE);
    expect(clampScale(100)).toBe(CAMERA_MAX_SCALE);
    expect(clampScale(CAMERA_MIN_SCALE)).toBe(CAMERA_MIN_SCALE);
    expect(clampScale(CAMERA_MAX_SCALE)).toBe(CAMERA_MAX_SCALE);
  });

  it("treats a non-finite scale as zoomed out, never as NaN paint", () => {
    expect(clampScale(Number.NaN)).toBe(CAMERA_MIN_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(CAMERA_MIN_SCALE);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(CAMERA_MIN_SCALE);
  });
});

describe("clampCamera", () => {
  it("pins a zoomed-out axis to the fitted centre, carrying the band offset", () => {
    // A band fit whose centre is deliberately NOT the canvas centre.
    const view: ViewState = { width: 400, height: 800 };
    const fitted = fitCamera(view, { top: 60, bottom: 140 });
    expect(fitted.y).not.toBe(WORLD_H / 2); // the band really shifted the centre
    const drifted: Camera = { x: 10, y: 10, scale: CAMERA_MIN_SCALE };
    const clamped = clampCamera(drifted, view, fitted);
    // At scale 1.2 the whole world fits on both axes: both pin to the fit.
    expect(clamped.x).toBe(fitted.x);
    expect(clamped.y).toBe(fitted.y);
    expect(clamped.scale).toBe(CAMERA_MIN_SCALE);
  });

  it("carries the shell's horizontal shift into the pinned axis", () => {
    // fitToShell shifts x when a rail/inspector gutter is reserved; the clamp
    // must pin to that shifted fit, not to WORLD_W/2.
    const view: ViewState = { width: 1280, height: 800 };
    const shifted: Camera = { x: 140, y: 118, scale: 1.4 };
    const clamped = clampCamera({ x: 96, y: 112, scale: 1.2 }, view, shifted);
    expect(clamped.x).toBe(140);
    expect(clamped.y).toBe(118);
  });

  it("clamps a zoomed-in axis so the view never leaves the world", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const scale = 4;
    const halfW = view.width / (2 * scale); // 37.5
    const halfH = view.height / (2 * scale); // 50
    expect(clampCamera({ x: -50, y: -50, scale }, view, fitted)).toEqual({
      x: halfW,
      y: halfH,
      scale,
    });
    expect(clampCamera({ x: 500, y: 500, scale }, view, fitted)).toEqual({
      x: WORLD_W - halfW,
      y: WORLD_H - halfH,
      scale,
    });
    expect(clampCamera({ x: 96, y: 112, scale }, view, fitted)).toEqual({
      x: 96,
      y: 112,
      scale,
    });
  });

  it("mixes a free axis and a pinned axis at phone zoom", () => {
    // 390x844 at scale 3: the width is zoomed in (halfW 65 < 96) but the whole
    // world height still fits (halfH ~140.7 >= 112), so y pins to the fit.
    const view: ViewState = { width: 390, height: 844 };
    const fitted: Camera = { x: 96, y: 130, scale: 1.4 };
    const clamped = clampCamera({ x: 5, y: 5, scale: 3 }, view, fitted);
    expect(clamped.x).toBe(view.width / 6); // 65
    expect(clamped.y).toBe(130);
    const far = clampCamera({ x: 500, y: 5, scale: 3 }, view, fitted);
    expect(far.x).toBe(WORLD_W - view.width / 6); // 127
  });
});

describe("panCamera", () => {
  it("moves the centre by the screen delta divided by the zoom", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const start: Camera = { x: 96, y: 112, scale: 4 };
    const moved = panCamera(start, view, 40, -40, fitted);
    close(moved.x, 96 - 10);
    close(moved.y, 112 + 10);
    expect(moved.scale).toBe(4);
  });

  it("stops at the world edge instead of sailing past it", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const start: Camera = { x: 96, y: 112, scale: 4 };
    const edge = panCamera(start, view, -10000, 10000, fitted);
    close(edge.x, WORLD_W - view.width / 8);
    close(edge.y, view.height / 8);
  });

  it("is a composed no-op on an axis the zoom still fits", () => {
    const view: ViewState = { width: 400, height: 800 };
    const fitted: Camera = { x: 96, y: 130, scale: 1.4 };
    const start: Camera = { x: 96, y: 130, scale: CAMERA_MIN_SCALE };
    expect(panCamera(start, view, 120, -90, fitted)).toEqual(start);
  });
});

describe("zoomAtPoint", () => {
  it("keeps the world point under the cursor while both axes stay free", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const start: Camera = { x: 96, y: 112, scale: 2 };
    const sx = 100;
    const sy = 150;
    const anchor = screenToWorld(start, view, sx, sy);
    const zoomed = zoomAtPoint(start, view, 2, sx, sy, fitted);
    expect(zoomed.scale).toBe(4);
    const after = screenToWorld(zoomed, view, sx, sy);
    close(after.x, anchor.x);
    close(after.y, anchor.y);
  });

  it("anchors a zoom-out too, until the axis pins to the fit", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const start: Camera = { x: 90, y: 100, scale: 4 };
    const zoomed = zoomAtPoint(start, view, 0.5, 60, 150, fitted);
    expect(zoomed.scale).toBe(2);
    const before = screenToWorld(start, view, 60, 150);
    const after = screenToWorld(zoomed, view, 60, 150);
    close(after.x, before.x);
    close(after.y, before.y);
    // Past the floor the scale clamps and the axes re-pin to the shell fit.
    const floored = zoomAtPoint(start, view, 0.01, 60, 150, fitted);
    expect(floored.scale).toBe(CAMERA_MIN_SCALE);
    expect(floored.x).toBe(fitted.x);
    expect(floored.y).toBe(fitted.y);
  });

  it("clamps the ceiling and keeps the centre inside the world", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const start: Camera = { x: 96, y: 112, scale: 4 };
    const capped = zoomAtPoint(start, view, 100, 0, 0, fitted);
    expect(capped.scale).toBe(CAMERA_MAX_SCALE);
    const halfW = view.width / (2 * CAMERA_MAX_SCALE);
    const halfH = view.height / (2 * CAMERA_MAX_SCALE);
    expect(capped.x).toBeGreaterThanOrEqual(halfW);
    expect(capped.x).toBeLessThanOrEqual(WORLD_W - halfW);
    expect(capped.y).toBeGreaterThanOrEqual(halfH);
    expect(capped.y).toBeLessThanOrEqual(WORLD_H - halfH);
  });
});

describe("zoomStep", () => {
  it("steps by the shared ratio around the view centre", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const start: Camera = { x: 96, y: 112, scale: 2 };
    const up = zoomStep(start, view, 1, fitted);
    close(up.scale, 2 * ZOOM_STEP);
    expect(up.x).toBe(96);
    expect(up.y).toBe(112);
    const down = zoomStep(start, view, -1, fitted);
    close(down.scale, 2 / ZOOM_STEP);
    // A full step out and back in is the identity inside the free range.
    const round = zoomStep(down, view, 1, fitted);
    close(round.scale, start.scale);
    close(round.x, start.x);
    close(round.y, start.y);
  });

  it("cannot step past either end of the shared range", () => {
    const view: ViewState = { width: 300, height: 400 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    let camera: Camera = { x: 96, y: 112, scale: CAMERA_MAX_SCALE };
    for (let i = 0; i < 10; i += 1) camera = zoomStep(camera, view, 1, fitted);
    expect(camera.scale).toBe(CAMERA_MAX_SCALE);
    for (let i = 0; i < 30; i += 1) camera = zoomStep(camera, view, -1, fitted);
    expect(camera.scale).toBe(CAMERA_MIN_SCALE);
  });
});

describe("refitCamera", () => {
  const view: ViewState = { width: 390, height: 844 };

  it("without intent the fresh shell fit wins outright", () => {
    const previous: Camera = { x: 40, y: 60, scale: 5 };
    const fitted: Camera = { x: 96, y: 130, scale: 1.4 };
    const refit = refitCamera(previous, fitted, view, false);
    expect(refit).toEqual(fitted);
    expect(refit).not.toBe(fitted); // a copy, so later mutation cannot alias
  });

  it("with intent the player's zoom and centre survive, clamped to the new view", () => {
    const previous: Camera = { x: 96, y: 112, scale: 3 };
    const fitted: Camera = { x: 96, y: 130, scale: 1.4 };
    const refit = refitCamera(previous, fitted, view, true);
    expect(refit.scale).toBe(3); // the zoom is kept
    expect(refit.x).toBe(96); // still free on x at this zoom
    expect(refit.y).toBe(130); // the whole height fits: re-pin to the new band
  });

  it("with intent a zoomed-out camera re-pins to the new fit's composition", () => {
    const previous: Camera = { x: 40, y: 60, scale: CAMERA_MIN_SCALE };
    const fitted: Camera = { x: 140, y: 118, scale: 1.4 };
    const wide: ViewState = { width: 1280, height: 800 };
    const refit = refitCamera(previous, fitted, wide, true);
    expect(refit.x).toBe(140);
    expect(refit.y).toBe(118);
    expect(refit.scale).toBe(CAMERA_MIN_SCALE);
  });

  it("with intent an out-of-bounds centre is pulled back into the world", () => {
    const previous: Camera = { x: 5000, y: -5000, scale: 4 };
    const fitted: Camera = { x: 96, y: 112, scale: 1.4 };
    const small: ViewState = { width: 300, height: 400 };
    const refit = refitCamera(previous, fitted, small, true);
    close(refit.x, WORLD_W - small.width / 8);
    close(refit.y, small.height / 8);
    expect(refit.scale).toBe(4);
  });
});
