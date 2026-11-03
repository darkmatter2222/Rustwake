import { TICK_MS, TUNING, type ResourceId } from "../content/defs";
import { advanceTo } from "./engine";
import type { SimState } from "./types";

export interface ReturnReport {
  readonly awayTicks: number;
  readonly creditedTicks: number;
  readonly capped: boolean;
  readonly gains: Readonly<Record<string, number>>;
  readonly creditsGained: number;
  readonly deliveries: number;
  readonly batchesDone: number;
  readonly bottleneck: "storage-full" | "power-limited" | "starved" | null;
}

/**
 * Bounded deterministic catch-up (spec 18.1).
 *
 * The authoritative clock advances through the whole absence, while only the
 * capped eligible window earns production. `lastSeenMs` is replaced by
 * `nowMs` by the caller, so repeated reloads cannot claim the discarded tail.
 */
export function catchUp(
  s: SimState,
  lastSeenMs: number,
  nowMs: number
): { report: ReturnReport; nextLastSeenMs: number } {
  const rawElapsed = Math.max(0, Math.floor((nowMs - lastSeenMs) / TICK_MS));
  const elapsed = Number.isFinite(rawElapsed) ? rawElapsed : 0;
  const eligible = Math.min(elapsed, TUNING.offlineCapTicks);

  const before = snapshotTotals(s);
  const beforeCredits = s.credits;
  const beforeDeliveries = s.drone.deliveries;
  const beforeBatches = totalBatches(s);
  const startTick = s.tick;

  advanceTo(s, startTick + eligible);

  const after = snapshotTotals(s);
  const gains: Record<string, number> = {};
  for (const key of Object.keys(after) as ResourceId[]) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (delta > 0) gains[key] = delta;
  }

  return {
    report: {
      awayTicks: elapsed,
      creditedTicks: eligible,
      capped: elapsed > TUNING.offlineCapTicks,
      gains,
      creditsGained: s.credits - beforeCredits,
      deliveries: s.drone.deliveries - beforeDeliveries,
      batchesDone: totalBatches(s) - beforeBatches,
      bottleneck: detectBottleneck(s),
    },
    nextLastSeenMs: nowMs,
  };
}

function snapshotTotals(s: SimState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const key of Object.keys(s.store) as ResourceId[]) totals[key] = s.store[key] ?? 0;
  for (const item of s.overflow) totals[item.resource] = (totals[item.resource] ?? 0) + item.qty;
  return totals;
}

function totalBatches(s: SimState): number {
  let total = 0;
  for (const m of s.machines) total += m.batchesDone;
  return total;
}

function detectBottleneck(s: SimState): ReturnReport["bottleneck"] {
  if (s.storeCapacity - s.storeUnits <= s.storeCapacity * 0.02) return "storage-full";
  if (s.powerRatio < 0.999) return "power-limited";
  for (const m of s.machines) if (m.status === "starved") return "starved";
  return null;
}

/** One suggested next action for the return report (spec 18.3). */
export function suggestedAction(s: SimState): string {
  if (!s.drone.repaired) return "objective.repair";
  if (s.machines.length === 0) return "objective.build-sorter";
  if (s.routes.length === 0) return "objective.connect-route";
  for (const m of s.machines) if (m.status === "starved") return "hint.starved";
  for (const m of s.machines) if (m.status === "outputFull") return "hint.cargo-full";
  if (!s.exportClaimed && (s.store["steel"] ?? 0) >= 3) return "objective.export";
  return "objective.upgrade";
}
