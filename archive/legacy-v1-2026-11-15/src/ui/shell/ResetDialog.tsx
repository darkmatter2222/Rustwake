import { useEffect, useRef, useState } from "react";
import { t } from "../../game/content/strings";
import { RESET_COPY } from "../home/copy";

/**
 * UI-RESET-62 (sponsor reset-game): the one confirmation gate in front of the
 * destructive reset. It is an alertdialog, not a panel and not a menu row: the
 * warning names the permanent loss, the confirm button stays disabled until the
 * player deliberately acknowledges it, and Cancel (auto-focused, so a stray
 * Enter never confirms) leaves the save untouched. Escape cancels — App owns
 * that key. Rendered above the shell (z-index 40) but outside `.hud`, so the
 * overlay census and the HUD button reachability census never count it.
 */
export function ResetDialog(props: {
  summary: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // The safe action owns initial focus: keyboard users land on Cancel, and
    // the destructive confirm needs an explicit checkbox tick first.
    cancelRef.current?.focus();
  }, []);
  return (
    <div className="reset-dialog__scrim">
      <section
        className="reset-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={RESET_COPY.title}
        aria-describedby="reset-dialog-warning"
        tabIndex={-1}
      >
        <h2 className="reset-dialog__title">{RESET_COPY.title}</h2>
        <p className="reset-dialog__warning" id="reset-dialog-warning">
          {props.summary === null ? RESET_COPY.noSave : RESET_COPY.warning}
        </p>
        {props.summary !== null ? (
          <p className="reset-dialog__save">{props.summary}</p>
        ) : null}
        <label className="reset-dialog__ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>{RESET_COPY.acknowledge}</span>
        </label>
        <div className="reset-dialog__actions">
          <button type="button" className="icon-btn" ref={cancelRef} onClick={props.onCancel}>
            {t("btn.cancel")}
          </button>
          <button
            type="button"
            className="icon-btn reset-dialog__confirm"
            disabled={!acknowledged}
            onClick={props.onConfirm}
          >
            {RESET_COPY.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}