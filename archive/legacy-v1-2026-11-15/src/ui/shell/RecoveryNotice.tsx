import { useEffect, useState } from "react";
import type { GameStore, SaveRecoveryApi } from "../../app/store";
import type { SaveRecoveryNotice } from "../../game/persistence/recovery";
import { useRevision } from "../useGame";
import { downloadSaveText } from "../save/model";
import { SAVE_COPY } from "../save/copy";

/**
 * G1 (#202): the player-visible surface for the store's `SaveRecoveryApi`.
 * A corrupt boot keeps the original bytes in the write-once recovery slot and
 * runs a fresh yard as a fallback; this banner tells the player what happened
 * and offers retry / export / discard / dismiss against the real API.
 *
 * Shell contract (#135): the banner renders OUTSIDE `.hud` and the one panel
 * stack, as the first child of `.game` in both the gate and play branches (the
 * same reconciliation slot, so its local state survives Begin). It owns no
 * `.panel` node (the HUD census never counts it), measures into no chrome
 * inset, adds no Escape layer and never traps or steals focus — dismissal is
 * an explicit button, and the store's recovery state is untouched by
 * dismissing (the notice re-surfaces on the next boot or a new signature).
 *
 * `slotClearFailed` (#203/#205): a retry can land the yard durably while storage
 * refuses the slot clear. The slot then holds DECODABLE text, so the store
 * raises no notice — the result flag is the only explicit signal. The residual
 * surface is derived from the store itself (`no notice` + `retained text` is
 * exactly a decodable residual slot), so it survives remounts and appears on
 * follower tabs too; the flag drives the "recovered and saved" acknowledgement
 * shown beside the residual warning. Export and retry stay available until the
 * slot is cleared or discarded.
 */
export const RECOVERY_COPY = {
  title: "Save recovery",
  preserved:
    "Your saved yard could not be read, so a fresh yard is running. The original data is preserved in a recovery slot — nothing was erased.",
  held:
    "Your saved yard could not be read. The original data is held in place, and this fresh yard is session-only until you recover or discard it.",
  residual:
    "Recovery slot could not be cleared; your yard is safe. Export or discard the residual slot.",
  recovered: "Your yard was recovered and saved.",
  retry: "Retry recovery",
  export: "Export",
  discard: "Discard",
  confirmDiscard: "Confirm discard",
  keep: "Keep",
  dismiss: "Dismiss recovery notice",
  discardWarning: "Discarding erases the retained original permanently. This cannot be undone.",
  discardRefused: "The retained data could not be discarded; it is still kept.",
  nothingToExport: "No retained recovery data to export.",
  exportFileName: "rustwake-recovery-slot.json",
} as const;

/** Player-facing phrasing for every decode failure and retry refusal reason. */
const REASON_TEXT: Record<string, string> = {
  empty: "the save is empty",
  parse: "the save text is damaged",
  schema: "the save format is not recognized",
  checksum: "the save failed its integrity check",
  invalid: "the save contains invalid values",
  "read-only": "another tab owns the save — recover from the writer tab",
  "no-slot": "no retained recovery data was found",
  storage: "storage refused the write",
};

const reasonText = (reason: string): string => REASON_TEXT[reason] ?? reason;

/** Mirrors the store's recovery signature: a changed notice is a new surface. */
const noticeKey = (notice: SaveRecoveryNotice): string =>
  `${notice.preserved ? 1 : 0}|${notice.reason}|${notice.detail ?? ""}|${notice.textLength}`;

const signatureOf = (notice: SaveRecoveryNotice | null): string =>
  notice === null ? "" : noticeKey(notice);

export function RecoveryNotice({ store }: { store: GameStore & Partial<SaveRecoveryApi> }) {
  useRevision(store);
  /** Dismissal is per-surface and session-local; the store keeps the slot. */
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The API is additive: a store double without it renders nothing at all.
  const api =
    typeof store.getSaveRecovery === "function" &&
    typeof store.retrySaveRecovery === "function" &&
    typeof store.exportSaveRecovery === "function" &&
    typeof store.discardSaveRecovery === "function"
      ? (store as GameStore & SaveRecoveryApi)
      : null;
  const notice = api ? api.getSaveRecovery() : null;
  const retained = api ? api.exportSaveRecovery() : null;
  // A decodable residual slot (#203): the yard landed, the clear was refused,
  // and the store raises no notice because the retained text now decodes.
  const showResidual = notice === null && retained !== null;
  const key = notice !== null ? noticeKey(notice) : showResidual ? "residual" : null;

  // A new corruption surface retires the previous confirmation step and action
  // note. The residual surface keeps its note (the retry acknowledgement).
  useEffect(() => {
    setConfirming(false);
    if (key !== "residual") setNote(null);
  }, [key]);

  if (!api || key === null || dismissedKey === key) return null;

  const onRetry = () => {
    const result = api.retrySaveRecovery();
    setConfirming(false);
    if (result.ok) {
      // #205: consume the partial-success flag in player-visible messaging. A
      // clean success needs no note (the banner resolves); a refused clear
      // pairs the acknowledgement with the derived residual warning below.
      setNote(result.slotClearFailed === true ? RECOVERY_COPY.recovered : null);
    } else {
      setNote(
        `Recovery failed: ${reasonText(result.reason)}${result.detail ? ` (${result.detail})` : ""}. Nothing was changed; the original data is still kept.`,
      );
    }
  };

  const onExport = () => {
    const text = api.exportSaveRecovery();
    if (text === null) {
      setNote(RECOVERY_COPY.nothingToExport);
      return;
    }
    const started = downloadSaveText(text, RECOVERY_COPY.exportFileName);
    setNote(started ? SAVE_COPY.downloadStarted : SAVE_COPY.downloadFailed);
  };

  const onConfirmDiscard = () => {
    setConfirming(false);
    if (store.getRole() !== "writer") {
      setNote(`Discard failed: ${reasonText("read-only")}. The retained data is still kept.`);
      return;
    }
    const before = api.exportSaveRecovery();
    const noticeBefore = signatureOf(api.getSaveRecovery());
    api.discardSaveRecovery();
    const after = api.exportSaveRecovery();
    const noticeAfter = signatureOf(api.getSaveRecovery());
    // Honest outcome check: the discard is a no-op when no notice is active
    // (the decodable residual edge), and storage may refuse the erase. Only a
    // real change — retained text gone, or an older slot surfacing — resolves.
    if (after === null || after !== before || noticeAfter !== noticeBefore) {
      setNote(null);
    } else {
      setNote(RECOVERY_COPY.discardRefused);
    }
  };

  const onDismiss = () => {
    setDismissedKey(key);
    setConfirming(false);
  };

  return (
    <section className="recovery-notice" role="alert" aria-labelledby="recovery-notice-title">
      <h2 className="recovery-notice__title" id="recovery-notice-title">
        {RECOVERY_COPY.title}
      </h2>
      {notice ? (
        <p className="recovery-notice__body">
          {notice.preserved ? RECOVERY_COPY.preserved : RECOVERY_COPY.held}
        </p>
      ) : null}
      {showResidual ? <p className="recovery-notice__residual">{RECOVERY_COPY.residual}</p> : null}
      {notice ? (
        <p className="recovery-notice__detail">
          {`Reason: ${reasonText(notice.reason)}${notice.detail ? ` (${notice.detail})` : ""}. ${notice.textLength} characters retained.`}
        </p>
      ) : null}
      {note ? <p className="recovery-notice__note">{note}</p> : null}
      {confirming ? <p className="recovery-notice__warning">{RECOVERY_COPY.discardWarning}</p> : null}
      <div className="recovery-notice__actions">
        <button type="button" className="icon-btn" onClick={onRetry}>
          {RECOVERY_COPY.retry}
        </button>
        <button type="button" className="icon-btn" onClick={onExport}>
          {RECOVERY_COPY.export}
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              className="icon-btn recovery-notice__confirm"
              onClick={onConfirmDiscard}
            >
              {RECOVERY_COPY.confirmDiscard}
            </button>
            <button type="button" className="icon-btn" onClick={() => setConfirming(false)}>
              {RECOVERY_COPY.keep}
            </button>
          </>
        ) : (
          <button type="button" className="icon-btn" onClick={() => setConfirming(true)}>
            {RECOVERY_COPY.discard}
          </button>
        )}
        <button
          type="button"
          className="icon-btn recovery-notice__dismiss"
          aria-label={RECOVERY_COPY.dismiss}
          onClick={onDismiss}
        >
          {"✕"}
        </button>
      </div>
    </section>
  );
}
