import { useState } from "react";
import { BLUEPRINTS, RECIPES, type ResourceId } from "../game/content/defs";
import type { MachineState, SimState } from "../game/simulation/types";
import type { Command } from "../game/simulation/commands";
import { upgradeCost } from "../game/simulation/commands";
import type { ReturnReport } from "../game/simulation/offline";
import { RESOURCE_LABEL, STATUS_LABEL, formatDuration, formatNumber } from "./text";

export function MachinePanel(props: {
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
  const elapsed = Math.max(1, props.tick) / 10;
  const actualRate = machine.batchesDone / elapsed;
  const cost = upgradeCost(def.baseUpgradeCost, machine.level);
  const [page, setPage] = useState(0);

  return (
    <div className="panel" role="group" aria-label={`${def.label} details`}>
      <h2 className="panel__title">{def.label}</h2>
      {page === 0 ? (
        <dl>
          <dt>Status</dt>
          <dd>{STATUS_LABEL[machine.status] ?? machine.status}</dd>
          <dt>Batch</dt>
          <dd>
            {Math.min(100, Math.round((machine.progress / Math.max(1, machine.batchMilli)) * 100))}%
          </dd>
          <dt>Cycle</dt>
          <dd>{effectiveSeconds.toFixed(2)}s</dd>
          <dt>Actual rate</dt>
          <dd>{actualRate.toFixed(2)} batches/s</dd>
          <dt>Max rate</dt>
          <dd>{maxRate.toFixed(2)} batches/s at full power</dd>
          <dt>Power</dt>
          <dd>
            {machine.batchPower} units
            {props.powerRatio < 0.999 ? ` · Power limited: ${Math.round(props.powerRatio * 100)}% speed` : ""}
          </dd>
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
            {formatNumber(machine.inBufUnits)}/{def.inputBuffer}
          </dd>
          <dt>Tray</dt>
          <dd>
            {formatNumber(machine.trayUnits)}/{def.outputBuffer}
          </dd>
        </dl>
      )}
      <div className="panel__actions">
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({ id: nextId("u"), type: "machine.upgrade", machineId: machine.id })
          }
        >
          Upgrade · {cost} credits
        </button>
        <button className="icon-btn" onClick={() => setPage(page === 0 ? 1 : 0)}>
          {page === 0 ? "Recipe" : "Status"}
        </button>
        <button
          className="icon-btn"
          onClick={() =>
            props.dispatch({ id: nextId("d"), type: "machine.dismantle", machineId: machine.id })
          }
        >
          Dismantle
        </button>
        <button className="icon-btn" onClick={props.onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function StorePanel(props: { state: SimState; onClose: () => void }) {
  const rows = (Object.keys(props.state.store) as ResourceId[]).filter(
    (key) => (props.state.store[key] ?? 0) > 0
  );
  return (
    <div className="panel" role="group" aria-label="Store contents">
      <h2 className="panel__title">Yard store</h2>
      <dl>
        {rows.map((key) => (
          <div key={key}>
            <dt>{RESOURCE_LABEL[key] ?? key}</dt>
            <dd>{formatNumber(props.state.store[key] ?? 0)}</dd>
          </div>
        ))}
        <dt>Capacity</dt>
        <dd>
          {formatNumber(props.state.storeUnits)}/{formatNumber(props.state.storeCapacity)}
        </dd>
        {props.state.overflow.length > 0 ? (
          <>
            <dt>Overflow hold</dt>
            <dd>{props.state.overflow.reduce((total, item) => total + item.qty, 0)}</dd>
          </>
        ) : null}
      </dl>
      <div className="panel__actions">
        <button className="icon-btn" onClick={props.onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export function ReturnReportPanel(props: { report: ReturnReport; onClose: () => void }) {
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
      <h2 className="panel__title">While you were away</h2>
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
      <div className="panel__actions">
        <button className="icon-btn" onClick={props.onClose}>
          Back to yard
        </button>
      </div>
    </div>
  );
}

function describeInputs(recipe: { inputs: readonly { resource: ResourceId; qty: number }[] }): string {
  return recipe.inputs.map((item) => `${item.qty} ${RESOURCE_LABEL[item.resource]}`).join(", ");
}

function describeOutputs(recipe: { outputs: readonly { resource: ResourceId; qty: number }[] }): string {
  return recipe.outputs.map((item) => `${item.qty} ${RESOURCE_LABEL[item.resource]}`).join(", ");
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}
