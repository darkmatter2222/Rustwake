import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  CAMERA_RADIUS,
  castGround,
  castPick,
  ndcOf,
  projectToScreen,
  syncOrthoCamera,
} from "../../src/game/renderer/three/cameraRig";
import {
  screenToWorld,
  worldToScreen,
  type Camera,
  type ViewState,
} from "../../src/game/renderer/projection";
import { CELL, WORLD_H, WORLD_W, tileToWorld } from "../../src/game/renderer/grid";

/**
 * RW3D T07 (#134): raycast selection on the PRODUCTION pick path.
 *
 * cameraRig.ts is the exact module worldRenderer.ts delegates to, and none of it
 * needs a WebGL context — so these tests run the real basis sync, the real
 * THREE.Raycaster and the real InstancedMesh id resolution in jsdom. The contract:
 *  - the THREE camera reproduces projection.worldToScreen / screenToWorld;
 *  - a tap's ground inverse and the raycast ground hit agree under any orbit;
 *  - castPick resolves machine ids through instanceId, wreck/dock through pickId,
 *    returns the nearest body, and never picks the ground or empty space.
 */

const view: ViewState = { width: 960, height: 640 };

function makeCamera(): THREE.OrthographicCamera {
  return new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);
}

function makeGround(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_H);
  geo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
  ground.updateMatrixWorld();
  return ground;
}

/** Two instanced machine bodies at tiles 7 and 9, exactly as worldRenderer batches them. */
function makeMachines(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(CELL * 0.8, 16, CELL * 0.8),
    new THREE.MeshBasicMaterial(),
    2
  );
  mesh.userData.kind = "machine";
  mesh.userData.ids = [7, 9];
  const m = new THREE.Matrix4();
  const a = tileToWorld(7);
  const b = tileToWorld(9);
  mesh.setMatrixAt(0, m.makeTranslation(a.x, 8, a.y));
  mesh.setMatrixAt(1, m.makeTranslation(b.x, 8, b.y));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.updateMatrixWorld();
  return mesh;
}

function makeBody(pickId: number, x: number, z: number, h: number): THREE.Mesh {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.9, h, CELL * 0.9),
    new THREE.MeshBasicMaterial()
  );
  body.userData.pickId = pickId;
  body.position.set(x, h / 2, z);
  body.updateMatrixWorld();
  return body;
}

const ORBITS: Array<{ yaw: number; elev: number }> = [
  { yaw: 0, elev: 90 },
  { yaw: 45, elev: 35.264 },
  { yaw: 90, elev: 60 },
  { yaw: 180, elev: 20 },
  { yaw: 270, elev: 45 },
  { yaw: 315, elev: 80 },
];

describe("camera basis agreement with the shared projection", () => {
  it("projectToScreen matches worldToScreen for ground points under every orbit", () => {
    const camera3 = makeCamera();
    const points = [
      [0, 0],
      [WORLD_W, WORLD_H],
      [WORLD_W / 2, WORLD_H / 2],
      [37.5, 121.25],
    ] as const;
    for (const { yaw, elev } of ORBITS) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 2.5, yaw, elev };
      syncOrthoCamera(camera3, camera, view);
      for (const [x, y] of points) {
        const got = projectToScreen(camera3, view, x, 0, y);
        const want = worldToScreen(camera, view, x, y);
        expect(got.x).toBeCloseTo(want.x, 6);
        expect(got.y).toBeCloseTo(want.y, 6);
      }
    }
  });

  it("castGround matches screenToWorld under every orbit", () => {
    const camera3 = makeCamera();
    const ground = makeGround();
    const raycaster = new THREE.Raycaster();
    // Pixels derived from in-world points: the finite ground plane is only hit
    // where the yard actually is (corner pixels of a wide view legitimately miss).
    const worldPoints = [
      [WORLD_W / 2, WORLD_H / 2],
      [48, 56],
      [144, 168],
      [20, 200],
    ] as const;
    for (const { yaw, elev } of ORBITS) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 2.5, yaw, elev };
      syncOrthoCamera(camera3, camera, view);
      for (const [wx, wy] of worldPoints) {
        const px = worldToScreen(camera, view, wx, wy);
        const got = castGround(raycaster, camera3, view, px.x, px.y, ground);
        const want = screenToWorld(camera, view, px.x, px.y);
        expect(got).not.toBeNull();
        expect(got!.x).toBeCloseTo(want.x, 6);
        expect(got!.y).toBeCloseTo(want.y, 6);
        expect(got!.x).toBeCloseTo(wx, 6);
        expect(got!.y).toBeCloseTo(wy, 6);
      }
    }
  });

  it("the rig places the camera on the spherical offset with the pinned frustum", () => {
    const camera3 = makeCamera();
    const camera: Camera = { x: 96, y: 112, scale: 2, yaw: 90, elev: 90 };
    syncOrthoCamera(camera3, camera, view);
    expect(camera3.position.distanceTo(new THREE.Vector3(96, 0, 112))).toBeCloseTo(CAMERA_RADIUS, 6);
    expect(camera3.left).toBe(-view.width / (2 * camera.scale));
    expect(camera3.right).toBe(view.width / (2 * camera.scale));
    expect(camera3.top).toBe(view.height / (2 * camera.scale));
    expect(camera3.bottom).toBe(-view.height / (2 * camera.scale));
    expect(camera3.near).toBe(CAMERA_NEAR);
    expect(camera3.far).toBe(CAMERA_FAR);
    const ndc = ndcOf(view, 0, 0);
    expect(ndc.x).toBe(-1);
    expect(ndc.y).toBe(1);
  });
});

describe("raycast selection", () => {
  it("resolves instanced machine ids at their projected centres under every orbit", () => {
    const camera3 = makeCamera();
    const raycaster = new THREE.Raycaster();
    const machines = makeMachines();
    for (const { yaw, elev } of ORBITS) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3, yaw, elev };
      syncOrthoCamera(camera3, camera, view);
      for (const [instance, id] of [[0, 7], [1, 9]] as const) {
        const tile = id === 7 ? tileToWorld(7) : tileToWorld(9);
        // Aim at the body's mid-height so the ray hits the box, not just its footprint.
        const px = projectToScreen(camera3, view, tile.x, 8, tile.y);
        const hit = castPick(raycaster, camera3, view, px.x, px.y, [machines]);
        expect(hit).not.toBeNull();
        expect(hit!.id).toBe(id);
        expect(hit!.point.y).toBeGreaterThan(0);
        expect(instance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("returns the nearest body when two overlap on screen", () => {
    const camera3 = makeCamera();
    const raycaster = new THREE.Raycaster();
    const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3, yaw: 0, elev: 90 };
    syncOrthoCamera(camera3, camera, view);
    const centre = tileToWorld(7);
    const near = makeBody(42, centre.x, centre.y, 32);
    const far = makeBody(43, centre.x, centre.y, 8);
    const px = projectToScreen(camera3, view, centre.x, 16, centre.y);
    const hit = castPick(raycaster, camera3, view, px.x, px.y, [far, near]);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe(42);
  });

  it("picks the wreck (-1) and dock (-2) single bodies", () => {
    const camera3 = makeCamera();
    const raycaster = new THREE.Raycaster();
    const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3, yaw: 45, elev: 35 };
    syncOrthoCamera(camera3, camera, view);
    const wreck = makeBody(-1, CELL * 2.5, WORLD_H - CELL * 0.55, 20);
    const dock = makeBody(-2, tileToWorld(2).x, tileToWorld(2).y, 12);
    for (const [body, id, h] of [[wreck, -1, 10], [dock, -2, 6]] as const) {
      const px = projectToScreen(camera3, view, body.position.x, h, body.position.z);
      const hit = castPick(raycaster, camera3, view, px.x, px.y, [wreck, dock]);
      expect(hit).not.toBeNull();
      expect(hit!.id).toBe(id);
    }
  });

  it("never picks the ground or empty space", () => {
    const camera3 = makeCamera();
    const raycaster = new THREE.Raycaster();
    const ground = makeGround();
    const machines = makeMachines();
    const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3, yaw: 0, elev: 90 };
    syncOrthoCamera(camera3, camera, view);
    // A ground point far from any body: even with the ground in the list, no id resolves.
    const empty = projectToScreen(camera3, view, 8, 0, 8);
    expect(castPick(raycaster, camera3, view, empty.x, empty.y, [ground, machines])).toBeNull();
    // Outside the world entirely.
    expect(castPick(raycaster, camera3, view, -500, -500, [ground, machines])).toBeNull();
    expect(castGround(raycaster, camera3, view, -5000, -5000, ground)).toBeNull();
  });

  it("a tap's ground inverse lands on the same tile the raycast body occupies", () => {
    const camera3 = makeCamera();
    const raycaster = new THREE.Raycaster();
    const machines = makeMachines();
    for (const { yaw, elev } of ORBITS) {
      const camera: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 3, yaw, elev };
      syncOrthoCamera(camera3, camera, view);
      const tile = tileToWorld(9);
      const px = worldToScreen(camera, view, tile.x, tile.y);
      // The shell tap path: ground inverse first...
      const ground = screenToWorld(camera, view, px.x, px.y);
      expect(Math.floor(ground.x / CELL)).toBe(Math.floor(tile.x / CELL));
      expect(Math.floor(ground.y / CELL)).toBe(Math.floor(tile.y / CELL));
      // ...and the raycast body hit agrees on the id.
      const bodyPx = projectToScreen(camera3, view, tile.x, 8, tile.y);
      const hit = castPick(raycaster, camera3, view, bodyPx.x, bodyPx.y, [machines]);
      expect(hit!.id).toBe(9);
    }
  });
});