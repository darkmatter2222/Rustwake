// BELT-001 g1 harness: a connection is a built, priced, tile-running object.
// Sections, all from the shipped tuning, all deterministic:
//   prices   - the same machine pair at different tile distances (B-1), the
//              removal refund, and the numbered shortfall of a refused tap;
//   layouts  - compact cluster vs spread yard, same seed, same simulated time,
//              scored on the STRAT-002 A1-2v3 columns with the per-column MMG
//              and the pre-armed drop clause (B-2);
//   ladder   - the STRAT-002 mirror rows re-run on the priced tree (ladderRows);
//   saves    - the v1 fixture identity plus the pre-price decode check (B-3).
// The emitted JSON is hashed (project FNV over the serialized body); two runs
// print the identical hash, which is the determinism witness B-4 asks for.
// Run: `npx tsx scripts/probe-belt.mjs`. Writes work/feedback/belt001-harness.json.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { BLUEPRINTS, TUNING, unlockedBlueprints } from "../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  beltRun,
  branchPrice,
  DOCK_TILE,
  sellableAmount,
  upgradeCost,
  YARD_TILES,
} from "../src/game/simulation/commands";
import { planConnections } from "../src/game/simulation/autoconnect";
import { SELL_ORDER } from "../src/game/simulation/plan";
import { advance } from "../src/game/simulation/engine";
import { createInitialState } from "../src/game/simulation/types";
import { checksum, decodeSave, encodeSave, validateSim } from "../src/game/persistence/save";

const TARGET = "work/feedback/belt001-harness.json";
const ROUNDS = 1800; // 18 000 ticks = 30 minutes of active play

/** The A1-2v3 per-column minimum-meaningful-gap table, as recorded by STRAT-002. */
export const MMG = {
  inputStallPct: { absolute: 3 },
  starvedMax: { absolute: 3 },
  starvedMean: { absolute: 3 },
  batches: { absolute: 900 },
  powerLimitedRounds: { absolute: 200 },
  minPowerRatio: { absolute: 0.25 },
  creditsPer1000Batches: { relative: 0.03, absolute: 100 },
};

const COLUMN_READ = {
  inputStallPct: { higherWins: false },
  starvedMax: { higherWins: false },
  starvedMean: { higherWins: false },
  batches: { higherWins: true },
  powerLimitedRounds: { higherWins: false },
  minPowerRatio: { higherWins: true },
  creditsPer1000Batches: { higherWins: true },
};

let seq = 0;
function send(state, body) {
  return applyCommand(state, { ...body, id: `p${(seq += 1)}` }).ok;
}

/* ---- section: prices (B-1) ---- */

function pricesSection() {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 200;
  state.store["ferrous"] = 20;
  state.store["nonferrous"] = 20;
  state.storeUnits = 240;
  const tiles = [0, 1, 3, 10, 35];
  const blueprints = ["sorter", "furnace", "copperSeparator", "polymerRecycler", "wireMill"];
  for (let i = 0; i < blueprints.length; i += 1) {
    send(state, { type: "machine.build", blueprint: blueprints[i], tile: tiles[i] });
    send(state, { type: "route.connect", from: 0, to: i + 1, filter: "scrap" });
  }
  const table = tiles.map((tile, i) => {
    const run = beltRun(state, 0, i + 1);
    return { machine: blueprints[i], tile, runLength: run.length, priceScrap: beltCost(run.length) };
  });
  // Same pair twice at two distances, then remove one and watch the refund back.
  const kept = state.routes[0];
  const keptPrice = beltCost(kept.run?.length ?? 0);
  const before = state.store["scrap"] ?? 0;
  const removedId = state.routes[state.routes.length - 1].id;
  const removedPrice = beltCost(state.routes[state.routes.length - 1].run?.length ?? 0);
  const removedRun = state.routes[state.routes.length - 1].run ?? [];
  const scrapBeforeRemove = state.store["scrap"] ?? 0;
  send(state, { type: "route.remove", routeId: removedId });
  const refund = (state.store["scrap"] ?? 0) - scrapBeforeRemove;
  // A refused tap on a priced connection: purse covers the machine but not the
  // belt, so the refusal carries the numbered shortfall and the state is unchanged.
  const poor = createInitialState();
  poor.tutorial = 9;
  poor.store["scrap"] = 22;
  poor.storeUnits = 22;
  send(poor, { type: "machine.build", blueprint: "sorter", tile: 0 });
  const refusedRun = beltRun(poor, 0, 1);
  const refusedPrice = beltCost(refusedRun.length);
  const revisionBefore = poor.revision;
  const refused = applyCommand(poor, {
    id: "refused-1",
    type: "route.connect",
    from: 0,
    to: 1,
    filter: "scrap",
  });
  return {
    samePairAtDifferentDistances: table,
    removal: {
      removedRunLength: removedRun.length,
      removedPriceScrap: removedPrice,
      returnedScrap: refund,
      refundPct: TUNING.dismantleRefundPct,
      keptPriceScrap: keptPrice,
    },
    refusal: {
      ok: refused.ok,
      need: refused.ok ? null : refused.need,
      have: refused.ok ? null : refused.have,
      word: refused.ok ? null : refused.word,
      priceScrap: refusedPrice,
      revisionMoved: poor.revision - revisionBefore,
      routesAfter: poor.routes.length,
      storeScrapAfter: poor.store["scrap"] ?? 0,
    },
    keepRows: { id: kept.id, before },
  };
}

/* ---- shared ladder mirror (same shape as tests/simulation/fork.test.ts) ---- */

const GAP_SPECS = { gap9: { period: 9, on: 5 }, gap6: { period: 6, on: 3 } };

function mirrorPrices(base, level) {
  return {
    speed: branchPrice(base, level, "speed"),
    draw: branchPrice(base, level, "draw"),
  };
}

function mirrorPolicyPick(s, base, level) {
  const prices = mirrorPrices(base, level);
  const preferred = s.powerRatio < 1 ? "draw" : "speed";
  if (s.credits >= prices[preferred]) return preferred;
  const options = ["speed", "draw"]
    .map((branch) => ({ branch, price: prices[branch] }))
    .filter((o) => s.credits >= o.price);
  options.sort((a, b) => a.price - b.price || ["speed", "draw"].indexOf(a.branch) - ["speed", "draw"].indexOf(b.branch));
  return options.length > 0 ? options[0].branch : preferred;
}

function mirrorSellStep(s) {
  const unbuilt = unlockedBlueprints(s.tutorial).filter(
    (id) => !s.machines.some((m) => m.blueprint === id)
  );
  const pending = new Set();
  for (const id of unbuilt) {
    for (const item of BLUEPRINTS[id].buildCost) {
      if ((s.store[item.resource] ?? 0) < item.qty) pending.add(item.resource);
    }
  }
  for (const resource of SELL_ORDER) {
    if (pending.has(resource)) continue;
    const qty = sellableAmount(s, resource);
    if (qty > 0) return { resource, qty };
  }
  return null;
}

function tutorialBodies(s) {
  const step = s.tutorial;
  if (step <= 1) return [{ type: "manual.salvage" }];
  if (step === 2) return [{ type: "drone.repair" }];
  if (step <= 6) {
    if (s.machines.length === 0) return [{ type: "machine.build", blueprint: "sorter", tile: 8 }];
    if (s.routes.length === 0) {
      return [
        { type: "route.connect", from: 0, to: 1, filter: "scrap" },
        { type: "route.connect", from: 1, to: 0, filter: "ferrous" },
      ];
    }
    const furnace = s.machines.find((m) => m.blueprint === "furnace");
    if (!furnace) {
      if ((s.store["scrap"] ?? 0) >= 10 && (s.store["ferrous"] ?? 0) >= 5) {
        return [{ type: "machine.build", blueprint: "furnace", tile: 9 }];
      }
      return [{ type: "manual.salvage" }];
    }
    const plans = planConnections(s, furnace.id);
    if (plans.length > 0) {
      return plans.map((plan) => ({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter }));
    }
    return [{ type: "manual.salvage" }];
  }
  if (step === 7) return [{ type: "contract.export" }];
  return null;
}

/** One scored ladder row: the shipped unnamed ladder with `tileOrder` as the
 * placement order. `ladder` picks the pulse gate; the ten steps of a round run
 * one tick at a time so the inputStall sample reads the same state as before. */
export function ladderRow(branch, ladder, tileOrder) {
  const spec = ladder === "regular" ? null : GAP_SPECS[ladder];
  const s = createInitialState();
  let inner = 0;
  let taps = 0;
  let rejects = 0;
  let earned = 0;
  let pulses = 0;
  let powerLimitedRounds = 0;
  let minPowerRatio = 1;
  let firstResearch = null;
  let inputStallTicks = 0;
  let placed = 0;
  const kinds = {};
  const sendRow = (body) => {
    const before = s.credits;
    const ok = applyCommand(s, { ...body, id: `b1-${(inner += 1)}` }).ok;
    const delta = s.credits - before;
    if (delta > 0) earned += delta;
    if (!ok) rejects += 1;
    return ok;
  };
  const nextTile = () => {
    if (tileOrder === null || placed >= tileOrder.length) {
      // The shipped a12Tile rule: first free tile scanning up, dock skipped.
      for (let tile = 0; tile < YARD_TILES; tile += 1) {
        if (tile === DOCK_TILE) continue;
        if (!s.machines.some((m) => m.tile === tile)) return tile;
      }
      return 8;
    }
    return tileOrder[placed];
  };
  for (let i = 0; i < 6; i += 1) {
    sendRow({ type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
  sendRow({ type: "drone.repair" });
  advance(s, 262);
  taps += 7;
  for (let round = 0; round < ROUNDS; round += 1) {
    if (!s.exportClaimed && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
      sendRow({ type: "contract.export" });
      taps += 1;
    }
    if (spec !== null && round % spec.period < spec.on) {
      sendRow({ type: "manual.salvage" });
      pulses += 1;
      taps += 1;
    }
    const taught = tutorialBodies(s);
    if (taught !== null) {
      for (const body of taught) sendRow(body);
      taps += 1;
      if (taught.some((body) => body.type === "machine.build")) placed += 1;
    } else {
      const step = nextYardStepLocal(s);
      if (step && step.kind) {
        if (step.kind !== "salvage" && step.kind !== "upgrade") kinds[step.kind] = (kinds[step.kind] ?? 0) + 1;
        switch (step.kind) {
          case "connect":
            for (const plan of step.plans) {
              sendRow({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
            }
            taps += 1;
            break;
          case "build":
            if (sendRow({ type: "machine.build", blueprint: step.blueprint, tile: nextTile() })) placed += 1;
            taps += 2;
            break;
          case "sell":
            sendRow({ type: "contract.sell", resource: step.resource, qty: step.qty });
            taps += 1;
            break;
          case "research":
            sendRow({ type: "research.buy", node: step.node });
            taps += 1;
            if (firstResearch === null) firstResearch = round + 1;
            break;
          case "drone":
            sendRow({ type: "drone.add" });
            taps += 1;
            break;
          case "upgrade": {
            const machine = s.machines.find((m) => m.id === step.machineId);
            const base = machine ? BLUEPRINTS[machine.blueprint].baseUpgradeCost : 0;
            const named =
              branch === "policy" ? (machine ? mirrorPolicyPick(s, base, machine.level) : null) : branch;
            const price = machine
              ? named == null
                ? upgradeCost(base, machine.level)
                : branchPrice(base, machine.level, named)
              : 0;
            if (named == null || s.credits >= price) {
              kinds.upgrade = (kinds.upgrade ?? 0) + 1;
              sendRow(
                named == null
                  ? { type: "machine.upgrade", machineId: step.machineId }
                  : { type: "machine.upgrade", machineId: step.machineId, branch: named }
              );
              taps += 1;
            } else {
              const sell = mirrorSellStep(s);
              if (sell) {
                kinds.sell = (kinds.sell ?? 0) + 1;
                sendRow({ type: "contract.sell", resource: sell.resource, qty: sell.qty });
                taps += 1;
              }
            }
            break;
          }
          default:
            sendRow({ type: "manual.salvage" });
            taps += 1;
        }
      }
    }
    for (let tick = 0; tick < 10; tick += 1) {
      const busyBefore = s.machines.map((m) => m.busyTicks);
      advance(s, 1);
      if ((s.store["scrap"] ?? 0) <= TUNING.reserveFloor) {
        for (let k = 0; k < s.machines.length; k += 1) {
          if (s.machines[k].busyTicks === (busyBefore[k] ?? 0)) inputStallTicks += 1;
        }
      }
    }
    if (s.powerRatio < 1) powerLimitedRounds += 1;
    if (s.powerRatio < minPowerRatio) minPowerRatio = s.powerRatio;
  }
  const starved = s.machines.map((m) =>
    Math.round((Math.min(m.starvedTicks, m.ageTicks) / Math.max(1, m.ageTicks)) * 100)
  );
  const batches = s.machines.reduce((sum, m) => sum + m.batchesDone, 0);
  const beltScrap = s.routes.reduce((sum, r) => sum + beltCost(r.run?.length ?? 0), 0);
  const policyMix = {};
  for (const m of s.machines) for (const b of m.branch ?? []) policyMix[b] = (policyMix[b] ?? 0) + 1;
  return {
    batches,
    credits: Math.round(s.credits),
    creditsEarned: earned,
    creditsPer1000Batches: Number(((earned / Math.max(1, batches)) * 1000).toFixed(3)),
    taps,
    rejects,
    pulses,
    powerLimitedRounds,
    minPowerRatio: Number(minPowerRatio.toFixed(3)),
    starvedMax: Math.max(...starved),
    starvedMean: Math.round(starved.reduce((sum, value) => sum + value, 0) / Math.max(1, starved.length)),
    inputStallTicks,
    inputStallPct: Number(((inputStallTicks / Math.max(1, s.tick)) * 100).toFixed(1)),
    firstResearch,
    kinds,
    ...(branch === "policy" ? { policyMix } : {}),
    attempts: kinds.upgrade ?? 0,
    purchasedLevels: s.machines.reduce((sum, m) => sum + (m.level - 1), 0),
    picksRecorded: s.machines.reduce((sum, m) => sum + (m.branch ? m.branch.length : 0), 0),
    beltScrap,
    tick: s.tick,
    machines: s.machines.length,
    links: s.routes.length,
  };
}

/* The ladder itself: same import, but the probe keeps one local alias so the
 * mirrored driver reads top-to-bottom in one file. */
import { nextYardStep as nextYardStepLocal } from "../src/game/simulation/plan";

/* ---- section: layouts (B-2) ---- */

/** Placement order indexed by successful build count (tutorial builds first).
 * Both arrays skip the dock tile 2 and hold distinct tiles. Compact hugs the
 * dock corner (rows 0-1), spread alternates the far corners of the 6x6 yard. */
export const LAYOUTS = {
  compact: [8, 9, 0, 1, 3, 4, 7, 10],
  spread: [8, 9, 0, 35, 1, 34, 3, 32],
};

function leaderUnderMmg(rows, column) {
  const spec = COLUMN_READ[column];
  const mmg = MMG[column];
  const values = rows.map((r) => r[column]);
  const best = spec.higherWins ? Math.max(...values) : Math.min(...values);
  const sole = rows.filter((r) => r[column] === best);
  if (sole.length !== 1) return null;
  const owner = sole[0];
  const rivals = rows.filter((r) => r !== owner).map((r) => r[column]);
  const rival = spec.higherWins ? Math.max(...rivals) : Math.min(...rivals);
  const own = owner[column];
  const absolute = spec.higherWins ? own - rival : rival - own;
  const relative = rival === 0 ? (absolute === 0 ? 0 : 1) : absolute / rival;
  if (rival === 0) return absolute >= mmg.absolute ? owner.name : null;
  if (mmg.relative !== undefined) {
    return absolute >= mmg.absolute && relative >= mmg.relative ? owner.name : null;
  }
  return absolute >= mmg.absolute ? owner.name : null;
}

function layoutsSection() {
  const patterns = { irregular: "gap9", gap6: "gap6" };
  const scored = {};
  for (const [pattern, ladder] of Object.entries(patterns)) {
    const rows = Object.entries(LAYOUTS).map(([name, order]) => ({
      name,
      ...ladderRow(null, ladder, order),
    }));
    const leaders = Object.fromEntries(
      Object.keys(COLUMN_READ).map((column) => [column, leaderUnderMmg(rows, column)])
    );
    scored[pattern] = { rows, leaders };
  }
  const columns = Object.keys(COLUMN_READ);
  const leads = { compact: 0, spread: 0 };
  for (const table of Object.values(scored)) {
    for (const column of columns) {
      if (table.leaders[column] !== null) leads[table.leaders[column]] += 1;
    }
  }
  const dropClause = {
    armed: true,
    fired: !(leads.compact > 0 && leads.spread > 0),
    reading:
      leads.compact > 0 && leads.spread > 0
        ? "each layout leads at least one scored column under the per-column MMG"
        : "neither (or only one) layout clears a column MMG: ship the price change alone, record the negative result, do not re-score on a new column set",
  };
  return { patterns: scored, leads, dropClause, mmg: MMG };
}

/* ---- section: ladder mirror on the priced tree ---- */

function ladderSection() {
  const order = [];
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    order.push(tile);
  }
  const policies = [
    ["naive (unnamed)", null],
    ["speed", "speed"],
    ["buffer", "buffer"],
    ["draw", "draw"],
    ["priced", "policy"],
  ];
  const table = {};
  for (const ladder of ["regular", "gap9", "gap6"]) {
    const pattern = ladder === "regular" ? "regular" : ladder === "gap9" ? "irregular" : "gap6";
    table[pattern] = policies.map(([name, branch]) => ({
      policy: name,
      // `null` = the shipped a12Tile first-free rule, exactly what the in-test
      // mirror in tests/simulation/fork.test.ts runs, so the rows reconcile.
      ...ladderRow(branch, ladder, null),
    }));
  }
  return table;
}

/* ---- section: saves (B-3) ---- */

function savesSection() {
  const raw = readFileSync("docs/evidence/yard-mature.json", "utf8");
  const envelope = JSON.parse(raw);
  const decoded = decodeSave(raw);
  const paidRanks = decoded.ok
    ? decoded.payload.sim.routes.map((r) => ({ id: r.id, latency: r.latency, run: r.run ?? null }))
    : [];
  const reencode = decoded.ok ? encodeSave(decoded.payload.sim, decoded.payload.lastSeenMs, decoded.payload.settings) : null;
  return {
    fixtureChecksum: envelope.checksum,
    schemaVersion: envelope.schemaVersion,
    decodeOk: decoded.ok === true,
    validateSimNull: decoded.ok ? validateSim(decoded.payload.sim) === null : false,
    byteIdentical: reencode === JSON.stringify(envelope),
    routesWithRunUndefined: decoded.ok
      ? decoded.payload.sim.routes.filter((r) => r.run === undefined).length
      : 0,
    sampleRoutes: paidRanks.slice(0, 3),
  };
}

/* ---- run ---- */

const body = {
  generatedBy: "scripts/probe-belt.mjs",
  tuning: {
    beltCostPerTile: TUNING.beltCostPerTile,
    beltLatencyPerTile: TUNING.beltLatencyPerTile,
    movePenaltyPct: TUNING.movePenaltyPct,
    dismantleRefundPct: TUNING.dismantleRefundPct,
  },
  prices: pricesSection(),
  layouts: layoutsSection(),
  ladderRows: ladderSection(),
  saves: savesSection(),
};

const serialized = `${JSON.stringify(body)}\n`;
const hash = checksum(JSON.stringify(body));
mkdirSync("work/feedback", { recursive: true });
writeFileSync(TARGET, serialized, "utf8");
console.log(`probe-belt checksum ${hash}`);
console.log(`wrote ${TARGET} (${serialized.length} B)`);
export { body as harnessBody, hash as harnessHash };
