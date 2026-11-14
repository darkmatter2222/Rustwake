/**
 * Research content (spec 12.2, 27.5): a short clear path with exact, visible
 * effects. One branch is enough for this milestone, and every effect is an
 * integer change to a quantity the simulation already reports, so a node can be
 * verified without reverse-engineering a formula.
 */

import type { SimState } from "../simulation/types";

export interface ResearchDef {
  readonly id: string;
  readonly label: string;
  /** Exact visible effect, shown verbatim before purchase (spec 12.2). */
  readonly effect: string;
  /** Data units spent once. */
  readonly cost: number;
  readonly requires: string | null;
  /** Purchases beyond this rank are rejected, so effects apply exactly once. */
  readonly maxRank: number;
}

export const RESEARCH: Readonly<Record<string, ResearchDef>> = {
  cutters: {
    id: "cutters",
    label: "Efficient Cutters",
    effect: "One cutting pulse gives 7 scrap instead of 5.",
    cost: 4,
    requires: null,
    maxRank: 1,
  },
  buffers: {
    id: "buffers",
    label: "Smart Buffers",
    effect: "Every machine holds 6 more units of input, so short gaps do not halt it.",
    cost: 8,
    requires: "cutters",
    maxRank: 1,
  },
  dispatch: {
    id: "dispatch",
    label: "Route Dispatch",
    effect: "A newly connected link carries 8 more units at once.",
    cost: 12,
    requires: "buffers",
    maxRank: 1,
  },
} as const;

/** Declaration order, which is also the branch order shown in the panel. */
export const RESEARCH_ORDER: readonly string[] = ["cutters", "buffers", "dispatch"];

export interface ResearchBonus {
  /** Extra scrap per manual cutting pulse. */
  readonly pulseScrap: number;
  /** Extra input-buffer units per machine. */
  readonly inputBuffer: number;
  /** Extra capacity for links created after the purchase. */
  readonly routeCapacity: number;
}

/** Integer modifiers implied by the purchased nodes; stable for one state. */
export function researchBonus(s: SimState): ResearchBonus {
  const owned = s.research ?? {};
  return {
    pulseScrap: rankOf(owned, "cutters") > 0 ? 2 : 0,
    inputBuffer: rankOf(owned, "buffers") > 0 ? 6 : 0,
    routeCapacity: rankOf(owned, "dispatch") > 0 ? 8 : 0,
  };
}

function rankOf(owned: Record<string, number>, id: string): number {
  const rank = owned[id];
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? rank : 0;
}

/** Effective input capacity of a machine, matching what the engine enforces. */
export function inputCapacityFor(s: SimState, baseInputBuffer: number): number {
  return baseInputBuffer + researchBonus(s).inputBuffer;
}

/** Next node in the branch that is still purchasable, or null. */
export function nextResearchNode(s: SimState): ResearchDef | null {
  for (const id of RESEARCH_ORDER) {
    const def = RESEARCH[id];
    if (!def) return null;
    if (rankOf(s.research ?? {}, def.id) >= def.maxRank) continue;
    if (def.requires && rankOf(s.research ?? {}, def.requires) <= 0) return null;
    return def;
  }
  return null;
}

/** Actual before/after effect of one research node: the U05 research comparison. */
export interface ResearchComparison {
  readonly node: string;
  /** Data units the purchase spends once. */
  readonly cost: number;
  readonly affordable: boolean;
  readonly prereqMet: boolean;
  readonly alreadyKnown: boolean;
  readonly before: ResearchBonus;
  readonly after: ResearchBonus;
}

/**
 * Reports what buying one node would change, from the same `researchBonus` the
 * engine applies: the three integer quantities before and after exactly this one
 * rank, plus the price and gate status. It selects nothing and spends nothing, so
 * the panel can show a real before/after without a universal auto-choice (U05).
 */
export function researchComparison(s: SimState, node: string): ResearchComparison | null {
  const def = RESEARCH[node];
  if (!def) return null;
  const owned = s.research ?? {};
  const rank = rankOf(owned, def.id);
  const afterState: SimState = { ...s, research: { ...owned, [def.id]: rank + 1 } };
  return {
    node: def.id,
    cost: def.cost,
    affordable: (s.store.data ?? 0) >= def.cost,
    prereqMet: !def.requires || rankOf(owned, def.requires) > 0,
    alreadyKnown: rank >= def.maxRank,
    before: researchBonus(s),
    after: researchBonus(afterState),
  };
}
