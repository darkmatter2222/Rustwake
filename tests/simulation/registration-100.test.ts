import { describe, expect, it } from "vitest";
import { BLUEPRINTS, RECIPES, TUNING, type ResourceId } from "../../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  refundOf,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  createInitialState,
  outputRouteIds,
  type MachineState,
  type RouteState,
  type SimState,
} from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { systemTotals, unitTotal } from "../../src/game/simulation/invariants";
import {
  checksum,
  decodeSave,
  encodeSave,
  validateSim,
  DEFAULT_SETTINGS,
} from "../../src/game/persistence/save";
import seedEnvelope from "../../docs/evidence/yard-mature.json";

/**
 * Issue #100 — output registration is DERIVED from the route table.
 *
 * The defect: `connectRoute` overwrote the singular `machine.outRoute`, so a multi-output
 * recipe (R01 sorter, R03 copperSeparator) that laid two output belts registered only the
 * LAST one. The engine already split flow across every route, but dismantle/inspector/
 * diagnostics accounted against the singular mirror alone — earlier belts were never
 * refunded, never dropped (orphaned), and a dismantled machine's orphan route then failed
 * `validateSim.routeSource`, making `decodeSave` fail and the store silently reset the yard.
 *
 * The fix: `outputRouteIds(state, id)` derives the whole output set from `s.routes` (the
 * engine's flow source of truth). No stored plural field is added, so legacy saves stay
 * byte-identical; the singular `outRoute` survives only as a legacy "last connected" mirror.
 * These tests lock the seven acceptance gates at the engine + save layer; the UI face is
 * locked separately in tests/ui/inspector-100.test.tsx.
 *
 * All state mutations below live in THIS test file only. Every action under test goes
 * through the real command path (`applyCommand` → revision increment → state readback).
 */

let seq = 0;
function send(state: SimState, body: CommandBody): boolean {
  seq += 1;
  return applyCommand(state, { ...body, id: `r100-${seq}` } as Command).ok === true;
}

/** `commands.ts`'s own per-link belt refund: `dismantleRefundPct` of the priced run. */
const beltRefundOf = (route: RouteState | undefined): number =>
  refundOf(beltCost(route?.run?.length ?? 0));

/** The engine-registered set: every derived output route plus every input route, deduped. */
function registeredIdsOf(state: SimState, machine: MachineState): number[] {
  return [...new Set([...outputRouteIds(state, machine.id), ...machine.inRoutes])];
}

/** Independent re-implementation of `dismantleMachine`'s returned-unit arithmetic. */
function expectedRefund(state: SimState, machine: MachineState): number {
  const def = BLUEPRINTS[machine.blueprint];
  const registered = state.routes.filter((route) =>
    registeredIdsOf(state, machine).includes(route.id),
  );
  return (
    def.buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
    machine.trayUnits +
    machine.inBufUnits +
    machine.batch.reduce((total, item) => total + item.qty, 0) +
    registered.reduce((total, route) => total + beltRefundOf(route), 0)
  );
}

/** The scrap the refund mechanic CREATES (build + belt refunds); all else merely relocates. */
function createdScrapRefund(state: SimState, machine: MachineState): number {
  const def = BLUEPRINTS[machine.blueprint];
  const registered = state.routes.filter((route) =>
    registeredIdsOf(state, machine).includes(route.id),
  );
  return (
    def.buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
    registered.reduce((total, route) => total + beltRefundOf(route), 0)
  );
}

const scrapOf = (state: SimState): number => state.store["scrap"] ?? 0;

/**
 * One machine with BOTH output plans laid through the real planner + an input link from
 * the store. R01 (ferrous + nonferrous) and R03 (copper + residue) each yield two output
 * plans, so the yard touches three routes: two outputs + one input. No `advance`, so belts
 * and buffers start empty and the dismantle refund isolates build + belt parts.
 */
function twoOutputYard(blueprint: string, tile = 8): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  // Fund every build-cost resource (the sorter needs scrap; the copper separator also
  // needs ferrous), with scrap headroom for the belts and refunds.
  state.store["scrap"] = 300;
  state.store["ferrous"] = 20;
  state.storeUnits = 320;
  expect(send(state, { type: "machine.build", blueprint, tile })).toBe(true);
  const machine = state.machines[state.machines.length - 1];
  const input = RECIPES[BLUEPRINTS[blueprint].recipeId].inputs[0].resource;
  expect(send(state, { type: "route.connect", from: 0, to: machine.id, filter: input })).toBe(true);
  // The input is already linked, so the planner now offers exactly the two output plans.
  const plans = planConnections(state, machine.id);
  expect(plans.length).toBe(2);
  for (const plan of plans) {
    expect(plan.from).toBe(machine.id);
    expect(send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter })).toBe(true);
  }
  return state;
}

/** A deterministic command sequence with fixed ids, so two runs produce byte-identical state. */
function runFixedSequence(state: SimState, bodies: CommandBody[]): void {
  bodies.forEach((body, index) => {
    const result = applyCommand(state, { ...body, id: `fixed-${index}` } as Command);
    expect(result.ok).toBe(true);
  });
}

const sorterSequence: CommandBody[] = [
  { type: "machine.build", blueprint: "sorter", tile: 8 },
  { type: "route.connect", from: 0, to: 1, filter: "scrap" },
  { type: "route.connect", from: 1, to: 0, filter: "ferrous" },
  { type: "route.connect", from: 1, to: 0, filter: "nonferrous" },
];

function seededSorter(): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 300;
  state.storeUnits = 300;
  runFixedSequence(state, sorterSequence);
  return state;
}

describe("REG-100 gate 1: registration is additive, derived and deterministic", () => {
  it("connect lays both output plans; outputRouteIds derives both; the mirror names only the last", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    const outputs = state.routes.filter((route) => route.from.id === machine.id);
    expect(outputs.length).toBe(2);
    // The derived set is the WHOLE output set, in route-table order — not the singular mirror.
    expect(outputRouteIds(state, machine.id)).toEqual(outputs.map((route) => route.id));
    // The legacy mirror still names the newest output (read-only legacy readers rely on it).
    expect(machine.outRoute).toBe(outputs[outputs.length - 1].id);
    // No stored plural field is ever introduced — the legacy shape is preserved.
    expect("outRoutes" in machine).toBe(false);
    // Two outputs + one input all touch the machine.
    const touching = state.routes.filter(
      (route) => route.from.id === machine.id || route.to.id === machine.id,
    );
    expect(touching.length).toBe(3);
    expect(validateSim(state)).toBeNull();
  });

  it("registration follows the table additively across remove + reconnect, never silently overwriting", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    const first = outputRouteIds(state, machine.id)[0];
    // Remove the FIRST output: the derived set shrinks to the survivor, the mirror is untouched
    // unless it named the removed link.
    expect(send(state, { type: "route.remove", routeId: first })).toBe(true);
    expect(outputRouteIds(state, machine.id)).toEqual([machine.outRoute]);
    // Re-lay it: the derived set grows back to two, additively.
    expect(send(state, { type: "route.connect", from: machine.id, to: 0, filter: "ferrous" })).toBe(true);
    expect(outputRouteIds(state, machine.id).length).toBe(2);
    expect(validateSim(state)).toBeNull();
  });

  it("a legacy single-output machine decodes and derives exactly one output", () => {
    const state = createInitialState();
    state.tutorial = 9;
    state.store["scrap"] = 300;
    state.storeUnits = 300;
    expect(send(state, { type: "machine.build", blueprint: "furnace", tile: 8 })).toBe(true);
    const machine = state.machines[0];
    expect(send(state, { type: "route.connect", from: 0, to: machine.id, filter: "ferrous" })).toBe(true);
    expect(send(state, { type: "route.connect", from: machine.id, to: 0, filter: "steel" })).toBe(true);
    const raw = encodeSave(state, 1_700_000_000_000, DEFAULT_SETTINGS);
    const decoded = decodeSave(raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const m = decoded.payload.sim.machines[0];
    expect(outputRouteIds(decoded.payload.sim, m.id).length).toBe(1);
    expect("outRoutes" in m).toBe(false);
    expect(validateSim(decoded.payload.sim)).toBeNull();
  });
});

describe("REG-100 gates 2 + 6: two-output dismantle refunds and drops EVERY link", () => {
  for (const blueprint of ["sorter", "copperSeparator"] as const) {
    it(`${blueprint}: both plans registered -> dismantle refunds both belts + build/tray/buffer, zero touching routes, validateSim null, save round-trips`, () => {
      const state = twoOutputYard(blueprint);
      const machine = state.machines[0];
      const outputs = outputRouteIds(state, machine.id);
      expect(outputs.length).toBe(2);
      const registered = registeredIdsOf(state, machine);
      expect(registered.length).toBe(3); // two outputs + one input

      // Empty cargo (no advance): the refund isolates build + the two belt refunds.
      const refund = expectedRefund(state, machine);
      const buildRefund = BLUEPRINTS[blueprint].buildCost.reduce(
        (total, item) => total + refundOf(item.qty),
        0,
      );
      const beltSum = state.routes
        .filter((route) => registered.includes(route.id))
        .reduce((total, route) => total + beltRefundOf(route), 0);
      expect(refund).toBe(buildRefund + beltSum);
      // Each link's refund is exactly refundOf(beltCost(run.length)) at dismantleRefundPct.
      for (const route of state.routes.filter((r) => registered.includes(r.id))) {
        expect(beltRefundOf(route)).toBe(
          Math.round((beltCost(route.run!.length) * TUNING.dismantleRefundPct) / 100),
        );
      }

      const totalsBefore = systemTotals(state);
      const unitBefore = unitTotal(state);
      const storeBefore = state.storeUnits;
      const revisionBefore = state.revision;
      expect(send(state, { type: "machine.dismantle", machineId: machine.id })).toBe(true);
      expect(state.revision).toBe(revisionBefore + 1);

      // The store returns exactly the registered refund — both belts, not just the last.
      expect(state.storeUnits - storeBefore).toBe(refund);
      // Conservation: the only matter CREATED is the priced scrap refund; everything else relocates.
      expect(unitTotal(state) - unitBefore).toBe(buildRefund + beltSum);
      const totalsAfter = systemTotals(state);
      for (const key of Object.keys(totalsBefore) as ResourceId[]) {
        if (key === "scrap") continue;
        expect(totalsAfter[key] ?? 0).toBe(totalsBefore[key] ?? 0);
      }
      expect((totalsAfter["scrap"] ?? 0) - (totalsBefore["scrap"] ?? 0)).toBe(buildRefund + beltSum);

      // Every registered route is dropped: no machine, no route, no dangling endpoint.
      expect(state.machines.length).toBe(0);
      expect(state.routes.length).toBe(0);
      for (const route of state.routes) {
        expect(route.from.id).not.toBe(machine.id);
        expect(route.to.id).not.toBe(machine.id);
      }
      expect(validateSim(state)).toBeNull();

      // The dismantled yard round-trips through save with no reset and a stable checksum.
      const raw = encodeSave(state, 1_700_000_000_000, DEFAULT_SETTINGS);
      const decoded = decodeSave(raw);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(validateSim(decoded.payload.sim)).toBeNull();
      expect(decoded.payload.sim.routes.length).toBe(0);
      expect(encodeSave(decoded.payload.sim, decoded.payload.lastSeenMs, decoded.payload.settings)).toBe(raw);
    });
  }
});

describe("REG-100 gate 2: a loaded belt conserves every unit on dismantle", () => {
  it("relocates tray/buffer/batch/belt cargo to the store and creates only the priced scrap refund", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    // Test-only loading (no advance, so recipe production cannot confound conservation):
    // put cargo on every belt and material in the tray, buffer and started batch.
    machine.tray = [{ resource: "ferrous", qty: 3 }];
    machine.trayUnits = 3;
    machine.inBuf = { scrap: 4 };
    machine.inBufUnits = 4;
    machine.batch = [{ resource: "scrap", qty: 2 }];
    machine.progress = 4000;
    machine.status = "running";
    const inputRoute = state.routes.find((route) => route.to.id === machine.id)!;
    inputRoute.items = [{ resource: "scrap", qty: 5 }];
    const outputRoutes = state.routes.filter((route) => route.from.id === machine.id);
    outputRoutes[0].items = [{ resource: "ferrous", qty: 2 }];
    outputRoutes[1].items = [{ resource: "nonferrous", qty: 2 }];

    const refund = expectedRefund(state, machine);
    const created = createdScrapRefund(state, machine);
    // `dropRoute` also returns each belt's in-flight cargo to the store, on top of the face.
    const cargoUnits = state.routes
      .filter((route) => registeredIdsOf(state, machine).includes(route.id))
      .reduce((total, route) => total + route.items.reduce((sum, item) => sum + item.qty, 0), 0);
    const totalsBefore = systemTotals(state);
    const unitBefore = unitTotal(state);
    const storeBefore = state.storeUnits;
    expect(send(state, { type: "machine.dismantle", machineId: machine.id })).toBe(true);

    // The store delta is the face refund PLUS the relocated belt cargo (the face itself prints
    // only build/tray/buffer/batch/belt-refund; the cargo return is engine behaviour on top).
    expect(state.storeUnits - storeBefore).toBe(refund + cargoUnits);
    // Whole-system conservation: cargo merely relocates, so only the priced scrap refund is new matter.
    expect(unitTotal(state) - unitBefore).toBe(created);
    const totalsAfter = systemTotals(state);
    for (const key of Object.keys(totalsBefore) as ResourceId[]) {
      if (key === "scrap") continue;
      expect(totalsAfter[key] ?? 0).toBe(totalsBefore[key] ?? 0);
    }
    expect(state.routes.length).toBe(0);
    expect(validateSim(state)).toBeNull();
  });
});

describe("REG-100 gates 3 + 4: validateSim intact and the sequence is deterministic", () => {
  it("validateSim still refuses a dangling-endpoint route (the existing check is not weakened)", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    // Remove the machine but leave its routes: validateSim must still refuse the dangling
    // endpoints (the input route trips `routeTarget`, an output route `routeSource`).
    state.machines = [];
    expect(validateSim(state)).toMatch(/^route(Source|Target):\d+$/);
  });

  it("the same command sequence yields byte-identical state and revision, before and after dismantle", () => {
    const a = seededSorter();
    const b = seededSorter();
    expect(a.revision).toBe(b.revision);
    const rawA = encodeSave(a, 1_700_000_000_000, DEFAULT_SETTINGS);
    const rawB = encodeSave(b, 1_700_000_000_000, DEFAULT_SETTINGS);
    expect(checksum(rawA)).toBe(checksum(rawB));
    expect(rawA).toBe(rawB);
    expect(validateSim(a)).toBeNull();
    // Dismantle both through the same fixed id: identical post-dismantle state too.
    expect(applyCommand(a, { id: "fixed-d", type: "machine.dismantle", machineId: 1 }).ok).toBe(true);
    expect(applyCommand(b, { id: "fixed-d", type: "machine.dismantle", machineId: 1 }).ok).toBe(true);
    expect(a.revision).toBe(b.revision);
    expect(encodeSave(a, 1_700_000_000_000, DEFAULT_SETTINGS)).toBe(encodeSave(b, 1_700_000_000_000, DEFAULT_SETTINGS));
    expect(validateSim(a)).toBeNull();
  });

  it("replaying a command id is idempotent (no double registration or refund)", () => {
    const state = seededSorter();
    const machine = state.machines[0];
    const before = outputRouteIds(state, machine.id).length;
    const revision = state.revision;
    // Re-apply the last connect with its original id: deduped, nothing changes.
    const replay = applyCommand(state, { id: "fixed-3", type: "route.connect", from: 1, to: 0, filter: "nonferrous" });
    expect(replay.ok).toBe(true);
    expect(state.revision).toBe(revision);
    expect(outputRouteIds(state, machine.id).length).toBe(before);
  });
});

describe("REG-100 gate 5: save round-trip and load-path orphan repair", () => {
  it("sub-case (i): a living under-registered machine re-derives its whole output set with no value change", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    const outputs = outputRouteIds(state, machine.id);
    // Simulate the pre-fix mirror naming only the FIRST output (a stale singular mirror).
    machine.outRoute = outputs[0];
    const unitBefore = unitTotal(state);
    const raw = encodeSave(state, 1_700_000_000_000, DEFAULT_SETTINGS);
    const decoded = decodeSave(raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const m = decoded.payload.sim.machines[0];
    // Derivation reads the table, so BOTH outputs are registered despite the stale mirror.
    expect(outputRouteIds(decoded.payload.sim, m.id)).toEqual(outputs);
    // No value change, no mutation of a healthy record: byte-identical round-trip.
    expect(unitTotal(decoded.payload.sim)).toBe(unitBefore);
    expect(encodeSave(decoded.payload.sim, decoded.payload.lastSeenMs, decoded.payload.settings)).toBe(raw);
    expect(validateSim(decoded.payload.sim)).toBeNull();
    // And dismantle still refunds both belts.
    const refund = expectedRefund(decoded.payload.sim, m);
    const storeBefore = decoded.payload.sim.storeUnits;
    expect(send(decoded.payload.sim, { type: "machine.dismantle", machineId: m.id })).toBe(true);
    expect(decoded.payload.sim.storeUnits - storeBefore).toBe(refund);
    expect(decoded.payload.sim.routes.length).toBe(0);
  });

  it("sub-case (ii): a dismantled machine's orphan belt is refunded and dropped on load — deterministically, no reset", () => {
    const state = twoOutputYard("copperSeparator");
    const machine = state.machines[0];
    const orphan = state.routes.find((route) => route.from.id === machine.id)!;
    const beltPrice = beltCost(orphan.run!.length);
    const beltRefund = refundOf(beltPrice);
    // Put non-scrap cargo on the orphan belt so its return is separable from the scrap refund.
    orphan.items = [{ resource: "copper", qty: 4 }];
    // Simulate the pre-fix dismantle: it removed the machine and dropped the REGISTERED set
    // (the input + the last output, which the singular mirror named) but NEVER dropped this
    // earlier output — leaving exactly one dangling-endpoint orphan behind.
    state.machines = [];
    state.routes = [orphan];
    const damagedRaw = encodeSave(state, 1_700_000_000_000, DEFAULT_SETTINGS);
    const unitDamaged = unitTotal(state);
    const copperDamaged = systemTotals(state)["copper"] ?? 0;
    const scrapDamaged = scrapOf(state);
    // The damaged save would fail validation un-repaired (this is the silent-reset trigger).
    expect(validateSim(state)).toBe(`routeSource:${orphan.id}`);

    const decoded = decodeSave(damagedRaw);
    expect(decoded.ok).toBe(true); // repaired BEFORE validation, so no fresh-yard fallback
    if (!decoded.ok) return;
    const sim = decoded.payload.sim;
    expect(validateSim(sim)).toBeNull();
    // The orphan is gone; no route points at the removed machine.
    expect(sim.routes.length).toBe(0);
    // Paid value preserved: the cargo relocated to the store (copper conserved)...
    expect(systemTotals(sim)["copper"] ?? 0).toBe(copperDamaged);
    // ...and the belt cost refunded at dismantleRefundPct (the only new matter).
    expect(unitTotal(sim) - unitDamaged).toBe(beltRefund);
    expect(scrapOf(sim) - scrapDamaged).toBe(beltRefund);
    // NOT a reset: the store carries the refunded value, not a fresh empty yard.
    expect(scrapOf(sim)).toBeGreaterThan(0);

    // Deterministic: decoding the same bytes twice yields the identical repaired state.
    const again = decodeSave(damagedRaw);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(encodeSave(again.payload.sim, again.payload.lastSeenMs, again.payload.settings))
      .toBe(encodeSave(sim, decoded.payload.lastSeenMs, decoded.payload.settings));

    // Idempotent: re-loading the repaired save refunds nothing a second time.
    const repairedRaw = encodeSave(sim, decoded.payload.lastSeenMs, decoded.payload.settings);
    const unitRepaired = unitTotal(sim);
    const reloaded = decodeSave(repairedRaw);
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(unitTotal(reloaded.payload.sim)).toBe(unitRepaired);
    expect(reloaded.payload.sim.routes.length).toBe(sim.routes.length);
  });

  it("repair is a no-op on the healthy mature fixture (the byte-identical lock holds)", () => {
    const raw = JSON.stringify(seedEnvelope);
    const decoded = decodeSave(raw);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(checksum(JSON.stringify(decoded.payload))).toBe("eede3c4f");
    expect(validateSim(decoded.payload.sim)).toBeNull();
    expect(decoded.payload.sim.routes.length).toBe(18);
    expect(encodeSave(decoded.payload.sim, decoded.payload.lastSeenMs, decoded.payload.settings)).toBe(raw);
    // The fixture's sorter is genuinely under-registered (mirror names only the last of three
    // outputs) yet derivation reads all three from the table — no mutation, no value change.
    const sorter = decoded.payload.sim.machines.find((m) => m.blueprint === "sorter")!;
    expect(outputRouteIds(decoded.payload.sim, sorter.id).length).toBe(3);
  });
});

describe("REG-100 gate 7: the out-of-scope capacity pre-check quirk is unchanged", () => {
  it("dismantle's capacity pre-check excludes the started batch while the returned materials include it", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    // Test-only started batch (the quirk's subject). The pre-check counts tray+buffer+build+belt
    // but NOT the batch; the actual return adds the batch in full.
    machine.batch = [{ resource: "scrap", qty: 2 }];
    machine.progress = 4000;
    machine.status = "running";
    const preCheckRefund =
      BLUEPRINTS.sorter.buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
      machine.trayUnits +
      machine.inBufUnits +
      state.routes
        .filter((route) => registeredIdsOf(state, machine).includes(route.id))
        .reduce((total, route) => total + beltRefundOf(route), 0);
    // Fill the store so the free room equals the pre-check exactly: the tap is allowed...
    const room = preCheckRefund;
    state.store = { scrap: TUNING.dockCapacity - room };
    state.storeUnits = TUNING.dockCapacity - room;
    const storeBefore = state.storeUnits;
    expect(send(state, { type: "machine.dismantle", machineId: machine.id })).toBe(true);
    // ...yet the returned materials include the batch, overshooting capacity by exactly the batch.
    expect(state.storeUnits - storeBefore).toBe(preCheckRefund + 2);
    expect(state.storeUnits).toBe(TUNING.dockCapacity + 2);
  });
});
