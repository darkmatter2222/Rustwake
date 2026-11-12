import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import hudCssRaw from "../../src/ui/hud/hud.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import buildCssRaw from "../../src/ui/build/build.css?raw";
import placeCssRaw from "../../src/ui/place/place.css?raw";
import onboardCssRaw from "../../src/ui/onboard/onboard.css?raw";
import inspectorCssRaw from "../../src/ui/inspector/inspector.css?raw";
import { App, showResearch } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, SAVE_KEY, encodeSave } from "../../src/game/persistence/save";
import { nextFreeTile, objectiveFor } from "../../src/ui/text";
import { tileToWorld } from "../../src/game/renderer/scene";
import {
  DATA_CHAIN,
  hasResearchAccess,
  lessonFor,
  researchPath,
} from "../../src/ui/onboard/lessons";
import { GLOSSARY, ONBOARD_COPY, TOPIC_LABELS } from "../../src/ui/onboard/copy";
import { constraintCards, constraintNotes } from "../../src/ui/inspector/model";
import { COPY as INSPECTOR_COPY } from "../../src/ui/inspector/copy";
import { MachinePanel } from "../../src/ui/panels/MachinePanel";

/**
 * UI-RESET-64: onboarding, contextual help and recovery guidance, exercised through the
 * real App in jsdom. Every interaction is a click on a painted face; fixture yards are
 * seeded with the engine's own `applyCommand` and persisted through `encodeSave` exactly
 * like place-53 / build-52, with `lastSeenMs` as the reference clock so no offline catch-up
 * moves the yard. The lesson read model (`lessonFor`) is also asserted pure, against the
 * authoritative `state.tutorial` machine and the shared yard ladder.
 *
 * Acceptance reads:
 *  (1) the seven topics are taught through contextual steps tied to the tutorial machine;
 *  (2) what / why / next are shown without obscuring the world; skip/revisit persists and a
 *      progressed yard is led by its current state, never forced back through beginner steps;
 *  (3) bottleneck jargon becomes a concise headline with the full sentence as expandable detail;
 *  (4) the place-mode earn trap (#41) gets a reachable one-tap recovery instead of refusals;
 *  (5) the fresh-yard finding (6821970539) is answered by research-path guidance to first Data
 *      WITHOUT weakening the showResearch gate (the read-only mirror equals the gate).
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const sumStore = (store: Record<string, number>): number =>
  Object.values(store).reduce((total, qty) => total + qty, 0);

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    raw: map,
  };
}

/** Persist a seeded yard through the game's own encoder; the reference clock skips catch-up. */
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

/** A progressed yard (tutorial complete) built by the real engine, with optional Data. */
function progressedState(opts: { data?: number; empty?: boolean; scrap?: number } = {}): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  let seq = 0;
  const send = (body: CommandBody) =>
    applyCommand(state, { ...body, id: `seed${(seq += 1)}` } as Command);
  if (!opts.empty) {
    for (const item of BLUEPRINTS.sorter.buildCost) {
      state.store[item.resource] = (state.store[item.resource] ?? 0) + item.qty;
    }
    state.storeUnits = sumStore(state.store);
    send({ type: "machine.build", blueprint: "sorter", tile: 8 });
  }
  state.store.scrap = (state.store.scrap ?? 0) + (opts.scrap ?? 100);
  if (opts.data) state.store.data = (state.store.data ?? 0) + opts.data;
  state.storeUnits = sumStore(state.store);
  return state;
}

function mount(store: GameStore): HTMLElement {
  const host = document.createElement("div");
  host.id = "root";
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<App store={store} />);
  });
  return host;
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}
const click = (label: string) => act(() => findButton(label)?.click());
const begin = () => click("Begin recovery");

const coach = () => document.querySelector<HTMLElement>("[data-onboard]");
const lessonEl = () => document.querySelector<HTMLElement>('[data-onboard="lesson"]');
const recoverEl = () => document.querySelector<HTMLElement>('[data-onboard="recover"]');

const dockFaces = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".dock .dock__btn")].map((node) =>
    (node.textContent ?? "").replace(/\s+/g, " ").trim()
  );
function tapDockExact(label: string): void {
  const face = [...document.querySelectorAll<HTMLButtonElement>(".dock .dock__btn")].find(
    (node) => (node.firstChild?.textContent ?? "").trim() === label
  );
  expect(face, `dock faces ${JSON.stringify(dockFaces())}`).toBeDefined();
  act(() => face!.click());
}
const catalog = () => document.querySelector<HTMLElement>(".catalog");
function catalogButton(label: string): HTMLButtonElement | undefined {
  return [...(catalog()?.querySelectorAll("button") ?? [])].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}
const card = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.catalog__card[data-blueprint="${id}"]`);

/** Arm the placement preview through the real catalog path; an unaffordable pick keeps the
 * ghost armed underneath (Close catalog), so the coach can name the shortfall + recovery. */
function armPlacement(blueprint = "sorter"): void {
  tapDockExact("Build");
  act(() => card(blueprint)!.click());
  const place = catalogButton("Place");
  if (place && !place.disabled) {
    act(() => place.click());
  } else {
    act(() => catalogButton("Close catalog")!.click());
  }
}

const canvas = () => document.querySelector("canvas") as HTMLCanvasElement;
async function frame() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
function tapTile(tile: number, id = 1): void {
  const [cx, cy, scale] = (canvas().dataset.cam ?? "").split(",").map(Number);
  const world = tileToWorld(tile);
  const x = (world.x - cx) * scale;
  const y = (world.y - cy) * scale;
  for (const type of ["pointerdown", "pointerup"] as const) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: id });
    act(() => canvas().dispatchEvent(event));
  }
}

/** jsdom ships no 2D canvas; a write-only proxy lets the real paint loop stamp dataset.cam. */
const writeOnlyContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (prop === "canvas" ? undefined : () => undefined),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  document.body.innerHTML = "";
  for (const style of [...document.head.querySelectorAll("style")]) style.remove();
  for (const raw of [stylesRaw, hudCssRaw, shellRaw, buildCssRaw, placeCssRaw, onboardCssRaw, inspectorCssRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(writeOnlyContext);
  try {
    globalThis.localStorage?.removeItem("rustwake.onboard.v1");
  } catch {
    /* jsdom storage is present; ignore a blocked clear. */
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-RESET-64 (1) contextual lessons tied to the tutorial machine", () => {
  it("paints a salvage lesson inside the lead block on a fresh yard, sharing the objective's goal", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    begin();
    const el = lessonEl();
    expect(el).not.toBeNull();
    // It lives in the lead block (so the camera reserves its band), after the objective card.
    expect(host.querySelector(".hud__lead [data-onboard]")).not.toBeNull();
    expect(el!.dataset.topic).toBe("salvage");
    expect(el!.dataset.lesson).toBe("tutorial-0");
    const state = store.getState();
    expect(el!.querySelector(".onboard__what")?.textContent).toBe(objectiveFor(state));
    expect(el!.querySelector(".onboard__why")?.textContent).toContain(ONBOARD_COPY.whyLabel);
    expect(el!.querySelector(".onboard__next")?.textContent).toContain(ONBOARD_COPY.nextLabel);
    // The badge names the topic in the player's vocabulary.
    expect(el!.querySelector(".onboard__badge")?.textContent).toContain(TOPIC_LABELS.salvage);
  });

  it("walks the seven topics across the tutorial steps (pure read model)", () => {
    const expected: Array<[number, string]> = [
      [0, "salvage"],
      [1, "salvage"],
      [2, "salvage"],
      [3, "storage"],
      [4, "build"],
      [5, "connect"],
      [6, "build"],
      [7, "trade"],
      [8, "upgrade"],
    ];
    for (const [step, topic] of expected) {
      const state = createInitialState();
      state.tutorial = step;
      const lesson = lessonFor(state);
      expect(lesson.id).toBe(`tutorial-${step}`);
      expect(lesson.topic).toBe(topic);
      expect(lesson.what).toBe(objectiveFor(state));
      expect(lesson.why.length).toBeGreaterThan(0);
      expect(lesson.next.length).toBeGreaterThan(0);
      expect(lesson.researchPath).toBe(false);
    }
    // Every topic the acceptance names is reachable from the read model.
    const topics = new Set(expected.map(([, topic]) => topic));
    for (const topic of ["salvage", "build", "connect", "storage", "trade", "upgrade"]) {
      expect(topics.has(topic)).toBe(true);
    }
    expect(TOPIC_LABELS.research).toBe("Research");
  });

  it("offers an expandable detail carrying the shared vocabulary", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    const detail = lessonEl()!.querySelector<HTMLDetailsElement>(".onboard__detail");
    expect(detail).not.toBeNull();
    expect(detail!.open).toBe(false); // collapsed by default — never obscures the world
    expect(detail!.querySelector("summary")?.textContent).toBe(ONBOARD_COPY.detailSummary);
    const body = detail!.querySelector(".onboard__detail-body")?.textContent ?? "";
    for (const entry of GLOSSARY) {
      expect(body).toContain(`${entry.term}:`);
    }
    act(() => {
      detail!.open = true;
    });
    expect(detail!.open).toBe(true);
  });
});

describe("UI-RESET-64 (2) skip / revisit and respect for existing progress", () => {
  it("skip hides the coach and persists; show revisits; a reload keeps the preference", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10 });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<App store={store} />));
    begin();
    expect(lessonEl()).not.toBeNull();
    click("Skip lessons");
    expect(lessonEl()).toBeNull();
    expect(coach()?.dataset.onboard).toBe("hidden");
    // The preference lives in its own UI localStorage key, never in the game save.
    expect(globalThis.localStorage.getItem("rustwake.onboard.v1") ?? "").toContain('"hidden":true');
    expect(storage.raw.get(SAVE_KEY) ?? "").not.toContain("rustwake.onboard");

    // The Show face is named by its aria-label ("Show the yard lessons again"), not its text.
    click("Show the yard lessons again");
    expect(lessonEl()).not.toBeNull();
    expect(globalThis.localStorage.getItem("rustwake.onboard.v1") ?? "").toContain('"hidden":false');

    // Skip again, unmount cleanly, then a fresh writer store boots hidden: the revisit
    // preference survives a reload because it is read from localStorage on mount (a fresh
    // game storage avoids the two-tab lease artifact; the UI pref key is the shared one).
    click("Skip lessons");
    act(() => root.unmount());
    host.remove();
    const second = createStore({ storage: memoryStorage(), now: () => 20 });
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    const root2 = createRoot(host2);
    act(() => root2.render(<App store={second} />));
    begin();
    expect(lessonEl()).toBeNull();
    expect(coach()?.dataset.onboard).toBe("hidden");
    act(() => root2.unmount());
  });

  it("leads a progressed yard by its current state, never the beginner steps", () => {
    const state = progressedState({ data: 5 });
    const lesson = lessonFor(state);
    expect(lesson.id.startsWith("yard-")).toBe(true);
    expect(lesson.id.startsWith("tutorial-")).toBe(false);
    expect(lesson.researchPath).toBe(false);
    expect(lesson.what).toBe(objectiveFor(state));
    // Research already unlocked is taught as an open topic, not the locked fresh-yard path.
    expect(showResearch(state)).toBe(true);
    expect(hasResearchAccess(state)).toBe(true);
  });

  it("yields entirely in a started reader yard (coaching would be noise)", () => {
    const storage = memoryStorage();
    const clock = 10;
    const first = createStore({ storage, now: () => clock, leaseId: "tab-a" });
    first.dispatch({ id: "m1", type: "manual.salvage" });
    first.step(36);
    const second = createStore({ storage, now: () => clock, leaseId: "tab-b" });
    expect(second.getRole()).toBe("reader");
    const host = mount(second);
    begin();
    // The yard is started (the objective card paints the reader banner) yet the coach yields.
    expect(host.querySelector(".objective")).not.toBeNull();
    expect(second.getRole()).toBe("reader");
    expect(coach()).toBeNull();
  });
});

describe("UI-RESET-64 (3) concise bottleneck headlines with expandable detail", () => {
  it("constraintCards detail equals constraintNotes exactly, in priority order", () => {
    const state = progressedState({ empty: true, scrap: 0 });
    // Build an isolated, starved sorter so several constraints hold at once.
    for (const item of BLUEPRINTS.sorter.buildCost) {
      state.store[item.resource] = (state.store[item.resource] ?? 0) + item.qty;
    }
    state.storeUnits = sumStore(state.store);
    applyCommand(state, { id: "b", type: "machine.build", blueprint: "sorter", tile: 8 });
    state.store.scrap = 0;
    state.storeUnits = sumStore(state.store);
    const machine = state.machines[0];
    machine.status = "starved";
    const cards = constraintCards(state, machine, 0.5);
    const notes = constraintNotes(state, machine, 0.5);
    expect(cards.map((c) => c.detail)).toEqual(notes);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.short.length).toBeGreaterThan(0);
      expect(card.short).not.toBe(card.detail);
    }
  });

  it("renders each bottleneck as a concise summary plus the full sentence in the detail", () => {
    const state = progressedState({ empty: true, scrap: 0 });
    for (const item of BLUEPRINTS.sorter.buildCost) {
      state.store[item.resource] = (state.store[item.resource] ?? 0) + item.qty;
    }
    state.storeUnits = sumStore(state.store);
    applyCommand(state, { id: "b", type: "machine.build", blueprint: "sorter", tile: 8 });
    state.store.scrap = 0;
    state.storeUnits = sumStore(state.store);
    const machine = state.machines[0];
    machine.status = "starved";

    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(
        <MachinePanel
          state={state}
          machine={machine}
          tick={state.tick}
          powerRatio={0.5}
          dispatch={() => undefined}
          onClose={() => undefined}
        />
      );
    });
    const disclosures = [...host.querySelectorAll<HTMLDetailsElement>(".inspector-constraint")];
    expect(disclosures.length).toBeGreaterThan(0);
    const notes = constraintNotes(state, machine, 0.5);
    const painted = [...host.querySelectorAll<HTMLElement>(".inspector-note--constraint")].map(
      (n) => n.textContent ?? ""
    );
    // The full diagnostic sentences are unchanged and still carry the engine's numbers.
    expect(painted).toEqual(notes);
    for (const d of disclosures) {
      const summary = d.querySelector(".inspector-constraint__summary")?.textContent ?? "";
      expect(summary.length).toBeGreaterThan(0);
      expect(d.open).toBe(false);
      // The summary is a native disclosure, not a button — the action-face census never counts it.
      expect(d.querySelector("button")).toBeNull();
    }
    // The first headline is the concise missing-input phrase, not the diagnostic jargon.
    expect(disclosures[0].querySelector(".inspector-constraint__summary")?.textContent).toBe(
      INSPECTOR_COPY.constraintHeads.missingInput
    );
  });
});

describe("UI-RESET-64 (4) reachable recovery from the place-mode earn trap (#41)", () => {
  it("shows one-tap earn recovery while an unaffordable build is aimed, and salvage really earns", async () => {
    const state = progressedState({ empty: true, scrap: 5 });
    const store = storeFromState(state);
    mount(store);
    begin();
    await frame();
    armPlacement("sorter"); // 5 scrap < 20 price → ghost stays armed, shortfall named
    tapTile(20); // aim a free cell: the real earn-trap window (cell fine, purse short)
    expect(recoverEl()).not.toBeNull();
    expect(recoverEl()!.querySelector(".onboard__recover-short")?.textContent).toContain("Need 20");
    const earn = findButton("Earn scrap now");
    const trade = findButton("Trade at the store");
    expect(earn).toBeDefined();
    expect(trade).toBeDefined();

    const before = store.getState().store.scrap ?? 0;
    act(() => earn!.click());
    const after = store.getState().store.scrap ?? 0;
    // A real manual.salvage through store.dispatch pays the engine's own per-pulse scrap.
    expect(after - before).toBe(TUNING.manualSalvagePerPulse);
  });

  it("the trade recovery opens the Store panel", async () => {
    const state = progressedState({ empty: true, scrap: 5 });
    const store = storeFromState(state);
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    expect(document.querySelector(".panel--store")).toBeNull();
    click("Trade at the store");
    expect(document.querySelector(".panel--store")).not.toBeNull();
  });

  it("names the reachable recovery on the placement preview itself (text-only)", async () => {
    const state = progressedState({ empty: true, scrap: 5 });
    const store = storeFromState(state);
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    const earn = document.querySelector('[data-flow="placement"] .place-strip__earn');
    expect(earn).not.toBeNull();
    expect(earn!.textContent).toContain("salvage");
    // The recovery hint is a plain sentence, not a new button — the strip's committing faces
    // (Confirm / Cancel) are unchanged, so the dock row stays a single committing tap.
    expect(earn!.tagName).toBe("P");
    expect(earn!.querySelector("button")).toBeNull();
  });

  it("hides the recovery row once the build is affordable", async () => {
    const state = progressedState({ empty: true, scrap: 200 });
    const store = storeFromState(state);
    mount(store);
    begin();
    await frame();
    armPlacement("sorter");
    tapTile(20);
    expect(recoverEl()).toBeNull();
    expect(document.querySelector('[data-flow="placement"] .place-strip__earn')).toBeNull();
  });
});

describe("UI-RESET-64 (5) fresh-yard research guidance without weakening the gate", () => {
  it("teaches the path to first Data on a fresh completed yard, gate still locked", () => {
    const state = progressedState({ empty: true, scrap: 0 });
    expect(state.store.data ?? 0).toBe(0);
    expect(Object.keys(state.research ?? {}).length).toBe(0);
    // The gate is intact: Research is NOT reachable yet.
    expect(showResearch(state)).toBe(false);
    expect(hasResearchAccess(state)).toBe(false);

    const lesson = lessonFor(state);
    expect(lesson.researchPath).toBe(true);
    expect(lesson.topic).toBe("research");
    expect(lesson.what).toBe(ONBOARD_COPY.researchGoal);
    expect(lesson.detail).toContain(ONBOARD_COPY.researchChainTitle);
    // The first unbuilt link on an empty yard is the sorter, with its real price + purpose.
    const path = researchPath(state);
    expect(path.needed).toBe(DATA_CHAIN[0]);
    expect(path.cost.length).toBeGreaterThan(0);
    expect(path.purpose.length).toBeGreaterThan(0);
    expect(lesson.next).toContain(BLUEPRINTS.sorter.label);
  });

  it("paints the research-path lesson in the shell and keeps the dock Research face gated", () => {
    const state = progressedState({ empty: true, scrap: 0 });
    const store = storeFromState(state);
    const host = mount(store);
    begin();
    const el = lessonEl();
    expect(el).not.toBeNull();
    expect(el!.dataset.researchPath).toBe("true");
    expect(el!.dataset.topic).toBe("research");
    expect(el!.querySelector(".onboard__what")?.textContent).toBe(ONBOARD_COPY.researchGoal);
    // The dock never offers Research while the gate is closed (no weakened face).
    expect(showResearch(store.getState())).toBe(false);
    expect(host.querySelector(".hud__lead [data-onboard]")).not.toBeNull();
  });

  it("the read-only mirror equals the showResearch gate across states", () => {
    const cases: SimState[] = [
      progressedState({ empty: true, scrap: 0 }), // no data, no research
      progressedState({ data: 1 }), // data > 0
      progressedState({ empty: true, scrap: 0 }), // mutated below to own research
    ];
    cases[2].research = { someNode: 1 } as SimState["research"];
    for (const state of cases) {
      expect(hasResearchAccess(state)).toBe(showResearch(state));
    }
  });

  it("advances the research path as the chain is built, and unlocks once Data lands", () => {
    const state = progressedState({ empty: true, scrap: 0 });
    expect(researchPath(state).needed).toBe("sorter");
    // Build the whole Data chain through the real engine; the bottleneck walks forward.
    for (const id of DATA_CHAIN) {
      for (const item of BLUEPRINTS[id].buildCost) {
        state.store[item.resource] = (state.store[item.resource] ?? 0) + item.qty;
      }
      state.storeUnits = sumStore(state.store);
      const tile = nextFreeTile(state);
      const result = applyCommand(state, { id: `b${id}`, type: "machine.build", blueprint: id, tile });
      expect(result.ok).toBe(true);
    }
    // Every chain machine built, but no Data yet → waiting, gate still closed.
    expect(researchPath(state).waiting).toBe(true);
    expect(researchPath(state).needed).toBeNull();
    expect(showResearch(state)).toBe(false);
    expect(lessonFor(state).next).toBe(ONBOARD_COPY.researchWaiting);
    // First Data lands → the gate opens and the mirror agrees.
    state.store.data = 2;
    state.storeUnits = sumStore(state.store);
    expect(showResearch(state)).toBe(true);
    expect(hasResearchAccess(state)).toBe(true);
    expect(lessonFor(state).researchPath).toBe(false);
  });
});

describe("UI-RESET-64 census safety", () => {
  it("reuses no census class and leaves the first objective / status line untouched", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    begin();
    const el = coach()!;
    for (const cls of ["objective", "status-line", "dock", "dock__btn", "panel", "place-strip", "resources__item", "catalog"]) {
      expect(el.classList.contains(cls)).toBe(false);
      expect(el.querySelector(`.${cls}`)).toBeNull();
    }
    // The coach is not a role=status region (the primitives census counts those).
    expect(el.getAttribute("role")).not.toBe("status");
    // The objective card still precedes the coach in the lead block.
    const lead = host.querySelector(".hud__lead")!;
    const objective = lead.querySelector(".objective");
    expect(objective).not.toBeNull();
    expect(objective!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("paints no raw translation-key shapes in the coach copy", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    const KEY_PATTERN =
      /\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/;
    const text = coach()!.textContent ?? "";
    expect(KEY_PATTERN.test(text)).toBe(false);
  });
});