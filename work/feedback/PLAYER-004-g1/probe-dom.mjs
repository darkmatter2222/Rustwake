// PLAYER-004 g1 probe: what does the mobile viewport actually show, tap by tap?
// Usage: node work/feedback/PLAYER-004-g1/probe-dom.mjs
import { BASE, openMobile, SNAP } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const { browser, page, loadedIn } = await openMobile();
const steps = [];
const dump = () => page.evaluate(SNAP);

steps.push({ at: "load", snap: await dump() });
await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
await page.waitForTimeout(400);
steps.push({ at: "begin", snap: await dump() });

for (let i = 1; i <= 14; i++) {
  const primary = page.locator(".dock__btn--primary");
  if ((await primary.count()) > 0) await primary.first().click({ force: true });
  await page.waitForTimeout(1000);
  steps.push({ at: "tap" + i, snap: await dump() });
}

for (const name of ["Store", "Research", "Yard"]) {
  const b = page.locator(`.dock .dock__btn:near(:visible)`, { hasText: name });
  if ((await b.count()) > 0) {
    await b.first().click({ force: true });
    await page.waitForTimeout(400);
    steps.push({ at: "panel:" + name, snap: await dump() });
    await page.screenshot({ path: `work/feedback/PLAYER-004-g1/still-panel-${name.toLowerCase()}.png` });
    const close = page.locator(".panel .icon-btn", { hasText: "Close" });
    if ((await close.count()) > 0) await close.first().click({ force: true });
    await page.waitForTimeout(200);
  }
}

writeFileSync(
  "work/feedback/PLAYER-004-g1/probe-dom.json",
  JSON.stringify({ loadedIn, steps }, null, 1),
  "utf8",
);
for (const s of steps) {
  console.log(
    s.at,
    JSON.stringify({
      tick: s.snap.sim?.tick,
      rev: s.snap.sim?.revision,
      obj: s.snap.objective,
      status: s.snap.statusLines.map((l) => l.text),
      dock: s.snap.dock.map((d) => `${d.text}${d.primary ? "*" : ""}[${d.font}]`),
      panel: s.snap.panel ? s.snap.panel.title + " :: " + s.snap.panel.rows.slice(0, 8).join(" | ") : null,
      toast: s.snap.toast,
      sim: s.snap.sim,
    }),
  );
}
await browser.close();
