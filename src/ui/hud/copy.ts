/**
 * UI-RESET-51: plain-language copy for the rebuilt HUD surfaces.
 *
 * `src/game/content/strings.ts` is owned by the simulation/content layer and is
 * read-only for this issue, so the new HUD wording lives here as plain literals.
 * Every line is deliberately free of `prefix.word` shapes: the i18n gate scans
 * painted HUD text for untranslated key patterns, and these strings are already
 * the player-facing English, not keys.
 */
export const COPY = {
  allResources: "All resources",
  openStore: "Open store",
  storeFull: "Store full",
  storeHigh: "Store nearly full",
  sellToFree: "sell to free space",
  contractFirst: "finish the steel contract to sell",
  heldOutside: "held outside",
  power: "Power",
  limited: "limited",
  needInput: "need input",
  cargoFull: "cargo full",
  collapse: "Collapse objective",
  expand: "Expand objective",
  dismiss: "Dismiss objective",
  restore: "Show objective",
} as const;