import { TICK_MS } from "../game/content/defs";
import { advance } from "../game/simulation/engine";
import { type ReturnReport } from "../game/simulation/offline";
import {
  CATCHUP_PROTOCOL,
  CATCHUP_WORKER_MIN_TICKS,
  createCatchUpClient,
  handleCatchUp,
  type CatchUpResponse,
} from "../game/workers/catchup";
import { applyCommand, type Command, type CommandResult } from "../game/simulation/commands";
import { createInitialState, type SimState } from "../game/simulation/types";
import {
  DEFAULT_SETTINGS,
  SAVE_KEY,
  decodeSave,
  encodeSave,
  migrate,
  type ImportResult,
  type SaveSettings,
} from "../game/persistence/save";
import { createLease, nextLeaseId, type LeaseRole } from "../game/persistence/lease";

export type StoreRole = LeaseRole;

export interface GameStore {
  getState(): SimState;
  getSettings(): SaveSettings;
  getViewVersion(): number;
  getReturnReport(): ReturnReport | null;
  /** "reader" when another tab owns the save (spec 22.3). */
  getRole(): StoreRole;
  /** True while a heavy offline catch-up is settled off the main thread (spec 18.5). */
  isReconciling(): boolean;
  dispatch(command: Command): CommandResult;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  setSettings(next: Partial<SaveSettings>): void;
  /** Controlled takeover; succeeds only once the previous owner's lease expires. */
  takeOver(): StoreRole;
  /** Versioned JSON text of the current yard, ready to move to another device. */
  exportSave(): string;
  /** Replaces the yard with an imported envelope; a failure changes nothing. */
  importSave(text: string): ImportResult;
  /** Test hook: run authoritative ticks without a frame loop. */
  step(ticks: number): void;
}

const MAX_TICKS_PER_FRAME = 20;
/** Follower tabs adopt the owner's snapshot at this cadence. */
const RECONCILE_MS = 100;
/** Authoritative checkpoint cadence for the owning tab. */
const PERSIST_MS = 1000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StoreOptions {
  storage?: StorageLike | null;
  /** Absolute wall clock in epoch milliseconds; `Date.now` when omitted. */
  now?: () => number;
  /** Monotonic page timeline for frame deltas; `performance.now` when omitted. */
  frameClock?: () => number;
  /** Stable per-tab identifier; generated when omitted. */
  leaseId?: string;
}

/**
 * Owns the authoritative simulation. React reads a summary through
 * `subscribe`; the renderer reads the state object directly each frame
 * (spec 21.1 separation). With several tabs open, only the lease holder
 * advances and writes; the others mirror the persisted revision.
 */
export function createStore(options: StoreOptions = {}): GameStore {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  // Two clocks on purpose: `now` is the absolute wall clock shared by every tab
  // and by reloads (epoch ms), while the frame delta uses the monotonic
  // page-relative timeline. `performance.now()` restarts per document, so it
  // cannot measure an absence or a lease timeout.
  const now = options.now ?? defaultWallClock;
  const frameClock =
    options.frameClock ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const lease = storage ? createLease(storage, now, options.leaseId ?? nextLeaseId()) : null;
  const loaded = storage ? decodeSave(safeGet(storage, SAVE_KEY)) : { ok: false as const, reason: "empty" as const };
  let state: SimState = loaded.ok ? migrate(loaded.payload).sim : createInitialState();
  let settings: SaveSettings = loaded.ok ? { ...DEFAULT_SETTINGS, ...loaded.payload.settings } : { ...DEFAULT_SETTINGS };
  let lastSeenMs = loaded.ok ? loaded.payload.lastSeenMs : now();

  let role: StoreRole = lease ? lease.claim(state.revision) : "writer";

  const listeners = new Set<() => void>();
  let viewVersion = 0;
  let frame = 0;
  let accumulator = 0;
  let lastFrameMs = frameClock();
  let sinceSave = 0;
  let sinceReconcile = 0;

  const notify = () => {
    viewVersion += 1;
    for (const listener of listeners) listener();
  };

  const persist = () => {
    if (!storage) return;
    if (lease) role = lease.claim(state.revision);
    try {
      storage.setItem(SAVE_KEY, encodeSave(state, lastSeenMs, settings));
    } catch {
      // Quota or unavailable storage: the in-memory session remains valid.
    }
  };

  let returnReport: ReturnReport | null = null;
  const catchUpClient = createCatchUpClient();
  let reconciling = false;
  /** Intents typed during an off-thread catch-up, replayed in order after adoption. */
  const deferred: Command[] = [];
  let deferredTicks = 0;

  /** Adopts a settled catch-up, then applies what the player typed while it ran. */
  const adoptCatchUp = (settled: CatchUpResponse) => {
    state = settled.sim;
    lastSeenMs = Math.max(lastSeenMs, settled.nextLastSeenMs);
    if (settled.report.creditedTicks > 0) returnReport = settled.report;
    reconciling = false;
    mark("rustwake:catchup-adopted");
    for (const command of deferred.splice(0, deferred.length)) {
      // Same gate the live path applies: a tab demoted during the handoff writes nothing.
      if (role !== "writer") break;
      applyCommand(state, command);
    }
    if (deferredTicks > 0) {
      advance(state, deferredTicks);
      deferredTicks = 0;
    }
    lastFrameMs = frameClock();
    accumulator = 0;
    persist();
    notify();
  };

  /**
   * Credits one absence against the shared economy and checkpoints the window
   * (spec 18.1). Safe to call again: the reference moves to `now`, so a repeat
   * measures no elapsed time and produces no second report. A long window is
   * settled in a worker so the page keeps answering input (spec 18.5); the same
   * pure function runs inline when there is no worker or no real gap.
   */
  const creditAbsence = () => {
    const rawElapsed = Math.max(0, Math.floor((now() - lastSeenMs) / TICK_MS));
    if (rawElapsed >= CATCHUP_WORKER_MIN_TICKS && catchUpClient.backed === "worker") {
      reconciling = true;
      mark("rustwake:catchup-start");
      void catchUpClient.run(state, lastSeenMs, now()).then((settled) => {
        if (!settled) return; // cancelled: a newer run owns the handoff
        adoptCatchUp(settled);
      });
      return;
    }
    const settled = handleCatchUp({
      protocol: CATCHUP_PROTOCOL,
      id: 0,
      sim: state,
      lastSeenMs,
      nowMs: now(),
    });
    if (settled) adoptCatchUp(settled);
  };

  if (loaded.ok && role === "writer") {
    // Reconcile the absence once, then render the latest world (spec 18.4).
    creditAbsence();
  }

  /**
   * Aligns this tab with the shared storage: refresh or recover the lease, then
   * adopt the newest persisted work. Adopting a whole snapshot keeps the ledger
   * identical instead of interleaving partial progress from two tabs.
   */
  const reconcile = (): boolean => {
    let changed = false;
    let promoted = false;
    if (lease) {
      const previous = role;
      role = lease.claim(state.revision);
      if (previous !== role) {
        changed = true;
        promoted = role === "writer";
      }
    }
    if (storage) {
      const incoming = decodeSave(safeGet(storage, SAVE_KEY));
      if (
        incoming.ok &&
        (incoming.payload.sim.tick > state.tick || incoming.payload.sim.revision > state.revision)
      ) {
        state = migrate(incoming.payload).sim;
        settings = { ...DEFAULT_SETTINGS, ...incoming.payload.settings };
        // The adopted snapshot carries the newest write time, so a later credit
        // measures the gap that snapshot actually left (spec 18.1).
        lastSeenMs = Math.max(lastSeenMs, incoming.payload.lastSeenMs);
        changed = true;
      }
    }
    // A tab promoted from follower to writer settles the gap itself, which is how
    // a refresh inside the lease window still credits one absence (spec 18.4).
    if (promoted && loaded.ok) creditAbsence();
    return changed;
  };

  const tickLoop = (timeMs: number) => {
    const delta = Math.max(0, timeMs - lastFrameMs);
    lastFrameMs = timeMs;
    if (reconciling) {
      // The world is frozen for the length of one worker handoff: neither the
      // owner's ticks nor a storage adopt can interleave with it (spec 18.4).
      frame = requestAnimationFrame(tickLoop);
      return;
    }
    sinceReconcile += delta;
    if (sinceReconcile >= RECONCILE_MS) {
      sinceReconcile = 0;
      if (reconcile()) notify();
    }
    if (role === "reader") {
      // A follower renders the owner's snapshots; it never advances the economy.
      frame = requestAnimationFrame(tickLoop);
      return;
    }
    accumulator += delta;
    let ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(accumulator / TICK_MS));
    if (accumulator > TICK_MS * 40) accumulator = TICK_MS * 40;
    if (ticks > 0) {
      accumulator -= ticks * TICK_MS;
      advance(state, ticks);
      sinceSave += ticks * TICK_MS;
      if (sinceSave >= PERSIST_MS) {
        sinceSave = 0;
        lastSeenMs = now();
        persist();
      }
      notify();
    }
    frame = requestAnimationFrame(tickLoop);
  };

  return {
    getState: () => state,
    getSettings: () => settings,
    getViewVersion: () => viewVersion,
    getReturnReport: () => returnReport,
    getRole: () => role,
    isReconciling: () => reconciling,
    dispatch(command: Command): CommandResult {
      if (reconciling) {
        // Typed during the handoff: kept in order and applied to the adopted
        // snapshot, which is exactly the order the inline path would have used.
        if (deferred.length < 32) {
          deferred.push(command);
          return { ok: true, revision: state.revision };
        }
        return { ok: false, reason: "reconciling" };
      }
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, reason: "read-only" };
      const result = applyCommand(state, command);
      if (result.ok) {
        notify();
        persist();
      }
      return result;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (frame === 0 && typeof requestAnimationFrame === "function") {
        lastFrameMs = frameClock();
        frame = requestAnimationFrame(tickLoop);
      }
    },
    stop() {
      if (frame !== 0 && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = 0;
    },
    setSettings(next: Partial<SaveSettings>) {
      settings = { ...settings, ...next };
      if (role === "writer") persist();
      notify();
    },
    takeOver(): StoreRole {
      // `claim` promotes us only when the lease is absent, ours, or expired, so a
      // live owner is never silently overwritten by a second writer.
      if (reconcile()) notify();
      return role;
    },
    exportSave(): string {
      // The exact text the checkpoint writes, so an exported file is byte-identical
      // to what this tab persists and re-imports without a translation layer.
      return encodeSave(state, lastSeenMs, settings);
    },
    importSave(text: string): ImportResult {
      const decoded = decodeSave(text);
      if (!decoded.ok) {
        return { ok: false, reason: decoded.reason, detail: decoded.detail };
      }
      if (reconciling) {
        // The imported envelope replaces the yard wholesale, so the in-flight
        // handoff is abandoned instead of clobbering it with an older snapshot.
        catchUpClient.cancel();
        reconciling = false;
      }
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, reason: "read-only" };
      // Checksum and invariant pass already succeeded, so the whole yard swaps over
      // in one step and a refused file leaves the running state untouched
      // (spec 22.2, spec 25.3 case 8). The imported envelope's own reference clock
      // is replaced by this moment, so a later reload credits only the gap this
      // device actually saw rather than the sum of both devices' windows.
      const next = migrate(decoded.payload);
      state = next.sim;
      settings = { ...DEFAULT_SETTINGS, ...next.settings };
      lastSeenMs = now();
      persist();
      notify();
      return { ok: true, tick: state.tick, machines: state.machines.length };
    },
    step(ticks: number) {
      if (reconciling) {
        // Same rule as commands: the ticks land on the adopted snapshot.
        deferredTicks = Math.min(432_000, deferredTicks + Math.max(0, Math.floor(ticks)));
        return;
      }
      if (reconcile()) notify();
      if (role !== "writer") return;
      advance(state, ticks);
      lastSeenMs = now();
      persist();
      notify();
    },
  };
}

function defaultWallClock(): number {
  return Date.now();
}

/** Timeline marks for the catch-up probe (spec 21.6); a no-op without the API. */
function mark(name: string): void {
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark(name);
  }
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export { catchUp } from "../game/simulation/offline";
