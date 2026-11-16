/**
 * UI-RESET-59 (G3): the connect / disconnect / filter controls, hosted in the inspector's
 * Transport section. Every capability the simulation actually supports is exposed with a
 * cost/validity preview and an explicit Cancel; every tap goes through `props.dispatch`
 * (the real command path), never a direct state mutation.
 *
 * Capability map (honest, no fake controls):
 * - Connect: lays the suggested links (`planConnections`) or a custom endpoint/material pair
 *   via `route.connect`. The preview prices the run with the engine's `beltRun`/`beltCost`
 *   and mirrors `connectRoute` validation.
 * - Disconnect: removes a laid link via `route.remove`; the preview shows the engine's
 *   `refundOf` belt refund plus any in-flight cargo returned.
 * - Filter: chosen when a belt is laid. There is NO in-place filter-edit command, so the
 *   panel says so plainly and offers disconnect + re-lay instead of a disabled fake control.
 *
 * These buttons use `.logistics-btn`, never `.panel__actions > .icon-btn`, so the pinned
 * three-face action row and its first-child accent are untouched.
 */
import { useState } from "react";
import { BLUEPRINTS, RESOURCES, type ResourceId } from "../../game/content/defs";
import type { MachineState, SimState } from "../../game/simulation/types";
import type { Command } from "../../game/simulation/commands";
import { planConnections } from "../../game/simulation/autoconnect";
import { beltExtentLine, RESOURCE_LABEL } from "../text";
import { formatNumber, resourceWord, t, unit } from "../../game/content/strings";
import { nextId } from "../panels/shared";
import { LOGISTICS_COPY, connectRejectText } from "./copy";
import { materialColor } from "./material";
import { cargoName, previewConnect, previewRemove, routeStatus } from "./model";
import { setFocusedRoute } from "./view";
import { useLogisticsView } from "./useLogisticsView";

type Pending =
  | { type: "plans" }
  | { type: "remove"; routeId: number }
  | { type: "custom"; from: number; to: number; filter: ResourceId | null };

function endpointLabel(state: SimState, id: number): string {
  if (id === 0) return LOGISTICS_COPY.controls.store;
  const machine = state.machines.find((m) => m.id === id);
  return machine ? BLUEPRINTS[machine.blueprint].label.toLocaleLowerCase() : t("unit.machine");
}

export function RouteControls(props: {
  state: SimState;
  machine: MachineState;
  dispatch: (command: Command) => unknown;
}) {
  const { state, machine, dispatch } = props;
  const view = useLogisticsView();
  const [pending, setPending] = useState<Pending | null>(null);
  const [from, setFrom] = useState<number>(machine.id);
  const [to, setTo] = useState<number>(0);
  const [filter, setFilter] = useState<ResourceId | null>(null);

  const plans = planConnections(state, machine.id);
  const links = state.routes.filter((r) => r.from.id === machine.id || r.to.id === machine.id);

  const confirm = () => {
    if (pending === null) return;
    if (pending.type === "plans") {
      for (const plan of plans) {
        dispatch({ id: nextId("r"), type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
      }
    } else if (pending.type === "remove") {
      dispatch({ id: nextId("x"), type: "route.remove", routeId: pending.routeId });
    } else {
      dispatch({ id: nextId("r"), type: "route.connect", from: pending.from, to: pending.to, filter: pending.filter });
    }
    setPending(null);
  };

  return (
    <div className="logistics-controls">
      <h4 className="logistics-subtitle">{LOGISTICS_COPY.controls.title}</h4>

      <div className="logistics-controls__group">
        <span className="logistics-legend__label">{LOGISTICS_COPY.controls.pending}</span>
        {plans.length === 0 ? (
          <p className="logistics-note">{LOGISTICS_COPY.controls.noPending}</p>
        ) : (
          <>
            <ul className="logistics-routes">
              {plans.map((plan) => (
                <li key={`${plan.from}>${plan.to}:${plan.filter ?? "*"}`} className="logistics-route">
                  <span
                    className="logistics-swatch"
                    style={{ background: materialColor(plan.filter) }}
                    aria-hidden="true"
                  />
                  <span className="logistics-route__path">
                    {endpointLabel(state, plan.from)} → {endpointLabel(state, plan.to)}
                  </span>
                  <span className="logistics-route__meta">
                    {cargoName(plan.filter)} · {plan.tiles} {LOGISTICS_COPY.controls.tiles} ·{" "}
                    {unit(plan.tiles, resourceWord("scrap"))}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="logistics-btn" onClick={() => setPending({ type: "plans" })}>
              {LOGISTICS_COPY.controls.connect}
            </button>
          </>
        )}
      </div>

      <div className="logistics-controls__group">
        <span className="logistics-legend__label">{LOGISTICS_COPY.controls.laid}</span>
        {links.length === 0 ? (
          <p className="logistics-note">{LOGISTICS_COPY.controls.noLaid}</p>
        ) : (
          <ul className="logistics-routes">
            {links.map((route) => {
              const status = routeStatus(state, route);
              const focused = view.focusedRouteId === route.id;
              const removal = previewRemove(state, route.id);
              return (
                <li key={route.id} className="logistics-route">
                  <span
                    className="logistics-swatch"
                    style={{ background: materialColor(route.filter) }}
                    aria-hidden="true"
                  />
                  <span className="logistics-route__path">
                    {endpointLabel(state, route.from.id)} → {endpointLabel(state, route.to.id)}
                  </span>
                  <span className="logistics-route__meta">
                    {cargoName(route.filter)} · {beltExtentLine(route)} ·{" "}
                    {LOGISTICS_COPY.status[status].toLocaleLowerCase()}
                  </span>
                  <span className="logistics-route__actions">
                    <button
                      type="button"
                      className="logistics-btn"
                      aria-pressed={focused}
                      onClick={() => setFocusedRoute(focused ? null : route.id)}
                    >
                      {LOGISTICS_COPY.controls.focus}
                    </button>
                    <button
                      type="button"
                      className="logistics-btn logistics-btn--danger"
                      onClick={() => setPending({ type: "remove", routeId: route.id })}
                    >
                      {LOGISTICS_COPY.controls.disconnect}
                    </button>
                    <span className="logistics-route__refund">
                      +{unit(removal.refund, resourceWord("scrap"))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="logistics-controls__group">
        <span className="logistics-legend__label">{LOGISTICS_COPY.controls.custom}</span>
        <div className="logistics-form">
          <label className="logistics-field">
            <span>{LOGISTICS_COPY.controls.from}</span>
            <select
              className="logistics-select"
              value={from}
              onChange={(event) => setFrom(Number(event.target.value))}
            >
              <option value={0}>{LOGISTICS_COPY.controls.store}</option>
              {state.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {BLUEPRINTS[m.blueprint].label}
                </option>
              ))}
            </select>
          </label>
          <label className="logistics-field">
            <span>{LOGISTICS_COPY.controls.to}</span>
            <select
              className="logistics-select"
              value={to}
              onChange={(event) => setTo(Number(event.target.value))}
            >
              <option value={0}>{LOGISTICS_COPY.controls.store}</option>
              {state.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {BLUEPRINTS[m.blueprint].label}
                </option>
              ))}
            </select>
          </label>
          <label className="logistics-field">
            <span>{LOGISTICS_COPY.controls.filter}</span>
            <select
              className="logistics-select"
              value={filter ?? ""}
              onChange={(event) => setFilter(event.target.value === "" ? null : (event.target.value as ResourceId))}
            >
              <option value="">{LOGISTICS_COPY.controls.anyCargo}</option>
              {RESOURCES.map((resource) => (
                <option key={resource} value={resource}>
                  {RESOURCE_LABEL[resource] ?? resource}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CustomPreview state={state} from={from} to={to} filter={filter} />
        <button
          type="button"
          className="logistics-btn"
          onClick={() => setPending({ type: "custom", from, to, filter })}
        >
          {LOGISTICS_COPY.controls.connect}
        </button>
        <p className="logistics-note">{LOGISTICS_COPY.controls.filterNote}</p>
        <p className="logistics-note logistics-note--unsupported">{LOGISTICS_COPY.controls.unsupported}</p>
      </div>

      {pending !== null ? (
        <div className="logistics-confirm" role="group" aria-label={LOGISTICS_COPY.controls.preview}>
          <ConfirmPreview state={state} pending={pending} plans={plans} />
          <div className="logistics-confirm__actions">
            <button type="button" className="logistics-btn logistics-btn--primary" onClick={confirm}>
              {LOGISTICS_COPY.controls.connect}
            </button>
            <button type="button" className="logistics-btn" onClick={() => setPending(null)}>
              {LOGISTICS_COPY.controls.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CustomPreview(props: { state: SimState; from: number; to: number; filter: ResourceId | null }) {
  const preview = previewConnect(props.state, props.from, props.to, props.filter);
  return (
    <p className={`logistics-note${preview.ok ? "" : " logistics-note--invalid"}`}>
      {preview.ok
        ? `${LOGISTICS_COPY.controls.valid} ${preview.tiles} ${LOGISTICS_COPY.controls.tiles} · ${unit(preview.cost, resourceWord("scrap"))}.`
        : connectRejectText(preview.reason ?? "not-found")}
    </p>
  );
}

function ConfirmPreview(props: {
  state: SimState;
  pending: Pending;
  plans: ReturnType<typeof planConnections>;
}) {
  const { state, pending, plans } = props;
  if (pending.type === "remove") {
    const removal = previewRemove(state, pending.routeId);
    return (
      <p className="logistics-note">
        {LOGISTICS_COPY.controls.disconnect}: +{unit(removal.refund, resourceWord("scrap"))}{" "}
        {LOGISTICS_COPY.controls.refund.toLocaleLowerCase()}
        {removal.cargo > 0
          ? ` · ${formatNumber(removal.cargo)} ${LOGISTICS_COPY.controls.cargoReturned}`
          : ""}
        .
      </p>
    );
  }
  const pairs =
    pending.type === "plans"
      ? plans.map((plan) => ({ from: plan.from, to: plan.to, filter: plan.filter }))
      : [{ from: pending.from, to: pending.to, filter: pending.filter }];
  const previews = pairs.map((pair) => previewConnect(state, pair.from, pair.to, pair.filter));
  const totalCost = previews.reduce((sum, preview) => sum + preview.cost, 0);
  const totalTiles = previews.reduce((sum, preview) => sum + preview.tiles, 0);
  const firstBad = previews.find((preview) => !preview.ok);
  return (
    <p className={`logistics-note${firstBad ? " logistics-note--invalid" : ""}`}>
      {firstBad
        ? connectRejectText(firstBad.reason ?? "not-found")
        : `${LOGISTICS_COPY.controls.valid} ${totalTiles} ${LOGISTICS_COPY.controls.tiles} · ${unit(totalCost, resourceWord("scrap"))}.`}
    </p>
  );
}
