import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import inspectorRaw from "../../src/ui/inspector/inspector.css?raw";
import { MachinePanel } from "../../src/ui/Panels";
import { COPY } from "../../src/ui/inspector/copy";
import {
  constraintNotes,
  powerContext,
  primaryActionNote,
  recipeFlow,
  routesContext,
  storageContext,
} from "../../src/ui/inspector/model";
import { BLUEPRINTS, RECIPES, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  refundOf,
  upgradeCost,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { createInitialState, type MachineState, type SimState } from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { rateReading, requestedPower } from "../../src/game/simulation/diagnostics";
import { RESOURCE_LABEL, STATUS_LABEL, beltExtentLine, nextFreeTile } from "../../src/ui/text";
import {
  formatNumber,
  formatRate,
  formatWholeSeconds,
  plural,
  resourceWord,
  t,
  unit,
  wholePercent,
} from "../../src/game/content/strings";

/**
 * UI-RESET-54 (G2 wave 3): the machine inspector replaces the text dump with named
 * sections, actual-vs-potential rates, plain-language bottleneck explanations, a named
 * primary action with its cost and consequence, and in-panel recovery context that never
 * loses the machine selection.
 *
 * Fixture economy note: `yardWithASorter` mirrors the shipped panel-rows fixture — six
 * salvage pulses fund the drone repair, and the repaired drone then delivers wreck scrap
 * every `droneDeliveryTicks` (engine `updateUnit`), which is what funds the 20-scrap
 * sorter during `advance(262)`. All state mutations below happen in this test file only;
 * every action under test goes through the real UI path: click → dispatch → applyCommand
 * → state change, with the printed number checked against the engine's own arithmetic.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 5400;
function send(state: SimState, command: CommandBody): unknown {
  return applyCommand(state, { ...command, id: `i54-${(seq += 1)}` } as Command);
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

/**
 * The same yard with the second output link laid: a two-output recipe needs one link
 * per material (autoconnect), so only this fixture has no pending plans and Upgrade
 * is the accent-named primary.
 */
function yardWithAFullyLinkedSorter(): SimState {
  const state = yardWithASorter();
  const sorter = state.machines[0];
  send(state, { type: "route.connect", from: sorter.id, to: 0, filter: "nonferrous" });
  advance(state, 30);
  return state;
}

/** One isolated sorter: no links, empty buffer — the starved/no-transport case. */
function yardWithAnIsolatedSorter(): SimState {
  const state = yardWithASorter();
  const sorter = state.machines[0];
  state.routes = [];
  sorter.inRoutes = [];
  sorter.outRoute = null;
  sorter.inBuf = {};
  sorter.inBufUnits = 0;
  sorter.trayUnits = 0;
  sorter.status = "starved";
  return state;
}

function render(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

function mountPanel(
  state: SimState,
  machine: MachineState,
  opts: { powerRatio?: number; dispatch?: (command: Command) => unknown; onClose?: () => void } = {},
): HTMLElement {
  return render(
    <MachinePanel
      state={state}
      machine={machine}
      tick={state.tick}
      powerRatio={opts.powerRatio ?? state.powerRatio}
      dispatch={opts.dispatch ?? ((command) => applyCommand(state, command))}
      onClose={opts.onClose ?? (() => undefined)}
    />,
  );
}

function injectSheets() {
  for (const raw of [stylesRaw, inspectorRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
}

function sections(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(".inspector-section")];
}

function sectionByTitle(host: HTMLElement, title: string): HTMLElement {
  const found = sections(host).find(
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

function actionFaces(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".panel__actions > .icon-btn")];
}

function constraintTexts(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>(".inspector-note--constraint")].map(
    (note) => note.textContent ?? "",
  );
}

/** The same raw-key census the shipped i18n gate runs over painted text. */
const KEY_PATTERN =
  /\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/;

describe("UI-RESET-54 inspector sections", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("paints seven named sections in reading order inside the preserved panel root", () => {
    const state = yardWithASorter();
    const host = mountPanel(state, state.machines[0]);
    const root = host.querySelector<HTMLElement>(".panel");
    expect(root?.className).toContain("panel--stack");
    expect(root?.getAttribute("role")).toBe("group");
    expect(host.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "Scrap sorter details",
    );
    expect(sections(host).map((s) => s.querySelector("h3")?.textContent)).toEqual([
      COPY.sections.identity,
      COPY.sections.recipe,
      COPY.sections.production,
      COPY.sections.bottleneck,
      COPY.sections.transport,
      COPY.sections.recovery,
      COPY.sections.actions,
    ]);
    // Every section is its own landmark with its own heading, not one flat dump.
    for (const section of sections(host)) {
      expect(section.tagName).toBe("SECTION");
      expect(section.querySelectorAll(".inspector-section__title").length).toBe(1);
    }
  });

  it("keeps identity/status, the recipe flow and the production rows in their own sections", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const host = mountPanel(state, machine);

    const identity = sectionByTitle(host, COPY.sections.identity);
    expect(rowValue(identity, t("row.status"))).toBe(STATUS_LABEL[machine.status]);
    expect(rowValue(identity, t("row.level"))).toBe(String(machine.level));
    expect(rowValue(identity, COPY.rows.cell)).toBe(String(machine.tile));

    const recipeSection = sectionByTitle(host, COPY.sections.recipe);
    const flow = recipeSection.querySelector(".inspector-flow");
    expect(flow?.textContent).toBe(recipeFlow(machine));
    expect(flow?.textContent).toContain("→");
    expect(rowValue(recipeSection, t("row.inputs"))).toBe("2 Scrap");
    expect(rowValue(recipeSection, t("row.outputs"))).toBe("1 Ferrous, 1 Nonferrous");

    const production = sectionByTitle(host, COPY.sections.production);
    const reading = rateReading(machine);
    expect(rowValue(production, t("row.actualRate"))).toBe(
      t("value.actualRate", {
        rate: formatRate(reading.rate),
        window: formatWholeSeconds(reading.windowSeconds),
      }),
    );
    const maxRate = 10000 / machine.batchMilli;
    expect(rowValue(production, t("row.maxRate"))).toBe(
      t("value.maxRate", { rate: formatRate(maxRate) }),
    );
    const bar = production.querySelector<HTMLElement>(".inspector-progress");
    const percent = Math.min(100, Math.round((machine.progress / Math.max(1, machine.batchMilli)) * 100));
    expect(bar?.getAttribute("role")).toBe("progressbar");
    expect(bar?.getAttribute("aria-valuenow")).toBe(String(percent));
    expect(bar?.getAttribute("aria-valuemin")).toBe("0");
    expect(bar?.getAttribute("aria-valuemax")).toBe("100");
    expect(
      production.querySelector<HTMLElement>(".inspector-progress__fill")?.style.width,
    ).toBe(`${percent}%`);
    expect(rowValue(production, t("row.batch"))).toBe(t("value.percent", { percent }));

    const bottleneck = sectionByTitle(host, COPY.sections.bottleneck);
    expect(rowValue(bottleneck, t("row.measured"))).toContain("Working ");
    expect(rowValue(bottleneck, t("row.nextStep"))).not.toBe("");

    const actions = sectionByTitle(host, COPY.sections.actions);
    expect(rowValue(actions, t("row.nextUpgrade"))).toContain("→");
  });

  it("shows actual, max and power-capped rates with units when the yard is power limited", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    machine.progress = Math.max(1, machine.progress);
    state.powerRatio = 0.5;
    const host = mountPanel(state, machine, { powerRatio: 0.5 });
    const production = sectionByTitle(host, COPY.sections.production);
    const maxRate = 10000 / machine.batchMilli;
    expect(rowValue(production, COPY.rows.powerCappedRate)).toBe(
      `${formatRate(maxRate * 0.5)} batches/s`,
    );
    expect(rowValue(production, t("row.power"))).toBe(
      t("value.powerUnits", {
        count: machine.batchPower,
        units: plural(machine.batchPower, t("unit.unit")),
      }) + t("value.powerLimited", { percent: 50 }),
    );
    const notes = constraintTexts(host);
    expect(notes.some((note) => note.includes("Power limited: the yard requests"))).toBe(true);
    const powerNote = notes.find((note) => note.includes("Power limited")) ?? "";
    expect(powerNote).toContain(`${requestedPower(state)}/${TUNING.yardPowerCapacity}`);
    expect(powerNote).toContain("50%");
  });

  it("omits the power-capped row at full power", () => {
    const state = yardWithASorter();
    const host = mountPanel(state, state.machines[0], { powerRatio: 1 });
    const labels = [...host.querySelectorAll(".panel__row dt")].map((dt) => dt.textContent);
    expect(labels).not.toContain(COPY.rows.powerCappedRate);
    expect(constraintTexts(host).some((note) => note.includes("Power limited"))).toBe(false);
  });
});

describe("UI-RESET-54 bottleneck explanations", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("explains missing input with the exact shortfall and shows the Needs row", () => {
    const state = yardWithAnIsolatedSorter();
    const machine = state.machines[0];
    const host = mountPanel(state, machine);
    const notes = constraintTexts(host);
    expect(notes[0]).toBe(
      `${COPY.constraints.missingInput} 2 ${resourceWord("scrap")}. ${COPY.constraints.missingInputEnd}`,
    );
    const bottleneck = sectionByTitle(host, COPY.sections.bottleneck);
    expect(rowValue(bottleneck, t("row.needs"))).toBe("2 Scrap");
    // No laid links: the constraint says the machine is isolated, and Transport offers
    // the missing belt through the pending Connect plans instead of empty extent rows.
    const transport = sectionByTitle(host, COPY.sections.transport);
    expect(transport.textContent).toContain(t("row.nextLink"));
    expect(notes.some((note) => note === COPY.constraints.noLinks)).toBe(true);
  });

  it("explains a full output tray with its printed fill", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    machine.trayUnits = BLUEPRINTS.sorter.outputBuffer;
    machine.status = "outputFull";
    const host = mountPanel(state, machine);
    const notes = constraintTexts(host);
    expect(notes.some((note) =>
      note === `${COPY.constraints.fullOutput} 12/12. ${COPY.constraints.fullOutputEnd}`,
    )).toBe(true);
  });

  it("explains a busy output link once it caps throughput", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const outRoute = state.routes.find((route) => route.id === machine.outRoute);
    expect(outRoute).toBeDefined();
    if (!outRoute) return;
    outRoute.busyTicks = 90;
    outRoute.ageTicks = 100;
    const host = mountPanel(state, machine);
    expect(constraintTexts(host).some((note) =>
      note === `${COPY.constraints.busyLink} 90% ${COPY.constraints.busyLinkEnd}`,
    )).toBe(true);
  });

  it("explains a missing output link while an input link exists", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const outId = machine.outRoute;
    state.routes = state.routes.filter((route) => route.id !== outId);
    machine.outRoute = null;
    const host = mountPanel(state, machine);
    expect(constraintTexts(host)).toContain(COPY.constraints.noOutputLink);
  });

  it("prints no constraint notes for a fed, linked, full-power machine", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    machine.status = "running";
    machine.trayUnits = 0;
    for (const route of state.routes) {
      route.busyTicks = 0;
      route.ageTicks = 100;
    }
    const host = mountPanel(state, machine, { powerRatio: 1 });
    expect(constraintTexts(host)).toEqual([]);
  });
});

describe("UI-RESET-54 actions: primary cost, consequence and real command paths", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("names Upgrade primary with its printed credit cost and batch consequence", () => {
    const state = yardWithAFullyLinkedSorter();
    const machine = state.machines[0];
    expect(planConnections(state, machine.id)).toEqual([]);
    const host = mountPanel(state, machine);
    const faces = actionFaces(host);
    expect(faces.map((face) => face.textContent?.split(" ·")[0])).toEqual([
      "Upgrade",
      "Move",
      "Dismantle",
    ]);
    const cost = upgradeCost(BLUEPRINTS.sorter.baseUpgradeCost, machine.level);
    expect(faces[0].textContent).toBe(t("btn.upgradeCost", { cost: unit(cost, t("unit.credit")) }));
    // Exactly one accent-filled primary: the shipped CSS accents the first child only.
    const ACCENT_SELECTOR = ".panel__actions > .icon-btn:first-child";
    expect(faces.filter((face) => face.matches(ACCENT_SELECTOR))).toHaveLength(1);
    expect(faces[0].matches(ACCENT_SELECTOR)).toBe(true);
    const note = host.querySelector(".inspector-actions-note");
    expect(note?.textContent).toBe(COPY.actions.upgradePrimary);
    expect(host.querySelector(".inspector-actions-note--secondary")?.textContent).toBe(
      COPY.actions.secondary,
    );
    const actions = sectionByTitle(host, COPY.sections.actions);
    expect(rowValue(actions, t("row.nextUpgrade"))).toContain(unit(cost, t("unit.credit")));
  });

  it("names Connect primary with belt tiles and scrap cost while links are pending", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const outId = machine.outRoute;
    state.routes = state.routes.filter((route) => route.id !== outId);
    machine.outRoute = null;
    const plans = planConnections(state, machine.id);
    expect(plans.length).toBeGreaterThan(0);
    const host = mountPanel(state, machine);
    const faces = actionFaces(host);
    expect(faces[0].textContent).toBe(t("btn.connect"));
    const tiles = plans.reduce((total, plan) => total + plan.tiles, 0);
    expect(host.querySelector(".inspector-actions-note")?.textContent).toBe(
      `${COPY.actions.connectPrimary} ${unit(tiles, "tile")} · ${formatNumber(beltCost(tiles))} ${resourceWord("scrap")} ${COPY.actions.connectPrimaryEnd}`,
    );
    const transport = sectionByTitle(host, COPY.sections.transport);
    expect(rowValue(transport, t("row.nextLink"))).toContain("carries");
  });

  it("Upgrade click spends exactly the printed credits and shortens the batch", () => {
    const state = yardWithAFullyLinkedSorter();
    const machine = state.machines[0];
    state.credits = 500;
    const host = mountPanel(state, machine);
    const face = actionFaces(host)[0];
    const printed = /^Upgrade · (\d+) credits$/.exec(face.textContent ?? "");
    expect(printed).not.toBeNull();
    const cost = Number(printed?.[1]);
    const beforeMilli = machine.batchMilli;
    const beforeLevel = machine.level;
    act(() => face.click());
    expect(machine.level).toBe(beforeLevel + 1);
    expect(machine.batchMilli).toBeLessThan(beforeMilli);
    expect(state.credits).toBe(500 - cost);
  });

  it("Move click re-cells the machine for exactly the printed scrap charge", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const host = mountPanel(state, machine);
    const face = actionFaces(host).find((item) => item.textContent?.startsWith("Move"));
    const printed = /^Move · cell (\d+) · (\d+) units$/.exec(face?.textContent ?? "");
    expect(printed).not.toBeNull();
    const tile = Number(printed?.[1]);
    const charge = Number(printed?.[2]);
    expect(tile).toBe(nextFreeTile(state));
    const scrapBefore = state.store.scrap ?? 0;
    const routeIds = state.routes.map((route) => route.id);
    act(() => face?.click());
    expect(machine.tile).toBe(tile);
    expect(machine.level).toBe(1);
    expect(state.machines.length).toBe(1);
    expect(state.routes.map((route) => route.id)).toEqual(routeIds);
    expect((state.store.scrap ?? 0) - scrapBefore).toBe(-charge);
  });

  it("Dismantle click removes the machine and returns exactly the printed units", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const host = mountPanel(state, machine);
    const face = actionFaces(host).find((item) => item.textContent?.startsWith("Dismantle"));
    const printed = /^Dismantle · \+(\d+) units$/.exec(face?.textContent ?? "");
    expect(printed).not.toBeNull();
    const refund = Number(printed?.[1]);
    // The printed refund is the engine's own arithmetic: build refund + tray + buffer +
    // one belt refund per attached link.
    const links = state.routes.filter(
      (route) => route.from.id === machine.id || route.to.id === machine.id,
    );
    const expected =
      BLUEPRINTS.sorter.buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
      machine.trayUnits +
      machine.inBufUnits +
      links.reduce((total, route) => total + refundOf(beltCost(route.run?.length ?? 0)), 0);
    expect(refund).toBe(expected);
    const unitsBefore = state.storeUnits;
    act(() => face?.click());
    expect(state.machines.length).toBe(0);
    expect(state.storeUnits - unitsBefore).toBe(refund);
  });

  it("Connect click lays every pending link through route.connect", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const outId = machine.outRoute;
    state.routes = state.routes.filter((route) => route.id !== outId);
    machine.outRoute = null;
    const plans = planConnections(state, machine.id);
    const routesBefore = state.routes.length;
    const host = mountPanel(state, machine);
    const face = actionFaces(host)[0];
    expect(face.textContent).toBe(t("btn.connect"));
    act(() => face.click());
    expect(state.routes.length).toBe(routesBefore + plans.length);
    expect(machine.outRoute).not.toBeNull();
  });
});

describe("UI-RESET-54 recovery context keeps the selection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  function contextButtons(host: HTMLElement): HTMLButtonElement[] {
    return [...host.querySelectorAll<HTMLButtonElement>(".inspector-context__btn")];
  }

  it("offers Storage, Routes and Power tabs that dispatch nothing and never close", () => {
    const state = yardWithAFullyLinkedSorter();
    const machine = state.machines[0];
    const dispatch = vi.fn();
    const onClose = vi.fn();
    const host = mountPanel(state, machine, { dispatch, onClose });
    const tabs = contextButtons(host);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      COPY.context.storage,
      COPY.context.routes,
      COPY.context.power,
    ]);
    expect(tabs.every((tab) => tab.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(host.querySelector(".inspector-context")?.textContent).toContain(COPY.context.hint);

    act(() => tabs[0].click());
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(tabs[0].getAttribute("aria-pressed")).toBe("true");
    const pane = host.querySelector(".inspector-context__pane");
    expect(pane).not.toBeNull();
    expect(rowValue(host, COPY.rows.capacity)).toBe(
      `${formatNumber(state.storeUnits)}/${state.storeCapacity}`,
    );
    expect(rowValue(host, RESOURCE_LABEL.scrap)).toBe(formatNumber(state.store.scrap ?? 0));
    expect(rowValue(host, COPY.rows.reserve)).toBe(
      t("value.sellFloor", {
        count: TUNING.reserveFloor,
        units: plural(TUNING.reserveFloor, t("unit.unit")),
      }),
    );
    expect(pane?.textContent).toContain(COPY.context.storageHelp);
    // Selection preserved: same root label, same machine title, actions untouched.
    expect(host.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "Scrap sorter details",
    );
    expect(host.querySelector(".panel__title")?.textContent).toBe("Scrap sorter");
    expect(actionFaces(host).length).toBe(3);
    expect(host.querySelector(".panel__actions > .icon-btn:first-child")?.textContent).toContain(
      "Upgrade",
    );

    // Toggle closed again.
    act(() => tabs[0].click());
    expect(tabs[0].getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".inspector-context__pane")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Routes pane lists every attached link with cargo, extent and busyness", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const host = mountPanel(state, machine);
    const tabs = contextButtons(host);
    act(() => tabs[1].click());
    const links = state.routes.filter(
      (route) => route.from.id === machine.id || route.to.id === machine.id,
    );
    expect(links.length).toBe(2);
    for (const route of links) {
      const busy = wholePercent(route.busyTicks / Math.max(1, route.ageTicks));
      const value = rowValue(
        host,
        `${route.from.id === 0 ? t("value.dock") : "scrap sorter"} → ${route.to.id === 0 ? t("value.dock") : "scrap sorter"}`,
      );
      expect(value).toContain(beltExtentLine(route));
      expect(value).toContain(`${busy}% ${COPY.context.busy}`);
    }
    expect(host.querySelector(".inspector-context__pane")?.textContent).toContain(
      COPY.context.routesHelp,
    );
    // The preserved Links row still reads exactly as the belt-extent contract expects.
    expect(rowValue(host, t("row.links"))).toBe(links.map(beltExtentLine).join(t("value.comma")));
  });

  it("Power pane prints the shared budget, this draw and the shared speed", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    machine.progress = Math.max(1, machine.progress);
    state.powerRatio = 0.5;
    const host = mountPanel(state, machine, { powerRatio: 0.5 });
    const tabs = contextButtons(host);
    act(() => tabs[2].click());
    expect(rowValue(host, COPY.rows.requested)).toBe(
      `${formatNumber(requestedPower(state))}/${TUNING.yardPowerCapacity}`,
    );
    expect(rowValue(host, COPY.rows.thisMachine)).toBe(
      t("value.powerUnits", {
        count: machine.batchPower,
        units: plural(machine.batchPower, t("unit.unit")),
      }),
    );
    expect(rowValue(host, COPY.rows.speed)).toBe(t("value.percent", { percent: 50 }));
    expect(host.querySelector(".inspector-context__pane")?.textContent).toContain(
      COPY.context.powerHelp,
    );
  });

  it("Routes pane on an isolated machine says there are no links", () => {
    const state = yardWithAnIsolatedSorter();
    const host = mountPanel(state, state.machines[0]);
    const tabs = contextButtons(host);
    act(() => tabs[1].click());
    expect(host.querySelector(".inspector-context__pane")?.textContent).toContain(
      COPY.context.noLinks,
    );
  });

  it("keeps context buttons at the 44px floor, including at 200% text", () => {
    const state = yardWithASorter();
    const host = mountPanel(state, state.machines[0]);
    const tabs = contextButtons(host);
    for (const tab of tabs) {
      expect(getComputedStyle(tab).minHeight).toBe("44px");
    }
    document.documentElement.style.setProperty("--text-scale", "2");
    for (const tab of tabs) {
      expect(getComputedStyle(tab).minHeight).toBe("44px");
    }
    document.documentElement.style.removeProperty("--text-scale");
  });
});

describe("UI-RESET-54 painted-text hygiene", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  it("paints no NaN, no raw keys and no '1 units' across every section and pane", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    expect(machine.batchPower).toBe(1);
    const host = mountPanel(state, machine);
    const texts = [host.textContent ?? ""];
    const tabs = [...host.querySelectorAll<HTMLButtonElement>(".inspector-context__btn")];
    for (const tab of tabs) {
      act(() => tab.click());
      texts.push(host.textContent ?? "");
      act(() => tab.click());
    }
    for (const text of texts) {
      expect(text).not.toContain("NaN");
      expect(KEY_PATTERN.test(text)).toBe(false);
      expect(/(^|[^0-9])1 units\b/.test(text)).toBe(false);
    }
  });

  it("keeps the panel body as the one declared scroller for long content", () => {
    const state = yardWithASorter();
    const host = mountPanel(state, state.machines[0]);
    const body = host.querySelector<HTMLElement>(".panel__body");
    const style = body ? getComputedStyle(body) : null;
    expect(`${style?.overflow ?? ""} ${style?.overflowY ?? ""}`).toContain("auto");
  });
});

describe("UI-RESET-54 read model (pure)", () => {
  it("recipeFlow prints the input → output line from the recipe table", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const recipe = RECIPES[BLUEPRINTS.sorter.recipeId];
    const side = (items: readonly { resource: keyof typeof RESOURCE_LABEL; qty: number }[]) =>
      items.map((item) => `${item.qty} ${RESOURCE_LABEL[item.resource]}`).join(", ");
    expect(recipeFlow(machine)).toBe(`${side(recipe.inputs)} → ${side(recipe.outputs)}`);
  });

  it("constraintNotes stack in priority order: input, power, transport", () => {
    const state = yardWithAnIsolatedSorter();
    const machine = state.machines[0];
    machine.progress = 1;
    const notes = constraintNotes(state, machine, 0.5);
    expect(notes.length).toBe(3);
    expect(notes[0]).toContain(COPY.constraints.missingInput);
    expect(notes[1]).toContain(COPY.constraints.power);
    expect(notes[2]).toBe(COPY.constraints.noLinks);
  });

  it("storageContext covers the recipe's resources and the reserve floor", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    const context = storageContext(state, machine);
    expect(context.rows[0]).toEqual({
      label: COPY.rows.capacity,
      value: `${formatNumber(state.storeUnits)}/${state.storeCapacity}`,
    });
    const labels = context.rows.map((row) => row.label);
    expect(labels).toContain(RESOURCE_LABEL.scrap);
    expect(labels).toContain(RESOURCE_LABEL.ferrous);
    expect(labels).toContain(RESOURCE_LABEL.nonferrous);
    expect(context.floor).toBe(
      t("value.sellFloor", {
        count: TUNING.reserveFloor,
        units: plural(TUNING.reserveFloor, t("unit.unit")),
      }),
    );
  });

  it("routesContext and powerContext derive every number from the sim", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    machine.progress = 1;
    const routes = routesContext(state, machine);
    expect(routes.rows.length).toBe(2);
    for (const row of routes.rows) {
      expect(row.value).toContain(COPY.context.carries);
      expect(row.value).toContain("% busy");
    }
    const power = powerContext(state, machine, 0.5);
    expect(power.rows[0].value).toBe(
      `${formatNumber(requestedPower(state))}/${TUNING.yardPowerCapacity}`,
    );
    expect(power.rows[2].value).toBe("50%");
  });

  it("primaryActionNote follows the accent: Connect with plans, Upgrade without", () => {
    const state = yardWithASorter();
    const machine = state.machines[0];
    expect(primaryActionNote([])).toBe(COPY.actions.upgradePrimary);
    const outId = machine.outRoute;
    state.routes = state.routes.filter((route) => route.id !== outId);
    machine.outRoute = null;
    const plans = planConnections(state, machine.id);
    const tiles = plans.reduce((total, plan) => total + plan.tiles, 0);
    expect(primaryActionNote(plans)).toBe(
      `${COPY.actions.connectPrimary} ${unit(tiles, "tile")} · ${formatNumber(beltCost(tiles))} ${resourceWord("scrap")} ${COPY.actions.connectPrimaryEnd}`,
    );
  });
});
