import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { TUNING } from "../../src/game/content/defs";
import {
  CAMERA_MAX_SCALE,
  CAMERA_MIN_SCALE,
} from "../../src/game/renderer/camera";
import {
  WRECK_POSITION,
  fitCamera,
  screenToWorld,
  tileToWorld,
  type Camera,
} from "../../src/game/renderer/scene";

/**
 * UI-RESET-50 (G2 wave 2): the interaction contract, exercised through the real
 * App in jsdom.
 *
 * jsdom paints no boxes, so the shell fit falls back to the legacy camera
 * (scale 1.4, world centre) and the view is 0x0 — every screen coordinate below
 * is derived from the camera's own paint-truth stamp (`canvas.dataset.cam`),
 * the same attribute the headless chromium probes read. What is pinned here is
 * the behaviour: only a cleared tap selects / salvages / places; drag, pinch
 * and cancel cannot; zoom shares one clamp range across buttons, wheel and
 * keys; hit testing follows the zoom; and a layout change keeps the player's
 * intent until Reset retires it. The pixel geometry at real viewports is the
 * chromium pass in work/evidence/UI-RESET-50/probe-camera-50.mjs.
 */

// React 18's act() needs the environment flag; jsdom does not set it itself.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function mount(store: GameStore): HTMLElement {
  const host = document.createElement("div");
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

function begin() {
  act(() => findButton("Begin recovery")?.click());
}

const canvas = () => document.querySelector("canvas") as HTMLCanvasElement;

/** The camera paint truth the render loop stamps on every change. */
function cam(): Camera {
  const [x, y, scale] = (canvas().dataset.cam ?? "").split(",").map(Number);
  return { x, y, scale };
}

/** Let the render loop run one frame (it re-arms itself each time). */
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

const tap = (x: number, y: number, id = 1) => {
  firePointer("pointerdown", id, x, y);
  firePointer("pointerup", id, x, y);
};

/** jsdom's view is 0x0, so the world→screen map is the camera alone. */
function screenOf(worldX: number, worldY: number) {
  const c = cam();
  return { x: (worldX - c.x) * c.scale, y: (worldY - c.y) * c.scale };
}

const tapWorld = (worldX: number, worldY: number, id = 1) => {
  const p = screenOf(worldX, worldY);
  tap(p.x, p.y, id);
};

const pressKey = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

function wheel(deltaY: number, x = 0, y = 0) {
  act(() => {
    canvas().dispatchEvent(
      new WheelEvent("wheel", { deltaY, clientX: x, clientY: y, bubbles: true, cancelable: true })
    );
  });
}

const click = (label: string) => act(() => findButton(label)?.click());

/** Force the render loop's layout-change branch: the canvas box "moved". */
function forceLayoutChange() {
  act(() => {
    canvas().width = 123;
  });
}

const panelTitles = () =>
  [...document.querySelectorAll(".panel")].map((node) =>
    (node.querySelector(".panel__title")?.textContent ?? "").trim()
  );

const scrap = (store: GameStore) => store.getState().store["scrap"] ?? 0;

/**
 * jsdom ships no 2D canvas, so the render effect would bail before stamping the
 * camera. The renderer only ever writes to the context (no measureText, no
 * gradients, no read-back), so a write-only proxy lets the real paint-truth
 * loop run unmodified.
 */
const writeOnlyContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (prop === "canvas" ? undefined : () => undefined),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(writeOnlyContext);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("G2 camera paint truth", () => {
  it("stamps the shell fit on the canvas once the yard is entered", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    // jsdom has no chrome boxes: the legacy fit is the deterministic fallback.
    const fitted = fitCamera({ width: 0, height: 0 });
    expect(cam().x).toBeCloseTo(fitted.x, 2);
    expect(cam().y).toBeCloseTo(fitted.y, 2);
    expect(cam().scale).toBeCloseTo(fitted.scale, 3);
  });
});

describe("G2 tap vs drag vs pinch vs cancel", () => {
  it("a clean tap on the wreck salvages", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    tapWorld(WRECK_POSITION.x, WRECK_POSITION.y);
    expect(scrap(store)).toBe(5);
  });

  it("a drag across the wreck never salvages, even ending on it", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    const p = screenOf(WRECK_POSITION.x, WRECK_POSITION.y);
    firePointer("pointerdown", 1, p.x, p.y);
    firePointer("pointermove", 1, p.x + 40, p.y);
    firePointer("pointermove", 1, p.x, p.y);
    firePointer("pointerup", 1, p.x, p.y);
    expect(scrap(store)).toBe(0);
  });

  it("a cancelled press never salvages; the late lift is inert; a fresh tap works", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    const p = screenOf(WRECK_POSITION.x, WRECK_POSITION.y);
    firePointer("pointerdown", 1, p.x, p.y);
    firePointer("pointercancel", 1, p.x, p.y);
    firePointer("pointerup", 1, p.x, p.y);
    expect(scrap(store)).toBe(0);
    tapWorld(WRECK_POSITION.x, WRECK_POSITION.y);
    expect(scrap(store)).toBe(5);
  });

  it("a pinch never salvages on either lift, and zooms the camera", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    const before = cam().scale;
    const p = screenOf(WRECK_POSITION.x, WRECK_POSITION.y);
    firePointer("pointerdown", 1, p.x, p.y);
    firePointer("pointerdown", 2, p.x + 40, p.y);
    firePointer("pointermove", 2, p.x + 80, p.y);
    firePointer("pointerup", 2, p.x + 80, p.y);
    firePointer("pointerup", 1, p.x, p.y);
    expect(scrap(store)).toBe(0);
    await frame();
    expect(cam().scale).toBeGreaterThan(before);
    // Hit testing follows the zoom: a fresh tap at the wreck's NEW screen
    // position still salvages.
    tapWorld(WRECK_POSITION.x, WRECK_POSITION.y);
    expect(scrap(store)).toBe(5);
  });

  it("a cancel mid-pinch spoils the remaining lift too", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    const p = screenOf(WRECK_POSITION.x, WRECK_POSITION.y);
    firePointer("pointerdown", 1, p.x, p.y);
    firePointer("pointerdown", 2, p.x + 40, p.y);
    firePointer("pointercancel", 1, p.x, p.y);
    firePointer("pointerup", 2, p.x + 40, p.y);
    expect(scrap(store)).toBe(0);
  });
});

describe("G2 zoom controls, wheel and keys", () => {
  it("the visible buttons step the shared range and clamp at both ends", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    const start = cam().scale;
    click("Zoom in");
    await frame();
    expect(cam().scale).toBeCloseTo(start * 1.25, 3);
    click("Zoom out");
    click("Zoom out");
    await frame();
    expect(cam().scale).toBeCloseTo(CAMERA_MIN_SCALE, 3);
    for (let i = 0; i < 20; i += 1) click("Zoom in");
    await frame();
    expect(cam().scale).toBeCloseTo(CAMERA_MAX_SCALE, 3);
  });

  it("Reset view restores the shell fit and retires the intent", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    click("Zoom in");
    click("Zoom in");
    await frame();
    expect(cam().scale).toBeGreaterThan(1.4);
    click("Reset view");
    await frame();
    // jsdom's zero boxes send the reset through the window-size fallback.
    const fitted = fitCamera({ width: window.innerWidth, height: window.innerHeight });
    expect(cam().scale).toBeCloseTo(fitted.scale, 3);
    expect(cam().x).toBeCloseTo(fitted.x, 2);
    expect(cam().y).toBeCloseTo(fitted.y, 2);
    // Intent retired: the next layout change refits fresh instead of keeping 4.
    forceLayoutChange();
    await frame();
    expect(cam().scale).toBeCloseTo(1.4, 3);
  });

  it("the wheel zooms at the cursor and clamps at both ends", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    // Anchor invariance: the world point under the cursor stays under it.
    const before = screenToWorld(cam(), { width: 0, height: 0 }, 30, 20);
    wheel(-120, 30, 20);
    await frame();
    const after = screenToWorld(cam(), { width: 0, height: 0 }, 30, 20);
    // The stamp rounds x/y to 0.01 and scale to 0.001; the exact anchor
    // invariance is pinned to 1e-9 in tests/renderer/camera-50.test.ts.
    expect(after.x).toBeCloseTo(before.x, 2);
    expect(after.y).toBeCloseTo(before.y, 2);
    expect(cam().scale).toBeGreaterThan(1.4);
    for (let i = 0; i < 30; i += 1) wheel(-120);
    await frame();
    expect(cam().scale).toBeCloseTo(CAMERA_MAX_SCALE, 3);
    for (let i = 0; i < 40; i += 1) wheel(120);
    await frame();
    expect(cam().scale).toBeCloseTo(CAMERA_MIN_SCALE, 3);
  });

  it("keyboard +/- zoom and arrows pan the camera", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    pressKey("+");
    await frame();
    expect(cam().scale).toBeCloseTo(1.4 * 1.25, 3);
    pressKey("-");
    await frame();
    expect(cam().scale).toBeCloseTo(1.4, 3);
    const x0 = cam().x;
    pressKey("ArrowLeft");
    await frame();
    expect(cam().x).toBeLessThan(x0);
    pressKey("ArrowRight");
    await frame();
    expect(cam().x).toBeCloseTo(x0, 2);
  });
});

describe("G2 camera intent across layout changes", () => {
  it("a layout change keeps the player's zoom and centre", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    click("Zoom in");
    click("Zoom in");
    pressKey("ArrowLeft");
    await frame();
    const intended = cam();
    expect(intended.scale).toBeGreaterThan(1.4);
    forceLayoutChange();
    await frame();
    expect(cam().scale).toBeCloseTo(intended.scale, 3);
    expect(cam().x).toBeCloseTo(intended.x, 2);
    expect(cam().y).toBeCloseTo(intended.y, 2);
  });

  it("without intent a layout change refits fresh", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    forceLayoutChange();
    await frame();
    expect(cam().scale).toBeCloseTo(1.4, 3);
    expect(cam().x).toBeCloseTo(96, 2);
  });

  it("an open inspector keeps the selection and the camera intent", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    const state = store.getState();
    state.tutorial = 9;
    state.store["scrap"] = 100;
    state.store["ferrous"] = 50;
    state.storeUnits = 150;
    act(() => store.step(1));
    act(() => {
      store.dispatch({ id: "e1", type: "machine.build", blueprint: "sorter", tile: 35 });
    });
    await frame();
    tapWorld(tileToWorld(35).x, tileToWorld(35).y);
    expect(panelTitles()).toContain("Scrap sorter");
    click("Zoom in");
    await frame();
    const intended = cam();
    forceLayoutChange(); // the inspector/resize refit path
    await frame();
    expect(panelTitles()).toContain("Scrap sorter");
    expect(cam().scale).toBeCloseTo(intended.scale, 3);
  });
});

describe("G2 edge-cell selection and placement", () => {
  it("taps the corner machine into the inspector and empty ground out of it", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    const state = store.getState();
    state.tutorial = 9;
    state.store["scrap"] = 100;
    state.store["ferrous"] = 50;
    state.storeUnits = 150;
    act(() => store.step(1));
    act(() => {
      store.dispatch({ id: "e1", type: "machine.build", blueprint: "sorter", tile: 35 });
    });
    await frame();
    // Tile 35 is the bottom-right corner cell of the yard.
    tapWorld(tileToWorld(35).x, tileToWorld(35).y);
    expect(panelTitles()).toContain("Scrap sorter");
    // Empty ground inside the world clears the selection.
    tapWorld(tileToWorld(20).x, tileToWorld(20).y);
    expect(panelTitles()).toEqual([]);
  });

  it("places a build on the corner cell through the tap ghost", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    for (let i = 0; i < 6; i += 1) {
      click("Salvage");
      act(() => store.step(TUNING.manualPulseTicks));
    }
    click("Repair drone");
    act(() => store.step(262));
    await frame();
    click("Build Scrap sorter"); // enters build mode, ghost on the default tile
    expect(findButton("Cancel")).toBeDefined();
    tapWorld(tileToWorld(35).x, tileToWorld(35).y);
    click("Build Scrap sorter"); // the place face commits the ghost
    expect(store.getState().machines.some((m) => m.tile === 35)).toBe(true);
  });

  it("a drag in build mode pans under the ghost but never places", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    for (let i = 0; i < 6; i += 1) {
      click("Salvage");
      act(() => store.step(TUNING.manualPulseTicks));
    }
    click("Repair drone");
    act(() => store.step(262));
    await frame();
    click("Build Scrap sorter");
    const from = screenOf(tileToWorld(35).x, tileToWorld(35).y);
    const to = screenOf(tileToWorld(28).x, tileToWorld(28).y);
    firePointer("pointerdown", 1, from.x, from.y);
    firePointer("pointermove", 1, to.x, to.y);
    firePointer("pointerup", 1, to.x, to.y);
    expect(store.getState().machines.length).toBe(0); // no accidental placement
    // The world pans with the finger, so the ghost stays on the world cell the
    // drag began over (35) — the screen destination is not a placement.
    click("Build Scrap sorter");
    expect(store.getState().machines.some((m) => m.tile === 35)).toBe(true);
    expect(store.getState().machines.some((m) => m.tile === 28)).toBe(false);
  });

  it("a cancelled build gesture never places", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    for (let i = 0; i < 6; i += 1) {
      click("Salvage");
      act(() => store.step(TUNING.manualPulseTicks));
    }
    click("Repair drone");
    act(() => store.step(262));
    await frame();
    click("Build Scrap sorter");
    const p = screenOf(tileToWorld(35).x, tileToWorld(35).y);
    firePointer("pointerdown", 1, p.x, p.y);
    firePointer("pointercancel", 1, p.x, p.y);
    firePointer("pointerup", 1, p.x, p.y);
    expect(store.getState().machines.length).toBe(0);
  });
});
