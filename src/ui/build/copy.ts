/**
 * UI-RESET-52: the build catalog's own copy, in the plain-literal form
 * `hud/copy.ts` established. Every line is deliberately free of `prefix.word`
 * shapes: the i18n gate scans painted HUD text for untranslated key patterns,
 * and the catalog paints inside `.hud`. Verbs that already live in the one
 * STRINGS table (Close, Store, Salvage, Place {machine}, Inputs, Outputs,
 * Power, the shortfall sentence) are read through `t()` at the call site, not
 * duplicated here.
 */
export const COPY = {
  title: "Build catalog",
  close: "Close catalog",
  lead: "Pick a machine, read its price, then place it in the yard.",
  /** Display grouping only — the unlock gate stays each blueprint's own `unlockAt`. */
  separation: "Separation",
  refining: "Refining",
  assembly: "Assembly",
  selected: "Selected",
  ready: "Ready to build",
  salvageHint: "Salvage the wreck for scrap, or sell stock at the store.",
} as const;

/** One plain sentence per machine, matching its recipe in the content table. */
export const FUNCTIONS: Readonly<Record<string, string>> = {
  sorter: "Splits scrap into ferrous and nonferrous metal.",
  furnace: "Smelts ferrous metal into steel.",
  copperSeparator: "Pulls copper and residue from nonferrous metal.",
  polymerRecycler: "Presses residue into polymer.",
  wireMill: "Draws copper into wire.",
  platePress: "Presses steel into plates.",
  circuitAssembler: "Combines wire and polymer into circuits.",
  signalLab: "Reads circuits into data.",
};
