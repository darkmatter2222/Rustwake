// PLAYER-004 g1: stills, legibility census at 390 px, and a 6-frame motion sample.
// Usage: node work/feedback/PLAYER-004-g1/captures.mjs
import { BASE, openMobile, SNAP } from "./lib.mjs";
import { writeFileSync } from "node:fs";

const OUT = "work/feedback/PLAYER-004-g1/";
const { page } = await openMobile();
const dump = () => page.evaluate(SNAP);
const meta = { url: BASE, viewport: "390x844 dpr2 isMobile hasTouch", stills: [], notes: [] };

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
  meta.stills.push(name + ".png");
};

await shot("01-gate-rest");
meta.gate = await dump();

await page.getByRole("button", { name: /^Begin recovery/ }).click({ force: true });
await page.waitForTimeout(600);
await shot("02-first-screen");

// salvage through the tutorial opening so the yard exists at all
for (let i = 0; i < 10; i++) {
  const p = page.locator(".dock__btn--primary");
  if ((await p.count()) > 0) await p.first().click({ force: true });
  await page.waitForTimeout(1000);
}
await shot("03-after-drone-repair");

// build phase (dock shows a priced build face) then the ghost/place phase
const build = page.locator(".dock__btn--primary");
if ((await build.count()) > 0) await build.first().click({ force: true });
await page.waitForTimeout(700);
await shot("04-priced-build-face");
const place = page.locator(".dock__btn--primary");
if ((await place.count()) > 0) await place.first().click({ force: true });
await page.waitForTimeout(1400);
await shot("05-yard-with-machine");

// keep going until the dock shows a Connect face or 40 taps pass
let connectSeen = null;
for (let i = 0; i < 40; i++) {
  const snap = await dump();
  const c = snap.dock.find((b) => b.primary && /^Connect/.test(b.text || ""));
  if (c) {
    connectSeen = c.text;
    await shot("06-connect-face");
    break;
  }
  const p = page.locator(".dock__btn--primary");
  if ((await p.count()) > 0) await p.first().click({ force: true });
  await page.waitForTimeout(1000);
}

// machine panel: the machine tile is tapped through the canvas; use the dock Store/Research/Yard
const store = page.locator(".dock .dock__btn", { hasText: "Store" });
if ((await store.count()) > 0) {
  await store.first().click({ force: true });
  await page.waitForTimeout(500);
  await shot("07-store-panel");
  meta.storePanel = (await dump()).panel;
  const close = page.locator(".panel .icon-btn", { hasText: "Close" });
  if ((await close.count()) > 0) await close.first().click({ force: true });
  await page.waitForTimeout(300);
}

// machine panel via a canvas tap near the placed machine, then the yard record
const box = await page.locator("canvas").boundingBox();
for (const [fx, fy] of [[0.5, 0.42], [0.35, 0.5], [0.62, 0.55]]) {
  await page.touchscreen.tap(Math.round(box.x + box.width * fx), Math.round(box.y + box.height * fy));
  await page.waitForTimeout(400);
  const s = await dump();
  if (s.panel) {
    meta.machinePanel = s.panel;
    await shot("08-machine-panel");
    const close = page.locator(".panel .icon-btn", { hasText: "Close" });
    if ((await close.count()) > 0) await close.first().click({ force: true });
    break;
  }
}

const yard = page.locator(".dock .dock__btn", { hasText: "Yard" });
if ((await yard.count()) > 0) {
  await yard.first().click({ force: true });
  await page.waitForTimeout(500);
  await shot("09-yard-record");
  meta.yardPanel = (await dump()).panel;
  const close = page.locator(".panel .icon-btn", { hasText: "Close" });
  if ((await close.count()) > 0) await close.first().click({ force: true });
  await page.waitForTimeout(300);
}

const research = page.locator(".dock .dock__btn", { hasText: "Research" });
if ((await research.count()) > 0) {
  await research.first().click({ force: true });
  await page.waitForTimeout(500);
  await shot("10-research-panel");
  meta.researchPanel = (await dump()).panel;
  const close = page.locator(".panel .icon-btn", { hasText: "Close" });
  if ((await close.count()) > 0) await close.first().click({ force: true });
}

// ---- legibility census: every text node that is visible, its font size and line box
meta.census = await page.evaluate(() => {
  const rows = [];
  for (const n of document.querySelectorAll(".hud, .hud *")) {
    const cs = getComputedStyle(n);
    if (!n.textContent || n.children.length > 0) continue;
    const r = n.getBoundingClientRect();
    rows.push({
      cls: n.className || n.tagName,
      text: n.textContent.slice(0, 60),
      font: cs.fontSize,
      px: parseFloat(cs.fontSize),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      color: cs.color,
      overflow: n.scrollWidth > Math.ceil(r.width) ? "clipped" : "ok",
    });
  }
  return rows;
});

// ---- 6-frame motion sample with no input: drone/cargo interpolation
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight };
});
meta.canvas = canvasInfo;
const motion = [];
for (let f = 0; f < 6; f++) {
  const s = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const ctx = c.getContext("2d");
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    let n = 0,
      sx = 0,
      sy = 0;
    let s2x = 0,
      s2y = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        // amber drone/charge pixels: high R, mid G, low B (the accent fill family)
        if (r > 200 && g > 140 && g < 215 && b < 130) {
          n++;
          sx += x;
          sy += y;
          s2x += x * x;
          s2y += y * y;
        }
      }
    }
    const raw = localStorage.getItem("rustwake.save.v1");
    const sim = raw ? JSON.parse(raw).payload.sim : null;
    const mean = n ? { x: sx / n, y: sy / n } : null;
    return {
      t: performance.now(),
      tick: sim ? sim.tick : null,
      amber: n,
      cx: mean ? +mean.x.toFixed(2) : null,
      cy: mean ? +mean.y.toFixed(2) : null,
      sdX: n ? +Math.sqrt(Math.max(0, s2x / n - mean.x * mean.x)).toFixed(2) : null,
      sdY: n ? +Math.sqrt(Math.max(0, s2y / n - mean.y * mean.y)).toFixed(2) : null,
    };
  });
  motion.push(s);
  await page.screenshot({ path: `${OUT}motion-${f + 1}.png` });
  await page.waitForTimeout(100);
}
meta.motion = motion;
meta.motionDelta = motion
  .slice(1)
  .map((m, i) => ({
    frame: i + 2,
    dMs: +(m.t - motion[i].t).toFixed(1),
    dTick: m.tick !== null && motion[i].tick !== null ? m.tick - motion[i].tick : null,
    dCx: m.cx !== null && motion[i].cx !== null ? +(m.cx - motion[i].cx).toFixed(2) : null,
    dCy: m.cy !== null && motion[i].cy !== null ? +(m.cy - motion[i].cy).toFixed(2) : null,
    dAmber: m.amber - motion[i].amber,
  }));

writeFileSync(OUT + "captures.json", JSON.stringify(meta, null, 1), "utf8");
console.log("stills", meta.stills.join(", "));
console.log("canvas", JSON.stringify(canvasInfo));
console.log("motion", JSON.stringify(motion.map((m) => [m.tick, m.amber, m.cx, m.cy])));
console.log("motionDelta", JSON.stringify(meta.motionDelta));
console.log(
  "smallest fonts",
  JSON.stringify(
    meta.census
      .filter((c) => c.px > 0)
      .sort((a, b) => a.px - b.px)
      .slice(0, 8),
  ),
);
console.log("clipped", JSON.stringify(meta.census.filter((c) => c.overflow === "clipped")));
await page.context().browser().close();
