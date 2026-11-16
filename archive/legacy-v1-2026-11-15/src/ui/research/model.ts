/**
 * UI-RESET-58 (issue #58): the research surface's pure state derivation.
 *
 * No React, no dispatch, no mutation. Every answer here is read from the same
 * read-only tables the engine buys from (`content/research.ts`) and the same
 * validation order `buyResearch` enforces in `simulation/commands.ts`:
 * not-found -> already-known -> prereq -> insufficient. The panel paints what
 * this module derives, so the printed reason and the engine's reject can never
 * disagree.
 *
 * Four player-facing states over the existing data (no new progression system):
 * - `completed`  rank >= maxRank; the effect is already live in the yard.
 * - `locked`     the prerequisite node is not owned yet.
 * - `available`  prerequisite owned and the Data balance covers the cost.
 * - `unlocked`   prerequisite owned but the Data balance is short; the node is
 *                open and the exact shortfall is printed.
 *
 * The legacy three-way `data-state` contract (known / locked / open) is kept
 * alongside as `legacyState` because the existing read-only UI tests assert it;
 * `available` and `unlocked` both map to the legacy `open`.
 */

import { BLUEPRINTS, RECIPES, TUNING } from "../../game/content/defs";
import {
  RESEARCH,
  RESEARCH_ORDER,
  researchBonus,
  type ResearchDef,
} from "../../game/content/research";
import type { SimState } from "../../game/simulation/types";

export type ResearchState = "completed" | "locked" | "available" | "unlocked";
export type LegacyNodeState = "known" | "locked" | "open";

export interface PrereqView {
  readonly def: ResearchDef;
  readonly owned: boolean;
}

export interface ResearchNodeView {
  readonly def: ResearchDef;
  readonly rank: number;
  readonly state: ResearchState;
  /** The pre-#58 three-way attribute the existing tests read. */
  readonly legacyState: LegacyNodeState;
  readonly prereq: PrereqView | null;
  readonly cost: number;
  /** The Data balance this decision is made against. */
  readonly have: number;
  /** Units still needed; 0 once affordable or completed. */
  readonly shortfall: number;
  /** True only for `available`: the one state a buy tap can succeed in. */
  readonly canBuy: boolean;
}

export interface ResearchView {
  readonly data: number;
  readonly nodes: readonly ResearchNodeView[];
  readonly completed: number;
  readonly total: number;
  /** First not-completed node in branch order, affordable or not. */
  readonly next: ResearchNodeView | null;
  readonly allDone: boolean;
}

function rankOf(state: SimState, id: string): number {
  const rank = state.research?.[id];
  return typeof rank === "number" && Number.isFinite(rank) && rank > 0 ? rank : 0;
}

/** Derive every card's state from one sim snapshot, in branch order. */
export function deriveResearch(state: SimState): ResearchView {
  const data = state.store?.data ?? 0;
  const nodes: ResearchNodeView[] = [];
  for (const id of RESEARCH_ORDER) {
    const def = RESEARCH[id];
    if (!def) continue;
    const rank = rankOf(state, def.id);
    const prereqDef = def.requires ? RESEARCH[def.requires] : undefined;
    const prereq: PrereqView | null = prereqDef
      ? { def: prereqDef, owned: rankOf(state, prereqDef.id) > 0 }
      : null;
    // Same order as buyResearch: rank ceiling, then prereq, then the purse.
    const completed = rank >= def.maxRank;
    const locked = !completed && prereq !== null && !prereq.owned;
    const affordable = data >= def.cost;
    const nodeState: ResearchState = completed
      ? "completed"
      : locked
        ? "locked"
        : affordable
          ? "available"
          : "unlocked";
    nodes.push({
      def,
      rank,
      state: nodeState,
      legacyState: completed ? "known" : locked ? "locked" : "open",
      prereq,
      cost: def.cost,
      have: data,
      shortfall: completed || affordable ? 0 : Math.max(0, def.cost - data),
      canBuy: nodeState === "available",
    });
  }
  const completed = nodes.filter((n) => n.state === "completed").length;
  const next = nodes.find((n) => n.state !== "completed") ?? null;
  return {
    data,
    nodes,
    completed,
    total: nodes.length,
    next,
    allDone: nodes.length > 0 && completed === nodes.length,
  };
}

/* ------------------------------------------------------------------------- *
 * Focus: where the next (or just-bought) node lands in the yard.
 *
 * The mount contract gives the panel no camera/focus command, so "focus the
 * relevant machine/resource" is answered inside the panel: a live readout of
 * the exact quantity the node changes, now and after purchase. The "after"
 * numbers come from `researchBonus` evaluated on a hypothetical ownership
 * snapshot (a fresh object; the live state is never touched), so they are the
 * engine's own modifiers, not fitted literals.
 * ------------------------------------------------------------------------- */

export interface FocusRow {
  readonly label: string;
  readonly value: string;
}

export interface FocusView {
  /** The node the readout is about; null when the whole path is complete. */
  readonly nodeId: string | null;
  readonly rows: readonly FocusRow[];
}

/** Ownership snapshot with one node hypothetically bought; never mutates `state`. */
function withNode(state: SimState, id: string): SimState {
  const def = RESEARCH[id];
  return {
    ...state,
    research: { ...(state.research ?? {}), [id]: def ? def.maxRank : 1 },
  };
}

function arrow(now: number, after: number, word: string): string {
  return `${now} ${word} -> ${after} ${word}`;
}

/**
 * Live now -> after rows for one node. `completedId` lets the panel keep the
 * readout on the node that was just bought (its effect is already applied, so
 * both columns agree) instead of jumping to the next card mid-tap.
 */
export function focusFor(state: SimState, nodeId: string | null): FocusView {
  if (!nodeId || !RESEARCH[nodeId]) return { nodeId: null, rows: [] };
  const after = withNode(state, nodeId);
  const nowBonus = researchBonus(state);
  const afterBonus = researchBonus(after);
  const rows: FocusRow[] = [];
  if (nodeId === "cutters") {
    const now = TUNING.manualSalvagePerPulse + nowBonus.pulseScrap;
    const next = TUNING.manualSalvagePerPulse + afterBonus.pulseScrap;
    rows.push({ label: "Cutting pulse at the wreck", value: arrow(now, next, "scrap") });
  } else if (nodeId === "buffers") {
    // Name the machines the bonus actually lands on, up to three, then a count.
    const named = state.machines.slice(0, 3);
    for (const machine of named) {
      const def = BLUEPRINTS[machine.blueprint];
      if (!def) continue;
      const now = def.inputBuffer + nowBonus.inputBuffer;
      const next = def.inputBuffer + afterBonus.inputBuffer;
      rows.push({
        label: `${def.label} #${machine.tile} input`,
        value: arrow(now, next, "units"),
      });
    }
    const rest = state.machines.length - named.length;
    if (rest > 0) rows.push({ label: "Other machines", value: `+${rest} more, same bonus` });
    if (state.machines.length === 0) {
      rows.push({ label: "Machines in yard", value: "0 — applies to every machine you build" });
    }
    rows.push({
      label: "Input buffer bonus",
      value: `+${afterBonus.inputBuffer - nowBonus.inputBuffer} units per machine`,
    });
  } else if (nodeId === "dispatch") {
    const now = TUNING.routeCapacity + nowBonus.routeCapacity;
    const next = TUNING.routeCapacity + afterBonus.routeCapacity;
    rows.push({ label: "Newly connected link", value: arrow(now, next, "units") });
    rows.push({
      label: "Links already in the yard",
      value: `${state.routes.length} — keep their saved capacity`,
    });
  }
  return { nodeId, rows };
}

/** The one readout shown when every node is owned: the live effective numbers. */
export function completedFocus(state: SimState): FocusView {
  const bonus = researchBonus(state);
  return {
    nodeId: null,
    rows: [
      {
        label: "Cutting pulse at the wreck",
        value: `${TUNING.manualSalvagePerPulse + bonus.pulseScrap} scrap`,
      },
      { label: "Input buffer bonus", value: `+${bonus.inputBuffer} units per machine` },
      {
        label: "Newly connected link",
        value: `${TUNING.routeCapacity + bonus.routeCapacity} units`,
      },
    ],
  };
}

/**
 * Where Data comes from, read from the content tables (the Signal lab's recipe
 * is the only Data source). Used for the no-data state so the panel answers
 * "how do I earn this?" without inventing content.
 */
export function dataSourceNote(): {
  machine: string;
  perCycle: number;
  seconds: number;
  input: { qty: number; resource: string } | null;
} | null {
  const def = BLUEPRINTS.signalLab;
  if (!def) return null;
  const recipe = RECIPES[def.recipeId];
  if (!recipe) return null;
  const out = recipe.outputs.find((item) => item.resource === "data");
  if (!out) return null;
  const input = recipe.inputs[0];
  return {
    machine: def.label,
    perCycle: out.qty,
    seconds: Math.round(recipe.cycleTicks / 10),
    // Keep qty and resource id separate: the copy layer resolves the id through
    // resourceWord, and a pre-joined string would leak an unresolved res.* key.
    input: input ? { qty: input.qty, resource: input.resource } : null,
  };
}