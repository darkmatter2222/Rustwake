/**
 * ART-07 (#353): varied salvage-yard terrain, roadsides and environmental
 * landmarks. Tests the REAL src/world.js scenery plan/builder/visibility and
 * the src/voxelSchema.js SCENERY contract against the REAL occupancy authority
 * (src/gridOccupancy.js) and simulation (src/simulation.js) — no mocks.
 *
 * Placement contract proven here:
 *  - volumetric interior props stand ONLY on permanently TERRAIN-rejected rock
 *    cells (checkSite negative on every covered surveyed cell, rich tier-2 save);
 *  - exterior landmarks sit beyond the parcel (BOUNDS/UNSURVEYED, immune to any
 *    legal road network);
 *  - flush decals stay below road top and never tint road cells;
 *  - truck sweep (road-cell centers +/- truckHalfWidth) is clear of every prop;
 *  - roadLine paving a rock cell dynamically hides the prop/rubble there, and
 *    clearing the conflict restores the exact base instance matrices;
 *  - a fresh save hides NOTHING; scenery adds zero pick volumes;
 *  - budgets/instancing/material ownership per SCENERY; camera bodies hash-guarded.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import * as THREE from "three";
import {CELL, WORLD_SIZE, INITIAL_BANK, INITIAL_ROADS, STARTER_BUILDINGS} from "../src/content.js";
import {createGame, roadLine, roadPath} from "../src/simulation.js";
import {checkSite, terrainFor, surveyed, inside, footprintCells, bayCells, key, cellOf} from "../src/gridOccupancy.js";
import {SCENERY, SCENERY_AUTHORITY, MATERIALS, PERFORMANCE_LIMITS, validateAllScenery, validateSceneryKind} from "../src/voxelSchema.js";

// world.js textPanel needs a canvas; stub the 2D context (geometry tests never read pixels).
globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {
  yardSceneryPlan, validateSceneryPlan, sceneryConflicts, buildScenery,
  applySceneryVisibility, DEFAULT_YARD_SEED, DRONE_PAD, surfaceTopFor, ghostLift
} = await import("../src/world.js");

const SEEDS = [4073, 1, 777, 9999, 12345, 2026, 31337];
const richGame = (seed = DEFAULT_YARD_SEED) => {
  const g = createGame();
  g.seed = seed;
  g.tier = 2; // all four parcels claimed — the strongest buildable reach
  g.bank = Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 1e9]));
  return g;
};
const origin = i => (i - WORLD_SIZE / 2 + .5) * CELL;

test("SCENERY schema: every kind validates, authority exact, materials owned, budgets under global limits", () => {
  const all = validateAllScenery();
  assert.equal(all.ok, true, JSON.stringify(all.errors));
  assert.equal(SCENERY.authority, "none — decorative yard scenery (#274)");
  assert.equal(SCENERY.decorative, true);
  for (const [kind, desc] of Object.entries(SCENERY.kinds)) {
    assert.equal(desc.authority, SCENERY_AUTHORITY, kind);
    for (const m of desc.materials) assert.ok(MATERIALS[m], kind + " material " + m);
    if (desc.render === "prop") {
      assert.ok(desc.budget.maxMeshes <= PERFORMANCE_LIMITS.maxMeshesPerMachine, kind);
      assert.ok(desc.budget.maxTriangles <= PERFORMANCE_LIMITS.maxTrianglesPerMachine, kind);
    }
  }
  assert.ok(SCENERY.budget.maxPointLights <= PERFORMANCE_LIMITS.pointLightsMax);
  assert.ok(SCENERY.decalMaxHeight < SCENERY.roadTop, "decals must stay below the road slab top");
});

test("SCENERY schema negatives: wrong authority, prop in decal zone, tall decal all rejected", () => {
  const wrong = {...SCENERY.kinds.wreck, authority: "freight — yard logistics (#999)"};
  assert.equal(validateSceneryKind("wreck", wrong).ok, false);
  const zone = {...SCENERY.kinds.wreck, zone: "any-nonroad"};
  assert.equal(validateSceneryKind("wreck", zone).ok, false);
  const tall = {...SCENERY.kinds.decal, scale: {...SCENERY.kinds.decal.scale, height: .3}};
  assert.equal(validateSceneryKind("decal", tall).ok, false);
  const unknownMat = {...SCENERY.kinds.barrel, materials: ["unobtainium"]};
  assert.equal(validateSceneryKind("barrel", unknownMat).ok, false);
  assert.equal(validateSceneryKind("nope").ok, false);
});

test("plan is deterministic, cached and pure data across seeds", () => {
  for (const seed of SEEDS) {
    const a = yardSceneryPlan(seed), b = yardSceneryPlan(seed);
    assert.equal(a, b, "cache identity for seed " + seed);
    assert.deepEqual(a, JSON.parse(JSON.stringify(a)), "plan must be plain serializable data");
    assert.equal(a.seed, seed >>> 0);
    assert.ok(a.props.length > 0 && a.rubble.length > 0 && a.decals.length > 0);
  }
  assert.notDeepEqual(yardSceneryPlan(4073).decals, yardSceneryPlan(9999).decals, "different seeds dress differently");
  assert.equal(DEFAULT_YARD_SEED, createGame().seed, "default yard seed matches the simulation default save");
});

test("validateSceneryPlan passes on every probe seed", () => {
  for (const seed of SEEDS) {
    const v = validateSceneryPlan(yardSceneryPlan(seed), seed);
    assert.equal(v.ok, true, seed + ": " + JSON.stringify(v.errors));
  }
});

test("every interior prop/rubble cell is machine-UNBUILDABLE (checkSite TERRAIN) on a rich tier-2 save", () => {
  for (const seed of SEEDS) {
    const g = richGame(seed), plan = yardSceneryPlan(seed);
    let interior = 0;
    for (const e of [...plan.props, ...plan.rubble]) {
      for (const k of e.cells) {
        const [x, z] = cellOf(k);
        if (!inside(x, z)) {
          assert.equal(checkSite(g, "salvager", x, z, 0).code, "BOUNDS", e.kind + " exterior " + k);
          continue;
        }
        if (!surveyed(x, z)) {
          assert.equal(checkSite(g, "salvager", x, z, 0).code, "UNSURVEYED", e.kind + " ring " + k);
          continue;
        }
        interior++;
        const r = checkSite(g, "salvager", x, z, 0);
        assert.equal(r.ok, false, e.kind + " on buildable " + k);
        assert.equal(r.code, "TERRAIN", e.kind + " " + k + " -> " + r.code);
        assert.equal(terrainFor(seed).get(k).kind, "rock");
      }
    }
    assert.ok(interior > 0, "seed " + seed + " should dress some interior rock cells");
  }
});

test("no scenery occupies starter footprints, bays or initial roads; fresh save hides nothing", () => {
  const g = createGame(), plan = yardSceneryPlan(g.seed);
  const starter = new Set();
  for (const b of STARTER_BUILDINGS) {
    for (const c of footprintCells(b.type, b.x, b.z, b.rot || 0)) starter.add(key(c.x, c.z));
    for (const c of bayCells(b.type, b.x, b.z, b.rot || 0)) starter.add(key(c.x, c.z));
  }
  const roads = new Set(INITIAL_ROADS);
  // Volumetric scenery may never occupy starter cells or roads. Flush decals
  // intentionally tint bay approaches (chevrons) — they occupy nothing.
  for (const e of [...plan.props, ...plan.rubble])
    for (const k of e.cells) {
      assert.equal(starter.has(k), false, e.kind + " on starter cell " + k);
      assert.equal(roads.has(k), false, e.kind + " on initial road " + k);
    }
  for (const d of plan.decals)
    for (const k of d.cells) assert.equal(roads.has(k), false, "decal on initial road " + k);
  const c = sceneryConflicts(plan, g);
  assert.deepEqual(c, {props: [], rubble: []}, "fresh save must hide zero scenery");
});

test("truck routes stay clear: sweep rects miss every prop AABB and the starter network stays connected", () => {
  const g = createGame(), plan = yardSceneryPlan(g.seed);
  const m = SCENERY.truckHalfWidth;
  for (const tile of INITIAL_ROADS) {
    const [x, z] = cellOf(tile), cx = origin(x), cz = origin(z);
    for (const p of plan.props) {
      const a = p.aabb;
      const hit = a.minX < cx + m && a.maxX > cx - m && a.minZ < cz + m && a.maxZ > cz - m;
      assert.equal(hit, false, p.kind + " blocks truck sweep at " + tile);
    }
  }
  // Real BFS freight routing across the starter network still works, and every
  // starter bay keeps road frontage within ROAD_REACH (scenery blocks nothing).
  const path = roadPath(g, {x: 11, z: 10}, {x: 19, z: 15});
  assert.ok(path && path.length > 1, "starter road network must stay connected");
  for (const b of STARTER_BUILDINGS) for (const c of bayCells(b.type, b.x, b.z, b.rot || 0)) {
    let reach = Infinity;
    for (const tile of g.roads) {const [rx, rz] = cellOf(tile); reach = Math.min(reach, Math.abs(rx - c.x) + Math.abs(rz - c.z));}
    assert.ok(reach <= 3, b.type + " bay lost frontage");
  }
});

test("decals are flush ground staining: height limit, below road top, never on roads", () => {
  for (const seed of SEEDS) {
    const plan = yardSceneryPlan(seed), roads = new Set(INITIAL_ROADS);
    for (const d of plan.decals) {
      assert.ok(d.h / 2 + .002 <= SCENERY.decalMaxHeight + 1e-9, "decal too tall");
      assert.ok(d.h / 2 + .002 < SCENERY.roadTop, "decal must sit below the road slab");
      assert.equal(d.zone, "any-nonroad");
      for (const k of d.cells) assert.equal(roads.has(k), false, "decal on road " + k);
    }
    assert.ok(plan.decals.length >= 150, "seed " + seed + " needs a dressed ground, got " + plan.decals.length);
  }
});

test("NEGATIVE: paving a road through a wreck cell hides the wreck (roadLine may pave rock)", () => {
  const g = richGame(), plan = yardSceneryPlan(g.seed);
  const wreckIdx = plan.props.findIndex(p => p.kind === "wreck" && p.cells.some(k => {
    const [x, z] = cellOf(k); return surveyed(x, z);
  }));
  assert.ok(wreckIdx >= 0, "default save should have an interior wreck");
  const [wx, wz] = cellOf(plan.props[wreckIdx].cells[0]);
  // Reach the wreck cell from the nearest initial road with a legal roadLine.
  let start = null;
  for (const tile of INITIAL_ROADS) {
    const [rx, rz] = cellOf(tile);
    if (Math.abs(rx - wx) + Math.abs(rz - wz) <= 6) {start = {x: rx, z: rz}; break;}
  }
  assert.ok(start, "wreck should be near a road for visibility");
  const r = roadLine(g, start, {x: wx, z: wz});
  assert.equal(r.ok, true, r.reason);
  const c = sceneryConflicts(plan, g);
  assert.ok(c.props.includes(wreckIdx), "paved wreck must be hidden");
  const group = new THREE.Group();
  const build = buildScenery(group, plan);
  applySceneryVisibility(build, c);
  assert.equal(build.propNodes[wreckIdx].visible, false);
  // Other wrecks stay visible.
  const others = plan.props.map((p, i) => p.kind === "wreck" && i !== wreckIdx ? i : -1).filter(i => i >= 0);
  for (const i of others) assert.equal(build.propNodes[i].visible, true);
});

test("NEGATIVE: paving through a scrap pile hides its rubble chunks; clearing restores exact base matrices", () => {
  const g = richGame(), plan = yardSceneryPlan(g.seed);
  const scrapIdx = plan.rubble.findIndex(r => r.kind === "scrapPile" && r.cells.some(k => {
    const [x, z] = cellOf(k); return surveyed(x, z);
  }));
  assert.ok(scrapIdx >= 0);
  const [sx, sz] = cellOf(plan.rubble[scrapIdx].cells[0]);
  let start = null;
  for (const tile of INITIAL_ROADS) {
    const [rx, rz] = cellOf(tile);
    if (Math.abs(rx - sx) + Math.abs(rz - sz) <= 8) {start = {x: rx, z: rz}; break;}
  }
  assert.ok(start);
  assert.equal(roadLine(g, start, {x: sx, z: sz}).ok, true);
  const c = sceneryConflicts(plan, g);
  assert.ok(c.rubble.includes(scrapIdx), "paved scrap chunk must be hidden");
  const group = new THREE.Group();
  const build = buildScenery(group, plan);
  applySceneryVisibility(build, c);
  const arr = build.rubbleMesh.instanceMatrix.array;
  for (const i of c.rubble) {
    for (let j = 0; j < 15; j++) assert.equal(arr[i * 16 + j], 0, "hidden instance must be zero-scale");
  }
  // Remove the paved cells again -> conflict clears -> matrices restored verbatim.
  g.roads = g.roads.filter(k => !c.rubble.some(i => plan.rubble[i].cells.includes(k)));
  const c2 = sceneryConflicts(plan, g);
  assert.equal(c2.rubble.includes(scrapIdx), false);
  applySceneryVisibility(build, c2);
  assert.deepEqual(Array.from(build.rubbleMesh.instanceMatrix.array), Array.from(build.rubbleBase), "base matrices restored exactly");
});

test("exterior belt is immune to ANY legal road network (ring + interior fully paved)", () => {
  const g = richGame(), plan = yardSceneryPlan(g.seed);
  for (let z = 0; z < WORLD_SIZE; z++) for (let x = 0; x < WORLD_SIZE; x++) {
    const k = key(x, z);
    if (!g.roads.includes(k) && !STARTER_BUILDINGS.some(b => footprintCells(b.type, b.x, b.z, b.rot || 0).some(c => key(c.x, c.z) === k)))
      g.roads.push(k);
  }
  const c = sceneryConflicts(plan, g);
  for (const i of c.props) assert.equal(plan.props[i].zone, "rock", "only interior rock props may hide");
  for (const i of c.rubble) assert.equal(plan.rubble[i].zone, "rock", "only interior rock rubble may hide");
  const exterior = plan.props.filter(p => p.zone === "exterior");
  assert.ok(exterior.length >= 20, "landmark belt must exist");
  for (const p of exterior) assert.equal(c.props.includes(plan.props.indexOf(p)), false);
});

test("buildScenery budgets: instancing, per-kind mesh/triangle caps, material ownership, 4 point lights", () => {
  const plan = yardSceneryPlan(DEFAULT_YARD_SEED);
  const group = new THREE.Group();
  const build = buildScenery(group, plan);
  assert.ok(build.stats.propMeshes <= SCENERY.budget.maxPropMeshesTotal, "prop mesh budget");
  assert.ok(build.stats.propTriangles <= SCENERY.budget.maxPropTrianglesTotal, "prop triangle budget");
  assert.equal(build.stats.pointLights, 4);
  assert.ok(build.stats.pointLights <= PERFORMANCE_LIMITS.pointLightsMax);
  assert.ok(plan.rubble.length <= SCENERY.budget.maxRubbleInstances);
  assert.ok(plan.decals.length <= SCENERY.budget.maxDecalInstances);
  // Exactly two InstancedMeshes carry all rubble + decals (2 draw calls).
  const instanced = [];
  group.traverse(o => {if (o.isInstancedMesh) instanced.push(o);});
  assert.equal(instanced.length, 2);
  assert.deepEqual(instanced.map(m => m.name).sort(), ["scenery:decals", "scenery:rubble"]);
  const decalMesh = group.getObjectByName("scenery:decals");
  const rubbleMesh = group.getObjectByName("scenery:rubble");
  assert.equal(decalMesh.castShadow, false);
  assert.equal(rubbleMesh.castShadow, true);
  assert.equal(decalMesh.count, Math.max(1, plan.decals.length));
  assert.equal(rubbleMesh.count, Math.max(1, plan.rubble.length));
  assert.ok(decalMesh.instanceColor, "decals tint via setColorAt");
  assert.ok(rubbleMesh.instanceColor, "rubble tint via setColorAt");
  // Per-kind budgets + material ownership + decorative authority on every prop.
  const legalHex = new Set(Object.values(MATERIALS).map(m => m.color));
  plan.props.forEach((p, i) => {
    const node = build.propNodes[i], desc = SCENERY.kinds[p.kind];
    assert.equal(node.userData.decorative, true);
    assert.equal(node.userData.authority, SCENERY_AUTHORITY);
    assert.equal(node.userData.sceneryKind, p.kind);
    let meshes = 0, tris = 0, lights = 0;
    const kindHex = new Set(desc.materials.map(m => MATERIALS[m].color));
    node.traverse(o => {
      if (o.isMesh) {
        meshes++;
        const idx = o.geometry.index;
        tris += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3;
        assert.equal(o.material.visible, true, "scenery must add NO invisible pick volumes");
        assert.ok(kindHex.has("#" + o.material.color.getHexString()), p.kind + " uses undeclared material");
        assert.ok(legalHex.has("#" + o.material.color.getHexString()), "palette ownership");
      }
      if (o.isPointLight) lights++;
    });
    assert.ok(meshes <= desc.budget.maxMeshes, p.kind + " mesh budget " + meshes);
    assert.ok(tris <= desc.budget.maxTriangles, p.kind + " triangle budget " + tris);
    assert.ok(lights <= (desc.budget.maxPointLights || 0), p.kind + " light budget");
  });
  for (const m of instanced) {
    assert.equal(m.userData.decorative, true);
    assert.equal(m.userData.authority, SCENERY_AUTHORITY);
  }
});

test("validator NEGATIVES: buildable-cell prop, road decal, tall decal, route-blocking prop all rejected", () => {
  const seed = DEFAULT_YARD_SEED, plan = yardSceneryPlan(seed);
  const clone = () => JSON.parse(JSON.stringify(plan));
  // Move a wreck onto a known buildable pad cell (6,7 is a legal salvager site).
  const bad = clone();
  const w = bad.props.find(p => p.kind === "wreck");
  const cx = origin(6), cz = origin(7);
  w.x = cx; w.z = cz;
  w.aabb = {minX: cx - .95, maxX: cx + .95, minZ: cz - 1.5, maxZ: cz + 1.5, height: 1.25};
  w.cells = ["6,7"];
  let v = validateSceneryPlan(bad, seed);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes("buildable cell 6,7")), JSON.stringify(v.errors));
  // Decal on an initial road cell.
  const bad2 = clone();
  bad2.decals.push({kind: "decal", x: origin(11), z: origin(10), w: 2, d: 2, h: .04, rotY: 0, color: "#91806b", cells: ["11,10"], zone: "any-nonroad"});
  v = validateSceneryPlan(bad2, seed);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes("road cell")));
  // Tall decal.
  const bad3 = clone();
  bad3.decals[0] = {...bad3.decals[0], h: .2};
  v = validateSceneryPlan(bad3, seed);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes("flush height")));
  // Prop centered on a road cell blocks the truck sweep.
  const bad4 = clone();
  const p = bad4.props[0];
  p.x = origin(11); p.z = origin(10);
  p.aabb = {minX: p.x - .5, maxX: p.x + .5, minZ: p.z - .5, maxZ: p.z + .5, height: 1};
  p.cells = ["11,10"];
  v = validateSceneryPlan(bad4, seed);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(e => e.includes("blocks the truck route")), JSON.stringify(v.errors));
});

test("DRONE_PAD parks on the exterior service shed, above roof height, off buildable ground", () => {
  assert.ok(DRONE_PAD.y > 4);
  assert.ok(Math.abs(DRONE_PAD.x) > 42 || Math.abs(DRONE_PAD.z) > 42, "drone park must be exterior");
  const shed = yardSceneryPlan(DEFAULT_YARD_SEED).props.find(p => p.kind === "shed" && Math.abs(p.x - DRONE_PAD.x) < 1 && Math.abs(p.z - DRONE_PAD.z) < 1);
  assert.ok(shed, "DRONE_PAD must sit above a real shed landmark");
});

test("visibility is rebuild-only: update() never recomputes scenery conflicts (no per-frame churn)", () => {
  const src = fs.readFileSync(new URL("../src/world.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const method = opening => {
    const start = src.indexOf(opening);
    assert.ok(start >= 0, opening + " missing");
    let depth = 0, j = src.indexOf("{", start);
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {depth--; if (depth === 0) {j++; break;}}
    }
    return src.slice(start, j);
  };
  const update = method("update(g,dt,time){");
  assert.equal(update.includes("sceneryConflicts"), false, "conflicts must not run per frame");
  assert.equal(update.includes("yardSceneryPlan"), false, "plan must not rebuild per frame");
  const rebuild = method("rebuild(g){");
  assert.ok(rebuild.includes("sceneryConflicts(this.sceneryPlan,g)"), "rebuild applies visibility");
  assert.ok(rebuild.includes("applySceneryVisibility"), "rebuild applies visibility");
  assert.ok(src.includes("rebuildScenery(seed)"), "seed change rebuilds dressing");
  assert.ok(src.includes("this.crewWorkers.push(w)"), "yard crew preserved in makeTerrain");
});

test("#307 camera invariants: applyCamera/stampCamera bodies byte-identical; scenery stamps additive", () => {
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
  assert.ok(src.includes("yaw:45,elevation:35.264"), "isometric default view");
  for (const stamp of ["d.scenerySeed", "d.sceneryProps", "d.sceneryRubble", "d.sceneryDecals", "d.sceneryHidden"])
    assert.ok(src.includes(stamp), "additive scenery stamp " + stamp);
});

test("interior dressing is varied: wrecks, barrels, scrap and outcrops all present on the default save", () => {
  const plan = yardSceneryPlan(DEFAULT_YARD_SEED);
  const kinds = {};
  for (const p of plan.props) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
  for (const r of plan.rubble) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  assert.ok(kinds.wreck >= 3, "wreck landmarks");
  assert.ok(kinds.barrel >= 2, "hazard drum clusters");
  assert.ok(kinds.scrapPile >= 12, "scrap heap chunks");
  assert.ok(kinds.outcrop >= 3, "rock outcrop chunks");
  assert.ok(kinds.fence >= 60, "perimeter fence posts+rails");
  assert.ok(kinds.boulder >= 40, "yard-edge boulders");
  for (const k of ["container", "shed", "silo", "pipeRack", "floodlight", "gatePost"])
    assert.ok(kinds[k] >= 2, k + " landmarks");
  // Interior props are spaced (no two wrecks within 3 cells).
  const wrecks = plan.props.filter(p => p.kind === "wreck").map(p => p.cells[0].split(",").map(Number));
  for (let i = 0; i < wrecks.length; i++) for (let j = i + 1; j < wrecks.length; j++)
    assert.ok(Math.max(Math.abs(wrecks[i][0] - wrecks[j][0]), Math.abs(wrecks[i][1] - wrecks[j][1])) >= 3);
});

test("REGRESSION buried ghost: surfaceTopFor derives the rendered top; ghostLift keeps the decal above raised rock dressing", () => {
  const plan = yardSceneryPlan(DEFAULT_YARD_SEED);
  // Wreck rock cell (19,6) — the capture negative-control cell. The OLD ghost
  // sat at fixed y=.2 (slab bottom .14); the wreck silhouette is 1.25 tall, so
  // the slab was buried inside the dressing and never reached the framebuffer.
  const topWreck = surfaceTopFor(plan, 19, 6);
  assert.ok(topWreck >= SCENERY.kinds.wreck.scale.height, "wreck cell top includes the prop silhouette");
  assert.ok(.2 - .06 < topWreck, "the old hardcoded .2 slab WAS buried here (the bug)");
  const slabBottom = ghostLift(topWreck, .12) - .06;
  assert.ok(slabBottom > topWreck, "new slab bottom rides strictly above the rendered surface");
  assert.ok(ghostLift(topWreck, .12) - topWreck <= .12, "thin overlay, not a floating slab");
  // Every surveyed rock cell with volumetric dressing: ghost bottom above its top.
  const terrain = terrainFor(DEFAULT_YARD_SEED);
  let raised = 0;
  for (const [k, t] of terrain) {
    if (t.kind !== "rock") continue;
    const [x, z] = cellOf(k);
    if (!surveyed(x, z)) continue;
    const top = surfaceTopFor(plan, x, z);
    if (top <= .14) continue;
    raised++;
    assert.ok(ghostLift(top, .12) - .06 > top, "ghost above surface at " + k);
    assert.ok(ghostLift(top, .06) - .03 > top, "bay ghost above surface at " + k);
  }
  assert.ok(raised >= 10, "default save has plenty of raised rock cells");
  // Graded pad (17,4) — the capture positive-control cell: flush decals only,
  // the decal stays ground-hugging and still clears the tallest flush tint.
  const topPad = surfaceTopFor(plan, 17, 4);
  assert.ok(topPad <= SCENERY.decalMaxHeight, "pad surface is flush");
  assert.ok(ghostLift(topPad, .12) - .06 >= topPad, "pad ghost clears flush decals");
  assert.ok(ghostLift(topPad, .12) < .2, "pad ghost hugs the ground (lower than the old fixed .2)");
});

test("REGRESSION buried ghost: occupancy-hidden rubble/props stop lifting the ghost; drawGhost has no hardcoded heights", () => {
  const plan = yardSceneryPlan(DEFAULT_YARD_SEED);
  // A rock cell dressed ONLY with rubble (no prop): hiding every chunk on it
  // must drop the surface back to flush grade — a legal machine there gets a
  // ground decal, not a ghost floating over invisible rubble.
  const propCells = new Set(plan.props.flatMap(p => p.cells));
  const target = plan.rubble.find(r => r.cells.some(k => !propCells.has(k) && terrainFor(DEFAULT_YARD_SEED).get(k)?.kind === "rock"));
  assert.ok(target, "found a rubble-only rock cell");
  const k = target.cells.find(c => !propCells.has(c) && terrainFor(DEFAULT_YARD_SEED).get(c)?.kind === "rock");
  const [x, z] = cellOf(k);
  const before = surfaceTopFor(plan, x, z);
  assert.ok(before > .14, "rubble raises the cell");
  const hiddenIdx = plan.rubble.map((r, i) => r.cells.includes(k) ? i : -1).filter(i => i >= 0);
  const after = surfaceTopFor(plan, x, z, {props: [], rubble: hiddenIdx});
  assert.ok(after <= SCENERY.decalMaxHeight, "hidden rubble no longer lifts the ghost");
  assert.ok(after < before);
  // Hidden props likewise (wreck cell with the wreck hidden).
  const wreckIdx = plan.props.map((p, i) => p.kind === "wreck" && p.cells.includes("19,6") ? i : -1).filter(i => i >= 0);
  const rubbleAtWreck = plan.rubble.map((r, i) => r.cells.includes("19,6") ? i : -1).filter(i => i >= 0);
  const cleared = surfaceTopFor(plan, 19, 6, {props: wreckIdx, rubble: rubbleAtWreck});
  assert.ok(cleared <= SCENERY.decalMaxHeight, "fully hidden dressing leaves flush grade");
  // Source guard: drawGhost must place every slab via ghostTop/ghostLift, never
  // the old hardcoded .2/.16/.22 heights that buried it under raised terrain.
  const src = fs.readFileSync(new URL("../src/world.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf("drawGhost(");
  const body = src.slice(start, src.indexOf("\n update(", start));
  assert.ok(body.includes("this.ghostTop("), "drawGhost derives per-cell surface");
  assert.ok(!/position\.set\([^)]*,\s*\.(2|16|22)\s*,/.test(body), "no hardcoded ghost heights remain");
  assert.ok(body.includes("opacity:.7") && body.includes("opacity:.3"), "decal opacity decisive under ACES");
});
