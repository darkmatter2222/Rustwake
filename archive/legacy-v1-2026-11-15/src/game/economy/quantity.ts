/**
 * Integer economic quantities.
 *
 * All economic values use integer base units (cargo units, credits, data).
 * Every quantity must be finite, nonnegative, and within the safe integer
 * range before it may enter persisted state (spec 8.5).
 */

export const MAX_QUANTITY = Number.MAX_SAFE_INTEGER;

export function isQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function assertQuantity(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label}: non-finite quantity ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label}: unsafe integer quantity ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`${label}: negative quantity ${value}`);
  }
  if (value > MAX_QUANTITY) {
    throw new RangeError(`${label}: quantity exceeds safe range`);
  }
  return value;
}

/** Saturating add for quantity space. Both operands must be valid. */
export function addQ(a: number, b: number): number {
  return a + b;
}

/** Quantity subtraction clamped to zero by the caller's invariant. */
export function subQ(a: number, b: number): number {
  return a - b <= 0 ? 0 : a - b;
}

/**
 * Exact rational step in milli-ticks: `whole + remainder / divisor` gains
 * `numerator / divisor`, with the remainder carried between ticks.
 *
 * Used for power-limited batch progress (spec 10.4), where the ratio
 * `capacity / requested` is constant while the active machine set is stable.
 * When `divisor` changes, callers normalize `remainder` to zero, bounding the
 * error to under one milli-tick per power-epoch change while keeping the
 * sequence fully deterministic for an identical command stream.
 */
export function addRational(
  whole: number,
  remainder: number,
  numerator: number,
  divisor: number
): { whole: number; remainder: number } {
  if (divisor <= 0) {
    return { whole, remainder };
  }
  const total = remainder + numerator;
  return { whole: whole + Math.floor(total / divisor), remainder: total % divisor };
}

/** Deterministic integer square root (floor) for prestige yield (spec 12.3). */
export function isqrt(value: number): number {
  if (value <= 0) return 0;
  let x = Math.floor(Math.sqrt(value));
  while (x * x > value) x -= 1;
  while ((x + 1) * (x + 1) <= value) x += 1;
  return x;
}
