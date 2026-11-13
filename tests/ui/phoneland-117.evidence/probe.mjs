#!/usr/bin/env node
// dev-117 evidence runner for #117 (phoneland furnace tap-selection regression).
//
//   node tests/ui/phoneland-117.evidence/probe.mjs prove
//       Asserts every acceptance oracle was run VERBATIM: the working-tree blob
//       hash (git hash-object --path <f> <f>) equals the committed blob hash
//       (git rev-parse HEAD:<f>) for each oracle, and that results.json.buildSha
//       equals the code head SHA. Proves the probes were not re-authored/weakened.
//
//   node tests/ui/phoneland-117.evidence/probe.mjs run
//       Re-runs the three oracles against THIS worktree's pnpm build (each spawns
//       its own vite preview except logistics-59, which needs BASE_URL). Writes
//       fresh scratch evidence; does NOT touch the committed evidence dir.
//
// Method: headless Chromium DOM/geometry/console + canvas pixel census only. NO
// vision. AGENT playtests. Headless emulation is NOT a physical device.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = execSync("git rev-parse --show-toplevel", { cwd: HERE }).toString().trim();
const sh = (cmd) => execSync(cmd, { cwd: ROOT }).toString().trim();

// The acceptance oracles (frozen; must run byte-identical to their committed blobs).
const ORACLES = [
  "tests/ui/logistics-59.probe.mjs",
  "tests/ui/access-66.evidence.mjs",
  "tests/ui/save-63.evidence.mjs",
];

function prove() {
  let ok = true;
  const head = sh("git rev-parse HEAD");
  console.log(`# prove: committed == ran (HEAD ${head})`);
  for (const f of ORACLES) {
    // --path applies the repo's git filters so the hash matches the committed blob.
    const ran = sh(`git hash-object --path "${f}" "${f}"`);
    const committed = sh(`git rev-parse "HEAD:${f}"`);
    const match = ran === committed;
    ok = ok && match;
    console.log(`${match ? "PASS" : "FAIL"}  ${f}\n      ran=${ran}\n      committed=${committed}`);
  }
  // results.json must record the CODE head SHA (last src-changing commit).
  const results = JSON.parse(readFileSync(resolve(HERE, "results.json"), "utf8"));
  const codeHead = sh("git rev-parse HEAD"); // evidence head is an evidence-only child; src unchanged
  const srcDiff = sh(`git diff --name-only ${results.buildSha} HEAD -- src`);
  const shaOk = results.buildSha === codeHead || srcDiff === "";
  ok = ok && shaOk;
  console.log(`${shaOk ? "PASS" : "FAIL"}  results.json.buildSha=${results.buildSha} (src diff to HEAD: ${srcDiff === "" ? "empty (evidence-only child)" : srcDiff})`);
  console.log(`${ok ? "PROVE PASS" : "PROVE FAIL"}: oracles verbatim, buildSha == code head`);
  process.exit(ok ? 0 : 1);
}

function run() {
  const sha = sh("git rev-parse HEAD");
  const tmp = "C:/Users/ryans/AppData/Local/Temp/rw-117-rerun";
  console.log(`# run: re-running oracles at ${sha} (scratch ${tmp})`);
  execSync("pnpm build", { cwd: ROOT, stdio: "inherit" });
  execSync(`node tests/ui/logistics-59.probe.mjs`, { cwd: ROOT, stdio: "inherit", env: { ...process.env, BASE_URL: "http://127.0.0.1:4195/", RW59_SHA: sha, RW59_EVID: `${tmp}/logistics-59` } });
  execSync(`pnpm exec tsx tests/ui/access-66.evidence.mjs`, { cwd: ROOT, stdio: "inherit", env: { ...process.env, RW66A_SHA: sha } });
  execSync(`pnpm exec tsx tests/ui/save-63.evidence.mjs`, { cwd: ROOT, stdio: "inherit", env: { ...process.env, RW63_SHA: sha } });
  execSync("git checkout -- tests/ui/save-63.evidence.json work/evidence/UI-RESET-65/seeds.json", { cwd: ROOT, stdio: "inherit" });
  console.log("# run complete (scratch evidence; committed evidence dir untouched)");
}

const cmd = process.argv[2] || "prove";
if (cmd === "prove") prove();
else if (cmd === "run") run();
else { console.error(`unknown subcommand: ${cmd} (use prove|run)`); process.exit(2); }
