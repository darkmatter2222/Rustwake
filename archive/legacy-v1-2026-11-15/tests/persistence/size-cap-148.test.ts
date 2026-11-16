/**
 * G2 (#148): bounded-size rejection before JSON.parse (E08 "oversized").
 *
 * The contract ("Saves and migration") requires bounded sizes to be validated
 * before importing/migrating; T02 (#129) and the G1 fix (#191/#203) deliberately
 * left this gap to #148. These tests prove the cap is enforced at the one decode
 * gate every path shares (boot, manual import, reconcile, recovery retry), that
 * the boundary is exact, and that a refusal changes NOTHING: a rejected import
 * keeps the live yard byte-identical, and an oversized boot retains the raw
 * payload in the G1 recovery slot instead of silently resetting the player.
 *
 * Non-vision evidence: numeric/byte assertions only.
 */
import { describe, expect, it } from "vitest";
import {
  checksum,
  decodeSave,
  encodeSave,
  MAX_SAVE_TEXT_LENGTH,
  SAVE_KEY,
  DEFAULT_SETTINGS,
} from "../../src/game/persistence/save";
import { RECOVERY_KEY } from "../../src/game/persistence/recovery";
import { createStore, type StoreOptions } from "../../src/app/store";
import { createInitialState } from "../../src/game/simulation/types";

const LAST_SEEN_MS = 1_700_000_000_000;

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

/** A healthy retuned-seed envelope (#214: scrap 120 / ferrous 12 / steel 12, credits 60). */
function yardText(): string {
  return encodeSave(createInitialState(), LAST_SEEN_MS, { ...DEFAULT_SETTINGS });
}

/** Pad a valid envelope with JSON-ignorable trailing whitespace to an exact length. */
function paddedTo(text: string, length: number): string {
  expect(text.length).toBeLessThanOrEqual(length);
  return text + " ".repeat(length - text.length);
}

describe("G2 decode size cap (#148)", () => {
  it("refuses text one character over the cap before parsing", () => {
    const oversized = paddedTo(yardText(), MAX_SAVE_TEXT_LENGTH + 1);
    expect(oversized.length).toBe(MAX_SAVE_TEXT_LENGTH + 1);
    // Parseable JSON, valid checksum — refused for SIZE alone, ahead of parse.
    expect(decodeSave(oversized)).toEqual({ ok: false, reason: "oversized" });
    // Unparseable hostile bulk is likewise refused for size, not "parse".
    expect(decodeSave("x".repeat(MAX_SAVE_TEXT_LENGTH + 1))).toEqual({
      ok: false,
      reason: "oversized",
    });
  });

  it("accepts an envelope exactly at the cap (boundary is inclusive)", () => {
    const atCap = paddedTo(yardText(), MAX_SAVE_TEXT_LENGTH);
    expect(atCap.length).toBe(MAX_SAVE_TEXT_LENGTH);
    const decoded = decodeSave(atCap);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.payload.sim.credits).toBe(60);
      expect(decoded.payload.sim.store).toEqual({ scrap: 120, ferrous: 12, steel: 12 });
    }
  });

  it("refuses a checksum-valid envelope whose payload alone exceeds the cap", () => {
    const env = JSON.parse(yardText()) as {
      schemaVersion: number;
      checksum: string;
      payload: { sim: Record<string, unknown>; lastSeenMs: number; settings: unknown };
    };
    env.payload.sim.note = "x".repeat(MAX_SAVE_TEXT_LENGTH);
    env.checksum = checksum(JSON.stringify(env.payload));
    const text = JSON.stringify(env);
    expect(text.length).toBeGreaterThan(MAX_SAVE_TEXT_LENGTH);
    // Integrity passes; the size gate still refuses it.
    expect(decodeSave(text)).toEqual({ ok: false, reason: "oversized" });
  });

  it("keeps the empty/parse refusals unchanged below the cap", () => {
    expect(decodeSave(null)).toEqual({ ok: false, reason: "empty" });
    expect(decodeSave("")).toEqual({ ok: false, reason: "empty" });
    expect(decodeSave("not json")).toEqual({ ok: false, reason: "parse" });
  });
});

describe("G2 oversized manual import changes nothing (#148, E08)", () => {
  it("leaves the live yard and the persisted bytes byte-identical", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, yardText());
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    expect(store.getRole()).toBe("writer");
    const before = store.getState();
    const rawBefore = storage.raw.get(SAVE_KEY);

    const oversized = paddedTo(yardText(), MAX_SAVE_TEXT_LENGTH + 1);
    expect(store.importSave(oversized)).toEqual({ ok: false, reason: "oversized" });
    // Identity, not just equality: the refused file never swapped the state.
    expect(store.getState()).toBe(before);
    expect(storage.raw.get(SAVE_KEY)).toBe(rawBefore);
    expect(store.getSaveRecovery()).toBeNull(); // a failed import creates no slot
    store.stop();
  });

  it("refuses oversized text on a reader tab too (decode precedes the role gate)", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, yardText());
    const writer = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const reader = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-b" });
    expect(reader.getRole()).toBe("reader");
    const before = reader.getState();
    expect(reader.importSave(paddedTo(yardText(), MAX_SAVE_TEXT_LENGTH + 1))).toEqual({
      ok: false,
      reason: "oversized",
    });
    expect(reader.getState()).toBe(before);
    reader.stop();
    writer.stop();
  });

  it("imports an envelope exactly at the cap through the real path", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const result = store.importSave(paddedTo(yardText(), MAX_SAVE_TEXT_LENGTH));
    expect(result.ok).toBe(true);
    expect(store.getState().credits).toBe(60);
    store.stop();
  });
});

describe("G2 oversized boot retains the raw payload (G1 slot, #148/#191)", () => {
  it("preserves the exact bytes, raises an oversized notice, and retry keeps the slot", () => {
    const raw = paddedTo(yardText(), MAX_SAVE_TEXT_LENGTH + 1);
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });

    // Fresh yard fallback (never a silent loss: the raw is retained below).
    expect(store.getState().tick).toBe(0);
    expect(store.getState().credits).toBe(60);
    const notice = store.getSaveRecovery();
    expect(notice?.reason).toBe("oversized");
    expect(notice?.textLength).toBe(raw.length);
    expect(notice?.preserved).toBe(true);
    expect(storage.raw.get(RECOVERY_KEY)).toBe(raw);
    expect(store.exportSaveRecovery()).toBe(raw);

    // Retry cannot decode an oversized payload: nothing changes, slot kept.
    expect(store.retrySaveRecovery()).toEqual({ ok: false, reason: "oversized" });
    expect(storage.raw.get(RECOVERY_KEY)).toBe(raw);
    expect(store.getSaveRecovery()?.reason).toBe("oversized");

    // Explicit player confirmation clears the slot.
    store.discardSaveRecovery();
    expect(storage.raw.get(RECOVERY_KEY)).toBeUndefined();
    expect(store.getSaveRecovery()).toBeNull();
    store.stop();
  });

  it("holds SAVE_KEY in place when the recovery copy is refused (near-quota)", () => {
    const raw = paddedTo(yardText(), MAX_SAVE_TEXT_LENGTH + 1);
    const base = memoryStorage();
    const storage: NonNullable<StoreOptions["storage"]> & { raw: Map<string, string> } = {
      getItem: base.getItem,
      removeItem: base.removeItem,
      setItem: (key, value) => {
        // The origin is near quota: the parallel copy of the bulk fails.
        if (key === RECOVERY_KEY) throw new Error("quota");
        base.setItem(key, value);
      },
      raw: base.raw,
    };
    storage.setItem(SAVE_KEY, raw);
    const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId: "tab-a" });
    const notice = store.getSaveRecovery();
    expect(notice?.reason).toBe("oversized");
    expect(notice?.preserved).toBe(false);
    // Held: the original survives verbatim in SAVE_KEY and writes are suppressed.
    expect(storage.raw.get(SAVE_KEY)).toBe(raw);
    expect(store.retrySaveRecovery()).toEqual({ ok: false, reason: "oversized" });
    expect(storage.raw.get(SAVE_KEY)).toBe(raw);
    expect(store.exportSaveRecovery()).toBe(raw);
    store.stop();
  });
});
