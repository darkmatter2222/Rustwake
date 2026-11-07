import { describe, expect, it } from "vitest";
import { type ResourceId } from "../../src/game/content/defs";
import {
  applyCommand,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import {
  createInitialState,
  type SimState,
} from "../../src/game/simulation/types";

let seq = 900;
function send(state: SimState, command: CommandBody, id?: string) {
  const key = id ?? `a${(seq += 1)}`;
  return applyCommand(state, { ...command, id: key } as Command);
}

function seed(state: SimState, amounts: Partial<Record<ResourceId, number>>) {
  for (const key of Object.keys(amounts) as ResourceId[]) {
    const value = amounts[key] ?? 0;
    state.store[key] = (state.store[key] ?? 0) + value;
    state.storeUnits += value;
  }
}

/** Paid-for starter yard: sorter plus one processor, with a chosen store. */
function yard(
  blueprint: string,
  store: Partial<Record<ResourceId, number>>,
): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  seed(state, { scrap: 80, ...store });
  expect(
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 }).ok,
  ).toBe(true);
  expect(send(state, { type: "machine.build", blueprint, tile: 1 }).ok).toBe(
    true,
  );
  return state;
}

describe("connection plans (spec 10.1, B-23)", () => {
  it("takes a stocked material from the store even though a producer exists", () => {
    // Furnace: 2 ferrous per batch. Ferrous is left at 1 by the build costs, so
    // this is the case where the sorter's own tray is the only source.
    const state = yard("furnace", { ferrous: 6, nonferrous: 1 });
    const furnace = state.machines[1];
    const plans = planConnections(state, furnace.id);
    // BELT-001: each plan reports its tile run length so the dock can print the
    // price without a second pass: tile 1 (furnace) beside the dock at tile 2 is a
    // 2-tile Manhattan run.
    expect(plans).toContainEqual({
      from: state.machines[0].id,
      to: furnace.id,
      filter: "ferrous",
      tiles: 2,
    });
    expect(plans.filter((plan) => plan.to === furnace.id)).toHaveLength(1);
  });

  it("prefers the stocked store once it holds a whole batch", () => {
    const state = yard("furnace", { ferrous: 20, nonferrous: 20 });
    const furnace = state.machines[1];
    const plans = planConnections(state, furnace.id);
    expect(plans).toContainEqual({
      from: 0,
      to: furnace.id,
      filter: "ferrous",
      tiles: 2, // dock tile 2 -> furnace tile 1
    });
    // One link per material per direction: the store path replaces the producer
    // path instead of sitting next to it.
    expect(plans.filter((plan) => plan.to === furnace.id)).toHaveLength(1);
  });

  it("adds nothing more once every material has a link", () => {
    const state = yard("furnace", { ferrous: 20, nonferrous: 20 });
    const furnace = state.machines[1];
    for (const plan of planConnections(state, furnace.id)) {
      send(state, {
        type: "route.connect",
        from: plan.from,
        to: plan.to,
        filter: plan.filter,
      });
    }
    expect(state.routes.length).toBe(2);
    // A second call is the same question with the same answer: no duplicates.
    expect(planConnections(state, furnace.id)).toEqual([]);
    for (const plan of planConnections(state, furnace.id)) {
      send(state, {
        type: "route.connect",
        from: plan.from,
        to: plan.to,
        filter: plan.filter,
      });
    }
    expect(state.routes.length).toBe(2);
  });

  it("gives a two-output recipe one link per material, not one per pair", () => {
    const state = yard("furnace", { ferrous: 20, nonferrous: 20 });
    const sorter = state.machines[0];
    const plans = planConnections(state, sorter.id);
    const shipped = plans
      .filter((plan) => plan.from === sorter.id)
      .map((plan) => plan.filter);
    expect(shipped).toContain("ferrous");
    expect(shipped).toContain("nonferrous");
    expect(new Set(shipped).size).toBe(shipped.length);
  });
});
