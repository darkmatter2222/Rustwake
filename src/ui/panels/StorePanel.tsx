import {
  TUNING,
  exportPrice,
  type ResourceId,
} from "../../game/content/defs";
import type { SimState } from "../../game/simulation/types";
import type { Command } from "../../game/simulation/commands";
import { sellableAmount } from "../../game/simulation/commands";
import { yardSummary } from "../../game/simulation/diagnostics";
import { RESOURCE_LABEL, formatNumber } from "../text";
import { plural, t } from "../../game/content/strings";
import { Row, nextId } from "./shared";

export function StorePanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  const rows = (Object.keys(props.state.store) as ResourceId[]).filter(
    (key) => (props.state.store[key] ?? 0) > 0,
  );
  /**
   * The capacity fact once (UI-002, finding N-2). `Capacity` prints `20/900` as its own
   * row, so the yard-summary line that repeats the very same pair in parentheses is the
   * duplicate: the row stays (a label and a number the player can point at), the repeated
   * pair goes. Every other summary line keeps its place.
   */
  const capacityFact = `${formatNumber(props.state.storeUnits)}/${formatNumber(
    props.state.storeCapacity
  )}`;
  const summaryLines = yardSummary(props.state).filter((line) => !line.includes(capacityFact));
  return (
    <div className="panel panel--stack" role="group" aria-label={t("aria.storeContents")}>
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
            <Row key={key} label={RESOURCE_LABEL[key] ?? key} value={formatNumber(props.state.store[key] ?? 0)}>
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
            </Row>
          );
        })}
        <Row label={t("row.capacity")} value={capacityFact} />
        {summaryLines.map((line) => (
          <Row key={line} label={t("row.measured")} value={line} />
        ))}
        {props.state.exportClaimed ? (
          <Row
            label={t("row.sellFloor")}
            value={t("value.sellFloor", {
              count: TUNING.reserveFloor,
              units: plural(TUNING.reserveFloor, t("unit.unit")),
            })}
          />
        ) : (
          <Row label={t("row.sell")} value={t("value.sellOpens")} />
        )}
        {props.state.overflow.length > 0 ? (
          <Row
            label={t("row.overflow")}
            value={props.state.overflow.reduce((total, item) => total + item.qty, 0)}
          />
        ) : null}
      </dl>
      </div>
    </div>
  );
}