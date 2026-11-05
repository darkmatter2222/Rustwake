// STRAT-001 g1: (a) browser-timeline analysis, (b) naive-harness snapshots for the
// interaction-vs-harness cross-check at matching ticks.
import { readFileSync } from "node:fs";
import { TUNING } from "../../src/game/content/defs";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../../src/game/simulation/commands";
import { nextYardStep } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState } from "../../src/game/simulation/types";

const data = JSON.parse(readFileSync("work/feedback/strat001-interact.json", "utf8"));
const t = data.timeline;
let rejectedPlaces = 0, places = 0, noOps = 0, salvages = 0;
for (let i = 0; i < t.length; i += 1) {
  const cur = t[i], next = t[i + 1];
  if (!next) continue;
  if (/^Salvage|^Repair/.test(cur.label ?? "")) { salvages += 1; continue; }
  const changed = next.machines !== cur.machines || next.credits !== cur.credits || next.batches !== cur.batches;
  if (!changed) noOps += 1;
  if (/^Place/.test(cur.label ?? "")) { places += 1; if (next.machines === cur.machines) rejectedPlaces += 1; }
}
console.log("BROWSER taps=" + t.length + " firstTick=" + t[0].tick + " lastTick=" + t.at(-1).tick);
console.log("BROWSER salvage/repair taps=" + salvages + " place taps=" + places +
  " rejected place taps=" + rejectedPlaces + " other no-op taps=" + noOps);
const firstT9 = t.find((x) => x.tutorial === 9);
console.log("BROWSER first tap with tutorial=9: " + JSON.stringify(firstT9));
console.log("BROWSER after: " + JSON.stringify(data.after));
console.log("BROWSER dock at end: " + JSON.stringify(data.dockButtons));

const state = createInitialState();
let seq = 0, rejects = 0;
const send = (body) => { seq += 1; const r = applyCommand(state, { ...body, id: "n" + seq }); if (r.ok) return true; rejects += 1; return false; };
for (let i = 0; i < 6; i += 1) { send({ type: "manual.salvage" }); advance(state, TUNING.manualPulseTicks); }
send({ type: "drone.repair" });
advance(state, 262);
const freeTile = () => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};
const snaps = [];
for (let round = 1; round <= 260; round += 1) {
  if (!state.exportClaimed && (state.store.steel ?? 0) >= TUNING.exportContractSteel) send({ type: "contract.export" });
  const step = nextYardStep(state);
  switch (step.kind) {
    case "connect": for (const plan of step.plans) send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter }); break;
    case "build": send({ type: "machine.build", blueprint: step.blueprint, tile: freeTile() }); break;
    case "sell": send({ type: "contract.sell", resource: step.resource, qty: step.qty }); break;
    case "research": send({ type: "research.buy", node: step.node }); break;
    case "drone": send({ type: "drone.add" }); break;
    case "upgrade": send({ type: "machine.upgrade", machineId: step.machineId }); break;
    default: send({ type: "manual.salvage" });
  }
  advance(state, 10);
  snaps.push({ round, tick: state.tick, tutorial: state.tutorial, machines: state.machines.length, links: state.routes.length, drones: 1 + state.spares.length, credits: Math.round(state.credits), batches: state.machines.reduce((s, m) => s + m.batchesDone, 0), nodes: Object.keys(state.research).length });
}
const near = (tick) => snaps.reduce((b, s) => (Math.abs(s.tick - tick) < Math.abs(b.tick - tick) ? s : b));
console.log("HARNESS naive tick~2030: " + JSON.stringify(near(2030)));
console.log("HARNESS naive tick~2298: " + JSON.stringify(near(2298)));
console.log("HARNESS naive at round 260: " + JSON.stringify(snaps.at(-1)) + " rejects=" + rejects);
console.log("HARNESS levels at 260: " + state.machines.map((m) => m.blueprint + ":L" + m.level).join(" "));
