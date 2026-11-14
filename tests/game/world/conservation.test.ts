/**
 * Acceptance E01 (issue #133): every physical quantity lives in exactly one
 * container. Closed-system law, per resource:
 *   stock + reserved + committed = initial stock
 * and the separate currency ledger:
 *   credits + reservedCredits + committedCredits = initial credits.
 * Checked after EVERY transition of a scripted and a seeded-random workload,
 * including rejections (which must not move any container).
 */
import { describe, expect, it } from "vitest";
import {
  WORLD_ASSET_IDS,
  advanceWorld,
  advanceWorldTo,
  applyWorldCommand,
  createRng,
  randInt,
  validatePlacement,
  worldFingerprint,
  type WorldState,
} from "../../../src/game/world";
import {
  expectConserved,
  expectCreditsConserved,
  expectOk,
  findLegalCell,
  newWorld,
  place,
} from "./helpers";

const INITIAL_STOCK = { scrap: 120, ferrous: 12, steel: 12 };
const INITIAL_CREDITS = 60;

function check(w: WorldState, label: string): void {
  try {
    expectConserved(w, INITIAL_STOCK);
    expectCreditsConserved(w, INITIAL_CREDITS);
  } catch (err) {
    throw new Error(`${label}: ${(err as Error).message}`);
  }
}

describe("E01: scripted lifecycle conserves every container", () => {
  it("place -> work -> cancel(90%) -> place -> complete -> expand", () => {
    const w = newWorld();
    check(w, "initial");

    const c1 = findLegalCell(w, "warehouse");
    expectOk(place(w, "a1", "warehouse", c1.x, c1.y));
    check(w, "after warehouse reservation");

    advanceWorld(w, 20);
    check(w, "mid construction");

    expectOk(applyWorldCommand(w, { id: "a2", type: "world.cancel", siteId: 1 }));
    check(w, "after 90% cancel");

    const c2 = findLegalCell(w, "depot");
    expectOk(place(w, "a3", "depot", c2.x, c2.y));
    check(w, "after depot reservation");

    advanceWorldTo(w, w.tick + 50);
    check(w, "after depot completion");
    expect(w.buildings.length).toBe(1);

    w.milestoneTokens = 1;
    expectOk(applyWorldCommand(w, { id: "a4", type: "world.expand", parcelId: 2 }));
    check(w, "after expansion purchase");

    const c3 = findLegalCell(w, "furnace");
    expectOk(place(w, "a5", "furnace", c3.x, c3.y));
    check(w, "after furnace reservation");
    // Site ids are never reused: the furnace is site 3 (warehouse 1, depot 2).
    const furnaceSiteId = w.sites[0].id;
    expectOk(applyWorldCommand(w, { id: "a6", type: "world.cancel", siteId: furnaceSiteId }));
    check(w, "after 100% cancel");

    // Rejections move nothing.
    const fp = worldFingerprint(w);
    applyWorldCommand(w, { id: "a7", type: "world.cancel", siteId: 999 });
    applyWorldCommand(w, { id: "a8", type: "world.place", asset: "ghost", cell: { x: 0, y: 0 }, rotation: 0 });
    expect(worldFingerprint(w)).toBe(fp);
    check(w, "after rejections");
  });
});

describe("E01: seeded-random workload conserves after every transition", () => {
  it("200 random commands + tick spans across 5 seeds", () => {
    for (const seed of [11, 22, 33, 44, 55]) {
      const w = newWorld(seed);
      const rng = createRng(seed * 7919);
      let cmdNo = 0;
      let granted = false;
      for (let step = 0; step < 200; step += 1) {
        cmdNo += 1;
        const id = `r${seed}-${cmdNo}`;
        const roll = randInt(rng, 10);
        if (roll < 5) {
          // Random placement attempt (most will reject; all must be atomic).
          const asset = WORLD_ASSET_IDS[randInt(rng, WORLD_ASSET_IDS.length)];
          const cell = { x: randInt(rng, 24), y: randInt(rng, 24) };
          const rotation = [0, 90, 180, 270][randInt(rng, 4)];
          const fp = worldFingerprint(w);
          const legal = validatePlacement(w, asset, cell, rotation) === null;
          const result = applyWorldCommand(w, { id, type: "world.place", asset, cell, rotation });
          if (legal) {
            expectOk(result);
          } else if (!result.ok) {
            expect(worldFingerprint(w), `atomic rejection at step ${step} seed ${seed}`).toBe(fp);
          }
        } else if (roll < 7) {
          // Cancel a random live site, if any.
          if (w.sites.length > 0) {
            const site = w.sites[randInt(rng, w.sites.length)];
            const result = applyWorldCommand(w, { id, type: "world.cancel", siteId: site.id });
            expectOk(result);
          }
        } else if (roll < 8) {
          // Occasionally grant a milestone and try an expansion.
          if (!granted && randInt(rng, 4) === 0) {
            w.milestoneTokens += 1;
            granted = true;
          }
          const parcelId = 1 + randInt(rng, 16);
          applyWorldCommand(w, { id, type: "world.expand", parcelId });
        } else {
          // Advance time, mixing tick-by-tick and jumps.
          const span = 1 + randInt(rng, 60);
          if (randInt(rng, 2) === 0) advanceWorld(w, span);
          else advanceWorldTo(w, w.tick + span);
        }
        check(w, `seed ${seed} step ${step}`);
      }
      // Final invariant: no reservation without a site, no site without one.
      expect(w.reservations.length).toBe(w.sites.length);
      for (const site of w.sites) {
        expect(w.reservations.some((r) => r.id === site.reservationId)).toBe(true);
      }
      for (const r of w.reservations) {
        expect(w.sites.some((s) => s.id === r.siteId)).toBe(true);
      }
    }
  });

  it("every integer container stays integer through the workload", () => {
    const w = newWorld(1234);
    const rng = createRng(99);
    for (let i = 0; i < 60; i += 1) {
      const asset = WORLD_ASSET_IDS[randInt(rng, WORLD_ASSET_IDS.length)];
      try {
        const c = findLegalCell(w, asset);
        place(w, `int-${i}`, asset, c.x, c.y);
      } catch {
        // No legal cell for this asset right now; skip.
      }
      advanceWorld(w, 1 + randInt(rng, 30));
      for (const qty of Object.values(w.stock)) expect(Number.isInteger(qty)).toBe(true);
      for (const qty of Object.values(w.committed)) expect(Number.isInteger(qty)).toBe(true);
      for (const r of w.reservations) {
        for (const item of r.items) expect(Number.isInteger(item.qty)).toBe(true);
      }
      expect(Number.isInteger(w.credits)).toBe(true);
      expect(Number.isInteger(w.committedCredits)).toBe(true);
      check(w, `integer workload step ${i}`);
    }
  });
});