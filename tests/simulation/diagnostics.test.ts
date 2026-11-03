import { describe, expect, it } from "vitest";
import { TUNING, type ResourceId } from "../../src/game/content/defs";
import { advance, advanceTo } from "../../src/game/simulation/engine";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { diagnoseMachine, yardSummary } from "../../src/game/simulation/diagnostics";
import { migrate, type SavePayload } from "../../src/game/persistence/save";

let seq = 900;
function send(state: SimState, command: CommandBody, id?: string) {
  const key = id ?? `d${(seq += 1)}`;
  return applyCommand(state, { ...command, id: key } as Command);
}

function seed(state: SimState, entries: Partial<Record<ResourceId, number>>): void {
  for (const key of Object.keys(entries) as ResourceId[]) {
    const value = entries[key] ?? 0;
    state.store[key] = (state.store[key] ?? 0) + value;
    state.storeUnits += value;
  }
}

const CHAIN_PLAN: readonly [string, ResourceId][] = [
  ["sorter", "scrap"],
  ["copperSeparator", "nonferrous"],
  ["wireMill", "copper"],
  ["polymerRecycler", "residue"],
];

/** Starter yard after the tutorial's repair, four linked machines, unrun. */
function chainBase(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  seed(state, { scrap: 300, ferrous: 40, nonferrous: 60, residue: 30 });
  const tiles = [0, 1, 3, 4];
  CHAIN_PLAN.forEach(([blueprint, input], index) => {
    send(state, { type: "machine.build", blueprint, tile: tiles[index] });
    const machine = state.machines[state.machines.length - 1];
    send(state, { type: "route.connect", from: 0, to: machine.id, filter: input });
    send(state, { type: "route.connect", from: machine.id, to: 0, filter: null });
  });
  return state;
}

function chain(): SimState {
  const state = chainBase();
  advance(state, 1200);
  return state;
}

/** Pre-repair yard: no drone, no in-flight cargo, so `advanceTo` really jumps. */
function unlinked(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
  return state;
}

function only(state: SimState, blueprint: string) {
  const machine = state.machines.find((m) => m.blueprint === blueprint);
  if (!machine) throw new Error(`missing ${blueprint}`);
  return machine;
}

describe("bottleneck assistant (spec 10.5)", () => {
  it("measures exactly one tick per machine and per route", () => {
    const state = chain();
    for (const m of state.machines) {
      expect(Number.isSafeInteger(m.ageTicks), m.blueprint).toBe(true);
      expect(m.ageTicks).toBe(1200); // built after the 262-tick boot, then run
      expect(m.busyTicks + m.starvedTicks + m.fullTicks).toBeLessThanOrEqual(m.ageTicks);
    }
    for (const r of state.routes) expect(r.ageTicks).toBe(1200);
  });

  it("reports whole percentages inside 0..100 with plain-language advice", () => {
    const state = chain();
    for (const m of state.machines) {
      const d = diagnoseMachine(state, m);
      for (const value of [d.busyPercent, d.starvedPercent, d.fullPercent, d.powerPercent]) {
        expect(Number.isInteger(value), `${m.blueprint} ${value}`).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      if (d.linkPercent !== null) {
        expect(Number.isInteger(d.linkPercent)).toBe(true);
        expect(d.linkPercent).toBeLessThanOrEqual(100);
      }
      expect(d.evidence).not.toContain("NaN");
      expect(d.advice.length).toBeGreaterThan(0);
      expect(d.advice).not.toContain("NaN");
    }
  });

  it("names the busy link beside a supply-limited machine", () => {
    const state = chain();
    const d = diagnoseMachine(state, only(state, "wireMill"));
    // The mill cannot start a batch on most ticks: copper arrives one unit at a time.
    expect(d.starvedPercent).toBeGreaterThanOrEqual(20);
    expect(d.linkPercent).not.toBeNull();
  });

  it("offers a non-purchase action when the dock is the limiter", () => {
    const state = chain();
    const d = diagnoseMachine(state, only(state, "polymerRecycler"));
    expect(d.advice).toContain("no purchase needed");
  });

  it("explains an unlinked machine as a missing connection", () => {
    const state = createInitialState();
    state.tutorial = 9;
    seed(state, { scrap: 300, ferrous: 40 });
    send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
    advance(state, 200);
    const d = diagnoseMachine(state, only(state, "sorter"));
    expect(d.starvedPercent).toBeGreaterThanOrEqual(90);
    expect(d.advice).toContain("Connect");
    expect(d.advice).toContain("scrap");
  });

  it("says the storage needs clearing rather than a purchase when it is full", () => {
    const state = chain();
    state.storeUnits = state.storeCapacity - 1;
    const d = diagnoseMachine(state, only(state, "sorter"));
    expect(d.advice).toMatch(/^Storage is full at 100%/);
    expect(d.advice).toContain("Sell a surplus");
  });

  it("reports the shared power budget as the limiter when machines oversubscribe", () => {
    const state = createInitialState();
    state.tutorial = 9;
    seed(state, { scrap: 400, ferrous: 40, nonferrous: 40, residue: 30 });
    // 6×1 + 2 + 2 + 1 = 11 requested units against a capacity of 8.
    const plan: [string, ResourceId][] = [
      ["sorter", "scrap"],
      ["sorter", "scrap"],
      ["sorter", "scrap"],
      ["sorter", "scrap"],
      ["sorter", "scrap"],
      ["sorter", "scrap"],
      ["copperSeparator", "nonferrous"],
      ["furnace", "ferrous"],
      ["polymerRecycler", "residue"],
    ];
    plan.forEach(([blueprint, input], index) => {
      send(state, { type: "machine.build", blueprint, tile: index });
      const machine = state.machines[state.machines.length - 1];
      send(state, { type: "route.connect", from: 0, to: machine.id, filter: input });
      send(state, { type: "route.connect", from: machine.id, to: 0, filter: null });
    });
    // The ratio is an instantaneous measure, so watch a window of ticks.
    let worst = 1;
    let advice = "";
    let peakRequested = 0;
    for (let i = 0; i < 400; i += 1) {
      advance(state, 1);
      const requested = state.machines.reduce(
        (total, m) => (m.progress > 0 ? total + m.batchPower : total),
        0
      );
      if (requested > peakRequested) peakRequested = requested;
      if (state.powerRatio < worst) {
        worst = state.powerRatio;
        const running = state.machines.filter((m) => m.progress > 0);
        advice = running.length > 0 ? diagnoseMachine(state, running[0]).advice : "";
      }
    }
    console.log(`power window: peak requested ${peakRequested}, worst ratio ${worst}`);
    expect(peakRequested).toBeGreaterThan(TUNING.yardPowerCapacity);
    expect(worst).toBeLessThan(0.999);
    expect(advice).toContain("Power limited");
    expect(advice).toContain("% speed");
  });

  it("agrees between tick-by-tick advance and event-jump advance (spec 21.4)", () => {
    const ticking = chainBase();
    const jumping = chainBase();
    advance(ticking, 1200);
    advanceTo(jumping, jumping.tick + 1200);
    expect(jumping.tick).toBe(ticking.tick);
    expect(JSON.stringify(jumping.machines)).toBe(JSON.stringify(ticking.machines));
    expect(JSON.stringify(jumping.routes)).toBe(JSON.stringify(ticking.routes));
    expect(JSON.stringify(jumping.store)).toBe(JSON.stringify(ticking.store));
  });

  it("counts a jumped idle window as measured age and waiting time", () => {
    const ticking = unlinked();
    const jumping = unlinked();
    const start = ticking.tick;
    advance(ticking, 900);
    advanceTo(jumping, start + 900);
    expect(jumping.tick).toBe(ticking.tick);
    expect(JSON.stringify(jumping.machines)).toBe(JSON.stringify(ticking.machines));
    const machine = only(jumping, "sorter");
    // The jump path must still measure: 900 observed ticks, all waiting.
    expect(machine.ageTicks).toBe(900);
    expect(machine.starvedTicks).toBe(900);
    expect(machine.busyTicks).toBe(0);
    expect(diagnoseMachine(jumping, machine).starvedPercent).toBe(100);
  });

  it("summarises the yard in measured lines only", () => {
    const state = chain();
    const lines = yardSummary(state);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines[0]).toMatch(/^Storage \d+% full \(\d+\/\d+\)$/);
    expect(lines[1]).toMatch(/^Power \d+% speed \(\d+ of \d+ units requested\)$/);
    for (const line of lines) {
      expect(line).not.toContain("NaN");
      expect(line.length).toBeLessThan(96);
    }
  });

  it("loads a legacy save without counters and still reports usable numbers", () => {
    const state = chain();
    const plain = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    for (const machine of plain["machines"] as Record<string, unknown>[]) {
      delete machine["ageTicks"];
      delete machine["busyTicks"];
      delete machine["fullTicks"];
    }
    for (const route of plain["routes"] as Record<string, unknown>[]) {
      delete route["ageTicks"];
      delete route["busyTicks"];
    }
    const payload = {
      sim: plain,
      lastSeenMs: 0,
      settings: { muted: true, reducedMotion: false, textScale: 1 },
    } as unknown as SavePayload;
    const migrated = migrate(payload);
    const machine = migrated.sim.machines[0];
    expect(machine.ageTicks).toBe(0);
    expect(machine.busyTicks).toBe(0);
    expect(machine.starvedTicks).toBeGreaterThan(0);
    const d = diagnoseMachine(migrated.sim, machine);
    expect(d.busyPercent).toBe(0);
    expect(d.starvedPercent).toBeLessThanOrEqual(100);
    expect(d.evidence).not.toContain("NaN");
    expect(d.advice.length).toBeGreaterThan(0);
  });
});
