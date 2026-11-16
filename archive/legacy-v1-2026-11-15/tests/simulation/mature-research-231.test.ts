import { describe, expect, it } from "vitest";
import {
  buildMature,
  buildMatureResearch,
  fixtureSaveText,
  FIXTURE_WITNESS_MS,
  MATURE_BUILDINGS,
  MATURE_CARGO,
  MATURE_RESEARCH_DATA,
} from "../fixtures/release";
import { RESEARCH } from "../../src/game/content/research";
import { unitTotal } from "../../src/game/simulation/invariants";
import { decodeSave } from "../../src/game/persistence/save";
import type { SimState } from "../../src/game/simulation/types";

/**
 * #231 — MATURE-RESEARCH variant contract (P03 instrument fixture).
 *
 * The P03 panel-open gate hard-failed on Research because canonical MATURE
 * seeds scrap/steel only: showResearch (App.tsx) needs data > 0 OR an owned
 * node, so the Research dock face never rendered. The variant adds a bounded
 * data fill at the conserved addToStore boundary plus ONE real research.buy
 * command. These tests pin that the variant is deterministic, Research-
 * reachable, conservation-clean, and that canonical MATURE (P01/P02/V02/V05)
 * is byte-unchanged by its existence.
 */

/** The shipped Research gate, verbatim from src/ui/App.tsx showResearch. */
const showResearch = (sim: SimState): boolean =>
  (sim.store.data ?? 0) > 0 || Object.keys(sim.research ?? {}).length > 0;

const storeSum = (sim: SimState): number =>
  Object.values(sim.store).reduce((a, b) => a + b, 0);

describe("MATURE-RESEARCH variant (#231)", () => {
  it("is deterministic: byte-identical save envelope at the witness time", () => {
    const a = buildMatureResearch();
    const b = buildMatureResearch();
    expect(fixtureSaveText(a.sim, FIXTURE_WITNESS_MS)).toBe(fixtureSaveText(b.sim, FIXTURE_WITNESS_MS));
  });

  it("makes the shipped Research gate true via data AND an owned node", () => {
    const { sim } = buildMatureResearch();
    expect(showResearch(sim)).toBe(true);
    expect(sim.store.data).toBe(MATURE_RESEARCH_DATA - RESEARCH.cutters.cost);
    expect(sim.research).toEqual({ cutters: 1 });
  });

  it("stays conserved: cargo grows only by the fill minus the command cost", () => {
    const canonical = buildMature().sim;
    const { sim } = buildMatureResearch();
    const delta = MATURE_RESEARCH_DATA - RESEARCH.cutters.cost;
    expect(unitTotal(sim)).toBe(MATURE_CARGO + delta);
    // addToStore/spendFromStore move storeUnits and sum(store) together, so
    // the variant shifts BOTH by exactly delta. Canonical MATURE's own store
    // accounting (storeUnits 178 vs sum 190, pinned by opening-151) is carried
    // over unchanged — the variant neither repairs nor worsens it.
    expect(sim.storeUnits).toBe(canonical.storeUnits + delta);
    expect(storeSum(sim)).toBe(storeSum(canonical) + delta);
    // The purchase went through the real command: one research commit logged.
    expect(sim.log[sim.log.length - 1]).toEqual({ tick: sim.tick, key: "research", value: RESEARCH.cutters.cost });
  });

  it("changes nothing else: canonical MATURE economy and session layer intact", () => {
    const canonical = buildMature();
    const variant = buildMatureResearch();
    const c = canonical.sim;
    const v = variant.sim;
    expect(v.machines.length).toBe(MATURE_BUILDINGS);
    expect(v.machines).toEqual(c.machines);
    expect(v.routes).toEqual(c.routes);
    expect(v.drone).toEqual(c.drone);
    expect(v.store.scrap).toBe(c.store.scrap);
    expect(v.store.steel).toBe(c.store.steel);
    expect(v.credits).toBe(c.credits);
    expect(v.tick).toBe(c.tick);
    expect(v.wreck).toEqual(c.wreck);
    expect(v.storeCapacity).toBe(c.storeCapacity);
    expect(v.revision).toBe(c.revision + 1);
    expect(variant.world).toEqual(canonical.world);
    expect(variant.net).toEqual(canonical.net);
    expect(variant.log).toEqual(canonical.log);
    expect(variant.traffic).toEqual(canonical.traffic);
  });

  it("canonical MATURE remains Research-gated OFF (other gates unaffected)", () => {
    const { sim } = buildMature();
    expect(showResearch(sim)).toBe(false);
    expect(sim.store.data ?? 0).toBe(0);
    expect(sim.research).toEqual({});
    expect(unitTotal(sim)).toBe(MATURE_CARGO);
  });

  it("decodes through the game's own save gate (harness precondition)", () => {
    const { sim } = buildMatureResearch();
    const d = decodeSave(fixtureSaveText(sim, FIXTURE_WITNESS_MS));
    expect(d.ok).toBe(true);
  });
});
