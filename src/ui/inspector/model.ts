/**
 * UI-RESET-54 (G2 wave 3): the inspector's read model. Every sentence here is derived
 * from the authoritative sim state through the same exported helpers the engine and
 * the command faces use (`requestedPower`, `beltCost`, `beltExtentLine`, `qty`), so a
 * printed explanation cannot drift from what the simulation actually measures. Pure
 * functions only: no React, no dispatch, no mutation — the panel renders what these
 * return, and the tests can assert the sentences without a DOM.
 */
import { BLUEPRINTS, RECIPES, TUNING, type ResourceId } from "../../game/content/defs";
import {
  outputRouteIds,
  qty,
  type MachineState,
  type RouteState,
  type SimState,
} from "../../game/simulation/types";
import { requestedPower } from "../../game/simulation/diagnostics";
import { beltCost } from "../../game/simulation/commands";
import type { ConnectionPlan } from "../../game/simulation/autoconnect";
import { RESOURCE_LABEL, beltExtentLine } from "../text";
import {
  formatNumber,
  plural,
  resourceWord,
  t,
  unit,
  wholePercent,
} from "../../game/content/strings";
import { COPY } from "./copy";

export interface InspectorRow {
  readonly label: string;
  readonly value: string;
}

/** Lowercased endpoint name, the same shape `value.linkCarries` uses for machines. */
export function endpointName(state: SimState, endpointId: number): string {
  if (endpointId === 0) return t("value.dock");
  const machine = state.machines.find((m) => m.id === endpointId);
  return machine ? BLUEPRINTS[machine.blueprint].label.toLocaleLowerCase() : t("unit.machine");
}

/** The one-line input → output flow the recipe section paints above its rows. */
export function recipeFlow(machine: MachineState): string {
  const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
  const side = (items: readonly { resource: ResourceId; qty: number }[]) =>
    items
      .map((item) => t("value.recipeItem", { qty: item.qty, label: RESOURCE_LABEL[item.resource] }))
      .join(t("value.comma"));
  return `${side(recipe.inputs)} ${COPY.recipe.arrow} ${side(recipe.outputs)}`;
}

/**
 * UI-RESET-64 (criterion 3): one bottleneck constraint as a concise headline plus the
 * full diagnostic sentence. The headline is the plain-language "what" the player reads
 * at a glance; the detail is the engine's own numbers and the recovery hint, revealed on
 * demand so unexplained diagnostic jargon never dominates the panel. `detail` is exactly
 * the sentence `constraintNotes` has always printed, so the two cannot drift.
 */
export interface ConstraintCard {
  readonly short: string;
  readonly detail: string;
}

/**
 * The bottleneck explanations the acceptance asks for: missing input, full output,
 * low power and transport limits, each in one sentence with the engine's own numbers.
 * Only the constraints that actually hold are returned, in a stable priority order.
 * Each entry pairs that sentence with a concise headline (UI-RESET-64); `constraintNotes`
 * and `constraintCards` both read this one derivation so the detail can never drift.
 */
function constraintEntries(
  state: SimState,
  machine: MachineState,
  powerRatio: number,
): ConstraintCard[] {
  const def = BLUEPRINTS[machine.blueprint];
  const recipe = RECIPES[def.recipeId];
  const notes: ConstraintCard[] = [];

  if (machine.status === "starved") {
    const short = recipe.inputs
      .map((item) => ({ item, held: machine.inBuf[item.resource] ?? 0 }))
      .filter(({ item, held }) => held < item.qty)
      .map(({ item, held }) => `${formatNumber(item.qty - held)} ${resourceWord(item.resource)}`);
    notes.push({
      short: COPY.constraintHeads.missingInput,
      detail:
        short.length > 0
          ? `${COPY.constraints.missingInput} ${short.join(t("value.comma"))}. ${COPY.constraints.missingInputEnd}`
          : COPY.constraints.missingInputEnd,
    });
  }

  if (machine.status === "outputFull" || machine.trayUnits >= def.outputBuffer) {
    notes.push({
      short: COPY.constraintHeads.fullOutput,
      detail: `${COPY.constraints.fullOutput} ${formatNumber(machine.trayUnits)}/${def.outputBuffer}. ${COPY.constraints.fullOutputEnd}`,
    });
  }

  if (powerRatio < 0.999) {
    notes.push({
      short: COPY.constraintHeads.power,
      detail: `${COPY.constraints.power} ${formatNumber(requestedPower(state))}/${TUNING.yardPowerCapacity} · ${wholePercent(powerRatio)}% ${COPY.constraints.powerEnd}`,
    });
  }

  const links = state.routes.filter(
    (route) => route.from.id === machine.id || route.to.id === machine.id,
  );
  if (links.length === 0) {
    notes.push({ short: COPY.constraintHeads.noLinks, detail: COPY.constraints.noLinks });
  } else if (recipe.outputs.length > 0) {
    // Issue #100: read EVERY registered output link, derived from the route table so a
    // multi-output machine reports its busiest belt and `noOutputLink` fires only when the
    // table genuinely holds no output for this machine. The same number the assistant reports.
    const outRoutes = outputRouteIds(state, machine.id)
      .map((id) => state.routes.find((route) => route.id === id))
      .filter((route): route is RouteState => route !== undefined);
    if (outRoutes.length === 0) {
      notes.push({ short: COPY.constraintHeads.noOutputLink, detail: COPY.constraints.noOutputLink });
    } else {
      const busy = outRoutes.reduce((worst, route) => {
        const value = wholePercent(route.busyTicks / Math.max(1, route.ageTicks));
        return value > worst ? value : worst;
      }, 0);
      if (busy >= 85) {
        notes.push({
          short: COPY.constraintHeads.busyLink,
          detail: `${COPY.constraints.busyLink} ${busy}% ${COPY.constraints.busyLinkEnd}`,
        });
      }
    }
  }

  return notes;
}

/** The full diagnostic sentences, in priority order — unchanged contract (UI-RESET-54/100). */
export function constraintNotes(
  state: SimState,
  machine: MachineState,
  powerRatio: number,
): string[] {
  return constraintEntries(state, machine, powerRatio).map((entry) => entry.detail);
}

/** UI-RESET-64: the same constraints as concise headline + expandable detail pairs. */
export function constraintCards(
  state: SimState,
  machine: MachineState,
  powerRatio: number,
): ConstraintCard[] {
  return constraintEntries(state, machine, powerRatio);
}

/** Storage recovery context: the shared store plus every resource this recipe touches. */
export function storageContext(
  state: SimState,
  machine: MachineState,
): { rows: InspectorRow[]; floor: string; help: string } {
  const recipe = RECIPES[BLUEPRINTS[machine.blueprint].recipeId];
  const resources: ResourceId[] = [];
  for (const item of [...recipe.inputs, ...recipe.outputs]) {
    if (!resources.includes(item.resource)) resources.push(item.resource);
  }
  const rows: InspectorRow[] = [
    {
      label: COPY.rows.capacity,
      value: `${formatNumber(state.storeUnits)}/${state.storeCapacity}`,
    },
    ...resources.map((resource) => ({
      label: RESOURCE_LABEL[resource] ?? resource,
      value: formatNumber(qty(state, resource)),
    })),
  ];
  return {
    rows,
    floor: t("value.sellFloor", {
      count: TUNING.reserveFloor,
      units: plural(TUNING.reserveFloor, t("unit.unit")),
    }),
    help: COPY.context.storageHelp,
  };
}

/** Route recovery context: one row per attached link with its extent and measured busyness. */
export function routesContext(
  state: SimState,
  machine: MachineState,
): { rows: InspectorRow[]; help: string } {
  const links = state.routes.filter(
    (route) => route.from.id === machine.id || route.to.id === machine.id,
  );
  const rows: InspectorRow[] = links.map((route) => {
    const busy = wholePercent(route.busyTicks / Math.max(1, route.ageTicks));
    const carries = route.filter === null ? t("value.cargo") : (RESOURCE_LABEL[route.filter] ?? route.filter);
    return {
      label: `${endpointName(state, route.from.id)} ${COPY.recipe.arrow} ${endpointName(state, route.to.id)}`,
      value: `${COPY.context.carries} ${carries} · ${beltExtentLine(route)} · ${busy}% ${COPY.context.busy}`,
    };
  });
  return { rows, help: COPY.context.routesHelp };
}

/** Power recovery context: the shared budget, this machine's draw and the resulting speed. */
export function powerContext(
  state: SimState,
  machine: MachineState,
  powerRatio: number,
): { rows: InspectorRow[]; help: string } {
  return {
    rows: [
      {
        label: COPY.rows.requested,
        value: `${formatNumber(requestedPower(state))}/${TUNING.yardPowerCapacity}`,
      },
      {
        label: COPY.rows.thisMachine,
        value: t("value.powerUnits", {
          count: machine.batchPower,
          units: plural(machine.batchPower, t("unit.unit")),
        }),
      },
      {
        label: COPY.rows.speed,
        value: t("value.percent", { percent: wholePercent(powerRatio) }),
      },
    ],
    help: COPY.context.powerHelp,
  };
}

/**
 * The consequence sentence under the action row. The primary is whichever face the
 * accent names: Connect while links are pending, otherwise Upgrade. Move/Dismantle
 * stay secondary and their consequence is spelled out once, beneath them.
 */
export function primaryActionNote(plans: readonly ConnectionPlan[]): string {
  if (plans.length > 0) {
    const tiles = plans.reduce((total, plan) => total + plan.tiles, 0);
    return `${COPY.actions.connectPrimary} ${unit(tiles, "tile")} · ${formatNumber(beltCost(tiles))} ${resourceWord("scrap")} ${COPY.actions.connectPrimaryEnd}`;
  }
  return COPY.actions.upgradePrimary;
}
