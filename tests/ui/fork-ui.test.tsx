import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import stylesRaw from "../../src/ui/styles.css?raw";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { TUNING } from "../../src/game/content/defs";
import { nextYardStep } from "../../src/game/simulation/plan";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { branchOptions } from "../../src/ui/text";

/**
 * STRAT-002/A1 surfaces: the fork on the dock (A1-3), the power budget on the resting
 * screen (A1-4), and the touch/no-scroll floor with the extra line in place (A1-6).
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

/** The tutorial boot every other UI test uses, ending with a running sorter. */
function boot(store: GameStore): void {
  act(() => findButton("Begin recovery")?.click());
  for (let i = 0; i < 6; i += 1) {
    act(() => findButton("Salvage")?.click());
    act(() => store.step(TUNING.manualPulseTicks));
  }
  act(() => findButton("Repair drone")?.click());
  act(() => store.step(262));
  act(() => findButton("Build Scrap sorter")?.click());
  act(() => findButton("Build Scrap sorter")?.click());
  act(() => findButton("Connect dock to sorter")?.click());
  act(() => store.step(300));
}

let linkSeq = 0;

/** Past the tutorial: links settled, one machine, credits for exactly one level. */
function forkState(store: GameStore): void {
  for (let pass = 0; pass < 4; pass += 1) {
    for (const machine of store.getState().machines) {
      for (const plan of planConnections(store.getState(), machine.id)) {
        act(() =>
          store.dispatch({
            id: "r" + (linkSeq += 1),
            type: "route.connect",
            from: plan.from,
            to: plan.to,
            filter: plan.filter,
          })
        );
      }
    }
  }
  const state = store.getState();
  state.tutorial = 9;
  state.credits = 34;
  state.store = { scrap: 9 };
  state.storeUnits = 9;
  act(() => store.step(1));
}

describe("STRAT-002/A1 the fork on the dock", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = stylesRaw;
    document.head.appendChild(style);
  });

  it("shows two named outcomes at one price and commits on one tap (A1-3, PLAY-002 1)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    boot(store);
    forkState(store);
    expect(nextYardStep(store.getState()).kind).toBe("upgrade");

    const card = document.querySelector(".objective")?.textContent ?? "";
    expect(card).toContain("Choose what improves on the Scrap sorter");
    expect(card).toContain("30 credits");

    // The drop executed (STRAT-002 g3 / A1-2v3): `buffer` leads no column under either
    // gap ladder, so the dock carries two names, in this order, at one shared price.
    const machineId = store.getState().machines[0].id;
    expect(branchOptions(store.getState(), machineId).map((option) => option.id)).toEqual([
      "speed",
      "draw",
    ]);

    const buttons = [...document.querySelectorAll<HTMLElement>(".dock .dock__btn")];
    const labels = buttons.map((node) => (node.textContent ?? "").trim());
    expect(labels.length).toBe(2);
    // Order, not just membership: the first face is the batch clock, the last the budget.
    expect(labels[0]).toMatch(/^Faster batches30 credits$/);
    expect(labels[1]).toMatch(/^Less power30 credits$/);
    expect(labels.join("|")).not.toContain("More input");
    // Every branch carries the same price on its own face: no hidden default.
    for (const button of buttons) {
      expect(button.querySelector(".dock__cost")?.textContent).toBe("30 credits");
      expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(44);
    }

    // One tap, no Build-then-Place pair: the chosen name is the recorded branch.
    act(() => findButton("Less power")?.click());
    expect(store.getState().machines[0].branch).toEqual(["draw"]);
    expect(store.getState().machines[0].level).toBe(2);
    expect(store.getState().credits).toBe(4);
    // The row is back to its usual targets once the level is bought.
    expect([...document.querySelectorAll(".dock .dock__btn")].length).toBeGreaterThan(2);
  });

  it("names the power budget on the resting screen at text scale 1 and 2 (A1-4)", () => {
    for (const large of [false, true]) {
      document.body.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = stylesRaw;
      document.head.appendChild(style);
      const store = createStore({ storage: memoryStorage(), now: () => 10 });
      mount(store);
      boot(store);
      forkState(store);
      if (large) {
        // The control offers 1 -> 1.25 -> 1.5 -> 2, so three taps reach text scale 2.0.
        act(() => findButton("Text size")?.click());
        act(() => findButton("Text size")?.click());
        act(() => findButton("Text size")?.click());
        expect(store.getSettings().textScale).toBe(2);
        expect(document.documentElement.classList.contains("text-large")).toBe(true);
      }
      const card = document.querySelector(".objective")?.textContent ?? "";
      expect(card).toMatch(/Power 8 · \d+ requested · \d+ %/);
      // The touch floor and the no-scroll gate hold with the extra line in place.
      for (const button of [...document.querySelectorAll<HTMLElement>(".dock .dock__btn")]) {
        expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(44);
      }
      expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight + 1);
    }
  });
});
