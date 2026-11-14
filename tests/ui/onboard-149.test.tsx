import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import hudCssRaw from "../../src/ui/hud/hud.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import onboardCssRaw from "../../src/ui/onboard/onboard.css?raw";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  upgradeCost,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState, fleetDeliveries, type SimState } from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, SAVE_KEY, encodeSave } from "../../src/game/persistence/save";
import { lessonFor } from "../../src/ui/onboard/lessons";
import { ONBOARD_COPY } from "../../src/ui/onboard/copy";
import { objectiveFor } from "../../src/ui/text";

/**
 * RW3D #149 (U05): contextual onboarding tied to the REAL objective, verified
 * against the engine-driven journey from the #214 opening seed — not a forced
 * tutorial counter. Three layers:
 *
 *  1. The lesson read model (`lessonFor`) is asserted pure at every stage of a
 *     journey built only with the engine's own commands, and its `what` is the
 *     shared `objectiveFor` line verbatim (one goal, two surfaces).
 *  2. The painted coach carries NO universal next/advance button: the only action
 *     faces are Skip (Show when hidden) plus the conditional earn-recovery pair.
 *     The "next" line is guidance text, never a ladder control.
 *  3. The inherited #214 tutorial-gate vacuity is CHARACTERIZED, not patched:
 *     the opening seed's steel 12 / credits 60 collapse gates 6->7->8 in a single
 *     sync pass, and no credit sink reachable before the first sale zeroes the
 *     purse, so the trade lesson (tutorial-7) never paints on the natural journey.
 *     `engine.ts` is read-only for this issue (the gate is shared core, escalated
 *     at #214); the lesson itself is proven correct and reachable from a save.
 *
 * Fixture mutation happens only in this test file; every persisted yard still
 * passes the game's own decodeSave on load. No src module is touched.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 14900;
const send = (s: SimState, body: CommandBody) =>
  applyCommand(s, { ...body, id: `o149-${(seq += 1)}` } as Command);

const sumStore = (store: Record<string, number>) =>
  Object.values(store).reduce((total, qty) => total + (qty ?? 0), 0);

function firstFree(s: SimState): number {
  for (let t = 0; t < YARD_TILES; t += 1) {
    if (t !== DOCK_TILE && !s.machines.some((m) => m.tile === t)) return t;
  }
  return 8;
}

/** Build a blueprint on a free tile and auto-connect its routes (the real path). */
function build(s: SimState, blueprint: string): number {
  const tile = firstFree(s);
  const result = send(s, { type: "machine.build", blueprint, tile });
  expect(result.ok, `build ${blueprint}: ${JSON.stringify(result)}`).toBe(true);
  const id = s.machines[s.machines.length - 1].id;
  for (const plan of planConnections(s, id)) {
    send(s, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
  }
  return id;
}

/** The lesson the coach would paint, and the invariant that it shares the goal. */
function expectLesson(s: SimState, id: string, topic: string) {
  const lesson = lessonFor(s);
  expect(lesson, `lesson at tutorial ${s.tutorial}`).not.toBeNull();
  expect(lesson!.id).toBe(id);
  expect(lesson!.topic).toBe(topic);
  // U05: the coach's "what" is the objective card's line, verbatim — one goal.
  expect(lesson!.what).toBe(objectiveFor(s));
  expect(lesson!.why.length).toBeGreaterThan(0);
  expect(lesson!.next.length).toBeGreaterThan(0);
  return lesson!;
}

/** Six manual pulses then a repair: the real boot cadence to first delivery. */
function bootToRepair(s: SimState) {
  for (let i = 0; i < 6; i += 1) {
    send(s, { type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
  send(s, { type: "drone.repair" });
}

/** Persist a yard through the game's own encoder; the reference clock skips catch-up. */
function storeFromState(state: SimState): GameStore {
  const seen = Date.now();
  const text = encodeSave(state, seen, { ...DEFAULT_SETTINGS, muted: true });
  const map = new Map<string, string>([[SAVE_KEY, text]]);
  return createStore({
    storage: {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => map.set(key, value),
    },
    now: () => Date.now(),
  });
}

const writeOnlyContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (prop === "canvas" ? undefined : () => undefined),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

let root: Root | null = null;
function mountApp(store: GameStore): HTMLElement {
  const host = document.createElement("div");
  host.id = "root";
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<App store={store} />);
  });
  return host;
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}
const begin = () => act(() => findButton("Begin recovery")?.click());
const coach = () => document.querySelector<HTMLElement>('[data-onboard="lesson"]');

/** Every action face inside the painted coach (the census the U05 row asks for). */
function coachButtons(): string[] {
  return [...(coach()?.querySelectorAll("button") ?? [])].map((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim()
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  for (const style of [...document.head.querySelectorAll("style")]) style.remove();
  for (const raw of [stylesRaw, hudCssRaw, shellRaw, onboardCssRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(writeOnlyContext);
  try {
    globalThis.localStorage?.removeItem("rustwake.onboard.v1");
  } catch {
    /* jsdom storage may be unavailable; the coach defaults to visible. */
  }
});

afterEach(() => {
  if (root !== null) {
    const dying = root;
    root = null;
    act(() => dying.unmount());
  }
  vi.restoreAllMocks();
});

describe("RW3D #149 (U05): the lesson ladder follows the engine-driven opening journey", () => {
  it("paints a contextual lesson at every real stage, each sharing the objective verbatim", () => {
    const s = createInitialState();
    // The #214 opening seed: scrap 120 / ferrous 12 / steel 12, credits 60.
    expect(s.credits).toBe(60);
    expect(s.store.scrap).toBe(120);
    expect(s.store.steel).toBe(12);
    expectLesson(s, "tutorial-0", "salvage");

    send(s, { type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
    expectLesson(s, "tutorial-1", "salvage");

    for (let i = 0; i < 5; i += 1) {
      send(s, { type: "manual.salvage" });
      advance(s, TUNING.manualPulseTicks);
    }
    expectLesson(s, "tutorial-2", "salvage");

    // Repair, then the storage lesson paints while the first delivery is in flight.
    send(s, { type: "drone.repair" });
    advance(s, 1);
    expect(s.tutorial).toBe(3);
    expectLesson(s, "tutorial-3", "storage");
    advance(s, 10);
    expectLesson(s, "tutorial-3", "storage");

    // First delivery lands -> the build lesson.
    advance(s, 251);
    expect(fleetDeliveries(s)).toBeGreaterThanOrEqual(1);
    expectLesson(s, "tutorial-4", "build");

    // Sorter built but not yet connected -> the connect lesson paints (player-paced).
    const tile = firstFree(s);
    send(s, { type: "machine.build", blueprint: "sorter", tile });
    const mid = s.machines[s.machines.length - 1].id;
    advance(s, 1);
    expectLesson(s, "tutorial-5", "connect");

    // Connecting routes collapses 6->7->8 in one sync pass (characterized below).
    for (const plan of planConnections(s, mid)) {
      send(s, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    advance(s, 1);
    expectLesson(s, "tutorial-8", "upgrade");
  });

  it("a progressed yard is led by its current state, never forced back to beginner steps", () => {
    const s = createInitialState();
    bootToRepair(s);
    advance(s, 262);
    build(s, "sorter");
    advance(s, 400);
    expect(s.tutorial).toBeGreaterThanOrEqual(8);
    const lesson = lessonFor(s)!;
    expect(lesson.id.startsWith("tutorial-0")).toBe(false);
    expect(lesson.id.startsWith("tutorial-1")).toBe(false);
    expect(lesson.what).toBe(objectiveFor(s));

    // A finished tutorial with Research still locked is led by the research path
    // (the fresh-yard finding); its goal line is the shared research goal, not the
    // tutorial objective (the verbatim invariant is for tutorial-N / yard-* lessons).
    s.tutorial = 9;
    const research = lessonFor(s)!;
    expect(research.id).toBe("research-path");
    expect(research.topic).toBe("research");
    expect(research.researchPath).toBe(true);
    expect(research.what).toBe(ONBOARD_COPY.researchGoal);

    // Once Data unlocks Research, the yard ladder leads by current state instead.
    s.store = { ...s.store, data: 12 };
    s.storeUnits = sumStore(s.store);
    const unlocked = lessonFor(s)!;
    expect(unlocked.id.startsWith("yard-")).toBe(true);
    expect(unlocked.researchPath).toBe(false);
    expect(unlocked.what).toBe(objectiveFor(s));
  });
});

describe("RW3D #149 (U05): the coach has no universal next/advance button", () => {
  it("the opening-seed coach offers only Skip — the next line is text, not a control", () => {
    mountApp(storeFromState(createInitialState()));
    begin();
    expect(coach()).not.toBeNull();
    expect(coach()!.getAttribute("data-lesson")).toBe("tutorial-0");
    expect(coach()!.getAttribute("data-topic")).toBe("salvage");
    const faces = coachButtons();
    expect(faces).toEqual([ONBOARD_COPY.skipAria]);
    // No generic ladder control anywhere in the coach.
    for (const label of faces) {
      expect(label.toLowerCase()).not.toMatch(/next|advance|continue|forward/);
    }
    // The "next" guidance is a paragraph, never a button.
    expect(coach()!.querySelector(".onboard__next")?.tagName).toBe("P");
  });

  it("a progressed yard's coach still offers only Skip (no advance up the ladder)", () => {
    const s = createInitialState();
    bootToRepair(s);
    advance(s, 262);
    build(s, "sorter");
    advance(s, 400);
    s.store = { ...s.store, data: 12 };
    s.storeUnits = sumStore(s.store);
    mountApp(storeFromState(s));
    begin();
    expect(coach()).not.toBeNull();
    const faces = coachButtons();
    expect(faces).toEqual([ONBOARD_COPY.skipAria]);
    for (const label of faces) {
      expect(label.toLowerCase()).not.toMatch(/next|advance|continue|forward/);
    }
  });
});

describe("RW3D #149 (U05): the inherited #214 trade-lesson vacuity, characterized", () => {
  it("the opening seed collapses gates 6->7->8 in a single sync pass", () => {
    const s = createInitialState();
    bootToRepair(s);
    advance(s, 262);
    // Build a sorter and a furnace so steel is spent, then hold steel at zero to
    // isolate gate 6->7: with steel 0 the tutorial rests at 6 (the refine lesson).
    build(s, "sorter");
    build(s, "furnace");
    build(s, "furnace");
    advance(s, 1);
    expect(s.store.steel ?? 0).toBe(0);
    expect(s.tutorial).toBe(6);
    expectLesson(s, "tutorial-6", "build");

    // The moment the furnace makes steel, 6->7 (steel>0) and 7->8 (credits 60>0)
    // fire in the SAME pass: tutorial-7 never persists across a tick boundary.
    let guard = 0;
    while ((s.store.steel ?? 0) === 0 && guard < 2000) {
      advance(s, 1);
      guard += 1;
    }
    expect(s.store.steel ?? 0).toBeGreaterThan(0);
    expect(s.credits).toBe(60);
    expect(s.tutorial).toBe(8); // truthful pin: 7 was skipped, not painted
  });

  it("no credit sink reachable before the first sale zeroes the 60-credit purse", () => {
    const s = createInitialState();
    bootToRepair(s);
    advance(s, 262);
    const tile = firstFree(s);
    send(s, { type: "machine.build", blueprint: "sorter", tile });
    const mid = s.machines[s.machines.length - 1].id;

    // Machines build at level 1: the first upgrade costs 30, the next 35.
    expect(upgradeCost(30, 1)).toBe(30);
    expect(upgradeCost(30, 2)).toBe(35);
    const first = send(s, { type: "machine.upgrade", machineId: mid });
    expect(first.ok).toBe(true);
    expect(s.credits).toBe(30);
    // 30 + 35 = 65 > 60: a second upgrade is refused, so the purse cannot reach 0.
    const second = send(s, { type: "machine.upgrade", machineId: mid });
    expect(second).toMatchObject({ ok: false, reason: "insufficient", need: 35, have: 30 });
    // The spare drone (45) is likewise out of reach at 30 credits.
    const drone = send(s, { type: "drone.add" });
    expect(drone).toMatchObject({ ok: false, reason: "insufficient", need: 45, have: 30 });
    expect(s.credits).toBe(30);
    // Any sale only ADDS credits, so gate 7 (credits>0) can never be held open.
  });

  it("the trade lesson itself is correct and reachable from a save at tutorial-7", () => {
    // The gap is the engine gate under the retuned seed, not the lesson: with the
    // counter held at 7 and an empty purse, lessonFor paints the trade topic and
    // shares the export objective verbatim.
    const s = createInitialState();
    s.tutorial = 7;
    s.credits = 0;
    const lesson = expectLesson(s, "tutorial-7", "trade");
    expect(lesson.what).toBe(objectiveFor(s));
    expect(lesson.researchPath).toBe(false);
  });
});
