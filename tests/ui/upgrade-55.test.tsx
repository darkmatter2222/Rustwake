import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import inspectorRaw from "../../src/ui/inspector/inspector.css?raw";
import upgradeRaw from "../../src/ui/upgrade/upgrade.css?raw";
import { MachinePanel } from "../../src/ui/Panels";
import { UPGRADE_COPY } from "../../src/ui/upgrade/copy";
import {
  afterPurchase,
  afterRespec,
  branchCards,
  metricValue,
  respecInfo,
  respecPreview,
} from "../../src/ui/upgrade/model";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  branchPrice,
  upgradeCost,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  batchMilliFor,
  batchMilliOf,
  createInitialState,
  inputCapacityOf,
  powerOf,
  upgradeRanks,
  type MachineState,
  type SimState,
  type UpgradeBranch,
} from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { researchBonus } from "../../src/game/content/research";
import { formatSeconds, plural, t, unit } from "../../src/game/content/strings";

/**
 * UI-RESET-55 (G2 wave 4): machine upgrades become explicit before/after comparisons.
 * Three selectable branch cards print current → proposed values with units, the engine's
 * own price and the tradeoff; nothing is auto-selected; the purchase goes through the
 * real `machine.upgrade` command and the confirmation is read back from the applied
 * state; affordability and shortfall come from the same numbers the engine charges;
 * the draw floor is an honest maxed state; legacy branch-less machines read truthful
 * current values; and the free last-pick respec matches the engine's exact semantics.
 *
 * All state mutations below happen in this test file only; every purchase and respec
 * under test goes through the real UI path: click → dispatch → applyCommand → state
 * readback, with the printed number checked against the engine's own arithmetic.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 5500;
function send(state: SimState, command: CommandBody): unknown {
  return applyCommand(state, { ...command, id: `i55-${(seq += 1)}` } as Command);
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

function yardWithAFullyLinkedSorter(): SimState {
  const state = yardWithASorter();
  const sorter = state.machines[0];
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "nonferrous" });
  advance(state, 30);
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
) {
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
    dispatch,
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

function cards(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".upgrade-card")];
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

function respecButton(host: HTMLElement, branch: UpgradeBranch): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`[data-respec="${branch}"]`);
}

function actionFaces(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".panel__actions > .icon-btn")];
}

/** The same raw-key census the shipped i18n gate runs over painted text. */
const KEY_PATTERN =
  /\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/;

describe("UI-RESET-55 branch comparison cards", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("paints three selectable cards in dock order with current→proposed, units, cost and tradeoff", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    const { host } = mountPanel(state, machine);
    const all = cards(host);
    expect(all.map((node) => node.getAttribute("data-branch"))).toEqual([
      "speed",
      "buffer",
      "draw",
    ]);
    const models = branchCards(state, machine);
    for (const model of models) {
      const node = card(host, model.branch);
      expect(node.textContent).toContain(`${model.metric}: ${model.currentText} → ${model.proposedText}`);
      expect(node.textContent).toContain(`${UPGRADE_COPY.costWord}: ${model.costText}`);
      expect(model.cost).toBe(branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, machine.level, model.branch));
      expect(node.textContent).toContain(model.tradeoff);
      expect(node.textContent).toContain(model.deltaText);
    }
    // The sorter's recipe draws 1 unit: the draw card is the honest maxed state.
    expect(models[0].currentText).toBe(t("value.seconds", { seconds: formatSeconds(batchMilliOf(machine) / 10000) }));
    expect(models[1].currentText).toBe(unit(inputCapacityOf(machine, researchBonus(state).inputBuffer), t("unit.unit")));
    expect(models[1].proposedText).toBe(unit(inputCapacityOf(machine, researchBonus(state).inputBuffer) + 6, t("unit.unit")));
    // Nothing is auto-selected — least of all the cheapest branch — and buy is gated.
    expect(all.every((node) => node.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(buyButton(host).disabled).toBe(true);
    expect(host.textContent).toContain(UPGRADE_COPY.buyHint);
    // The comparison adds no command face and no section landmark (#54 contract).
    expect(buyButton(host).closest(".panel__actions")).toBeNull();
    expect(host.querySelectorAll(".inspector-section").length).toBe(7);
  });

  it("reads truthful current values for a legacy branch-less machine", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    // Pre-fork record: level 3, no named picks. The scalar ladder was the batch clock.
    machine.level = 3;
    machine.batchMilli = batchMilliFor(machine.blueprint, 3);
    expect(machine.branch).toBeUndefined();
    const { host } = mountPanel(state, machine);
    const models = branchCards(state, machine);
    expect(upgradeRanks(machine)).toEqual({ speed: 2, buffer: 0, draw: 0 });
    expect(models[0].rankNow).toBe(2);
    expect(card(host, "speed").textContent).toContain(`${UPGRADE_COPY.rankWord} 2 → 3`);
    expect(models[0].currentText).toBe(t("value.seconds", { seconds: formatSeconds(batchMilliOf(machine) / 10000) }));
    // One named speed pick on top of the two unnamed ones: three speed ranks total.
    const next = afterPurchase(machine, "speed");
    expect(upgradeRanks(next).speed).toBe(3);
    expect(models[0].proposedText).toBe(t("value.seconds", { seconds: formatSeconds(batchMilliOf(next) / 10000) }));
    expect(models[1].currentText).toBe(unit(12, t("unit.unit")));
    expect(models[2].noEffect).toBe(true);
  });

  it("keeps selection deliberate and stable under repeated card taps, dispatching nothing", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    const dispatch = vi.fn((command: Command) => applyCommand(state, command));
    const { host } = mountPanel(state, machine, { dispatch });
    const speed = card(host, "speed");
    const buffer = card(host, "buffer");
    for (let i = 0; i < 5; i += 1) act(() => speed.click());
    expect(speed.getAttribute("aria-pressed")).toBe("true");
    expect(buffer.getAttribute("aria-pressed")).toBe("false");
    act(() => buffer.click());
    for (let i = 0; i < 5; i += 1) act(() => buffer.click());
    expect(buffer.getAttribute("aria-pressed")).toBe("true");
    expect(speed.getAttribute("aria-pressed")).toBe("false");
    expect(dispatch).not.toHaveBeenCalled();
    expect(buyButton(host).disabled).toBe(false);
    expect(buyButton(host).textContent).toContain(UPGRADE_COPY.branches.buffer.title);
    expect(state.credits).toBe(500);
    expect(machine.level).toBe(1);
  });

  it("buy spends exactly the printed branch price, records the pick and reads the result back", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const machine = state.machines[1];
    const { host, rerender } = mountPanel(state, machine);
    act(() => card(host, "speed").click());
    const cost = branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, machine.level, "speed");
    expect(buyButton(host).textContent).toContain(unit(cost, t("unit.credit")));
    const beforeRevision = state.revision;
    const beforeMilli = machine.batchMilli;
    act(() => buyButton(host).click());
    expect(state.revision).toBe(beforeRevision + 1);
    expect(machine.level).toBe(2);
    expect(machine.branch).toEqual(["speed"]);
    expect(state.credits).toBe(500 - cost);
    expect(machine.batchMilli).toBe(batchMilliOf(machine));
    expect(machine.batchMilli).toBeLessThan(beforeMilli);
    // The confirmation is the applied state read back, not an optimistic guess.
    const text = receiptText(host);
    expect(text).toContain(`${UPGRADE_COPY.receiptApplied}: ${UPGRADE_COPY.branches.speed.title}`);
    expect(text).toContain(`${UPGRADE_COPY.rankWord} 1`);
    expect(text).toContain(`${UPGRADE_COPY.levelWord} 2`);
    expect(text).toContain(`${UPGRADE_COPY.paidWord} ${unit(cost, t("unit.credit"))}`);
    expect(text).toContain(`500 → ${500 - cost}`);
    expect(text).toContain(t("value.seconds", { seconds: formatSeconds(batchMilliOf(machine) / 10000) }));
    rerender();
    // Selection survives the purchase; the card now prices the NEXT level.
    expect(card(host, "speed").getAttribute("aria-pressed")).toBe("true");
    const nextCost = branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, 2, "speed");
    expect(card(host, "speed").textContent).toContain(unit(nextCost, t("unit.credit")));
  });

  it("repeated buy taps never drift the branch and charge exactly once per tap", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    const { host, rerender } = mountPanel(state, machine);
    act(() => card(host, "buffer").click());
    let credits = 500;
    for (let tap = 0; tap < 3; tap += 1) {
      const level = machine.level;
      const price = branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, level, "buffer");
      expect(buyButton(host).textContent).toContain(unit(price, t("unit.credit")));
      act(() => buyButton(host).click());
      credits -= price;
      expect(machine.level).toBe(level + 1);
      expect(state.credits).toBe(credits);
      expect(machine.branch).toEqual(Array(tap + 1).fill("buffer"));
      rerender();
      expect(card(host, "buffer").getAttribute("aria-pressed")).toBe("true");
      expect(card(host, "speed").getAttribute("aria-pressed")).toBe("false");
    }
    expect(state.credits).toBe(500 - 30 - 35 - 41);
    expect(inputCapacityOf(machine, researchBonus(state).inputBuffer)).toBe(12 + 18);
  });

  it("updates affordability from state and explains the shortfall with the engine's numbers", () => {
    const state = yardWithASorter();
    state.credits = 12;
    const machine = state.machines[0];
    const { host, rerender } = mountPanel(state, machine);
    const cost = branchPrice(BLUEPRINTS.sorter.baseUpgradeCost, 1, "speed");
    expect(cost).toBeGreaterThan(12);
    const shortfall = t("reject.shortfall", { need: cost, have: 12, word: plural(cost, t("unit.credit")) });
    expect(card(host, "speed").textContent).toContain(shortfall);
    expect(card(host, "speed").textContent).not.toContain(UPGRADE_COPY.affordable);
    act(() => card(host, "speed").click());
    const beforeRevision = state.revision;
    act(() => buyButton(host).click());
    // Blocked tap: nothing spent, nothing applied, and the receipt names the same price.
    expect(state.credits).toBe(12);
    expect(machine.level).toBe(1);
    expect(state.revision).toBe(beforeRevision);
    expect(receiptText(host)).toBe(`${UPGRADE_COPY.receiptShort}: ${shortfall}. ${UPGRADE_COPY.nothingSpent}`);
    // Affordability is live: fund the yard and the same card flips without a remount.
    state.credits = 500;
    rerender();
    expect(card(host, "speed").textContent).toContain(UPGRADE_COPY.affordable);
    expect(card(host, "speed").textContent).not.toContain(shortfall);
    act(() => buyButton(host).click());
    expect(machine.level).toBe(2);
    expect(state.credits).toBe(500 - cost);
    expect(receiptText(host)).toContain(UPGRADE_COPY.receiptApplied);
  });

  it("shows the draw floor as a maxed no-effect card and never promises improvement", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    expect(powerOf(machine)).toBe(1);
    const { host } = mountPanel(state, machine);
    const draw = card(host, "draw");
    expect(draw.disabled).toBe(true);
    expect(draw.textContent).toContain(UPGRADE_COPY.noEffectBadge);
    expect(draw.textContent).toContain(UPGRADE_COPY.drawFloor);
    const model = branchCards(state, machine)[2];
    expect(model.currentText).toBe(model.proposedText);
    expect(model.deltaText).toBe(UPGRADE_COPY.noChange);
    expect(card(host, "speed").disabled).toBe(false);
    expect(card(host, "buffer").disabled).toBe(false);
  });

  it("draw purchase works while above the floor and maxes honestly at the floor", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const machine = state.machines[1];
    expect(powerOf(machine)).toBe(2);
    const { host, rerender } = mountPanel(state, machine);
    const draw = card(host, "draw");
    expect(draw.disabled).toBe(false);
    expect(draw.textContent).toContain(`${unit(2, t("unit.unit"))} → ${unit(1, t("unit.unit"))}`);
    act(() => draw.click());
    const cost = branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, 1, "draw");
    act(() => buyButton(host).click());
    expect(machine.branch).toEqual(["draw"]);
    expect(powerOf(machine)).toBe(1);
    expect(state.credits).toBe(500 - cost);
    expect(receiptText(host)).toContain(`${UPGRADE_COPY.branches.draw.metric} ${unit(2, t("unit.unit"))} → ${unit(1, t("unit.unit"))}`);
    rerender();
    expect(card(host, "draw").disabled).toBe(true);
    expect(card(host, "draw").textContent).toContain(UPGRADE_COPY.noEffectBadge);
  });

  it("keeps the plain unnamed upgrade honest: it counts as one speed rank", () => {
    const state = yardWithAFullyLinkedSorter();
    state.credits = 500;
    const machine = state.machines[0];
    const { host } = mountPanel(state, machine);
    expect(host.textContent).toContain(UPGRADE_COPY.plainNote);
    const faces = actionFaces(host);
    expect(faces.map((face) => face.textContent?.split(" ·")[0])).toEqual([
      "Upgrade",
      "Move",
      "Dismantle",
    ]);
    const cost = upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, machine.level);
    const beforeMilli = machine.batchMilli;
    act(() => faces[0].click());
    expect(machine.level).toBe(2);
    expect(machine.branch).toBeUndefined();
    expect(upgradeRanks(machine).speed).toBe(1);
    expect(machine.batchMilli).toBeLessThan(beforeMilli);
    expect(state.credits).toBe(500 - cost);
    // No named pick was written, so the free re-pick stays unavailable.
    expect(host.textContent).toContain(UPGRADE_COPY.respecNone);
  });
});

describe("UI-RESET-55 free respec of the last named pick", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("is unavailable while there is no named pick, and says why", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const { host } = mountPanel(state, state.machines[0]);
    expect(respecInfo(state.machines[0]).available).toBe(false);
    expect(host.textContent).toContain(UPGRADE_COPY.respecNone);
    expect(respecButton(host, "speed")).toBeNull();
    expect(respecButton(host, "buffer")).toBeNull();
    expect(respecButton(host, "draw")).toBeNull();
  });

  it("moves only the last pick, free, and reports the read-back values", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const machine = state.machines[1];
    const { host, rerender } = mountPanel(state, machine);
    act(() => card(host, "speed").click());
    act(() => buyButton(host).click());
    rerender();
    act(() => card(host, "buffer").click());
    act(() => buyButton(host).click());
    rerender();
    expect(machine.branch).toEqual(["speed", "buffer"]);
    expect(machine.level).toBe(3);
    const credits = state.credits;
    const revision = state.revision;
    // The current last pick is marked and cannot be re-picked onto itself.
    expect(respecButton(host, "buffer")?.disabled).toBe(true);
    expect(respecButton(host, "buffer")?.textContent).toContain(UPGRADE_COPY.respecCurrent);
    expect(respecButton(host, "speed")?.disabled).toBe(false);
    expect(respecButton(host, "draw")?.disabled).toBe(false);
    // Each respec face prints the value its re-pick would produce.
    for (const branch of ["speed", "buffer", "draw"] as UpgradeBranch[]) {
      expect(respecButton(host, branch)?.textContent).toContain(respecPreview(state, machine, branch));
    }
    act(() => respecButton(host, "draw")?.click());
    expect(machine.branch).toEqual(["speed", "draw"]);
    expect(machine.level).toBe(3);
    expect(state.credits).toBe(credits);
    expect(state.revision).toBe(revision + 1);
    expect(machine.batchMilli).toBe(batchMilliOf(machine));
    expect(powerOf(machine)).toBe(1);
    const text = receiptText(host);
    expect(text).toContain(`${UPGRADE_COPY.respecApplied} ${UPGRADE_COPY.branches.draw.title} (${UPGRADE_COPY.respecFree})`);
    expect(text).toContain(UPGRADE_COPY.creditsUnchanged);
    expect(text).toContain(`${UPGRADE_COPY.levelWord} 3`);
    for (const branch of ["speed", "buffer", "draw"] as UpgradeBranch[]) {
      expect(text).toContain(metricValue(state, machine, branch));
    }
    rerender();
    expect(respecButton(host, "draw")?.disabled).toBe(true);
    expect(respecButton(host, "buffer")?.disabled).toBe(false);
  });

  it("matches the engine no-op semantics: same branch and no picks change nothing", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const machine = state.machines[1];
    // No picks: the engine accepts and changes no state. applyCommand still counts
    // every ok command in the revision, so the no-op is proven by the untouched
    // machine, not by the counter.
    const noop = applyCommand(state, { id: "i55-noop-1", type: "machine.respec", machineId: machine.id, branch: "speed" });
    expect(noop.ok).toBe(true);
    expect(machine.branch).toBeUndefined();
    expect(machine.level).toBe(1);
    expect(state.credits).toBe(500);
    // One named pick, re-picked onto itself: still a no-op for every stored value.
    send(state, { type: "machine.upgrade", machineId: machine.id, branch: "speed" });
    const credits = state.credits;
    const milli = machine.batchMilli;
    const same = applyCommand(state, { id: "i55-noop-2", type: "machine.respec", machineId: machine.id, branch: "speed" });
    expect(same.ok).toBe(true);
    expect(machine.branch).toEqual(["speed"]);
    expect(machine.level).toBe(2);
    expect(machine.batchMilli).toBe(milli);
    expect(state.credits).toBe(credits);
    // The UI guards the same case by disabling the current branch's face.
    const { host } = mountPanel(state, machine);
    expect(respecButton(host, "speed")?.disabled).toBe(true);
  });

  it("respec previews equal the engine's own post-respec arithmetic", () => {
    const state = yardWithAFurnace();
    state.credits = 900;
    const machine = state.machines[1];
    send(state, { type: "machine.upgrade", machineId: machine.id, branch: "speed" });
    send(state, { type: "machine.upgrade", machineId: machine.id, branch: "buffer" });
    for (const branch of ["speed", "buffer", "draw"] as UpgradeBranch[]) {
      const preview = afterRespec(machine, branch);
      const beforePicks = [...(machine.branch ?? [])];
      applyCommand(state, { id: `i55-pre-${branch}`, type: "machine.respec", machineId: machine.id, branch });
      expect(machine.branch).toEqual(preview.branch);
      expect(machine.batchMilli).toBe(batchMilliOf(preview));
      expect(powerOf(machine)).toBe(powerOf(preview));
      expect(inputCapacityOf(machine, researchBonus(state).inputBuffer)).toBe(
        inputCapacityOf(preview, researchBonus(state).inputBuffer),
      );
      if (branch === "buffer") {
        expect(machine.branch).toEqual(beforePicks); // same-branch no-op
      }
      expect(respecPreview(state, machine, branch)).toBe(metricValue(state, machine, branch));
      // Restore the buffer-last shape for the next iteration.
      if (branch !== "buffer") {
        applyCommand(state, { id: `i55-restore-${branch}`, type: "machine.respec", machineId: machine.id, branch: "buffer" });
      }
    }
  });
});

describe("UI-RESET-55 two contrasting factory conditions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("power-limited yard: the draw card explains the shared-budget relief", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const machine = state.machines[1];
    machine.status = "powerLimited";
    state.powerRatio = 0.6;
    const { host } = mountPanel(state, machine, { powerRatio: 0.6 });
    const notes = [...host.querySelectorAll(".inspector-note--constraint")].map((n) => n.textContent ?? "");
    expect(notes.some((note) => note.includes("Power limited: the yard requests"))).toBe(true);
    const draw = card(host, "draw");
    expect(draw.disabled).toBe(false);
    expect(draw.textContent).toContain(UPGRADE_COPY.branches.draw.tradeoff);
    expect(draw.textContent).toContain(`${unit(2, t("unit.unit"))} → ${unit(1, t("unit.unit"))}`);
    // Same three cards, same structure: the state, not the UI, explains the choice.
    expect(cards(host).map((node) => node.getAttribute("data-branch"))).toEqual(["speed", "buffer", "draw"]);
  });

  it("buffer-starved yard: the buffer card explains the input space while draw maxes", () => {
    const state = yardWithASorter();
    state.credits = 500;
    const machine = state.machines[0];
    machine.status = "starved";
    machine.inBuf = {};
    machine.inBufUnits = 0;
    const { host } = mountPanel(state, machine);
    const notes = [...host.querySelectorAll(".inspector-note--constraint")].map((n) => n.textContent ?? "");
    expect(notes.some((note) => note.includes("Missing input: the buffer is short"))).toBe(true);
    const buffer = card(host, "buffer");
    expect(buffer.disabled).toBe(false);
    expect(buffer.textContent).toContain(UPGRADE_COPY.branches.buffer.tradeoff);
    expect(buffer.textContent).toContain(`${unit(12, t("unit.unit"))} → ${unit(18, t("unit.unit"))}`);
    // The sorter draws 1 unit: in this yard the draw card is maxed, not the choice.
    expect(card(host, "draw").disabled).toBe(true);
    expect(cards(host).map((node) => node.getAttribute("data-branch"))).toEqual(["speed", "buffer", "draw"]);
  });
});

describe("UI-RESET-55 identity, hygiene and the read model", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("keeps machine identity and selection stable across ticks, resetting on machine change", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const sorter = state.machines[0];
    const furnace = state.machines[1];
    const { host, rerender } = mountPanel(state, sorter);
    act(() => card(host, "speed").click());
    state.tick += 1;
    rerender();
    expect(card(host, "speed").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe("Scrap sorter details");
    expect(host.querySelector(".panel__title")?.textContent).toBe("Scrap sorter");
    // Switching the inspected machine remounts the comparison: no inherited target.
    rerender(furnace);
    expect(host.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe("Furnace details");
    expect(cards(host).every((node) => node.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(buyButton(host).disabled).toBe(true);
  });

  it("paints no NaN, no raw keys and no '1 units' across cards, receipts and respec", () => {
    const state = yardWithAFurnace();
    state.credits = 500;
    const machine = state.machines[1];
    const { host, rerender } = mountPanel(state, machine);
    const texts: string[] = [host.textContent ?? ""];
    for (const branch of ["speed", "buffer", "draw"] as UpgradeBranch[]) {
      act(() => card(host, branch).click());
      act(() => buyButton(host).click());
      rerender();
      texts.push(host.textContent ?? "");
    }
    for (const branch of ["speed", "buffer", "draw"] as UpgradeBranch[]) {
      const node = respecButton(host, branch);
      if (node && !node.disabled) {
        act(() => node.click());
        rerender();
        texts.push(host.textContent ?? "");
      }
    }
    state.credits = 0;
    rerender();
    act(() => card(host, "speed").click());
    act(() => buyButton(host).click());
    texts.push(host.textContent ?? "");
    for (const text of texts) {
      expect(text).not.toContain("NaN");
      expect(KEY_PATTERN.test(text)).toBe(false);
      expect(/(^|[^0-9])1 units\b/.test(text)).toBe(false);
    }
  });

  it("afterPurchase and afterRespec write the exact shapes the engine writes", () => {
    const state = yardWithAFurnace();
    state.credits = 900;
    const machine = state.machines[1];
    for (const branch of ["speed", "buffer", "draw"] as UpgradeBranch[]) {
      const predicted = afterPurchase(machine, branch);
      send(state, { type: "machine.upgrade", machineId: machine.id, branch });
      expect(machine.level).toBe(predicted.level);
      expect(machine.branch).toEqual(predicted.branch);
      expect(machine.batchMilli).toBe(batchMilliOf(predicted));
    }
    const last = machine.branch?.[machine.branch.length - 1];
    expect(last).toBe("draw");
    const predicted = afterRespec(machine, "speed");
    send(state, { type: "machine.respec", machineId: machine.id, branch: "speed" });
    expect(machine.branch).toEqual(predicted.branch);
    expect(machine.level).toBe(predicted.level);
    expect(machine.batchMilli).toBe(batchMilliOf(predicted));
  });

  it("prices every card from branchPrice and never reorders by price", () => {
    const state = yardWithAFurnace();
    const machine = state.machines[1];
    machine.level = 4;
    machine.branch = ["speed", "buffer", "draw"];
    machine.batchMilli = batchMilliOf(machine);
    const models = branchCards(state, machine);
    expect(models.map((model) => model.branch)).toEqual(["speed", "buffer", "draw"]);
    for (const model of models) {
      expect(model.cost).toBe(branchPrice(BLUEPRINTS.furnace.baseUpgradeCost, 4, model.branch));
      expect(model.costText).toBe(unit(model.cost, t("unit.credit")));
    }
    // speed carries the +10 premium; buffer and draw keep the plain ladder price.
    expect(models[0].cost).toBe(upgradeCost(BLUEPRINTS.furnace.baseUpgradeCost, 4) + 10);
    expect(models[1].cost).toBe(upgradeCost(BLUEPRINTS.furnace.baseUpgradeCost, 4));
    expect(models[2].cost).toBe(upgradeCost(BLUEPRINTS.furnace.baseUpgradeCost, 4));
    expect(models[2].noEffect).toBe(true); // one draw rank already sits at the floor
  });
});
