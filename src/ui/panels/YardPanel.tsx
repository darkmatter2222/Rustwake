import { useState } from "react";
import type { SimState } from "../../game/simulation/types";
import { fleetUnits } from "../../game/simulation/types";
import { importNoteFor } from "../text";
import { t } from "../../game/content/strings";
import type { ImportResult } from "../../game/persistence/save";
import { Row } from "./shared";

/**
 * The yard record plus the two save transfers (spec 22.1, B-06). Two pages so one
 * textarea is on screen at a time and the panel keeps its 0 px inner scroll at the
 * 2.0 text scale (spec 6.4): page 0 shows the record and the export, page 1 the
 * import field. A refused file leaves the running yard untouched.
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
  const exportId = "rustwake-save-export";
  const importId = "rustwake-save-import";

  const copyExport = () => {
    const clipboard = navigator.clipboard?.writeText;
    if (!clipboard) {
      setNote(t("note.copyManual"));
      return;
    }
    clipboard.call(navigator.clipboard, props.exportText).then(
      () => setNote(t("note.copied")),
      () => setNote(t("note.copyManual"))
    );
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
          <>
            <dl>
              <Row label={t("row.tick")} value={props.state.tick} />
              <Row label={t("row.machines")} value={props.state.machines.length} />
              <Row
                label={t("row.drones")}
                value={fleetUnits(props.state).filter((unitState) => unitState.repaired).length}
              />
              <Row label={t("row.links")} value={props.state.routes.length} />
              <Row label={t("row.credits")} value={props.state.credits} />
              <Row
                label={t("row.save")}
                value={t("value.characters", { count: props.exportText.length })}
              />
            </dl>
            <label className="panel__field" htmlFor={exportId}>
              {t("field.savedYard")}
            </label>
            <textarea
              id={exportId}
              className="panel__code"
              readOnly
              value={props.exportText}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="panel__actions">
              <button className="icon-btn" onClick={copyExport}>
                {t("btn.copy")}
              </button>
              <button className="icon-btn" onClick={() => setPage(1)}>
                {t("btn.import")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="status-line">{t("note.paste")}</p>
            <label className="panel__field" htmlFor={importId}>
              {t("field.pastedText")}
            </label>
            <textarea
              id={importId}
              className="panel__code"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            <div className="panel__actions">
              <button
                className="icon-btn"
                onClick={() => setNote(importNoteFor(props.onImport(draft)))}
              >
                {t("btn.apply")}
              </button>
              <button className="icon-btn" onClick={() => setPage(0)}>
                {t("btn.back")}
              </button>
            </div>
          </>
        )}
        <p className="status-line">{note}</p>
      </div>
    </div>
  );
}