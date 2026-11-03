import { describe, expect, it, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import {
  MachinePanel,
  ResearchPanel,
  ReturnReportPanel,
  StorePanel,
  YardPanel,
} from "../../src/ui/Panels";
import { createStore } from "../../src/app/store";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import { advance } from "../../src/game/simulation/engine";
import { applyCommand, type Command, type CommandBody } from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import type { ReturnReport } from "../../src/game/simulation/offline";
import {
  HINT_KEYS,
  OBJECTIVE_KEYS,
  STRINGS,
  formatDuration,
  formatNumber,
  formatRate,
  formatSeconds,
  formatWholeSeconds,
  plural,
  resourceName,
  resourceWord,
  t,
  unit,
  wholePercent,
} from "../../src/game/content/strings";
import { costSummary, describeStep, objectiveFor } from "../../src/ui/text";

/**
 * B-10: one string table with defaults, one formatter layer, and no raw key on screen
 * (spec 23.3). The point of these cases is that a sentence exists exactly once and that
 * its numbers come from the content tables, so a later locale or a rebalance cannot leave
 * one surface disagreeing with another.
 */

/** Key namespaces the table owns; a leak looks like `btn.place` inside the page. */
const KEY_PREFIXES = [
  "btn",
  "row",
  "value",
  "card",
  "step",
  "hint",
  "unit",
  "res",
  "status",
  "reject",
  "import",
  "report",
  "note",
  "field",
  "title",
  "aria",
  "gate",
  "sound",
  "glyph",
  "advice",
  "evidence",
  "yard",
  "tut",
  "objective",
  "bottleneck",
  "reader",
  "chip",
];
const KEY_PATTERN = new RegExp(`\\b(${KEY_PREFIXES.join("|")})\\.[a-z]`);

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

let seq = 700;
function send(state: SimState, command: CommandBody): unknown {
  return applyCommand(state, { ...command, id: `i${(seq += 1)}` } as Command);
}

/** Six pulses, the repair, and one built sorter with its input link. */
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

function render(node: ReactNode): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

describe("string table (B-10)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("gives every key a single-line default with well-formed slots", () => {
    const keys = Object.keys(STRINGS);
    expect(keys.length).toBeGreaterThanOrEqual(120);
    for (const key of keys) {
      const value = STRINGS[key];
      expect(value, `${key} has no default`).toBeTruthy();
      expect(value, `${key} is multiline`).not.toContain("\n");
      const slots = value.match(/\{[^{}]*\}/g) ?? [];
      // Balanced markers plus named slots only, so `t()` can never leave `{}` behind.
      expect((value.match(/\{/g) ?? []).length).toBe(slots.length);
      for (const slot of slots) expect(slot).toMatch(/^\{\w+\}$/);
    }
  });

  it("answers a known key, keeps an unknown key visible, and leaves an unfilled slot", () => {
    expect(t("btn.salvage")).toBe("Salvage");
    expect(t("not.a.real.key")).toBe("not.a.real.key");
    expect(t("btn.place")).toBe("Place {machine}");
    expect(t("btn.place", { machine: "Furnace" })).toBe("Place Furnace");
    // A slot the caller forgot stays as its own marker instead of painting "undefined".
    expect(t("btn.place", { node: "Furnace" })).toBe("Place {machine}");
  });

  it("formats quantities, times, and rates in the one place (spec 23.3)", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1234)).toBe("1234");
    expect(formatNumber(12_345)).toBe("12.35K");
    expect(formatNumber(1_234_567)).toBe("1.23M");
    expect(formatNumber(Number.NaN)).toBe("0");
    expect(formatDuration(500)).toBe("50s");
    expect(formatDuration(1_205)).toBe("2m 1s");
    expect(formatDuration(43_200)).toBe("1h 12m");
    expect(formatDuration(TUNING.offlineCapTicks)).toBe("12h 0m");
    expect(formatSeconds(0.4)).toBe("0.40");
    expect(formatRate(1.9047)).toBe("1.90");
    expect(formatWholeSeconds(59.6)).toBe(60);
    expect(wholePercent(0.719)).toBe(72);
    expect(wholePercent(Number.NaN)).toBe(0);
  });

  it("applies one plural rule everywhere a count meets a unit word", () => {
    expect(plural(1, t("unit.credit"))).toBe("credit");
    expect(plural(2, t("unit.credit"))).toBe("credits");
    expect(unit(1, t("unit.credit"))).toBe("1 credit");
    expect(unit(45, t("unit.credit"))).toBe("45 credits");
    // The card and the dock use the same rule for the same price.
    const state = yardWithASorter();
    expect(describeStep(state, { kind: "sell", resource: "scrap", qty: 1 })).toBe(
      "Sell 1 Scrap for 1 credit."
    );
    expect(describeStep(state, { kind: "sell", resource: "scrap", qty: 12 })).toBe(
      "Sell 12 Scrap for 12 credits."
    );
    expect(describeStep(state, { kind: "drone" })).toBe("Add a recovery drone · 45 credits");
  });

  it("reads tutorial prices from the content tables, not from the sentence", () => {
    const state = createInitialState();
    state.tutorial = 2;
    expect(objectiveFor(state)).toBe(`Repair your recovery drone · ${TUNING.repairCostScrap} scrap`);
    state.tutorial = 1;
    expect(objectiveFor(state)).toBe(
      `Keep salvaging: ${state.wreck.pulses}/${TUNING.repairCostScrap / TUNING.manualSalvagePerPulse} pulses for the drone repair.`
    );
    state.tutorial = 4;
    expect(objectiveFor(state)).toBe(`Build a sorter · ${costSummary(BLUEPRINTS.sorter)}`);
    expect(objectiveFor(state)).toBe("Build a sorter · 20 scrap");
    state.tutorial = 7;
    expect(objectiveFor(state)).toBe(
      "Sell your first steel · 3 steel for 30 credits"
    );
    // The card's ten lines and the ten hint ids are both present in the table.
    expect(OBJECTIVE_KEYS).toHaveLength(10);
    for (const key of OBJECTIVE_KEYS) expect(STRINGS[key]).toBeTruthy();
    for (const key of HINT_KEYS) expect(STRINGS[key]).toBeTruthy();
  });

  it("names materials capitalized as chips and lowercase inside a sentence", () => {
    expect(resourceName("ferrous")).toBe("Ferrous");
    expect(resourceWord("ferrous")).toBe("ferrous");
    // The lowercased name is the resource id for every shipped material.
    expect(costSummary(BLUEPRINTS.furnace)).toBe("10 scrap + 5 ferrous");
    for (const [id, name] of Object.entries({
      scrap: "scrap",
      ferrous: "ferrous",
      nonferrous: "nonferrous",
      residue: "residue",
      copper: "copper",
      polymer: "polymer",
      wire: "wire",
      plates: "plates",
      steel: "steel",
      circuits: "circuits",
      motors: "motors",
      battery: "battery",
      alloy: "alloy",
      data: "data",
    })) {
      expect(resourceWord(id)).toBe(name);
    }
  });

  it("paints no raw table key in the running shell", () => {
    const store = createStore({ storage: memoryStorage(), now: () => 10 });
    const state = store.getState();
    state.tutorial = 9;
    state.exportClaimed = true;
    state.credits = 120;
    state.store["scrap"] = 40;
    state.store["ferrous"] = 12;
    state.store["data"] = 6;
    state.storeUnits = 52;
    const host = render(<App store={store} />);
    // Entering the yard is what the player's first tap does.
    act(() => {
      host.querySelector<HTMLButtonElement>(".gate__btn")?.click();
    });
    const text = document.body.textContent ?? "";
    // The table answered: the objective card, the dock, and the chips all have words.
    expect((document.querySelector(".objective")?.textContent ?? "").length).toBeGreaterThan(10);
    expect((document.querySelector(".dock__btn--primary")?.textContent ?? "").length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
    for (const node of [...document.querySelectorAll(".hud, .hud *")]) {
      const content = node.textContent ?? "";
      if (KEY_PATTERN.test(content)) throw new Error(`unresolved key in HUD: ${content}`);
    }
  });

  it("paints the reconcile line only while a handoff is reported pending", () => {
    const stateStore = createStore({ storage: memoryStorage(), now: () => 10 });
    stateStore.getState().tutorial = 9;
    const pending: HTMLDivElement = render(
      <App store={{ ...stateStore, isReconciling: () => true }} />
    );
    act(() => {
      pending.querySelector<HTMLButtonElement>(".gate__btn")?.click();
    });
    const pendingLine = pending.querySelector(".reconcile");
    expect(pendingLine?.textContent).toBe(t("report.reconciling"));
    expect(pendingLine?.getAttribute("role")).toBe("status");
    // The rest of the HUD still answers, so the line is an addition, not a block (spec 18.5).
    expect((pending.querySelector(".dock__btn--primary")?.textContent ?? "").length).toBeGreaterThan(0);

    const settled = render(<App store={stateStore} />);
    act(() => {
      settled.querySelector<HTMLButtonElement>(".gate__btn")?.click();
    });
    // Without a handoff in flight the line is absent rather than an empty box.
    expect(settled.querySelectorAll(".reconcile").length).toBe(0);
  });

  it("phrases every panel from the table, singular and plural included", () => {
    const state = yardWithASorter();
    const machine = state.machines[state.machines.length - 1];
    const dispatch = () => undefined;

    const machinePanel = render(
      <MachinePanel
        state={state}
        machine={machine}
        tick={state.tick}
        powerRatio={1}
        dispatch={dispatch}
        onClose={() => undefined}
      />
    );
    const machineText = machinePanel.textContent ?? "";
    // One power unit and one batch are singular; the measured line is the assistant's.
    expect(machineText).toContain("1 unit");
    expect(machineText).not.toContain("1 units");
    expect(machineText).toContain("Working ");
    expect(machineText).toContain("batches/s");
    expect(machinePanel.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "Scrap sorter details"
    );

    const storePanel = render(
      <StorePanel state={state} dispatch={dispatch} onClose={() => undefined} />
    );
    expect(storePanel.textContent ?? "").toContain(
      `${TUNING.reserveFloor} units kept per material`
    );
    // Before the onboarding contract the same row explains why nothing is sellable.
    state.exportClaimed = false;
    const lockedStore = render(
      <StorePanel state={state} dispatch={dispatch} onClose={() => undefined} />
    );
    expect(lockedStore.textContent ?? "").toContain("Opens after the first steel contract");
    state.exportClaimed = true;

    const researchPanel = render(
      <ResearchPanel state={state} dispatch={dispatch} onClose={() => undefined} />
    );
    expect(researchPanel.textContent ?? "").toContain("Buy · 4 Data");
    expect(researchPanel.textContent ?? "").toContain("Needs Efficient Cutters first");

    const report: ReturnReport = {
      awayTicks: 6_500,
      creditedTicks: TUNING.offlineCapTicks,
      capped: true,
      gains: { scrap: 412, ferrous: 96 },
      creditsGained: 165,
      deliveries: 72,
      batchesDone: 1_043,
      bottleneck: "storage-full",
    };
    const reportPanel = render(
      <ReturnReportPanel report={report} onClose={() => undefined} />
    );
    const reportText = reportPanel.textContent ?? "";
    expect(reportText).toContain("Away 10m 50s");
    expect(reportText).toContain("Your operation worked for 12h 0m (capped)");
    expect(reportText).toContain("Storage full");
    expect(reportText).not.toContain("storage-full");

    const yardPanel = render(
      <YardPanel
        state={state}
        exportText='{"schemaVersion":1}'
        onImport={() => ({ ok: true, tick: state.tick, machines: state.machines.length })}
        onClose={() => undefined}
      />
    );
    expect(yardPanel.textContent ?? "").toContain("Yard record");
    expect(yardPanel.textContent ?? "").toContain("19 characters");

    for (const host of [...document.querySelectorAll("body > div")]) {
      const content = host.textContent ?? "";
      if (KEY_PATTERN.test(content)) throw new Error(`unresolved key in a panel: ${content}`);
    }
  });
});
