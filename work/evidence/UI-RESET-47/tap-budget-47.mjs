// Instrumented press-budget harness for UI-RESET/NAV (#47, #81 P0-2).
// Usage, from the worktree root after `npm ci && npm run build`:
//   node work/evidence/UI-RESET-47/tap-budget-47.mjs
// Serves dist/ itself on 127.0.0.1:4175 (no preview server needed) and drives the prototype over file://.
// Writes tap-budget.json (the committed model-path press receipt) plus captures/60..63 PNGs and their
// one-entry-each receipt captures/captures-tbudget.json. Run capture-nav-47.mjs first: its session A
// summary is embedded here as the presses-vs-auto-settle decomposition of the shipped ladder.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
const root = process.cwd();
const outDir = resolve(root, "work/evidence/UI-RESET-47");
const captures = resolve(outDir, "captures");
const dist = resolve(root, "dist");
const headSha = process.env.RUSTWAKE_SHA ?? "pending-stamp";
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  try { const f = resolve(dist, "." + p); res.writeHead(200, { "content-type": mime[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(4175, "127.0.0.1", r));
const exe = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find((e) => existsSync(e));
const browser = await chromium.launch({ executablePath: exe });
function rateFrom(t) { const m = /Actual rate:?\s*(\d+\.\d+ batches\/s[^M]*?window)/.exec(t); return m ? m[1] : String(t).slice(0, 90); }
const txt = (page) => page.evaluate(() => ((document.querySelector(".panel") || document.querySelector("#insp-body")) ? (document.querySelector(".panel") || document.querySelector("#insp-body")).textContent : ""));
const simOf = (page) => page.evaluate(() => { const raw = localStorage.getItem("rustwake.save.v1"); if (!raw) return null; const s = JSON.parse(raw).payload.sim; return { tick: s.tick, tutorial: s.tutorial, machines: s.machines.length, credits: s.credits, scrap: s.store.scrap ?? 0, batches: s.machines.reduce((a, m) => a + (m.batches ?? 0), 0) }; });
const tbudgetReceipt = [];
const shot = async (page, name, note, fields) => { await page.screenshot({ path: resolve(captures, name + ".png") }); tbudgetReceipt.push(Object.assign({ file: name + ".png", note }, fields)); console.log(name + ".png - " + note); };

// --- A. shipped shell: gate, store round trip, then the ladder to one producing machine ------
const A = { steps: [], presses: 0, settleWaits: 0, settleMs: 0 };
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:4175/", { waitUntil: "load" });
await page.waitForSelector("canvas");
const click = async (sel) => { await page.click(sel); A.presses += 1; await page.waitForTimeout(650); };
const face = async (sel) => (await page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent : ""; }, sel) || "").trim().replace(/\s+/g, " ");
await click("text=Begin recovery");
A.steps.push({ press: A.presses, face: "rest " + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll(".dock__btn")).map((b) => b.textContent.trim().replace(/\s+/g, " ")))) });
await click("button:text-is(\"Store\")");
A.steps.push({ press: A.presses, face: "store " + JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll(".panel button, #insp-body button")).map((b) => b.textContent.trim().replace(/\s+/g, " ")))) });
await click("button:text-is(\"Close\")");
// The ladder: press the primary while it makes progress; while it reads "waits", let the sim run
// (auto-settle, counted separately, never a press). Stop at the first placed machine.
for (let i = 0; i < 100 && A.presses < 40 && A.settleWaits < 60; i += 1) {
  const sim = await simOf(page);
  if (sim && sim.machines >= 1) { A.machinePress = A.presses; A.simAtMachine = sim; break; }
  const l = await face(".dock__btn--primary");
  if (/waits/.test(l)) { A.settleWaits += 1; A.settleMs += 500; await page.waitForTimeout(500); continue; }
  const pb = await page.$(".dock__btn--primary");
  if (!pb) break;
  await pb.click(); A.presses += 1; await page.waitForTimeout(650);
}
A.firstMachineFace = await face(".dock__btn--primary");
// Open the inspector with the #45 canvas tap grid (no DOM hit target on the world).
let probes = 0;
let insp = "";
for (let a = 0; a < 4; a += 1) {
  for (let x = 60; x <= 330 && !insp.includes("Actual rate"); x += 20) for (let y = 150; y <= 640; y += 20) { probes += 1; await page.mouse.click(x, y); await page.waitForTimeout(70); insp = await txt(page); if (insp.includes("Actual rate")) break; }
  if (insp.includes("Actual rate")) break;
  const c = await page.$("button:text-is(\"Close\")");
  if (c) { await c.click(); await page.waitForTimeout(100); }
}
A.probes = probes;
A.rateAtFirstMachine = insp.includes("Actual rate") ? rateFrom(insp) : "";
await shot(page, "60-tbudget-app-machine", "shipped shell, first machine placed, inspector open on the canvas tap grid", { presses: A.presses, settleWaits: A.settleWaits, settleMs: A.settleMs, probes, sim: A.simAtMachine ?? null });
let prod = A.rateAtFirstMachine;
for (let i = 0; i < 16; i += 1) {
  const r = rateFrom(await txt(page));
  if (r && !r.startsWith("0.00")) { prod = r; break; }
  const pb = await page.$(".dock__btn--primary");
  if (pb) { await pb.click(); A.presses += 1; await page.waitForTimeout(650); }
  if (!(await page.$("button:text-is(\"Close\")"))) { for (let x = 60; x <= 330; x += 20) for (let y = 150; y <= 640; y += 20) { probes += 1; await page.mouse.click(x, y); await page.waitForTimeout(60); const s2 = await txt(page); if (s2.includes("Actual rate")) { prod = rateFrom(s2); break; } } }
}
A.productionReading = prod;
A.pressProduction = A.presses;
A.probes = probes;
A.simAtProduction = await simOf(page);
A.tick = A.simAtProduction ? A.simAtProduction.tick : null;
await shot(page, "61-tbudget-app-production", "shipped shell, first non-zero Actual rate (or the last reading if none landed)", { presses: A.presses, settleWaits: A.settleWaits, settleMs: A.settleMs, probes, sim: A.simAtProduction });
await page.close();

// --- B. prototype: the same ladder counted by the prototype itself (S.pressed) --------------
const B = { steps: [] };
const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p2.goto("file:///" + resolve(outDir, "prototype-nav.html").replaceAll("\\", "/"), { waitUntil: "load" });
await p2.waitForSelector("#action-primary");
let n = 0;
for (let i = 0; i < 40; i += 1) {
  const st = await p2.evaluate(() => { const b = document.getElementById("action-primary"); const s = window.RW47.state(); return { disabled: b.disabled, label: b.textContent.trim(), machines: s.data.machines }; });
  if (st.machines.length && !st.machines[0].rate.startsWith("0.00")) { B.productionAtPress = n; break; }
  if (st.disabled) break;
  await p2.evaluate(() => window.RW47.tap("action-primary"));
  await p2.waitForTimeout(120);
  n += 1;
  B.steps.push({ press: n, label: st.label });
}
// The place press is the log entry whose painted label is the build step (log entries are {n, id, label}).
B.machinePress = await p2.evaluate(() => window.RW47.log().reduce((a, e) => (a === null && /^(Build Scrap sorter|Place )/.test(e.label) ? e.n : a), null));
B.freshPressed = await p2.evaluate(() => window.RW47.pressed());
B.machines = await p2.evaluate(() => window.RW47.state().data.machines);
// Open the machine from the Yard list so the Actual rate line is painted for the reading.
await p2.evaluate(() => window.RW47.tap("row-machine-1"));
await p2.waitForTimeout(120);
B.productionReading = await p2.evaluate(() => { const m = /Actual rate:?\s*(\d+\.\d+ batches\/s[^M]*?window)/.exec((document.querySelector("#insp-body") || document.body).textContent); return m ? m[1] : ""; });
B.modelNote = "prototype-nav.html is a static painted model: it has no sim tick, so the placed machine rate stays 0.00 and productionAtPress is null by construction, not by measurement failure";
await shot(p2, "62-tbudget-proto-machine", "prototype, fresh ladder end: machine inspector from the Yard list, one press, no canvas hunt", { pressed: B.freshPressed + 1, machinePress: B.machinePress, productionReading: B.productionReading });
await p2.evaluate(() => window.RW47.boot("mature"));
await p2.waitForTimeout(150);
await p2.evaluate(() => window.RW47.tap("nav-store"));
await p2.waitForTimeout(150);
B.storePress = await p2.evaluate(() => window.RW47.log().reduce((a, e) => (a === null && e.id === "nav-store" ? e.n : a), null));
B.storeRows = await p2.evaluate(() => Array.from(document.querySelectorAll("#insp-body button")).slice(0, 3).map((b) => b.textContent.trim().replace(/\s+/g, " ")));
await shot(p2, "63-tbudget-proto-store", "prototype, mature Store: rest to store rows in one press, the shortest loop", { pressed: B.storePress, storePress: B.storePress });
await p2.close();

// --- receipts ------------------------------------------------------------------------------
let decomposition = null;
const navPath = resolve(captures, "captures-nav.json");
if (existsSync(navPath)) {
  const nav = JSON.parse(readFileSync(navPath, "utf8"));
  const sA = (nav.sessions ?? []).find((s) => s.session.startsWith("A "));
  if (sA) decomposition = { source: "captures/captures-nav.json session A", presses: sA.presses, autoSettle: sA.autoSettle ?? null, note: "the full shipped ladder of capture-nav-47.mjs; presses are painted-face activations, autoSettle waits are sim frame steps" };
}
writeFileSync(resolve(outDir, "tap-budget.json"), JSON.stringify({ task: "UI-RESET/NAV #47 instrumented press budget (#81)", issue: "https://github.com/darkmatter2222/Rustwake/issues/47", headSha, headShaConvention: "stamped by stamp-headsha-47.mjs to the captures commit; see README.md", tool: "playwright-core plus local Chrome/Edge; dist served by this harness on 127.0.0.1:4175; prototype over file://", audit: { presses: 16, reading: "0.00 batches/s - 1s window", source: "work/evidence/UI-RESET-45/journey-map.md J1" }, decomposition, app: A, prototype: B }, null, 2) + "\n");
writeFileSync(resolve(captures, "captures-tbudget.json"), JSON.stringify({ task: "UI-RESET/NAV #47 tap-budget frames (#81)", issue: "https://github.com/darkmatter2222/Rustwake/issues/47", headSha, headShaConvention: "stamped by stamp-headsha-47.mjs to the captures commit; see README.md", tool: "tap-budget-47.mjs", note: "one entry per PNG; presses = shipped-shell painted-face activations, pressed = prototype own counter", captures: tbudgetReceipt }, null, 2) + "\n");
console.log("APP presses=" + A.presses + " settleWaits=" + A.settleWaits + " settleMs=" + A.settleMs + " probes=" + A.probes + " machinePress=" + A.machinePress + " rate=" + A.rateAtFirstMachine + " production=" + A.productionReading + " pressProd=" + A.pressProduction + " tick=" + A.tick);
console.log("PROTO freshPressed=" + B.freshPressed + " machinePress=" + B.machinePress + " reading=" + B.productionReading + " storePress=" + B.storePress);
console.log("PROTO machines=" + JSON.stringify(B.machines) + " storeRows=" + JSON.stringify(B.storeRows));
console.log("wrote tap-budget.json and " + tbudgetReceipt.length + " tbudget captures");
await browser.close();
server.close();
