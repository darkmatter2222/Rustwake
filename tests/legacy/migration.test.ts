/**
 * RW3D T02 (#129): E08 save migration / recovery characterization.
 *
 * Covers: migrate backfills the legacy v1 shape without moving a single unit;
 * migrate is idempotent; repairRegistration fixes pre-#100 orphan damage (priced
 * and pre-price) and is a no-op on healthy saves; every adversarial envelope is
 * refused by importSave without touching the live yard; hostile settings sanitize;
 * two tabs sharing one storage retain a single writer until the lease expires.
 *
 * G1 (#191) is now FIXED and pinned below: a corrupt boot retains the raw payload
 * in a parallel recovery slot and raises a player-visible notice instead of silently
 * discarding it; the fresh yard remains only a fallback. The remaining honest gap is
 * that decodeSave imposes no payload size cap (G2, #148 territory — deliberately not
 * preempted here). Offline catch-up cap/rollback are already covered by
 * tests/simulation/offline.test.ts and are not duplicated here.
 */
import { describe, expect, it } from "vitest";
import {
  decodeSave,
  migrate,
  repairRegistration,
  SAVE_KEY,
  type SavePayload,
} from "../../src/game/persistence/save";
import { LEASE_TTL_MS } from "../../src/game/persistence/lease";
import { createStore, type StoreOptions } from "../../src/app/store";
import { systemTotals, unitTotal } from "../../src/game/simulation/invariants";
import type { SimState } from "../../src/game/simulation/types";
import { buildAllFixtures, LAST_SEEN_MS, type FixtureSpec } from "./fixtures-lib";

function fixture(name: string): FixtureSpec {
  const f = buildAllFixtures().find((x) => x.name === name);
  if (!f) throw new Error(`missing fixture ${name}`);
  return f;
}

function decode(name: string): SavePayload {
  const decoded = decodeSave(fixture(name).text);
  if (!decoded.ok) throw new Error(`fixture ${name} rejected: ${decoded.reason}`);
  return decoded.payload;
}

function memoryStorage(): NonNullable<StoreOptions["storage"]> {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * systemTotals/unitTotal walk the fleet via s.spares, which decodeSave does NOT
 * backfill on a legacy-stripped sim (only migrate does). Counting the raw decoded
 * shape therefore needs spares defaulted to [] so the pre-migrate balance is
 * measurable without throwing. Test-side view only; it mutates nothing.
 */
function totalsOf(sim: SimState): Record<string, number> {
  return systemTotals({ ...sim, spares: sim.spares ?? [] });
}
function unitTotalOf(sim: SimState): number {
  return unitTotal({ ...sim, spares: sim.spares ?? [] });
}

describe("E08 migrate backfill and preservation", () => {
  it("backfills the legacy v1 shape (research, spares, counters) without adding run/branch", () => {
    const early = migrate(decode("salvage-early.legacy")).sim;
    expect(early.research).toEqual({});
    expect(early.spares).toEqual([]);

    const orphanLegacy = migrate(decode("orphan-route.legacy")).sim;
    expect(orphanLegacy.machines.length).toBe(1);
    for (const machine of orphanLegacy.machines) {
      expect(machine.ageTicks).toBe(0);
      expect(machine.busyTicks).toBe(0);
      expect(machine.fullTicks).toBe(0);
      expect(machine.starvedTicks).toBe(0);
      expect(machine.rateAge).toBe(0);
      expect(machine.rateFrom).toBe(0);
      expect(machine.branch).toBeUndefined();
    }
    // A pre-price save keeps its old arithmetic: migrate does not invent a run.
    for (const route of orphanLegacy.routes) {
      expect(route.run).toBeUndefined();
      expect(route.ageTicks).toBe(0);
      expect(route.busyTicks).toBe(0);
    }
  });

  it("preserves every balance across migrate for every save fixture", () => {
    for (const f of buildAllFixtures().filter((x) => x.kind === "save")) {
      const payload = decode(f.name);
      const before = payload.sim;
      const after = migrate(payload).sim;
      expect(totalsOf(after), f.name).toEqual(totalsOf(before));
      expect(unitTotalOf(after), f.name).toBe(unitTotalOf(before));
      expect(after.credits, f.name).toBe(before.credits);
      expect(after.tick, f.name).toBe(before.tick);
      expect(after.revision, f.name).toBe(before.revision);
      expect(after.tutorial, f.name).toBe(before.tutorial);
      expect(after.wreck, f.name).toEqual(before.wreck);
    }
  });

  it("is idempotent: a second migrate changes nothing", () => {
    for (const f of buildAllFixtures().filter((x) => x.kind === "save")) {
      const once = migrate(decode(f.name));
      const twice = migrate(once);
      expect(twice.sim, f.name).toEqual(once.sim);
      expect(twice.settings, f.name).toEqual(once.settings);
      expect(twice.lastSeenMs, f.name).toBe(once.lastSeenMs);
    }
  });
});

describe("E08 orphan registration repair", () => {
  it("drops dangling belts and refunds exactly the priced scrap (modern vs legacy)", () => {
    for (const name of ["orphan-route.modern", "orphan-route.legacy"]) {
      const f = fixture(name);
      const repair = f.repair!;
      // Parse the raw damaged envelope (bypassing decode's own repair) to exercise
      // repairRegistration directly on the pre-#100 defect.
      const raw = (JSON.parse(f.text) as { payload: { sim: SimState } }).payload.sim;
      const routesBefore = raw.routes.length;
      const scrapBefore = totalsOf(raw).scrap ?? 0;
      repairRegistration(raw);
      expect(raw.routes.length, name).toBe(routesBefore - repair.droppedRoutes);
      expect(totalsOf(raw).scrap ?? 0, name).toBe(scrapBefore + repair.scrapRefund);
      const ids = new Set(raw.machines.map((m) => m.id));
      for (const route of raw.routes) {
        if (route.from.kind === "machine") expect(ids.has(route.from.id), name).toBe(true);
        if (route.to.kind === "machine") expect(ids.has(route.to.id), name).toBe(true);
      }
    }
  });

  it("is a no-op on a healthy yard and idempotent on a repaired one", () => {
    const healthy = decode("chain-export.modern").sim;
    const snapshot = JSON.stringify(healthy);
    repairRegistration(healthy);
    expect(JSON.stringify(healthy)).toBe(snapshot);

    const repaired = decode("orphan-route.modern").sim; // decode already repaired it
    const again = JSON.stringify(repaired);
    repairRegistration(repaired);
    expect(JSON.stringify(repaired)).toBe(again);
  });
});

describe("E08 adversarial imports change nothing", () => {
  it("refuses invalid/partial/duplicate/checksum/schema envelopes without swapping the yard", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, fixture("chain-export.modern").text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    for (const f of buildAllFixtures().filter((x) => x.kind === "reject")) {
      const before = store.getState();
      const result = store.importSave(f.text);
      expect(result.ok, f.name).toBe(false);
      if (!result.ok) expect(result.reason, f.name).toBe(f.expectedReason);
      expect(store.getState(), f.name).toBe(before);
    }
    store.stop();
  });

  it("sanitizes hostile settings on a successful import", () => {
    const f = fixture("bad-settings");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, fixture("chain-export.modern").text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const result = store.importSave(f.text);
    expect(result.ok).toBe(true);
    expect(store.getSettings()).toEqual(f.expectedSettings);
    store.stop();
  });

  it("pins the G1 fix (#191): a corrupt boot retains the raw slot and raises a notice", () => {
    const storage = memoryStorage();
    const bad = fixture("bad-checksum");
    storage.setItem(SAVE_KEY, bad.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    // The fresh yard is still the fallback, but the damaged save is no longer
    // discarded silently: its raw bytes are retained verbatim in the parallel
    // recovery slot and a player-visible notice is exposed (executive contract:
    // never silently reset a player's yard). This DELIBERATELY replaces the pre-#191
    // pin that characterized the silent discard; the fixture JSON bytes are unchanged
    // (only the behavior assertion moved). See docs/evidence/2026-11-14-rw3d-g1fix-*.
    expect(store.getState().tick).toBe(0);
    expect(store.getState().machines.length).toBe(0);
    expect(store.getState().credits).toBe(0);
    const notice = store.getSaveRecovery();
    expect(notice).not.toBeNull();
    expect(notice?.reason).toBe(bad.expectedReason);
    expect(notice?.preserved).toBe(true);
    expect(store.exportSaveRecovery()).toBe(bad.text);
    store.stop();
  });
});

describe("E08 two tabs retain one writer", () => {
  it("keeps the second tab read-only until the owner's lease expires", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, fixture("chain-export.modern").text);
    let clock = LAST_SEEN_MS;
    const now = () => clock;
    const owner = createStore({ storage, now, leaseId: "owner" });
    const follower = createStore({ storage, now, leaseId: "follower" });

    expect(owner.getRole()).toBe("writer");
    expect(follower.getRole()).toBe("reader");

    // The follower cannot advance or import while the owner holds a live lease.
    const rejected = follower.dispatch({ id: "f1", type: "manual.salvage" });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe("read-only");
    const importRejected = follower.importSave(fixture("deep-yard.modern").text);
    expect(importRejected.ok).toBe(false);
    if (!importRejected.ok) expect(importRejected.reason).toBe("read-only");

    // Only the owner advances the shared economy.
    const followerTick = follower.getState().tick;
    owner.step(10);
    expect(owner.getState().tick).toBe(followerTick + 10);
    expect(follower.getState().tick).toBe(followerTick);

    // Once the owner's heartbeat is older than the TTL, the follower may take over;
    // the original owner is then demoted on its next reconcile, so still one writer.
    clock += LEASE_TTL_MS + 1;
    expect(follower.takeOver()).toBe("writer");
    const ownerAfter = owner.dispatch({ id: "o1", type: "manual.salvage" });
    expect(ownerAfter.ok).toBe(false);
    if (!ownerAfter.ok) expect(ownerAfter.reason).toBe("read-only");

    owner.stop();
    follower.stop();
  });
});
