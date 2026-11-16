/**
 * RW3D T02 (#129): E01 resource conservation characterization.
 *
 * Two layers:
 * 1. Pure advance (no commands) conserves `unitTotal - netRecipeUnits -
 *    fleetAccumulated` for every fixture, every internal quantity stays a safe
 *    nonnegative integer, and the wreck pool drain reconciles to the fleet ledger.
 * 2. Every lifecycle command moves resources and credits by exactly the amount the
 *    content tables derive — build/connect spend, sell/export/research consume,
 *    dismantle/remove refund, upgrade/drone-add spend credits only — and a retried
 *    command id is a no-op.
 */
import { describe, expect, it } from "vitest";
import { advance } from "../../src/game/simulation/engine";
import {
  allQuantities,
  netRecipeUnits,
  systemTotals,
  unitTotal,
} from "../../src/game/simulation/invariants";
import { fleetAccumulated, type SimState } from "../../src/game/simulation/types";
import {
  applyCommand,
  beltCost,
  beltRun,
  branchPrice,
  droneAddCost,
  refundOf,
  sellableAmount,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { BLUEPRINTS, EXPORT_PRICES, TUNING } from "../../src/game/content/defs";
import { RESEARCH, researchBonus } from "../../src/game/content/research";
import { decodeSave, migrate } from "../../src/game/persistence/save";
import { buildAllFixtures } from "./fixtures-lib";

function loaded(name: string): SimState {
  const f = buildAllFixtures().find((x) => x.name === name);
  if (!f) throw new Error(`missing fixture ${name}`);
  const decoded = decodeSave(f.text);
  if (!decoded.ok) throw new Error(`fixture ${name} rejected: ${decoded.reason}`);
  return migrate(decoded.payload).sim;
}

/** The pure-advance conserved quantity: stock + cargo + batch + wreck extraction. */
function conserved(s: SimState): number {
  return unitTotal(s) - netRecipeUnits(s) - fleetAccumulated(s);
}

function expectNonnegativeIntegers(s: SimState, label: string): void {
  for (const value of allQuantities(s)) {
    expect(Number.isSafeInteger(value), `${label}: ${value} not a safe integer`).toBe(true);
    expect(value >= 0, `${label}: ${value} negative`).toBe(true);
  }
  for (const value of Object.values(systemTotals(s))) {
    expect(value >= 0, `${label}: negative total`).toBe(true);
  }
}

let commandSeq = 0;
function send(s: SimState, body: CommandBody): void {
  commandSeq += 1;
  const result = applyCommand(s, { ...body, id: `cv${commandSeq}` } as Command);
  if (!result.ok) throw new Error(`command failed: ${body.type} -> ${JSON.stringify(result)}`);
}

describe("E01 pure-advance conservation", () => {
  it("holds the conserved quantity and the integer gate for every fixture", () => {
    for (const f of buildAllFixtures().filter((x) => x.kind === "save")) {
      const s = loaded(f.name);
      const c0 = conserved(s);
      const wreckBefore = { ...s.wreck };
      const fleetBefore = fleetAccumulated(s);
      expectNonnegativeIntegers(s, f.name);
      for (const step of [1, 9, 90, 400, 1500]) {
        advance(s, step);
        expect(conserved(s), `${f.name} after ${step}`).toBe(c0);
        expectNonnegativeIntegers(s, `${f.name} after ${step}`);
      }
      // During pure advance only drones drain the wreck, so the pool drain must
      // equal the fleet's accumulated extraction (manual pulses are not involved).
      const extracted = fleetAccumulated(s) - fleetBefore;
      const drain =
        (s.wreck.generation - wreckBefore.generation) * TUNING.starterWreckPool +
        (wreckBefore.remaining - s.wreck.remaining);
      expect(extracted, f.name).toBe(drain);
    }
  });
});

describe("E01 command idempotency", () => {
  it("a retried command id returns the same revision and changes nothing", () => {
    const s = loaded("chain-export.modern");
    const sorter = s.machines[0];
    commandSeq += 1;
    const id = `idem-${commandSeq}`;
    const body: Command = { id, type: "machine.upgrade", machineId: sorter.id };
    const first = applyCommand(s, body);
    expect(first.ok).toBe(true);
    const snapshot = JSON.stringify(s);
    const revisionAfterFirst = s.revision;
    const second = applyCommand(s, body);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.revision).toBe(first.revision);
    expect(s.revision).toBe(revisionAfterFirst);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

interface Ledger {
  units: number;
  credits: number;
  machines: number;
  routes: number;
  spares: number;
}
function ledger(s: SimState): Ledger {
  return {
    units: unitTotal(s),
    credits: s.credits,
    machines: s.machines.length,
    routes: s.routes.length,
    spares: s.spares.length,
  };
}
function diff(before: Ledger, after: Ledger): Ledger {
  return {
    units: after.units - before.units,
    credits: after.credits - before.credits,
    machines: after.machines - before.machines,
    routes: after.routes - before.routes,
    spares: after.spares - before.spares,
  };
}

describe("E01 per-command lifecycle accounting", () => {
  it("moves resources and credits by exactly the table-derived amounts", () => {
    const s = loaded("deep-yard.modern");

    // sell: consumes `amount` units, mints price * amount credits.
    const sellQty = Math.min(TUNING.sellBatchCap, sellableAmount(s, "scrap"));
    expect(sellQty).toBeGreaterThan(0);
    let before = ledger(s);
    send(s, { type: "contract.sell", resource: "scrap", qty: TUNING.sellBatchCap });
    let d = diff(before, ledger(s));
    expect(d.units).toBe(-sellQty);
    expect(d.credits).toBe((EXPORT_PRICES.scrap ?? 0) * sellQty);

    // build: spends the blueprint build cost from the store, adds one machine.
    const buildCost = BLUEPRINTS.sorter.buildCost.reduce((total, item) => total + item.qty, 0);
    before = ledger(s);
    send(s, { type: "machine.build", blueprint: "sorter", tile: 15 });
    const built = s.machines[s.machines.length - 1];
    d = diff(before, ledger(s));
    expect(d.units).toBe(-buildCost);
    expect(d.machines).toBe(1);
    expect(d.credits).toBe(0);

    // connect: spends beltCost(run.length) scrap, adds one route.
    const run = beltRun(s, built.id, 0);
    const price = beltCost(run.length);
    before = ledger(s);
    send(s, { type: "route.connect", from: built.id, to: 0, filter: "scrap" });
    const route = s.routes[s.routes.length - 1];
    d = diff(before, ledger(s));
    expect(d.units).toBe(-price);
    expect(d.routes).toBe(1);

    // upgrade: spends credits only, no resource units move.
    const upgradePrice = branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, built.level, "speed");
    before = ledger(s);
    send(s, { type: "machine.upgrade", machineId: built.id, branch: "speed" });
    d = diff(before, ledger(s));
    expect(d.credits).toBe(-upgradePrice);
    expect(d.units).toBe(0);
    expect(built.level).toBe(2);

    // remove: returns in-flight cargo (none here) plus the priced belt refund.
    const removeRefund = refundOf(price);
    before = ledger(s);
    send(s, { type: "route.remove", routeId: route.id });
    d = diff(before, ledger(s));
    expect(d.units).toBe(removeRefund);
    expect(d.routes).toBe(-1);

    // dismantle: refunds 90% of the build cost (no belts remain registered).
    const dismantleRefund = BLUEPRINTS.sorter.buildCost.reduce(
      (total, item) => total + refundOf(item.qty),
      0,
    );
    before = ledger(s);
    send(s, { type: "machine.dismantle", machineId: built.id });
    d = diff(before, ledger(s));
    expect(d.units).toBe(dismantleRefund);
    expect(d.machines).toBe(-1);
    expect(d.credits).toBe(0);

    // research: consumes the node's data cost, no credits move.
    const dataCost = RESEARCH.buffers.cost;
    before = ledger(s);
    send(s, { type: "research.buy", node: "buffers" });
    d = diff(before, ledger(s));
    expect(d.units).toBe(-dataCost);
    expect(d.credits).toBe(0);
    expect(s.research.buffers).toBe(1);

    // drone.add: spends credits only, adds a spare with no starting units.
    const dronePrice = droneAddCost(s);
    before = ledger(s);
    send(s, { type: "drone.add" });
    d = diff(before, ledger(s));
    expect(d.credits).toBe(-dronePrice);
    expect(d.spares).toBe(1);
    expect(d.units).toBe(0);

    // manual.salvage: mints exactly the pulse amount from the wreck pool.
    advance(s, TUNING.manualPulseTicks);
    const perPulse = TUNING.manualSalvagePerPulse + researchBonus(s).pulseScrap;
    const amount = Math.min(perPulse, s.wreck.remaining);
    before = ledger(s);
    send(s, { type: "manual.salvage" });
    d = diff(before, ledger(s));
    expect(d.units).toBe(amount);
    expect(d.credits).toBe(0);

    expectNonnegativeIntegers(s, "deep-yard after lifecycle");
  });
});
