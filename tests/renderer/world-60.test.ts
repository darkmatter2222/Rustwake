import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORLD_W,
  drawScene,
  fitCamera,
  type DrawOptions,
  type ViewState,
} from "../../src/game/renderer/scene";
import {
  APRON_SHADOWS,
  APRON_TOPS,
  PALETTE,
  PARTS,
  type PartTuple,
} from "../../src/game/renderer/sprites";
import {
  REDUCED_MOTION_QUERY,
  effectiveReducedMotion,
  osPrefersReducedMotion,
} from "../../src/game/renderer/motion";
import { createInitialState, type MachineStatus, type SimState } from "../../src/game/simulation/types";

/**
 * UI-RESET-60 draw-bound witnesses. These pin the *new* art internals only - the live OS
 * reduced-motion source, the every-solid-part facet, and the census-neutral apron facet -
 * without re-stating the frozen contracts in scene-draw/silhouette (which stay read-only).
 * The context is a plain recording object, so jsdom needs no canvas package.
 */
interface Rec {
  op: string;
  style: string | number;
  args: number[];
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
    stroke: () => log.push({ op: "stroke", style: strokeStyle, args: [segCount] }),
    setTransform: () => undefined,
  };
  return {
    log,
    paints: () => log.filter((r) => PAINT_OPS.has(r.op)).length,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  };
}

const VIEW: ViewState = { width: 390, height: 844 };
const SCALE = 390 / (WORLD_W + 8); // 1.95, the phone scale
const rest: DrawOptions = { reducedMotion: false, buildMode: false, ghostTile: null, ghostValid: true, selected: null };

function machine(id: number, blueprint: string, tile: number, status: string, level: number, trayUnits: number) {
  return {
    id, blueprint, tile, orientation: 0, level,
    inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
    progress: 120, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 3,
    ageTicks: 300, busyTicks: 200, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  };
}

function fs1(): SimState {
  const base = createInitialState();
  return {
    ...base,
    tick: 344,
    tutorial: 9,
    machines: [machine(1, "sorter", 8, "running", 1, 0), machine(2, "furnace", 14, "outputFull", 1, 1)],
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
  const blueprints = ["sorter", "furnace", "wireMill", "signalLab", "sorter", "furnace", "platePress", "circuitAssembler"];
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

function draw(state: SimState, options: DrawOptions) {
  const stub = makeCtx();
  drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, options);
  return stub;
}

/** The solid parts of a glyph row that carry a facet (matches scene.ts drawMachine). */
function solidParts(row: readonly PartTuple[]): PartTuple[] {
  return row.filter((p) => p[5] !== 1 && p[4] !== 15 && p[2] >= 4 && p[3] >= 4);
}
/** Lit bands one solid part contributes: top edge always, left column only on >= 6 x 6. */
function bandsPerPart(p: PartTuple): number {
  return 1 + (p[2] >= 6 && p[3] >= 6 ? 1 : 0);
}

// --- live OS reduced-motion source -------------------------------------------------------
describe("UI-RESET-60 motion: live OS preference OR'd with the caller option", () => {
  const realMatchMedia = (window as { matchMedia?: unknown }).matchMedia;
  afterEach(() => {
    if (realMatchMedia === undefined) delete (window as { matchMedia?: unknown }).matchMedia;
    else (window as { matchMedia?: unknown }).matchMedia = realMatchMedia;
    vi.restoreAllMocks();
  });

  function setOS(reduce: boolean | "absent") {
    if (reduce === "absent") {
      delete (window as { matchMedia?: unknown }).matchMedia;
      return;
    }
    (window as { matchMedia?: unknown }).matchMedia = (query: string) => ({
      matches: query === REDUCED_MOTION_QUERY ? reduce : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    });
  }

  it("reads false when matchMedia is absent (jsdom default), so the option is the whole answer", () => {
    setOS("absent");
    expect(osPrefersReducedMotion()).toBe(false);
    expect(effectiveReducedMotion(false)).toBe(false);
    expect(effectiveReducedMotion(true)).toBe(true);
  });

  it("ORs the live OS reduce preference over a false option", () => {
    setOS(true);
    expect(osPrefersReducedMotion()).toBe(true);
    expect(effectiveReducedMotion(false)).toBe(true);
    setOS(false);
    expect(osPrefersReducedMotion()).toBe(false);
    expect(effectiveReducedMotion(false)).toBe(false);
    expect(effectiveReducedMotion(true)).toBe(true);
  });

  it("only queries the reduced-motion media feature", () => {
    const spy = vi.fn((query: string) => ({ matches: false, media: query }));
    (window as { matchMedia?: unknown }).matchMedia = spy;
    osPrefersReducedMotion();
    expect(spy).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });
});

describe("UI-RESET-60 drawScene: OS reduce freezes the frame without a signature change", () => {
  const realMatchMedia = (window as { matchMedia?: unknown }).matchMedia;
  beforeEach(() => {
    (window as { matchMedia?: unknown }).matchMedia = (query: string) => ({
      matches: query === REDUCED_MOTION_QUERY,
      media: query,
    });
  });
  afterEach(() => {
    if (realMatchMedia === undefined) delete (window as { matchMedia?: unknown }).matchMedia;
    else (window as { matchMedia?: unknown }).matchMedia = realMatchMedia;
  });

  it("option=false + OS reduce is element-wise identical to option=true across the cycle", () => {
    const phases = [0, 0.2, 0.4, 0.6, 0.8];
    const osReduced = phases.map((framePhase) => JSON.stringify(draw(mature(), { ...rest, framePhase }).log));
    const optReduced = phases.map((framePhase) => JSON.stringify(draw(mature(), { ...rest, reducedMotion: true, framePhase }).log));
    // The live OS read routes option=false onto exactly the caller-option reduced render.
    // (Route cargo tokens stay phase-driven by design - drawRoutes has no reduced-motion
    // param - so this asserts equivalence to the reduced path, not a whole-frame freeze.)
    expect(osReduced).toEqual(optReduced);
  });

  it("OS reduce holds the machine working-core accent static across the cycle", () => {
    // The working core is an amber ELLIPSE whose radii swell on frames 3-4; route cargo
    // tokens are amber fillRect and stay phase-driven, so isolate the ellipses only.
    const core = (framePhase: number, reduce: boolean) => {
      const stub = draw(mature(), { ...rest, reducedMotion: reduce, framePhase });
      return JSON.stringify(stub.log.filter((r) => r.style === PALETTE.amber && r.op === "ellipse"));
    };
    // OS reduce is on (beforeEach), so option=false is forced onto the reduced path:
    // the core holds still across phases and matches the caller-option reduced core.
    expect(core(0, false)).toBe(core(0.5, false));
    expect(core(0.4, false)).toBe(core(0, false));
    expect(core(0, false)).toBe(core(0, true));
  });
});

describe("UI-RESET-60 drawScene: option=false with no OS preference still animates", () => {
  const realMatchMedia = (window as { matchMedia?: unknown }).matchMedia;
  beforeEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });
  afterEach(() => {
    if (realMatchMedia !== undefined) (window as { matchMedia?: unknown }).matchMedia = realMatchMedia;
  });

  it("the working cycle moves when neither the option nor the OS asks for reduce", () => {
    const a = JSON.stringify(draw(mature(), { ...rest, framePhase: 0 }).log);
    const b = JSON.stringify(draw(mature(), { ...rest, framePhase: 0.5 }).log);
    expect(a).not.toBe(b);
  });
});

// --- every-solid-part facet --------------------------------------------------------------
describe("UI-RESET-60 facet: one upper-left light on every solid block, still two grouped paints", () => {
  it("the sheen/shade band counts equal the sum over every solid part of every machine", () => {
    const state = mature();
    const stub = draw(state, rest);
    let expected = 0;
    for (const m of state.machines) {
      const row = PARTS[m.blueprint] ?? PARTS.generic;
      for (const p of solidParts(row)) expected += bandsPerPart(p);
    }
    // The facet sheen is the only `select`-coloured rect group; the facet shade is the
    // `path`-coloured rect group emitted between the sheen fill and the shade fill (other
    // scene groups also paint with `path`, so isolate the facet group by its neighbours).
    const sheen = stub.log.filter((r) => r.op === "rect" && r.style === PALETTE.select);
    const iSel = stub.log.findIndex((r) => r.op === "fill" && r.style === PALETTE.select);
    const iPath = stub.log.findIndex((r, i) => i > iSel && r.op === "fill" && r.style === PALETTE.path);
    const shade = stub.log.slice(iSel + 1, iPath).filter((r) => r.op === "rect" && r.style === PALETTE.path);
    expect(sheen.length).toBe(expected);
    expect(shade.length).toBe(expected); // symmetric lit/dark
    expect(expected).toBeGreaterThan(state.machines.length); // more than one body per glyph
  });

  it("the whole machine row costs one grouped sheen fill immediately followed by one shade fill", () => {
    const stub = draw(mature(), rest);
    const selFills = stub.log.filter((r) => r.op === "fill" && r.style === PALETTE.select);
    expect(selFills.length).toBe(1); // sheen is a single grouped paint
    const iSel = stub.log.indexOf(selFills[0]);
    const nextPaint = stub.log.slice(iSel + 1).find((r) => PAINT_OPS.has(r.op));
    expect(nextPaint).toMatchObject({ op: "fill", style: PALETTE.path }); // shade is the next single paint
  });

  it("every facet band keeps the >= 3.5 px minimum feature size at phone scale", () => {
    const stub = draw(mature(), rest);
    const iSel = stub.log.findIndex((r) => r.op === "fill" && r.style === PALETTE.select);
    const iPath = stub.log.findIndex((r, i) => i > iSel && r.op === "fill" && r.style === PALETTE.path);
    const bands = stub.log.filter((r, i) => r.op === "rect" && (r.style === PALETTE.select || (r.style === PALETTE.path && i > iSel && i < iPath)));
    expect(bands.length).toBeGreaterThan(0);
    for (const b of bands) {
      expect(Math.min(b.args[2], b.args[3])).toBeGreaterThanOrEqual(3.5);
    }
  });

  it("a single solid-part glyph still facets (no regression to the old single-body bevel)", () => {
    const one = { ...fs1(), machines: [machine(1, "sorter", 8, "running", 1, 0)], routes: [] } as unknown as SimState;
    const stub = draw(one, rest);
    const row = PARTS.sorter;
    const expected = solidParts(row).reduce((n, p) => n + bandsPerPart(p), 0);
    expect(stub.log.filter((r) => r.op === "rect" && r.style === PALETTE.select).length).toBe(expected);
  });
});

// --- census-neutral apron facet ----------------------------------------------------------
describe("UI-RESET-60 apron: foreground crates share the machine light without touching the census", () => {
  it("every apron top/shadow tuple sits below the yard (y >= 192), outside all cell boxes", () => {
    for (const t of [...APRON_TOPS, ...APRON_SHADOWS]) expect(t[1]).toBeGreaterThanOrEqual(192);
  });

  it("the apron tables reuse a single existing colour index each (no new paint group)", () => {
    expect(new Set(APRON_TOPS.map((t) => t[4]))).toEqual(new Set([3]));
    expect(new Set(APRON_SHADOWS.map((t) => t[4]))).toEqual(new Set([15]));
  });

  it("the crate facet columns are >= 2 world units (3.9 px), the same direction as the machines", () => {
    // lit left columns (ci 3) and shade right columns (ci 15) added for the four crates.
    const litCols = APRON_TOPS.filter((t) => t[2] === 2 && t[1] >= 200 && t[1] < 236);
    const shadeCols = APRON_SHADOWS.filter((t) => t[2] === 2 && t[1] >= 200);
    expect(litCols.length).toBe(4);
    expect(shadeCols.length).toBe(4);
    for (const t of [...litCols, ...shadeCols]) {
      expect(Math.min(t[2], t[3])).toBeGreaterThanOrEqual(2);
      expect(Math.min(t[2], t[3]) * SCALE).toBeGreaterThanOrEqual(3.5);
    }
    // a lit column is left of its shade column on the same crate (upper-left light).
    // crates 1 and 3 share y/h, so pair by the crate width gap, not y/h alone.
    for (const lit of litCols) {
      const shade = shadeCols.find((s) => s[1] === lit[1] && s[3] === lit[3] && s[0] > lit[0] && s[0] - lit[0] <= 12);
      expect(shade).toBeDefined();
      expect(lit[0]).toBeLessThan(shade![0]);
    }
  });
});

// --- budget + layer order preserved ------------------------------------------------------
describe("UI-RESET-60 preserves the frozen paint budget and layer order", () => {
  it("rest/build/mature paint ceilings hold with the new facet loop", () => {
    expect(draw(fs1(), rest).paints()).toBeLessThanOrEqual(84);
    expect(draw(fs1(), { ...rest, buildMode: true, ghostTile: 20 }).paints()).toBeLessThanOrEqual(96);
    const matureP = draw(mature(), rest).paints();
    expect(matureP).toBeLessThanOrEqual(240);
    expect(matureP).toBeLessThanOrEqual(40 + 8 * 14 + 18 * 3 + 5 * 5 + 4); // D3
  });

  it("the first three paints stay the pinned sky/backdrop/floor block", () => {
    const stub = draw(fs1(), rest);
    expect(stub.log[0]).toMatchObject({ op: "fillRect", style: PALETTE.night, args: [0, 0, VIEW.width, VIEW.height] });
    const firstPaints = stub.log.filter((r) => PAINT_OPS.has(r.op)).slice(0, 3);
    expect(firstPaints[0].style).toBe(PALETTE.night);
    expect(firstPaints[1].style).toBe(PALETTE.nightDeep);
    expect(firstPaints[2].style).toBe(PALETTE.floor);
  });

  it("two consecutive calls on the frozen state are element-wise identical (D4)", () => {
    expect(JSON.stringify(draw(fs1(), rest).log)).toBe(JSON.stringify(draw(fs1(), rest).log));
  });
});
