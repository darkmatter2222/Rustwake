import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ReturnReportPanel } from "../../src/ui/Panels";
import { deriveReturn } from "../../src/ui/return/model";
import { BOTTLENECK_ADVICE, RETURN_COPY } from "../../src/ui/return/copy";
import { t } from "../../src/game/content/strings";
import { TUNING, TICK_MS } from "../../src/game/content/defs";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import {
  createInitialState,
  fleetDeliveries,
  type SimState,
} from "../../src/game/simulation/types";
import { catchUp, type ReturnReport } from "../../src/game/simulation/offline";

/**
 * RW3D #149 (U06): the return summary, pinned to the SAME reproducible fixtures
 * as tests/ui/return-149.probe.mts (storage-full / power-limited / starved /
 * null-idle / producing). Two layers, both pure of wall-clock manipulation:
 *
 *  1. `deriveReturn` resolves each settled bottleneck to its real shared label
 *     via t(`bottleneck.${id}`) — "Storage full" / "Power limited" / "Waiting for
 *     input" — and to null when the yard ran cleanly. Every gain, delivery and
 *     batch in the model reconciles to the settled catch-up report AND to the
 *     sim's own store/fleet/batch deltas (the report is a receipt, not a claim).
 *  2. The painted ReturnReportPanel shows that bottleneck with its one
 *     focus-and-fix sentence (BOTTLENECK_ADVICE) and a single resume action
 *     ("Back to yard") plus the optional copy-report recovery footer — NEVER a
 *     reset, claim or restart. The painted detail rows reconcile to the report.
 *
 * Brief-tab-switch NON-OBSTRUCTION is already covered and is REFERENCED here, not
 * rebuilt (a wall-clock App test would be fragile and duplicate authority):
 *   - tests/ui/shell-report-135.test.tsx — the #199 auto-open race rework:
 *     App.tsx opens PANEL_REPORT only while the panel stack is untouched, so a
 *     credited brief return never clobbers an already-open panel or blocks the
 *     brief tab switch.
 *   - tests/ui/return-61.test.tsx (store parity) — a reload at the same clock
 *     credits nothing; a real gap credits exactly once. The return panel is an
 *     inline role="group" receipt with one resume and no dialog, so dismissing or
 *     re-opening it cannot obstruct the shell or double-apply gains.
 * The single focused panel assertion below ties the #149 "brief return" window to
 * that non-obstruction guarantee at the panel level (no clocks, no App mount).
 *
 * Fixture mutation lives only in this file; every yard is built with the engine's
 * own commands. No src module is touched (engine.ts read-only; the inherited #214
 * trade-lesson vacuity is characterized in onboard-149 and escalated at #214).
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 14900;
const send = (s: SimState, body: CommandBody) =>
  applyCommand(s, { ...body, id: `r149-${(seq += 1)}` } as Command);

const sumStore = (store: Record<string, number>) =>
  Object.values(store).reduce((total, qty) => total + (qty ?? 0), 0);

function firstFree(s: SimState): number {
  for (let tile = 0; tile < YARD_TILES; tile += 1) {
    if (tile !== DOCK_TILE && !s.machines.some((m) => m.tile === tile)) return tile;
  }
  return 8;
}

/** Build a blueprint on a free tile and auto-connect its routes (the real path). */
function build(s: SimState, blueprint: string): number {
  const tile = firstFree(s);
  const result = send(s, { type: "machine.build", blueprint, tile });
  expect(result.ok, `build ${blueprint}: ${JSON.stringify(result)}`).toBe(true);
  const id = s.machines[s.machines.length - 1].id;
  for (const plan of planConnections(s, id)) {
    send(s, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
  }
  return id;
}

const T0 = 1_700_000_000_000;
const totalBatches = (s: SimState) => s.machines.reduce((t, m) => t + m.batchesDone, 0);

// --- The probe fixtures, verbatim (return-149.probe.mts) ---------------------
function storageFull(): SimState {
  const s = createInitialState();
  s.tutorial = 9;
  s.store = { scrap: 300 };
  s.storeUnits = 300;
  return s;
}
function powerLimited(): SimState {
  const s = createInitialState();
  s.tutorial = 9;
  s.store = { scrap: 200, ferrous: 200, steel: 40 };
  s.storeUnits = sumStore(s.store);
  for (let i = 0; i < 4; i += 1) build(s, "furnace");
  advance(s, 120);
  return s;
}
function starved(): SimState {
  const s = createInitialState();
  s.tutorial = 9;
  s.store = { scrap: 30, steel: 4, ferrous: 20 };
  s.storeUnits = sumStore(s.store);
  build(s, "sorter");
  s.store = { ferrous: 20 };
  s.storeUnits = 20;
  s.wreck.remaining = 0;
  advance(s, 120);
  return s;
}
function nullIdle(): SimState {
  const s = createInitialState();
  s.tutorial = 9;
  return s;
}
function producing(): SimState {
  const s = createInitialState();
  for (let i = 0; i < 6; i += 1) {
    send(s, { type: "manual.salvage" });
    advance(s, TUNING.manualPulseTicks);
  }
  send(s, { type: "drone.repair" });
  advance(s, 262);
  s.tutorial = 9;
  build(s, "sorter");
  build(s, "furnace");
  advance(s, 300);
  return s;
}

/** Settle a 600-tick (brief) absence and capture the sim deltas for parity. */
function settle(s: SimState) {
  const beforeStore = { ...s.store } as Record<string, number>;
  const beforeD = fleetDeliveries(s);
  const beforeB = totalBatches(s);
  const beforeCredits = s.credits;
  const { report } = catchUp(s, T0, T0 + 600 * TICK_MS);
  const afterStore = s.store as Record<string, number>;
  return {
    report,
    dDelta: fleetDeliveries(s) - beforeD,
    bDelta: totalBatches(s) - beforeB,
    creditsDelta: s.credits - beforeCredits,
    storeDelta: (id: string) => (afterStore[id] ?? 0) - (beforeStore[id] ?? 0),
  };
}

/**
 * Expected values pinned from the committed probe stdout (return-149.probe.mts).
 * The seeds are deterministic and engine.ts is read-only, so these are truthful
 * fixed points, not guesses. `label` is the resolved t(`bottleneck.${id}`) line.
 */
const CASES: {
  name: string;
  make: () => SimState;
  bottleneck: ReturnReport["bottleneck"];
  label: string | null;
  deliveries: number;
  batches: number;
  gains: Record<string, number>;
}[] = [
  { name: "storage-full", make: storageFull, bottleneck: "storage-full", label: "Storage full", deliveries: 0, batches: 0, gains: {} },
  { name: "power-limited", make: powerLimited, bottleneck: "power-limited", label: "Power limited", deliveries: 0, batches: 44, gains: { steel: 44 } },
  { name: "starved", make: starved, bottleneck: "starved", label: "Waiting for input", deliveries: 0, batches: 0, gains: {} },
  { name: "null-idle", make: nullIdle, bottleneck: null, label: null, deliveries: 0, batches: 0, gains: {} },
  { name: "producing", make: producing, bottleneck: null, label: null, deliveries: 12, batches: 22, gains: { scrap: 30, steel: 8, nonferrous: 15 } },
];

const roots: Root[] = [];
function mountPanel(report: ReturnReport, onClose: () => void = () => undefined) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(<ReturnReportPanel report={report} onClose={onClose} />);
  });
  return host;
}
const q = <T extends Element>(host: HTMLElement, sel: string) => host.querySelector<T>(sel);
const detailValue = (host: HTMLElement, label: string) => {
  const row = [...host.querySelectorAll(".return-detail .panel__row")].find(
    (r) => r.querySelector("dt")?.textContent === label
  );
  return row?.querySelector("dd")?.textContent ?? null;
};

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

describe("RW3D #149 (U06): deriveReturn resolves each probe bottleneck to its real label", () => {
  it.each(CASES)("$name -> $label (reconciled to the settled report)", (c) => {
    const { report, dDelta, bDelta, creditsDelta, storeDelta } = settle(c.make());
    // The brief window is fully credited and uncapped (600 ticks << 12h cap).
    expect(report.awayTicks).toBe(600);
    expect(report.creditedTicks).toBe(600);
    expect(report.capped).toBe(false);

    const model = deriveReturn(report);
    // The bottleneck id and its resolved shared label, never the raw key.
    expect(model.bottleneck).toBe(c.bottleneck);
    expect(model.bottleneckLabel).toBe(c.label);
    if (c.bottleneck) {
      expect(model.bottleneckLabel).toBe(t(`bottleneck.${c.bottleneck}`));
      expect(model.bottleneckLabel).not.toBe(c.bottleneck); // resolved, not raw
    } else {
      expect(model.bottleneckLabel).toBeNull();
    }

    // Truthful pins from the probe stdout (expected vs actual).
    expect(report.bottleneck).toBe(c.bottleneck);
    expect(report.deliveries).toBe(c.deliveries);
    expect(report.batchesDone).toBe(c.batches);
    expect({ ...report.gains }).toEqual(c.gains);

    // Reconcile: the model mirrors the report, and the report mirrors the sim.
    expect(model.deliveries).toBe(report.deliveries);
    expect(model.batchesDone).toBe(report.batchesDone);
    expect(model.creditsGained).toBe(report.creditsGained);
    expect(report.deliveries).toBe(dDelta);
    expect(report.batchesDone).toBe(bDelta);
    expect(report.creditsGained).toBe(creditsDelta);
    let units = 0;
    for (const [id, amount] of Object.entries(report.gains)) {
      expect(amount).toBe(storeDelta(id)); // every gain is a real store delta
      units += amount;
    }
    expect(model.totalUnits).toBe(units);
    expect(model.gainLines.reduce((sum, g) => sum + g.amount, 0)).toBe(units);
  });
});

describe("RW3D #149 (U06): the painted panel shows the bottleneck and a focus-and-fix recovery without reset", () => {
  it.each(CASES)("$name paints its bottleneck, advice and reconciled record", (c) => {
    const { report } = settle(c.make());
    const model = deriveReturn(report);
    let closed = 0;
    const host = mountPanel(report, () => {
      closed += 1;
    });

    // The key bottleneck block: resolved label + one actionable focus-and-fix line.
    const block = q<HTMLElement>(host, ".return-bottleneck")!;
    expect(block.getAttribute("data-bottleneck")).toBe(c.bottleneck ?? "none");
    expect(q(host, ".return-bottleneck__label")?.textContent).toBe(
      c.label ?? RETURN_COPY.noBottleneck
    );
    expect(q(host, ".return-bottleneck__advice")?.textContent).toBe(
      c.bottleneck ? BOTTLENECK_ADVICE[c.bottleneck] : RETURN_COPY.noBottleneckAdvice
    );

    // One resume action ("Back to yard") that closes the receipt — not a reset.
    const resume = q<HTMLButtonElement>(host, ".return-resume")!;
    expect(resume.textContent).toBe(t("btn.backToYard"));
    act(() => resume.click());
    expect(closed).toBe(1);

    // The recovery footer is export/import + copy-report guidance, never a reset.
    expect(q(host, ".return-recovery__body")?.textContent).toBe(RETURN_COPY.recoveryBody);
    const buttons = [...host.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(buttons).toEqual([t("btn.backToYard"), RETURN_COPY.copyReport]);
    for (const label of buttons) {
      expect(label.toLowerCase()).not.toMatch(/reset|claim|restart|wipe/);
    }
    // The settled status is an inline receipt: gains already applied, nothing to claim.
    const applied = q<HTMLElement>(host, ".return-applied")!;
    expect(applied.getAttribute("role")).toBe("status");
    expect(applied.textContent).toBe(
      model.kind === "earned" ? RETURN_COPY.appliedEarned : RETURN_COPY.appliedZero
    );

    // The painted detail rows reconcile to the settled report.
    expect(detailValue(host, t("row.deliveries"))).toBe(String(report.deliveries));
    expect(detailValue(host, t("row.batches"))).toBe(String(report.batchesDone));
    const gainRows = [...host.querySelectorAll<HTMLElement>(".return-gain")];
    expect(gainRows.map((r) => r.getAttribute("data-resource"))).toEqual(
      model.gainLines.map((g) => g.id)
    );
    for (const row of gainRows) {
      const id = row.getAttribute("data-resource") as string;
      const gain = model.gainLines.find((g) => g.id === id)!;
      expect(row.querySelector(".return-gain__value")?.textContent).toBe(`+${gain.formatted}`);
      expect(gain.amount).toBe((report.gains as Record<string, number>)[id]);
    }
    if (report.creditsGained > 0) {
      expect(q(host, ".return-credits__value")?.textContent).toBe(
        `+${model.creditsGained}`
      );
    }
  });
});

describe("RW3D #149 (U06): a credited brief return is a non-obstructing inline receipt", () => {
  // Non-obstruction of the brief tab switch is owned by shell-report-135 (#199
  // auto-open race) and return-61 store parity (referenced above). This single
  // focused panel assertion ties the #149 brief-return window to that guarantee
  // without any wall-clock App mount: the producing yard's 600-tick credited
  // return paints as an inline group receipt with one resume and no blocking
  // dialog, so it cannot clobber an open panel or trap the brief tab switch.
  it("the producing brief return is role=group, one resume, no dialog/claim/reset", () => {
    const { report } = settle(producing());
    expect(report.creditedTicks).toBe(600);
    expect(report.capped).toBe(false);
    expect(deriveReturn(report).kind).toBe("earned");
    const host = mountPanel(report);
    const panel = q<HTMLElement>(host, ".panel--report")!;
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("data-state")).toBe("earned");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelectorAll(".return-resume")).toHaveLength(1);
    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels.some((l) => /reset|claim|restart/i.test(l))).toBe(false);
    // The brief return reconciles: 12 deliveries / 22 batches, gains already applied.
    expect(detailValue(host, t("row.deliveries"))).toBe("12");
    expect(detailValue(host, t("row.batches"))).toBe("22");
    expect(q(host, ".return-applied")?.textContent).toBe(RETURN_COPY.appliedEarned);
  });
});
