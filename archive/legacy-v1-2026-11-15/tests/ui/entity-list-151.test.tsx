/**
 * RW3D #151 (U04): the keyboard / screen-reader entity list.
 *
 * Acceptance: every building and unit is enumerable WITHOUT the canvas raycast —
 * real <button> rows with worded accessible names (kind + name/id + level +
 * status, never color alone), buildings before units (drones then road trucks),
 * building activation opens the inspector through the same panel stack a world
 * tap uses, unit activation focuses the camera only, the single role="status"
 * line is event-driven (never per-tick), Escape unwinds the stack and focus
 * returns to the opener, and the 44 px row floor + one declared panel scroller
 * hold in the shipped CSS.
 *
 * Method: jsdom DOM assertions only (no vision). The road slice goes through the
 * faithful engine-backed double from road-147.helpers; the App-level loop drives
 * the real store, the real toolbar/PanelHost focus contract and real window
 * keydown events. The built-app keyboard walkthrough lives in
 * tests/ui/keyboard-walkthrough-151.evidence.mjs (real key presses, real focus).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import shellRaw from "../../src/ui/shell/shell.css?raw";
import { EntityList } from "../../src/ui/shell/EntityList";
import { MapPanel } from "../../src/ui/shell/MapPanel";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { applyCommand } from "../../src/game/simulation/commands";
import { BLUEPRINTS } from "../../src/game/content/defs";
import { STATUS_LABEL } from "../../src/ui/text";
import { ENTITY_COPY, FLEET_COPY } from "../../src/ui/shell/copy";
import { waitReasonText } from "../../src/ui/logistics/fleetModel";
import { c, fixtureRuntime, makeRoadDouble } from "./road-147.helpers";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

function mount(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  act(() => {
    root.render(node);
  });
  return host;
}

function injectSheets(): void {
  for (const raw of [stylesRaw, shellRaw]) {
    const style = document.createElement("style");
    style.textContent = raw;
    document.head.appendChild(style);
  }
}

function click(node: Element): void {
  act(() => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function rows(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".entity-list__row")];
}

/** A yard with two buildings in engine order and a repaired starter drone. */
function seededState(): SimState {
  const state = createInitialState();
  expect(applyCommand(state, { id: "t-build-1", type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(true);
  expect(applyCommand(state, { id: "t-build-2", type: "machine.build", blueprint: "furnace", tile: 9 }).ok).toBe(true);
  expect(applyCommand(state, { id: "t-repair", type: "drone.repair" }).ok).toBe(true);
  return state;
}

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

function mapToolbarButton(): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>('.toolbar__btn[data-slot="map"]');
  if (!btn) throw new Error("missing Map toolbar destination");
  return btn;
}

afterEach(() => {
  act(() => {
    for (const root of mountedRoots) root.unmount();
  });
  mountedRoots.length = 0;
});

beforeEach(() => {
  document.body.innerHTML = "";
  injectSheets();
});

describe("EntityList — enumeration and worded names", () => {
  it("lists buildings in engine order, then drones, then road trucks", () => {
    const state = seededState();
    const road = makeRoadDouble();
    road.api.registerLogisticsCarrier({ capacity: 10, cell: c(3, 2) });
    road.api.registerLogisticsCarrier({ capacity: 8, cell: c(4, 2) });
    const host = mount(
      <EntityList state={state} onSelectMachine={() => {}} onFocusCell={() => {}} road={road.api} />
    );
    const list = rows(host);
    expect(list.map((row) => row.dataset.entity)).toEqual([
      "building",
      "building",
      "drone",
      "truck",
      "truck",
    ]);
    expect(list.map((row) => row.dataset.entityId)).toEqual([
      String(state.machines[0].id),
      String(state.machines[1].id),
      "1",
      "1",
      "2",
    ]);
    // Every row is a real button inside a labelled list — reachable by Tab.
    for (const row of list) {
      expect(row.tagName).toBe("BUTTON");
      expect(row.type).toBe("button");
      expect(row.closest("ul.entity-list__group")).not.toBeNull();
    }
    const groups = [...host.querySelectorAll("ul.entity-list__group")];
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual([
      ENTITY_COPY.buildings,
      ENTITY_COPY.units,
    ]);
  });

  it("names every building with kind, id, level and a worded status — never color alone", () => {
    const state = seededState();
    const host = mount(
      <EntityList state={state} onSelectMachine={() => {}} onFocusCell={() => {}} />
    );
    const buildingRows = rows(host).filter((row) => row.dataset.entity === "building");
    expect(buildingRows.length).toBe(2);
    state.machines.forEach((machine, index) => {
      const row = buildingRows[index];
      const def = BLUEPRINTS[machine.blueprint];
      const status = STATUS_LABEL[machine.status];
      const name = row.getAttribute("aria-label") ?? "";
      // The accessible name carries the full worded identity.
      expect(name).toContain(def.label);
      expect(name).toContain(String(machine.id));
      expect(name).toContain(`level ${machine.level}`);
      expect(name).toContain(status);
      expect(name).toContain(`cell ${machine.tile}`);
      // The same words are visible text, not a color swatch.
      const visible = row.textContent ?? "";
      expect(visible).toContain(def.label);
      expect(visible).toContain(status);
      expect(row.querySelector(".entity-list__status")?.textContent).toContain(status);
    });
  });

  it("words drone and truck statuses, including the exact typed blocker", () => {
    const state = createInitialState(); // starter drone is broken
    const road = makeRoadDouble();
    const carrier = road.api.registerLogisticsCarrier({ capacity: 10, cell: c(3, 2) });
    expect(carrier).not.toBeNull();
    const hold = { kind: "bay-full" as const, at: c(3, 2), capacity: 1 };
    fixtureRuntime(road.traffic, carrier!.id, { heldReason: hold });
    const host = mount(
      <EntityList state={state} onSelectMachine={() => {}} onFocusCell={() => {}} road={road.api} />
    );
    const droneRow = rows(host).find((row) => row.dataset.entity === "drone")!;
    expect(droneRow.getAttribute("aria-label")).toContain(FLEET_COPY.statusBroken);
    expect(droneRow.textContent).toContain(FLEET_COPY.statusBroken);
    expect(droneRow.getAttribute("aria-label")).toContain(`${FLEET_COPY.deliveries} 0`);
    const truckRow = rows(host).find((row) => row.dataset.entity === "truck")!;
    expect(truckRow.getAttribute("aria-label")).toContain(waitReasonText(hold));
    expect(truckRow.textContent).toContain(waitReasonText(hold));
    expect(truckRow.getAttribute("aria-label")).toContain("cell (3, 2)");
  });

  it("shows honest empty states for an empty yard", () => {
    const state = createInitialState();
    const host = mount(
      <EntityList state={state} onSelectMachine={() => {}} onFocusCell={() => {}} />
    );
    expect(rows(host).filter((row) => row.dataset.entity === "building")).toHaveLength(0);
    expect(host.textContent).toContain(ENTITY_COPY.emptyBuildings);
    // The broken starter drone is still enumerated — it is a real unit.
    expect(rows(host).filter((row) => row.dataset.entity === "drone")).toHaveLength(1);
  });
});

describe("EntityList — activation and announcements", () => {
  it("opens the inspector for a building and focuses the dock cell for a drone", () => {
    const state = seededState();
    const selected: number[] = [];
    const focused: { x: number; y: number }[] = [];
    const host = mount(
      <EntityList
        state={state}
        onSelectMachine={(id) => selected.push(id)}
        onFocusCell={(cell) => focused.push(cell)}
      />
    );
    const list = rows(host);
    click(list[0]);
    expect(selected).toEqual([state.machines[0].id]);
    expect(focused).toHaveLength(0);
    const announce = host.querySelector('[role="status"]')!;
    expect(announce.textContent).toBe(`${ENTITY_COPY.inspecting} ${BLUEPRINTS[state.machines[0].blueprint].label} ${state.machines[0].id}`);

    const droneRow = list.find((row) => row.dataset.entity === "drone")!;
    click(droneRow);
    // Drones fly store <-> machine; they focus the dock cell they operate from.
    expect(focused).toEqual([{ x: 2, y: 0 }]);
    expect(selected).toEqual([state.machines[0].id]); // no inspector for units
    expect(announce.textContent).toBe(`${ENTITY_COPY.focused} ${FLEET_COPY.unit} 1`);
  });

  it("focuses the truck's own engine cell, not a guess", () => {
    const state = seededState();
    const road = makeRoadDouble();
    road.api.registerLogisticsCarrier({ capacity: 10, cell: c(5, 3) });
    const focused: { x: number; y: number }[] = [];
    const host = mount(
      <EntityList
        state={state}
        onSelectMachine={() => {}}
        onFocusCell={(cell) => focused.push(cell)}
        road={road.api}
      />
    );
    const truckRow = rows(host).find((row) => row.dataset.entity === "truck")!;
    click(truckRow);
    expect(focused).toEqual([{ x: 5, y: 3 }]);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      `${ENTITY_COPY.focused} ${ENTITY_COPY.truck} 1`
    );
  });

  it("keeps the status line event-driven: sim ticks never rewrite it", () => {
    const state = seededState();
    const host = mount(
      <EntityList state={state} onSelectMachine={() => {}} onFocusCell={() => {}} />
    );
    const announce = host.querySelector('[role="status"]')!;
    expect(announce.textContent).toBe("");
    // Advance the engine the way App does between frames: many ticks, new refs.
    act(() => {
      for (let i = 0; i < 120; i += 1) {
        applyCommand(state, { id: `tick-${i}`, type: "manual.salvage" });
      }
    });
    const root = mountedRoots[mountedRoots.length - 1];
    act(() => {
      root.render(
        <EntityList state={{ ...state }} onSelectMachine={() => {}} onFocusCell={() => {}} />
      );
    });
    expect(announce.textContent).toBe(""); // no per-tick chatter
    click(rows(host)[0]);
    expect(announce.textContent).not.toBe(""); // activation is the only writer
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  });
});

describe("MapPanel — legacy mounts and the wired list", () => {
  it("keeps the region card and stays list-free without the callbacks", () => {
    const state = seededState();
    const host = mount(<MapPanel state={state} onClose={() => {}} />);
    expect(host.querySelector(".shell-region")).not.toBeNull();
    expect(host.querySelector(".entity-list")).toBeNull();
  });

  it("mounts the entity list inside the one declared panel scroller", () => {
    const state = seededState();
    const host = mount(
      <MapPanel state={state} onClose={() => {}} onSelectMachine={() => {}} onFocusCell={() => {}} />
    );
    const body = host.querySelector(".panel__body")!;
    expect(body.querySelector(".entity-list")).not.toBeNull();
    // Exactly one scroller: the panel body owns it; the list never declares overflow.
    expect(stylesRaw).toMatch(/\.panel__body\s*\{[^}]*overflow:\s*hidden auto/);
    const entityBlock = shellRaw.slice(shellRaw.indexOf(".entity-list {"));
    expect(entityBlock.slice(0, entityBlock.indexOf(".entity-list__row:focus-visible"))).not.toMatch(
      /overflow(-y)?:\s*(auto|scroll)/
    );
  });
});

describe("shipped CSS — touch floor and focus ring", () => {
  it("keeps 44 px rows and a visible focus-visible ring", () => {
    expect(shellRaw).toMatch(/\.entity-list__row\s*\{[^}]*min-height:\s*44px/);
    expect(shellRaw).toMatch(/\.entity-list__row:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  });
});

describe("App — the keyboard-only loop through the real shell", () => {
  function seededStore(): GameStore {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const state = store.getState();
    state.tutorial = 9;
    state.exportClaimed = true;
    state.credits = 200;
    expect(store.dispatch({ id: "k-build", type: "machine.build", blueprint: "sorter", tile: 8 }).ok).toBe(true);
    expect(store.dispatch({ id: "k-repair", type: "drone.repair" }).ok).toBe(true);
    return store;
  }

  it("walks build-list -> inspect -> upgrade -> Escape with focus restored to the opener", () => {
    const store = seededStore();
    mount(<App store={store} />);
    act(() => findButton("Begin recovery")?.click());

    // Keyboard entry: focus the Map destination (Tab order), then activate it.
    const mapBtn = mapToolbarButton();
    act(() => {
      mapBtn.focus();
      mapBtn.click();
    });
    expect(document.querySelector(".entity-list")).not.toBeNull();
    expect(document.querySelector(".shell-host")?.getAttribute("data-depth")).toBe("1");

    // The building row is a real button: focus it, activate it.
    const row = document.querySelector<HTMLButtonElement>('.entity-list__row[data-entity="building"]')!;
    const machineId = store.getState().machines[0].id;
    expect(row.getAttribute("aria-label")).toContain(`level 1`);
    act(() => {
      row.focus();
      row.click();
    });
    // The inspector pushed onto the stack; Back appeared; the list survives under it.
    expect(document.querySelector(".shell-host")?.getAttribute("data-depth")).toBe("2");
    const details = document.querySelector('[role="group"][aria-label$="details"]');
    expect(details).not.toBeNull();
    expect(findButton("Back to previous panel")).toBeDefined();

    // Upgrade from the inspector (a native button — no pointer needed).
    const upgrade = findButton("Upgrade ·");
    expect(upgrade).toBeDefined();
    const creditsBefore = store.getState().credits;
    act(() => upgrade!.click());
    expect(store.getState().machines[0].level).toBe(2);
    expect(store.getState().credits).toBeLessThan(creditsBefore);

    // Escape pops the inspector; the Map (and its list) is still there.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".shell-host")?.getAttribute("data-depth")).toBe("1");
    expect(document.querySelector(".entity-list")).not.toBeNull();
    // The upgraded level is worded in the row's accessible name.
    const rowAfter = document.querySelector<HTMLButtonElement>(
      `.entity-list__row[data-entity="building"][data-entity-id="${machineId}"]`
    )!;
    expect(rowAfter.getAttribute("aria-label")).toContain("level 2");

    // Escape closes the Map; focus returns to the toolbar button that opened it.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".shell-host")).toBeNull();
    expect(document.activeElement).toBe(mapBtn);
  });

  it("opens the Map with digit 6 and keeps unit activation camera-only", () => {
    const store = seededStore();
    mount(<App store={store} />);
    act(() => findButton("Begin recovery")?.click());

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "6", bubbles: true }));
    });
    expect(document.querySelector(".entity-list")).not.toBeNull();

    // A drone row focuses the camera; no inspector layer may appear.
    const droneRow = document.querySelector<HTMLButtonElement>('.entity-list__row[data-entity="drone"]')!;
    act(() => {
      droneRow.focus();
      droneRow.click();
    });
    expect(document.querySelector(".shell-host")?.getAttribute("data-depth")).toBe("1");
    expect(document.querySelector('[role="group"][aria-label$="details"]')).toBeNull();
    expect(document.querySelector(".entity-list [role='status']")?.textContent).toContain("Focused");

    // Escape closes the destination. The opener here was the body (digit-key
    // entry), which is the shell's existing restore target — documented, not
    // reinvented: the toolbar-button path above proves real focus return.
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".shell-host")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
