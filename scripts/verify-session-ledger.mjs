import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ROLES_PATH = "docs/agents/roles.json";

export function validateLedger(ledger, roles, census = null) {
  const v = [];
  const add = (code, detail) => v.push({ code, detail });
  const sessions = ledger.sessions ?? [];
  const maxChildren = roles.max_children;
  const maxSessions = roles.max_model_sessions;
  const knownRoles = new Set(roles.roles.map((r) => r.id));

  const primaries = sessions.filter((s) => s.kind === "primary");
  if (primaries.length !== 1) add("E_PRIMARY_COUNT", `expected exactly 1 primary, found ${primaries.length}`);
  const primary = primaries[0];
  if (primary && primary.role !== roles.primary) add("E_PRIMARY_ROLE", `primary role ${primary.role} != ${roles.primary}`);

  for (const s of sessions) {
    if (!knownRoles.has(s.role)) add("E_UNKNOWN_ROLE", `${s.id} role ${s.role} absent from ${ROLES_PATH}`);
    if (!s.started_at) add("E_NO_START", `${s.id} has no started_at`);
    if (s.kind === "child") {
      if (!primary || s.spawned_by !== primary.id) add("E_RECURSIVE_SPAWN", `${s.id} spawned_by ${s.spawned_by} is not the primary`);
      if (s.status === "finished" && (!s.finished_at || !s.outcome)) add("E_NO_FINISH", `${s.id} finished without finished_at/outcome`);
    }
    if (s.status === "running" && s.finished_at) add("E_STATUS_CONTRADICTION", `${s.id} running but has finished_at`);
    if (s.finished_at && s.started_at && Date.parse(s.finished_at) < Date.parse(s.started_at)) {
      add("E_TIME_ORDER", `${s.id} finished before it started`);
    }
  }

  const end = (s) => (s.finished_at ? Date.parse(s.finished_at) : Date.parse(ledger.window.to));
  const start = (s) => Date.parse(s.started_at);
  const marks = [...new Set(sessions.flatMap((s) => [start(s), end(s)]))].sort((a, b) => a - b);
  let peakChildren = 0;
  let peakTotal = 0;
  for (const t of marks) {
    const live = sessions.filter((s) => start(s) <= t && end(s) > t);
    const children = live.filter((s) => s.kind === "child");
    peakChildren = Math.max(peakChildren, children.length);
    peakTotal = Math.max(peakTotal, live.length);
    if (children.length > maxChildren) add("E_CHILD_CAP", `${children.length} children live at ${new Date(t).toISOString()} > ${maxChildren}`);
    if (live.length > maxSessions) add("E_SESSION_CAP", `${live.length} sessions live at ${new Date(t).toISOString()} > ${maxSessions}`);
    const browsers = live.filter((s) => s.browser);
    if (browsers.length > 1) add("E_BROWSER_MULTIPLE", `${browsers.length} browser holders at ${new Date(t).toISOString()}: ${browsers.map((s) => s.id).join(",")}`);
    const releasers = live.filter((s) => s.role === "release-engineer");
    if (releasers.length > 1) add("E_RELEASE_MULTIPLE", `${releasers.length} release engineers at ${new Date(t).toISOString()}`);
    const held = new Map();
    for (const s of live) {
      for (const lease of s.leases ?? []) {
        if (held.has(lease)) add("E_LEASE_CONFLICT", `${lease} held by both ${held.get(lease)} and ${s.id} at ${new Date(t).toISOString()}`);
        else held.set(lease, s.id);
      }
    }
  }

  for (const b of ledger.dispatch_bursts ?? []) {
    if (b.ids.length > maxChildren) add("E_DISPATCH_BURST", `${b.ids.length} children dispatched at ${b.at} > ${maxChildren}`);
  }

  if (census) {
    const documented = new Set(sessions.map((s) => s.id));
    const from = Date.parse(ledger.window.from);
    const to = Date.parse(ledger.window.to);
    const dispatched = new Set();
    for (const b of census.bursts ?? []) {
      const first = Date.parse(b.first_at ?? b.at);
      const last = Date.parse(b.at);
      for (const id of b.ids) dispatched.add(id);
      if (first > to || last < from) continue;
      for (const id of b.ids) {
        if (!documented.has(id)) add("E_UNDOCUMENTED_CHILD", `${id} dispatched at ${b.at} inside the ledger window but absent from sessions[]`);
      }
    }
    for (const s of sessions.filter((x) => x.kind === "child")) {
      if (!dispatched.has(s.id)) add("E_NO_DISPATCH_ARTIFACT", `${s.id} documented as a child but has no dispatch artifact in the census`);
    }
  }

  return { ok: v.length === 0, violations: v, peak_children: peakChildren, peak_sessions: peakTotal };
}

export function groupBursts(rows, windowMs = 2000) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const bursts = [];
  for (const r of sorted) {
    const last = bursts[bursts.length - 1];
    if (last && Date.parse(r.started_at) - Date.parse(last.at) <= windowMs) {
      last.ids.push(r.id);
      last.at = r.started_at;
    } else {
      bursts.push({ at: r.started_at, first_at: r.started_at, ids: [r.id] });
    }
  }
  return bursts;
}

export function scanArtifacts(dir, primaryId) {
  const names = fs.readdirSync(dir).filter((n) => /^[0-9a-f]{17}\.output$/.test(n));
  const rows = names
    .map((n) => {
      const st = fs.statSync(path.join(dir, n));
      return { id: n.slice(0, -7), started_at: st.birthtime.toISOString(), bytes: st.size };
    })
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const bursts = groupBursts(rows);
  return {
    artifact_count: rows.length,
    zero_byte_count: rows.filter((r) => r.bytes === 0).length,
    first_at: rows[0]?.started_at ?? null,
    last_at: rows[rows.length - 1]?.started_at ?? null,
    max_burst: bursts.reduce((m, b) => Math.max(m, b.ids.length), 0),
    bursts,
    primary_id: primaryId,
  };
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  const roles = JSON.parse(fs.readFileSync(ROLES_PATH, "utf8"));

  if (get("--scan")) {
    const census = scanArtifacts(get("--scan"), get("--primary") ?? "unknown");
    process.stdout.write(JSON.stringify(census, null, 2) + "\n");
    const over = census.bursts.filter((b) => b.ids.length > roles.max_children);
    if (over.length) {
      process.stderr.write(`E_DISPATCH_BURST: ${over.length} burst(s) exceed ${roles.max_children}\n`);
      process.exit(1);
    }
    process.stderr.write(`OK max_burst=${census.max_burst} <= max_children=${roles.max_children}\n`);
    return;
  }

  const ledgerPath = get("--ledger");
  if (!ledgerPath) {
    process.stderr.write("usage: verify-session-ledger.mjs --ledger <file> | --scan <tasksDir> [--primary <id>]\n");
    process.exit(2);
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const censusPath = get("--census") ?? ledger.dispatch_census?.source ?? null;
  let census = null;
  if (censusPath) {
    census = JSON.parse(fs.readFileSync(censusPath, "utf8"));
  }
  const result = validateLedger(ledger, roles, census);
  process.stdout.write(JSON.stringify({ ...result, census_cross_check: census ? "on" : "off" }, null, 2) + "\n");
  if (!result.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
