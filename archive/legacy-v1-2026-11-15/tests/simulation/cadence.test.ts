import { describe, expect, it } from "vitest";
import { BLUEPRINTS, TUNING, unlockedBlueprints } from "../../src/game/content/defs";
import { nextResearchNode } from "../../src/game/content/research";
import {
  applyCommand,
  DOCK_TILE,
  sellableAmount,
  upgradeCost,
  YARD_TILES,
  type Command,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { SELL_ORDER, type YardStep } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import {
  newLadderRecovery,
  ladderRecoveryTriggers,
  ladderRecoveryAdjust,
  ladderRecoveryClear,
} from "../../src/game/content/validate";

/**
 * B-21: is the ladder's build-before-upgrade order a lever? The two runs below are
 * `nextYardStep` re-implemented with one swap (the affordable-upgrade check moved in
 * front of the unbuilt-blueprint loop); everything else, including the connect stage,
 * the research stage, the pending-skipping sell and the near-goal build probe, is in
 * the shipped position. Under the #214 retuned GAME_SYSTEMS seed plus the shared
 * dismantle-refund recovery, order is a mild efficiency lever (60 batches, ~3.1 %,
 * and purse timing), NOT a reachability lever: both orders complete the full yard
 * (8 machines, fleet 5, 3 research nodes). The old identical-totals/0-ambiguous
 * reading was an emergent coincidence of the old balanced numbers. Numbers land in
 * `docs/evidence/2026-11-03-cadence.md`, which `npx tsx scripts/probe-cadence.mjs` writes.
 */
const ROUNDS = 1800; // 18 000 ticks = 30 minutes of active play

// The mirror speaks the shipped `YardStep` so the shared recovery adjuster
// (ladderRecoveryAdjust) can rewrite a chosen step exactly as validateBehaviour does.

interface Run {
  order: string;
  machines: number;
  fleet: number;
  totals: number;
  credits: number;
  research: number;
  levels: string;
  ambiguous: number;
  kinds: Record<string, number>;
}

function affordable(state: SimState, blueprint: string): boolean {
  const def = BLUEPRINTS[blueprint];
  if (!def) return false;
  return def.buildCost.every((item) => (state.store[item.resource] ?? 0) >= item.qty);
}

/** Cheapest affordable upgrade: lowest level, then the busiest machine (spec 8.6). */
function upgradeStep(state: SimState): YardStep | null {
  let best: { machineId: number; level: number; busy: number } | null = null;
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
}

function pending(state: SimState, unbuilt: readonly string[]) {
  const set = new Set<string>();
  for (const id of unbuilt) {
    const def = BLUEPRINTS[id];
    if (!def) continue;
    for (const item of def.buildCost) {
      if ((state.store[item.resource] ?? 0) < item.qty) set.add(item.resource);
    }
  }
  return set;
}

function nearest(state: SimState, unbuilt: readonly string[]): string {
  let best = unbuilt[0] ?? "";
  let bestShortfall = Number.POSITIVE_INFINITY;
  for (const id of unbuilt) {
    const def = BLUEPRINTS[id];
    if (!def) continue;
    const shortfall = def.buildCost.reduce(
      (sum, item) => sum + Math.max(0, item.qty - (state.store[item.resource] ?? 0)),
      0
    );
    if (shortfall < bestShortfall) {
      best = id;
      bestShortfall = shortfall;
    }
  }
  return best;
}

/** The shipped ladder with one knob: which of `build` and `upgrade` is checked first. */
function nextStep(state: SimState, upgradeFirst: boolean): YardStep {
  for (const machine of state.machines) {
    const plans = planConnections(state, machine.id);
    if (plans.length > 0) return { kind: "connect", machineId: machine.id, plans };
  }
  const unbuilt = unlockedBlueprints(state.tutorial).filter(
    (id) => !state.machines.some((m) => m.blueprint === id)
  );
  const makeBuild = () => {
    for (const blueprint of unbuilt) if (affordable(state, blueprint)) return { kind: "build" as const, blueprint };
    return null;
  };
  const makeResearch = () => {
    const node = nextResearchNode(state);
    return node && (state.store.data ?? 0) >= node.cost
      ? ({ kind: "research", node: node.id } as YardStep)
      : null;
  };
  const makeDrone = () => {
    if (!state.drone.repaired) return null;
    if (1 + state.spares.length >= TUNING.fleetCap) return null;
    if (state.credits < TUNING.droneAddBaseCost * 2 ** state.spares.length) return null;
    return { kind: "drone" } as YardStep;
  };
  const makeSell = (skipPending: boolean) => {
    const blocked = skipPending ? pending(state, unbuilt) : new Set<string>();
    for (const resource of SELL_ORDER) {
      if (blocked.has(resource)) continue;
      const qty = sellableAmount(state, resource);
      if (qty > 0) return { kind: "sell", resource, qty } as YardStep;
    }
    return null;
  };
  const makeNearBuild = () =>
    unbuilt.length > 0 ? { kind: "build" as const, blueprint: nearest(state, unbuilt) } : null;

  const stages = upgradeFirst
    ? [makeResearch, makeDrone, () => upgradeStep(state), makeBuild, () => makeSell(true), makeNearBuild, () => makeSell(false)]
    : [makeBuild, makeResearch, makeDrone, () => upgradeStep(state), () => makeSell(true), makeNearBuild, () => makeSell(false)];
  for (const stage of stages) {
    const step = stage();
    if (step) return step as YardStep;
  }
  const machine = state.machines[0];
  if (machine) return { kind: "upgrade", machineId: machine.id };
  return { kind: "salvage" };
}

function runOrder(order: string): Run {
  const upgradeFirst = order === "upgrade-first";
  let seq = 0;
  const send = (state: SimState, body: Record<string, unknown>) => {
    seq += 1;
    return applyCommand(state, { ...body, id: `${order}-${seq}` } as Command);
  };
  const freeTile = (state: SimState) => {
    for (let tile = 0; tile < YARD_TILES; tile += 1) {
      if (tile === DOCK_TILE) continue;
      if (!state.machines.some((m) => m.tile === tile)) return tile;
    }
    return 8;
  };

  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  // #214: leave the tutorial at the boot milestone and let it advance through play
  // exactly as validateBehaviour and the chain B-19 session do. Forcing step 9 skipped
  // the progressive unlock, so the ladder never bought research and left the wire mill
  // jammed (the same fidelity fix chain.test.ts records).

  // #214: play the same dismantle-refund recovery as validateBehaviour and the
  // fork/chain mirrors, so the seeded economy reaches the full yard at power 6.
  const recovery = newLadderRecovery();
  let ambiguous = 0;
  const kinds: Record<string, number> = {};
  for (let round = 0; round < ROUNDS; round += 1) {
    // #214: the seed's 12 steel pays for the sorter and furnace (4 + 4) first; the
    // 10-steel contract waits for both starters so the yard is not left with 2 steel
    // and no steel source (same taught order as validateBehaviour).
    const startersBuilt =
      state.machines.some((m) => m.blueprint === "sorter") &&
      state.machines.some((m) => m.blueprint === "furnace");
    if (!state.exportClaimed && startersBuilt && (state.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
      send(state, { type: "contract.export" }); // T7's one press opens the market
    }
    ladderRecoveryTriggers(state, recovery, round);
    const step = ladderRecoveryAdjust(state, recovery, nextStep(state, upgradeFirst));
    const canBuild = unlockedBlueprints(state.tutorial)
      .filter((id) => !state.machines.some((m) => m.blueprint === id))
      .some((id) => affordable(state, id));
    if (canBuild && upgradeStep(state)) ambiguous += 1;
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
        send(state, { type: "machine.build", blueprint: step.blueprint, tile: freeTile(state) });
        break;
      case "sell":
        send(state, { type: "contract.sell", resource: step.resource, qty: step.qty });
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
    ladderRecoveryClear(state, recovery);
  }

  return {
    order,
    machines: state.machines.length,
    fleet: 1 + state.spares.length,
    totals: state.machines.reduce((sum, machine) => sum + machine.batchesDone, 0),
    credits: state.credits,
    research: Object.keys(state.research).length,
    levels: state.machines.map((m) => `${m.blueprint} L${m.level}`).join(","),
    ambiguous,
    kinds,
  };
}

describe("build-versus-upgrade cadence (B-21)", () => {
  const runs: Run[] = [];
  const first = runOrder("build-first");
  const second = runOrder("upgrade-first");
  runs.push(first, second);

  it("opens the market so the headless yard behaves like the scripted one", () => {
    // The fidelity fix: with the onboarding contract claimed the ladder actually
    // upgrades, which is what the real Chrome session shows (sorter L13 in 30 min).
    expect(first.credits).toBeGreaterThanOrEqual(0);
    expect(first.kinds["upgrade"] ?? 0).toBeGreaterThan(0);
    expect(first.machines).toBe(8);
    expect(first.research).toBe(3);
    // The same number the probe prints, so the fixture and the evidence table cannot
    // drift apart. #214 re-pin: the GAME_SYSTEMS seed plus the shared dismantle-refund
    // recovery (the same play validateBehaviour and chain B-19 use) lands build-first at
    // 1 910 batches. BELT-001 had restated 1 902 -> 1 838 on the priced tree; the retuned
    // starter costs and the recovery's furnace->signalLab rebuild shift the purse timing
    // again. The clock is untouched (`routeLatencyTicks` 5).
    expect(first.totals).toBe(1910);
    // The fleet step is a real stage: the ladder bought spare drones in both orders,
    // which is what lifts the batch total above the one-drone 1 757 (B-28, D-38).
    expect(first.fleet).toBeGreaterThan(1);
    expect(first.kinds["drone"] ?? 0).toBeGreaterThan(0);
    expect(Math.max(...(first.levels.match(/L(\d+)/g) ?? []).map((part) => Number(part.slice(1)))))
      .toBeGreaterThan(1);
    console.log("cadence:", JSON.stringify(runs));
  });

  it("both orders complete the full yard; the retuned seed makes order a mild efficiency lever", () => {
    // Reachability is order-independent, and now asserted for BOTH runs explicitly
    // (upgrade-first reachability was previously only implied by equality with
    // build-first): each order builds all 8 machines, flies the full 5-drone fleet
    // and buys all 3 research nodes inside the 30-minute window.
    expect(first.machines).toBe(8);
    expect(second.machines).toBe(8);
    expect(first.fleet).toBe(5);
    expect(second.fleet).toBe(5);
    expect(first.research).toBe(3);
    expect(second.research).toBe(3);
    // #214 re-characterization: the GAME_SYSTEMS seed plus the shared dismantle-refund
    // recovery introduce mild, benign path-dependence. Build-first finishes 60 batches
    // ahead (1 910 vs 1 850, ~3.1 %) with a thinner purse (75 vs 145 credits): checking
    // upgrades earlier shifts purse timing and the level mix (levels within 1; the
    // per-order levels/kinds stay in the console.log characterization above), but
    // neither order stalls. The old identical totals were an emergent coincidence of
    // the old balanced numbers, not an invariant; the authoritative spec 23.2 gate
    // (validateBehaviour) stays green on the shipped order. No game rule changed.
    expect(first.totals).toBe(1910);
    expect(second.totals).toBe(1850);
    expect(first.credits).toBe(75);
    expect(second.credits).toBe(145);
  });

  it("both branches sometimes open under the retuned seed, so order is a mild lever", () => {
    // #214: the retuned starter costs and the shared dismantle-refund recovery let
    // materials and credits line up at the same time more often, so both swapped
    // branches are genuinely open in some rounds (96 build-first, 32 upgrade-first of
    // 1 800). That path-dependence is what makes order the mild efficiency lever
    // characterized above. The old 0-ambiguous reading was an emergent coincidence of
    // the old balanced numbers, not a rule; no game rule changed to produce these counts.
    expect(first.ambiguous, `ambiguous rounds at ${first.order}`).toBe(96);
    expect(second.ambiguous, `ambiguous rounds at ${second.order}`).toBe(32);
    expect(first.kinds["sell"] ?? 0).toBeGreaterThan(0);
    expect(first.kinds["build"] ?? 0).toBeGreaterThan(8); // near-goal probes included
  });
});
