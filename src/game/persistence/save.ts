import { BLUEPRINTS, RECIPES, RESOURCES, TUNING, type ResourceId } from "../content/defs";
import { RESEARCH } from "../content/research";
import { LEASE_KEY } from "./lease";
import {
  SCHEMA_VERSION,
  createInitialState,
  type DroneState,
  type RouteState,
  type SimState,
} from "../simulation/types";
import { isWorldAssetId } from "../world/kit";
import {
  GRID_MAX,
  GRID_MIN,
  GRID_SIZE,
  ROTATIONS,
  WORLD_SCHEMA_VERSION,
  type WorldState,
} from "../world/types";

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
  /**
   * #228 (G1 persistence join): the 3D build yard, attached ADDITIVELY through
   * the optional-field seam (`run`/`branch` precedent). No schema-version bump:
   * `decodeSave` refuses any other version before migrate, so a bump would
   * orphan every existing save. Old saves simply have no yard (fresh grid on
   * boot); new saves carry sites, reservations and committed material so
   * construction resumes exactly where it stopped.
   */
  readonly world?: WorldState;
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

/** Why an envelope was refused; `detail` carries the first violated invariant. */
export type DecodeFailure =
  | "empty"
  | "oversized"
  | "parse"
  | "schema"
  | "checksum"
  | "invalid";

/**
 * G2 (#148): bounded-size gate, checked BEFORE `JSON.parse` (contract "Saves and
 * migration": validate bounded sizes before importing/migrating). Measured in
 * UTF-16 code units — localStorage's native unit, the same unit `textLength`
 * reports. 1,000,000 characters (~2 MB) is orders of magnitude above any
 * legitimate yard (the deepest checked-in fixture is a few KB, and even an
 * unpruned `seenCommands` ledger of 100k ids stays well under it) yet far below
 * the typical 5 MiB origin quota, so the writer lease and the G1 recovery slot
 * still fit alongside a maximum-size save. An oversized envelope is refused
 * with the typed reason `oversized` and changes nothing: a manual import keeps
 * the live yard, and a corrupt boot retains the raw bytes in the recovery slot
 * exactly like every other decode failure (G1, #191).
 */
export const MAX_SAVE_TEXT_LENGTH = 1_000_000;

export type DecodeResult =
  | { ok: true; payload: SavePayload }
  | { ok: false; reason: DecodeFailure; detail?: string };

/**
 * Outcome of a manual import (spec 22.2). A failure never touches the live state,
 * so the yard keeps running from the last known-good checkpoint.
 */
export type ImportResult =
  | { ok: true; tick: number; machines: number }
  | {
      ok: false;
      reason: DecodeFailure | "read-only";
      detail?: string;
    };

/** FNV-1a over the serialized payload: enough to detect truncation and mixes. */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function encodeSave(
  sim: SimState,
  lastSeenMs: number,
  settings: SaveSettings,
  world?: WorldState,
): string {
  // #228: the yard is included only when provided, so every existing 3-arg
  // caller keeps writing the exact pre-join envelope shape.
  const payload: SavePayload =
    world === undefined ? { sim, lastSeenMs, settings } : { sim, lastSeenMs, settings, world };
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
  // G2 (#148): refuse oversized text before parsing, so a hostile multi-megabyte
  // envelope can never reach JSON.parse. Even a checksum-valid envelope is
  // refused for size alone; the caller's state is untouched either way.
  if (text.length > MAX_SAVE_TEXT_LENGTH) return { ok: false, reason: "oversized" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "parse" };
  }
  const envelope = parsed as Partial<SaveEnvelope>;
  if (typeof envelope !== "object" || envelope === null)
    return { ok: false, reason: "parse" };
  if (envelope.schemaVersion !== SCHEMA_VERSION)
    return { ok: false, reason: "schema" };
  if (!envelope.payload) return { ok: false, reason: "parse" };
  const body = JSON.stringify(envelope.payload);
  if (checksum(body) !== envelope.checksum)
    return { ok: false, reason: "checksum" };
  // Issue #100: repair pre-fix registration damage on the load path, BEFORE validation.
  // The store decodes then migrates and falls back to a fresh yard on any decode failure,
  // so a pre-fix orphaned save (a route whose machine endpoint was dismantled) must be
  // repaired here or it would fail `routeSource`/`routeTarget` and silently reset the yard.
  // A living under-registered machine needs no repair: its whole output set is DERIVED
  // from the route table at read time (`outputRouteIds`), so it is already whole.
  repairRegistration(envelope.payload.sim);
  const invalid = validateSim(envelope.payload.sim);
  if (invalid) return { ok: false, reason: "invalid", detail: invalid };
  // #228: the optional build yard is untrusted input too. Validate BEFORE
  // trusting it (same typed failure path as validateSim), then hand back a
  // sanitized clone so the decoded world can never alias the parsed envelope.
  // Absent world -> ok: every pre-join save boots a fresh yard unchanged.
  let world: WorldState | undefined;
  if (envelope.payload.world !== undefined) {
    const worldInvalid = validateWorld(envelope.payload.world);
    if (worldInvalid) return { ok: false, reason: "invalid", detail: `world:${worldInvalid}` };
    world = sanitizeWorld(envelope.payload.world);
  }
  // UI-RESET-63: settings are untrusted input too. Sanitizing HERE protects both
  // readers of a decode — boot and manual import — without either call site
  // having to remember it. Healthy saves round-trip unchanged.
  return {
    ok: true,
    payload: {
      ...envelope.payload,
      settings: sanitizeSettings(envelope.payload.settings),
      ...(world !== undefined ? { world } : {}),
    },
  };
}

/**
 * UI-RESET-63: a save's settings block is attacker-controlled text, and the UI
 * multiplies `textScale` straight into the root font size — a crafted envelope
 * with `textScale: 99` (or a non-boolean `muted`) would break the whole screen
 * on import or boot. Clamp the scale to the supported [1, 2] range (the same
 * steps the settings cycle offers), accept booleans only as literal `true`, and
 * fall back to the defaults for anything missing or malformed. A sound save —
 * including every older v1 save — passes through value-for-value.
 */
export function sanitizeSettings(settings: unknown): SaveSettings {
  if (typeof settings !== "object" || settings === null) return { ...DEFAULT_SETTINGS };
  const raw = settings as Record<string, unknown>;
  const scale =
    typeof raw.textScale === "number" && Number.isFinite(raw.textScale)
      ? Math.min(2, Math.max(1, raw.textScale))
      : DEFAULT_SETTINGS.textScale;
  return {
    muted: raw.muted === true,
    reducedMotion: raw.reducedMotion === true,
    textScale: scale,
  };
}

/**
 * #228: bounded caps for the optional build-yard slice. The full parcel plan
 * holds 25 parcels on a 40x40 grid, so 4096 records is orders of magnitude
 * above any legitimate yard yet keeps a hostile envelope's decode work bounded
 * (the text-length gate above already refuses multi-megabyte payloads).
 */
export const MAX_WORLD_RECORDS = 4096;
export const MAX_WORLD_PARCELS = 64;
export const MAX_WORLD_ITEMS = 64;
/** Same ceiling the sim's command ledger comment cites for `seenCommands`. */
export const MAX_WORLD_LEDGER = 100_000;

const RESOURCE_SET: ReadonlySet<string> = new Set(RESOURCES);
const TERRAIN_KINDS: ReadonlySet<string> = new Set(["flat", "salvage", "rough"]);

function isNonNegInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isGridCell(value: unknown): value is { x: number; y: number } {
  if (typeof value !== "object" || value === null) return false;
  const c = value as { x: unknown; y: unknown };
  return (
    Number.isInteger(c.x) &&
    Number.isInteger(c.y) &&
    (c.x as number) >= GRID_MIN &&
    (c.x as number) < GRID_MAX &&
    (c.y as number) >= GRID_MIN &&
    (c.y as number) < GRID_MAX
  );
}

function isRotation(value: unknown): boolean {
  return typeof value === "number" && (ROTATIONS as readonly number[]).includes(value);
}

/** A quantity map whose keys are KNOWN resources (hostile keys are refused). */
function isWorldQuantityMap(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const [key, quantity] of Object.entries(value as Record<string, unknown>)) {
    if (!RESOURCE_SET.has(key)) return false;
    if (!isNonNegInt(quantity)) return false;
  }
  return true;
}

/**
 * #228: returns the first violated invariant name, or null when the yard is
 * sound. Total on adversarial input: every access is guarded, so a crafted
 * envelope can never throw out of decode. Structural checks only — the engine
 * remains the authority for placement law; this gate keeps hostile records
 * (unknown assets, negative cargo, unbounded arrays, out-of-grid cells) from
 * ever reaching the live world.
 */
export function validateWorld(state: unknown): string | null {
  if (typeof state !== "object" || state === null || Array.isArray(state)) return "state";
  const w = state as WorldState;
  if (!Number.isSafeInteger(w.schemaVersion) || w.schemaVersion !== WORLD_SCHEMA_VERSION)
    return "schemaVersion";
  if (!isNonNegInt(w.contentVersion)) return "contentVersion";
  if (!isNonNegInt(w.revision)) return "revision";
  if (!isNonNegInt(w.tick)) return "tick";
  if (!isNonNegInt(w.seed) || w.seed > 0xffffffff) return "seed";
  if (w.clearanceMode !== "blockout" && w.clearanceMode !== "production")
    return "clearanceMode";
  if (!Array.isArray(w.parcels) || w.parcels.length > MAX_WORLD_PARCELS) return "parcels";
  for (const p of w.parcels) {
    if (!p || typeof p !== "object") return "parcel";
    if (!isNonNegInt(p.id) || !Number.isInteger(p.x) || !Number.isInteger(p.y))
      return `parcel:${p.id}`;
    if (p.x < GRID_MIN || p.y < GRID_MIN || p.x >= GRID_MAX || p.y >= GRID_MAX)
      return `parcelCell:${p.id}`;
    if (!isPositiveInt(p.size) || p.size > GRID_SIZE) return `parcelSize:${p.id}`;
    if (typeof p.owned !== "boolean") return `parcelOwned:${p.id}`;
  }
  if (!Array.isArray(w.terrain) || w.terrain.length !== GRID_SIZE * GRID_SIZE)
    return "terrain";
  for (const kind of w.terrain) {
    if (typeof kind !== "string" || !TERRAIN_KINDS.has(kind)) return "terrainKind";
  }
  if (!Array.isArray(w.buildings) || w.buildings.length > MAX_WORLD_RECORDS)
    return "buildings";
  const buildingIds = new Set<number>();
  for (const b of w.buildings) {
    if (!b || typeof b !== "object") return "building";
    if (!isPositiveInt(b.id) || buildingIds.has(b.id)) return `buildingId:${b.id}`;
    buildingIds.add(b.id);
    if (!isWorldAssetId(b.asset)) return `buildingAsset:${b.id}`;
    if (!isGridCell(b.cell)) return `buildingCell:${b.id}`;
    if (!isRotation(b.rotation)) return `buildingRotation:${b.id}`;
    if (!isNonNegInt(b.completedTick)) return `buildingCompletedTick:${b.id}`;
  }
  if (!Array.isArray(w.sites) || w.sites.length > MAX_WORLD_RECORDS) return "sites";
  const siteIds = new Set<number>();
  for (const s of w.sites) {
    if (!s || typeof s !== "object") return "site";
    if (!isPositiveInt(s.id) || siteIds.has(s.id)) return `siteId:${s.id}`;
    siteIds.add(s.id);
    if (!isPositiveInt(s.buildingId)) return `siteBuildingId:${s.id}`;
    if (!isWorldAssetId(s.asset)) return `siteAsset:${s.id}`;
    if (!isGridCell(s.cell)) return `siteCell:${s.id}`;
    if (!isRotation(s.rotation)) return `siteRotation:${s.id}`;
    if (!isNonNegInt(s.startTick)) return `siteStartTick:${s.id}`;
    if (!isPositiveInt(s.durationTicks)) return `siteDuration:${s.id}`;
    if (!isNonNegInt(s.progressTicks) || s.progressTicks > s.durationTicks)
      return `siteProgress:${s.id}`;
    if (!isPositiveInt(s.reservationId)) return `siteReservation:${s.id}`;
  }
  if (!Array.isArray(w.reservations) || w.reservations.length > MAX_WORLD_RECORDS)
    return "reservations";
  const reservationIds = new Set<number>();
  for (const r of w.reservations) {
    if (!r || typeof r !== "object") return "reservation";
    if (!isPositiveInt(r.id) || reservationIds.has(r.id)) return `reservationId:${r.id}`;
    reservationIds.add(r.id);
    if (!isPositiveInt(r.siteId)) return `reservationSite:${r.id}`;
    if (!Array.isArray(r.items) || r.items.length > MAX_WORLD_ITEMS)
      return `reservationItems:${r.id}`;
    for (const item of r.items) {
      if (!item || typeof item !== "object") return `reservationItem:${r.id}`;
      if (typeof item.resource !== "string" || !RESOURCE_SET.has(item.resource))
        return `reservationResource:${r.id}`;
      if (!isNonNegInt(item.qty)) return `reservationQty:${r.id}`;
    }
    if (!isNonNegInt(r.credits)) return `reservationCredits:${r.id}`;
  }
  if (!isWorldQuantityMap(w.stock)) return "stock";
  if (!isNonNegInt(w.credits)) return "credits";
  if (!isWorldQuantityMap(w.committed)) return "committed";
  if (!isNonNegInt(w.committedCredits)) return "committedCredits";
  if (!isNonNegInt(w.milestoneTokens)) return "milestoneTokens";
  if (!isPositiveInt(w.nextBuildingId)) return "nextBuildingId";
  if (!isPositiveInt(w.nextSiteId)) return "nextSiteId";
  if (!isPositiveInt(w.nextReservationId)) return "nextReservationId";
  if (
    typeof w.seenCommands !== "object" ||
    w.seenCommands === null ||
    Array.isArray(w.seenCommands)
  )
    return "seenCommands";
  const ledger = Object.entries(w.seenCommands);
  if (ledger.length > MAX_WORLD_LEDGER) return "seenCommands";
  for (const [, revision] of ledger) {
    if (!isNonNegInt(revision)) return "seenCommands";
  }
  // Issue #146 lifecycle seam: optional, but present must be sound.
  if (w.storageCapacity !== undefined && !isPositiveInt(w.storageCapacity))
    return "storageCapacity";
  if (w.overflow !== undefined) {
    if (!Array.isArray(w.overflow) || w.overflow.length > MAX_WORLD_RECORDS)
      return "overflow";
    for (const e of w.overflow) {
      if (!e || typeof e !== "object") return "overflowEntry";
      if (!isPositiveInt(e.id)) return `overflowId:${e.id}`;
      if (typeof e.resource !== "string" || !RESOURCE_SET.has(e.resource))
        return `overflowResource:${e.id}`;
      if (!isNonNegInt(e.qty)) return `overflowQty:${e.id}`;
      if (
        !e.source ||
        typeof e.source !== "object" ||
        e.source.kind !== "dismantle" ||
        !isPositiveInt(e.source.buildingId) ||
        !isWorldAssetId(e.source.asset)
      )
        return `overflowSource:${e.id}`;
      if (!isNonNegInt(e.tick)) return `overflowTick:${e.id}`;
      if (!isNonNegInt(e.formulaVersion)) return `overflowFormula:${e.id}`;
    }
  }
  if (w.nextOverflowId !== undefined && !isPositiveInt(w.nextOverflowId))
    return "nextOverflowId";
  return null;
}

/**
 * #228: a fresh, own-property-only clone of a VALIDATED yard. Rebuilding every
 * record (instead of handing back the parsed graph) means the decoded world
 * can never alias attacker object graphs, and unknown extra keys are dropped.
 * `Object.fromEntries` defines own data properties, so a hostile `__proto__`
 * ledger key becomes an ordinary entry instead of touching any prototype.
 */
export function sanitizeWorld(w: WorldState): WorldState {
  const clean: WorldState = {
    schemaVersion: w.schemaVersion,
    contentVersion: w.contentVersion,
    revision: w.revision,
    tick: w.tick,
    seed: w.seed,
    clearanceMode: w.clearanceMode,
    parcels: w.parcels.map((p) => ({ id: p.id, x: p.x, y: p.y, size: p.size, owned: p.owned })),
    terrain: [...w.terrain],
    buildings: w.buildings.map((b) => ({
      id: b.id,
      asset: b.asset,
      cell: { x: b.cell.x, y: b.cell.y },
      rotation: b.rotation,
      completedTick: b.completedTick,
    })),
    sites: w.sites.map((s) => ({
      id: s.id,
      buildingId: s.buildingId,
      asset: s.asset,
      cell: { x: s.cell.x, y: s.cell.y },
      rotation: s.rotation,
      startTick: s.startTick,
      durationTicks: s.durationTicks,
      progressTicks: s.progressTicks,
      reservationId: s.reservationId,
    })),
    reservations: w.reservations.map((r) => ({
      id: r.id,
      siteId: r.siteId,
      items: r.items.map((i) => ({ resource: i.resource, qty: i.qty })),
      credits: r.credits,
    })),
    stock: Object.fromEntries(Object.entries(w.stock)),
    credits: w.credits,
    committed: Object.fromEntries(Object.entries(w.committed)),
    committedCredits: w.committedCredits,
    milestoneTokens: w.milestoneTokens,
    nextBuildingId: w.nextBuildingId,
    nextSiteId: w.nextSiteId,
    nextReservationId: w.nextReservationId,
    seenCommands: Object.fromEntries(Object.entries(w.seenCommands)),
  };
  if (w.storageCapacity !== undefined) clean.storageCapacity = w.storageCapacity;
  if (w.overflow !== undefined) {
    clean.overflow = w.overflow.map((e) => ({
      id: e.id,
      resource: e.resource,
      qty: e.qty,
      source: { kind: "dismantle", buildingId: e.source.buildingId, asset: e.source.asset },
      tick: e.tick,
      formulaVersion: e.formulaVersion,
    }));
  }
  if (w.nextOverflowId !== undefined) clean.nextOverflowId = w.nextOverflowId;
  return clean;
}

/**
 * Issue #100 load-path repair. A pure, deterministic, idempotent function of the parsed
 * save: no clocks, no randomness, and a second pass changes nothing, so re-loading a
 * repaired save never refunds twice. It only touches DAMAGED records, so a healthy save
 * — including a legacy single-output save AND a pre-fix multi-output save whose singular
 * `outRoute` mirror named only the last belt — round-trips byte-for-byte.
 *
 * Registration itself needs no repair: `outputRouteIds` DERIVES a machine's whole output
 * set from the route table (the engine's flow source of truth), so a living under-registered
 * machine (sub-case (i)) is already whole the moment it is read — dismantle refunds and drops
 * every belt, the inspector reports every belt, with no mutation and no value change.
 *
 * The one damage that cannot be derived away is a route whose machine endpoint no longer
 * exists (sub-case (ii)): a dismantled machine's orphan belt, which the pre-fix defect never
 * refunded or dropped. `validateSim` refuses such a route (`routeSource`/`routeTarget`), and
 * the store falls back to a fresh yard on any decode failure, so the orphan must be removed
 * HERE, before validation, or the player's save silently resets. It is removed with the same
 * compensation `dropRoute` pays: in-flight items return to the store (clamped to free room,
 * the rest to overflow) and the paid belt cost is refunded at `dismantleRefundPct`. The paid
 * value is preserved, never deleted. Stale `inRoutes`/`outRoute` references to a dropped route
 * are pruned so the repaired record is internally consistent.
 *
 * Structurally malformed sims are left untouched for `validateSim` to refuse, so repair
 * never throws on adversarial input and never masks the real decode failure.
 */
export function repairRegistration(sim: SimState): SimState {
  if (
    !Array.isArray(sim.machines) ||
    !Array.isArray(sim.routes) ||
    !Array.isArray(sim.overflow) ||
    typeof sim.store !== "object" ||
    sim.store === null ||
    !Number.isSafeInteger(sim.storeCapacity) ||
    !Number.isSafeInteger(sim.storeUnits)
  ) {
    return sim;
  }
  const machineIds = new Set(sim.machines.map((m) => m.id));
  // Drop dangling-endpoint routes, compensating exactly like `dropRoute`.
  const kept: RouteState[] = [];
  const dropped = new Set<number>();
  for (const route of sim.routes) {
    // Structurally malformed entries (null, non-object, missing/non-object endpoints)
    // are left UNTOUCHED for `validateSim` to refuse — repair never throws on
    // adversarial input and never masks the real decode failure (docstring above).
    if (
      !route ||
      typeof route !== "object" ||
      !route.from ||
      typeof route.from !== "object" ||
      !route.to ||
      typeof route.to !== "object"
    ) {
      kept.push(route);
      continue;
    }
    const sourceGone = route.from.kind === "machine" && !machineIds.has(route.from.id);
    const targetGone = route.to.kind === "machine" && !machineIds.has(route.to.id);
    if (!sourceGone && !targetGone) {
      kept.push(route);
      continue;
    }
    dropped.add(route.id);
    for (const item of Array.isArray(route.items) ? route.items : []) {
      if (!item || !Number.isSafeInteger(item.qty) || item.qty < 0) continue;
      const room = sim.storeCapacity - sim.storeUnits;
      const moved = Math.min(item.qty, Math.max(0, room));
      repairAddToStore(sim, item.resource, moved);
      if (item.qty > moved) sim.overflow.push({ resource: item.resource, qty: item.qty - moved });
    }
    const price = TUNING.beltCostPerTile * (route.run?.length ?? 0);
    const refund = Math.round((price * TUNING.dismantleRefundPct) / 100);
    if (refund > 0) repairAddToStore(sim, "scrap", refund);
  }
  if (dropped.size === 0) return sim;
  sim.routes = kept;
  // Prune stale references to the dropped routes so the surviving records stay consistent.
  for (const m of sim.machines) {
    if (Array.isArray(m.inRoutes)) m.inRoutes = m.inRoutes.filter((id) => !dropped.has(id));
    if (m.outRoute !== null && dropped.has(m.outRoute)) m.outRoute = null;
  }
  return sim;
}

/** `addToStore`'s exact arithmetic (no clamp), kept local so save.ts stays self-contained. */
function repairAddToStore(sim: SimState, resource: ResourceId, amount: number): void {
  if (amount <= 0) return;
  sim.store[resource] = (sim.store[resource] ?? 0) + amount;
  sim.storeUnits += amount;
}

/** Returns the first violated invariant name, or null when the state is sound. */
export function validateSim(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return "state";
  const s = state as SimState;
  if (
    !Number.isSafeInteger(s.schemaVersion) ||
    s.schemaVersion !== SCHEMA_VERSION
  ) {
    return "schemaVersion";
  }
  if (!Number.isSafeInteger(s.tick) || s.tick < 0) return "tick";
  if (!Number.isSafeInteger(s.revision) || s.revision < 0) return "revision";
  if (!Number.isSafeInteger(s.storeCapacity) || s.storeCapacity <= 0)
    return "storeCapacity";
  if (!isQuantityMap(s.store)) return "store";
  if (!Number.isSafeInteger(s.storeUnits) || s.storeUnits < 0)
    return "storeUnits";
  if (!Number.isSafeInteger(s.credits) || s.credits < 0) return "credits";
  if (!Array.isArray(s.machines)) return "machines";
  const ids = new Set<number>();
  for (const m of s.machines) {
    if (!BLUEPRINTS[m.blueprint]) return `blueprint:${m.id}`;
    if (!Number.isSafeInteger(m.id) || m.id <= 0 || ids.has(m.id))
      return `machineId:${m.id}`;
    ids.add(m.id);
    if (!Number.isInteger(m.tile) || m.tile < 0) return `tile:${m.id}`;
    if (!Number.isInteger(m.level) || m.level < 1) return `level:${m.id}`;
    if (!isQuantityMap(m.inBuf)) return `inBuf:${m.id}`;
    if (!Number.isSafeInteger(m.inBufUnits) || m.inBufUnits < 0)
      return `inBufUnits:${m.id}`;
    if (!Array.isArray(m.tray)) return `tray:${m.id}`;
    if (!Array.isArray(m.batch)) return `batch:${m.id}`;
    for (const item of m.tray) {
      if (!item || !Number.isSafeInteger(item.qty) || item.qty < 0)
        return `trayQty:${m.id}`;
    }
    for (const item of m.batch) {
      if (!item || !Number.isSafeInteger(item.qty) || item.qty < 0)
        return `batchQty:${m.id}`;
    }
    if (!Number.isSafeInteger(m.progress) || m.progress < 0)
      return `progress:${m.id}`;
    for (const key of [
      "ageTicks",
      "busyTicks",
      "fullTicks",
      "starvedTicks",
      "rateAge",
      "rateFrom",
      "rateAgePrev",
      "rateFromPrev",
    ] as const) {
      const value = m[key];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        return `${key}:${m.id}`;
      }
    }
    // The fork records one named outcome per purchased level. Absent is the pre-fork
    // shape and stays valid; a damaged list is refused rather than renumbered.
    if (m.branch !== undefined) {
      if (!Array.isArray(m.branch) || m.branch.length > m.level - 1) {
        return `branch:${m.id}`;
      }
      for (const pick of m.branch) {
        if (pick !== "speed" && pick !== "buffer" && pick !== "draw") {
          return `branch:${m.id}`;
        }
      }
    }
  }
  if (!Array.isArray(s.routes)) return "routes";
  for (const r of s.routes) {
    if (!Number.isSafeInteger(r.capacity) || r.capacity <= 0)
      return `routeCapacity:${r.id}`;
    if (!Number.isSafeInteger(r.inFlight) || r.inFlight < 0)
      return `routeInFlight:${r.id}`;
    if (r.from.kind === "machine" && !ids.has(r.from.id))
      return `routeSource:${r.id}`;
    if (r.to.kind === "machine" && !ids.has(r.to.id))
      return `routeTarget:${r.id}`;
    if (!Array.isArray(r.items)) return `routeItems:${r.id}`;
    for (const item of r.items) {
      if (!Number.isSafeInteger(item.qty) || item.qty < 0)
        return `routeItemQty:${r.id}`;
      if (!Number.isSafeInteger(item.arrive)) return `routeItemArrive:${r.id}`;
    }
    for (const key of ["ageTicks", "busyTicks"] as const) {
      const value = r[key];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        return `${key}:${r.id}`;
      }
    }
    // BELT-001: the optional tile run. Absent is the pre-price shape and stays valid —
    // the stored `latency` carries the old constant meaning unchanged; present must be a
    // list of whole tile indices.
    if (
      r.run !== undefined &&
      (!Array.isArray(r.run) || r.run.some((tile) => !Number.isSafeInteger(tile) || tile < 0))
    ) {
      return `routeRun:${r.id}`;
    }
  }
  // Issue #100: output registration is DERIVED from the route table (`outputRouteIds`),
  // not stored, so there is no new plural invariant to validate and a pre-fix save whose
  // singular `outRoute` mirror named only the last of several outputs stays valid — the
  // route table is the registration, and its endpoints are already checked above by
  // `routeSource`/`routeTarget`. The load-path repair removes any dangling-endpoint orphan
  // before this runs, so a healthy, legacy or repaired state all validate to null.
  if (s.research !== undefined) {
    if (typeof s.research !== "object" || s.research === null)
      return "research";
    for (const [id, rank] of Object.entries(s.research)) {
      if (!RESEARCH[id]) return `researchNode:${id}`;
      if (!Number.isSafeInteger(rank) || (rank as number) < 0)
        return `researchRank:${id}`;
    }
  }
  if (s.spares !== undefined && !Array.isArray(s.spares)) return "spares";
  const fleet: (DroneState | undefined)[] = [
    s.drone,
    ...(Array.isArray(s.spares) ? s.spares : []),
  ];
  for (let index = 0; index < fleet.length; index += 1) {
    const unit = fleet[index];
    if (!unit || typeof unit.repaired !== "boolean") return `drone:${index}`;
    for (const key of ["accumulated", "nextDeliveryTick", "deliveries"] as const) {
      const value = unit[key];
      if (!Number.isSafeInteger(value) || value < 0) return `drone${key}:${index}`;
    }
    const flight = unit.inFlight;
    if (flight !== null) {
      if (!flight || !Number.isSafeInteger(flight.qty) || flight.qty < 0)
        return `droneFlightQty:${index}`;
      if (!Number.isSafeInteger(flight.arrive)) return `droneFlightArrive:${index}`;
    }
  }
  for (const recipe of Object.values(RECIPES)) {
    if (recipe.cycleTicks <= 0 || recipe.power <= 0)
      return `recipe:${recipe.id}`;
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
  // v1 saves written before research existed still load: the map simply starts
  // empty, so the branch is unpurchased rather than the run being reset.
  const sim = {
    ...payload.sim,
    schemaVersion: base.schemaVersion,
    research: { ...(payload.sim.research ?? {}) },
    // v1 saves written before the fleet existed simply have no spares, so the yard
    // runs on the repaired starter exactly as it did when they were written (B-28).
    spares: Array.isArray(payload.sim.spares) ? payload.sim.spares.map((unit) => unitOf(unit, true)) : [],
  };
  sim.drone = unitOf(payload.sim.drone, false);
  // v1 saves written before the measured counters existed still load: missing
  // counters become zero, so reported percentages simply cover a shorter window.
  for (const m of sim.machines ?? []) {
    m.ageTicks = countOf(m.ageTicks);
    m.busyTicks = countOf(m.busyTicks);
    m.fullTicks = countOf(m.fullTicks);
    m.starvedTicks = countOf(m.starvedTicks);
    // The rate window arrived later: a missing sample pair simply restarts the
    // window at zero, which the panel reads as "all available time" (spec 9.4).
    m.rateAge = countOf(m.rateAge);
    m.rateFrom = countOf(m.rateFrom);
    m.rateAgePrev = countOf(m.rateAgePrev);
    m.rateFromPrev = countOf(m.rateFromPrev);
    if (m.rateAgePrev > m.rateAge || m.rateFromPrev > m.rateFrom) {
      m.rateAgePrev = m.rateAge;
      m.rateFromPrev = m.rateFrom;
    }
  }
  for (const r of sim.routes ?? []) {
    r.ageTicks = countOf(r.ageTicks);
    r.busyTicks = countOf(r.busyTicks);
  }
  return { ...payload, sim };
}

function countOf(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

/**
 * One drone record with safe counters. A missing unit gets the given `repaired`
 * default: the starter arrives broken, a purchased spare arrives flying.
 */
function unitOf(unit: DroneState | undefined, repaired: boolean): DroneState {
  if (!unit) {
    return { repaired, accumulated: 0, nextDeliveryTick: 0, inFlight: null, deliveries: 0 };
  }
  return {
    repaired: unit.repaired === true,
    accumulated: countOf(unit.accumulated),
    nextDeliveryTick: countOf(unit.nextDeliveryTick),
    deliveries: countOf(unit.deliveries),
    inFlight: flightOf(unit.inFlight),
  };
}

/** An incomplete or impossible cargo leg counts as nothing in the air. */
function flightOf(value: DroneState["inFlight"]): DroneState["inFlight"] {
  if (!value) return null;
  if (!Number.isSafeInteger(value.qty) || value.qty < 0) return null;
  if (!Number.isSafeInteger(value.arrive)) return null;
  return { qty: value.qty, arrive: value.arrive };
}

/**
 * #214: the GAME_SYSTEMS starter seed grants credits up front, so a fresh yard
 * is no longer `credits === 0`. Re-anchor the credits progress marker to the
 * seed's starting balance: only credits beyond the seed signal a played yard.
 * Any spend below the seed implies a purchase (machine/spare/research marker)
 * or an advanced tick/revision, so those markers still catch it.
 */
const SEED_CREDITS = createInitialState().credits;

/**
 * UI-RESET-62: whether a loaded payload carries real yard progress, as opposed to
 * a settings-only envelope. Pre-start settings changes persist a fresh sim, so the
 * mere presence of a save is not evidence of a run worth continuing: the title
 * screen offers Continue only when one of these markers is set. Pure and total —
 * a malformed record simply reads as no progress.
 */
export function hasSaveProgress(sim: SimState | null | undefined): boolean {
  if (!sim || typeof sim !== "object") return false;
  if (Number.isSafeInteger(sim.tick) && sim.tick > 0) return true;
  if (Number.isSafeInteger(sim.revision) && sim.revision > 0) return true;
  if (Number.isSafeInteger(sim.tutorial) && sim.tutorial > 0) return true;
  if (Array.isArray(sim.machines) && sim.machines.length > 0) return true;
  if (Array.isArray(sim.routes) && sim.routes.length > 0) return true;
  if (Number.isSafeInteger(sim.credits) && sim.credits > SEED_CREDITS) return true;
  if (sim.drone && sim.drone.repaired === true) return true;
  if (Array.isArray(sim.spares) && sim.spares.length > 0) return true;
  if (sim.research && Object.keys(sim.research).length > 0) return true;
  return false;
}

/**
 * UI-RESET-62: the one destructive reset path. Removes the save envelope AND the
 * writer lease, so the reload after a reset starts a fresh yard as the writer
 * instead of being demoted to reader by a stale lease heartbeat. Storage is
 * duck-typed (removeItem may be absent on minimal test doubles) and every removal
 * is guarded: a storage failure must never turn a confirmed reset into a crash.
 * The caller reloads the page afterwards; no live store state is mutated here.
 */
export function clearSave(storage: { removeItem?: (key: string) => void } | null | undefined): void {
  if (!storage || typeof storage.removeItem !== "function") return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // A hostile or full storage must not block the reset; the reload still runs.
  }
  try {
    storage.removeItem(LEASE_KEY);
  } catch {
    // Same guard for the lease record.
  }
}
