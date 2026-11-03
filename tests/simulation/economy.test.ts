import { describe, expect, it } from "vitest";
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
import { advance, advanceTo } from "../../src/game/simulation/engine";
import { applyCommand, upgradeCost, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";

import { systemTotals } from "../../src/game/simulation/invariants";

let seq = 0;
function send(state: SimState, command: CommandBody, id = `c${++seq}`) {
  return applyCommand(state, { ...command, id } as Command);
}

export function tutorialToExport(): SimState {
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
  advance(state, 400);
  send(state, { type: "machine.build", blueprint: "furnace", tile: 9 });
  const furnace = state.machines[1];
  send(state, { type: "route.connect", from: sorter.id, to: furnace.id, filter: "ferrous" });
  send(state, { type: "route.connect", from: furnace.id, to: 0, filter: "steel" });
  advance(state, 900);
  send(state, { type: "contract.export" });
  return state;
}

interface ScriptStep {
  command?: CommandBody;
  ticks: number;
}

/** Fixed script: identical command timings regardless of chunk size. */
function starterScript(): ScriptStep[] {
  const steps: ScriptStep[] = [];
  for (let i = 0; i < 6; i += 1) steps.push({ command: { type: "manual.salvage" }, ticks: 6 });
  steps.push({ command: { type: "drone.repair" }, ticks: 262 });
  steps.push({ command: { type: "machine.build", blueprint: "sorter", tile: 8 }, ticks: 0 });
  steps.push({ command: { type: "route.connect", from: 0, to: 1, filter: "scrap" }, ticks: 60 });
  steps.push({ command: { type: "route.connect", from: 1, to: 0, filter: "ferrous" }, ticks: 0 });
  steps.push({ command: { type: "machine.upgrade", machineId: 1 }, ticks: 240 });
  return steps;
}

function runScript(chunk: number): SimState {
  const state = createInitialState();
  let index = 0;
  for (const step of starterScript()) {
    if (step.command) send(state, step.command, `s${index}`);
    let remaining = step.ticks;
    while (remaining > 0) {
      const take = Math.min(chunk, remaining);
      advance(state, take);
      remaining -= take;
    }
    index += 1;
  }
  return state;
}

describe("tutorial starter economy", () => {
  it("awards exactly 30 scrap for six manual pulses", () => {
    const state = createInitialState();
    for (let i = 0; i < 6; i += 1) {
      expect(send(state, { type: "manual.salvage" }).ok).toBe(true);
      advance(state, TUNING.manualPulseTicks);
    }
    expect(state.store["scrap"]).toBe(30);
    expect(state.tutorial).toBe(2);
  });

  it("enforces the 0.6s cutting pulse cooldown", () => {
    const state = createInitialState();
    expect(send(state, { type: "manual.salvage" }).ok).toBe(true);
    const second = send(state, { type: "manual.salvage" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("cooldown");
    advance(state, TUNING.manualPulseTicks);
    expect(send(state, { type: "manual.salvage" }).ok).toBe(true);
  });

  it("repairs the drone once for exactly 30 scrap", () => {
    const state = createInitialState();
    for (let i = 0; i < 6; i += 1) {
      send(state, { type: "manual.salvage" });
      advance(state, TUNING.manualPulseTicks);
    }
    expect(send(state, { type: "drone.repair" }).ok).toBe(true);
    expect(state.drone.repaired).toBe(true);
    expect(state.store["scrap"]).toBe(0);
    expect(send(state, { type: "drone.repair" }).ok).toBe(false);
    expect(state.drone.repaired).toBe(true);
  });

  it("delivers drone cargo in 5-unit loads after travel latency", () => {
    const state = createInitialState();
    for (let i = 0; i < 6; i += 1) {
      send(state, { type: "manual.salvage" });
      advance(state, TUNING.manualPulseTicks);
    }
    send(state, { type: "drone.repair" });
    advance(state, TUNING.droneDeliveryTicks + TUNING.droneTravelTicks + 1);
    expect(state.drone.deliveries).toBe(1);
    expect(state.store["scrap"]).toBe(TUNING.droneDeliveryUnits);
    advance(state, TUNING.droneDeliveryTicks);
    expect(state.store["scrap"]).toBe(TUNING.droneDeliveryUnits * 2);
  });

  it("reaches the first export contract through a real processing chain", () => {
    const state = tutorialToExport();
    expect(state.credits).toBe(TUNING.exportContractCredits);
    expect(state.exportClaimed).toBe(true);
    expect(state.tutorial).toBeGreaterThanOrEqual(7);
    expect(send(state, { type: "contract.export" }).ok).toBe(false);
  });

  it("rejects builds without enough material and charges nothing", () => {
    const state = createInitialState();
    const before = send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.reason).toBe("insufficient");
    expect(state.store["scrap"] ?? 0).toBe(0);
    expect(state.revision).toBe(0);
  });

  it("refuses the protected dock tile and occupied tiles", () => {
    const state = createInitialState();
    for (let i = 0; i < 6; i += 1) {
      send(state, { type: "manual.salvage" });
      advance(state, TUNING.manualPulseTicks);
    }
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 2 }).ok).toBe(false);
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(true);
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(false);
  });

  it("returns identical results for a retried command id", () => {
    const state = createInitialState();
    for (let i = 0; i < 6; i += 1) {
      send(state, { type: "manual.salvage" });
      advance(state, TUNING.manualPulseTicks);
    }
    const command: Command = { id: "stable-repair", type: "drone.repair" };
    const first = applyCommand(state, command);
    const revision = state.revision;
    const second = applyCommand(state, command);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(state.revision).toBe(revision);
    expect(state.store["scrap"]).toBe(0);
  });
});

describe("upgrade curves", () => {
  it("matches the documented cost progression", () => {
    expect(upgradeCost(30, 1)).toBe(30);
    expect(upgradeCost(30, 2)).toBe(Math.ceil(30 * 1.16));
    expect(upgradeCost(30, 3)).toBe(Math.ceil(Math.ceil(30 * 1.16) * 1.16));
  });

  it("raises speed only, leaving power draw unchanged per level", () => {
    const state = createInitialState();
    for (let i = 0; i < 6; i += 1) {
      send(state, { type: "manual.salvage" });
      advance(state, TUNING.manualPulseTicks);
    }
    send(state, { type: "drone.repair" });
    advance(state, 262);
    send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
    const machine = state.machines[0];
    const before = machine.batchMilli;
    const power = RECIPES[BLUEPRINTS.sorter.recipeId].power;
    state.credits = 500;
    send(state, { type: "machine.upgrade", machineId: machine.id });
    expect(machine.level).toBe(2);
    expect(machine.batchMilli).toBeLessThan(before);
    expect(machine.batchPower).toBe(power);
  });
});

describe("determinism", () => {
  it("produces identical state for one script at different tick chunk sizes", () => {
    const fine = runScript(1);
    const coarse = runScript(10);
    const bulk = runScript(240);
    expect(JSON.stringify(coarse)).toBe(JSON.stringify(fine));
    expect(JSON.stringify(bulk)).toBe(JSON.stringify(fine));
  });

  it("advanceTo equals tick-by-tick advance for the same target", () => {
    const stepped = runScript(1);
    const jumped = createInitialState();
    let index = 0;
    for (const step of starterScript()) {
      if (step.command) send(jumped, step.command, `s${index}`);
      advanceTo(jumped, jumped.tick + step.ticks);
      index += 1;
    }
    expect(jumped.tick).toBe(stepped.tick);
    expect(JSON.stringify(jumped)).toBe(JSON.stringify(stepped));
  });
});

describe("quantity safety", () => {
  it("keeps every quantity a safe nonnegative integer", () => {
    const state = tutorialToExport();
    advance(state, 2000);
    for (const value of Object.values(systemTotals(state))) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isSafeInteger(state.credits)).toBe(true);
    expect(Number.isFinite(state.powerRatio)).toBe(true);
  });
});

describe("recipe table", () => {
  it("uses whole-tick cycles and declared power for every machine", () => {
    for (const blueprint of Object.values(BLUEPRINTS)) {
      const recipe = RECIPES[blueprint.recipeId];
      expect(recipe.cycleTicks % 1).toBe(0);
      expect(recipe.cycleTicks).toBeGreaterThan(0);
      expect(recipe.power).toBeGreaterThan(0);
      expect(recipe.inputs.length).toBeGreaterThan(0);
      expect(recipe.outputs.length).toBeGreaterThan(0);
    }
  });
});
