/*
 * RW3D T07 (#134): the orthographic camera rig and raycast picking, as pure functions
 * over THREE objects (architecture §1). No WebGL context is needed to construct or use
 * anything here — syncOrthoCamera, castPick and castGround are math only — so the unit
 * suite exercises the SAME camera basis and pick path the renderer uses, in jsdom.
 *
 * The basis reproduces projection.worldToScreen exactly:
 *   right R = (cosT, 0, -sinT)
 *   up    U = (-sinT*sinP, cosP, -cosT*sinP)
 *   out   Z = (sinT*cosP, sinP, cosT*cosP)
 *   position = target + radius*Z, frustum half-width = width/(2*scale),
 *   half-height = height/(2*scale). At yaw 0 / elev 90 this is the legacy top-down view.
 *
 * Reads immutable snapshots only through its callers; no state writes, no clock reads,
 * no UI imports, no save bytes.
 */
import * as THREE from "three";
import { clampElev, elevOf, normalizeYaw, yawOf, type Camera, type ViewState } from "../projection";

/** A large camera stand-off keeps the whole yard inside [near, far] under any orbit. */
export const CAMERA_RADIUS = 1024;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 4096;

export interface PickResult {
  /** Machine id, -1 wreck, -2 dock; null when the ray hits nothing pickable. */
  id: number | null;
  /** World-space hit point (x = yard x, y = up, z = yard y). */
  point: { x: number; y: number; z: number };
}

/** Sync an OrthographicCamera to the shared projection (reproduces worldToScreen). */
export function syncOrthoCamera(
  camera3: THREE.OrthographicCamera,
  camera: Camera,
  view: ViewState
): void {
  const theta = (normalizeYaw(yawOf(camera)) * Math.PI) / 180;
  const phi = (clampElev(elevOf(camera)) * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const sinP = Math.sin(phi);
  const cosP = Math.cos(phi);
  // right R = (cosT, 0, -sinT) is implicit in lookAt(up, out); only up and out are set.
  const up = new THREE.Vector3(-sinT * sinP, cosP, -cosT * sinP);
  const out = new THREE.Vector3(sinT * cosP, sinP, cosT * cosP);
  const target = new THREE.Vector3(camera.x, 0, camera.y);
  camera3.position.copy(target).addScaledVector(out, CAMERA_RADIUS);
  camera3.up.copy(up);
  camera3.lookAt(target);
  const halfW = view.width / (2 * camera.scale);
  const halfH = view.height / (2 * camera.scale);
  camera3.left = -halfW;
  camera3.right = halfW;
  camera3.top = halfH;
  camera3.bottom = -halfH;
  camera3.near = CAMERA_NEAR;
  camera3.far = CAMERA_FAR;
  camera3.updateProjectionMatrix();
  camera3.updateMatrixWorld();
}

/** Canvas-local CSS pixel -> THREE NDC. */
export function ndcOf(view: ViewState, sx: number, sy: number): THREE.Vector2 {
  return new THREE.Vector2((sx / view.width) * 2 - 1, -((sy / view.height) * 2 - 1));
}

/**
 * Raycast selection: the nearest pickable body under a canvas-local CSS pixel.
 * InstancedMesh batches carry `userData.ids` (instance index -> machine id); single
 * bodies carry `userData.pickId` (-1 wreck, -2 dock). Ground/drones are not pickable.
 */
export function castPick(
  raycaster: THREE.Raycaster,
  camera3: THREE.OrthographicCamera,
  view: ViewState,
  sx: number,
  sy: number,
  objects: THREE.Object3D[]
): PickResult | null {
  raycaster.setFromCamera(ndcOf(view, sx, sy), camera3);
  const hits = raycaster.intersectObjects(objects, false);
  for (const hit of hits) {
    const obj = hit.object;
    let id: number | null = null;
    if (obj.userData.kind === "machine" && hit.instanceId !== undefined) {
      const ids = obj.userData.ids as number[];
      id = ids[hit.instanceId] ?? null;
    } else if (typeof obj.userData.pickId === "number") {
      id = obj.userData.pickId;
    }
    if (id !== null) {
      return { id, point: { x: hit.point.x, y: hit.point.y, z: hit.point.z } };
    }
  }
  return null;
}

/** The ground-plane point under a pixel — agrees with projection.screenToWorld. */
export function castGround(
  raycaster: THREE.Raycaster,
  camera3: THREE.OrthographicCamera,
  view: ViewState,
  sx: number,
  sy: number,
  ground: THREE.Object3D
): { x: number; y: number } | null {
  raycaster.setFromCamera(ndcOf(view, sx, sy), camera3);
  const hits = raycaster.intersectObject(ground, false);
  if (hits.length === 0) return null;
  return { x: hits[0].point.x, y: hits[0].point.z };
}

/** Project a world point (x = yard x, y = up, z = yard y) to canvas-local CSS pixels. */
export function projectToScreen(
  camera3: THREE.OrthographicCamera,
  view: ViewState,
  x: number,
  y: number,
  z: number
): { x: number; y: number } {
  const v = new THREE.Vector3(x, y, z).project(camera3);
  return {
    x: ((v.x + 1) / 2) * view.width,
    y: ((1 - v.y) / 2) * view.height,
  };
}