/**
 * UI-RESET-59 (G3): the yard production/power overview and the bottleneck list. Hosted
 * inside the inspector's Bottleneck section. Every value is derived from state by
 * `deriveLogistics`; each bottleneck offers "Show route", which focuses a belt touching the
 * affected machine on the canvas through the shared view bridge (a real, visible effect).
 *
 * Selection swap is deliberately not offered here: the App contract exposes no selection
 * callback and `App.tsx` is owned by #62, so the overview reveals the route on the canvas
 * and tells the player to open the machine from the yard. This limitation is documented in
 * the handoff rather than worked around with a forbidden edit.
 */
import type { SimState } from "../../game/simulation/types";
import { formatNumber, wholePercent } from "../../game/content/strings";
import { LOGISTICS_COPY } from "./copy";
import { deriveLogistics, throughputLine } from "./model";
import { setFocusedRoute } from "./view";
import { useLogisticsView } from "./useLogisticsView";

export function LogisticsOverview(props: { state: SimState }) {
  const view = useLogisticsView();
  const model = deriveLogistics(props.state);
  const powerPercent = wholePercent(model.power.ratio);
  const { production, routes, power } = model;

  return (
    <div className="logistics-overview">
      <h4 className="logistics-subtitle">{LOGISTICS_COPY.overview.title}</h4>

      <div className="logistics-overview__power">
        <div className="logistics-overview__row">
          <span className="logistics-legend__label">{LOGISTICS_COPY.overview.power}</span>
          <span className="logistics-overview__value">
            {formatNumber(power.requested)}/{formatNumber(power.capacity)} · {powerPercent}%
          </span>
        </div>
        <div
          className="logistics-gauge"
          role="progressbar"
          aria-valuenow={powerPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={LOGISTICS_COPY.overview.power}
        >
          <div
            className={`logistics-gauge__fill${power.limited ? " logistics-gauge__fill--limited" : ""}`}
            style={{ width: `${powerPercent}%` }}
          />
        </div>
        <p className="logistics-note">
          {power.limited
            ? LOGISTICS_COPY.overview.powerLimited
            : LOGISTICS_COPY.overview.powerHealthy}
        </p>
      </div>

      <dl className="logistics-overview__stats">
        <div className="logistics-overview__row">
          <dt className="logistics-legend__label">{LOGISTICS_COPY.overview.production}</dt>
          <dd className="logistics-overview__value">{throughputLine(model)}</dd>
        </div>
        <div className="logistics-overview__row">
          <dt className="logistics-legend__label">{LOGISTICS_COPY.overview.routes}</dt>
          <dd className="logistics-overview__value">
            {routes.total} total · {routes.working} {LOGISTICS_COPY.status.working.toLocaleLowerCase()} ·{" "}
            {routes.idle} {LOGISTICS_COPY.status.idle.toLocaleLowerCase()} · {routes.blocked}{" "}
            {LOGISTICS_COPY.status.blocked.toLocaleLowerCase()}
          </dd>
        </div>
        <div className="logistics-overview__row">
          <dt className="logistics-legend__label">Machines</dt>
          <dd className="logistics-overview__value">
            {production.running} running · {production.starved} starved · {production.outputFull} full ·{" "}
            {production.idle} idle
          </dd>
        </div>
      </dl>

      <div className="logistics-overview__bottlenecks">
        <span className="logistics-legend__label">{LOGISTICS_COPY.overview.bottlenecks}</span>
        {model.bottlenecks.length === 0 ? (
          <p className="logistics-note">{LOGISTICS_COPY.overview.noBottlenecks}</p>
        ) : (
          <ul className="logistics-bottlenecks">
            {model.bottlenecks.map((bottleneck) => {
              const focused = view.focusedRouteId !== null && view.focusedRouteId === bottleneck.routeId;
              return (
                <li key={`${bottleneck.machineId}-${bottleneck.kind}`} className="logistics-bottleneck">
                  <div className="logistics-bottleneck__text">
                    <span className="logistics-bottleneck__label">{bottleneck.label}</span>
                    <span className="logistics-bottleneck__detail">{bottleneck.detail}</span>
                  </div>
                  {bottleneck.routeId !== null ? (
                    <button
                      type="button"
                      className="logistics-btn"
                      aria-pressed={focused}
                      onClick={() => setFocusedRoute(focused ? null : bottleneck.routeId)}
                    >
                      {focused ? LOGISTICS_COPY.overview.hideRoute : LOGISTICS_COPY.overview.showRoute}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <p className="logistics-note">{LOGISTICS_COPY.overview.selectNote}</p>
      </div>
    </div>
  );
}
