import { describe, expect, it } from "vitest";
import { createStore, type GameStore } from "../../src/app/store";
import { SAVE_KEY } from "../../src/game/persistence/save";
import { LEASE_KEY, LEASE_TTL_MS, createLease } from "../../src/game/persistence/lease";
import { TUNING } from "../../src/game/content/defs";

interface TrackedStorage {
  readonly raw: Map<string, string>;
  readonly writes: Map<string, number>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function memoryStorage(): TrackedStorage {
  const raw = new Map<string, string>();
  const writes = new Map<string, number>();
  return {
    raw,
    writes,
    getItem: (key: string) => (raw.has(key) ? (raw.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      raw.set(key, value);
      writes.set(key, (writes.get(key) ?? 0) + 1);
    },
    removeItem: (key: string) => {
      raw.delete(key);
    },
  };
}

/** Two completed manual pulses, one per cooldown window. */
function salvageTwice(store: GameStore, id: string) {
  for (let i = 1; i <= 2; i += 1) {
    store.dispatch({ id: `${id}-${i}`, type: "manual.salvage" });
    store.step(TUNING.manualPulseTicks);
  }
}

describe("multi-tab lease", () => {
  it("gives the lease to the first claimant and keeps the record small", () => {
    const storage = memoryStorage();
    let clock = 100;
    const first = createLease(storage, () => clock, "tab-a");
    expect(first.claim(0)).toBe("writer");
    const record = storage.raw.get(LEASE_KEY);
    expect(record).toContain('"owner":"tab-a"');
    expect(record).toContain('"revision":0');

    const second = createLease(storage, () => clock, "tab-b");
    expect(second.claim(0)).toBe("reader");

    // A live owner is not displaced before the heartbeat window closes.
    clock = 100 + LEASE_TTL_MS - 1;
    expect(second.claim(0)).toBe("reader");
    clock = 100 + LEASE_TTL_MS;
    expect(second.claim(7)).toBe("writer");
    expect(second.peek()?.owner).toBe("tab-b");
    expect(second.peek()?.revision).toBe(7);
  });

  it("releases a claim so the next tab owns it immediately", () => {
    const storage = memoryStorage();
    let clock = 0;
    const first = createLease(storage, () => clock, "tab-a");
    const second = createLease(storage, () => clock, "tab-b");
    expect(first.claim(0)).toBe("writer");
    expect(second.claim(0)).toBe("reader");
    first.release();
    expect(storage.raw.has(LEASE_KEY)).toBe(false);
    expect(second.claim(3)).toBe("writer");
    expect(second.role()).toBe("writer");
  });

  it("treats a corrupt lease record as absent", () => {
    const storage = memoryStorage();
    storage.setItem(LEASE_KEY, "{ not json");
    const lease = createLease(storage, () => 5, "tab-a");
    expect(lease.peek()).toBeNull();
    expect(lease.claim(0)).toBe("writer");
  });

  it("keeps one writer: the follower never writes the save", () => {
    const storage = memoryStorage();
    let clock = 10;
    const writer = createStore({ storage, now: () => clock, leaseId: "tab-a" });
    expect(writer.getRole()).toBe("writer");
    salvageTwice(writer, "a");
    const saveWrites = storage.writes.get(SAVE_KEY) ?? 0;
    expect(saveWrites).toBeGreaterThan(0);

    const follower = createStore({ storage, now: () => clock, leaseId: "tab-b" });
    expect(follower.getRole()).toBe("reader");
    follower.step(300);
    expect(storage.writes.get(SAVE_KEY)).toBe(saveWrites);
    // It loaded the owner's snapshot and its own step advanced nothing.
    expect(follower.getState().tick).toBe(writer.getState().tick);
  });

  it("mirrors the owner's snapshot instead of running a second economy", () => {
    const storage = memoryStorage();
    let clock = 10;
    const writer = createStore({ storage, now: () => clock, leaseId: "tab-a" });
    const follower = createStore({ storage, now: () => clock, leaseId: "tab-b" });
    salvageTwice(writer, "a");
    writer.step(300);

    follower.step(0);
    expect(follower.getState().tick).toBe(writer.getState().tick);
    expect(follower.getState().revision).toBe(writer.getState().revision);
    expect(follower.getState().store["scrap"]).toBe(writer.getState().store["scrap"]);

    // A second owner would double the pulse cadence, so it is refused first.
    const rejected = follower.dispatch({ id: "b-1", type: "manual.salvage" });
    expect(rejected).toEqual({ ok: false, reason: "read-only" });
    expect(follower.getState().revision).toBe(writer.getState().revision);
  });

  it("hands over after the heartbeat lapses and demotes the old owner", () => {
    const storage = memoryStorage();
    let clock = 10;
    const first = createStore({ storage, now: () => clock, leaseId: "tab-a" });
    salvageTwice(first, "a");
    first.step(240);
    const ownerTick = first.getState().tick;

    const second = createStore({ storage, now: () => clock, leaseId: "tab-b" });
    expect(second.getRole()).toBe("reader");
    expect(second.takeOver()).toBe("reader");

    clock += LEASE_TTL_MS + 1;
    expect(second.takeOver()).toBe("writer");
    // Takeover continues from the ledger it adopted, not from a fresh yard.
    expect(second.getState().tick).toBe(ownerTick);
    expect(second.getState().revision).toBe(first.getState().revision);
    expect(second.getState().store["scrap"]).toBe(10);

    second.step(60);
    expect(second.getState().tick).toBe(ownerTick + 60);
    // The previous owner sees the live lease and steps back down.
    first.step(1);
    expect(first.getRole()).toBe("reader");
    expect(first.getState().tick).toBe(ownerTick + 60);
  });

  it("loads a valid save even when the lease record is damaged", () => {
    const storage = memoryStorage();
    const first = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    salvageTwice(first, "a");
    storage.setItem(LEASE_KEY, "{{{");

    const second = createStore({ storage, now: () => 10, leaseId: "tab-b" });
    expect(second.getRole()).toBe("writer");
    expect(second.getState().store["scrap"]).toBe(10);
  });
});
