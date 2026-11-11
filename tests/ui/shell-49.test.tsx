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
  SHELL_EDGE_PX,
  SHELL_GUTTER_PX,
  SHELL_INSPECTOR_WIDTH_PX,
  SHELL_MENU_FACE_PX,
  SHELL_MENU_ZONE_PX,
  SHELL_RAIL_QUERY,
  SHELL_RAIL_WIDTH_PX,
  SHELL_RIGHT_GUTTER_PX,
  SHELL_SLOTS,
  SHELL_WORLD_LEFT_PX,
} from "../../src/ui/shell/layout";

/**
 * UI-RESET-49 (G2): the app shell contract.
 *
 * The shell's job is navigation, not simulation: switching a breakpoint, opening
 * the menu or cycling the text scale must keep the selected context and must
 * never issue a game command. jsdom ignores @media, so the painted rail/phone
 * geometry is asserted where it is declared (the two sheets' own literals) and
 * the rail is exercised through the same media gate the browser uses
 * (`useRailMode`); the pixel truth at all nine viewports is the chromium pass
 * in work/evidence/UI-RESET-49/capture-shell-49.mjs.
 */

const RAIL_MEDIA = "(min-width: 1200px), (min-width: 600px) and (max-height: 460px)";

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
const menuSheet = () => document.querySelector<HTMLElement>('.shell-menu[role="dialog"]');
const menuFace = () => document.querySelector<HTMLButtonElement>(".shell-menu-face");
const railSlots = () => [...document.querySelectorAll<HTMLButtonElement>(".shell-rail [data-slot]")];
const menuRow = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".shell-menu__row")].find((node) =>
    (node.textContent ?? "").trim().startsWith(label)
  );
const pressKey = (key: string, target?: HTMLElement) =>
  act(() => {
    (target ?? window).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
const tapDock = (label: string) => {
  const faces = [...document.querySelectorAll<HTMLButtonElement>(".dock .dock__btn")];
  const face = faces.find((node) => (node.textContent ?? "").trim().startsWith(label));
  act(() => face?.click());
};

/** The rail gate reads one media query; stub it the way the viewport would answer. */
const realMatchMedia = window.matchMedia?.bind(window);
function stubMedia(rail: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: rail && query === SHELL_RAIL_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  document.body.innerHTML = "";
  // The inspector-top variable lives on documentElement, which survives the
  // body reset; a prior rail test would otherwise leak its measured value in.
  document.documentElement.style.removeProperty("--shell-inspector-top");
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

describe("G2 shell geometry", () => {
  it("pins the painted boxes of navigation-spec §3.6 and one shared rail query", () => {
    expect(SHELL_EDGE_PX).toBe(8);
    expect(SHELL_GUTTER_PX).toBe(6);
    expect(SHELL_RAIL_WIDTH_PX).toBe(96);
    expect(SHELL_INSPECTOR_WIDTH_PX).toBe(320);
    expect(SHELL_WORLD_LEFT_PX).toBe(110);
    expect(SHELL_RIGHT_GUTTER_PX).toBe(334);
    expect(SHELL_MENU_FACE_PX).toBe(66);
    expect(SHELL_MENU_ZONE_PX).toBe(72);
    expect([...SHELL_SLOTS]).toEqual(["yard", "build", "store", "research", "menu"]);
    // The CSS rail block and the JS gate answer the same query, literally.
    expect(SHELL_RAIL_QUERY).toBe(RAIL_MEDIA);
    expect(stylesRaw).toContain(`@media ${RAIL_MEDIA}`);
    expect(shellRaw).toContain(`@media ${RAIL_MEDIA}`);
    // Phone split band + reserved thumb zone; column corner; Home retired (E2).
    expect(stylesRaw).toContain("@media (max-width: 599px)");
    expect(stylesRaw).toContain("padding-right: 72px");
    expect(stylesRaw).toContain(".dock__btn--primary:not(.dock__btn--branch)");
    expect(stylesRaw).toContain(
      ".hud:not(.hud--build) .dock__btn:not(.dock__btn--primary):not(.dock__btn--branch)"
    );
    expect(stylesRaw).toContain(".cluster .icon-btn:last-child");
    expect(shellRaw).toContain(".hud--menu > .panel");
  });
});

describe("G2 destination rail", () => {
  it("renders five slots in order and opens contexts without issuing commands", () => {
    stubMedia(true);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    expect(railSlots().map((node) => node.dataset.slot)).toEqual([
      "yard",
      "build",
      "store",
      "research",
      "menu",
    ]);
    expect(railSlots().every((node) => !node.disabled)).toBe(true);

    act(() => railSlots()[2].click()); // Store
    expect(panelTitles()).toContain("Yard store");
    expect(railSlots()[2].getAttribute("aria-pressed")).toBe("true");
    act(() => railSlots()[3].click()); // Research
    expect(panelTitles()).toContain("Research");
    act(() => railSlots()[0].click()); // Yard record
    expect(panelTitles()).toContain("Yard record");
    expect(spy).not.toHaveBeenCalled();
    pressKey("Escape");
    expect(panelTitles()).not.toContain("Yard record");
  });

  it("keeps unearned slots on screen with their reason and inert (E8)", () => {
    stubMedia(true);
    const store = createStore();
    mount(store);
    begin();
    const slots = railSlots();
    expect(slots[0].disabled).toBe(true);
    expect(slots[0].textContent).toContain("After tutorial");
    expect(slots[3].disabled).toBe(true);
    expect(slots[3].textContent).toContain("Needs data");
    act(() => slots[0].click());
    act(() => slots[3].click());
    expect(panelTitles()).toEqual([]);
    // The earned destinations still work at the first minute.
    act(() => slots[2].click());
    expect(panelTitles()).toContain("Yard store");
  });
});

describe("G2 menu sheet", () => {
  it("opens with focus, yields the panels' slot, and Escape returns focus and context", () => {
    stubMedia(false);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    tapDock("Store");
    const panel = document.querySelector<HTMLElement>(".panel");
    expect(panel).not.toBeNull();

    const face = menuFace();
    expect(face).not.toBeNull();
    act(() => {
      face!.focus();
      face!.click();
    });
    const sheet = menuSheet();
    expect(sheet).not.toBeNull();
    expect(sheet!.getAttribute("aria-label")).toBe("Menu");
    expect(document.activeElement).toBe(sheet); // E5: focus moves in
    expect(face!.getAttribute("aria-expanded")).toBe("true");
    // E3: one sheet at a time — the panel yields its painted slot…
    expect(getComputedStyle(panel!).display).toBe("none");
    // …but E4: the selection underneath is untouched.
    pressKey("Escape");
    expect(menuSheet()).toBeNull();
    expect(getComputedStyle(panel!).display).toBe("flex");
    expect(panelTitles()).toContain("Yard store");
    expect(document.activeElement).toBe(face); // E5: focus returns
    expect(spy).not.toHaveBeenCalled();
  });

  it("acts on Home, Sound, Text, Yard record and the return report", () => {
    stubMedia(false);
    const store = matureStore();
    mount(store);
    begin();
    tapDock("Store");
    expect(panelTitles()).toContain("Yard store");

    act(() => menuFace()!.click());
    act(() => menuRow("Home")!.click());
    expect(menuSheet()).toBeNull();
    expect(panelTitles()).toEqual(["While you were away"]); // selection cleared, report stays

    act(() => menuFace()!.click());
    expect(store.getSettings().muted).toBe(true);
    act(() => menuRow("Sound")!.click());
    expect(store.getSettings().muted).toBe(false);
    expect(store.getSettings().textScale).toBe(1);
    act(() => menuRow("A 1")!.click());
    expect(store.getSettings().textScale).toBe(1.25);
    act(() => menuRow("Yard")!.click());
    expect(menuSheet()).toBeNull();
    expect(panelTitles()).toContain("Yard record");

    pressKey("Escape");
    act(() => menuFace()!.click());
    const reportRow = menuRow("Return report");
    expect(reportRow!.disabled).toBe(false);
    act(() => reportRow!.click());
    expect(panelTitles()).toContain("While you were away");
  });

  it("prints reasons for the rows a fresh yard has not earned", () => {
    stubMedia(false);
    const store = createStore();
    mount(store);
    begin();
    act(() => menuFace()!.click());
    expect(menuRow("Yard")!.disabled).toBe(true);
    expect(menuRow("Yard")!.textContent).toContain("After tutorial");
    expect(menuRow("Return report")!.disabled).toBe(true);
    expect(menuRow("Return report")!.textContent).toContain("No absence yet");
  });
});

describe("G2 selection stability", () => {
  it("keeps the selected context across breakpoint switches, text scale and mute — no commands", () => {
    stubMedia(false);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    tapDock("Store");
    expect(panelTitles()).toContain("Yard store");

    for (const width of [360, 768, 1280, 844, 1920]) {
      vi.stubGlobal("innerWidth", width);
      act(() => window.dispatchEvent(new Event("resize")));
      expect(panelTitles()).toContain("Yard store");
    }
    act(() => findButton("Text size")!.click());
    act(() => findButton("Text size")!.click());
    expect(store.getSettings().textScale).toBe(1.5);
    expect(panelTitles()).toContain("Yard store");
    act(() => findButton("Sound")!.click());
    expect(panelTitles()).toContain("Yard store");

    // The menu layer too: open, close, and the same context is still selected.
    act(() => menuFace()!.click());
    pressKey("Escape");
    expect(panelTitles()).toContain("Yard store");
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the selection when the rail gate flips on resize", () => {
    stubMedia(true);
    const store = matureStore();
    const spy = vi.spyOn(store, "dispatch");
    mount(store);
    begin();
    act(() => railSlots()[2].click());
    expect(panelTitles()).toContain("Yard store");
    stubMedia(false);
    act(() => window.dispatchEvent(new Event("resize")));
    // The gate's listener answers the new query on its own change event; the
    // selection must survive whichever mode paints next.
    expect(panelTitles()).toContain("Yard store");
    stubMedia(true);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(panelTitles()).toContain("Yard store");
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("G2 keyboard destinations", () => {
  it("maps keys 1–5 to the five slots and keeps text fields' own keys", () => {
    stubMedia(true);
    const store = matureStore();
    mount(store);
    begin();
    pressKey("3");
    expect(panelTitles()).toContain("Yard store");
    pressKey("4");
    expect(panelTitles()).toContain("Research");
    pressKey("1");
    expect(panelTitles()).toContain("Yard record");
    pressKey("5");
    expect(menuSheet()).not.toBeNull();
    pressKey("5");
    expect(menuSheet()).toBeNull();
    pressKey("2");
    expect(document.querySelector(".hud")!.className).toContain("hud--build");
    const dockTexts = [...document.querySelectorAll(".dock .dock__btn")].map((node) =>
      (node.textContent ?? "").trim()
    );
    expect(dockTexts).toHaveLength(3);
    expect(dockTexts[0]).toBe("Cancel");
    expect(dockTexts[1]).toContain("Build");
    expect(dockTexts[2]).toBe("Next");
    pressKey("2"); // Build again cancels the phase
    expect(document.querySelector(".hud")!.className).not.toContain("hud--build");

    // A save code typed into the yard record must never steer the shell.
    pressKey("1");
    const field = document.querySelector<HTMLTextAreaElement>(".panel__code");
    expect(field).not.toBeNull();
    pressKey("3", field!);
    expect(panelTitles()).toContain("Yard record");
    expect(panelTitles()).not.toContain("Yard store");
  });
});

describe("G2 reachability and scroll", () => {
  it("keeps the document flat and every shell target at the 44 px floor, menu open at scale 2", () => {
    stubMedia(true);
    const store = matureStore();
    mount(store);
    begin();
    act(() => store.setSettings({ textScale: 2 }));
    tapDock("Store");
    act(() => railSlots()[4].click()); // Menu via slot 5
    expect(menuSheet()).not.toBeNull();
    expect(document.body.scrollHeight).toBeLessThanOrEqual(window.innerHeight + 1);
    expect(getComputedStyle(document.body).overflow).toBe("hidden");
    expect(getComputedStyle(document.documentElement).overflow).toBe("hidden");
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(".hud button")];
    expect(buttons.length).toBeGreaterThan(8);
    for (const button of buttons) {
      const floor = Number.parseFloat(getComputedStyle(button).minHeight);
      expect(floor, button.textContent ?? "").toBeGreaterThanOrEqual(44);
    }
    // The sheet's own body is the declared scroller, bounded like a panel.
    const body = document.querySelector<HTMLElement>(".shell-menu__body");
    expect(getComputedStyle(body!).overflowY).toBe("auto");
    expect(getComputedStyle(menuSheet()!).maxHeight).toBe("42%");
  });
});

describe("G2 inspector top paint-truth (capture bug regressions)", () => {
  it("measures the lead once the gate clears and sets --shell-inspector-top in rail mode", () => {
    stubMedia(true);
    const store = matureStore();
    mount(store);
    // The gate is up: `.hud__lead` does not exist yet, so nothing is measured.
    expect(document.documentElement.style.getPropertyValue("--shell-inspector-top")).toBe("");
    begin();
    // Regression: the effect's deps must include `started`, or this never runs
    // after the gate clears. jsdom rects are zero, so the one-shot measurement
    // lands on the 104 px floor; the chromium pass proves the lifted values
    // (ceil(lead.bottom + 6)) at every rail viewport and text scale.
    expect(document.documentElement.style.getPropertyValue("--shell-inspector-top")).toBe("104px");
  });

  it("keeps the variable unset outside rail mode, where the panels stay in flow", () => {
    stubMedia(false);
    const store = matureStore();
    mount(store);
    begin();
    expect(document.documentElement.style.getPropertyValue("--shell-inspector-top")).toBe("");
  });

  it("pins the rail stretch and the scaling column reserve in both sheets", () => {
    // The base cascade centers absolutely-positioned sheets between their
    // insets; without `align-self: stretch` in the rail blocks Chrome
    // content-sizes them (measured: menu y=281 at 1280x800, panel y=0 spilling
    // past the 844x390 viewport). Both rail blocks must carry the override.
    const railOnward = (raw: string) => raw.slice(raw.indexOf(`@media ${RAIL_MEDIA}`));
    expect(railOnward(stylesRaw)).toContain("align-self: stretch");
    expect(railOnward(shellRaw)).toContain("align-self: stretch");
    // The column lead's corner reserve scales with the text: the Menu face's
    // rem label measured 52.1 px at scale 1 and 86.2 px at scale 2, so a fixed
    // 56 px reserve let the face paint over the Text-size button at scale 2.
    const reserve = "padding-right: calc(24px + 38px * var(--text-scale, 1))";
    expect(stylesRaw).toContain(reserve);
    expect(shellRaw).toContain(reserve);
  });
});
