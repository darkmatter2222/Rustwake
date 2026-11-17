// #552: standalone Screening Plant buildable — load-bearing acceptance.
// Proves the ART-02 "sorter" outcome is now its OWN buildable that genuinely
// consumes input and produces output on its cycle, with EXACT bank/inventory
// deltas, and is bound to the existing accepted ART-02 screening rig.
//
// FAILS on current main (e82caa52): BLUEPRINTS.screening does not exist, the
// schema has no screening descriptor, world.js has no screening binding, and
// advanceGame can never run a screening cycle. Negative controls (registry /
// binding / schema / recipe reverts) are recorded in the PR #552 evidence.
//
// Lease note: simulation.js is UNCHANGED — advanceGame is fully data-driven off
// BLUEPRINTS[type].{cycle,inputs,outputs}, so the content registry IS the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createGame, buildAt, removeBuilding, advanceGame, checkSite,
  powerStatus, unlocked, snapshot
} from "../src/simulation.js";
import {BUILDINGS, BLUEPRINTS, INITIAL_BANK, WORLD_SIZE, footprintOf} from "../src/content.js";
import {MACHINES, machineDescriptor, validateMachine, validateAllMachines} from "../src/voxelSchema.js";

globalThis.document = {
  createElement: (tag) => {
    assert.equal(tag, "canvas");
    return {width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})};
  }
};
const {makeBuilding, art02Pose, ART02_MOTION} = await import("../src/world.js");

const clone = (x) => JSON.parse(JSON.stringify(x));
const delta = (after, before, keys) =>
  Object.fromEntries(keys.map(k => [k, (after[k] || 0) - (before[k] || 0)]));
function legalSite(g, type, rot = 0) {
  for (let z = 1; z < WORLD_SIZE - 1; z++) for (let x = 1; x < WORLD_SIZE - 1; x++)
    if (checkSite(g, type, x, z, rot).ok) return {x, z};
  throw Error("no legal site for " + type);
}
const hasNode = (group, name) => {
  let found = false;
  group.traverse(n => { if (n.name === name) found = true; });
  return found;
};
const buildGroup = (type) => {
  const group = makeBuilding({id: 99, type, x: WORLD_SIZE / 2 - 0.5, z: WORLD_SIZE / 2 - 0.5, remaining: 0}, 0).group;
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1);
  return group;
};

// ---- 1. Content registry: the buildable exists with the exact family balance ----
test("#552 registry: Screening Plant is a distinct processing buildable with exact recipe", () => {
  const d = BLUEPRINTS.screening;
  assert.ok(d, "BLUEPRINTS.screening must exist (absent on main)");
  assert.notEqual(d.id, "crusher", "must be its own id, not the crusher");
  assert.equal(d.name, "Screening Plant");
  assert.equal(d.family, "processing");
  assert.equal(d.tag, "PROCESS");
  assert.deepEqual(d.cost, {credits: 230, scrap: 42, stone: 22});
  assert.equal(d.cycle, 3.5);
  assert.deepEqual(d.inputs, {scrap: 8});
  assert.deepEqual(d.outputs, {stone: 5, copper: 1});
  assert.equal(d.power, 2);
  assert.ok(Object.keys(d.outputs).length > 0, "must produce output (negative control: empty recipe)");
  assert.ok(BUILDINGS.some(b => b.id === "screening"), "must appear in the data-driven dock list");
  assert.deepEqual(footprintOf("screening"), {w: 1, d: 1});
});

test("#552 registry: unlocked at tier 0 alongside the crusher (immediately buildable)", () => {
  const g = createGame();
  assert.equal(g.tier, 0);
  assert.equal(unlocked(g, "screening"), true);
  assert.equal(unlocked(g, "crusher"), true);
});

// ---- 2. Schema binding: descriptor alias passes full validation, no orphans ----
test("#552 schema: screening descriptor is bound to the accepted ART-02 rig and validates", () => {
  assert.ok(MACHINES.screening, "MACHINES.screening must exist (absent on main)");
  assert.equal(validateMachine("screening").ok, true);
  const report = validateAllMachines();
  assert.equal(report.ok, true, "no missing/orphan descriptors: " + JSON.stringify(report.errors));
  assert.equal(report.machines.length, BUILDINGS.length);
  const desc = machineDescriptor("screening");
  assert.deepEqual(desc.footprint.cells, [1, 1]);
  const pivotIds = desc.pivots.map(p => p.id).sort();
  assert.deepEqual(pivotIds, ["rollerA", "rollerB", "screen"], "shares the ART-02 crusher+screen pivots");
});

// ---- 3. Geometry binding: real world.js rig, NOT the generic fallback box ----
test("#552 geometry: makeBuilding(screening) renders the ART-02 screen deck + rollers", () => {
  const group = buildGroup("screening");
  assert.ok(hasNode(group, "pivot:screen"), "oscillating screen deck must be present (fallback box lacks it)");
  assert.ok(hasNode(group, "pivot:rollerA"), "ART-02 rollerA present");
  assert.ok(hasNode(group, "pivot:rollerB"), "ART-02 rollerB present");
  assert.ok(hasNode(group, "port:loading-bay"), "selectable/inspectable loading bay");
  assert.ok(hasNode(group, "status:light"), "status marker");
  // The shared pure pose drives the screen channel exactly as the crusher does.
  const p = art02Pose(1.234, false, 7);
  assert.ok(Math.abs(p.screen - Math.sin(1.234 * ART02_MOTION.screenSpeed + 7) * ART02_MOTION.screenAmp) <= 0.02);
  // Negative control: the generic fallback (e.g. an unbound id) has NO screen deck.
  const fallback = buildGroup("turret");
  assert.equal(hasNode(fallback, "pivot:screen"), false, "control: non-screening rig has no screen deck");
});

// ---- 4. Exact build spend (bank delta measured, not predicted) ----
test("#552 build: commit spends the exact cost with paid provenance", () => {
  const g = createGame();
  const site = legalSite(g, "screening");
  const before = {...g.bank};
  const r = buildAt(g, "screening", site.x, site.z, 0);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.code, "OK");
  assert.deepEqual(delta(g.bank, before, ["credits", "scrap", "stone"]),
    {credits: -230, scrap: -42, stone: -22});
  assert.deepEqual(r.building.paid, {credits: 230, scrap: 42, stone: 22});
  assert.equal(r.building.type, "screening");
  assert.equal(r.building.remaining, 5, "assembles before running");
  const row = g.ledger.find(e => e.kind === "build" && e.type === "screening");
  assert.ok(row, "construction ledger records the screening build");
  assert.deepEqual(row.cost, {credits: 230, scrap: 42, stone: 22});
});

// ---- 5. Exact production: genuinely consumes input and produces output ----
// Frozen, isolated fixture: only depot + generator + a completed screening plant,
// no vehicles (no freight masks the delta), no research. One 3.5s cycle fires once.
function productionGame() {
  const g = createGame();
  g.vehicles = [];
  g.research = [];
  const depot = g.buildings.find(b => b.type === "depot");
  const gen = g.buildings.find(b => b.type === "generator");
  const screen = {id: 100, type: "screening", x: 10, z: 10, rot: 0, level: 1,
    remaining: 0, inventory: {scrap: 80}, timer: 0, paid: {...BLUEPRINTS.screening.cost}};
  g.buildings = [depot, gen, screen];
  return {g, screen};
}

test("#552 production: one cycle consumes 8 scrap and yields exactly 5 stone + 1 copper", () => {
  const {g, screen} = productionGame();
  assert.equal(powerStatus(g).available, true, "generator must power the plant");
  const producedBefore = g.stats.produced;
  const bankBefore = {...g.bank};
  advanceGame(g, 3.5);
  assert.deepEqual(screen.inventory, {scrap: 72, stone: 5, copper: 1},
    "exact inventory delta: scrap -8, stone +5, copper +1");
  assert.equal(g.stats.produced - producedBefore, 6, "produced counter += 5 stone + 1 copper");
  assert.deepEqual(delta(g.bank, bankBefore, Object.keys(INITIAL_BANK)),
    Object.fromEntries(Object.keys(INITIAL_BANK).map(k => [k, 0])),
    "no vehicles: bank untouched by the machine cycle itself");
});

test("#552 production: starved plant consumes nothing (input gate is load-bearing)", () => {
  const {g, screen} = productionGame();
  screen.inventory = {scrap: 3}; // below the 8-unit input requirement
  advanceGame(g, 3.5);
  assert.deepEqual(screen.inventory, {scrap: 3}, "no partial consumption when input is insufficient");
  assert.equal(g.stats.produced, 0);
});

// ---- 6. Power draw is real ----
test("#552 power: a completed Screening Plant adds exactly 2 demand", () => {
  const {g, screen} = productionGame();
  assert.equal(powerStatus(g).demand, 2);
  assert.equal(powerStatus(g).supply, 12);
  g.buildings = g.buildings.filter(b => b.id !== screen.id);
  assert.equal(powerStatus(g).demand, 0, "control: removing the plant removes its draw");
});

// ---- 7. Exact dismantle refund (floor 40% paid + 100% stored cargo) ----
test("#552 dismantle: refund is floor(40% paid) plus exact processed cargo", () => {
  const {g, screen} = productionGame();
  advanceGame(g, 3.5); // inventory now {scrap:72, stone:5, copper:1}
  const before = {...g.bank};
  const r = removeBuilding(g, screen.id);
  assert.equal(r.ok, true, r.reason);
  // floor(0.4*{230,42,22}) = {92,16,8}; cargo {scrap:72,stone:5,copper:1}
  assert.deepEqual(r.refund, {credits: 92, scrap: 88, stone: 13, copper: 1});
  assert.deepEqual(delta(g.bank, before, ["credits", "scrap", "stone", "copper"]),
    {credits: 92, scrap: 88, stone: 13, copper: 1});
  assert.equal(g.buildings.some(b => b.id === screen.id), false);
});

// ---- 8. Save round-trip preserves the new buildable ----
test("#552 persistence: a screening plant survives snapshot/reload coercion", () => {
  const {g, screen} = productionGame();
  advanceGame(g, 3.5);
  const round = clone(g);
  assert.ok(round.buildings.some(b => b.type === "screening" && BLUEPRINTS[b.type]),
    "readGame filters by BLUEPRINTS[type]; the id must be registered to survive");
  assert.deepEqual(round.buildings.find(b => b.id === screen.id).inventory,
    {scrap: 72, stone: 5, copper: 1});
});