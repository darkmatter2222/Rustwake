import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { BuildPlacementApi, GameStore, RoadApi, SaveRecoveryApi } from "../app/store";
import { suggestedAction } from "../game/simulation/offline";
import { TUNING, unlockedBlueprints, BLUEPRINTS } from "../game/content/defs";
import {
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandResult,
} from "../game/simulation/commands";
import type { SimState, UpgradeBranch } from "../game/simulation/types";
import {
  CELL,
  WORLD_H,
  WRECK_POSITION,
  drawScene,
  fitCamera,
  pickWorld3D,
  projectWorld3D,
  screenToWorld,
  tileToWorld,
  world3DStatus,
  worldToScreen,
  worldToTile,
  type Camera,
  type CameraInsets,
  type ViewState,
} from "../game/renderer/scene";
import {
  panCamera,
  refitCamera,
  zoomAtPoint,
  zoomStep,
  ZOOM_STEP,
} from "../game/renderer/camera";
import {
  applyGesture,
  idleGesture,
  type GestureOutput,
  type GestureState,
} from "../game/renderer/gestures";
import { createAudio, onVisibility, type AudioApi, type CueName } from "../game/audio/audio";
import {
  REJECT_TEXT,
  costSummary,
  hintFor,
  branchOptions,
  objectiveFor,
  primaryFor,
  restingLine,
} from "./text";
import { resourceWord, t } from "../game/content/strings";
import { nextYardStep, stepForMachine, type YardStep } from "../game/simulation/plan";
import { planConnections } from "../game/simulation/autoconnect";
import { useRevision, useSettings, useSim } from "./useGame";
import {
  MachinePanel,
  ResearchPanel,
  ReturnReportPanel,
  SettingsPanel,
  StorePanel,
  YardPanel,
} from "./Panels";
import { clearSave, hasSaveProgress } from "../game/persistence/save";
import { saveSummary } from "./home/copy";
import { ResetDialog } from "./shell/ResetDialog";
import { RecoveryNotice } from "./shell/RecoveryNotice";
import { DockButtons, Gate, HudTop, ObjectiveCard, Toast } from "./Hud";
import { BuildCatalog } from "./build/BuildCatalog";
import { DismantleCard, MoveStrip, PlacementStrip } from "./place/PlacePreview";
import { OnboardCoach } from "./onboard/OnboardCoach";
import { Primitives48 } from "./primitives";
import { bandFor } from "./tokens";
import { PanelHost, ShellZoom, Toolbar, useDesktopMode } from "./shell/Shell";
import { RoutesPanel } from "./shell/RoutesPanel";
import { FleetPanel } from "./shell/FleetPanel";
import { MapPanel } from "./shell/MapPanel";
import { RoadToolPanel, PANEL_ROAD } from "./RoadTool";
import { BuildToolPanel, PANEL_BUILD_TOOL } from "./BuildTool";
import {
  PANEL_FLEET,
  PANEL_MAP,
  PANEL_REPORT,
  PANEL_RESEARCH,
  PANEL_ROUTES,
  PANEL_SETTINGS,
  PANEL_TRADE,
  PANEL_YARD,
  SHELL_GUTTER_PX,
  SHELL_INSPECTOR_TOP_PX,
  SHELL_SLOTS,
  SHELL_ZOOM_GUTTER_PX,
  type ShellSlot,
} from "./shell/layout";

export interface PrimaryAction {
  label: string;
  cost?: string;
  disabled?: boolean;
  run: () => void;
  /**
   * The three named outcomes of one paid level, present only at the fork
   * (STRAT-002/A1-3). Each is one tap: pressing it commits that branch.
   */
  branches?: { id: UpgradeBranch; label: string; cost?: string; run: () => void }[];
}

// UI-RESET-64: `seenCommands` is persisted SimState and is never pruned, so a
// bare per-load counter restarting at c1 collides with the save's c1..cN after
// any reload: applyCommand dedupes the collision to ok:true WITHOUT executing,
// silently dropping the first N post-reload dispatches. A unique per-load epoch
// prefix keeps ids distinct across reloads; the sequential suffix preserves
// within-session ordering, so a genuine same-id retry still dedups idempotently.
const commandEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let commandSeq = 0;
const nextCommandId = (): string => `${commandEpoch}-${++commandSeq}`;

/**
 * L-1 / RW3D #135: the chrome band the world is fitted into, read from the boxes
 * the layout actually paints — the bottom edge of the lead block (resource strip
 * + objective + coach) and the first painted bottom chrome (an open phone sheet,
 * the dock or the toolbar). On desktop the painted inspector reserves the right
 * edge, so the world fits beside it instead of under it. The canvas covers the
 * viewport, so every box is already in the canvas' own CSS-px space. An empty
 * measurement (a jsdom box of 0) yields no band and the legacy fit.
 */
interface ShellInsets extends CameraInsets {
  left: number;
  right: number;
}

function chromeInsets(cssWidth: number, cssHeight: number): ShellInsets | undefined {
  if (cssHeight <= 0) return undefined;
  const lead = document.querySelector(".hud__lead") ?? document.querySelector(".hud__top");
  const dock = document.querySelector(".dock");
  if (!lead || !dock) return undefined;
  const topEdge = lead.getBoundingClientRect().bottom;
  const dockTop = dock.getBoundingClientRect().top;
  if (!(topEdge > 0) || !(dockTop > 0)) return undefined;
  // Paint truth, not a second matchMedia: a face reserves the band it actually
  // occupies, so the camera and the CSS can never disagree about which mode
  // the viewport is in. An IN-FLOW sheet/catalog reserves the bottom band; an
  // absolute/fixed host (desktop inspector, compact side drawer, desktop
  // catalog) reserves the right gutter instead — reserving its top as a bottom
  // band would collapse the world on short landscape.
  const toolbar = document.querySelector(".toolbar");
  const toolbarTop = toolbar ? toolbar.getBoundingClientRect().top : 0;
  let bottomEdge = Math.min(dockTop, toolbarTop > 0 ? toolbarTop : cssHeight);
  let right = SHELL_ZOOM_GUTTER_PX;
  const hosts = document.querySelectorAll(".shell-sheet, .shell-inspector, .catalog");
  for (const host of hosts) {
    const box = host.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    const position = window.getComputedStyle(host).position;
    if (position === "absolute" || position === "fixed") {
      right = Math.max(right, cssWidth - box.left + SHELL_GUTTER_PX);
    } else {
      // In-flow sheet or catalog hugs the dock: it reserves the bottom band.
      bottomEdge = Math.min(bottomEdge, box.top);
    }
  }
  // The zoom stack's own gutter keeps the visible camera controls off the
  // yard cells the player must tap.
  const zoom = document.querySelector(".shell-zoom");
  const zoomBox = zoom ? zoom.getBoundingClientRect() : null;
  if (zoomBox !== null && zoomBox.width > 0) {
    right = Math.max(right, cssWidth - zoomBox.left + SHELL_GUTTER_PX);
  }
  return {
    top: topEdge + SHELL_GUTTER_PX,
    bottom: Math.max(0, cssHeight - bottomEdge) + SHELL_GUTTER_PX,
    left: 0,
    right,
  };
}

/**
 * Fit the world into the shell's world region. `fitCamera` (scene.ts, frozen)
 * centres on the view it is given, so it is handed the region's own width and
 * the camera is then shifted by the region centre's offset from the canvas
 * centre — the yard lands between the rail and the inspector, not under them.
 */
function fitToShell(cssWidth: number, cssHeight: number): Camera {
  const insets = chromeInsets(cssWidth, cssHeight);
  const left = insets?.left ?? 0;
  const right = insets?.right ?? 0;
  const regionWidth = Math.max(1, cssWidth - left - right);
  const camera = fitCamera({ width: regionWidth, height: cssHeight }, insets);
  // #117: fitCamera (scene.ts, frozen) floors the band scale at BAND_MIN_SCALE so
  // the yard never zooms below a readable size on a tall band. On the short
  // landscape rail band the #66 bounded lead leaves a world band shorter than that
  // floor's yard (224 units * 1.1 = 246 px), so the fitted yard overflows back UP
  // under the lead's opaque objective / status-line / coach chrome and the top-row
  // machines (the furnace at tile 1) lose every clear canvas tap point — the
  // logistics-59 phoneland tap-selection regression. Paint truth: when the measured
  // band cannot hold the floored yard, fit the WHOLE yard to the band the chrome
  // actually leaves so every machine stays canvas-reachable at the default fit.
  // The override only fires when the band scale is below the frozen floor
  // (fitScale < camera.scale); tall bands (phone portrait, desktop rail) already fit
  // at the frozen scale and keep their proven composition untouched.
  if (insets) {
    const usableH = cssHeight - insets.top - insets.bottom;
    const fitScale = usableH / (WORLD_H + 12);
    if (usableH > 0 && fitScale < camera.scale) {
      const bandCentre = insets.top + usableH / 2;
      camera.scale = fitScale;
      camera.y = WORLD_H / 2 + (cssHeight / 2 - bandCentre) / fitScale;
    }
  }
  if (left > 0 || right > 0) {
    camera.x += (cssWidth / 2 - (left + regionWidth / 2)) / camera.scale;
  }
  return camera;
}

/**
 * UI-RESET-62: `reload` is injectable so the reset flow can be exercised in jsdom
 * (which does not implement location.reload); production uses the real reload.
 */
export function App({
  store,
  audioApi,
  reload,
}: {
  /** G1 (#202): additive recovery capability; plain GameStore doubles stay assignable. */
  store: GameStore & Partial<SaveRecoveryApi>;
  audioApi?: AudioApi;
  reload?: () => void;
}) {
  useRevision(store);
  const state = useSim(store);
  const settings = useSettings(store);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>(fitCamera({ width: 360, height: 640 }));
  const audioRef = useRef<AudioApi | null>(audioApi ?? null);
  const cueStateRef = useRef<SimState>(store.getState());
  const insetsRef = useRef<ShellInsets | undefined>(undefined);
  /**
   * UI-RESET-50: the gesture machine owns tap/drag/pinch/cancel separation;
   * `viewRef`/`fittedRef` are the render loop's latest view and shell fit, and
   * `intentRef` records that the player steered the camera themselves, so a
   * resize or an opening inspector refits around their intent instead of
   * throwing it away. Session state only — the save shape is untouched.
   */
  const gestureRef = useRef<GestureState>(idleGesture());
  const viewRef = useRef<ViewState>({ width: 360, height: 640 });
  const fittedRef = useRef<Camera>(cameraRef.current);
  const intentRef = useRef(false);

  const [started, setStarted] = useState(false);
  /**
   * RW3D #135 (U03): the one panel stack. `selected` is always the top layer;
   * exactly one major surface paints at a time. Toolbar roots replace the stack,
   * dock faces and world taps push (dedupe-to-top), Back/Escape/Close pop one
   * layer, and an empty-ground tap clears to the yard. Session state only — the
   * save shape is untouched.
   */
  const [panelStack, setPanelStack] = useState<number[]>([]);
  const selected = panelStack.length > 0 ? panelStack[panelStack.length - 1] : null;
  const [buildBlueprint, setBuildBlueprint] = useState<string | null>(null);
  const [ghostTile, setGhostTile] = useState<number | null>(null);
  /**
   * UI-RESET-52: the build catalog is its own overlay, not a `.panel` — the
   * report/stack/dock census and the camera's chrome insets never see it.
   * While it is open the ghost stays armed underneath, so closing it (Place,
   * Close or Cancel) lands in the explicit placement preview, and Escape
   * retires catalog and ghost together as the one build layer.
   */
  const [catalogOpen, setCatalogOpen] = useState(false);
  /**
   * UI-RESET-53: the explicit move and dismantle flows. Each is a session-only intent
   * (never written into the save): `moveFlow` holds the machine being moved and its
   * aimed destination; `dismantleFlow` holds the machine under review and whether the
   * destructive tap has been armed. Both are mutually exclusive with the build ghost.
   * The real spend only happens through `commit` after a valid confirmation — the
   * panel's Move/Dismantle dispatches are intercepted into these flows here, so the
   * read-only inspector is unchanged while the safeguard lives at the flow layer.
   */
  const [moveFlow, setMoveFlow] = useState<{ machineId: number; tile: number } | null>(null);
  const [dismantleFlow, setDismantleFlow] = useState<{ machineId: number; armed: boolean } | null>(
    null
  );
  /**
   * UI-RESET-53: the reason the last placement confirm was refused, kept while the ghost
   * stays armed (preserve-on-refusal). The objective's phase line states it instead of the
   * now-inapplicable "tap again to place", and re-aiming or re-selecting clears it. It is
   * separate from `lastReject` so the resting line's trailing "Last …" segment is untouched.
   */
  const [buildRefusal, setBuildRefusal] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; count: number } | null>(null);
  /**
   * PLAY-002 2 (TST-001, QA D-3): the last rejected command, kept after the 1.8 s toast
   * is gone. `null` while nothing has been refused. It is plain component state - never
   * written into the save - so the two surfaces share one string and the sim stays pure.
   */
  const [lastReject, setLastReject] = useState<string | null>(null);
  /**
   * RW3D #135: desktop mode from the same query the CSS paints with (the
   * inspector docks right there; below it the host is a sheet/drawer), and the
   * phone sheet's expanded state (~35% -> ~70% of the viewport).
   */
  const desktopMode = useDesktopMode();
  const [sheetExpanded, setSheetExpanded] = useState(false);

  /** Push one layer (dedupe-to-top): a dock face or world tap over an open panel. */
  const openPanel = useCallback((id: number) => {
    setPanelStack((stack) => [...stack.filter((entry) => entry !== id), id]);
  }, []);
  /** A toolbar destination is a root: it replaces the stack, never piles up. */
  const rootPanel = useCallback((id: number) => {
    setPanelStack([id]);
    setCatalogOpen(false);
    setSheetExpanded(false);
  }, []);
  /** Back/Escape/Close: pop exactly one layer; the one underneath survives. */
  const backPanel = useCallback(() => {
    setPanelStack((stack) => stack.slice(0, -1));
  }, []);
  /** Empty-ground tap / Home: clear to the yard. */
  const clearPanels = useCallback(() => {
    setPanelStack([]);
    setSheetExpanded(false);
  }, []);
  /**
   * UI-RESET-62: the settings surface and the reset confirmation. `gateSettings`
   * is the pre-start settings overlay (the yard has not begun); after start the
   * same panel opens as the -5 inspector sentinel. `resetOpen` is the one
   * destructive confirmation layer — nothing is deleted until it confirms.
   */
  const [gateSettings, setGateSettings] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const resetOpenerRef = useRef<HTMLElement | null>(null);
  /**
   * UI-RESET-62: the OS reduced-motion preference, live. It is read as an
   * effective override (user setting OR OS), never force-written into the save,
   * so the stored preference stays the player's own and survives the OS flipping
   * back. The renderer and the settings panel both read the effective value.
   */
  const [osReducedMotion, setOsReducedMotion] = useState<boolean>(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );

  const audio = useCallback((): AudioApi => {
    if (!audioRef.current) audioRef.current = createAudio(store.getSettings().muted);
    return audioRef.current;
  }, [store]);

  /**
   * UI-RESET-65 (c2): group repeated identical readouts instead of re-firing a fresh
   * toast for every refused tap. The same active sentence increments a count; a new
   * sentence resets it to one. Event-driven — only called from a real command outcome
   * — so the per-frame sim re-render never inflates the count.
   */
  const notify = useCallback((text: string) => {
    setToast((prev) => (prev && prev.text === text ? { text, count: prev.count + 1 } : { text, count: 1 }));
  }, []);

  /** The one real spend path: dispatch to the engine, then voice + readout the outcome. */
  const commit = useCallback(
    (command: Command): CommandResult => {
      const result = store.dispatch(command);
      if (result.ok) {
        audio().play(cueFor(command.type));
        // DEF-006 (PLAY-002 g1 QA note a): a successful tap retires the old
        // shortfall, so the `Last ...` segment is the freshest answer at the front
        // of the line, not a hundreds-of-taps-old residue. Session state only -
        // the save shape and every stored byte are untouched.
        setLastReject(null);
      } else {
        audio().play("blocked");
        const text = labelForReject(result);
        notify(text);
        // One string, computed once: the transient toast and the resting line's trailing
        // segment are the same readout at two lifetimes (PLAY-002 2).
        setLastReject(text);
      }
      return result;
    },
    [store, audio, notify]
  );

  /**
   * UI-RESET-53: the inspector's Move and Dismantle buttons dispatch through here.
   * Rather than spending at once they open an explicit flow — a destination preview
   * for move, an impact card for dismantle — and the real command only runs on a valid
   * confirmation (`confirmMove` / `confirmDismantle`). That keeps the read-only
   * inspector untouched while the deliberate safeguard lives at the flow layer. Every
   * other command commits straight away, exactly as before. If the machine is already
   * gone the command falls through so the engine's own not-found refusal is surfaced.
   */
  const dispatch = useCallback(
    (command: Command): CommandResult => {
      if (command.type === "machine.move" || command.type === "machine.dismantle") {
        const snapshot = store.getState();
        const exists = snapshot.machines.some((m) => m.id === command.machineId);
        if (exists) {
          // One destructive intent at a time: opening a flow retires the build ghost
          // and the other flow, and keeps the machine selected so its inspector stays.
          setBuildBlueprint(null);
          setGhostTile(null);
          setCatalogOpen(false);
          openPanel(command.machineId);
          if (command.type === "machine.move") {
            setDismantleFlow(null);
            setMoveFlow((prev) =>
              prev && prev.machineId === command.machineId
                ? prev
                : { machineId: command.machineId, tile: firstFreeTile(snapshot) }
            );
          } else {
            setMoveFlow(null);
            setDismantleFlow((prev) =>
              prev && prev.machineId === command.machineId
                ? prev
                : { machineId: command.machineId, armed: false }
            );
          }
          // No command was issued: the flow is open, nothing was charged. The revision
          // is unchanged, so the store's subscribers are not notified by this tap.
          return { ok: true, revision: snapshot.revision };
        }
      }
      return commit(command);
    },
    [store, commit, openPanel]
  );

  /**
   * UI-RESET-53: confirm a move only against a valid destination. A refusal keeps the
   * flow open (the toast + lastReject already name the reason); success retires it.
   */
  const confirmMove = useCallback(() => {
    if (moveFlow === null) return;
    const result = commit({
      id: nextCommandId(),
      type: "machine.move",
      machineId: moveFlow.machineId,
      tile: moveFlow.tile,
    });
    if (result.ok) setMoveFlow(null);
  }, [commit, moveFlow]);

  /**
   * UI-RESET-53: the dismantle safeguard. The first tap arms; the second commits. A
   * refusal disarms and keeps the card so the impact stays readable; success retires
   * the card and the selection (the machine is gone).
   */
  const confirmDismantle = useCallback(() => {
    if (dismantleFlow === null) return;
    if (!dismantleFlow.armed) {
      setDismantleFlow({ ...dismantleFlow, armed: true });
      return;
    }
    const result = commit({
      id: nextCommandId(),
      type: "machine.dismantle",
      machineId: dismantleFlow.machineId,
    });
    if (result.ok) {
      setDismantleFlow(null);
      // The machine is gone: drop its layer wherever it sits in the stack.
      setPanelStack((stack) => stack.filter((entry) => entry !== dismantleFlow.machineId));
    } else {
      setDismantleFlow({ ...dismantleFlow, armed: false });
    }
  }, [commit, dismantleFlow]);

  useEffect(() => {
    // UI-RESET-53: build, move and dismantle are one destructive intent at a time.
    // However build mode is entered (catalog, tutorial step or yard ladder), an open
    // move/dismantle flow yields to it. The intercept clears build synchronously when a
    // flow opens, so the two directions never leave both intents armed.
    if (buildBlueprint !== null) {
      setMoveFlow(null);
      setDismantleFlow(null);
    }
  }, [buildBlueprint]);

  useEffect(() => {
    // UI-RESET-53: a refused placement keeps the ghost armed, but the refusal reason is
    // only current for that aim/choice. Re-aiming the ghost, re-selecting a blueprint or
    // leaving build mode retires it so the phase line returns to the ghost hint. A refused
    // confirm changes neither dep, so the reason it just set survives until the player acts.
    setBuildRefusal(null);
  }, [ghostTile, buildBlueprint]);

  useEffect(() => {
    // UI-RESET-53: if the machine a flow points at is gone (dismantled, or the save was
    // replaced), retire the flow so no stale intent can confirm against a missing id.
    if (moveFlow !== null && !state.machines.some((m) => m.id === moveFlow.machineId)) {
      setMoveFlow(null);
    }
    if (dismantleFlow !== null && !state.machines.some((m) => m.id === dismantleFlow.machineId)) {
      setDismantleFlow(null);
    }
  }, [state.revision, state.machines, moveFlow, dismantleFlow]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--text-scale", String(settings.textScale));
    // Spec 6.4: at a large text scale the HUD keeps only the essential lines.
    root.classList.toggle("text-large", settings.textScale >= 1.5);
  }, [settings.textScale]);

  useEffect(() => {
    // RW3D #135: the desktop inspector top floors at the contract's 64 px, but
    // the lead block (resource strip + objective + coach) grows with the text
    // scale and would overlap a fixed top. Measure the painted lead and lift the
    // floor to its bottom edge + gutter — the same paint-truth the camera insets
    // read. The variable is only consumed by the desktop inspector block, so the
    // in-flow phone sheets are untouched. jsdom has no ResizeObserver; the
    // one-shot measurement still runs and the 64 px floor holds.
    const root = document.documentElement;
    const lead = document.querySelector<HTMLElement>(".hud__lead");
    if (!lead) {
      root.style.removeProperty("--shell-inspector-top");
      return;
    }
    const measure = () => {
      const bottom = lead.getBoundingClientRect().bottom;
      const top = Math.max(SHELL_INSPECTOR_TOP_PX, Math.ceil(bottom + SHELL_GUTTER_PX));
      root.style.setProperty("--shell-inspector-top", `${top}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(lead);
    return () => observer.disconnect();
    // `started` is load-bearing: at mount the gate is still up and `.hud__lead`
    // does not exist, so the first run bails. Without it in the deps the effect
    // never re-ran once the yard painted and --shell-inspector-top stayed unset.
  }, [started, settings.textScale, state.tutorial]);

  useEffect(() => {
    // Q-005 S-17: the store is the one source of truth for mute. An import or a
    // leader/follower adopt replaces `settings` wholesale, and this write keeps the
    // audio object equal to the stored value, so the glyph and the mix agree.
    audio().setMuted(store.getSettings().muted);
  }, [settings.muted, store, audio]);

  useEffect(() => {
    // Q-005 S-19: one paired suspend/resume per audio object, removed on unmount so
    // a re-mount cannot leave a second listener behind.
    const handler = onVisibility(audio());
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [audio]);

  useEffect(() => {
    // UI-RESET-62: the operating-system preference wins for reduced motion while
    // it is active, but it is no longer force-persisted over the player's saved
    // choice — the effective value is `settings.reducedMotion || osReducedMotion`
    // and the settings panel explains the override. Live-listened so flipping the
    // OS preference mid-session takes effect without a reload.
    const mql = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mql) return;
    const onChange = () => setOsReducedMotion(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  /**
   * UI-RESET-65 (c3): the effective reduced-motion value (player setting OR live OS
   * preference) reaches the CSS layer, not only the canvas. One root attribute lets a
   * single stylesheet block disable every chrome transition when motion is reduced, so
   * the in-app toggle and the OS media query behave identically. The canvas already reads
   * the same effective value at the drawScene call; this never writes the save.
   */
  const reducedMotionEffective = settings.reducedMotion || osReducedMotion;
  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotionEffective) root.setAttribute("data-reduced-motion", "true");
    else root.removeAttribute("data-reduced-motion");
    return () => root.removeAttribute("data-reduced-motion");
  }, [reducedMotionEffective]);

  const cycleTextScale = useCallback(() => {
    const steps = [1, 1.25, 1.5, 2];
    const index = steps.indexOf(settings.textScale);
    store.setSettings({ textScale: steps[(index + 1) % steps.length] });
  }, [settings.textScale, store]);

  const toggleMute = useCallback(() => {
    const next = !store.getSettings().muted;
    store.setSettings({ muted: next });
    audio().setMuted(next);
  }, [store, audio]);

  const toggleReducedMotion = useCallback(() => {
    store.setSettings({ reducedMotion: !store.getSettings().reducedMotion });
  }, [store]);

  /** UI-RESET-62: open the reset confirmation, remembering the opener for focus restore. */
  const openReset = useCallback(() => {
    resetOpenerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setResetOpen(true);
  }, []);

  /** Cancel: the save is untouched; focus returns to whatever opened the dialog. */
  const closeReset = useCallback(() => {
    setResetOpen(false);
    const opener = resetOpenerRef.current;
    if (opener && opener !== document.body && typeof opener.focus === "function") {
      opener.focus();
    }
  }, []);

  /**
   * UI-RESET-62 (sponsor reset-game): the only destructive path, reached solely
   * through the confirmed dialog. Stop the tick loop, remove the save envelope
   * and the writer lease, then reload into a fresh title screen. Clearing the
   * lease matters: a stale heartbeat would otherwise demote the fresh yard to
   * reader for the lease TTL after the reload.
   */
  const performReset = useCallback(() => {
    store.stop();
    let storage: Storage | null = null;
    try {
      storage = typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      storage = null;
    }
    clearSave(storage);
    if (reload) reload();
    else window.location.reload();
  }, [store, reload]);

  /** RW3D #135: Settings opens from the resource strip's gear as a stack layer. */
  const openSettings = useCallback(() => {
    openPanel(PANEL_SETTINGS);
    setCatalogOpen(false);
  }, [openPanel]);

  // UI-RESET-67: one stable close handler shared by every detail panel so their
  // memoized onClose prop keeps a stable identity across the 10 Hz sim tick.
  // RW3D #135: Close pops exactly one stack layer — the panel underneath survives.
  const closeSelection = backPanel;

  /**
   * UI-RESET-52: opening the catalog arms the same ghost the old Build face
   * armed (first unlocked machine, first free tile) so the yard keeps a live
   * preview underneath, then lifts the catalog over it. Picking a card inside
   * the catalog re-aims that ghost; nothing is spent until the dock's Build
   * face (or a placement tap) commits `machine.build`.
   */
  const openCatalog = useCallback(() => {
    const snapshot = store.getState();
    if (buildBlueprint === null) {
      const unlocked = unlockedBlueprints(snapshot.tutorial);
      const ids = unlocked.length > 0 ? unlocked : Object.keys(BLUEPRINTS);
      setBuildBlueprint(ids[0]);
      setGhostTile((tile) => (tile !== null ? tile : firstFreeTile(snapshot)));
    }
    setCatalogOpen(true);
    // RW3D #135: the catalog is the one major surface while it is up — the
    // panel stack yields so no inspector paints underneath it (U03).
    setPanelStack([]);
    setSheetExpanded(false);
  }, [store, buildBlueprint]);

  /**
   * RW3D #135 (U03): the six toolbar destinations, shared by the toolbar and
   * keys 1–6. Each reads the freshest state from the store; a disabled
   * destination is inert here too, so a key press can never bypass the printed
   * reason. Navigation issues no game command — Build arms the ghost/catalog,
   * every other destination roots the one panel stack.
   */
  const onSlot = useCallback(
    (slot: ShellSlot) => {
      const snapshot = store.getState();
      switch (slot) {
        case "build": {
          if (buildBlueprint !== null) {
            setBuildBlueprint(null);
            setGhostTile(null);
            setCatalogOpen(false);
            return;
          }
          openCatalog();
          return;
        }
        case "routes":
          rootPanel(PANEL_ROUTES);
          return;
        case "fleet":
          rootPanel(PANEL_FLEET);
          return;
        case "research":
          if (showResearch(snapshot)) rootPanel(PANEL_RESEARCH);
          return;
        case "trade":
          rootPanel(PANEL_TRADE);
          return;
        case "map":
          rootPanel(PANEL_MAP);
          return;
      }
    },
    [store, buildBlueprint, openCatalog, rootPanel]
  );

  useEffect(() => {
    // Spec 5.5 / UI-002 U-5 / RW3D #135: Escape closes the *nearest* context
    // first — the reset dialog, the pre-start settings overlay, the move/dismantle
    // flow, then ONE panel-stack layer, then the build ghost. One press, one
    // overlay retired, so no press can clear the whole stack at once.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // UI-RESET-62: the reset confirmation is the newest layer — one press
      // cancels it (the save is untouched) before anything underneath.
      if (resetOpen) {
        closeReset();
        return;
      }
      // Pre-start settings overlay: Escape returns to the title screen.
      if (!started && gateSettings) {
        setGateSettings(false);
        return;
      }
      // UI-RESET-53: the move/dismantle flow is the newest intent layer, so one press
      // retires it (and disarms) before the inspector underneath. No spend, no loop.
      if (moveFlow !== null) {
        setMoveFlow(null);
        return;
      }
      if (dismantleFlow !== null) {
        setDismantleFlow(null);
        return;
      }
      if (panelStack.length > 0) {
        backPanel();
        return;
      }
      if (buildBlueprint !== null) {
        setBuildBlueprint(null);
        setGhostTile(null);
        // UI-RESET-52: the catalog is part of the one build layer, so the press
        // that drops the ghost retires it too.
        setCatalogOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    panelStack,
    backPanel,
    buildBlueprint,
    moveFlow,
    dismantleFlow,
    resetOpen,
    closeReset,
    started,
    gateSettings,
  ]);

  useEffect(() => {
    // Spec §5: keys 1–5 reach the five destinations, arrows pan, +/- zoom and N
    // cycles the build ghost. Text fields keep their own keys — a save code
    // typed into the yard record must never steer the shell.
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // UI-RESET-62: while the reset confirmation (or the pre-start settings
      // overlay) is up, shell shortcuts are inert — no digit can navigate the
      // yard underneath a destructive dialog.
      if (resetOpen || (!started && gateSettings)) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= SHELL_SLOTS.length) {
        event.preventDefault();
        onSlot(SHELL_SLOTS[digit - 1]);
        return;
      }
      const camera = cameraRef.current;
      const view = viewRef.current;
      const fitted = fittedRef.current;
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          cameraRef.current = panCamera(camera, view, 16, 0, fitted);
          intentRef.current = true;
          return;
        case "ArrowRight":
          event.preventDefault();
          cameraRef.current = panCamera(camera, view, -16, 0, fitted);
          intentRef.current = true;
          return;
        case "ArrowUp":
          event.preventDefault();
          cameraRef.current = panCamera(camera, view, 0, 16, fitted);
          intentRef.current = true;
          return;
        case "ArrowDown":
          event.preventDefault();
          cameraRef.current = panCamera(camera, view, 0, -16, fitted);
          intentRef.current = true;
          return;
        case "+":
        case "=":
          event.preventDefault();
          cameraRef.current = zoomStep(camera, view, 1, fitted);
          intentRef.current = true;
          return;
        case "-":
        case "_":
          event.preventDefault();
          cameraRef.current = zoomStep(camera, view, -1, fitted);
          intentRef.current = true;
          return;
        case "n":
        case "N":
          if (buildBlueprint !== null) {
            event.preventDefault();
            setGhostTile((tile) => cycleGhostTile(store.getState(), tile));
          } else if (moveFlow !== null) {
            // UI-RESET-53: in move mode N cycles the destination preview, never a spend.
            event.preventDefault();
            setMoveFlow((flow) =>
              flow === null ? flow : { ...flow, tile: cycleGhostTile(store.getState(), flow.tile) }
            );
          }
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSlot, buildBlueprint, store, moveFlow, resetOpen, started, gateSettings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = () => {
      const parent = canvas.parentElement;
      const cssWidth = parent ? parent.clientWidth : 360;
      const cssHeight = parent ? parent.clientHeight : 640;
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const w = Math.round(cssWidth * dpr);
      const h = Math.round(cssHeight * dpr);
      viewRef.current = { width: cssWidth, height: cssHeight };
      const insets = chromeInsets(cssWidth, cssHeight);
      // L-1 / G2: the chrome band changes with the text scale, with an open panel
      // and with the shell mode (the rail and inspector reserve horizontal edges),
      // so the fit is redone whenever the canvas box or any band edge moved.
      const moved =
        (insets?.top ?? -1) !== (insetsRef.current?.top ?? -1) ||
        (insets?.bottom ?? -1) !== (insetsRef.current?.bottom ?? -1) ||
        (insets?.left ?? -1) !== (insetsRef.current?.left ?? -1) ||
        (insets?.right ?? -1) !== (insetsRef.current?.right ?? -1);
      if (canvas.width !== w || canvas.height !== h || moved) {
        canvas.width = w;
        canvas.height = h;
        insetsRef.current = insets;
        // UI-RESET-50: a layout change refits around the player's intent —
        // their zoom and centre survive (clamped into the new view) instead
        // of snapping back to the fit every time an inspector opens.
        const fitted = fitToShell(cssWidth, cssHeight);
        fittedRef.current = fitted;
        cameraRef.current = refitCamera(
          cameraRef.current,
          fitted,
          viewRef.current,
          intentRef.current
        );
        // The zoom stack clears the measured dock at every text scale.
        const rootStyle = document.documentElement.style;
        if (insets) rootStyle.setProperty("--shell-zoom-clear", `${Math.round(insets.bottom + 2)}px`);
        else rootStyle.removeProperty("--shell-zoom-clear");
        // RW3D #135: the desktop inspector's bottom edge clears the painted dock
        // and toolbar (not the sheet — the inspector only paints on desktop).
        const dockTop = document.querySelector(".dock")?.getBoundingClientRect().top ?? 0;
        const toolbarTop = document.querySelector(".toolbar")?.getBoundingClientRect().top ?? 0;
        const chromeEdge = Math.min(
          dockTop > 0 ? dockTop : cssHeight,
          toolbarTop > 0 ? toolbarTop : cssHeight
        );
        if (chromeEdge < cssHeight) {
          rootStyle.setProperty(
            "--shell-chrome-bottom",
            `${Math.round(cssHeight - chromeEdge + SHELL_GUTTER_PX)}px`
          );
        } else {
          rootStyle.removeProperty("--shell-chrome-bottom");
        }
      }
      // One stamped attribute the headless probes and jsdom tests read as the
      // camera's paint truth; written only when the camera actually moved.
      const cam = cameraRef.current;
      const stamp = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.scale.toFixed(3)}`;
      if (canvas.dataset.cam !== stamp) canvas.dataset.cam = stamp;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Q-004 B1: one state read per rendered frame, shared by the canvas, the ghost
      // validity check and the cue diff, so both surfaces describe the same tick.
      const snapshot = store.getState();
      // UI-RESET-53: move mode reuses the build ghost's paint path — the aimed
      // destination is the ghost tile and the moving machine stays highlighted. The
      // validity formula is unchanged, so the machine's own (occupied) cell reads
      // invalid exactly as the engine refuses a move onto itself.
      const previewTile = buildBlueprint !== null ? ghostTile : moveFlow !== null ? moveFlow.tile : null;
      drawScene(ctx, snapshot, cameraRef.current, { width: cssWidth, height: cssHeight }, {
        // UI-RESET-62: the effective value — the saved preference OR the live OS
        // override — so the yard calms down whichever source requests it.
        reducedMotion: settings.reducedMotion || osReducedMotion,
        buildMode: buildBlueprint !== null || moveFlow !== null,
        ghostTile: previewTile,
        ghostValid:
          previewTile !== null &&
          previewTile !== DOCK_TILE &&
          !snapshot.machines.some((m) => m.tile === previewTile),
        selected: moveFlow !== null ? moveFlow.machineId : selected,
        // Q-004 C-1: the sub-tick phase the tick loop left in its accumulator (A1).
        framePhase: store.getFramePhase(),
      });
      // RW3D #135 delta 3: world-anchored paint truth for the selection. The anchor is
      // projected through the SAME cameraRig.projectToScreen the blit uses (scene.ts
      // bridge), so an overlay pinned to data-anchor agrees with the 3D frame by
      // construction; without WebGL it falls back to worldToScreen, identical under the
      // default top-down camera. Stamped after drawScene so the singleton camera is
      // freshly synced. Ground centre (x, 0, y) matches the 2D outline centre.
      const anchorId = moveFlow !== null ? moveFlow.machineId : selected;
      let anchorWorld: { x: number; y: number } | null = null;
      if (anchorId === -1) anchorWorld = WRECK_POSITION;
      else if (anchorId === -2) anchorWorld = tileToWorld(DOCK_TILE);
      else if (anchorId !== null) {
        const m = snapshot.machines.find((mm) => mm.id === anchorId);
        if (m) anchorWorld = tileToWorld(m.tile);
      }
      const anchor = anchorWorld
        ? projectWorld3D(anchorWorld.x, 0, anchorWorld.y) ??
          worldToScreen(cameraRef.current, viewRef.current, anchorWorld.x, anchorWorld.y)
        : null;
      const anchorStamp = anchor ? `${anchor.x.toFixed(1)},${anchor.y.toFixed(1)}` : "";
      if ((canvas.dataset.anchor ?? "") !== anchorStamp) {
        if (anchorStamp === "") delete canvas.dataset.anchor;
        else canvas.dataset.anchor = anchorStamp;
      }
      // Health provenance for the capture harness: "unavailable" | "lost" | "ready".
      // The visible context-loss banner stays drawScene's — no duplicate shell surface.
      const health = world3DStatus();
      if (canvas.dataset.world3d !== health) canvas.dataset.world3d = health;
      // Q-005 S-14: the machine-state cues come from the state diff itself, so a
      // working sorter, a working furnace and the first data unit each get their
      // declared voice without a per-machine timer. Near/far is the tile distance
      // from the camera centre, so a zoomed-out yard reads with depth (S-16).
      const previous = cueStateRef.current;
      const current = snapshot;
      if (previous !== current) {
        // UI-RESET-62: state cues only voice after the player has begun — the
        // title screen must never play unsolicited audio. The baseline still
        // advances pre-start, so beginning does not fire a burst of stale cues.
        if (started) {
          const centre = worldToTile(cameraRef.current.x, cameraRef.current.y) ?? DOCK_TILE;
          for (const cue of stateCues(previous, current)) {
            const tile = cueTile(current, cue);
            audio().play(cue, {
              distance: tile === null ? 0 : tileDistance(tile, centre),
              zoom: cameraRef.current.scale,
            });
          }
        }
        cueStateRef.current = current;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [store, settings.reducedMotion, buildBlueprint, ghostTile, selected, audio, moveFlow, started, osReducedMotion]);

  /**
   * UI-RESET-50: apply one gesture-machine output. Pan and pinch steer the
   * same clamped camera math the wheel and keys use; only a cleared `tap`
   * may select, salvage or set the build ghost — a drag, a pinch or a cancel
   * cannot reach that branch by construction.
   */
  const applyGestureOutput = (out: GestureOutput) => {
    gestureRef.current = out.state;
    const view = viewRef.current;
    const fitted = fittedRef.current;
    if (out.pan) {
      cameraRef.current = panCamera(cameraRef.current, view, out.pan.dx, out.pan.dy, fitted);
      intentRef.current = true;
    }
    if (out.pinch) {
      cameraRef.current = zoomAtPoint(
        cameraRef.current,
        view,
        out.pinch.factor,
        out.pinch.x,
        out.pinch.y,
        fitted
      );
      intentRef.current = true;
    }
    if (out.ghost) {
      const world = screenToWorld(cameraRef.current, view, out.ghost.x, out.ghost.y);
      const tile = worldToTile(world.x, world.y);
      if (buildBlueprint !== null) {
        setGhostTile(tile);
      } else if (moveFlow !== null && tile !== null) {
        // UI-RESET-53: dragging in move mode aims the destination preview only.
        setMoveFlow((flow) => (flow === null ? flow : { ...flow, tile }));
      }
    }
    if (!out.tap) return;
    const world = screenToWorld(cameraRef.current, view, out.tap.x, out.tap.y);
    if (buildBlueprint !== null) {
      const tile = worldToTile(world.x, world.y);
      if (tile !== null) setGhostTile(tile);
      return;
    }
    if (moveFlow !== null) {
      // UI-RESET-53: a cleared tap in move mode only aims the destination — it never
      // selects, salvages or spends. The Confirm face is the single committing tap, and
      // a tap outside the yard keeps the last aimed cell rather than clearing it.
      const tile = worldToTile(world.x, world.y);
      if (tile !== null) setMoveFlow((flow) => (flow === null ? flow : { ...flow, tile }));
      return;
    }
    // RW3D #135 delta 1: raycast the last-synced three.js world first — an orbit-correct
    // body hit. Null without WebGL or on context loss, so the ground inverse + pickTarget
    // fallback keeps the jsdom / legacy path byte-identical. `??` passes -1 (wreck) and
    // -2 (dock) through: those ids are valid hits, not misses.
    const pick3 = pickWorld3D(out.tap.x, out.tap.y);
    const hit = pick3?.id ?? pickTarget(store.getState(), world.x, world.y);
    if (hit === null) {
      clearPanels();
      return;
    }
    openPanel(hit);
    if (hit === -1 && (state.tutorial <= 1 || !state.drone.repaired)) {
      dispatch({ id: nextCommandId(), type: "manual.salvage" });
    }
  };

  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(event);
    applyGestureOutput(
      applyGesture(gestureRef.current, { type: "down", id: event.pointerId, x: p.x, y: p.y })
    );
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom has no pointer capture; the gesture machine does not need it.
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(event);
    applyGestureOutput(
      applyGesture(gestureRef.current, { type: "move", id: event.pointerId, x: p.x, y: p.y })
    );
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(event);
    applyGestureOutput(
      applyGesture(gestureRef.current, { type: "up", id: event.pointerId, x: p.x, y: p.y })
    );
  };

  // A cancelled pointer spoils the whole gesture: no lift of any remaining
  // pointer may tap, so an interrupted touch can never salvage or place.
  const onPointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    applyGestureOutput(
      applyGesture(gestureRef.current, { type: "cancel", id: event.pointerId })
    );
  };

  const zoomBy = useCallback((factor: number) => {
    const view = viewRef.current;
    cameraRef.current = zoomAtPoint(
      cameraRef.current,
      view,
      factor,
      view.width / 2,
      view.height / 2,
      fittedRef.current
    );
    intentRef.current = true;
  }, []);

  // UI-RESET-67: stable zoom faces so the memoized ShellZoom never re-renders on
  // the 10 Hz sim tick (its only props are these handlers). Same clamped math the
  // wheel/pinch/keys use; identity is stable for the life of the component.
  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);

  /** Home / Reset view: the fresh shell fit wins and the intent is retired. */
  const resetCamera = useCallback(() => {
    const parent = canvasRef.current?.parentElement;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    const fitted = fitToShell(width, height);
    fittedRef.current = fitted;
    cameraRef.current = fitted;
    intentRef.current = false;
  }, []);

  useEffect(() => {
    // Wheel zoom: a native non-passive listener (React roots wheel passive),
    // anchored at the cursor, so the page's own scroll/zoom never fights the
    // camera. One shared clamp range with pinch, keys and the controls.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.min(2, Math.max(0.5, Math.exp(-delta * 0.0015)));
      cameraRef.current = zoomAtPoint(
        cameraRef.current,
        viewRef.current,
        factor,
        event.clientX - rect.left,
        event.clientY - rect.top,
        fittedRef.current
      );
      intentRef.current = true;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [started]);

  const role = store.getRole();
  const primary: PrimaryAction =
    role === "reader"
      ? {
          label: t("btn.takeOver"),
          run: () => {
            if (store.takeOver() === "reader") {
              audio().play("blocked");
              notify(t("reader.stuck"));
            }
          },
        }
      : buildPrimary(store, dispatch, selected, setBuildBlueprint, setGhostTile);

  const machine =
    selected !== null && selected > 0 ? state.machines.find((m) => m.id === selected) : undefined;
  const report = store.getReturnReport();
  /**
   * RW3D #135 (round 10 rework): the absence report can settle AFTER Begin was
   * tapped. A long catch-up is adopted off-thread (store.ts `adoptCatchUp`), so a
   * cold click at domcontentloaded starts the yard while `returnReport` is still
   * null and the one-shot check in Gate's onBegin (below) misses it — the report
   * then arrives with nothing to re-open it. The store notifies on adoption, which
   * re-renders this component; react to the report's arrival here and open it as
   * the first stack layer, but only while the stack is untouched, so a destination
   * the player opened in the meantime is never clobbered and a report they already
   * dismissed is never re-opened (the effect's deps do not include the stack). The
   * functional update keeps the settled-click path byte-identical: onBegin has
   * already pushed PANEL_REPORT, so the non-empty stack is returned unchanged.
   */
  useEffect(() => {
    if (!started || report === null) return;
    setPanelStack((stack) => (stack.length === 0 ? [PANEL_REPORT] : stack));
  }, [started, report]);
  /**
   * RW3D #135: the host paints exactly one panel — the top of the stack — or
   * nothing. A wreck hit (-1) and a stale machine id occupy a stack layer (so
   * Back/Escape still unwinds them) but paint no host; a report layer without a
   * report likewise paints nothing.
   */
  const hostKey =
    selected === null || selected === -1
      ? null
      : selected > 0
        ? machine
          ? selected
          : null
        : selected === PANEL_REPORT
          ? report
            ? selected
            : null
          : selected;

  // UI-RESET/TOKENS (#48): `?ui48` paints the shared primitive slice inside the shipped shell,
  // so the captures and the unit tests read exactly one cascade. Without the flag every line
  // below runs exactly as before, and the sim, the save and the camera are untouched.
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ui48")) {
    return (
      <div className="wk-root">
        <Primitives48 band={bandFor(window.innerWidth, window.innerHeight) ?? "390x844"} />
      </div>
    );
  }

  if (!started) {
    // UI-RESET-62: Continue is offered only for real save progress — a
    // settings-only envelope (pre-start preference changes) is a fresh yard.
    const progress = hasSaveProgress(state);
    const summary = progress ? saveSummary(state) : null;
    return (
      <div className="game">
        {/* G1 (#202): the save-recovery banner sits outside the panel stack and
            the HUD census, on the gate as well as in play. First child in both
            branches = one reconciliation slot, so dismissal survives Begin.
            Dismiss is local; Escape and Back keep their existing chains. */}
        <RecoveryNotice store={store} />
        <canvas ref={canvasRef} />
        <Gate
          onBegin={() => {
            audio().resume();
            audio().play("upgrade");
            setStarted(true);
            store.start();
            // RW3D #135: the absence report is the first stack layer, not a
            // separate overlay — destinations open over it, Back unwinds to it.
            if (store.getReturnReport() !== null) setPanelStack([PANEL_REPORT]);
          }}
          muted={settings.muted}
          onToggleMute={() => {
            const next = !settings.muted;
            store.setSettings({ muted: next });
            audio().setMuted(next);
          }}
          hasProgress={progress}
          summary={summary}
          onNewGame={openReset}
          onSettings={() => setGateSettings(true)}
        />
        {gateSettings ? (
          <div className="gate-settings">
            <SettingsPanel
              settings={settings}
              osReducedMotion={osReducedMotion}
              onToggleMute={toggleMute}
              onCycleText={cycleTextScale}
              onToggleReducedMotion={toggleReducedMotion}
              onReset={openReset}
              onClose={() => setGateSettings(false)}
            />
          </div>
        ) : null}
        {resetOpen ? (
          <ResetDialog summary={summary} onCancel={closeReset} onConfirm={performReset} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="game">
      {/* G1 (#202): same banner contract as the gate branch — outside `.hud`,
          no census node, no Escape layer, no focus trap, same first-child
          reconciliation slot so its state survives the gate -> play switch. */}
      <RecoveryNotice store={store} />
      <canvas
        ref={canvasRef}
        /* UI-RESET-66: name the world view for assistive tech. Every core action
           it paints (salvage / build / connect / store / research) has a named
           button, rail and keyboard equivalent, so the canvas is exposed as the
           yard image it renders rather than an unnamed interactive surface. */
        role="img"
        aria-label={t("aria.canvas")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <div className={"hud" + (buildBlueprint !== null ? " hud--build" : "")}>
        <div className="hud__lead">
          <HudTop
            state={state}
            muted={settings.muted}
            textScale={settings.textScale}
            onCycleText={cycleTextScale}
            onToggleMute={toggleMute}
            onOpenSettings={openSettings}
            onHome={() => {
              resetCamera();
              clearPanels();
            }}
          />
          <ObjectiveCard
            text={role === "reader" ? t("reader.objective") : objectiveFor(state, selected)}
            phase={
              role === "reader"
                ? t("reader.hint")
                : buildBlueprint !== null
                  ? // PLAY-001 P-3: the phase the dock is in, phrased where the secondary
                    // line already lives, so the primary label can keep one wording.
                    // UI-RESET-53: right after a refused confirm the ghost stays armed
                    // (preserve-on-refusal), so state the refusal reason here instead of
                    // the now-inapplicable "tap again to place"; re-aiming clears it.
                    (buildRefusal ?? t("phase.ghost", { tile: ghostTile ?? 0 }))
                  : hintFor(suggestedAction(state))
            }
            numbers={restingLine(state, lastReject)}
          />
          {store.isReconciling() ? (
            // Spec 18.5: one small line while a long absence is settled off-thread.
            <p className="reconcile" role="status">
              {t("report.reconciling")}
            </p>
          ) : null}
          {/* UI-RESET-64: the contextual onboarding coach. It paints inside the lead block
              after the objective card, so the camera's chrome insets reserve its band and
              the world is never obscured. It is not a `.panel`/`.dock`/`.place-strip` and
              reuses no census class, so the resting-screen, dock-face and overlay-stack
              censuses are untouched. It derives every lesson from the authoritative state
              (respecting progress), adds a reachable earn-trap recovery, and guides the
              fresh yard to first Data without ever weakening the showResearch gate. */}
          <OnboardCoach
            state={state}
            buildBlueprint={buildBlueprint}
            ghostTile={ghostTile}
            reader={role === "reader"}
            onSalvage={() => dispatch({ id: nextCommandId(), type: "manual.salvage" })}
            onStore={() => rootPanel(PANEL_TRADE)}
          />
          {/* T12 (#139): the road tool entry face. The six toolbar slots are fixed
              (#135), so roads open from this additive lead-block button into the
              same one-panel stack (PANEL_ROAD = -10). Label-based censuses are
              untouched; the camera's chrome insets auto-measure the lead box. */}
          <button
            type="button"
            className="icon-btn road-entry"
            aria-label="Open road tool"
            aria-pressed={selected === PANEL_ROAD}
            onClick={() => openPanel(PANEL_ROAD)}
          >
            Roads
          </button>
          {/* T11 (#138): the build catalog entry face. The six toolbar slots are
              fixed (#135), so the world-grid catalog opens from this additive
              lead-block button into the same one-panel stack (PANEL_BUILD_TOOL
              = -11). Label-based censuses are untouched; the camera's chrome
              insets auto-measure the lead box. It is independent of the legacy
              2D build ghost above — the two never share state. */}
          <button
            type="button"
            className="icon-btn build-entry"
            aria-label="Open build catalog"
            aria-pressed={selected === PANEL_BUILD_TOOL}
            onClick={() => openPanel(PANEL_BUILD_TOOL)}
          >
            Build catalog
          </button>
          {/* UI-RESET-53: the explicit placement / move / dismantle previews. They paint
              inside the lead block so the camera's chrome insets reserve their band, and
              they are not `.panel`s, so the overlay census and dock faces are untouched.
              Only one destructive intent is ever armed at a time (see the exclusion effect). */}
          {buildBlueprint !== null && !catalogOpen ? (
            <PlacementStrip state={state} blueprint={buildBlueprint} tile={ghostTile} />
          ) : null}
          {moveFlow !== null ? (
            <MoveStrip
              state={state}
              machineId={moveFlow.machineId}
              tile={moveFlow.tile}
              onConfirm={confirmMove}
              onCancel={() => setMoveFlow(null)}
            />
          ) : null}
          {dismantleFlow !== null ? (
            <DismantleCard
              state={state}
              machineId={dismantleFlow.machineId}
              armed={dismantleFlow.armed}
              onConfirm={confirmDismantle}
              onCancel={() => setDismantleFlow(null)}
            />
          ) : null}
        </div>
        {toast ? <Toast text={toast.text} count={toast.count} onDone={() => setToast(null)} /> : null}
        {/* RW3D #135 (U03/U04): the ONE panel host. Exactly one major surface
            paints at a time — the top of the stack — as a right inspector on
            desktop or a bottom sheet / compact drawer below it. The host owns
            Back (one layer), the sheet expand toggle and focus in/out. */}
        <PanelHost
          desktop={desktopMode}
          activeKey={hostKey}
          depth={panelStack.length}
          expanded={sheetExpanded}
          onBack={backPanel}
          onToggleExpand={() => setSheetExpanded((value) => !value)}
        >
          {machine ? (
            <MachinePanel
              state={state}
              machine={machine}
              tick={state.tick}
              powerRatio={state.powerRatio}
              dispatch={dispatch}
              onClose={closeSelection}
            />
          ) : null}
          {selected === PANEL_TRADE ? (
            <StorePanel state={state} dispatch={dispatch} onClose={closeSelection} />
          ) : null}
          {selected === PANEL_RESEARCH ? (
            <ResearchPanel state={state} dispatch={dispatch} onClose={closeSelection} />
          ) : null}
          {selected === PANEL_ROUTES ? (
            <RoutesPanel state={state} dispatch={dispatch} onClose={closeSelection} />
          ) : null}
          {selected === PANEL_FLEET ? (
            <FleetPanel state={state} dispatch={dispatch} onClose={closeSelection} />
          ) : null}
          {selected === PANEL_MAP ? <MapPanel state={state} onClose={closeSelection} /> : null}
          {/* T12 (#139): the road destination. The store's road slice is an additive
              capability (RoadApi) kept off the GameStore surface, so the cast lives
              only at this registration site; existing store doubles stay untouched. */}
          {selected === PANEL_ROAD ? (
            <RoadToolPanel
              road={store as GameStore & RoadApi}
              locked={role === "reader"}
              onClose={closeSelection}
            />
          ) : null}
          {/* T11 (#138): world-grid build catalog. Same additive registration
              grammar as the road tool — a negative sentinel inside the one-panel
              stack, reader sessions see the catalog read-only. */}
          {selected === PANEL_BUILD_TOOL ? (
            <BuildToolPanel
              build={store as GameStore & BuildPlacementApi}
              locked={role === "reader"}
              onClose={closeSelection}
            />
          ) : null}
          {selected === PANEL_YARD ? (
            <YardPanel
              state={state}
              exportText={store.exportSave()}
              onImport={(text) => store.importSave(text)}
              onClose={closeSelection}
            />
          ) : null}
          {/* UI-RESET-62: the settings inspector. Same panel grammar as the other
              inspectors; Escape pops it through the shared stack path. Yard record
              and the return report open as layers over it (Back returns here). */}
          {selected === PANEL_SETTINGS ? (
            <SettingsPanel
              settings={settings}
              osReducedMotion={osReducedMotion}
              onToggleMute={toggleMute}
              onCycleText={cycleTextScale}
              onToggleReducedMotion={toggleReducedMotion}
              onReset={openReset}
              onClose={closeSelection}
              onOpenYard={() => openPanel(PANEL_YARD)}
              yardEnabled={state.tutorial >= 9}
              onOpenReport={() => openPanel(PANEL_REPORT)}
              reportAvailable={report !== null}
            />
          ) : null}
          {selected === PANEL_REPORT && report ? (
            <ReturnReportPanel report={report} onClose={closeSelection} />
          ) : null}
        </PanelHost>
        {/* UI-RESET-52: the build catalog. Not a `.panel`: it never joins the
            overlay-stack census, and the camera's chrome insets never measure
            it. Selecting a card re-aims the ghost; Place closes the catalog
            into the explicit placement preview; Cancel comes back here. */}
        {catalogOpen ? (
          <BuildCatalog
            state={state}
            selected={buildBlueprint}
            onSelect={(id) => {
              setBuildBlueprint(id);
              setGhostTile((tile) => (tile !== null ? tile : firstFreeTile(store.getState())));
              clearPanels();
            }}
            onPlace={() => setCatalogOpen(false)}
            onClose={() => setCatalogOpen(false)}
            onSalvage={() => dispatch({ id: nextCommandId(), type: "manual.salvage" })}
            onStore={() => rootPanel(PANEL_TRADE)}
          />
        ) : null}
        <DockButtons
          primary={primary}
          buildBlueprint={buildBlueprint}
          onOpenCatalog={openCatalog}
          onPlace={() => {
            if (buildBlueprint === null || ghostTile === null) return;
            // UI-RESET-53: a refused Build keeps the ghost armed underneath so the player
            // can re-aim or top up and try again — only a real spend retires the preview.
            const result = dispatch({
              id: nextCommandId(),
              type: "machine.build",
              blueprint: buildBlueprint,
              tile: ghostTile,
            });
            if (result.ok) {
              setBuildBlueprint(null);
              setGhostTile(null);
              setCatalogOpen(false);
              setBuildRefusal(null);
            } else if (result.reason === "blocked-placement") {
              // UI-RESET-53 (criterion a): an invalid cell preserves the placement so the
              // player can re-aim without re-opening the catalog. The phase states why and
              // the preview strip names the blocked cell; re-aiming clears the reason.
              setBuildRefusal(labelForReject(result));
            } else {
              // An affordability refusal returns to the recovery phase (PLAY-001 P-3): the
              // earn path stays reachable and the dock flips back to the suggested action.
              setBuildBlueprint(null);
              setGhostTile(null);
              setCatalogOpen(false);
              setBuildRefusal(null);
            }
          }}
          onCancelBuild={() => {
            // UI-RESET-52: Cancel returns to the catalog with the choice and the
            // ghost intact — planning again, never a spend and never a dead end.
            setCatalogOpen(true);
          }}
          onInventory={() => rootPanel(PANEL_TRADE)}
          research={showResearch(state)}
          onResearch={() => rootPanel(PANEL_RESEARCH)}
          yard={state.tutorial >= 9}
          onYard={() => rootPanel(PANEL_YARD)}
        />
        {/* RW3D #135 (U03): the persistent six-destination toolbar — the
            navigation spine on every viewport, centred on desktop, full-width
            labelled bottom nav on phones. Keys 1–6 share the same handlers. */}
        <Toolbar
          research={showResearch(state)}
          selected={selected}
          buildActive={buildBlueprint !== null}
          onSlot={onSlot}
        />
        {/* G2 #50: visible zoom + reset controls. Positioned by shell.css per
            band; the camera fit reserves their gutter so they never cover
            yard cells. */}
        <ShellZoom
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetCamera}
        />
      </div>
      {/* UI-RESET-62: the reset confirmation layers above the whole shell but
          outside `.hud`, so the HUD census never counts it. The menu/settings
          underneath stay exactly as they were; Cancel restores focus to the row
          that opened it. */}
      {resetOpen ? (
        <ResetDialog
          summary={hasSaveProgress(state) ? saveSummary(state) : null}
          onCancel={closeReset}
          onConfirm={performReset}
        />
      ) : null}
    </div>
  );
}

export function pickTarget(state: ReturnType<GameStore["getState"]>, x: number, y: number): number | null {
  for (const machine of state.machines) {
    const p = tileToWorld(machine.tile);
    if (Math.abs(p.x - x) <= 16 && Math.abs(p.y - y) <= 16) return machine.id;
  }
  if (Math.abs(WRECK_POSITION.x - x) <= 26 && Math.abs(WRECK_POSITION.y - y) <= 20) return -1;
  const dock = tileToWorld(DOCK_TILE);
  if (Math.abs(dock.x - x) <= 16 && Math.abs(dock.y - y) <= 16) return -2;
  return null;
}

export function buildPrimary(
  store: GameStore,
  dispatch: (command: Command) => unknown,
  selected: number | null,
  setBuildBlueprint: (id: string | null) => void,
  setGhostTile: (tile: number | null) => void
): PrimaryAction {
  const state = store.getState();
  const step = state.tutorial;
  if (step <= 1) {
    return { label: t("btn.salvage"), run: () => dispatch({ id: nextCommandId(), type: "manual.salvage" }) };
  }
  if (step === 2) {
    return {
      label: t("tut.repair"),
      cost: `${TUNING.repairCostScrap} ${resourceWord("scrap")}`,
      run: () => dispatch({ id: nextCommandId(), type: "drone.repair" }),
    };
  }
  if (step <= 6) {
    if (state.machines.length === 0) {
      return {
        // The same key the build-mode row prints, so the choice keeps one label across
        // the phase flip (PLAY-001 P-3).
        label: t("btn.buildNamed", { machine: BLUEPRINTS.sorter.label }),
        cost: costSummary(BLUEPRINTS.sorter),
        run: () => {
          setBuildBlueprint("sorter");
          setGhostTile(8);
        },
      };
    }
    if (state.routes.length === 0) {
      return {
        label: t("tut.connectSorter"),
        run: () => {
          const sorter = state.machines.find((m) => m.blueprint === "sorter");
          if (!sorter) return;
          dispatch({ id: nextCommandId(), type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
          dispatch({ id: nextCommandId(), type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
        },
      };
    }
    if (!state.machines.some((m) => m.blueprint === "furnace")) {
      return {
        label: t("btn.buildNamed", { machine: BLUEPRINTS.furnace.label }),
        cost: costSummary(BLUEPRINTS.furnace),
        run: () => {
          setBuildBlueprint("furnace");
          setGhostTile(9);
        },
      };
    }
    const furnace = state.machines.find((m) => m.blueprint === "furnace");
    if (furnace) {
      const plans = planConnections(state, furnace.id);
      if (plans.length > 0) {
        return {
          label: t("tut.connectFurnace"),
          run: () => {
            for (const plan of plans) {
              dispatch({ id: nextCommandId(), type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
            }
          },
        };
      }
    }
    return { label: t("btn.salvage"), run: () => dispatch({ id: nextCommandId(), type: "manual.salvage" }) };
  }
  if (step === 7) {
    return {
      label: t("tut.sellSteel"),
      cost: t("value.exportContract", {
        qty: TUNING.exportContractSteel,
        label: resourceWord("steel"),
        credits: TUNING.exportContractCredits,
      }),
      run: () => dispatch({ id: nextCommandId(), type: "contract.export" }),
    };
  }
  // With an explicit selection the machine's own step leads; otherwise the dock
  // follows the same yard ladder as the objective card.
  if (selected !== null && selected > 0) {
    const step = stepForMachine(state, selected);
    if (step) return primaryForStep(state, step, dispatch, setBuildBlueprint, setGhostTile);
  }
  return primaryForStep(state, nextYardStep(state), dispatch, setBuildBlueprint, setGhostTile);
}

/**
 * One authoritative step as one dock action. The upgrade step also carries its two
 * named outcomes, each at its own price, each committing on its own tap (A1-3,
 * STRAT-003).
 */
function primaryForStep(
  state: SimState,
  step: YardStep,
  dispatch: (command: Command) => unknown,
  setBuildBlueprint: (id: string | null) => void,
  setGhostTile: (tile: number | null) => void
): PrimaryAction {
  const action: PrimaryAction = {
    ...primaryFor(state, step),
    run: () => runStep(state, step, dispatch, setBuildBlueprint, setGhostTile),
  };
  if (step.kind === "upgrade") {
    // BLD-001 (already on `main`): `branchOptions` answers cheapest-first, so the leftmost
    // face is the plan the purse can pay. UI-002 adds only the paint: that leftmost face
    // carries the single accent fill of the row (`dock__btn--primary`).
    const options = branchOptions(state, step.machineId);
    if (options.length > 0) {
      action.branches = options.map((option) => ({
        ...option,
        run: () =>
          dispatch({
            id: nextCommandId(),
            type: "machine.upgrade",
            machineId: step.machineId,
            branch: option.id,
          }),
      }));
    }
  }
  return action;
}

/** Executes the shared yard ladder; one primary press, one authoritative step. */
function runStep(
  state: SimState,
  step: YardStep,
  dispatch: (command: Command) => unknown,
  setBuildBlueprint: (id: string | null) => void,
  setGhostTile: (tile: number | null) => void
): void {
  switch (step.kind) {
    case "connect":
      for (const plan of step.plans) {
        dispatch({
          id: nextCommandId(),
          type: "route.connect",
          from: plan.from,
          to: plan.to,
          filter: plan.filter,
        });
      }
      return;
    case "build":
      setBuildBlueprint(step.blueprint);
      setGhostTile(firstFreeTile(state));
      return;
    case "sell":
      dispatch({ id: nextCommandId(), type: "contract.sell", resource: step.resource, qty: step.qty });
      return;
    case "research":
      dispatch({ id: nextCommandId(), type: "research.buy", node: step.node });
      return;
    case "drone":
      dispatch({ id: nextCommandId(), type: "drone.add" });
      return;
    case "upgrade":
      dispatch({ id: nextCommandId(), type: "machine.upgrade", machineId: step.machineId });
      return;
    default:
      dispatch({ id: nextCommandId(), type: "manual.salvage" });
  }
}

/** N (spec §5): the next unoccupied cell after the ghost, wrapping past the dock. */
function cycleGhostTile(state: SimState, current: number | null): number {
  const start = current === null ? -1 : current;
  for (let i = 1; i <= YARD_TILES; i += 1) {
    const tile = (start + i + YARD_TILES) % YARD_TILES;
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return firstFreeTile(state);
}

/** First unoccupied yard cell, so a new machine never lands on the dock tile. */
export function firstFreeTile(state: SimState): number {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
}

/** Research appears in the dock once data exists or a node is known (spec 5.5). */
export function showResearch(state: SimState): boolean {
  return (state.store.data ?? 0) > 0 || Object.keys(state.research ?? {}).length > 0;
}

/** Which working cue a running machine owns (Q-005 S-14). */
export function machineCueFor(blueprint: string): CueName | null {
  if (blueprint === "sorter") return "sorter";
  if (blueprint === "furnace") return "furnace";
  return null;
}

/** The tile a machine cue belongs to, for near/far attenuation; null for yard cues. */
function cueTile(state: SimState, cue: CueName): number | null {
  if (cue !== "sorter" && cue !== "furnace") return null;
  for (const machine of state.machines) {
    if (machineCueFor(machine.blueprint) === cue) return machine.tile;
  }
  return null;
}

/** Manhattan distance in cells between two yard tiles. */
function tileDistance(a: number, b: number): number {
  const first = tileToWorld(a);
  const second = tileToWorld(b);
  return (Math.abs(first.x - second.x) + Math.abs(first.y - second.y)) / CELL;
}

/**
 * Cues the yard state itself produces, i.e. the voices no command tap fires
 * (Q-005 S-14): a machine that completed a batch since the previous frame plays its
 * own working cue, and the first data unit in the store plays the discovery accent.
 * A pure diff over two states, so it is testable without a timer or a context.
 */
export function stateCues(previous: SimState, next: SimState): CueName[] {
  const cues: CueName[] = [];
  for (const machine of next.machines) {
    const before = previous.machines.find((item) => item.id === machine.id);
    if (!before || machine.batchesDone <= before.batchesDone) continue;
    const cue = machineCueFor(machine.blueprint);
    if (cue !== null && !cues.includes(cue)) cues.push(cue);
  }
  if ((previous.store.data ?? 0) <= 0 && (next.store.data ?? 0) > 0) cues.push("discovery");
  return cues;
}

function cueFor(type: Command["type"]): CueName {
  switch (type) {
    case "manual.salvage":
      return "salvage";
    case "drone.repair":
      return "repair";
    case "drone.add":
      return "drone";
    case "machine.upgrade":
      return "upgrade";
    case "contract.export":
      return "return";
    default:
      return "collect";
  }
}

/**
 * One shared table, so no surface can show a different reason text. A material or credit
 * shortfall also names its own two numbers - what the price asks and what the yard holds -
 * read off the same result the button was refused by (PLAY-001 P-1).
 */
export function labelForReject(result: Extract<CommandResult, { ok: false }>): string {
  const base = REJECT_TEXT[result.reason] ?? t("reject.not-found");
  if (result.reason === "insufficient" && result.need !== undefined) {
    return t("reject.shortfall", {
      need: result.need,
      have: result.have ?? 0,
      word: result.word ?? "",
    });
  }
  return base;
}
