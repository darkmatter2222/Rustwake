/**
 * UI-RESET-61 (issue #61): return-report copy, plain literals only.
 *
 * The shared STRINGS table (src/game/content/strings.ts) is read-only for this
 * wave, and the i18n scan rejects any painted `prefix.word` key shape, so every
 * NEW sentence lives here as a literal or a small template over already
 * formatted numbers. The legacy report lines (report.away / report.worked /
 * report.workedCapped, the bottleneck labels, the title, the resume button and
 * the copied note) still come from t() inside the panel, so the read-only i18n
 * and overlay suites keep their exact contracts and no sentence exists twice.
 */

export const RETURN_COPY = {
  /** Summary key under the big away duration. */
  awayKey: "away from the yard",
  /** Settled-status lines: the catch-up already applied everything, once. */
  appliedEarned:
    "Catch-up finished. These gains are already in your stores — nothing to claim.",
  appliedZero:
    "Catch-up finished. Nothing new was stored, and nothing needs claiming.",
  appliedNone: "No offline time was credited for this absence.",
  /** Zero-gain summary (a credited window where no output reached storage). */
  zeroHeadline: "No new resources",
  zeroBody: "The yard ran while you were away, but no output reached storage.",
  /** Defensive no-credit summary (the store never adopts a zero window). */
  noneHeadline: "No offline work credited",
  /** Detail section keys. */
  gainsTitle: "What the yard stored",
  limitsTitle: "Limits",
  bottleneckTitle: "Key bottleneck",
  noBottleneck: "No bottleneck",
  noBottleneckAdvice: "The yard kept running cleanly through the credited window.",
  detailTitle: "Full record",
  credits: "Credits",
  /** Recovery footer: optional, never a second resume or a claim. */
  recoveryTitle: "Missing progress?",
  recoveryBody:
    "Menu → Yard record can export or import a save. Copy this report to compare what was credited.",
  copyReport: "Copy report",
  copyFailed: "Copy is unavailable here — the full record above can be read instead.",
} as const;

/** "+1.2K units across 4 resources" — numbers arrive pre-formatted. */
export function gainsHeadline(units: string, resourceCount: number): string {
  return `+${units} units across ${resourceCount} ${resourceCount === 1 ? "resource" : "resources"}`;
}

/** Credits-only window (deliveries earned, nothing stored): "+165 credits earned". */
export function creditsHeadline(credits: string): string {
  return `+${credits} credits earned`;
}

/** The cap rule, stated once, with the tuning-derived hour budget. */
export function capNote(hours: number): string {
  return `Offline work is capped at ${hours}h per absence. Time beyond the cap does not earn.`;
}

/** Long-absence answer: the whole away time, and the part that actually earned. */
export function longAbsenceNote(away: string, credited: string): string {
  return `You were away ${away}. Only the first ${credited} earned production.`;
}

/**
 * One actionable sentence per bottleneck the read-only sim can report
 * (detectBottleneck: storage-full / power-limited / starved). Plain literals:
 * the legacy short label still comes from t("bottleneck.<id>") in the panel.
 */
export const BOTTLENECK_ADVICE: Record<string, string> = {
  "storage-full":
    "Stores filled up. Add storage or ship output out before your next break.",
  "power-limited":
    "Machines ran short of power. Add power capacity before your next break.",
  starved:
    "Machines waited for input. Connect a supply route before your next break.",
};
