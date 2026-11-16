// CHRM-002 worst-case re-measure (G1 #151 pass 14).
// Non-vision geometric instrument: measures the REAL .objective card layout in the running
// build at 360x640 dpr2 text-scale 2.0. Card fill = .objective.getBoundingClientRect().height
// / .hud.clientHeight * 100, the SAME formula the U03 census uses (measure-legibility.mjs
// readCensus). Cap 42% UNCHANGED.
//
// Pass 14 adds three things over the pass-13 instrument:
//   1. A SERVED-BUNDLE IDENTITY ASSERTION. The probe fetches the served index.html, resolves
//      its entry chunk ref, fetches that chunk, and aborts unless its sha256 + bytes equal the
//      on-disk dist asset. This closes the pass-13 provenance gap (the probe used to measure
//      whatever was at RUSTWAKE_URL, possibly another worktree's preview).
//   2. A REAL refused tap. `commit` (App.tsx:361) sets lastReject on ANY refused command and
//      clears it on success. A rapid second Salvage tap inside the cutting-pulse cooldown is
//      refused ("cooldown"), so restingLine appends " · Last cutting pulse recharging" to the
//      live numbers line. The probe measures that ACTUAL rendered line, not only synthetic text.
//   3. A REACHABILITY SWEEP. The pass-13 PRIMARY_WORST was objective.research — a HINT string
//      (hintFor), NOT a primary. objectiveFor (text.ts:77) only ever returns card.* (tutorial)
//      or step.* (yard ladder) strings; the phase line is hintFor(suggestedAction) / phase.ghost
//      / buildRefusal / reader.hint. The sweep injects every reachable primary and phase
//      candidate (constructed verbatim from the CURRENT strings.ts templates + defs.ts labels
//      + TUNING) and records its wrapped-box count, so the true reachable worst is derived from
//      the real text logic instead of an over-long hint string painted into the primary slot.
//
// Reachability of the refused-tap numbers line: restingLine(state,lastReject) (text.ts:286)
// appends ` · Last {detail}` whenever lastReject is set; detail = lowercase-first of
// labelForReject(result) (App.tsx:1905). For an "insufficient" reject that is
// "need {need} {word} · have {have}" (reject.shortfall, strings.ts:103); word max "nonferrous".
// For other rejects it is the reject label (e.g. "cutting pulse recharging"). Both wrap the
// numbers line to a 3rd box at 360x640 scale 2.0.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4175/";
const OUT = "work/development/UI-004-g1/";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((c) => existsSync(c));

// ---- (1) served-bundle identity assertion ----------------------------------------------
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const indexHtml = await (await fetch(url)).text();
const entryRef = (indexHtml.match(/assets\/index-[^"']+\.js/) ?? [null])[0];
if (!entryRef) throw new Error(`no entry chunk ref in served index.html at ${url}`);
const servedEntry = Buffer.from(await (await fetch(url + entryRef)).arrayBuffer());
const diskEntry = readFileSync("dist/" + entryRef);
const provenance = {
  url,
  servedEntryRef: entryRef,
  servedEntrySha256: sha256(servedEntry),
  diskEntrySha256: sha256(diskEntry),
  servedEntryBytes: servedEntry.length,
  diskEntryBytes: diskEntry.length,
  identical: servedEntry.equals(diskEntry),
};
if (!provenance.identical) {
  throw new Error(`served entry != dist entry — wrong worktree? ${JSON.stringify(provenance)}`);
}
console.log("provenance OK", entryRef, provenance.servedEntryBytes, "B sha", provenance.servedEntrySha256.slice(0, 12));

// ---- reachable text candidates (verbatim from CURRENT strings.ts + defs.ts + TUNING) ----
// Longest reachable numbers lines (restingLine base + a refused-tap detail).
const NUMBERS_WORST =
  "Drones 10 · Power 6 · 12 requested · 100 % · Last need 100 nonferrous · have 99";
const NUMBERS_HIST =
  "Drones 2 · Power 6 · 6 requested · 50 % · Last need 30 nonferrous · have 5";
const NUMBERS_COOLDOWN =
  "Drones 0 · Power 6 · 0 requested · 100 % · Last cutting pulse recharging";
// Pass-13 absolute-bound strings, kept for before/after comparability. PRIMARY_WORST is a HINT
// string (objective.research); the sweep below proves whether it is reachable as a primary.
const PRIMARY_WORST = "Data pays for one research node; open Research to see its effect.";
const PHASE_WORST = "Machines share one power budget; slowest ones share it.";

// Every primary objectiveFor can return (card.* tutorial ladder + step.* yard ladder + reader).
const PRIMARY_CANDIDATES = [
  ["card.tap-wreck", "Tap the highlighted wreck to salvage scrap."],
  ["card.pulses", "Keep salvaging: 15/15 pulses for the drone repair."],
  ["card.repair", "Repair your recovery drone · 30 scrap"],
  ["card.observe", "Your drone now works for you."],
  ["card.build-sorter", "Build a sorter · 30 scrap + 4 steel"],
  ["card.connect-route", "Connect the dock to the sorter."],
  ["card.refine", "Refine metal into trade goods · build a furnace"],
  ["card.export", "Sell your first steel · 10 steel for 50 credits"],
  ["card.upgrade", "Upgrade a machine: speed or power."],
  ["card.chain", "Choose your next goal."],
  ["step.connect", "Connect Circuit assembler so its cargo moves."],
  ["step.build", "Build Circuit assembler · 40 scrap + 10 ferrous"],
  ["step.build.signalLab", "Build Signal lab · 50 scrap + 12 ferrous"],
  ["step.sell", "Sell 10 Steel for 50 credits."],
  ["step.research", "Research Route Dispatch · 12 Data"],
  ["step.researchAny", "Research a node when its data cost is covered."],
  ["step.drone", "Add a recovery drone · 60 credits"],
  ["step.upgrade", "Upgrade the Circuit assembler."],
  ["step.fork", "Upgrade Circuit assembler · 70 credits"],
  ["step.fork.hi", "Upgrade Circuit assembler · 140 credits"],
  ["reader.objective", "Following the other tab"],
];
// Every phase line: hintFor(suggestedAction) keys + phase.ghost + longest buildRefusal + reader.hint.
const PHASE_CANDIDATES = [
  ["objective.repair", "Tap Salvage until the drone repair is affordable."],
  ["objective.build-sorter", "Open Build and place the sorter on a lit cell."],
  ["objective.connect-route", "Draw the route so cargo has somewhere to go."],
  ["objective.export", "Sell the steel to earn your first credits."],
  ["objective.upgrade", "Pick a machine and upgrade its speed."],
  ["objective.chain", "Sell a surplus, then fund the next processor or an upgrade."],
  ["objective.research", "Data pays for one research node; open Research to see its effect."],
  ["hint.starved", "A machine waits for input; check its empty side."],
  ["hint.cargo-full", "A machine's output is waiting; connect storage."],
  ["hint.power", "Machines share one power budget; slowest ones share it."],
  ["phase.ghost", "Ghost on cell 8 · tap again to place"],
  ["reject.locked", "Sell opens after your first steel contract"],
  ["reader.hint", "This tab mirrors the yard exactly as the first tab writes it."],
];

const measure = () => {
  const round = (n) => Math.round(n * 100) / 100;
  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  const primary = document.querySelector(".objective__primary");
  const pcs = primary ? getComputedStyle(primary) : null;
  const plh = pcs ? parseFloat(pcs.lineHeight) : 0;
  const lines = Array.from(document.querySelectorAll(".objective .status-line"));
  const lineInfo = lines.map((n, i) => {
    const cs = getComputedStyle(n);
    const lh = parseFloat(cs.lineHeight);
    const r = n.getBoundingClientRect();
    return {
      i,
      text: (n.textContent ?? "").replace(/\s+/g, " ").trim(),
      chars: (n.textContent ?? "").length,
      display: cs.display,
      fontSizePx: round(parseFloat(cs.fontSize)),
      lineHeightPx: round(lh),
      heightPx: round(r.height),
      boxes: lh > 0 && r.height > 0 ? Math.round(r.height / lh) : 0,
      overflowYpx: n.scrollHeight - n.clientHeight,
      clippedX: n.scrollWidth > Math.ceil(r.width) + 0.5,
    };
  });
  const cardH = card ? card.getBoundingClientRect().height : null;
  const hudH = hud ? hud.clientHeight : null;
  const pr = primary ? primary.getBoundingClientRect() : null;
  return {
    textScale: getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim(),
    textLarge: document.documentElement.classList.contains("text-large"),
    inner: { width: window.innerWidth, height: window.innerHeight },
    primaryText: primary ? (primary.textContent ?? "").replace(/\s+/g, " ").trim() : null,
    primaryChars: primary ? (primary.textContent ?? "").length : null,
    primaryFontSizePx: pcs ? round(parseFloat(pcs.fontSize)) : null,
    primaryLineHeightPx: round(plh),
    primaryHeightPx: pr ? round(pr.height) : null,
    primaryBoxes: plh > 0 && pr && pr.height > 0 ? Math.round(pr.height / plh) : 0,
    primaryOverflowYpx: primary ? primary.scrollHeight - primary.clientHeight : null,
    cardHeightPx: cardH === null ? null : round(cardH),
    hudClientHeightPx: hudH,
    cardFillPct: cardH !== null && hudH ? round((cardH / hudH) * 1000) / 10 : null,
    lines: lineInfo,
  };
};

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(url, { waitUntil: "load" });
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });

// ---- (2) REAL refused tap: rapid second Salvage tap inside the cutting-pulse cooldown ----
// commit() sets lastReject on the refused command; restingLine then appends " · Last ...".
const primaryBtn = page.locator(".dock__btn--primary");
await primaryBtn.first().click({ force: true });
await page.waitForTimeout(40);
await primaryBtn.first().click({ force: true }); // refused: cooldown
await page.waitForTimeout(400);
const realRefusedTap = await page.evaluate(measure);
const realRefusedNumbers = realRefusedTap.lines[1] ? realRefusedTap.lines[1].text : "";
const realRefusalAppended = / · Last /.test(realRefusedNumbers);

// A ladder 1 -> 1.25 -> 1.5 -> 2.0
for (let i = 0; i < 3; i += 1) {
  const b = page.locator(".hud .icon-btn", { hasText: "A " });
  if ((await b.count()) > 0) await b.first().click({ force: true });
  await page.waitForTimeout(300);
}
await page.waitForTimeout(400);
// Re-measure the real refused-tap state at scale 2.0 (lastReject persists until a success).
const realRefusedTapAtScale = await page.evaluate(measure);

const setNumbers = (txt) =>
  page.evaluate((t) => {
    const lines = document.querySelectorAll(".objective .status-line");
    if (lines[1]) lines[1].textContent = t;
  }, txt);
const setPrimary = (txt) =>
  page.evaluate((t) => {
    const p = document.querySelector(".objective__primary");
    if (p) p.textContent = t;
  }, txt);
const setPhase = (txt) =>
  page.evaluate((t) => {
    const lines = document.querySelectorAll(".objective .status-line");
    if (lines[0]) lines[0].textContent = t;
  }, txt);

const results = {};
// Reset to a clean baseline primary/phase/numbers before the synthetic states.
await setPrimary("Tap the highlighted wreck to salvage scrap.");
await setPhase("Tap Salvage until the drone repair is affordable.");
await setNumbers("Drones 0 · Power 6 · 0 requested · 100 %");
await page.waitForTimeout(150);
results.baseline = await page.evaluate(measure);

await setNumbers(NUMBERS_WORST);
await page.waitForTimeout(150);
results.numbersWorst = await page.evaluate(measure);

await setNumbers(NUMBERS_HIST);
await page.waitForTimeout(150);
results.numbersHist = await page.evaluate(measure);

await setNumbers("Drones 1 · Power 6 · 3 requested · 100 % · Last need 30 scrap · have 5");
await page.waitForTimeout(150);
results.minScrap = await page.evaluate(measure);

await setNumbers("Drones 1 · Power 6 · 3 requested · 100 % · Last need 30 nonferrous · have 5");
await page.waitForTimeout(150);
results.minNonferrous = await page.evaluate(measure);

await setNumbers(NUMBERS_COOLDOWN);
await page.waitForTimeout(150);
results.numbersCooldown = await page.evaluate(measure);

// Pass-13 SYNTHETIC upper bound, kept for before/after comparability ONLY. PRIMARY_WORST is
// objective.research — a hintFor() string, NOT an objectiveFor() primary (text.ts:77 returns
// only card.*/step.*/reader.objective). Painting it into the primary slot is artificial: the
// primarySweep below proves no reachable primary wraps past 4 boxes. This state is reported
// as reachable:false and is NOT part of the anyOverCap gate (gating it would gate a state the
// player can never see). The hint slot is hidden at text-large, so PHASE_WORST adds 0 boxes.
await setPrimary(PRIMARY_WORST);
await setPhase(PHASE_WORST);
await setNumbers(NUMBERS_WORST);
await page.waitForTimeout(150);
results.absoluteWorst = await page.evaluate(measure);

// Pass-14 REACHABLE absolute bound: the longest genuinely reachable primary (card.pulses,
// 50 chars / 4 boxes — the primarySweep maximum) + worst refused-tap numbers + hidden hint.
// This is the worst card the player can actually see at the binding cell.
await setPrimary("Keep salvaging: 15/15 pulses for the drone repair.");
await setPhase(PHASE_WORST);
await setNumbers(NUMBERS_WORST);
await page.waitForTimeout(150);
results.absoluteReachable = await page.evaluate(measure);

// ---- (3) reachability sweep: box counts for every reachable primary / phase candidate ----
await setNumbers(NUMBERS_WORST); // worst numbers held constant while sweeping primary
const primarySweep = [];
for (const [key, text] of PRIMARY_CANDIDATES) {
  await setPrimary(text);
  await page.waitForTimeout(60);
  const m = await page.evaluate(() => {
    const p = document.querySelector(".objective__primary");
    const cs = getComputedStyle(p);
    const lh = parseFloat(cs.lineHeight);
    const r = p.getBoundingClientRect();
    return { boxes: lh > 0 ? Math.round(r.height / lh) : 0, heightPx: Math.round(r.height * 100) / 100, overflowYpx: p.scrollHeight - p.clientHeight };
  });
  primarySweep.push({ key, text, chars: text.length, ...m });
}
await setPrimary("Tap the highlighted wreck to salvage scrap.");
const phaseSweep = [];
for (const [key, text] of PHASE_CANDIDATES) {
  await setPhase(text);
  await page.waitForTimeout(60);
  const m = await page.evaluate(() => {
    const lines = document.querySelectorAll(".objective .status-line");
    const n = lines[0];
    const cs = getComputedStyle(n);
    const lh = parseFloat(cs.lineHeight);
    const r = n.getBoundingClientRect();
    return { boxes: lh > 0 && r.height > 0 ? Math.round(r.height / lh) : 0, heightPx: Math.round(r.height * 100) / 100, display: cs.display, overflowYpx: n.scrollHeight - n.clientHeight };
  });
  phaseSweep.push({ key, text, chars: text.length, ...m });
}

await context.close();
await browser.close();

const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const cap = 42;
// absoluteWorst is the synthetic pass-13 bound (a hintFor string painted into the primary
// slot); it is not a reachable card state, so it is reported but excluded from the anyOverCap
// gate. Every reachable state — including absoluteReachable and the real refused tap — gates.
const SYNTHETIC_STATES = new Set(["absoluteWorst"]);
const fills = Object.entries(results).map(([k, v]) => ({ state: k, reachable: !SYNTHETIC_STATES.has(k), cardFillPct: v.cardFillPct, over: v.cardFillPct > cap }));
const reachableFills = fills.filter((f) => f.reachable);
const maxFill = Math.max(...reachableFills.map((f) => f.cardFillPct));
const syntheticMaxFill = Math.max(...fills.filter((f) => !f.reachable).map((f) => f.cardFillPct));
const maxPrimaryBoxes = Math.max(...primarySweep.map((p) => p.boxes));
const maxPhaseBoxes = Math.max(...phaseSweep.map((p) => p.boxes));
// Worst GENUINELY reachable card at the binding cell: the phase hint steps back at text-large
// (spec 6.4 / CHRM-002), so it adds 0 boxes; the card is max reachable primary + worst refused-
// tap numbers + the card's own 6px top/bottom padding (text-large status-line margin-top:0).
const r2 = (n) => Math.round(n * 100) / 100;
const primaryLh = realRefusedTapAtScale.primaryLineHeightPx;
const numbersLh = realRefusedTapAtScale.lines[1]?.lineHeightPx ?? 0;
const maxNumbersBoxes = Math.max(...Object.values(results).map((v) => v.lines[1]?.boxes ?? 0));
const hudH = realRefusedTapAtScale.hudClientHeightPx;
const chromePx = 12;
const worstReachableHeightPx = maxPrimaryBoxes * primaryLh + maxNumbersBoxes * numbersLh + chromePx;
const worstReachable = {
  maxPrimaryBoxes,
  maxNumbersBoxes,
  hintHiddenAtTextLarge: realRefusedTapAtScale.lines[0]?.display === "none",
  primaryLineHeightPx: primaryLh,
  numbersLineHeightPx: numbersLh,
  chromePx,
  heightPx: r2(worstReachableHeightPx),
  hudClientHeightPx: hudH,
  cardFillPct: r2((worstReachableHeightPx / hudH) * 1000) / 10,
  capHeightPx: r2(0.42 * hudH),
  headroomPx: r2(0.42 * hudH - worstReachableHeightPx),
};
const report = {
  ticket: "CHRM-002 worst-case re-measure (G1 #151 pass 14)",
  baseSha: head,
  generated: new Date().toISOString(),
  url,
  provenance,
  viewport: "360x640 dpr2 mobile text-scale 2.0",
  cap,
  method: "real .objective card geometry; reachable text injected via textContent (classes/CSS unchanged); cardFill = card.height / hud.clientHeight * 100 (same as census); served entry asserted byte-identical to dist",
  reachability: "objectiveFor returns only card.*/step.* (PRIMARY_WORST=objective.research is a HINT, swept separately); phase = hintFor(suggestedAction)/phase.ghost/buildRefusal/reader.hint; restingLine appends ' · Last {detail}' on any refused tap (commit App.tsx:377); real refused tap measured via salvage cooldown. PASS-14 FIX: card.upgrade + step.fork shortened to 3 boxes; phase hint steps back at text-large (.text-large .objective__hint, spec 6.4) so it adds 0 boxes at the binding cell; numbers/shortfall line stays visible. PRIMARY_CANDIDATES re-derived verbatim from the CURRENT strings.ts.",
  strings: { NUMBERS_WORST, NUMBERS_HIST, NUMBERS_COOLDOWN, PRIMARY_WORST, PHASE_WORST },
  realRefusedTap: { ...realRefusedTap, refusedAtStart: realRefusalAppended, numbersText: realRefusedNumbers },
  realRefusedTapAtScale,
  results,
  primarySweep,
  phaseSweep,
  maxPrimaryBoxes,
  maxPhaseBoxes,
  worstReachable,
  fills,
  maxCardFillPct: maxFill,
  syntheticMaxCardFillPct: syntheticMaxFill,
  anyOverCap: reachableFills.some((f) => f.over),
  syntheticOverCap: fills.filter((f) => !f.reachable).some((f) => f.over),
  pageErrors,
};
writeFileSync(`${OUT}chrm002-worst-case.json`, JSON.stringify(report, null, 1), "utf8");
console.log("baseSha", head);
console.log("realRefusedTap appended:", realRefusalAppended, "| numbers:", realRefusedNumbers);
console.log("realRefusedTapAtScale card", realRefusedTapAtScale.cardHeightPx, "fill", realRefusedTapAtScale.cardFillPct, "%");
for (const f of fills) console.log(`  ${f.state.padEnd(18)} reachable=${String(f.reachable).padEnd(5)} cardFill ${f.cardFillPct}%  over42=${f.over}`);
console.log("maxPrimaryBoxes", maxPrimaryBoxes, "maxPhaseBoxes", maxPhaseBoxes);
console.log("primarySweep:", primarySweep.map((p) => `${p.key}=${p.boxes}`).join(" "));
console.log("phaseSweep:", phaseSweep.map((p) => `${p.key}=${p.boxes}`).join(" "));
console.log("worstReachable", JSON.stringify(worstReachable));
console.log("maxCardFillPct(reachable)", maxFill, "anyOverCap", report.anyOverCap, "| syntheticMax", syntheticMaxFill, "syntheticOverCap", report.syntheticOverCap, "| pageErrors", pageErrors.length);