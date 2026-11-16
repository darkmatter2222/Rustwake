// #214 escalation evidence: which binding number breaks the ladder?
// Mutates TUNING/EXPORT_PRICES at runtime only (no source edits) and runs the
// exact validateBehaviour driver mirror for 1800 rounds in each cell.
import { BLUEPRINTS, EXPORT_PRICES, TUNING } from "../../src/game/content/defs";
import { applyCommand, DOCK_TILE, YARD_TILES } from "../../src/game/simulation/commands";
import { advance } from "../../src/game/simulation/engine";
import { nextYardStep } from "../../src/game/simulation/plan";
import { createInitialState } from "../../src/game/simulation/types";

const cells = [
  { name: "power6 newprices (binding)", power: 6, steel: 4, ferrous: 1 },
  { name: "power8 newprices", power: 8, steel: 4, ferrous: 1 },
  { name: "power6 oldprices", power: 6, steel: 10, ferrous: 2 },
  { name: "power8 oldprices (old economy)", power: 8, steel: 10, ferrous: 2 },
];
for (const cell of cells) {
  TUNING.yardPowerCapacity = cell.power;
  EXPORT_PRICES.steel = cell.steel;
  EXPORT_PRICES.ferrous = cell.ferrous;
  const s = createInitialState();
  let seq = 0;
  const commit = (body) => applyCommand(s, { ...body, id: `m${seq += 1}` });
  for (let i = 0; i < 6; i += 1) { commit({ type: "manual.salvage" }); advance(s, TUNING.manualPulseTicks); }
  commit({ type: "drone.repair" });
  advance(s, 262);
  const firstFreeTile = () => {
    const taken = new Set(s.machines.map((m) => m.tile));
    for (let tile = 0; tile < YARD_TILES; tile += 1) {
      if (tile === DOCK_TILE) continue;
      if (!taken.has(tile)) return tile;
    }
    return DOCK_TILE;
  };
  const startersBuilt = () =>
    s.machines.some((m) => m.blueprint === "sorter") && s.machines.some((m) => m.blueprint === "furnace");
  let labRound = 0, researchRound = 0, maxFerrous = 0;
  for (let round = 0; round < 1800; round += 1) {
    if (!s.exportClaimed && startersBuilt() && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel)
      commit({ type: "contract.export" });
    maxFerrous = Math.max(maxFerrous, s.store.ferrous ?? 0);
    const step = nextYardStep(s);
    if (step.kind === "build" && step.blueprint === "signalLab" && !labRound) {
      const before = s.machines.length;
      commit({ type: "machine.build", blueprint: step.blueprint, tile: firstFreeTile() });
      if (s.machines.length > before) labRound = round + 1;
    } else {
      switch (step.kind) {
        case "connect":
          for (const plan of step.plans) commit({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
          break;
        case "build": commit({ type: "machine.build", blueprint: step.blueprint, tile: firstFreeTile() }); break;
        case "sell": commit({ type: "contract.sell", resource: step.resource, qty: step.qty }); break;
        case "research":
          if (!researchRound) researchRound = round + 1;
          commit({ type: "research.buy", node: step.node });
          break;
        case "drone": commit({ type: "drone.add" }); break;
        case "upgrade": commit({ type: "machine.upgrade", machineId: step.machineId }); break;
        default: commit({ type: "manual.salvage" });
      }
    }
    advance(s, 10);
  }
  const built = new Set(s.machines.map((m) => m.blueprint));
  console.log(`${cell.name}: machines=${built.size}/8 signalLab=${labRound || "NEVER"} firstResearch=${researchRound || "NEVER"} nodes=${Object.keys(s.research).length} maxFerrousAtBoundary=${maxFerrous} credits=${s.credits}`);
}
