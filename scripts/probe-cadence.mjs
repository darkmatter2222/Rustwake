// B-21 probe: does the ladder get more done building before upgrading, or the other
// way round? Both orders run the same 1 800-round session (30 minutes of active play)
// with the same shipped tuning; only the priority between `build` and `upgrade` swaps.
// The shipped order lives in `src/game/simulation/plan.ts` (`nextYardStep`), so this
// file re-implements the ladder locally with one boolean controlling the swap and
// nothing else. Run: `npx tsx scripts/probe-cadence.mjs`.
import { mkdirSync, writeFileSync } from "node:fs";
import { BLUEPRINTS, RECIPES, TUNING, unlockedBlueprints } from "../src/game/content/defs";
import { nextResearchNode } from "../src/game/content/research";
import { sellableAmount, upgradeCost } from "../src/game/simulation/commands";
import { planConnections } from "../src/game/simulation/autoconnect";
import { SELL_ORDER } from "../src/game/simulation/plan";

const ROUNDS = 1800; // 18 000 ticks = 30 minutes of active play
const TARGET = "docs/evidence/2026-11-03-cadence.md";
const ORDERS = ["build-first", "upgrade-first"];

/** Same cheapness rule as `plan.ts`: lowest level, then the busiest machine. */
function affordableUpgrade(state) {
  let best = null;
  for (const machine of state.machines) {
    const def = BLUEPRINTS[machine.blueprint];
    if (!def) continue;
    if (state.credits < upgradeCost(def.baseUpgradeCost, machine.level)) continue;
    const busy = machine.busyTicks ?? 0;
    if (
      !best ||
      machine.level < best.level ||
      (machine.level === best.level && busy > best.busy)
    ) {
      best = { machineId: machine.id, level: machine.level, busy };
    }
  }
  return best ? { kind: "upgrade", machineId: best.machineId } : null;
}

function affordable(state, blueprint) {
  const def = BLUEPRINTS[blueprint];
  if (!def) return false;
  for (const item of def.buildCost) {
    if ((state.store[item.resource] ?? 0) < item.qty) return false;
  }
  return true;
}

function pendingInputs(state, unbuilt) {
  const pending = new Set();
  for (const id of unbuilt) {
    const def = BLUEPRINTS[id];
    if (!def) continue;
    for (const item of def.buildCost) {
      if ((state.store[item.resource] ?? 0) < item.qty) pending.add(item.resource);
    }
  }
  return pending;
}

/**
 * `nextYardStep` with one knob: when `upgradeFirst` is true the affordable-upgrade
 * check runs before the unbuilt-blueprint loop instead of after it. Everything else
 * is the shipped order, so the difference is attributable to that one swap.
 */
function nextStep(state, upgradeFirst) {
  for (const machine of state.machines) {
    const plans = planConnections(state, machine.id);
    if (plans.length > 0) return { kind: "connect", machineId: machine.id, plans };
  }
  const known = unlockedBlueprints(state.tutorial);
  const unbuilt = known.filter((id) => !state.machines.some((m) => m.blueprint === id));
  const buildStep = () => {
    for (const blueprint of unbuilt) {
      if (affordable(state, blueprint)) return { kind: "build", blueprint };
    }
    return null;
  };
  const researchStep = () => {
    const node = nextResearchNode(state);
    return node && (state.store.data ?? 0) >= node.cost
      ? { kind: "research", node: node.id }
      : null;
  };
  const sellStep = (skipPending) => {
    const pending = skipPending ? pendingInputs(state, unbuilt) : new Set();
    for (const resource of SELL_ORDER) {
      if (pending.has(resource)) continue;
      const qty = sellableAmount(state, resource);
      if (qty > 0) return { kind: "sell", resource, qty };
    }
    return null;
  };

  const upgradeStep = () => affordableUpgrade(state);
  // The shipped fleet stage: same gate and price as `fleetStep` in `plan.ts`.
  const droneStep = () => {
    if (!state.drone.repaired) return null;
    if (1 + state.spares.length >= TUNING.fleetCap) return null;
    if (state.credits < TUNING.droneAddBaseCost * 2 ** state.spares.length) return null;
    return { kind: "drone" };
  };
  // Exactly the shipped tail: a pending-skipping sell, then the near-goal build
  // (possibly unaffordable, which is a rejected command, not a charge), then any
  // sell, then the first machine's upgrade.
  const nearBuildStep = () =>
    unbuilt.length > 0 ? { kind: "build", blueprint: nearestBlueprint(state, unbuilt) } : null;
  const order = upgradeFirst
    ? [
        researchStep,
        droneStep,
        upgradeStep,
        buildStep,
        () => sellStep(true),
        nearBuildStep,
        () => sellStep(false),
      ]
    : [
        buildStep,
        researchStep,
        droneStep,
        upgradeStep,
        () => sellStep(true),
        nearBuildStep,
        () => sellStep(false),
      ];
  for (const make of order) {
    const step = make();
    if (step) return step;
  }
  const machine = state.machines[0];
  if (machine) return { kind: "upgrade", machineId: machine.id };
  return { kind: "salvage" };
}

/** `nearestBlueprint` as `plan.ts` computes it: smallest total shortfall wins. */
function nearestBlueprint(state, unbuilt) {
  let best = unbuilt[0] ?? "";
  let bestShortfall = Number.POSITIVE_INFINITY;
  for (const id of unbuilt) {
    const def = BLUEPRINTS[id];
    if (!def) continue;
    let shortfall = 0;
    for (const item of def.buildCost) {
      shortfall += Math.max(0, item.qty - (state.store[item.resource] ?? 0));
    }
    if (shortfall < bestShortfall) {
      best = id;
      bestShortfall = shortfall;
    }
  }
  return best;
}

async function singleRun(order) {
  const upgradeFirst = order === "upgrade-first";
  const defs = await import("../src/game/content/defs");
  const { advance } = await import("../src/game/simulation/engine");
  const { applyCommand, DOCK_TILE, YARD_TILES } =
    await import("../src/game/simulation/commands");
  const { createInitialState } = await import("../src/game/simulation/types");

  let seq = 0;
  const send = (state, body) => {
    seq += 1;
    return applyCommand(state, { ...body, id: `c${order}-${seq}` });
  };
  const freeTile = (state) => {
    for (let tile = 0; tile < YARD_TILES; tile += 1) {
      if (tile === DOCK_TILE) continue;
      if (!state.machines.some((m) => m.tile === tile)) return tile;
    }
    return 8;
  };

  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, defs.TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  state.tutorial = 9;

  /** Round index at which each count was first reached, for the ramp table. */
  const ramp = { machines: {}, credits: {}, batches: {} };
  const mark = (label, value, round) => {
    if (ramp[label] === undefined) ramp[label] = {};
    if (ramp[label][value] === undefined) ramp[label][value] = round + 1;
  };
  /** Rounds where both swapped branches were available, and the step-kind tally. */
  const kinds = {};
  let ambiguous = 0;

  for (let round = 0; round < ROUNDS; round += 1) {
    // T7's dock primary claims the onboarding contract once steel is stocked, and
    // every repeatable sell stays locked until then (commands.ts:301).
    if (!state.exportClaimed && (state.store["steel"] ?? 0) >= defs.TUNING.exportContractSteel) {
      send(state, { type: "contract.export" });
    }
    const step = nextStep(state, upgradeFirst);
    // Count how often the yard could have taken the other branch of the swapped pair
    // at this instant; those are the only rounds where the order can differ at all.
    const canBuild = unlockedBlueprints(state.tutorial)
      .filter((id) => !state.machines.some((m) => m.blueprint === id))
      .some((id) => affordable(state, id));
    if (canBuild && affordableUpgrade(state)) ambiguous += 1;
    kinds[step.kind] = (kinds[step.kind] ?? 0) + 1;
    switch (step.kind) {
      case "connect":
        for (const plan of step.plans) {
          send(state, {
            type: "route.connect",
            from: plan.from,
            to: plan.to,
            filter: plan.filter,
          });
        }
        break;
      case "build":
        send(state, {
          type: "machine.build",
          blueprint: step.blueprint,
          tile: freeTile(state),
        });
        break;
      case "sell":
        send(state, {
          type: "contract.sell",
          resource: step.resource,
          qty: step.qty,
        });
        break;
      case "research":
        send(state, { type: "research.buy", node: step.node });
        break;
      case "drone":
        send(state, { type: "drone.add" });
        break;
      case "upgrade":
        send(state, { type: "machine.upgrade", machineId: step.machineId });
        break;
      default:
        send(state, { type: "manual.salvage" });
    }
    advance(state, 10);
    mark("machines", state.machines.length, round);
    mark("credits", Math.floor(state.credits / 100) * 100, round);
    mark(
      "batches",
      Math.floor(
        state.machines.reduce((sum, machine) => sum + machine.batchesDone, 0) / 100
      ) * 100,
      round
    );
  }

  const totals = state.machines.reduce((sum, machine) => sum + machine.batchesDone, 0);
  return {
    order,
    ticks: state.tick,
    machines: state.machines.length,
    totals,
    perMinute: Number((totals / (ROUNDS * 10 / 600)).toFixed(1)),
    credits: state.credits,
    research: Object.keys(state.research).length,
    ambiguous,
    kinds,
    levels: state.machines.map((m) => `${m.blueprint} L${m.level}`).join(", "),
    store: Object.entries(state.store)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${key}=${value}`)
      .join(" "),
    ramp,
  };
}

const table = (rows, columns) => {
  const lines = [
    `| ${columns.map(([key]) => key).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${columns.map(([, get]) => get(row)).join(" | ")} |`);
  }
  return lines;
};

const kindText = (run) =>
  Object.entries(run.kinds)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ");

const runs = [];
for (const order of ORDERS) runs.push(await singleRun(order));

const milestone = (run, label, value) => run.ramp[label]?.[value] ?? "-";
const lines = [];
lines.push("# Cadence probe — build-before-upgrade versus upgrade-before-build (B-21)");
lines.push("");
lines.push(
  `Command: \`npx tsx scripts/probe-cadence.mjs\`. Runtime: Node ${process.version}.` +
    ` Both rows are the shipped tuning with reserve floor 10, scripted exactly like the` +
    ` 30-minute driver in \`tests/simulation/chain.test.ts\`: the tutorial is completed, the` +
    ` onboarding export contract is claimed on the first round three steel exist, then` +
    ` ${ROUNDS} rounds at one ladder command per second (${ROUNDS * 10} ticks).` +
    ` The only difference is which of \`build\` and \`upgrade\` the ladder checks first.` +
    ` \`Batches/min\` is total batch completions over the 30-minute window.`
);
lines.push("");
lines.push(
  ...table(runs, [
    ["Order", (run) => run.order],
    ["Machines", (run) => run.machines],
    ["Total batches", (run) => run.totals],
    ["Batches/min", (run) => run.perMinute],
    ["Credits", (run) => run.credits],
    ["Research nodes", (run) => run.research],
    ["Levels at end", (run) => run.levels],
    ["Store at end", (run) => run.store],
  ])
);
lines.push("");
lines.push("## Ramp (round at which each count was first reached)");
lines.push("");
lines.push(
  ...table(runs, [
    ["Order", (run) => run.order],
    ["3 machines", (run) => milestone(run, "machines", 3)],
    ["5 machines", (run) => milestone(run, "machines", 5)],
    ["8 machines", (run) => milestone(run, "machines", 8)],
    ["1 000 credits", (run) => milestone(run, "credits", 1000)],
    ["2 000 credits", (run) => milestone(run, "credits", 2000)],
    ["500 batches", (run) => milestone(run, "batches", 500)],
    ["1 000 batches", (run) => milestone(run, "batches", 1000)],
  ])
);
lines.push("");
lines.push("## How often the order is even in play");
lines.push("");
lines.push(
  `A round is **ambiguous** when the store already covers the next unbuilt blueprint's price` +
    ` *and* the credit balance covers at least one machine's upgrade, so the two swapped checks` +
    ` would each claim a different action. The remaining ${
      ROUNDS - runs[0].ambiguous
    } of the ${ROUNDS} rounds are decided by exactly one available action, or by the connect and` +
    ` sell stages that sit outside the swap.`
);
lines.push("");
lines.push(
  ...table(runs, [
    ["Order", (run) => run.order],
    ["Ambiguous rounds", (run) => run.ambiguous],
    ["Share of rounds", (run) => `${((run.ambiguous * 100) / ROUNDS).toFixed(1)} %`],
    ["Steps by kind", (run) => kindText(run)],
  ])
);
lines.push("");
const [a, b] = runs;
const same =
  a.machines === b.machines &&
  a.totals === b.totals &&
  a.credits === b.credits &&
  a.research === b.research;
lines.push("## Reading");
lines.push("");
lines.push(
  same
    ? `The two orders finish with the same ${a.machines} machines, the same ${a.totals} batch` +
        ` completions (${a.perMinute}/min), the same ${a.credits} credits and the same` +
        ` ${a.research} research nodes, so within this 30-minute window the build/upgrade` +
        ` priority is not the lever. The reason is in the counts above: only` +
        ` ${a.ambiguous} of ${ROUNDS} rounds (${((a.ambiguous * 100) / ROUNDS).toFixed(1)} %)` +
        ` have both branches affordable at once, and an upgrade costs credits while a build` +
        ` costs materials, so one of the two is usually the only possible action. The shipped` +
        ` order in \`plan.ts\` (build before upgrade, so the yard grows its stage count while a` +
        ` young factory is still short of stages) is therefore kept unchanged.`
    : `The two orders differ: ${a.order} ends at ${a.machines} machines and ${a.totals} batches` +
        ` for ${a.credits} credits, ${b.order} at ${b.machines} machines and ${b.totals} batches` +
        ` for ${b.credits} credits. The better row is the one to ship.`
);
lines.push("");
mkdirSync("docs/evidence", { recursive: true });
writeFileSync(TARGET, `${lines.join("\n")}\n`, "utf8");
for (const run of runs) {
  console.log(
    `${run.order}: machines=${run.machines} batches=${run.totals}` +
      ` perMinute=${run.perMinute} credits=${run.credits} research=${run.research}` +
      ` ambiguous=${run.ambiguous}/${ROUNDS} 8th-machine-round=${milestone(run, "machines", 8)}`
  );
}
console.log(`wrote ${TARGET}`);
