// STRAT-001 g1: real browser interaction for the naive policy.
// Clicks the most prominent bottom dock button (.dock__btn--primary) once per second
// and records the label it carried, the objective line, and the stored sim numbers.
// Run (with the dev server on 5175): npx tsx work/feedback/strat001-interact.mjs
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const URL = "http://localhost:5175/";
const TAPS = 200;
const TARGET = "work/feedback/strat001-interact.json";
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const browser = await chromium.launch({ executablePath: candidates[0] });
const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
const page = await context.newPage();
await page.goto(URL, { waitUntil: "load" });
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
await page.waitForTimeout(300);

const timeline = [];
for (let tap = 1; tap <= TAPS; tap += 1) {
  const before = await page.evaluate(() => {
    const primary = document.querySelector(".dock__btn--primary");
    const raw = localStorage.getItem("rustwake.save.v1");
    const sim = raw ? JSON.parse(raw).payload.sim : null;
    return {
      label: primary ? primary.textContent : null,
      count: document.querySelectorAll(".dock .dock__btn").length,
      objective: document.querySelector(".objective")?.textContent ?? null,
      tick: sim ? sim.tick : null,
      tutorial: sim ? sim.tutorial : null,
      credits: sim ? sim.credits : null,
      machines: sim ? sim.machines.length : null,
      batches: sim ? sim.machines.reduce((s, m) => s + m.batchesDone, 0) : null,
    };
  });
  const primary = page.locator(".dock__btn--primary");
  if (await primary.count() > 0) await primary.first().click({ force: true });
  timeline.push({ tap, ...before });
  await page.waitForTimeout(1000);
}

const after = await page.evaluate(() => {
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  if (!sim) return null;
  return {
    tick: sim.tick,
    tutorial: sim.tutorial,
    machines: sim.machines.length,
    links: sim.routes.length,
    drones: 1 + (sim.spares ? sim.spares.length : 0),
    batches: sim.machines.reduce((s, m) => s + m.batchesDone, 0),
    credits: Math.round(sim.credits),
    nodes: Object.keys(sim.research ?? {}).length,
    levels: sim.machines.map((m) => m.blueprint + ":L" + m.level).join(" "),
    store: Object.entries(sim.store).filter(([, v]) => v > 0).map(([k, v]) => k + "=" + v).join(" "),
  };
});
const dockButtons = await page.evaluate(() =>
  [...document.querySelectorAll(".dock .dock__btn")].map((n) => n.textContent));

await browser.close();
writeFileSync(TARGET, JSON.stringify({ url: URL, viewport: "360x640", taps: TAPS, timeline, after, dockButtons }, null, 1), "utf8");
const labels = timeline.map((t) => t.label);
console.log("first 12 labels:", JSON.stringify(labels.slice(0, 12)));
console.log("distinct labels:", JSON.stringify([...new Set(labels)]));
console.log("after:", JSON.stringify(after));
console.log("dock buttons at end:", JSON.stringify(dockButtons));
console.log("wrote " + TARGET);
