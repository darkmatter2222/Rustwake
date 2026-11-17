import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLedger, scanArtifacts, groupBursts } from "../scripts/verify-session-ledger.mjs";

const read = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8"));
const roles = read("docs/agents/roles.json");
const PRIMARY = "440610df-1273-4137-b6e2-ea5bd9bd70c8";
const T = (s) => `2026-11-17T12:${String(s).padStart(2, "0")}:00.000Z`;

const codes = (r) => [...new Set(r.violations.map((v) => v.code))].sort();

function base() {
  return {
    schema: "rustwake.session-ledger.v1",
    window: { from: T(0), to: T(30) },
    coordinator_session: PRIMARY,
    sessions: [
      { id: PRIMARY, role: "coordinator", kind: "primary", spawned_by: null, started_at: T(0), finished_at: null, status: "running", outcome: null, leases: [], browser: false },
    ],
  };
}

function child(i, over = {}) {
  return {
    id: `child-${i}`,
    role: "developer",
    kind: "child",
    spawned_by: PRIMARY,
    started_at: T(i),
    finished_at: null,
    status: "running",
    outcome: null,
    leases: [],
    browser: false,
    ...over,
  };
}

function withChildren(n, over) {
  const l = base();
  for (let i = 1; i <= n; i++) l.sessions.push(child(i, typeof over === "function" ? over(i) : over));
  return l;
}

test("roles.json still declares the five-session / four-child contract", () => {
  assert.equal(roles.max_model_sessions, 5);
  assert.equal(roles.max_children, 4);
  assert.equal(roles.primary, "coordinator");
});

test("the committed OPS-04 pass receipt validates at the measured peaks", () => {
  const r = validateLedger(read("docs/operations/receipts/328-runtime-ledger-e82caa52-pass.json"), roles);
  assert.deepEqual(r.violations, []);
  assert.equal(r.ok, true);
  assert.equal(r.peak_children, 3);
  assert.equal(r.peak_sessions, 4);
});

test("the committed OPS-04 negative receipt fails closed with every promised code", () => {
  const ledger = read("docs/operations/receipts/328-runtime-ledger-negative-overcap.json");
  const r = validateLedger(ledger, roles);
  assert.equal(r.ok, false);
  for (const code of ledger.expected_violations) assert.ok(codes(r).includes(code), `missing ${code}`);
});

test("four children plus the coordinator is exactly at cap and passes", () => {
  const r = validateLedger(withChildren(4), roles);
  assert.deepEqual(r.violations, []);
  assert.equal(r.peak_children, 4);
  assert.equal(r.peak_sessions, 5);
});

test("a fifth concurrent child trips both the child and session caps", () => {
  const r = validateLedger(withChildren(5), roles);
  assert.ok(codes(r).includes("E_CHILD_CAP"));
  assert.ok(codes(r).includes("E_SESSION_CAP"));
  assert.equal(r.peak_children, 5);
  assert.equal(r.peak_sessions, 6);
});

test("the cap is concurrency, not lifetime total: eight sequential children pass", () => {
  const l = base();
  for (let i = 1; i <= 8; i++) {
    l.sessions.push(child(i, { started_at: T(i), finished_at: T(i + 1), status: "finished", outcome: "done" }));
  }
  l.window.to = T(20);
  const r = validateLedger(l, roles);
  assert.deepEqual(r.violations, []);
  assert.equal(r.peak_children, 1);
});

test("a duplicate coordinator is rejected", () => {
  const l = base();
  l.sessions.push({ ...l.sessions[0], id: "second-coordinator", started_at: T(1) });
  assert.ok(codes(validateLedger(l, roles)).includes("E_PRIMARY_COUNT"));
});

test("no coordinator is rejected", () => {
  const l = base();
  l.sessions = [child(1)];
  const c = codes(validateLedger(l, roles));
  assert.ok(c.includes("E_PRIMARY_COUNT"));
  assert.ok(c.includes("E_RECURSIVE_SPAWN"));
});

test("a primary that is not the coordinator role is rejected", () => {
  const l = base();
  l.sessions[0].role = "developer";
  assert.ok(codes(validateLedger(l, roles)).includes("E_PRIMARY_ROLE"));
});

test("a fabricated role absent from roles.json is rejected", () => {
  const l = withChildren(1);
  l.sessions[1].role = "foreman";
  assert.ok(codes(validateLedger(l, roles)).includes("E_UNKNOWN_ROLE"));
});

test("a child with no start clock is rejected", () => {
  const l = withChildren(1);
  delete l.sessions[1].started_at;
  assert.ok(codes(validateLedger(l, roles)).includes("E_NO_START"));
});

test("a child spawned by another child is a recursive spawn", () => {
  const l = withChildren(2);
  l.sessions[2].spawned_by = l.sessions[1].id;
  assert.ok(codes(validateLedger(l, roles)).includes("E_RECURSIVE_SPAWN"));
});

test("a finished child with no finish record is rejected", () => {
  const l = withChildren(1);
  l.sessions[1].status = "finished";
  assert.ok(codes(validateLedger(l, roles)).includes("E_NO_FINISH"));
});

test("a finished child with a finish clock but no outcome is rejected", () => {
  const l = withChildren(1);
  Object.assign(l.sessions[1], { status: "finished", finished_at: T(5) });
  assert.ok(codes(validateLedger(l, roles)).includes("E_NO_FINISH"));
});

test("a running child carrying a finish clock is a status contradiction", () => {
  const l = withChildren(1);
  l.sessions[1].finished_at = T(5);
  assert.ok(codes(validateLedger(l, roles)).includes("E_STATUS_CONTRADICTION"));
});

test("a finish before the start is rejected", () => {
  const l = withChildren(1);
  Object.assign(l.sessions[1], { status: "finished", finished_at: T(0), outcome: "done", started_at: T(5) });
  assert.ok(codes(validateLedger(l, roles)).includes("E_TIME_ORDER"));
});

test("two simultaneous browser holders are rejected", () => {
  const r = validateLedger(withChildren(2, { browser: true }), roles);
  assert.ok(codes(r).includes("E_BROWSER_MULTIPLE"));
});

test("one browser holder passes", () => {
  const l = withChildren(2);
  l.sessions[1].browser = true;
  assert.deepEqual(validateLedger(l, roles).violations, []);
});

test("two simultaneous release engineers are rejected", () => {
  const r = validateLedger(withChildren(2, { role: "release-engineer" }), roles);
  assert.ok(codes(r).includes("E_RELEASE_MULTIPLE"));
});

test("two writers on one src lease are rejected", () => {
  const r = validateLedger(withChildren(2, { leases: ["src/App.jsx"] }), roles);
  assert.ok(codes(r).includes("E_LEASE_CONFLICT"));
});

test("disjoint src leases pass", () => {
  const l = withChildren(2);
  l.sessions[1].leases = ["src/App.jsx"];
  l.sessions[2].leases = ["src/content.js"];
  assert.deepEqual(validateLedger(l, roles).violations, []);
});

test("the same lease held sequentially by two developers passes", () => {
  const l = base();
  l.sessions.push(child(1, { started_at: T(1), finished_at: T(2), status: "finished", outcome: "done", leases: ["src/App.jsx"] }));
  l.sessions.push(child(2, { started_at: T(3), finished_at: T(4), status: "finished", outcome: "done", leases: ["src/App.jsx"] }));
  assert.deepEqual(validateLedger(l, roles).violations, []);
});

test("a dispatch burst over cap is rejected even when the sessions are not all live", () => {
  const l = base();
  l.dispatch_bursts = [{ at: T(1), ids: ["a", "b", "c", "d", "e"] }];
  assert.ok(codes(validateLedger(l, roles)).includes("E_DISPATCH_BURST"));
});

test("groupBursts groups within the window and splits outside it", () => {
  const rows = (offsets) => offsets.map((ms, i) => ({ id: `c${i}`, started_at: new Date(Date.parse(T(0)) + ms).toISOString() }));
  assert.equal(groupBursts(rows([0, 500, 1000, 1500])).length, 1);
  assert.equal(groupBursts(rows([0, 500, 1000, 1500]))[0].ids.length, 4);
  const split = groupBursts(rows([0, 5000, 10000, 15000, 20000]));
  assert.equal(split.length, 5);
  assert.equal(Math.max(...split.map((b) => b.ids.length)), 1);
});

test("groupBursts sorts unsorted input before grouping", () => {
  const at = (ms) => new Date(Date.parse(T(0)) + ms).toISOString();
  const bursts = groupBursts([{ id: "late", started_at: at(1000) }, { id: "early", started_at: at(0) }]);
  assert.equal(bursts.length, 1);
  assert.deepEqual(bursts[0].ids, ["early", "late"]);
});

test("scanArtifacts counts only agent-shaped ids and reports zero-byte artifacts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rw-ledger-"));
  try {
    for (const n of ["aaceb00b9092592a2.output", "a7a0568b542c307c6.output", "affaa3a5fb522634f.output"]) {
      fs.writeFileSync(path.join(dir, n), "");
    }
    fs.writeFileSync(path.join(dir, "b1234abcd.output"), "");
    fs.writeFileSync(path.join(dir, "notes.json"), "{}");
    fs.writeFileSync(path.join(dir, "aaceb00b9092592a2.json"), "{}");
    const c = scanArtifacts(dir, PRIMARY);
    assert.equal(c.artifact_count, 3);
    assert.equal(c.zero_byte_count, 3);
    assert.equal(c.primary_id, PRIMARY);
    assert.ok(c.max_burst >= 1 && c.max_burst <= 3);
    assert.ok(c.bursts.every((b) => b.ids.every((id) => /^[0-9a-f]{17}$/.test(id))));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the committed dispatch census never exceeds the child cap and is internally consistent", () => {
  const census = read("docs/operations/receipts/328-dispatch-census-e82caa52.json");
  const ledger = read("docs/operations/receipts/328-runtime-ledger-e82caa52-pass.json");
  assert.ok(census.artifact_count > 0);
  assert.equal(census.bursts.reduce((n, b) => n + b.ids.length, 0), census.artifact_count);
  assert.equal(census.max_burst, Math.max(...census.bursts.map((b) => b.ids.length)));
  assert.ok(census.max_burst <= roles.max_children);
  assert.equal(census.primary_id, ledger.coordinator_session);
  assert.deepEqual(
    { artifact_count: census.artifact_count, zero_byte_count: census.zero_byte_count, max_burst: census.max_burst, bursts: census.bursts.length },
    { artifact_count: ledger.dispatch_census.artifact_count, zero_byte_count: ledger.dispatch_census.zero_byte_count, max_burst: ledger.dispatch_census.max_burst, bursts: ledger.dispatch_census.bursts },
  );
  const hist = Object.entries(ledger.dispatch_census.burst_size_histogram).reduce((n, [size, count]) => n + Number(size) * count, 0);
  assert.equal(hist, census.artifact_count);
});

test("every child in the pass receipt is accounted for by a census artifact", () => {
  const census = read("docs/operations/receipts/328-dispatch-census-e82caa52.json");
  const ledger = read("docs/operations/receipts/328-runtime-ledger-e82caa52-pass.json");
  const seen = new Set(census.bursts.flatMap((b) => b.ids));
  for (const s of ledger.sessions.filter((x) => x.kind === "child")) {
    assert.ok(seen.has(s.id), `${s.id} has no dispatch artifact`);
    assert.equal(s.spawned_by, ledger.coordinator_session);
  }
});

const clone = (o) => JSON.parse(JSON.stringify(o));
const realPair = () => ({
  census: read("docs/operations/receipts/328-dispatch-census-e82caa52.json"),
  ledger: read("docs/operations/receipts/328-runtime-ledger-e82caa52-pass.json"),
});

test("groupBursts records first_at as the earliest dispatch and at as the latest", () => {
  const at = (ms) => new Date(Date.parse(T(0)) + ms).toISOString();
  const [b] = groupBursts([{ id: "b", started_at: at(1500) }, { id: "a", started_at: at(0) }]);
  assert.equal(b.first_at, at(0));
  assert.equal(b.at, at(1500));
});

test("the committed pass receipt survives the census cross-check", () => {
  const { census, ledger } = realPair();
  const r = validateLedger(ledger, roles, census);
  assert.deepEqual(r.violations, []);
  assert.equal(r.ok, true);
});

test("omitting a child the census shows was dispatched inside the window is rejected", () => {
  const { census, ledger } = realPair();
  const dropped = "a69124e830650b810";
  assert.ok(ledger.sessions.some((s) => s.id === dropped));
  ledger.sessions = ledger.sessions.filter((s) => s.id !== dropped);
  assert.deepEqual(validateLedger(ledger, roles).violations, [], "without a census the omission is invisible");
  const r = validateLedger(ledger, roles, census);
  assert.ok(codes(r).includes("E_UNDOCUMENTED_CHILD"));
  assert.ok(r.violations.some((v) => v.code === "E_UNDOCUMENTED_CHILD" && v.detail.includes(dropped)));
});

test("a documented child with no dispatch artifact anywhere in the census is rejected", () => {
  const { census, ledger } = realPair();
  const phantom = clone(ledger.sessions.find((s) => s.id === "a69124e830650b810"));
  phantom.id = "fffffffffffffffff";
  phantom.leases = [];
  phantom.browser = false;
  ledger.sessions.push(phantom);
  const r = validateLedger(ledger, roles, census);
  assert.ok(codes(r).includes("E_NO_DISPATCH_ARTIFACT"));
  assert.ok(r.violations.some((v) => v.code === "E_NO_DISPATCH_ARTIFACT" && v.detail.includes(phantom.id)));
});

test("artifacts dispatched outside the ledger window are not claimed as children of this ledger", () => {
  const { census, ledger } = realPair();
  const keep = new Set([ledger.coordinator_session, "a9ec0494c2d539dc3", "abe14b6fae88cd389"]);
  ledger.sessions = ledger.sessions.filter((s) => keep.has(s.id));
  ledger.window = { from: "2026-11-17T19:22:00.000Z", to: "2026-11-17T19:28:30.000Z" };
  const r = validateLedger(ledger, roles, census);
  assert.deepEqual(r.violations, []);
  assert.ok(census.artifact_count > ledger.sessions.length, "the census really is broader than this window");
});

function miniCensus(bursts) {
  const ids = bursts.flatMap((b) => b.ids);
  return {
    artifact_count: ids.length,
    zero_byte_count: ids.length,
    first_at: bursts[0].first_at,
    last_at: bursts[bursts.length - 1].at,
    max_burst: Math.max(...bursts.map((b) => b.ids.length)),
    bursts,
    primary_id: PRIMARY,
  };
}

function miniSummary(c) {
  const hist = {};
  for (const b of c.bursts) hist[String(b.ids.length)] = (hist[String(b.ids.length)] ?? 0) + 1;
  return {
    source: "scratch-census.json",
    artifact_count: c.artifact_count,
    zero_byte_count: c.zero_byte_count,
    first_at: c.first_at,
    last_at: c.last_at,
    max_burst: c.max_burst,
    bursts: c.bursts.length,
    burst_size_histogram: hist,
    primary_id: c.primary_id,
  };
}

test("a burst straddling the window start is still cross-checked", () => {
  const l = base();
  l.window = { from: T(10), to: T(20) };
  const census = miniCensus([{ first_at: T(8), at: T(12), ids: ["eeeeeeeeeeeeeeeee"] }]);
  l.dispatch_census = miniSummary(census);
  assert.ok(codes(validateLedger(l, roles, census)).includes("E_UNDOCUMENTED_CHILD"));
  const outside = miniCensus([{ first_at: T(1), at: T(2), ids: ["eeeeeeeeeeeeeeeee"] }]);
  l.dispatch_census = miniSummary(outside);
  assert.deepEqual(validateLedger(l, roles, outside).violations, []);
});

test("the committed undocumented-child negative receipt fires both cross-check codes and exits 1", () => {
  const neg = read("docs/operations/receipts/328-runtime-ledger-negative-undocumented.json");
  const { census } = realPair();
  const r = validateLedger(neg, roles, census);
  assert.equal(r.ok, false);
  for (const code of neg.expected_violations) assert.ok(codes(r).includes(code), `${code} did not fire`);
  const captured = fs.readFileSync(fileURLToPath(new URL("../docs/operations/receipts/328-runtime-ledger-negative-undocumented.output.txt", import.meta.url)), "utf8");
  assert.ok(captured.includes("E_UNDOCUMENTED_CHILD"));
  assert.ok(captured.includes("E_NO_DISPATCH_ARTIFACT"));
  assert.ok(captured.includes('"ok": false'));
});

const burstIndexOf = (census, id) => census.bursts.findIndex((b) => b.ids.includes(id));

test("H1: shifting window.from past an omitted child no longer hides it, even with the genuine census", () => {
  const { census, ledger } = realPair();
  const dropped = "a69124e830650b810";
  ledger.sessions = ledger.sessions.filter((s) => s.id !== dropped);
  ledger.window.from = "2026-11-17T19:12:00.000Z";
  const r = validateLedger(ledger, roles, census);
  assert.equal(r.ok, false);
  assert.ok(!codes(r).includes("E_UNDOCUMENTED_CHILD"), "the shifted window really does evade the burst cross-check");
  assert.ok(codes(r).includes("E_CHILD_OUTSIDE_WINDOW"));
  assert.ok(r.violations.some((v) => v.code === "E_CHILD_OUTSIDE_WINDOW" && v.detail.includes("aaceb00b9092592a2")));
});

test("a child that finishes after window.to is rejected", () => {
  const { census, ledger } = realPair();
  ledger.window.to = "2026-11-17T19:30:00.000Z";
  const r = validateLedger(ledger, roles, census);
  assert.ok(codes(r).includes("E_CHILD_OUTSIDE_WINDOW"));
  assert.ok(r.violations.some((v) => v.detail.includes("exceeds window.to")));
});

test("the pass receipt window exactly brackets its children, and equality is inside the window", () => {
  const { census, ledger } = realPair();
  const kids = ledger.sessions.filter((s) => s.kind === "child");
  assert.equal(ledger.window.from, kids.map((s) => s.started_at).sort()[0]);
  assert.equal(ledger.window.to, kids.map((s) => s.finished_at).sort().slice(-1)[0]);
  assert.ok(!codes(validateLedger(ledger, roles, census)).includes("E_CHILD_OUTSIDE_WINDOW"));
});

test("H2: a truncated census pointed at by dispatch_census.source is rejected against the untouched summary", () => {
  const { census, ledger } = realPair();
  const i = burstIndexOf(census, "a69124e830650b810");
  assert.ok(i >= 0);
  census.bursts.splice(i, 1);
  ledger.sessions = ledger.sessions.filter((s) => s.id !== "a69124e830650b810");
  const r = validateLedger(ledger, roles, census);
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes("E_CENSUS_MISMATCH"));
  const keys = r.violations.filter((v) => v.code === "E_CENSUS_MISMATCH").map((v) => v.detail);
  assert.ok(keys.some((d) => d.includes("dispatch_census.bursts ")));
  assert.ok(keys.some((d) => d.includes("dispatch_census.burst_size_histogram")));
});

test("the burst-size histogram is compared, not just the burst count", () => {
  const { census, ledger } = realPair();
  ledger.dispatch_census.burst_size_histogram["1"] -= 1;
  const r = validateLedger(ledger, roles, census);
  assert.ok(r.violations.some((v) => v.code === "E_CENSUS_MISMATCH" && v.detail.includes("burst_size_histogram")));
});

test("every declared census summary field is compared", () => {
  for (const key of ["artifact_count", "zero_byte_count", "first_at", "last_at", "max_burst", "primary_id"]) {
    const { census, ledger } = realPair();
    ledger.dispatch_census[key] = key === "primary_id" ? "someone-else" : key.endsWith("_at") ? "2020-01-01T00:00:00.000Z" : -1;
    const r = validateLedger(ledger, roles, census);
    assert.ok(r.violations.some((v) => v.code === "E_CENSUS_MISMATCH" && v.detail.includes(`dispatch_census.${key} `)), key);
  }
});

test("H3: first_at later than at is a violation, not a silently skipped burst", () => {
  const { census, ledger } = realPair();
  const i = burstIndexOf(census, "a69124e830650b810");
  census.bursts[i].first_at = "2026-11-18T00:00:00.000Z";
  ledger.sessions = ledger.sessions.filter((s) => s.id !== "a69124e830650b810");
  const r = validateLedger(ledger, roles, census);
  assert.equal(r.ok, false);
  assert.ok(codes(r).includes("E_CENSUS_CLOCK"));
});

test("an unparseable burst clock is a violation", () => {
  const { census, ledger } = realPair();
  census.bursts[0].at = "not-a-clock";
  assert.ok(codes(validateLedger(ledger, roles, census)).includes("E_CENSUS_CLOCK"));
});

test("a missing first_at still falls back to at and is cross-checked", () => {
  const { census, ledger } = realPair();
  const i = burstIndexOf(census, "a69124e830650b810");
  delete census.bursts[i].first_at;
  ledger.sessions = ledger.sessions.filter((s) => s.id !== "a69124e830650b810");
  const r = validateLedger(ledger, roles, census);
  assert.ok(codes(r).includes("E_UNDOCUMENTED_CHILD"));
  assert.ok(!codes(r).includes("E_CENSUS_CLOCK"));
});

test("a census with no declared summary has no trust anchor and is rejected", () => {
  const { census, ledger } = realPair();
  delete ledger.dispatch_census;
  assert.ok(codes(validateLedger(ledger, roles, census)).includes("E_CENSUS_UNDECLARED"));
});

function runCli(ledger, census) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rw-ledger-cli-"));
  const lp = path.join(dir, "ledger.json");
  const cp = path.join(dir, "census.json");
  fs.writeFileSync(lp, JSON.stringify(ledger));
  fs.writeFileSync(cp, JSON.stringify(census));
  const root = fileURLToPath(new URL("..", import.meta.url));
  const r = spawnSync(process.execPath, [path.join(root, "scripts/verify-session-ledger.mjs"), "--ledger", lp, "--census", cp], { cwd: root, encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("the committed pass receipt exits 0 through the CLI", () => {
  const { census, ledger } = realPair();
  const r = runCli(ledger, census);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('"ok": true'));
});

test("the committed window-shift negative captures exit 1 with the cross-check on", () => {
  const captured = fs.readFileSync(fileURLToPath(new URL("../docs/operations/receipts/328-runtime-ledger-negative-window-shift.output.txt", import.meta.url)), "utf8");
  assert.ok(captured.includes("E_CHILD_OUTSIDE_WINDOW"));
  assert.ok(captured.includes('"ok": false'));
  assert.ok(captured.includes('"census_cross_check": "on"'));
  assert.ok(captured.includes("EXIT=1"));
  assert.ok(!captured.includes("E_UNDOCUMENTED_CHILD"));
});

test("H1/H2/H3 each exit 1 through the CLI, not just in-process", () => {
  const h1 = realPair();
  h1.ledger.sessions = h1.ledger.sessions.filter((s) => s.id !== "a69124e830650b810");
  h1.ledger.window.from = "2026-11-17T19:12:00.000Z";
  const r1 = runCli(h1.ledger, h1.census);
  assert.equal(r1.status, 1);
  assert.ok(r1.stdout.includes("E_CHILD_OUTSIDE_WINDOW"));

  const h2 = realPair();
  h2.census.bursts.splice(burstIndexOf(h2.census, "a69124e830650b810"), 1);
  h2.ledger.sessions = h2.ledger.sessions.filter((s) => s.id !== "a69124e830650b810");
  const r2 = runCli(h2.ledger, h2.census);
  assert.equal(r2.status, 1);
  assert.ok(r2.stdout.includes("E_CENSUS_MISMATCH"));

  const h3 = realPair();
  h3.census.bursts[burstIndexOf(h3.census, "a69124e830650b810")].first_at = "2026-11-18T00:00:00.000Z";
  h3.ledger.sessions = h3.ledger.sessions.filter((s) => s.id !== "a69124e830650b810");
  const r3 = runCli(h3.ledger, h3.census);
  assert.equal(r3.status, 1);
  assert.ok(r3.stdout.includes("E_CENSUS_CLOCK"));
});

const RECEIPTS = "docs/operations/receipts";
const negativeLedger = (name) => read(`${RECEIPTS}/328-runtime-ledger-negative-${name}.json`);
const negativeOutput = (name) =>
  fs.readFileSync(fileURLToPath(new URL(`../${RECEIPTS}/328-runtime-ledger-negative-${name}.output.txt`, import.meta.url)), "utf8");

function cli(ledger, census) {
  const r = runCli(ledger, census);
  return { ...r, json: JSON.parse(r.stdout) };
}

function simultaneous(ledger) {
  const l = clone(ledger);
  for (const s of l.sessions.filter((x) => x.kind === "child")) s.started_at = l.window.from;
  return l;
}

// Merging bursts leaves the artifact population untouched, so only the burst-derived fields move.
function honestSummary(c) {
  const hist = {};
  for (const b of c.bursts) hist[String(b.ids.length)] = (hist[String(b.ids.length)] ?? 0) + 1;
  return {
    artifact_count: c.artifact_count,
    zero_byte_count: c.zero_byte_count,
    first_at: c.first_at,
    last_at: c.last_at,
    max_burst: c.bursts.reduce((m, b) => Math.max(m, b.ids.length), 0),
    bursts: c.bursts.length,
    burst_size_histogram: hist,
    primary_id: c.primary_id,
  };
}

function mergeWindowBursts(ledger, census) {
  const c = clone(census);
  const childIds = new Set(ledger.sessions.filter((s) => s.kind === "child").map((s) => s.id));
  const inWave = c.bursts.filter((b) => b.ids.some((id) => childIds.has(id)));
  const rest = c.bursts.filter((b) => !b.ids.some((id) => childIds.has(id)));
  const merged = {
    first_at: inWave.map((b) => b.first_at ?? b.at).sort()[0],
    at: inWave.map((b) => b.at).sort().at(-1),
    ids: inWave.flatMap((b) => b.ids),
  };
  c.bursts = [...rest, merged].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  c.max_burst = c.bursts.reduce((m, b) => Math.max(m, b.ids.length), 0);
  return { census: c, merged, inWaveCount: inWave.length };
}

test("H4 honest control: six simultaneous children with parseable clocks break both caps through the CLI", () => {
  const { census, ledger } = realPair();
  const r = cli(simultaneous(ledger), census);
  assert.equal(r.status, 1);
  assert.equal(r.json.peak_children, 6);
  assert.equal(r.json.peak_sessions, 7);
  assert.deepEqual(codes(r.json), ["E_CHILD_CAP", "E_SESSION_CAP"]);
});

test("H4: unparseable started_at values cannot shrink the peak the honest control measures", () => {
  const { census, ledger } = realPair();
  const control = cli(simultaneous(ledger), census);
  const attacked = simultaneous(ledger);
  const kids = attacked.sessions.filter((s) => s.kind === "child");
  kids[0].started_at = "tbd";
  kids[1].started_at = "tbd";
  const r = cli(attacked, census);
  assert.equal(r.status, 1);
  assert.ok(codes(r.json).includes("E_SESSION_CLOCK"));
  assert.equal(r.json.peak_children, control.json.peak_children, "a garbage clock must not erase a child from the peak");
  assert.equal(r.json.peak_sessions, control.json.peak_sessions);
  assert.ok(codes(r.json).includes("E_CHILD_CAP"));
  assert.ok(codes(r.json).includes("E_SESSION_CAP"));
});

test("H4: garbage-clocking any single child of the genuine receipt never lowers the peak", () => {
  const { census, ledger } = realPair();
  const honest = validateLedger(clone(ledger), roles, clone(census));
  for (const id of ledger.sessions.filter((s) => s.kind === "child").map((s) => s.id)) {
    const attacked = clone(ledger);
    attacked.sessions.find((s) => s.id === id).started_at = "not-a-clock";
    const r = validateLedger(attacked, roles, clone(census));
    assert.ok(codes(r).includes("E_SESSION_CLOCK"), id);
    assert.ok(r.peak_children >= honest.peak_children, `${id} peak ${r.peak_children} < honest ${honest.peak_children}`);
    assert.ok(r.peak_sessions >= honest.peak_sessions, id);
  }
});

test("the committed H4 negative and its captured output reproduce through the CLI", () => {
  const ledger = negativeLedger("session-clock");
  const { census } = realPair();
  const captured = negativeOutput("session-clock");
  assert.ok(captured.includes("EXIT=1"));
  assert.ok(captured.includes("E_SESSION_CLOCK"));
  assert.ok(captured.includes('"census_cross_check": "on"'));
  assert.ok(captured.includes("the genuine host census"));
  const r = cli(ledger, census);
  assert.equal(r.status, 1);
  assert.equal(r.json.peak_children, 6);
  assert.equal(r.json.peak_sessions, 7);
  assert.deepEqual(codes(r.json), ["E_CHILD_CAP", "E_SESSION_CAP", "E_SESSION_CLOCK"]);
  assert.ok(captured.includes('"peak_children": 6'));
});

test("E_SESSION_CLOCK fires in isolation on a staggered receipt and can only raise its peaks", () => {
  const { census, ledger } = realPair();
  const honest = validateLedger(clone(ledger), roles, clone(census));
  assert.deepEqual(honest.violations, []);
  ledger.sessions.find((s) => s.id === "a69124e830650b810").started_at = "tbd";
  const r = validateLedger(ledger, roles, census);
  assert.deepEqual(codes(r), ["E_SESSION_CLOCK"]);
  assert.ok(r.peak_children >= honest.peak_children);
  assert.ok(r.peak_sessions >= honest.peak_sessions);
});

test("an unparseable finished_at is clamped live to window.to and reported", () => {
  const { census, ledger } = realPair();
  const finished = ledger.sessions.filter((s) => s.kind === "child" && s.finished_at);
  assert.ok(finished.length >= 2, "the receipt really has finished children to attack");
  for (const s of finished.slice(0, 2)) s.finished_at = "unknown";
  const r = validateLedger(ledger, roles, census);
  assert.ok(codes(r).includes("E_SESSION_CLOCK"));
  assert.equal(r.ok, false);
  assert.ok(r.peak_children >= 4, `clamping finished children live must raise the peak, got ${r.peak_children}`);
});

test("an unparseable window clock is a violation and does not silently skip the census cross-check", () => {
  const { census, ledger } = realPair();
  ledger.window.from = "sometime";
  ledger.sessions = ledger.sessions.filter((s) => s.id !== "a69124e830650b810");
  const r = validateLedger(ledger, roles, census);
  assert.ok(codes(r).includes("E_SESSION_CLOCK"));
  assert.ok(codes(r).includes("E_UNDOCUMENTED_CHILD"), "NaN window comparisons must not disable the cross-check");
  const to = realPair();
  to.ledger.window.to = "eventually";
  assert.ok(codes(validateLedger(to.ledger, roles, to.census)).includes("E_SESSION_CLOCK"));
});

test("H5: a merged over-cap census burst is rejected even with an honestly recomputed summary", () => {
  const { census, ledger } = realPair();
  const { census: merged, inWaveCount } = mergeWindowBursts(ledger, census);
  assert.equal(inWaveCount, 3);
  assert.equal(merged.bursts.find((b) => b.ids.length > roles.max_children).ids.length, 6);
  ledger.dispatch_census = { ...ledger.dispatch_census, ...honestSummary(merged) };
  const r = cli(ledger, merged);
  assert.equal(r.status, 1);
  assert.deepEqual(codes(r.json), ["E_DISPATCH_BURST"], "an honest summary must leave the cap as the only violation");
  assert.equal(r.json.peak_children, 3, "the session clocks are genuine and staggered");
});

test("the committed H5 negative and its derived census reproduce through the CLI", () => {
  const ledger = negativeLedger("census-burst");
  const derived = read(ledger.dispatch_census.source);
  const captured = negativeOutput("census-burst");
  assert.ok(captured.includes("EXIT=1"));
  assert.ok(captured.includes("E_DISPATCH_BURST"));
  assert.ok(captured.includes("a DERIVED census committed beside this negative"));
  assert.ok(!captured.includes("the genuine host census"));
  const r = cli(ledger, derived);
  assert.equal(r.status, 1);
  assert.deepEqual(codes(r.json), ["E_DISPATCH_BURST"]);
  assert.ok(captured.includes('"peak_children": 3'));
});

test("the burst cap is inclusive at max_children and fires one id above it", () => {
  const { census, ledger } = realPair();
  assert.equal(census.max_burst, roles.max_children);
  assert.deepEqual(validateLedger(clone(ledger), roles, clone(census)).violations, []);
  const over = clone(census);
  over.bursts.find((b) => b.ids.length === roles.max_children).ids.push("fffffffffffffffff");
  over.max_burst = roles.max_children + 1;
  const honest = { ...ledger, dispatch_census: { ...ledger.dispatch_census, ...honestSummary(over) } };
  const r = validateLedger(honest, roles, over);
  assert.ok(codes(r).includes("E_DISPATCH_BURST"));
  assert.ok(!codes(r).includes("E_CENSUS_MISMATCH"));
});

test("the census burst cap fires before the clock guard can excuse an inverted burst", () => {
  const { census, ledger } = realPair();
  const { census: merged } = mergeWindowBursts(ledger, census);
  const burst = merged.bursts.find((b) => b.ids.length > roles.max_children);
  burst.first_at = "2026-11-18T00:00:00.000Z";
  ledger.dispatch_census = { ...ledger.dispatch_census, ...honestSummary(merged) };
  const r = validateLedger(ledger, roles, merged);
  assert.ok(codes(r).includes("E_CENSUS_CLOCK"));
  assert.ok(codes(r).includes("E_DISPATCH_BURST"), "the trusted artifact proves the burst size on its own");
});

test("the census burst cap is unscoped by the ledger window, matching --scan", () => {
  const { census, ledger } = realPair();
  const { census: merged } = mergeWindowBursts(ledger, census);
  const burst = merged.bursts.find((b) => b.ids.length > roles.max_children);
  burst.first_at = "2026-11-16T00:00:00.000Z";
  burst.at = "2026-11-16T00:00:01.000Z";
  ledger.dispatch_census = { ...ledger.dispatch_census, ...honestSummary(merged) };
  const r = validateLedger(ledger, roles, merged);
  assert.ok(codes(r).includes("E_DISPATCH_BURST"), "an out-of-window burst is still a real over-cap dispatch");
  assert.ok(!codes(r).includes("E_CENSUS_CLOCK"));
});

test("every committed negative output still exits 1 at the current validator", () => {
  for (const name of ["overcap", "undocumented", "window-shift", "session-clock", "census-burst"]) {
    const captured = negativeOutput(name);
    assert.ok(captured.includes("EXIT=1"), name);
    assert.ok(captured.includes('"ok": false'), name);
  }
});

test("the four census-anchored negatives capture with the cross-check on", () => {
  for (const name of ["undocumented", "window-shift", "session-clock", "census-burst"]) {
    const captured = negativeOutput(name);
    assert.ok(captured.includes("# exit code: 1"), name);
    assert.ok(captured.includes('"census_cross_check": "on"'), name);
    assert.ok(negativeLedger(name).dispatch_census, name);
  }
  const original = negativeOutput("overcap");
  assert.ok(original.includes('"census_cross_check": "off"'), "the original over-cap negative is a synthetic ledger with no census");
});
