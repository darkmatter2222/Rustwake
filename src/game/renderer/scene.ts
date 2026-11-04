import { TUNING } from "../content/defs";
import { DOCK_TILE, YARD_COLS, YARD_ROWS } from "../simulation/commands";
import type { DroneState, MachineState, SimState } from "../simulation/types";
import {
  COLOR_KEYS,
  FLOOR_KIT,
  FLOOR_POSTS,
  GRAVEL,
  GRID_STYLE,
  LEAN_UNITS,
  PALETTE,
  PARTS,
  PUDDLES,
  SELECT_STYLE,
  STATUS_ACCENTS,
  WRECK_HULL,
  WRECK_SHARDS,
  type PaletteKey,
  type PartTuple,
} from "./sprites";

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
  /**
   * Q-004 C-1/A1: the sub-tick phase in [0, 1) supplied by the caller (`store.getFramePhase()`),
   * so a moving unit interpolates between its tick-start and tick-end position instead of
   * stepping once per tick. Absent it the draw is the tick-start frame, phase 0.
   */
  framePhase?: number;
}

/** The caller's phase, clamped to the one-tick window; no clock is read here (A10). */
function subTickPhase(phase: number | undefined): number {
  return typeof phase === "number" && Number.isFinite(phase) ? Math.min(1, Math.max(0, phase)) : 0;
}

/** Half-CSS-px grid = one device pixel at dpr 2 (D6). */
const snap = (v: number): number => Math.round(v * 2) / 2;

/** Either a palette key or one of the literal accent hexes the status table carries. */
function hexOf(color: PaletteKey | string): string {
  return color.startsWith("#") ? color : PALETTE[color as PaletteKey];
}

function rectOf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: PaletteKey | string
): void {
  ctx.fillStyle = hexOf(color);
  ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
}

/** One path fill for a same-colour group: N rects cost one paint op (D3 caps). */
function groupFill(
  ctx: CanvasRenderingContext2D,
  rects: readonly [number, number, number, number][],
  color: PaletteKey,
  alpha = 1
): void {
  if (rects.length === 0) return;
  ctx.fillStyle = PALETTE[color];
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (const [x, y, w, h] of rects) ctx.rect(snap(x), snap(y), snap(w), snap(h));
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Paint a PARTS row from tuples; the 6th slot marks an ellipse (the drone shadow). */
function paintParts(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  parts: readonly PartTuple[],
  gray?: (index: number) => PaletteKey
): void {
  for (const t of parts) {
    const key = gray ? gray(t[4]) : COLOR_KEYS[t[4]];
    if (t[5] === 1) {
      ctx.fillStyle = PALETTE[key];
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(snap(cx + (t[0] + t[2] / 2) * s), snap(cy + (t[1] + t[3] / 2) * s),
        snap((t[2] / 2) * s), snap((t[3] / 2) * s), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      rectOf(ctx, cx + t[0] * s, cy + t[1] * s, t[2] * s, t[3] * s, key);
    }
  }
}

/** Quantised pip row, never a continuous ratio bar (B5). */
function pipRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  filled: number,
  total: number,
  color: PaletteKey,
  empty?: PaletteKey
): void {
  const filledRects: [number, number, number, number][] = [];
  const emptyRects: [number, number, number, number][] = [];
  for (let i = 0; i < total; i += 1) {
    const box: [number, number, number, number] = [x + i * 3 * s, y, 2 * s, 2 * s];
    (i < filled ? filledRects : emptyRects).push(box);
  }
  groupFill(ctx, emptyRects, empty ?? "well");
  groupFill(ctx, filledRects, color);
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  options: DrawOptions
): void {
  ctx.imageSmoothingEnabled = false;
  const s = camera.scale;
  // A1: one phase for the whole frame, shared by every moving group (Q-004 C-1).
  const phase = subTickPhase(options.framePhase);
  // Layer 1: sky; layer 2: backdrop outside the panel; layer 3: solid floor (C-rule).
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, view.width, view.height);
  const origin = worldToScreen(camera, view, 0, 0);
  ctx.fillStyle = PALETTE.nightDeep;
  ctx.fillRect(snap(origin.x), snap(origin.y), snap(WORLD_W * s), snap(WORLD_H * s));
  ctx.fillStyle = PALETTE.floor;
  ctx.fillRect(snap(origin.x), snap(origin.y), snap(WORLD_W * s), snap(YARD_ROWS * CELL * s));
  drawFloorKit(ctx, camera, view, s);
  if (options.buildMode) drawGrid(ctx, camera, view);
  drawRoutes(ctx, state, camera, view, phase);
  drawWreck(ctx, state, camera, view, options.selected === -1);
  drawDock(ctx, state, camera, view, options.selected === -2);
  for (const machine of state.machines) {
    drawMachine(ctx, machine, camera, view, options.selected === machine.id);
  }
  drawDrones(ctx, state, camera, view, options.reducedMotion, phase);
  if (options.ghostTile !== null) drawGhost(ctx, camera, view, options.ghostTile, options.ghostValid);
}

function drawFloorKit(ctx: CanvasRenderingContext2D, camera: Camera, view: ViewState, s: number): void {
  const ox = worldToScreen(camera, view, 0, 0);
  const byColor = new Map<number, [number, number, number, number][]>();
  for (const t of FLOOR_KIT) {
    const list = byColor.get(t[4]) ?? [];
    list.push([ox.x + t[0] * s, ox.y + t[1] * s, t[2] * s, t[3] * s]);
    byColor.set(t[4], list);
  }
  for (const [ci, boxes] of byColor) groupFill(ctx, boxes, COLOR_KEYS[ci]);
  groupFill(
    ctx,
    FLOOR_POSTS.map(([x, y]) => [ox.x + x * s, ox.y + y * s, 2 * s, 3 * s] as [number, number, number, number]),
    "shadow"
  );
  // FK3 puddles: one alpha path of three ellipses.
  ctx.fillStyle = PALETTE.puddle;
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  for (const [px, py] of PUDDLES) {
    ctx.ellipse(snap(ox.x + px * s), snap(ox.y + py * s), snap(10 * s), snap(3 * s), 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
  groupFill(
    ctx,
    GRAVEL.map(([x, y]) => [ox.x + x * s, ox.y + y * s, 3 * s, 3 * s] as [number, number, number, number]),
    "bodyLight",
    0.5
  );
}

/** Context-only grid: exactly one path, (COLS+1)+(ROWS+1) segments (A1/A2). */
function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, view: ViewState): void {
  ctx.strokeStyle = GRID_STYLE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 0; col <= YARD_COLS; col += 1) {
    const a = worldToScreen(camera, view, col * CELL, 0);
    const b = worldToScreen(camera, view, col * CELL, YARD_ROWS * CELL);
    ctx.moveTo(snap(a.x), snap(a.y));
    ctx.lineTo(snap(b.x), snap(b.y));
  }
  for (let row = 0; row <= YARD_ROWS; row += 1) {
    const a = worldToScreen(camera, view, 0, row * CELL);
    const b = worldToScreen(camera, view, YARD_COLS * CELL, row * CELL);
    ctx.moveTo(snap(a.x), snap(a.y));
    ctx.lineTo(snap(b.x), snap(b.y));
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
  rectOf(ctx, p.x - 12 * s, p.y + 13 * s, 24 * s, 2 * s, "well"); // W4 shadow
  ctx.fillStyle = PALETTE.wreck;
  ctx.beginPath(); // W1 pentagon hull
  WRECK_HULL.forEach(([dx, dy], i) => {
    const x = snap(p.x + dx * s);
    const y = snap(p.y + dy * s);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = PALETTE.rust; // W2 1-unit outline
  ctx.lineWidth = Math.max(1, snap(1 * s));
  ctx.stroke();
  // W3 remaining band as three 2x2 pips, quantised by the remaining ratio (B5).
  const ratio = state.wreck.remaining / (TUNING.starterWreckPool || 1);
  pipRow(ctx, p.x - 3 * s, p.y - 1 * s, s, Math.min(3, Math.ceil(ratio * 3)), 3, "amber");
  groupFill(
    ctx,
    WRECK_SHARDS.map(([sx, sy]) => [p.x + sx * s, p.y + sy * s, 3 * s, 3 * s] as [number, number, number, number]),
    "rust"
  );
  if (selected) outline(ctx, p.x, p.y, snap(24 * s), snap(16 * s));
}

function drawDock(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  selected: boolean
): void {
  const c = tileToWorld(DOCK_TILE);
  const p = worldToScreen(camera, view, c.x, c.y);
  const s = camera.scale;
  paintParts(ctx, p.x, p.y, s, PARTS.dock);
  const ratio = state.storeCapacity === 0 ? 0 : state.storeUnits / state.storeCapacity;
  pipRow(ctx, p.x - 7 * s, p.y + 4 * s, s, Math.min(5, Math.ceil(ratio * 5)), 5, "amber"); // D4
  if (selected) outline(ctx, p.x, p.y, snap(16 * s), snap(14 * s));
}

function drawMachine(
  ctx: CanvasRenderingContext2D,
  machine: MachineState,
  camera: Camera,
  view: ViewState,
  selected: boolean
): void {
  const c = tileToWorld(machine.tile);
  const p = worldToScreen(camera, view, c.x, c.y);
  const s = camera.scale;
  const row = PARTS[machine.blueprint] ?? PARTS.generic;
  paintParts(ctx, p.x, p.y, s, row);
  // S5/F5 status reading: one accent bar, plus the furnace rust band over the chimney.
  rectOf(ctx, p.x - 9 * s, p.y + 10 * s, 6 * s, 2 * s, statusColor(machine.status));
  if (machine.blueprint === "furnace" && machine.status === "outputFull") {
    rectOf(ctx, p.x + 5 * s, p.y - 14 * s, 4 * s, 2 * s, "rust");
  }
  if (machine.blueprint === "furnace" && machine.status === "running") {
    // F4 amber glow circle, diameter 4, only while running.
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.ellipse(snap(p.x + 0 * s), snap(p.y + 2 * s), snap(2 * s), snap(2 * s), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // S6 level pips: three 2x2 marks, digit from level 4 up (B5, never a ratio bar).
  groupFill(
    ctx,
    Array.from({ length: Math.min(3, machine.level) }, (_, i) => [
      p.x - 11 * s + i * 3 * s, p.y - 14 * s, 2 * s, 2 * s,
    ] as [number, number, number, number]),
    "bodyLight"
  );
  if (machine.level > 3) {
    ctx.fillStyle = PALETTE.bodyLight;
    ctx.font = `${Math.round(6 * s)}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(String(machine.level), p.x - 2 * s, p.y - 12 * s);
  }
  if (machine.trayUnits > 0) {
    rectOf(ctx, p.x + 8 * s, p.y - 13 * s, 3 * s, 3 * s, "amber"); // S4 tray token
  }
  // Progress as one quantised pip row (B5): 1-5 filled, never k x ratio.
  const ratio = machine.batchMilli === 0 ? 0 : Math.min(1, machine.progress / machine.batchMilli);
  pipRow(ctx, p.x - 9 * s, p.y + 13 * s, s, ratio > 0 ? Math.max(1, Math.ceil(ratio * 5)) : 0, 5, "cyan");
  if (selected) outline(ctx, p.x, p.y, snap(16 * s), snap(16 * s));
}

/**
 * B2: the drawn accent is the one table value the panel prints, with no palette round
 * trip, so `#7fd6c2` for a power-limited machine really does reach the canvas.
 */
function statusColor(status: MachineState["status"]): string {
  return STATUS_ACCENTS[status];
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  view: ViewState,
  tile: number,
  valid: boolean
): void {
  const c = tileToWorld(tile);
  const p = worldToScreen(camera, view, c.x, c.y);
  const s = camera.scale;
  const key: PaletteKey = valid ? "cyan" : "rust";
  ctx.strokeStyle = PALETTE[key];
  ctx.lineWidth = Math.max(1.5, snap(1.5 * s));
  ctx.strokeRect(snap(p.x - 14 * s), snap(p.y - 14 * s), snap(28 * s), snap(28 * s));
  ctx.fillStyle = PALETTE[key];
  ctx.font = `${Math.round(9 * s)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(valid ? "\u2713" : "\u2715", snap(p.x), snap(p.y - 16 * s));
}

function drawRoutes(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  phase: number
): void {
  const s = camera.scale;
  ctx.strokeStyle = "rgba(95,216,232,0.5)";
  ctx.lineWidth = 2;
  for (const route of state.routes) {
    const a = endpointPosition(route.from.kind === "store" ? DOCK_TILE : machineTile(state, route.from.id));
    const b = endpointPosition(route.to.kind === "store" ? DOCK_TILE : machineTile(state, route.to.id));
    const pa = worldToScreen(camera, view, a.x, a.y);
    const pb = worldToScreen(camera, view, b.x, b.y);
    ctx.beginPath();
    ctx.moveTo(snap(pa.x), snap(pa.y));
    ctx.lineTo(snap(pb.x), snap(pb.y));
    ctx.stroke();
    for (const item of route.items) {
      // 3x3 amber token per in-transit item, snapped, scaled with the camera.
      // A9: the same sub-tick phase as the drone, over the 5-tick latency window.
      const depart = item.arrive - route.latency;
      const t =
        route.latency === 0 ?
          1 :
          Math.min(1, Math.max(0, (state.tick + phase - depart) / route.latency));
      const x = pa.x + (pb.x - pa.x) * t;
      const y = pa.y + (pb.y - pa.y) * t;
      rectOf(ctx, x - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s, "amber");
    }
  }
}

/**
 * Every working drone: shadow, rotors (one group), body, cargo pod and a `select`
 * nose on the heading side; units keep a 4-unit lateral lean under reduced motion
 * so five units read as five (B7).
 */
function drawDrones(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  view: ViewState,
  reducedMotion: boolean,
  phase: number
): void {
  const s = camera.scale;
  if (!state.drone.repaired) {
    const c = tileToWorld(DOCK_TILE);
    const p = worldToScreen(camera, view, c.x, c.y);
    paintParts(ctx, p.x + 12 * s, p.y + 2 * s, s, PARTS.drone);
    return;
  }
  const dock = worldToScreen(camera, view, ...centerOf(DOCK_TILE));
  const wreck = worldToScreen(camera, view, WRECK_POSITION.x, WRECK_POSITION.y);
  const units: (DroneState | undefined)[] = [state.drone, ...state.spares];
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    if (!unit || !unit.repaired) continue;
    let t = 0;
    if (unit.inFlight) {
      // A1: position is a function of (arrive, framePhase), not of `state.tick` alone.
      const depart = unit.inFlight.arrive - TUNING.droneTravelTicks;
      t = Math.min(1, Math.max(0, (state.tick + phase - depart) / TUNING.droneTravelTicks));
    }
    // A7: reduced motion keeps the two documented steps, no interpolation at all.
    if (reducedMotion) t = unit.inFlight ? 0.5 : 0;
    const lean = (i - (units.length - 1) / 2) * LEAN_UNITS * s;
    const x = wreck.x + (dock.x - wreck.x) * t + lean;
    const y = wreck.y + (dock.y - wreck.y) * t - Math.sin(Math.PI * t) * 10 * s;
    // DR5 shadow ellipse, alpha 0.35.
    ctx.fillStyle = PALETTE.shadow;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(snap(x), snap(y + 4 * s), snap(5 * s), snap(2 * s), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    paintParts(ctx, x, y, s, PARTS.drone);
    const carrying = (unit.inFlight?.qty ?? 0) > 0; // DR3 amber when loaded
    rectOf(ctx, x - 1.5 * s, y + 1.5 * s, 3 * s, 3 * s, carrying ? "amber" : "bodyMid");
    const noseRight = t <= 0.5; // DR4 nose at the heading end
    rectOf(ctx, noseRight ? x + 3 * s : x - 5 * s, y - 1 * s, 2 * s, 2 * s, "select");
  }
}

function outline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number
): void {
  ctx.strokeStyle = SELECT_STYLE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x - rx, y - ry, rx * 2, ry * 2);
  ctx.stroke();
}

/**
 * The silhouette sheet (E8/B1-B2): six roles plus the drone, two rows at the
 * phone and desktop scales, desaturated to the gray steps of the same palette.
 */
export function drawSpriteSheet(ctx: CanvasRenderingContext2D, view: ViewState): void {
  const ids = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"] as const;
  const grays: PaletteKey[] = ["shadow", "well", "floor", "wreck", "select"];
  // Gray step by colour index (dark table entries -> light accents), no CSS filter.
  const gray = (i: number): PaletteKey => grays[Math.min(4, Math.floor(i / 4))];
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, view.width, view.height);
  const scales = [1.8056, 4];
  for (let r = 0; r < scales.length; r += 1) {
    const s = scales[r];
    for (let i = 0; i < ids.length; i += 1) {
      const cx = 24 + i * 40 * (r === 1 ? 1.6 : 1);
      const cy = r === 0 ? 30 : 90;
      paintParts(ctx, cx, cy, s, PARTS[ids[i]], gray);
    }
  }
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
