// ART-003-r1 QA: (a) cell-normalised gray matrix for ALL 11 PARTS rows, mirroring the
// grayUnit/differingPct math of tests/renderer/silhouette.test.ts; (b) motion amplitude of
// the new per-status states, measured from drawScene into an offscreen canvas at fixed
// framePhase values, in device pixels at dpr 1 and dpr 2.
import { chromium } from "playwright-core";
import { resolve } from "node:path";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:5175/";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => p);
const browser = await chromium.launch({ executablePath, headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
await page.goto(url, { waitUntil: "networkidle" });

const out = await page.evaluate(async () => {
  const sprites = await import("/src/game/renderer/sprites.ts");
  const scene = await import("/src/game/renderer/scene.ts");
  const types = await import("/src/game/simulation/types.ts");
  const { PARTS, PALETTE, COLOR_KEYS } = sprites;

  const grayUnit = (parts) => {
    const grid = new Array(32 * 32).fill(5);
    for (const t of parts) {
      const step = Math.min(4, Math.floor(t[4] / 4));
      const x0 = Math.max(0, Math.floor(t[0] + 16));
      const x1 = Math.min(32, Math.ceil(t[0] + t[2] + 16));
      const y0 = Math.max(0, Math.floor(t[1] + 16));
      const y1 = Math.min(32, Math.ceil(t[1] + t[3] + 16));
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) grid[y * 32 + x] = step;
    }
    return grid;
  };
  const differingPct = (a, b) => {
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
    return +((100 * diff) / a.length).toFixed(1);
  };
  const ids = Object.keys(PARTS);
  const grids = new Map(ids.map((id) => [id, grayUnit(PARTS[id])]));
  const full = [];
  for (let i = 0; i < ids.length; i += 1)
    for (let j = i + 1; j < ids.length; j += 1)
      full.push([`${ids[i]}/${ids[j]}`, differingPct(grids.get(ids[i]), grids.get(ids[j]))]);
  const named = ["dock", "sorter", "furnace", "wireMill", "signalLab", "drone"];
  const lattice = ["generic", "polymerRecycler", "copperSeparator", "platePress", "circuitAssembler"];
  const minOf = (set) => Math.min(...full.filter(([k]) => set.some((s) => k.startsWith(s + "/"))).map(([, v]) => v));
  const matrixFor = (set) => full.filter(([k]) => set.some((s) => k.startsWith(s + "/")));

  // --- motion amplitude -------------------------------------------------
  const state = (status) => {
    const base = types.createInitialState();
    return {
      ...base,
      tick: 344,
      machines: [{
        ...types.createInitialState().machines[0],
        id: 1, blueprint: "sorter", tile: 8, status, level: 1, progress: 120, batchMilli: 600,
      }],
    };
  };
  const VIEW = { width: 390, height: 844 };
  const probe = (status, phase, reducedMotion) => {
    const canvas = document.createElement("canvas");
    canvas.width = 390;
    canvas.height = 844;
    const ctx = canvas.getContext("2d");
    scene.drawScene(ctx, state(status), scene.fitCamera(VIEW), VIEW, {
      reducedMotion, buildMode: false, ghostTile: null, ghostValid: true, selected: null, framePhase: phase,
    });
    const amber = PALETTE.amber;
    const img = ctx.getImageData(0, 0, 390, 844).data;
    let n = 0, x0 = 999, x1 = -1, y0 = 999, y1 = -1;
    for (let py = 0; py < 844; py += 1) {
      for (let px = 0; px < 390; px += 1) {
        const i = (py * 390 + px) * 4;
        const r = img[i], g = img[i + 1], b = img[i + 2];
        const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
        if (hex === PALETTE.amber) {
          n += 1;
          if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
      }
    }
    return { n, w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0 };
  };
  const running = [0, 1, 2, 3, 4, 5].map((f) => ({ frame: f, ...probe("running", f / 6, false) }));
  const runningRM = [0, 3].map((f) => ({ frame: f, ...probe("running", f / 6, true) }));
  const blocked = [0, 2, 3, 5].map((f) => ({ frame: f, ...probe("outputFull", f / 6, false) }));
  const starved = [0, 3].map((f) => ({ frame: f, ...probe("starved", f / 6, false) }));
  return {
    roles: ids.length,
    namedMin: minOf(named),
    namedMatrix: matrixFor(named),
    latticeMin: minOf(lattice),
    latticeMatrix: matrixFor(lattice),
    crossNamedLattice: matrixFor(lattice).concat(matrixFor(named)).filter(([k]) =>
      lattice.some((l) => k.startsWith(l + "/")) && named.some((n) => k.endsWith("/" + n))),
    runningAmberPx: running,
    runningReduced: runningRM,
    blockedAmberPx: blocked,
    starvedAmberPx: starved,
    amberHex: PALETTE.amber,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
