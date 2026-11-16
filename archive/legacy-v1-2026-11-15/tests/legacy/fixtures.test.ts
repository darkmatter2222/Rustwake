/**
 * RW3D T02 (#129): characterization of the checked-in legacy save fixtures.
 *
 * These tests prove the artifacts under tests/legacy/fixtures are exactly what the
 * real command/engine/save path produces at the prerequisite SHA, that they load
 * through decodeSave + migrate with their pinned balances intact, that a round trip
 * is a byte fixed point after one migrate, and that the store boots/imports them.
 *
 * No node APIs are used: the exact checked-in bytes are imported from the valid-JSON
 * aggregate artifacts.json (name -> envelope text) and regenerated in-process by the
 * pure fixture library, so the suite runs under jsdom like the rest of the repository.
 * The aggregate is required because bad-truncated is intentionally invalid JSON and
 * cannot be a static JSON module import (vite:json parses imports at transform time).
 * A drift in engine/content/save code fails here instead of silently re-pinning the
 * artifacts.
 */
import { describe, expect, it } from "vitest";
import { buildAllFixtures, LAST_SEEN_MS, type FixtureSpec } from "./fixtures-lib";
import {
  checksum,
  decodeSave,
  encodeSave,
  migrate,
  SAVE_KEY,
  type SavePayload,
} from "../../src/game/persistence/save";
import { createStore, type StoreOptions } from "../../src/app/store";
import { systemTotals, unitTotal } from "../../src/game/simulation/invariants";
import { fleetAccumulated, fleetDeliveries } from "../../src/game/simulation/types";

import manifest from "./fixtures/manifest.json";
import artifacts from "./fixtures/artifacts.json";

// Exact checked-in envelope text per fixture, including the intentionally-truncated
// one (stored as a string, so the aggregate itself is always valid JSON).
const ARTIFACTS = artifacts as Record<string, string>;

interface ManifestEntry {
  name: string;
  file: string;
  kind: string;
  sha256: string;
  meta: FixtureSpec["meta"];
  expectedReason?: string;
  expectedDetail?: string;
  repair?: { droppedRoutes: number; returnedItems: Record<string, number>; scrapRefund: number };
}
const MANIFEST = manifest as unknown as { fixtures: ManifestEntry[] };

function memoryStorage(): NonNullable<StoreOptions["storage"]> & { dump(): Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => map,
  };
}

function loadedView(text: string): SavePayload {
  const decoded = decodeSave(text);
  if (!decoded.ok) throw new Error(`fixture failed to decode: ${decoded.reason}`);
  return migrate(decoded.payload);
}

function sumValues(record: Record<string, number>): number {
  let total = 0;
  for (const value of Object.values(record)) total += value;
  return total;
}

describe("legacy fixture artifacts", () => {
  const fixtures = buildAllFixtures();

  it("regenerates byte-identical to the checked-in JSON and manifest", () => {
    expect(fixtures).toHaveLength(11);
    expect(MANIFEST.fixtures).toHaveLength(11);
    for (const f of fixtures) {
      // The aggregate stores the exact compact envelope text (key order preserved),
      // so the checked-in bytes must equal what the pure library regenerates.
      expect(ARTIFACTS[f.name], f.name).toBe(f.text);
      const entry = MANIFEST.fixtures.find((e) => e.name === f.name);
      expect(entry, f.name).toBeDefined();
      expect(entry?.file).toBe(f.file);
      expect(entry?.kind).toBe(f.kind);
      expect(entry?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry?.meta, f.name).toEqual(f.meta);
    }
  });

  it("carries a valid FNV-1a checksum over each payload", () => {
    for (const f of fixtures) {
      if (f.name === "bad-checksum" || f.name === "bad-truncated") continue;
      const envelope = JSON.parse(f.text) as { checksum: string; payload: SavePayload };
      expect(checksum(JSON.stringify(envelope.payload)), f.name).toBe(envelope.checksum);
    }
  });
});

describe("legacy fixtures load through the real save path", () => {
  const fixtures = buildAllFixtures().filter((f) => f.kind === "save");

  it("preserves the pinned balances of every healthy fixture", () => {
    for (const f of fixtures) {
      if (f.repair) continue; // orphan damage is asserted separately below
      const view = loadedView(f.text).sim;
      const m = f.meta;
      expect(view.tick, f.name).toBe(m.tick);
      expect(view.revision, f.name).toBe(m.revision);
      expect(view.credits, f.name).toBe(m.credits);
      expect(view.tutorial, f.name).toBe(m.tutorial);
      expect(view.exportClaimed, f.name).toBe(m.exportClaimed);
      expect(view.storeUnits, f.name).toBe(m.storeUnits);
      expect(view.storeCapacity, f.name).toBe(m.storeCapacity);
      expect(systemTotals(view), f.name).toEqual(m.totals);
      expect(unitTotal(view), f.name).toBe(m.unitTotal);
      expect(view.machines.length, f.name).toBe(m.machines);
      expect(view.routes.length, f.name).toBe(m.routes);
      // Pin the wreck balance triple; nextPulseTick is an internal timer, not a balance.
      expect(
        { remaining: view.wreck.remaining, generation: view.wreck.generation, pulses: view.wreck.pulses },
        f.name,
      ).toEqual(m.wreck);
      expect(view.research, f.name).toEqual(m.research);
      expect(fleetDeliveries(view), f.name).toBe(m.fleet.deliveries);
      expect(fleetAccumulated(view), f.name).toBe(m.fleet.accumulated);
      expect(1 + view.spares.length, f.name).toBe(m.fleet.units);
    }
  });

  it("repairs orphan registration on load, preserving totals plus the belt refund", () => {
    for (const f of fixtures) {
      if (!f.repair) continue;
      const repair = f.repair;
      const decoded = decodeSave(f.text);
      expect(decoded.ok, f.name).toBe(true);
      if (!decoded.ok) continue;
      const view = migrate(decoded.payload).sim;
      const m = f.meta;
      // The manifest quotes the STORED (damaged) balances; the load path drops the
      // orphan belts and refunds their priced scrap, creating exactly that much.
      expect(view.routes.length, f.name).toBe(m.routes - repair.droppedRoutes);
      expect(view.machines.length, f.name).toBe(m.machines);
      expect(view.tick, f.name).toBe(m.tick);
      expect(view.revision, f.name).toBe(m.revision);
      expect(view.credits, f.name).toBe(m.credits);
      const expectedTotals: Record<string, number> = { ...m.totals };
      for (const [resource, qty] of Object.entries(repair.returnedItems)) {
        expectedTotals[resource] = (expectedTotals[resource] ?? 0) + qty;
      }
      expectedTotals.scrap = (expectedTotals.scrap ?? 0) + repair.scrapRefund;
      expect(systemTotals(view), f.name).toEqual(expectedTotals);
      const returned = sumValues(repair.returnedItems);
      expect(unitTotal(view), f.name).toBe(m.unitTotal + repair.scrapRefund + returned);
      expect(view.storeUnits, f.name).toBe(m.storeUnits + repair.scrapRefund + returned);
      // No route may still point at the dismantled machine.
      const machineIds = new Set(view.machines.map((machine) => machine.id));
      for (const route of view.routes) {
        if (route.from.kind === "machine") expect(machineIds.has(route.from.id), f.name).toBe(true);
        if (route.to.kind === "machine") expect(machineIds.has(route.to.id), f.name).toBe(true);
      }
    }
  });

  it("sanitizes hostile settings on decode", () => {
    const f = buildAllFixtures().find((x) => x.name === "bad-settings");
    expect(f?.expectedSettings).toBeDefined();
    const decoded = decodeSave(f!.text);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.payload.settings).toEqual(f!.expectedSettings);
  });

  it("rejects every adversarial envelope with the documented reason", () => {
    for (const f of buildAllFixtures().filter((x) => x.kind === "reject")) {
      const decoded = decodeSave(f.text);
      expect(decoded.ok, f.name).toBe(false);
      if (decoded.ok) continue;
      expect(decoded.reason, f.name).toBe(f.expectedReason);
      if (f.expectedDetail) expect(decoded.detail, f.name).toBe(f.expectedDetail);
    }
  });
});

describe("legacy fixture round trip", () => {
  it("is a byte fixed point after one migrate", () => {
    for (const f of buildAllFixtures().filter((x) => x.kind === "save")) {
      const first = loadedView(f.text);
      const text1 = encodeSave(first.sim, first.lastSeenMs, first.settings);
      const decoded = decodeSave(text1);
      expect(decoded.ok, f.name).toBe(true);
      if (!decoded.ok) continue;
      const second = migrate(decoded.payload);
      expect(second.sim, f.name).toEqual(first.sim);
      expect(second.settings, f.name).toEqual(first.settings);
      expect(second.lastSeenMs, f.name).toBe(first.lastSeenMs);
      const text2 = encodeSave(second.sim, second.lastSeenMs, second.settings);
      expect(text2, f.name).toBe(text1);
    }
  });
});

describe("store boot and import of legacy fixtures", () => {
  const byName = (name: string): FixtureSpec => {
    const f = buildAllFixtures().find((x) => x.name === name);
    if (!f) throw new Error(`missing fixture ${name}`);
    return f;
  };

  it("boots a saved yard at its checkpoint tick as the writer", () => {
    const chain = byName("chain-export.modern");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, chain.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getRole()).toBe("writer");
    expect(store.getState().tick).toBe(chain.meta.tick);
    expect(store.getState().machines.length).toBe(chain.meta.machines);

    const exported = loadedView(store.exportSave()).sim;
    expect(systemTotals(exported)).toEqual(chain.meta.totals);
    expect(exported.credits).toBe(chain.meta.credits);
    store.stop();
  });

  it("imports a deeper yard and leaves the live state untouched on a bad import", () => {
    const chain = byName("chain-export.modern");
    const deep = byName("deep-yard.modern");
    const bad = byName("bad-checksum");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, chain.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });

    const ok = store.importSave(deep.text);
    expect(ok.ok).toBe(true);
    expect(store.getState().machines.length).toBe(deep.meta.machines);
    expect(store.getState().tick).toBe(deep.meta.tick);

    const before = store.getState();
    const rejected = store.importSave(bad.text);
    expect(rejected.ok).toBe(false);
    expect(store.getState()).toBe(before);
    expect(store.getState().tick).toBe(deep.meta.tick);
    store.stop();
  });

  it("boots hostile settings into the sanitized range", () => {
    const bad = byName("bad-settings");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, bad.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getSettings()).toEqual(bad.expectedSettings);
    store.stop();
  });
});
