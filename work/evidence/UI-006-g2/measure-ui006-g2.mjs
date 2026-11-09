// UI-006 g2: the chip row at 390 px - per-chip box heights before/after the label-value space
// and nowrap fix (Issue #30).
//
// Same W-3 window and the same contrast method as `../UI-004-g2/measure-ui004-g2-a2.mjs`, so the
// two tables are comparable: 390x844, dpr 2, isMobile + hasTouch, fresh storage, 12 taps at 1/s on
// the accent-filled primary, then the `A` control three times -> 1 -> 1.25 -> 1.5 -> 2.
//
// Per step it prints
//   - every `.resources__item` chip and every `.cluster .icon-btn`: box height/width, top, px,
//     leading, scroll/client height, line-box count and its ink runs (label / value);
//   - the distinct box heights of the row (the "equal chip heights" acceptance line);
//   - the witness set: clipped false, min tap target >= 44 px, scrollHeight == innerHeight,
//     .objective share of .hud <= 42 %, pageerror count.
//
// Run (from the worktree root, after `npm run build` and `npx vite preview --port 4191`):
//   UI006_TAG=before RUSTWAKE_URL=http://localhost:4191/ npx tsx work/evidence/UI-006-g2/measure-ui006-g2.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const OUT = "work/evidence/UI-006-g2/";
const CAPTURES = OUT + "captures/";
const TAG = process.env.UI006_TAG ?? "before";
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

/** The two chip families Issue #30 says must come out one line box tall and equal. */
const CHIP_SELECTORS = [
  [".resources__item", "resource chip"],
  [".cluster .icon-btn", "cluster chip"],
];

const CHIP_READ = (selectors) => {
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
    // Ink runs of the chip's own child nodes: one rect per line box, so `rows` answers "does
    // this chip take two line boxes" and `gaps` answers "is there a visible space between the
    // label and the value" (0 px = butted, 4 px = the chip's own flex gap).
    const inkRuns = [];
    for (const child of Array.from(node.childNodes)) {
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (child.nodeType === 3) {
        const range = document.createRange();
        range.selectNode(child);
        for (const rect of Array.from(range.getClientRects()))
          inkRuns.push({
            kind: "text",
            text,
            left: round(rect.left),
            right: round(rect.right),
            top: round(rect.top),
            heightPx: round(rect.height),
          });
      } else {
        const rect = child.getBoundingClientRect();
        inkRuns.push({
          kind: child.tagName.toLowerCase(),
          text,
          left: round(rect.left),
          right: round(rect.right),
          top: round(rect.top),
          heightPx: round(rect.height),
        });
      }
    }
    inkRuns.sort((a, b) => a.top - b.top || a.left - b.left);
    const rows = inkRuns.reduce((groups, run, index) => {
      if (index === 0) return 1;
      const previous = inkRuns[index - 1];
      return groups + (Math.abs(run.top - previous.top) > 3 ? 1 : 0);
    }, 0);
    const gaps = [];
    for (let index = 1; index < inkRuns.length; index += 1)
      if (Math.abs(inkRuns[index].top - inkRuns[index - 1].top) <= 3)
        gaps.push(round(inkRuns[index].left - inkRuns[index - 1].right));
    const lineHeightPx = parseFloat(style.lineHeight) || parseFloat(style.fontSize) || 0;
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
      lineHeightPx: round(lineHeightPx),
      scrollHeightPx: node.scrollHeight,
      clientHeightPx: node.clientHeight,
      rows,
      gaps,
      inkRuns,
      clipped: node.scrollWidth > Math.ceil(rect.width) + 0.5,
      // The ink runs inside a chip: label and value are separate flex items when the value is
      // wrapped in an element, one anonymous text item when it is a bare text node.
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
  const groups = selectors.map(([selector, label]) => ({
    label,
    selector,
    chips: Array.from(document.querySelectorAll(selector)).map((node) => measure(node)),
  }));
  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  const root = document.documentElement;
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    rootFontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    textScaleProperty: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    textLarge: root.classList.contains("text-large"),
    groups,
    cardFillPct: card && hud ? round((card.getBoundingClientRect().height / hud.clientHeight) * 1000) / 10 : null,
    targets: Array.from(document.querySelectorAll(".dock .dock__btn, .hud .icon-btn")).map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
        h: round(rect.height),
        w: round(rect.width),
      };
    }),
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
  const measured = await page.evaluate(CHIP_READ, CHIP_SELECTORS);
  steps.push({ label: STEP_LABELS[i], scale: measured.textScaleProperty, ...measured });
  await page.screenshot({ path: `${CAPTURES}${TAG}-${STEP_LABELS[i].replace(/ /g, "")}-390x844-dpr2.png` });
}
await browser.close();

const rowHeights = (step, label) => {
  const group = step.groups.find((entry) => entry.label === label);
  return group ? group.chips.map((chip) => chip.heightPx) : [];
};
const report = {
  ticket: "UI-006 g2 (chip label-value space + equal chip heights at 390 px)",
  issue: "https://github.com/darkmatter2222/Rustwake/issues/30",
  baseline: "work/evidence/UI-004-g2/ladder-A2.0.json",
  tag: TAG,
  window: "W-3 (390x844 dpr2, isMobile + hasTouch, fresh storage, 12 taps at 1/s, A pressed 3x)",
  url,
  columns: STEP_LABELS,
  steps: steps.map((step) => ({
    label: step.label,
    scale: step.scale,
    textLarge: step.textLarge,
    rootFontPx: step.rootFontPx,
    groups: step.groups.map((group) => ({
      label: group.label,
      heightsPx: group.chips.map((chip) => chip.heightPx),
      distinctHeightsPx: [...new Set(group.chips.map((chip) => chip.heightPx))],
      rows: group.chips.map((chip) => chip.rows),
      labelValueGapPx: group.chips.map((chip) => (chip.gaps.length ? chip.gaps[0] : null)),
      chips: group.chips,
    })),
    // Witness set (same reading the UI-004 g2 ladder prints).
    cardFillPct: step.cardFillPct,
    minTargetPx: step.targets.length ? Math.min(...step.targets.map((t) => Math.min(t.h, t.w))) : null,
    noPageScroll:
      step.pageScroll.scrollHeight === step.pageScroll.innerHeight &&
      step.pageScroll.scrollWidth === step.pageScroll.innerWidth,
    pageScroll: step.pageScroll,
    clipped: [...step.groups.flatMap((g) => g.chips)].filter((chip) => chip.clipped).map((chip) => chip.text),
    still: `${CAPTURES}${TAG}-${step.label.replace(/ /g, "")}-390x844-dpr2.png`,
  })),
  pageErrors,
};
writeFileSync(`${OUT}ladder-${TAG}.json`, JSON.stringify(report, null, 1), "utf8");

console.log(`[${TAG}] steps ${JSON.stringify(steps.map((s) => [s.label, s.scale, s.textLarge, s.rootFontPx]))}`);
for (const step of report.steps) {
  console.log(`\n[${TAG}] ${step.label} (root font ${step.rootFontPx}px) - per-chip boxes:`);
  for (const group of step.groups) {
    console.log(
      `  ${group.label}: heights ${JSON.stringify(group.heightsPx)} distinct ${JSON.stringify(group.distinctHeightsPx)}` +
        ` rows ${JSON.stringify(group.rows)} label-value gap px ${JSON.stringify(group.labelValueGapPx)}`
    );
    for (const chip of group.chips)
      console.log(
        `    "${chip.text}" h ${String(chip.heightPx).padEnd(7)} w ${String(chip.widthPx).padEnd(7)} top ${String(chip.topPx).padEnd(6)}` +
          ` px ${String(chip.px).padEnd(6)} leading ${String(chip.lineHeight).padEnd(9)} scroll/client ${chip.scrollHeightPx}/${chip.clientHeightPx}` +
          ` rows ${String(chip.rows).padEnd(2)} gaps ${String(JSON.stringify(chip.gaps)).padEnd(9)}` +
          ` runs ${JSON.stringify(chip.runs.map((run) => `${run.text}:${run.heightPx}x${run.widthPx}@${run.topPx}`))}`
      );
  }
  console.log(
    `  witnesses: clipped ${JSON.stringify(step.clipped)} min tap ${step.minTargetPx} px` +
      ` no page scroll ${step.noPageScroll} (${step.pageScroll.scrollHeight}/${step.pageScroll.innerHeight})` +
      ` .objective/.hud ${step.cardFillPct} % (cap 42 %)`
  );
}
console.log(`\n[${TAG}] chip row heights per step (resource chips | cluster chips), rows and label-value gap:`);
for (const step of report.steps) {
  const resource = step.groups.find((g) => g.label === "resource chip");
  const cluster = step.groups.find((g) => g.label === "cluster chip");
  console.log(
    `  ${step.label.padEnd(7)} res ${JSON.stringify(resource.heightsPx).padEnd(22)} rows ${JSON.stringify(resource.rows).padEnd(11)}` +
      ` gap ${JSON.stringify(resource.labelValueGapPx).padEnd(12)} | cls ${JSON.stringify(cluster.heightsPx).padEnd(20)}` +
      ` rows ${JSON.stringify(cluster.rows)} gap ${JSON.stringify(cluster.labelValueGapPx)}`
  );
}
console.log(`[${TAG}] pageerrors ${pageErrors.length}${pageErrors.length ? ": " + JSON.stringify(pageErrors) : ""}`);
