import { TUNING } from "../content/defs";
import { DOCK_TILE, YARD_COLS, YARD_ROWS } from "../simulation/commands";
import type { DroneState, MachineState, SimState } from "../simulation/types";

export const CELL = 32;
export const WORLD_W = YARD_COLS * CELL;
export const WORLD_H = YARD_ROWS * CELL + CELL;

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface ViewState {
  width: number;
  height: number;
}

const PALETTE = {
  night: "#0b1220",
  nightDeep: "#080d18",
  steel: "#38556b",
  steelLight: "#6f93ad",
  rust: "#c9713a",
  furnace: "#ffb765",
  cyan: "#5fd8e8",
  violet: "#8a7ad8",
  grid: "rgba(111,147,173,0.22)",
  select: "#f4f7fb",
} as const;

export function fitCamera(view: ViewState): Camera {
  const scale = Math.max(1.4, Math.min(4, view.width / (WORLD_W + 24)));
  return { x: WORLD_W / 2, y: WORLD_H / 2, scale };
}

export function tileToWorld(tile: number): { x: number; y: number } {
  const col = tile % YARD_COLS;
  const row = Math.floor(tile / YARD_COLS);
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function worldToTile(x: number, y: number): number | null {
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  if (col < 0 || col >= YARD_COLS || row < 0 || row >= YARD_ROWS) return null;
  return row * YARD_COLS + col;
}

export const WRECK_POSITION = { x: CELL * 2.5, y: WORLD_H - CELL * 0.55 };

export function screenToWorld(
  camera: Camera,
  view: ViewState,
  sx: number,
  sy: number
): { x: number; y: number } {
  return {
    x: (sx - view.width / 2) / camera.scale + camera.x,
    y: (sy - view.height / 2) / camera.scale + camera.y,
  };
}

export function worldToScreen(camera: Camera, view: ViewState, x: number, y: number) {
  return {
    x: (x - camera.x) * camera.scale + view.width / 2,
    y: (y - camera.y) * camera.scale + view.height / 2,
  };
}

export interface DrawOptions {
  reducedMotion: boolean;
  buildMode: boolean;
  ghostTile: number | null;
  ghostValid: boolean;
  selected: number | null;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  options: DrawOptions
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, view.width, view.height);
  drawBackdrop(ctx, camera, view);
  if (options.buildMode || camera.scale >= 1.5) drawGrid(ctx, camera, view);
  drawRoutes(ctx, state, camera, view);
  drawWreck(ctx, state, camera, view, options.selected === -1);
  drawDock(ctx, state, camera, view, options.selected === -2);
  for (const machine of state.machines) {
    drawMachine(ctx, machine, camera, view, options.selected === machine.id);
  }
  drawDrone(ctx, state, camera, view, options.reducedMotion);
  if (options.ghostTile !== null) drawGhost(ctx, camera, view, options.ghostTile, options.ghostValid);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, camera: Camera, view: ViewState): void {
  const origin = worldToScreen(camera, view, 0, 0);
  const w = WORLD_W * camera.scale;
  const h = WORLD_H * camera.scale;
  ctx.fillStyle = PALETTE.nightDeep;
  ctx.fillRect(origin.x, origin.y, w, h);
  // Yard floor panel distinguishes the buildable area from scenery.
  const floor = worldToScreen(camera, view, 0, 0);
  ctx.fillStyle = "rgba(24,40,58,0.85)";
  ctx.fillRect(floor.x, floor.y, WORLD_W * camera.scale, YARD_ROWS * CELL * camera.scale);
  ctx.fillStyle = "rgba(95,216,232,0.06)";
  for (let i = 0; i < 3; i += 1) {
    const puddle = worldToScreen(camera, view, 24 + i * 64, WORLD_H - 8 - i * 4);
    ctx.beginPath();
    ctx.ellipse(puddle.x, puddle.y, 16 * camera.scale, 4 * camera.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, view: ViewState): void {
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 0; col <= YARD_COLS; col += 1) {
    const a = worldToScreen(camera, view, col * CELL, 0);
    const b = worldToScreen(camera, view, col * CELL, YARD_ROWS * CELL);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  for (let row = 0; row <= YARD_ROWS; row += 1) {
    const a = worldToScreen(camera, view, 0, row * CELL);
    const b = worldToScreen(camera, view, YARD_COLS * CELL, row * CELL);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function drawWreck(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  selected: boolean
): void {
  const p = worldToScreen(camera, view, WRECK_POSITION.x, WRECK_POSITION.y);
  const s = camera.scale;
  const openness = 1 - state.wreck.remaining / TUNING.starterWreckPool;
  ctx.fillStyle = "#22384a";
  ctx.beginPath();
  ctx.moveTo(p.x - 22 * s, p.y + 10 * s);
  ctx.lineTo(p.x - 14 * s, p.y - 12 * s);
  ctx.lineTo(p.x + 6 * s, p.y - 16 * s);
  ctx.lineTo(p.x + 22 * s, p.y + 4 * s);
  ctx.lineTo(p.x + 16 * s, p.y + 12 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.rust;
  ctx.lineWidth = Math.max(1, s);
  ctx.stroke();
  ctx.fillStyle = PALETTE.rust;
  ctx.fillRect(p.x - 6 * s, p.y - 6 * s, 4 * s * (1 - openness), 3 * s);
  if (selected) outline(ctx, p.x, p.y, 26 * s, 18 * s);
}

function drawDock(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  selected: boolean
): void {
  const p = worldToScreen(camera, view, ...centerOf(DOCK_TILE));
  const s = camera.scale;
  ctx.fillStyle = PALETTE.steel;
  ctx.fillRect(p.x - 13 * s, p.y - 11 * s, 26 * s, 20 * s);
  ctx.fillStyle = PALETTE.steelLight;
  ctx.fillRect(p.x - 13 * s, p.y - 11 * s, 26 * s, 5 * s);
  ctx.fillStyle = PALETTE.nightDeep;
  ctx.fillRect(p.x - 8 * s, p.y - 3 * s, 16 * s, 9 * s);
  const fill = state.storeCapacity === 0 ? 0 : state.storeUnits / state.storeCapacity;
  ctx.fillStyle = PALETTE.furnace;
  ctx.fillRect(p.x - 8 * s, p.y + 6 * s - 9 * s * fill, 16 * s, 9 * s * fill);
  if (selected) outline(ctx, p.x, p.y, 16 * s, 14 * s);
}

function drawMachine(
  ctx: CanvasRenderingContext2D,
  machine: MachineState,
  camera: Camera,
  view: ViewState,
  selected: boolean
): void {
  const p = worldToScreen(camera, view, ...centerOf(machine.tile));
  const s = camera.scale;
  const working = machine.progress > 0;
  ctx.fillStyle = PALETTE.steel;
  ctx.fillRect(p.x - 12 * s, p.y - 12 * s, 24 * s, 24 * s);
  ctx.fillStyle = PALETTE.steelLight;
  ctx.fillRect(p.x - 12 * s, p.y - 12 * s, 24 * s, 6 * s);
  ctx.fillStyle = PALETTE.nightDeep;
  ctx.fillRect(p.x - 9 * s, p.y - 2 * s, 18 * s, 10 * s);
  const accent =
    machine.status === "starved"
      ? PALETTE.violet
      : machine.status === "outputFull"
        ? PALETTE.rust
        : working
          ? PALETTE.cyan
          : PALETTE.steelLight;
  ctx.fillStyle = accent;
  const fillRatio = machine.batchMilli === 0 ? 0 : Math.min(1, machine.progress / machine.batchMilli);
  ctx.fillRect(p.x - 9 * s, p.y + 8 * s - 10 * s * fillRatio, 18 * s, 10 * s * fillRatio);
  ctx.fillStyle = PALETTE.furnace;
  ctx.fillRect(p.x - 9 * s, p.y - 10 * s, 6 * s * (machine.level / 3 + 0.4), 2 * s);
  if (machine.trayUnits > 0) {
    ctx.fillStyle = PALETTE.furnace;
    ctx.fillRect(p.x + 6 * s, p.y - 14 * s, 5 * s, 5 * s);
  }
  // The signal lab reads as a mast at a glance, without a separate atlas.
  if (machine.blueprint === "signalLab") {
    ctx.fillStyle = PALETTE.cyan;
    ctx.fillRect(p.x - 1 * s, p.y - 18 * s, 2 * s, 6 * s);
    ctx.fillRect(p.x - 4 * s, p.y - 19 * s, 8 * s, 2 * s);
  }
  if (selected) outline(ctx, p.x, p.y, 14 * s, 14 * s);
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  view: ViewState,
  tile: number,
  valid: boolean
): void {
  const [x, y] = centerOf(tile);
  const p = worldToScreen(camera, view, x, y);
  const s = camera.scale;
  ctx.strokeStyle = valid ? PALETTE.cyan : PALETTE.rust;
  ctx.lineWidth = Math.max(1.5, s);
  ctx.strokeRect(p.x - 14 * s, p.y - 14 * s, 28 * s, 28 * s);
  ctx.fillStyle = valid ? PALETTE.cyan : PALETTE.rust;
  ctx.font = `${Math.round(9 * s)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(valid ? "\u2713" : "\u2715", p.x, p.y - 16 * s);
}

function drawRoutes(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState
): void {
  ctx.strokeStyle = "rgba(95,216,232,0.5)";
  ctx.lineWidth = 2;
  for (const route of state.routes) {
    const a = endpointPosition(route.from.kind === "store" ? DOCK_TILE : machineTile(state, route.from.id));
    const b = endpointPosition(route.to.kind === "store" ? DOCK_TILE : machineTile(state, route.to.id));
    const pa = worldToScreen(camera, view, a.x, a.y);
    const pb = worldToScreen(camera, view, b.x, b.y);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    for (const item of route.items) {
      const depart = item.arrive - route.latency;
      const t = route.latency === 0 ? 1 : Math.min(1, Math.max(0, (state.tick - depart) / route.latency));
      const x = pa.x + (pb.x - pa.x) * t;
      const y = pa.y + (pb.y - pa.y) * t;
      ctx.fillStyle = PALETTE.furnace;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
}

/**
 * Every working drone, each on its own leg of the same wreck↔dock route. Units are
 * spaced sideways so a two-drone fleet reads as two machines rather than one fat
 * sprite, and each interpolates on its own launch tick (spec 20.3).
 */
function drawDrone(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  reducedMotion: boolean
): void {
  if (!state.drone.repaired) {
    const p = worldToScreen(camera, view, ...centerOf(DOCK_TILE));
    ctx.fillStyle = PALETTE.steelLight;
    ctx.fillRect(p.x + 10 * camera.scale, p.y + 2 * camera.scale, 6 * camera.scale, 4 * camera.scale);
    return;
  }
  const dock = worldToScreen(camera, view, ...centerOf(DOCK_TILE));
  const wreck = worldToScreen(camera, view, WRECK_POSITION.x, WRECK_POSITION.y);
  const units: (DroneState | undefined)[] = [state.drone, ...state.spares];
  const spread = 5;
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    if (!unit || !unit.repaired) continue;
    let t = 0;
    if (unit.inFlight) {
      const depart = unit.inFlight.arrive - TUNING.droneTravelTicks;
      t = Math.min(1, Math.max(0, (state.tick - depart) / TUNING.droneTravelTicks));
    }
    if (reducedMotion) t = unit.inFlight ? 0.5 : 0;
    const lean = (i - (units.length - 1) / 2) * spread;
    const x = wreck.x + (dock.x - wreck.x) * t + lean;
    const y = wreck.y + (dock.y - wreck.y) * t - Math.sin(Math.PI * t) * 10 * camera.scale;
    const size = 4 * camera.scale;
    ctx.fillStyle = PALETTE.cyan;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x - size, y + size);
    ctx.closePath();
    ctx.fill();
  }
}

function outline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number
): void {
  ctx.strokeStyle = PALETTE.select;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x - rx, y - ry, rx * 2, ry * 2);
  ctx.stroke();
}

function centerOf(tile: number): [number, number] {
  const p = tileToWorld(tile);
  return [p.x, p.y];
}

function machineTile(state: SimState, id: number): number {
  for (const m of state.machines) if (m.id === id) return m.tile;
  return DOCK_TILE;
}

function endpointPosition(tile: number): { x: number; y: number } {
  return tileToWorld(tile);
}
