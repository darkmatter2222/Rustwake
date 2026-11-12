/**
 * UI-RESET-59 (G3): the logistics read model. Pure functions only — no React, no dispatch,
 * no mutation. Every number is derived from the authoritative sim state through the same
 * exported helpers the engine and command faces use (`requestedPower`, `rateReading`,
 * `beltRun`, `beltCost`, `refundOf`, `outputRouteIds`), so a printed preview cannot drift
 * from what a tap actually charges or returns.
 *
 * `previewConnect` mirrors `connectRoute`'s validation order exactly (cycle, not-found,
 * duplicate, reverse-cycle, affordability) and prices the run with the engine's `beltRun`;
 * `previewRemove` mirrors `dropRoute`'s refund and cargo return. The panel renders these;
 * the tests assert them without a DOM.
 */
import { BLUEPRINTS, RECIPES, TUNING, type ResourceId } from "../../game/content/defs";
import {
  outputRouteIds,
  type RouteState,
  type SimState,
} from "../../game/simulation/types";
import { rateReading, requestedPower } from "../../game/simulation/diagnostics";
import { beltCost, beltRun, refundOf } from "../../game/simulation/commands";
import { RESOURCE_LABEL } from "../text";
import { formatNumber, formatRate, resourceWord, wholePercent } from "../../game/content/strings";

/** Presentation classification of one belt, derived from state (never stored). */
export type RouteStatus = "working" | "idle" | "blocked";

/**
 * Working = cargo in transit and able to deliver; blocked = the belt is saturated or its
 * destination cannot accept (a full tray, or a full store); idle = everything else. This
 * is the same working/idle/blocked distinction the legend and the canvas share.
 */
export function routeStatus(state: SimState, route: RouteState): RouteStatus {
  const saturated = route.inFlight >= route.capacity;
  let destinationBlocked = false;
  if (route.to.kind === "machine") {
    const dest = state.machines.find((m) => m.id === route.to.id);
    if (dest !== undefined && dest.status === "outputFull") destinationBlocked = true;
  } else {
    destinationBlocked = state.storeUnits >= state.storeCapacity;
  }
  if (saturated || destinationBlocked) return "blocked";
  if (route.items.length > 0) return "working";
  return "idle";
}

export type BottleneckKind = "starved" | "outputFull" | "power" | "transport";

export interface LogisticsBottleneck {
  readonly machineId: number;
  readonly label: string;
  readonly kind: BottleneckKind;
  /** A belt touching the affected machine, revealed on the canvas by "Show route". */
  readonly routeId: number | null;
  readonly detail: string;
}

export interface LogisticsModel {
  readonly power: {
    readonly requested: number;
    readonly capacity: number;
    readonly ratio: number;
    readonly limited: boolean;
  };
  readonly production: {
    readonly total: number;
    readonly running: number;
    readonly starved: number;
    readonly outputFull: number;
    readonly idle: number;
    readonly batchesPerSec: number;
  };
  readonly routes: {
    readonly total: number;
    readonly working: number;
    readonly idle: number;
    readonly blocked: number;
  };
  readonly bottlenecks: readonly LogisticsBottleneck[];
}

function firstInputRoute(state: SimState, machineId: number): number | null {
  const route = state.routes.find((r) => r.to.kind === "machine" && r.to.id === machineId);
  return route ? route.id : null;
}

function firstOutputRoute(state: SimState, machineId: number): number | null {
  const ids = outputRouteIds(state, machineId);
  return ids.length > 0 ? ids[0] : null;
}

function anyTouchingRoute(state: SimState, machineId: number): number | null {
  const route = state.routes.find((r) => r.from.id === machineId || r.to.id === machineId);
  return route ? route.id : null;
}

/** The yard production/power overview plus one entry per measured bottleneck. */
export function deriveLogistics(state: SimState): LogisticsModel {
  const requested = requestedPower(state);
  const capacity = TUNING.yardPowerCapacity;
  const ratio = state.powerRatio;

  let running = 0;
  let starved = 0;
  let outputFull = 0;
  let idle = 0;
  let batchesPerSec = 0;
  const bottlenecks: LogisticsBottleneck[] = [];

  for (const machine of state.machines) {
    const def = BLUEPRINTS[machine.blueprint];
    const recipe = RECIPES[def.recipeId];
    batchesPerSec += rateReading(machine).rate;
    if (machine.status === "running") running += 1;
    else if (machine.status === "starved") starved += 1;
    else if (machine.status === "outputFull") outputFull += 1;
    else idle += 1;

    const label = def.label;
    if (machine.status === "starved") {
      const first = recipe.inputs[0];
      bottlenecks.push({
        machineId: machine.id,
        label,
        kind: "starved",
        routeId: firstInputRoute(state, machine.id),
        detail: first
          ? `Missing input — waiting on ${resourceWord(first.resource)}.`
          : "Missing input — the buffer is short.",
      });
    } else if (machine.status === "outputFull") {
      bottlenecks.push({
        machineId: machine.id,
        label,
        kind: "outputFull",
        routeId: firstOutputRoute(state, machine.id),
        detail: `Output full — ${formatNumber(machine.trayUnits)}/${def.outputBuffer} in the tray.`,
      });
    } else if (machine.status === "powerLimited") {
      bottlenecks.push({
        machineId: machine.id,
        label,
        kind: "power",
        routeId: anyTouchingRoute(state, machine.id),
        detail: `Power limited — running at ${wholePercent(ratio)}% speed.`,
      });
    } else {
      const outIds = outputRouteIds(state, machine.id);
      let busiest: RouteState | undefined;
      let best = -1;
      for (const id of outIds) {
        const route = state.routes.find((r) => r.id === id);
        if (!route) continue;
        const value = wholePercent(route.busyTicks / Math.max(1, route.ageTicks));
        if (value > best) {
          best = value;
          busiest = route;
        }
      }
      if (busiest !== undefined && best >= 85) {
        bottlenecks.push({
          machineId: machine.id,
          label,
          kind: "transport",
          routeId: busiest.id,
          detail: `Transport limit — an output belt is ${best}% busy.`,
        });
      }
    }
  }

  let working = 0;
  let idleRoutes = 0;
  let blocked = 0;
  for (const route of state.routes) {
    const status = routeStatus(state, route);
    if (status === "working") working += 1;
    else if (status === "blocked") blocked += 1;
    else idleRoutes += 1;
  }

  return {
    power: { requested, capacity, ratio, limited: requested > capacity },
    production: {
      total: state.machines.length,
      running,
      starved,
      outputFull,
      idle,
      batchesPerSec,
    },
    routes: { total: state.routes.length, working, idle: idleRoutes, blocked },
    bottlenecks,
  };
}

export type ConnectReject = "cycle" | "not-found" | "duplicate" | "insufficient";

export interface ConnectPreview {
  readonly ok: boolean;
  readonly reason: ConnectReject | null;
  readonly tiles: number;
  readonly cost: number;
}

/** Mirrors `connectRoute` validation; prices the run with the engine's own `beltRun`. */
export function previewConnect(
  state: SimState,
  from: number,
  to: number,
  filter: ResourceId | null,
): ConnectPreview {
  const tiles = beltRun(state, from, to).length;
  const cost = beltCost(tiles);
  const fail = (reason: ConnectReject): ConnectPreview => ({ ok: false, reason, tiles, cost });
  if (from === to) return fail("cycle");
  if (to !== 0 && !state.machines.some((m) => m.id === to)) return fail("not-found");
  if (from !== 0 && !state.machines.some((m) => m.id === from)) return fail("not-found");
  for (const route of state.routes) {
    if (route.from.id === from && route.to.id === to && route.filter === filter) {
      return fail("duplicate");
    }
    if (from !== 0 && to !== 0 && route.from.id === to && route.to.id === from) {
      return fail("cycle");
    }
  }
  if ((state.store.scrap ?? 0) < cost) return fail("insufficient");
  return { ok: true, reason: null, tiles, cost };
}

export interface RemovePreview {
  readonly ok: boolean;
  readonly refund: number;
  readonly cargo: number;
}

/** Mirrors `dropRoute`: the priced belt refund plus any in-flight cargo returned. */
export function previewRemove(state: SimState, routeId: number): RemovePreview {
  const route = state.routes.find((r) => r.id === routeId);
  if (route === undefined) return { ok: false, refund: 0, cargo: 0 };
  return {
    ok: true,
    refund: refundOf(beltCost(route.run?.length ?? 0)),
    cargo: route.items.reduce((sum, item) => sum + item.qty, 0),
  };
}

/** The material name a route carries, for the route list and previews. */
export function cargoName(filter: ResourceId | null): string {
  return filter === null ? "any cargo" : (RESOURCE_LABEL[filter] ?? filter).toLocaleLowerCase();
}

/** A short throughput line for the overview, from the measured rate. */
export function throughputLine(model: LogisticsModel): string {
  return `${formatRate(model.production.batchesPerSec)} batches/s across ${model.production.total} ${
    model.production.total === 1 ? "machine" : "machines"
  }`;
}
