import { describe, expect, it, beforeEach, vi } from "vitest";
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
    expect(resting).toMatch(/Batch pips · Scrap sorter #\d+ \d\/5/);
    // The lit count is over the five marks the tile paints, never over a buffer capacity.
    expect(resting).toMatch(/Batch pips · Scrap sorter #\d+ \d\/5( |$)/);
    // The index inside the entry is the tile the renderer draws that machine on (CHRM-001),
    // the same number the build phase prints in `Ghost on cell {tile}`.
    expect(resting).toContain(`Scrap sorter #${store.getState().machines[0].tile} `);
    // A second machine separates: the same row names both, in yard order.
    act(() => findButton("Build Furnace")?.click());
    act(() => findButton("Build Furnace")?.click());
    act(() => store.step(300));
    expect(store.getState().machines.length).toBe(2);
    const both = document.querySelector(".objective")?.textContent ?? "";
    expect(both).toMatch(/Batch pips · Scrap sorter #\d+ \d\/5 · Furnace #\d+ \d\/5/);
    const [first, second] = store.getState().machines;
    expect(both).toContain(`Scrap sorter #${first.tile} `);
    expect(both).toContain(`Furnace #${second.tile} `);
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

  /**
   * TST-001 (QA D-3): the shortfall is not only a 1.8 s toast. The same sentence rides on
   * as a trailing segment of a `.status-line`, so 2 s after the refused tap the number is
   * still painted and no panel had to be opened.
   */
  it("TST-001 the shortfall outlives the toast window as a trailing segment", () => {
    vi.useFakeTimers();
    try {
      const store = createStore({ storage: memoryStorage(), now: () => 10 });
      mount(store);
      repairTheDrone(store);
      act(() => store.step(262));
      act(() => findButton("Build Scrap sorter")?.click());
      act(() => findButton("Build Scrap sorter")?.click());
      act(() => findButton("Connect dock to sorter")?.click());
      act(() => store.step(400));
      act(() => findButton("Build Furnace")?.click());
      act(() => findButton("Build Furnace")?.click());
      act(() => store.step(300));
      expect(store.getState().machines.length).toBe(2);
      // The yard ladder, not the tutorial script: this is the frame a player rests in.
      store.getState().tutorial = 9;

      // The acceptance frame: two machines on the yard, no panel open.
      const statusLines = () =>
        [...document.querySelectorAll<HTMLElement>(".status-line")].map((node) => node.textContent ?? "");
      const linesBefore = statusLines().length;
      expect(linesBefore).toBeGreaterThan(0);

      // Refuse one priced tap: empty the purse and the store, so the next priced step is
      // blocked. The loop walks the ladder until a *shortfall* reject is on screen (an
      // earlier tap can be refused for another reason, e.g. the cutting-pulse cooldown).
      let toast: string | null = null;
      for (let tap = 0; tap < 24 && toast === null; tap += 1) {
        const state = store.getState();
        state.credits = 0;
        state.store = {};
        state.storeUnits = 0;
        act(() => document.querySelector<HTMLElement>(".dock__btn--primary")?.click());
        const text = document.querySelector(".toast")?.textContent ?? null;
        if (text !== null && /^Need \d+ \w+ · have \d+$/.test(text)) toast = text;
      }
      if (toast === null) throw new Error("no shortfall reject in twenty-four primary taps");

      // Same instant: the toast and the resting line carry the identical sentence, the
      // line's copy continuing its own sentence with a lowercase first letter.
      const trailing = `Last ${toast.charAt(0).toLowerCase()}${toast.slice(1)}`;
      expect(statusLines().some((line) => line.includes(trailing))).toBe(true);
      expect(statusLines()).toHaveLength(linesBefore);

      // 2.2 s later the toast is gone and the number is still on the screen.
      act(() => vi.advanceTimersByTime(2200));
      expect(document.querySelector(".toast")).toBeNull();
      const settled = statusLines();
      expect(settled).toHaveLength(linesBefore);
      const carried = settled.find((line) => line.includes(trailing)) ?? "";
      expect(carried.length).toBeGreaterThan(0);
      // Both figures of the shortfall survived, not just the word "Last".
      for (const digits of toast.match(/\d+/g) ?? []) expect(carried).toContain(digits);
      expect(carried).toMatch(/Last need \d+ \w+ · have \d+$/);
      // The literal line at this frame: the copper separator's 25-scrap price, one drone,
      // one running batch. Written out so a rewording cannot pass by accident.
      expect(carried).toBe("Drones 1 · Power 8 · 1 requested · 100 % · Last need 25 scrap · have 0");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * DEF-006 (PLAY-002 g1 QA note a): `lastReject` was replaced but never cleared, so
   * a hundreds-of-taps-old `Last need ... · have ...` kept riding the resting line.
   * Now the first *successful* tap retires the segment, while pure tick progress (no
   * tap) keeps it exactly as TST-001 measured - the field stays session-only, so the
   * save bytes and checksum are untouched.
   */
  it("DEF-006 a successful tap retires the stale Last-shortfall segment", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    repairTheDrone(store);
    act(() => store.step(262));
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Connect dock to sorter")?.click());
    act(() => store.step(400));
    act(() => findButton("Build Furnace")?.click());
    act(() => findButton("Build Furnace")?.click());
    act(() => store.step(300));
    expect(store.getState().machines.length).toBe(2);
    store.getState().tutorial = 9;

    const statusLines = () =>
      [...document.querySelectorAll<HTMLElement>(".status-line")].map((node) => node.textContent ?? "");
    const hasSegment = (needle: string) => statusLines().some((line) => line.includes(needle));

    // One refused priced tap with a known pair: purse empty, scrap 13 under the
    // 25-scrap copper-separator price - the pair `need 25 scrap · have 13` is the
    // number that must stop riding the line.
    const s = store.getState();
    s.credits = 0;
    s.store = { scrap: 13 };
    s.storeUnits = 13;
    let toast: string | null = null;
    for (let tap = 0; tap < 24 && toast === null; tap += 1) {
      act(() => document.querySelector<HTMLElement>(".dock__btn--primary")?.click());
      const text = document.querySelector(".toast")?.textContent ?? null;
      if (text !== null && /^Need \d+ \w+ · have \d+$/.test(text)) toast = text;
      const pinned = store.getState();
      pinned.credits = 0;
      if ((pinned.store["scrap"] ?? 0) <= 13) {
        pinned.store = { ...pinned.store, scrap: 13 };
        pinned.storeUnits = Math.max(0, pinned.storeUnits + (13 - (pinned.store["scrap"] ?? 0)));
      }
    }
    if (toast === null) throw new Error("no shortfall reject in twenty-four primary taps");
    const oldTrailing = `Last ${toast.charAt(0).toLowerCase()}${toast.slice(1)}`;
    expect(hasSegment(oldTrailing)).toBe(true);

    // Ticks alone (no tap) keep the segment, exactly as TST-001 measured it.
    act(() => store.step(900));
    expect(hasSegment(oldTrailing)).toBe(true);

    // The first successful tap clears it (DEF-006). 60 scrap / 500 credits is above
    // every rank-1 price on this yard (the 25-scrap copper-separator build, the
    // 30-scrap plain ladder step, the 40-scrap speed face), so a funded tap is
    // accepted; a `build` step arms in two presses (blueprint, then the ghost tile),
    // hence the small loop. The acceptance tap and the retirement of the stale pair
    // are the same reading: whichever press first lifts `revision` must also be the
    // press that leaves the pair off the line.
    const live = store.getState();
    const hadScrap = live.store["scrap"] ?? 0;
    live.credits = 500;
    live.store = { ...live.store, scrap: 60 };
    live.storeUnits += 60 - hadScrap;
    let acceptedAt = 0;
    let segmentAfterAcceptance: boolean | null = null;
    for (let tap = 1; tap <= 4 && acceptedAt === 0; tap += 1) {
      const revision = store.getState().revision;
      act(() => document.querySelector<HTMLElement>(".dock__btn--primary")?.click());
      if (store.getState().revision > revision) {
        acceptedAt = tap;
        segmentAfterAcceptance = hasSegment(oldTrailing);
      }
    }
    expect(acceptedAt).toBeGreaterThan(0); // the funded yard accepted a command
    expect(segmentAfterAcceptance).toBe(false); // and that same press retired the pair

    // 900 further taps: the stale pair never returns as residue. (A fresh reject may
    // print its own newest pair; the old one had `have 13`, a value the funded yard
    // does not sit at while the pulse keeps adding fives.)
    let staleAt = -1;
    for (let tap = 1; tap <= 900; tap += 1) {
      act(() => store.step(10));
      act(() => document.querySelector<HTMLElement>(".dock__btn--primary")?.click());
      if (staleAt < 0 && hasSegment(oldTrailing)) staleAt = tap;
    }
    expect(staleAt).toBe(-1);
  });

  /**
   * CHRM-001 (QA D-2/D-4): the legend names at most two machines, each with the tile it is
   * drawn on, and counts the rest in one `+n`. Two machines of one blueprint therefore read
   * apart, and the line keeps its two wrapped boxes at 360 × 640 text scale 2.0.
   */
  it("CHRM-001 the pip legend caps at two tile-indexed entries plus a +n tail", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    repairTheDrone(store);
    act(() => store.step(262));
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
    expect(store.getState().machines.length).toBe(1);
    // Three more machines through the door: the 2nd and 4th share the 1st's blueprint.
    const state = store.getState();
    state.store["scrap"] = 300;
    state.store["nonferrous"] = 20;
    state.storeUnits += 320;
    for (const [id, blueprint, tile] of [
      ["p1", "sorter", 9],
      ["p2", "polymerRecycler", 10],
      ["p3", "sorter", 11],
    ] as const) {
      act(() => store.dispatch({ id, type: "machine.build", blueprint, tile }));
    }
    act(() => store.step(20));
    expect(store.getState().machines.length).toBe(4);

    const legend =
      [...document.querySelectorAll<HTMLElement>(".status-line")]
        .map((node) => node.textContent ?? "")
        .find((text) => text.startsWith("Batch pips")) ?? "";
    expect(legend.startsWith("Batch pips · ")).toBe(true);
    // At most two entries, each with its tile index inside it.
    const entries = legend.match(/[A-Za-z][A-Za-z ]*#\d+ \d\/5/g) ?? [];
    expect(entries).toHaveLength(2);
    // Duplicate blueprints are separable: same label, two tiles (8 and 9), no repeated text.
    expect(entries[0]).toBe(`Scrap sorter #${store.getState().machines[0].tile} 0/5`);
    expect(entries[1]).toBe(`Scrap sorter #${store.getState().machines[1].tile} 0/5`);
    expect(new Set(entries).size).toBe(2);
    // The unnamed remainder is counted, not dropped: 4 machines - 2 named = +2.
    expect(legend.endsWith(" +2")).toBe(true);
    expect(legend.match(/\d\/5/g)).toHaveLength(2);
    expect(legend).not.toContain("Polymer");
  });
});
