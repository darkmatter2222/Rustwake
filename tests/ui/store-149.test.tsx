import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { StorePanel } from "../../src/ui/Panels";
import { TUNING } from "../../src/game/content/defs";
import { t } from "../../src/game/content/strings";
import {
  applyCommand,
  sellableAmount,
  type Command,
  type CommandBody,
  type CommandResult,
} from "../../src/game/simulation/commands";
import { createInitialState, type SimState } from "../../src/game/simulation/types";
import { tradeFaces, selectQty } from "../../src/ui/store/model";
import { STORE_COPY, overSellable, invalidQty, proceedsLine, factsLine } from "../../src/ui/store/copy";

/**
 * RW3D #149 (U06): the storage trade desk pinned to the #214 OPENING seed
 * (scrap 120 / ferrous 12 / steel 12, credits 60, reserveFloor 10, sellBatchCap
 * 60) rather than the abstract full-store fixtures of store-56. Every sell goes
 * through the real painted face -> `contract.sell` -> `applyCommand`, and the
 * engine's own `sellableAmount` is the reference for every ceiling. The reserve
 * floor, the batch cap, the exact proceeds arithmetic, the invalid-quantity
 * reasons and the first-steel-contract gate are all checked against the same
 * authority the sell command uses. Fixture mutation lives only in this file.
 */

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let seq = 14900;
function send(state: SimState, body: CommandBody): CommandResult {
  return applyCommand(state, { ...body, id: `s149-${(seq += 1)}` } as Command);
}

/** The opening seed with the trade desk unlocked (export contract already claimed). */
function openingTrade(): SimState {
  const state = createInitialState();
  state.tutorial = 9;
  state.exportClaimed = true;
  return state;
}

interface Mount {
  host: HTMLElement;
  sent: Command[];
  results: CommandResult[];
}

function mount(state: SimState): Mount {
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
    act(() => root.render(panel()));
    return result;
  };
  act(() => root.render(panel()));
  return { host, sent, results };
}

const card = (host: HTMLElement, resource: string) =>
  host.querySelector<HTMLElement>(`.store-trade[data-resource="${resource}"]`);
const sellButton = (host: HTMLElement, resource: string) =>
  card(host, resource)?.querySelector<HTMLButtonElement>(".store-trade__sell") ?? null;
const preview = (host: HTMLElement, resource: string) =>
  card(host, resource)?.querySelector<HTMLElement>(".store-trade__preview") ?? null;
const facts = (host: HTMLElement, resource: string) =>
  card(host, resource)?.querySelector<HTMLElement>(".store-trade__facts") ?? null;

function setQty(host: HTMLElement, resource: string, value: string) {
  const input = card(host, resource)?.querySelector<HTMLInputElement>(".store-trade__qty");
  expect(input, `quantity input for ${resource}`).not.toBeNull();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input!, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = (button: HTMLButtonElement) => act(() => button.click());
const sellLabel = (qty: number, credits: number) => t("value.sellButton", { qty, credits });

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("RW3D #149 (U06): the opening seed's trade faces and exact proceeds", () => {
  it("derives dearest-first faces with the engine's reserve/cap ceilings", () => {
    const state = openingTrade();
    // The opening seed itself: reserve 10 and cap 60 against the held stock.
    expect(state.store.scrap).toBe(120);
    expect(state.store.ferrous).toBe(12);
    expect(state.store.steel).toBe(12);
    expect(sellableAmount(state, "scrap")).toBe(60); // capped, not 110
    expect(sellableAmount(state, "ferrous")).toBe(2); // 12 - reserve 10
    expect(sellableAmount(state, "steel")).toBe(2);

    const faces = tradeFaces(state);
    expect(faces.map((f) => f.resource)).toEqual(["steel", "scrap", "ferrous"]);
    expect(faces.map((f) => f.sellable)).toEqual([2, 60, 2]);
    expect(faces.map((f) => f.price)).toEqual([4, 1, 1]);
  });

  it("paints the exact sell tranche and proceeds for each opening-seed face", () => {
    const { host } = mount(openingTrade());
    expect(sellButton(host, "steel")?.textContent).toBe(sellLabel(2, 8));
    expect(sellButton(host, "scrap")?.textContent).toBe(sellLabel(60, 60));
    expect(sellButton(host, "ferrous")?.textContent).toBe(sellLabel(2, 2));
    expect(facts(host, "ferrous")?.textContent).toBe(factsLine(12, 2));
    expect(preview(host, "steel")?.textContent).toBe(proceedsLine(2, 4));
    expect(preview(host, "steel")?.getAttribute("data-valid")).toBe("true");
  });

  it("a locked yard (no export contract) shows the gate note and no trade cards", () => {
    const state = createInitialState();
    state.tutorial = 9;
    expect(state.exportClaimed).toBe(false);
    expect(tradeFaces(state)).toEqual([]);
    const { host } = mount(state);
    expect(card(host, "steel")).toBeNull();
    const note = [...host.querySelectorAll(".store-note")].map((n) => n.textContent ?? "");
    expect(note).toContain(STORE_COPY.tradeLocked);
  });
});

describe("RW3D #149 (U06): the reserve floor and batch cap protect the yard", () => {
  it("over-requesting ferrous clamps to the reserve ceiling and refuses the sell", () => {
    const state = openingTrade();
    const { host, sent } = mount(state);
    setQty(host, "ferrous", "12"); // held 12, but only 2 sellable above reserve 10
    expect(preview(host, "ferrous")?.textContent).toBe(overSellable(2));
    expect(preview(host, "ferrous")?.getAttribute("data-valid")).toBe("false");
    expect(sellButton(host, "ferrous")?.disabled).toBe(true);
    expect(sent).toHaveLength(0);

    // The valid tranche sells exactly 2 and leaves the reserve intact.
    setQty(host, "ferrous", "2");
    expect(sellButton(host, "ferrous")?.disabled).toBe(false);
    click(sellButton(host, "ferrous")!);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "contract.sell", resource: "ferrous", qty: 2 });
    expect(state.store.ferrous).toBe(10); // reserve floor preserved
    expect(state.credits).toBe(62); // 60 + 2 x 1
  });

  it("scrap is capped at one 60-unit batch even with 120 held", () => {
    const state = openingTrade();
    const { host, sent } = mount(state);
    setQty(host, "scrap", "999");
    expect(preview(host, "scrap")?.textContent).toBe(overSellable(60));
    expect(sellButton(host, "scrap")?.disabled).toBe(true);

    setQty(host, "scrap", "60");
    expect(sellButton(host, "scrap")?.textContent).toBe(sellLabel(60, 60));
    click(sellButton(host, "scrap")!);
    expect(sent[0]).toMatchObject({ type: "contract.sell", resource: "scrap", qty: 60 });
    expect(state.store.scrap).toBe(60); // 120 - one capped batch
    expect(state.credits).toBe(120); // 60 + 60 x 1
  });

  it("selectQty classifies every opening-seed entry against the sellable ceiling", () => {
    const sellable = 2; // ferrous above the reserve
    expect(selectQty(undefined, sellable)).toEqual({ qty: 2, valid: true, reason: "ok" });
    expect(selectQty("", sellable)).toEqual({ qty: 0, valid: false, reason: "empty" });
    expect(selectQty("abc", sellable)).toEqual({ qty: 0, valid: false, reason: "nan" });
    expect(selectQty("-1", sellable)).toEqual({ qty: 0, valid: false, reason: "nan" });
    expect(selectQty("3.5", sellable)).toEqual({ qty: 0, valid: false, reason: "nan" });
    expect(selectQty("0", sellable)).toEqual({ qty: 0, valid: false, reason: "low" });
    expect(selectQty("5", sellable)).toEqual({ qty: 2, valid: false, reason: "high" });
    expect(selectQty("2", sellable)).toEqual({ qty: 2, valid: true, reason: "ok" });
    // A zero ceiling (stock at the reserve) is "low", never a valid empty sell.
    expect(selectQty(undefined, 0)).toEqual({ qty: 0, valid: false, reason: "low" });
    expect(selectQty("1", 0)).toEqual({ qty: 0, valid: false, reason: "high" });
  });

  it("the invalid-quantity reason names the whole-number range", () => {
    const { host } = mount(openingTrade());
    setQty(host, "ferrous", "abc");
    expect(preview(host, "ferrous")?.textContent).toBe(invalidQty(2));
    expect(sellButton(host, "ferrous")?.disabled).toBe(true);
  });
});

describe("RW3D #149 (U06): the first-steel contract gate and exactly-once payment", () => {
  it("claiming the export contract pays 50, spends 10 steel and unlocks selling", () => {
    const state = createInitialState();
    state.tutorial = 9;
    expect(state.exportClaimed).toBe(false);
    expect(state.store.steel).toBe(12);
    const result = send(state, { type: "contract.export" });
    expect(result.ok).toBe(true);
    expect(state.exportClaimed).toBe(true);
    expect(state.credits).toBe(110); // 60 + exportContractCredits 50
    expect(state.store.steel).toBe(2); // 12 - exportContractSteel 10
    expect(TUNING.exportContractSteel).toBe(10);
    expect(TUNING.exportContractCredits).toBe(50);

    // Steel now sits at the reserve (2 < 10), so it drops out of the trade faces.
    const faces = tradeFaces(state);
    expect(faces.map((f) => f.resource)).toEqual(["scrap", "ferrous"]);
    expect(faces.map((f) => f.sellable)).toEqual([60, 2]);
  });

  it("a replayed sell command id is deduped — credits are paid exactly once", () => {
    const state = openingTrade();
    const command: Command = { id: "s149-dedupe", type: "contract.sell", resource: "steel", qty: 2 };
    const first = applyCommand(state, command);
    expect(first.ok).toBe(true);
    expect(state.credits).toBe(68); // 60 + 2 x 4
    expect(state.store.steel).toBe(10);
    const replay = applyCommand(state, command);
    expect(replay.ok).toBe(true); // accepted as a no-op, not a second payment
    expect(state.credits).toBe(68);
    expect(state.store.steel).toBe(10);
  });
});
