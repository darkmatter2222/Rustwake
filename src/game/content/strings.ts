/**
 * The one player-facing string table (spec 23.3).
 *
 * Every sentence the game paints comes from this table as a key with an English default,
 * so a second locale is one more object instead of a rewrite of the components. Values use
 * named `{placeholder}` slots filled by `t()` — no surface concatenates sentence fragments —
 * and the quantity, time, and plural rules all live here so no panel invents its own.
 *
 * This module imports nothing, because the simulation uses it too and must stay a pure
 * deterministic module shared with a later authoritative server (spec 21.1).
 */

export const STRINGS: Readonly<Record<string, string>> = {
  // ---- HUD chips that are not resources ----------------------------------------
  "chip.credits": "Credits",
  "chip.store": "Store",

  // ---- Start gate and top cluster -------------------------------------------------
  "gate.title": "RUSTWAKE",
  "gate.sub": "Salvage yard 07 · systems waking",
  "gate.begin": "Begin recovery",
  "sound.on": "Sound on",
  "sound.off": "Sound off",
  "btn.soundAudible": "Sound ✓",
  "btn.soundMuted": "Sound ✕",
  "glyph.audible": "♪",
  "glyph.muted": "✕",
  "btn.textScale": "A {scale}",
  "btn.home": "Home",
  "aria.textSize": "Text size {scale}",
  "aria.home": "Return to yard view",

  // ---- Dock and panel controls ---------------------------------------------------
  "btn.close": "Close",
  "btn.cancel": "Cancel",
  "btn.next": "Next",
  "btn.place": "Place {machine}",
  "btn.store": "Store",
  "btn.yard": "Yard",
  "btn.build": "Build",
  "btn.research": "Research",
  "btn.salvage": "Salvage",
  "btn.connect": "Connect",
  "btn.upgrade": "Upgrade",
  "btn.upgradeCost": "Upgrade · {cost}",
  // UI-002: the three command faces of the machine panel each print their own number, so
  // no two of them can be told apart without reading. `Move` names the cell it aims at and
  // the charge the engine levies; `Dismantle` names the units it hands back.
  "btn.move": "Move",
  "btn.moveCost": "Move · cell {tile} · {charge}",
  "btn.dismantleRefund": "Dismantle · +{refund}",
  // PLAY-002 1: two named outcomes on the dock. `btn.branchBuffer` ("More input") went
  // with the dropped branch; `upgradeRanks` still decodes its saved name.
  "btn.branchSpeed": "Faster batches",
  "btn.branchDraw": "Less power",
  "btn.takeOver": "Take over",
  "btn.copy": "Copy",
  "btn.import": "Import",
  "btn.apply": "Apply",
  "btn.back": "Back",
  "btn.recipe": "Recipe",
  "btn.statusPage": "Status",
  "btn.dismantle": "Dismantle",
  "btn.backToYard": "Back to yard",
  "btn.buildNamed": "Build {machine}",
  "btn.sellNamed": "Sell {qty} {label}",
  "btn.researchNamed": "Research {node}",
  "btn.addDrone": "Add drone",
  "btn.buyData": "Buy · {cost}",

  // ---- Objective card: tutorial ladder (spec 4.2) --------------------------------
  // The big line uses card.* keys; the small line under it uses the ids
  // suggestedAction() returns, which keep their own names (see HINT_KEYS below).
  "card.tap-wreck": "Tap the highlighted wreck to salvage scrap.",
  "card.pulses": "Keep salvaging: {pulses}/{needed} pulses for the drone repair.",
  "card.repair": "Repair your recovery drone · {repairCost} scrap",
  "card.observe": "Your drone now works for you.",
  "card.build-sorter": "Build a sorter · {sorterCost}",
  "card.connect-route": "Connect the dock to the sorter.",
  "card.refine": "Refine metal into trade goods · build a furnace",
  "card.export": "Sell your first {label} · {qty} {label} for {credits} credits",
  "card.upgrade": "Improve recovery or production: upgrade a machine.",
  "card.chain": "Choose your next goal.",

  // ---- Objective card: yard ladder (spec 3.3) ------------------------------------
  "step.connect": "Connect {machine} so its cargo moves.",
  "step.build": "Build {machine} · {cost}",
  "step.sell": "Sell {qty} {label} for {credits}.",
  "step.research": "Research {node} · {cost}",
  "step.researchAny": "Research a node when its data cost is covered.",
  "step.drone": "Add a recovery drone · {cost}",
  "step.upgrade": "Upgrade the {machine}.",
  "step.fork": "Choose what improves on the {machine} · {cost}",
  "hud.power": "Power {capacity} · {requested} requested · {percent} %",
  // PLAY-001 P-2/P-4: the two resting numbers the yard answers without a tap - how many
  // drones are actually flying, and what the rows of five pips count.
  "hud.drones": "Drones {count}",
  "hud.pips": "{what} pips · {detail}",
  // PLAY-001 P-1: the same blocked tap, now with its own shortfall.
  "reject.shortfall": "Need {need} {word} · have {have}",
  // PLAY-002 2 (TST-001): the same sentence again on the resting line, prefixed with
  // "Last" and nothing else - `{detail}` is the toast's own string, so one shortfall
  // exists in one place and the two surfaces cannot drift.
  "hud.lastShortfall": "Last {detail}",
  // PLAY-001 P-3: the phase detail of the one committed choice, so the dock's primary
  // label can stay the same words while the ghost waits for its second tap.
  "phase.ghost": "Ghost on cell {tile} · tap again to place",

  // ---- Sub-hints under the objective (spec 4.4) ----------------------------------
  // These ids are exactly what suggestedAction() returns, so one lookup resolves both
  // the tutorial states and the midgame observations.
  "objective.repair": "Tap Salvage until the drone repair is affordable.",
  "objective.build-sorter": "Open Build and place the sorter on a lit cell.",
  "objective.connect-route": "Draw the route so cargo has somewhere to go.",
  "objective.export": "Sell the steel to earn your first credits.",
  "objective.upgrade": "Pick a machine and upgrade its speed.",
  "objective.chain": "Sell a surplus, then fund the next processor or an upgrade.",
  "objective.research": "Data pays for one research node; open Research to see its effect.",
  "hint.starved": "A machine waits for input; check its empty side.",
  "hint.cargo-full": "A machine's output is waiting; connect storage.",
  "hint.power": "Machines share one power budget; slowest ones share it.",

  // ---- Tutorial dock labels (spec 4.2) ------------------------------------------
  // The two build steps answer with `btn.buildNamed`, the same key the yard ladder and
  // the build-mode row use, so one committed choice keeps one label (PLAY-001 P-3).
  "tut.repair": "Repair drone",
  "tut.connectSorter": "Connect dock to sorter",
  "tut.connectFurnace": "Connect sorter to furnace",
  "tut.sellSteel": "Sell steel",

  // ---- Rejected commands (one table, spec 25.3 case 4) ---------------------------
  "reject.insufficient": "Not enough material",
  "reject.blocked-placement": "Tile blocked",
  "reject.not-found": "No longer available",
  "reject.no-room": "Store full",
  "reject.duplicate": "Already connected",
  "reject.cooldown": "Cutting pulse recharging",
  "reject.cycle": "That would loop back",
  "reject.already-claimed": "Contract already sold",
  "reject.locked": "Sell opens after your first steel contract",
  "reject.already-known": "Already researched",
  "reject.prereq": "Research the earlier node first",
  "reject.fleet-full": "Every drone is already flying",
  "reject.no-drone": "Repair your drone first",
  "reject.read-only": "Another tab is writing this yard",
  "reject.reconciling": "Catching your yard up",
  "report.reconciling": "Catching your yard up",

  // ---- Save import results (spec 22.2, 25.3 case 8) -----------------------------
  "import.empty": "Nothing pasted",
  "import.parse": "Not a Rustwake file",
  "import.schema": "Newer version than this build",
  "import.checksum": "Damaged file",
  "import.invalid": "Impossible values",
  "import.read-only": "Another tab is writing this yard",
  "import.applied": "Applied · tick {tick}, {machines} machines",
  "import.notApplied": "Not applied",

  // ---- Follower tab (spec 22.3) -------------------------------------------------
  "reader.objective": "Following the other tab",
  "reader.hint": "This tab mirrors the yard exactly as the first tab writes it.",
  "reader.stuck": "Another tab is still writing",

  // ---- Panel titles and accessible names ----------------------------------------
  "title.store": "Yard store",
  "title.research": "Research",
  "title.yard": "Yard record",
  "title.report": "While you were away",
  "aria.machineDetails": "{machine} details",
  "aria.storeContents": "Store contents",
  "aria.research": "Research",
  "aria.yardRecord": "Yard record",
  "aria.returnReport": "Return report",

  // ---- Panel row names -----------------------------------------------------------
  "row.status": "Status",
  "row.batch": "Batch",
  "row.cycle": "Cycle",
  "row.actualRate": "Actual rate",
  "row.maxRate": "Max rate",
  "row.power": "Power",
  "row.measured": "Measured",
  "row.nextStep": "Next step",
  "row.nextUpgrade": "Next upgrade",
  "row.nextLink": "Next link",
  "row.needs": "Needs",
  "row.inputs": "Inputs",
  "row.outputs": "Outputs",
  "row.level": "Level",
  "row.branches": "Branches",
  "row.inBuffer": "In buffer",
  "row.tray": "Tray",
  "row.capacity": "Capacity",
  "row.sellFloor": "Sell floor",
  "row.sell": "Sell",
  "row.overflow": "Overflow hold",
  "row.data": "Data",
  "row.tick": "Tick",
  "row.machines": "Machines",
  "row.drones": "Drones",
  "row.links": "Links",
  "row.credits": "Credits",
  "row.save": "Save",
  "row.time": "Time",
  "row.deliveries": "Deliveries",
  "row.batches": "Batches",
  "row.bottleneck": "Bottleneck",

  // ---- Field labels, notes, and panel copy --------------------------------------
  "field.savedYard": "Saved yard",
  "field.pastedText": "Pasted text",
  "note.exportIdle": "Copy this text, or open Import to paste one.",
  "note.copyManual": "Select the text and copy it",
  "note.copied": "Copied to the clipboard",
  "note.paste": "Paste a saved yard, then Apply.",

  // ---- Return report (spec 18.3) ------------------------------------------------
  "report.away": "Away {duration}",
  "report.worked": "Your operation worked for {duration}",
  "report.workedCapped": "Your operation worked for {duration} (capped)",
  "bottleneck.storage-full": "Storage full",
  "bottleneck.power-limited": "Power limited",
  "bottleneck.starved": "Waiting for input",

  // ---- Measured values inside rows (spec 9.4, 10.4, 10.5) -----------------------
  "value.percent": "{percent}%",
  "value.seconds": "{seconds}s",
  "value.actualRate": "{rate} batches/s · {window}s window",
  "value.maxRate": "{rate} batches/s at full power",
  "value.powerUnits": "{count} {units}",
  "value.branches": "{speed} fast · {buffer} input · {draw} power",
  "value.powerLimited": " · Power limited: {percent}% speed",
  "value.nextUpgrade": "{from}s → {to}s · {cost}",
  "value.characters": "{count} characters",
  "value.sellButton": "Sell {qty} · +{credits}",
  "value.exportContract": "{qty} {label} · {credits} credits",
  "value.sellFloor": "{count} {units} kept per material",
  "value.sellOpens": "Opens after the first steel contract",
  "value.known": "Known",
  "value.needsPrereq": "Needs {node} first",
  "value.earlierNode": "the earlier node",
  "value.dataCost": "{cost} Data",
  "value.recipeItem": "{qty} {label}",
  "value.linkCarries": "{source} to {target} carries {thing}",
  "value.dock": "dock",
  "value.dockStore": "the dock store",
  "value.cargo": "cargo",
  "value.and": " and ",
  "value.comma": ", ",
  "value.semicolon": "; ",
  "value.dotSeparator": " · ",

  // ---- Machine status names (spec 20.2) -----------------------------------------
  "status.idle": "Ready",
  "status.running": "Working",
  "status.starved": "Needs input",
  "status.outputFull": "Cargo full",
  "status.powerLimited": "Power limited",
  "status.paused": "Paused",

  // ---- Bottleneck assistant: evidence then one action (spec 10.5) ---------------
  "evidence.working": "Working {percent}%",
  "evidence.waiting": "waiting for input {percent}%",
  "evidence.outputWaiting": "output waiting {percent}%",
  "evidence.linkBusy": "link {percent}% busy",
  "evidence.power": "power {percent}%",
  "advice.storageFull":
    "Storage is full at {percent}%. Sell a surplus in the yard store to free room.",
  "advice.powerLimited":
    "Power limited: {machines} machines want {requested} {units} against {capacity}, so work runs at {percent}% speed. Finish the line before adding another machine.",
  "advice.needsFromStore":
    "Needs {inputs}. Connect {source} to this machine so its input arrives.",
  "advice.needsNone":
    "Needs {inputs}, which nothing in the yard makes yet. Build the machine that outputs it, then connect.",
  "advice.outputWaiting":
    "Output is waiting: {count} {units} in the tray with nowhere to go. Connect this machine to the dock.",
  "advice.starvedNone":
    "Waits for input {percent}% of the time and nothing in the yard makes that material yet.",
  "advice.starvedStore":
    "Waits for input {percent}% of the time because the dock is empty. One salvage pulse tops it up; no purchase needed.",
  "advice.starvedMachine":
    "Waits for input {percent}% of the time while {source} is the limiter. Upgrade {source} first.",
  "advice.fullWithLink":
    "Its output waits {percent}% of the time while the link is busy {link}%. Nothing to buy here: the link, not this machine, is the limit.",
  "advice.fullNoLink":
    "Its output waits {percent}% of the time. Nothing to buy here: the link, not this machine, is the limit.",
  "advice.busy":
    "Runs at full speed {percent}% of the time. Nothing to fix on this machine.",
  "advice.normal":
    "Working {percent}% of the time and waiting {starved}% for input. Both are inside normal range for this line.",
  "yard.storageFull": "Storage {percent}% full ({units}/{capacity})",
  "yard.powerSpeed": "Power {percent}% speed ({requested} of {capacity} {units} requested)",
  "yard.busiestLink": "Busiest link {percent}% busy ({inFlight}/{capacity} in transit)",
  "yard.starved": "{count} {machines} waiting for input",

  // ---- Resource names (chips and rows; capitalized, spec 5.4) -------------------
  "res.scrap": "Scrap",
  "res.ferrous": "Ferrous",
  "res.nonferrous": "Nonferrous",
  "res.residue": "Residue",
  "res.copper": "Copper",
  "res.polymer": "Polymer",
  "res.wire": "Wire",
  "res.plates": "Plates",
  "res.steel": "Steel",
  "res.circuits": "Circuits",
  "res.motors": "Motors",
  "res.battery": "Battery",
  "res.alloy": "Alloy",
  "res.data": "Data",
  "res.chassis": "Chassis",

  // ---- Unit words for the one plural rule ---------------------------------------
  "unit.credit": "credit",
  "unit.unit": "unit",
  "unit.machine": "machine",
};

/** Ordered keys for the tutorial objective card's big line (spec 4.2 T0…T9). */
export const OBJECTIVE_KEYS: readonly string[] = [
  "card.tap-wreck",
  "card.pulses",
  "card.repair",
  "card.observe",
  "card.build-sorter",
  "card.connect-route",
  "card.refine",
  "card.export",
  "card.upgrade",
  "card.chain",
];

/** Keys `suggestedAction()` returns; the validator proves each one resolves. */
export const HINT_KEYS: readonly string[] = [
  "objective.repair",
  "objective.build-sorter",
  "objective.connect-route",
  "objective.export",
  "objective.upgrade",
  "objective.chain",
  "objective.research",
  "hint.starved",
  "hint.cargo-full",
  "hint.power",
];

/** Chips the top row can show that are not bulk resources (spec 5.4). */
export const CHIP_KEYS: readonly string[] = ["chip.credits", "chip.store"];

/** Machine status ids in the order the renderer can produce them (spec 20.2). */
export const STATUS_KEYS: readonly string[] = [
  "idle",
  "running",
  "starved",
  "outputFull",
  "powerLimited",
  "paused",
];

/** Command reject reasons the engine can return (spec 22.5). */
export const REJECT_KEYS: readonly string[] = [
  "insufficient",
  "blocked-placement",
  "not-found",
  "no-room",
  "duplicate",
  "cooldown",
  "cycle",
  "already-claimed",
  "locked",
  "already-known",
  "prereq",
  "fleet-full",
  "no-drone",
  "read-only",
  "reconciling",
];

/** Import failure reasons (spec 22.2). */
export const IMPORT_KEYS: readonly string[] = [
  "empty",
  "parse",
  "schema",
  "checksum",
  "invalid",
  "read-only",
];

/**
 * Resolves one key, substituting `{name}` slots. A missing key stays visible as the key
 * itself, which is how a later locale reveals a gap in the same screen instead of
 * painting an empty row; an unknown slot stays as its own placeholder.
 */
export function t(key: string, params?: Readonly<Record<string, string | number>>): string {
  const template = STRINGS[key];
  if (template === undefined) return key;
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole: string, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

/** Chip name for a bulk resource, from the table ("Scrap"). */
export function resourceName(resource: string): string {
  return t(`res.${resource}`);
}

/** The same name inside a sentence, where a capital would read as a name ("20 scrap"). */
export function resourceWord(resource: string): string {
  return resourceName(resource).toLocaleLowerCase();
}

/** The one plural rule, so no component writes `n === 1 ? "" : "s"` again (spec 23.3). */
export function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/** Count plus unit word: "1 credit", "45 credits", "2 units". */
export function unit(count: number, word: string): string {
  return `${formatNumber(count)} ${plural(count, word)}`;
}

/** Whole percent of a 0..1 ratio, the single rounding stage for speed readouts. */
export function wholePercent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * Abbreviates large totals the way the HUD needs them (spec 5.4). Exact values stay
 * exact on inspection; the abbreviated forms are for the top row only.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value < 10000) return String(value);
  if (value < 1e6) return `${(value / 1e3).toFixed(value < 1e5 ? 2 : 1)}K`;
  return `${(value / 1e6).toFixed(2)}M`;
}

/** Two-decimal seconds, the cycle and upgrade readout precision. */
export function formatSeconds(seconds: number): string {
  return Number.isFinite(seconds) ? seconds.toFixed(2) : "0.00";
}

/** Two-decimal throughput, so actual and maximum rates are comparable. */
export function formatRate(rate: number): string {
  return Number.isFinite(rate) ? rate.toFixed(2) : "0.00";
}

/** Whole seconds, for a measurement window label. */
export function formatWholeSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

/** "90s", "12m 5s", "18h 0m" from simulation ticks, capped at hour precision. */
export function formatDuration(ticks: number): string {
  const seconds = Math.round(ticks / 10);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
