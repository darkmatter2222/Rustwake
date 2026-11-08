// UI-004 g2 addendum: the A ladder extended to the 4th step (A 2.0) plus the per-chip height
// table Issue #30 needs as its before-state baseline.
//
// Same W-3 window and the same contrast method as `measure-ui004-g2.mjs` (so the two files are
// comparable): 390x844, dpr 2, isMobile + hasTouch, fresh storage, 12 taps at 1/s on the
// accent-filled primary, then the `A` control three times -> 1 -> 1.25 -> 1.5 -> 2.
//
// Printed per step, and emphasised at A 2.0:
//   - every `.resources__item` chip: rendered height/width, px, and the three contrast columns;
//   - the price string `.dock__cost` (plain + amber): px and contrast;
//   - the witnesses the 2.0 step was missing from (card fill of `.objective` in the `.hud`
//     column, min tap dimension, page scroll), which is what makes the card-fill witnesses and
//     this ladder overlap;
//   - the four-reading px ladder per named element with a non-decreasing check.
//
// Run (from the worktree root, after `npm run build` and `npx vite preview --port 4191`):
//   RUSTWAKE_URL=http://localhost:4191/ npx tsx work/evidence/UI-004-g2/measure-ui004-g2-a2.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = "work/evidence/UI-004-g2/";
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

/** The four steps the in-game `A` control cycles (`App.tsx`: [1, 1.25, 1.5, 2]). */
const STEP_LABELS = ["A 1", "A 1.25", "A 1.5", "A 2"];

/** Named ladder rows (same labels as `measure-ui004-g2.mjs`). */
const ELEMENTS = [
  [".objective__primary", "objective primary"],
  [".objective .status-line", "objective status line"],
  [".dock__btn", "dock face label (plain fill)"],
  [".dock__btn--primary", "dock face label (amber fill)"],
  [".dock__cost", "dock price (plain fill)"],
  [".dock__btn--primary .dock__cost", "dock price (amber fill)"],
  [".resources__item", "resource chip"],
  [".hud .icon-btn", "cluster button"],
];

/** Each chip as Issue #30 sees it: the chip box plus its two ink runs. */
const CHIP_READ = (elements) => {
  const round = (n) => Math.round(n * 100) / 100;
  const GROUND = [8, 13, 24];
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value ?? "");
    if (!m) return null;
    const parts = m[1].split(",").map((part) => parseFloat(part.trim()));
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const ch = (raw) => {
    const s = raw / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (parts) => 0.2126 * ch(parts[0]) + 0.7152 * ch(parts[1]) + 0.0722 * ch(parts[2]);
  const ratioOfLum = (a, b) => round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
  const over = (src, dst) => src.rgb.map((c, i) => round(c * src.a + dst[i] * (1 - src.a)));
  const transparent = (colour) => !colour || /rgba\(0, 0, 0, 0\)|transparent/.test(colour);
  const layersOf = (node) => {
    const stack = [];
    let walk = node;
    while (walk) {
      const style = getComputedStyle(walk);
      const own = [];
      if (!transparent(style.backgroundColor)) own.push(parse(style.backgroundColor));
      const image = style.backgroundImage ?? "";
      if (image.indexOf("linear-gradient") === 0)
        own.push(...[...image.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter(Boolean));
      if (own.length) stack.unshift(...own);
      walk = walk.parentElement;
    }
    return stack;
  };
  const paint = (layers) => layers.reduce((acc, layer) => (layer ? over(layer, acc) : acc), GROUND);
  const alphaChain = (node) => {
    let alpha = 1;
    let walk = node;
    while (walk) {
      const value = parseFloat(getComputedStyle(walk).opacity);
      if (!Number.isNaN(value)) alpha *= value;
      walk = walk.parentElement;
    }
    return round(alpha);
  };
  const measure = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const layers = layersOf(node);
    const nearest = [...layers].reverse().find(Boolean);
    const digits = (style.color.match(/[\d.]+/g) ?? []).map((part) => parseFloat(part));
    const alpha = alphaChain(node);
    const inkOver = (parts) =>
      ratioOfLum(
        lum([0, 1, 2].map((i) => round(digits[i] * alpha + parts[i] * (1 - alpha)))),
        lum(parts)
      );
    const painted = [paint(layers), layers.length > 1 ? paint(layers.slice(0, -1)) : paint(layers)];
    return {
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
      px: round(parseFloat(style.fontSize)),
      weight: style.fontWeight,
      ratio: (() => {
        const bg = nearest ? [0, 1, 2].map((i) => nearest.rgb[i]) : GROUND;
        return ratioOfLum(lum(digits.slice(0, 3)), lum(bg));
      })(),
      ratioComposited: Math.min(...painted.map((parts) => ratioOfLum(lum(digits.slice(0, 3)), lum(parts)))),
      ratioEffective: Math.min(...painted.map(inkOver)),
      opacity: alpha,
      color: style.color,
      bg: nearest ? `rgb(${nearest.rgb.join(",")})` : null,
      heightPx: round(rect.height),
      widthPx: round(rect.width),
      topPx: round(rect.top),
      bottomPx: round(rect.bottom),
      lineHeight: style.lineHeight,
      scrollHeightPx: node.scrollHeight,
      clientHeightPx: node.clientHeight,
      clipped: node.scrollWidth > Math.ceil(rect.width) + 0.5,
      // Issue #30 wants the two ink runs inside a chip: the label and its value.
      runs: Array.from(node.children).map((child) => {
        const childRect = child.getBoundingClientRect();
        return {
          text: (child.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24),
          px: round(parseFloat(getComputedStyle(child).fontSize)),
          heightPx: round(childRect.height),
          widthPx: round(childRect.width),
          topPx: round(childRect.top),
        };
      }),
    };
  };
  const chips = Array.from(document.querySelectorAll(".resources__item")).map((node) => measure(node));
  const pricePlain = Array.from(document.querySelectorAll(".dock__cost")).map((node) => measure(node));
  const priceAmber = Array.from(document.querySelectorAll(".dock__btn--primary .dock__cost")).map((node) => measure(node));
  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  const root = document.documentElement;
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    rootFontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    textScaleProperty: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    textLarge: root.classList.contains("text-large"),
    chips,
    pricePlain,
    priceAmber,
    rows: (() => {
      const out = [];
      for (const [selector, label] of elements)
        Array.from(document.querySelectorAll(selector))
          .slice(0, 3)
          .forEach((node, index) => out.push({ label, index, ...measure(node) }));
      return out;
    })(),
    targets: Array.from(document.querySelectorAll(".dock .dock__btn, .hud .icon-btn")).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
        h: round(rect.height),
        w: round(rect.width),
      };
    }),
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
for (let i = 0; i < 12; i += 1) {
  const primary = page.locator(".dock__btn--primary");
  if ((await primary.count()) > 0) await primary.first().click({ force: true });
  await page.waitForTimeout(1000);
}

mkdirSync(CAPTURES, { recursive: true });
const steps = [];
for (let i = 0; i < STEP_LABELS.length; i += 1) {
  if (i > 0) {
    const button = page.locator(".hud .icon-btn", { hasText: "A " });
    if ((await button.count()) > 0) await button.first().click({ force: true });
    await page.waitForTimeout(350);
  }
  const measured = await page.evaluate(CHIP_READ, ELEMENTS);
  steps.push({ label: STEP_LABELS[i], scale: measured.textScaleProperty, ...measured });
  await page.screenshot({ path: `${CAPTURES}ladder-${STEP_LABELS[i].replace(/ /g, "")}-390x844-dpr2.png` });
}
await browser.close();

// Four-reading ladder per named element + the non-decreasing check.
const ladder = new Map();
for (const step of steps)
  for (const entry of step.rows) {
    const key = `${entry.label} #${entry.index}`;
    if (!ladder.has(key)) ladder.set(key, { text: entry.text, px: [], ratioEffective: [] });
    ladder.get(key).px.push(entry.px);
    ladder.get(key).ratioEffective.push(entry.ratioEffective);
  }
const census = [...ladder.entries()].map(([element, bucket]) => ({
  element,
  text: bucket.text,
  px: bucket.px,
  ratioEffective: bucket.ratioEffective,
  steps: bucket.px.length,
  monotonic:
    bucket.px.length === 4 && bucket.px.every((value, index) => index === 0 || value >= bucket.px[index - 1]),
}));
const failRows = census.filter((row) => !row.monotonic);
const priceAt2 = steps[3].priceAmber.length ? steps[3].priceAmber : steps[3].pricePlain;

const report = {
  ticket: "UI-004 g2 addendum (A 2.0 step + per-chip heights, Issue #30 before-state)",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/19",
  alsoServes: "https://github.com/darkmatter2222/Rustwake/issues/30",
  headSha: "26e2d2df4a8a9153ef5b337365192a9877a3e025",
  window: "W-3 (390x844 dpr2, isMobile + hasTouch, fresh storage, 12 taps at 1/s, A pressed 3x)",
  url,
  columns: STEP_LABELS,
  census,
  nonMonotonic: failRows.map((row) => ({ element: row.element, px: row.px })),
  chipHeightsByStep: steps.map((step) => ({
    label: step.label,
    rootFontPx: step.rootFontPx,
    chips: step.chips.map((chip) => ({
      text: chip.text,
      heightPx: chip.heightPx,
      widthPx: chip.widthPx,
      topPx: chip.topPx,
      px: chip.px,
      lineHeight: chip.lineHeight,
      scrollHeightPx: chip.scrollHeightPx,
      clientHeightPx: chip.clientHeightPx,
      runs: chip.runs,
    })),
    distinctChipHeightsPx: [...new Set(step.chips.map((chip) => chip.heightPx))],
  })),
  a2Step: {
    label: steps[3].label,
    textScaleProperty: steps[3].textScaleProperty,
    textLarge: steps[3].textLarge,
    rootFontPx: steps[3].rootFontPx,
    price: priceAt2,
    chips: steps[3].chips,
    cardFillPct: steps[3].cardFillPct,
    minTargetPx: steps[3].targets.length ? Math.min(...steps[3].targets.map((t) => Math.min(t.h, t.w))) : null,
    targets: steps[3].targets,
    noPageScroll:
      steps[3].pageScroll.scrollHeight === steps[3].pageScroll.innerHeight &&
      steps[3].pageScroll.scrollWidth === steps[3].pageScroll.innerWidth,
    pageScroll: steps[3].pageScroll,
    clipped: steps[3].rows.filter((row) => row.clipped).map((row) => `${row.label} #${row.index}`),
    still: `${CAPTURES}ladder-A2-390x844-dpr2.png`,
  },
  allSteps: steps.map((step) => ({
    label: step.label,
    scale: step.scale,
    textLarge: step.textLarge,
    rootFontPx: step.rootFontPx,
    cardFillPct: step.cardFillPct,
    minTargetPx: step.targets.length ? Math.min(...step.targets.map((t) => Math.min(t.h, t.w))) : null,
    noPageScroll:
      step.pageScroll.scrollHeight === step.pageScroll.innerHeight &&
      step.pageScroll.scrollWidth === step.pageScroll.innerWidth,
    pricePx: (step.priceAmber.length ? step.priceAmber : step.pricePlain).map((row) => row.px),
    priceRatioEffective: (step.priceAmber.length ? step.priceAmber : step.pricePlain).map((row) => row.ratioEffective),
    chipHeightsPx: step.chips.map((chip) => chip.heightPx),
  })),
  pageErrors,
};
writeFileSync(`${OUT}ladder-A2.0.json`, JSON.stringify(report, null, 1), "utf8");

console.log(`steps ${JSON.stringify(steps.map((s) => [s.label, s.scale, s.textLarge, s.rootFontPx]))}`);
console.log(`\nprice string per step (plain + amber):`);
for (const step of report.allSteps)
  console.log(
    `  ${step.label.padEnd(7)} px ${JSON.stringify(step.pricePx).padEnd(12)} effective ${JSON.stringify(step.priceRatioEffective).padEnd(14)}` +
      ` card fill ${step.cardFillPct} % (cap 42 %) min tap ${step.minTargetPx} px no page scroll ${step.noPageScroll}`
  );
console.log(`\nper-chip heights (Issue #30 before-state):`);
for (const step of report.chipHeightsByStep) {
  console.log(
    `  [${step.label}] root font ${step.rootFontPx}px distinct heights ${JSON.stringify(step.distinctChipHeightsPx)}`
  );
  for (const chip of step.chips)
    console.log(
      `    "${chip.text}" h ${String(chip.heightPx).padEnd(7)} w ${String(chip.widthPx).padEnd(7)} top ${String(chip.topPx).padEnd(6)}` +
        ` px ${String(chip.px).padEnd(6)} leading ${String(chip.lineHeight).padEnd(7)} scroll/client ${chip.scrollHeightPx}/${chip.clientHeightPx}` +
        ` runs ${JSON.stringify(chip.runs.map((run) => `${run.text}:${run.heightPx}x${run.widthPx}@${run.topPx}`))}`
    );
}
console.log(`\nA 2.0 price rows ${JSON.stringify(report.a2Step.price)}`);
console.log(`non-decreasing ladder violations at four steps: ${failRows.length}${failRows.length ? ": " + JSON.stringify(failRows) : ""}`);
console.log(`pageerrors ${pageErrors.length}`);
