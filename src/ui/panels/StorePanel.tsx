import { useState } from "react";
import { TUNING, type ResourceId } from "../../game/content/defs";
import type { SimState } from "../../game/simulation/types";
import type { Command } from "../../game/simulation/commands";
import { yardSummary } from "../../game/simulation/diagnostics";
import { RESOURCE_LABEL, formatNumber } from "../text";
import { plural, t } from "../../game/content/strings";
import { ResourceGlyph } from "../hud/Icons";
import { Row, nextId } from "./shared";
import { TradeCard } from "../store/TradeCard";
import {
  STORE_COPY,
  cueLine,
  recoveryOverflow,
  shareLine,
} from "../store/copy";
import {
  GROUP_ORDER,
  capacityShare,
  cuesFor,
  groupOf,
  resourcesInGroup,
  storageCause,
  tradeFaces,
  type StoreGroup,
} from "../store/model";
import "../store/store.css";

/**
 * UI-RESET-56 (issue #56): the yard store, rebuilt as three separated surfaces.
 *
 * 1. Trade desk — one card per sellable resource (dearest first), each with its
 *    glyph, stock, sellable tranche, a quantity stepper with direct entry and
 *    Max/Half presets, and the exact proceeds preview. The sell face keeps the
 *    shared `value.sellButton` arithmetic; the engine's `sellableAmount` is the
 *    only ceiling, so reserve floor, machine demand and the tranche cap are
 *    respected by construction and rapid taps can never oversell.
 * 2. Inventory — every resource, zero stock included, grouped raw / intermediate
 *    / finished by the content tables, each row carrying its glyph, stock,
 *    capacity share and a supply/demand cue read from the yard's own machines.
 * 3. Diagnostics — the capacity fact (printed exactly once), the measured yard
 *    summary, the sell floor or the contract lock, overflow, and — when full —
 *    the cause and the recovery options. Trade actions never live here.
 *
 * The preserved row grammar is untouched: inventory and diagnostics rows are the
 * same `.panel__row` flex lines (dt then dd as the first two direct children) inside
 * a one-column `.panel dl`, and `.panel__body` remains the one declared scroller.
 */

const GROUP_TITLE: Record<StoreGroup, string> = {
  raw: STORE_COPY.raw,
  intermediate: STORE_COPY.intermediate,
  finished: STORE_COPY.finished,
};

export function StorePanel(props: {
  state: SimState;
  dispatch: (command: Command) => unknown;
  onClose: () => void;
}) {
  /** Per-resource raw quantity entry; undefined means the default full tranche. */
  const [qtyRaw, setQtyRaw] = useState<Partial<Record<ResourceId, string>>>({});
  const faces = tradeFaces(props.state);
  const cause = storageCause(props.state);

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

  const recovery: string[] = [];
  if (cause.full) {
    if (!props.state.exportClaimed) recovery.push(t("value.sellOpens"));
    else if (faces.length > 0) recovery.push(STORE_COPY.recoverySell);
    else recovery.push(STORE_COPY.recoveryWait);
    if (cause.overflowUnits > 0) recovery.push(recoveryOverflow(cause.overflowUnits));
  }

  const setRaw = (resource: ResourceId, raw: string | undefined) =>
    setQtyRaw((prev) => ({ ...prev, [resource]: raw }));

  const sell = (resource: ResourceId, qty: number) => {
    props.dispatch({ id: nextId("s"), type: "contract.sell", resource, qty });
    // The tranche committed; let the face fall back to the new sellable default.
    setQtyRaw((prev) => {
      const next = { ...prev };
      delete next[resource];
      return next;
    });
  };

  return (
    <div
      className="panel panel--stack panel--store"
      role="group"
      aria-label={t("aria.storeContents")}
    >
      <div className="panel__head">
        <h2 className="panel__title">{t("title.store")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        <section className="store-section store-section--trade" aria-label={STORE_COPY.tradeDesk}>
          <h3 className="store-section__title">{STORE_COPY.tradeDesk}</h3>
          {props.state.exportClaimed ? (
            faces.length > 0 ? (
              faces.map((face) => (
                <TradeCard
                  key={face.resource}
                  face={face}
                  raw={qtyRaw[face.resource]}
                  onRaw={(raw) => setRaw(face.resource, raw)}
                  onSell={(qty) => sell(face.resource, qty)}
                />
              ))
            ) : (
              <p className="store-note">{STORE_COPY.nothingSellable}</p>
            )
          ) : (
            <p className="store-note">{STORE_COPY.tradeLocked}</p>
          )}
        </section>

        {GROUP_ORDER.map((group) => (
          <section
            key={group}
            className={`store-section store-group--${group}`}
            aria-label={GROUP_TITLE[group]}
          >
            <h3 className="store-section__title">{GROUP_TITLE[group]}</h3>
            <dl>
              {resourcesInGroup(group).map((resource) => {
                const held = props.state.store[resource] ?? 0;
                const cues = cuesFor(props.state, resource);
                return (
                  <div
                    className="panel__row store-row"
                    key={resource}
                    data-resource={resource}
                    data-stock={held}
                  >
                    <dt>
                      <ResourceGlyph id={resource} size={14} />
                      {RESOURCE_LABEL[resource] ?? resource}
                    </dt>
                    <dd>{formatNumber(held)}</dd>
                    <span className="store-row__share">
                      {shareLine(capacityShare(props.state, resource))}
                    </span>
                    <span className="store-row__cue">
                      {cueLine(groupOf(resource) === "raw", cues.producers, cues.consumers)}
                    </span>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}

        <section className="store-section store-section--diag" aria-label={STORE_COPY.diagnostics}>
          <h3 className="store-section__title">{STORE_COPY.diagnostics}</h3>
          <dl>
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
            {cause.full ? (
              <>
                <Row
                  label={STORE_COPY.storageCause}
                  value={t("advice.storageFull", { percent: cause.percent })}
                />
                <Row
                  label={STORE_COPY.largestHolds}
                  value={cause.topHolds
                    .map((hold) => `${RESOURCE_LABEL[hold.resource] ?? hold.resource} ${formatNumber(hold.held)}`)
                    .join(" · ")}
                />
                <Row label={STORE_COPY.recovery} value={recovery.join(" · ")} />
              </>
            ) : null}
          </dl>
        </section>
      </div>
    </div>
  );
}
