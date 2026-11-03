/**
 * Content definitions: resources, blueprints, and recipes (spec 9.3).
 *
 * These are typed data, validated at load. All quantities are integer cargo
 * units; durations are whole multiples of the base simulation tick.
 */

export const TICK_MS = 100;
export const TICKS_PER_SECOND = 1000 / TICK_MS;

export type ResourceId =
  | "scrap"
  | "ferrous"
  | "nonferrous"
  | "residue"
  | "copper"
  | "polymer"
  | "wire"
  | "plates"
  | "steel"
  | "circuits"
  | "motors"
  | "battery"
  | "alloy"
  | "data"
  | "chassis";

export interface ItemStack {
  readonly resource: ResourceId;
  readonly qty: number;
}

export interface RecipeDef {
  readonly id: string;
  readonly inputs: readonly ItemStack[];
  readonly outputs: readonly ItemStack[];
  /** Whole ticks at full power. */
  readonly cycleTicks: number;
  /** Abstract power units (spec 9.3). */
  readonly power: number;
}

export interface BlueprintDef {
  readonly id: string;
  readonly label: string;
  readonly recipeId: string;
  readonly buildCost: readonly ItemStack[];
  /** Footprint in cells: [width, height]. */
  readonly footprint: readonly [number, number];
  readonly inputBuffer: number;
  readonly outputBuffer: number;
  readonly baseUpgradeCost: number;
  /** Tutorial step at which the blueprint appears in the build picker (spec 5.5). */
  readonly unlockAt: number;
}

const seconds = (s: number): number => s * TICKS_PER_SECOND;

export const RESOURCES: readonly ResourceId[] = [
  "scrap",
  "ferrous",
  "nonferrous",
  "residue",
  "copper",
  "polymer",
  "wire",
  "plates",
  "steel",
  "circuits",
  "motors",
  "battery",
  "alloy",
  "data",
  "chassis",
] as const;

/** Recipes R01..R12 from spec 9.3. */
export const RECIPES: Readonly<Record<string, RecipeDef>> = {
  R01: {
    id: "R01",
    inputs: [{ resource: "scrap", qty: 2 }],
    outputs: [
      { resource: "ferrous", qty: 1 },
      { resource: "nonferrous", qty: 1 },
    ],
    cycleTicks: seconds(4),
    power: 1,
  },
  R02: {
    id: "R02",
    inputs: [{ resource: "ferrous", qty: 2 }],
    outputs: [{ resource: "steel", qty: 1 }],
    cycleTicks: seconds(4),
    power: 2,
  },
  R03: {
    id: "R03",
    inputs: [{ resource: "nonferrous", qty: 2 }],
    outputs: [
      { resource: "copper", qty: 1 },
      { resource: "residue", qty: 1 },
    ],
    cycleTicks: seconds(5),
    power: 2,
  },
  R04: {
    id: "R04",
    inputs: [{ resource: "residue", qty: 3 }],
    outputs: [{ resource: "polymer", qty: 1 }],
    cycleTicks: seconds(6),
    power: 1,
  },
  R05: {
    id: "R05",
    inputs: [{ resource: "copper", qty: 1 }],
    outputs: [{ resource: "wire", qty: 3 }],
    cycleTicks: seconds(4),
    power: 2,
  },
  R06: {
    id: "R06",
    inputs: [{ resource: "steel", qty: 2 }],
    outputs: [{ resource: "plates", qty: 3 }],
    cycleTicks: seconds(5),
    power: 3,
  },
  R07: {
    id: "R07",
    inputs: [
      { resource: "wire", qty: 2 },
      { resource: "polymer", qty: 1 },
    ],
    outputs: [{ resource: "circuits", qty: 1 }],
    cycleTicks: seconds(8),
    power: 3,
  },
  R08: {
    id: "R08",
    inputs: [
      { resource: "steel", qty: 2 },
      { resource: "wire", qty: 2 },
    ],
    outputs: [{ resource: "motors", qty: 1 }],
    cycleTicks: seconds(12),
    power: 3,
  },
  R09: {
    id: "R09",
    inputs: [
      { resource: "copper", qty: 1 },
      { resource: "polymer", qty: 1 },
      { resource: "steel", qty: 1 },
    ],
    outputs: [{ resource: "battery", qty: 1 }],
    cycleTicks: seconds(12),
    power: 3,
  },
  R10: {
    id: "R10",
    inputs: [
      { resource: "plates", qty: 3 },
      { resource: "motors", qty: 2 },
      { resource: "circuits", qty: 2 },
      { resource: "battery", qty: 1 },
    ],
    outputs: [{ resource: "chassis", qty: 1 }],
    cycleTicks: seconds(30),
    power: 5,
  },
  R11: {
    id: "R11",
    inputs: [{ resource: "circuits", qty: 1 }],
    outputs: [{ resource: "data", qty: 2 }],
    cycleTicks: seconds(15),
    power: 2,
  },
  R12: {
    id: "R12",
    inputs: [
      { resource: "steel", qty: 3 },
      { resource: "polymer", qty: 1 },
    ],
    outputs: [{ resource: "alloy", qty: 2 }],
    cycleTicks: seconds(12),
    power: 5,
  },
} as const;

/**
 * Starter blueprints. `advanced additive` in R12 is represented by polymer in
 * the first tier so the recipe stays closed under available outputs.
 */
export const BLUEPRINTS: Readonly<Record<string, BlueprintDef>> = {
  sorter: {
    id: "sorter",
    label: "Scrap sorter",
    recipeId: "R01",
    buildCost: [{ resource: "scrap", qty: 20 }],
    footprint: [1, 1],
    inputBuffer: 12,
    outputBuffer: 12,
    baseUpgradeCost: 30,
    unlockAt: 4,
  },
  furnace: {
    id: "furnace",
    label: "Furnace",
    recipeId: "R02",
    buildCost: [
      { resource: "scrap", qty: 10 },
      { resource: "ferrous", qty: 5 },
    ],
    footprint: [1, 1],
    inputBuffer: 12,
    outputBuffer: 12,
    baseUpgradeCost: 40,
    unlockAt: 6,
  },
  copperSeparator: {
    id: "copperSeparator",
    label: "Copper separator",
    recipeId: "R03",
    buildCost: [
      { resource: "scrap", qty: 25 },
      { resource: "ferrous", qty: 5 },
    ],
    footprint: [1, 1],
    inputBuffer: 12,
    outputBuffer: 12,
    baseUpgradeCost: 45,
    unlockAt: 7,
  },
  polymerRecycler: {
    id: "polymerRecycler",
    label: "Polymer recycler",
    recipeId: "R04",
    buildCost: [
      { resource: "scrap", qty: 25 },
      { resource: "nonferrous", qty: 5 },
    ],
    footprint: [1, 1],
    inputBuffer: 16,
    outputBuffer: 12,
    baseUpgradeCost: 50,
    unlockAt: 7,
  },
  wireMill: {
    id: "wireMill",
    label: "Wire mill",
    recipeId: "R05",
    buildCost: [
      { resource: "scrap", qty: 30 },
      { resource: "nonferrous", qty: 6 },
    ],
    footprint: [1, 1],
    inputBuffer: 12,
    outputBuffer: 18,
    baseUpgradeCost: 55,
    unlockAt: 8,
  },
  platePress: {
    id: "platePress",
    label: "Plate press",
    recipeId: "R06",
    buildCost: [
      { resource: "scrap", qty: 35 },
      { resource: "ferrous", qty: 8 },
    ],
    footprint: [1, 1],
    inputBuffer: 12,
    outputBuffer: 18,
    baseUpgradeCost: 60,
    unlockAt: 8,
  },
  circuitAssembler: {
    id: "circuitAssembler",
    label: "Circuit assembler",
    recipeId: "R07",
    buildCost: [
      { resource: "scrap", qty: 40 },
      { resource: "ferrous", qty: 10 },
    ],
    footprint: [1, 1],
    inputBuffer: 16,
    outputBuffer: 12,
    baseUpgradeCost: 70,
    unlockAt: 9,
  },
  signalLab: {
    id: "signalLab",
    label: "Signal lab",
    recipeId: "R11",
    buildCost: [
      { resource: "scrap", qty: 50 },
      { resource: "ferrous", qty: 12 },
    ],
    footprint: [1, 1],
    inputBuffer: 12,
    outputBuffer: 12,
    baseUpgradeCost: 75,
    unlockAt: 9,
  },
} as const;

/**
 * Content-defined export prices in credits per cargo unit (spec 8.4). Materials
 * are never repurchased for credits, so these one-way values cannot form a
 * free buy/sell loop; the tiers rise with the work and power each recipe costs.
 * Values are tuning hypotheses, not validated market rates.
 */
export const EXPORT_PRICES: Readonly<Partial<Record<ResourceId, number>>> = {
  scrap: 1,
  ferrous: 2,
  nonferrous: 2,
  residue: 1,
  steel: 10,
  copper: 6,
  polymer: 8,
  wire: 4,
  plates: 15,
  circuits: 30,
  motors: 60,
  battery: 90,
  alloy: 120,
  data: 5,
} as const;

/** Credit value for one unit, or 0 when the resource has no export price. */
export function exportPrice(resource: ResourceId): number {
  return EXPORT_PRICES[resource] ?? 0;
}

/**
 * Blueprints shown in the build picker at a tutorial step, in reveal order
 * (spec 5.4, 5.5). Two machines arrive with the first processing choice so the
 * player has a real decision once credits exist.
 */
export function unlockedBlueprints(tutorial: number): string[] {
  const step = Math.max(4, tutorial);
  return Object.keys(BLUEPRINTS).filter((id) => BLUEPRINTS[id].unlockAt <= step);
}

/** Design defaults for the starter yard (spec 4.3, 8.3, 10.4). */
export const TUNING = {
  manualSalvagePerPulse: 5,
  manualPulseTicks: 6, // 0.6 s feedback cycle
  starterWreckPool: 30,
  droneScrapPerSecond: 1,
  droneDeliveryUnits: 5,
  droneDeliveryTicks: 5 * TICKS_PER_SECOND,
  droneTravelTicks: 10,
  dockCapacity: 900, // ~15 min of starter output
  yardPowerCapacity: 8,
  repairCostScrap: 30,
  exportContractSteel: 3,
  exportContractCredits: 30,
  routeCapacity: 24,
  routeLatencyTicks: 5,
  offlineCapTicks: 12 * 3600 * TICKS_PER_SECOND,
  activeBoostCapPercent: 10,
  /** Units of one resource the yard keeps back so routes and builds still work. */
  reserveFloor: 10,
  /** Largest single sellable tranche; keeps one transaction bounded (spec 5.1). */
  sellBatchCap: 60,
} as const;

export type Tuning = typeof TUNING;
