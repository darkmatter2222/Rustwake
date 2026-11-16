// @vitest-environment node
/**
 * RW3D T10 (#137): economy-timing invariants for the assembly presentation.
 * Reload, fast-forward and reduced motion must all render the correct
 * current stage WITHOUT replaying charges: animation is presentation over
 * deterministic simulation state, never a timing source (V05/E02/U07).
 */
import { describe, expect, it } from "vitest";
import {
  advanceWorld,
  advanceWorldTo,
  applyWorldCommand,
  worldFingerprint,
  WORLD_KIT,
  type WorldState,
} from "../../src/game/world";
import { applyCommand, upgradeCost, type Command } from "../../src/game/simulation/commands";
import { advance } from "../../src/game/simulation/engine";
import { BLUEPRINTS } from "../../src/game/content/defs";
import { AssemblyView } from "../../src/game/renderer/three/assemblyView";
import {
  assemblyStageAt,
  upgradeModulesFor,
  worldAssemblySnapshot,
} from "../../src/game/renderer/assembly";
import { findLegalCell, newWorld, place } from "../game/world/helpers";
import { tutorialToExport } from "../simulation/economy.test";

const D = 50;

function placedWorld(): WorldState {
  const w = newWorld();
  const cell = findLegalCell(w, "warehouse");
  const res = place(w, "p1", "warehouse", cell.x, cell.y);
  if (!res.ok) throw new Error(`placement rejected: ${JSON.stringify(res)}`);
  return w;
}

describe("construction economy charges once; presentation follows state", () => {
  it("placement reserves the kit cost exactly once (E02 duplicate id)", () => {
    const w = newWorld();
    const stockBefore = { ...w.stock };
    const creditsBefore = w.credits;
    const cell = findLegalCell(w, "warehouse");
    expect(place(w, "p1", "warehouse", cell.x, cell.y).ok).toBe(true);
    const kit = WORLD_KIT.warehouse;
    for (const stack of kit.buildCost) {
      expect((stockBefore[stack.resource] ?? 0) - (w.stock[stack.resource] ?? 0)).toBe(stack.qty);
    }
    expect(creditsBefore - w.credits).toBe(kit.creditCost);
    expect(w.reservations).toHaveLength(1);

    // Duplicate command id: no second charge, no second reservation.
    const fp = worldFingerprint(w);
    const again = applyWorldCommand(w, { id: "p1", type: "world.place", asset: "warehouse", cell, rotation: 0 });
    expect(again.ok).toBe(true);
    expect(worldFingerprint(w)).toBe(fp);
    expect(w.reservations).toHaveLength(1);
  });

  it("completion settles the reservation exactly once at startTick + duration", () => {
    const w = placedWorld();
    advanceWorldTo(w, D - 1);
    expect(w.sites).toHaveLength(1);
    expect(w.reservations).toHaveLength(1);
    advanceWorldTo(w, D);
    expect(w.sites).toHaveLength(0);
    expect(w.buildings).toHaveLength(1);
    expect(w.reservations).toHaveLength(0);
    // Far past completion: nothing re-settles. The fingerprint includes the
    // tick itself, so compare the economy quantities, not the checksum.
    const economy = JSON.stringify({ stock: w.stock, committed: w.committed, credits: w.credits, reservations: w.reservations });
    advanceWorldTo(w, D + 100);
    expect(JSON.stringify({ stock: w.stock, committed: w.committed, credits: w.credits, reservations: w.reservations })).toBe(economy);
    expect(w.buildings).toHaveLength(1);
    expect(w.buildings[0].completedTick).toBe(D);
  });
});

describe("reload mid-build resumes the correct stage, charges never replay", () => {
  it("JSON round-trip at tick 25 converges to the identical completed world", () => {
    const live = placedWorld();
    advanceWorldTo(live, 25);
    expect(assemblyStageAt(25, D).name).toBe("walls");

    // "Reload": serialize / deserialize the economy state, then continue.
    const reloaded = JSON.parse(JSON.stringify(live)) as WorldState;
    const fpAtSave = worldFingerprint(live);
    expect(worldFingerprint(reloaded)).toBe(fpAtSave);

    advanceWorldTo(live, D);
    advanceWorldTo(reloaded, D);
    expect(worldFingerprint(reloaded)).toBe(worldFingerprint(live));
    expect(JSON.stringify(worldAssemblySnapshot(reloaded))).toEqual(JSON.stringify(worldAssemblySnapshot(live)));
    expect(reloaded.buildings).toHaveLength(1);
    expect(reloaded.reservations).toHaveLength(0);
  });

  it("a reload at every stage boundary resumes that exact stage", () => {
    for (const t of [0, 6, 16, 28, 38]) {
      const live = placedWorld();
      advanceWorldTo(live, t);
      const reloaded = JSON.parse(JSON.stringify(live)) as WorldState;
      const a = worldAssemblySnapshot(live);
      const b = worldAssemblySnapshot(reloaded);
      expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
      expect(assemblyStageAt(b.buildings[0].progressTicks, D).stage).toBe(assemblyStageAt(t, D).stage);
    }
  });
});

describe("fast-forward is presentation-equivalent to tick-by-tick", () => {
  it("advanceWorld(50) lands on the same fingerprint and snapshot as event-jump", () => {
    const stepped = placedWorld();
    const jumped = placedWorld();
    advanceWorld(stepped, D);
    advanceWorldTo(jumped, D);
    expect(worldFingerprint(jumped)).toBe(worldFingerprint(stepped));
    expect(JSON.stringify(worldAssemblySnapshot(jumped))).toEqual(JSON.stringify(worldAssemblySnapshot(stepped)));
  });

  it("every stage boundary shows the same stage under both advance paths", () => {
    const stepped = placedWorld();
    const jumped = placedWorld();
    for (const t of [0, 6, 16, 28, 38, 50]) {
      advanceWorldTo(stepped, t);
      advanceWorldTo(jumped, t);
      const a = worldAssemblySnapshot(stepped);
      const b = worldAssemblySnapshot(jumped);
      expect(JSON.stringify(b), `tick ${t}`).toEqual(JSON.stringify(a));
    }
  });
});

describe("animation is never a timing source (U07 reduced motion included)", () => {
  it("rendering with any motion settings leaves the economy byte-identical", () => {
    const w = placedWorld();
    advanceWorldTo(w, 25);
    const fp = worldFingerprint(w);
    const view = new AssemblyView();
    for (const reducedMotion of [false, true]) {
      for (const framePhase of [0, 0.25, 0.5, 0.999]) {
        view.sync(worldAssemblySnapshot(w), { reducedMotion, framePhase });
        expect(worldFingerprint(w)).toBe(fp);
      }
    }
    // The snapshot itself is untouched by presentation.
    const s1 = worldAssemblySnapshot(w);
    view.sync(s1, { reducedMotion: false, framePhase: 0.5 });
    expect(JSON.stringify(worldAssemblySnapshot(w))).toEqual(JSON.stringify(s1));
    view.dispose();
  });

  it("stage and visible-part counts depend on progress only, not framePhase", () => {
    const w = placedWorld();
    advanceWorldTo(w, 30);
    const view = new AssemblyView();
    const reports = [0, 0.3, 0.9].map((framePhase) => {
      view.sync(worldAssemblySnapshot(w), { reducedMotion: false, framePhase });
      const [r] = view.stageReport();
      return { stage: r.stage, visibleParts: r.visibleParts, done: r.done };
    });
    expect(reports[1]).toEqual(reports[0]);
    expect(reports[2]).toEqual(reports[0]);
    expect(reports[0].stage).toBe(3); // roof at tick 30
    view.dispose();
  });
});

describe("upgrades charge once; modules are a pure function of level", () => {
  it("duplicate upgrade command id charges and levels exactly once (E02)", () => {
    const state = tutorialToExport();
    const machine = state.machines.find((m) => m.blueprint === "sorter");
    expect(machine).toBeDefined();
    const levelBefore = machine!.level;
    const creditsBefore = state.credits;
    const cost = upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, levelBefore);

    const cmd: Command = { id: "u1", type: "machine.upgrade", machineId: machine!.id };
    applyCommand(state, cmd);
    expect(machine!.level).toBe(levelBefore + 1);
    expect(creditsBefore - state.credits).toBe(cost);

    // Same command id again: no second charge, no second level.
    const fpCredits = state.credits;
    applyCommand(state, cmd);
    expect(machine!.level).toBe(levelBefore + 1);
    expect(state.credits).toBe(fpCredits);

    // Presentation reflects the new level without any cost path.
    const modules = upgradeModulesFor("sorter", machine!.level);
    expect(modules).toHaveLength(Math.min(machine!.level - 1, 4));
    expect(modules[0].name).toBe("upgradeModule1");
  });

  it("a distinct upgrade charges again exactly once (per-level, not per-frame)", () => {
    const state = tutorialToExport();
    const machine = state.machines.find((m) => m.blueprint === "sorter")!;
    const levelBefore = machine.level;
    const creditsBefore = state.credits;
    applyCommand(state, { id: "u1", type: "machine.upgrade", machineId: machine.id });
    const cost1 = upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, levelBefore);
    const cost2 = upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, levelBefore + 1);
    expect(creditsBefore - state.credits).toBe(cost1);
    // Earn the second price through the economy (no test-only credit grants):
    // let the furnace run, then sell steel above the reserve floor.
    advance(state, 2000);
    const sell = applyCommand(state, { id: "s1", type: "contract.sell", resource: "steel", qty: 60 });
    expect(sell.ok).toBe(true);
    const creditsBeforeU2 = state.credits;
    const res = applyCommand(state, { id: "u2", type: "machine.upgrade", machineId: machine.id });
    expect(res.ok).toBe(true);
    expect(machine.level).toBe(levelBefore + 2);
    expect(creditsBeforeU2 - state.credits).toBe(cost2);
    expect(upgradeModulesFor("sorter", machine.level)).toHaveLength(Math.min(machine.level - 1, 4));
  });
});
