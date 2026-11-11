/**
 * UI-RESET-51: the HUD's own quantity readout.
 *
 * `formatNumber` (strings.ts) stays the one shared formatter for sentences; this
 * is a separate, width-bounded ladder for the chip row so values never jitter or
 * shrink to illegibility as the yard grows:
 *
 * 1. Non-finite and negative inputs read as `0` - the store never owes, and a
 *    damaged read must not print `NaN` over the world.
 * 2. Quantities floor: the HUD never overstates what the yard actually holds.
 * 3. Every tier uses two decimals below 100 and one at/above 100, and rolls up at
 *    the rounding boundary (`999950` would print `1000.0K`, one tick before
 *    `1.00M`). The ladder extends K -> M -> B -> T with the same rule, so every
 *    printed value fits six characters and the reserved `ch` width on a chip
 *    never resizes mid-tick. Past the last tier it caps at an explicit `999.9T+`
 *    overflow sentinel instead of growing without bound.
 */
export function hudNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const n = Math.max(0, Math.floor(value));
  if (n < 10_000) return String(n);
  if (n < 1e6) return n >= 999_950 ? "1.00M" : `${(n / 1e3).toFixed(n < 1e5 ? 2 : 1)}K`;
  if (n < 1e9) {
    return n >= 999_950_000 ? "1.00B" : `${(n / 1e6).toFixed(n < 1e8 ? 2 : 1)}M`;
  }
  if (n < 1e12) {
    return n >= 999_950_000_000 ? "1.00T" : `${(n / 1e9).toFixed(n < 1e11 ? 2 : 1)}B`;
  }
  if (n >= 999_950_000_000_000) return "999.9T+";
  return `${(n / 1e12).toFixed(n < 1e14 ? 2 : 1)}T`;
}

/** One capacity readout, both sides through the same stable formatter: `900/900`. */
export function capacityText(units: number, capacity: number): string {
  return `${hudNumber(units)}/${hudNumber(capacity)}`;
}