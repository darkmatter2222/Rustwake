import { describe, expect, it } from "vitest";
import { TUNING, type ResourceId } from "../../src/game/content/defs";
import {
  applyCommand,
  upgradeCost,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { SELL_ORDER, nextYardStep } from "../../src/game/simulation/plan";
import { createInitialState, type SimState } from "../../src/game/simulation/types";

let seq = 700;
function send(state: SimState, command: CommandBody, id?: string) {
  const key = id ?? `p${(seq += 1)}`;
  return applyCommand(state, { ...command, id: key } as Command);
}

function seed(state: SimState, amounts: Partial<Record<ResourceId, number>>) {
  for (const key of Object.keys(amounts) as ResourceId[]) {
    const value = amounts[key] ?? 0;
    state.store[key] = (state.store[key] ?? 0) + value;
    state.storeUnits += value;
  }
}

/** Empty yard at a chosen unlock step, with the ledger set by the test. */
function yard(tutorial: number, store: Partial<Record<ResourceId, number>>, credits = 0): SimState {
  const state = createInitialState();
  state.tutorial = tutorial;
  state.credits = credits;
  seed(state, store);
  return state;
}

describe("yard ladder (spec 3.3, 10.5)", () => {
  it("sells a free surplus instead of the scrap the next machine needs", () => {
    const state = yard(7, { scrap: 15, ferrous: 3, nonferrous: 3, residue: 14 });
    // Scrap leads SELL_ORDER and is above the floor, so the old ladder stopped
    // there and the store never reached a machine price. Residue is in no price.
    expect(SELL_ORDER[0]).toBe("scrap");
    expect(nextYardStep(state)).toEqual({ kind: "sell", resource: "residue", qty: 4 });
    // Selling it does not touch the pending inputs.
    send(state, { type: "contract.sell", resource: "residue", qty: 4 });
    expect(state.store.scrap).toBe(15);
    expect(state.store.ferrous).toBe(3);
  });

  it("prefers an affordable machine over a surplus sell", () => {
    const state = yard(7, { scrap: 30, ferrous: 6, nonferrous: 6, residue: 14 });
    expect(nextYardStep(state)).toEqual({ kind: "build", blueprint: "sorter" });
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 0 }).ok).toBe(true);
    expect(state.machines[state.machines.length - 1].blueprint).toBe("sorter");
  });

  it("names the unbuilt machine whose inputs are closest to complete", () => {
    // Furnace lacks 1 ferrous, sorter 8 scrap, separator 14, recycler 17, so the
    // furnace is the nearer goal and the card should point at it.
    const state = yard(7, { scrap: 12, ferrous: 4, nonferrous: 1 });
    const step = nextYardStep(state);
    expect(step).toEqual({ kind: "build", blueprint: "furnace" });
  });

  it("upgrades the busiest stage at equal level, then the lower level", () => {
    const state = yard(9, { scrap: 60, residue: 14 }, 80);
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 0 }).ok).toBe(true);
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 1 }).ok).toBe(true);
    const [a, b] = state.machines;
    // Linked yards have no pending connections left, so the ladder can reach
    // spending steps instead of the transport plan.
    for (const machine of [a, b]) {
      send(state, { type: "route.connect", from: 0, to: machine.id, filter: "scrap" });
      send(state, { type: "route.connect", from: machine.id, to: 0, filter: "ferrous" });
      // R01 has two outputs, so a fully linked sorter carries both.
      send(state, { type: "route.connect", from: machine.id, to: 0, filter: "nonferrous" });
    }
    expect(nextYardStep(state).kind).not.toBe("connect");
    a.busyTicks = 10;
    b.busyTicks = 40;

    // Equal levels: the busiest stage is the limit, so it is upgraded first.
    expect(nextYardStep(state)).toEqual({ kind: "upgrade", machineId: b.id });

    b.level = 2;
    expect(upgradeCost(30, 2)).toBeLessThanOrEqual(state.credits);
    // A lower level now leads even though it is the less busy stage.
    expect(nextYardStep(state)).toEqual({ kind: "upgrade", machineId: a.id });

    // Nothing affordable left: the pending scrap waits for the next machine, so
    // the free surplus sells instead.
    state.credits = 1;
    expect(nextYardStep(state)).toEqual({ kind: "sell", resource: "residue", qty: 4 });
    // And with no free surplus at all, the card simply names the near build.
    state.store.residue = 0;
    state.storeUnits -= 14;
    expect(nextYardStep(state)).toEqual({ kind: "build", blueprint: "furnace" });
  });

  it("keeps one concrete action available at every ledger state", () => {
    // A fresh yard is told what to build first, before it can even pay for it.
    expect(nextYardStep(createInitialState())).toEqual({ kind: "build", blueprint: "sorter" });
    // A busy store still has exactly one step, and no quantity is impossible.
    const full = yard(9, { scrap: TUNING.sellBatchCap, ferrous: 2, nonferrous: 2 }, 500);
    expect([
      "sell",
      "build",
      "upgrade",
      "research",
      "connect",
      "salvage",
    ]).toContain(nextYardStep(full).kind);
  });
});
