/*
 * RW3D T07 (#134): the yard grid constants and tile mapping, shared by the 2D
 * information overlay (scene.ts), the camera math (camera.ts) and the three.js
 * world renderer (three/). Kept in its own module so the THREE layer can import
 * the geometry without importing scene.ts (which would pull the UI logistics
 * bridge across the renderer boundary and form an import cycle).
 *
 * These values are unchanged from the legacy renderer: CELL is 32 world units,
 * the yard is YARD_COLS x YARD_ROWS cells, and the world rectangle adds one extra
 * cell of height for the wreck apron. The save format and simulation are untouched.
 */
import { DOCK_TILE, YARD_COLS, YARD_ROWS } from "../simulation/commands";

export const CELL = 32;
export const WORLD_W = YARD_COLS * CELL;
export const WORLD_H = YARD_ROWS * CELL + CELL;

/** The wreck hulk's ground anchor, in world units (unchanged legacy position). */
export const WRECK_POSITION = { x: CELL * 2.5, y: WORLD_H - CELL * 0.55 };

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

export { DOCK_TILE, YARD_COLS, YARD_ROWS };