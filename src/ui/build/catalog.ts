/**
 * UI-RESET-52: the catalog's pure reads. Everything here is a derivation of the
 * authoritative content tables and the SimState the store publishes — no new
 * progression, no second unlock rule. `unlockedBlueprints` (the same function
 * the dock and the rail already read) owns the gate; the categories below are
 * display grouping only, so a locked machine still shows its real requirement.
 */
import {
  BLUEPRINTS,
  RECIPES,
  TICKS_PER_SECOND,
  unlockedBlueprints,
  type BlueprintDef,
  type ResourceId,
} from "../../game/content/defs";
import { formatSeconds, resourceWord, t } from "../../game/content/strings";
import type { SimState } from "../../game/simulation/types";
import { COPY, FUNCTIONS } from "./copy";

export interface CatalogCategory {
  readonly id: string;
  readonly label: string;
  readonly blueprints: readonly string[];
}

/**
 * The eight shipped machines grouped by what their recipe does to the cargo:
 * separation splits a bulk stream, refining reshapes one material, assembly
 * combines streams into a higher good. The grouping never gates a purchase —
 * each card keeps its own `unlockAt` and its own price.
 */
export const CATEGORIES: readonly CatalogCategory[] = [
  {
    id: "separation",
    label: COPY.separation,
    blueprints: ["sorter", "copperSeparator", "polymerRecycler"],
  },
  {
    id: "refining",
    label: COPY.refining,
    blueprints: ["furnace", "wireMill", "platePress"],
  },
  {
    id: "assembly",
    label: COPY.assembly,
    blueprints: ["circuitAssembler", "signalLab"],
  },
];

/** Every blueprint the tables carry, in category order (the mature catalog). */
export const CATALOG_ORDER: readonly string[] = CATEGORIES.flatMap((c) => c.blueprints);

/** The one gate, read from the same function the dock reads. */
export function isUnlocked(id: string, tutorial: number): boolean {
  return unlockedBlueprints(tutorial).includes(id);
}

/** The existing requirement, printed verbatim — no invented progression. */
export function lockLine(def: BlueprintDef): string {
  return `Unlocks at step ${def.unlockAt}`;
}

export function functionLine(id: string): string {
  return FUNCTIONS[id] ?? "";
}

export interface CatalogShortfall {
  readonly resource: ResourceId;
  readonly need: number;
  readonly have: number;
}

/** Every cost entry the yard cannot pay yet, with the store's own two numbers. */
export function shortfalls(def: BlueprintDef, state: SimState): CatalogShortfall[] {
  const short: CatalogShortfall[] = [];
  for (const item of def.buildCost) {
    const have = state.store[item.resource] ?? 0;
    if (have < item.qty) short.push({ resource: item.resource, need: item.qty, have });
  }
  return short;
}

/** The shortfall sentence the dock and the toast already speak. */
export function shortfallLine(item: CatalogShortfall): string {
  return t("reject.shortfall", {
    need: item.need,
    word: resourceWord(item.resource),
    have: item.have,
  });
}

export interface RecipeReadout {
  readonly inputs: string;
  readonly outputs: string;
  readonly power: string;
  readonly time: string;
}

function stackLine(stacks: readonly { resource: ResourceId; qty: number }[]): string {
  return stacks
    .map((item) => t("value.recipeItem", { qty: item.qty, label: resourceWord(item.resource) }))
    .join(" + ");
}

/** Inputs, outputs, power and cycle time straight off the recipe table. */
export function recipeReadout(def: BlueprintDef): RecipeReadout {
  const recipe = RECIPES[def.recipeId];
  if (!recipe) return { inputs: "", outputs: "", power: "", time: "" };
  return {
    inputs: stackLine(recipe.inputs),
    outputs: stackLine(recipe.outputs),
    power: String(recipe.power),
    time: `${formatSeconds(recipe.cycleTicks / TICKS_PER_SECOND)} s`,
  };
}

/** The catalog's card order for one yard: every machine, locked ones included. */
export function catalogCards(tutorial: number): { id: string; def: BlueprintDef; unlocked: boolean }[] {
  return CATALOG_ORDER.map((id) => ({
    id,
    def: BLUEPRINTS[id],
    unlocked: isUnlocked(id, tutorial),
  }));
}
