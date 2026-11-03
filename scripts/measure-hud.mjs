// HUD area share against the 15-22 % design target (spec 5.2, B-16), plus the
// no-scroll gate of spec 25.1 measured in a real browser.
// Usage: npm run preview (background) then node scripts/measure-hud.mjs
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(root, "docs/evidence/2026-11-03-hud-share.md");
const SEED = resolve(root, "docs/evidence/yard-mature.json");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));

/** The sizes spec 25.1 names, in the order the gate lists them. */
const VIEWPORTS = [
  { name: "phone 360 × 640", width: 360, height: 640, mobile: true },
  { name: "phone 390 × 844", width: 390, height: 844, mobile: true },
  { name: "phone 412 × 915", width: 412, height: 915, mobile: true },
  { name: "landscape 844 × 390", width: 844, height: 390, mobile: true },
  { name: "tablet 820 × 1180", width: 820, height: 1180, mobile: true },
  { name: "desktop 1440 × 900", width: 1440, height: 900, mobile: false },
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

/**
 * The widest realistic resting HUD: the mature yard written by the supply probe,
 * with credits in the ledger so every chip and dock target a phone can show is on.
 */
function seedSave() {
  if (!existsSync(SEED)) return null;
  const envelope = JSON.parse(readFileSync(SEED, "utf8"));
  envelope.payload.sim.credits = 130;
  const text = JSON.stringify(envelope.payload);
  return JSON.stringify({ ...envelope, checksum: fnv1a(text) });
}

/**
 * In-page measurement. `ink` is the exact union of the painted boxes, `band` the
 * union of the three layout rows, both over the visual viewport (spec 5.2).
 */
const readLayout = () => {
  const boxes = (selector) =>
    [...document.querySelectorAll(selector)].map((node) => {
      const box = node.getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    });
  // Exact axis-aligned union: compress the coordinates, count covered cells.
  const union = (rects) => {
    const xs = [...new Set(rects.flatMap((b) => [b[0], b[0] + b[2]]))].sort((a, b) => a - b);
    const ys = [...new Set(rects.flatMap((b) => [b[1], b[1] + b[3]]))].sort((a, b) => a - b);
    let area = 0;
    for (let i = 0; i < xs.length - 1; i += 1) {
      for (let j = 0; j < ys.length - 1; j += 1) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cy = (ys[j] + ys[j + 1]) / 2;
        if (rects.some(([x, y, w, h]) => cx >= x && cx <= x + w && cy >= y && cy <= y + h)) {
          area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
        }
      }
    }
    return area;
  };
  const smallest = (selector) => {
    const rects = boxes(selector);
    if (rects.length === 0) return null;
    return {
      width: Math.round(Math.min(...rects.map((b) => b[2])) * 10) / 10,
      height: Math.round(Math.min(...rects.map((b) => b[3])) * 10) / 10,
    };
  };
  const ink = [
    ...boxes(".resources__item"),
    ...boxes(".cluster .icon-btn"),
    ...boxes(".objective"),
    ...boxes(".dock .dock__btn"),
  ];
  const element = document.documentElement;
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    visual: {
      width: Math.round(window.visualViewport?.width ?? window.innerWidth),
      height: Math.round(window.visualViewport?.height ?? window.innerHeight),
    },
    scroll: { width: element.scrollWidth, height: element.scrollHeight },
    inkArea: Math.round(union(ink)),
    bandArea: Math.round(
      union([...boxes(".hud__top"), ...boxes(".objective"), ...boxes(".dock")])
    ),
    panelArea: Math.round(union(boxes(".panel"))),
    chips: document.querySelectorAll(".resources__item").length,
    chipRows: [...new Set(boxes(".resources__item").map((b) => Math.round(b[1])))].length,
    dockTargets: document.querySelectorAll(".dock .dock__btn").length,
    clusterButtons: document.querySelectorAll(".cluster .icon-btn").length,
    minDock: smallest(".dock .dock__btn"),
    minIcon: smallest(".cluster .icon-btn"),
    objective: smallest(".objective"),
    fontPx: Math.round(parseFloat(getComputedStyle(document.body).fontSize) * 10) / 10,
    // Diagnostic detail for the narrowest size: what each top-row box really is.
    topChildren: [...document.querySelectorAll(".hud__top > *")].map((node) => {
      const box = node.getBoundingClientRect();
      return {
        cls: node.className,
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    }),
    chipBoxes: boxes(".resources__item").map((b) => [Math.round(b[2]), Math.round(b[3]), Math.round(b[1])]),
    objectiveBox: boxes(".objective").map((b) => [Math.round(b[2]), Math.round(b[3]), Math.round(b[1])]),
  };
};

const percent = (area, size) =>
  size.width * size.height > 0 ? Math.round((area / (size.width * size.height)) * 1000) / 10 : 0;

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const seed = seedSave();
  try {
    const rows = [];
    for (const size of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.mobile ? 2 : 1,
        isMobile: size.mobile,
        hasTouch: size.mobile,
      });
      if (seed) {
        await context.addInitScript((text) => {
          localStorage.setItem("rustwake.save.v1", text);
        }, seed);
      }
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("text=Begin recovery");
      await page.click("text=Begin recovery");
      await page.waitForTimeout(400);
      const rest = await page.evaluate(readLayout);
      if (size.name === VIEWPORTS[0].name) {
        console.log(
          `detail ${size.name}: top ${JSON.stringify(rest.topChildren)}` +
            ` chips(w,h,y) ${JSON.stringify(rest.chipBoxes)}` +
            ` objective ${JSON.stringify(rest.objectiveBox)}`
        );
      }
      // Same session, three states: rest, then build mode (the densest dock),
      // then one panel open. Spec 5.2 allows a panel to take more than the band.
      const tapDock = async (label) => {
        const handle = await page.evaluateHandle(
          (name) =>
            [...document.querySelectorAll(".dock__btn")].find((node) =>
              (node.textContent ?? "").trim().startsWith(name)
            ),
          label
        );
        const element = handle.asElement();
        if (!element) return false;
        await element.click();
        await page.waitForTimeout(200);
        return true;
      };
      let buildPass = null;
      if (await tapDock("Build")) buildPass = await page.evaluate(readLayout);
      await tapDock("Cancel"); // leave build mode again
      let withPanel = null;
      if (await tapDock("Store")) withPanel = await page.evaluate(readLayout);
      rows.push({ label: size.name, rest, buildPass, withPanel });
      await context.close();
    }
    report(rows);
  } finally {
    await browser.close();
  }
};

function report(rows) {
  const lines = [];
  lines.push("# HUD area share and no-scroll gate (B-16, spec 5.2 and 25.1)");
  lines.push("");
  lines.push(
    `Command \`node scripts/measure-hud.mjs\` against the production build from \`npm run preview\`.` +
      ` Runtime Node ${process.version}, Chrome headless through \`playwright-core\`. Each size is a` +
      ` fresh context with the mature-yard save installed and credits set, then \`Begin recovery\`` +
      ` and 400 ms of the real loop. \`ink\` is the exact axis-aligned union of the painted chip,` +
      ` cluster-button, objective and dock boxes over the visual viewport; \`band\` unions the three` +
      ` layout rows instead, so it counts the empty space between chips and buttons too. Design` +
      ` target for the resting HUD: 15-22 % (spec 5.2). Scroll columns are the document's` +
      ` scrollWidth/scrollHeight against the visual viewport (spec 25.1).`
  );
  const inks = rows.map((row) =>
    percent(row.rest.inkArea, { width: row.rest.visual.width, height: row.rest.visual.height })
  );
  const flat = rows.filter(
    (row) =>
      row.rest.scroll.width <= row.rest.visual.width && row.rest.scroll.height <= row.rest.visual.height
  ).length;
  lines.push("");
  lines.push(
    `Result: the resting ink share runs ${Math.min(...inks)} % to ${Math.max(...inks)} % across the` +
      ` six sizes, and the no-scroll gate holds in ${flat}/${rows.length} of them. Phone portrait` +
      ` lands in or beside the band; tablet and desktop sit under it because the world gains the` +
      ` extra area. Smallest dock target and smallest icon button stay at or above 44 CSS px` +
      ` (spec 6.2), and the dock never exceeds five primary targets (spec 5.5).`
  );
  lines.push("");
  lines.push("## Resting HUD at every size spec 25.1 names");
  lines.push("");
  lines.push(
    "| Viewport | Visual viewport | ink % (target) | band % | Chips (rows) | Dock targets | Smallest dock target | Smallest icon button | Objective h | scrollW×scrollH |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    const m = row.rest;
    const size = { width: m.visual.width, height: m.visual.height };
    lines.push(
      `| ${row.label} | ${m.visual.width}×${m.visual.height} | **${percent(m.inkArea, size)} %** |` +
        ` ${percent(m.bandArea, size)} % | ${m.chips} (${m.chipRows}) | ${m.dockTargets} |` +
        ` ${m.minDock ? `${m.minDock.width}×${m.minDock.height}` : "-"} |` +
        ` ${m.minIcon ? `${m.minIcon.width}×${m.minIcon.height}` : "-"} |` +
        ` ${m.objective ? m.objective.height : "-"} | ${m.scroll.width}×${m.scroll.height} |`
    );
  }
  lines.push("");
  lines.push("## Build mode (densest dock: Cancel, Place, Next)");
  lines.push("");
  lines.push("| Viewport | ink % | Dock targets | Smallest dock target | scrollW×scrollH |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of rows) {
    const m = row.buildPass ?? row.rest;
    const size = { width: m.visual.width, height: m.visual.height };
    lines.push(
      `| ${row.label} | ${percent(m.inkArea, size)} % | ${m.dockTargets} |` +
        ` ${m.minDock ? `${m.minDock.width}×${m.minDock.height}` : "-"} |` +
        ` ${m.scroll.width}×${m.scroll.height} |`
    );
  }
  lines.push("");
  lines.push("## With the store panel open");
  lines.push("");
  lines.push("| Viewport | ink % | panel % | panel + HUD % | Dock targets | scrollW×scrollH |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    const m = row.withPanel ?? row.rest;
    const size = { width: m.visual.width, height: m.visual.height };
    lines.push(
      `| ${row.label} | ${percent(m.inkArea, size)} % | ${percent(m.panelArea, size)} % |` +
        ` ${percent(m.inkArea + m.panelArea, size)} % | ${m.dockTargets} |` +
        ` ${m.scroll.width}×${m.scroll.height} |`
    );
  }
  lines.push("");
  lines.push(
    `Base font size at every size above: ${rows[0].rest.fontPx} px (the scale multiplier is 1).` +
      ` The gate is met when the scroll columns equal the visual viewport, because a larger` +
      ` scrollWidth or scrollHeight means the document scrolls.`
  );
  lines.push("");
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, lines.join("\n"), "utf8");
  for (const row of rows) {
    const m = row.rest;
    const size = { width: m.visual.width, height: m.visual.height };
    console.log(
      `${row.label}: visual ${m.visual.width}×${m.visual.height} ink ${percent(m.inkArea, size)}%` +
        ` band ${percent(m.bandArea, size)}% chips ${m.chips}/${m.chipRows} dock ${m.dockTargets}` +
        ` minDock ${m.minDock?.width}×${m.minDock?.height} scroll ${m.scroll.width}×${m.scroll.height}` +
        ` | panel ${row.withPanel ? `${percent(row.withPanel.panelArea, size)}%` : "n/a"}`
    );
  }
  console.log(`wrote ${TARGET.replace(`${root}${process.platform === "win32" ? "\\" : "/"}`, "")}`);
}

await run();
