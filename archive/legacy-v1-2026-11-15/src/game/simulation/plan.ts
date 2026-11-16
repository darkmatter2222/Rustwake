import {
  BLUEPRINTS,
  RECIPES,
  TUNING,
  exportPrice,
  unlockedBlueprints,
  type ResourceId,
} from "../content/defs";
import { planConnections, type ConnectionPlan } from "./autoconnect";
import { droneAddCost, sellableAmount, upgradeCost } from "./commands";
import { nextResearchNode } from "../content/research";
import type { SimState } from "./types";

/**
 * One authoritative "next thing to do" for the yard, shared by the objective
 * card and the dock so the two can never disagree (spec 3.3, 10.5).
 */
export type YardStep =
  | { kind: "connect"; machineId: number; plans: ConnectionPlan[] }
  | { kind: "build"; blueprint: string }
  | { kind: "sell"; resource: ResourceId; qty: number }
  | { kind: "research"; node: string }
  | { kind: "drone" }
  | { kind: "upgrade"; machineId: number }
  | { kind: "salvage" };

/** The step for one selected machine, so card, dock, and panel agree. */
export function stepForMachine(state: SimState, machineId: number): YardStep | null {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine) return null;
  const plans = planConnections(state, machineId);
  if (plans.length > 0) return { kind: "connect", machineId, plans };

  const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
  for (const input of recipe.inputs) {
    if (machine.inBufUnits >= input.qty || (machine.inBuf[input.resource] ?? 0) >= input.qty) {
      continue;
    }
    // Whichever stage is short, the fix belongs to the stage that must supply it.
    if ((state.store[input.resource] ?? 0) >= input.qty) return { kind: "upgrade", machineId };
    const producer = producerId(state, input.resource);
    if (producer !== null) return { kind: "upgrade", machineId: producer };
    const blueprint = firstUnbuiltProducer(state, input.resource);
    if (blueprint) return { kind: "build", blueprint };
    break;
  }
  return { kind: "upgrade", machineId };
}

/** Machine in the yard whose recipe yields the resource, or null. */
function producerId(state: SimState, resource: ResourceId): number | null {
  for (const m of state.machines) {
    const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
    if (recipe.outputs.some((output) => output.resource === resource && output.qty > 0)) {
      return m.id;
    }
  }
  return null;
}

/** First unlocked, unbuilt blueprint whose recipe yields the resource. */
function firstUnbuiltProducer(state: SimState, resource: ResourceId): string | null {
  const unlocked = unlockedBlueprints(state.tutorial);
  for (const id of unlocked) {
    if (state.machines.some((m) => m.blueprint === id)) continue;
    const recipe = RECIPES[BLUEPRINTS[id].recipeId];
    if (recipe.outputs.some((output) => output.resource === resource && output.qty > 0)) return id;
  }
  return null;
}

/** Sell order follows how the yard meets each material. */
export const SELL_ORDER: readonly ResourceId[] = [
  "scrap",
  "ferrous",
  "nonferrous",
  "residue",
  "steel",
  "copper",
  "polymer",
  "wire",
  "plates",
  "circuits",
  "data",
];

export function nextYardStep(state: SimState): YardStep {
  for (const machine of state.machines) {
    const plans = planConnections(state, machine.id);
    if (plans.length > 0) return { kind: "connect", machineId: machine.id, plans };
  }
  const known = unlockedBlueprints(state.tutorial);
  const unbuilt = known.filter((id) => !state.machines.some((m) => m.blueprint === id));
  for (const blueprint of unbuilt) {
    if (affordable(state, blueprint)) return { kind: "build", blueprint };
  }
  // Research data competes with nothing else, so it leads the surplus sells once
  // a node is affordable; both actions stay available afterwards.
  const node = nextResearchNode(state);
  if (node && (state.store.data ?? 0) >= node.cost) return { kind: "research", node: node.id };
  // A spare drone sits between the material steps and the credit sink: it is the
  // only purchase that raises what the wreck hands over, so the store can hold a
  // whole blueprint price instead of hovering at the reserve floor (B-28).
  const fleet = fleetStep(state);
  if (fleet) return fleet;
  const upgrade = affordableUpgrade(state);
  if (upgrade) return upgrade;
  // A sell must never hold back the next machine, so resources that are still
  // short for an unbuilt blueprint wait their turn (spec 10.5).
  const pending = pendingInputs(state, unbuilt);
  for (const resource of SELL_ORDER) {
    if (pending.has(resource)) continue;
    const qty = sellableAmount(state, resource);
    if (qty > 0) return { kind: "sell", resource, qty };
  }
  if (unbuilt.length > 0) return { kind: "build", blueprint: nearestBlueprint(state, unbuilt) };
  for (const resource of SELL_ORDER) {
    const qty = sellableAmount(state, resource);
    if (qty > 0) return { kind: "sell", resource, qty };
  }
  const machine = state.machines[0];
  if (machine) return { kind: "upgrade", machineId: machine.id };
  return { kind: "salvage" };
}

/** Unbuilt blueprint whose inputs are closest to complete, so the goal is near. */
function nearestBlueprint(state: SimState, unbuilt: readonly string[]): string {
  let best = unbuilt[0] ?? "";
  let bestShortfall = Number.POSITIVE_INFINITY;
  for (const id of unbuilt) {
    const def = BLUEPRINTS[id];
    if (!def) continue;
    let shortfall = 0;
    for (const item of def.buildCost) {
      shortfall += Math.max(0, item.qty - (state.store[item.resource] ?? 0));
    }
    if (shortfall < bestShortfall) {
      best = id;
      bestShortfall = shortfall;
    }
  }
  return best;
}

/**
 * The fleet step, offered while the yard still needs a purchase and the credit price
 * is covered. Null when the drone is not flying yet, when the fleet is complete, or
 * when the credits fall short (spec 11.1, B-28).
 */
function fleetStep(state: SimState): YardStep | null {
  if (!state.drone.repaired) return null;
  if (1 + state.spares.length >= TUNING.fleetCap) return null;
  if (state.credits < droneAddCost(state)) return null;
  return { kind: "drone" };
}

/** Resources still short of an unbuilt blueprint's price. */
function pendingInputs(state: SimState, unbuilt: readonly string[]): Set<ResourceId> {
  const pending = new Set<ResourceId>();
  for (const id of unbuilt) {
    const def = BLUEPRINTS[id];
    if (!def) continue;
    for (const item of def.buildCost) {
      if ((state.store[item.resource] ?? 0) < item.qty) pending.add(item.resource);
    }
  }
  return pending;
}

/**
 * Cheapest affordable upgrade: lowest level first, then the busiest machine, so
 * a saturated yard strengthens the stage that is actually the limit.
 */
function affordableUpgrade(state: SimState): YardStep | null {
  let best: { machineId: number; level: number; busy: number } | null = null;
  for (const machine of state.machines) {
    const def = BLUEPRINTS[machine.blueprint];
    if (!def) continue;
    if (state.credits < upgradeCost(def.baseUpgradeCost, machine.level)) continue;
    const busy = machine.busyTicks ?? 0;
    if (
      !best ||
      machine.level < best.level ||
      (machine.level === best.level && busy > best.busy)
    ) {
      best = { machineId: machine.id, level: machine.level, busy };
    }
  }
  return best ? { kind: "upgrade", machineId: best.machineId } : null;
}

/** Credit value of a sell tranche, for a single shared formatting path. */
export function sellValue(resource: ResourceId, qty: number): number {
  return exportPrice(resource) * qty;
}

function affordable(state: SimState, blueprint: string): boolean {
  const def = BLUEPRINTS[blueprint];
  if (!def) return false;
  for (const item of def.buildCost) {
    if ((state.store[item.resource] ?? 0) < item.qty) return false;
  }
  return true;
}
