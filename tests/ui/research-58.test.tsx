import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import researchCssRaw from "../../src/ui/research/research.css?raw";
import { ResearchPanel } from "../../src/ui/panels/ResearchPanel";
import { createStore, type GameStore } from "../../src/app/store";
import { useSim } from "../../src/ui/useGame";
import { deriveResearch } from "../../src/ui/research/model";
import { RESEARCH, RESEARCH_ORDER } from "../../src/game/content/research";
import type { Command } from "../../src/game/simulation/commands";

/**
 * UI-RESET-58 (issue #58): the rebuilt research surface.
 *
 * These tests drive the panel through the real command path (props.dispatch ->
 * store.dispatch -> applyCommand), never a stubbed reducer. Fixture seeding
 * mutates the store's state object only here in test code, the same way
 * tests/ui/app.test.tsx seeds `state.store["data"]`; no src module is touched.
 * The legacy DOM contract (data-state known/locked/open, p.node__state exact
 * texts, .node__cost, .node__buy) is re-asserted so the rebuild cannot drift
 * from the read-only app/i18n suites.
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

/** The app's own subscription path: numeric revision drives the re-render. */
function Harness({ store }: { store: GameStore }) {
  const state = useSim(store);
  return (
    <ResearchPanel
      state={state}
      dispatch={(command: Command) => store.dispatch(command)}
      onClose={() => undefined}
    />
  );
}

function mount(store: GameStore): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<Harness store={store} />);
  });
  return host;
}

function freshStore(): GameStore {
  return createStore({ storage: memoryStorage(), now: () => 10 });
}

/** Seed Data the way app.test.tsx does, then bump the revision through step. */
function seedData(store: GameStore, amount: number) {
  const state = store.getState();
  state.store["data"] = amount;
  state.storeUnits += amount;
  act(() => store.step(1));
}

function seedResearch(store: GameStore, owned: Record<string, number>) {
  const state = store.getState();
  state.research = { ...state.research, ...owned };
  act(() => store.step(1));
}

function card(host: HTMLElement, id: string): HTMLElement {
  const node = host.querySelector<HTMLElement>(`.node[data-node="${id}"]`);
  expect(node).not.toBeNull();
  return node as HTMLElement;
}

function buyButton(host: HTMLElement, id: string): HTMLButtonElement | null {
  return card(host, id).querySelector<HTMLButtonElement>(".node__buy");
}

function clickBuy(host: HTMLElement, id: string) {
  const button = buyButton(host, id);
  expect(button).not.toBeNull();
  act(() => (button as HTMLButtonElement).click());
}

// The same key-shape guard tests/ui/i18n.test.tsx paints with: no rendered
// research text may look like an unresolved `prefix.word` key.
const KEY_PREFIXES = [
  "btn", "row", "value", "card", "step", "hint", "unit", "res", "status",
  "reject", "import", "report", "note", "field", "title", "aria", "gate",
  "sound", "glyph", "advice", "evidence", "yard", "tut", "objective",
  "bottleneck", "reader", "chip", "hud", "phase",
];
const KEY_PATTERN = new RegExp(`\\b(${KEY_PREFIXES.join("|")})\\.[a-z]`);

describe("research-58: four states over the existing branch", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("derives unlocked + locked at zero data and keeps the legacy open contract", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 0);

    const cutters = card(host, "cutters");
    expect(cutters.getAttribute("data-state")).toBe("open");
    expect(cutters.getAttribute("data-research-state")).toBe("unlocked");
    expect(cutters.querySelector(".research-badge")?.textContent).toBe("Unlocked");
    expect(cutters.querySelector("p.node__state")?.textContent).toBe("Buy · 4 Data");
    expect(cutters.querySelector(".research-why")?.textContent).toBe(
      "Need 4 more Data — have 0 of 4."
    );
    expect(buyButton(host, "cutters")?.disabled).toBe(true);

    for (const [id, prereqLabel] of [
      ["buffers", "Efficient Cutters"],
      ["dispatch", "Smart Buffers"],
    ] as const) {
      const node = card(host, id);
      expect(node.getAttribute("data-state")).toBe("locked");
      expect(node.getAttribute("data-research-state")).toBe("locked");
      expect(node.querySelector(".research-badge")?.textContent).toBe("Locked");
      expect(node.querySelector("p.node__state")?.textContent).toBe(
        `Needs ${prereqLabel} first`
      );
      expect(node.querySelector(".research-why")?.textContent).toBe(
        `Research ${prereqLabel} first to open this node.`
      );
      expect(buyButton(host, id)?.disabled).toBe(true);
    }
  });

  it("marks the affordable node available and enables exactly its buy target", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 4);

    const cutters = card(host, "cutters");
    expect(cutters.getAttribute("data-research-state")).toBe("available");
    expect(cutters.querySelector(".research-badge")?.textContent).toBe("Available");
    expect(cutters.querySelector(".research-why")).toBeNull();
    expect(buyButton(host, "cutters")?.disabled).toBe(false);

    const enabled = [...host.querySelectorAll<HTMLButtonElement>(".node__buy")].filter(
      (b) => !b.disabled
    );
    expect(enabled).toHaveLength(1);
    expect(enabled[0].textContent).toBe("Buy · 4 Data");
  });

  it("shows the exact cost and effect of every node before purchase", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 6);
    for (const id of RESEARCH_ORDER) {
      const def = RESEARCH[id];
      const node = card(host, id);
      expect(node.querySelector(".node__effect")?.textContent).toBe(def.effect);
      expect(node.querySelector(".node__cost")?.textContent).toBe(`${def.cost} Data`);
      const button = buyButton(host, id);
      if (button) expect(button.textContent).toBe(`Buy · ${def.cost} Data`);
    }
  });

  it("names prerequisites readably and flips them when the prereq is bought", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 6);
    expect(card(host, "cutters").querySelector(".research-prereq")?.textContent).toBe(
      "First node — no prerequisite."
    );
    expect(card(host, "buffers").querySelector(".research-prereq")?.textContent).toBe(
      "Requires Efficient Cutters — not researched yet"
    );
    clickBuy(host, "cutters");
    expect(card(host, "buffers").querySelector(".research-prereq")?.textContent).toBe(
      "Requires Efficient Cutters — completed"
    );
    expect(card(host, "dispatch").querySelector(".research-prereq")?.textContent).toBe(
      "Requires Smart Buffers — not researched yet"
    );
  });

  it("reflects a purchase immediately through the real command path", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 6);
    clickBuy(host, "cutters");

    // The engine state moved: one rank, the exact cost spent.
    expect(store.getState().research.cutters).toBe(1);
    expect(store.getState().store["data"]).toBe(2);

    // The bought card is completed, keeps the legacy Known line, loses its buy.
    const cutters = card(host, "cutters");
    expect(cutters.getAttribute("data-state")).toBe("known");
    expect(cutters.getAttribute("data-research-state")).toBe("completed");
    expect(cutters.querySelector("p.node__state")?.textContent).toBe("Known");
    expect(cutters.querySelector(".research-badge")?.textContent).toBe("Completed");
    expect(buyButton(host, "cutters")).toBeNull();

    // The next card answers with the new balance, not the old one.
    const buffers = card(host, "buffers");
    expect(buffers.getAttribute("data-research-state")).toBe("unlocked");
    expect(buffers.querySelector("p.node__state")?.textContent).toBe("Buy · 8 Data");
    expect(buffers.querySelector(".research-why")?.textContent).toBe(
      "Need 6 more Data — have 2 of 8."
    );

    // The focus readout stays on the node just bought and shows the live effect.
    const focus = host.querySelector(".research-focus") as HTMLElement;
    expect(focus.getAttribute("data-focus")).toBe("cutters");
    expect(focus.querySelector(".research-focus__title")?.textContent).toBe(
      "Just bought — live in the yard"
    );
    expect(focus.textContent).toContain("7 scrap -> 7 scrap");

    // The overview agrees with the cards.
    expect(host.querySelector(".research-progress")?.textContent).toBe("1 of 3 researched");
    expect(
      host.querySelector('.research-seg[data-research-state="completed"]')
    ).not.toBeNull();
  });

  it("answers the no-data state with the content table's Data source", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 0);
    // Same `${qty} ${resourceWord}` shape the engine's own advice prints
    // (diagnostics.ts inputText), so the note cannot drift from the table.
    expect(host.querySelector(".research-datanote")?.textContent).toBe(
      "Signal lab makes 2 Data every 15s from 1 circuits."
    );
    seedData(store, 1);
    // Any balance above zero retires the note; the shortfall line takes over.
    expect(host.querySelector(".research-datanote")).toBeNull();
  });

  it("covers partial progress: one owned, one available, one locked", () => {
    const store = freshStore();
    const host = mount(store);
    seedResearch(store, { cutters: 1 });
    seedData(store, 10);

    expect(host.querySelector(".research-progress")?.textContent).toBe("1 of 3 researched");
    expect(card(host, "cutters").getAttribute("data-research-state")).toBe("completed");
    expect(card(host, "buffers").getAttribute("data-research-state")).toBe("available");
    expect(buyButton(host, "buffers")?.disabled).toBe(false);
    expect(card(host, "dispatch").getAttribute("data-research-state")).toBe("locked");
    expect(buyButton(host, "dispatch")?.disabled).toBe(true);

    // The default focus is the next node: buffers, with its live capacity rows.
    const focus = host.querySelector(".research-focus") as HTMLElement;
    expect(focus.getAttribute("data-focus")).toBe("buffers");
    expect(focus.querySelector(".research-focus__title")?.textContent).toBe(
      "Where the next upgrade lands"
    );
  });

  it("covers completed research with the live effective numbers", () => {
    const store = freshStore();
    const host = mount(store);
    seedResearch(store, { cutters: 1, buffers: 1, dispatch: 1 });
    seedData(store, 76);

    expect(host.querySelector(".research-progress")?.textContent).toBe("3 of 3 researched");
    for (const id of RESEARCH_ORDER) {
      const node = card(host, id);
      expect(node.getAttribute("data-research-state")).toBe("completed");
      expect(node.querySelector("p.node__state")?.textContent).toBe("Known");
      expect(buyButton(host, id)).toBeNull();
    }
    const focus = host.querySelector(".research-focus") as HTMLElement;
    expect(focus.getAttribute("data-focus")).toBe("done");
    expect(focus.querySelector(".research-focus__title")?.textContent).toBe(
      "Every node is active in the yard"
    );
    expect(focus.textContent).toContain("7 scrap");
    expect(focus.textContent).toContain("+6 units per machine");
    expect(focus.textContent).toContain("32 units");
    // No earn-more-data note once the path is complete, even at a zero balance.
    seedData(store, 0);
    expect(host.querySelector(".research-datanote")).toBeNull();
  });

  it("moves the focus readout with each card's Details target", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 6);
    const details = card(host, "dispatch").querySelector<HTMLButtonElement>(".research-details");
    expect(details).not.toBeNull();
    act(() => (details as HTMLButtonElement).click());
    const focus = host.querySelector(".research-focus") as HTMLElement;
    expect(focus.getAttribute("data-focus")).toBe("dispatch");
    expect(focus.querySelector(".research-focus__title")?.textContent).toBe(
      "Where Route Dispatch lands"
    );
    expect(focus.textContent).toContain("24 units -> 32 units");
    expect(focus.textContent).toContain("Links already in the yard");
  });

  it("names the machines the buffers bonus lands on", () => {
    const store = freshStore();
    const host = mount(store);
    const state = store.getState();
    state.store["scrap"] = 100;
    state.storeUnits += 100;
    act(() => {
      store.dispatch({ id: "r58-build", type: "machine.build", blueprint: "sorter", tile: 8 });
    });
    seedResearch(store, { cutters: 1 });
    seedData(store, 12);

    const focus = host.querySelector(".research-focus") as HTMLElement;
    expect(focus.getAttribute("data-focus")).toBe("buffers");
    expect(focus.textContent).toContain("Scrap sorter #8 input");
    expect(focus.textContent).toContain("12 units -> 18 units");
    expect(focus.textContent).toContain("+6 units per machine");
  });

  it("keeps the mount contract and the legacy card DOM", () => {
    const store = freshStore();
    let closed = 0;
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(
        <ResearchPanel
          state={store.getState()}
          dispatch={(command: Command) => store.dispatch(command)}
          onClose={() => {
            closed += 1;
          }}
        />
      );
    });
    const panel = host.querySelector(".panel") as HTMLElement;
    expect(panel.className).toContain("panel--research");
    expect(panel.className).toContain("panel--stack");
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-label")).toBe("Research");
    expect(panel.querySelector(".panel__title")?.textContent).toBe("Research");
    act(() => {
      (panel.querySelector(".panel__head .icon-btn") as HTMLButtonElement).click();
    });
    expect(closed).toBe(1);

    // The exact per-card contract tests/ui/app.test.tsx asserts.
    seedData(store, 6);
    for (const node of [...host.querySelectorAll<HTMLElement>(".panel .node")]) {
      const stateLine = node.querySelector("p.node__state");
      const cost = node.querySelector(".node__cost");
      expect(stateLine).not.toBeNull();
      expect(cost?.textContent ?? "").toMatch(/^\d+ Data$/);
      const mode = node.getAttribute("data-state");
      const text = stateLine?.textContent ?? "";
      if (mode === "known") expect(text).toBe("Known");
      else if (mode === "locked") expect(text).toMatch(/^Needs .* first$/);
      else expect(text).toBe(`Buy · ${cost?.textContent ?? ""}`);
    }
  });

  it("prints the engine's own shortfall numbers, not a fitted guess", () => {
    const store = freshStore();
    const host = mount(store);
    seedData(store, 3);
    // The printed reason...
    expect(card(host, "cutters").querySelector(".research-why")?.textContent).toBe(
      "Need 1 more Data — have 3 of 4."
    );
    // ...equals what applyCommand rejects with when the same buy is forced.
    const result = store.dispatch({ id: "r58-force", type: "research.buy", node: "cutters" });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "insufficient") {
      expect(result.need).toBe(4);
      expect(result.have).toBe(3);
    } else {
      throw new Error(`expected insufficient, got ${JSON.stringify(result)}`);
    }
    // A locked node rejects with prereq, matching its printed reason.
    const locked = store.dispatch({ id: "r58-locked", type: "research.buy", node: "buffers" });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.reason).toBe("prereq");
  });

  it("paints no unresolved key shapes in any covered state", () => {
    const fixtures: Array<{ data: number; owned: Record<string, number> }> = [
      { data: 0, owned: {} },
      { data: 6, owned: {} },
      { data: 10, owned: { cutters: 1 } },
      { data: 76, owned: { cutters: 1, buffers: 1, dispatch: 1 } },
    ];
    for (const fixture of fixtures) {
      const store = freshStore();
      const host = mount(store);
      seedResearch(store, fixture.owned);
      seedData(store, fixture.data);
      const text = host.textContent ?? "";
      expect(text.length).toBeGreaterThan(0);
      if (KEY_PATTERN.test(text)) throw new Error(`unresolved key in research: ${text}`);
    }
  });

  it("mirrors card states in the overview segments for every fixture", () => {
    const fixtures: Array<{ data: number; owned: Record<string, number> }> = [
      { data: 0, owned: {} },
      { data: 4, owned: {} },
      { data: 10, owned: { cutters: 1 } },
      { data: 0, owned: { cutters: 1, buffers: 1, dispatch: 1 } },
    ];
    for (const fixture of fixtures) {
      const store = freshStore();
      const host = mount(store);
      seedResearch(store, fixture.owned);
      seedData(store, fixture.data);
      const view = deriveResearch(store.getState());
      const segments = [...host.querySelectorAll<HTMLElement>(".research-seg")];
      expect(segments).toHaveLength(view.nodes.length);
      segments.forEach((segment, index) => {
        expect(segment.getAttribute("data-research-state")).toBe(view.nodes[index].state);
        expect(segment.querySelector(".research-seg__name")?.textContent).toBe(
          view.nodes[index].def.label
        );
      });
    }
  });

  it("keeps large-text and rail rules in the surface stylesheet without shrinking type", () => {
    // The surface owns its large-text and rail paint; the shell chrome stays
    // in styles.css. The rail block mirrors the shell's query literally.
    expect(researchCssRaw).toContain(".text-large .research-summary");
    expect(researchCssRaw).toContain(".text-large .research-focus");
    expect(researchCssRaw).toContain(
      "@media (min-width: 1200px), (min-width: 600px) and (max-height: 460px)"
    );
    expect(researchCssRaw).toContain(".panel--research .panel__body::-webkit-scrollbar");
    // No research rule steps a font below its base at large text: the block
    // only touches padding/margin, never font-size.
    const largeBlock = researchCssRaw.slice(researchCssRaw.indexOf(".text-large .research-summary"));
    const railIndex = largeBlock.indexOf("@media");
    expect(largeBlock.slice(0, railIndex)).not.toContain("font-size");

    // Under the app's large-text class the full DOM still renders.
    const store = freshStore();
    const host = document.createElement("div");
    host.className = "text-large";
    document.body.appendChild(host);
    act(() => {
      createRoot(host).render(<Harness store={store} />);
    });
    seedData(store, 6);
    expect(host.querySelectorAll(".node")).toHaveLength(3);
    expect(host.querySelectorAll(".research-badge")).toHaveLength(3);
    expect(host.querySelector(".research-summary")).not.toBeNull();
    expect(host.querySelector(".research-focus")).not.toBeNull();
  });
});