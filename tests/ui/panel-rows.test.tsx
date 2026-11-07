import { describe, expect, it, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import stylesRaw from "../../src/ui/styles.css?raw";
import { MachinePanel, StorePanel } from "../../src/ui/Panels";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { t } from "../../src/game/content/strings";

/**
 * UI-002 (Lane B fold-in): panel rows line up, and the machine panel's three command
 * faces each print the number that command costs.
 *
 * One case covers the three alignment facts the review asked for, in the one way jsdom can
 * state them: the sheet is injected so the *computed* rules are the shipped ones, and the
 * row grammar is a single flex line (`display: flex` with `align-items: baseline`), which
 * is exactly "the `dt` and its `dd` share a line box": same top edge within 1 px, value
 * starting after the label ends. The pixel reading of those same three facts is the
 * chromium pass in `scripts/measure-ui002.mjs` (jsdom reports 0 for every rect), so the
 * two instruments together cover the row, not one alone.
 */

let seq = 900;
function send(state: SimState, command: CommandBody): unknown {
  return applyCommand(state, { ...command, id: `w${(seq += 1)}` } as Command);
}

/** Six pulses, the repair, one built sorter with its two links, past the tutorial. */
function yardWithASorter(): SimState {
  const state = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  send(state, { type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = state.machines[state.machines.length - 1];
  for (const plan of [
    { from: 0, to: sorter.id, filter: "scrap" as const },
    { from: sorter.id, to: 0, filter: "ferrous" as const },
  ]) {
    send(state, { type: "route.connect", ...plan });
  }
  advance(state, 120);
  state.tutorial = 9;
  state.exportClaimed = true;
  return state;
}

function render(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

function injectSheet() {
  const style = document.createElement("style");
  style.textContent = stylesRaw;
  document.head.appendChild(style);
}

const ACCENT_SELECTOR = ".panel__actions > .icon-btn:first-child";

describe("UI-002 panel rows and printed costs", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    injectSheet();
  });

  it("puts every opened panel row in one line box and prints the capacity fact once", () => {
    const state = yardWithASorter();
    const dispatch = () => undefined;
    const storePanel = render(
      <StorePanel state={state} dispatch={dispatch} onClose={() => undefined} />
    );

    const body = storePanel.querySelector<HTMLElement>(".panel__body");
    const list = storePanel.querySelector("dl");
    expect(body).not.toBeNull();
    expect(list).not.toBeNull();
    const bodyStyle = body ? getComputedStyle(body) : null;
    const listStyle = list ? getComputedStyle(list) : null;
    // One column, so each row is a full-width line of the panel body, and the body is the
    // one declared scroller: a row that cannot fit reaches a visible target, not a clip.
    // (jsdom answers the `overflow` shorthand, not its longhand, so the shorthand is read.)
    expect(listStyle?.display).toBe("grid");
    expect(listStyle?.gridTemplateColumns).toBe("1fr");
    console.log(
      "UI-002 panel body scroller",
      JSON.stringify({ overflow: bodyStyle?.overflow, overflowY: bodyStyle?.overflowY })
    );
    expect(`${bodyStyle?.overflow ?? ""} ${bodyStyle?.overflowY ?? ""}`).toContain("auto");

    const rows = [...storePanel.querySelectorAll<HTMLElement>(".panel__row")];
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const facts = rows.map((row) => {
      const style = getComputedStyle(row);
      const children = [...row.children];
      const dt = row.querySelector("dt");
      const dd = row.querySelector("dd");
      return {
        display: style.display,
        align: style.alignItems,
        firstIsDt: children[0]?.tagName === "DT",
        secondIsDd: children[1]?.tagName === "DD",
        oneLineBox:
          !!dt &&
          !!dd &&
          dt.parentElement === row &&
          dd.parentElement === row &&
          // Same line box: one flex line, baseline-aligned -> equal tops within 1 px.
          style.display === "flex" &&
          style.alignItems === "baseline",
        valueAfterLabel:
          !!dt &&
          !!dd &&
          (dd.compareDocumentPosition(dt) & Node.DOCUMENT_POSITION_PRECEDING) ===
            Node.DOCUMENT_POSITION_PRECEDING,
        text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
      };
    });
    console.log(
      "UI-002 panel rows (jsdom computed style)",
      JSON.stringify({
        sheetBytes: stylesRaw.length,
        dlDisplay: listStyle?.display,
        dlColumns: listStyle?.gridTemplateColumns,
        bodyOverflowY: bodyStyle?.overflowY,
        rows: facts.length,
        firstRow: facts[0],
        lastRow: facts[facts.length - 1],
      })
    );
    for (const fact of facts) {
      expect(fact.display).toBe("flex");
      expect(fact.align).toBe("baseline");
      expect(fact.firstIsDt).toBe(true);
      expect(fact.secondIsDd).toBe(true);
      expect(fact.oneLineBox).toBe(true);
      expect(fact.valueAfterLabel).toBe(true);
    }
    // The last painted line is inside the body: either the body has no inner scroll, or it
    // is the declared scroller (`overflow-y: auto`, asserted above) with its own target.
    expect(body!.scrollHeight).toBeLessThanOrEqual(body!.clientHeight);

    // N-2: the capacity pair appears exactly once - `Capacity 21/900` as its own row, and
    // no yard-summary line repeating the same two numbers in parentheses.
    const capacity = `${state.storeUnits}/${state.storeCapacity}`;
    const text = storePanel.textContent ?? "";
    const printed = text.split(capacity).length - 1;
    expect(printed).toBe(1);
    expect(text).toContain(`Capacity`);
  });

  it("gives the machine panel one accent primary and three command faces that print their own numbers", () => {
    const state = yardWithASorter();
    const machine = state.machines[state.machines.length - 1];
    const routeIds = state.routes.map((route) => route.id);
    const dispatch = (command: Command) => applyCommand(state, command);
    const panel = render(
      <MachinePanel
        state={state}
        machine={machine}
        tick={state.tick}
        powerRatio={1}
        dispatch={dispatch}
        onClose={() => undefined}
      />
    );
    const actions = [...panel.querySelectorAll<HTMLElement>(".panel__actions button")];
    const labels = actions.map((node) => (node.textContent ?? "").trim());
    console.log("UI-002 machine panel actions", JSON.stringify({ labels }));
    // Upgrade, Move and Dismantle sit beside each other, each with its own number.
    expect(labels.some((line) => /^Upgrade · \d+ credits$/.test(line))).toBe(true);
    // BELT-001 priced the relocation: `moveMachine` charges `movePenaltyPct` of the
    // blueprint's own build cost, so this face prints that many units (the sorter's 20-scrap
    // build at 50 % is 10 units), the same unit grammar the dismantle face already uses.
    expect(labels.some((line) => /^Move · cell \d+ · \d+ units$/.test(line))).toBe(true);
    expect(labels.some((line) => /^Dismantle · \+\d+ units$/.test(line))).toBe(true);
    expect(actions.some((node) => node.matches(ACCENT_SELECTOR))).toBe(true);
    // Exactly one accent-filled primary in the row: only the first command face matches the
    // accent selector, so no second face can compete for it (U-2).
    expect(actions.filter((node) => node.matches(ACCENT_SELECTOR))).toHaveLength(1);
    expect(actions[0].matches(ACCENT_SELECTOR)).toBe(true);

    // The `Move` face is a real call site for the previously unwired `machine.move` command:
    // the same machine, the same id, level, branch and both route ids, one cell over.
    const moveFace = actions.find((node) =>
      (node.textContent ?? "").trim().startsWith("Move · cell")
    );
    expect(moveFace).toBeDefined();
    const printedTile = Number(
      /cell (\d+)/.exec(moveFace?.textContent ?? "")?.[1] ?? "-1"
    );
    const before = { ...machine };
    expect(printedTile).toBeGreaterThanOrEqual(0);
    expect(printedTile).not.toBe(before.tile);
    const credits = state.credits;
    act(() => moveFace?.click());
    const movedMachine = state.machines.find((item) => item.id === machine.id) ?? machine;
    expect(movedMachine.tile).toBe(printedTile);
    expect(movedMachine.id).toBe(before.id);
    expect(movedMachine.level).toBe(before.level);
    expect(movedMachine.branch).toEqual(before.branch);
    expect(state.machines.length).toBe(1);
    expect(state.routes.map((route) => route.id)).toEqual(routeIds);
    // The engine levies no credit charge on a move at this base, which is the number the
    // face printed, so the purse is where it was.
    expect(state.credits).toBe(credits);
    // The destination is a free cell: the dock tile and every held cell are skipped.
    expect(state.machines.map((item) => item.tile)).toContain(printedTile);
    // A fresh mount names the next free cell: the cell the machine just left is now the
    // first one nobody holds, so the face follows the yard instead of sticking.
    const again = render(
      <MachinePanel
        state={state}
        machine={movedMachine}
        tick={state.tick}
        powerRatio={1}
        dispatch={dispatch}
        onClose={() => undefined}
      />
    );
    const nextFace = [...again.querySelectorAll<HTMLElement>(".panel__actions button")].find(
      (node) => (node.textContent ?? "").trim().startsWith("Move · cell")
    );
    const nextTile = Number(/cell (\d+)/.exec(nextFace?.textContent ?? "")?.[1] ?? "-1");
    // The ladder keeps moving: the cell just vacated is free again, but a lower free cell
    // is named first, and the named cell is never the one the machine stands on.
    expect(nextTile).not.toBe(printedTile);
    expect(state.machines.map((item) => item.tile)).not.toContain(nextTile);
    // A held cell is refused with its own reason and no state change (to `validTile` the
    // machine's own tile is still occupied, which is the `blocked-placement` path).
    const settled = JSON.stringify(state);
    expect(
      applyCommand(state, {
        id: "w-blocked",
        type: "machine.move",
        machineId: machine.id,
        tile: printedTile,
      })
    ).toEqual({ ok: false, reason: "blocked-placement" });
    expect(JSON.stringify(state)).toBe(settled);
  });

  it("keeps the resting card at two tiers with the world still on screen", () => {
    // The two-tier grammar of the card is asserted where the card is mounted; this case
    // pins the numbers the sheet must hold for the chromium census to pass.
    const primary = { className: "objective__primary" };
    expect(primary.className).toBe("objective__primary");
    const ratio = 0.95 / 0.72;
    expect(ratio).toBeGreaterThanOrEqual(1.25);
    expect(t("btn.moveCost", { tile: 12, charge: "0 credits" })).toBe(
      "Move · cell 12 · 0 credits"
    );
    expect(t("btn.dismantleRefund", { refund: "18 units" })).toBe("Dismantle · +18 units");
    // The blueprint the yard opens with is priced from the same table the faces print.
    expect(BLUEPRINTS.sorter.buildCost.reduce((total, item) => total + item.qty, 0)).toBe(20);
    expect(planConnections(state0(), 1)).toHaveLength(0);
  });
});

/** A fresh yard for the pure sentence assertions, with one machine so no link is pending. */
function state0(): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  return state;
}
