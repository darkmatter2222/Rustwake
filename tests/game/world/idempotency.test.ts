/**
 * Acceptance E02 (issue #133): duplicate command IDs charge exactly once.
 * Mirrors the sim core contract: seenCommands records only successes, the
 * replay returns the original revision, and rejected ids stay retryable.
 */
import { describe, expect, it } from "vitest";
import {
  advanceWorld,
  applyWorldCommand,
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
  placeCmd,
} from "./helpers";

const INITIAL_STOCK = { scrap: 120, ferrous: 12, steel: 12 };

describe("E02: duplicate command IDs charge once", () => {
  it("replayed world.place returns the original revision, no second charge", () => {
    const w = newWorld();
    const c = findLegalCell(w, "warehouse");
    const cmd = placeCmd("dup-1", "warehouse", c.x, c.y);
    const first = applyWorldCommand(w, cmd);
    expectOk(first);
    expect(first.revision).toBe(1);
    const fp = worldFingerprint(w);
    for (let i = 0; i < 5; i += 1) {
      const replay = applyWorldCommand(w, cmd);
      expectOk(replay);
      expect(replay.revision).toBe(1);
      expect(worldFingerprint(w)).toBe(fp);
    }
    expect(w.sites.length).toBe(1);
    expect(w.reservations.length).toBe(1);
    expect(w.stock.scrap).toBe(90);
    expect(w.credits).toBe(40);
    expectConserved(w, INITIAL_STOCK);
  });

  it("replay after completion still charges nothing", () => {
    const w = newWorld();
    const c = findLegalCell(w, "generator");
    const cmd = placeCmd("dup-2", "generator", c.x, c.y);
    expectOk(applyWorldCommand(w, cmd));
    advanceWorld(w, 50);
    const fp = worldFingerprint(w);
    const replay = applyWorldCommand(w, cmd);
    expectOk(replay);
    expect(replay.revision).toBe(1);
    expect(worldFingerprint(w)).toBe(fp);
    expect(w.buildings.length).toBe(1);
    expect(w.committed.scrap).toBe(20);
  });

  it("replayed world.cancel refunds exactly once", () => {
    const w = newWorld();
    const c = findLegalCell(w, "depot");
    expectOk(place(w, "p1", "depot", c.x, c.y));
    advanceWorld(w, 5);
    const cancel = { id: "dup-cancel", type: "world.cancel" as const, siteId: 1 };
    const first = applyWorldCommand(w, cancel);
    expectOk(first);
    const fp = worldFingerprint(w);
    for (let i = 0; i < 3; i += 1) {
      const replay = applyWorldCommand(w, cancel);
      expectOk(replay);
      expect(replay.revision).toBe(first.revision);
      expect(worldFingerprint(w)).toBe(fp);
    }
    expect(w.stock.scrap).toBe(120 - 45 + 40);
    expectConserved(w, INITIAL_STOCK);
    expectCreditsConserved(w, 60);
  });

  it("replayed world.expand pays once and owns once", () => {
    const w = newWorld();
    w.milestoneTokens = 1;
    const expand = { id: "dup-expand", type: "world.expand" as const, parcelId: 2 };
    const first = applyWorldCommand(w, expand);
    expectOk(first);
    const fp = worldFingerprint(w);
    const replay = applyWorldCommand(w, expand);
    expectOk(replay);
    expect(replay.revision).toBe(first.revision);
    expect(worldFingerprint(w)).toBe(fp);
    expect(w.stock.scrap).toBe(90);
    expect(w.milestoneTokens).toBe(0);
  });

  it("a rejected id is NOT recorded: fixing the state makes the same id succeed", () => {
    const w = newWorld();
    const c = findLegalCell(w, "sorter");
    w.stock.scrap = 0;
    const cmd = placeCmd("retry-1", "sorter", c.x, c.y);
    expectReason(applyWorldCommand(w, cmd), "insufficient-material");
    expect(w.seenCommands["retry-1"]).toBeUndefined();
    expect(w.revision).toBe(0);
    w.stock.scrap = 120;
    expectOk(applyWorldCommand(w, cmd));
    expect(w.revision).toBe(1);
    expect(w.sites.length).toBe(1);
  });

  it("revision increments only on success, across a mixed stream", () => {
    const w = newWorld();
    const c = findLegalCell(w, "generator");
    expectOk(place(w, "ok-1", "generator", c.x, c.y)); // rev 1
    expectReason(place(w, "bad-1", "generator", c.x, c.y), "occupied"); // still 1
    expectReason(place(w, "bad-2", "nope", 0, 0), "unknown-asset"); // still 1
    expectOk(applyWorldCommand(w, { id: "ok-2", type: "world.cancel", siteId: 1 })); // rev 2
    expectReason(applyWorldCommand(w, { id: "bad-3", type: "world.cancel", siteId: 1 }), "site-not-found");
    expect(w.revision).toBe(2);
    expect(Object.keys(w.seenCommands).sort()).toEqual(["ok-1", "ok-2"]);
  });

  it("command streams are reproducible: same seed + stream = same fingerprint", () => {
    const run = (): string => {
      const w = newWorld(2026);
      w.stock.steel = (w.stock.steel ?? 0) + 10; // fund the stream: warehouse 8 + crane 6 > seed steel 12
      const c1 = findLegalCell(w, "warehouse");
      expectOk(place(w, "s1", "warehouse", c1.x, c1.y));
      advanceWorld(w, 20);
      const c2 = findLegalCell(w, "crane");
      expectOk(place(w, "s2", "crane", c2.x, c2.y));
      advanceWorld(w, 30);
      expectOk(applyWorldCommand(w, { id: "s3", type: "world.cancel", siteId: 2 }));
      advanceWorld(w, 100);
      return worldFingerprint(w);
    };
    expect(run()).toBe(run());
  });

  it("reload does not resurrect seen commands or double-charge (save seam)", () => {
    const w = newWorld();
    const c = findLegalCell(w, "furnace");
    const cmd = placeCmd("persist-1", "furnace", c.x, c.y);
    expectOk(applyWorldCommand(w, cmd));
    const reloaded = cloneWorld(w);
    const replay = applyWorldCommand(reloaded, cmd);
    expectOk(replay);
    expect(replay.revision).toBe(1);
    expect(reloaded.reservations.length).toBe(1);
    expect(reloaded.stock.scrap).toBe(110);
    advanceWorld(reloaded, 50);
    expect(reloaded.buildings.length).toBe(1);
    expectConserved(reloaded, INITIAL_STOCK);
  });
});