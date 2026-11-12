/**
 * UI-RESET-54 (G2 wave 3): the machine inspector's own copy, kept UI-local exactly
 * like `src/ui/hud/copy.ts` (#51). The shared string table `src/game/content/strings.ts`
 * is read-only for this issue, so genuinely new sentences live here as plain literals;
 * every number still comes from the engine through the same formatters (`unit`,
 * `formatNumber`, `t`) the table uses. The i18n gate scans painted text for raw-key
 * shapes (`row.…`, `btn.…`), so nothing here may look like a key: these are sentences.
 */
export const COPY = {
  sections: {
    identity: "Identity",
    recipe: "Recipe",
    production: "Production",
    bottleneck: "Bottleneck",
    transport: "Transport",
    recovery: "Recovery context",
    actions: "Actions",
  },
  rows: {
    cell: "Cell",
    powerCappedRate: "Rate at current power",
    requested: "Yard demand",
    thisMachine: "This machine",
    speed: "Shared speed",
    capacity: "Store capacity",
    reserve: "Reserve",
  },
  recipe: {
    /** The input → output flow line; the arrow is a literal, not a key. */
    arrow: "→",
    perBatch: "per batch",
  },
  context: {
    storage: "Storage",
    routes: "Routes",
    power: "Power",
    hint: "Open storage, route or power context here. The machine stays selected; nothing is dispatched.",
    storageHelp:
      "Sell or reclaim space from the Store panel in the dock. This machine stays selected while you work.",
    routesHelp:
      "Missing links are offered by Connect in the actions below. Busy links cap throughput even when the machine is fed.",
    powerHelp:
      "Every running machine shares one yard budget. When demand passes capacity, all batches slow to the same fraction.",
    noLinks: "No links on this machine yet.",
    carries: "carries",
    busy: "busy",
  },
  constraints: {
    missingInput: "Missing input: the buffer is short",
    missingInputEnd: "to start the next batch. A link from the dock store or a producer refills it.",
    fullOutput: "Output full: the tray holds",
    fullOutputEnd: "Connect an output link or sell from the store to clear it.",
    power: "Power limited: the yard requests",
    powerEnd: "speed for every running machine.",
    noOutputLink:
      "No output link: finished batches wait in the tray. Connect offers the missing belt below.",
    // Issue #100: a multi-output machine has several output belts; the note reports the
    // busiest one, so the sentence stays grammatical for one link or many.
    busyLink: "Transport limit: an output link is",
    busyLinkEnd: "busy, so belt capacity caps throughput.",
    noLinks:
      "No links yet: this machine is isolated. Connect lays belt from the dock store or a producer.",
  },
  /**
   * UI-RESET-64 (criterion 3): the concise, plain-language headline for each bottleneck,
   * shown by default; the full diagnostic sentence above becomes the expandable detail.
   * One short phrase per constraint, in the player's vocabulary, never a key shape.
   */
  constraintHeads: {
    missingInput: "Needs input to run",
    fullOutput: "Output tray is full",
    power: "Running on limited power",
    noOutputLink: "No output route yet",
    busyLink: "Output belt is at capacity",
    noLinks: "No routes connected yet",
  },
  actions: {
    connectPrimary: "Connect is the primary action: it lays belt for",
    connectPrimaryEnd: "and starts the flow immediately.",
    upgradePrimary:
      "Upgrade is the primary action: it spends the printed credits now and shortens every batch to the time shown in Next upgrade.",
    secondary:
      "Move and Dismantle are secondary. Move keeps the machine, its level and its links, re-laying touching belt for the printed charge. Dismantle removes the machine and returns the printed units to the store.",
  },
} as const;
