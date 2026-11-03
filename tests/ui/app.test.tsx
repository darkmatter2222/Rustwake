import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App, buildPrimary } from "../../src/ui/App";
import { MachinePanel } from "../../src/ui/Panels";
import { createStore, type GameStore } from "../../src/app/store";
import { SAVE_KEY } from "../../src/game/persistence/save";
import { LEASE_TTL_MS } from "../../src/game/persistence/lease";
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

  it("sells a surplus from the store panel after the first contract", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => store.step(262));
    act(() => findButton("Build sorter")?.click());
    act(() => findButton("Place")?.click());
    act(() => findButton("Connect dock to sorter")?.click());
    act(() => store.step(400));
    expect(findButton("Build furnace")).toBeDefined();
    act(() => findButton("Build furnace")?.click());
    act(() => findButton("Place")?.click());
    const connectFurnace = findButton("Connect sorter to furnace");
    expect(connectFurnace).toBeDefined();
    act(() => connectFurnace?.click());
    act(() => store.step(900));
    expect(store.getState().store["steel"] ?? 0).toBeGreaterThanOrEqual(3);
    act(() => findButton("Sell steel")?.click());
    expect(store.getState().credits).toBe(TUNING.exportContractCredits);
    act(() => store.step(1));
    expect(store.getState().tutorial).toBeGreaterThanOrEqual(8);

    // Scrap keeps arriving from the drone, so a repeatable sell tranche appears.
    act(() => store.step(400));
    act(() => findButton("Store")?.click());
    const sell = findButton("Sell ");
    expect(sell).toBeDefined();
    const label = (sell as HTMLButtonElement).textContent ?? "";
    const units = Number(label.match(/Sell (\d+)/)?.[1]);
    const gained = Number(label.match(/\+(\d+)/)?.[1]);
    const before = store.getState().credits;
    act(() => sell?.click());
    expect(store.getState().credits).toBe(before + gained);
    expect(units).toBeGreaterThan(0);
  });

  it("offers Connect first when a selected machine has an unmet link", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const state = store.getState();
    state.tutorial = 9;
    state.exportClaimed = true;
    state.credits = 200;
    state.store["scrap"] = 60;
    state.store["ferrous"] = 20;
    state.storeUnits = 80;
    act(() => store.step(1));
    const actions: string[] = [];
    act(() => findButton("Store")?.click());
    const built = store.dispatch({ id: "ui-1", type: "machine.build", blueprint: "sorter", tile: 8 });
    expect(built.ok).toBe(true);
    const built2 = store.dispatch({
      id: "ui-2",
      type: "machine.build",
      blueprint: "furnace",
      tile: 9,
    });
    expect(built2.ok).toBe(true);
    const furnace = state.machines[state.machines.length - 1];
    const primary = buildPrimary(
      store,
      (command) => store.dispatch(command),
      furnace.id,
      (id) => actions.push(`build:${id}`),
      (tile) => actions.push(`tile:${tile}`)
    );
    expect(primary.label).toBe("Connect");
    act(() => {
      primary.run();
      actions.push("ran");
    });
    // Both the input link and the outgoing link are created by one action, on
    // the selected machine: the store feeds the furnace and the furnace ships
    // its steel back to the store (B-23 keys a plan on this machine's end).
    expect(state.routes.length).toBe(2);
    expect(state.machines[1].inRoutes.length).toBe(1);
    expect(state.machines[1].outRoute).not.toBeNull();
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

  it("dismisses its own toast while the frame loop keeps running", async () => {    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => findButton("Repair drone")?.click()); // duplicate → one local toast
    expect(document.querySelector(".toast")?.textContent).toBe("Already connected");
    // The simulation re-renders the shell many times before the toast expires.
    await act(async () => {
      store.step(30);
      await new Promise((resolve) => setTimeout(resolve, 1900));
    });
    expect(document.querySelector(".toast")).toBeNull();
  });

  it("mirrors a second tab in the shell and hands over after the lease lapses", () => {
    const storage = memoryStorage();
    let clock = 10;
    const first = createStore({ storage, now: () => clock, leaseId: "tab-a" });
    for (const id of ["m1", "m2"]) {
      first.dispatch({ id, type: "manual.salvage" });
      first.step(36);
    }

    const second = createStore({ storage, now: () => clock, leaseId: "tab-b" });
    expect(second.getRole()).toBe("reader");
    mount(second);
    act(() => findButton("Begin recovery")?.click());
    expect(document.querySelector(".objective")?.textContent).toContain("Following the other tab");
    expect(findButton("Take over")).toBeDefined();

    act(() => findButton("Take over")?.click());
    expect(second.getRole()).toBe("reader"); // the owner is still live

    clock += LEASE_TTL_MS + 1;
    act(() => findButton("Take over")?.click());
    expect(second.getRole()).toBe("writer");
    expect(findButton("Take over")).toBeUndefined();
    expect(second.getState().store["scrap"]).toBe(first.getState().store["scrap"]);
  });

  it("shows measured diagnosis lines in the machine panel", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => store.step(262));
    act(() => findButton("Build sorter")?.click());
    act(() => findButton("Place")?.click());
    act(() => findButton("Connect dock to sorter")?.click());
    act(() => store.step(300));

    const state = store.getState();
    const machine = state.machines[0];
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(
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
    const text = host.textContent ?? "";
    // Measured evidence plus one next step, no NaN, and the machine is working.
    expect(text).toContain("Working ");
    expect(text).toContain("% busy");
    expect(text).toContain("Next step");
    expect(text).not.toContain("NaN");
    // The rate line names the window it covers (spec 9.4). At 300 ticks the
    // machine is younger than one window, so that window is all available time.
    expect(text).toContain("s window");
    expect(text).toContain(`${(machine.batchesDone / 30).toFixed(2)} batches/s`);
    expect(machine.busyTicks).toBeGreaterThan(0);
    expect(machine.ageTicks).toBe(300);
  });

  it("adds a Research target to the dock once data exists", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => store.step(262));
    // Nothing to spend yet, so the dock stays at three targets.
    expect(findButton("Research")).toBeUndefined();

    const state = store.getState();
    state.store["data"] = 6;
    state.storeUnits += 6;
    act(() => store.step(1));
    expect(findButton("Research")).toBeDefined();
    act(() => findButton("Research")?.click());

    const panel = () => document.querySelector(".panel")?.textContent ?? "";
    const opened = panel();
    // Every node states its exact effect and cost before it is bought (12.2).
    expect(opened).toContain("Efficient Cutters");
    expect(opened).toContain("One cutting pulse gives 7 scrap instead of 5.");
    expect(opened).toContain("Buy · 4 Data");
    expect(opened).toContain("Needs Efficient Cutters first");

    act(() => findButton("Buy · 4 Data")?.click());
    expect(store.getState().research.cutters).toBe(1);
    expect(store.getState().store["data"]).toBe(2);
    expect(panel()).toContain("Known");
    // The next node is now open, and the purchased one cannot be bought twice.
    expect(panel()).toContain("Buy · 8 Data");
    expect(panel().indexOf("Known")).toBeLessThan(panel().indexOf("Buy · 8 Data"));
  });
});
