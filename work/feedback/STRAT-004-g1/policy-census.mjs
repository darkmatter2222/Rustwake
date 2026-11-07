// STRAT-004 g1: the W-3 policy census on the no-op mechanisms, base vs candidate.
//
// Protocol (identical to PLAYER-004 g1, so the printed numbers are comparable):
//   180 s wall, 1 tap/s, 390x844 dpr2, isMobile + hasTouch, fresh storage per context,
//   stills at fixed tap indices, two policies: `blind` (primary face only) and
//   `deliberate-v2` (sell whenever the ladder offers it; fork face by printed price,
//   `Less power` while the printed power line is under 100 %).
//
// One named denominator (`taps`, the total taps the policy issued) is used for every
// share below, which is what DECISIONS row 1 asks for after the 176/178 disagreement.
//
// Three stall readings are printed side by side so the suffix cannot flatter the number:
//   `stallPrinted`            - the PLAYER-004 g1 counter over the whole face text the
//                               player reads (label + price + pending suffix);
//   `stallSuffixIndependent`  - the same counter over label + price only, i.e. the exact
//                               strings the base artifact prints, with the new suffix cut;
//   `stallByPressedIndex`     - consecutive non-applied taps on one pressed face index,
//                               a pure string-free reading.
//
// Usage:  npm run build
//         node work/feedback/STRAT-004-g1/policy-census.mjs
// Env:    BASE_DIST / CAND_DIST (absolute dist directories), OUT (json path),
//         POLICIES (comma list, default "blind,deliberate-v2"), BUDGET_S
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BUDGET_S = Number(process.env.BUDGET_S ?? 180);
const CADENCE_MS = 1000;
const POLICIES = (process.env.POLICIES ?? "blind,deliberate-v2").split(",").filter(Boolean);
const VIEWPORT = { width: 390, height: 844 };
const STILL_TAPS = [33, 40, 48]; // inside the recorded 31..68 stall window
const HERE = "work/feedback/STRAT-004-g1";
const OUT = process.env.OUT ?? `${HERE}/policy-census.json`;

const DIST_BASE = process.env.BASE_DIST ?? "C:/Users/ryans/source/repos/Rustwake/dist";
const DIST_CAND = process.env.CAND_DIST ?? `${process.cwd()}/dist`;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** Minimal static server for one `dist` directory; returns its base URL. */
function serve(dist, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const file = join(dist, rel === "/" ? "index.html" : rel.replace(/^\/+/, ""));
      if (!existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
      }
      const ext = file.slice(file.lastIndexOf("."));
      res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" }).end(
        readFileSync(file)
      );
    });
    server.listen(port, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${port}/` }));
  });
}

function entryAsset(dist) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const names = [...html.matchAll(/assets\/([\w.\-]+\.(?:js|css))/g)].map((m) => m[1]);
  return [...new Set(names)].map((name) => ({
    name,
    bytes: readFileSync(join(dist, "assets", name)).length,
    isEntry: /index-.*\.js$/.test(name),
  }));
}

/** Everything the resting screen shows, plus the stored sim numbers and the face's own lines. */
const SNAP = () => {
  const rect = (n) => {
    const r = n.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  const faces = [...document.querySelectorAll(".dock .dock__btn")];
  const primary = document.querySelector(".dock .dock__btn--primary") ?? faces[0] ?? null;
  const raw = localStorage.getItem("rustwake.save.v1");
  let sim = null;
  if (raw) {
    const p = JSON.parse(raw).payload;
    sim = p
      ? {
          tick: p.sim.tick,
          revision: p.sim.revision,
          credits: Math.round(p.sim.credits),
          machines: p.sim.machines.length,
          links: p.sim.routes.length,
          drones: 1 + (p.sim.spares ? p.sim.spares.length : 0),
          batches: p.sim.machines.reduce((s, m) => s + m.batchesDone, 0),
          storeUnits: p.sim.storeUnits,
          storeCapacity: p.sim.storeCapacity,
          powerRatio: p.sim.powerRatio,
          tutorial: p.sim.tutorial,
          levels: p.sim.machines
            .map((m) => m.blueprint + ":L" + m.level + (m.branch ? ":" + m.branch.join("+") : ""))
            .join(" "),
        }
      : null;
  }
  const card = document.querySelector(".objective");
  const hud = document.querySelector(".hud");
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    dpr: window.devicePixelRatio,
    docScrollH: document.documentElement.scrollHeight,
    docScrollW: document.documentElement.scrollWidth,
    objective: document.querySelector(".objective__primary")?.textContent ?? null,
    statusLines: [...document.querySelectorAll(".objective .status-line")].map((n) => n.textContent),
    chips: [...document.querySelectorAll(".resources__item")].map((n) => n.textContent),
    dock: faces.map((n, i) => ({
      i,
      text: n.textContent,
      // The face's own lines, in paint order: label line, then each `.dock__cost` line.
      label: n.firstChild ? (n.firstChild.textContent ?? "").replace(/\s+/g, " ").trim() : null,
      costs: [...n.querySelectorAll(".dock__cost")].map((x) => x.textContent),
      primary: n.className.includes("--primary"),
      branch: n.className.includes("--branch"),
      rect: rect(n),
    })),
    // The pressed face's own lines, in paint order: label line, price line, pending line.
    faceText: primary?.textContent ?? null,
    faceLabel:
      primary && primary.firstChild
        ? (primary.firstChild.textContent ?? "").replace(/\s+/g, " ").trim()
        : null,
    faceCosts: primary ? [...primary.querySelectorAll(".dock__cost")].map((n) => n.textContent) : [],
    faceRect: primary ? rect(primary) : null,
    dockRows: [...new Set(faces.map((n) => Math.round(n.getBoundingClientRect().y)))].length,
    cardH: card ? card.getBoundingClientRect().height : null,
    hudH: hud ? hud.clientHeight : null,
    toast: document.querySelector(".toast")?.textContent ?? null,
    panel: !!document.querySelector(".panel"),
    sim,
  };
};

const shortfallToast = (s) => typeof s === "string" && /^Need \d+ .+ . have \d+/.test(s.trim());
const pendingFaceLine = (s) => typeof s === "string" && /^waits \d+ [a-z]+ . have \d+$/.test(s.trim());

async function runPolicy(browser, url, policy, artifact) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const pageErrors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector(".gate__btn");
  await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });

  const t0 = Date.now();
  const timeline = [];
  const stills = [];
  let prevRev = null;
  let n = 0;
  while (Date.now() - t0 <= BUDGET_S * 1000) {
    n++;
    const before = await page.evaluate(SNAP);
    let chosen = null;
    let why = "primary";
    if (policy === "deliberate-v2") {
      const line = (before.statusLines ?? []).join(" ");
      const pm = /(\d+)\s*%/.exec(line);
      const pct = pm ? Number(pm[1]) : null;
      const faces = before.dock.filter((b) => b.branch);
      const price = (t) => {
        const m = /(\d+)\s*(scrap|credits|data)/.exec(t || "");
        return m ? Number(m[1]) : null;
      };
      if (faces.length >= 2) {
        const sorted = [...faces].sort((a, b) => (price(a.text) ?? 1e9) - (price(b.text) ?? 1e9));
        const pick =
          pct !== null && pct < 100
            ? faces.find((f) => f.text.includes("Less power")) ?? sorted[0]
            : sorted[0];
        const purse = before.sim?.credits ?? 0;
        if ((price(pick.text) ?? 0) > purse) why = `hold: ${price(pick.text)} > purse ${purse}`;
        else {
          chosen = pick.i;
          why = `fork ${pct}% power -> ${pick.text} @${price(pick.text)}`;
        }
      } else {
        const primary = before.dock.find((b) => b.primary);
        if (primary) chosen = primary.i;
      }
    } else {
      const primary = before.dock.find((b) => b.primary);
      if (primary) chosen = primary.i;
    }
    let tapped = null;
    if (chosen !== null) {
      const loc = page.locator(".dock .dock__btn").nth(chosen);
      tapped = (await loc.textContent()) || null;
      await loc.click({ force: true });
    }
    await page.waitForTimeout(CADENCE_MS);
    const after = await page.evaluate(SNAP);
    timeline.push({
      n,
      // The decision-time reading: what was on the face when the thumb went down.
      label: tapped,
      faceLabel: before.faceLabel,
      faceCosts: before.faceCosts,
      faceIndex: chosen,
      // The post-tap reading: what the face still says one second later.
      faceTextAfter: after.faceText,
      faceCostsAfter: after.faceCosts,
      why,
      tick: after.sim?.tick ?? null,
      revDelta: prevRev === null ? null : (after.sim?.revision ?? 0) - prevRev,
      batches: after.sim?.batches ?? null,
      credits: after.sim?.credits ?? null,
      machines: after.sim?.machines ?? null,
      links: after.sim?.links ?? null,
      storeUnits: after.sim?.storeUnits ?? null,
      power: after.sim?.powerRatio ?? null,
      levels: after.sim?.levels ?? null,
      obj: after.objective,
      status: after.statusLines,
      toast: after.toast,
      dock: after.dock.map((b) => b.text),
      layout: {
        vh: after.vh,
        docScrollH: after.docScrollH,
        docScrollW: after.docScrollW,
        vw: after.vw,
        faceMinPx: after.faceRect ? +Math.min(after.faceRect.w, after.faceRect.h).toFixed(1) : null,
        dockRows: after.dockRows,
        cardH: after.cardH,
        hudH: after.hudH,
        panelOpen: after.panel,
      },
    });
    if (STILL_TAPS.includes(n)) {
      const file = `${HERE}/stills/${artifact}-${policy}-tap${String(n).padStart(3, "0")}.png`;
      await page.screenshot({ path: file });
      stills.push({ tap: n, file });
    }
    prevRev = after.sim?.revision ?? null;
  }
  const wallMs = Date.now() - t0;
  await context.close();
  return { policy, artifact, taps: n, wallMs, timeline, stills, pageErrors };
}

/** The PLAYER-004 g1 stall counter over one label reading (equal-label, revDelta-0 pairs). */
function stallCounter(timeline, labelOf) {
  let run = 0;
  let longest = 0;
  let longestLabel = "";
  let longestEnd = 0;
  for (let i = 1; i < timeline.length; i++) {
    if (labelOf(timeline[i]) === labelOf(timeline[i - 1]) && timeline[i].revDelta === 0) {
      run++;
      if (run > longest) {
        longest = run;
        longestLabel = labelOf(timeline[i]) ?? "";
        longestEnd = i;
      }
    } else run = 0;
  }
  return { longest, longestLabel, longestEnd };
}

/** Longest run of consecutive non-applied taps on one pressed face index (string-free). */
function stallByFaceIndex(timeline) {
  let run = 1;
  let longest = 1;
  let start = 0;
  let bestStart = 0;
  let bestLen = 1;
  let index = timeline.length ? timeline[0].faceIndex : null;
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i].revDelta === 0 && timeline[i].faceIndex !== null && timeline[i].faceIndex === index) {
      run++;
      if (run > bestLen) {
        bestLen = run;
        bestStart = start;
      }
    } else {
      index = timeline[i].faceIndex;
      start = i;
      run = 1;
    }
  }
  const taps = timeline.slice(bestStart, bestStart + bestLen);
  return {
    taps: taps.length,
    faceIndex: taps.length ? taps[0].faceIndex : null,
    firstTap: taps.length ? taps[0].n : null,
    lastTap: taps.length ? taps[taps.length - 1].n : null,
    refusalToasts: taps.filter((t) => shortfallToast(t.toast)).length,
    appliedCommands: taps.reduce((s, t) => s + (t.revDelta ?? 0), 0),
  };
}

/** The face as the base artifact prints it: label line plus price line, no pending suffix. */
function baseLabelOf(t) {
  return [t.faceLabel, (t.faceCosts ?? [])[0]].filter(Boolean).join("");
}

/** The three mechanism buckets DECISIONS row 1 names, for one label reading. */
function censusBuckets(timeline, labelOf) {
  let inertLabel = 0;
  let refusedShortfall = 0;
  let unknown = 0;
  let suffixOnly = 0;
  let withOtherToast = 0;
  let rest = 0;
  for (let i = 1; i < timeline.length; i++) {
    const x = timeline[i];
    if (x.revDelta !== 0) continue;
    if (shortfallToast(x.toast)) {
      refusedShortfall++;
      continue;
    }
    if (!x.toast && labelOf(x) === labelOf(timeline[i - 1])) {
      inertLabel++;
      continue;
    }
    unknown++;
    if (!x.toast && baseLabelOf(x) === baseLabelOf(timeline[i - 1])) suffixOnly++;
    else if (x.toast) withOtherToast++;
    else rest++;
  }
  return {
    inertLabel,
    refusedShortfall,
    unknown,
    sum: inertLabel + refusedShortfall + unknown,
    unknownSplit: {
      faceChangedOnlyInPendingSuffix: suffixOnly,
      toastNotShortfall: withOtherToast,
      rest,
    },
  };
}

/** Census plus every stall reading, from one timeline. */
function census(timeline) {
  const fullLabelOf = (t) => t.label;
  const printedSpanOf = (s) => timeline.slice(s.longestEnd - s.longest, s.longestEnd + 1);
  const printed = censusBuckets(timeline, fullLabelOf);
  const suffixIndependent = censusBuckets(timeline, baseLabelOf);
  const stallPrinted = stallCounter(timeline, fullLabelOf);
  const stallBase = stallCounter(timeline, baseLabelOf);
  const printedSpan = printedSpanOf(stallPrinted);
  const baseSpan = printedSpanOf(stallBase);
  return {
    printed,
    suffixIndependent,
    stallPrinted: {
      counter: stallPrinted.longest,
      label: stallPrinted.longestLabel,
      taps: printedSpan.length,
      firstTap: printedSpan.length ? printedSpan[0].n : null,
      lastTap: printedSpan.length ? printedSpan[printedSpan.length - 1].n : null,
      carryingPendingLineOnFace: printedSpan.filter((t) => (t.faceCosts ?? []).some(pendingFaceLine)).length,
      statusLineTailWithLastNeed: printedSpan.filter((t) =>
        (t.status ?? []).some((line) => (line ?? "").includes("Last need"))
      ).length,
    },
    stallSuffixIndependent: {
      counter: stallBase.longest,
      label: stallBase.longestLabel,
      taps: baseSpan.length,
      firstTap: baseSpan.length ? baseSpan[0].n : null,
      lastTap: baseSpan.length ? baseSpan[baseSpan.length - 1].n : null,
      refusalToasts: baseSpan.filter((t) => shortfallToast(t.toast)).length,
      appliedCommands: baseSpan.reduce((s, t) => s + (t.revDelta ?? 0), 0),
      carryingPendingLineOnFace: baseSpan.filter((t) => (t.faceCosts ?? []).some(pendingFaceLine)).length,
    },
    stallByPressedIndex: stallByFaceIndex(timeline),
  };
}

function summarise(r) {
  const last = r.timeline[r.timeline.length - 1];
  const simHours = ((last.tick ?? 0) * 0.1) / 3600;
  const applied = r.timeline.reduce((s, t) => s + (t.revDelta ?? 0), 0);
  const noops = r.timeline.slice(1).filter((t) => t.revDelta === 0).length;
  const c = census(r.timeline);
  const pct = (value) => +((100 * value) / r.taps).toFixed(1);
  const faces = r.timeline.map((t) => t.layout.faceMinPx).filter((v) => v !== null);
  return {
    policy: r.policy,
    artifact: r.artifact,
    taps: r.taps,
    wallSec: +(r.wallMs / 1000).toFixed(1),
    finalTick: last.tick,
    simMinutes: +(((last.tick ?? 0) * 0.1) / 60).toFixed(2),
    machines: last.machines,
    links: last.links,
    batches: last.batches,
    credits: last.credits,
    storeUnits: last.storeUnits,
    levels: last.levels,
    batchesPerSimHour: simHours > 0 ? Math.round(last.batches / simHours) : null,
    creditsPerSimHour: simHours > 0 ? Math.round((last.credits ?? 0) / simHours) : null,
    appliedCommands: applied,
    commandsPerTap: +(applied / r.taps).toFixed(2),
    noopTaps: noops,
    denominator: { name: "taps", value: r.taps },
    noopSharePct: pct(noops),
    buckets: c.printed,
    bucketsSuffixIndependent: c.suffixIndependent,
    sharesPctOfTaps: {
      inertLabel: pct(c.printed.inertLabel),
      refusedShortfall: pct(c.printed.refusedShortfall),
      unknown: pct(c.printed.unknown),
    },
    sharesPctOfTapsSuffixIndependent: {
      inertLabel: pct(c.suffixIndependent.inertLabel),
      refusedShortfall: pct(c.suffixIndependent.refusedShortfall),
      unknown: pct(c.suffixIndependent.unknown),
    },
    longestIdenticalLabelStall: c.stallPrinted.counter,
    stall: c.stallPrinted,
    stallSuffixIndependent: c.stallSuffixIndependent,
    stallByPressedIndex: c.stallByPressedIndex,
    distinctPrimaryLabels: [...new Set(r.timeline.map((t) => t.label).filter(Boolean))].length,
    distinctPrimaryLabelsWithoutSuffix: [
      ...new Set(r.timeline.map(baseLabelOf).filter(Boolean)),
    ].length,
    pendingLineOnFaceTaps: r.timeline.filter((t) => (t.faceCosts ?? []).some(pendingFaceLine)).length,
    lastFaceCosts: last.faceCosts,
    lastFaceText: last.faceText,
    lastObjective: last.obj,
    lastStatus: last.status,
    lastRow: last.dock,
    witnesses: {
      smallestFacePx: faces.length ? Math.min(...faces) : null,
      maxDockRows: Math.max(...r.timeline.map((t) => t.layout.dockRows ?? 0)),
      noPageScroll: r.timeline.every(
        (t) => t.layout.docScrollH <= t.layout.vh && t.layout.docScrollW <= t.layout.vw
      ),
      maxCardFillPct: Math.max(
        ...r.timeline.map((t) =>
          t.layout.cardH && t.layout.hudH ? +(100 * (t.layout.cardH / t.layout.hudH)).toFixed(1) : 0
        )
      ),
      panelEverOpen: r.timeline.some((t) => t.layout.panelOpen),
      pageErrors: r.pageErrors.length,
    },
    stills: r.stills,
    timeline: r.timeline,
  };
}

const run = async () => {
  mkdirSync(`${HERE}/stills`, { recursive: true });
  const base = await serve(DIST_BASE, 4391);
  const cand = await serve(DIST_CAND, 4392);
  const browser = await chromium.launch({ executablePath, headless: true });
  const out = {
    task: "STRAT-004-g1",
    window: `W-3: ${BUDGET_S} s wall, 1 tap/s, 390x844 dpr2, isMobile+hasTouch, fresh storage per context`,
    denominator: "taps (total taps the policy issued); one denominator for every share",
    stallReadings: {
      stallPrinted: "PLAYER-004 g1 counter over the whole face text (label + price + pending suffix)",
      stallSuffixIndependent: "same counter over label + price only, the base artifact's own strings",
      stallByPressedIndex: "consecutive non-applied taps on one pressed face index (no strings)",
    },
    artifacts: {
      base: { dist: DIST_BASE, assets: entryAsset(DIST_BASE), url: base.url },
      candidate: { dist: DIST_CAND, assets: entryAsset(DIST_CAND), url: cand.url },
    },
    results: [],
  };
  try {
    for (const [label, url] of [
      ["base", base.url],
      ["candidate", cand.url],
    ]) {
      for (const policy of POLICIES) {
        const r = await runPolicy(browser, url, policy, label);
        const s = summarise(r);
        out.results.push(s);
        console.log(label, policy, JSON.stringify({ ...s, timeline: undefined }));
      }
    }
  } finally {
    await browser.close();
    base.server.close();
    cand.server.close();
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
  console.log(`\nwrote ${OUT}`);
  return out;
};

await run();
