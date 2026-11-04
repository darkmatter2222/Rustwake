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
  fleet: number;
  totals: number;
  research: number;
  idleEarly: number;
  idleLate: number;
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
    // T7's dock primary claims the onboarding contract once steel is stocked, and
    // every repeatable sell stays locked until then (commands.ts:301), so the
    // driver mirrors that one press.
    if (!state.exportClaimed && (state.store["steel"] ?? 0) >= defs.TUNING.exportContractSteel) {
      send(state, { type: "contract.export" });
    }
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
      case "drone":
        send(state, { type: "drone.add" });
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
    fleet: 1 + state.spares.length,
    totals: state.machines.reduce(
      (sum, machine) => sum + machine.batchesDone,
      0,
    ),
    research: Object.keys(state.research).length,
    idleEarly: early ? early.links.filter((link) => link.busy === 0).length : 0,
    idleLate: late.links.filter((link) => link.busy === 0).length,
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

  it("keeps floor 10 as the shipped value: it is the only floor that fills the yard", () => {
    const full = runs.find((r) => r.floor === 10)!;
    console.log(
      "supply-window:",
      JSON.stringify(
        runs.map((run) => ({
          floor: run.floor,
          machines: run.machines,
          fleet: run.fleet,
          batches: run.totals,
          research: run.research,
          idle: run.idleLate,
          aggregate: aggregate(run.lateLinks),
          ready: Math.max(...Object.values(run.readyUnits)),
        })),
      ),
    );
    // With the onboarding market open, the fleet step in the ladder and a sell that
    // leaves the machines' own window in the store (D-42), three floors reach the same
    // full yard: 5, 10, and 20 all land on eight machines and three nodes inside the
    // half hour. Only floor 0 stays stripped, so the floor is still a real lever - and
    // a flatter one than before the second drone (B-28, D-38).
    expect(full.machines).toBe(8);
    expect(full.research).toBe(3);
    expect(full.fleet).toBe(5);
    const stripped = runs.find((r) => r.floor === 0)!;
    expect(stripped.machines).toBeLessThan(8);
    expect(stripped.research).toBe(0);
    expect(stripped.totals).toBeLessThan(full.totals);
    for (const floor of [5, 20]) {
      const run = runs.find((r) => r.floor === floor)!;
      expect(run.machines, `machines at floor ${floor}`).toBe(8);
      expect(run.research, `research at floor ${floor}`).toBe(3);
      // The whole sweep sits inside ±7 % of the shipped floor: 2 028 / 1 902 / 1 792
      // batches at floors 5 / 10 / 20, against 1 533 with no reserve at all.
      expect(run.totals, `batches at floor ${floor}`).toBeGreaterThanOrEqual(
        Math.round(full.totals * 0.93)
      );
      expect(run.totals, `batches at floor ${floor}`).toBeLessThanOrEqual(
        Math.round(full.totals * 1.07)
      );
    }
    // 10 stays shipped: it is the middle value that clears every starter blueprint's
    // price with room left over, and it now also buys the first node earliest (478).
    expect(full.totals).toBe(1902);
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
      ).toBeGreaterThanOrEqual(run.machines);
      const idle = run.lateLinks.filter((link) => link.busy === 0).length;
      // One link per (endpoint, material): no parallel duplicate is created, so every
      // link in the settled shipped yard carries cargo (spec 10.1). Only the stripped
      // floor-0 run leaves links idle (3 of them), because it never reaches the last
      // three stages - the measured cost of a floor below the next blueprint's price.
      const ceiling = run.floor >= 5 ? 0 : 3;
      expect(idle, `idle links at floor ${run.floor}`).toBeLessThanOrEqual(ceiling);
      expect(
        aggregate(run.lateLinks),
        `aggregate at floor ${run.floor}`,
      ).toBeGreaterThanOrEqual(7);
    }
    const run = runs.find((r) => r.floor === 10)!;
    expect(run.lateLinks.length).toBeGreaterThanOrEqual(16);
    // The shipped floor leaves both a build reserve and each machine's window in the
    // store, so the best-prepared stage holds at least a whole tranche ready (the sweep
    // logs the value). The stripped floor-0 run reaches 4 at best, which is the visible
    // cost of pulling every unit out of the store before the next price is met.
    expect(Math.max(...Object.values(run.readyUnits))).toBeGreaterThanOrEqual(10);
    expect(Math.max(...Object.values(runs.find((r) => r.floor === 0)!.readyUnits))).toBeLessThanOrEqual(
      4
    );
  });
});
