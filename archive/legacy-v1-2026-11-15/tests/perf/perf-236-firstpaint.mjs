// @ts-nocheck
// #236 developer numeric probe (non-vision): counts rAF frames from the FIRST frame
// after navigation until the gate preview canvas stamps world3d="ready" (MATURE),
// and verifies the async three chunk is NEVER requested when WebGL is forced null
// (FALLBACK-2D). Serves THIS worktree's dist on port 4169 (does not touch 4173/4175).
// Run: npx tsx tests/perf/perf-236-firstpaint.mjs   (from the rw-236 worktree root)
import { chromium } from "playwright-core";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { findBrowser } from "../renderer/rw3d-t07/lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const PORT = 4169;
const child = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: root, shell: true, stdio: ["ignore", "pipe", "pipe"] });
const stop = () => { if (child.exitCode === null) spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" }); };
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { const r = await fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(1000) }); if (r.ok) break; } catch {}
    if (Date.now() > deadline) throw new Error("preview did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch({ executablePath: findBrowser(), headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const NO_WEBGL = () => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return orig.call(this, type, ...rest);
    };
  };
  // Frame counter installed BEFORE any page script: counts every rAF from the first
  // frame, records the first world3d stamp and the first "ready" stamp, plus whether
  // the gate overlay was still present at those moments (live gate-preview proof).
  const COUNTER = () => {
    window.__fp = { frames: 0, firstStamp: null, readyFrames: null, t0: performance.now() };
    const loop = () => {
      const fp = window.__fp;
      fp.frames += 1;
      const c = document.querySelector(".game canvas");
      const v = c?.dataset?.world3d ?? null;
      const gate = !!document.querySelector(".gate");
      if (v && fp.firstStamp === null) fp.firstStamp = { value: v, frame: fp.frames, ms: Math.round(performance.now() - fp.t0), gate };
      if (v === "ready" && fp.readyFrames === null) fp.readyFrames = { frame: fp.frames, ms: Math.round(performance.now() - fp.t0), gate };
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  const run = async (fallback) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.addInitScript(COUNTER);
    if (fallback) await context.addInitScript(NO_WEBGL);
    const page = await context.newPage();
    const jsRequests = [];
    page.on("request", (r) => { if (/\.js(\?|$)/.test(r.url())) jsRequests.push(r.url().split("/").pop()); });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
    // MATURE: wait for "ready" (or 600-frame cap). FALLBACK: "ready" can never appear;
    // settle 30 frames past the first stamp so the no-import claim covers steady state.
    const res = await page.evaluate((fb) => new Promise((resolve) => {
      const check = () => {
        const fp = window.__fp;
        const done = fp.readyFrames || (fb && fp.firstStamp && fp.frames >= fp.firstStamp.frame + 30) || fp.frames > 600;
        if (done) resolve({ firstStamp: fp.firstStamp, readyFrames: fp.readyFrames, frames: fp.frames });
        else setTimeout(check, 50);
      };
      check();
    }), fallback);
    await context.close();
    return { ...res, jsRequests };
  };
  const mature = await run(false);
  const fallback = await run(true);
  console.log("MATURE", JSON.stringify(mature));
  console.log("FALLBACK", JSON.stringify(fallback));
  // Name-independent: the probe-gated async three chunk is a SECOND index-*.js.
  // MATURE must fetch it; FALLBACK must fetch only the entry index-*.js.
  const indexJs = (l) => l.filter((n) => /^index-.*\.js$/.test(n));
  const ok = mature.readyFrames !== null && indexJs(mature.jsRequests).length >= 2
    && fallback.firstStamp?.value === "unavailable" && fallback.readyFrames === null
    && indexJs(fallback.jsRequests).length === 1;
  console.log(ok ? "FIRSTPAINT: PASS" : "FIRSTPAINT: FAIL");
  await browser.close();
  process.exitCode = ok ? 0 : 1;
} finally { stop(); }
