import { describe, expect, it } from "vitest";
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
import { advance, advanceTo } from "../../src/game/simulation/engine";
import { applyCommand } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { allQuantities } from "../../src/game/simulation/invariants";

/**
 * Headless CPU timings for the deterministic core. These are Node numbers on
 * the development machine, not mobile frame-rate claims (spec 21.6).
 */

function starterYard(machines: number): SimState {
  const state = createInitialState();
  applyCommand(state, { id: "b-seed", type: "manual.salvage" });
  advance(state, 6);
  state.store["scrap"] = 100000;
  state.store["ferrous"] = 100000;
  state.store["nonferrous"] = 100000;
  state.storeUnits = 300000;
  state.storeCapacity = 400000;
  state.credits = 100000;
  // The stress harness fills machines directly so it can exceed the
  // starter yard's 36 placement cells while using real blueprint data.
  for (let i = 0; i < machines; i += 1) {
    const blueprint = i % 2 === 0 ? "sorter" : "copperSeparator";
    const recipe = RECIPES[BLUEPRINTS[blueprint].recipeId];
    state.machines.push({
      id: state.nextMachineId++,
      blueprint,
      tile: i,
      orientation: 0,
      level: 1 + (i % 3),
      inBuf: { scrap: 12, nonferrous: 12, ferrous: 12 },
      inBufUnits: 36,
      tray: [],
      trayUnits: 0,
      batch: [],
      progress: 0,
      progressRem: 0,
      progressDen: 0,
      batchMilli: recipe.cycleTicks * 1000,
      batchPower: recipe.power,
      status: "idle",
      inRoutes: [],
      outRoute: null,
      starvedTicks: 0,
      batchesDone: 0,
      ageTicks: 0,
      busyTicks: 0,
      fullTicks: 0,
      rateAge: 0,
      rateFrom: 0,
      rateAgePrev: 0,
      rateFromPrev: 0,
    });
  }
  return state;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function time(label: string, fn: () => void, repeats = 3): number {
  const samples: number[] = [];
  for (let i = 0; i < repeats; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  const value = median(samples);
  console.log(`bench ${label}: ${value.toFixed(2)} ms (median of ${repeats})`);
  return value;
}

describe("headless simulation cost", () => {
  it("steps twelve hours of the starter yard quickly", () => {
    let state = starterYard(4);
    const ms = time("12h starter yard (4 machines, tick-by-tick)", () => {
      state = starterYard(4);
      advance(state, TUNING.offlineCapTicks);
    });
    expect(state.tick).toBe(6 + TUNING.offlineCapTicks);
    expect(state.storeUnits).toBeGreaterThan(0);
    expect(ms).toBeLessThan(400);
  });

  it("jumps idle ranges through the event path", () => {
    const state = createInitialState();
    const ms = time("12h idle yard (advanceTo)", () => {
      advanceTo(state, TUNING.offlineCapTicks);
    });
    expect(state.tick).toBe(TUNING.offlineCapTicks);
    expect(ms).toBeLessThan(5);
  });

  it("handles a five hundred machine stress graph", () => {
    const state = starterYard(500);
    expect(state.machines.length).toBe(500);
    const ms = time("500 machines, 6000 ticks", () => {
      advance(state, 6000);
    });
    for (const value of allQuantities(state)) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(ms).toBeLessThan(1000);
  });

  it("quantifies per-tick cost per machine count", () => {
    const results: Record<number, number> = {};
    for (const count of [1, 5, 50, 100]) {
      const state = starterYard(count);
      results[count] = time(`${count} machines, 10000 ticks`, () => advance(state, 10000));
    }
    expect(results[100]).toBeGreaterThan(results[1]);
  });
});
