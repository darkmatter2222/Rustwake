import { chromium } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// UI-RESET/NAV (#47): painted captures of the specified design, prototype-nav.html, at the
// six measured bands. The prototype is self-contained, so no preview server is needed:
//   node work/evidence/UI-RESET-47/capture-proto-47.mjs
// The prototype counts every press itself (S.pressed), so the press column is its own log.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = resolve(root, "work/evidence/UI-RESET-47/captures");
mkdirSync(out, { recursive: true });
const html = pathToFileURL(resolve(root, "work/evidence/UI-RESET-47/prototype-nav.html")).href;
const exe = [process.env.CHROME_PATH, "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe", "C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe"].filter(Boolean).find((x) => existsSync(x));
const receipt = [];
const info = (page) => page.evaluate(() => {
  const box = (id) => { const n = document.getElementById(id); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const qbox = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const txt = (id) => { const n = document.getElementById(id); return n ? (n.textContent ?? "").trim() : null; };
  const faces = [...document.querySelectorAll("button, [aria-disabled]")].map((n) => { const r = n.getBoundingClientRect(); return { id: n.id, w: Math.round(r.width), h: Math.round(r.height), under44: r.width < 44 || r.height < 44, disabled: !!n.disabled || n.getAttribute("aria-disabled") === "true" }; });
  return { pressed: window.RW47 ? window.RW47.pressed() : null, last: window.RW47 ? window.RW47.log().slice(-1)[0] ?? null : null, nav: txt("nav"), band: txt("band"), card: txt("card"), insp: txt("insp"), action: txt("action"), zoom: txt("zr"), rects: { shell: box("shell"), nav: box("nav"), band: box("band"), cluster: qbox(".cluster"), card: box("card"), insp: box("insp"), world: box("world"), action: box("action") }, faces, facesUnder44: faces.filter((f) => f.under44).length, docScroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight] };
});
const shot = async (page, name, note) => { const s = await info(page); await page.screenshot({ path: resolve(out, name + ".png") }); receipt.push(Object.assign({ file: name + ".png", note }, s)); console.log(name + ".png - " + note + " [pressed " + s.pressed + "]"); };
const tapId = (page, id) => page.evaluate((i) => { if (window.RW47) window.RW47.tap(i); }, id);
const label = (page, id) => page.evaluate((i) => (document.getElementById(i)?.textContent ?? "").trim(), id);
const wait = (page, ms) => page.waitForTimeout(ms);
const make = async (browser, w, h, dpr, mobile, seed) => { const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile }); const p = await c.newPage(); await p.goto(html + "?seed=" + seed, { waitUntil: "domcontentloaded" }); await p.waitForSelector("#nav"); await wait(p, 120); return { c, p }; };
const pressWhile = async (p, prefix, max) => { for (let i = 0; i < max; i += 1) { const l = await label(p, "action-primary"); if (!l.startsWith(prefix)) return l; await tapId(p, "action-primary"); } return label(p, "action-primary"); };
const tapIf = async (p, id) => { if (await label(p, id) !== "") { await tapId(p, id); return true; } return false; };

const browser = await chromium.launch({ executablePath: exe });
try {
  { const { c, p } = await make(browser, 390, 844, 2, true, "fresh");
    await shot(p, "30-proto-phone-gate", "entry gate: one accented face, the sound toggle beside it");
    await tapId(p, "gate-begin");
    await shot(p, "31-proto-phone-rest-step0", "rest at step 0: five nav slots, Research locked with its reason, one accented face above them");
    await pressWhile(p, "Salvage", 8);
    await shot(p, "32-proto-phone-salvage", "salvage counted, the same slot order");
    await pressWhile(p, "Repair", 2);
    await shot(p, "33-proto-phone-repaired", "the repair price line then the build step, still one accented face");
    await tapId(p, "nav-build");
    await shot(p, "34-proto-phone-build-catalog", "Build destination: the catalog over the world, the nav row unchanged");
    await tapId(p, "bp-sorter");
    await shot(p, "35-proto-phone-build-chosen", "the chosen blueprint, place is the only accented face");
    await tapId(p, "action-primary");
    await shot(p, "36-proto-phone-placed", "one machine placed, no slot moved");
    await tapIf(p, "nav-yard"); await tapIf(p, "row-machine-1");
    await shot(p, "37-proto-phone-machine", "inspector from the Yard list, one press, no canvas hunting");
    await tapId(p, "nav-store");
    await shot(p, "38-proto-phone-store", "Store destination: one command format on every face");
    await tapId(p, "nav-menu"); await tapIf(p, "menu-import");
    await p.evaluate(() => window.RW47.field("{not a rustwake envelope")); await tapIf(p, "imp-apply");
    await shot(p, "39-proto-phone-import-error", "error state: the reason line and the expected shape inside Menu");
    await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
    await shot(p, "40-proto-phone-back", "two Escape presses: the import page then the sheet, back at the rest frame");
    await c.close(); }
  { const { c, p } = await make(browser, 360, 640, 3, true, "fresh");
    await tapId(p, "gate-begin"); await tapIf(p, "tgl-scale");
    await shot(p, "41-proto-phone360-scale", "360x640 one text-scale step up: the same two bottom bands");
    await tapId(p, "nav-menu");
    await shot(p, "42-proto-phone360-menu", "360x640 Menu sheet: sound, scale, reduced motion, the record and the import");
    await c.close(); }
  { const { c, p } = await make(browser, 844, 390, 2, true, "mature");
    await tapId(p, "gate-begin"); await tapId(p, "nav-store");
    await shot(p, "43-proto-landscape844-store", "844x390: one row carrying the five slots and the primary, sheet above it");
    await tapIf(p, "insp-close"); await tapIf(p, "nav-yard"); await tapIf(p, "row-machine-1");
    await shot(p, "44-proto-landscape844-fork", "844x390: inspector with the two priced fork faces beside the world");
    await c.close(); }
  { const { c, p } = await make(browser, 1366, 768, 1, false, "mature");
    await tapId(p, "gate-begin"); await tapId(p, "nav-store");
    await shot(p, "45-proto-desktop1366-store", "1366x768: rail, world column, inspector beside it, primary row under the world");
    await c.close(); }
  { const { c, p } = await make(browser, 1920, 1080, 1, false, "mature");
    await tapId(p, "gate-begin"); await tapId(p, "nav-yard"); await tapIf(p, "row-machine-1");
    await shot(p, "46-proto-desktop1920-machine", "1920x1080: the machine inspector in its own column, the price printed once");
    await tapId(p, "nav-research");
    await shot(p, "47-proto-desktop1920-research", "1920x1080: the research list in the same column, one Close face");
    await c.close(); }
  { const { c, p } = await make(browser, 2560, 1440, 1, false, "mature");
    await tapId(p, "gate-begin"); await tapId(p, "nav-menu");
    await shot(p, "48-proto-desktop2560-menu", "2560x1440: the capped frame, the Menu sheet in the right column, the ink beside it");
    await c.close(); }
  writeFileSync(resolve(out, "captures-proto.json"), JSON.stringify({ task: "UI-RESET/NAV #47 prototype path", issue: "https://github.com/darkmatter2222/Rustwake/issues/47", headSha: process.env.RUSTWAKE_SHA ?? "pending-stamp", tool: "playwright-core plus local Chrome/Edge, the self-contained prototype over file://", note: "the press column is the prototype own counter (S.pressed): one press per painted face", headShaConvention: "stamped by stamp-headsha-47.mjs to the captures commit; see README.md", captures: receipt }, null, 2) + String.fromCharCode(10));
  console.log("wrote " + receipt.length + " prototype captures");
} finally {
  await browser.close();
}
