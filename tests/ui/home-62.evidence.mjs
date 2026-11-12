/**
 * UI-RESET-62 acceptance evidence: headless Chrome DOM/geometry/console/pixel
 * assertions on THIS branch's running app (vite dev, port 5172 by default,
 * RW62_PORT overrides), phone 390x844 (dsf 2, touch) and desktop 1920x1080.
 * No visual inspection is claimed: every "look" check is a programmatic DOM,
 * geometry, console or decoded-pixel test.
 *
 * Gate geometry (resolved): `.gate` is a full-viewport overlay (inset:0,
 * place-content:center), NOT the card itself. The title/continue card is the
 * union box of its centered children; assertGateGeometry proves overlay==frame,
 * card strictly smaller + centered, and the pixel audit measures that card box
 * (never the full frame) so the lit-text density check stays meaningful on wide
 * desktops. `.gate-settings` is likewise a full-viewport scrim; its audit region
 * is the bounded `.gate-settings .panel` card.
 *
 * Run from the worktree root:  pnpm tsx tests/ui/home-62.evidence.mjs
 * (tsx lets this .mjs import the game's own TypeScript encodeSave/engine, so the
 * seeded save is produced by the real persistence code at lastSeenMs=Date.now(),
 * and every action goes through real UI clicks/keys -> App -> store.)
 *
 * Output: full-frame PNGs + receipt.json under
 *   C:/Users/ryans/AppData/Local/Temp/rw-coord/home-62-evidence/
 * and a committed compact receipt at tests/ui/home-62.evidence.json.
 */
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSave, DEFAULT_SETTINGS, SAVE_KEY } from "../../src/game/persistence/save.ts";
import { LEASE_KEY } from "../../src/game/persistence/lease.ts";
import { createInitialState } from "../../src/game/simulation/types.ts";
import { applyCommand } from "../../src/game/simulation/commands.ts";
import { advance } from "../../src/game/simulation/engine.ts";
import { TUNING } from "../../src/game/content/defs.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = "C:/Users/ryans/AppData/Local/Temp/rw-coord/home-62-evidence";
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.RW62_PORT ?? 5172);
const url = `http://127.0.0.1:${PORT}/`;
const headSha = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: root }).toString().trim();

/** Mature yard built by the engine's own command path, persisted by encodeSave. */
function buildSeed() {
  const sim = createInitialState();
  for (let i = 0; i < 12; i += 1) {
    applyCommand(sim, { id: `ev-salvage-${i}`, type: "manual.salvage" });
    advance(sim, TUNING.manualPulseTicks);
  }
  applyCommand(sim, { id: "ev-repair", type: "drone.repair" });
  for (let tile = 1; tile <= 16; tile += 1) {
    if (applyCommand(sim, { id: `ev-build-${tile}`, type: "machine.build", blueprint: "sorter", tile }).ok) break;
  }
  advance(sim, 300);
  return { sim, text: encodeSave(sim, Date.now(), DEFAULT_SETTINGS) };
}
const seed = buildSeed();

const receipt = {
  issue: "https://github.com/darkmatter2222/Rustwake/issues/62",
  pr: "https://github.com/darkmatter2222/Rustwake/pull/105",
  headSha,
  branch,
  server: `vite dev (this worktree) at ${url}`,
  capturedAt: new Date().toISOString(),
  seed: { tick: seed.sim.tick, machines: seed.sim.machines.length, lastSeenMs: "Date.now() at capture", via: "src encodeSave + engine applyCommand/advance" },
  formFactors: {},
  failures: [],
};

function record(ff, phase, name, pass, detail) {
  const bucket = (receipt.formFactors[ff] ??= { viewport: null, phases: [] });
  let ph = bucket.phases.find((p) => p.name === phase);
  if (!ph) bucket.phases.push((ph = { name: phase, assertions: [], screenshots: [] }));
  ph.assertions.push({ name, pass, detail });
  if (!pass) receipt.failures.push(`${ff}/${phase}: ${name} — ${detail}`);
}
function assert(ff, phase, name, cond, detail = "") {
  record(ff, phase, name, Boolean(cond), detail);
  if (!cond) throw new Error(`ASSERT FAILED ${ff}/${phase}: ${name} ${detail}`);
}

/**
 * Full-frame pixel audit: decode the PNG in Chromium itself and measure it.
 *
 * Two layers, both form-factor independent:
 *  - full frame: exact device dimensions, not blank (distinct colors), dark theme.
 *  - content region: lit-text density INSIDE the primary UI's card box. `content`
 *    is either a CSS selector for a bounded card, or an explicit CSS-px box (used
 *    for `.gate`: the gate itself is a full-viewport overlay, so the meaningful
 *    region is the union box of its centered children — assertGateGeometry proves
 *    that card is strictly smaller than the frame before we audit it). A centered
 *    card leaves large dark margins on a wide desktop frame, so a single
 *    full-frame bright-share threshold would mis-scale across form factors; we
 *    measure where the UI actually is instead. This is stricter, not weaker.
 *    Both layers sample at a 7px stride: a coarse 97px grid aliases against the
 *    centered card on a wide desktop (it can miss the lit text entirely), which
 *    was calibrated against captured frames — phone 12 vs 110 distinct colors
 *    and desktop 10 vs 69 at 97px vs 7px. Denser sampling, same thresholds.
 */
async function auditFrame(page, buf, ff, phase, file, viewport, dsf, content) {
  const stats = await page.evaluate(
    async ({ b64, content, dsf }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = `data:image/png;base64,${b64}`;
      });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      // Content box in device pixels (CSS rect * deviceScaleFactor), clamped.
      const r =
        typeof content === "string" ? document.querySelector(content)?.getBoundingClientRect() : content;
      const rx0 = Math.max(0, Math.floor((r?.left ?? 0) * dsf));
      const ry0 = Math.max(0, Math.floor((r?.top ?? 0) * dsf));
      const rx1 = Math.min(c.width, Math.ceil((r?.right ?? 0) * dsf));
      const ry1 = Math.min(c.height, Math.ceil((r?.bottom ?? 0) * dsf));
      const colors = new Set();
      let dark = 0;
      let bright = 0;
      let total = 0;
      for (let y = 0; y < c.height; y += 7) {
        for (let x = 0; x < c.width; x += 7) {
          const i = (y * c.width + x) * 4;
          const rr = data[i];
          const gg = data[i + 1];
          const bb = data[i + 2];
          colors.add(((rr >> 3) << 10) | ((gg >> 3) << 5) | (bb >> 3));
          const lum = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
          if (lum < 40) dark += 1;
          if (lum > 160) bright += 1;
          total += 1;
        }
      }
      let regionBright = 0;
      let regionTotal = 0;
      for (let y = ry0; y < ry1; y += 7) {
        for (let x = rx0; x < rx1; x += 7) {
          const i = (y * c.width + x) * 4;
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          regionTotal += 1;
          if (lum > 160) regionBright += 1;
        }
      }
      return {
        width: img.width,
        height: img.height,
        distinctColors: colors.size,
        darkShare: +(dark / total).toFixed(4),
        brightShare: +(bright / total).toFixed(4),
        samples: total,
        content: typeof content === "string" ? content : "gate-card-box",
        region: {
          box: { x0: rx0, y0: ry0, x1: rx1, y1: ry1 },
          brightShare: regionTotal ? +(regionBright / regionTotal).toFixed(4) : 0,
          samples: regionTotal,
        },
      };
    },
    { b64: buf.toString("base64"), content, dsf }
  );
  const ph = receipt.formFactors[ff].phases.find((p) => p.name === phase);
  ph.screenshots.push({ file, ...stats });
  assert(ff, phase, `pixel audit ${file}: full frame`, stats.width === viewport.width * dsf && stats.height === viewport.height * dsf, JSON.stringify(stats));
  assert(ff, phase, `pixel audit ${file}: not blank`, stats.distinctColors > 24, `distinctColors=${stats.distinctColors}`);
  assert(ff, phase, `pixel audit ${file}: dark UI`, stats.darkShare > 0.2, JSON.stringify(stats));
  if (typeof content !== "string") {
    const bx = stats.region.box;
    assert(
      ff,
      phase,
      `pixel audit ${file}: card region is NOT the full frame`,
      (bx.x0 > 0 || bx.y0 > 0) && (bx.x1 < stats.width || bx.y1 < stats.height),
      JSON.stringify(bx)
    );
  }
  assert(
    ff,
    phase,
    `pixel audit ${file}: lit text in ${stats.content}`,
    stats.region.samples > 0 && stats.region.brightShare > 0.004,
    JSON.stringify(stats.region)
  );
}
async function shot(page, ff, phase, file, viewport, dsf, content) {
  const buf = await page.screenshot({ fullPage: false });
  writeFileSync(resolve(out, `${ff}-${file}`), buf);
  await auditFrame(page, buf, ff, phase, `${ff}-${file}`, viewport, dsf, content);
}

const clickText = async (page, label, scope = "button") => {
  const handle = await page.evaluateHandle(
    ({ label, scope }) =>
      [...document.querySelectorAll(scope)].find((node) =>
        (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().startsWith(label)
      ),
    { label, scope }
  );
  const el = handle.asElement();
  if (!el) throw new Error(`clickText: no ${scope} starts with "${label}"`);
  await el.click();
};
const rowVal = (page, label) =>
  page.evaluate((label) => {
    const row = [...document.querySelectorAll(".panel--settings .panel__row")].find(
      (n) => (n.querySelector("dt")?.textContent ?? "").trim() === label
    );
    return (row?.querySelector("dd")?.textContent ?? "").trim();
  }, label);
const savedSettings = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).payload.settings : null;
  }, SAVE_KEY);
const saveRaw = (page) => page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
const noScroll = (page) =>
  page.evaluate(() => ({
    ok:
      document.documentElement.scrollHeight <= window.innerHeight + 1 &&
      document.documentElement.scrollWidth <= window.innerWidth + 1,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
async function buttonHeights(page, scope) {
  return page.evaluate((scope) => {
    const root = scope ? document.querySelector(scope) : document;
    return [...(root?.querySelectorAll("button") ?? [])]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => ({
        label: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().slice(0, 40),
        h: Math.round(b.getBoundingClientRect().height),
      }));
  }, scope);
}
async function assertTargets(page, ff, phase, scope) {
  const rows = await buttonHeights(page, scope);
  const bad = rows.filter((r) => r.h < 44);
  assert(ff, phase, `touch targets >= 44px in ${scope ?? "document"}`, bad.length === 0, JSON.stringify(bad.length ? bad : rows.map((r) => r.h)));
}
async function openMenu(page) {
  // Rail mode (wide desktop) hides the dock Menu face; slot 5 owns the menu there.
  const via = await page.evaluate(() => {
    const face = document.querySelector(".shell-menu-face");
    if (face && face.getBoundingClientRect().width > 0) return "face";
    const slot = document.querySelector('.shell-rail [data-slot="5"]');
    return slot ? "rail" : "none";
  });
  if (via === "face") await page.click(".shell-menu-face");
  else if (via === "rail") await page.click('.shell-rail [data-slot="5"]');
  else throw new Error("openMenu: no menu face or rail slot 5");
  await page.waitForSelector(".shell-menu");
  return via;
}
const dialogCenterHit = (page) =>
  page.evaluate(() => {
    const d = document.querySelector(".reset-dialog");
    if (!d) return { present: false };
    const r = d.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      present: true,
      topmost: Boolean(hit?.closest(".reset-dialog")),
      rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
      inner: { w: window.innerWidth, h: window.innerHeight },
      menuUnder: Boolean(document.querySelector(".shell-menu")),
    };
  });

/**
 * `.gate` geometry: the gate is a full-viewport overlay (position:absolute;
 * inset:0; display:grid; place-content:center). Its centered children form the
 * title/continue CARD — the union of their rects — which is the only meaningful
 * pixel-audit region: it must be strictly smaller than the frame and centered.
 */
const gateGeometry = (page) =>
  page.evaluate(() => {
    const gate = document.querySelector(".gate");
    if (!gate) return null;
    const g = gate.getBoundingClientRect();
    const kids = [...gate.children]
      .map((k) => k.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const card = {
      left: Math.min(...kids.map((r) => r.left)),
      top: Math.min(...kids.map((r) => r.top)),
      right: Math.max(...kids.map((r) => r.right)),
      bottom: Math.max(...kids.map((r) => r.bottom)),
    };
    return {
      overlay: { left: g.left, top: g.top, width: g.width, height: g.height },
      card: { ...card, width: card.right - card.left, height: card.bottom - card.top },
      inner: { w: window.innerWidth, h: window.innerHeight },
      children: kids.length,
    };
  });
async function assertGateGeometry(page, ff, phase) {
  const geo = await gateGeometry(page);
  assert(
    ff,
    phase,
    "gate overlay spans the full viewport",
    Boolean(geo) &&
      Math.abs(geo.overlay.left) < 1 &&
      Math.abs(geo.overlay.top) < 1 &&
      Math.abs(geo.overlay.width - geo.inner.w) < 1 &&
      Math.abs(geo.overlay.height - geo.inner.h) < 1,
    JSON.stringify(geo)
  );
  const c = geo.card;
  const dx = Math.abs((c.left + c.right) / 2 - geo.inner.w / 2);
  const dy = Math.abs((c.top + c.bottom) / 2 - geo.inner.h / 2);
  assert(ff, phase, "title card strictly smaller than frame", c.width < geo.inner.w - 8 && c.height < geo.inner.h - 8, JSON.stringify(c));
  assert(ff, phase, "title card centered", dx <= 2 && dy <= 2, JSON.stringify({ dx, dy }));
  if (geo.inner.w >= 1200) {
    const margin = Math.min(c.left, geo.inner.w - c.right);
    assert(ff, phase, "desktop card leaves wide side margins", margin >= 100 && c.width <= geo.inner.w * 0.6, JSON.stringify({ margin, cardWidth: c.width, frameWidth: geo.inner.w }));
  }
  return geo;
}

function watchConsole(page, sink) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") sink.errors.push(text);
    if (/AudioContext|autoplay|user gesture/i.test(text)) sink.autoplay.push(text);
  });
  page.on("pageerror", (err) => sink.pageerrors.push(String(err)));
}

async function runFormFactor(browser, ff, viewport, dsf, isMobile) {
  receipt.formFactors[ff] = { viewport: { ...viewport, deviceScaleFactor: dsf, isMobile }, phases: [] };
  const consoleSink = { errors: [], autoplay: [], pageerrors: [] };

  // ---- Context A: fresh yard, pre-start settings, autoplay policy, keyboard ----
  const ctxA = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
  const a = await ctxA.newPage();
  watchConsole(a, consoleSink);
  await a.goto(url, { waitUntil: "networkidle" });
  await a.waitForSelector(".gate");
  const P = "fresh-gate";
  assert(ff, P, "fresh gate: Begin recovery primary", await a.locator(".gate__btn").textContent().then((t) => t.trim() === "Begin recovery"));
  assert(ff, P, "fresh gate: no Continue / New game", (await a.locator(".gate__secondary", { hasText: "New game" }).count()) === 0 && (await a.locator(".gate__btn", { hasText: "Continue" }).count()) === 0);
  assert(ff, P, "fresh gate: Settings entry", (await a.locator(".gate__secondary", { hasText: "Settings" }).count()) === 1);
  assert(ff, P, "fresh gate: fresh-yard line", (await a.locator(".gate__save").textContent()).includes("A fresh yard is waiting"));
  await assertTargets(a, ff, P, ".gate");
  const nsA = await noScroll(a);
  assert(ff, P, "no page scroll", nsA.ok, JSON.stringify(nsA));
  // Strict autoplay policy: nothing may voice or warn before the begin gesture.
  await a.waitForTimeout(700);
  assert(ff, P, "no autoplay warning pre-gesture", consoleSink.autoplay.length === 0, JSON.stringify(consoleSink.autoplay));
  const geoA = await assertGateGeometry(a, ff, P);
  await shot(a, ff, P, "01-fresh-gate.png", viewport, dsf, geoA.card);

  const S = "gate-settings";
  await clickText(a, "Settings", ".gate__secondary");
  await a.waitForSelector(".gate-settings .panel--settings");
  assert(ff, S, "Sound actual value On", (await rowVal(a, "Sound")) === "On");
  assert(ff, S, "Text size actual value 1", (await rowVal(a, "Text size")) === "1");
  assert(ff, S, "Reduced motion actual value Off", (await rowVal(a, "Reduced motion")) === "Off");
  assert(ff, S, "Display actual value Windowed", (await rowVal(a, "Display")) === "Windowed");
  const displayGraceful = await a.evaluate(() => {
    const btn = [...document.querySelectorAll(".panel--settings button")].find((b) =>
      /fullscreen/i.test(b.getAttribute("aria-label") ?? b.textContent ?? "")
    );
    const note = [...document.querySelectorAll(".panel--settings .status-line")]
      .map((n) => n.textContent ?? "")
      .join(" | ");
    return { disabled: btn?.disabled ?? null, note };
  });
  assert(
    ff, S, "display control graceful (enabled, or disabled + note)",
    displayGraceful.disabled === false || /not available|refused/i.test(displayGraceful.note),
    JSON.stringify(displayGraceful)
  );
  await assertTargets(a, ff, S, ".panel--settings");
  assert(ff, S, "no page scroll with panel", (await noScroll(a)).ok);
  await shot(a, ff, S, "02-gate-settings.png", viewport, dsf, ".gate-settings .panel");

  await clickText(a, "Sound off", ".panel--settings button");
  assert(ff, S, "mute writes through: value Off", (await rowVal(a, "Sound")) === "Off");
  assert(ff, S, "mute persisted pre-start", (await savedSettings(a))?.muted === true, JSON.stringify(await savedSettings(a)));
  await clickText(a, "Cycle text size", ".panel--settings button");
  assert(ff, S, "text cycle writes through: 1.25", (await rowVal(a, "Text size")) === "1.25");
  assert(ff, S, "text persisted pre-start", (await savedSettings(a))?.textScale === 1.25);
  await clickText(a, "Toggle reduced motion", ".panel--settings button");
  assert(ff, S, "motion writes through: On", (await rowVal(a, "Reduced motion")) === "On");
  assert(ff, S, "motion persisted pre-start", (await savedSettings(a))?.reducedMotion === true);
  await a.keyboard.press("Escape");
  await a.waitForSelector(".gate-settings", { state: "detached" });
  assert(ff, S, "Escape returns to title", (await a.locator(".gate").count()) === 1);

  const K = "keyboard-start";
  await a.evaluate(() => document.querySelector(".gate__btn")?.focus());
  await a.keyboard.press("Enter");
  await a.waitForSelector(".hud");
  assert(ff, K, "Enter on focused primary starts the yard", (await a.locator(".hud").count()) === 1);
  await a.waitForTimeout(400);
  assert(ff, K, "no console errors (context A)", consoleSink.errors.length === 0, JSON.stringify(consoleSink.errors));
  assert(ff, K, "no page errors (context A)", consoleSink.pageerrors.length === 0, JSON.stringify(consoleSink.pageerrors));
  assert(ff, K, "no autoplay warnings after gesture start", consoleSink.autoplay.length === 0, JSON.stringify(consoleSink.autoplay));
  await ctxA.close();

  // ---- Context B: seeded save, reset confirmation, post-start menu/settings ----
  const ctxB = await browser.newContext({ viewport, deviceScaleFactor: dsf, isMobile, hasTouch: isMobile });
  const b = await ctxB.newPage();
  watchConsole(b, consoleSink);
  await b.goto(url, { waitUntil: "networkidle" });
  // Seed once through the page's own storage (no init script: the post-reset
  // reload must land on a genuinely fresh yard, not a re-seeded one).
  await b.evaluate((text) => localStorage.setItem("rustwake.save.v1", text), seed.text);
  await b.reload({ waitUntil: "networkidle" });
  await b.waitForSelector(".gate");

  const C = "continue-gate";
  const primary = b.locator(".gate__btn");
  assert(ff, C, "Continue primary", (await primary.textContent()).trim() === "Continue");
  assert(ff, C, "Continue keeps Begin recovery accessible name", /^Begin recovery/.test(await primary.getAttribute("aria-label")));
  const saveLine = await b.locator(".gate__save").textContent();
  assert(ff, C, "summary names the actual run", saveLine.includes("Saved run found") && saveLine.includes(`Tick ${seed.sim.tick}`) && saveLine.includes(`${seed.sim.machines.length} machine`) && saveLine.includes("drone flying"), saveLine);
  assert(ff, C, "New game entry present", (await b.locator(".gate__secondary", { hasText: "New game" }).count()) === 1);
  await assertTargets(b, ff, C, ".gate");
  assert(ff, C, "no page scroll", (await noScroll(b)).ok);
  const geoC = await assertGateGeometry(b, ff, C);
  await shot(b, ff, C, "03-continue-gate.png", viewport, dsf, geoC.card);

  const D = "reset-dialog";
  const before = await saveRaw(b);
  await clickText(b, "New game", ".gate__secondary");
  await b.waitForSelector('.reset-dialog[role="alertdialog"]');
  assert(ff, D, "warning names permanent loss", (await b.locator("#reset-dialog-warning").textContent()).includes("permanently deletes"));
  assert(ff, D, "confirm disabled before acknowledgement", await b.locator(".reset-dialog__confirm").isDisabled());
  assert(ff, D, "Cancel owns initial focus", (await b.evaluate(() => document.activeElement?.textContent?.trim())) === "Cancel");
  const hit = await dialogCenterHit(b);
  assert(ff, D, "dialog topmost at its center", hit.topmost, JSON.stringify(hit));
  assert(ff, D, "dialog inside viewport", hit.rect.top >= 0 && hit.rect.left >= 0 && hit.rect.bottom <= hit.inner.h && hit.rect.right <= hit.inner.w, JSON.stringify(hit));
  await assertTargets(b, ff, D, ".reset-dialog");
  assert(ff, D, "no page scroll with dialog", (await noScroll(b)).ok);
  await shot(b, ff, D, "04-reset-dialog.png", viewport, dsf, ".reset-dialog");
  for (const key of ["1", "2", "3", "4", "5"]) await b.keyboard.press(key);
  assert(ff, D, "digit keys inert under dialog", (await b.locator(".reset-dialog").count()) === 1 && (await b.locator(".panel").count()) === 0);
  await clickText(b, "Cancel", ".reset-dialog button");
  await b.waitForSelector(".reset-dialog", { state: "detached" });
  assert(ff, D, "Cancel leaves save byte-identical", (await saveRaw(b)) === before);
  await clickText(b, "New game", ".gate__secondary");
  await b.waitForSelector(".reset-dialog");
  await b.keyboard.press("Escape");
  await b.waitForSelector(".reset-dialog", { state: "detached" });
  assert(ff, D, "Escape cancels, save untouched", (await saveRaw(b)) === before);

  const R = "reset-confirm";
  const oldLeaseOwner = await b.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw).owner : null;
  }, LEASE_KEY);
  await clickText(b, "New game", ".gate__secondary");
  await b.waitForSelector(".reset-dialog");
  await b.click(".reset-dialog__ack input");
  assert(ff, R, "acknowledgement enables confirm", await b.locator(".reset-dialog__confirm").isEnabled());
  await b.click(".reset-dialog__confirm");
  await b.waitForSelector(".gate");
  await b.waitForFunction(() => localStorage.getItem("rustwake.save.v1") === null);
  assert(ff, R, "save cleared", (await saveRaw(b)) === null);
  // The reset removes the old writer lease; the reloaded tab then claims a FRESH
  // one (different owner), so it is never demoted to reader by a stale heartbeat.
  const newLeaseOwner = await b.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw).owner : null;
  }, LEASE_KEY);
  assert(ff, R, "old writer lease cleared (fresh claim after reload)", newLeaseOwner === null || newLeaseOwner !== oldLeaseOwner, JSON.stringify({ oldLeaseOwner, newLeaseOwner }));
  assert(ff, R, "fresh title after reload", (await b.locator(".gate__btn").textContent()).trim() === "Begin recovery");
  assert(ff, R, "no Continue after reset", (await b.locator(".gate__secondary", { hasText: "New game" }).count()) === 0);
  const geoR = await assertGateGeometry(b, ff, R);
  await shot(b, ff, R, "05-after-reset.png", viewport, dsf, geoR.card);

  const M = "post-start";
  await b.evaluate((text) => localStorage.setItem("rustwake.save.v1", text), seed.text);
  await b.reload({ waitUntil: "networkidle" });
  await b.waitForSelector(".gate");
  await clickText(b, "Begin recovery", ".gate__btn");
  await b.waitForSelector(".hud");
  const zoom = await b.evaluate(() => {
    const face = document.querySelector(".shell-zoom__face--reset");
    return { text: face?.textContent?.trim(), aria: face?.getAttribute("aria-label") };
  });
  assert(ff, M, "camera face reads Recenter (aria Reset view)", zoom.text === "Recenter" && zoom.aria === "Reset view", JSON.stringify(zoom));
  const via = await openMenu(b);
  const rows = await b.evaluate(() => [...document.querySelectorAll(".shell-menu__row")].map((r) => (r.textContent ?? "").trim()));
  assert(ff, M, `menu (${via}) has Settings row`, rows.some((r) => r.startsWith("Settings")), JSON.stringify(rows));
  assert(ff, M, `menu (${via}) has Reset game row`, rows.some((r) => r.startsWith("Reset game")));
  const homeRow = rows.find((r) => r.startsWith("Home")) ?? "";
  assert(ff, M, "Home row is navigation-worded", homeRow.includes("yard overview"), homeRow);
  await assertTargets(b, ff, M, ".shell-menu");
  assert(ff, M, "no page scroll with menu", (await noScroll(b)).ok);
  await shot(b, ff, M, "06-menu.png", viewport, dsf, ".shell-menu");

  await clickText(b, "Settings", ".shell-menu__row");
  await b.waitForSelector(".panel--settings");
  assert(ff, M, "menu retires under Settings", (await b.locator(".shell-menu").count()) === 0);
  assert(ff, M, "post-start Sound actual value", (await rowVal(b, "Sound")) === "On");
  assert(ff, M, "post-start Text actual value", (await rowVal(b, "Text size")) === "1");
  await assertTargets(b, ff, M, ".panel--settings");
  await shot(b, ff, M, "07-settings-poststart.png", viewport, dsf, ".panel--settings");
  await b.keyboard.press("Escape");
  await b.waitForSelector(".panel--settings", { state: "detached" });
  assert(ff, M, "Escape closes post-start settings", (await b.locator(".hud").count()) === 1);

  const O = "reset-over-menu";
  await openMenu(b);
  await clickText(b, "Reset game", ".shell-menu__row");
  await b.waitForSelector(".reset-dialog");
  const over = await dialogCenterHit(b);
  assert(ff, O, "dialog layers above the open menu", over.topmost && over.menuUnder, JSON.stringify(over));
  assert(ff, O, "warning names permanent loss", (await b.locator("#reset-dialog-warning").textContent()).includes("permanently deletes"));
  await assertTargets(b, ff, O, ".reset-dialog");
  await shot(b, ff, O, "08-reset-over-menu.png", viewport, dsf, ".reset-dialog");
  const midSave = await saveRaw(b);
  await clickText(b, "Cancel", ".reset-dialog button");
  await b.waitForSelector(".reset-dialog", { state: "detached" });
  assert(ff, O, "Cancel keeps menu and run", (await b.locator(".shell-menu").count()) === 1 && (await saveRaw(b)) === midSave);
  await b.keyboard.press("Escape");
  await b.waitForSelector(".shell-menu", { state: "detached" });

  assert(ff, "console", "no console errors (context B)", consoleSink.errors.length === 0, JSON.stringify(consoleSink.errors));
  assert(ff, "console", "no page errors (context B)", consoleSink.pageerrors.length === 0, JSON.stringify(consoleSink.pageerrors));
  assert(ff, "console", "no autoplay warnings (context B)", consoleSink.autoplay.length === 0, JSON.stringify(consoleSink.autoplay));
  receipt.formFactors[ff].console = consoleSink;
  await ctxB.close();
}

// ---- dev server for THIS worktree, then the two form factors ----
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");
const server = spawn(process.execPath, [viteBin, "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

let browser;
try {
  const deadline = Date.now() + 30000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!up) throw new Error(`dev server did not start on ${PORT}: ${serverLog.slice(-800)}`);
  browser = await chromium.launch({
    executablePath,
    args: ["--autoplay-policy=user-gesture-required"],
  });
  await runFormFactor(browser, "phone", { width: 390, height: 844 }, 2, true);
  await runFormFactor(browser, "desktop", { width: 1920, height: 1080 }, 1, false);
} catch (err) {
  receipt.failures.push(String(err?.stack ?? err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
  const counts = Object.fromEntries(
    Object.entries(receipt.formFactors).map(([ff, data]) => [
      ff,
      {
        assertions: data.phases.reduce((n, p) => n + p.assertions.length, 0),
        passed: data.phases.reduce((n, p) => n + p.assertions.filter((a) => a.pass).length, 0),
        screenshots: data.phases.reduce((n, p) => n + p.screenshots.length, 0),
      },
    ])
  );
  receipt.summary = counts;
  receipt.serverLogTail = serverLog.slice(-400);
  writeFileSync(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2));
  // Committed compact receipt: same assertions, no base64, paths relative.
  writeFileSync(resolve(root, "tests/ui/home-62.evidence.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ headSha, branch, summary: counts, failures: receipt.failures }, null, 2));
}
