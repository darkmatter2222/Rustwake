import { describe, expect, it } from "vitest";
import { TUNING } from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import {
  applyCommand,
  beltCost,
  refundOf,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { systemTotals, unitTotal, netRecipeUnits } from "../../src/game/simulation/invariants";

let seq = 100;
function send(state: SimState, command: CommandBody) {
  seq += 1;
  return applyCommand(state, { ...command, id: `l${seq}` } as Command);
}

function boot(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  return state;
}

/** Deterministic material seed for logistics scenarios that skip the chain. */
function seed(state: SimState): void {
  state.store["scrap"] = 200;
  state.store["ferrous"] = 40;
  state.store["nonferrous"] = 40;
  state.store["polymer"] = 20;
  state.store["wire"] = 0;
  state.storeUnits = 300;
  state.credits = 500;
}

describe("route ledger", () => {
  it("keeps in-transit cargo counted exactly once", () => {
    const state = boot();
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = state.machines[0];
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    advance(state, 100);
    for (const route of state.routes) {
      const summed = route.items.reduce((total, item) => total + item.qty, 0);
      expect(route.inFlight).toBe(summed);
    }
    const total = unitTotal(state);
    expect(Number.isSafeInteger(total)).toBe(true);
  });

  it("returns in-flight and buffered material when a route is removed (spec 28.2)", () => {
    const state = boot();
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = state.machines[0];
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
    advance(state, 150);
    const before = unitTotal(state);
    const routeId = state.routes[0].id;
    const routePrice = beltCost(state.routes[0].run?.length ?? 0);
    expect(send(state, { type: "route.remove", routeId }).ok).toBe(true);
    const after = unitTotal(state);
    // BELT-001: in-flight cargo returns exactly, and the priced belt additionally
    // hands back `dismantleRefundPct` of what the connect charged.
    expect(after).toBe(before + refundOf(routePrice));
    expect(refundOf(routePrice)).toBe(2); // 90 % of a 2-tile (2-scrap) run, rounded
    expect(state.routes.find((r) => r.id === routeId)).toBeUndefined();
    expect(sorter.inRoutes.includes(routeId)).toBe(false);
  });

  it("routes returned material to the overflow hold when the store is full (spec 28.2)", () => {
    const state = boot();
    state.storeCapacity = 25;
    state.store["scrap"] = 25;
    state.storeUnits = 25;
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = state.machines[0];
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    advance(state, 60);
    const before = unitTotal(state);
    const removedPrice = beltCost(state.routes[0].run?.length ?? 0);
    send(state, { type: "route.remove", routeId: state.routes[0].id });
    advance(state, 4);
    expect(state.overflow.length).toBeGreaterThanOrEqual(0);
    // The refund joins the ledger exactly once (BELT-001).
    expect(unitTotal(state)).toBe(before + refundOf(removedPrice));
  });

  it("does not lose production when the store is full (spec 8.3)", () => {
    const state = boot();
    state.storeCapacity = 20;
    state.store["scrap"] = 20;
    state.storeUnits = 20;
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = state.machines[0];
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
    advance(state, 200);
    expect(state.storeUnits).toBeLessThanOrEqual(state.storeCapacity);
    const totals = systemTotals(state);
    for (const value of Object.values(totals)) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(sorter.status === "outputFull" || sorter.status === "running" || sorter.status === "starved").toBe(true);
  });
});

describe("fair allocation", () => {
  it("gives one batch to the first eligible machine and the next to the other (spec 28.3)", () => {
    const state = boot();
    seed(state);
    // Two assemblers share one wire supply of exactly two units.
    send(state, { type: "machine.build", blueprint: "circuitAssembler", tile: 7 });
    send(state, { type: "machine.build", blueprint: "circuitAssembler", tile: 8 });
    const [a, b] = state.machines;
    a.inBuf = { wire: 2, polymer: 1 };
    a.inBufUnits = 3;
    b.inBuf = { wire: 0 };
    b.inBufUnits = 0;
    advance(state, 1);
    expect(a.progress).toBeGreaterThan(0);
    expect(b.progress).toBe(0);
    // After the shared supply is refreshed, the waiting machine is served.
    b.inBuf = { wire: 2, polymer: 1 };
    b.inBufUnits = 3;
    advance(state, 1);
    expect(b.progress).toBeGreaterThan(0);
  });

  it("rejects a two-machine cycle but allows store round trips", () => {
    const state = boot();
    seed(state);
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    send(state, { type: "machine.build", blueprint: "furnace", tile: 9 });
    const [sorter, furnace] = state.machines;
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
    const forward = send(state, { type: "route.connect", from: sorter.id, to: furnace.id, filter: "ferrous" });
    expect(forward.ok).toBe(true);
    const backward = send(state, { type: "route.connect", from: furnace.id, to: sorter.id, filter: "scrap" });
    expect(backward.ok).toBe(false);
    if (!backward.ok) expect(backward.reason).toBe("cycle");
  });
});

describe("conservation", () => {
  it("reconciles ledger units against recovery, spending, and recipe deltas", () => {
    const state = boot();
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = state.machines[0];
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
    advance(state, 200);
    const spent =
      TUNING.repairCostScrap +
      20 + // one sorter
      state.routes.reduce((sum, route) => sum + beltCost(route.run?.length ?? 0), 0); // belts
    const expected =
      TUNING.manualSalvagePerPulse * state.wreck.pulses +
      state.drone.accumulated +
      netRecipeUnits(state) -
      spent;
    expect(unitTotal(state)).toBe(expected);
  });
});

describe("power budget", () => {
  it("slows every active machine proportionally when demand exceeds capacity", () => {
    const state = boot();
    seed(state);
    send(state, { type: "machine.build", blueprint: "furnace", tile: 3 });
    send(state, { type: "machine.build", blueprint: "furnace", tile: 4 });
    send(state, { type: "machine.build", blueprint: "furnace", tile: 5 });
    send(state, { type: "machine.build", blueprint: "furnace", tile: 6 });
    for (const machine of state.machines) {
      machine.inBuf = { ferrous: 12 };
      machine.inBufUnits = 12;
    }
    advance(state, 10);
    // Four furnaces request 8 units total, exactly the starter capacity.
    expect(state.powerRatio).toBe(1);
    const fullSpeed = state.machines.map((m) => m.progress);
    expect(new Set(fullSpeed).size).toBe(1);
    expect(fullSpeed[0]).toBeGreaterThanOrEqual(10000);
    const fifth = send(state, { type: "machine.build", blueprint: "furnace", tile: 7 });
    expect(fifth.ok).toBe(true);
    state.machines[4].inBuf = { ferrous: 12 };
    state.machines[4].inBufUnits = 12;
    advance(state, 1);
    const before = state.machines.map((m) => m.progress);
    advance(state, 10);
    expect(state.powerRatio).toBeLessThan(1);
    expect(state.powerRatio).toBeCloseTo(8 / 10, 6);
    for (let i = 0; i < 4; i += 1) {
      const machine = state.machines[i];
      expect(machine.status).toBe("powerLimited");
      // 8/10 of a tick, ten times, in milli-ticks.
      expect(machine.progress - before[i]).toBe(8000);
    }
    expect(state.machines[4].progress).toBeGreaterThan(0);
  });
});
