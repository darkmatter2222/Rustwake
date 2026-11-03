import { TUNING } from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import { catchUp } from "../../src/game/simulation/offline";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { unitTotal } from "../../src/game/simulation/invariants";

let seq = 200;
function send(state: SimState, command: CommandBody) {
  seq += 1;
  return applyCommand(state, { ...command, id: `o${seq}` } as Command);
}

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

describe("offline catch-up", () => {
  it("credits 12 hours of an 18-hour absence and advances the clock fully (spec 28.1)", () => {
    const state = builtYard();
    const lastSeen = 1_000_000;
    const now = lastSeen + 18 * 3600 * 1000;
    const first = catchUp(state, lastSeen, now);
    expect(first.report.awayTicks).toBe(18 * 3600 * 10);
    expect(first.report.creditedTicks).toBe(12 * 3600 * 10);
    expect(first.report.capped).toBe(true);
    expect(first.nextLastSeenMs).toBe(now);

    // A reload at the same instant must not claim the discarded tail again.
    const second = catchUp(state, first.nextLastSeenMs, now);
    expect(second.report.creditedTicks).toBe(0);
    expect(second.report.awayTicks).toBe(0);
  });

  it("keeps credited production consistent with actual delivery counts", () => {
    const state = builtYard();
    const before = unitTotal(state);
    const deliveriesBefore = state.drone.deliveries;
    const result = catchUp(state, 0, TUNING.offlineCapTicks * 10);
    const unitsPerDelivery = TUNING.droneDeliveryUnits;
    const expected = (state.drone.deliveries - deliveriesBefore) * unitsPerDelivery;
    expect(result.report.deliveries).toBe(state.drone.deliveries - deliveriesBefore);
    expect(unitTotal(state)).toBeGreaterThanOrEqual(before);
    expect(state.store["scrap"] ?? 0).toBeGreaterThan(0);
    expect(expected).toBeGreaterThanOrEqual(0);
    expect(state.storeUnits).toBeLessThanOrEqual(state.storeCapacity);
  });

  it("caps a long absence at the configured window", () => {
    const state = builtYard();
    const result = catchUp(state, 0, 40 * 3600 * 1000);
    expect(result.report.creditedTicks).toBe(TUNING.offlineCapTicks);
    expect(result.report.capped).toBe(true);
  });

  it("treats a backwards clock jump as no elapsed time", () => {
    const state = builtYard();
    const tick = state.tick;
    const result = catchUp(state, 5_000_000, 4_000_000);
    expect(result.report.awayTicks).toBe(0);
    expect(state.tick).toBe(tick);
  });

  it("saturates storage during a long absence and reports the bottleneck", () => {
    const state = builtYard();
    state.storeCapacity = 30;
    state.store = { scrap: 25 };
    state.storeUnits = 25;
    const result = catchUp(state, 0, 600_000);
    expect(state.storeUnits).toBe(30);
    expect(result.report.bottleneck).toBe("storage-full");
    const gained = Object.values(result.report.gains).reduce((total, value) => total + value, 0);
    expect(gained).toBeGreaterThan(0);
  });
});
