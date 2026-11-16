// BELT-001 g4: the phone instrument for the *visible* priced extent.
// Three stills at 390x844, deviceScaleFactor 2, isMobile + hasTouch:
//   1. rest            - nothing selected: both connections painted, no chrome over them
//   2. panel-7-tiles   - the far machine selected: its panel row and the world label
//   3. label-3-tiles   - the near machine selected: the short extent with its own label
// For every connection it reports the real painted geometry read out of the canvas:
// the ink hit rate on the polyline, the ink bounding box and the corner count, which is
// what makes a 3-tile and a 7-tile link distinguishable by silhouette in a still, plus
// the light-ink count in the band where the extent line is painted.
//
//   npx vite preview --port 4173                       (background)
//   npx tsx scripts/measure-belt001-g4.mjs
// env: RUSTWAKE_URL (default http://localhost:4173/), BELT001_SHOTS=<captures dir>
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { TUNING } from "../src/game/content/defs";
import { applyCommand, beltCost, DOCK_TILE, YARD_COLS } from "../src/game/simulation/commands";
import { createInitialState } from "../src/game/simulation/types";
import { advance } from "../src/game/simulation/engine";
import { encodeSave, decodeSave } from "../src/game/persistence/save";
import { fitCamera, tileToWorld, worldToScreen } from "../src/game/renderer/scene";
import { beltExtentLine } from "../src/ui/text";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const SAVE_KEY = "rustwake.save.v1";
const shots = process.env.BELT001_SHOTS;
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((path) => existsSync(path));

/** The two extents under test: dock tile 2 -> tile 4 (3 tiles) and -> tile 31 (7 tiles). */
const ROWS = [
  { tile: 4, tiles: 3, price: 3 },
  { tile: 31, tiles: 7, price: 7 },
];

let seq = 0;
const send = (state, command) => applyCommand(state, { ...command, id: `g4-${(seq += 1)}` });

/** Two sorters on the dock's diagonal, one priced link each, cargo in transit on both. */
function yardFrame() {
  const state = createInitialState();
  send(state, { type: "manual.salvage" });
  advance(state, TUNING.manualPulseTicks);
  state.store["scrap"] = 400;
  state.tutorial = 9;
  for (const row of ROWS) {
    send(state, { type: "machine.build", blueprint: "sorter", tile: row.tile });
    const machine = state.machines[state.machines.length - 1];
    send(state, { type: "route.connect", from: 0, to: machine.id, filter: "scrap" });
  }
  advance(state, 40); // enough ticks for both links to carry cargo
  // The direct top-up above bypasses the engine's own aggregate, and the save validator
  // wants `storeUnits` to be a sound count, so it is recomputed from the store map.
  state.storeUnits = Object.values(state.store).reduce(
    (total, units) => total + (units ?? 0),
    0
  );
  return state;
}

/** The shipped camera, read the way `App.tsx` reads it (same reading as `measure-ui002`),
 * in canvas-local CSS pixels. */
const readGeometry = () => {
  const canvas = document.querySelector("canvas");
  const parent = canvas ? canvas.parentElement : null;
  if (!canvas || !parent) return null;
  const rect = canvas.getBoundingClientRect();
  const top = document.querySelector(".hud__top");
  const dock = document.querySelector(".dock");
  const topEdge = top ? top.getBoundingClientRect().bottom : 0;
  const dockTop = dock ? dock.getBoundingClientRect().top : 0;
  const cssHeight = parent.clientHeight;
  return {
    left: rect.left,
    top: rect.top,
    deviceWidth: canvas.width,
    view: { width: parent.clientWidth, height: cssHeight },
    insets:
      topEdge > 0 && dockTop > 0
        ? { top: topEdge, bottom: Math.max(0, cssHeight - dockTop) }
        : undefined,
  };
};

/** Samples along a polyline: both vertices plus five interior points per leg. */
function sampler(pts) {
  const samples = [];
  for (let i = 1; i < pts.length; i += 1) {
    for (let k = 0; k <= 5; k += 1) {
      const f = k / 5;
      samples.push({
        corner: k === 0 || k === 5,
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      });
    }
  }
  return samples;
}

/** The same walker `scene.ts` uses for the label and the cargo token. */
function pathAt(path, t) {
  const step = t * (path.length - 1);
  const i = Math.floor(step);
  const a = path[i];
  const b = path[i + 1] ?? a;
  const f = step - i;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Polyline samples for one route, plus the straight chord between its two end tiles,
 * which is what the old two-point render painted: the two differ wherever `run` turns. */
function samplePoints(camera, view, run) {
  const pts = run.map((tile) => {
    const w = tileToWorld(tile);
    return worldToScreen(camera, view, w.x, w.y);
  });
  const samples = sampler(pts);
  const chord = sampler([pts[0], pts[pts.length - 1]]);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  // A corner is a vertex where the heading changes: 0 for a straight run, 1 for an L.
  let corners = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const horizontalIn = pts[i].x !== pts[i - 1].x;
    const horizontalOut = pts[i + 1].x !== pts[i].x;
    if (horizontalIn !== horizontalOut) corners += 1;
  }
  return {
    samples,
    chord,
    corners,
    // The polyline's own vertices, rounded, in canvas CSS px (double them for device px).
    vertices: pts.map((p) => [Math.round(p.x), Math.round(p.y)]),
    box: {
      w: Math.round(Math.max(...xs) - Math.min(...xs)),
      h: Math.round(Math.max(...ys) - Math.min(...ys)),
    },
    // Where `drawRoutes` puts the extent line: the polyline's own midpoint, minus 4 px.
    label: pathAt(pts, 0.5),
  };
}

/** Real pixel readings: the route-ink class and the light glyph class, straight off the
 * canvas. One array argument so `page.evaluate` can ship it whole into the page. */
function readPixelsFn([poly, chord, labelBox, mode, vertices]) {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { inkHits: 0, inkTotal: poly.length, probeColour: null, labelLightPixels: 0 };
  const ctx = canvas.getContext("2d");
  const dpr = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const at = (x, y) => {
    const X = Math.round(x * dpr);
    const Y = Math.round(y * dpr);
    if (!(X >= 0 && Y >= 0 && X < canvas.width && Y < canvas.height)) return null;
    const i = (Y * canvas.width + X) * 4;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  const routeInk = (rgb) => rgb !== null && rgb[1] - rgb[0] > 55 && rgb[2] - rgb[0] > 60;
  const lightInk = (rgb) => rgb !== null && rgb[0] > 120 && rgb[1] > 150 && rgb[2] > 175;
  let light = 0;
  if (labelBox) {
    for (let x = labelBox.x - 42; x <= labelBox.x + 42; x += 2) {
      for (let y = labelBox.y - 9; y <= labelBox.y + 3; y += 1) if (lightInk(at(x, y))) light += 1;
    }
  }
  const hitRate = (list) => {
    let hits = 0;
    let near = 0;
    let distSum = 0;
    for (const sample of list) {
      if (routeInk(at(sample.x, sample.y))) {
        hits += 1;
        near += 1;
        continue;
      }
      // Chebyshev ring scan, in CSS px: a 3 px tolerance still pins a 2 px line to its leg
      // while a leg that is simply not painted stays at zero.
      let d = 0;
      for (let r = 1; r <= 3 && d === 0; r += 1) {
        for (let dy = -r; dy <= r && d === 0; dy += 1) {
          for (let dx = -r; dx <= r && d === 0; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (routeInk(at(sample.x + dx, sample.y + dy))) d = r;
          }
        }
      }
      if (d > 0) {
        near += 1;
        distSum += d;
      }
    }
    return {
      hits,
      near,
      total: list.length,
      mean: near ? Number((distSum / near).toFixed(2)) : 0,
    };
  };
  const polyHit = hitRate(poly);
  const chordHit = chord ? hitRate(chord) : null;
  // Per-sample offset to the nearest class pixel, in device px: `[radius, dx, dy]`, or the
  // 25 px "not found" marker. This is the calibration readout - it says exactly how far the
  // painted leg sits from the one the model predicts.
  const offsets = [];
  for (let s = 0; s < Math.min(poly.length, 14); s += 1) {
    const X0 = Math.round(poly[s].x * dpr);
    const Y0 = Math.round(poly[s].y * dpr);
    let found = null;
    for (let r = 1; r <= 24 && !found; r += 1) {
      for (let dy = -r; dy <= r && !found; dy += 1) {
        for (let dx = -r; dx <= r && !found; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const i = ((Y0 + dy) * canvas.width + X0 + dx) * 4;
          if (image.data[i + 1] - image.data[i] > 55 && image.data[i + 2] - image.data[i] > 60) {
            found = [r, dx, dy];
          }
        }
      }
    }
    offsets.push(found ?? [25, 0, 0]);
  }
  const hexAt = (i) =>
    "#" +
    (((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]) >>> 0)
      .toString(16)
      .padStart(6, "0");
  // Mode 2: run-length colours along the device row/column each painted leg sits on, inside
  // the leg's own span. Exact widths, exact values: a 2 px leg, a sprite and bare floor
  // cannot be confused. Requested with BELT001_MAP=2.
  let runs = null;
  if (mode >= 2 && vertices) {
    const lines = [];
    for (let i = 1; i < vertices.length; i += 1) {
      const [x1, y1] = vertices[i - 1];
      const [x2, y2] = vertices[i];
      const axis = y1 === y2 ? 0 : x1 === x2 ? 1 : -1;
      const index = axis === 0 ? Math.round(((y1 + y2) / 2) * dpr) : Math.round(((x1 + x2) / 2) * dpr);
      if (axis < 0 || lines.some((line) => line[0] === axis && line[1] === index)) continue;
      const span = axis === 0 ? [x1, x2] : [y1, y2];
      const length = axis === 0 ? canvas.width : canvas.height;
      const value = (k) =>
        hexAt(((axis === 0 ? index * canvas.width + k : k * canvas.width + index)) * 4);
      const out = [];
      let start = 0;
      let prev = "";
      for (let k = 0; k < length; k += 1) {
        const key = value(k);
        if (key !== prev) {
          if (prev) out.push([start, k - 1, prev]);
          start = k;
          prev = key;
        }
      }
      out.push([start, length - 1, prev]);
      const lo = Math.min(...span) * dpr - 6;
      const hi = Math.max(...span) * dpr + 6;
      lines.push([axis, index, out.filter((r) => r[1] >= lo && r[0] <= hi).slice(0, 20)]);
    }
    runs = lines;
  }
  // Whole-canvas reading of the same class: its box, its count, and the six device rows
  // and columns carrying the most of it, so a camera mismatch shows up as a shift.
  const rows = new Map();
  const cols = new Map();
  const rowSpan = new Map();
  const colSpan = new Map();
  const hist = new Map();
  // Where the exact stroke colours sit: `#5fd8e8` is PALETTE.cyan at full alpha, `#418899`
  // is that same paint at the route stroke's 0.5 alpha over the yard floor. Count + box for
  // each settles whether the polyline is on the canvas and where its legs really are.
  const wantSet = new Set(["#5fd8e8", "#418899", "#33667a", "#408899"]);
  const exactBox = new Map();
  let minX = -1;
  let maxX = -1;
  let minY = -1;
  let maxY = -1;
  let count = 0;
  for (let Y = 0; Y < canvas.height; Y += 1) {
    for (let X = 0; X < canvas.width; X += 1) {
      const i = (Y * canvas.width + X) * 4;
      const r = image.data[i];
      const key =
        "#" + (((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]) >>> 0).toString(16).padStart(6, "0");
      hist.set(key, (hist.get(key) ?? 0) + 1);
      if (wantSet.has(key)) {
        const e = exactBox.get(key);
        if (e) {
          e[1] = Math.min(e[1], X);
          e[2] = Math.max(e[2], X);
          e[3] = Math.min(e[3], Y);
          e[4] = Math.max(e[4], Y);
        } else exactBox.set(key, [1, X, X, Y, Y]);
      }
      if (
        image.data[i + 1] - r > 55 &&
        image.data[i + 2] - r > 60
      ) {
        count += 1;
        const rs = rowSpan.get(Y);
        rowSpan.set(Y, rs ? [rs[0], Math.max(rs[1], X)] : [X, X]);
        const cs = colSpan.get(X);
        colSpan.set(X, cs ? [cs[0], Math.max(cs[1], Y)] : [Y, Y]);
        if (minX < 0) {
          minX = maxX = X;
          minY = maxY = Y;
        } else {
          minX = Math.min(minX, X);
          maxX = Math.max(maxX, X);
          minY = Math.min(minY, Y);
          maxY = Math.max(maxY, Y);
        }
        rows.set(Y, (rows.get(Y) ?? 0) + 1);
        cols.set(X, (cols.get(X) ?? 0) + 1);
      }
    }
  }
  const top = (map, span, limit = 8) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([index, hitsAt]) => (span ? [index, hitsAt, ...(span.get(index) ?? [])] : [index, hitsAt]));
  // Every class pixel in the device rows crossing the first probe point, as [y, minX, maxX]:
  // the exact width of what is painted there, so a 2 px leg and a sprite are told apart.
  const near = poly.length
    ? (() => {
        const base = Math.round(poly[0].y * dpr);
        const out = [];
        for (let Y = base - 5; Y <= base + 5; Y += 1) {
          const span = rowSpan.get(Y);
          if (span) out.push([Y, span[0], span[1], rows.get(Y) ?? 0]);
        }
        return out;
      })()
    : [];
  // Coarse ASCII map of the same class (16 device px per cell), for a human read of the
  // painted silhouette. Requested with BELT001_MAP=1.
  let map16 = null;
  if (mode >= 1) {
    const step = 16;
    const lines = [];
    for (let Y = 0; Y < canvas.height; Y += step) {
      let line = "";
      for (let X = 0; X < canvas.width; X += step) {
        let n = 0;
        for (let y = Y; y < Math.min(Y + step, canvas.height); y += 2) {
          for (let x = X; x < Math.min(X + step, canvas.width); x += 2) {
            const i = (y * canvas.width + x) * 4;
            if (image.data[i + 1] - image.data[i] > 55 && image.data[i + 2] - image.data[i] > 60) {
              n += 1;
            }
          }
        }
        line += n === 0 ? "." : n < 4 ? "+" : n < 10 ? "*" : "#";
      }
      lines.push(`${String(Y).padStart(4, " ")} ${line}`);
    }
    map16 = lines;
  }
  return {
    poly: polyHit,
    chord: chordHit,
    probeColour: poly.length ? at(poly[0].x, poly[0].y) : null,
    labelLightPixels: light,
    classBox: count ? { minX, maxX, minY, maxY } : null,
    classCount: count,
    classRows: top(rows, rowSpan),
    classCols: top(cols, colSpan),
    hist: top(hist, null, 14),
    offsets,
    exact: [...exactBox.entries()].map(([hex, e]) => [hex, hist.get(hex), e[1], e[2], e[3], e[4]]),
    runs,
    rowsNear: near,
    probePoints: poly.slice(0, 8).map((s) => [Math.round(s.x), Math.round(s.y)]),
    probeColours: poly.slice(0, 8).map((s) => at(s.x, s.y)),
    map16,
    canvasSize: [canvas.width, canvas.height],
  };
}

async function withPage(browser, cell, body) {
  const state = yardFrame();
  const save = encodeSave(state, 10, { textScale: cell.textScale, muted: true, reducedMotion: false });
  const context = await browser.newContext({
    viewport: { width: cell.width, height: cell.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const pageErrors = [];
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [SAVE_KEY, save]);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const begin = [...document.querySelectorAll("button")].find(
      (node) => (node.textContent ?? "").trim() === "Begin recovery"
    );
    begin?.click();
  });
  await page.waitForTimeout(250);
  // The boot report owns the single panel slot until its own visible target retires it.
  await page.evaluate(() => {
    const panel = document.querySelector(".panel");
    const button = panel ? panel.querySelector(".panel__head button") : null;
    if (button && /^Back to yard$/.test((button.textContent ?? "").trim())) button.click();
  });
  await page.waitForTimeout(150);
  const result = await body(page);
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${cell.label}.png` });
  }
  const rawSave = await page.evaluate(() => localStorage.getItem("rustwake.save.v1"));
  const decoded = decodeSave(rawSave);
  await context.close();
  const failure = decoded.ok ? null : `${decoded.reason}${decoded.detail ? `:${decoded.detail}` : ""}`;
  return { result, pageErrors: [...pageErrors], decoded: decoded.ok ? decoded.payload.sim : null, failure };
}

/** Tap the painted centre of a machine tile; report whether a panel came up. */
async function tapMachine(page, tile) {
  const geometry = await page.evaluate(readGeometry);
  if (!geometry) return null;
  const view = geometry.view;
  const camera = fitCamera(view, geometry.insets);
  const world = tileToWorld(tile);
  const p = worldToScreen(camera, view, world.x, world.y);
  await page.mouse.click(Math.round(p.x + geometry.left), Math.round(p.y + geometry.top));
  await page.waitForTimeout(160);
  return { camera, panel: await page.evaluate(() => {
    const node = document.querySelector(".panel");
    if (!node) return null;
    const rows = [...node.querySelectorAll(".panel__row")].map((row) => ({
      label: (row.querySelector("dt")?.textContent ?? "").trim(),
      value: (row.querySelector("dd")?.textContent ?? "").trim(),
    }));
    return {
      title: (node.querySelector(".panel__title")?.textContent ?? "").trim(),
      linksRow: rows.find((row) => row.label === "Links")?.value ?? null,
      rows: rows.length,
    };
  }) };
}

const CELLS = [
  { label: "390x844-ts1-rest", width: 390, height: 844, textScale: 1, select: null },
  { label: "390x844-ts1-panel-7-tiles", width: 390, height: 844, textScale: 1, select: 31 },
  { label: "390x844-ts1-label-3-tiles", width: 390, height: 844, textScale: 1, select: 4 },
];

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const expected = ROWS.map((row) => ({
    ...row,
    line: beltExtentLine({ run: new Array(row.tiles).fill(0), latency: TUNING.routeLatencyTicks }),
    charged: beltCost(row.tiles),
  }));
  console.log(
    `BELT-001 g4 phone pass · ${url} · 390x844 dsf2 isMobile+hasTouch · dock tile ${DOCK_TILE}, ` +
      `cols ${YARD_COLS}, beltCostPerTile ${TUNING.beltCostPerTile}`
  );
  console.log(
    `expected lines ${JSON.stringify(expected.map((row) => row.line))} ` +
      `(charged ${expected.map((row) => row.charged).join("/")})`
  );
  try {
    for (const cell of CELLS) {
      const { result, pageErrors, decoded, failure } = await withPage(browser, cell, async (page) => {
        const geometry = await page.evaluate(readGeometry);
        const view = geometry.view;
        const taps = [];
        if (cell.select !== null) {
          taps.push({ tile: cell.select, ...(await tapMachine(page, cell.select)) });
        }
        const live = await page.evaluate(() => {
          const raw = localStorage.getItem("rustwake.save.v1");
          const parsed = raw ? JSON.parse(raw) : null;
          const sim = parsed?.payload?.sim ?? {};
          return {
            tick: sim.tick,
            storeUnits: sim.storeUnits,
            scrap: sim.store?.scrap,
            machines: (sim.machines ?? []).map((m) => [m.id, m.tile, m.blueprint]),
            routes: (sim.routes ?? []).map((route) => ({
              id: route.id,
              run: route.run,
              latency: route.latency,
              from: route.from?.id,
              to: route.to?.id,
            })),
          };
        });
        const camera = fitCamera(view, geometry.insets);
        const rows = [];
        let map = null;
        for (const route of live.routes) {
          if (!route.run) {
            rows.push({ id: route.id, runless: true, latency: route.latency });
            continue;
          }
          const shape = samplePoints(camera, view, route.run);
          const labelAt = {
            x: shape.label.x,
            y: shape.label.y - 4 * camera.scale,
          };
          const pixels = await page.evaluate(readPixelsFn, [
            shape.samples,
            shape.chord,
            labelAt,
            Number(process.env.BELT001_MAP ?? 0),
            shape.vertices,
          ]);
          if (pixels.map16) map = pixels.map16;
          rows.push({
            id: route.id,
            tiles: route.run.length,
            vertices: shape.vertices,
            corners: shape.corners,
            box: shape.box,
            // ink reads as strict/within-3px/total @ mean offset: `strict` is an exact
            // pixel hit, `within-3px` still lands on the same painted leg.
            ink: `${pixels.poly.hits}/${pixels.poly.near}/${pixels.poly.total}@${pixels.poly.mean}px`,
            chordInk: pixels.chord
              ? `${pixels.chord.hits}/${pixels.chord.near}/${pixels.chord.total}@${pixels.chord.mean}px`
              : null,
            labelLightPixels: pixels.labelLightPixels,
            classCount: pixels.classCount,
            canvasSize: pixels.canvasSize,
            line: beltExtentLine({ run: route.run, latency: route.latency }),
            selected: cell.select !== null,
            ...(Number(process.env.BELT001_MAP ?? 0) >= 1
              ? {
                  classBox: pixels.classBox,
                  classRows: pixels.classRows,
                  classCols: pixels.classCols,
                  rowsNear: pixels.rowsNear,
                  hist: pixels.hist,
                  exact: pixels.exact,
                  runs: pixels.runs,
                  probePoints: pixels.probePoints,
                  probeColours: pixels.probeColours,
                }
              : {}),
          });
        }
        return { rows, taps, map, machines: live.machines, tick: live.tick, storeUnits: live.storeUnits, scrap: live.scrap, panels: await page.evaluate(() => document.querySelectorAll(".panel").length), view, scale: camera.scale };
      });
      console.log(`\n[${cell.label}] panels ${result.panels} · scale ${result.scale} · view ${result.view.width}x${result.view.height} · live tick ${result.tick} storeUnits ${result.storeUnits} scrap ${result.scrap}`);
      console.log(`  machines ${JSON.stringify(result.machines)}`);
      for (const row of result.rows) console.log(`  ${JSON.stringify(row)}`);
      if (result.map) console.log(result.map.join("\n"));
      for (const tap of result.taps) console.log(`  tap ${JSON.stringify(tap.panel)}`);
      console.log(`  decode ${JSON.stringify(failure)} · save links ${JSON.stringify(
        (decoded?.routes ?? []).map((route) => ({ id: route.id, run: route.run?.length, latency: route.latency }))
      )}`);
      console.log(
        `  tick ${JSON.stringify(decoded?.tick ?? null)} · machines ${JSON.stringify(
          (decoded?.machines ?? []).map((m) => [m.id, m.tile, m.kind])
        )}`
      );
      console.log(`  pageerror ${pageErrors.length}`);
    }
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
