/**
 * UI-RESET-55 (G2 wave 4): the upgrade comparison's own copy, kept UI-local exactly
 * like `src/ui/inspector/copy.ts` (#54) and `src/ui/hud/copy.ts` (#51). The shared
 * string table `src/game/content/strings.ts` is read-only for this issue, so genuinely
 * new sentences live here as plain literals; every number still comes from the engine
 * through the same formatters (`unit`, `formatNumber`, `formatSeconds`, `t`) the table
 * uses. The i18n gate scans painted text for raw-key shapes (`row.…`, `btn.…`), so
 * nothing here may look like a key: these are sentences.
 */
export const UPGRADE_COPY = {
  title: "Upgrade branches",
  intro:
    "Choose what the next level buys. Each card prints the current and proposed value with its unit, the price and the tradeoff. Nothing is selected until you tap a card.",
  rankWord: "Rank",
  costWord: "Cost",
  affordable: "Affordable now",
  buy: "Buy selected",
  buyHint: "Select a branch card above to enable the purchase. Tapping a card never spends anything.",
  plainNote:
    "The plain Upgrade face below buys an unnamed level at the plain price: it counts as one speed rank and changes nothing else.",
  perBatch: "per batch",
  inputUnits: "input units",
  powerUnit: "power unit",
  noChange: "no change",
  noEffectBadge: "No effect",
  drawFloor:
    "Already at the 1-unit power floor: another draw rank changes nothing, so this card cannot be bought.",
  receiptApplied: "Applied",
  receiptShort: "Not applied",
  nothingSpent: "Nothing was spent.",
  levelWord: "level",
  paidWord: "paid",
  respecTitle: "Re-pick the last named upgrade · free",
  respecHelp:
    "Free: moves only the most recent named rank to another branch. The level, the credits and every older pick stay exactly as they are.",
  respecNone:
    "No named upgrade to re-pick yet. Buy a branch above first; a plain unnamed level cannot be re-picked.",
  respecCurrent: "current",
  respecApplied: "Re-picked the last upgrade to",
  respecFree: "free",
  creditsUnchanged: "credits unchanged",
  respecNoopSame: "That branch is already the last pick, so nothing changed.",
  respecNoopNone: "There is no named pick to move, so nothing changed.",
  branches: {
    speed: {
      title: "Speed",
      metric: "Batch time",
      tradeoff:
        "Shortens every batch by one speed step. Adds no input space and cuts no power draw. Priced 10 credits above the plain ladder.",
    },
    buffer: {
      title: "Input buffer",
      metric: "Input capacity",
      tradeoff:
        "Adds 6 input units so a bursty supply can keep batches starting. Leaves batch time and power draw unchanged.",
    },
    draw: {
      title: "Power draw",
      metric: "Power per batch",
      tradeoff:
        "Cuts this machine's draw by 1 unit, freeing shared yard power for other machines. Leaves batch time and input space unchanged.",
    },
  },
} as const;
