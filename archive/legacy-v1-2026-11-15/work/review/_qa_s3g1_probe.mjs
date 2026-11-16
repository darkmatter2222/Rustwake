// QA STRAT-003 g1 independent probe. Usage:
//   node _qa_s3g1_probe.mjs <distDir> <port> <mode>   mode: priced | shortfall | def006 | cells
// Serves <distDir> on 127.0.0.1:<port> and drives Chromium (playwright-core from the
// strat001-player worktree, per assignment). Prints one JSON object per case.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
const require = createRequire("file:///C:/Users/ryans/.local/share/opencode/worktree/fe4e05/strat001-player/package.json");
const { chromium } = require("playwright-core");
const distDir = process.argv[2];
const port = Number(process.argv[3] || 4324);
const mode = process.argv[4] || "priced";
const exe = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((p) => existsSync(p));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const rel = (req.url || "/").split("?")[0].replace(/^\/+/, "");
  let file = distDir + "/" + (rel === "" ? "index.html" : rel);
  let raw = existsSync(file) ? readFileSync(file) : null;
  if (raw === null) raw = readFileSync(distDir + "/index.html"); // SPA fallback, like the static host
  const ext = file.slice(file.lastIndexOf("."));
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  res.end(raw);
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));
const url = `http://127.0.0.1:${port}/`;
const fnv1a = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
const SNAP = () => {
  const faces = [...document.querySelectorAll(".dock .dock__btn")].map((b) => {
    const r = b.getBoundingClientRect();
    return {
      text: (b.textContent ?? "").replace(/\s+/g, " ").trim(),
      cost: [...b.querySelectorAll(".dock__cost")].map((s) => s.textContent).join("|"),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    };
  });
  const rests = [...document.querySelectorAll(".status-line")].map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim());
  const toast = document.querySelector(".toast")?.textContent ?? null;
  const card = (document.querySelector(".objective")?.textContent ?? "").replace(/\s+/g, " ").trim();
  return { faces, rests, toast, card };
};
const isFork = (s) => s.faces.some((f) => f.text.startsWith("Faster batches")) && s.faces.some((f) => f.text.startsWith("Less power"));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const open = async (seedText, vpW = 360, vpH = 640, scale) => {
  const context = await browser.newContext({ viewport: { width: vpW, height: vpH }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const reqs = [];
  const errs = [];
  if (seedText) await context.addInitScript(([k, v]) => localStorage.setItem(k, v), ["rustwake.save.v1", seedText]);
  const page = await context.newPage();
  page.on("request", (r) => { if (/favicon\.ico(\?|$)/.test(r.url())) reqs.push(r.url()); });
  page.on("response", async (r) => { if (/favicon\.ico(\?|$)/.test(r.url())) { reqs.length; } });
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".gate__btn, .dock__btn", { timeout: 15000 });
  const gate = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((n) => (n.textContent ?? "").trim() === "Begin recovery") ?? null);
  if (gate.asElement()) await gate.asElement().click();
  const back = await page.evaluateHandle(() => [...document.querySelectorAll("button")].find((n) => (n.textContent ?? "").trim() === "Back to yard") ?? null);
  if (back.asElement()) await back.asElement().click();
  await page.waitForTimeout(200);
  return { context, page, reqs, errs };
};
const readSave = (page) => page.evaluate(() => {
  const raw = localStorage.getItem("rustwake.save.v1");
  if (!raw) return null;
  const e = JSON.parse(raw);
  const s = e.payload.sim;
  return { checksum: e.checksum, schemaVersion: e.payload.schemaVersion ?? e.schemaVersion, tick: s.tick, credits: s.credits, tutorial: s.tutorial, machines: s.machines.map((m) => ({ id: m.id, level: m.level, branch: m.branch ?? null })) };
});
const tapFace = (page, prefix) => page.evaluate(([p]) => {
  const b = [...document.querySelectorAll(".dock .dock__btn")].find((x) => (x.textContent ?? "").trim().startsWith(p));
  if (!b) return null;
  b.click();
  return (b.textContent ?? "").replace(/\s+/g, " ").trim();
}, [prefix]);
const tapPrimary = (page) => page.evaluate(() => {
  const p = document.querySelector(".dock__btn--primary") ?? document.querySelector(".dock .dock__btn");
  p?.click();
  return p ? (p.textContent ?? "").replace(/\s+/g, " ").trim() : null;
});
const toFork = async (page, max = 800) => {
  for (let i = 0; i < max; i++) {
    const s = await page.evaluate(SNAP);
    if (isFork(s)) return s;
    await tapPrimary(page);
    await page.waitForTimeout(120);
  }
  return null;
};

if (mode === "priced") {
  const out = { mode };
  for (const which of ["Faster batches", "Less power", "Upgrade"]) {
    const { context, page } = await open(null);
    const fork = await toFork(page);
    if (!fork) { out[which] = { fork: null, debug: await page.evaluate(() => ({ dock: !!document.querySelector(".dock"), btns: [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim()), body: (document.body.textContent ?? "").replace(/\s+/g, " ").slice(0, 200), keys: Object.keys(localStorage) })) }; await context.close(); continue; }
    const pre = await readSave(page);
    const hit = await tapFace(page, which);
    await page.waitForTimeout(600);
    const post = await readSave(page);
    const postSnap = await page.evaluate(SNAP);
    out[which] = {
      card: fork.card,
      faces: fork.faces,
      minFace: Math.min(...fork.faces.map((f) => Math.min(f.w, f.h))),
      tapped: hit,
      creditsBefore: pre?.credits, creditsAfter: post?.credits,
      delta: pre && post ? pre.credits - post.credits : null,
      levelsBefore: pre?.machines.map((m) => m.level), levelsAfter: post?.machines.map((m) => m.level),
      branchesAfter: post?.machines.map((m) => m.branch),
      postFaces: postSnap.faces, postCard: postSnap.card,
    };
    await context.close();
  }
  console.log(JSON.stringify(out));
} else if (mode === "shortfall") {
  // 1) organic run to the fork, capture the engine save; 2) replay it with credits := 34
  const { context, page } = await open(null);
  const fork = await toFork(page);
  const rawSave = await page.evaluate(() => localStorage.getItem("rustwake.save.v1"));
  await context.close();
  if (!fork || !rawSave) { console.log(JSON.stringify({ mode, error: "no fork/save" })); process.exit(1); }
  const env = JSON.parse(rawSave);
  env.payload.sim.credits = 34;
  const text = JSON.stringify(env.payload);
  const seed = JSON.stringify({ ...env, checksum: fnv1a(text) });
  const o2 = await open(seed);
  await o2.page.waitForTimeout(300);
  const s0 = await o2.page.evaluate(SNAP);
  const c0 = (await readSave(o2.page))?.credits;
  const dearLabel = await tapFace(o2.page, "Faster batches");
  await o2.page.waitForTimeout(300);
  const s1 = await o2.page.evaluate(SNAP);
  const c1 = (await readSave(o2.page))?.credits;
  const cheapLabel = await tapFace(o2.page, "Less power");
  await o2.page.waitForTimeout(300);
  const s2 = await o2.page.evaluate(SNAP);
  const c2 = (await readSave(o2.page))?.credits;
  console.log(JSON.stringify({
    mode, forkFacesOrganic: fork.faces.map((f) => [f.text, f.cost]),
    seeded: { faces: s0.faces, card: s0.card, credits: c0, rests: s0.rests },
    dearTapped: dearLabel, toastAfterDear: s1.toast, restsAfterDear: s1.rests, creditsAfterDear: c1,
    cheapTapped: cheapLabel, creditsAfterCheap: c2, deltaCheap: c1 !== null && c2 !== null ? c1 - c2 : null,
  }));
  await o2.context.close();
} else if (mode === "def006") {
  const { context, page } = await open(null);
  const fork = await toFork(page);
  const raw0 = await page.evaluate(() => localStorage.getItem("rustwake.save.v1"));
  await context.close();
  const env = JSON.parse(raw0);
  env.payload.sim.credits = 34;
  const t = JSON.stringify(env.payload);
  const seed = JSON.stringify({ ...env, checksum: fnv1a(t) });
  const o2 = await open(seed);
  await o2.page.waitForTimeout(400);
  const tailOf = (st) => st.rests.map((r) => (r.includes("Last") ? r : null)).find((x) => x !== null) ?? "(no Last tail)";
  const step = async (label, prefix, primary = false) => {
    const before = await o2.page.evaluate(SNAP);
    const hit = primary ? await tapPrimary(o2.page) : await tapFace(o2.page, prefix);
    await o2.page.waitForTimeout(320);
    const after = await o2.page.evaluate(SNAP);
    const cred = (await readSave(o2.page))?.credits;
    return { label, hit, toast: after.toast, tail: tailOf(after), credits: cred };
  };
  const seq = [];
  seq.push(await step("start", "")); // face inventory at 34
  seq.push(await step("block-faster-40>34", "Faster batches")); // must show tail "Last need 40 credits · have 34"
  seq.push(await step("success-draw-30", "Less power")); // must clear tail; credits 34->4
  let ok = 0, lastSuccess = null, nextBlock = null; const succLog = [];
  const readRev = () => o2.page.evaluate(() => { try { return JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim.revision; } catch { return -1; } });
  let prevCred = (await readSave(o2.page))?.credits ?? null;
  for (let i = 0; i < 60 && (ok < 10 || nextBlock === null); i++) {
    const rev = await readRev();
    const st = await o2.page.evaluate(SNAP);
    const onFork = st.faces.some((f) => f.text.startsWith("Faster batches"));
    const r = onFork ? await step("cheap" + i, "Less power") : await step("primary" + i, "", true);
    const rev2 = await readRev();
    const success = rev2 > rev || (r.credits !== null && r.credits !== prevCred);
    prevCred = r.credits ?? prevCred;
    if (success) { ok++; lastSuccess = r; succLog.push([r.label, r.hit, r.credits]); }
    else if (r.tail !== "(no Last tail)" && ok >= 1 && !nextBlock) nextBlock = r;
    if (i >= 40 && ok < 3) break; // stalled: only blocked no-ops
    seq.push(r);
  }
  console.log(JSON.stringify({
    mode, forkFaces: fork.faces.map((f) => [f.text, f.cost]),
    seededFaces: seq[0].hit, successes: ok,
    blockedLineAfterFirstBlock: seq[1], restingAfterLastSuccess: lastSuccess, newBlockLine: nextBlock,
  }));
  await o2.context.close();
} else if (mode === "def006b") {
  // Organic session, no seed: block at the fork (dearer face), then >=10 successful taps,
  // tail checked after every success; then a fresh block. Success = save revision or credits moved.
  const { context, page } = await open(null);
  const fork = await toFork(page);
  const rev = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim.revision; } catch { return -1; } });
  const cred = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim.credits; } catch { return -1; } });
  const tail = async () => { const st = await page.evaluate(SNAP); return st.rests.map((r) => (r.includes("Last") ? r : null)).find((x) => x !== null) ?? "(no Last tail)"; };
  const events = [];
  // 1) forced block on the dearer face
  await tapFace(page, "Faster batches"); await page.waitForTimeout(320);
  const blockLine = await tail();
  events.push({ at: "block-dearer", line: blockLine, credits: await cred() });
  // 2) successful taps: cheap face when fork is up (price 30/35...), otherwise primary
  let ok = 0, tailAfterLastSuccess = null, finalBlock = null;
  for (let i = 0; i < 80 && ok < 12; i++) {
    const r0 = await rev(); const c0 = await cred();
    const st = await page.evaluate(SNAP);
    const onFork = st.faces.some((f) => f.text.startsWith("Faster batches"));
    onFork ? await tapFace(page, "Less power") : await tapPrimary(page);
    await page.waitForTimeout(300);
    const r1 = await rev(); const c1 = await cred();
    if (r1 > r0 || c1 !== c0) { ok++; tailAfterLastSuccess = await tail(); events.push({ at: "success" + ok, tail: tailAfterLastSuccess, credits: c1 }); }
  }
  // 3) fresh block: tap the dearer face; it should refuse the moment its price exceeds the purse
  for (let i = 0; i < 12 && finalBlock === null; i++) {
    await tapFace(page, "Faster batches"); await page.waitForTimeout(300);
    const t = await tail();
    if (t !== "(no Last tail)") finalBlock = { line: t, credits: await cred() };
    else { const st = await page.evaluate(SNAP); if (!st.faces.some((f) => f.text.startsWith("Faster batches"))) { await tapPrimary(page); await page.waitForTimeout(300); } }
  }
  console.log(JSON.stringify({ mode, forkFaces: fork.faces.map((f) => [f.text, f.cost]), blockLine, successes: ok, tailAfterLastSuccess, finalBlock, tailAtEverySuccess: events.filter((e) => e.at.startsWith("success")).map((e) => [e.at, e.tail]) }));
  await context.close();
} else if (mode === "priced40") {
  // seeded fork with purse 64: the dearer face must charge exactly 40; then the purse is
  // 24 (< 35) and the next-level faces must refuse with numbered shortfalls.
  const { context, page } = await open(null);
  const fork = await toFork(page);
  const raw = await page.evaluate(() => localStorage.getItem("rustwake.save.v1"));
  await context.close();
  const env = JSON.parse(raw);
  env.payload.sim.credits = 40;
  const t = JSON.stringify(env.payload);
  const o = await open(JSON.stringify({ ...env, checksum: fnv1a(t) }));
  await o.page.waitForTimeout(400);
  const s0 = await o.page.evaluate(SNAP);
  const c0 = (await readSave(o.page))?.credits;
  await tapFace(o.page, "Faster batches");
  await o.page.waitForTimeout(150);
  const c0b = (await readSave(o.page))?.credits;
  if (c0b === c0) { await tapFace(o.page, "Faster batches"); } // first evaluate-click can precede React handler
  await o.page.waitForTimeout(320);
  const s1 = await o.page.evaluate(SNAP);
  const c1 = (await readSave(o.page))?.credits;
  const m1 = (await readSave(o.page))?.machines;
  await tapFace(o.page, "Less power");
  await o.page.waitForTimeout(320);
  const s2 = await o.page.evaluate(SNAP);
  const c2 = (await readSave(o.page))?.credits;
  console.log(JSON.stringify({ mode, seeded: { faces: s0.faces, card: s0.card, credits: c0 }, afterDear: { faces: s1.faces, toast: s1.toast, tail: s1.rests.find((r) => r.includes("Last")) ?? null, credits: c1, levels: m1?.map((m) => m.level), branches: m1?.map((m) => m.branch) }, afterCheap: { toast: s2.toast, tail: s2.rests.find((r) => r.includes("Last")) ?? null, credits: c2 }, deltaDear: c0 !== null && c1 !== null ? c0 - c1 : null }));
  await o.context.close();
} else if (mode === "def006c") {
  // Whole-session instrumented DEF-006 check: from a fresh boot, every primary tap is
  // classified success/reject by (save revision, credits, Last-tail). Prints the tap
  // indices of the first reject, the successes that follow, the tail after each, and the
  // state of the tail at the fork row (where the priced faces are read).
  const { context, page } = await open(null);
  const rev = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim.revision; } catch { return -1; } });
  const cred = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("rustwake.save.v1")).payload.sim.credits; } catch { return -1; } });
  const log = [];
  let ok = 0, rejects = 0, forkAt = null, tailAt = null, firstReject = null;
  let prevRev = await rev(), prevCred = await cred();
  for (let i = 0; i < 520; i++) {
    const st = await page.evaluate(SNAP);
    const tail = st.rests.map((r) => (r.includes("Last") ? r : null)).find((x) => x !== null) ?? null;
    const onFork = st.faces.some((f) => f.text.startsWith("Faster batches"));
    if (onFork) { forkAt = i; tailAt = tail; break; }
    await tapPrimary(page);
    await page.waitForTimeout(110);
    const r1 = await rev(); const c1 = await cred();
    const moved = r1 > prevRev || c1 !== prevCred;
    const st2 = await page.evaluate(SNAP);
    const tail2 = st2.rests.map((r) => (r.includes("Last") ? r : null)).find((x) => x !== null) ?? null;
    if (moved) { ok++; if (tail2 !== null) log.push(["successWithTail", i, tail2]); }
    else { rejects++; if (firstReject === null && tail2 !== null) firstReject = ["rejectAt", i, tail2]; }
    prevRev = r1; prevCred = c1;
  }
  console.log(JSON.stringify({ mode, successes: ok, rejects, firstReject, successsWithTail: log.length, sampleTailAfterSuccess: log[0] ?? null, forkAt, tailAtFork: tailAt }));
  await context.close();
} else if (mode === "cells") {
  const CELLS = [
    { label: "360x640 ts1", width: 360, height: 640, textScale: 1 },
    { label: "360x640 ts2", width: 360, height: 640, textScale: 2 },
    { label: "390x844 ts1", width: 390, height: 844, textScale: 1 },
    { label: "390x844 ts2", width: 390, height: 844, textScale: 2 },
  ];
  const rows = [];
  for (const cell of CELLS) {
    const { context, page, reqs } = await open(null, cell.width, cell.height, cell.textScale);
    const fork0 = await toFork(page, 800);
    // set text scale via the Text size button the way the recorded audits do
    for (let i = 0; i < 4; i++) {
      const ts = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--text-scale") || 1));
      if (ts === cell.textScale) break;
      await page.evaluate(() => { const n = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? "").startsWith("Text size")); n?.click(); });
      await page.waitForTimeout(150);
    }
    const fork = (await page.evaluate(SNAP)) && isFork(await page.evaluate(SNAP)) ? await page.evaluate(SNAP) : fork0;
    const hud = await page.evaluate(() => document.querySelector(".hud")?.clientHeight ?? null);
    const card = await page.evaluate(() => { const c = document.querySelector(".objective"); if (!c) return null; const r = c.getBoundingClientRect(); return { h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) }; });
    const dockTop = await page.evaluate(() => document.querySelector(".dock")?.getBoundingClientRect().top ?? null);
    const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: window.innerWidth, ih: window.innerHeight }));
    rows.push({ cell: cell.label, scale: await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim()), hudContentBoxHeight: hud, card, gapObjectiveToDock: card && dockTop !== null ? +(dockTop - card.bottom).toFixed(1) : null, ratio: card && hud ? +(1000 * card.h / hud).toFixed(1) / 10 : null, minFace: fork ? Math.min(...fork.faces.map((f) => Math.min(f.w, f.h))) : null, faces: fork?.faces ?? null, scroll, faviconRequests: reqs.length });
    await context.close();
  }
  console.log(JSON.stringify({ mode, rows }));
}
await browser.close();
server.close();
process.exit(0);
