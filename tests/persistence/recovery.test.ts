/**
 * G1 (#191): corrupt-boot legacy slot preservation.
 *
 * Pins the executive-contract guarantee that a decode failure never silently
 * resets a player's yard: the raw payload is retained verbatim in a parallel
 * recovery slot (or held in place in SAVE_KEY when the copy cannot be written),
 * a player-visible notice is exposed, recovery is transactional, repeated corrupt
 * boots are idempotent, and nothing is erased without a successful recovery or an
 * explicit player confirmation. Oversized-payload rejection is deliberately NOT
 * touched here — that is G2 (#148) territory.
 *
 * The adversarial envelopes reuse the pinned T02 fixtures (byte-for-byte); the
 * round-trip and quota cases construct envelopes from the real encode/checksum
 * path so the recovery transaction is exercised against genuine save bytes.
 *
 * G1 (#203): the retry transaction must also be honest when storage refuses the
 * slot clear AFTER the recovered yard landed — explicit partial success, the
 * write-once slot kept, and every later resolution path still lossless.
 */
import { describe, expect, it } from "vitest";
import {
  SAVE_KEY,
  DEFAULT_SETTINGS,
  checksum,
  decodeSave,
  encodeSave,
} from "../../src/game/persistence/save";
import { RECOVERY_KEY } from "../../src/game/persistence/recovery";
import { createStore } from "../../src/app/store";
import { createInitialState } from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { applyCommand } from "../../src/game/simulation/commands";
import { buildAllFixtures, LAST_SEEN_MS, type FixtureSpec } from "../legacy/fixtures-lib";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    raw: map,
  };
}

/** Storage whose setItem can be made to throw per key, to simulate quota pressure. */
function quotaStorage(fail: { recovery?: boolean; save?: boolean } = {}) {
  const map = new Map<string, string>();
  const flags = { recovery: false, save: false, ...fail };
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === RECOVERY_KEY && flags.recovery) throw new Error("quota: recovery");
      if (key === SAVE_KEY && flags.save) throw new Error("quota: save");
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    raw: map,
    flags,
  };
}

/**
 * Storage whose recovery-slot clear can be refused at runtime (#203). With
 * `withRemoveItem` the refusal throws from removeItem; without it, removeItem is
 * absent so clearRecoverySlot falls back to an empty write, which then throws.
 * Only RECOVERY_KEY is affected — SAVE_KEY writes and clears stay healthy.
 */
function clearRefusalStorage(withRemoveItem = true) {
  const map = new Map<string, string>();
  const flags = { clear: false };
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!withRemoveItem && key === RECOVERY_KEY && flags.clear) throw new Error("refused: recovery clear");
      map.set(key, value);
    },
    removeItem: undefined as ((key: string) => void) | undefined,
    raw: map,
    flags,
  };
  if (withRemoveItem) {
    storage.removeItem = (key: string) => {
      if (key === RECOVERY_KEY && flags.clear) throw new Error("refused: recovery clear");
      map.delete(key);
    };
  }
  return storage;
}

function yardText(ticks = 60): string {
  const sim = createInitialState();
  for (let i = 0; i < 6; i += 1) applyCommand(sim, { id: `s${i}`, type: "manual.salvage" });
  advance(sim, ticks);
  return encodeSave(sim, LAST_SEEN_MS, { ...DEFAULT_SETTINGS });
}

function tamperChecksum(text: string): string {
  const env = JSON.parse(text) as { checksum: string; payload: unknown };
  const real = checksum(JSON.stringify(env.payload));
  env.checksum = real === "00000000" ? "00000001" : "00000000";
  return JSON.stringify(env);
}

function repairChecksum(text: string): string {
  const env = JSON.parse(text) as { checksum: string; payload: unknown };
  env.checksum = checksum(JSON.stringify(env.payload));
  return JSON.stringify(env);
}

function fixture(name: string): FixtureSpec {
  const f = buildAllFixtures().find((x) => x.name === name);
  if (!f) throw new Error(`missing fixture ${name}`);
  return f;
}

const REJECTS = [
  "bad-checksum",
  "bad-truncated",
  "bad-duplicate-id",
  "bad-negative-store",
  "bad-schema",
];

describe("G1 corrupt-boot preservation (#191)", () => {
  it.each(REJECTS)("preserves %s verbatim with a matching notice", (name) => {
    const f = fixture(name);
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, f.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    // The fresh yard is only a fallback; the raw bytes survive in the slot.
    expect(store.getState().tick).toBe(0);
    const notice = store.getSaveRecovery();
    expect(notice).not.toBeNull();
    expect(notice?.slotKey).toBe(RECOVERY_KEY);
    expect(notice?.reason).toBe(f.expectedReason);
    if (f.expectedDetail !== undefined) expect(notice?.detail).toBe(f.expectedDetail);
    expect(notice?.preserved).toBe(true);
    expect(notice?.textLength).toBe(f.text.length);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(f.text);
    expect(store.exportSaveRecovery()).toBe(f.text);
    store.stop();
  });

  it("boots a fresh yard but never overwrites the preserved slot while playing", () => {
    const f = fixture("bad-checksum");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, f.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    store.dispatch({ id: "a", type: "manual.salvage" });
    store.step(120);
    store.setSettings({ muted: true });
    expect(storage.raw.get(RECOVERY_KEY)).toBe(f.text);
    expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    expect(store.getSaveRecovery()?.preserved).toBe(true);
    store.stop();
  });

  it("is idempotent: repeated corrupt boots do not degrade the slot", () => {
    const f = fixture("bad-truncated");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, f.text);
    for (let i = 0; i < 4; i += 1) {
      const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
      expect(storage.raw.get(RECOVERY_KEY)).toBe(f.text);
      expect(store.getSaveRecovery()?.reason).toBe(f.expectedReason);
      expect(store.exportSaveRecovery()).toBe(f.text);
      store.step(30); // a fresh yard checkpoint lands in SAVE_KEY, never the slot
      store.stop();
    }
    expect(storage.raw.get(RECOVERY_KEY)).toBe(f.text);
  });

  it("holds the payload in place across reloads when the copy keeps failing", () => {
    const f = fixture("bad-checksum");
    const storage = quotaStorage({ recovery: true });
    storage.setItem(SAVE_KEY, f.text);
    for (let i = 0; i < 3; i += 1) {
      const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
      const notice = store.getSaveRecovery();
      expect(notice?.preserved).toBe(false);
      expect(notice?.reason).toBe(f.expectedReason);
      expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
      expect(storage.raw.get(SAVE_KEY)).toBe(f.text);
      store.step(60);
      store.dispatch({ id: `d${i}`, type: "manual.salvage" });
      // Writes are suppressed so the only copy of the raw payload survives.
      expect(storage.raw.get(SAVE_KEY)).toBe(f.text);
      expect(store.exportSaveRecovery()).toBe(f.text);
      store.stop();
    }
  });
});

describe("G1 recovery round-trip (#191)", () => {
  it("retry adopts a decodable recovery slot transactionally and clears it", () => {
    const storage = memoryStorage();
    const recovered = yardText(90);
    storage.setItem(RECOVERY_KEY, recovered);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const result = store.retrySaveRecovery();
    expect(result.ok).toBe(true);
    const decoded = decodeSave(recovered);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(store.getState().tick).toBe(decoded.payload.sim.tick);
      expect(store.getState().machines.length).toBe(decoded.payload.sim.machines.length);
    }
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    expect(store.getSaveRecovery()).toBeNull();
    const tick = store.getState().tick;
    store.stop();
    const reopened = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(reopened.getState().tick).toBe(tick);
    expect(reopened.getSaveRecovery()).toBeNull();
    reopened.stop();
  });

  it("retry on a genuinely corrupt slot fails and keeps the bytes", () => {
    const f = fixture("bad-checksum");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, f.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const before = store.getState();
    const result = store.retrySaveRecovery();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(f.expectedReason);
    expect(store.getState()).toBe(before);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(f.text);
    expect(store.getSaveRecovery()).not.toBeNull();
    store.stop();
  });

  it("supports the player journey: export raw, repair, import, then discard", () => {
    const valid = yardText(75);
    const corrupt = tamperChecksum(valid);
    expect(decodeSave(corrupt).ok).toBe(false);
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, corrupt);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getSaveRecovery()?.reason).toBe("checksum");
    const raw = store.exportSaveRecovery();
    expect(raw).toBe(corrupt);
    const repaired = repairChecksum(raw as string);
    expect(repaired).toBe(valid);
    expect(store.importSave(repaired).ok).toBe(true);
    expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    // The corrupt slot is retained until the player explicitly discards it.
    expect(storage.raw.get(RECOVERY_KEY)).toBe(corrupt);
    expect(store.getSaveRecovery()?.preserved).toBe(true);
    store.discardSaveRecovery();
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    expect(store.getSaveRecovery()).toBeNull();
    const tick = store.getState().tick;
    store.stop();
    const reopened = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(reopened.getState().tick).toBe(tick);
    expect(reopened.getSaveRecovery()).toBeNull();
    reopened.stop();
  });

  it("retry refuses a storage failure and keeps the slot (write-before-clear)", () => {
    const storage = quotaStorage({ save: true });
    const recovered = yardText(45);
    storage.setItem(RECOVERY_KEY, recovered);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const before = store.getState();
    const result = store.retrySaveRecovery();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("storage");
    expect(store.getState()).toBe(before);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(recovered);
    expect(storage.raw.get(SAVE_KEY)).toBeUndefined();
    store.stop();
  });

  it("recovers a held payload via export, import and explicit discard", () => {
    const f = fixture("bad-checksum");
    const storage = quotaStorage({ recovery: true });
    storage.setItem(SAVE_KEY, f.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getSaveRecovery()?.preserved).toBe(false);
    store.step(120);
    expect(storage.raw.get(SAVE_KEY)).toBe(f.text);
    const raw = store.exportSaveRecovery();
    expect(raw).toBe(f.text);
    expect(store.importSave(repairChecksum(raw as string)).ok).toBe(true);
    // Persist is still suppressed, so the held corrupt raw is untouched...
    expect(storage.raw.get(SAVE_KEY)).toBe(f.text);
    // ...until the player confirms discarding it; then checkpoints resume.
    store.discardSaveRecovery();
    expect(store.getSaveRecovery()).toBeNull();
    store.step(30);
    expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    store.stop();
  });
});

describe("G1 discard and multi-tab semantics (#191)", () => {
  it("discard erases the slot only on confirmation and leaves a healthy yard", () => {
    const f = fixture("bad-schema");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, f.text);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    store.step(10);
    const healthy = storage.raw.get(SAVE_KEY);
    store.discardSaveRecovery();
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    expect(storage.raw.get(SAVE_KEY)).toBe(healthy);
    expect(store.getSaveRecovery()).toBeNull();
    store.stop();
  });

  it("a follower sees the notice but cannot act; owner resolution clears it", () => {
    const f = fixture("bad-checksum");
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, f.text);
    const owner = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "owner" });
    const follower = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "follower" });
    expect(owner.getRole()).toBe("writer");
    expect(follower.getRole()).toBe("reader");
    expect(follower.getSaveRecovery()?.reason).toBe(f.expectedReason);
    expect(follower.retrySaveRecovery()).toEqual({ ok: false, reason: "read-only" });
    follower.discardSaveRecovery();
    expect(storage.raw.get(RECOVERY_KEY)).toBe(f.text);
    owner.discardSaveRecovery();
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    follower.takeOver();
    expect(follower.getSaveRecovery()).toBeNull();
    owner.stop();
    follower.stop();
  });

  it("reconcile preserves an externally corrupted checkpoint write-once", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, yardText(20));
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getSaveRecovery()).toBeNull();
    const corrupt = tamperChecksum(yardText(50));
    storage.setItem(SAVE_KEY, corrupt);
    store.takeOver();
    expect(storage.raw.get(RECOVERY_KEY)).toBe(corrupt);
    expect(store.getSaveRecovery()?.reason).toBe("checksum");
    store.stop();
  });

  it("a failed manual import creates no recovery slot", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, yardText(20));
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const before = store.getState();
    const result = store.importSave(fixture("bad-duplicate-id").text);
    expect(result.ok).toBe(false);
    expect(store.getState()).toBe(before);
    expect(store.getSaveRecovery()).toBeNull();
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    store.stop();
  });

  it("never overwrites an occupied slot: both corruptions survive sequential resolution", () => {
    const a = fixture("bad-checksum").text;
    const b = tamperChecksum(yardText(80));
    const storage = memoryStorage();
    storage.setItem(RECOVERY_KEY, a);
    storage.setItem(SAVE_KEY, b);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(storage.raw.get(RECOVERY_KEY)).toBe(a);
    expect(storage.raw.get(SAVE_KEY)).toBe(b);
    expect(store.getSaveRecovery()?.preserved).toBe(false);
    expect(store.exportSaveRecovery()).toBe(a);
    const retry = store.retrySaveRecovery();
    expect(retry.ok).toBe(false);
    expect(storage.raw.get(SAVE_KEY)).toBe(b);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(a);
    store.discardSaveRecovery();
    expect(storage.raw.get(SAVE_KEY)).toBeUndefined();
    expect(storage.raw.get(RECOVERY_KEY)).toBe(a);
    expect(store.getSaveRecovery()?.preserved).toBe(true);
    store.discardSaveRecovery();
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    expect(store.getSaveRecovery()).toBeNull();
    store.stop();
  });

  it("introduces no payload size cap: a large corrupt payload is preserved verbatim", () => {
    const env = JSON.parse(yardText(60)) as { payload: { sim: Record<string, unknown> } };
    env.payload.sim.note = "x".repeat(200_000);
    const corrupt = tamperChecksum(JSON.stringify(env));
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, corrupt);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getSaveRecovery()?.textLength).toBe(corrupt.length);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(corrupt);
    expect(store.exportSaveRecovery()).toBe(corrupt);
    store.stop();
  });
});

describe("G1 retry slot-clear failure (#203)", () => {
  it("surfaces a refused removeItem: yard durable, slot byte-intact, retry heals", () => {
    const storage = clearRefusalStorage();
    const recovered = yardText(90);
    storage.setItem(RECOVERY_KEY, recovered);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    storage.flags.clear = true;
    const result = store.retrySaveRecovery();
    // Explicit partial success: the yard landed durably, the clear did not.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slotClearFailed).toBe(true);
    const decoded = decodeSave(recovered);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(store.getState().tick).toBe(decoded.payload.sim.tick);
      expect(store.getState().machines.length).toBe(decoded.payload.sim.machines.length);
      expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    }
    // The write-once slot survives verbatim; export stays byte-exact. A decodable
    // slot raises no notice (pinned invariant), so the result flag is the surface.
    expect(storage.raw.get(RECOVERY_KEY)).toBe(recovered);
    expect(store.exportSaveRecovery()).toBe(recovered);
    expect(store.getSaveRecovery()).toBeNull();
    // Once storage heals, a second retry completes fully and clears the slot.
    storage.flags.clear = false;
    const healed = store.retrySaveRecovery();
    expect(healed).toEqual({
      ok: true,
      tick: store.getState().tick,
      machines: store.getState().machines.length,
    });
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    expect(store.getSaveRecovery()).toBeNull();
    const tick = store.getState().tick;
    store.stop();
    const reopened = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(reopened.getState().tick).toBe(tick);
    expect(reopened.getSaveRecovery()).toBeNull();
    reopened.stop();
  });

  it("surfaces a refused empty-write fallback on a minimal double without removeItem", () => {
    const storage = clearRefusalStorage(false);
    const recovered = yardText(45);
    storage.setItem(RECOVERY_KEY, recovered);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    storage.flags.clear = true;
    const result = store.retrySaveRecovery();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slotClearFailed).toBe(true);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(recovered);
    expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    expect(store.exportSaveRecovery()).toBe(recovered);
    // Healed: the empty-write fallback reads as an absent slot afterwards.
    storage.flags.clear = false;
    const healed = store.retrySaveRecovery();
    expect(healed.ok).toBe(true);
    if (healed.ok) expect(healed.slotClearFailed).toBeUndefined();
    expect(storage.raw.get(RECOVERY_KEY)).toBe("");
    expect(store.exportSaveRecovery()).toBeNull();
    expect(store.getSaveRecovery()).toBeNull();
    store.stop();
  });

  it("keeps the live yard writable and repeated refused retries lossless", () => {
    const storage = clearRefusalStorage();
    const recovered = yardText(60);
    storage.setItem(RECOVERY_KEY, recovered);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    storage.flags.clear = true;
    expect(store.retrySaveRecovery().ok).toBe(true);
    // The recovered yard is live, not held: checkpoints keep landing in SAVE_KEY.
    store.step(120);
    store.dispatch({ id: "a", type: "manual.salvage" });
    const live = storage.raw.get(SAVE_KEY);
    expect(decodeSave(live ?? null).ok).toBe(true);
    expect(store.getState().tick).toBeGreaterThanOrEqual(180);
    // Repeated refused retries never degrade the slot nor silently succeed.
    for (let i = 0; i < 3; i += 1) {
      const again = store.retrySaveRecovery();
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.slotClearFailed).toBe(true);
      expect(storage.raw.get(RECOVERY_KEY)).toBe(recovered);
      expect(store.exportSaveRecovery()).toBe(recovered);
    }
    expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    store.stop();
  });

  it("a residual slot still forces held mode on a later corruption; resolution stays lossless", () => {
    const storage = clearRefusalStorage();
    const recovered = yardText(90);
    storage.setItem(RECOVERY_KEY, recovered);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    storage.flags.clear = true;
    const first = store.retrySaveRecovery();
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.slotClearFailed).toBe(true);
    // A newer external corruption lands in SAVE_KEY while the slot is occupied.
    const newer = tamperChecksum(yardText(80));
    storage.setItem(SAVE_KEY, newer);
    store.takeOver();
    expect(storage.raw.get(RECOVERY_KEY)).toBe(recovered); // write-once, never overwritten
    expect(storage.raw.get(SAVE_KEY)).toBe(newer); // held in place
    const notice = store.getSaveRecovery();
    expect(notice?.preserved).toBe(false);
    expect(notice?.reason).toBe("checksum");
    // The double-corruption guard refuses the slot retry; nothing changes.
    expect(store.retrySaveRecovery()).toEqual({ ok: false, reason: "storage", detail: "save-key-corrupt" });
    expect(storage.raw.get(SAVE_KEY)).toBe(newer);
    expect(store.exportSaveRecovery()).toBe(recovered);
    // Confirmed discard erases only the held corruption; the slot re-surfaces.
    store.discardSaveRecovery();
    expect(storage.raw.get(SAVE_KEY)).toBeUndefined();
    expect(storage.raw.get(RECOVERY_KEY)).toBe(recovered);
    // The residual slot is decodable, so no notice remains; a healed retry resolves it.
    expect(store.getSaveRecovery()).toBeNull();
    storage.flags.clear = false;
    const healed = store.retrySaveRecovery();
    expect(healed.ok).toBe(true);
    if (healed.ok) expect(healed.slotClearFailed).toBeUndefined();
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    expect(decodeSave(storage.raw.get(SAVE_KEY) ?? null).ok).toBe(true);
    store.stop();
  });
});
