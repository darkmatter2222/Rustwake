import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GameStore } from "../app/store";
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
  WRECK_POSITION,
  drawScene,
  fitCamera,
  screenToWorld,
  tileToWorld,
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
  StorePanel,
  YardPanel,
} from "./Panels";
import { DockButtons, Gate, HudTop, ObjectiveCard, Toast } from "./Hud";
import { BuildCatalog } from "./build/BuildCatalog";
import { DismantleCard, MoveStrip, PlacementStrip } from "./place/PlacePreview";
import { Primitives48 } from "./primitives";
import { bandFor } from "./tokens";
import { MenuSheet, ShellMenuFace, ShellRail, ShellZoom, useRailMode } from "./shell/Shell";
import {
  SHELL_GUTTER_PX,
  SHELL_INSPECTOR_TOP_PX,
  SHELL_RIGHT_GUTTER_PX,
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

let commandSeq = 0;
const nextCommandId = (): string => `c${++commandSeq}`;

/**
 * L-1 / UI-RESET-49 G2: the chrome band the world is fitted into, read from the
 * boxes the layout actually paints — the bottom edge of the lead block (chips +
 * objective) and the gap above the dock. In rail mode the painted rail box also
 * reserves the left edge and the inspector gutter reserves the right, so the
 * world fits the region between them instead of the whole canvas. The canvas
 * covers the viewport, so every box is already in the canvas' own CSS-px space.
 * An empty measurement (a jsdom box of 0) yields no band and the legacy fit.
 */
interface ShellInsets extends CameraInsets {
  left: number;
  right: number;
}

function chromeInsets(cssHeight: number): ShellInsets | undefined {
  if (cssHeight <= 0) return undefined;
  const lead = document.querySelector(".hud__lead") ?? document.querySelector(".hud__top");
  const dock = document.querySelector(".dock");
  if (!lead || !dock) return undefined;
  const topEdge = lead.getBoundingClientRect().bottom;
  const dockTop = dock.getBoundingClientRect().top;
  if (!(topEdge > 0) || !(dockTop > 0)) return undefined;
  // Paint truth, not a second matchMedia: the rail reserves the left edge only
  // while its box is actually on screen (rail mode), so the camera and the CSS
  // can never disagree about which mode the viewport is in.
  const rail = document.querySelector(".shell-rail");
  const railBox = rail ? rail.getBoundingClientRect() : null;
  const railActive = railBox !== null && railBox.width > 0;
  return {
    top: topEdge + 6,
    bottom: Math.max(0, cssHeight - dockTop) + 6,
    left: railActive ? railBox.right + 6 : 0,
    // UI-RESET-50: rail mode reserves the inspector gutter; phone/column
    // reserve the zoom stack's right gutter instead, so the visible camera
    // controls never cover a yard cell the player must tap or build on.
    right: railActive ? SHELL_RIGHT_GUTTER_PX : SHELL_ZOOM_GUTTER_PX,
  };
}

/**
 * Fit the world into the shell's world region. `fitCamera` (scene.ts, frozen)
 * centres on the view it is given, so it is handed the region's own width and
 * the camera is then shifted by the region centre's offset from the canvas
 * centre — the yard lands between the rail and the inspector, not under them.
 */
function fitToShell(cssWidth: number, cssHeight: number): Camera {
  const insets = chromeInsets(cssHeight);
  const left = insets?.left ?? 0;
  const right = insets?.right ?? 0;
  const regionWidth = Math.max(1, cssWidth - left - right);
  const camera = fitCamera({ width: regionWidth, height: cssHeight }, insets);
  if (left > 0 || right > 0) {
    camera.x += (cssWidth / 2 - (left + regionWidth / 2)) / camera.scale;
  }
  return camera;
}

export function App({ store, audioApi }: { store: GameStore; audioApi?: AudioApi }) {
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
  const [selected, setSelected] = useState<number | null>(null);
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
  const [toast, setToast] = useState<string | null>(null);
  /**
   * PLAY-002 2 (TST-001, QA D-3): the last rejected command, kept after the 1.8 s toast
   * is gone. `null` while nothing has been refused. It is plain component state - never
   * written into the save - so the two surfaces share one string and the sim stays pure.
   */
  const [lastReject, setLastReject] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(true);
  /**
   * G2 (E3): the one bounded Menu sheet. Navigation state only — opening,
   * closing or switching a destination never issues a game command, and the
   * selection underneath survives the sheet (E4).
   */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const menuFaceRef = useRef<HTMLButtonElement | null>(null);
  const railMode = useRailMode();

  const audio = useCallback((): AudioApi => {
    if (!audioRef.current) audioRef.current = createAudio(store.getSettings().muted);
    return audioRef.current;
  }, [store]);

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
        setToast(text);
        // One string, computed once: the transient toast and the resting line's trailing
        // segment are the same readout at two lifetimes (PLAY-002 2).
        setLastReject(text);
      }
      return result;
    },
    [store, audio]
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
          setSelected(command.machineId);
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
    [store, commit]
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
      setSelected(null);
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
    // G2: the inspector/menu top is the spec's 104 px at scale 1, but the lead
    // block (chips + objective) grows with the text scale and would overlap a
    // fixed top in rail mode. Measure the painted lead and lift the floor to
    // its bottom edge + gutter — the same paint-truth the camera insets read.
    // The variable is only consumed by the rail media block, so phone/column
    // (in-flow panels) are untouched. jsdom has no ResizeObserver; the one-shot
    // measurement still runs and the 104 px floor holds.
    const root = document.documentElement;
    if (!railMode) {
      root.style.removeProperty("--shell-inspector-top");
      return;
    }
    const lead = document.querySelector<HTMLElement>(".hud__lead");
    if (!lead) return;
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
    // never re-ran once the yard painted and --shell-inspector-top stayed unset
    // (the rail sheets fell back to 104 px and overlapped the lead block).
  }, [railMode, started, settings.textScale, state.tutorial]);

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
    // The operating-system preference wins for reduced motion; the saved value
    // covers every other case, and the renderer reads it from settings each frame.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      store.setSettings({ reducedMotion: true });
    }
  }, [store]);

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

  const openMenu = useCallback(() => {
    menuOpenerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    // E5: focus returns to the face that opened the sheet. Restored synchronously,
    // before React unmounts the dialog, so focus never drops to the body; a
    // keyboard-opened menu (no focused opener) lands on the Menu face itself.
    const opener = menuOpenerRef.current;
    const target = opener && opener !== document.body ? opener : menuFaceRef.current;
    if (target && typeof target.focus === "function") target.focus();
  }, []);

  const toggleMenu = useCallback(() => {
    if (menuOpen) closeMenu();
    else openMenu();
  }, [menuOpen, openMenu, closeMenu]);

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
    setSelected(null);
    setMenuOpen(false);
  }, [store, buildBlueprint]);

  /**
   * The five destinations (spec §3.1), shared by the rail, the Menu face's
   * sheet and keys 1–5. Each reads the freshest state from the store; disabled
   * destinations are inert here too, so a key press can never bypass the rail's
   * printed reason (E8). Opening a context closes the menu (E3) but never
   * clears another context's selection.
   */
  const onSlot = useCallback(
    (slot: ShellSlot) => {
      const snapshot = store.getState();
      switch (slot) {
        case "yard":
          if (snapshot.tutorial >= 9) {
            setSelected(-4);
            setMenuOpen(false);
            setCatalogOpen(false);
          }
          return;
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
        case "store":
          setSelected(-2);
          setMenuOpen(false);
          setCatalogOpen(false);
          return;
        case "research":
          if (showResearch(snapshot)) {
            setSelected(-3);
            setMenuOpen(false);
            setCatalogOpen(false);
          }
          return;
        case "menu":
          if (menuOpen) closeMenu();
          else openMenu();
          return;
      }
    },
    [store, buildBlueprint, menuOpen, openMenu, closeMenu, openCatalog]
  );

  useEffect(() => {
    // Spec 5.5 / UI-002 U-5: Escape closes the *nearest* context first - the menu
    // sheet (the newest layer), then the panel the player just opened, then the
    // build ghost, and only then the return report, which is the oldest overlay
    // on the screen. One press, one overlay retired, so no press can clear the
    // whole stack at once and no pile-up can survive a thumb.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menuOpen) {
        closeMenu();
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
      if (selected !== null) {
        setSelected(null);
        return;
      }
      if (buildBlueprint !== null) {
        setBuildBlueprint(null);
        setGhostTile(null);
        // UI-RESET-52: the catalog is part of the one build layer, so the press
        // that drops the ghost retires it too — the report underneath survives.
        setCatalogOpen(false);
        return;
      }
      if (reportOpen && store.getReturnReport()) {
        setReportOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportOpen, selected, buildBlueprint, menuOpen, closeMenu, store, moveFlow, dismantleFlow]);

  useEffect(() => {
    // Spec §5: keys 1–5 reach the five destinations, arrows pan, +/- zoom and N
    // cycles the build ghost. Text fields keep their own keys — a save code
    // typed into the yard record must never steer the shell.
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
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
  }, [onSlot, buildBlueprint, store, moveFlow]);

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
      const insets = chromeInsets(cssHeight);
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
        reducedMotion: settings.reducedMotion,
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
      // Q-005 S-14: the machine-state cues come from the state diff itself, so a
      // working sorter, a working furnace and the first data unit each get their
      // declared voice without a per-machine timer. Near/far is the tile distance
      // from the camera centre, so a zoomed-out yard reads with depth (S-16).
      const previous = cueStateRef.current;
      const current = snapshot;
      if (previous !== current) {
        const centre = worldToTile(cameraRef.current.x, cameraRef.current.y) ?? DOCK_TILE;
        for (const cue of stateCues(previous, current)) {
          const tile = cueTile(current, cue);
          audio().play(cue, {
            distance: tile === null ? 0 : tileDistance(tile, centre),
            zoom: cameraRef.current.scale,
          });
        }
        cueStateRef.current = current;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [store, settings.reducedMotion, buildBlueprint, ghostTile, selected, audio, moveFlow]);

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
    const hit = pickTarget(store.getState(), world.x, world.y);
    if (hit === null) {
      setSelected(null);
      return;
    }
    setSelected(hit);
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
              setToast(t("reader.stuck"));
            }
          },
        }
      : buildPrimary(store, dispatch, selected, setBuildBlueprint, setGhostTile);

  const machine =
    selected !== null && selected > 0 ? state.machines.find((m) => m.id === selected) : undefined;
  const report = reportOpen ? store.getReturnReport() : null;

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
    return (
      <div className="game">
        <canvas ref={canvasRef} />
        <Gate
          onBegin={() => {
            audio().resume();
            audio().play("upgrade");
            setStarted(true);
            store.start();
          }}
          muted={settings.muted}
          onToggleMute={() => {
            const next = !settings.muted;
            store.setSettings({ muted: next });
            audio().setMuted(next);
          }}
        />
      </div>
    );
  }

  return (
    <div className="game">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <div
        className={
          "hud" +
          (buildBlueprint !== null ? " hud--build" : "") +
          (menuOpen ? " hud--menu" : "")
        }
      >
        {/* G2 R1: the destination rail, rendered exactly where it is painted
            (wide desktops and short landscape). Phone/column modes keep their
            destinations in the dock row plus the Menu face — no hidden copies. */}
        {railMode ? (
          <ShellRail
            tutorial={state.tutorial}
            research={showResearch(state)}
            selected={selected}
            buildActive={buildBlueprint !== null}
            menuOpen={menuOpen}
            onSlot={onSlot}
          />
        ) : null}
        <div className="hud__lead">
          <HudTop
            state={state}
            muted={settings.muted}
            textScale={settings.textScale}
            onCycleText={cycleTextScale}
            onToggleMute={toggleMute}
            onHome={() => {
              resetCamera();
              setSelected(null);
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
        {toast ? <Toast text={toast} onDone={() => setToast(null)} /> : null}
        {/* Panels are HUD-column children so the column keeps them between the
            objective and the dock at every text scale. */}
        {machine ? (
          <MachinePanel
            state={state}
            machine={machine}
            tick={state.tick}
            powerRatio={state.powerRatio}
            dispatch={dispatch}
            onClose={() => setSelected(null)}
          />
        ) : null}
        {selected === -2 ? (
          <StorePanel state={state} dispatch={dispatch} onClose={() => setSelected(null)} />
        ) : null}
        {selected === -3 ? (
          <ResearchPanel state={state} dispatch={dispatch} onClose={() => setSelected(null)} />
        ) : null}
        {selected === -4 ? (
          <YardPanel
            state={state}
            exportText={store.exportSave()}
            onImport={(text) => store.importSave(text)}
            onClose={() => setSelected(null)}
          />
        ) : null}
        {report ? <ReturnReportPanel report={report} onClose={() => setReportOpen(false)} /> : null}
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
              setSelected(null);
            }}
            onPlace={() => setCatalogOpen(false)}
            onClose={() => setCatalogOpen(false)}
            onSalvage={() => dispatch({ id: nextCommandId(), type: "manual.salvage" })}
            onStore={() => {
              setSelected(-2);
              setCatalogOpen(false);
              setMenuOpen(false);
            }}
          />
        ) : null}
        {/* G2 E3: the one bounded Menu sheet. While it is up the panels yield
            their slot, but `selected` is untouched (E4) — closing it restores
            the same context. It is not a `.panel`, so the overlay-stack census
            keeps counting inspectors only. */}
        {menuOpen ? (
          <MenuSheet
            onClose={closeMenu}
            onHome={() => {
              resetCamera();
              setSelected(null);
              closeMenu();
            }}
            onYard={() => {
              setSelected(-4);
              setMenuOpen(false);
            }}
            yardEnabled={state.tutorial >= 9}
            onReport={() => {
              setReportOpen(true);
              setMenuOpen(false);
            }}
            reportAvailable={store.getReturnReport() !== null}
            muted={settings.muted}
            onToggleMute={toggleMute}
            textScale={settings.textScale}
            onCycleText={cycleTextScale}
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
          onInventory={() => {
            setSelected(-2);
            setMenuOpen(false);
            setCatalogOpen(false);
          }}
          research={showResearch(state)}
          onResearch={() => {
            setSelected(-3);
            setMenuOpen(false);
            setCatalogOpen(false);
          }}
          yard={state.tutorial >= 9}
          onYard={() => {
            setSelected(-4);
            setMenuOpen(false);
            setCatalogOpen(false);
          }}
        />
        {/* G2: the Menu face — thumb zone on phones, the corner Home left in the
            column band; rail mode hides it because slot 5 owns the menu there. */}
        <ShellMenuFace ref={menuFaceRef} open={menuOpen} onToggle={toggleMenu} />
        {/* G2 #50: visible zoom + reset controls. Positioned by shell.css per
            band; the camera fit reserves their gutter so they never cover
            yard cells. */}
        <ShellZoom
          onZoomIn={() => zoomBy(ZOOM_STEP)}
          onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
          onReset={resetCamera}
        />
      </div>
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
