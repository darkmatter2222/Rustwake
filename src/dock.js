/**
 * Rustwake V2 — phone-safe bottom dock + collapsible contextual sheet (#365 UX-07).
 *
 * Pure, renderer-free layout read model + persisted player preferences.
 * Nothing here touches the simulation, the save, or the camera math: the
 * dock/sheet geometry mirrors src/styles.css so App.jsx can hand the EXISTING
 * inspector.panelPlacement the real bottom reserve (measured from the live
 * dock when available) instead of a hardcoded guess. #307 applyCamera /
 * stampCamera invariants are never rewritten — the sheet only ever moves the
 * camera through the existing public setView/applyCamera path (UX-04).
 *
 * Layout contract (CSS is the source of truth; these are its numeric mirror):
 *  - phone portrait  (width<=770): bottom dock 24px above the safe-area floor,
 *    sheet bottom reserve 96px, sheet max-height min(46dvh, 100dvh-210px).
 *  - phone landscape (height<=600, width>height): compact side-docked sheet,
 *    bottom reserve 92px, max-height 100dvh-160px (minus safe-area).
 *  - desktop: unchanged UX-04 dock, bottom reserve 133px, min(63dvh,650px).
 *  - 200% text (page zoom halves the CSS viewport; 390px phone -> 195px):
 *    strip AND dock become internally scrollable rows with >=44px targets,
 *    sheet budget min(38dvh, 100dvh-288px) so a world band stays visible.
 *  - safe-area insets flow through --sat/--sar/--sab/--sal (env() fed).
 */

export const DOCK_SETTINGS_KEY = "rustwake:v2:dock-settings";
export const DOCK_DEFAULTS = Object.freeze({ sheetCollapsed: false });
export const MIN_TAP_CSS_PX = 44;
export const PHONE_CUTOFF_CSS_PX = 770;
export const SHORT_VIEWPORT_CSS_PX = 600;
// 200% page zoom on a 390 CSS px phone yields a 195 CSS px layout viewport.
export const NARROW_TEXT_CUTOFF_CSS_PX = 359;
export const SHEET_BAR_CSS_PX = 48;

/** "phone" | "landscape" | "desktop" — mirrors the CSS media queries. */
export function classifyViewport({ width, height } = {}) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return "desktop";
  if (h <= SHORT_VIEWPORT_CSS_PX && w > h) return "landscape";
  if (w <= PHONE_CUTOFF_CSS_PX) return "phone";
  return "desktop";
}

/** 200%-text / ultra-narrow mode: horizontal internal scroll, never doc scroll. */
export function isNarrowText(width) {
  const w = Number(width);
  return w > 0 && w <= NARROW_TEXT_CUTOFF_CSS_PX;
}
export const stripScrolls = (width) => isNarrowText(width);
export const dockScrolls = (width) => isNarrowText(width);

/** Distance (CSS px, safe-area 0 baseline) from viewport bottom to sheet bottom. */
export function dockBottomOffset(mode) {
  return mode === "phone" ? 96 : mode === "landscape" ? 92 : 133;
}

/** Sheet max-height mirror (safe-area 0 baseline). Always leaves a world band. */
export function sheetMaxHeight({ width, height } = {}) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return 0;
  const mode = classifyViewport({ width: w, height: h });
  if (mode === "landscape") return Math.max(120, h - 160);
  if (mode === "desktop") return Math.min(0.63 * h, 650);
  if (isNarrowText(w)) return Math.max(120, Math.min(0.38 * h, h - 288));
  return Math.max(120, Math.min(0.46 * h, h - 210));
}

/** Top edge of the fully expanded sheet (safe-area 0 baseline). */
export function sheetTop({ width, height } = {}) {
  const mode = classifyViewport({ width, height });
  return Number(height) - dockBottomOffset(mode) - sheetMaxHeight({ width, height });
}

/** Essential tap-target predicate (0.5px sub-pixel tolerance for rounding). */
export function tapTargetOk(rect) {
  return !!rect && Number(rect.width) + 0.5 >= MIN_TAP_CSS_PX && Number(rect.height) + 0.5 >= MIN_TAP_CSS_PX;
}

/* ---- Persisted dock preferences (player preference, never economy) ---- */
function sanitizeDock(p) {
  return { sheetCollapsed: typeof p?.sheetCollapsed === "boolean" ? p.sheetCollapsed : DOCK_DEFAULTS.sheetCollapsed };
}
export function readDockSettings(storage) {
  try {
    const raw = storage?.getItem(DOCK_SETTINGS_KEY);
    if (!raw) return { ...DOCK_DEFAULTS };
    return sanitizeDock(JSON.parse(raw));
  } catch { return { ...DOCK_DEFAULTS }; }
}
export function writeDockSettings(storage, patch) {
  const next = sanitizeDock({ ...readDockSettings(storage), ...(patch || {}) });
  try { storage?.setItem(DOCK_SETTINGS_KEY, JSON.stringify(next)); } catch {}
  return next;
}
