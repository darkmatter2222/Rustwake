import { BLUEPRINTS, RESOURCES, TUNING, type ResourceId } from "../game/content/defs";
import { RESEARCH } from "../game/content/research";
import {
  DOCK_TILE,
  YARD_TILES,
  droneAddCost,
  upgradeCost,
  branchPrice,
} from "../game/simulation/commands";
import { SELL_ORDER, nextYardStep, sellValue, stepForMachine, type YardStep } from "../game/simulation/plan";
import type { ImportResult } from "../game/persistence/save";
import type { SimState, UpgradeBranch } from "../game/simulation/types";
import {
  HINT_KEYS,
  IMPORT_KEYS,
  OBJECTIVE_KEYS,
  REJECT_KEYS,
  STATUS_KEYS,
  STRINGS,
  formatDuration,
  formatNumber,
  plural,
  resourceName,
  resourceWord,
  t,
  unit,
  wholePercent,
} from "../game/content/strings";

/**
 * Sentence assembly for the player-facing surfaces (spec 23.3).
 *
 * Every literal lives in `STRINGS` (src/game/content/strings.ts) with its English
 * default; this module only decides which key the current state answers and fills its
 * named slots from the content tables, so no wording exists twice. The formatters are
 * re-exported from that module, which is the single place quantity, time, and plural
 * rules are defined.
 */

export { formatDuration, formatNumber };

/** Default lines of the tutorial objective card, in state order (spec 4.2). */
export const OBJECTIVES: readonly string[] = OBJECTIVE_KEYS.map((key) => STRINGS[key] ?? key);

/** Small line under the objective, keyed by the ids `suggestedAction()` returns. */
export const HINT_LABELS: Record<string, string> = Object.fromEntries(
  HINT_KEYS.map((key) => [key, STRINGS[key] ?? key]),
);

export const RESOURCE_LABEL: Record<string, string> = Object.fromEntries(
  RESOURCES.map((id) => [id, resourceName(id)]),
);

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_KEYS.map((id) => [id, t(`status.${id}`)]),
);

/** One shared table, so no surface can show a different reason text. */
export const REJECT_TEXT: Record<string, string> = Object.fromEntries(
  REJECT_KEYS.map((id) => [id, t(`reject.${id}`)]),
);

/** One bounded explanation per import failure (spec 22.2, spec 25.3 case 8). */
export const IMPORT_TEXT: Record<string, string> = Object.fromEntries(
  IMPORT_KEYS.map((id) => [id, t(`import.${id}`)]),
);

/** The one-line note the Yard panel shows after an import attempt. */
export function importNoteFor(result: ImportResult): string {
  if (result.ok) {
    return t("import.applied", { tick: result.tick, machines: result.machines });
  }
  const base = IMPORT_TEXT[result.reason] ?? t("import.notApplied");
  // The invariant name is developer-facing but short and useful when a file was
  // hand-edited; it never replaces the plain-language reason.
  return result.detail ? `${base} (${result.detail})` : base;
}

/** Short concrete verbs first (spec 4.4). Keys keep later translation cheap. */
export function objectiveFor(state: SimState, selected?: number | null): string {
  rememberSpoken(state);
  if (state.tutorial >= 8) return describeStep(state, stepFor(state, selected));
  const index = Math.min(state.tutorial, OBJECTIVE_KEYS.length - 1);
  return t(OBJECTIVE_KEYS[index], tutorialParams(state));
}

/** Every slot the tutorial lines can ask for, read from the content tables. */
function tutorialParams(state: SimState): Record<string, number | string> {
  return {
    pulses: state.wreck.pulses,
    needed: Math.ceil(TUNING.repairCostScrap / TUNING.manualSalvagePerPulse),
    repairCost: TUNING.repairCostScrap,
    sorterCost: costSummary(BLUEPRINTS.sorter),
    qty: TUNING.exportContractSteel,
    credits: TUNING.exportContractCredits,
    label: resourceWord("steel"),
  };
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
      return t("step.connect", { machine: machineLabel(state, step.machineId) });
    case "build": {
      const def = BLUEPRINTS[step.blueprint];
      return t("step.build", { machine: def.label, cost: costSummary(def) });
    }
    case "sell":
      return t("step.sell", {
        qty: step.qty,
        label: RESOURCE_LABEL[step.resource],
        credits: unit(sellValue(step.resource, step.qty), CREDIT),
      });
    case "research": {
      const def = RESEARCH[step.node];
      // The node's effect lives in the research panel beside its button; the card keeps
      // one line so the objective never costs a third text row on a short screen (B-26).
      return def
        ? t("step.research", { node: def.label, cost: t("value.dataCost", { cost: def.cost }) })
        : t("step.researchAny");
    }
    case "drone":
      return t("step.drone", { cost: unit(droneAddCost(state), CREDIT) });
    case "upgrade": {
      const machine = state.machines.find((m) => m.id === step.machineId);
      const def = machine ? BLUEPRINTS[machine.blueprint] : undefined;
      if (!machine || !def) return t("step.upgrade", { machine: MACHINE });
      // The fork: one price, three named outcomes, so the card names the choice and the
      // dock answers it with three one-tap targets (STRAT-002/A1-3).
      return t("step.fork", {
        machine: def.label,
        cost: unit(upgradeCost(def.baseUpgradeCost, machine.level), CREDIT),
      });
    }
    default:
      return t("card.tap-wreck");
  }
}

/** Dock label and cost line for the same step, so both agree. */
export function primaryFor(state: SimState, step: YardStep): { label: string; cost?: string } {
  rememberSpoken(state);
  switch (step.kind) {
    case "connect":
      return { label: t("btn.connect") };
    case "build": {
      const def = BLUEPRINTS[step.blueprint];
      return { label: t("btn.buildNamed", { machine: def.label }), cost: costSummary(def) };
    }
    case "sell":
      return {
        label: t("btn.sellNamed", { qty: step.qty, label: RESOURCE_LABEL[step.resource] }),
        cost: `+${unit(sellValue(step.resource, step.qty), CREDIT)}`,
      };
    case "research": {
      const def = RESEARCH[step.node];
      if (!def) return { label: t("btn.research") };
      return {
        label: t("btn.researchNamed", { node: def.label }),
        cost: t("value.dataCost", { cost: def.cost }),
      };
    }
    case "drone":
      return {
        label: t("btn.addDrone"),
        cost: unit(droneAddCost(state), CREDIT),
      };
    case "upgrade": {
      const machine = state.machines.find((m) => m.id === step.machineId);
      const def = machine ? BLUEPRINTS[machine.blueprint] : undefined;
      if (!machine || !def) return { label: BTN_UPGRADE };
      // The card above names the machine ("Upgrade the Scrap sorter."), so the button
      // carries the verb and the price only. Measured reason: at text scale 2.0 the
      // four-word label made the dock row 145 px tall, 21 % of a 360 × 640 viewport.
      return {
        label: BTN_UPGRADE,
        cost: unit(upgradeCost(def.baseUpgradeCost, machine.level), CREDIT),
      };
    }
    default:
      return { label: t("btn.salvage") };
  }
}

/**
 * The two named outcomes one paid level can buy, each at its own price, in dock
 * order (STRAT-002/A1-3, re-priced by STRAT-003). One tap on any of them commits
 * that branch: no second confirming tap, so the fork costs one tap per choice like
 * every other step. The two faces print different numbers on purpose: the speed
 * plan costs the plain ladder plus its 10-credit throughput premium, the draw plan
 * keeps the plain price (`branchPrice`, documented derivation in `commands.ts`), so
 * the row shows what each named quantity is worth against the other.
 *
 * PLAY-002 1: `buffer` is not offered. The A1-2v3 run (work/development/handoffs/
 * STRAT-002-g3.md) has it owning no column under either gap ladder - its
 * `inputStallPct` is the *largest* on both (186.9 / 181.5 against 115.5 / 123.3), so
 * the drop clause in `work/product/STRAT-002-decision-g2.md` executes and the dock
 * ships two plans. The decoder in `simulation/types.ts` still reads a saved
 * `"buffer"` pick, so a save written while the name was on the dock keeps loading.
 *
 * BLD-001: the row is painted **cheapest-first** (see the sort below), so the leftmost
 * face is always a plan the current purse can pay whenever one is affordable.
 */
export function branchOptions(
  state: SimState,
  machineId: number
): { id: UpgradeBranch; label: string; cost: string }[] {
  const machine = state.machines.find((m) => m.id === machineId);
  const def = machine ? BLUEPRINTS[machine.blueprint] : undefined;
  if (!machine || !def) return [];
  const plans = [
    {
      id: "speed" as const,
      label: t("btn.branchSpeed"),
      price: branchPrice(def.baseUpgradeCost, machine.level, "speed"),
    },
    {
      id: "draw" as const,
      label: t("btn.branchDraw"),
      price: branchPrice(def.baseUpgradeCost, machine.level, "draw"),
    },
  ];
  // BLD-001: one lever, the paint order. The plans come out ordered by their own price
  // ascending, so a blind leftmost tap lands on an affordable plan first whenever the purse
  // covers one (QA note 6: at 30 credits the old row parked 31 leftmost taps at 0 commands,
  // because the dearer 40-credit face was leftmost). `Array#sort` is stable since ES2019,
  // so equal prices keep the declared order. Prices, ids and the `branch` each option
  // commits are untouched, and each face still prints the very number `branchPrice` returns.
  return plans
    .slice()
    .sort((a, b) => a.price - b.price)
    .map((plan) => ({
      id: plan.id,
      label: plan.label,
      cost: unit(plan.price, CREDIT),
    }));
}

/**
 * First unoccupied yard cell, so a new machine or a move never lands on the dock tile or
 * on a neighbour that is already taken. The same ladder `App.firstFreeTile` answers with;
 * the panel needs it too, and `Panels.tsx` cannot import from `App.tsx` (the dependency
 * runs the other way), so the rule lives in this sentence layer both of them read (UI-002).
 */
export function nextFreeTile(state: SimState): number {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!state.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
}

/**
 * The shared power budget as one resting-screen line, e.g. `Power 8 · 9 requested ·
 * 62 %` (STRAT-002/A1-4). Capacity is the yard's own, `requested` is what the running
 * batches ask for, and the ratio is the one the engine paid out this tick, so the
 * three figures always tell one story.
 */
export function powerLine(state: SimState): string {
  let requested = 0;
  for (const m of state.machines) if (m.progress > 0) requested += m.batchPower;
  return t("hud.power", {
    capacity: TUNING.yardPowerCapacity,
    requested,
    percent: wholePercent(state.powerRatio),
  });
}

/**
 * The resting state in one line (PLAY-001 P-2): how many drones are actually flying, then
 * the shared power budget. It has no `progress > 0` gate anywhere behind it, so the yard
 * answers "what is running" from the first tick, with no machine placed yet. The drone
 * count is the flying fleet - the starter once repaired, plus every spare bought.
 *
 * PLAY-002 2 (TST-001): the last blocked reject rides along as a trailing segment of this
 * same line, so the shortfall outlives the 1.8 s toast. `detail` is the string the toast
 * printed - the same `labelForReject` call, the same `need`/`have`/`word` fields - so the
 * two surfaces cannot state different numbers, and no second sentence table is needed.
 */
export function restingLine(state: SimState, lastReject?: string | null): string {
  rememberSpoken(state);
  const flying = (state.drone.repaired ? 1 : 0) + state.spares.length;
  const base = `${t("hud.drones", { count: flying })}${DOT}${powerLine(state)}`;
  if (!lastReject) return base;
  // The one difference from the toast: the sentence continues this line, so its first
  // letter goes lowercase. Both figures still come from the rejected result itself.
  const detail = `${lastReject.charAt(0).toLowerCase()}${lastReject.slice(1)}`;
  return `${base}${DOT}${t("hud.lastShortfall", { detail })}`;
}

/* ------------------------------------------------------------------------- *
 * STRAT-004 — the pressed face names its own pending number and its countdown
 * ------------------------------------------------------------------------- */

/** The sim object the sentence layer last answered from, for the dock's own readout. */
let spoken: SimState | null = null;

function rememberSpoken(state: SimState): void {
  spoken = state;
}

/** The separators and units the HUD sentences use most, read once each (STRAT-004 byte trim:
 *  one lookup per repeated fragment instead of one call per printed line, 12 call sites). */
const DOT = t("value.dotSeparator");
const CREDIT = t("unit.credit");
const MACHINE = t("unit.machine");
const BTN_UPGRADE = t("btn.upgrade");

/**
 * The face's own line for one short quantity: `waits 5 ferrous · have 3`, and while a
 * batch is mid-flight the whole seconds left on the nearest running one (`· in 2s`).
 * The countdown is a read, not a second clock: `batchMilli` counts milli-ticks, 1000 of
 * those is one tick, ten ticks is one second (hence `1e4`), so at the measured 1 tap/s
 * cadence the digit steps down once per tap - the wait becomes countable on the face
 * instead of looking like a tap that never registered.
 */
function faceWaitLine(need: number, word: string, have: number, state: SimState): string {
  const running = state.machines.find((m) => m.progress > 0);
  const secs = running ? Math.ceil((running.batchMilli - running.progress) / 1e4) : 0;
  return `waits ${formatNumber(need)} ${word}${DOT}have ${formatNumber(have)}${secs ? `${DOT}in ${secs}s` : ""}`;
}

/**
 * The number the yard is still waiting for on one step, in the face's own short form:
 * `waits 5 ferrous · have 3`. Both figures are read, never computed twice: `need` is the
 * quantity the content table asks the step for, `have` is the same store or purse entry
 * the Store panel and the `Last need …` tail print. Null when the step's price is already
 * covered (or the step carries no price), so a covered face stays two lines tall. The W-3
 * witnesses (`face-line-check.mjs`, `frame-probe.mjs`) read this as the second derivation;
 * it is dead in the shipped graph, where `priceLine` is the only caller-side entry point.
 */
export function pendingForStep(state: SimState, step: YardStep): string | null {
  rememberSpoken(state);
  const short = shortfallForStep(state, step);
  return short === null ? null : faceWaitLine(short.need, short.word, short.have, state);
}

/**
 * The engine's own two numbers for one step, same shapes as `shortOf`/`shortCredits`.
 */
function shortfallForStep(
  state: SimState,
  step: YardStep
): { need: number; have: number; word: string } | null {
  switch (step.kind) {
    case "build": {
      const def = BLUEPRINTS[step.blueprint];
      if (!def) return null;
      for (const item of def.buildCost) {
        const have = state.store[item.resource] ?? 0;
        if (have < item.qty) {
          return { need: item.qty, have, word: resourceWord(item.resource) };
        }
      }
      return null;
    }
    case "research": {
      const def = RESEARCH[step.node];
      const have = state.store.data ?? 0;
      if (!def || have >= def.cost) return null;
      return { need: def.cost, have, word: resourceWord("data") };
    }
    case "drone":
    case "upgrade": {
      const need = step.kind === "drone" ? droneAddCost(state) : upgradePrice(state, step.machineId);
      return state.credits < need ? { need, have: state.credits, word: plural(need, CREDIT) } : null;
    }
    default:
      return null;
  }
}

/** What the next level of one machine costs, or 0 when the machine is gone. */
function upgradePrice(state: SimState, machineId: number): number {
  const machine = state.machines.find((m) => m.id === machineId);
  const def = machine ? BLUEPRINTS[machine.blueprint] : undefined;
  return machine && def ? upgradeCost(def.baseUpgradeCost, machine.level) : 0;
}

/**
 * The whole price line one face paints (STRAT-004): its own plain price, then the first
 * item that price is still short of and what the yard holds (`· waits 5 ferrous · have 3`),
 * then the batch countdown. One call per face, so both dock phases say the same thing, and
 * the pending number always names the quantity the player can see on that face: the entry
 * it is compared against is read straight off the state, the same `state.store` entry (or
 * purse) the Store panel and the `Last need …` tail print. A `+N …` gain (a sale) is not a
 * price and never blocks, and a covered price keeps its plain lines.
 */
export function priceLine(cost: string, state: SimState | null = spoken): string {
  if (!state) return cost;
  for (const group of cost.split(" + ")) {
    // `"{qty} {label} · {credits} credits"` carries its own reward after the dot: the
    // price is what comes before it. A `+N …` gain (a sale) fails the shape and blocks.
    const parts = /^([\d.]+) ([a-z]+)$/.exec(group.split(DOT)[0].trim());
    if (!parts) continue;
    const need = +parts[1];
    const word = parts[2];
    // Every `res.*` entry is the store id with a leading capital, so the printed word is
    // the store key; `credit` is the purse, which is not a store entry.
    const have = word.startsWith("credit") ? state.credits : state.store[word as ResourceId] ?? 0;
    if (have < need) {
      return `${cost}${DOT}${faceWaitLine(need, word, have, state)}`;
    }
  }
  return cost;
}

/**
 * What the rows of five pips under each machine count (PLAY-001 P-4). The renderer paints
 * the current batch in fifths - never a level, a buffer or a power share - so the line
 * names that quantity and prints the same count of lit pips the tile shows: `4/5` is the
 * row with four marks lit, and the machine panel's `Batch` row prints that same
 * completion as a percent.
 *
 * PLAY-002 3 (CHRM-001): at most **two** machines are named, then a `+n` tail for the rest
 * (QA D-2: three entries cost three wrapped line boxes at 360 × 640 text scale 2.0 and put
 * the card past its band), and each entry carries the tile index the renderer draws it on,
 * so two machines of one blueprint read apart - `Scrap sorter #8 3/5 · Scrap sorter #9 1/5`
 * where the bare labels repeated (QA D-4). The tile number is the same one the build phase
 * prints in `phase.ghost`, so the legend and the ghost name one cell the same way.
 */
export function pipLine(state: SimState): string {
  const named = state.machines.slice(0, 2).map((m) => {
    const ratio = m.batchMilli === 0 ? 0 : Math.min(1, m.progress / m.batchMilli);
    const lit = ratio > 0 ? Math.max(1, Math.ceil(ratio * 5)) : 0;
    return `${BLUEPRINTS[m.blueprint].label} #${m.tile} ${lit}/5`;
  });
  const rest = state.machines.length - named.length;
  return t("hud.pips", {
    what: t("row.batch"),
    detail: named.join(DOT) + (rest > 0 ? ` +${rest}` : ""),
  });
}

function machineLabel(state: SimState, machineId: number): string {
  const machine = state.machines.find((m) => m.id === machineId);
  return machine ? BLUEPRINTS[machine.blueprint].label : MACHINE;
}

/**
 * Bulk resources shown in the HUD, revealed as they become meaningful (spec 5.4).
 * `max` is the entry count this layout can afford, which hudChipLimit() derives from
 * the viewport width so the chip block stays two rows tall on a narrow phone.
 */
export function visibleResources(state: SimState, max = 5): ResourceId[] {
  rememberSpoken(state);
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

/** Compact build cost in sentence case: "20 scrap + 5 ferrous". */
export function costSummary(def: {
  buildCost: readonly { resource: ResourceId; qty: number }[];
}): string {
  return def.buildCost
    .map((item) => t("value.recipeItem", { qty: item.qty, label: resourceWord(item.resource) }))
    .join(" + ");
}

/** Plain-language sub-hints shown under the objective line (spec 4.4). */
export function hintFor(key: string): string {
  return STRINGS[key] === undefined ? "" : t(key);
}
