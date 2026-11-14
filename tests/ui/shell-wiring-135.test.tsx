import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import {
  fitCamera,
  pickWorld3D,
  projectWorld3D,
  tileToWorld,
  world3DStatus,
  worldToScreen,
  WRECK_POSITION,
  type Camera,
} from "../../src/game/renderer/scene";
import { refitCamera } from "../../src/game/renderer/camera";
import { DOCK_TILE } from "../../src/game/simulation/commands";
import { SHELL_GUTTER_PX, SHELL_ZOOM_GUTTER_PX } from "../../src/ui/shell/layout";

/**
 * RW3D #135 (rounds 7-8): the three renderer wiring deltas, pinned through the
 * real App in jsdom after the rebase onto the #198 three.js renderer (dff3e35).
 *
 * Delta 2 — the measured chrome band (in-flow phone sheet / absolute desktop
 * inspector) flows through fitCamera(view, insets) and its returned camera into
 * refitCamera, with the player's zoom intent preserved across the refit. This
 * chain already exists in App (fitToShell -> fitCamera -> refitCamera); these
 * tests pin it against the rebased renderer so a future edit cannot silently
 * drop the insets. fitCamera is byte-identical across the rebase.
 *
 * Delta 1 — the tap path raycasts the last-synced three.js world (pickWorld3D)
 * before the ground inverse; null (jsdom / no WebGL / context loss) falls back
 * to screenToWorld + pickTarget byte-identically, and the -1 (wreck) / -2 (dock)
 * ids pass through the `??` unchanged.
 *
 * Delta 3 — the selection anchor is projected through the renderer camera
 * (projectWorld3D, the scene.ts bridge to cameraRig.projectToScreen via
 * YardWorld.projectWorld) and stamped on canvas.dataset.anchor, with
 * worldToScreen as the null fallback; canvas.dataset.world3d carries the
 * world3DStatus provenance. The visible context-loss banner stays drawScene's.
 *
 * The deltas 1/3 bridge is additive in renderer/scene.ts (the sanctioned
 * exception): src/ui never imports renderer/three, so the frozen
 * tests/renderer/boundary-3d.test.ts stays green.
 *
 * fitCamera/refitCamera/pickWorld3D/projectWorld3D/world3DStatus are spied WITH
 * their real implementations so the assertions stay honest; the mocked-path
 * tests override one spy at a time. jsdom paints no boxes by default, so the
 * frozen camera-50 / logistics-59 fallback behaviour is untouched; the insets
 * tests mock the chrome rects and the parent box explicitly.
 */

vi.mock("../../src/game/renderer/scene", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/renderer/scene")>();
  return {
    ...actual,
    fitCamera: vi.fn(actual.fitCamera),
    pickWorld3D: vi.fn(actual.pickWorld3D),
    projectWorld3D: vi.fn(actual.projectWorld3D),
    world3DStatus: vi.fn(actual.world3DStatus),
  };
});

vi.mock("../../src/game/renderer/camera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/renderer/camera")>();
  return { ...actual, refitCamera: vi.fn(actual.refitCamera) };
});

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

let root: ReturnType<typeof createRoot> | null = null;

function mount(store: GameStore): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<App store={store} />);
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

const tap = (x: number, y: number, id = 1) => {
  firePointer("pointerdown", id, x, y);
  firePointer("pointerup", id, x, y);
};

/** The render loop's view: the parent box in CSS px (0x0 in jsdom unless mocked). */
function viewOf() {
  return {
    width: canvas().parentElement?.clientWidth ?? 0,
    height: canvas().parentElement?.clientHeight ?? 0,
  };
}

function screenOf(worldX: number, worldY: number) {
  const c = cam();
  const view = viewOf();
  return { x: (worldX - c.x) * c.scale + view.width / 2, y: (worldY - c.y) * c.scale + view.height / 2 };
}

const tapWorld = (worldX: number, worldY: number, id = 1) => {
  const p = screenOf(worldX, worldY);
  tap(p.x, p.y, id);
};

const click = (label: string) => act(() => findButton(label)?.click());

function forceLayoutChange() {
  act(() => {
    canvas().width = 123;
  });
}

const panelTitles = () =>
  [...document.querySelectorAll(".panel")].map((node) =>
    (node.querySelector(".panel__title")?.textContent ?? "").trim()
  );

/** Build one sorter on the corner cell (tile 35) so a tap can open its panel. */
function yardWithSorter(store: GameStore): number {
  const state = store.getState();
  state.tutorial = 9;
  state.store["scrap"] = 100;
  state.store["ferrous"] = 50;
  state.storeUnits = 150;
  act(() => store.step(1));
  act(() => {
    store.dispatch({ id: "w1", type: "machine.build", blueprint: "sorter", tile: 35 });
  });
  const m = store.getState().machines.find((mm) => mm.tile === 35);
  if (!m) throw new Error("sorter was not built");
  return m.id;
}

/**
 * Same write-only 2D context seam as the frozen camera-50 tests: the render
 * loop runs unmodified, the WebGL probe fails, and blitWorld3D returns false
 * without touching the context.
 */
const writeOnlyContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (prop === "canvas" ? undefined : () => undefined),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

function box(partial: Partial<DOMRect>): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({}),
    ...partial,
  } as DOMRect;
}

/** Mock the painted chrome band on a 1440x900 desktop-sized parent box. */
function mockChrome() {
  const parent = canvas().parentElement as HTMLElement;
  Object.defineProperty(parent, "clientWidth", { configurable: true, value: 1440 });
  Object.defineProperty(parent, "clientHeight", { configurable: true, value: 900 });
  vi.spyOn(document.querySelector(".hud__lead") as Element, "getBoundingClientRect").mockReturnValue(
    box({ bottom: 100, height: 100, width: 1440, right: 1440 })
  );
  vi.spyOn(document.querySelector(".dock") as Element, "getBoundingClientRect").mockReturnValue(
    box({ top: 800, bottom: 900, height: 100, width: 1440, right: 1440 })
  );
  vi.spyOn(document.querySelector(".toolbar") as Element, "getBoundingClientRect").mockReturnValue(
    box({ top: 832, bottom: 900, height: 68, width: 1440, right: 1440 })
  );
}

/**
 * The last fitToShell call at a given region width. App's cameraRef initializer
 * `useRef(fitCamera({width:360,height:640}))` re-evaluates fitCamera on EVERY
 * render (a React footgun), so an opening panel adds a {360,640} call with no
 * insets AFTER the render loop's inset-aware fit. Filtering by the shell region
 * width isolates the genuine fitToShell calls from that initializer noise.
 */
function lastShellFit(regionWidth: number) {
  const calls = vi.mocked(fitCamera).mock.calls;
  const results = vi.mocked(fitCamera).mock.results;
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0].width === regionWidth) {
      return { view: calls[i][0], insets: calls[i][1], value: results[i].value as Camera };
    }
  }
  throw new Error(`no fitToShell call at region width ${regionWidth}`);
}

beforeEach(async () => {
  document.body.innerHTML = "";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(writeOnlyContext);
  // restoreAllMocks resets the factory spies' implementations; re-arm the real
  // math every test so the camera assertions never run against a stub.
  const actualScene = await vi.importActual<typeof import("../../src/game/renderer/scene")>(
    "../../src/game/renderer/scene"
  );
  const actualCamera = await vi.importActual<typeof import("../../src/game/renderer/camera")>(
    "../../src/game/renderer/camera"
  );
  vi.mocked(fitCamera).mockImplementation(actualScene.fitCamera);
  vi.mocked(refitCamera).mockImplementation(actualCamera.refitCamera);
  vi.mocked(pickWorld3D).mockImplementation(actualScene.pickWorld3D);
  vi.mocked(projectWorld3D).mockImplementation(actualScene.projectWorld3D);
  vi.mocked(world3DStatus).mockImplementation(actualScene.world3DStatus);
  vi.mocked(fitCamera).mockClear();
  vi.mocked(refitCamera).mockClear();
  vi.mocked(pickWorld3D).mockClear();
  vi.mocked(projectWorld3D).mockClear();
  vi.mocked(world3DStatus).mockClear();
});

afterEach(() => {
  // Unmount for real: the render loop's rAF must not outlive the test and run
  // against restored (implementation-less) mocks.
  if (root !== null) {
    const dying = root;
    root = null;
    act(() => dying.unmount());
  }
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).matchMedia;
});

describe("RW3D #135 delta 2: chrome insets flow through fitCamera/refitCamera", () => {
  it("passes the measured band insets into fitCamera and its result into refitCamera", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const regionWidth = 1440 - SHELL_ZOOM_GUTTER_PX;
    const fit = lastShellFit(regionWidth);
    expect(fit.view).toEqual({ width: regionWidth, height: 900 });
    expect(fit.insets).toEqual({
      top: 100 + SHELL_GUTTER_PX,
      bottom: 100 + SHELL_GUTTER_PX,
      left: 0,
      right: SHELL_ZOOM_GUTTER_PX,
    });
    // The very object fitCamera returned (post band-fit) is what refitCamera gets.
    const refitCalls = vi.mocked(refitCamera).mock.calls;
    expect(refitCalls[refitCalls.length - 1][1]).toBe(fit.value);
    // No player intent yet: the paint truth IS the inset-aware fit.
    expect(cam().scale).toBeCloseTo(fit.value.scale, 3);
    expect(cam().y).toBeCloseTo(fit.value.y, 2);
  });

  it("an opening sheet deepens the bottom band through the same chain", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const before = cam();
    tapWorld(tileToWorld(35).x, tileToWorld(35).y);
    expect(panelTitles()).toContain("Scrap sorter");
    // jsdom has no matchMedia: the panel paints as the in-flow phone sheet.
    const sheet = document.querySelector(".shell-sheet") as Element;
    expect(sheet).not.toBeNull();
    vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue(
      box({ top: 585, height: 315, width: 390, right: 390 })
    );
    forceLayoutChange();
    await frame();
    const fit = lastShellFit(1440 - SHELL_ZOOM_GUTTER_PX);
    expect(fit.insets).toEqual({
      top: 100 + SHELL_GUTTER_PX,
      bottom: 900 - 585 + SHELL_GUTTER_PX,
      left: 0,
      right: SHELL_ZOOM_GUTTER_PX,
    });
    const refitCalls = vi.mocked(refitCamera).mock.calls;
    expect(refitCalls[refitCalls.length - 1][1]).toBe(fit.value);
    // The band shrank, so the fresh fit zooms out to keep the yard inside it.
    expect(cam().scale).toBeLessThan(before.scale);
  });

  it("keeps the player's zoom intent through an inset-driven refit", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    tapWorld(tileToWorld(35).x, tileToWorld(35).y);
    const sheet = document.querySelector(".shell-sheet") as Element;
    vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue(
      box({ top: 585, height: 315, width: 390, right: 390 })
    );
    forceLayoutChange();
    await frame();
    click("Zoom in");
    await frame();
    const intended = cam();
    forceLayoutChange();
    await frame();
    expect(cam().scale).toBeCloseTo(intended.scale, 3);
  });

  it("the desktop inspector reserves the right gutter through fitCamera", async () => {
    // jsdom ships no matchMedia; declare the desktop mode the CSS would paint.
    (window as unknown as Record<string, unknown>).matchMedia = (query: string) => ({
      matches: query === "(min-width: 1024px)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    tapWorld(tileToWorld(35).x, tileToWorld(35).y);
    expect(panelTitles()).toContain("Scrap sorter");
    const inspector = document.querySelector(".shell-inspector") as HTMLElement;
    expect(inspector).not.toBeNull();
    // chromeInsets reads computed position; jsdom has no stylesheet, so the
    // absolute docking the desktop CSS applies is declared inline here.
    inspector.style.position = "absolute";
    vi.spyOn(inspector, "getBoundingClientRect").mockReturnValue(
      box({ left: 1100, width: 340, top: 106, height: 688, right: 1440, bottom: 794 })
    );
    forceLayoutChange();
    await frame();
    const right = 1440 - 1100 + SHELL_GUTTER_PX;
    const fit = lastShellFit(1440 - right);
    expect(fit.view).toEqual({ width: 1440 - right, height: 900 });
    expect(fit.insets).toEqual({
      top: 100 + SHELL_GUTTER_PX,
      bottom: 100 + SHELL_GUTTER_PX,
      left: 0,
      right,
    });
    const refitCalls = vi.mocked(refitCamera).mock.calls;
    expect(refitCalls[refitCalls.length - 1][1]).toBe(fit.value);
  });
});

describe("RW3D #135 delta 1: tap selection raycasts the 3D world first", () => {
  it("falls back to screenToWorld + pickTarget when the real 3D pick is null (jsdom)", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const w = tileToWorld(35);
    const p = screenOf(w.x, w.y);
    tap(p.x, p.y);
    // The raycast was attempted with the tap's canvas-local pixels...
    expect(vi.mocked(pickWorld3D)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pickWorld3D)).toHaveBeenCalledWith(p.x, p.y);
    // ...returned null (jsdom's WebGL probe fails), and the ground-inverse
    // fallback still opened the sorter panel — the frozen path, byte-identical.
    expect(vi.mocked(pickWorld3D).mock.results[0].value).toBeNull();
    expect(panelTitles()).toContain("Scrap sorter");
  });

  it("the dock fallback still opens the store (id -2 passes through ??)", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const w = tileToWorld(DOCK_TILE);
    tapWorld(w.x, w.y);
    expect(panelTitles()).toContain("Yard store");
  });

  it("a mocked 3D body hit selects where the ground fallback finds nothing", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    const sorterId = yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    // Precondition: (40, 40) is outside every pickable body — the real null
    // pick + ground inverse clears the stack instead of opening a panel.
    tap(40, 40);
    expect(panelTitles()).toEqual([]);
    vi.mocked(pickWorld3D).mockReturnValue({ id: sorterId, point: { x: 0, y: 0, z: 0 } });
    tap(40, 40);
    expect(panelTitles()).toContain("Scrap sorter");
  });

  it("a 3D hit without an id falls back to the ground inverse", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    vi.mocked(pickWorld3D).mockReturnValue({ id: null, point: { x: 0, y: 0, z: 0 } });
    const w = tileToWorld(35);
    tapWorld(w.x, w.y);
    expect(panelTitles()).toContain("Scrap sorter");
  });

  it("a mocked dock hit (-2) opens the store panel", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    vi.mocked(pickWorld3D).mockReturnValue({ id: -2, point: { x: 0, y: 0, z: 0 } });
    tap(40, 40);
    expect(panelTitles()).toContain("Yard store");
  });

  it("a mocked wreck hit (-1) selects the wreck without painting a host panel", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    vi.mocked(pickWorld3D).mockReturnValue({
      id: -1,
      point: { x: WRECK_POSITION.x, y: 0, z: WRECK_POSITION.y },
    });
    tap(40, 40);
    await frame();
    // The wreck occupies a stack layer but paints no host panel (hostKey null);
    // the delta-3 anchor stamp is the paint truth that the selection landed.
    expect(panelTitles()).toEqual([]);
    const expected = worldToScreen(cam(), viewOf(), WRECK_POSITION.x, WRECK_POSITION.y);
    expect(canvas().dataset.anchor).toBe(`${expected.x.toFixed(1)},${expected.y.toFixed(1)}`);
  });

  it("build-mode taps never raycast (the ground inverse places the ghost)", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const build = document.querySelector('[data-slot="build"]') as HTMLButtonElement;
    act(() => build.click());
    tap(700, 400);
    expect(vi.mocked(pickWorld3D)).not.toHaveBeenCalled();
  });
});

describe("RW3D #135 delta 3: the selection anchor projects through the renderer camera", () => {
  it("stamps the worldToScreen fallback when the 3D world is unavailable", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    // jsdom: no WebGL, nothing selected — provenance stamped, no anchor yet.
    expect(canvas().dataset.world3d).toBe("unavailable");
    expect(canvas().dataset.anchor).toBeUndefined();
    const w = tileToWorld(35);
    tapWorld(w.x, w.y);
    await frame();
    // The bridge was asked for the machine's ground centre (x, 0, y)...
    expect(vi.mocked(projectWorld3D)).toHaveBeenCalledWith(w.x, 0, w.y);
    // ...returned null, and the stamp equals the 2D worldToScreen fallback.
    expect(vi.mocked(projectWorld3D).mock.results[0].value).toBeNull();
    const expected = worldToScreen(cam(), viewOf(), w.x, w.y);
    expect(canvas().dataset.anchor).toBe(`${expected.x.toFixed(1)},${expected.y.toFixed(1)}`);
  });

  it("a projected 3D anchor wins over the 2D fallback", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const w = tileToWorld(35);
    tapWorld(w.x, w.y);
    await frame();
    vi.mocked(projectWorld3D).mockReturnValue({ x: 123.4, y: 567.8 });
    await frame();
    expect(canvas().dataset.anchor).toBe("123.4,567.8");
  });

  it("clears the anchor when the selection clears", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const w = tileToWorld(35);
    tapWorld(w.x, w.y);
    await frame();
    expect(canvas().dataset.anchor).toBeDefined();
    tap(40, 40);
    await frame();
    expect(canvas().dataset.anchor).toBeUndefined();
  });

  it("the anchor follows the camera zoom", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    yardWithSorter(store);
    await frame();
    mockChrome();
    forceLayoutChange();
    await frame();
    const w = tileToWorld(35);
    tapWorld(w.x, w.y);
    await frame();
    const before = canvas().dataset.anchor;
    click("Zoom in");
    await frame();
    const expected = worldToScreen(cam(), viewOf(), w.x, w.y);
    expect(canvas().dataset.anchor).toBe(`${expected.x.toFixed(1)},${expected.y.toFixed(1)}`);
    expect(canvas().dataset.anchor).not.toBe(before);
  });

  it("stamps world3DStatus provenance, including context loss", async () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    await frame();
    expect(canvas().dataset.world3d).toBe("unavailable");
    vi.mocked(world3DStatus).mockReturnValue("lost");
    await frame();
    expect(canvas().dataset.world3d).toBe("lost");
  });
});