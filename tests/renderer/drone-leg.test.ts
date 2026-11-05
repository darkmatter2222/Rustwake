import { describe, expect, it } from "vitest";
import { TUNING } from "../../src/game/content/defs";
import { droneLeg } from "../../src/game/renderer/scene";
import type { DroneState } from "../../src/game/simulation/types";

/**
 * DEF-004: the drawn leg parameter must keep moving when the recorded anchor is stale.
 * The simulation re-bases its own anchors (`engine.ts`), but the painter reads the stored
 * `nextDeliveryTick` / `inFlight.arrive`, so a returning player used to see a parked unit.
 */
const TRAVEL = TUNING.droneTravelTicks; // 10
const CYCLE = TUNING.droneDeliveryTicks - TRAVEL; // 40

const unit = (patch: Partial<DroneState>): DroneState =>
  ({
    repaired: true,
    deliveries: 5,
    nextDeliveryTick: 394,
    inFlight: null,
    ...patch,
  }) as unknown as DroneState;

describe("DEF-004 droneLeg idle fallback", () => {
  const phases = [0, 1 / 6, 1 / 3];

  it("a fresh anchor keeps the accepted linear empty-leg values", () => {
    // lastArrive = 394 - 40 = 354, so the leg runs over ticks 355 .. 394.
    const fresh = unit({ nextDeliveryTick: 394 });
    const values = phases.map((p) => droneLeg(fresh, 356, p));
    expect(values.map((v) => +v.toFixed(4))).toEqual([
      +(1 - (356 - 355) / CYCLE).toFixed(4),
      +(1 - (356 + 1 / 6 - 355) / CYCLE).toFixed(4),
      +(1 - (356 + 1 / 3 - 355) / CYCLE).toFixed(4),
    ]);
    expect(new Set(values).size).toBe(3);
  });

  it("a stale anchor still produces at least three distinct parameters across one tick", () => {
    // The same unit, six days of ticks later: the old clamp held one value for every phase.
    const stale = unit({ nextDeliveryTick: 394 });
    const values = phases.map((p) => droneLeg(stale, 432344, p));
    values.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
    expect(new Set(values.map((v) => +v.toFixed(4))).size).toBe(3);
    // Orientation-free step: each phase advances the parameter by exactly one frame's worth of
    // the leg, whether the fold is on the outward or the return half (DEF-004, g2 row).
    expect(Math.abs(values[1] - values[0])).toBeCloseTo(1 / 6 / CYCLE, 6);
    expect(Math.abs(values[2] - values[1])).toBeCloseTo(1 / 6 / CYCLE, 6);
  });

  it("a unit that never launched still holds the dock end", () => {
    const never = unit({ deliveries: 0, nextDeliveryTick: 0 });
    phases.forEach((p) => expect(droneLeg(never, 432344, p)).toBe(0));
  });

  it("the loaded leg is unchanged by the fallback", () => {
    const loaded = unit({ inFlight: { arrive: 354, qty: 3 } });
    expect(+droneLeg(loaded, 345, 0).toFixed(4)).toBe(0);
    expect(+droneLeg(loaded, 349, 0).toFixed(4)).toBeCloseTo(0.4, 4);
    expect(droneLeg(loaded, 355, 0)).toBe(1);
  });

  it("g4/DEF-005: the eased wrap keeps every step a small multiple of the steady step", () => {
    // Steady state: the loaded leg covers 1 unit in `travel` ticks (0.1 per tick, 0.016667 per
    // frame at six frames per tick); the empty leg covers it in `cycle` ticks (0.025 per tick).
    const step = (values: number[]): number =>
      values.reduce((max, v, i) => (i === 0 ? max : Math.max(max, Math.abs(v - values[i - 1]))), 0);
    const walk = (state: DroneState, start: number, ticks: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i < ticks; i += 1) for (let f = 0; f < 6; f += 1) out.push(droneLeg(state, start + i, f / 6));
      return out;
    };
    const staleLoaded = unit({ inFlight: { arrive: 354, qty: 5 } });
    const staleIdle = unit({ nextDeliveryTick: 394 });
    // Still at least three distinct parameters over one tick on the stale loaded leg.
    expect(new Set(phases.map((p) => +droneLeg(staleLoaded, 432344, p).toFixed(4))).size).toBe(3);
    // Walk longer than each wrap's own period (loaded 2*travel+2 = 22, idle 2*cycle = 80) so
    // both ends of the leg are sampled.
    const loaded = walk(staleLoaded, 432344, 2 * TRAVEL + 3);
    const idle = walk(staleIdle, 432344, 2 * CYCLE + 1);
    const loadedMax = step(loaded);
    const idleMax = step(idle);
    console.log(`DEF-005 max per-frame delta loaded=${loadedMax.toFixed(6)} idle=${idleMax.toFixed(6)}`);
    // Asserted bound: three times the steady per-frame step of each leg.
    expect(loadedMax).toBeLessThanOrEqual(3 * (1 / 6 / TRAVEL) + 1e-9);
    expect(idleMax).toBeLessThanOrEqual(3 * (1 / 6 / CYCLE) + 1e-9);
    // And the wrap still covers both ends of the leg within one period (the walk starts
    // mid-leg, so the ends are approached to within a frame rather than hit exactly).
    expect(Math.max(...loaded)).toBeGreaterThan(0.95);
    expect(Math.min(...loaded)).toBeLessThan(0.05);
    expect(Math.max(...idle)).toBeGreaterThan(0.95);
    expect(Math.min(...idle)).toBeLessThan(0.05);
  });
});
