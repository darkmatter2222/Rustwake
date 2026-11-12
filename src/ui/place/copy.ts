/**
 * UI-RESET-53: the placement / move / dismantle flows' own copy, in the plain-literal
 * form `hud/copy.ts` and `build/copy.ts` established. Every line is deliberately free
 * of `prefix.word` shapes: the i18n gate scans painted HUD text for untranslated key
 * patterns, and these strips paint inside `.hud`. Verbs that already live in the one
 * STRINGS table (Cancel, Close, Build {machine}, the shortfall sentence, "unit") are
 * read through `t()` at the call site, not duplicated here.
 */
export const COPY = {
  placementTitle: "Placement preview",
  moveTitle: "Move mode",
  dismantleTitle: "Dismantle check",
  /** The cell the ghost is aimed at, named the same way the build phase names it. */
  cell: (tile: number): string => `Cell ${tile}`,
  fromCell: (tile: number): string => `from cell ${tile}`,
  destination: (tile: number): string => `Destination: cell ${tile}`,
  clearCell: "Clear cell — Build spends the price below.",
  costLabel: "Cost",
  chargeLabel: "Charge",
  aimHint: "Tap the yard to aim · Build confirms · Cancel plans again.",
  moveAimHint: "Tap the yard (or press N) to aim the destination.",
  confirmMove: "Confirm move",
  cancelMove: "Cancel move",
  /** Dismantle impact breakdown — each line names one part of the engine's refund. */
  buildRefund: (units: number): string => `Build price returns +${units}`,
  trayReturn: (units: number): string => `Tray returns +${units}`,
  bufferReturn: (units: number): string => `Input buffer returns +${units}`,
  beltReturn: (units: number, links: number): string =>
    `Belt links return +${units} across ${links} ${links === 1 ? "link" : "links"}`,
  batchReturn: (units: number): string => `Active batch returns +${units} in full`,
  totalLabel: "Total back to the store",
  roomLabel: "Free store room",
  noRoom: (short: number): string =>
    `Store full — free ${short} more ${short === 1 ? "unit" : "units"}, then try again.`,
  recoveryHint: "Sell stock from the Store, or let routes drain, to make room.",
  /** Two-stage safeguard: the first tap arms, the second commits. */
  dismantleFirst: "Dismantle machine",
  dismantleArmed: "Tap again to dismantle",
  cancelDismantle: "Keep machine",
  armedHint: "This removes the machine and drops its belt links. Tap again to commit, or keep it.",
} as const;
