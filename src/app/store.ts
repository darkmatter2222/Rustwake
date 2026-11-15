import { TICK_MS, type ResourceId } from "../game/content/defs";
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
import {
  clearRecoverySlot,
  preserveCorruptSave,
  readRecoverySlot,
  recoveryNoticeFor,
  type RecoveryResult,
  type SaveRecoveryNotice,
} from "../game/persistence/recovery";
// T12 (#139): session-only road slice. The world grid (#133) is not in the save
// envelope (cutover #148), so road state never touches SAVE_KEY, migration or
// recovery — it is rebuilt per session from a fixed seed.
import { createWorld } from "../game/world/terrain";
import type { Cell, Rotation, WorldState } from "../game/world/types";
import {
  createRoadNetwork,
  type RoadLanes,
  type RoadNetworkState,
} from "../game/world/roadGraph";
import {
  buildingLogisticsCell,
  buildingTakesRoadLane,
  roadSocketLinks,
  type RoadSocketLink,
} from "../game/world/roadSockets";
import {
  previewRoadPlace,
  previewRoadRemove,
  type RoadCommand,
  type RoadPlacePreview,
  type RoadRemovePreview,
} from "../game/world/roadTool";
import {
  applyRoadTransaction,
  createRoadCargo,
  spawnCargoBatch,
  tickRoadCargo,
  type CargoBatch,
  type CargoRequest,
  type RoadCargoState,
  type RoadTransactionResult,
} from "../game/simulation/roadPaths";
// T13 (#140): session-only logistics slice, same precedent as the road slice.
// Jobs/reservations never touch SAVE_KEY, migration or recovery (#148 owns the
// cutover); the ledger is rebuilt per session and advanced beside tickRoadCargo.
import {
  buildingUnits as logisticsBuildingUnits,
  cancelJob as cancelLogisticsJobFn,
  createJob as createLogisticsJobFn,
  createLogistics,
  registerBuilding as registerLogisticsBuildingFn,
  registerCarrier as registerLogisticsCarrierFn,
  seedStock as seedLogisticsStockFn,
  tickLogistics,
  type CancelJobResult,
  type CargoJob,
  type Carrier,
  type CreateJobResult,
  type JobPhase,
  type JobStatus,
  type LogisticsBuilding,
  type LogisticsJobRequest,
  type LogisticsState,
  type Reservation,
} from "../game/simulation/logistics";
// T11 (#138): session-only build placement slice. The world grid (#133) is the
// placement authority; the catalog/preview helpers are pure reads of it. Nothing
// here touches the save envelope (#148 owns world persistence).
import {
  firstFitCell,
  rotateQuarter,
  unlockStatusFor,
  type BuildUnlockContext,
} from "../game/world/buildCatalog";
import { advanceWorld } from "../game/world/engine";
import { isWorldAssetId, type WorldAssetId } from "../game/world/kit";
import {
  applyWorldCommand,
  previewDismantle,
  previewMove,
  previewRecall,
  validateDismantle,
  validateMove,
  type DismantlePreview,
  type MovePreview,
  type RecallPreview,
  type WorldCommandResult,
  type WorldRejection,
} from "../game/world/transactions";
// T14 (#141): session-only traffic authority (path cost, bay/junction capacity,
// bounded retry). Opt-in: the legacy one-cell-per-tick logistics path is the
// default until a writer enables traffic. Never touches SAVE_KEY/migration/
// recovery (#148 owns the cutover); traffic owns no cargo and never imports
// logistics, so the conservation invariant (#140) is unchanged.
import {
  configureTruck,
  createTraffic,
  setBayCapacity,
  setDefaultTruck,
  setJunctionCapacity,
  setJunctionCost,
  setRetryPolicy,
  type TrafficState,
  type TruckConfig,
} from "../game/simulation/traffic";
// G1 (#228): the world<->sim assembly join. worldAssemblySnapshot is a pure renderer
// adapter (no THREE); the store derives the build-yard snapshot the running renderer
// consumes, joining each completed build-yard building to its sim level (#148/#199 seam).
import { worldAssemblySnapshot, type AssemblySnapshot } from "../game/renderer/assembly";
import { YARD_COLS } from "../game/renderer/grid";

export type StoreRole = LeaseRole;

export interface GameStore {
  getState(): SimState;
  getSettings(): SaveSettings;
  getViewVersion(): number;
  /**
   * Q-004 C-1: the elapsed fraction of the current 100 ms tick, in [0, 1), from the
   * same monotonic frame clock the tick loop consumes. The renderer interpolates with
   * it instead of reading a clock itself; a follower measures from its last adopted
   * snapshot, which is the only timeline it owns.
   */
  getFramePhase(): number;
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

/**
 * G1 (#191): additive recovery capability. Kept off `GameStore` so existing
 * consumers and test doubles are untouched; `createStore` returns the intersection.
 * The UI notice/retry/discard wiring is owed (see the #191 handoff): the store
 * exposes the state and the actions, but no `src/ui` surface consumes them yet.
 */
export interface SaveRecoveryApi {
  /** The unresolved corrupt-save notice, or null when there is nothing to recover. */
  getSaveRecovery(): SaveRecoveryNotice | null;
  /**
   * Writer-only. Re-decodes the retained raw payload and, if it now decodes,
   * durably writes the recovered yard to `SAVE_KEY` BEFORE clearing the slot.
   * Any failure changes nothing and keeps the slot. If the yard lands but the
   * slot clear is refused, the success carries `slotClearFailed: true` (#203):
   * the slot is kept and the flag is the player-visible surface — a decodable
   * residual slot raises no notice — instead of a silent full success.
   */
  retrySaveRecovery(): RecoveryResult;
  /** The exact retained raw text (slot, or held `SAVE_KEY`), for export/backup. */
  exportSaveRecovery(): string | null;
  /** Writer-only, explicit player confirmation: erase the active corrupt payload. */
  discardSaveRecovery(): void;
}

/**
 * T12 (#139): additive road capability (G1 pattern, like `SaveRecoveryApi`).
 * Kept off `GameStore` so existing consumers and test doubles are untouched;
 * `createStore` returns the intersection.
 *
 * SESSION-ONLY: the world grid, road network and cargo are not in the save
 * envelope (the 2D -> 3D cutover #148 owns persistence). Nothing here reads or
 * writes SAVE_KEY, migration or recovery; the slice is rebuilt per session
 * from a fixed seed, so every tab starts from the same yard.
 */
export interface RoadApi {
  getWorld(): WorldState;
  getRoadNetwork(): RoadNetworkState;
  getRoadCargo(): RoadCargoState;
  /** Loading sockets of completed buildings, deterministic order. */
  getRoadSockets(): RoadSocketLink[];
  /** Pure preview: route, cost, crossings, sockets, typed rejection. */
  previewRoadPlace(cells: readonly Cell[], lanes?: RoadLanes): RoadPlacePreview;
  /** Pure dismantle preview: exact cut, refund, disconnected bays. */
  previewRoadRemove(cells: readonly Cell[]): RoadRemovePreview;
  /**
   * Writer-only atomic commit (world ledger + network + cargo paths in one
   * step). A rejected command changes nothing; the caller owns the command id
   * (idempotent replay by id, mirroring `dispatch`). Never persists: road state
   * is session-only.
   */
  commitRoad(command: RoadCommand): RoadTransactionResult;
  /**
   * Writer-only. Registers and routes a cargo batch; an unreachable request
   * still creates it (held, inspectable — E04). Returns null when the tab is
   * read-only or the amount is not a positive integer (caller validation,
   * mirroring the command layer).
   */
  spawnRoadCargo(request: CargoRequest): CargoBatch | null;
}

/**
 * T13 (#140): additive logistics capability (G1 pattern, like `RoadApi`).
 * Kept off `GameStore` so existing consumers and test doubles are untouched;
 * `createStore` returns the intersection.
 *
 * SESSION-ONLY: jobs, reservations, carriers and the per-building stock ledger
 * are not in the save envelope (the 2D -> 3D cutover #148 owns persistence).
 * Nothing here reads or writes SAVE_KEY, migration or recovery. Reads are safe
 * for any role; every mutation is writer-gated exactly like `dispatch` and
 * never calls `persist`. Jobs advance on the same authoritative tick budget as
 * the economy and road cargo, only in the owning tab.
 */
export interface LogisticsApi {
  getLogistics(): LogisticsState;
  /** All jobs, including terminal ones (inspectable history). */
  getLogisticsJobs(): CargoJob[];
  /** Active reservations only; terminal jobs release theirs. */
  getLogisticsReservations(): Reservation[];
  /**
   * Writer-only. Creates a job and reserves source stock + destination room
   * (unique reservation ids; no double-booking). Idempotent by request.id.
   * A rejection changes nothing and carries a typed reason.
   */
  createLogisticsJob(request: LogisticsJobRequest): CreateJobResult;
  /**
   * Writer-only. Cancels a job: unloaded cargo returns to source stock at
   * once; loaded cargo is recalled along the road network and returns on
   * arrival (conserved in transit if the route is cut). Idempotent.
   */
  cancelLogisticsJob(jobId: number): CancelJobResult;
  /** Writer-only session setup: register a building approach cell + capacity. */
  registerLogisticsBuilding(site: LogisticsBuilding): boolean;
  /** Writer-only session setup: the single cargo entry boundary (fixtures). */
  seedLogisticsStock(buildingId: number, resource: ResourceId, qty: number): boolean;
  /** Writer-only session setup: add a carrier; null when read-only/invalid. */
  registerLogisticsCarrier(request: { capacity: number; cell: Cell }): Carrier | null;
}

/** T11 (#138): the placement state machine's session state (U01/U02). */
export type BuildPlacementMode = "idle" | "placing" | "repeating";

export interface BuildPlacementState {
  /** The armed catalog entry, or null while browsing. */
  readonly selectedAsset: WorldAssetId | null;
  readonly rotation: Rotation;
  /** The ghost's anchor cell, or null when nothing is armed. */
  readonly ghostCell: Cell | null;
  readonly mode: BuildPlacementMode;
  /** Repeat-placement preference: survives cancel, toggled explicitly (U02). */
  readonly repeat: boolean;
  /** The last refused confirm, kept while the ghost stays armed (U03). */
  readonly lastRejection: WorldRejection | null;
  /** Successful placements this session (evidence/telemetry, never persisted). */
  readonly placedCount: number;
}

/** Selection is free; a locked entry refuses with its reason and keeps context. */
export type BuildSelectResult =
  | { ok: true }
  | { ok: false; reason: "locked" | "unknown-asset"; detail: string };

/** Confirm outcomes: the world transaction result, or a pre-transaction guard. */
export type BuildConfirmResult =
  | WorldCommandResult
  | { ok: false; reason: "no-selection" | "no-ghost" | "locked" | "read-only" };

/**
 * T11 (#138): additive build placement capability (G1 pattern, like
 * `SaveRecoveryApi`). Kept off `GameStore` so existing consumers and test
 * doubles are untouched; `createStore` returns the intersection.
 *
 * SESSION-ONLY: the world grid is not in the save envelope (the 2D -> 3D
 * cutover #148 owns persistence). Nothing here reads or writes SAVE_KEY,
 * migration or recovery; the slice is rebuilt per session from a fixed seed,
 * so every tab starts from the same yard. Selection/rotation/ghost are UI
 * intent (no spend); only `confirmBuildPlacement` touches the world ledger,
 * and it is writer-gated exactly like `dispatch`.
 */
export interface BuildPlacementApi {
  getBuildWorld(): WorldState;
  /**
   * G1 (#228): the build-yard assembly snapshot the running 3D renderer consumes,
   * derived from `worldAssemblySnapshot(buildWorld, levelOf)`. `levelOf` joins each
   * completed build-yard building to the level of a sim machine on its anchor cell
   * (the #148/#199 cutover seam); while the build yard and the sim machines are
   * disjoint it returns 1. Pure read — safe for any role, never mutates either state.
   */
  getAssemblySnapshot(): AssemblySnapshot;
  getBuildPlacement(): BuildPlacementState;
  /**
   * Arm a catalog entry. Locked entries refuse with the unlock reason and the
   * previous selection stays armed (U03). Unaffordable entries DO arm — the
   * ghost shows the exact shortfall and Confirm refuses until it is resolved.
   * Arms the ghost at the first fitting cell (deterministic).
   */
  selectBuildAsset(asset: WorldAssetId): BuildSelectResult;
  /** Quarter-turn the armed ghost (R key / Rotate face). No-op while idle. */
  rotateBuildAsset(): void;
  /** Re-aim the ghost. Integer cells only; never confirms anything (U02). */
  setBuildGhostCell(cell: Cell): void;
  /**
   * Writer-only atomic commit through `applyWorldCommand` (#133): validate ->
   * reserve -> commit in one step, idempotent by command id. A refusal changes
   * nothing and keeps the ghost armed with the typed rejection (U03). Success
   * retires the placement unless repeat mode is on, in which case the selection
   * stays armed and every next placement is validated separately (U02).
   */
  confirmBuildPlacement(): BuildConfirmResult;
  /** Explicit cancel: disarm without any command or spend (U02). */
  cancelBuildPlacement(): void;
  /** Toggle repeated-placement mode; clearly reflected in `mode` (U02). */
  toggleBuildRepeat(): void;
}

/**
 * T14 (#141): additive traffic capability, same session-only precedent as the
 * road and logistics slices. Reads are pure (any role); every mutation is
 * writer-gated exactly like `dispatch` and never calls `persist`. Traffic is
 * OPT-IN: until a writer calls `enableTraffic`, `tickLogistics` runs the legacy
 * one-cell-per-tick path byte-for-byte, so default behavior is unchanged.
 * Config setters delegate validation to the traffic authority (false on
 * invalid input, no mutation); they shape future ticks, not the cargo ledger.
 */
export interface TrafficApi {
  /** Pure read: the session-only traffic authority (any role). */
  getTraffic(): TrafficState;
  /** Whether the traffic movement model is active (default false = legacy). */
  isTrafficEnabled(): boolean;
  /** Writer-only. Opt into the traffic movement model; idempotent. */
  enableTraffic(): boolean;
  /** Writer-only. Default truck profile (speed/loadTicks/unloadTicks). */
  setTrafficDefaultTruck(config: Partial<TruckConfig>): boolean;
  /** Writer-only. Override one carrier's truck profile. */
  configureTrafficTruck(carrierId: number, config: Partial<TruckConfig>): boolean;
  /** Writer-only. Cap a bay cell's simultaneous load/unload slots (>=1). */
  setTrafficBayCapacity(cell: Cell, capacity: number): boolean;
  /** Writer-only. Cap junction occupancy, or null for unlimited. */
  setTrafficJunctionCapacity(capacity: number | null): boolean;
  /** Writer-only. Extra movement-point cost to enter a junction cell (>=0). */
  setTrafficJunctionCost(cost: number): boolean;
  /** Writer-only. Bounded retry/backoff policy for blocked routes. */
  setTrafficRetryPolicy(policy: {
    maxRetries?: number;
    baseBackoff?: number;
    maxBackoff?: number;
  }): boolean;
}

/**
 * T19 (#146): additive lifecycle capability — safe MOVE, DISMANTLE and CARGO
 * RECALL — same session-only precedent as the road/logistics/build slices.
 * Reads/previews are pure (any role); every commit is writer-gated exactly like
 * `dispatch` and never calls `persist`. The world ledger (buildWorld) and the
 * logistics ledger are mutated together only after ALL validation is pure and
 * complete, so a refusal changes neither. Cargo is conserved across recall:
 * in-transit goods return to their source building, dismantle inventory moves
 * to a declared recovery building, and overflow construction material returns
 * to free stock via `world.recall`. Nothing here touches SAVE_KEY/migration/
 * recovery (#148 owns the cutover).
 *
 * Convention: a logistics building id matches the buildWorld building id. As of
 * #217 (session-only) a road-taking building's approach cell is its first
 * road-taking socket's approach cell, so bay-editor capacity gates the cell jobs
 * lease; socket-less assets fall back to the footprint-origin cell. The #148
 * cutover owns persistence and real per-building capacity.
 */
export interface LifecycleAffectedJob {
  readonly jobId: number;
  readonly sourceBuildingId: number;
  readonly destBuildingId: number;
  readonly cargoType: ResourceId;
  readonly status: JobStatus;
  readonly phase: JobPhase;
  readonly atSource: number;
  readonly inTransit: number;
}

/** Typed, recoverable blockers for lifecycle commits (matched on `reason`). */
export type LifecycleBlocker =
  | { reason: "read-only" }
  | { reason: "cargo-not-drained"; buildingId: number; jobIds: number[] }
  | { reason: "inventory-present"; buildingId: number; units: number }
  | { reason: "unknown-recovery"; buildingId: number }
  | { reason: "recovery-full"; buildingId: number; need: number; have: number };

export interface MoveBuildingPreview {
  /** Pure world preview: fee + placement-law rejection. */
  readonly world: MovePreview;
  /** Non-terminal jobs that a move would recall first. */
  readonly affectedJobs: LifecycleAffectedJob[];
}

export interface DismantleBuildingPreview {
  /** Pure world preview: refund, lost share, overflow split. */
  readonly world: DismantlePreview;
  readonly affectedJobs: LifecycleAffectedJob[];
  /** True when every job touching the building is terminal (safe to dismantle). */
  readonly cargoDrained: boolean;
  /** Free logistics inventory still held by the building. */
  readonly inventoryUnits: number;
  /** Recovery room when a recovery building is declared, else null. */
  readonly recovery: { readonly buildingId: number; readonly room: number } | null;
  /** The exact blocker a commit would hit right now, or null when clear. */
  readonly blocker: LifecycleBlocker | null;
}

export interface RecallCargoPreview {
  readonly affectedJobs: LifecycleAffectedJob[];
  /** Pure world overflow-recovery preview. */
  readonly overflow: RecallPreview;
}

export type LifecycleResult =
  | { ok: true; revision: number; recalledJobIds: number[] }
  | { ok: false; rejection: WorldRejection | LifecycleBlocker };

export type RecallCargoResult =
  | { ok: true; revision: number; recalledJobIds: number[]; recoveredOverflowUnits: number }
  | { ok: false; rejection: LifecycleBlocker };

export interface LifecycleApi {
  /** Pure preview (any role): move fee, validity and the jobs a move recalls. */
  previewMoveBuilding(buildingId: number, cell: Cell, rotation: number): MoveBuildingPreview;
  /** Pure preview (any role): refund/lost/overflow + cargo-drain/recovery blockers. */
  previewDismantleBuilding(buildingId: number, recoveryBuildingId?: number): DismantleBuildingPreview;
  /** Pure preview (any role): jobs a recall cancels + overflow units it recovers. */
  previewRecallCargo(buildingId?: number): RecallCargoPreview;
  /**
   * Writer-only. Recalls affected cargo, moves the building (preserving id and
   * completedTick), then re-registers its logistics approach cell. Idempotent by
   * command id; a refusal changes nothing.
   */
  moveBuilding(buildingId: number, cell: Cell, rotation: number): LifecycleResult;
  /**
   * Writer-only. Requires cargo drained (all touching jobs terminal) and any
   * inventory transferred to a declared recovery building with room; then
   * refunds build materials and removes the building from both ledgers.
   */
  dismantleBuilding(buildingId: number, recoveryBuildingId?: number): LifecycleResult;
  /**
   * Writer-only. Cancels non-terminal jobs touching the building (or all), and
   * recovers overflow construction material into free stock (`world.recall`).
   */
  recallCargo(buildingId?: number): RecallCargoResult;
}

const MAX_TICKS_PER_FRAME = 20;
/** T12 (#139): fixed seed for the session-only world grid (deterministic yard). */
const ROAD_SESSION_SEED = 139;
/** T11 (#138): fixed seed for the session-only build yard (deterministic). */
const BUILD_SESSION_SEED = 138;
/**
 * #217 (session-only): default logistics storage capacity for a building that
 * auto-registers on completion. The kit declares no per-building storage field
 * yet, so this matches the session fixtures' placeholder (50 units); the #148
 * cutover will wire real per-building capacity. Never persisted.
 */
const DEFAULT_BUILDING_LOGISTICS_CAPACITY = 50;
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
export function createStore(
  options: StoreOptions = {},
): GameStore & SaveRecoveryApi & RoadApi & LogisticsApi & BuildPlacementApi & TrafficApi & LifecycleApi {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  // Two clocks on purpose: `now` is the absolute wall clock shared by every tab
  // and by reloads (epoch ms), while the frame delta uses the monotonic
  // page-relative timeline. `performance.now()` restarts per document, so it
  // cannot measure an absence or a lease timeout.
  const now = options.now ?? defaultWallClock;
  const frameClock =
    options.frameClock ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const lease = storage ? createLease(storage, now, options.leaseId ?? nextLeaseId()) : null;
  const bootRaw = storage ? safeGet(storage, SAVE_KEY) : null;
  const loaded = decodeSave(bootRaw);
  let state: SimState = loaded.ok ? migrate(loaded.payload).sim : createInitialState();
  let settings: SaveSettings = loaded.ok ? { ...DEFAULT_SETTINGS, ...loaded.payload.settings } : { ...DEFAULT_SETTINGS };
  let lastSeenMs = loaded.ok ? loaded.payload.lastSeenMs : now();

  // G1 (#191): a corrupt boot must never erase the player's history. Retain the raw
  // bytes write-once in a parallel recovery slot BEFORE anything can overwrite
  // SAVE_KEY, then derive a player-visible notice. A fresh yard is only a fallback,
  // and while the raw bytes could not be copied (`recoveryHeld`) SAVE_KEY writes are
  // suppressed so the original survives in place. The notice and hold are pure
  // functions of storage content, re-derived after every resolution so they cannot
  // drift; an older occupied slot re-surfaces once the active one is resolved.
  let recoveryNotice: SaveRecoveryNotice | null = null;
  let recoveryHeld = false;
  const recoverySignature = (notice: SaveRecoveryNotice | null, held: boolean): string =>
    notice
      ? `${notice.preserved ? 1 : 0}|${notice.reason}|${notice.detail ?? ""}|${notice.textLength}`
      : held
        ? "held"
        : "";
  const refreshRecovery = (): boolean => {
    const previous = recoverySignature(recoveryNotice, recoveryHeld);
    if (!storage) {
      recoveryNotice = null;
      recoveryHeld = false;
    } else {
      const saveRaw = safeGet(storage, SAVE_KEY);
      const slotRaw = readRecoverySlot(storage);
      const saveDecoded = decodeSave(saveRaw);
      const saveCorrupt =
        saveRaw !== null && saveRaw.length > 0 && !saveDecoded.ok && saveDecoded.reason !== "empty";
      if (slotRaw !== null) {
        if (saveCorrupt && saveRaw !== slotRaw) {
          // A newer corruption sits in SAVE_KEY that the occupied slot does not hold.
          recoveryHeld = true;
          recoveryNotice = recoveryNoticeFor(saveRaw, false);
        } else {
          recoveryHeld = false;
          recoveryNotice = recoveryNoticeFor(slotRaw, true);
        }
      } else if (saveCorrupt) {
        recoveryHeld = true;
        recoveryNotice = recoveryNoticeFor(saveRaw, false);
      } else {
        recoveryHeld = false;
        recoveryNotice = null;
      }
    }
    return recoverySignature(recoveryNotice, recoveryHeld) !== previous;
  };
  if (storage && !loaded.ok && loaded.reason !== "empty") {
    preserveCorruptSave(storage, bootRaw);
  }
  refreshRecovery();

  // T12 (#139): session-only road slice. A fixed seed rebuilds the identical
  // world grid in every tab; no storage read/write happens here. Road state is
  // disjoint from the SimState snapshot, so catch-up adoption never touches it.
  const roadWorld = createWorld(ROAD_SESSION_SEED);
  const roadNet = createRoadNetwork();
  const roadCargo = createRoadCargo();
  // T13 (#140): session-only logistics ledger, disjoint from the SimState
  // snapshot for the same reason — catch-up adoption never touches it.
  const logistics = createLogistics();
  // T11 (#138): session-only build slice. A fixed seed rebuilds the identical
  // world grid in every tab; no storage read/write happens here. The build yard
  // is disjoint from the SimState snapshot, so catch-up adoption never touches
  // it, and `persist` never serializes it (#148 owns the cutover).
  const buildWorld = createWorld(BUILD_SESSION_SEED);
  let buildPlacement: BuildPlacementState = {
    selectedAsset: null,
    rotation: 0,
    ghostCell: null,
    mode: "idle",
    repeat: false,
    lastRejection: null,
    placedCount: 0,
  };
  let buildCommandSeq = 0;
  // T19 (#146): idempotent command ids for lifecycle world transactions.
  let lifecycleCommandSeq = 0;
  const buildUnlockContext = (): BuildUnlockContext => ({
    research: state.research ?? {},
    milestoneTokens: buildWorld.milestoneTokens,
  });
  // T14 (#141): session-only traffic authority, disjoint from the snapshot for
  // the same reason. Opt-in (default off) so the legacy logistics tick is
  // unchanged until a writer enables it; never persisted (#148 owns cutover).
  const traffic = createTraffic();
  let trafficEnabled = false;

  // #217 (session-only): advance the build yard and surface completed buildings
  // to the logistics ledger. Construction settles inside `advanceWorld`; when a
  // site becomes a completed building we auto-register it IF it declares a
  // road-taking socket, at that socket's approach cell (buildingLogisticsCell).
  // This is the deferred wiring the #146 convention comment promised: the bay
  // editor writes capacity at approach cells, and logistics jobs lease bays at
  // the registered cell, so the two must coincide for capacity to gate anything.
  // Bounded (the scan runs only on a tick that settled a site), idempotent
  // (already-registered buildings are skipped, preserving manual capacity), and
  // never persisted — the logistics ledger stays disjoint from the save (#148).
  const settleBuildWorld = (ticks: number): void => {
    const before = buildWorld.buildings.length;
    advanceWorld(buildWorld, ticks);
    if (buildWorld.buildings.length === before) return;
    for (const building of buildWorld.buildings) {
      if (logistics.buildings[building.id] !== undefined) continue;
      if (!buildingTakesRoadLane(building)) continue;
      registerLogisticsBuildingFn(logistics, {
        id: building.id,
        cell: buildingLogisticsCell(building),
        capacity: DEFAULT_BUILDING_LOGISTICS_CAPACITY,
      });
    }
  };

  let role: StoreRole = lease ? lease.claim(state.revision) : "writer";

  const listeners = new Set<() => void>();
  let viewVersion = 0;
  let frame = 0;
  let accumulator = 0;
  let lastFrameMs = frameClock();
  let sinceSave = 0;
  let sinceReconcile = 0;
  /** Q-004 C-1: the frame-time base of the timeline the current snapshot carries. */
  let adoptedAtFrame = frameClock();

  const notify = () => {
    viewVersion += 1;
    for (const listener of listeners) listener();
  };

  const persist = () => {
    if (!storage) return;
    if (lease) role = lease.claim(state.revision);
    // G1 (#191): while a corrupt payload is held in place (the recovery copy could
    // not be written), never overwrite SAVE_KEY — that raw text is the only copy.
    // The fresh yard stays session-only until the player recovers or discards.
    if (recoveryHeld) return;
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
    adoptedAtFrame = frameClock();
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
      const incomingRaw = safeGet(storage, SAVE_KEY);
      const incoming = decodeSave(incomingRaw);
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
      } else if (!incoming.ok && incoming.reason !== "empty") {
        // G1 (#191): an externally corrupted checkpoint is retained write-once here
        // too, so a follower or a later reconcile never lets the raw bytes vanish.
        // This is a safety write, not an economy write, so it is not writer-gated.
        preserveCorruptSave(storage, incomingRaw);
      }
      if (refreshRecovery()) changed = true;
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
      // T12 (#139): cargo rides the same authoritative tick budget (one cell
      // per tick). Session-only: never persisted, never advanced by a reader.
      tickRoadCargo(roadCargo, ticks);
      // T13 (#140): logistics jobs ride the same budget, after road cargo.
      // T14 (#141): traffic is opt-in; undefined keeps the legacy tick path.
      tickLogistics(logistics, roadNet, ticks, trafficEnabled ? traffic : undefined);
      // #217: the build yard rides the same authoritative budget so construction
      // completes in the live loop and completed sockets reach the bay editor.
      settleBuildWorld(ticks);
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

  // T19 (#146): lifecycle helpers. Pure reads feed the previews; the commit
  // methods validate EVERYTHING (world law + cargo drain + recovery room)
  // before the first mutation, so a refusal leaves both ledgers byte-identical.
  const isTerminalJob = (job: CargoJob): boolean => job.status === "complete" || job.status === "cancelled";
  const affectedJobs = (buildingId?: number): CargoJob[] =>
    logistics.jobs.filter(
      (job) =>
        !isTerminalJob(job) &&
        (buildingId === undefined || job.sourceBuildingId === buildingId || job.destBuildingId === buildingId),
    );
  const toAffectedJob = (job: CargoJob): LifecycleAffectedJob => ({
    jobId: job.id,
    sourceBuildingId: job.sourceBuildingId,
    destBuildingId: job.destBuildingId,
    cargoType: job.cargoType,
    status: job.status,
    phase: job.phase,
    atSource: job.atSource,
    inTransit: job.inTransit,
  });
  /** Cancel each non-terminal job; cargo is conserved by cancelJob itself. */
  const recallJobs = (jobs: CargoJob[]): number[] => {
    const ids: number[] = [];
    for (const job of jobs) {
      cancelLogisticsJobFn(logistics, roadNet, job.id);
      ids.push(job.id);
    }
    return ids;
  };
  /** The exact dismantle blocker right now; shared by preview and commit. */
  const dismantleBlocker = (buildingId: number, recoveryBuildingId?: number): LifecycleBlocker | null => {
    const jobs = affectedJobs(buildingId);
    if (jobs.length > 0) return { reason: "cargo-not-drained", buildingId, jobIds: jobs.map((j) => j.id) };
    const units = logisticsBuildingUnits(logistics, buildingId);
    if (units > 0) {
      if (recoveryBuildingId === undefined) return { reason: "inventory-present", buildingId, units };
      if (recoveryBuildingId === buildingId || logistics.buildings[recoveryBuildingId] === undefined) {
        return { reason: "unknown-recovery", buildingId: recoveryBuildingId };
      }
      const room = logistics.buildings[recoveryBuildingId].capacity - logisticsBuildingUnits(logistics, recoveryBuildingId);
      if (room < units) return { reason: "recovery-full", buildingId: recoveryBuildingId, need: units, have: room };
    }
    return null;
  };
  /** Move all free inventory between buildings (deduct+add in one step). */
  const transferInventory = (from: number, to: number): void => {
    const stock = logistics.stocks[from];
    if (stock === undefined) return;
    const dest = logistics.stocks[to] ?? (logistics.stocks[to] = {});
    for (const key of Object.keys(stock) as ResourceId[]) {
      const qty = stock[key] ?? 0;
      if (qty <= 0) continue;
      dest[key] = (dest[key] ?? 0) + qty;
      stock[key] = 0;
    }
  };

  return {
    getState: () => state,
    getSettings: () => settings,
    getViewVersion: () => viewVersion,
    getFramePhase() {
      // The owner's phase is the tick remainder the frame loop left in the
      // accumulator; a follower has no accumulator of its own, so it measures from
      // the moment it adopted. Neither branch reads Date.now (A10).
      const elapsed = role === "reader" ? frameClock() - adoptedAtFrame : accumulator;
      return Math.min(1, Math.max(0, elapsed / TICK_MS));
    },
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
    getSaveRecovery(): SaveRecoveryNotice | null {
      return recoveryNotice;
    },
    retrySaveRecovery(): RecoveryResult {
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, reason: "read-only" };
      if (!storage) return { ok: false, reason: "no-slot" };
      const slotRaw = readRecoverySlot(storage);
      const saveRaw = safeGet(storage, SAVE_KEY);
      // Prefer the recovery slot; with no slot, a held SAVE_KEY raw is the target.
      const target = slotRaw !== null ? slotRaw : recoveryHeld ? saveRaw : null;
      if (target === null || target.length === 0) return { ok: false, reason: "no-slot" };
      // Guard the rare double-corruption case: adopting the slot must not overwrite a
      // DIFFERENT corrupt raw that is only held in place in SAVE_KEY. Refuse; nothing
      // changes. The player resolves the held payload first (export/discard).
      if (slotRaw !== null && recoveryHeld && saveRaw !== null && saveRaw.length > 0 && saveRaw !== slotRaw) {
        const saveDecoded = decodeSave(saveRaw);
        if (!saveDecoded.ok && saveDecoded.reason !== "empty") {
          return { ok: false, reason: "storage", detail: "save-key-corrupt" };
        }
      }
      const decoded = decodeSave(target);
      if (!decoded.ok) return { ok: false, reason: decoded.reason, detail: decoded.detail };
      // Transactional: the recovered yard must be durably written to SAVE_KEY BEFORE
      // the corrupt slot is cleared, so a storage failure loses nothing. The raw
      // slot text is never rewritten — only the freshly encoded, valid yard lands.
      const next = migrate(decoded.payload);
      const nextSettings = { ...DEFAULT_SETTINGS, ...next.settings };
      try {
        storage.setItem(SAVE_KEY, encodeSave(next.sim, now(), nextSettings));
      } catch {
        return { ok: false, reason: "storage" };
      }
      state = next.sim;
      settings = nextSettings;
      lastSeenMs = now();
      // G1 (#203): the yard is durable, but a refused slot clear must not be a
      // silent full success. Keep the write-once slot and surface the failure;
      // refreshRecovery re-derives the notice from the still-occupied slot, so
      // retry/discard stay available and the raw bytes are never lost.
      const slotClearFailed = slotRaw !== null && !clearRecoverySlot(storage);
      refreshRecovery();
      notify();
      const result: RecoveryResult = { ok: true, tick: state.tick, machines: state.machines.length };
      if (slotClearFailed) result.slotClearFailed = true;
      return result;
    },
    exportSaveRecovery(): string | null {
      if (!storage) return null;
      const slotRaw = readRecoverySlot(storage);
      if (slotRaw !== null) return slotRaw;
      return recoveryHeld ? safeGet(storage, SAVE_KEY) : null;
    },
    discardSaveRecovery(): void {
      if (reconcile()) notify();
      if (role !== "writer" || !storage || !recoveryNotice) return;
      const target = recoveryNotice.preserved ? readRecoverySlot(storage) : safeGet(storage, SAVE_KEY);
      // Erase exactly the confirmed text from wherever it lives. An older unresolved
      // slot (the occupied case) is left intact and re-surfaces via refreshRecovery.
      if (target !== null) {
        if (readRecoverySlot(storage) === target) clearRecoverySlot(storage);
        if (safeGet(storage, SAVE_KEY) === target) {
          try {
            if (typeof storage.removeItem === "function") storage.removeItem(SAVE_KEY);
            else storage.setItem(SAVE_KEY, "");
          } catch {
            // Best-effort: the notice re-derives honestly if storage refused.
          }
        }
      }
      refreshRecovery();
      notify();
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
      tickRoadCargo(roadCargo, ticks);
      // T14 (#141): traffic is opt-in; undefined keeps the legacy tick path.
      tickLogistics(logistics, roadNet, ticks, trafficEnabled ? traffic : undefined);
      // T11 (#138): construction sites advance with the same authoritative
      // ticks (5 s assembly, #133 engine). #217: completion also auto-registers
      // road-taking buildings to their socket approach cells. Session-only.
      settleBuildWorld(ticks);
      lastSeenMs = now();
      persist();
      notify();
    },
    // T12 (#139): additive road capability. Previews are pure (safe for any
    // role); commits are writer-gated exactly like `dispatch` and never call
    // `persist` — road state is session-only (#148 owns persistence).
    getWorld: () => roadWorld,
    getRoadNetwork: () => roadNet,
    getRoadCargo: () => roadCargo,
    // #217: sockets belong to COMPLETED player buildings, which live in
    // buildWorld (seed 138), not the road-only roadWorld (seed 139) that never
    // receives buildings. roadSocketLinks reads only world.buildings, so this
    // projection is safe; roadTool keeps using roadWorld for placement law.
    getRoadSockets: () => roadSocketLinks(roadNet, buildWorld),
    previewRoadPlace: (cells, lanes = 1) => previewRoadPlace(roadWorld, roadNet, cells, lanes),
    previewRoadRemove: (cells) => previewRoadRemove(roadWorld, roadNet, cells),
    commitRoad(command: RoadCommand): RoadTransactionResult {
      if (reconcile()) notify();
      if (role !== "writer") {
        return { result: { ok: false, rejection: { reason: "read-only" } }, invalidation: null };
      }
      const outcome = applyRoadTransaction(roadWorld, roadNet, roadCargo, command);
      if (outcome.result.ok) notify();
      return outcome;
    },
    spawnRoadCargo(request: CargoRequest): CargoBatch | null {
      if (reconcile()) notify();
      if (role !== "writer") return null;
      if (!Number.isInteger(request.amount) || request.amount <= 0) return null;
      const batch = spawnCargoBatch(roadCargo, roadNet, request);
      notify();
      return batch;
    },
    // T13 (#140): additive logistics capability. Reads are pure (any role);
    // mutations are writer-gated exactly like `dispatch` and never call
    // `persist` — the logistics ledger is session-only (#148 owns persistence).
    getLogistics: () => logistics,
    getLogisticsJobs: () => logistics.jobs,
    getLogisticsReservations: () => logistics.reservations,
    createLogisticsJob(request: LogisticsJobRequest): CreateJobResult {
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, reason: { reason: "read-only" } };
      const result = createLogisticsJobFn(logistics, request);
      if (result.ok) notify();
      return result;
    },
    cancelLogisticsJob(jobId: number): CancelJobResult {
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, reason: { reason: "read-only" } };
      const result = cancelLogisticsJobFn(logistics, roadNet, jobId);
      if (result.ok) notify();
      return result;
    },
    registerLogisticsBuilding(site: LogisticsBuilding): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = registerLogisticsBuildingFn(logistics, site);
      if (ok) notify();
      return ok;
    },
    seedLogisticsStock(buildingId: number, resource: ResourceId, qty: number): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = seedLogisticsStockFn(logistics, buildingId, resource, qty);
      if (ok) notify();
      return ok;
    },
    registerLogisticsCarrier(request: { capacity: number; cell: Cell }): Carrier | null {
      if (reconcile()) notify();
      if (role !== "writer") return null;
      const carrier = registerLogisticsCarrierFn(logistics, request);
      if (carrier !== null) notify();
      return carrier;
    },
    // T11 (#138): additive build placement capability. Selection/rotation/ghost
    // are UI intent (no spend, any role); the confirm is writer-gated exactly
    // like `dispatch` and never calls `persist` — the build yard is session-only
    // (#148 owns persistence). Previews stay pure reads of `getBuildWorld()`.
    getBuildWorld: () => buildWorld,
    getAssemblySnapshot(): AssemblySnapshot {
      // G1 (#228): the world<->sim join. Index sim levels by tile and build-yard anchor
      // cells by building id once per call (O(machines + buildings)), then hand the adapter
      // a levelOf lookup. The build yard and the sim machines are disjoint today —
      // confirmBuildPlacement writes only buildWorld, never buildMachine — so a completed
      // yard building has no sim machine on its cell and the join returns 1. The seam is
      // wired now so the #148/#199 cutover only populates the mapping; the running renderer
      // already consumes the level (upgrade modules) without any further change.
      const levelByTile = new Map<number, number>();
      for (const m of state.machines) levelByTile.set(m.tile, m.level);
      const tileByBuilding = new Map<number, number>();
      for (const b of buildWorld.buildings) {
        tileByBuilding.set(b.id, b.cell.y * YARD_COLS + b.cell.x);
      }
      const levelOf = (buildingId: number): number =>
        levelByTile.get(tileByBuilding.get(buildingId) ?? -1) ?? 1;
      return worldAssemblySnapshot(buildWorld, levelOf);
    },
    getBuildPlacement: () => buildPlacement,
    selectBuildAsset(asset: WorldAssetId): BuildSelectResult {
      if (!isWorldAssetId(asset)) {
        return { ok: false, reason: "unknown-asset", detail: `Unknown asset: ${String(asset)}` };
      }
      const unlock = unlockStatusFor(asset, buildUnlockContext());
      if (!unlock.unlocked) {
        // U03: refuse with the reason; the previous selection stays armed.
        return { ok: false, reason: "locked", detail: unlock.reason ?? "Locked" };
      }
      const ghost = firstFitCell(buildWorld, asset, buildPlacement.rotation) ?? { x: 0, y: 0 };
      buildPlacement = {
        ...buildPlacement,
        selectedAsset: asset,
        ghostCell: ghost,
        mode: buildPlacement.repeat ? "repeating" : "placing",
        lastRejection: null,
      };
      notify();
      return { ok: true };
    },
    rotateBuildAsset(): void {
      if (buildPlacement.selectedAsset === null) return;
      buildPlacement = {
        ...buildPlacement,
        rotation: rotateQuarter(buildPlacement.rotation),
        lastRejection: null,
      };
      notify();
    },
    setBuildGhostCell(cell: Cell): void {
      if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return;
      buildPlacement = {
        ...buildPlacement,
        ghostCell: { x: cell.x, y: cell.y },
        lastRejection: null,
      };
      notify();
    },
    confirmBuildPlacement(): BuildConfirmResult {
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, reason: "read-only" };
      const { selectedAsset, ghostCell, rotation } = buildPlacement;
      if (selectedAsset === null) return { ok: false, reason: "no-selection" };
      if (ghostCell === null) return { ok: false, reason: "no-ghost" };
      const unlock = unlockStatusFor(selectedAsset, buildUnlockContext());
      if (!unlock.unlocked) return { ok: false, reason: "locked" };
      buildCommandSeq += 1;
      const result = applyWorldCommand(buildWorld, {
        id: `build-138-${buildCommandSeq}`,
        type: "world.place",
        asset: selectedAsset,
        cell: ghostCell,
        rotation,
      });
      if (result.ok) {
        buildPlacement = buildPlacement.repeat
          ? {
              ...buildPlacement,
              mode: "repeating",
              lastRejection: null,
              placedCount: buildPlacement.placedCount + 1,
            }
          : {
              ...buildPlacement,
              selectedAsset: null,
              ghostCell: null,
              mode: "idle",
              lastRejection: null,
              placedCount: buildPlacement.placedCount + 1,
            };
      } else {
        // Preserve-on-refusal: the ghost stays armed with the typed reason so
        // the player can re-aim or top up and try again (U03).
        buildPlacement = { ...buildPlacement, lastRejection: result.rejection };
      }
      notify();
      return result;
    },
    cancelBuildPlacement(): void {
      buildPlacement = {
        ...buildPlacement,
        selectedAsset: null,
        ghostCell: null,
        rotation: 0,
        mode: "idle",
        lastRejection: null,
      };
      notify();
    },
    toggleBuildRepeat(): void {
      const repeat = !buildPlacement.repeat;
      buildPlacement = {
        ...buildPlacement,
        repeat,
        mode:
          buildPlacement.selectedAsset === null ? "idle" : repeat ? "repeating" : "placing",
      };
      notify();
    },
    // T14 (#141): additive traffic capability. Reads are pure (any role);
    // mutations are writer-gated exactly like `dispatch` and never call
    // `persist` — traffic is session-only (#148 owns persistence). Opt-in:
    // until a writer enables traffic the legacy tick path runs unchanged.
    // Config setters delegate validation to the traffic authority (false on
    // invalid input, no mutation); they shape future ticks, not the ledger.
    getTraffic: () => traffic,
    isTrafficEnabled: () => trafficEnabled,
    enableTraffic(): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      trafficEnabled = true;
      notify();
      return true;
    },
    setTrafficDefaultTruck(config: Partial<TruckConfig>): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = setDefaultTruck(traffic, config);
      if (ok) notify();
      return ok;
    },
    configureTrafficTruck(carrierId: number, config: Partial<TruckConfig>): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = configureTruck(traffic, carrierId, config);
      if (ok) notify();
      return ok;
    },
    setTrafficBayCapacity(cell: Cell, capacity: number): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = setBayCapacity(traffic, cell, capacity);
      if (ok) notify();
      return ok;
    },
    setTrafficJunctionCapacity(capacity: number | null): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = setJunctionCapacity(traffic, capacity);
      if (ok) notify();
      return ok;
    },
    setTrafficJunctionCost(cost: number): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = setJunctionCost(traffic, cost);
      if (ok) notify();
      return ok;
    },
    setTrafficRetryPolicy(policy: { maxRetries?: number; baseBackoff?: number; maxBackoff?: number }): boolean {
      if (reconcile()) notify();
      if (role !== "writer") return false;
      const ok = setRetryPolicy(traffic, policy);
      if (ok) notify();
      return ok;
    },
    // T19 (#146): safe move / dismantle / cargo recall. Session-only slice over
    // the world build yard + logistics ledger (#148 owns persistence); commits
    // are writer-gated and never call persist. Previews are pure reads for any
    // role. Every commit validates world law AND cargo/recovery state before
    // the first mutation, so a refusal leaves both ledgers byte-identical.
    previewMoveBuilding(buildingId: number, cell: Cell, rotation: number): MoveBuildingPreview {
      return {
        world: previewMove(buildWorld, buildingId, cell, rotation),
        affectedJobs: affectedJobs(buildingId).map(toAffectedJob),
      };
    },
    previewDismantleBuilding(buildingId: number, recoveryBuildingId?: number): DismantleBuildingPreview {
      const jobs = affectedJobs(buildingId);
      const recoveryBuilding = recoveryBuildingId !== undefined ? logistics.buildings[recoveryBuildingId] : undefined;
      const recovery =
        recoveryBuilding !== undefined
          ? { buildingId: recoveryBuildingId as number, room: recoveryBuilding.capacity - logisticsBuildingUnits(logistics, recoveryBuildingId as number) }
          : null;
      return {
        world: previewDismantle(buildWorld, buildingId),
        affectedJobs: jobs.map(toAffectedJob),
        cargoDrained: jobs.length === 0,
        inventoryUnits: logisticsBuildingUnits(logistics, buildingId),
        recovery,
        blocker: dismantleBlocker(buildingId, recoveryBuildingId),
      };
    },
    previewRecallCargo(buildingId?: number): RecallCargoPreview {
      return {
        affectedJobs: affectedJobs(buildingId).map(toAffectedJob),
        overflow: previewRecall(buildWorld, buildingId),
      };
    },
    moveBuilding(buildingId: number, cell: Cell, rotation: number): LifecycleResult {
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, rejection: { reason: "read-only" } };
      const rejection = validateMove(buildWorld, buildingId, cell, rotation);
      if (rejection !== null) return { ok: false, rejection };
      // Validation complete. Recall affected cargo first (cancelJob conserves
      // it), then apply the atomic world move, then retarget the approach cell.
      const recalledJobIds = recallJobs(affectedJobs(buildingId));
      lifecycleCommandSeq += 1;
      const result = applyWorldCommand(buildWorld, {
        id: `lifecycle-146-${lifecycleCommandSeq}`,
        type: "world.move",
        buildingId,
        cell,
        rotation,
      });
      if (!result.ok) return { ok: false, rejection: result.rejection };
      const lb = logistics.buildings[buildingId];
      if (lb !== undefined) {
        // #217: retarget the registration to the moved building's socket approach
        // cell (same rule as completion), preserving its capacity. Assets without
        // a road lane fall back to the footprint-origin cell, so a manually
        // registered socket-less building keeps its prior convention.
        const moved = buildWorld.buildings.find((b) => b.id === buildingId);
        const approach = moved !== undefined ? buildingLogisticsCell(moved) : { x: cell.x, y: cell.y };
        registerLogisticsBuildingFn(logistics, { id: buildingId, cell: approach, capacity: lb.capacity });
      }
      notify();
      return { ok: true, revision: result.revision, recalledJobIds };
    },
    dismantleBuilding(buildingId: number, recoveryBuildingId?: number): LifecycleResult {
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, rejection: { reason: "read-only" } };
      const worldRejection = validateDismantle(buildWorld, buildingId);
      if (worldRejection !== null) return { ok: false, rejection: worldRejection };
      const blocker = dismantleBlocker(buildingId, recoveryBuildingId);
      if (blocker !== null) return { ok: false, rejection: blocker };
      // Validation complete. Move free inventory to recovery (deduct+add), then
      // settle the atomic world dismantle (refund + overflow, exactly once).
      if (recoveryBuildingId !== undefined && logisticsBuildingUnits(logistics, buildingId) > 0) {
        transferInventory(buildingId, recoveryBuildingId);
      }
      lifecycleCommandSeq += 1;
      const result = applyWorldCommand(buildWorld, {
        id: `lifecycle-146-${lifecycleCommandSeq}`,
        type: "world.dismantle",
        buildingId,
      });
      if (!result.ok) return { ok: false, rejection: result.rejection };
      // logistics.ts (read-only) exposes no unregister API; drop the now-empty
      // registry entry so no future job can target a dismantled building.
      delete logistics.buildings[buildingId];
      delete logistics.stocks[buildingId];
      notify();
      return { ok: true, revision: result.revision, recalledJobIds: [] };
    },
    recallCargo(buildingId?: number): RecallCargoResult {
      if (reconcile()) notify();
      if (role !== "writer") return { ok: false, rejection: { reason: "read-only" } };
      const recoveredOverflowUnits = previewRecall(buildWorld, buildingId).recoveredUnits;
      const recalledJobIds = recallJobs(affectedJobs(buildingId));
      lifecycleCommandSeq += 1;
      const result = applyWorldCommand(buildWorld, {
        id: `lifecycle-146-${lifecycleCommandSeq}`,
        type: "world.recall",
        buildingId,
      });
      // world.recall has no failure mode (drains overflow to free stock).
      const revision = result.ok ? result.revision : buildWorld.revision;
      notify();
      return { ok: true, revision, recalledJobIds, recoveredOverflowUnits };
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
