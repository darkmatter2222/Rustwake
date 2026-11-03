/**
 * Content and behaviour validation for the shipped tables (spec 23.2, 23.5, 25.2).
 *
 * The point of these checks is that a broken reference fails the build instead of the
 * playtest: a recipe id that does not exist, a footprint with no room for its own batch,
 * a zero-time cycle, a material two recipes both produce, or a build cost whose material
 * no unlocked machine makes. `validateContent` is pure data and runs in a few
 * milliseconds; `validateBehaviour` runs the real ladder from a fresh tutorial state and
 * checks the yard actually reaches every stage and keeps a balanced ledger.
 *
 * Both return the list of violations, so `scripts/validate-content.mjs` can print them
 * and `npm test` can assert the list is empty from the same implementation.
 */
import {
  BLUEPRINTS,
  EXPORT_PRICES,
  RECIPES,
  RESOURCES,
  TUNING,
  unlockedBlueprints,
  type ResourceId,
} from "./defs";
import { RESEARCH, RESEARCH_ORDER } from "./research";
import {
  CHIP_KEYS,
  HINT_KEYS,
  IMPORT_KEYS,
  OBJECTIVE_KEYS,
  REJECT_KEYS,
  STATUS_KEYS,
  STRINGS,
  t,
  unit,
} from "./strings";
import { applyCommand, upgradeCost, DOCK_TILE, YARD_TILES, type Command, type CommandBody } from "../simulation/commands";
import { advance } from "../simulation/engine";
import { systemTotals, allQuantities } from "../simulation/invariants";
import { nextYardStep, SELL_ORDER, type YardStep } from "../simulation/plan";
import { planConnections } from "../simulation/autoconnect";
import { createInitialState, fleetUnits, type SimState } from "../simulation/types";
import {
  HINT_LABELS,
  IMPORT_TEXT,
  OBJECTIVES,
  REJECT_TEXT,
  RESOURCE_LABEL,
  STATUS_LABEL,
  describeStep,
  primaryFor,
} from "../../ui/text";

/** Resources without an export price, deliberately (spec 8.1: an item, not a bulk good). */
const UNPRICED: readonly ResourceId[] = ["chassis"];

/**
 * Codes the engine and the persistence layer can answer with. These are the same lists
 * the string table is keyed by, so a code without a sentence is one violation, not two.
 */
const MACHINE_STATUSES = STATUS_KEYS;
const REJECTS = REJECT_KEYS;
const DECODE_REASONS = IMPORT_KEYS;

/** The bottleneck names `catchUp` can report (spec 18.3). */
const BOTTLENECKS = ["storage-full", "power-limited", "starved"] as const;

/** Positive whole numbers only; 0 is not a quantity in this economy. */
function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Pure-data checks over the typed content tables.
 * @returns one line per violated invariant, empty when the content is sound.
 */
export function validateContent(): string[] {
  const bad: string[] = [];
  const say = (message: string) => bad.push(message);

  // 1. Resource table: no duplicate ids, and a label for each.
  const seen = new Set<string>();
  for (const resource of RESOURCES) {
    if (seen.has(resource)) say(`resource listed twice: ${resource}`);
    seen.add(resource);
    if (!RESOURCE_LABEL[resource]) say(`resource without a label: ${resource}`);
  }

  // 2. Recipe shape, and every referenced id exists.
  for (const recipe of Object.values(RECIPES)) {
    if (!recipe.id) say("recipe without an id");
    if (recipe.inputs.length === 0 || recipe.inputs.length > 4)
      say(`recipe ${recipe.id} has ${recipe.inputs.length} inputs (want 1..4)`);
    if (recipe.outputs.length === 0 || recipe.outputs.length > 2)
      say(`recipe ${recipe.id} has ${recipe.outputs.length} outputs (want 1..2)`);
    for (const item of [...recipe.inputs, ...recipe.outputs]) {
      if (!seen.has(item.resource)) say(`recipe ${recipe.id} names an unknown resource ${item.resource}`);
      if (!isCount(item.qty)) say(`recipe ${recipe.id} has a non-integer or zero quantity for ${item.resource}`);
    }
    // A zero-time cycle is the classic runaway (spec 25.2).
    if (!isCount(recipe.cycleTicks)) say(`recipe ${recipe.id} has a zero or fractional cycle`);
    if (!isCount(recipe.power)) say(`recipe ${recipe.id} has no power draw`);
    if (recipe.cycleTicks % 1 !== 0) say(`recipe ${recipe.id} cycle is not a whole tick`);
  }

  // 3. Blueprint shape: existing recipe, sane footprint, buffers that fit their batch.
  const recipeUsers = new Map<string, string>();
  for (const def of Object.values(BLUEPRINTS)) {
    const recipe = RECIPES[def.recipeId];
    if (!recipe) {
      say(`blueprint ${def.id} references a missing recipe ${def.recipeId}`);
    } else {
      if (recipeUsers.has(def.recipeId))
        say(`recipe ${def.recipeId} is claimed by ${recipeUsers.get(def.recipeId)} and ${def.id}`);
      recipeUsers.set(def.recipeId, def.id);
      const maxInput = Math.max(...recipe.inputs.map((item) => item.qty));
      const maxOutput = Math.max(...recipe.outputs.map((item) => item.qty));
      if (def.inputBuffer < maxInput)
        say(`${def.id} cannot hold one batch of its own recipe (${def.inputBuffer} < ${maxInput})`);
      if (def.outputBuffer < maxOutput)
        say(`${def.id} cannot hold one output batch (${def.outputBuffer} < ${maxOutput})`);
    }
    if (!def.label) say(`blueprint ${def.id} has no label`);
    const [w, h] = def.footprint;
    if (!isCount(w) || !isCount(h)) say(`${def.id} has a non-positive footprint`);
    // One cell is the dock, so no machine may cover the whole grid (spec 9.2).
    if (w * h > YARD_TILES - 1 || w * h > 4) say(`${def.id} footprint ${w}x${h} does not fit the yard`);
    if (!isCount(def.inputBuffer) || !isCount(def.outputBuffer)) say(`${def.id} has an empty buffer`);
    if (!isCount(def.baseUpgradeCost)) say(`${def.id} has no upgrade price`);
    if (!isCount(def.unlockAt) || def.unlockAt < 4 || def.unlockAt > OBJECTIVES.length - 1)
      say(`${def.id} unlocks at step ${def.unlockAt}, outside the tutorial's 4..${OBJECTIVES.length - 1}`);
    for (const item of def.buildCost) {
      if (!seen.has(item.resource)) say(`${def.id} is priced in an unknown resource ${item.resource}`);
      if (!isCount(item.qty)) say(`${def.id} has a zero or fractional price entry for ${item.resource}`);
    }
  }

  // 4. One producer per material, and scrap comes only from the wreck (spec 7.2, D-17).
  const producers = new Map<ResourceId, string[]>();
  for (const recipe of Object.values(RECIPES)) {
    for (const output of recipe.outputs) {
      const list = producers.get(output.resource) ?? [];
      list.push(recipe.id);
      producers.set(output.resource, list);
    }
  }
  for (const [resource, list] of producers) {
    if (list.length > 1) say(`${resource} is produced by ${list.join(" and ")} (want one producer)`);
  }
  if (producers.has("scrap")) say("scrap has a recipe producer, but the wreck is its only source");

  // 5. The material graph is acyclic, so no zero-time loop can form (spec 10.3).
  const edges = new Map<string, string[]>();
  for (const recipe of Object.values(RECIPES)) {
    const to: string[] = [];
    for (const input of recipe.inputs) {
      for (const producer of producers.get(input.resource) ?? []) if (producer !== recipe.id) to.push(producer);
    }
    edges.set(recipe.id, to);
  }
  const state = new Map<string, "open" | "done">();
  const visit = (id: string, path: string[]): boolean => {
    const mark = state.get(id);
    if (mark === "done") return true;
    if (mark === "open") {
      say(`material cycle: ${[...path, id].join(" -> ")}`);
      return false;
    }
    state.set(id, "open");
    for (const next of edges.get(id) ?? []) if (!visit(next, [...path, id])) return false;
    state.set(id, "done");
    return true;
  };
  for (const id of edges.keys()) visit(id, []);

  // 6. Export prices exist, are positive, and the unpriced set is explicit.
  for (const [resource, price] of Object.entries(EXPORT_PRICES)) {
    if (!seen.has(resource as ResourceId)) say(`export price for an unknown resource ${resource}`);
    if (!isCount(price)) say(`export price for ${resource} is not a positive integer`);
    if (!RESOURCE_LABEL[resource as ResourceId]) say(`priced resource ${resource} has no label`);
  }
  for (const resource of RESOURCES) {
    if (EXPORT_PRICES[resource] === undefined && !UNPRICED.includes(resource))
      say(`resource ${resource} has no export price and is not in the unpriced list`);
  }

  // 7. Every build cost is payable from materials an earlier-or-equal step produces.
  const available = new Set<ResourceId>(["scrap"]);
  const byUnlock = Object.values(BLUEPRINTS).sort((a, b) => a.unlockAt - b.unlockAt);
  for (const def of byUnlock) {
    for (const item of def.buildCost) {
      if (available.has(item.resource)) continue;
      const make = Object.values(RECIPES).find((recipe) =>
        recipe.outputs.some((output) => output.resource === item.resource)
      );
      const maker = make ? recipeUsers.get(make.id) : undefined;
      say(
        `${def.id} (step ${def.unlockAt}) costs ${item.resource}, which ${
          maker ? `${maker} at step ${BLUEPRINTS[maker].unlockAt}` : "no unlocked machine"
        } provides`
      );
    }
    const recipe = RECIPES[def.recipeId];
    if (recipe) for (const output of recipe.outputs) available.add(output.resource);
  }
  const lastStep = OBJECTIVES.length - 1;
  if (unlockedBlueprints(lastStep).length !== Object.keys(BLUEPRINTS).length)
    say(`the tutorial ends with ${unlockedBlueprints(lastStep).length} of ${Object.keys(BLUEPRINTS).length} blueprints`);

  // 8. Research branch: one entry each, existing prerequisites, rising costs, visible effect.
  const order = [...RESEARCH_ORDER];
  if (order.length !== Object.keys(RESEARCH).length)
    say(`RESEARCH_ORDER lists ${order.length} ids for ${Object.keys(RESEARCH).length} nodes`);
  let previousCost = 0;
  for (const id of order) {
    const def = RESEARCH[id];
    if (!def) {
      say(`RESEARCH_ORDER names a missing node ${id}`);
      continue;
    }
    if (order.indexOf(id) !== order.lastIndexOf(id)) say(`research node ${id} is listed twice`);
    if (!def.label || !def.effect) say(`research node ${id} has no label or effect text`);
    if (!isCount(def.cost) || def.cost <= previousCost)
      say(`research node ${id} costs ${def.cost}, which does not rise above the previous node`);
    if (!isCount(def.maxRank)) say(`research node ${id} cannot be purchased`);
    if (def.requires) {
      const at = order.indexOf(def.requires);
      if (at < 0) say(`research node ${id} requires a missing node ${def.requires}`);
      else if (at >= order.indexOf(id)) say(`research node ${id} requires ${def.requires} later in the branch`);
    }
    previousCost = def.cost;
  }

  // 9. Every state, rejection, import reason, objective, and hint has player text.
  for (const status of MACHINE_STATUSES)
    if (!STATUS_LABEL[status]) say(`machine status ${status} has no label`);
  for (const code of REJECTS) if (!REJECT_TEXT[code]) say(`reject code ${code} has no explanation`);
  for (const reason of DECODE_REASONS) if (!IMPORT_TEXT[reason]) say(`import reason ${reason} has no explanation`);
  if (OBJECTIVES.length !== 10) say(`the tutorial has ${OBJECTIVES.length} objectives, want 10`);
  OBJECTIVES.forEach((line, index) => {
    if (!line || line.length === 0) say(`objective ${index} is empty`);
  });
  for (const [key, value] of Object.entries(HINT_LABELS)) if (!value) say(`hint ${key} is empty`);

  // 10. Tuning constants are whole and positive, and the derived ones still derive.
  for (const [key, value] of Object.entries(TUNING))
    if (!isCount(value)) say(`TUNING.${key} is ${String(value)}, want a positive integer`);
  if (TUNING.offlineCapTicks !== 432_000) say(`the offline cap is ${TUNING.offlineCapTicks} ticks, not 12 h`);
  if (TUNING.droneDeliveryTicks <= TUNING.droneTravelTicks)
    say("a delivery lands before the drone reaches the dock");
  if (TUNING.fleetCap < 2) say("the fleet cap leaves no room for a second drone");
  if (TUNING.dockCapacity < 15 * 60 * TUNING.droneScrapPerSecond)
    say(`dock capacity ${TUNING.dockCapacity} is below 15 minutes of starter output (spec 8.3)`);
  if (TUNING.reserveFloor > TUNING.dockCapacity / 10) say("the reserve floor is more than a tenth of the store");
  const maxPower = Math.max(...Object.values(RECIPES).map((recipe) => recipe.power));
  if (TUNING.yardPowerCapacity < maxPower) say(`the yard cannot power its largest machine (${maxPower} units)`);

  // 11. The upgrade curve is monotone and stays in the safe integer range (spec 8.6).
  for (const def of Object.values(BLUEPRINTS)) {
    let previous = 0;
    for (let level = 1; level <= 40; level += 1) {
      const cost = upgradeCost(def.baseUpgradeCost, level);
      if (!Number.isSafeInteger(cost) || cost <= previous) {
        say(`${def.id} upgrade price breaks at level ${level}`);
        break;
      }
      previous = cost;
    }
  }

  // 12. Every ladder step kind has a one-line description and a priced dock label.
  const probe = freshYard();
  const sorter = commit(probe, { type: "machine.build", blueprint: "sorter", tile: 0 });
  const plans = sorter ? planConnections(probe, 1) : [];
  const steps: YardStep[] = [
    { kind: "salvage" },
    { kind: "build", blueprint: "sorter" },
    ...(plans.length > 0 ? [{ kind: "connect" as const, machineId: 1, plans }] : []),
    { kind: "sell", resource: "scrap", qty: 1 },
    { kind: "research", node: "cutters" },
    { kind: "drone" },
    { kind: "upgrade", machineId: 1 },
  ];
  for (const step of steps) {
    const line = describeStep(probe, step);
    const primary = primaryFor(probe, step);
    if (!line) say(`step ${step.kind} has no objective line`);
    if (!primary.label) say(`step ${step.kind} has no dock label`);
    // An unfilled `{slot}` means the caller and the template disagree (spec 23.3).
    if (line.includes("{") || primary.label.includes("{"))
      say(`step ${step.kind} leaves an unfilled slot: ${line || primary.label}`);
    const priced =
      step.kind === "build" ||
      step.kind === "sell" ||
      step.kind === "research" ||
      step.kind === "drone" ||
      step.kind === "upgrade";
    if (priced && !primary.cost) say(`step ${step.kind} shows a price-free purchase`);
    if (priced && primary.cost && primary.cost.includes("{"))
      say(`step ${step.kind} phrases its price with an unfilled slot: ${primary.cost}`);
    if (line && (line.includes("undefined") || line.includes("NaN")))
      say(`step ${step.kind} phrases itself with a missing value: ${line}`);
  }
  if (plans.length === 0) say("a built sorter produced no connection to phrase (fixture drift)");

  // 13. The string table itself: defaults, well-formed slots, and one entry per code the
  // surfaces ask for (spec 23.3). A missing key would otherwise paint its own name.
  const keys = Object.keys(STRINGS);
  if (keys.length < 120) say(`the string table has ${keys.length} keys, want at least 120`);
  for (const key of keys) {
    const value = STRINGS[key];
    if (!value) say(`string key ${key} has no English default`);
    const slots = value.match(/\{[^{}]*\}/g) ?? [];
    if ((value.match(/\{/g) ?? []).length !== slots.length)
      say(`string ${key} has an unbalanced slot marker: ${value}`);
    for (const slot of slots)
      if (!/^\{\w+\}$/.test(slot)) say(`string ${key} declares the malformed slot ${slot}`);
    if (/\{\}/.test(value)) say(`string ${key} declares an empty slot`);
  }
  for (const key of OBJECTIVE_KEYS)
    if (STRINGS[key] === undefined) say(`the tutorial card asks for a missing key ${key}`);
  for (const key of HINT_KEYS)
    if (STRINGS[key] === undefined) say(`the sub-hint line asks for a missing key ${key}`);
  for (const key of CHIP_KEYS)
    if (STRINGS[key] === undefined) say(`the top row asks for a missing chip ${key}`);
  for (const id of RESOURCES)
    if (STRINGS[`res.${id}`] === undefined) say(`resource ${id} has no name in the table`);
  for (const status of MACHINE_STATUSES)
    if (STRINGS[`status.${status}`] === undefined)
      say(`machine status ${status} has no label in the table`);
  for (const code of REJECTS)
    if (STRINGS[`reject.${code}`] === undefined)
      say(`reject code ${code} has no explanation in the table`);
  for (const reason of DECODE_REASONS)
    if (STRINGS[`import.${reason}`] === undefined)
      say(`import reason ${reason} has no explanation in the table`);
  for (const kind of BOTTLENECKS)
    if (STRINGS[`bottleneck.${kind}`] === undefined)
      say(`return-report bottleneck ${kind} has no label`);
  // A second plural rule somewhere else is how "1 credits" survives review (spec 23.3).
  if (unit(1, t("unit.credit")) !== "1 credit" || unit(2, t("unit.credit")) !== "2 credits")
    say("the shared plural rule does not distinguish one from many");

  return bad;
}

/**
 * Runs the real ladder from a fresh tutorial state and checks the yard reaches every
 * stage inside the window, that the ledger balances, and that no quantity leaves the safe
 * integer range. This is the "unreachable tutorial goal" gate of spec 23.2.
 */
export function validateBehaviour(
  rounds = 1800
): { violations: string[]; marks: Record<string, number> } {
  const bad: string[] = [];
  const s = freshYard();
  const marks: Record<string, number> = {};
  const note = (key: string, round: number) => {
    if (marks[key] === undefined) marks[key] = round + 1;
  };
  for (let round = 0; round < rounds; round += 1) {
    if (!s.exportClaimed && (s.store["steel"] ?? 0) >= TUNING.exportContractSteel)
      commit(s, { type: "contract.export" });
    const step = nextYardStep(s);
    note(`step:${step.kind}`, round);
    switch (step.kind) {
      case "connect":
        for (const plan of step.plans)
          commit(s, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
        break;
      case "build":
        commit(s, { type: "machine.build", blueprint: step.blueprint, tile: firstFreeTile(s) });
        break;
      case "sell":
        commit(s, { type: "contract.sell", resource: step.resource, qty: step.qty });
        break;
      case "research":
        commit(s, { type: "research.buy", node: step.node });
        break;
      case "drone":
        commit(s, { type: "drone.add" });
        break;
      case "upgrade":
        commit(s, { type: "machine.upgrade", machineId: step.machineId });
        break;
      default:
        commit(s, { type: "manual.salvage" });
    }
    advance(s, 10);
    if (round % 200 === 0) {
      for (const [key, value] of Object.entries(systemTotals(s))) {
        if (!Number.isSafeInteger(value) || value < 0) bad.push(`ledger value ${key} = ${value} at round ${round}`);
      }
      for (const value of allQuantities(s)) {
        if (!Number.isSafeInteger(value) || value < 0) bad.push(`stored value ${value} at round ${round}`);
      }
      if (s.machines.length > YARD_TILES - 1) bad.push(`more machines than free cells at round ${round}`);
      for (const machine of s.machines) {
        const def = BLUEPRINTS[machine.blueprint];
        if (!def) {
          bad.push(`machine ${machine.id} runs a missing blueprint ${machine.blueprint}`);
          break;
        }
        if (machine.tile === DOCK_TILE) bad.push(`machine ${machine.id} sits on the dock at round ${round}`);
        if (machine.inBufUnits > def.inputBuffer + (s.research.buffers ?? 0) * 6 + 6)
          bad.push(`${machine.blueprint} input buffer overflows its capacity at round ${round}`);
      }
      if (fleetUnits(s).length > TUNING.fleetCap) bad.push(`the fleet passed its cap at round ${round}`);
    }
  }

  // Every stage the yard is supposed to reach, with the round it first appeared. The
  // `salvage` step is the empty-yard fallback and is phrased in the content checks, so the
  // list below is what a 1 800-round session must produce on its own.
  const want: string[] = ["step:build", "step:connect", "step:sell", "step:research", "step:drone"];
  for (const key of want)
    if (marks[key] === undefined) bad.push(`the ladder never produced ${key} in ${rounds} rounds`);
  const built = new Set(s.machines.map((machine) => machine.blueprint));
  for (const id of Object.keys(BLUEPRINTS))
    if (!built.has(id)) bad.push(`blueprint ${id} was never built in ${rounds} rounds`);
  for (const id of RESEARCH_ORDER)
    if (!(s.research[id] ?? 0)) bad.push(`research node ${id} was never bought in ${rounds} rounds`);
  if (fleetUnits(s).length < 2) bad.push(`the fleet stayed at ${fleetUnits(s).length} unit(s)`);
  if (!s.exportClaimed) bad.push("the onboarding export contract was never claimed");
  for (const resource of SELL_ORDER) {
    if (EXPORT_PRICES[resource] === undefined && (s.store[resource] ?? 0) > 0)
      bad.push(`${resource} is stocked but has no sell order entry`);
  }
  const firstOf = (key: string) => marks[key] ?? 0;
  return {
    violations: bad,
    marks: {
      ...marks,
      firstDrone: firstOf("step:drone"),
      firstResearch: firstOf("step:research"),
      tick: s.tick,
      machines: s.machines.length,
      links: s.routes.length,
      drones: fleetUnits(s).length,
      batches: s.machines.reduce((sum, machine) => sum + machine.batchesDone, 0),
      credits: s.credits,
      nodes: Object.keys(s.research).length,
    },
  };
}

/** Tutorial start with the six pulses and the repair already applied. */
function freshYard(): SimState {
  const s = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    commit(s, { type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
  commit(s, { type: "drone.repair" });
  advance(s, 262);
  return s;
}

let commandSeq = 0;
function commit(s: SimState, body: CommandBody): boolean {
  commandSeq += 1;
  const result = applyCommand(s, { ...body, id: `v${commandSeq}` } as Command);
  return result.ok === true;
}

/** Same rule the app uses: the first tile that is neither taken nor the dock. */
function firstFreeTile(s: SimState): number {
  const taken = new Set(s.machines.map((machine) => machine.tile));
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile === DOCK_TILE) continue;
    if (!taken.has(tile)) return tile;
  }
  return DOCK_TILE;
}
