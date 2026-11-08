// ART-003-r1 QA captures (independent of the lane's stills).
// Renders the silhouette sheet the same way scripts/art003-census.mjs does, then saves
// per-role crops at the phone scale (1.8056) and the desktop scale (4), plus the live
// 390x844 machine cells. Output: this folder.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.RUSTWAKE_URL ?? "http://localhost:5175/";
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => p);

const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 420 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });
const boxes = await page.evaluate(async () => {
  const mod = await import("/src/game/renderer/scene.ts");
  const sprites = await import("/src/game/renderer/sprites.ts");
  const canvas = document.createElement("canvas");
  const W = 900, H = 420;
  canvas.width = W;
  canvas.height = H;
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  document.body.append(canvas);
  const ctx2 = canvas.getContext("2d");
  ctx2.imageSmoothingEnabled = false;
  mod.drawSpriteSheet(ctx2, { width: W, height: H });
  const ids = Object.keys(sprites.PARTS);
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
  for (const h of heights) { tops.push(top); top += h + gap; }
  const out = {};
  for (let r = 0; r < bands.length; r += 1) {
    const s = bands[r].scale;
    const count = bands[r].to - bands[r].from;
    const pitch = count > 1 ? (W - 2 * MARGIN - 2 * LEFT * s) / (count - 1) : 0;
    const cy = tops[r] + TOP * s;
    for (let i = bands[r].from; i < bands[r].to; i += 1) {
      const cx = MARGIN + LEFT * s + (i - bands[r].from) * pitch;
      out[`${ids[i]}@${s}`] = [Math.round(cx - 16 * s), Math.round(cy - 16 * s), Math.round(32 * s), Math.round(32 * s)];
    }
  }
  return { canvasRect: canvas.getBoundingClientRect(), out };
});
mkdirSync(here, { recursive: true });
await page.screenshot({ path: resolve(here + "/_cmp", "sheet-900x420.png"), clip: { x: 0, y: 0, width: 900, height: 420 } });
for (const [key, b] of Object.entries(boxes.out)) {
  const [x, y, w, h] = b;
  await page.screenshot({
    path: resolve(here + "/_cmp", `role-${key.replace("@", "-").replace(".", "_")}.png`),
    clip: { x: boxes.canvasRect.x + x, y: boxes.canvasRect.y + y, width: w, height: h },
  });
}
await ctx.close();

// Live scene cells at phone size (same save envelope as the census).
const { readFileSync } = await import("node:fs");
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const template = JSON.parse(readFileSync(resolve(here + "/_cmp", "../../../docs/evidence/yard-mature.json"), "utf8"));
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
  { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap", capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
  { id: 2, from: { kind: "machine", id: 1 }, to: { kind: "machine", id: 2 }, filter: "ferrous", capacity: 5, latency: 5, items: [{ resource: "ferrous", qty: 1, arrive: 345 }], inFlight: 1 },
];
env.payload.sim.store.data = 20;
env.payload.sim.storeUnits = 770;
env.payload.sim.storeCapacity = 900;
const text = JSON.stringify(env.payload);
const fnv1a = (t) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < t.length; i += 1) { hash ^= t.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, "0");
};
await ctx2.addInitScript((t) => localStorage.setItem("rustwake.save.v1", t), JSON.stringify({ ...env, checksum: fnv1a(text) }));
const page2 = await ctx2.newPage();
await page2.goto(url, { waitUntil: "networkidle" });
await page2.waitForSelector("text=Begin recovery");
await page2.click("text=Begin recovery");
await page2.waitForTimeout(250);
await page2.screenshot({ path: resolve(here + "/_cmp", "scene-phone-rest.png") });
const cells = await page2.evaluate(() => window.__art003);
const geo = await page2.evaluate(async () => {
  const m = await import("/src/game/renderer/scene.ts");
  const canvas = document.querySelector("canvas");
  const view = { width: canvas.clientWidth, height: canvas.clientHeight };
  const camera = m.fitCamera(view, { top: 52, bottom: view.height - 790 });
  const box = (tile) => {
    const c = m.tileToWorld(tile);
    const p = m.worldToScreen(camera, view, c.x, c.y);
    const half = 16 * camera.scale;
    return [Math.round(p.x - half), Math.round(p.y - half), Math.round(p.x + half), Math.round(p.y + half)];
  };
  return { dock2: box(2), sorter8: box(8), furnace14: box(14), rect: canvas.getBoundingClientRect() };
});
for (const [name, b] of Object.entries(geo)) {
  if (name === "rect" || !Array.isArray(b)) continue;
  const [x0, y0, x1, y1] = b;
  await page2.screenshot({
    path: resolve(here + "/_cmp", `cell-${name}.png`),
    clip: { x: geo.rect.x + x0, y: geo.rect.y + y0, width: x1 - x0, height: y1 - y0 },
  });
}
await ctx2.close();
await browser.close();
console.log("captured", Object.keys(boxes.out).length, "sheet crops + 3 cells");

