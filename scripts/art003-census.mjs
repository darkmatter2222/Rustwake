// ART-003 g1 / ART-004 g2 census instrument (capture-style shape): one page, 390x844 dpr 1.
// Prints the rows A3-1/A3-3/A3-4 need, all from the live built artifact:
//  * A3-1  grayscale pairwise differing-pixel matrix, printed twice from one run: the
//          aligned 58x58 pixel window per role of the silhouette sheet, and the 32x32
//          gray-ramp unit grid over the shipped PARTS rows (the instrument
//          tests/renderer/silhouette.test.ts asserts). Both print min/mean against the
//          named 32 % threshold, so the acceptance row is readable off stdout.
//          ART-004 g2 adds the joint furnace x signalLab parameter search over that unit
//          grid: the two rows move together, and the winner is printed beside the shipped
//          reading, with the enumerated-combination count.
//  * A3-3  distinct luminance buckets + ink share inside each machine box, contact-shadow
//          coverage, one light direction.
//  * A3-4  per-layer ink shares (ART-004 g2): one exact blended colour per painted painter
//          layer - floor, the gravel ticks, the build-mode dot grid, each machine-body
//          tone, the facet pair, the accents, the contact shadow - counted over ONE
//          denominator, twice (whole canvas, and the machine-row box). Machinery, gravel
//          and grid are then the same kind of number and compare directly.
//  * A3-5  the DOM witnesses (no page scroll, minimum tap face, page errors) plus the
//          built entry-chunk bytes against the 233000 B ceiling.
// Usage: RUSTWAKE_URL=http://localhost:5175/ CENSUS_TAG=after node scripts/art003-census.mjs
import { chromium } from "playwright-core";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

/** A3-1's named separation threshold, in percent of differing cells. */
const A3_1_THRESHOLD_PCT = 32;

/**
 * ART-004 g2: the per-layer ink table. One row per painted layer of drawScene, keyed by the
 * exact device-px blend that layer leaves on the canvas at dpr 1 (tol = the +/- window the
 * counter allows). The blends are the palette hex over its own backing colour at the alpha
 * the painter sets, so each row is derivable from sprites.ts + scene.ts:
 *   floor          #22384a                       (34,56,74)   the pad plane
 *   plateNight     #080d18                       (8,13,24)    the apron strip under the pad
 *   gravelTick     bodyLight @0.28 over floor    (63,88,108)  the 36 resting dot-field ticks
 *   gridStroke     GRID_STYLE @0.22 over floor   (51,76,96)   build mode only, 0 at rest
 *   the body tones are full-alpha palette hexes; facetLight/facetDark are the two grouped
 *   bevel paths; contactShadow is the 0.35 shadow ellipse over the floor.
 */
const LAYERS = [
  ["floor", [34, 56, 74], 2],
  ["plateNight", [8, 13, 24], 0],
  ["gravelTick", [63, 88, 108], 2],
  ["gridStroke", [51, 76, 96], 2],
  ["bodyLight", [138, 169, 196], 2],
  ["bodyMid", [127, 159, 187], 2],
  ["steelLight", [111, 147, 173], 2],
  ["wreckTone", [109, 144, 171], 2],
  ["facetLight", [244, 247, 251], 2],
  ["facetDark", [44, 66, 87], 2],
  ["slotWell", [14, 23, 38], 2],
  ["kitDrain", [22, 40, 58], 2],
  ["kitPuddle", [37, 60, 79], 2],
  ["accentAmber", [255, 183, 101], 2],
  ["accentCyan", [95, 216, 232], 2],
  ["accentRust", [201, 113, 58], 2],
  ["accentViolet", [138, 122, 216], 2],
  ["contactShadow", [28, 46, 62], 3],
];
/** The layers a machine glyph itself paints (the ground/texture rows are excluded). */
const MACHINERY_LAYERS = [
  "bodyLight",
  "bodyMid",
  "steelLight",
  "wreckTone",
  "facetLight",
  "facetDark",
  "slotWell",
  "accentAmber",
  "accentCyan",
  "accentRust",
  "accentViolet",
];

/** The in-page counter is defined inside CENSUS (page.evaluate serializes only the function). */

const CENSUS = (args) => {
  const { extra, LAYERS, MACHINERY_LAYERS } = args;
  const layerCounts = (hist, total) => {
    const inWindow = (key, rgb, tol) => {
      const [r, g, b] = key.split(",").map(Number);
      return Math.abs(r - rgb[0]) <= tol && Math.abs(g - rgb[1]) <= tol && Math.abs(b - rgb[2]) <= tol;
    };
    const rows = LAYERS.map(([name, rgb, tol]) => {
      let px = 0;
      for (const [key, n] of hist) if (inWindow(key, rgb, tol)) px += n;
      return { layer: name, rgb: rgb.join(","), tol, px, sharePct: +((100 * px) / total).toFixed(2) };
    });
    const namedPx = rows.reduce((sum, r) => sum + r.px, 0);
    const nightPx = hist.get("11,18,32") ?? 0;
    const machineryPx = MACHINERY_LAYERS.reduce((sum, k) => sum + rows.find((r) => r.layer === k).px, 0);
    // The rims the exact-match windows cannot name (ellipse edges, half-px rect seams): the
    // five largest unmatched colours, so `unaccountedPct` is interpretable without a re-run.
    const topUnmatched = [...hist.entries()]
      .filter(([key]) => key !== "11,18,32" && !LAYERS.some(([, rgb, tol]) => inWindow(key, rgb, tol)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, n]) => `${key} ${+((100 * n) / total).toFixed(2)}%`);
    return {
      totalPx: total,
      distinctColors: hist.size,
      rows,
      nightPx,
      nightSharePct: +((100 * nightPx) / total).toFixed(2),
      machineryPx,
      machinerySharePct: +((100 * machineryPx) / total).toFixed(2),
      namedSharePct: +((100 * namedPx) / total).toFixed(2),
      topUnmatched,
      // Closes the census: 100 = night + named + unaccounted (antialias rims on half-px rects).
      unaccountedPct: +(100 - ((100 * nightPx) / total) - ((100 * namedPx) / total)).toFixed(2),
    };
  };
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
  // Region census: distinct luminance buckets + ink share inside a device-px box. The
  // normalized share divides by the true 32-unit cell area at this scale, so the number is
  // comparable across the two fitted scales (the rounded device box adds half-pixel floor).
  const cellArea = () => (32 * cellScale) ** 2;
  // QA-4: the contact-shadow count per box, so a row whose own bar buries its ellipse reads
  // as 0 px instead of passing on the global count.
  const isShadow = (r, g, b) => Math.abs(r - 28) <= 3 && Math.abs(g - 46) <= 3 && Math.abs(b - 62) <= 3;
  const isHorizon = (r, g, b) => Math.abs(r - 44) <= 2 && Math.abs(g - 66) <= 2 && Math.abs(b - 87) <= 2; // path
  const region = (x0, y0, x1, y1) => {
    const seen = new Set();
    let ink = 0;
    let shadow = 0;
    let horizon = 0;
    let n = 0;
    for (let py = Math.max(0, y0); py < Math.min(h, y1); py += 1) {
      for (let px = Math.max(0, x0); px < Math.min(w, x1); px += 1) {
        const [r, g, b] = rgbAt(px, py);
        seen.add(Math.min(7, Math.floor(lum(r, g, b) * 8)));
        if (Math.abs(r - 34) > 2 || Math.abs(g - 56) > 2 || Math.abs(b - 74) > 2) ink += 1; // != floor
        if (isShadow(r, g, b)) shadow += 1;
        if (isHorizon(r, g, b)) horizon += 1;
        n += 1;
      }
    }
    return {
      distinctBuckets: [...seen].sort((a, b) => a - b),
      inkPx: ink,
      inkSharePct: +((100 * ink) / n).toFixed(1),
      inkPctOfCellArea: +((100 * ink) / cellArea()).toFixed(2),
      contactShadowPx: shadow,
      horizonBandPx: horizon,
    };
  };
  /** ART-004 g2: the same layer table as stdout, inside one device-px box. */
  const regionLayers = (x0, y0, x1, y1) => {
    const hist = new Map();
    let n = 0;
    for (let py = Math.max(0, y0); py < Math.min(h, y1); py += 1) {
      for (let px = Math.max(0, x0); px < Math.min(w, x1); px += 1) {
        const [r, g, b] = rgbAt(px, py);
        const key = `${r},${g},${b}`;
        hist.set(key, (hist.get(key) ?? 0) + 1);
        n += 1;
      }
    }
    return layerCounts(hist, n);
  };
  let cellScale = 1.8056;
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
    cellScale = camera.scale;
    const box = (tile) => {
      const c = tileToWorld(tile);
      const p = worldToScreen(camera, view, c.x, c.y);
      const half = 16 * camera.scale;
      return [Math.round(p.x - half), Math.round(p.y - half), Math.round(p.x + half), Math.round(p.y + half)];
    };
    const cells = {};
    const list = extra && extra.length ? extra : [["sorter8", 8], ["furnace14", 14], ["dock2", 2]];
    for (const [name, tile] of list) {
      const b = box(tile);
      cells[name] = { box: b, ...region(...b), layers: regionLayers(...b) };
    }
    const pw = worldToScreen(camera, view, WRECK_POSITION.x, WRECK_POSITION.y);
    cells.wreck = {
      box: [Math.round(pw.x - 24 * camera.scale), Math.round(pw.y - 16 * camera.scale),
        Math.round(pw.x + 24 * camera.scale), Math.round(pw.y + 16 * camera.scale)],
    };
    cells.wreck = { ...cells.wreck, ...region(...cells.wreck.box), layers: regionLayers(...cells.wreck.box) };
    // ART-004 D1: the two gutters get their own census rows, so "both outer bands are 0 %" is
    // measured on the same instrument that prints the 8-band histogram.
    let gutters = null;
    // A3-4 band-fit witness: the plate's two ink edges against the two chrome edges, and
    // what the legacy canvas-centred fit of the same scale would have printed.
    let bandFit = null;
    if (insets) {
      const plateTop = worldToScreen(camera, view, 0, 0).y;
      const plateBottom = worldToScreen(camera, view, 0, WORLD_H).y;
      const bandBottom = view.height - insets.bottom;
      gutters = {
        above: { box: [0, Math.round(insets.top), w, Math.round(plateTop)], ...region(0, Math.round(insets.top), w, Math.round(plateTop)) },
        below: { box: [0, Math.round(plateBottom), w, Math.round(bandBottom)], ...region(0, Math.round(plateBottom), w, Math.round(bandBottom)) },
      };
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
    const machineRow = { box: rowBox, ...region(...rowBox), layers: regionLayers(...rowBox) };
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
    const canvasLayers = layerCounts(counts, total);
    // ART-004 g2 comparison row: machinery, gravel and the build-mode grid on ONE box
    // denominator (the machine-row box), plus the same three canvas-wide.
    const boxRows = machineRow.layers;
    const at = (rows, name) => rows.rows.find((r) => r.layer === name);
    const inkComparison = {
      boxDenominatorPx: boxRows.totalPx,
      machineryShareOfBoxPct: boxRows.machinerySharePct,
      gravelShareOfBoxPct: at(boxRows, "gravelTick").sharePct,
      gridShareOfBoxPct: at(boxRows, "gridStroke").sharePct,
      contactShadowShareOfBoxPct: at(boxRows, "contactShadow").sharePct,
      machineryOverGravel: +((boxRows.machinerySharePct || 0) / (at(boxRows, "gravelTick").sharePct || 1)).toFixed(1),
      canvasSharesPct: {
        machinery: canvasLayers.machinerySharePct,
        gravel: at(canvasLayers, "gravelTick").sharePct,
        grid: at(canvasLayers, "gridStroke").sharePct,
        floor: at(canvasLayers, "floor").sharePct,
        plateNight: at(canvasLayers, "plateNight").sharePct,
        contactShadow: at(canvasLayers, "contactShadow").sharePct,
      },
      perBodyToneCanvasPct: Object.fromEntries(
        ["bodyLight", "bodyMid", "steelLight", "facetLight", "facetDark", "slotWell"].map(
          (k) => [k, at(canvasLayers, k).sharePct]
        )
      ),
    };
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
      gutters,
      // ART-004 g2 acceptance row: the per-layer ink shares, canvas-wide, from one pass.
      layers: canvasLayers,
      inkComparison,
      steelLightPx: blendCount([111, 147, 173], 2), // the bank line + the steel-step bodies
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

/* ---- part B: the silhouette sheet, its A3-1 matrix and the joint furnace x lab search ---- */

const SHEET = async (args) => {
  // Grayscale sheet at dpr1. The pairwise matrix compares role A and role B in *aligned
  // local* coordinates (each role's own 32-unit box mapped onto the same 58x58 window), so
  // a differing pixel means the silhouettes really differ at that spot.
  const mod = await import("/src/game/renderer/scene.ts");
  const sprites = await import("/src/game/renderer/sprites.ts");
  const PARTS = sprites.PARTS;
  const THRESHOLD = args.thresholdPct;
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
  const ids = Object.keys(PARTS);
  // The layout comes from the painter's own exported table (ART-004 g2: no hand-mirroring).
  const L = mod.SHEET_LAYOUT;
  const LEFT = L.left;
  const TOP = L.top;
  const BOTTOM = L.bottom;
  const MARGIN = L.margin;
  const half = Math.ceil(ids.length / 2);
  const bands = [
    { scale: L.phone, from: 0, to: ids.length },
    { scale: L.desktop, from: 0, to: half },
    { scale: L.desktop, from: half, to: ids.length },
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
  const stats = (rows) => {
    const vals = rows.map((r) => r[1]);
    const worst = rows.reduce((a, b) => (b[1] < a[1] ? b : a));
    return {
      pairs: vals.length,
      minPct: Math.min(...vals),
      meanPct: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
      minPair: worst[0],
      thresholdPct: THRESHOLD,
      passes: vals.every((v) => v >= THRESHOLD),
    };
  };
  const aligned = stats(matrix);
  /* ---- the 32x32 gray-ramp unit grid (the tests' instrument) ---------------------- */
  const grayGrid = (parts) => {
    const g = new Array(32 * 32).fill(5);
    for (const t of parts) {
      const step = mod.grayStepOf(t[4]);
      const x0 = Math.max(0, Math.floor(t[0] + 16));
      const x1 = Math.min(32, Math.ceil(t[0] + t[2] + 16));
      const y0 = Math.max(0, Math.floor(t[1] + 16));
      const y1 = Math.min(32, Math.ceil(t[1] + t[3] + 16));
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) g[y * 32 + x] = step;
    }
    return g;
  };
  const diffPct = (a, b) => {
    let d = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
    return +((100 * d) / a.length).toFixed(1);
  };
  const hamming = (a, b) => {
    let d = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
    return d;
  };
  const grids6 = new Map(ids6.map((id) => [id, grayGrid(PARTS[id])]));
  const unitMatrix = [];
  for (let i = 0; i < ids6.length; i += 1) {
    for (let j = i + 1; j < ids6.length; j += 1) {
      unitMatrix.push([`${ids6[i]}/${ids6[j]}`, diffPct(grids6.get(ids6[i]), grids6.get(ids6[j]))]);
    }
  }
  const unitGrid = stats(unitMatrix);
  /* ---- ART-004 g2: the joint furnace x signalLab parameter search ------------------ */
  // Both rows move together: the tower/mast/head/wing/foot group of the lab and the chamber
  // box of the furnace share the gray step, so a single-row sweep hides the interaction.
  // Objective = the weakest of the 15 unit pairs, then the mean, with the four existing
  // gates held as hard filters (>= 12 of 64 mask cells apart, >= 18 inside the lattice
  // family, min >= the named threshold, mean above the base mean, six-row ink above base).
  const SHADOW6 = [-11, 12, 22, 3, 15, 1];
  const mask8 = (parts) => {
    const m = new Array(64).fill(0);
    for (const t of parts) {
      const x0 = Math.max(0, Math.floor((t[0] + 16) / 4));
      const x1 = Math.min(7, Math.ceil((t[0] + 16 + t[2]) / 4) - 1);
      const y0 = Math.max(0, Math.floor((t[1] + 16) / 4));
      const y1 = Math.min(7, Math.ceil((t[1] + 16 + t[3]) / 4) - 1);
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) m[y * 8 + x] = 1;
    }
    return m;
  };
  const solid = (row) => row.reduce((s, t) => (t[5] === 1 || t[4] === 15 ? s : s + t[2] * t[3]), 0);
  const legal = (row) =>
    row.every((t) => t[1] >= -16 && t[0] >= -16 && t[0] + t[2] <= 16 && t[1] + t[3] <= 16 && t[3] >= 2) &&
    row.filter((t) => t[4] !== 15 && t[3] < Math.max(...row.map((u) => u[3]))).every((t) => t[3] >= 3);
  const furnCand = ({ bw, by, bh, ci }) => [
    SHADOW6,
    [-bw / 2, by, bw, bh, ci], // squat thermal chamber
    [2, -15, 5, 8, ci], // chimney, proud of the cap line
    [-3, -15, 10, 3, 9], // chimney cap, T-step in rust
    [-6, -6, 8, 3, 6], // intake slot
    [-6, -1, 8, 3, 6], // second chamber slot
    [11, -2, 5, 8, 6], // vent stub
    [11, 8, 5, 3, 9], // vent foot
    [-15, 3, 4, 3, 6], // feed notch
  ];
  const labCand = ({ tw, ty, th, ci, mastY, mastH, headX, headW, wingW, footW }) => [
    SHADOW6,
    [-tw / 2, ty, tw, th, ci], // tower body
    [-2, mastY, 4, mastH, ci], // mast
    [headX, -14, headW, 3, 8], // scanner head, wider than the tower
    [-5, -4, 6, 3, 6], // visor slot
    [-5, 2, 6, 3, 11], // indicator strip
    [-14, -6, wingW, 3, 8], // upper left wing
    [14 - wingW, -6, wingW, 3, 8], // upper right wing
    [-14, 3, wingW, 3, 8], // lower left wing
    [14 - wingW, 3, wingW, 3, 8], // lower right wing
    [-(footW + 7), 6, footW, 3, 16], // left foot
    [7, 6, footW, 3, 16], // right foot
    [-10, 9, 20, 3, 16], // plinth
  ];
  // The shipped rows, as the builders' parameter points (the builders are only a valid
  // search space while they reproduce the shipped table exactly at these values).
  const F0 = { bw: 22, by: -9, bh: 16, ci: 16 };
  const L0 = { tw: 14, ty: -8, th: 21, ci: 16, mastY: -16, mastH: 8, headX: -12, headW: 23, wingW: 6, footW: 7 };
  const builderMatchesShipped = {
    furnace: JSON.stringify(furnCand(F0)) === JSON.stringify([...PARTS.furnace]),
    signalLab: JSON.stringify(labCand(L0)) === JSON.stringify([...PARTS.signalLab]),
  };
  const F_SPEC = { bw: [18, 20, 22], by: [-9, -8, -7], bh: [12, 14, 16, 18], ci: [3, 4, 5, 16] };
  const L_SPEC = { tw: [12, 14, 16], ty: [-9, -8, -7], th: [19, 20, 21, 22], ci: [3, 4, 5, 16], mastY: [-16], mastH: [8], headX: [-13, -12, -11], headW: [21, 23, 25], wingW: [5, 6, 7], footW: [6, 7] };
  const cart = (spec) =>
    Object.entries(spec).reduce((acc, [k, vals]) => acc.flatMap((x) => vals.map((v) => ({ ...x, [k]: v }))), [{}]);
  const ROLE4 = ["dock", "sorter", "wireMill", "drone"]; // the four roles neither builder touches
  const LATTICE = ["generic", "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler"];
  const grid4 = Object.fromEntries(ROLE4.map((r) => [r, grayGrid(PARTS[r])]));
  const constVals = [];
  for (let i = 0; i < ROLE4.length; i += 1) {
    for (let j = i + 1; j < ROLE4.length; j += 1) constVals.push(diffPct(grid4[ROLE4[i]], grid4[ROLE4[j]]));
  }
  const constMin = Math.min(...constVals);
  const constSum = +constVals.reduce((a, b) => a + b, 0).toFixed(1);
  const maskFixed = Object.fromEntries([...ROLE4, ...LATTICE].map((r) => [r, mask8(PARTS[r])]));
  const maskNames = [...ROLE4, ...LATTICE];
  let constMaskMin = 99;
  for (let i = 0; i < maskNames.length; i += 1) {
    for (let j = i + 1; j < maskNames.length; j += 1) {
      constMaskMin = Math.min(constMaskMin, hamming(maskFixed[maskNames[i]], maskFixed[maskNames[j]]));
    }
  }
  let latticeMin = 99;
  for (let i = 0; i < LATTICE.length; i += 1) {
    for (let j = i + 1; j < LATTICE.length; j += 1) {
      latticeMin = Math.min(latticeMin, hamming(maskFixed[LATTICE[i]], maskFixed[LATTICE[j]]));
    }
  }
  const variants = (spec, build) =>
    cart(spec).map((p) => {
      const row = build(p);
      const grid = grayGrid(row);
      const d4 = ROLE4.map((r) => diffPct(grid, grid4[r]));
      return {
        p,
        grid,
        mask: mask8(row),
        ink: solid(row),
        ok: legal(row) && Math.min(...d4) >= constMin,
        d4,
        mMin: Math.min(...maskNames.map((r) => hamming(mask8(row), maskFixed[r]))),
      };
    });
  const Fv = variants(F_SPEC, furnCand);
  const Lv = variants(L_SPEC, labCand);
  const inkBase = 2752;
  const meanBase = 48.69;
  const shippedInk = ids6.reduce((s, id) => s + solid(PARTS[id]), 0);
  const shipped = { minPct: unitGrid.minPct, meanPct: unitGrid.meanPct };
  let best = { minPct: shipped.minPct, meanPct: shipped.meanPct, furnace: F0, signalLab: L0 };
  let enumerated = 0;
  let considered = 0;
  for (const f of Fv) {
    if (!f.ok) continue;
    for (const l of Lv) {
      enumerated += 1;
      if (!l.ok) continue;
      if (Math.min(f.mMin, l.mMin, constMaskMin) < 12 || latticeMin < 18) continue;
      if (f.ink + l.ink + solid(PARTS.dock) + solid(PARTS.sorter) + solid(PARTS.wireMill) + solid(PARTS.drone) <= inkBase) continue;
      const cross = diffPct(f.grid, l.grid);
      const nine = [...f.d4, cross, ...l.d4];
      considered += 1;
      const minPct = Math.min(constMin, ...nine);
      if (minPct < 32) continue;
      const meanPct = +((constSum + nine.reduce((a, b) => a + b, 0)) / 15).toFixed(2);
      if (meanPct <= meanBase) continue;
      if (minPct > best.minPct || (minPct === best.minPct && meanPct > best.meanPct)) {
        best = {
          minPct,
          meanPct,
          furnace: f.p,
          signalLab: l.p,
          pairs: {
            "dock/furnace": f.d4[0],
            "sorter/furnace": f.d4[1],
            "furnace/wireMill": f.d4[2],
            "furnace/signalLab": cross,
            "furnace/drone": f.d4[3],
            "dock/signalLab": l.d4[0],
            "sorter/signalLab": l.d4[1],
            "wireMill/signalLab": l.d4[2],
            "signalLab/drone": l.d4[3],
          },
        };
      }
    }
  }
  const nineOf = Object.fromEntries(
    unitMatrix
      .filter(([k]) => k.split("/").some((p) => p === "furnace" || p === "signalLab"))
      .map(([k, v]) => [k, v])
  );
  const joint = {
    objective: "maximise the weakest of the 15 unit-grid pairs, then the mean, with furnace and signalLab moving together",
    thresholdPct: THRESHOLD,
    gates: { minMaskCells: 12, latticeMaskCells: 18, minPct: 32, meanPctAbove: meanBase, inkUnitsAbove: inkBase },
    builderMatchesShipped,
    enumeratedCombos: enumerated,
    gatePassingCombos: considered,
    // The min is pinned by a pair neither row of this search touches, so 48.2 is the cap and
    // the mean is the only remaining freedom; both are printed for shipped and for the winner.
    minPairOwnedBy: { pair: unitGrid.minPair, touchesFurnaceOrLab: false },
    shipped: { ...shipped, pairs: nineOf, furnace: F0, signalLab: L0, inkUnits: shippedInk },
    best,
    shippedIsOptimum: best.minPct === shipped.minPct && best.meanPct === shipped.meanPct,
    weakestPairs: unitMatrix.slice().sort((a, b) => a[1] - b[1]).slice(0, 5),
  };
  return {
    roles: ids.length,
    window: [58, 58],
    boxes,
    inkPx,
    matrix,
    unitMatrix,
    a3_1: { aligned, unitGrid, jointSearch: joint },
    sheetInkPx: inkPx,
  };
};

/** The built entry chunk, from the last clean `npm run build` of this tree. */
const entryChunkBytes = () => {
  const dir = resolve(root, "dist/assets");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f));
  if (!files.length) return null;
  return { file: files[0], bytes: readFileSync(resolve(dir, files[0])).length, ceilingBytes: 233000 };
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
  // CENSUS_FLEET=template keeps the mature template's eight-machine field (one row per
  // blueprint, so the per-box shadow counts QA-4 asks for exist for all of them);
  // CENSUS_FLEET=1 appends seven synthetic machines to the FS-1 pair instead.
  const base3 = [["sorter8", 8], ["furnace14", 14], ["dock2", 2]];
  const fleet = [["wireMill", 20], ["signalLab", 21], ["generic", 27], ["polymerRecycler", 33], ["copperSeparator", 9], ["platePress", 15], ["circuitAssembler", 26]];
  let extra = [];
  env.payload.sim.machines = [part(1, "sorter", 8, "running", 0), part(2, "furnace", 14, "outputFull", 1)];
  if (process.env.CENSUS_FLEET === "template") {
    env.payload.sim.machines = template.payload.sim.machines;
    env.payload.sim.routes = template.payload.sim.routes;
    extra = [...template.payload.sim.machines.map((m) => [`${m.blueprint}${m.tile}`, m.tile]), ["dock2", 2]];
  } else if (process.env.CENSUS_FLEET) {
    fleet.forEach(([bp, tile], i) => env.payload.sim.machines.push(part(3 + i, bp, tile, "running", 0)));
    extra = [...base3, ...fleet.map(([bp, tile]) => [`${bp}${tile}`, tile])];
  }
  if (process.env.CENSUS_FLEET !== "template") {
    env.payload.sim.routes = [
      { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap",
        capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
      { id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 }, filter: "ferrous",
        capacity: 5, latency: 5, items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1 },
    ];
  }
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
  const scene = await page.evaluate(CENSUS, { extra, LAYERS, MACHINERY_LAYERS });
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
  const sheet = await sheetPage.evaluate(SHEET, { thresholdPct: A3_1_THRESHOLD_PCT });
  await other.close();
  await browser.close();
  const out = {
    tag: TAG,
    url,
    scene,
    sheet,
    witnesses,
    pageErrors: errors.length,
    entryChunk: entryChunkBytes(),
  };
  writeFileSync(resolve(root, `docs/evidence/2026-11-06-art003-census-${TAG}.json`), JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 1));
  // The four acceptance rows, one line each, off the same run.
  const share = (name) => scene.layers.rows.find((r) => r.layer === name)?.sharePct ?? null;
  console.log(`A3-1 sheet min=${sheet.a3_1.aligned.minPct}% (${sheet.a3_1.aligned.minPair}) mean=${sheet.a3_1.aligned.meanPct}% threshold=${sheet.a3_1.aligned.thresholdPct}% passes=${sheet.a3_1.aligned.passes}`);
  console.log(`A3-1 unit min=${sheet.a3_1.unitGrid.minPct}% (${sheet.a3_1.unitGrid.minPair}) mean=${sheet.a3_1.unitGrid.meanPct}% passes=${sheet.a3_1.unitGrid.passes}`);
  console.log(`A3-1 joint search shipped ${JSON.stringify(sheet.a3_1.jointSearch.shipped)}`);
  console.log(`A3-1 joint search best ${JSON.stringify(sheet.a3_1.jointSearch.best)} shippedIsOptimum=${sheet.a3_1.jointSearch.shippedIsOptimum} enumerated=${sheet.a3_1.jointSearch.enumeratedCombos} gatePassing=${sheet.a3_1.jointSearch.gatePassingCombos} buildersMatch=${JSON.stringify(sheet.a3_1.jointSearch.builderMatchesShipped)}`);
  console.log(`A3-4 per-layer canvas shares % ${JSON.stringify(Object.fromEntries(scene.layers.rows.map((r) => [r.layer, r.sharePct])))}`);
  console.log(`A3-4 ink comparison ${JSON.stringify(scene.inkComparison)}`);
  console.log(`A3-6 entry chunk ${JSON.stringify(out.entryChunk)}`);
};

await run();

