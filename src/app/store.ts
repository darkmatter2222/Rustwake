import { TICK_MS } from "../game/content/defs";
import { advance } from "../game/simulation/engine";
import { catchUp, type ReturnReport } from "../game/simulation/offline";
import { applyCommand, type Command, type CommandResult } from "../game/simulation/commands";
import { createInitialState, type SimState } from "../game/simulation/types";
import {
  DEFAULT_SETTINGS,
  SAVE_KEY,
  decodeSave,
  encodeSave,
  migrate,
  type SaveSettings,
} from "../game/persistence/save";

export interface GameStore {
  getState(): SimState;
  getSettings(): SaveSettings;
  getViewVersion(): number;
  getReturnReport(): ReturnReport | null;
  dispatch(command: Command): CommandResult;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  setSettings(next: Partial<SaveSettings>): void;
  /** Test hook: run authoritative ticks without a frame loop. */
  step(ticks: number): void;
}

const MAX_TICKS_PER_FRAME = 20;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoreOptions {
  storage?: StorageLike | null;
  now?: () => number;
}

/**
 * Owns the authoritative simulation. React reads a summary through
 * `subscribe`; the renderer reads the state object directly each frame
 * (spec 21.1 separation).
 */
export function createStore(options: StoreOptions = {}): GameStore {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => performance.now());
  const loaded = storage ? decodeSave(safeGet(storage, SAVE_KEY)) : { ok: false as const, reason: "empty" as const };
  let state: SimState = loaded.ok ? migrate(loaded.payload).sim : createInitialState();
  let settings: SaveSettings = loaded.ok ? { ...DEFAULT_SETTINGS, ...loaded.payload.settings } : { ...DEFAULT_SETTINGS };
  let lastSeenMs = loaded.ok ? loaded.payload.lastSeenMs : now();

  let returnReport: ReturnReport | null = null;

  if (loaded.ok) {
    // Reconcile the absence once, then render the latest world (spec 18.4).
    returnReport = catchUp(state, lastSeenMs, now()).report;
    lastSeenMs = now();
  }

  const listeners = new Set<() => void>();
  let viewVersion = 0;
  let frame = 0;
  let accumulator = 0;
  let lastFrameMs = now();
  let sinceSave = 0;

  const notify = () => {
    viewVersion += 1;
    for (const listener of listeners) listener();
  };

  const persist = () => {
    if (!storage) return;
    try {
      storage.setItem(SAVE_KEY, encodeSave(state, lastSeenMs, settings));
    } catch {
      // Quota or unavailable storage: the in-memory session remains valid.
    }
  };

  const tickLoop = (timeMs: number) => {
    const delta = Math.max(0, timeMs - lastFrameMs);
    lastFrameMs = timeMs;
    accumulator += delta;
    let ticks = Math.min(MAX_TICKS_PER_FRAME, Math.floor(accumulator / TICK_MS));
    if (accumulator > TICK_MS * 40) accumulator = TICK_MS * 40;
    if (ticks > 0) {
      accumulator -= ticks * TICK_MS;
      advance(state, ticks);
      sinceSave += ticks * TICK_MS;
      if (sinceSave >= 5000) {
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
    dispatch(command: Command): CommandResult {
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
        lastFrameMs = now();
        frame = requestAnimationFrame(tickLoop);
      }
    },
    stop() {
      if (frame !== 0 && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = 0;
    },
    setSettings(next: Partial<SaveSettings>) {
      settings = { ...settings, ...next };
      persist();
      notify();
    },
    step(ticks: number) {
      advance(state, ticks);
      lastSeenMs = now();
      persist();
      notify();
    },
  };
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
