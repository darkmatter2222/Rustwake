// STRAT-002 g1 harness: the named-outcome fork measured one branch per run.
// Method: deterministic simulation, one command per round, 10 ticks apart, 1800 rounds
// = 18 000 ticks. Boot and cadence mirror work/feedback/strat001-harness.mjs (same
// seed: the same fixed command prefix, no Math.random anywhere), so the only difference
// between rows is which named outcome the upgrade command carried.
// Run: npx tsx work/feedback/strat002-harness.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { BLUEPRINTS, RECIPES, TUNING, unlockedBlueprints } from "../../src/game/content/defs";
import { nextResearchNode } from "../../src/game/content/research";
import { applyCommand, DOCK_TILE, YARD_TILES, droneAddCost, sellableAmount, upgradeCost } from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { SELL_ORDER, nextYardStep } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState } from "../../src/game/simulation/types";

const ROUNDS = 1800;
const TARGET = "work/feedback/strat002-harness.json";

const freeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};
const affordable = (state, blueprint) => {
  const def = BLUEPRINTS[blueprint];
  if (!def) return false;
  return def.buildCost.every((item) => (state.store[item.resource] ?? 0) >= item.qty);
};
const upgradeCandidate = (state) => {
  let best = null;
  for (const machine of state.machines) {
    const def = BLUEPRINTS[machine.blueprint];
    if (!def) continue;
    if (state.credits < upgradeCost(def.baseUpgradeCost, machine.level)) continue;
    const busy = machine.busyTicks ?? 0;
    if (!best || machine.level < best.level || (machine.level === best.level && busy > best.busy)) {
      best = { machineId: machine.id, level: machine.level, busy };
    }
  }
  return best ? { kind: "upgrade", machineId: best.machineId } : null;
};
const researchStep = (state) => {
  const node = nextResearchNode(state);
  return node && (state.store.data ?? 0) >= node.cost ? { kind: "research", node: node.id } : null;
};
const droneStep = (state) => {
  if (!state.drone.repaired) return null;
  if (1 + state.spares.length >= TUNING.fleetCap) return null;
  if (state.credits < droneAddCost(state)) return null;
  return { kind: "drone" };
};
const sellStep = (state) => {
  const unbuilt = unlockedBlueprints(state.tutorial).filter((id) => !state.machines.some((m) => m.blueprint === id));
  const pending = new Set();
  for (const id of unbuilt) {
    for (const item of BLUEPRINTS[id].buildCost) {
      if ((state.store[item.resource] ?? 0) < item.qty) pending.add(item.resource);
    }
  }
  for (const resource of SELL_ORDER) {
    if (pending.has(resource)) continue;
    const qty = sellableAmount(state, resource);
    if (qty > 0) return { kind: "sell", resource, qty };
  }
  return null;
};
const buildStep = (state) => {
  const unbuilt = unlockedBlueprints(state.tutorial).filter((id) => !state.machines.some((m) => m.blueprint === id));
  for (const blueprint of unbuilt) if (affordable(state, blueprint)) return { kind: "build", blueprint };
  return null;
};
const connectStep = (state) => {
  for (const machine of state.machines) {
    const plans = planConnections(state, machine.id);
    if (plans.length > 0) return { kind: "connect", machineId: machine.id, plans };
  }
  return null;
};

/** The yard ladder, identical for every row: only the branch argument differs. */
const ladderStep = (state) => nextYardStep(state);

/**
 * A1-1 census, two readings, both printed:
 *  - `legacy`   : the recorded definition, build AND upgrade both affordable (4/1800 base).
 *  - `pricedGe2`: rounds carrying at least two *distinct cost-bearing options* the
 *                player can pay for at that instant. Since the fork one paid level
 *                offers three named options at the same price, they count separately;
 *                the pre-fork ladder offered the same price under one unnamed label.
 */
function pricedOptions(state) {
  const options = [];
  const unbuilt = unlockedBlueprints(state.tutorial).filter((id) => !state.machines.some((m) => m.blueprint === id));
  for (const blueprint of unbuilt) if (affordable(state, blueprint)) options.push("build:" + blueprint);
  const upgrade = upgradeCandidate(state);
  if (upgrade) {
    const machine = state.machines.find((m) => m.id === upgrade.machineId);
    const cost = upgradeCost(BLUEPRINTS[machine.blueprint].baseUpgradeCost, machine.level);
    for (const branch of ["speed", "buffer", "draw"]) options.push("upgrade:" + branch + ":" + cost);
  }
  if (droneStep(state)) options.push("drone:" + droneAddCost(state));
  if (researchStep(state)) options.push("research:" + researchStep(state).node);
  const sell = sellStep(state);
  if (sell) options.push("sell:" + sell.resource);
  return options;
}

function tutorialAction(state) {
  const step = state.tutorial;
  if (step <= 1) return [{ type: "manual.salvage" }];
  if (step === 2) return [{ type: "drone.repair" }];
  if (step <= 6) {
    if (state.machines.length === 0) return [{ type: "machine.build", blueprint: "sorter", tile: 8 }];
    if (state.routes.length === 0) return [
      { type: "route.connect", from: 0, to: 1, filter: "scrap" },
      { type: "route.connect", from: 1, to: 0, filter: "ferrous" },
    ];
    if (!state.machines.some((m) => m.blueprint === "furnace")) {
      const ready = (state.store.scrap ?? 0) >= 10 && (state.store.ferrous ?? 0) >= 5;
      if (ready) return [{ type: "machine.build", blueprint: "furnace", tile: 9 }];
    }
    const furnace = state.machines.find((m) => m.blueprint === "furnace");
    if (furnace) {
      const plans = planConnections(state, furnace.id);
      if (plans.length > 0) return plans.map((plan) => ({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter }));
    }
    return [{ type: "manual.salvage" }];
  }
  if (step === 7) return [{ type: "contract.export" }];
  return null;
}

function signature(step) {
  switch (step.kind) {
    case "build": return step.blueprint;
    case "upgrade": return "m" + step.machineId;
    case "sell": return step.resource + ":" + step.qty;
    case "research": return step.node;
    case "connect": return step.plans.map((p) => p.from + ">" + p.to + ":" + (p.filter ?? "*")).join("|");
    default: return "-";
  }
}

const pct = (part, whole) => (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0 ? 0 : Math.round((part / whole) * 100));

/** One row: the same ladder, one named outcome per level (or none at all). */
function run(rowName, branch) {
  let seq = 0, taps = 0, rejects = 0;
  const state = createInitialState();
  const send = (body) => {
    seq += 1;
    const result = applyCommand(state, { ...body, id: "c" + rowName + "-" + seq });
    if (result.ok) return true;
    rejects += 1;
    return false;
  };
  // Fixed boot: identical command prefix for every row, so the seed is shared.
  for (let i = 0; i < 6; i += 1) { send({ type: "manual.salvage" }); advance(state, TUNING.manualPulseTicks); }
  send({ type: "drone.repair" });
  advance(state, 262);
  taps += 7;

  const kinds = {};
  const milestones = { firstDrone: null, firstResearch: null, tutorialDone: null };
  let powerLimitedRounds = 0, minPowerRatio = 1, legacyAmbiguous = 0, pricedGe2 = 0;
  const branchByLevel = [];

  for (let round = 0; round < ROUNDS; round += 1) {
    if (!state.exportClaimed && (state.store.steel ?? 0) >= TUNING.exportContractSteel) { send({ type: "contract.export" }); taps += 1; }
    const tutorial = tutorialAction(state);
    let chosen;
    if (tutorial) {
      for (const body of tutorial) send(body);
      taps += 1;
    } else {
      chosen = ladderStep(state);
      if (chosen && chosen.kind) {
        if (chosen.kind !== "salvage") kinds[chosen.kind] = (kinds[chosen.kind] ?? 0) + 1;
        switch (chosen.kind) {
          case "connect":
            for (const plan of chosen.plans) send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
            taps += 1; break;
          case "build":
            send({ type: "machine.build", blueprint: chosen.blueprint, tile: freeTile(state) });
            taps += 2; break;
          case "sell":
            send({ type: "contract.sell", resource: chosen.resource, qty: chosen.qty });
            taps += 1; break;
          case "research":
            send({ type: "research.buy", node: chosen.node });
            taps += 1;
            if (milestones.firstResearch === null) milestones.firstResearch = round + 1; break;
          case "drone":
            send({ type: "drone.add" });
            taps += 1;
            if (milestones.firstDrone === null) milestones.firstDrone = round + 1; break;
          case "upgrade": {
            const before = state.machines.find((m) => m.id === chosen.machineId)?.level ?? 0;
            send(branch === null
              ? { type: "machine.upgrade", machineId: chosen.machineId }
              : { type: "machine.upgrade", machineId: chosen.machineId, branch });
            taps += 1;
            branchByLevel.push((round + 1) + ":m" + chosen.machineId + ":L" + before + "->" + (branch ?? "unnamed"));
            break;
          }
          default:
            send({ type: "manual.salvage" });
            taps += 1;
        }
      }
    }
    if (milestones.tutorialDone === null && state.tutorial >= 9) milestones.tutorialDone = round + 1;
    // A1-1 census, both readings, same round.
    if (buildStep(state) !== null && upgradeCandidate(state) !== null) legacyAmbiguous += 1;
    if (pricedOptions(state).length >= 2) pricedGe2 += 1;
    advance(state, 10);
    if (state.powerRatio < 1) powerLimitedRounds += 1;
    if (state.powerRatio < minPowerRatio) minPowerRatio = state.powerRatio;
  }

  const drawRank = (m) => (m.branch ?? []).filter((b) => b === "draw").length;
  return {
    policy: rowName,
    branch,
    tick: state.tick,
    machines: state.machines.length,
    links: state.routes.length,
    drones: 1 + state.spares.length,
    batches: state.machines.reduce((sum, m) => sum + m.batchesDone, 0),
    credits: Math.round(state.credits),
    nodes: Object.keys(state.research).length,
    taps,
    commands: seq,
    rejects,
    milestones,
    kinds,
    powerLimitedRounds,
    minPowerRatio: Number(minPowerRatio.toFixed(3)),
    legacyAmbiguous,
    pricedGe2,
    levels: state.machines.map((m) => m.blueprint + ":L" + m.level + (m.branch ? "[" + m.branch.join(",") + "]" : "")).join(" "),
    branchByLevel,
    stages: state.machines.map((m) => ({
      id: m.id,
      blueprint: m.blueprint,
      level: m.level,
      branch: m.branch ? m.branch.join(",") : "unnamed",
      starved: pct(Math.min(m.starvedTicks, m.ageTicks), m.ageTicks),
      busy: pct(m.busyTicks, m.ageTicks),
      full: pct(Math.min(m.fullTicks, m.ageTicks), m.ageTicks),
      batches: m.batchesDone,
      batchMilli: m.batchMilli,
      // Draw as paid this tick: recipe power minus the machine's own draw ranks.
      draw: Math.max(1, RECIPES[BLUEPRINTS[m.blueprint].recipeId].power - drawRank(m)),
    })),
  };
}

const ROWS = [
  ["naive (unnamed)", null],
  ["speed", "speed"],
  ["buffer", "buffer"],
  ["draw", "draw"],
];

const results = ROWS.map(([name, branch]) => run(name, branch));

// A1-2 lead census: for every recorded metric, which rows hold the best value.
const metrics = {
  batches: (r) => r.batches,
  starvedMax: (r) => Math.max(...r.stages.map((s) => s.starved)),
  starvedMean: (r) => Math.round(r.stages.reduce((sum, s) => sum + s.starved, 0) / Math.max(1, r.stages.length)),
  minPowerRatio: (r) => r.minPowerRatio,
  powerLimitedRounds: (r) => r.powerLimitedRounds,
  taps: (r) => r.taps,
  rejects: (r) => r.rejects,
  firstDrone: (r) => r.milestones.firstDrone ?? 9999,
  firstResearch: (r) => r.milestones.firstResearch ?? 9999,
  nodes: (r) => r.nodes,
};
const lowerWins = new Set(["taps", "rejects", "starvedMax", "starvedMean", "firstDrone", "firstResearch", "powerLimitedRounds"]);
const leads = {};
for (const [metric, read] of Object.entries(metrics)) {
  const values = results.map((r) => Number(read(r)));
  const best = lowerWins.has(metric) ? Math.min(...values) : Math.max(...values);
  leads[metric] = results.filter((r, i) => values[i] === best).map((r) => r.policy);
}

mkdirSync("work/feedback", { recursive: true });
writeFileSync(TARGET, JSON.stringify({
  baseSha: "24daf0e4d5d27000ab9b0841fa8a2d236aefa045",
  method: "harness: deterministic simulation, one command per round, 10 ticks apart, 1800 rounds = 18 000 ticks, shared boot, one named outcome per row",
  rows: results.map(({ stages, branchByLevel, ...rest }) => rest),
  stages: Object.fromEntries(results.map((r) => [r.policy, r.stages])),
  branchByLevel: Object.fromEntries(results.map((r) => [r.policy, r.branchByLevel])),
  leads,
}, null, 1), "utf8");

for (const r of results) {
  console.log(
    r.policy + ": tick=" + r.tick + " machines=" + r.machines + " links=" + r.links + " drones=" + r.drones +
      " batches=" + r.batches + " credits=" + r.credits + " nodes=" + r.nodes + " taps=" + r.taps +
      " rejects=" + r.rejects + " powerLimited=" + r.powerLimitedRounds + " minPower=" + r.minPowerRatio +
      " >=2affordable=" + r.pricedGe2 + " legacyAmbiguous=" + r.legacyAmbiguous +
      " firstDrone=" + (r.milestones.firstDrone ?? "-") + " firstResearch=" + (r.milestones.firstResearch ?? "-")
  );
  console.log("   stages: " + JSON.stringify(r.stages.map((s) => s.blueprint + " L" + s.level + " " + s.branch + " starved" + s.starved + " busy" + s.busy + " x" + s.batches + " milli" + s.batchMilli + " draw" + s.draw)));
  console.log("   levels: " + r.levels);
}
console.log("leads: " + JSON.stringify(leads));
console.log("branch picks (speed row): " + JSON.stringify(results[1].branchByLevel));
console.log("wrote " + TARGET);
