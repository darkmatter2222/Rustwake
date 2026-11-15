/**
 * #228 (G1 persistence join): the optional `world` save field.
 * Additive seam — no schema-version bump. Old saves decode unchanged; new
 * saves carry the build yard; hostile yards are refused on the same typed
 * failure path as a hostile sim, and the decoded yard never aliases the
 * parsed envelope.
 */
import { describe, expect, it } from "vitest";
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
import { SCHEMA_VERSION, createInitialState } from "../../src/game/simulation/types";
import { advanceWorld, createWorld, type WorldState } from "../../src/game/world";
import { createStore } from "../../src/app/store";
import {
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

describe("store persistence join (#228 M2)", () => {
  /** Place one generator through the real store API and advance partway. */
  function placePartway(store: ReturnType<typeof createStore>, ticks: number): void {
    expect(store.selectBuildAsset("generator").ok).toBe(true);
    const cell = findLegalCell(store.getBuildWorld(), "generator");
    store.setBuildGhostCell(cell);
    expect(store.confirmBuildPlacement().ok).toBe(true);
    store.step(ticks);
  }

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
