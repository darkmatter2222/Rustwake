// STRAT-004 g1: the two derivations of the face's pending line must agree.
// `pendingForStep` reads the content table plus the state; `pendingFromCost` reads the
// price the face has just printed plus the same state. Both run here over engine-written
// states (the same boot cadence as the jsdom cases), so a divergence is visible in CI.
//
// Usage: npx tsx work/feedback/STRAT-004-g1/face-line-check.mjs
import { applyCommand, branchPrice, DOCK_TILE, YARD_TILES, upgradeCost } from "../../../src/game/simulation/commands";
import { planConnections } from "../../../src/game/simulation/autoconnect";
import { advance } from "../../../src/game/simulation/engine";
import { nextYardStep } from "../../../src/game/simulation/plan";
import { createInitialState } from "../../../src/game/simulation/types";
import { primaryFor, pendingForStep, pendingFromCost, costSummary } from "../../../src/ui/text";
import { BLUEPRINTS } from "../../../src/game/content/defs";

const firstFreeTile = (state) => {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
};

/** The recorded boot: manual pulses, the repair, then one sorter and one furnace. */
function boot({ sorter = true, furnace = true, ferrous = 4, scrap = 9, credits = 12 } = {}) {
  const state = createInitialState();
  let seq = 0;
  const send = (body) => applyCommand(state, { id: "s" + (seq += 1), ...body });
  const connect = (machineId) => {
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
  };
  state.tutorial = 9;
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, 26);
  }
  state.store = { ...state.store, scrap: 24 };
  send({ type: "drone.repair" });
  advance(state, 262);
  if (sorter) {
    state.store = { ...state.store, scrap: 60, ferrous: 20 };
    state.storeUnits = 80;
    send({ type: "machine.build", blueprint: "sorter", tile: firstFreeTile(state) });
    connect(state.machines[0].id);
    advance(state, 300);
  }
  if (furnace) {
    state.store = { ...state.store, scrap: 60, ferrous: 20 };
    state.storeUnits = 80;
    send({ type: "machine.build", blueprint: "furnace", tile: firstFreeTile(state) });
    connect(state.machines[state.machines.length - 1].id);
    advance(state, 300);
  }
  state.store = { ...state.store, scrap, ferrous };
  state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
  state.credits = credits;
  advance(state, 1);
  return state;
}

const rows = [];
const check = (name, state, step) => {
  const fromStep = pendingForStep(state, step);
  const fromCost = pendingFromCost(primaryFor(state, step).cost, state);
  rows.push({ name, step: step.kind, fromStep, fromCost, agree: fromStep === fromCost });
};

// A build price the yard cannot cover yet (the recorded stall's shape), named directly.
const named = boot({ scrap: 9, ferrous: 4 });
check("build furnace, named, 9 scrap + 4 ferrous", named, { kind: "build", blueprint: "furnace" });
// The later rung of the same ladder, with both items short.
check("build plate press, named, 9 scrap + 4 ferrous", named, { kind: "build", blueprint: "platePress" });
// A covered price in the other item, so only one line is short.
const halfCovered = boot({ scrap: 40, ferrous: 2 });
check("build plate press, named, 40 scrap + 2 ferrous", halfCovered, {
  kind: "build",
  blueprint: "platePress",
});
// A build price the ladder points at while the yard is short.
check("build furnace, 9 scrap + 4 ferrous", boot(), nextYardStep(boot()));
// A covered build price: no extra line at all.
const covered = boot({ scrap: 60, ferrous: 20 });
check("build plate press, price covered", covered, nextYardStep(covered));
// The credit sink: the purse, not a material.
const poor = boot({ credits: 7 });
check("upgrade, purse below the ladder price", poor, {
  kind: "upgrade",
  machineId: poor.machines[0].id,
});
// The drone price.
check("drone, purse below the fleet price", boot({ credits: 3 }), { kind: "drone" });
// A step with no price prints nothing extra.
check("salvage, no price", boot(), { kind: "salvage" });

for (const row of rows) {
  console.log(
    `${row.agree ? "ok  " : "DIFF"} ${row.name} [${row.step}] ` +
      `step="${row.fromStep}" cost="${row.fromCost}"`
  );
}
// The plain price strings the faces print, for the record.
console.log(
  "prices:",
  JSON.stringify({
    furnace: costSummary(BLUEPRINTS.furnace),
    platePress: costSummary(BLUEPRINTS.platePress),
    plainUpgrade: upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, 1),
    speedPlan: branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, 1, "speed"),
  })
);
const failed = rows.filter((row) => !row.agree);
console.log(failed.length === 0 ? "both derivations agree on every frame" : `${failed.length} divergence(s)`);
if (failed.length > 0) process.exitCode = 1;
