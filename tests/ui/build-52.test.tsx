import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import hudCssRaw from "../../src/ui/hud/hud.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import buildCssRaw from "../../src/ui/build/build.css?raw";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
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
import { PARTS } from "../../src/game/renderer/sprites";
import { SHELL_DESKTOP_QUERY } from "../../src/ui/shell/layout";
import { costSummary } from "../../src/ui/text";
import { CATEGORIES, catalogCards, lockLine } from "../../src/ui/build/catalog";
import { FUNCTIONS } from "../../src/ui/build/copy";

/**
 * UI-RESET-52: the visual build catalog replaces the dock's Next-button cycling.
 *
 * Acceptance reads, all through the real UI path (click → command → state):
 *  1. every shipped machine carries its silhouette, name, function, recipe
 *     inputs/outputs and its real build cost;
 *  2. categories group the cards, the selected one is marked, and locked cards
 *     print the table's own `unlockAt` requirement — no invented progression;
 *  3. unaffordable cards print have/need and keep Salvage/Store one tap away;
 *  4. selection arms the ghost, Place enters the explicit preview, Cancel
 *     returns to the catalog without spending;
 *  5. fresh unlocks, the mature catalog, and narrow/large-text presentation.
 *
 * Fixture mutations live only in this file (the seeded yards below are built
 * by the real engine, exactly like the shell-49 and overlay-stack fixtures);
 * every action under test is a click on the shipped surface.
 */

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    raw: map,
  };
}

/** A developed yard through the real engine: two connected machines, past the tutorial. */
function matureState(): SimState {
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
  for (const blueprint of ["sorter", "furnace"] as const) {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store = { ...state.store, [item.resource]: item.qty };
    }
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
    let tile = 8;
    for (let t = 0; t < YARD_TILES; t += 1) {
      if (t !== DOCK_TILE && !state.machines.some((m) => m.tile === t)) {
        tile = t;
        break;
      }
    }
    send({ type: "machine.build", blueprint, tile });
    const machineId = state.machines[state.machines.length - 1].id;
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    advance(state, 300);
  }
  state.credits = 100;
  state.store = { ...state.store, data: 12 };
  state.storeUnits += 12;
  advance(state, 1);
  return state;
}

function storeFromState(state: SimState): GameStore {
  const writtenAt = 1_000_000;
  const text = encodeSave(state, writtenAt, { ...DEFAULT_SETTINGS, muted: true });
  const map = new Map<string, string>([[SAVE_KEY, text]]);
  return createStore({
    storage: {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => map.set(key, value),
    },
    now: () => writtenAt + 60_000,
  });
}

/** The mature yard: all eight blueprints unlocked, a short absence report up. */
const matureStore = () => storeFromState(matureState());

/** A fresh boot: tutorial 0, only the sorter unlocked (the gate floors at 4). */
function freshStore(): GameStore {
  return createStore({ storage: memoryStorage(), now: () => 10 });
}

/** Past the tutorial but empty-handed: every card unaffordable, wreck intact. */
function poorMatureStore(): GameStore {
  const state = createInitialState();
  state.tutorial = 9;
  advance(state, 1);
  return storeFromState(state);
}

/** Test-only funding so a placement under test is affordable; real store accounting. */
function fund(store: GameStore, blueprint: string): void {
  const state = store.getState();
  for (const item of BLUEPRINTS[blueprint].buildCost) {
    state.store[item.resource] = (state.store[item.resource] ?? 0) + item.qty * 3;
    state.storeUnits += item.qty * 3;
  }
  act(() => store.step(1));
}

function mount(store: GameStore): HTMLElement {
  const host = document.createElement("div");
  host.id = "root";
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<App store={store} />);
  });
  return host;
}

function begin(): void {
  act(() => findButton("Begin recovery")?.click());
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

const dockFaces = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".dock .dock__btn")].map((node) =>
    (node.textContent ?? "").replace(/\s+/g, " ").trim()
  );

/** Exact-match dock tap: the primary's label can itself start with "Build". */
function tapDockExact(label: string): void {
  const face = [...document.querySelectorAll<HTMLButtonElement>(".dock .dock__btn")].find(
    (node) => (node.firstChild?.textContent ?? "").trim() === label
  );
  expect(face, `dock faces ${JSON.stringify(dockFaces())}`).toBeDefined();
  act(() => face!.click());
}

const catalog = () => document.querySelector<HTMLElement>(".catalog");
/** Footer actions scoped to the catalog: the dock also speaks Store/Salvage-adjacent labels. */
function catalogButton(label: string): HTMLButtonElement | undefined {
  return [...(catalog()?.querySelectorAll("button") ?? [])].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}
const card = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.catalog__card[data-blueprint="${id}"]`);
const cards = () => [...document.querySelectorAll<HTMLButtonElement>(".catalog__card")];
const panelTitles = () =>
  [...document.querySelectorAll(".panel")].map((node) =>
    (node.querySelector(".panel__title")?.textContent ?? "").trim()
  );
const statusLine = () => document.querySelector(".status-line")?.textContent ?? "";
const pressBack = () =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

const realMatchMedia = window.matchMedia?.bind(window);
/** T08 (#135): the rail query is retired; the shell switches on the desktop query. */
function stubMedia(desktop: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query === SHELL_DESKTOP_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  document.body.innerHTML = "";
  for (const style of [...document.head.querySelectorAll("style")]) style.remove();
  for (const raw of [stylesRaw, hudCssRaw, shellRaw, buildCssRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
  document.documentElement.style.removeProperty("--shell-inspector-top");
  stubMedia(false);
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
});

describe("UI-RESET-52 the catalog replaces cycling", () => {
  it("opens from the dock Build face with every category and all eight machines", () => {
    const store = matureStore();
    mount(store);
    begin();
    expect(catalog()).toBeNull();
    tapDockExact("Build");

    const node = catalog();
    expect(node).not.toBeNull();
    expect(node!.getAttribute("role")).toBe("dialog");
    expect(node!.getAttribute("aria-label")).toBe("Build catalog");
    // The catalog is not a panel. T08 (#135) U03: it is the ONE major surface,
    // so opening it clears the panel stack (the report stays in the store and
    // re-opens from Settings → Return report).
    expect(node!.classList.contains("panel")).toBe(false);
    expect(panelTitles()).toEqual([]);
    expect(document.querySelector(".shell-host")).toBeNull();

    const groups = [...node!.querySelectorAll(".catalog__group-title")].map((n) =>
      (n.textContent ?? "").trim()
    );
    expect(groups).toEqual(CATEGORIES.map((c) => c.label));
    expect(cards()).toHaveLength(Object.keys(BLUEPRINTS).length);
    expect(cards().map((n) => n.dataset.blueprint)).toEqual(
      catalogCards(9).map((c) => c.id)
    );
    // The ghost is armed underneath, so the yard keeps a live preview.
    expect(statusLine()).toContain("Ghost on cell");
    expect(document.querySelector(".hud")!.className).toContain("hud--build");
  });

  it("gives every machine its silhouette, name, function, recipe and real cost", () => {
    const store = matureStore();
    mount(store);
    begin();
    tapDockExact("Build");

    for (const id of Object.keys(BLUEPRINTS)) {
      const def = BLUEPRINTS[id];
      const node = card(id)!;
      expect(node, id).toBeDefined();
      // The icon is the renderer's own part table, part for part.
      const icon = node.querySelector("svg.catalog__icon");
      expect(icon, id).not.toBeNull();
      expect(icon!.children.length).toBe(PARTS[id].length);
      expect(node.querySelector(".catalog__name")!.textContent).toBe(def.label);
      expect(node.querySelector(".catalog__function")!.textContent).toBe(FUNCTIONS[id]);
      const recipe = RECIPES[def.recipeId];
      const recipeText = node.querySelector(".catalog__recipe")!.textContent ?? "";
      for (const item of [...recipe.inputs, ...recipe.outputs]) {
        expect(recipeText, `${id} ${item.resource}`).toContain(String(item.qty));
      }
      expect(recipeText).toContain("Inputs");
      expect(recipeText).toContain("Outputs");
      expect(recipeText).toContain("Power");
      expect(node.querySelector(".catalog__cost")!.textContent).toBe(costSummary(def));
    }
  });

  it("shows the fresh unlock gate verbatim and never invents progression", () => {
    const store = freshStore();
    mount(store);
    begin();
    tapDockExact("Build");

    const sorter = card("sorter")!;
    expect(sorter.dataset.locked).toBe("false");
    expect(sorter.disabled).toBe(false);
    for (const id of Object.keys(BLUEPRINTS).filter((k) => k !== "sorter")) {
      const node = card(id)!;
      expect(node.dataset.locked, id).toBe("true");
      expect(node.disabled, id).toBe(true);
      expect(node.querySelector(".catalog__lock")!.textContent, id).toBe(
        lockLine(BLUEPRINTS[id])
      );
      expect(node.querySelector(".catalog__lock")!.textContent, id).toBe(
        `Unlocks at step ${BLUEPRINTS[id].unlockAt}`
      );
    }
  });

  it("keeps a locked card inert: no command, no selection change", () => {
    const store = freshStore();
    mount(store);
    begin();
    const spy = vi.spyOn(store, "dispatch");
    tapDockExact("Build");
    spy.mockClear();

    act(() => card("furnace")!.click());
    expect(spy).not.toHaveBeenCalled();
    expect(card("furnace")!.getAttribute("aria-pressed")).toBe("false");
    expect(card("sorter")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("prints have/need on unaffordable cards and keeps recovery one tap away", () => {
    const store = poorMatureStore();
    mount(store);
    begin();
    tapDockExact("Build");

    const sorter = card("sorter")!;
    expect(sorter.dataset.affordable).toBe("false");
    expect(sorter.textContent).toContain("Need 20 scrap · have 0");
    // The footer Place is disabled while the choice cannot be paid.
    expect(catalogButton("Place Scrap sorter")!.disabled).toBe(true);

    // Salvage is the real command: the store gains scrap and the card re-reads it.
    act(() => catalogButton("Salvage")!.click());
    expect(store.getState().store.scrap).toBeGreaterThan(0);
    expect(card("sorter")!.textContent).toContain(
      `Need 20 scrap · have ${store.getState().store.scrap}`
    );
    // Catalog still open: recovery never throws the player out of planning.
    expect(catalog()).not.toBeNull();

    // Store opens the real store panel and retires the catalog.
    act(() => catalogButton("Store")!.click());
    expect(catalog()).toBeNull();
    expect(panelTitles()).toContain("Yard store");
  });

  it("select → Place enters the explicit preview without spending", () => {
    const store = matureStore();
    fund(store, "furnace");
    mount(store);
    begin();
    tapDockExact("Build");

    act(() => card("furnace")!.click());
    expect(card("furnace")!.getAttribute("aria-pressed")).toBe("true");
    expect(card("sorter")!.getAttribute("aria-pressed")).toBe("false");
    // The dock behind the catalog already names the committed choice.
    expect(dockFaces()[1]).toContain("Build Furnace");
    expect(catalog()).not.toBeNull();

    const machinesBefore = store.getState().machines.length;
    const storeBefore = { ...store.getState().store };
    act(() => catalogButton("Place Furnace")!.click());

    expect(catalog()).toBeNull();
    expect(document.querySelector(".hud")!.className).toContain("hud--build");
    expect(statusLine()).toContain("Ghost on cell");
    const faces = dockFaces();
    expect(faces).toHaveLength(3);
    expect(faces[0]).toBe("Cancel");
    expect(faces[1]).toContain("Build Furnace");
    expect(faces[2]).toBe("Next");
    // Preview only: nothing built, nothing charged.
    expect(store.getState().machines.length).toBe(machinesBefore);
    expect(store.getState().store).toEqual(storeBefore);
  });

  it("places the chosen machine on the ghost tile through the real build command", () => {
    const store = matureStore();
    fund(store, "furnace");
    mount(store);
    begin();
    tapDockExact("Build");
    act(() => card("furnace")!.click());
    act(() => catalogButton("Place Furnace")!.click());

    const ghostTile = Number(/Ghost on cell (\d+)/.exec(statusLine())![1]);
    const before = store.getState();
    const scrapBefore = before.store.scrap ?? 0;
    const ferrousBefore = before.store.ferrous ?? 0;
    const countBefore = before.machines.length;
    // The state object is mutated in place: snapshot the scalar before the tap.
    const revisionBefore = before.revision;

    tapDockExact("Build Furnace");

    const after = store.getState();
    expect(after.machines.length).toBe(countBefore + 1);
    const built = after.machines[after.machines.length - 1];
    expect(built.blueprint).toBe("furnace");
    expect(built.tile).toBe(ghostTile);
    expect(after.revision).toBeGreaterThan(revisionBefore);
    expect(scrapBefore - (after.store.scrap ?? 0)).toBe(10);
    expect(ferrousBefore - (after.store.ferrous ?? 0)).toBe(5);
    // The phase is over: the catalog stays closed and the dock is the resting five.
    expect(catalog()).toBeNull();
    expect(document.querySelector(".hud")!.className).not.toContain("hud--build");
    expect(dockFaces()).toHaveLength(5);
  });

  it("Cancel returns to the catalog with the choice intact and no spend", () => {
    const store = matureStore();
    fund(store, "furnace");
    mount(store);
    begin();
    tapDockExact("Build");
    act(() => card("furnace")!.click());
    act(() => catalogButton("Place Furnace")!.click());
    const spy = vi.spyOn(store, "dispatch");

    tapDockExact("Cancel");

    expect(spy).not.toHaveBeenCalled();
    expect(catalog()).not.toBeNull();
    expect(card("furnace")!.getAttribute("aria-pressed")).toBe("true");
    expect(statusLine()).toContain("Ghost on cell");
    expect(store.getState().machines.length).toBe(2);
  });

  it("the header Close keeps the placement preview alive", () => {
    const store = matureStore();
    mount(store);
    begin();
    tapDockExact("Build");
    act(() => catalogButton("Close catalog")!.click());
    expect(catalog()).toBeNull();
    expect(document.querySelector(".hud")!.className).toContain("hud--build");
    expect(statusLine()).toContain("Ghost on cell");
  });

  it("Next opens the catalog instead of cycling the blueprint", () => {
    const store = matureStore();
    fund(store, "furnace");
    mount(store);
    begin();
    tapDockExact("Build");
    act(() => card("furnace")!.click());
    act(() => catalogButton("Place Furnace")!.click());

    tapDockExact("Next");

    expect(catalog()).not.toBeNull();
    // The old cycle would have moved furnace → copperSeparator; the choice holds.
    expect(card("furnace")!.getAttribute("aria-pressed")).toBe("true");
    expect(card("copperSeparator")!.getAttribute("aria-pressed")).toBe("false");
    expect(dockFaces()[1]).toContain("Build Furnace");
  });

  it("retires catalog and ghost as one layer; the report re-opens from Settings", () => {
    const store = matureStore();
    mount(store);
    begin();
    expect(panelTitles()).toEqual(["While you were away"]);
    tapDockExact("Build");
    expect(catalog()).not.toBeNull();
    // T08 (#135) U03: the catalog is the one major surface, so it replaces the
    // stack instead of painting over the report. Nothing is lost: the report
    // lives in the store, not in the retired layer.
    expect(panelTitles()).toEqual([]);
    expect(document.querySelector(".shell-host")).toBeNull();

    pressBack();
    expect(catalog()).toBeNull();
    expect(statusLine()).not.toContain("Ghost on cell");
    expect(panelTitles()).toEqual([]);

    // Settings carries the retired Menu sheet's Return report row.
    act(() => findButton("Settings")?.click());
    const row = [...document.querySelectorAll<HTMLElement>(".panel--settings .panel__row")].find(
      (node) => (node.querySelector("dt")?.textContent ?? "").trim() === "Return report"
    );
    expect(row).toBeDefined();
    const open = [...row!.querySelectorAll("button")].find(
      (node) => (node.textContent ?? "").trim() === "Open"
    );
    expect(open?.disabled).toBe(false);
    act(() => open?.click());
    expect(panelTitles()).toEqual(["While you were away"]);

    // Back pops one layer at a time: report → Settings → yard.
    pressBack();
    expect(panelTitles()).toEqual(["Settings"]);
    pressBack();
    expect(panelTitles()).toEqual([]);
    expect(document.querySelector(".dock")).not.toBeNull();
  });

  it("keeps the pinned dock censuses: five resting faces, three build faces", () => {
    const store = matureStore();
    mount(store);
    begin();
    const resting = dockFaces();
    expect(resting).toHaveLength(5);
    expect(resting[0]).toBe("Store");
    expect(resting[1]).toBe("Yard");
    expect(resting[3]).toBe("Build");
    expect(resting[4]).toBe("Research");

    tapDockExact("Build");
    const building = dockFaces();
    expect(building).toHaveLength(3);
    expect(building[0]).toBe("Cancel");
    expect(building[1]).toContain("Build");
    expect(building[2]).toBe("Next");
  });

  it("stays flat and tappable at 360-class width with 200% text", () => {
    stubMedia(false);
    const store = matureStore();
    act(() => store.setSettings({ textScale: 2 }));
    mount(store);
    begin();
    tapDockExact("Build");
    expect(catalog()).not.toBeNull();

    // Every target in the HUD keeps the 44 px floor, catalog included.
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".hud button")];
    expect(buttons.length).toBeGreaterThan(8);
    for (const button of buttons) {
      const floor = Number.parseFloat(getComputedStyle(button).minHeight);
      expect(floor, button.textContent ?? "").toBeGreaterThanOrEqual(44);
    }
    // The page never scrolls; the catalog body is the declared scroller.
    expect(getComputedStyle(document.body).overflow).toBe("hidden");
    expect(getComputedStyle(document.documentElement).overflow).toBe("hidden");
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight + 1);
    const body = document.querySelector<HTMLElement>(".catalog__body")!;
    expect(getComputedStyle(body).overflowY).toBe("auto");
    // T08 (#135): the paired 26% budget retired with two painted layers; the
    // catalog keeps its own phone budget while the host owns panel height.
    expect(getComputedStyle(catalog()!).maxHeight).toBe("42%");
    expect(getComputedStyle(catalog()!).order).toBe("3");
  });

  it("speaks no raw string keys anywhere in the catalog", () => {
    const store = matureStore();
    mount(store);
    begin();
    tapDockExact("Build");
    const pattern =
      /\b(btn|row|reject|value|phase|hud|gate|title|aria|field|note|report|import|sound|glyph|advice|yard|tut|objective|chip)\.[a-z]/;
    for (const node of [...document.querySelectorAll(".catalog, .catalog *")]) {
      expect(pattern.test(node.textContent ?? ""), node.textContent ?? "").toBe(false);
    }
  });
});
