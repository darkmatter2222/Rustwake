/**
 * #228 (G1 persistence join): the optional `world` save field.
 * Additive seam — no schema-version bump. Old saves decode unchanged; new
 * saves carry the build yard; hostile yards are refused on the same typed
 * failure path as a hostile sim, and the decoded yard never aliases the
 * parsed envelope.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  MAX_WORLD_RECORDS,
  SAVE_KEY,
  checksum,
  decodeSave,
  encodeSave,
  migrate,
  validateWorld,
} from "../../src/game/persistence/save";
import { TICK_MS, TUNING } from "../../src/game/content/defs";
import { SCHEMA_VERSION, createInitialState } from "../../src/game/simulation/types";
import { advanceWorld, createWorld, type WorldState } from "../../src/game/world";
import { createStore } from "../../src/app/store";
import { CATCHUP_PROTOCOL, handleCatchUp, type CatchUpRequest } from "../../src/game/workers/catchup";
import { handleWorkerMessage } from "../../src/game/workers/catchup.worker";
import {
  cloneWorld,
  expectConserved,
  expectCreditsConserved,
  expectOk,
  findLegalCell,
  place,
} from "../game/world/helpers";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    raw: map,
  };
}

/** A yard with one completed building, one partway site and its reservation. */
function yardInProgress(): WorldState {
  const w = createWorld(133);
  // Fund two generators (2 x 8 steel > seed steel 12), same as construction.test.
  w.stock.steel = (w.stock.steel ?? 0) + 16;
  const a = findLegalCell(w, "generator");
  expectOk(place(w, "p-a", "generator", a.x, a.y));
  advanceWorld(w, 50); // first generator completes (P1_CONSTRUCTION_TICKS = 50)
  const b = findLegalCell(w, "generator");
  expectOk(place(w, "p-b", "generator", b.x, b.y));
  advanceWorld(w, 20); // second generator is 20/50 through assembly
  return w;
}

/** A checksum-VALID envelope carrying the given (possibly hostile) world. */
function envelopeWithWorld(world: unknown): string {
  const payload = {
    sim: createInitialState(),
    lastSeenMs: 5,
    settings: DEFAULT_SETTINGS,
    world,
  };
  const body = JSON.stringify(payload);
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, checksum: checksum(body), payload });
}

describe("world save field (#228)", () => {
  it("round-trips a yard with buildings, sites and reservations", () => {
    const w = yardInProgress();
    expect(w.buildings.length).toBe(1);
    expect(w.sites.length).toBe(1);
    expect(w.reservations.length).toBe(1);
    const result = decodeSave(encodeSave(createInitialState(), 42, DEFAULT_SETTINGS, w));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.world).toEqual(w);
    expect(result.payload.world?.sites[0].progressTicks).toBe(20);
    expect(result.payload.world?.reservations[0].items).toEqual(w.reservations[0].items);
    // migrate (the boot/reconcile path) carries the yard through untouched.
    expect(migrate(result.payload).world).toEqual(w);
  });

  it("decodes an OLD save (no world field) unchanged", () => {
    const text = encodeSave(createInitialState(), 7, DEFAULT_SETTINGS);
    const result = decodeSave(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.world).toBeUndefined();
    expect(result.payload.sim.tick).toBe(0);
    expect(result.payload.lastSeenMs).toBe(7);
  });

  it("refuses a hostile world with reason invalid and a world: detail", () => {
    // Hostile edits deliberately bypass the readonly types: this is exactly
    // the shape an attacker-controlled envelope can carry after JSON.parse.
    type Hostile = { [key: string]: any };
    const cases: Array<[string, (w: Hostile) => void]> = [
      ["unknown asset", (w) => void (w.sites[0].asset = "not-an-asset")],
      ["negative qty", (w) => void (w.reservations[0].items[0].qty = -5)],
      ["unknown resource", (w) => void (w.reservations[0].items[0].resource = "unobtainium")],
      ["out-of-range cell", (w) => void (w.sites[0].cell = { x: 999, y: 0 })],
      ["negative tick", (w) => void (w.tick = -1)],
      ["negative credits", (w) => void (w.credits = -1)],
      ["hostile stock key", (w) => void (w.stock = JSON.parse('{"__proto__":5}'))],
      [
        "oversized sites array",
        (w) => void (w.sites = new Array(MAX_WORLD_RECORDS + 1).fill(w.sites[0])),
      ],
      ["null world", () => {}],
    ];
    for (const [name, mutate] of cases) {
      const w = yardInProgress();
      mutate(w as unknown as Hostile);
      const text = name === "null world" ? envelopeWithWorld(null) : envelopeWithWorld(w);
      const result = decodeSave(text);
      expect(result.ok, name).toBe(false);
      if (result.ok) continue;
      expect(result.reason, name).toBe("invalid");
      expect(result.detail?.startsWith("world:"), name).toBe(true);
    }
    // decode is pure: the hostile attempts leave a healthy envelope decodable.
    const healthy = decodeSave(
      encodeSave(createInitialState(), 1, DEFAULT_SETTINGS, yardInProgress()),
    );
    expect(healthy.ok).toBe(true);
  });

  it("keeps the checksum covering the world field", () => {
    const w = yardInProgress();
    const text = encodeSave(createInitialState(), 1, DEFAULT_SETTINGS, w);
    const envelope = JSON.parse(text) as {
      schemaVersion: number;
      checksum: string;
      payload: { world: WorldState };
    };
    // Tamper with the yard WITHOUT recomputing the checksum.
    envelope.payload.world.tick += 1;
    const result = decodeSave(JSON.stringify(envelope));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("checksum");
  });

  it("returns a sanitized clone that cannot alias the parsed envelope", () => {
    const w = yardInProgress();
    (w as WorldState & { bogus?: number }).bogus = 1;
    const text = encodeSave(createInitialState(), 1, DEFAULT_SETTINGS, w);
    const first = decodeSave(text);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const decoded = first.payload.world as WorldState & { bogus?: number };
    expect(decoded.bogus).toBeUndefined();
    decoded.sites[0].progressTicks = 49;
    decoded.stock.scrap = 0;
    // A second decode of the SAME text is unaffected by the mutation above.
    const second = decodeSave(text);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.payload.world?.sites[0].progressTicks).toBe(20);
    expect(second.payload.world?.stock.scrap).toBe(w.stock.scrap);
    expect(second.payload.world).not.toBe(first.payload.world);
  });

  it("neutralizes a hostile __proto__ ledger key", () => {
    const w = yardInProgress();
    // JSON.parse creates an OWN "__proto__" data property (bracket assignment
    // would hit the setter instead), which is exactly the hostile shape.
    w.seenCommands = JSON.parse('{"cmd-1":2,"__proto__":3}');
    const result = decodeSave(envelopeWithWorld(w));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ledger = result.payload.world?.seenCommands as Record<string, number>;
    expect(Object.getPrototypeOf(ledger)).toBe(Object.prototype);
    expect(ledger["cmd-1"]).toBe(2);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("validateWorld accepts a fresh yard and refuses malformed structure", () => {
    expect(validateWorld(createWorld(133))).toBeNull();
    expect(validateWorld(null)).toBe("state");
    expect(validateWorld([])).toBe("state");
    expect(validateWorld({ ...createWorld(133), tick: -1 })).toBe("tick");
    expect(validateWorld({ ...createWorld(133), terrain: [] })).toBe("terrain");
    expect(
      validateWorld({ ...createWorld(133), schemaVersion: SCHEMA_VERSION + 99 }),
    ).toBe("schemaVersion");
  });
});

/** Place one generator through the real store API and advance partway. */
function placePartway(store: ReturnType<typeof createStore>, ticks: number): void {
  expect(store.selectBuildAsset("generator").ok).toBe(true);
  const cell = findLegalCell(store.getBuildWorld(), "generator");
  store.setBuildGhostCell(cell);
  expect(store.confirmBuildPlacement().ok).toBe(true);
  store.step(ticks);
}

/** The economy-relevant yard slice compared by the offline-equivalence tests. */
function yardSlice(w: WorldState) {
  return {
    tick: w.tick,
    buildings: w.buildings,
    sites: w.sites,
    reservations: w.reservations,
    committed: w.committed,
    committedCredits: w.committedCredits,
    stock: w.stock,
    credits: w.credits,
  };
}

describe("store persistence join (#228 M2)", () => {
  it("reload resumes with the SAME progressTicks and settles exactly once", () => {
    const storage = memoryStorage();
    // Same lease id models a reload of the owning tab; the fixed clock means
    // zero elapsed absence, so no catch-up interferes with the yard assertions.
    const store = createStore({ storage, now: () => 1_000, leaseId: "tab-a" });
    placePartway(store, 20);
    const mid = store.getBuildWorld();
    expect(mid.sites[0].progressTicks).toBe(20);
    const reservedItems = mid.reservations[0].items.map((i) => ({ ...i }));
    const reservedCredits = mid.reservations[0].credits;
    const stockBefore = { ...mid.stock };
    const creditsBefore = mid.credits;

    const reopened = createStore({ storage, now: () => 1_000, leaseId: "tab-a" });
    const yard = reopened.getBuildWorld();
    expect(yard.tick).toBe(20);
    expect(yard.sites.length).toBe(1);
    expect(yard.sites[0].progressTicks).toBe(20);
    expect(yard.reservations.length).toBe(1);
    expectConserved(yard, { scrap: 120, ferrous: 12, steel: 12 });
    expectCreditsConserved(yard, 60);

    reopened.step(30); // tick 50: the site settles
    const settled = reopened.getBuildWorld();
    expect(settled.sites.length).toBe(0);
    expect(settled.buildings.length).toBe(1);
    expect(settled.reservations.length).toBe(0);
    // Single charge: the reservation moves to committed exactly once.
    for (const item of reservedItems) {
      expect(settled.committed[item.resource]).toBe(item.qty);
    }
    expect(settled.committedCredits).toBe(reservedCredits);
    // Material was reserved at PLACEMENT, so completion charges nothing more.
    expect(settled.stock).toEqual(stockBefore);
    expect(settled.credits).toBe(creditsBefore);
    expectConserved(settled, { scrap: 120, ferrous: 12, steel: 12 });
    expectCreditsConserved(settled, 60);

    reopened.step(100); // further ticks must never charge again
    const after = reopened.getBuildWorld();
    expect(after.buildings.length).toBe(1);
    expect(after.committed).toEqual(settled.committed);
    expect(after.committedCredits).toBe(settled.committedCredits);
    expect(after.stock).toEqual(stockBefore);
    // The durable checkpoint carries the settled yard.
    const saved = decodeSave(storage.raw.get(SAVE_KEY) ?? null);
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.payload.world?.buildings.length).toBe(1);
      expect(saved.payload.world?.reservations.length).toBe(0);
    }
  });

  it("a follower tab adopts the writer's yard through reconcile", () => {
    const storage = memoryStorage();
    const writer = createStore({ storage, now: () => 1_000, leaseId: "writer" });
    const follower = createStore({ storage, now: () => 1_000, leaseId: "follower" });
    expect(follower.getBuildWorld().sites.length).toBe(0);
    placePartway(writer, 20);
    follower.step(0); // reconcile adopts the newer snapshot, yard included
    const mirrored = follower.getBuildWorld();
    expect(mirrored.tick).toBe(20);
    expect(mirrored.sites.length).toBe(1);
    expect(mirrored.sites[0].progressTicks).toBe(20);
    expect(mirrored.reservations.length).toBe(1);
    // A reader never advances the yard itself.
    follower.step(10);
    expect(follower.getBuildWorld().tick).toBe(20);
  });

  it("an OLD world-less save boots a fresh seeded yard", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, encodeSave(createInitialState(), 1_000, DEFAULT_SETTINGS));
    const store = createStore({ storage, now: () => 1_000, leaseId: "tab-a" });
    const yard = store.getBuildWorld();
    expect(yard.tick).toBe(0);
    expect(yard.sites.length).toBe(0);
    expect(yard.buildings.length).toBe(0);
    expect(yard.seed).toBe(138); // BUILD_SESSION_SEED
  });

  it("export/import round-trips the yard; a refused import leaves it untouched", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 1_000, leaseId: "tab-a" });
    placePartway(store, 20);
    const text = store.exportSave();

    const other = memoryStorage();
    const target = createStore({ storage: other, now: () => 1_000, leaseId: "tab-b" });
    expect(target.importSave(text).ok).toBe(true);
    expect(target.getBuildWorld().sites[0].progressTicks).toBe(20);
    expect(target.getBuildWorld().reservations.length).toBe(1);
    // The imported yard is durable in the target's storage.
    const saved = decodeSave(other.raw.get(SAVE_KEY) ?? null);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.payload.world?.sites[0].progressTicks).toBe(20);
    // A corrupt import changes nothing.
    expect(target.importSave("{ broken").ok).toBe(false);
    expect(target.getBuildWorld().sites[0].progressTicks).toBe(20);
  });
});

describe("store offline advance join (#228 M3)", () => {
  const T0 = 1_700_000_000_000;

  it("an absence advances the yard by exactly the credited ticks, identically to live play", () => {
    const partway = yardInProgress(); // tick 70: one finished generator, one site 20/50
    const absenceTicks = 100; // sub-cap window that finishes the partway site
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, encodeSave(createInitialState(), T0, DEFAULT_SETTINGS, partway));
    const store = createStore({
      storage,
      now: () => T0 + absenceTicks * TICK_MS,
      leaseId: "tab-a",
    });

    const report = store.getReturnReport();
    expect(report).not.toBeNull();
    expect(report?.creditedTicks).toBe(absenceTicks);
    expect(report?.capped).toBe(false);

    const yard = store.getBuildWorld();
    expect(yard.tick).toBe(partway.tick + absenceTicks);
    // The partway site finished during the absence; the finished one is untouched.
    expect(yard.sites.length).toBe(0);
    expect(yard.buildings.length).toBe(2);
    expect(yard.reservations.length).toBe(0);

    // Offline equivalence: the yard is byte-identical to a live advance of the
    // same window from the same checkpoint (yardSlice is the economy slice).
    const live = cloneWorld(partway);
    advanceWorld(live, absenceTicks);
    expect(yardSlice(yard)).toEqual(yardSlice(live));

    // Single charge: the reservation moved to committed exactly once, on top of
    // the generator that had already finished before the absence.
    const settledSite = partway.reservations[0];
    for (const item of settledSite.items) {
      expect(yard.committed[item.resource]).toBe(
        (partway.committed[item.resource] ?? 0) + item.qty,
      );
    }
    expect(yard.committedCredits).toBe(partway.committedCredits + settledSite.credits);
    // Material was reserved at placement, so completion charges nothing more.
    expect(yard.stock).toEqual(partway.stock);
    expect(yard.credits).toBe(partway.credits);

    // The boot checkpoint durably carries the advanced yard.
    const saved = decodeSave(storage.raw.get(SAVE_KEY) ?? null);
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.payload.world?.tick).toBe(partway.tick + absenceTicks);
      expect(saved.payload.world?.buildings.length).toBe(2);
      expect(saved.payload.world?.reservations.length).toBe(0);
    }
  });

  it("a reload at the same instant credits nothing and never double-charges", () => {
    const partway = yardInProgress();
    const absenceTicks = 100;
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, encodeSave(createInitialState(), T0, DEFAULT_SETTINGS, partway));
    const clock = T0 + absenceTicks * TICK_MS;
    const first = createStore({ storage, now: () => clock, leaseId: "tab-a" });
    const advanced = first.getBuildWorld();
    expect(advanced.tick).toBe(partway.tick + absenceTicks);

    // The reference moved to `clock`, so a second boot measures no gap.
    const reopened = createStore({ storage, now: () => clock, leaseId: "tab-a" });
    expect(reopened.getReturnReport()).toBeNull();
    const again = reopened.getBuildWorld();
    expect(again.tick).toBe(advanced.tick);
    expect(yardSlice(again)).toEqual(yardSlice(advanced));
    expect(again.committed).toEqual(advanced.committed);
    expect(again.committedCredits).toBe(advanced.committedCredits);
  });

  it("the worker message contract agrees with the inline path and ignores stale requests", () => {
    const request: CatchUpRequest = {
      protocol: CATCHUP_PROTOCOL,
      id: 7,
      sim: createInitialState(),
      lastSeenMs: T0,
      nowMs: T0 + 100 * TICK_MS,
    };
    const post = vi.fn();
    handleWorkerMessage(request, post);
    expect(post).toHaveBeenCalledTimes(1);
    const response = post.mock.calls[0][0];
    expect(response).toEqual(handleCatchUp(request));
    expect(response.report.creditedTicks).toBe(100);

    // No request, or a foreign protocol version, posts nothing (spec 18.5).
    const stale = vi.fn();
    handleWorkerMessage(undefined, stale);
    handleWorkerMessage({ ...request, protocol: CATCHUP_PROTOCOL + 99 }, stale);
    expect(stale).not.toHaveBeenCalled();
  });

  it("a long absence caps the yard advance at the offline cap, not the full gap", () => {
    const partway = yardInProgress();
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, encodeSave(createInitialState(), T0, DEFAULT_SETTINGS, partway));
    const store = createStore({
      storage,
      now: () => T0 + 18 * 3600 * 1000, // 18h gap, 12h cap
      leaseId: "tab-a",
    });
    const report = store.getReturnReport();
    expect(report?.creditedTicks).toBe(TUNING.offlineCapTicks);
    expect(report?.capped).toBe(true);
    const yard = store.getBuildWorld();
    // The yard rode exactly the credited window; the discarded 6h tail is never claimed.
    expect(yard.tick).toBe(partway.tick + TUNING.offlineCapTicks);
    expect(yard.sites.length).toBe(0);
    expect(yard.buildings.length).toBe(2);
  }, 30_000);
});
