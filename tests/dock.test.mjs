// UX-07 (#365) phone-safe bottom dock + collapsible contextual sheet.
// Pure layout read model + persisted preferences. These tests pin the numeric
// mirror of src/styles.css so the sheet can never silently eat the world band,
// and prove dock settings are player preference only (never economy/save).
import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCK_SETTINGS_KEY, DOCK_DEFAULTS, MIN_TAP_CSS_PX, PHONE_CUTOFF_CSS_PX,
  NARROW_TEXT_CUTOFF_CSS_PX, SHEET_BAR_CSS_PX,
  classifyViewport, isNarrowText, stripScrolls, dockScrolls,
  dockBottomOffset, sheetMaxHeight, sheetTop, tapTargetOk,
  readDockSettings, writeDockSettings,
} from "../src/dock.js";
import { UX_SETTINGS_KEY, readUxSettings } from "../src/inspector.js";
import { STRIP_SETTINGS_KEY, readStripSettings } from "../src/resourceStrip.js";
import { createGame, snapshot, readGame } from "../src/simulation.js";
import { SAVE_KEY } from "../src/content.js";

const memStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
};

test("classifyViewport: the three acceptance viewports plus 200% text", () => {
  assert.equal(classifyViewport({ width: 390, height: 844 }), "phone");
  assert.equal(classifyViewport({ width: 844, height: 390 }), "landscape");
  assert.equal(classifyViewport({ width: 1440, height: 900 }), "desktop");
  // 200% page zoom halves the CSS layout viewport of a 390x844 phone.
  assert.equal(classifyViewport({ width: 195, height: 422 }), "phone");
  assert.equal(classifyViewport({ width: 667, height: 375 }), "landscape");
  assert.equal(classifyViewport({ width: 770, height: 900 }), "phone");
  assert.equal(classifyViewport({ width: 771, height: 900 }), "desktop");
});

test("classifyViewport: invalid sizes fall back to desktop, never throw", () => {
  assert.equal(classifyViewport({ width: 0, height: 0 }), "desktop");
  assert.equal(classifyViewport({}), "desktop");
  assert.equal(classifyViewport(), "desktop");
  assert.equal(classifyViewport({ width: -5, height: 800 }), "desktop");
});

test("200%-text cutoff: strip and dock scroll internally only below 360 CSS px", () => {
  assert.equal(isNarrowText(195), true);
  assert.equal(isNarrowText(359), true);
  assert.equal(isNarrowText(360), false);
  assert.equal(isNarrowText(390), false);
  assert.equal(stripScrolls(195), true);
  assert.equal(dockScrolls(195), true);
  assert.equal(stripScrolls(390), false);
  assert.equal(dockScrolls(844), false);
  assert.equal(isNarrowText(0), false);
  assert.equal(NARROW_TEXT_CUTOFF_CSS_PX, 359);
});

test("dockBottomOffset mirrors the CSS sheet reserve per mode", () => {
  assert.equal(dockBottomOffset("phone"), 96);
  assert.equal(dockBottomOffset("landscape"), 92);
  assert.equal(dockBottomOffset("desktop"), 133);
});

test("phone portrait sheet leaves a usable world band under the HUD/rail", () => {
  const vp = { width: 390, height: 844 };
  const max = sheetMaxHeight(vp);
  assert.equal(max, Math.min(0.46 * 844, 844 - 210)); // 388.24 -> CSS min()
  const top = sheetTop(vp);
  // The phone HUD (two rows ~99px) + camera rail (~258px bottom) must stay clear.
  assert.ok(top >= 258, "sheet top " + top + " would bury the camera rail");
  assert.ok(844 - top - max >= 96, "sheet must sit above the dock reserve");
});

test("200%-text sheet budget keeps a world band and never goes negative", () => {
  const vp = { width: 195, height: 422 };
  const max = sheetMaxHeight(vp);
  assert.ok(max >= 120 && max <= 0.38 * 422 + 1e-9, "narrow budget clamped: " + max);
  const top = sheetTop(vp);
  // Narrow mode: HUD ~85px + single scrollable camera row ~132px bottom.
  assert.ok(top >= 132, "200%-text sheet top " + top + " overlaps the camera row");
  assert.ok(top > 0);
  assert.ok(sheetMaxHeight({ width: 195, height: 200 }) >= 120);
});

test("landscape sheet is side-docked: half the world width stays free", () => {
  const vp = { width: 844, height: 390 };
  assert.equal(classifyViewport(vp), "landscape");
  const max = sheetMaxHeight(vp);
  assert.equal(max, 390 - 160);
  // Desktop-style side dock width (min(356, 100vw-28)) must leave >=400px world.
  const panelW = Math.min(356, vp.width - 28);
  assert.ok(vp.width - panelW - 2 * 24 >= 400);
  assert.ok(sheetTop(vp) >= 52, "landscape sheet must clear the compact HUD");
});

test("desktop sheet budget is unchanged from UX-04", () => {
  assert.equal(sheetMaxHeight({ width: 1440, height: 900 }), Math.min(0.63 * 900, 650));
  assert.equal(sheetTop({ width: 1440, height: 900 }), 900 - 133 - 567);
});

test("sheetMaxHeight/sheetTop: invalid viewports are honest zeros, never NaN", () => {
  assert.equal(sheetMaxHeight({ width: 0, height: 0 }), 0);
  assert.equal(sheetMaxHeight(), 0);
  assert.ok(Number.isFinite(sheetTop({ width: 390, height: 844 })));
});

test("tapTargetOk enforces the 44px essential floor with sub-pixel tolerance", () => {
  assert.equal(MIN_TAP_CSS_PX, 44);
  assert.equal(tapTargetOk({ width: 44, height: 44 }), true);
  assert.equal(tapTargetOk({ width: 43.6, height: 44 }), true);
  assert.equal(tapTargetOk({ width: 43, height: 44 }), false);
  assert.equal(tapTargetOk({ width: 60, height: 32 }), false);
  assert.equal(tapTargetOk(null), false);
  assert.equal(tapTargetOk({}), false);
});

test("dock defaults: sheet starts expanded; collapsed is the only preference", () => {
  assert.deepEqual(DOCK_DEFAULTS, { sheetCollapsed: false });
  assert.deepEqual(readDockSettings(null), { sheetCollapsed: false });
  assert.deepEqual(readDockSettings(memStorage()), { sheetCollapsed: false });
  assert.equal(SHEET_BAR_CSS_PX, 48);
});

test("dock settings round-trip and sanitize hostile values", () => {
  const s = memStorage();
  const next = writeDockSettings(s, { sheetCollapsed: true });
  assert.deepEqual(next, { sheetCollapsed: true });
  assert.deepEqual(readDockSettings(s), { sheetCollapsed: true });
  assert.deepEqual(writeDockSettings(s, { sheetCollapsed: false }), { sheetCollapsed: false });
  s.setItem(DOCK_SETTINGS_KEY, JSON.stringify({ sheetCollapsed: "yes", economy: 999 }));
  assert.deepEqual(readDockSettings(s), { sheetCollapsed: false });
  s.setItem(DOCK_SETTINGS_KEY, "{corrupt");
  assert.deepEqual(readDockSettings(s), { sheetCollapsed: false });
  assert.deepEqual(writeDockSettings(s, null), { sheetCollapsed: false });
});

test("dock settings never touch the save, ux-settings or strip-settings", () => {
  const s = memStorage();
  const g = createGame();
  s.setItem(SAVE_KEY, JSON.stringify(snapshot(g))); // seed the authoritative save into mem storage
  s.setItem(UX_SETTINGS_KEY, JSON.stringify({ autoFrame: false, panelSide: "right" }));
  s.setItem(STRIP_SETTINGS_KEY, JSON.stringify({ ledgerOpen: true }));
  const saveBefore = s.getItem(SAVE_KEY);
  writeDockSettings(s, { sheetCollapsed: true });
  writeDockSettings(s, { sheetCollapsed: false });
  assert.equal(s.getItem(SAVE_KEY), saveBefore, "dock prefs must not rewrite the save");
  assert.deepEqual(readUxSettings(s), { autoFrame: false, panelSide: "right" });
  assert.deepEqual(readStripSettings(s), { ledgerOpen: true });
  assert.equal(s._m.has(DOCK_SETTINGS_KEY), true);
  assert.notEqual(DOCK_SETTINGS_KEY, UX_SETTINGS_KEY);
  assert.notEqual(DOCK_SETTINGS_KEY, STRIP_SETTINGS_KEY);
  assert.notEqual(DOCK_SETTINGS_KEY, SAVE_KEY);
});

test("writeDockSettings survives a throwing storage (private mode)", () => {
  const hostile = { getItem: () => { throw Error("denied"); }, setItem: () => { throw Error("denied"); } };
  assert.deepEqual(readDockSettings(hostile), { sheetCollapsed: false });
  assert.deepEqual(writeDockSettings(hostile, { sheetCollapsed: true }), { sheetCollapsed: true });
});

test("collapse/expand preference is independent of camera/selection state", () => {
  // The dock module holds NO camera or selection fields: collapsing can never
  // express a camera move or a selection change (App keeps those in React state).
  const s = memStorage();
  writeDockSettings(s, { sheetCollapsed: true });
  const keys = Object.keys(readDockSettings(s));
  assert.deepEqual(keys, ["sheetCollapsed"]);
  assert.equal(PHONE_CUTOFF_CSS_PX, 770);
});

test("authoritative simulation is untouched by dock geometry helpers", () => {
  const g = createGame();
  const before = JSON.stringify(snapshot(g));
  for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 195, height: 422 }, { width: 1440, height: 900 }]) {
    classifyViewport(vp); sheetMaxHeight(vp); sheetTop(vp); dockBottomOffset(classifyViewport(vp));
  }
  assert.equal(JSON.stringify(snapshot(g)), before);
  assert.equal(typeof readGame, "function");
});
