/**
 * Issue #549 — delivery-alert guard, composition, dedupe, injection boundary,
 * YAML text contract, zero-diff guard and real-incident reproduction.
 *
 * Offline and deterministic: no network, no servers, no timers, no jsdom —
 * nothing that can keep the Node event loop alive (the #545 outage class).
 * The real-incident fixtures were fetched once from the live GitHub API and
 * are committed under docs/evidence/549-delivery-alert/fixtures/.
 *
 * HONEST LIMITATION: the YAML assertions below are TEXT-level contract checks,
 * not GitHub runtime execution. A workflow_run-triggered workflow only runs
 * once it exists on the default branch, so the real alert path is unproven
 * until the first real non-success main CI after merge; the workflow_dispatch
 * dry-run (default true) exists to exercise the path safely post-merge.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  shouldAlert,
  composeAlert,
  decideDedupe,
  validateRunId,
  validateRepo,
  issueListArgs,
  issueCreateArgs,
  issueCommentArgs,
} from "../scripts/delivery-alert.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));
const REPO = "darkmatter2222/Rustwake";
const BASE_MAIN = "680c01561331c535c1ad46b477ac09fbdf699397";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const incidentRun = () => ({
  id: 44063235910,
  event: "push",
  head_branch: "main",
  head_sha: "ec64143340891d4c9fe1829560243d17e753b506",
  conclusion: "cancelled",
  html_url: `https://github.com/${REPO}/actions/runs/44063235910`,
  head_repository: { full_name: REPO },
  repository: { full_name: REPO },
});

// --- 1. Truth table: conclusion x event x head_branch x head_repository -----
test("shouldAlert truth table over conclusion x event x branch x repository", () => {
  const conclusions = [
    "success", "failure", "cancelled", "timed_out", "action_required",
    "stale", "skipped", "neutral", "some_future_unknown_value", null, undefined,
  ];
  const events = ["push", "pull_request", "workflow_dispatch", "schedule"];
  const branches = ["main", "rw/549-delivery-alert", "feature/x"];
  const repos = ["same", "fork", "missing"];
  let cases = 0;
  for (const conclusion of conclusions) {
    for (const event of events) {
      for (const head_branch of branches) {
        for (const repoShape of repos) {
          const run = { ...incidentRun(), conclusion, event, head_branch };
          if (repoShape === "fork") run.head_repository = { full_name: "attacker/Rustwake" };
          if (repoShape === "missing") delete run.head_repository;
          // Independent expected value: the delivery gate minus conclusion, inverted.
          const expected =
            event === "push" && head_branch === "main" &&
            repoShape === "same" && conclusion !== "success";
          assert.equal(
            shouldAlert(run), expected,
            `conclusion=${conclusion} event=${event} branch=${head_branch} repo=${repoShape}`
          );
          cases++;
        }
      }
    }
  }
  assert.equal(cases, 396);
});

test("shouldAlert rejects malformed run objects", () => {
  for (const bad of [null, undefined, {}, "cancelled", 42, []]) {
    assert.equal(shouldAlert(bad), false);
  }
  // Both repository names missing must NOT compare equal-by-undefined.
  const run = incidentRun();
  delete run.head_repository;
  delete run.repository;
  assert.equal(shouldAlert(run), false);
});

// --- 2. Regression negative control -----------------------------------------
test("REGRESSION #549: weakening != 'success' to == 'failure' MUST break this test", () => {
  // The actual incident was `cancelled`, not `failure`. A guard rewritten to
  // `conclusion == 'failure'` returns false for cancelled/timed_out and fails
  // here. Do not relax these assertions.
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "cancelled" }), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "timed_out" }), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "failure" }), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "action_required" }), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "stale" }), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "skipped" }), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "brand_new_conclusion" }), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "success" }), false);
});

test("exact incident shape alerts; success/PR/fork/pull_request shapes do not", () => {
  assert.equal(shouldAlert(incidentRun()), true);
  assert.equal(shouldAlert({ ...incidentRun(), conclusion: "success" }), false);
  assert.equal(shouldAlert({ ...incidentRun(), head_branch: "rw/549-delivery-alert" }), false);
  assert.equal(shouldAlert({ ...incidentRun(), head_repository: { full_name: "fork/Rustwake" } }), false);
  assert.equal(shouldAlert({ ...incidentRun(), event: "pull_request" }), false);
});

// --- 3. composeAlert content contract ----------------------------------------
test("composeAlert includes run id, full 40-char SHA, run URL and the NOT-live sentence", () => {
  const run = incidentRun();
  const deliveryRun = {
    id: 44065451074, conclusion: "skipped", status: "completed",
    html_url: `https://github.com/${REPO}/actions/runs/44065451074`,
  };
  const { title, body } = composeAlert(run, { repo: REPO, deliveryRun });
  assert.ok(title.includes("44063235910"), "title must carry the run id for dedupe");
  assert.ok(title.includes("cancelled"));
  assert.ok(body.includes("ec64143340891d4c9fe1829560243d17e753b506"), "full 40-char head SHA");
  assert.match(body, /[a-f0-9]{40}/);
  assert.ok(body.includes(`https://github.com/${REPO}/actions/runs/44063235910`), "run URL");
  assert.ok(body.includes("Deployment was skipped and merged code is NOT live"));
  assert.ok(body.includes("`cancelled`"), "conclusion");
  assert.ok(body.includes("`push`"), "event");
  assert.ok(body.includes("`main`"), "branch");
  assert.ok(body.includes("44065451074"), "delivery run id");
  assert.ok(body.includes("`skipped`"), "delivery run conclusion");
  assert.ok(body.includes("#545"), "root-cause class pointer");
  assert.ok(body.includes("event loop"), "root-cause description");
  assert.ok(body.includes("14"), "14-minute timeout reference");
});

test("composeAlert without a delivery run still states deployment was skipped", () => {
  const { body } = composeAlert(incidentRun(), { repo: REPO, deliveryRun: null });
  assert.ok(body.includes("Deployment was skipped and merged code is NOT live"));
  assert.ok(body.includes("none found"));
});

test("composeAlert derives the run URL when html_url is absent", () => {
  const run = incidentRun();
  delete run.html_url;
  const { body } = composeAlert(run, { repo: REPO });
  assert.ok(body.includes(`https://github.com/${REPO}/actions/runs/44063235910`));
});

// --- 4. Dedupe with an injected fake lister (no network) ---------------------
test("dedupe comments on an open issue whose title contains the run id", () => {
  const fakeLister = () => [
    { number: 600, title: "delivery skipped: main CI run 44063235910 concluded cancelled" },
    { number: 601, title: "unrelated issue" },
  ];
  const decision = decideDedupe(44063235910, fakeLister());
  assert.deepEqual(decision, { action: "comment", issueNumber: 600 });
});

test("dedupe creates when no open issue matches, including empty and near-miss lists", () => {
  assert.deepEqual(decideDedupe(44063235910, []), { action: "create" });
  assert.deepEqual(decideDedupe(44063235910, [{ number: 1, title: "run 44063235911 other" }]), { action: "create" });
  assert.deepEqual(decideDedupe(44063235910, null), { action: "create" });
  assert.deepEqual(decideDedupe("44063235910", [{ number: 7, title: "prefix 44063235910 suffix" }]), { action: "comment", issueNumber: 7 });
});

// --- 5. Injection boundary ----------------------------------------------------
test("validateRunId rejects anything but a bare numeric run id", () => {
  assert.equal(validateRunId("44063235910"), "44063235910");
  assert.equal(validateRunId(44063235910), "44063235910");
  for (const bad of ["1; rm -rf /", "$(touch pwned)", "12a", "", " ", "-1", "1\n2", null, undefined, "9".repeat(21)]) {
    assert.throws(() => validateRunId(bad), /numeric/);
  }
});

test("validateRepo rejects shell metacharacters in the repo slug", () => {
  assert.equal(validateRepo(REPO), REPO);
  for (const bad of ["a/b; rm -rf /", "a b/c", "a/$(x)", "", "a/b/c", null]) {
    assert.throws(() => validateRepo(bad), /owner\/name/);
  }
});

test("gh argv builders keep untrusted text as discrete elements, body via stdin", () => {
  const hostile = "x `touch /tmp/pwned` $(reboot) \" ; rm -rf /";
  const create = issueCreateArgs(REPO, hostile, ["v2"]);
  assert.ok(create.includes(hostile), "title travels as ONE argv element, never a shell string");
  assert.equal(create[create.indexOf("--title") + 1], hostile);
  assert.ok(create.includes("--body-file") && create[create.indexOf("--body-file") + 1] === "-");
  assert.deepEqual(create.slice(-2), ["--label", "v2"]);
  const list = issueListArgs(REPO, 44063235910);
  assert.equal(list[list.indexOf("--search") + 1], "in:title 44063235910");
  assert.equal(list[list.indexOf("--state") + 1], "open");
  const comment = issueCommentArgs(REPO, 600);
  assert.equal(comment[2], "600");
  assert.ok(comment.includes("--body-file") && comment[comment.indexOf("--body-file") + 1] === "-");
  assert.throws(() => issueListArgs(REPO, "1; rm -rf /"), /numeric/);
  assert.throws(() => issueCommentArgs(REPO, -5), /positive integer/);
});

test("hostile run metadata stays literal text and never satisfies the guard", () => {
  const hostile = {
    ...incidentRun(),
    conclusion: "$(touch /tmp/pwned)",
    head_branch: "main; rm -rf /",
  };
  assert.equal(shouldAlert(hostile), false, "non-main branch must not alert");
  const { body } = composeAlert({ ...hostile, head_branch: "main" }, { repo: REPO });
  assert.ok(body.includes("$(touch /tmp/pwned)"), "metadata is embedded literally, not executed");
});

test("script source uses execFileSync only and never logs the token", () => {
  const src = read("scripts/delivery-alert.mjs");
  assert.ok(src.includes("execFileSync"));
  assert.ok(!/\bexecSync\s*\(/.test(src), "no shell-string execSync");
  assert.ok(!/\bexec\s*\(/.test(src), "no shell-string exec");
  assert.ok(!/console\.(log|error)[^\n]*GH_TOKEN/.test(src), "never echo the token");
});

// --- 6. YAML text contract (NOT GitHub runtime execution) ---------------------
test("delivery-alert.yml text contract: guard conjuncts verbatim, != 'success' load-bearing", () => {
  const yml = read(".github/workflows/delivery-alert.yml");
  const conjuncts = [
    "github.event_name == 'workflow_run'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
    "github.event.workflow_run.conclusion != 'success'",
    "(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
  ];
  for (const c of conjuncts) assert.ok(yml.includes(c), `missing guard conjunct: ${c}`);
  assert.ok(!yml.includes("conclusion == 'success'"), "must not alert only on success");
  assert.ok(!yml.includes("== 'failure'"), "== 'failure' would miss cancelled/timed_out");
  assert.ok(yml.includes("workflows: [ci]"));
  assert.ok(yml.includes("types: [completed]"));
  assert.ok(yml.includes("branches: [main]"));
});

test("delivery-alert.yml text contract: isolation, runner, timeout, permissions, dry-run", () => {
  const yml = read(".github/workflows/delivery-alert.yml");
  assert.ok(yml.includes("group: rustwake-delivery-alert"));
  assert.ok(!yml.includes("rustwake-databrick-delivery"), "must not join the delivery concurrency group");
  assert.ok(yml.includes("cancel-in-progress: false"));
  assert.ok(yml.includes("runs-on: ubuntu-latest"));
  assert.ok(!yml.includes("self-hosted"), "never the privileged deploy runner");
  assert.ok(yml.includes("timeout-minutes: 5"));
  // Workflow-level permissions must stay contents: read only.
  const topLevel = yml.match(/^permissions:\n((?:[ \t]+[^\n]*\n)+)/m);
  assert.ok(topLevel, "workflow-level permissions block present");
  assert.deepEqual(topLevel[1].trimEnd().split("\n").map((l) => l.trim()), ["contents: read"]);
  // Job-level escalation lives under jobs:, not at workflow level.
  const jobsSection = yml.slice(yml.indexOf("jobs:"));
  assert.ok(jobsSection.includes("issues: write"));
  assert.ok(jobsSection.includes("actions: read"));
  assert.match(yml, /dry_run:[\s\S]*?default: true/, "dispatch dry_run defaults to true");
  assert.ok(yml.includes("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}"));
  assert.ok(yml.includes("node scripts/delivery-alert.mjs"), "logic lives in the testable script");
});

// --- 7. Zero-diff guard: existing workflows byte-identical to base main -------
test("delivery.yml and ci.yml are byte-identical to base main 680c0156", () => {
  // sha256 of the base-main blob content (git show <base>:<path>, LF as stored).
  const baseHashes = {
    ".github/workflows/delivery.yml": "a5f400bcfbd69fec918cbe54bf3d964353ba441c9ba666ce282a3b8526d5a5ca",
    ".github/workflows/ci.yml": "5a042029e48816436c081c48e2610b67115a0b677477717a51dd8eaf24b8b126",
  };
  for (const [file, expected] of Object.entries(baseHashes)) {
    // Normalize CRLF phantoms from autocrlf; git diff compares normalized bytes.
    const normalized = read(file).replace(/\r\n/g, "\n");
    assert.equal(sha256(normalized), expected, `${file} differs from base main`);
  }
  // When the base object is reachable (full clone), also prove it via git diff.
  let baseReachable = true;
  try {
    execFileSync("git", ["cat-file", "-e", `${BASE_MAIN}^{commit}`], { cwd: ROOT, stdio: "pipe" });
  } catch {
    baseReachable = false; // shallow CI checkout; the hash proof above still binds.
  }
  if (baseReachable) {
    const diff = execFileSync(
      "git", ["diff", BASE_MAIN, "HEAD", "--", ".github/workflows/delivery.yml", ".github/workflows/ci.yml"],
      { cwd: ROOT, encoding: "utf8" }
    );
    assert.equal(diff, "", "git diff base..HEAD must be empty for both existing workflows");
  }
});

// --- 8. Real-incident reproduction against committed live-API fixtures --------
test("real incident: live-API fixtures reproduce alert=true / success=false and match report.json", () => {
  const evidenceDir = "docs/evidence/549-delivery-alert";
  const report = readJson(`${evidenceDir}/report.json`);
  assert.equal(report.base_main, BASE_MAIN);
  assert.equal(report.cases.length, 2);
  for (const c of report.cases) {
    const run = readJson(`${evidenceDir}/${c.ci_fixture}`);
    const delivery = readJson(`${evidenceDir}/${c.delivery_fixture}`);
    const deliveryRun = {
      id: delivery.id, conclusion: delivery.conclusion,
      status: delivery.status, html_url: delivery.html_url,
    };
    const verdict = shouldAlert(run);
    assert.equal(verdict, c.expected, c.name);
    assert.equal(verdict, c.shouldAlert, c.name);
    assert.equal(run.id, c.run_id);
    assert.equal(run.head_sha, c.head_sha);
    const { title, body } = composeAlert(run, { repo: REPO, deliveryRun });
    assert.equal(title, c.title, `${c.name} title`);
    assert.equal(body, c.body, `${c.name} body`);
    assert.deepEqual(deliveryRun, c.deliveryRun, `${c.name} deliveryRun`);
  }
  const incident = report.cases.find((c) => c.run_id === 44063235910);
  const control = report.cases.find((c) => c.run_id === 44081765468);
  assert.equal(incident.shouldAlert, true, "cancelled run 44063235910 must ALERT");
  assert.equal(incident.conclusion, "cancelled");
  assert.equal(control.shouldAlert, false, "success run 44081765468 must NOT alert");
  assert.equal(control.conclusion, "success");
});
