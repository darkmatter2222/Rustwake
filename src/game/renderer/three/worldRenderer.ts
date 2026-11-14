/*
 * RW3D T07 (#134): the three.js world layer (architecture §1 / ADR-0001).
 *
 * This module owns the volumetric yard — ground, grid, one InstancedMesh per building
 * archetype (instancing-first, §5), the wreck and dock blockouts, and the moving drone
 * units — rendered with an OrthographicCamera that is synced to the SAME projection the
 * 2D information overlay uses (projection.ts). It reads an immutable SimState snapshot
 * plus the caller's framePhase; it never writes state, never reads a clock, never imports
 * the UI logistics bridge or scene.ts. Simulation and UI never import THREE.
 *
 * RW3D T16 (#143): the fleet truck pool reads the renderer-root fleet bridge
 * (renderer/fleet.ts), which is derived ONLY from real cargo jobs. An empty bridge
 * (the default) hides every rig, so the pre-T16 frame is unchanged.
 *
 * Quality is blockout-flat (§1.5 / T03 ADR): no shadow maps, DPR capped at 2, an
 * ambient-dominant hemisphere fill. Selection is a real THREE.Raycaster pick whose ground
 * intersection agrees with projection.screenToWorld, so a tap maps to the same cell under
 * any orbit. Context loss is surfaced (save untouched by construction — the renderer holds
 * no save bytes); the caller pauses rendering on a hidden tab; reduced motion collapses the
 * drone arc to the two documented discrete stages.
 *
 * The orthographic camera basis is derived to reproduce projection.worldToScreen exactly:
 *   right R = (cosT, 0, -sinT)
 *   up    U = (-sinT*sinP, cosP, -cosT*sinP)
 *   out   Z = (sinT*cosP, sinP, cosT*cosP)
 *   position = target + radius*Z, frustum half-width = width/(2*scale),
 *   half-height = height/(2*scale). At yaw 0 / elev 90 this is the legacy top-down view.
 */
import * as THREE from "three";
import { TUNING } from "../../content/defs";
import type { MachineState, SimState } from "../../simulation/types";
import { getFleetFrame, type FleetFrame, type FleetUnit } from "../fleet";
import { droneLeg } from "../flight";
import {
  CELL,
  DOCK_TILE,
  WORLD_H,
  WORLD_W,
  WRECK_POSITION,
  YARD_COLS,
  YARD_ROWS,
  tileToWorld,
} from "../grid";
import type { Camera, ViewState } from "../projection";
import { COLOR_KEYS, LEAN_UNITS, PALETTE, PARTS, type PartTuple } from "../sprites";
import {
  CAMERA_FAR,
  CAMERA_NEAR,
  castGround,
  castPick,
  projectToScreen,
  syncOrthoCamera,
  type PickResult,
} from "./cameraRig";

/** DPR cap (§1.5): never render above 2 device pixels per CSS pixel. */
export const MAX_DPR = 2;
/** Bounded drone pool (§5): the fleet is small; never allocate per-frame objects. */
const MAX_DRONES = 16;
/** Bounded truck pool (T16): same discipline as the drone pool. */
const MAX_TRUCKS = 16;
/** Truck blockout dimensions in world units (CELL = 32). Faces local +X. */
const TRUCK = {
  chassisL: 15,
  chassisH: 3,
  chassisW: 9,
  cabL: 4.5,
  cabH: 5,
  wheelR: 1.6,
  cargoL: 8,
  cargoH: 4,
  cargoW: 7,
  liftH: 5,
  groundY: 1.6,
};
/** Blockout extrusion base height in world units, grown one step per machine level. */
const BODY_BASE_HEIGHT = 16;
const BODY_LEVEL_HEIGHT = 2;

export interface WorldSyncOptions {
  reducedMotion: boolean;
  framePhase: number;
  selected: number | null;
}

export type { PickResult };

/** The footprint + dominant colour of one archetype, derived from its authored 2D row so
 * the 3D blockout sits on exactly the silhouette the overlay paints. Solid parts only. */
function bodyBoxOf(row: readonly PartTuple[]): { w: number; d: number; color: string } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let bestArea = -1;
  let colorIndex = 3; // bodyMid fallback
  for (const t of row) {
    if (t[5] === 1) continue; // skip the contact-shadow ellipse
    const [bx, by, bw, bh, ci] = t;
    minX = Math.min(minX, bx);
    maxX = Math.max(maxX, bx + bw);
    minY = Math.min(minY, by);
    maxY = Math.max(maxY, by + bh);
    const area = bw * bh;
    if (area > bestArea) {
      bestArea = area;
      colorIndex = ci;
    }
  }
  if (!Number.isFinite(minX)) return { w: CELL * 0.7, d: CELL * 0.7, color: PALETTE.bodyMid };
  const key = COLOR_KEYS[colorIndex] ?? "bodyMid";
  return { w: Math.max(2, maxX - minX), d: Math.max(2, maxY - minY), color: PALETTE[key] };
}

interface ArchetypeBatch {
  mesh: THREE.InstancedMesh;
  ids: number[];
  box: { w: number; d: number; color: string };
}

/** One pooled truck rig (T16). Every part is a scaled shared unit box; the cargo
 * box exists only while real units ride the carrier, the lift only moves while a
 * real load/unload timer runs, and the wheels only turn over cells actually walked. */
interface TruckRig {
  group: THREE.Group;
  cargo: THREE.Mesh;
  lift: THREE.Mesh;
  wheels: THREE.Mesh[];
  brakes: THREE.Mesh[];
}

/**
 * The yard world. One instance renders one canvas; the lazy singleton in index.ts owns the
 * lifetime for the blit path, and the bench harness constructs its own for direct capture.
 */
export class YardWorld {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera3: THREE.OrthographicCamera;
  private raycaster = new THREE.Raycaster();
  private ground: THREE.Mesh;
  private grid: THREE.LineSegments;
  private wreck: THREE.Mesh;
  private dock: THREE.Mesh;
  private batches = new Map<string, ArchetypeBatch>();
  private drones: THREE.Mesh[] = [];
  private droneGroup: THREE.Group;
  private trucks: TruckRig[] = [];
  private truckGroup: THREE.Group;
  private lastFleet: FleetFrame = { tick: 0, units: [] };
  private unitBox = new THREE.BoxGeometry(1, 1, 1);
  private machineSignature = "";
  private view: ViewState = { width: 1, height: 1 };
  private cam: Camera = { x: WORLD_W / 2, y: WORLD_H / 2, scale: 2 };
  private contextLost = false;
  private disposed = false;
  /** Shell hook (#135 wiring delta): fired on context loss so the shell can show a message. */
  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      // Keep the buffer after compositing so the 2D overlay can blit it and capture can read it.
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, MAX_DPR));
    this.renderer.shadowMap.enabled = false; // blockout-flat: no shadows
    this.renderer.setClearColor(new THREE.Color(PALETTE.night), 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.nightDeep);

    // Ambient-dominant fill (T03 ADR 1.0 -> 1.6): a warm hemisphere carries most of the
    // light, one gentle directional gives the blockouts form without casting shadows.
    const hemi = new THREE.HemisphereLight(0xf4ebd8, 0xba8054, 1.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
    sun.position.set(-8, 12, 6);
    sun.castShadow = false;
    this.scene.add(sun);

    this.camera3 = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);

    // Ground slab on y = 0 spanning the yard rectangle (world X = yard x, Z = yard y).
    const groundGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_H);
    const groundMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.floor) });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    this.ground.userData.pickId = null; // ground is not a selection target
    this.scene.add(this.ground);

    this.grid = this.buildGrid();
    this.scene.add(this.grid);

    // Wreck hulk blockout (pickId -1) and dock blockout (pickId -2).
    const wreckBox = bodyBoxOf(PARTS.generic);
    this.wreck = new THREE.Mesh(
      this.unitBox,
      new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.wreck) })
    );
    this.wreck.scale.set(wreckBox.w + 8, BODY_BASE_HEIGHT, wreckBox.d + 6);
    this.wreck.position.set(WRECK_POSITION.x, BODY_BASE_HEIGHT / 2, WRECK_POSITION.y);
    this.wreck.userData.pickId = -1;
    this.scene.add(this.wreck);

    const dockBox = bodyBoxOf(PARTS.dock);
    const dockCentre = tileToWorld(DOCK_TILE);
    this.dock = new THREE.Mesh(
      this.unitBox,
      new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.bodyLight) })
    );
    this.dock.scale.set(dockBox.w, BODY_BASE_HEIGHT * 0.6, dockBox.d);
    this.dock.position.set(dockCentre.x, (BODY_BASE_HEIGHT * 0.6) / 2, dockCentre.y);
    this.dock.userData.pickId = -2;
    this.scene.add(this.dock);

    this.droneGroup = new THREE.Group();
    this.scene.add(this.droneGroup);

    this.truckGroup = new THREE.Group();
    this.scene.add(this.truckGroup);

    canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored, false);
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.onContextLost?.();
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    // Force a rebuild of the instanced batches against the restored GL context.
    this.machineSignature = "";
    this.onContextRestored?.();
  };

  private buildGrid(): THREE.LineSegments {
    const verts: number[] = [];
    const y = 0.05; // lift just above the ground to avoid z-fighting
    for (let col = 0; col <= YARD_COLS; col += 1) {
      const x = col * CELL;
      verts.push(x, y, 0, x, y, YARD_ROWS * CELL);
    }
    for (let row = 0; row <= YARD_ROWS; row += 1) {
      const z = row * CELL;
      verts.push(0, y, z, YARD_COLS * CELL, y, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(PALETTE.steelLight),
      transparent: true,
      opacity: 0.22,
    });
    return new THREE.LineSegments(geo, mat);
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  /** Resize the drawing buffer to the view's CSS size (DPR-capped). The caller owns the
   * usable-world-rectangle camera math; this only sizes the render target. */
  resize(view: ViewState): void {
    this.view = { width: Math.max(1, view.width), height: Math.max(1, view.height) };
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, MAX_DPR));
    this.renderer.setSize(this.view.width, this.view.height, false);
  }

  /** Sync the orthographic camera to the shared projection (reproduces worldToScreen).
   * The basis math lives in cameraRig.ts so the unit suite can exercise it without GL. */
  private syncCamera(camera: Camera): void {
    syncOrthoCamera(this.camera3, camera, this.view);
  }

  /** Rebuild the per-archetype instanced batches when the machine set changes. */
  private syncBatches(machines: readonly MachineState[]): void {
    const signature = machines.map((m) => `${m.id}:${m.blueprint}:${m.tile}`).join("|");
    if (signature === this.machineSignature) return;
    this.machineSignature = signature;
    for (const batch of this.batches.values()) {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
      (batch.mesh.material as THREE.Material).dispose();
    }
    this.batches.clear();
    const byArchetype = new Map<string, MachineState[]>();
    for (const m of machines) {
      const list = byArchetype.get(m.blueprint) ?? [];
      list.push(m);
      byArchetype.set(m.blueprint, list);
    }
    for (const [archetype, list] of byArchetype) {
      const row = PARTS[archetype] ?? PARTS.generic;
      const box = bodyBoxOf(row);
      const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(box.color) });
      const mesh = new THREE.InstancedMesh(this.unitBox, material, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.kind = "machine";
      mesh.userData.archetype = archetype;
      const ids = list.map((m) => m.id);
      mesh.userData.ids = ids;
      this.scene.add(mesh);
      this.batches.set(archetype, { mesh, ids, box });
    }
  }

  /** Write per-instance transforms (position, quarter-turn orientation, level height). */
  private updateInstances(machines: readonly MachineState[], selected: number | null): void {
    const byArchetype = new Map<string, MachineState[]>();
    for (const m of machines) {
      const list = byArchetype.get(m.blueprint) ?? [];
      list.push(m);
      byArchetype.set(m.blueprint, list);
    }
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const [archetype, list] of byArchetype) {
      const batch = this.batches.get(archetype);
      if (!batch) continue;
      for (let i = 0; i < list.length; i += 1) {
        const m = list[i];
        const c = tileToWorld(m.tile);
        const height = BODY_BASE_HEIGHT + BODY_LEVEL_HEIGHT * Math.max(0, m.level - 1);
        pos.set(c.x, height / 2, c.y);
        quat.setFromAxisAngle(yAxis, ((m.orientation ?? 0) * Math.PI) / 2);
        scale.set(batch.box.w, height, batch.box.d);
        matrix.compose(pos, quat, scale);
        batch.mesh.setMatrixAt(i, matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.count = list.length;
      // A selected machine reads brighter; blockout-flat keeps this a flat colour shift.
      const mat = batch.mesh.material as THREE.MeshLambertMaterial;
      const anySelected = list.some((m) => m.id === selected);
      mat.color.set(anySelected ? PALETTE.select : batch.box.color);
    }
  }

  /** Place the bounded drone pool along the same flight arc the 2D overlay draws. */
  private updateDrones(state: SimState, opts: WorldSyncOptions): void {
    const units = [state.drone, ...state.spares];
    const dock = tileToWorld(DOCK_TILE);
    const phase = opts.framePhase;
    const reduced = opts.reducedMotion;
    for (let i = 0; i < MAX_DRONES; i += 1) {
      let mesh = this.drones[i];
      const unit = units[i];
      if (!unit || !unit.repaired) {
        if (mesh) mesh.visible = false;
        continue;
      }
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.unitBox,
          new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.bodyLight) })
        );
        mesh.scale.set(8, 4, 8);
        mesh.userData.pickId = null; // drones are not selection targets
        this.droneGroup.add(mesh);
        this.drones[i] = mesh;
      }
      mesh.visible = true;
      const leg = droneLeg(unit, state.tick, phase);
      const t = reduced ? (unit.inFlight ? 0.5 : 0) : leg;
      const lean = (i - (units.length - 1) / 2) * LEAN_UNITS;
      const carrying = (unit.inFlight?.qty ?? 0) > 0;
      const heavy = !reduced && carrying ? Math.sin(Math.PI * t) * 2 : 0;
      const x = WRECK_POSITION.x + (dock.x - WRECK_POSITION.x) * t + lean;
      const z = WRECK_POSITION.y + (dock.y - WRECK_POSITION.y) * t;
      const y = 6 + Math.sin(Math.PI * t) * 10 + heavy;
      mesh.position.set(x, y, z);
      (mesh.material as THREE.MeshLambertMaterial).color.set(
        carrying ? PALETTE.amber : PALETTE.bodyMid
      );
    }
    // The unrepaired starter drone parks beside the dock (matches the 2D rest frame).
    if (!state.drone.repaired) {
      let parked = this.drones[MAX_DRONES - 1];
      if (!parked) {
        parked = new THREE.Mesh(
          this.unitBox,
          new THREE.MeshLambertMaterial({ color: new THREE.Color(PALETTE.bodyMid) })
        );
        parked.scale.set(8, 4, 8);
        parked.userData.pickId = null;
        this.droneGroup.add(parked);
        this.drones[MAX_DRONES - 1] = parked;
      }
      parked.visible = true;
      parked.position.set(dock.x + 12, 4, dock.y + 2);
    }
  }

  /** Build one pooled truck rig from the shared unit box (T16). Faces local +X:
   * cab forward, cargo bed aft, brake lights on the rear face. */
  private buildTruckRig(): TruckRig {
    const group = new THREE.Group();
    const part = (color: string): THREE.Mesh =>
      new THREE.Mesh(this.unitBox, new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }));
    const chassis = part(PALETTE.bodyMid);
    chassis.scale.set(TRUCK.chassisL, TRUCK.chassisH, TRUCK.chassisW);
    chassis.position.set(0, TRUCK.groundY + TRUCK.wheelR + TRUCK.chassisH / 2, 0);
    group.add(chassis);
    const cab = part(PALETTE.bodyLight);
    cab.scale.set(TRUCK.cabL, TRUCK.cabH, TRUCK.chassisW);
    cab.position.set(
      TRUCK.chassisL / 2 - TRUCK.cabL / 2,
      TRUCK.groundY + TRUCK.wheelR + TRUCK.chassisH + TRUCK.cabH / 2,
      0
    );
    group.add(cab);
    const bedY = TRUCK.groundY + TRUCK.wheelR + TRUCK.chassisH;
    const lift = part(PALETTE.steelLight);
    lift.scale.set(TRUCK.cargoL + 1, 0.8, TRUCK.cargoW + 1);
    lift.position.set(-TRUCK.chassisL / 2 + TRUCK.cargoL / 2 + 0.5, bedY + 0.4, 0);
    group.add(lift);
    const cargo = part(PALETTE.amber);
    cargo.scale.set(TRUCK.cargoL, TRUCK.cargoH, TRUCK.cargoW);
    cargo.position.set(lift.position.x, bedY + 0.8 + TRUCK.cargoH / 2, 0);
    cargo.visible = false; // no real cargo, no box (E05)
    group.add(cargo);
    const wheels: THREE.Mesh[] = [];
    for (const [wx, wz] of [
      [TRUCK.chassisL / 2 - 2.5, TRUCK.chassisW / 2],
      [TRUCK.chassisL / 2 - 2.5, -TRUCK.chassisW / 2],
      [-TRUCK.chassisL / 2 + 2.5, TRUCK.chassisW / 2],
      [-TRUCK.chassisL / 2 + 2.5, -TRUCK.chassisW / 2],
    ]) {
      const wheel = part(PALETTE.well);
      wheel.scale.set(TRUCK.wheelR * 2, TRUCK.wheelR * 2, 1.4);
      wheel.position.set(wx, TRUCK.groundY + TRUCK.wheelR, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
    const brakes: THREE.Mesh[] = [];
    for (const bz of [TRUCK.chassisW / 2 - 1.5, -TRUCK.chassisW / 2 + 1.5]) {
      const lamp = part(PALETTE.rust);
      lamp.scale.set(0.8, 1.2, 1.6);
      lamp.position.set(-TRUCK.chassisL / 2 - 0.4, bedY - 0.5, bz);
      lamp.visible = false;
      group.add(lamp);
      brakes.push(lamp);
    }
    group.visible = false;
    this.truckGroup.add(group);
    return { group, cargo, lift, wheels, brakes };
  }

  /**
   * T16 (#143): place the bounded truck pool from the fleet bridge. The bridge is
   * derived only from real cargo jobs; when it is empty (the default) every rig
   * stays hidden and the frame is exactly the pre-T16 frame. Motion is bounded
   * and state-driven: wheels turn over walked cells only, the cargo box exists
   * only while job.inTransit > 0, the lift rides the real load/unload timers,
   * and brake lamps mark any non-parked stop (held, queued, aligning, idle).
   */
  private updateFleet(): void {
    const frame = getFleetFrame();
    this.lastFleet = frame;
    for (let i = 0; i < MAX_TRUCKS; i += 1) {
      const unit: FleetUnit | undefined = frame.units[i];
      let rig = this.trucks[i];
      if (!unit) {
        if (rig) rig.group.visible = false;
        continue;
      }
      if (!rig) {
        rig = this.buildTruckRig();
        this.trucks[i] = rig;
      }
      rig.group.visible = true;
      rig.group.position.set(unit.pos.x * CELL, 0, unit.pos.y * CELL);
      rig.group.rotation.y = -unit.heading;
      // Wheels roll over the cumulative walked distance; frozen when k = 0.
      const roll = (unit.wheelTurns * CELL) / TRUCK.wheelR;
      for (const wheel of rig.wheels) wheel.rotation.z = -roll;
      // Cargo box strictly from the real ledger; partial loads read smaller.
      const carrying = unit.cargo > 0;
      rig.cargo.visible = carrying;
      if (carrying) {
        const fill = unit.capacity > 0 ? Math.min(1, Math.max(0.3, unit.cargo / unit.capacity)) : 1;
        rig.cargo.scale.set(TRUCK.cargoL * fill, TRUCK.cargoH, TRUCK.cargoW);
      }
      // Lift platform + cargo rise together while a real timer runs.
      const bedY = TRUCK.groundY + TRUCK.wheelR + TRUCK.chassisH;
      const rise = unit.lift * TRUCK.liftH;
      rig.lift.position.y = bedY + 0.4 + rise;
      rig.cargo.position.y = bedY + 0.8 + TRUCK.cargoH / 2 + rise;
      const braking = !unit.moving && unit.stage !== "parked";
      for (const lamp of rig.brakes) lamp.visible = braking;
    }
  }

  /** Numeric fleet accessor for the evidence harness (stageReport precedent). */
  fleetReport(): { tick: number; units: readonly FleetUnit[]; visibleRigs: number } {
    return {
      tick: this.lastFleet.tick,
      units: this.lastFleet.units,
      visibleRigs: this.trucks.filter((r) => r.group.visible).length,
    };
  }

  /** Push one immutable snapshot + camera + view into the world. No state is mutated. */
  sync(state: SimState, camera: Camera, view: ViewState, opts: WorldSyncOptions): void {
    if (this.disposed || this.contextLost) return;
    this.cam = camera;
    if (view.width !== this.view.width || view.height !== this.view.height) this.resize(view);
    this.syncCamera(camera);
    this.syncBatches(state.machines);
    this.updateInstances(state.machines, opts.selected);
    this.updateDrones(state, opts);
    this.updateFleet();
    this.grid.visible = true;
  }

  /** Render one frame. The caller gates this on document.hidden (hidden-tab pause). */
  render(): void {
    if (this.disposed || this.contextLost) return;
    this.renderer.render(this.scene, this.camera3);
  }

  private pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [this.wreck, this.dock];
    for (const batch of this.batches.values()) list.push(batch.mesh);
    return list;
  }

  /** Raycast selection: the nearest pickable body under a canvas-local CSS pixel.
   * The pick path itself is cameraRig.castPick — shared with the unit suite. */
  pick(sx: number, sy: number): PickResult | null {
    if (this.disposed || this.contextLost) return null;
    return castPick(this.raycaster, this.camera3, this.view, sx, sy, this.pickables());
  }

  /** The ground-plane point under a pixel — agrees with projection.screenToWorld. */
  pickGround(sx: number, sy: number): { x: number; y: number } | null {
    if (this.disposed || this.contextLost) return null;
    return castGround(this.raycaster, this.camera3, this.view, sx, sy, this.ground);
  }

  /** The ground point a machine/wreck/dock body projects to, for selection-latency checks. */
  projectWorld(x: number, y: number, z: number): { x: number; y: number } {
    return projectToScreen(this.camera3, this.view, x, y, z);
  }

  stats(): { calls: number; triangles: number; archetypes: number; instances: number; drones: number } {
    let instances = 0;
    for (const batch of this.batches.values()) instances += batch.mesh.count;
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      archetypes: this.batches.size,
      instances,
      drones: this.drones.filter((d) => d.visible).length,
    };
  }

  /** The last synced camera/view, for the bench harness' numeric checks. */
  cameraState(): { camera: Camera; view: ViewState } {
    return { camera: this.cam, view: this.view };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    for (const batch of this.batches.values()) {
      batch.mesh.dispose();
      (batch.mesh.material as THREE.Material).dispose();
    }
    this.batches.clear();
    for (const d of this.drones) (d.material as THREE.Material).dispose();
    this.drones = [];
    for (const rig of this.trucks) {
      rig.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) (obj.material as THREE.Material).dispose();
      });
    }
    this.trucks = [];
    this.unitBox.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    (this.wreck.material as THREE.Material).dispose();
    (this.dock.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}

/** Re-exported so the bench harness can assert the flight parameter without importing scene. */
export { droneLeg, TUNING };