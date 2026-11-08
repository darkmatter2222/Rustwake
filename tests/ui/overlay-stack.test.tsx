import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
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
 * UI-002 g3, follow-up U-5: the overlay *stack*.
 *
 * Two layers can be on the screen at once - the return report the boot left behind, plus the
 * panel the player opened last (the yard store, the yard record, research, a machine) - and
 * one `Back`/`Escape` press must retire exactly one of them, nearest first, so the stack
 * unwinds `2 -> 1 -> 0` and the last step is the plain yard with its canvas. Before this
 * pass the painted order of the two layers was the DOM order, which put the *older* layer's
 * dismiss target nearest the dock: the same thumb position therefore answered for a
 * different layer after every press.
 *
 * jsdom answers the numbers the criterion is stated in (`order` and `max-height` come from
 * the shipped sheet, injected below, and `:has()` is evaluated by jsdom's own matcher), so
 * the stack is asserted at both levels: the press chain and the layer budget. The pixel
 * truth of the same chain is the chromium `stack` pass of `scripts/measure-ui002.mjs`.
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
/** The painted layer nearest the dock: the greatest `order` among the visible layers. */
function topmostPanel(): HTMLElement | null {
  const nodes = panelNodes();
  if (nodes.length === 0) return null;
  return nodes.reduce((best, node) =>
    Number(getComputedStyle(node).order || 0) >= Number(getComputedStyle(best).order || 0)
      ? node
      : best
  );
}
const dismissOf = (node: HTMLElement | null) =>
  node?.querySelector<HTMLElement>(".panel__head button") ?? null;
const canvasInRoot = () => document.querySelector("#root > .game > canvas");
const pressBack = () =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
const tapFace = (label: string) => {
  const faces = [...document.querySelectorAll<HTMLElement>(".dock .dock__btn")];
  const texts = faces.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim());
  const index = texts.indexOf(label);
  act(() => faces[index]?.click());
  return { index, faces: texts };
};

describe("UI-002 g3 U-5 the overlay stack", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = stylesRaw;
    document.head.appendChild(style);
  });

  it("unwinds two layers one per Back press and leaves the yard with its canvas", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const chain: number[] = [panelNodes().length];
    expect(panelTitles()).toEqual(["While you were away"]);

    // One tap opens the yard store on top of the report: the stack is two deep.
    const opened = tapFace("Store");
    expect(opened.index, `dock faces ${JSON.stringify(opened.faces)}`).toBeGreaterThan(-1);
    chain.push(panelNodes().length);
    expect(panelTitles()).toEqual(["Yard store", "While you were away"]);
    expect(canvasInRoot()).not.toBeNull();

    // One press, one layer, nearest first: the store goes, the report stays.
    pressBack();
    chain.push(panelNodes().length);
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(canvasInRoot()).not.toBeNull();

    // The second press retires the report and lands on the yard - the canvas is still
    // inside `#root`, the chrome and the objective line are the ones that were there first.
    pressBack();
    chain.push(panelNodes().length);
    expect(chain).toEqual([1, 2, 1, 0]);
    expect(panelNodes()).toHaveLength(0);
    expect(canvasInRoot()).not.toBeNull();
    expect(document.querySelector(".hud")).not.toBeNull();
    expect(document.querySelector(".dock .dock__btn")).not.toBeNull();
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

  it("gives the newest layer the painted target nearest the dock and retires one layer per tap", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    tapFace("Store");
    expect(panelNodes()).toHaveLength(2);

    // The layer painted nearest the dock is the one the player opened last (LIFO): the same
    // thumb spot keeps answering for the top of the stack, press after press.
    const stacked = panelNodes().map((node) => ({
      title: node.querySelector(".panel__title")?.textContent ?? "",
      order: Number(getComputedStyle(node).order || 0),
      maxHeight: getComputedStyle(node).maxHeight,
    }));
    console.log("UI-002 U-5 stack layers (jsdom computed)", JSON.stringify(stacked));
    const nearest = topmostPanel();
    expect(nearest?.querySelector(".panel__title")?.textContent).toBe("Yard store");
    const report = panelNodes().find(
      (node) => node.querySelector(".panel__title")?.textContent === "While you were away"
    );
    expect(Number(getComputedStyle(nearest as HTMLElement).order)).toBeGreaterThan(
      Number(getComputedStyle(report as HTMLElement).order)
    );

    // Tap the painted target: one layer retires, the report is what is left.
    act(() => dismissOf(topmostPanel())?.click());
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(canvasInRoot()).not.toBeNull();
    // Same spot, one more layer: the yard, still with its canvas and its dock.
    act(() => dismissOf(topmostPanel())?.click());
    expect(panelNodes()).toHaveLength(0);
    expect(canvasInRoot()).not.toBeNull();
    expect(document.querySelector(".dock")).not.toBeNull();
  });

  it("retires the build ghost before the report and before the yard record", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const yard = tapFace("Yard");
    expect(yard.index, `dock faces ${JSON.stringify(yard.faces)}`).toBeGreaterThan(-1);
    expect(panelTitles()).toEqual(["Yard record", "While you were away"]);
    expect(panelNodes().length).toBe(2);

    // The yard record is the nearest layer, so one press retires it and the report stays.
    pressBack();
    expect(panelTitles()).toEqual(["While you were away"]);

    // The build ghost is the nearest layer while build mode is armed, so it too is retired
    // before the report: the press that drops the ghost line leaves the report on screen
    // (`onPickBlueprint` clears the panel slot, so the ghost is the only thing above it).
    tapFace("Build");
    expect(document.querySelector(".status-line")?.textContent).toContain("Ghost on cell");
    expect(panelTitles()).toEqual(["While you were away"]);
    pressBack();
    expect(document.querySelector(".status-line")?.textContent).not.toContain("Ghost on cell");
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(canvasInRoot()).not.toBeNull();

    // And the last press leaves the plain yard, canvas and dock intact.
    pressBack();
    expect(panelNodes()).toHaveLength(0);
    expect(canvasInRoot()).not.toBeNull();
    expect(document.querySelector(".dock")).not.toBeNull();
  });

  it("caps one layer at 42 % of the column and two stacked layers at 26 % each", () => {
    const store = storeWithReturnReport(8);
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const alone = panelNodes()[0];
    expect(getComputedStyle(alone).maxHeight).toBe("42%");
    expect(getComputedStyle(alone).order).toBe("2");
    const single = { maxHeight: getComputedStyle(alone).maxHeight, order: getComputedStyle(alone).order };

    tapFace("Store");
    const stacked = panelNodes().map((node) => ({
      title: node.querySelector(".panel__title")?.textContent ?? "",
      maxHeight: getComputedStyle(node).maxHeight,
      order: getComputedStyle(node).order,
    }));
    console.log(
      "UI-002 U-5 layer budget",
      JSON.stringify({ single, stacked, sheetBytes: stylesRaw.length })
    );
    for (const layer of stacked) {
      expect(layer.maxHeight).toBe("26%");
      expect(Number(layer.order)).toBeLessThan(4); // stays above the dock's slot
      expect(Number(layer.order)).toBeGreaterThan(0);
    }
    // Both caps are the shipped sheet's own declarations, not a copy in the test.
    expect(stylesRaw).toContain("max-height: 42%");
    expect(stylesRaw).toContain("max-height: 26%");
    expect(stylesRaw).toContain(".hud:has(.panel ~ .panel) > .panel");
  });
});
