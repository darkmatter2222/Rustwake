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
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  beltCost,
  refundOf,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, SAVE_KEY, encodeSave } from "../../src/game/persistence/save";
import { tileToWorld, type Camera } from "../../src/game/renderer/scene";
import { moveCostOf, dismantleImpact } from "../../src/ui/place/flow";
import { COPY } from "../../src/ui/place/copy";

/**
 * UI-RESET-53 (G2 wave 4): the explicit placement, move and dismantle flows, exercised
 * through the real App in jsdom — every action under test is a click or a cleared yard
 * tap, never a direct state injection. Fixture yards are seeded with the engine's own
 * `applyCommand` and persisted through `encodeSave` (checksum) exactly like build-52 and
 * camera-50; `lastSeenMs` is the reference clock so no offline catch-up moves the yard.
 *
 * Acceptance reads:
 *  (a) placement preview names the cell verdict + real price + shortfall; an invalid-cell
 *      refusal preserves the ghost, an affordability refusal returns to the recovery phase;
 *  (b) move opens a destination preview and charges nothing until a valid Confirm;
 *  (c) dismantle shows the whole impact and gates the commit behind arm-then-commit plus a
 *      Keep-machine cancel, and disables the commit when the store cannot hold the refund;
 *  (d) repeated taps on an unavailable action never silently buy; navigation stays reachable;
 *  (e) occupied / dock / edge cells, canceled gestures, insufficient resources, and
 *      save/reload after real build / move / dismantle commands.
 *
 * The printed charge and refund are asserted equal to the engine's actual spend / payout
 * (the same `moveCostOf` / `dismantleImpact` mirrors the strips paint), so a number on screen
 * cannot drift from what the confirming tap charges.
 */

// React 18's act() needs the environment flag; jsdom does not set it itself.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const sumStore = (store: Record<string, number>): number =>
  Object.values(store).reduce((total, qty) => total + qty, 0);

interface YardOpts {
  blueprint?: string;
  tile?: number;
  /** Extra scrap headroom after the seed build (default 100). */
  scrap?: number;
  /** Fill the store to capacity so a dismantle refund cannot fit. */
  fill?: boolean;
  /** Connect the first machine to the dock so a belt refund is part of the impact. */
  connect?: boolean;
  /** Build a second sorter on this tile (occupied-destination fixtures). */
  second?: number;
  /** Leave the yard empty (no seed build) so the resting primary stays the build step. */
  empty?: boolean;
}

/** A seeded yard built by the real engine, past the tutorial, with one (or two) machines. */
function yardState(opts: YardOpts = {}): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  let seq = 0;
  const send = (body: CommandBody) =>
    applyCommand(state, { ...body, id: `seed${(seq += 1)}` } as Command);
  const buildAt = (blueprint: string, tile: number) => {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store[item.resource] = (state.store[item.resource] ?? 0) + item.qty;
    }
    state.storeUnits = sumStore(state.store);
    send({ type: "machine.build", blueprint, tile });
  };
  if (!opts.empty) {
    buildAt(opts.blueprint ?? "sorter", opts.tile ?? 8);
    if (opts.second !== undefined) buildAt("sorter", opts.second);
  }
  if (opts.fill) {
    state.store.scrap = state.storeCapacity;
    state.storeUnits = state.storeCapacity;
  } else {
    state.store.scrap = (state.store.scrap ?? 0) + (opts.scrap ?? 100);
    state.storeUnits = sumStore(state.store);
  }
  if (opts.connect && !opts.empty) {
    // Belt links are paid from the store, so the scrap headroom must land FIRST
    // (a 0-scrap connect is refused `insufficient` and registers no route).
    const id = state.machines[0].id;
    for (const plan of planConnections(state, id)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    // Then drain the purse so the seed advance cannot load belt cargo: `dropRoute`
    // rides in-transit items home on top of the belt refund, and the parity reads
    // must see EMPTY belts. The orphaned output link (connectRoute overwrites
    // outRoute) stays unrefunded — the delta proves the registered-set contract.
    state.store.scrap = 0;
    state.storeUnits = sumStore(state.store);
  }
  advance(state, 1);
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

const yard = (opts: YardOpts = {}): GameStore => storeFromState(yardState(opts));

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
const pressKey = (key: string) =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const pressBack = () =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

const dockFaces = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".dock .dock__btn")].map((node) =>
    (node.textContent ?? "").replace(/\s+/g, " ").trim()
  );
function tapDockExact(label: string): void {
  const face = [...document.querySelectorAll<HTMLButtonElement>(".dock .dock__btn")].find(
    (node) => (node.firstChild?.textContent ?? "").trim() === label
  );
  expect(face, `dock faces ${JSON.stringify(dockFaces())}`).toBeDefined();
  act(() => face!.click());
}
const primaryBtn = () => document.querySelector<HTMLButtonElement>(".dock__btn--primary");
const catalog = () => document.querySelector<HTMLElement>(".catalog");
function catalogButton(label: string): HTMLButtonElement | undefined {
  return [...(catalog()?.querySelectorAll("button") ?? [])].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}
const card = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.catalog__card[data-blueprint="${id}"]`);
const statusLine = () => document.querySelector(".status-line")?.textContent ?? "";

const strip = (flow: string) => document.querySelector<HTMLElement>(`[data-flow="${flow}"]`);
const stripConfirm = (flow: string) =>
  document.querySelector<HTMLButtonElement>(`[data-flow="${flow}"] .place-strip__confirm`);
const stripCancel = (flow: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`[data-flow="${flow}"] .place-strip__actions button`)].find(
    (node) => !node.classList.contains("place-strip__confirm")
  );
const stripText = (flow: string, sel: string) =>
  strip(flow)?.querySelector(sel)?.textContent ?? "";

/** Arm the explicit placement preview for a blueprint through the real catalog path.
 * An unaffordable pick disables the footer Place (build-52); "Close catalog" still
 * arms the ghost underneath, so the preview can name the shortfall — never a dead end. */
function armPlacement(blueprint = "sorter"): void {
  tapDockExact("Build");
  act(() => card(blueprint)!.click());
  const place = catalogButton("Place");
  if (place && !place.disabled) {
    act(() => place.click());
  } else {
    act(() => catalogButton("Close catalog")!.click());
  }
}

/** Select a machine by tapping its tile, then open its inspector Move / Dismantle face. */
function openFlow(machineTile: number, face: "Move" | "Dismantle"): void {
  tapTile(machineTile);
  click(face);
}

const scrapOf = (store: GameStore) => store.getState().store.scrap ?? 0;

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

describe("UI-RESET-53 engine parity of the printed numbers", () => {
  it("move charge is movePenaltyPct of each build-cost line, rounded per line", () => {
    const state = yardState();
    const cost = moveCostOf("sorter");
    const expected = BLUEPRINTS.sorter.buildCost.map((item) => ({
      resource: item.resource,
      qty: Math.round((item.qty * TUNING.movePenaltyPct) / 100),
    }));
    expect(cost).toEqual(expected);
    expect(cost[0].qty).toBe(10); // 20 scrap * 50%
    // The engine spends exactly this on a real move.
    const id = state.machines[0].id;
    const before = state.store.scrap ?? 0;
    const result = applyCommand(state, { id: "p", type: "machine.move", machineId: id, tile: 20 });
    expect(result.ok).toBe(true);
    expect(before - (state.store.scrap ?? 0)).toBe(cost[0].qty);
  });

  it("dismantle refund mirrors refundOf on the build price plus registered belt links", () => {
    const state = yardState({ connect: true });
    const id = state.machines[0].id;
    const impact = dismantleImpact(state, id);
    const buildRefund = BLUEPRINTS.sorter.buildCost.reduce((sum, item) => sum + refundOf(item.qty), 0);
    expect(impact.buildRefund).toBe(buildRefund);
    expect(impact.buildRefund).toBe(18); // round(20 * 90%)
    const machine = state.machines[0];
    const routeIds = [machine.outRoute, ...machine.inRoutes].filter((x): x is number => x !== null);
    const beltRefund = routeIds.reduce((sum, rid) => {
      const route = state.routes.find((r) => r.id === rid);
      return sum + refundOf(beltCost(route?.run?.length ?? 0));
    }, 0);
    expect(impact.beltRefundUnits).toBe(beltRefund);
    expect(impact.refundUnits).toBe(machine.trayUnits + machine.inBufUnits + buildRefund + beltRefund);
    // The real commit pays refundUnits + the active batch (idle here, so just refundUnits).
    const before = state.store.scrap ?? 0;
    const result = applyCommand(state, { id: "d", type: "machine.dismantle", machineId: id });
    expect(result.ok).toBe(true);
    expect((state.store.scrap ?? 0) - before).toBe(impact.refundUnits + impact.batchUnits);
  });
});

describe("UI-RESET-53 (a) the placement preview", () => {
  it("names a clear affordable cell and the real price, then Build spends it", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    const preview = strip("placement")!;
    expect(preview.dataset.valid).toBe("true");
    expect(preview.dataset.verdict).toBe("ok");
    expect(stripText("placement", ".place-strip__cell")).toContain("Cell 20");
    expect(stripText("placement", ".place-strip__cost")).toContain("20 scrap");
    expect(stripText("placement", ".place-strip__reason")).toContain("Clear cell");

    const before = store.getState();
    const scrapBefore = scrapOf(store);
    const countBefore = before.machines.length;
    const revBefore = before.revision;
    act(() => primaryBtn()!.click());
    const after = store.getState();
    expect(after.machines.length).toBe(countBefore + 1);
    expect(after.machines.some((m) => m.tile === 20 && m.blueprint === "sorter")).toBe(true);
    expect(scrapBefore - scrapOf(store)).toBe(20);
    expect(after.revision).toBeGreaterThan(revBefore);
    // A real spend retires the preview.
    expect(strip("placement")).toBeNull();
  });

  it("an occupied cell is refused and the ghost is preserved for re-aiming", async () => {
    const store = yard({ second: 20 });
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20); // already holds the second sorter
    const preview = strip("placement")!;
    expect(preview.dataset.valid).toBe("false");
    expect(preview.dataset.verdict).toBe("occupied");
    expect(stripText("placement", ".place-strip__reason")).toContain("Cell 20 is already occupied");

    const countBefore = store.getState().machines.length;
    const scrapBefore = scrapOf(store);
    act(() => primaryBtn()!.click()); // confirm on the occupied cell
    // Preserve-on-refusal: still in build mode, ghost intact, nothing spent or built.
    expect(strip("placement")).not.toBeNull();
    expect(strip("placement")!.dataset.verdict).toBe("occupied");
    expect(store.getState().machines.length).toBe(countBefore);
    expect(scrapOf(store)).toBe(scrapBefore);
    expect(statusLine()).toContain("Tile blocked");
    // Re-aiming to a free cell clears the refusal and validates.
    tapTile(28);
    expect(strip("placement")!.dataset.verdict).toBe("ok");
    expect(statusLine()).toContain("Ghost on cell 28");
  });

  it("the dock cell is refused and preserved", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(DOCK_TILE);
    expect(strip("placement")!.dataset.verdict).toBe("dock");
    expect(stripText("placement", ".place-strip__reason")).toContain("dock cell cannot hold");
    const countBefore = store.getState().machines.length;
    act(() => primaryBtn()!.click());
    expect(strip("placement")!.dataset.verdict).toBe("dock");
    expect(store.getState().machines.length).toBe(countBefore);
  });

  it("the corner cell is placeable and an out-of-yard tap keeps the last aim", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(YARD_TILES - 1); // bottom-right corner, a valid edge cell
    expect(strip("placement")!.dataset.verdict).toBe("ok");
    expect(stripText("placement", ".place-strip__cell")).toContain(`Cell ${YARD_TILES - 1}`);
    // A tap beyond the yard edge cannot aim a cell; the ghost holds the corner.
    tapWorld(-200, -200);
    expect(strip("placement")!.dataset.verdict).toBe("ok");
    expect(stripText("placement", ".place-strip__cell")).toContain(`Cell ${YARD_TILES - 1}`);
    act(() => primaryBtn()!.click());
    expect(store.getState().machines.some((m) => m.tile === YARD_TILES - 1)).toBe(true);
  });

  it("an unaffordable cell prints the shortfall and a refused Build returns to recovery", async () => {
    const store = yard({ scrap: 0 }); // only the seed build's scrap, spent → 0 headroom
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    const preview = strip("placement")!;
    expect(preview.dataset.valid).toBe("false");
    expect(preview.dataset.verdict).toBe("ok"); // the cell is fine; the purse is not
    expect(stripText("placement", ".place-strip__short")).toContain("Need 20 scrap");
    const countBefore = store.getState().machines.length;
    const scrapBefore = scrapOf(store);
    act(() => primaryBtn()!.click());
    // Affordability refusal returns to the recovery phase (PLAY-001 P-3): no silent buy.
    expect(store.getState().machines.length).toBe(countBefore);
    expect(scrapOf(store)).toBe(scrapBefore);
    expect(strip("placement")).toBeNull();
  });

  it("Cancel plans again without spending and keeps the choice", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    const scrapBefore = scrapOf(store);
    const countBefore = store.getState().machines.length;
    tapDockExact("Cancel");
    expect(catalog()).not.toBeNull();
    expect(card("sorter")!.getAttribute("aria-pressed")).toBe("true");
    expect(scrapOf(store)).toBe(scrapBefore);
    expect(store.getState().machines.length).toBe(countBefore);
  });
});

describe("UI-RESET-53 (b) the move flow", () => {
  it("opens a destination preview and charges nothing until a valid Confirm", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    const revBefore = store.getState().revision;
    const scrapBefore = scrapOf(store);
    openFlow(8, "Move");
    // The flow is open, the machine has not moved, nothing was charged.
    expect(strip("move")).not.toBeNull();
    expect(store.getState().machines.find((m) => m.id === id)!.tile).toBe(8);
    expect(store.getState().revision).toBe(revBefore);
    expect(scrapOf(store)).toBe(scrapBefore);
    expect(stripText("move", ".place-strip__dest")).toContain("Destination: cell");
    expect(stripText("move", ".place-strip__cost")).toContain("10 scrap");

    tapTile(20); // aim a free destination
    expect(strip("move")!.dataset.valid).toBe("true");
    expect(stripConfirm("move")!.disabled).toBe(false);
    act(() => stripConfirm("move")!.click());
    const after = store.getState();
    expect(after.machines.find((m) => m.id === id)!.tile).toBe(20);
    expect(scrapBefore - scrapOf(store)).toBe(10);
    expect(after.revision).toBeGreaterThan(revBefore);
    expect(strip("move")).toBeNull();
  });

  it("a disabled Confirm on an occupied destination cannot spend", async () => {
    const store = yard({ second: 20 });
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    openFlow(8, "Move");
    tapTile(20); // the second sorter holds it
    expect(strip("move")!.dataset.verdict).toBe("occupied");
    expect(stripConfirm("move")!.disabled).toBe(true);
    const scrapBefore = scrapOf(store);
    const revBefore = store.getState().revision;
    act(() => stripConfirm("move")!.click());
    expect(store.getState().machines.find((m) => m.id === id)!.tile).toBe(8);
    expect(scrapOf(store)).toBe(scrapBefore);
    expect(store.getState().revision).toBe(revBefore);
  });

  it("moving onto the machine's own cell is a blocked placement, not a free no-op", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    openFlow(8, "Move");
    tapTile(8); // own cell
    expect(strip("move")!.dataset.verdict).toBe("occupied");
    expect(stripConfirm("move")!.disabled).toBe(true);
  });

  it("the dock destination is refused", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    openFlow(8, "Move");
    tapTile(DOCK_TILE);
    expect(strip("move")!.dataset.verdict).toBe("dock");
    expect(stripConfirm("move")!.disabled).toBe(true);
  });

  it("an unaffordable move prints the shortfall and keeps Confirm disabled", async () => {
    const store = yard({ scrap: 3 }); // 3 scrap < the 10-scrap move charge
    mount(store);
    begin();
    await frame();
    openFlow(8, "Move");
    tapTile(20);
    expect(strip("move")!.dataset.valid).toBe("false");
    expect(stripText("move", ".place-strip__short")).toContain("Need 10 scrap");
    expect(stripConfirm("move")!.disabled).toBe(true);
    const scrapBefore = scrapOf(store);
    act(() => stripConfirm("move")!.click());
    expect(scrapOf(store)).toBe(scrapBefore);
  });

  it("Cancel closes the flow with the machine unmoved and uncharged", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    openFlow(8, "Move");
    tapTile(20);
    const scrapBefore = scrapOf(store);
    act(() => stripCancel("move")!.click());
    expect(strip("move")).toBeNull();
    expect(store.getState().machines.find((m) => m.id === id)!.tile).toBe(8);
    expect(scrapOf(store)).toBe(scrapBefore);
  });

  it("the N key cycles the destination without spending", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    openFlow(8, "Move");
    const first = stripText("move", ".place-strip__dest");
    const scrapBefore = scrapOf(store);
    pressKey("n");
    const second = stripText("move", ".place-strip__dest");
    expect(second).not.toBe(first);
    expect(scrapOf(store)).toBe(scrapBefore);
    expect(store.getState().machines[0].tile).toBe(8);
  });
});

describe("UI-RESET-53 (c) the dismantle safeguard", () => {
  it("shows the whole impact, arms on the first tap, commits only on the second", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    const revBefore = store.getState().revision;
    openFlow(8, "Dismantle");
    const cardEl = strip("dismantle")!;
    expect(cardEl.dataset.armed).toBe("false");
    expect(cardEl.dataset.fits).toBe("true");
    expect(stripText("dismantle", ".place-strip__impact")).toContain("Build price returns +18");
    expect(stripText("dismantle", ".place-strip__total")).toContain("+18");
    expect(stripConfirm("dismantle")!.textContent).toBe(COPY.dismantleFirst);
    // Opening the card removed nothing.
    expect(store.getState().machines.some((m) => m.id === id)).toBe(true);
    expect(store.getState().revision).toBe(revBefore);

    // First tap arms; still nothing removed.
    const scrapBefore = scrapOf(store);
    act(() => stripConfirm("dismantle")!.click());
    expect(strip("dismantle")!.dataset.armed).toBe("true");
    expect(stripConfirm("dismantle")!.textContent).toBe(COPY.dismantleArmed);
    expect(store.getState().machines.some((m) => m.id === id)).toBe(true);
    expect(store.getState().revision).toBe(revBefore);
    expect(scrapOf(store)).toBe(scrapBefore);

    // Second tap commits: machine gone, refund paid, revision up.
    act(() => stripConfirm("dismantle")!.click());
    expect(store.getState().machines.some((m) => m.id === id)).toBe(false);
    expect(scrapOf(store) - scrapBefore).toBe(18);
    expect(store.getState().revision).toBeGreaterThan(revBefore);
    expect(strip("dismantle")).toBeNull();
  });

  it("Keep machine cancels even after arming, with no refund", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    openFlow(8, "Dismantle");
    act(() => stripConfirm("dismantle")!.click()); // arm
    expect(strip("dismantle")!.dataset.armed).toBe("true");
    const scrapBefore = scrapOf(store);
    act(() => stripCancel("dismantle")!.click());
    expect(strip("dismantle")).toBeNull();
    expect(store.getState().machines.some((m) => m.id === id)).toBe(true);
    expect(scrapOf(store)).toBe(scrapBefore);
  });

  it("a connected machine's impact names the belt refund the commit pays", async () => {
    const store = yard({ connect: true });
    mount(store);
    begin();
    await frame();
    const state = store.getState();
    const id = state.machines[0].id;
    const impact = dismantleImpact(state, id);
    expect(impact.linkCount).toBeGreaterThan(0);
    openFlow(8, "Dismantle");
    expect(stripText("dismantle", ".place-strip__impact")).toContain("Belt links return");
    const total = impact.refundUnits + impact.batchUnits;
    expect(stripText("dismantle", ".place-strip__total")).toContain(`+${total}`);
    const scrapBefore = scrapOf(store);
    act(() => stripConfirm("dismantle")!.click()); // arm
    act(() => stripConfirm("dismantle")!.click()); // commit
    expect(scrapOf(store) - scrapBefore).toBe(total);
    expect(store.getState().machines.some((m) => m.id === id)).toBe(false);
  });

  it("a full store disables the commit and names the recovery path", async () => {
    const store = yard({ fill: true });
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    openFlow(8, "Dismantle");
    const cardEl = strip("dismantle")!;
    expect(cardEl.dataset.fits).toBe("false");
    expect(stripConfirm("dismantle")!.disabled).toBe(true);
    expect(stripText("dismantle", ".place-strip__reason")).toContain("Store full");
    expect(strip("dismantle")!.textContent).toContain(COPY.recoveryHint);
    const scrapBefore = scrapOf(store);
    act(() => stripConfirm("dismantle")!.click());
    expect(store.getState().machines.some((m) => m.id === id)).toBe(true);
    expect(scrapOf(store)).toBe(scrapBefore);
  });
});

describe("UI-RESET-53 (d) repeated taps and navigation", () => {
  it("repeated taps on an unaffordable Build never silently buy and keep explaining", async () => {
    const store = yard({ scrap: 0 });
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    const countBefore = store.getState().machines.length;
    const scrapBefore = scrapOf(store);
    const phases = new Set<string>();
    for (let tap = 0; tap < 6; tap += 1) {
      act(() => primaryBtn()?.click());
      phases.add(statusLine());
      // Re-arm if the affordability refusal returned us to the recovery phase.
      if (strip("placement") === null) {
        armPlacement("sorter");
        tapTile(20);
      }
    }
    expect(store.getState().machines.length).toBe(countBefore); // never bought
    expect(scrapOf(store)).toBe(scrapBefore); // never charged
    expect(phases.size).toBeGreaterThanOrEqual(1); // always an explanation, never silent
    expect([...phases].every((line) => line.trim().length > 0)).toBe(true);
    // Navigation stays reachable: the dock and the Store face are still there.
    expect(document.querySelector(".dock")).not.toBeNull();
    expect(dockFaces().length).toBeGreaterThanOrEqual(3);
  });

  it("Escape closes an open move flow before the selection", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    openFlow(8, "Move");
    expect(strip("move")).not.toBeNull();
    pressBack();
    expect(strip("move")).toBeNull();
    // The inspector underneath is still reachable (selection preserved).
    expect(findButton("Dismantle")).toBeDefined();
  });
});

describe("UI-RESET-53 (e) canceled gestures", () => {
  it("a cancelled build gesture never places", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    const p = screenOf(tileToWorld(20).x, tileToWorld(20).y);
    const countBefore = store.getState().machines.length;
    firePointer("pointerdown", 1, p.x, p.y);
    firePointer("pointercancel", 1, p.x, p.y);
    firePointer("pointerup", 1, p.x, p.y);
    expect(store.getState().machines.length).toBe(countBefore);
  });

  it("a drag in move mode aims the destination but never confirms", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    openFlow(8, "Move");
    const from = screenOf(tileToWorld(20).x, tileToWorld(20).y);
    const to = screenOf(tileToWorld(28).x, tileToWorld(28).y);
    const scrapBefore = scrapOf(store);
    firePointer("pointerdown", 1, from.x, from.y);
    firePointer("pointermove", 1, to.x, to.y);
    firePointer("pointerup", 1, to.x, to.y);
    // A drag is not a cleared tap: the machine has not moved and nothing was charged.
    expect(store.getState().machines.find((m) => m.id === id)!.tile).toBe(8);
    expect(scrapOf(store)).toBe(scrapBefore);
    expect(strip("move")).not.toBeNull();
  });
});

describe("UI-RESET-53 (e) save / reload after real commands", () => {
  function reload(store: GameStore): GameStore {
    const text = store.exportSave();
    const map = new Map<string, string>([[SAVE_KEY, text]]);
    return createStore({
      storage: {
        getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
        setItem: (key: string, value: string) => map.set(key, value),
      },
      now: () => Date.now(),
    });
  }

  it("a real build survives a save / reload round-trip", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    act(() => primaryBtn()!.click());
    expect(store.getState().machines.some((m) => m.tile === 20)).toBe(true);
    const reloaded = reload(store);
    const machine = reloaded.getState().machines.find((m) => m.tile === 20);
    expect(machine).toBeDefined();
    expect(machine!.blueprint).toBe("sorter");
  });

  it("a real move survives a save / reload round-trip", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    openFlow(8, "Move");
    tapTile(20);
    act(() => stripConfirm("move")!.click());
    expect(store.getState().machines.find((m) => m.id === id)!.tile).toBe(20);
    const reloaded = reload(store);
    expect(reloaded.getState().machines.find((m) => m.id === id)!.tile).toBe(20);
    expect(reloaded.getState().machines.some((m) => m.tile === 8)).toBe(false);
  });

  it("a real dismantle survives a save / reload round-trip", async () => {
    const store = yard();
    mount(store);
    begin();
    await frame();
    const id = store.getState().machines[0].id;
    const scrapAfterCommit = (() => {
      openFlow(8, "Dismantle");
      act(() => stripConfirm("dismantle")!.click());
      act(() => stripConfirm("dismantle")!.click());
      return scrapOf(store);
    })();
    expect(store.getState().machines.some((m) => m.id === id)).toBe(false);
    const reloaded = reload(store);
    expect(reloaded.getState().machines.some((m) => m.id === id)).toBe(false);
    expect(reloaded.getState().store.scrap ?? 0).toBe(scrapAfterCommit);
  });
});
