// STRAT-001 g1: the dock label sequence the naive bottom-button policy shows for its
// first 200 taps, produced by the shipped primaryFor()/nextYardStep()/tutorial mapping,
// so the browser interaction can be compared against the harness action by action.
// Run: npx tsx work/feedback/strat001-labels.mjs
import { writeFileSync } from "node:fs";
import { TUNING } from "../../src/game/content/defs";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { nextYardStep } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState } from "../../src/game/simulation/types";
import { primaryFor } from "../../src/ui/text";

const ROUNDS = 200;
const state = createInitialState();
let seq = 0;
const send = (body) => { seq += 1; return applyCommand(state, { ...body, id: "n" + seq }); };
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

const out = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  if (!state.exportClaimed && (state.store.steel ?? 0) >= TUNING.exportContractSteel) {
    send({ type: "contract.export" });
  }
  const step = nextYardStep(state);
  const primary = primaryFor(state, step);
  out.push({ round, tick: state.tick, tutorial: state.tutorial, kind: step.kind, label: primary.label, cost: primary.cost ?? null });
  switch (step.kind) {
    case "connect":
      for (const plan of step.plans) send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
      break;
    case "build":
      send({ type: "machine.build", blueprint: step.blueprint, tile: freeTile() });
      break;
    case "sell":
      send({ type: "contract.sell", resource: step.resource, qty: step.qty });
      break;
    case "research":
      send({ type: "research.buy", node: step.node });
      break;
    case "drone":
      send({ type: "drone.add" });
      break;
    case "upgrade":
      send({ type: "machine.upgrade", machineId: step.machineId });
      break;
    default:
      send({ type: "manual.salvage" });
  }
  advance(state, 10);
}
writeFileSync("work/feedback/strat001-labels.json", JSON.stringify(out, null, 1), "utf8");
const distinct = [...new Set(out.map((o) => o.label + (o.cost ? " " + o.cost : "")))];
console.log("distinct labels in the first 200 naive taps: " + distinct.length);
for (const d of distinct) console.log(" - " + d);
console.log("kinds: " + JSON.stringify(out.reduce((acc, o) => { acc[o.kind] = (acc[o.kind] ?? 0) + 1; return acc; }, {})));
console.log("first 8: " + JSON.stringify(out.slice(0, 8)));
console.log("end: " + JSON.stringify({ tick: state.tick, machines: state.machines.length, credits: state.credits, batches: state.machines.reduce((s, m) => s + m.batchesDone, 0) }));
