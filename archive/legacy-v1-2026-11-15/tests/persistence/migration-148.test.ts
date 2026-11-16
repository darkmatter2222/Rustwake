/**
 * T21 (#148): versioned old-save migration under the retuned #214 seed (E08).
 *
 * tests/legacy (T02, #129) already characterizes the SHAPE eras — pre-research,
 * pre-fleet, pre-counters, pre-BELT-001 — over byte-pinned fixtures. The gap this
 * file closes is the ECONOMY era: a save written before the #214 starter retune
 * (git 039a6c7: empty store, credits 0, dock 900, wreck pool 30, pulse 6 ticks,
 * export contract 3 steel / 30 credits) must load with its recorded balances
 * intact — never re-seeded to the new yard (scrap 120 / ferrous 12 / steel 12,
 * credits 60, dock 300) — or else be retained verbatim in the explicit G1 legacy
 * slot when it cannot decode.
 *
 * The fixture is built through the real command/engine path (so every machine
 * and route record is structurally complete), then its economy fields are set to
 * the documented pre-#214 values and the later-era fields are stripped, exactly
 * as a save written by that older build would read. Non-vision: numeric only.
 */
import { describe, expect, it } from "vitest";
import {
  decodeSave,
  encodeSave,
  hasSaveProgress,
  migrate,
  SAVE_KEY,
  DEFAULT_SETTINGS,
} from "../../src/game/persistence/save";
import { RECOVERY_KEY } from "../../src/game/persistence/recovery";
import { createStore } from "../../src/app/store";
import { advance } from "../../src/game/simulation/engine";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";

const LAST_SEEN_MS = 1_700_000_000_000;

// Pre-#214 economy constants, quoted from git 039a6c7 (the retune's parent):
// TUNING.dockCapacity 900, starterWreckPool 30, manualPulseTicks 6,
// exportContractSteel 3, exportContractCredits 30; seed store {}, credits 0.
const OLD_DOCK_CAPACITY = 900;
const OLD_WRECK_POOL = 30;
const OLD_EXPORT_STEEL = 3;
const OLD_EXPORT_CREDITS = 30;

let seq = 0;
function send(state: SimState, body: CommandBody) {
  seq += 1;
  const result = applyCommand(state, { ...body, id: `m148-${seq}` } as Command);
  expect(result.ok).toBe(true);
  return result;
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    raw: map,
  };
}

/**
 * A played pre-#214 yard: real topology, old-economy balances, and none of the
 * fields that later builds added (research, spares, measured counters, belt
 * runs, upgrade branches). Simultaneously pre-research, pre-fleet, pre-counters
 * and pre-#214-seed — the full version ladder in one artifact.
 */
function oldSeedYard(): SimState {
  // Deterministic fixture: every build replays the same command ids, so two
  // independent constructions (source vs. encoded-then-decoded) compare equal.
  seq = 0;
  const s = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(s, { type: "manual.salvage" });
    advance(s, 20);
  }
  send(s, { type: "drone.repair" });
  advance(s, 262);
  send(s, { type: "machine.build", blueprint: "sorter", tile: 8 });
  send(s, { type: "machine.build", blueprint: "furnace", tile: 9 });
  const [sorter, furnace] = s.machines;
  send(s, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send(s, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  send(s, { type: "route.connect", from: 0, to: furnace.id, filter: "scrap" });
  send(s, { type: "route.connect", from: furnace.id, to: 0, filter: "steel" });
  advance(s, 600);

  // Recorded balances of the old economy (a played yard: 18 old-style pulses of
  // the 30-unit pool, one old export contract claimed, a flying starter drone).
  s.store = { scrap: 23, ferrous: 4, steel: 3 };
  s.storeUnits = 30;
  s.storeCapacity = OLD_DOCK_CAPACITY;
  s.credits = OLD_EXPORT_CREDITS;
  s.exportClaimed = true;
  s.exportSteelDelivered = OLD_EXPORT_STEEL;
  s.wreck = { remaining: OLD_WRECK_POOL - 18, generation: 1, pulses: 18, nextPulseTick: s.tick + 6 };
  s.drone = { repaired: true, accumulated: 5, nextDeliveryTick: s.tick + 50, inFlight: null, deliveries: 12 };

  // Strip everything the older build did not write.
  const legacy = s as unknown as Record<string, unknown>;
  delete legacy.research; // pre-research
  delete legacy.spares; // pre-fleet
  for (const m of s.machines) {
    const rec = m as unknown as Record<string, unknown>;
    for (const key of [
      "ageTicks",
      "busyTicks",
      "fullTicks",
      "starvedTicks",
      "rateAge",
      "rateFrom",
      "rateAgePrev",
      "rateFromPrev",
      "branch",
    ]) {
      delete rec[key];
    }
  }
  for (const r of s.routes) {
    const rec = r as unknown as Record<string, unknown>;
    delete rec.ageTicks;
    delete rec.busyTicks;
    delete rec.run; // pre-BELT-001 priced runs
  }
  return s;
}

function oldSeedText(): string {
  return encodeSave(oldSeedYard(), LAST_SEEN_MS, { ...DEFAULT_SETTINGS });
}

function loadedOld(): { sim: SimState; lastSeenMs: number } {
  const decoded = decodeSave(oldSeedText());
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.reason);
  const migrated = migrate(decoded.payload);
  return { sim: migrated.sim, lastSeenMs: migrated.lastSeenMs };
}

describe("pre-#214-seed save migrates with balances intact (E08)", () => {
  it("preserves every recorded balance and progression marker", () => {
    const source = oldSeedYard();
    const { sim, lastSeenMs } = loadedOld();
    expect(lastSeenMs).toBe(LAST_SEEN_MS);
    // Economy: never re-seeded to the #214 yard (120/12/12, 60 credits, 300 dock).
    expect(sim.store).toEqual({ scrap: 23, ferrous: 4, steel: 3 });
    expect(sim.storeUnits).toBe(30);
    expect(sim.storeCapacity).toBe(OLD_DOCK_CAPACITY);
    expect(sim.credits).toBe(OLD_EXPORT_CREDITS);
    expect(sim.exportClaimed).toBe(true);
    expect(sim.exportSteelDelivered).toBe(OLD_EXPORT_STEEL);
    expect({ remaining: sim.wreck.remaining, generation: sim.wreck.generation, pulses: sim.wreck.pulses }).toEqual({
      remaining: 12,
      generation: 1,
      pulses: 18,
    });
    expect(sim.drone.repaired).toBe(true);
    expect(sim.drone.deliveries).toBe(12);
    expect(sim.drone.accumulated).toBe(5);
    // Progression: topology, clock, command ledger and tutorial survive.
    expect(sim.tick).toBe(source.tick);
    expect(sim.revision).toBe(source.revision);
    expect(sim.tutorial).toBe(source.tutorial);
    expect(sim.machines.map((m) => [m.id, m.blueprint, m.tile, m.level])).toEqual(
      source.machines.map((m) => [m.id, m.blueprint, m.tile, m.level]),
    );
    expect(sim.routes.map((r) => [r.id, r.from, r.to, r.filter])).toEqual(
      source.routes.map((r) => [r.id, r.from, r.to, r.filter]),
    );
    expect(sim.seenCommands).toEqual(source.seenCommands);
    expect(hasSaveProgress(sim)).toBe(true);
  });

  it("backfills the missing eras without touching balances", () => {
    const { sim } = loadedOld();
    expect(sim.research).toEqual({}); // pre-research -> unpurchased, not reset
    expect(sim.spares).toEqual([]); // pre-fleet -> the repaired starter only
    for (const m of sim.machines) {
      expect(m.ageTicks).toBe(0);
      expect(m.busyTicks).toBe(0);
      expect(m.fullTicks).toBe(0);
      expect(m.starvedTicks).toBe(0);
      expect(m.rateAge).toBe(0);
      expect(m.rateFrom).toBe(0);
      expect(m.rateAgePrev).toBe(0);
      expect(m.rateFromPrev).toBe(0);
    }
    for (const r of sim.routes) {
      expect(r.ageTicks).toBe(0);
      expect(r.busyTicks).toBe(0);
    }
    // The backfill is value-preserving: totals still equal the recorded ones.
    expect(sim.storeUnits).toBe(30);
    expect(sim.credits).toBe(OLD_EXPORT_CREDITS);
  });

  it("is idempotent and a byte fixed point after one migrate", () => {
    const decoded = decodeSave(oldSeedText());
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const first = migrate(decoded.payload);
    const text1 = encodeSave(first.sim, first.lastSeenMs, first.settings);
    const again = decodeSave(text1);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const second = migrate(again.payload);
    expect(second.sim).toEqual(first.sim);
    expect(encodeSave(second.sim, second.lastSeenMs, second.settings)).toBe(text1);
  });

  it("still detects progress when old credits sit below the new seed anchor", () => {
    // #214 re-anchored the credits marker to 60; an old yard's 30 credits alone
    // must not read as "no progress" — its tick/machines/drone markers carry it.
    const { sim } = loadedOld();
    expect(sim.credits).toBeLessThan(createInitialState().credits);
    expect(hasSaveProgress(sim)).toBe(true);
    // A pristine OLD seed (tick 0, credits 0, nothing built) is settings-only.
    const pristine = createInitialState();
    pristine.store = {};
    pristine.storeUnits = 0;
    pristine.credits = 0;
    pristine.storeCapacity = OLD_DOCK_CAPACITY;
    pristine.wreck.remaining = OLD_WRECK_POOL;
    expect(hasSaveProgress(pristine)).toBe(false);
  });
});

describe("pre-#214-seed save through the real store (E08)", () => {
  it("boots the old yard at its checkpoint without re-seeding", () => {
    const text = oldSeedText();
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getRole()).toBe("writer");
    const s = store.getState();
    expect(s.credits).toBe(OLD_EXPORT_CREDITS);
    expect(s.storeCapacity).toBe(OLD_DOCK_CAPACITY);
    expect(s.store).toEqual({ scrap: 23, ferrous: 4, steel: 3 });
    expect(s.machines).toHaveLength(2);
    expect(s.tick).toBeGreaterThan(0);
    // The persisted checkpoint keeps the old balances too.
    const exported = decodeSave(store.exportSave());
    expect(exported.ok).toBe(true);
    if (exported.ok) {
      expect(exported.payload.sim.credits).toBe(OLD_EXPORT_CREDITS);
      expect(exported.payload.sim.storeCapacity).toBe(OLD_DOCK_CAPACITY);
    }
    store.stop();
  });

  it("imports the old yard wholesale and a repeat import settles once (E02)", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    // Starts as the retuned fresh seed...
    expect(store.getState().credits).toBe(60);
    const text = oldSeedText();
    const first = store.importSave(text);
    expect(first.ok).toBe(true);
    const afterFirst = JSON.parse(JSON.stringify(store.getState()));
    expect(store.getState().credits).toBe(OLD_EXPORT_CREDITS);
    expect(store.getState().storeCapacity).toBe(OLD_DOCK_CAPACITY);
    // ...and the identical envelope again changes nothing (no double settlement).
    const second = store.importSave(text);
    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(store.getState()))).toEqual(afterFirst);
    store.stop();
  });

  it("retains an undecodable old save verbatim in the explicit legacy slot", () => {
    // The E08 alternative: when an old save cannot migrate, its raw bytes are
    // kept in the G1 recovery slot — never silently reset.
    const raw = oldSeedText().replace('"tick":', '"tick":9'); // checksum break
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getState().credits).toBe(60); // fresh fallback yard
    const notice = store.getSaveRecovery();
    expect(notice?.reason).toBe("checksum");
    expect(notice?.preserved).toBe(true);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(raw);
    expect(store.exportSaveRecovery()).toBe(raw);
    expect(store.retrySaveRecovery().ok).toBe(false);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(raw);
    store.stop();
  });
});
