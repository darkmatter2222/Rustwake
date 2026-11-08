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
    // gap ladder, so the dock carries two names. STRAT-003: each name carries its own
    // price. BLD-001: the row is painted cheapest-first, so the plain-price budget plan is
    // the leftmost face and the dearer throughput plan follows it.
    const machineId = store.getState().machines[0].id;
    expect(branchOptions(store.getState(), machineId).map((option) => option.id)).toEqual([
      "draw",
      "speed",
    ]);
    expect(branchOptions(store.getState(), machineId).map((option) => option.cost)).toEqual([
      "30 credits",
      "40 credits",
    ]);

    const buttons = [...document.querySelectorAll<HTMLElement>(".dock .dock__btn")];
    const labels = buttons.map((node) => (node.textContent ?? "").trim());
    expect(labels.length).toBe(2);
    // Order, not just membership: the first face is the budget plan at the plain price,
    // the last the batch clock at the plain ladder plus its 10-credit premium.
    expect(labels[0]).toMatch(/^Less power30 credits$/);
    expect(labels[1]).toMatch(/^Faster batches40 credits$/);
    expect(labels.join("|")).not.toContain("More input");
    // Each face prints its own price; the row is the tradeoff (STRAT-003).
    expect(buttons[0].querySelector(".dock__cost")?.textContent).toBe("30 credits");
    expect(buttons[1].querySelector(".dock__cost")?.textContent).toBe("40 credits");
    for (const button of buttons) {
      expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(44);
    }
    // U-2 (UI-002): one accent-filled primary for the whole row, and it is the leftmost,
    // cheapest face - the one a blind thumb reaches. Both faces keep the shared third-width
    // grammar (`dock__btn--branch`), so the accent names a plan without moving any box.
    expect(buttons[0].className).toContain("dock__btn--primary");
    expect(buttons[1].className).not.toContain("dock__btn--primary");
    for (const button of buttons) expect(button.className).toContain("dock__btn--branch");

    // One tap on the *leftmost* face, no Build-then-Place pair: the chosen name is the
    // recorded branch, and the charge is exactly the number that face printed (34 - 30 = 4,
    // the purse covers the plain price and not the premium).
    const printed = Number(
      (buttons[0].querySelector(".dock__cost")?.textContent ?? "0").split(" ")[0]
    );
    const creditsBefore = store.getState().credits;
    act(() => buttons[0].click());
    expect(printed).toBe(30);
    expect(store.getState().credits).toBe(creditsBefore - printed);
    expect(store.getState().machines[0].branch).toEqual(["draw"]);
    expect(store.getState().machines[0].level).toBe(2);
    expect(store.getState().credits).toBe(4);
    // The row is back to its usual targets once the level is bought.
    expect([...document.querySelectorAll(".dock .dock__btn")].length).toBeGreaterThan(2);
  });

  /**
   * STRAT-003: the purse covers the cheaper face and not the dearer one (34 credits
   * against 30 and 40), so the row itself tells the player which side of the fork
   * the current purse can pay for. The refusal prints the exact shortfall of the
   * tapped option - its own price, not the other face's.
   */
  it("refuses the dearer plan below its own price and states that shortfall", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    boot(store);
    forkState(store); // credits 34: covers 30, not 40
    expect(nextYardStep(store.getState()).kind).toBe("upgrade");

    act(() => findButton("Faster batches")?.click());
    const toast = document.querySelector(".toast")?.textContent ?? "";
    expect(toast).toBe("Need 40 credits · have 34");
    const state = store.getState();
    expect(state.machines[0].level).toBe(1);
    expect(state.credits).toBe(34);

    // The cheaper face still pays its own printed price and the level moves.
    act(() => findButton("Less power")?.click());
    expect(store.getState().machines[0].level).toBe(2);
    expect(store.getState().credits).toBe(4);
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
