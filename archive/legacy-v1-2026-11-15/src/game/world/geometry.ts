/**
 * Integer geometry for the world grid (issue #133).
 *
 * Conventions (binding, architecture README section 6):
 *  - 1 cell = 1 u = MU_PER_UNIT integer milli-units; no floats in state.
 *  - Grid +x = world +X, grid +y = world +Z; right-handed Y-up.
 *  - Positive yaw takes +Z toward +X. Local (x, z) at rotation r:
 *      0: ( x,  z)   90: ( z, -x)   180: (-x, -z)   270: (-z,  x)
 *  - Every asset's front faces +Z at rotation 0, so frontage rotates
 *      0: +Z   90: +X   180: -Z   270: -X.
 *  - Rectangles are half-open [min, max); a keep-out disc touching a rect
 *    counts as a conflict (conservative clearance).
 */
import {
  entranceDepthMu,
  socketClearanceWidth,
  type KitAsset,
  type KitSocket,
} from "./kit";
import { MU_PER_UNIT, type Cell, type Rotation } from "./types";

export function isRotation(v: unknown): v is Rotation {
  return v === 0 || v === 90 || v === 180 || v === 270;
}

/** Rotated footprint [width, depth] in cells. */
export function rotatedSize(
  footprint: readonly [number, number],
  rotation: Rotation,
): [number, number] {
  const [w, d] = footprint;
  return rotation === 90 || rotation === 270 ? [d, w] : [w, d];
}

/** Negation that normalizes -0 to +0: signed zero must never enter state. */
function neg(n: number): number {
  return n === 0 ? 0 : -n;
}

/** Rotate a local mu offset about the footprint center. */
export function rotateLocalMu(x: number, z: number, rotation: Rotation): [number, number] {
  switch (rotation) {
    case 0:
      return [x, z];
    case 90:
      return [z, neg(x)];
    case 180:
      return [neg(x), neg(z)];
    case 270:
      return [neg(z), x];
  }
}

/** Unit frontage direction in grid coordinates for each yaw. */
export function frontageDir(rotation: Rotation): Cell {
  switch (rotation) {
    case 0:
      return { x: 0, y: 1 };
    case 90:
      return { x: 1, y: 0 };
    case 180:
      return { x: 0, y: -1 };
    case 270:
      return { x: -1, y: 0 };
  }
}

/**
 * Occupancy cell set of a placement: row-major (y outer, x inner), exactly
 * width * depth cells. Deterministic order is part of the rejection payloads.
 */
export function footprintCells(cell: Cell, footprint: readonly [number, number], rotation: Rotation): Cell[] {
  const [w, d] = rotatedSize(footprint, rotation);
  const cells: Cell[] = [];
  for (let dy = 0; dy < d; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      cells.push({ x: cell.x + dx, y: cell.y + dy });
    }
  }
  return cells;
}

/** Footprint center in world mu. */
export function centerMu(cell: Cell, footprint: readonly [number, number], rotation: Rotation): [number, number] {
  const [w, d] = rotatedSize(footprint, rotation);
  return [
    (cell.x * 2 + w) * (MU_PER_UNIT / 2),
    (cell.y * 2 + d) * (MU_PER_UNIT / 2),
  ];
}

/** Socket position in world mu for a placement. */
export function socketWorldMu(
  asset: KitAsset,
  cell: Cell,
  rotation: Rotation,
  socket: KitSocket,
): [number, number] {
  const [cx, cz] = centerMu(cell, asset.footprint, rotation);
  const [rx, rz] = rotateLocalMu(socket.x, socket.z, rotation);
  return [cx + rx, cz + rz];
}

/** Integer axis-aligned rectangle in world mu, half-open [min, max). */
export interface RectMu {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export function cellRectMu(cell: Cell): RectMu {
  return {
    minX: cell.x * MU_PER_UNIT,
    minZ: cell.y * MU_PER_UNIT,
    maxX: (cell.x + 1) * MU_PER_UNIT,
    maxZ: (cell.y + 1) * MU_PER_UNIT,
  };
}

/**
 * Entrance clearance corridor for one socket: a rectangle extending outward
 * from the front face, centered on the socket's lateral position, with width
 * max(nominal, actual) + 2 * 0.15 u and kind-dependent depth. Rotating an
 * axis-aligned rect by a quarter turn stays axis-aligned, so we rotate the
 * two local corners and normalize. All arithmetic is integer mu.
 */
export function entranceCorridor(
  asset: KitAsset,
  cell: Cell,
  rotation: Rotation,
  socket: KitSocket,
): RectMu {
  const d = asset.footprint[1];
  const width = socketClearanceWidth(socket);
  const depth = entranceDepthMu(socket);
  const half = Math.floor(width / 2);
  const faceZ = d * (MU_PER_UNIT / 2);
  const a = rotateLocalMu(socket.x - half, faceZ, rotation);
  const b = rotateLocalMu(socket.x - half + width, faceZ + depth, rotation);
  const [cx, cz] = centerMu(cell, asset.footprint, rotation);
  return {
    minX: cx + Math.min(a[0], b[0]),
    minZ: cz + Math.min(a[1], b[1]),
    maxX: cx + Math.max(a[0], b[0]),
    maxZ: cz + Math.max(a[1], b[1]),
  };
}

/** Cells touched by a mu rect (cells whose interior intersects the rect). */
export function rectCellsMu(rect: RectMu): Cell[] {
  const x0 = Math.floor(rect.minX / MU_PER_UNIT);
  const x1 = Math.ceil(rect.maxX / MU_PER_UNIT) - 1;
  const z0 = Math.floor(rect.minZ / MU_PER_UNIT);
  const z1 = Math.ceil(rect.maxZ / MU_PER_UNIT) - 1;
  const cells: Cell[] = [];
  for (let y = z0; y <= z1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

export function rectsIntersect(a: RectMu, b: RectMu): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
}

/** Squared-distance circle test; touching (distance == r) is a conflict. */
export function rectIntersectsDisc(rect: RectMu, cx: number, cz: number, radiusMu: number): boolean {
  const dx = Math.max(rect.minX - cx, 0, cx - rect.maxX);
  const dz = Math.max(rect.minZ - cz, 0, cz - rect.maxZ);
  return dx * dx + dz * dz <= radiusMu * radiusMu;
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}