/**
 * Refs #597 — portability suite for scripts/measure-rigs.mjs.
 *
 * The harness used to import src/world.js and src/voxelSchema.js from a
 * hardcoded absolute scratch-worktree path (the old ART-351 car), so nobody
 * could re-run it — or worse, someone could silently measure a stale checkout
 * and publish numbers that do not describe the code under review. This suite:
 *
 *  1. guards against reintroduction of ANY machine-specific absolute path
 *     (hardcoded file URL, Windows drive-absolute literal, POSIX home/scratch
 *     path, known scratch-worktree markers) — and proves the guard is
 *     non-vacuous by injecting the historical defect into a real temp copy and
 *     asserting the guard REJECTS it;
 *  2. proves an invalid target fails loudly, naming the exact path tried, with
 *     no stdout JSON and no silent fallback;
 *  3. runs the REAL harness from a foreign working directory (resolution must
 *     come from import.meta.url, not cwd) and asserts the full, unchanged JSON
 *     key set, value shapes, budgets cross-checked against the real
 *     src/voxelSchema.js RIGS, and the exact JSON.stringify(out, null, 1)
 *     stdout format;
 *  4. proves an explicit CLI argument wins and produces byte-identical stdout
 *     to the default resolution against the same checkout.
 *
 * No rig geometry, budget or behaviour is changed here; this is a measurement
 * harness portability repair, not an art car.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {RIGS} from "../src/voxelSchema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const scriptPath = path.join(root, "scripts", "measure-rigs.mjs");

// --- reintroduction guard -------------------------------------------------
// Each rule names a class of machine-specific absolute path. The guard scans
// the SCRIPT TEXT line by line so a violation report names the exact line.
const MACHINE_PATH_RULES = [
  {name: "hardcoded file URL", re: /file:\/\/\//i},
  {name: "Windows drive-absolute string literal", re: /["'`][A-Za-z]:[\\/]/},
  {name: "Windows machine root", re: /\b[A-Za-z]:[\\/](Users|Temp|Windows|ProgramData|home|root|scratch|rw-qwen|source)\b/i},
  {name: "POSIX absolute home/scratch path", re: /["'`](\/Users\/|\/home\/|\/tmp\/|\/var\/folders\/|\/private\/)/},
  {name: "scratch-worktree marker", re: /(AppData[\\/]Local[\\/]Temp|rw-qwen|art-351)/i}
];

function machinePathViolations(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of MACHINE_PATH_RULES) {
      if (rule.re.test(line)) hits.push({line: i + 1, rule: rule.name, text: line.trim()});
    }
  });
  return hits;
}

function assertPortable(text, label) {
  assert.ok(typeof text === "string" && text.length > 0, `${label}: guard input must be a non-empty string`);
  const hits = machinePathViolations(text);
  assert.equal(
    hits.length, 0,
    `${label}: machine-specific absolute path(s) reintroduced:\n` +
    hits.map(h => `  line ${h.line} [${h.rule}]: ${h.text}`).join("\n")
  );
}

function runHarness(args, cwd) {
  const r = spawnSync(process.execPath, [scriptPath, ...args], {cwd, encoding: "utf8", timeout: 120000});
  assert.equal(r.error, undefined, `harness spawn error: ${r.error}`);
  return r;
}

// The exact key set the harness emits, measured from a real run. Variants come
// from the pure truckIdentity(v) mapping index = ((id % 3) + 3) % 3 over
// RIGS.truck.identities [flatbed, stake, tipper]: id1->stake, id2->tipper,
// id3->flatbed. Hardcoded on purpose — a dynamically derived expectation would
// be vacuous.
const EXPECTED_KEYS = [
  "truck1(stake,loaded)", "truck2(tipper,loaded)", "truck3(flatbed,loaded)",
  "truckEmpty", "forklift", "drone", "worker", "envelopes", "budgets"
];
const COUNT_KEYS = EXPECTED_KEYS.slice(0, 7);
const ENVELOPE_KEYS = ["truck1", "truck2", "truck3", "forklift", "drone", "worker"];

test("measure-rigs.mjs contains no machine-specific absolute path (reintroduction guard)", () => {
  const text = fs.readFileSync(scriptPath, "utf8");
  assertPortable(text, "scripts/measure-rigs.mjs");
  // The portable mechanism must actually be present, not merely absent-bad:
  // resolution derives from the script's own location and imports via
  // pathToFileURL (Windows-safe), never string-concatenated file URLs.
  assert.match(text, /import\.meta\.url/, "resolution must derive from import.meta.url");
  assert.match(text, /pathToFileURL\(/, "ESM imports of the target must use pathToFileURL");
});

test("reintroduction guard is non-vacuous: it REJECTS an injected absolute machine path", () => {
  const realText = fs.readFileSync(scriptPath, "utf8");
  assert.ok(realText.length > 0, "real script must be non-empty before mutation");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw597-guard-"));
  try {
    // Negative control 1: the EXACT historical defect (ART-351 scratch file URL)
    // appended to a real temp copy of the current script.
    const historical = 'const W=await import("file:///C:/Users/ryans/AppData/Local/Temp/rw-qwen/art-351/src/world.js");';
    const injectedPath = path.join(tmp, "measure-rigs.injected.mjs");
    fs.writeFileSync(injectedPath, realText + "\n" + historical + "\n");
    const injectedText = fs.readFileSync(injectedPath, "utf8");
    assert.ok(injectedText.length > realText.length, "temp copy must actually contain the injection");
    const hits = machinePathViolations(injectedText);
    assert.ok(hits.length > 0, "guard must detect the injected historical path");
    assert.ok(hits.some(h => h.text.includes("art-351")), "violation report must name the injected scratch path");
    assert.throws(
      () => assertPortable(injectedText, "injected temp copy"),
      /machine-specific absolute path\(s\) reintroduced/,
      "guard must FAIL on the injected copy"
    );

    // Negative control 2: a POSIX absolute home path in a string literal.
    assert.throws(
      () => assertPortable(realText + '\nconst p="/Users/someone/scratch/checkout/src/world.js";\n', "posix mutation"),
      /machine-specific absolute path\(s\) reintroduced/
    );

    // Negative control 3: a Windows drive-absolute backslash path.
    assert.throws(
      () => assertPortable(realText + "\nconst p='C:\\\\Users\\\\someone\\\\checkout\\\\src\\\\world.js';\n", "windows mutation"),
      /machine-specific absolute path\(s\) reintroduced/
    );

    // Positive control: the unmodified real script passes the same guard.
    assertPortable(fs.readFileSync(scriptPath, "utf8"), "real script after negative controls");
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});

test("invalid target fails loudly naming the path tried — no silent fallback, no stdout JSON", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw597-badtarget-"));
  try {
    // Case 1: an existing directory that is NOT a valid checkout.
    const r1 = runHarness([tmp], root);
    assert.notEqual(r1.status, 0, "invalid existing directory must exit non-zero");
    assert.equal(r1.stdout, "", "invalid target must not emit any stdout JSON");
    assert.ok(r1.stderr.includes(tmp), `error must name the target path tried; stderr was:\n${r1.stderr}`);
    assert.ok(r1.stderr.includes("src/world.js"), "error must name the missing expected file");
    assert.match(r1.stderr, /invalid target checkout/, "error must clearly state the target is invalid");

    // Case 2: a path that does not exist at all.
    const missing = path.join(tmp, "does-not-exist");
    const r2 = runHarness([missing], root);
    assert.notEqual(r2.status, 0, "nonexistent target must exit non-zero");
    assert.equal(r2.stdout, "", "nonexistent target must not emit any stdout JSON");
    assert.ok(r2.stderr.includes(missing), `error must name the nonexistent path tried; stderr was:\n${r2.stderr}`);
    assert.match(r2.stderr, /invalid target checkout/);
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});

test("harness runs from a foreign cwd with no argument and emits the full unchanged JSON key set and shapes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw597-foreigncwd-"));
  try {
    // cwd has no src/ — success proves resolution comes from the script's own
    // location (import.meta.url), not from the caller's directory.
    assert.equal(fs.existsSync(path.join(tmp, "src")), false);
    const r = runHarness([], tmp);
    assert.equal(r.status, 0, `harness must succeed from a foreign cwd; stderr:\n${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out), EXPECTED_KEYS, "full JSON key set must be unchanged");

    for (const k of COUNT_KEYS) {
      assert.deepEqual(Object.keys(out[k]).sort(), ["meshes", "tier0Visible", "triangles"], `${k} shape`);
      assert.ok(Number.isInteger(out[k].meshes) && out[k].meshes > 0, `${k}.meshes positive integer`);
      assert.ok(Number.isInteger(out[k].triangles) && out[k].triangles > 0, `${k}.triangles positive integer`);
      assert.ok(Number.isInteger(out[k].tier0Visible) && out[k].tier0Visible >= 0, `${k}.tier0Visible non-negative integer`);
    }

    assert.deepEqual(Object.keys(out.envelopes), ENVELOPE_KEYS, "envelope key set");
    for (const k of ENVELOPE_KEYS) {
      assert.deepEqual(Object.keys(out.envelopes[k]).sort(), ["h", "l", "w"], `envelopes.${k} shape`);
      for (const dim of ["w", "h", "l"]) {
        assert.ok(Number.isFinite(out.envelopes[k][dim]) && out.envelopes[k][dim] > 0, `envelopes.${k}.${dim} positive`);
      }
    }

    // Budgets must describe the REAL schema in this checkout, not a stale one.
    const expectedBudgets = Object.fromEntries(Object.entries(RIGS).map(([k, v]) => [k, v.budget]));
    assert.deepEqual(out.budgets, expectedBudgets, "budgets must equal the real src/voxelSchema.js RIGS budgets");

    // Output format parity: exactly JSON.stringify(out, null, 1) + newline.
    assert.equal(r.stdout, JSON.stringify(out, null, 1) + "\n", "stdout format must be unchanged");
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});

test("explicit CLI argument wins and yields byte-identical stdout to default resolution", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rw597-arg-"));
  try {
    const viaDefault = runHarness([], tmp);
    assert.equal(viaDefault.status, 0, `default run failed: ${viaDefault.stderr}`);
    const viaArg = runHarness([root], tmp);
    assert.equal(viaArg.status, 0, `explicit-argument run failed: ${viaArg.stderr}`);
    assert.equal(viaArg.stdout, viaDefault.stdout, "explicit root argument must measure the same checkout byte-for-byte");
    assert.ok(viaArg.stderr.includes(root), "stderr diagnostic must name the explicitly requested target");
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});
