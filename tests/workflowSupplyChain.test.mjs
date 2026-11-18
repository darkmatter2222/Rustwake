/**
 * OPS-12 (#336) — workflow supply-chain and permission boundary guards.
 *
 * Deterministic, offline, line-ending robust (every read normalizes CRLF→LF,
 * so these tests do NOT repeat the deliveryAlert.test.mjs :253 Windows defect).
 *
 * HONEST LIMITATION: these are TEXT-level contract checks over the workflow
 * YAML plus a JS mirror of the package gate bound to the YAML by an exact
 * normalized-expression assertion — not GitHub runtime execution. The mirror
 * truth table proves fail-closed LOGIC; the exact-expression test proves the
 * YAML still says exactly that logic. Mutating either one breaks CI.
 *
 * Load-bearing proof: each guard was mutation-tested (insecure variant →
 * named failures → restore → sha256 identity). Receipts live in
 * docs/evidence/336-ops-12/ and docs/engineering/RELEASE.md (OPS-12 section).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = ".github/workflows";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const WORKFLOWS = ["ci.yml", "delivery.yml", "delivery-alert.yml"];
const yml = (name) => read(`${WF_DIR}/${name}`);

// Provenance: resolved 2026-11-17 via GitHub API. For each action,
// `gh api repos/actions/<a>/git/ref/tags/v4` (type=commit) was cross-checked
// against `gh api repos/actions/<a>/tags?per_page=100`: the moving v4 tag
// points at EXACTLY the newest v4.x.y tag commit, so pinning these SHAs is
// behaviour-identical to the floating @v4 in use at main b56fded0.
const PINS = {
  "actions/checkout": { sha: "11d5960a326750d5838078e36cf38b85af677262", version: "v4.4.0" },
  "actions/setup-node": { sha: "49933ea5288caeca8642d1e84afbd3f7d6820020", version: "v4.4.0" },
  "actions/upload-artifact": { sha: "ea165f8d65b6e75b540449e92b4886f43607fa02", version: "v4.6.2" },
  "actions/download-artifact": { sha: "d3f86a106a0bac45b974a628896c90dbdf5c8093", version: "v4.3.0" },
};

// --- helpers ---------------------------------------------------------------
const usesEntries = (text) =>
  [...text.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.*))?$/gm)].map((m) => ({
    ref: m[1],
    comment: (m[2] || "").trim(),
  }));

const triggerKeys = (text) => {
  const block = text.match(/^on:\n((?:[ \t]+[^\n]*\n)+)/m);
  assert.ok(block, "on: block present");
  return [...block[1].matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).sort();
};

const topLevelPermissions = (text) => {
  const single = text.match(/^permissions:[ \t]*(\S+)[ \t]*$/m);
  if (single) return { scalar: single[1] };
  const block = text.match(/^permissions:\n((?:[ \t]+[^\n]*\n)+)/m);
  if (!block) return null;
  const map = {};
  for (const line of block[1].trimEnd().split("\n")) {
    const m = line.match(/^\s+([a-z-]+):\s*(read|write|none)\s*$/);
    assert.ok(m, `unparseable permission line: ${line}`);
    map[m[1]] = m[2];
  }
  return map;
};

// Job blocks: 2-space-indented keys under jobs:.
const jobBlocks = (text) => {
  const jobs = text.slice(text.indexOf("\njobs:") + 1);
  const keys = [...jobs.matchAll(/^ {2}([a-z][a-z0-9-]*):\s*$/gm)];
  const out = {};
  keys.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < keys.length ? keys[i + 1].index : jobs.length;
    out[m[1]] = jobs.slice(start, end);
  });
  return out;
};

const jobPermissions = (block) => {
  const single = block.match(/^    permissions:[ \t]*(\S+)[ \t]*$/m);
  if (single) return { scalar: single[1] };
  const m = block.match(/^    permissions:\n((?: {6}[^\n]*\n)+)/m);
  if (!m) return null;
  const map = {};
  for (const line of m[1].trimEnd().split("\n")) {
    const p = line.match(/^\s+([a-z-]+):\s*(read|write|none)\s*$/);
    assert.ok(p, `unparseable job permission line: ${line}`);
    map[p[1]] = p[2];
  }
  return map;
};

// run: payload lines — both single-line `run: cmd` and `run: |` blocks.
const runPayloads = (text) => {
  const lines = text.split("\n");
  const payloads = [];
  for (let i = 0; i < lines.length; i++) {
    const single = lines[i].match(/^\s*(?:-\s*)?run:\s*(?!\|)(\S.*)$/);
    if (single) payloads.push(single[1]);
    const block = lines[i].match(/^(\s*)(?:-\s*)?run:\s*\|\s*$/);
    if (block) {
      const indent = block[1].length;
      const body = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === "") { body.push(""); continue; }
        const depth = l.match(/^ */)[0].length;
        if (depth <= indent) break;
        body.push(l);
      }
      payloads.push(body.join("\n"));
    }
  }
  return payloads;
};

const normalizeExpr = (s) => s.replace(/\s+/g, " ").trim();

// --- 1. Workflow inventory: a new unaudited workflow must fail CI ----------
test("OPS12: workflow inventory is exactly the three audited files", () => {
  const actual = fs.readdirSync(path.join(ROOT, WF_DIR)).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).sort();
  assert.deepEqual(actual, [...WORKFLOWS].sort(), "new workflows require an OPS-12 audit update");
});

// --- 2. Triggers: no pull_request_target, no PR path to delivery -----------
test("OPS12: no pull_request_target anywhere; trigger sets are exact", () => {
  for (const name of WORKFLOWS) {
    assert.ok(!yml(name).includes("pull_request_target"), `${name} must never use pull_request_target`);
  }
  assert.deepEqual(triggerKeys(yml("ci.yml")), ["pull_request", "push"]);
  assert.deepEqual(triggerKeys(yml("delivery.yml")), ["workflow_dispatch", "workflow_run"]);
  assert.deepEqual(triggerKeys(yml("delivery-alert.yml")), ["workflow_dispatch", "workflow_run"]);
  // workflow_run sources must be ci on main only.
  for (const name of ["delivery.yml", "delivery-alert.yml"]) {
    const text = yml(name);
    assert.match(text, /workflow_run:\n\s+workflows: \[ci\]\n\s+types: \[completed\]\n\s+branches: \[main\]/);
  }
});

// --- 3. Every uses: is SHA-pinned to the audited same-major commit ---------
test("OPS12: every uses: is pinned to the exact audited 40-hex SHA with version comment", () => {
  let count = 0;
  for (const name of WORKFLOWS) {
    for (const { ref, comment } of usesEntries(yml(name))) {
      count++;
      const m = ref.match(/^([a-z0-9-]+\/[a-z0-9-]+)@([0-9a-f]{40})$/);
      assert.ok(m, `${name}: unpinned or non-SHA uses: ${ref} (floating tags are forbidden)`);
      const pin = PINS[m[1]];
      assert.ok(pin, `${name}: unaudited action ${m[1]} — extend PINS with API provenance first`);
      assert.equal(m[2], pin.sha, `${name}: ${m[1]} SHA drift — a different commit is a behaviour change, re-audit`);
      assert.equal(comment, pin.version, `${name}: ${m[1]} must carry the human-readable version comment`);
    }
  }
  assert.equal(count, 16, "expected 16 uses: entries (ci 3, delivery 11, alert 2)");
});

// --- 4. Explicit least-privilege permissions everywhere --------------------
test("OPS12: explicit top-level permissions; only the alert job escalates; no write-all", () => {
  assert.deepEqual(topLevelPermissions(yml("ci.yml")), { contents: "read" });
  assert.deepEqual(topLevelPermissions(yml("delivery.yml")), { contents: "read", actions: "read" });
  assert.deepEqual(topLevelPermissions(yml("delivery-alert.yml")), { contents: "read" });
  for (const name of WORKFLOWS) {
    const text = yml(name);
    assert.ok(!/write-all/.test(text), `${name}: write-all is forbidden`);
    assert.ok(!/^permissions:\s*\{\s*\}/m.test(text), `${name}: empty permissions is not explicit`);
    for (const [job, block] of Object.entries(jobBlocks(text))) {
      const jp = jobPermissions(block);
      if (name === "delivery-alert.yml" && job === "alert") {
        assert.deepEqual(jp, { issues: "write", actions: "read" }, "alert escalation is exactly issues:write + actions:read");
      } else {
        assert.equal(jp, null, `${name}/${job}: unexpected job-level permissions — audit before granting`);
      }
      // No blanket write grant at job level either.
      if (jp && !jp.scalar) {
        for (const [scope, level] of Object.entries(jp)) {
          if (level === "write") assert.ok(name === "delivery-alert.yml" && job === "alert" && scope === "issues");
        }
      }
    }
  }
});

// --- 5. Privileged runner isolation ----------------------------------------
test("OPS12: exactly one self-hosted job (delivery/deploy); it never checks out or runs repo code", () => {
  let privileged = [];
  for (const name of WORKFLOWS) {
    for (const [job, block] of Object.entries(jobBlocks(yml(name)))) {
      if (block.includes("self-hosted")) privileged.push(`${name}/${job}`);
      else assert.match(block, /runs-on: ubuntu-latest/, `${name}/${job} must be GitHub-hosted`);
    }
  }
  assert.deepEqual(privileged, ["delivery.yml/deploy"]);
  const deploy = jobBlocks(yml("delivery.yml")).deploy;
  assert.match(deploy, /runs-on: \[self-hosted, Linux, X64, rustwake-deploy\]/);
  assert.match(deploy, /needs: package/);
  assert.match(deploy, /environment: rustwake-databrick/);
  assert.ok(!deploy.includes("actions/checkout"), "deploy must never checkout repository code");
  assert.ok(!/\brun:[^\n]*\bnpm\b/.test(deploy) && !deploy.includes("npm ci"), "deploy must never npm-install repo code");
  // The only execution is the host-owned adapter outside repo-writable paths.
  assert.match(deploy, /test -x \/opt\/rustwake-delivery\/deploy-artifact\.py/);
});

// --- 6. Package gate: exact expression, every clause load-bearing ----------
const EXPECTED_GATE = normalizeExpr(`
  (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') ||
  (vars.RUSTWAKE_CD_ENABLED == 'true' &&
  github.event.workflow_run.conclusion == 'success' &&
  github.event.workflow_run.event == 'push' &&
  github.event.workflow_run.head_branch == 'main' &&
  github.event.workflow_run.head_repository.full_name == github.repository)
`);

const packageGateExpr = () => {
  const pkg = jobBlocks(yml("delivery.yml")).package;
  const m = pkg.match(/if: >-\n((?: {6}[^\n]*\n)+)/);
  assert.ok(m, "package if: >- block present");
  return normalizeExpr(m[1]);
};

test("OPS12: package gate expression is EXACTLY the audited fail-closed predicate (incl. fork exclusion)", () => {
  assert.equal(packageGateExpr(), EXPECTED_GATE,
    "any gate edit (e.g. dropping head_repository.full_name == github.repository) must fail here and be re-audited");
});

// --- 7. Mirror truth table: PR/fork/unknown inputs fail closed --------------
// JS mirror of EXPECTED_GATE. Test 6 binds this mirror to the YAML by exact
// expression equality, so the table below proves the REAL gate's logic.
const packageGateAllows = (c) =>
  (c.event_name === "workflow_dispatch" && c.ref === "refs/heads/main") ||
  (c.cd_enabled === "true" &&
    c.conclusion === "success" &&
    c.event === "push" &&
    c.head_branch === "main" &&
    c.head_repository === c.repository);

test("OPS12: gate mirror truth table — fork PRs, PR events, non-main, disabled CD and unknown conclusions all fail closed", () => {
  const REPO = "darkmatter2222/Rustwake";
  const good = { event_name: "workflow_run", cd_enabled: "true", conclusion: "success", event: "push", head_branch: "main", head_repository: REPO, repository: REPO, ref: "refs/heads/main" };
  assert.equal(packageGateAllows(good), true, "legit main push delivery must still pass");
  assert.equal(packageGateAllows({ ...good, event_name: "workflow_dispatch" }), true, "dispatch on main must still pass");
  const negatives = [
    ["fork head repository", { ...good, head_repository: "attacker/Rustwake" }],
    ["fork head repository missing", { ...good, head_repository: undefined }],
    ["pull_request upstream event", { ...good, event: "pull_request" }],
    ["pull_request_target upstream event", { ...good, event: "pull_request_target" }],
    ["non-main head branch", { ...good, head_branch: "rw/evil" }],
    ["CD disabled", { ...good, cd_enabled: "false" }],
    ["CD unset", { ...good, cd_enabled: undefined }],
    ["conclusion failure", { ...good, conclusion: "failure" }],
    ["conclusion cancelled", { ...good, conclusion: "cancelled" }],
    ["conclusion timed_out", { ...good, conclusion: "timed_out" }],
    ["conclusion unknown future value", { ...good, conclusion: "some_future_unknown_value" }],
    ["conclusion null", { ...good, conclusion: null }],
    // Under workflow_dispatch there IS no workflow_run payload — every
    // github.event.workflow_run.* field is absent, so clause 2 cannot pass.
    ["dispatch on non-main ref", { event_name: "workflow_dispatch", ref: "refs/heads/rw/evil", cd_enabled: "true", repository: REPO }],
    ["workflow_run event_name with dispatch ref but fork repo", { ...good, head_repository: "attacker/Rustwake", ref: "refs/heads/main" }],
  ];
  for (const [name, ctx] of negatives) assert.equal(packageGateAllows(ctx), false, name);
  // Exhaustive sweep: every conclusion x event x branch x repo combination
  // except the two legit shapes must be false.
  const conclusions = ["success", "failure", "cancelled", "timed_out", "action_required", "stale", "skipped", "neutral", "unknown", null, undefined];
  const events = ["push", "pull_request", "pull_request_target", "schedule", "workflow_dispatch"];
  const branches = ["main", "rw/x", "default"];
  const repos = [REPO, "attacker/Rustwake", undefined];
  let allowed = 0, total = 0;
  for (const conclusion of conclusions) for (const event of events) for (const head_branch of branches) for (const head_repository of repos) for (const cd_enabled of ["true", "false", undefined]) {
    total++;
    const ok = packageGateAllows({ event_name: "workflow_run", conclusion, event, head_branch, head_repository, repository: REPO, cd_enabled, ref: "refs/heads/main" });
    if (ok) allowed++;
    if (ok) assert.ok(cd_enabled === "true" && conclusion === "success" && event === "push" && head_branch === "main" && head_repository === REPO);
  }
  assert.equal(total, 1485);
  assert.equal(allowed, 1, "exactly one workflow_run shape may pass the gate");
});

// --- 8. needs chain + no always() escape on privileged downstream jobs ------
test("OPS12: needs chain is exact and downstream jobs cannot run when package is skipped", () => {
  const jobs = jobBlocks(yml("delivery.yml"));
  assert.match(jobs.deploy, /^    needs: package\s*$/m);
  assert.match(jobs["verify-live"], /^    needs: \[package, deploy\]\s*$/m);
  assert.match(jobs["hosted-browser"], /^    needs: \[package, deploy, verify-live\]\s*$/m);
  for (const job of ["deploy", "verify-live", "hosted-browser"]) {
    assert.ok(!/^    if:/m.test(jobs[job]), `${job}: a job-level if (e.g. always()) could bypass the skipped-package fail-closed chain`);
  }
  // Concurrency: queued releases must not be cancelled or re-grouped.
  assert.match(yml("delivery.yml"), /concurrency:\n  group: rustwake-databrick-delivery\n  cancel-in-progress: false/);
  assert.match(yml("delivery-alert.yml"), /concurrency:\n  group: rustwake-delivery-alert\n  cancel-in-progress: false/);
});

// --- 9. No credential printing; secrets only via env: -----------------------
test("OPS12: no secret ever reaches a shell command line, log dump or xtrace", () => {
  for (const name of WORKFLOWS) {
    const text = yml(name);
    // Every secrets.* reference must be a whole-line env: mapping.
    for (const line of text.split("\n")) {
      if (line.includes("secrets.")) {
        assert.match(line, /^\s+[A-Z0-9_]+: \$\{\{ secrets\.[A-Z_]+ \}\}\s*$/, `${name}: secrets may only be passed as env: to a step — got: ${line.trim()}`);
      }
    }
    for (const payload of runPayloads(text)) {
      assert.ok(!/\bset -x\b|\bset -o xtrace\b/.test(payload), `${name}: xtrace would echo secrets`);
      assert.ok(!/\bprintenv\b/.test(payload), `${name}: printenv would dump secrets`);
      assert.ok(!/^\s*env\s*$/m.test(payload), `${name}: bare env dump would print secrets`);
      for (const line of payload.split("\n")) {
        if (/\b(echo|printf|cat)\b/.test(line)) {
          assert.ok(!/TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(line), `${name}: command prints a credential-bearing variable: ${line.trim()}`);
        }
      }
      assert.ok(!/\$\{\{/.test(payload), `${name}: expression interpolation inside run: is an injection/print risk — use env:`);
    }
  }
});

// --- 10. rm -rf audit: scoped, quoted, non-empty, inside runner.temp --------
test("OPS12: the only rm -rf is the quoted, --terminated, runner.temp-scoped candidate cleanup", () => {
  for (const name of WORKFLOWS) {
    const text = yml(name);
    const rms = [...text.matchAll(/rm -rf[^\n]*/g)].map((m) => m[0]);
    if (name !== "delivery.yml") assert.deepEqual(rms, [], `${name}: no rm -rf allowed`);
    else {
      assert.deepEqual(rms, ['rm -rf -- "$CANDIDATE"']);
      assert.match(text, /CANDIDATE: \$\{\{ runner\.temp \}\}\/rustwake-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
        "CANDIDATE is always a non-empty runner.temp-scoped path (runner.temp + literal prefix + run id + attempt)");
    }
  }
});

// --- 11. workflow_run checkout provenance -----------------------------------
test("OPS12: delivery checkouts bind to the validated immutable SHA; alert pins main; credentials not persisted", () => {
  const delivery = yml("delivery.yml");
  // The identity step validates the 40-hex shape before anything uses it.
  assert.match(delivery, /\[\[ "\$SOURCE_SHA" =~ \^\[a-f0-9\]\{40\}\$ \]\]/);
  assert.match(delivery, /SOURCE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
  const checkouts = [...delivery.matchAll(/- uses: actions\/checkout@[0-9a-f]{40} # v4\.4\.0\n {8}with:\n((?: {10}[^\n]*\n)+)/g)];
  assert.equal(checkouts.length, 3, "package, verify-live, hosted-browser each checkout once");
  for (const c of checkouts) {
    assert.match(c[1], /persist-credentials: false/);
    assert.ok(/ref: \$\{\{ steps\.identity\.outputs\.sha \}\}/.test(c[1]) || /ref: \$\{\{ needs\.package\.outputs\.source_sha \}\}/.test(c[1]),
      "delivery checkout must use the validated source SHA, never a mutable branch");
  }
  // House precedent (#549): the alert reads the run PAYLOAD, not the checkout,
  // so main HEAD is the correct script source even for pre-merge head_sha.
  const alert = yml("delivery-alert.yml");
  assert.match(alert, /checkout@[0-9a-f]{40} # v4\.4\.0\n\s+with:\n(?:[^\n]*\n)*?\s+ref: main/);
  assert.match(alert, /persist-credentials: false/);
});
