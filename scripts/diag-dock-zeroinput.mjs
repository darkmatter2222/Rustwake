// #580 acceptance clause 1 instrument: FRESH first-run starter yard, ZERO
// player input. Unlike scripts/diag-dock-reach.mjs (which stocks the bank and
// forces tier 2, so it CANNOT prove clause 1), this probe uses createGame()
// exactly as shipped: INITIAL_BANK untouched, g.tier untouched (stays 0).
// It steps the REAL sim and reports dockingSteps / minBayDist / firstDockT
// against the unchanged ART04_DOCK window (near 2.5 / far 7 / travel 0.8).
//
// Usage: node scripts/diag-dock-zeroinput.mjs <srcDir> [seconds]
//   <srcDir>  directory containing content.js / simulation.js / art04.js
//             (pass a base-checkout src dir for the negative control)
//   [seconds] sim-seconds to run, default 660 (2640 steps at dt 0.25)
//
// Measured at fix head (660 sim-s): dockingSteps 538, minBayDist 1.225,
// firstDockT 7.25 sim-s -> clause 1 PASS.
// Negative control, base 77e6442f src (660 sim-s): dockingSteps 0,
// minBayDist 5.775, firstDockT null (never) -> clause 1 FAIL.
// Note: bayApproachDistance does not expose doorLift, so maxDoorLift below
// reads 0 in both runs — do NOT claim doorLift from this probe.
globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})};
import {pathToFileURL} from "node:url";
import path from "node:path";

const srcDir = path.resolve(process.argv[2] || "src");
const seconds = Number(process.argv[3] || 660);
const imp = f => import(pathToFileURL(path.join(srcDir, f)).href);
const {CELL} = await imp("content.js");
const sim = await imp("simulation.js");
const {bayApproachDistance, ART04_DOCK} = await imp("art04.js");

const g = sim.createGame();
const depot = g.buildings.find(b => b.type === "depot");
const bankAtStart = JSON.stringify(g.bank);
const tierAtStart = g.tier;

let minDist = Infinity, minAt = null, dockingSteps = 0, steps = 0, firstDockT = null;
let maxDoorLift = 0;
const dt = 0.25;
for (let t = 0; t < seconds; t += dt) {
  sim.advanceGame(g, dt);
  steps++;
  const r = bayApproachDistance(g, depot);
  const distance = r.distance;
  if (distance < minDist) {
    minDist = distance;
    minAt = {t: +t.toFixed(2), vehicles: g.vehicles.map(v => ({id: v.id, x: +v.x.toFixed(3), z: +v.z.toFixed(3), phase: v.job?.phase || null}))};
  }
  if (distance <= ART04_DOCK.near) {
    dockingSteps++;
    if (firstDockT === null) firstDockT = +t.toFixed(2);
  }
  if (typeof r.doorLift === "number" && r.doorLift > maxDoorLift) maxDoorLift = r.doorLift;
}
console.log(JSON.stringify({
  srcDir, seconds, steps, CELL,
  depot: {id: depot.id, x: depot.x, z: depot.z, rot: depot.rot || 0},
  bankUntouched: JSON.stringify(g.bank) !== bankAtStart ? "BANK CHANGED BY SIM (expected: production)" : "unchanged",
  bankAtStart: JSON.parse(bankAtStart), tierAtStart, tierEnd: g.tier,
  dockWindow: ART04_DOCK,
  dockingSteps, firstDockT, minBayDist: +minDist.toFixed(4), minAt,
  maxDoorLift,
  delivered: g.stats?.delivered, shipments: g.stats?.shipments,
  clause1: dockingSteps > 0 && minDist <= ART04_DOCK.near ? "PASS" : "FAIL"
}, null, 1));