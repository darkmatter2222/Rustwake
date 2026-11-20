/**
 * Falsifiable tests for scripts/check-pr-body.mjs (issue 587).
 *
 * The two HISTORICAL_* constants below are the REAL offending PR-body lines
 * recorded verbatim in issue 587. They are safe inside a tracked source
 * file: GitHub's closing-keyword parser reads PR descriptions and commit
 * messages, not file contents. They must NEVER be quoted in a PR body or a
 * commit message — doing so would auto-close issues 552 and 567 on merge.
 *
 * Every test asserts actual values: real exit codes, real hit counts, real
 * line numbers. A guard that cannot fail is not a guard.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanBody, PATTERN_POSIX } from "../scripts/check-pr-body.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/check-pr-body.mjs", import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rw-prbody-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let fixtureSeq = 0;
function fixture(content) {
  const p = path.join(TMP, `body-${++fixtureSeq}.txt`);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

/** Run the real CLI and return { status, stdout, stderr }. */
function run(...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  assert.equal(r.error, undefined, `CLI failed to spawn: ${r.error}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Verbatim historical offending lines from issue 587 (tracked-file-safe only).
const HISTORICAL_567 =
  "- [ ] Product closes #567 on C3 deployed-SHA content evidence (not at merge)";
const HISTORICAL_552 =
  "Evidence-only PR — no src/ changes, no GAPS.md changes, does NOT close #552 (product rules on the evidence).";

const filler = (n) => `plain prose line ${n} with no issue reference`;

test("historical issue-567 checklist line at body line 97 is REJECTED with line number 97", () => {
  const lines = ["Refs #573"];
  for (let i = 2; i <= 96; i++) lines.push(filler(i));
  lines.push(HISTORICAL_567); // line 97, exactly as in PR 573
  const body = lines.join("\n");
  const r = run(fixture(body));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /line 97: closes #567/);
  assert.match(r.stdout, /FAIL .* — 1 hit\(s\)/);
  const scan = scanBody(body);
  assert.equal(scan.empty, false);
  assert.equal(scan.hits.length, 1);
  assert.equal(scan.hits[0].line, 97);
  assert.equal(scan.hits[0].text, "closes #567");
});

test("historical issue-552 evidence-only line at body line 4 is REJECTED with line number 4", () => {
  const body = ["Refs #552", filler(2), filler(3), HISTORICAL_552].join("\n");
  const r = run(fixture(body));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /line 4: close #552/);
  const scan = scanBody(body);
  assert.equal(scan.hits.length, 1);
  assert.equal(scan.hits[0].line, 4);
  assert.equal(scan.hits[0].text, "close #552");
});

test("negation does not save you: negated closing verbs adjacent to references are REJECTED", () => {
  const body = "Refs #587\nThis PR does NOT close #552 and will not fix #567.\n";
  const r = run(fixture(body));
  assert.equal(r.status, 1);
  const scan = scanBody(body);
  assert.equal(scan.hits.length, 2);
  assert.deepEqual(scan.hits.map((h) => h.line), [2, 2]);
  assert.deepEqual(scan.hits.map((h) => h.text), ["close #552", "fix #567"]);
});

const DIRTY_FORMS = [
  ["plain close", "close #12"],
  ["plain closes", "closes #12"],
  ["plain closed", "closed #12"],
  ["closing form", "closing #12"],
  ["plain fix", "fix #12"],
  ["plain fixes", "fixes #12"],
  ["plain fixed", "fixed #12"],
  ["plain resolve", "resolve #12"],
  ["plain resolves", "resolves #12"],
  ["plain resolved", "resolved #12"],
  ["resolving form", "resolving #12"],
  ["colon form", "closes: #12"],
  ["colon form with space before colon", "fixes : #12"],
  ["uppercase Fixes", "Fixes #12"],
  ["uppercase CLOSES", "CLOSES #12"],
  ["mixed case ReSoLvEs", "ReSoLvEs #12"],
  ["checklist form", "- [ ] product closes #12 on deployed evidence"],
  ["no space before reference", "closes#12"],
  ["tab between verb and reference", "closes\t#12"],
];
for (const [name, line] of DIRTY_FORMS) {
  test(`dirty form REJECTED: ${name}`, () => {
    const body = `Refs #587\n${line}\n`;
    const r = run(fixture(body));
    assert.equal(r.status, 1, `expected exit 1 for: ${line}`);
    const scan = scanBody(body);
    assert.equal(scan.hits.length, 1);
    assert.equal(scan.hits[0].line, 2);
    assert.match(r.stdout, /line 2: /);
  });
}

const CLEAN_BODIES = [
  ["Refs on line 1", "Refs #596\n"],
  ["issue NNN without hash stays OPEN", "issue 552 stays OPEN\n"],
  ["no issue reference at all", "This body talks about the yard and nothing else.\n"],
  [
    "mixed clean conventions",
    "Refs #587\n\nissue 552 stays OPEN until product rules.\nSee PR #582 for history.\n",
  ],
  ["commit-style parenthesized subject", "fix(567): fair output dispatch (#573)\n"],
];
for (const [name, body] of CLEAN_BODIES) {
  test(`clean form ACCEPTED with exit 0: ${name}`, () => {
    const r = run(fixture(body));
    assert.equal(r.status, 0, `expected exit 0 for: ${JSON.stringify(body)}`);
    assert.match(r.stdout, /PASS .* — 0 hits/);
    assert.equal(scanBody(body).hits.length, 0);
  });
}

test("non-vacuity: the guard can FAIL — dirty and clean fixtures produce different exit codes", () => {
  const dirty = run(fixture("Refs #587\n- [ ] later, product closes #567 on evidence\n"));
  const clean = run(fixture("Refs #587\nissue 567 stays OPEN\n"));
  assert.equal(dirty.status, 1);
  assert.equal(clean.status, 0);
  assert.notEqual(dirty.status, clean.status);
});

test("empty body is an ERROR (exit 2), never a vacuous pass", () => {
  const r = run(fixture(""));
  assert.equal(r.status, 2);
  assert.match(r.stdout, /ERROR .*empty or whitespace-only body/);
  assert.match(r.stdout, /vacuous PASS/);
  assert.equal(scanBody("").empty, true);
});

test("whitespace-only body is an ERROR (exit 2), never a vacuous pass", () => {
  const r = run(fixture("  \n\t\n   \n"));
  assert.equal(r.status, 2);
  assert.match(r.stdout, /ERROR .*empty or whitespace-only body/);
  assert.equal(scanBody(" \t\n").empty, true);
});

test("line numbers are correct when line 1 is clean and line 5 is dirty", () => {
  const body = ["Refs #587", filler(2), filler(3), filler(4), "closes #123"].join("\n");
  const r = run(fixture(body));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /line 5: closes #123/);
  assert.doesNotMatch(r.stdout, /line 1: /);
  const scan = scanBody(body);
  assert.equal(scan.hits.length, 1);
  assert.equal(scan.hits[0].line, 5);
});

test("multiple hits on one line are all reported with that line number", () => {
  const body = "Refs #587\nfixes #1 and resolves #2\n";
  const r = run(fixture(body));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /— 2 hit\(s\)/);
  const scan = scanBody(body);
  assert.deepEqual(scan.hits, [
    { line: 2, text: "fixes #1" },
    { line: 2, text: "resolves #2" },
  ]);
});

test("CRLF line endings still yield correct line numbers", () => {
  const body = "Refs #587\r\nplain line\r\ncloses #12\r\n";
  const r = run(fixture(body));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /line 3: closes #12/);
  assert.equal(scanBody(body).hits[0].line, 3);
});

test("multiple sources are aggregated: one dirty file makes the whole run fail", () => {
  const cleanPath = fixture("Refs #587\nissue 552 stays OPEN\n");
  const dirtyPath = fixture("Refs #587\nwill not resolve #567\n");
  const r = run(cleanPath, dirtyPath);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PASS /);
  assert.match(r.stdout, /FAIL /);
  assert.match(r.stdout, /2 source\(s\), 1 hit\(s\), 0 error\(s\) — exit 1/);
});

test("missing file is an ERROR (exit 2), not a pass", () => {
  const r = run(path.join(TMP, "does-not-exist.txt"));
  assert.equal(r.status, 2);
  assert.match(r.stdout, /ERROR /);
});

test("no arguments is a usage ERROR (exit 2)", () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no body source given/);
});

test("invalid --pr number is a usage ERROR (exit 2) without any network call", () => {
  const r = run("--pr", "not-a-number");
  assert.equal(r.status, 2);
  assert.match(r.stdout, /invalid PR number/);
});

test("--help exits 0 and discloses the lexical conservative-superset limitation", () => {
  const r = run("--help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /conservative superset/);
  assert.match(r.stdout, /lexical/);
  assert.match(r.stdout, /commit messages/);
  assert.ok(r.stdout.includes(PATTERN_POSIX));
});

test("exported POSIX predicate is the studio's full documented form", () => {
  assert.equal(
    PATTERN_POSIX,
    "(close[sd]?|closing|fix(es|ed)?|resolve[sd]?|resolving)[[:space:]]*:?[[:space:]]*#[0-9]+"
  );
});
