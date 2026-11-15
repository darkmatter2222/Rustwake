/*
 * #242: first-run yard dressing — the static voxel environment that makes a FRESH
 * yard read as a salvage yard on arrival instead of flat empty ground.
 *
 * Presentation only: this layer holds no sim state, no save bytes, no economy and
 * no pick targets. Every mesh is non-pickable (never added to YardWorld.pickables),
 * so the salvage tutorial's wreck/dock raycast path is untouched. The layout is
 * deterministic (fixed seed, no clock) and built once at construction — zero
 * per-frame work, zero animation, so reduced motion and the hidden-tab pause are
 * unaffected by construction.
 *
 * Placement safety: the 6x6 placeable grid stays clear. Large props (wreck cluster,
 * site office, scrap bales, containers) sit in the wreck apron strip and on the
 * darker surround terrain OUTSIDE the yard slab; the only in-yard props are small
 * scrap piles centred on grid intersections (the 8x8 corner gap four adjacent
 * machine bodies leave between them) and ankle-high stones that a placed machine
 * body (16+ units tall) fully encloses. Nothing intersects the wreck->dock drone
 * arc (flight stays >= 6 units up; in-yard dressing stays <= 7 units tall and out
 * of the x = 80 flight corridor) or the dock tile.
 *
 * Art contract (ART_AND_MOTION.md): large matte surfaces, a few fine steps, shared
 * unit-box geometry, one material per palette tone, instanced batches (§5). Tones
 * are the existing renderer PALETTE tokens — the same bodyLight/wreck/steelLight
 * materials the dock and wreck already use, so the dressing lands on the same lit
 * structure tones the pixel census measures. No new assets, no binary media.
 */
import * as THREE from "three";
import { CELL, WORLD_H, WORLD_W, YARD_ROWS } from "../grid";
import { PALETTE } from "../sprites";

/** Fixed seed: the dressing layout is identical on every visit and every device. */
const SEED = 242;

/** mulberry32 — small deterministic PRNG (no clock, no Math.random). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Tone = "bodyLight" | "bodyMid" | "wreck" | "steelLight" | "rust" | "well" | "amber";
const TONES: readonly Tone[] = ["bodyLight", "bodyMid", "wreck", "steelLight", "rust", "well", "amber"];

interface Box {
  x: number;
  y: number; // centre height
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
}

export interface YardDressing {
  group: THREE.Group;
  /** Numeric accounting for evidence harnesses (instancing discipline). */
  stats(): { boxes: number; batches: number };
  dispose(): void;
}

/**
 * Build the static dressing. `unitBox` is the caller's shared geometry (owned and
 * disposed by YardWorld); materials and instanced meshes are owned here.
 */
export function createYardDressing(unitBox: THREE.BoxGeometry): YardDressing {
  const rand = rng(SEED);
  const boxes = new Map<Tone, Box[]>();
  const put = (tone: Tone, b: Box): void => {
    const list = boxes.get(tone) ?? [];
    list.push(b);
    boxes.set(tone, list);
  };
  /** A box resting on the ground (or on a parent top at `base`). */
  const solid = (tone: Tone, x: number, z: number, w: number, h: number, d: number, base = 0, yaw = 0): void =>
    put(tone, { x, y: base + h / 2, z, w, h, d, yaw });

  const apronZ = YARD_ROWS * CELL; // 192: placeable rows end, wreck apron begins

  // --- Site office (apron, west end): a small starter voxel structure. It is yard
  // dressing, NOT a machine — the player still places the sorter and furnace. ---
  solid("steelLight", 16, apronZ + 14, 26, 12, 20); // walls
  solid("bodyLight", 16, apronZ + 14, 28, 1.6, 22, 12); // roof cap (bright census tone)
  solid("wreck", 11, apronZ + 12, 10, 1.4, 8, 13.6); // roof step
  solid("well", 22, apronZ + 19, 3, 2, 3, 13.6); // vent recess
  solid("well", 10, apronZ + 24.2, 4, 6, 0.5); // door recess on the south face
  solid("amber", 14.5, apronZ + 24.4, 1.2, 1.2, 1.2, 6.4); // door lamp

  // --- Wreck cluster (apron): sibling hulls around the tutorial wreck at x = 80.
  // Each stays >= 25 units from the wreck anchor so the overlay highlight ring and
  // the "tap the highlighted wreck" objective read against ONE clear target. ---
  solid("wreck", 42, apronZ + 20, 22, 10, 12, 0, 0.12);
  solid("bodyMid", 38, apronZ + 18, 10, 4, 8, 10, 0.12);
  solid("wreck", 124, apronZ + 16, 26, 12, 14, 0, -0.08);
  solid("steelLight", 128, apronZ + 14, 12, 3, 9, 12, -0.08);
  solid("rust", 160, apronZ + 20, 18, 9, 12, 0, 0.2);
  solid("wreck", 157, apronZ + 21, 8, 3, 7, 9, 0.2);
  solid("bodyMid", 108, apronZ + 24, 10, 6, 8, 0, 0.35); // crushed cab

  // --- Scrap bale rows (surround terrain, south of the apron): the yard's output
  // landscape. Two staggered rows of crushed cubes with a fine top step each. ---
  const baleTones: Tone[] = ["steelLight", "wreck", "bodyLight", "steelLight", "wreck", "bodyLight"];
  for (let i = 0; i < 6; i += 1) {
    const x = 14 + i * 30;
    const h = 10 + Math.floor(rand() * 7);
    solid(baleTones[i], x, apronZ + 46, 24, h, 16);
    solid(baleTones[i], x, apronZ + 46, 14, 2, 9, h);
  }
  const baleTones2: Tone[] = ["wreck", "steelLight", "steelLight", "rust", "wreck"];
  for (let i = 0; i < 5; i += 1) {
    const x = 29 + i * 30;
    const h = 8 + Math.floor(rand() * 5);
    solid(baleTones2[i], x, apronZ + 66, 22, h, 14);
    solid(baleTones2[i], x, apronZ + 66, 12, 1.6, 8, h);
  }
  const baleTones3: Tone[] = ["bodyLight", "steelLight", "wreck", "bodyLight", "steelLight", "wreck"];
  for (let i = 0; i < 6; i += 1) {
    const x = 14 + i * 30;
    const h = 8 + Math.floor(rand() * 6);
    solid(baleTones3[i], x, apronZ + 86, 24, h, 16);
    solid(baleTones3[i], x, apronZ + 86, 14, 1.8, 9, h);
  }

  // --- Container rows (surround terrain, north of the dock gate): inbound freight.
  // Both rows keep the x = 62..98 gate axis clear. ---
  const containerTones: Tone[] = ["bodyLight", "rust", "steelLight", "bodyLight", "wreck"];
  const containerX = [16, 46, 116, 146, 176];
  for (let i = 0; i < containerX.length; i += 1) {
    solid(containerTones[i], containerX[i], -16, 26, 12, 12);
    solid("well", containerX[i], -16, 26, 0.8, 1.2, 12); // roof rib recess
  }
  const containerTones2: Tone[] = ["steelLight", "bodyLight", "wreck", "steelLight"];
  const containerX2 = [20, 48, 128, 156];
  for (let i = 0; i < containerX2.length; i += 1) {
    solid(containerTones2[i], containerX2[i], -42, 26, 12, 12);
    solid("well", containerX2[i], -42, 26, 0.8, 1.2, 12);
  }

  // --- Corner scrap clusters (surround terrain, outside the fence). ---
  for (const [cx, cz] of [
    [-18, -18],
    [WORLD_W + 18, -18],
    [-18, WORLD_H + 18],
    [WORLD_W + 18, WORLD_H + 18],
  ]) {
    for (let i = 0; i < 3; i += 1) {
      const s = 6 + rand() * 3;
      const tone: Tone = (["steelLight", "rust", "wreck"] as Tone[])[i];
      solid(tone, cx + (rand() - 0.5) * 8, cz + (rand() - 0.5) * 8, s, 3 + rand() * 4, s, 0, rand() * 0.8);
    }
  }

  // --- Perimeter fence on the surround terrain, 6 units outside the slab. Posts
  // every 16 units; two dark rails per side; a gate gap on the dock axis (x 62..98). ---
  const fenceInset = -6;
  const fenceFarX = WORLD_W + 6;
  const fenceFarZ = WORLD_H + 6;
  for (let z = fenceInset; z <= fenceFarZ; z += 16) {
    solid("steelLight", fenceInset, z, 2.5, 9, 2.5);
    solid("steelLight", fenceFarX, z, 2.5, 9, 2.5);
  }
  for (let x = fenceInset; x <= fenceFarX; x += 16) {
    solid("steelLight", x, fenceFarZ, 2.5, 9, 2.5);
    if (x > 62 && x < 98) continue; // dock gate gap
    solid("steelLight", x, fenceInset, 2.5, 9, 2.5);
  }
  solid("amber", 62, fenceInset, 1.6, 1.6, 1.6, 12); // gate post lamps
  solid("amber", 98, fenceInset, 1.6, 1.6, 1.6, 12);
  solid("steelLight", 62, fenceInset, 2.5, 12, 2.5);
  solid("steelLight", 98, fenceInset, 2.5, 12, 2.5);
  for (const y of [4.5, 8]) {
    put("well", { x: fenceInset, y, z: (fenceInset + fenceFarZ) / 2, w: 1.2, h: 1.2, d: fenceFarZ - fenceInset });
    put("well", { x: fenceFarX, y, z: (fenceInset + fenceFarZ) / 2, w: 1.2, h: 1.2, d: fenceFarZ - fenceInset });
    put("well", { x: (fenceInset + fenceFarX) / 2, y, z: fenceFarZ, w: fenceFarX - fenceInset, h: 1.2, d: 1.2 });
    put("well", { x: (fenceInset + 62) / 2, y, z: fenceInset, w: 62 - fenceInset, h: 1.2, d: 1.2 });
    put("well", { x: (98 + fenceFarX) / 2, y, z: fenceInset, w: fenceFarX - 98, h: 1.2, d: 1.2 });
  }

  // --- In-yard scrap piles: centred on grid intersections, inside the 8x8 corner
  // gap adjacent machine bodies leave (bodies are <= 24 wide in a 32 cell). ---
  const pileSpots: [number, number][] = [
    [32, 32],
    [128, 32],
    [160, 64],
    [32, 96],
    [160, 128],
    [32, 160],
    [96, 160],
    [160, 160],
  ];
  const pileTones: Tone[] = ["steelLight", "wreck", "rust", "bodyMid"];
  for (const [px, pz] of pileSpots) {
    for (let i = 0; i < 3; i += 1) {
      const s = 4 + rand() * 2;
      // Axis-aligned, <= 6 wide, offset <= 1.5: the whole pile stays inside the
      // 8x8 corner gap (half-extent <= 4.5) four adjacent machine bodies leave.
      solid(
        pileTones[Math.floor(rand() * pileTones.length)],
        px + (rand() - 0.5) * 3,
        pz + (rand() - 0.5) * 3,
        s,
        2 + rand() * 4,
        s
      );
    }
  }

  // --- Sparse stones and shrubs (ART_AND_MOTION: mostly flat terrain, sparse
  // low-poly detail). Ankle-high; a placed machine body encloses them completely. ---
  for (let i = 0; i < 22; i += 1) {
    const x = 8 + rand() * (WORLD_W - 16);
    const z = 8 + rand() * (YARD_ROWS * CELL - 16);
    if (x > 60 && x < 100 && z < 36) continue; // keep the dock tile clear
    const s = 2.5 + rand() * 1.5;
    const tone: Tone = i % 5 === 0 ? "rust" : i % 2 === 0 ? "steelLight" : "wreck";
    solid(tone, x, z, s, 1.2 + rand(), s, 0, rand() * 0.9);
  }

  // --- One instanced batch per tone (shared unit box, §5 instancing-first). ---
  const group = new THREE.Group();
  group.name = "yard-dressing";
  const materials: THREE.Material[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let total = 0;
  for (const tone of TONES) {
    const list = boxes.get(tone);
    if (!list || list.length === 0) continue;
    const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE[tone]) });
    const mesh = new THREE.InstancedMesh(unitBox, material, list.length);
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      pos.set(b.x, b.y, b.z);
      quat.setFromAxisAngle(yAxis, b.yaw ?? 0);
      scale.set(b.w, b.h, b.d);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Static world-spanning batch: the shared unit-box bounds do not describe the
    // instances, so opt out of frustum culling rather than mis-cull on pan.
    mesh.frustumCulled = false;
    mesh.userData.pickId = null; // dressing is never a selection target
    group.add(mesh);
    materials.push(material);
    meshes.push(mesh);
    total += list.length;
  }

  return {
    group,
    stats: () => ({ boxes: total, batches: meshes.length }),
    dispose: () => {
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

/**
 * The surround terrain slab under the dressing: a darker apron extending 2.5 cells
 * past the yard on every side, so the fence, bale rows and container rows sit on
 * ground instead of floating in the night background. Purely visual — ground
 * picking and the camera clamp keep using the yard slab itself.
 */
export function createSurroundTerrain(): THREE.Mesh {
  const margin = CELL * 2.5;
  const geo = new THREE.PlaneGeometry(WORLD_W + margin * 2, WORLD_H + margin * 2);
  const color = new THREE.Color(PALETTE.floor).multiplyScalar(0.55);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(WORLD_W / 2, -0.15, WORLD_H / 2);
  mesh.userData.pickId = null;
  return mesh;
}

/**
 * Sparse terrain variation on the yard slab itself (ART_AND_MOTION sandLight-style
 * mottling, in the yard's floor tone): per-vertex brightness jitter on a subdivided
 * plane. Deterministic; the plane stays exactly the yard rectangle so castGround
 * and screenToWorld agreement are unchanged.
 */
export function mottleGroundGeometry(geo: THREE.PlaneGeometry, seed = SEED): void {
  const rand = rng(seed);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const v = 0.9 + rand() * 0.22;
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}
