import { formatNumber, plural, t, unit } from "../../game/content/strings";

/**
 * UI-RESET-56 (issue #56): the yard store's own sentence layer.
 *
 * Plain literals on purpose, the same shape `src/ui/hud/copy.ts` uses: the shared
 * `STRINGS` table is read-only for this wave, and the i18n scan rejects any painted
 * `prefix.word` key shape, so nothing here may look like an unresolved key. Every
 * quantity goes through the shared `unit`/`plural`/`formatNumber` helpers, so a count
 * of one never prints "1 units" and large numbers keep their separators.
 */

const CREDIT = t("unit.credit");
const UNIT = t("unit.unit");

export const STORE_COPY = {
  tradeDesk: "Trade desk",
  inventory: "Inventory",
  diagnostics: "Diagnostics",
  raw: "Raw materials",
  intermediate: "Intermediate materials",
  finished: "Finished goods",
  tradeLocked: "Finish the first steel contract to open selling.",
  nothingSellable:
    "Nothing is sellable right now: stock sits at or below the reserve the yard keeps.",
  stock: "Stock",
  sellable: "Sellable",
  quantity: "Quantity",
  proceeds: "Proceeds",
  perUnit: "per unit",
  max: "Max",
  half: "Half",
  storageCause: "Storage cause",
  largestHolds: "Largest holds",
  recovery: "Recovery",
  recoverySell: "Sell a tranche in the trade desk",
  recoveryWait: "Machines draw stock down; the trade desk opens as it rises",
  zeroStock: "None in store",
} as const;

/** `{n} units held outside return as space frees` — the overflow recovery option. */
export function recoveryOverflow(count: number): string {
  return `${unit(count, UNIT)} held outside return as space frees`;
}

/** `Enter a whole number from 1 to {max}.` — the invalid-quantity reason. */
export function invalidQty(max: number): string {
  return `Enter a whole number from 1 to ${formatNumber(max)}.`;
}

/** `Only {n} units sellable above the reserve.` — the over-request reason. */
export function overSellable(max: number): string {
  return `Only ${unit(max, UNIT)} sellable above the reserve.`;
}

export function decreaseLabel(name: string): string {
  return `Decrease ${name} quantity`;
}

export function increaseLabel(name: string): string {
  return `Increase ${name} quantity`;
}

export function setQtyLabel(name: string): string {
  return `Set ${name} quantity`;
}

export function maxLabel(name: string): string {
  return `Max ${name}`;
}

export function halfLabel(name: string): string {
  return `Half ${name}`;
}

export function tradeLabel(name: string): string {
  return `${name} trade`;
}

export function quantityGroupLabel(name: string): string {
  return `${name} quantity`;
}

/** `15 credits per unit` — the card's own price, pluralised by the shared helper. */
export function priceLine(price: number): string {
  return `${unit(price, CREDIT)} ${STORE_COPY.perUnit}`;
}

/** `Stock 880 · Sellable 60` — the two numbers the trade decision rests on. */
export function factsLine(held: number, sellable: number): string {
  return `${STORE_COPY.stock} ${formatNumber(held)} · ${STORE_COPY.sellable} ${formatNumber(sellable)}`;
}

/** `60 × 15 = 900 credits` — the exact proceeds preview, same arithmetic as the engine. */
export function proceedsLine(qty: number, price: number): string {
  return `${formatNumber(qty)} × ${formatNumber(price)} = ${unit(qty * price, CREDIT)}`;
}

/** `98% of capacity` — one resource's share of the whole store. */
export function shareLine(percent: number): string {
  return `${percent}% of capacity`;
}

/**
 * The supply/demand cue under one inventory row, derived from the yard's own
 * machines: who makes this material and who uses it. Raw stock arrives from
 * salvage and the drones instead of a recipe, so it says so.
 */
export function cueLine(raw: boolean, producers: number, consumers: number): string {
  const supply = raw
    ? "salvage + drones"
    : producers > 0
      ? `made by ${formatNumber(producers)}`
      : "not made yet";
  const demand =
    consumers > 0 ? `used by ${formatNumber(consumers)}` : "not used yet";
  return `${supply} · ${demand}`;
}

/** `1 machine` / `2 machines` — kept for the diagnostics voice, plural-safe. */
export function machineCount(count: number): string {
  return `${formatNumber(count)} ${plural(count, t("unit.machine"))}`;
}
