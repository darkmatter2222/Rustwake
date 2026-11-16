// Headless corrupt-boot storage probe for issue #191 (RW3D G1 fix).
// Boots the REAL built app in headless Chrome against a poisoned localStorage
// save and asserts the storage-level preservation invariants:
//   A. checksum-corrupt save -> raw payload preserved verbatim in the recovery
//      slot at boot (before the sim loop starts), fresh yard boots after the
//      gate, slot survives the fresh yard's first persist, repeated boots are
//      idempotent.
//   B. truncated (parse-failure) save -> same preservation, idempotent.
//   C. save+lease removal (exactly the two keys clearSave removes) -> recovery
//      slot left intact by the next boot.
// The app's start gate (.gate__btn, src/ui/Hud.tsx Gate) must be clicked before
// the tick loop runs; boot-time preservation happens synchronously BEFORE the
// gate, which is what A2/B0 read with the loop still stopped.
// This is storage-level evidence only: the player-visible notice is store state
// (SaveRecoveryApi) and its UI wiring is owed before G1 (#151); visual
// inspection of any notice surface is PENDING.
//
// Run: npm run build && npm run preview (background, port 4173), then
//   node docs/evidence/2026-11-14-rw3d-g1fix-corrupt-boot.mjs
// Writes 2026-11-14-rw3d-g1fix-corrupt-boot.json; exits 0/1 on the checks.
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const url = process.env.RUSTWAKE_URL ?? "http://localhost:4173/";
const executablePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((p) => existsSync(p));

const SAVE_KEY = "rustwake.save.v1";
const RECOVERY_KEY = "rustwake.save.recovery.v1";
const LEASE_KEY = "rustwake.lease.v1";
const sha = (text) => createHash("sha256").update(text).digest("hex");

// Schema-valid envelope with a wrong checksum: decodeSave fails at "checksum".
const CHECKSUM_CORRUPT = JSON.stringify({
  schemaVersion: 1,
  checksum: "deadbeef",
  payload: { sim: { tick: 42 }, lastSeenMs: 1763100000000, settings: {} },
});
// Truncated JSON: decodeSave fails at "parse".
const PARSE_CORRUPT = CHECKSUM_CORRUPT.slice(0, Math.floor(CHECKSUM_CORRUPT.length / 2));

const checks = [];
function check(name, expected, actual, pass) { checks.push({ name, expected, actual, pass }); }

const readStorage = (page) => page.evaluate(([s, r, l]) => ({
  save: localStorage.getItem(s),
  recovery: localStorage.getItem(r),
  lease: localStorage.getItem(l),
}), [SAVE_KEY, RECOVERY_KEY, LEASE_KEY]);

// Mirrors decodeSave's parse -> schema -> payload -> FNV-1a checksum stages
// (src/game/persistence/save.ts). The app only ever writes checksum-valid
// envelopes, so this is a sound "healthy yard persisted" signal in-page.
const decodable = (page, text) => page.evaluate((raw) => {
  if (raw === null) return { ok: false, reason: "empty" };
  let env;
  try { env = JSON.parse(raw); } catch { return { ok: false, reason: "parse" }; }
  if (!env || env.schemaVersion !== 1 || !env.payload) return { ok: false, reason: "schema" };
  const body = JSON.stringify(env.payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) { h ^= body.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  if (h.toString(16).padStart(8, "0") !== env.checksum) return { ok: false, reason: "checksum" };
  return { ok: true, tick: env.payload.sim?.tick ?? null, machines: env.payload.sim?.machines?.length ?? null };
}, text);

async function boot(page, { start = true } = {}) {
  await page.waitForFunction(() => (document.querySelector("#root")?.childElementCount ?? 0) > 0, null, { timeout: 20000 });
  await page.waitForTimeout(120); // synchronous boot + lease claim settle
  if (start) await begin(page);
}
async function begin(page) {
  const btn = await page.$(".gate__btn");
  if (btn) { await btn.click(); await page.waitForTimeout(120); }
}
// Seed storage and reload in ONE synchronous page task so the running tick
// loop cannot interleave a persist between the write and the navigation.
const seedAndReload = (page, op, arg) => page.evaluate(({ op, arg }) => {
  if (op === "seed-save") localStorage.setItem(arg.save, arg.corrupt);
  else if (op === "remove-save-lease") { localStorage.removeItem(arg.save); localStorage.removeItem(arg.lease); }
  else if (op === "seed-save-clear-recovery") { localStorage.setItem(arg.save, arg.corrupt); localStorage.removeItem(arg.recovery); }
  location.reload();
}, { op, arg });

async function waitForSave(page, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    if (s !== null) return s;
    await page.waitForTimeout(150);
  }
  return null;
}

const browser = await chromium.launch({ executablePath, headless: true });
let exitCode = 0;
const pageErrors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // --- Scenario A: checksum corruption -------------------------------
  await page.goto(url, { waitUntil: "load" });
  await boot(page);
  const healthySave = await waitForSave(page);
  const healthyDecoded = await decodable(page, healthySave);
  check("A0 healthy boot persists a checksum-valid save", true, healthyDecoded.ok, healthyDecoded.ok);

  await seedAndReload(page, "seed-save", { save: SAVE_KEY, corrupt: CHECKSUM_CORRUPT });
  await page.waitForLoadState("load");
  await boot(page, { start: false }); // loop stopped: read the pure boot state
  const a0 = await readStorage(page);
  check("A1 corrupt boot preserves raw payload verbatim (immediate)", sha(CHECKSUM_CORRUPT), a0.recovery ? sha(a0.recovery) : null, a0.recovery === CHECKSUM_CORRUPT);
  check("A2 corrupt boot does not overwrite SAVE_KEY before first persist", sha(CHECKSUM_CORRUPT), a0.save ? sha(a0.save) : null, a0.save === CHECKSUM_CORRUPT);

  await begin(page);
  await page.waitForTimeout(2500); // > PERSIST_MS: fresh yard persists
  const a1 = await readStorage(page);
  const a1save = await decodable(page, a1.save);
  check("A3 fresh yard boots and persists a checksum-valid save", true, a1save.ok, a1save.ok);
  check("A4 recovery slot still verbatim after fresh-yard persist", sha(CHECKSUM_CORRUPT), a1.recovery ? sha(a1.recovery) : null, a1.recovery === CHECKSUM_CORRUPT);

  await page.reload({ waitUntil: "load" });
  await boot(page);
  await page.waitForTimeout(2500);
  const a2 = await readStorage(page);
  const a2save = await decodable(page, a2.save);
  check("A5 repeated boot idempotent: slot unchanged", sha(CHECKSUM_CORRUPT), a2.recovery ? sha(a2.recovery) : null, a2.recovery === CHECKSUM_CORRUPT);
  check("A6 repeated boot keeps checksum-valid yard", true, a2save.ok, a2save.ok);

  // --- Scenario C: save+lease removal leaves the slot intact ---------
  await seedAndReload(page, "remove-save-lease", { save: SAVE_KEY, lease: LEASE_KEY });
  await page.waitForLoadState("load");
  await boot(page);
  await page.waitForTimeout(2500);
  const c0 = await readStorage(page);
  const c0save = await decodable(page, c0.save);
  check("C1 save+lease removal boot leaves recovery slot intact", sha(CHECKSUM_CORRUPT), c0.recovery ? sha(c0.recovery) : null, c0.recovery === CHECKSUM_CORRUPT);
  check("C2 removal boot persists a checksum-valid yard", true, c0save.ok, c0save.ok);

  // --- Scenario B: parse failure (truncated JSON) --------------------
  await seedAndReload(page, "seed-save-clear-recovery", { save: SAVE_KEY, recovery: RECOVERY_KEY, corrupt: PARSE_CORRUPT });
  await page.waitForLoadState("load");
  await boot(page, { start: false });
  const b0 = await readStorage(page);
  check("B1 parse-failure boot preserves raw payload verbatim", sha(PARSE_CORRUPT), b0.recovery ? sha(b0.recovery) : null, b0.recovery === PARSE_CORRUPT);
  await begin(page);
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "load" });
  await boot(page);
  await page.waitForTimeout(2500);
  const b1 = await readStorage(page);
  const b1save = await decodable(page, b1.save);
  check("B2 parse-failure idempotent across reloads", sha(PARSE_CORRUPT), b1.recovery ? sha(b1.recovery) : null, b1.recovery === PARSE_CORRUPT);
  check("B3 parse-failure boot keeps checksum-valid yard", true, b1save.ok, b1save.ok);

  check("Z no page errors across all boots", 0, pageErrors.length, pageErrors.length === 0);

  const report = {
    meta: {
      issue: 191, role: "developer",
      baseSha: "ab5e9193121ba1338a79f5e2dfe10e44e9b9a85d",
      worktreeHeadAtRun: execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim(),
      note: "Probe ran against the working tree that becomes the PR head (fix uncommitted at run time).",
      command: "node docs/evidence/2026-11-14-rw3d-g1fix-corrupt-boot.mjs",
      timestamp: new Date().toISOString(),
      url,
      evidenceClass: "headless Chrome against the real built app (vite preview); storage-level assertions only",
      browserVersion: browser.version(),
      gate: "start gate .gate__btn clicked to run the sim loop; boot-time preservation asserted with the loop stopped",
    },
    corruptPayloads: {
      checksum: { reason: "checksum", bytes: CHECKSUM_CORRUPT.length, sha256: sha(CHECKSUM_CORRUPT) },
      parse: { reason: "parse", bytes: PARSE_CORRUPT.length, sha256: sha(PARSE_CORRUPT) },
    },
    scenarios: {
      A: { immediate: a0, afterPersist: a1, afterReload: a2 },
      C: { afterRemovalBoot: c0 },
      B: { immediate: b0, afterReload: b1 },
    },
    pageErrors,
    checks,
    limitations: [
      "Storage-level evidence: the player-visible notice is store state (SaveRecoveryApi.getSaveRecovery); no src/ui surface consumes it yet. UI wiring is owed before G1 (#151).",
      "Visual inspection of any notice/recovery surface is PENDING (standing reservation).",
      "Retry/export/discard flows are covered by tests/persistence/recovery.test.ts, not by this browser probe (no UI buttons exist yet to drive them).",
      "Quota-failure (held) path is covered by unit tests with a throwing storage double, not in a real browser.",
      "In-page decodability mirrors decodeSave's parse/schema/checksum stages; full validateSim is exercised by the unit suite, not re-implemented here.",
    ],
  };
  const out = resolve(root, "docs/evidence/2026-11-14-rw3d-g1fix-corrupt-boot.json");
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`probe report written: ${out}`);
  for (const c of checks) console.log(`[${c.pass ? "PASS" : "FAIL"}] ${c.name}: expected ${JSON.stringify(c.expected)}, actual ${JSON.stringify(c.actual)}`);
  exitCode = checks.every((c) => c.pass) ? 0 : 1;
} catch (err) {
  console.error("corrupt-boot probe failed:", err);
  exitCode = 1;
} finally {
  await browser.close();
}
process.exit(exitCode);