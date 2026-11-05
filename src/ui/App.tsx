import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GameStore } from "../app/store";
import { suggestedAction } from "../game/simulation/offline";
import { TUNING, unlockedBlueprints, BLUEPRINTS } from "../game/content/defs";
import {
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandReject,
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
import { REJECT_TEXT, branchOptions, costSummary, hintFor, objectiveFor, powerLine, primaryFor } from "./text";
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
 * L-1: the chrome band the world is fitted into, read from the boxes the layout
 * actually paints - the bottom edge of the top cluster and the gap under the dock.
 * The canvas covers the viewport, so both are already in the canvas' own CSS-px space.
 * An empty measurement (a jsdom box of 0) yields no band and the legacy fit.
 */
function chromeInsets(cssHeight: number): CameraInsets | undefined {
  if (cssHeight <= 0) return undefined;
  const top = document.querySelector(".hud__top");
  const dock = document.querySelector(".dock");
  if (!top || !dock) return undefined;
  const topEdge = top.getBoundingClientRect().bottom;
  const dockTop = dock.getBoundingClientRect().top;
  if (!(topEdge > 0) || !(dockTop > 0)) return undefined;
  return { top: topEdge, bottom: Math.max(0, cssHeight - dockTop) };
}

export function App({ store, audioApi }: { store: GameStore; audioApi?: AudioApi }) {
  useRevision(store);
  const state = useSim(store);
  const settings = useSettings(store);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>(fitCamera({ width: 360, height: 640 }));
  const audioRef = useRef<AudioApi | null>(audioApi ?? null);
  const cueStateRef = useRef<SimState>(store.getState());
  const insetsRef = useRef<CameraInsets | undefined>(undefined);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: 0, lastX: 0, lastY: 0, pinch: 0 });

  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [buildBlueprint, setBuildBlueprint] = useState<string | null>(null);
  const [ghostTile, setGhostTile] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(true);

  const audio = useCallback((): AudioApi => {
    if (!audioRef.current) audioRef.current = createAudio(store.getSettings().muted);
    return audioRef.current;
  }, [store]);

  const dispatch = useCallback(
    (command: Command) => {
      const result = store.dispatch(command);
      if (result.ok) {
        audio().play(cueFor(command.type));
      } else {
        audio().play("blocked");
        setToast(labelForReject(result.reason));
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

  useEffect(() => {
    // Spec 5.5: Escape closes the most local context first - panel, then build mode.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (reportOpen && store.getReturnReport()) {
        setReportOpen(false);
        return;
      }
      if (selected !== null) {
        setSelected(null);
        return;
      }
      if (buildBlueprint !== null) {
        setBuildBlueprint(null);
        setGhostTile(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reportOpen, selected, buildBlueprint, store]);

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
      // L-1: the chrome band changes with the text scale and with an open panel, so the
      // fit is redone whenever either the canvas box or the band moved.
      const moved =
        (insets?.top ?? -1) !== (insetsRef.current?.top ?? -1) ||
        (insets?.bottom ?? -1) !== (insetsRef.current?.bottom ?? -1);
      if (canvas.width !== w || canvas.height !== h || moved) {
        canvas.width = w;
        canvas.height = h;
        insetsRef.current = insets;
        cameraRef.current = fitCamera({ width: cssWidth, height: cssHeight }, insets);
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
      <div className="hud">
        <div>
          <HudTop
            state={state}
            muted={settings.muted}
            textScale={settings.textScale}
            onCycleText={cycleTextScale}
            onToggleMute={() => {
              const next = !settings.muted;
              store.setSettings({ muted: next });
              audio().setMuted(next);
            }}
            onHome={() => {
              cameraRef.current = fitCamera({ width: window.innerWidth, height: window.innerHeight });
              setSelected(null);
            }}
          />
          <ObjectiveCard
            text={role === "reader" ? t("reader.objective") : objectiveFor(state, selected)}
            hint={
              role === "reader"
                ? t("reader.hint")
                : hintFor(suggestedAction(state))
            }
            power={state.machines.length > 0 ? powerLine(state) : ""}
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
        <DockButtons
          primary={primary}
          buildBlueprint={buildBlueprint}
          unlocked={unlockedBlueprints(state.tutorial)}
          onPickBlueprint={(id) => {
            setBuildBlueprint(id);
            setGhostTile((tile) => (tile !== null ? tile : firstFreeTile(store.getState())));
            setSelected(null);
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
          onInventory={() => setSelected(-2)}
          research={showResearch(state)}
          onResearch={() => setSelected(-3)}
          yard={state.tutorial >= 9}
          onYard={() => setSelected(-4)}
        />
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
        label: t("tut.buildSorter"),
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
        label: t("tut.buildFurnace"),
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
 * One authoritative step as one dock action. The upgrade step also carries its three
 * named outcomes, each priced the same and each committing on its own tap (A1-3).
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

/** One shared table, so no surface can show a different reason text. */
export function labelForReject(reason: CommandReject): string {
  return REJECT_TEXT[reason] ?? t("reject.not-found");
}
