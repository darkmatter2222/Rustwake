import { BLUEPRINTS, RECIPES } from "../content/defs";
import { SCHEMA_VERSION, createInitialState, type SimState } from "../simulation/types";

export const SAVE_KEY = "rustwake.save.v1";

export interface SaveEnvelope {
  readonly schemaVersion: number;
  readonly checksum: string;
  readonly payload: SavePayload;
}

export interface SavePayload {
  readonly sim: SimState;
  readonly lastSeenMs: number;
  readonly settings: SaveSettings;
}

export interface SaveSettings {
  muted: boolean;
  reducedMotion: boolean;
  textScale: number;
}

export const DEFAULT_SETTINGS: SaveSettings = {
  muted: false,
  reducedMotion: false,
  textScale: 1,
};

export type DecodeResult =
  | { ok: true; payload: SavePayload }
  | { ok: false; reason: "empty" | "parse" | "schema" | "checksum" | "invalid" };

/** FNV-1a over the serialized payload: enough to detect truncation and mixes. */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function encodeSave(sim: SimState, lastSeenMs: number, settings: SaveSettings): string {
  const payload: SavePayload = { sim, lastSeenMs, settings };
  const body = JSON.stringify(payload);
  const envelope: SaveEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    checksum: checksum(body),
    payload,
  };
  return JSON.stringify(envelope);
}

export function decodeSave(text: string | null): DecodeResult {
  if (!text) return { ok: false, reason: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "parse" };
  }
  const envelope = parsed as Partial<SaveEnvelope>;
  if (typeof envelope !== "object" || envelope === null) return { ok: false, reason: "parse" };
  if (envelope.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: "schema" };
  if (!envelope.payload) return { ok: false, reason: "parse" };
  const body = JSON.stringify(envelope.payload);
  if (checksum(body) !== envelope.checksum) return { ok: false, reason: "checksum" };
  const invalid = validateSim(envelope.payload.sim);
  if (invalid) return { ok: false, reason: "invalid" };
  return { ok: true, payload: envelope.payload };
}

/** Returns the first violated invariant name, or null when the state is sound. */
export function validateSim(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return "state";
  const s = state as SimState;
  if (!Number.isSafeInteger(s.schemaVersion) || s.schemaVersion !== SCHEMA_VERSION) {
    return "schemaVersion";
  }
  if (!Number.isSafeInteger(s.tick) || s.tick < 0) return "tick";
  if (!Number.isSafeInteger(s.revision) || s.revision < 0) return "revision";
  if (!Number.isSafeInteger(s.storeCapacity) || s.storeCapacity <= 0) return "storeCapacity";
  if (!isQuantityMap(s.store)) return "store";
  if (!Number.isSafeInteger(s.storeUnits) || s.storeUnits < 0) return "storeUnits";
  if (!Number.isSafeInteger(s.credits) || s.credits < 0) return "credits";
  if (!Array.isArray(s.machines)) return "machines";
  const ids = new Set<number>();
  for (const m of s.machines) {
    if (!BLUEPRINTS[m.blueprint]) return `blueprint:${m.id}`;
    if (!Number.isSafeInteger(m.id) || m.id <= 0 || ids.has(m.id)) return `machineId:${m.id}`;
    ids.add(m.id);
    if (!Number.isInteger(m.tile) || m.tile < 0) return `tile:${m.id}`;
    if (!Number.isInteger(m.level) || m.level < 1) return `level:${m.id}`;
    if (!isQuantityMap(m.inBuf)) return `inBuf:${m.id}`;
    if (!Number.isSafeInteger(m.inBufUnits) || m.inBufUnits < 0) return `inBufUnits:${m.id}`;
    if (!Array.isArray(m.tray)) return `tray:${m.id}`;
    if (!Array.isArray(m.batch)) return `batch:${m.id}`;
    for (const item of m.tray) {
      if (!item || !Number.isSafeInteger(item.qty) || item.qty < 0) return `trayQty:${m.id}`;
    }
    for (const item of m.batch) {
      if (!item || !Number.isSafeInteger(item.qty) || item.qty < 0) return `batchQty:${m.id}`;
    }
    if (!Number.isSafeInteger(m.progress) || m.progress < 0) return `progress:${m.id}`;
    for (const key of ["ageTicks", "busyTicks", "fullTicks", "starvedTicks"] as const) {
      const value = m[key];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        return `${key}:${m.id}`;
      }
    }
  }
  if (!Array.isArray(s.routes)) return "routes";
  for (const r of s.routes) {
    if (!Number.isSafeInteger(r.capacity) || r.capacity <= 0) return `routeCapacity:${r.id}`;
    if (!Number.isSafeInteger(r.inFlight) || r.inFlight < 0) return `routeInFlight:${r.id}`;
    if (r.from.kind === "machine" && !ids.has(r.from.id)) return `routeSource:${r.id}`;
    if (r.to.kind === "machine" && !ids.has(r.to.id)) return `routeTarget:${r.id}`;
    if (!Array.isArray(r.items)) return `routeItems:${r.id}`;
    for (const item of r.items) {
      if (!Number.isSafeInteger(item.qty) || item.qty < 0) return `routeItemQty:${r.id}`;
      if (!Number.isSafeInteger(item.arrive)) return `routeItemArrive:${r.id}`;
    }
    for (const key of ["ageTicks", "busyTicks"] as const) {
      const value = r[key];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        return `${key}:${r.id}`;
      }
    }
  }
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.cycleTicks <= 0 || recipe.power <= 0) return `recipe:${recipe.id}`;
  }
  return null;
}

function isQuantityMap(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  for (const quantity of Object.values(value as Record<string, unknown>)) {
    if (!Number.isSafeInteger(quantity)) return false;
    if ((quantity as number) < 0) return false;
  }
  return true;
}

/** Forward migration entry point; v1 is the baseline shape. */
export function migrate(payload: SavePayload): SavePayload {
  const base = createInitialState();
  const sim = { ...payload.sim, schemaVersion: base.schemaVersion };
  // v1 saves written before the measured counters existed still load: missing
  // counters become zero, so reported percentages simply cover a shorter window.
  for (const m of sim.machines ?? []) {
    m.ageTicks = countOf(m.ageTicks);
    m.busyTicks = countOf(m.busyTicks);
    m.fullTicks = countOf(m.fullTicks);
    m.starvedTicks = countOf(m.starvedTicks);
  }
  for (const r of sim.routes ?? []) {
    r.ageTicks = countOf(r.ageTicks);
    r.busyTicks = countOf(r.busyTicks);
  }
  return { ...payload, sim };
}

function countOf(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
