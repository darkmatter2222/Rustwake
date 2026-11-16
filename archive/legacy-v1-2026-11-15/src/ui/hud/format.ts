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
 * 3. Every tier prints two decimals below 100 and one at/above 100, choosing the
 *    precision from the *rounded* value so `99.999` never prints `100.00` (seven
 *    characters). Each tier rolls up to the next at the boundary where it would
 *    round to `1000.0`. The ladder runs K -> M -> B -> T, so every printed value
 *    fits six characters and the reserved `ch` width on a chip never resizes
 *    mid-tick. Past the last tier it caps at an explicit `999.9T+` overflow
 *    sentinel instead of growing without bound.
 */
function compact(value: number, suffix: string): string {
  return `${value.toFixed(value < 99.995 ? 2 : 1)}${suffix}`;
}

export function hudNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const n = Math.max(0, Math.floor(value));
  if (n < 10_000) return String(n);
  if (n < 999_950) return compact(n / 1e3, "K");
  if (n < 999_950_000) return compact(n / 1e6, "M");
  if (n < 999_950_000_000) return compact(n / 1e9, "B");
  if (n < 999_950_000_000_000) return compact(n / 1e12, "T");
  return "999.9T+";
}

/** One capacity readout, both sides through the same stable formatter: `900/900`. */
export function capacityText(units: number, capacity: number): string {
  return `${hudNumber(units)}/${hudNumber(capacity)}`;
}