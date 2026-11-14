/**
 * RW3D T10 (#137) motion harness: drives the REAL renderer modules against
 * the REAL world engine and sim economy at a scripted fixed dt. No animation
 * loop, no clock reads — every frame is an explicit (tick, framePhase) pair,
 * so the capture script can assert numerical phase invariants.
 *
 * The world<->sim level join here (building id 1 <-> machine id 1) is a
 * harness convenience; the production join is owed wiring (#148 cutover,
 * #199 shell). The renderer itself only ever sees the adapter snapshot.
 */
import * as THREE from "three";
import {
  createWorld,
  applyWorldCommand,
  advanceWorld,
  advanceWorldTo,
  validatePlacement,
  worldFingerprint,
} from "/src/game/world/index.ts";
import { createInitialState } from "/src/game/simulation/types.ts";
import { applyCommand } from "/src/game/simulation/commands.ts";
import { advance as advanceSim } from "/src/game/simulation/engine.ts";
import { TUNING } from "/src/game/content/defs.ts";
import { AssemblyView } from "/src/game/renderer/three/assemblyView.ts";
import { worldAssemblySnapshot } from "/src/game/renderer/assembly.ts";

let world = null;
let sim = null;
let view = null;
let renderer = null;
let scene = null;
let camera = null;
let reducedMotion = false;
let framePhase = 0;
let upgradeSeq = 0;
let lastUpgradeId = null;
let placedCell = null;

function sendSim(body) {
  upgradeSeq += 1;
  return applyCommand(sim, { ...body, id: `h${upgradeSeq}` });
}

function runTutorialEconomy() {
  sim = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    sendSim({ type: "manual.salvage" });
    advanceSim(sim, TUNING.manualPulseTicks);
  }
  sendSim({ type: "drone.repair" });
  advanceSim(sim, 262);
  sendSim({ type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = sim.machines[0];
  sendSim({ type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  sendSim({ type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advanceSim(sim, 400);
  sendSim({ type: "machine.build", blueprint: "furnace", tile: 9 });
  const furnace = sim.machines[1];
  sendSim({ type: "route.connect", from: sorter.id, to: furnace.id, filter: "ferrous" });
  sendSim({ type: "route.connect", from: furnace.id, to: 0, filter: "steel" });
  advanceSim(sim, 900);
  sendSim({ type: "contract.export" });
}

function levelOf(buildingId) {
  if (buildingId !== 1) return 1;
  const m = sim.machines.find((x) => x.id === 1);
  return m ? m.level : 1;
}

function syncView() {
  view.sync(worldAssemblySnapshot(world, levelOf), { reducedMotion, framePhase });
  renderer.render(scene, camera);
}

function sample() {
  return {
    tick: world.tick,
    fingerprint: worldFingerprint(world),
    reducedMotion,
    framePhase,
    report: view.stageReport(),
    resources: view.resourceCounts(),
    economy: {
      credits: world.credits,
      sites: world.sites.length,
      buildings: world.buildings.length,
      reservations: world.reservations.length,
      stock: world.stock,
      committed: world.committed,
    },
    sim: { credits: sim.credits, level: levelOf(1) },
  };
}

function init(seed) {
  world = createWorld(seed);
  let cell = null;
  for (let y = 0; y < 24 && cell === null; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      if (validatePlacement(world, "warehouse", { x, y }, 0) === null) {
        cell = { x, y };
        break;
      }
    }
  }
  if (cell === null) throw new Error("no legal warehouse cell");
  placedCell = cell;
  const res = applyWorldCommand(world, { id: "h-place", type: "world.place", asset: "warehouse", cell, rotation: 0 });
  if (!res.ok) throw new Error(`place rejected: ${JSON.stringify(res)}`);
  runTutorialEconomy();

  const canvas = document.getElementById("scene");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(960, 600, false);
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#20241f");
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshLambertMaterial({ color: "#3a3f38" }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(6, 12, 8);
  scene.add(sun);

  const cx = cell.x + 3;
  const cz = cell.y + 2;
  camera = new THREE.PerspectiveCamera(45, 960 / 600, 0.1, 200);
  camera.position.set(cx + 9, 8, cz + 11);
  camera.lookAt(cx, 1, cz);

  view = new AssemblyView();
  scene.add(view.root);
  reducedMotion = false;
  framePhase = 0;
  syncView();
  const gl = renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    ok: true,
    seed,
    cell,
    buildingId: world.sites[0].buildingId,
    glRenderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown",
    sample: sample(),
  };
}

window.__RW3D__ = {
  init,
  advanceTo(t) {
    advanceWorldTo(world, t);
    syncView();
    return sample();
  },
  fastForward(ticks) {
    advanceWorld(world, ticks);
    syncView();
    return sample();
  },
  reload() {
    world = JSON.parse(JSON.stringify(world));
    syncView();
    return sample();
  },
  setMotion(rm, phase) {
    reducedMotion = rm;
    framePhase = phase;
    syncView();
    return sample();
  },
  upgrade() {
    lastUpgradeId = `u${++upgradeSeq}`;
    const res = applyCommand(sim, { id: lastUpgradeId, type: "machine.upgrade", machineId: 1 });
    syncView();
    return { res, sample: sample() };
  },
  duplicateUpgrade() {
    const res = applyCommand(sim, { id: lastUpgradeId, type: "machine.upgrade", machineId: 1 });
    syncView();
    return { res, sample: sample() };
  },
  earn() {
    advanceSim(sim, 2000);
    const res = sendSim({ type: "contract.sell", resource: "steel", qty: 60 });
    return { res, simCredits: sim.credits };
  },
  partProbe(names) {
    return names.map((name) => {
      const mesh = view.root.getObjectByName(name);
      if (!mesh) return { name, missing: true };
      return {
        name,
        visible: mesh.visible,
        position: [mesh.position.x, mesh.position.y, mesh.position.z],
        scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
      };
    });
  },
  sample,
};
