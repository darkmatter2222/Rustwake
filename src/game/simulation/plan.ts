import {
  BLUEPRINTS,
  exportPrice,
  unlockedBlueprints,
  type ResourceId,
} from "../content/defs";
import { planConnections, type ConnectionPlan } from "./autoconnect";
import { sellableAmount } from "./commands";
import type { SimState } from "./types";

/**
 * One authoritative "next thing to do" for the yard, shared by the objective
 * card and the dock so the two can never disagree (spec 3.3, 10.5).
 */
export type YardStep =
  | { kind: "connect"; machineId: number; plans: ConnectionPlan[] }
  | { kind: "build"; blueprint: string }
  | { kind: "sell"; resource: ResourceId; qty: number }
  | { kind: "upgrade"; machineId: number }
  | { kind: "salvage" };

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
  for (const resource of SELL_ORDER) {
    const qty = sellableAmount(state, resource);
    if (qty > 0) return { kind: "sell", resource, qty };
  }
  if (unbuilt.length > 0) return { kind: "build", blueprint: unbuilt[0] };
  const machine = state.machines[0];
  if (machine) return { kind: "upgrade", machineId: machine.id };
  return { kind: "salvage" };
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
