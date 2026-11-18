// Diagnostic: is the depot docking clause reachable in
// the SHIPPED starter yard? Prints bay cells, nearestRoad, and the min real
// truck-to-bay distance over a long real simulation step run.
globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})};
const {CELL, WORLD_SIZE} = await import("../src/content.js");
const {bayCells} = await import("../src/gridOccupancy.js");
const sim = await import("../src/simulation.js");
const {bayApproachDistance, ART04_DOCK} = await import("../src/art04.js");

const g = sim.createGame();
const depot = g.buildings.find(b => b.type === "depot");
console.log("CELL", CELL, "starter depot", JSON.stringify({id: depot.id, x: depot.x, z: depot.z, rot: depot.rot || 0}));
for (const rot of [0, 1, 2, 3]) {
  const bay = bayCells("depot", depot.x, depot.z, rot)[0];
  const nr = sim.nearestRoad(g, depot.x, depot.z);
  const dist = Math.hypot((bay.x - nr.x) * CELL, (bay.z - nr.z) * CELL);
  console.log("rot", rot, "bay", JSON.stringify(bay), "nearestRoad", JSON.stringify(nr), "stop-to-bay world dist", dist.toFixed(3), "docks?", dist <= ART04_DOCK.near);
}
// Step the REAL sim: starter yard, bank stocked so freight jobs flow.
Object.assign(g.bank, {credits: 8000, scrap: 600, iron: 300, stone: 300, steel: 300, copper: 300, fuel: 200, water: 200, circuits: 80, gears: 60, data: 40});
g.tier = 2;
let minDist = Infinity, minAt = null, dockingSteps = 0, steps = 0;
const trace = [];
const dt = 0.25;
for (let t = 0; t < 240; t += dt) {
  sim.advanceGame(g, dt);
  steps++;
  const {distance} = bayApproachDistance(g, depot);
  if (distance < minDist) { minDist = distance; minAt = {t, vehicles: g.vehicles.map(v => ({id: v.id, x: +v.x.toFixed(2), z: +v.z.toFixed(2), phase: v.job?.phase || null}))}; }
  if (distance <= ART04_DOCK.near) dockingSteps++;
  if (Math.abs(t % 30) < dt / 2) trace.push({t, dist: +distance.toFixed(3), trucks: g.vehicles.map(v => [v.id, +v.x.toFixed(2), +v.z.toFixed(2), v.job?.phase || "idle"])});
}
console.log("steps", steps, "dockingSteps", dockingSteps, "minBayDist", minDist.toFixed(4), "at", JSON.stringify(minAt));
console.log("trace", JSON.stringify(trace));
console.log("CONCLUSION:", dockingSteps > 0 ? "docking reachable" : "docking NEVER fires in the shipped starter yard (min dist " + minDist.toFixed(3) + " > near " + ART04_DOCK.near + ")");
