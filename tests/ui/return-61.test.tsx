import { describe, expect, it, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ReturnReportPanel } from "../../src/ui/Panels";
import { deriveReturn, formatAway } from "../../src/ui/return/model";
import { BOTTLENECK_ADVICE, RETURN_COPY } from "../../src/ui/return/copy";
import { createStore } from "../../src/app/store";
import {
  DEFAULT_SETTINGS,
  SAVE_KEY,
  encodeSave,
} from "../../src/game/persistence/save";
import {
  createInitialState,
  fleetDeliveries,
  type SimState,
} from "../../src/game/simulation/types";
import {
  applyCommand,
  DOCK_TILE,
  YARD_TILES,
  type Command,
  type CommandBody,
} from "../../src/game/simulation/commands";
import { planConnections } from "../../src/game/simulation/autoconnect";
import { advance } from "../../src/game/simulation/engine";
import { BLUEPRINTS, TUNING } from "../../src/game/content/defs";
import type { ReturnReport } from "../../src/game/simulation/offline";

/**
 * UI-RESET-61 (issue #61): the rebuilt return report.
 *
 * Three layers of proof:
 *  1. The pure model (states, day-precision durations, ordering, diagnostic).
 *  2. The panel's legacy DOM contracts (the read-only i18n / overlay suites'
 *     exact strings and census) alongside the new summary/detail hierarchy,
 *     the no-claim guarantee, the clipboard recovery and focus restore.
 *  3. Store parity through the REAL persistence path: saves seeded with the
 *     game's own encodeSave and a past lastSeenMs, the adopted report compared
 *     against the sim's actual store deltas, and reloads proving gains are
 *     never applied twice (the clock reference moved to nowMs).
 *
 * Fixture seeding mutates state only here in test code (the same pattern as
 * tests/ui/i18n.test.tsx and tests/persistence/save.test.ts); no src module is
 * touched and no validation is bypassed — every seeded envelope still passes
 * the game's full decodeSave/repairRegistration/validateSim on load.
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

// The same key-shape guard tests/ui/i18n.test.tsx paints with.
const KEY_PREFIXES = [
  "btn", "row", "value", "card", "step", "hint", "unit", "res", "status",
  "reject", "import", "report", "note", "field", "title", "aria", "gate",
  "sound", "glyph", "advice", "evidence", "yard", "tut", "objective",
  "bottleneck", "reader", "chip", "hud", "phase",
];
const KEY_PATTERN = new RegExp(`\\b(${KEY_PREFIXES.join("|")})\\.[a-z]`);

/** The exact fixture the read-only i18n suite renders. */
const LEGACY_REPORT: ReturnReport = {
  awayTicks: 6_500,
  creditedTicks: TUNING.offlineCapTicks,
  capped: true,
  gains: { scrap: 412, ferrous: 96 },
  creditsGained: 165,
  deliveries: 72,
  batchesDone: 1_043,
  bottleneck: "storage-full",
};

function report(over: Partial<ReturnReport> = {}): ReturnReport {
  return {
    awayTicks: 600,
    creditedTicks: 600,
    capped: false,
    gains: { scrap: 12 },
    creditsGained: 0,
    deliveries: 0,
    batchesDone: 0,
    bottleneck: null,
    ...over,
  };
}

function mountPanel(
  r: ReturnReport,
  onClose: () => void = () => undefined
): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ReturnReportPanel report={r} onClose={onClose} />);
  });
  return { host, root };
}

function unmount(root: Root) {
  act(() => {
    root.unmount();
  });
}

const text = (host: HTMLElement) => host.textContent ?? "";
const q = <T extends Element>(host: HTMLElement, sel: string) =>
  host.querySelector<T>(sel);

let seq = 0;
function send(state: SimState, body: CommandBody): unknown {
  return applyCommand(state, { ...body, id: `r61-${(seq += 1)}` } as Command);
}

/**
 * A developed yard (the proven shell-49 / research-58 mature pattern): past the
 * tutorial, a sorter and a furnace with auto-planned connections, so a 12h
 * catch-up really stores output and the parity assertions have substance.
 */
function matureYard(): SimState {
  const state = createInitialState();
  for (let pass = 0; pass < 6; pass += 1) {
    send(state, { type: "manual.salvage" });
    advance(state, TUNING.manualPulseTicks);
  }
  send(state, { type: "drone.repair" });
  advance(state, 262);
  state.tutorial = 9;
  for (const blueprint of ["sorter", "furnace"] as const) {
    for (const item of BLUEPRINTS[blueprint].buildCost) {
      state.store = { ...state.store, [item.resource]: item.qty };
    }
    state.storeUnits = Object.values(state.store).reduce(
      (total, qty) => total + (qty ?? 0),
      0
    );
    let tile = 8;
    for (let t = 0; t < YARD_TILES; t += 1) {
      if (t !== DOCK_TILE && !state.machines.some((m) => m.tile === t)) {
        tile = t;
        break;
      }
    }
    send(state, { type: "machine.build", blueprint, tile });
    const machineId = state.machines[state.machines.length - 1].id;
    for (const plan of planConnections(state, machineId)) {
      send(state, { type: "route.connect", from: plan.from, to: plan.to, filter: plan.filter });
    }
    advance(state, 300);
  }
  state.credits = 100;
  state.store = { ...state.store, data: 12 };
  state.storeUnits += 12;
  advance(state, 1);
  return state;
}

const T0 = 1_700_000_000_000;
const HOUR_MS = 3_600_000;

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  // jsdom has no clipboard; each copy test installs its own configurable stub.
  if ("clipboard" in navigator) {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  }
});

describe("return-61 model: pure derivation over the settled report", () => {
  it("formats a day or more with day precision, shorter absences with the shared formatter", () => {
    expect(formatAway(6_500)).toBe("10m 50s");
    expect(formatAway(90_000)).toBe("2h 30m");
    expect(formatAway(TUNING.offlineCapTicks)).toBe("12h 0m");
    expect(formatAway(864_000)).toBe("1d 0h");
    expect(formatAway(2_592_000)).toBe("3d 0h");
    expect(formatAway(26_784_000)).toBe("31d 0h");
    // 1d 2h 30m -> day + hour precision, minutes dropped at day scale.
    expect(formatAway(864_000 + 72_000 + 18_000)).toBe("1d 2h");
  });

  it("orders gains largest first, ties by the content table, and derives shares", () => {
    const m = deriveReturn(
      report({ gains: { ferrous: 96, scrap: 412, residue: 50 }, creditsGained: 165 })
    );
    expect(m.kind).toBe("earned");
    expect(m.stateLabel).toBe("Earned");
    expect(m.gainLines.map((g) => g.id)).toEqual(["scrap", "ferrous", "residue"]);
    expect(m.totalUnits).toBe(558);
    expect(m.gainLines[0].share).toBe(1);
    expect(m.gainLines[1].share).toBeCloseTo(96 / 412, 6);
    expect(m.gainLines[0].formatted).toBe("412");

    const tie = deriveReturn(report({ gains: { ferrous: 10, scrap: 10 } }));
    expect(tie.gainLines.map((g) => g.id)).toEqual(["scrap", "ferrous"]);
  });

  it("separates zero gain, credits-only and no-credit windows", () => {
    const zero = deriveReturn(report({ gains: {}, creditsGained: 0 }));
    expect(zero.kind).toBe("zero-gain");
    expect(zero.stateLabel).toBe("Zero gain");
    expect(zero.gainLines).toEqual([]);

    const creditsOnly = deriveReturn(report({ gains: {}, creditsGained: 40 }));
    expect(creditsOnly.kind).toBe("earned");

    const none = deriveReturn(report({ awayTicks: 0, creditedTicks: 0, gains: {} }));
    expect(none.kind).toBe("no-credit");
    expect(none.stateLabel).toBe("No credit");
  });

  it("marks the cap and the long absence, and keeps the uncredited tail", () => {
    const capped = deriveReturn(
      report({ awayTicks: 468_000, creditedTicks: 432_000, capped: true })
    );
    expect(capped.capped).toBe(true);
    expect(capped.longAbsence).toBe(false);
    expect(capped.stateLabel).toBe("Capped");
    expect(capped.uncreditedTicks).toBe(36_000);
    expect(capped.capHours).toBe(12);
    expect(capped.awayLabel).toBe("13h 0m");

    const long = deriveReturn(
      report({ awayTicks: 2_592_000, creditedTicks: 432_000, capped: true })
    );
    expect(long.longAbsence).toBe(true);
    expect(long.stateLabel).toBe("Long absence");
    expect(long.awayLabel).toBe("3d 0h");
    expect(long.awayExact).toBe("72h 0m");
    expect(long.uncreditedTicks).toBe(2_160_000);
  });

  it("builds a deterministic diagnostic with resolved labels, never raw keys", () => {
    const m = deriveReturn(LEGACY_REPORT);
    expect(m.bottleneckLabel).toBe("Storage full");
    expect(m.reportText).toContain("Rustwake return report");
    expect(m.reportText).toContain("Bottleneck: Storage full");
    expect(m.reportText).toContain("Scrap +412");
    expect(m.reportText).not.toContain("storage-full");
    expect(KEY_PATTERN.test(m.reportText)).toBe(false);
    // Pure: the same report derives the same text.
    expect(deriveReturn(LEGACY_REPORT).reportText).toBe(m.reportText);
  });
});

describe("return-61 panel: legacy contracts kept, new hierarchy painted", () => {
  it("keeps the exact i18n / overlay contracts", () => {
    const { host, root } = mountPanel(LEGACY_REPORT);
    const panel = q<HTMLElement>(host, ".panel--report")!;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-label")).toBe("Return report");
    expect(q(host, ".panel__title")?.textContent).toBe("While you were away");
    const headButton = q<HTMLButtonElement>(host, ".panel__head button")!;
    expect(headButton.classList.contains("icon-btn")).toBe(true);
    expect(headButton.textContent).toBe("Back to yard");
    expect(host.querySelectorAll(".panel__head button")).toHaveLength(1);
    expect(host.querySelector(".panel__body")).not.toBeNull();

    const body = text(host);
    expect(body).toContain("Away 10m 50s");
    expect(body).toContain("Your operation worked for 12h 0m (capped)");
    expect(body).toContain("Storage full");
    expect(body).not.toContain("storage-full");
    expect(KEY_PATTERN.test(body)).toBe(false);
    unmount(root);
  });

  it("paints the summary hierarchy: away, chip, headline, applied status, ordered gains", () => {
    const { host, root } = mountPanel(LEGACY_REPORT);
    expect(q(host, ".return-away__value")?.textContent).toBe("10m 50s");
    const chip = q(host, ".return-chip")!;
    expect(chip.textContent).toBe("Capped");
    expect(chip.getAttribute("data-kind")).toBe("earned");
    expect(q(host, ".return-headline")?.textContent).toBe(
      "+508 units across 2 resources"
    );
    const applied = q(host, ".return-applied")!;
    expect(applied.getAttribute("role")).toBe("status");
    expect(applied.textContent).toBe(RETURN_COPY.appliedEarned);

    const rows = [...host.querySelectorAll<HTMLElement>(".return-gain")];
    expect(rows.map((r) => r.getAttribute("data-resource"))).toEqual([
      "scrap",
      "ferrous",
    ]);
    expect(rows[0].querySelector(".return-gain__value")?.textContent).toBe("+412");
    expect(rows[1].querySelector(".return-gain__value")?.textContent).toBe("+96");
    const fills = rows.map(
      (r) => r.querySelector<HTMLElement>(".return-gain__fill")!.style.width
    );
    expect(fills).toEqual(["100%", "23%"]);
    expect(q(host, ".return-credits__value")?.textContent).toBe("+165");

    // Limits: the cap rule with the tuning-derived budget; no long-absence note.
    expect(q(host, '[data-limit="cap"]')?.textContent).toBe(
      "Offline work is capped at 12h per absence. Time beyond the cap does not earn."
    );
    expect(q(host, '[data-limit="long-absence"]')).toBeNull();
    // Key bottleneck: legacy label + one actionable sentence.
    expect(q(host, ".return-bottleneck")?.getAttribute("data-bottleneck")).toBe(
      "storage-full"
    );
    expect(q(host, ".return-bottleneck__label")?.textContent).toBe("Storage full");
    expect(q(host, ".return-bottleneck__advice")?.textContent).toBe(
      BOTTLENECK_ADVICE["storage-full"]
    );
    unmount(root);
  });

  it("offers one resume action and optional recovery, never a reward claim", () => {
    const { host, root } = mountPanel(LEGACY_REPORT);
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Back to yard",
      "Copy report",
    ]);
    expect(buttons.some((b) => /claim/i.test(b.textContent ?? ""))).toBe(false);
    expect(text(host)).toContain("nothing to claim");
    expect(q(host, ".return-recovery__body")?.textContent).toContain("Yard record");
    // No dialog role anywhere: the report is an inline receipt.
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    unmount(root);
  });

  it("answers a zero-gain window without a gains list or a claim", () => {
    const { host, root } = mountPanel(
      report({ gains: {}, creditsGained: 0, bottleneck: null })
    );
    expect(q(host, ".panel--report")?.getAttribute("data-state")).toBe("zero-gain");
    expect(q(host, ".return-chip")?.textContent).toBe("Zero gain");
    expect(q(host, ".return-headline")?.textContent).toBe(RETURN_COPY.zeroHeadline);
    expect(q(host, ".return-zero")?.textContent).toBe(RETURN_COPY.zeroBody);
    expect(q(host, ".return-applied")?.textContent).toBe(RETURN_COPY.appliedZero);
    expect(host.querySelectorAll(".return-gain")).toHaveLength(0);
    expect(q(host, ".return-limits")).toBeNull();
    expect(q(host, ".return-bottleneck__label")?.textContent).toBe(
      RETURN_COPY.noBottleneck
    );
    expect(q(host, ".return-bottleneck__advice")?.textContent).toBe(
      RETURN_COPY.noBottleneckAdvice
    );
    expect(KEY_PATTERN.test(text(host))).toBe(false);
    unmount(root);
  });

  it("answers a long absence with day precision and both limit notes", () => {
    const { host, root } = mountPanel(
      report({
        awayTicks: 2_592_000,
        creditedTicks: 432_000,
        capped: true,
        gains: { scrap: 100 },
      })
    );
    expect(q(host, ".panel--report")?.getAttribute("data-long-absence")).toBe("true");
    expect(q(host, ".return-away__value")?.textContent).toBe("3d 0h");
    expect(q(host, ".return-chip")?.textContent).toBe("Long absence");
    expect(q(host, '[data-limit="long-absence"]')?.textContent).toBe(
      "You were away 3d 0h. Only the first 12h 0m earned production."
    );
    expect(q(host, '[data-limit="cap"]')).not.toBeNull();
    // The legacy detail rows keep the shared hour-capped formatter verbatim.
    expect(text(host)).toContain("Away 72h 0m");
    unmount(root);
  });

  it("answers a credits-only window with the credits headline", () => {
    const { host, root } = mountPanel(report({ gains: {}, creditsGained: 40 }));
    expect(q(host, ".return-headline")?.textContent).toBe("+40 credits earned");
    expect(q(host, ".return-credits__value")?.textContent).toBe("+40");
    unmount(root);
  });
});

describe("return-61 recovery: clipboard diagnostic with inline status", () => {
  function stubClipboard(writeText: (t: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  }

  it("copies the deterministic report and confirms inline (no dialog)", async () => {
    const writeText = vi.fn(async (_: string) => undefined);
    stubClipboard(writeText);
    const { host, root } = mountPanel(LEGACY_REPORT);
    await act(async () => {
      q<HTMLButtonElement>(host, ".return-copy")!.click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("Rustwake return report");
    expect(copied).toContain("Bottleneck: Storage full");
    const note = q(host, ".return-copy__note")!;
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toBe("Copied to the clipboard");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    unmount(root);
  });

  it("degrades to a readable inline failure when the clipboard refuses", async () => {
    stubClipboard(async () => {
      throw new Error("denied");
    });
    const { host, root } = mountPanel(LEGACY_REPORT);
    await act(async () => {
      q<HTMLButtonElement>(host, ".return-copy")!.click();
    });
    expect(q(host, ".return-copy__note")?.textContent).toBe(RETURN_COPY.copyFailed);
    unmount(root);
  });

  it("degrades when no clipboard API exists at all", async () => {
    const { host, root } = mountPanel(LEGACY_REPORT);
    await act(async () => {
      q<HTMLButtonElement>(host, ".return-copy")!.click();
    });
    expect(q(host, ".return-copy__note")?.textContent).toBe(RETURN_COPY.copyFailed);
    unmount(root);
  });
});

describe("return-61 focus: restore on every close path", () => {
  it("focuses the resume action on mount and restores the opener on close", () => {
    const opener = document.createElement("button");
    opener.id = "opener";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    let closed = 0;
    const { host, root } = mountPanel(LEGACY_REPORT, () => {
      closed += 1;
    });
    const resume = q<HTMLButtonElement>(host, ".return-resume")!;
    expect(document.activeElement).toBe(resume);

    act(() => resume.click());
    expect(closed).toBe(1);
    unmount(root);
    expect(document.activeElement).toBe(opener);
  });

  it("restores focus on an unmount without a click (the App-owned Escape path)", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { root } = mountPanel(LEGACY_REPORT);
    unmount(root);
    expect(document.activeElement).toBe(opener);
  });

  it("falls back to the Menu face when the opener is gone (boot gate, closed menu)", () => {
    const face = document.createElement("button");
    face.className = "shell-menu-face";
    document.body.appendChild(face);
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { root } = mountPanel(LEGACY_REPORT);
    opener.remove(); // the boot gate / menu row unmounted before the report closes
    unmount(root);
    expect(document.activeElement).toBe(face);
  });

  it("falls back to the first dock button when no Menu face exists", () => {
    const dock = document.createElement("div");
    dock.className = "dock";
    const dockBtn = document.createElement("button");
    dock.appendChild(dockBtn);
    document.body.appendChild(dock);
    const { root } = mountPanel(LEGACY_REPORT);
    unmount(root);
    expect(document.activeElement).toBe(dockBtn);
  });
});

describe("return-61 store parity: the report matches the sim, reloads never double-apply", () => {
  it("seeds a 13h absence with encodeSave and the adopted report equals the sim deltas", () => {
    const before = matureYard();
    const beforeStore = { ...before.store };
    const beforeCredits = before.credits;
    const beforeDeliveries = fleetDeliveries(before);
    const storage = memoryStorage();
    storage.setItem(
      SAVE_KEY,
      encodeSave(before, T0 - 13 * HOUR_MS, { ...DEFAULT_SETTINGS, muted: true })
    );

    const store = createStore({ storage, now: () => T0 });
    const r = store.getReturnReport()!;
    expect(r).not.toBeNull();
    expect(r.awayTicks).toBe(13 * 36_000);
    expect(r.creditedTicks).toBe(TUNING.offlineCapTicks);
    expect(r.capped).toBe(true);

    // Parity: every painted gain is exactly the store delta the catch-up made.
    const after = store.getState();
    let total = 0;
    for (const [id, delta] of Object.entries(r.gains)) {
      const key = id as keyof typeof after.store;
      expect(delta).toBe((after.store[key] ?? 0) - (beforeStore[key] ?? 0));
      expect(delta).toBeGreaterThan(0);
      total += delta;
    }
    expect(total).toBeGreaterThan(0);
    expect(r.creditsGained).toBe(after.credits - beforeCredits);
    expect(r.deliveries).toBe(fleetDeliveries(after) - beforeDeliveries);

    // The panel paints exactly those gains, largest first.
    const { host, root } = mountPanel(r);
    const rows = [...host.querySelectorAll<HTMLElement>(".return-gain")];
    expect(rows.map((row) => row.getAttribute("data-resource"))).toEqual(
      deriveReturn(r).gainLines.map((g) => g.id)
    );
    for (const row of rows) {
      const id = row.getAttribute("data-resource") as keyof typeof r.gains;
      expect(row.querySelector(".return-gain__value")?.textContent).toBe(
        `+${r.gains[id]}`
      );
    }
    unmount(root);
  });

  it("reload at the same clock credits nothing: totals and tick are identical", () => {
    const storage = memoryStorage();
    const fresh = createInitialState();
    storage.setItem(
      SAVE_KEY,
      encodeSave(fresh, T0 - 600_000, { ...DEFAULT_SETTINGS, muted: true })
    );
    const first = createStore({ storage, now: () => T0 });
    const r = first.getReturnReport()!;
    expect(r.creditedTicks).toBe(6_000);
    expect(Object.keys(r.gains)).toHaveLength(0); // idle yard: the zero-gain state

    const second = createStore({ storage, now: () => T0 });
    expect(second.getReturnReport()).toBeNull();
    expect(second.getState().tick).toBe(first.getState().tick);
    expect({ ...second.getState().store }).toEqual({ ...first.getState().store });
    expect(second.getState().credits).toBe(first.getState().credits);
  });

  it("reload after a real gap credits only that gap, never the original absence", () => {
    const storage = memoryStorage();
    const before = matureYard();
    storage.setItem(
      SAVE_KEY,
      encodeSave(before, T0 - 13 * HOUR_MS, { ...DEFAULT_SETTINGS, muted: true })
    );
    const first = createStore({ storage, now: () => T0 });
    expect(first.getReturnReport()!.awayTicks).toBe(13 * 36_000);
    const totals1 = Object.values(first.getState().store).reduce(
      (a, b) => a + (b ?? 0),
      0
    );

    // A reload 60s later: the clock reference already moved to T0, so only the
    // real 60s gap (600 ticks) can be credited — not the 13h window again.
    const second = createStore({ storage, now: () => T0 + 60_000 });
    const r2 = second.getReturnReport()!;
    expect(r2.awayTicks).toBe(600);
    expect(r2.creditedTicks).toBe(600);
    expect(r2.capped).toBe(false);
    const totals2 = Object.values(second.getState().store).reduce(
      (a, b) => a + (b ?? 0),
      0
    );
    // Bounded by the gap: at most a few units per tick across the whole yard.
    expect(totals2 - totals1).toBeGreaterThanOrEqual(0);
    expect(totals2 - totals1).toBeLessThanOrEqual(600 * 4);
  });
});
