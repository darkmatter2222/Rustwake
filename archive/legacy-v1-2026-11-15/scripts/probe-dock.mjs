// Temporary probe: what each dock button really measures at 360 x 640, for the three
// ladder states the dock can show (plain build/upgrade, the research label, and the
// fleet price). Each state loads in its own browser context, because the tabs share one
// localStorage per origin and a second tab would otherwise mirror the first (spec 22.3).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
const raw = JSON.parse(
  readFileSync(resolve(root, "docs/evidence/yard-mature.json"), "utf8")
);
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates[0];

const browser = await chromium.launch({ executablePath });

/** One state of the dock at 360 × 640: labels, per-button boxes, and the HUD band. */
async function measure(tag, mutate, detail) {
  const seed = JSON.parse(JSON.stringify(raw));
  mutate(seed.payload.sim);
  const envelope = { ...seed, checksum: fnv1a(JSON.stringify(seed.payload)) };
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ["rustwake.save.v1", JSON.stringify(envelope)]
  );
  await page.goto("http://localhost:4173/", { waitUntil: "load" });
  await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
  await page.waitForTimeout(400);
  const result = await page.evaluate(
    (wantDetail) => {
      const boxes = (selector) =>
        [...document.querySelectorAll(selector)].map((node) => {
          const b = node.getBoundingClientRect();
          return [b.x, b.y, b.width, b.height];
        });
      const rects = [...boxes(".hud__top"), ...boxes(".objective"), ...boxes(".dock")];
      const xs = [...new Set(rects.flatMap((b) => [b[0], b[0] + b[2]]))].sort((a, b) => a - b);
      const ys = [...new Set(rects.flatMap((b) => [b[1], b[1] + b[3]]))].sort((a, b) => a - b);
      let area = 0;
      for (let i = 0; i < xs.length - 1; i += 1) {
        for (let j = 0; j < ys.length - 1; j += 1) {
          const cx = (xs[i] + xs[i + 1]) / 2;
          const cy = (ys[j] + ys[j + 1]) / 2;
          if (rects.some(([x, y, w, h]) => cx >= x && cx <= x + w && cy >= y && cy <= y + h)) {
            area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
          }
        }
      }
      const dock = document.querySelector(".dock");
      const textLines = (node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length;
      };
      const buttons = [...document.querySelectorAll(".dock .dock__btn")].map((node) => {
        const rect = node.getBoundingClientRect();
        return wantDetail
          ? {
              text: node.textContent,
              w: Math.round(rect.width),
              h: Math.round(rect.height),
              labelLines: node.firstChild ? textLines(node.firstChild) : 0,
              cost: node.querySelector(".dock__cost")?.textContent ?? null,
              padding: getComputedStyle(node).padding,
            }
          : `${node.textContent}:${Math.round(rect.width)}x${Math.round(rect.height)}`;
      });
      return {
        objective: document.querySelector(".objective")?.textContent ?? null,
        stored: (() => {
          const text = localStorage.getItem("rustwake.save.v1");
          if (!text) return null;
          const sim = JSON.parse(text).payload.sim;
          return {
            data: sim.store.data,
            credits: sim.credits,
            spares: Array.isArray(sim.spares) ? sim.spares.length : typeof sim.spares,
            role: document.querySelector(".role")?.textContent ?? null,
          };
        })(),
        dock: { w: Math.round(dock.getBoundingClientRect().width), gap: getComputedStyle(dock).gap },
        buttons,
        band: Math.round((area / (innerWidth * innerHeight)) * 1000) / 10,
      };
    },
    detail === true
  );
  console.log(
    `${tag} step: ${result.objective}\n` +
      `${tag} dock: width ${result.dock.w} gap ${result.dock.gap} | ${
        Array.isArray(result.buttons) ? result.buttons.join(" ") : ""
      } | band ${result.band} %`
  );
  if (detail === true) console.log(JSON.stringify(result.buttons, null, 1));
  console.log(`${tag} stored: ${JSON.stringify(result.stored)}`);
  await context.close();
}

// State 1: the shipped mature yard as the probe seed writes it.
await measure("starter", (sim) => (sim.credits = 130), true);
// State 2: the research step, whose label is the longest the ladder can produce
// ("Research Efficient Cutters").
await measure("research", (sim) => {
  sim.research = {};
  sim.store.data = 10;
  sim.storeUnits += 10;
});
// State 3: the fleet step (`Add drone` over its price), the shortest primary label the
// ladder produces. Every node is already at its single rank, so the research stage has
// nothing left to answer and the fleet stage leads with the first 45-credit price.
await measure("fleet", (sim) => {
  sim.research = { cutters: 1, buffers: 1, dispatch: 1 };
  sim.spares = [];
  sim.credits = 45;
});
await browser.close();
