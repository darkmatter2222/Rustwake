/**
 * UI-RESET #65 — fixture scrutiny (probe setup seeding).
 *
 * ROLE: developer | dev-65. PROBE-ONLY tooling. It does NOT modify any file under
 * src/. It uses the game's OWN save arithmetic (encodeSave / decodeSave /
 * repairRegistration / validateSim) to prove every seed envelope the browser probe
 * injects passes the full load path. Run with: pnpm exec tsx <this file>.
 *
 * The browser probe (probe.mjs) reads seeds.json and re-stamps lastSeenMs at run
 * time with the identical FNV-1a checksum (save.ts checksum()), so the injected
 * envelope is byte-for-byte the game's own encodeSave output. The mature yard
 * actually loading in the app (8 machines, tutorial 9) is the live decode proof.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  encodeSave,
  decodeSave,
  repairRegistration,
  validateSim,
} from "../../../src/game/persistence/save";

const ROOT = resolve(process.cwd());
const EVID = resolve(ROOT, "work/evidence/UI-RESET-65");
const fixture = JSON.parse(
  readFileSync(resolve(ROOT, "docs/evidence/yard-mature.json"), "utf8"),
);
const sim = fixture.payload.sim;
const settings = fixture.payload.settings;

const checks: Record<string, unknown> = {};
let allOk = true;
function record(name: string, ok: boolean, detail?: unknown) {
  checks[name] = { ok, ...(detail === undefined ? {} : { detail }) };
  if (!ok) allOk = false;
}

// (c) Sim validation is NOT weakened: the seeded sim passes the game's own validator.
record("validateSim(mature) === null", validateSim(sim) === null, validateSim(sim));

// repairRegistration is idempotent on a healthy save (round-trips byte-for-byte).
const repaired = repairRegistration(JSON.parse(JSON.stringify(sim)));
record(
  "repairRegistration idempotent on healthy mature sim",
  JSON.stringify(repaired) === JSON.stringify(sim),
);
record("validateSim(repaired) === null", validateSim(repaired) === null);

// Every envelope the probe injects round-trips through the full decode path.
const now = Date.now();
const HOUR = 3600 * 1000;
const envelopes: Record<string, number> = {
  matureNow: now, // developed yard, no offline drain
  matureOld: now - 24 * HOUR, // long absence -> reconcile line + return report
};
for (const [name, lastSeenMs] of Object.entries(envelopes)) {
  const text = encodeSave(sim, lastSeenMs, settings);
  const dec = decodeSave(text);
  record(`decodeSave(${name}).ok`, dec.ok === true, dec.ok ? undefined : dec);
  if (dec.ok) {
    record(
      `decodeSave(${name}) preserves machine count`,
      dec.payload.sim.machines.length === sim.machines.length,
      { expected: sim.machines.length, got: dec.payload.sim.machines.length },
    );
    record(
      `decodeSave(${name}) lastSeenMs round-trip`,
      dec.payload.lastSeenMs === lastSeenMs,
    );
  }
}

// A settings-only / fresh envelope must also decode (the gate reads it as fresh).
const freshText = encodeSave(sim, now, { muted: false, reducedMotion: false, textScale: 1 });
record("decodeSave(settings-variant).ok", decodeSave(freshText).ok === true);

// Deterministic "broke" yard for the error/grouping loop (c2): the SAME mature sim
// with credits=0, so an inspector upgrade Buy shortfalls on the engine's own
// shortCredits numbers (no state injection, no invariant weakened). Validated through
// the identical full load path before the probe ever injects it.
const brokeSim = { ...sim, credits: 0 };
record("validateSim(broke) === null", validateSim(brokeSim) === null, validateSim(brokeSim));
const brokeText = encodeSave(brokeSim, now, settings);
const brokeDec = decodeSave(brokeText);
record("decodeSave(brokeNow).ok", brokeDec.ok === true, brokeDec.ok ? undefined : brokeDec);
if (brokeDec.ok) {
  record(
    "decodeSave(brokeNow) preserves machine count",
    brokeDec.payload.sim.machines.length === sim.machines.length,
  );
  record("decodeSave(brokeNow) credits === 0", brokeDec.payload.sim.credits === 0);
}

const out = {
  issue: 65,
  role: "developer",
  generatedAt: new Date().toISOString(),
  fixture: "docs/evidence/yard-mature.json",
  method:
    "Game's own encodeSave/decodeSave/repairRegistration/validateSim; no src modified; no invariant weakened.",
  mature: {
    machines: sim.machines.length,
    routes: sim.routes.length,
    tutorial: sim.tutorial,
    credits: sim.credits,
    exportClaimed: sim.exportClaimed,
    schemaVersion: sim.schemaVersion,
  },
  allOk,
  checks,
  sim,
  brokeSim,
  settings,
};
writeFileSync(resolve(EVID, "seeds.json"), JSON.stringify(out, null, 2));
console.log("FIXTURE VALIDATION:", allOk ? "PASS" : "FAIL");
for (const [name, c] of Object.entries(checks)) {
  const cc = c as { ok: boolean };
  console.log(`  ${cc.ok ? "ok  " : "FAIL"} ${name}`);
}
if (!allOk) process.exitCode = 1;