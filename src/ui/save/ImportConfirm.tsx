import { useEffect, useRef, useState } from "react";
import { t } from "../../game/content/strings";
import { SAVE_COPY } from "./copy";
import {
  copySaveText,
  downloadSaveText,
  exportFileName,
  type YardSummary,
} from "./model";
import "./save.css";

/** One preview column: the same five statistics, current yard vs incoming save. */
function PreviewColumn(props: { heading: string; summary: YardSummary }) {
  const rows: readonly (readonly [string, number])[] = [
    [t("row.tick"), props.summary.tick],
    [t("row.machines"), props.summary.machines],
    [t("row.drones"), props.summary.drones],
    [t("row.links"), props.summary.links],
    [t("row.credits"), props.summary.credits],
  ];
  return (
    <div className="import-confirm__column">
      <h3 className="import-confirm__column-title">{props.heading}</h3>
      <dl className="import-confirm__stats">
        {rows.map(([label, value]) => (
          <div className="import-confirm__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * UI-RESET-63: the deliberate-confirmation gate in front of a save replacement,
 * built on the reset dialog's grammar (alertdialog, acknowledgement-gated confirm,
 * auto-focused Cancel so a stray Enter never replaces the yard). It adds what a
 * replacement needs and a reset does not: a current-vs-incoming preview of the
 * exact consequence, the settings change, and an export-first offer so the player
 * can back up the current yard before confirming.
 *
 * Escape: App owns that key at the window bubble phase for its own overlays and
 * knows nothing about this dialog (it lives inside YardPanel). The capture-phase
 * listener below therefore answers first and stops propagation, so one press
 * retires only this dialog (spec 5.5 nearest-first) and never also closes the
 * panel underneath.
 */
export function ImportConfirm(props: {
  current: YardSummary;
  incoming: YardSummary;
  settingsLine: string;
  exportText: string;
  currentTick: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // The safe action owns initial focus, exactly like the reset dialog.
    cancelRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      props.onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [props.onCancel]);

  const copyCurrent = () => {
    void copySaveText(props.exportText).then((ok) =>
      setExportNote(ok ? t("note.copied") : t("note.copyManual"))
    );
  };
  const downloadCurrent = () => {
    const ok = downloadSaveText(props.exportText, exportFileName(props.currentTick));
    setExportNote(ok ? SAVE_COPY.downloadStarted : SAVE_COPY.downloadFailed);
  };

  return (
    <div className="import-confirm__scrim">
      <section
        className="import-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={SAVE_COPY.confirmTitle}
        aria-describedby="import-confirm-warning"
        tabIndex={-1}
      >
        <h2 className="import-confirm__title">{SAVE_COPY.confirmTitle}</h2>
        <p className="import-confirm__warning" id="import-confirm-warning">
          {SAVE_COPY.confirmWarning}
        </p>
        <div className="import-confirm__preview">
          <PreviewColumn heading={SAVE_COPY.currentHeading} summary={props.current} />
          <PreviewColumn heading={SAVE_COPY.incomingHeading} summary={props.incoming} />
        </div>
        <p className="import-confirm__settings">{props.settingsLine}</p>
        <div className="import-confirm__backup">
          <p className="import-confirm__offer">{SAVE_COPY.exportFirst}</p>
          <div className="import-confirm__backup-actions">
            <button type="button" className="icon-btn" onClick={copyCurrent}>
              {SAVE_COPY.copyCurrent}
            </button>
            <button type="button" className="icon-btn" onClick={downloadCurrent}>
              {SAVE_COPY.downloadCurrent}
            </button>
          </div>
          {exportNote !== "" ? (
            <p className="status-line" role="status">
              {exportNote}
            </p>
          ) : null}
        </div>
        <label className="import-confirm__ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>{SAVE_COPY.confirmAck}</span>
        </label>
        <div className="import-confirm__actions">
          <button type="button" className="icon-btn" ref={cancelRef} onClick={props.onCancel}>
            {t("btn.cancel")}
          </button>
          <button
            type="button"
            className="icon-btn import-confirm__replace"
            disabled={!acknowledged}
            onClick={props.onConfirm}
          >
            {SAVE_COPY.confirmReplace}
          </button>
        </div>
      </section>
    </div>
  );
}