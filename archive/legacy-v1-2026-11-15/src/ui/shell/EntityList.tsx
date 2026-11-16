import { memo, useState } from "react";
import { BLUEPRINTS } from "../../game/content/defs";
import { DOCK_TILE, YARD_COLS } from "../../game/simulation/commands";
import { fleetUnits, type DroneState, type SimState } from "../../game/simulation/types";
import type { Cell } from "../../game/world/types";
import { STATUS_LABEL } from "../text";
import {
  cellLabel,
  fleetRows,
  waitReasonText,
  type RoadLogisticsApi,
} from "../logistics/fleetModel";
import { useRoadLogistics } from "../logistics/useRoadLogistics";
import { ROAD_FLEET_COPY } from "../logistics/copy";
import { ENTITY_COPY, FLEET_COPY } from "./copy";

/**
 * RW3D #151 (U04): the keyboard / screen-reader entity enumeration.
 *
 * The 3D canvas selects buildings by raycast alone, which no keyboard or
 * screen-reader user can reach. This list is the accessible equivalent: every
 * building and unit is a real <button> inside a labelled list, named with its
 * kind, id, level and a WORDED status (the engine's own STATUS_LABEL / fleet
 * words — never color alone). Buildings come first in the engine's stable
 * `state.machines` order, then units (drones in `fleetUnits` order, then road
 * carriers in the engine's carrier order).
 *
 * Activating a building calls `onSelectMachine(id)` — App pushes the inspector
 * onto the one-panel stack (the list stacks underneath, Back/Escape unwinds).
 * Activating a unit calls `onFocusCell(cell)` — camera only, the panel stays.
 * Drones have no fixed cell (they fly store <-> machine), so they focus the
 * dock cell they operate from. The single `role="status"` line announces the
 * last activation ONLY — it is event-driven, never per-tick (the #66 census
 * rule). Long lists scroll inside the panel's one declared `.panel__body`
 * scroller; rows keep the 44 px target floor at every text scale.
 */

/** The dock/store cell in the world-grid cell space `focusWorldCell` paints in. */
const DOCK_CELL: Cell = { x: DOCK_TILE % YARD_COLS, y: Math.floor(DOCK_TILE / YARD_COLS) };

function droneStatus(unit: DroneState): string {
  if (!unit.repaired) return FLEET_COPY.statusBroken;
  return unit.inFlight ? FLEET_COPY.statusFlying : FLEET_COPY.statusIdle;
}

/** One row: a native button whose accessible name is the full worded identity. */
function EntityRow(props: {
  kind: "building" | "drone" | "truck";
  entityId: number;
  name: string;
  detail: string;
  ariaLabel: string;
  onActivate: () => void;
}) {
  return (
    <li className="entity-list__item">
      <button
        type="button"
        className="entity-list__row"
        data-entity={props.kind}
        data-entity-id={props.entityId}
        aria-label={props.ariaLabel}
        onClick={props.onActivate}
      >
        <span className="entity-list__name">{props.name}</span>
        <span className="entity-list__status">{props.detail}</span>
      </button>
    </li>
  );
}

/** Road carriers, read through the same session capability FleetPanel uses. */
const RoadUnits = memo(function RoadUnits(props: {
  api: RoadLogisticsApi;
  onFocusCell: (cell: Cell) => void;
  onAnnounce: (text: string) => void;
}) {
  const { logistics, traffic } = useRoadLogistics(props.api);
  const rows = fleetRows(logistics, traffic);
  return (
    <>
      {rows.map((row) => {
        const status =
          row.wait !== null
            ? waitReasonText(row.wait)
            : row.job !== null
              ? `${ROAD_FLEET_COPY.job} ${row.job.id} · ${row.job.phase}`
              : ROAD_FLEET_COPY.idle;
        const name = `${ENTITY_COPY.truck} ${row.carrier.id}`;
        return (
          <EntityRow
            key={`truck-${row.carrier.id}`}
            kind="truck"
            entityId={row.carrier.id}
            name={name}
            detail={`${status} · ${ENTITY_COPY.cell} ${cellLabel(row.cell)}`}
            ariaLabel={`${name}, ${status}, ${ENTITY_COPY.cell} ${cellLabel(row.cell)}`}
            onActivate={() => {
              props.onFocusCell(row.cell);
              props.onAnnounce(`${ENTITY_COPY.focused} ${name}`);
            }}
          />
        );
      })}
    </>
  );
});

export const EntityList = memo(function EntityList(props: {
  state: SimState;
  onSelectMachine: (machineId: number) => void;
  onFocusCell: (cell: Cell) => void;
  /** The additive road capability; omitted mounts list buildings + drones only. */
  road?: RoadLogisticsApi;
}) {
  const { state } = props;
  // Event-driven only: this changes on an activation, never on a sim tick.
  const [announcement, setAnnouncement] = useState("");
  const units = fleetUnits(state);
  return (
    <section className="entity-list" aria-label={ENTITY_COPY.title}>
      <h3 className="entity-list__heading">{ENTITY_COPY.title}</h3>
      <p className="status-line">{ENTITY_COPY.lead}</p>
      <p className="status-line entity-list__announce" role="status">
        {announcement}
      </p>
      <h4 className="entity-list__heading">{ENTITY_COPY.buildings}</h4>
      {state.machines.length === 0 ? (
        <p className="status-line">{ENTITY_COPY.emptyBuildings}</p>
      ) : (
        <ul className="entity-list__group" aria-label={ENTITY_COPY.buildings}>
          {state.machines.map((machine) => {
            const def = BLUEPRINTS[machine.blueprint];
            const status = STATUS_LABEL[machine.status] ?? machine.status;
            const name = `${def.label} ${machine.id}`;
            const detail = `${ENTITY_COPY.level} ${machine.level} · ${status} · ${ENTITY_COPY.cell} ${machine.tile}`;
            return (
              <EntityRow
                key={`building-${machine.id}`}
                kind="building"
                entityId={machine.id}
                name={name}
                detail={detail}
                ariaLabel={`${name}, ${ENTITY_COPY.level} ${machine.level}, ${status}, ${ENTITY_COPY.cell} ${machine.tile}`}
                onActivate={() => {
                  props.onSelectMachine(machine.id);
                  setAnnouncement(`${ENTITY_COPY.inspecting} ${name}`);
                }}
              />
            );
          })}
        </ul>
      )}
      <h4 className="entity-list__heading">{ENTITY_COPY.units}</h4>
      {units.length === 0 && props.road === undefined ? (
        <p className="status-line">{ENTITY_COPY.emptyUnits}</p>
      ) : (
        <ul className="entity-list__group" aria-label={ENTITY_COPY.units}>
          {units.map((unit, index) => {
            const status = droneStatus(unit);
            const name = `${FLEET_COPY.unit} ${index + 1}`;
            const detail = `${status} · ${FLEET_COPY.deliveries} ${unit.deliveries}`;
            return (
              <EntityRow
                key={`drone-${index}`}
                kind="drone"
                entityId={index + 1}
                name={name}
                detail={detail}
                ariaLabel={`${name}, ${status}, ${FLEET_COPY.deliveries} ${unit.deliveries}`}
                onActivate={() => {
                  props.onFocusCell(DOCK_CELL);
                  setAnnouncement(`${ENTITY_COPY.focused} ${name}`);
                }}
              />
            );
          })}
          {props.road !== undefined ? (
            <RoadUnits
              api={props.road}
              onFocusCell={props.onFocusCell}
              onAnnounce={setAnnouncement}
            />
          ) : null}
        </ul>
      )}
    </section>
  );
});
