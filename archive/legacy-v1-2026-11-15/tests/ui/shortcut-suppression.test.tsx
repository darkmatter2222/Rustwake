import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import hudCssRaw from "../../src/ui/hud/hud.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import buildCssRaw from "../../src/ui/build/build.css?raw";
import placeCssRaw from "../../src/ui/place/place.css?raw";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { BLUEPRINTS } from "../../src/game/content/defs";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, SAVE_KEY, encodeSave } from "../../src/game/persistence/save";
import { tileToWorld, type Camera } from "../../src/game/renderer/scene";

/**
 * RW3D #151 / #229 (U02): "Focused inputs suppress shortcuts." The window keydown
 * handler in App.tsx returns early when event.target is an INPUT / TEXTAREA /
 * SELECT or isContentEditable, so a save code typed into the yard record can
 * never steer the shell (digits 1-6 navigate, arrows pan, +/- zoom, n/N cycles
 * the build ghost or the move destination).
 *
 * Every suppression assertion is paired with a body-target CONTROL proving the
 * same key DOES navigate when no field holds it — the test detects navigation,
 * and suppression is what blocks it. Fixture yards are seeded with the engine's
 * own applyCommand and persisted through encodeSave exactly like place-53 /
 * onboard-64 (helpers copied, those files untouched); `lastSeenMs` is the
 * reference clock so no offline catch-up moves the yard. Deterministic jsdom,
 * no real timers beyond the renderer's own requestAnimationFrame stamp.
 */

// React 18's act() needs the environment flag; jsdom does not set it itself.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const sumStore = (store: Record<string, number>): number =>
  Object.values(store).reduce((total, qty) => total + qty, 0);

/** A progressed yard (tutorial complete) with one sorter, built by the real engine. */
function yardState(): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  let seq = 0;
  const send = (body: CommandBody) =>
    applyCommand(state, { ...body, id: `seed${(seq += 1)}` } as Command);
  for (const item of BLUEPRINTS.sorter.buildCost) {
    state.store[item.resource] = (state.store[item.resource] ?? 0) + item.qty;
  }
  state.storeUnits = sumStore(state.store);
  send({ type: "machine.build", blueprint: "sorter", tile: 8 });
  state.store.scrap = 100;
  state.storeUnits = sumStore(state.store);
  return state;
}

/** Persist a seeded yard through the game's own encoder; the reference clock skips catch-up. */
function storeFromState(state: SimState): GameStore {
  const seen = Date.now();
  const text = encodeSave(state, seen, { ...DEFAULT_SETTINGS, muted: true });
  const map = new Map<string, string>([[SAVE_KEY, text]]);
  return createStore({
    storage: {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => map.set(key, value),
    },
    now: () => Date.now(),
  });
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

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}
const click = (label: string) => act(() => findButton(label)?.click());
const begin = () => click("Begin recovery");

const canvas = () => document.querySelector("canvas") as HTMLCanvasElement;
function cam(): Camera {
  const [x, y, scale] = (canvas().dataset.cam ?? "").split(",").map(Number);
  return { x, y, scale };
}
async function frame() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
type PointerType = "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
function firePointer(type: PointerType, id: number, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: id });
  act(() => {
    canvas().dispatchEvent(event);
  });
}
function screenOf(worldX: number, worldY: number) {
  const c = cam();
  return { x: (worldX - c.x) * c.scale, y: (worldY - c.y) * c.scale };
}
const tap = (x: number, y: number, id = 1) => {
  firePointer("pointerdown", id, x, y);
  firePointer("pointerup", id, x, y);
};
const tapWorld = (worldX: number, worldY: number, id = 1) => {
  const p = screenOf(worldX, worldY);
  tap(p.x, p.y, id);
};
const tapTile = (tile: number, id = 1) => tapWorld(tileToWorld(tile).x, tileToWorld(tile).y, id);

/** Dispatch a cancelable keydown ON a specific target so event.target is that node. */
function pressOn(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const catalog = () => document.querySelector<HTMLElement>(".catalog");
const slotPressed = (slot: string) =>
  document.querySelector(`[data-slot="${slot}"]`)?.getAttribute("aria-pressed");
const yardPanel = () => document.querySelector('.panel[aria-label="Yard record"]');
const moveDest = () =>
  document.querySelector('[data-flow="move"] .place-strip__dest')?.textContent ?? "";

/**
 * Walk the real painted path to the focused import textarea:
 * Settings gear -> Yard record row's Open face -> Import page. The yard record
 * is enabled because the fixture yard is past the tutorial (tutorial >= 9).
 */
function openYardImport(): HTMLTextAreaElement {
  click("Settings");
  const row = [...document.querySelectorAll(".panel__row")].find(
    (node) => node.querySelector("dt")?.textContent === "Yard record"
  );
  expect(row, "Settings must carry the Yard record row").toBeDefined();
  act(() => row!.querySelector("button")!.click());
  expect(yardPanel(), "the yard record panel must be open").not.toBeNull();
  click("Import");
  const field = document.querySelector<HTMLTextAreaElement>("#rustwake-save-import");
  expect(field, "the import page must paint its paste textarea").not.toBeNull();
  act(() => field!.focus());
  expect(document.activeElement).toBe(field);
  return field!;
}

/**
 * jsdom ships no 2D canvas; the renderer only writes, so a write-only proxy lets the real
 * paint-truth loop stamp `canvas.dataset.cam` (the same attribute the chromium probes read).
 */
const writeOnlyContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (prop === "canvas" ? undefined : () => undefined),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  document.body.innerHTML = "";
  for (const style of [...document.head.querySelectorAll("style")]) style.remove();
  for (const raw of [stylesRaw, hudCssRaw, shellRaw, buildCssRaw, placeCssRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(writeOnlyContext);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("U02 focused inputs suppress shell shortcuts", () => {
  it("digit 1 in the focused import textarea never opens the build catalog; on body it does", () => {
    mount(storeFromState(yardState()));
    begin();
    const field = openYardImport();
    expect(slotPressed("build")).toBe("false");

    const suppressed = pressOn(field, "1");
    expect(suppressed.defaultPrevented).toBe(false);
    expect(catalog()).toBeNull();
    expect(slotPressed("build")).toBe("false");
    expect(yardPanel()).not.toBeNull(); // the record stays the painted surface

    // Control: the same key on a non-field target DOES navigate.
    const control = pressOn(document.body, "1");
    expect(control.defaultPrevented).toBe(true);
    expect(catalog()).not.toBeNull();
    expect(slotPressed("build")).toBe("true");
  });

  it("digit 2 in the focused import textarea never roots the Routes panel; on body it does", () => {
    mount(storeFromState(yardState()));
    begin();
    const field = openYardImport();
    expect(slotPressed("routes")).toBe("false");

    const suppressed = pressOn(field, "2");
    expect(suppressed.defaultPrevented).toBe(false);
    expect(slotPressed("routes")).toBe("false");
    expect(yardPanel()).not.toBeNull();

    const control = pressOn(document.body, "2");
    expect(control.defaultPrevented).toBe(true);
    expect(slotPressed("routes")).toBe("true");
    expect(yardPanel()).toBeNull(); // a toolbar destination roots the stack
  });

  it("ArrowLeft in the focused import textarea never pans the camera; on body it does", async () => {
    mount(storeFromState(yardState()));
    begin();
    await frame();
    const field = openYardImport();
    const before = cam();

    const suppressed = pressOn(field, "ArrowLeft");
    await frame();
    expect(suppressed.defaultPrevented).toBe(false);
    expect(cam()).toEqual(before);

    const control = pressOn(document.body, "ArrowLeft");
    await frame();
    expect(control.defaultPrevented).toBe(true);
    expect(cam().x).not.toBe(before.x);
  });

  it("n in the focused import textarea never cycles the move destination; on body it does", async () => {
    const store = storeFromState(yardState());
    mount(store);
    begin();
    await frame();
    // Arm the real move flow first: N is only live while a destination preview is up.
    tapTile(8);
    click("Move");
    expect(moveDest()).toContain("Destination: cell");
    const field = openYardImport();
    const first = moveDest();
    const scrapBefore = store.getState().store.scrap ?? 0;

    const suppressed = pressOn(field, "n");
    expect(suppressed.defaultPrevented).toBe(false);
    expect(moveDest()).toBe(first);
    expect(store.getState().store.scrap ?? 0).toBe(scrapBefore);
    expect(store.getState().machines[0].tile).toBe(8);

    const control = pressOn(document.body, "n");
    expect(control.defaultPrevented).toBe(true);
    expect(moveDest()).not.toBe(first);
    expect(store.getState().store.scrap ?? 0).toBe(scrapBefore); // cycling never spends
  });

  it("the Routes form's INPUT and SELECT targets suppress digits and arrows too", async () => {
    mount(storeFromState(yardState()));
    begin();
    await frame();
    // Open Routes through the real keyboard path (also the navigation control).
    const opened = pressOn(document.body, "2");
    expect(opened.defaultPrevented).toBe(true);
    expect(slotPressed("routes")).toBe("true");
    // The bay-capacity rows paint inline `.road-form`s with inputs only; the
    // new-job form is the one carrying the source/destination/material selects.
    const form = [...document.querySelectorAll(".road-form")].find((node) =>
      node.querySelector("select")
    );
    expect(form, "the Routes destination must paint the road-jobs form").toBeDefined();
    const input = form!.querySelector<HTMLInputElement>('input[type="number"]');
    const select = form!.querySelector<HTMLSelectElement>("select");
    expect(input).not.toBeNull();
    expect(select).not.toBeNull();
    const before = cam();

    act(() => input!.focus());
    for (const key of ["1", "n", "ArrowLeft"]) {
      const event = pressOn(input!, key);
      expect(event.defaultPrevented, `INPUT suppresses ${key}`).toBe(false);
    }
    await frame();
    expect(cam()).toEqual(before);
    expect(catalog()).toBeNull();
    expect(slotPressed("routes")).toBe("true");

    act(() => select!.focus());
    for (const key of ["1", "n", "ArrowLeft"]) {
      const event = pressOn(select!, key);
      expect(event.defaultPrevented, `SELECT suppresses ${key}`).toBe(false);
    }
    await frame();
    expect(cam()).toEqual(before);
    expect(catalog()).toBeNull();
    expect(slotPressed("routes")).toBe("true");

    // Control: the same digit on body still navigates from the Routes surface.
    const control = pressOn(document.body, "1");
    expect(control.defaultPrevented).toBe(true);
    expect(catalog()).not.toBeNull();
  });

  it("a contentEditable target suppresses shortcuts as well", async () => {
    mount(storeFromState(yardState()));
    begin();
    await frame();
    // The shipped UI has no contentEditable surface, so this is a synthetic probe
    // of the handler's isContentEditable branch. jsdom does not compute
    // isContentEditable from the attribute, so the browser-computed value is
    // defined explicitly — the handler reads exactly this property.
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    Object.defineProperty(editable, "isContentEditable", { value: true, configurable: true });
    document.body.appendChild(editable);
    act(() => editable.focus());
    const before = cam();

    for (const key of ["1", "n", "ArrowLeft"]) {
      const event = pressOn(editable, key);
      expect(event.defaultPrevented, `contentEditable suppresses ${key}`).toBe(false);
    }
    await frame();
    expect(cam()).toEqual(before);
    expect(catalog()).toBeNull();
    expect(slotPressed("build")).toBe("false");

    const control = pressOn(document.body, "1");
    expect(control.defaultPrevented).toBe(true);
    expect(catalog()).not.toBeNull();
  });
});
