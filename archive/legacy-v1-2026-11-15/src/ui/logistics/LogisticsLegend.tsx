/**
 * UI-RESET-59 (G3): the route legend and the belt-layer visibility toggle. Hosted inside
 * the inspector's Transport section (no new section landmark, no Hud edit). The status
 * swatches reuse the exact canvas rail colours, the material swatches list only what the
 * yard's belts actually carry, and the toggle flips the shared view bridge so the canvas
 * skips the route layer without removing any route.
 */
import type { SimState } from "../../game/simulation/types";
import { LOGISTICS_COPY } from "./copy";
import { ROUTE_STATUS_COLORS, routeMaterials } from "./material";
import { toggleRoutesVisible } from "./view";
import { useLogisticsView } from "./useLogisticsView";

const STATUS_ROWS = [
  { key: "working", label: LOGISTICS_COPY.legend.working, hint: LOGISTICS_COPY.legend.workingHint },
  { key: "idle", label: LOGISTICS_COPY.legend.idle, hint: LOGISTICS_COPY.legend.idleHint },
  { key: "blocked", label: LOGISTICS_COPY.legend.blocked, hint: LOGISTICS_COPY.legend.blockedHint },
] as const;

export function LogisticsLegend(props: { state: SimState }) {
  const view = useLogisticsView();
  const materials = routeMaterials(props.state);
  return (
    <div className="logistics-legend">
      <h4 className="logistics-subtitle">{LOGISTICS_COPY.legend.title}</h4>
      <p className="logistics-note">{LOGISTICS_COPY.legend.direction}</p>
      <ul className="logistics-legend__statuses">
        {STATUS_ROWS.map((row) => (
          <li key={row.key} className="logistics-legend__status">
            <span
              className="logistics-swatch logistics-swatch--rail"
              style={{ background: ROUTE_STATUS_COLORS[row.key] }}
              aria-hidden="true"
            />
            <span className="logistics-legend__label">{row.label}</span>
            <span className="logistics-legend__hint">{row.hint}</span>
          </li>
        ))}
      </ul>
      <div className="logistics-legend__materials">
        <span className="logistics-legend__label">{LOGISTICS_COPY.legend.materials}</span>
        {materials.length === 0 ? (
          <span className="logistics-legend__hint">{LOGISTICS_COPY.legend.noMaterials}</span>
        ) : (
          <ul className="logistics-legend__swatches">
            {materials.map((swatch) => (
              <li key={swatch.resource ?? "any"} className="logistics-legend__material">
                <span
                  className="logistics-swatch"
                  style={{ background: swatch.color }}
                  aria-hidden="true"
                />
                <span>{swatch.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        className="logistics-btn logistics-toggle"
        aria-pressed={view.routesVisible}
        onClick={() => toggleRoutesVisible()}
      >
        {view.routesVisible
          ? LOGISTICS_COPY.legend.visibilityOn
          : LOGISTICS_COPY.legend.visibilityOff}
      </button>
      <p className="logistics-note">{LOGISTICS_COPY.legend.visibilityHint}</p>
    </div>
  );
}
