/**
 * UI-RESET-58 (issue #58): the research surface's own sentence layer.
 *
 * Plain literals on purpose, the same shape `src/ui/store/copy.ts` uses: the
 * shared `STRINGS` table is read-only for this wave, and the i18n scan rejects
 * any painted `prefix.word` key shape, so nothing here may look like an
 * unresolved key. The legacy purchase phrases (`Buy · N Data`, `N Data`,
 * `Known`, `Needs X first`) still come from `t()` in the panel itself because
 * the existing read-only tests assert those exact strings. Every quantity here
 * goes through the shared `formatNumber`/`unit` helpers.
 */

import { formatNumber, resourceWord } from "../../game/content/strings";
import type { ResearchNodeView, ResearchState } from "./model";

export const RESEARCH_COPY = {
  pathLabel: "Research path",
  progressWord: "researched",
  focusNext: "Where the next upgrade lands",
  focusBought: "Just bought — live in the yard",
  focusDone: "Every node is active in the yard",
  prereqNone: "First node — no prerequisite.",
  requiresWord: "Requires",
  prereqDone: "completed",
  prereqMissing: "not researched yet",
  lockedBadge: "Locked",
  unlockedBadge: "Unlocked",
  availableBadge: "Available",
  completedBadge: "Completed",
  buyWord: "Buy",
  dataWord: "Data",
} as const;

const BADGES: Record<ResearchState, string> = {
  completed: RESEARCH_COPY.completedBadge,
  locked: RESEARCH_COPY.lockedBadge,
  available: RESEARCH_COPY.availableBadge,
  unlocked: RESEARCH_COPY.unlockedBadge,
};

/** The four-state badge word, painted on every card and overview segment. */
export function badgeFor(state: ResearchState): string {
  return BADGES[state];
}

/** `2 of 3 researched` — the overview's progress line. */
export function progressLine(completed: number, total: number): string {
  return `${formatNumber(completed)} of ${formatNumber(total)} ${RESEARCH_COPY.progressWord}`;
}

/** Readable prerequisite: names the node and whether it is already owned. */
export function prereqLine(node: ResearchNodeView): string {
  if (!node.prereq) return RESEARCH_COPY.prereqNone;
  const status = node.prereq.owned ? RESEARCH_COPY.prereqDone : RESEARCH_COPY.prereqMissing;
  return `${RESEARCH_COPY.requiresWord} ${node.prereq.def.label} — ${status}`;
}

/**
 * Why the buy target is unavailable, with the engine's own two numbers.
 * Null when the node is buyable or already completed.
 */
export function whyLine(node: ResearchNodeView): string | null {
  if (node.state === "locked" && node.prereq) {
    return `Research ${node.prereq.def.label} first to open this node.`;
  }
  if (node.state === "unlocked") {
    return `Need ${formatNumber(node.shortfall)} more ${RESEARCH_COPY.dataWord} — have ${formatNumber(node.have)} of ${formatNumber(node.cost)}.`;
  }
  return null;
}

/** The no-data answer: where Data is earned, read from the content tables. */
export function dataNote(note: {
  machine: string;
  perCycle: number;
  seconds: number;
  input: { qty: number; resource: string } | null;
}): string {
  // "Data" is a mass noun in every existing string ("4 Data"), so it never takes
  // the shared plural rule. The input word resolves through the shared table.
  const input = note.input
    ? `${formatNumber(note.input.qty)} ${resourceWord(note.input.resource)}`
    : RESEARCH_COPY.dataWord;
  return `${note.machine} makes ${formatNumber(note.perCycle)} ${RESEARCH_COPY.dataWord} every ${formatNumber(note.seconds)}s from ${input}.`;
}

/** Accessible name for one card: its title plus its four-state word. */
export function cardLabel(node: ResearchNodeView): string {
  return `${node.def.label}, ${badgeFor(node.state)}`;
}

const WHERE: Record<string, string> = {
  cutters: "Lands on your cutting pulse at the wreck.",
  buffers: "Lands on every machine's input buffer.",
  dispatch: "Lands on links you connect from now on.",
};

/** One sentence naming the machine/resource quantity a node changes. */
export function whereFor(nodeId: string | null): string {
  if (nodeId === null) return "All three effects are live in the yard.";
  return WHERE[nodeId] ?? "";
}