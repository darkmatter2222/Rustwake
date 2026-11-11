import { describe, expect, it, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MachinePanel } from "../../src/ui/Panels";
import { beltExtentLine } from "../../src/ui/text";
import { TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  beltCost,
  refundOf,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { t } from "../../src/game/content/strings";

/**
 * BELT-001 g4: the priced extent is printed where the player can read it, and the printed
 * scrap is the scrap the tap charged. One source (`beltCost` in `commands.ts`) feeds the
 * purse, the canvas label and the panel row, so the three readings are one value.
 *
 * The distance rows are the deployed ladder, read off `store.scrap` after each tap rather
 * than from a helper sum: distance 2 → 3 tiles → 3 scrap, distance 5 → 6 tiles → 6 scrap,
 * distance 6 → 7 tiles → 7 scrap (`beltCostPerTile` is 1 and run length is distance + 1).
 */

let seq = 700;
function send(state: SimState, command: CommandBody): unknown {
  return applyCommand(state, { ...command, id: `w${(seq += 1)}` } as Command);
}

function render(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

/** Three sorters at Manhattan distance 2, 5 and 6 from the dock, each with one priced link. */
function threeExtents(): {
  state: SimState;
  rows: { tile: number; tiles: number; price: number; machineId: number; line: string }[];
} {
  const state = createInitialState();
  state.store["scrap"] = 300;
  const rows = [
    { tile: 4, tiles: 3, price: 3 },
    { tile: 27, tiles: 6, price: 6 },
    { tile: 31, tiles: 7, price: 7 },
  ].map((row) => {
    send(state, { type: "machine.build", blueprint: "sorter", tile: row.tile });
    const machine = state.machines[state.machines.length - 1];
    const before = state.store["scrap"] ?? 0;
    send(state, { type: "route.connect", from: 0, to: machine.id, filter: "scrap" });
    const route = state.routes[state.routes.length - 1];
    // The purse is the witness: what the tap took is the number the line has to print.
    expect(before - (state.store["scrap"] ?? 0)).toBe(row.price);
    expect(route.run).toHaveLength(row.tiles);
    expect(beltCost(route.run?.length ?? 0)).toBe(row.price);
    return { ...row, machineId: machine.id, line: beltExtentLine(route) };
  });
  return { state, rows };
}

function machinePanel(state: SimState, machineId: number): HTMLElement {
  const machine = state.machines.find((item) => item.id === machineId);
  if (!machine) throw new Error("fixture machine missing");
  return render(
    <MachinePanel
      state={state}
      machine={machine}
      tick={state.tick}
      powerRatio={1}
      dispatch={(command) => applyCommand(state, command)}
      onClose={() => undefined}
    />
  );
}

const rowValue = (host: HTMLElement, label: string): string => {
  const dts = [...host.querySelectorAll(".panel__row dt")];
  const hit = dts.find((node) => (node.textContent ?? "").trim() === label);
  return (hit?.parentElement?.querySelector("dd")?.textContent ?? "").trim();
};

describe("BELT-001 g4: the printed extent equals the charged price", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("prints `N tiles · N scrap` for distance 2, 5 and 6, one source per number", () => {
    const { rows } = threeExtents();
    expect(rows.map((row) => row.line)).toEqual([
      "3 tiles · 3 scrap",
      "6 tiles · 6 scrap",
      "7 tiles · 7 scrap",
    ]);
    // The same integers the purse moved, straight from `beltCost`, so no table is duplicated.
    for (const row of rows) expect(beltCost(row.tiles)).toBe(row.price);
  });

  it("prints that line in the machine panel, under the `Links` label", () => {
    const { state, rows } = threeExtents();
    for (const row of rows) {
      const host = machinePanel(state, row.machineId);
      const body = host.querySelector(".panel__body")?.textContent ?? "";
      expect(body).toContain(row.line);
      expect(rowValue(host, t("row.links"))).toBe(row.line);
    }
  });

  it("keeps one row per machine and joins both of its links in it", () => {
    const { state, rows } = threeExtents();
    const machineId = rows[0].machineId;
    // The return leg is the second link on the same machine, so its row carries both.
    send(state, { type: "route.connect", from: machineId, to: 0, filter: "ferrous" });
    const host = machinePanel(state, machineId);
    const value = rowValue(host, t("row.links"));
    expect(value.split(t("value.comma")).length).toBe(2);
    expect((value.match(/3 tiles · 3 scrap/g) ?? []).length).toBe(2);
  });

  it("prints the stored latency form for a `run`-less (pre-price) link", () => {
    const { state, rows } = threeExtents();
    const machineId = rows[1].machineId;
    const machine = state.machines.find((item) => item.id === machineId);
    const route = state.routes.find(
      (item) => item.from.id === machineId || item.to.id === machineId
    );
    if (!route || !machine) throw new Error("fixture link missing");
    delete route.run; // exactly what a v1 save carries
    expect(beltExtentLine(route)).toBe(`${TUNING.routeLatencyTicks} ticks`);
    const host = machinePanel(state, machineId);
    const value = rowValue(host, t("row.links"));
    expect(value).toBe(`${TUNING.routeLatencyTicks} ticks`);
    expect(value).not.toContain("scrap");
  });

  it("prints a dismantle figure the dismantle tap actually returns, link refunds included", () => {
    const { state, rows } = threeExtents();
    const machineId = rows[2].machineId; // the 7-tile link: refund round(7 * 0.9) = 6
    const host = machinePanel(state, machineId);
    const face = [...host.querySelectorAll<HTMLElement>(".panel__actions button")].find((node) =>
      (node.textContent ?? "").trim().startsWith("Dismantle")
    );
    const printed = Number(/\+(\d+) units/.exec(face?.textContent ?? "")?.[1] ?? -1);
    expect(printed).toBeGreaterThan(0);
    const before = state.storeUnits;
    act(() => face?.click());
    expect(state.storeUnits - before).toBe(printed);
    // And that total is the engine's own parts: 90 % of the build cost, plus the link.
    expect(refundOf(beltCost(7))).toBe(6);
    expect(printed).toBe(refundOf(20) + 6);
  });
});
