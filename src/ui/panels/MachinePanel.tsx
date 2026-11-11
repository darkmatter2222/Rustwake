import { useState } from "react";
import {
  BLUEPRINTS,
  RECIPES,
  TUNING,
  type ResourceId,
} from "../../game/content/defs";
import type { MachineState, SimState } from "../../game/simulation/types";
import { batchMilliFor, inputCapacityOf, upgradeRanks } from "../../game/simulation/types";
import type { Command } from "../../game/simulation/commands";
import { beltCost, refundOf, upgradeCost } from "../../game/simulation/commands";
import {
  planConnections,
  type ConnectionPlan,
} from "../../game/simulation/autoconnect";
import { researchBonus } from "../../game/content/research";
import {
  diagnoseMachine,
  rateReading,
} from "../../game/simulation/diagnostics";
import {
  RESOURCE_LABEL,
  STATUS_LABEL,
  beltExtentLine,
  formatNumber,
  nextFreeTile,
} from "../text";
import {
  formatRate,
  formatSeconds,
  formatWholeSeconds,
  plural,
  t,
  unit,
  wholePercent,
} from "../../game/content/strings";
import { Row, nextId } from "./shared";

/**
 * U-5 (UI-002 g3): which layer a press retires. Two of these can be on the screen at
 * once - the return report the boot left behind, plus the panel the player opened last -
 * and one `Back`/`Escape` press retires exactly one of them, nearest first (LIFO). The
 * markers let the sheet state that order without a second source of truth: the layer the
 * player opened last owns the target nearest the dock (where the thumb already is), the
 * older one sits above it in the column, so repeated presses unwind the stack down to the
 * yard instead of jumping between two buttons.
 */
export function MachinePanel(props: {
  state: SimState;
  machine: MachineState;
  tick: number;
  powerRatio: number;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const { machine } = props;
  const def = BLUEPRINTS[machine.blueprint];
  const recipe = RECIPES[def.recipeId];
  const effectiveSeconds = machine.batchMilli / 10000;
  const maxRate = effectiveSeconds > 0 ? 10000 / machine.batchMilli : 0;
  const reading = rateReading(machine);
  const cost = upgradeCost(def.baseUpgradeCost, machine.level);
  const nextSeconds =
    batchMilliFor(machine.blueprint, machine.level + 1) / 10000;
  const plans = planConnections(props.state, machine.id);
  const diagnosis = diagnoseMachine(props.state, machine);
  const [page, setPage] = useState(0);
  /** Where the `Move` face sends this machine: the first cell nobody holds (UI-002). */
  const moveTile = nextFreeTile(props.state);
  /**
   * BELT-001 g4: the three command faces each carry the arithmetic the engine itself
   * applies to that tap, from the same exported helpers `commands.ts` uses, so a printed
   * number cannot drift from what the tap charges: `moveMachine` takes `movePenaltyPct` of
   * every build-cost line, `dismantleMachine` returns `refundOf` on those lines, the tray
   * and buffer in full, and one belt refund per attached link. `links` is the same set the
   * extent row below prints, and the store's endpoint id (0) never collides with a machine.
   */
  const links = props.state.routes.filter(
    (route) => route.from.id === machine.id || route.to.id === machine.id
  );
  const moveCost = def.buildCost.reduce(
    (sum, item) => sum + Math.round((item.qty * TUNING.movePenaltyPct) / 100),
    0
  );
  const refundUnits =
    def.buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
    machine.trayUnits +
    machine.inBufUnits +
    links.reduce((total, route) => total + refundOf(beltCost(route.run?.length ?? 0)), 0);

  return (
    <div
      className="panel panel--stack"
      role="group"
      aria-label={t("aria.machineDetails", { machine: def.label })}
    >
      <div className="panel__head">
        <h2 className="panel__title">{def.label}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
      {page === 0 ? (
        <dl>
          <Row label={t("row.status")} value={STATUS_LABEL[machine.status] ?? machine.status} />
          <Row
            label={t("row.batch")}
            value={t("value.percent", {
              percent: Math.min(
                100,
                Math.round((machine.progress / Math.max(1, machine.batchMilli)) * 100),
              ),
            })}
          />
          <Row
            label={t("row.cycle")}
            value={t("value.seconds", { seconds: formatSeconds(effectiveSeconds) })}
          />
          <Row
            label={t("row.actualRate")}
            value={t("value.actualRate", {
              rate: formatRate(reading.rate),
              window: formatWholeSeconds(reading.windowSeconds),
            })}
          />
          <Row label={t("row.maxRate")} value={t("value.maxRate", { rate: formatRate(maxRate) })} />
          <Row
            label={t("row.power")}
            value={
              <>
                {t("value.powerUnits", {
                  count: machine.batchPower,
                  units: plural(machine.batchPower, t("unit.unit")),
                })}
                {props.powerRatio < 0.999
                  ? t("value.powerLimited", { percent: wholePercent(props.powerRatio) })
                  : ""}
              </>
            }
          />
          <Row label={t("row.measured")} value={diagnosis.evidence} />
          <Row label={t("row.nextStep")} value={diagnosis.advice} />
          <Row
            label={t("row.nextUpgrade")}
            value={t("value.nextUpgrade", {
              from: formatSeconds(effectiveSeconds),
              to: formatSeconds(nextSeconds),
              cost: unit(cost, t("unit.credit")),
            })}
          />
          {plans.length > 0 ? (
            <Row label={t("row.nextLink")} value={describePlans(props.state, plans)} />
          ) : null}
          {/* BELT-001 g4: the extent of every link already on this machine, in the one
              shape the world prints beside the line itself: "3 tiles · 3 scrap". A link
              from before the price has no `run` and prints its stored latency instead. */}
          {links.length > 0 ? (
            <Row
              label={t("row.links")}
              value={links.map(beltExtentLine).join(t("value.comma"))}
            />
          ) : null}
          {machine.status === "starved" ? (
            <Row label={t("row.needs")} value={describeInputs(recipe)} />
          ) : null}
        </dl>
      ) : (
        <dl>
          <Row label={t("row.inputs")} value={describeInputs(recipe)} />
          <Row label={t("row.outputs")} value={describeOutputs(recipe)} />
          <Row label={t("row.level")} value={machine.level} />
          {machine.branch !== undefined ? (
            <Row
              label={t("row.branches")}
              value={(() => {
                const ranks = upgradeRanks(machine);
                return t("value.branches", {
                  speed: ranks.speed,
                  buffer: ranks.buffer,
                  draw: ranks.draw,
                });
              })()}
            />
          ) : null}
          <Row
            label={t("row.inBuffer")}
            value={`${formatNumber(machine.inBufUnits)}/${inputCapacityOf(
              machine,
              researchBonus(props.state).inputBuffer
            )}`}
          />
          <Row label={t("row.tray")} value={`${formatNumber(machine.trayUnits)}/${def.outputBuffer}`} />
        </dl>
      )}
      <div className="panel__actions">
        {plans.length > 0 ? (
          <button
            className="icon-btn"
            onClick={() => {
              for (const plan of plans) {
                props.dispatch({
                  id: nextId("r"),
                  type: "route.connect",
                  from: plan.from,
                  to: plan.to,
                  filter: plan.filter,
                });
              }
            }}
          >
            {t("btn.connect")}
          </button>
        ) : null}
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({
              id: nextId("u"),
              type: "machine.upgrade",
              machineId: machine.id,
            })
          }
        >
          {t("btn.upgradeCost", { cost: unit(cost, t("unit.credit")) })}
        </button>
        {/* UI-002: the same machine, one cell over. `moveMachine` re-points the existing
            machine (its id, level, branch and both route ids survive), and the destination
            is the first free cell the yard offers - the ladder `firstFreeTile` uses. Every
            command face prints the number the engine charges it: the upgrade its credits,
            the move its own charge, the dismantle the units it returns. */}
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({
              id: nextId("m"),
              type: "machine.move",
              machineId: machine.id,
              tile: moveTile,
            })
          }
        >
          {t("btn.moveCost", { tile: moveTile, charge: unit(moveCost, t("unit.unit")) })}
        </button>
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({
              id: nextId("d"),
              type: "machine.dismantle",
              machineId: machine.id,
            })
          }
        >
          {t("btn.dismantleRefund", { refund: unit(refundUnits, t("unit.unit")) })}
        </button>
        <button className="icon-btn" onClick={() => setPage(page === 0 ? 1 : 0)}>
          {page === 0 ? t("btn.recipe") : t("btn.statusPage")}
        </button>
      </div>
      </div>
    </div>
  );
}

function describePlans(
  state: SimState,
  plans: readonly ConnectionPlan[],
): string {
  return plans
    .map((plan) => {
      const source = plan.from === 0 ? t("value.dock") : labelOf(state, plan.from);
      const target = plan.to === 0 ? t("value.dock") : labelOf(state, plan.to);
      const thing =
        plan.filter === null
          ? t("value.cargo")
          : (RESOURCE_LABEL[plan.filter] ?? plan.filter);
      return t("value.linkCarries", { source, target, thing });
    })
    .join(t("value.semicolon"));
}

function labelOf(state: SimState, machineId: number): string {
  const machine = state.machines.find((m) => m.id === machineId);
  return machine
    ? BLUEPRINTS[machine.blueprint].label.toLocaleLowerCase()
    : t("unit.machine");
}

function describeInputs(recipe: {
  inputs: readonly { resource: ResourceId; qty: number }[];
}): string {
  return recipe.inputs
    .map((item) => t("value.recipeItem", { qty: item.qty, label: RESOURCE_LABEL[item.resource] }))
    .join(t("value.comma"));
}

function describeOutputs(recipe: {
  outputs: readonly { resource: ResourceId; qty: number }[];
}): string {
  return recipe.outputs
    .map((item) => t("value.recipeItem", { qty: item.qty, label: RESOURCE_LABEL[item.resource] }))
    .join(t("value.comma"));
}