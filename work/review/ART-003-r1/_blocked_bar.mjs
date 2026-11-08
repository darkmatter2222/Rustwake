// ART-003-r1 QA: independent measurement of the output-blocked accent bar width per
// quantised frame, plus the starved/running core footprint, from drawScene only.
import { chromium } from "playwright-core";

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
  const scene = await import("/src/game/renderer/scene.ts");
  const sprites = await import("/src/game/renderer/sprites.ts");
  const types = await import("/src/game/simulation/types.ts");
  const VIEW = { width: 390, height: 844 };
  const state = (status) => {
    const base = types.createInitialState();
    return { ...base, tick: 344, machines: [{ ...types.createInitialState().machines[0], id: 1,
      blueprint: "sorter", tile: 8, status, level: 1, progress: 120, batchMilli: 600 }] };
  };
  const scan = (status, phase, reducedMotion) => {
    const canvas = document.createElement("canvas");
    canvas.width = 390; canvas.height = 844;
    const ctx = canvas.getContext("2d");
    scene.drawScene(ctx, state(status), scene.fitCamera(VIEW), VIEW, {
      reducedMotion, buildMode: false, ghostTile: null, ghostValid: true, selected: null, framePhase: phase });
    const d = ctx.getImageData(0, 0, 390, 844).data;
    const hexAt = (px, py) => { const i = (py * 390 + px) * 4;
      return "#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join(""); };
    const rowsWith = (hex) => { const rows = [];
      for (let py = 0; py < 844; py += 1) { let c = 0;
        for (let px = 0; px < 390; px += 1) if (hexAt(px, py) === hex) c += 1;
        if (c) rows.push([py, c]); }
      return rows; };
    return { rust: rowsWith(sprites.PALETTE.rust ?? "#c9713a"), amber: rowsWith(sprites.PALETTE.amber) };
  };
  const frames = [0, 1, 2, 3, 4, 5].map((f) => ({ f, ...scan("outputFull", f / 6, false) }));
  const reduced = [0, 3].map((f) => ({ f, ...scan("outputFull", f / 6, true) }));
  return { frames, reduced, palette: { rust: sprites.PALETTE.rust, amber: sprites.PALETTE.amber } };
});
const summarise = (r) => ({ rustRows: r.rust.map(([py, c]) => `${py}:${c}`), amberPx: r.amber.reduce((a, [, c]) => a + c, 0) });
console.log(JSON.stringify({
  outputFull: out.frames.map((r) => ({ f: r.f, ...summarise(r) })),
  outputFullReduced: out.reduced.map((r) => ({ f: r.f, ...summarise(r) })),
  palette: out.palette,
}, null, 1));
await browser.close();
