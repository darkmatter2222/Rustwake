import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * T15 (#142): unit-rig production contracts (V04/V06, ART_AND_MOTION vehicle
 * and worker rows). Pins the authored kit data directly: dedicated animatable
 * mechanism groups (doors/wheels/forks/rotors/hoist), cargo envelopes against
 * bays and worker scale, T04 baseline pivot inheritance, and channel
 * well-formedness. The deep numerical proofs (scene-graph motion isolation,
 * quantum discipline, direction semantics) live in validator section S8
 * (scripts/rw3d-kit-validate.mjs), gated by rw3d-t09-kit.test.ts.
 *
 * NON-VISION authoring: capable visual inspection PENDING (G1 #151).
 */
const root = path.resolve(__dirname, "..", "..");
const assetsDir = path.join(root, "docs", "vision", "assets");
const kit = JSON.parse(fs.readFileSync(path.join(assetsDir, "kit.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir, "asset-manifest.json"), "utf8"));
const byId = new Map<string, any>(kit.assets.map((a: any) => [a.id, a]));
const RIGS = ["truck", "forklift", "crane", "drone", "worker"];

// Mechanism -> dedicated pivot group -> clips (mirrors validator S8 registry).
const MECHANISMS: Record<string, Record<string, string[]>> = {
  truck: {
    "door-1": ["door_open-1"],
    door1: ["door_open1"],
    tailgate: ["tailgate_open"],
    body: ["suspension_bounce"],
    cargo: ["load_pallet"],
    "wheel_-1_0": ["wheel_-1_0_roll", "wheel_-1_0_steer"],
    "wheel_1_0": ["wheel_1_0_roll", "wheel_1_0_steer"],
    "wheel_-1_1": ["wheel_-1_1_roll"],
    "wheel_-1_2": ["wheel_-1_2_roll"],
    "wheel_1_1": ["wheel_1_1_roll"],
    "wheel_1_2": ["wheel_1_2_roll"],
  },
  forklift: {
    lift: ["lift_pallet"],
    tilt: ["mast_tilt"],
    forkL: ["fork_spread_L"],
    forkR: ["fork_spread_R"],
    "wheel_-1_0": ["wheel_-1_0_roll"],
    "wheel_1_0": ["wheel_1_0_roll"],
    "wheel_-1_1": ["wheel_-1_1_roll"],
    "wheel_1_1": ["wheel_1_1_roll"],
  },
  crane: {
    slew: ["slew_rotate"],
    hoist: ["hoist_lift", "hoist_place"],
    clawL: ["grip_openL"],
    clawR: ["grip_openR"],
  },
  drone: {
    rotor0: ["rotor0_spin"],
    rotor1: ["rotor1_spin"],
    rotor2: ["rotor2_spin"],
    rotor3: ["rotor3_spin"],
    load: ["cargo_attach"],
  },
  worker: {
    leg1: ["walk_leg"],
    "leg-1": ["walk_leg-1"],
    arm1: ["walk_arm1", "carry_arm1", "operate_arm1", "weld_arm1"],
    "arm-1": ["walk_arm-1", "carry_arm-1"],
  },
};

// Rest-pose group chain position (kit groups carry position only; rest
// rotations are identity, so world offsets are plain sums).
function chainPos(asset: any, groupName: string): number[] {
  const groups = new Map<string, any>(asset.groups.map((g: any) => [g.name, g]));
  const pos = [0, 0, 0];
  let cur: string | undefined = groupName;
  let guard = 0;
  while (cur && cur !== "root" && ++guard < 64) {
    const g = groups.get(cur);
    if (!g) throw new Error(`missing group ${cur}`);
    for (let i = 0; i < 3; i += 1) pos[i] += g.position[i];
    cur = g.parent;
  }
  return pos;
}
function partBounds(asset: any, partName: string) {
  const p = asset.parts.find((x: any) => x.name === partName);
  const base = p.parent === "root" ? [0, 0, 0] : chainPos(asset, p.parent);
  const center = base.map((v, i) => v + p.center[i]);
  return {
    center,
    min: center.map((v, i) => v - p.size[i] / 2),
    max: center.map((v, i) => v + p.size[i] / 2),
    size: p.size,
  };
}
function inSubtree(asset: any, part: any, groupName: string): boolean {
  let cur = part.parent;
  let guard = 0;
  while (cur && cur !== "root" && ++guard < 64) {
    if (cur === groupName) return true;
    cur = asset.groups.find((g: any) => g.name === cur)?.parent;
  }
  return false;
}

describe("rw3d T15 rig contracts (#142)", () => {
  it("marks the five rigs production with visual review pending", () => {
    const entries = new Map<string, any>(manifest.assets.map((m: any) => [m.id, m]));
    const partCounts: Record<string, number> = { crane: 11, truck: 17, forklift: 19, drone: 14, worker: 13 };
    for (const id of RIGS) {
      const m = entries.get(id);
      expect(m, id).toBeTruthy();
      expect(m.status, id).toBe("production");
      expect(m.visualReview, id).toBe("pending");
      expect(m.parts, id).toBe(partCounts[id]);
    }
  });

  it("pins re-authored rig part/group/clip counts", () => {
    const expected: Record<string, [number, number, number]> = {
      crane: [11, 4, 5],
      truck: [17, 11, 13],
      forklift: [19, 8, 8],
      drone: [14, 5, 5],
      worker: [13, 4, 8],
    };
    for (const [id, [parts, groups, anims]] of Object.entries(expected)) {
      const a = byId.get(id);
      expect(a.parts.length, `${id} parts`).toBe(parts);
      expect(a.groups.length, `${id} groups`).toBe(groups);
      expect(a.animations.length, `${id} animations`).toBe(anims);
    }
  });

  it("gives every mechanism a dedicated pivot group carrying geometry", () => {
    for (const [id, mechs] of Object.entries(MECHANISMS)) {
      const a = byId.get(id);
      for (const [group, clips] of Object.entries(mechs)) {
        const g = a.groups.find((x: any) => x.name === group);
        expect(g, `${id}/${group}`).toBeTruthy();
        const geo = a.parts.filter((p: any) => inSubtree(a, p, group));
        expect(geo.length, `${id}/${group} geometry`).toBeGreaterThan(0);
        const got = a.animations.filter((x: any) => x.target === group).map((x: any) => x.name).sort();
        expect(got, `${id}/${group} clips`).toEqual([...clips].sort());
      }
    }
  });

  it("keeps doors/wheels/forks/rotors/hoist separately animatable", () => {
    // Acceptance wording: the named mechanism classes must be DISTINCT groups
    // per rig, never a shared pivot (no balloon scaling, no merged channels).
    const truck = byId.get("truck");
    const doors = truck.animations.filter((a: any) => a.name.startsWith("door_open")).map((a: any) => a.target);
    expect(new Set(doors).size).toBe(2);
    const wheels = truck.animations.filter((a: any) => a.name.endsWith("_roll")).map((a: any) => a.target);
    expect(new Set(wheels).size).toBe(6);
    const forklift = byId.get("forklift");
    const forks = forklift.animations.filter((a: any) => a.name.startsWith("fork_spread")).map((a: any) => a.target);
    expect(new Set(forks).size).toBe(2);
    const drone = byId.get("drone");
    const rotors = drone.animations.filter((a: any) => a.name.endsWith("_spin")).map((a: any) => a.target);
    expect(new Set(rotors).size).toBe(4);
    const crane = byId.get("crane");
    const hoist = crane.animations.filter((a: any) => a.name.startsWith("hoist_")).map((a: any) => a.target);
    expect(new Set(hoist).size).toBe(1); // one hoist mechanism, lift+place channels
    expect(hoist[0]).not.toBe(crane.animations.find((a: any) => a.name === "slew_rotate").target);
  });

  it("preserves T04 baseline pivot positions (rigs animate around them)", () => {
    const pins: Record<string, Record<string, number[]>> = {
      truck: {
        cargo: [0, 0.8, -0.45],
        "wheel_-1_0": [-0.5, 0.3, 0.8], "wheel_-1_1": [-0.5, 0.3, -0.4], "wheel_-1_2": [-0.5, 0.3, -0.95],
        "wheel_1_0": [0.5, 0.3, 0.8], "wheel_1_1": [0.5, 0.3, -0.4], "wheel_1_2": [0.5, 0.3, -0.95],
      },
      forklift: { lift: [0, 0.25, 0.6] },
      crane: { slew: [0, 0.6, 0], hoist: [2.2, 1.2, 0] },
      drone: { rotor0: [-0.6, 0.55, 0], rotor1: [0.6, 0.55, 0], rotor2: [0, 0.55, -0.6], rotor3: [0, 0.55, 0.6] },
      worker: { "leg-1": [-0.07, 0.32, 0], "arm-1": [-0.17, 0.6, 0], leg1: [0.07, 0.32, 0], arm1: [0.17, 0.6, 0] },
    };
    for (const [id, groups] of Object.entries(pins)) {
      const a = byId.get(id);
      for (const [name, pos] of Object.entries(groups)) {
        expect(a.groups.find((g: any) => g.name === name)?.position, `${id}/${name}`).toEqual(pos);
      }
    }
  });

  it("fits cargo envelopes to bays and worker scale", () => {
    const truck = byId.get("truck");
    const pallet = partBounds(truck, "pallet");
    const bed = partBounds(truck, "bed");
    // Pallet rests exactly on the bed and stays inside its footprint.
    expect(pallet.min[1]).toBeCloseTo(bed.max[1], 9);
    expect(pallet.min[0]).toBeGreaterThanOrEqual(bed.min[0] - 1e-9);
    expect(pallet.max[0]).toBeLessThanOrEqual(bed.max[0] + 1e-9);
    expect(pallet.min[2]).toBeGreaterThanOrEqual(bed.min[2] - 1e-9);
    expect(pallet.max[2]).toBeLessThanOrEqual(bed.max[2] + 1e-9);
    const cargoSocket = truck.sockets.find((s: any) => s.name === "cargo");
    expect(pallet.size[0]).toBeLessThanOrEqual(cargoSocket.clearanceWidth);
    // Drone crate is worker-scale and fits the hook socket.
    const drone = byId.get("drone");
    const crate = partBounds(drone, "cargo");
    const hook = drone.sockets.find((s: any) => s.name === "hook");
    const crateMax = Math.max(...crate.size);
    expect(crateMax).toBeLessThanOrEqual(0.85); // SPEC workerHeight
    expect(crateMax).toBeLessThanOrEqual(hook.clearanceWidth);
    // Forklift at full spread engages the truck pallet edges.
    const forklift = byId.get("forklift");
    const spread = forklift.animations.find((a: any) => a.name === "fork_spread_L");
    const fork = forklift.parts.find((p: any) => p.name === "fork-0.25");
    const outerEdge = Math.abs(spread.values[1][0]) + fork.size[0] / 2;
    expect(outerEdge).toBeGreaterThanOrEqual(pallet.size[0] / 2 - 1e-9);
  });

  it("grounds the worker feet and keeps worker scale", () => {
    const worker = byId.get("worker");
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of worker.parts) {
      const b = partBounds(worker, p.name);
      minY = Math.min(minY, b.min[1]);
      maxY = Math.max(maxY, b.max[1]);
    }
    expect(minY).toBeCloseTo(0, 9); // boots ground the feet (T04 float resolved)
    expect(maxY - minY).toBeLessThanOrEqual(0.85 + 0.0625); // workerHeight + tol
  });

  it("keeps rig animation channels well-formed", () => {
    for (const id of RIGS) {
      const a = byId.get(id);
      const groupNames = new Set(a.groups.map((g: any) => g.name));
      for (const an of a.animations) {
        expect(groupNames.has(an.target), `${id}/${an.name} target`).toBe(true);
        expect(["translation", "rotation", "scale"], `${id}/${an.name} path`).toContain(an.path);
        expect(an.values.length, `${id}/${an.name} key count`).toBe(an.times.length);
        for (let i = 1; i < an.times.length; i += 1) {
          expect(an.times[i], `${id}/${an.name} times`).toBeGreaterThan(an.times[i - 1]);
        }
        if (an.path === "rotation") {
          for (const q of an.values) {
            expect(q.length, `${id}/${an.name} quat arity`).toBe(4);
            const norm = Math.hypot(q[0], q[1], q[2], q[3]);
            expect(norm, `${id}/${an.name} unit quat`).toBeCloseTo(1, 6);
          }
        } else {
          for (const v of an.values) expect(v.length, `${id}/${an.name} vec arity`).toBe(3);
        }
      }
    }
  });

  it("loops continuous channels and holds event channels", () => {
    const loopTrue = [
      ["truck", "wheel_-1_0_roll"], ["forklift", "wheel_1_1_roll"],
      ["drone", "rotor0_spin"], ["worker", "walk_leg"], ["worker", "operate_arm1"],
    ];
    const loopFalse = [
      ["truck", "door_open-1"], ["truck", "load_pallet"], ["forklift", "lift_pallet"],
      ["crane", "hoist_place"], ["crane", "slew_rotate"], ["drone", "cargo_attach"], ["worker", "carry_arm1"],
    ];
    for (const [id, name] of loopTrue) {
      expect(byId.get(id).animations.find((a: any) => a.name === name).loop, `${id}/${name}`).toBe(true);
    }
    for (const [id, name] of loopFalse) {
      expect(byId.get(id).animations.find((a: any) => a.name === name).loop, `${id}/${name}`).toBe(false);
    }
  });

  it("preserves kit authoring constants", () => {
    expect(kit.schemaVersion).toBe(1);
    expect(kit.units).toBe("world units; 1 unit = 1 cell, conceptual 2m");
    expect(kit.axes).toBe("right handed Y-up; forward +Z");
    expect(kit.detailQuantum).toBe(0.125);
  });
});
