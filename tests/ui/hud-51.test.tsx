import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import hudCssRaw from "../../src/ui/hud/hud.css?raw";
import { App } from "../../src/ui/App";
import { MachinePanel } from "../../src/ui/Panels";
import { createStore, type GameStore } from "../../src/app/store";
import { RESOURCES, TUNING } from "../../src/game/content/defs";
import { RESOURCE_LABEL, STATUS_LABEL } from "../../src/ui/text";
import { hudNumber } from "../../src/ui/hud/format";
import { ALL_RESOURCES_ID } from "../../src/ui/hud/AllResources";

/**
 * UI-RESET-51: the rebuilt HUD against the live issue's acceptance criteria.
 *
 * Every read below is derived from the authoritative SimState the store publishes;
 * mutations go through `store.step` / `store.dispatch` so React re-renders exactly
 * as it does in the browser. The shipped sheets are injected because vitest stubs
 * CSS imports and the touch-target floor is a computed-value assertion.
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

function mount(store: GameStore): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<App store={store} />);
  });
  return host;
}

function start(): void {
  act(() => findButton("Begin recovery")?.click());
}

/** The proven tutorial walk: six pulses, repaired drone, one connected sorter. */
function walkToSorter(store: GameStore): void {
  start();
  for (let i = 0; i < 6; i += 1) {
    act(() => findButton("Salvage")?.click());
    act(() => store.step(TUNING.manualPulseTicks));
  }
  act(() => findButton("Repair drone")?.click());
  act(() => store.step(262));
  act(() => findButton("Build Scrap sorter")?.click());
  act(() => findButton("Build Scrap sorter")?.click());
  act(() => findButton("Connect dock to sorter")?.click());
}

/**
 * A persistently full store: the contents and the unit counter agree, so the
 * engine's incremental accounting keeps it full across ticks. Past the tutorial
 * and with the steel contract claimed, so the recovery path is the sell path.
 */
function fillStoreFull(store: GameStore, exportClaimed = true): void {
  const state = store.getState();
  state.store.plates = 880;
  state.store.scrap = 20;
  state.storeUnits = 900;
  state.exportClaimed = exportClaimed;
  state.tutorial = 9;
  act(() => store.step(1));
}

function chipTexts(): string[] {
  return [...document.querySelectorAll<HTMLElement>(".resources__item")].map(
    (node) => (node.textContent ?? "").trim()
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  for (const style of [...document.head.querySelectorAll("style")]) style.remove();
  for (const raw of [stylesRaw, hudCssRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
});

describe("UI-RESET-51 resource grouping and all-resource access", () => {
  it("groups credits, store and resources with shape icons, labels and hierarchy", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();

    const chips = [...host.querySelectorAll<HTMLElement>(".resources__item")];
    // Every chip carries a shape glyph (non-color identity) and a label + value pair.
    for (const chip of chips) {
      expect(chip.querySelector("svg")).not.toBeNull();
      expect(chip.querySelector("strong")).not.toBeNull();
    }
    const texts = chipTexts();
    // The pinned reads survive the rebuild verbatim.
    expect(texts.some((line) => /^Scrap0$/.test(line))).toBe(true);
    expect(texts.some((line) => /^Credits0$/.test(line))).toBe(true);
    expect(texts.some((line) => /^Store 0\/900$/.test(line))).toBe(true);

    const storeChip = host.querySelector<HTMLElement>(".resources__item--store");
    expect(storeChip?.getAttribute("data-pressure")).toBe("ok");
    expect(storeChip?.querySelector(".resources__warn")).toBeNull();
    // A healthy yard paints no cue chips and no alert.
    expect(host.querySelector("[data-cue]")).toBeNull();
    expect(host.querySelector(".hud-alert")).toBeNull();
  });

  it("offers all-resource access through a labeled toggle with authoritative counts", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    // Seed a couple of counts so the drawer proves it reads the store, not a constant.
    const state = store.getState();
    state.store.copper = 12;
    state.store.data = 1234567;
    act(() => store.step(1));

    const toggle = findButton("All resources");
    expect(toggle).toBeDefined();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBe(ALL_RESOURCES_ID);
    expect(host.querySelector(`#${ALL_RESOURCES_ID}`)).toBeNull();

    act(() => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    const drawer = host.querySelector<HTMLElement>(`#${ALL_RESOURCES_ID}`);
    expect(drawer).not.toBeNull();
    expect(drawer?.getAttribute("role")).toBe("group");
    expect(drawer?.getAttribute("aria-label")).toBe("All resources");

    const rows = [...(drawer?.querySelectorAll<HTMLElement>(".hud-all__row") ?? [])];
    expect(rows.length).toBe(RESOURCES.length);
    rows.forEach((row, index) => {
      const id = RESOURCES[index];
      expect(row.querySelector("svg")).not.toBeNull();
      expect(row.querySelector(".hud-all__label")?.textContent).toBe(RESOURCE_LABEL[id] ?? id);
      expect(row.querySelector(".hud-all__value")?.textContent).toBe(
        hudNumber(store.getState().store[id] ?? 0)
      );
    });

    // The toggle closes the drawer again; the chip budget is unchanged either way.
    const chipCount = host.querySelectorAll(".resources__item").length;
    act(() => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(`#${ALL_RESOURCES_ID}`)).toBeNull();
    expect(host.querySelectorAll(".resources__item").length).toBe(chipCount);
  });

  it("keeps Home the cluster's last child so the hide rule still applies (T08)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    const cluster = [...host.querySelectorAll<HTMLElement>(".cluster .icon-btn")];
    // T08 (#135): the rail is retired; the cluster gained the Settings gear.
    // Home stays the last child so `.cluster .icon-btn:last-child` keeps
    // hiding it at every width.
    expect(cluster.length).toBe(5);
    expect(cluster[cluster.length - 1].getAttribute("aria-label")).toBe("Return to yard view");
    expect(cluster[2].getAttribute("aria-label")).toBe("All resources");
    expect(cluster[3].getAttribute("aria-label")).toBe("Settings");
  });
});

describe("UI-RESET-51 capacity pressure and critical state cues", () => {
  it("marks the store chip and raises a live full alert naming the recovery", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    fillStoreFull(store);

    const storeChip = host.querySelector<HTMLElement>(".resources__item--store");
    expect(storeChip?.getAttribute("data-pressure")).toBe("full");
    // Non-color cue: a warning glyph rides beside the numbers.
    expect(storeChip?.querySelector(".resources__warn")).not.toBeNull();
    expect(storeChip?.querySelector("strong")?.textContent).toBe("900/900");

    const alert = host.querySelector<HTMLElement>(".hud-alert");
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("data-tier")).toBe("full");
    expect(alert?.getAttribute("role")).toBe("status");
    expect(alert?.querySelector(".hud-alert__text")?.textContent).toBe(
      "Store full · 900/900 · sell to free space"
    );
    expect(alert?.querySelector("svg")).not.toBeNull();
    // The alert is a sibling of the dock, not a dock face.
    expect(alert?.parentElement?.classList.contains("hud")).toBe(true);
    expect(alert?.querySelector(".dock__btn")).toBeNull();
    const action = findButton("Open store");
    expect(action?.classList.contains("objective__btn")).toBe(true);
    // The shell's touch-target floor holds for the new control too.
    expect(parseFloat(getComputedStyle(action as HTMLElement).minHeight)).toBeGreaterThanOrEqual(44);
  });

  it("names the contract-first recovery before the first steel contract", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    fillStoreFull(store, false);

    expect(host.querySelector(".hud-alert__text")?.textContent).toBe(
      "Store full · 900/900 · finish the steel contract to sell"
    );
    act(() => findButton("Open store")?.click());
    const panel = host.querySelector<HTMLElement>('[aria-label="Store contents"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Opens after the first steel contract");
    expect(findButton("Sell")).toBeUndefined();
  });

  it("warns statically in the high band and names overflow held outside at capacity", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    const state = store.getState();
    state.store.scrap = 850;
    state.storeUnits = 850;
    state.exportClaimed = true;
    state.tutorial = 9;
    act(() => store.step(1));

    const alert = host.querySelector<HTMLElement>(".hud-alert");
    expect(alert?.getAttribute("data-tier")).toBe("high");
    // Static: no role, so a per-tick re-render never re-announces it.
    expect(alert?.getAttribute("role")).toBeNull();
    expect(alert?.querySelector(".hud-alert__text")?.textContent).toBe(
      "Store nearly full · 850/900"
    );
    expect(host.querySelector<HTMLElement>(".resources__item--store")?.getAttribute("data-pressure")).toBe("high");

    // Overflow only persists while the store has no room for it: at capacity the
    // engine cannot drain it, and the alert names the units held outside.
    state.store.plates = 50;
    state.storeUnits = 900;
    state.overflow = [{ resource: "scrap", qty: 40 }];
    act(() => store.step(1));
    expect(store.getState().overflow.length).toBe(1);
    const fullAlert = host.querySelector<HTMLElement>(".hud-alert");
    expect(fullAlert?.getAttribute("data-tier")).toBe("full");
    expect(fullAlert?.getAttribute("role")).toBe("status");
    expect(fullAlert?.querySelector(".hud-alert__text")?.textContent).toBe(
      "Store full · 900/900 · 40 held outside · sell to free space"
    );
  });

  it("leads from the alert to the store panel and clears as selling frees space", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    fillStoreFull(store);

    act(() => findButton("Open store")?.click());
    const panel = host.querySelector<HTMLElement>('[aria-label="Store contents"]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector(".panel__title")?.textContent).toBe("Yard store");

    // The sell face carries its own arithmetic: 60 plates at 15 credits each.
    const sell = findButton("Sell");
    expect(sell?.textContent).toBe("Sell 60 · +900");
    act(() => sell?.click());
    expect(store.getState().storeUnits).toBe(840);
    expect(store.getState().credits).toBe(900);
    // Full -> high: the alert steps down and stops being a live region.
    const alert = host.querySelector<HTMLElement>(".hud-alert");
    expect(alert?.getAttribute("data-tier")).toBe("high");
    expect(alert?.getAttribute("role")).toBeNull();
    expect(alert?.querySelector(".hud-alert__text")?.textContent).toBe(
      "Store nearly full · 840/900"
    );

    act(() => findButton("Sell")?.click());
    expect(store.getState().storeUnits).toBe(780);
    // Below ninety percent: the alert retires and the chip returns to ok.
    expect(host.querySelector(".hud-alert")).toBeNull();
    expect(host.querySelector<HTMLElement>(".resources__item--store")?.getAttribute("data-pressure")).toBe("ok");
  });

  it("shows power draw and limited machines as text with a non-color glyph", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    walkToSorter(store);
    act(() => store.step(300));
    // A comfortably powered yard shows no power chip at all.
    expect(host.querySelector('[data-cue="power"]')).toBeNull();

    // One machine demanding 20 against the shared budget of 8: ratio 0.4, limited.
    const machine = store.getState().machines[0];
    machine.batchPower = 20;
    machine.progress = 1;
    act(() => store.step(1));
    expect(store.getState().powerRatio).toBeCloseTo(0.4, 5);
    expect(store.getState().machines[0].status).toBe("powerLimited");

    const chip = host.querySelector<HTMLElement>('[data-cue="power"]');
    expect(chip).not.toBeNull();
    expect(chip?.textContent?.trim()).toBe("Power 40 % · 1 limited");
    expect(chip?.querySelector("svg")).not.toBeNull();
    expect(chip?.querySelector(".resources__warn")).not.toBeNull();
  });

  it("names starved and cargo-full machines in words beside a gear glyph", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    walkToSorter(store);
    // Isolate the machine: no deliveries, no routes, empty buffers.
    const state = store.getState();
    state.drone.repaired = false;
    state.routes = [];
    state.store.scrap = 0;
    state.storeUnits = 0;
    const machine = state.machines[0];
    machine.inBuf = {};
    machine.inBufUnits = 0;
    machine.tray = [];
    machine.trayUnits = 0;
    machine.progress = 0;
    act(() => store.step(1));
    expect(store.getState().machines[0].status).toBe("starved");
    const starvedChip = host.querySelector<HTMLElement>('[data-cue="production"]');
    expect(starvedChip?.textContent?.trim()).toBe("1 need input");
    expect(starvedChip?.querySelector("svg")).not.toBeNull();

    // A full tray with nowhere to ship: cargo full, still in words.
    machine.tray = [{ resource: "ferrous", qty: 5 }];
    machine.trayUnits = 5;
    act(() => store.step(1));
    expect(store.getState().machines[0].status).toBe("outputFull");
    const fullChip = host.querySelector<HTMLElement>('[data-cue="production"]');
    expect(fullChip?.textContent?.trim()).toBe("1 cargo full");
    expect(fullChip?.querySelector(".resources__warn")).not.toBeNull();
  });

  it("holds chip text stable across ticks and bounds large values without jitter", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    const state = store.getState();
    state.credits = 1_234_567;
    state.store.plates = 99_995;
    state.storeUnits = 99_995;
    state.storeCapacity = 200_000;
    state.tutorial = 9;
    act(() => store.step(1));

    const credits = host.querySelector<HTMLElement>(".resources__item--credits strong");
    expect(credits?.textContent).toBe("1.23M");
    expect((credits?.textContent ?? "").length).toBeLessThanOrEqual(6);
    const storeValue = host.querySelector<HTMLElement>(".resources__item--store strong");
    expect(storeValue?.textContent).toBe("100.0K/200.0K");

    // Ten healthy ticks: the painted reads do not flicker or grow cue chips.
    const before = chipTexts().join("|");
    for (let i = 0; i < 10; i += 1) act(() => store.step(1));
    expect(chipTexts().join("|")).toBe(before);
    expect(host.querySelector("[data-cue]")).toBeNull();
    expect(host.querySelector(".hud-alert")).toBeNull();
  });
});

describe("UI-RESET-51 optional objective", () => {
  /** The P-4 census: at most three painted lines, exactly two font tiers >= 1.25 apart. */
  function census(card: Element): void {
    const lines = [...card.children]
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);
    expect(lines.length).toBeLessThanOrEqual(3);
    const sizes = [
      ...new Set(
        [...card.children]
          .filter((node) => (node.textContent ?? "").trim().length > 0)
          .map((node) => getComputedStyle(node as HTMLElement).fontSize)
      ),
    ];
    expect(sizes).toHaveLength(2);
    const [a, b] = sizes.map((value) => parseFloat(value));
    expect(Math.max(a, b) / Math.min(a, b)).toBeGreaterThanOrEqual(1.25);
  }

  it("collapses, expands, dismisses and restores without breaking the census", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();

    const card = host.querySelector<HTMLElement>(".objective");
    expect(card).not.toBeNull();
    expect(card?.querySelector(".objective__primary")).not.toBeNull();
    census(card as Element);
    // The controls are icon-only: no text, so the census never counts them.
    const controls = [...(card?.querySelectorAll<HTMLButtonElement>(".objective__controls button") ?? [])];
    expect(controls.length).toBe(2);
    for (const control of controls) {
      expect(control.textContent?.trim()).toBe("");
      expect(control.querySelector("svg")).not.toBeNull();
      expect(parseFloat(getComputedStyle(control).minHeight)).toBeGreaterThanOrEqual(44);
    }

    // Concise: the lead line only, no secondary rows.
    act(() => findButton("Collapse objective")?.click());
    const concise = host.querySelector<HTMLElement>(".objective");
    expect(concise?.classList.contains("objective--concise")).toBe(true);
    expect(concise?.querySelector(".objective__primary")).not.toBeNull();
    expect(concise?.querySelectorAll(".status-line").length).toBe(0);
    expect(findButton("Expand objective")).toBeDefined();

    // Back to full: the original card, census intact.
    act(() => findButton("Expand objective")?.click());
    const full = host.querySelector<HTMLElement>(".objective");
    expect(full?.classList.contains("objective--concise")).toBe(false);
    expect(full?.querySelectorAll(".status-line").length).toBeGreaterThan(0);
    census(full as Element);

    // Dismissed: one restore face, no guidance text at all.
    act(() => findButton("Dismiss objective")?.click());
    const dismissed = host.querySelector<HTMLElement>(".objective");
    expect(dismissed?.classList.contains("objective--dismissed")).toBe(true);
    expect(dismissed?.querySelector(".objective__primary")).toBeNull();
    expect(dismissed?.querySelectorAll(".status-line").length).toBe(0);
    expect(findButton("Show objective")).toBeDefined();

    act(() => findButton("Show objective")?.click());
    const restored = host.querySelector<HTMLElement>(".objective");
    expect(restored?.querySelector(".objective__primary")).not.toBeNull();
    census(restored as Element);
  });

  it("keeps the dock face counts unchanged while the alert is on screen", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    start();
    const state = store.getState();
    state.tutorial = 9;
    state.exportClaimed = true;
    state.store.scrap = 20;
    state.storeUnits = 20;
    act(() => store.step(1));
    // The face labels without their live price tails: the tails move with the
    // store by design, the set of faces must not.
    const faceLabels = () =>
      [...host.querySelectorAll(".dock .dock__btn")].map((node) =>
        (node.firstChild?.textContent ?? "").trim()
      );
    const facesBefore = faceLabels();
    expect(host.querySelector(".hud-alert")).toBeNull();

    fillStoreFull(store);
    expect(host.querySelector(".hud-alert")).not.toBeNull();
    expect(faceLabels()).toEqual(facesBefore);
    // The recovery action lives outside the dock, so exact-match dock taps are untouched.
    expect(host.querySelector(".dock")?.textContent).not.toContain("Open store");
    expect(findButton("Store")).toBeDefined();
  });
});

describe("UI-RESET-51 selected-machine consistency", () => {
  it("the machine panel reads the authoritative status as the engine changes it", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    walkToSorter(store);
    act(() => store.step(300));

    const state = store.getState();
    const machine = state.machines[0];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const renderPanel = () =>
      act(() => {
        root.render(
          <MachinePanel
            state={state}
            machine={machine}
            tick={state.tick}
            powerRatio={state.powerRatio}
            dispatch={(command) => store.dispatch(command)}
            onClose={() => undefined}
          />
        );
      });
    // The Status row itself, not the whole card: the measured-evidence line
    // prints "Working N%" of the time in every status, so only the row is the
    // authoritative status read.
    const statusValue = () => {
      const rows = [...host.querySelectorAll<HTMLElement>(".panel__row")];
      const row = rows.find((r) => r.querySelector("dt")?.textContent === "Status");
      return row?.querySelector("dd")?.textContent ?? "";
    };
    renderPanel();
    expect(machine.status).toBe("running");
    expect(statusValue()).toBe(STATUS_LABEL.running);
    expect(host.textContent).not.toContain("NaN");

    // The engine flips the machine to power-limited; the panel must follow the
    // same authoritative state, not a stale copy.
    machine.batchPower = 20;
    machine.progress = 1;
    act(() => store.step(1));
    renderPanel();
    expect(store.getState().machines[0].status).toBe("powerLimited");
    expect(statusValue()).toBe(STATUS_LABEL.powerLimited);
    expect(host.textContent).not.toContain("NaN");
  });
});
