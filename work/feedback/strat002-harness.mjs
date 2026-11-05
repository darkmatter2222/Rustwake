// STRAT-002 g2 harness: the named-outcome fork measured one branch per run, scored by
// the A1-2v2 primary column set (work/product/STRAT-002-decision-g2.md, section 1.2).
// Method: deterministic simulation, one command per round, 10 ticks apart, 1800 rounds
// = 18 000 ticks. Boot and cadence mirror work/feedback/strat001-harness.mjs (same
// seed: the same fixed command prefix, no Math.random anywhere), so the only difference
// between rows is which named outcome the upgrade command carried.
//
// Two tables come off the same engine:
//  - regular   : the g1 cadence, unchanged (one command per round, 10 ticks apart).
//  - irregular : the section 1.4 ladder - the same 1800 rounds and the same tick
//                budget, with the wreck pulse gated into bursts so the store's inflow
//                carries real gaps. See SUPPLY_PATTERN.
//
// A1-2v2 rules honoured here:
//  - the scored table is the three NAMED rows; the unnamed row is reported as the
//    by-construction speed twin and excluded from the lead census,
//  - the residual rows[].credits is reported but is not a primary column (R2),
//  - pick attribution is printed per row: kinds.upgrade = command attempts,
//    sum(level-1) = purchased levels, branchByLevel.length = recorded picks (R4).
//
// Run: npx tsx work/feedback/strat002-harness.mjs
// Plain `node` cannot load it: the imports below are TypeScript modules and need the
// tsx loader.
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
const BASE_SHA = "c2842e1c853a146f22afda5667e7410253f88ddf";
const NAMED = ["speed", "buffer", "draw"];
const TWIN = "naive (unnamed)";

/**
 * Irregular-supply ladder (decision section 1.4), the smallest change that can make the
 * input buffer bite: the wreck pulse is gated instead of firing every round.
 * Period 9 with 5 pulsed and 4 silent rounds, so 1800 rounds hold exactly 200 whole
 * periods: 1000 pulsed rounds (+5 scrap each, TUNING.manualSalvagePerPulse) alternate
 * with 800 rounds where the only inflow is the fleet's own delivery (5 units per
 * TUNING.droneDeliveryTicks per unit). During a 4-round gap the store falls to the
 * reserve floor, store-sourced links stop drawing, and a machine keeps working only
 * from the units it already holds in hand - which is exactly what a buffer rank buys
 * (engine `pullNeed`: perBatch * (PULL_LOOKAHEAD_BATCHES + bufferRanks) + bonus,
 * capped by inputCapacityOf). One gated line, no engine change, identical tick budget.
 */
const SUPPLY_PATTERN = {
  name: "irregular",
  periodRounds: 9,
  pulsedRounds: 5,
  silentRounds: 4,
  periods: ROUNDS / 9,
  pulsePerRound: TUNING.manualSalvagePerPulse,
  note:
    "manual.salvage fires only while round % 9 < 5; the other 4 rounds of every period " +
    "run on the fleet's own deliveries alone, so the store's inflow has 4-round gaps",
};
const pulseThisRound = (round) => round % SUPPLY_PATTERN.periodRounds < SUPPLY_PATTERN.pulsedRounds;

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

const pct = (part, whole) => (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0 ? 0 : Math.round((part / whole) * 100));

/**
 * One row: the same ladder, one named outcome per level (or none at all).
 * `pattern` is "regular" (the g1 cadence) or "irregular" (gated wreck pulse).
 */
function run(rowName, branch, pattern) {
  let seq = 0, taps = 0, rejects = 0, creditsEarned = 0, pulses = 0;
  const state = createInitialState();
  const send = (body) => {
    seq += 1;
    const before = state.credits;
    const result = applyCommand(state, { ...body, id: "c" + rowName + "-" + seq });
    const delta = state.credits - before;
    if (delta > 0) creditsEarned += delta;
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
  // Supply-shape diagnostics (reported, not scored): how far the store's scrap falls
  // and how many rounds it sits at the reserve floor, i.e. rounds where a
  // store-sourced link cannot draw at all (engine `pullFromStore`: available =
  // store - TUNING.reserveFloor).
  let scrapMin = Number.POSITIVE_INFINITY, scrapMax = 0, floorRounds = 0;
  const branchByLevel = [];

  for (let round = 0; round < ROUNDS; round += 1) {
    if (!state.exportClaimed && (state.store.steel ?? 0) >= TUNING.exportContractSteel) { send({ type: "contract.export" }); taps += 1; }
    // The one difference between the two tables: the gated wreck pulse.
    if (pattern === "irregular" && pulseThisRound(round)) { send({ type: "manual.salvage" }); pulses += 1; taps += 1; }
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
    const scrap = state.store.scrap ?? 0;
    if (scrap < scrapMin) scrapMin = scrap;
    if (scrap > scrapMax) scrapMax = scrap;
    if (scrap <= TUNING.reserveFloor) floorRounds += 1;
  }

  const drawRank = (m) => (m.branch ?? []).filter((b) => b === "draw").length;
  const stages = state.machines.map((m) => ({
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
  }));
  const starvedMax = Math.max(...stages.map((s) => s.starved));
  const starvedMean = Math.round(stages.reduce((sum, s) => sum + s.starved, 0) / Math.max(1, stages.length));
  const batches = state.machines.reduce((sum, m) => sum + m.batchesDone, 0);
  const purchasedLevels = stages.reduce((sum, s) => sum + (s.level - 1), 0);
  return {
    policy: rowName,
    branch,
    tick: state.tick,
    machines: state.machines.length,
    links: state.routes.length,
    drones: 1 + state.spares.length,
    batches,
    credits: Math.round(state.credits),
    creditsEarned,
    creditsPer1000Batches: Number(((creditsEarned / Math.max(1, batches)) * 1000).toFixed(3)),
    nodes: Object.keys(state.research).length,
    taps,
    commands: seq,
    rejects,
    pulses,
    milestones,
    kinds,
    powerLimitedRounds,
    minPowerRatio: Number(minPowerRatio.toFixed(3)),
    starvedMax,
    starvedMean,
    legacyAmbiguous,
    pricedGe2,
    purchasedLevels,
    scrapMin: Number.isFinite(scrapMin) ? scrapMin : 0,
    scrapMax,
    floorRounds,
    levels: state.machines.map((m) => m.blueprint + ":L" + m.level + (m.branch ? "[" + m.branch.join(",") + "]" : "")).join(" "),
    branchByLevel,
    stages,
  };
}

/**
 * A1-2v2 primary column set, named by exact field. `credits` is deliberately absent
 * (R2: the residual balance cannot satisfy R1); `creditsEarned` and
 * `creditsPer1000Batches` replace it as the earned reading.
 */
const PRIMARY = {
  batches: { read: (r) => r.batches, higherWins: true },
  powerLimitedRounds: { read: (r) => r.powerLimitedRounds, higherWins: false },
  minPowerRatio: { read: (r) => r.minPowerRatio, higherWins: true },
  rejects: { read: (r) => r.rejects, higherWins: false },
  taps: { read: (r) => r.taps, higherWins: false },
  "milestones.firstResearch": { read: (r) => r.milestones.firstResearch ?? 9999, higherWins: false },
  starvedMax: { read: (r) => r.starvedMax, higherWins: false },
  starvedMean: { read: (r) => r.starvedMean, higherWins: false },
  creditsEarned: { read: (r) => r.creditsEarned, higherWins: true },
  creditsPer1000Batches: { read: (r) => r.creditsPer1000Batches, higherWins: true },
};
/** The mechanism-adjacent columns the buffer branch is judged on (decision 1.2). */
const MECHANISM = ["starvedMax", "starvedMean", "creditsPer1000Batches"];
const GAP = { relative: 0.05, absolute: 10, batchesLead: 900, drawZero: 200, drawRatio: 0.25 };

const namedRows = (rows) => rows.filter((r) => NAMED.includes(r.policy));

/** Lead census over the NAMED rows only; the twin is excluded from scoring (R1). */
function leadCensus(rows, useAll) {
  const pool = useAll ? rows : namedRows(rows);
  const census = {};
  for (const [column, spec] of Object.entries(PRIMARY)) {
    const values = pool.map((r) => Number(spec.read(r)));
    const best = spec.higherWins ? Math.max(...values) : Math.min(...values);
    census[column] = pool.filter((r, i) => values[i] === best).map((r) => r.policy);
  }
  return census;
}

/** Gap between one owner and the strongest RIVAL among the named rows. */
function gapOf(rows, policy, column) {
  const spec = PRIMARY[column];
  const owner = rows.find((r) => r.policy === policy);
  const rivals = namedRows(rows).filter((r) => r.policy !== policy).map((r) => Number(spec.read(r)));
  const own = Number(spec.read(owner));
  const rival = spec.higherWins ? Math.max(...rivals) : Math.min(...rivals);
  const absolute = spec.higherWins ? own - rival : rival - own;
  const relative = rival === 0 ? (absolute === 0 ? 0 : 1) : absolute / rival;
  return { own, rival, absolute: Number(absolute.toFixed(3)), relative: Number(relative.toFixed(4)) };
}

/** Owns the column = sole best value among the named rows. */
const soleLeader = (census, column, policy) => census[column].length === 1 && census[column][0] === policy;

/** R1/R3/R4 plus the per-branch numeric gaps, as A1-2v2 states them. */
function verdicts(rows) {
  const census = leadCensus(rows, false);
  const out = {};
  for (const policy of NAMED) {
    const led = Object.keys(PRIMARY).filter((column) => census[column].includes(policy));
    const record = { leads: led, leadCount: led.length, r1: led.length >= 1 };
    if (policy === "speed") {
      const gap = gapOf(rows, policy, "batches");
      record.column = "batches";
      record.gap = gap;
      record.required = "batches lead by >= 900 over each other named branch";
      record.pass = soleLeader(census, "batches", policy) && gap.absolute >= GAP.batchesLead;
    } else if (policy === "draw") {
      const power = gapOf(rows, policy, "powerLimitedRounds");
      const ratio = gapOf(rows, policy, "minPowerRatio");
      const othersLimited = namedRows(rows)
        .filter((r) => r.policy !== "draw")
        .map((r) => r.powerLimitedRounds);
      record.column = "powerLimitedRounds + minPowerRatio";
      record.power = power;
      record.ratio = ratio;
      record.required = "powerLimitedRounds = 0 with both others >= 200, minPowerRatio gap >= 0.25";
      record.pass =
        soleLeader(census, "powerLimitedRounds", policy) &&
        power.own === 0 &&
        othersLimited.every((value) => value >= GAP.drawZero) &&
        soleLeader(census, "minPowerRatio", policy) &&
        ratio.absolute >= GAP.drawRatio;
    } else {
      // buffer: one mechanism-adjacent column by >= 5 % relative or >= 10 absolute.
      const owned = MECHANISM.filter((column) => soleLeader(census, column, policy));
      record.columns = MECHANISM.map((column) => ({ column, sole: soleLeader(census, column, policy), gap: gapOf(rows, policy, column) }));
      record.required = "leads one mechanism-adjacent column by >= 5 % relative or >= 10 absolute";
      const best = owned
        .map((column) => ({ column, gap: gapOf(rows, policy, column) }))
        .filter((entry) => entry.gap.absolute >= GAP.absolute || entry.gap.relative >= GAP.relative)
        .sort((a, b) => b.gap.relative - a.gap.relative)[0];
      record.column = best ? best.column : null;
      record.gap = best ? best.gap : null;
      record.pass = best !== undefined;
    }
    out[policy] = record;
  }
  const twin = rows.find((r) => r.policy === TWIN);
  const speed = rows.find((r) => r.policy === "speed");
  // R3: the twin identity is printed next to the scored rows, and asserted in tests.
  out[TWIN] = twinIdentity(twin, speed);
  return out;
}

const SCALAR_COLUMNS = [
  "tick", "machines", "links", "drones", "batches", "credits", "creditsEarned", "creditsPer1000Batches",
  "nodes", "taps", "commands", "rejects", "pulses", "powerLimitedRounds", "minPowerRatio", "starvedMax",
  "starvedMean", "legacyAmbiguous", "pricedGe2", "purchasedLevels", "scrapMin", "scrapMax", "floorRounds",
];

/** `levels` carries the branch names, so the identity reads it with the annotation off:
 * "sorter:L16[speed,...]" and "sorter:L16" are the same ladder at the same level. */
const stripBranches = (levels) => levels.replace(/\[[^\]]*\]/g, "");

/** R3: the unnamed row is the speed twin on every scalar column and all kinds counters. */
function twinIdentity(twin, speed) {
  const scalars = SCALAR_COLUMNS.filter((column) => JSON.stringify(twin[column]) !== JSON.stringify(speed[column]));
  const kinds = JSON.stringify(twin.kinds) === JSON.stringify(speed.kinds);
  const levels = stripBranches(twin.levels) === stripBranches(speed.levels);
  return {
    twin: twin.policy,
    equalsSpeed: scalars.length === 0 && kinds && levels,
    differingScalarColumns: scalars,
    kindsEqual: kinds,
    levelsEqualIgnoringBranchAnnotation: levels,
  };
}

function attribution(rows) {
  const out = {};
  for (const r of namedRows(rows)) {
    out[r.policy] = {
      "kinds.upgrade": r.kinds.upgrade ?? 0,
      "sum(level-1)": r.purchasedLevels,
      branchByLevel: r.branchByLevel.length,
      reconciles: (r.kinds.upgrade ?? 0) === r.purchasedLevels,
    };
  }
  return out;
}

function table(rows) {
  const lines = [];
  for (const r of rows) {
    lines.push(
      r.policy + ": tick=" + r.tick + " machines=" + r.machines + " links=" + r.links + " drones=" + r.drones +
        " batches=" + r.batches + " credits=" + r.credits + " creditsEarned=" + r.creditsEarned +
        " creditsPer1000Batches=" + r.creditsPer1000Batches + " nodes=" + r.nodes + " taps=" + r.taps +
        " rejects=" + r.rejects + " pulses=" + r.pulses +
        " powerLimited=" + r.powerLimitedRounds + " minPower=" + r.minPowerRatio +
        " starvedMax=" + r.starvedMax + " starvedMean=" + r.starvedMean +
        " scrapMin=" + r.scrapMin + " scrapMax=" + r.scrapMax + " atFloor=" + r.floorRounds +
        " >=2affordable=" + r.pricedGe2 + " legacyAmbiguous=" + r.legacyAmbiguous +
        " firstDrone=" + (r.milestones.firstDrone ?? "-") + " firstResearch=" + (r.milestones.firstResearch ?? "-")
    );
    lines.push(
      "   stages: " + JSON.stringify(r.stages.map((s) => s.blueprint + " L" + s.level + " " + s.branch +
        " starved" + s.starved + " busy" + s.busy + " x" + s.batches + " milli" + s.batchMilli + " draw" + s.draw))
    );
    lines.push("   levels: " + r.levels);
    lines.push(
      "   picks: kinds.upgrade=" + (r.kinds.upgrade ?? 0) + " sum(level-1)=" + r.purchasedLevels +
        " branchByLevel=" + r.branchByLevel.length
    );
  }
  return lines;
}

function verdictLines(block) {
  const lines = [];
  for (const policy of NAMED) {
    const v = block[policy];
    const measurement = v.gap
      ? JSON.stringify(v.gap)
      : JSON.stringify({ powerLimitedRounds: v.power, minPowerRatio: v.ratio });
    lines.push(
      "  " + policy + ": leads=[" + v.leads.join(",") + "] r1=" + (v.r1 ? "pass" : "FAIL") +
        " gap=" + measurement + " -> owns " + (v.column ?? "nothing") + " [" + v.required + "] " +
        (v.pass ? "PASS" : "FAIL")
    );
    if (v.columns) lines.push("    mechanism columns: " + JSON.stringify(v.columns));
  }
  lines.push("  " + TWIN + " twin identity: " + JSON.stringify(block[TWIN]));
  return lines;
}

const patterns = [
  ["regular", null],
  ["irregular", SUPPLY_PATTERN],
];

const blocks = {};
for (const [patternName] of patterns) {
  const rows = [
    run(TWIN, null, patternName),
    ...NAMED.map((branch) => run(branch, branch, patternName)),
  ];
  blocks[patternName] = {
    supply: patternName === "regular" ? { name: "regular", note: "one command per round, 10 ticks apart, ungated wreck pulse (the g1 cadence)" } : SUPPLY_PATTERN,
    rows,
    stages: Object.fromEntries(rows.map((r) => [r.policy, r.stages])),
    branchByLevel: Object.fromEntries(rows.map((r) => [r.policy, r.branchByLevel])),
    leads: leadCensus(rows, false),
    leadsIncludingTwin: leadCensus(rows, true),
    attribution: attribution(rows),
    verdicts: verdicts(rows),
  };
}

mkdirSync("work/feedback", { recursive: true });
writeFileSync(TARGET, JSON.stringify({
  baseSha: BASE_SHA,
  method: "harness: deterministic simulation, one command per round, 10 ticks apart, 1800 rounds = 18 000 ticks, shared boot, one named outcome per row",
  criteria: "A1-2v2 (work/product/STRAT-002-decision-g2.md 1.2): scored table = named rows only; rows[].credits reported but not scored; starvedMax/starvedMean promoted out of stages[]; creditsEarned and creditsPer1000Batches added",
  primaryColumns: Object.keys(PRIMARY),
  mechanismColumns: MECHANISM,
  gaps: GAP,
  regular: blocks.regular,
  irregular: blocks.irregular,
}, null, 1), "utf8");

for (const name of ["regular", "irregular"]) {
  const block = blocks[name];
  console.log("== " + name + " supply (" + block.supply.name + ") ==");
  if (name === "irregular") console.log("  pattern: " + JSON.stringify(block.supply));
  console.log(table(block.rows).map((line) => "  " + line).join("\n"));
  console.log("  leads (named rows only): " + JSON.stringify(block.leads));
  console.log("  leads (twin included, not scored): " + JSON.stringify(block.leadsIncludingTwin));
  console.log("  A1-2v2 verdict, owns at least one column by the required gap:");
  console.log(verdictLines(block.verdicts).join("\n"));
}
console.log("census note: the >=2 affordable figure applies to the named row shown with it; " +
  "the twin is the by-construction speed row, so 121 is speed's count as well.");
console.log("wrote " + TARGET);
