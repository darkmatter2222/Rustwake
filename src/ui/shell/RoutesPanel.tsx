import { memo } from "react";
import type { Endpoint, SimState } from "../../game/simulation/types";
import type { Command, CommandResult } from "../../game/simulation/commands";
import { BLUEPRINTS } from "../../game/content/defs";
import { resourceWord, t } from "../../game/content/strings";
import { Row, nextId } from "../panels/shared";
import { ROUTES_COPY } from "./copy";

/** One endpoint as the player reads it: the store, or the machine's own name. */
function endpointLabel(state: SimState, endpoint: Endpoint): string {
  if (endpoint.kind === "store") return ROUTES_COPY.store;
  const machine = state.machines.find((m) => m.id === endpoint.id);
  const blueprint = machine ? BLUEPRINTS[machine.blueprint] : undefined;
  return blueprint ? blueprint.label : `Machine ${endpoint.id}`;
}

/**
 * RW3D #135 (U03): the Routes destination. Every conveyor link in the yard,
 * read straight from the authoritative state, with the engine's own
 * `route.remove` command behind each Remove face (belt refund and cargo
 * release stay the simulation's decision — the panel only dispatches).
 */
export const RoutesPanel = memo(function RoutesPanel(props: {
  state: SimState;
  dispatch: (command: Command) => CommandResult;
  onClose: () => void;
}) {
  const { state } = props;
  const inFlight = state.routes.reduce((sum, route) => sum + route.inFlight, 0);
  return (
    <div className="panel panel--stack panel--routes" role="group" aria-label={ROUTES_COPY.title}>
      <div className="panel__head">
        <h2 className="panel__title">{ROUTES_COPY.title}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <p className="status-line">{ROUTES_COPY.lead}</p>
        <dl>
          <Row
            label={ROUTES_COPY.overview}
            value={`${state.routes.length} · ${ROUTES_COPY.cargo} ${inFlight}`}
          />
        </dl>
        {state.routes.length === 0 ? (
          <p className="status-line">{ROUTES_COPY.empty}</p>
        ) : (
          <ul className="shell-list">
            {state.routes.map((route) => {
              const from = endpointLabel(state, route.from);
              const to = endpointLabel(state, route.to);
              return (
                <li key={route.id} className="shell-list__item">
                  <span className="shell-list__label">
                    {from} → {to}
                    <span className="status-line">
                      {ROUTES_COPY.filter}:{" "}
                      {route.filter ? resourceWord(route.filter) : ROUTES_COPY.any} ·{" "}
                      {ROUTES_COPY.cargo} {route.inFlight}
                    </span>
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={`${ROUTES_COPY.remove} ${from} → ${to}`}
                    onClick={() =>
                      props.dispatch({ id: nextId("route"), type: "route.remove", routeId: route.id })
                    }
                  >
                    {ROUTES_COPY.remove}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
});