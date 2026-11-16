import { describe, expect, it } from "vitest";
import { capacityText, hudNumber } from "../../src/ui/hud/format";
import {
  powerCue,
  productionCue,
  storagePressure,
} from "../../src/ui/hud/pressure";
import { createInitialState } from "../../src/game/simulation/types";

/**
 * UI-RESET-51: the value ladder and the pressure derivations, exercised at their
 * boundaries. These are pure reads of the authoritative state - no DOM, no colors.
 */

describe("hudNumber: zero, large, precision and overflow", () => {
  it("reads non-finite and negative inputs as zero and floors fractions", () => {
    expect(hudNumber(Number.NaN)).toBe("0");
    expect(hudNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(hudNumber(Number.NEGATIVE_INFINITY)).toBe("0");
    expect(hudNumber(-5)).toBe("0");
    expect(hudNumber(0)).toBe("0");
    expect(hudNumber(3.7)).toBe("3");
    expect(hudNumber(9999.9)).toBe("9999");
  });

  it("prints small quantities verbatim", () => {
    expect(hudNumber(1)).toBe("1");
    expect(hudNumber(900)).toBe("900");
    expect(hudNumber(9999)).toBe("9999");
  });

  it("keeps the K tier within six characters across the precision switch", () => {
    expect(hudNumber(10_000)).toBe("10.00K");
    expect(hudNumber(99_994)).toBe("99.99K");
    // 99.995K would round to 100.00K (7 chars); the ladder drops to one decimal.
    expect(hudNumber(99_995)).toBe("100.0K");
    expect(hudNumber(100_000)).toBe("100.0K");
    expect(hudNumber(999_949)).toBe("999.9K");
  });

  it("rolls K -> M -> B -> T at the rounding boundary, never printing 1000.0", () => {
    expect(hudNumber(999_950)).toBe("1.00M");
    expect(hudNumber(999_999)).toBe("1.00M");
    expect(hudNumber(1_000_000)).toBe("1.00M");
    expect(hudNumber(1_234_567)).toBe("1.23M");
    expect(hudNumber(99_994_999)).toBe("99.99M");
    expect(hudNumber(99_995_000)).toBe("100.0M");
    expect(hudNumber(123_456_789)).toBe("123.5M");
    expect(hudNumber(999_949_999)).toBe("999.9M");
    expect(hudNumber(999_950_000)).toBe("1.00B");
    expect(hudNumber(1_000_000_000)).toBe("1.00B");
    expect(hudNumber(1_234_567_890)).toBe("1.23B");
    expect(hudNumber(999_950_000_000)).toBe("1.00T");
    expect(hudNumber(1_000_000_000_000)).toBe("1.00T");
  });

  it("caps overflow at an explicit sentinel instead of growing without bound", () => {
    expect(hudNumber(999_950_000_000_000)).toBe("999.9T+");
    expect(hudNumber(Number.MAX_SAFE_INTEGER)).toBe("999.9T+");
  });

  it("never prints more than six characters below the overflow sentinel", () => {
    const samples = [
      0, 1, 9, 10, 99, 100, 999, 1000, 9999, 10_000, 99_994, 99_995, 100_000,
      999_949, 999_950, 999_999, 1e6, 1_234_567, 99_995_000, 123_456_789,
      999_949_999, 999_950_000, 1e9, 1_234_567_890, 999_950_000_000, 1e12,
      999_949_999_999,
    ];
    for (const n of samples) {
      expect(hudNumber(n).length, `hudNumber(${n})`).toBeLessThanOrEqual(6);
    }
  });

  it("formats a capacity readout with both sides on the same ladder", () => {
    expect(capacityText(0, 900)).toBe("0/900");
    expect(capacityText(900, 900)).toBe("900/900");
    expect(capacityText(450, 900)).toBe("450/900");
  });
});

describe("storagePressure tiers", () => {
  it("is ok on a fresh yard and never divides by a zero capacity", () => {
    const state = createInitialState();
    state.storeCapacity = 0;
    state.storeUnits = 0;
    const p = storagePressure(state);
    expect(p.tier).toBe("ok");
    expect(p.percent).toBe(0);
  });

  it("is high at ninety percent and full at capacity", () => {
    const state = createInitialState();
    state.storeCapacity = 900;
    state.storeUnits = 809; // 89.9% -> rounds to 90
    expect(storagePressure(state).tier).toBe("high");
    state.storeUnits = 810;
    expect(storagePressure(state).tier).toBe("high");
    state.storeUnits = 900;
    const full = storagePressure(state);
    expect(full.tier).toBe("full");
    expect(full.percent).toBe(100);
  });

  it("is high whenever anything is held outside the store, even below ninety percent", () => {
    const state = createInitialState();
    state.storeCapacity = 900;
    state.storeUnits = 100;
    state.overflow = [{ resource: "scrap", qty: 40 }];
    const p = storagePressure(state);
    expect(p.tier).toBe("high");
    expect(p.overflowUnits).toBe(40);
  });
});

describe("power and production cues", () => {
  it("shows no power cue on a comfortably powered yard with no limited machines", () => {
    const state = createInitialState();
    state.powerRatio = 1;
    expect(powerCue(state)).toBeNull();
  });

  it("reports the whole-percent draw and the count of limited machines", () => {
    const state = createInitialState();
    state.powerRatio = 0.5;
    expect(powerCue(state)).toEqual({ percent: 50, limited: 0 });
  });

  it("shows no production cue when every machine is healthy", () => {
    const state = createInitialState();
    expect(productionCue(state)).toBeNull();
  });
});