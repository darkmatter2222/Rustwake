import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Command } from "../../src/game/simulation/commands";
import type { SimState } from "../../src/game/simulation/types";

/**
 * Supply-window probe (B-15 reserve floor, B-25 two-batch pull window). The
 * numbers here are the ones `npx tsx scripts/probe-supply.mjs` writes to
 * `docs/evidence/2026-11-03-supply-window.md`; the assertions pin the two
 * conclusions that sweep produced (decision D-28).
 *
 * `engine.ts` captures `TUNING.reserveFloor` once at module load, so each floor
 * re-imports the engine through a cache-busting query and reads the value with
 * that floor already in place.
 */
const ROUNDS = 1800; // 18 000 ticks = 30 minutes of active play
const FIRST_SNAPSHOT = 50; // rounds, so the first ratio lands near tick 800

interface Row {
  busy: number;
}

interface Run {
  floor: number;
  tick: number;
  machines: number;
  totals: number;
  research: number;
  earlyLinks: Row[];
  lateLinks: Row[];
  readyUnits: Record<number, number>;
}

async function runFloor(floor: number): Promise<Run> {
  // `engine.ts` captures the floor once at module load, so every run needs a
  // fresh module graph with the new value already patched in.
  vi.resetModules();
  const defs = await import("../../src/game/content/defs");
  Object.assign(defs.TUNING, { reserveFloor: floor });
  const { advance } = await import("../../src/game/simulation/engine");
  const { applyCommand, DOCK_TILE, YARD_TILES } =
    await import("../../src/game/simulation/commands");
  const { createInitialState } =
    await import("../../src/game/simulation/types");
  const { nextYardStep } = await import("../../src/game/simulation/plan");

  let seq = 0;
  const send = (state: SimState, body: Record<string, unknown>) => {
    seq += 1;
    return applyCommand(state, { ...body, id: `s${floor}-${seq}` } as Command);
  };
  const freeTile = (state: SimState) => {
    for (let tile = 0; tile < YARD_TILES; tile += 1) {
      if (tile === DOCK_TILE) continue;
      if (!state.machines.some((m) => m.tile === tile)) return tile;
    }
    return 8;
  };
  const percent = (busy: number, age: number) =>
    age > 0 ? Number(((busy * 100) / age).toFixed(1)) : 0;
  const snapshot = (state: SimState) => ({
    tick: state.tick,
    links: state.routes.map((route) => ({
      busy: percent(route.busyTicks, route.ageTicks),
    })),
    machines: state.machines.map((machine) => ({
      id: machine.id,
      blueprint: machine.blueprint,
      busy: percent(machine.busyTicks, machine.ageTicks),
      ready: Object.values(machine.inBuf).reduce(
        (sum, value) => sum + (value ?? 0),
        0,
      ),
    })),
  });

  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, defs.TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  state.tutorial = 9; // the tutorial is complete, so every blueprint is known

  let early: ReturnType<typeof snapshot> | null = null;
  for (let round = 0; round < ROUNDS; round += 1) {
    const step = nextYardStep(state);
    switch (step.kind) {
      case "connect":
        for (const plan of step.plans) {
          send(state, {
            type: "route.connect",
            from: plan.from,
            to: plan.to,
            filter: plan.filter,
          });
        }
        break;
      case "build":
        send(state, {
          type: "machine.build",
          blueprint: step.blueprint,
          tile: freeTile(state),
        });
        break;
      case "sell":
        send(state, {
          type: "contract.sell",
          resource: step.resource,
          qty: step.qty,
        });
        break;
      case "research":
        send(state, { type: "research.buy", node: step.node });
        break;
      case "upgrade":
        send(state, { type: "machine.upgrade", machineId: step.machineId });
        break;
      default:
        send(state, { type: "manual.salvage" });
    }
    advance(state, 10); // one second between taps, as the scripted session does
    if (round + 1 === FIRST_SNAPSHOT) early = snapshot(state);
  }
  const late = snapshot(state);
  const readyUnits: Record<number, number> = {};
  for (const machine of late.machines) readyUnits[machine.id] = machine.ready;
  return {
    floor,
    tick: late.tick,
    machines: state.machines.length,
    totals: state.machines.reduce(
      (sum, machine) => sum + machine.batchesDone,
      0,
    ),
    research: Object.keys(state.research).length,
    earlyLinks: early ? early.links : [],
    lateLinks: late.links,
    readyUnits,
  };
}

const aggregate = (links: Row[]) =>
  Number(
    (
      links.reduce((sum, link) => sum + link.busy, 0) /
      Math.max(1, links.length)
    ).toFixed(1),
  );

describe("supply window (B-15, B-25)", () => {
  // Sequential on purpose: each floor patches the shared TUNING table right
  // before its own engine instance is created.
  const runs: Run[] = [];
  beforeAll(async () => {
    for (const floor of [0, 5, 10, 20]) runs.push(await runFloor(floor));
  }, 60_000);

  it("reaches the same depth at every reserve floor, so 10 stays the shipped value", () => {
    console.log(
      "supply-window:",
      JSON.stringify(
        runs.map((run) => ({
          floor: run.floor,
          machines: run.machines,
          batches: run.totals,
          research: run.research,
          aggregate: aggregate(run.lateLinks),
        })),
      ),
    );
    // Every floor now finishes at eight machines (through the signal lab) and
    // three research nodes, so the floor is no longer what limits depth.
    for (const run of runs) {
      expect(run.machines, `machines at floor ${run.floor}`).toBe(8);
      expect(run.research, `research nodes at floor ${run.floor}`).toBe(3);
    }
    // The four floor totals sit inside one step of each other (1 018-1 103
    // batches), so 10 is kept for the sellable-surplus reason rather than a
    // throughput difference.
    const best = Math.max(...runs.map((run) => run.totals));
    for (const run of runs) {
      expect(
        run.totals,
        `batches at floor ${run.floor}`,
      ).toBeGreaterThanOrEqual(Math.round(best * 0.9));
    }
  });

  it("ships on every link while the young yard is filling (B-25)", () => {
    const run = runs.find((r) => r.floor === 10)!;
    expect(run.earlyLinks.length).toBeGreaterThanOrEqual(5);
    for (const link of run.earlyLinks) {
      expect(link.busy, `link busy % at tick ${run.tick}`).toBeGreaterThan(0);
    }
  });

  it("leaves no link idle at half an hour and keeps a window ready (B-23, B-25)", () => {
    for (const run of runs) {
      expect(
        run.lateLinks.length,
        `links at floor ${run.floor}`,
      ).toBeGreaterThanOrEqual(16);
      const idle = run.lateLinks.filter((link) => link.busy === 0).length;
      // One link per (endpoint, material): no parallel duplicate is created, so
      // every link in the settled yard carries cargo (spec 10.1).
      expect(idle, `idle links at floor ${run.floor}`).toBe(0);
      expect(
        aggregate(run.lateLinks),
        `aggregate at floor ${run.floor}`,
      ).toBeGreaterThanOrEqual(9);
    }
    const run = runs.find((r) => r.floor === 10)!;
    // A stocked store keeps a full two-batch window ready at the funded stages,
    // which is exactly what `pullNeed` is sized for (B-25).
    expect(Math.max(...Object.values(run.readyUnits))).toBeGreaterThanOrEqual(
      16,
    );
  });
});
