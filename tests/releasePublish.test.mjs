/**
 * Issue #600 — automated release publishing: unit truth tables, tag
 * immutability, notes contract, and a static guard on the delivery.yml job
 * shape with mutation-based negative controls (Refs #600).
 *
 * Offline and deterministic: no network, no servers, no timers — nothing that
 * can keep the Node event loop alive (the #545 outage class). Follows the
 * static-workflow-assertion pattern of tests/deliveryAlert.test.mjs.
 *
 * Every guard is falsifiable: the static contract is a pure function over
 * YAML text, and each mutation test below feeds it a deliberately broken
 * variant that MUST throw. A vacuous assertion is not evidence.
 *
 * HONEST LIMITATION: the YAML assertions are TEXT-level contract checks, not
 * GitHub runtime execution. The ruling's real end-to-end deploy proof and the
 * real skipped-delivery zero-delta observation are owed post-merge evidence
 * for the release engineer; they are NOT mocked here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  parseSemver,
  compareSemver,
  nextVersion,
  previousVersion,
  shouldPublish,
  tagAvailability,
  buildNotes,
  REQUIRED_JOBS,
  NO_UPSTREAM_CI,
} from "../scripts/release-publish.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const SHA = "77e6442f04dce6529e3888535a73d3f75af1d9b6";
const OTHER_SHA = "c62f0b890e9ab566e6e19f1472383362cfa9cd10";
const REAL_TAGS = ["v0.1.0", "v0.2.0", "v0.3.0"];
const allSuccess = () => ({
  "package": "success", "deploy": "success",
  "verify-live": "success", "hosted-browser": "success",
});

// --- 1. nextVersion: deterministic auto-patch-bump ---------------------------
test("nextVersion: real current tag list v0.1.0/v0.2.0/v0.3.0 => v0.3.1", () => {
  assert.equal(nextVersion(REAL_TAGS), "v0.3.1");
  assert.equal(nextVersion([...REAL_TAGS].reverse()), "v0.3.1", "order-independent");
  assert.equal(nextVersion(REAL_TAGS), nextVersion(REAL_TAGS), "deterministic");
});

test("nextVersion: idempotent series continuation, never reuses an existing tag", () => {
  let tags = [...REAL_TAGS];
  for (const expected of ["v0.3.1", "v0.3.2", "v0.3.3", "v0.3.4", "v0.3.5"]) {
    const next = nextVersion(tags);
    assert.equal(next, expected);
    assert.ok(!tags.includes(next), "must never return an existing tag");
    tags.push(next);
  }
  const dense = ["v0.3.0", "v0.3.1", "v0.3.2", "v0.3.3", "v0.3.4", "v0.3.5"];
  assert.equal(nextVersion(dense), "v0.3.6");
  assert.ok(!dense.includes(nextVersion(dense)));
});

test("nextVersion: numeric ordering, not string ordering (v0.10.0 > v0.9.0)", () => {
  assert.equal(nextVersion(["v0.9.0", "v0.10.0", "v0.2.99"]), "v0.10.1");
  assert.equal(nextVersion(["v0.3.99", "v0.3.100"]), "v0.3.101");
  assert.equal(nextVersion(["v0.3.9", "v0.3.10"]), "v0.3.11");
});

test("nextVersion: highest MAJOR.MINOR series wins, max patch within it + 1", () => {
  assert.equal(nextVersion(["v1.2.3", "v0.9.9", "v1.2.0", "v2.0.0", "v1.9.9"]), "v2.0.1");
  assert.equal(nextVersion(["v0.3.5", "v0.2.9"]), "v0.3.6");
  assert.equal(nextVersion(["v2.0.0", "v10.0.0", "v9.9.9"]), "v10.0.1");
  // A curated minor bump banks a new series; automation continues within it.
  assert.equal(nextVersion([...REAL_TAGS, "v0.4.0"]), "v0.4.1");
  assert.equal(nextVersion([...REAL_TAGS, "v1.0.0"]), "v1.0.1");
});

test("nextVersion: non-semver tags are ignored, never parsed loosely", () => {
  const noisy = ["latest", "nightly", "0.4.0", "v0.4", "v0.3.0-rc1", "V0.9.9",
    "v01.2.3", "v0.3.0+build", "release-2026", "v0.3.0", "v0.2.0", "v0.1.0"];
  assert.equal(nextVersion(noisy), "v0.3.1");
  for (const bad of ["v0.3", "0.3.0", "v0.3.0-rc1", "V0.3.0", "v00.3.0", "v0.3.00", "v0.3.0.1", "", null, 42]) {
    assert.equal(parseSemver(bad), null, `must reject: ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(parseSemver("v0.3.0"), { major: 0, minor: 3, patch: 0 });
  assert.equal(compareSemver(parseSemver("v0.10.0"), parseSemver("v0.9.9")), 1);
});

test("nextVersion: empty or fully non-semver tag list is a hard error, not a guess", () => {
  assert.throws(() => nextVersion([]), /curated seed tag/);
  assert.throws(() => nextVersion(["latest", "nightly", "0.1.0"]), /curated seed tag/);
  for (const bad of [null, undefined, "v0.3.0", 42, {}]) {
    assert.throws(() => nextVersion(bad), TypeError);
  }
});

test("previousVersion returns the highest strict semver tag or null", () => {
  assert.equal(previousVersion(REAL_TAGS), "v0.3.0");
  assert.equal(previousVersion(["v0.10.0", "v0.9.0", "junk"]), "v0.10.0");
  assert.equal(previousVersion([]), null);
  assert.equal(previousVersion(["junk"]), null);
});

// --- 2. shouldPublish: failure invariant truth table -------------------------
test("shouldPublish: all four jobs success + live SHA == main head => publish", () => {
  const d = shouldPublish({
    jobConclusions: allSuccess(), liveSourceSha: SHA, mainHead: SHA, existingReleaseSha: null,
  });
  assert.equal(d.publish, true);
  assert.ok(typeof d.reason === "string" && d.reason.length > 0);
});

test("shouldPublish: EVERY non-success conclusion of EVERY upstream job => NO publish", () => {
  const badConclusions = [
    "failure", "cancelled", "timed_out", "skipped", "action_required",
    "stale", "neutral", "some_future_unknown_value", null, undefined,
  ];
  let cases = 0;
  for (const job of REQUIRED_JOBS) {
    for (const conclusion of badConclusions) {
      const jobs = allSuccess();
      jobs[job] = conclusion;
      const d = shouldPublish({
        jobConclusions: jobs, liveSourceSha: SHA, mainHead: SHA, existingReleaseSha: null,
      });
      assert.equal(d.publish, false, `job=${job} conclusion=${conclusion}`);
      assert.ok(d.reason.includes(job), `reason must name the blocking job: ${d.reason}`);
      cases++;
    }
  }
  assert.equal(cases, 40);
  // Missing conclusion map entirely must not compare equal-by-undefined.
  for (const bad of [null, undefined, {}, "success", 42]) {
    assert.equal(shouldPublish({
      jobConclusions: bad, liveSourceSha: SHA, mainHead: SHA, existingReleaseSha: null,
    }).publish, false);
  }
});

test("REGRESSION #600: weakening != 'success' to == 'failure' MUST break this test", () => {
  // A guard rewritten to block only 'failure' would publish on cancelled /
  // timed_out / skipped deliveries — the exact silent-staleness defect class
  // (#549 lesson). Do not relax these assertions.
  for (const conclusion of ["cancelled", "timed_out", "skipped"]) {
    const jobs = allSuccess();
    jobs["verify-live"] = conclusion;
    assert.equal(shouldPublish({
      jobConclusions: jobs, liveSourceSha: SHA, mainHead: SHA, existingReleaseSha: null,
    }).publish, false, `verify-live=${conclusion} must publish NOTHING`);
  }
});

test("shouldPublish: live SHA must be 40-hex lowercase and equal the main head", () => {
  const base = { jobConclusions: allSuccess(), existingReleaseSha: null };
  assert.equal(shouldPublish({ ...base, liveSourceSha: SHA, mainHead: OTHER_SHA }).publish, false);
  assert.equal(shouldPublish({ ...base, liveSourceSha: OTHER_SHA, mainHead: SHA }).publish, false);
  for (const bad of ["", "abc", SHA.toUpperCase(), SHA.slice(0, 39), SHA + "a",
    "$(touch pwned)", "refs/heads/main", null, undefined, 42]) {
    assert.equal(shouldPublish({ ...base, liveSourceSha: bad, mainHead: SHA }).publish, false,
      `bad liveSourceSha: ${JSON.stringify(bad)}`);
    assert.equal(shouldPublish({ ...base, liveSourceSha: SHA, mainHead: bad }).publish, false,
      `bad mainHead: ${JSON.stringify(bad)}`);
  }
});

test("shouldPublish: same-SHA re-run is a no-op; mismatched release SHA never publishes", () => {
  const base = { jobConclusions: allSuccess(), liveSourceSha: SHA, mainHead: SHA };
  const noop = shouldPublish({ ...base, existingReleaseSha: SHA });
  assert.equal(noop.publish, false);
  assert.match(noop.reason, /no-op/);
  assert.equal(shouldPublish({ ...base, existingReleaseSha: OTHER_SHA }).publish, false);
});

// --- 3. tagAvailability: immutability ----------------------------------------
test("tagAvailability: absent => create, same SHA => noop, different SHA => HARD FAIL", () => {
  assert.deepEqual(tagAvailability("v0.3.1", {}, SHA), { action: "create" });
  assert.deepEqual(tagAvailability("v0.3.1", { "v0.3.0": OTHER_SHA }, SHA), { action: "create" });
  assert.deepEqual(tagAvailability("v0.3.1", { "v0.3.1": SHA }, SHA), { action: "noop" });
  assert.throws(() => tagAvailability("v0.3.1", { "v0.3.1": OTHER_SHA }, SHA), /immutable/);
  assert.throws(() => tagAvailability("v0.3.1", null, SHA), TypeError);
});

// --- 4. buildNotes: required content, forbidden claims ------------------------
const FORBIDDEN_CLAIM = /visually verified|sponsor[- ]approved|production[- ]ready|G1 (?:pass(?:ed)?|accept(?:ed|ance)?)/i;
const notesInput = (over = {}) => ({
  tag: "v0.3.1",
  sourceSha: SHA,
  previousTag: "v0.3.0",
  commits: [
    { sha: "258fce5", subject: "feat(v2): publish Rustwake 3D sandbox foundation (#306)" },
    { sha: "0da976d", subject: "fix(249): desktop widescreen camera fit fills remaining rectangle (#251)" },
  ],
  mainCiRun: "https://github.com/darkmatter2222/Rustwake/actions/runs/44081765468",
  deliveryRun: "https://github.com/darkmatter2222/Rustwake/actions/runs/44081765999",
  gameSourceChanged: true,
  ...over,
});

test("buildNotes carries SHA, tag, git range, commit lines, CI run, delivery run, both artifacts", () => {
  const body = buildNotes(notesInput());
  assert.ok(body.includes(SHA), "full 40-hex deployed SHA");
  assert.ok(body.includes("v0.3.1"));
  assert.ok(body.includes("`v0.3.0.." + SHA + "`"), "commit range since previous tag");
  assert.ok(body.includes("`258fce5` feat(v2): publish Rustwake 3D sandbox foundation (#306)"));
  assert.ok(body.includes("`0da976d` fix(249): desktop widescreen camera fit fills remaining rectangle (#251)"));
  assert.ok(body.includes("actions/runs/44081765468"), "main CI run");
  assert.ok(body.includes("actions/runs/44081765999"), "delivery run");
  assert.ok(body.includes(`rustwake-live-verification-${SHA}`));
  assert.ok(body.includes(`rustwake-hosted-browser-${SHA}`));
  assert.ok(body.includes("game-source changes included"));
});

test("buildNotes: honest workflow_dispatch fallback, never a fabricated CI run id", () => {
  for (const ci of [null, undefined, ""]) {
    const body = buildNotes(notesInput({ mainCiRun: ci }));
    assert.ok(body.includes(NO_UPSTREAM_CI));
    assert.ok(!body.includes("44081765468"));
  }
});

test("buildNotes: docs-only deploy is mechanically labeled, game-source deploy is not", () => {
  const docsOnly = buildNotes(notesInput({ gameSourceChanged: false, commits: [] }));
  assert.ok(docsOnly.includes("No game-source changes (docs/infra/dashboard only)."));
  assert.ok(docsOnly.includes("(no commits in range)"));
  const game = buildNotes(notesInput({ gameSourceChanged: true }));
  assert.ok(!game.includes("No game-source changes"));
});

test("buildNotes NEVER emits a visual-acceptance claim, even with hostile commit subjects", () => {
  for (const changed of [true, false]) {
    const body = buildNotes(notesInput({ gameSourceChanged: changed }));
    assert.ok(!FORBIDDEN_CLAIM.test(body), "generator prose must not claim acceptance");
    assert.ok(body.includes("NOT a visual acceptance"), "explicit disclaimer present");
    assert.ok(body.includes("G1 (Refs #276)"), "G1 pointer present");
  }
  const hostile = buildNotes(notesInput({
    commits: [{ sha: "aaaaaaa", subject: "sponsor-approved visually verified production-ready G1 passed" }],
  }));
  assert.ok(!FORBIDDEN_CLAIM.test(hostile), "hostile commit subjects must be neutralized, not echoed as claims");
  assert.ok(hostile.includes("`aaaaaaa`"), "commit line still present");
});

test("buildNotes rejects malformed inputs instead of emitting a partial receipt", () => {
  assert.throws(() => buildNotes(notesInput({ tag: "0.3.1" })), TypeError);
  assert.throws(() => buildNotes(notesInput({ sourceSha: "abc" })), TypeError);
  assert.throws(() => buildNotes(notesInput({ previousTag: "" })), TypeError);
  assert.throws(() => buildNotes(notesInput({ commits: "not-an-array" })), TypeError);
  assert.throws(() => buildNotes(notesInput({ commits: [{ sha: 1 }] })), TypeError);
  assert.throws(() => buildNotes(notesInput({ deliveryRun: "" })), TypeError);
});

// --- 5. Static guard on delivery.yml (pure over text; mutations MUST fail) ---
// Pre-#600 audited baseline: the sha256 of the LF-normalized delivery.yml at
// origin/main 77e6442f (the OPS-12 hardened content pinned by
// tests/deliveryAlert.test.mjs). The publish-release addition is a PURE
// SUFFIX: everything before the #600 marker must hash to this exact value,
// proving package predicates, concurrency group, needs chains, runner labels
// and job order are byte-identical — not merely "semantically similar".
const PRE_600_BASELINE = "675320f94e6085cd997b3179f3e7106c1ea56e653cacade952831211dbe964da";
const MARKER = "  # Issue #600: automated release publish";
const CHECKOUT_PIN = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0";
const SETUP_NODE_PIN = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0";

function assertWorkflowContract(raw) {
  const yml = raw.replace(/\r\n/g, "\n");
  // Workflow-level permissions unchanged (contents: read / actions: read).
  const topLevel = yml.match(/^permissions:\n((?:[ \t]+[^\n]*\n)+)/m);
  assert.ok(topLevel, "workflow-level permissions block present");
  assert.deepEqual(topLevel[1].trimEnd().split("\n").map((l) => l.trim()),
    ["contents: read", "actions: read"]);
  // Pure-suffix proof: existing content byte-identical to the audited baseline.
  const idx = yml.indexOf(MARKER);
  assert.ok(idx > 0, "#600 publish-release section marker present");
  assert.equal(sha256(yml.slice(0, idx)), PRE_600_BASELINE,
    "pre-#600 delivery.yml content must be byte-identical (predicates, concurrency, needs, runners, order)");
  const added = yml.slice(idx);
  // Terminal job, exact needs, job order.
  const jobKeys = [...yml.slice(yml.indexOf("jobs:")).matchAll(/^  ([a-z][a-z-]*):$/gm)].map((m) => m[1]);
  assert.deepEqual(jobKeys, ["package", "deploy", "verify-live", "hosted-browser", "publish-release"]);
  const block = yml.slice(yml.indexOf("  publish-release:"));
  assert.ok(block.includes("    needs: [package, deploy, verify-live, hosted-browser]"),
    "needs exactly the four upstream jobs");
  // Success-only semantics: no if:, no continue-on-error, no always().
  // Key-level regexes: prose in comments may name these keys without setting them.
  assert.ok(!/^\s*if:/m.test(block), "publish-release must have no if: override");
  assert.ok(!/^\s*continue-on-error:/m.test(added), "no continue-on-error in the addition");
  assert.ok(!/always\(\)/.test(added), "no always() in the addition");
  assert.ok(!/^\s*concurrency:/m.test(added), "no second concurrency group; the workflow-level group serializes");
  // Job-scoped contents: write ONLY.
  const jobPerms = block.match(/^    permissions:\n((?:[ \t]{6,}[^\n]*\n)+)/m);
  assert.ok(jobPerms, "publish-release job-scoped permissions block present");
  assert.deepEqual(jobPerms[1].trimEnd().split("\n").map((l) => l.trim()), ["contents: write"]);
  assert.equal((added.match(/permissions:/g) || []).length, 1, "exactly one permissions block in the addition");
  // Unprivileged runner, bounded timeout.
  assert.ok(block.includes("    runs-on: ubuntu-latest"));
  assert.ok(!added.includes("self-hosted"), "never the privileged deploy runner");
  const timeout = block.match(/^    timeout-minutes: (\d+)$/m);
  assert.ok(timeout, "bounded timeout-minutes present");
  assert.ok(Number(timeout[1]) >= 1 && Number(timeout[1]) <= 30);
  // Verified live SHA consumed from package outputs; main head cross-check.
  assert.ok(block.includes("SOURCE_SHA: ${{ needs.package.outputs.source_sha }}"));
  assert.ok(block.includes("MAIN_HEAD: ${{ github.event.workflow_run.head_sha || github.sha }}"));
  assert.ok(block.includes("GH_TOKEN: ${{ github.token }}"));
  for (const job of ["package", "deploy", "verify-live", "hosted-browser"]) {
    assert.ok(block.includes(`needs.${job}.result`), `conclusion of ${job} must reach the decision script`);
  }
  // Zero new actions: only the two already-pinned actions, 40-hex SHA pins.
  const uses = [...added.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length > 0);
  for (const u of uses) {
    assert.ok(u === CHECKOUT_PIN.split(" ")[0] || u === SETUP_NODE_PIN.split(" ")[0],
      `zero new actions allowed, got: ${u}`);
    assert.match(u, /@[0-9a-f]{40}$/, "SHA-pinned (Refs #336)");
  }
  assert.ok(added.includes(CHECKOUT_PIN), "checkout pin + version comment");
  assert.ok(added.includes(SETUP_NODE_PIN), "setup-node pin + version comment");
  assert.ok(block.includes("fetch-depth: 0"), "full history + tags for the commit range");
  assert.ok(block.includes("run: node scripts/release-publish.mjs"), "logic lives in the testable script");
  assert.ok(yml.trimEnd().endsWith("run: node scripts/release-publish.mjs"), "publish-release is terminal");
}

test("delivery.yml static contract: publish-release job shape passes on the real file", () => {
  assertWorkflowContract(read(".github/workflows/delivery.yml"));
});

test("NEGATIVE CONTROLS: every deliberate mutation of the workflow MUST fail the guard", () => {
  const real = read(".github/workflows/delivery.yml").replace(/\r\n/g, "\n");
  const mutations = [
    ["drop a needs edge", (s) => s.replace(
      "    needs: [package, deploy, verify-live, hosted-browser]",
      "    needs: [package, deploy, verify-live]")],
    ["add if: always() override", (s) => s.replace(
      "  publish-release:\n", "  publish-release:\n    if: always()\n")],
    ["add continue-on-error", (s) => s.replace(
      "  publish-release:\n", "  publish-release:\n    continue-on-error: true\n")],
    ["weaken job permissions to read", (s) => s.replace(
      "    permissions:\n      contents: write", "    permissions:\n      contents: read")],
    ["escalate workflow-level permissions", (s) => s.replace(
      "permissions:\n  contents: read", "permissions:\n  contents: write")],
    ["tamper with an existing needs chain", (s) => s.replace(
      "    needs: [package, deploy]\n", "    needs: [package]\n")],
    ["tamper with the package predicate", (s) => s.replace(
      "github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.conclusion != 'failure'")],
    ["delete the publish-release job", (s) => s.slice(0, s.indexOf(MARKER))],
    ["unpin an action", (s) => s.replace(CHECKOUT_PIN.split(" ")[0], "actions/checkout@v4")],
    ["add a second concurrency group", (s) => s.replace(
      "  publish-release:\n", "  publish-release:\n    concurrency:\n      group: other\n")],
    ["move publish-release off the terminal position", (s) => s.replace(
      "  publish-release:\n", "  publish-release:\n    needs: [package]\n").replace(
      "    needs: [package, deploy, verify-live, hosted-browser]\n", "")],
    ["tag github.sha instead of the verified output", (s) => s.replace(
      "SOURCE_SHA: ${{ needs.package.outputs.source_sha }}", "SOURCE_SHA: ${{ github.sha }}")],
    ["run on the privileged deploy runner", (s) => s.replace(
      "    runs-on: ubuntu-latest\n    timeout-minutes: 10", "    runs-on: [self-hosted, Linux, X64, rustwake-deploy]\n    timeout-minutes: 10")],
  ];
  for (const [name, mutate] of mutations) {
    const mutated = mutate(real);
    assert.notEqual(mutated, real, `mutation '${name}' must actually change the text`);
    assert.throws(() => assertWorkflowContract(mutated), `guard MUST reject: ${name}`);
  }
});

test("module REQUIRED_JOBS matches the workflow needs list exactly", () => {
  const yml = read(".github/workflows/delivery.yml").replace(/\r\n/g, "\n");
  const needs = yml.match(/needs: \[([^\]]+)\]/g).pop();
  const list = needs.replace(/needs: \[|\]/g, "").split(",").map((s) => s.trim());
  assert.deepEqual(list, REQUIRED_JOBS);
});

// --- 6. Script hygiene (delivery-alert pattern) -------------------------------
test("release-publish.mjs uses execFileSync only, never logs the token, import runs nothing", () => {
  const src = read("scripts/release-publish.mjs");
  assert.ok(src.includes("execFileSync"));
  assert.ok(!/\bexecSync\s*\(/.test(src), "no shell-string execSync");
  assert.ok(!/\bexec\s*\(/.test(src), "no shell-string exec");
  assert.ok(!/console\.(log|error)[^\n]*GH_TOKEN/.test(src), "never echo the token");
  assert.ok(src.includes("process.argv[1]"), "CLI side effects gated behind an isCli check");
  assert.ok(!src.includes("--force"), "no force path for tags or releases");
  // Importing the module (this test file already did) must not have touched
  // git/gh: proven by the suite running offline with no network and no hang.
});
