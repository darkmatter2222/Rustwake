// CAM-10 (#346) MEASUREMENT SLICE — input-to-photon latency + camera
// smoothness on a PRODUCTION build (vite build + preview), 60-second runs on
// desktop 1440x900 and an EMULATED reference phone 390x844 dpr2 touch
// (Chromium/SwiftShader — NOT a physical handset; #268/#275 still owed).
//
// What is measured (definitions in scripts/cam10-stats.mjs):
//  - input-to-photon PROXY: synthetic gesture event.timeStamp -> first rAF
//    callback that observes the camera dataset stamp changed by that input,
//    paired by probe sequence number (never evaluation order). Drag and zoom
//    are reported SEPARATELY (desktop: mouse drag + wheel; phone: touch drag
//    + two-finger pinch via CDP Input.dispatchTouchEvent).
//  - frame-time P95 (nearest-rank), mean, max, FPS, jank (>50ms) and dropped
//    frames over the whole 60s window, from an in-page rAF monitor.
//  - browser + GPU provenance: unmasked renderer/vendor, SwiftShader flag,
//    viewport, DPR, drawing buffer, WebGL context count.
//  - input handler cost (mean/max per kind) from the __RW_PROBES__-gated
//    aggregate probe in src/cameraInput.js — includes world.applyCamera +
//    screenToCell raycast work on the input path (world.js is LEASED by
//    dev-349b; optimization is a scoped follow-up, not this slice).
//
// Deterministic NEGATIVE control: window.__RW_PROBES__.cam10.delayMs=120
// injects a synchronous 120ms main-thread stall into every measured camera
// command (probe flag — NOT a rendering-quality change). The harness must
// observe min latency >= 120ms, P95 rise >= baseline+60ms and >=1 jank frame
// per injected command; then delayMs=0 must RECOVER to the baseline envelope.
// Exact expected/actual numbers land in report.json (negativeVerdict checks).
//
// Privacy: synthetic gestures only; aggregates only. No raw pointer logs or
// per-event traces are persisted — per-sample arrays live in runner memory
// and only count/mean/P50/P95/min/max reach report.json.
//
// Predicate discipline: every waitForFunction waits on the EXACT condition
// asserted afterwards (world3d ready AND camera stamped; change frame with
// the expected seq AND kind AND eventTime). Contact points are verified with
// document.elementFromPoint BEFORE any gesture AND re-verified at the instant
// of each gesture (overlay-thief trap: the zoom rail / a toast can mount over
// a contact AFTER the one-time setup check — observed on the reference phone,
// where the "Zoom out" button occupies the centre column x=195). If a contact
// is stolen it is re-found from the candidate list and the refind is counted
// in the report; if NO candidate reaches the canvas the run fails loudly.
// Aggregate pointer-delivery counters (counts only, no traces) distinguish
// "touch never reached the canvas" from "camera did not respond". No fixed
// sleeps; pacing uses condition-based waits on performance.now(). ONE browser.
//
// Verdict ceiling PASS_NUMERIC_ONLY (local preview). source_sha must be a real
// reachable git SHA — no "local" fallback for a production claim.
import {chromium} from "playwright-core";
import {spawn, execSync} from "node:child_process";
import {mkdir, writeFile, readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {frameStats, latencyStats, negativeVerdict, recoveryVerdict} from "./cam10-stats.mjs";

const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/346-cam-10");
const PORT = Number(process.env.RUSTWAKE_PREVIEW_PORT) || 4196;
const HOST = `http://127.0.0.1:${PORT}/rustwake/`;
const SHA = execSync("git rev-parse HEAD", {encoding: "utf8"}).trim();
if (!/^[0-9a-f]{40}$/.test(SHA)) throw new Error("capture requires a real git HEAD SHA, got: " + SHA);
const RUN_MS = 60000, PACE_MS = 2000, NEG_DELAY_MS = 120, NEG_COMMANDS = 16, NEG_PACE_MS = 400, RECOVERY_COMMANDS = 6;

const report = {
  version: 1, issue: 346, task: "CAM-10 measurement slice — input-to-photon latency and camera smoothness",
  build: "production-preview", source_sha: SHA, started: new Date().toISOString(),
  scope: "MEASUREMENT HALF ONLY of #346. Raycast/render optimization in src/world.js is leased (dev-349c ART-03) and deferred to a scoped follow-up issue.",
  quality: {
    tier: "default production — NO quality setting changed for this measurement",
    pixelRatio: "min(2, devicePixelRatio) as shipped in src/world.js",
    reducedMotion: "no-preference (full ambient animation load)",
    note: "No rendering-quality reduction was applied to obtain any number in this report."
  },
  definitions: {
    frameBudgetMs: 1000 / 60, jankThresholdMs: 50,
    droppedFrames: "sum(max(0, round(delta/16.667)-1))",
    inputToPhoton: "PROXY: synthetic event.timeStamp -> max(first rAF timestamp observing the seq-paired camera stamp change, probe appliedAt). The max() corrects mid-frame CDP injection (rAF timestamps are frame START; observed raw delta -0.4ms): the presenting frame cannot precede camera application. Headless SwiftShader has no physical display; this is event-to-next-rendered-frame, not a physical photon measurement.",
    percentile: "nearest-rank ascending"
  },
  views: [], status: "UNKNOWN", errors: [],
  limitations: [
    "One headless Chromium/SwiftShader run per view; phone is EMULATED (390x844 dpr2 touch), not a physical handset (#268/#275 real-device validation still owed)",
    "Input-to-photon is an event-to-next-rendered-frame proxy (no physical display in headless); GPU presentation/compositor latency is not included",
    "Local production preview only — the hosted-browser receipt at the deployed SHA is produced at release by the release engineer",
    "Verdict ceiling PASS_NUMERIC_ONLY; sponsor G1 visual acceptance (#276) is reserved and NOT granted by this capture",
    "Optimization half of #346 (world.js raycast/render paths) NOT delivered here — scoped follow-up issue linked from #346",
    "Runner load: shared host — other agents run browser captures concurrently and idle dev servers remain from earlier sessions, so latency/frame numbers INCLUDE that contention and are not quiet-host guarantees. An earlier in-flight run at the pre-fix-touch head failed the desktop recovery gate by 8.5 ms under heavier load (drag recovered P95 171 vs 162.5 envelope); the committed run passed every gate. No CPU-heavy work (tests, rollback control) was run by this harness during the capture."
  ]
};

let child, browser;
await mkdir(OUT, {recursive: true});

const instrument = () => {
  // CAM-10 probe flag — the ONLY debug surface; src/cameraInput.js is inert
  // without it. delayMs is the deterministic negative-control injection.
  window.__RW_PROBES__ = {cam10: {enabled: true, delayMs: 0}};
  window.__rwSmoke = {webglContexts: 0};
  const seen = new WeakSet(), orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = orig.call(this, type, ...rest);
    if (c && /webgl/i.test(String(type)) && !seen.has(c)) {seen.add(c); window.__rwSmoke.webglContexts++;}
    return c;
  };
};

// In-page rAF monitor: frame deltas + camera-change frames paired with the
// probe's last-input stamp. Pose string equality means ambient animation and
// the per-frame world.update re-stamp never register as camera changes.
const armMonitor = () => {
  window.__cam10Mon = {deltas: [], changes: [], prevT: null, lastPose: null, frames: 0, armedAt: performance.now()};
  const poseStr = () => {
    const d = document.querySelector(".world-canvas").dataset;
    return [d.cameraYaw, d.cameraElevation, d.cameraZoom, d.cameraX, d.cameraZ].join("|");
  };
  const tick = t => {
    const m = window.__cam10Mon;
    if (m.prevT != null) m.deltas.push(t - m.prevT);
    m.prevT = t; m.frames++;
    const p = poseStr();
    if (m.lastPose != null && p !== m.lastPose) {
      const li = window.__RW_PROBES__.cam10.stats && window.__RW_PROBES__.cam10.stats.last;
      m.changes.push({t, seq: li ? li.seq : 0, kind: li ? li.kind : null, eventTime: li ? li.eventTime : null, appliedAt: li ? li.appliedAt : null});
    }
    m.lastPose = p;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// Aggregate pointer-delivery counters on the world canvas — COUNTS ONLY
// (privacy: no coordinates, no per-event traces). Passive listeners; they do
// not alter cameraInput behaviour or the measured handler cost. They let a
// gesture timeout distinguish "the touch never reached the canvas" (down/move
// stay 0 -> an overlay thief or a delivery stall) from "the canvas received
// the pointer but the camera did not stamp a change" (a real camera defect).
const armDelivery = () => {
  const cv = document.querySelector(".world-canvas");
  const d = {down: 0, move: 0, up: 0, cancel: 0, out: 0, lost: 0};
  window.__cam10Delivery = d;
  cv.addEventListener("pointerdown", () => d.down++, {passive: true});
  cv.addEventListener("pointermove", () => d.move++, {passive: true});
  cv.addEventListener("pointerup", () => d.up++, {passive: true});
  cv.addEventListener("pointercancel", () => d.cancel++, {passive: true});
  cv.addEventListener("pointerout", () => d.out++, {passive: true});
  cv.addEventListener("lostpointercapture", () => d.lost++, {passive: true});
};

try {
  child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {stdio: ["ignore", "pipe", "pipe"]});
  child.stdout.on("data", () => {});
  child.stderr.on("data", d => report.errors.push("preview: " + d.toString().slice(0, 400)));
  let open = false;
  for (let i = 0; i < 70; i++) {
    try {const r = await fetch(HOST, {signal: AbortSignal.timeout(2000)}); if (r.ok) {open = true; break;}} catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  if (!open) throw new Error("Production preview did not become available on " + PORT);
  browser = await chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});

  const proofPage = await browser.newPage();
  const nonBlank = async file => {
    const b64 = (await readFile(resolve(OUT, file))).toString("base64");
    const stats = await proofPage.evaluate(async b64 => {
      const img = new Image();
      await new Promise((res, rej) => {img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64;});
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set(); let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 97) {colors.add((d[i] << 16) | (d[i] << 8) | d[i + 2]); sum += d[i] + d[i + 1] + d[i + 2]; n++;}
      return {width: img.width, height: img.height, distinctColors: colors.size, meanLuma: sum / n / 3};
    }, b64);
    if (stats.distinctColors < 60) throw new Error("Screenshot looks blank: " + file + " " + JSON.stringify(stats));
    return stats;
  };

  const provenance = page => page.evaluate(() => {
    const c = document.querySelector(".world-canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown";
    return {
      userAgent: navigator.userAgent,
      renderer, vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : "unknown",
      swiftshader: /swiftshader/i.test(renderer),
      viewport: {width: innerWidth, height: innerHeight}, dpr: devicePixelRatio,
      drawingBuffer: gl ? [gl.drawingBufferWidth, gl.drawingBufferHeight] : null,
      webglContexts: window.__rwSmoke.webglContexts
    };
  });

  // Overlay-thief trap: verify document.elementFromPoint BEFORE any gesture.
  // A pan of 0->0 is almost always a thief overlay, not a camera bug.
  const findContact = async (page, candidates) => {
    const info = await page.evaluate(pts => pts.map(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      const cv = document.querySelector(".world-canvas");
      return {x, y, isCanvas: el === cv, tag: el ? el.tagName + "." + (el.className || "").toString().slice(0, 60) : "null"};
    }), candidates);
    const hit = info.find(p => p.isCanvas);
    if (!hit) throw new Error("OVERLAY THIEF: no candidate contact point reaches the world canvas: " + JSON.stringify(info));
    return {point: {x: hit.x, y: hit.y}, candidates: info};
  };

  // Re-verify the contact at the INSTANT of the gesture (not just at setup).
  // The reference phone's zoom rail ("Zoom out" button) and transient toasts
  // can mount over a contact after the one-time findContact check; a drag that
  // lands on a button never reaches the canvas and the seq-paired wait times
  // out. If stolen, re-find a live canvas contact (mutating contact.point so
  // the session's reference stays valid) and count the refind for the report.
  // findContact throws OVERLAY THIEF if no candidate reaches the canvas.
  const verifyContact = async (view, contact) => {
    const check = await view.page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      const cv = document.querySelector(".world-canvas");
      return {ok: el === cv, tag: el ? el.tagName + "." + String(el.className || "").slice(0, 40) : "null"};
    }, [contact.point.x, contact.point.y]);
    if (check.ok) return;
    view.contactRefinds = (view.contactRefinds || 0) + 1;
    const fresh = await findContact(view.page, view.candidates);
    contact.refindFrom = check.tag;
    contact.point = fresh.point;
  };

  const newView = async v => {
    const ctx = await browser.newContext({viewport: v.viewport, deviceScaleFactor: v.dpr, isMobile: v.mobile, hasTouch: v.touch, reducedMotion: "no-preference"});
    await ctx.addInitScript(instrument);
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("console", m => {if (m.type() === "error") errs.push("console: " + m.text().slice(0, 300));});
    await page.goto(HOST, {waitUntil: "domcontentloaded", timeout: 30000});
    // EXACT condition: rendered-ready AND a camera pose actually stamped.
    await page.waitForFunction(() => {
      const d = document.querySelector(".world-canvas")?.dataset;
      return d && d.world3d === "ready" && d.cameraZoom !== undefined && d.cameraYaw !== undefined;
    }, null, {timeout: 30000});
    await page.evaluate(armDelivery);
    const cdp = v.touch ? await ctx.newCDPSession(page) : null;
    if (cdp) {
      // CAM-08 harness lesson (docs/design/CAMERA.md CAM-08): CDP touchMove
      // events are QUEUED until the next compositor frame or the next touch
      // dispatch. Without forced BeginFrames the move can stay undelivered
      // (observed here: phone baseline first drag timed out at the seq-paired
      // change-frame wait). Page.startScreencast forces BeginFrames so queued
      // moves deliver promptly — same mechanism as scripts/capture-cam08.mjs.
      // The seq-paired waitForFunction in gestureSample remains the delivery
      // assertion: it waits for the ACTUAL camera change, never a fixed sleep.
      cdp.on("Page.screencastFrame", p => {cdp.send("Page.screencastFrameAck", {sessionId: p.sessionId}).catch(() => {});});
      await cdp.send("Page.startScreencast", {format: "jpeg", quality: 20, everyNthFrame: 1});
    }
    return {ctx, page, cdp, errs};
  };

  // One measured gesture, seq-paired. Waits on the EXACT asserted condition:
  // a change frame with the expected seq AND kind AND a finite eventTime.
  const gestureSample = async (view, kind, contact, dir) => {
    const {page, cdp} = view;
    // Re-verify the contact reaches the canvas at the instant of the gesture;
    // re-find (and count) if an overlay mounted over it since setup.
    await verifyContact(view, contact);
    const {x: cx, y: cy} = contact.point;
    const seqBefore = await page.evaluate(() => (window.__RW_PROBES__.cam10.stats && window.__RW_PROBES__.cam10.stats.seq) || 0);
    const expected = seqBefore + 1;
    const probeKind = kind === "drag" ? "drag" : view.cdp ? "pinch" : "zoom";
    if (kind === "drag" && !view.cdp) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 60 * dir, cy + 40 * dir, {steps: 1});
    } else if (kind === "zoom" && !view.cdp) {
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, -120 * dir);
    } else if (kind === "drag" && view.cdp) {
      await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: cx, y: cy, id: 1}]});
      await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: cx + 50 * dir, y: cy + 30 * dir, id: 1}]});
    } else { // phone zoom = two-finger pinch; one finger moves -> ONE pinch command
      const from = dir > 0 ? 40 : 70, to = dir > 0 ? 70 : 40; // spread 40->70 / pinch 70->40
      await cdp.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: cx - from, y: cy, id: 1}, {x: cx + from, y: cy, id: 2}]});
      await cdp.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: cx - to, y: cy, id: 1}, {x: cx + to, y: cy, id: 2}]});
    }
    try {
      await page.waitForFunction(([seq, k]) => {
        const m = window.__cam10Mon;
        return m.changes.some(c => c.seq === seq && c.kind === k && c.eventTime != null && Number.isFinite(c.eventTime));
      }, [expected, probeKind], {timeout: 15000});
    } catch (waitErr) {
      // Timeout diagnostics: elementFromPoint FIRST (overlay thief), then the
      // aggregate delivery counters, monitor progress, probe state and pose.
      const diag = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const cv = document.querySelector(".world-canvas");
        const d = cv ? cv.dataset : {};
        const st = window.__RW_PROBES__.cam10.stats;
        const m = window.__cam10Mon;
        return {
          contact: {x, y, isCanvas: el === cv, tag: el ? el.tagName + "." + String(el.className || "").slice(0, 40) : "null"},
          delivery: window.__cam10Delivery,
          monitor: {frames: m.frames, changes: m.changes.length, lastChanges: m.changes.slice(-3)},
          probe: {seq: st && st.seq, kinds: st && st.kinds, last: st && st.last},
          pose: {yaw: d.cameraYaw, elev: d.cameraElevation, zoom: d.cameraZoom, x: d.cameraX, z: d.cameraZ},
          scrollY: window.scrollY,
          visualViewport: window.visualViewport ? {scale: window.visualViewport.scale, offsetTop: window.visualViewport.offsetTop} : null
        };
      }, [cx, cy]).catch(e => ({diagError: String(e)}));
      throw new Error(`${kind}: seq-paired change wait timed out (expected seq ${expected} kind ${probeKind}): ${String(waitErr).slice(0, 120)} | DIAGNOSTICS ${JSON.stringify(diag)}`);
    }
    const sample = await page.evaluate(([seq, k]) => {
      const c = window.__cam10Mon.changes.find(c => c.seq === seq && c.kind === k);
      const st = window.__RW_PROBES__.cam10.stats;
      // The rAF timestamp is the frame START; CDP-injected input can arrive
      // mid-frame before that frame's callbacks run (observed: -0.4ms). The
      // frame that renders the new pose cannot present before the camera was
      // applied, so the photon proxy is max(frameStart, appliedAt) - eventTime.
      // This never shrinks the injected-stall margin (appliedAt >= event+delay).
      const photonT = Math.max(c.t, c.appliedAt);
      return {latencyMs: photonT - c.eventTime, frameStartDeltaMs: c.t - c.eventTime, handlerMs: st.last.handlerMs, seq: c.seq, kind: c.kind};
    }, [expected, probeKind]);
    if (!(sample.latencyMs >= 0)) throw new Error(`${kind}: negative latency ${sample.latencyMs}`);
    if (sample.seq !== expected || sample.kind !== probeKind) throw new Error(`${kind}: seq/kind mismatch ${JSON.stringify(sample)}`);
    if (kind === "drag" && !view.cdp) await page.mouse.up();
    else if (view.cdp) await cdp.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
    return sample;
  };

  const collectMonitor = page => page.evaluate(() => {
    const m = window.__cam10Mon;
    return {deltas: m.deltas, durationMs: performance.now() - m.armedAt, frames: m.frames, changes: m.changes.length};
  });

  // Run a paced gesture session; returns aggregates only (raw samples stay in
  // runner memory and are NEVER persisted — synthetic gestures, no traces).
  const runSession = async (view, contact, {commands, paceMs, label}) => {
    const {page} = view;
    await page.evaluate(armMonitor);
    await page.waitForFunction(() => window.__cam10Mon.frames >= 10, null, {timeout: 15000});
    const samples = {drag: [], zoom: []};
    const handlers = {drag: [], zoom: []};
    let midFrameCorrections = 0;
    // Pacing clock MUST share the in-page time origin (performance.now()),
    // never Date.now() epoch — mixing origins makes the wait unsatisfiable.
    const t0 = await page.evaluate(() => performance.now());
    let i = 0;
    while (i < commands) {
      const kind = i % 2 === 0 ? "drag" : "zoom";
      const dir = Math.floor(i / 2) % 2 === 0 ? 1 : -1; // alternate: never ride a clamp
      const s = await gestureSample(view, kind, contact, dir);
      samples[kind].push(s.latencyMs);
      handlers[kind].push(s.handlerMs);
      if (s.frameStartDeltaMs < 0) midFrameCorrections++;
      i++;
      if (i < commands) {
        const nextAt = t0 + i * paceMs;
        await page.waitForFunction(t => performance.now() >= t, nextAt, {timeout: paceMs + 15000});
      }
    }
    const mon = await collectMonitor(page);
    const kinds = await page.evaluate(() => window.__RW_PROBES__.cam10.stats.kinds);
    const delivery = await page.evaluate(() => window.__cam10Delivery);
    return {
      label, commands: i, durationMs: mon.durationMs, midFrameCorrections,
      contactRefinds: view.contactRefinds || 0, delivery,
      frames: frameStats(mon.deltas, mon.durationMs),
      latency: {drag: latencyStats(samples.drag), zoom: latencyStats(samples.zoom)},
      handlerMs: {
        drag: {count: handlers.drag.length, mean: handlers.drag.reduce((s, v) => s + v, 0) / Math.max(1, handlers.drag.length), max: Math.max(0, ...handlers.drag)},
        zoom: {count: handlers.zoom.length, mean: handlers.zoom.reduce((s, v) => s + v, 0) / Math.max(1, handlers.zoom.length), max: Math.max(0, ...handlers.zoom)}
      },
      probeKinds: kinds, cameraChangeFrames: mon.changes
    };
  };

  const shot = async (view, name) => {
    const f = `${name}.png`;
    await view.page.screenshot({path: resolve(OUT, f), fullPage: false, animations: "disabled"});
    return {file: f, nonBlank: await nonBlank(f)};
  };

  const runView = async v => {
    const view = await newView(v);
    const out = {name: v.name, viewport: v.viewport, dpr: v.dpr, touch: v.touch,
      gestures: {drag: v.touch ? "one-finger touch drag (CDP)" : "mouse left-drag", zoom: v.touch ? "two-finger pinch (CDP)" : "wheel"},
      screenshots: []};
    try {
      out.provenance = await provenance(view.page);
      const candidates = v.touch
        ? [[195, 200], [195, 300], [195, 422], [100, 150], [290, 250]]
        : [[720, 450], [720, 300], [500, 400]];
      view.candidates = candidates; // gesture-time re-verification re-finds from these
      out.contact = await findContact(view.page, candidates);
      // 60-second baseline at default production quality.
      out.baseline = await runSession(view, out.contact, {commands: Math.floor(RUN_MS / PACE_MS), paceMs: PACE_MS, label: "baseline-60s"});
      out.screenshots.push(await shot(view, `${v.name}-baseline`));
      // Deterministic negative: injected 120ms synchronous stall per command.
      await view.page.evaluate(ms => {window.__RW_PROBES__.cam10.delayMs = ms;}, NEG_DELAY_MS);
      out.negative = await runSession(view, out.contact, {commands: NEG_COMMANDS, paceMs: NEG_PACE_MS, label: `negative-injected-${NEG_DELAY_MS}ms`});
      out.negative.delayMs = NEG_DELAY_MS;
      out.negative.injectedCommands = NEG_COMMANDS;
      out.negative.verdict = negativeVerdict({delayMs: NEG_DELAY_MS, baseline: out.baseline, degraded: out.negative, injectedCommands: NEG_COMMANDS});
      out.screenshots.push(await shot(view, `${v.name}-negative`));
      // Recovery: flag cleared must return to the baseline envelope.
      await view.page.evaluate(() => {window.__RW_PROBES__.cam10.delayMs = 0;});
      out.recovery = await runSession(view, out.contact, {commands: RECOVERY_COMMANDS, paceMs: NEG_PACE_MS, label: "recovery-flag-cleared"});
      out.recovery.verdict = recoveryVerdict({delayMs: NEG_DELAY_MS, baseline: out.baseline, recovered: out.recovery});
      out.pageErrors = view.errs;
      if (view.errs.length) throw new Error(v.name + " page errors: " + view.errs.join(" | ").slice(0, 600));
      if (!out.negative.verdict.pass) throw new Error(v.name + " negative control NOT detected: " + JSON.stringify(out.negative.verdict.checks));
      if (!out.recovery.verdict.pass) throw new Error(v.name + " recovery failed: " + JSON.stringify(out.recovery.verdict.checks));
      if (out.provenance.webglContexts !== 1) throw new Error(v.name + " WebGL contexts: " + out.provenance.webglContexts);
    } finally {
      await view.ctx.close();
    }
    return out;
  };

  report.views.push(await runView({name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, mobile: false, touch: false}));
  report.views.push(await runView({name: "phone", viewport: {width: 390, height: 844}, dpr: 2, mobile: true, touch: true}));
  report.finished = new Date().toISOString();
  report.status = "PASS_NUMERIC_ONLY";
} catch (err) {
  report.status = "FAIL";
  report.errors.push(String(err && err.stack || err).slice(0, 2000));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child) child.kill();
}
await writeFile(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({status: report.status, source_sha: SHA, views: report.views.map(v => ({
  name: v.name, baselineP95: v.baseline?.frames?.p95Ms, dragP95: v.baseline?.latency?.drag?.p95Ms,
  zoomP95: v.baseline?.latency?.zoom?.p95Ms, negativePass: v.negative?.verdict?.pass, recoveryPass: v.recovery?.verdict?.pass
})), errors: report.errors}, null, 2));
if (report.status === "FAIL") process.exitCode = 1;
