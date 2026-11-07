import { describe, expect, it } from "vitest";
import {
  fitCamera,
  tileToWorld,
  worldToScreen,
  drawScene,
  type ViewState,
} from "../../src/game/renderer/scene";
import { beltExtentLine } from "../../src/ui/text";
import { TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  DOCK_TILE,
  YARD_COLS,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { createInitialState, manhattanRun, type SimState } from "../../src/game/simulation/types";
import { PALETTE } from "../../src/game/renderer/sprites";

/**
 * BELT-001 g4: the connection is drawn as the tile path its price was computed from.
 *
 * Four facts, all read off the recording context (spec 3D - jsdom needs no canvas package):
 * the number of `lineTo` steps in the route stroke equals `run.length - 1`; a link with no
 * `run` still draws the one chord it always drew; the cargo token still lands on the
 * destination tile on its own `arrive` tick, now walked by cumulative path length instead
 * of a single chord parameter; and the extent line reaches the canvas only for the machine
 * the player has open.
 */

interface Rec {
  op: string;
  style: string | number;
  args: number[];
  text?: string;
}

const ROUTE_STYLE = "rgba(95,216,232,0.5)";

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
    fillText: (text: string, ...a: number[]) =>
      log.push({ op: "fillText", style: fillStyle, args: a, text }),
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
    // The stroke carries this path's segment count, which is the witness: the same
    // convention `tests/renderer/scene-draw.test.ts` uses.
    stroke: () => log.push({ op: "stroke", style: strokeStyle, args: [segCount] }),
    setTransform: () => undefined,
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

const VIEW: ViewState = { width: 390, height: 844 };
const rest = {
  reducedMotion: false,
  buildMode: false,
  ghostTile: null,
  ghostValid: true,
  selected: null,
} as const;

let seq = 500;
function send(state: SimState, command: CommandBody): unknown {
  return applyCommand(state, { ...command, id: `p${(seq += 1)}` } as Command);
}

/** One sorter on `tile`, one priced store link, one item in transit that lands on `arrive`. */
function yard(tile: number, arrive: number): SimState {
  const state = createInitialState();
  state.store["scrap"] = 300;
  send(state, { type: "machine.build", blueprint: "sorter", tile });
  const machine = state.machines[state.machines.length - 1];
  send(state, { type: "route.connect", from: 0, to: machine.id, filter: "scrap" });
  const route = state.routes[state.routes.length - 1];
  route.items = [{ resource: "scrap", qty: 1, arrive }];
  route.inFlight = 1;
  state.tick = arrive; // the arrival frame, where the leg parameter is exactly 1
  return state;
}

const routeStrokes = (log: Rec[]) =>
  log.filter((r) => r.op === "stroke" && r.style === ROUTE_STYLE);

describe("BELT-001 g4: the drawn extent is the priced extent", () => {
  it("draws one segment per tile step: 2 for a 3-tile run, 6 for a 7-tile run", () => {
    // Dock tile 2 is row 0 col 2, so tile 4 is Manhattan distance 2 and tile 31 distance 6.
    const rows = [
      { tile: 4, distance: 2, price: 3 },
      { tile: 31, distance: 6, price: 7 },
    ];
    for (const row of rows) {
      const state = yard(row.tile, 40);
      const route = state.routes[state.routes.length - 1];
      const run = route.run ?? [];
      expect(run).toEqual(manhattanRun(DOCK_TILE, row.tile, YARD_COLS));
      expect(run.length).toBe(row.distance + 1);
      expect(beltCost(run.length)).toBe(row.price);
      const stub = makeCtx();
      drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, rest);
      const strokes = routeStrokes(stub.log);
      expect(strokes).toHaveLength(1);
      expect(strokes[0].args[0]).toBe(run.length - 1);
    }
  });

  it("keeps the single chord for a `run`-less (pre-price) route", () => {
    const state = yard(31, 40);
    const route = state.routes[state.routes.length - 1];
    delete route.run;
    expect(route.run).toBeUndefined();
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, rest);
    const strokes = routeStrokes(stub.log);
    expect(strokes).toHaveLength(1);
    expect(strokes[0].args[0]).toBe(1); // the old one-segment chord, unchanged
  });

  it("lands the cargo token on the destination tile at its arrival tick, by path length", () => {
    const state = yard(31, 40);
    const machine = state.machines[state.machines.length - 1];
    const route = state.routes[state.routes.length - 1];
    expect(route.latency).toBe(TUNING.routeLatencyTicks);
    const camera = fitCamera(VIEW);
    const stub = makeCtx();
    drawScene(stub.ctx, state, camera, VIEW, { ...rest, framePhase: 0 });
    // The token is the amber square whose side is the camera-scaled 3-unit box.
    const size = Math.round(3 * camera.scale * 2) / 2; // `snap` inside `rectOf`
    const token = stub.log
      .filter((r) => r.op === "fillRect" && r.style === PALETTE.amber && r.args[2] === size)
      .pop();
    expect(token).toBeDefined();
    const at = tileToWorld(machine.tile);
    const target = worldToScreen(camera, VIEW, at.x, at.y);
    expect(token!.args[0] + size / 2).toBeCloseTo(target.x, 0);
    expect(token!.args[1] + size / 2).toBeCloseTo(target.y, 0);
  });

  it("prints the extent line beside the line itself, only for the selected machine", () => {
    const state = yard(31, 40);
    const machine = state.machines[state.machines.length - 1];
    const route = state.routes[state.routes.length - 1];
    expect(beltExtentLine(route)).toBe("7 tiles · 7 scrap");
    const camera = fitCamera(VIEW);
    const opened = makeCtx();
    drawScene(opened.ctx, state, camera, VIEW, { ...rest, selected: machine.id });
    expect(opened.log.some((r) => r.op === "fillText" && r.text === "7 tiles · 7 scrap")).toBe(
      true
    );
    // At rest nothing is selected, so the world keeps its silhouette without text.
    const bare = makeCtx();
    drawScene(bare.ctx, state, camera, VIEW, rest);
    expect(bare.log.some((r) => r.op === "fillText" && r.text === "7 tiles · 7 scrap")).toBe(false);
  });
});
