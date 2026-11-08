import { describe, expect, it } from "vitest";
import { TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { advance, advanceTo } from "../../src/game/simulation/engine";
import { rateReading } from "../../src/game/simulation/diagnostics";
import { migrate, type SavePayload } from "../../src/game/persistence/save";
import {
  createInitialState,
  type MachineState,
  type SimState,
} from "../../src/game/simulation/types";

let seq = 400;
function send(state: SimState, command: CommandBody, id?: string) {
  const key = id ?? `w${(seq += 1)}`;
  return applyCommand(state, { ...command, id: key } as Command);
}

/** One sorter fed from the dock, with its outputs shipped back to the dock.
 * BELT-001: the seed moved 40 -> 45 because the three laid belts now pay 1 scrap
 * per tile of their run out of the same store (9 scrap in all), and the reserve
 * floor leaves the sorter's own batches inside what the purse can still pull. */
function yard(scrap: number): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = scrap;
  state.storeUnits = scrap;
  send(state, { type: "machine.build", blueprint: "sorter", tile: 0 });
  const machine = state.machines[0];
  send(state, {
    type: "route.connect",
    from: 0,
    to: machine.id,
    filter: "scrap",
  });
  send(state, {
    type: "route.connect",
    from: machine.id,
    to: 0,
    filter: "ferrous",
  });
  send(state, {
    type: "route.connect",
    from: machine.id,
    to: 0,
    filter: "nonferrous",
  });
  return state;
}

function sorter(state: SimState): MachineState {
  const machine = state.machines.find((m) => m.blueprint === "sorter");
  if (!machine) throw new Error("missing sorter");
  return machine;
}

describe("measured rate window (spec 9.4, B-17)", () => {
  it("uses all available time while the machine is younger than one window", () => {
    const state = yard(45);
    advance(state, 300); // 30 s
    const machine = sorter(state);
    const reading = rateReading(machine);
    expect(machine.batchesDone).toBeGreaterThan(0);
    expect(reading.windowSeconds).toBe(30);
    expect(reading.rate).toBeCloseTo(machine.batchesDone / 30, 10);
    // The sample pair stays unrolling, so the pair is still the zero mark.
    expect(machine.rateAge).toBe(0);
    expect(machine.rateAgePrev).toBe(0);
  });

  it("switches to the fixed 60 s window once one window is complete", () => {
    const state = yard(45);
    advance(state, 601);
    const machine = sorter(state);
    const reading = rateReading(machine);
    expect(machine.rateAge).toBe(TUNING.rateWindowTicks);
    expect(machine.rateAge - machine.rateAgePrev).toBe(TUNING.rateWindowTicks);
    expect(reading.windowSeconds).toBe(60);
    expect(reading.rate).toBeCloseTo(machine.rateFrom / 60, 10);
    // Inside the first window the whole batch count is the window's count.
    expect(machine.rateFrom).toBe(machine.batchesDone);
  });

  it("reads the recent window, not the lifetime average, after the line stops", () => {
    const state = yard(45); // ~15 batches, then the reserve floor starves it
    advance(state, 1800);
    const machine = sorter(state);
    const reading = rateReading(machine);
    const lifetime = machine.batchesDone / (machine.ageTicks / 10);
    expect(machine.batchesDone).toBeGreaterThan(0);
    expect(reading.rate).toBe(0); // nothing completed in the last minute
    expect(lifetime).toBeGreaterThan(0);
    expect(reading.rate).toBeLessThan(lifetime);
  });

  it("keeps the same samples under tick-by-tick and event-jump advance", () => {
    const ticking = yard(45);
    const jumping = yard(45);
    advance(ticking, 1200);
    advanceTo(jumping, jumping.tick + 1200);
    expect(JSON.stringify(jumping.machines)).toBe(
      JSON.stringify(ticking.machines),
    );
    expect(rateReading(sorter(jumping))).toEqual(rateReading(sorter(ticking)));
  });

  it("loads a save written before the window existed as a finite reading", () => {
    const built = yard(45);
    advance(built, 900);
    const machine = sorter(built);
    const plain = JSON.parse(JSON.stringify(machine)) as Record<
      string,
      unknown
    >;
    delete plain.rateAge;
    delete plain.rateFrom;
    delete plain.rateAgePrev;
    delete plain.rateFromPrev;
    const payload = {
      ...createInitialState(),
      tick: built.tick,
      machines: [plain as unknown as MachineState],
    } as unknown as SimState;
    const migrated = migrate({
      sim: payload,
      lastSeenMs: 1,
      settings: {},
    } as SavePayload);
    const restored = migrated.sim.machines[0];
    expect(restored.rateAge).toBe(0);
    expect(restored.rateFromPrev).toBe(0);
    // A missing pair means the window restarts, so the panel still prints a number.
    expect(Number.isFinite(rateReading(restored).rate)).toBe(true);
    expect(rateReading(restored).rate).toBe(
      machine.batchesDone / (machine.ageTicks / 10),
    );
  });
});
