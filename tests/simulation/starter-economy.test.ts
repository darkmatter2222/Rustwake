/**
 * Issue #144 (RW3D T17) — starter economy, processors and the first steel choice.
 *
 * Deterministic, seeded proofs for the three acceptance invariants the issue cites:
 *  - E01: resource conservation across every container before/after EVERY lifecycle
 *    command, with currencies reconciling to the ledger.
 *  - E06: free slow recovery prevents bankrupt deadlock; the automated policy keeps
 *    the reserve floor and route filters; clicking cannot auto-select every plan.
 *  - U05: research/upgrade comparisons show actual before/after cost/power/rate; two
 *    deliberate strategies and a blind prominent-action policy diverge from one seed,
 *    so there is no universal auto-choice.
 *
 * Every test boots from `createInitialState()` (the live game's seed) and a fixed
 * command script, so the seed/state is reproducible and the expected/actual numbers
 * below are read from the same content tables the engine charges. Non-vision role:
 * numeric checks only. Any U05 visual fidelity is owed at #151.
 */
import { describe, expect, it } from "vitest";
import { BLUEPRINTS, RECIPES, TUNING, exportPrice } from "../../src/game/content/defs";
import { RESEARCH, researchBonus, researchComparison } from "../../src/game/content/research";
import { advance, addToStore } from "../../src/game/simulation/engine";
import {
  applyCommand,
  beltCost,
  beltRun,
  branchPrice,
  droneAddCost,
  refundOf,
  sellableAmount,
  upgradeComparison,
  upgradeCost,
  upgradePlans,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  UPGRADE_BRANCHES,
  batchMilliOf,
  createInitialState,
  inputCapacityOf,
  powerOf,
  upgradeRanks,
  type SimState,
  type UpgradeBranch,
} from "../../src/game/simulation/types";
import { systemTotals, unitTotal } from "../../src/game/simulation/invariants";

let seq = 0;
function send(state: SimState, command: CommandBody, id = `se${++seq}`) {
  return applyCommand(state, { ...command, id } as Command);
}

/** Six free cutting pulses: the opening seed's only income before the drone runs. */
function sixPulses(state: SimState): void {
  for (let i = 0; i < 6; i += 1) {
    expect(send(state, { type: "manual.salvage" }).ok).toBe(true);
    advance(state, TUNING.manualPulseTicks);
  }
}

/**
 * The live starter bootstrap up to (but not including) the first export: free pulses
 * fund the drone repair, the drone funds the sorter, the sorter's ferrous funds the
 * furnace, and the furnace makes the first steel. Reproducible from the empty seed.
 */
function bootstrapChain(): SimState {
  const state = createInitialState();
  sixPulses(state);
  expect(send(state, { type: "drone.repair" }).ok).toBe(true);
  advance(state, 262);
  expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(true);
  const sorter = state.machines[0];
  send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advance(state, 400);
  expect(send(state, { type: "machine.build", blueprint: "furnace", tile: 9 }).ok).toBe(true);
  const furnace = state.machines[1];
  send(state, { type: "route.connect", from: sorter.id, to: furnace.id, filter: "ferrous" });
  send(state, { type: "route.connect", from: furnace.id, to: 0, filter: "steel" });
  advance(state, 900);
  return state;
}

function bootstrapToExport(): SimState {
  const state = bootstrapChain();
  expect(send(state, { type: "contract.export" }).ok).toBe(true);
  return state;
}

/** A funded, reproducible yard for the conservation matrix and the fork. */
function conservationSeed(): SimState {
  const state = bootstrapToExport();
  advance(state, 300);
  addToStore(state, "scrap", 120);
  addToStore(state, "ferrous", 60);
  addToStore(state, "steel", 40);
  addToStore(state, "data", 30);
  state.credits = 1000;
  return state;
}

interface Ledger {
  units: number;
  credits: number;
}
function ledger(state: SimState): Ledger {
  return { units: unitTotal(state), credits: state.credits };
}

/**
 * E01: apply one command and assert the whole-system unit delta and the credit delta
 * equal the command's documented external source/sink. Cargo that merely moves between
 * containers (machine -> store, route -> store) nets to zero; only priced sinks, refunds
 * and the wreck's free scrap change the total.
 */
function expectConserved(
  state: SimState,
  command: CommandBody,
  expectedUnits: number,
  expectedCredits: number
): void {
  const before = ledger(state);
  const result = send(state, command);
  expect(result.ok).toBe(true);
  const after = ledger(state);
  expect(after.units - before.units).toBe(expectedUnits);
  expect(after.credits - before.credits).toBe(expectedCredits);
  // Every container stays a safe nonnegative integer after the command.
  for (const value of Object.values(systemTotals(state))) {
    expect(Number.isSafeInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
  expect(Number.isSafeInteger(state.credits)).toBe(true);
}

describe("#144 starter affordance and the first steel choice", () => {
  it("the empty seed buys both first processors through free recovery only", () => {
    const seed = createInitialState();
    expect(seed.store).toEqual({});
    expect(seed.credits).toBe(0);
    expect(seed.wreck.remaining).toBe(TUNING.starterWreckPool);

    const state = bootstrapToExport();
    expect(state.machines.map((m) => m.blueprint)).toEqual(["sorter", "furnace"]);
    // The first steel choice paid the onboarding contract and left credits to fork with.
    expect(state.exportClaimed).toBe(true);
    expect(state.credits).toBe(TUNING.exportContractCredits);
    expect(state.exportSteelDelivered).toBe(TUNING.exportContractSteel);
    expect(state.tutorial).toBeGreaterThanOrEqual(7);
    // No credit was spent to reach the first export: recovery was free (E06).
    expect(state.spares.length).toBe(0);
  });

  it("processor power and buffers reconcile to the content table", () => {
    const state = bootstrapToExport();
    const sorter = state.machines[0];
    const furnace = state.machines[1];
    expect(powerOf(sorter)).toBe(RECIPES[BLUEPRINTS.sorter.recipeId].power);
    expect(powerOf(furnace)).toBe(RECIPES[BLUEPRINTS.furnace.recipeId].power);
    expect(powerOf(sorter)).toBe(1);
    expect(powerOf(furnace)).toBe(2);
    expect(inputCapacityOf(sorter, researchBonus(state).inputBuffer)).toBe(
      BLUEPRINTS.sorter.inputBuffer
    );
    expect(inputCapacityOf(furnace, researchBonus(state).inputBuffer)).toBe(
      BLUEPRINTS.furnace.inputBuffer
    );
    // The two running processors fit the yard power budget, so neither is rationed.
    expect(powerOf(sorter) + powerOf(furnace)).toBeLessThanOrEqual(TUNING.yardPowerCapacity);
    expect(state.powerRatio).toBe(1);
  });

  it("the first steel leaves a meaningful, priced fork (no free universal pick)", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    const plans = upgradePlans(state, furnace.id);
    expect(plans.map((p) => p.branch)).toEqual([...UPGRADE_BRANCHES]);
    const speed = plans.find((p) => p.branch === "speed")!;
    const draw = plans.find((p) => p.branch === "draw")!;
    // Throughput plan costs a premium; the power plan keeps the plain ladder.
    expect(speed.cost).toBe(branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, 1, "speed"));
    expect(draw.cost).toBe(branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, 1, "draw"));
    expect(speed.cost).toBeGreaterThan(draw.cost);
    // Neither plan dominates: speed wins rate, draw wins power (U05).
    expect(speed.after.batchesPerMinute).toBeGreaterThan(speed.before.batchesPerMinute);
    expect(speed.after.power).toBe(speed.before.power);
    expect(draw.after.power).toBeLessThan(draw.before.power);
    expect(draw.after.batchesPerMinute).toBe(draw.before.batchesPerMinute);
  });
});

describe("#144 E01 conservation before/after every lifecycle command", () => {
  it("manual.salvage adds free wreck scrap, credits untouched", () => {
    const state = createInitialState();
    const remaining = state.wreck.remaining;
    expectConserved(state, { type: "manual.salvage" }, TUNING.manualSalvagePerPulse, 0);
    expect(state.wreck.remaining).toBe(remaining - TUNING.manualSalvagePerPulse);
    expect(state.wreck.pulses).toBe(1);
  });

  it("drone.repair sinks exactly the repair scrap", () => {
    const state = createInitialState();
    sixPulses(state);
    expectConserved(state, { type: "drone.repair" }, -TUNING.repairCostScrap, 0);
  });

  it("machine.build sinks exactly the blueprint build cost", () => {
    const state = createInitialState();
    sixPulses(state);
    send(state, { type: "drone.repair" });
    advance(state, 262);
    const cost = BLUEPRINTS.sorter.buildCost.reduce((sum, item) => sum + item.qty, 0);
    expectConserved(state, { type: "machine.build", blueprint: "sorter", tile: 8 }, -cost, 0);
  });

  it("route.connect sinks the priced belt run", () => {
    const state = conservationSeed();
    const run = beltRun(state, 0, state.machines[1].id);
    expectConserved(
      state,
      { type: "route.connect", from: 0, to: state.machines[1].id, filter: "ferrous" },
      -beltCost(run.length),
      0
    );
  });

  it("machine.upgrade sinks credits only, cargo conserved", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    const cost = branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, furnace.level, "speed");
    expectConserved(state, { type: "machine.upgrade", machineId: furnace.id, branch: "speed" }, 0, -cost);
  });

  it("machine.respec is free: no cargo and no credit moves", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    send(state, { type: "machine.upgrade", machineId: furnace.id, branch: "speed" });
    expectConserved(state, { type: "machine.respec", machineId: furnace.id, branch: "draw" }, 0, 0);
    expect(furnace.branch?.[furnace.branch.length - 1]).toBe("draw");
  });

  it("machine.dismantle refunds the discounted build cost, cargo returns in full", () => {
    const state = conservationSeed();
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 11 }).ok).toBe(true);
    const spare = state.machines[state.machines.length - 1];
    const refund = BLUEPRINTS.sorter.buildCost.reduce((sum, item) => sum + refundOf(item.qty), 0);
    expectConserved(state, { type: "machine.dismantle", machineId: spare.id }, refund, 0);
  });

  it("machine.move sinks the relocation penalty", () => {
    const state = conservationSeed();
    const sorter = state.machines[0];
    const penalty = BLUEPRINTS.sorter.buildCost.reduce(
      (sum, item) => sum + Math.round((item.qty * TUNING.movePenaltyPct) / 100),
      0
    );
    expectConserved(state, { type: "machine.move", machineId: sorter.id, tile: 10 }, -penalty, 0);
  });

  it("route.remove returns the belt refund, in-flight cargo conserved", () => {
    const state = conservationSeed();
    const route = state.routes[0];
    const refund = refundOf(beltCost(route.run?.length ?? 0));
    expectConserved(state, { type: "route.remove", routeId: route.id }, refund, 0);
  });

  it("contract.export sinks steel and grants the contract credits", () => {
    const state = bootstrapChain();
    expect(state.exportClaimed).toBe(false);
    expectConserved(
      state,
      { type: "contract.export" },
      -TUNING.exportContractSteel,
      TUNING.exportContractCredits
    );
  });

  it("contract.sell sinks the sold quantity and grants price x quantity", () => {
    const state = conservationSeed();
    const amount = sellableAmount(state, "steel");
    expect(amount).toBeGreaterThan(0);
    const price = exportPrice("steel");
    expectConserved(state, { type: "contract.sell", resource: "steel", qty: amount }, -amount, price * amount);
  });

  it("research.buy sinks data only", () => {
    const state = conservationSeed();
    expectConserved(state, { type: "research.buy", node: "cutters" }, -RESEARCH.cutters.cost, 0);
  });

  it("drone.add sinks credits only, cargo conserved", () => {
    const state = conservationSeed();
    const cost = droneAddCost(state);
    expectConserved(state, { type: "drone.add" }, 0, -cost);
  });
});

describe("#144 E06 free slow recovery prevents bankrupt deadlock", () => {
  it("at zero credits and an empty store, free salvage still rebuilds income", () => {
    const state = bootstrapToExport();
    // Consume every discretionary credit and drain the store: the bankrupt corner.
    state.credits = 0;
    for (const key of Object.keys(state.store) as (keyof typeof state.store)[]) {
      state.store[key] = 0;
    }
    state.storeUnits = 0;
    state.overflow = [];
    advance(state, TUNING.manualPulseTicks);

    // The free slow recovery pulse is still available with no money at all.
    const pulse = send(state, { type: "manual.salvage" });
    expect(pulse.ok).toBe(true);
    expect(state.store.scrap).toBe(TUNING.manualSalvagePerPulse);
    expect(state.credits).toBe(0);

    // Repeat pulses bank enough scrap to sell back into credits: no deadlock.
    for (let i = 0; i < 6; i += 1) {
      advance(state, TUNING.manualPulseTicks);
      send(state, { type: "manual.salvage" });
    }
    const sellable = sellableAmount(state, "scrap");
    expect(sellable).toBeGreaterThan(0);
    const sold = send(state, { type: "contract.sell", resource: "scrap", qty: sellable });
    expect(sold.ok).toBe(true);
    expect(state.credits).toBeGreaterThan(0);
  });

  it("the wreck regenerates, so recovery never runs out", () => {
    const state = createInitialState();
    const generation = state.wreck.generation;
    // Exhaust the finite pool; the pulse that empties it seeds the next generation.
    for (let i = 0; i < TUNING.starterWreckPool / TUNING.manualSalvagePerPulse; i += 1) {
      send(state, { type: "manual.salvage" });
      advance(state, TUNING.manualPulseTicks);
    }
    expect(state.wreck.generation).toBeGreaterThan(generation);
    expect(state.wreck.remaining).toBe(TUNING.starterWreckPool);
    expect(send(state, { type: "manual.salvage" }).ok).toBe(true);
  });

  it("the automated sell policy keeps the reserve floor and machine demand", () => {
    const state = conservationSeed();
    const held = state.store.steel ?? 0;
    const amount = sellableAmount(state, "steel");
    expect(amount).toBeLessThanOrEqual(held - TUNING.reserveFloor);
    expect(amount).toBeLessThanOrEqual(TUNING.sellBatchCap);
    send(state, { type: "contract.sell", resource: "steel", qty: TUNING.sellBatchCap });
    expect(state.store.steel ?? 0).toBeGreaterThanOrEqual(TUNING.reserveFloor);
  });

  it("route filters carry only their declared resource", () => {
    const state = conservationSeed();
    advance(state, 400);
    for (const route of state.routes) {
      if (route.filter === null) continue;
      for (const item of route.items) {
        expect(item.resource).toBe(route.filter);
      }
    }
  });
});

describe("#144 U05 clicking cannot auto-select every plan", () => {
  it("one named command selects exactly one plan, never the whole set", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    expect(upgradePlans(state, furnace.id).length).toBe(UPGRADE_BRANCHES.length);
    send(state, { type: "machine.upgrade", machineId: furnace.id, branch: "speed" });
    expect(furnace.branch?.length).toBe(1);
    send(state, { type: "machine.upgrade", machineId: furnace.id, branch: "draw" });
    expect(furnace.branch?.length).toBe(2);
    expect(furnace.branch).toEqual(["speed", "draw"]);
  });

  it("the blind prominent (unnamed) action selects no named plan", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    const before = ledger(state);
    const result = send(state, { type: "machine.upgrade", machineId: furnace.id });
    expect(result.ok).toBe(true);
    expect(furnace.branch).toBeUndefined();
    expect(upgradeRanks(furnace).speed).toBe(1);
    expect(upgradeRanks(furnace).draw).toBe(0);
    // The unnamed ladder is the plain price, not the speed premium.
    expect(before.credits - state.credits).toBe(upgradeCost(BLUEPRINTS.furnace.baseUpgradeCost, 1));
  });

  it("the plan-selection guard refuses an unknown branch before any credit moves", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    const before = ledger(state);
    const result = send(state, {
      type: "machine.upgrade",
      machineId: furnace.id,
      branch: "not-a-plan" as UpgradeBranch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-found");
    expect(state.credits).toBe(before.credits);
    expect(furnace.level).toBe(1);
    expect(furnace.branch).toBeUndefined();
  });
});

describe("#144 U05 two deliberate strategies diverge from one seed", () => {
  /** Ample feed so both strategies run clock-bound (not starved) for the window. */
  function forkSeed(): SimState {
    const state = bootstrapToExport();
    advance(state, 200);
    addToStore(state, "scrap", 300);
    addToStore(state, "ferrous", 300);
    // Feed the furnace straight from the seeded store so its throughput is set by
    // its own batch clock, not by the sorter's slower ferrous output.
    send(state, { type: "route.connect", from: 0, to: state.machines[1].id, filter: "ferrous" });
    state.credits = 200;
    return state;
  }

  it("speed beats draw on throughput; draw beats speed on power (no universal pick)", () => {
    const speed = forkSeed();
    const draw = forkSeed();
    const speedFurnace = speed.machines[1];
    const drawFurnace = draw.machines[1];
    expect(send(speed, { type: "machine.upgrade", machineId: speedFurnace.id, branch: "speed" }).ok).toBe(true);
    expect(send(draw, { type: "machine.upgrade", machineId: drawFurnace.id, branch: "draw" }).ok).toBe(true);
    advance(speed, 800);
    advance(draw, 800);
    expect(speedFurnace.batchesDone).toBeGreaterThan(drawFurnace.batchesDone);
    expect(powerOf(drawFurnace)).toBeLessThan(powerOf(speedFurnace));
    // The two strategies paid different prices for different outcomes.
    expect(speed.credits).toBe(200 - branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, 1, "speed"));
    expect(draw.credits).toBe(200 - branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, 1, "draw"));
  });

  it("the blind unnamed policy matches speed's clock but cannot reach draw's power saving", () => {
    const blind = forkSeed();
    const deliberate = forkSeed();
    const blindFurnace = blind.machines[1];
    const drawFurnace = deliberate.machines[1];
    send(blind, { type: "machine.upgrade", machineId: blindFurnace.id });
    send(deliberate, { type: "machine.upgrade", machineId: drawFurnace.id, branch: "draw" });
    advance(blind, 600);
    advance(deliberate, 600);
    // Unnamed buys the batch clock only: same rate as a deliberate speed pick...
    expect(batchMilliOf(blindFurnace)).toBe(batchMilliOf({ ...drawFurnace, branch: ["speed"], level: 2 }));
    // ...but it never names a plan, so it cannot respec into the power-saving branch.
    expect(blindFurnace.branch).toBeUndefined();
    expect(powerOf(blindFurnace)).toBeGreaterThan(powerOf(drawFurnace));
  });
});

describe("#144 U05 actual before/after upgrade comparisons", () => {
  it("speed moves the batch clock and rate, not power or buffer", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    const c = upgradeComparison(state, furnace.id, "speed")!;
    expect(c.cost).toBe(50);
    expect(c.before.batchSeconds).toBe(4);
    expect(c.after.batchSeconds).toBe(Math.ceil((RECIPES[BLUEPRINTS.furnace.recipeId].cycleTicks * 10000) / 11) / 10000);
    expect(c.after.batchesPerMinute).toBeGreaterThan(c.before.batchesPerMinute);
    expect(c.after.power).toBe(c.before.power);
    expect(c.after.inputCapacity).toBe(c.before.inputCapacity);
    expect(c.after.ranks.speed).toBe(c.before.ranks.speed + 1);
  });

  it("draw moves power, not the batch clock", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    const c = upgradeComparison(state, furnace.id, "draw")!;
    expect(c.cost).toBe(40);
    expect(c.before.power).toBe(2);
    expect(c.after.power).toBe(1);
    expect(c.after.batchSeconds).toBe(c.before.batchSeconds);
  });

  it("buffer moves input capacity by one rank step", () => {
    const state = conservationSeed();
    const sorter = state.machines[0];
    const c = upgradeComparison(state, sorter.id, "buffer")!;
    expect(c.cost).toBe(30);
    expect(c.after.inputCapacity - c.before.inputCapacity).toBe(6);
    expect(c.after.batchSeconds).toBe(c.before.batchSeconds);
    expect(c.after.power).toBe(c.before.power);
  });

  it("affordability and shortfall read the same credit balance the command charges", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    state.credits = 10;
    const c = upgradeComparison(state, furnace.id, "speed")!;
    expect(c.affordable).toBe(false);
    expect(c.shortfall).toBe(c.cost - 10);
    const refused = send(state, { type: "machine.upgrade", machineId: furnace.id, branch: "speed" });
    expect(refused.ok).toBe(false);
    expect(state.credits).toBe(10);
  });

  it("the comparison agrees with the command that actually applies it", () => {
    const state = conservationSeed();
    const furnace = state.machines[1];
    const c = upgradeComparison(state, furnace.id, "draw")!;
    send(state, { type: "machine.upgrade", machineId: furnace.id, branch: "draw" });
    expect(state.credits).toBe(1000 - c.cost);
    expect(furnace.level).toBe(c.after.level);
    expect(powerOf(furnace)).toBe(c.after.power);
    expect(batchMilliOf(furnace) / 10000).toBe(c.after.batchSeconds);
    expect(inputCapacityOf(furnace, researchBonus(state).inputBuffer)).toBe(c.after.inputCapacity);
  });
});

describe("#144 U05 actual before/after research comparisons", () => {
  it("cutters shows the pulse scrap step and its data price", () => {
    const state = conservationSeed();
    const c = researchComparison(state, "cutters")!;
    expect(c.cost).toBe(RESEARCH.cutters.cost);
    expect(c.prereqMet).toBe(true);
    expect(c.before.pulseScrap).toBe(0);
    expect(c.after.pulseScrap).toBe(2);
    expect(c.after.inputBuffer).toBe(c.before.inputBuffer);
  });

  it("buffers and dispatch report their gated before/after effects", () => {
    const state = conservationSeed();
    const buffers = researchComparison(state, "buffers")!;
    expect(buffers.prereqMet).toBe(false);
    expect(buffers.before.inputBuffer).toBe(0);
    expect(buffers.after.inputBuffer).toBe(6);
    send(state, { type: "research.buy", node: "cutters" });
    const afterCutters = researchComparison(state, "buffers")!;
    expect(afterCutters.prereqMet).toBe(true);
    const dispatch = researchComparison(state, "dispatch")!;
    expect(dispatch.before.routeCapacity).toBe(0);
    expect(dispatch.after.routeCapacity).toBe(8);
  });

  it("the research comparison agrees with the bonus the engine applies", () => {
    const state = conservationSeed();
    const c = researchComparison(state, "cutters")!;
    send(state, { type: "research.buy", node: "cutters" });
    expect(researchBonus(state).pulseScrap).toBe(c.after.pulseScrap);
    expect(state.store.data ?? 0).toBe(30 - c.cost);
    const known = researchComparison(state, "cutters")!;
    expect(known.alreadyKnown).toBe(true);
  });
});
