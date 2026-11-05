// ART-001 g1: short sampled clip of the opening scene, phone portrait, from the same
// FS-1 envelope capture-style.mjs uses, so the stills and the clip are one fixture.
//
// The clip is a real frame sequence of the live rAF loop, sampled every SAMPLE_MS of wall
// clock (= SAMPLE_MS/100 ticks of 100 ms simulation time). Per frame it records the drone
// geometry that the painter actually emitted (the 2D context is wrapped, so the numbers are
// the observed fillRect boxes, not a recomputation), the leg parameter that produced them,
// the cargo/machine states that drive the look, and the HUD line.
//
// Usage: RUSTWAKE_URL=http://localhost:5174/ node scripts/capture-clip.mjs
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:5174/";
const CANDIDATE = process.env.CANDIDATE_TAG ?? "candidate-24daf0e";
const SAMPLE_MS = Number(process.env.CLIP_SAMPLE_MS ?? 1000); // 1000 ms = 10 ticks per sample
const SPACING = SAMPLE_MS === 1000 ? "" : `-${SAMPLE_MS}ms`; // distinct artefact names per spacing
const FRAMES = 26; // 26 x 1000 ms = 260 ticks = 26 in-game seconds: several leg cycles
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = chromeCandidates.find((path) => existsSync(path));

/** Same FNV-1a as the app, so a rewritten envelope still verifies (D-11). */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const template = JSON.parse(readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"));

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

/** FS-1 as capture-style.mjs builds it: dock + one running sorter + one loaded route. */
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
  // Byte-identical to capture-style.mjs's FS-1 fixture, so the stills and the clip are the
  // same seeded state. Observed with this fixture: the stored save is accepted (the first
  // sample reads tick 344 + the 432000-tick offline cap) and the loop then advances it at
  // 10 ticks/s, while the painted drone keeps one x - see the limits row in the JSON.
  const text = JSON.stringify(env.payload);
  return JSON.stringify({ ...env, checksum: fnv1a(text) });
}

/** Wraps the 2D context once, so every sampled frame carries the ops it really painted. */
const INIT = () => {
  const proto = window.CanvasRenderingContext2D.prototype;
  const fillRect = proto.fillRect;
  const rect = proto.rect;
  /** @type {[string, number, number, number, number][]} */
  const ops = [];
  window.__ops = ops;
  proto.fillRect = function patched(x, y, w, h) {
    if (ops.length < 400000) ops.push([String(this.fillStyle), x, y, w, h]);
    return fillRect.call(this, x, y, w, h);
  };
  proto.rect = function patched(x, y, w, h) {
    if (ops.length < 400000) ops.push([String(this.fillStyle), x, y, w, h]);
    return rect.call(this, x, y, w, h);
  };
};

/** Reads the draws that the rAF loop painted since the previous sample. */
const READ = () => {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const ops = window.__ops ?? [];
  const start = window.__cursor ?? 0;
  window.__cursor = ops.length;
  const slice = ops.slice(start);
  // One sky fillRect per drawScene call. Between two sky fills sits exactly one drawn
  // frame, so the trail is the drone centre as the painter really placed it, per frame.
  const trail = [];
  let last = null;
  let gaugeAmber = 0;
  let gaugeWells = 0;
  let pod = null;
  let accent = null;
  let draw = null;
  const flush = () => {
    if (draw && draw.body) trail.push([+draw.body[0].toFixed(2), +draw.body[1].toFixed(2)]);
    draw = null;
  };
  for (const o of slice) {
    const [style, x, y, w, h] = o;
    if (o[1] === undefined) continue;
    if (style === "#0b1220") {
      flush();
      draw = { body: null };
    }
    if (!draw) continue;
    if (style === "#5fd8e8" && Math.abs(h - 7) <= 0.6 && Math.abs(w - 11) <= 0.6) {
      draw.body = [x + w / 2, y + h / 2]; // the airborne unit's body centre, CSS px
    }
    if (w === 3.5 && h === 3.5 && style === "#ffb765") gaugeAmber += 1;
    if (w === 3.5 && h === 3.5 && style === "#0e1726") gaugeWells += 1;
    if ((style === "#ffb765" || style === "#7f9fbb") && Math.abs(h - 5.5) <= 0.6) pod = style;
    if (Math.abs(h - 3.5) <= 0.4 && Math.abs(w - 11) <= 0.6) accent = style;
  }
  flush();
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  return {
    dpr,
    draws: trail.length,
    trail,
    podStyle: pod,
    accentStyle: accent,
    gauge: { amber: gaugeAmber, wells: gaugeWells },
    hud: document.querySelector(".resources")?.textContent ?? "",
    hist: slice.filter((o) => o[2] > 0).map((o) => `${o[0]}|${o[2]}x${o[3]}`).join(" "),
    tick: sim?.tick ?? null,
    inFlight: sim?.drone?.inFlight ?? null,
    deliveries: sim?.drone?.deliveries ?? null,
    statuses: (sim?.machines ?? []).map((m) => `${m.blueprint}:${m.status}`),
    storeUnits: sim?.storeUnits ?? null,
  };
};

const run = async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const shotsDir = resolve(root, "docs/screenshots");
  mkdirSync(shotsDir, { recursive: true });
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
  let drawIndex = 0;
  for (let f = 1; f <= FRAMES; f += 1) {
    // Real wall-clock time between the captures: the rAF loop runs at ~66 Hz and the
    // simulation at 10 ticks/s, so ~66 draws and 10 ticks pass in one sample window.
    await page.waitForTimeout(SAMPLE_MS);
    const file = `${CANDIDATE}-clip${SPACING}-f${String(f).padStart(2, "0")}.png`;
    const pngDir = SPACING ? resolve(root, "docs/evidence") : shotsDir;
    // The canvas element's own surface, read once per iteration (no shared screenshot
    // buffer): the encoded PNG is decoded here and written immediately.
    const shot = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      const url = canvas.toDataURL();
      return { url, length: url.length, w: canvas.width, h: canvas.height };
    });
    if (!shot) throw new Error(`clip failed: no canvas at frame ${f}`);
    const buffer = Buffer.from(shot.url.slice(shot.url.indexOf(",") + 1), "base64");
    writeFileSync(resolve(pngDir, file), buffer);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const md5 = createHash("md5").update(buffer).digest("hex");
    const read = await page.evaluate(READ);
    // The last drawn frame inside the window is the one the screenshot carries.
    const lead = read.trail.length ? read.trail[read.trail.length - 1] : null;
    const dx = lead && previous ? +(lead[0] - previous[0]).toFixed(2) : 0;
    const dy = lead && previous ? +(lead[1] - previous[1]).toFixed(2) : 0;
    const step = lead && previous ? +Math.hypot(dx, dy).toFixed(2) : 0;
    if (lead) previous = [lead[0], lead[1]];
    drawIndex += read.trail.length;
    frames.push({
      frame: f,
      png: `${SPACING ? "docs/evidence" : "docs/screenshots"}/${file}`,
      pngSha256: sha256.slice(0, 16),
      pngMd5: md5.slice(0, 10),
      dataUrlLength: shot.length,
      canvasBackingPx: [shot.w, shot.h],
      tick: read.tick,
      drawsInWindow: read.trail.length,
      drawIndexTotal: drawIndex,
      // The painter's own sub-tick parameter, counted as 6 draws per 100 ms tick.
      framePhase: +((drawIndex % 6) / 6).toFixed(4),
      trail: read.trail,
      distinctTrailX: new Set(read.trail.map((p) => p[0])).size,
      distinctTrailY: new Set(read.trail.map((p) => p[1])).size,
      droneBodyCssPx: lead ? [+lead[0].toFixed(2), +lead[1].toFixed(2)] : null,
      stepCssPx: step,
      cargoPod: read.podStyle,
      storeGauge: read.gauge,
      machineAccent: read.accentStyle,
      statuses: read.statuses,
      inFlight: read.inFlight,
      deliveries: read.deliveries,
      storeUnits: read.storeUnits,
      hud: read.hud,
    });
    if (f === 1) console.log(`f1 hist: ${read.hist.slice(0, 900)}`);
  }
  await context.close();
  await browser.close();

  // Observed leg fraction per drawn frame, normalised over the x extremes of the clip.
  const xs = frames.flatMap((r) => r.trail.map((p) => p[0]));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  for (const r of frames) {
    r.legObserved = r.trail.map((p) => +((p[0] - xMin) / (xMax - xMin)).toFixed(3));
  }
  const hashes = new Set(frames.map((r) => r.pngSha256));
  const distinctBodies = new Set(frames.map((r) => JSON.stringify(r.droneBodyCssPx))).size;
  const steps = frames.map((r) => r.stepCssPx).filter((v) => v > 0);
  const stepMax = steps.length ? Math.max(...steps) : 0;
  const stepMean = steps.length ? +(steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(3) : 0;
  const out = resolve(root, `docs/evidence/2026-11-04-clip-opening${SPACING}.json`);
  writeFileSync(
    out,
    JSON.stringify(
      {
        sampleMs: SAMPLE_MS,
        frameCount: FRAMES,
        viewport: "390x844",
        dpr: 2,
        label: "organic real-time rAF loop, seeded FS-1 opening envelope (tick 344, no offline gap)",
        trailXRange: [+xMin.toFixed(2), +xMax.toFixed(2)],
        distinctPngHashes: hashes.size,
        distinctDronePositions: distinctBodies,
        stepCssPxMax: stepMax,
        stepCssPxMean: stepMean,
        rows: frames,
      },
      null,
      2
    ),
    "utf8"
  );
  for (const r of frames) {
    console.log(
      `f${r.frame} tick=${r.tick} phase=${r.framePhase} draws=${r.drawsInWindow} ` +
        `body=${JSON.stringify(r.droneBodyCssPx)} step=${r.stepCssPx}px leg=${r.legObserved[r.legObserved.length - 1]} ` +
        `pod=${r.cargoPod} gauge=${r.storeGauge.amber}/${r.storeGauge.amber + r.storeGauge.wells} md5=${r.pngMd5} len=${r.dataUrlLength}`
    );
  }
  if (hashes.size !== FRAMES) {
    throw new Error(`clip failed: ${hashes.size} distinct PNG hashes for ${FRAMES} frames (one repeated frame)`);
  }
  if (distinctBodies < 2) {
    throw new Error(`clip failed: the drone body never changed position (${JSON.stringify(frames.map((r) => r.droneBodyCssPx))})`);
  }
  console.log(
    `clip: ${frames.length} frames x ${SAMPLE_MS} ms = ${(frames.length * SAMPLE_MS) / 1000} s wall, ` +
      `${frames.length * (SAMPLE_MS / 100)} ticks = ${(frames.length * (SAMPLE_MS / 100)) / 10} in-game s; ` +
      `min step=${Math.min(...steps)} max step=${stepMax} mean step=${stepMean}`
  );
  console.log(`wrote ${out.replace(/\\/g, "/")}`);
};

await run();
