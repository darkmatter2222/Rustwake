import type { ResourceId } from "../game/content/defs";
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

export function objectiveFor(state: SimState): string {
  const index = Math.min(state.tutorial, OBJECTIVES.length - 1);
  return OBJECTIVES[index].replace("{pulses}", String(state.wreck.pulses));
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
};

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

/** Bulk resources shown in the HUD, revealed as they become meaningful (spec 5.4). */
export function visibleResources(state: SimState): ResourceId[] {
  const shown: ResourceId[] = ["scrap"];
  const fragments = (state.store["ferrous"] ?? 0) + (state.store["nonferrous"] ?? 0);
  if (fragments > 0) shown.push("ferrous");
  if ((state.store["steel"] ?? 0) > 0) shown.push("steel");
  if ((state.store["data"] ?? 0) > 0) shown.push("data");
  return shown.slice(0, 3);
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
  "hint.starved": "A machine waits for input; check its empty side.",
  "hint.cargo-full": "A machine's output is waiting; connect storage.",
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
