/**
 * OPS-09 (#333): one hosted-browser smoke per deployed SHA, against the LIVE site.
 *
 * Runs ONE serialized headless Chromium with SEQUENTIAL fresh contexts
 * (desktop 1440x900, then phone-sized 390x844 — no shared state between views)
 * against the publicly deployed game (default
 * https://home.darkmatter2222.com/rustwake/, override with RUSTWAKE_LIVE_URL).
 * Unlike scripts/capture-v2.mjs (local production preview, PASS_NUMERIC_ONLY),
 * this navigates to the real deployed URL and reads source_sha from the live
 * release-manifest.json over HTTPS (same TLS path as verify-live-release.mjs;
 * NODE_EXTRA_CA_CERTS is honored locally, plain HTTPS on GitHub runners).
 *
 * Per view it proves: canvas dataset.world3d === "ready" (stamped by world.js
 * only AFTER the first successful renderer.render), animation frames keep
 * advancing, visible controls exist and the Zoom in button works with the
 * canvas camera stamp equal to the synchronously applied zoom
 * (world.applyCamera -> body.dataset.lastZoomApplied), exactly ONE WebGL
 * context, zero pageErrors / same-origin failedRequests, no document scroll,
 * and a real screenshot artifact.
 *
 * Status contract: PASS (exit 0) only when the live manifest source_sha is
 * readable (and equals the expected SHA when one is given) AND every view
 * passes every assertion. Anything else is FAIL (exit 1) and must leave the
 * release UNVERIFIED even if the deployment receipt succeeded. The delivery
 * workflow's additive `hosted-browser` job runs this on an UNPRIVILEGED
 * GitHub-hosted runner after package+deploy+verify-live; repository code never
 * runs on the privileged deploy runner. One browser instance per SHA.
 *
 * This does not certify visual beauty, art parity or a physical handset;
 * sponsor visual G1 review of the screenshots is still owed.
 *
 * CLI: node scripts/capture-live.mjs [expected-deployed-sha]
 * Env: RUSTWAKE_LIVE_URL, RUSTWAKE_CAPTURE_OUT (default artifacts/live-smoke)
 */
import {chromium} from "playwright-core";
import {mkdir, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {httpsFetch} from "./verify-live-release.mjs";

export const DEFAULT_LIVE_URL = "https://home.darkmatter2222.com/rustwake/";
const SHA_RE = /^[0-9a-f]{40}$/;

export const VIEW_SPECS = [
  {name: "desktop", viewport: {width: 1440, height: 900}, dpr: 1, isMobile: false, touch: false},
  {name: "phone", viewport: {width: 390, height: 844}, dpr: 2, isMobile: true, touch: true},
];

export const LIMITATIONS = [
  "One headless Chromium/SwiftShader run against the live site; phone view is emulated, not a physical handset",
  "Cannot certify README/approved-yard art parity, genuine touch latency or player enjoyment; sponsor visual G1 review of these screenshots is still owed",
  "PASS retires the PASS_NUMERIC_ONLY local-preview caveat ONLY when this hosted-browser report is cited in the release receipt at the exact deployed SHA",
];

export function statusExitCode(status) {
  return status === "PASS" ? 0 : 1;
}

/** Parse the live release-manifest.json text; never throws. */
export function parseManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (err) {
    return {ok: false, sourceSha: null, error: "release-manifest.json is not valid JSON: " + err.message};
  }
  if (!manifest || typeof manifest !== "object" || !SHA_RE.test(String(manifest.source_sha || ""))) {
    return {ok: false, sourceSha: null, error: "release-manifest.json malformed: need source_sha (40-hex)"};
  }
  return {ok: true, sourceSha: manifest.source_sha, error: null};
}

/**
 * Pure per-view assertion list. A view passes only when this returns [].
 * Kept separate from Playwright so the verdict logic is deterministically
 * testable offline (tests/capture-live.test.mjs).
 */
export function viewFailures(view) {
  const failures = [];
  if (!view || typeof view !== "object") return ["view record missing"];
  if (view.probeError) failures.push("probe error: " + view.probeError);
  if (view.world3d !== "ready") failures.push("canvas world3d not ready: " + JSON.stringify(view.world3d));
  if (view.firstFrameRendered !== true) failures.push("first frame never rendered (world3d ready + rAF ticks required)");
  if (view.framesAdvancing !== true) failures.push("animation frames not advancing after first frame");
  if (view.shell !== "v2") failures.push("app shell is not v2: " + JSON.stringify(view.shell));
  if (!Number.isFinite(view.yaw) || Math.abs(view.yaw - 45) > .5) failures.push("fresh-save default yaw wrong: " + view.yaw);
  if (!Number.isFinite(view.elevation) || Math.abs(view.elevation - 35.264) > .5) failures.push("fresh-save default elevation wrong: " + view.elevation);
  if (!(view.canvasCssWidth > 0) || !(view.canvasCssHeight > 0)) failures.push("canvas has no visible size");
  if (view.documentScroll !== false) failures.push("document scrolls (mobile overflow)");
  if (!Array.isArray(view.buttons) || view.buttons.length === 0) failures.push("no visible controls found");
  else if (!view.buttons.includes("Zoom in")) failures.push("visible Zoom in control missing");
  if (view.stampMatchesApplied !== true) failures.push("camera dataset stamp does not equal synchronously applied zoom (stampMatchesApplied)");
  if (!Array.isArray(view.pageErrors) || view.pageErrors.length > 0) failures.push("pageErrors: " + JSON.stringify(view.pageErrors));
  if (!Array.isArray(view.failedRequests) || view.failedRequests.length > 0) failures.push("failedRequests: " + JSON.stringify(view.failedRequests));
  if (view.webglContextCount !== 1) failures.push("webglContextCount !== 1: " + JSON.stringify(view.webglContextCount));
  if (typeof view.screenshot !== "string" || !view.screenshot) failures.push("screenshot artifact missing");
  return failures;
}

/**
 * Shape the final report and compute PASS/FAIL from manifest gate + per-view
 * failures + runner errors. Pure and deterministic given its inputs.
 */
export function shapeReport({liveUrl, expectedSha = null, sourceSha = null, views = [], errors = [], started, completed}) {
  const report = {
    version: 1,
    check: "rustwake-hosted-browser-smoke",
    issue: 333,
    build: "hosted-live",
    live_url: liveUrl,
    expected_source_sha: expectedSha,
    source_sha: sourceSha,
    started,
    completed,
    views: views.map(v => ({...v, failures: viewFailures(v)})),
    errors: [...errors],
    limitations: LIMITATIONS,
    status: "UNKNOWN",
  };
  if (report.errors.length === 0 && sourceSha && views.length === VIEW_SPECS.length &&
      report.views.every(v => v.failures.length === 0)) {
    report.status = "PASS";
  } else {
    report.status = "FAIL";
  }
  return report;
}

const sleepDefault = ms => new Promise(r => setTimeout(r, ms));

/**
 * Real Playwright probe for ONE fresh context. Returns a view record; a probe
 * failure becomes a record with probeError (and a best-effort failure
 * screenshot) so the report still documents what the live site did.
 */
export async function probeView({browser, view, liveUrl, origin, outDir, sleep = sleepDefault}) {
  const ctx = await browser.newContext({
    viewport: view.viewport, deviceScaleFactor: view.dpr,
    isMobile: view.isMobile, hasTouch: view.touch, reducedMotion: "reduce",
  });
  const errs = [], failed = [];
  let page = null;
  try {
    // Instrument BEFORE any page script: count unique WebGL contexts and rAF
    // ticks so webglContextCount and frame advancement are measured, not assumed.
    await ctx.addInitScript(() => {
      window.__rwSmoke = {webglContexts: 0, rafTicks: 0};
      const seen = new WeakSet();
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        const c = orig.call(this, type, ...rest);
        if (c && /webgl/i.test(String(type)) && !seen.has(c)) {
          seen.add(c);
          window.__rwSmoke.webglContexts++;
        }
        return c;
      };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => raf(t => {
        window.__rwSmoke.rafTicks++;
        cb(t);
      });
    });
    page = await ctx.newPage();
    page.on("pageerror", e => errs.push(String(e)));
    page.on("requestfailed", r => {
      try {
        if (new URL(r.url()).origin === origin) failed.push(r.url());
      } catch {}
    });
    await page.goto(liveUrl, {waitUntil: "domcontentloaded", timeout: 45000});
    await page.locator(".world-canvas").waitFor({state: "visible", timeout: 30000});
    // world.js stamps world3d="ready" only AFTER the first successful render.
    await page.waitForFunction(() => document.querySelector(".world-canvas")?.dataset.world3d === "ready", null, {timeout: 30000});
    await sleep(1100);
    const actual = await page.evaluate(() => {
      const c = document.querySelector(".world-canvas"), r = c?.getBoundingClientRect();
      return {
        world3d: c?.dataset.world3d,
        yaw: Number(c?.dataset.cameraYaw), elevation: Number(c?.dataset.cameraElevation),
        canvasCssWidth: r?.width, canvasCssHeight: r?.height,
        documentScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) > innerHeight + 2 ||
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 2,
        buttons: [...document.querySelectorAll("button")].map(b => b.getAttribute("aria-label") || b.innerText.trim()).filter(Boolean).slice(0, 30),
        shell: document.querySelector(".app-shell")?.dataset.world,
        webglContextCount: window.__rwSmoke?.webglContexts,
        rafTicks: window.__rwSmoke?.rafTicks,
      };
    });
    const filename = view.name + "-live.png";
    await page.screenshot({path: resolve(outDir, filename), fullPage: false, animations: "disabled"});
    // Visible Zoom in control must work; the canvas stamp (written
    // synchronously by world.applyCamera) must equal the applied zoom.
    const beforeZoom = Number(await page.locator(".world-canvas").evaluate(c => c.dataset.cameraZoom));
    await page.getByRole("button", {name: "Zoom in"}).click();
    await page.waitForFunction(p => {
      const c = document.querySelector(".world-canvas");
      return !!c && Number(c.dataset.cameraZoom) > p;
    }, beforeZoom, {timeout: 8000, polling: 50});
    const stamp = await page.evaluate(() => ({
      zoom: Number(document.querySelector(".world-canvas").dataset.cameraZoom),
      applied: Number(document.body.dataset.lastZoomApplied),
    }));
    const stampMatchesApplied = Number.isFinite(stamp.applied) && Math.abs(stamp.zoom - stamp.applied) <= 1e-6;
    // Prove the render loop keeps advancing (ongoing animation, not a still).
    await sleep(400);
    const ticksAfter = await page.evaluate(() => window.__rwSmoke?.rafTicks ?? -1);
    return {
      name: view.name, viewport: view.viewport, ...actual,
      firstFrameRendered: actual.world3d === "ready" && actual.rafTicks > 0,
      framesAdvancing: ticksAfter > actual.rafTicks,
      pageErrors: errs, failedRequests: failed, screenshot: filename,
      stampMatchesApplied,
      zoomProof: {before: beforeZoom, after: stamp.zoom, applied: stamp.applied},
    };
  } catch (e) {
    let failureShot = null;
    if (page) {
      try {
        failureShot = view.name + "-live-failure.png";
        await page.screenshot({path: resolve(outDir, failureShot), fullPage: false, animations: "disabled"});
      } catch {
        failureShot = null;
      }
    }
    return {
      name: view.name, viewport: view.viewport,
      probeError: String(e && e.stack || e),
      pageErrors: errs, failedRequests: failed, screenshot: failureShot,
    };
  } finally {
    await ctx.close();
  }
}

/**
 * Orchestrates the whole smoke. Injectable fetchImpl / launchImpl /
 * probeViewImpl keep the gate + report + exit semantics deterministically
 * testable offline; defaults perform the real hosted live capture.
 * Always writes <outDir>/report.json, even on FAIL. Never throws for
 * verification outcomes.
 */
export async function runLiveSmoke({
  baseUrl = DEFAULT_LIVE_URL,
  expectedSha = null,
  outDir,
  fetchImpl = httpsFetch,
  launchImpl = () => chromium.launch({headless: true, args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}),
  probeViewImpl = probeView,
  sleep = sleepDefault,
  now = () => new Date().toISOString(),
} = {}) {
  const started = now();
  const errors = [];
  let sourceSha = null;
  const views = [];
  let liveUrl;
  try {
    liveUrl = new URL(baseUrl).href;
  } catch {
    errors.push("Invalid live URL: " + baseUrl);
    liveUrl = String(baseUrl);
  }
  const origin = (() => {
    try {
      return new URL(liveUrl).origin;
    } catch {
      return null;
    }
  })();
  await mkdir(outDir, {recursive: true});

  if (expectedSha !== null && !SHA_RE.test(String(expectedSha))) {
    errors.push("expected deployed SHA missing or not a full 40-hex commit id: " + expectedSha);
  }

  // Manifest gate BEFORE spending a browser: read the live source_sha over
  // HTTPS and refuse to smoke the wrong build.
  if (errors.length === 0) {
    const manifestUrl = new URL("release-manifest.json", liveUrl.endsWith("/") ? liveUrl : liveUrl + "/").href;
    let res = null;
    try {
      res = await fetchImpl(manifestUrl);
    } catch (err) {
      errors.push("release-manifest.json unreachable: " + String(err && err.message || err));
    }
    if (res && res.status !== 200) {
      errors.push("release-manifest.json unreachable: HTTP " + res.status);
      res = null;
    }
    if (res) {
      const parsed = parseManifest(res.buffer.toString("utf8"));
      if (!parsed.ok) errors.push(parsed.error);
      else {
        sourceSha = parsed.sourceSha;
        if (expectedSha !== null && sourceSha !== expectedSha) {
          errors.push(`live manifest source_sha ${sourceSha} != expected deployed SHA ${expectedSha} — refusing to smoke the wrong build`);
        }
      }
    }
  }

  let browser = null;
  if (errors.length === 0) {
    try {
      // ONE serialized Chromium instance; fresh sequential contexts per view.
      browser = await launchImpl();
      for (const view of VIEW_SPECS) {
        views.push(await probeViewImpl({browser, view, liveUrl, origin, outDir, sleep}));
      }
    } catch (err) {
      errors.push("browser smoke runner error: " + String(err && err.stack || err));
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {}
      }
    }
  }

  const report = shapeReport({liveUrl, expectedSha, sourceSha, views, errors, started, completed: now()});
  await writeFile(resolve(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

export async function main(argv) {
  const expectedSha = argv[0] || null;
  const baseUrl = process.env.RUSTWAKE_LIVE_URL || DEFAULT_LIVE_URL;
  const outDir = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "artifacts/live-smoke");
  const report = await runLiveSmoke({baseUrl, expectedSha, outDir});
  console.log("Rustwake hosted live browser smoke:", report.status,
    "source_sha=" + report.source_sha, "expected=" + report.expected_source_sha, outDir,
    JSON.stringify(report.views.map(v => ({view: v.name, world: v.world3d, failures: v.failures.length}))));
  if (report.errors.length) console.error(report.errors.join("\n"));
  for (const v of report.views) if (v.failures.length) console.error(v.name + ": " + v.failures.join("; "));
  return statusExitCode(report.status);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  }).catch(err => {
    console.error("hosted-browser-smoke: FAIL unexpected error:", err);
    process.exitCode = 1;
  });
}
