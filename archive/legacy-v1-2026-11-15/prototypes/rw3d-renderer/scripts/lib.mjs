// Shared helpers for bench/capture: build, preview server on 4310, browser.
import { chromium } from "playwright-core";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const protoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(protoRoot, "..", "..");
export const evidenceDir = resolve(repoRoot, "docs", "evidence");
export const PREFIX = "2026-11-14-rw3d-t03";
export const PREVIEW_URL = "http://localhost:4310/";

export function headSha() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: protoRoot, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

export function ensureBuild() {
  if (existsSync(resolve(protoRoot, "dist", "index.html"))) return;
  const r = spawnSync("pnpm", ["exec", "vite", "build"], { cwd: protoRoot, stdio: "inherit", shell: true });
  if (r.status !== 0) throw new Error(`vite build failed with exit ${r.status}`);
}

export async function startPreview() {
  ensureBuild();
  const child = spawn("pnpm", ["exec", "vite", "preview", "--port", "4310", "--strictPort"], {
    cwd: protoRoot, shell: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(PREVIEW_URL, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return child;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  stopPreview(child);
  throw new Error("preview server did not start on 4310 within 30s");
}

export function stopPreview(child) {
  if (!child || child.exitCode !== null) return;
  // Windows: kill the whole tree (shell -> node vite preview).
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

// House pattern (scripts/capture.mjs): system Chrome/Edge via playwright-core.
// Headless may fall back to SwiftShader; we record which rasterizer ran.
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
