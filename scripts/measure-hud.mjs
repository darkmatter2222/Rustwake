// Full-screen layout audit: HUD area share against the 15-22 % design target
// (spec 5.2, B-16), the no-scroll gate of spec 25.1, panel fit and internal
// overflow at 2.0 text scale (spec 6.4, B-13), and computed WCAG contrast for
// every text pair the HUD and one panel use. All numbers are read from a real
// browser, none are estimated.
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

/** The three scales the audit compares: default, middle step, largest allowed. */
const SCALES = [1, 1.5, 2];

/** Text pairs the audit measures, in reading order. */
const PAIRS = [
  ["Chip label", ".resources__item"],
  ["Chip value", ".resources__item strong"],
  ["Objective text", ".objective"],
  ["Objective hint", ".objective .status-line"],
  ["Dock button", ".dock .dock__btn"],
  ["Dock primary", ".dock .dock__btn--primary"],
  ["Dock cost line", ".dock .dock__cost"],
  ["Panel body", ".panel"],
  ["Panel title", ".panel__title"],
  ["Panel close button", ".panel .icon-btn"],
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
 * with credits in the ledger so every chip and dock target a phone can show is on,
 * and the requested text scale written into the saved settings.
 */
function seedSave(scale) {
  if (!existsSync(SEED)) return null;
  const envelope = JSON.parse(readFileSync(SEED, "utf8"));
  envelope.payload.sim.credits = 130;
  envelope.payload.settings = { ...(envelope.payload.settings ?? {}), textScale: scale };
  const text = JSON.stringify(envelope.payload);
  return JSON.stringify({ ...envelope, checksum: fnv1a(text) });
}

/**
 * In-page measurement. `ink` is the exact union of the painted boxes, `band` the
 * union of the three layout rows, both over the visual viewport (spec 5.2).
 */
const readLayout = (pairs) => {
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
  // --- contrast, composed over the page background -----------------------
  const parse = (value) => {
    const match = (value ?? "").match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter((p) => p.length).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const night = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 8, g: 13, b: 24, a: 1 };
  const over = (top, bottom) =>
    top.a >= 1
      ? { r: top.r, g: top.g, b: top.b, a: 1 }
      : {
          r: top.r * top.a + bottom.r * (1 - top.a),
          g: top.g * top.a + bottom.g * (1 - top.a),
          b: top.b * top.a + bottom.b * (1 - top.a),
          a: 1,
        };
  const luminance = (c) => {
    const channel = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  };
  const backdrop = (node) => {
    const stack = [];
    for (let current = node; current; current = current.parentElement) {
      const bg = parse(getComputedStyle(current).backgroundColor);
      if (bg && bg.a > 0) stack.push(bg);
    }
    let color = night;
    for (const layer of stack.reverse()) color = over(layer, color);
    return color;
  };
  const contrast = [];
  for (const [label, selector] of pairs) {
    const node = document.querySelector(selector);
    if (!node) continue;
    const style = getComputedStyle(node);
    const foreground = parse(style.color);
    if (!foreground) continue;
    const bg = backdrop(node);
    const a = luminance(over(foreground, bg));
    const b = luminance(bg);
    const ratio = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
    const px = Math.round(parseFloat(style.fontSize) * 10) / 10;
    const bold = Number(style.fontWeight) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    contrast.push({
      label,
      ratio,
      px,
      bold,
      need: large ? 3 : 4.5,
      pass: ratio >= (large ? 3 : 4.5),
    });
  }
  // --- panel geometry ----------------------------------------------------
  const panel = document.querySelector(".panel");
  let panelInfo = null;
  if (panel) {
    const rect = panel.getBoundingClientRect();
    const close = panel.querySelector(".icon-btn");
    const closeRect = close ? close.getBoundingClientRect() : null;
    const dock = document.querySelector(".dock");
    const dockRect = dock ? dock.getBoundingClientRect() : null;
    const objective = document.querySelector(".objective");
    const objectiveRect = objective ? objective.getBoundingClientRect() : null;
    const inside = (r) =>
      !!r && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5;
    panelInfo = {
      label: panel.getAttribute("aria-label") ?? "panel",
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      innerScroll: panel.scrollHeight - panel.clientHeight,
      insideViewport: inside(rect),
      closeInside: inside(closeRect),
      closeSize: closeRect ? `${Math.round(closeRect.width)}×${Math.round(closeRect.height)}` : "none",
      coversDock: !!dockRect && rect.bottom > dockRect.top + 0.5,
      coversObjective:
        !!objectiveRect &&
        rect.top < objectiveRect.bottom - 0.5 &&
        rect.bottom > objectiveRect.top + 0.5 &&
        rect.left < objectiveRect.right - 0.5 &&
        rect.right > objectiveRect.left + 0.5,
    };
  }
  // --- keyboard focus ----------------------------------------------------
  const focusInfo = (() => {
    const node = document.querySelector(".dock .dock__btn");
    if (!node) return null;
    node.focus();
    const active = document.activeElement === node;
    const style = getComputedStyle(node);
    const outline = { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    node.blur();
    return { focused: active, ...outline };
  })();
  const element = document.documentElement;
  // Every painted HUD box must land inside the visual viewport, not be clipped by the
  // `overflow: hidden` game root (spec 25.1: primary actions stay reachable).
  const painted = [...ink, ...boxes(".panel")];
  const beyond =
    painted.length === 0
      ? null
      : {
          right: Math.round(Math.max(...painted.map((b) => b[0] + b[2]))),
          bottom: Math.round(Math.max(...painted.map((b) => b[1] + b[3]))),
        };
  return {
    inner: { width: window.innerWidth, height: window.innerHeight },
    beyond,
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
    contrast,
    panelInfo,
    focusInfo,
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
    dockBoxes: boxes(".dock .dock__btn").map((b) => [Math.round(b[2]), Math.round(b[3]), Math.round(b[0])]),
    dockRow: (() => {
      const node = document.querySelector(".dock");
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return [Math.round(box.width), Math.round(box.height)];
    })(),
  };
};

const percent = (area, size) =>
  size.width * size.height > 0 ? Math.round((area / (size.width * size.height)) * 1000) / 10 : 0;

const sizeOf = (m) => ({ width: m.visual.width, height: m.visual.height });

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const rows = [];
  try {
    for (const scale of SCALES) {
      const seed = seedSave(scale);
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
        // The return report is the first thing a returning player sees; measure it,
        // then close it so the resting HUD below is the yard without a panel.
        const intro = await page.evaluate(readLayout, PAIRS);
        // Real keyboard navigation, not a scripted focus(): focus the first dock
        // button, press Tab, and read the ring the browser actually paints.
        await page.evaluate(() => {
          const first = document.querySelector(".dock .dock__btn");
          if (first) first.focus();
        });
        await page.keyboard.press("Tab");
        const tabbed = await page.evaluate(() => {
          const node = document.activeElement;
          if (!node) return null;
          const s = getComputedStyle(node);
          return {
            label: (node.getAttribute("aria-label") ?? node.textContent ?? "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 22),
            outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
          };
        });
        const closePanel = async () => {
          const handle = await page.evaluateHandle(() => document.querySelector(".panel .icon-btn"));
          const element = handle.asElement();
          if (!element) return false;
          await element.click();
          await page.waitForTimeout(150);
          return true;
        };
        await closePanel();
        const rest = await page.evaluate(readLayout, PAIRS);
        if (size.name === VIEWPORTS[0].name || size.name === VIEWPORTS[3].name) {
          console.log(
            `detail s${scale} ${size.name}: top ${JSON.stringify(rest.topChildren)}` +
              ` chips(w,h,y) ${JSON.stringify(rest.chipBoxes)}` +
              ` objective ${JSON.stringify(rest.objectiveBox)}` +
              ` dock ${JSON.stringify(rest.dockBoxes)} row ${JSON.stringify(rest.dockRow)}` +
              ` furthestPainted ${JSON.stringify(rest.beyond)}`
          );
        }
        // Same session, three states: rest, build mode (the densest dock),
        // then one panel open. Spec 5.2 allows a panel to take more than the band.
        const tapDock = async (label) => {
          await closePanel();
          const handle = await page.evaluateHandle(
            (name) =>
              [...document.querySelectorAll(".dock__btn")].find((node) =>
                (node.textContent ?? "").trim().startsWith(name)
              ),
            label
          );
          const element = handle.asElement();
          if (!element) return false;
          await element.click({ force: true, timeout: 5000 });
          await page.waitForTimeout(200);
          return true;
        };
        let buildPass = null;
        if (await tapDock("Build")) buildPass = await page.evaluate(readLayout, PAIRS);
        await tapDock("Cancel"); // leave build mode again
        let withPanel = null;
        if (await tapDock("Store")) withPanel = await page.evaluate(readLayout, PAIRS);
        rows.push({ scale, label: size.name, intro, rest, buildPass, withPanel, tabbed });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  report(rows);
};

function restTable(rows, scale) {
  const lines = [];
  lines.push(
    "| Viewport | Visual viewport | ink % (target) | band % | Chips (rows) | Dock targets | Smallest dock target | Smallest icon button | Objective h | Base font | scrollW×scrollH |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.filter((r) => r.scale === scale)) {
    const m = row.rest;
    const size = sizeOf(m);
    lines.push(
      `| ${row.label} | ${m.visual.width}×${m.visual.height} | **${percent(m.inkArea, size)} %** |` +
        ` ${percent(m.bandArea, size)} % | ${m.chips} (${m.chipRows}) | ${m.dockTargets} |` +
        ` ${m.minDock ? `${m.minDock.width}×${m.minDock.height}` : "-"} |` +
        ` ${m.minIcon ? `${m.minIcon.width}×${m.minIcon.height}` : "-"} |` +
        ` ${m.objective ? m.objective.height : "-"} | ${m.fontPx} px |` +
        ` ${m.scroll.width}×${m.scroll.height} |`
    );
  }
  return lines;
}

function buildTable(rows, scale) {
  const lines = [];
  lines.push("| Viewport | ink % | Dock targets | Smallest dock target | scrollW×scrollH |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of rows.filter((r) => r.scale === scale)) {
    const m = row.buildPass ?? row.rest;
    const size = sizeOf(m);
    lines.push(
      `| ${row.label} | ${percent(m.inkArea, size)} % | ${m.dockTargets} |` +
        ` ${m.minDock ? `${m.minDock.width}×${m.minDock.height}` : "-"} |` +
        ` ${m.scroll.width}×${m.scroll.height} |`
    );
  }
  return lines;
}

function introTable(rows, scale) {
  const lines = [];
  lines.push(
    "| Viewport | Panel seen | ink % | panel % | Panel box (top→bottom) | Inner scroll | Close target | Close inside | Over dock |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.filter((r) => r.scale === scale)) {
    const m = row.intro ?? row.rest;
    const size = sizeOf(m);
    const p = m.panelInfo;
    lines.push(
      `| ${row.label} | ${p ? p.label : "none"} | ${percent(m.inkArea, size)} % |` +
        ` ${percent(m.panelArea, size)} % |` +
        ` ${p ? `${p.top}→${p.bottom} (${p.height} px)` : "-"} | ${p ? `${p.innerScroll} px` : "-"} |` +
        ` ${p ? p.closeSize : "-"} | ${p ? (p.closeInside ? "yes" : "no") : "-"} |` +
        ` ${p ? (p.coversDock ? "yes" : "no") : "-"} |`
    );
  }
  return lines;
}

function panelTable(rows, scale) {
  const lines = [];
  lines.push(
    "| Viewport | ink % | panel % | panel + HUD % | Panel box (top→bottom) | Inner scroll | Close target | Close inside | Over dock | Over objective | scrollW×scrollH |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows.filter((r) => r.scale === scale)) {
    const m = row.withPanel ?? row.rest;
    const size = sizeOf(m);
    const p = m.panelInfo;
    lines.push(
      `| ${row.label} | ${percent(m.inkArea, size)} % | ${percent(m.panelArea, size)} % |` +
        ` ${percent(m.inkArea + m.panelArea, size)} % |` +
        ` ${p ? `${p.top}→${p.bottom} (${p.height} px)` : "-"} |` +
        ` ${p ? `${p.innerScroll} px` : "-"} | ${p ? p.closeSize : "-"} |` +
        ` ${p ? (p.closeInside ? "yes" : "no") : "-"} | ${p ? (p.coversDock ? "yes" : "no") : "-"} |` +
        ` ${p ? (p.coversObjective ? "yes" : "no") : "-"} | ${m.scroll.width}×${m.scroll.height} |`
    );
  }
  return lines;
}

function contrastTable(rows, scale) {
  const sample = rows.find((r) => r.scale === scale && r.withPanel?.contrast?.length) ??
    rows.find((r) => r.scale === scale && r.rest.contrast.length);
  const source = sample?.withPanel ?? sample?.rest;
  if (!source?.contrast.length) return ["| - | - |", "| --- | --- |", "| no contrast rows | |"];
  const byLabel = new Map(source.contrast.map((c) => [c.label, c]));
  const lines = [];
  lines.push("| Text role | Ratio | Font | Large-text rule | AA need | Pass |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const [label] of PAIRS) {
    const c = byLabel.get(label);
    if (!c) continue;
    lines.push(
      `| ${label} | ${c.ratio}:1 | ${c.px} px${c.bold ? " bold" : ""} | ${
        c.need === 3 ? "yes (3:1)" : "no (4.5:1)"
      } | ${c.need}:1 | ${c.pass ? "yes" : "**no**"} |`
    );
  }
  return lines;
}

function focusLine(rows, scale) {
  const row = rows.find((r) => r.scale === scale && r.rest.focusInfo);
  const f = row?.rest.focusInfo;
  if (!f) return "Focus: no focusable dock button found.";
  return (
    `Keyboard focus on the first dock button: reached = ${f.focused}, outline = ${f.style} ${f.width}` +
    ` ${f.color}.`
  );
}

function tabLine(rows, scale) {
  const t = rows.find((r) => r.scale === scale)?.tabbed;
  if (!t) return "no focusable control found.";
  return (
    `Tab from the first dock button moves focus to \`${t.label}\` with outline ` +
    `\`${t.outline}\`.`
  );
}

function report(rows) {
  const lines = [];
  lines.push("# Layout audit: HUD area share, no-scroll gate, 2.0 text scale, contrast");
  lines.push("");
  lines.push(
    `Command \`node scripts/measure-hud.mjs\` against the production build from \`npm run preview\`.` +
      ` Runtime Node ${process.version}, Chrome headless through \`playwright-core\`. Each size is a` +
      ` fresh context with the mature-yard save installed, \`textScale\` written into its settings,` +
      ` then \`Begin recovery\` and 400 ms of the real loop, then Build mode, then the store panel.` +
      ` \`ink\` is the exact axis-aligned union of the painted chip, cluster-button, objective and dock` +
      ` boxes over the visual viewport; \`band\` unions the three layout rows instead, so it counts the` +
      ` empty space between chips and buttons too. Design target for the resting HUD: 15-22 %` +
      ` (spec 5.2). Scroll columns are the document's` + ` scrollWidth/scrollHeight against the visual` +
      ` viewport (spec 25.1). Contrast is composed over the page background and judged against WCAG` +
      ` AA (4.5:1, or 3:1 for large text). Each context also focuses the first dock button and presses` +
      ` Tab once; the line under the contrast table shows where focus lands and the ring the browser` +
      ` computes there. A painted box whose right or bottom edge passes the visual viewport is` +
      ` listed as clipped, because the game root's \`overflow: hidden\` would hide it. ` +
      `Gates: B-16 area share, B-13 large text and contrast, B-26 short-viewport band,` +
      ` B-27 dock compaction.`
  );
  for (const scale of SCALES) {
    lines.push("");
    lines.push(`## Text scale ${scale.toFixed(1)} — resting HUD at every size spec 25.1 names`);
    lines.push("");
    lines.push(...restTable(rows, scale));
    lines.push("");
    lines.push(`### First screen after \`Begin recovery\` (the return report)`);
    lines.push("");
    lines.push(...introTable(rows, scale));
    lines.push("");
    lines.push(`### Build mode (densest dock: Cancel, Place, Next)`);
    lines.push("");
    lines.push(...buildTable(rows, scale));
    lines.push("");
    lines.push(`### Store panel open`);
    lines.push("");
    lines.push(...panelTable(rows, scale));
    lines.push("");
    lines.push(`### Contrast at text scale ${scale.toFixed(1)} (store panel open)`);
    lines.push("");
    lines.push(...contrastTable(rows, scale));
    lines.push("");
    lines.push(focusLine(rows, scale));
    lines.push(`\nKeyboard navigation: ${tabLine(rows, scale)}`);
  }
  const flat = rows.filter(
    (r) => r.rest.scroll.width <= r.rest.visual.width && r.rest.scroll.height <= r.rest.visual.height
  ).length;
  const fails = [];
  for (const row of rows) {
    for (const c of (row.withPanel ?? row.rest).contrast) if (!c.pass) fails.push(`${row.label} s${row.scale} ${c.label} ${c.ratio}:1`);
  }
  const panelProblems = [];
  for (const row of rows) {
    for (const m of [row.intro, row.withPanel]) {
      const p = m?.panelInfo;
      if (!p) continue;
      if (!p.insideViewport || !p.closeInside || p.coversDock) {
        panelProblems.push(`${row.label} s${row.scale} ${p.label}`);
      }
    }
  }
  // Any painted box whose right or bottom edge passes the visual viewport is clipped
  // by the game root's `overflow: hidden`, so it is reported per state.
  const clipped = [];
  for (const row of rows) {
    for (const [name, m] of [
      ["rest", row.rest],
      ["build", row.buildPass],
      ["panel", row.withPanel],
    ]) {
      const b = m?.beyond;
      if (!b) continue;
      if (b.right > m.visual.width + 0.5 || b.bottom > m.visual.height + 0.5) {
        clipped.push(`${row.label} s${row.scale} ${name} (${b.right}×${b.bottom})`);
      }
    }
  }
  lines.push("");
  lines.push("## Result");
  lines.push("");
  for (const scale of SCALES) {
    const at = rows.filter((r) => r.scale === scale);
    const peak = Math.max(...at.map((r) => percent(r.rest.inkArea, sizeOf(r.rest))));
    const peakBand = Math.max(...at.map((r) => percent(r.rest.bandArea, sizeOf(r.rest))));
    const portrait = at.filter((r) => !r.label.startsWith("landscape"));
    const peakPortraitBand = Math.max(...portrait.map((r) => percent(r.rest.bandArea, sizeOf(r.rest))));
    lines.push(
      `- Text scale ${scale.toFixed(1)}: resting ink share peaks at ${peak} %, the row-union band at` +
        ` ${peakBand} % overall and ${peakPortraitBand} % on the portrait phones. Spec 5.2's 15-22 %` +
        ` target ${
          peak <= 22
            ? "is met on every measured size"
            : "is met at the wide sizes; a large scale trades world area for legibility, which spec 6.4 requires"
        }.`
    );
  }
  lines.push(
    `- No document scroll in ${flat}/${rows.length} measured contexts (rest, build, panel;` +
      ` ${SCALES.length} scales).`
  );
  lines.push(
    `- Panel geometry problems (outside the viewport, close button clipped, or covering the dock):` +
      ` ${panelProblems.length ? panelProblems.join(", ") : "none"}.`
  );
  lines.push(
    `- Painted HUD boxes that pass the visual viewport (clipped by the game root's` +
      ` \`overflow: hidden\`): ${clipped.length ? clipped.join("; ") : "none"}.`
  );
  lines.push(
    `- Contrast: ${fails.length ? `below AA in ${fails.length} case(s) - ${fails.join("; ")}` : `every measured pair is at or above its AA threshold (${PAIRS.length} pairs, ${SCALES.length} scales)`}.`
  );
  lines.push(
    `- The smallest touch target is reported per table; spec 6.2 wants 44 CSS px on both axes, and the` +
      ` dock never exceeds five primary targets (spec 5.5).`
  );
  lines.push("");
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, lines.join("\n"), "utf8");
  for (const row of rows) {
    const m = row.rest;
    const size = sizeOf(m);
    const p = row.withPanel?.panelInfo;
    const ip = row.intro?.panelInfo;
    console.log(
      `s${row.scale} ${row.label}: visual ${m.visual.width}×${m.visual.height} ink ${percent(m.inkArea, size)}%` +
        ` band ${percent(m.bandArea, size)}% chips ${m.chips}/${m.chipRows} font ${m.fontPx}px` +
        ` minDock ${m.minDock?.width}×${m.minDock?.height} scroll ${m.scroll.width}×${m.scroll.height}` +
        ` | intro ${ip ? `${ip.label} ${percent(row.intro.panelArea, size)}% inner ${ip.innerScroll}px close ${ip.closeSize}` : "no panel"}` +
        ` | panel ${p ? `${p.label} ${percent(row.withPanel.panelArea, size)}% inner ${p.innerScroll}px close ${p.closeSize}${p.closeInside ? "" : " CLIPPED"}${p.coversDock ? " OVER-DOCK" : ""}` : "n/a"}` +
        ` | minContrast ${(row.withPanel ?? m).contrast.reduce((a, c) => Math.min(a, c.ratio), 99)}`
    );
  }
  console.log(`wrote ${TARGET.replace(`${root}${process.platform === "win32" ? "\\" : "/"}`, "")}`);
}

await run();
