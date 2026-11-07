// UI-004 g1: the three-column dock legibility census for PROD-TRIAGE-004 row 3 (S1).
//
// Same method the player lane used (`work/feedback/PLAYER-004-g1/legibility.mjs`, copied into
// this folder's `legibility.mjs` and extended here): `getComputedStyle` for the px, WCAG
// relative luminance of the *resolved* colours for the ratio, alpha dropped from the
// background colour exactly as that instrument does, so the numbers are comparable to the
// recorded baseline (`.dock__cost` 10.8 / 13.5 / 11.25 px at 2.67:1, amber face label
// 13.2 / 16.5 / 13.95 px at 3.31:1).
//
// Two extra columns on purpose:
//   ratioComposited - the same ratio with the background alpha and the accent gradient painted
//                     over `--night-deep`, i.e. the ink the eye actually meets;
//   monotonic       - px at `A 1.25` >= px at `A 1` and px at `A 1.5` >= px at `A 1.25`.
//
// W-3 protocol: 390x844, deviceScaleFactor 2, isMobile + hasTouch, fresh storage, one tap per
// second on the accent-filled primary, then the `A` control twice (1 -> 1.25 -> 1.5).
//
// Run:
//   npm run build
//   npx vite preview --port 4173            (background)
//   npx tsx scripts/measure-legibility.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = "work/development/UI-004-g1/";
const CAPTURES = OUT + "captures/";
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((candidate) => existsSync(candidate));

/** `[selector, census label]`, one row per pair, up to three painted nodes each. */
const ELEMENTS = [
  [".objective__primary", "objective primary"],
  [".objective .status-line", "objective status line"],
  [".dock__btn", "dock face label (plain fill)"],
  [".dock__btn--primary", "dock face label (amber fill)"],
  [".dock__cost", "dock price (plain fill)"],
  [".dock__btn--primary .dock__cost", "dock price (amber fill)"],
  [".resources__item", "resource chip"],
  [".hud .icon-btn", "cluster button"],
  [".panel dt", "panel label"],
  [".panel dd", "panel value"],
  [".node__effect", "research effect"],
  [".node__cost", "research cost"],
  [".toast", "toast"],
];

const readCensus = (ELEMENTS) => {
  const round = (n) => Math.round(n * 100) / 100;
  /** `rgb(a)` text -> `{ rgb, a }`. */
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value ?? "");
    if (!m) return null;
    const parts = m[1].split(",").map((part) => parseFloat(part.trim()));
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const rgbOf = (value) => parse(value)?.rgb ?? [0, 0, 0];
  const lum = (parts) => {
    const channel = (raw) => {
      const s = raw / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2]);
  };
  const ratioOfLum = (a, b) => round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
  /** The census ratio: alpha dropped from the background colour (the player lane's method). */
  const ratio = (fg, bg) => ratioOfLum(lum(rgbOf(fg)), lum(rgbOf(bg)));
  /** The second column: the same pair with every alpha painted down over `--night-deep`. */
  const GROUND = [8, 13, 24];
  const over = (src, dst) => src.rgb.map((c, i) => round(c * src.a + dst[i] * (1 - src.a)));
  const paintOverGround = (layers) => layers.reduce((acc, layer) => over(layer, acc), GROUND);
  /** The first painted background above the node, as the player instrument walks the chain. */
  const bgOf = (node) => {
    let node2 = node;
    while (node2) {
      const colour = getComputedStyle(node2).backgroundColor;
      if (colour && !/rgba\(0, 0, 0, 0\)|transparent/.test(colour)) return colour;
      node2 = node2.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  /** The accent fill's gradient stops, top then bottom, as parsed colours. */
  const gradientStops = (node) => {
    let node2 = node;
    while (node2) {
      const image = getComputedStyle(node2).backgroundImage ?? "";
      if (image.indexOf("linear-gradient") === 0)
        return [...image.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter(Boolean);
      node2 = node2.parentElement;
    }
    return [];
  };
  const row = (nodeIndex) => (node, label) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const bg = bgOf(node);
    const inkLum = lum(rgbOf(style.color));
    const bgLayer = parse(bg) ?? { rgb: GROUND, a: 1 };
    const stops = gradientStops(node);
    // Real-ink readings of the fill, all painted down over the page ground: the flat
    // background colour when there is no gradient, otherwise the gradient's top and bottom
    // stops (both carry the background colour underneath). The census column takes the worst.
    const painted = stops.length
      ? [paintOverGround([bgLayer, stops[0]]), paintOverGround([bgLayer, ...stops])]
      : [paintOverGround([bgLayer])];
    const ratios = painted.map((parts) => ratioOfLum(inkLum, lum(parts)));
    return {
      label,
      index: nodeIndex,
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 46),
      px: round(parseFloat(style.fontSize)),
      ratio: ratio(style.color, bg),
      ratioComposited: Math.min(...ratios),
      ratioCompositedTop: ratios.length > 1 ? ratios[1] : ratios[0],
      ratioCompositedBottom: ratios.length > 2 ? ratios[2] : ratios[0],
      color: style.color,
      bg,
      gradientStops: stops.length,
      heightPx: round(rect.height),
      widthPx: round(rect.width),
      // `clipped` is the player instrument's own test: horizontal overflow of the node's box.
      clipped: node.scrollWidth > Math.ceil(rect.width) + 0.5,
      overflowYpx: node.scrollHeight - node.clientHeight,
    };
  };
  const rows = [];
  for (const [selector, label] of ELEMENTS) {
    const nodes = Array.from(document.querySelectorAll(selector)).slice(0, 3);
    nodes.forEach((node, index) => rows.push(row(index)(node, label)));
  }
  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  const root = document.documentElement;
  const targets = Array.from(document.querySelectorAll(".dock .dock__btn, .hud .icon-btn")).map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
      h: round(rect.height),
      w: round(rect.width),
    };
  });
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    dpr: window.devicePixelRatio,
    rootFontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    textScaleProperty: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    textLarge: root.classList.contains("text-large"),
    rows,
    targets,
    cardFillPct: card && hud ? round((card.getBoundingClientRect().height / hud.clientHeight) * 1000) / 10 : null,
    pageScroll: {
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
  };
};

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const pageErrors = [];
const page = await context.newPage();
page.on("pageerror", (error) => pageErrors.push(String(error)));
await page.goto(url, { waitUntil: "load" });
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
// One tap per second on the accent-filled primary: the W-3 cadence, so the dock is the row a
// player actually reads (two-line primary label + price, panel faces beside it).
for (let i = 0; i < 12; i += 1) {
  const primary = page.locator(".dock__btn--primary");
  if ((await primary.count()) > 0) await primary.first().click({ force: true });
  await page.waitForTimeout(1000);
}

mkdirSync(CAPTURES, { recursive: true });
const steps = [];
const stepLabels = ["A 1", "A 1.25", "A 1.5"];
for (let i = 0; i < stepLabels.length; i += 1) {
  if (i > 0) {
    const button = page.locator(".hud .icon-btn", { hasText: "A " });
    if ((await button.count()) > 0) await button.first().click({ force: true });
    await page.waitForTimeout(350);
  }
  const measured = await page.evaluate(readCensus, ELEMENTS);
  steps.push({ label: stepLabels[i], scale: measured.textScaleProperty, ...measured });
  await page.screenshot({ path: `${CAPTURES}legibility-${stepLabels[i].replace(/ /g, "")}-390x844-dpr2.png` });
}
await browser.close();

// ------------------------------------------------------------------ monotonicity column
const ladder = new Map();
for (const step of steps)
  for (const entry of step.rows) {
    const key = `${entry.label} #${entry.index}`;
    if (!ladder.has(key))
      ladder.set(key, { px: [], ratio: [], ratioComposited: [], text: entry.text, clipped: [] });
    const bucket = ladder.get(key);
    bucket.px.push(entry.px);
    bucket.ratio.push(entry.ratio);
    bucket.ratioComposited.push(entry.ratioComposited);
    bucket.clipped.push(entry.clipped);
  }
const census = [...ladder.entries()].map(([element, bucket]) => {
  const monotonic =
    bucket.px.length === 3 && bucket.px[1] >= bucket.px[0] && bucket.px[2] >= bucket.px[1];
  return {
    element,
    text: bucket.text,
    px: bucket.px,
    ratio: bucket.ratio,
    ratioComposited: bucket.ratioComposited,
    monotonic,
    clipped: bucket.clipped.some((value) => value),
    priceFloorPass: element.startsWith("dock price") ? bucket.px.every((px) => px >= 12) : null,
    aaPass: bucket.ratio.every((value) => value >= 4.5),
  };
});
const witnesses = steps.map((step) => ({
  label: step.label,
  scale: step.scale,
  textLarge: step.textLarge,
  rootFontPx: step.rootFontPx,
  clipped: step.rows.filter((r) => r.clipped).map((r) => r.label),
  verticalOverflow1pxRows: step.rows
    .filter((r) => r.overflowYpx > 0)
    .map((r) => `${r.label} #${r.index} +${r.overflowYpx}px`),
  minTargetPx: step.targets.length ? Math.min(...step.targets.map((t) => Math.min(t.h, t.w))) : null,
  targets: step.targets,
  noPageScroll: step.pageScroll.scrollHeight === step.pageScroll.innerHeight && step.pageScroll.scrollWidth === step.pageScroll.innerWidth,
  pageScroll: step.pageScroll,
  cardFillPct: step.cardFillPct,
}));

const report = {
  ticket: "UI-004 g1",
  baseSha: "1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2",
  window: "W-3 (180 s wall, 1 tap/s, 390x844 dpr2, isMobile + hasTouch, fresh storage)",
  url,
  columns: stepLabels,
  floors: { dockCostPx: 12, aaRatio: 4.5, tapTargetPx: 44, cardFillPct: 42 },
  census,
  witnesses,
  pageErrors,
  steps,
};
writeFileSync(`${OUT}legibility-census.json`, JSON.stringify(report, null, 1), "utf8");

for (const step of steps)
  console.log(
    `\n[${step.label}] --text-scale ${step.textScaleProperty} text-large ${step.textLarge}` +
      ` root font ${step.rootFontPx}px ${step.inner.width}x${step.inner.height} dpr ${step.dpr}` +
      ` card fill ${step.cardFillPct} % (cap 42 %)`
  );
console.log(`\ncensus (${stepLabels.join(" | ")})`);
for (const row of census)
  console.log(
    `  ${row.element.padEnd(28)}` +
      ` px ${JSON.stringify(row.px).padEnd(22)} mono ${String(row.monotonic).padEnd(5)}` +
      ` ratio ${JSON.stringify(row.ratio).padEnd(22)} composited ${JSON.stringify(row.ratioComposited).padEnd(22)}` +
      ` aa ${row.aaPass}${row.priceFloorPass === null ? "" : ` costFloor ${row.priceFloorPass}`}` +
      ` clipped ${row.clipped} "${row.text}"`
  );
for (const w of witnesses)
  console.log(
    `\n[witness ${w.label}] clipped ${JSON.stringify(w.clipped)} (false everywhere: ${w.clipped.length === 0})` +
      ` | min tap target ${w.minTargetPx} px (floor 44) | no page scroll ${w.noPageScroll}` +
      ` ${JSON.stringify(w.pageScroll)} | card fill ${w.cardFillPct} % | pageerrors ${pageErrors.length}`
  );
for (const w of witnesses) console.log(`  targets ${w.label} ${JSON.stringify(w.targets)}`);
const entry = readdirSync("dist/assets")
  .filter((name) => /^index-.*\.js$/.test(name))
  .map((name) => ({ name, bytes: readFileSync(`dist/assets/${name}`).length }));
console.log(`\nentry chunk ${JSON.stringify(entry)} (ceiling 233000 B)`);
console.log(`pageerrors ${pageErrors.length}${pageErrors.length ? ": " + pageErrors.join(" | ") : ""}`);
