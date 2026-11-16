import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { Toast } from "../../src/ui/Hud";
import { createStore, type GameStore } from "../../src/app/store";
import { TUNING } from "../../src/game/content/defs";
import stylesRaw from "../../src/ui/styles.css?raw";

/**
 * UI-RESET-65: interaction-feedback unification.
 *
 * c1 press feedback — the dock/gate/blueprint/objective faces gain the same pressed
 *    wash and hover border the icon buttons already use (background/border only).
 * c2 grouped notifications — repeated identical readouts increment one toast's count
 *    and restart its window once per group, instead of re-firing a toast per refused
 *    tap. The count is painted by a ::after pseudo-element keyed on data-count, so the
 *    live-region text stays the single bare sentence: no re-announcement spam, and every
 *    pinned readout elsewhere keeps passing. The persistent `Last …` line is untouched.
 * c3 reduced motion reaches CSS — the effective value (player setting OR live OS
 *    preference) is mirrored onto :root[data-reduced-motion], and one stylesheet block
 *    disables every chrome transition so the in-app toggle matches the OS media query.
 *
 * Audio (c4) is verified by tests/game/audio.test.ts and the headless graphSnapshot
 * probe; the empty/loading/locked/error/reader matrix (c5) is the audit deliverable.
 */

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

/** Matches the accessible name: the aria-label when present, else the text. */
function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

let root: Root | null = null;
function mount(store: GameStore): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<App store={store} />);
  });
  return host;
}

/**
 * Begin + six pulses + one successful drone repair, WITHOUT a trailing step: the repair
 * button must still be on screen so the next taps are the same duplicate reject. (A step
 * here would advance the tutorial to the build phase and retire the button.)
 */
function beginAndRepairDrone(store: GameStore): void {
  act(() => findButton("Begin recovery")?.click());
  for (let i = 0; i < 6; i += 1) {
    act(() => findButton("Salvage")?.click());
    act(() => store.step(TUNING.manualPulseTicks));
  }
  act(() => findButton("Repair drone")?.click());
}

const toastNode = () => document.querySelector<HTMLElement>(".toast");

describe("UI-RESET-65 c2 grouped toast (component)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-reduced-motion");
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("renders a single readout byte-identical, with data-count 1", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const r = createRoot(host);
    act(() => r.render(<Toast text="Need 20 scrap · have 0" count={1} onDone={() => {}} />));
    const node = host.querySelector<HTMLElement>(".toast");
    expect(node?.textContent).toBe("Need 20 scrap · have 0");
    expect(node?.getAttribute("data-count")).toBe("1");
    act(() => r.unmount());
  });

  it("tracks the group on data-count while the text stays bare, and restarts the window per group", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const r = createRoot(host);
    const done = vi.fn();
    act(() => r.render(<Toast text="Already connected" count={1} onDone={done} />));
    expect(host.querySelector(".toast")?.textContent).toBe("Already connected");
    expect(host.querySelector(".toast")?.getAttribute("data-count")).toBe("1");

    // 1.7 s into the first window: still up, not yet dismissed.
    act(() => vi.advanceTimersByTime(1700));
    expect(done).not.toHaveBeenCalled();

    // The same sentence repeats: the count climbs, the live-region text stays bare
    // (the ×N is generated content), and the timer restarts.
    act(() => r.render(<Toast text="Already connected" count={2} onDone={done} />));
    expect(host.querySelector(".toast")?.textContent).toBe("Already connected");
    expect(host.querySelector(".toast")?.getAttribute("data-count")).toBe("2");

    // 1.7 s after the repeat: the original 1.8 s window would have lapsed, but the
    // group restarted it, so the toast is still on screen and not dismissed.
    act(() => vi.advanceTimersByTime(1700));
    expect(done).not.toHaveBeenCalled();
    expect(host.querySelector(".toast")).not.toBeNull();

    // Past the restarted window: dismissed exactly once.
    act(() => vi.advanceTimersByTime(200));
    expect(done).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  });
});

describe("UI-RESET-65 c2 grouped toast (real command path)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-reduced-motion");
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("groups repeated identical rejects into one toast and starts a fresh group after the window lapses", () => {
    vi.useFakeTimers();
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    beginAndRepairDrone(store);

    // The drone is already repaired: each further tap is the same duplicate reject.
    act(() => findButton("Repair drone")?.click());
    expect(toastNode()?.textContent).toBe("Already connected");
    expect(toastNode()?.getAttribute("data-count")).toBe("1");

    act(() => findButton("Repair drone")?.click());
    // One toast, not two: the repeat is grouped, and the live-region text stays the bare
    // sentence (the ×N is generated content, never a DOM text node).
    expect(document.querySelectorAll(".toast")).toHaveLength(1);
    expect(toastNode()?.textContent).toBe("Already connected");
    expect(toastNode()?.getAttribute("data-count")).toBe("2");
    expect(document.querySelector(".toast__count")).toBeNull();

    // The grouped window lapses on its own; the sim frame loop does not pin it.
    act(() => vi.advanceTimersByTime(2000));
    expect(toastNode()).toBeNull();

    // After the window lapses the next identical reject starts a fresh group at one.
    // (The persistent `Last …` resting line is covered by TST-001 / DEF-006, which run
    // with grouping active and still pass; lastReject stays the bare sentence.)
    act(() => findButton("Repair drone")?.click());
    expect(toastNode()?.getAttribute("data-count")).toBe("1");
    expect(toastNode()?.textContent).toBe("Already connected");
  });

  it("resets the group to one when a different reject arrives", () => {
    vi.useFakeTimers();
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    beginAndRepairDrone(store);

    act(() => findButton("Repair drone")?.click());
    act(() => findButton("Repair drone")?.click());
    expect(toastNode()?.getAttribute("data-count")).toBe("2");

    // Advance to the build phase, empty the purse and the store so the next priced step
    // is a *different* reject (a numbered shortfall), then arm and place through the
    // real primary action.
    act(() => store.step(1));
    const s = store.getState();
    s.credits = 0;
    s.store = {};
    s.storeUnits = 0;
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
    const node = toastNode();
    expect(node?.getAttribute("data-count")).toBe("1");
    expect(node?.textContent ?? "").toMatch(/^Need \d+ \w+ · have \d+$/);
    expect(node?.textContent ?? "").not.toContain("×");
  });
});

describe("UI-RESET-65 c3 reduced motion reaches the CSS layer", () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-reduced-motion");
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    window.matchMedia = realMatchMedia;
    document.documentElement.removeAttribute("data-reduced-motion");
    document.body.innerHTML = "";
  });

  it("mirrors the player setting onto :root and clears it when toggled off", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBeNull();

    act(() => store.setSettings({ reducedMotion: true }));
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("true");

    act(() => store.setSettings({ reducedMotion: false }));
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBeNull();
  });

  it("the live OS preference forces the attribute even when the saved setting is off", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    store.setSettings({ reducedMotion: false });
    mount(store);
    expect(document.documentElement.getAttribute("data-reduced-motion")).toBe("true");
  });
});

describe("UI-RESET-65 c1/c3 shipped stylesheet", () => {
  it("extends the pressed wash and hover border to the faces that lacked them", () => {
    for (const selector of [
      ".dock__btn:active:not(:disabled)",
      ".gate__btn:active:not(:disabled)",
      ".blueprint:active:not(:disabled)",
      ".objective__btn:active:not(:disabled)",
      ".dock__btn:hover:not(:disabled)",
      ".gate__btn:hover:not(:disabled)",
      ".blueprint:hover:not(:disabled)",
      ".objective__btn:hover:not(:disabled)",
    ]) {
      expect(stylesRaw).toContain(selector);
    }
    // The pressed wash is the same cyan the icon buttons already use; no layout property.
    expect(stylesRaw).toContain("background-color: rgba(95, 216, 232, 0.16)");
  });

  it("paints the grouped count as generated content, leaving the live-region text bare", () => {
    expect(stylesRaw).toContain('.toast[data-count]:not([data-count="1"])::after');
    expect(stylesRaw).toContain('content: " ×" attr(data-count)');
  });

  it("disables every chrome transition under the reduced-motion root attribute", () => {
    for (const selector of [
      ':root[data-reduced-motion="true"] .wk-face',
      ':root[data-reduced-motion="true"] .wk-nav__face',
      ':root[data-reduced-motion="true"] .wk-sheet',
      ':root[data-reduced-motion="true"] .wk-dialog',
      ':root[data-reduced-motion="true"] .wk-inspector__section',
      ':root[data-reduced-motion="true"] .wk-amount',
      ':root[data-reduced-motion="true"] .wk-help',
      ':root[data-reduced-motion="true"] .wk-toast',
      ':root[data-reduced-motion="true"] .inspector-progress__fill',
      ':root[data-reduced-motion="true"] .logistics-gauge__fill',
    ]) {
      expect(stylesRaw).toContain(selector);
    }
    expect(stylesRaw).toContain("transition: none");
  });
});
