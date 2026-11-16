/**
 * T21 (#148): exact offline transport settlement (E07, spec 18.1 + 21.4).
 *
 * Equivalent tick batches (`advance`) and the offline event jump (`catchUp` ->
 * `advanceTo`) must produce IDENTICAL ledgers and mission results for 1h / 12h /
 * 18h absences — including the 12h cap, a capacity halt and a clock rollback.
 * Equality is asserted over the WHOLE SimState (store, overflow, every machine
 * counter and rate window, every route item, the fleet, wreck, credits, tutorial
 * and the command ledger), not just totals, and the ReturnReport is cross-checked
 * against the actual pre/post deltas. The idle-jump branch of `advanceTo` (no
 * continuous work) is exercised explicitly, since that is the path where a jump
 * could silently diverge from tickwise measurement.
 *
 * Deterministic integer simulation only; no wall clock, no RNG. Non-vision.
 */
import { describe, expect, it } from "vitest";
import { TICK_MS, TUNING } from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import { catchUp, type ReturnReport } from "../../src/game/simulation/offline";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, fleetDeliveries, type SimState } from "../../src/game/simulation/types";

const T0 = 1_700_000_000_000;
const HOUR_TICKS = 3600 * 10; // 36,000 ticks per hour at 100 ms

let seq = 0;
function send(state: SimState, body: CommandBody) {
  seq += 1;
  const result = applyCommand(state, { ...body, id: `eq148-${seq}` } as Command);
  expect(result.ok).toBe(true);
}

const clone = (s: SimState): SimState => JSON.parse(JSON.stringify(s)) as SimState;

/** The same built yard as tests/simulation/offline.test.ts, under the #214 seed. */
function builtYard(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = state.machines[0];
  send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advance(state, 300);
  return state;
}

/**
 * An idle yard: a sorter with no belts and an unrepaired drone, so there is no
 * continuous work and `advanceTo` must take its idle-JUMP branch (spec 21.4).
 */
function idleYard(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  advance(state, 10);
  return state;
}

function totalBatches(s: SimState): number {
  let total = 0;
  for (const m of s.machines) total += m.batchesDone;
  return total;
}

function positiveGains(pre: SimState, post: SimState): Record<string, number> {
  const totals = (s: SimState): Record<string, number> => {
    const t: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.store)) t[k] = v ?? 0;
    for (const item of s.overflow) t[item.resource] = (t[item.resource] ?? 0) + item.qty;
    return t;
  };
  const before = totals(pre);
  const after = totals(post);
  const gains: Record<string, number> = {};
  for (const key of Object.keys(after)) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (delta > 0) gains[key] = delta;
  }
  return gains;
}

/**
 * Run one absence both ways from identical checkpoints and demand byte-equal
 * ledgers plus a report that matches the measured deltas.
 */
function settleBothWays(
  yard: SimState,
  elapsedMs: number,
): { tickwise: SimState; jumped: SimState; report: ReturnReport; pre: SimState } {
  const pre = clone(yard);
  const tickwise = clone(yard);
  const jumped = clone(yard);
  const elapsedTicks = Math.max(0, Math.floor(elapsedMs / TICK_MS));
  const eligible = Math.min(elapsedTicks, TUNING.offlineCapTicks);

  advance(tickwise, eligible); // equivalent tick batches
  const { report, nextLastSeenMs } = catchUp(jumped, T0, T0 + elapsedMs); // event jump

  // The whole ledger, not just totals: counters, rate windows, cargo, fleet.
  expect(jumped).toEqual(tickwise);
  expect(jumped.tick).toBe(pre.tick + eligible);
  expect(report.awayTicks).toBe(elapsedTicks);
  expect(report.creditedTicks).toBe(eligible);
  expect(report.capped).toBe(elapsedTicks > TUNING.offlineCapTicks);
  expect(nextLastSeenMs).toBe(T0 + elapsedMs);
  // Mission results cross-checked against the actual state deltas.
  expect(report.deliveries).toBe(fleetDeliveries(jumped) - fleetDeliveries(pre));
  expect(report.batchesDone).toBe(totalBatches(jumped) - totalBatches(pre));
  expect(report.creditsGained).toBe(jumped.credits - pre.credits);
  expect(report.gains).toEqual(positiveGains(pre, jumped));
  return { tickwise, jumped, report, pre };
}

describe("E07: tick batches and offline event jumps settle identically (#148)", () => {
  it("1-hour absence: identical ledgers and report", () => {
    settleBothWays(builtYard(), 1 * 3600 * 1000);
  });

  it("12-hour absence: identical ledgers at the cap boundary", () => {
    const { report } = settleBothWays(builtYard(), 12 * 3600 * 1000);
    expect(report.creditedTicks).toBe(TUNING.offlineCapTicks);
    expect(report.capped).toBe(false);
  }, 30_000);

  it("18-hour absence: caps at 12h, identical ledgers, no re-claimed tail", () => {
    const { jumped, report } = settleBothWays(builtYard(), 18 * 3600 * 1000);
    expect(report.awayTicks).toBe(18 * HOUR_TICKS);
    expect(report.creditedTicks).toBe(12 * HOUR_TICKS);
    expect(report.capped).toBe(true);
    // A reload at the same instant cannot claim the discarded 6h again.
    const reload = catchUp(jumped, T0 + 18 * 3600 * 1000, T0 + 18 * 3600 * 1000);
    expect(reload.report.awayTicks).toBe(0);
    expect(reload.report.creditedTicks).toBe(0);
    expect(reload.report.gains).toEqual({});
  }, 30_000);

  it("chunked tick batches equal one batch equal the event jump (1h)", () => {
    const yard = builtYard();
    const chunked = clone(yard);
    const single = clone(yard);
    const jumped = clone(yard);
    const total = HOUR_TICKS;
    const chunk = 7_777; // deliberately not a divisor: boundaries must not matter
    let remaining = total;
    while (remaining > 0) {
      const step = Math.min(chunk, remaining);
      advance(chunked, step);
      remaining -= step;
    }
    advance(single, total);
    catchUp(jumped, T0, T0 + total * TICK_MS);
    expect(chunked).toEqual(single);
    expect(jumped).toEqual(single);
  });

  it("capacity halt: both paths saturate the dock and stall identically (1h + 1h)", () => {
    const yard = builtYard();
    yard.storeCapacity = 30;
    yard.store = { scrap: 25 };
    yard.storeUnits = 25;
    const { jumped, report } = settleBothWays(yard, 1 * 3600 * 1000);
    expect(jumped.storeUnits).toBe(30);
    expect(jumped.storeUnits).toBeLessThanOrEqual(jumped.storeCapacity);
    expect(report.bottleneck).toBe("storage-full");
    const gained = Object.values(report.gains).reduce((t, v) => t + v, 0);
    expect(gained).toBeGreaterThan(0); // the 5 units of free room were filled
    // The halt is clean: with the dock full the drone stalls (room 0) and the
    // belts block (destinationRoom 0), so nothing spills into overflow.
    expect(jumped.overflow).toEqual([]);
    // A second absence on the saturated yard credits no further inflow and the
    // dock stays at capacity — identically on the tick and event paths.
    const second = settleBothWays(jumped, 1 * 3600 * 1000);
    expect(second.jumped.storeUnits).toBe(30);
    expect(second.report.gains).toEqual({});
    expect(second.report.bottleneck).toBe("storage-full");
  });

  it("clock rollback: zero elapsed, zero credit, ledger untouched", () => {
    const yard = builtYard();
    const pre = clone(yard);
    const jumped = clone(yard);
    const { report, nextLastSeenMs } = catchUp(jumped, T0, T0 - 5_000);
    expect(report.awayTicks).toBe(0);
    expect(report.creditedTicks).toBe(0);
    expect(report.capped).toBe(false);
    expect(report.gains).toEqual({});
    expect(report.deliveries).toBe(0);
    expect(report.batchesDone).toBe(0);
    expect(jumped).toEqual(pre);
    // The reference clock still moves to the (earlier) now: no stacked absence.
    expect(nextLastSeenMs).toBe(T0 - 5_000);
  });

  it("idle-jump branch equals 432k tickwise steps (spec 21.4, 12h)", () => {
    const yard = idleYard();
    const { jumped, report } = settleBothWays(yard, 12 * 3600 * 1000);
    // Nothing could produce: the jump only aged the yard, exactly like tickwise.
    expect(report.gains).toEqual({});
    expect(report.deliveries).toBe(0);
    expect(report.batchesDone).toBe(0);
    expect(report.bottleneck).toBe("starved");
    expect(jumped.store).toEqual(yard.store);
    expect(jumped.credits).toBe(yard.credits);
    const m = jumped.machines[0];
    expect(m.ageTicks).toBe(yard.machines[0].ageTicks + TUNING.offlineCapTicks);
    expect(m.starvedTicks).toBe(yard.machines[0].starvedTicks + TUNING.offlineCapTicks);
    expect(m.busyTicks).toBe(yard.machines[0].busyTicks);
    expect(m.fullTicks).toBe(yard.machines[0].fullTicks);
  }, 30_000);
});
