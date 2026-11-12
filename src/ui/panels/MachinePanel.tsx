import {
  BLUEPRINTS,
  RECIPES,
  TUNING,
  type ResourceId,
} from "../../game/content/defs";
import type { MachineState, SimState } from "../../game/simulation/types";
import { batchMilliFor, inputCapacityOf, outputRouteIds, upgradeRanks } from "../../game/simulation/types";
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
import { COPY } from "../inspector/copy";
import { ContextPanes } from "../inspector/ContextPanes";
import { constraintCards, primaryActionNote, recipeFlow } from "../inspector/model";
import { UpgradeCompare } from "../upgrade/UpgradeCompare";
import { LogisticsLegend } from "../logistics/LogisticsLegend";
import { LogisticsOverview } from "../logistics/LogisticsOverview";
import { RouteControls } from "../logistics/RouteControls";
import "../inspector/inspector.css";
import "../logistics/logistics.css";

/**
 * UI-RESET-54 (G2 wave 3): the machine inspector. The old two-page text dump becomes
 * one scrollable sheet of named sections — identity/status, the input → output recipe,
 * production with actual-vs-potential rates, the measured bottleneck with plain-language
 * constraint explanations, transport, and in-panel recovery context — above the same
 * command faces. The preserved contracts are deliberate:
 *
 * - the root keeps `panel panel--stack` and the first `aria-label` ("{machine} details"),
 *   so the shell docks it and the stack/Escape order is unchanged;
 * - the Status row keeps the exact `row.status` label and the engine's STATUS_LABEL value;
 * - the Measured / Next step / Actual rate rows keep the engine's diagnosis and window;
 * - the Links row keeps one `.panel__row` per machine with every extent joined by the
 *   table's comma, exactly as the belt-extent contract reads it;
 * - `.panel__actions` keeps its direct `.icon-btn` children in Connect → Upgrade → Move →
 *   Dismantle order, so the first-child accent names the primary and every face still
 *   prints the number its command charges (the arithmetic is the engine's own helpers).
 *
 * Recovery context opens in-panel (see ContextPanes): the App contract has no selection
 * callback, and the acceptance forbids losing the machine selection, so Storage/Routes/
 * Power are local panes that dispatch nothing.
 *
 * UI-RESET-55 (G2 wave 4): the Actions section now opens with the explicit branch
 * comparison (see UpgradeCompare) — three selectable cards printing current → proposed
 * values, units, price and tradeoff, a deliberate Buy selected face, and the free
 * last-pick re-pick. The plain unnamed Upgrade face stays below as the accent-named
 * primary exactly as #54 pinned it; the comparison labels honestly that an unnamed
 * level counts as one speed rank. No new section landmark and no new `.panel__actions`
 * child is introduced, so the seven-section and three-face contracts hold.
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
  /** Where the `Move` face sends this machine: the first cell nobody holds (UI-002). */
  const moveTile = nextFreeTile(props.state);
  /**
   * BELT-001 g4: the three command faces each carry the arithmetic the engine itself
   * applies to that tap, from the same exported helpers `commands.ts` uses, so a printed
   * number cannot drift from what the tap charges: `moveMachine` takes `movePenaltyPct` of
   * every build-cost line, `dismantleMachine` returns `refundOf` on those lines, the tray,
   * the buffer and the in-progress batch in full, and one belt refund per link the engine
   * has REGISTERED on the machine (every derived output route + `inRoutes`), not per touching link.
   * `links` stays the all-touching set the extent row below prints, and the store's
   * endpoint id (0) never collides with a machine.
   */
  const links = props.state.routes.filter(
    (route) => route.from.id === machine.id || route.to.id === machine.id
  );
  // Issue #100: the engine registers EVERY output link (derived from the route table) plus
  // every input link, and `dismantleMachine` refunds and drops that whole set. The face
  // mirrors it exactly — `outputRouteIds` reads the table, deduped so no belt is counted
  // twice. `links` below stays the all-touching set the extent row prints; on a fully-linked
  // machine the registered set and the touching set coincide, so the face no longer underprints.
  const registeredIds = [...new Set([...outputRouteIds(props.state, machine.id), ...machine.inRoutes])];
  const registeredLinks = props.state.routes.filter((route) =>
    registeredIds.includes(route.id)
  );
  const moveCost = def.buildCost.reduce(
    (sum, item) => sum + Math.round((item.qty * TUNING.movePenaltyPct) / 100),
    0
  );
  // `dismantleMachine` also returns the inputs reserved by the active batch, so the face
  // counts them: a running machine refunds more than an idle one with the same buffer.
  const refundUnits =
    def.buildCost.reduce((total, item) => total + refundOf(item.qty), 0) +
    machine.trayUnits +
    machine.inBufUnits +
    machine.batch.reduce((total, item) => total + item.qty, 0) +
    registeredLinks.reduce(
      (total, route) => total + refundOf(beltCost(route.run?.length ?? 0)),
      0
    );
  const batchPercent = Math.min(
    100,
    Math.round((machine.progress / Math.max(1, machine.batchMilli)) * 100),
  );
  const constraints = constraintCards(props.state, machine, props.powerRatio);

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
        <section className="inspector-section">
          <h3 className="inspector-section__title">{COPY.sections.identity}</h3>
          <dl>
            <Row label={t("row.status")} value={STATUS_LABEL[machine.status] ?? machine.status} />
            <Row label={t("row.level")} value={machine.level} />
            <Row label={COPY.rows.cell} value={machine.tile} />
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
          </dl>
        </section>

        <section className="inspector-section">
          <h3 className="inspector-section__title">{COPY.sections.recipe}</h3>
          <p className="inspector-flow">{recipeFlow(machine)}</p>
          <dl>
            <Row label={t("row.inputs")} value={describeInputs(recipe)} />
            <Row label={t("row.outputs")} value={describeOutputs(recipe)} />
            <Row
              label={t("row.cycle")}
              value={t("value.seconds", { seconds: formatSeconds(effectiveSeconds) })}
            />
          </dl>
        </section>

        <section className="inspector-section">
          <h3 className="inspector-section__title">{COPY.sections.production}</h3>
          <div
            className="inspector-progress"
            role="progressbar"
            aria-valuenow={batchPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="inspector-progress__fill" style={{ width: `${batchPercent}%` }} />
          </div>
          <dl>
            <Row label={t("row.batch")} value={t("value.percent", { percent: batchPercent })} />
            <Row
              label={t("row.actualRate")}
              value={t("value.actualRate", {
                rate: formatRate(reading.rate),
                window: formatWholeSeconds(reading.windowSeconds),
              })}
            />
            <Row label={t("row.maxRate")} value={t("value.maxRate", { rate: formatRate(maxRate) })} />
            {props.powerRatio < 0.999 ? (
              <Row
                label={COPY.rows.powerCappedRate}
                value={`${formatRate(maxRate * props.powerRatio)} batches/s`}
              />
            ) : null}
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
            <Row
              label={t("row.inBuffer")}
              value={`${formatNumber(machine.inBufUnits)}/${inputCapacityOf(
                machine,
                researchBonus(props.state).inputBuffer
              )}`}
            />
            <Row label={t("row.tray")} value={`${formatNumber(machine.trayUnits)}/${def.outputBuffer}`} />
          </dl>
        </section>

        <section className="inspector-section">
          <h3 className="inspector-section__title">{COPY.sections.bottleneck}</h3>
          <dl>
            <Row label={t("row.measured")} value={diagnosis.evidence} />
            <Row label={t("row.nextStep")} value={diagnosis.advice} />
            {machine.status === "starved" ? (
              <Row label={t("row.needs")} value={describeInputs(recipe)} />
            ) : null}
          </dl>
          {/* UI-RESET-64 (criterion 3): each bottleneck leads with a concise headline; the
              full diagnostic sentence (the engine's own numbers + recovery hint) is the
              expandable detail. The detail keeps `.inspector-note--constraint` and its exact
              text, so the inspector sentence contract is unchanged. */}
          {constraints.map((card) => (
            <details key={card.detail} className="inspector-constraint">
              <summary className="inspector-constraint__summary">{card.short}</summary>
              <p className="inspector-note inspector-note--constraint">{card.detail}</p>
            </details>
          ))}
          {/* UI-RESET-59 (G3): the yard production/power overview and the bottleneck list,
              embedded in this section (no new landmark). Each bottleneck reveals a belt
              touching the affected machine on the canvas through the shared view bridge. */}
          <LogisticsOverview state={props.state} />
        </section>

        <section className="inspector-section">
          <h3 className="inspector-section__title">{COPY.sections.transport}</h3>
          {plans.length > 0 || links.length > 0 ? (
            <dl>
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
            </dl>
          ) : (
            <p className="inspector-note">{COPY.context.noLinks}</p>
          )}
          {/* UI-RESET-59 (G3): the route legend + belt-layer visibility toggle, and the
              connect/disconnect/filter controls with cost/validity preview and cancel.
              Embedded here so the seven-section, three-face and three-tab contracts hold;
              every control dispatches through props.dispatch (the real command path). */}
          <LogisticsLegend state={props.state} />
          {/* UI-RESET-59: keyed by machine id (like UpgradeCompare below) so the custom-link
              form's from/to/filter reset to the inspected machine instead of drifting from
              the first machine opened. Without the key, useState(machine.id) keeps the stale
              source after a selection swap and the preview prices the wrong endpoint pair. */}
          <RouteControls key={machine.id} state={props.state} machine={machine} dispatch={props.dispatch} />
        </section>

        <section className="inspector-section">
          <h3 className="inspector-section__title">{COPY.sections.recovery}</h3>
          <ContextPanes state={props.state} machine={machine} powerRatio={props.powerRatio} />
        </section>

        <section className="inspector-section">
          <h3 className="inspector-section__title">{COPY.sections.actions}</h3>
          <dl>
            <Row
              label={t("row.nextUpgrade")}
              value={t("value.nextUpgrade", {
                from: formatSeconds(effectiveSeconds),
                to: formatSeconds(nextSeconds),
                cost: unit(cost, t("unit.credit")),
              })}
            />
          </dl>
          {/* UI-RESET-55: keyed by machine id so the selection and the receipt reset
              when the inspected machine changes, and never drift between machines. */}
          <UpgradeCompare
            key={machine.id}
            state={props.state}
            machine={machine}
            dispatch={props.dispatch}
          />
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
          </div>
          <p className="inspector-actions-note">{primaryActionNote(plans)}</p>
          <p className="inspector-actions-note inspector-actions-note--secondary">
            {COPY.actions.secondary}
          </p>
        </section>
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
