import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type BuildPlacementApi, type GameStore } from "../../src/app/store";
import { BUILD_READY_TEXT, firstFitCell } from "../../src/game/world/buildCatalog";
import { WORLD_ASSET_IDS } from "../../src/game/world/kit";

/**
 * T11 (#138): the build catalog and placement controls, exercised through the
 * real App in jsdom — every action under test is a click or a key, never a
 * direct state injection (ledger drains are fixture facts, exactly like the
 * game suite's seeded worlds). The store's session yard is the fixed seed 138
 * and the clock is frozen, so every scenario is reproducible.
 *
 * Acceptance reads:
 *  U01 — the armed ghost prints footprint, orientation, clearance, cost and the
 *        exact ready/refusal reason BEFORE any commit; a terrain refusal names
 *        the terrain, never a cost line (validatePlacement checks site first).
 *  U02 — only the Confirm face commits; grid clicks and nudges only re-aim;
 *        Cancel disarms without spend; repeat mode charges each placement
 *        separately and never double-buys an occupied ghost.
 *  U03 — locked entries stay visible with their unlock reason and keep the
 *        armed selection; unaffordable entries arm with the exact have/need
 *        shortfall and recover in place when the ledger is topped up.
 *
 * Same harness grammar as place-53 / shell-wiring-135: write-only canvas proxy,
 * real unmount in afterEach so the render loop's rAF never outlives a test.
 */

// React 18's act() needs the environment flag; jsdom does not set it itself.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/** jsdom ships no 2D canvas; the renderer only writes, so a write-only proxy suffices. */
const writeOnlyContext = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_target, prop) => (prop === "canvas" ? undefined : () => undefined),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;

type BuildStore = GameStore & BuildPlacementApi;

let root: ReturnType<typeof createRoot> | null = null;

/** Fresh session yard: fixed seed 138, frozen clock — no catch-up, no tick drift. */
function freshStore(): BuildStore {
  return createStore({ storage: memoryStorage(), now: () => 1_000 });
}

function mount(store: BuildStore): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(<App store={store} />);
  });
  return host;
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label),
  ) as HTMLButtonElement | undefined;
}

const begin = () => act(() => findButton("Begin recovery")?.click());
const openCatalog = () => act(() => findButton("Open build catalog")?.click());

const card = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.build-card[data-asset="${id}"]`);
const pick = (id: string) => act(() => card(id)?.click());
const testId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (id: string) => testId(id)?.textContent ?? "";
const press = (id: string) => act(() => testId(id)?.click());
const confirmBtn = () => testId("build-confirm") as HTMLButtonElement;
const gridCell = (x: number, y: number) =>
  document.querySelector<SVGRectElement>(`.build-grid__cell[data-cell="${x},${y}"]`);
/** SVG rects have no .click() in jsdom — dispatch a bubbling click instead. */
const aim = (x: number, y: number) =>
  act(() => {
    gridCell(x, y)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const pressKey = (key: string) =>
  act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

/** Mount, pass the gate and open the catalog panel — the common preamble. */
function opened(store: BuildStore): void {
  mount(store);
  begin();
  openCatalog();
  expect(testId("build-catalog")).not.toBeNull();
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(writeOnlyContext);
});

afterEach(() => {
  if (root !== null) {
    const dying = root;
    root = null;
    act(() => dying.unmount());
  }
  vi.restoreAllMocks();
});

describe("T11 build catalog through the real App (U01/U02/U03)", () => {
  it("opens from the lead-block entry face and lists every kit building with its cost", () => {
    const store = freshStore();
    opened(store);
    const cards = [...document.querySelectorAll<HTMLButtonElement>(".build-card")];
    expect(cards.map((node) => node.dataset.asset)).toEqual([...WORLD_ASSET_IDS]);
    expect(cards).toHaveLength(8);
    expect(card("warehouse")!.textContent).toContain("Warehouse");
    expect(card("warehouse")!.textContent).toContain("6×4");
    expect(card("warehouse")!.textContent).toContain("30 scrap + 8 steel · 20 credits");
    expect(card("sorter")!.textContent).toContain("20 scrap");
    // Locked entries are never hidden — the reason prints on the card (U03).
    expect(card("crane")!.dataset.locked).toBe("true");
    expect(text("build-lock-crane")).toBe("Requires Route Dispatch research");
    expect(text("build-lock-turret")).toBe("Requires a defense milestone");
    expect(text("build-lock-wall_gate")).toBe("Requires a defense milestone");
    // Nothing armed yet: no ghost, and Confirm cannot fire accidentally.
    expect(testId("build-ghost")).toBeNull();
    expect(confirmBtn().disabled).toBe(true);
  });

  it("selecting a building arms the ghost with footprint, orientation, clearance and cost (U01)", () => {
    const store = freshStore();
    opened(store);
    pick("warehouse");
    expect(store.getBuildPlacement().mode).toBe("placing");
    expect(card("warehouse")!.getAttribute("aria-pressed")).toBe("true");
    expect(testId("build-ghost")).not.toBeNull();
    expect(text("build-footprint")).toBe("6×4");
    expect(text("build-orientation")).toBe("0° (+y)");
    expect(text("build-clearance")).toBe("Clear");
    expect(testId("build-clearance")!.dataset.valid).toBe("true");
    expect(text("build-cost")).toBe("30 scrap + 8 steel · 20 credits");
    expect(text("build-reason")).toBe(BUILD_READY_TEXT);
    expect(text("build-status")).toBe(BUILD_READY_TEXT);
    // The painted footprint is the exact 24 cells the transaction checks.
    const foot = [...document.querySelectorAll(".build-grid__foot")];
    expect(foot).toHaveLength(24);
    expect(foot.every((node) => node.getAttribute("data-valid") === "true")).toBe(true);
    expect(testId("build-arrow")).not.toBeNull();
    expect(confirmBtn().disabled).toBe(false);
  });

  it("grid clicks only re-aim the ghost — they never place or spend (U02)", () => {
    const store = freshStore();
    opened(store);
    pick("warehouse");
    const cell = store.getBuildPlacement().ghostCell as { x: number; y: number };
    const scrap = store.getBuildWorld().stock.scrap;
    aim(cell.x + 1, cell.y);
    expect(store.getBuildPlacement().ghostCell).toEqual({ x: cell.x + 1, y: cell.y });
    expect(store.getBuildPlacement().mode).toBe("placing");
    expect(store.getBuildWorld().stock.scrap).toBe(scrap);
    expect(store.getBuildWorld().sites).toHaveLength(0);
    expect(store.getBuildPlacement().placedCount).toBe(0);
  });

  it("confirm commits one atomic placement and retires the ghost (U02)", () => {
    const store = freshStore();
    opened(store);
    pick("warehouse");
    press("build-confirm");
    const w = store.getBuildWorld();
    expect(w.sites).toHaveLength(1);
    expect(w.stock.scrap).toBe(90);
    expect(w.stock.steel).toBe(4);
    expect(w.credits).toBe(40);
    const placement = store.getBuildPlacement();
    expect(placement.mode).toBe("idle");
    expect(placement.selectedAsset).toBeNull();
    expect(placement.ghostCell).toBeNull();
    expect(placement.placedCount).toBe(1);
    expect(testId("build-ghost")).toBeNull();
    expect(text("build-status")).toBe("Select a building to arm its placement ghost.");
    expect(confirmBtn().disabled).toBe(true);
  });

  it("cancel disarms without spend and keeps the repeat preference (U02)", () => {
    const store = freshStore();
    opened(store);
    press("build-repeat");
    pick("warehouse");
    press("build-rotate");
    const before = JSON.stringify(store.getBuildWorld());
    press("build-cancel");
    expect(JSON.stringify(store.getBuildWorld())).toBe(before);
    const placement = store.getBuildPlacement();
    expect(placement.mode).toBe("idle");
    expect(placement.selectedAsset).toBeNull();
    expect(placement.ghostCell).toBeNull();
    expect(placement.rotation).toBe(0);
    expect(placement.repeat).toBe(true);
    expect(testId("build-ghost")).toBeNull();
    expect(testId("build-repeat")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("repeat mode stays armed and charges each placement separately (U02)", () => {
    const store = freshStore();
    opened(store);
    press("build-repeat");
    pick("sorter");
    expect(store.getBuildPlacement().mode).toBe("repeating");
    press("build-confirm");
    expect(store.getBuildWorld().sites).toHaveLength(1);
    expect(store.getBuildWorld().stock.scrap).toBe(100);
    expect(store.getBuildPlacement().mode).toBe("repeating");
    expect(card("sorter")!.getAttribute("aria-pressed")).toBe("true");
    expect(testId("build-ghost")).not.toBeNull();
    // The spent ghost sits on its own occupied site: Confirm stays disabled
    // until the player re-aims — no accidental double buy.
    expect(confirmBtn().disabled).toBe(true);
    const next = firstFitCell(store.getBuildWorld(), "sorter", 0);
    expect(next).not.toBeNull();
    aim((next as { x: number; y: number }).x, (next as { x: number; y: number }).y);
    expect(confirmBtn().disabled).toBe(false);
    press("build-confirm");
    expect(store.getBuildWorld().sites).toHaveLength(2);
    expect(store.getBuildWorld().stock.scrap).toBe(80);
    expect(store.getBuildPlacement().placedCount).toBe(2);
    expect(store.getBuildPlacement().mode).toBe("repeating");
    press("build-cancel");
    expect(store.getBuildPlacement().mode).toBe("idle");
  });

  it("the rotate face and the R key turn the footprint and frontage together", () => {
    const store = freshStore();
    opened(store);
    pick("warehouse");
    press("build-rotate");
    expect(text("build-orientation")).toBe("90° (+x)");
    expect(text("build-footprint")).toBe("4×6");
    pressKey("r");
    expect(text("build-orientation")).toBe("180° (-y)");
    pressKey("r");
    expect(text("build-orientation")).toBe("270° (-x)");
    expect(text("build-footprint")).toBe("4×6");
    pressKey("r");
    expect(text("build-orientation")).toBe("0° (+y)");
    expect(text("build-footprint")).toBe("6×4");
    expect(store.getBuildPlacement().rotation).toBe(0);
  });

  it("locked entries refuse with their reason and keep the armed selection (U03)", () => {
    const store = freshStore();
    opened(store);
    pick("warehouse");
    const ghost = store.getBuildPlacement().ghostCell;
    pick("crane");
    expect(store.getBuildPlacement().selectedAsset).toBe("warehouse");
    expect(store.getBuildPlacement().ghostCell).toEqual(ghost);
    expect(card("crane")!.getAttribute("aria-pressed")).toBe("false");
    expect(card("warehouse")!.getAttribute("aria-pressed")).toBe("true");
    expect(text("build-lock-crane")).toBe("Requires Route Dispatch research");
    expect(store.getBuildWorld().sites).toHaveLength(0);
  });

  it("unaffordable entries arm with the exact shortfall and recover when topped up (U03)", () => {
    const store = freshStore();
    opened(store);
    // Fixture drain (a ledger fact, like the game suite's seeded worlds).
    store.getBuildWorld().stock.steel = 2;
    pick("warehouse");
    expect(card("warehouse")!.dataset.affordable).toBe("false");
    expect(text("build-short-warehouse")).toBe("Need 8 steel (have 2)");
    // The ghost arms on buildable ground and names the COST, not the site.
    expect(text("build-reason")).toBe("Need 8 steel (have 2).");
    expect(text("build-clearance")).toBe("Blocked");
    expect(confirmBtn().disabled).toBe(true);
    expect(store.getBuildPlacement().mode).toBe("placing");
    // Top up, then re-aim with a plain grid click: the ghost recovers in place.
    store.getBuildWorld().stock.steel = 12;
    const cell = store.getBuildPlacement().ghostCell as { x: number; y: number };
    aim(cell.x, cell.y);
    expect(text("build-reason")).toBe(BUILD_READY_TEXT);
    expect(confirmBtn().disabled).toBe(false);
    press("build-confirm");
    expect(store.getBuildWorld().sites).toHaveLength(1);
    expect(store.getBuildWorld().stock.steel).toBe(4);
  });

  it("rough ground names the terrain, never a cost line (U01 reason order)", () => {
    const store = freshStore();
    opened(store);
    pick("warehouse");
    // Seed 138: the origin footprint crosses rough ground at cell (4,0).
    aim(0, 0);
    expect(text("build-reason")).toBe(
      "Rough terrain cannot support this building — pick flat ground.",
    );
    expect(text("build-clearance")).toBe("Blocked");
    expect(testId("build-clearance")!.dataset.valid).toBe("false");
    expect(confirmBtn().disabled).toBe(true);
    expect(store.getBuildWorld().sites).toHaveLength(0);
  });

  it("reader tabs preview the catalog but every commit control is disabled", () => {
    const storage = memoryStorage();
    const writer = createStore({ storage, now: () => 1_000, leaseId: "tab-a" });
    const reader = createStore({ storage, now: () => 1_000, leaseId: "tab-b" });
    expect(writer.getRole()).toBe("writer");
    expect(reader.getRole()).toBe("reader");
    opened(reader);
    expect(card("warehouse")!.disabled).toBe(true);
    expect(confirmBtn().disabled).toBe(true);
    expect(text("build-status")).toBe(
      "Read-only tab — previews only; the owner tab confirms placements.",
    );
    // The store gate behind the UI: a reader previews freely, never commits.
    expect(reader.selectBuildAsset("warehouse")).toEqual({ ok: true });
    expect(reader.confirmBuildPlacement()).toEqual({ ok: false, reason: "read-only" });
    expect(writer.getBuildWorld().sites).toHaveLength(0);
    expect(reader.getBuildWorld().sites).toHaveLength(0);
  });
});
