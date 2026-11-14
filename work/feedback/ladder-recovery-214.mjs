// #214 ladder recovery probe: mirrors validateBehaviour's driver and adds the
// ADR (d)7/(d)8 dismantle-refund maneuver. With the seeded 12 ferrous the furnace
// gets a store-pull link (autoconnect: stocked >= one batch), and the reserve
// floor (10) pins the store below signalLab's 12-ferrous price while the furnace
// eats every surplus unit. Recovery: once the contract is claimed, dismantle the
// furnace (refundOf(4) = 4 returns its steel), suppress its rebuild until the
// signal lab stands, then let the plan rebuild it from the refund.
// Run: npx tsx work/feedback/ladder-recovery-214.mjs
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
import { RESEARCH_ORDER } from "../../src/game/content/research";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  droneAddCost,
  sellableAmount,
  upgradeCost,
} from "../../src/game/simulation/commands";
import { advance } from "../../src/game/simulation/engine";
import { nextYardStep, SELL_ORDER } from "../../src/game/simulation/plan";
import { createInitialState, fleetUnits, inputCapacityOf } from "../../src/game/simulation/types";

// Recovery keep-targets: the lab's price (scrap 50, ferrous 12) and the furnace
// refund's 4 steel, which pays for the rebuild. Surplus above these is sold so
// the 300-unit store never clogs with ferrous and blocks scrap deliveries.
const KEEP_TARGET = { scrap: 50, ferrous: 12, steel: 4 };

// A store-pull-fed machine only draws stock ABOVE the reserve floor
// (pullFromStore: available = store - floor). If the auto-player sells a recipe
// input down to the floor, the machine starves even while the store looks full.
// Keep one batch (+1 headroom) above the floor for every input a BUILT machine
// consumes, so the pull link always has room to deliver. This is the second
// new-seed consequence: the seeded store makes autoconnect choose store-pull
// links (stocked >= one batch) rather than producer links.
function workingKeep(s, recovering, caRecovering) {
  const keep = {};
  for (const m of s.machines) {
    for (const item of RECIPES[BLUEPRINTS[m.blueprint].recipeId].inputs) {
      const want = TUNING.reserveFloor + item.qty + 1;
      keep[item.resource] = Math.max(keep[item.resource] ?? 0, want);
    }
  }
  if (recovering) {
    for (const [r, target] of Object.entries(KEEP_TARGET)) {
      keep[r] = Math.max(keep[r] ?? 0, target);
    }
  }
  // While the assembler is down, no built machine consumes wire/polymer, so the
  // recipe-input keep above would drop to zero and the surplus sell would drain
  // the stockpile we are trying to build. Hold the rebuild stock explicitly.
  if (caRecovering) {
    keep.polymer = Math.max(keep.polymer ?? 0, 12);
    keep.wire = Math.max(keep.wire ?? 0, 4);
    keep.scrap = Math.max(keep.scrap ?? 0, 40);
    keep.ferrous = Math.max(keep.ferrous ?? 0, 10);
  }
  return keep;
}

// Sell the first SELL_ORDER resource with surplus above its working keep. Picking
// the most-surplus good (rather than the plan's choice, which may be a protected
// intermediate) keeps the 300-unit store from clogging with plates and blocking
// scrap deliveries.
function bestSell(s, keep) {
  for (const r of SELL_ORDER) {
    const surplus = Math.min(sellableAmount(s, r), (s.store[r] ?? 0) - (keep[r] ?? 0));
    if (surplus > 0) return { kind: "sell", resource: r, qty: surplus };
  }
  return null;
}

function run(rounds) {
  const s = createInitialState();
  let seq = 0;
  const commit = (body) => applyCommand(s, { ...body, id: `r${(seq += 1)}` });
  for (let i = 0; i < 6; i += 1) {
    commit({ type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
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
  const has = (id) => s.machines.some((m) => m.blueprint === id);
  const startersBuilt = () => has("sorter") && has("furnace");

  const marks = {};
  const note = (key, round) => {
    if (marks[key] === undefined) marks[key] = round + 1;
  };
  let recovery = false; // furnace dismantled, waiting for signalLab
  let dismantledRound = 0;
  let rebuiltRound = 0;
  let caRecovery = false; // circuitAssembler dismantled, waiting for wire+polymer stock
  let caDismantledRound = 0;
  let caRebuiltRound = 0;
  for (let round = 0; round < rounds; round += 1) {
    if (!s.exportClaimed && startersBuilt() && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
      commit({ type: "contract.export" });
      note("export", round);
    }
    // Recovery trigger: contract claimed, circuit assembler standing (tutorial 9),
    // signal lab still unbuilt, furnace standing. Dismantle the furnace so the
    // sorter's ferrous refills the store past the reserve floor to the lab's 12.
    if (
      !recovery &&
      s.exportClaimed &&
      has("circuitAssembler") &&
      has("furnace") &&
      !has("signalLab") &&
      (s.store["ferrous"] ?? 0) < 12
    ) {
      const furnace = s.machines.find((m) => m.blueprint === "furnace");
      const before = s.machines.length;
      const result = commit({ type: "machine.dismantle", machineId: furnace.id });
      if (result.ok && s.machines.length < before) {
        recovery = true;
        dismantledRound = round + 1;
        console.log(
          `round=${round + 1} DISMANTLE furnace store=${JSON.stringify(s.store)} credits=${s.credits}`,
        );
      }
    }
    // Wire-monopoly recovery: the seeded timing gives circuitAssembler a producer
    // wire link (dumps until the 16-unit buffer is full) and a store-pull polymer
    // link (floor-starved), so wire monopolises the buffer and polymer can never
    // enter (destinationRoom = 16 - 16 = 0). Dismantle the assembler, let wire AND
    // polymer stockpile, then rebuild: with both stocked, autoconnect chooses
    // window-capped store-pull links for both (pullNeed caps wire at 4), so the
    // buffer stays shared and the assembler runs.
    if (!caRecovery && has("circuitAssembler") && round > 130) {
      const ca = s.machines.find((m) => m.blueprint === "circuitAssembler");
      if (ca.batchesDone === 0 && (ca.inBuf["wire"] ?? 0) >= 14) {
        const before = s.machines.length;
        const result = commit({ type: "machine.dismantle", machineId: ca.id });
        if (result.ok && s.machines.length < before) {
          caRecovery = true;
          caDismantledRound = round + 1;
          console.log(
            `round=${round + 1} DISMANTLE circuitAssembler store=${JSON.stringify(s.store)} credits=${s.credits}`,
          );
        }
      }
    }
    let step = nextYardStep(s);
    const keep = workingKeep(s, recovery, caRecovery);
    const fallback = () => {
      const m = s.machines[0];
      return m && s.credits >= upgradeCost(BLUEPRINTS[m.blueprint].baseUpgradeCost, m.level)
        ? { kind: "upgrade", machineId: m.id }
        : { kind: "salvage" };
    };
    // While recovering, hold the furnace rebuild until the signal lab stands,
    // but keep the yard earning: build the lab when affordable, else add a drone,
    // else sell surplus above the working keep, else upgrade, else pulse.
    if (recovery && step.kind === "build" && step.blueprint === "furnace") {
      const labCost = BLUEPRINTS["signalLab"].buildCost;
      const labAffordable = labCost.every((item) => (s.store[item.resource] ?? 0) >= item.qty);
      if (labAffordable) {
        step = { kind: "build", blueprint: "signalLab" };
      } else if (s.drone.repaired && 1 + s.spares.length < TUNING.fleetCap && s.credits >= droneAddCost(s)) {
        step = { kind: "drone" };
      } else {
        step = bestSell(s, keep) ?? fallback();
      }
    }
    // Hold the circuitAssembler rebuild until BOTH wire and polymer are stocked,
    // so autoconnect gives window-capped store-pull links for both rather than a
    // buffer-monopolising producer wire link.
    if (caRecovery && step.kind === "build" && step.blueprint === "circuitAssembler") {
      if ((s.store["wire"] ?? 0) >= 2 && (s.store["polymer"] ?? 0) >= 11) {
        // afford the rebuild and let it stand; recovery ends below once built
      } else {
        step = bestSell(s, keep) ?? fallback();
      }
    }
    // Never sell a recipe input below its working keep: a store-pull-fed machine
    // draws only stock above the reserve floor, so selling to the floor starves
    // it. Replace the plan's sell with the most-surplus good above keep.
    if (step.kind === "sell") {
      step = bestSell(s, keep) ?? fallback();
    }
    note(`step:${step.kind}`, round);
    switch (step.kind) {
      case "connect":
        for (const plan of step.plans)
          commit({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
        break;
      case "build": {
        const before = s.machines.length;
        commit({ type: "machine.build", blueprint: step.blueprint, tile: firstFreeTile() });
        const built = s.machines.length > before;
        if (step.blueprint === "signalLab" && built) {
          note("signalLab", round);
          console.log(`round=${round + 1} BUILD signalLab store=${JSON.stringify(s.store)} credits=${s.credits}`);
        }
        if (step.blueprint === "furnace" && dismantledRound && built) {
          rebuiltRound = round + 1;
          console.log(`round=${round + 1} REBUILD furnace store=${JSON.stringify(s.store)} credits=${s.credits}`);
        }
        if (step.blueprint === "circuitAssembler" && caDismantledRound && built) {
          caRebuiltRound = round + 1;
          console.log(`round=${round + 1} REBUILD circuitAssembler store=${JSON.stringify(s.store)} credits=${s.credits}`);
        }
        break;
      }
      case "sell":
        commit({ type: "contract.sell", resource: step.resource, qty: step.qty });
        break;
      case "research":
        commit({ type: "research.buy", node: step.node });
        note(`research:${step.node}`, round);
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
    if (recovery && has("signalLab")) recovery = false;
    if (caRecovery && has("circuitAssembler")) caRecovery = false;
  }
  const built = new Set(s.machines.map((m) => m.blueprint));
  const missing = Object.keys(BLUEPRINTS).filter((id) => !built.has(id));
  const nodes = RESEARCH_ORDER.filter((id) => (s.research[id] ?? 0) > 0);
  console.log(
    `rounds=${rounds} machines=${built.size}/8 missing=[${missing}] nodes=${nodes.length}/3 ` +
      `fleet=${fleetUnits(s).length} export=${s.exportClaimed} dismantled=${dismantledRound} rebuilt=${rebuiltRound} caDismantled=${caDismantledRound} caRebuilt=${caRebuiltRound}`,
  );
  console.log(
    `  marks=${JSON.stringify(marks)} tick=${s.tick} links=${s.routes.length} ` +
      `batches=${s.machines.reduce((n, m) => n + m.batchesDone, 0)} credits=${s.credits}`,
  );
  console.log(`  final store=${JSON.stringify(s.store)}`);
  console.log(
    "  machines " +
      s.machines
        .map(
          (m) =>
            `${m.blueprint} L${m.level} ${m.status} b${m.batchesDone} inBuf ${JSON.stringify(m.inBuf)} tray ${m.tray.reduce((n, i) => n + i.qty, 0)}`,
        )
        .join(" | "),
  );
  console.log(
    "  links " +
      s.routes
        .map(
          (r) =>
            `${r.from.kind === "store" ? "store" : `m${r.from.id}`}->${r.to.kind === "store" ? "store" : `m${r.to.id}`}:${r.filter ?? "*"}`,
        )
        .join(" "),
  );
}

run(1800);
run(3600);
