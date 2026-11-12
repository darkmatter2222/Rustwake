/**
 * UI-RESET-64: the onboarding / contextual-help copy lane. `strings.ts` is read-only
 * for this issue, so every new teaching sentence lives here as a plain literal, exactly
 * like `home/copy.ts`, `place/copy.ts` and `inspector/copy.ts`. None of these may take
 * the shape of a translation key (the i18n census refuses raw `prefix.word` patterns
 * anywhere in the HUD), so they are full sentences and words.
 *
 * Vocabulary is deliberately consistent with the rest of the shell: materials are named
 * the way the chips and the build catalog name them (Scrap, Ferrous, Steel, Circuits,
 * Data), the shared store is the "Store", a belt link is a "route", and the flying
 * recovery drone is the "drone". Machine purpose sentences are read from the build
 * catalog's own `FUNCTIONS` table at the call site, so a machine is never explained two
 * different ways.
 */
import type { Topic } from "./lessons";

export const ONBOARD_COPY = {
  /** The region's accessible name and the small badge that names the current topic. */
  regionLabel: "Yard lessons",
  badgePrefix: "Lesson",
  /** Control faces. Distinct verbs so they never collide with the dock's pinned faces. */
  skip: "Skip lessons",
  skipAria: "Skip lessons and hide the yard coach",
  show: "Show lessons",
  showAria: "Show the yard lessons again",
  detailSummary: "Why this matters",
  glossaryTitle: "Words the yard uses",
  /** The lead teaching line under the goal. */
  whyLabel: "Why",
  nextLabel: "Next",
  /** Reachable recovery from the place-mode earn trap (issue #41): one tap earns. */
  earnTitle: "Short on materials",
  earnSalvage: "Earn scrap now",
  earnSalvageAria: "Earn scrap now by salvaging the wreck",
  earnStore: "Trade at the store",
  earnStoreAria: "Trade at the store to earn credits and free room",
  earnHint: "Salvage the wreck for scrap, or sell stock at the store, then build again.",
  /** Fresh-yard research guidance (finding 6821970539). The gate is never weakened. */
  researchGoal: "Earn your first Data to unlock Research.",
  researchWhy:
    "Research stays locked until the yard holds Data. The assembly chain turns scrap into circuits, and the Signal lab reads circuits into Data.",
  researchNext: (machine: string): string => `Build the ${machine} to move one step closer to Data.`,
  researchWaiting:
    "The Signal lab is reading circuits into Data. Once the first Data lands, Research opens in the dock.",
  researchChainTitle: "The path to first Data",
  researchUnlocked: "Research is open. Spend Data on a node to strengthen the whole yard.",
} as const;

/** One badge word per topic, in the player's vocabulary. */
export const TOPIC_LABELS: Readonly<Record<Topic, string>> = {
  salvage: "Salvage",
  build: "Build",
  connect: "Connect",
  storage: "Storage",
  trade: "Trade",
  upgrade: "Upgrades",
  research: "Research",
};

/**
 * The teaching reason for each early tutorial step (0..8). These complement the objective
 * card's goal sentence with the "why", so a fresh player learns the purpose of each tap
 * rather than only the verb. Numbers stay in the content tables; these are reasons only.
 */
export const STEP_WHY: Readonly<Record<number, string>> = {
  0: "Scrap is the raw material everything is built from. Salvaging the wreck is how a fresh yard earns its first scrap.",
  1: "The recovery drone needs a full load of scrap before it can fly. Keep salvaging to fill the repair.",
  2: "A flying drone delivers scrap to the Store automatically, so the yard keeps earning even while you build.",
  3: "The Store holds everything you earn. Watch the drone deliver scrap into it before you build the first machine.",
  4: "The Scrap sorter splits scrap into ferrous and nonferrous metal — the two branches every later machine builds on.",
  5: "Routes (belt links) move material between machines and the Store automatically. A connected yard runs itself.",
  6: "The Furnace smelts ferrous metal into steel. Steel is the first material worth real credits at the Store.",
  7: "Selling steel earns credits. Credits buy upgrades and, once you hold Data, research.",
  8: "An upgrade shortens every batch a machine runs, so the whole yard produces more from the same scrap.",
};

/** The teaching reason per topic once the tutorial is complete and the yard ladder leads. */
export const TOPIC_WHY: Readonly<Record<Topic, string>> = {
  salvage: "Salvaging the wreck and flying more drones raises what the yard earns each tick.",
  build: "Each new machine opens the next material in the chain. Build the one the yard is short of.",
  connect: "A machine only flows when its routes are laid. Connect links the producer, the machine and the Store.",
  storage: "The Store is shared by every machine. When it fills, production stalls — sell or reclaim room.",
  trade: "Selling surplus material earns credits without slowing the yard. Keep a reserve so machines stay fed.",
  upgrade: "Upgrades spend credits to shorten batches. Strengthen the stage that is actually the limit.",
  research: "Research spends Data on permanent yard-wide bonuses. Data comes from the Signal lab.",
};

/** The concrete next-action hint per early step, phrased as a reachable tap. */
export const STEP_NEXT: Readonly<Record<number, string>> = {
  0: "Tap the wreck to salvage.",
  1: "Keep tapping the wreck until the repair is full.",
  2: "Use Repair drone in the dock.",
  3: "Wait for the first delivery, then open Build.",
  4: "Open Build and place the Scrap sorter on a free cell.",
  5: "Use Connect to lay the offered routes.",
  6: "Build the Furnace and connect it.",
  7: "Open the Store and sell the steel contract.",
  8: "Select a machine and use Upgrade.",
};

/**
 * The shared player vocabulary, surfaced in the expandable detail. One meaning per term,
 * matching the chips, the catalog and the inspector. Plain words, never key shapes.
 */
export const GLOSSARY: readonly { readonly term: string; readonly meaning: string }[] = [
  { term: "Scrap", meaning: "Raw material salvaged from the wreck; the base of every build." },
  { term: "Ferrous", meaning: "Magnetic metal split from scrap; smelted into steel." },
  { term: "Nonferrous", meaning: "Non-magnetic metal split from scrap; source of copper and residue." },
  { term: "Steel", meaning: "Smelted ferrous metal; the first material worth real credits." },
  { term: "Circuits", meaning: "Wire and polymer combined; the Signal lab reads them into Data." },
  { term: "Data", meaning: "Produced by the Signal lab; unlocks and pays for Research." },
  { term: "Credits", meaning: "Earned by selling material; buys upgrades and drones." },
  { term: "Store", meaning: "The shared yard inventory every machine draws from and fills." },
  { term: "Route", meaning: "A belt link that moves one material between two endpoints." },
  { term: "Drone", meaning: "The flying recovery craft that delivers scrap to the Store." },
  { term: "Upgrade", meaning: "A paid level that shortens a machine's batches." },
  { term: "Research", meaning: "Permanent yard-wide bonuses bought with Data." },
];