// PLAYER-004 g1: deliberate policy v2 — the one rule change the v1 census points at.
// v2: sell whenever the ladder offers it; on the named fork take the cheaper face, or
// "Less power" while the printed power line is under 100 %.
// Usage: node work/feedback/PLAYER-004-g1/play-v2.mjs [budgetSeconds]
import { BASE, openMobile, SNAP } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const BUDGET_S = Number(process.argv[2] ?? 180);
const { page } = await openMobile();
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
const t0 = Date.now();
const timeline = [];
let prevRev = null;
let n = 0;
let forkPicks = [];
while (Date.now() - t0 <= BUDGET_S * 1000) {
  n++;
  const snap = await page.evaluate(SNAP);
  const line = snap.statusLines.map((l) => l.text).join(" ");
  const pm = /(\d+)\s*%/.exec(line);
  const pct = pm ? Number(pm[1]) : null;
  const faces = snap.dock.filter((b) => b.branch);
  let chosen = null;
  let why = "primary";
  const price = (t) => {
    const m2 = /(\d+)\s*(scrap|credits|data)/.exec(t || "");
    return m2 ? Number(m2[1]) : null;
  };
  if (faces.length >= 2) {
    const sorted = [...faces].sort((a, b) => (price(a.text) ?? 1e9) - (price(b.text) ?? 1e9));
    const pick = pct !== null && pct < 100 ? faces.find((f) => f.text.includes("Less power")) ?? sorted[0] : sorted[0];
    const purse = snap.sim?.credits ?? 0;
    if ((price(pick.text) ?? 0) > purse) why = `hold: ${price(pick.text)} > purse ${purse}`;
    else {
      chosen = pick.i;
      why = `fork ${pct}% power -> ${pick.text} @${price(pick.text)}`;
      forkPicks.push({ tap: n, picked: pick.text, price: price(pick.text), pct });
    }
  } else {
    const primary = snap.dock.find((b) => b.primary);
    if (primary) chosen = primary.i;
  }
  let tapped = null;
  if (chosen !== null) {
    const loc = page.locator(".dock .dock__btn").nth(chosen);
    tapped = (await loc.textContent()) || null;
    await loc.click({ force: true });
  }
  await page.waitForTimeout(1000);
  const after = await page.evaluate(SNAP);
  timeline.push({
    n,
    label: tapped,
    why,
    tick: after.sim?.tick ?? null,
    rev: after.sim?.revision ?? null,
    revDelta: prevRev === null ? null : (after.sim?.revision ?? 0) - prevRev,
    batches: after.sim?.batches ?? null,
    credits: after.sim?.credits ?? null,
    machines: after.sim?.machines ?? null,
    links: after.sim?.links ?? null,
    storeUnits: after.sim?.storeUnits ?? null,
    power: after.sim?.powerRatio ?? null,
    levels: after.sim?.levels ?? null,
    obj: after.objective,
    status: after.statusLines.map((l) => l.text),
    toast: after.toast,
    dock: after.dock.map((b) => b.text),
  });
  prevRev = after.sim?.revision ?? null;
}
const last = timeline[timeline.length - 1];
const simHours = (last.tick ?? 0) * 0.1 / 3600;
const wallMs = Date.now() - t0;
const summary = {
  policy: "deliberate-v2",
  taps: n,
  wallSec: +(wallMs / 1000).toFixed(1),
  finalTick: last.tick,
  simMinutes: +((last.tick ?? 0) * 0.1 / 60).toFixed(1),
  machines: last.machines,
  links: last.links,
  batches: last.batches,
  credits: last.credits,
  storeUnits: last.storeUnits,
  levels: last.levels,
  batchesPerSimHour: simHours > 0 ? Math.round(last.batches / simHours) : null,
  creditsPerSimHour: simHours > 0 ? Math.round((last.credits ?? 0) / simHours) : null,
  batchesPerWallMin: +(last.batches / (wallMs / 60000)).toFixed(1),
  appliedCommands: timeline.reduce((s, t) => s + (t.revDelta ?? 0), 0),
  noopTaps: timeline.slice(1).filter((t) => t.revDelta === 0).length,
  noInputLabelTaps: timeline.filter((t) => t.label === null).length,
  forkPicks,
  finalRow: last.dock,
  finalObjective: last.obj,
  finalStatus: last.status,
};
writeFileSync(
  "work/feedback/PLAYER-004-g1/policy-v2.json",
  JSON.stringify({ budgetSeconds: BUDGET_S, cadenceMs: 1000, viewport: "390x844@2 isMobile hasTouch", url: BASE, summary, timeline }, null, 1),
  "utf8",
);
console.log(JSON.stringify({ ...summary, forkPicks: summary.forkPicks.slice(0, 6) }, null, 1));
await page.context().browser().close();
