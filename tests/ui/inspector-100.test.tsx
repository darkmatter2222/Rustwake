import { describe, expect, it, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import inspectorRaw from "../../src/ui/inspector/inspector.css?raw";
import { MachinePanel } from "../../src/ui/Panels";
import { COPY } from "../../src/ui/inspector/copy";
import { endpointName } from "../../src/ui/inspector/model";
import { BLUEPRINTS, RECIPES, type ResourceId } from "../../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  refundOf,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import {
  createInitialState,
  outputRouteIds,
  type MachineState,
  type SimState,
} from "../../src/game/simulation/types";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { systemTotals, unitTotal } from "../../src/game/simulation/invariants";
import { validateSim } from "../../src/game/persistence/save";
import { dismantleImpact } from "../../src/ui/place/flow";
import { beltExtentLine } from "../../src/ui/text";
import { t } from "../../src/game/content/strings";

/**
 * Issue #100 — the UI face of product decision option (a): a machine registers ALL of
 * its output routes (derived from the route table by `outputRouteIds`). This file locks
 * the three player-facing surfaces the decision requires, for BOTH two-output machines
 * (R01 sorter, R03 copperSeparator):
 *
 * 1. Plural Transport reporting — the busy-link constraint reports the busiest DERIVED
 *    output belt even when the legacy singular mirror names a quiet one, and the
 *    Transport/Routes surfaces list every touching link.
 * 2. `noOutputLink` fires only when the table genuinely holds no output for the machine
 *    (input link present, tray units waiting) — never because a stale mirror is null.
 * 3. Dismantle-preview parity (#54 contract): the printed face equals the engine payout
 *    and the place-flow `dismantleImpact` mirror; the real tap returns exactly the face,
 *    drops EVERY output + input route and conserves units (`systemTotals`/`unitTotal`).
 *
 * Fixture economy: no `advance` anywhere, so belts and buffers start empty and the
 * dismantle delta isolates the refund face. All state mutations live in THIS test file
 * only (documented inline); every action under test goes through the real UI path:
 * click → dispatch → applyCommand → state readback. No src mutation.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 10000;
function send(state: SimState, body: CommandBody): boolean {
  seq += 1;
  return applyCommand(state, { ...body, id: `i100-${seq}` } as Command).ok === true;
}

/**
 * One machine with its input link from the store and BOTH output plans laid through the
 * real planner. Funds every build-cost resource (the separator's build also costs
 * ferrous) with scrap headroom for the belts. No advance: empty cargo everywhere.
 */
function twoOutputYard(blueprint: string, tile = 8): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 300;
  state.store["ferrous"] = 20;
  state.storeUnits = 320;
  expect(send(state, { type: "machine.build", blueprint, tile })).toBe(true);
  const machine = state.machines[state.machines.length - 1];
  const input = RECIPES[BLUEPRINTS[blueprint].recipeId].inputs[0].resource;
  expect(send(state, { type: "route.connect", from: 0, to: machine.id, filter: input })).toBe(true);
  const plans = planConnections(state, machine.id);
  expect(plans.length).toBe(2);
  for (const plan of plans) {
    expect(send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter })).toBe(true);
  }
  return state;
}

/** The same yard with ONLY the input link: the two output plans stay pending. */
function inputOnlyYard(blueprint: string): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.store["scrap"] = 300;
  state.store["ferrous"] = 20;
  state.storeUnits = 320;
  expect(send(state, { type: "machine.build", blueprint, tile: 8 })).toBe(true);
  const machine = state.machines[state.machines.length - 1];
  const input = RECIPES[BLUEPRINTS[blueprint].recipeId].inputs[0].resource;
  expect(send(state, { type: "route.connect", from: 0, to: machine.id, filter: input })).toBe(true);
  expect(planConnections(state, machine.id).length).toBe(2);
  return state;
}

/** Independent all-touching refund arithmetic: what the engine must return on dismantle. */
function allTouchingRefund(state: SimState, machine: MachineState): number {
  const touching = state.routes.filter(
    (route) => route.from.id === machine.id || route.to.id === machine.id,
  );
  return (
    BLUEPRINTS[machine.blueprint].buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
    machine.trayUnits +
    machine.inBufUnits +
    machine.batch.reduce((total, item) => total + item.qty, 0) +
    touching.reduce((total, route) => total + refundOf(beltCost(route.run?.length ?? 0)), 0)
  );
}

function render(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

function mountPanel(state: SimState, machine: MachineState): HTMLElement {
  return render(
    <MachinePanel
      state={state}
      machine={machine}
      tick={state.tick}
      powerRatio={state.powerRatio}
      dispatch={(command) => applyCommand(state, command)}
      onClose={() => undefined}
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

function actionFaces(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".panel__actions > .icon-btn")];
}

function constraintTexts(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>(".inspector-note--constraint")].map(
    (note) => note.textContent ?? "",
  );
}

function dismantleFace(host: HTMLElement): { face: HTMLButtonElement; refund: number } {
  const face = actionFaces(host).find((item) => item.textContent?.startsWith("Dismantle"));
  const printed = /^Dismantle · \+(\d+) units$/.exec(face?.textContent ?? "");
  expect(printed).not.toBeNull();
  return { face: face as HTMLButtonElement, refund: Number(printed?.[1]) };
}

describe("UI-RESET-100 plural Transport face (option a)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  for (const blueprint of ["sorter", "copperSeparator"] as const) {
    it(`${blueprint}: the busy-link note reports the busiest DERIVED output, not the singular mirror`, () => {
      const state = twoOutputYard(blueprint);
      const machine = state.machines[0];
      const outputs = state.routes.filter((route) => route.from.id === machine.id);
      expect(outputs.length).toBe(2);
      // The legacy mirror names only the LAST output — make that one quiet and the
      // FIRST one busy. A mirror-only reader would under-report (or stay silent).
      expect(machine.outRoute).toBe(outputs[1].id);
      outputs[0].busyTicks = 90;
      outputs[0].ageTicks = 100;
      outputs[1].busyTicks = 10;
      outputs[1].ageTicks = 100;
      const host = mountPanel(state, machine);
      expect(constraintTexts(host)).toContain(
        `${COPY.constraints.busyLink} 90% ${COPY.constraints.busyLinkEnd}`,
      );
      // Both belts quiet: no transport note at all (the plural read finds no busy link).
      outputs[0].busyTicks = 10;
      outputs[1].busyTicks = 20;
      const quiet = mountPanel(state, machine);
      expect(
        constraintTexts(quiet).some((note) => note.startsWith(COPY.constraints.busyLink)),
      ).toBe(false);
    });
  }

  it("noOutputLink fires with tray units and zero derived outputs — and never for a stale null mirror", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    // Drop BOTH outputs through the real command path; the input link survives.
    for (const id of outputRouteIds(state, machine.id)) {
      expect(send(state, { type: "route.remove", routeId: id })).toBe(true);
    }
    expect(outputRouteIds(state, machine.id)).toEqual([]);
    expect(machine.inRoutes.length).toBe(1);
    // Test-only tray cargo (no advance): finished units wait with nowhere to go.
    machine.tray = [{ resource: "ferrous", qty: 4 }];
    machine.trayUnits = 4;
    const host = mountPanel(state, machine);
    expect(constraintTexts(host)).toContain(COPY.constraints.noOutputLink);
    // 4/12 is not a full tray: the full-output note must not fire instead.
    expect(
      constraintTexts(host).some((note) => note.startsWith(COPY.constraints.fullOutput)),
    ).toBe(false);
    // Transport offers the missing belts through the pending Connect plans.
    const transport = sectionByTitle(host, COPY.sections.transport);
    expect(transport.textContent).toContain(t("row.nextLink"));

    // Re-lay both outputs, then null the mirror (test-only stale mirror): derivation
    // reads the table, so the advisory must NOT fire while two outputs exist.
    const plans = planConnections(state, machine.id);
    expect(plans.length).toBe(2);
    for (const plan of plans) {
      expect(send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter })).toBe(true);
    }
    machine.outRoute = null;
    expect(outputRouteIds(state, machine.id).length).toBe(2);
    const repaint = mountPanel(state, machine);
    expect(constraintTexts(repaint)).not.toContain(COPY.constraints.noOutputLink);
  });

  it("Transport and the Routes pane list every touching link on a two-output machine", () => {
    const state = twoOutputYard("sorter");
    const machine = state.machines[0];
    const links = state.routes.filter(
      (route) => route.from.id === machine.id || route.to.id === machine.id,
    );
    expect(links.length).toBe(3);
    const host = mountPanel(state, machine);
    const transport = sectionByTitle(host, COPY.sections.transport);
    expect(rowValue(transport, t("row.links"))).toBe(
      links.map(beltExtentLine).join(t("value.comma")),
    );
    const tabs = [...host.querySelectorAll<HTMLButtonElement>(".inspector-context__btn")];
    act(() => tabs[1].click());
    for (const route of links) {
      const label = `${endpointName(state, route.from.id)} ${COPY.recipe.arrow} ${endpointName(state, route.to.id)}`;
      expect(rowValue(host, label)).toContain(beltExtentLine(route));
      expect(rowValue(host, label)).toContain(COPY.context.carries);
    }
    // Painted-text hygiene on the plural surface: no NaN, no raw i18n keys.
    const text = host.textContent ?? "";
    expect(text).not.toContain("NaN");
    expect(
      /\b(btn|row|value|note|unit|res|status|advice|bottleneck)\.[a-z]/.test(text),
    ).toBe(false);
  });
});

describe("UI-RESET-100 dismantle face == engine delta (R01 + R03)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheets();
  });

  for (const blueprint of ["sorter", "copperSeparator"] as const) {
    it(`${blueprint}: the face equals the engine payout and the place preview; the tap drops every link and conserves units`, () => {
      const state = twoOutputYard(blueprint);
      const machine = state.machines[0];
      expect(outputRouteIds(state, machine.id).length).toBe(2);
      const host = mountPanel(state, machine);
      const { face, refund } = dismantleFace(host);
      // Face == the independent all-touching arithmetic (empty cargo isolates the face).
      expect(refund).toBe(allTouchingRefund(state, machine));
      // The place-flow dismantle preview mirrors the same registered set (#54 parity).
      const impact = dismantleImpact(state, machine.id);
      expect(impact.found).toBe(true);
      expect(impact.linkCount).toBe(3); // two outputs + one input
      expect(impact.refundUnits + impact.batchUnits).toBe(refund);
      expect(impact.fits).toBe(true);

      // Empty cargo (no advance): the face isolates build + the registered belt refunds.
      const registeredIds = [
        ...new Set([...outputRouteIds(state, machine.id), ...machine.inRoutes]),
      ];
      const beltSum = state.routes
        .filter((route) => registeredIds.includes(route.id))
        .reduce((total, route) => total + refundOf(beltCost(route.run?.length ?? 0)), 0);
      const buildRefund = BLUEPRINTS[blueprint].buildCost.reduce(
        (total, item) => total + refundOf(item.qty),
        0,
      );
      expect(refund).toBe(buildRefund + beltSum);

      const totalsBefore = systemTotals(state);
      const unitBefore = unitTotal(state);
      const storeBefore = state.storeUnits;
      act(() => face.click());
      // The real tap returns exactly the printed face — both belts, not just the mirror.
      expect(state.storeUnits - storeBefore).toBe(refund);
      expect(state.machines.length).toBe(0);
      expect(state.routes.length).toBe(0);
      expect(validateSim(state)).toBeNull();
      // Conservation: the only matter created is the priced refund — each build-cost
      // resource at dismantleRefundPct (the separator's build also costs ferrous) plus
      // the scrap belt refunds; everything else merely relocates.
      const created: Partial<Record<ResourceId, number>> = {};
      for (const item of BLUEPRINTS[blueprint].buildCost) {
        created[item.resource] = (created[item.resource] ?? 0) + refundOf(item.qty);
      }
      created.scrap = (created.scrap ?? 0) + beltSum;
      const totalsAfter = systemTotals(state);
      const keys = new Set([
        ...(Object.keys(totalsBefore) as ResourceId[]),
        ...(Object.keys(totalsAfter) as ResourceId[]),
      ]);
      for (const key of keys) {
        expect((totalsAfter[key] ?? 0) - (totalsBefore[key] ?? 0)).toBe(created[key] ?? 0);
      }
      expect(unitTotal(state) - unitBefore).toBe(buildRefund + beltSum);
    });
  }

  for (const blueprint of ["sorter", "copperSeparator"] as const) {
    it(`${blueprint}: Connect click lays both output plans; the repaint's Dismantle face refunds them all`, () => {
      const state = inputOnlyYard(blueprint);
      const machine = state.machines[0];
      const host = mountPanel(state, machine);
      const connect = actionFaces(host)[0];
      expect(connect.textContent).toBe(t("btn.connect"));
      const routesBefore = state.routes.length;
      act(() => connect.click());
      expect(state.routes.length).toBe(routesBefore + 2);
      const outputs = state.routes.filter((route) => route.from.id === machine.id);
      expect(outputs.length).toBe(2);
      expect(outputRouteIds(state, machine.id)).toEqual(outputs.map((route) => route.id));
      expect(machine.outRoute).toBe(outputs[outputs.length - 1].id);
      // Repaint from the post-Connect state: the face now refunds the WHOLE registered set.
      const repaint = mountPanel(state, machine);
      const { face, refund } = dismantleFace(repaint);
      expect(refund).toBe(allTouchingRefund(state, machine));
      const storeBefore = state.storeUnits;
      act(() => face.click());
      expect(state.storeUnits - storeBefore).toBe(refund);
      expect(state.machines.length).toBe(0);
      expect(state.routes.length).toBe(0);
      expect(validateSim(state)).toBeNull();
    });
  }
});
