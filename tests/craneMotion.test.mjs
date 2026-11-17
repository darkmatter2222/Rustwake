/**
 * ART-06 (#352): crane mechanical lift-cycle regression suite.
 * Replaces the legacy decorative endless slew oscillation
 * (world.js `rotation.y = Math.sin(time*.24)*.34`) with a named pivot hierarchy
 * (slew/boom -> trolley -> hoist cable -> hook) driven by a deterministic phased
 * state machine. Tests the REAL src/world.js geometry + the exported pure pose
 * function and the shared runtime application path — no pixels, no mocks of the
 * crane itself. Negative controls pin the legacy spin, cargo teleport and
 * reduced-motion requirements. The #307 camera method bodies are hash-guarded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as THREE from "three";
import {CELL, WORLD_SIZE} from "../src/content.js";
import {worldFootprint} from "../src/gridOccupancy.js";
import {MATERIALS, machineDescriptor} from "../src/voxelSchema.js";

// world.js textPanel needs a canvas; stub the 2D context (geometry tests never read pixels).
globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {makeBuilding, cranePose, applyCranePose, CRANE_PHASES, CRANE_CYCLE_TOTAL, CRANE_LIMITS} =
  await import("../src/world.js");

const L = CRANE_LIMITS;
const buildCrane = () => makeBuilding({id: 5, type: "crane", x: 15, z: 5, rot: 0, remaining: 0}, 0);
const craneParts = () => buildCrane().parts.find(p => p.kind === "crane");
// World-space measurements need authored local space: reset the #370 footprint
// transform exactly like tests/voxelSchema.test.mjs does.
const cranePartsLocal = () => {
  const {group, parts} = buildCrane();
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1);
  return parts.find(p => p.kind === "crane");
};
// Independent re-implementation of the declared easing math (smoothstep + lerp).
const ease = u => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
const phaseStarts = [];
{let acc = 0; for (const p of CRANE_PHASES) {phaseStarts.push(acc); acc += p.dur;}}

test("named crane pivot hierarchy exists: slew/boom root, trolley, hoist, hook, cable", () => {
  const {group, parts} = buildCrane();
  const slew = group.getObjectByName("pivot:crane");
  const trolley = group.getObjectByName("pivot:crane:trolley");
  const hoist = group.getObjectByName("pivot:crane:hoist");
  const hook = group.getObjectByName("pivot:crane:hook");
  assert.ok(slew && trolley && hoist && hook, "all four named pivots must exist");
  for (const n of [slew, trolley, hoist, hook]) assert.ok(n.isGroup, n.name + " must be a THREE.Group");
  assert.equal(slew.parent, group, "slew root belongs to the building group");
  assert.equal(trolley.parent, slew, "trolley travels on the slew/boom pivot");
  assert.equal(hoist.parent, trolley, "hoist rides the trolley");
  assert.equal(hook.parent, hoist, "hook rides the hoist cable end");
  assert.deepEqual([...slew.position], [0, 5.1, 0], "schema pivot offset preserved");
  const p = parts.find(q => q.kind === "crane");
  assert.equal(p.node, slew); assert.equal(p.trolley, trolley);
  assert.equal(p.hoist, hoist); assert.equal(p.hook, hook);
  assert.ok(p.cable.isMesh && p.cable.parent === hoist, "cable mesh is hoist-owned");
  assert.ok(hook.children.some(c => c.isMesh), "hook block is part of the crane, not cargo");
  // ART-01 schema ownership is intact: the declared pivot node still resolves.
  assert.deepEqual(group.userData.voxel.pivots, ["pivot:crane"]);
});

test("phase table is the declared 10-stage lift cycle with exact durations", () => {
  assert.deepEqual(CRANE_PHASES.map(p => p.name), [
    "travel-out", "lower", "hook-dwell", "raise", "travel-in",
    "slew-to-drop", "lower-drop", "release-dwell", "raise-drop", "slew-back"
  ]);
  assert.deepEqual(CRANE_PHASES.map(p => p.dur), [3, 3, 1.6, 3, 3, 2.4, 2.6, 1.6, 2.6, 2.4]);
  assert.ok(Math.abs(CRANE_CYCLE_TOTAL - 25.2) < 1e-9, "cycle total " + CRANE_CYCLE_TOTAL);
  assert.deepEqual({...L}, {trolleyMin: .7, trolleyMax: 4.35, dropMin: .45, dropMax: 3.2, dropRelease: 2.6, slewDrop: -.6});
});

test("cycle starts at the home pose and phases advance deterministically at exact boundaries", () => {
  const p0 = cranePose(0);
  assert.equal(p0.phase, "travel-out"); assert.equal(p0.index, 0);
  assert.equal(p0.slew, 0); assert.equal(p0.trolley, L.trolleyMin); assert.equal(p0.drop, L.dropMin);
  const EPS = 1e-6;
  for (let i = 0; i < CRANE_PHASES.length; i++) {
    const at = cranePose(phaseStarts[i] + EPS);
    assert.equal(at.phase, CRANE_PHASES[i].name, "boundary " + i);
    assert.equal(at.index, i);
    assert.ok(at.progress >= 0 && at.progress < 1e-4, "progress resets at phase start");
    const before = cranePose(phaseStarts[i] - EPS);
    assert.equal(before.phase, CRANE_PHASES[(i + CRANE_PHASES.length - 1) % CRANE_PHASES.length].name);
  }
});

test("mid-phase poses match independent smoothstep math EXACTLY (expected/actual)", () => {
  const expectedFor = (name, u) => {
    let slew = 0, trolley = L.trolleyMin, drop = L.dropMin;
    switch (name) {
      case "travel-out": trolley = lerp(L.trolleyMin, L.trolleyMax, u); break;
      case "lower": trolley = L.trolleyMax; drop = lerp(L.dropMin, L.dropMax, u); break;
      case "hook-dwell": trolley = L.trolleyMax; drop = L.dropMax; break;
      case "raise": trolley = L.trolleyMax; drop = lerp(L.dropMax, L.dropMin, u); break;
      case "travel-in": trolley = lerp(L.trolleyMax, L.trolleyMin, u); break;
      case "slew-to-drop": slew = lerp(0, L.slewDrop, u); break;
      case "lower-drop": slew = L.slewDrop; drop = lerp(L.dropMin, L.dropRelease, u); break;
      case "release-dwell": slew = L.slewDrop; drop = L.dropRelease; break;
      case "raise-drop": slew = L.slewDrop; drop = lerp(L.dropRelease, L.dropMin, u); break;
      case "slew-back": slew = lerp(L.slewDrop, 0, u); break;
    }
    return {slew, trolley, drop};
  };
  for (let i = 0; i < CRANE_PHASES.length; i++) {
    for (const f of [.25, .5, .75]) {
      const t = phaseStarts[i] + CRANE_PHASES[i].dur * f;
      const pose = cranePose(t);
      assert.equal(pose.phase, CRANE_PHASES[i].name);
      // progress round-trips through (t-acc)/dur: agree with the requested fraction
      // to 1e-12, then the eased pose must match the independent math BIT-EXACTLY.
      assert.ok(Math.abs(pose.progress - f) < 1e-12, "progress at " + CRANE_PHASES[i].name + " u=" + f);
      const want = expectedFor(CRANE_PHASES[i].name, ease(pose.progress));
      assert.equal(pose.slew, want.slew, CRANE_PHASES[i].name + " slew at u=" + f);
      assert.equal(pose.trolley, want.trolley, CRANE_PHASES[i].name + " trolley at u=" + f);
      assert.equal(pose.drop, want.drop, CRANE_PHASES[i].name + " drop at u=" + f);
    }
  }
});

test("cycle is periodic: pose(t) == pose(t+TOTAL) == pose(t+2*TOTAL) within 1e-12", () => {
  // Same time input is bit-deterministic; period shifts agree to 1e-12 because
  // IEEE modulo of t+k*TOTAL rounds the phase fraction in the last ulp.
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, msg + ": " + a + " vs " + b);
  // Samples sit strictly inside phases: an exact boundary time can round to either
  // side under IEEE modulo (boundary semantics are pinned by the boundary test).
  for (const t of [0, .3, 3.001, 6.1, 13.601, 16.001, 20.5, 25.199]) {
    const a = cranePose(t), b = cranePose(t + CRANE_CYCLE_TOTAL), c = cranePose(t + 2 * CRANE_CYCLE_TOTAL);
    assert.equal(a.phase, b.phase); assert.equal(a.phase, c.phase);
    assert.equal(a.index, b.index); assert.equal(a.index, c.index);
    for (const k of ["slew", "trolley", "drop"]) {
      near(a[k], b[k], k + " at t=" + t + " +1 cycle");
      near(a[k], c[k], k + " at t=" + t + " +2 cycles");
    }
    assert.deepEqual(cranePose(t), cranePose(t), "identical input is bit-identical");
  }
  // Negative time is handled deterministically too (no NaN, same periodic orbit).
  const n = cranePose(-3.7), m = cranePose(n.cycleT);
  assert.ok(Number.isFinite(n.slew) && Number.isFinite(n.trolley) && Number.isFinite(n.drop));
  assert.equal(n.phase, m.phase);
  for (const k of ["slew", "trolley", "drop"]) near(n[k], m[k], k + " negative-time wrap");
});

test("60s sweep: all 10 phases visited in order, motion continuous (no teleport), values bounded", () => {
  const STEP = .05, seen = new Set(), order = [];
  let prev = null, maxTrolley = 0, maxDrop = 0, maxSlew = 0;
  const p = cranePartsLocal();
  const hookWorld = new THREE.Vector3();
  let prevHook = null, maxHook = 0;
  for (let t = 0; t <= 60 + 1e-9; t += STEP) {
    const pose = cranePose(t);
    seen.add(pose.phase);
    if (!order.length || order[order.length - 1] !== pose.phase) order.push(pose.phase);
    assert.ok(pose.trolley >= L.trolleyMin && pose.trolley <= L.trolleyMax, "trolley bounded");
    assert.ok(pose.drop >= L.dropMin && pose.drop <= L.dropMax, "drop bounded");
    assert.ok(pose.slew >= L.slewDrop && pose.slew <= 0, "slew bounded");
    // Mechanical linkage on REAL nodes: hook world position must follow the pose.
    applyCranePose(p, pose);
    p.node.parent.updateWorldMatrix(true, true);
    p.hook.getWorldPosition(hookWorld);
    const ex = pose.trolley * Math.cos(pose.slew), ez = -pose.trolley * Math.sin(pose.slew);
    assert.ok(Math.abs(hookWorld.x - ex) < 1e-9, "hook x follows slew rotation");
    assert.ok(Math.abs(hookWorld.z - ez) < 1e-9, "hook z follows slew rotation");
    assert.ok(Math.abs(hookWorld.y - (4.59 - pose.drop)) < 1e-9, "hook y = boom - trolley - hoist - cable");
    if (prev) {
      maxTrolley = Math.max(maxTrolley, Math.abs(pose.trolley - prev.trolley));
      maxDrop = Math.max(maxDrop, Math.abs(pose.drop - prev.drop));
      maxSlew = Math.max(maxSlew, Math.abs(pose.slew - prev.slew));
      maxHook = Math.max(maxHook, hookWorld.distanceTo(prevHook));
    }
    prev = pose; prevHook = hookWorld.clone();
  }
  assert.equal(seen.size, 10, "every phase observed within 60s: " + [...seen].join(","));
  // Phase order must follow the declared cyclic table (wrap allowed).
  const names = CRANE_PHASES.map(q => q.name);
  for (let i = 1; i < order.length; i++) {
    const a = names.indexOf(order[i - 1]), b = names.indexOf(order[i]);
    assert.equal(b, (a + 1) % names.length, "phase order " + order[i - 1] + " -> " + order[i]);
  }
  // Max speeds: trolley 3.65*1.5/3, drop 2.75*1.5/3, slew .6*1.5/2.4 (smoothstep peak 1.5).
  // Per 0.05s step with 2x margin — a teleporting load would exceed these by orders.
  assert.ok(maxTrolley < .2, "trolley step " + maxTrolley);
  assert.ok(maxDrop < .16, "drop step " + maxDrop);
  assert.ok(maxSlew < .045, "slew step " + maxSlew);
  assert.ok(maxHook < .25, "hook world step " + maxHook);
  assert.ok(maxTrolley > .05 && maxDrop > .03 && maxSlew > .01, "motion actually happens");
});

test("NEGATIVE: not the legacy endless sinusoidal slew; trolley and cable genuinely move", () => {
  const legacy = t => Math.sin(t * .24) * .34; // the exact removed world.js line
  // Legacy spins immediately; the lift cycle holds slew at exactly 0 through the
  // whole first pick sequence (t in [0, 13.6]) while the trolley travels out.
  for (const t of [.5, 1, 2, 5, 9, 13.5]) {
    assert.equal(cranePose(t).slew, 0, "slew must dwell at 0 during pick sequence, t=" + t);
    assert.notEqual(legacy(t), 0, "legacy control is non-zero here (proves the difference)");
  }
  assert.ok(cranePose(1.5).trolley > L.trolleyMin, "trolley travels while legacy slew would spin");
  assert.ok(cranePose(4.5).drop > L.dropMin, "cable lowers (legacy never moved a cable)");
  // The cycle dwells at EXACT end stops — a sinusoid never rests at its extremes.
  const dwell = cranePose(phaseStarts[7] + .8); // release-dwell midpoint
  assert.equal(dwell.slew, L.slewDrop); assert.equal(dwell.drop, L.dropRelease);
  const home = cranePose(phaseStarts[2] + .8); // hook-dwell midpoint
  assert.equal(home.drop, L.dropMax); assert.equal(home.trolley, L.trolleyMax);
  const back = cranePose(phaseStarts[9] + 1.2); // slew-back midpoint
  assert.equal(back.slew, lerp(L.slewDrop, 0, ease(back.progress)));
  assert.ok(back.slew < 0 && back.slew > L.slewDrop, "slew is mid-return, not dwelling");
  assert.ok(Math.abs(cranePose(CRANE_CYCLE_TOTAL - 1e-9).slew) < 1e-6, "slew homes to ~0 at cycle end");
  // Slew is not a sinusoid of time: it is piecewise with exact dwells.
  assert.equal(cranePose(phaseStarts[5] + 1.2).slew, lerp(0, L.slewDrop, ease(cranePose(phaseStarts[5] + 1.2).progress)));
});

test("NEGATIVE: no fake cargo — hook assembly is crane-owned and can never teleport", () => {
  const {group} = buildCrane();
  let cargoNodes = 0, meshCount = 0;
  group.traverse(n => {
    if (n.name === "cargo" || n.userData.cargo) cargoNodes++;
    if (n.isMesh && n.name !== "pick:volume") meshCount++;
  });
  assert.equal(cargoNodes, 0, "crane must not spawn cargo implying production");
  assert.ok(meshCount > 0);
  const p = craneParts();
  // Across the whole cycle the hook pivot sits EXACTLY at the cable end and the
  // cable spans exactly trolley->hook: no independent load transform exists.
  for (let t = 0; t < CRANE_CYCLE_TOTAL; t += .37) {
    const pose = cranePose(t);
    applyCranePose(p, pose);
    assert.equal(p.hook.position.y, -p.cable.scale.y, "hook rides cable end exactly");
    assert.equal(p.cable.position.y - p.cable.scale.y / 2, p.hook.position.y, "cable bottom == hook anchor");
    assert.ok(p.cable.scale.y >= L.dropMin, "cable never collapses to zero");
    assert.equal(p.node.userData.cranePhase, pose.phase);
  }
  // Hook block meshes stay children of the hook pivot at every pose (crane-owned).
  for (const c of p.hook.children) assert.equal(c.parent, p.hook);
});

test("reduced motion: static parked pose at every time, on real pivots", () => {
  const times = [0, 1, 7.3, 25.2, 60, 12345.678];
  const first = cranePose(times[0], true);
  assert.equal(first.phase, "parked"); assert.equal(first.reduced, true);
  assert.equal(first.slew, 0); assert.equal(first.trolley, L.trolleyMin); assert.equal(first.drop, L.dropMin);
  const p = craneParts();
  applyCranePose(p, first);
  const snapshot = () => [p.node.rotation.y, p.trolley.position.x, p.hook.position.y, p.cable.scale.y, p.cable.position.y];
  const base = snapshot();
  for (const t of times) {
    const pose = cranePose(t, true);
    assert.deepEqual({...pose}, {...first}, "reduced pose invariant at t=" + t);
    applyCranePose(p, pose);
    assert.deepEqual(snapshot(), base, "real pivot transforms static at t=" + t);
  }
});

test("applyCranePose drives the real THREE pivots exactly (shared runtime path)", () => {
  const p = craneParts();
  for (const t of [0, 1.7, 4.2, 8, 12.9, 15.5, 18.2, 21, 24.9]) {
    const pose = cranePose(t);
    applyCranePose(p, pose);
    assert.equal(p.node.rotation.y, pose.slew);
    assert.equal(p.trolley.position.x, pose.trolley);
    assert.equal(p.hook.position.y, -pose.drop);
    assert.equal(p.cable.scale.y, pose.drop);
    assert.equal(p.cable.position.y, -pose.drop / 2);
    assert.equal(p.node.userData.cranePhase, pose.phase);
  }
});

test("worst-case animated envelope: above ground, inside pick height and declared reach", () => {
  const {group, parts} = buildCrane();
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1);
  const p = parts.find(q => q.kind === "crane");
  // Force the deepest hook pose at full trolley reach and full slew.
  applyCranePose(p, {...cranePose(0), slew: L.slewDrop, trolley: L.trolleyMax, drop: L.dropMax});
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3(), animated = new THREE.Box3();
  group.traverse(n => {
    if (!n.isMesh || n.name === "pick:volume") return;
    box.expandByObject(n);
    for (let a = n.parent; a; a = a.parent) if (a.name?.startsWith("pivot:")) {animated.expandByObject(n); break;}
  });
  const size = box.getSize(new THREE.Vector3());
  assert.ok(box.min.y >= 0, "nothing dips below ground: minY=" + box.min.y);
  // The static foundation pad legitimately sits at y=0; the ANIMATED hook tip is
  // the lowest moving part and must park ~0.51 above ground at full payout.
  assert.ok(Math.abs(animated.min.y - .51) < .02, "max-drop hook tip parks ~0.51 above ground: " + animated.min.y);
  assert.ok(box.max.y <= 5.6 + 1e-9, "animated top inside pick height 5.6: " + box.max.y);
  assert.ok(size.x / 2 <= 4.8 + .02 && size.z / 2 <= 4.8 + .02, "reach within declared swingRadius 4.8");
});

test("selection ownership unchanged: pick volume, footprint transform, ports, palette, budget", () => {
  const desc = machineDescriptor("crane");
  for (const rot of [0, 1, 2, 3]) {
    const {group} = makeBuilding({id: 5, type: "crane", x: 15, z: 5, rot, remaining: 0}, 0);
    const wf = worldFootprint("crane", 15, 5, rot);
    assert.deepEqual([...group.scale], [wf.base.w, 1, wf.base.d]);
    assert.equal(group.position.x, wf.pivot.x); assert.equal(group.position.z, wf.pivot.z);
    assert.equal(group.rotation.y, wf.rotationY);
    assert.equal(group.userData.buildingId, 5);
    const pick = group.getObjectByName("pick:volume");
    assert.deepEqual([...pick.scale], desc.pick.size);
    assert.deepEqual([...pick.position], desc.pick.center);
    assert.equal(pick.material.visible, false);
    assert.ok(group.getObjectByName("port:loading-bay"));
    assert.ok(group.getObjectByName("status:light"));
  }
  // Exact post-rebuild budget: 27 visible meshes, 324 triangles (all unit boxes).
  const {group} = makeBuilding({id: 5, type: "crane", x: 15, z: 5, rot: 0, remaining: 0}, 0);
  let meshes = 0, triangles = 0;
  const legal = new Set(Object.values(MATERIALS).map(m => new THREE.Color(m.color).getHex()));
  group.traverse(n => {
    if (!n.isMesh || n.name === "pick:volume" || !n.material.visible) return;
    meshes++;
    const g = n.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    assert.ok(legal.has(n.material.color.getHex()), "unregistered material on " + n.name);
  });
  assert.equal(meshes, 27); assert.equal(triangles, 324);
  assert.ok(meshes <= desc.budget.maxMeshes && triangles <= desc.budget.maxTriangles);
});

test("#307 camera invariants: applyCamera/stampCamera method bodies byte-identical (sha256-16)", () => {
  const src = fs.readFileSync(new URL("../src/world.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const method = name => {
    const start = src.indexOf(name + "(){");
    assert.ok(start >= 0, name + " missing");
    let depth = 0, j = src.indexOf("{", start);
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {depth--; if (depth === 0) {j++; break;}}
    }
    return src.slice(start, j);
  };
  const hash = name => crypto.createHash("sha256").update(" " + method(name)).digest("hex").slice(0, 16);
  assert.equal(hash("applyCamera"), "f3afa5479a66b97e", "applyCamera body drifted");
  assert.equal(hash("stampCamera"), "691b3c0a3480e97b", "stampCamera body drifted");
  // Isometric defaults and synchronous stamp call remain in place.
  assert.ok(src.includes("yaw:45,elevation:35.264"), "isometric default view");
  assert.ok(method("applyCamera").includes("this.stampCamera();"), "synchronous stamp inside applyCamera");
});
