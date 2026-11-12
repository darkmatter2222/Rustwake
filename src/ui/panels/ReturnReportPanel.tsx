import { useLayoutEffect, useRef, useState } from "react";
import type { ReturnReport } from "../../game/simulation/offline";
import { formatNumber } from "../text";
import { t } from "../../game/content/strings";
import { Row } from "./shared";
import { deriveReturn } from "../return/model";
import {
  BOTTLENECK_ADVICE,
  RETURN_COPY,
  capNote,
  creditsHeadline,
  gainsHeadline,
  longAbsenceNote,
} from "../return/copy";
import "../return/return.css";

/**
 * UI-RESET-61 (issue #61): the return report, rebuilt inside the frozen mount.
 *
 * App.tsx paints this panel with ONLY `{ report, onClose }` once the store has
 * adopted the settled catch-up (the `.reconcile` role=status line owns the
 * loading moment, and the panel never mounts before adoption). The report is
 * therefore a receipt, not a claim: every gain below was already applied to the
 * yard exactly once by adoptCatchUp, `lastSeenMs` already moved to `nowMs`, and
 * nothing here dispatches, persists or re-credits. Dismissing, re-opening from
 * the Menu, or reloading cannot apply gains twice.
 *
 * Hierarchy: a sticky summary (day-precision time away, state chip, gains
 * headline, already-applied status) over the detail (full gains list, cap and
 * long-absence limits, the key bottleneck with one actionable sentence, the
 * legacy record rows, and an optional recovery footer). One resume action —
 * the head "Back to yard" control — and no dialogs: the catch-up, zero-gain,
 * long-absence and cap answers are inline lines, painted once.
 *
 * Legacy contracts kept verbatim for the read-only suites: `.panel--report`
 * root with role/aria, `.panel__head` > `.panel__title` ("While you were away")
 * with the `.icon-btn` dismiss first, `.panel__body` scroller, and the exact
 * t("report.away") / t("report.worked"[Capped]) / bottleneck label rows.
 *
 * Focus: the mount is frozen, so focus restore lives here. The opener is
 * captured on mount, the single resume action takes focus, and a layout-effect
 * cleanup restores the opener (or the Menu face / first dock button) on ANY
 * unmount path — the resume click and the App-owned Escape both end here.
 */
export function ReturnReportPanel(props: {
  report: ReturnReport;
  onClose: () => void;
}) {
  const model = deriveReturn(props.report);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resumeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [copyNote, setCopyNote] = useState<"copied" | "failed" | null>(null);

  useLayoutEffect(() => {
    const active = document.activeElement;
    openerRef.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      !(rootRef.current && rootRef.current.contains(active))
        ? active
        : null;
    // Keyboard and switch users land on the one resume action, not the body.
    resumeRef.current?.focus();
    return () => {
      // Synchronous with the unmount commit (Escape included), so focus never
      // drops to the body. A disconnected opener (the boot gate, a closed menu
      // row) falls back to a VISIBLE shell control. The Menu face is display:none
      // in rail mode (wide desktop / phone landscape), where slot 5 owns the
      // menu, so focusing it would no-op: skip hidden/disabled faces and prefer
      // the rail's menu slot, then the first dock button.
      const opener = openerRef.current;
      const usable = (el: HTMLElement | null): el is HTMLElement => {
        if (!el || !el.isConnected || (el as HTMLButtonElement).disabled) return false;
        const cs = getComputedStyle(el);
        return cs.display !== "none" && cs.visibility !== "hidden";
      };
      const firstVisible = (selector: string): HTMLElement | null => {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
          if (usable(el)) return el;
        }
        return null;
      };
      const target =
        (usable(opener) ? opener : null) ??
        firstVisible(".shell-menu-face") ??
        firstVisible('.shell-rail__slot[data-slot="menu"]') ??
        firstVisible(".dock button");
      if (target && typeof target.focus === "function") target.focus();
    };
  }, []);

  /** Optional recovery: a clipboard diagnostic, never a claim or a dispatch. */
  const copyReport = () => {
    const clip = navigator.clipboard;
    if (!clip || typeof clip.writeText !== "function") {
      setCopyNote("failed");
      return;
    }
    clip.writeText(model.reportText).then(
      () => setCopyNote("copied"),
      () => setCopyNote("failed")
    );
  };

  const headline =
    model.gainLines.length > 0
      ? gainsHeadline(formatNumber(model.totalUnits), model.gainLines.length)
      : model.kind === "earned"
        ? creditsHeadline(formatNumber(model.creditsGained))
        : model.kind === "zero-gain"
          ? RETURN_COPY.zeroHeadline
          : RETURN_COPY.noneHeadline;
  const appliedLine =
    model.kind === "earned"
      ? RETURN_COPY.appliedEarned
      : model.kind === "zero-gain"
        ? RETURN_COPY.appliedZero
        : RETURN_COPY.appliedNone;
  const workedLine = model.capped
    ? t("report.workedCapped", { duration: model.creditedLabel })
    : t("report.worked", { duration: model.creditedLabel });

  return (
    <div
      ref={rootRef}
      className="panel panel--report"
      role="group"
      aria-label={t("aria.returnReport")}
      data-state={model.kind}
      data-away-ticks={model.awayTicks}
      data-credited-ticks={model.creditedTicks}
      data-capped={model.capped ? "true" : "false"}
      data-long-absence={model.longAbsence ? "true" : "false"}
    >
      <div className="panel__head">
        <h2 className="panel__title">{t("title.report")}</h2>
        <button
          ref={resumeRef}
          type="button"
          className="icon-btn return-resume"
          onClick={props.onClose}
        >
          {t("btn.backToYard")}
        </button>
      </div>
      <div className="panel__body">
        <div className="return-summary">
          <p className="return-away">
            <span className="return-away__value">{model.awayLabel}</span>{" "}
            <span className="return-away__key">{RETURN_COPY.awayKey}</span>
          </p>
          <p className="return-chip" data-kind={model.kind} data-state={model.stateLabel}>
            {model.stateLabel}
          </p>
          <p className="return-headline">{headline}</p>
          {model.kind === "zero-gain" ? (
            <p className="return-zero">{RETURN_COPY.zeroBody}</p>
          ) : null}
          <p className="return-applied" role="status">
            {appliedLine}
          </p>
        </div>

        {model.gainLines.length > 0 ? (
          <ul className="return-gains" aria-label={RETURN_COPY.gainsTitle}>
            {model.gainLines.map((gain) => (
              <li key={gain.id} className="return-gain" data-resource={gain.id}>
                <span className="return-gain__label">{gain.label}</span>
                <span className="return-gain__bar" aria-hidden="true">
                  <span
                    className="return-gain__fill"
                    style={{ width: `${Math.max(2, Math.round(gain.share * 100))}%` }}
                  />
                </span>
                <span className="return-gain__value">+{gain.formatted}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {model.creditsGained > 0 ? (
          <p className="return-credits">
            {RETURN_COPY.credits}{" "}
            <span className="return-credits__value">
              +{formatNumber(model.creditsGained)}
            </span>
          </p>
        ) : null}

        {model.longAbsence || model.capped ? (
          <div className="return-limits">
            <h3 className="return-section-title">{RETURN_COPY.limitsTitle}</h3>
            {model.longAbsence ? (
              <p className="return-limit" data-limit="long-absence">
                {longAbsenceNote(model.awayLabel, model.creditedLabel)}
              </p>
            ) : null}
            {model.capped ? (
              <p className="return-limit" data-limit="cap">
                {capNote(model.capHours)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div
          className="return-bottleneck"
          data-bottleneck={model.bottleneck ?? "none"}
        >
          <h3 className="return-section-title">{RETURN_COPY.bottleneckTitle}</h3>
          <p className="return-bottleneck__label">
            {model.bottleneckLabel ?? RETURN_COPY.noBottleneck}
          </p>
          <p className="return-bottleneck__advice">
            {model.bottleneck
              ? BOTTLENECK_ADVICE[model.bottleneck]
              : RETURN_COPY.noBottleneckAdvice}
          </p>
        </div>

        <h3 className="return-section-title">{RETURN_COPY.detailTitle}</h3>
        <dl className="return-detail">
          <Row
            label={t("row.time")}
            value={t("report.away", { duration: model.awayExact })}
          />
          <Row label={t("row.time")} value={workedLine} />
          <Row label={t("row.deliveries")} value={model.deliveries} />
          <Row label={t("row.batches")} value={model.batchesDone} />
          {model.bottleneck ? (
            <Row label={t("row.bottleneck")} value={model.bottleneckLabel} />
          ) : null}
        </dl>

        <div className="return-recovery">
          <h3 className="return-section-title">{RETURN_COPY.recoveryTitle}</h3>
          <p className="return-recovery__body">{RETURN_COPY.recoveryBody}</p>
          {/* The 44px tap floor is inline as well as in return.css: the HUD
              button census (build-52) reads computed styles from the shared
              sheets only, and this control must keep the floor everywhere. */}
          <button
            type="button"
            className="return-copy"
            style={{ minHeight: "44px" }}
            onClick={copyReport}
          >
            {RETURN_COPY.copyReport}
          </button>
          {copyNote ? (
            <p className="return-copy__note" role="status">
              {copyNote === "copied" ? t("note.copied") : RETURN_COPY.copyFailed}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
