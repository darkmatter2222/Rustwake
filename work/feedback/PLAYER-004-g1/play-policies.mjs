// PLAYER-004 g1: blind vs deliberate policies on the live build, mobile viewport.
// Usage: node work/feedback/PLAYER-004-g1/play-policies.mjs [budgetSeconds]
import { BASE, openMobile, SNAP } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const BUDGET_S = Number(process.argv[2] ?? 180);
const CADENCE_MS = 1000; // one command per second, as in STRAT-001 g1

function parseNumbers(snap) {
  const out = { prices: [], powerPct: null, storePct: null };
  const line = snap.statusLines.map((l) => l.text).join("  ");
  const pm = /(\d+)\s*%\s*$/.exec(line.trim()) || /(\d+)\s*%/.exec(line);
  if (pm) out.powerPct = Number(pm[1]);
  const sm = /Store\s+(\d+)\/(\d+)/.exec(snap.chips.map((c) => c.text).join(" "));
  if (sm) out.storePct = Number(sm[1]) / Math.max(1, Number(sm[2]));
  for (const b of snap.dock) {
    const t = b.text || "";
    const nums = [...t.matchAll(/(\d+)\s*(scrap|credits|data)/g)].map((m) => Number(m[1]));
    out.prices.push({ i: b.i, text: t, primary: b.primary, branch: b.branch, nums });
  }
  return out;
}

async function runBlind(page) {
  await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
  const t0 = Date.now();
  const timeline = [];
  let prevRev = null;
  let n = 0;
  while (Date.now() - t0 <= BUDGET_S * 1000) {
    n++;
    const before = await page.evaluate(SNAP);
    const primary = page.locator(".dock__btn--primary");
    let tapped = null;
    if ((await primary.count()) > 0) {
      tapped = (await primary.first().textContent()) || "";
      await primary.first().click({ force: true });
    }
    await page.waitForTimeout(CADENCE_MS);
    const after = await page.evaluate(SNAP);
    timeline.push({
      n,
      label: tapped,
      dock: after.dock.map((b) => b.text),
      rev: after.sim?.revision ?? null,
      revDelta: prevRev === null ? null : (after.sim?.revision ?? 0) - prevRev,
      tick: after.sim?.tick ?? null,
      batches: after.sim?.batches ?? null,
      credits: after.sim?.credits ?? null,
      storeUnits: after.sim?.storeUnits ?? null,
      machines: after.sim?.machines ?? null,
      power: after.sim?.powerRatio ?? null,
      obj: after.objective,
      status: after.statusLines.map((l) => l.text),
      toast: after.toast,
    });
    prevRev = after.sim?.revision ?? null;
  }
  return { policy: "blind", taps: n, wallMs: Date.now() - t0, timeline };
}

async function runDeliberate(page) {
  await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
  const t0 = Date.now();
  const timeline = [];
  let prevRev = null;
  let n = 0;
  let upgradesBought = 0; // exactly one automation upgrade per level ladder, cheapest face first
  while (Date.now() - t0 <= BUDGET_S * 1000) {
    n++;
    const snap = await page.evaluate(SNAP);
    const parsed = parseNumbers(snap);
    let chosen = null;
    let why = "";
    const faces = parsed.prices.filter((p) => p.branch);
    if (faces.length >= 2) {
      // Named fork: pick by the printed price and the printed power line.
      const cheap = [...faces].sort((a, b) => (a.nums[0] ?? 1e9) - (b.nums[0] ?? 1e9))[0];
      const dear = faces.find((f) => f.i !== cheap.i) ?? cheap;
      const want = parsed.powerPct !== null && parsed.powerPct < 100 ? "power" : "speed";
      const pick = want === "power" ? faces.find((f) => f.text.includes("Less power")) ?? dear : cheap;
      const purse = snap.sim?.credits ?? 0;
      if ((pick.nums[0] ?? 0) > purse) {
        why = `hold: cheapest face ${cheap.nums[0]} > purse ${purse}`;
      } else {
        chosen = pick.i;
        why = `fork ${want}: ${pick.text} @${pick.nums[0]} vs ${dear.text} @${dear.nums[0]}`;
        upgradesBought++;
      }
    } else {
      const primary = snap.dock.find((b) => b.primary);
      if (!primary) {
        why = "no primary";
      } else if (primary.text.startsWith("Sell")) {
        // Keep the yard tidy but never sell a build price: sell when the store is
        // filling up, hold when the objective still names a price we cannot pay.
        const tidy = parsed.storePct !== null && parsed.storePct >= 0.6;
        if (tidy) {
          chosen = primary.i;
          why = `sell at ${(parsed.storePct * 100).toFixed(0)} % store`;
        } else {
          why = `hold sell (store ${(parsed.storePct ?? 0) * 100 | 0} %)`;
        }
      } else {
        chosen = primary.i;
        why = "primary";
      }
    }
    let tapped = null;
    if (chosen !== null) {
      const loc = page.locator(".dock .dock__btn").nth(chosen);
      tapped = (await loc.textContent()) || "";
      await loc.click({ force: true });
    }
    await page.waitForTimeout(CADENCE_MS);
    const after = await page.evaluate(SNAP);
    timeline.push({
      n,
      label: tapped,
      why,
      dock: after.dock.map((b) => b.text),
      rev: after.sim?.revision ?? null,
      revDelta: prevRev === null ? null : (after.sim?.revision ?? 0) - prevRev,
      tick: after.sim?.tick ?? null,
      batches: after.sim?.batches ?? null,
      credits: after.sim?.credits ?? null,
      storeUnits: after.sim?.storeUnits ?? null,
      machines: after.sim?.machines ?? null,
      power: after.sim?.powerRatio ?? null,
      obj: after.objective,
      status: after.statusLines.map((l) => l.text),
      toast: after.toast,
    });
    prevRev = after.sim?.revision ?? null;
  }
  return { policy: "deliberate", taps: n, wallMs: Date.now() - t0, upgradesBought, timeline };
}

function summarise(r) {
  const last = r.timeline[r.timeline.length - 1];
  const simHours = (last.tick ?? 0) * 0.1 / 3600;
  const noops = r.timeline.filter((t) => t.revDelta === 0).length;
  const applied = r.timeline.reduce((s, t) => s + (t.revDelta ?? 0), 0);
  return {
    policy: r.policy,
    taps: r.taps,
    wallSec: +(r.wallMs / 1000).toFixed(1),
    finalTick: last.tick,
    simMinutes: +((last.tick ?? 0) * 0.1 / 60).toFixed(1),
    batches: last.batches,
    credits: last.credits,
    machines: last.machines,
    storeUnits: last.storeUnits,
    batchesPerSimHour: simHours > 0 ? Math.round(last.batches / simHours) : null,
    creditsPerSimHour: simHours > 0 ? Math.round((last.credits ?? 0) / simHours) : null,
    batchesPerWallMin: +(last.batches / (r.wallMs / 60000)).toFixed(1),
    noops,
    appliedCommands: applied,
    noopSharePct: +(100 * (noops / Math.max(1, r.taps - 1))).toFixed(1),
    finalRow: last.dock,
    finalObjective: last.obj,
    finalStatus: last.status,
  };
}

const results = [];
for (const [name, fn] of [["blind", runBlind], ["deliberate", runDeliberate]]) {
  const { page, loadedIn } = await openMobile();
  const r = await fn(page);
  r.loadedIn = loadedIn;
  results.push(summarise(r));
  results[results.length - 1].timeline = r.timeline;
  await page.context().close();
  console.log(name, JSON.stringify(results[results.length - 1], (k, v) => (k === "timeline" ? undefined : v)));
}
writeFileSync(
  "work/feedback/PLAYER-004-g1/policies.json",
  JSON.stringify({ budgetSeconds: BUDGET_S, cadenceMs: CADENCE_MS, viewport: "390x844@2 isMobile hasTouch", url: BASE, results }, null, 1),
  "utf8",
);
