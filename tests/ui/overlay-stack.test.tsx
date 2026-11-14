import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, SAVE_KEY, encodeSave } from "../../src/game/persistence/save";

/**
 * UI-002 g3 U-5, retargeted for RW3D #135 (T08): the panel *stack* under the
 * compact shell's ONE-surface rule.
 *
 * The 2D-era two-layer painted overlay (42% / 26% caps, `order` nearest the
 * dock) is retired. The stack itself survives as session state: the return
 * report the boot left behind is the first layer, Settings / yard record /
 * machine layers push over it (dedupe-to-top), and exactly ONE major surface
 * paints at a time — the top of the stack — inside `.shell-host`. One
 * `Back`/`Escape` press still retires exactly one layer, nearest first, so the
 * stack unwinds `2 -> 1 -> 0` and the last step is the plain yard with its
 * canvas. The host's Back face is the painted dismiss target while the stack is
 * deeper than one; at depth one the panel's own head face answers.
 *
 * jsdom answers the numbers the criterion is stated in (`data-depth`, the sheet
 * heights and the one-surface census come from the shipped sheets, injected
 * below); the pixel truth of the same chain is the headless chromium capture in
 * docs/evidence/2026-11-14-rw3d-t08-shell/.
 */

/** Every blueprint the tables carry, in yard order: eight machines is the deepest ladder. */
const ORDER = [
  "sorter",
  "furnace",
  "copperSeparator",
  "polymerRecycler",
  "wireMill",
  "platePress",
  "circuitAssembler",
  "signalLab",
] as const;

const firstFree = (state: SimState): number => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/** The boot cadence through the real engine, `depth` machines deep, past the tutorial. */
function yard(depth: number, credits = 34, data = 12): SimState {
  const state = createInitialState();
  let seq = 0;
  const send = (body: CommandBody) =>
    applyCommand(state, { ...body, id: `s${(seq += 1)}` } as Command);
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  state.tutorial = 9;
  for (const blueprint of ORDER.slice(0, depth)) {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store = { ...state.store, [item.resource]: item.qty };
    }
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
    send({ type: "machine.build", blueprint, tile: firstFree(state) });
    const machineId = state.machines[state.machines.length - 1].id;
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    advance(state, 300);
  }
  state.credits = credits;
  if (data > 0) {
    state.store = { ...state.store, data };
    state.storeUnits += data;
  }
  advance(state, 1);
  return state;
}

/** A save that *left an absence* behind, so the boot answers with the return report. */
function storeWithReturnReport(depth: number): GameStore {
  const writtenAt = 1_000_000; // epoch ms, the envelope's own reference clock
  const text = encodeSave(yard(depth), writtenAt, { ...DEFAULT_SETTINGS, muted: true });
  const map = new Map<string, string>([[SAVE_KEY, text]]);
  return createStore({
    storage: {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => map.set(key, value),
    },
    // 600 ticks of absence: under `CATCHUP_WORKER_MIN_TICKS`, so the report is settled
    // inline at construction and is on the screen with the very first frame.
    now: () => writtenAt + 60_000,
  });
}

/** The mount host carries `#root`, the same id `index.html` uses for the app. */
function mount(store: GameStore): HTMLElement {
  const host = document.createElement("div");
  host.id = "root";
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<App store={store} />);
  });
  return host;
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

const panelNodes = () => [...document.querySelectorAll<HTMLElement>(".panel")];
const panelTitles = () =>
  panelNodes().map((node) => (node.querySelector(".panel__title")?.textContent ?? "").trim());
const panelHost = () => document.querySelector<HTMLElement>(".shell-host");
/** The stack depth the host publishes: one painted surface, N layers underneath. */
const hostDepth = () => Number(panelHost()?.dataset.depth ?? 0);
const backFace = () => panelHost()?.querySelector<HTMLButtonElement>(".shell-host__back") ?? null;
const dismissOf = (node: HTMLElement | null) =>
  node?.querySelector<HTMLElement>(".panel__head button") ?? null;
const canvasInRoot = () => document.querySelector("#root > .game > canvas");
const pressBack = () =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
const tapSlot = (slot: string) =>
  act(() => document.querySelector<HTMLButtonElement>(`.toolbar [data-slot="${slot}"]`)?.click());
/** The gear pushes Settings as a stack layer (the retired Menu face's corner). */
const openSettings = () => act(() => findButton("Settings")?.click());
const settingsRowButton = (label: string) =>
  [...document.querySelectorAll<HTMLElement>(".panel--settings .panel__row")]
    .find((node) => (node.querySelector("dt")?.textContent ?? "").trim() === label)
    ?.querySelector<HTMLButtonElement>("button");

describe("UI-002 g3 U-5 the panel stack (T08 one-surface shell)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--shell-inspector-top");
    document.documentElement.style.removeProperty("--shell-chrome-bottom");
    for (const raw of [stylesRaw, shellRaw]) {
      const style = document.createElement("style");
      style.textContent = raw;
      document.head.appendChild(style);
    }
  });

  it("unwinds two layers one per Back press and leaves the yard with its canvas", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const chain: number[] = [hostDepth()];
    expect(panelTitles()).toEqual(["While you were away"]);

    // The gear pushes Settings over the report: the stack is two deep, but only
    // the newest layer paints (U03: one major surface at a time).
    openSettings();
    chain.push(hostDepth());
    expect(panelTitles()).toEqual(["Settings"]);
    expect(panelNodes()).toHaveLength(1);
    expect(canvasInRoot()).not.toBeNull();

    // One press, one layer, nearest first: Settings goes, the report stays.
    pressBack();
    chain.push(hostDepth());
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(canvasInRoot()).not.toBeNull();

    // The second press retires the report and lands on the yard - the canvas is still
    // inside `#root`, the chrome and the objective line are the ones that were there first.
    pressBack();
    chain.push(hostDepth());
    expect(chain).toEqual([1, 2, 1, 0]);
    expect(panelNodes()).toHaveLength(0);
    expect(canvasInRoot()).not.toBeNull();
    expect(document.querySelector(".hud")).not.toBeNull();
    expect(document.querySelector(".toolbar .toolbar__btn")).not.toBeNull();
    const card = document.querySelector(".objective")?.textContent ?? "";
    expect(card).toContain("Drones");
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight + 1);

    // A third press on the plain yard changes nothing (no "close everything" path).
    pressBack();
    expect(panelNodes()).toHaveLength(0);
    expect(canvasInRoot()).not.toBeNull();
    // The sim kept ticking through the whole chain: the yard is live, not a dead frame.
    expect(store.getState().tick).toBeGreaterThan(0);
  });

  it("paints only the newest layer and retires one layer per tap", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    openSettings();
    expect(hostDepth()).toBe(2);

    // The one painted surface is the layer the player opened last (LIFO): the
    // host's Back face is the dismiss target while the stack is deeper than one.
    expect(panelNodes()).toHaveLength(1);
    expect(panelTitles()).toEqual(["Settings"]);
    const back = backFace();
    expect(back).not.toBeNull();
    expect(back!.getAttribute("aria-label")).toBe("Back to previous panel");

    // Tap the painted target: one layer retires, the report is what is left.
    act(() => back!.click());
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(hostDepth()).toBe(1);
    expect(backFace()).toBeNull(); // depth one: the panel's own head face answers
    expect(canvasInRoot()).not.toBeNull();
    // Same spot, one more layer: the yard, still with its canvas and its toolbar.
    act(() => dismissOf(panelNodes()[0])?.click());
    expect(panelNodes()).toHaveLength(0);
    expect(canvasInRoot()).not.toBeNull();
    expect(document.querySelector(".toolbar")).not.toBeNull();
  });

  it("retires the build layer in one press and keeps the report reachable", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    openSettings();
    act(() => settingsRowButton("Yard record")!.click());
    expect(panelTitles()).toEqual(["Yard record"]);
    expect(hostDepth()).toBe(3);

    // The yard record is the nearest layer, so one press retires it and Settings
    // stays; the next press leaves the report. One press, one layer, down to it.
    pressBack();
    expect(panelTitles()).toEqual(["Settings"]);
    pressBack();
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(hostDepth()).toBe(1);

    // Build is a root: the catalog is the one major surface while it is up, with
    // the ghost armed underneath it. No inspector paints beside it (U03).
    tapSlot("build");
    expect(document.querySelector(".hud")!.className).toContain("hud--build");
    expect(panelNodes()).toHaveLength(0);
    expect(document.querySelector(".status-line")?.textContent).toContain("Ghost on cell");
    // Escape retires catalog and ghost together as the ONE build layer.
    pressBack();
    expect(document.querySelector(".hud")!.className).not.toContain("hud--build");
    expect(document.querySelector(".status-line")?.textContent).not.toContain("Ghost on cell");
    expect(panelNodes()).toHaveLength(0);
    expect(canvasInRoot()).not.toBeNull();

    // The report was never consumed: it stays reachable from the Settings face.
    openSettings();
    const reportButton = settingsRowButton("Return report")!;
    expect(reportButton.disabled).toBe(false);
    act(() => reportButton.click());
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(canvasInRoot()).not.toBeNull();
  });

  it("bounds the phone sheet at 35vh collapsed / 70vh expanded and paints one layer", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const host = panelHost()!;
    expect(getComputedStyle(host).height).toBe("35vh");

    const expand = findButton("Expand panel")!;
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    act(() => expand.click());
    expect(getComputedStyle(panelHost()!).height).toBe("70vh");
    expect(findButton("Collapse panel")!.getAttribute("aria-expanded")).toBe("true");

    // A second layer never paints a second surface: the census stays at one.
    openSettings();
    expect(hostDepth()).toBe(2);
    expect(panelNodes()).toHaveLength(1);
    expect(panelTitles()).toEqual(["Settings"]);
    pressBack();
    expect(panelTitles()).toEqual(["While you were away"]);
    act(() => findButton("Collapse panel")!.click());
    expect(getComputedStyle(panelHost()!).height).toBe("35vh");

    // Both bands are the shipped sheet's own declarations, not a copy in the test.
    expect(shellRaw).toContain("height: 35vh");
    expect(shellRaw).toContain("height: 70vh");
    // The retired two-layer census rule is gone. The base `.panel` keeps its
    // D-6/E-4 cap for the save page; the host overrides it to fill the surface.
    expect(stylesRaw).not.toContain(".hud:has(.panel ~ .panel)");
    expect(shellRaw).toContain("max-height: 100%");
  });
});
