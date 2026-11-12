/**
 * UI-RESET-53: the explicit placement, move and dismantle surfaces.
 *
 * These strips paint inside `.hud__lead` (after the objective card), so the camera's
 * `chromeInsets` — which measures the lead block's painted bottom — reserves their band
 * automatically and the yard never slides underneath them. They are deliberately NOT
 * `.panel` and NOT `.dock`: the overlay-stack census keeps counting inspectors only, the
 * dock keeps its pinned Cancel / Build / Next faces, and the paired-layer budget is
 * untouched. In jsdom every box is 0, so `chromeInsets` returns undefined and the legacy
 * fit the camera tests assert is preserved.
 *
 *  - PlacementStrip is informational: the dock's Build face is the confirm and its Cancel
 *    face is the cancel (build-52 pins that row to a single committing tap). The strip
 *    adds the cell, the engine's verdict reason, the real price and any shortfall, and a
 *    refused Build keeps the ghost armed underneath (App.onPlace only clears on success).
 *  - MoveStrip carries its own Confirm / Cancel: nothing is charged until a valid
 *    destination is confirmed, and the printed charge is `moveCostOf` — the engine's own
 *    per-line price.
 *  - DismantleCard shows the whole impact before anything is removed and gates the commit
 *    behind a two-stage tap (arm, then commit) plus a Keep-machine cancel. When the store
 *    cannot hold the refund the confirm is disabled and the recovery path is named.
 */
import { BLUEPRINTS } from "../../game/content/defs";
import { t, unit } from "../../game/content/strings";
import type { SimState } from "../../game/simulation/types";
import { costSummary } from "../text";
import { COPY } from "./copy";
import {
  dismantleImpact,
  moveCheck,
  placementCheck,
  shortfallLine,
  stackSummary,
  verdictReason,
} from "./flow";
import "./place.css";

const UNIT = t("unit.unit");

export function PlacementStrip(props: {
  readonly state: SimState;
  readonly blueprint: string;
  readonly tile: number | null;
}) {
  const def = BLUEPRINTS[props.blueprint];
  const check = placementCheck(props.state, props.blueprint, props.tile);
  const reason = check.verdict === "ok" ? COPY.clearCell : verdictReason(check.verdict, props.tile);
  return (
    <section
      className="place-strip"
      role="status"
      aria-label={COPY.placementTitle}
      data-flow="placement"
      data-valid={check.valid ? "true" : "false"}
      data-verdict={check.verdict}
    >
      <div className="place-strip__head">
        <span className="place-strip__title">{COPY.placementTitle}</span>
        <span className="place-strip__machine">{def?.label ?? props.blueprint}</span>
        {props.tile !== null ? (
          <span className="place-strip__cell">{COPY.cell(props.tile)}</span>
        ) : null}
      </div>
      <p
        className={
          "place-strip__reason " +
          (check.verdict === "ok" ? "place-strip__reason--ok" : "place-strip__reason--bad")
        }
      >
        {reason}
      </p>
      {def ? (
        <p className="place-strip__cost">
          {COPY.costLabel}: {costSummary(def)}
        </p>
      ) : null}
      {check.shortfall ? (
        <p className="place-strip__short">{shortfallLine(check.shortfall)}</p>
      ) : null}
      {/* UI-RESET-64 (criterion 4): name the reachable earn recovery the moment the build is
          unaffordable, so the preview shows a way forward instead of repeat refusals. */}
      {check.shortfall ? (
        <p className="place-strip__earn">{COPY.earnRecoveryHint}</p>
      ) : null}
      <p className="place-strip__hint">{COPY.aimHint}</p>
    </section>
  );
}

export function MoveStrip(props: {
  readonly state: SimState;
  readonly machineId: number;
  readonly tile: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const machine = props.state.machines.find((m) => m.id === props.machineId);
  if (!machine) return null;
  const def = BLUEPRINTS[machine.blueprint];
  const check = moveCheck(props.state, props.machineId, props.tile);
  const ok = check.verdict === "ok";
  return (
    <section
      className="place-strip place-strip--move"
      role="group"
      aria-label={COPY.moveTitle}
      data-flow="move"
      data-valid={check.valid ? "true" : "false"}
      data-verdict={check.verdict}
    >
      <div className="place-strip__head">
        <span className="place-strip__title">{COPY.moveTitle}</span>
        <span className="place-strip__machine">{def.label}</span>
        <span className="place-strip__cell">{COPY.fromCell(machine.tile)}</span>
      </div>
      <p className="place-strip__dest">{COPY.destination(props.tile)}</p>
      <p
        className={
          "place-strip__reason " +
          (ok ? "place-strip__reason--ok" : "place-strip__reason--bad")
        }
      >
        {ok ? "Clear destination — confirm spends the charge below." : verdictReason(check.verdict, props.tile)}
      </p>
      <p className="place-strip__cost">
        {COPY.chargeLabel}: {stackSummary(check.cost)}
      </p>
      {check.shortfall ? (
        <p className="place-strip__short">{shortfallLine(check.shortfall)}</p>
      ) : null}
      <p className="place-strip__hint">{COPY.moveAimHint}</p>
      <div className="place-strip__actions">
        <button
          type="button"
          className="icon-btn place-strip__confirm"
          disabled={!check.valid}
          onClick={props.onConfirm}
        >
          {COPY.confirmMove}
        </button>
        <button type="button" className="icon-btn" onClick={props.onCancel}>
          {t("btn.cancel")}
        </button>
      </div>
    </section>
  );
}

export function DismantleCard(props: {
  readonly state: SimState;
  readonly machineId: number;
  readonly armed: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const machine = props.state.machines.find((m) => m.id === props.machineId);
  if (!machine) return null;
  const def = BLUEPRINTS[machine.blueprint];
  const impact = dismantleImpact(props.state, props.machineId);
  const total = impact.refundUnits + impact.batchUnits;
  const short = Math.max(0, impact.refundUnits - impact.room);
  return (
    <section
      className={
        "place-strip place-strip--dismantle" + (props.armed ? " place-strip--armed" : "")
      }
      role="group"
      aria-label={COPY.dismantleTitle}
      data-flow="dismantle"
      data-armed={props.armed ? "true" : "false"}
      data-fits={impact.fits ? "true" : "false"}
    >
      <div className="place-strip__head">
        <span className="place-strip__title">{COPY.dismantleTitle}</span>
        <span className="place-strip__machine">{def.label}</span>
        <span className="place-strip__cell">{COPY.cell(machine.tile)}</span>
      </div>
      <ul className="place-strip__impact">
        <li>{COPY.buildRefund(impact.buildRefund)}</li>
        {impact.trayUnits > 0 ? <li>{COPY.trayReturn(impact.trayUnits)}</li> : null}
        {impact.inBufUnits > 0 ? <li>{COPY.bufferReturn(impact.inBufUnits)}</li> : null}
        {impact.linkCount > 0 ? (
          <li>{COPY.beltReturn(impact.beltRefundUnits, impact.linkCount)}</li>
        ) : null}
        {impact.batchUnits > 0 ? <li>{COPY.batchReturn(impact.batchUnits)}</li> : null}
      </ul>
      <p className="place-strip__total">
        {COPY.totalLabel}: +{unit(total, UNIT)}
      </p>
      <p className="place-strip__room">
        {COPY.roomLabel}: {unit(impact.room, UNIT)}
      </p>
      {!impact.fits ? (
        <>
          <p className="place-strip__reason place-strip__reason--bad">{COPY.noRoom(short)}</p>
          <p className="place-strip__hint">{COPY.recoveryHint}</p>
        </>
      ) : props.armed ? (
        <p className="place-strip__hint place-strip__hint--armed">{COPY.armedHint}</p>
      ) : null}
      <div className="place-strip__actions">
        <button
          type="button"
          className={
            "icon-btn place-strip__confirm place-strip__confirm--danger" +
            (props.armed ? " place-strip__confirm--armed" : "")
          }
          disabled={!impact.fits}
          onClick={props.onConfirm}
        >
          {props.armed ? COPY.dismantleArmed : COPY.dismantleFirst}
        </button>
        <button type="button" className="icon-btn" onClick={props.onCancel}>
          {COPY.cancelDismantle}
        </button>
      </div>
    </section>
  );
}
