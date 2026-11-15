// UI-004 g1 / U03: the dock legibility census across the canonical eight viewports and the
// four text scales, for the G1 first-playable gate (#151).
//
// Same instrument the player lane used (`work/feedback/PLAYER-004-g1/legibility.mjs`, copied
// into this folder's `legibility.mjs` and extended here): `getComputedStyle` for the px, WCAG
// relative luminance of the *resolved* colours for the ratio, alpha dropped from the
// background colour exactly as that instrument does, so the numbers stay comparable to the
// recorded baseline (`.dock__cost` 10.8 / 13.5 / 11.25 px at 2.67:1, amber face label
// 13.2 / 16.5 / 13.95 px at 3.31:1).
//
// Pass 8 extends the single 390x844 dpr2 / three-step window to the U03 census:
//   * the eight canonical viewports (ACCEPTANCE.md U03, mirrored from the established
//     UI-RESET-49 shell census): phones/tablet/landscape carry touch + device pixels (dpr 2),
//     desktops are 1x. The list is reused, not invented.
//   * four text scales [1, 1.25, 1.5, 2] — the app's `cycleTextScale` ladder (App.tsx). 200%
//     is the fourth step; `text-large` is active at >= 1.5. The 2.0 px column is read from the
//     running build via getComputedStyle, never extrapolated.
//
// Two extra columns on purpose:
//   ratioComposited - the same ratio with the background alpha and the accent gradient painted
//                     over `--night-deep`, i.e. the ink the eye actually meets;
//   monotonic       - px non-decreasing across all four scales (1 <= 1.25 <= 1.5 <= 2).
//
// Floors are unchanged: dock price >= 12 px, AA ratio >= 4.5, tap target >= 44 px, card fill
// <= 42 %. A failing 2.0 floor is recorded as a real defect, never lowered. U03 also owes no
// document scroll, no clipped core action and no sub-44 px target at any viewport/scale.
//
// W-3 cadence per viewport: fresh storage, one tap per second on the accent-filled primary,
// then the `A` control three times (1 -> 1.25 -> 1.5 -> 2).
//
// Run:
//   npm run build
//   npx vite preview --port 4173            (background)
//   npx tsx scripts/measure-legibility.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

/** Bind every artifact to the head the census actually runs against (never a stale guess). */
const headSha = () => {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
};

// ---- served-bundle identity assertion (pass-14 provenance gap; mirrors chrm002-probe.mjs) ----
// The census `baseSha` comes from git, NOT from the served bundle, so a stale or foreign preview
// (e.g. another worktree holding the port) could be measured silently — the pass-9 :4173 invalid
// run. Assert the preview actually serves THIS worktree's dist entry: fetch served index.html ->
// resolve its entry chunk ref -> fetch that chunk -> sha256 + bytes == the on-disk dist asset.
// Abort on mismatch. This STRENGTHENS the gate (it can only invalidate a run, never relax a floor).
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const servedIndexHtml = await (await fetch(url)).text();
const servedEntryRef = (servedIndexHtml.match(/assets\/index-[^"']+\.js/) ?? [null])[0];
if (!servedEntryRef) throw new Error(`no entry chunk ref in served index.html at ${url}`);
const servedEntry = Buffer.from(await (await fetch(url + servedEntryRef)).arrayBuffer());
const diskEntry = readFileSync("dist/" + servedEntryRef);
const servedBundleProvenance = {
  url,
  servedEntryRef,
  servedEntrySha256: sha256(servedEntry),
  diskEntrySha256: sha256(diskEntry),
  servedEntryBytes: servedEntry.length,
  diskEntryBytes: diskEntry.length,
  identical: servedEntry.equals(diskEntry),
};
if (!servedBundleProvenance.identical) {
  throw new Error(`served entry != dist entry — wrong worktree? ${JSON.stringify(servedBundleProvenance)}`);
}
console.log(
  "census provenance OK",
  servedEntryRef,
  servedBundleProvenance.servedEntryBytes,
  "B sha",
  servedBundleProvenance.servedEntrySha256.slice(0, 12),
);

/**
 * The canonical U03 viewports (ACCEPTANCE.md U03), dpr convention mirrored from the
 * established UI-RESET-49 shell census: phones/tablet/landscape touch + dpr 2, desktops 1x.
 * Reused verbatim — not invented.
 */
const VIEWPORTS = [
  { name: "phone360", w: 360, h: 640, dpr: 2, mobile: true },
  { name: "phone390", w: 390, h: 844, dpr: 2, mobile: true },
  { name: "phone412", w: 412, h: 915, dpr: 2, mobile: true },
  { name: "land844", w: 844, h: 390, dpr: 2, mobile: true },
  { name: "tablet768", w: 768, h: 1024, dpr: 2, mobile: true },
  { name: "desk1366", w: 1366, h: 768, dpr: 1, mobile: false },
  { name: "desk1920", w: 1920, h: 1080, dpr: 1, mobile: false },
  { name: "desk2560", w: 2560, h: 1440, dpr: 1, mobile: false },
];

/** The app's text-scale ladder (App.tsx cycleTextScale); 200% is the fourth step. */
const TEXT_SCALES = [1, 1.25, 1.5, 2];
const stepLabels = ["A 1", "A 1.25", "A 1.5", "A 2"];

/** Floors are authoritative and unchanged. A failure is a defect to record, not a bar to lower. */
const FLOORS = { dockCostPx: 12, aaRatio: 4.5, tapTargetPx: 44, cardFillPct: 42 };

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
  // G1 #151 pass 10 (U03-3): the 44 px touch floor applies to RENDERED controls.
  // `.cluster .icon-btn:last-child` (Home) is display:none at every width by
  // design (styles.css) — it is not a target the player can see or tap, and
  // counting its 0x0 box dragged minTargetPx to 0 and failed the floor on every
  // cell. That was an instrument defect, not a UI defect. Exclude non-rendered
  // controls (display:none, visibility:hidden, or a zero-area box) from the
  // target list; every RENDERED target still faces the unchanged 44 px floor.
  // The excluded entries are recorded as hiddenTargets so the witness stays
  // auditable (an exclusion can never silently hide a rendered small target).
  const targets = [];
  const hiddenTargets = [];
  for (const node of Array.from(document.querySelectorAll(".dock .dock__btn, .hud .icon-btn"))) {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const entry = {
      text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30),
      h: round(rect.height),
      w: round(rect.width),
    };
    if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) {
      hiddenTargets.push(entry);
    } else {
      targets.push(entry);
    }
  }
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    dpr: window.devicePixelRatio,
    rootFontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    textScaleProperty: getComputedStyle(root).getPropertyValue("--text-scale").trim(),
    textLarge: root.classList.contains("text-large"),
    rows,
    targets,
    hiddenTargets,
    cardFillPct: card && hud ? round((card.getBoundingClientRect().height / hud.clientHeight) * 1000) / 10 : null,
    pageScroll: {
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
  };
};

/** U03 core action geometry: the accent-filled primary must be whole and inside the viewport. */
const readCoreAction = () => {
  const round = (n) => Math.round(n * 100) / 100;
  const node = document.querySelector(".dock__btn--primary");
  if (!node) return { present: false };
  const r = node.getBoundingClientRect();
  return {
    present: true,
    x: round(r.x),
    y: round(r.y),
    w: round(r.width),
    h: round(r.height),
    right: round(r.right),
    bottom: round(r.bottom),
    withinViewport:
      r.x >= -0.5 && r.y >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5,
    clipped: node.scrollWidth > Math.ceil(r.width) + 0.5 || node.scrollHeight > Math.ceil(r.height) + 0.5,
  };
};

mkdirSync(CAPTURES, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });

/** Capture one viewport across the four text scales: fresh storage, W-3 cadence, A ladder. */
const captureViewport = async (vp) => {
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
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
  const steps = [];
  for (let i = 0; i < stepLabels.length; i += 1) {
    if (i > 0) {
      const button = page.locator(".hud .icon-btn", { hasText: "A " });
      if ((await button.count()) > 0) await button.first().click({ force: true });
      await page.waitForTimeout(350);
    }
    const measured = await page.evaluate(readCensus, ELEMENTS);
    const coreAction = await page.evaluate(readCoreAction);
    steps.push({ label: stepLabels[i], scale: measured.textScaleProperty, coreAction, ...measured });
    await page.screenshot({
      path: `${CAPTURES}legibility-${vp.name}-${vp.w}x${vp.h}-dpr${vp.dpr}-${stepLabels[i].replace(/ /g, "")}.png`,
    });
  }
  await context.close();
  return { ...vp, steps, pageErrors };
};

const captured = [];
for (const vp of VIEWPORTS) captured.push(await captureViewport(vp));
await browser.close();

// ------------------------------------------------------------------ monotonicity column
/** Per-viewport census + witnesses over the four-scale ladder. */
const analyze = (steps) => {
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
      bucket.px.length === TEXT_SCALES.length &&
      bucket.px[1] >= bucket.px[0] &&
      bucket.px[2] >= bucket.px[1] &&
      bucket.px[3] >= bucket.px[2];
    return {
      element,
      text: bucket.text,
      px: bucket.px,
      ratio: bucket.ratio,
      ratioComposited: bucket.ratioComposited,
      monotonic,
      clipped: bucket.clipped.some((value) => value),
      priceFloorPass: element.startsWith("dock price") ? bucket.px.every((px) => px >= FLOORS.dockCostPx) : null,
      aaPass: bucket.ratio.every((value) => value >= FLOORS.aaRatio),
    };
  });
  const witnesses = steps.map((step) => {
    const minTargetPx = step.targets.length ? Math.min(...step.targets.map((t) => Math.min(t.h, t.w))) : null;
    const noPageScroll =
      step.pageScroll.scrollHeight === step.pageScroll.innerHeight &&
      step.pageScroll.scrollWidth === step.pageScroll.innerWidth;
    const core = step.coreAction ?? { present: false };
    const tapTargetPass = minTargetPx !== null && minTargetPx >= FLOORS.tapTargetPx;
    const cardFillPass = step.cardFillPct === null ? true : step.cardFillPct <= FLOORS.cardFillPct;
    const coreActionPass = core.present ? core.withinViewport && !core.clipped : false;
    return {
      label: step.label,
      scale: step.scale,
      textLarge: step.textLarge,
      rootFontPx: step.rootFontPx,
      clipped: step.rows.filter((r) => r.clipped).map((r) => r.label),
      verticalOverflow1pxRows: step.rows
        .filter((r) => r.overflowYpx > 0)
        .map((r) => `${r.label} #${r.index} +${r.overflowYpx}px`),
      minTargetPx,
      tapTargetPass,
      targets: step.targets,
      noPageScroll,
      pageScroll: step.pageScroll,
      cardFillPct: step.cardFillPct,
      cardFillPass,
      coreAction: core,
      coreActionPass,
      // U03: no document scroll, no clipped core action, no sub-44 px target.
      u03Pass: noPageScroll && tapTargetPass && coreActionPass,
    };
  });
  return { census, witnesses };
};

const viewports = captured.map((vp) => {
  const { census, witnesses } = analyze(vp.steps);
  return {
    name: vp.name,
    width: vp.w,
    height: vp.h,
    dpr: vp.dpr,
    mobile: vp.mobile,
    columns: stepLabels,
    census,
    witnesses,
    pageErrors: vp.pageErrors,
    steps: vp.steps,
  };
});

// ------------------------------------------------------------------ defect ledger (record, never lower)
const floorFailures = [];
for (const vp of viewports) {
  for (const row of vp.census) {
    if (row.priceFloorPass === false)
      floorFailures.push({ viewport: vp.name, kind: "dockCostPx", element: row.element, px: row.px, floor: FLOORS.dockCostPx });
    if (row.aaPass === false)
      floorFailures.push({ viewport: vp.name, kind: "aaRatio", element: row.element, ratio: row.ratio, floor: FLOORS.aaRatio });
    if (!row.monotonic)
      floorFailures.push({ viewport: vp.name, kind: "monotonic", element: row.element, px: row.px });
  }
  for (const w of vp.witnesses) {
    if (!w.tapTargetPass)
      floorFailures.push({ viewport: vp.name, scale: w.label, kind: "tapTargetPx", minTargetPx: w.minTargetPx, floor: FLOORS.tapTargetPx });
    if (!w.cardFillPass)
      floorFailures.push({ viewport: vp.name, scale: w.label, kind: "cardFillPct", cardFillPct: w.cardFillPct, cap: FLOORS.cardFillPct });
    if (!w.u03Pass)
      floorFailures.push({
        viewport: vp.name,
        scale: w.label,
        kind: "u03",
        noPageScroll: w.noPageScroll,
        tapTargetPass: w.tapTargetPass,
        coreActionPass: w.coreActionPass,
      });
  }
}
const pageErrors = viewports.flatMap((vp) => vp.pageErrors.map((e) => `${vp.name}: ${e}`));
const u03AllPass = viewports.every((vp) => vp.witnesses.every((w) => w.u03Pass));

const report = {
  ticket: "UI-004 g1 / U03",
  baseSha: headSha(),
  generated: new Date().toISOString(),
  window: "W-3 cadence (1 tap/s, fresh storage) per viewport; A ladder 1 -> 1.25 -> 1.5 -> 2",
  url,
  servedBundleProvenance,
  viewports: VIEWPORTS.map((v) => ({ name: v.name, width: v.w, height: v.h, dpr: v.dpr, mobile: v.mobile })),
  columns: stepLabels,
  textScales: TEXT_SCALES,
  floors: FLOORS,
  limitation:
    "Headless Chromium emulation, numeric/geometric only; not a physical phone (#190). Visual fidelity ACCEPT remains PENDING the sponsor at the live URL.",
  u03AllPass,
  floorFailures,
  pageErrors,
  censusByViewport: viewports,
};
writeFileSync(`${OUT}legibility-census.json`, JSON.stringify(report, null, 1), "utf8");

for (const vp of viewports) {
  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} dpr${vp.dpr} ${vp.mobile ? "mobile" : "desktop"} ===`);
  for (const step of vp.steps)
    console.log(
      `  [${step.label}] --text-scale ${step.textScaleProperty} text-large ${step.textLarge}` +
        ` root font ${step.rootFontPx}px card fill ${step.cardFillPct} % (cap ${FLOORS.cardFillPct} %)`,
    );
  for (const row of vp.census)
    console.log(
      `  ${row.element.padEnd(28)}` +
        ` px ${JSON.stringify(row.px).padEnd(26)} mono ${String(row.monotonic).padEnd(5)}` +
        ` ratio ${JSON.stringify(row.ratio).padEnd(26)}` +
        ` aa ${row.aaPass}${row.priceFloorPass === null ? "" : ` costFloor ${row.priceFloorPass}`}` +
        ` clipped ${row.clipped}`,
    );
  for (const w of vp.witnesses)
    console.log(
      `  [witness ${w.label}] min tap ${w.minTargetPx}px (floor ${FLOORS.tapTargetPx}) ${w.tapTargetPass}` +
        ` | noPageScroll ${w.noPageScroll} | coreAction ${w.coreActionPass} | cardFill ${w.cardFillPct}% ${w.cardFillPass}` +
        ` | U03 ${w.u03Pass} | clipped ${JSON.stringify(w.clipped)}`,
    );
}
console.log(`\nU03 all viewports x scales pass: ${u03AllPass}`);
console.log(`floor failures (${floorFailures.length}):`);
for (const f of floorFailures) console.log(`  ${JSON.stringify(f)}`);
const entry = readdirSync("dist/assets")
  .filter((name) => /^index-.*\.js$/.test(name))
  .map((name) => ({ name, bytes: readFileSync(`dist/assets/${name}`).length }));
console.log(`\nentry chunk ${JSON.stringify(entry)} (ceiling 233000 B)`);
console.log(`pageerrors ${pageErrors.length}${pageErrors.length ? ": " + pageErrors.join(" | ") : ""}`);
console.log(`baseSha ${report.baseSha}`);
