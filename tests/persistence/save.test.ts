import { describe, expect, it } from "vitest";
import {
  SAVE_KEY,
  DEFAULT_SETTINGS,
  checksum,
  decodeSave,
  encodeSave,
  validateSim,
} from "../../src/game/persistence/save";
import { createInitialState } from "../../src/game/simulation/types";
import { TUNING } from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import { applyCommand } from "../../src/game/simulation/commands";
import { createStore } from "../../src/app/store";

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

describe("save envelope", () => {
  it("round-trips an initial state", () => {
    const state = createInitialState();
    const text = encodeSave(state, 1234, DEFAULT_SETTINGS);
    const result = decodeSave(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.lastSeenMs).toBe(1234);
      expect(result.payload.sim.tick).toBe(0);
      expect(result.payload.settings.muted).toBe(false);
    }
  });

  it("round-trips a progressed state", () => {
    const state = createInitialState();
    for (let i = 0; i < 6; i += 1) {
      applyCommand(state, { id: `p${i}`, type: "manual.salvage" });
      advance(state, 6);
    }
    applyCommand(state, { id: "rep", type: "drone.repair" });
    advance(state, 120);
    const result = decodeSave(encodeSave(state, 999, { ...DEFAULT_SETTINGS, muted: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sim.drone.repaired).toBe(true);
      expect(result.payload.sim.tick).toBe(state.tick);
      expect(result.payload.sim.store["scrap"]).toBe(state.store["scrap"]);
    }
  });

  it("detects a corrupted payload", () => {
    const text = encodeSave(createInitialState(), 1, DEFAULT_SETTINGS);
    const broken = text.replace('"storeUnits":0', '"storeUnits":1');
    expect(decodeSave(broken)).toEqual({ ok: false, reason: "checksum" });
  });

  it("rejects an unsupported schema and unusable text", () => {
    expect(decodeSave(null)).toEqual({ ok: false, reason: "empty" });
    expect(decodeSave("not json")).toEqual({ ok: false, reason: "parse" });
    expect(decodeSave('{"schemaVersion":99,"checksum":"00000000","payload":{}}')).toEqual({
      ok: false,
      reason: "schema",
    });
  });

  it("is checksum-stable for identical content", () => {
    expect(checksum("rustwake")).toBe(checksum("rustwake"));
    expect(checksum("a")).not.toBe(checksum("b"));
  });

  it("names the first violated invariant for invalid states", () => {
    const state = createInitialState();
    expect(validateSim(state)).toBeNull();
    expect(validateSim({ ...state, tick: -1 })).toBe("tick");
    expect(validateSim({ ...state, credits: Number.NaN })).toBe("credits");
    expect(validateSim({ ...state, store: { scrap: -3 } })).toBe("store");
    expect(validateSim({ ...state, machines: [{ id: 1 }] })).toBe("blueprint:1");
  });
});

describe("storage adapter", () => {
  it("restores progress and applies one capped catch-up window", () => {
    const storage = memoryStorage();
    const first = createStore({ storage, now: () => 1_000 });
    for (let i = 0; i < 6; i += 1) {
      first.dispatch({ id: `a${i}`, type: "manual.salvage" });
      first.step(TUNING.manualPulseTicks);
    }
    first.dispatch({ id: "repair", type: "drone.repair" });
    first.step(60);
    const saved = storage.raw.get(SAVE_KEY);
    expect(saved).toBeTruthy();

    const reopened = createStore({ storage, now: () => 1_000 + 3_600_000 });
    const state = reopened.getState();
    expect(state.drone.repaired).toBe(true);
    expect(state.tick).toBeGreaterThan(60);
    const report = reopened.getReturnReport();
    expect(report?.creditedTicks).toBe(3_600_000 / 100);
    // The clock reference moved, so a second load cannot re-credit the window.
    const again = createStore({ storage, now: () => 1_000 + 3_600_000 });
    expect(again.getState().tick).toBe(state.tick);
  });

  it("stamps the save with the shared wall clock, not the page timeline", () => {
    const storage = memoryStorage();
    const store = createStore({ storage });
    store.dispatch({ id: "w1", type: "manual.salvage" });
    const saved = JSON.parse(storage.raw.get(SAVE_KEY) ?? "{}") as {
      payload?: { lastSeenMs?: number; sim?: { tick?: number } };
    };
    // A page-relative `performance.now()` would restart at 0 on every reload and
    // silently cancel offline credit, so the stored reference must be epoch ms.
    expect(saved.payload?.lastSeenMs).toBeGreaterThan(1_000_000_000_000);
    expect(saved.payload?.sim?.tick).toBe(0);
  });

  it("starts a fresh session when the stored envelope is unusable", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "{ broken");
    const store = createStore({ storage, now: () => 500 });
    expect(store.getState().tick).toBe(0);
    expect(store.getReturnReport()).toBeNull();
  });
});
