import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createStore } from "../../src/app/store";
import { applyCommand, type Command } from "../../src/game/simulation/commands";
import { createInitialState } from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, SAVE_KEY, encodeSave, decodeSave } from "../../src/game/persistence/save";

/**
 * UI-RESET-64 regression: command-id uniqueness across reloads.
 *
 * `seenCommands` is persisted SimState and is never pruned; `applyCommand`
 * dedupes a repeated id to `{ok:true, revision:seen}` WITHOUT executing. The
 * App's old module-level counter restarted at c1 on every page load, so after
 * any reload the first N dispatches collided with the save's c1..cN and
 * silently no-oped (coordinator-verified bug, decision 6832499377). The fix is
 * a unique per-load epoch prefix in App.tsx's `nextCommandId`; the dedup
 * mechanism itself is untouched.
 *
 * These tests prove, through the REAL App and the game's OWN engine/save:
 *  (a) the first command after a simulated reload EXECUTES (collision fixed);
 *  (b) a genuine same-id retry still dedups idempotently (within-session and
 *      across the save round-trip), so the dedup contract is preserved.
 *
 * The reload is simulated the way the browser does it: `vi.resetModules()` +
 * a fresh dynamic import gives App a brand-new module instance (fresh epoch),
 * the shared storage carries the persisted save, and the wall clock moves past
 * the lease TTL so the new tab adopts the save as writer and runs the game's
 * own inline offline catch-up — exactly the probe's advanceTime reload path.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom ships no 2D canvas; a write-only proxy lets the real paint loop run. */
const writeOnlyContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (prop === "canvas" ? undefined : () => undefined),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(writeOnlyContext);
  try {
    globalThis.localStorage?.removeItem("rustwake.onboard.v1");
  } catch {
    /* jsdom storage is present; ignore a blocked clear. */
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

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

const findButton = (label: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;

const primary = () => document.querySelector<HTMLButtonElement>(".dock__btn--primary");

/** A fresh yard with room to pay, seeded through the game's own encoder. */
function seededStorage(clockMs: number) {
  const seed = createInitialState();
  seed.store.scrap = 100;
  seed.storeUnits = 100;
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, encodeSave(seed, clockMs, { ...DEFAULT_SETTINGS, muted: true }));
  return storage;
}

describe("UI-RESET-64 command-id uniqueness across reloads (coordinator decision 6832499377)", () => {
  it("executes the first command after a reload instead of silently deduping it", async () => {
    const T0 = 1_000_000;
    const storage = seededStorage(T0);

    // First page load: a fresh module registry, exactly like a real load.
    vi.resetModules();
    const first = await import("../../src/ui/App");
    const dom1 = await import("react-dom/client");
    const utils1 = await import("react-dom/test-utils");
    const store1 = createStore({ storage, now: () => T0, leaseId: "tab-before-reload" });
    const host1 = document.createElement("div");
    document.body.appendChild(host1);
    const root1 = dom1.createRoot(host1);
    utils1.act(() => root1.render(<first.App store={store1} />));
    // Real UI path: the gate face, then the dock primary (manual.salvage).
    utils1.act(() => findButton("Begin recovery")!.click());
    utils1.act(() => primary()!.click());
    const afterFirst = store1.getState();
    expect(afterFirst.revision).toBe(1);
    expect(afterFirst.wreck.pulses).toBe(1);
    const firstIds = Object.keys(afterFirst.seenCommands);
    expect(firstIds).toHaveLength(1);
    utils1.act(() => root1.unmount());
    host1.remove();
    store1.stop();

    // Reload: a brand-new App module instance (fresh command epoch) over the
    // SAME persisted save. The clock moves past the 1500ms lease TTL so the
    // new tab is the writer, and its boot runs the game's own offline catch-up
    // (20 ticks), which also clears the salvage cooldown — the probe's path.
    vi.resetModules();
    const second = await import("../../src/ui/App");
    const dom2 = await import("react-dom/client");
    const utils2 = await import("react-dom/test-utils");
    const store2 = createStore({ storage, now: () => T0 + 2000, leaseId: "tab-after-reload" });
    expect(store2.getRole()).toBe("writer");
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    const root2 = dom2.createRoot(host2);
    utils2.act(() => root2.render(<second.App store={store2} />));
    utils2.act(() => findButton("Begin recovery")!.click());
    // getState() returns the live state object: snapshot the primitives first.
    const beforeRevision = store2.getState().revision;
    const beforePulses = store2.getState().wreck.pulses;
    expect(store2.getState().seenCommands[firstIds[0]]).toBe(1);
    utils2.act(() => primary()!.click());
    const after = store2.getState();
    // The post-reload dispatch EXECUTES: revision and pulses advance. Under the
    // old c1 counter it returned ok:true at the OLD revision with no change.
    expect(after.revision).toBe(beforeRevision + 1);
    expect(after.wreck.pulses).toBe(beforePulses + 1);
    const ids = Object.keys(after.seenCommands);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(firstIds[0]);
    expect(after.seenCommands[ids.find((id) => id !== firstIds[0])!]).toBe(after.revision);
    utils2.act(() => root2.unmount());
    host2.remove();
    store2.stop();
  });

  it("still dedups a genuine same-id retry without re-executing (store path)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const retry: Command = { id: "app-retry-1", type: "manual.salvage" };
    const first = store.dispatch(retry);
    expect(first.ok).toBe(true);
    const pulses = store.getState().wreck.pulses;
    const revision = store.getState().revision;
    // The exact same id again: the first result returns, nothing re-executes.
    const again = store.dispatch(retry);
    expect(again).toEqual(first);
    expect(store.getState().wreck.pulses).toBe(pulses);
    expect(store.getState().revision).toBe(revision);
    expect(Object.keys(store.getState().seenCommands)).toEqual(["app-retry-1"]);
  });

  it("keeps dedup across the save round-trip while a fresh-epoch id executes", () => {
    const state = createInitialState();
    state.store.scrap = 100;
    state.storeUnits = 100;
    const build: Command = { id: "c1", type: "machine.build", blueprint: "sorter", tile: 8 };
    const r1 = applyCommand(state, build);
    expect(r1).toEqual({ ok: true, revision: 1 });
    expect(state.machines).toHaveLength(1);
    expect(state.store.scrap).toBe(80);

    // The game's own encodeSave/decodeSave carries seenCommands through reload.
    const decoded = decodeSave(encodeSave(state, Date.now(), { ...DEFAULT_SETTINGS, muted: true }));
    if (!decoded.ok) throw new Error(`seed failed to decode: ${decoded.reason}`);
    const reloaded = decoded.payload.sim;
    expect(Object.keys(reloaded.seenCommands)).toEqual(["c1"]);

    // A genuine retry of the persisted id still dedups (mechanism intact)...
    const retry = applyCommand(reloaded, { id: "c1", type: "machine.build", blueprint: "sorter", tile: 9 });
    expect(retry).toEqual({ ok: true, revision: 1 });
    expect(reloaded.machines).toHaveLength(1);
    expect(reloaded.store.scrap).toBe(80);

    // ...but the unique ids a reloaded App now generates EXECUTE.
    const fresh = applyCommand(reloaded, { id: "epoch2-1", type: "machine.build", blueprint: "sorter", tile: 9 });
    expect(fresh).toEqual({ ok: true, revision: 2 });
    expect(reloaded.machines).toHaveLength(2);
    expect(reloaded.store.scrap).toBe(60);
    expect(reloaded.seenCommands["epoch2-1"]).toBe(2);
  });
});
