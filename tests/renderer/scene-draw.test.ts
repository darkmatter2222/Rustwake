import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { BLUEPRINTS } from "../../src/game/content/defs";
import {
  WORLD_H,
  WORLD_W,
  WRECK_POSITION,
  drawScene,
  droneLeg,
  fitCamera,
  tileToWorld,
  worldToScreen,
  type Camera,
  type CameraInsets,
  type DrawOptions,
  type ViewState,
} from "../../src/game/renderer/scene";
import {
  FEATURE_MIN_UNITS,
  FLOOR_KIT,
  GRID_STYLE,
  LEAN_UNITS,
  PALETTE,
  PARTS,
  SELECT_STYLE,
  STATUS_ACCENTS,
  AMBER_SHAPES,
  type PartTuple,
} from "../../src/game/renderer/sprites";
import { createInitialState, createUnit, type DroneState, type MachineStatus, type SimState } from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { DOCK_TILE, YARD_ROWS } from "../../src/game/simulation/commands";

/**
 * Deterministic draw-bound tests (spec 3D): the context is a plain recording
 * object, so jsdom needs no canvas package. One tuple per call:
 * {op, style, args}; paints are the ops that put pixels down.
 */
interface Rec {
  op: string;
  style: string | number;
  args: number[];
  /** L-4: the string a `fillText` call carried, so a glyph can be found by its text. */
  text?: string;
}

const PAINT_OPS = new Set(["fill", "stroke", "fillRect", "strokeRect", "fillText"]);

function makeCtx() {
  const log: Rec[] = [];
  let fillStyle: string | number = "";
  let strokeStyle: string | number = "";
  let segCount = 0;
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
    fillText: (t: string, ...a: number[]) => log.push({ op: "fillText", style: fillStyle, args: a, text: t }),
    beginPath: () => {
      segCount = 0;
    },
    moveTo: (...a: number[]) => log.push({ op: "moveTo", style: "", args: a }),
    lineTo: (...a: number[]) => {
      segCount += 1;
      log.push({ op: "lineTo", style: "", args: a });
    },
    closePath: () => undefined,
    rect: (...a: number[]) => log.push({ op: "rect", style: fillStyle, args: a }),
    ellipse: (...a: number[]) => log.push({ op: "ellipse", style: fillStyle, args: a.slice(0, 4) }),
    fill: () => log.push({ op: "fill", style: fillStyle, args: [] }),
    // The recorded args carry the segment count of this stroke's path.
    stroke: () => log.push({ op: "stroke", style: strokeStyle, args: [segCount] }),
    // The frame loop sets the dpr transform before each draw; it puts no pixels down.
    setTransform: () => undefined,
  };
  return {
    log,
    paints: () => log.filter((r) => PAINT_OPS.has(r.op)).length,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  };
}

/**
 * L-4 glyph metrics for the level digit, measured in chromium with
 * `TextMetrics.actualBoundingBoxAscent` for "4" at the font sizes the painter sets
 * (`Math.round(6 * s)` px): 5 px at 7, 8 px at 11, 16 px at 23, 17 px at 24. The largest
 * ratio is 8/11 = 0.7273, used as the conservative fallback for an unlisted size.
 */
const DIGIT_ASCENT_PX: Record<number, number> = { 7: 5, 11: 8, 23: 16, 24: 17 };
const DIGIT_ASCENT_RATIO_MAX = 0.7273;

const VIEW: ViewState = { width: 390, height: 844 };
const SCALE = 390 / (192 + 24); // 1.8056, the phone scale the spec measures

function fs1(): SimState {
  const base = createInitialState();
  const machine = (id: number, blueprint: string, tile: number, status: string, level: number, trayUnits: number) => ({
    id, blueprint, tile, orientation: 0, level,
    inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
    progress: 120, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 3,
    ageTicks: 300, busyTicks: 200, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  });
  return {
    ...base,
    tick: 344,
    tutorial: 9,
    machines: [
      machine(1, "sorter", 8, "running", 1, 0),
      machine(2, "furnace", 14, "outputFull", 1, 1),
    ],
    routes: [
      { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap",
        capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
      { id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 }, filter: "ferrous",
        capacity: 5, latency: 5, items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1 },
    ],
    drone: { ...base.drone, repaired: true, inFlight: { arrive: 350, units: 3 } },
    storeUnits: 770,
    storeCapacity: 900,
  } as unknown as SimState;
}

function mature(): SimState {
  const base = fs1();
  const blueprints = ["sorter", "furnace", "wireMill", "signalLab", "sorter", "furnace", "generic", "generic"];
  const statuses: MachineStatus[] = ["running", "starved", "outputFull", "idle", "powerLimited", "paused", "running", "outputFull"];
  base.machines = blueprints.map((bp, i) => ({
    ...base.machines[i % 2], id: i + 1, blueprint: bp, tile: i + 1, status: statuses[i], level: 2 + (i % 3),
  }));
  const spare = { repaired: true, inFlight: { arrive: 350, units: 2 } };
  return {
    ...base,
    spares: [spare, spare, spare, spare],
    routes: Array.from({ length: 18 }, (_, i) => ({
      id: i + 1, from: { kind: i % 2 ? "store" : "machine", id: 1 + (i % 8) },
      to: { kind: i % 3 ? "machine" : "store", id: 1 + ((i + 1) % 8) }, filter: "scrap",
      capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 + (i % 4) }], inFlight: 1,
    })),
  } as unknown as SimState;
}

const rest: DrawOptions = { reducedMotion: false, buildMode: false, ghostTile: null, ghostValid: true, selected: null };
const build: DrawOptions = { ...rest, buildMode: true, ghostTile: 20, ghostValid: true };

function draw(state: SimState, options: DrawOptions) {
  const stub = makeCtx();
  const camera = fitCamera(VIEW);
  drawScene(stub.ctx, state, camera, VIEW, options);
  return { stub, camera };
}

/** 8x8 binary mask over the 32-unit cell for one PARTS row of tuples (B2). */
function maskOf(parts: readonly PartTuple[]): number[] {
  const mask = new Array<number>(64).fill(0);
  for (const t of parts) {
    const x0 = Math.max(0, Math.floor((t[0] + 16) / 4));
    const x1 = Math.min(7, Math.ceil((t[0] + 16 + t[2]) / 4) - 1);
    const y0 = Math.max(0, Math.floor((t[1] + 16) / 4));
    const y1 = Math.min(7, Math.ceil((t[1] + 16 + t[3]) / 4) - 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) mask[y * 8 + x] = 1;
    }
  }
  return mask;
}

describe("Q-002 renderer draws (3A/3B/3D)", () => {
  it("A1/A2: the grid is context-only - 0 strokes at rest, 1 path of 14 segments in build mode", () => {
    const a = draw(fs1(), rest);
    expect(a.stub.log.filter((r) => r.op === "stroke" && r.style === GRID_STYLE).length).toBe(0);
    const b = draw(fs1(), build);
    const gridStroke = b.stub.log.find((r) => r.op === "stroke" && r.style === GRID_STYLE);
    expect(b.stub.log.filter((r) => r.op === "stroke" && r.style === GRID_STYLE).length).toBe(1);
    expect(gridStroke?.args[0]).toBe(14); // (COLS+1)+(ROWS+1) = 7+7 segments
  });

  it("A3/A4: the selected cell is its own select-stroke, exact at both fitted scales", () => {
    for (const width of [360, 390, 412, 844, 1440]) {
      const view: ViewState = { width, height: 900 };
      const stub = makeCtx();
      drawScene(stub.ctx, fs1(), fitCamera(view), view, { ...rest, selected: 1 });
      expect(stub.log.filter((r) => r.op === "stroke" && r.style === SELECT_STYLE).length).toBe(1);
      expect(stub.log.filter((r) => r.op === "stroke" && r.style === GRID_STYLE).length).toBe(0);
    }
    expect(SCALE).toBeCloseTo(1.8056, 4);
  });

  it("D1/D2: paint ceilings hold for rest, build and the mature seed", () => {
    expect(draw(fs1(), rest).stub.paints()).toBeLessThanOrEqual(80);
    expect(draw(fs1(), build).stub.paints()).toBeLessThanOrEqual(90);
    expect(draw(mature(), rest).stub.paints()).toBeLessThanOrEqual(240);
  });

  it("D3: per-entity growth caps on the mature seed", () => {
    const { stub } = draw(mature(), rest);
    const paints = stub.log.filter((r) => PAINT_OPS.has(r.op)).length;
    expect(paints).toBeLessThanOrEqual(40 + 8 * 12 + 18 * 3 + 5 * 5);
  });

  it("D4: two consecutive calls on the frozen state are element-wise identical", () => {
    const first = draw(fs1(), build).stub.log;
    const second = draw(fs1(), build).stub.log;
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("D5: op 0 covers the view; the grid stroke precedes entity paints; the ghost closes the frame", () => {
    const { stub, camera } = draw(fs1(), build);
    const first = stub.log[0];
    expect(first.op).toBe("fillRect");
    expect(first.args).toEqual([0, 0, VIEW.width, VIEW.height]);
    const gridAt = stub.log.findIndex((r) => r.op === "stroke" && r.style === GRID_STYLE);
    // First entity paint = the wreck hull fill (#6d90ab) after the grid line.
    const entityAt = stub.log.findIndex((r) => r.op === "fill" && r.style === "#6d90ab");
    expect(gridAt).toBeGreaterThan(0);
    expect(gridAt).toBeLessThan(entityAt);
    const lastPaint = [...stub.log].reverse().find((r) => PAINT_OPS.has(r.op));
    expect(lastPaint?.op).toBe("fillText");
    void camera;
  });

  it("D6: every recorded coord sits on the half-CSS-px grid and smoothing is off", () => {
    const { stub } = draw(fs1(), build);
    const offenders = stub.log.filter((r) =>
      r.args.some((v) => Number.isFinite(v) && Math.round(v * 2) !== v * 2)
    );
    expect(offenders).toEqual([]);
    expect(stub.ctx.imageSmoothingEnabled).toBe(false);
  });

  it("D7: the amber budget - at most 12 ops and only the three declared shapes", () => {
    const { stub, camera } = draw(fs1(), build);
    const amber = stub.log.filter(
      (r) => r.style === "#ffb765" && (r.op === "fillRect" || r.op === "fill")
    );
    expect(amber.length).toBeLessThanOrEqual(12);
    const rects = stub.log.filter((r) => r.style === "#ffb765" && r.op === "fillRect");
    for (const r of rects) {
      const [, , w, h] = r.args;
      expect(Math.abs(w - h)).toBeLessThanOrEqual(0.5);
      const units = w / camera.scale;
      const hit = AMBER_SHAPES.some(([aw]) => Math.abs(units - aw) < 0.4);
      expect(hit).toBe(true);
    }
  });

  it("B4/B5/B6: feature floor, quantised pips and every part inside its cell", () => {
    for (const row of Object.values(PARTS)) {
      for (const t of row) {
        expect(t[3]).toBeGreaterThanOrEqual(FEATURE_MIN_UNITS);
        expect(t[0]).toBeGreaterThanOrEqual(-16);
        expect(t[1]).toBeGreaterThanOrEqual(-16);
        expect(t[0] + t[2]).toBeLessThanOrEqual(16);
        expect(t[1] + t[3]).toBeLessThanOrEqual(16);
      }
    }
    const { stub } = draw(fs1(), rest);
    const thin = stub.log.filter(
      (r) => (r.op === "fillRect" && r.args[3] > 0 && r.args[3] < 3) ||
        (r.op === "ellipse" && r.args[3] > 0 && r.args[3] < 1.5)
    );
    expect(thin).toEqual([]);
  });

  it("B2: every pair of the six role silhouettes differs on at least 12 of 64 cells", () => {
    const ids = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"] as const;
    const masks = ids.map((id) => maskOf(PARTS[id]));
    let checked = 0;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const distance = masks[i].reduce((sum, bit, k) => sum + Math.abs(bit - masks[j][k]), 0);
        expect(distance, `${ids[i]} vs ${ids[j]}`).toBeGreaterThanOrEqual(12);
        checked += 1;
      }
    }
    expect(checked).toBe(15);
  });

  it("D9: five distinct accent hexes over the six status values", () => {
    const distinct = new Set(Object.values(STATUS_ACCENTS));
    expect(distinct.size).toBe(5);
    expect(STATUS_ACCENTS.powerLimited).not.toBe(STATUS_ACCENTS.idle);
    expect(STATUS_ACCENTS.powerLimited).not.toBe(STATUS_ACCENTS.paused);
  });

  it("B7: reduced motion keeps the 4-unit lean - five units read as five", () => {
    const state = mature();
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, { ...rest, reducedMotion: true });
    const bodyWidth = Math.round(6 * SCALE * 2) / 2;
    const bodies = stub.log.filter((r) => r.op === "fillRect" && Math.abs(r.args[2] - bodyWidth) <= 0.5);
    const xs = new Set(bodies.map((r) => r.args[0]));
    expect(xs.size).toBeGreaterThanOrEqual(5);
    expect(LEAN_UNITS).toBe(4);
  });

  it("E6: the world maps through the unchanged camera helpers", () => {
    const camera = fitCamera(VIEW);
    const p = worldToScreen(camera, VIEW, 0, 0);
    expect(p.x).toBeCloseTo(VIEW.width / 2 - camera.x * camera.scale, 6);
    expect(DOCK_TILE).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Q-004 phase A (spec rev-q4spec-g1 3A/3B): sub-tick motion and agreement.   */
/* -------------------------------------------------------------------------- */

const S = fitCamera(VIEW).scale;
const half = (v: number) => Math.round(v * 2) / 2;
/** Phone-scale widths of the ops the rows below locate by geometry. */
const BAR_W = half(6 * S); // 11 - status accent bar
const BAR_H = half(2 * S); // 3.5
const TOKEN_W = half(3 * S); // 5.5 - amber tray/route token
const BODY_W = half(6 * S); // 11 - drone body
const BODY_H = half(4 * S); // 7
const NINE = 9; // recorded ops per airborne drone unit

/** The half-CSS-px grid means every measured coord within +/- 0.5. */
const onGrid = (v: number, t: number) => Math.abs(v - t) <= 0.5;

function cellOf(tile: number): { x: number; y: number } {
  const c = tileToWorld(tile);
  return worldToScreen(fitCamera(VIEW), VIEW, c.x, c.y);
}

/** Status accent bar of one machine, found by cell geometry rather than log index. */
function accentOf(log: Rec[], tile: number): string | null {
  const p = cellOf(tile);
  const hit = log.find(
    (r) =>
      r.op === "fillRect" &&
      onGrid(r.args[2], BAR_W) &&
      onGrid(r.args[3], BAR_H) &&
      onGrid(r.args[0], p.x - 9 * S) &&
      onGrid(r.args[1], p.y + 10 * S)
  );
  return hit ? String(hit.style) : null;
}

/** Tray tokens drawn for one machine (0 or 1 by construction). */
function trayTokensOf(log: Rec[], tile: number): number {
  const p = cellOf(tile);
  return log.filter(
    (r) =>
      r.op === "fillRect" &&
      r.style === "#ffb765" &&
      onGrid(r.args[2], TOKEN_W) &&
      onGrid(r.args[0], p.x + 8 * S) &&
      onGrid(r.args[1], p.y - 13 * S)
  ).length;
}

/** Store gauge: the 5-box pip row anchored on the dock cell, filled boxes counted. */
function storeGauge(log: Rec[]): { total: number; filled: number } {
  const p = cellOf(DOCK_TILE);
  const first = p.x - 7 * S;
  const boxes = log.filter(
    (r) =>
      r.op === "rect" &&
      onGrid(r.args[2], half(2 * S)) &&
      onGrid(r.args[3], half(2 * S)) &&
      onGrid(r.args[1], p.y + 4 * S) &&
      r.args[0] >= first - 0.5 &&
      r.args[0] <= first + 4 * 3 * S + 0.5
  );
  return { total: boxes.length, filled: boxes.filter((r) => r.style === "#ffb765").length };
}

/** Drone body centres in unit order; the lead unit is index 0. */
function bodies(log: Rec[]): [number, number][] {
  return log
    .filter(
      (r) => r.op === "fillRect" && r.style === "#5fd8e8" && onGrid(r.args[2], BODY_W) && onGrid(r.args[3], BODY_H)
    )
    .map((r) => [r.args[0] + r.args[2] / 2, r.args[1] + r.args[3] / 2] as [number, number]);
}

/** The drone group is the tail of the frame: NINE recorded ops per airborne unit. */
function droneOps(state: SimState, framePhase: number, reducedMotion = false): Rec[] {
  const units = 1 + state.spares.length;
  return draw(state, { ...rest, reducedMotion, framePhase }).stub.log.slice(-NINE * units);
}

/** The mature yard with per-row overrides, so each row pins one number. */
function relaid(patch: { statuses?: MachineStatus[]; tray?: number[]; store?: [number, number] }): SimState {
  const state = mature();
  return {
    ...state,
    machines: state.machines.map((m, i) => ({
      ...m,
      status: patch.statuses ? patch.statuses[i] : m.status,
      trayUnits: patch.tray ? patch.tray[i] : m.trayUnits,
    })),
    storeUnits: patch.store ? patch.store[0] : state.storeUnits,
    storeCapacity: patch.store ? patch.store[1] : state.storeCapacity,
  } as unknown as SimState;
}

/** A5 walks one 10-tick leg at 6 frames per tick, then the next leg starts again. */
function legState(frame: number): SimState {
  const legs = Math.floor(frame / 60);
  const within = frame % 60;
  const base = fs1();
  return {
    ...base,
    tick: 340 + 10 * legs + Math.floor(within / 6),
    drone: { ...base.drone, repaired: true, inFlight: { arrive: 350 + 10 * legs, units: 3 } },
  } as unknown as SimState;
}

function rgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

const CYCLE: MachineStatus[] = ["running", "starved", "outputFull", "idle", "powerLimited", "paused"];

describe("Q-004a 3A: sub-tick interpolation from one caller-supplied phase", () => {
  it("C-1: getFramePhase is a [0,1) fraction that advances with the frame clock and restarts each tick", () => {
    vi.useFakeTimers();
    let clock = 0;
    const store = createStore({ storage: null, now: () => clock, frameClock: () => clock });
    store.start();
    const start = store.getFramePhase();
    const tickStart = store.getState().tick;
    vi.advanceTimersByTime(40);
    const first = store.getFramePhase();
    vi.advanceTimersByTime(15);
    const second = store.getFramePhase();
    vi.advanceTimersByTime(85);
    const after = store.getFramePhase();
    const tickAfter = store.getState().tick;
    store.stop();
    vi.useRealTimers();
    // 140 ms of fake clock = one whole tick plus a remainder.
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThan(1);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(second).toBeGreaterThan(first);
    expect(tickAfter).toBeGreaterThan(tickStart);
    expect(start).toBe(0);
  });

  it("A1: with the same state, framePhase 0.0 and 0.9 move 4+ of the six drone elements", () => {
    const state = fs1();
    const at0 = droneOps(state, 0);
    const at9 = droneOps(state, 0.9);
    expect(at0.length).toBe(NINE); // one airborne unit, no ghost: the tail is the group
    let coordOps = 0;
    let differing = 0;
    for (let i = 0; i < at0.length; i += 1) {
      if (at0[i].args.length === 0) continue;
      coordOps += 1;
      if (JSON.stringify(at0[i].args) !== JSON.stringify(at9[i].args)) differing += 1;
    }
    expect(coordOps).toBeGreaterThanOrEqual(6); // shadow, two rotors, body, pod, nose
    expect(differing).toBeGreaterThanOrEqual(4);
  });

  it("A2: six frames per tick give 5+ distinct lead-unit sub-positions, both fixtures", () => {
    for (const state of [fs1(), mature()]) {
      const seen = new Set<string>();
      for (let i = 0; i < 6; i += 1) {
        const lead = bodies(draw(state, { ...rest, framePhase: i / 6 }).stub.log)[0];
        seen.add(lead.join(","));
      }
      expect(seen.size).toBeGreaterThanOrEqual(5);
    }
  });

  it("A5: over a 300-frame log at least 80 % of consecutive pairs move 0.5 CSS px or more", () => {
    const track: [number, number][] = [];
    for (let f = 0; f < 300; f += 1) {
      const lead = bodies(draw(legState(f), { ...rest, framePhase: (f % 6) / 6 }).stub.log)[0];
      track.push(lead);
    }
    let moved = 0;
    for (let f = 1; f < track.length; f += 1) {
      const d = Math.hypot(track[f][0] - track[f - 1][0], track[f][1] - track[f - 1][1]);
      if (d >= 0.5) moved += 1;
    }
    expect(track.length).toBe(300);
    expect(moved / (track.length - 1)).toBeGreaterThanOrEqual(0.8);
  });

  it("A7: reduced motion keeps the documented steps at the pinned phone centres", () => {
    const logs = [0, 0.5, 0.9].map((phase) => droneOps(mature(), phase, true));
    expect(JSON.stringify(logs[1])).toBe(JSON.stringify(logs[0])); // only t = 0.5 exists
    expect(JSON.stringify(logs[2])).toBe(JSON.stringify(logs[0]));
    const centres = bodies(draw(mature(), { ...rest, reducedMotion: true, framePhase: 0.9 }).stub.log);
    expect(centres.length).toBe(5);
    const lean = [-14.44, -7.22, 0, 7.22, 14.44];
    centres.forEach((c, i) => {
      expect(Math.abs(c[0] - (166.11 + lean[i]))).toBeLessThanOrEqual(1);
      expect(Math.abs(c[1] - 402.47)).toBeLessThanOrEqual(1);
    });
  });

  it("A8: the five reduced-motion units keep a 4-unit pitch", () => {
    const units = 1 + mature().spares.length;
    const group = droneOps(mature(), 0, true);
    const xs = group
      .filter((r) => r.op === "fillRect" && r.style === "#5fd8e8" && onGrid(r.args[2], BODY_W) && onGrid(r.args[3], BODY_H))
      .map((r) => r.args[0])
      .sort((a, b) => a - b);
    expect(xs.length).toBe(units);
    const pitches = xs.slice(1).map((v, i) => v - xs[i]);
    // 4 units at the phone scale, on the 0.5 px snap grid of D6.
    expect(LEAN_UNITS * S).toBeGreaterThanOrEqual(7.22);
    for (const pitch of pitches) expect(pitch).toBeGreaterThanOrEqual(7.22 - 0.5);
  });

  it("A9: a cargo token interpolates over its 5-tick latency and never walks back", () => {
    const state = fs1();
    state.routes = [state.routes[1]]; // the store -> machine leg, arrive 345 at tick 344
    const ys: number[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const log = draw(state, { ...rest, framePhase: i / 6 }).stub.log;
      const token = log.filter(
        (r) => r.op === "fillRect" && r.style === "#ffb765" && onGrid(r.args[2], TOKEN_W)
      )[0];
      seen.add(`${token.args[0]},${token.args[1]}`);
      ys.push(token.args[1]);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);
  });

  it("A10: the same (state, framePhase) sequence twice gives an identical op log", () => {
    const runOnce = () =>
      [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6].map((phase) => draw(mature(), { ...rest, framePhase: phase }).stub.log);
    expect(JSON.stringify(runOnce())).toBe(JSON.stringify(runOnce()));
  });
});

describe("Q-004a 3B: world and panel agree in the same frame", () => {
  it("B1: one state read per rendered frame reaches both surfaces", async () => {
    const recorded = makeCtx();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => recorded.ctx) as unknown as typeof original;
    let reads = 0;
    const base = createStore({ storage: memoryStore(), now: () => 10 });
    const counted: GameStore = {
      ...base,
      getState: () => {
        reads += 1;
        return base.getState();
      },
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => {
        root.render(createElement(App, { store: counted }));
      });
      act(() => {
        const begin = [...document.querySelectorAll("button")].find((node) =>
          (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith("Begin recovery")
        );
        begin?.click();
      });
      const before = reads;
      for (let i = 0; i < 5; i += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const after = reads;
      expect(before).toBeGreaterThanOrEqual(1);
      expect(after).toBeGreaterThan(before);
      expect((after - before) / 5).toBeLessThanOrEqual(2);
    } finally {
      act(() => {
        root.unmount();
      });
      host.remove();
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("B2: the drawn accent equals the one status table for all eight machines", () => {
    const state = mature();
    const { stub } = draw(state, { ...rest, framePhase: 0.4 });
    const agree = state.machines.map((m) => accentOf(stub.log, m.tile) === STATUS_ACCENTS[m.status]);
    expect(agree.filter(Boolean).length).toBe(8);
    expect(Object.values(STATUS_ACCENTS).includes("#7fd6c2")).toBe(true);
  });

  it("B3: powerLimited is separable from idle while the frame is animating", () => {
    const { stub } = draw(mature(), { ...rest, framePhase: 0.9 });
    const drawn = new Set(stub.log.filter((r) => r.op === "fillRect").map((r) => String(r.style)));
    expect(drawn.has("#7fd6c2")).toBe(true);
    expect(drawn.has("#6f93ad")).toBe(true);
    const [a, b] = [rgb("#7fd6c2"), rgb("#6f93ad")];
    const wide = a.map((v, i) => Math.abs(v - b[i])).filter((d) => d >= 20).length;
    expect(wide).toBeGreaterThanOrEqual(2);
  });

  it("B4: animating machines and running accents agree in every one of 300 frames", () => {
    let mismatches = 0;
    let observed = 0;
    const seenCounts = new Set<number>();
    for (let f = 0; f < 300; f += 1) {
      const tick = 344 + Math.floor(f / 6);
      const statuses = Array.from({ length: 8 }, (_, i) => CYCLE[(i + tick) % CYCLE.length]);
      const state = relaid({ statuses });
      const { stub } = draw(state, { ...rest, framePhase: (f % 6) / 6 });
      const drawn = state.machines.map((m) => accentOf(stub.log, m.tile));
      const running = drawn.filter((hex) => hex === STATUS_ACCENTS.running).length;
      const animating = statuses.filter((s) => s === "running").length;
      seenCounts.add(animating);
      if (running !== animating) mismatches += 1;
      observed += 1;
    }
    expect(observed).toBe(300);
    expect(mismatches).toBe(0);
    expect(seenCounts.size).toBeGreaterThanOrEqual(2); // the log really changes, not one frozen frame
  });

  it("B5: a starved machine holds its coords across three frames under the violet accent", () => {
    const five = ["starved", "starved", "starved", "starved", "starved", "running", "running", "idle"] as MachineStatus[];
    const state = relaid({ statuses: five });
    const blocks = [0, 1, 2].map((k) => draw(state, { ...rest, framePhase: k / 3 }).stub.log);
    const starved = state.machines.filter((m) => m.status === "starved");
    expect(starved.length).toBe(5);
    for (const m of starved) {
      // The quantised pip rows are the machine's own animated part: `rect` ops come from
      // the group-fill helper only, so the moving tokens and drone are not in this set.
      const sig = (log: Rec[]) =>
        JSON.stringify(
          log
            .filter((r) => {
              const p = cellOf(m.tile);
              return (
                r.op === "rect" &&
                r.args.length >= 4 &&
                Math.abs(r.args[0] - p.x) <= 16 * S &&
                Math.abs(r.args[1] - p.y) <= 16 * S
              );
            })
            .map((r) => [r.op, r.style, ...r.args])
        );
      const bar = (log: Rec[]) => JSON.stringify(accentOf(log, m.tile));
      expect(sig(blocks[1])).toBe(sig(blocks[0]));
      expect(sig(blocks[2])).toBe(sig(blocks[0]));
      expect(sig(blocks[0]).length).toBeGreaterThan(10); // the cell really was painted
      expect(bar(blocks[1])).toBe(bar(blocks[0]));
      expect(accentOf(blocks[0], m.tile)).toBe("#8a7ad8");
    }
  });

  it("B6: tray tokens and the store gauge follow the numbers, not the frame", () => {
    const tray = [0, 12, 1, 5, 12, 0, 3, 12];
    const state = relaid({ tray, store: [312, 900] });
    const { stub } = draw(state, { ...rest, framePhase: 0.5 });
    state.machines.forEach((m, i) => {
      expect(trayTokensOf(stub.log, m.tile), `machine ${m.id} tray ${tray[i]}`).toBe(tray[i] > 0 ? 1 : 0);
    });
    const gauge = storeGauge(stub.log);
    expect(gauge.total).toBe(5);
    expect(gauge.filled).toBe(2); // 312/900 -> ceil(1.7333) = 2
    const pipCount = (units: number) =>
      storeGauge(draw(relaid({ tray, store: [units, 900] }), { ...rest, framePhase: 0 }).stub.log).filled;
    expect(pipCount(0)).toBe(0);
    expect(pipCount(1)).toBe(1);
    expect(pipCount(900)).toBe(5);
  });

  it("B7: the selection outline is in the first draw after the tap", () => {
    const before = draw(mature(), { ...rest, selected: null }).stub.log;
    expect(before.filter((r) => r.op === "stroke" && r.style === SELECT_STYLE).length).toBe(0);
    const first = draw(mature(), { ...rest, selected: 3 }).stub.log;
    const strokes = first.filter((r) => r.op === "stroke" && r.style === SELECT_STYLE);
    expect(strokes.length).toBe(1);
    const p = cellOf(3);
    // The outline path is recorded under the last fill style, so it is found by its
    // 2 x snap(16 units) box size rather than by the stroke colour.
    const box = first.find((r) => r.op === "rect" && Math.abs(r.args[2] - 2 * half(16 * S)) <= 0.5);
    expect(box).toBeDefined();
    expect(Math.abs(box!.args[0] + box!.args[2] / 2 - p.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(box!.args[1] + box!.args[3] / 2 - p.y)).toBeLessThanOrEqual(1);
  });

  it("every blueprint resolves to a painted part row", () => {
    const ids = Object.keys(BLUEPRINTS);
    expect(ids.length).toBe(8);
    const dedicated: string[] = [];
    const fallback: string[] = [];
    for (const id of ids) {
      const row = PARTS[id] ?? PARTS.generic;
      expect(row.length, id).toBeGreaterThan(0);
      for (const t of row) expect(t[3]).toBeGreaterThanOrEqual(FEATURE_MIN_UNITS);
      (PARTS[id] ? dedicated : fallback).push(id);
    }
    // D-1 gives the four tier-3/tier-4 blueprints their own row, so the fallback list
    // is empty and every authored id resolves to a dedicated silhouette.
    expect(dedicated.sort().join(",")).toBe(
      "circuitAssembler,copperSeparator,furnace,platePress,polymerRecycler,signalLab,sorter,wireMill"
    );
    expect(fallback.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* REV-LAYOUT-g1 rows 1-4 (sec.3 acceptance checks).                           */
/* -------------------------------------------------------------------------- */

/** Chrome edges as rev-layout-g1 sec.1 measured them in chromium (CSS px). */
const CHROME = {
  landscape: { view: { width: 844, height: 390 } as ViewState, hudBottom: 52, dockTop: 336 },
  phone: { view: { width: 390, height: 844 } as ViewState, hudBottom: 52, dockTop: 790 },
  desktop: { view: { width: 1440, height: 900 } as ViewState, hudBottom: 52, dockTop: 846 },
};

function bandCase(label: keyof typeof CHROME): { camera: Camera; s: (worldY: number) => number; insets: CameraInsets } {
  const { view, hudBottom, dockTop } = CHROME[label];
  const insets: CameraInsets = { top: hudBottom, bottom: view.height - dockTop };
  const camera = fitCamera(view, insets);
  const s = (worldY: number) => worldToScreen(camera, view, 0, worldY).y;
  return { camera, s, insets };
}

describe("REV-LAYOUT-g1 3A: camera fit and glyph clearance", () => {
  it("L-1: the landscape fit keeps dock and wreck inside the chrome band", () => {
    const landscape = bandCase("landscape");
    const { s, insets } = landscape;
    const yardTop = s(0);
    const yardBottom = s(WORLD_H);
    const dockY = s(tileToWorld(DOCK_TILE).y);
    const wreckY = s(WRECK_POSITION.y);
    console.log("L-1 landscape measured", JSON.stringify({
      s: +landscape.camera.scale.toFixed(4),
      yard: [+yardTop.toFixed(2), +yardBottom.toFixed(2)],
      height: +(yardBottom - yardTop).toFixed(2),
      dockY: +dockY.toFixed(2),
      wreckY: +wreckY.toFixed(2),
      band: [insets.top, CHROME.landscape.view.height - insets.bottom],
    }));
    // The band binds in landscape: 284 px of clear column for a 236-unit world.
    expect(landscape.camera.scale).toBeCloseTo(284 / (WORLD_H + 12), 4);
    expect(yardTop).toBeGreaterThanOrEqual(insets.top);
    expect(yardBottom).toBeLessThanOrEqual(CHROME.landscape.view.height - insets.bottom);
    expect(dockY).toBeGreaterThanOrEqual(insets.top);
    expect(dockY).toBeLessThanOrEqual(CHROME.landscape.view.height - insets.bottom);
    expect(wreckY).toBeGreaterThanOrEqual(insets.top);
    expect(wreckY).toBeLessThanOrEqual(CHROME.landscape.view.height - insets.bottom);
    // Portrait keeps the width term and the legacy centre exactly, so that canvas is
    // byte-identical; desktop is the one case the band pulls in.
    const phone = bandCase("phone");
    expect(phone.camera.scale).toBe(390 / (WORLD_W + 24));
    expect(phone.camera.y).toBe(WORLD_H / 2);
    expect(phone.camera.x).toBe(WORLD_W / 2);
    const desktop = bandCase("desktop");
    const dTop = desktop.s(0);
    const dBottom = desktop.s(WORLD_H);
    console.log("L-1 desktop measured", JSON.stringify({
      s: +desktop.camera.scale.toFixed(4),
      yard: [+dTop.toFixed(2), +dBottom.toFixed(2)],
      dockY: +desktop.s(tileToWorld(DOCK_TILE).y).toFixed(2),
      wreckY: +desktop.s(WRECK_POSITION.y).toFixed(2),
    }));
    expect(dTop).toBeGreaterThanOrEqual(CHROME.desktop.hudBottom);
    expect(dBottom).toBeLessThanOrEqual(CHROME.desktop.dockTop);
    expect(desktop.s(WRECK_POSITION.y)).toBeLessThanOrEqual(CHROME.desktop.dockTop);
    // No insets at all still means the legacy fit.
    expect(fitCamera(VIEW).scale).toBe(390 / (WORLD_W + 24));
    expect(fitCamera(VIEW).y).toBe(WORLD_H / 2);
  });

  it("L-4: the level digit clears the perimeter rail at every fitted scale", () => {
    // The two full-width 2-unit bands of the floor kit are the perimeter rails.
    const rails = FLOOR_KIT.filter((t) => t[2] === WORLD_W && t[3] === 2).map(
      (t) => [t[1], t[1] + t[3]] as [number, number]
    );
    expect(rails).toEqual([
      [0, 2],
      [190, 192],
    ]);

    const lines: string[] = [];
    for (const scale of [1.2034, 1.8056, 3.9074, 4]) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale };
      for (let row = 0; row < YARD_ROWS; row += 1) {
        const base = fs1();
        const state = {
          ...base,
          machines: [{ ...base.machines[0], id: 1, tile: row * 6, level: 4 }],
        } as SimState;
        const stub = makeCtx();
        drawScene(stub.ctx, state, camera, VIEW, rest);
        const digit = stub.log.find((r) => r.op === "fillText" && r.text === "4");
        expect(digit, `row ${row} at s=${scale}`).toBeDefined();
        // The font the painter actually set, read off the same context.
        const font = parseFloat(String((stub.ctx as unknown as { font: string }).font));
        expect(font).toBe(Math.round(6 * scale));
        const baseline = digit!.args[1];
        const ascent = DIGIT_ASCENT_PX[font] ?? DIGIT_ASCENT_RATIO_MAX * font;
        const toWorld = (px: number): number => (px - VIEW.height / 2) / scale + camera.y;
        const top = toWorld(baseline - ascent);
        const bottom = toWorld(baseline);
        let overlap = 0;
        for (const [railTop, railBottom] of rails) {
          overlap += Math.max(0, Math.min(bottom, railBottom) - Math.max(top, railTop));
        }
        lines.push(
          `s=${scale} row=${row} font=${font}px ascent=${ascent}px ` +
            `box=[${top.toFixed(2)},${bottom.toFixed(2)}] overlap=${+overlap.toFixed(2)}u/${+(overlap * scale).toFixed(2)}px`
        );
        expect(overlap).toBe(0);
      }
    }
    console.log("L-4 measured", JSON.stringify(lines, null, 0));
  });
});

/* -------------------------------------------------------------------------- */
/* REV-MOTION-C-g1 rows E-1..E-3 (rev-q4a-lay-g1 sec.3).                       */
/* -------------------------------------------------------------------------- */

/** The A3 cap for one frame's displacement and the half-pixel snap it is read on. */
const A3_CAP = 7.0;
const SNAP_TOL = 0.5;

/** The engine's own unit record; one per working drone. The fleet is staggered by 10
 *  ticks, the spacing the mature save carries (`nextDeliveryTick` 18298 / 18318 / 18328 /
 *  18336 / 18338), so the units do not hold at the dock in lockstep. */
function fleetUnits(count: number, startTick: number): DroneState[] {
  return Array.from({ length: count }, (_unused, i) => ({
    ...createUnit(),
    nextDeliveryTick: startTick + i * 10,
  }));
}

/** A fixture with `count` working units, so the engine can be walked for real. The two
 *  silhouette-only machines of the mature fixture carry `blueprint: "generic"`, which the
 *  engine's recipe table does not know, so they take a real id for the walk. */
function driven(base: SimState, count: number): SimState {
  const list = fleetUnits(count, base.tick);
  return {
    ...base,
    machines: base.machines.map((m) => (BLUEPRINTS[m.blueprint] ? m : { ...m, blueprint: "sorter" })),
    drone: list[0],
    spares: list.slice(1),
  } as unknown as SimState;
}

/** One driven walk: six frames per tick of the real engine, stepped before each draw as
 *  the app's frame loop does (`store.step`, then `getState()` + `getFramePhase()`). The
 *  body centres and the segment parameter `t` that produced them, per frame and per unit. */
function trackAll(state: SimState, ticks: number): { tracks: [number, number][][]; params: number[][] } {
  const tracks: [number, number][][] = [];
  const params: number[][] = [];
  for (let k = 0; k < ticks; k += 1) {
    advance(state, 1);
    for (let f = 0; f < 6; f += 1) {
      tracks.push(bodies(draw(state, { ...rest, framePhase: f / 6 }).stub.log));
      params.push(
        [state.drone, ...state.spares].map((unit) => +droneLeg(unit, state.tick, f / 6).toFixed(4))
      );
    }
  }
  return { tracks, params };
}

function stepDeltas(track: [number, number][]): number[] {
  return track.slice(1).map((p, i) => Math.hypot(p[0] - track[i][0], p[1] - track[i][1]));
}

describe("REV-MOTION-C-g1 E rows", () => {
  it("E-1: a leg boundary is a frame step, not a teleport - every pair within the A3 cap", () => {
    for (const [name, count] of [["fs1", 1], ["mature", 5]] as [string, number][]) {
      const state = driven(name === "fs1" ? fs1() : mature(), count);
      const { tracks, params } = trackAll(state, 50);
      const track = tracks.map((f) => f[0]);
      const d = stepDeltas(track);
      const max = Math.max(...d);
      // The first leg is recorded on the first step (cargo `arrive` = start + 10), so the
      // samples 54..59 are its last whole tick: the numbers below run straight through the
      // loaded -> empty seam, where the pre-fix code teleported the whole 343.5 px leg.
      const boundary = d.slice(48, 66).map((v) => +v.toFixed(2));
      const legParam = params.slice(48, 66).map((p) => p[0]);
      // Every tick of six frames carries six different parameters (A2's rule, per tick).
      const distinctPerTick = Array.from({ length: 50 }, (_u, k) =>
        new Set(params.slice(k * 6, k * 6 + 6).map((p) => p[0])).size
      );
      const top = d
        .map((v, i) => [i + 1, +v.toFixed(2)] as [number, number])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      console.log(`E-1 ${name} measured`, JSON.stringify({
        frames: track.length,
        maxPerFrameDelta: +max.toFixed(2),
        largestPairs: top,
        atLegBoundary: boundary,
        segmentParamAtBoundary: legParam,
        minDistinctParamPerTick: Math.min(...distinctPerTick),
        leadAt: [track[53], track[54], track[59], track[60], track[65], track[66]].map((p) => [+p[0].toFixed(2), +p[1].toFixed(2)]),
      }));
      expect(track.length).toBe(300);
      expect(max).toBeLessThanOrEqual(A3_CAP + SNAP_TOL);
      // The seam is visible in the parameter itself: six steps per tick, no jump of a
      // whole leg anywhere in the walk.
      expect(Math.max(...boundary)).toBeLessThanOrEqual(A3_CAP + SNAP_TOL);
      expect(Math.min(...distinctPerTick)).toBe(6);
    }
  });

  it("E-2: airborne duty - at least 80 % of consecutive frames really move in both fixtures", () => {
    // A5's definition: over 300 driven frames (299 pairs) at six frames per tick, the share
    // of pairs whose lead body moved >= 0.5 CSS px (one grid step), plus its max step. The
    // fleet line is the same count on the canvas level: a pair counts when *any* body moved,
    // which is what "at least one unit airborne on every tick" gives the eye.
    for (const [name, count] of [["fs1", 1], ["mature", 5]] as [string, number][]) {
      const state = driven(name === "fs1" ? fs1() : mature(), count);
      const { tracks: frames, params } = trackAll(state, 50);
      const leadD = stepDeltas(frames.map((f) => f[0]));
      const fleetD = frames.slice(1).map((f, i) =>
        Math.max(...f.map((p, k) => Math.hypot(p[0] - frames[i][k][0], p[1] - frames[i][k][1])))
      );
      const duty = (list: number[]): [number, number] => {
        const moving = list.filter((v) => v >= 0.5).length;
        return [moving, +(moving / list.length).toFixed(4)];
      };
      const [leadMoving, leadShare] = duty(leadD);
      const [fleetMoving, fleetShare] = duty(fleetD);
      const max = Math.max(...leadD);
      const stillAtTicks = [
        ...new Set(leadD.reduce<number[]>((acc, v, i) => (v < 0.5 ? [...acc, Math.floor(i / 6)] : acc), [])),
      ];
      // Six different segment parameters in every one of the 50 ticks is the proof that
      // the position is a function of the frame, not of the integer tick.
      const sixTicks = Array.from({ length: 50 }, (_u, k) =>
        new Set(params.slice(k * 6, k * 6 + 6).map((p) => p[0])).size
      ).filter((n) => n === 6).length;
      console.log(`E-2 ${name} measured`, JSON.stringify({
        pairs: leadD.length,
        bodiesPerFrame: frames[0].length,
        leadMoving,
        leadDutySharePct: +(leadShare * 100).toFixed(1),
        fleetMoving,
        fleetDutySharePct: +(fleetShare * 100).toFixed(1),
        maxPerFrameDelta: +max.toFixed(2),
        ticksWithSixDistinctParams: sixTicks,
        // Ticks whose lead body did not move one grid step. With the segment parameter
        // running over the drawn frames there is none; the pre-fix walk carried the two
        // whole-tick clamps of the leg (343.5 px apart).
        stillAtTicks,
      }));
      expect(leadShare).toBeGreaterThanOrEqual(0.8);
      expect(fleetShare).toBeGreaterThanOrEqual(0.8);
      expect(max).toBeLessThanOrEqual(A3_CAP);
      expect(sixTicks).toBe(50);
      expect(stillAtTicks.length).toBe(0);
    }
  });

  it("E-3: the landscape yard ends where the dock starts, also at text scale 2", () => {
    // rev-q4a-lay-g1 E-3. The chrome edges are the ones this run measures in chromium at
    // 844x390, ts2: the top cluster's bottom edge 71.94 and the dock's top edge 336, so
    // the band is 264.06 px and its own term is 1.1189. The floor has to stay under it.
    const view: ViewState = { width: 844, height: 390 };
    const dockTop = 336;
    const insets: CameraInsets = { top: 71.94, bottom: view.height - dockTop };
    const camera = fitCamera(view, insets);
    const s = (worldY: number) => worldToScreen(camera, view, 0, worldY).y;
    const usableH = view.height - insets.top - insets.bottom;
    const bandTerm = usableH / (WORLD_H + 12);
    const yardTop = s(0);
    const yardBottom = s(WORLD_H);
    console.log("E-3 measured", JSON.stringify({
      s: +camera.scale.toFixed(4),
      bandTerm: +bandTerm.toFixed(4),
      usableH: +usableH.toFixed(2),
      yardTop: +yardTop.toFixed(2),
      yardBottom: +yardBottom.toFixed(2),
      dockTop,
      overlapPx: +(yardBottom - dockTop).toFixed(2),
    }));
    // No floor above the band term, and the yard's lower edge inside the dock's top edge.
    expect(camera.scale).toBeLessThanOrEqual(bandTerm + 1e-9);
    expect(yardBottom).toBeLessThanOrEqual(dockTop + 0.5);
    // The fit is the band minus the 12-unit world padding, symmetric: `6 * scale` of
    // clearance above and below, so the yard centred in the band instead of shrinking.
    expect(dockTop - yardBottom).toBeCloseTo(6 * camera.scale, 1);
    expect(yardTop - insets.top).toBeCloseTo(6 * camera.scale, 1);
    // The other three cases keep the numbers L-1 accepted: 1.2034 (landscape ts1),
    // 1.8056 (phone, legacy) and 3.3644 (desktop ts1).
    for (const [label, scale] of [["landscape", 284 / (WORLD_H + 12)], ["phone", 390 / (WORLD_W + 24)], ["desktop", 794 / (WORLD_H + 12)]] as [keyof typeof CHROME, number][]) {
      expect(bandCase(label).camera.scale).toBeCloseTo(scale, 4);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* REV-GLYPH-B-g1 rows D-1..D-4, F-1 (rev-desk-g1 sec.2/3, rev-motion-g1 F-1).   */
/* -------------------------------------------------------------------------- */

/**
 * The ten drawn glyph roles: the dock, the five authored machine silhouettes, the four
 * roles that used to fall through to `generic`, and `generic` itself (D-1). The drone and
 * the cargo pod are the D-2 pair; the wreck path and the build ghost are two full-field
 * shapes and are named separately, as the 64-cell mask cannot separate them.
 */
const GLYPH_ROLES = [
  "dock",
  "sorter",
  "furnace",
  "wireMill",
  "signalLab",
  "polymerRecycler",
  "copperSeparator",
  "platePress",
  "circuitAssembler",
  "generic",
] as const;

describe("REV-GLYPH-B-g1 D rows", () => {
  it("D-1: ten glyph silhouettes, every pair of the 45 at least 12 of 64 cells apart", () => {
    const masks = GLYPH_ROLES.map((id) => maskOf(PARTS[id] ?? []));
    const pairs: [string, number][] = [];
    for (let i = 0; i < GLYPH_ROLES.length; i += 1) {
      for (let j = i + 1; j < GLYPH_ROLES.length; j += 1) {
        const distance = masks[i].reduce((sum, bit, k) => sum + Math.abs(bit - masks[j][k]), 0);
        pairs.push([`${GLYPH_ROLES[i]}/${GLYPH_ROLES[j]}`, distance]);
      }
    }
    const worstFive = [...pairs].sort((a, b) => a[1] - b[1]).slice(0, 5);
    const min = Math.min(...pairs.map(([, d]) => d));
    console.log("D-1 measured", JSON.stringify({
      roles: GLYPH_ROLES.length,
      pairs: pairs.length,
      min,
      worstFive,
      cells: Object.fromEntries(GLYPH_ROLES.map((id, i) => [id, masks[i].reduce((sum, v) => sum + v, 0)])),
      maskPrint: Object.fromEntries(GLYPH_ROLES.map((id, i) => [id, masks[i].join("").replace(/(.{8})/g, "$1 ").trim()])),
      genericEqualsSorter: JSON.stringify(PARTS.generic) === JSON.stringify(PARTS.sorter),
    }));
    console.log(
      `D-1 pairs=${pairs.length} min=${min} worst5=${worstFive.map(([k, v]) => `${v}:${k}`).join("  ")}`
    );
    expect(pairs.length).toBe(45);
    expect(min).toBeGreaterThanOrEqual(12);
    // The five roles that shared two silhouettes now carry their own mask.
    for (const id of ["polymerRecycler", "copperSeparator", "platePress", "circuitAssembler"]) {
      expect(maskOf(PARTS[id]).join("")).not.toBe(maskOf(PARTS.sorter).join(""));
      expect(maskOf(PARTS[id]).join("")).not.toBe(maskOf(PARTS.generic).join(""));
    }
    expect(JSON.stringify(PARTS.generic)).not.toBe(JSON.stringify(PARTS.sorter));
  });

  it("D-2: the cargo pod sits outside the drone body envelope - 13 of 64 cells apart", () => {
    const base = fs1();
    const loaded = {
      ...base,
      drone: { ...base.drone, repaired: true, inFlight: { arrive: 350, qty: 3 } },
    } as unknown as SimState;
    const group = droneOps(loaded, 0.5); // one airborne unit: the tail is the whole group
    const body = group.find(
      (r) => r.op === "fillRect" && r.style === "#5fd8e8" && onGrid(r.args[2], BODY_W) && onGrid(r.args[3], BODY_H)
    );
    const pod = group.find((r) => r.op === "fillRect" && onGrid(r.args[2], TOKEN_W) && onGrid(r.args[3], TOKEN_W));
    expect(body, "the drone body").toBeDefined();
    expect(pod, "the cargo pod").toBeDefined();
    // The glyph origin is the body centre (DR1 is [-3,-2,6,4]); the pod's unit box comes
    // off the same painted frame, so the mask below is the drawn geometry, not a table.
    const cx = body!.args[0] + body!.args[2] / 2;
    const cy = body!.args[1] + body!.args[3] / 2;
    const podBox: readonly PartTuple[] = [[
      (pod!.args[0] - cx) / S, (pod!.args[1] - cy) / S, pod!.args[2] / S, pod!.args[3] / S, 7,
    ]];
    const droneMask = maskOf(PARTS.drone);
    const cargoMask = maskOf(podBox);
    const droneCells = droneMask.reduce((sum, v) => sum + v, 0);
    const cargoCells = cargoMask.reduce((sum, v) => sum + v, 0);
    const pair = droneMask.reduce((sum, bit, k) => sum + Math.abs(bit - cargoMask[k]), 0);
    const podOffsetX = pod!.args[0] - cx;
    const podOffsetY = pod!.args[1] - cy;
    console.log(`D-2 droneCells=${droneCells} cargoCells=${cargoCells} hamming=${pair}`, JSON.stringify({
      podStyle: String(pod!.style),
      podBoxUnits: podBox[0].slice(0, 4).map((v) => +Number(v).toFixed(3)),
      podOffsetPx: [+podOffsetX.toFixed(2), +podOffsetY.toFixed(2)],
      cargoCellIndex: cargoMask.findIndex((v) => v === 1),
      droneRows: [...new Set(droneMask.map((v, i) => (v ? Math.floor(i / 8) : -1)).filter((r) => r >= 0))],
    }));
    expect(droneCells).toBe(12);
    expect(cargoCells).toBe(1);
    expect(pair).toBe(13);
    expect(pair).toBeGreaterThanOrEqual(12);
    // Amber keeps its colour index, so the frame carries no new paint group.
    expect(String(pod!.style)).toBe("#ffb765");
    // Below the shadow ellipse (which ends at unit 6) and inside the cell.
    expect(podOffsetY).toBeGreaterThan(6 * S - 0.5);
    expect(podOffsetY + TOKEN_W).toBeLessThanOrEqual(16 * S + 0.5);
  });

  it("D-3: powerLimited adds a shape mark - accent shape Hamming 3, hue band unchanged", () => {
    // Accent shape of one status = the 6x2 bar plus any shape mark the painter adds,
    // read off the drawn frame as unit offsets from the cell centre.
    const shapeOf = (status: MachineStatus): { mask: number[]; rects: number } => {
      const base = fs1();
      const state = {
        ...base,
        machines: [{ ...base.machines[0], id: 1, tile: 8, blueprint: "sorter", status }],
      } as unknown as SimState;
      const log = draw(state, rest).stub.log;
      const p = cellOf(8);
      const rects = log.filter(
        (r) =>
          r.op === "fillRect" &&
          onGrid(r.args[2], half(6 * S)) &&
          onGrid(r.args[0], p.x - 9 * S) &&
          (onGrid(r.args[1], p.y + 10 * S) || onGrid(r.args[1], p.y + 13 * S))
      );
      const boxes = rects.map(
        (r) => [(r.args[0] - p.x) / S, (r.args[1] - p.y) / S, r.args[2] / S, r.args[3] / S, 0] as PartTuple
      );
      return { mask: maskOf(boxes), rects: rects.length };
    };
    const shape = {} as Record<MachineStatus, { mask: number[]; rects: number }>;
    for (const status of CYCLE) shape[status] = shapeOf(status);
    const shapeHamming = (a: MachineStatus, b: MachineStatus): number =>
      shape[a].mask.reduce((sum, bit, k) => sum + Math.abs(bit - shape[b].mask[k]), 0);
    const runningVsPower = shapeHamming("running", "powerLimited");
    const others = (["idle", "running", "starved", "outputFull"] as MachineStatus[]).flatMap((a, i, list) =>
      list.slice(i + 1).map((b) => [`${a}/${b}`, shapeHamming(a, b)] as [string, number])
    );
    // Hue separability and the WCAG band against the floor are the numbers D-3 quotes.
    const deltas = (a: string, b: string): number[] =>
      rgb(a).map((v, i) => Math.abs(v - rgb(b)[i]));
    const FIVE: MachineStatus[] = ["idle", "running", "starved", "outputFull", "powerLimited"];
    const pairs: [string, number[]][] = [];
    let minOver20 = 99;
    for (let i = 0; i < FIVE.length; i += 1) {
      for (let j = i + 1; j < FIVE.length; j += 1) {
        const d = deltas(STATUS_ACCENTS[FIVE[i]], STATUS_ACCENTS[FIVE[j]]);
        minOver20 = Math.min(minOver20, d.filter((v) => v > 20).length);
        pairs.push([`${FIVE[i]}/${FIVE[j]}`, d]);
      }
    }
    const nearest = [...pairs].sort((a, b) => a[1].reduce((s, v) => s + v, 0) - b[1].reduce((s, v) => s + v, 0))[0];
    // WCAG 1.4.3 relative luminance over the sRGB channels.
    const channel = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string): number => {
      const [r, g, b] = rgb(hex).map(channel);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string): number => {
      const la = luminance(a);
      const lb = luminance(b);
      return +((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(3);
    };
    const accents = [...new Set(Object.values(STATUS_ACCENTS))];
    const band = accents.map((hex) => contrast(hex, PALETTE.floor)).sort((a, b) => a - b);
    const markContrast = contrast(PALETTE.select, PALETTE.floor);
    console.log("D-3 measured", JSON.stringify({
      runningVsPowerLimitedShapeHamming: runningVsPower,
      otherAccentPairs: others,
      rectsPerStatus: Object.fromEntries(CYCLE.map((s) => [s, shape[s].rects])),
      minChannelsOver20: minOver20,
      nearestHuePair: nearest,
      wcagVsFloor: Object.fromEntries(accents.map((h) => [h, contrast(h, PALETTE.floor)])),
      markStyle: PALETTE.select,
      markContrast,
    }));
    expect(runningVsPower).toBe(3);
    expect(runningVsPower).toBeGreaterThanOrEqual(3);
    // The four untouched accents still share the one 3-cell bar (shape Hamming 0).
    for (const [, value] of others) expect(value).toBe(0);
    expect(shape.powerLimited.rects).toBe(2);
    expect(shape.running.rects).toBe(1);
    expect(minOver20).toBe(2);
    expect(nearest[0]).toBe("running/powerLimited");
    expect(nearest[1]).toEqual([32, 2, 38]);
    // Every accent, and the new mark, clears 3.0 against the floor inside the measured band.
    for (const value of band) {
      expect(value).toBeGreaterThanOrEqual(3.0);
      expect(value).toBeGreaterThanOrEqual(3.38 - 0.01);
      expect(value).toBeLessThanOrEqual(7.2 + 0.01);
    }
    expect(markContrast).toBeGreaterThanOrEqual(3.0);
  });

  it("D-4: identity marks are 3 units tall - min painted feature 5.42 px at the phone scale", () => {
    const roles = [
      "sorter", "furnace", "wireMill", "signalLab",
      "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler", "generic",
    ] as const;
    const measured: Record<string, { minFeaturePx: number; bodyPx: number }> = {};
    for (const scale of [1.8056, 4]) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale };
      for (const blueprint of roles) {
        const base = fs1();
        const stub = makeCtx();
        drawScene(stub.ctx, {
          ...base,
          machines: [{ ...base.machines[0], id: 1, blueprint, tile: 8 }],
        } as unknown as SimState, camera, VIEW, rest);
        const rects = stub.log.filter((r) => r.op === "fillRect").map((r) => r.args);
        // The glyph's own rows, matched on the rect the painter actually emitted. The
        // ground/base bands (colour index 15) are one palette step, not an identity mark,
        // and the tallest rect is the body or the posts; what is left is the identity set.
        const row = PARTS[blueprint] ?? PARTS.generic;
        const c = tileToWorld(8);
        const p = worldToScreen(camera, VIEW, c.x, c.y);
        const tallest = Math.max(...row.map((t) => t[3]));
        const identity = row.filter((t) => t[4] !== 15 && t[3] < tallest);
        const painted = new Set(rects.map((a) => JSON.stringify(a)));
        expect(identity.length, `${blueprint} identity rows`).toBeGreaterThan(0);
        for (const t of identity) {
          const box = [half(p.x + t[0] * scale), half(p.y + t[1] * scale), half(t[2] * scale), half(t[3] * scale)];
          expect(painted.has(JSON.stringify(box)), `${blueprint} box ${JSON.stringify(box)}`).toBe(true);
        }
        const minUnits = Math.min(...identity.map((t) => t[3]));
        const bodyUnits = tallest;
        measured[`${blueprint}@${scale}`] = {
          minFeaturePx: +(minUnits * scale).toFixed(4),
          bodyPx: +(bodyUnits * scale).toFixed(2),
        };
        if (scale === 1.8056) {
          expect(minUnits, `${blueprint} identity height`).toBeGreaterThanOrEqual(3);
        }
      }
    }
    const phone = roles.map((r) => measured[`${r}@1.8056`].minFeaturePx);
    const desk = roles.map((r) => measured[`${r}@4`].minFeaturePx);
    const sorterBody = measured["sorter@1.8056"].bodyPx;
    const sorterBodyDesk = measured["sorter@4"].bodyPx;
    console.log("D-4 measured", JSON.stringify({
      minFeaturePhone: Math.min(...phone),
      minFeatureDesktop: Math.min(...desk),
      sorterBody: [sorterBody, sorterBodyDesk],
      perRole: measured,
      featureMinUnits: FEATURE_MIN_UNITS,
    }));
    expect(Math.min(...phone)).toBeCloseTo(5.42, 2);
    expect(Math.min(...phone)).toBeGreaterThanOrEqual(5.42 - 0.05);
    expect(Math.min(...phone)).toBeLessThanOrEqual(5.42 + 0.05);
    expect(Math.min(...desk)).toBeCloseTo(12, 1);
    expect(Math.min(...desk)).toBeGreaterThanOrEqual(12 - 0.1);
    expect(Math.min(...desk)).toBeLessThanOrEqual(12 + 0.1);
    // The 22-unit body is untouched by the thicker marks (39.70 px at phone, 88 at desk).
    expect(sorterBody).toBeCloseTo(39.7, 1);
    expect(sorterBodyDesk).toBeCloseTo(88, 1);
    expect(FEATURE_MIN_UNITS).toBe(2);
  });

  it("F-1: the nose side comes from the leg slope - 0.50 px attachment step, two flips a cycle", () => {
    const NOSE_W = half(2 * S); // the 2-unit select mark, the only one of its width
    const rows: Record<string, unknown> = {};
    for (const [name, count] of [["fs1", 1], ["mature", 5]] as [string, number][]) {
      const state = driven(name === "fs1" ? fs1() : mature(), count);
      const sides: number[][] = [];
      const offsets: number[][] = [];
      const signs: number[][] = [];
      for (let k = 0; k < 50; k += 1) {
        advance(state, 1);
        for (let f = 0; f < 6; f += 1) {
          const phase = f / 6;
          const log = draw(state, { ...rest, framePhase: phase }).stub.log;
          const bodyCentres = bodies(log).map((p) => p[0]);
          const noseCentres = log
            .filter((r) => r.op === "fillRect" && r.style === SELECT_STYLE && Math.abs(r.args[2] - NOSE_W) <= 0.5)
            .map((r) => r.args[0] + r.args[2] / 2);
          const units: DroneState[] = [state.drone, ...state.spares];
          expect(noseCentres.length).toBe(bodyCentres.length);
          sides.push(noseCentres.map((n, i) => (n > bodyCentres[i] ? 1 : -1)));
          offsets.push(noseCentres.map((n, i) => n - bodyCentres[i]));
          signs.push(
            units.map((unit) =>
              droneLeg(unit, state.tick, phase) - droneLeg(unit, state.tick, phase - 1 / 6) >= 0 ? 1 : -1
            )
          );
        }
      }
      const units = count;
      let maxAttachStep = 0;
      let offTravel = 0;
      let offLattice = 0;
      const flipGaps: number[][] = [];
      const firstFlips: number[] = [];
      const flipCounts: number[] = [];
      const noseXs = new Set<number>();
      for (let u = 0; u < units; u += 1) {
        const flipsAt: number[] = [];
        for (let f = 1; f < offsets.length; f += 1) {
          // The mark is rigid on the body: within one leg direction its offset from the
          // body centre may only move on the 0.5 px snap grid. The reversal frames are
          // the ones where the slope sign changes, and those are the side flips.
          if (signs[f][u] === signs[f - 1][u]) {
            const step = Math.abs(offsets[f][u] - offsets[f - 1][u]);
            maxAttachStep = Math.max(maxAttachStep, step);
            if (Math.abs(step * 2 - Math.round(step * 2)) > 1e-9) offLattice += 1;
          } else {
            flipsAt.push(f);
          }
          const expected = signs[f][u] >= 0 ? 1 : -1;
          if (sides[f][u] !== expected) offTravel += 1;
          noseXs.add(+offsets[f][u].toFixed(2));
        }
        flipGaps.push(flipsAt.slice(2).map((f, i) => f - flipsAt[i + 1]));
        firstFlips.push(flipsAt.length ? flipsAt[0] : -1);
        flipCounts.push(flipsAt.length);
      }
      // 300 frames = 50 ticks = one 50-tick delivery cycle, so the two reversals of a
      // cycle sit 60 frames (the 10-tick loaded leg) and 240 frames (the empty leg) apart.
      const gaps = flipGaps.flat();
      rows[name] = {
        frames: offsets.length,
        units,
        maxAttachmentStepPx: +maxAttachStep.toFixed(2),
        flipCountPerUnit: flipCounts,
        firstFlipPerUnit: firstFlips,
        flipGaps,
        offTravelSideFrames: offTravel,
        offLatticeSteps: offLattice,
        offsetValues: [...noseXs].sort((a, b) => a - b),
        slopeSigns: [...new Set(signs.flat())].sort(),
      };
      const sideRuns = Array.from({ length: units }, (_u, u) => {
        const runs: [number, number][] = [];
        for (let f = 0; f < sides.length; f += 1) {
          const last = runs[runs.length - 1];
          if (last && last[0] === sides[f][u]) last[1] += 1;
          else runs.push([sides[f][u], 1]);
        }
        return runs;
      });
      (rows as Record<string, Record<string, unknown>>)[name].sideRuns = sideRuns;
      // A 50-tick cycle is 300 frames: the loaded leg 60, the empty leg 240. Every whole
      // run of one side is one of those two lengths, and two consecutive runs make 300.
      for (const runs of sideRuns) {
        expect(runs.reduce((s, r) => s + r[1], 0)).toBe(300);
        for (let i = 1; i < runs.length - 1; i += 1) {
          expect(Math.min(...[60, 240].map((c) => Math.abs(runs[i][1] - c)))).toBeLessThanOrEqual(1);
          expect(Math.abs(runs[i][1] + runs[i + 1][1] - 300)).toBeLessThanOrEqual(2);
        }
      }
      // The lead unit shows both legs inside the window: 61 + 239 = one 300-frame cycle,
      // so its mark changes side exactly twice per 50-tick cycle.
      expect(sideRuns[0].length).toBeGreaterThanOrEqual(2);
      expect(Math.abs(sideRuns[0][0][1] + (sideRuns[0][1]?.[1] ?? 0) - 300)).toBeLessThanOrEqual(1);
      void gaps;
      for (const gap of gaps) {
        expect(Math.min(...[60, 240].map((c) => Math.abs(gap - c)))).toBeLessThanOrEqual(1);
      }
      for (const unitGaps of flipGaps) {
        for (let i = 1; i < unitGaps.length; i += 1) {
          expect(Math.abs(unitGaps[i - 1] + unitGaps[i] - 300)).toBeLessThanOrEqual(2);
        }
      }
      for (const [i, n] of flipCounts.entries()) {
        expect(n).toBeLessThanOrEqual(3);
        if (i === 0) expect(n).toBeGreaterThanOrEqual(1);
      }
    }
    console.log("F-1 measured", JSON.stringify(rows, null, 0));
    for (const value of Object.values(rows)) {
      const row = value as { maxAttachmentStepPx: number; offTravelSideFrames: number };
      expect(row.maxAttachmentStepPx).toBeLessThanOrEqual(0.5);
      expect(row.offTravelSideFrames).toBe(0);
    }
  });
});
