// Issue #147 headless evidence: the T20 road fleet / routes panels and dispatch
// policy controls, exercised through the RUNNING build in headless Chrome.
//
// The road logistics slice (#140) and traffic authority (#141) are SESSION-ONLY
// (the world grid is not in the save envelope; #148 owns the cutover), so this
// probe seeds NO save: it boots a fresh yard through the gate's Begin face and
// drives every mutation through the panels' own real forms/buttons. Nothing here
// touches src/, SAVE_KEY, migration or recovery.
//
// What it proves (numeric, from the running build — NOT visual certification):
//   fleet   - default-OFF traffic (#140 parity), opt-in Enable, add-truck rows,
//             select->profile + camera focus pan, default profile gated until on.
//   routes  - dispatch policy controls (15 material filters, reserve floor, min
//             fill), register-building through the real form, all THREE policy
//             gates firing (reserve-floor, below-min-fill, material-filtered),
//             and the HONEST empty-socket bay state (#217: production sockets are
//             empty until the #148 cutover).
//
// SESSION-ONLY REALITY (documented, not faked): a freshly registered building holds
// ZERO stock — the production stock feed is the #148 cutover, and no panel form
// seeds stock (seedLogisticsStock is a test-only store capability). The dispatch
// policy therefore refuses a plain job draft with the reserve-floor reason
// ("only 0 free") BEFORE the engine, so a LIVE job, its typed cargo/traffic wait
// reason, the job-blocker Focus and live cancel are NOT reachable through the
// running-build panel UI yet. Those paths are covered by the engine-backed unit
// tests (tests/ui/roadPanels-147.test.tsx, fleetModel-147.test.ts) with seeded
// stock, and are flagged PENDING #148 + G1 #151 capable inspection. The fleet
// SELECT focus needs no job, so it is the running-build camera-focus proof.
//
// Focus is checked against the canvas `data-cam` paint stamp (x,y toFixed(2),
// scale toFixed(3)): the 6x6 yard (192x224 world units) fits the desktop viewport
// at boot, so clampCamera pins both axes to the fitted anchor until zoomed past
// fit. After zooming to CAMERA_MAX_SCALE the yard is pan-able and the post-focus
// centre must move toward the selected cell's world centre (cell * CELL + CELL/2).
// This is a geometric/numeric check, not a fidelity claim.
//
// Run:  npx vite preview --port 4297            (background, serves the built head)
//       npx tsx scripts/probe-fleet147.mjs
// env:  RUSTWAKE_URL (default http://localhost:4297/), FLEET147_SHOTS (default
//       docs/evidence/fleet147), CHROME_PATH (auto-detect Chrome/Edge otherwise).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";
import { CELL } from "../src/game/renderer/grid";

const url = process.env.RUSTWAKE_URL ?? "http://localhost:4297/";
const shots = process.env.FLEET147_SHOTS ?? "docs/evidence/fleet147";
const TARGET = "docs/evidence/fleet147-headless.json";
const headSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]
  .filter(Boolean)
  .find((path) => existsSync(path));

const CELL_VIEW = { label: "1440x900", width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

const checks = [];
function check(scenario, name, ok, detail) {
  checks.push({ scenario, cell: CELL_VIEW.label, name, ok: ok === true, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${scenario}] ${name}${detail === undefined ? "" : ` · ${JSON.stringify(detail)}`}`);
  return ok === true;
}

/* ---- page readers (pure DOM projections of the running panels) ---- */

const readFleet = () => {
  const root = document.querySelector("section.road-fleet");
  if (!root) return null;
  const status = root.querySelector('p[role="status"]');
  const enable = [...root.querySelectorAll("button")].find(
    (b) => (b.textContent ?? "").trim() === "Enable traffic model",
  );
  const rows = [...root.querySelectorAll("li.road-fleet__row")].map((li) => {
    const select = li.querySelector("button.road-fleet__select");
    const hold = li.querySelector("span.road-fleet__hold");
    const focusBtn = hold ? hold.querySelector("button") : null;
    const profile = li.querySelector("form.road-form");
    return {
      selectAria: select?.getAttribute("aria-label") ?? null,
      selected: select?.getAttribute("aria-pressed") === "true",
      labelText: (select?.textContent ?? "").trim(),
      holdText: hold ? (hold.childNodes[0]?.textContent ?? "").trim() : null,
      recoveryText: hold ? (hold.querySelector("span.status-line")?.textContent ?? "").trim() : null,
      focusAria: focusBtn?.getAttribute("aria-label") ?? null,
      profilePresent: !!profile,
      profileInputDisabled: profile ? !!profile.querySelector("input")?.disabled : null,
    };
  });
  const defaultProfile = root.querySelector('form[aria-label="Default truck profile"]');
  const addMsg = root.querySelector('form[aria-label="Add truck"] p[role="note"]');
  const texts = [...root.querySelectorAll("p.status-line")].map((p) => (p.textContent ?? "").trim());
  return {
    trafficStatus: (status?.textContent ?? "").trim(),
    enablePresent: !!enable,
    enableDisabled: enable ? enable.disabled : null,
    rowCount: rows.length,
    rows,
    emptyText: texts.find((t) => t.startsWith("No trucks yet")) ?? null,
    defaultProfileDisabled: defaultProfile ? !!defaultProfile.querySelector("input")?.disabled : null,
    addMessage: (addMsg?.textContent ?? "").trim() || null,
    readerNote: texts.find((t) => t.startsWith("Read-only")) ?? null,
  };
};

const readRoutes = () => {
  const root = document.querySelector("section.road-routes");
  if (!root) return null;
  const policy = root.querySelector("section.road-policy");
  const filters = policy ? [...policy.querySelectorAll("label.road-policy__filter")] : [];
  const labeledInput = (start) => {
    const label = [...(policy?.querySelectorAll("label") ?? [])].find((l) =>
      (l.textContent ?? "").trim().startsWith(start),
    );
    return label ? label.querySelector("input") : null;
  };
  const floorInput = labeledInput("Reserve floor");
  const fillInput = labeledInput("Minimum fill");
  const jobs = [...root.querySelectorAll("li.road-routes__job")].map((li) => {
    const focus = li.querySelector("button.road-fleet__select");
    const hold = li.querySelector("span.road-fleet__hold");
    const holdFocus = hold ? hold.querySelector("button") : null;
    const cancel = li.querySelector('button[aria-label^="Cancel job"]');
    return {
      focusAria: focus?.getAttribute("aria-label") ?? null,
      labelText: (focus?.textContent ?? "").trim(),
      holdText: hold ? (hold.childNodes[0]?.textContent ?? "").trim() : null,
      recoveryText: hold ? (hold.querySelector("span.status-line")?.textContent ?? "").trim() : null,
      holdFocusAria: holdFocus?.getAttribute("aria-label") ?? null,
      cancelAria: cancel?.getAttribute("aria-label") ?? null,
      terminal: !cancel,
    };
  });
  const bays = root.querySelector("section.road-bays");
  const bayRows = bays ? [...bays.querySelectorAll("li.shell-list__item")] : [];
  const newJobMsg = root.querySelector('form[aria-label="New job"] p[role="note"]');
  const setupMsg = root.querySelector('form[aria-label="Register building"] p[role="note"]');
  const texts = [...root.querySelectorAll("p.status-line")].map((p) => (p.textContent ?? "").trim());
  return {
    policyPresent: !!policy,
    filterCount: filters.length,
    checkedFilters: filters.filter((l) => l.querySelector("input")?.checked).length,
    reserveFloor: floorInput ? floorInput.value : null,
    minFill: fillInput ? fillInput.value : null,
    jobRowCount: jobs.length,
    jobs,
    emptyJobsText: texts.find((t) => t.startsWith("No road jobs yet")) ?? null,
    baysEmptyText: bays
      ? [...bays.querySelectorAll("p.status-line")].map((p) => (p.textContent ?? "").trim()).find((t) => t.startsWith("No declared loading sockets")) ?? null
      : null,
    bayRowCount: bayRows.length,
    newJobMessage: (newJobMsg?.textContent ?? "").trim() || null,
    setupMessage: (setupMsg?.textContent ?? "").trim() || null,
    readerNote: texts.find((t) => t.startsWith("Read-only")) ?? null,
  };
};

const readCam = () => {
  const canvas = document.querySelector("canvas");
  const parts = (canvas?.dataset.cam ?? "").split(",").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { x: parts[0], y: parts[1], scale: parts[2] };
};

/* ---- page mutations (real DOM events through the panels' own controls) ---- */

async function bootFresh(page) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelector(".gate__btn")?.click());
  await page.waitForSelector('.toolbar__btn[data-slot="fleet"]', { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function openSlot(page, slot) {
  await page.evaluate((s) => document.querySelector(`.toolbar__btn[data-slot="${s}"]`)?.click(), slot);
  await page.waitForTimeout(300);
}

async function setLabeledInput(page, container, labelStart, value) {
  const ok = await page.evaluate(
    ({ container, labelStart, value }) => {
      const root = document.querySelector(container);
      if (!root) return false;
      const label = [...root.querySelectorAll("label")].find((l) =>
        (l.textContent ?? "").trim().startsWith(labelStart),
      );
      const input = label ? label.querySelector("input,select") : null;
      if (!input) return false;
      const proto = input.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
      input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
      return true;
    },
    { container, labelStart, value },
  );
  await page.waitForTimeout(120);
  return ok;
}

async function submitForm(page, formAria) {
  const ok = await page.evaluate((aria) => {
    const form = document.querySelector(`form[aria-label="${aria}"]`);
    if (!form) return false;
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  }, formAria);
  await page.waitForTimeout(300);
  return ok;
}

async function clickButton(page, aria) {
  const ok = await page.evaluate((a) => {
    const b = document.querySelector(`button[aria-label="${a}"]`);
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }, aria);
  await page.waitForTimeout(300);
  return ok;
}

async function clickEnableTraffic(page) {
  const ok = await page.evaluate(() => {
    const root = document.querySelector("section.road-fleet");
    const b = [...(root?.querySelectorAll("button") ?? [])].find(
      (n) => (n.textContent ?? "").trim() === "Enable traffic model",
    );
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  await page.waitForTimeout(300);
  return ok;
}

async function toggleFilter(page, resource) {
  const ok = await page.evaluate((r) => {
    const label = [...document.querySelectorAll("section.road-policy label.road-policy__filter")].find(
      (l) => (l.textContent ?? "").trim() === r,
    );
    const input = label ? label.querySelector("input") : null;
    if (!input) return false;
    input.click();
    return true;
  }, resource);
  await page.waitForTimeout(200);
  return ok;
}

async function zoomIn(page, clicks) {
  for (let i = 0; i < clicks; i += 1) {
    await page.evaluate(() => document.querySelector('.shell-zoom__face[aria-label="Zoom in"]')?.click());
    await page.waitForTimeout(150);
  }
}

let shotSeq = 0;
async function shot(page, name) {
  mkdirSync(shots, { recursive: true });
  const path = `${shots}/${String((shotSeq += 1)).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path });
  return path;
}

/** Numeric focus contract: after zooming past fit, the camera centre moves toward
 * the contested cell's world centre (cell * CELL + CELL/2). Geometric, not visual. */
function focusCheck(scenario, name, pre, post, cell) {
  const target = { x: cell.x * CELL + CELL / 2, y: cell.y * CELL + CELL / 2 };
  const dist = (p) => Math.hypot(p.x - target.x, p.y - target.y);
  const moved = pre.x !== post.x || pre.y !== post.y;
  const closer = dist(post) < dist(pre) - 0.005;
  return check(scenario, name, moved && closer, {
    pre, post, target, cell,
    distanceBefore: +dist(pre).toFixed(2), distanceAfter: +dist(post).toFixed(2), moved, closer,
  });
}

async function runDesktop(page) {
  const out = {};
  await bootFresh(page);

  /* ---- FLEET ---- */
  await openSlot(page, "fleet");
  out.fleetInitial = await page.evaluate(readFleet);
  check("fleet", "road-fleet section paints", out.fleetInitial !== null);
  check("fleet", "traffic default-OFF (#140 parity)", out.fleetInitial?.trafficStatus === "Traffic model: legacy (opt-in, default off)", out.fleetInitial?.trafficStatus);
  check("fleet", "Enable traffic face present and enabled", out.fleetInitial?.enablePresent === true && out.fleetInitial?.enableDisabled === false);
  check("fleet", "empty fleet honest state", out.fleetInitial?.rowCount === 0 && typeof out.fleetInitial?.emptyText === "string");
  check("fleet", "default profile gated until traffic on", out.fleetInitial?.defaultProfileDisabled === true);
  await shot(page, "fleet-default-off");

  await setLabeledInput(page, 'form[aria-label="Add truck"]', "Capacity", "12");
  await setLabeledInput(page, 'form[aria-label="Add truck"]', "Cell x", "0");
  await setLabeledInput(page, 'form[aria-label="Add truck"]', "Cell y", "0");
  await submitForm(page, "Add truck");
  out.fleetOneTruck = await page.evaluate(readFleet);
  check("fleet", "add truck creates one row", out.fleetOneTruck?.rowCount === 1, out.fleetOneTruck?.rowCount);
  check("fleet", "add truck receipt", out.fleetOneTruck?.addMessage === "Truck added.", out.fleetOneTruck?.addMessage);
  check("fleet", "truck row select face named", out.fleetOneTruck?.rows[0]?.selectAria === "Select truck 1", out.fleetOneTruck?.rows[0]?.selectAria);

  await clickEnableTraffic(page);
  out.fleetTrafficOn = await page.evaluate(readFleet);
  check("fleet", "opt-in enable activates traffic", out.fleetTrafficOn?.trafficStatus === "Traffic model: active", out.fleetTrafficOn?.trafficStatus);
  check("fleet", "enable face retires once active", out.fleetTrafficOn?.enablePresent === false);
  check("fleet", "default profile unlocked after enable", out.fleetTrafficOn?.defaultProfileDisabled === false);
  await shot(page, "fleet-traffic-on");

  await zoomIn(page, 12); // reach CAMERA_MAX_SCALE so the 6x6 yard is pan-able
  const selPre = await page.evaluate(readCam);
  await clickButton(page, "Select truck 1");
  const selPost = await page.evaluate(readCam);
  out.fleetSelected = await page.evaluate(readFleet);
  check("fleet", "select marks row pressed", out.fleetSelected?.rows[0]?.selected === true);
  check("fleet", "select reveals per-truck profile", out.fleetSelected?.rows[0]?.profilePresent === true);
  check("fleet", "zoom reached max scale (yard pan-able)", selPost?.scale === 6, selPost?.scale);
  focusCheck("fleet", "select focus pans camera to truck cell (0,0)", selPre, selPost, { x: 0, y: 0 });
  await shot(page, "fleet-selected-profile");

  await setLabeledInput(page, 'form[aria-label="Add truck"]', "Capacity", "8");
  await setLabeledInput(page, 'form[aria-label="Add truck"]', "Cell x", "5");
  await setLabeledInput(page, 'form[aria-label="Add truck"]', "Cell y", "0");
  await submitForm(page, "Add truck");
  out.fleetTwoTrucks = await page.evaluate(readFleet);
  check("fleet", "second truck appended", out.fleetTwoTrucks?.rowCount === 2, out.fleetTwoTrucks?.rowCount);
  await shot(page, "fleet-two-trucks");

  /* ---- ROUTES ---- */
  await openSlot(page, "routes");
  out.routesInitial = await page.evaluate(readRoutes);
  check("routes", "road-routes section paints", out.routesInitial !== null);
  check("routes", "dispatch policy controls paint", out.routesInitial?.policyPresent === true);
  check("routes", "15 material filters, all allowed by default", out.routesInitial?.filterCount === 15 && out.routesInitial?.checkedFilters === 15, { count: out.routesInitial?.filterCount, checked: out.routesInitial?.checkedFilters });
  check("routes", "default reserve floor 0 / min fill 1", out.routesInitial?.reserveFloor === "0" && out.routesInitial?.minFill === "1", { floor: out.routesInitial?.reserveFloor, fill: out.routesInitial?.minFill });
  check("routes", "empty jobs honest state", out.routesInitial?.jobRowCount === 0 && typeof out.routesInitial?.emptyJobsText === "string");
  check("routes", "#217 honest empty-socket bay state", out.routesInitial?.bayRowCount === 0 && out.routesInitial?.baysEmptyText === "No declared loading sockets yet. Complete a road-taking building to expose its bays.", out.routesInitial?.baysEmptyText);
  await shot(page, "routes-policy-empty");

  await setLabeledInput(page, 'form[aria-label="Register building"]', "Building id", "1");
  await setLabeledInput(page, 'form[aria-label="Register building"]', "Cell x", "0");
  await setLabeledInput(page, 'form[aria-label="Register building"]', "Cell y", "0");
  await setLabeledInput(page, 'form[aria-label="Register building"]', "Storage capacity", "20");
  await submitForm(page, "Register building");
  out.registerOne = await page.evaluate(readRoutes);
  check("routes", "register building 1 receipt", out.registerOne?.setupMessage === "Building registered.", out.registerOne?.setupMessage);

  await setLabeledInput(page, 'form[aria-label="Register building"]', "Building id", "2");
  await setLabeledInput(page, 'form[aria-label="Register building"]', "Cell x", "5");
  await setLabeledInput(page, 'form[aria-label="Register building"]', "Cell y", "0");
  await setLabeledInput(page, 'form[aria-label="Register building"]', "Storage capacity", "20");
  await submitForm(page, "Register building");
  out.registerTwo = await page.evaluate(readRoutes);
  check("routes", "register building 2 receipt", out.registerTwo?.setupMessage === "Building registered.", out.registerTwo?.setupMessage);

  await shot(page, "routes-buildings-registered");

  // Honest session-only reality: fresh buildings hold zero stock (the production
  // feed is #148; no panel form seeds stock). The dispatch policy surfaces this
  // BEFORE the engine — a plain job draft is refused by the reserve-floor gate.
  await setLabeledInput(page, 'form[aria-label="New job"]', "Amount", "5");
  await submitForm(page, "New job");
  out.routesZeroStock = await page.evaluate(readRoutes);
  check("routes", "reserve-floor gate surfaces zero-stock session reality", out.routesZeroStock?.newJobMessage === "Reserve floor keeps 0 scrap at the source; only 0 free, so 5 cannot move.", out.routesZeroStock?.newJobMessage);
  check("routes", "no job minted from zero stock", out.routesZeroStock?.jobRowCount === 0, out.routesZeroStock?.jobRowCount);
  await shot(page, "routes-zero-stock-refused");

  // below-min-fill gate (checked before reserve-floor).
  await setLabeledInput(page, "section.road-policy", "Minimum fill", "10");
  await setLabeledInput(page, 'form[aria-label="New job"]', "Amount", "5");
  await submitForm(page, "New job");
  out.routesMinFill = await page.evaluate(readRoutes);
  check("routes", "min-fill policy gate refuses small job", out.routesMinFill?.newJobMessage === "Minimum fill is 10; 5 is too small.", out.routesMinFill?.newJobMessage);
  check("routes", "min-fill refusal creates no row", out.routesMinFill?.jobRowCount === 0, out.routesMinFill?.jobRowCount);
  await shot(page, "routes-policy-minfill-refused");

  // material-filter gate (checked first of the three).
  await setLabeledInput(page, "section.road-policy", "Minimum fill", "1");
  await toggleFilter(page, "scrap");
  await setLabeledInput(page, 'form[aria-label="New job"]', "Amount", "5");
  await submitForm(page, "New job");
  out.routesFiltered = await page.evaluate(readRoutes);
  check("routes", "material filter gate refuses filtered cargo", out.routesFiltered?.newJobMessage === "scrap is filtered out by the dispatch policy.", out.routesFiltered?.newJobMessage);
  check("routes", "filtered refusal creates no row", out.routesFiltered?.jobRowCount === 0, out.routesFiltered?.jobRowCount);
  check("routes", "filter checkbox narrows allowed set", out.routesFiltered?.checkedFilters === 14, out.routesFiltered?.checkedFilters);
  await shot(page, "routes-policy-filtered-refused");
  await toggleFilter(page, "scrap"); // restore the allowed set

  await setLabeledInput(page, "section.road-policy", "Reserve floor", "7");
  out.routesFloor = await page.evaluate(readRoutes);
  check("routes", "reserve floor edits live", out.routesFloor?.reserveFloor === "7", out.routesFloor?.reserveFloor);

  return out;
}

const run = async () => {
  console.log(`FLEET-147 headless evidence · ${url} · head ${headSha}`);
  if (!executablePath) throw new Error("no Chrome/Edge executable found (set CHROME_PATH)");
  const browser = await chromium.launch({ executablePath, headless: true });
  const results = {};
  const pageErrors = [];
  const consoleErrors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: CELL_VIEW.width, height: CELL_VIEW.height },
      deviceScaleFactor: CELL_VIEW.deviceScaleFactor,
      isMobile: CELL_VIEW.isMobile,
      hasTouch: CELL_VIEW.hasTouch,
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    results.desktop = await runDesktop(page);
    await page.close();
    await context.close();
  } finally {
    await browser.close();
  }
  check("console", "zero page errors", pageErrors.length === 0, pageErrors);
  check("console", "zero console errors", consoleErrors.length === 0, consoleErrors);

  const failed = checks.filter((entry) => !entry.ok);
  const body = {
    generatedBy: "scripts/probe-fleet147.mjs",
    issue: "https://github.com/darkmatter2222/Rustwake/issues/147",
    headSha,
    url,
    cellSize: CELL,
    sessionOnly: "Road logistics (#140) and traffic (#141) are session-only; no save seeded, no SAVE_KEY/migration/recovery touched (#148 owns the cutover).",
    refinement: "#217 — production loading sockets stay empty until the #148 cutover; the bay editor prints the honest empty state.",
    cells: [CELL_VIEW],
    results,
    pageErrors,
    consoleErrors,
    checks,
    summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length },
  };
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(TARGET, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  console.log(`\nFLEET-147 evidence: ${body.summary.passed}/${body.summary.total} checks passed, ${failed.length} failed`);
  console.log(`wrote ${TARGET} · shots under ${shots}/`);
  if (failed.length > 0) {
    for (const entry of failed) console.log(`FAILED [${entry.scenario}] ${entry.name} · ${JSON.stringify(entry.detail)}`);
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});