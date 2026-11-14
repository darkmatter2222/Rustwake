// #214 ladder window probe: how many rounds the retuned seed needs to reach every
// stage (all 8 blueprints, 3 research nodes, fleet >= 2, export claimed) at power 6.
// Run: npx tsx work/feedback/ladder-probe-214.mjs
import { validateBehaviour } from "../../src/game/content/validate";
import { TUNING } from "../../src/game/content/defs";
import { applyCommand } from "../../src/game/simulation/commands";
import { nextYardStep } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState } from "../../src/game/simulation/types";

for (const rounds of [1800, 3600]) {
  const { violations, marks } = validateBehaviour(rounds);
  console.log(`rounds=${rounds} violations=${violations.length} marks=${JSON.stringify(marks)}`);
  for (const v of violations) console.log("  - " + v);
}

// Mirror of validateBehaviour's driver with a state dump, to find the signalLab block.
const s = createInitialState();
for (let i = 0; i < 6; i += 1) {
  applyCommand(s, { id: "boot" + i, type: "manual.salvage" });
  advance(s, TUNING.manualPulseTicks);
}
applyCommand(s, { id: "bootr", type: "drone.repair" });
advance(s, 262);
let seq = 0;
const commit = (body) => applyCommand(s, { ...body, id: "p" + (seq += 1) });
const startersBuilt = () =>
  s.machines.some((m) => m.blueprint === "sorter") && s.machines.some((m) => m.blueprint === "furnace");
let exportRound = null;
for (let round = 0; round < 3600; round += 1) {
  if (!s.exportClaimed && startersBuilt() && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
    commit({ type: "contract.export" });
    exportRound = round + 1;
  }
  const step = nextYardStep(s);
  switch (step.kind) {
    case "connect":
      for (const plan of step.plans) commit({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
      break;
    case "build":
      commit({ type: "machine.build", blueprint: step.blueprint, tile: firstFree() });
      break;
    case "sell":
      commit({ type: "contract.sell", resource: step.resource, qty: step.qty });
      break;
    case "research":
      commit({ type: "research.buy", node: step.node });
      break;
    case "drone":
      commit({ type: "drone.add" });
      break;
    case "upgrade":
      commit({ type: "machine.upgrade", machineId: step.machineId });
      break;
    default:
      commit({ type: "manual.salvage" });
  }
  advance(s, 10);
  if (step.kind === "build") console.log(`round=${round + 1} BUILD ${step.blueprint} store=${JSON.stringify(s.store)} credits=${s.credits}`);
  if (round < 600 && (round + 1) % 20 === 0) {
    console.log(`round=${round + 1} export=${exportRound} credits=${s.credits} store=${JSON.stringify(s.store)}`);
  }
  if ((round + 1) % 600 === 0) {
    console.log(`round=${round + 1} export=${exportRound} credits=${s.credits} store=${JSON.stringify(s.store)}`);
    console.log("  levels=" + s.machines.map((m) => m.blueprint + ":L" + m.level).join(" "));
  }
}
function firstFree() {
  for (let tile = 0; tile < 36; tile += 1) {
    if (tile === 2) continue;
    if (!s.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
}
console.log("final store=" + JSON.stringify(s.store) + " credits=" + s.credits);
console.log("final levels=" + s.machines.map((m) => m.blueprint + ":L" + m.level).join(" "));
