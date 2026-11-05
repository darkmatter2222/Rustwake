// STRAT-002 g3 harness: the named-outcome fork measured one branch per run, scored by
// the A1-2v3 per-column MMG (work/product/STRAT-002-decision-g2.md, section 1.2 plus
// the `g2 addendum`). The addendum retires the `>= 5 % relative OR >= 10 absolute`
// disjunction (it is scale-blind) and adds one mechanism column, `inputStallPct`, on
// which `buffer` must lead by >= 3 points under BOTH gap ladders or be dropped
// (the fork then ships two plans, `speed` and `draw`; negative result, never re-scored).
// Method: deterministic simulation, one command per round, 10 ticks apart, 1800 rounds
// = 18 000 ticks. Boot and cadence mirror work/feedback/strat001-harness.mjs (same
// seed: the same fixed command prefix, no Math.random anywhere), so the only difference
// between rows is which named outcome the upgrade command carried.
//
// Three tables come off the same engine, 1800 rounds and the same tick budget each:
//  - regular   : the g1 cadence, unchanged (one command per round, 10 ticks apart).
//  - irregular : the g2 ladder, the wreck pulse gated 5-on/4-off (round % 9 < 5).
//  - gap6      : the g3 ladder, the wreck pulse gated 3-on/3-off (round % 6 < 3).
//
// A1-2v3 rules honoured here:
//  - the scored table is the three NAMED rows; the unnamed row is reported as the
//    by-construction speed twin and excluded from the lead census (R1),
//  - the residual rows[].credits is reported but is not a primary column (R2),
//  - pick attribution is printed per row: kinds.upgrade = command attempts,
//    sum(level-1) = purchased levels, branchByLevel.length = recorded picks (R4),
//  - `buffer` is judged on exactly one mechanism column, `inputStallPct`, by the
//    per-column minimum meaningful gap declared once in the `gaps` block and read by
//    tests/simulation/fork.test.ts,
//  - `creditsPer1000Batches` stays reported beside `creditsEarned` / `batches` and can
//    no longer satisfy R1 for any branch.
//
// Run: npx tsx work/feedback/strat002-harness.mjs
// Plain `node` cannot load it: the imports below are TypeScript modules and need the
// tsx loader.
import { mkdirSync, writeFileSync } from "node:fs";
import { BLUEPRINTS, RECIPES, TUNING, unlockedBlueprints } from "../../src/game/content/defs";
import { nextResearchNode } from "../../src/game/content/research";
import { applyCommand, branchPrice, DOCK_TILE, YARD_TILES, droneAddCost, sellableAmount, upgradeCost } from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { SELL_ORDER, nextYardStep } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState } from "../../src/game/simulation/types";

const ROUNDS = 1800;
const TARGET = "work/feedback/strat002-harness.json";
const BASE_SHA = "7d7e05c7124722857ba9828cff5dbd49df5ab04f";
const NAMED = ["speed", "buffer", "draw"];
const TWIN = "naive (unnamed)";
/** The two plans on the dock since the drop; the live pair the policy row chooses between. */
const LIVE = ["speed", "draw"];

/**
 * STRAT-003: the two live plans now cost different amounts (src/game/simulation/
 * commands.ts, `branchPrice`): the same plain ladder `ceil(base x 1.16^n)` plus a
 * per-branch integer premium derived from the rank's own first-step quantity
 * (`speed`: +1 of 10 clock-denominator = 10 % throughput -> +10 credits; `draw`/
 * `buffer`: the plain price, the baseline unit step of 1 power of 8). The price
 * table is an input to the engine's charge, and here to the `priced` policy row.
 */
const priceTable = (base, level) =>
  Object.fromEntries(LIVE.map((b) => [b, branchPrice(base, level, b)]));

/**
 * The purchase policy for the `priced` row, stated exactly (the ticket: cheapest-
 * first may not be the *only* tie-breaker):
 *  - PRIMARY: the resting power line the player sees. If the yard is visibly
 *    throttled (`powerRatio < 1`, i.e. the line reads below 100 %), prefer the
 *    power plan `draw`; otherwise prefer the throughput plan `speed`.
 *  - SECONDARY fallback: if the preferred plan's price is not covered by credits,
 *    take the cheapest remaining affordable plan by price, ties in dock order
 *    (`UPGRADE_BRANCHES`: speed before draw).
 *  - Neither affordable: attempt the preferred plan anyway, so the rejected round
 *    counts like every other row (one command per round).
 */
function policyPick(state, base, level) {
  const prices = priceTable(base, level);
  const preferred = state.powerRatio < 1 ? "draw" : "speed";
  if (state.credits >= prices[preferred]) return preferred;
  const options = LIVE.map((b) => ({ branch: b, price: prices[b] })).filter(
    (o) => state.credits >= o.price
  );
  options.sort((a, b) => a.price - b.price || LIVE.indexOf(a.branch) - LIVE.indexOf(b.branch));
  return options.length > 0 ? options[0].branch : preferred;
}

/**
 * The two gap ladders (decision 1.4 plus the g2 addendum), each 1800 rounds on the
 * shared boot: the wreck pulse is gated instead of firing every round, so the store's
 * inflow carries real gaps. During a silent stretch the store falls to the reserve
 * floor, store-sourced links stop drawing (engine `pullFromStore`: available =
 * store - TUNING.reserveFloor), and a machine keeps working only from the units it
 * already holds in hand - which is exactly what a buffer rank buys (`pullNeed`:
 * perBatch * (PULL_LOOKAHEAD_BATCHES + bufferRanks) + bonus, capped by
 * inputCapacityOf). One gated line per pattern, no engine change, identical tick budget.
 */
const SUPPLY_GAP9 = {
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
const SUPPLY_GAP6 = {
  name: "gap6",
  periodRounds: 6,
  pulsedRounds: 3,
  silentRounds: 3,
  periods: ROUNDS / 6,
  pulsePerRound: TUNING.manualSalvagePerPulse,
  note:
    "manual.salvage fires only while round % 6 < 3; the other 3 rounds of every period " +
    "run on the fleet's own deliveries alone, so the store's inflow has 3-round gaps",
};
const pulseThisRound = (round, spec) => round % spec.periodRounds < spec.pulsedRounds;

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
    const base = BLUEPRINTS[machine.blueprint].baseUpgradeCost;
    // STRAT-003: each named option carries its own price now, so the census reads
    // the real per-option prices from the same table the dock prints.
    for (const branch of ["speed", "buffer", "draw"]) options.push("upgrade:" + branch + ":" + branchPrice(base, machine.level, branch));
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
 * `patternName` is "regular" (the g1 cadence), "irregular" (the 5-on/4-off gate) or
 * "gap6" (the 3-on/3-off gate).
 */
function run(rowName, branch, patternName) {
  const spec = patternName === "irregular" ? SUPPLY_GAP9 : patternName === "gap6" ? SUPPLY_GAP6 : null;
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
  // A1-2v3 mechanism column, exact definition from the g2 addendum:
  // `inputStallTicks` = sum over machines of ticks in which that machine was NOT busy
  // (no batch running: the engine's measure phase saw progress 0, so `busyTicks` did
  // not increment that tick) while `store.scrap <= TUNING.reserveFloor`, i.e. the
  // store could not supply an input demand. Counted per tick inside the round's ten
  // steps; `advance(state, 10)` is the same ten `stepTick` calls, so every other
  // column keeps the g2 values exactly.
  // `inputStallPct = inputStallTicks / tick`, reported on the same points scale as
  // starvedMax/starvedMean, i.e. 100 * inputStallTicks / tick to one decimal, so the
  // addendum's "3 percentage points" reads as the integer 3 in `gaps.mmg`.
  let inputStallTicks = 0;
  const branchByLevel = [];

  for (let round = 0; round < ROUNDS; round += 1) {
    if (!state.exportClaimed && (state.store.steel ?? 0) >= TUNING.exportContractSteel) { send({ type: "contract.export" }); taps += 1; }
    // The one difference between the tables: the gated wreck pulse.
    if (spec !== null && pulseThisRound(round, spec)) { send({ type: "manual.salvage" }); pulses += 1; taps += 1; }
    const tutorial = tutorialAction(state);
    let chosen;
    if (tutorial) {
      for (const body of tutorial) send(body);
      taps += 1;
    } else {
      chosen = ladderStep(state);
      if (chosen && chosen.kind) {
        if (chosen.kind !== "salvage" && chosen.kind !== "upgrade") kinds[chosen.kind] = (kinds[chosen.kind] ?? 0) + 1;
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
            // STRAT-003 "a plan is bought when affordable": the attempt happens only
            // when the option's own price is covered. A round whose price is not
            // covered takes the surplus sell instead (the tranche the ladder itself
            // would sell one step later), so credits accumulate like an idle player
            // in the app, whose second button is always the affordable plain price.
            const machine = state.machines.find((m) => m.id === chosen.machineId);
            const before = machine?.level ?? 0;
            const named = branch === "policy" && machine
              ? policyPick(state, BLUEPRINTS[machine.blueprint].baseUpgradeCost, machine.level)
              : branch;
            const price = machine
              ? (named == null
                ? upgradeCost(BLUEPRINTS[machine.blueprint].baseUpgradeCost, machine.level)
                : branchPrice(BLUEPRINTS[machine.blueprint].baseUpgradeCost, machine.level, named))
              : 0;
            if (named == null || state.credits >= price) {
              kinds.upgrade = (kinds.upgrade ?? 0) + 1;
              send(named == null
                ? { type: "machine.upgrade", machineId: chosen.machineId }
                : { type: "machine.upgrade", machineId: chosen.machineId, branch: named });
              taps += 1;
              branchByLevel.push((round + 1) + ":m" + chosen.machineId + ":L" + before + "->" + (named ?? "unnamed"));
            } else {
              const sell = sellStep(state);
              if (sell) {
                kinds.sell = (kinds.sell ?? 0) + 1;
                send({ type: "contract.sell", resource: sell.resource, qty: sell.qty });
                taps += 1;
              }
            }
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
    for (let tick = 0; tick < 10; tick += 1) {
      const busyBefore = state.machines.map((m) => m.busyTicks);
      advance(state, 1);
      if ((state.store.scrap ?? 0) <= TUNING.reserveFloor) {
        for (let k = 0; k < state.machines.length; k += 1) {
          if (state.machines[k].busyTicks === (busyBefore[k] ?? 0)) inputStallTicks += 1;
        }
      }
    }
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
  // The policy row's evidence: which named plan each purchased level became.
  const policyMix = {};
  for (const m of state.machines) for (const b of m.branch ?? []) policyMix[b] = (policyMix[b] ?? 0) + 1;
  return {
    policy: rowName,
    branch,
    ...(branch === "policy" ? { policyMix } : {}),
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
    inputStallTicks,
    inputStallPct: Number(((inputStallTicks / Math.max(1, state.tick)) * 100).toFixed(1)),
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
 * A1-2v2 primary column set plus the A1-2v3 mechanism column, named by exact field.
 * `credits` is deliberately absent (R2: the residual balance cannot satisfy R1);
 * `creditsEarned` and `creditsPer1000Batches` are the earned readings.
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
  inputStallPct: { read: (r) => r.inputStallPct, higherWins: false },
  creditsEarned: { read: (r) => r.creditsEarned, higherWins: true },
  creditsPer1000Batches: { read: (r) => r.creditsPer1000Batches, higherWins: true },
};

/**
 * A1-2v3 per-column minimum meaningful gap (MMG), declared exactly once, in each
 * column's own points scale, replacing the retired `>= 5 % relative OR >= 10 absolute`
 * disjunction. `inputStallPct`, `starvedMax` and `starvedMean` are percentage points;
 * `batches` and `powerLimitedRounds` are whole units; `minPowerRatio` is the ratio
 * itself; `creditsPer1000Batches` is the only two-term entry (3 % relative AND
 * >= 100 units). Where the rival value is exactly 0 the absolute term applies alone -
 * that is the only case in which a bare absolute floor is well-defined.
 * tests/simulation/fork.test.ts reads this table from the `gaps` block of
 * work/feedback/strat002-harness.json and asserts against it.
 */
const MMG = {
  inputStallPct: { absolute: 3 },
  starvedMax: { absolute: 3 },
  starvedMean: { absolute: 3 },
  batches: { absolute: 900 },
  powerLimitedRounds: { absolute: 200 },
  minPowerRatio: { absolute: 0.25 },
  creditsPer1000Batches: { relative: 0.03, absolute: 100 },
};
const MMG_COLUMNS = Object.keys(MMG);
/** The single column `buffer` is judged on (g2 addendum); no other column satisfies R1 for it. */
const BUFFER_COLUMN = "inputStallPct";

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

/** MMG test: absolute in the column's scale; the two-term column also needs its 3 %;
 * a rival of exactly 0 is judged by the absolute term alone (addendum clause). */
function passesMmg(column, gap) {
  const mmg = MMG[column];
  if (gap.rival === 0) return gap.absolute >= mmg.absolute;
  if (mmg.relative === undefined) return gap.absolute >= mmg.absolute;
  return gap.absolute >= mmg.absolute && gap.relative >= mmg.relative;
}

/** Owns the column = sole best value among the named rows. */
const soleLeader = (census, column, policy) => census[column].length === 1 && census[column][0] === policy;

/** The leading branch per MMG column, named rows only: the sole best value whose gap
 * over the best rival clears that column's MMG; null when no branch clears it. */
function leadersUnderMmg(rows) {
  const census = leadCensus(rows, false);
  const out = {};
  for (const column of MMG_COLUMNS) {
    const sole = NAMED.find((policy) => soleLeader(census, column, policy)) ?? null;
    out[column] = sole !== null && passesMmg(column, gapOf(rows, sole, column)) ? sole : null;
  }
  return out;
}

/**
 * STRAT-003: the same MMG leader test restricted to the two plans that are on the
 * dock (speed, draw) - the answer to "do the two plans still lead different columns
 * with distinct prices". Sole best among the pair whose gap over the other clears
 * the column's MMG; null when the gap collapses below the MMG (a real finding).
 */
function leadersTwoPlans(rows) {
  const pair = LIVE.map((policy) => rows.find((r) => r.policy === policy)).filter(Boolean);
  const out = {};
  for (const column of MMG_COLUMNS) {
    if (pair.length !== 2) {
      out[column] = null;
      continue;
    }
    const spec = PRIMARY[column];
    const [a, b] = pair;
    const va = Number(spec.read(a));
    const vb = Number(spec.read(b));
    if (va === vb) {
      out[column] = null;
      continue;
    }
    const better = spec.higherWins ? (va > vb ? a : b) : va < vb ? a : b;
    const other = better === a ? b : a;
    const own = Number(spec.read(better));
    const rival = Number(spec.read(other));
    const absolute = spec.higherWins ? own - rival : rival - own;
    const relative = rival === 0 ? (absolute === 0 ? 0 : 1) : absolute / rival;
    const gap = { own, rival, absolute: Number(absolute.toFixed(3)), relative: Number(relative.toFixed(4)) };
    out[column] = passesMmg(column, gap) ? better.policy : null;
  }
  return out;
}

function gapsBlock() {
  return {
    criteria: "A1-2v3 (g2 addendum): per-column minimum meaningful gap replaces the retired " +
      "'>= 5 % relative OR >= 10 absolute' disjunction; absolute-only when the rival is exactly 0",
    mmg: MMG,
    bufferRule: "buffer leads inputStallPct by >= 3 points over the best named rival under BOTH " +
      "gap ladders (irregular 5-on/4-off and gap6 3-on/3-off) or the drop executes and the fork " +
      "ships two plans (speed, draw)",
    inputStall: "rows[].inputStallTicks = sum over machines of ticks not busy while " +
      "store.scrap <= TUNING.reserveFloor; rows[].inputStallPct = inputStallTicks / tick, " +
      "reported on the 0-100 points scale (x100), the same unit as starvedMax/starvedMean",
  };
}

/** R1/R3/R4 plus the A1-2v3 per-branch MMG verdicts, as the addendum states them. */
function verdicts(rows) {
  const census = leadCensus(rows, false);
  const leaders = leadersUnderMmg(rows);
  const out = {};
  for (const policy of NAMED) {
    const led = Object.keys(PRIMARY).filter((column) => census[column].includes(policy));
    const record = { leads: led, leadCount: led.length, r1: led.length >= 1 };
    if (policy === "speed") {
      const gap = gapOf(rows, policy, "batches");
      record.column = "batches";
      record.gap = gap;
      record.required = "sole leader, batches lead by >= " + MMG.batches.absolute + " over the best named rival";
      record.pass = soleLeader(census, "batches", policy) && passesMmg("batches", gap);
    } else if (policy === "draw") {
      const power = gapOf(rows, policy, "powerLimitedRounds");
      const ratio = gapOf(rows, policy, "minPowerRatio");
      const othersLimited = namedRows(rows)
        .filter((r) => r.policy !== "draw")
        .map((r) => r.powerLimitedRounds);
      record.column = "powerLimitedRounds + minPowerRatio";
      record.power = power;
      record.ratio = ratio;
      record.required = "powerLimitedRounds = 0 with both others >= " + MMG.powerLimitedRounds.absolute +
        ", minPowerRatio gap >= " + MMG.minPowerRatio.absolute;
      record.pass =
        soleLeader(census, "powerLimitedRounds", policy) &&
        passesMmg("powerLimitedRounds", power) &&
        power.own === 0 &&
        othersLimited.every((value) => value >= MMG.powerLimitedRounds.absolute) &&
        soleLeader(census, "minPowerRatio", policy) &&
        passesMmg("minPowerRatio", ratio);
    } else {
      // buffer: exactly one mechanism column, inputStallPct, under the MMG (A1-2v3).
      const gap = gapOf(rows, policy, BUFFER_COLUMN);
      record.column = BUFFER_COLUMN;
      record.gap = gap;
      record.required = "sole leader, inputStallPct lead by >= " + MMG.inputStallPct.absolute + " points";
      record.pass = soleLeader(census, BUFFER_COLUMN, policy) && passesMmg(BUFFER_COLUMN, gap);
    }
    // A1-2v3: R1 is the MMG verdict on the branch's named column (the raw census above
    // stays reported; `creditsPer1000Batches` no longer satisfies R1 for any branch).
    record.r1 = record.pass;
    out[policy] = record;
  }
  out.leadersUnderMmg = leaders;
  const twin = rows.find((r) => r.policy === TWIN);
  const speed = rows.find((r) => r.policy === "speed");
  // R3: the twin identity is printed next to the scored rows, and asserted in tests.
  out[TWIN] = twinIdentity(twin, speed);
  return out;
}

const SCALAR_COLUMNS = [
  "tick", "machines", "links", "drones", "batches", "credits", "creditsEarned", "creditsPer1000Batches",
  "nodes", "taps", "commands", "rejects", "pulses", "powerLimitedRounds", "minPowerRatio", "starvedMax",
  "starvedMean", "inputStallTicks", "inputStallPct", "legacyAmbiguous", "pricedGe2", "purchasedLevels",
  "scrapMin", "scrapMax", "floorRounds",
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
        " inputStallTicks=" + r.inputStallTicks + " inputStallPct=" + r.inputStallPct +
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
  }
  lines.push("  leaders under MMG (named rows only): " + JSON.stringify(block.leadersUnderMmg));
  lines.push("  " + TWIN + " twin identity: " + JSON.stringify(block[TWIN]));
  return lines;
}

const patterns = [
  ["regular", null],
  ["irregular", SUPPLY_GAP9],
  ["gap6", SUPPLY_GAP6],
];

const blocks = {};
for (const [patternName, spec] of patterns) {
  const rows = [
    run(TWIN, null, patternName),
    ...NAMED.map((branch) => run(branch, branch, patternName)),
    run("priced", "policy", patternName),
  ];
  blocks[patternName] = {
    supply: spec === null
      ? { name: "regular", note: "one command per round, 10 ticks apart, ungated wreck pulse (the g1 cadence)" }
      : spec,
    prices: {
      note: "per option: plain ladder ceil(base x 1.16^n) + BRANCH_PRICE_OFFSET (speed +10, draw/buffer +0)",
      "sorterL1": priceTable(30, 1),
      "furnaceL1": priceTable(40, 1),
    },
    rows,
    stages: Object.fromEntries(rows.map((r) => [r.policy, r.stages])),
    branchByLevel: Object.fromEntries(rows.map((r) => [r.policy, r.branchByLevel])),
    leads: leadCensus(rows, false),
    leadsIncludingTwin: leadCensus(rows, true),
    leadersTwoPlans: leadersTwoPlans(rows),
    attribution: attribution(rows),
    verdicts: verdicts(rows),
  };
}

// The auto-executing question from the g2 addendum, computed from the same run:
// does `buffer` lead inputStallPct by >= 3 points under BOTH gap ladders?
const bufferLead = { irregular: blocks.irregular.verdicts.buffer.pass, gap6: blocks.gap6.verdicts.buffer.pass };
const bothPatterns = bufferLead.irregular && bufferLead.gap6;
const autoExec = {
  question: "does buffer lead inputStallPct by >= 3 points over the best named rival under BOTH gap ladders?",
  irregular: bufferLead.irregular,
  gap6: bufferLead.gap6,
  bothPatterns,
  outcome: bothPatterns
    ? "three plans kept: speed, buffer, draw; the A1-2v3 MMG table is the standing rule"
    : "the drop executes: the fork ships two plans (speed, draw); negative result recorded, never re-scored",
};

mkdirSync("work/feedback", { recursive: true });
writeFileSync(TARGET, JSON.stringify({
  baseSha: BASE_SHA,
  method: "harness: deterministic simulation, one command per round, 10 ticks apart, 1800 rounds = 18 000 ticks, shared boot, one named outcome per row plus one policy row, three supply tables (regular, irregular 5-on/4-off, gap6 3-on/3-off)",
  criteria: "A1-2v3 (g2 addendum) plus STRAT-003 distinct prices: the two live plans carry different prices at the same level (plain ladder + BRANCH_PRICE_OFFSET: speed +10, draw +0, buffer +0); the `priced` row buys under the power-line signal (throttled -> draw, else speed) with a cheapest-affordable fallback; leaders under MMG reported for the named three and for the live pair",
  primaryColumns: Object.keys(PRIMARY),
  gaps: gapsBlock(),
  autoExec,
  regular: blocks.regular,
  irregular: blocks.irregular,
  gap6: blocks.gap6,
}, null, 1), "utf8");

for (const name of ["regular", "irregular", "gap6"]) {
  const block = blocks[name];
  console.log("== " + name + " supply (" + block.supply.name + ") ==");
  if (name !== "regular") console.log("  pattern: " + JSON.stringify(block.supply));
  console.log("  prices (level 1, sorter/furnace base): " + JSON.stringify(block.prices));
  console.log(table(block.rows).map((line) => "  " + line).join("\n"));
  console.log("  leads (named rows only): " + JSON.stringify(block.leads));
  console.log("  leads (twin included, not scored): " + JSON.stringify(block.leadsIncludingTwin));
  console.log("  leaders under MMG (two live plans, speed vs draw): " + JSON.stringify(block.leadersTwoPlans));
  const pricedRow = block.rows.find((r) => r.policy === "priced");
  if (pricedRow) console.log(
    "  priced policy: mix=" + JSON.stringify(pricedRow.policyMix) +
      " batches=" + pricedRow.batches + " credits=" + pricedRow.credits +
      " creditsEarned=" + pricedRow.creditsEarned + " inputStallPct=" + pricedRow.inputStallPct +
      " taps=" + pricedRow.taps + " rejects=" + pricedRow.rejects
  );
  console.log("  gaps (A1-2v3 per-column MMG, one declaration read by fork.test.ts): " + JSON.stringify(gapsBlock().mmg));
  console.log("  A1-2v3 verdict, owns the named column by the per-column MMG:");
  console.log(verdictLines(block.verdicts).join("\n"));
}
console.log("auto-exec: " + JSON.stringify(autoExec));
console.log("census note: the >=2 affordable figure applies to the named row shown with it; " +
  "the twin is the by-construction speed row, so 121 is speed's count as well.");
console.log("wrote " + TARGET);
