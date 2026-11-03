import { describe, expect, it } from "vitest";
import { createStore } from "../../src/app/store";
import {
  SAVE_KEY,
  checksum,
  DEFAULT_SETTINGS,
  type SavePayload,
} from "../../src/game/persistence/save";
import { TUNING } from "../../src/game/content/defs";

/**
 * B-06: the yard moves between devices as one versioned JSON text, and a refused
 * file leaves the running yard exactly as it was (spec 22.1, spec 25.3 case 8).
 */
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

/** A small but real yard: repaired drone, one machine, one link, some batches. */
function buildYard(now: () => number) {
  const storage = memoryStorage();
  const store = createStore({ storage, now });
  for (let i = 0; i < 6; i += 1) {
    store.dispatch({ id: `p${i}`, type: "manual.salvage" });
    store.step(TUNING.manualPulseTicks);
  }
  store.dispatch({ id: "rep", type: "drone.repair" });
  store.step(262);
  store.dispatch({ id: "b1", type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = store.getState().machines[0];
  store.dispatch({ id: "r1", type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  store.step(400);
  return { storage, store };
}

const snapshot = (store: ReturnType<typeof createStore>) =>
  JSON.stringify({
    tick: store.getState().tick,
    credits: store.getState().credits,
    machines: store.getState().machines,
    routes: store.getState().routes,
    research: store.getState().research,
    store: store.getState().store,
  });

describe("save transfer (B-06)", () => {
  it("exports exactly the text the checkpoint writes", () => {
    const { storage, store } = buildYard(() => 1_000);
    expect(store.exportSave()).toBe(storage.raw.get(SAVE_KEY));
    expect(store.exportSave().startsWith('{"schemaVersion":1,')).toBe(true);
  });

  it("restores an identical yard in another store", () => {
    const { store } = buildYard(() => 1_000);
    const text = store.exportSave();
    const target = createStore({ storage: memoryStorage(), now: () => 5_000 });
    const before = target.getState().tick;
    const result = target.importSave(text);
    expect(result).toEqual({ ok: true, tick: store.getState().tick, machines: 1 });
    expect(target.getState().tick).toBe(store.getState().tick);
    expect(target.getState().tick).toBeGreaterThan(before);
    expect(JSON.stringify(target.getState().machines)).toBe(
      JSON.stringify(store.getState().machines)
    );
    expect(target.getState().machines[0].batchesDone).toBeGreaterThan(0);
    expect(target.getState().routes.length).toBe(1);
  });

  it("is idempotent: the same text applied twice changes nothing the second time", () => {
    const { store } = buildYard(() => 1_000);
    const text = store.exportSave();
    const target = createStore({ storage: memoryStorage(), now: () => 5_000 });
    expect(target.importSave(text).ok).toBe(true);
    const once = snapshot(target);
    expect(target.importSave(text).ok).toBe(true);
    expect(snapshot(target)).toBe(once);
  });

  it("takes the imported envelope's reference clock as this moment", () => {
    const { store } = buildYard(() => 1_000);
    const targetStorage = memoryStorage();
    const target = createStore({ storage: targetStorage, now: () => 5_000 });
    target.importSave(store.exportSave());
    const saved = JSON.parse(targetStorage.raw.get(SAVE_KEY) ?? "{}") as {
      payload?: SavePayload;
    };
    // The imported file carries the exporting device's stamp; applying it must not
    // stack two absence windows, so the stored reference is this device's clock.
    expect(saved.payload?.lastSeenMs).toBe(5_000);
    const reopened = createStore({ storage: targetStorage, now: () => 5_000 });
    expect(reopened.getReturnReport()).toBeNull();
  });

  it("keeps the running yard when the payload no longer matches its checksum", () => {
    const { store } = buildYard(() => 1_000);
    const target = createStore({ storage: memoryStorage(), now: () => 5_000 });
    const before = snapshot(target);
    // The envelope keeps the original checksum while the body moved, which is what
    // a truncated or hand-tampered file looks like after JSON.parse.
    const envelope = JSON.parse(store.exportSave()) as { payload: SavePayload };
    const tampered = JSON.stringify({
      schemaVersion: 1,
      checksum: checksum(JSON.stringify(envelope.payload)),
      payload: { ...envelope.payload, lastSeenMs: envelope.payload.lastSeenMs + 1 },
    });
    expect(target.importSave(tampered)).toEqual({ ok: false, reason: "checksum" });
    expect(snapshot(target)).toBe(before);
  });

  it("refuses a newer schema and unparseable text without touching state", () => {
    const { store } = buildYard(() => 1_000);
    const target = createStore({ storage: memoryStorage(), now: () => 5_000 });
    const before = snapshot(target);
    const body = JSON.stringify(JSON.parse(store.exportSave()).payload);
    expect(
      target.importSave(
        JSON.stringify({ schemaVersion: 99, checksum: checksum(body), payload: JSON.parse(body) })
      )
    ).toEqual({ ok: false, reason: "schema" });
    expect(target.importSave("rustwake")).toEqual({ ok: false, reason: "parse" });
    expect(target.importSave("")).toEqual({ ok: false, reason: "empty" });
    expect(snapshot(target)).toBe(before);
  });

  it("names the violated invariant when values are impossible", () => {
    const { store } = buildYard(() => 1_000);
    const envelope = JSON.parse(store.exportSave());
    envelope.payload.sim.store.scrap = -3;
    const body = JSON.stringify(envelope.payload);
    const text = JSON.stringify({ ...envelope, checksum: checksum(body) });
    const target = createStore({ storage: memoryStorage(), now: () => 5_000 });
    const before = snapshot(target);
    expect(target.importSave(text)).toEqual({ ok: false, reason: "invalid", detail: "store" });
    expect(snapshot(target)).toBe(before);
  });

  it("keeps the exported settings and applies them on import", () => {
    const { storage } = buildYard(() => 1_000);
    const writer = createStore({ storage, now: () => 1_000 });
    writer.setSettings({ ...DEFAULT_SETTINGS, muted: true, textScale: 1.5 });
    const reader = createStore({ storage: memoryStorage(), now: () => 4_000 });
    expect(reader.getSettings().textScale).toBe(1);
    expect(reader.importSave(writer.exportSave()).ok).toBe(true);
    expect(reader.getSettings()).toEqual({ muted: true, reducedMotion: false, textScale: 1.5 });
  });

  it("refuses to write from a follower tab", () => {
    const { store } = buildYard(() => 1_000);
    const shared = memoryStorage();
    // First tab claims the lease at this instant; the second one is a reader.
    createStore({ storage: shared, now: () => 1_000, leaseId: "t1" });
    const reader = createStore({ storage: shared, now: () => 1_000, leaseId: "t2" });
    expect(reader.getRole()).toBe("reader");
    const before = snapshot(reader);
    expect(reader.importSave(store.exportSave())).toEqual({ ok: false, reason: "read-only" });
    expect(snapshot(reader)).toBe(before);
  });
});
