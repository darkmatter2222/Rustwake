import { describe, expect, it } from "vitest";
import { createElement } from "react";
import {
  GRAVEL,
  PALETTE,
  PARTS,
  COLOR_KEYS,
  GRID_STYLE,
  type PartTuple,
} from "../../src/game/renderer/sprites";
import { drawScene, fitCamera, tileToWorld, worldToScreen, WRECK_POSITION, type DrawOptions } from "../../src/game/renderer/scene";
import { createInitialState, type MachineStatus, type SimState } from "../../src/game/simulation/types";
import { DOCK_TILE } from "../../src/game/simulation/commands";

/**
 * ART-003 g1 - silhouette-first witnesses (A3-1, A3-3, A3-4 and the named motion states).
 * Every number is computed from the same PARTS tables the painter uses, at unit
 * resolution, so the sheet (dpr1) and the scene agree by construction. Base numbers
 * were captured on `b4e8321` in an isolated worktree before the change (documented in
 * work/development/handoffs/ART-003-g1.md); the candidate must strictly exceed them.
 */

const VIEW = { width: 390, height: 844 };
const SCALE = 390 / (192 + 8); // 1.95, the phone fit the sheet band uses (ART-003: was 390/(192+24))

/** Unit-resolution gray-step grid (mirrors drawSpriteSheet's five-step ramp): cell value
 * = the ramp index of the last tuple covering it; background = 5. */
function grayUnit(parts: readonly PartTuple[]): number[] {
  const grid = new Array(32 * 32).fill(5);
  for (const t of parts) {
    const step = Math.min(4, Math.floor(t[4] / 4));
    const x0 = Math.max(0, Math.floor(t[0] + 16));
    const x1 = Math.min(32, Math.ceil(t[0] + t[2] + 16));
    const y0 = Math.max(0, Math.floor(t[1] + 16));
    const y1 = Math.min(32, Math.ceil(t[1] + t[3] + 16));
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) grid[y * 32 + x] = step;
  }
  return grid;
}

/** Differing-cell fraction over the shared 32x32 gray grid, in percent. */
function differingPct(a: number[], b: number[]): number {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
  return +((100 * diff) / a.length).toFixed(1);
}

/** Distinct palette luminance steps a row paints (the facet bands). */
function luminanceSteps(parts: readonly PartTuple[]): number[] {
  const lum = (hex: string): number => {
    const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return +(0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)).toFixed(4);
  };
  return [...new Set(parts.map((t) => lum(PALETTE[COLOR_KEYS[t[4]]])))].sort((a, b) => a - b);
}

/** The base-measured pairwise differing-pixel fractions (percent) on `b4e8321`, same
 *  gray-ramp instrument (`scripts/_art003_witness.mjs` run on the base worktree); the
 *  pixel-level sheet values live in docs/evidence/2026-11-06-art003-census-*.json. */
const BASE_MATRIX: Record<string, number> = {
  "dock/sorter": 37.9,
  "dock/furnace": 58,
  "dock/wireMill": 56.3,
  "dock/signalLab": 66.2,
  "dock/drone": 53.3,
  "sorter/furnace": 49,
  "sorter/wireMill": 43.8,
  "sorter/signalLab": 57.2,
  "sorter/drone": 56.3,
  "furnace/wireMill": 38,
  "furnace/signalLab": 28.9,
  "furnace/drone": 50.4,
  "wireMill/signalLab": 36.5,
  "wireMill/drone": 45.1,
  "signalLab/drone": 53.5,
};

/* ------------------------------------------------------------------ */
/* A3-1: pairwise silhouette separation strictly above the baseline.   */
/* ------------------------------------------------------------------ */

describe("ART-003 A3-1 grayscale pairwise silhouette separation", () => {
  const ids = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"] as const;
  const grids = new Map(ids.map((id) => [id, grayUnit(PARTS[id])]));
  const matrix: [string, number, number][] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const key = `${ids[i]}/${ids[j]}`;
      matrix.push([key, BASE_MATRIX[key], differingPct(grids.get(ids[i])!, grids.get(ids[j])!)]);
    }
  }
  it("every pair separates by >= 32 % at unit resolution; mean beats the base mean", () => {
    const below = matrix.filter(([, , now]) => now < 32);
    expect(below).toEqual([]);
    const nowMean = +(matrix.reduce((s, m) => s + m[2], 0) / matrix.length).toFixed(2);
    const baseMean = +(matrix.reduce((s, m) => s + m[1], 0) / matrix.length).toFixed(2);
    console.log("A3-1 measured", JSON.stringify({ pairs: matrix.length, nowMean, baseMean, matrix }));
    console.log(
      `A3-1 pairs=${matrix.length} nowMean=${nowMean} baseMean=${baseMean} min=${Math.min(...matrix.map((m) => m[2]))} baseMin=${Math.min(...Object.values(BASE_MATRIX))}`
    );
    expect(nowMean).toBeGreaterThan(baseMean);
    expect(Math.min(...matrix.map((m) => m[2]))).toBeGreaterThan(Math.min(...Object.values(BASE_MATRIX)));
  });
});

/* ------------------------------------------------------------------ */
/* A3-3: luminance bands, contact shadows, one light direction.        */
/* ------------------------------------------------------------------ */

interface Rec {
  op: string;
  style: string | number;
  args: number[];
}

function makeCtx() {
  const log: Rec[] = [];
  let fillStyle: string | number = "";
  let strokeStyle: string | number = "";
  let alpha = 1;
  const ctx = {
    imageSmoothingEnabled: true,
    lineWidth: 1,
    font: "",
    textAlign: "",
    globalAlpha: 1,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string | number) {
      fillStyle = v;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v: string | number) {
      strokeStyle = v;
    },
    fillRect: (...a: number[]) => log.push({ op: "fillRect", style: fillStyle, args: a }),
    strokeRect: (...a: number[]) => log.push({ op: "strokeRect", style: strokeStyle, args: a }),
    fillText: (_t: string, ...a: number[]) => log.push({ op: "fillText", style: fillStyle, args: a }),
    beginPath: () => undefined,
    moveTo: (...a: number[]) => log.push({ op: "moveTo", style: "", args: a }),
    lineTo: (...a: number[]) => log.push({ op: "lineTo", style: "", args: a }),
    closePath: () => undefined,
    rect: (...a: number[]) => log.push({ op: "rect", style: fillStyle, args: a }),
    ellipse: (...a: number[]) => log.push({ op: "ellipse", style: fillStyle, args: a.slice(0, 4).concat(alpha) }),
    fill: () => log.push({ op: "fill", style: fillStyle, args: [] }),
    stroke: () => log.push({ op: "stroke", style: strokeStyle, args: [0] }),
    setTransform: () => undefined,
  };
  Object.defineProperty(ctx, "globalAlpha", {
    get: () => alpha,
    set: (v: number) => {
      alpha = v;
    },
  });
  return { log, ctx: ctx as unknown as CanvasRenderingContext2D };
}

function machineState(status: MachineStatus, blueprint = "sorter", tile = 8): SimState {
  const base = createInitialState();
  return {
    ...base,
    tick: 344,
    machines: [
      {
        ...createInitialState().machines[0],
        id: 1,
        blueprint,
        tile,
        status,
        level: 1,
        progress: 120,
        batchMilli: 600,
      },
    ],
  } as unknown as SimState;
}

const rest: DrawOptions = { reducedMotion: false, buildMode: false, ghostTile: null, ghostValid: true, selected: null };

describe("ART-003 A3-3 bands, contact shadows, one light direction", () => {
  it("each static footprint row carries at least three palette luminance steps", () => {
    const rows = ["dock", "sorter", "furnace", "wireMill", "signalLab", "generic"] as const;
    const bands = Object.fromEntries(rows.map((id) => [id, luminanceSteps(PARTS[id])]));
    console.log("A3-3 bands", JSON.stringify({ bands, base: 1 })); // base: one flat fill per body
    for (const id of rows) expect(bands[id].length, id).toBeGreaterThanOrEqual(3);
  });

  it("a 1-step-dark contact ellipse sits under every machine footprint and the dock", () => {
    const rows = ["dock", "sorter", "furnace", "wireMill", "signalLab", "generic", "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler"] as const;
    const found: Record<string, boolean> = {};
    for (const id of rows) {
      found[id] = PARTS[id].some((t) => t[4] === 15 && t[5] === 1 && t[1] + t[3] >= 12);
      expect(found[id], `${id} contact ellipse`).toBe(true);
    }
    console.log("A3-3 contactShadowRows", JSON.stringify(found));
  });

  it("the wreck paints one shadow ellipse and the facet pairs agree on one light direction", () => {
    const stub = makeCtx();
    drawScene(stub.ctx, machineState("running"), fitCamera(VIEW), VIEW, rest);
    const camera = fitCamera(VIEW);
    const wreck = worldToScreen(camera, VIEW, WRECK_POSITION.x, WRECK_POSITION.y);
    const shadowEllipses = stub.log.filter(
      (r) =>
        r.op === "ellipse" &&
        r.style === PALETTE.shadow &&
        Math.abs(r.args[0] - wreck.x) <= 0.6 &&
        Math.abs(r.args[1] - Math.round((wreck.y + 14 * SCALE) * 2) / 2) <= 0.6
    );
    expect(shadowEllipses.length).toBe(1); // under the hull only, at its foot
    // Facet pairs: for the sorter cell, the lit (select, alpha 0.9) band must sit above
    // the dark (path) band, and the lit column left of the dark column - upper-left light.
    const c8 = tileToWorld(8);
    const p = worldToScreen(fitCamera(VIEW), VIEW, c8.x, c8.y);
    const s = SCALE;
    const lit = stub.log.filter((r) => r.op === "rect" && r.style === PALETTE.select && Math.abs(r.args[0] - p.x) < 16 * s);
    const dark = stub.log.filter((r) => r.op === "rect" && r.style === PALETTE.path && Math.abs(r.args[0] - p.x) < 16 * s);
    expect(lit.length).toBeGreaterThanOrEqual(2);
    expect(dark.length).toBeGreaterThanOrEqual(2);
    const topBand = Math.min(...lit.map((r) => r.args[1]));
    const bottomBand = Math.max(...dark.map((r) => r.args[1]));
    expect(topBand).toBeLessThan(bottomBand); // lit above dark
    const leftCol = Math.min(...lit.map((r) => r.args[0]));
    const rightCol = Math.max(...dark.map((r) => r.args[0]));
    expect(leftCol).toBeLessThan(rightCol); // lit left of dark
    console.log("A3-3 light", JSON.stringify({ topBand: +topBand.toFixed(2), bottomBand: +bottomBand.toFixed(2), leftCol: +leftCol.toFixed(2), rightCol: +rightCol.toFixed(2) }));
  });
});

/* ------------------------------------------------------------------ */
/* A3-4: the dot field dims at rest while machine ink rises.           */
/* ------------------------------------------------------------------ */

describe("ART-003 A3-4 grid ink down, machine ink up at rest", () => {
  it("GRAVEL drops 72 -> 36 ticks and the drawn field keeps exactly one tick per cell", () => {
    expect(GRAVEL.length).toBe(36);
    const stub = makeCtx();
    drawScene(stub.ctx, machineState("running"), fitCamera(VIEW), VIEW, rest);
    const tickW = Math.round(2 * SCALE * 2) / 2;
    const ticks = stub.log.filter(
      (r) => r.op === "rect" && r.style === PALETTE.bodyLight && Math.abs(r.args[2] - tickW) <= 0.5 && Math.abs(r.args[3] - tickW) <= 0.5
    );
    // 36 ground ticks + at most three 2-unit level pips per painted machine share the
    // snapped 3.5 px box; the ground field itself is the 36-cell lattice.
    expect(ticks.length).toBeGreaterThanOrEqual(36);
    expect(ticks.length).toBeLessThanOrEqual(40); // base counted 72 + pips
    console.log("A3-4 grid", JSON.stringify({ gravelTicks: 36, countedTickBoxes: ticks.length, baseTicks: 72, tickPx: tickW }));
  });

  it("the six machine rows paint more solid ink than at b4e8321", () => {
    const area = (id: string): number =>
      PARTS[id].reduce((sum, t) => (t[5] === 1 || t[4] === 15 ? sum : sum + t[2] * t[3]), 0);
    const ids = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];
    const total = ids.reduce((sum, id) => sum + area(id), 0);
    // Base solid-ink totals for the same six rows at b4e8321 (units^2), printed here too.
    const BASE_TOTAL = 2752;
    console.log("A3-4 machineInk", JSON.stringify({ perRow: Object.fromEntries(ids.map((id) => [id, area(id)])), total, baseTotal: BASE_TOTAL }));
    expect(total).toBeGreaterThan(BASE_TOTAL);
  });
});

/* ------------------------------------------------------------------ */
/* A3-5 (canvas half) + named motion states.                            */
/* ------------------------------------------------------------------ */

describe("ART-003 named per-status motion states", () => {
  const phaseLog = (status: MachineStatus, phase: number, reducedMotion = false): Rec[] => {
    const stub = makeCtx();
    drawScene(stub.ctx, machineState(status), fitCamera(VIEW), VIEW, { ...rest, reducedMotion, framePhase: phase });
    return stub.log;
  };

  it("working pulses in one quantised step per 6-frame cycle, then settles", () => {
    const radii: number[] = [];
    for (let f = 0; f < 6; f += 1) {
      const log = phaseLog("running", f / 6);
      const core = log.filter((r) => r.op === "ellipse" && r.style === PALETTE.amber);
      expect(core.length).toBe(1);
      radii.push(+core[0].args[2].toFixed(2));
    }
    const half = (v: number) => Math.round(v * 2) / 2;
    expect(radii).toEqual([half(2 * SCALE), half(2 * SCALE), half(2.5 * SCALE), half(2.5 * SCALE), half(2 * SCALE), half(2 * SCALE)]);
    console.log("A3-motion working", JSON.stringify({ radiiPx: radii, note: "swell on frames 3-4, settle after" }));
  });

  it("starved is frozen across the cycle (quiet core, no movement)", () => {
    const sig = (phase: number) =>
      JSON.stringify(phaseLog("starved", phase).filter((r) => r.op === "rect" || r.op === "fillRect" || r.op === "ellipse"));
    expect(sig(0)).toBe(sig(2 / 6));
    expect(sig(0)).toBe(sig(3 / 6));
    expect(sig(0)).toBe(sig(5 / 6));
    console.log("A3-motion starved", JSON.stringify({ frozenFrames: 6 }));
  });

  it("output-blocked settles its accent bar 6 -> 4 -> 6 units once per cycle", () => {
    const widths: number[] = [];
    for (let f = 0; f < 6; f += 1) {
      const log = phaseLog("outputFull", f / 6);
      const bars = log
        .filter((r) => r.op === "fillRect" && typeof r.style === "string" && r.style === "#c9713a")
        .map((r) => Math.round(r.args[2] / SCALE));
      widths.push(Math.min(...bars));
    }
    expect(widths).toEqual([6, 6, 4, 4, 6, 6]);
    console.log("A3-motion outputBlocked", JSON.stringify({ barWidthUnits: widths }));
  });

  it("reduced motion keeps only step 0 for every status (no crawl)", () => {
    for (const status of ["running", "starved", "outputFull", "idle"] as MachineStatus[]) {
      const a = JSON.stringify(phaseLog(status, 0, true).filter((r) => r.args.length > 0));
      const b = JSON.stringify(phaseLog(status, 3 / 6, true).filter((r) => r.args.length > 0));
      expect(a, status).toBe(b);
    }
  });

  it("the dot grid stays hidden at rest and returns in build mode", () => {
    const atRest = makeCtx();
    drawScene(atRest.ctx, machineState("running"), fitCamera(VIEW), VIEW, rest);
    expect(atRest.log.filter((r) => r.op === "stroke" && r.style === GRID_STYLE).length).toBe(0);
    const building = makeCtx();
    drawScene(building.ctx, machineState("running"), fitCamera(VIEW), VIEW, { ...rest, buildMode: true, ghostTile: 20 });
    expect(building.log.filter((r) => r.op === "stroke" && r.style === GRID_STYLE).length).toBe(1);
  });
});

void createElement;
void DOCK_TILE;
