import { describe, expect, it, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import inspectorRaw from "../../src/ui/inspector/inspector.css?raw";
import logisticsRaw from "../../src/ui/logistics/logistics.css?raw";
import { MachinePanel } from "../../src/ui/Panels";
import { COPY } from "../../src/ui/inspector/copy";
import {
  getLogisticsView,
  resetLogisticsView,
  setFocusedRoute,
  setRoutesVisible,
  toggleRoutesVisible,
} from "../../src/ui/logistics/view";
import {
  deriveLogistics,
  previewConnect,
  previewRemove,
  routeStatus,
  throughputLine,
} from "../../src/ui/logistics/model";
import {
  MATERIAL_COLORS,
  ROUTE_STATUS_COLORS,
  materialColor,
  routeMaterials,
} from "../../src/ui/logistics/material";
import { LOGISTICS_COPY, connectRejectText } from "../../src/ui/logistics/copy";
import {
  applyCommand,
  beltCost,
  refundOf,
  DOCK_TILE,
  YARD_COLS,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  createInitialState,
  manhattanRun,
  outputRouteIds,
  type MachineState,
  type RouteState,
  type SimState,
} from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { requestedPower } from "../../src/game/simulation/diagnostics";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import { formatNumber, resourceWord, unit, wholePercent } from "../../src/game/content/strings";
import { beltExtentLine } from "../../src/ui/text";
import {
  drawScene,
  fitCamera,
  type DrawOptions,
  type ViewState,
} from "../../src/game/renderer/scene";
import { PALETTE } from "../../src/game/renderer/sprites";
import { encodeSave, decodeSave } from "../../src/game/persistence/save";

/**
 * UI-RESET-59 (G3): make material routes, power and bottlenecks visually inspectable.
 *
 * Acceptance covered here (issue #59):
 *  - route direction, material and working/idle/blocked distinction with a clear legend;
 *  - selecting a machine reveals its related paths and de-emphasizes the rest, with a
 *    visibility toggle that avoids permanent clutter;
 *  - connect/disconnect/filter exposed with cost/validity preview and cancel, unsupported
 *    capabilities mapped honestly (no fake controls);
 *  - a production/power overview derived from state and a route from each bottleneck to
 *    the affected machine;
 *  - dense routes, zero power, missing input, output full and saved-route/refund behavior.
 *
 * Method: DOM + recording-context (canvas) assertions only — no vision. Every ACTION under
 * test goes through the real UI path (click/change -> props.dispatch -> applyCommand). The
 * only state mutations are fixture SETUP, documented inline; none weakens validation. The
 * logistics view bridge is a module global, so every case resets it in beforeEach.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 5900;
function send(state: SimState, command: CommandBody): unknown {
  return applyCommand(state, { ...command, id: `i59-${(seq += 1)}` } as Command);
}

// ---- recording context (mirrors tests/renderer/belt-extent + scene-draw) ----
interface Rec {
  op: string;
  style: string | number;
  args: number[];
  text?: string;
}
const PAINT_OPS = new Set(["fill", "stroke", "fillRect", "strokeRect", "fillText"]);

/**
 * `dash` adds setLineDash/lineDashOffset so the capability-guarded animation path can be
 * exercised. The default (no dash) is exactly the shipped census context, where the guard
 * `typeof ctx.setLineDash === "function"` is false and the rest frame adds zero paint ops.
 */
function makeCtx(dash = false) {
  const log: Rec[] = [];
  const dashCalls: number[][] = [];
  const dashOffsets: number[] = [];
  let fillStyle: string | number = "";
  let strokeStyle: string | number = "";
  let segCount = 0;
  let lineDashOffset = 0;
  const ctx: Record<string, unknown> = {
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
    fillText: (text: string, ...a: number[]) => log.push({ op: "fillText", style: fillStyle, args: a, text }),
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
  if (dash) {
    ctx.setLineDash = (pattern: number[]) => dashCalls.push([...pattern]);
    Object.defineProperty(ctx, "lineDashOffset", {
      get: () => lineDashOffset,
      set: (v: number) => {
        lineDashOffset = v;
        dashOffsets.push(v);
      },
    });
  }
  return {
    log,
    dashCalls,
    dashOffsets,
    paints: () => log.filter((r) => PAINT_OPS.has(r.op)).length,
    ctx: ctx as unknown as CanvasRenderingContext2D,
  };
}

const VIEW: ViewState = { width: 390, height: 844 };
const rest: DrawOptions = { reducedMotion: false, buildMode: false, ghostTile: null, ghostValid: true, selected: null };
const WORKING = ROUTE_STATUS_COLORS.working;
const routeStrokes = (log: Rec[], style: string) => log.filter((r) => r.op === "stroke" && r.style === style);
// jsdom serializes rgba() with spaces ("rgba(95, 216, 232, 0.5)"); the canvas source string
// has none. Compare channels exactly, ignoring serialization whitespace only.
const normColor = (c: string | undefined) => (c ?? "").replace(/\s+/g, "");
const amberTokens = (log: Rec[]) => log.filter((r) => r.op === "fillRect" && r.style === PALETTE.amber).length;

// ---- fixtures (SETUP only; every action under test uses the real command path) ----

/** Six pulses fund the drone repair; the repaired drone funds the sorter; both links laid. */
function yardWithASorter(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = state.machines[state.machines.length - 1];
  send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advance(state, 120);
  state.tutorial = 9;
  state.exportClaimed = true;
  return state;
}

/** One isolated sorter: no links, empty buffer — the starved/missing-input case. */
function yardWithAnIsolatedSorter(): SimState {
  const state = yardWithASorter();
  const sorter = state.machines[0];
  state.routes = [];
  sorter.inRoutes = [];
  sorter.outRoute = null;
  sorter.inBuf = {};
  sorter.inBufUnits = 0;
  sorter.trayUnits = 0;
  sorter.status = "starved";
  return state;
}

function machine(id: number, blueprint: string, tile: number, status: string): MachineState {
  return {
    id, blueprint, tile, orientation: 0, level: 1,
    inBuf: {}, inBufUnits: 0, tray: [], trayUnits: 0, batch: [],
    progress: 0, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 0,
    ageTicks: 300, busyTicks: 10, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  } as unknown as MachineState;
}

function route(id: number, from: number, to: number, filter: RouteState["filter"], items = 1): RouteState {
  const fromTile = from === 0 ? DOCK_TILE : from;
  const toTile = to === 0 ? DOCK_TILE : to;
  return {
    id,
    from: from === 0 ? { kind: "store", id: 0 } : { kind: "machine", id: from },
    to: to === 0 ? { kind: "store", id: 0 } : { kind: "machine", id: to },
    filter,
    capacity: 5,
    latency: 5,
    run: manhattanRun(fromTile, toTile, YARD_COLS),
    items: items > 0 ? [{ resource: filter ?? "scrap", qty: items, arrive: 40 }] : [],
    inFlight: items,
    busyTicks: 10,
    ageTicks: 300,
  } as unknown as RouteState;
}

/**
 * Two running machines, three working belts: store->sorter(scrap), sorter->store(ferrous)
 * and an unrelated store->furnace(ferrous). Selecting the sorter must reveal the first two
 * and de-emphasize the third. Manual construction is fixture SETUP (deterministic status).
 * Ferrous (#9fb4c7) is the arrowhead witness: running machines paint amber (#ffb765) cores
 * at rest, so scrap-amber is NOT unique to a route arrowhead, but ferrous never appears
 * outside drawRoutes. The unrelated belt is ferrous so the focus case has a clean witness.
 */
function linkedYard(): SimState {
  const base = createInitialState();
  return {
    ...base,
    tick: 40,
    tutorial: 9,
    machines: [machine(1, "sorter", 8, "running"), machine(2, "furnace", 14, "running")],
    routes: [route(1, 0, 1, "scrap"), route(2, 1, 0, "ferrous"), route(3, 0, 2, "ferrous")],
    storeUnits: 100,
    storeCapacity: 900,
  } as unknown as SimState;
}

/** A furnace whose output tray is full: its inbound belts are blocked, it is a bottleneck. */
function outputFullYard(): SimState {
  const base = createInitialState();
  const full = machine(2, "furnace", 14, "outputFull");
  full.trayUnits = BLUEPRINTS.furnace.outputBuffer;
  return {
    ...base,
    tick: 40,
    tutorial: 9,
    machines: [machine(1, "sorter", 8, "running"), full],
    routes: [
      route(1, 0, 2, "scrap"), // blocked: destination outputFull
      route(2, 1, 2, "ferrous"), // blocked: destination outputFull
      route(3, 0, 1, "scrap"), // working
      route(4, 2, 0, "residue"), // the full machine's own output belt (reveal target)
    ],
    storeUnits: 100,
    storeCapacity: 900,
  } as unknown as SimState;
}

/** Zero power: every machine power-limited at ratio 0 (SETUP forces the measured state). */
function zeroPowerYard(): SimState {
  const state = linkedYard();
  state.powerRatio = 0;
  for (const m of state.machines) m.status = "powerLimited";
  return state;
}

/** The dense mature seed: 8 machines, 18 scrap belts (mirrors scene-draw's mature()). */
function denseYard(): SimState {
  const base = createInitialState();
  // Real blueprint keys only: deriveLogistics reads BLUEPRINTS[bp].recipeId, and "generic"
  // is a draw-only placeholder with no recipe. All eight below exist in defs.
  const blueprints = ["sorter", "furnace", "wireMill", "signalLab", "sorter", "furnace", "platePress", "circuitAssembler"];
  const statuses = ["running", "starved", "outputFull", "idle", "powerLimited", "paused", "running", "outputFull"];
  const machines = blueprints.map((bp, i) => ({
    ...machine(i + 1, bp, i + 1, statuses[i]),
    level: 2 + (i % 3),
  }));
  const routes = Array.from({ length: 18 }, (_, i) => ({
    id: i + 1,
    from: { kind: i % 2 ? "store" : "machine", id: 1 + (i % 8) },
    to: { kind: i % 3 ? "machine" : "store", id: 1 + ((i + 1) % 8) },
    filter: "scrap",
    capacity: 5,
    latency: 5,
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

// ---- DOM helpers (mirror inspector-54) ----
function render(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

function mountPanel(
  state: SimState,
  machine: MachineState,
  opts: { powerRatio?: number; dispatch?: (command: Command) => unknown } = {},
): HTMLElement {
  return render(
    <MachinePanel
      state={state}
      machine={machine}
      tick={state.tick}
      powerRatio={opts.powerRatio ?? state.powerRatio}
      dispatch={opts.dispatch ?? ((command) => applyCommand(state, command))}
      onClose={() => undefined}
    />,
  );
}

function injectSheets() {
  for (const raw of [stylesRaw, inspectorRaw, logisticsRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
}

const sections = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>(".inspector-section")];
function sectionByTitle(host: HTMLElement, title: string): HTMLElement {
  const found = sections(host).find((s) => s.querySelector(".inspector-section__title")?.textContent === title);
  if (!found) throw new Error(`missing inspector section: ${title}`);
  return found;
}
function rowValue(scope: HTMLElement, label: string): string {
  const row = [...scope.querySelectorAll<HTMLElement>(".panel__row")].find((r) => r.querySelector("dt")?.textContent === label);
  if (!row) throw new Error(`missing row: ${label}`);
  return row.querySelector("dd")?.textContent ?? "";
}
const actionFaces = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>(".panel__actions > .icon-btn")];
const contextButtons = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>(".inspector-context__btn")];

function click(el: Element) {
  act(() => {
    (el as HTMLButtonElement).click();
  });
}
function changeSelect(el: HTMLSelectElement, value: string) {
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function buttonByText(scope: HTMLElement, selector: string, text: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`missing button ${selector} text=${JSON.stringify(text)}`);
  return found;
}

const KEY_PATTERN =
  /\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/;

beforeEach(() => {
  document.body.innerHTML = "";
  injectSheets();
  resetLogisticsView();
});

// ============================ legend + visibility ============================
describe("UI-RESET-59 legend and belt-layer visibility", () => {
  it("paints a working/idle/blocked legend with the exact canvas rail colours and a direction note", () => {
    const state = linkedYard();
    const host = mountPanel(state, state.machines[0]);
    const transport = sectionByTitle(host, COPY.sections.transport);
    const legend = transport.querySelector<HTMLElement>(".logistics-legend");
    expect(legend).not.toBeNull();
    expect(legend!.querySelector(".logistics-subtitle")?.textContent).toBe(LOGISTICS_COPY.legend.title);
    expect(legend!.querySelector(".logistics-note")?.textContent).toBe(LOGISTICS_COPY.legend.direction);
    const statuses = [...legend!.querySelectorAll<HTMLElement>(".logistics-legend__status")];
    expect(statuses.map((s) => s.querySelector(".logistics-legend__label")?.textContent)).toEqual(["Working", "Idle", "Blocked"]);
    // Each swatch carries the exact rail colour the canvas strokes with.
    const swatchColors = statuses.map((s) => normColor(s.querySelector<HTMLElement>(".logistics-swatch--rail")?.style.background));
    expect(swatchColors).toEqual([WORKING, ROUTE_STATUS_COLORS.idle, ROUTE_STATUS_COLORS.blocked].map(normColor));
    // Material swatches list only what the yard's belts carry (scrap + ferrous here).
    const materials = routeMaterials(state);
    const painted = [...legend!.querySelectorAll<HTMLElement>(".logistics-legend__material")].map((m) => m.textContent);
    expect(painted).toEqual(materials.map((m) => m.label));
    expect(materials.map((m) => m.color)).toEqual([MATERIAL_COLORS.scrap, MATERIAL_COLORS.ferrous]);
  });

  it("toggles the shared view bridge and the canvas skips the route layer while hidden", () => {
    const state = linkedYard();
    const host = mountPanel(state, state.machines[0]);
    const toggle = buttonByText(host, ".logistics-toggle", LOGISTICS_COPY.legend.visibilityOn);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(getLogisticsView().routesVisible).toBe(true);

    // Visible: every working belt strokes the pinned rail.
    const visible = makeCtx();
    drawScene(visible.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(routeStrokes(visible.log, WORKING).length).toBe(3);

    click(toggle);
    expect(getLogisticsView().routesVisible).toBe(false);
    const hiddenToggle = buttonByText(host, ".logistics-toggle", LOGISTICS_COPY.legend.visibilityOff);
    expect(hiddenToggle.getAttribute("aria-pressed")).toBe("false");
    const hidden = makeCtx();
    drawScene(hidden.ctx, state, fitCamera(VIEW), VIEW, rest);
    // No route strokes at all, but the routes still exist in state (never removed).
    expect(routeStrokes(hidden.log, WORKING).length).toBe(0);
    expect(state.routes.length).toBe(3);

    click(hiddenToggle);
    expect(getLogisticsView().routesVisible).toBe(true);
    const back = makeCtx();
    drawScene(back.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(routeStrokes(back.log, WORKING).length).toBe(3);
  });

  it("toggleRoutesVisible flips the bridge without touching simulation state", () => {
    const state = linkedYard();
    toggleRoutesVisible();
    expect(getLogisticsView().routesVisible).toBe(false);
    toggleRoutesVisible();
    expect(getLogisticsView().routesVisible).toBe(true);
    expect(state.routes.length).toBe(3);
  });
});

// ============================ selection-driven highlighting ============================
describe("UI-RESET-59 selection reveals related paths and de-emphasizes the rest", () => {
  it("at rest keeps every working rail pinned and paints no arrowhead", () => {
    const state = linkedYard();
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(routeStrokes(stub.log, WORKING).length).toBe(3);
    // No arrowhead at rest. Ferrous is the unique witness: running machines already paint
    // amber (#ffb765 == scrap) cores via `fill`, so scrap-amber cannot prove absence here.
    expect(stub.log.some((r) => r.op === "fill" && r.style === MATERIAL_COLORS.ferrous)).toBe(false);
  });

  it("selecting the sorter reveals its two belts (arrowheads) and dims the unrelated belt", () => {
    const state = linkedYard();
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, { ...rest, selected: 1 });
    // Related working belts keep the pinned rail; the unrelated one is dimmed.
    expect(routeStrokes(stub.log, WORKING).length).toBe(2);
    const dimmed = routeStrokes(stub.log, "rgba(95,216,232,0.18)");
    expect(dimmed.length).toBe(1);
    // Each related belt gets a material arrowhead at its receiving end.
    expect(stub.log.some((r) => r.op === "fill" && r.style === MATERIAL_COLORS.scrap)).toBe(true);
    expect(stub.log.some((r) => r.op === "fill" && r.style === MATERIAL_COLORS.ferrous)).toBe(true);
    // The extent line still prints only for the selected machine's belts.
    expect(stub.log.some((r) => r.op === "fillText" && /tiles ·/.test(r.text ?? ""))).toBe(true);
  });

  it("a focused route from the bridge is revealed even with no machine selected", () => {
    const state = linkedYard();
    setFocusedRoute(3); // the unrelated store->furnace (ferrous) belt
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, rest);
    // Focused belt keeps the pinned rail + arrowhead; the other two dim.
    expect(routeStrokes(stub.log, WORKING).length).toBe(1);
    expect(routeStrokes(stub.log, "rgba(95,216,232,0.18)").length).toBe(2);
    expect(stub.log.some((r) => r.op === "fill" && r.style === MATERIAL_COLORS.ferrous)).toBe(true);
    resetLogisticsView();
    const cleared = makeCtx();
    drawScene(cleared.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(routeStrokes(cleared.log, WORKING).length).toBe(3);
  });

  it("a blocked belt strokes the blocked rail colour, derived from state", () => {
    const state = outputFullYard();
    expect(routeStatus(state, state.routes[0])).toBe("blocked");
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(routeStrokes(stub.log, ROUTE_STATUS_COLORS.blocked).length).toBe(2);
    expect(routeStrokes(stub.log, WORKING).length).toBe(2);
  });
});

// ============================ route controls ============================
describe("UI-RESET-59 connect/disconnect/filter controls with preview and cancel", () => {
  it("previews a suggested connect with the engine's price, cancels without dispatch, then confirms", () => {
    const state = yardWithASorter();
    const sorter = state.machines[0];
    const plans = planConnections(state, sorter.id);
    expect(plans.length).toBeGreaterThan(0);
    const captured: Command[] = [];
    const host = mountPanel(state, sorter, {
      dispatch: (command) => {
        captured.push(command);
        return applyCommand(state, command);
      },
    });
    const transport = sectionByTitle(host, COPY.sections.transport);
    const controls = transport.querySelector<HTMLElement>(".logistics-controls")!;
    expect(controls.querySelector(".logistics-subtitle")?.textContent).toBe(LOGISTICS_COPY.controls.title);

    // Open the suggested-link preview.
    click(buttonByText(controls, ".logistics-btn", LOGISTICS_COPY.controls.connect));
    const confirm = controls.querySelector<HTMLElement>(".logistics-confirm")!;
    expect(confirm.getAttribute("aria-label")).toBe(LOGISTICS_COPY.controls.preview);
    const expectedCost = plans.reduce((sum, p) => sum + previewConnect(state, p.from, p.to, p.filter).cost, 0);
    expect(confirm.querySelector(".logistics-note")?.textContent).toContain(unit(expectedCost, resourceWord("scrap")));

    // Cancel: no command dispatched, preview dismissed.
    click(buttonByText(confirm, ".logistics-btn", LOGISTICS_COPY.controls.cancel));
    expect(captured.length).toBe(0);
    expect(controls.querySelector(".logistics-confirm")).toBeNull();

    // Re-open and confirm: one route.connect per plan, through the real command path.
    click(buttonByText(controls, ".logistics-btn", LOGISTICS_COPY.controls.connect));
    const confirm2 = controls.querySelector<HTMLElement>(".logistics-confirm")!;
    click(buttonByText(confirm2, ".logistics-btn--primary", LOGISTICS_COPY.controls.connect));
    expect(captured.length).toBe(plans.length);
    expect(captured.every((c) => c.type === "route.connect")).toBe(true);
    expect(state.routes.length).toBe(2 + plans.length);
  });

  it("previews a disconnect refund and removes the belt through route.remove", () => {
    const state = yardWithASorter();
    const sorter = state.machines[0];
    const target = state.routes.find((r) => r.from.id === sorter.id)!;
    // SETUP: empty the belt so the refund is exact (no cargo return to clamp).
    target.items = [];
    target.inFlight = 0;
    const refund = previewRemove(state, target.id).refund;
    expect(refund).toBe(refundOf(beltCost(target.run?.length ?? 0)));
    const before = state.store.scrap ?? 0;
    const captured: Command[] = [];
    const host = mountPanel(state, sorter, {
      dispatch: (command) => {
        captured.push(command);
        return applyCommand(state, command);
      },
    });
    const controls = host.querySelector<HTMLElement>(".logistics-controls")!;
    // The laid link prints its refund inline. Scope the click to the TARGET row: the panel
    // lists links in route-table order (store->sorter first, sorter->store second), so the
    // first Disconnect button is not necessarily the target.
    const laid = [...controls.querySelectorAll<HTMLElement>(".logistics-route")];
    expect(laid.length).toBeGreaterThan(0);
    const links = state.routes.filter((r) => r.from.id === sorter.id || r.to.id === sorter.id);
    const idx = links.findIndex((r) => r.id === target.id);
    expect(idx).toBeGreaterThanOrEqual(0);
    const danger = [...controls.querySelectorAll<HTMLButtonElement>(".logistics-btn--danger")];
    expect(danger.length).toBe(links.length);
    click(danger[idx]);
    const confirm = controls.querySelector<HTMLElement>(".logistics-confirm")!;
    expect(confirm.querySelector(".logistics-note")?.textContent).toContain(`+${unit(refund, resourceWord("scrap"))}`);
    click(buttonByText(confirm, ".logistics-btn--primary", LOGISTICS_COPY.controls.connect));
    expect(captured.length).toBe(1);
    expect(captured[0].type).toBe("route.remove");
    expect(state.routes.some((r) => r.id === target.id)).toBe(false);
    expect((state.store.scrap ?? 0) - before).toBe(refund);
  });

  it("maps the unsupported in-place filter edit honestly and previews a custom link's validity", () => {
    const state = yardWithASorter();
    const sorter = state.machines[0];
    const host = mountPanel(state, sorter);
    const controls = host.querySelector<HTMLElement>(".logistics-controls")!;
    // No fake disabled edit control: the panel states the limitation in plain sentences.
    expect(controls.querySelector(".logistics-note--unsupported")?.textContent).toBe(LOGISTICS_COPY.controls.unsupported);
    expect(controls.textContent).toContain(LOGISTICS_COPY.controls.filterNote);

    const selects = [...controls.querySelectorAll<HTMLSelectElement>(".logistics-select")];
    expect(selects.length).toBe(3); // from, to, material
    // A self-loop is rejected with the engine's reason, mirrored by previewConnect.
    changeSelect(selects[0], String(sorter.id));
    changeSelect(selects[1], String(sorter.id));
    const preview = previewConnect(state, sorter.id, sorter.id, null);
    expect(preview.ok).toBe(false);
    expect(preview.reason).toBe("cycle");
    const customNote = [...controls.querySelectorAll<HTMLElement>(".logistics-note")].find((n) =>
      n.textContent === connectRejectText("cycle"),
    );
    expect(customNote).toBeDefined();
    expect(customNote!.className).toContain("logistics-note--invalid");
  });

  it("keeps the pinned inspector contract: logistics adds no section, action face or context tab", () => {
    const state = yardWithASorter();
    const host = mountPanel(state, state.machines[0]);
    expect(sections(host).map((s) => s.querySelector("h3")?.textContent)).toEqual([
      COPY.sections.identity, COPY.sections.recipe, COPY.sections.production, COPY.sections.bottleneck,
      COPY.sections.transport, COPY.sections.recovery, COPY.sections.actions,
    ]);
    expect(contextButtons(host).length).toBe(3);
    // Every logistics control is a .logistics-btn, never a .panel__actions > .icon-btn face.
    expect(actionFaces(host).every((b) => !b.className.includes("logistics-btn"))).toBe(true);
    expect(host.querySelectorAll(".logistics-btn").length).toBeGreaterThan(0);
    // The whole painted panel carries no raw i18n key shapes.
    expect(KEY_PATTERN.test(host.textContent ?? "")).toBe(false);
  });
});

// ============================ production / power overview ============================
describe("UI-RESET-59 production/power overview derived from state", () => {
  it("derives power, production and route counts from the engine's own helpers", () => {
    const state = linkedYard();
    const model = deriveLogistics(state);
    expect(model.power.requested).toBe(requestedPower(state));
    expect(model.power.capacity).toBe(TUNING.yardPowerCapacity);
    expect(model.power.ratio).toBe(state.powerRatio);
    expect(model.production.total).toBe(2);
    expect(model.production.running).toBe(2);
    expect(model.routes).toEqual({ total: 3, working: 3, idle: 0, blocked: 0 });
    expect(throughputLine(model)).toContain("2 machines");
  });

  it("renders a power gauge and stats inside the Bottleneck section, with a reveal per bottleneck", () => {
    const state = outputFullYard();
    const host = mountPanel(state, state.machines[0]);
    const bottleneck = sectionByTitle(host, COPY.sections.bottleneck);
    const overview = bottleneck.querySelector<HTMLElement>(".logistics-overview")!;
    expect(overview.querySelector(".logistics-subtitle")?.textContent).toBe(LOGISTICS_COPY.overview.title);
    const gauge = overview.querySelector<HTMLElement>(".logistics-gauge")!;
    expect(gauge.getAttribute("role")).toBe("progressbar");
    expect(gauge.getAttribute("aria-valuenow")).toBe(String(wholePercent(state.powerRatio)));
    // The full furnace is a measured bottleneck with a route to reveal.
    const model = deriveLogistics(state);
    const full = model.bottlenecks.find((b) => b.kind === "outputFull")!;
    expect(full.machineId).toBe(2);
    expect(full.routeId).toBe(outputRouteIds(state, 2)[0]);
    const items = [...overview.querySelectorAll<HTMLElement>(".logistics-bottleneck")];
    expect(items.length).toBe(model.bottlenecks.length);
    const reveal = buttonByText(overview, ".logistics-btn", LOGISTICS_COPY.overview.showRoute);
    click(reveal);
    expect(getLogisticsView().focusedRouteId).toBe(full.routeId);
    expect(reveal.getAttribute("aria-pressed")).toBe("true");
    // Clearing focus restores the bridge.
    click(buttonByText(overview, ".logistics-btn", LOGISTICS_COPY.overview.hideRoute));
    expect(getLogisticsView().focusedRouteId).toBeNull();
  });

  it("the overview rows are not .panel__row, so the pinned inspector rows are untouched", () => {
    const state = linkedYard();
    const host = mountPanel(state, state.machines[0]);
    const bottleneck = sectionByTitle(host, COPY.sections.bottleneck);
    // The engine's Measured row still resolves; logistics rows use their own class.
    expect(rowValue(bottleneck, "Measured").length).toBeGreaterThan(0);
    expect(bottleneck.querySelectorAll(".logistics-overview__row").length).toBeGreaterThan(0);
    expect([...bottleneck.querySelectorAll(".logistics-overview__row")].every((r) => !r.className.includes("panel__row"))).toBe(true);
  });
});

// ============================ required acceptance scenarios ============================
describe("UI-RESET-59 acceptance scenarios", () => {
  it("dense routes: 18 belts stay within the mature paint ceiling and census correctly", () => {
    const state = denseYard();
    const model = deriveLogistics(state);
    expect(model.routes.total).toBe(18);
    expect(model.routes.working + model.routes.idle + model.routes.blocked).toBe(18);
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, rest);
    // Rest frame adds zero arrowheads/dashes: the shipped D1 mature hard ceiling (240) holds
    // even with 18 belts. The exact 235 formula is calibrated to scene-draw's generic-machine
    // fixture; this dense yard uses real blueprints, so we assert the documented hard cap.
    expect(stub.paints()).toBeLessThanOrEqual(240);
    // Every belt still strokes exactly once (working or blocked rail).
    const allStrokes = stub.log.filter((r) => r.op === "stroke" && (r.style === WORKING || r.style === ROUTE_STATUS_COLORS.blocked || r.style === ROUTE_STATUS_COLORS.idle));
    expect(allStrokes.length).toBe(18);
  });

  it("zero power: the overview reports ratio 0 and a power bottleneck per machine", () => {
    const state = zeroPowerYard();
    const model = deriveLogistics(state);
    expect(model.power.ratio).toBe(0);
    expect(model.production.running).toBe(0);
    expect(model.bottlenecks.every((b) => b.kind === "power")).toBe(true);
    expect(model.bottlenecks.length).toBe(2);
    expect(model.bottlenecks[0].detail).toContain(`${wholePercent(0)}%`);
    const host = mountPanel(state, state.machines[0], { powerRatio: 0 });
    const gauge = host.querySelector<HTMLElement>(".logistics-gauge")!;
    expect(gauge.getAttribute("aria-valuenow")).toBe("0");
    // Routes still paint while power is zero (visibility is independent of power).
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(routeStrokes(stub.log, WORKING).length).toBe(3);
  });

  it("missing input: a starved machine is a bottleneck naming the material it waits on", () => {
    const state = yardWithAnIsolatedSorter();
    const model = deriveLogistics(state);
    expect(model.production.starved).toBe(1);
    expect(model.routes.total).toBe(0);
    const starved = model.bottlenecks.find((b) => b.kind === "starved")!;
    expect(starved).toBeDefined();
    expect(starved.detail).toBe(`Missing input — waiting on ${resourceWord("scrap")}.`);
    // No belt touches it, so there is honestly no route to reveal.
    expect(starved.routeId).toBeNull();
    const host = mountPanel(state, state.machines[0]);
    const overview = host.querySelector<HTMLElement>(".logistics-overview")!;
    expect(overview.querySelector(".logistics-bottleneck__detail")?.textContent).toBe(starved.detail);
    expect(overview.querySelectorAll(".logistics-bottleneck .logistics-btn").length).toBe(0);
  });

  it("output full: inbound belts are blocked and the full machine is a revealable bottleneck", () => {
    const state = outputFullYard();
    const model = deriveLogistics(state);
    expect(model.production.outputFull).toBe(1);
    expect(model.routes.blocked).toBe(2);
    expect(routeStatus(state, state.routes[0])).toBe("blocked");
    expect(routeStatus(state, state.routes[2])).toBe("working");
    const full = model.bottlenecks.find((b) => b.kind === "outputFull")!;
    expect(full.detail).toContain("Output full");
    expect(full.routeId).not.toBeNull();
  });

  it("saved-route + refund: routes round-trip through the game's own save and refund exactly", () => {
    const state = yardWithASorter();
    const sorter = state.machines[0];
    const target = state.routes.find((r) => r.from.id === sorter.id)!;
    target.items = [];
    target.inFlight = 0;
    const settings = { muted: false, reducedMotion: false, textScale: 1 };
    // The game's OWN encodeSave, lastSeenMs=Date.now() to avoid offline catch-up.
    const text = encodeSave(state, Date.now(), settings);
    const decoded = decodeSave(text);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const loaded = decoded.payload.sim;
    expect(loaded.routes.length).toBe(state.routes.length);
    const savedRoute = loaded.routes.find((r) => r.id === target.id)!;
    expect(savedRoute.filter).toBe(target.filter);
    expect(savedRoute.from).toEqual(target.from);
    expect(savedRoute.to).toEqual(target.to);
    expect(savedRoute.run).toEqual(target.run);
    // The previewed refund is the engine's dismantle arithmetic on the saved extent.
    const refund = previewRemove(loaded, target.id).refund;
    expect(refund).toBe(refundOf(beltCost(savedRoute.run?.length ?? 0)));
    expect(refund).toBeGreaterThan(0);
    // Removing the saved route through the real command credits exactly that refund.
    const before = loaded.store.scrap ?? 0;
    send(loaded, { type: "route.remove", routeId: target.id });
    expect(loaded.routes.some((r) => r.id === target.id)).toBe(false);
    expect((loaded.store.scrap ?? 0) - before).toBe(refund);
    // A re-encoded save no longer carries the dropped belt.
    const after = decodeSave(encodeSave(loaded, Date.now(), settings));
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.payload.sim.routes.some((r) => r.id === target.id)).toBe(false);
  });
});

// ============================ renderer no-regression ============================
describe("UI-RESET-59 renderer no-regression and capability guard", () => {
  it("two consecutive rest draws on a frozen state are element-wise identical", () => {
    const state = linkedYard();
    const a = makeCtx();
    const b = makeCtx();
    drawScene(a.ctx, state, fitCamera(VIEW), VIEW, rest);
    drawScene(b.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
  });

  it("the dashed flow animates only when the context supports it, and respects reduced motion", () => {
    const state = linkedYard();
    const scale = fitCamera(VIEW).scale;
    const motion = makeCtx(true);
    drawScene(motion.ctx, state, fitCamera(VIEW), VIEW, { ...rest, framePhase: 0 });
    // The guard fires: a dash pattern is set, then cleared at the end of the layer.
    expect(motion.dashCalls.length).toBe(2);
    expect(motion.dashCalls[0][0]).toBeCloseTo(4 * scale, 5);
    expect(motion.dashCalls[0][1]).toBeCloseTo(3 * scale, 5);
    expect(motion.dashCalls[1]).toEqual([]);
    // Non-reduced motion offsets the dash; the final reset returns it to 0.
    expect(motion.dashOffsets[0]).not.toBe(0);
    expect(motion.dashOffsets[motion.dashOffsets.length - 1]).toBe(0);

    const reduced = makeCtx(true);
    drawScene(reduced.ctx, state, fitCamera(VIEW), VIEW, { ...rest, reducedMotion: true, framePhase: 0 });
    expect(reduced.dashOffsets.every((v) => v === 0)).toBe(true);

    // The shipped census context has no setLineDash: the guard skips it, adding zero ops.
    const plain = makeCtx(false);
    drawScene(plain.ctx, state, fitCamera(VIEW), VIEW, rest);
    expect(plain.dashCalls.length).toBe(0);
  });

  it("hiding routes removes the route layer's paints but leaves the rest of the scene", () => {
    const state = linkedYard();
    const shown = makeCtx();
    drawScene(shown.ctx, state, fitCamera(VIEW), VIEW, rest);
    setRoutesVisible(false);
    const hidden = makeCtx();
    drawScene(hidden.ctx, state, fitCamera(VIEW), VIEW, rest);
    resetLogisticsView();
    expect(hidden.paints()).toBeLessThan(shown.paints());
    // The route layer's amber cargo tokens (fillRect) disappear, but running machines keep
    // their own amber cores, so the count drops rather than reaching zero.
    expect(amberTokens(shown.log)).toBeGreaterThan(0);
    expect(amberTokens(shown.log)).toBeGreaterThan(amberTokens(hidden.log));
    // No rail strokes survive while hidden.
    expect(routeStrokes(hidden.log, WORKING).length).toBe(0);
  });

  it("the material colour source matches the legend swatch and the canvas arrowhead", () => {
    expect(materialColor("scrap")).toBe(MATERIAL_COLORS.scrap);
    expect(materialColor(null)).toBe("#8aa9c4");
    const state = linkedYard();
    const stub = makeCtx();
    drawScene(stub.ctx, state, fitCamera(VIEW), VIEW, { ...rest, selected: 1 });
    // The ferrous arrowhead uses the exact legend swatch colour.
    expect(stub.log.some((r) => r.op === "fill" && r.style === materialColor("ferrous"))).toBe(true);
    expect(formatNumber(3)).toBe("3");
    expect(beltExtentLine(state.routes[0])).toContain("tiles");
  });
});
