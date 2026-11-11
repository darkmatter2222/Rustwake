// Temporary geometry debugger for UI-RESET-49 (deleted before publish).
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
const exe = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find((p) => existsSync(p));
const seed = readFileSync("docs/evidence/yard-mature.json", "utf8");
const b = await chromium.launch({ executablePath: exe });
for (const vp of [{ w: 844, h: 390, m: true }, { w: 1280, h: 800, m: false }, { w: 360, h: 640, m: true }]) {
  const c = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m, deviceScaleFactor: vp.m ? 2 : 1 });
  await c.addInitScript((raw) => localStorage.setItem("rustwake.save.v1", raw), seed);
  const p = await c.newPage();
  await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await p.click("text=Begin recovery");
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const back = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().startsWith("Back to yard")); back?.click(); });
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('.shell-rail [data-slot="menu"]')?.click());
  await p.waitForTimeout(400);
  const info = await p.evaluate(() => {
    const de = document.documentElement;
    const menu = document.querySelector(".shell-menu");
    const cs = menu ? getComputedStyle(menu) : null;
    const panel = document.querySelector(".panel");
    const pcs = panel ? getComputedStyle(panel) : null;
    const body = document.querySelector(".panel__body");
    const bcs = body ? getComputedStyle(body) : null;
    return {
      rootStyle: de.style.cssText,
      rootVar: getComputedStyle(de).getPropertyValue("--shell-inspector-top"),
      hudVar: getComputedStyle(document.querySelector(".hud")).getPropertyValue("--shell-inspector-top"),
      menu: cs ? { position: cs.position, top: cs.top, bottom: cs.bottom, right: cs.right, width: cs.width, height: cs.height, maxHeight: cs.maxHeight, marginTop: cs.marginTop, display: cs.display, translate: cs.translate, transform: cs.transform, zoom: cs.zoom, contain: cs.contain, containerType: cs.containerType, alignSelf: cs.alignSelf, order: cs.order } : null,
      menuRect: menu ? menu.getBoundingClientRect().toJSON() : null,
      menuOffsetParent: menu?.offsetParent ? { cls: menu.offsetParent.className, rect: menu.offsetParent.getBoundingClientRect().toJSON() } : null,
      menuParent: menu?.parentElement ? { cls: menu.parentElement.className, rect: menu.parentElement.getBoundingClientRect().toJSON(), pos: getComputedStyle(menu.parentElement).position, zoom: getComputedStyle(menu.parentElement).zoom, contain: getComputedStyle(menu.parentElement).contain, containerType: getComputedStyle(menu.parentElement).containerType } : null,
      hudRect: document.querySelector(".hud")?.getBoundingClientRect().toJSON(),
      gameZoom: getComputedStyle(document.querySelector(".game")).zoom,
      bodyZoom: getComputedStyle(document.body).zoom,
      panel: pcs ? { top: pcs.top, bottom: pcs.bottom, maxHeight: pcs.maxHeight, height: pcs.height, display: pcs.display, overflow: pcs.overflow } : null,
      panelBody: bcs ? { overflow: bcs.overflow, overflowY: bcs.overflowY, flex: bcs.flex, minHeight: bcs.minHeight } : null,
      leadBottom: document.querySelector(".hud__lead")?.getBoundingClientRect().bottom,
      mq: matchMedia("(min-width: 1200px), (min-width: 600px) and (max-height: 460px)").matches,
      inner: [innerWidth, innerHeight],
    };
  });
  console.log(vp.w + "x" + vp.h, JSON.stringify(info, null, 1));
  if (vp.w === 1280) {
    const steps = await p.evaluate(() => {
      const m = document.querySelector(".shell-menu");
      const out = [];
      const snap = (tag) => { const r = m.getBoundingClientRect(); const cs = getComputedStyle(m); out.push({ tag, y: r.y, h: r.height, top: cs.top, bottom: cs.bottom, height: cs.height, pos: cs.position }); };
      snap("baseline");
      out.push({ inlineStyle: m.getAttribute("style"), html: m.outerHTML.slice(0, 220) });
      m.style.setProperty("top", "104px", "important"); snap("top!");
      m.style.setProperty("bottom", "8px", "important"); snap("bottom!");
      m.style.setProperty("height", "auto", "important"); snap("height!");
      m.style.setProperty("align-self", "auto"); snap("align");
      m.style.setProperty("order", "0"); snap("order");
      m.style.setProperty("margin-top", "0"); snap("margin");
      m.style.setProperty("max-height", "none", "important"); snap("maxh");
      m.style.setProperty("inset", "104px 8px 8px auto", "important"); snap("inset");
      return out;
    });
    console.log("STEPS", JSON.stringify(steps, null, 1));
  }
  await c.close();
}
await b.close();
