/**
 * UI-RESET-55 (G2 wave 4): the upgrade comparison's read model. Every printed number
 * is derived from the authoritative sim state through the same exported helpers the
 * engine itself uses (`branchPrice`, `batchMilliOf`, `inputCapacityOf`, `powerOf`,
 * `upgradeRanks`), so a card cannot promise what the tap will not deliver. The
 * proposed values are computed on the exact machine shape `upgradeMachine` /
 * `respecMachine` write — one level deeper with one more named pick, or the last
 * named pick moved — including the legacy rule that unnamed levels count as speed.
 * Pure functions only: no React, no dispatch, no mutation.
 */
import { BLUEPRINTS } from "../../game/content/defs";
import { researchBonus } from "../../game/content/research";
import {
  branchPrice,
  upgradeComparison,
  type UpgradeComparison,
} from "../../game/simulation/commands";
import {
  BUFFER_RANK_UNITS,
  UPGRADE_BRANCHES,
  batchMilliOf,
  inputCapacityOf,
  powerOf,
  upgradeRanks,
  type MachineState,
  type SimState,
  type UpgradeBranch,
} from "../../game/simulation/types";
import { formatRate, formatSeconds, plural, t, unit } from "../../game/content/strings";
import { UPGRADE_COPY } from "./copy";

export interface BranchCardModel {
  readonly branch: UpgradeBranch;
  readonly title: string;
  readonly metric: string;
  readonly rankNow: number;
  readonly rankNext: number;
  readonly currentText: string;
  readonly proposedText: string;
  readonly deltaText: string;
  readonly cost: number;
  readonly costText: string;
  readonly tradeoff: string;
  /** Draw ranks past the 1-unit power floor change nothing; the card says so. */
  readonly noEffect: boolean;
  readonly affordable: boolean;
  /** The engine's own shortfall phrasing, or null when the yard can pay. */
  readonly shortfallText: string | null;
  /**
   * T18 (#145, U05): the full before/after the engine itself measures for this exact
   * purchase (`upgradeComparison`), so every card — not just its named metric — shows
   * what the tap changes: throughput in completed batches per minute at full power,
   * power units per running batch, and input capacity including research bonuses.
   */
  readonly rateNow: number;
  readonly rateNext: number;
  readonly powerNow: number;
  readonly powerNext: number;
  readonly capacityNow: number;
  readonly capacityNext: number;
  readonly throughputText: string;
  readonly powerText: string;
  readonly capacityText: string;
}

/**
 * The engine's U05 comparison for one candidate purchase. The machine is normally in
 * `state.machines` (the panel only opens on live machines); a detached shape from a
 * pure read-model caller is priced inside a view that holds it, so the numbers still
 * come from `upgradeComparison` itself — never a second copy of its formulas.
 */
function comparisonFor(
  state: SimState,
  machine: MachineState,
  branch: UpgradeBranch,
): UpgradeComparison {
  const direct = upgradeComparison(state, machine.id, branch);
  if (direct !== null) return direct;
  const view: SimState = {
    ...state,
    machines: [...state.machines.filter((m) => m.id !== machine.id), machine],
  };
  const held = upgradeComparison(view, machine.id, branch);
  if (held === null) throw new Error(`upgradeComparison lost machine ${machine.id}`);
  return held;
}

/** One level deeper with one more named pick — the exact shape `upgradeMachine` writes. */
export function afterPurchase(machine: MachineState, branch: UpgradeBranch): MachineState {
  return {
    ...machine,
    level: machine.level + 1,
    branch: [...(machine.branch ?? []), branch],
  };
}

/** The last named pick moved to another branch — the exact shape `respecMachine` writes. */
export function afterRespec(machine: MachineState, branch: UpgradeBranch): MachineState {
  const picks = machine.branch;
  if (picks === undefined || picks.length === 0) return machine;
  return {
    ...machine,
    branch: picks.map((pick, index) => (index === picks.length - 1 ? branch : pick)),
  };
}

/** The one named quantity's current value, formatted with its unit. */
export function metricValue(
  state: SimState,
  machine: MachineState,
  branch: UpgradeBranch,
): string {
  if (branch === "speed") {
    return t("value.seconds", { seconds: formatSeconds(batchMilliOf(machine) / 10000) });
  }
  if (branch === "buffer") {
    return unit(inputCapacityOf(machine, researchBonus(state).inputBuffer), t("unit.unit"));
  }
  return unit(powerOf(machine), t("unit.unit"));
}

/**
 * The three branch cards in dock order (speed, buffer, draw — `UPGRADE_BRANCHES`),
 * never price order: the comparison must not steer the tap toward the cheapest.
 */
export function branchCards(state: SimState, machine: MachineState): BranchCardModel[] {
  const def = BLUEPRINTS[machine.blueprint];
  const ranks = upgradeRanks(machine);
  return UPGRADE_BRANCHES.map((branch) => {
    const next = afterPurchase(machine, branch);
    const cost = branchPrice(def.baseUpgradeCost, machine.level, branch);
    const noEffect = branch === "draw" && powerOf(machine) <= 1;
    let deltaText: string;
    if (branch === "speed") {
      const delta = (batchMilliOf(machine) - batchMilliOf(next)) / 10000;
      deltaText = `-${formatSeconds(delta)}s ${UPGRADE_COPY.perBatch}`;
    } else if (branch === "buffer") {
      deltaText = `+${BUFFER_RANK_UNITS} ${UPGRADE_COPY.inputUnits}`;
    } else {
      deltaText = noEffect ? UPGRADE_COPY.noChange : `-1 ${UPGRADE_COPY.powerUnit}`;
    }
    const affordable = state.credits >= cost;
    // T18 (#145, U05): the engine's own before/after for this exact purchase. The
    // price above stays `branchPrice` — the same ladder `upgradeComparison` charges.
    const comparison = comparisonFor(state, machine, branch);
    return {
      branch,
      title: UPGRADE_COPY.branches[branch].title,
      metric: UPGRADE_COPY.branches[branch].metric,
      rankNow: ranks[branch],
      rankNext: ranks[branch] + 1,
      currentText: metricValue(state, machine, branch),
      proposedText: metricValue(state, next, branch),
      deltaText,
      cost,
      costText: unit(cost, t("unit.credit")),
      tradeoff: noEffect ? UPGRADE_COPY.drawFloor : UPGRADE_COPY.branches[branch].tradeoff,
      noEffect,
      affordable,
      shortfallText: affordable
        ? null
        : t("reject.shortfall", {
            need: cost,
            have: state.credits,
            word: plural(cost, t("unit.credit")),
          }),
      rateNow: comparison.before.batchesPerMinute,
      rateNext: comparison.after.batchesPerMinute,
      powerNow: comparison.before.power,
      powerNext: comparison.after.power,
      capacityNow: comparison.before.inputCapacity,
      capacityNext: comparison.after.inputCapacity,
      throughputText: `${formatRate(comparison.before.batchesPerMinute)} → ${formatRate(comparison.after.batchesPerMinute)} ${UPGRADE_COPY.batchesPerMinute}`,
      powerText: `${unit(comparison.before.power, t("unit.unit"))} → ${unit(comparison.after.power, t("unit.unit"))}`,
      capacityText: `${unit(comparison.before.inputCapacity, t("unit.unit"))} → ${unit(comparison.after.inputCapacity, t("unit.unit"))}`,
    };
  });
}

/** Whether a free re-pick exists, and which branch the last named pick holds. */
export function respecInfo(machine: MachineState): {
  readonly available: boolean;
  readonly last: UpgradeBranch | null;
} {
  const picks = machine.branch;
  if (picks === undefined || picks.length === 0) return { available: false, last: null };
  return { available: true, last: picks[picks.length - 1] };
}

/** The target branch's value after the free re-pick, for the respec face's own number. */
export function respecPreview(
  state: SimState,
  machine: MachineState,
  branch: UpgradeBranch,
): string {
  return metricValue(state, afterRespec(machine, branch), branch);
}
