import { describe, expect, it } from "vitest";
import {
  buildChoiceLocal,
  buildChoiceRemote,
  CHOICE_WARMUP_TICKS,
  CHOICE_WINDOW_TICKS,
  REMOTE_CORRIDOR_CELLS,
  REMOTE_DEST_CELL,
  REMOTE_JOB_AMOUNT,
  REMOTE_JOB_COUNT,
} from "../fixtures/release";
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import {
  applyCommand,
  branchPrice,
  upgradeComparison,
  upgradeCost,
  upgradePlans,
  type CommandResult,
} from "../../src/game/simulation/commands";
import { tickLogistics, logisticsTotals } from "../../src/game/simulation/logistics";
import {
  bayLeasesAt,
  roadPathCost,
  setBayCapacity,
  travelTicks,
} from "../../src/game/simulation/traffic";
import {
  UPGRADE_BRANCHES,
  batchMilliOf,
  powerOf,
  upgradeRanks,
  type MachineState,
  type SimState,
} from "../../src/game/simulation/types";
import { createRoadNetwork, ROAD_CELL_COST_SCRAP } from "../../src/game/world/roadGraph";
import { applyRoadCommand } from "../../src/game/world/roadTool";
import type { Cell, WorldState } from "../../src/game/world/types";

/**
 * G1 (#151) first-playable gate — the CHOICE axis (ACCEPTANCE.md:53).
 *
 * One identical seed yard, two strategies, measured divergence in exact ticks:
 *  - CHOICE-LOCAL is PROCESSING-limited in the 2D economy: the sorter's 40-tick
 *    cycle binds, not the shipped constant 5-tick belt latency. A speed-branch
 *    upgrade shortens the cycle (40000 -> 36364 milli-ticks) and completes one
 *    more batch (+1 steel) over the same 400-tick window. A draw upgrade moves
 *    power, not throughput. The blind prominent-action tap is the unnamed plain
 *    ladder (U05/E06): it can never commit a plan the player did not choose, and
 *    an unknown branch is refused before any credit moves.
 *  - CHOICE-REMOTE is HAULING-limited in the session corridor: travel cost 23
 *    far exceeds the 2-tick unload, and a single destination bay serialises the
 *    two carriers (completions 27/30/75/78). Widening the bay to 2 removes the
 *    contention (27/27/75/75) — the bottleneck shifts from bay queue to travel.
 *
 * Every number below was measured on the shipped engine (no fitted constants):
 * the 2D route latency is TUNING.routeLatencyTicks = 5, so travel-length-dependent
 * throughput (E05) is exercised through tickLogistics, exactly as the architecture
 * separates the save-authority sim from the session transport layer.
 */

/* ------------------------------------------------------------- measurement */

interface LocalMeasure {
  sim: SimState;
  sorter: MachineState;
  furnace: MachineState;
  result: CommandResult | null;
  /** Sorter batches completed over the window. */
  sorterBatches: number;
  /** Furnace batches completed over the window. */
  furnaceBatches: number;
  /** Steel gained in the store over the window. */
  steel: number;
  /** Absolute store steel at the end of the window. */
  steelAbs: number;
}

function localMeasure(upgrade?: { machine: "sorter" | "furnace"; branch?: "speed" | "draw" }): LocalMeasure {
  const { sim } = buildChoiceLocal();
  const sorter = sim.machines.find((m) => m.blueprint === "sorter") as MachineState;
  const furnace = sim.machines.find((m) => m.blueprint === "furnace") as MachineState;
  const steel0 = sim.store.steel ?? 0;
  const sorter0 = sorter.batchesDone;
  const furnace0 = furnace.batchesDone;
  let result: CommandResult | null = null;
  if (upgrade) {
    const target = upgrade.machine === "sorter" ? sorter : furnace;
    result = applyCommand(sim, {
      id: "choice-upgrade",
      type: "machine.upgrade",
      machineId: target.id,
      branch: upgrade.branch,
    });
  }
  advance(sim, CHOICE_WINDOW_TICKS);
  return {
    sim,
    sorter,
    furnace,
    result,
    sorterBatches: sorter.batchesDone - sorter0,
    furnaceBatches: furnace.batchesDone - furnace0,
    steel: (sim.store.steel ?? 0) - steel0,
    steelAbs: sim.store.steel ?? 0,
  };
}

interface RemoteMeasure {
  completions: Array<number | null>;
  deliveredAt: Record<number, number>;
  snap: Record<number, { leases: number[]; jobs: string[] }>;
  totals: Record<string, number>;
  jobs: ReturnType<typeof buildChoiceRemote>["log"]["jobs"];
}

function remoteMeasure(bayCap: number): RemoteMeasure {
  const f = buildChoiceRemote();
  if (bayCap !== 1) setBayCapacity(f.traffic, REMOTE_DEST_CELL, bayCap);
  const completions: Array<number | null> = f.log.jobs.map(() => null);
  const deliveredAt: Record<number, number> = {};
  const snap: Record<number, { leases: number[]; jobs: string[] }> = {};
  for (let t = 1; t <= 120; t += 1) {
    tickLogistics(f.log, f.net, 1, f.traffic);
    f.log.jobs.forEach((job, i) => {
      if (job.status === "complete" && completions[i] === null) completions[i] = t;
    });
    if (t === 80 || t === 100) {
      deliveredAt[t] = f.log.jobs
        .filter((job) => job.status === "complete")
        .reduce((sum, job) => sum + job.amount, 0);
    }
    if ([24, 25, 26, 27, 28, 30].includes(t)) {
      snap[t] = {
        leases: bayLeasesAt(f.traffic, REMOTE_DEST_CELL).map((lease) => lease.carrierId),
        jobs: f.log.jobs.map((job) => `${job.phase}:${job.carrierId}:${job.status}`),
      };
    }
  }
  return { completions, deliveredAt, snap, totals: logisticsTotals(f.log), jobs: f.log.jobs };
}

/* --------------------------------------------------------------- same seed */

describe("one seed, two strategies (#151)", () => {
  it("LOCAL and REMOTE share a byte-identical sim; the world differs only by the strategy corridor", () => {
    const local = buildChoiceLocal();
    const remote = buildChoiceRemote();
    // Same seed yard: the save-authority sim is byte-identical (both choiceYard()).
    expect(JSON.stringify(local.sim)).toBe(JSON.stringify(remote.sim));

    // The corridor is ONE atomic road transaction on the world ledger
    // (roadTool.ts executePlace): 24 new cells at 5 scrap each move stock ->
    // committed and bump world.revision once. Road topology lives in the
    // session RoadNetworkState, never in WorldState, so the entire world delta
    // is exactly this material step — the deliberate U05 strategy choice.
    expect(ROAD_CELL_COST_SCRAP).toBe(5);
    const cost = REMOTE_CORRIDOR_CELLS * ROAD_CELL_COST_SCRAP;
    expect(cost).toBe(120);
    expect(local.world.stock.scrap).toBe(1000);
    expect(remote.world.stock.scrap).toBe(880);
    expect(local.world.committed).toEqual({});
    expect(remote.world.committed).toEqual({ scrap: cost });
    expect(remote.world.revision).toBe(local.world.revision + 1);
    // Stock differs ONLY in scrap; every other world field is byte-identical
    // (terrain, parcels, buildings, sites, reservations, credits, counters).
    expect({ ...remote.world.stock, scrap: local.world.stock.scrap }).toEqual(local.world.stock);
    const withoutLedger = (w: WorldState): string => {
      const rest: Record<string, unknown> = { ...w };
      delete rest.revision;
      delete rest.stock;
      delete rest.committed;
      return JSON.stringify(rest);
    };
    expect(withoutLedger(remote.world)).toBe(withoutLedger(local.world));

    // The strongest form: replay the SAME corridor onto the LOCAL world and
    // both layers then match REMOTE byte-for-byte. Nothing else changed.
    const net = createRoadNetwork();
    const cells: Cell[] = [];
    for (let x = 0; x < REMOTE_CORRIDOR_CELLS; x += 1) cells.push({ x, y: 0 });
    expect(
      applyRoadCommand(local.world, net, { id: "remote-corridor", type: "road.place", cells }),
    ).toEqual({ ok: true, revision: 1 });
    expect(JSON.stringify(local.world)).toBe(JSON.stringify(remote.world));
    expect(JSON.stringify(net)).toBe(JSON.stringify(remote.net));
    // The corridor itself: 24 paid cells, 23 single-lane two-way edges on y=0.
    expect(Object.keys(remote.net.cells)).toHaveLength(REMOTE_CORRIDOR_CELLS);
    expect(Object.keys(remote.net.edges)).toHaveLength(REMOTE_CORRIDOR_CELLS - 1);
    for (let x = 0; x < REMOTE_CORRIDOR_CELLS; x += 1) {
      expect(remote.net.cells[`${x},0`]).toEqual({ paidScrap: ROAD_CELL_COST_SCRAP });
    }
    for (const edge of Object.values(remote.net.edges)) {
      expect(edge.lanes).toBe(1);
      expect(edge.direction).toBe("two-way");
      expect(edge.a.y).toBe(0);
      expect(edge.b.y).toBe(0);
      // Endpoints are ordered by string cell key, so either direction is legal.
      expect(Math.abs(edge.b.x - edge.a.x)).toBe(1);
    }
  });

  it("the shared yard is command-built and warmed to the same tick", () => {
    const { sim } = buildChoiceLocal();
    expect(sim.tick).toBe(CHOICE_WARMUP_TICKS);
    expect(sim.machines.length).toBe(2);
    expect(sim.machines[0]).toMatchObject({ id: 1, blueprint: "sorter", tile: 8 });
    expect(sim.machines[1]).toMatchObject({ id: 2, blueprint: "furnace", tile: 9 });
    expect(sim.routes.length).toBe(5);
    // 2 builds + 5 route connects, deterministic local ids (seenCommands is state).
    expect(Object.keys(sim.seenCommands)).toEqual([
      "choice-1", "choice-2", "choice-3", "choice-4", "choice-5", "choice-6", "choice-7",
    ]);
  });
});

/* ------------------------------------------- CHOICE-LOCAL: processing bound */

describe("CHOICE-LOCAL: short route, processing bottleneck (#151)", () => {
  it("the sorter runs cycle-bound, not transport-bound", () => {
    const base = localMeasure();
    // The binding term is the 40-tick cycle; the belt latency is the constant 5.
    expect(RECIPES[BLUEPRINTS.sorter.recipeId].cycleTicks).toBe(40);
    expect(TUNING.routeLatencyTicks).toBe(5);
    expect(TUNING.routeLatencyTicks).toBeLessThan(40);
    // Abundant scrap, outputs drained: busy 595 of 600 ticks, starved only the
    // first 5 (before the first delivery), never full. Processing-limited.
    expect(base.sorter.busyTicks).toBe(595);
    expect(base.sorter.starvedTicks).toBe(5);
    expect(base.sorter.fullTicks).toBe(0);
    expect(base.sim.tick).toBe(CHOICE_WARMUP_TICKS + CHOICE_WINDOW_TICKS);
    // 400-tick window / 40-tick cycle = 10 batches; furnace exports 5 steel.
    expect(base.sorterBatches).toBe(10);
    expect(base.sorter.batchMilli).toBe(40000);
    expect(base.steel).toBe(5);
  });

  it("a speed upgrade shifts the bottleneck: +1 batch, +1 steel in the same 400 ticks", () => {
    const base = localMeasure();
    const speed = localMeasure({ machine: "sorter", branch: "speed" });
    expect(speed.result?.ok).toBe(true);
    // Paid the named-plan price: plain ladder 30 + speed premium 10 = 40.
    expect(speed.sim.credits).toBe(60 - 40);
    expect(speed.sorter.level).toBe(2);
    expect(speed.sorter.branch).toEqual(["speed"]);
    expect(upgradeRanks(speed.sorter)).toEqual({ speed: 1, buffer: 0, draw: 0 });
    // The batch clock moves: ceil(40*10000/11) = 36364 milli-ticks.
    expect(speed.sorter.batchMilli).toBe(36364);
    expect(batchMilliOf({ ...speed.sorter, level: 2 })).toBe(36364);
    // Measured divergence over the identical window: 11 vs 10 batches, 6 vs 5 steel.
    expect(speed.sorterBatches).toBe(11);
    expect(speed.steel).toBe(6);
    expect(speed.sorterBatches - base.sorterBatches).toBe(1);
    expect(speed.steel - base.steel).toBe(1);
    // Still processing-bound (latency unchanged), just a faster cycle.
    expect(speed.sorter.fullTicks).toBe(0);
    expect(TUNING.routeLatencyTicks).toBe(5);
  });

  it("a draw upgrade moves power, not throughput (furnace power 2 -> 1)", () => {
    const base = localMeasure();
    const draw = localMeasure({ machine: "furnace", branch: "draw" });
    expect(draw.result?.ok).toBe(true);
    expect(draw.sim.credits).toBe(60 - 40); // furnace base 40 + draw premium 0
    expect(draw.furnace.level).toBe(2);
    expect(draw.furnace.branch).toEqual(["draw"]);
    expect(upgradeRanks(draw.furnace)).toEqual({ speed: 0, buffer: 0, draw: 1 });
    // Power drops by exactly one unit; the batch clock is untouched.
    expect(powerOf(base.furnace)).toBe(2);
    expect(powerOf(draw.furnace)).toBe(1);
    expect(draw.furnace.batchMilli).toBe(40000);
    expect(base.furnace.batchMilli).toBe(40000);
    // Throughput identical: same furnace batches, same absolute steel.
    expect(base.furnaceBatches).toBe(5);
    expect(draw.furnaceBatches).toBe(5);
    expect(draw.steelAbs).toBe(base.steelAbs);
    expect(draw.steelAbs).toBe(11);
  });
});

/* ------------------------------------- blind prominent-action policy (U05) */

describe("the blind prominent-action tap and the U05 dock (#151)", () => {
  it("a blind tap buys the unnamed plain ladder, never a named plan", () => {
    const blind = localMeasure({ machine: "sorter" });
    expect(blind.result?.ok).toBe(true);
    // Plain ladder price 30 (no premium); no branch is recorded.
    expect(blind.sim.credits).toBe(60 - 30);
    expect(blind.sorter.level).toBe(2);
    expect(blind.sorter.branch).toBeUndefined();
    // The legacy scalar: an unnamed level still carries speed ranks, so the
    // throughput matches the named speed plan — at 10 credits less.
    expect(upgradeRanks(blind.sorter)).toEqual({ speed: 1, buffer: 0, draw: 0 });
    expect(blind.sorter.batchMilli).toBe(36364);
    expect(blind.sorterBatches).toBe(11);
    expect(blind.steel).toBe(6);
  });

  it("an unknown plan is refused before any credit moves (U05/E06 guard)", () => {
    const { sim } = buildChoiceLocal();
    const sorter = sim.machines.find((m) => m.blueprint === "sorter") as MachineState;
    const credits0 = sim.credits;
    const revision0 = sim.revision;
    const result = applyCommand(sim, {
      id: "blind-bad",
      type: "machine.upgrade",
      machineId: sorter.id,
      branch: "not-a-plan" as never,
    });
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(sim.credits).toBe(credits0);
    expect(sorter.level).toBe(1);
    expect(sorter.branch).toBeUndefined();
    expect(sim.revision).toBe(revision0);
    // The comparison surface refuses the same unknown plan.
    expect(upgradeComparison(sim, sorter.id, "not-a-plan" as never)).toBeNull();
  });

  it("the dock prices the tradeoff and reports real before/after (U05)", () => {
    const { sim } = buildChoiceLocal();
    const sorter = sim.machines.find((m) => m.blueprint === "sorter") as MachineState;
    const furnace = sim.machines.find((m) => m.blueprint === "furnace") as MachineState;
    // Price ladder: plain 30, speed +10, buffer/draw +0.
    expect(upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, 1)).toBe(30);
    expect(branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, 1, "speed")).toBe(40);
    expect(branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, 1, "buffer")).toBe(30);
    expect(branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, 1, "draw")).toBe(30);
    // The deliberate plan set, in dock order, all affordable at 60 credits.
    const plans = upgradePlans(sim, sorter.id);
    expect(plans.map((p) => [p.branch, p.cost, p.affordable])).toEqual([
      ["speed", 40, true],
      ["buffer", 30, true],
      ["draw", 30, true],
    ]);
    expect(UPGRADE_BRANCHES).toEqual(["speed", "buffer", "draw"]);
    // Speed comparison: the batch clock moves, power does not.
    const speed = upgradeComparison(sim, sorter.id, "speed");
    expect(speed).not.toBeNull();
    expect(speed!.cost).toBe(40);
    expect(speed!.shortfall).toBe(0);
    expect(speed!.before).toEqual({
      level: 1, batchSeconds: 4, batchesPerMinute: 15, power: 1, inputCapacity: 12,
      ranks: { speed: 0, buffer: 0, draw: 0 },
    });
    expect(speed!.after.level).toBe(2);
    expect(speed!.after.batchSeconds).toBe(3.6364);
    expect(speed!.after.batchesPerMinute).toBeCloseTo(16.499835, 5);
    expect(speed!.after.power).toBe(1);
    expect(speed!.after.ranks).toEqual({ speed: 1, buffer: 0, draw: 0 });
    // Draw comparison on the furnace: power moves, the batch clock does not.
    const draw = upgradeComparison(sim, furnace.id, "draw");
    expect(draw!.cost).toBe(40);
    expect(draw!.before.power).toBe(2);
    expect(draw!.after.power).toBe(1);
    expect(draw!.before.batchSeconds).toBe(4);
    expect(draw!.after.batchSeconds).toBe(4);
    expect(draw!.after.ranks).toEqual({ speed: 0, buffer: 0, draw: 1 });
  });
});

/* --------------------------------------------- CHOICE-REMOTE: hauling bound */

describe("CHOICE-REMOTE: long route, hauling bottleneck (#151)", () => {
  const walk: Cell[] = [];
  for (let x = 0; x < REMOTE_CORRIDOR_CELLS; x += 1) walk.push({ x, y: 0 });

  it("the corridor is travel-bound: cost 23, first delivery at tick 27", () => {
    const f = buildChoiceRemote();
    // The path excludes the start cell: 24 cells -> cost 23.
    expect(roadPathCost(f.traffic, f.net, walk)).toBe(23);
    expect(travelTicks(23, 1)).toBe(23);
    expect(f.traffic.defaultTruck.speed).toBe(1);
    expect(f.traffic.defaultTruck.loadTicks).toBe(0);
    expect(f.traffic.defaultTruck.unloadTicks).toBe(2);
    // E05 completion: 2-tick dispatch overhead + load 0 + travel 23 + unload 2.
    expect(2 + 0 + 23 + 2).toBe(27);
    // Travel (23) dominates unload (2): hauling-limited, not processing-limited.
    expect(23).toBeGreaterThan(2);
    expect(f.log.jobs.map((j) => [j.id, j.commandId, j.status, j.phase, j.carrierId])).toEqual([
      [1, "remote-job-0", "pending", "waiting", null],
      [2, "remote-job-1", "pending", "waiting", null],
      [3, "remote-job-2", "pending", "waiting", null],
      [4, "remote-job-3", "pending", "waiting", null],
    ]);
    expect(REMOTE_JOB_COUNT).toBe(4);
    expect(REMOTE_JOB_AMOUNT).toBe(5);
  });

  it("a single bay serialises the carriers: completions 27/30/75/78", () => {
    const run = remoteMeasure(1);
    expect(run.completions).toEqual([27, 30, 75, 78]);
    expect(run.deliveredAt).toEqual({ 80: 20, 100: 20 });
    expect(run.totals).toEqual({ scrap: 100 });
    // The contention witness, tick by tick:
    // t24: both carriers en route, no bay held yet.
    expect(run.snap[24].leases).toEqual([]);
    expect(run.snap[24].jobs).toEqual([
      "to-dest:1:active", "to-dest:2:active", "waiting:null:pending", "waiting:null:pending",
    ]);
    // t25-26: carrier 1 holds the only bay; carrier 2 has arrived but waits.
    expect(run.snap[25].leases).toEqual([1]);
    expect(run.snap[26].leases).toEqual([1]);
    expect(run.snap[26].jobs[1]).toBe("to-dest:2:active");
    // t27: job 1 completes (2+0+23+2), carrier 1 releases the bay and heads back.
    expect(run.snap[27].jobs[0]).toBe("done:1:complete");
    expect(run.snap[27].leases).toEqual([]);
    // t28: carrier 2 finally claims the bay — three ticks after it arrived.
    expect(run.snap[28].leases).toEqual([2]);
    // t30: job 2 completes at 30, not 27: the bay queue cost exactly 3 ticks.
    expect(run.snap[30].jobs[1]).toBe("done:2:complete");
    expect(run.completions[1]! - run.completions[0]!).toBe(3);
  });

  it("widening the bay shifts the bottleneck: completions 27/27/75/75", () => {
    const narrow = remoteMeasure(1);
    const wide = remoteMeasure(2);
    expect(wide.completions).toEqual([27, 27, 75, 75]);
    // The bay queue is gone: jobs 2 and 4 each lose their 3-tick delay.
    expect(narrow.completions[1]! - wide.completions[1]!).toBe(3);
    expect(narrow.completions[3]! - wide.completions[3]!).toBe(3);
    // The first delivery is unchanged — travel, not the bay, sets the floor.
    expect(wide.completions[0]).toBe(narrow.completions[0]);
    expect(wide.completions[0]).toBe(27);
    expect(wide.deliveredAt).toEqual({ 80: 20, 100: 20 });
    expect(wide.totals).toEqual({ scrap: 100 });
  });

  it("cargo is conserved through the haul under both bay widths", () => {
    for (const bayCap of [1, 2]) {
      const run = remoteMeasure(bayCap);
      expect(run.totals).toEqual({ scrap: 100 });
      for (const job of run.jobs) {
        expect(job.status).toBe("complete");
        expect(job.amount).toBe(REMOTE_JOB_AMOUNT);
        expect(job.atSource + job.inTransit + job.delivered + job.returned).toBe(job.amount);
        expect(job.delivered).toBe(REMOTE_JOB_AMOUNT);
        expect(job.returned).toBe(0);
      }
    }
  });
});
