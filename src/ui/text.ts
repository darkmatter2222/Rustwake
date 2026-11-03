import { BLUEPRINTS, type ResourceId } from "../game/content/defs";
import { RESEARCH } from "../game/content/research";
import { droneAddCost, upgradeCost } from "../game/simulation/commands";
import { SELL_ORDER, nextYardStep, sellValue, stepForMachine, type YardStep } from "../game/simulation/plan";
import type { ImportResult } from "../game/persistence/save";
import type { SimState } from "../game/simulation/types";

/** Short concrete verbs first (spec 4.4). Keys keep later translation cheap. */
export const OBJECTIVES: readonly string[] = [
  "Tap the highlighted wreck to salvage scrap.",
  "Keep salvaging: {pulses}/6 pulses for the drone repair.",
  "Repair your recovery drone · 30 scrap",
  "Your drone now works for you.",
  "Build a sorter · 20 scrap",
  "Connect the dock to the sorter.",
  "Refine metal into trade goods · build a furnace",
  "Sell your first steel · 3 steel for 30 credits",
  "Improve recovery or production: upgrade a machine.",
  "Choose your next goal.",
];

export function objectiveFor(state: SimState, selected?: number | null): string {
  if (state.tutorial >= 8) return describeStep(state, stepFor(state, selected));
  const index = Math.min(state.tutorial, OBJECTIVES.length - 1);
  return OBJECTIVES[index].replace("{pulses}", String(state.wreck.pulses));
}

/** Selected machine leads when there is one; otherwise the yard ladder does. */
function stepFor(state: SimState, selected?: number | null): YardStep {
  if (selected !== undefined && selected !== null && selected > 0) {
    return stepForMachine(state, selected) ?? nextYardStep(state);
  }
  return nextYardStep(state);
}

/** One phrased goal per yard step, shared with the dock's labels (spec 3.3). */
export function describeStep(state: SimState, step: YardStep): string {
  switch (step.kind) {
    case "connect":
      return `Connect ${machineLabel(state, step.machineId)} so its cargo moves.`;
    case "build":
      return `Build ${BLUEPRINTS[step.blueprint].label} · ${costSummary(BLUEPRINTS[step.blueprint])}`;
    case "sell":
      return `Sell ${step.qty} ${RESOURCE_LABEL[step.resource]} for ${sellValue(
        step.resource,
        step.qty
      )} credits.`;
    case "research": {
      const def = RESEARCH[step.node];
      // The node's effect lives in the research panel beside its button; the card keeps
      // one line so the objective never costs a third text row on a short screen (B-26).
      return def ? `Research ${def.label} · ${def.cost} Data` : "Research a node when its data cost is covered.";
    }
    case "drone":
      return `Add a recovery drone · ${droneAddCost(state)} credits`;
    case "upgrade":
      return `Upgrade the ${machineLabel(state, step.machineId)}.`;
    default:
      return "Tap the highlighted wreck to salvage scrap.";
  }
}

/** Dock label and cost line for the same step, so both agree. */
export function primaryFor(state: SimState, step: YardStep): { label: string; cost?: string } {
  switch (step.kind) {
    case "connect":
      return { label: "Connect" };
    case "build": {
      const def = BLUEPRINTS[step.blueprint];
      return { label: `Build ${def.label}`, cost: costSummary(def) };
    }
    case "sell":
      return {
        label: `Sell ${step.qty} ${RESOURCE_LABEL[step.resource]}`,
        cost: `+${sellValue(step.resource, step.qty)} credits`,
      };
    case "research": {
      const def = RESEARCH[step.node];
      if (!def) return { label: "Research" };
      return { label: `Research ${def.label}`, cost: `${def.cost} Data` };
    }
    case "drone":
      return { label: "Add drone", cost: `${droneAddCost(state)} credits` };
    case "upgrade": {
      const machine = state.machines.find((m) => m.id === step.machineId);
      const def = machine ? BLUEPRINTS[machine.blueprint] : undefined;
      if (!machine || !def) return { label: "Upgrade" };
      // The card above names the machine ("Upgrade the Scrap sorter."), so the button
      // carries the verb and the price only. Measured reason: at text scale 2.0 the
      // four-word label made the dock row 145 px tall, 21 % of a 360 × 640 viewport.
      return {
        label: "Upgrade",
        cost: `${upgradeCost(def.baseUpgradeCost, machine.level)} credits`,
      };
    }
    default:
      return { label: "Salvage" };
  }
}

function machineLabel(state: SimState, machineId: number): string {
  const machine = state.machines.find((m) => m.id === machineId);
  return machine ? BLUEPRINTS[machine.blueprint].label : "machine";
}

export const REJECT_TEXT: Record<string, string> = {
  insufficient: "Not enough material",
  "blocked-placement": "Tile blocked",
  "not-found": "No longer available",
  "no-room": "Store full",
  duplicate: "Already connected",
  cooldown: "Cutting pulse recharging",
  cycle: "That would loop back",
  "already-claimed": "Contract already sold",
  locked: "Sell opens after your first steel contract",
  "already-known": "Already researched",
  prereq: "Research the earlier node first",
  "fleet-full": "Every drone is already flying",
  "no-drone": "Repair your drone first",
  "read-only": "Another tab is writing this yard",
};

/** One bounded explanation per import failure (spec 22.2, spec 25.3 case 8). */
export const IMPORT_TEXT: Record<string, string> = {
  empty: "Nothing pasted",
  parse: "Not a Rustwake file",
  schema: "Newer version than this build",
  checksum: "Damaged file",
  invalid: "Impossible values",
  "read-only": "Another tab is writing this yard",
};

/** The one-line note the Yard panel shows after an import attempt. */
export function importNoteFor(result: ImportResult): string {
  if (result.ok) return `Applied · tick ${result.tick}, ${result.machines} machines`;
  const base = IMPORT_TEXT[result.reason] ?? "Not applied";
  // The invariant name is developer-facing but short and useful when a file was
  // hand-edited; it never replaces the plain-language reason.
  return result.detail ? `${base} (${result.detail})` : base;
}

export const RESOURCE_LABEL: Record<string, string> = {
  scrap: "Scrap",
  ferrous: "Ferrous",
  nonferrous: "Nonferrous",
  residue: "Residue",
  copper: "Copper",
  polymer: "Polymer",
  wire: "Wire",
  plates: "Plates",
  steel: "Steel",
  circuits: "Circuits",
  motors: "Motors",
  battery: "Battery",
  alloy: "Alloy",
  data: "Data",
  chassis: "Chassis",
};

export const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  running: "Working",
  starved: "Needs input",
  outputFull: "Cargo full",
  powerLimited: "Power limited",
  paused: "Paused",
};

/**
 * Bulk resources shown in the HUD, revealed as they become meaningful (spec 5.4).
 * `max` is the entry count this layout can afford, which hudChipLimit() derives from
 * the viewport width so the chip block stays two rows tall on a narrow phone.
 */
export function visibleResources(state: SimState, max = 5): ResourceId[] {
  const limit = Math.max(1, Math.floor(max));
  const shown: ResourceId[] = ["scrap"];
  for (const resource of SELL_ORDER) {
    if (shown.length >= limit) break;
    if (resource === "scrap") continue;
    if ((state.store[resource] ?? 0) > 0) shown.push(resource);
  }
  return shown;
}

/**
 * Chip budget for the HUD top row (spec 5.4): four on a portrait phone, seven on a
 * wide screen, counting the pinned resources plus the credits and Store status chips.
 * The measured reason for the small portrait budget is
 * docs/evidence/2026-11-03-hud-share.md: a fifth chip is what forces a third row and
 * pushes the resting HUD past the 22 % band at 360 × 640. At a large text scale one
 * chip is dropped, which spec 6.4 allows because nonessential elements step back.
 * A short viewport (a phone turned sideways has ~390 px of height) takes the budget
 * that fits a single wrapping row: each chip row is 24 px of those 390, so the 7-chip
 * layout cost two rows and 6 % of the screen for information the store panel repeats.
 */
export function hudChipLimit(
  width = typeof window === "undefined" ? 1024 : window.innerWidth,
  scale = readTextScale(),
  height = typeof window === "undefined" ? 768 : window.innerHeight,
): number {
  const base = width <= 420 ? 4 : height <= 460 ? 5 : 7;
  return scale >= 1.5 ? Math.max(3, base - 1) : base;
}

/** The scale the app publishes as a custom property, or 1 when unset. */
function readTextScale(): number {
  if (typeof document === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Compact build cost, e.g. "25 scrap + 5 ferrous". */
export function costSummary(def: {
  buildCost: readonly { resource: ResourceId; qty: number }[];
}): string {
  return def.buildCost.map((item) => `${item.qty} ${RESOURCE_LABEL[item.resource]}`).join(" + ");
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value < 10000) return String(value);
  if (value < 1e6) return `${(value / 1e3).toFixed(value < 1e5 ? 2 : 1)}K`;
  return `${(value / 1e6).toFixed(2)}M`;
}

/** Plain-language sub-hints shown under the objective line (spec 4.4). */
export const HINT_LABELS: Record<string, string> = {
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
};

export function hintFor(key: string): string {
  return HINT_LABELS[key] ?? "";
}

export function formatDuration(ticks: number): string {
  const seconds = Math.round(ticks / 10);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
