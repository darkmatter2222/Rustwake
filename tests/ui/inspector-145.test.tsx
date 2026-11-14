import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import inspectorRaw from "../../src/ui/inspector/inspector.css?raw";
import upgradeRaw from "../../src/ui/upgrade/upgrade.css?raw";
import { MachinePanel } from "../../src/ui/Panels";
import { COPY } from "../../src/ui/inspector/copy";
import {
  constraintCards,
  endpointName,
  focusRoute,
  focusSource,
} from "../../src/ui/inspector/model";
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  createInitialState,
  inputCapacityOf,
  type MachineState,
  type SimState,
} from "../../src/game/simulation/types";
import { planConnections } from "../../src/game/simulation/autoconnect";
import {
  diagnoseMachine,
  rateReading,
  requestedPower,
} from "../../src/game/simulation/diagnostics";
import { advance } from "../../src/game/simulation/engine";
import { researchBonus } from "../../src/game/content/research";
import {
  formatNumber,
  formatRate,
  formatWholeSeconds,
  plural,
  resourceWord,
  t,
  wholePercent,
} from "../../src/game/content/strings";
import { RESOURCE_LABEL } from "../../src/ui/text";
import { getLogisticsView, resetLogisticsView } from "../../src/ui/logistics/view";
import { clampCamera, refitCamera } from "../../src/game/renderer/camera";
import { fitCamera, type Camera, type ViewState } from "../../src/game/renderer/scene";
import { CELL, WORLD_H, WORLD_W, tileToWorld } from "../../src/game/renderer/grid";

/**
 * T18 (#145) — the inspector's U05/U06 contract, numeric and reproducible.
 *
 * U05: the Production rows print the engine's OWN measured rate (`rateReading`),
 * the potential rate at full power, the power-capped rate, the recipe's exact
 * input/output quantities, buffer/tray occupancy against the engine's capacities,
 * and the EXACT bottleneck sentences (`diagnoseMachine` evidence/advice plus the
 * constraint details with the engine's numbers).
 *
 * U06: focusing the source, the busiest route or the power context never loses the
 * selected machine — no command is dispatched, `onClose` is never called, the panel
 * title/cell stay put; the route face highlights through the shared logistics view
 * bridge; the power face opens (and re-opens after a manual close) the power pane;
 * and the camera pan App performs is the same `clampCamera` the gestures use, with
 * the intent preserved across refits.
 *
 * Fixture economy: command ids are deterministic (`i145-N`); the live-rate fixture
 * replays the same seeded pulse/repair/build sequence as upgrade-55. Scenario-only
 * counter/status mutations are documented inline and live in THIS file only; every
 * focus tap under test goes through the real rendered button. No src mutation.
 *
 * PRE-EXISTING (base 4cb479f, not introduced or fixed here): `ContextPanes` keys its
 * rows by `row.label`, and `routesContext` labels a route by its endpoint pair, so two
 * belts with identical endpoints (the sorter's two outputs to the dock) produce a
 * React duplicate-key warning when the Routes pane opens. The rows themselves are
 * correct (one per link); this file therefore exercises the Power pane and the pure
 * derivations, and the warning is documented in the issue evidence.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 14500;
function send(state: SimState, body: CommandBody): boolean {
  seq += 1;
  return applyCommand(state, { ...body, id: `i145-${seq}` } as Command).ok === true;
}

/** Sorter on tile 8, input link from the store, BOTH output plans laid. No advance. */
function linkedSorterYard(): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 300;
  state.store["ferrous"] = 20;
  state.storeUnits = 320;
  expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 })).toBe(true);
  const machine = state.machines[state.machines.length - 1];
  expect(send(state, { type: "route.connect", from: 0, to: machine.id, filter: "scrap" })).toBe(true);
  const plans = planConnections(state, machine.id);
  expect(plans.length).toBe(2);
  for (const plan of plans) {
    expect(send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter })).toBe(true);
  }
  return state;
}

/** One sorter, no links at all. */
function isolatedSorterYard(): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 300;
  state.storeUnits = 300;
  expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 })).toBe(true);
  return state;
}

/** Linked sorter plus an unlinked furnace on tile 9 (R02 eats ferrous, the sorter's output). */
function sorterAndFurnaceYard(): SimState {
  const state = linkedSorterYard();
  expect(send(state, { type: "machine.build", blueprint: "furnace", tile: 9 })).toBe(true);
  return state;
}

/** The upgrade-55 seeded economy: six pulses, repair, build, links, 400 ticks of real sim.
 * 400 ticks (not 120): belt delivery latency means the first batch completes after ~160
 * ticks, so a 40 s rate window needs the longer run to hold a non-zero reading. */
function liveSorterYard(): SimState {
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
  advance(state, 400);
  state.tutorial = 9;
  state.exportClaimed = true;
  return state;
}

const mountedRoots: Root[] = [];

function mountPanel(
  state: SimState,
  machine: MachineState,
  opts: {
    powerRatio?: number;
    onFocus?: (tile: number) => void;
    dispatch?: (command: Command) => unknown;
    onClose?: () => void;
  } = {},
): { host: HTMLElement; rerender: (next?: MachineState) => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  let current = machine;
  const node = (): ReactNode => (
    <MachinePanel
      state={state}
      machine={current}
      tick={state.tick}
      powerRatio={opts.powerRatio ?? state.powerRatio}
      dispatch={opts.dispatch ?? ((command) => applyCommand(state, command))}
      onClose={opts.onClose ?? (() => undefined)}
      onFocus={opts.onFocus}
    />
  );
  act(() => {
    root.render(node());
  });
  return {
    host,
    rerender: (next?: MachineState) => {
      if (next) current = next;
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

function sectionByTitle(host: HTMLElement, title: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>(".inspector-section")].find(
    (section) => section.querySelector(".inspector-section__title")?.textContent === title,
  );
  if (!found) throw new Error(`missing inspector section: ${title}`);
  return found;
}

function rowValue(scope: HTMLElement, label: string): string {
  const row = [...scope.querySelectorAll<HTMLElement>(".panel__row")].find(
    (item) => item.querySelector("dt")?.textContent === label,
  );
  if (!row) throw new Error(`missing row: ${label}`);
  return row.querySelector("dd")?.textContent ?? "";
}

function constraintTexts(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>(".inspector-note--constraint")].map(
    (note) => note.textContent ?? "",
  );
}

function constraintHeads(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>(".inspector-constraint__summary")].map(
    (node) => node.textContent ?? "",
  );
}

function focusFace(host: HTMLElement, kind: "source" | "route" | "power"): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>(`[data-focus="${kind}"]`);
}

function actionFaces(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".panel__actions > .icon-btn")];
}

function contextTab(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>(".inspector-context__btn")].find(
    (node) => node.textContent === label,
  );
  if (!found) throw new Error(`missing context tab: ${label}`);
  return found;
}

function click(node: HTMLElement) {
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// Unmount every root before the next beforeEach resets the logistics bridge, so a
// still-subscribed RouteControls never receives a notification outside act().
afterEach(() => {
  act(() => {
    for (const root of mountedRoots) root.unmount();
  });
  mountedRoots.length = 0;
});

describe("T18 U05 — inspector production rows equal the engine's numbers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
    resetLogisticsView();
  });

  it("prints the exact measured rate window from seeded counters", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    // Test-only counter seeding: a 60 s window (600 ticks) that completed 30 batches.
    machine.rateAge = 700;
    machine.rateAgePrev = 100;
    machine.rateFrom = 45;
    machine.rateFromPrev = 15;
    expect(rateReading(machine)).toEqual({ rate: 0.5, windowSeconds: 60 });
    const { host } = mountPanel(state, machine);
    const production = sectionByTitle(host, COPY.sections.production);
    expect(rowValue(production, t("row.actualRate"))).toBe("0.50 batches/s · 60s window");
  });

  it("live yard: actual/max rate, recipe quantities, buffers and diagnosis all match the engine", () => {
    const state = liveSorterYard();
    const machine = state.machines[0];
    const reading = rateReading(machine);
    expect(reading.rate).toBeGreaterThan(0);
    const { host } = mountPanel(state, machine);
    const production = sectionByTitle(host, COPY.sections.production);
    const recipeSection = sectionByTitle(host, COPY.sections.recipe);
    const bottleneck = sectionByTitle(host, COPY.sections.bottleneck);
    const recipe = RECIPES[BLUEPRINTS.sorter.recipeId];
    const maxRate = 10000 / machine.batchMilli;
    expect(rowValue(production, t("row.actualRate"))).toBe(
      t("value.actualRate", {
        rate: formatRate(reading.rate),
        window: formatWholeSeconds(reading.windowSeconds),
      }),
    );
    expect(rowValue(production, t("row.maxRate"))).toBe(
      t("value.maxRate", { rate: formatRate(maxRate) }),
    );
    // The sorter's 4 s batch is 0.25 batches/s at full power — the engine's own arithmetic.
    expect(maxRate).toBe(0.25);
    expect(rowValue(production, t("row.inBuffer"))).toBe(
      `${formatNumber(machine.inBufUnits)}/${inputCapacityOf(machine, researchBonus(state).inputBuffer)}`,
    );
    expect(rowValue(production, t("row.tray"))).toBe(
      `${formatNumber(machine.trayUnits)}/${BLUEPRINTS.sorter.outputBuffer}`,
    );
    expect(rowValue(recipeSection, t("row.inputs"))).toBe(
      recipe.inputs
        .map((item) => t("value.recipeItem", { qty: item.qty, label: RESOURCE_LABEL[item.resource] }))
        .join(t("value.comma")),
    );
    expect(rowValue(recipeSection, t("row.outputs"))).toBe(
      recipe.outputs
        .map((item) => t("value.recipeItem", { qty: item.qty, label: RESOURCE_LABEL[item.resource] }))
        .join(t("value.comma")),
    );
    const diagnosis = diagnoseMachine(state, machine);
    expect(rowValue(bottleneck, t("row.measured"))).toBe(diagnosis.evidence);
    expect(rowValue(bottleneck, t("row.nextStep"))).toBe(diagnosis.advice);
  });

  it("power-capped yard prints the capped rate and the exact power constraint", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    // Test-only: one running batch so requestedPower measures this machine's draw.
    machine.progress = 1;
    expect(requestedPower(state)).toBe(machine.batchPower);
    const { host } = mountPanel(state, machine, { powerRatio: 0.6 });
    const production = sectionByTitle(host, COPY.sections.production);
    const maxRate = 10000 / machine.batchMilli;
    expect(rowValue(production, COPY.rows.powerCappedRate)).toBe(
      `${formatRate(maxRate * 0.6)} batches/s`,
    );
    expect(rowValue(production, COPY.rows.powerCappedRate)).toBe("0.15 batches/s");
    expect(rowValue(production, t("row.power"))).toBe(
      t("value.powerUnits", {
        count: machine.batchPower,
        units: plural(machine.batchPower, t("unit.unit")),
      }) + t("value.powerLimited", { percent: wholePercent(0.6) }),
    );
    expect(constraintTexts(host)).toContain(
      `${COPY.constraints.power} ${formatNumber(requestedPower(state))}/${TUNING.yardPowerCapacity} · 60% ${COPY.constraints.powerEnd}`,
    );
    expect(constraintHeads(host)).toContain(COPY.constraintHeads.power);
  });

  it("starved yard prints the exact missing-input sentence with the engine's shortfall", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    // Test-only scenario: the engine's starved state with an empty buffer.
    machine.status = "starved";
    const { host } = mountPanel(state, machine);
    const bottleneck = sectionByTitle(host, COPY.sections.bottleneck);
    expect(constraintTexts(host)).toContain(
      `${COPY.constraints.missingInput} 2 ${resourceWord("scrap")}. ${COPY.constraints.missingInputEnd}`,
    );
    expect(constraintHeads(host)).toContain(COPY.constraintHeads.missingInput);
    expect(rowValue(bottleneck, t("row.needs"))).toBe(
      t("value.recipeItem", { qty: 2, label: RESOURCE_LABEL["scrap"] }),
    );
    const diagnosis = diagnoseMachine(state, machine);
    expect(rowValue(bottleneck, t("row.measured"))).toBe(diagnosis.evidence);
    expect(rowValue(bottleneck, t("row.nextStep"))).toBe(diagnosis.advice);
  });

  it("full tray prints the exact output-full sentence with the engine's occupancy", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    // Test-only scenario: a full tray of 12 units against the 12-unit output buffer.
    machine.status = "outputFull";
    machine.trayUnits = 12;
    const { host } = mountPanel(state, machine);
    expect(constraintTexts(host)).toContain(
      `${COPY.constraints.fullOutput} 12/${BLUEPRINTS.sorter.outputBuffer}. ${COPY.constraints.fullOutputEnd}`,
    );
    expect(constraintHeads(host)).toContain(COPY.constraintHeads.fullOutput);
  });

  it("busy output belt prints the exact transport-limit sentence for the busiest DERIVED output", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    machine.status = "running";
    const outputs = state.routes.filter((route) => route.from.id === machine.id);
    expect(outputs.length).toBe(2);
    // Test-only utilisation: first output 90% busy, second 10% — the note must name 90%.
    outputs[0].busyTicks = 90;
    outputs[0].ageTicks = 100;
    outputs[1].busyTicks = 10;
    outputs[1].ageTicks = 100;
    const { host } = mountPanel(state, machine);
    expect(constraintTexts(host)).toContain(
      `${COPY.constraints.busyLink} 90% ${COPY.constraints.busyLinkEnd}`,
    );
    expect(constraintHeads(host)).toContain(COPY.constraintHeads.busyLink);
  });

  it("isolated machine prints the no-links sentence", () => {
    const state = isolatedSorterYard();
    const machine = state.machines[0];
    const { host } = mountPanel(state, machine);
    expect(constraintTexts(host)).toContain(COPY.constraints.noLinks);
    expect(constraintHeads(host)).toContain(COPY.constraintHeads.noLinks);
  });
});

describe("T18 U06 — focus derivations are pure and exact", () => {
  beforeEach(() => {
    resetLogisticsView();
  });

  it("focusSource names the dock store when it holds the missing input", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    machine.status = "starved";
    expect(focusSource(state, machine)).toEqual({ tile: DOCK_TILE, label: t("value.dockStore") });
  });

  it("focusSource falls back to the first OTHER producer when the store is empty", () => {
    const state = sorterAndFurnaceYard();
    const furnace = state.machines[1];
    furnace.status = "starved";
    state.store["ferrous"] = 0;
    const sorter = state.machines[0];
    expect(focusSource(state, furnace)).toEqual({
      tile: sorter.tile,
      label: BLUEPRINTS.sorter.label.toLocaleLowerCase(),
    });
  });

  it("focusSource is null when the yard holds no supplier at all", () => {
    const state = createInitialState();
    state.tutorial = 9;
    state.store["scrap"] = 300;
    // Fund the furnace build (scrap 10 + ferrous 5), then drain the only input it eats.
    state.store["ferrous"] = 20;
    state.storeUnits = 320;
    expect(send(state, { type: "machine.build", blueprint: "furnace", tile: 9 })).toBe(true);
    const furnace = state.machines[0];
    furnace.status = "starved";
    state.store["ferrous"] = 0;
    expect(focusSource(state, furnace)).toBeNull();
  });

  it("focusSource targets the FIRST MISSING input, not the first recipe input", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    // A recipe with two inputs whose second input is not a sorter output, so the
    // single-sorter yard has no producer for it. Test-only blueprint swap: the
    // derivation reads only the recipe table and the buffer.
    const multi = Object.values(BLUEPRINTS).find((def) => {
      const inputs = RECIPES[def.recipeId].inputs;
      return (
        inputs.length >= 2 &&
        !RECIPES[BLUEPRINTS.sorter.recipeId].outputs.some((out) => out.resource === inputs[1].resource)
      );
    });
    expect(multi).toBeDefined();
    const recipe = RECIPES[multi!.recipeId];
    const target: MachineState = {
      ...machine,
      blueprint: multi!.id,
      status: "starved",
      inBuf: { [recipe.inputs[0].resource]: recipe.inputs[0].qty },
    };
    state.store[recipe.inputs[0].resource] = 0;
    state.store[recipe.inputs[1].resource] = 5;
    // First input is satisfied; the second is missing and held by the store.
    expect(focusSource(state, target)).toEqual({ tile: DOCK_TILE, label: t("value.dockStore") });
    state.store[recipe.inputs[1].resource] = 0;
    expect(focusSource(state, target)).toBeNull();
  });

  it("focusRoute picks the busiest derived output, centers its run, and names its endpoints", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    const outputs = state.routes.filter((route) => route.from.id === machine.id);
    const input = state.routes.find((route) => route.to.id === machine.id);
    expect(input).toBeDefined();
    outputs[0].busyTicks = 90;
    outputs[0].ageTicks = 100;
    outputs[1].busyTicks = 10;
    outputs[1].ageTicks = 100;
    input!.busyTicks = 50;
    input!.ageTicks = 100;
    const focus = focusRoute(state, machine);
    expect(focus).not.toBeNull();
    expect(focus!.routeId).toBe(outputs[0].id);
    const run = outputs[0].run!;
    expect(run.length).toBeGreaterThan(0);
    expect(focus!.tile).toBe(run[Math.floor(run.length / 2)]);
    expect(focus!.label).toBe(
      `${endpointName(state, outputs[0].from.id)} ${COPY.recipe.arrow} ${endpointName(state, outputs[0].to.id)}`,
    );
  });

  it("focusRoute keeps the FIRST candidate on a tie (deterministic)", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    const outputs = state.routes.filter((route) => route.from.id === machine.id);
    for (const route of outputs) {
      route.busyTicks = 50;
      route.ageTicks = 100;
    }
    expect(focusRoute(state, machine)!.routeId).toBe(outputs[0].id);
  });

  it("focusRoute falls back to input links, and to the machine's own cell for legacy belts", () => {
    const state = createInitialState();
    state.tutorial = 9;
    state.store["scrap"] = 300;
    state.storeUnits = 300;
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 })).toBe(true);
    const machine = state.machines[0];
    expect(send(state, { type: "route.connect", from: 0, to: machine.id, filter: "scrap" })).toBe(true);
    const input = state.routes[0];
    input.busyTicks = 40;
    input.ageTicks = 100;
    const focus = focusRoute(state, machine);
    expect(focus!.routeId).toBe(input.id);
    expect(focus!.label).toBe(
      `${endpointName(state, 0)} ${COPY.recipe.arrow} ${endpointName(state, machine.id)}`,
    );
    // Test-only legacy shape: a belt saved before runs existed has no `run`.
    delete input.run;
    expect(focusRoute(state, machine)!.tile).toBe(machine.tile);
  });

  it("focusRoute is null with no links", () => {
    const state = isolatedSorterYard();
    expect(focusRoute(state, state.machines[0])).toBeNull();
  });
});

describe("T18 U06 — focus faces never lose the selected machine", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
    resetLogisticsView();
  });

  it("source face pans to the dock store: no dispatch, no close, selection intact", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    machine.status = "starved";
    const dispatch = vi.fn((command: Command) => applyCommand(state, command));
    const onClose = vi.fn();
    const onFocus = vi.fn();
    const { host } = mountPanel(state, machine, { dispatch, onClose, onFocus });
    const face = focusFace(host, "source");
    expect(face).not.toBeNull();
    expect(face!.textContent).toBe(`${COPY.focus.source} · ${t("value.dockStore")}`);
    const titleBefore = host.querySelector(".panel__title")?.textContent;
    const ariaBefore = host.querySelector(".panel")?.getAttribute("aria-label");
    click(face!);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith(DOCK_TILE);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector(".panel__title")?.textContent).toBe(titleBefore);
    expect(host.querySelector(".panel")?.getAttribute("aria-label")).toBe(ariaBefore);
    expect(rowValue(sectionByTitle(host, COPY.sections.identity), COPY.rows.cell)).toBe("8");
    // The focus row is presentation, not a command face: outside .panel__actions,
    // the seven-section contract holds, and the hint says the machine stays selected.
    expect(host.querySelectorAll(".inspector-section").length).toBe(7);
    expect(host.querySelector(".panel__actions")?.querySelector("[data-focus]")).toBeNull();
    expect(actionFaces(host).length).toBe(3);
    expect(host.querySelector(".inspector-focus .inspector-note")?.textContent).toBe(COPY.focus.hint);
  });

  it("route face highlights the busiest belt through the view bridge and pans to it", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    machine.status = "running";
    const outputs = state.routes.filter((route) => route.from.id === machine.id);
    outputs[0].busyTicks = 90;
    outputs[0].ageTicks = 100;
    outputs[1].busyTicks = 10;
    outputs[1].ageTicks = 100;
    const expected = focusRoute(state, machine)!;
    const dispatch = vi.fn((command: Command) => applyCommand(state, command));
    const onClose = vi.fn();
    const onFocus = vi.fn();
    const { host } = mountPanel(state, machine, { dispatch, onClose, onFocus });
    const face = focusFace(host, "route");
    expect(face).not.toBeNull();
    expect(face!.textContent).toBe(`${COPY.focus.route} · ${expected.label}`);
    expect(getLogisticsView().focusedRouteId).toBeNull();
    click(face!);
    expect(getLogisticsView().focusedRouteId).toBe(expected.routeId);
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith(expected.tile);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector(".panel__title")?.textContent).toBe(BLUEPRINTS.sorter.label);
  });

  it("power face opens the power pane, survives a manual close, and re-opens on the next tap", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    machine.progress = 1;
    const dispatch = vi.fn((command: Command) => applyCommand(state, command));
    const onClose = vi.fn();
    const onFocus = vi.fn();
    const { host } = mountPanel(state, machine, { powerRatio: 0.6, dispatch, onClose, onFocus });
    const face = focusFace(host, "power");
    expect(face).not.toBeNull();
    expect(face!.textContent).toBe(COPY.focus.power);
    const powerTab = contextTab(host, COPY.context.power);
    expect(powerTab.getAttribute("aria-pressed")).toBe("false");
    click(face!);
    expect(powerTab.getAttribute("aria-pressed")).toBe("true");
    const pane = host.querySelector(".inspector-context__pane");
    expect(pane).not.toBeNull();
    expect(rowValue(pane as HTMLElement, COPY.rows.requested)).toBe(
      `${formatNumber(requestedPower(state))}/${TUNING.yardPowerCapacity}`,
    );
    expect(rowValue(pane as HTMLElement, COPY.rows.thisMachine)).toBe(
      t("value.powerUnits", {
        count: machine.batchPower,
        units: plural(machine.batchPower, t("unit.unit")),
      }),
    );
    expect(rowValue(pane as HTMLElement, COPY.rows.speed)).toBe(
      t("value.percent", { percent: wholePercent(0.6) }),
    );
    // The player closes the pane manually; the same face must re-open it (seq bump).
    click(powerTab);
    expect(powerTab.getAttribute("aria-pressed")).toBe("false");
    click(face!);
    expect(powerTab.getAttribute("aria-pressed")).toBe("true");
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
    expect(host.querySelector(".panel__title")?.textContent).toBe(BLUEPRINTS.sorter.label);
  });

  it("producer source face pans to the producing machine's cell", () => {
    const state = sorterAndFurnaceYard();
    const furnace = state.machines[1];
    furnace.status = "starved";
    state.store["ferrous"] = 0;
    const sorter = state.machines[0];
    const dispatch = vi.fn((command: Command) => applyCommand(state, command));
    const onClose = vi.fn();
    const onFocus = vi.fn();
    const { host } = mountPanel(state, furnace, { dispatch, onClose, onFocus });
    const face = focusFace(host, "source");
    expect(face).not.toBeNull();
    expect(face!.textContent).toBe(
      `${COPY.focus.source} · ${BLUEPRINTS.sorter.label.toLocaleLowerCase()}`,
    );
    click(face!);
    expect(onFocus).toHaveBeenCalledWith(sorter.tile);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(host.querySelector(".panel__title")?.textContent).toBe(BLUEPRINTS.furnace.label);
  });

  it("no focus row when nothing is constrained: running, linked-free, full power", () => {
    const state = isolatedSorterYard();
    const machine = state.machines[0];
    // Test-only scenario: a running machine with no links and an uncapped yard.
    machine.status = "running";
    const { host } = mountPanel(state, machine, { powerRatio: 1 });
    expect(host.querySelector(".inspector-focus")).toBeNull();
    expect(focusFace(host, "source")).toBeNull();
    expect(focusFace(host, "route")).toBeNull();
    expect(focusFace(host, "power")).toBeNull();
  });

  it("constraint cards rendered equal the pure read model for the same state", () => {
    const state = linkedSorterYard();
    const machine = state.machines[0];
    machine.status = "starved";
    machine.progress = 1;
    const { host } = mountPanel(state, machine, { powerRatio: 0.6 });
    const cards = constraintCards(state, machine, 0.6);
    expect(constraintTexts(host)).toEqual(cards.map((card) => card.detail));
    expect(constraintHeads(host)).toEqual(cards.map((card) => card.short));
  });
});

describe("T18 U06 — the focus pan is the gesture clamp, and refits keep the intent", () => {
  it("tileToWorld maps the dock and yard cells the focus faces target", () => {
    expect(tileToWorld(DOCK_TILE)).toEqual({ x: 2 * CELL + CELL / 2, y: CELL / 2 });
    expect(tileToWorld(8)).toEqual({ x: 2 * CELL + CELL / 2, y: CELL + CELL / 2 });
  });

  it("centers an interior cell exactly, pins edge cells to the pan limits, keeps the zoom", () => {
    const view: ViewState = { width: 390, height: 844 };
    const fitted = fitCamera(view);
    const scale = 4;
    // Top-down half-extents at scale 4 on a 390x844 view.
    const hx = view.width / (2 * scale);
    const hy = view.height / (2 * scale);
    expect(hx).toBeLessThan(WORLD_W / 2);
    expect(hy).toBeLessThan(WORLD_H / 2);
    const focusOn = (tile: number): Camera => {
      const world = tileToWorld(tile);
      return clampCamera({ x: world.x, y: world.y, scale }, view, fitted);
    };
    // Tile 21 is the yard interior (col 3, row 3): the camera centers it exactly.
    const interior = focusOn(21);
    expect(interior).toEqual({ x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2, scale });
    // Tile 0 is the top-left corner: both axes pin to the near pan limit.
    expect(focusOn(0)).toEqual({ x: hx, y: hy, scale });
    // Tile 35 is the bottom-right corner: both axes pin to the far pan limit.
    expect(focusOn(35)).toEqual({ x: WORLD_W - hx, y: WORLD_H - hy, scale });
    // The fitted (whole-world) view pins both axes: focus cannot pan past the fit.
    const wide = clampCamera({ x: 0, y: 0, scale: fitted.scale }, view, fitted);
    expect(wide.x).toBe(fitted.x);
    expect(wide.y).toBe(fitted.y);
    expect(wide.scale).toBe(fitted.scale);
  });

  it("refit keeps the focus intent across a resize; dropping intent returns the fit", () => {
    const view: ViewState = { width: 390, height: 844 };
    const fitted = fitCamera(view);
    const world = tileToWorld(21);
    const focused = clampCamera({ x: world.x, y: world.y, scale: 4 }, view, fitted);
    const view2: ViewState = { width: 844, height: 390 };
    const fitted2 = fitCamera(view2);
    const kept = refitCamera(focused, fitted2, view2, true);
    expect(kept).toEqual(clampCamera(focused, view2, fitted2));
    // Landscape: the x axis now sees the whole world (pinned to the fit), while the
    // y axis still pans — the focused row survives the resize.
    expect(kept.x).toBe(fitted2.x);
    expect(kept.y).toBe(world.y);
    expect(kept.scale).toBe(4);
    expect(refitCamera(focused, fitted2, view2, false)).toEqual({ ...fitted2 });
  });
});
