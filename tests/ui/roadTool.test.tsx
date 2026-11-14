import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore, type RoadApi } from "../../src/app/store";
import { orthogonalRoute, roadRejectionLabel, PANEL_ROAD } from "../../src/ui/RoadTool";
import { roadCells, roadFingerprint } from "../../src/game/world/roadGraph";

/**
 * T12 (#139): the atomic road tool through the real App in jsdom.
 *
 * The panel is preview-first: opening it, re-aiming the draft and cancelling
 * are all pure — no scrap moves and the network fingerprint is byte-identical
 * until an explicit Confirm. Confirm is the single atomic entry point
 * (store.commitRoad -> applyRoadTransaction); a rejected, unaffordable or
 * read-only draft disables the face and states the recovery (U01). The reader
 * tab previews but can never spend, and the store writer-gate agrees.
 *
 * The default draft (8,12)->(14,12) is seven horizontal cells inside the
 * always-flat start clear zone [6,18) of the owned [0,24) parcel: cost 35
 * scrap against the 120-scrap session stock, so it is valid on first open.
 */

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

function begin() {
  act(() => findButton("Begin recovery")?.click());
}

function openRoad() {
  act(() => findButton("Open road tool")?.click());
}

const panel = () => document.querySelector(".panel--road") as HTMLElement | null;
const road = (store: GameStore) => store as GameStore & RoadApi;

/** The status line is the last role=status in the panel (the locked banner is first). */
function status(): string {
  const nodes = panel()?.querySelectorAll('[role="status"]') ?? [];
  return (nodes[nodes.length - 1]?.textContent ?? "").trim();
}

function rowValue(label: string): string {
  const rows = [...(panel()?.querySelectorAll(".panel__row") ?? [])];
  const row = rows.find((r) => r.querySelector("dt")?.textContent === label);
  return (row?.querySelector("dd")?.textContent ?? "").trim();
}

/** React controlled inputs need the prototype setter (see app.test.tsx). */
function setCell(label: string, value: string) {
  const field = document.querySelector<HTMLInputElement>(
    `.panel--road input[aria-label="${label}"]`
  );
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(field, value);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function confirmFace(): HTMLButtonElement | undefined {
  return findButton("Confirm road placement") ?? findButton("Confirm road removal");
}

describe("T12 road tool: pure route helpers", () => {
  it("orthogonalRoute walks horizontal-first and handles trivial/reversed drafts", () => {
    expect(orthogonalRoute({ x: 2, y: 3 }, { x: 5, y: 6 })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
    ]);
    expect(orthogonalRoute({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]);
    // Pure horizontal / vertical drafts must not duplicate the corner cell.
    expect(orthogonalRoute({ x: 8, y: 12 }, { x: 11, y: 12 })).toEqual([
      { x: 8, y: 12 },
      { x: 9, y: 12 },
      { x: 10, y: 12 },
      { x: 11, y: 12 },
    ]);
    expect(orthogonalRoute({ x: 8, y: 12 }, { x: 8, y: 9 })).toEqual([
      { x: 8, y: 12 },
      { x: 8, y: 11 },
      { x: 8, y: 10 },
      { x: 8, y: 9 },
    ]);
    expect(orthogonalRoute({ x: 5, y: 6 }, { x: 2, y: 3 })).toEqual([
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 3, y: 6 },
      { x: 2, y: 6 },
      { x: 2, y: 5 },
      { x: 2, y: 4 },
      { x: 2, y: 3 },
    ]);
  });

  it("roadRejectionLabel names the blocker and the recovery", () => {
    expect(
      roadRejectionLabel({ reason: "insufficient-material", resource: "scrap", need: 35, have: 10 })
    ).toBe("Need 35 scrap · have 10 — salvage or sell to recover.");
    expect(
      roadRejectionLabel({ reason: "keepout", craneId: 3, cells: [{ x: 1, y: 1 }] })
    ).toContain("crane #3");
    expect(roadRejectionLabel({ reason: "no-road", cells: [{ x: 1, y: 1 }] })).toContain(
      "No road"
    );
  });
});

describe("T12 road tool: preview / confirm / cancel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens with a valid ghost preview and spends nothing until Confirm", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    const before = roadFingerprint(road(store).getRoadNetwork());
    openRoad();

    expect(panel()).not.toBeNull();
    expect(rowValue("Route")).toBe("7 cells");
    expect(rowValue("New cells")).toBe("7");
    expect(rowValue("Reused (free)")).toBe("0");
    expect(rowValue("Cost")).toBe("35 scrap");
    expect(rowValue("Crossings")).toBe("0");
    expect(rowValue("Bay sockets")).toBe("0");
    expect(status()).toBe("Ghost valid — confirm to commit.");
    expect(confirmFace()?.disabled).toBe(false);
    expect(panel()?.querySelector("svg")?.getAttribute("aria-label")).toContain("valid");
    expect(panel()?.textContent).toContain("No cargo batches yet.");

    // Preview is pure: re-aiming the draft never touches stock or topology.
    setCell("To x", "16");
    expect(rowValue("Route")).toBe("9 cells");
    expect(rowValue("Cost")).toBe("45 scrap");
    expect(road(store).getWorld().stock.scrap).toBe(120);
    expect(roadFingerprint(road(store).getRoadNetwork())).toBe(before);
  });

  it("Confirm commits one atomic transaction; the same draft then previews as free reuse", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    openRoad();
    act(() => confirmFace()?.click());

    expect(road(store).getWorld().stock.scrap).toBe(85);
    expect(roadCells(road(store).getRoadNetwork())).toHaveLength(7);
    expect(road(store).getRoadNetwork().revision).toBe(1);
    expect(status()).toBe("Placed 7 cells · −35 scrap");
    // The unchanged draft re-previews as reuse: no second spend on Confirm.
    expect(rowValue("Reused (free)")).toBe("7");
    expect(rowValue("Cost")).toBe("0 scrap");
    act(() => confirmFace()?.click());
    expect(road(store).getWorld().stock.scrap).toBe(85);
    expect(road(store).getRoadNetwork().revision).toBe(1);
  });

  it("Cancel retires the draft without a command, a spend or a topology edit", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    openRoad();
    const before = roadFingerprint(road(store).getRoadNetwork());
    act(() => findButton("Cancel draft")?.click());

    expect(rowValue("Route")).toBe("—");
    expect(confirmFace()?.disabled).toBe(true);
    expect(road(store).getWorld().stock.scrap).toBe(120);
    expect(roadFingerprint(road(store).getRoadNetwork())).toBe(before);
    expect(road(store).getRoadNetwork().revision).toBe(0);
  });

  it("an unaffordable draft disables Confirm and names the shortfall; recovery re-arms it", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    openRoad();
    road(store).getWorld().stock.scrap = 10;
    act(() => store.step(1)); // re-render from the authoritative tick, no spend

    expect(confirmFace()?.disabled).toBe(true);
    expect(status()).toBe("Need 35 scrap · have 10 — salvage or sell to recover.");
    act(() => confirmFace()?.click()); // disabled face: nothing happens
    expect(road(store).getWorld().stock.scrap).toBe(10);
    expect(roadCells(road(store).getRoadNetwork())).toHaveLength(0);

    road(store).getWorld().stock.scrap = 120;
    act(() => store.step(1));
    expect(confirmFace()?.disabled).toBe(false);
    expect(status()).toBe("Ghost valid — confirm to commit.");
  });

  it("a route leaving owned land is rejected before any spend (land law precedes terrain)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    openRoad();
    setCell("From x", "0");
    setCell("To x", "30");

    expect(confirmFace()?.disabled).toBe(true);
    expect(status()).toContain("Route leaves owned land");
    act(() => confirmFace()?.click());
    expect(road(store).getWorld().stock.scrap).toBe(120);
    expect(roadCells(road(store).getRoadNetwork())).toHaveLength(0);
  });

  it("Dismantle mode previews the 80% refund and Confirm returns it", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    openRoad();
    act(() => confirmFace()?.click()); // place the default 7-cell road (−35)
    act(() => findButton("Dismantle")?.click());

    expect(rowValue("Road cells cut")).toBe("7");
    expect(rowValue("Refund")).toBe("+28 scrap");
    expect(findButton("Confirm road removal")?.disabled).toBe(false);
    act(() => findButton("Confirm road removal")?.click());

    expect(road(store).getWorld().stock.scrap).toBe(113); // 120 − 35 + 28
    expect(roadCells(road(store).getRoadNetwork())).toHaveLength(0);
    expect(status()).toBe("Dismantled · +28 scrap refund");
  });

  it("repeat placement chains continuous segments from the last endpoint", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    openRoad();
    // Short drafts that stay inside the always-flat clear zone [6,18).
    setCell("To x", "10");
    const repeat = panel()?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => repeat?.click());

    act(() => confirmFace()?.click()); // (8,12)->(10,12): 3 new cells, −15
    expect(document.querySelector<HTMLInputElement>('.panel--road input[aria-label="From x"]')?.value).toBe("10");
    expect(document.querySelector<HTMLInputElement>('.panel--road input[aria-label="To x"]')?.value).toBe("12");
    act(() => confirmFace()?.click()); // (10,12)->(12,12): 2 new cells, −10
    act(() => confirmFace()?.click()); // (12,12)->(14,12): 2 new cells, −10

    expect(roadCells(road(store).getRoadNetwork())).toHaveLength(7);
    expect(road(store).getWorld().stock.scrap).toBe(85); // 120 − 15 − 10 − 10
    expect(document.querySelector<HTMLInputElement>('.panel--road input[aria-label="To x"]')?.value).toBe("16");
  });

  it("lists cargo batches with phase and typed hold reason (E04 inspectability)", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    mount(store);
    begin();
    openRoad();
    act(() => confirmFace()?.click()); // road (8,12)..(14,12)
    act(() => {
      road(store).spawnRoadCargo({
        resource: "scrap",
        amount: 5,
        from: { x: 8, y: 12 },
        to: { x: 14, y: 12 },
      });
    });
    expect(panel()?.textContent).toContain("#1 scrap ×5 · moving");

    // Cut the road under the batch: it holds with a typed reason, never vanishes.
    act(() => findButton("Dismantle")?.click());
    act(() => findButton("Confirm road removal")?.click());
    expect(panel()?.textContent).toContain("held");
    expect(panel()?.textContent).toContain("road-removed at");
    expect(road(store).getRoadCargo().batches).toHaveLength(1);
  });
});

describe("T12 road tool: read-only context", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("a reader tab previews but cannot commit; the store writer-gate agrees", () => {
    const storage = memoryStorage();
    const first = createStore({ storage, now: () => 10, leaseId: "tab-a" });
    first.dispatch({ id: "m1", type: "manual.salvage" });
    first.step(36);
    const second = createStore({ storage, now: () => 10, leaseId: "tab-b" });
    expect(second.getRole()).toBe("reader");
    mount(second);
    begin();
    openRoad();

    // The ghost still previews for the mirror tab...
    expect(rowValue("Route")).toBe("7 cells");
    expect(rowValue("Cost")).toBe("35 scrap");
    // ...but the locked context disables the spend face and says why.
    expect(panel()?.textContent).toContain("Read-only: another tab owns the yard");
    expect(confirmFace()?.disabled).toBe(true);
    act(() => confirmFace()?.click());
    expect(road(second).getWorld().stock.scrap).toBe(120);
    expect(roadCells(road(second).getRoadNetwork())).toHaveLength(0);

    // Even a direct command is writer-gated by the store, not just the UI.
    const outcome = road(second).commitRoad({
      id: "reader-attempt",
      type: "road.place",
      cells: orthogonalRoute({ x: 8, y: 12 }, { x: 14, y: 12 }),
      lanes: 1,
    });
    expect(outcome.result.ok).toBe(false);
    if (!outcome.result.ok) expect(outcome.result.rejection.reason).toBe("read-only");

    // Cancel stays pure and available while locked.
    act(() => findButton("Cancel draft")?.click());
    expect(rowValue("Route")).toBe("—");
    expect(PANEL_ROAD).toBe(-10);
  });
});