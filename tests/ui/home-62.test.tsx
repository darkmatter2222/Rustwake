/**
 * UI-RESET-62: title/continue experience and the sponsor reset-game confirmation.
 *
 * These tests drive the REAL UI path (clicks -> App callbacks -> store) against
 * jsdom's own window.localStorage, because the reset path clears that exact
 * storage through clearSave(). Saves are seeded with the game's own encodeSave
 * and lastSeenMs = Date.now(); the mature yard is built by real commands on a
 * donor store, never by hand-editing state. No src file is mutated here.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import {
  SAVE_KEY,
  encodeSave,
  DEFAULT_SETTINGS,
  type SaveSettings,
} from "../../src/game/persistence/save";
import { LEASE_KEY } from "../../src/game/persistence/lease";
import { TUNING } from "../../src/game/content/defs";
import type { AudioApi } from "../../src/game/audio/audio";

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

function mount(
  store: GameStore,
  extras: { reload?: () => void; audioApi?: AudioApi } = {}
): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<App store={store} reload={extras.reload} audioApi={extras.audioApi} />);
  });
  return { host, root };
}

const menuFace = () => document.querySelector<HTMLButtonElement>(".shell-menu-face");
const menuRow = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".shell-menu__row")].find((node) =>
    (node.textContent ?? "").trim().startsWith(label)
  );
const dialog = () => document.querySelector<HTMLElement>('.reset-dialog[role="alertdialog"]');
const pressKey = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });

/**
 * A real mature yard: salvage pulses, a repaired drone, a built sorter and a
 * delivery window, all through the engine's own command path on an isolated
 * donor store. The envelope is written with the game's encodeSave at Date.now().
 */
function seedProgress(settings: SaveSettings = DEFAULT_SETTINGS) {
  const donor = createStore({ storage: memoryStorage(), now: () => Date.now() });
  for (let i = 0; i < 12; i += 1) {
    donor.dispatch({ id: `seed-salvage-${i}`, type: "manual.salvage" });
    donor.step(TUNING.manualPulseTicks);
  }
  donor.dispatch({ id: "seed-repair", type: "drone.repair" });
  let built = false;
  for (let tile = 1; tile <= 16 && !built; tile += 1) {
    built = donor.dispatch({ id: `seed-build-${tile}`, type: "machine.build", blueprint: "sorter", tile }).ok;
  }
  donor.step(300);
  const sim = donor.getState();
  window.localStorage.setItem(SAVE_KEY, encodeSave(sim, Date.now(), settings));
  return sim;
}

function fakeAudio(): AudioApi & { play: ReturnType<typeof vi.fn> } {
  return {
    resume: vi.fn(),
    setMuted: vi.fn(),
    isMuted: vi.fn(() => false),
    play: vi.fn(),
    suspend: vi.fn(),
    graphSnapshot: vi.fn(() => []),
    dispose: vi.fn(),
  };
}

describe("UI-RESET-62 title/continue and reset-game", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("fresh gate offers Begin recovery and Settings, never Continue or New game", () => {
    const store = createStore();
    const { host } = mount(store);
    expect(host.querySelector(".gate")).not.toBeNull();
    expect(findButton("Begin recovery")).toBeDefined();
    expect(findButton("Settings")).toBeDefined();
    expect(findButton("Continue")).toBeUndefined();
    expect(findButton("New game")).toBeUndefined();
    expect(host.querySelector(".gate__save")?.textContent).toContain("A fresh yard is waiting");
    // The primary begin action stays the first (and only) .gate__btn.
    expect(document.querySelectorAll(".gate__btn").length).toBe(1);
  });

  it("seeded save shows Continue with the actual run summary, and enters that yard", () => {
    const sim = seedProgress();
    expect(sim.tick).toBeGreaterThan(0);
    expect(sim.machines.length).toBeGreaterThan(0);
    const store = createStore();
    const { host } = mount(store);
    const primary = document.querySelector<HTMLButtonElement>(".gate__btn");
    expect(primary?.textContent?.trim()).toBe("Continue");
    // Keyboard/test paths keep the begin wording through the accessible name.
    expect(primary?.getAttribute("aria-label")).toMatch(/^Begin recovery/);
    const saveLine = host.querySelector(".gate__save");
    expect(saveLine?.getAttribute("role")).toBe("status");
    expect(saveLine?.textContent).toContain("Saved run found");
    expect(saveLine?.textContent).toContain(`Tick ${sim.tick}`);
    expect(saveLine?.textContent).toContain(`${sim.machines.length} machine`);
    expect(saveLine?.textContent).toContain("drone flying");
    expect(findButton("New game")).toBeDefined();

    act(() => primary?.click());
    expect(host.querySelector(".hud")).not.toBeNull();
    expect(store.getState().machines.length).toBe(sim.machines.length);
    expect(store.getState().tick).toBeGreaterThanOrEqual(sim.tick);
  });

  it("a settings-only envelope is not progress: fresh wording, kept preferences", () => {
    const fresh = createStore({ storage: memoryStorage(), now: () => Date.now() }).getState();
    window.localStorage.setItem(
      SAVE_KEY,
      encodeSave(fresh, Date.now(), { muted: true, reducedMotion: false, textScale: 1.25 })
    );
    const store = createStore();
    const { host } = mount(store);
    expect(findButton("Begin recovery")).toBeDefined();
    expect(findButton("Continue")).toBeUndefined();
    expect(findButton("New game")).toBeUndefined();
    expect(host.querySelector(".gate__save")?.textContent).toContain("A fresh yard is waiting");
    // The stored preference still loads: the gate mute face reads Sound off.
    expect(findButton("Sound off")).toBeDefined();
    expect(store.getSettings().muted).toBe(true);
    expect(store.getSettings().textScale).toBe(1.25);
  });

  it("New game opens the confirmation; Cancel and Escape leave the save byte-identical", () => {
    seedProgress();
    const reload = vi.fn();
    mount(createStore(), { reload });
    const before = window.localStorage.getItem(SAVE_KEY);
    expect(before).not.toBeNull();

    act(() => findButton("New game")?.click());
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain("permanently deletes");
    const confirm = findButton("Delete save and reset");
    expect(confirm?.disabled).toBe(true);
    // The safe action owns initial focus, so a stray Enter never confirms.
    expect(document.activeElement).toBe(findButton("Cancel"));

    act(() => findButton("Cancel")?.click());
    expect(dialog()).toBeNull();
    expect(window.localStorage.getItem(SAVE_KEY)).toBe(before);
    expect(reload).not.toHaveBeenCalled();

    act(() => findButton("New game")?.click());
    expect(dialog()).not.toBeNull();
    pressKey("Escape");
    expect(dialog()).toBeNull();
    expect(window.localStorage.getItem(SAVE_KEY)).toBe(before);
    expect(reload).not.toHaveBeenCalled();
  });

  it("acknowledged confirm clears the save and lease, then reloads to a fresh title", () => {
    seedProgress();
    const reload = vi.fn();
    mount(createStore(), { reload });
    act(() => findButton("New game")?.click());
    const confirm = findButton("Delete save and reset");
    expect(confirm?.disabled).toBe(true);
    // No reset without the deliberate acknowledgement.
    act(() => confirm?.click());
    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();

    const ack = document.querySelector<HTMLInputElement>(".reset-dialog__ack input");
    act(() => ack?.click());
    expect(confirm?.disabled).toBe(false);
    act(() => confirm?.click());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
    // The writer lease goes too, so the reloaded tab is not demoted to reader.
    expect(window.localStorage.getItem(LEASE_KEY)).toBeNull();
  });

  it("fresh-yard reset from gate Settings explains there is nothing to delete", () => {
    const reload = vi.fn();
    mount(createStore(), { reload });
    act(() => findButton("Settings")?.click());
    expect(document.querySelector(".gate-settings .panel--settings")).not.toBeNull();
    act(() => findButton("Reset game")?.click());
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain("no saved progress");
    const ack = document.querySelector<HTMLInputElement>(".reset-dialog__ack input");
    act(() => ack?.click());
    act(() => findButton("Delete save and reset")?.click());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it("post-start Menu exposes Reset game; cancel keeps the run, confirm resets it", () => {
    seedProgress();
    const reload = vi.fn();
    const { host } = mount(createStore(), { reload });
    act(() => findButton("Begin recovery")?.click());
    expect(host.querySelector(".hud")).not.toBeNull();

    act(() => menuFace()?.click());
    const row = menuRow("Reset game");
    expect(row).toBeDefined();
    act(() => row?.click());
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain("permanently deletes");
    act(() => findButton("Cancel")?.click());
    expect(dialog()).toBeNull();
    // The run is still persisted (ticks may have advanced; the envelope survives).
    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull();
    expect(reload).not.toHaveBeenCalled();

    // Cancel leaves the menu sheet open underneath, so the row is still reachable.
    expect(document.querySelector(".shell-menu")).not.toBeNull();
    act(() => menuRow("Reset game")?.click());
    const ack = document.querySelector<HTMLInputElement>(".reset-dialog__ack input");
    act(() => ack?.click());
    act(() => findButton("Delete save and reset")?.click());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEASE_KEY)).toBeNull();
  });

  it("no audio plays before the begin gesture; Begin voices the upgrade cue", async () => {
    const audio = fakeAudio();
    mount(createStore(), { audioApi: audio });
    // Let several real animation frames run while the gate is still up.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 90));
    });
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.resume).not.toHaveBeenCalled();
    act(() => findButton("Begin recovery")?.click());
    expect(audio.resume).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith("upgrade");
  });
});
