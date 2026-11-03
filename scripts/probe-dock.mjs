// Temporary probe: what each dock button really measures at 360 x 640.
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
raw.payload.sim.credits = 130;
raw.payload.settings = { ...(raw.payload.settings ?? {}), textScale: 1 };
const envelope = { ...raw, checksum: fnv1a(JSON.stringify(raw.payload)) };
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates[0];

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
await page.addInitScript(
  ([key, value]) => window.localStorage.setItem(key, value),
  ["rustwake.save.v1", JSON.stringify(envelope)]
);
await page.goto("http://localhost:4173/", { waitUntil: "load" });
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
await page.waitForTimeout(400);
const info = await page.evaluate(() => {
  const dock = document.querySelector(".dock");
  const style = getComputedStyle(dock);
  const textLines = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getClientRects().length;
  };
  return {
    objective: document.querySelector(".objective")?.textContent ?? null,
    dock: { w: Math.round(dock.getBoundingClientRect().width), gap: style.gap },
    buttons: [...document.querySelectorAll(".dock .dock__btn")].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        text: node.textContent,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        labelLines: node.firstChild ? textLines(node.firstChild) : 0,
        cost: node.querySelector(".dock__cost")?.textContent ?? null,
        padding: getComputedStyle(node).padding,
      };
    }),
  };
});
console.log(JSON.stringify(info, null, 1));

// Second state: the research step on screen, whose label is the longest the ladder
// can produce ("Research Efficient Cutters"), measured the same way.
const researchSeed = JSON.parse(JSON.stringify(raw));
researchSeed.payload.sim.research = {};
researchSeed.payload.sim.store.data = 10;
researchSeed.payload.sim.storeUnits += 10;
const researchEnvelope = {
  ...researchSeed,
  checksum: fnv1a(JSON.stringify(researchSeed.payload)),
};
const researchPage = await browser.newPage({ viewport: { width: 360, height: 640 } });
await researchPage.addInitScript(
  ([key, value]) => window.localStorage.setItem(key, value),
  ["rustwake.save.v1", JSON.stringify(researchEnvelope)]
);
await researchPage.goto("http://localhost:4173/", { waitUntil: "load" });
await researchPage.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
await researchPage.waitForTimeout(400);
console.log("research step:", await researchPage.textContent(".objective"));
console.log(
  "research dock row:",
  await researchPage.evaluate(() => {
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
    const visual = { width: innerWidth, height: innerHeight };
    return (
      [...document.querySelectorAll(".dock .dock__btn")]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return `${node.textContent}:${Math.round(rect.width)}x${Math.round(rect.height)}`;
        })
        .join(" ") +
      ` | band ${Math.round((area / (visual.width * visual.height)) * 1000) / 10} %`
    );
  })
);
await browser.close();
