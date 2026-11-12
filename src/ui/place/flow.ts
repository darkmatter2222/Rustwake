/**
 * UI-RESET-53: the placement / move / dismantle flows read the yard through these
 * pure mirrors. Every number here is derived with the *same* arithmetic the engine
 * applies in `src/game/simulation/commands.ts`, from the same exported helpers
 * (`refundOf`, `beltCost`) and the same content tables, so a printed cost or refund
 * cannot drift from what the confirming tap actually charges or pays:
 *
 *  - `buildMachine`  rejects not-found -> blocked-placement -> insufficient, where
 *    `shortCost` names the first priced stack the store cannot cover.
 *  - `moveMachine`   charges `movePenaltyPct` of every build-cost line, rounded per
 *    line, and `validTile` counts the moving machine's own cell as occupied.
 *  - `dismantleMachine` pre-checks room against `trayUnits + inBufUnits +
 *    Σ refundOf(buildCost) + Σ refundOf(beltCost(run.length))` over the machine's own
 *    out/in route ids; the commit then also returns the active batch in full.
 *
 * Nothing here mutates state or issues a command — these are reads the preview
 * surfaces paint, and the real spend only ever happens through `store.dispatch`.
 */
import { BLUEPRINTS, TUNING, type ItemStack } from "../../game/content/defs";
import { DOCK_TILE, YARD_TILES, beltCost, refundOf } from "../../game/simulation/commands";
import { resourceWord, t } from "../../game/content/strings";
import type { SimState } from "../../game/simulation/types";

/** Why a cell can or cannot receive a machine — the engine's `validTile` verdict. */
export type TileVerdict = "ok" | "occupied" | "dock" | "outside" | "unknown";

/**
 * Mirror of `validTile` (commands.ts). A moving machine's own cell is still listed in
 * `s.machines`, so it reads `occupied` here exactly as the engine refuses it — moving
 * onto yourself is a blocked placement, never a free no-op.
 */
export function tileVerdict(state: SimState, tile: number | null): TileVerdict {
  if (tile === null || !Number.isInteger(tile) || tile < 0 || tile >= YARD_TILES) return "outside";
  if (tile === DOCK_TILE) return "dock";
  if (state.machines.some((m) => m.tile === tile)) return "occupied";
  return "ok";
}

/** The engine's two shortfall numbers plus the resource word, as `shortOf` builds them. */
export interface Shortfall {
  readonly need: number;
  readonly have: number;
  readonly word: string;
}

/**
 * Mirror of `shortCost`: the first priced stack the store cannot cover. `null` when
 * every stack is payable (the engine only reaches `shortCost` after `spendFromStore`
 * has already failed, so a fully-covered price never produces a shortfall line).
 */
export function shortfallOf(state: SimState, cost: readonly ItemStack[]): Shortfall | null {
  const item = cost.find((each) => (state.store[each.resource] ?? 0) < each.qty);
  if (!item) return null;
  return { need: item.qty, have: state.store[item.resource] ?? 0, word: resourceWord(item.resource) };
}

/** The shared shortfall sentence, read from the one STRINGS key the toast also uses. */
export function shortfallLine(short: Shortfall): string {
  return t("reject.shortfall", { need: short.need, have: short.have, word: short.word });
}

/** Compact price sentence in the dock's own shape: "10 scrap + 3 ferrous". */
export function stackSummary(cost: readonly ItemStack[]): string {
  return cost
    .map((item) => t("value.recipeItem", { qty: item.qty, label: resourceWord(item.resource) }))
    .join(" + ");
}

export interface PlacementCheck {
  readonly verdict: TileVerdict;
  readonly shortfall: Shortfall | null;
  /** True only when the engine would accept `machine.build` right now. */
  readonly valid: boolean;
}

/** Placement preview verdict + affordability, in the engine's own rejection order. */
export function placementCheck(
  state: SimState,
  blueprint: string,
  tile: number | null
): PlacementCheck {
  const def = BLUEPRINTS[blueprint];
  if (!def) return { verdict: "unknown", shortfall: null, valid: false };
  const verdict = tileVerdict(state, tile);
  const shortfall = shortfallOf(state, def.buildCost);
  return { verdict, shortfall, valid: verdict === "ok" && shortfall === null };
}

/**
 * Mirror of `moveMachine`'s price: `movePenaltyPct` of each build-cost line, rounded
 * per line (never on the summed total), so the printed charge equals the spend.
 */
export function moveCostOf(blueprint: string): ItemStack[] {
  const def = BLUEPRINTS[blueprint];
  if (!def) return [];
  return def.buildCost.map((item) => ({
    resource: item.resource,
    qty: Math.round((item.qty * TUNING.movePenaltyPct) / 100),
  }));
}

export interface MoveCheck {
  readonly found: boolean;
  readonly verdict: TileVerdict;
  readonly shortfall: Shortfall | null;
  readonly cost: ItemStack[];
  readonly valid: boolean;
}

/** Move preview: destination verdict + the per-line charge + affordability. */
export function moveCheck(state: SimState, machineId: number, tile: number | null): MoveCheck {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine) return { found: false, verdict: "unknown", shortfall: null, cost: [], valid: false };
  const cost = moveCostOf(machine.blueprint);
  const verdict = tileVerdict(state, tile);
  const shortfall = shortfallOf(state, cost);
  return { found: true, verdict, shortfall, cost, valid: verdict === "ok" && shortfall === null };
}

export interface DismantleImpact {
  readonly found: boolean;
  /** The engine's no-room pre-check number (excludes the active batch). */
  readonly refundUnits: number;
  /** Σ refundOf(buildCost.qty) — the discounted build price. */
  readonly buildRefund: number;
  readonly trayUnits: number;
  readonly inBufUnits: number;
  /** Σ refundOf(beltCost(run.length)) over the machine's own out/in links. */
  readonly beltRefundUnits: number;
  /** How many belt links the commit drops. */
  readonly linkCount: number;
  /** Active batch units, returned in full on commit (not in the pre-check number). */
  readonly batchUnits: number;
  /** Free store room right now: capacity - units. */
  readonly room: number;
  /** The engine's own gate: room >= refundUnits. */
  readonly fits: boolean;
}

const EMPTY_IMPACT: DismantleImpact = {
  found: false,
  refundUnits: 0,
  buildRefund: 0,
  trayUnits: 0,
  inBufUnits: 0,
  beltRefundUnits: 0,
  linkCount: 0,
  batchUnits: 0,
  room: 0,
  fits: false,
};

/**
 * Mirror of `dismantleMachine`'s pre-check and payout. `refundUnits` is the exact
 * number the engine tests against free room; `batchUnits` is what the commit *also*
 * returns, so the preview can show the whole refund honestly while the gate stays
 * the engine's own.
 */
export function dismantleImpact(state: SimState, machineId: number): DismantleImpact {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine) return EMPTY_IMPACT;
  const def = BLUEPRINTS[machine.blueprint];
  if (!def) return EMPTY_IMPACT;
  let buildRefund = 0;
  for (const item of def.buildCost) buildRefund += refundOf(item.qty);
  const routeIds =
    machine.outRoute === null ? [...machine.inRoutes] : [machine.outRoute, ...machine.inRoutes];
  let beltRefundUnits = 0;
  for (const id of routeIds) {
    const route = state.routes.find((r) => r.id === id);
    beltRefundUnits += refundOf(beltCost(route?.run?.length ?? 0));
  }
  const refundUnits = machine.trayUnits + machine.inBufUnits + buildRefund + beltRefundUnits;
  const batchUnits = machine.batch.reduce((sum, item) => sum + item.qty, 0);
  const room = state.storeCapacity - state.storeUnits;
  return {
    found: true,
    refundUnits,
    buildRefund,
    trayUnits: machine.trayUnits,
    inBufUnits: machine.inBufUnits,
    beltRefundUnits,
    linkCount: routeIds.length,
    batchUnits,
    room,
    fits: room >= refundUnits,
  };
}

/** One plain-language reason for a tile verdict, shared by the placement and move strips. */
export function verdictReason(verdict: TileVerdict, tile: number | null): string {
  switch (verdict) {
    case "ok":
      return "";
    case "occupied":
      return tile === null ? "That cell is taken." : `Cell ${tile} is already occupied — pick a free cell.`;
    case "dock":
      return "The dock cell cannot hold a machine.";
    case "outside":
      return "Tap a yard cell to aim the preview.";
    default:
      return t("reject.not-found");
  }
}
