/**
 * RW3D T23 (#150): the layered machine activity model.
 *
 * Pure-model invariants, all reproducible from the fixed seed set below:
 *  - independent per-machine timing (no synchronized yard reset),
 *  - truthful status gating (only a running machine moves),
 *  - reduced motion = static discrete stages, information retained,
 *  - bounded vent pool, no per-tick allocation, no state mutation.
 *
 * Expected/actual are printed by the assertions themselves; the sweep window is
 * 600 ticks = 60 s at TICK_MS = 100, the V04 clip length.
 */
import { describe, expect, it } from "vitest";
import {
  FAN_PERIOD_TICKS,
  FAN_STEPS,
  MAX_VENT_PUFFS,
  PULSE_PERIOD_TICKS,
  ROLLER_STEPS,
  VENT_MAX_TICKS,
  VENT_MIN_TICKS,
  machineActivity,
  machineSeed,
  ventPeriodTicks,
} from "../../src/game/renderer/motion";
import type { MachineState, MachineStatus } from "../../src/game/simulation/types";

const SWEEP_TICKS = 600; // 60 s at 100 ms/tick
const IDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Minimal truthful machine fixture; only the fields the model reads matter. */
function machine(id: number, status: MachineStatus, progress = 300, batchMilli = 600): MachineState {
  return {
    id,
    blueprint: "sorter",
    tile: id,
    status,
    progress,
    batchMilli,
    batchesDone: 4,
    level: 1,
  } as unknown as MachineState;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("T23 machineSeed: stable entity variation", () => {
  it("is deterministic, inside [0,1), and distinct across the yard's ids", () => {
    const seeds = IDS.map((id) => machineSeed(id));
    for (const seed of seeds) {
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(1);
    }
    expect(new Set(seeds).size).toBe(IDS.length);
    for (const id of IDS) expect(machineSeed(id)).toBe(machineSeed(id));
    // Adjacent ids must not land on adjacent phases (the mix, not id % n).
    expect(Math.abs(machineSeed(1) - machineSeed(2))).toBeGreaterThan(0.01);
  });

  it("vent periods stay inside the documented 11-19 s band per entity", () => {
    for (const id of IDS) {
      const period = ventPeriodTicks(id);
      expect(period).toBeGreaterThanOrEqual(VENT_MIN_TICKS);
      expect(period).toBeLessThanOrEqual(VENT_MAX_TICKS);
      expect(period).toBe(ventPeriodTicks(id));
    }
    // The yard is not one shared vent clock: at least two distinct periods.
    expect(new Set(IDS.map(ventPeriodTicks)).size).toBeGreaterThanOrEqual(2);
  });
});

describe("T23 independent timing: no synchronized yard reset (V04)", () => {
  it("eight running machines never pulse in unison across the 60 s sweep", () => {
    const machines = IDS.map((id) => machine(id, "running"));
    let allEqual = 0;
    for (let tick = 0; tick < SWEEP_TICKS; tick += 1) {
      const pulses = machines.map((m) => machineActivity(m, tick, 0, false).pulse);
      if (pulses.every((p) => p === pulses[0])) allEqual += 1;
    }
    // With eight seeded 17-tick cycles a unanimous frame is a rare coincidence,
    // never the rule. The old shared floor(phase*6) was unanimous on EVERY frame.
    expect(allEqual / SWEEP_TICKS).toBeLessThan(0.15);
  });

  it("fan channels keep at least three distinct blade positions every tick", () => {
    const machines = IDS.map((id) => machine(id, "running"));
    for (let tick = 0; tick < SWEEP_TICKS; tick += 1) {
      const steps = new Set(machines.map((m) => machineActivity(m, tick, 0, false).fanStep));
      expect(steps.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("each fan is periodic at 1.7 s and drifts independently of its neighbours", () => {
    const a = machine(1, "running");
    const b = machine(2, "running");
    for (let tick = 0; tick < 120; tick += 1) {
      const now = machineActivity(a, tick, 0, false).fanStep;
      const later = machineActivity(a, tick + FAN_PERIOD_TICKS, 0, false).fanStep;
      expect(later).toBe(now); // the entity's own period
    }
    // Independence: the pair of blade positions visits many combinations and is not
    // locked step-for-step. A shared clock (the old defect) paints (k, k) forever;
    // seeded channels disagree on most ticks and cycle through their own phases.
    const pairs = new Set<string>();
    let disagree = 0;
    for (let tick = 0; tick < SWEEP_TICKS; tick += 1) {
      const sa = machineActivity(a, tick, 0, false).fanStep;
      const sb = machineActivity(b, tick, 0, false).fanStep;
      pairs.add(`${sa},${sb}`);
      if (sa !== sb) disagree += 1;
    }
    expect(pairs.size).toBeGreaterThanOrEqual(8);
    expect(disagree / SWEEP_TICKS).toBeGreaterThan(0.5);
  });

  it("the sub-tick phase advances channels smoothly inside one tick", () => {
    const m = machine(1, "running");
    const start = machineActivity(m, 10, 0, false);
    const end = machineActivity(m, 11, 0, false);
    const mid = machineActivity(m, 10, 0.999, false);
    // Phase 0.999 of tick 10 is the same instant as tick 11 phase 0 minus epsilon:
    // the fan may step, but never jumps backwards across the boundary.
    expect(mid.fanStep).toBeGreaterThanOrEqual(0);
    expect(mid.fanStep).toBeLessThan(FAN_STEPS);
    expect([start.fanStep, end.fanStep]).toContain(mid.fanStep);
  });
});

describe("T23 truthful states: motion only where the simulation works", () => {
  const quiet: MachineStatus[] = ["starved", "outputFull", "powerLimited", "paused", "idle"];

  it.each(quiet)("a %s machine holds its fan, vents nothing and rolls nothing", (status) => {
    const m = machine(3, status);
    const base = machineActivity(m, 0, 0, false);
    for (let tick = 0; tick < SWEEP_TICKS; tick += 7) {
      const act = machineActivity(m, tick, 0.5, false);
      expect(act.active).toBe(false);
      expect(act.fanStep).toBe(base.fanStep); // held seed angle, not a spin
      expect(act.ventPuffs.length).toBe(0);
      expect(act.rollerStep).toBe(0);
      expect(act.sweep).toBe(false);
    }
  });

  it("a running machine with a live batch drives rollers and the once-per-batch sweep", () => {
    const early = machineActivity(machine(1, "running", 100, 600), 5, 0, false);
    expect(early.rollerStep).toBe(0);
    expect(early.sweep).toBe(true); // first quarter of the batch
    const mid = machineActivity(machine(1, "running", 300, 600), 5, 0, false);
    expect(mid.rollerStep).toBe(2);
    expect(mid.sweep).toBe(false);
    const late = machineActivity(machine(1, "running", 590, 600), 5, 0, false);
    expect(late.rollerStep).toBe(ROLLER_STEPS - 1);
    // No batch, no roller motion - even while running.
    const idleBatch = machineActivity(machine(1, "running", 0, 600), 5, 0, false);
    expect(idleBatch.rollerStep).toBe(0);
    expect(idleBatch.sweep).toBe(false);
  });

  it("the model never mutates its inputs (frozen state survives the sweep)", () => {
    const m = deepFreeze(machine(2, "running"));
    for (let tick = 0; tick < SWEEP_TICKS; tick += 11) {
      expect(() => machineActivity(m, tick, 0.25, false)).not.toThrow();
      expect(() => machineActivity(m, tick, 0.25, true)).not.toThrow();
    }
    expect(m.progress).toBe(300);
    expect(m.status).toBe("running");
  });
});

describe("T23 reduced motion: static discrete stages, information retained (U07)", () => {
  it("freezes every channel across the sweep but keeps the stages readable", () => {
    const m = machine(4, "running", 300, 600);
    const base = machineActivity(m, 0, 0, true);
    expect(base.pulse).toBe(false);
    expect(base.ventPuffs.length).toBe(0);
    expect(base.rollerStep).toBe(2); // the batch position is still printed
    for (let tick = 0; tick < SWEEP_TICKS; tick += 13) {
      const act = machineActivity(m, tick, 0.7, true);
      expect(act.fanStep).toBe(base.fanStep);
      expect(act.ventStage).toBeGreaterThanOrEqual(0);
      expect(act.ventStage).toBeLessThanOrEqual(3);
      expect(act.ventPuffs.length).toBe(0);
      expect(act.pulse).toBe(false);
      expect(act.rollerStep).toBe(2);
    }
  });

  it("a reduced-motion starved machine is as quiet as a full-motion one", () => {
    const m = machine(5, "starved");
    const full = machineActivity(m, 42, 0.3, false);
    const reduced = machineActivity(m, 42, 0.3, true);
    expect(reduced.fanStep).toBe(full.fanStep);
    expect(reduced.ventPuffs.length).toBe(0);
    expect(reduced.rollerStep).toBe(0);
  });
});

describe("T23 bounded pools and determinism", () => {
  it("the vent pool never exceeds MAX_VENT_PUFFS slots across the sweep", () => {
    for (const id of IDS) {
      const m = machine(id, "running");
      let sawPuff = false;
      for (let tick = 0; tick < SWEEP_TICKS; tick += 1) {
        const act = machineActivity(m, tick, 0, false);
        expect(act.ventPuffs.length).toBeLessThanOrEqual(MAX_VENT_PUFFS);
        for (const puff of act.ventPuffs) {
          expect(puff.stage).toBeGreaterThanOrEqual(1);
          expect(puff.stage).toBeLessThanOrEqual(3);
          expect([-1, 1]).toContain(puff.slot);
        }
        if (act.ventPuffs.length > 0) sawPuff = true;
      }
      expect(sawPuff).toBe(true); // the vent really does breathe in 60 s
    }
  });

  it("is deterministic: identical inputs give byte-identical activity", () => {
    const m = machine(7, "running", 250, 600);
    for (const tick of [0, 17, 110, 344, 599]) {
      const a = JSON.stringify(machineActivity(m, tick, 0.4, false));
      const b = JSON.stringify(machineActivity(m, tick, 0.4, false));
      expect(a).toBe(b);
    }
  });

  it("pulse and fan periods are the documented independent channels", () => {
    expect(FAN_PERIOD_TICKS).toBe(17); // 1.7 s
    expect(PULSE_PERIOD_TICKS).toBe(17);
    expect(VENT_MIN_TICKS).toBe(110); // 11 s
    expect(VENT_MAX_TICKS).toBe(190); // 19 s
    expect(MAX_VENT_PUFFS).toBe(2);
  });
});