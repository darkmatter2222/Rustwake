import { RESOURCES, TICK_MS, TUNING, type ResourceId } from "../../game/content/defs";
import { t } from "../../game/content/strings";
import type { ReturnReport } from "../../game/simulation/offline";
import { RESOURCE_LABEL, formatDuration, formatNumber } from "../text";

/**
 * UI-RESET-61 (issue #61): pure derivation for the redesigned return report.
 *
 * The panel receives ONLY the settled `ReturnReport` the store adopted from the
 * read-only catch-up (src/game/simulation/offline.ts) plus `onClose`; it has no
 * store, dispatch or navigation access. Everything the surface shows is therefore
 * derived here, once, from that report — no simulation, no save writes, no reward
 * claim. The store credits an absence exactly once (adoptCatchUp) and replaces
 * `lastSeenMs` with `nowMs`, so re-opening or reloading this panel can never apply
 * gains twice; this module stays a pure function so that guarantee is trivially
 * preserved.
 *
 * Hierarchy: kind/state chip + day-precision away time + gains headline (summary),
 * then the full gains list, the cap/long-absence limits, the key bottleneck, the
 * legacy detail rows and the recovery footer (detail).
 */

export type ReturnKind = "no-credit" | "zero-gain" | "earned";
export type ReturnBottleneck = NonNullable<ReturnReport["bottleneck"]>;

/** One stored resource gain, ordered largest first for the summary list. */
export interface GainLine {
  readonly id: ResourceId;
  readonly label: string;
  readonly amount: number;
  readonly formatted: string;
  /** 0..1 relative to the LARGEST gain, so the comparison bars read at a glance. */
  readonly share: number;
}

export interface ReturnModel {
  readonly kind: ReturnKind;
  /** Short chip word: Earned / Capped / Long absence / Zero gain / No credit. */
  readonly stateLabel: string;
  readonly capped: boolean;
  /** Away for a day or more: the hour-capped formatter cannot express this. */
  readonly longAbsence: boolean;
  readonly awayTicks: number;
  readonly creditedTicks: number;
  readonly uncreditedTicks: number;
  /** Day precision ("3d 2h") once away >= 1 day; otherwise formatDuration. */
  readonly awayLabel: string;
  /** The legacy hour-capped duration, kept verbatim for the detail rows. */
  readonly awayExact: string;
  readonly creditedLabel: string;
  readonly capHours: number;
  readonly totalUnits: number;
  readonly gainLines: readonly GainLine[];
  readonly creditsGained: number;
  readonly deliveries: number;
  readonly batchesDone: number;
  readonly bottleneck: ReturnBottleneck | null;
  /** Resolved legacy label ("Storage full"), never the raw key. */
  readonly bottleneckLabel: string | null;
  /** Deterministic plain-text diagnostic for the copy-report recovery action. */
  readonly reportText: string;
}

/** Ticks in one day at TICK_MS = 100 (864,000). */
const DAY_TICKS = 86_400_000 / TICK_MS;

/**
 * Day-precision absence duration. The shared formatDuration caps at hour
 * precision ("72h 0m" for three days), which hides the scale of a long absence;
 * a day or more reads "3d 2h" here, and shorter absences keep the shared
 * formatter so the summary and the legacy detail rows never disagree.
 */
export function formatAway(ticks: number): string {
  if (ticks < DAY_TICKS) return formatDuration(ticks);
  const totalSeconds = Math.floor((ticks * TICK_MS) / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  return `${days}d ${hours}h`;
}

/**
 * Derive the whole return surface from one settled report. Pure: no clocks, no
 * mutation, no React — the same report always paints the same numbers.
 */
export function deriveReturn(report: ReturnReport): ReturnModel {
  const entries = (Object.entries(report.gains) as [ResourceId, number][])
    .filter(([, value]) => value > 0)
    .sort(
      (a, b) =>
        b[1] - a[1] || RESOURCES.indexOf(a[0]) - RESOURCES.indexOf(b[0])
    );
  const totalUnits = entries.reduce((sum, [, value]) => sum + value, 0);
  const largest = entries.length > 0 ? entries[0][1] : 0;
  const gainLines: GainLine[] = entries.map(([id, amount]) => ({
    id,
    label: RESOURCE_LABEL[id] ?? id,
    amount,
    formatted: formatNumber(amount),
    share: largest > 0 ? amount / largest : 0,
  }));

  // The store only adopts a report when creditedTicks > 0; "no-credit" is the
  // defensive shape for a zero window, "zero-gain" is a real credited window
  // where nothing reached storage (an idle or fully blocked yard).
  const kind: ReturnKind =
    report.creditedTicks <= 0
      ? "no-credit"
      : totalUnits === 0 && report.creditsGained <= 0
        ? "zero-gain"
        : "earned";
  const longAbsence = report.awayTicks >= DAY_TICKS;
  const stateLabel =
    kind === "no-credit"
      ? "No credit"
      : kind === "zero-gain"
        ? "Zero gain"
        : longAbsence
          ? "Long absence"
          : report.capped
            ? "Capped"
            : "Earned";

  const awayLabel = formatAway(report.awayTicks);
  const awayExact = formatDuration(report.awayTicks);
  const creditedLabel = formatDuration(report.creditedTicks);
  const capHours = (TUNING.offlineCapTicks * TICK_MS) / 3_600_000;
  const bottleneckLabel = report.bottleneck
    ? t(`bottleneck.${report.bottleneck}`)
    : null;

  const reportText = [
    "Rustwake return report",
    `Away: ${awayLabel} (${report.awayTicks} ticks)`,
    `Credited: ${creditedLabel} (${report.creditedTicks} ticks${report.capped ? ", capped" : ""})`,
    gainLines.length > 0
      ? `Gains: ${gainLines.map((g) => `${g.label} +${g.formatted}`).join(", ")}`
      : "Gains: none",
    `Credits: +${formatNumber(report.creditsGained)}`,
    `Deliveries: ${report.deliveries}`,
    `Batches: ${report.batchesDone}`,
    `Bottleneck: ${bottleneckLabel ?? "none"}`,
  ].join("\n");

  return {
    kind,
    stateLabel,
    capped: report.capped,
    longAbsence,
    awayTicks: report.awayTicks,
    creditedTicks: report.creditedTicks,
    uncreditedTicks: Math.max(0, report.awayTicks - report.creditedTicks),
    awayLabel,
    awayExact,
    creditedLabel,
    capHours,
    totalUnits,
    gainLines,
    creditsGained: report.creditsGained,
    deliveries: report.deliveries,
    batchesDone: report.batchesDone,
    bottleneck: report.bottleneck,
    bottleneckLabel,
    reportText,
  };
}
