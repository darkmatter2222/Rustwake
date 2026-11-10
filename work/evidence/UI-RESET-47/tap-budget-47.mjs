// Instrumented press-budget harness for UI-RESET/NAV (#47). Usage: node work/evidence/UI-RESET-47/tap-budget-47.mjs
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
const root = process.cwd();
const outDir = resolve(root, "work/evidence/UI-RESET-47");
const captures = resolve(outDir, "captures");
const dist = resolve(root, "dist");
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  try { const f = resolve(dist, "." + p); res.writeHead(200, { "content-type": mime[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(4175, "127.0.0.1", r));
for (let i = 0; i < 10; i += 1) { if ((await face(".dock__btn--primary")).startsWith("Build Scrap sorter")) break; await click(".dock__btn--primary"); }
A.firstMachineFace = await face(".dock__btn--primary");
await click(".dock__btn--primary");
A.machinePress = presses;
A.rateAtFirstMachine = rateFrom(await txt(page));
await page.screenshot({ path: resolve(captures, "60-tbudget-app-machine.png") });
let probes = 0;
let insp = "";
for (let a = 0; a < 4; a += 1) {
  for (let x = 60; x <= 330 && !insp.includes("Actual rate"); x += 20) for (let y = 150; y <= 640; y += 20) { probes += 1; await page.mouse.click(x, y); await page.waitForTimeout(70); insp = await txt(page); if (insp.includes("Actual rate")) break; }
  if (insp.includes("Actual rate")) break;
  const c = await page.$("#insp-close");
  if (c) { await c.click(); await page.waitForTimeout(100); }
}
A.probes = probes;
A.presses = presses;
let prod = A.rateAtFirstMachine;
for (let i = 0; i < 16; i += 1) {
  const r = rateFrom(await txt(page));
  if (r && !r.startsWith("0.00")) { prod = r; break; }
  await page.click(".dock__btn--primary"); presses += 1; await page.waitForTimeout(650);
  if (!(await page.$("#insp-close"))) { for (let x = 60; x <= 330; x += 20) for (let y = 150; y <= 640; y += 20) { probes += 1; await page.mouse.click(x, y); await page.waitForTimeout(60); const s2 = await txt(page); if (s2.includes("Actual rate")) { prod = rateFrom(s2); break; } } }
}
A.productionReading = prod;
A.pressProduction = presses;
A.tick = await page.evaluate(() => { const m = /tick (\d+)/.exec(document.querySelector("#tut-lines") ? document.querySelector("#tut-lines").textContent : ""); return m ? Number(m[1]) : null; });
await page.screenshot({ path: resolve(captures, "61-tbudget-app-production.png") });
await page.close();
const B = { steps: [] };
const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p2.goto("file:///" + resolve(outDir, "prototype-nav.html").replaceAll("\\", "/"), { waitUntil: "load" });
await p2.waitForSelector("#action-primary");
let n = 0;
for (let i = 0; i < 40; i += 1) {
  const st = await p2.evaluate(() => { const b = document.getElementById("action-primary"); const s = window.RW47.state(); return { disabled: b.disabled, label: b.textContent.trim(), machines: s.machines }; });
  if (st.machines.length && !st.machines[0].rate.startsWith("0.00")) { B.productionAtPress = n; break; }
  if (st.disabled) break;
  await p2.evaluate(() => window.RW47.tap(document.getElementById("action-primary")));
  await p2.waitForTimeout(120);
  n += 1;
  B.steps.push({ press: n, label: st.label });
}
B.machinePress = await p2.evaluate(() => window.RW47.log().reduce((a, e) => (e.m === "place" && a === null ? e.n : a), null));
B.storePress = await p2.evaluate(() => window.RW47.log().reduce((a, e) => (e.m === "nav:Store" && a === null ? e.n : a), null));
B.productionReading = await p2.evaluate(() => { const m = /Actual rate:\s*(\d+\.\d+ batches\/s[^M]*?window)/.exec(document.querySelector("#insp-body") ? document.querySelector("#insp-body").textContent : ""); return m ? m[1] : ""; });
B.pressed = await p2.evaluate(() => window.RW47.pressed());
B.machines = await p2.evaluate(() => window.RW47.state().machines);
await p2.screenshot({ path: resolve(captures, "62-tbudget-proto-machine.png") });
await p2.evaluate(() => window.RW47.boot("mature"));
await p2.waitForTimeout(150);
await p2.evaluate(() => window.RW47.tap(document.getElementById("nav-store")));
await p2.waitForTimeout(150);
B.storeRows = await p2.evaluate(() => Array.from(document.querySelectorAll("#insp-body button")).slice(0, 2).map((b) => b.textContent.trim().replace(/\s+/g, " ")));
await p2.screenshot({ path: resolve(captures, "63-tbudget-proto-store.png") });
await p2.close();
writeFileSync(resolve(outDir, "tap-budget.json"), JSON.stringify({ audit: { presses: 16, reading: "0.00 batches/s - 1s window", source: "work/evidence/UI-RESET-45/journey-map.md J1" }, app: A, prototype: B }, null, 2));
console.log("APP presses=" + A.presses + " probes=" + A.probes + " machinePress=" + A.machinePress + " rate=" + A.rateAtFirstMachine + " production=" + A.productionReading + " pressProd=" + A.pressProduction + " tick=" + A.tick);
console.log("PROTO pressed=" + B.pressed + " machinePress=" + B.machinePress + " prodAtPress=" + B.productionAtPress + " reading=" + B.productionReading + " storePress=" + B.storePress);
console.log("PROTO machines=" + JSON.stringify(B.machines) + " storeRows=" + JSON.stringify(B.storeRows));
await browser.close();
server.close();
