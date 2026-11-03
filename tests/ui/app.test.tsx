import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { SAVE_KEY } from "../../src/game/persistence/save";
import { TUNING } from "../../src/game/content/defs";

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

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (node) => (node.textContent ?? "").trim().startsWith(label)
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

describe("first-feel shell", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the start gate with a single begin action and mute toggle", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    expect(host.querySelector(".gate")).not.toBeNull();
    expect(findButton("Begin recovery")).toBeDefined();
    expect(findButton("Sound on")).toBeDefined();
    expect(document.querySelectorAll("canvas").length).toBe(1);
  });

  it("enters the yard and salvages on the primary action without page scroll", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const host = mount(store);
    act(() => findButton("Begin recovery")?.click());
    expect(host.querySelector(".hud")).not.toBeNull();
    const salvage = findButton("Salvage");
    expect(salvage).toBeDefined();
    act(() => salvage?.click());
    expect(store.getState().store["scrap"]).toBe(5);
    // No-scroll gate: the document does not exceed the visual viewport.
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight + 1);
  });

  it("walks the tutorial to an automated delivery", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    expect(store.getState().tutorial).toBe(2);
    act(() => findButton("Repair drone")?.click());
    expect(store.getState().drone.repaired).toBe(true);
    act(() => store.step(262));
    expect(store.getState().drone.deliveries).toBeGreaterThan(0);
    expect(store.getState().tutorial).toBeGreaterThanOrEqual(4);
    act(() => findButton("Build sorter")?.click());
    act(() => findButton("Place")?.click());
    expect(store.getState().machines.length).toBe(1);
    act(() => findButton("Connect dock to sorter")?.click());
    expect(store.getState().routes.length).toBe(2);
  });

  it("keeps mute state across reloads", () => {
    const storage = memoryStorage();
    const first = createStore({ storage, now: () => 10 });
    const host = mount(first);
    act(() => findButton("Begin recovery")?.click());
    act(() => findButton("Sound on")?.click());
    expect(first.getSettings().muted).toBe(true);
    expect(host.querySelector(".hud")).not.toBeNull();

    const second = createStore({ storage, now: () => 20 });
    expect(second.getSettings().muted).toBe(true);
    expect(storage.raw.get(SAVE_KEY)).toContain('"muted":true');
  });

  it("explains a blocked action with one local toast and no charge", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    expect(store.getState().drone.repaired).toBe(true);
    act(() => store.step(1));
    act(() => findButton("Build sorter")?.click());
    act(() => findButton("Place")?.click());
    const toast = document.querySelector(".toast");
    expect(toast?.textContent).toBe("Not enough material");
    expect(store.getState().machines.length).toBe(0);
  });
});
