// CHRM-002 worst-case re-measure (G1 #151 pass 13, pass-10 owed item).
// Non-vision geometric instrument: measures the REAL .objective card layout in the running
// build at 360x640 dpr2 text-scale 2.0, with the longest REACHABLE objective/phase/numbers
// text injected into the live DOM nodes (textContent only; classes/CSS unchanged). The card
// fill = .objective.getBoundingClientRect().height / .hud.clientHeight * 100, the SAME formula
// the U03 census uses (measure-legibility.mjs readCensus). Cap 42% UNCHANGED.
//
// Reachability (read from src): restingLine(state,lastReject) (src/ui/text.ts:286) appends
// ` · Last {detail}` whenever lastReject is set; lastReject is set on any refused tap
// (App.tsx setLastReject <- labelForReject, src/ui/App.tsx:1905). detail = lowercase-first of
// reject.shortfall = "Need {need} {word} · have {have}" (strings.ts:103). The numbers line is
// therefore `Drones {count} · Power 6 · {requested} requested · {percent} % · Last need {need}
// {word} · have {have}` — reachable on any blocked tap while machines run. word max =
// "nonferrous" (longest resource, defs.ts). The primary/phase maxima are the longest reachable
// objective.* / hint.* strings (strings.ts). This is an UPPER BOUND on reachable card text.
import { existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4174/";
const OUT = "work/development/UI-004-g1/";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((c) => existsSync(c));

// Longest reachable strings, constructed verbatim from the content templates.
const NUMBERS_WORST =
  "Drones 10 · Power 6 · 12 requested · 100 % · Last need 100 nonferrous · have 99";
// A faithful historical-style 2-machine blocked-tap numbers line (73-char shortfall segment).
const NUMBERS_HIST =
  "Drones 2 · Power 6 · 6 requested · 50 % · Last need 30 nonferrous · have 5";
const PRIMARY_WORST = "Data pays for one research node; open Research to see its effect."; // objective.research
const PHASE_WORST = "Machines share one power budget; slowest ones share it."; // hint.power

const measure = () => {
  const round = (n) => Math.round(n * 100) / 100;
  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  const primary = document.querySelector(".objective__primary");
  const lines = Array.from(document.querySelectorAll(".objective .status-line"));
  const lineInfo = lines.map((n, i) => {
    const cs = getComputedStyle(n);
    const lh = parseFloat(cs.lineHeight);
    return {
      i,
      text: (n.textContent ?? "").replace(/\s+/g, " ").trim(),
      chars: (n.textContent ?? "").length,
      fontSizePx: round(parseFloat(cs.fontSize)),
      lineHeightPx: round(lh),
      heightPx: round(n.getBoundingClientRect().height),
      boxes: lh > 0 ? Math.round(n.getBoundingClientRect().height / lh) : null,
      overflowYpx: n.scrollHeight - n.clientHeight,
      clippedX: n.scrollWidth > Math.ceil(n.getBoundingClientRect().width) + 0.5,
    };
  });
  const cardH = card ? card.getBoundingClientRect().height : null;
  const hudH = hud ? hud.clientHeight : null;
  return {
    textScale: getComputedStyle(document.documentElement).getPropertyValue("--text-scale").trim(),
    textLarge: document.documentElement.classList.contains("text-large"),
    inner: { width: window.innerWidth, height: window.innerHeight },
    primaryText: primary ? (primary.textContent ?? "").replace(/\s+/g, " ").trim() : null,
    primaryChars: primary ? (primary.textContent ?? "").length : null,
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
// A ladder 1 -> 1.25 -> 1.5 -> 2.0
for (let i = 0; i < 3; i += 1) {
  const b = page.locator(".hud .icon-btn", { hasText: "A " });
  if ((await b.count()) > 0) await b.first().click({ force: true });
  await page.waitForTimeout(300);
}
await page.waitForTimeout(400);

const results = {};
results.baseline = await page.evaluate(measure);

// (b) worst-case numbers line only, real current primary/phase.
await page.evaluate((txt) => {
  const lines = document.querySelectorAll(".objective .status-line");
  if (lines[1]) lines[1].textContent = txt;
}, NUMBERS_WORST);
await page.waitForTimeout(150);
results.numbersWorst = await page.evaluate(measure);

// (b2) historical-style 2-machine blocked-tap numbers line.
await page.evaluate((txt) => {
  const lines = document.querySelectorAll(".objective .status-line");
  if (lines[1]) lines[1].textContent = txt;
}, NUMBERS_HIST);
await page.waitForTimeout(150);
results.numbersHist = await page.evaluate(measure);

// (b3) MINIMAL reachable blocked-tap states: one running machine, shortest resource words.
// Confirms the defect is not an artifact of maximal injection — any appended shortfall that
// wraps the numbers line to a 3rd box pushes the card over the cap.
await page.evaluate((txt) => {
  const lines = document.querySelectorAll(".objective .status-line");
  if (lines[1]) lines[1].textContent = txt;
}, "Drones 1 · Power 6 · 3 requested · 100 % · Last need 30 scrap · have 5");
await page.waitForTimeout(150);
results.minScrap = await page.evaluate(measure);
await page.evaluate((txt) => {
  const lines = document.querySelectorAll(".objective .status-line");
  if (lines[1]) lines[1].textContent = txt;
}, "Drones 1 · Power 6 · 3 requested · 100 % · Last need 30 nonferrous · have 5");
await page.waitForTimeout(150);
results.minNonferrous = await page.evaluate(measure);

// (c) absolute upper bound: longest primary + longest phase + longest numbers.
await page.evaluate(({ p, ph, n }) => {
  const prim = document.querySelector(".objective__primary");
  const lines = document.querySelectorAll(".objective .status-line");
  if (prim) prim.textContent = p;
  if (lines[0]) lines[0].textContent = ph;
  if (lines[1]) lines[1].textContent = n;
}, { p: PRIMARY_WORST, ph: PHASE_WORST, n: NUMBERS_WORST });
await page.waitForTimeout(150);
results.absoluteWorst = await page.evaluate(measure);

await context.close();
await browser.close();

const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const cap = 42;
const fills = Object.entries(results).map(([k, v]) => ({ state: k, cardFillPct: v.cardFillPct, over: v.cardFillPct > cap }));
const maxFill = Math.max(...fills.map((f) => f.cardFillPct));
const report = {
  ticket: "CHRM-002 worst-case re-measure (G1 #151 pass 13)",
  baseSha: head,
  generated: new Date().toISOString(),
  url,
  viewport: "360x640 dpr2 mobile text-scale 2.0",
  cap,
  method: "real .objective card geometry; longest reachable text injected via textContent (classes/CSS unchanged); cardFill = card.height / hud.clientHeight * 100 (same as census)",
  reachability: "restingLine appends ' · Last {detail}' on any refused tap (lastReject set via labelForReject); numbers line reachable while machines run; word max 'nonferrous'; primary/phase maxima are longest objective.*/hint.* strings",
  strings: { NUMBERS_WORST, NUMBERS_HIST, PRIMARY_WORST, PHASE_WORST },
  results,
  fills,
  maxCardFillPct: maxFill,
  anyOverCap: fills.some((f) => f.over),
  pageErrors,
};
writeFileSync(`${OUT}chrm002-worst-case.json`, JSON.stringify(report, null, 1), "utf8");
console.log("baseSha", head);
for (const f of fills) console.log(`  ${f.state.padEnd(14)} cardFill ${f.cardFillPct}%  over42=${f.over}`);
console.log("maxCardFillPct", maxFill, "anyOverCap", report.anyOverCap);
for (const [k, v] of Object.entries(results)) {
  console.log(`  [${k}] card ${v.cardHeightPx}px / hud ${v.hudClientHeightPx}px = ${v.cardFillPct}% scale ${v.textScale}`);
  for (const l of v.lines) console.log(`     line${l.i} boxes=${l.boxes} overflowY=${l.overflowYpx} clippedX=${l.clippedX} chars=${l.chars} "${l.text.slice(0, 50)}"`);
}
console.log("pageErrors", pageErrors.length);
