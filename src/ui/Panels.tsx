import { useState } from "react";
import {
  BLUEPRINTS,
  RECIPES,
  TUNING,
  exportPrice,
  type ResourceId,
} from "../game/content/defs";
import type { MachineState, SimState } from "../game/simulation/types";
import { batchMilliFor, fleetUnits } from "../game/simulation/types";
import type { Command } from "../game/simulation/commands";
import { sellableAmount, upgradeCost } from "../game/simulation/commands";
import {
  planConnections,
  type ConnectionPlan,
} from "../game/simulation/autoconnect";
import {
  RESEARCH,
  RESEARCH_ORDER,
  inputCapacityFor,
} from "../game/content/research";
import {
  diagnoseMachine,
  rateReading,
  yardSummary,
} from "../game/simulation/diagnostics";
import type { ReturnReport } from "../game/simulation/offline";
import {
  RESOURCE_LABEL,
  STATUS_LABEL,
  formatDuration,
  formatNumber,
  importNoteFor,
} from "./text";
import {
  formatRate,
  formatSeconds,
  formatWholeSeconds,
  plural,
  t,
  unit,
  wholePercent,
} from "../game/content/strings";
import type { ImportResult } from "../game/persistence/save";

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

  return (
    <div
      className="panel"
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
          <dt>{t("row.status")}</dt>
          <dd>{STATUS_LABEL[machine.status] ?? machine.status}</dd>
          <dt>{t("row.batch")}</dt>
          <dd>
            {t("value.percent", {
              percent: Math.min(
                100,
                Math.round((machine.progress / Math.max(1, machine.batchMilli)) * 100),
              ),
            })}
          </dd>
          <dt>{t("row.cycle")}</dt>
          <dd>{t("value.seconds", { seconds: formatSeconds(effectiveSeconds) })}</dd>
          <dt>{t("row.actualRate")}</dt>
          <dd>
            {t("value.actualRate", {
              rate: formatRate(reading.rate),
              window: formatWholeSeconds(reading.windowSeconds),
            })}
          </dd>
          <dt>{t("row.maxRate")}</dt>
          <dd>{t("value.maxRate", { rate: formatRate(maxRate) })}</dd>
          <dt>{t("row.power")}</dt>
          <dd>
            {t("value.powerUnits", {
              count: machine.batchPower,
              units: plural(machine.batchPower, t("unit.unit")),
            })}
            {props.powerRatio < 0.999
              ? t("value.powerLimited", { percent: wholePercent(props.powerRatio) })
              : ""}
          </dd>
          <dt>{t("row.measured")}</dt>
          <dd>{diagnosis.evidence}</dd>
          <dt>{t("row.nextStep")}</dt>
          <dd>{diagnosis.advice}</dd>
          <dt>{t("row.nextUpgrade")}</dt>
          <dd>
            {t("value.nextUpgrade", {
              from: formatSeconds(effectiveSeconds),
              to: formatSeconds(nextSeconds),
              cost: unit(cost, t("unit.credit")),
            })}
          </dd>
          {plans.length > 0 ? (
            <>
              <dt>{t("row.nextLink")}</dt>
              <dd>{describePlans(props.state, plans)}</dd>
            </>
          ) : null}
          {machine.status === "starved" ? (
            <>
              <dt>{t("row.needs")}</dt>
              <dd>{describeInputs(recipe)}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <dl>
          <dt>{t("row.inputs")}</dt>
          <dd>{describeInputs(recipe)}</dd>
          <dt>{t("row.outputs")}</dt>
          <dd>{describeOutputs(recipe)}</dd>
          <dt>{t("row.level")}</dt>
          <dd>{machine.level}</dd>
          <dt>{t("row.inBuffer")}</dt>
          <dd>
            {formatNumber(machine.inBufUnits)}/
            {inputCapacityFor(props.state, def.inputBuffer)}
          </dd>
          <dt>{t("row.tray")}</dt>
          <dd>
            {formatNumber(machine.trayUnits)}/{def.outputBuffer}
          </dd>
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
        <button
          className="icon-btn"
          onClick={() => setPage(page === 0 ? 1 : 0)}
        >
          {page === 0 ? t("btn.recipe") : t("btn.statusPage")}
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
          {t("btn.dismantle")}
        </button>
      </div>
      </div>
    </div>
  );
}

export function StorePanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const rows = (Object.keys(props.state.store) as ResourceId[]).filter(
    (key) => (props.state.store[key] ?? 0) > 0,
  );
  return (
    <div className="panel" role="group" aria-label={t("aria.storeContents")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.store")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
      <dl>
        {rows.map((key) => {
          const amount = sellableAmount(props.state, key);
          const price = exportPrice(key);
          return (
            <div key={key}>
              <dt>{RESOURCE_LABEL[key] ?? key}</dt>
              <dd>{formatNumber(props.state.store[key] ?? 0)}</dd>
              {props.state.exportClaimed && price > 0 && amount > 0 ? (
                <button
                  className="icon-btn"
                  onClick={() =>
                    props.dispatch({
                      id: nextId("s"),
                      type: "contract.sell",
                      resource: key,
                      qty: amount,
                    })
                  }
                >
                  {t("value.sellButton", { qty: amount, credits: amount * price })}
                </button>
              ) : null}
            </div>
          );
        })}
        <dt>{t("row.capacity")}</dt>
        <dd>
          {formatNumber(props.state.storeUnits)}/
          {formatNumber(props.state.storeCapacity)}
        </dd>
        {yardSummary(props.state).map((line) => (
          <div key={line}>
            <dt>{t("row.measured")}</dt>
            <dd>{line}</dd>
          </div>
        ))}
        {props.state.exportClaimed ? (
          <>
            <dt>{t("row.sellFloor")}</dt>
            <dd>
              {t("value.sellFloor", {
                count: TUNING.reserveFloor,
                units: plural(TUNING.reserveFloor, t("unit.unit")),
              })}
            </dd>
          </>
        ) : (
          <>
            <dt>{t("row.sell")}</dt>
            <dd>{t("value.sellOpens")}</dd>
          </>
        )}
        {props.state.overflow.length > 0 ? (
          <>
            <dt>{t("row.overflow")}</dt>
            <dd>
              {props.state.overflow.reduce(
                (total, item) => total + item.qty,
                0,
              )}
            </dd>
          </>
        ) : null}
      </dl>
      </div>
    </div>
  );
}

/**
 * Research as one full-width card per node (Q-001, design bible "Menus and
 * navigation"). A definition-list grid treats every node `<div>` as another
 * alternating cell of `auto 1fr`, which is what squeezed "Smart Buffers" into a
 * one-word column in docs/screenshots/latest-research-phone.png; the card list
 * below is a single column by construction, so a card is as wide as the panel.
 * Each card carries the five things a purchase decision needs: title, exact
 * effect, cost, prerequisite, and its own state — `Known`, an inert buy target
 * while the prerequisite is missing, or a live one. The rank, cost and
 * prerequisite rules themselves come from the same tables as before, so the
 * engine sees the identical `research.buy` command.
 */
export function ResearchPanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const owned = props.state.research;
  return (
    <div className="panel panel--research" role="group" aria-label={t("aria.research")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.research")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <p className="panel__lead">
          <span className="panel__lead-key">{t("row.data")}</span>
          <span className="panel__lead-value">{formatNumber(props.state.store.data ?? 0)}</span>
        </p>
        <div className="nodes">
          {RESEARCH_ORDER.map((id) => {
            const def = RESEARCH[id];
            const rank = owned[def.id] ?? 0;
            const prereq = def.requires ? RESEARCH[def.requires] : null;
            const blocked = prereq !== null && (owned[prereq.id] ?? 0) <= 0;
            const known = rank > 0;
            const cost = t("value.dataCost", { cost: def.cost });
            return (
              <article
                className="node"
                key={def.id}
                data-node={def.id}
                data-state={known ? "known" : blocked ? "locked" : "open"}
              >
                <h3 className="node__title">
                  <span className="node__name">{def.label}</span>
                  {known ? (
                    <span className="node__state">{t("value.known")}</span>
                  ) : blocked ? (
                    <span className="node__state">
                      {t("value.needsPrereq", {
                        node: prereq ? prereq.label : t("value.earlierNode"),
                      })}
                    </span>
                  ) : null}
                </h3>
                <p className="node__effect">{def.effect}</p>
                <div className="node__foot">
                  <span className="node__cost">{cost}</span>
                  {known ? null : (
                    <button
                      className="icon-btn node__buy"
                      disabled={blocked}
                      onClick={() =>
                        props.dispatch({
                          id: nextId("k"),
                          type: "research.buy",
                          node: def.id,
                        })
                      }
                    >
                      {t("btn.buyData", { cost })}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The yard record plus the two save transfers (spec 22.1, B-06). Two pages so one
 * textarea is on screen at a time and the panel keeps its 0 px inner scroll at the
 * 2.0 text scale (spec 6.4): page 0 shows the record and the export, page 1 the
 * import field. A refused file leaves the running yard untouched.
 */
export function YardPanel(props: {
  state: SimState;
  exportText: string;
  onImport: (text: string) => ImportResult;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState(t("note.exportIdle"));
  const exportId = "rustwake-save-export";
  const importId = "rustwake-save-import";

  const copyExport = () => {
    const clipboard = navigator.clipboard?.writeText;
    if (!clipboard) {
      setNote(t("note.copyManual"));
      return;
    }
    clipboard.call(navigator.clipboard, props.exportText).then(
      () => setNote(t("note.copied")),
      () => setNote(t("note.copyManual"))
    );
  };

  return (
    <div className="panel" role="group" aria-label={t("aria.yardRecord")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.yard")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        {page === 0 ? (
          <>
            <dl>
              <dt>{t("row.tick")}</dt>
              <dd>{props.state.tick}</dd>
              <dt>{t("row.machines")}</dt>
              <dd>{props.state.machines.length}</dd>
              <dt>{t("row.drones")}</dt>
              <dd>{fleetUnits(props.state).filter((unitState) => unitState.repaired).length}</dd>
              <dt>{t("row.links")}</dt>
              <dd>{props.state.routes.length}</dd>
              <dt>{t("row.credits")}</dt>
              <dd>{props.state.credits}</dd>
              <dt>{t("row.save")}</dt>
              <dd>{t("value.characters", { count: props.exportText.length })}</dd>
            </dl>
            <label className="panel__field" htmlFor={exportId}>
              {t("field.savedYard")}
            </label>
            <textarea
              id={exportId}
              className="panel__code"
              readOnly
              value={props.exportText}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="panel__actions">
              <button className="icon-btn" onClick={copyExport}>
                {t("btn.copy")}
              </button>
              <button className="icon-btn" onClick={() => setPage(1)}>
                {t("btn.import")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="status-line">{t("note.paste")}</p>
            <label className="panel__field" htmlFor={importId}>
              {t("field.pastedText")}
            </label>
            <textarea
              id={importId}
              className="panel__code"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <div className="panel__actions">
              <button
                className="icon-btn"
                onClick={() => setNote(importNoteFor(props.onImport(draft)))}
              >
                {t("btn.apply")}
              </button>
              <button className="icon-btn" onClick={() => setPage(0)}>
                {t("btn.back")}
              </button>
            </div>
          </>
        )}
        <p className="status-line">{note}</p>
      </div>
    </div>
  );
}

export function ReturnReportPanel(props: {
  report: ReturnReport;
  onClose: () => void;
}) {
  const report = props.report;
  const gains = Object.entries(report.gains) as [ResourceId, number][];
  const summary = [
    t("report.away", { duration: formatDuration(report.awayTicks) }),
    report.capped
      ? t("report.workedCapped", { duration: formatDuration(report.creditedTicks) })
      : t("report.worked", { duration: formatDuration(report.creditedTicks) }),
  ];
  return (
    <div className="panel" role="group" aria-label={t("aria.returnReport")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.report")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.backToYard")}
        </button>
      </div>
      <div className="panel__body">
      <dl>
        {summary.map((line) => (
          <div key={line}>
            <dt>{t("row.time")}</dt>
            <dd>{line}</dd>
          </div>
        ))}
        {gains.slice(0, 4).map(([key, value]) => (
          <div key={key}>
            <dt>{RESOURCE_LABEL[key] ?? key}</dt>
            <dd>+{formatNumber(value)}</dd>
          </div>
        ))}
        <dt>{t("row.deliveries")}</dt>
        <dd>{report.deliveries}</dd>
        <dt>{t("row.batches")}</dt>
        <dd>{report.batchesDone}</dd>
        {report.bottleneck ? (
          <>
            <dt>{t("row.bottleneck")}</dt>
            <dd>{t(`bottleneck.${report.bottleneck}`)}</dd>
          </>
        ) : null}
      </dl>
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

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}
