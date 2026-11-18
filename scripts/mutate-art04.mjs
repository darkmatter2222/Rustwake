// ART-04 (#350) mutation controls for the six-rig occupancy-grid Jaccard
// distinctness metric. NEW script — proves the metric is load-bearing:
//   C0 positive control: unmutated head src must PASS the 0.15 floor.
//   C1 smoking-gun rollback: restore the OLD shared depot/market blockout body
//      (the single `kind==="depot"||kind==="market"` branch that used to live at
//      src/world.js:179 on main) into head's world.js — distinctness must FAIL.
//   C2 independent geometry mutation: route research through the depot body —
//      distinctness must FAIL on a DIFFERENT pair (depot/research).
//   C3 clean-main rollback: measure the untouched main source snapshot in
//      .rollback-main/ (verified byte-identical to origin/main modulo CRLF) —
//      distinctness must FAIL there too.
// The occupancy/Jaccard computation below is copied VERBATIM from
// scripts/capture-art04.mjs (same grid 14x20x14, same floor 0.15). Mutations
// are applied to TEMP COPIES of src/ — the working tree is never edited.
// Run: node scripts/mutate-art04.mjs  (writes mutation-controls.json into the
// evidence dir; exits 1 if any control's verdict differs from its expectation).
import {mkdtemp, cp, rm, writeFile, readFile, mkdir} from "node:fs/promises";
import {resolve, join} from "node:path";
import {execSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import crypto from "node:crypto";
import * as THREE from "three";

// world.js textPanel needs a 2D canvas at import time; stub it (no pixels read).
globalThis.document = {
  createElement: () => ({width: 0, height: 0, getContext: () => new Proxy({}, {get: () => () => {}})})
};

const ROOT = resolve(".");
const OUT = resolve(process.env.RUSTWAKE_CAPTURE_OUT || "docs/evidence/350-art-04");
const SOURCE_SHA = process.env.RUSTWAKE_SOURCE_SHA || execSync("git rev-parse HEAD").toString().trim();
const FLOOR = 0.15; // identical to capture-art04.mjs — never lowered
const SIX = ["depot", "market", "research", "fabricator", "salvager", "crusher"];

// --- verbatim metric from scripts/capture-art04.mjs ---
const GX = 14, GY = 20, GZ = 14, X0 = -1.75, Y0 = 0, Z0 = -1.75;
const SX = 3.5 / GX, SY = 5 / GY, SZ = 3.5 / GZ;
function occupancySignature(makeBuilding, type) {
  const g = makeBuilding({id: 99, type, x: 11.5, z: 11.5, remaining: 0}, 0).group;
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.set(1, 1, 1);
  g.updateWorldMatrix(true, true);
  const bits = new Uint8Array(GX * GY * GZ);
  g.traverse(n => {
    if (!n.isMesh || n.name === "pick:volume") return;
    const bb = new THREE.Box3().setFromObject(n);
    const i0 = Math.max(0, Math.floor((bb.min.x - X0) / SX)), i1 = Math.min(GX - 1, Math.floor((bb.max.x - X0) / SX));
    const j0 = Math.max(0, Math.floor((bb.min.y - Y0) / SY)), j1 = Math.min(GY - 1, Math.floor((bb.max.y - Y0) / SY));
    const k0 = Math.max(0, Math.floor((bb.min.z - Z0) / SZ)), k1 = Math.min(GZ - 1, Math.floor((bb.max.z - Z0) / SZ));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++)
      bits[(i * GY + j) * GZ + k] = 1;
  });
  return bits;
}
function jaccardDistance(a, b) {
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) {if (a[i] | b[i]) union++; if (a[i] & b[i]) inter++;}
  return union ? 1 - inter / union : 0;
}
async function measureSrc(srcDir) {
  const {makeBuilding} = await import(pathToFileURL(join(srcDir, "world.js")).href);
  const sigs = Object.fromEntries(SIX.map(t => [t, occupancySignature(makeBuilding, t)]));
  const pairs = {};
  let min = Infinity, minPair = "";
  for (let i = 0; i < SIX.length; i++) for (let j = i + 1; j < SIX.length; j++) {
    const d = jaccardDistance(sigs[SIX[i]], sigs[SIX[j]]);
    pairs[SIX[i] + "/" + SIX[j]] = +d.toFixed(4);
    if (d < min) {min = d; minPair = SIX[i] + "/" + SIX[j];}
  }
  return {grid: [GX, GY, GZ], pairs, min: +min.toFixed(4), minPair,
    verdict: min >= FLOOR ? "PASS" : "FAIL"};
}

const DEPOT_HEAD = ' } else if(kind==="depot"){';
const SHARED_MAIN = ' } else if(kind==="depot"||kind==="market"){';
const GENERATOR = ' } else if(kind==="generator"){';

async function main() {
  const tmp = await mkdtemp(join(ROOT, ".mutate-art04-"));
  const controls = [];
  try {
    const headWorld = await readFile(join(ROOT, "src/world.js"), "utf8");
    const mainWorld = execSync("git show origin/main:src/world.js", {maxBuffer: 16 * 1024 * 1024}).toString();

    // C0 — positive control: unmutated head.
    {
      const dir = join(tmp, "c0"); await cp(join(ROOT, "src"), dir, {recursive: true});
      const m = await measureSrc(dir);
      controls.push({id: "C0-head-unmutated", kind: "positive-control", expected: "PASS", ...m,
        ok: m.verdict === "PASS"});
    }

    // C1 — restore the OLD shared depot/market body verbatim from main into
    // head's world.js (replaces head's separate depot AND market branches).
    {
      const h0 = headWorld.indexOf(DEPOT_HEAD), h1 = headWorld.indexOf(GENERATOR);
      const m0 = mainWorld.indexOf(SHARED_MAIN), m1 = mainWorld.indexOf(GENERATOR);
      if (h0 < 0 || h1 < 0 || m0 < 0 || m1 < 0 || h1 <= h0 || m1 <= m0)
        throw Error("MUTATION_SPLICE_MARKERS_NOT_FOUND");
      const mutated = headWorld.slice(0, h0) + mainWorld.slice(m0, m1) + headWorld.slice(h1);
      const dir = join(tmp, "c1"); await cp(join(ROOT, "src"), dir, {recursive: true});
      await writeFile(join(dir, "world.js"), mutated);
      const m = await measureSrc(dir);
      controls.push({id: "C1-restore-shared-depot-market-body", kind: "mutation",
        description: "main's single kind==depot||kind==market blockout branch spliced over head's separate depot+market branches (the old world.js:179 defect)",
        mutatedWorldSha256: crypto.createHash("sha256").update(mutated).digest("hex"),
        expected: "FAIL", ...m, ok: m.verdict === "FAIL" && m.pairs["depot/market"] === 0});
    }

    // C2 — independent mutation: research routed through the depot body.
    {
      const mutated = headWorld.replace(DEPOT_HEAD, ' } else if(kind==="depot"||kind==="research"){');
      if (mutated === headWorld) throw Error("MUTATION_C2_NO_OP");
      const dir = join(tmp, "c2"); await cp(join(ROOT, "src"), dir, {recursive: true});
      await writeFile(join(dir, "world.js"), mutated);
      const m = await measureSrc(dir);
      controls.push({id: "C2-clone-depot-onto-research", kind: "mutation",
        description: "depot branch condition widened to kind==depot||kind==research so both share one body",
        mutatedWorldSha256: crypto.createHash("sha256").update(mutated).digest("hex"),
        expected: "FAIL", ...m, ok: m.verdict === "FAIL" && m.pairs["depot/research"] === 0});
    }

    // C3 — clean-main rollback: untouched main snapshot (.rollback-main/src,
    // verified identical to origin/main modulo CRLF before this run).
    {
      const dir = join(tmp, "c3");
      await cp(join(ROOT, ".rollback-main/src"), dir, {recursive: true});
      const rollbackWorld = await readFile(join(dir, "world.js"), "utf8");
      const identical = rollbackWorld.replace(/\r\n/g, "\n") === mainWorld.replace(/\r\n/g, "\n");
      const m = await measureSrc(dir);
      controls.push({id: "C3-rollback-clean-main", kind: "rollback-control",
        description: "unmutated origin/main source snapshot from .rollback-main/",
        snapshotMatchesMainModuloCrlf: identical,
        expected: "FAIL", ...m, ok: identical && m.verdict === "FAIL" && m.pairs["depot/market"] === 0});
    }
  } finally {
    await rm(tmp, {recursive: true, force: true});
  }
  const ok = controls.every(c => c.ok);
  const report = {issue: 350, source_sha: SOURCE_SHA, floor: FLOOR,
    metric: "six-rig occupancy-grid Jaccard distinctness (verbatim capture-art04.mjs computation)",
    started: new Date().toISOString(), controls, ok,
    status: ok ? "CONTROLS_OK" : "CONTROLS_BROKEN"};
  await mkdir(OUT, {recursive: true});
  await writeFile(join(OUT, "mutation-controls.json"), JSON.stringify(report, null, 2) + "\n");
  for (const c of controls)
    console.log(`${c.id}: ${c.verdict} (expected ${c.expected}) min=${c.min} @ ${c.minPair} depot/market=${c.pairs["depot/market"]} -> ${c.ok ? "OK" : "BROKEN"}`);
  console.log("ART-04 mutation controls:", report.status);
  if (!ok) process.exitCode = 1;
}
await main();