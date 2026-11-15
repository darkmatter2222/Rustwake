import { memo } from "react";
import type { SimState } from "../../game/simulation/types";
import type { Cell } from "../../game/world/types";
import { t } from "../../game/content/strings";
import { Row } from "../panels/shared";
import type { RoadLogisticsApi } from "../logistics/fleetModel";
import { MAP_COPY } from "./copy";
import { EntityList } from "./EntityList";

/**
 * RW3D #135 (U03): the Map destination. A read-only region card for the yard
 * the player is recovering, counted straight from the authoritative state.
 * New regions are story/research content owned by another lane; this panel
 * states the recovery hint rather than inventing a region the engine does not
 * simulate.
 *
 * RW3D #151 (U04): below the region card, the accessible entity enumeration.
 * The canvas raycast is mouse-only, so this list is the keyboard/screen-reader
 * path to every building (inspector) and unit (camera focus). The callbacks
 * are optional so legacy mounts (and their test doubles) keep working; App
 * wires `openPanel` / `focusWorldCell` and the same road capability FleetPanel
 * gets. The panel's one declared `.panel__body` scroller contains long lists.
 */
export const MapPanel = memo(function MapPanel(props: {
  state: SimState;
  onClose: () => void;
  onSelectMachine?: (machineId: number) => void;
  onFocusCell?: (cell: Cell) => void;
  road?: RoadLogisticsApi;
}) {
  const { state } = props;
  return (
    <div className="panel panel--stack panel--map" role="group" aria-label={MAP_COPY.title}>
      <div className="panel__head">
        <h2 className="panel__title">{MAP_COPY.title}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <p className="status-line">{MAP_COPY.lead}</p>
        <div className="shell-region shell-region--active">
          <span className="shell-region__name">{MAP_COPY.region}</span>
          <span className="shell-region__state">{MAP_COPY.regionActive}</span>
        </div>
        <dl>
          <Row label={MAP_COPY.machines} value={state.machines.length} />
          <Row label={MAP_COPY.routes} value={state.routes.length} />
          <Row label={MAP_COPY.storeUnits} value={`${state.storeUnits} / ${state.storeCapacity}`} />
          <Row label={MAP_COPY.wreck} value={state.wreck.remaining} />
        </dl>
        <p className="status-line" role="note">
          {MAP_COPY.lockedHint}
        </p>
        {props.onSelectMachine !== undefined && props.onFocusCell !== undefined ? (
          <EntityList
            state={state}
            onSelectMachine={props.onSelectMachine}
            onFocusCell={props.onFocusCell}
            road={props.road}
          />
        ) : null}
      </div>
    </div>
  );
});
