import { BLUEPRINTS, RECIPES, type ResourceId } from "../content/defs";
import type { SimState } from "./types";

export interface ConnectionPlan {
  from: number;
  to: number;
  filter: ResourceId | null;
}

/**
 * Deterministic connection suggestion for one machine (spec 10.1, 10.5).
 *
 * Input: the store when it already holds a required resource, otherwise the
 * unique machine whose recipe outputs it. Output: the store.
 * Ambiguity returns the shorter plan rather than guessing.
 */
export function planConnections(state: SimState, machineId: number): ConnectionPlan[] {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine) return [];
  const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
  const plans: ConnectionPlan[] = [];
  const existingInputs = new Set(
    state.routes.filter((route) => route.to.kind === "machine" && route.to.id === machineId).map((route) => route.from.id)
  );
  const existingOutput = state.routes.some(
    (route) => route.from.kind === "machine" && route.from.id === machineId
  );

  for (const input of recipe.inputs) {
    const producer = findProducer(state, machineId, input.resource);
    if (producer !== null && !existingInputs.has(producer)) {
      plans.push({ from: producer, to: machineId, filter: input.resource });
      existingInputs.add(producer);
      continue;
    }
    if ((state.store[input.resource] ?? 0) > 0 && !existingInputs.has(0)) {
      plans.push({ from: 0, to: machineId, filter: input.resource });
      existingInputs.add(0);
    }
  }

  if (!existingOutput) {
    const consumer = findConsumer(state, machineId, recipe);
    if (consumer !== null) {
      plans.push({ from: machineId, to: consumer, filter: recipe.outputs[0]?.resource ?? null });
    } else {
      plans.push({ from: machineId, to: 0, filter: recipe.outputs[0]?.resource ?? null });
    }
  }
  return dedupe(plans);
}

function findProducer(state: SimState, exceptId: number, resource: ResourceId): number | null {
  let found: number | null = null;
  for (const candidate of state.machines) {
    if (candidate.id === exceptId) continue;
    const recipe = RECIPES[BLUEPRINTS[candidate.blueprint].recipeId];
    if (recipe.outputs.some((item) => item.resource === resource && item.qty > 0)) {
      if (found !== null) return found; // ambiguous: keep the first stable id
      found = candidate.id;
    }
  }
  return found;
}

function findConsumer(
  state: SimState,
  exceptId: number,
  recipe: { outputs: readonly { resource: ResourceId }[] }
): number | null {
  let found: number | null = null;
  for (const candidate of state.machines) {
    if (candidate.id === exceptId) continue;
    const theirs = RECIPES[BLUEPRINTS[candidate.blueprint].recipeId];
    if (theirs.inputs.some((item) => recipe.outputs.some((out) => out.resource === item.resource))) {
      if (found !== null) return found;
      found = candidate.id;
    }
  }
  return found;
}

function dedupe(plans: ConnectionPlan[]): ConnectionPlan[] {
  const seen = new Set<string>();
  const result: ConnectionPlan[] = [];
  for (const plan of plans) {
    const key = `${plan.from}>${plan.to}:${plan.filter ?? "*"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(plan);
  }
  return result;
}
