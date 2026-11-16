import { BLUEPRINTS, RECIPES, type ResourceId } from "../content/defs";
import { fleetUnits, type SimState } from "./types";

/**
 * Ledger helpers used by invariant tests and future diagnostics.
 * `unitTotal` counts each unit once across every location (spec 8.2).
 */
export function systemTotals(state: SimState): Record<string, number> {
  const totals: Record<string, number> = {};
  const bump = (key: ResourceId, value: number) => {
    totals[key] = (totals[key] ?? 0) + value;
  };
  for (const key of Object.keys(state.store) as ResourceId[]) bump(key, state.store[key] ?? 0);
  for (const item of state.overflow) bump(item.resource, item.qty);
  for (const machine of state.machines) {
    for (const key of Object.keys(machine.inBuf) as ResourceId[]) bump(key, machine.inBuf[key] ?? 0);
    for (const item of machine.tray) bump(item.resource, item.qty);
    for (const item of machine.batch) bump(item.resource, item.qty);
  }
  for (const route of state.routes) {
    for (const item of route.items) bump(item.resource, item.qty);
  }
  for (const unit of fleetUnits(state)) {
    if (unit.inFlight) bump("scrap", unit.inFlight.qty);
  }
  return totals;
}

export function unitTotal(state: SimState): number {
  let total = 0;
  for (const value of Object.values(systemTotals(state))) total += value;
  return total;
}

/** Net unit change contributed by completed batches, for conservation checks. */
export function netRecipeUnits(state: SimState): number {
  let net = 0;
  for (const machine of state.machines) {
    const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
    const inputs = recipe.inputs.reduce((total, item) => total + item.qty, 0);
    const outputs = recipe.outputs.reduce((total, item) => total + item.qty, 0);
    net += (outputs - inputs) * machine.batchesDone;
  }
  return net;
}

/** All internal quantities that must remain safe nonnegative integers. */
export function allQuantities(state: SimState): number[] {
  const values: number[] = [state.tick, state.revision, state.storeUnits, state.storeCapacity, state.credits];
  for (const value of Object.values(state.store)) values.push(value ?? 0);
  for (const item of state.overflow) values.push(item.qty);
  for (const machine of state.machines) {
    values.push(machine.inBufUnits, machine.trayUnits, machine.progress, machine.progressRem);
    for (const value of Object.values(machine.inBuf)) values.push(value ?? 0);
    for (const item of machine.tray) values.push(item.qty);
    for (const item of machine.batch) values.push(item.qty);
  }
  for (const route of state.routes) {
    values.push(route.inFlight);
    for (const item of route.items) values.push(item.qty, item.arrive);
  }
  // Every drone's own counters join the same nonnegative-integer gate (B-28).
  for (const unit of fleetUnits(state)) {
    values.push(unit.accumulated, unit.deliveries, unit.nextDeliveryTick);
    if (unit.inFlight) values.push(unit.inFlight.qty, unit.inFlight.arrive);
  }
  return values;
}
