import { TUNING } from "../content/defs";
import { DOCK_TILE, YARD_COLS, YARD_ROWS } from "../simulation/commands";
import { beltExtentLine } from "../../ui/text";
import type { DroneState, Endpoint, MachineState, SimState } from "../simulation/types";
import {
  APRON_EDGE,
  APRON_PROPS,
  APRON_SHADOWS,
  APRON_TOPS,
  COLOR_KEYS,
  FLOOR_KIT,
  FLOOR_POSTS,
  GRAVEL,
  GRID_STYLE,
  LEAN_UNITS,
  PALETTE,
  PARTS,
  PATH_CORE,
  PUDDLES,
  SELECT_STYLE,
  SKY_FAR,
  SKY_NEAR,
  STATUS_ACCENTS,
  WRECK_HULL,
  WRECK_MAST,
  WRECK_RIBS,
  WRECK_SHARDS,
  WRECK_STREAKS,
  WRECK_VOIDS,
  type PaletteKey,
  type PartTuple,
} from "./sprites";
import { effectiveReducedMotion } from "./motion";

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

/**
 * L-1: the unobstructed vertical band the world has to live in, as measured edges of
 * the chrome painted over the canvas - `top` is the bottom edge of the top cluster and
 * `bottom` the distance from the viewport's lower edge to the top of the dock. Without
 * them the fit is the legacy width-only term, byte for byte.
 */
export interface CameraInsets {
  top: number;
  bottom: number;
}

/**
 * Floor of a band-fitted scale; the legacy unbanded floor is the original 1.4. E-3: the
 * ts2 landscape band works out at 1.1189, so the floor sits just under it - a floor above
 * the binding band term is what pushed the yard 3 px into the dock.
 */
const BAND_MIN_SCALE = 1.1;

/**
 * ART-001/ART-003 width term: `WORLD_W + 8` is the pad plus a 4-unit gutter on each side.
 * It was `+ 24` (a 12-unit gutter) at the base, which wasted 21 CSS px per side at 390 px and
 * held the plate at 404 of 844 px tall; at 8 the same fit prints 437 px (47.9 % -> 51.8 % of
 * the viewport height, gutters 21 -> 8 px). The arithmetic ceiling of the world itself is
 * 224/192 * 390 = 455 px (53.9 %), reached at a zero gutter, so a taller plate is not
 * obtainable from this term alone - stated in the handoff as the binding constraint.
 */
/**
 * A width-only fit cannot show a 224-unit-tall world in a 390 px-tall landscape
 * viewport, so the dock and the wreck left the screen (L-1). With a measured band the
 * world is fitted to whichever term binds and the band itself becomes the centre.
 *
 * ART-003 A3-4 (plate-still-floats): the band centre is used for **both** terms, not only
 * the binding one. At 390x844 the width term binds, so the old code returned the legacy
 * canvas-centred camera and the pad sat off the middle of the clear column the chrome
 * actually leaves. The scale expression keeps both original terms exactly, only the y
 * origin moves, so every footprint, ink box and the tap mapping (`screenToWorld` inverts
 * the same camera) keep their geometry.
 */
export function fitCamera(view: ViewState, insets?: CameraInsets): Camera {
  const raw = Math.min(4, view.width / (WORLD_W + 8)); // the un-floored width term (ART-003: 24 -> 8)
  const legacy = () => ({ x: WORLD_W / 2, y: WORLD_H / 2, scale: Math.max(1.4, raw) });
  const usableH = insets ? view.height - insets.top - insets.bottom : 0;
  if (!insets || usableH <= 0) return legacy();
  const bandScale = usableH / (WORLD_H + 12);
  // One scale expression for both branches, identical to the two original terms.
  const scale = bandScale >= raw ? Math.max(1.4, raw) : Math.max(BAND_MIN_SCALE, Math.min(raw, bandScale));
  // The band centre, not the canvas centre, is where the world's middle goes.
  const bandCentre = insets.top + usableH / 2;
  return { x: WORLD_W / 2, y: WORLD_H / 2 + (view.height / 2 - bandCentre) / scale, scale };
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

/**
 * UI-RESET-60: one upper-left facet for a solid part - a lit top band and left column in
 * the `select` group, a dark bottom band and right column in the `path` group. Every band
 * is inset inside the part's own box, so the union ink census and the silhouette masks are
 * unchanged (the part is already painted by `paintParts`); the whole machine row still
 * costs exactly two grouped paints. A 3-unit post keeps its full width on the lit band;
 * the side columns only exist on bodies with a middle band (>= 6 x 6) to lighten/darken.
 */
function facetPart(
  sheen: [number, number, number, number][],
  shade: [number, number, number, number][],
  px: number,
  py: number,
  s: number,
  part: PartTuple
): void {
  const [bx, by, bw, bh] = part;
  const inset = bw >= 6 ? 1 : 0;
  sheen.push([px + (bx + inset) * s, py + by * s, (bw - 2 * inset) * s, 2 * s]);
  shade.push([px + (bx + inset) * s, py + (by + bh - 2) * s, (bw - 2 * inset) * s, 2 * s]);
  if (bh >= 6 && bw >= 6) {
    sheen.push([px + bx * s, py + (by + 2) * s, 2 * s, (bh - 4) * s]);
    shade.push([px + (bx + bw - 2) * s, py + (by + 2) * s, 2 * s, (bh - 4) * s]);
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
  // UI-RESET-60: the caller's option OR the live OS preference, read once per frame inside
  // the renderer (no signature change, no new persisted setting). jsdom has no matchMedia,
  // so the unit tests keep the caller's option as the whole answer.
  const reducedMotion = effectiveReducedMotion(options.reducedMotion);
  // Layer 1: sky; layer 2: backdrop outside the panel; layer 3: solid floor (C-rule).
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, view.width, view.height);
  const origin = worldToScreen(camera, view, 0, 0);
  ctx.fillStyle = PALETTE.nightDeep;
  ctx.fillRect(snap(origin.x), snap(origin.y), snap(WORLD_W * s), snap(WORLD_H * s));
  ctx.fillStyle = PALETTE.floor;
  ctx.fillRect(snap(origin.x), snap(origin.y), snap(WORLD_W * s), snap(YARD_ROWS * CELL * s));
  // ART-001: the distant plane first, then the pad and its kit, then the foreground apron.
  drawBackdrop(ctx, camera, view, s);
  drawFloorKit(ctx, camera, view, s);
  drawForeground(ctx, camera, view, s);
  if (options.buildMode) drawGrid(ctx, camera, view);
  drawRoutes(ctx, state, camera, view, phase, options.selected);
  drawWreck(ctx, state, camera, view, options.selected === -1);
  drawDock(ctx, state, camera, view, options.selected === -2);
  const sheen: [number, number, number, number][] = [];
  const shade: [number, number, number, number][] = [];
  for (const machine of state.machines) {
    drawMachine(ctx, machine, camera, view, options.selected === machine.id, sheen, shade, reducedMotion, phase);
  }
  // Two grouped paths for the whole machine row: the bevel that gives every body the same
  // upper-left light, plus its underside. Existing hues, so no new paint group appears.
  // ART-004 D1: the lit band rides at full alpha, so the brightest tone in the frame is the
  // facet edge itself (the top luminance bucket) instead of a 0.9 blend one step below it.
  groupFill(ctx, sheen, "select", 1);
  groupFill(ctx, shade, "path");
  drawDrones(ctx, state, camera, view, reducedMotion, phase);
  if (options.ghostTile !== null) drawGhost(ctx, camera, view, options.ghostTile, options.ghostValid);
}

/** Paint one fixed world-coord table as one path per colour group (ART-001 depth planes). */
function paintTable(
  ctx: CanvasRenderingContext2D,
  table: readonly PartTuple[],
  ox: number,
  oy: number,
  s: number
): void {
  const byColor = new Map<number, [number, number, number, number][]>();
  for (const t of table) {
    const list = byColor.get(t[4]) ?? [];
    list.push([ox + t[0] * s, oy + t[1] * s, t[2] * s, t[3] * s]);
    byColor.set(t[4], list);
  }
  for (const [ci, boxes] of byColor) groupFill(ctx, boxes, COLOR_KEYS[ci]);
}

/** Far bank plus near roofline, in the night band above the perimeter rail. */
function drawBackdrop(ctx: CanvasRenderingContext2D, camera: Camera, view: ViewState, s: number): void {
  const o = worldToScreen(camera, view, 0, 0);
  paintTable(ctx, SKY_FAR, o.x, o.y, s);
  paintTable(ctx, SKY_NEAR, o.x, o.y, s);
}

/** Pad edge, kerb and the foreground props that set the near-plane scale. */
function drawForeground(ctx: CanvasRenderingContext2D, camera: Camera, view: ViewState, s: number): void {
  const o = worldToScreen(camera, view, 0, 0);
  paintTable(ctx, PATH_CORE, o.x, o.y, s);
  paintTable(ctx, APRON_EDGE, o.x, o.y, s);
  paintTable(ctx, APRON_SHADOWS, o.x, o.y, s);
  paintTable(ctx, APRON_PROPS, o.x, o.y, s);
  paintTable(ctx, APRON_TOPS, o.x, o.y, s);
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
  // ART-003 A3-4: one 2-unit tick per cell at alpha 0.28 - the resting dot field is a
  // measured ground texture now, one step under the floor ink, so the machines carry
  // the brightest pixels instead of the grid.
  groupFill(
    ctx,
    GRAVEL.map(([x, y]) => [ox.x + x * s, ox.y + y * s, 2 * s, 2 * s] as [number, number, number, number]),
    "bodyLight",
    0.28
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
  // W4/ART-003: the hulk sits on a contact shadow ellipse, one step under the floor,
  // the same 0.35 ellipse every other static footprint carries.
  ctx.fillStyle = PALETTE.shadow;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(snap(p.x), snap(p.y + 14 * s), snap(14 * s), snap(2 * s), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
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
  // W6: the hull reads as a hulk now - two empty ports, three ribs, a snapped mast and a
  // stub of rail on its near side. All four rows are one grouped path each.
  paintTable(ctx, WRECK_VOIDS, p.x, p.y, s);
  paintTable(ctx, WRECK_RIBS, p.x, p.y, s);
  paintTable(ctx, WRECK_MAST, p.x, p.y, s);
  paintTable(ctx, WRECK_STREAKS, p.x, p.y, s);
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
  selected: boolean,
  sheen: [number, number, number, number][],
  shade: [number, number, number, number][],
  reducedMotion: boolean,
  phase: number
): void {
  const c = tileToWorld(machine.tile);
  const p = worldToScreen(camera, view, c.x, c.y);
  const s = camera.scale;
  const row = PARTS[machine.blueprint] ?? PARTS.generic;
  // ART-004 g2: the part loop is the one path that paints a machine. The A-2 pilot atlas page
  // is dropped - the reviewer's own bench prices it at no measurable CPU gain (+616 B of
  // entry chunk for a 12-hour yard at 40.60 ms versus 41.36 ms on main), and its per-kind
  // scale/shift put different pixels on the live frame than the unit-resolution witnesses
  // read, so the phone census and the op-log table disagreed by construction.
  paintParts(ctx, p.x, p.y, s, row);
  // ART-001/ART-003 + UI-RESET-60: one light direction for the whole sheet - upper left
  // lit, lower right dark - now on EVERY solid block of the glyph (>= 4 x 4, not the ground
  // band or an ellipse), not just the largest body. The lit pair rides in the `select`
  // group, the dark pair in the `path` group: still two grouped paths for the whole row,
  // and every band is inset inside its part box so the union ink census is unchanged.
  for (const part of row) {
    if (part[5] === 1 || part[4] === 15 || part[2] < 4 || part[3] < 4) continue;
    facetPart(sheen, shade, p.x, p.y, s, part);
  }
  // S5/F5 status reading: one accent bar, plus the furnace rust band over the chimney.
  // ART-003 named motion states - anticipation and settle, not a uniform crawl. One
  // quantised 6-frame step drives each: frames 1-2 of the cycle move, the rest hold.
  // `working` = two-step amber core that swells one step per cycle; `starved` = the
  // visibly quiet core (one dim square, frozen); `output-blocked` = the accent bar
  // settling between its 6-unit and 4-unit widths. Reduced motion keeps step 0 only.
  const q = reducedMotion ? 0 : Math.min(5, Math.floor(phase * 6));
  const pulse = q === 2 || q === 3; // the single swell/settle frame pair of the cycle
  // ART-006: the accent bar is ONE paint with the computed width. The unconditional 6-unit
  // rect and the animated 4-unit rect used to be emitted separately in the same colour, so
  // the 4-unit draw sat entirely under the 6-unit one and the settle had zero visible
  // amplitude (measured rust rows: 11 px on all six quantised frames).
  const barW = machine.status === "outputFull" && pulse ? 4 : 6;
  rectOf(ctx, p.x - 9 * s, p.y + 10 * s, barW * s, 2 * s, statusColor(machine.status));
  if (machine.status === "powerLimited") {
    // D-3: the fifth hue alone is not separable at phone size, so `powerLimited` also
    // carries a shape mark - one short tick under the bar, in an existing colour index.
    rectOf(ctx, p.x - 9 * s, p.y + 13 * s, 6 * s, 2 * s, "select");
  }
  if (machine.blueprint === "furnace" && machine.status === "outputFull") {
    rectOf(ctx, p.x + 5 * s, p.y - 14 * s, 4 * s, 2 * s, "rust");
  }
  if (machine.status === "running") {
    // Two-step amber core: a 4-unit glow (5 on the swell frames) plus the 2-unit inner.
    const r = pulse ? 2.5 * s : 2 * s;
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.ellipse(snap(p.x), snap(p.y + 2 * s), snap(r), snap(r), 0, 0, Math.PI * 2);
    ctx.fill();
    rectOf(ctx, p.x - 1 * s, p.y + 1 * s, 2 * s, 2 * s, "amber");
  } else if (machine.status === "starved") {
    rectOf(ctx, p.x - 1 * s, p.y + 1 * s, 2 * s, 2 * s, "bodyMid"); // quiet core, no pulse
  }
  // ART-006: `outputFull` needs no second bar - the single `barW` paint above already
  // carries the settle, so the frame holds exactly one accent rect per machine.
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
    // L-4: the 6-unit digit sits on a baseline 9 units above the cell centre, so its
    // measured 4.25-unit ascent puts the glyph box at [2.75, 7.00] for a row-0 cell and
    // clears the 2-unit perimeter rail (at 12 units it was [-0.25, 4.00], 8 CSS px of
    // overlap at s = 4).
    ctx.fillText(String(machine.level), p.x - 2 * s, p.y - 9 * s);
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
  phase: number,
  selected: number | null
): void {
  const s = camera.scale;
  ctx.strokeStyle = "rgba(95,216,232,0.5)";
  ctx.lineWidth = 2;
  // The same small glyph size the level digit uses; a fractional px size is valid CSS.
  ctx.font = `${6 * s}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  for (const route of state.routes) {
    // BELT-001 g4: the drawn extent *is* the priced extent. `run` is the tile list the
    // connect tap charged `beltCost` from, so this orthogonal polyline is that number's
    // silhouette: a 3-tile link and a 7-tile link no longer share one chord. A pre-price
    // link carries no `run` and keeps the old single segment, vertex for vertex.
    const run = route.run;
    const pts =
      run !== undefined && run.length > 1 ?
        run.map(tileToWorld) :
        [endpointOf(state, route.from), endpointOf(state, route.to)];
    const path = pts.map((p) => worldToScreen(camera, view, p.x, p.y));
    const legs = path.length - 1;
    ctx.beginPath();
    path.forEach((p, i) => (i === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, snap(p.x), snap(p.y)));
    ctx.stroke();
    // g4: the price the extent stands for, on the world itself, for the machine the player
    // has open: one line, mid-path, from the same `beltCost` as the panel row.
    if (run !== undefined && (selected === route.from.id || selected === route.to.id)) {
      const at = pathAt(path, legs, 0.5);
      ctx.fillStyle = PALETTE.bodyLight;
      ctx.fillText(beltExtentLine(route), at.x, at.y - 4 * s);
    }
    for (const item of route.items) {
      // 3x3 amber token per in-transit item, snapped, scaled with the camera.
      // A9: the same sub-tick phase as the drone, over the 5-tick latency window. Only the
      // geometry it walks changed: the token covers the polyline leg by leg, so `t = 1` is
      // still the destination tile on `item.arrive` - the same tick, the same arrival.
      const t =
        route.latency === 0 ?
          1 :
          Math.min(1, Math.max(0, (state.tick + phase - (item.arrive - route.latency)) / route.latency));
      const at = pathAt(path, legs, t);
      rectOf(ctx, at.x - 1.5 * s, at.y - 1.5 * s, 3 * s, 3 * s, "amber");
    }
  }
}

/**
 * The point at fraction `t` along a route's polyline. Every `manhattanRun` step crosses
 * exactly one cell, so all legs share one length and `t` picks the leg directly; `t = 1`
 * lands on the last vertex exactly, which is what keeps the cargo's arrival tick intact.
 */
function pathAt(path: { x: number; y: number }[], legs: number, t: number) {
  const step = t * legs; // both callers pass `t` in [0, 1]
  const i = Math.floor(step);
  const a = path[i];
  const b = path[i + 1] ?? a;
  const f = step - i;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** The world centre of one endpoint: a machine's own tile, the dock for the store (id 0,
 * which no machine ever holds, so `machineTile` answers the dock for it). */
function endpointOf(state: SimState, endpoint: Endpoint): { x: number; y: number } {
  return tileToWorld(machineTile(state, endpoint.id));
}

/**
 * E-1: the drone's place on its own cycle as one continuous parameter. The loaded leg is
 * the in-flight record (wreck -> dock over `droneTravelTicks`); after the batch is counted
 * the unit holds at the dock for that tick and then runs the empty leg back, `t = 1 - u`,
 * finishing exactly at the next launch, so the position never teleports the whole leg.
 * The model's own spacing makes the last arrival recoverable without a new state field
 * (`nextDeliveryTick - arrive == droneDeliveryTicks - droneTravelTicks`), so the save
 * format and the checksum inputs are untouched.
 */
export function droneLeg(unit: DroneState, tick: number, phase: number): number {
  const travel = TUNING.droneTravelTicks;
  const cycle = TUNING.droneDeliveryTicks - travel; // 40 ticks of empty leg + hold
  const now = tick + phase;
  if (unit.inFlight) {
    // A1: position is a function of (arrive, framePhase), not of `state.tick` alone.
    // The launch is recorded on the tick *before* the first frame that shows it and the
    // cargo is counted on the tick *after* the last one, so the drawn frames of the leg
    // are `arrive - travel + 1 .. arrive + 1`; that window is the parameter's 0..1.
    // A9: the same sub-tick phase as the drone, over the 5-tick latency window.
    const since = now - (unit.inFlight.arrive - travel + 1);
    // Inside the recorded window the parameter is the accepted linear leg, unchanged.
    if (since <= travel) return Math.min(1, Math.max(0, since / travel));
    // DEF-004/DEF-005: an in-flight record whose `arrive` is stale (a caught-up save keeps it
    // while the tick has run far ahead) used to clamp at exactly 1 forever. The wrap runs the
    // loaded leg, one tick of dock hold, the empty leg and one tick of wreck hold, so the
    // value is continuous through the seam instead of snapping the whole leg in one frame.
    const period = 2 * travel + 2; // 10 + 1 + 10 + 1
    const within = since % period;
    if (within <= travel) return within / travel;
    if (within <= travel + 1) return 1; // the dock dwell, cargo being counted
    if (within <= 2 * travel + 1) return 1 - (within - (travel + 1)) / travel;
    return 0; // the wreck dwell before the next launch
  }
  if (!(unit.deliveries > 0) || !(unit.nextDeliveryTick > 0)) return 0; // never launched
  // The empty leg starts on the frame right after the cargo is counted and runs out
  // exactly on the frame the next launch shows, so no seam between the two branches.
  const lastArrive = unit.nextDeliveryTick - cycle;
  // DEF-004: the leg wraps on its own `cycle` instead of clamping, so a unit whose recorded
  // anchor is stale relative to `now` (the store sat at its cap, so no further launch was
  // recorded) keeps cycling rather than holding one lattice position forever. Inside the
  // first window the modulo is the identity, so the accepted frames are unchanged: at
  // `now = lastArrive + 1` this and the loaded leg both give 1.
  const sinceLast = now - (lastArrive + 1);
  if (sinceLast <= cycle) return 1 - Math.min(1, Math.max(0, sinceLast / cycle));
  // DEF-005: same eased shape as the loaded leg - out over `cycle`, back over `cycle`, so the
  // value stays continuous at every joint and one frame never moves the whole leg.
  const back = sinceLast % (2 * cycle);
  return back <= cycle ? 1 - back / cycle : (back - cycle) / cycle;
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
    // E-1: one continuous segment parameter over the whole delivery cycle, so a leg
    // boundary is a step of one frame's worth rather than the whole 343.5 px leg.
    const leg = droneLeg(unit, state.tick, phase);
    // A7: reduced motion keeps the two documented steps, no interpolation at all.
    const t = reducedMotion ? (unit.inFlight ? 0.5 : 0) : leg;
    const lean = (i - (units.length - 1) / 2) * LEAN_UNITS * s;
    const carrying = (unit.inFlight?.qty ?? 0) > 0; // DR3 amber when loaded
    const x = wreck.x + (dock.x - wreck.x) * t + lean;
    // ART-001: a loaded unit rides two units lower through the middle of its leg, so the
    // cargo leg reads heavier than the empty one. Continuous in the leg parameter, so a
    // frame step at the leg seam stays one frame's worth; off under reduced motion.
    const heavy = !reducedMotion && carrying ? Math.sin(Math.PI * t) * 2 * s : 0;
    const y = wreck.y + (dock.y - wreck.y) * t - Math.sin(Math.PI * t) * 10 * s + heavy;
    // DR5 shadow ellipse, alpha 0.35.
    ctx.fillStyle = PALETTE.shadow;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(snap(x), snap(y + 4 * s), snap(5 * s), snap(2 * s), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    paintParts(ctx, x, y, s, PARTS.drone);
    // D-2: the pod hangs below the body envelope (mask rows 3-5) so the two glyphs are
    // separable: 3-unit box on the left half of the body, one mask cell at row 6.
    rectOf(ctx, x - 3 * s, y + 8 * s, 3 * s, 3 * s, carrying ? "amber" : "bodyMid");
    const noseRight = reducedMotion ? t <= 0.5 : leg - droneLeg(unit, state.tick, phase - 1 / 6) >= 0; // F-1
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
 * The silhouette sheet (E8/B1-B2): every role that owns a `PARTS` row, the phone
 * scale on one line and the desktop scale wrapped over two, desaturated to the gray
 * steps of the same palette. The layout is derived from the view box so the ink
 * reaches all four edges (G-2: the shipped PNG used to fill only a quarter of it).
 */
/**
 * The silhouette sheet's layout and gray ramp, as one exported table (ART-004 g2) so the
 * census instrument reads the same numbers the painter uses instead of mirroring them by
 * hand: `left`/`top`/`bottom` are the outermost ink of a glyph box in world units, `margin`
 * the sheet's own margin in CSS px, `phone`/`desktop` the two band scales. `gray` is the
 * five-step ramp index of a colour index (B2/D-1 instrument).
 */
export const SHEET_LAYOUT = { left: 15, top: 16, bottom: 15, margin: 2, phone: 1.8056, desktop: 4 } as const;

/** Gray-ramp step of a colour index: 0..4, the same five steps the sheet paints. */
export const grayStepOf = (index: number): number => Math.min(4, Math.floor(index / 4));

export function drawSpriteSheet(ctx: CanvasRenderingContext2D, view: ViewState): void {
  const ids = Object.keys(PARTS);
  const grays: PaletteKey[] = ["shadow", "well", "floor", "wreck", "select"];
  // Gray step by colour index (dark table entries -> light accents), no CSS filter.
  const gray = (i: number): PaletteKey => grays[grayStepOf(i)];
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, view.width, view.height);
  // Outermost ink of the whole table, in units from the glyph centre.
  const { left: LEFT, top: TOP, bottom: BOTTOM, margin: MARGIN } = SHEET_LAYOUT;
  const bands = [
    { scale: SHEET_LAYOUT.phone, from: 0, to: ids.length },
    { scale: SHEET_LAYOUT.desktop, from: 0, to: Math.ceil(ids.length / 2) },
    { scale: SHEET_LAYOUT.desktop, from: Math.ceil(ids.length / 2), to: ids.length },
  ];
  const heights = bands.map((b) => (TOP + BOTTOM) * b.scale);
  const gap = (view.height - 2 * MARGIN - heights.reduce((a, b) => a + b, 0)) / (bands.length - 1);
  let top = MARGIN;
  for (let r = 0; r < bands.length; r += 1) {
    const s = bands[r].scale;
    const count = bands[r].to - bands[r].from;
    const pitch = count > 1 ? (view.width - 2 * MARGIN - 2 * LEFT * s) / (count - 1) : 0;
    const cy = top + TOP * s;
    for (let i = bands[r].from; i < bands[r].to; i += 1) {
      const cx = MARGIN + LEFT * s + (i - bands[r].from) * pitch;
      paintParts(ctx, cx, cy, s, PARTS[ids[i]], gray);
    }
    top += heights[r] + gap;
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
