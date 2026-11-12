/**
 * UI-RESET-63: the save-management copy. Every literal the rebuilt Yard record
 * adds lives here (the shared `STRINGS` table keeps the existing buttons, rows
 * and import refusal notes, which `t()` still answers). Backup/export and
 * Replace/import are named as two different acts everywhere they appear: the
 * page headings, the confirmation gate and the export-first offer.
 */
export const SAVE_COPY = {
  /** Page headings: the two transfers are labelled by what they do to the yard. */
  backupHeading: "Backup · export",
  replaceHeading: "Replace · import",
  /** The replace page's one-line consequence hint, shown before any text is pasted. */
  replaceHint: "Nothing is replaced until you confirm.",
  /** Record-page button that opens the backup/export page. */
  openBackup: "Backup",
  download: "Download",
  downloadStarted: "Download started",
  downloadFailed: "Download unavailable — copy the text instead",
  /** The deliberate-confirmation gate (same grammar as the reset dialog). */
  confirmTitle: "Replace this yard?",
  confirmWarning:
    "The pasted save replaces your current yard, machines, credits and settings. This cannot be undone.",
  confirmAck: "I understand this replaces my current save",
  confirmReplace: "Replace yard",
  /** Current-vs-incoming preview columns. */
  currentHeading: "Current yard",
  incomingHeading: "Incoming save",
  /** Export-first offer inside the gate: a backup before the destructive act. */
  exportFirst: "Back up the current yard first:",
  copyCurrent: "Copy current save",
  downloadCurrent: "Download current save",
  settingsUnchanged: "Settings unchanged",
} as const;