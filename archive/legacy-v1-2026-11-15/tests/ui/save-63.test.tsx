import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import saveCssRaw from "../../src/ui/save/save.css?raw";
import { App } from "../../src/ui/App";
import { createStore, type GameStore } from "../../src/app/store";
import {
  SAVE_KEY,
  checksum,
  decodeSave,
  sanitizeSettings,
  DEFAULT_SETTINGS,
} from "../../src/game/persistence/save";
import { TUNING } from "../../src/game/content/defs";
import {
  copySaveText,
  downloadSaveText,
  exportFileName,
  previewImport,
  settingsChangeLine,
} from "../../src/ui/save/model";

/**
 * UI-RESET-63: the rebuilt save management. Every import below travels the REAL
 * UI path — the paste field, Apply (pure pre-validation), the acknowledgement
 * gate, and only then YardPanel's onImport -> store.importSave. Fixture mutations
 * (older-save shape, hostile settings, tampered checksums) happen ONLY in this
 * test code, never in src, and never weaken the decoder they exercise.
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

/** Matches the accessible name: the aria-label when present, else the text. */
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

/** The prototype setter is the documented way to drive a controlled field. */
function typeInto(field: HTMLTextAreaElement | undefined, text: string) {
  if (!field) return;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  act(() => {
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** A small but real yard: repaired drone, one machine, one link, some batches. */
function buildYard(now: () => number) {
  const storage = memoryStorage();
  const store = createStore({ storage, now });
  for (let i = 0; i < 6; i += 1) {
    store.dispatch({ id: `p${i}`, type: "manual.salvage" });
    store.step(TUNING.manualPulseTicks);
  }
  store.dispatch({ id: "rep", type: "drone.repair" });
  store.step(262);
  store.dispatch({ id: "b1", type: "machine.build", blueprint: "sorter", tile: 8 });
  const sorter = store.getState().machines[0];
  store.dispatch({ id: "r1", type: "route.connect", from: 0, to: sorter.id, filter: "scrap" });
  store.step(400);
  return { storage, store };
}

/** Mount, start, unlock the Yard target (B-06) and open the record page. */
function openYard(store: GameStore): HTMLDivElement {
  const host = mount(store);
  act(() => findButton("Begin recovery")?.click());
  store.getState().tutorial = 9;
  act(() => store.step(1));
  act(() => findButton("Yard")?.click());
  return host;
}

function gotoReplace() {
  act(() => findButton("Import")?.click());
}

function pasteField(): HTMLTextAreaElement {
  return document.querySelector("#rustwake-save-import") as HTMLTextAreaElement;
}

function openGate(text: string) {
  gotoReplace();
  typeInto(pasteField(), text);
  act(() => findButton("Apply")?.click());
}

function acknowledge() {
  const ack = document.querySelector<HTMLInputElement>(".import-confirm__ack input");
  expect(ack).not.toBeNull();
  act(() => ack?.click());
}

const snapshot = (store: GameStore) => JSON.stringify(store.getState());

/** jsdom's Blob has no .text(); FileReader is its supported read path. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Re-checksum an envelope after a fixture mutation of its payload. */
function reseal(envelope: { payload: unknown }): string {
  const body = JSON.stringify(envelope.payload);
  return JSON.stringify({ ...envelope, checksum: checksum(body) });
}

/* --- environment stubs (restored after every test) ------------------------ */

let restoreClipboard: (() => void) | null = null;
let restoreDownload: (() => void) | null = null;

function stubClipboard(impl: ((text: string) => Promise<void>) | null) {
  const desc = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: impl === null ? undefined : { writeText: impl },
  });
  restoreClipboard = () => {
    if (desc) Object.defineProperty(navigator, "clipboard", desc);
    else Reflect.deleteProperty(navigator, "clipboard");
  };
}

function stubDownload() {
  const clicks: { href: string; download: string }[] = [];
  const blobs: Blob[] = [];
  const urlAny = URL as unknown as Record<string, unknown>;
  const origCreate = urlAny.createObjectURL;
  const origRevoke = urlAny.revokeObjectURL;
  urlAny.createObjectURL = (blob: Blob) => {
    blobs.push(blob);
    return `blob:mock-${blobs.length}`;
  };
  urlAny.revokeObjectURL = () => {};
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clicks.push({ href: this.href, download: this.download });
  };
  restoreDownload = () => {
    urlAny.createObjectURL = origCreate;
    urlAny.revokeObjectURL = origRevoke;
    HTMLAnchorElement.prototype.click = origClick;
  };
  return { clicks, blobs };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  restoreClipboard?.();
  restoreClipboard = null;
  restoreDownload?.();
  restoreDownload = null;
});

describe("UI-RESET-63 yard record and save management", () => {
  it("keeps every record statistic and both clearly labelled transfer entries", () => {
    const { store } = buildYard(() => 1_000);
    openYard(store);
    const panel = document.querySelector(".panel");
    expect(panel?.textContent).toContain("Yard record");
    const stats = [...document.querySelectorAll(".save-stat")];
    expect(stats.length).toBe(6);
    const values = stats.map((row) => row.querySelector("dd")?.textContent ?? "");
    const state = store.getState();
    expect(values[0]).toBe(String(state.tick));
    expect(values[1]).toBe(String(state.machines.length));
    expect(values[2]).toBe("1"); // the repaired starter
    expect(values[3]).toBe(String(state.routes.length));
    expect(values[4]).toBe(String(state.credits));
    expect(values[5]).toBe(`${store.exportSave().length} characters`);
    expect(findButton("Backup")).toBeDefined();
    expect(findButton("Import")).toBeDefined();
    expect(findButton("Close")).toBeDefined();
  });

  it("backup page exports the exact checkpoint and copies it", async () => {
    const { storage, store } = buildYard(() => 1_000);
    openYard(store);
    act(() => findButton("Backup")?.click());
    expect(document.querySelector(".panel")?.textContent).toContain("Backup · export");
    expect(document.querySelector(".panel")?.textContent).toContain("Saved yard");
    const field = document.querySelector("#rustwake-save-export") as HTMLTextAreaElement;
    expect(field.value).toBe(store.exportSave());
    expect(field.value).toBe(storage.raw.get(SAVE_KEY));
    expect(field.readOnly).toBe(true);

    const written: string[] = [];
    stubClipboard(async (text) => {
      written.push(text);
    });
    await act(async () => {
      findButton("Copy")?.click();
    });
    expect(written).toEqual([store.exportSave()]);
    expect(document.querySelector(".panel")?.textContent).toContain("Copied to the clipboard");
  });

  it("clipboard failure and absence both fall back to the manual note", async () => {
    const { store } = buildYard(() => 1_000);
    openYard(store);
    act(() => findButton("Backup")?.click());
    stubClipboard(async () => {
      throw new Error("denied");
    });
    await act(async () => {
      findButton("Copy")?.click();
    });
    expect(document.querySelector(".panel")?.textContent).toContain("Select the text and copy it");
    restoreClipboard?.();
    restoreClipboard = null;
    stubClipboard(null);
    await act(async () => {
      findButton("Copy")?.click();
    });
    expect(document.querySelector(".panel")?.textContent).toContain("Select the text and copy it");
  });

  it("download writes the checkpoint to a named file; failure explains the fallback", async () => {
    const { store } = buildYard(() => 1_000);
    openYard(store);
    act(() => findButton("Backup")?.click());
    const { clicks, blobs } = stubDownload();
    act(() => findButton("Download")?.click());
    expect(document.querySelector(".panel")?.textContent).toContain("Download started");
    expect(clicks.length).toBe(1);
    expect(clicks[0].download).toBe(exportFileName(store.getState().tick));
    expect(await blobText(blobs[0])).toBe(store.exportSave());
    // Without the object-URL API the same button must explain, never pretend.
    restoreDownload?.();
    restoreDownload = null;
    act(() => findButton("Download")?.click());
    expect(document.querySelector(".panel")?.textContent).toContain(
      "Download unavailable — copy the text instead"
    );
  });

  it("refuses malformed, empty, unsupported, damaged and impossible texts before any mutation", () => {
    const { store } = buildYard(() => 1_000);
    const source = buildYard(() => 2_000);
    openYard(store);
    gotoReplace();
    expect(document.querySelector(".panel")?.textContent).toContain("Replace · import");
    expect(document.querySelector(".panel")?.textContent).toContain(
      "Nothing is replaced until you confirm."
    );
    const before = snapshot(store);

    const envelope = JSON.parse(source.store.exportSave());
    const tampered = JSON.stringify({
      ...envelope,
      payload: { ...envelope.payload, lastSeenMs: envelope.payload.lastSeenMs + 1 },
    });
    const impossible = JSON.parse(source.store.exportSave());
    impossible.payload.sim.store.scrap = -3;
    const newerBody = JSON.stringify(envelope.payload);
    const cases: readonly (readonly [string, string])[] = [
      ["", "Nothing pasted"],
      ["not json", "Not a Rustwake file"],
      [
        JSON.stringify({ schemaVersion: 99, checksum: checksum(newerBody), payload: envelope.payload }),
        "Newer version than this build",
      ],
      [tampered, "Damaged file"],
      [reseal(impossible), "Impossible values (store)"],
    ];
    for (const [text, note] of cases) {
      typeInto(pasteField(), text);
      act(() => findButton("Apply")?.click());
      expect(document.querySelector(".panel")?.textContent).toContain(note);
      // Refusal is a note, never a gate and never a mutation.
      expect(document.querySelector(".import-confirm")).toBeNull();
      expect(snapshot(store)).toBe(before);
    }
  });

  it("a valid older save previews, confirms, imports and reloads without double-apply", () => {
    const source = buildYard(() => 2_000);
    const storage = memoryStorage();
    const target = createStore({ storage, now: () => 9_000 });
    // Fixture: the pre-research / pre-fleet / pre-counters v1 shape. Only the
    // parsed copy is stripped; the decoder and migration are untouched.
    const older = JSON.parse(source.store.exportSave());
    delete older.payload.sim.research;
    delete older.payload.sim.spares;
    for (const machine of older.payload.sim.machines) {
      for (const key of [
        "ageTicks",
        "busyTicks",
        "fullTicks",
        "starvedTicks",
        "rateAge",
        "rateFrom",
        "rateAgePrev",
        "rateFromPrev",
      ]) {
        delete machine[key];
      }
    }
    for (const route of older.payload.sim.routes) {
      delete route.ageTicks;
      delete route.busyTicks;
    }
    const text = reseal(older);
    expect(decodeSave(text).ok).toBe(true);

    openYard(target);
    openGate(text);
    const gate = document.querySelector(".import-confirm");
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toContain("Incoming save");
    expect(gate?.textContent).toContain(String(source.store.getState().tick));
    acknowledge();
    act(() => findButton("Replace yard")?.click());
    expect(document.querySelector(".import-confirm")).toBeNull();
    expect(document.querySelector(".panel")?.textContent).toContain("Applied");
    const state = target.getState();
    expect(state.tick).toBe(source.store.getState().tick);
    expect(state.machines.length).toBe(1);
    // Migration backfilled the missing shape instead of resetting the run.
    expect(state.research).toEqual({});
    expect(state.spares).toEqual([]);
    expect(state.machines[0].ageTicks).toBe(0);
    expect(state.machines[0].rateFromPrev).toBe(0);

    // Reload: the checkpoint holds the imported yard exactly once.
    const reopened = createStore({ storage, now: () => 9_000 });
    expect(reopened.getState().tick).toBe(source.store.getState().tick);
    expect(reopened.getReturnReport()).toBeNull();
  });

  it("the gate previews current vs incoming and names the settings consequence", () => {
    const source = buildYard(() => 2_000);
    source.store.setSettings({ ...DEFAULT_SETTINGS, muted: true, textScale: 1.5 });
    const target = createStore({ storage: memoryStorage(), now: () => 9_000 });
    openYard(target);
    openGate(source.store.exportSave());
    const gate = document.querySelector(".import-confirm");
    expect(gate?.getAttribute("role")).toBe("alertdialog");
    expect(gate?.getAttribute("aria-modal")).toBe("true");
    expect(gate?.textContent).toContain("Current yard");
    expect(gate?.textContent).toContain("Incoming save");
    expect(gate?.textContent).toContain("Text scale 1 → 1.5");
    expect(gate?.textContent).toContain("Sound on → muted");
    expect(gate?.textContent).toContain("Back up the current yard first:");
    expect(findButton("Copy current save")).toBeDefined();
    expect(findButton("Download current save")).toBeDefined();
    const columns = [...document.querySelectorAll(".import-confirm__column")];
    expect(columns.length).toBe(2);
    const currentTick = columns[0].querySelector(".import-confirm__row dd")?.textContent;
    const incomingTick = columns[1].querySelector(".import-confirm__row dd")?.textContent;
    expect(currentTick).toBe(String(target.getState().tick));
    expect(incomingTick).toBe(String(source.store.getState().tick));
  });

  it("confirm stays disabled until acknowledged and Cancel owns initial focus", () => {
    const source = buildYard(() => 2_000);
    const target = createStore({ storage: memoryStorage(), now: () => 9_000 });
    openYard(target);
    openGate(source.store.exportSave());
    const confirm = findButton("Replace yard");
    expect(confirm?.disabled).toBe(true);
    expect(document.activeElement).toBe(findButton("Cancel"));
    acknowledge();
    expect(confirm?.disabled).toBe(false);
  });

  it("Cancel leaves the yard untouched and restores focus to Apply", () => {
    const source = buildYard(() => 2_000);
    const target = createStore({ storage: memoryStorage(), now: () => 9_000 });
    openYard(target);
    const before = snapshot(target);
    openGate(source.store.exportSave());
    act(() => findButton("Cancel")?.click());
    expect(document.querySelector(".import-confirm")).toBeNull();
    expect(snapshot(target)).toBe(before);
    expect(document.activeElement).toBe(findButton("Apply"));
    expect(document.querySelector(".panel")).not.toBeNull();
  });

  it("Escape retires only the gate, never the panel underneath", () => {
    const source = buildYard(() => 2_000);
    const target = createStore({ storage: memoryStorage(), now: () => 9_000 });
    openYard(target);
    const before = snapshot(target);
    openGate(source.store.exportSave());
    // A real key press targets the focused element, so the capture-phase gate
    // listener answers before App's window bubble listener.
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(document.querySelector(".import-confirm")).toBeNull();
    expect(document.querySelector(".panel")).not.toBeNull();
    expect(findButton("Apply")).toBeDefined();
    expect(snapshot(target)).toBe(before);
    expect(document.activeElement).toBe(findButton("Apply"));
  });

  it("a confirmed import refreshes record, export and settings through the store", () => {
    const source = buildYard(() => 2_000);
    source.store.setSettings({ ...DEFAULT_SETTINGS, muted: true, textScale: 1.5 });
    const storage = memoryStorage();
    const target = createStore({ storage, now: () => 9_000 });
    openYard(target);
    openGate(source.store.exportSave());
    acknowledge();
    act(() => findButton("Replace yard")?.click());
    expect(target.getSettings()).toEqual({ muted: true, reducedMotion: false, textScale: 1.5 });
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.5");
    expect(document.activeElement).toBe(findButton("Apply"));
    // The record page reads the swapped state, not a stale copy.
    act(() => findButton("Back")?.click());
    const values = [...document.querySelectorAll(".save-stat dd")].map((node) => node.textContent);
    expect(values[0]).toBe(String(source.store.getState().tick));
    expect(values[1]).toBe("1");
    // And the backup page exports the NEW checkpoint, byte-identical to storage.
    act(() => findButton("Backup")?.click());
    const field = document.querySelector("#rustwake-save-export") as HTMLTextAreaElement;
    expect(field.value).toBe(target.exportSave());
    expect(field.value).toBe(storage.raw.get(SAVE_KEY));
  });

  it("a reader tab is refused at confirm and keeps its snapshot", () => {
    const source = buildYard(() => 2_000);
    const shared = memoryStorage();
    createStore({ storage: shared, now: () => 1_000, leaseId: "t1" });
    const reader = createStore({ storage: shared, now: () => 1_000, leaseId: "t2" });
    expect(reader.getRole()).toBe("reader");
    reader.getState().tutorial = 9;
    mount(reader);
    act(() => findButton("Begin recovery")?.click());
    act(() => findButton("Yard")?.click());
    const before = snapshot(reader);
    openGate(source.store.exportSave());
    acknowledge();
    act(() => findButton("Replace yard")?.click());
    expect(document.querySelector(".import-confirm")).toBeNull();
    expect(document.querySelector(".panel")?.textContent).toContain(
      "Another tab is writing this yard"
    );
    expect(snapshot(reader)).toBe(before);
  });

  it("hostile settings are sanitized on import and on boot", () => {
    const source = buildYard(() => 2_000);
    const hostile = JSON.parse(source.store.exportSave());
    hostile.payload.settings = { muted: "yes", reducedMotion: null, textScale: 99 };
    const text = reseal(hostile);

    const storage = memoryStorage();
    const target = createStore({ storage, now: () => 9_000 });
    openYard(target);
    openGate(text);
    expect(document.querySelector(".import-confirm")?.textContent).toContain("Text scale 1 → 2");
    acknowledge();
    act(() => findButton("Replace yard")?.click());
    expect(target.getSettings()).toEqual({ muted: false, reducedMotion: false, textScale: 2 });
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("2");

    // Boot reads the same decoder, so a hostile checkpoint cannot break the UI either.
    storage.raw.set(SAVE_KEY, text);
    const rebooted = createStore({ storage, now: () => 9_000 });
    expect(rebooted.getSettings()).toEqual({ muted: false, reducedMotion: false, textScale: 2 });
  });

  it("failed and canceled imports leave a reload exactly where it was", () => {
    const source = buildYard(() => 2_000);
    const storage = memoryStorage();
    const target = createStore({ storage, now: () => 9_000 });
    openYard(target);
    const before = snapshot(target);
    const checkpointBefore = storage.raw.get(SAVE_KEY);
    // A refusal...
    gotoReplace();
    typeInto(pasteField(), "not json");
    act(() => findButton("Apply")?.click());
    // ...and a canceled gate both leave the checkpoint alone.
    typeInto(pasteField(), source.store.exportSave());
    act(() => findButton("Apply")?.click());
    act(() => findButton("Cancel")?.click());
    expect(snapshot(target)).toBe(before);
    expect(storage.raw.get(SAVE_KEY)).toBe(checkpointBefore);
    // Reload reads the same progress: no double-apply, no silent reset.
    const reopened = createStore({ storage, now: () => 9_000 });
    const live = target.getState();
    expect(reopened.getState().tick).toBe(live.tick);
    expect(reopened.getState().credits).toBe(live.credits);
    expect(reopened.getState().machines.length).toBe(live.machines.length);
    expect(reopened.getState().routes.length).toBe(live.routes.length);
    expect(reopened.getReturnReport()).toBeNull();
  });

  it("every page keeps the panel body as a bounded scroller (shape; geometry in evidence)", () => {
    const { store } = buildYard(() => 1_000);
    openYard(store);
    const body = document.querySelector(".panel__body") as HTMLElement;
    expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
    act(() => findButton("Backup")?.click());
    expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
    act(() => findButton("Back")?.click());
    act(() => findButton("Import")?.click());
    expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight);
  });

  it("the save sheet stays scoped and never shrinks type at large text", () => {
    const largeBlocks = saveCssRaw.match(/\.text-large[^{]*\{[^}]*\}/g) ?? [];
    expect(largeBlocks.length).toBeGreaterThan(0);
    for (const block of largeBlocks) {
      expect(block).not.toContain("font-size");
    }
    // The gate scrim is fixed (it renders inside the panel tree) at the reset
    // dialog's z-index, and the sheet never re-declares the global panel face.
    expect(saveCssRaw).toContain("position: fixed");
    expect(saveCssRaw).toContain("z-index: 40");
    expect(saveCssRaw).not.toMatch(/^\.panel\s*\{/m);
    expect(saveCssRaw).not.toMatch(/^\.panel__body\s*\{/m);
  });
});

describe("UI-RESET-63 pure preview layer", () => {
  it("previewImport refuses with the shared notes and never mutates the source", () => {
    const { store } = buildYard(() => 1_000);
    const before = snapshot(store);
    const refused = previewImport("not json", DEFAULT_SETTINGS);
    expect(refused.status).toBe("refused");
    if (refused.status === "refused") expect(refused.note).toBe("Not a Rustwake file");
    expect(previewImport("", DEFAULT_SETTINGS).status).toBe("refused");
    expect(snapshot(store)).toBe(before);
  });

  it("previewImport answers the migrated shape an older save will import", () => {
    const { store } = buildYard(() => 1_000);
    const older = JSON.parse(store.exportSave());
    delete older.payload.sim.research;
    delete older.payload.sim.spares;
    const result = previewImport(reseal(older), DEFAULT_SETTINGS);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.preview.summary.tick).toBe(store.getState().tick);
      expect(result.preview.summary.machines).toBe(1);
      expect(result.preview.payload.sim.research).toEqual({});
      expect(result.preview.payload.sim.spares).toEqual([]);
      expect(result.preview.settingsLine).toBe("Settings unchanged");
    }
  });

  it("settingsChangeLine names every difference and reads unchanged when equal", () => {
    expect(settingsChangeLine(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toBe("Settings unchanged");
    const line = settingsChangeLine(DEFAULT_SETTINGS, {
      muted: true,
      reducedMotion: true,
      textScale: 2,
    });
    expect(line).toContain("Text scale 1 → 2");
    expect(line).toContain("Sound on → muted");
    expect(line).toContain("Motion full → reduced");
  });

  it("sanitizeSettings clamps, defaults and passes healthy values through", () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ textScale: 99 }).textScale).toBe(2);
    expect(sanitizeSettings({ textScale: 0.2 }).textScale).toBe(1);
    expect(sanitizeSettings({ textScale: Number.NaN }).textScale).toBe(1);
    expect(sanitizeSettings({ textScale: "2" }).textScale).toBe(1);
    expect(sanitizeSettings({ muted: "yes", reducedMotion: 1 })).toEqual({
      muted: false,
      reducedMotion: false,
      textScale: 1,
    });
    const healthy = { muted: true, reducedMotion: true, textScale: 1.5 };
    expect(sanitizeSettings(healthy)).toEqual(healthy);
  });

  it("transfer helpers answer failure instead of throwing", async () => {
    // jsdom ships neither clipboard nor object URLs by default.
    expect(await copySaveText("text")).toBe(false);
    expect(downloadSaveText("text", "file.json")).toBe(false);
    expect(exportFileName(42)).toBe("rustwake-yard-tick-42.json");
  });
});

