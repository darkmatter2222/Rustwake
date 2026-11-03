import { BLUEPRINTS, type ResourceId } from "../game/content/defs";
import { upgradeCost } from "../game/simulation/commands";
import { SELL_ORDER, nextYardStep, sellValue, type YardStep } from "../game/simulation/plan";
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
  if (state.tutorial >= 8) return describeStep(state, nextYardStep(state));
  const index = Math.min(state.tutorial, OBJECTIVES.length - 1);
  return OBJECTIVES[index].replace("{pulses}", String(state.wreck.pulses));
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
    case "upgrade":
      return `Improve recovery or production: upgrade ${machineLabel(state, step.machineId)}.`;
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
    case "upgrade": {
      const machine = state.machines.find((m) => m.id === step.machineId);
      const def = machine ? BLUEPRINTS[machine.blueprint] : undefined;
      if (!machine || !def) return { label: "Upgrade" };
      return {
        label: `Upgrade ${def.label}`,
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
  for (const resource of SELL_ORDER) {
    if (shown.length >= 3) break;
    if (resource === "scrap") continue;
    if ((state.store[resource] ?? 0) > 0) shown.push(resource);
  }
  return shown;
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
