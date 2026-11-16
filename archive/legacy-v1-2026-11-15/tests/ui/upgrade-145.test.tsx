import { describe, expect, it, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import inspectorRaw from "../../src/ui/inspector/inspector.css?raw";
import upgradeRaw from "../../src/ui/upgrade/upgrade.css?raw";
import { MachinePanel } from "../../src/ui/Panels";
import { UPGRADE_COPY } from "../../src/ui/upgrade/copy";
import { branchCards } from "../../src/ui/upgrade/model";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  branchPrice,
  upgradeComparison,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  BUFFER_RANK_UNITS,
  UPGRADE_BRANCHES,
  createInitialState,
  machineById,
  powerOf,
  type MachineState,
  type SimState,
  type UpgradeBranch,
} from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { formatRate, t, unit } from "../../src/game/content/strings";

/**
 * T18 (#145) — U05 upgrade comparison: EVERY card prints the engine's full
 * before/after (`upgradeComparison`) — throughput in batches/min at full power,
 * power draw per running batch, and input capacity including research bonuses —
 * beside the branch's own named metric, with the engine's exact price. The three
 * branches keep their distinct semantics (speed changes only the rate, buffer only
 * the capacity, draw only the power), the purchase reads back the applied state,
 * and nothing is auto-selected: two deliberate strategies from the same seeded yard
 * buy different branches.
 *
 * Fixtures replay the upgrade-55 seeded economy (six pulses, repair, build, links,
 * real `advance` ticks) with deterministic command ids (`i145u-N`). Every purchase
 * under test goes through the real UI path: click → dispatch → applyCommand →
 * state readback. No src mutation.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 14500;
function send(state: SimState, body: CommandBody): unknown {
  seq += 1;
  return applyCommand(state, { ...body, id: `i145u-${seq}` } as Command);
}

/** Six pulses, the repair, one built sorter with both links, past the tutorial. */
function yardWithASorter(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = state.machines[state.machines.length - 1];
  send(state, { type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "ferrous" });
  advance(state, 120);
  state.tutorial = 9;
  state.exportClaimed = true;
  return state;
}

/** The sorter yard plus one furnace (R02, power 2): the draw branch has room to work. */
function yardWithAFurnace(): SimState {
  const state = yardWithASorter();
  state.store.scrap = (state.store.scrap ?? 0) + 50;
  state.store.ferrous = (state.store.ferrous ?? 0) + 20;
  state.storeUnits += 70;
  send(state, { type: "machine.build", blueprint: "furnace", tile: 9 });
  return state;
}

function mountPanel(
  state: SimState,
  initial: MachineState,
  opts: { powerRatio?: number; dispatch?: (command: Command) => unknown } = {},
): { host: HTMLElement; rerender: (next?: MachineState) => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  let machine = initial;
  const dispatch = opts.dispatch ?? ((command: Command) => applyCommand(state, command));
  const node = (): ReactNode => (
    <MachinePanel
      state={state}
      machine={machine}
      tick={state.tick}
      powerRatio={opts.powerRatio ?? state.powerRatio}
      dispatch={dispatch}
      onClose={() => undefined}
    />
  );
  act(() => {
    root.render(node());
  });
  return {
    host,
    rerender: (next?: MachineState) => {
      if (next) machine = next;
      act(() => {
        root.render(node());
      });
    },
  };
}

function injectSheets() {
  for (const raw of [stylesRaw, inspectorRaw, upgradeRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
}

function card(host: HTMLElement, branch: UpgradeBranch): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(`[data-branch="${branch}"]`);
  if (!found) throw new Error(`missing branch card: ${branch}`);
  return found;
}

function buyButton(host: HTMLElement): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>("[data-buy]");
  if (!found) throw new Error("missing buy button");
  return found;
}

function receiptText(host: HTMLElement): string {
  return host.querySelector(".upgrade-receipt")?.textContent ?? "";
}

function spanText(node: HTMLElement, selector: string): string {
  const found = node.querySelector(selector);
  if (!found) throw new Error(`missing span: ${selector}`);
  return found.textContent ?? "";
}

function click(node: HTMLElement) {
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** The same raw-key census the shipped i18n gate runs over painted text. */
const KEY_PATTERN =
  /\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/;

describe("T18 U05 — every upgrade card prints the engine's full before/after", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("all three cards equal upgradeComparison exactly: throughput, power, capacity, cost", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    const { host } = mountPanel(state, machine);
    const models = branchCards(state, machine);
    expect(models.map((model) => model.branch)).toEqual([...UPGRADE_BRANCHES]);
    for (const model of models) {
      const engine = upgradeComparison(state, machine.id, model.branch);
      expect(engine).not.toBeNull();
      // The read model is the engine's comparison, number for number.
      expect(model.rateNow).toBe(engine!.before.batchesPerMinute);
      expect(model.rateNext).toBe(engine!.after.batchesPerMinute);
      expect(model.powerNow).toBe(engine!.before.power);
      expect(model.powerNext).toBe(engine!.after.power);
      expect(model.capacityNow).toBe(engine!.before.inputCapacity);
      expect(model.capacityNext).toBe(engine!.after.inputCapacity);
      expect(model.cost).toBe(engine!.cost);
      expect(model.cost).toBe(
        branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, machine.level, model.branch),
      );
      expect(model.affordable).toBe(state.credits >= engine!.cost);
      // The painted spans are the same numbers with the shared formatters.
      const node = card(host, model.branch);
      expect(spanText(node, ".upgrade-card__rate")).toBe(
        `${UPGRADE_COPY.throughputWord}: ${formatRate(engine!.before.batchesPerMinute)} → ${formatRate(engine!.after.batchesPerMinute)} ${UPGRADE_COPY.batchesPerMinute}`,
      );
      expect(spanText(node, ".upgrade-card__power")).toBe(
        `${UPGRADE_COPY.powerDrawWord}: ${unit(engine!.before.power, t("unit.unit"))} → ${unit(engine!.after.power, t("unit.unit"))}`,
      );
      expect(spanText(node, ".upgrade-card__capacity")).toBe(
        `${UPGRADE_COPY.capacityWord}: ${unit(engine!.before.inputCapacity, t("unit.unit"))} → ${unit(engine!.after.inputCapacity, t("unit.unit"))}`,
      );
      expect(node.textContent).toContain(`${UPGRADE_COPY.costWord}: ${model.costText}`);
    }
    // Concrete sorter anchors: a 4 s batch is 15 batches/min at full power, drawing
    // 1 unit into a 12-unit input buffer; speed alone raises the rate past 15.
    const speed = models.find((model) => model.branch === "speed")!;
    expect(speed.rateNow).toBe(15);
    expect(speed.rateNext).toBeGreaterThan(15);
    expect(speed.powerNow).toBe(1);
    expect(speed.capacityNow).toBe(12);
  });

  it("branch semantics: speed changes only rate, buffer only capacity, draw only power", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const sorter = state.machines[0];
    const { host } = mountPanel(state, sorter);
    const models = branchCards(state, sorter);
    const speed = models.find((model) => model.branch === "speed")!;
    expect(speed.rateNext).toBeGreaterThan(speed.rateNow);
    expect(speed.powerNext).toBe(speed.powerNow);
    expect(speed.capacityNext).toBe(speed.capacityNow);
    const buffer = models.find((model) => model.branch === "buffer")!;
    expect(buffer.capacityNext - buffer.capacityNow).toBe(BUFFER_RANK_UNITS);
    expect(buffer.rateNext).toBe(buffer.rateNow);
    expect(buffer.powerNext).toBe(buffer.powerNow);
    // The sorter draws 1 unit: the draw card is the honest maxed no-effect state.
    const draw = models.find((model) => model.branch === "draw")!;
    expect(draw.noEffect).toBe(true);
    expect(draw.powerNow).toBe(1);
    expect(draw.powerNext).toBe(1);
    expect(draw.rateNext).toBe(draw.rateNow);
    expect(draw.capacityNext).toBe(draw.capacityNow);
    expect(card(host, "draw").disabled).toBe(true);
    expect(card(host, "draw").textContent).toContain(UPGRADE_COPY.noEffectBadge);

    // The furnace draws 2 units: its draw card honestly promises 2 → 1 and nothing else.
    const furnaceState = yardWithAFurnace();
    furnaceState.credits = 500;
    const furnace = furnaceState.machines[1];
    expect(powerOf(furnace)).toBe(2);
    const furnaceModels = branchCards(furnaceState, furnace);
    const furnaceDraw = furnaceModels.find((model) => model.branch === "draw")!;
    expect(furnaceDraw.noEffect).toBe(false);
    expect(furnaceDraw.powerNow).toBe(2);
    expect(furnaceDraw.powerNext).toBe(1);
    expect(furnaceDraw.rateNext).toBe(furnaceDraw.rateNow);
    expect(furnaceDraw.capacityNext).toBe(furnaceDraw.capacityNow);
    const furnaceMount = mountPanel(furnaceState, furnace);
    expect(card(furnaceMount.host, "draw").disabled).toBe(false);
    expect(spanText(card(furnaceMount.host, "draw"), ".upgrade-card__power")).toBe(
      `${UPGRADE_COPY.powerDrawWord}: ${unit(2, t("unit.unit"))} → ${unit(1, t("unit.unit"))}`,
    );
  });

  it("prints the instant-apply note: no downtime is promised", () => {
    const state = yardWithASorter();
    const { host } = mountPanel(state, state.machines[0]);
    const notes = [...host.querySelectorAll(".upgrade-note")].map((node) => node.textContent);
    expect(notes).toContain(UPGRADE_COPY.instantNote);
  });

  it("detached machine shapes still price through upgradeComparison itself", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const detached: MachineState = { ...state.machines[0], id: 9999 };
    const held: SimState = { ...state, machines: [...state.machines, detached] };
    const models = branchCards(state, detached);
    for (const model of models) {
      const engine = upgradeComparison(held, detached.id, model.branch);
      expect(engine).not.toBeNull();
      expect(model.rateNow).toBe(engine!.before.batchesPerMinute);
      expect(model.rateNext).toBe(engine!.after.batchesPerMinute);
      expect(model.powerNow).toBe(engine!.before.power);
      expect(model.powerNext).toBe(engine!.after.power);
      expect(model.capacityNow).toBe(engine!.before.inputCapacity);
      expect(model.capacityNext).toBe(engine!.after.inputCapacity);
      expect(model.cost).toBe(engine!.cost);
    }
  });

  it("purchase reads back the applied state: the new rateNow equals the prior rateNext", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    const before = upgradeComparison(state, machine.id, "speed")!;
    const creditsBefore = state.credits;
    // applyCommand mutates in place, so capture the level BEFORE the purchase click.
    const levelBefore = machine.level;
    const { host, rerender } = mountPanel(state, machine);
    expect(buyButton(host).disabled).toBe(true);
    click(card(host, "speed"));
    expect(card(host, "speed").getAttribute("aria-pressed")).toBe("true");
    expect(buyButton(host).disabled).toBe(false);
    click(buyButton(host));
    expect(host.querySelector(".upgrade-receipt--applied")).not.toBeNull();
    expect(receiptText(host)).toContain(UPGRADE_COPY.receiptApplied);
    // The engine applied exactly the compared purchase.
    const after = machineById(state, machine.id)!;
    expect(after.level).toBe(levelBefore + 1);
    expect(after.branch?.[after.branch.length - 1]).toBe("speed");
    expect(creditsBefore - state.credits).toBe(before.cost);
    rerender(after);
    const next = upgradeComparison(state, after.id, "speed")!;
    expect(next.before.batchesPerMinute).toBe(before.after.batchesPerMinute);
    expect(spanText(card(host, "speed"), ".upgrade-card__rate")).toBe(
      `${UPGRADE_COPY.throughputWord}: ${formatRate(next.before.batchesPerMinute)} → ${formatRate(next.after.batchesPerMinute)} ${UPGRADE_COPY.batchesPerMinute}`,
    );
  });

  it("a blocked tap reports the engine's shortfall and spends nothing", () => {
    const state = yardWithASorter();
    state.credits = 0;
    const machine = state.machines[0];
    const { host } = mountPanel(state, machine);
    const speed = branchCards(state, machine).find((model) => model.branch === "speed")!;
    expect(speed.affordable).toBe(false);
    expect(card(host, "speed").textContent).toContain(speed.shortfallText ?? "");
    click(card(host, "speed"));
    click(buyButton(host));
    expect(host.querySelector(".upgrade-receipt--short")).not.toBeNull();
    expect(state.credits).toBe(0);
    expect(machineById(state, machine.id)!.level).toBe(machine.level);
  });

  it("no auto-choice: two deliberate strategies from the same seed buy different branches", () => {
    // Strategy A: speed. Strategy B: buffer. Same seeded yard, same prices — the
    // comparison never selects for the player, and each receipt names its own pick.
    const stateA = yardWithASorter();
    stateA.credits = 500;
    const mountA = mountPanel(stateA, stateA.machines[0]);
    for (const branch of UPGRADE_BRANCHES) {
      expect(card(mountA.host, branch).getAttribute("aria-pressed")).toBe("false");
    }
    expect(buyButton(mountA.host).disabled).toBe(true);
    expect(mountA.host.textContent).toContain(UPGRADE_COPY.buyHint);
    click(card(mountA.host, "speed"));
    click(buyButton(mountA.host));
    expect(receiptText(mountA.host)).toContain(UPGRADE_COPY.branches.speed.title);
    expect(stateA.machines[0].branch).toEqual(["speed"]);

    const stateB = yardWithASorter();
    stateB.credits = 500;
    const mountB = mountPanel(stateB, stateB.machines[0]);
    click(card(mountB.host, "buffer"));
    click(buyButton(mountB.host));
    expect(receiptText(mountB.host)).toContain(UPGRADE_COPY.branches.buffer.title);
    expect(stateB.machines[0].branch).toEqual(["buffer"]);
    expect(receiptText(mountA.host)).not.toBe(receiptText(mountB.host));
    // The buffer strategy bought capacity, not speed: the rate is untouched.
    const bufferEngine = upgradeComparison(stateB, stateB.machines[0].id, "speed")!;
    expect(bufferEngine.before.batchesPerMinute).toBe(15);
  });

  it("hygiene: no raw keys, NaN or undefined in the painted comparison", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const { host } = mountPanel(state, state.machines[1]);
    const painted = host.textContent ?? "";
    expect(KEY_PATTERN.test(painted)).toBe(false);
    expect(painted).not.toContain("NaN");
    expect(painted).not.toContain("undefined");
    for (const branch of UPGRADE_BRANCHES) {
      const node = card(host, branch);
      expect(node.querySelectorAll(".upgrade-card__rate").length).toBe(1);
      expect(node.querySelectorAll(".upgrade-card__power").length).toBe(1);
      expect(node.querySelectorAll(".upgrade-card__capacity").length).toBe(1);
    }
  });
});
