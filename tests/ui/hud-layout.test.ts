import { describe, expect, it } from "vitest";
import { createInitialState } from "../../src/game/simulation/types";
import { hudChipLimit, visibleResources } from "../../src/ui/text";

// Spec 5.4 pins a small number of chips: four on a portrait phone and seven on a wide
// screen, counting the pinned resources plus the credits and Store status chips. The
// measured reason is docs/evidence/2026-11-03-hud-share.md: a fifth chip is what forces
// a third row and pushes the resting HUD past the 22 % band at 360 × 640.
describe("HUD resource chips (spec 5.4)", () => {
  it("budgets four chips on a portrait phone and seven on a wide screen", () => {
    expect(hudChipLimit(360, 1)).toBe(4);
    expect(hudChipLimit(412, 1)).toBe(4);
    expect(hudChipLimit(420, 1)).toBe(4);
    expect(hudChipLimit(421, 1)).toBe(7);
    expect(hudChipLimit(844, 1)).toBe(7);
    expect(hudChipLimit(1440, 1)).toBe(7);
  });

  it("drops one chip at a large text scale (spec 6.4)", () => {
    expect(hudChipLimit(360, 1.5)).toBe(3);
    expect(hudChipLimit(360, 2)).toBe(3);
    expect(hudChipLimit(1440, 1.5)).toBe(6);
    expect(hudChipLimit(1440, 1.25)).toBe(7);
  });

  it("caps the pinned list in sell order and always leads with scrap", () => {
    const state = createInitialState();
    state.store = {
      scrap: 120,
      ferrous: 40,
      nonferrous: 30,
      residue: 12,
      steel: 8,
      copper: 6,
      polymer: 4,
      wire: 3,
    };
    expect(visibleResources(state, 3)).toEqual(["scrap", "ferrous", "nonferrous"]);
    expect(visibleResources(state, 5)).toEqual([
      "scrap",
      "ferrous",
      "nonferrous",
      "residue",
      "steel",
    ]);
    expect(visibleResources(state, 3).length).toBeLessThanOrEqual(3);
    // What each layout actually spends once the status chips pay for themselves.
    expect(visibleResources(state, hudChipLimit(360) - 2)).toEqual(["scrap", "ferrous"]);
    expect(visibleResources(state, hudChipLimit(1440) - 2).length).toBe(5);
  });

  it("skips empty stocks and never invents a chip", () => {
    const stocked = createInitialState();
    stocked.store = { scrap: 20, steel: 5 };
    expect(visibleResources(stocked, 5)).toEqual(["scrap", "steel"]);
    expect(visibleResources(createInitialState(), 3)).toEqual(["scrap"]);
  });
});
