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
 * Input: the store when it already holds at least one batch of the material,
 * otherwise the producing machine. Output: the consuming machine when one
 * exists, otherwise the store. One link per material per direction, keyed on
 * this machine's end only. Ambiguity returns the shorter plan rather than
 * guessing.
 */
export function planConnections(
  state: SimState,
  machineId: number,
): ConnectionPlan[] {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine) return [];
  const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
  const plans: ConnectionPlan[] = [];

  // One link per material in each direction. An existing link already carries
  // the material whatever its other endpoint, so the yard never pays for a
  // parallel second path that both routers then leave idle (spec 10.1, B-23).
  for (const input of recipe.inputs) {
    if (hasInputLink(state, machineId, input.resource)) continue;
    // The store pull is window-sized - two ready batches in one tap - so a
    // stocked store keeps an input fuller than a drip-fed producer link. The
    // producer is used while the store still holds less than one batch.
    const stocked = state.store[input.resource] ?? 0;
    if (stocked >= input.qty) {
      plans.push({ from: 0, to: machineId, filter: input.resource });
      continue;
    }
    const producer = findProducer(state, machineId, input.resource);
    if (producer !== null) {
      plans.push({ from: producer, to: machineId, filter: input.resource });
    } else if (stocked > 0) {
      plans.push({ from: 0, to: machineId, filter: input.resource });
    }
  }

  // One link per output material, so a two-output recipe really does need two
  // links and no material gets trapped behind a single-filter connection.
  for (const output of recipe.outputs) {
    if (hasOutputLink(state, machineId, output.resource)) continue;
    const consumer = findConsumer(state, machineId, output.resource);
    plans.push({ from: machineId, to: consumer ?? 0, filter: output.resource });
  }
  return dedupe(plans);
}

/** The material already reaches this machine over some link, from any source. */
function hasInputLink(
  state: SimState,
  machineId: number,
  resource: ResourceId,
): boolean {
  return state.routes.some(
    (route) =>
      route.to.kind === "machine" &&
      route.to.id === machineId &&
      (route.filter === resource || route.filter === null),
  );
}

/** This machine already ships the material over some link, to any destination. */
function hasOutputLink(
  state: SimState,
  machineId: number,
  resource: ResourceId,
): boolean {
  return state.routes.some(
    (route) =>
      route.from.kind === "machine" &&
      route.from.id === machineId &&
      (route.filter === resource || route.filter === null),
  );
}

function findProducer(
  state: SimState,
  exceptId: number,
  resource: ResourceId,
): number | null {
  let found: number | null = null;
  for (const candidate of state.machines) {
    if (candidate.id === exceptId) continue;
    const recipe = RECIPES[BLUEPRINTS[candidate.blueprint].recipeId];
    if (
      recipe.outputs.some((item) => item.resource === resource && item.qty > 0)
    ) {
      if (found !== null) return found; // ambiguous: keep the first stable id
      found = candidate.id;
    }
  }
  return found;
}

function findConsumer(
  state: SimState,
  exceptId: number,
  resource: ResourceId,
): number | null {
  let found: number | null = null;
  for (const candidate of state.machines) {
    if (candidate.id === exceptId) continue;
    const theirs = RECIPES[BLUEPRINTS[candidate.blueprint].recipeId];
    if (theirs.inputs.some((item) => item.resource === resource)) {
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
