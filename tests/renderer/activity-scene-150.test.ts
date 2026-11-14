/**
 * RW3D T23 (#150): the activity layer as actually painted by drawScene.
 *
 * Recording-context checks (the house census pattern): a context WITH
 * setLineDash exercises the capability-guarded activity layer a real browser
 * paints; a context WITHOUT it is the shipped census world, which must keep the
 * legacy op ceiling and witnesses. Every scenario is a fixed seed/state with
 * expected/actual assertions - no clocks, no timers.
 */
import { describe, expect, it } from "vitest";
import {
  WORLD_H,
  WORLD_W,
  drawScene,
  tileToWorld,
  worldToScreen,
  type Camera,
  type DrawOptions,
  type ViewState,
} from "../../src/game/renderer/scene";
import { PALETTE, STATUS_ACCENTS } from "../../src/game/renderer/sprites";
import { createInitialState, type MachineState, type MachineStatus, type SimState } from "../../src/game/simulation/types";

const VIEW: ViewState = { width: 960, height: 600 };
/** Explicit zoom: fitCamera lands under 2, and the fine layer throttles at s < 2. */
const CAMERA: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3 };
const REST: DrawOptions = { reducedMotion: false, buildMode: false, ghostTile: null, ghostValid: true, selected: null };

interface Rec {
  op: string;
  style: string;
  args: number[];
  alpha: number;
}
const PAINT_OPS = new Set(["fill", "stroke", "fillRect", "strokeRect", "fillText"]);

/** The census recorder; `dash` adds the capability the activity layer guards on. */
function makeCtx(dash: boolean) {
  const log: Rec[] = [];
  let fillStyle = "";
  let strokeStyle = "";
  let alpha = 1;
  const ctx: Record<string, unknown> = {
    imageSmoothingEnabled: true,
    lineWidth: 1,
    font: "",
    textAlign: "",
    get fillStyle() { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; },
    get globalAlpha() { return alpha; },
    set globalAlpha(v: number) { alpha = v; },
    fillRect: (...a: number[]) => log.push({ op: "fillRect", style: fillStyle, args: a, alpha }),
    strokeRect: (...a: number[]) => log.push({ op: "strokeRect", style: strokeStyle, args: a, alpha }),
    fillText: (text: string, ...a: number[]) => log.push({ op: "fillText", style: fillStyle, args: a, alpha }),
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: (...a: number[]) => log.push({ op: "moveTo", style: "", args: a, alpha }),
    lineTo: (...a: number[]) => log.push({ op: "lineTo", style: "", args: a, alpha }),
    rect: (...a: number[]) => log.push({ op: "rect", style: fillStyle, args: a, alpha }),
    ellipse: (...a: number[]) => log.push({ op: "ellipse", style: fillStyle, args: a.slice(0, 4), alpha }),
    fill: () => log.push({ op: "fill", style: fillStyle, args: [], alpha }),
    stroke: () => log.push({ op: "stroke", style: strokeStyle, args: [], alpha }),
    setTransform: () => undefined,
  };
  if (dash) {
    ctx.setLineDash = () => undefined;
    ctx.lineDashOffset = 0;
  }
  return {
    log,
    paints: () => log.filter((r) => PAINT_OPS.has(r.op)).length,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  };
}

function machine(id: number, blueprint: string, tile: number, status: MachineStatus, progress = 300): MachineState {
  return {
    id, blueprint, tile, orientation: 0, level: 2,
    inBuf: {}, inBufUnits: 0, tray: [], trayUnits: 0, batch: [],
    progress, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 4,
    ageTicks: 300, busyTicks: 10, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  } as unknown as MachineState;
}

/** Four machines, one per issue state, on visible yard tiles (6x6 yard), same tick. */
function fourStates(tick = 344): SimState {
  const base = createInitialState();
  return {
    ...base,
    tick,
    tutorial: 9,
    machines: [
      machine(1, "sorter", 13, "running"),
      machine(2, "sorter", 15, "starved"),
      machine(3, "furnace", 17, "outputFull"),
      machine(4, "furnace", 19, "powerLimited"),
    ],
  } as unknown as SimState;
}

function screenOf(tile: number, camera: Camera = CAMERA) {
  const c = tileToWorld(tile);
  return worldToScreen(camera, VIEW, c.x, c.y);
}

/** Ops whose box sits inside a machine's own mark region. */
function near(log: Rec[], tile: number): Rec[] {
  const p = screenOf(tile);
  const s = CAMERA.scale;
  return log.filter((r) => {
    if (r.args.length < 2) return false;
    const [x, y] = r.args;
    return Math.abs(x - p.x) <= 16 * s && y >= p.y - 24 * s && y <= p.y + 16 * s;
  });
}

const rects = (log: Rec[], style: string) => log.filter((r) => r.op === "fillRect" && r.style === style);

/** The fan blade: the only 2x2-unit bodyLight fillRect riding the core ellipse. */
function fanMark(log: Rec[], tile: number): Rec | undefined {
  const p = screenOf(tile);
  return near(log, tile).find((r) => r.op === "fillRect" && r.style === PALETTE.bodyLight
    && r.args[2] === 6 && r.args[3] === 6 && Math.abs(r.args[1] - (p.y + 3)) <= 12);
}

/** The running core ellipse radius (6 at rest, 7.5 on the machine's own swell frame). */
function coreRadius(log: Rec[], tile: number): number | undefined {
  const p = screenOf(tile);
  const core = near(log, tile).find((r) => r.op === "ellipse" && r.style === PALETTE.amber
    && Math.abs(r.args[0] - p.x) <= 1 && Math.abs(r.args[1] - (p.y + 6)) <= 1);
  return core?.args[2];
}

describe("T23 distinct truthful states in the painted frame (V04/U07)", () => {
  it("working/starved/blocked/unpowered paint four distinct status readings", () => {
    const stub = makeCtx(true);
    drawScene(stub.ctx, fourStates(), CAMERA, VIEW, REST);
    const [working, starved, blocked, unpowered] = [13, 15, 17, 19].map((t) => near(stub.log, t));

    // Each state carries its own accent bar colour, all four distinct.
    const statuses = ["running", "starved", "outputFull", "powerLimited"] as const;
    const accents = [working, starved, blocked, unpowered].map((ops, i) => {
      expect(rects(ops, STATUS_ACCENTS[statuses[i]]).length).toBeGreaterThanOrEqual(1);
      return STATUS_ACCENTS[statuses[i]];
    });
    expect(new Set(accents).size).toBe(4);

    // Working: the amber core ellipse (the pinned witness) is present. The check is
    // core-specific: wreck/store gauge pips also group-fill amber elsewhere in the frame.
    expect(coreRadius(stub.log, 13)).toBeDefined();
    // Starved: the quiet bodyMid core, and NO amber core.
    expect(rects(starved, PALETTE.bodyMid).length).toBeGreaterThanOrEqual(1);
    expect(coreRadius(stub.log, 15)).toBeUndefined();
    // Blocked: the static held-cargo mark (3x2 units bodyMid at the tray side), no amber core.
    expect(blocked.some((r) => r.op === "fillRect" && r.style === PALETTE.bodyMid
      && r.args[2] === 9 && r.args[3] === 6)).toBe(true);
    expect(coreRadius(stub.log, 17)).toBeUndefined();
    // Unpowered: the shape tick under the bar (select colour), no amber core.
    const p4 = screenOf(19);
    expect(unpowered.some((r) => r.op === "fillRect" && r.style === PALETTE.select
      && Math.abs(r.args[0] - (p4.x - 27)) < 1 && Math.abs(r.args[1] - (p4.y + 39)) < 1)).toBe(true);
    expect(coreRadius(stub.log, 19)).toBeUndefined();
  });

  it("two working sorters each paint one fan mark riding their own core", () => {
    const state = fourStates();
    state.machines[1] = machine(2, "sorter", 15, "running");
    const stub = makeCtx(true);
    drawScene(stub.ctx, state, CAMERA, VIEW, REST);
    for (const tile of [13, 15]) {
      const p = screenOf(tile);
      const fans = near(stub.log, tile).filter((r) => r.op === "fillRect" && r.style === PALETTE.bodyLight
        && r.args[2] === 6 && r.args[3] === 6 && Math.abs(r.args[1] - (p.y + 3)) <= 12);
      expect(fans.length).toBe(1);
      expect(Math.abs(fans[0].args[0] - p.x)).toBeLessThanOrEqual(15);
    }
  });

  it("fan positions and core swells diverge across the 60 s sweep (no yard-wide lockstep)", () => {
    const state = fourStates();
    state.machines[1] = machine(2, "sorter", 15, "running");
    const fanPairs = new Set<string>();
    const radii13 = new Set<number>();
    const radii15 = new Set<number>();
    let mixedSwell = 0;
    for (let tick = 0; tick < 600; tick += 5) {
      const stub = makeCtx(true);
      drawScene(stub.ctx, { ...state, tick } as SimState, CAMERA, VIEW, REST);
      const f13 = fanMark(stub.log, 13);
      const f15 = fanMark(stub.log, 15);
      expect(f13).toBeDefined();
      expect(f15).toBeDefined();
      // Relative offsets: absolute positions differ by construction (different tiles).
      fanPairs.add(`${f13!.args[0] - screenOf(13).x},${f15!.args[0] - screenOf(15).x}`);
      const r13 = coreRadius(stub.log, 13);
      const r15 = coreRadius(stub.log, 15);
      expect(r13).toBeDefined();
      expect(r15).toBeDefined();
      radii13.add(r13!);
      radii15.add(r15!);
      if (r13 !== r15) mixedSwell += 1;
    }
    // Each fan walks its own cycle; the pair is never frozen on one combination.
    expect(fanPairs.size).toBeGreaterThanOrEqual(4);
    // Each core swells AND settles on its own schedule, and they disagree on some ticks.
    expect([...radii13].sort()).toEqual([6, 7.5]);
    expect([...radii15].sort()).toEqual([6, 7.5]);
    expect(mixedSwell).toBeGreaterThan(0);
  });
});

describe("T23 census parity: the recording world keeps the legacy frame", () => {
  /** The pinned dense yard (logistics-59): 8 machines on tiles 1-8, 18 scrap belts, 4 spares. */
  function denseYard(): SimState {
    const base = createInitialState();
    const blueprints = ["sorter", "furnace", "wireMill", "signalLab", "sorter", "furnace", "platePress", "circuitAssembler"];
    const statuses: MachineStatus[] = ["running", "starved", "outputFull", "idle", "powerLimited", "paused", "running", "outputFull"];
    const machines = blueprints.map((bp, i) => ({ ...machine(i + 1, bp, i + 1, statuses[i]), level: 2 + (i % 3) }));
    const routes = Array.from({ length: 18 }, (_, i) => ({
      id: i + 1,
      from: { kind: i % 2 ? "store" : "machine", id: 1 + (i % 8) },
      to: { kind: i % 3 ? "machine" : "store", id: 1 + ((i + 1) % 8) },
      filter: "scrap", capacity: 5, latency: 5,
      items: [{ resource: "scrap", qty: 1, arrive: 344 + (i % 4) }],
      inFlight: 1,
    }));
    return {
      ...base,
      tick: 344,
      tutorial: 9,
      machines,
      routes,
      spares: [
        { repaired: true, inFlight: { arrive: 350, units: 2 } },
        { repaired: true, inFlight: { arrive: 350, units: 2 } },
        { repaired: true, inFlight: { arrive: 350, units: 2 } },
        { repaired: true, inFlight: { arrive: 350, units: 2 } },
      ],
      storeUnits: 770,
      storeCapacity: 900,
    } as unknown as SimState;
  }

  it("the no-dash census stays inside the 240-op ceiling on the dense yard", () => {
    const stub = makeCtx(false);
    drawScene(stub.ctx, denseYard(), CAMERA, VIEW, REST);
    expect(stub.paints()).toBeLessThanOrEqual(240);
  });

  it("the census op count is invariant across the tick sweep (no activity ops leak in)", () => {
    const counts = new Set<number>();
    const yard = denseYard();
    for (let tick = 0; tick < 600; tick += 37) {
      const stub = makeCtx(false);
      drawScene(stub.ctx, { ...yard, tick } as SimState, CAMERA, VIEW, REST);
      counts.add(stub.paints());
      // No fan mark (bodyLight 2x2 near a core) anywhere in the census world.
      for (const m of yard.machines) {
        expect(fanMark(stub.log, m.tile)).toBeUndefined();
      }
    }
    expect(counts.size).toBe(1);
  });

  it("the amber working-core witness survives on both census and browser contexts", () => {
    for (const dash of [false, true]) {
      const stub = makeCtx(dash);
      drawScene(stub.ctx, fourStates(), CAMERA, VIEW, REST);
      const p = screenOf(13);
      const core = stub.log.filter((r) => r.op === "ellipse" && r.style === PALETTE.amber
        && Math.abs(r.args[0] - p.x) <= 1 && Math.abs(r.args[1] - (p.y + 6)) <= 1);
      expect(core.length).toBe(1);
    }
  });
});

describe("T23 reduced motion and distance: information retained (U07)", () => {
  it("reduced motion holds the fan static, suppresses puffs, keeps every status reading", () => {
    const positions: number[][] = [];
    for (let tick = 0; tick < 600; tick += 29) {
      const stub = makeCtx(true);
      drawScene(stub.ctx, { ...fourStates(), tick } as SimState, CAMERA, VIEW, { ...REST, reducedMotion: true });
      const fan = fanMark(stub.log, 13);
      expect(fan).toBeDefined();
      positions.push(fan!.args);
      // No vent puff group (the only 0.5-alpha fill in the frame).
      expect(stub.log.some((r) => r.op === "fill" && r.alpha === 0.5)).toBe(false);
      // All four accent colours still reach the canvas.
      for (const status of ["running", "starved", "outputFull", "powerLimited"] as const) {
        expect(stub.log.some((r) => r.op === "fillRect" && r.style === STATUS_ACCENTS[status])).toBe(true);
      }
      // The blocked held-cargo mark is static information: still painted.
      expect(stub.log.some((r) => r.op === "fillRect" && r.style === PALETTE.bodyMid && r.args[2] === 9 && r.args[3] === 6)).toBe(true);
      // The core never swells under reduced motion.
      expect(coreRadius(stub.log, 13)).toBe(6);
    }
    for (const pos of positions) expect(pos).toEqual(positions[0]);
  });

  it("a far zoom throttles the fine layer but keeps the status marks", () => {
    const far: Camera = { ...CAMERA, scale: 1.4 };
    const stub = makeCtx(true);
    drawScene(stub.ctx, fourStates(), far, VIEW, REST);
    const p = screenOf(13, far);
    const fan = stub.log.some((r) => r.op === "fillRect" && r.style === PALETTE.bodyLight
      && r.args[2] === 2.8 && r.args[3] === 2.8 && Math.abs(r.args[1] - (p.y + 1.4)) <= 5);
    expect(fan).toBe(false);
    for (const status of ["running", "starved", "outputFull", "powerLimited"] as const) {
      expect(stub.log.some((r) => r.op === "fillRect" && r.style === STATUS_ACCENTS[status])).toBe(true);
    }
  });
});