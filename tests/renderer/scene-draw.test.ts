import { describe, expect, it } from "vitest";
import {
  drawScene,
  fitCamera,
  worldToScreen,
  type DrawOptions,
  type ViewState,
} from "../../src/game/renderer/scene";
import {
  FEATURE_MIN_UNITS,
  GRID_STYLE,
  LEAN_UNITS,
  PARTS,
  SELECT_STYLE,
  STATUS_ACCENTS,
  AMBER_SHAPES,
  type PartTuple,
} from "../../src/game/renderer/sprites";
import { createInitialState, type MachineStatus, type SimState } from "../../src/game/simulation/types";
import { DOCK_TILE } from "../../src/game/simulation/commands";

/**
 * Deterministic draw-bound tests (spec 3D): the context is a plain recording
 * object, so jsdom needs no canvas package. One tuple per call:
 * {op, style, args}; paints are the ops that put pixels down.
 */
interface Rec {
  op: string;
  style: string | number;
  args: number[];
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
    fillText: (_t: string, ...a: number[]) => log.push({ op: "fillText", style: fillStyle, args: a }),
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
  };
  return {
    log,
    paints: () => log.filter((r) => PAINT_OPS.has(r.op)).length,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  };
}

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
