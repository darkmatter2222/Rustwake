import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import { StorePanel } from "../../src/ui/Panels";
import { RESOURCES } from "../../src/game/content/defs";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { RESOURCE_LABEL, formatNumber } from "../../src/ui/text";

/**
 * UI-RESET-56 (issue #56): the rebuilt yard store's structure and reads.
 *
 * Covers the acceptance criteria that are statements about what the panel paints:
 * legible grouped inventory rows (glyph, stock, capacity share, supply/demand cue),
 * the separated diagnostics surface with the full-storage cause and recovery
 * options, the preserved row grammar and the capacity fact printed exactly once,
 * and the pre-contract lock. Trade interactions live in store-56-trade.test.tsx.
 *
 * Fixture mutation happens only here in test code (documented seeds below); every
 * machine is built through the real `applyCommand` path, never by injecting state.
 */

let seq = 5600;
function send(state: SimState, body: CommandBody): unknown {
  return applyCommand(state, { ...body, id: `s56-${(seq += 1)}` } as Command);
}

/** Past the tutorial and the first contract, with an explicit stock seed. */
function seeded(mutate: (state: SimState) => void): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.exportClaimed = true;
  for (const resource of RESOURCES) state.store[resource] = 0;
  state.storeUnits = 0;
  state.overflow = [];
  mutate(state);
  return state;
}

/** The full-storage seed: plates 880 + scrap 20 = 900/900, 40 scrap outside. */
function fullStore(): SimState {
  return seeded((s) => {
    s.store.plates = 880;
    s.store.scrap = 20;
    s.storeUnits = 900;
    s.overflow = [{ resource: "scrap", qty: 40 }];
  });
}

/** A yard with one sorter and one furnace, built through real commands. */
function yardWithMachines(): SimState {
  const state = seeded((s) => {
    s.store.scrap = 100;
    s.store.ferrous = 20;
    s.storeUnits = 120;
  });
  expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 })).toMatchObject({ ok: true });
  expect(send(state, { type: "machine.build", blueprint: "furnace", tile: 9 })).toMatchObject({ ok: true });
  return state;
}

function mount(state: SimState): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const dispatch = (command: Command) => {
    const result = applyCommand(state, command);
    act(() => {
      root.render(<StorePanel state={state} dispatch={dispatch} onClose={() => undefined} />);
    });
    return result;
  };
  act(() => {
    root.render(<StorePanel state={state} dispatch={dispatch} onClose={() => undefined} />);
  });
  return host;
}

function injectSheet() {
  const style = document.createElement("style");
  style.textContent = stylesRaw;
  document.head.appendChild(style);
}

function rowFor(host: HTMLElement, resource: string): HTMLElement {
  const row = host.querySelector<HTMLElement>(`.store-row[data-resource="${resource}"]`);
  expect(row, `inventory row for ${resource}`).not.toBeNull();
  return row as HTMLElement;
}

function diagValue(host: HTMLElement, label: string): string | null {
  const rows = Array.from(host.querySelectorAll<HTMLElement>(".store-section--diag .panel__row"));
  const row = rows.find((r) => r.querySelector("dt")?.textContent === label);
  return row ? (row.querySelector("dd")?.textContent ?? null) : null;
}

/** The i18n scan's key shape: nothing painted may look like an unresolved key. */
const KEY_PATTERN =
  /\b(btn|row|value|card|step|hint|unit|res|status|reject|import|report|note|field|title|aria|gate|sound|glyph|advice|evidence|yard|tut|objective|bottleneck|reader|chip|hud|phase)\.[a-z]/;

function paintedText(host: HTMLElement): string[] {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent ?? "";
    if (text.trim() !== "") texts.push(text);
  }
  return texts;
}

describe("UI-RESET-56 store structure, groups and diagnostics", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheet();
  });

  it("keeps the preserved row grammar and prints the capacity fact exactly once", () => {
    const host = mount(fullStore());
    const panel = host.querySelector<HTMLElement>(".panel--store");
    expect(panel).not.toBeNull();

    const dl = host.querySelector("dl") as HTMLElement;
    expect(getComputedStyle(dl).display).toBe("grid");
    expect(getComputedStyle(dl).gridTemplateColumns).toBe("1fr");

    const body = host.querySelector(".panel__body") as HTMLElement;
    expect(getComputedStyle(body).overflow).toContain("auto");

    const rows = Array.from(host.querySelectorAll<HTMLElement>(".panel__row"));
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      const style = getComputedStyle(row);
      expect(style.display).toBe("flex");
      expect(style.alignItems).toBe("baseline");
      const children = Array.from(row.children);
      expect(children[0]?.tagName).toBe("DT");
      expect(children[1]?.tagName).toBe("DD");
    }

    const text = host.textContent ?? "";
    expect(text).toContain("Capacity");
    expect(text.split("900/900").length - 1).toBe(1);
  });

  it("groups every resource raw / intermediate / finished with glyph, stock, share and cue", () => {
    const host = mount(fullStore());

    const raw = host.querySelector('.store-group--raw[aria-label="Raw materials"]');
    const mid = host.querySelector('.store-group--intermediate[aria-label="Intermediate materials"]');
    const fin = host.querySelector('.store-group--finished[aria-label="Finished goods"]');
    expect(raw).not.toBeNull();
    expect(mid).not.toBeNull();
    expect(fin).not.toBeNull();

    const ids = (section: Element | null) =>
      Array.from(section?.querySelectorAll(".store-row") ?? []).map((r) => r.getAttribute("data-resource"));
    expect(ids(raw)).toEqual(["scrap"]);
    expect(ids(fin)).toEqual(["alloy", "data", "chassis"]);
    expect(ids(mid)).toEqual([
      "ferrous",
      "nonferrous",
      "residue",
      "copper",
      "polymer",
      "wire",
      "plates",
      "steel",
      "circuits",
      "motors",
      "battery",
    ]);

    // Every one of the 15 resources is reachable, zero stock included.
    const allRows = host.querySelectorAll(".store-row");
    expect(allRows.length).toBe(RESOURCES.length);
    for (const resource of RESOURCES) {
      const row = rowFor(host, resource);
      const held = host.querySelector(`.store-row[data-resource="${resource}"]`)?.getAttribute("data-stock");
      expect(row.querySelector("dt svg"), `${resource} glyph`).not.toBeNull();
      expect(row.querySelector("dd")?.textContent).toBe(formatNumber(Number(held)));
      expect(row.querySelector(".store-row__share")?.textContent).toMatch(/^\d+% of capacity$/);
      expect(row.querySelector(".store-row__cue")?.textContent).toMatch(/ · /);
    }

    // The full seed's shares: plates 880/900 = 98%, scrap 20/900 = 2%, zero rows 0%.
    expect(rowFor(host, "plates").querySelector(".store-row__share")?.textContent).toBe("98% of capacity");
    expect(rowFor(host, "scrap").querySelector(".store-row__share")?.textContent).toBe("2% of capacity");
    expect(rowFor(host, "chassis").getAttribute("data-stock")).toBe("0");
    expect(rowFor(host, "chassis").querySelector(".store-row__share")?.textContent).toBe("0% of capacity");
  });

  it("reads supply and demand cues from the yard's own machines", () => {
    const host = mount(yardWithMachines());
    const cue = (resource: string) => rowFor(host, resource).querySelector(".store-row__cue")?.textContent;
    // Sorter uses scrap; sorter makes ferrous and the furnace uses it; furnace makes steel.
    expect(cue("scrap")).toBe("salvage + drones · used by 1");
    expect(cue("ferrous")).toBe("made by 1 · used by 1");
    expect(cue("steel")).toBe("made by 1 · not used yet");
    expect(cue("chassis")).toBe("not made yet · not used yet");
  });

  it("separates diagnostics from trade and explains a full store with recovery options", () => {
    const host = mount(fullStore());
    const diag = host.querySelector(".store-section--diag");
    expect(diag).not.toBeNull();
    expect(diag?.querySelector("button")).toBeNull(); // no trade action lives in diagnostics

    expect(diagValue(host, "Capacity")).toBe("900/900");
    expect(diagValue(host, "Sell floor")).toBe("10 units kept per material");
    expect(diagValue(host, "Overflow hold")).toBe("40");
    expect(diagValue(host, "Storage cause")).toBe(
      "Storage is full at 100%. Sell a surplus in the yard store to free room.",
    );
    expect(diagValue(host, "Largest holds")).toBe("Plates 880 · Scrap 20");
    expect(diagValue(host, "Recovery")).toBe(
      "Sell a tranche in the trade desk · 40 units held outside return as space frees",
    );
  });

  it("omits the full-storage cause when the store is not full", () => {
    const host = mount(
      seeded((s) => {
        s.store.plates = 100;
        s.storeUnits = 100;
      }),
    );
    expect(diagValue(host, "Capacity")).toBe("100/900");
    expect(diagValue(host, "Storage cause")).toBeNull();
    expect(diagValue(host, "Largest holds")).toBeNull();
    expect(diagValue(host, "Recovery")).toBeNull();
    expect(diagValue(host, "Overflow hold")).toBeNull();
  });

  it("locks trade before the first contract and says how it opens", () => {
    const state = fullStore();
    state.exportClaimed = false;
    let dispatched = 0;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <StorePanel
          state={state}
          dispatch={() => {
            dispatched += 1;
            return { ok: true, revision: 0 };
          }}
          onClose={() => undefined}
        />,
      );
    });

    const sellButtons = Array.from(host.querySelectorAll("button")).filter((b) =>
      (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith("Sell"),
    );
    expect(sellButtons).toHaveLength(0);
    expect(host.textContent).toContain("Finish the first steel contract to open selling.");
    expect(diagValue(host, "Sell")).toBe("Opens after the first steel contract");
    expect(diagValue(host, "Recovery")).toContain("Opens after the first steel contract");
    expect(dispatched).toBe(0);
  });

  it("paints no unresolved key shapes and never says '1 units'", () => {
    for (const state of [fullStore(), yardWithMachines()]) {
      const host = mount(state);
      const texts = paintedText(host);
      expect(texts.length).toBeGreaterThan(10);
      for (const text of texts) {
        expect(text, `painted text looks like a key: ${text}`).not.toMatch(KEY_PATTERN);
        expect(text).not.toContain("1 units");
      }
      // Labels the criteria name are present as plain words.
      const joined = texts.join(" ");
      for (const label of ["Trade desk", "Diagnostics", "Raw materials", "Finished goods"]) {
        expect(joined).toContain(label);
      }
      expect(joined).toContain(RESOURCE_LABEL.plates);
    }
  });
});
