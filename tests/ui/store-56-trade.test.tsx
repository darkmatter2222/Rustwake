import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { StorePanel } from "../../src/ui/Panels";
import { RESOURCES, TUNING } from "../../src/game/content/defs";
import {
  applyCommand,
  sellableAmount,
  type Command,
  type CommandBody,
  type CommandResult,
} from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { unit } from "../../src/game/content/strings";

/**
 * UI-RESET-56 (issue #56): the trade desk's behaviour, end to end.
 *
 * Every action under test goes through the real UI path: a click on the rendered
 * sell face dispatches `contract.sell` through `applyCommand`, and the assertions
 * read the engine's own state afterwards. Fixture mutation happens only in this
 * test file (the documented seeds below); nothing is injected into the running
 * panel. The engine's `sellableAmount` is the reference for every ceiling, so the
 * preview, the reserve floor and the machine-demand reservation are checked
 * against the same authority the sell command uses.
 */

let seq = 5600;
function send(state: SimState, body: CommandBody): CommandResult {
  return applyCommand(state, { ...body, id: `t56-${(seq += 1)}` } as Command);
}

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

/** plates 880 + scrap 20 = 900/900: plates sellable 60, scrap sellable 10. */
function fullStore(): SimState {
  return seeded((s) => {
    s.store.plates = 880;
    s.store.scrap = 20;
    s.storeUnits = 900;
  });
}

interface Mount {
  host: HTMLElement;
  sent: Command[];
  results: CommandResult[];
  rerender: () => void;
}

/** `live: false` applies commands without repainting — the stale-tap scenario. */
function mount(state: SimState, live = true): Mount {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const sent: Command[] = [];
  const results: CommandResult[] = [];
  const panel = () => <StorePanel state={state} dispatch={dispatch} onClose={() => undefined} />;
  const dispatch = (command: Command) => {
    sent.push(command);
    const result = applyCommand(state, command);
    results.push(result);
    if (live) act(() => root.render(panel()));
    return result;
  };
  act(() => root.render(panel()));
  return { host, sent, results, rerender: () => act(() => root.render(panel())) };
}

function card(host: HTMLElement, resource: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`.store-trade[data-resource="${resource}"]`);
}

function sellButton(host: HTMLElement, resource: string): HTMLButtonElement | null {
  return card(host, resource)?.querySelector<HTMLButtonElement>(".store-trade__sell") ?? null;
}

/** The shared findButton semantics: first button whose label starts with the text. */
function findButton(host: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll("button")).find((b) =>
    (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith(label),
  );
}

function preview(host: HTMLElement, resource: string): HTMLElement | null {
  return card(host, resource)?.querySelector<HTMLElement>(".store-trade__preview") ?? null;
}

function qtyInput(host: HTMLElement, resource: string): HTMLInputElement {
  const input = card(host, resource)?.querySelector<HTMLInputElement>(".store-trade__qty");
  expect(input, `quantity input for ${resource}`).not.toBeNull();
  return input as HTMLInputElement;
}

/** React-safe direct entry: native value setter + a bubbling input event. */
function setQty(host: HTMLElement, resource: string, value: string) {
  const input = qtyInput(host, resource);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.click();
  });
}

function press(host: HTMLElement, resource: string, label: string) {
  const section = card(host, resource);
  const button = Array.from(section?.querySelectorAll("button") ?? []).find((b) =>
    (b.getAttribute("aria-label") ?? "").startsWith(label),
  );
  expect(button, `${label} control for ${resource}`).toBeDefined();
  click(button as HTMLButtonElement);
}

/** The engine's sell log records the quantity sold per tranche (`commit(s,"sell",amount)`). */
function sellLog(state: SimState): number[] {
  return state.log.filter((entry) => entry.key === "sell").map((entry) => entry.value);
}

describe("UI-RESET-56 trade desk", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens one card per sellable resource, dearest first, with the exact default tranche", () => {
    const { host } = mount(fullStore());
    const cards = Array.from(host.querySelectorAll(".store-trade")).map((c) => c.getAttribute("data-resource"));
    expect(cards).toEqual(["plates", "scrap"]);

    const plates = card(host, "plates") as HTMLElement;
    expect(plates.getAttribute("aria-label")).toBe("Plates trade");
    expect(plates.querySelector(".store-trade__price")?.textContent).toBe("15 credits per unit");
    expect(plates.querySelector(".store-trade__facts")?.textContent).toBe("Stock 880 · Sellable 60");
    expect(plates.querySelector("header svg")).not.toBeNull();
    expect(qtyInput(host, "plates").value).toBe("60");
    expect(preview(host, "plates")?.textContent).toBe("60 × 15 = 900 credits");
    expect(preview(host, "plates")?.getAttribute("data-valid")).toBe("true");

    const sell = sellButton(host, "plates") as HTMLButtonElement;
    expect(sell.textContent).toBe("Sell 60 · +900");
    expect(sell.getAttribute("aria-label")).toBeNull();
    // The shared findButton("Sell") contract: the plates tranche is the first sell face.
    expect(findButton(host, "Sell")).toBe(sell);
    expect(sellButton(host, "scrap")?.textContent).toBe("Sell 10 · +10");
  });

  it("orders trade cards by price, so the highest-value recovery leads", () => {
    const { host } = mount(
      seeded((s) => {
        s.store.alloy = 100;
        s.store.motors = 100;
        s.store.plates = 880;
        s.store.scrap = 20;
        s.storeUnits = 1100;
      }),
    );
    const cards = Array.from(host.querySelectorAll(".store-trade")).map((c) => c.getAttribute("data-resource"));
    expect(cards).toEqual(["alloy", "motors", "plates", "scrap"]);
    expect(findButton(host, "Sell")?.textContent).toBe("Sell 60 · +7200");
  });

  it("previews the exact proceeds for a chosen quantity and the real sell credits them", () => {
    for (const qty of [1, 7, 30]) {
      const state = fullStore();
      const before = state.credits;
      const { host, sent, results } = mount(state);
      setQty(host, "plates", String(qty));

      expect(preview(host, "plates")?.textContent).toBe(`${qty} × 15 = ${unit(qty * 15, "credit")}`);
      expect(preview(host, "plates")?.getAttribute("data-valid")).toBe("true");
      const sell = sellButton(host, "plates") as HTMLButtonElement;
      expect(sell.textContent).toBe(`Sell ${qty} · +${qty * 15}`);

      click(sell);
      expect(results[0]).toMatchObject({ ok: true });
      expect(sent[0]).toMatchObject({ type: "contract.sell", resource: "plates", qty });
      expect(state.credits).toBe(before + qty * 15);
      expect(state.store.plates).toBe(880 - qty);
      expect(state.storeUnits).toBe(900 - qty);
      // The override clears after the tranche: the face re-defaults to the new sellable.
      expect(qtyInput(host, "plates").value).toBe("60");
      expect(sellLog(state)).toEqual([qty]);
    }
  });

  it("steps and presets the quantity within the engine's ceiling", () => {
    const { host } = mount(fullStore());
    press(host, "plates", "Decrease Plates");
    expect(qtyInput(host, "plates").value).toBe("59");
    expect(preview(host, "plates")?.textContent).toBe("59 × 15 = 885 credits");
    press(host, "plates", "Increase Plates");
    expect(qtyInput(host, "plates").value).toBe("60");

    const increase = Array.from(card(host, "plates")?.querySelectorAll("button") ?? []).find((b) =>
      (b.getAttribute("aria-label") ?? "").startsWith("Increase"),
    ) as HTMLButtonElement;
    expect(increase.disabled).toBe(true); // already at the sellable ceiling

    press(host, "plates", "Half Plates");
    expect(qtyInput(host, "plates").value).toBe("30");
    expect(sellButton(host, "plates")?.textContent).toBe("Sell 30 · +450");
    press(host, "plates", "Max Plates");
    expect(qtyInput(host, "plates").value).toBe("60");

    setQty(host, "plates", "1");
    const decrease = Array.from(card(host, "plates")?.querySelectorAll("button") ?? []).find((b) =>
      (b.getAttribute("aria-label") ?? "").startsWith("Decrease"),
    ) as HTMLButtonElement;
    expect(decrease.disabled).toBe(true); // never below one unit
    press(host, "plates", "Increase Plates");
    expect(qtyInput(host, "plates").value).toBe("2");
  });

  it("disables the sell face and says why for zero, junk, empty and over-ceiling entry", () => {
    const state = fullStore();
    const before = state.credits;
    const { host, sent } = mount(state);

    const invalid: [string, string][] = [
      ["0", "Enter a whole number from 1 to 60."],
      ["abc", "Enter a whole number from 1 to 60."],
      ["", "Enter a whole number from 1 to 60."],
      ["3.5", "Enter a whole number from 1 to 60."],
      ["-4", "Enter a whole number from 1 to 60."],
      ["999", "Only 60 units sellable above the reserve."],
    ];
    for (const [raw, reason] of invalid) {
      setQty(host, "plates", raw);
      const sell = sellButton(host, "plates") as HTMLButtonElement;
      expect(sell.disabled, `qty ${JSON.stringify(raw)} must disable the sell`).toBe(true);
      expect(preview(host, "plates")?.textContent).toBe(reason);
      expect(preview(host, "plates")?.getAttribute("data-valid")).toBe("false");
      click(sell); // a disabled face must not dispatch even when clicked
    }
    expect(sent).toHaveLength(0);
    expect(state.credits).toBe(before);
    expect(state.store.plates).toBe(880);

    // Recovery from an invalid entry: Max restores a valid tranche that sells.
    press(host, "plates", "Max Plates");
    click(sellButton(host, "plates") as HTMLButtonElement);
    expect(state.credits).toBe(before + 900);
    expect(state.store.plates).toBe(820);
  });

  it("never oversells or double-pays under rapid taps, and retires the card at the floor", () => {
    const state = fullStore();
    const before = state.credits;
    const { host } = mount(state);

    // 20 rapid taps, repainting between each: 870 sellable = 14 x 60 + 30.
    let taps = 0;
    for (let i = 0; i < 20; i += 1) {
      const sell = sellButton(host, "plates");
      if (!sell || sell.disabled) break;
      click(sell);
      taps += 1;
    }
    expect(taps).toBe(15);
    expect(state.store.plates).toBe(TUNING.reserveFloor); // never below the reserve
    expect(state.credits).toBe(before + 13050); // 870 x 15, paid exactly once each
    expect(state.storeUnits).toBe(30);
    const log = sellLog(state);
    expect(log).toHaveLength(15);
    expect(log.filter((qty) => qty === 60)).toHaveLength(14);
    expect(log[14]).toBe(30); // the last tranche clamps to what is left
    expect(log.reduce((a, b) => a + b, 0)).toBe(870); // every unit paid once, no more
    expect(Object.keys(state.seenCommands)).toHaveLength(15); // no duplicate command ids
    expect(card(host, "plates")).toBeNull(); // zero sellable: the face retires
    expect(sellButton(host, "scrap")?.textContent).toBe("Sell 10 · +10"); // scrap untouched
    expect(state.store.scrap).toBe(20);
  });

  it("clamps stale rapid taps fired before any repaint", () => {
    const state = seeded((s) => {
      s.store.plates = 200;
      s.store.scrap = 20;
      s.storeUnits = 220;
    });
    const before = state.credits;
    const { host, sent, rerender } = mount(state, false); // no repaint between taps
    const sell = sellButton(host, "plates") as HTMLButtonElement;

    act(() => {
      for (let i = 0; i < 6; i += 1) sell.click(); // all six carry the stale qty 60
    });
    // 190 sellable: 60 + 60 + 60 + 10 applied; the rest clamp to zero and are refused.
    expect(state.store.plates).toBe(TUNING.reserveFloor);
    expect(state.credits).toBe(before + 190 * 15);
    expect(sellLog(state)).toEqual([60, 60, 60, 10]);
    expect(sent).toHaveLength(6);
    expect(sellableAmount(state, "plates")).toBe(0);

    rerender();
    expect(card(host, "plates")).toBeNull();
  });

  it("replaying an already-seen command id never pays twice", () => {
    const state = fullStore();
    const { host, sent } = mount(state);
    click(sellButton(host, "plates") as HTMLButtonElement);
    const creditsAfterFirst = state.credits;
    const revisionAfterFirst = state.revision;

    const replay = applyCommand(state, sent[0]); // same id, straight back through the engine
    expect(replay).toMatchObject({ ok: true, revision: revisionAfterFirst });
    expect(state.credits).toBe(creditsAfterFirst);
    expect(state.store.plates).toBe(820);
    expect(sellLog(state)).toHaveLength(1);
  });

  it("shows the zero-stock yard honestly: no faces, every row still reachable", () => {
    const state = seeded((s) => {
      s.store.scrap = 10; // exactly the reserve: nothing sellable
      s.storeUnits = 10;
    });
    const { host, sent } = mount(state);
    expect(host.querySelectorAll(".store-trade")).toHaveLength(0);
    expect(host.textContent).toContain(
      "Nothing is sellable right now: stock sits at or below the reserve the yard keeps.",
    );
    expect(findButton(host, "Sell")).toBeUndefined();
    expect(host.querySelectorAll(".store-row")).toHaveLength(RESOURCES.length);
    expect(host.querySelector('.store-row[data-resource="plates"]')?.getAttribute("data-stock")).toBe("0");
    expect(sent).toHaveLength(0);
  });

  it("sells the single unit above the reserve with singular credit wording", () => {
    const state = seeded((s) => {
      s.store.scrap = 11;
      s.storeUnits = 11;
    });
    const before = state.credits;
    const { host } = mount(state);
    expect(sellButton(host, "scrap")?.textContent).toBe("Sell 1 · +1");
    expect(preview(host, "scrap")?.textContent).toBe("1 × 1 = 1 credit");
    click(sellButton(host, "scrap") as HTMLButtonElement);
    expect(state.credits).toBe(before + 1);
    expect(state.store.scrap).toBe(10);
    expect(card(host, "scrap")).toBeNull();
  });

  it("reserves machine input demand: the preview and the sell both stop above floor + demand", () => {
    const state = seeded((s) => {
      s.store.scrap = 60;
      s.store.ferrous = 20;
      s.storeUnits = 80;
    });
    expect(send(state, { type: "machine.build", blueprint: "sorter", tile: 8 })).toMatchObject({ ok: true });
    const before = state.credits;
    const held = state.store.scrap ?? 0; // 40 after the sorter's build cost
    const expected = sellableAmount(state, "scrap"); // engine authority, not a guess
    const demand = held - TUNING.reserveFloor - expected;
    expect(expected).toBeGreaterThan(0);
    expect(demand).toBeGreaterThan(0); // the sorter's pull really shrinks the tranche

    const { host } = mount(state);
    expect(card(host, "scrap")?.querySelector(".store-trade__facts")?.textContent).toBe(
      `Stock ${held} · Sellable ${expected}`,
    );
    expect(preview(host, "scrap")?.textContent).toBe(`${expected} × 1 = ${unit(expected, "credit")}`);
    click(sellButton(host, "scrap") as HTMLButtonElement);

    expect(state.credits).toBe(before + expected);
    expect(state.store.scrap).toBe(held - expected);
    expect(state.store.scrap).toBe(TUNING.reserveFloor + demand); // demand stays reserved
    expect(sellableAmount(state, "scrap")).toBe(0); // floor + demand fully respected
  });

  it("keeps trade locked before the first contract, whatever the stock", () => {
    const state = fullStore();
    state.exportClaimed = false;
    const { host, sent } = mount(state);
    expect(host.querySelectorAll(".store-trade")).toHaveLength(0);
    expect(findButton(host, "Sell")).toBeUndefined();
    expect(host.textContent).toContain("Finish the first steel contract to open selling.");
    expect(sent).toHaveLength(0);
  });
});
