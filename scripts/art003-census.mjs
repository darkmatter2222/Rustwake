// ART-003 g1 census instrument (new, modeled on capture-style.mjs): one page, 390x844 dpr 1.
// Prints the rows A3-1/A3-3/A3-4 need, all from the live built artifact:
//  * A3-1  grayscale pairwise differing-pixel matrix over the silhouette sheet, measured
//          cell-by-cell in each role's own 32-unit box (an aligned comparison: local pixel
//          (u,v) of role A against the same local (u,v) of role B, so the metric answers
//          "do the silhouettes differ" instead of "are the boxes at different x").
//  * A3-3  distinct luminance buckets + ink share inside each machine box, contact-shadow
//          coverage, one light direction.
//  * A3-4  dot-grid ink share versus the machine-row ink share at rest, plus the band-fit
//          witness (plate edges and both chrome gaps) that the plate-still-floats fix moves.
//  * A3-5  the DOM witnesses (no page scroll, minimum tap face, page errors).
// Usage: RUSTWAKE_URL=http://localhost:5175/ CENSUS_TAG=before node scripts/art003-census.mjs
import { chromium } from "playwright-core";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:5175/";
const TAG = process.env.CENSUS_TAG ?? "before";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((path) => existsSync(path));

const CENSUS = () => {
  const canvas = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h).data;
  const rgbAt = (px, py) => {
    const i = (py * w + px) * 4;
    return [img[i], img[i + 1], img[i + 2]];
  };
  const lum = (r, g, b) => {
    const f = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const counts = new Map();
  const buckets = new Array(8).fill(0);
  let total = 0;
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const [r, g, b] = rgbAt(px, py);
      const key = `${r},${g},${b}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      buckets[Math.min(7, Math.floor(lum(r, g, b) * 8))] += 1;
      total += 1;
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, v]) => `${k} ${+((100 * v) / total).toFixed(1)}%`);
  const bucketPct = buckets.map((v) => +((100 * v) / total).toFixed(1));
  // Region census: distinct luminance buckets + ink share inside a device-px box.
  const region = (x0, y0, x1, y1) => {
    const seen = new Set();
    let ink = 0;
    let n = 0;
    for (let py = Math.max(0, y0); py < Math.min(h, y1); py += 1) {
      for (let px = Math.max(0, x0); px < Math.min(w, x1); px += 1) {
        const [r, g, b] = rgbAt(px, py);
        seen.add(Math.min(7, Math.floor(lum(r, g, b) * 8)));
        if (Math.abs(r - 34) > 2 || Math.abs(g - 56) > 2 || Math.abs(b - 74) > 2) ink += 1; // != floor
        n += 1;
      }
    }
    return { distinctBuckets: [...seen].sort((a, b) => a - b), inkSharePct: +((100 * ink) / n).toFixed(1) };
  };
  return window.__art003.then((m) => {
    const { fitCamera, tileToWorld, worldToScreen, WRECK_POSITION, WORLD_H } = m;
    const view = { width: canvas.clientWidth, height: canvas.clientHeight };
    // The same two chrome edges the app measures (App.chromeInsets), read here from the DOM.
    const hudBox = document.querySelector(".hud__top")?.getBoundingClientRect();
    const dockBox = document.querySelector(".dock")?.getBoundingClientRect();
    const insets = hudBox && dockBox && hudBox.bottom > 0 && dockBox.top > 0
      ? { top: hudBox.bottom, bottom: Math.max(0, view.height - dockBox.top) }
      : undefined;
    const camera = fitCamera(view, insets);
    const box = (tile) => {
      const c = tileToWorld(tile);
      const p = worldToScreen(camera, view, c.x, c.y);
      const half = 16 * camera.scale;
      return [Math.round(p.x - half), Math.round(p.y - half), Math.round(p.x + half), Math.round(p.y + half)];
    };
    const cells = {};
    for (const [name, tile] of [["sorter8", 8], ["furnace14", 14], ["dock2", 2]]) {
      const b = box(tile);
      cells[name] = { box: b, ...region(...b) };
    }
    const pw = worldToScreen(camera, view, WRECK_POSITION.x, WRECK_POSITION.y);
    cells.wreck = {
      box: [Math.round(pw.x - 24 * camera.scale), Math.round(pw.y - 16 * camera.scale),
        Math.round(pw.x + 24 * camera.scale), Math.round(pw.y + 16 * camera.scale)],
    };
    cells.wreck = { ...cells.wreck, ...region(...cells.wreck.box) };
    // A3-4 band-fit witness: the plate's two ink edges against the two chrome edges, and
    // what the legacy canvas-centred fit of the same scale would have printed.
    let bandFit = null;
    if (insets) {
      const plateTop = worldToScreen(camera, view, 0, 0).y;
      const plateBottom = worldToScreen(camera, view, 0, WORLD_H).y;
      const bandBottom = view.height - insets.bottom;
      const bandCentre = insets.top + (bandBottom - insets.top) / 2;
      // The old fit kept this exact scale and centred the world on the canvas instead.
      const shiftPx = (bandCentre - view.height / 2) / 1; // CSS px the band centre sits below the canvas centre
      bandFit = {
        scale: +camera.scale.toFixed(4),
        bandCssPx: [+insets.top.toFixed(1), +bandBottom.toFixed(1)],
        plateCssPx: [+plateTop.toFixed(2), +plateBottom.toFixed(2)],
        gapAbove: +(plateTop - insets.top).toFixed(2),
        gapBelow: +(bandBottom - plateBottom).toFixed(2),
        shiftFromCanvasCentrePx: +shiftPx.toFixed(2),
        legacyPlateCssPx: [+(plateTop - shiftPx).toFixed(2), +(plateBottom - shiftPx).toFixed(2)],
        legacyGapAbove: +(plateTop - shiftPx - insets.top).toFixed(2),
        legacyGapBelow: +(bandBottom - (plateBottom - shiftPx)).toFixed(2),
      };
    }
    // Machine-row ink: everything not floor inside the union of the painted machine boxes.
    const rowBox = (() => {
      const boxes = [box(8), box(14), box(2)];
      const x0 = Math.min(...boxes.map((b) => b[0]));
      const y0 = Math.min(...boxes.map((b) => b[1]));
      const x1 = Math.max(...boxes.map((b) => b[2]));
      const y1 = Math.max(...boxes.map((b) => b[3]));
      return [x0, y0, x1, y1];
    })();
    const machineRow = { box: rowBox, ...region(...rowBox) };
    const blendCount = (rgb, tol) => {
      let c = 0;
      for (let py = 0; py < h; py += 1) {
        for (let px = 0; px < w; px += 1) {
          const [r, g, b] = rgbAt(px, py);
          if (Math.abs(r - rgb[0]) <= tol && Math.abs(g - rgb[1]) <= tol && Math.abs(b - rgb[2]) <= tol) c += 1;
        }
      }
      return c;
    };
    const pct = (n) => +((100 * n) / (w * h)).toFixed(2);
    const gridDotPx = blendCount([86, 113, 135], 2); // alpha-0.5 blend of bodyLight over floor (base)
    const gridDotAlphaPx = blendCount([63, 88, 108], 2); // alpha-0.28 blend (candidate)
    return {
      canvas: [w, h],
      topColors: top,
      luminanceBuckets8: bucketPct,
      twoDarkestSharePct: +((100 * (buckets[0] + buckets[1])) / total).toFixed(1),
      twoTopColorsSharePct: +(
        (100 * ([...counts.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0))) / total
      ).toFixed(1),
      cells,
      machineRow,
      bandFit,
      gridDotPx,
      gridDotSharePct: pct(gridDotPx),
      gridDotAlphaPx,
      gridDotAlphaSharePct: pct(gridDotAlphaPx),
      gridInkSharePct: pct(gridDotPx + gridDotAlphaPx), // the whole resting dot field
      machineBodyPx: blendCount([138, 169, 196], 2),
      machineBodySharePct: pct(blendCount([138, 169, 196], 2)),
      contactShadowPx: blendCount([28, 46, 62], 3), // 0.35*shadow over floor
    };
  });
};

const SHEET = async () => {
  // Grayscale sheet at dpr1. The pairwise matrix compares role A and role B in *aligned
  // local* coordinates (each role's own 32-unit box mapped onto the same 58x58 window), so
  // a differing pixel means the silhouettes really differ at that spot.
  const mod = await import("/src/game/renderer/scene.ts");
  const sprites = await import("/src/game/renderer/sprites.ts");
  const canvas = document.createElement("canvas");
  const W = 900;
  const H = 420;
  canvas.width = W;
  canvas.height = H;
  canvas.style.position = "fixed";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  mod.drawSpriteSheet(ctx, { width: W, height: H });
  const ids = Object.keys(sprites.PARTS);
  // Layout math mirrored from drawSpriteSheet so each role's 32-unit box is known.
  const LEFT = 15, TOP = 16, BOTTOM = 15, MARGIN = 2;
  const bands = [
    { scale: 1.8056, from: 0, to: ids.length },
    { scale: 4, from: 0, to: Math.ceil(ids.length / 2) },
    { scale: 4, from: Math.ceil(ids.length / 2), to: ids.length },
  ];
  const heights = bands.map((b) => (TOP + BOTTOM) * b.scale);
  const gap = (H - 2 * MARGIN - heights.reduce((a, b) => a + b, 0)) / (bands.length - 1);
  const tops = [];
  let top = MARGIN;
  for (const hh of heights) {
    tops.push(top);
    top += hh + gap;
  }
  const boxes = {};
  for (let r = 0; r < bands.length; r += 1) {
    const s = bands[r].scale;
    const count = bands[r].to - bands[r].from;
    const pitch = count > 1 ? (W - 2 * MARGIN - 2 * LEFT * s) / (count - 1) : 0;
    const cy = tops[r] + TOP * s;
    for (let i = bands[r].from; i < bands[r].to; i += 1) {
      const cx = MARGIN + LEFT * s + (i - bands[r].from) * pitch;
      boxes[ids[i]] = [Math.round(cx - 16 * s), Math.round(cy - 16 * s), Math.round(32 * s), Math.round(32 * s)];
    }
  }
  const data = ctx.getImageData(0, 0, W, H).data;
  const grayAt = (px, py) => {
    const i = (py * W + px) * 4;
    return `${data[i]},${data[i + 1]},${data[i + 2]}`;
  };
  /** Aligned local window of one role: its own box, sampled on a fixed 58x58 lattice. */
  const window58 = (id) => {
    const [x, y, bw, bh] = boxes[id];
    const out = new Array(58 * 58);
    for (let v = 0; v < 58; v += 1) {
      for (let u = 0; u < 58; u += 1) {
        const px = x + Math.min(bw - 1, Math.floor((u * bw) / 58));
        const py = y + Math.min(bh - 1, Math.floor((v * bh) / 58));
        out[v * 58 + u] = grayAt(px, py);
      }
    }
    return out;
  };
  const ids6 = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];
  const wins = new Map(ids6.map((id) => [id, window58(id)]));
  const inkPx = {};
  for (const id of ids6) {
    const [x, y, bw, bh] = boxes[id];
    let ink = 0;
    for (let py = y; py < y + bh; py += 1) {
      for (let px = x; px < x + bw; px += 1) {
        const c = grayAt(px, py);
        if (c !== "11,18,32" && c !== "8,13,24") ink += 1; // != sheet/backdrop ground
      }
    }
    inkPx[id] = ink;
  }
  const matrix = [];
  for (let i = 0; i < ids6.length; i += 1) {
    for (let j = i + 1; j < ids6.length; j += 1) {
      const a = wins.get(ids6[i]);
      const b = wins.get(ids6[j]);
      let diff = 0;
      for (let k = 0; k < a.length; k += 1) if (a[k] !== b[k]) diff += 1;
      matrix.push([`${ids6[i]}/${ids6[j]}`, +((100 * diff) / a.length).toFixed(1)]);
    }
  }
  return { roles: ids.length, window: [58, 58], boxes, inkPx, matrix };
};

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  // Reuse the same FS-1 envelope as the stills (one sorter + furnace + dock + drone).
  const template = JSON.parse(
    readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8")
  );
  const fnv1a = (t) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < t.length; i += 1) {
      hash ^= t.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  };
  const part = (id, blueprint, tile, status, trayUnits) => ({
    id, blueprint, tile, orientation: 0, level: 1,
    inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
    progress: 300, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 5,
    ageTicks: 300, busyTicks: 200, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  });
  const env = JSON.parse(JSON.stringify(template));
  env.payload.sim.tick = 344;
  env.payload.sim.tutorial = 9;
  env.payload.sim.machines = [part(1, "sorter", 8, "running", 0), part(2, "furnace", 14, "outputFull", 1)];
  env.payload.sim.routes = [
    { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap",
      capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
    { id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 }, filter: "ferrous",
      capacity: 5, latency: 5, items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1 },
  ];
  env.payload.sim.store.data = 20;
  env.payload.sim.storeUnits = 770;
  env.payload.sim.storeCapacity = 900;
  const text = JSON.stringify(env.payload);
  await context.addInitScript((t) => localStorage.setItem("rustwake.save.v1", t), JSON.stringify({ ...env, checksum: fnv1a(text) }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__art003 = import("/src/game/renderer/scene.ts");
  });
  const scene = await page.evaluate(CENSUS);
  const witnesses = await page.evaluate(() => {
    const faces = [...document.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { text: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 28), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    });
    const minFace = Math.min(...faces.map((f) => Math.min(f.w, f.h)));
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrolls: document.documentElement.scrollHeight > window.innerHeight,
      minFacePx: +minFace.toFixed(2),
      faces,
    };
  });
  await context.close();
  const other = await browser.newContext({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 1 });
  const sheetPage = await other.newPage();
  await sheetPage.goto(url, { waitUntil: "networkidle" });
  const sheet = await sheetPage.evaluate(SHEET);
  await other.close();
  await browser.close();
  const out = { tag: TAG, url, scene, sheet, witnesses, pageErrors: errors.length };
  writeFileSync(resolve(root, `docs/evidence/2026-11-06-art003-census-${TAG}.json`), JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 1));
};

await run();
