/**
 * RW3D T10 (#137): three.js scene layer for mechanical building assembly.
 *
 * Renders the pure poses from ../assembly over named kit pivot groups.
 * Boundary contract (architecture README section 1, boundary-3d.test.ts):
 * reads immutable snapshots + the caller's framePhase only; no economy
 * logic, no state writes, no clock reads, no storage. Simulation types
 * would be `import type` only — this layer needs none of them.
 *
 * Instancing tradeoff (architecture section 5): one shared unit box
 * geometry and one material per palette token are reused across every
 * building; per-building named groups are kept because assembly animates
 * individual pivots. At P1 scale (tens of buildings) this is cheap; full
 * instanced batching of static kit parts is a P02 (#151) concern.
 */
import * as THREE from "three";
import {
  ASSEMBLY_STAGES,
  assemblyStageAt,
  partAssemblyPose,
  upgradeModulesFor,
  type AssemblyBuildingSnapshot,
  type AssemblySnapshot,
  type BuildingStageReport,
} from "../assembly";
import { KIT_GEOMETRY, KIT_PALETTE, type KitMaterialToken } from "../kitGeometry";

/** Idle mechanism recipes; phase comes from (snapshot.tick + framePhase). */
interface IdleSpec {
  readonly kind: "spin" | "oscillate" | "lift";
  readonly axis: "x" | "y" | "z";
  readonly periodTicks: number;
  readonly amplitude: number;
}

const IDLE_GROUPS: Readonly<Record<string, IdleSpec>> = {
  ventFan: { kind: "spin", axis: "y", periodTicks: 17, amplitude: 0 },
  fan: { kind: "spin", axis: "z", periodTicks: 12, amplitude: 0 },
  shaft: { kind: "spin", axis: "x", periodTicks: 24, amplitude: 0 },
  roller: { kind: "spin", axis: "x", periodTicks: 9, amplitude: 0 },
  roller2: { kind: "spin", axis: "x", periodTicks: 9, amplitude: 0 },
  magnet: { kind: "lift", axis: "y", periodTicks: 20, amplitude: 0.06 },
  palletLift: { kind: "lift", axis: "y", periodTicks: 40, amplitude: 0.35 },
  slew: { kind: "oscillate", axis: "y", periodTicks: 60, amplitude: 0.4 },
  yaw: { kind: "oscillate", axis: "y", periodTicks: 48, amplitude: 0.3 },
  pitch: { kind: "oscillate", axis: "x", periodTicks: 36, amplitude: 0.15 },
};

export interface AssemblyViewOptions {
  readonly reducedMotion: boolean;
  /** Sub-tick phase in [0,1), supplied by the caller (never read here). */
  readonly framePhase: number;
}

export interface ObservedGroupTransform {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
}

export interface ObservedBuildingReport extends BuildingStageReport {
  readonly groups: readonly string[];
  readonly idleGroups: readonly ObservedGroupTransform[];
}

interface BuildingRecord {
  signature: string;
  snapshot: AssemblyBuildingSnapshot;
  group: THREE.Group;
  kitGroups: Map<string, THREE.Group>;
  parts: Map<string, THREE.Mesh>;
  modules: THREE.Mesh[];
}

function signatureOf(b: AssemblyBuildingSnapshot): string {
  return `${b.asset}|${b.cell.x}|${b.cell.y}|${b.rotation}|${b.level}`;
}

function rotatedSize(footprint: readonly [number, number], rotation: number): [number, number] {
  const [w, d] = footprint;
  return rotation === 90 || rotation === 270 ? [d, w] : [w, d];
}

export class AssemblyView {
  readonly root: THREE.Group;
  private readonly unitBox: THREE.BoxGeometry;
  private readonly materials: Map<KitMaterialToken, THREE.MeshLambertMaterial>;
  private readonly records: Map<number, BuildingRecord>;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = "assemblyRoot";
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.materials = new Map();
    for (const token of Object.keys(KIT_PALETTE) as KitMaterialToken[]) {
      this.materials.set(token, new THREE.MeshLambertMaterial({ color: KIT_PALETTE[token] }));
    }
    this.records = new Map();
  }

  /**
   * Reconcile the scene to the snapshot. Rebuilds a building only when its
   * identity/level changes; progress and phase updates are transform-only.
   * Never mutates the snapshot.
   */
  sync(snapshot: AssemblySnapshot, opts: AssemblyViewOptions): void {
    const live = new Set<number>();
    for (const b of snapshot.buildings) {
      live.add(b.id);
      let rec = this.records.get(b.id);
      const sig = signatureOf(b);
      if (rec === undefined || rec.signature !== sig) {
        if (rec !== undefined) this.removeRecord(rec);
        rec = this.buildRecord(b);
        this.records.set(b.id, rec);
      }
      rec.snapshot = b;
      this.updateRecord(rec, snapshot.tick, opts);
    }
    for (const [id, rec] of [...this.records]) {
      if (!live.has(id)) {
        this.removeRecord(rec);
        this.records.delete(id);
      }
    }
  }

  private buildRecord(b: AssemblyBuildingSnapshot): BuildingRecord {
    const geo = KIT_GEOMETRY[b.asset];
    const group = new THREE.Group();
    group.name = `building-${b.id}-${b.asset}`;
    const [rw, rd] = rotatedSize(geo.footprint, b.rotation);
    group.position.set(b.cell.x + rw / 2, 0, b.cell.y + rd / 2);
    // World convention: positive yaw takes +Z toward +X (geometry.ts).
    group.rotation.y = (b.rotation * Math.PI) / 180;

    const kitGroups = new Map<string, THREE.Group>();
    for (const g of geo.groups) {
      const node = new THREE.Group();
      node.name = g.name;
      node.position.set(g.position[0], g.position[1], g.position[2]);
      const parent = g.parent === "root" ? group : kitGroups.get(g.parent);
      if (parent === undefined) {
        throw new Error(`kit group ${g.name} references unknown parent ${g.parent}`);
      }
      parent.add(node);
      kitGroups.set(g.name, node);
    }

    const parts = new Map<string, THREE.Mesh>();
    for (const p of geo.parts) {
      const material = this.materials.get(p.material);
      if (material === undefined) throw new Error(`unknown kit material ${p.material}`);
      const mesh = new THREE.Mesh(this.unitBox, material);
      mesh.name = p.name;
      mesh.scale.set(p.size[0], p.size[1], p.size[2]);
      mesh.position.set(p.center[0], p.center[1], p.center[2]);
      const parent = p.parent === "root" ? group : kitGroups.get(p.parent);
      if (parent === undefined) {
        throw new Error(`kit part ${p.name} references unknown parent ${p.parent}`);
      }
      parent.add(mesh);
      parts.set(p.name, mesh);
    }

    const modules: THREE.Mesh[] = [];
    for (const m of upgradeModulesFor(b.asset, b.level)) {
      const material = this.materials.get(m.material);
      if (material === undefined) throw new Error(`unknown module material ${m.material}`);
      const mesh = new THREE.Mesh(this.unitBox, material);
      mesh.name = m.name;
      mesh.scale.set(m.size[0], m.size[1], m.size[2]);
      mesh.position.set(m.center[0], m.center[1], m.center[2]);
      group.add(mesh);
      modules.push(mesh);
    }

    this.root.add(group);
    return { signature: signatureOf(b), snapshot: b, group, kitGroups, parts, modules };
  }

  private updateRecord(rec: BuildingRecord, tick: number, opts: AssemblyViewOptions): void {
    const b = rec.snapshot;
    const geo = KIT_GEOMETRY[b.asset];
    for (const p of geo.parts) {
      const mesh = rec.parts.get(p.name);
      if (mesh === undefined) continue;
      const pose = partAssemblyPose(b.asset, p.name, b.progressTicks, b.durationTicks, opts.reducedMotion);
      mesh.visible = pose.visible;
      mesh.position.set(p.center[0] + pose.dx, p.center[1] + pose.dy, p.center[2] + pose.dz);
      mesh.scale.set(p.size[0], p.size[1] * pose.sy, p.size[2]);
    }

    // Idle mechanisms run only on completed buildings, never under reduced
    // motion. Phase is (tick + framePhase): deterministic, no clock reads.
    const completed = assemblyStageAt(b.progressTicks, b.durationTicks).done;
    const phase = Math.min(1, Math.max(0, opts.framePhase));
    for (const [name, node] of rec.kitGroups) {
      const spec = IDLE_GROUPS[name];
      const kit = geo.groups.find((g) => g.name === name);
      if (kit === undefined) continue;
      node.position.set(kit.position[0], kit.position[1], kit.position[2]);
      node.rotation.set(0, 0, 0);
      if (spec === undefined || !completed || opts.reducedMotion) continue;
      const u = (((tick + phase) % spec.periodTicks) + spec.periodTicks) % spec.periodTicks / spec.periodTicks;
      const angle = 2 * Math.PI * u;
      if (spec.kind === "spin") {
        node.rotation[spec.axis] = angle;
      } else if (spec.kind === "oscillate") {
        node.rotation[spec.axis] = spec.amplitude * Math.sin(angle);
      } else {
        node.position[spec.axis] = kit.position[1] + (spec.amplitude * (1 - Math.cos(angle))) / 2;
      }
    }
  }

  private removeRecord(rec: BuildingRecord): void {
    this.root.remove(rec.group);
    // Geometry/materials are shared; only the scene graph is per-building.
    rec.group.clear();
    rec.kitGroups.clear();
    rec.parts.clear();
    rec.modules.length = 0;
  }

  /**
   * Numerical report observed from the live scene graph (mesh.visible and
   * group transforms), for headless motion evidence and QA.
   */
  stageReport(): ObservedBuildingReport[] {
    const out: ObservedBuildingReport[] = [];
    for (const rec of [...this.records.values()].sort((a, b) => a.snapshot.id - b.snapshot.id)) {
      const b = rec.snapshot;
      const st = assemblyStageAt(b.progressTicks, b.durationTicks);
      let visibleParts = 0;
      for (const mesh of rec.parts.values()) if (mesh.visible) visibleParts += 1;
      const idleGroups: ObservedGroupTransform[] = [];
      for (const [name, node] of rec.kitGroups) {
        if (IDLE_GROUPS[name] === undefined) continue;
        idleGroups.push({
          name,
          position: [node.position.x, node.position.y, node.position.z],
          rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
        });
      }
      out.push({
        id: b.id,
        asset: b.asset,
        stage: st.stage,
        stageName: st.name,
        done: st.done,
        visibleParts,
        totalParts: rec.parts.size,
        upgradeModules: rec.modules.length,
        groups: [...rec.kitGroups.keys()],
        idleGroups,
      });
    }
    return out;
  }

  /** Shared-resource accounting for the instancing tradeoff evidence. */
  resourceCounts(): { geometries: number; materials: number; meshes: number } {
    let meshes = 0;
    for (const rec of this.records.values()) meshes += rec.parts.size + rec.modules.length;
    return { geometries: 1, materials: this.materials.size, meshes };
  }

  dispose(): void {
    for (const rec of [...this.records.values()]) this.removeRecord(rec);
    this.records.clear();
    this.unitBox.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
  }
}

/** Re-export for harness convenience (stage names are evidence vocabulary). */
export { ASSEMBLY_STAGES };
