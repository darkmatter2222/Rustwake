/**
 * Bottleneck assistant (spec 10.5, 9.4).
 *
 * Reads only counters the simulation measures each tick, so every percentage is
 * an observation of what happened, not a theoretical maximum. One next action
 * per machine; several possible actions are not purchases.
 */
import { BLUEPRINTS, RECIPES, TUNING, type ResourceId } from "../content/defs";
import { routeById } from "./engine";
import type { MachineState, RouteState, SimState } from "./types";

export interface MachineDiagnosis {
  /** Whole percent of measured ticks with a running batch. */
  readonly busyPercent: number;
  /** Whole percent of measured ticks with no usable input. */
  readonly starvedPercent: number;
  /** Whole percent of measured ticks whose tray could not move. */
  readonly fullPercent: number;
  /** Busiest link touching this machine, whole percent busy, or null. */
  readonly linkPercent: number | null;
  /** Yard power speed, whole percent. */
  readonly powerPercent: number;
  readonly evidence: string;
  readonly advice: string;
}

/** Whole percent, always inside 0..100 for finite nonnegative inputs. */
function percent(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  const value = (part / whole) * 100;
  if (value <= 0) return 0;
  return value >= 100 ? 100 : Math.round(value);
}

export function requestedPower(s: SimState): number {
  let requested = 0;
  for (const m of s.machines) if (m.progress > 0) requested += m.batchPower;
  return requested;
}

export function diagnoseMachine(
  s: SimState,
  m: MachineState,
): MachineDiagnosis {
  const age = Math.max(1, m.ageTicks);
  const busyPercent = percent(m.busyTicks, age);
  const starvedPercent = percent(Math.min(m.starvedTicks, age), age);
  const fullPercent = percent(Math.min(m.fullTicks, age), age);
  const linkPercent = busiestLinkPercent(s, m);
  const powerPercent = percent(Math.round(s.powerRatio * 1000), 1000);
  const parts = [
    `Working ${busyPercent}%`,
    `waiting for input ${starvedPercent}%`,
    `output waiting ${fullPercent}%`,
  ];
  if (linkPercent !== null) parts.push(`link ${linkPercent}% busy`);
  return {
    busyPercent,
    starvedPercent,
    fullPercent,
    linkPercent,
    powerPercent,
    evidence: `${parts.join(" · ")} · power ${powerPercent}%`,
    advice: advise(s, m, {
      busyPercent,
      starvedPercent,
      fullPercent,
      linkPercent,
    }),
  };
}

interface Measures {
  readonly busyPercent: number;
  readonly starvedPercent: number;
  readonly fullPercent: number;
  readonly linkPercent: number | null;
}

/** A measured throughput reading: batches per second and the seconds it covers. */
export interface RateReading {
  readonly rate: number;
  readonly windowSeconds: number;
}

/**
 * Recent rate over the defined window (spec 9.4): 60 s once a full window exists,
 * otherwise all available time, so a new machine is not read as a stalled one.
 * Both numbers come from counters the simulation writes, never from a formula.
 */
export function rateReading(m: MachineState): RateReading {
  const span = m.rateAge - m.rateAgePrev;
  if (span > 0) {
    const seconds = span / 10;
    const gained = Math.max(0, m.rateFrom - m.rateFromPrev);
    return { rate: gained / seconds, windowSeconds: seconds };
  }
  const age = Math.max(1, m.ageTicks);
  return { rate: m.batchesDone / (age / 10), windowSeconds: age / 10 };
}

function busiestLinkPercent(s: SimState, m: MachineState): number | null {
  let worst: number | null = null;
  const ids = m.outRoute === null ? m.inRoutes : [...m.inRoutes, m.outRoute];
  for (const id of ids) {
    const route = routeById(s, id);
    if (!route) continue;
    const value = percent(route.busyTicks, Math.max(1, route.ageTicks));
    if (worst === null || value > worst) worst = value;
  }
  return worst;
}

interface Supplier {
  readonly phrase: string;
  readonly fromStore: boolean;
}

/** One next action, from the strongest available piece of evidence. */
function advise(s: SimState, m: MachineState, measured: Measures): string {
  const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
  const first = recipe.inputs[0];
  const inputText = recipe.inputs
    .map((input) => `${input.qty} ${input.resource}`)
    .join(" and ");

  if (s.storeCapacity - s.storeUnits <= 2) {
    return `Storage is full at ${percent(s.storeUnits, s.storeCapacity)}%. Sell a surplus in the yard store to free room.`;
  }
  if (requestedPower(s) > TUNING.yardPowerCapacity) {
    return `Power limited: ${runningMachines(s)} machines want ${requestedPower(
      s,
    )} units against ${TUNING.yardPowerCapacity}, so work runs at ${percent(
      Math.round(s.powerRatio * 1000),
      1000,
    )}% speed. Finish the line before adding another machine.`;
  }
  if (m.inRoutes.length === 0 && m.inBufUnits === 0) {
    const supplier = supplierFor(s, first?.resource);
    if (supplier) {
      return `Needs ${inputText}. Connect ${supplier.phrase} to this machine so its input arrives.`;
    }
    return `Needs ${inputText}, which nothing in the yard makes yet. Build the machine that outputs it, then connect.`;
  }
  if (m.outRoute === null && m.trayUnits > 0) {
    return `Output is waiting: ${m.trayUnits} units in the tray with nowhere to go. Connect this machine to the dock.`;
  }
  if (measured.starvedPercent >= 20) {
    const supplier = supplierFor(s, first?.resource);
    if (supplier === null) {
      return `Waits for input ${measured.starvedPercent}% of the time and nothing in the yard makes that material yet.`;
    }
    if (supplier.fromStore) {
      return `Waits for input ${measured.starvedPercent}% of the time because the dock is empty. One salvage pulse tops it up; no purchase needed.`;
    }
    return `Waits for input ${measured.starvedPercent}% of the time while ${supplier.phrase} is the limiter. Upgrade ${supplier.phrase} first.`;
  }
  if (measured.fullPercent >= 20) {
    return `Its output waits ${measured.fullPercent}% of the time${
      measured.linkPercent === null
        ? ""
        : ` while the link is busy ${measured.linkPercent}%`
    }. Nothing to buy here: the link, not this machine, is the limit.`;
  }
  if (measured.busyPercent >= 85) {
    return `Runs at full speed ${measured.busyPercent}% of the time. Nothing to fix on this machine.`;
  }
  return `Working ${measured.busyPercent}% of the time and waiting ${measured.starvedPercent}% for input. Both are inside normal range for this line.`;
}

function runningMachines(s: SimState): number {
  let count = 0;
  for (const m of s.machines) if (m.progress > 0) count += 1;
  return count;
}

/** Label of whatever holds or makes a resource, or null when the yard has none. */
function supplierFor(
  s: SimState,
  resource: ResourceId | undefined,
): Supplier | null {
  if (!resource) return null;
  if ((s.store[resource] ?? 0) > 0)
    return { phrase: "the dock store", fromStore: true };
  for (const m of s.machines) {
    const recipe = RECIPES[BLUEPRINTS[m.blueprint].recipeId];
    if (recipe.outputs.some((output) => output.resource === resource)) {
      return {
        phrase: BLUEPRINTS[m.blueprint].label.toLowerCase(),
        fromStore: false,
      };
    }
  }
  return null;
}

/** Yard-level evidence lines for a bounded panel; every value is measured. */
export function yardSummary(s: SimState): string[] {
  const lines = [
    `Storage ${percent(s.storeUnits, s.storeCapacity)}% full (${s.storeUnits}/${s.storeCapacity})`,
    `Power ${percent(Math.round(s.powerRatio * 1000), 1000)}% speed (${requestedPower(
      s,
    )} of ${TUNING.yardPowerCapacity} units requested)`,
  ];
  const busiest = busiestRoute(s);
  if (busiest) {
    lines.push(
      `Busiest link ${percent(busiest.busyTicks, Math.max(1, busiest.ageTicks))}% busy (${
        busiest.inFlight
      }/${busiest.capacity} in transit)`,
    );
  }
  let starved = 0;
  for (const m of s.machines) if (m.status === "starved") starved += 1;
  if (starved > 0)
    lines.push(`${starved} machine${starved > 1 ? "s" : ""} waiting for input`);
  return lines;
}

function busiestRoute(s: SimState): RouteState | undefined {
  let busiest: RouteState | undefined;
  let best = -1;
  for (const route of s.routes) {
    const value = percent(route.busyTicks, Math.max(1, route.ageTicks));
    if (value > best) {
      best = value;
      busiest = route;
    }
  }
  return busiest;
}
