import {
  BLUEPRINTS,
  RECIPES,
  RESOURCES,
  exportPrice,
  type ResourceId,
} from "../../game/content/defs";
import { sellableAmount } from "../../game/simulation/commands";
import type { SimState } from "../../game/simulation/types";

/**
 * UI-RESET-56 (issue #56): the store panel's read-only derivations.
 *
 * Everything here is a pure read of the authoritative `SimState` and the content
 * tables — no mutation, no second economy. The sellable quantity is the engine's
 * own `sellableAmount` (reserve floor + machine input demand + tranche cap), so the
 * preview can never promise a tranche the engine would refuse or clamp.
 */

export type StoreGroup = "raw" | "intermediate" | "finished";

export const GROUP_ORDER: readonly StoreGroup[] = ["raw", "intermediate", "finished"];

/** Content-derived classification: a recipe's outputs are made, its inputs are used. */
const produced = new Set<ResourceId>();
const consumed = new Set<ResourceId>();
for (const recipe of Object.values(RECIPES)) {
  for (const item of recipe.outputs) produced.add(item.resource);
  for (const item of recipe.inputs) consumed.add(item.resource);
}

/** Raw = nothing makes it; finished = nothing uses it; intermediate = both. */
export function groupOf(resource: ResourceId): StoreGroup {
  if (!produced.has(resource)) return "raw";
  if (!consumed.has(resource)) return "finished";
  return "intermediate";
}

/** The group's resources in stable content order, zero stock included. */
export function resourcesInGroup(group: StoreGroup): ResourceId[] {
  return RESOURCES.filter((resource) => groupOf(resource) === group);
}

export interface TradeFace {
  resource: ResourceId;
  held: number;
  sellable: number;
  price: number;
}

/**
 * One trade card per sellable resource, dearest first (stable within a price tier
 * by content order). The order is deliberate: the highest-value recovery leads, so
 * the first sell face a player — or the HUD alert's recovery path — meets is the
 * tranche that frees the most credits per tap. Locked yards get no faces at all.
 */
export function tradeFaces(state: SimState): TradeFace[] {
  if (!state.exportClaimed) return [];
  const faces: TradeFace[] = [];
  for (const resource of RESOURCES) {
    const price = exportPrice(resource);
    const sellable = sellableAmount(state, resource);
    if (price <= 0 || sellable <= 0) continue;
    faces.push({ resource, held: state.store[resource] ?? 0, sellable, price });
  }
  return faces.sort(
    (a, b) =>
      b.price - a.price ||
      RESOURCES.indexOf(a.resource) - RESOURCES.indexOf(b.resource),
  );
}

export interface ResourceCues {
  producers: number;
  consumers: number;
}

/** How many of the yard's own machines make / use one material right now. */
export function cuesFor(state: SimState, resource: ResourceId): ResourceCues {
  let producers = 0;
  let consumers = 0;
  for (const machine of state.machines) {
    const def = BLUEPRINTS[machine.blueprint];
    if (!def) continue;
    const recipe = RECIPES[def.recipeId];
    if (!recipe) continue;
    if (recipe.outputs.some((item) => item.resource === resource)) producers += 1;
    if (recipe.inputs.some((item) => item.resource === resource)) consumers += 1;
  }
  return { producers, consumers };
}

/** One resource's whole-percent share of the store's capacity. */
export function capacityShare(state: SimState, resource: ResourceId): number {
  if (state.storeCapacity <= 0) return 0;
  return Math.round(((state.store[resource] ?? 0) / state.storeCapacity) * 100);
}

export type QtyReason = "ok" | "empty" | "nan" | "low" | "high";

export interface QtySelection {
  /** The quantity a valid selection commits; 0 while the input is unusable. */
  qty: number;
  valid: boolean;
  reason: QtyReason;
}

/**
 * Quantity selection against the engine's sellable ceiling. No override means the
 * full sellable tranche (the default the sell face prints). Anything that is not a
 * whole number in `1..sellable` is invalid: the face disables and says why, and the
 * engine still clamps and dedupes behind it, so a stale tap can never oversell.
 */
export function selectQty(raw: string | undefined, sellable: number): QtySelection {
  if (raw === undefined) {
    return { qty: sellable, valid: sellable > 0, reason: sellable > 0 ? "ok" : "low" };
  }
  const trimmed = raw.trim();
  if (trimmed === "") return { qty: 0, valid: false, reason: "empty" };
  if (!/^\d+$/.test(trimmed)) return { qty: 0, valid: false, reason: "nan" };
  const parsed = Number(trimmed);
  if (parsed < 1) return { qty: 0, valid: false, reason: "low" };
  if (parsed > sellable) return { qty: sellable, valid: false, reason: "high" };
  return { qty: parsed, valid: true, reason: "ok" };
}

export interface StorageCause {
  full: boolean;
  percent: number;
  topHolds: { resource: ResourceId; held: number }[];
  overflowUnits: number;
}

/** Why the store is full, in reads: the fill percent, the largest holds, the overflow. */
export function storageCause(state: SimState): StorageCause {
  const percent =
    state.storeCapacity > 0
      ? Math.round((state.storeUnits / state.storeCapacity) * 100)
      : 0;
  const topHolds = RESOURCES.map((resource) => ({
    resource,
    held: state.store[resource] ?? 0,
  }))
    .filter((hold) => hold.held > 0)
    .sort(
      (a, b) =>
        b.held - a.held ||
        RESOURCES.indexOf(a.resource) - RESOURCES.indexOf(b.resource),
    )
    .slice(0, 3);
  return {
    full: state.storeUnits >= state.storeCapacity,
    percent,
    topHolds,
    overflowUnits: state.overflow.reduce((total, item) => total + item.qty, 0),
  };
}
