// Catch-up stall probe (B-02, spec 18.5, spec 21.5 "avoid main-thread stalls over 100 ms").
//
// Two runs of the same 12 h absence at phone size, each in its own browser context:
//   worker  - the shipped path, the catch-up is settled in a module worker;
//   inline  - the same code with `Worker` removed before the bundle runs, so the
//             identical function is executed on the main thread.
// Each run reports the long tasks the page saw, the adoption latency between the two
// marks the store writes, and the time from a primary tap to the dock repainting.
// Page-level numbers from one desktop Chrome instance: not a device trace (BL-01).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.PROBE_URL ?? "http://localhost:4173/";
const AWAY_HOURS = 12;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function summarise(list) {
  if (!list.length) return { count: 0 };
  const sorted = [...list].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    count: sorted.length,
    median: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
    over100: sorted.filter((d) => d > 100).length,
  };
}

const seed = JSON.parse(readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8"));
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean)[0];

const browser = await chromium.launch({ executablePath });

async function run(tag, inline) {
  const shifted = JSON.parse(JSON.stringify(seed));
  shifted.payload.lastSeenMs -= AWAY_HOURS * 3600000;
  const envelope = { ...shifted, checksum: fnv1a(JSON.stringify(shifted.payload)) };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(([key, value, noWorker]) => {
    window.localStorage.setItem(key, value);
    if (noWorker) {
      // Force the synchronous branch of the same function (src/game/workers/catchup.ts).
      globalThis.Worker = undefined;
    }
    // Long tasks are recorded before the bundle runs so the very first one is counted.
    const list = [];
    globalThis.__lt = list;
    try {
      new PerformanceObserver((items) => {
        for (const item of items.getEntries()) list.push(Math.round(item.duration));
      }).observe({ type: "longtask", buffered: true });
    } catch (error) {
      // No long-task support: the list stays empty and the table says so.
    }
  }, ["rustwake.save.v1", JSON.stringify(envelope), inline]);

  await page.goto(url, { waitUntil: "load" });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").startsWith("Begin")
    );
    if (btn) btn.click();
  });
  // The indicator is only painted while the handoff is still in flight, so the count
  // right after the gate is the honest answer for this device.
  const duringHandoff = await page.evaluate(() => ({
    reconcileNodes: document.querySelectorAll(".reconcile").length,
    hudNodes: document.querySelectorAll(".hud").length,
  }));
  await page.waitForFunction(
    () => (document.querySelector(".panel") ?? { textContent: "" }).textContent.includes("Away"),
    null,
    { timeout: 15000 }
  );
  const numbers = await page.evaluate(() => {
    const markTime = (name) => {
      const entries = performance.getEntriesByName(name);
      return entries.length ? Math.round(entries[entries.length - 1].startTime) : null;
    };
    const start = markTime("rustwake:catchup-start");
    const adopted = markTime("rustwake:catchup-adopted");
    const first = performance.getEntriesByType("paint")[0];
    const panelText = () =>
      [...document.querySelectorAll(".panel")]
        .map((node) => node.textContent ?? "")
        .find((text) => text.includes("Away")) ?? "";
    const primary = document.querySelector(".dock__btn--primary");
    const before = primary ? primary.textContent ?? "" : "";
    const t0 = performance.now();
    if (primary) primary.click();
    return new Promise((resolvePage) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const afterNode = document.querySelector(".dock__btn--primary");
          const after = afterNode ? afterNode.textContent ?? "" : "";
          resolvePage({
            start,
            adopted,
            handoffMs: start !== null && adopted !== null ? adopted - start : null,
            firstPaintMs: first ? Math.round(first.startTime) : null,
            inputAckMs: Math.round(performance.now() - t0),
            labelChanged: before !== after,
            before,
            after,
            longTasks: globalThis.__lt ?? [],
            report: panelText().slice(0, 200),
            reconciling: [...document.querySelectorAll(".reconcile")].map((node) => node.textContent),
            backed: typeof Worker === "undefined" ? "sync" : "worker",
          });
        });
      });
    });
  });
  console.log(
    `${tag} (${numbers.backed}): first paint ${numbers.firstPaintMs} ms, handoff ${numbers.handoffMs} ms, ` +
      `long tasks ${JSON.stringify(summarise(numbers.longTasks))} raw ${JSON.stringify(numbers.longTasks)}, ` +
      `input ack ${numbers.inputAckMs} ms, primary "${numbers.before}" -> "${numbers.after}" changed=${numbers.labelChanged}`
  );
  console.log(
    `  report: ${numbers.report}` +
      ` | after the gate tap: ${duringHandoff.reconcileNodes} reconcile line(s), ${duringHandoff.hudNodes} hud root(s)`
  );
  await context.close();
  return numbers;
}

await run("worker", false);
await run("inline", true);
await browser.close();
