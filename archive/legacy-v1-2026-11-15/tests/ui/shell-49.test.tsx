import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { DEFAULT_SETTINGS, SAVE_KEY, encodeSave } from "../../src/game/persistence/save";
import {
  SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX,
  SHELL_DESKTOP_MIN_WIDTH_PX,
  SHELL_DESKTOP_QUERY,
  SHELL_EDGE_PX,
  SHELL_GUTTER_PX,
  SHELL_INSPECTOR_TOP_PX,
  SHELL_INSPECTOR_WIDTH_PX,
  SHELL_PHONE_MAX_WIDTH_PX,
  SHELL_RIGHT_GUTTER_PX,
  SHELL_SHEET_COLLAPSED_VH,
  SHELL_SHEET_EXPANDED_VH,
  SHELL_SLOTS,
  SHELL_TOOLBAR_HEIGHT_PX,
  SHELL_ZOOM_FACE_PX,
} from "../../src/ui/shell/layout";

/**
 * RW3D #135 (T08): the compact shell contract, retargeted from UI-RESET-49's
 * 2D-era rail/Menu census. The permanent left rail, the Menu face/sheet and the
 * two-layer painted stack are retired; what this file pins now is the ONE
 * six-destination toolbar, the ONE panel host (right inspector on desktop,
 * bottom sheet on phones), the Settings surface that inherited the Menu's rows,
 * and the navigation invariants that survive the rebuild: switching a
 * breakpoint, opening Settings or cycling the text scale keeps the selected
 * context and never issues a game command. jsdom ignores @media, so the painted
 * geometry is asserted where it is declared (the sheets' own literals) and the
 * desktop gate is exercised through the same media query the browser uses
 * (`useDesktopMode`); the pixel truth is the headless chromium capture in
 * docs/evidence/2026-11-14-rw3d-t08-shell/.
 */

/** A developed yard: past the tutorial, two connected machines, data and credits. */
function matureState(): SimState {
  const state = createInitialState();
  let seq = 0;
  const send = (body: CommandBody) =>
    applyCommand(state, { ...body, id: `s${(seq += 1)}` } as Command);
  for (let pass = 0; pass < 6; pass += 1) {
    send({ type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send({ type: "drone.repair" });
  advance(state, 262);
  state.tutorial = 9;
  for (const blueprint of ["sorter", "furnace"] as const) {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store = { ...state.store, [item.resource]: item.qty };
    }
    state.storeUnits = Object.values(state.store).reduce((total, qty) => total + qty, 0);
    let tile = 8;
    for (let t = 0; t < YARD_TILES; t += 1) {
      if (t !== DOCK_TILE && !state.machines.some((m) => m.tile === t)) {
        tile = t;
        break;
      }
    }
    send({ type: "machine.build", blueprint, tile });
    const machineId = state.machines[state.machines.length - 1].id;
    for (const plan of planConnections(state, machineId)) {
      send({ type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    advance(state, 300);
  }
  state.credits = 100;
  state.store = { ...state.store, data: 12 };
  state.storeUnits += 12;
  advance(state, 1);
  return state;
}

/** The mature yard behind a real save envelope, with a short absence report. */
function matureStore(): GameStore {
  const writtenAt = 1_000_000;
  const text = encodeSave(matureState(), writtenAt, { ...DEFAULT_SETTINGS, muted: true });
  const map = new Map<string, string>([[SAVE_KEY, text]]);
  return createStore({
    storage: {
      getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
      setItem: (key: string, value: string) => map.set(key, value),
    },
    now: () => writtenAt + 60_000,
  });
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

function begin() {
  act(() => findButton("Begin recovery")?.click());
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

const panelTitles = () =>
  [...document.querySelectorAll(".panel")].map((node) =>
    (node.querySelector(".panel__title")?.textContent ?? "").trim()
  );
const panelHost = () => document.querySelector<HTMLElement>(".shell-host");
const hostDepth = () => Number(panelHost()?.dataset.depth ?? 0);
const toolbarSlots = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".toolbar [data-slot]")];
const tapSlot = (slot: string) => {
  const face = document.querySelector<HTMLButtonElement>(`.toolbar [data-slot="${slot}"]`);
  act(() => face?.click());
};
/** The Settings rows inherited from the retired Menu sheet (label in the dt). */
const settingsRow = (label: string) =>
  [...document.querySelectorAll<HTMLElement>(".panel--settings .panel__row")].find(
    (node) => (node.querySelector("dt")?.textContent ?? "").trim() === label
  );
const settingsRowButton = (label: string) =>
  settingsRow(label)?.querySelector<HTMLButtonElement>("button") ?? undefined;
const openSettings = () => {
  const gear = findButton("Settings");
  act(() => {
    gear?.focus();
    gear?.click();
  });
};
const pressKey = (key: string, target?: HTMLElement) =>
  act(() => {
    (target ?? window).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

/**
 * The desktop gate reads one media query; stub it the way the viewport would
 * answer and keep the change listeners so a resize can flip the gate exactly
 * like the browser's own `change` event does.
 */
type MediaListener = (event: { matches: boolean }) => void;
const mediaState = { desktop: false, listeners: new Map<string, Set<MediaListener>>() };
const realMatchMedia = window.matchMedia?.bind(window);
function stubMedia(desktop: boolean) {
  mediaState.desktop = desktop;
  window.matchMedia = ((query: string) => {
    let listeners = mediaState.listeners.get(query);
    if (!listeners) {
      listeners = new Set();
      mediaState.listeners.set(query, listeners);
    }
    const bag = listeners;
    return {
      get matches() {
        return query === SHELL_DESKTOP_QUERY ? mediaState.desktop : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, fn: MediaListener) => bag.add(fn),
      removeEventListener: (_type: string, fn: MediaListener) => bag.delete(fn),
      addListener: (fn: MediaListener) => bag.add(fn),
      removeListener: (fn: MediaListener) => bag.delete(fn),
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}
function flipMedia(desktop: boolean) {
  mediaState.desktop = desktop;
  act(() => {
    for (const fn of mediaState.listeners.get(SHELL_DESKTOP_QUERY) ?? []) {
      fn({ matches: desktop });
    }
  });
}

/** CSS rule text with comments stripped, so retired selectors are countable. */
const rulesOnly = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "");

beforeEach(() => {
  document.body.innerHTML = "";
  mediaState.listeners = new Map();
  // The inspector-top variable lives on documentElement, which survives the
  // body reset; a prior test would otherwise leak its measured value in.
  document.documentElement.style.removeProperty("--shell-inspector-top");
  document.documentElement.style.removeProperty("--shell-chrome-bottom");
  document.documentElement.classList.remove("text-large");
  for (const raw of [stylesRaw, shellRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
});

afterEach(() => {
  if (realMatchMedia) window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("G2 shell geometry (T08 compact shell)", () => {
  it("pins the painted boxes of the compact contract and one shared desktop query", () => {
    expect(SHELL_EDGE_PX).toBe(8);
    expect(SHELL_GUTTER_PX).toBe(6);
    expect(SHELL_INSPECTOR_WIDTH_PX).toBe(340);
    expect(SHELL_RIGHT_GUTTER_PX).toBe(354);
    expect(SHELL_INSPECTOR_TOP_PX).toBe(64);
    expect(SHELL_TOOLBAR_HEIGHT_PX).toBe(60);
    expect(SHELL_SHEET_COLLAPSED_VH).toBe(35);
    expect(SHELL_SHEET_EXPANDED_VH).toBe(70);
    expect(SHELL_ZOOM_FACE_PX).toBe(44);
    expect([...SHELL_SLOTS]).toEqual(["build", "routes", "fleet", "research", "trade", "map"]);
    // The CSS desktop block and the JS gate answer the same query, literally.
    expect(SHELL_DESKTOP_QUERY).toBe("(min-width: 1024px)");
    expect(SHELL_DESKTOP_MIN_WIDTH_PX).toBe(1024);
    expect(SHELL_PHONE_MAX_WIDTH_PX).toBe(767);
    expect(SHELL_COMPACT_LANDSCAPE_MAX_HEIGHT_PX).toBe(460);
    expect(shellRaw).toContain("@media (min-width: 1024px)");
    expect(shellRaw).toContain("@media (max-width: 767px)");
    expect(shellRaw).toContain(
      "@media (min-width: 600px) and (max-width: 1023px) and (max-height: 460px)"
    );
    // The toolbar, sheet bands and inspector width are the contract's own.
    expect(shellRaw).toContain("min-height: 60px");
    expect(shellRaw).toContain("height: 35vh");
    expect(shellRaw).toContain("height: 70vh");
    expect(shellRaw).toContain("width: 340px");
    // The 2D-era rail, Menu sheet and two-layer painted stack are retired.
    expect(rulesOnly(stylesRaw)).not.toContain(".shell-rail");
    expect(rulesOnly(stylesRaw)).not.toContain(".shell-menu");
    expect(rulesOnly(shellRaw)).not.toContain(".shell-rail");
    expect(rulesOnly(shellRaw)).not.toContain(".shell-menu");
    expect(rulesOnly(stylesRaw)).not.toContain(".hud:has(.panel ~ .panel)");
  });
});

describe("G2 destination toolbar", () => {
  it("renders six slots in order and opens contexts without issuing commands", () => {
    stubMedia(true);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    expect(toolbarSlots().map((node) => node.dataset.slot)).toEqual([
      "build",
      "routes",
      "fleet",
      "research",
      "trade",
      "map",
    ]);
    expect(toolbarSlots().every((node) => !node.disabled)).toBe(true);

    tapSlot("trade");
    expect(panelTitles()).toEqual(["Yard store"]);
    expect(toolbarSlots()[4].getAttribute("aria-pressed")).toBe("true");
    tapSlot("research");
    expect(panelTitles()).toEqual(["Research"]);
    tapSlot("routes");
    expect(panelTitles()).toEqual(["Routes"]);
    tapSlot("fleet");
    expect(panelTitles()).toEqual(["Fleet"]);
    tapSlot("map");
    expect(panelTitles()).toEqual(["Map"]);
    // U03: exactly one major surface paints, whatever the destination.
    expect(document.querySelectorAll(".shell-host .panel")).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    pressKey("Escape");
    expect(panelTitles()).toEqual([]);
    expect(panelHost()).toBeNull();
  });

  it("keeps unearned destinations on screen with their reason and inert (E8)", () => {
    stubMedia(true);
    const store = createStore();
    mount(store);
    begin();
    const slots = toolbarSlots();
    const research = slots.find((node) => node.dataset.slot === "research")!;
    expect(research.disabled).toBe(true);
    expect(research.textContent).toContain("Needs data");
    act(() => research.click());
    pressKey("4"); // the key can never bypass the printed reason either
    expect(panelTitles()).toEqual([]);
    // The earned destinations still work at the first minute.
    tapSlot("trade");
    expect(panelTitles()).toEqual(["Yard store"]);
  });
});

describe("G2 Settings surface (the retired Menu's rows)", () => {
  it("opens as the one painted layer, and Escape unwinds focus and context", () => {
    stubMedia(false);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    // Begin auto-pushes the absence report; pop it so this test's opener
    // (the Trade slot) is the first layer the host captures.
    pressKey("Escape");
    expect(panelHost()).toBeNull();
    const trade = toolbarSlots()[4];
    act(() => {
      trade.focus();
      trade.click();
    });
    expect(panelTitles()).toEqual(["Yard store"]);

    openSettings();
    // Settings pushes over the store: ONE painted surface, stack two deep.
    expect(panelTitles()).toEqual(["Settings"]);
    expect(hostDepth()).toBe(2);
    expect(document.querySelectorAll(".shell-host .panel")).toHaveLength(1);
    expect(document.activeElement).toBe(panelHost()); // E5: focus moves in
    // E4: one press pops exactly the Settings layer; the store underneath stays.
    pressKey("Escape");
    expect(panelTitles()).toEqual(["Yard store"]);
    expect(hostDepth()).toBe(1);
    pressKey("Escape");
    expect(panelHost()).toBeNull();
    expect(document.activeElement).toBe(trade); // E5: focus returns to the opener
    expect(spy).not.toHaveBeenCalled();
  });

  it("acts on Sound, Text size, Yard record and the return report", () => {
    stubMedia(false);
    const store = matureStore();
    mount(store);
    begin();
    openSettings();
    expect(panelTitles()).toEqual(["Settings"]);

    expect(store.getSettings().muted).toBe(true);
    act(() => settingsRowButton("Sound")!.click());
    expect(store.getSettings().muted).toBe(false);
    expect(store.getSettings().textScale).toBe(1);
    act(() => settingsRowButton("Text size")!.click());
    expect(store.getSettings().textScale).toBe(1.25);

    act(() => settingsRowButton("Yard record")!.click());
    expect(panelTitles()).toEqual(["Yard record"]);
    expect(hostDepth()).toBe(3); // pushed over Settings (over the Begin report)
    pressKey("Escape");
    expect(panelTitles()).toEqual(["Settings"]);

    const reportButton = settingsRowButton("Return report")!;
    expect(reportButton.disabled).toBe(false);
    act(() => reportButton.click());
    expect(panelTitles()).toEqual(["While you were away"]);
    expect(hostDepth()).toBe(2); // the report already in the stack dedupes to the top
  });

  it("prints reasons for the rows a fresh yard has not earned", () => {
    stubMedia(false);
    const store = createStore();
    mount(store);
    begin();
    openSettings();
    expect(settingsRowButton("Yard record")!.disabled).toBe(true);
    expect(settingsRow("Yard record")!.textContent).toContain("After tutorial");
    expect(settingsRowButton("Return report")!.disabled).toBe(true);
    expect(settingsRow("Return report")!.textContent).toContain("No absence yet");
  });
});

describe("G2 selection stability", () => {
  it("keeps the selected context across breakpoint switches, text scale and mute — no commands", () => {
    stubMedia(false);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    tapSlot("trade");
    expect(panelTitles()).toEqual(["Yard store"]);

    for (const width of [360, 768, 1280, 844, 1920]) {
      vi.stubGlobal("innerWidth", width);
      act(() => window.dispatchEvent(new Event("resize")));
      expect(panelTitles()).toEqual(["Yard store"]);
    }
    act(() => findButton("Text size")!.click());
    act(() => findButton("Text size")!.click());
    expect(store.getSettings().textScale).toBe(1.5);
    expect(panelTitles()).toEqual(["Yard store"]);
    act(() => findButton("Sound")!.click());
    expect(panelTitles()).toEqual(["Yard store"]);

    // The Settings layer too: open, close, and the same context is still selected.
    openSettings();
    pressKey("Escape");
    expect(panelTitles()).toEqual(["Yard store"]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the selection when the desktop gate flips on resize", () => {
    stubMedia(true);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    tapSlot("trade");
    expect(panelTitles()).toEqual(["Yard store"]);
    expect(panelHost()!.className).toContain("shell-inspector");
    flipMedia(false);
    // The gate's listener answers the new query on its own change event; the
    // selection must survive whichever mode paints next.
    expect(panelHost()!.className).toContain("shell-sheet");
    expect(panelTitles()).toEqual(["Yard store"]);
    flipMedia(true);
    expect(panelHost()!.className).toContain("shell-inspector");
    expect(panelTitles()).toEqual(["Yard store"]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("G2 keyboard destinations", () => {
  it("maps keys 1–6 to the six slots and keeps text fields' own keys", () => {
    stubMedia(true);
    const store = matureStore();
    mount(store);
    begin();
    pressKey("5");
    expect(panelTitles()).toEqual(["Yard store"]);
    pressKey("4");
    expect(panelTitles()).toEqual(["Research"]);
    pressKey("2");
    expect(panelTitles()).toEqual(["Routes"]);
    pressKey("3");
    expect(panelTitles()).toEqual(["Fleet"]);
    pressKey("6");
    expect(panelTitles()).toEqual(["Map"]);
    pressKey("1");
    expect(document.querySelector(".hud")!.className).toContain("hud--build");
    const dockTexts = [...document.querySelectorAll(".dock .dock__btn")].map((node) =>
      (node.textContent ?? "").trim()
    );
    expect(dockTexts).toHaveLength(3);
    expect(dockTexts[0]).toBe("Cancel");
    expect(dockTexts[1]).toContain("Build");
    expect(dockTexts[2]).toBe("Next");
    pressKey("1"); // Build again cancels the phase
    expect(document.querySelector(".hud")!.className).not.toContain("hud--build");

    // A save code typed into the yard record must never steer the shell.
    openSettings();
    act(() => settingsRowButton("Yard record")!.click());
    // UI-RESET-63: the export code lives on the labelled Backup page; the intent
    // is unchanged — keys typed in the save code stay in the field.
    act(() => findButton("Backup")?.click());
    const field = document.querySelector<HTMLTextAreaElement>(".panel__code");
    expect(field).not.toBeNull();
    pressKey("5", field!);
    expect(panelTitles()).toContain("Yard record");
    expect(panelTitles()).not.toContain("Yard store");
  });
});

describe("G2 reachability and scroll", () => {
  it("keeps the document flat and every shell target at the 44 px floor, Settings open at scale 2", () => {
    stubMedia(false);
    const store = matureStore();
    mount(store);
    begin();
    act(() => store.setSettings({ textScale: 2 }));
    tapSlot("trade");
    openSettings();
    expect(panelTitles()).toEqual(["Settings"]);
    expect(document.body.scrollHeight).toBeLessThanOrEqual(window.innerHeight + 1);
    expect(getComputedStyle(document.body).overflow).toBe("hidden");
    expect(getComputedStyle(document.documentElement).overflow).toBe("hidden");
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".hud button")];
    expect(buttons.length).toBeGreaterThan(8);
    for (const button of buttons) {
      const floor = Number.parseFloat(getComputedStyle(button).minHeight);
      expect(floor, button.textContent ?? "").toBeGreaterThanOrEqual(44);
    }
    // The panel's own body is the declared scroller, bounded by the host.
    // jsdom does not expand the `overflow` shorthand, so assert the shipped
    // declaration itself rather than a computed longhand.
    const body = panelHost()!.querySelector<HTMLElement>(".panel__body");
    expect(body).not.toBeNull();
    expect(stylesRaw).toMatch(/\.panel__body\s*\{[^}]*overflow:\s*hidden auto/);
    // At 200% text the sheet stands in its tall band on its own (the expand
    // toggle stands down), so the one surface never needs the page to scroll.
    expect(getComputedStyle(panelHost()!).height).toBe("70vh");
  });
});

describe("G2 inspector top paint-truth", () => {
  it("floors at 64 px once the gate clears and re-measures with the text scale", () => {
    stubMedia(true);
    const store = matureStore();
    mount(store);
    // The gate is up: `.hud__lead` does not exist yet, so nothing is measured.
    expect(document.documentElement.style.getPropertyValue("--shell-inspector-top")).toBe("");
    begin();
    // Regression: the effect's deps must include `started`, or this never runs
    // after the gate clears. jsdom rects are zero, so the one-shot measurement
    // lands on the 64 px floor; the chromium pass proves the lifted values
    // (ceil(lead.bottom + gutter)) at every desktop viewport and text scale.
    expect(document.documentElement.style.getPropertyValue("--shell-inspector-top")).toBe("64px");
    act(() => store.setSettings({ textScale: 2 }));
    expect(document.documentElement.style.getPropertyValue("--shell-inspector-top")).toBe("64px");
  });

  it("pins the desktop insets in the sheet and keeps the phone bands free of them", () => {
    const desktopOnward = shellRaw.slice(shellRaw.indexOf("@media (min-width: 1024px)"));
    expect(desktopOnward).toContain("top: var(--shell-inspector-top, 64px)");
    expect(desktopOnward).toContain("bottom: var(--shell-chrome-bottom, 132px)");
    // The #49 lesson survives the rebuild: an absolute box with align-self:center
    // content-sizes between its insets instead of filling them.
    expect(desktopOnward).toContain("align-self: stretch");
    // The phone band never reads the desktop inset. (The compact landscape
    // drawer between the bands legitimately does, so scope this to 767px.)
    const phoneStart = shellRaw.indexOf("@media (max-width: 767px)");
    const phoneBand = shellRaw.slice(phoneStart, shellRaw.indexOf("@media (min-width: 600px)"));
    expect(rulesOnly(phoneBand)).not.toContain("--shell-inspector-top");
    // The camera stack stands down under the 70vh band (no sky left above the
    // painted chrome) and returns when the sheet collapses.
    expect(phoneBand).toContain(".hud:has(.shell-sheet--expanded) .shell-zoom");
    const baseRules = rulesOnly(shellRaw.slice(0, phoneStart));
    expect(baseRules).toContain("height: 35vh");
    expect(baseRules).toContain("height: 70vh");
  });
});
