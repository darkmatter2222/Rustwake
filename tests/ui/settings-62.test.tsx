/**
 * UI-RESET-62: the persisted settings surface — actual current values, writes
 * through the real store before AND after start, survival across a reload,
 * graceful display feature-detection, and the OS reduced-motion override that
 * never rewrites the player's saved preference.
 *
 * Everything runs against jsdom's window.localStorage (the same storage the
 * reset path clears) and the real UI click path. Browser APIs jsdom lacks
 * (matchMedia preference, Fullscreen API) are stubbed HERE in test code only,
 * restored after each test; no src file is mutated.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { SAVE_KEY } from "../../src/game/persistence/save";

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

function mount(store: GameStore, extras: { reload?: () => void } = {}): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<App store={store} reload={extras.reload} />);
  });
  return { host, root };
}

const settingsPanel = () => document.querySelector<HTMLElement>(".panel--settings");
const pressKey = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

/** The ACTUAL printed value of a settings row, read from its <dd>. */
function rowValue(label: string): string {
  const row = [...document.querySelectorAll<HTMLElement>(".panel--settings .panel__row")].find(
    (node) => (node.querySelector("dt")?.textContent ?? "").trim() === label
  );
  return (row?.querySelector("dd")?.textContent ?? "").trim();
}

function savedSettings(): { muted: boolean; reducedMotion: boolean; textScale: number } | null {
  const raw = window.localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  return JSON.parse(raw).payload.settings;
}

function openGateSettings() {
  act(() => findButton("Settings")?.click());
}
/** T08 (#135): the Menu sheet is retired; the resource-strip gear opens Settings directly. */
function openPostStartSettings() {
  act(() => findButton("Settings")?.click());
}
function begin() {
  act(() => findButton("Begin recovery")?.click());
}

/** matchMedia stub with a live listener list, so the OS flip can be simulated. */
function stubReducedMotion(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: { matches: boolean }) => void) => listeners.delete(fn),
    addListener: (fn: (event: { matches: boolean }) => void) => listeners.add(fn),
    removeListener: (fn: (event: { matches: boolean }) => void) => listeners.delete(fn),
    dispatchEvent: () => true,
  };
  const original = window.matchMedia;
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
  return {
    mql,
    flip(next: boolean) {
      mql.matches = next;
      act(() => {
        listeners.forEach((fn) => fn({ matches: next }));
      });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

describe("UI-RESET-62 settings experience", () => {
  let motion: ReturnType<typeof stubReducedMotion> | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    motion?.restore();
    motion = null;
    // Restore any Fullscreen API stubs to jsdom's native (absent) state.
    delete (document as unknown as Record<string, unknown>).fullscreenEnabled;
    delete (document as unknown as Record<string, unknown>).fullscreenElement;
    delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    delete (document as unknown as Record<string, unknown>).exitFullscreen;
  });

  it("pre-start settings print actual values and persist before the run begins", () => {
    const store = createStore();
    mount(store);
    openGateSettings();
    expect(document.querySelector(".gate-settings .panel--settings")).not.toBeNull();
    expect(rowValue("Sound")).toBe("On");
    expect(rowValue("Text size")).toBe("1");
    expect(rowValue("Reduced motion")).toBe("Off");
    expect(rowValue("Display")).toBe("Windowed");
    // jsdom has no Fullscreen API: a plain note and a disabled control, not a crash.
    expect(settingsPanel()?.textContent).toContain("Fullscreen is not available");
    expect(findButton("Enter fullscreen")?.disabled).toBe(true);

    act(() => findButton("Sound off")?.click());
    expect(rowValue("Sound")).toBe("Off");
    expect(store.getSettings().muted).toBe(true);
    expect(savedSettings()?.muted).toBe(true);

    act(() => findButton("Cycle text size")?.click());
    expect(rowValue("Text size")).toBe("1.25");
    expect(savedSettings()?.textScale).toBe(1.25);

    act(() => findButton("Toggle reduced motion")?.click());
    expect(rowValue("Reduced motion")).toBe("On");
    expect(savedSettings()?.reducedMotion).toBe(true);
    // Still on the title screen: settings never start the run.
    expect(document.querySelector(".gate")).not.toBeNull();
    expect(document.querySelector(".hud")).toBeNull();
  });

  it("pre-start settings survive a reload (new store on the same storage)", () => {
    const first = createStore();
    const one = mount(first);
    openGateSettings();
    act(() => findButton("Sound off")?.click());
    act(() => findButton("Cycle text size")?.click());
    act(() => one.root.unmount());

    const second = createStore();
    expect(second.getSettings().muted).toBe(true);
    expect(second.getSettings().textScale).toBe(1.25);
    mount(second);
    openGateSettings();
    expect(rowValue("Sound")).toBe("Off");
    expect(rowValue("Text size")).toBe("1.25");
  });

  it("post-start Settings gear opens Settings; Close and Escape return to the yard", () => {
    const store = createStore();
    const { host } = mount(store);
    begin();
    openPostStartSettings();
    expect(settingsPanel()).not.toBeNull();
    // T08 (#135): one major surface at a time — Settings is the only painted
    // panel inside the host, and no Menu sheet exists anywhere in the shell.
    expect(document.querySelectorAll(".shell-host .panel").length).toBe(1);
    expect(document.querySelector(".shell-menu")).toBeNull();
    expect(host.querySelector(".hud")).not.toBeNull();
    expect(rowValue("Sound")).toBe("On");

    act(() => findButton("Close settings")?.click());
    expect(settingsPanel()).toBeNull();
    expect(host.querySelector(".shell-host")).toBeNull();
    expect(host.querySelector(".hud")).not.toBeNull();

    openPostStartSettings();
    expect(settingsPanel()).not.toBeNull();
    pressKey("Escape");
    expect(settingsPanel()).toBeNull();
    expect(host.querySelector(".shell-host")).toBeNull();
    expect(host.querySelector(".hud")).not.toBeNull();
  });

  it("post-start settings persist and survive a reload", () => {
    const first = createStore();
    const one = mount(first);
    begin();
    openPostStartSettings();
    act(() => findButton("Sound off")?.click());
    expect(first.getSettings().muted).toBe(true);
    expect(savedSettings()?.muted).toBe(true);
    act(() => one.root.unmount());
    first.stop();

    const second = createStore();
    expect(second.getSettings().muted).toBe(true);
    mount(second);
    openGateSettings();
    expect(rowValue("Sound")).toBe("Off");
  });

  it("OS reduced motion overrides live without rewriting the saved preference", () => {
    motion = stubReducedMotion(true);
    const store = createStore();
    mount(store);
    openGateSettings();
    expect(rowValue("Reduced motion")).toBe("On");
    const toggle = findButton("Toggle reduced motion");
    expect(toggle?.disabled).toBe(true);
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    expect(settingsPanel()?.textContent).toContain("system already requests reduced motion");
    // The stored preference stays the player's own (false), even after a write.
    act(() => toggle?.click());
    expect(store.getSettings().reducedMotion).toBe(false);
    act(() => findButton("Sound off")?.click());
    expect(savedSettings()?.reducedMotion).toBe(false);
    expect(savedSettings()?.muted).toBe(true);

    // Flipping the OS preference mid-session takes effect without a reload.
    motion.flip(false);
    expect(rowValue("Reduced motion")).toBe("Off");
    expect(findButton("Toggle reduced motion")?.disabled).toBe(false);
    expect(settingsPanel()?.textContent).not.toContain("system already requests reduced motion");
    act(() => findButton("Toggle reduced motion")?.click());
    expect(rowValue("Reduced motion")).toBe("On");
    expect(savedSettings()?.reducedMotion).toBe(true);
  });

  it("fullscreen supported: enter, exit, and a refused request stays windowed", async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const exitFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    (document.documentElement as unknown as Record<string, unknown>).requestFullscreen = requestFullscreen;
    (document as unknown as Record<string, unknown>).exitFullscreen = exitFullscreen;

    mount(createStore());
    openGateSettings();
    expect(rowValue("Display")).toBe("Windowed");
    expect(settingsPanel()?.textContent).not.toContain("Fullscreen is not available");
    const enter = findButton("Enter fullscreen");
    expect(enter?.disabled).toBe(false);

    act(() => enter?.click());
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    // The browser grants it: the change event flips the printed value and face.
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.documentElement,
    });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(rowValue("Display")).toBe("Fullscreen");
    act(() => findButton("Exit fullscreen")?.click());
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(rowValue("Display")).toBe("Windowed");

    // A refused request keeps the windowed state with a readable reason.
    requestFullscreen.mockImplementationOnce(() => Promise.reject(new Error("denied")));
    act(() => findButton("Enter fullscreen")?.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(rowValue("Display")).toBe("Windowed");
    expect(settingsPanel()?.textContent).toContain("Fullscreen was refused");
  });

  it("Reset game from the settings panel only deletes after deliberate confirmation", () => {
    const reload = vi.fn();
    mount(createStore(), { reload });
    openGateSettings();
    act(() => findButton("Reset game")?.click());
    const dialog = document.querySelector('.reset-dialog[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("no saved progress");
    expect(findButton("Delete save and reset")?.disabled).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    act(() => findButton("Cancel")?.click());
    expect(document.querySelector(".reset-dialog")).toBeNull();
    // Cancel returns to the settings panel, still pre-start.
    expect(settingsPanel()).not.toBeNull();
    expect(document.querySelector(".gate")).not.toBeNull();

    act(() => findButton("Reset game")?.click());
    const ack = document.querySelector<HTMLInputElement>(".reset-dialog__ack input");
    act(() => ack?.click());
    act(() => findButton("Delete save and reset")?.click());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
  });
});
