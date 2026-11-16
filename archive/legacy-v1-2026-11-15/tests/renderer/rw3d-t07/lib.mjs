// Shared helpers for the T07 bench/capture: vite dev server on 4314 + system
// Chrome/Edge via playwright-core (house pattern: prototypes/rw3d-renderer/scripts,
// port offset from 4310 so parallel issue sessions never collide).
// The dev server transforms the TS renderer modules on the fly — no build step,
// and nothing outside tests/renderer + docs/evidence is written.
import { chromium } from "playwright-core";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const harnessRoot = resolve(dirname(fileURLToPath(import.meta.url)));
export const repoRoot = resolve(harnessRoot, "..", "..", "..");
export const evidenceDir = resolve(repoRoot, "docs", "evidence");
export const PREFIX = "2026-11-14-rw3d-t07";
export const HARNESS_URL = "http://localhost:4314/tests/renderer/rw3d-t07/harness.html";

export function headSha() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

export async function startDevServer() {
  const child = spawn("npx", ["vite", "--port", "4314", "--strictPort"], {
    cwd: repoRoot, shell: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HARNESS_URL, { signal: AbortSignal.timeout(1500) });
      // Verify it is OUR harness, not another session's SPA fallback.
      if (res.ok && (await res.text()).includes("RW3D T07 camera/selection harness")) return child;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  stopDevServer(child);
  throw new Error("vite dev server did not start on 4314 within 45s");
}

export function stopDevServer(child) {
  if (!child || child.exitCode !== null) return;
  // Windows: kill the whole tree (shell -> node vite).
  spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
}

export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Chrome/Edge executable found; set CHROME_PATH");
  return found;
}

async function probeGl(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return null;
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
  } finally {
    await page.close();
  }
}

// Headless may fall back to SwiftShader; record which rasterizer actually ran.
export async function launchBrowser() {
  const executablePath = findBrowser();
  let browser = await chromium.launch({ executablePath, headless: true });
  let gl = await probeGl(browser);
  let swiftshaderForced = false;
  if (!gl) {
    await browser.close();
    browser = await chromium.launch({
      executablePath, headless: true,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    gl = await probeGl(browser);
    swiftshaderForced = true;
    if (!gl) { await browser.close(); throw new Error("WebGL unavailable even with SwiftShader"); }
  }
  return { browser, executablePath, probeRenderer: gl, swiftshaderForced };
}

export function percentile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return +sorted[idx].toFixed(3);
}