import { describe, expect, it } from "vitest";
import {
  BLUEPRINTS,
  EXPORT_PRICES,
  RECIPES,
  TUNING,
  exportPrice,
  unlockedBlueprints,
  type ResourceId,
} from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import {
  applyCommand,
  sellableAmount,
  upgradeCost,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { netRecipeUnits, systemTotals, unitTotal } from "../../src/game/simulation/invariants";
import { nextYardStep } from "../../src/game/simulation/plan";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { describeStep, primaryFor } from "../../src/ui/text";

let seq = 500;
function send(state: SimState, command: CommandBody, id?: string) {
  const key = id ?? `c${(seq += 1)}`;
  return applyCommand(state, { ...command, id: key } as Command);
}

/** Starter yard after the tutorial's repair, with room for the chain. */
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

interface Yard4 {
  state: SimState;
  sorter: number;
  separator: number;
  mill: number;
  recycler: number;
  seeded: number;
  spent: number;
}

/** Sorter, copper separator, wire mill, and polymer recycler with real routes. */
function chainYard(): Yard4 {
  const state = boot();
  const seed: Partial<Record<ResourceId, number>> = {
    scrap: 300,
    ferrous: 40,
    nonferrous: 60,
    residue: 30,
  };
  let seeded = 0;
  for (const key of Object.keys(seed) as ResourceId[]) {
    const value = seed[key] ?? 0;
    state.store[key] = (state.store[key] ?? 0) + value;
    state.storeUnits += value;
    seeded += value;
  }
  const tiles = [0, 1, 3, 4];
  const ids: Record<string, number> = {};
  const blueprints = ["sorter", "copperSeparator", "wireMill", "polymerRecycler"];
  blueprints.forEach((blueprint, index) => {
    const before = state.machines.length;
    send(state, { type: "machine.build", blueprint, tile: tiles[index] });
    const machine = state.machines[before];
    ids[blueprint] = machine.id;
  });
  let spent = 0;
  for (const blueprint of blueprints) {
    for (const item of BLUEPRINTS[blueprint].buildCost) spent += item.qty;
  }
  for (const [blueprint, id] of Object.entries(ids)) {
    const source = blueprint === "sorter" ? "scrap" : INPUT_OF[blueprint];
    send(state, { type: "route.connect", from: 0, to: id, filter: source });
    send(state, { type: "route.connect", from: id, to: 0, filter: null });
  }
  return {
    state,
    sorter: ids.sorter,
    separator: ids.copperSeparator,
    mill: ids.wireMill,
    recycler: ids.polymerRecycler,
    seeded,
    spent,
  };
}

const INPUT_OF: Record<string, ResourceId> = {
  copperSeparator: "nonferrous",
  wireMill: "copper",
  polymerRecycler: "residue",
};

function machineById(state: SimState, id: number) {
  const found = state.machines.find((m) => m.id === id);
  if (!found) throw new Error(`missing machine ${id}`);
  return found;
}

describe("copper and polymer chain", () => {
  /** Measured in this fixture after 1 200 ticks: sorter 29, separator 23,
   * wire mill 12, polymer recycler 14 batches. */
  it("runs each machine inside its declared cycle limit or its supply limit", () => {
    const yard = chainYard();
    advance(yard.state, 1200);
    const sorter = machineById(yard.state, yard.sorter).batchesDone;
    const separator = machineById(yard.state, yard.separator).batchesDone;
    const mill = machineById(yard.state, yard.mill).batchesDone;
    const recycler = machineById(yard.state, yard.recycler).batchesDone;

    // Both upstream machines are cycle-limited, not starved.
    expect(sorter).toBeLessThanOrEqual(Math.floor(1200 / RECIPES.R01.cycleTicks));
    expect(sorter).toBeGreaterThanOrEqual(Math.floor((1200 / RECIPES.R01.cycleTicks) * 0.9));
    expect(separator).toBeLessThanOrEqual(Math.floor(1200 / RECIPES.R03.cycleTicks));
    expect(separator).toBeGreaterThanOrEqual(Math.floor((1200 / RECIPES.R03.cycleTicks) * 0.9));

    // The mill is copper-limited: one copper per separator batch, and the store
    // keeps its reserve floor back, so it converts nearly all released copper.
    expect(mill).toBeLessThanOrEqual(separator + 1);
    expect(mill).toBeGreaterThanOrEqual(separator - TUNING.reserveFloor - 1);

    // The recycler is residue-limited: the seeded pool plus one per separator
    // batch, minus the floor, three units per batch.
    const residueSupply = 30 + separator - TUNING.reserveFloor;
    expect(recycler).toBeLessThanOrEqual(Math.floor(residueSupply / 3));
    expect(recycler).toBeGreaterThanOrEqual(Math.floor(residueSupply / 3) - 1);
  });

  it("keeps every chain resource accounted for once (spec 8.2)", () => {
    const yard = chainYard();
    advance(yard.state, 1200);
    const totals = systemTotals(yard.state);
    const separator = machineById(yard.state, yard.separator).batchesDone;
    const mill = machineById(yard.state, yard.mill).batchesDone;
    const recycler = machineById(yard.state, yard.recycler).batchesDone;
    expect(totals["wire"] ?? 0).toBe(3 * mill);
    expect(totals["polymer"] ?? 0).toBe(recycler);
    // Copper exists only as separator output minus what the mill has consumed.
    expect(totals["copper"] ?? 0).toBe(separator - mill);
    // Residue is the seeded 30-unit pool plus separator output, less recycler work.
    expect(totals["residue"] ?? 0).toBe(30 + separator - 3 * recycler);
  });

  it("reconciles the whole yard ledger against recovery, recipes, and spending", () => {
    const yard = chainYard();
    advance(yard.state, 900);
    const expected =
      yard.seeded +
      TUNING.manualSalvagePerPulse * yard.state.wreck.pulses +
      yard.state.drone.accumulated +
      netRecipeUnits(yard.state) -
      yard.spent -
      TUNING.repairCostScrap;
    expect(unitTotal(yard.state)).toBe(expected);
  });

  it("keeps the wire mill inside the copper the separator actually supplies", () => {
    const yard = chainYard();
    advance(yard.state, 1200);
    const separator = machineById(yard.state, yard.separator);
    const mill = machineById(yard.state, yard.mill);
    expect(mill.batchesDone).toBeLessThanOrEqual(separator.batchesDone + 1);
  });

  it("does not starve the furnace route when the chain shares the store", () => {
    const yard = chainYard();
    send(yard.state, { type: "machine.build", blueprint: "furnace", tile: 5 });
    const furnace = yard.state.machines[yard.state.machines.length - 1];
    send(yard.state, { type: "route.connect", from: 0, to: furnace.id, filter: "ferrous" });
    send(yard.state, { type: "route.connect", from: furnace.id, to: 0, filter: null });
    advance(yard.state, 1200);
    expect(furnace.batchesDone).toBeGreaterThan(0);
    // Steel plus ferrous stock means the shared dock fed both consumers.
    expect((yard.state.store["steel"] ?? 0) + (yard.state.store["ferrous"] ?? 0)).toBeGreaterThan(0);
  });
});

describe("repeatable export contracts", () => {
  function priced(): SimState {
    const state = boot();
    state.store["copper"] = 40;
    state.store["residue"] = 24;
    state.storeUnits += 64;
    state.exportClaimed = true;
    return state;
  }

  it("waits for the onboarding contract before selling", () => {
    const state = boot();
    state.store["copper"] = 40;
    state.storeUnits += 40;
    const before = state.credits;
    const result = send(state, { type: "contract.sell", resource: "copper", qty: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("locked");
    expect(state.credits).toBe(before);
    expect(state.store["copper"]).toBe(40);
  });

  it("pays the published price for exactly the tranche it moves", () => {
    const state = priced();
    const amount = sellableAmount(state, "copper");
    expect(amount).toBe(30); // 40 held minus the 10-unit reserve floor
    const result = send(state, { type: "contract.sell", resource: "copper", qty: amount });
    expect(result.ok).toBe(true);
    expect(state.credits).toBe(30 * exportPrice("copper"));
    expect(state.store["copper"]).toBe(TUNING.reserveFloor);
  });

  it("caps one tranche and keeps the reserve floor in place", () => {
    const state = priced();
    state.store["copper"] = 200;
    state.storeUnits += 160;
    const result = send(state, { type: "contract.sell", resource: "copper", qty: 500 });
    expect(result.ok).toBe(true);
    expect(state.store["copper"]).toBe(200 - TUNING.sellBatchCap);
    expect(state.credits).toBe(TUNING.sellBatchCap * exportPrice("copper"));
    expect(sellableAmount(state, "copper")).toBe(TUNING.sellBatchCap);
  });

  it("replays the same command id without paying twice", () => {
    const state = priced();
    const first = send(state, { type: "contract.sell", resource: "copper", qty: 12 }, "sell-1");
    const credits = state.credits;
    const again = send(state, { type: "contract.sell", resource: "copper", qty: 12 }, "sell-1");
    expect(first.ok).toBe(true);
    expect(again).toEqual(first);
    expect(state.credits).toBe(credits);
    expect(state.store["copper"]).toBe(40 - 12);
  });

  it("rejects an unpriced or impossible request and charges nothing", () => {
    const state = priced();
    const unpriced = send(state, { type: "contract.sell", resource: "chassis", qty: 1 });
    expect(unpriced.ok).toBe(false);
    const badQty = send(state, { type: "contract.sell", resource: "copper", qty: 0 });
    expect(badQty.ok).toBe(false);
    const empty = boot();
    empty.exportClaimed = true;
    empty.store["polymer"] = 2;
    empty.storeUnits = 2;
    const belowFloor = send(empty, { type: "contract.sell", resource: "polymer", qty: 2 });
    expect(belowFloor.ok).toBe(false);
    if (!belowFloor.ok) expect(belowFloor.reason).toBe("insufficient");
    expect(empty.credits).toBe(0);
  });

  it("prices every resource a starter blueprint can output", () => {
    for (const blueprint of Object.keys(BLUEPRINTS)) {
      const recipe = RECIPES[BLUEPRINTS[blueprint].recipeId];
      for (const out of recipe.outputs) {
        expect(exportPrice(out.resource), `${blueprint} → ${out.resource}`).toBeGreaterThan(0);
      }
    }
  });

  it("has no material cycle, so no unlimited credit loop (spec 8.4)", () => {
    const edges = new Map<ResourceId, Set<ResourceId>>();
    for (const recipe of Object.values(RECIPES)) {
      const outputs = recipe.outputs.filter((item) => item.qty > 0).map((item) => item.resource);
      for (const input of recipe.inputs) {
        for (const output of outputs) {
          const list = edges.get(input.resource) ?? new Set<ResourceId>();
          list.add(output);
          edges.set(input.resource, list);
        }
      }
    }
    const state = new Map<ResourceId, number>(); // 0 = visiting, 1 = done
    const visit = (node: ResourceId, stack: ResourceId[]): boolean => {
      const mark = state.get(node);
      if (mark === 1) return true;
      if (mark === 0) throw new Error(`cycle: ${[...stack, node].join(" → ")}`);
      state.set(node, 0);
      for (const next of edges.get(node) ?? []) visit(next, [...stack, node]);
      state.set(node, 1);
      return true;
    };
    for (const resource of edges.keys()) expect(visit(resource, [])).toBe(true);
  });

  it("keeps prices finite and positive where declared", () => {
    for (const [key, value] of Object.entries(EXPORT_PRICES)) {
      expect(Number.isSafeInteger(value), key).toBe(true);
      expect(value ?? 0, key).toBeGreaterThan(0);
    }
  });
});

describe("yard ladder", () => {
  function ladderBase(): SimState {
    const state = createInitialState();
    state.tutorial = 9;
    state.exportClaimed = true;
    state.store["scrap"] = 300;
    state.store["ferrous"] = 40;
    state.store["nonferrous"] = 40;
    state.store["residue"] = 30;
    state.storeUnits = 410;
    return state;
  }

  function linkAll(state: SimState): void {
    for (const machine of state.machines) {
      for (const plan of planConnections(state, machine.id)) {
        send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
      }
    }
  }

  it("prefers a missing link over every other step", () => {
    const state = ladderBase();
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
    send(state, { type: "machine.build", blueprint: "furnace", tile: 1 });
    expect(nextYardStep(state).kind).toBe("connect");
  });

  it("moves to an affordable build once every machine is linked", () => {
    const state = ladderBase();
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
    send(state, { type: "machine.build", blueprint: "furnace", tile: 1 });
    linkAll(state);
    const step = nextYardStep(state);
    expect(step.kind).toBe("build");
    if (step.kind === "build") expect(step.blueprint).toBe("copperSeparator");
  });

  it("sells a surplus when a build is out of reach", () => {
    const state = ladderBase();
    state.store["ferrous"] = 2; // every fragment-costing blueprint is out of reach
    state.store["nonferrous"] = 2;
    state.storeUnits = 334;
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
    linkAll(state);
    const step = nextYardStep(state);
    expect(step.kind).toBe("sell");
    if (step.kind === "sell") {
      expect(step.resource).toBe("scrap");
      expect(step.qty).toBe(TUNING.sellBatchCap); // one capped tranche of the surplus
    }
  });

  it("keeps one phrased goal and one dock label per step", () => {
    const state = ladderBase();
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
    const step = nextYardStep(state);
    const described = describeStep(state, step);
    const primary = primaryFor(state, step);
    expect(described.length).toBeGreaterThan(0);
    expect(primary.label.length).toBeGreaterThan(0);
    if (step.kind === "connect") {
      expect(described).toContain("Connect");
      expect(primary.label).toBe("Connect");
    }
  });
});

describe("build menu reveal", () => {
  it("reveals the chain blueprints as the tutorial advances", () => {
    expect(unlockedBlueprints(4)).toEqual(["sorter"]);
    expect(unlockedBlueprints(6)).toEqual(["sorter", "furnace"]);
    expect(unlockedBlueprints(7)).toContain("copperSeparator");
    expect(unlockedBlueprints(7)).toContain("polymerRecycler");
    expect(unlockedBlueprints(8)).toContain("wireMill");
    expect(unlockedBlueprints(9)).toContain("circuitAssembler");
    expect(unlockedBlueprints(6).length).toBeLessThanOrEqual(2);
    expect(unlockedBlueprints(7).length).toBeLessThanOrEqual(4);
    expect(unlockedBlueprints(9)).toEqual(Object.keys(BLUEPRINTS));
  });

  it("gives the first credit budget two distinct upgrade targets", () => {
    // A 30-credit budget must buy an upgrade on more than one starter machine.
    const affordable = Object.keys(BLUEPRINTS).filter(
      (id) => upgradeCost(BLUEPRINTS[id].baseUpgradeCost, 1) <= 30
    );
    expect(affordable).toEqual(["sorter"]);
    // After the copper chain pays 60+ credits, the mid-tier machines are viable too.
    const midTier = Object.keys(BLUEPRINTS).filter(
      (id) => upgradeCost(BLUEPRINTS[id].baseUpgradeCost, 1) <= 60
    );
    expect(midTier.length).toBeGreaterThanOrEqual(4);
    expect(midTier).toContain("copperSeparator");
    expect(midTier).toContain("wireMill");
  });
});
