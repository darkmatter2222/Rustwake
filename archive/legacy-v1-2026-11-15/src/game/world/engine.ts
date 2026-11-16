/**
 * World tick engine (issue #133).
 *
 * Construction settles exactly once, at startTick + durationTicks, whether
 * time advances tick-by-tick or by event jump (advanceTo equivalence, the
 * same contract the sim core proves for its economy). Completion moves the
 * single reservation into committed material; nothing is charged again.
 * A reload (JSON round-trip) followed by advancement settles each site once
 * because progress is derived from integer tick counts, never wall-clock.
 *
 * No DOM, no Date, no Math.random: every transition is a pure function of
 * (state, ticks).
 */
import { WORLD_KIT, type WorldAssetId } from "./kit";
import type { PlacedBuilding, WorldState } from "./types";

/** Absolute tick at which a site completes. */
export function completionTick(site: { startTick: number; durationTicks: number }): number {
  return site.startTick + site.durationTicks;
}

/** Earliest pending completion tick, or Infinity when nothing is building. */
export function nextCompletionTick(w: WorldState): number {
  let next = Infinity;
  for (const site of w.sites) {
    const due = completionTick(site);
    if (due < next) next = due;
  }
  return next;
}

/**
 * Settle every site whose progress reached its duration. Idempotent: a site
 * is removed from w.sites as it settles, so it can never settle twice.
 */
function settleCompleted(w: WorldState): void {
  if (w.sites.length === 0) return;
  const remaining: WorldState["sites"] = [];
  for (const site of w.sites) {
    if (site.progressTicks < site.durationTicks) {
      remaining.push(site);
      continue;
    }
    const reservation = w.reservations.find((r) => r.id === site.reservationId);
    if (reservation !== undefined) {
      for (const item of reservation.items) {
        w.committed[item.resource] = (w.committed[item.resource] ?? 0) + item.qty;
      }
      w.committedCredits += reservation.credits;
      w.reservations = w.reservations.filter((r) => r.id !== reservation.id);
    }
    const building: PlacedBuilding = {
      id: site.buildingId,
      asset: site.asset,
      cell: site.cell,
      rotation: site.rotation,
      completedTick: completionTick(site),
    };
    w.buildings.push(building);
  }
  w.sites = remaining;
}

/** One 100 ms simulation tick. */
export function stepWorldTick(w: WorldState): void {
  for (const site of w.sites) {
    if (site.progressTicks < site.durationTicks) site.progressTicks += 1;
  }
  settleCompleted(w);
  w.tick += 1;
}

/** Advance exactly `ticks` ticks, one at a time. */
export function advanceWorld(w: WorldState, ticks: number): void {
  const n = Math.max(0, Math.floor(ticks));
  for (let i = 0; i < n; i += 1) stepWorldTick(w);
}

/**
 * Advance to an absolute tick, jumping over idle spans. Equivalent to
 * advanceWorld(w, target - w.tick) for every state: between completions the
 * only per-tick change is site progress, which is elapsed-tick arithmetic.
 * Never rewinds.
 */
export function advanceWorldTo(w: WorldState, target: number): void {
  const goal = Math.floor(target);
  while (w.tick < goal) {
    const due = nextCompletionTick(w);
    if (due > w.tick + 1) {
      const next = Math.min(due, goal);
      const delta = next - w.tick;
      for (const site of w.sites) {
        site.progressTicks = Math.min(site.durationTicks, site.progressTicks + delta);
      }
      w.tick = next;
      settleCompleted(w);
      if (w.tick >= goal) break;
      // Fell on a completion boundary; loop continues (step or next jump).
      continue;
    }
    stepWorldTick(w);
  }
}

/** Progress of a site in [0, 1] as integer percent (UI helper, pure). */
export function siteProgressPct(site: { progressTicks: number; durationTicks: number }): number {
  if (site.durationTicks <= 0) return 100;
  return Math.floor((site.progressTicks * 100) / site.durationTicks);
}

/** Convenience: duration for an asset from the kit (read-only). */
export function constructionTicksOf(asset: WorldAssetId): number {
  return WORLD_KIT[asset].constructionTicks;
}