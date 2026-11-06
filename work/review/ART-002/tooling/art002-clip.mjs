// ART-002 g1 (independent QA): 250 ms motion clip against the LIVE route.
// Adapted from scripts/capture-clip.mjs (candidate-87ee90b methodology): seeded
// FS-1 envelope, wrapped 2D context so every sampled frame carries the ops it
// really painted, real wall-clock spacing. 250 ms is the witness spacing from
// ART-001 g4; the 1000 ms control is not re-run here.
// Usage: node work/review/ART-002/tooling/art002-clip.mjs
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..", "..");
const out = resolve(here, "captures");
mkdirSync(out, { recursive: true });

const url = "https://home.darkmatter2222.com/rustwake/";
const SAMPLE_MS = 250;
const FRAMES = 26;
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const template = JSON.parse(
  readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"),
);

function part(id, blueprint, tile, status, trayUnits) {
  return {
    id, blueprint, tile, orientation: 0, level: 1,
    inBuf: {}, inBufUnits: trayUnits, tray: [], trayUnits, batch: [],
    progress: 300, progressRem: 0, progressDen: 600, batchMilli: 600, batchPower: 2,
    status, inRoutes: [], outRoute: null, starvedTicks: 0, batchesDone: 5,
    ageTicks: 300, busyTicks: 200, fullTicks: 0,
    rateAge: 0, rateFrom: 0, rateAgePrev: 0, rateFromPrev: 0,
  };
}

/** FS-1: dock + one running sorter + one loaded route, tick 344 (byte-faithful). */
function fs1Envelope() {
  const env = JSON.parse(JSON.stringify(template));
  const sim = env.payload.sim;
  sim.tick = 344;
  sim.tutorial = 9;
  sim.machines = [part(1, "sorter", 8, "running", 0)];
  sim.routes = [
    { id: 1, from: { kind: "store" }, to: { kind: "machine", id: 1 }, filter: "scrap",
      capacity: 5, latency: 5, items: [{ resource: "scrap", qty: 1, arrive: 344 }], inFlight: 1 },
  ];
  sim.store.data = 20;
  sim.storeUnits = 770;
  sim.storeCapacity = 900;
  const text = JSON.stringify(env.payload);
  return JSON.stringify({ ...env, checksum: fnv1a(text) });
}

const INIT = () => {
  const proto = window.CanvasRenderingContext2D.prototype;
  const fillRect = proto.fillRect;
  const ops = [];
  window.__ops = ops;
  proto.fillRect = function patched(x, y, w, h) {
    if (ops.length < 400000) ops.push([String(this.fillStyle), x, y, w, h]);
    return fillRect.call(this, x, y, w, h);
  };
};

const READ = () => {
  const ops = window.__ops ?? [];
  const start = window.__cursor ?? 0;
  window.__cursor = ops.length;
  const slice = ops.slice(start);
  const trail = [];
  let draw = null;
  const flush = () => {
    if (draw && draw.body) trail.push([+draw.body[0].toFixed(2), +draw.body[1].toFixed(2)]);
    draw = null;
  };
  for (const o of slice) {
    const [style, x, y, w, h] = o;
    if (x === undefined) continue;
    if (style === "#0b1220") {
      flush();
      draw = { body: null };
    }
    if (!draw) continue;
    if (style === "#5fd8e8" && Math.abs(h - 7) <= 0.6 && Math.abs(w - 11) <= 0.6) {
      draw.body = [x + w / 2, y + h / 2];
    }
  }
  flush();
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  return {
    draws: trail.length,
    trail,
    hud: document.querySelector(".resources")?.textContent ?? "",
    tick: sim?.tick ?? null,
  };
};

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(INIT);
  await context.addInitScript((text) => localStorage.setItem("rustwake.save.v1", text), fs1Envelope());
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Begin recovery");
  await page.click("text=Begin recovery");
  const close = await page.evaluateHandle(() =>
    [...document.querySelectorAll("button")].find((n) => (n.textContent ?? "").trim() === "Back to yard") ?? null
  );
  if (close.asElement()) await close.asElement().click();
  await page.waitForTimeout(200);

  const frames = [];
  let previous = null;
  for (let f = 1; f <= FRAMES; f += 1) {
    await page.waitForTimeout(SAMPLE_MS);
    const file = `art002-clip-250ms-f${String(f).padStart(2, "0")}.png`;
    const shot = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      const url = canvas.toDataURL();
      return { url, w: canvas.width, h: canvas.height };
    });
    if (!shot) throw new Error(`clip failed: no canvas at frame ${f}`);
    const buffer = Buffer.from(shot.url.slice(shot.url.indexOf(",") + 1), "base64");
    writeFileSync(resolve(out, file), buffer);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const read = await page.evaluate(READ);
    const lead = read.trail.length ? read.trail[read.trail.length - 1] : null;
    const step = lead && previous ? +Math.hypot(lead[0] - previous[0], lead[1] - previous[1]).toFixed(2) : 0;
    if (lead) previous = [lead[0], lead[1]];
    frames.push({
      frame: f,
      png: `work/review/ART-002/captures/${file}`,
      pngSha256: sha256.slice(0, 16),
      canvasBackingPx: [shot.w, shot.h],
      tick: read.tick,
      drawsInWindow: read.trail.length,
      droneBodyCssPx: lead ? [+lead[0].toFixed(2), +lead[1].toFixed(2)] : null,
      stepCssPx: step,
      hud: read.hud,
    });
  }
  await context.close();
  await browser.close();

  const hashes = new Set(frames.map((r) => r.pngSha256));
  const distinctBodies = new Set(frames.map((r) => JSON.stringify(r.droneBodyCssPx))).size;
  const steps = frames.map((r) => r.stepCssPx).filter((v) => v > 0);
  const out250 = {
    artifact: "rustwake-d7af68a",
    sourceSha: "d7af68a1df31d6b0cb5e313330f7cb5853d74a32",
    url,
    sampleMs: SAMPLE_MS,
    frameCount: FRAMES,
    viewport: "390x844",
    dpr: 2,
    label: "organic real-time rAF loop on the live route, seeded FS-1 opening envelope (tick 344)",
    distinctPngHashes: hashes.size,
    distinctDronePositions: distinctBodies,
    stepCssPxMax: steps.length ? Math.max(...steps) : 0,
    stepCssPxMean: steps.length ? +(steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(3) : 0,
    rows: frames,
  };
  writeFileSync(resolve(out, "art002-clip-250ms.json"), JSON.stringify(out250, null, 2), "utf8");
  for (const r of frames) {
    console.log(`f${r.frame} tick=${r.tick} draws=${r.drawsInWindow} body=${JSON.stringify(r.droneBodyCssPx)} step=${r.stepCssPx} sha=${r.pngSha256.slice(0, 10)}`);
  }
  if (hashes.size !== FRAMES) {
    throw new Error(`clip failed: ${hashes.size} distinct PNG hashes for ${FRAMES} frames`);
  }
  if (distinctBodies < 2) {
    throw new Error("clip failed: the drone body never changed position");
  }
  console.log(
    `clip: ${FRAMES} x ${SAMPLE_MS} ms = ${(FRAMES * SAMPLE_MS) / 1000} s wall; ` +
      `distinct hashes=${hashes.size} distinct positions=${distinctBodies} ` +
      `mean step=${out250.stepCssPxMean} max=${out250.stepCssPxMax}`
  );
};

await run();
