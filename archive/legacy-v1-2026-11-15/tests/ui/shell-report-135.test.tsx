import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
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
import type { CatchUpResponse } from "../../src/game/workers/catchup";

/**
 * RW3D #135 (round 10 rework): the return-report auto-open must survive a COLD
 * Begin click. A long absence is adopted off-thread (store.ts `adoptCatchUp`),
 * so `returnReport` is still null when the player taps Continue at
 * domcontentloaded; the one-shot check in Gate's onBegin then misses it and the
 * report arrives with nothing to re-open it (QA REJECT 6875113083, capture
 * harness 71/73). The fix is a reactive effect in App that opens the report when
 * it arrives while the yard has started and the stack is untouched.
 *
 * These tests reproduce the race deterministically in jsdom: the catch-up client
 * is mocked worker-backed (so the store takes the async branch) and its `run`
 * computes the REAL settled handoff via `handleCatchUp`, but hands it back only
 * when the test releases the latch. The store, the report math and the App are
 * otherwise the shipped code — no production path is stubbed. The settled-click
 * path (report present before the tap) is pinned to open immediately, and the
 * effect must never clobber an open destination nor re-open a dismissed report.
 *
 * The pixel truth of the same chain is the headless chromium capture in
 * docs/evidence/2026-11-14-rw3d-t08-* (re-run to 73/73 at the rework head).
 */

const catchUpLatch = vi.hoisted(() => ({ release: null as null | (() => void) }));

vi.mock("../../src/game/workers/catchup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/game/workers/catchup")>();
  return {
    ...actual,
    createCatchUpClient: () => ({
      backed: "worker" as const,
      run: (sim: SimState, lastSeenMs: number, nowMs: number) => {
        const settled = actual.handleCatchUp({
          protocol: actual.CATCHUP_PROTOCOL,
          id: 1,
          sim,
          lastSeenMs,
          nowMs,
        });
        return new Promise<CatchUpResponse | null>((resolve) => {
          catchUpLatch.release = () => resolve(settled);
        });
      },
      cancel: () => {
        catchUpLatch.release = null;
      },
    }),
  };
});

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

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
function yard(depth: number): SimState {
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
  state.credits = 34;
  state.store = { ...state.store, data: 12 };
  state.storeUnits += 12;
  advance(state, 1);
  return state;
}

/**
 * A save that left `absenceMs` of absence behind. Under 2_000_000 ms (20_000
 * ticks, `CATCHUP_WORKER_MIN_TICKS`) the report settles inline at construction;
 * at or above it the worker-backed client takes the async branch and the report
 * only arrives when the latch is released.
 */
function storeWithAbsence(depth: number, absenceMs: number): GameStore {
  const writtenAt = 1_000_000;
  const text = encodeSave(yard(depth), writtenAt, { ...DEFAULT_SETTINGS, muted: true });
  const map = new Map<string, string>([[SAVE_KEY, text]]);
  return createStore({
    storage: {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => map.set(key, value),
    },
    now: () => writtenAt + absenceMs,
  });
}

let root: ReturnType<typeof createRoot> | null = null;

function mount(store: GameStore): HTMLElement {
  const host = document.createElement("div");
  host.id = "root";
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

const begin = () => act(() => findButton("Begin recovery")?.click());
const panelTitles = () =>
  [...document.querySelectorAll(".panel")].map((node) =>
    (node.querySelector(".panel__title")?.textContent ?? "").trim()
  );
const hostDepth = () => Number(document.querySelector(".shell-host")?.getAttribute("data-depth") ?? 0);
const pressBack = () =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
const openSettings = () => act(() => findButton("Settings")?.click());
/** Release the in-flight catch-up and flush the adoption + React effect. */
const settleCatchUp = async () => {
  await act(async () => {
    catchUpLatch.release?.();
  });
};

beforeEach(() => {
  document.body.innerHTML = "";
  catchUpLatch.release = null;
  for (const raw of [stylesRaw, shellRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
});

afterEach(() => {
  if (root !== null) {
    const dying = root;
    root = null;
    act(() => dying.unmount());
  }
  catchUpLatch.release = null;
  vi.restoreAllMocks();
});

describe("RW3D #135 round 10: the return report auto-open survives a cold Begin click", () => {
  it("a cold click opens the report once the off-thread catch-up arrives", async () => {
    // 30_000 ticks of absence: the worker branch, so the report is NOT ready at boot.
    const store = storeWithAbsence(8, 3_000_000);
    expect(store.isReconciling()).toBe(true);
    expect(store.getReturnReport()).toBeNull();
    mount(store);
    expect(findButton("Begin recovery")).toBeDefined();

    // Fast click at domcontentloaded: the yard starts while the report is pending.
    begin();
    expect(store.getReturnReport()).toBeNull();
    expect(panelTitles()).toEqual([]);
    expect(hostDepth()).toBe(0);
    // The reconciling line is the only thing on screen while the handoff runs.
    expect(document.querySelector(".reconcile")).not.toBeNull();

    // The catch-up settles late: the report must open as the first stack layer.
    await settleCatchUp();
    expect(store.isReconciling()).toBe(false);
    expect(store.getReturnReport()).not.toBeNull();
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(hostDepth()).toBe(1);

    // It opens exactly once: a later unrelated notify never duplicates the layer.
    act(() => store.setSettings({ muted: false }));
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(hostDepth()).toBe(1);
  });

  it("a settled click (short absence, inline at boot) opens the report immediately", () => {
    // 600 ticks: under the worker threshold, so the report is settled at construction.
    const store = storeWithAbsence(8, 60_000);
    expect(store.getReturnReport()).not.toBeNull();
    mount(store);
    begin();
    // No latch, no wait: the very first frame after the tap carries the report.
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(hostDepth()).toBe(1);
  });

  it("a long absence that settled before the tap still opens immediately", async () => {
    const store = storeWithAbsence(8, 3_000_000);
    mount(store);
    // Let the handoff settle while the gate is still up (the settled-click case).
    await settleCatchUp();
    expect(store.getReturnReport()).not.toBeNull();
    expect(panelTitles()).toEqual([]); // gate: no panel yet
    begin();
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(hostDepth()).toBe(1);
  });

  it("never re-opens a report the player dismissed", async () => {
    const store = storeWithAbsence(8, 3_000_000);
    mount(store);
    begin();
    await settleCatchUp();
    expect(hostDepth()).toBe(1);

    // Back retires the report to the plain yard.
    pressBack();
    expect(panelTitles()).toEqual([]);
    expect(hostDepth()).toBe(0);

    // A later notify (settings change, sim tick) must not resurrect the report.
    act(() => store.setSettings({ muted: false }));
    act(() => store.step(1));
    expect(panelTitles()).toEqual([]);
    expect(hostDepth()).toBe(0);
  });

  it("does not clobber a destination opened before the report arrives", async () => {
    const store = storeWithAbsence(8, 3_000_000);
    mount(store);
    begin();
    // The player opens Settings while the catch-up is still running.
    openSettings();
    expect(document.querySelector(".panel--settings")).not.toBeNull();
    expect(hostDepth()).toBe(1);

    // The report arrives: the untouched-stack guard leaves Settings on top.
    await settleCatchUp();
    expect(store.getReturnReport()).not.toBeNull();
    expect(document.querySelector(".panel--settings")).not.toBeNull();
    expect(panelTitles()).not.toContain("While you were away");
    expect(hostDepth()).toBe(1);

    // Closing Settings lands on the yard; the report stays reachable, not forced.
    pressBack();
    expect(hostDepth()).toBe(0);
    expect(panelTitles()).toEqual([]);
  });
});
