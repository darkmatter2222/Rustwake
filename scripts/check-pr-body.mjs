#!/usr/bin/env node
/**
 * check-pr-body.mjs — PR-body closing-verb hygiene audit (issue 587).
 *
 * GitHub's closing-keyword parser is context-free: a NEGATED sentence in a
 * PR description (for example "does NOT close #NNN") still auto-closes the
 * referenced issue when the PR lands on the default branch. This has fired
 * twice in this repository (issues 552 and 567, via PRs 582 and 573), both
 * times from a later body line while line 1 correctly said "Refs #NNN".
 * The same parser also reads commit messages.
 *
 * This CLI is READ-ONLY. It never edits a PR, never posts, never merges.
 *
 * Usage:
 *   node scripts/check-pr-body.mjs <body-file> [<body-file> ...]
 *   node scripts/check-pr-body.mjs --pr <number> [--pr <number> ...] [--repo <owner/name>]
 *   (file paths and --pr flags may be combined; each source is audited)
 *
 * Exit codes:
 *   0  every audited body is clean (zero hits)
 *   1  at least one closing-verb/issue-reference hit was found
 *   2  error: empty/whitespace-only body, unreadable file, failed fetch,
 *      or bad usage. An empty body is an ERROR, never a vacuous PASS.
 *
 * Predicate (case-insensitive, per line, every hit reported with its line
 * number and matched text):
 *   (close[sd]?|closing|fix(es|ed)?|resolve[sd]?|resolving)[[:space:]]*:?[[:space:]]*#[0-9]+
 *
 * KNOWN LIMITATION (disclosed deliberately): the predicate is lexical. It
 * does not model GitHub's full closing-keyword grammar (for example keyword
 * lists, cross-repository references, or markdown emphasis between the verb
 * and the reference). It is a CONSERVATIVE SUPERSET for the studio's
 * convention: it may flag prose GitHub would not act on, and that is the
 * safe direction. A hit blocks the merge until the wording is fixed or
 * product explicitly owns the closure. "Refs #NNN" and bare "issue NNN"
 * (no #) are clean.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const DEFAULT_REPO = "darkmatter2222/Rustwake";

/** POSIX form of the predicate, kept identical to the documented grep. */
export const PATTERN_POSIX =
  "(close[sd]?|closing|fix(es|ed)?|resolve[sd]?|resolving)[[:space:]]*:?[[:space:]]*#[0-9]+";

/** JS translation of PATTERN_POSIX ([[:space:]] -> \s). */
const HIT_PATTERN = /(close[sd]?|closing|fix(es|ed)?|resolve[sd]?|resolving)\s*:?\s*#[0-9]+/gi;

/**
 * Scan a body string. Returns { empty, hits } where hits is an array of
 * { line, text } (1-based line numbers, exact matched text). An empty or
 * whitespace-only body sets empty=true so callers can reject it as an error
 * instead of scoring a vacuous pass.
 */
export function scanBody(body) {
  if (typeof body !== "string" || body.trim() === "") {
    return { empty: true, hits: [] };
  }
  const hits = [];
  const lines = body.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(HIT_PATTERN)) {
      hits.push({ line: i + 1, text: m[0] });
    }
  }
  return { empty: false, hits };
}

/** Fetch a PR body read-only via gh. Throws on any failure. */
export function fetchPrBody(prNumber, repo = DEFAULT_REPO) {
  if (!/^[0-9]+$/.test(String(prNumber))) {
    throw new Error(`invalid PR number: ${prNumber}`);
  }
  const r = spawnSync(
    "gh",
    ["api", `repos/${repo}/pulls/${prNumber}`, "--jq", ".body"],
    { encoding: "utf8" }
  );
  if (r.error) throw new Error(`gh invocation failed: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`gh api failed (exit ${r.status}): ${(r.stderr || "").trim()}`);
  }
  const out = r.stdout ?? "";
  // `--jq .body` prints the literal string "null" for a PR with no body.
  if (out.trim() === "null") return "";
  return out;
}

const USAGE = `check-pr-body.mjs — read-only PR-body closing-verb hygiene audit (issue 587)

usage:
  node scripts/check-pr-body.mjs <body-file> [<body-file> ...]
  node scripts/check-pr-body.mjs --pr <number> [--pr <number> ...] [--repo <owner/name>]

predicate (case-insensitive): ${PATTERN_POSIX}
exit codes: 0 clean | 1 hits found | 2 error (empty body, unreadable file, failed fetch, bad usage)

An empty or whitespace-only body is an ERROR, not a pass.
Known limitation: the predicate is lexical and does not model GitHub's full
grammar (e.g. keyword lists). It is a conservative superset for the studio's
convention — it may flag prose GitHub would not act on, and that is the safe
direction. The same parser reads commit messages; audit those too.`;

function parseArgs(argv) {
  const files = [];
  const prs = [];
  let repo = DEFAULT_REPO;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--pr") {
      const n = argv[++i];
      if (n === undefined) throw new Error("--pr requires a number");
      prs.push(n);
    } else if (a === "--repo") {
      const r = argv[++i];
      if (r === undefined || !/^[\w.-]+\/[\w.-]+$/.test(r)) {
        throw new Error("--repo requires owner/name");
      }
      repo = r;
    } else if (a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    else files.push(a);
  }
  return { files, prs, repo, help };
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    console.error(`check-pr-body: ERROR — ${e.message}`);
    console.error(USAGE);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (opts.files.length === 0 && opts.prs.length === 0) {
    console.error("check-pr-body: ERROR — no body source given (pass a file path and/or --pr <number>)");
    console.error(USAGE);
    return 2;
  }

  const sources = [
    ...opts.files.map((f) => ({ label: `file ${f}`, load: () => fs.readFileSync(path.resolve(f), "utf8") })),
    ...opts.prs.map((n) => ({ label: `PR #${n}`, load: () => fetchPrBody(n, opts.repo) })),
  ];

  let totalHits = 0;
  let errors = 0;
  for (const s of sources) {
    let body;
    try {
      body = s.load();
    } catch (e) {
      errors++;
      console.log(`check-pr-body: ERROR ${s.label} — ${e.message}`);
      continue;
    }
    const { empty, hits } = scanBody(body);
    if (empty) {
      errors++;
      console.log(`check-pr-body: ERROR ${s.label} — empty or whitespace-only body; an empty-vs-empty check is a vacuous PASS and is rejected`);
      continue;
    }
    totalHits += hits.length;
    for (const h of hits) {
      console.log(`  ${s.label} line ${h.line}: ${h.text}`);
    }
    if (hits.length === 0) {
      console.log(`check-pr-body: PASS ${s.label} — 0 hits`);
    } else {
      console.log(`check-pr-body: FAIL ${s.label} — ${hits.length} hit(s)`);
    }
  }
  const code = errors > 0 ? 2 : totalHits > 0 ? 1 : 0;
  console.log(`check-pr-body: ${sources.length} source(s), ${totalHits} hit(s), ${errors} error(s) — exit ${code}`);
  return code;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  process.exitCode = main(process.argv.slice(2));
}
