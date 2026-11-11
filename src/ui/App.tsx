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
} from "../game/renderer/scene";
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
import { Primitives48 } from "./primitives";
import { bandFor } from "./tokens";
import { MenuSheet, ShellMenuFace, ShellRail, useRailMode } from "./shell/Shell";
import {
  SHELL_GUTTER_PX,
  SHELL_INSPECTOR_TOP_PX,
  SHELL_RIGHT_GUTTER_PX,
  SHELL_SLOTS,
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
const TAP_THRESHOLD = 8;

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
    right: railActive ? SHELL_RIGHT_GUTTER_PX : 0,
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
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: 0, lastX: 0, lastY: 0, pinch: 0 });

  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [buildBlueprint, setBuildBlueprint] = useState<string | null>(null);
  const [ghostTile, setGhostTile] = useState<number | null>(null);
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

  const dispatch = useCallback(
    (command: Command) => {
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
          }
          return;
        case "build": {
          if (buildBlueprint !== null) {
            setBuildBlueprint(null);
            setGhostTile(null);
            return;
          }
          const unlocked = unlockedBlueprints(snapshot.tutorial);
          const ids = unlocked.length > 0 ? unlocked : Object.keys(BLUEPRINTS);
          setBuildBlueprint(ids[0]);
          setGhostTile((tile) => (tile !== null ? tile : firstFreeTile(snapshot)));
          setSelected(null);
          setMenuOpen(false);
          return;
        }
        case "store":
          setSelected(-2);
          setMenuOpen(false);
          return;
        case "research":
          if (showResearch(snapshot)) {
            setSelected(-3);
            setMenuOpen(false);
          }
          return;
        case "menu":
          if (menuOpen) closeMenu();
          else openMenu();
          return;
      }
    },
    [store, buildBlueprint, menuOpen, openMenu, closeMenu]
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
      if (selected !== null) {
        setSelected(null);
        return;
      }
      if (buildBlueprint !== null) {
        setBuildBlueprint(null);
        setGhostTile(null);
        return;
      }
      if (reportOpen && store.getReturnReport()) {
        setReportOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportOpen, selected, buildBlueprint, menuOpen, closeMenu, store]);

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
      const step = 16 / camera.scale;
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          cameraRef.current = { ...camera, x: clampAxis(camera.x - step, 192) };
          return;
        case "ArrowRight":
          event.preventDefault();
          cameraRef.current = { ...camera, x: clampAxis(camera.x + step, 192) };
          return;
        case "ArrowUp":
          event.preventDefault();
          cameraRef.current = { ...camera, y: clampAxis(camera.y - step, 224) };
          return;
        case "ArrowDown":
          event.preventDefault();
          cameraRef.current = { ...camera, y: clampAxis(camera.y + step, 224) };
          return;
        case "+":
        case "=":
          event.preventDefault();
          cameraRef.current = { ...camera, scale: Math.min(6, camera.scale * 1.2) };
          return;
        case "-":
        case "_":
          event.preventDefault();
          cameraRef.current = { ...camera, scale: Math.max(1.2, camera.scale / 1.2) };
          return;
        case "n":
        case "N":
          if (buildBlueprint !== null) {
            event.preventDefault();
            setGhostTile((tile) => cycleGhostTile(store.getState(), tile));
          }
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSlot, buildBlueprint, store]);

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
        cameraRef.current = fitToShell(cssWidth, cssHeight);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Q-004 B1: one state read per rendered frame, shared by the canvas, the ghost
      // validity check and the cue diff, so both surfaces describe the same tick.
      const snapshot = store.getState();
      drawScene(ctx, snapshot, cameraRef.current, { width: cssWidth, height: cssHeight }, {
        reducedMotion: settings.reducedMotion,
        buildMode: buildBlueprint !== null,
        ghostTile: buildBlueprint !== null ? ghostTile : null,
        ghostValid:
          ghostTile !== null &&
          ghostTile !== DOCK_TILE &&
          !snapshot.machines.some((m) => m.tile === ghostTile),
        selected,
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
  }, [store, settings.reducedMotion, buildBlueprint, ghostTile, selected, audio]);

  const pinchDistance = (): number => {
    const list = [...pointers.current.values()];
    if (list.length < 2) return 0;
    return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag.current = { moved: 0, lastX: event.clientX, lastY: event.clientY, pinch: pinchDistance() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const dx = event.clientX - drag.current.lastX;
    const dy = event.clientY - drag.current.lastY;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const next = pinchDistance();
      const previous = drag.current.pinch;
      if (previous > 4 && next > 4) {
        const scale = Math.min(6, Math.max(1.2, cameraRef.current.scale * (next / previous)));
        cameraRef.current = { ...cameraRef.current, scale };
      }
      drag.current.pinch = next;
      return;
    }
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.current.moved > TAP_THRESHOLD) {
      const scale = cameraRef.current.scale;
      cameraRef.current = {
        ...cameraRef.current,
        x: clampAxis(cameraRef.current.x - dx / scale, 192),
        y: clampAxis(cameraRef.current.y - dy / scale, 224),
      };
    }
    drag.current.lastX = event.clientX;
    drag.current.lastY = event.clientY;
    if (buildBlueprint !== null) {
      const world = worldAt(canvasRef.current, cameraRef.current, event);
      setGhostTile(world === null ? null : worldToTile(world.x, world.y));
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const isTap = drag.current.moved <= TAP_THRESHOLD && pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    if (!isTap) return;
    const world = worldAt(canvasRef.current, cameraRef.current, event);
    if (world === null) return;
    const hit = pickTarget(store.getState(), world.x, world.y);
    if (buildBlueprint !== null) {
      const tile = worldToTile(world.x, world.y);
      if (tile !== null) setGhostTile(tile);
      return;
    }
    if (hit === null) {
      setSelected(null);
      return;
    }
    setSelected(hit);
    if (hit === -1 && (state.tutorial <= 1 || !state.drone.repaired)) {
      dispatch({ id: nextCommandId(), type: "manual.salvage" });
    }
  };

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
        onPointerCancel={onPointerUp}
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
              cameraRef.current = fitToShell(window.innerWidth, window.innerHeight);
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
                    t("phase.ghost", { tile: ghostTile ?? 0 })
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
        {/* G2 E3: the one bounded Menu sheet. While it is up the panels yield
            their slot, but `selected` is untouched (E4) — closing it restores
            the same context. It is not a `.panel`, so the overlay-stack census
            keeps counting inspectors only. */}
        {menuOpen ? (
          <MenuSheet
            onClose={closeMenu}
            onHome={() => {
              cameraRef.current = fitToShell(window.innerWidth, window.innerHeight);
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
          unlocked={unlockedBlueprints(state.tutorial)}
          onPickBlueprint={(id) => {
            setBuildBlueprint(id);
            setGhostTile((tile) => (tile !== null ? tile : firstFreeTile(store.getState())));
            setSelected(null);
            setMenuOpen(false);
          }}
          onPlace={() => {
            if (buildBlueprint === null || ghostTile === null) return;
            dispatch({ id: nextCommandId(), type: "machine.build", blueprint: buildBlueprint, tile: ghostTile });
            setBuildBlueprint(null);
            setGhostTile(null);
          }}
          onCancelBuild={() => {
            setBuildBlueprint(null);
            setGhostTile(null);
          }}
          onInventory={() => {
            setSelected(-2);
            setMenuOpen(false);
          }}
          research={showResearch(state)}
          onResearch={() => {
            setSelected(-3);
            setMenuOpen(false);
          }}
          yard={state.tutorial >= 9}
          onYard={() => {
            setSelected(-4);
            setMenuOpen(false);
          }}
        />
        {/* G2: the Menu face — thumb zone on phones, the corner Home left in the
            column band; rail mode hides it because slot 5 owns the menu there. */}
        <ShellMenuFace ref={menuFaceRef} open={menuOpen} onToggle={toggleMenu} />
      </div>
    </div>
  );
}

function clampAxis(value: number, span: number): number {
  const half = span / 2;
  return Math.min(span - half, Math.max(half, value));
}

function worldAt(
  canvas: HTMLCanvasElement | null,
  camera: Camera,
  event: ReactPointerEvent<HTMLCanvasElement>
): { x: number; y: number } | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(camera, { width: rect.width, height: rect.height }, event.clientX - rect.left, event.clientY - rect.top);
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
