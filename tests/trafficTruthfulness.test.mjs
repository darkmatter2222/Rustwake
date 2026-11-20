// Regression gate for issue #598: two truthfulness residues in the traffic module.
// Reads the ACTUAL source from disk and asserts the defects cannot return:
//   1. no unqualified deadlock-free / acyclic claim in src/traffic.js,
//   2. no reference presenting the dead hasPriority helper as operative,
//   3. the laneRoute docstring range derives from LANE_OFFSET_CELLS (no drift).
// Each assertion helper is ALSO fed the original defective text (negative
// controls) and must REJECT it — a check that passes on both the fixed and the
// broken input is vacuous and is not evidence.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {LANE_OFFSET_CELLS} from "../src/traffic.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// --- helpers (shared by the positive tests and the negative controls) ---

// Join comment lines into flowing prose, then split into sentences. A sentence
// asserting "deadlock-free"/"deadlock-freedom" must carry an explicit negation
// (NOT / never); a sentence asserting "acyclic" must be scoped to same-direction
// following. The exact false phrasing of the old header is rejected outright.
function unqualifiedDeadlockClaims(text) {
  const prose = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\/\/\s?/, ""))
    .join(" ");
  const sentences = prose.split(/(?<=[.;])\s+/);
  const violations = [];
  if (/is what makes the wait-for relation deadlock-free/i.test(prose)) {
    violations.push("false header phrasing: 'is what makes the wait-for relation deadlock-free'");
  }
  for (const s of sentences) {
    if (/deadlock-free|deadlock-freedom/i.test(s) && !/\bnot\b|\bnever\b/i.test(s)) {
      violations.push("unqualified deadlock-freedom claim: " + s.trim());
    }
    if (/\bacyclic\b/i.test(s) && !/same-direction/i.test(s)) {
      violations.push("unscoped acyclicity claim: " + s.trim());
    }
  }
  return violations;
}

// The discharge for scope item 2 is ZERO references in these two files: the
// helper was never called, so any surviving mention (operative or not) fails.
function hasPriorityRefs(text) {
  return text.split(/\r?\n/).filter((l) => /hasPriority/.test(l));
}

// The laneRoute docstring must state its range as derived from the constant:
// "L=LANE_OFFSET_CELLS=<L> -> <1-2L> .. <1+2L>". Expected numbers are COMPUTED
// from the imported constant, so this check cannot drift with the code.
function laneRangeDrift(text, L) {
  const round6 = (x) => Number(x.toFixed(6));
  const m = text.match(/L=LANE_OFFSET_CELLS=([0-9.]+) -> ([0-9.]+) \.\. ([0-9.]+)/);
  if (!m) return ["laneRoute docstring does not derive its range from LANE_OFFSET_CELLS"];
  const violations = [];
  const lo = round6(1 - 2 * L), hi = round6(1 + 2 * L);
  if (Number(m[1]) !== L) violations.push(`docstring L=${m[1]} != LANE_OFFSET_CELLS=${L}`);
  if (Number(m[2]) !== lo) violations.push(`docstring lower ${m[2]} != 1-2L = ${lo}`);
  if (Number(m[3]) !== hi) violations.push(`docstring upper ${m[3]} != 1+2L = ${hi}`);
  return violations;
}

// --- the ORIGINAL defective texts, verbatim from base 1617877f (controls) ---

const OLD_FALSE_HEADER = [
  "//   2. Forward-only yielding with a deterministic id tie-break. A truck yields",
  "//      only to a truck AHEAD of it along its own heading (dot > 0). When two",
  "//      trucks are mutually ahead (head-on / crossing) or exactly side-by-side,",
  "//      the LOWER vehicle id has right of way. Following edges run downstream",
  "//      along a lane (acyclic); mutual conflicts are totally ordered by id; and",
  "//      head-on pairs never conflict at all because the lanes separate them. That",
  "//      is what makes the wait-for relation deadlock-free on the starter network."
].join("\n");

const OLD_DEAD_HELPER_COMMENT = [
  "  // #589: deterministic ascending-id motion order. Right-of-way tie-breaks are",
  "  // already id-based (traffic.hasPriority); processing lowest id first makes the",
  "  // queue attribution and resume order reproducible run-to-run and save/reload."
].join("\n");

const OLD_STALE_DOCSTRING =
  "// positive (1-2L .. 1+2L with L=0.25 -> 0.5 .. 1.5) so progress is well defined.";

// --- positive tests: the actual source on disk must be clean ---

test("598 truthfulness: traffic.js carries no unqualified deadlock-free or acyclic claim", () => {
  const src = readSrc("src/traffic.js");
  assert.ok(src.length > 0, "src/traffic.js must be non-empty");
  assert.deepEqual(unqualifiedDeadlockClaims(src), []);
});

test("598 truthfulness: traffic header names the crossing-cycle limit and load-bearing recovery", () => {
  const src = readSrc("src/traffic.js");
  assert.ok(src.length > 0, "src/traffic.js must be non-empty");
  assert.match(src, /same-direction following/i);
  assert.match(src, /perpendicular crossing/i);
  assert.match(src, /load-bearing/i);
  // The design doc already carried the corrected argument; the header must agree.
  const doc = readSrc("docs/design/TRAFFIC.md");
  assert.ok(doc.length > 0, "docs/design/TRAFFIC.md must be non-empty");
  assert.match(doc, /deadlock argument was FALSE/i);
});

test("598 truthfulness: simulation motion-order comment names the ordered current-envelope clamp", () => {
  const src = readSrc("src/simulation.js");
  assert.ok(src.length > 0, "src/simulation.js must be non-empty");
  assert.match(src, /ascending-id ordered current-envelope clamp/);
  assert.match(src, /traffic\.separationClamp/);
});

test("598 truthfulness: dead hasPriority helper is gone from traffic.js and simulation.js", () => {
  const traffic = readSrc("src/traffic.js");
  const simulation = readSrc("src/simulation.js");
  assert.ok(traffic.length > 0 && simulation.length > 0, "inputs must be non-empty");
  assert.deepEqual(hasPriorityRefs(traffic), []);
  assert.deepEqual(hasPriorityRefs(simulation), []);
});

test("598 truthfulness: laneRoute docstring range matches LANE_OFFSET_CELLS", () => {
  const src = readSrc("src/traffic.js");
  assert.ok(src.length > 0, "src/traffic.js must be non-empty");
  assert.ok(Number.isFinite(LANE_OFFSET_CELLS) && LANE_OFFSET_CELLS > 0);
  assert.deepEqual(laneRangeDrift(src, LANE_OFFSET_CELLS), []);
});

// --- negative controls: the SAME helpers must REJECT the original defects ---

test("598 negative control: the OLD false deadlock-free header is REJECTED", () => {
  assert.ok(OLD_FALSE_HEADER.length > 0, "control input must be non-empty");
  const violations = unqualifiedDeadlockClaims(OLD_FALSE_HEADER);
  assert.ok(violations.length >= 2, "old header must trip both the false-phrasing and unscoped-acyclic checks");
  assert.ok(violations.some((v) => v.includes("is what makes the wait-for relation deadlock-free")));
  assert.ok(violations.some((v) => v.startsWith("unscoped acyclicity claim")));
});

test("598 negative control: the OLD hasPriority-as-operative comment is REJECTED", () => {
  assert.ok(OLD_DEAD_HELPER_COMMENT.length > 0, "control input must be non-empty");
  const refs = hasPriorityRefs(OLD_DEAD_HELPER_COMMENT);
  assert.equal(refs.length, 1);
  assert.match(refs[0], /traffic\.hasPriority/);
});

test("598 negative control: the stale L=0.25 laneRoute docstring is REJECTED", () => {
  assert.ok(OLD_STALE_DOCSTRING.length > 0, "control input must be non-empty");
  const violations = laneRangeDrift(OLD_STALE_DOCSTRING, LANE_OFFSET_CELLS);
  assert.ok(violations.length > 0, "stale 0.25/0.5..1.5 docstring must be rejected against the live constant");
});