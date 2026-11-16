/**
 * G1 (#202): the player-visible save-recovery surface.
 *
 * Pins the UI half of the executive-contract guarantee already pinned at the
 * store layer (#191/#203): a corrupt boot shows a dismissible banner wired to
 * the real SaveRecoveryApi — retry, export, confirmed-only discard — and the
 * partial-success flag `slotClearFailed` (#205 verdict) is consumed in honest
 * player messaging: a decodable residual slot raises no store notice, so the
 * banner derives the residual surface from `no notice + retained text` and
 * pairs it with the "recovered and saved" acknowledgement.
 *
 * Shell contract (#135): the banner lives OUTSIDE `.hud` and the one panel
 * stack (zero `.panel` nodes), adds no Escape layer (Escape still pops exactly
 * one panel), never traps or steals focus, and sits in the same first-child
 * reconciliation slot of `.game` in both App branches so its local state
 * (dismissal, confirmation) survives the gate -> play switch.
 *
 * Harness mirrors tests/ui/shell-wiring-135.test.tsx (createRoot + act, real
 * store over memory storage); the download helper is spied WITH its real
 * implementation so jsdom's missing createObjectURL exercises the honest
 * "copy the text instead" fallback.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import {
  SAVE_KEY,
  DEFAULT_SETTINGS,
  checksum,
  decodeSave,
  encodeSave,
} from "../../src/game/persistence/save";
import { RECOVERY_KEY } from "../../src/game/persistence/recovery";
import { createInitialState } from "../../src/game/simulation/types";
import { advance } from "../../src/game/simulation/engine";
import { applyCommand } from "../../src/game/simulation/commands";
import { LAST_SEEN_MS } from "../legacy/fixtures-lib";
import { downloadSaveText } from "../../src/ui/save/model";
import { SAVE_COPY } from "../../src/ui/save/copy";
import { RECOVERY_COPY } from "../../src/ui/shell/RecoveryNotice";

vi.mock("../../src/ui/save/model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/ui/save/model")>();
  return { ...actual, downloadSaveText: vi.fn(actual.downloadSaveText) };
});

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    raw: map,
  };
}

/** Storage whose recovery-slot clear can be refused at runtime (#203). */
function clearRefusalStorage() {
  const map = new Map<string, string>();
  const flags = { clear: false };
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      if (key === RECOVERY_KEY && flags.clear) throw new Error("refused: recovery clear");
      map.delete(key);
    },
    raw: map,
    flags,
  };
}

/** Storage whose recovery-copy write throws (quota): the payload stays held. */
function quotaStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === RECOVERY_KEY) throw new Error("quota: recovery");
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    raw: map,
  };
}

function yardText(ticks = 60): string {
  const sim = createInitialState();
  for (let i = 0; i < 6; i += 1) applyCommand(sim, { id: `s${i}`, type: "manual.salvage" });
  advance(sim, ticks);
  return encodeSave(sim, LAST_SEEN_MS, { ...DEFAULT_SETTINGS });
}

function tamperChecksum(text: string): string {
  const env = JSON.parse(text) as { checksum: string; payload: unknown };
  const real = checksum(JSON.stringify(env.payload));
  env.checksum = real === "00000000" ? "00000001" : "00000000";
  return JSON.stringify(env);
}

type MemoryStorage = ReturnType<typeof memoryStorage>;

let root: ReturnType<typeof createRoot> | null = null;
const stores: { stop(): void }[] = [];

function makeStore(storage: MemoryStorage | ReturnType<typeof clearRefusalStorage> | ReturnType<typeof quotaStorage>, leaseId = "tab-a") {
  const store = createStore({ storage, now: () => LAST_SEEN_MS, leaseId });
  stores.push(store);
  return store;
}

function mount(store: GameStore): HTMLElement {
  if (root) {
    const dying = root;
    root = null;
    act(() => dying.unmount());
  }
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
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

const banner = () => document.querySelector(".recovery-notice") as HTMLElement | null;

function inBanner(label: string): HTMLButtonElement | undefined {
  const host = banner();
  if (!host) return undefined;
  return [...host.querySelectorAll("button")].find((node) =>
    (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
  ) as HTMLButtonElement | undefined;
}

function click(label: string) {
  const button = inBanner(label) ?? findButton(label);
  expect(button, `button "${label}"`).toBeTruthy();
  act(() => button?.click());
}

function begin() {
  act(() => findButton("Begin recovery")?.click());
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
}

/** Boot a writer store over a corrupt checkpoint; the slot holds the raw. */
function corruptBoot(storage: MemoryStorage | ReturnType<typeof clearRefusalStorage> | ReturnType<typeof quotaStorage>, ticks = 60) {
  const corrupt = tamperChecksum(yardText(ticks));
  storage.setItem(SAVE_KEY, corrupt);
  const store = makeStore(storage);
  return { store, corrupt };
}

beforeEach(() => {
  vi.mocked(downloadSaveText).mockClear();
});

afterEach(() => {
  if (root) {
    const dying = root;
    root = null;
    act(() => dying.unmount());
  }
  for (const store of stores.splice(0)) store.stop();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("G1 recovery notice UI (#202)", () => {
  it("shows a player-visible notice with all four actions on corrupt boot", () => {
    const storage = memoryStorage();
    const { store, corrupt } = corruptBoot(storage);
    const host = mount(store);

    const el = banner();
    expect(el).not.toBeNull();
    expect(el?.getAttribute("role")).toBe("alert");
    expect(el?.textContent).toContain(RECOVERY_COPY.title);
    expect(el?.textContent).toContain(RECOVERY_COPY.preserved);
    expect(el?.textContent).toContain("the save failed its integrity check");
    expect(el?.textContent).toContain(`${corrupt.length} characters retained.`);
    for (const label of [RECOVERY_COPY.retry, RECOVERY_COPY.export, RECOVERY_COPY.discard, RECOVERY_COPY.dismiss]) {
      expect(inBanner(label), `action "${label}"`).toBeTruthy();
    }

    // Focus contract (#135): no steal, no trap — focus stays outside the banner.
    expect(el?.contains(document.activeElement)).toBe(false);
    // Outside the HUD and the one panel stack: a direct child of .game, and
    // zero census nodes at the gate.
    expect(el?.parentElement?.classList.contains("game")).toBe(true);
    const hud = host.querySelector(".hud");
    if (hud) expect(hud.contains(el as Node)).toBe(false);
    expect(document.querySelectorAll(".panel").length).toBe(0);
    // The gate itself still works underneath the banner.
    expect(findButton("Begin recovery")).toBeTruthy();

    // Nothing was erased: the raw bytes sit verbatim in the write-once slot.
    expect(storage.getItem(RECOVERY_KEY)).toBe(corrupt);
    expect(store.getSaveRecovery()?.reason).toBe("checksum");
  });

  it("renders no banner on a healthy or empty boot", () => {
    const healthy = memoryStorage();
    healthy.setItem(SAVE_KEY, yardText(60));
    mount(makeStore(healthy));
    expect(banner()).toBeNull();

    mount(makeStore(memoryStorage()));
    expect(banner()).toBeNull();
  });

  it("renders nothing for a store double without the recovery API", () => {
    const real = makeStore(memoryStorage());
    const bare = { ...real } as GameStore;
    for (const method of ["getSaveRecovery", "retrySaveRecovery", "exportSaveRecovery", "discardSaveRecovery"]) {
      delete (bare as unknown as Record<string, unknown>)[method];
    }
    const host = mount(bare);
    expect(banner()).toBeNull();
    expect(host.querySelector("canvas")).toBeTruthy();
  });

  it("survives Begin in the same slot, stays outside the panel stack, Escape pops panels not the banner", () => {
    const storage = memoryStorage();
    const { store } = corruptBoot(storage);
    mount(store);
    const before = banner();
    expect(before).not.toBeNull();

    begin();
    // Same reconciliation slot: the identical DOM node, local state intact.
    expect(banner()).toBe(before);
    // In play the HUD exists; the banner still sits outside it.
    const hud = document.querySelector(".hud");
    expect(hud).not.toBeNull();
    expect(hud?.contains(before as Node)).toBe(false);

    click("Routes");
    expect(document.querySelectorAll(".panel").length).toBe(1);
    expect(banner()).toBe(before);
    expect(before?.classList.contains("panel")).toBe(false);

    pressEscape();
    expect(document.querySelectorAll(".panel").length).toBe(0);
    expect(banner()).toBe(before);
    // A second press with an empty stack changes nothing about the banner.
    pressEscape();
    expect(banner()).toBe(before);
  });

  it("retry recovers the yard durably and resolves the banner", () => {
    const storage = memoryStorage();
    const { store } = corruptBoot(storage);
    mount(store);
    expect(banner()).not.toBeNull();

    // The fresh yard keeps running and persists a healthy checkpoint while the
    // player repairs the retained bytes externally (a slot healed over a still
    // corrupt SAVE_KEY is the double-corruption case the store refuses).
    act(() => store.step(1));
    const recovered = yardText(60);
    storage.setItem(RECOVERY_KEY, recovered);
    click(RECOVERY_COPY.retry);

    expect(store.getState().tick).toBe(60);
    expect(storage.getItem(RECOVERY_KEY)).toBeNull();
    expect(decodeSave(storage.getItem(SAVE_KEY)).ok).toBe(true);
    expect(store.getSaveRecovery()).toBeNull();
    expect(banner()).toBeNull();
  });

  it("a failed retry keeps everything and explains why", () => {
    const storage = memoryStorage();
    const { store, corrupt } = corruptBoot(storage);
    mount(store);

    click(RECOVERY_COPY.retry);
    const el = banner();
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain("Recovery failed: the save failed its integrity check.");
    expect(el?.textContent).toContain("Nothing was changed; the original data is still kept.");
    // Nothing moved: slot verbatim, checkpoint untouched, fresh yard still running.
    expect(storage.getItem(RECOVERY_KEY)).toBe(corrupt);
    expect(storage.getItem(SAVE_KEY)).toBe(corrupt);
    expect(store.getState().tick).toBe(0);
  });

  it("retry with slotClearFailed shows the honest residual line; a healed retry clears it", () => {
    const storage = clearRefusalStorage();
    const { store } = corruptBoot(storage);
    mount(store);

    // The running fresh yard persists a healthy checkpoint first; then the
    // repaired slot lands and storage refuses the clear.
    act(() => store.step(1));
    const recovered = yardText(60);
    storage.setItem(RECOVERY_KEY, recovered);
    storage.flags.clear = true;
    click(RECOVERY_COPY.retry);

    // The yard landed durably; the store raises no notice for a decodable slot.
    expect(store.getState().tick).toBe(60);
    expect(store.getSaveRecovery()).toBeNull();
    expect(storage.getItem(RECOVERY_KEY)).toBe(recovered);
    expect(decodeSave(storage.getItem(SAVE_KEY)).ok).toBe(true);

    // #205: the flag is consumed in player-visible messaging — the exact
    // residual line plus the recovered-and-saved acknowledgement.
    const el = banner();
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain(RECOVERY_COPY.residual);
    expect(el?.textContent).toContain(RECOVERY_COPY.recovered);
    expect(inBanner(RECOVERY_COPY.retry)).toBeTruthy();
    expect(inBanner(RECOVERY_COPY.export)).toBeTruthy();

    // Export stays byte-exact against the residual slot.
    click(RECOVERY_COPY.export);
    expect(vi.mocked(downloadSaveText)).toHaveBeenCalledWith(recovered, RECOVERY_COPY.exportFileName);

    // Once storage heals, retry completes fully and the banner resolves.
    storage.flags.clear = false;
    click(RECOVERY_COPY.retry);
    expect(storage.getItem(RECOVERY_KEY)).toBeNull();
    expect(banner()).toBeNull();
  });

  it("export hands the exact retained raw text to the download helper", () => {
    const storage = memoryStorage();
    const { store, corrupt } = corruptBoot(storage);
    mount(store);

    // jsdom has no createObjectURL: the real helper refuses and the banner
    // offers the honest copy fallback instead of a fake success.
    click(RECOVERY_COPY.export);
    expect(vi.mocked(downloadSaveText)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadSaveText)).toHaveBeenCalledWith(corrupt, RECOVERY_COPY.exportFileName);
    expect(banner()?.textContent).toContain(SAVE_COPY.downloadFailed);

    // A browser where the download starts gets the started acknowledgement.
    vi.mocked(downloadSaveText).mockReturnValueOnce(true);
    click(RECOVERY_COPY.export);
    expect(banner()?.textContent).toContain(SAVE_COPY.downloadStarted);
    // Export never mutates the retained bytes.
    expect(storage.getItem(RECOVERY_KEY)).toBe(corrupt);
  });

  it("discard is confirmed-only: Keep cancels, Confirm erases slot and held copy", () => {
    const storage = memoryStorage();
    const { store, corrupt } = corruptBoot(storage);
    mount(store);
    const discardSpy = vi.spyOn(store, "discardSaveRecovery");

    click(RECOVERY_COPY.discard);
    // Armed: warning + explicit confirm, nothing erased yet.
    expect(banner()?.textContent).toContain(RECOVERY_COPY.discardWarning);
    expect(inBanner(RECOVERY_COPY.confirmDiscard)).toBeTruthy();
    expect(inBanner(RECOVERY_COPY.keep)).toBeTruthy();
    expect(discardSpy).not.toHaveBeenCalled();
    expect(storage.getItem(RECOVERY_KEY)).toBe(corrupt);

    click(RECOVERY_COPY.keep);
    expect(banner()?.textContent).not.toContain(RECOVERY_COPY.discardWarning);
    expect(inBanner(RECOVERY_COPY.discard)).toBeTruthy();
    expect(discardSpy).not.toHaveBeenCalled();

    click(RECOVERY_COPY.discard);
    click(RECOVERY_COPY.confirmDiscard);
    expect(discardSpy).toHaveBeenCalledTimes(1);
    expect(storage.getItem(RECOVERY_KEY)).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(store.getSaveRecovery()).toBeNull();
    expect(banner()).toBeNull();
  });

  it("discard on a decodable residual slot reports the honest no-op", () => {
    const storage = clearRefusalStorage();
    const { store } = corruptBoot(storage);
    mount(store);
    act(() => store.step(1));
    const recovered = yardText(60);
    storage.setItem(RECOVERY_KEY, recovered);
    storage.flags.clear = true;
    click(RECOVERY_COPY.retry);
    expect(banner()?.textContent).toContain(RECOVERY_COPY.residual);

    // The store's discard is notice-gated; on the residual edge it is a no-op.
    click(RECOVERY_COPY.discard);
    click(RECOVERY_COPY.confirmDiscard);
    expect(banner()?.textContent).toContain(RECOVERY_COPY.discardRefused);
    expect(banner()?.textContent).toContain(RECOVERY_COPY.residual);
    expect(storage.getItem(RECOVERY_KEY)).toBe(recovered);
    expect(store.getState().tick).toBe(60);
  });

  it("dismiss hides without touching the store, survives Begin, and a new corruption re-surfaces", () => {
    const storage = memoryStorage();
    const { store, corrupt } = corruptBoot(storage);
    mount(store);

    click(RECOVERY_COPY.dismiss);
    expect(banner()).toBeNull();
    // Dismissal is UI-local: every retained byte stays exactly where it was.
    expect(storage.getItem(RECOVERY_KEY)).toBe(corrupt);
    expect(storage.getItem(SAVE_KEY)).toBe(corrupt);
    expect(store.getSaveRecovery()).not.toBeNull();

    // Same reconciliation slot: the dismissal survives the gate -> play switch.
    begin();
    expect(banner()).toBeNull();

    // A NEW corruption is a new surface (different reason AND length, so a
    // different signature) and re-surfaces despite the earlier dismissal.
    const newer = yardText(90).slice(0, 60);
    storage.setItem(SAVE_KEY, newer);
    storage.setItem(RECOVERY_KEY, newer);
    act(() => store.step(1));
    const el = banner();
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain("the save text is damaged");
    expect(el?.textContent).toContain(`${newer.length} characters retained.`);
  });

  it("a reader tab sees the notice; retry and discard answer read-only", () => {
    const storage = memoryStorage();
    const { corrupt } = corruptBoot(storage);
    const reader = makeStore(storage, "tab-b");
    expect(reader.getRole()).toBe("reader");
    mount(reader);

    expect(banner()?.textContent).toContain(RECOVERY_COPY.preserved);
    click(RECOVERY_COPY.retry);
    expect(banner()?.textContent).toContain("Recovery failed: another tab owns the save");
    expect(banner()?.textContent).toContain("Nothing was changed; the original data is still kept.");

    click(RECOVERY_COPY.discard);
    click(RECOVERY_COPY.confirmDiscard);
    expect(banner()?.textContent).toContain("Discard failed: another tab owns the save");
    expect(banner()?.textContent).toContain("The retained data is still kept.");
    expect(storage.getItem(RECOVERY_KEY)).toBe(corrupt);
    expect(storage.getItem(SAVE_KEY)).toBe(corrupt);
  });

  it("a held (quota) boot shows session-only wording; export and discard work on the held raw", () => {
    const storage = quotaStorage();
    const { store, corrupt } = corruptBoot(storage);
    mount(store);

    const el = banner();
    expect(el?.textContent).toContain(RECOVERY_COPY.held);
    expect(el?.textContent).not.toContain(RECOVERY_COPY.preserved);
    expect(storage.getItem(RECOVERY_KEY)).toBeNull();

    // The fresh yard is session-only: stepping never overwrites the held raw.
    begin();
    act(() => store.step(1));
    expect(storage.getItem(SAVE_KEY)).toBe(corrupt);

    click(RECOVERY_COPY.export);
    expect(vi.mocked(downloadSaveText)).toHaveBeenCalledWith(corrupt, RECOVERY_COPY.exportFileName);

    click(RECOVERY_COPY.discard);
    click(RECOVERY_COPY.confirmDiscard);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(store.getSaveRecovery()).toBeNull();
    expect(banner()).toBeNull();
  });

  it("the residual surface appears on a follower tab after the writer's refused clear", () => {
    const storage = clearRefusalStorage();
    const { store } = corruptBoot(storage);
    store.step(1);
    const recovered = yardText(60);
    storage.setItem(RECOVERY_KEY, recovered);
    storage.flags.clear = true;
    const result = store.retrySaveRecovery();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slotClearFailed).toBe(true);

    // A fresh mount (another tab) derives the same residual surface from the
    // store alone — no local UI state is required to know the slot survived.
    const reader = makeStore(storage, "tab-b");
    mount(reader);
    const el = banner();
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain(RECOVERY_COPY.residual);
    expect(inBanner(RECOVERY_COPY.export)).toBeTruthy();
  });
});
