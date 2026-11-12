import { useRef, useState } from "react";
import type { SimState } from "../../game/simulation/types";
import { importNoteFor } from "../text";
import { t } from "../../game/content/strings";
import type { ImportResult } from "../../game/persistence/save";
import { SAVE_COPY } from "../save/copy";
import {
  copySaveText,
  currentSettingsOf,
  downloadSaveText,
  exportFileName,
  previewImport,
  summarizeYard,
  type ImportPreview,
} from "../save/model";
import { ImportConfirm } from "../save/ImportConfirm";
import "../save/save.css";

/**
 * UI-RESET-63: the yard record plus the two save transfers, rebuilt as three
 * clearly labelled pages so backup/export and replace/import are never one
 * ambiguous act:
 *
 *   page 0 — the record: every statistic the old panel kept, then Backup/Import;
 *   page 1 — Backup · export: copy or download the current save (read-only);
 *   page 2 — Replace · import: paste, then Apply. Apply VALIDATES FIRST through
 *            the same decode the store uses; a refused text explains itself and
 *            never calls onImport. A sound text opens the confirmation gate with
 *            a current-vs-incoming preview and an export-first offer, and only
 *            the acknowledged "Replace yard" press calls onImport.
 *
 * The mount contract is unchanged (state / exportText / onImport / onClose), so
 * a successful import refreshes the record, the export text and the settings
 * through the store's existing notify path. Failed or canceled imports leave the
 * running yard untouched. Pages stay compact enough for 0 px inner panel scroll
 * at the 2.0 text scale (spec 6.4); the gate is a bounded alertdialog that may
 * scroll itself, exactly like the reset dialog.
 */
export function YardPanel(props: {
  state: SimState;
  exportText: string;
  onImport: (text: string) => ImportResult;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState(t("note.exportIdle"));
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const applyRef = useRef<HTMLButtonElement | null>(null);
  const exportId = "rustwake-save-export";
  const importId = "rustwake-save-import";
  const summary = summarizeYard(props.state);

  const copyExport = () => {
    void copySaveText(props.exportText).then((ok) =>
      setNote(ok ? t("note.copied") : t("note.copyManual"))
    );
  };

  const downloadExport = () => {
    const ok = downloadSaveText(props.exportText, exportFileName(props.state.tick));
    setNote(ok ? SAVE_COPY.downloadStarted : SAVE_COPY.downloadFailed);
  };

  /** Validate BEFORE any mutation: a refusal is a note, never an import call. */
  const applyImport = () => {
    const result = previewImport(draft, currentSettingsOf(props.exportText));
    if (result.status === "refused") {
      setNote(result.note);
      return;
    }
    setPreview(result.preview);
  };

  const closePreview = () => {
    setPreview(null);
    // Focus returns to the control that opened the gate, on cancel AND confirm.
    applyRef.current?.focus();
  };

  const confirmImport = () => {
    const result = props.onImport(draft);
    setNote(importNoteFor(result));
    closePreview();
  };

  return (
    <div className="panel panel--stack" role="group" aria-label={t("aria.yardRecord")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.yard")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.close")}
        </button>
      </div>
      <div className="panel__body">
        {page === 0 ? (
          <div className="save-page save-page--record">
            <dl className="save-stats">
              <div className="save-stat">
                <dt>{t("row.tick")}</dt>
                <dd>{summary.tick}</dd>
              </div>
              <div className="save-stat">
                <dt>{t("row.machines")}</dt>
                <dd>{summary.machines}</dd>
              </div>
              <div className="save-stat">
                <dt>{t("row.drones")}</dt>
                <dd>{summary.drones}</dd>
              </div>
              <div className="save-stat">
                <dt>{t("row.links")}</dt>
                <dd>{summary.links}</dd>
              </div>
              <div className="save-stat">
                <dt>{t("row.credits")}</dt>
                <dd>{summary.credits}</dd>
              </div>
              <div className="save-stat save-stat--wide">
                <dt>{t("row.save")}</dt>
                <dd>{t("value.characters", { count: props.exportText.length })}</dd>
              </div>
            </dl>
            <div className="panel__actions">
              <button className="icon-btn" onClick={() => setPage(1)}>
                {SAVE_COPY.openBackup}
              </button>
              <button className="icon-btn" onClick={() => setPage(2)}>
                {t("btn.import")}
              </button>
            </div>
          </div>
        ) : page === 1 ? (
          <div className="save-page save-page--backup">
            <h3 className="save-heading">{SAVE_COPY.backupHeading}</h3>
            <label className="panel__field" htmlFor={exportId}>
              {t("field.savedYard")}
            </label>
            <textarea
              id={exportId}
              className="panel__code save-code"
              readOnly
              value={props.exportText}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="panel__actions">
              <button className="icon-btn" onClick={copyExport}>
                {t("btn.copy")}
              </button>
              <button className="icon-btn" onClick={downloadExport}>
                {SAVE_COPY.download}
              </button>
              <button className="icon-btn" onClick={() => setPage(0)}>
                {t("btn.back")}
              </button>
            </div>
          </div>
        ) : (
          <div className="save-page save-page--replace">
            <h3 className="save-heading">{SAVE_COPY.replaceHeading}</h3>
            <p className="save-hint">{SAVE_COPY.replaceHint}</p>
            <label className="panel__field" htmlFor={importId}>
              {t("field.pastedText")}
            </label>
            <textarea
              id={importId}
              className="panel__code save-code"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <div className="panel__actions">
              <button className="icon-btn" ref={applyRef} onClick={applyImport}>
                {t("btn.apply")}
              </button>
              <button className="icon-btn" onClick={() => setPage(0)}>
                {t("btn.back")}
              </button>
            </div>
          </div>
        )}
        <p className="status-line" role="status">
          {note}
        </p>
      </div>
      {preview !== null ? (
        <ImportConfirm
          current={summary}
          incoming={preview.summary}
          settingsLine={preview.settingsLine}
          exportText={props.exportText}
          currentTick={props.state.tick}
          onCancel={closePreview}
          onConfirm={confirmImport}
        />
      ) : null}
    </div>
  );
}