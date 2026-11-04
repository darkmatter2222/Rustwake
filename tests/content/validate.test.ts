import { describe, expect, it } from "vitest";
import { BLUEPRINTS, EXPORT_PRICES, RECIPES, RESOURCES, TUNING } from "../../src/game/content/defs";
import { RESEARCH, RESEARCH_ORDER } from "../../src/game/content/research";
import { STRINGS } from "../../src/game/content/strings";
import { validateContent, validateBehaviour } from "../../src/game/content/validate";

/**
 * B-12: the content gate that CI runs (`npx tsx scripts/validate-content.mjs`). The tests
 * here keep both halves honest: the shipped tables must pass, the tables must be the size
 * the checks assume so a silently empty check cannot "pass", and an injected fault must
 * actually be reported rather than skipped.
 */
describe("content validator (B-12)", () => {
  it("accepts the shipped tables", () => {
    expect(validateContent()).toEqual([]);
  });

  it("is checking a non-trivial amount of content", () => {
    // If one of these shrinks to zero the checks above would pass vacuously.
    expect(RESOURCES.length).toBe(15);
    expect(Object.keys(BLUEPRINTS).length).toBe(8);
    expect(Object.keys(RECIPES).length).toBe(12);
    expect(Object.keys(RESEARCH).length).toBe(3);
    expect(RESEARCH_ORDER.length).toBe(3);
    expect(Object.keys(EXPORT_PRICES).length).toBe(14);
    expect(Object.keys(TUNING).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(STRINGS).length).toBeGreaterThanOrEqual(120);
  });

  it("names a missing string key, an empty default, and a malformed slot (B-10)", () => {
    const table = STRINGS as Record<string, string>;
    const saved = {
      research: table["objective.research"],
      place: table["btn.place"],
      salvage: table["btn.salvage"],
    };

    // A hint id the table never declared would paint its own key on the objective card.
    delete table["objective.research"];
    expect(
      validateContent().some((line) => line.includes("objective.research") && line.includes("missing key"))
    ).toBe(true);
    table["objective.research"] = saved.research;

    table["btn.place"] = "Place {machine";
    expect(
      validateContent().some((line) => line.includes("btn.place") && line.includes("unbalanced"))
    ).toBe(true);
    table["btn.place"] = saved.place;

    table["btn.salvage"] = "";
    expect(
      validateContent().some((line) => line.includes("btn.salvage") && line.includes("no English default"))
    ).toBe(true);
    table["btn.salvage"] = saved.salvage;

    expect(validateContent()).toEqual([]);
  });

  it("reports a zero-time cycle, an oversized footprint and a missing price", () => {
    const r01 = RECIPES["R01"] as unknown as { cycleTicks: number };
    const sorter = BLUEPRINTS["sorter"] as unknown as { footprint: readonly [number, number] };
    const prices = EXPORT_PRICES as unknown as Record<string, number | undefined>;
    const original = { cycle: r01.cycleTicks, footprint: sorter.footprint, data: prices["data"] };

    r01.cycleTicks = 0;
    expect(validateContent().some((line) => line.includes("R01") && line.includes("cycle"))).toBe(true);
    r01.cycleTicks = original.cycle;

    sorter.footprint = [4, 4];
    expect(validateContent().some((line) => line.includes("sorter") && line.includes("footprint"))).toBe(true);
    sorter.footprint = original.footprint;

    prices["data"] = undefined;
    expect(validateContent().some((line) => line.includes("data") && line.includes("export price"))).toBe(true);
    prices["data"] = original.data;

    expect(validateContent()).toEqual([]);
  });

  it("runs the ladder to every stage and keeps a balanced ledger", () => {
    const { violations, marks } = validateBehaviour(1800);
    expect(violations).toEqual([]);
    // Same numbers the standalone driver publishes in docs/evidence (D-38), measured by a
    // second implementation, so the two cannot drift apart unnoticed.
    expect(machines(marks)).toEqual({ machines: 8, links: 18, drones: 5, batches: 1902, nodes: 3 });
    expect(marks["firstDrone"]).toBe(268);
    expect(marks["firstResearch"]).toBe(478);
    expect(marks["credits"]).toBe(82);
  });
});

function machines(marks: Record<string, number>) {
  return {
    machines: marks["machines"],
    links: marks["links"],
    drones: marks["drones"],
    batches: marks["batches"],
    nodes: marks["nodes"],
  };
}
