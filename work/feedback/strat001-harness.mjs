// STRAT-001 g1 harness: three policies over one deterministic starter yard.
// Method: harness (deterministic simulation). Only the priority order between ladder
// stages changes per policy. Boot mirrors tests/simulation/chain.test.ts.
// Run: npx tsx work/feedback/strat001-harness.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { BLUEPRINTS, RECIPES, TUNING, unlockedBlueprints } from "../../src/game/content/defs";
import { nextResearchNode } from "../../src/game/content/research";
import { applyCommand, DOCK_TILE, YARD_TILES, droneAddCost, sellableAmount, upgradeCost } from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { SELL_ORDER, nextYardStep } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState } from "../../src/game/simulation/types";

const ROUNDS = 1800;
const TARGET = "work/feedback/strat001-harness.json";

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
const powerUsed = (state) =>
  state.machines.reduce((sum, m) => sum + RECIPES[BLUEPRINTS[m.blueprint].recipeId].power, 0);
const upgradeCandidate = (state, lowestLevelFirst) => {
  let best = null;
  for (const machine of state.machines) {
    const def = BLUEPRINTS[machine.blueprint];
    if (!def) continue;
    if (state.credits < upgradeCost(def.baseUpgradeCost, machine.level)) continue;
    const busy = machine.busyTicks ?? 0;
    const better = !best || (lowestLevelFirst
      ? machine.level < best.level || (machine.level === best.level && busy > best.busy)
      : busy > best.busy);
    if (better) best = { machineId: machine.id, level: machine.level, busy };
  }
  return best ? { kind: "upgrade", machineId: best.machineId } : null;
};
const researchStep = (state) => {
  const node = nextResearchNode(state);
  return node && (state.store.data ?? 0) >= node.cost ? { kind: "research", node: node.id } : null;
};
const droneStep = (state, cap) => {
  if (!state.drone.repaired) return null;
  if (1 + state.spares.length >= cap) return null;
  if (state.credits < droneAddCost(state)) return null;
  return { kind: "drone" };
};
const sellStep = (state, skipPending) => {
  const unbuilt = unlockedBlueprints(state.tutorial).filter((id) => !state.machines.some((m) => m.blueprint === id));
  const pending = new Set();
  if (skipPending) {
    for (const id of unbuilt) {
      for (const item of BLUEPRINTS[id].buildCost) {
        if ((state.store[item.resource] ?? 0) < item.qty) pending.add(item.resource);
      }
    }
  }
  for (const resource of SELL_ORDER) {
    if (pending.has(resource)) continue;
    const qty = sellableAmount(state, resource);
    if (qty > 0) return { kind: "sell", resource, qty };
  }
  return null;
};
const buildStep = (state, powerGate) => {
  const unbuilt = unlockedBlueprints(state.tutorial).filter((id) => !state.machines.some((m) => m.blueprint === id));
  for (const blueprint of unbuilt) {
    const power = RECIPES[BLUEPRINTS[blueprint].recipeId].power;
    if (!affordable(state, blueprint)) continue;
    if (powerUsed(state) + power > powerGate) continue;
    return { kind: "build", blueprint };
  }
  return null;
};
const nearBuildStep = (state) => {
  const unbuilt = unlockedBlueprints(state.tutorial).filter((id) => !state.machines.some((m) => m.blueprint === id));
  if (unbuilt.length === 0) return null;
  let best = unbuilt[0];
  let bestShortfall = Infinity;
  for (const id of unbuilt) {
    let shortfall = 0;
    for (const item of BLUEPRINTS[id].buildCost) shortfall += Math.max(0, item.qty - (state.store[item.resource] ?? 0));
    if (shortfall < bestShortfall) { best = id; bestShortfall = shortfall; }
  }
  return { kind: "build", blueprint: best };
};
const connectStep = (state) => {
  for (const machine of state.machines) {
    const plans = planConnections(state, machine.id);
    if (plans.length > 0) return { kind: "connect", machineId: machine.id, plans };
  }
  return null;
};

const naiveStep = (state) => nextYardStep(state);
const throughputStep = (state) =>
  connectStep(state) ?? buildStep(state, Infinity) ?? droneStep(state, TUNING.fleetCap) ??
  researchStep(state) ?? sellStep(state, false) ?? upgradeCandidate(state, false) ??
  nearBuildStep(state) ?? { kind: "salvage" };
const efficiencyStep = (state) =>
  connectStep(state) ?? researchStep(state) ?? upgradeCandidate(state, true) ??
  buildStep(state, TUNING.yardPowerCapacity) ?? sellStep(state, true) ??
  droneStep(state, 3) ?? nearBuildStep(state) ?? { kind: "salvage" };

const POLICIES = { "P1 naive": naiveStep, "P2 throughput": throughputStep, "P3 efficiency": efficiencyStep };

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
function availableKinds(state) {
  const out = [];
  if (connectStep(state)) out.push("connect");
  if (buildStep(state, Infinity)) out.push("build");
  if (researchStep(state)) out.push("research");
  if (droneStep(state, TUNING.fleetCap)) out.push("drone");
  if (upgradeCandidate(state, true)) out.push("upgrade");
  if (sellStep(state, false)) out.push("sell");
  out.push("salvage");
  return out;
}
const pct = (part, whole) => (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0 ? 0 : Math.round((part / whole) * 100));

function run(policyName, options) {
  const opts = options || {};
  const overrideAt = opts.overrideAt ?? null;
  const override = opts.override ?? null;
  const step = POLICIES[policyName];
  let seq = 0, taps = 0, rejects = 0;
  const state = createInitialState();
  const send = (body) => {
    seq += 1;
    const result = applyCommand(state, { ...body, id: "c" + policyName + "-" + seq });
    if (result.ok) return true;
    rejects += 1;
    return false;
  };
  for (let i = 0; i < 6; i += 1) { send({ type: "manual.salvage" }); advance(state, TUNING.manualPulseTicks); }
  send({ type: "drone.repair" });
  advance(state, 262);
  taps += 7;

  const actions = [], kinds = {};
  const milestones = { firstDrone: null, firstResearch: null, tutorialDone: null, built: [] };
  const choiceCensus = { one: 0, two: 0, threePlus: 0 };
  let powerLimitedRounds = 0, minPowerRatio = 1, ambiguous = 0;

  for (let round = 0; round < ROUNDS; round += 1) {
    if (!state.exportClaimed && (state.store.steel ?? 0) >= TUNING.exportContractSteel) { send({ type: "contract.export" }); taps += 1; }
    const tutorial = tutorialAction(state);
    let chosen;
    if (tutorial) {
      for (const body of tutorial) send(body);
      taps += 1;
      actions.push(round + 1 + ":tutorial:" + tutorial[0].type);
    } else {
      chosen = step(state);
      if (overrideAt !== null && round + 1 === overrideAt) chosen = override;
      if (chosen && chosen.kind) {
        if (chosen.kind !== "salvage") kinds[chosen.kind] = (kinds[chosen.kind] ?? 0) + 1;
        switch (chosen.kind) {
          case "connect":
            for (const plan of chosen.plans) send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
            taps += 1; break;
          case "build":
            send({ type: "machine.build", blueprint: chosen.blueprint, tile: freeTile(state) });
            taps += 2;
            milestones.built.push(chosen.blueprint + "@" + (round + 1)); break;
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
          case "upgrade":
            send({ type: "machine.upgrade", machineId: chosen.machineId });
            taps += 1; break;
          default:
            send({ type: "manual.salvage" });
            taps += 1;
        }
        actions.push(round + 1 + ":" + chosen.kind + ":" + signature(chosen));
      }
    }
    if (milestones.tutorialDone === null && state.tutorial >= 9) milestones.tutorialDone = round + 1;
    const available = availableKinds(state);
    if (available.length >= 3) choiceCensus.threePlus += 1; else if (available.length === 2) choiceCensus.two += 1; else choiceCensus.one += 1;
    if (buildStep(state, Infinity) !== null && upgradeCandidate(state, true) !== null) ambiguous += 1;
    advance(state, 10);
    if (state.powerRatio < 1) powerLimitedRounds += 1;
    minPowerRatio = Math.min(minPowerRatio, state.powerRatio);
  }

  return {
    policy: policyName, actions, kinds, taps, commands: seq, rejects,
    tick: state.tick, machines: state.machines.length, links: state.routes.length,
    drones: 1 + state.spares.length,
    batches: state.machines.reduce((sum, m) => sum + m.batchesDone, 0),
    credits: Math.round(state.credits), nodes: Object.keys(state.research).length,
    store: Object.entries(state.store).filter(([, v]) => v > 0).map(([k, v]) => k + "=" + v).join(" "),
    levels: state.machines.map((m) => m.blueprint + ":L" + m.level).join(" "),
    milestones, choiceCensus, ambiguous, powerLimitedRounds,
    minPowerRatio: Number(minPowerRatio.toFixed(3)),
    machineTable: state.machines.map((m) => ({
      id: m.id, blueprint: m.blueprint, level: m.level,
      busy: pct(m.busyTicks, m.ageTicks), starved: pct(Math.min(m.starvedTicks, m.ageTicks), m.ageTicks),
      full: pct(Math.min(m.fullTicks, m.ageTicks), m.ageTicks), batches: m.batchesDone,
      status: m.status, power: RECIPES[BLUEPRINTS[m.blueprint].recipeId].power,
    })),
  };
}

const firstDifference = (a, b) => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return i + 1;
  return a.length === b.length ? null : n + 1;
};

const results = {};
for (const name of Object.keys(POLICIES)) results[name] = run(name, {});
const naive = results["P1 naive"], p2 = results["P2 throughput"], p3 = results["P3 efficiency"];
const bootTicks = naive.tick - ROUNDS * 10;
const tickAt = (round) => (round == null ? null : bootTicks + round * 10);
const at = (arr, i) => (i == null ? null : arr[i - 1] ?? null);
const dP1P2 = firstDifference(naive.actions, p2.actions);
const dP1P3 = firstDifference(naive.actions, p3.actions);
const dP2P3 = firstDifference(p2.actions, p3.actions);

const probeRound = (naive.actions.findIndex((a) => a.includes(":build:")) + 1) || 1;
const forced = run("P1 naive", { overrideAt: probeRound, override: { kind: "upgrade", machineId: 1 } });
const skipped = run("P1 naive", { overrideAt: naive.milestones.firstDrone ?? 1, override: null });

const rows = Object.values(results).map((r) => ({
  policy: r.policy, tick: r.tick, machines: r.machines, links: r.links, drones: r.drones,
  batches: r.batches, credits: r.credits, nodes: r.nodes, taps: r.taps, commands: r.commands,
  rejects: r.rejects, firstDrone: r.milestones.firstDrone, firstResearch: r.milestones.firstResearch,
  tutorialDone: r.milestones.tutorialDone, twoChoiceRounds: r.choiceCensus.two,
  threePlusChoiceRounds: r.choiceCensus.threePlus, ambiguous: r.ambiguous,
  powerLimitedRounds: r.powerLimitedRounds, minPowerRatio: r.minPowerRatio,
  levels: r.levels, store: r.store, kinds: r.kinds, firstBuilds: r.milestones.built.slice(0, 10).join(","),
}));

const divergences = {
  p1_vs_p2_round: dP1P2, p1_vs_p2_tick: tickAt(dP1P2), p1_vs_p2_actionA: at(naive.actions, dP1P2), p1_vs_p2_actionB: at(p2.actions, dP1P2),
  p1_vs_p3_round: dP1P3, p1_vs_p3_tick: tickAt(dP1P3), p1_vs_p3_actionA: at(naive.actions, dP1P3), p1_vs_p3_actionB: at(p3.actions, dP1P3),
  p2_vs_p3_round: dP2P3, p2_vs_p3_tick: tickAt(dP2P3), p2_vs_p3_actionA: at(p2.actions, dP2P3), p2_vs_p3_actionB: at(p3.actions, dP2P3),
};
const recovery = {
  forcedUpgradeRound: probeRound,
  forcedUpgrade: {
    baseline: { batches: naive.batches, credits: naive.credits, machines: naive.machines, taps: naive.taps },
    actual: { batches: forced.batches, credits: forced.credits, machines: forced.machines, taps: forced.taps },
  },
  skipFirstDroneRound: naive.milestones.firstDrone,
  skipFirstDrone: {
    baseline: { batches: naive.batches, credits: naive.credits, drones: naive.drones },
    actual: { batches: skipped.batches, credits: skipped.credits, drones: skipped.drones },
  },
};

mkdirSync("work/feedback", { recursive: true });
writeFileSync(TARGET, JSON.stringify({
  baseSha: "24daf0e4d5d27000ab9b0841fa8a2d236aefa045",
  method: "harness: deterministic simulation, one command per round, 10 ticks apart, 1800 rounds",
  rows, divergences, recovery,
  machineTables: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.machineTable])),
}, null, 1), "utf8");

for (const row of rows) {
  console.log(row.policy + ": tick=" + row.tick + " machines=" + row.machines + " links=" + row.links + " drones=" + row.drones +
    " batches=" + row.batches + " credits=" + row.credits + " nodes=" + row.nodes + " taps=" + row.taps +
    " rejects=" + row.rejects + " firstDrone=" + row.firstDrone + " firstResearch=" + row.firstResearch +
    " powerLimited=" + row.powerLimitedRounds + " minPower=" + row.minPowerRatio +
    " 2way=" + row.twoChoiceRounds + " 3way=" + row.threePlusChoiceRounds + " ambiguous=" + row.ambiguous);
}
console.log("divergences: " + JSON.stringify(divergences));
console.log("recovery: " + JSON.stringify(recovery));
console.log("builds P1: " + rows[0].firstBuilds);
console.log("builds P2: " + rows[1].firstBuilds);
console.log("builds P3: " + rows[2].firstBuilds);
console.log("levels P1: " + rows[0].levels);
console.log("levels P2: " + rows[1].levels);
console.log("levels P3: " + rows[2].levels);
console.log("tableP1: " + JSON.stringify(naive.machineTable));
console.log("tableP2: " + JSON.stringify(p2.machineTable));
console.log("tableP3: " + JSON.stringify(p3.machineTable));
console.log("store P1: " + rows[0].store + " | P2: " + rows[1].store + " | P3: " + rows[2].store);
console.log("kinds P1: " + JSON.stringify(rows[0].kinds) + " P2: " + JSON.stringify(rows[1].kinds) + " P3: " + JSON.stringify(rows[2].kinds));
console.log("wrote " + TARGET);
