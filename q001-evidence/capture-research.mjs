// Q-001 focused capture: the research panel only, at the phone sizes and text
// scales the task names, against the same seeded mature yard every time.
// The full `scripts/capture.mjs` gallery takes ~17 min; this one takes seconds.
//
// Usage: node q001-evidence/capture-research.mjs <outDir> <label>
//        RUSTWAKE_URL=http://localhost:4183/ node q001-evidence/capture-research.mjs ...
//
// What each case records, all read from a real headless browser:
//  * the document's scrollWidth/scrollHeight against the visual viewport (no page
//    scroll gate, spec 25.1) and the panel body's own contained scroll;
//  * one row per painted text block in the panel body: text, x, width, and the
//    number of line boxes a Range over that element produces. A one-word column
//    shows up as a block whose width is a small fraction of the card while its
//    line count is large;
//  * every buy/known/disabled state with its box, its disabled flag, and whether
//    it lands inside the panel's visible area once scrolled to.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, process.argv[2] ?? "q001-evidence");
const label = process.argv[3] ?? "run";
mkdirSync(outDir, { recursive: true });

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((path) => existsSync(path));

const VIEWPORTS = [
  { name: "phone-360x640", width: 360, height: 640 },
  { name: "phone-390x844", width: 390, height: 844 },
  { name: "phone-412x915", width: 412, height: 915 },
  { name: "landscape-844x390", width: 844, height: 390 },
];
const SCALES = [1, 1.5, 2];

/** The three node states must all be visible in one frame. */
const RESEARCH_SETS = [
  { name: "all-known", research: { cutters: 1, buffers: 1, dispatch: 1 }, data: 76 },
  { name: "mixed", research: { cutters: 1 }, data: 20 }, // known + buyable + prereq-locked
  { name: "fresh", research: {}, data: 2 }, // nothing bought, costs shown
];

/** Same FNV-1a the app uses, so a rewritten envelope still verifies (D-11). */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const template = JSON.parse(readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"));

/** Mature yard, requested text scale and research ranks, re-checksummed. */
function seedFor(scale, research, data) {
  const envelope = JSON.parse(JSON.stringify(template));
  envelope.payload.settings = { ...(envelope.payload.settings ?? {}), textScale: scale };
  envelope.payload.sim.research = research;
  envelope.payload.sim.store.data = data;
  const text = JSON.stringify(envelope.payload);
  return JSON.stringify({ ...envelope, checksum: fnv1a(text) });
}

/** In-page read of the research panel. Runs in the browser. */
const readPanel = () => {
  const round = (n) => Math.round(n * 10) / 10;
  const panel = document.querySelector(".panel");
  if (!panel) return null;
  const body = panel.querySelector(".panel__body") ?? panel;
  const bodyBox = body.getBoundingClientRect();
  const lineBoxes = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    // One rect per line box per fragment, so count distinct baselines.
    const ys = new Set(
      [...range.getClientRects()]
        .filter((r) => r.width > 0.5)
        .map((r) => Math.round(r.y))
    );
    return ys.size;
  };
  const textBlocks = [];
  for (const node of body.querySelectorAll("dt,dd,p,h3,.node__name,.node__state,.node__cost")) {
    const text = (node.textContent ?? "").trim();
    if (!text) continue;
    const box = node.getBoundingClientRect();
    textBlocks.push({
      text: text.slice(0, 46),
      x: round(box.x),
      w: round(box.width),
      lines: lineBoxes(node),
      // Horizontal clipping inside the element itself.
      clip: node.scrollWidth - node.clientWidth,
    });
  }
  const buttons = [...body.querySelectorAll("button")].map((node) => {
    const box = node.getBoundingClientRect();
    return {
      text: (node.textContent ?? "").trim(),
      disabled: node.disabled === true,
      x: round(box.x),
      y: round(box.y),
      w: round(box.width),
      h: round(box.height),
      insideViewport:
        box.top >= -0.5 && box.bottom <= innerHeight + 0.5 && box.left >= -0.5 && box.right <= innerWidth + 0.5,
      insideBody: box.bottom <= bodyBox.bottom + 0.5 && box.top >= bodyBox.top - 0.5,
    };
  });
  const cards = [...body.querySelectorAll(".node")].map((node) => {
    const box = node.getBoundingClientRect();
    return {
      state: node.getAttribute("data-state") ?? "",
      x: round(box.x),
      w: round(box.width),
      h: round(box.height),
    };
  });
  const panelBox = panel.getBoundingClientRect();
  const root = document.documentElement;
  return {
    ariaLabel: panel.getAttribute("aria-label") ?? "",
    text: panel.textContent ?? "",
    panel: { top: round(panelBox.top), bottom: round(panelBox.bottom), height: round(panelBox.height) },
    body: {
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      containedScroll: body.scrollHeight - body.clientHeight,
      contentWidth: round(bodyBox.width),
    },
    doc: {
      visualWidth: Math.round(window.visualViewport?.width ?? innerWidth),
      visualHeight: Math.round(window.visualViewport?.height ?? innerHeight),
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
    },
    fontPx: round(parseFloat(getComputedStyle(document.body).fontSize)),
    cards,
    buttons,
    textBlocks,
    // The narrowest painted text block is the one-word-column signal.
    narrowest: textBlocks.reduce(
      (best, row) => (best === null || row.w < best.w ? row : best),
      null
    ),
    tallest: textBlocks.reduce(
      (best, row) => (best === null || row.lines > best.lines ? row : best),
      null
    ),
  };
};

const clickByLabel = async (page, selector, label) => {
  const handle = await page.evaluateHandle(
    ([css, text]) =>
      [...document.querySelectorAll(css)].find((node) =>
        (node.textContent ?? "").trim().startsWith(text)
      ),
    [selector, label]
  );
  const element = handle.asElement();
  if (!element) return false;
  await element.click();
  await page.waitForTimeout(180);
  return true;
};

/**
 * Dock targets are matched by exact label, like `scripts/capture.mjs` does: the
 * primary action can read "Research Smart Buffers · 8 Data", and a startsWith
 * probe would tap that ladder step instead of the Research panel.
 */
const clickDock = async (page, label) => {
  const handle = await page.evaluateHandle(
    (text) => {
      const targets = [...document.querySelectorAll(".dock__btn:not(.dock__btn--primary)")];
      return targets.find((node) => (node.textContent ?? "").trim() === text) ?? null;
    },
    label
  );
  const element = handle.asElement();
  if (!element) return false;
  await element.click();
  await page.waitForTimeout(180);
  return true;
};

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const results = [];
  try {
    for (const scale of SCALES) {
      for (const size of VIEWPORTS) {
        for (const set of RESEARCH_SETS) {
          const context = await browser.newContext({
            viewport: { width: size.width, height: size.height },
            deviceScaleFactor: size.width > 500 ? 1 : 2,
            isMobile: true,
            hasTouch: true,
          });
          const seed = seedFor(scale, set.research, set.data);
          await context.addInitScript((text) => {
            localStorage.setItem("rustwake.save.v1", text);
          }, seed);
          const page = await context.newPage();
          await page.goto(url, { waitUntil: "networkidle" });
          await page.waitForSelector("text=Begin recovery");
          await page.click("text=Begin recovery");
          await page.waitForTimeout(300);
          await clickByLabel(page, "button", "Back to yard"); // the seed's gap opens a report
          if (!(await clickDock(page, "Research"))) {
            throw new Error(`research target missing at ${size.name} s${scale}`);
          }
          await page.waitForTimeout(150);
          const file = `research-${label}-${size.name}-s${scale}-${set.name}.png`;
          await page.screenshot({ path: resolve(outDir, file) });
          let measured = null;
          for (let attempt = 0; attempt < 4 && measured === null; attempt += 1) {
            measured = await page.evaluate(readPanel);
            if (measured === null) await page.waitForTimeout(200);
          }
          if (measured === null) console.log(`no panel: ${size.name} s${scale} ${set.name}`);

          // Contained-scroll proof: the panel body is the one deliberate scroller
          // (spec 25.1 keeps the document flat), so every action must still reach
          // the visible area once it is scrolled to. `measured.buttons` is read at
          // scrollTop 0; `reachable` is read at the bottom of that list.
          let reachable = null;
          if (measured !== null && measured.body.containedScroll > 0) {
            reachable = await page.evaluate(() => {
              const body = document.querySelector(".panel .panel__body");
              if (!body) return null;
              const rows = [...document.querySelectorAll(".panel button")].map((node) => {
                node.scrollIntoView({ block: "center" });
                const box = node.getBoundingClientRect();
                const area = body.getBoundingClientRect();
                return {
                  text: (node.textContent ?? "").trim(),
                  y: Math.round(box.y * 10) / 10,
                  h: Math.round(box.height * 10) / 10,
                  scrollTop: Math.round(body.scrollTop),
                  insideViewport:
                    box.top >= -0.5 &&
                    box.bottom <= innerHeight + 0.5 &&
                    box.left >= -0.5 &&
                    box.right <= innerWidth + 0.5,
                  insideBody:
                    box.top >= area.top - 1 &&
                    box.bottom <= area.bottom + 1 &&
                    box.left >= area.left - 1 &&
                    box.right <= area.right + 1,
                };
              });
              body.scrollTop = body.scrollHeight;
              return { maxScroll: body.scrollHeight - body.clientHeight, rows };
            });
            if (size.name === "phone-360x640" && scale === 2) {
              await page.screenshot({
                path: resolve(outDir, `research-${label}-${size.name}-s${scale}-${set.name}-scrolled.png`),
              });
            }
          }

          // One real purchase sequence in the mixed set at the middle size: the
          // engine, not a fixture, must move the rank and the data balance, and
          // the three card states must change as it does. The known card has no
          // target at all, so a repeat tap cannot double-charge it.
          let purchase = null;
          if (set.name === "mixed" && size.name === "phone-390x844" && scale === 1) {
            const snapshot = () =>
              page.evaluate(() => {
                const sim = JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim;
                const targets = [...document.querySelectorAll(".panel button")].map((node) => ({
                  text: (node.textContent ?? "").trim(),
                  disabled: node.disabled === true,
                }));
                return {
                  research: sim.research,
                  data: sim.store.data,
                  disabled: targets.filter((b) => b.disabled).map((b) => b.text),
                  enabled: targets.filter((b) => !b.disabled).map((b) => b.text),
                  states: [...document.querySelectorAll(".panel .node")].map(
                    (node) => `${node.dataset.node}=${node.dataset.state}`
                  ),
                  panelText: (document.querySelector(".panel")?.textContent ?? "").slice(0, 320),
                };
              });
            const tapEnabled = async (text) => {
              const handle = await page.evaluateHandle(
                (wanted) =>
                  [...document.querySelectorAll(".panel button")].find(
                    (node) => !node.disabled && (node.textContent ?? "").trim() === wanted
                  ),
                text
              );
              const element = handle.asElement();
              if (!element) return false;
              await element.click();
              await page.waitForTimeout(140);
              return true;
            };
            const frames = [{ at: "opened", ...(await snapshot()) }];
            const first = await tapEnabled("Buy · 8 Data");
            frames.push({ at: "after Buy · 8 Data", tapped: first, ...(await snapshot()) });
            const second = await tapEnabled("Buy · 12 Data");
            frames.push({ at: "after Buy · 12 Data", tapped: second, ...(await snapshot()) });
            const third = await tapEnabled("Buy · 8 Data"); // card is Known now: no target
            frames.push({ at: "after retap Buy · 8 Data", tapped: third, ...(await snapshot()) });
            purchase = { frames, dataCostNote: "costs: buffers 8, dispatch 12" };
            await page.screenshot({
              path: resolve(outDir, `research-${label}-${size.name}-s${scale}-after-buy.png`),
            });
          }

          results.push({
            scale,
            viewport: size.name,
            set: set.name,
            file,
            measured,
            reachable,
            purchase,
          });
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const summary = results
    .filter((row) => row.measured !== null)
    .map((row) => {
      const m = row.measured;
      const flat = m.doc.scrollWidth <= m.doc.visualWidth && m.doc.scrollHeight <= m.doc.visualHeight;
      const minTarget = m.buttons.reduce((min, b) => Math.min(min, b.w, b.h), 999);
      return {
        scale: row.scale,
        viewport: row.viewport,
        set: row.set,
        png: row.file,
        fontPx: m.fontPx,
        panelHeight: m.panel.height,
        containedScroll: m.body.containedScroll,
        docScroll: `${m.doc.scrollWidth}x${m.doc.scrollHeight} vs ${m.doc.visualWidth}x${m.doc.visualHeight}`,
        noDocScroll: flat,
        cards: m.cards.length,
        cardWidths: m.cards.map((c) => `${c.state}:${c.w}@x${c.x}`),
        bodyWidth: m.body.contentWidth,
        narrowestBlock: m.narrowest ? `${m.narrowest.w}px / ${m.narrowest.lines} lines "${m.narrowest.text}"` : "-",
        tallestBlock: m.tallest ? `${m.tallest.w}px / ${m.tallest.lines} lines "${m.tallest.text}"` : "-",
        clippedText: m.textBlocks.filter((b) => b.clip > 1).map((b) => `${b.text} +${b.clip}`),
        buttons: m.buttons.map((b) => `${b.text}${b.disabled ? " [disabled]" : ""} ${b.w}x${b.h}${b.insideViewport ? "" : " OUTSIDE"}`),
        minTarget: Math.round(minTarget * 10) / 10,
        blocks: m.textBlocks,
        reachable: row.reachable,
        purchase: row.purchase,
      };
    });
  const missing = results
    .filter((row) => row.measured === null)
    .map((row) => `${row.viewport} s${row.scale} ${row.set}`);
  writeFileSync(
    resolve(outDir, `research-${label}.json`),
    JSON.stringify({ summary, missingPanels: missing }, null, 2),
    "utf8"
  );
  if (missing.length) console.log(`cases without a panel: ${missing.join(", ")}`);
  for (const row of summary) {
    console.log(
      `s${row.scale} ${row.viewport} [${row.set}] font ${row.fontPx}px panel ${row.panelHeight}px` +
        ` containedScroll ${row.containedScroll}px doc ${row.docScroll} flat=${row.noDocScroll}` +
        ` cards ${row.cards} bodyW ${row.bodyWidth} narrowest[${row.narrowestBlock}] tallest[${row.tallestBlock}]` +
        ` clipped[${row.clippedText.join("|") || "none"}] targets[${row.buttons.join(" ; ") || "none"}] min ${row.minTarget}`
    );
    if (row.purchase) {
      console.log(`  purchase sequence (${row.purchase.dataCostNote}):`);
      for (const frame of row.purchase.frames) {
        console.log(
          `    ${frame.at}: tapped=${frame.tapped ?? "-"} research ${JSON.stringify(frame.research)}` +
            ` data ${frame.data} states [${frame.states.join(" ")}]` +
            ` disabled [${frame.disabled.join(", ") || "none"}] enabled [${frame.enabled.join(", ") || "none"}]`
        );
      }
      console.log(`    final panel text: ${row.purchase.frames[row.purchase.frames.length - 1].panelText}`);
    }
  }
  console.log(`wrote ${outDir.replace(/\\/g, "/")}/research-${label}.json + pngs (${summary.length} cases)`);
};

await run();
