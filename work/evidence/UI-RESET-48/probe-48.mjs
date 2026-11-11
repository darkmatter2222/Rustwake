import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// UI-RESET/TOKENS (#48): shared harness helpers. From this worktree root:
//   npm ci
//   node node_modules/vite/bin/vite.js build
//   node node_modules/vite/bin/vite.js preview --port 4188 --strictPort      (shell 1)
//   node work/evidence/UI-RESET-48/measure-48.mjs                            -> measures-48.json
//   node work/evidence/UI-RESET-48/capture-48.mjs                            -> captures/*.png + captures-48.json
// The real build paints every frame; `?ui48` selects the primitive slice inside the shipped
// shell, so the same stylesheet cascade is on the page. No game code path is involved.

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const dir = resolve(root, "work/evidence/UI-RESET-48");
export const url = process.env.RUSTWAKE_URL ?? "http://localhost:4188/";
export const exe = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((x) => x && existsSync(x));

/** The six bands #45 measured (`UI-RESET-45/measures.json`), same dpr clamps as that probe. */
export const VIEWPORTS = [
  { key: "360x640", w: 360, h: 640, dpr: 2, mobile: true },
  { key: "390x844", w: 390, h: 844, dpr: 2, mobile: true },
  { key: "844x390", w: 844, h: 390, dpr: 2, mobile: true },
  { key: "1366x768", w: 1366, h: 768, dpr: 1, mobile: false },
  { key: "1920x1080", w: 1920, h: 1080, dpr: 1, mobile: false },
  { key: "2560x1440", w: 2560, h: 1440, dpr: 1, mobile: false },
];

/**
 * In-page probe: every painted fact one acceptance line asks for. It reads the primitives only
 * (`.wk-*`), so the numbers are the shared components' own, not the shipped shell's.
 */
export const PROBE = () => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const faces = [...document.querySelectorAll(".wk-face, .wk-nav__face")].map((el) => {
    const cs = getComputedStyle(el);
    return {
      label: (el.textContent ?? "").trim().slice(0, 40),
      state: el.getAttribute("data-state"),
      afford: el.getAttribute("data-afford"),
      ...box(el),
      minHeight: parseFloat(cs.minHeight),
      borderTopStyle: cs.borderTopStyle,
      borderWidth: cs.borderTopWidth,
      opacity: cs.opacity,
      transitionDuration: cs.transitionDuration,
      transitionTiming: cs.transitionTimingFunction,
      outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
      disabled: el.disabled === true,
    };
  });
  const prices = [...document.querySelectorAll(".wk-face__price, .wk-amount__value, .wk-inspector__value")].map(
    (el) => (el.textContent ?? "").trim()
  );
  const lines = [...document.querySelectorAll(".wk-face__label")].map(
    (el) => el.getClientRects().length
  );
  const dataNodes = [...document.querySelectorAll(".wk-data")].map((el) => {
    const cs = getComputedStyle(el);
    return { font: cs.fontFamily.split(",")[0], variant: cs.fontVariantNumeric };
  });
  const clipped = [...document.querySelectorAll(".wk-face__label, .wk-face__price, .wk-help, .wk-inspector__heading")]
    .filter((el) => el.scrollWidth > Math.ceil(el.clientWidth) + 1)
    .map((el) => (el.textContent ?? "").trim().slice(0, 28));
  const sheet = document.querySelector(".wk-sheet");
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].map((el) => ({
    modal: el.getAttribute("aria-modal"),
    tabindex: el.getAttribute("tabindex"),
    labelled: el.getAttribute("aria-labelledby"),
    height: Math.round(el.getBoundingClientRect().height),
    innerScrollPx: (() => {
      const body = el.querySelector(".wk-sheet__body, .wk-dialog__body");
      return body ? Math.round(body.scrollHeight - body.clientHeight) : null;
    })(),
  }));
  const lane = document.querySelector(".wk-toast-lane");
  const toast = document.querySelector(".wk-toast");
  const de = document.documentElement;
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: Math.min(2, window.devicePixelRatio || 1) },
    textScale: getComputedStyle(de).getPropertyValue("--text-scale").trim() || "1",
    docScroll: { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight },
    gallery: box(document.querySelector(".wk-gallery") ?? de),
    faces,
    facesUnder44: faces.filter((f) => f.h < 44 || f.w < 44).length,
    facesAt46: faces.filter((f) => f.minHeight === 46).length,
    steppedFaces: faces.filter((f) => /steps\(4/.test(f.transitionTiming)).length,
    prices,
    labelLineCounts: lines,
    dataNodes,
    clipped,
    dialogs,
    sheetHeight: sheet ? Math.round(sheet.getBoundingClientRect().height) : null,
    laneBox: lane ? box(lane) : null,
    toastBox: toast ? box(toast) : null,
    toastRole: toast ? toast.getAttribute("role") : null,
    focusRing: (() => {
      const el = document.querySelector(".wk-face");
      if (!el) return null;
      el.focus();
      const cs = getComputedStyle(el);
      return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
    })(),
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
};

/** Opens the primitive slice at one band. `scale` sets `--text-scale` after the paint. */
export const openSlice = async (browser, vp, { scale = 1, reduced = false, query = "?ui48" } = {}) => {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  await page.goto(url + query, { waitUntil: "networkidle" });
  if (scale !== 1) {
    await page.evaluate((value) => {
      document.documentElement.style.setProperty("--text-scale", String(value));
    }, scale);
  }
  await page.waitForSelector(".wk-gallery");
  return { context, page };
};

/** Opens the shipped game shell at one band (the in-game slice beside the primitive sheet). */
export const openGame = async (browser, vp) => {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  await page.waitForTimeout(1200);
  return { context, page };
};
