import { describe, expect, it } from "vitest";
import {
  BLUEPRINTS,
  EXPORT_PRICES,
  TUNING,
  type ResourceId,
} from "../../src/game/content/defs";
import {
  RESEARCH,
  RESEARCH_ORDER,
  inputCapacityFor,
  nextResearchNode,
  researchBonus,
} from "../../src/game/content/research";
import { advance, advanceTo } from "../../src/game/simulation/engine";
import {
  applyCommand,
  sellableAmount,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  createInitialState,
  type MachineState,
  type RouteState,
  type SimState,
} from "../../src/game/simulation/types";
import { nextYardStep } from "../../src/game/simulation/plan";
import { objectiveFor, primaryFor } from "../../src/ui/text";
import { showResearch } from "../../src/ui/App";
import { checksum, decodeSave, encodeSave, migrate } from "../../src/game/persistence/save";

let seq = 900;
function send(state: SimState, command: CommandBody, id?: string) {
  const key = id ?? `k${(seq += 1)}`;
  return applyCommand(state, { ...command, id: key } as Command);
}

function seed(state: SimState, amounts: Partial<Record<ResourceId, number>>) {
  for (const key of Object.keys(amounts) as ResourceId[]) {
    const value = amounts[key] ?? 0;
    state.store[key] = (state.store[key] ?? 0) + value;
    state.storeUnits += value;
  }
}

/** Starter yard with the tutorial done, ready for scripted content. */
function boot(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  return state;
}

/** Highest input count the machine holds at once: buffer plus link cargo. */
function peakReady(state: SimState, machine: MachineState, link: RouteState): number {
  let peak = machine.inBufUnits + link.inFlight;
  for (let i = 0; i < 200; i += 1) {
    advance(state, 1);
    peak = Math.max(peak, machine.inBufUnits + link.inFlight);
  }
  return peak;
}

/** Yard with one signal lab fed by the store, so `data` arrives on its own. */
function labYard(): { state: SimState; lab: number } {
  const state = boot();
  state.tutorial = 9;
  seed(state, { scrap: 300, ferrous: 40, circuits: 20 });
  send(state, { type: "machine.build", blueprint: "signalLab", tile: 8 });
  const built = state.machines[state.machines.length - 1];
  expect(built?.blueprint).toBe("signalLab");
  const lab = built.id;
  send(state, { type: "route.connect", from: 0, to: lab, filter: "circuits" });
  send(state, { type: "route.connect", from: lab, to: 0, filter: "data" });
  return { state, lab };
}

describe("research branch (spec 12.2)", () => {
  it("declares three nodes with exact costs and a single prerequisite chain", () => {
    expect(RESEARCH_ORDER).toEqual(["cutters", "buffers", "dispatch"]);
    expect(RESEARCH.cutters.requires).toBeNull();
    expect(RESEARCH.buffers.requires).toBe("cutters");
    expect(RESEARCH.dispatch.requires).toBe("buffers");
    const costs = RESEARCH_ORDER.map((id) => RESEARCH[id].cost);
    expect(costs).toEqual([4, 8, 12]);
    for (const id of RESEARCH_ORDER) {
      expect(RESEARCH[id].maxRank).toBe(1);
      expect(RESEARCH[id].effect.length).toBeGreaterThan(10);
    }
    // Every effect is an integer delta the simulation already reports.
    const state = createInitialState();
    expect(researchBonus(state)).toEqual({ pulseScrap: 0, inputBuffer: 0, routeCapacity: 0 });
    state.research = { cutters: 1, buffers: 1, dispatch: 1 };
    expect(researchBonus(state)).toEqual({ pulseScrap: 2, inputBuffer: 6, routeCapacity: 8 });
  });

  it("charges data once, applies the effect once, and refuses a repeat purchase", () => {
    const state = boot();
    seed(state, { data: 20 });
    const before = state.store.data ?? 0;
    const bought = send(state, { type: "research.buy", node: "cutters" }, "buy-1");
    expect(bought.ok).toBe(true);
    expect(state.store.data).toBe(before - RESEARCH.cutters.cost);
    expect(state.research.cutters).toBe(1);

    const revision = state.revision;
    const again = send(state, { type: "research.buy", node: "cutters" }, "buy-2");
    expect(again).toEqual({ ok: false, reason: "already-known" });
    expect(state.revision).toBe(revision);
    expect(state.store.data).toBe(before - RESEARCH.cutters.cost);

    // A retried command id returns the first result instead of spending twice.
    const retry = send(state, { type: "research.buy", node: "cutters" }, "buy-1");
    expect(retry.ok).toBe(true);
    expect(state.research.cutters).toBe(1);
    expect(state.store.data).toBe(before - RESEARCH.cutters.cost);
  });

  it("gates the next node behind its prerequisite", () => {
    const state = boot();
    seed(state, { data: 24 });
    expect(send(state, { type: "research.buy", node: "buffers" })).toEqual({
      ok: false,
      reason: "prereq",
    });
    expect(state.research.buffers).toBeUndefined();
    send(state, { type: "research.buy", node: "cutters" });
    expect(send(state, { type: "research.buy", node: "buffers" }).ok).toBe(true);
    expect(nextResearchNode(state)?.id).toBe("dispatch");
    // Not yet affordable: 24 - 4 - 8 = 12 exactly covers the last node.
    expect((state.store.data ?? 0) >= RESEARCH.dispatch.cost).toBe(true);
    send(state, { type: "research.buy", node: "dispatch" });
    expect(nextResearchNode(state)).toBeNull();
    expect(researchBonus(state).routeCapacity).toBe(8);
  });

  it("rejects an unaffordable or unknown node without touching the ledger", () => {
    const state = boot();
    seed(state, { data: 3 });
    const revision = state.revision;
    // PLAY-001 P-1: the shortfall rides along with the reason, read off the same tables
    // the button's price came from (3 Data held against the node's 4).
    expect(send(state, { type: "research.buy", node: "cutters" })).toEqual({
      ok: false,
      reason: "insufficient",
      need: 4,
      have: 3,
      word: "data",
    });
    expect(send(state, { type: "research.buy", node: "nope" })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(state.revision).toBe(revision);
    expect(state.store.data).toBe(3);
    expect(Object.keys(state.research).length).toBe(0);
  });

  it("changes the cutting pulse to exactly seven scrap", () => {
    const state = boot();
    seed(state, { data: 4 });
    const baseline = state.store.scrap ?? 0;
    advance(state, TUNING.manualPulseTicks);
    send(state, { type: "manual.salvage" });
    expect((state.store.scrap ?? 0) - baseline).toBe(TUNING.manualSalvagePerPulse);

    send(state, { type: "research.buy", node: "cutters" });
    advance(state, TUNING.manualPulseTicks);
    const before = state.store.scrap ?? 0;
    send(state, { type: "manual.salvage" });
    expect((state.store.scrap ?? 0) - before).toBe(TUNING.manualSalvagePerPulse + 2);
  });

  it("widens the ready window the link fills, inside the effective capacity", () => {
    const state = boot();
    seed(state, { scrap: 60, data: 12 });
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = state.machines[state.machines.length - 1];
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    const link = state.routes[state.routes.length - 1];
    // Two ready batches of the sorter's two scrap, and no more (B-19), so the
    // surplus scrap stays in the store where build costs and sells are read.
    expect(peakReady(state, sorter, link)).toBe(4);
    expect(peakReady(state, sorter, link)).toBeLessThanOrEqual(BLUEPRINT_CAPACITY("sorter"));
    expect(inputCapacityFor(state, BLUEPRINT_CAPACITY("sorter"))).toBe(
      BLUEPRINT_CAPACITY("sorter")
    );

    send(state, { type: "research.buy", node: "cutters" });
    send(state, { type: "research.buy", node: "buffers" });
    expect(BLUEPRINT_CAPACITY("sorter")).toBe(12);
    expect(inputCapacityFor(state, BLUEPRINT_CAPACITY("sorter"))).toBe(18);
    // Smart Buffers widens that window by exactly six units, still under 18.
    expect(peakReady(state, sorter, link)).toBe(10);
    expect(peakReady(state, sorter, link)).toBeLessThanOrEqual(18);
  });

  it("raises only links created after the purchase", () => {
    const state = boot();
    seed(state, { data: 24 });
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = state.machines[state.machines.length - 1];
    send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    expect(state.routes[state.routes.length - 1].capacity).toBe(TUNING.routeCapacity);

    send(state, { type: "research.buy", node: "cutters" });
    send(state, { type: "research.buy", node: "buffers" });
    send(state, { type: "research.buy", node: "dispatch" });
    send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
    expect(state.routes[0].capacity).toBe(TUNING.routeCapacity);
    expect(state.routes[state.routes.length - 1].capacity).toBe(TUNING.routeCapacity + 8);
  });

  it("produces data in the yard so the branch is actually affordable", () => {
    const { state } = labYard();
    advance(state, 400);
    expect(state.store.data ?? 0).toBeGreaterThanOrEqual(2);
    expect(nextResearchNode(state)?.id).toBe("cutters");
  });

  it("suggests the next node when data covers it and nothing is buildable", () => {
    const { state } = labYard();
    advance(state, 700);
    // Freeze every other option: only data remains in the store, so the ladder
    // has to reach the research step rather than a build or a sell.
    const data = state.store.data ?? 0;
    state.store = { data };
    state.storeUnits = data;
    const step = nextYardStep(state);
    expect(step.kind).toBe("research");
    if (step.kind !== "research") return;
    expect(step.node).toBe("cutters");
    // Card and dock must phrase the same goal (spec 3.3).
    const card = objectiveFor(state, null);
    const dock = primaryFor(state, step);
    expect(dock.label).toBe(`Research ${RESEARCH.cutters.label}`);
    expect(dock.cost).toBe(`${RESEARCH.cutters.cost} Data`);
    // The card is one line: the node name and its price. The exact effect sentence
    // belongs to the research panel beside the buy button (tests/ui/app.test.tsx).
    expect(card).toBe(`Research ${RESEARCH.cutters.label} · ${RESEARCH.cutters.cost} Data`);
    expect(RESEARCH.cutters.effect.length).toBeGreaterThan(0);
  });

  it("sells surplus data like any other ledger resource", () => {
    const { state } = labYard();
    state.exportClaimed = true;
    advance(state, 1200);
    const amount = sellableAmount(state, "data");
    const credits = state.credits;
    expect(amount).toBeGreaterThan(0);
    expect(send(state, { type: "contract.sell", resource: "data", qty: amount }).ok).toBe(true);
    expect(state.credits).toBe(credits + amount * EXPORT_PRICES.data!);
  });

  it("keeps tick-by-tick and event-jump runs identical with research owned", () => {
    const a = labYard().state;
    const b = labYard().state;
    for (const state of [a, b]) {
      seed(state, { data: 24 });
      send(state, { type: "research.buy", node: "cutters" });
      send(state, { type: "research.buy", node: "buffers" });
      send(state, { type: "research.buy", node: "dispatch" });
    }
    advance(a, 600);
    advanceTo(b, b.tick + 600);
    expect(JSON.stringify(b.machines)).toBe(JSON.stringify(a.machines));
    expect(JSON.stringify(b.routes)).toBe(JSON.stringify(a.routes));
    expect(JSON.stringify(b.store)).toBe(JSON.stringify(a.store));
    expect(a.store.data ?? 0).toBeGreaterThan(0);
  });

  it("reveals the dock target only when the branch has something to show", () => {
    const fresh = createInitialState();
    expect(showResearch(fresh)).toBe(false);
    fresh.store.data = 1;
    expect(showResearch(fresh)).toBe(true);
    const known = createInitialState();
    known.research = { cutters: 1 };
    expect(showResearch(known)).toBe(true);
  });

  it("survives a save round-trip and a legacy save without the field", () => {
    const { state } = labYard();
    advance(state, 200);
    seed(state, { data: 20 });
    send(state, { type: "research.buy", node: "cutters" });
    const text = encodeSave(state, 1, { muted: false, reducedMotion: false, textScale: 1 });
    const decoded = decodeSave(text);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.payload.sim.research).toEqual({ cutters: 1 });
      const loaded = migrate(decoded.payload).sim;
      expect(researchBonus(loaded).pulseScrap).toBe(2);
    }

    // A save written before research existed: the field is simply absent, and
    // the migration refills it so an old run keeps playing without a restart.
    const legacy = restamp(text, (sim) => {
      delete sim.research;
      return sim;
    });
    const revived = decodeSave(legacy);
    expect(revived.ok).toBe(true);
    if (revived.ok) {
      const loaded = migrate(revived.payload).sim;
      expect(loaded.research).toEqual({});
      expect(researchBonus(loaded).pulseScrap).toBe(0);
    }
  });

  it("rejects an impossible research rank in an imported payload", () => {
    const { state } = labYard();
    const text = encodeSave(state, 1, { muted: false, reducedMotion: false, textScale: 1 });
    expect(
      decodeSave(restamp(text, (sim) => ({ ...sim, research: { cutters: -1 } }))).ok
    ).toBe(false);
    expect(
      decodeSave(restamp(text, (sim) => ({ ...sim, research: { nope: 1 } }))).ok
    ).toBe(false);
  });
});

/** Rewrites a stored payload and re-stamps the envelope checksum. */
function restamp(
  text: string,
  change: (sim: Record<string, unknown>) => Record<string, unknown>
): string {
  const envelope = JSON.parse(text) as {
    schemaVersion: number;
    checksum: string;
    payload: { sim: Record<string, unknown>; lastSeenMs: number; settings: unknown };
  };
  envelope.payload.sim = change(envelope.payload.sim);
  envelope.checksum = checksum(JSON.stringify(envelope.payload));
  return JSON.stringify(envelope);
}

function BLUEPRINT_CAPACITY(blueprint: string): number {
  return BLUEPRINTS[blueprint].inputBuffer;
}
