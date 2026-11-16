import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// UI-RESET-49 (G2): the painted app shell at every #43 viewport, in the harness
// style committed for #47 (one read of the painted DOM beside each PNG, one press
// counter). Every frame is probe-verified before it is written: no body scroll,
// every visible target inside the viewport at the 44 px floor, chrome boxes that
// do not overlap, canvas ink, and the mode/geometry the viewport owes.
//
// Prereqs, from the worktree root: npm ci && npm run build, then in a second shell
//   node node_modules/vite/bin/vite.js preview --port 4173 --strictPort
// and then:  node work/evidence/UI-RESET-49/capture-shell-49.mjs
//
// The receipt's headSha is stamped by the metadata-only commit that follows the
// captures commit (headSha = head^), per the task's two-commit convention.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = resolve(root, "work/evidence/UI-RESET-49/captures");
mkdirSync(out, { recursive: true });
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const exe = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
const seedPath = resolve(root, "docs/evidence/yard-mature.json");
const seedText = existsSync(seedPath) ? readFileSync(seedPath, "utf8") : null;
if (!seedText) { console.error("missing docs/evidence/yard-mature.json"); process.exit(1); }
const receipt = [];
const failures = [];
const sequences = [];
let presses = 0;
let frameNo = 0;

// The nine #43 viewports. Phones/tablet/landscape carry touch + device pixels;
// desktops are 1x. 768x1024 stays column (R2 deviation, recorded in the PR).
const VIEWPORTS = [
  { name: "phone360", w: 360, h: 640, dpr: 2, mobile: true, mode: "phone" },
  { name: "phone390", w: 390, h: 844, dpr: 3, mobile: true, mode: "phone" },
  { name: "phone412", w: 412, h: 915, dpr: 2, mobile: true, mode: "phone" },
  { name: "tablet768", w: 768, h: 1024, dpr: 2, mobile: true, mode: "column" },
  { name: "land844", w: 844, h: 390, dpr: 2, mobile: true, mode: "rail" },
  { name: "desk1280", w: 1280, h: 800, dpr: 1, mobile: false, mode: "rail" },
  { name: "desk1366", w: 1366, h: 768, dpr: 1, mobile: false, mode: "rail" },
  { name: "desk1920", w: 1920, h: 1080, dpr: 1, mobile: false, mode: "rail" },
  { name: "desk2560", w: 2560, h: 1440, dpr: 1, mobile: false, mode: "rail" },
];
const CONTEXT_TITLES = ["Yard store", "Research", "Yard record", "While you were away"];

// One read of what the player actually sees, taken in the same frame as the image.
const probe = (page) => page.evaluate(() => {
  const box = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    if (cs.display === "none" || r.width === 0 || r.height === 0) return null;
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const de = document.documentElement;
  const raw = localStorage.getItem("rustwake.save.v1");
  const sim = raw ? JSON.parse(raw).payload.sim : null;
  // getBoundingClientRect ignores ancestor clipping: a row scrolled below the
  // fold of `.panel__body` / `.shell-menu__body` still reports its layout box.
  // Intersect with every clipping ancestor so `visible` and `reach` judge the
  // painted pixels, not the layout geometry (the phone-band reach failures in
  // the first capture pass were all clipped scroller rows, not painted overflow).
  const paintedRect = (n, r) => {
    let rect = { x: r.x, y: r.y, w: r.width, h: r.height };
    for (let a = n.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const ar = a.getBoundingClientRect();
      const x = Math.max(rect.x, ar.x), y = Math.max(rect.y, ar.y);
      const right = Math.min(rect.x + rect.w, ar.x + ar.width);
      const bottom = Math.min(rect.y + rect.h, ar.y + ar.height);
      rect = { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
      if (rect.w === 0 || rect.h === 0) break;
    }
    return rect;
  };
  const buttons = [...document.querySelectorAll(".hud button")].map((n) => {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    const painted = paintedRect(n, r);
    return {
      label: (n.getAttribute("aria-label") ?? n.textContent ?? "").trim().slice(0, 44),
      visible: cs.display !== "none" && cs.visibility !== "hidden" && painted.w > 0 && painted.h > 0,
      x: r.x, y: r.y, w: r.width, h: r.height,
      px: painted.x, py: painted.y, pw: painted.w, ph: painted.h,
      minH: Number.parseFloat(cs.minHeight) || 0,
      disabled: n.disabled,
    };
  });
  // The column lead reserves its top-right corner for the Menu face via
  // padding-right; the box overlap test needs the measured reserve to tell a
  // reserved-zone paint (contract) from a real collision (defect).
  const leadTop = document.querySelector(".hud__top") ?? document.querySelector(".hud__lead");
  const leadPadRight = leadTop ? Number.parseFloat(getComputedStyle(leadTop).paddingRight) || 0 : 0;
  const rail = document.querySelector(".shell-rail");
  const railOn = !!rail && getComputedStyle(rail).display !== "none";
  // Canvas ink: one read, strided sample against the corner background pixel.
  let ink = null;
  const canvas = document.querySelector("canvas");
  if (canvas && canvas.width > 0) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const W = canvas.width, H = canvas.height;
      const img = ctx.getImageData(0, 0, W, H).data;
      const bg = [img[0], img[1], img[2]];
      const stepX = Math.max(1, Math.floor(W / 64)), stepY = Math.max(1, Math.floor(H / 64));
      let diff = 0, samples = 0;
      for (let y = 0; y < H; y += stepY) {
        for (let x = 0; x < W; x += stepX) {
          const i = (y * W + x) * 4;
          samples += 1;
          if (Math.abs(img[i] - bg[0]) + Math.abs(img[i + 1] - bg[1]) + Math.abs(img[i + 2] - bg[2]) > 24) diff += 1;
        }
      }
      ink = { samples, diff, ratio: Number((diff / samples).toFixed(4)) };
    }
  }
  return {
    viewport: [window.innerWidth, window.innerHeight],
    mode: railOn ? "rail" : (window.innerWidth <= 599 ? "phone" : "column"),
    boxes: {
      lead: box(".hud__lead") ?? box(".hud__top"),
      dock: box(".dock"),
      rail: box(".shell-rail"),
      panel: box(".panel"),
      menu: box(".shell-menu"),
      face: box(".shell-menu-face"),
    },
    inspectorTop: getComputedStyle(de).getPropertyValue("--shell-inspector-top").trim() || null,
    leadPadRight,
    panelTitles: [...document.querySelectorAll(".panel__title")].map((n) => (n.textContent ?? "").trim()),
    menuOpen: !!document.querySelector('.shell-menu[role="dialog"]'),
    railSlots: [...document.querySelectorAll(".shell-rail [data-slot]")].map((n) => ({
      slot: n.dataset.slot, disabled: n.disabled,
      pressed: n.getAttribute("aria-pressed"),
      reason: (n.querySelector(".shell-rail__reason")?.textContent ?? "").trim(),
    })),
    dockFaces: [...document.querySelectorAll(".dock .dock__btn")].map((n) => (n.textContent ?? "").trim()),
    docScroll: [de.scrollWidth, de.clientWidth, de.scrollHeight, de.clientHeight],
    bodyOverflow: getComputedStyle(document.body).overflow,
    hudClass: document.querySelector(".hud")?.className ?? null,
    buttons,
    ink,
    toast: (document.querySelector(".toast")?.textContent ?? "").trim() || null,
    sim: sim ? {
      tick: sim.tick, revision: sim.revision, tutorial: sim.tutorial,
      machines: sim.machines.length, routes: sim.routes.length, credits: sim.credits,
      machineTiles: sim.machines.map((m) => m.tile),
      fingerprint: JSON.stringify([
        sim.machines.map((m) => [m.id, m.blueprint, m.tile, m.orientation, m.level]),
        sim.routes.map((r) => [r.id, r.from, r.to, r.filter]),
        sim.tutorial, sim.nextMachineId, sim.nextRouteId,
      ]),
    } : null,
  };
});

const byText = (page, label) => page.evaluate((t) => {
  const n = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith(t));
  if (!n || n.disabled) return false;
  n.click();
  return true;
}, label);
const wait = (page, ms) => page.waitForTimeout(ms);
const install = (ctx, text, mut) => ctx.addInitScript(([raw, m]) => {
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); };
  const env = JSON.parse(raw);
  if (m) {
    for (const [path, value] of Object.entries(JSON.parse(m))) {
      let node = env;
      const parts = path.split(".");
      for (const q of parts.slice(0, -1)) node = node[q];
      node[parts[parts.length - 1]] = value;
    }
    env.checksum = fnv(JSON.stringify(env.payload));
  }
  localStorage.setItem("rustwake.save.v1", JSON.stringify(env));
}, [text, mut ? JSON.stringify(mut) : null]);

const make = async (browser, vp, seed, mut) => {
  const c = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
  if (seed) await install(c, seed, mut);
  const p = await c.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Begin recovery");
  return { c, p };
};
// Mature saves boot into the return report after the catch-up settles; press
// "Back to yard" once it paints. Fresh yards just clear the gate.
const settle = async (page, mature) => {
  await page.click("text=Begin recovery");
  presses += 1;
  if (!mature) { await wait(page, 450); return; }
  for (let i = 0; i < 32; i += 1) {
    await wait(page, 250);
    const state = await page.evaluate(() => {
      const back = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Back to yard"));
      if (back) { back.click(); return "back"; }
      const begin = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith("Begin recovery"));
      return begin ? "gate" : "yard";
    });
    if (state === "back") { presses += 1; await wait(page, 400); return; }
    if (state === "yard" && i >= 6) { await wait(page, 250); return; }
  }
  await wait(page, 400);
};

const openMenu = async (page, mode) => {
  await page.evaluate((m) => {
    const n = m === "rail" ? document.querySelector('.shell-rail [data-slot="menu"]') : document.querySelector(".shell-menu-face");
    n?.click();
  }, mode);
  presses += 1;
  await wait(page, 300);
};
const openStore = async (page, mode) => {
  if (mode === "rail") {
    await page.evaluate(() => document.querySelector('.shell-rail [data-slot="store"]')?.click());
    presses += 1;
  } else {
    await byText(page, "Store");
    presses += 1;
  }
  await wait(page, 300);
};
const escape = async (page) => { await page.keyboard.press("Escape"); presses += 1; await wait(page, 260); };

// The camera the shell paints, reproduced from the painted chrome boxes exactly
// as App.fitToShell does (scene.ts fitCamera + the rail recentering term).
function cameraFor(boxes, W, H) {
  const { lead, dock, rail } = boxes;
  if (!lead || !dock) return null;
  const top = lead.bottom + 6;
  const bottom = Math.max(0, H - dock.y) + 6;
  const left = rail ? rail.right + 6 : 0;
  const right = rail ? 334 : 0;
  const regionW = Math.max(1, W - left - right);
  const usableH = H - top - bottom;
  const raw = Math.min(4, regionW / 200); // WORLD_W + 8 = 200
  let scale, y;
  if (usableH <= 0) { scale = Math.max(1.4, raw); y = 112; }
  else {
    const bandScale = usableH / 236; // WORLD_H + 12 = 236
    scale = bandScale >= raw ? Math.max(1.4, raw) : Math.max(1.1, Math.min(raw, bandScale));
    const bandCentre = top + usableH / 2;
    y = 112 + (H / 2 - bandCentre) / scale;
  }
  let x = 96; // WORLD_W / 2
  if (left > 0 || right > 0) x += (W / 2 - (left + regionW / 2)) / scale;
  return { x, y, scale };
}
// Tap the first machine whose painted centre sits inside the clear world band.
const tapMachine = async (page, p) => {
  const [W, H] = p.viewport;
  const cam = cameraFor(p.boxes, W, H);
  if (!cam || !p.sim) return null;
  const x0 = p.boxes.rail ? p.boxes.rail.right + 2 : 2;
  const x1 = W - (p.boxes.rail ? 334 : 2) - 2;
  const y0 = p.boxes.lead.bottom + 2;
  const y1 = p.boxes.dock.y - 2;
  for (const tile of p.sim.machineTiles) {
    const wx = (tile % 6) * 32 + 16, wy = Math.floor(tile / 6) * 32 + 16;
    const sx = (wx - cam.x) * cam.scale + W / 2;
    const sy = (wy - cam.y) * cam.scale + H / 2;
    if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
    await page.mouse.click(sx, sy);
    presses += 1;
    await wait(page, 340);
    return { tile, sx: Math.round(sx), sy: Math.round(sy), cam };
  }
  return null;
};

// The per-frame verdict. Every capture is checked before it counts as evidence.
function checks(p, expect) {
  const c = {};
  c.noBodyScroll = p.docScroll[0] <= p.docScroll[1] + 1 && p.docScroll[2] <= p.docScroll[3] + 1;
  c.bodyHidden = p.bodyOverflow === "hidden";
  const visible = p.buttons.filter((b) => b.visible);
  c.visibleTargets = visible.length;
  // Reach judges the painted rect: clipped scroller rows are not painted targets.
  c.reach = visible.every((b) => b.px >= -0.5 && b.py >= -0.5 && b.px + b.pw <= p.viewport[0] + 0.5 && b.py + b.ph <= p.viewport[1] + 0.5);
  c.floors = visible.every((b) => b.minH >= 44);
  c.ink = p.ink ? p.ink.ratio > 0.02 : false;
  const entries = Object.entries(p.boxes).filter(([, v]) => v);
  const overlaps = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [ka, a] = entries[i], [kb, b] = entries[j];
      // The phone Menu face sits in the dock's reserved 72 px padding zone.
      if ((ka === "dock" && kb === "face") || (ka === "face" && kb === "dock")) continue;
      // The column Menu face sits in the lead's measured padding-right reserve;
      // an overlap confined to that reserve is the contract, not a collision.
      if ((ka === "lead" && kb === "face") || (ka === "face" && kb === "lead")) {
        const l = p.boxes.lead, f = p.boxes.face;
        if (f.x >= l.right - p.leadPadRight - 0.5) continue;
      }
      const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      if (ix > 1 && iy > 1) overlaps.push(`${ka}/${kb}`);
    }
  }
  c.overlaps = overlaps;
  c.mode = p.mode === expect.mode;
  if (expect.menuOpen !== undefined) c.menuState = p.menuOpen === expect.menuOpen;
  if (expect.panel === "machine") c.panel = p.panelTitles.length > 0 && !CONTEXT_TITLES.includes(p.panelTitles[0]);
  else if (expect.panel) c.panel = p.panelTitles.includes(expect.panel);
  else if (expect.panel === null) c.panel = p.panelTitles.length === 0;
  if (expect.mode === "rail") {
    const r = p.boxes.rail;
    c.railBox = !!r && Math.abs(r.x - 8) <= 1 && Math.abs(r.w - 96) <= 1;
    c.dockBand = !!p.boxes.dock && Math.abs(p.boxes.dock.x - 110) <= 1;
    // Bug-1 regression: after Begin, App must have measured the lead and lifted
    // --shell-inspector-top past it (ceil(bottom + 6)); null meant the effect
    // never re-ran once the gate cleared and the sheets fell back to 104 px.
    const top = Number.parseFloat(p.inspectorTop ?? "");
    c.inspectorTopSet = Number.isFinite(top) && (!p.boxes.lead || top >= p.boxes.lead.bottom + 5);
    const sheet = p.boxes.menu ?? p.boxes.panel;
    if (sheet) {
      c.sheetBox = Math.abs(sheet.right - (p.viewport[0] - 8)) <= 1 && Math.abs(sheet.w - 320) <= 1 && sheet.y >= 103;
      c.leadClear = !p.boxes.lead || p.boxes.lead.bottom <= sheet.y + 1;
    }
  }
  if (expect.mode === "phone" && expect.face) {
    const f = p.boxes.face;
    c.faceBox = !!f && Math.abs(f.w - 66) <= 1 && Math.abs(f.bottom - (p.viewport[1] - 8)) <= 1;
  }
  return c;
}

const shot = async (page, name, note, expect) => {
  const p = await probe(page);
  const c = checks(p, expect);
  await page.screenshot({ path: resolve(out, name + ".png") });
  frameNo += 1;
  const failed = Object.entries(c).filter(([k, v]) => (k === "overlaps" ? v.length > 0 : v === false)).map(([k]) => k);
  for (const k of failed) failures.push({ file: name + ".png", check: k, detail: JSON.stringify(k === "overlaps" ? c.overlaps : p[k] ?? null) });
  receipt.push({ file: name + ".png", note, presses, expect, checks: c, probe: p });
  console.log(`${name}.png [${failed.length === 0 ? "PASS" : "FAIL " + failed.join(",")}] ${note} rev=${p.sim?.revision} ink=${p.ink?.ratio}`);
};

const browser = await chromium.launch({ executablePath: exe });
try {
  // A. every viewport, mature yard: rest / menu / store / machine at scale 1,
  //    rest / menu at scale 2. One context per (viewport, scale).
  for (const vp of VIEWPORTS) {
    for (const ts of [1, 2]) {
      const { c, p } = await make(browser, vp, seedText, ts === 2 ? { "payload.settings.textScale": 2 } : null);
      await settle(p, true);
      const tag = `${vp.name}-ts${ts}`;
      const base = { mode: vp.mode, face: vp.mode === "phone" };
      await shot(p, `${String(frameNo + 1).padStart(2, "0")}-${tag}-rest`, `mature rest, scale ${ts}`, { ...base, menuOpen: false, panel: null });
      await openMenu(p, vp.mode);
      await shot(p, `${String(frameNo + 1).padStart(2, "0")}-${tag}-menu`, `menu sheet open, scale ${ts}`, { ...base, menuOpen: true, panel: null });
      await escape(p);
      if (ts === 1) {
        await openStore(p, vp.mode);
        await shot(p, `${String(frameNo + 1).padStart(2, "0")}-${tag}-store`, "store inspector open", { ...base, menuOpen: false, panel: "Yard store" });
        await escape(p);
        const rest = await probe(p);
        const hit = await tapMachine(p, rest);
        await shot(p, `${String(frameNo + 1).padStart(2, "0")}-${tag}-machine`, hit ? `machine inspector, tile ${hit.tile} tapped at ${hit.sx},${hit.sy}` : "machine tap found no clear target", { ...base, menuOpen: false, panel: "machine" });
        if (!hit) failures.push({ file: `${tag}-machine`, check: "tap", detail: "no machine centre inside the clear band" });
        await escape(p);
      }
      await c.close();
    }
  }

  // B. acceptance 4 in the painted browser: select a machine at 1280x800, then
  //    resize to 390x844 and back. The selection, the sim revision (only commands
  //    bump it) and the structural fingerprint must all survive; the menu layer
  //    at 390 must hide the panel without clearing it (E3/E4).
  {
    const vp = VIEWPORTS.find((v) => v.name === "desk1280");
    const { c, p } = await make(browser, vp, seedText, null);
    await settle(p, true);
    const rest = await probe(p);
    const hit = await tapMachine(p, rest);
    const before = await probe(p);
    await shot(p, `${String(frameNo + 1).padStart(2, "0")}-resize-1280-selected`, "machine selected at 1280x800 before the resize", { mode: "rail", menuOpen: false, panel: "machine" });
    await p.setViewportSize({ width: 390, height: 844 });
    await wait(p, 650);
    const phone = await probe(p);
    await shot(p, `${String(frameNo + 1).padStart(2, "0")}-resize-390-selected`, "same selection painted at 390x844 after the resize", { mode: "phone", face: true, menuOpen: false, panel: "machine" });
    await openMenu(p, "phone");
    const menu = await probe(p);
    await shot(p, `${String(frameNo + 1).padStart(2, "0")}-resize-390-menu`, "menu over the same selection: panel yields, context survives", { mode: "phone", face: true, menuOpen: true });
    await escape(p);
    await p.setViewportSize({ width: 1280, height: 800 });
    await wait(p, 650);
    const back = await probe(p);
    await shot(p, `${String(frameNo + 1).padStart(2, "0")}-resize-1280-again`, "back at 1280x800, selection still painted", { mode: "rail", menuOpen: false, panel: "machine" });
    const same = (a, b) => a.panelTitles[0] === b.panelTitles[0] && a.sim.revision === b.sim.revision && a.sim.fingerprint === b.sim.fingerprint;
    const seq = {
      sequence: "B resize selection stability",
      tapped: hit,
      title: before.panelTitles[0] ?? null,
      revision: [before.sim.revision, phone.sim.revision, menu.sim.revision, back.sim.revision],
      stableAcrossResize: same(before, phone) && same(phone, back),
      selectionSurvivesMenu: menu.panelTitles[0] === before.panelTitles[0] && menu.boxes.panel === null,
      noToast: [before, phone, menu, back].every((x) => x.toast === null),
    };
    sequences.push(seq);
    if (!seq.stableAcrossResize) failures.push({ file: "resize", check: "stableAcrossResize", detail: JSON.stringify(seq.revision) });
    if (!seq.selectionSurvivesMenu) failures.push({ file: "resize", check: "selectionSurvivesMenu", detail: JSON.stringify(menu.panelTitles) });
    if (!seq.noToast) failures.push({ file: "resize", check: "noToast", detail: "a command toast appeared during navigation" });
    console.log("resize sequence:", JSON.stringify(seq));
    await c.close();
  }

  // C. the unearned rail (E8) and the earliest phone rest, both fresh yards.
  {
    const vp = VIEWPORTS.find((v) => v.name === "desk1280");
    const { c, p } = await make(browser, vp, null, null);
    await settle(p, false);
    const f = await probe(p);
    await shot(p, `${String(frameNo + 1).padStart(2, "0")}-fresh1280-rail-reasons`, "fresh rail: Yard and Research disabled with their printed reasons", { mode: "rail", menuOpen: false, panel: null });
    const yard = f.railSlots.find((s) => s.slot === "yard");
    const research = f.railSlots.find((s) => s.slot === "research");
    const e8 = yard?.disabled === true && yard.reason === "After tutorial" && research?.disabled === true && research.reason === "Needs data";
    sequences.push({ sequence: "C fresh rail reasons", e8, railSlots: f.railSlots });
    if (!e8) failures.push({ file: "fresh1280-rail-reasons", check: "e8", detail: JSON.stringify(f.railSlots) });
    await c.close();
  }
  {
    const vp = VIEWPORTS.find((v) => v.name === "phone360");
    const { c, p } = await make(browser, vp, null, null);
    await settle(p, false);
    await shot(p, `${String(frameNo + 1).padStart(2, "0")}-fresh360-rest`, "fresh yard at the smallest viewport: dock band + Menu face", { mode: "phone", face: true, menuOpen: false, panel: null });
    await c.close();
  }

  const summary = { frames: receipt.length, failedFrames: failures.length, failures };
  writeFileSync(resolve(out, "captures-shell.json"), JSON.stringify({
    task: "UI-RESET-49 G2 app shell",
    issue: "https://github.com/darkmatter2222/Rustwake/issues/49",
    headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp",
    tool: "playwright-core plus local Chrome/Edge, vite preview; one painted DOM+pixel probe per PNG, every frame checked",
    seed: "docs/evidence/yard-mature.json (tick 18298, 8 machines); ts2 via payload.settings.textScale=2 with recomputed checksum",
    viewports: VIEWPORTS,
    sequences,
    summary,
    captures: receipt,
  }, null, 2) + "\n");
  console.log(`wrote ${receipt.length} frames; ${failures.length} check failures`);
  if (failures.length > 0) {
    console.error("FAILURES:", JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
