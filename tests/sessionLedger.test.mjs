import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
