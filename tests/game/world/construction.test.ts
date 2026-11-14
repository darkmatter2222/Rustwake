/**
 * Construction transactions (issue #133): reserve exactly once, settle
 * exactly once, cancel refunds 100%/90% (floor), reload settles once, and
 * tick-by-tick == event-jump advancement for every state.
 */
import { describe, expect, it } from "vitest";
import {
  P1_CONSTRUCTION_TICKS,
  WORLD_KIT,
  advanceWorld,
  advanceWorldTo,
  applyWorldCommand,
  completionTick,
  nextCompletionTick,
  siteProgressPct,
  stepWorldTick,
  worldFingerprint,
} from "../../../src/game/world";
import {
  cloneWorld,
  expectConserved,
  expectCreditsConserved,
  expectOk,
  expectReason,
  findLegalCell,
  newWorld,
  place,
  totals,
} from "./helpers";

const INITIAL_STOCK = { scrap: 120, ferrous: 12, steel: 12 };

describe("single reservation at placement", () => {
  it("deducts the full cost exactly once and occupies the footprint", () => {
    const w = newWorld();
    const c = findLegalCell(w, "warehouse");
    expectOk(place(w, "p1", "warehouse", c.x, c.y));
    expect(w.sites.length).toBe(1);
    expect(w.reservations.length).toBe(1);
    const site = w.sites[0];
    const res = w.reservations[0];
    expect(res.siteId).toBe(site.id);
    expect(res.items).toEqual(WORLD_KIT.warehouse.buildCost);
    expect(res.credits).toBe(20);
    expect(w.stock.scrap).toBe(120 - 30);
    expect(w.stock.steel).toBe(12 - 8);
    expect(w.credits).toBe(60 - 20);
    expect(w.buildings.length).toBe(0);
    expect(site.startTick).toBe(0);
    expect(site.durationTicks).toBe(P1_CONSTRUCTION_TICKS);
    expect(site.progressTicks).toBe(0);
    expectConserved(w, INITIAL_STOCK);
    expectCreditsConserved(w, 60);
  });

  it("P1 assembly duration is 5 simulated seconds = 50 ticks for every asset", () => {
    for (const asset of Object.values(WORLD_KIT)) {
      expect(asset.constructionTicks, asset.id).toBe(50);
    }
    expect(P1_CONSTRUCTION_TICKS).toBe(50);
  });
});

describe("completion settles exactly once", () => {
  it("moves reservation -> committed at startTick + 50, no second charge", () => {
    const w = newWorld();
    const c = findLegalCell(w, "depot");
    expectOk(place(w, "p1", "depot", c.x, c.y));
    const stockAfterPlace = { ...w.stock };
    const creditsAfterPlace = w.credits;

    advanceWorld(w, 49);
    expect(w.sites.length).toBe(1);
    expect(w.sites[0].progressTicks).toBe(49);
    expect(w.buildings.length).toBe(0);
    expect(w.stock).toEqual(stockAfterPlace); // nothing charged during work

    stepWorldTick(w);
    expect(w.tick).toBe(50);
    expect(w.sites.length).toBe(0);
    expect(w.reservations.length).toBe(0);
    expect(w.buildings.length).toBe(1);
    expect(w.buildings[0]).toMatchObject({ id: 1, asset: "depot", completedTick: 50 });
    expect(w.stock).toEqual(stockAfterPlace); // completion charges NOTHING
    expect(w.credits).toBe(creditsAfterPlace);
    expect(w.committed.scrap).toBe(45);
    expect(w.committed.steel).toBe(8);
    expect(w.committedCredits).toBe(30);
    expectConserved(w, INITIAL_STOCK);
    expectCreditsConserved(w, 60);

    // Further ticks never re-settle or re-charge.
    const fp = worldFingerprint(w);
    advanceWorld(w, 200);
    expect(w.buildings.length).toBe(1);
    expect(w.committed.scrap).toBe(45);
    expect(w.stock).toEqual(stockAfterPlace);
    expect(worldFingerprint(w)).not.toBe(fp); // tick advanced...
    const committedAgain = { ...w.committed };
    advanceWorld(w, 500);
    expect(w.committed).toEqual(committedAgain); // ...but ledger is stable
  });

  it("completionTick and nextCompletionTick agree with observed settling", () => {
    const w = newWorld();
    w.stock.steel = (w.stock.steel ?? 0) + 16; // fund two generators: 2 x 8 steel > seed steel 12
    const c1 = findLegalCell(w, "generator");
    expectOk(place(w, "a", "generator", c1.x, c1.y));
    advanceWorld(w, 10);
    const c2 = findLegalCell(w, "generator");
    expectOk(place(w, "b", "generator", c2.x, c2.y));
    expect(completionTick(w.sites[0])).toBe(50);
    expect(completionTick(w.sites[1])).toBe(60);
    expect(nextCompletionTick(w)).toBe(50);
    advanceWorldTo(w, 50);
    expect(w.buildings.length).toBe(1);
    expect(nextCompletionTick(w)).toBe(60);
    advanceWorldTo(w, 60);
    expect(w.buildings.length).toBe(2);
    expect(nextCompletionTick(w)).toBe(Infinity);
  });

  it("a reload mid-construction settles once (JSON round-trip seam)", () => {
    const w = newWorld();
    const c = findLegalCell(w, "furnace");
    expectOk(place(w, "p1", "furnace", c.x, c.y));
    advanceWorld(w, 30);
    const reloaded = cloneWorld(w); // the future save/load seam
    expect(reloaded.sites[0].progressTicks).toBe(30);
    advanceWorldTo(reloaded, 50);
    expect(reloaded.buildings.length).toBe(1);
    expect(reloaded.reservations.length).toBe(0);
    expect(reloaded.committed.scrap).toBe(10);
    expect(reloaded.committed.ferrous).toBe(5);
    // Advancing again after a second reload changes no ledger entry.
    const again = cloneWorld(reloaded);
    advanceWorldTo(again, 500);
    expect(again.buildings.length).toBe(1);
    expect(again.committed).toEqual(reloaded.committed);
    expect(again.stock).toEqual(reloaded.stock);
    expectConserved(again, INITIAL_STOCK);
  });
});

describe("cancellation refunds (GAME_SYSTEMS: 100% before work, 90% after)", () => {
  it("before any work: full refund, reservation released exactly once", () => {
    const w = newWorld();
    const c = findLegalCell(w, "warehouse");
    expectOk(place(w, "p1", "warehouse", c.x, c.y));
    expectOk(applyWorldCommand(w, { id: "c1", type: "world.cancel", siteId: 1 }));
    expect(w.sites.length).toBe(0);
    expect(w.reservations.length).toBe(0);
    expect(w.stock).toEqual(INITIAL_STOCK);
    expect(w.credits).toBe(60);
    expect(w.committed).toEqual({});
    expect(w.committedCredits).toBe(0);
    expectConserved(w, INITIAL_STOCK);
    expectCreditsConserved(w, 60);
    // Second cancel is a typed no-op.
    expectReason(applyWorldCommand(w, { id: "c2", type: "world.cancel", siteId: 1 }), "site-not-found");
  });

  it("after work began: 90% floor refund, remainder committed", () => {
    const w = newWorld();
    const c = findLegalCell(w, "depot");
    expectOk(place(w, "p1", "depot", c.x, c.y));
    advanceWorld(w, 1); // one tick of work -> 90% tier
    expectOk(applyWorldCommand(w, { id: "c1", type: "world.cancel", siteId: 1 }));
    // depot cost 45 scrap / 8 steel / 30 credits: floor(45*.9)=40, floor(8*.9)=7, floor(30*.9)=27
    expect(w.stock.scrap).toBe(120 - 45 + 40);
    expect(w.stock.steel).toBe(12 - 8 + 7);
    expect(w.credits).toBe(60 - 30 + 27);
    expect(w.committed.scrap).toBe(5);
    expect(w.committed.steel).toBe(1);
    expect(w.committedCredits).toBe(3);
    expect(w.reservations.length).toBe(0);
    expectConserved(w, INITIAL_STOCK);
    expectCreditsConserved(w, 60);
  });

  it("odd quantities floor per item (no fractional cargo)", () => {
    const w = newWorld();
    const c = findLegalCell(w, "furnace");
    expectOk(place(w, "p1", "furnace", c.x, c.y));
    advanceWorld(w, 25);
    expectOk(applyWorldCommand(w, { id: "c1", type: "world.cancel", siteId: 1 }));
    // furnace cost 10 scrap / 5 ferrous: floor(9)=9, floor(4.5)=4
    expect(w.stock.scrap).toBe(120 - 10 + 9);
    expect(w.stock.ferrous).toBe(12 - 5 + 4);
    expect(w.committed.scrap).toBe(1);
    expect(w.committed.ferrous).toBe(1);
    for (const qty of Object.values(w.stock)) expect(Number.isInteger(qty)).toBe(true);
    expectConserved(w, INITIAL_STOCK);
  });

  it("cancel after completion is site-not-found and never refunds", () => {
    const w = newWorld();
    const c = findLegalCell(w, "generator");
    expectOk(place(w, "p1", "generator", c.x, c.y));
    advanceWorld(w, 50);
    const fp = worldFingerprint(w);
    expectReason(applyWorldCommand(w, { id: "c1", type: "world.cancel", siteId: 1 }), "site-not-found");
    expect(worldFingerprint(w)).toBe(fp);
  });

  it("U01: place / rotate / cancel cycles never accidentally charge", () => {
    const w = newWorld();
    for (let i = 0; i < 4; i += 1) {
      const rotation = (i * 90) as 0 | 90 | 180 | 270;
      const c = findLegalCell(w, "sorter", rotation);
      expectOk(place(w, `cycle-${i}`, "sorter", c.x, c.y, rotation));
      expectOk(applyWorldCommand(w, { id: `cancel-${i}`, type: "world.cancel", siteId: i + 1 }));
      expect(w.stock).toEqual(INITIAL_STOCK);
      expect(w.credits).toBe(60);
    }
    expect(w.revision).toBe(8);
    expectConserved(w, INITIAL_STOCK);
  });
});

describe("tick-by-tick == event-jump equivalence", () => {
  it("identical final state for a mixed workload (fingerprint equality)", () => {
    // Funded scenario: warehouse 8 + generator 8 steel > seed steel 12.
    const mixedInitial = { scrap: 120, ferrous: 12, steel: 28 };
    const build = (jump: boolean): ReturnType<typeof newWorld> => {
      const w = newWorld(777);
      w.stock.steel = mixedInitial.steel;
      const step = (n: number): void => {
        if (jump) advanceWorldTo(w, w.tick + n);
        else advanceWorld(w, n);
      };
      const c1 = findLegalCell(w, "warehouse");
      expectOk(place(w, "w1", "warehouse", c1.x, c1.y));
      step(12);
      const c2 = findLegalCell(w, "furnace");
      expectOk(place(w, "f1", "furnace", c2.x, c2.y));
      step(13);
      expectOk(applyWorldCommand(w, { id: "cx", type: "world.cancel", siteId: 2 }));
      step(25); // warehouse completes at 50
      const c3 = findLegalCell(w, "generator");
      expectOk(place(w, "g1", "generator", c3.x, c3.y));
      step(100);
      const c4 = findLegalCell(w, "sorter");
      expectOk(place(w, "s1", "sorter", c4.x, c4.y));
      step(49);
      return w;
    };
    const ticked = build(false);
    const jumped = build(true);
    expect(worldFingerprint(jumped)).toBe(worldFingerprint(ticked));
    expect(jumped.buildings.length).toBe(2); // warehouse + generator; sorter still building
    expect(jumped.sites.length).toBe(1);
    expect(jumped.sites[0].progressTicks).toBe(49);
    expectConserved(jumped, mixedInitial);
    expectCreditsConserved(jumped, 60);
  });

  it("equivalence holds across many seeds and jump boundaries", () => {
    for (const seed of [1, 2, 3, 133, 9999]) {
      const a = newWorld(seed);
      const b = cloneWorld(a);
      const c = findLegalCell(a, "depot");
      expectOk(place(a, "d1", "depot", c.x, c.y));
      expectOk(place(b, "d1", "depot", c.x, c.y));
      for (const target of [1, 2, 24, 25, 49, 50, 51, 120]) {
        advanceWorld(a, target - a.tick);
        advanceWorldTo(b, target);
        expect(worldFingerprint(b), `seed ${seed} target ${target}`).toBe(worldFingerprint(a));
      }
    }
  });

  it("advanceWorldTo never rewinds and clamps partial progress", () => {
    const w = newWorld();
    const c = findLegalCell(w, "generator");
    expectOk(place(w, "g1", "generator", c.x, c.y));
    advanceWorldTo(w, 10);
    expect(w.sites[0].progressTicks).toBe(10);
    expect(siteProgressPct(w.sites[0])).toBe(20);
    advanceWorldTo(w, 5); // no rewind
    expect(w.tick).toBe(10);
    expect(w.sites[0].progressTicks).toBe(10);
    advanceWorldTo(w, 50);
    expect(w.buildings.length).toBe(1);
    expect(w.sites.length).toBe(0);
  });

  it("totals stay conserved through every phase of a build", () => {
    const w = newWorld();
    const c = findLegalCell(w, "warehouse");
    expectOk(place(w, "w1", "warehouse", c.x, c.y));
    for (let t = 0; t <= 60; t += 1) {
      const s = totals(w, "scrap");
      expect(s.stock + s.reserved + s.committed, `tick ${t}`).toBe(120);
      stepWorldTick(w);
    }
    expectConserved(w, INITIAL_STOCK);
  });
});