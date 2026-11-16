// @vitest-environment node
/**
 * #242: first-run yard dressing invariants. Numerical observation of the live
 * three.js graph — no WebGL context needed, no pixels judged (non-vision agent).
 *
 * Pins the contracts the presentation change must never break:
 *  - deterministic layout (fixed seed, no clock, identical on every build);
 *  - the 6x6 placeable grid stays clear: anything tall enough to collide with a
 *    machine body sits OUTSIDE the placeable rectangle; in-yard dressing is
 *    ankle/corner-height only and never touches the dock tile or the drone arc;
 *  - dressing is never pickable (tutorial wreck/dock raycast path untouched);
 *  - instancing discipline: one batch per tone, all sharing the caller's unit box;
 *  - the tutorial wreck keeps a clear highlight radius.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createSurroundTerrain,
  createYardDressing,
  mottleGroundGeometry,
} from "../../src/game/renderer/three/yardDressing";
import { CELL, WORLD_H, WORLD_W, WRECK_POSITION, YARD_COLS, YARD_ROWS } from "../../src/game/renderer/grid";
import { DOCK_TILE } from "../../src/game/simulation/commands";

const unitBox = new THREE.BoxGeometry(1, 1, 1);

interface Observed {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  tone: string;
}

function observe(): Observed[] {
  const dressing = createYardDressing(unitBox);
  const out: Observed[] = [];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  dressing.group.traverse((obj) => {
    if (!(obj instanceof THREE.InstancedMesh)) return;
    const tone = (obj.material as THREE.MeshLambertMaterial).color.getHexString();
    for (let i = 0; i < obj.count; i += 1) {
      const m = new THREE.Matrix4();
      obj.getMatrixAt(i, m);
      m.decompose(pos, quat, scale);
      euler.setFromQuaternion(quat);
      out.push({ x: pos.x, y: pos.y, z: pos.z, w: scale.x, h: scale.y, d: scale.z, yaw: euler.y, tone });
    }
  });
  dressing.dispose();
  return out;
}

/** Yaw-aware footprint half-extents on the ground plane. */
function halfExtents(b: Observed): { hx: number; hz: number } {
  const c = Math.abs(Math.cos(b.yaw));
  const s = Math.abs(Math.sin(b.yaw));
  return { hx: (b.w * c + b.d * s) / 2, hz: (b.w * s + b.d * c) / 2 };
}

function intersectsRect(b: Observed, x0: number, x1: number, z0: number, z1: number): boolean {
  const { hx, hz } = halfExtents(b);
  return b.x + hx > x0 && b.x - hx < x1 && b.z + hz > z0 && b.z - hz < z1;
}

describe("#242 yard dressing", () => {
  const boxes = observe();

  it("is deterministic: two builds observe identical instance sets", () => {
    expect(observe()).toEqual(boxes);
    expect(boxes.length).toBeGreaterThan(100);
  });

  it("shares one unit-box geometry across every batch (instancing-first)", () => {
    const dressing = createYardDressing(unitBox);
    let batches = 0;
    dressing.group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        batches += 1;
        expect(obj.geometry).toBe(unitBox);
        expect(obj.userData.pickId).toBeNull();
      }
    });
    expect(batches).toBeLessThanOrEqual(7); // one per palette tone
    expect(dressing.stats().boxes).toBe(boxes.length);
    expect(dressing.stats().batches).toBe(batches);
    dressing.dispose();
  });

  it("keeps the placeable grid clear: tall props live outside it", () => {
    const yardX1 = YARD_COLS * CELL;
    const yardZ1 = YARD_ROWS * CELL;
    for (const b of boxes) {
      if (!intersectsRect(b, 0, yardX1, 0, yardZ1)) continue;
      // In-yard dressing must fit the 8x8 corner gap between machine bodies
      // (<= 24 wide in a 32 cell) and stay below the drone arc (>= 6 up).
      expect(b.h, `tall prop inside yard at ${b.x},${b.z}`).toBeLessThanOrEqual(7);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(7);
      const { hx, hz } = halfExtents(b);
      expect(Math.max(hx, hz)).toBeLessThanOrEqual(4.5);
    }
  });

  it("never touches the dock tile", () => {
    const col = DOCK_TILE % YARD_COLS;
    const row = Math.floor(DOCK_TILE / YARD_COLS);
    for (const b of boxes) {
      expect(intersectsRect(b, col * CELL, (col + 1) * CELL, row * CELL, (row + 1) * CELL)).toBe(false);
    }
  });

  it("keeps the wreck->dock drone corridor flyable", () => {
    // The arc flies x = WRECK_POSITION.x (+/- lean) at y >= 6; nothing in that
    // column inside the yard may rise into it.
    for (const b of boxes) {
      if (!intersectsRect(b, WRECK_POSITION.x - 8, WRECK_POSITION.x + 8, 0, YARD_ROWS * CELL)) continue;
      expect(b.y + b.h / 2).toBeLessThanOrEqual(5);
    }
  });

  it("leaves the tutorial wreck a clear highlight radius", () => {
    for (const b of boxes) {
      // Only structure-height props could compete with the wreck highlight;
      // ankle-high stones and corner piles are clutter, not targets.
      if (b.y + b.h / 2 <= 7) continue;
      const dist = Math.hypot(b.x - WRECK_POSITION.x, b.z - WRECK_POSITION.y);
      expect(dist, `dressing too close to wreck at ${b.x},${b.z}`).toBeGreaterThanOrEqual(24);
    }
  });

  it("surround terrain sits under the yard slab and is not pickable", () => {
    const mesh = createSurroundTerrain();
    expect(mesh.position.y).toBeLessThan(0);
    expect(mesh.userData.pickId).toBeNull();
    const params = (mesh.geometry as THREE.PlaneGeometry).parameters;
    expect(params.width).toBeGreaterThan(WORLD_W);
    expect(params.height).toBeGreaterThan(WORLD_H);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it("mottles the ground deterministically within a sparse brightness band", () => {
    const a = new THREE.PlaneGeometry(WORLD_W, WORLD_H, 12, 14);
    const b = new THREE.PlaneGeometry(WORLD_W, WORLD_H, 12, 14);
    mottleGroundGeometry(a);
    mottleGroundGeometry(b);
    const ca = a.getAttribute("color");
    const cb = b.getAttribute("color");
    expect(ca.count).toBe(a.attributes.position.count);
    expect(Array.from(ca.array)).toEqual(Array.from(cb.array));
    for (let i = 0; i < ca.count; i += 1) {
      expect(ca.getX(i)).toBeGreaterThanOrEqual(0.9);
      expect(ca.getX(i)).toBeLessThanOrEqual(1.12);
    }
    a.dispose();
    b.dispose();
  });
});
