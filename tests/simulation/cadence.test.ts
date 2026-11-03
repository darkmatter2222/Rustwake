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
import { SELL_ORDER } from "../../src/game/simulation/plan";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState, type SimState } from "../../src/game/simulation/types";

/**
 * B-21: is the ladder's build-before-upgrade order a lever? The two runs below are
 * `nextYardStep` re-implemented with one swap (the affordable-upgrade check moved in
 * front of the unbuilt-blueprint loop); everything else, including the connect stage,
 * the research stage, the pending-skipping sell and the near-goal build probe, is in
 * the shipped position. Numbers land in `docs/evidence/2026-11-03-cadence.md`, which
 * `npx tsx scripts/probe-cadence.mjs` writes.
 */
const ROUNDS = 1800; // 18 000 ticks = 30 minutes of active play

type LooseStep =
  | { kind: "connect"; plans: ReturnType<typeof planConnections> }
  | { kind: "build"; blueprint: string }
  | { kind: "sell"; resource: Parameters<typeof sellableAmount>[1]; qty: number }
  | { kind: "research"; node: string }
  | { kind: "drone" }
  | { kind: "upgrade"; machineId: number }
  | { kind: "salvage" };

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
function upgradeStep(state: SimState): LooseStep | null {
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
function nextStep(state: SimState, upgradeFirst: boolean): LooseStep {
  for (const machine of state.machines) {
    const plans = planConnections(state, machine.id);
    if (plans.length > 0) return { kind: "connect", plans };
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
      ? ({ kind: "research", node: node.id } as LooseStep)
      : null;
  };
  const makeDrone = () => {
    if (!state.drone.repaired) return null;
    if (1 + state.spares.length >= TUNING.fleetCap) return null;
    if (state.credits < TUNING.droneAddBaseCost * 2 ** state.spares.length) return null;
    return { kind: "drone" } as LooseStep;
  };
  const makeSell = (skipPending: boolean) => {
    const blocked = skipPending ? pending(state, unbuilt) : new Set<string>();
    for (const resource of SELL_ORDER) {
      if (blocked.has(resource)) continue;
      const qty = sellableAmount(state, resource);
      if (qty > 0) return { kind: "sell", resource, qty } as LooseStep;
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
    if (step) return step as LooseStep;
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
  state.tutorial = 9;

  let ambiguous = 0;
  const kinds: Record<string, number> = {};
  for (let round = 0; round < ROUNDS; round += 1) {
    if (!state.exportClaimed && (state.store["steel"] ?? 0) >= TUNING.exportContractSteel) {
      send(state, { type: "contract.export" }); // T7's one press opens the market
    }
    const step = nextStep(state, upgradeFirst);
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
    // drift apart.
    expect(first.totals).toBe(1864);
    // The fleet step is a real stage: the ladder bought spare drones in both orders,
    // which is what lifts the batch total above the one-drone 1 757 (B-28, D-38).
    expect(first.fleet).toBeGreaterThan(1);
    expect(first.kinds["drone"] ?? 0).toBeGreaterThan(0);
    expect(Math.max(...(first.levels.match(/L(\d+)/g) ?? []).map((part) => Number(part.slice(1)))))
      .toBeGreaterThan(1);
    console.log("cadence:", JSON.stringify(runs));
  });

  it("lands on the same yard whichever of the two stages is checked first", () => {
    expect(second.machines).toBe(first.machines);
    expect(second.fleet).toBe(first.fleet);
    expect(second.totals).toBe(first.totals);
    expect(second.credits).toBe(first.credits);
    expect(second.research).toBe(first.research);
    expect(second.levels).toBe(first.levels);
    expect(second.kinds).toEqual(first.kinds);
  });

  it("almost never has both branches open, which is why the order is immaterial", () => {
    // The ladder spends credits the moment they reach the cheapest upgrade price and
    // materials pile up only while credits are short, so the two stages rarely claim
    // the same round. Measured: 0 ambiguous rounds in 1 800.
    for (const run of runs) {
      expect(run.ambiguous, `ambiguous rounds at ${run.order}`).toBe(0);
    }
    expect(first.kinds["sell"] ?? 0).toBeGreaterThan(0);
    expect(first.kinds["build"] ?? 0).toBeGreaterThan(8); // near-goal probes included
  });
});
