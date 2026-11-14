import { memo } from "react";
import { TUNING } from "../../game/content/defs";
import { droneAddCost, type Command, type CommandResult } from "../../game/simulation/commands";
import { fleetUnits, type DroneState, type SimState } from "../../game/simulation/types";
import { resourceWord, t } from "../../game/content/strings";
import { Row, nextId } from "../panels/shared";
import { FLEET_COPY, SHELL_COPY } from "./copy";

function statusOf(unit: DroneState): string {
  if (!unit.repaired) return FLEET_COPY.statusBroken;
  return unit.inFlight ? FLEET_COPY.statusFlying : FLEET_COPY.statusIdle;
}

/**
 * RW3D #135 (U03): the Fleet destination. The starter drone plus every spare,
 * in the engine's own stable order, with the same `drone.repair` / `drone.add`
 * commands the dock ladder uses. The add face prints the engine's exponential
 * price and stands down at the fleet cap or before the first repair — the
 * simulation remains the single authority on what is allowed.
 */
export const FleetPanel = memo(function FleetPanel(props: {
  state: SimState;
  dispatch: (command: Command) => CommandResult;
  onClose: () => void;
}) {
  const { state } = props;
  const units = fleetUnits(state);
  const full = units.length >= TUNING.fleetCap;
  const addCost = droneAddCost(state);
  return (
    <div className="panel panel--stack panel--fleet" role="group" aria-label={FLEET_COPY.title}>
      <div className="panel__head">
        <h2 className="panel__title">{FLEET_COPY.title}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <p className="status-line">{FLEET_COPY.lead}</p>
        <dl>
          <Row label={SHELL_COPY.fleetSize} value={`${units.length} / ${TUNING.fleetCap}`} />
        </dl>
        <div className="panel__actions">
          <button
            className="icon-btn"
            disabled={state.drone.repaired}
            onClick={() => props.dispatch({ id: nextId("fleet"), type: "drone.repair" })}
          >
            {FLEET_COPY.repair} · {TUNING.repairCostScrap} {resourceWord("scrap")}
          </button>
          <button
            className="icon-btn"
            disabled={!state.drone.repaired || full}
            onClick={() => props.dispatch({ id: nextId("fleet"), type: "drone.add" })}
          >
            {full ? FLEET_COPY.fleetFull : `${FLEET_COPY.add} · ${addCost} credits`}
          </button>
        </div>
        {!state.drone.repaired ? (
          <p className="status-line" role="note">
            {FLEET_COPY.needsRepair}
          </p>
        ) : null}
        <ul className="shell-list">
          {units.map((unit, index) => (
            <li key={index} className="shell-list__item">
              <span className="shell-list__label">
                {FLEET_COPY.unit} {index + 1}
                <span className="status-line">
                  {statusOf(unit)} · {FLEET_COPY.deliveries} {unit.deliveries}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
});