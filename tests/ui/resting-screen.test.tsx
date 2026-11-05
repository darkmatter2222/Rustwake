import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App, labelForReject } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { TUNING } from "../../src/game/content/defs";

/**
 * PLAY-001 g1: the resting screen answers three questions without a tap.
 *
 * P-1 the blocked toast carries its own shortfall, P-2 the power budget and the drone
 * count are printed from the first tick, P-3 one committed choice keeps one primary label
 * while the phase detail moves to `.status-line`, P-4 the pip row names what it counts,
 * P-5 the credits chip survives its own charge down to zero.
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

/** Matches the accessible name: the aria-label when present, else the text. */
function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

function mount(store: GameStore): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<App store={store} />);
  });
  return host;
}

/** Past the first two tutorial steps: six pulses and a repaired drone, no machine yet. */
function repairTheDrone(store: GameStore): void {
  act(() => findButton("Begin recovery")?.click());
  for (let i = 0; i < 6; i += 1) {
    act(() => findButton("Salvage")?.click());
    act(() => store.step(TUNING.manualPulseTicks));
  }
  act(() => findButton("Repair drone")?.click());
  act(() => store.step(1));
}

describe("PLAY-001 the resting screen", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /** P-1: the blocked tap states its shortfall, and nothing is charged for it. */
  it("P-1 the blocked toast names the shortfall in numbers", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    repairTheDrone(store);
    // One tap enters the build phase, the second one is the place tap itself.
    act(() => findButton("Build Scrap sorter")?.click());
    expect(document.querySelector(".status-line")?.textContent).toContain("Ghost on cell");
    act(() => findButton("Build Scrap sorter")?.click());
    expect(document.querySelector(".toast")?.textContent).toBe("Need 20 scrap · have 0");
    expect(store.getState().machines.length).toBe(0);
    expect(store.getState().store["scrap"]).toBe(0);
  });

  /** P-1: the credit price reads the same way, from the same result object. */
  it("P-1 a credit shortfall names the price and the purse", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    repairTheDrone(store);
    const state = store.getState();
    state.credits = 4;
    act(() => store.step(1));
    const blocked = store.dispatch({ id: "p1-credits", type: "drone.add" });
    if (!blocked.ok) {
      expect(labelForReject(blocked)).toBe("Need 45 credits · have 4");
    } else {
      throw new Error("the spare drone should have been blocked at 4 credits");
    }
  });

  /** P-2: the resting lines are there from the first tick, with no machine on the yard. */
  it("P-2 the resting screen states power and drones with zero machines", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const resting = () => document.querySelector(".objective")?.textContent ?? "";
    expect(resting()).toContain("Power 8 · 0 requested · 100 %");
    expect(resting()).toContain("Drones 0");
    repairTheDrone(store);
    expect(resting()).toContain("Drones 1");
    expect(resting()).toContain("Power 8 · 0 requested · 100 %");
    expect(store.getState().machines.length).toBe(0);
  });

  /** P-3: one committed choice keeps one primary label across the phase flip. */
  it("P-3 the primary label is unchanged across the build and place flip", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    repairTheDrone(store);
    const primary = () =>
      document.querySelector<HTMLElement>(".dock__btn--primary")?.textContent ?? "";
    const goal = () => document.querySelector(".objective > span")?.textContent ?? "";
    const labels = new Set<string>();
    const goals = new Set<string>();
    for (let tap = 0; tap < 6; tap += 1) {
      act(() => document.querySelector<HTMLElement>(".dock__btn--primary")?.click());
      labels.add(primary());
      goals.add(goal());
    }
    // Nothing was affordable, so the same goal is current the whole way: one label, one goal.
    expect(labels.size).toBe(1);
    expect([...labels][0]).toContain("Build Scrap sorter");
    expect(goals.size).toBe(1);
    // The phase moved to the secondary line, which is what changes tap to tap.
    const phases = new Set<string>();
    for (let tap = 0; tap < 4; tap += 1) {
      act(() => document.querySelector<HTMLElement>(".dock__btn--primary")?.click());
      phases.add(document.querySelector(".status-line")?.textContent ?? "");
    }
    expect(phases.size).toBe(2);
    expect(phases.has("Ghost on cell 8 · tap again to place")).toBe(true);
  });

  /** P-4: the pip row is named on the resting screen, one number per machine. */
  it("P-4 the pip legend names the counted quantity per machine", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    repairTheDrone(store);
    // One delivery in the store, so a blueprint price is actually covered.
    act(() => store.step(262));
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
    expect(store.getState().machines.length).toBe(1);
    act(() => findButton("Connect dock to sorter")?.click());
    act(() => store.step(400));
    const resting = document.querySelector(".objective")?.textContent ?? "";
    expect(resting).toMatch(/Batch pips · Scrap sorter \d\/5/);
    // The lit count is over the five marks the tile paints, never over a buffer capacity.
    expect(resting).toMatch(/Batch pips · Scrap sorter \d\/5( |$)/);
    // A second machine separates: the same row names both, in yard order.
    act(() => findButton("Build Furnace")?.click());
    act(() => findButton("Build Furnace")?.click());
    act(() => store.step(300));
    expect(store.getState().machines.length).toBe(2);
    const both = document.querySelector(".objective")?.textContent ?? "";
    expect(both).toMatch(/Batch pips · Scrap sorter \d\/5 · Furnace \d\/5/);
  });

  /** P-5: the credits chip survives its own charge down to zero. */
  it("P-5 the credits chip stays at zero", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const chips = [...document.querySelectorAll<HTMLElement>(".resources__item")].map(
      (node) => (node.textContent ?? "").trim()
    );
    expect(chips.some((line) => /^Credits0$/.test(line))).toBe(true);
    expect(store.getState().credits).toBe(0);
  });
});
