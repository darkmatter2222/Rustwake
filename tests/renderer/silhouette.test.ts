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
import censusAfter from "../../docs/evidence/2026-11-06-art003-census-after.json";
import censusBefore from "../../docs/evidence/2026-11-06-art003-census-before.json";

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

/* ------------------------------------------------------------------ */
/* ART-004 g2: A3-1 on the regenerated after-matrix, the joint         */
/* furnace x signalLab search, and the per-layer ink census.           */
/* ------------------------------------------------------------------ */

/** A3-1's named separation threshold: percent of differing cells. */
const A3_1_THRESHOLD = 32;
const PARTNERS = ["dock", "sorter", "wireMill", "drone"] as const;
const LATTICE = ["generic", "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler"] as const;

const rowInkUnits = (row: readonly PartTuple[]): number =>
  row.reduce((sum, t) => (t[5] === 1 || t[4] === 15 ? sum : sum + t[2] * t[3]), 0);

/** 8x8 ink mask, the same instrument as D-1/G-1 (64 cells, 4 units per cell). */
function mask8Of(row: readonly PartTuple[]): number[] {
  const m = new Array(64).fill(0);
  for (const t of row) {
    const x0 = Math.max(0, Math.floor((t[0] + 16) / 4));
    const x1 = Math.min(7, Math.ceil((t[0] + 16 + t[2]) / 4) - 1);
    const y0 = Math.max(0, Math.floor((t[1] + 16) / 4));
    const y1 = Math.min(7, Math.ceil((t[1] + 16 + t[3]) / 4) - 1);
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) m[y * 8 + x] = 1;
  }
  return m;
}

const hamming = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);

/** B4/B6/D-4 geometry floor: inside the cell, >= 2 units tall, marks >= 3 units tall. */
function featureLegal(row: readonly PartTuple[]): boolean {
  const tallest = Math.max(...row.map((u) => u[3]));
  return (
    row.every((t) => t[1] >= -16 && t[0] >= -16 && t[0] + t[2] <= 16 && t[1] + t[3] <= 16 && t[3] >= 2) &&
    row.filter((t) => t[4] !== 15 && t[3] < tallest).every((t) => t[3] >= 3)
  );
}

/* The two builders of the joint search, mirrors of scripts/art003-census.mjs. */
const SHADOW6: PartTuple = [-11, 12, 22, 3, 15, 1];
type Params = Record<string, number>;
const furnRow = (p: Params): PartTuple[] => [
  SHADOW6,
  [-p.bw / 2, p.by, p.bw, p.bh, p.ci],
  [2, -15, 5, 8, p.ci],
  [-3, -15, 10, 3, 9],
  [-6, -6, 8, 3, 6],
  [-6, -1, 8, 3, 6],
  [11, -2, 5, 8, 6],
  [11, 8, 5, 3, 9],
  [-15, 3, 4, 3, 6],
];
const labRow = (p: Params): PartTuple[] => [
  SHADOW6,
  [-p.tw / 2, p.ty, p.tw, p.th, p.ci],
  [-2, p.mastY, 4, p.mastH, p.ci],
  [p.headX, -14, p.headW, 3, 8],
  [-5, -4, 6, 3, 6],
  [-5, 2, 6, 3, 11],
  [-14, -6, p.wingW, 3, 8],
  [14 - p.wingW, -6, p.wingW, 3, 8],
  [-14, 3, p.wingW, 3, 8],
  [14 - p.wingW, 3, p.wingW, 3, 8],
  [-(p.footW + 7), 6, p.footW, 3, 16],
  [7, 6, p.footW, 3, 16],
  [-10, 9, 20, 3, 16],
];
/** The shipped rows expressed as the builders' parameter points. */
const F0: Params = { bw: 22, by: -9, bh: 16, ci: 16 };
const L0: Params = { tw: 14, ty: -8, th: 21, ci: 16, mastY: -16, mastH: 8, headX: -12, headW: 23, wingW: 6, footW: 7 };
const F_SPEC: Record<string, readonly number[]> = { bw: [18, 20, 22], by: [-9, -8, -7], bh: [12, 14, 16, 18], ci: [3, 4, 5, 16] };
const L_SPEC: Record<string, readonly number[]> = { tw: [12, 14, 16], ty: [-9, -8, -7], th: [19, 20, 21, 22], ci: [3, 4, 5, 16], mastY: [-16], mastH: [8], headX: [-13, -12, -11], headW: [21, 23, 25], wingW: [5, 6, 7], footW: [6, 7] };

const product = (spec: Record<string, readonly number[]>): Params[] =>
  Object.entries(spec).reduce<Params[]>((acc, [k, vals]) => acc.flatMap((x) => vals.map((v) => ({ ...x, [k]: v }))), [{}]);

/** Mirror of the census instrument's joint furnace x signalLab enumeration. */
function jointSearch() {
  const grid4: Record<string, number[]> = {};
  for (const r of PARTNERS) grid4[r] = grayUnit(PARTS[r]);
  const constVals: number[] = [];
  for (let i = 0; i < PARTNERS.length; i += 1) {
    for (let j = i + 1; j < PARTNERS.length; j += 1) {
      constVals.push(differingPct(grid4[PARTNERS[i]], grid4[PARTNERS[j]]));
    }
  }
  const constMin = Math.min(...constVals);
  const constSum = +constVals.reduce((a, b) => a + b, 0).toFixed(1);
  const maskNames: string[] = [...PARTNERS, ...LATTICE];
  const maskFixed: Record<string, number[]> = {};
  for (const r of maskNames) maskFixed[r] = mask8Of(PARTS[r]);
  let constMaskMin = 99;
  for (let i = 0; i < maskNames.length; i += 1) {
    for (let j = i + 1; j < maskNames.length; j += 1) {
      constMaskMin = Math.min(constMaskMin, hamming(maskFixed[maskNames[i]], maskFixed[maskNames[j]]));
    }
  }
  let latticeMin = 99;
  for (let i = 0; i < LATTICE.length; i += 1) {
    for (let j = i + 1; j < LATTICE.length; j += 1) {
      latticeMin = Math.min(latticeMin, hamming(maskFixed[LATTICE[i]], maskFixed[LATTICE[j]]));
    }
  }
  const variants = (spec: Record<string, readonly number[]>, build: (p: Params) => PartTuple[]) =>
    product(spec).map((p) => {
      const row = build(p);
      const g = grayUnit(row);
      const d4 = PARTNERS.map((r) => differingPct(g, grid4[r]));
      const m = mask8Of(row);
      return {
        p,
        g,
        d4,
        ink: rowInkUnits(row),
        ok: featureLegal(row) && Math.min(...d4) >= constMin,
        mMin: Math.min(...maskNames.map((r) => hamming(m, maskFixed[r]))),
      };
    });
  const Fv = variants(F_SPEC, furnRow);
  const Lv = variants(L_SPEC, labRow);
  const inkBase = 2752;
  const meanBase = 48.69;
  const shippedMin = Math.min(...unitPairRows().map((r) => r[1]));
  const shippedMean = +(unitPairRows().reduce((s, r) => s + r[1], 0) / 15).toFixed(2);
  let best = { minPct: shippedMin, meanPct: shippedMean, furnace: F0, signalLab: L0 };
  let enumerated = 0;
  let gatePassing = 0;
  for (const f of Fv) {
    if (!f.ok) continue;
    for (const l of Lv) {
      enumerated += 1;
      if (!l.ok) continue;
      if (Math.min(f.mMin, l.mMin, constMaskMin) < 12 || latticeMin < 18) continue;
      if (f.ink + l.ink + PARTNERS.reduce((s, r) => s + rowInkUnits(PARTS[r]), 0) <= inkBase) continue;
      const nine = [...f.d4, differingPct(f.g, l.g), ...l.d4];
      gatePassing += 1;
      const minPct = Math.min(constMin, ...nine);
      if (minPct < A3_1_THRESHOLD) continue;
      const meanPct = +((constSum + nine.reduce((a, b) => a + b, 0)) / 15).toFixed(2);
      if (meanPct <= meanBase) continue;
      if (minPct > best.minPct || (minPct === best.minPct && meanPct > best.meanPct)) {
        best = { minPct, meanPct, furnace: f.p, signalLab: l.p };
      }
    }
  }
  return {
    shippedMin,
    shippedMean,
    best,
    enumerated,
    gatePassing,
    constMin,
    builderMatches: {
      furnace: JSON.stringify(furnRow(F0)) === JSON.stringify(PARTS.furnace),
      signalLab: JSON.stringify(labRow(L0)) === JSON.stringify(PARTS.signalLab),
    },
  };
}

/** The 15-pair unit-resolution matrix, as one array the rows below reuse. */
function unitPairRows(): [string, number][] {
  const sixIds = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"] as const;
  const grids = sixIds.map((id) => grayUnit(PARTS[id]));
  const rows: [string, number][] = [];
  for (let i = 0; i < sixIds.length; i += 1) {
    for (let j = i + 1; j < sixIds.length; j += 1) {
      rows.push([`${sixIds[i]}/${sixIds[j]}`, differingPct(grids[i], grids[j])]);
    }
  }
  return rows;
}

describe("ART-004 g2 A3-1 on the regenerated after-matrix", () => {
  it("the after-matrix is a fresh run and its minimum sits above the named threshold", () => {
    const before = censusBefore.sheet.matrix as unknown as [string, number][];
    const after = censusAfter.sheet.matrix as unknown as [string, number][];
    expect(after).toHaveLength(15);
    // Regenerated, not a copy of the before sheet: the two 15-row arrays differ.
    expect(JSON.stringify(after)).not.toEqual(JSON.stringify(before));
    const min = Math.min(...after.map((r) => r[1]));
    const mean = +(after.reduce((s, r) => s + r[1], 0) / after.length).toFixed(2);
    expect(min).toBeGreaterThan(A3_1_THRESHOLD);
    expect(min).toBeGreaterThan(Math.min(...before.map((r) => r[1])));
    const aligned = censusAfter.sheet.a3_1.aligned as {
      minPct: number;
      meanPct: number;
      minPair: string;
      thresholdPct: number;
      passes: boolean;
    };
    // The instrument's own summary agrees with the matrix it printed.
    expect(aligned.minPct).toBe(min);
    expect(aligned.meanPct).toBe(mean);
    expect(aligned.thresholdPct).toBe(A3_1_THRESHOLD);
    expect(aligned.passes).toBe(true);
    console.log(
      `A3-1 after-matrix ${JSON.stringify({ minPct: min, meanPct: mean, minPair: aligned.minPair, thresholdPct: A3_1_THRESHOLD, baseMinPct: Math.min(...before.map((r) => r[1])) })}`
    );
  });

  it("the unit grid the same run prints agrees with this file, pair for pair", () => {
    const rows = unitPairRows();
    const printed = censusAfter.sheet.unitMatrix as unknown as [string, number][];
    expect(printed).toEqual(rows);
    expect(Math.min(...rows.map((r) => r[1]))).toBeGreaterThanOrEqual(A3_1_THRESHOLD);
    console.log(`A3-1 unit min=${Math.min(...rows.map((r) => r[1]))} mean=${+(rows.reduce((s, r) => s + r[1], 0) / 15).toFixed(2)} threshold=${A3_1_THRESHOLD}`);
  });
});

describe("ART-004 g2 A3-1 joint furnace x signalLab parameter search", () => {
  const search = jointSearch();

  it("the two builders reproduce the shipped rows exactly, so the space is the shipped table", () => {
    expect(search.builderMatches).toEqual({ furnace: true, signalLab: true });
  });

  it("nothing in the joint grid beats the shipped minimum; the mean-optimum sits at 58.81 %", () => {
    const printed = censusAfter.sheet.a3_1.jointSearch as unknown as {
      best: { minPct: number; meanPct: number };
      shipped: { minPct: number; meanPct: number };
      enumeratedCombos: number;
      gatePassingCombos: number;
    };
    // The min is capped by dock/sorter, a pair neither row of this search touches.
    expect(search.constMin).toBe(48.2);
    expect(search.shippedMin).toBe(48.2);
    expect(search.best.minPct).toBe(search.constMin);
    expect(search.best.meanPct).toBe(58.81);
    expect(search.best.meanPct).toBeGreaterThan(search.shippedMean);
    // Same instrument, same numbers as the committed artifact.
    expect(search.best.minPct).toBe(printed.best.minPct);
    expect(search.best.meanPct).toBe(printed.best.meanPct);
    expect(search.enumerated).toBe(printed.enumeratedCombos);
    expect(search.gatePassing).toBe(printed.gatePassingCombos);
    console.log(
      `A3-1 joint search ${JSON.stringify({ shipped: { min: search.shippedMin, mean: search.shippedMean }, best: search.best, enumerated: search.enumerated, gatePassing: search.gatePassing })}`
    );
  });
});

describe("ART-004 g2 A3-4 per-layer ink shares on one denominator", () => {
  it("unit resolution: machinery, gravel and the dot grid share the 1024-unit cell", () => {
    const cellArea = 32 * 32; // 1024 units^2, the same box every layer is normalised to
    const gravelTickUnits = 2 * 2; // GRAVEL: one 2-unit tick per cell, alpha 0.28
    const gravelSharePct = +((100 * gravelTickUnits) / cellArea).toFixed(2);
    const sixIds = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"] as const;
    const machinery = Object.fromEntries(
      sixIds.map((id) => [id, +((100 * rowInkUnits(PARTS[id])) / cellArea).toFixed(2)])
    );
    expect(gravelSharePct).toBe(0.39);
    expect(machinery.sorter).toBe(67.68);
    expect(machinery.furnace).toBe(52.44);
    expect(machinery.signalLab).toBe(59.08);
    expect(machinery.dock).toBe(55.47);
    for (const id of ["dock", "sorter", "furnace", "wireMill", "signalLab"]) {
      expect(machinery[id], id).toBeGreaterThanOrEqual(40);
      expect(machinery[id] / gravelSharePct, id).toBeGreaterThanOrEqual(100);
    }
    // The dot grid is build-mode only, so at rest it carries no ink at all.
    const stub = makeCtx();
    drawScene(stub.ctx, machineState("running"), fitCamera(VIEW), VIEW, rest);
    expect(stub.log.filter((r) => r.op === "stroke" && r.style === GRID_STYLE).length).toBe(0);
    console.log(
      "A3-4 perLayerUnits",
      JSON.stringify({ cellArea, gravelSharePct, gridSharePctAtRest: 0, machinerySharePct: machinery })
    );
  });

  it("device resolution: the census prints the same shares from the live frame", () => {
    const compare = censusAfter.scene.inkComparison as unknown as {
      boxDenominatorPx: number;
      machineryShareOfBoxPct: number;
      gravelShareOfBoxPct: number;
      gridShareOfBoxPct: number;
      contactShadowShareOfBoxPct: number;
      machineryOverGravel: number;
      canvasSharesPct: Record<string, number>;
    };
    const layers = censusAfter.scene.layers as unknown as {
      totalPx: number;
      distinctColors: number;
      rows: { layer: string; rgb: string; tol: number; px: number; sharePct: number }[];
      nightSharePct: number;
      namedSharePct: number;
      unaccountedPct: number;
    };
    expect(layers.totalPx).toBe(390 * 844);
    // The census closes: night + every named layer + the antialias rims = the whole canvas.
    expect(layers.nightSharePct + layers.namedSharePct + layers.unaccountedPct).toBeCloseTo(100, 1);
    expect(compare.gridShareOfBoxPct).toBe(0); // the dot grid is not painted at rest
    expect(compare.machineryShareOfBoxPct).toBeGreaterThan(40);
    expect(compare.gravelShareOfBoxPct).toBeLessThan(1);
    expect(compare.machineryOverGravel).toBeGreaterThanOrEqual(100);
    expect(compare.contactShadowShareOfBoxPct).toBeGreaterThan(1);
    expect(compare.canvasSharesPct.machinery).toBeGreaterThan(10 * compare.canvasSharesPct.gravel);
    console.log(
      "A3-4 perLayerDevice",
      JSON.stringify({
        canvasSharesPct: Object.fromEntries(layers.rows.map((r) => [r.layer, r.sharePct])),
        box: compare,
      })
    );
  });

  it("the entry chunk recorded by the same run sits inside the 233000 B ceiling", () => {
    const entry = censusAfter.entryChunk as unknown as { file: string; bytes: number; ceilingBytes: number };
    expect(entry.bytes).toBeLessThanOrEqual(entry.ceilingBytes);
    expect(entry.ceilingBytes).toBe(233000);
    console.log("A3-6 entryChunk", JSON.stringify(entry));
  });
});

/* ------------------------------------------------------------------ */
/* ART-004 g2 reviewer items: (a) per-cell comparator, (b) full id      */
/* list, (c) ART-006 settle bar, (d) ART-005 named ink shares.         */
/* ------------------------------------------------------------------ */

/** Half-pixel-lattice rasterizer over the recorded paint ops (ART-006: pixel evidence, so a
 * rect that is fully covered by a later rect stops counting, unlike the logged arguments). */
function rasterize(log: Rec[], lattice = 2): Map<string, string> {
  const cells = new Map<string, string>();
  const put = (x: number, y: number, w: number, h: number, style: string | number) => {
    const x0 = Math.floor(x * lattice);
    const x1 = Math.ceil((x + w) * lattice);
    const y0 = Math.floor(y * lattice);
    const y1 = Math.ceil((y + h) * lattice);
    for (let iy = y0; iy < y1; iy += 1) for (let ix = x0; ix < x1; ix += 1) cells.set(`${ix},${iy}`, String(style));
  };
  for (const r of log) {
    if (r.op === "fillRect" || r.op === "rect") put(r.args[0], r.args[1], r.args[2], r.args[3], r.style);
  }
  return cells;
}

/** Longest contiguous run of one colour along one rasterized row, in CSS px. */
function longestRunPx(cells: Map<string, string>, style: string, iy: number, lattice = 2, width = 900): number {
  let best = 0;
  let cur = 0;
  for (let ix = 0; ix < width * lattice; ix += 1) {
    if (cells.get(`${ix},${iy}`) === style) {
      cur += 1;
      if (cur > best) best = cur;
    } else cur = 0;
  }
  return +(best / lattice).toFixed(2);
}

const RUST_HEX = "#c9713a";
const MACHINE8 = [
  "sorter",
  "furnace",
  "wireMill",
  "signalLab",
  "polymerRecycler",
  "copperSeparator",
  "platePress",
  "circuitAssembler",
] as const;

describe("ART-006 the output-blocked settle bar has visible amplitude", () => {
  /** One paint per frame, measured on a rasterized row rather than the logged arguments. */
  const barWitness = (phase: number, reducedMotion: boolean) => {
    const stub = makeCtx();
    drawScene(stub.ctx, machineState("outputFull"), fitCamera(VIEW), VIEW, {
      ...rest,
      reducedMotion,
      framePhase: phase,
    });
    const cells = rasterize(stub.log);
    const p = worldToScreen(fitCamera(VIEW), VIEW, tileToWorld(8).x, tileToWorld(8).y);
    // The bar's snapped top edge in half-px steps, then the 8 steps its 2-unit height covers.
    const iy0 = Math.round((p.y + 10 * SCALE) * 2);
    let longest = 0;
    for (let iy = iy0 - 2; iy <= iy0 + 8; iy += 1) {
      longest = Math.max(longest, longestRunPx(cells, RUST_HEX, iy));
    }
    const paintOps = stub.log.filter((r) => r.op === "fillRect" && r.style === RUST_HEX).length;
    return { longestRunPx: longest, paintOps };
  };

  it("one paint per frame carries the computed width (no covered second rect)", () => {
    const paints: number[] = [];
    for (let f = 0; f < 6; f += 1) paints.push(barWitness(f / 6, false).paintOps);
    expect(paints).toEqual([1, 1, 1, 1, 1, 1]);
    console.log("ART-006 paintOpsPerFrame", JSON.stringify(paints));
  });

  it("the rasterized bar row shows two distinct widths across the cycle", () => {
    const widths = Array.from({ length: 6 }, (_, f) => barWitness(f / 6, false).longestRunPx);
    const distinct = [...new Set(widths)];
    expect(distinct).toHaveLength(2);
    const hold = widths[0];
    const settle = widths[2];
    expect(settle).toBeLessThan(hold);
    // 6 -> 4 units at the phone fit (scale 1.95): 11.5 px and 8 px on the half-px lattice.
    expect(hold).toBeGreaterThanOrEqual(11);
    expect(settle).toBeLessThanOrEqual(8.5);
    expect(+(settle / hold).toFixed(2)).toBeCloseTo(4 / 6, 1);
    console.log("ART-006 pixelRows", JSON.stringify({ widthsPx: widths, distinct, holdPx: hold, settlePx: settle, scale: SCALE }));
  });

  it("reduced motion keeps exactly one width for the whole cycle", () => {
    const widths = Array.from({ length: 6 }, (_, f) => barWitness(f / 6, true).longestRunPx);
    expect([...new Set(widths)]).toHaveLength(1);
    // The 6-unit bar at the phone fit: 11.7 px, rasterized on the half-px lattice.
    expect(widths[0]).toBeGreaterThanOrEqual(11);
    expect(widths[0]).toBeLessThanOrEqual(12);
    console.log("ART-006 reducedMotionWidths", JSON.stringify({ widthsPx: widths, barUnitPx: +(6 * SCALE).toFixed(2) }));
  });

  it("the same witness, measured on the real canvas, is recorded by the census run", () => {
    const settle = censusAfter.settle as unknown as {
      longestRunPx: number[];
      reducedMotionLongestRunPx: number[];
      distinctWidths: number;
      reducedMotionDistinct: number;
      scale: number;
      rows: { blueprint: string; longestRunPx: number[]; reducedMotionLongestRunPx: number[]; distinctWidths: number; reducedMotionDistinct: number }[];
    };
    expect(settle.distinctWidths).toBe(2);
    expect(settle.reducedMotionDistinct).toBe(1);
    expect(settle.longestRunPx[0]).toBeGreaterThan(settle.longestRunPx[2]);
    // Per painted row: both the plain row and the furnace (which also carries its 4-unit
    // chimney band, the row pair Issue #32 measured as 326:11 / 327:11) keep two widths.
    expect(settle.rows.map((r) => r.blueprint)).toEqual(["sorter", "furnace"]);
    for (const row of settle.rows) {
      expect(row.distinctWidths, row.blueprint).toBe(2);
      expect(row.reducedMotionDistinct, row.blueprint).toBe(1);
      expect(new Set(row.longestRunPx).size, row.blueprint).toBe(2);
      expect(new Set(row.reducedMotionLongestRunPx).size, row.blueprint).toBe(1);
      expect(Math.min(...row.longestRunPx)).toBeGreaterThan(0);
    }
    console.log(
      "ART-006 censusPixelWitness",
      JSON.stringify({
        scale: settle.scale,
        rows: settle.rows.map((r) => ({ blueprint: r.blueprint, px: r.longestRunPx, reducedPx: r.reducedMotionLongestRunPx })),
      })
    );
  });
});

describe("ART-005 named ink shares on one denominator (gravel, dot grid, machine body)", () => {
  it("the census emits the three shares and the machine body leads both texture rows", () => {
    const shares = censusAfter.scene.inkSharesPct as unknown as {
      denominator: string;
      denominatorPx: number;
      machineBody: number;
      gravel: number;
      dotGrid: number;
      inMachineRowBox: { machineBody: number; gravel: number; dotGrid: number };
    };
    expect(shares.denominator).toBe("canvas");
    expect(shares.denominatorPx).toBe(390 * 844);
    // All three present, one denominator, and the ordering the reviewer asked for.
    expect(shares.machineBody).toBeGreaterThan(0);
    expect(shares.gravel).toBeGreaterThan(0);
    expect(shares.machineBody).toBeGreaterThan(shares.gravel);
    expect(shares.machineBody).toBeGreaterThan(shares.dotGrid);
    // The same ordering inside the machine-row box, where the textures actually tile.
    expect(shares.inMachineRowBox.machineBody).toBeGreaterThan(shares.inMachineRowBox.gravel);
    expect(shares.inMachineRowBox.machineBody / Math.max(shares.inMachineRowBox.gravel, 1e-9)).toBeGreaterThanOrEqual(50);
    // gravelSharePct also exists as a top-level key of the run.
    const top = censusAfter.scene as unknown as { gravelSharePct: number; dotGridSharePct: number; machineBodySharePct: number };
    expect(top.gravelSharePct).toBe(shares.gravel);
    expect(top.dotGridSharePct).toBe(shares.dotGrid);
    expect(top.machineBodySharePct).toBe(shares.machineBody);
    console.log("ART-005 inkShares", JSON.stringify(shares));
  });
});

describe("ART-004 g2 A3-1 across the whole role list plus the before/after comparator", () => {
  it("every PARTS row is in the ids list, the eight blueprints and generic included", () => {
    const aligned = censusAfter.sheet.alignedAll as unknown as {
      ids: string[];
      machineIds: string[];
      totalCells: number;
      summaryAll: { pairs: number; minPct: number; minPair: string; meanPct: number };
      summaryMachines: { pairs: number; minPct: number; minPair: string; meanPct: number };
      rows: { pair: string; diffCells: number; totalCells: number; pct: number }[];
    };
    expect(aligned.ids).toEqual(Object.keys(PARTS));
    expect(aligned.machineIds).toEqual([...MACHINE8, "generic"]);
    for (const id of [...MACHINE8, "generic"]) expect(aligned.ids).toContain(id);
    expect(aligned.totalCells).toBe(3364);
    expect(aligned.summaryMachines.pairs).toBe(36);
    // Per-cell integers agree with the printed percentage on the same lattice.
    for (const row of aligned.rows.slice(0, 6)) {
      expect(+((100 * row.diffCells) / row.totalCells).toFixed(1)).toBe(row.pct);
    }
    console.log(
      "A3-1 wholeSheet",
      JSON.stringify({
        ids: aligned.ids,
        all: aligned.summaryAll,
        machines: aligned.summaryMachines,
        weakest: aligned.rows.slice().sort((a, b) => a.pct - b.pct).slice(0, 4),
      })
    );
  });

  it("the before and after matrices differ cell-wise on every pair and the minimum rose", () => {
    const cmp = censusAfter.comparator as unknown as {
      latticeCells: number;
      pairs: number;
      changedPairs: number;
      identicalArrays: boolean;
      minBeforePct: number;
      minAfterPct: number;
      maxDeltaPct: number;
      rows: { pair: string; beforePct: number; afterPct: number; deltaPct: number; beforeCells: number; afterCells: number }[];
    };
    expect(cmp.pairs).toBe(15);
    expect(cmp.identicalArrays).toBe(false);
    expect(cmp.changedPairs).toBe(15); // every pair moved: the art really changed
    expect(cmp.minAfterPct).toBeGreaterThan(cmp.minBeforePct);
    for (const row of cmp.rows) {
      expect(row.afterCells).not.toBe(row.beforeCells);
      expect(row.afterCells).toBe(Math.round((row.afterPct * cmp.latticeCells) / 100));
      expect(Math.abs(row.deltaPct)).toBeLessThanOrEqual(30);
    }
    // Every pair moved; the great majority rose, and both summary statistics did.
    expect(cmp.rows.filter((r) => r.deltaPct > 0).length).toBeGreaterThanOrEqual(12);
    const meanOf = (key: "beforePct" | "afterPct") =>
      +(cmp.rows.reduce((s, r) => s + r[key], 0) / cmp.rows.length).toFixed(2);
    expect(meanOf("afterPct")).toBeGreaterThan(meanOf("beforePct"));
    console.log("A3-1 perCellComparator", JSON.stringify({ latticeCells: cmp.latticeCells, changedPairs: cmp.changedPairs, minBeforePct: cmp.minBeforePct, minAfterPct: cmp.minAfterPct, meanBeforePct: meanOf("beforePct"), meanAfterPct: meanOf("afterPct"), maxDeltaPct: cmp.maxDeltaPct, rows: cmp.rows.slice(0, 3) }));
  });

  it("the unit-grid lattice covers the same ids and prints its own minimum", () => {
    const unitAll = censusAfter.sheet.unitAll as unknown as {
      ids: string[];
      totalCells: number;
      summaryAll: { pairs: number; minPct: number; minPair: string; meanPct: number };
      summaryMachines: { pairs: number; minPct: number; minPair: string; meanPct: number };
    };
    expect(unitAll.ids).toEqual(Object.keys(PARTS));
    expect(unitAll.totalCells).toBe(1024);
    expect(unitAll.summaryMachines.pairs).toBe(36);
    // The named A3-1 gate (32 %) is the six-role matrix; the whole-sheet rows are printed
    // for the lattice family, whose closest pair is the weakest reading in the build.
    expect(unitAll.summaryAll.minPct).toBeGreaterThanOrEqual(20);
    console.log("A3-1 unitWholeSheet", JSON.stringify({ all: unitAll.summaryAll, machines: unitAll.summaryMachines }));
  });
});

void createElement;
void DOCK_TILE;
