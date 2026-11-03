import { useState } from "react";
import {
  BLUEPRINTS,
  RECIPES,
  TUNING,
  exportPrice,
  type ResourceId,
} from "../game/content/defs";
import type { MachineState, SimState } from "../game/simulation/types";
import { batchMilliFor } from "../game/simulation/types";
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
    <div className="panel" role="group" aria-label={`${def.label} details`}>
      <div className="panel__head">
        <h2 className="panel__title">{def.label}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          Close
        </button>
      </div>
      <div className="panel__body">
      {page === 0 ? (
        <dl>
          <dt>Status</dt>
          <dd>{STATUS_LABEL[machine.status] ?? machine.status}</dd>
          <dt>Batch</dt>
          <dd>
            {Math.min(
              100,
              Math.round(
                (machine.progress / Math.max(1, machine.batchMilli)) * 100,
              ),
            )}
            %
          </dd>
          <dt>Cycle</dt>
          <dd>{effectiveSeconds.toFixed(2)}s</dd>
          <dt>Actual rate</dt>
          <dd>
            {reading.rate.toFixed(2)} batches/s ·{" "}
            {Math.round(reading.windowSeconds)}s window
          </dd>
          <dt>Max rate</dt>
          <dd>{maxRate.toFixed(2)} batches/s at full power</dd>
          <dt>Power</dt>
          <dd>
            {machine.batchPower} units
            {props.powerRatio < 0.999
              ? ` · Power limited: ${Math.round(props.powerRatio * 100)}% speed`
              : ""}
          </dd>
          <dt>Measured</dt>
          <dd>{diagnosis.evidence}</dd>
          <dt>Next step</dt>
          <dd>{diagnosis.advice}</dd>
          <dt>Next upgrade</dt>
          <dd>
            {effectiveSeconds.toFixed(2)}s → {nextSeconds.toFixed(2)}s · {cost}{" "}
            credits
          </dd>
          {plans.length > 0 ? (
            <>
              <dt>Next link</dt>
              <dd>{describePlans(props.state, plans)}</dd>
            </>
          ) : null}
          {machine.status === "starved" ? (
            <>
              <dt>Needs</dt>
              <dd>{describeInputs(recipe)}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <dl>
          <dt>Inputs</dt>
          <dd>{describeInputs(recipe)}</dd>
          <dt>Outputs</dt>
          <dd>{describeOutputs(recipe)}</dd>
          <dt>Level</dt>
          <dd>{machine.level}</dd>
          <dt>In buffer</dt>
          <dd>
            {formatNumber(machine.inBufUnits)}/
            {inputCapacityFor(props.state, def.inputBuffer)}
          </dd>
          <dt>Tray</dt>
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
            Connect
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
          Upgrade · {cost} credits
        </button>
        <button
          className="icon-btn"
          onClick={() => setPage(page === 0 ? 1 : 0)}
        >
          {page === 0 ? "Recipe" : "Status"}
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
          Dismantle
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
    <div className="panel" role="group" aria-label="Store contents">
      <div className="panel__head">
        <h2 className="panel__title">Yard store</h2>
        <button className="icon-btn" onClick={props.onClose}>
          Close
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
                  Sell {amount} · +{amount * price}
                </button>
              ) : null}
            </div>
          );
        })}
        <dt>Capacity</dt>
        <dd>
          {formatNumber(props.state.storeUnits)}/
          {formatNumber(props.state.storeCapacity)}
        </dd>
        {yardSummary(props.state).map((line) => (
          <div key={line}>
            <dt>Measured</dt>
            <dd>{line}</dd>
          </div>
        ))}
        {props.state.exportClaimed ? (
          <>
            <dt>Sell floor</dt>
            <dd>{TUNING.reserveFloor} units kept per material</dd>
          </>
        ) : (
          <>
            <dt>Sell</dt>
            <dd>Opens after the first steel contract</dd>
          </>
        )}
        {props.state.overflow.length > 0 ? (
          <>
            <dt>Overflow hold</dt>
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

export function ResearchPanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const owned = props.state.research;
  return (
    <div className="panel" role="group" aria-label="Research">
      <div className="panel__head">
        <h2 className="panel__title">Research</h2>
        <button className="icon-btn" onClick={props.onClose}>
          Close
        </button>
      </div>
      <div className="panel__body">
      <dl>
        <dt>Data</dt>
        <dd>{formatNumber(props.state.store.data ?? 0)}</dd>
        {RESEARCH_ORDER.map((id) => {
          const def = RESEARCH[id];
          const rank = owned[def.id] ?? 0;
          const prereq = def.requires ? RESEARCH[def.requires] : null;
          const blocked = prereq !== null && (owned[prereq.id] ?? 0) <= 0;
          return (
            <div key={def.id}>
              <dt>{def.label}</dt>
              <dd>{def.effect}</dd>
              {rank > 0 ? (
                <dd>Known</dd>
              ) : blocked ? (
                <dd>
                  Needs {prereq ? prereq.label : "the earlier node"} first
                </dd>
              ) : (
                <button
                  className="icon-btn"
                  onClick={() =>
                    props.dispatch({
                      id: nextId("k"),
                      type: "research.buy",
                      node: def.id,
                    })
                  }
                >
                  Buy · {def.cost} Data
                </button>
              )}
            </div>
          );
        })}
      </dl>
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
  const [note, setNote] = useState("Copy this text, or open Import to paste one.");
  const exportId = "rustwake-save-export";
  const importId = "rustwake-save-import";

  const copyExport = () => {
    const clipboard = navigator.clipboard?.writeText;
    if (!clipboard) {
      setNote("Select the text and copy it");
      return;
    }
    clipboard.call(navigator.clipboard, props.exportText).then(
      () => setNote("Copied to the clipboard"),
      () => setNote("Select the text and copy it")
    );
  };

  return (
    <div className="panel" role="group" aria-label="Yard record">
      <div className="panel__head">
        <h2 className="panel__title">Yard record</h2>
        <button className="icon-btn" onClick={props.onClose}>
          Close
        </button>
      </div>
      <div className="panel__body">
        {page === 0 ? (
          <>
            <dl>
              <dt>Tick</dt>
              <dd>{props.state.tick}</dd>
              <dt>Machines</dt>
              <dd>{props.state.machines.length}</dd>
              <dt>Links</dt>
              <dd>{props.state.routes.length}</dd>
              <dt>Credits</dt>
              <dd>{props.state.credits}</dd>
              <dt>Save</dt>
              <dd>{props.exportText.length} characters</dd>
            </dl>
            <label className="panel__field" htmlFor={exportId}>
              Saved yard
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
                Copy
              </button>
              <button className="icon-btn" onClick={() => setPage(1)}>
                Import
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="status-line">Paste a saved yard, then Apply.</p>
            <label className="panel__field" htmlFor={importId}>
              Pasted text
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
                Apply
              </button>
              <button className="icon-btn" onClick={() => setPage(0)}>
                Back
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
    `Away ${formatDuration(report.awayTicks)}`,
    report.capped
      ? `Your operation worked for ${formatDuration(report.creditedTicks)} (capped)`
      : `Your operation worked for ${formatDuration(report.creditedTicks)}`,
  ];
  return (
    <div className="panel" role="group" aria-label="Return report">
      <div className="panel__head">
        <h2 className="panel__title">While you were away</h2>
        <button className="icon-btn" onClick={props.onClose}>
          Back to yard
        </button>
      </div>
      <div className="panel__body">
      <dl>
        {summary.map((line) => (
          <div key={line}>
            <dt>Time</dt>
            <dd>{line}</dd>
          </div>
        ))}
        {gains.slice(0, 4).map(([key, value]) => (
          <div key={key}>
            <dt>{RESOURCE_LABEL[key] ?? key}</dt>
            <dd>+{formatNumber(value)}</dd>
          </div>
        ))}
        <dt>Deliveries</dt>
        <dd>{report.deliveries}</dd>
        <dt>Batches</dt>
        <dd>{report.batchesDone}</dd>
        {report.bottleneck ? (
          <>
            <dt>Bottleneck</dt>
            <dd>{report.bottleneck}</dd>
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
      const source = plan.from === 0 ? "dock" : labelOf(state, plan.from);
      const target = plan.to === 0 ? "dock" : labelOf(state, plan.to);
      const thing =
        plan.filter === null
          ? "cargo"
          : (RESOURCE_LABEL[plan.filter] ?? plan.filter);
      return `${source} to ${target} carries ${thing}`;
    })
    .join("; ");
}

function labelOf(state: SimState, machineId: number): string {
  const machine = state.machines.find((m) => m.id === machineId);
  return machine
    ? BLUEPRINTS[machine.blueprint].label.toLowerCase()
    : "machine";
}

function describeInputs(recipe: {
  inputs: readonly { resource: ResourceId; qty: number }[];
}): string {
  return recipe.inputs
    .map((item) => `${item.qty} ${RESOURCE_LABEL[item.resource]}`)
    .join(", ");
}

function describeOutputs(recipe: {
  outputs: readonly { resource: ResourceId; qty: number }[];
}): string {
  return recipe.outputs
    .map((item) => `${item.qty} ${RESOURCE_LABEL[item.resource]}`)
    .join(", ");
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}
