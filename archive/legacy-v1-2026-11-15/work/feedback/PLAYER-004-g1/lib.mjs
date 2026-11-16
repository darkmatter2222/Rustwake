// PLAYER-004 g1: shared launch helper for the mobile-viewport runs.
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Users\\ryans\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

export const BASE = "https://home.darkmatter2222.com/rustwake/";
export const VIEWPORT = { width: 390, height: 844 };

export function executable() {
  return CANDIDATES.find((p) => existsSync(p)) ?? undefined;
}

export async function openMobile(videoDir) {
  const browser = await chromium.launch({ headless: true, executablePath: executable() });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    // Fresh storage per context is the default for a new context; recorded here so the
    // two policies provably start from the same deterministic seed.
    recordVideo: videoDir ? { dir: videoDir, size: { width: 390, height: 844 } } : undefined,
  });
  const page = await context.newPage();
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: "load" });
  const loadedIn = Date.now() - t0;
  return { browser, context, page, loadedIn };
}

/** Everything the resting screen shows, plus the stored sim numbers. */
export const SNAP = () => {
  const rect = (n) => {
    const r = n.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  const btns = [...document.querySelectorAll(".dock .dock__btn")].map((n, i) => ({
    i,
    text: n.textContent,
    primary: n.className.includes("--primary"),
    branch: n.className.includes("--branch"),
    rect: rect(n),
    font: getComputedStyle(n).fontSize,
  }));
  const raw = localStorage.getItem("rustwake.save.v1");
  let sim = null;
  if (raw) {
    const p = JSON.parse(raw).payload;
    sim = p ? p.sim : null;
  }
  const canvas = document.querySelector("canvas");
  return {
    vw: window.innerWidth,
    vh: window.innerHeight,
    dpr: window.devicePixelRatio,
    docH: document.documentElement.scrollHeight,
    canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
    gate: document.querySelector(".gate__btn")?.textContent ?? null,
    objective: document.querySelector(".objective__primary")?.textContent ?? null,
    statusLines: [...document.querySelectorAll(".objective .status-line")].map((n) => ({
      text: n.textContent,
      font: getComputedStyle(n).fontSize,
    })),
    chips: [...document.querySelectorAll(".resources__item")].map((n) => ({
      text: n.textContent,
      font: getComputedStyle(n).fontSize,
    })),
    dock: btns,
    toast: document.querySelector(".toast")?.textContent ?? null,
    panel: document.querySelector(".panel")
      ? {
          title: document.querySelector(".panel__title")?.textContent ?? null,
          rows: [...document.querySelectorAll(".panel__row")].map((n) => n.textContent),
          icons: [...document.querySelectorAll(".panel .icon-btn")].map((n) => n.textContent),
        }
      : null,
    sim: sim
      ? {
          tick: sim.tick,
          revision: sim.revision,
          credits: Math.round(sim.credits),
          machines: sim.machines.length,
          links: sim.routes.length,
          drones: 1 + (sim.spares ? sim.spares.length : 0),
          batches: sim.machines.reduce((s, m) => s + m.batchesDone, 0),
          storeUnits: sim.storeUnits,
          storeCapacity: sim.storeCapacity,
          powerRatio: sim.powerRatio,
          tutorial: sim.tutorial,
          levels: sim.machines.map((m) => m.blueprint + ":L" + m.level + (m.branch ? ":" + m.branch.join("+") : "")).join(" "),
        }
      : null,
  };
};
