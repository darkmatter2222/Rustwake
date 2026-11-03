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
  const { applyCommand, DOCK_TILE, YARD_TILES } = await import("../../src/game/simulation/commands");
  const { createInitialState } = await import("../../src/game/simulation/types");
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

  it("leaves the reserve floor at 10: nothing below it helps and 20 costs throughput", () => {
    const byFloor: Record<number, Run> = Object.fromEntries(
      runs.map((run) => [run.floor, run]),
    );
    console.log(
      "supply-window:",
      JSON.stringify(
        runs.map((run) => ({
          floor: run.floor,
          machines: run.machines,
          batches: run.totals,
          aggregate: aggregate(run.lateLinks),
        })),
      ),
    );
    // A floor of zero starves the first builds: the yard stops at four machines.
    expect(byFloor[0].machines).toBeLessThanOrEqual(4);
    expect(byFloor[10].machines).toBeGreaterThanOrEqual(7);
    // 10 is the best of the four on throughput, so it stays the shipped value.
    const best = runs.reduce((a, b) => (b.totals > a.totals ? b : a));
    expect(best.floor).toBe(10);
    expect(byFloor[10].totals).toBeGreaterThan(byFloor[20].totals);
  });

  it("ships on every link while the young yard is filling (B-25)", () => {
    const run = runs.find((r) => r.floor === 10)!;
    expect(run.earlyLinks.length).toBeGreaterThanOrEqual(5);
    for (const link of run.earlyLinks) {
      expect(link.busy, `link busy % at tick ${run.tick}`).toBeGreaterThan(0);
    }
  });

  it("keeps most links busy at half an hour and holds enough ready units (B-25)", () => {
    const run = runs.find((r) => r.floor === 10)!;
    expect(run.lateLinks.length).toBeGreaterThanOrEqual(20);
    const idle = run.lateLinks.filter((link) => link.busy === 0).length;
    // Three idle links out of twenty-two, all on the last-built machine, are the
    // duplicate-source plan proposals; the rest of the yard flows.
    expect(idle).toBeLessThanOrEqual(3);
    expect(aggregate(run.lateLinks)).toBeGreaterThanOrEqual(12);
    // The two-batch window is not the binding constraint: the last-built machine
    // still holds a full ready set while it waits on a scarce material.
    expect(Math.max(...Object.values(run.readyUnits))).toBeGreaterThanOrEqual(
      16,
    );
  });
});
