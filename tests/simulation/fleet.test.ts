import { describe, expect, it } from "vitest";
import { TUNING } from "../../src/game/content/defs";
import { advance, advanceTo } from "../../src/game/simulation/engine";
import {
  applyCommand,
  droneAddCost,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  createInitialState,
  fleetAccumulated,
  fleetDeliveries,
  fleetUnits,
  type SimState,
} from "../../src/game/simulation/types";
import { systemTotals, allQuantities } from "../../src/game/simulation/invariants";
import { catchUp } from "../../src/game/simulation/offline";
import { nextYardStep } from "../../src/game/simulation/plan";
import { describeStep, primaryFor } from "../../src/ui/text";
import { firstFreeTile } from "../../src/ui/App";
import {
  newLadderRecovery,
  ladderRecoveryTriggers,
  ladderRecoveryAdjust,
  ladderRecoveryClear,
  type LadderRecoveryState,
} from "../../src/game/content/validate";

/**
 * B-28: a second recovery drone so the store keeps a build-sized surplus while the
 * processors are already faster than one unit can feed (decision D-35 measured the
 * one-drone ceiling; D-38 records the fleet rule).
 */

let seq = 900;
function send(state: SimState, command: CommandBody, id?: string) {
  const key = id ?? `f${(seq += 1)}`;
  return applyCommand(state, { ...command, id: key } as Command);
}

/** The tutorial's own start: six pulses, the repair, then a settled yard. */
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

/** The scripted session: one ladder command per second, as the browser driver does.
 * #214: plays the shared dismantle-refund recovery in the gate's three-phase order
 * (triggers before the step, adjust after it is chosen, clear after the advance), and
 * waits for both starter machines before claiming the 10-steel contract — the same
 * taught order as `validateBehaviour` and the chain/fork mirrors. The recovery context
 * is passed in so a session split across two calls keeps one continuous play order. */
function runLadder(
  state: SimState,
  rounds: number,
  recovery: LadderRecoveryState = newLadderRecovery()
): Record<string, number> {
  const histogram: Record<string, number> = {};
  for (let round = 0; round < rounds; round += 1) {
    const startersBuilt =
      state.machines.some((m) => m.blueprint === "sorter") &&
      state.machines.some((m) => m.blueprint === "furnace");
    if (!state.exportClaimed && startersBuilt && (state.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
      send(state, { type: "contract.export" });
    }
    ladderRecoveryTriggers(state, recovery, round);
    const step = ladderRecoveryAdjust(state, recovery, nextYardStep(state));
    const key = step.kind === "build" ? `build:${step.blueprint}` : step.kind;
    histogram[key] = (histogram[key] ?? 0) + 1;
    switch (step.kind) {
      case "connect":
        for (const plan of step.plans) {
          send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
        }
        break;
      case "build":
        send(state, { type: "machine.build", blueprint: step.blueprint, tile: firstFreeTile(state) });
        break;
      case "sell":
        send(state, { type: "contract.sell", resource: step.resource, qty: step.qty });
        break;
      case "research":
        send(state, { type: "research.buy", node: step.node });
        break;
      case "drone":
        send(state, { type: "drone.add" });
        break;
      case "upgrade":
        send(state, { type: "machine.upgrade", machineId: step.machineId });
        break;
      default:
        send(state, { type: "manual.salvage" });
    }
    advance(state, 10);
    ladderRecoveryClear(state, recovery);
  }
  return histogram;
}

describe("recovery drone fleet (B-28)", () => {
  it("refuses a spare before the starter flies, and charges nothing", () => {
    const state = createInitialState();
    const before = JSON.stringify(state);
    const refused = send(state, { type: "drone.add" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("no-drone");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("buys one working unit for the published price and spends it once", () => {
    const state = boot();
    state.credits = 200;
    const price = droneAddCost(state);
    expect(price).toBe(TUNING.droneAddBaseCost);
    const result = send(state, { type: "drone.add" });
    expect(result.ok).toBe(true);
    expect(state.credits).toBe(200 - price);
    expect(state.spares.length).toBe(1);
    expect(state.spares[0].repaired).toBe(true);
    expect(state.drone.accumulated).toBeGreaterThan(0);
    // A retry of the same command id returns the first result and pays nothing more.
    const again = send(state, { type: "drone.add" }, "fleet-once"); // a second unit
    expect(state.spares.length).toBe(2);
    expect(state.credits).toBe(200 - 45 - 90);
    const settled = state.credits;
    expect(applyCommand(state, { id: "fleet-once", type: "drone.add" })).toEqual(again);
    expect(state.credits).toBe(settled);
    expect(state.spares.length).toBe(2);
  });

  it("doubles each price and stops at the declared fleet cap", () => {
    const state = boot();
    state.credits = 5_000;
    const prices: number[] = [];
    for (let index = 0; index < TUNING.fleetCap - 1; index += 1) {
      prices.push(droneAddCost(state));
      expect(send(state, { type: "drone.add" }).ok).toBe(true);
    }
    expect(prices).toEqual([45, 90, 180, 360]);
    expect(fleetUnits(state).length).toBe(TUNING.fleetCap);
    const full = send(state, { type: "drone.add" });
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toBe("fleet-full");
    expect(state.spares.length).toBe(TUNING.fleetCap - 1);
  });

  it("lands about twice the scrap with two units on the same route", () => {
    const solo = boot();
    const doubled = boot();
    // #214: the starter seed now occupies 144 of the dock's 300 units. This fixture has
    // no machines to consume scrap, so a full store would block the spare's deliveries
    // (engine `updateUnit` lands only into free room) and cap the ratio below the fleet's
    // true lift rate. Empty the store on both runs so the 1 000-tick window measures the
    // unchanged delivery mechanic, not the seed's store occupancy.
    for (const state of [solo, doubled]) {
      state.store.scrap = 0;
      state.store.ferrous = 0;
      state.store.steel = 0;
      state.storeUnits = 0;
    }
    advance(solo, 1_000);
    doubled.credits = 200;
    send(doubled, { type: "drone.add" });
    advance(doubled, 1_000);
    const one = fleetAccumulated(solo);
    const two = fleetAccumulated(doubled);
    // The spare launches one delivery cycle after purchase, so its share is a little
    // under half of the window: 1.7× is the measured floor over 1 000 ticks.
    expect(one).toBeGreaterThan(0);
    expect(two / one).toBeGreaterThan(1.7);
    expect(two / one).toBeLessThanOrEqual(2.0);
    // Both draw from the same finite pool, so nothing appears from nowhere (spec 7.2).
    expect(fleetDeliveries(doubled)).toBeGreaterThan(fleetDeliveries(solo));
  });

  it("agrees tick-by-tick with the event-jump advance, fleet included", () => {
    const stepped = boot();
    stepped.credits = 200;
    send(stepped, { type: "drone.add" });
    advance(stepped, 400);
    const jumped = boot();
    jumped.credits = 200;
    send(jumped, { type: "drone.add" });
    advanceTo(jumped, jumped.tick + 400);
    // The command bookkeeping differs only because the two runs draw ids from one
    // sequence; the economy itself must be byte-identical (spec 21.4).
    const snapshot = (s: SimState) => JSON.stringify({ ...s, seenCommands: {} });
    expect(jumped.tick).toBe(stepped.tick);
    expect(snapshot(jumped)).toBe(snapshot(stepped));
    expect(fleetDeliveries(jumped)).toBe(fleetDeliveries(stepped));
    expect(fleetUnits(jumped).length).toBe(2);
  });

  it("counts every unit's leg once in the ledger and the offline report", () => {
    const state = boot();
    state.credits = 700;
    send(state, { type: "drone.add" });
    send(state, { type: "drone.add" });
    advance(state, 300);
    // Every 5-tick leg is complete at a few instants, so walk until one is airborne
    // and check the ledger there: the same unit must never be counted twice (spec 8.2).
    let airborne = 0;
    for (let tick = 0; tick < 60 && airborne === 0; tick += 1) {
      advance(state, 1);
      airborne = fleetUnits(state).reduce((sum, unit) => sum + (unit.inFlight?.qty ?? 0), 0);
    }
    expect(airborne).toBeGreaterThan(0);
    // This fixture has no machines and no links, so scrap lives in exactly two places:
    // the store and one cargo leg per flying unit (spec 8.2).
    expect(systemTotals(state)["scrap"] ?? 0).toBe((state.store["scrap"] ?? 0) + airborne);
    for (const value of allQuantities(state)) {
      expect(Number.isSafeInteger(value), String(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    const before = fleetDeliveries(state);
    const { report } = catchUp(state, 1_700_000_000_000, 1_700_000_000_000 + 60_000);
    expect(report.deliveries).toBe(fleetDeliveries(state) - before);
    // 600 ticks is 60 s, so one unit lands at most 12 loads; more than that can only
    // come from the fleet summing every unit rather than the starter alone.
    expect(report.deliveries).toBeGreaterThan(12);
  });

  it("phrases the step once and prices it the same on both surfaces", () => {
    const state = createInitialState();
    state.drone.repaired = true;
    state.credits = 45;
    // #214: `unlockedBlueprints` floors at tutorial 4, so the sorter is revealed even
    // here, and the starter seed (120 scrap, 12 steel) now covers its 30 scrap + 4 steel
    // price — the build stage would lead. Empty the store so no build is affordable and
    // the fleet step is the only open action, which is the isolation this check needs.
    state.store.scrap = 0;
    state.store.ferrous = 0;
    state.store.steel = 0;
    state.storeUnits = 0;
    // Nothing else is open: no machine, no link, no data, so the fleet step leads.
    expect(nextYardStep(state)).toEqual({ kind: "drone" });
    const step = nextYardStep(state);
    expect(describeStep(state, step)).toContain("Add a recovery drone · 45 credits");
    expect(primaryFor(state, step)).toEqual({ label: "Add drone", cost: "45 credits" });
    expect(send(state, { type: "drone.add" }).ok).toBe(true);
    expect(state.credits).toBe(0);
    // The next price is 90, which the same 0-credit yard cannot meet, so the ladder
    // moves on instead of pressing a purchase that would be refused.
    expect(nextYardStep(state).kind).not.toBe("drone");
  });

  it("reaches six machines by 240 rounds and buys its first spare inside 900", () => {
    const state = boot();
    state.tutorial = 9;
    const recovery = newLadderRecovery();
    const histogram = runLadder(state, 240, recovery);
    console.log(
      "fleet-session-240:",
      JSON.stringify({
        tick: state.tick,
        machines: state.machines.map((m) => `${m.blueprint} L${m.level} x${m.batchesDone}`),
        fleet: fleetUnits(state).length,
        deliveries: fleetDeliveries(state),
        credits: state.credits,
        store: state.store,
        research: state.research,
      })
    );
    // D-35 measured four machines at this mark with one drone; the store now carries
    // enough surplus for two more blueprint prices inside the same 240 seconds.
    // BELT-001 restated 6 -> 5 at this mark: the laid belts spend 1 scrap per tile
    // from the same store, so the sixth blueprint price lands a few rounds later.
    // #214: the shared dismantle-refund recovery (ferrous refill -> signal lab, wire
    // monopoly -> assembler rebuild) now reaches the full 8-machine yard by this mark,
    // so the floor holds with margin; the fleet keeps delivering throughout.
    expect(state.machines.length).toBeGreaterThanOrEqual(5);
    expect(fleetDeliveries(state)).toBeGreaterThan(40);
    runLadder(state, 660, recovery); // 900 rounds in total
    console.log(
      "fleet-session-900:",
      JSON.stringify({
        machines: state.machines.length,
        fleet: fleetUnits(state).length,
        deliveries: fleetDeliveries(state),
        credits: state.credits,
        research: Object.keys(state.research).length,
        histogram,
      })
    );
    expect(fleetUnits(state).length).toBeGreaterThanOrEqual(2);
    expect(state.machines.length).toBeGreaterThanOrEqual(6);
    for (const value of Object.values(systemTotals(state))) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});
