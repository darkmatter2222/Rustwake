import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import stylesRaw from "../../src/ui/styles.css?raw";
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

/**
 * React tracks the value it wrote, so assigning `.value` directly makes it treat the
 * following input event as its own and drop the change. The prototype setter is the
 * documented way to drive a controlled field from a test.
 */
function typeInto(field: HTMLTextAreaElement | undefined, text: string) {
  if (!field) return;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  act(() => {
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
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
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
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

  it("cycles the text scale, persists it, and marks the large-text layout", () => {
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    expect(store.getSettings().textScale).toBe(1);
    expect(document.documentElement.classList.contains("text-large")).toBe(false);

    // 1 -> 1.25 -> 1.5 -> 2 -> 1, the four steps the control offers (spec 6.4).
    act(() => findButton("Text size")?.click());
    expect(store.getSettings().textScale).toBe(1.25);
    act(() => findButton("Text size")?.click());
    expect(store.getSettings().textScale).toBe(1.5);
    expect(document.documentElement.classList.contains("text-large")).toBe(true);
    act(() => findButton("Text size")?.click());
    expect(store.getSettings().textScale).toBe(2);
    act(() => findButton("Text size")?.click());
    expect(store.getSettings().textScale).toBe(1);
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1");
    expect(storage.raw.get(SAVE_KEY)).toContain('"textScale":1');
  });

  it("leaves build mode on Escape instead of applying a remembered ghost", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => store.step(262)); // first autonomous delivery, which reaches T4
    const before = store.getState().machines.length;
    act(() => findButton("Build Scrap sorter")?.click());
    // The build-mode row is the one with the Cancel target (PLAY-001 P-3: the primary
    // label no longer changes between the two phases of one committed choice).
    expect(findButton("Cancel")).toBeDefined();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(findButton("Cancel")).toBeUndefined();
    expect(findButton("Build Scrap sorter")).toBeDefined();
    expect(store.getState().machines.length).toBe(before);
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
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Connect dock to sorter")?.click());
    act(() => store.step(400));
    expect(findButton("Build Furnace")).toBeDefined();
    act(() => findButton("Build Furnace")?.click());
    act(() => findButton("Build Furnace")?.click());
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
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
    const toast = document.querySelector(".toast");
    // PLAY-001 P-1: the same blocked tap now states its own shortfall.
    expect(toast?.textContent).toBe("Need 20 scrap · have 0");
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
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
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

  it("keeps the card one short line and the dock verb identical (spec 3.3, B-26/B-27)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => store.step(262));
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Build Scrap sorter")?.click());
    act(() => findButton("Connect dock to sorter")?.click());
    act(() => store.step(300));

    // The card's first line, not the secondary hint beneath it. During the tutorial the
    // authored line is the teacher, and it stays inside one line at this width.
    const card = (document.querySelector(".objective > span")?.textContent ?? "").trim();
    expect(card.length).toBeLessThanOrEqual(56);
    expect(card).toContain("Refine metal");

    // Past the tutorial both surfaces come from the same yard step (spec 3.3): one goal,
    // phrased on the card and answered by the dock's verb plus its price.
    store.getState().tutorial = 9;
    act(() => store.step(1));
    const finalCard = (document.querySelector(".objective > span")?.textContent ?? "").trim();
    const primary = (document.querySelector(".dock__btn--primary")?.textContent ?? "").trim();
    expect(finalCard.length).toBeLessThanOrEqual(48);
    expect(finalCard.split(" ")[0]).toBe(primary.split(" ")[0]);
    expect(primary).not.toContain("NaN");
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

  it("gives every research card its own state line and a DOM cost node (Q-001r R-11..R-13)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => store.step(262));
    const state = store.getState();
    state.store["data"] = 6;
    state.storeUnits += 6;
    act(() => store.step(1));
    act(() => findButton("Research")?.click());
    const cards = [...document.querySelectorAll(".panel .node")];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const stateLine = card.querySelector("p.node__state");
      const cost = card.querySelector(".node__cost");
      expect(stateLine).not.toBeNull();
      expect(cost?.textContent ?? "").toMatch(/^\d+ Data$/);
      const mode = card.getAttribute("data-state");
      const text = stateLine?.textContent ?? "";
      if (mode === "known") expect(text).toBe("Known");
      else if (mode === "locked") expect(text).toMatch(/^Needs .* first$/);
      else expect(text).toBe(`Buy · ${cost?.textContent ?? ""}`);
    }
  });

  it("unlocks the Yard target after the tutorial and shows the save text (B-06)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    // The first ten minutes keep three dock targets, so the record is not there yet.
    expect(findButton("Yard")).toBeUndefined();

    const state = store.getState();
    state.tutorial = 9;
    act(() => store.step(1));
    expect(findButton("Yard")).toBeDefined();
    act(() => findButton("Yard")?.click());

    const panel = document.querySelector(".panel");
    expect(panel?.textContent).toContain("Yard record");
    expect(panel?.textContent).toContain("Saved yard");
    expect(panel?.textContent).toContain(`Tick${state.tick}`);
    const field = panel?.querySelector("textarea") as HTMLTextAreaElement | undefined;
    expect(field?.value.startsWith('{"schemaVersion":1,')).toBe(true);
    expect(JSON.parse(field?.value ?? "{}").payload.sim.tick).toBe(state.tick);
    expect(findButton("Copy")).toBeDefined();
    expect(findButton("Import")).toBeDefined();
  });

  it("imports a pasted yard and keeps the running one when the text is damaged (B-06)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    const state = store.getState();
    state.tutorial = 9;
    act(() => store.step(1));

    // A yard from another device: repaired drone, one machine, one link, batches.
    const source = createStore({ storage: memoryStorage(), now: () => 500 });
    for (let i = 0; i < 6; i += 1) {
      source.dispatch({ id: `q${i}`, type: "manual.salvage" });
      source.step(TUNING.manualPulseTicks);
    }
    source.dispatch({ id: "qre", type: "drone.repair" });
    source.step(262);
    source.dispatch({ id: "qb1", type: "machine.build", blueprint: "sorter", tile: 8 });
    const sorter = source.getState().machines[0];
    source.dispatch({ id: "qr1", type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
    source.step(400);
    const text = source.exportSave();

    act(() => findButton("Yard")?.click());
    act(() => findButton("Import")?.click());
    const field = document.querySelector(".panel textarea") as HTMLTextAreaElement;
    expect(field).toBeDefined();
    typeInto(field, text);
    act(() => findButton("Apply")?.click());
    expect(store.getState().tick).toBe(source.getState().tick);
    expect(store.getState().machines.length).toBe(1);
    expect(document.querySelector(".panel")?.textContent).toContain("Applied");

    // A damaged file is refused and the yard stays exactly where it was.
    const settled = JSON.stringify(store.getState());
    typeInto(field, "not json");
    act(() => findButton("Apply")?.click());
    expect(document.querySelector(".panel")?.textContent).toContain("Not a Rustwake file");
    expect(JSON.stringify(store.getState())).toBe(settled);
  });
});

describe("REV-LAYOUT-g1 chrome rows", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /** jsdom gets no cascade unless the sheet is in the document (vitest stubs the import). */
  function injectSheet() {
    const style = document.createElement("style");
    style.textContent = stylesRaw;
    document.head.appendChild(style);
  }

  it("L-2: the guidance line keeps its own block at text scale 1 and 2", () => {
    injectSheet();
    for (const textScale of [1, 2]) {
      const store = createStore({ storage: memoryStorage(), now: () => 10 });
      act(() => {
        store.setSettings({ textScale });
      });
      mount(store);
      act(() => findButton("Begin recovery")?.click());
      expect(document.documentElement.classList.contains("text-large")).toBe(textScale >= 1.5);
      expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe(String(textScale));
      const hint = document.querySelector(".status-line");
      const row = document.querySelector(".objective__row");
      expect(hint).not.toBeNull();
      expect(row).not.toBeNull();
      const hintStyle = hint ? getComputedStyle(hint) : null;
      const rowStyle = row ? getComputedStyle(row) : null;
      console.log(`L-2 ts${textScale} measured`, JSON.stringify({
        sheetBytes: stylesRaw.length,
        hintDisplay: hintStyle?.display ?? null,
        hintFontSize: hintStyle?.fontSize ?? null,
        hintMargin: hintStyle?.marginTop ?? null,
        hintParent: hint?.parentElement?.className ?? null,
        rowDisplay: rowStyle?.display ?? null,
        text: hint?.textContent ?? null,
      }));
      // The hint is a direct child of the card and stays a block in both rules' band,
      // so the collapsed chip row cannot take its height with it.
      expect(hintStyle?.display).toBe("block");
      expect(hint?.parentElement?.className).toBe("objective");
      expect((hint?.textContent ?? "").length).toBeGreaterThan(0);
      expect(rowStyle?.display).toBe(textScale >= 1.5 ? "none" : "flex");
    }
  });

  it("L-3: one dock row at text scale 2 keeps the 46 px floor on every button", () => {
    injectSheet();
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    act(() => {
      store.setSettings({ textScale: 2 });
    });
    mount(store);
    act(() => findButton("Begin recovery")?.click());
    for (let i = 0; i < 6; i += 1) {
      act(() => findButton("Salvage")?.click());
      act(() => store.step(TUNING.manualPulseTicks));
    }
    act(() => findButton("Repair drone")?.click());
    act(() => store.step(262));
    const state = store.getState();
    state.store["data"] = 6;
    state.storeUnits += 6;
    state.tutorial = 9; // the five dock targets, as in the measured yard fixture
    act(() => store.step(1));

    const dock = document.querySelector(".dock");
    const buttons = [...document.querySelectorAll(".dock__btn")] as HTMLButtonElement[];
    const costs = [...document.querySelectorAll(".dock__cost")];
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const btnStyle = buttons[0] ? getComputedStyle(buttons[0]) : null;
    const costStyle = costs[0] ? getComputedStyle(costs[0]) : null;
    console.log("L-3 ts2 measured", JSON.stringify({
      buttons: buttons.map((b) => (b.textContent ?? "").trim().split(" ")[0]),
      flexWrap: dockStyle?.flexWrap ?? null,
      gap: dockStyle?.gap ?? null,
      btnFontSize: btnStyle?.fontSize ?? null,
      btnPadding: btnStyle?.padding ?? null,
      btnMinHeight: btnStyle?.minHeight ?? null,
      btnLineHeight: btnStyle?.lineHeight ?? null,
      costNodes: costs.length,
      costFontSize: costStyle?.fontSize ?? null,
    }));

    expect(buttons.length).toBe(5);
    // One row: the row may not wrap, so the five labels have to fit their measured
    // 370 px (chromium: 51.1 + 44 + 134.8 + 49.6 + 82.5 + 4 x 2 px gaps = 370), and
    // the height floor is untouched by the smaller type.
    expect(dockStyle?.flexWrap).toBe("nowrap");
    expect(dockStyle?.gap).toBe("2px");
    for (const button of buttons) {
      expect(getComputedStyle(button).minHeight).toBe("46px");
      expect(getComputedStyle(button).fontSize).toBe("0.62rem");
    }
    expect(costs.length).toBeGreaterThan(0);
    expect(costStyle?.fontSize).toBe("0.5rem");
  });
});
