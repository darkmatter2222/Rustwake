import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { GameStore } from "../app/store";
import { suggestedAction } from "../game/simulation/offline";
import { TUNING, unlockedBlueprints } from "../game/content/defs";
import {
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandReject,
} from "../game/simulation/commands";
import type { SimState } from "../game/simulation/types";
import {
  WRECK_POSITION,
  drawScene,
  fitCamera,
  screenToWorld,
  tileToWorld,
  worldToTile,
  type Camera,
} from "../game/renderer/scene";
import { createAudio, type AudioApi, type CueName } from "../game/audio/audio";
import { hintFor, objectiveFor, primaryFor } from "./text";
import { nextYardStep, stepForMachine, type YardStep } from "../game/simulation/plan";
import { planConnections } from "../game/simulation/autoconnect";
import { useRevision, useSettings, useSim } from "./useGame";
import { MachinePanel, ReturnReportPanel, StorePanel } from "./Panels";
import { DockButtons, Gate, HudTop, ObjectiveCard, Toast } from "./Hud";

export interface PrimaryAction {
  label: string;
  cost?: string;
  disabled?: boolean;
  run: () => void;
}

let commandSeq = 0;
const nextCommandId = (): string => `c${++commandSeq}`;
const TAP_THRESHOLD = 8;

export function App({ store }: { store: GameStore }) {
  useRevision(store);
  const state = useSim(store);
  const settings = useSettings(store);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>(fitCamera({ width: 360, height: 640 }));
  const audioRef = useRef<AudioApi | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: 0, lastX: 0, lastY: 0, pinch: 0 });

  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [buildBlueprint, setBuildBlueprint] = useState<string | null>(null);
  const [ghostTile, setGhostTile] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(true);

  const audio = useCallback((): AudioApi => {
    if (!audioRef.current) audioRef.current = createAudio(settings.muted);
    return audioRef.current;
  }, [settings.muted]);

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
    document.documentElement.style.setProperty("--text-scale", String(settings.textScale));
  }, [settings.textScale]);

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
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        cameraRef.current = fitCamera({ width: cssWidth, height: cssHeight });
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, store.getState(), cameraRef.current, { width: cssWidth, height: cssHeight }, {
        reducedMotion: settings.reducedMotion,
        buildMode: buildBlueprint !== null,
        ghostTile: buildBlueprint !== null ? ghostTile : null,
        ghostValid:
          ghostTile !== null &&
          ghostTile !== DOCK_TILE &&
          !store.getState().machines.some((m) => m.tile === ghostTile),
        selected,
      });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [store, settings.reducedMotion, buildBlueprint, ghostTile, selected]);

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
          label: "Take over",
          run: () => {
            if (store.takeOver() === "reader") {
              audio().play("blocked");
              setToast("Another tab is still writing");
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
            text={role === "reader" ? "Following the other tab" : objectiveFor(state, selected)}
            hint={
              role === "reader"
                ? "This tab mirrors the yard exactly as the first tab writes it."
                : hintFor(suggestedAction(state))
            }
          />
        </div>
        {toast ? <Toast text={toast} onDone={() => setToast(null)} /> : null}
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
        />
      </div>
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
      {report ? <ReturnReportPanel report={report} onClose={() => setReportOpen(false)} /> : null}
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
    return { label: "Salvage", run: () => dispatch({ id: nextCommandId(), type: "manual.salvage" }) };
  }
  if (step === 2) {
    return {
      label: "Repair drone",
      cost: `${TUNING.repairCostScrap} scrap`,
      run: () => dispatch({ id: nextCommandId(), type: "drone.repair" }),
    };
  }
  if (step <= 6) {
    if (state.machines.length === 0) {
      return {
        label: "Build sorter",
        cost: "20 scrap",
        run: () => {
          setBuildBlueprint("sorter");
          setGhostTile(8);
        },
      };
    }
    if (state.routes.length === 0) {
      return {
        label: "Connect dock to sorter",
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
        label: "Build furnace",
        cost: "10 scrap + 5 ferrous",
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
          label: "Connect sorter to furnace",
          run: () => {
            for (const plan of plans) {
              dispatch({ id: nextCommandId(), type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
            }
          },
        };
      }
    }
    return { label: "Salvage", run: () => dispatch({ id: nextCommandId(), type: "manual.salvage" }) };
  }
  if (step === 7) {
    return {
      label: "Sell steel",
      cost: "3 steel · 30 credits",
      run: () => dispatch({ id: nextCommandId(), type: "contract.export" }),
    };
  }
  // With an explicit selection the machine's own step leads; otherwise the dock
  // follows the same yard ladder as the objective card.
  if (selected !== null && selected > 0) {
    const step = stepForMachine(state, selected);
    if (step) {
      return {
        ...primaryFor(state, step),
        run: () => runStep(state, step, dispatch, setBuildBlueprint, setGhostTile),
      };
    }
  }
  const next = nextYardStep(state);
  return { ...primaryFor(state, next), run: () => runStep(state, next, dispatch, setBuildBlueprint, setGhostTile) };
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

function cueFor(type: Command["type"]): CueName {
  switch (type) {
    case "manual.salvage":
      return "salvage";
    case "drone.repair":
      return "repair";
    case "machine.upgrade":
      return "upgrade";
    case "contract.export":
      return "return";
    default:
      return "collect";
  }
}

export function labelForReject(reason: CommandReject): string {
  switch (reason) {
    case "insufficient":
      return "Not enough material";
    case "blocked-placement":
      return "Tile blocked";
    case "no-room":
      return "Store full";
    case "cooldown":
      return "Cutting pulse recharging";
    case "duplicate":
      return "Already connected";
    case "cycle":
      return "That would loop back";
    case "already-claimed":
      return "Contract already sold";
    case "locked":
      return "Sell opens after your first steel contract";
    case "read-only":
      return "Another tab is writing this yard";
    default:
      return "No longer available";
  }
}
