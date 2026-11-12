/**
 * UI-RESET-64: the onboarding read model. Every lesson is a pure derivation of the
 * authoritative sim state — the same `state.tutorial` machine the engine advances, the
 * same yard ladder (`nextYardStep`) the objective card and dock share, and the same
 * content tables. Nothing here mutates state or issues a command; the coach renders what
 * these return and the real spend only ever happens through `store.dispatch`.
 *
 * The goal sentence (`what`) is read from `objectiveFor`, the one source the objective
 * card already paints, so the coach and the card can never disagree about the next tap.
 * The coach adds the teaching layer the card lacks: the topic, the "why", a reachable
 * "next", and an expandable detail with the shared vocabulary.
 */
import { BLUEPRINTS } from "../../game/content/defs";
import { nextYardStep, type YardStep } from "../../game/simulation/plan";
import type { SimState } from "../../game/simulation/types";
import { costSummary, objectiveFor } from "../text";
import { FUNCTIONS } from "../build/copy";
import {
  GLOSSARY,
  ONBOARD_COPY,
  STEP_NEXT,
  STEP_WHY,
  TOPIC_LABELS,
  TOPIC_WHY,
} from "./copy";

export type Topic = "salvage" | "build" | "connect" | "storage" | "trade" | "upgrade" | "research";

export interface Lesson {
  readonly id: string;
  readonly topic: Topic;
  readonly title: string;
  /** The current goal, shared verbatim with the objective card. */
  readonly what: string;
  readonly why: string;
  readonly next: string;
  /** Expandable deeper explanation (vocabulary + the research chain when relevant). */
  readonly detail: string;
  /** True while the fresh-yard research path is the active lesson. */
  readonly researchPath: boolean;
}

/**
 * Read-only mirror of the `showResearch` gate (App.tsx, spec 5.5): Research is reachable
 * once the yard holds Data OR already owns a research node. This is duplicated here ONLY
 * so the coach can phrase guidance without importing App (which would be a cycle); the
 * gate logic itself is untouched and stays the single authority for the dock/rail faces.
 * If the gate ever changes, this mirror must change with it.
 */
export function hasResearchAccess(state: SimState): boolean {
  return (state.store.data ?? 0) > 0 || Object.keys(state.research ?? {}).length > 0;
}

/**
 * The Data dependency chain, dependency-first. Each machine's recipe feeds the next, so
 * the first unbuilt link is the concrete bottleneck on the path to first Data:
 *   sorter → copperSeparator → polymerRecycler → wireMill → circuitAssembler → signalLab
 * (R01 scrap→ferrous+nonferrous; R03 nonferrous→copper+residue; R04 residue→polymer;
 *  R05 copper→wire; R07 wire+polymer→circuits; R11 circuits→data.)
 */
export const DATA_CHAIN: readonly string[] = [
  "sorter",
  "copperSeparator",
  "polymerRecycler",
  "wireMill",
  "circuitAssembler",
  "signalLab",
];

export interface ResearchPath {
  /** The next machine to build toward Data, or null when the whole chain is built. */
  readonly needed: string | null;
  readonly cost: string;
  readonly purpose: string;
  /** True when every chain machine is built but no Data has landed yet. */
  readonly waiting: boolean;
}

/** Walk the Data chain and name the first unbuilt link with its real price and purpose. */
export function researchPath(state: SimState): ResearchPath {
  for (const id of DATA_CHAIN) {
    if (state.machines.some((m) => m.blueprint === id)) continue;
    const def = BLUEPRINTS[id];
    return {
      needed: id,
      cost: def ? costSummary(def) : "",
      purpose: FUNCTIONS[id] ?? "",
      waiting: false,
    };
  }
  return { needed: null, cost: "", purpose: FUNCTIONS.signalLab ?? "", waiting: true };
}

/** Map a yard-ladder step to the topic the coach teaches. */
function topicForStep(step: YardStep): Topic {
  switch (step.kind) {
    case "connect":
      return "connect";
    case "build":
      return "build";
    case "sell":
      return "trade";
    case "research":
      return "research";
    case "upgrade":
      return "upgrade";
    case "drone":
    case "salvage":
      return "salvage";
    default:
      return "salvage";
  }
}

/** The early tutorial steps map to a fixed topic; storage is the observe-delivery step. */
const STEP_TOPIC: Readonly<Record<number, Topic>> = {
  0: "salvage",
  1: "salvage",
  2: "salvage",
  3: "storage",
  4: "build",
  5: "connect",
  6: "build",
  7: "trade",
  8: "upgrade",
};

/** The expandable detail: the shared glossary, plus the Data chain when research is the goal. */
function detailFor(topic: Topic, path: ResearchPath | null): string {
  const glossary = GLOSSARY.map((entry) => `${entry.term}: ${entry.meaning}`).join(" ");
  if (topic === "research" && path !== null) {
    const chain = DATA_CHAIN.map((id) => BLUEPRINTS[id]?.label ?? id).join(" → ");
    const head = path.waiting
      ? ONBOARD_COPY.researchWaiting
      : `${ONBOARD_COPY.researchChainTitle}: ${chain}.`;
    return `${head} ${glossary}`;
  }
  return glossary;
}

/**
 * The current lesson. A fresh yard walks the tutorial topics in order; a progressed yard
 * (tutorial complete) is led by the yard ladder, and a yard that has not yet earned Data
 * is taught the research path explicitly — without ever weakening the showResearch gate.
 */
export function lessonFor(state: SimState): Lesson {
  const what = objectiveFor(state);
  const tutorial = state.tutorial;

  // Fresh-yard research guidance: tutorial complete, but Research still locked.
  if (tutorial >= 9 && !hasResearchAccess(state)) {
    const path = researchPath(state);
    const next = path.waiting
      ? ONBOARD_COPY.researchWaiting
      : path.needed !== null
        ? ONBOARD_COPY.researchNext(BLUEPRINTS[path.needed]?.label ?? path.needed)
        : ONBOARD_COPY.researchGoal;
    return {
      id: "research-path",
      topic: "research",
      title: TOPIC_LABELS.research,
      what: ONBOARD_COPY.researchGoal,
      why: ONBOARD_COPY.researchWhy,
      next,
      detail: detailFor("research", path),
      researchPath: true,
    };
  }

  if (tutorial < 9) {
    const topic = STEP_TOPIC[tutorial] ?? "salvage";
    return {
      id: `tutorial-${tutorial}`,
      topic,
      title: TOPIC_LABELS[topic],
      what,
      why: STEP_WHY[tutorial] ?? TOPIC_WHY[topic],
      next: STEP_NEXT[tutorial] ?? TOPIC_WHY[topic],
      detail: detailFor(topic, null),
      researchPath: false,
    };
  }

  // Progressed yard: the ladder leads. Research already unlocked is taught as a topic.
  const step = nextYardStep(state);
  const topic = topicForStep(step);
  const path = topic === "research" ? researchPath(state) : null;
  return {
    id: `yard-${step.kind}`,
    topic,
    title: TOPIC_LABELS[topic],
    what,
    why: topic === "research" && hasResearchAccess(state) ? ONBOARD_COPY.researchUnlocked : TOPIC_WHY[topic],
    next: what,
    detail: detailFor(topic, path),
    researchPath: false,
  };
}