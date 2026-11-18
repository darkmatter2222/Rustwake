// ART-04 (#350) MOTION mutation controls — proves the rendered-domain motion
// clauses are load-bearing (a proof that passes under mutation is tautological).
// NEW script, sibling of scripts/mutate-art04.mjs (distinctness controls C0-C3).
//
//   C4 revert-motion-clock: art04Pose parks EVERY channel at zero while the
//      sim/work clocks keep advancing (art04Advance untouched). The real
//      capture harness must FAIL at the FIRST rendered motion clause
//      (MOTION_NOT_VISIBLE_IN_RENDER research) — not merely time out a wait.
//   C5 park-market-ambient: only the market beam/awning channels are parked
//      (scale:0, awning:0); research/fabricator still animate. The harness
//      must FAIL specifically at the MARKET clause
//      (MOTION_NOT_VISIBLE_IN_RENDER market), proving the 2:1 second-harmonic
//      ambient pair gate is load-bearing on its own.
//
// Method: the capture harness runs against the PRODUCTION BUILD, so each
// control temporarily mutates src/art04.js (a leased file), rebuilds, runs the
// FULL real harness into a TEMP evidence dir (never the committed evidence),
// then restores src/art04.js BYTE-EXACT and rebuilds again — try/finally, with
// byte-compare + git-diff verification before and after. The committed
// evidence dir is never touched by a mutated build.
//
// Run AFTER the branch is committed: node scripts/mutate-art04-motion.mjs
//   env: RUSTWAKE_SOURCE_SHA=<40-hex head>, RUSTWAKE_PREVIEW_PORT (default 4194)
// Writes motion-mutation-controls.json into the evidence dir; exits 1 if any
// control's verdict differs from its expectation.
import {readFile, writeFile, mkdtemp, rm, mkdir} from "node:fs/promises";
import {resolve, join} from "node:path";
import {execSync, spawnSync} from "node:child_process";
import crypto from "node:crypto";

const ROOT = resolve(".");
const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/350-art-04");
const SOURCE_SHA = process.env.RUSTWAKE_SOURCE_SHA || execSync("git rev-parse HEAD").toString().trim();
const PORT = String(process.env.RUSTWAKE_PREVIEW_PORT || 4194);
const CA = "C:/Users/ryans/node-extra-ca.pem";
const ART04 = join(ROOT, "src", "art04.js");
const ENV = {...process.env, NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || CA};

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, {
  cwd: ROOT, env: ENV, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts
});
const gitClean = file => run("git", ["diff", "--quiet", "--", file]).status === 0;

const PARK_ALL = "return {dish:0,feed:0,gear:0,pinion:0,hammer:0,scale:0,awning:0};";
const REDUCED_LINE = "if(reducedMotion)return {dish:0,feed:0,gear:0,pinion:0,hammer:0,scale:0,awning:0};";
const SCALE_LINE = "scale:Math.sin(clock*M.scaleSpeed+id)*M.scaleAmp,";
const AWNING_LINE = "awning:Math.sin(clock*M.awningSpeed+2*id)*M.awningAmp";

function mutateC4(src) {
  if (!src.includes(REDUCED_LINE)) throw Error("MUTATION_C4_MARKER_NOT_FOUND");
  const out = src.replace(REDUCED_LINE, PARK_ALL + " // C4 MUTATION: motion clock reverted (pose parked; clocks still advance)");
  if (out === src) throw Error("MUTATION_C4_NO_OP");
  return out;
}
function mutateC5(src) {
  if (!src.includes(SCALE_LINE) || !src.includes(AWNING_LINE)) throw Error("MUTATION_C5_MARKERS_NOT_FOUND");
  const out = src.replace(SCALE_LINE, "scale:0, // C5 MUTATION: market beam parked")
    .replace(AWNING_LINE, "awning:0 // C5 MUTATION: market awning parked");
  if (out === src) throw Error("MUTATION_C5_NO_OP");
  return out;
}

async function main() {
  if (!/^[0-9a-f]{40}$/.test(SOURCE_SHA))
    throw Error("MOTION_MUTATION_SOURCE_SHA_REQUIRED: " + SOURCE_SHA);
  if (!gitClean("src/art04.js"))
    throw Error("MOTION_MUTATION_DIRTY_LEASE: src/art04.js has uncommitted changes; commit first");
  const original = await readFile(ART04); // bytes, restored exactly in finally
  const originalText = original.toString("utf8");
  const tmp = await mkdtemp(join(ROOT, ".mutate-art04-motion-"));
  const controls = [];
  let restored = false;
  const restore = async () => {
    await writeFile(ART04, original);
    const back = await readFile(ART04);
    if (Buffer.compare(back, original) !== 0) throw Error("MOTION_MUTATION_RESTORE_NOT_BYTE_EXACT");
    if (!gitClean("src/art04.js")) throw Error("MOTION_MUTATION_RESTORE_DIRTY");
    const build = run("pnpm", ["build"], {timeout: 300000});
    if (build.status !== 0) throw Error("MOTION_MUTATION_RESTORE_BUILD_FAILED: " + (build.stderr || build.stdout || "").slice(-2000));
    restored = true;
  };
  try {
    for (const c of [
      {id: "C4-revert-motion-clock", mutate: mutateC4, expect: /MOTION_NOT_VISIBLE_IN_RENDER research/,
       description: "art04Pose returns the all-zero parked pose unconditionally (sim/work clocks still advance); the FIRST rendered motion clause (research dish/feed) must fail"},
      {id: "C5-park-market-ambient", mutate: mutateC5, expect: /MOTION_NOT_VISIBLE_IN_RENDER market/,
       description: "only the market beam (scale) and awning channels parked; research/fabricator still animate; the MARKET ambient pair clause must fail on its own"}
    ]) {
      const mutated = c.mutate(originalText);
      const tmpOut = join(tmp, c.id);
      await mkdir(tmpOut, {recursive: true});
      let rec = {id: c.id, kind: "motion-mutation", description: c.description,
        baseSourceSha: SOURCE_SHA,
        mutatedArt04Sha256: crypto.createHash("sha256").update(mutated).digest("hex"),
        expected: "FAIL", expectedError: String(c.expect)};
      try {
        await writeFile(ART04, mutated, "utf8");
        const build = run("pnpm", ["build"], {timeout: 300000});
        if (build.status !== 0) throw Error("MUTATION_BUILD_FAILED: " + (build.stderr || build.stdout || "").slice(-2000));
        const cap = run(process.execPath, ["scripts/capture-art04.mjs"], {
          shell: false, // node.exe path may contain spaces; no shell quoting needed
          env: {...ENV, RUSTWAKE_CAPTURE_OUT: tmpOut, RUSTWAKE_PREVIEW_PORT: PORT, RUSTWAKE_SOURCE_SHA: SOURCE_SHA},
          timeout: 20 * 60 * 1000
        });
        await writeFile(join(tmpOut, "harness-stdout.log"), (cap.stdout || "") + "\n--- stderr ---\n" + (cap.stderr || ""));
        let report = null;
        try {report = JSON.parse(await readFile(join(tmpOut, "report.json"), "utf8"));} catch {}
        const errors = report?.errors || [];
        const firstError = errors[0] || "";
        rec = {...rec, captureExitCode: cap.status, reportStatus: report?.status || "NO_REPORT",
          errors, verdict: report?.status === "FAIL" && cap.status !== 0 ? "FAIL" : "PASS_OR_BROKEN",
          ok: report?.status === "FAIL" && cap.status !== 0 && c.expect.test(firstError)};
      } finally {
        await restore();
      }
      controls.push(rec);
      console.log(`${c.id}: ${rec.verdict} (expected FAIL matching ${c.expect}) -> ${rec.ok ? "OK" : "BROKEN"}`);
      if (!rec.ok) break; // a broken control invalidates the suite; stop mutating
    }
  } finally {
    if (!restored) await restore();
    await rm(tmp, {recursive: true, force: true});
  }
  const ok = controls.length === 2 && controls.every(c => c.ok);
  const report = {issue: 350, source_sha: SOURCE_SHA,
    metric: "rendered-domain motion clauses of scripts/capture-art04.mjs (pairMetrics meanAbsDiff >= 1 on unamputated clips)",
    started: new Date().toISOString(), controls, ok,
    status: ok ? "CONTROLS_OK" : "CONTROLS_BROKEN"};
  await mkdir(OUT, {recursive: true});
  await writeFile(join(OUT, "motion-mutation-controls.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("ART-04 motion mutation controls:", report.status);
  if (!ok) process.exitCode = 1;
}
await main();
