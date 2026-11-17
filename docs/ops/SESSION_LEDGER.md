# Runtime session ledger (OPS-04, #328)

The studio cap in `docs/agents/roles.json` — one primary coordinator, at most four children, five model sessions total, one release-engineer lease, one browser per deployed SHA — was previously enforced only by prose and by a coordinator's own attestation. This document defines the machine-checkable form of that contract and the receipt that proves a real wave obeyed it.

An attestation is a claim. A ledger is a claim plus a validator that can reject it. Both are required; neither replaces the other.

## Validator

```
node scripts/verify-session-ledger.mjs --ledger docs/operations/receipts/328-runtime-ledger-e82caa52-pass.json
node scripts/verify-session-ledger.mjs --ledger <file> --census <census file>
node scripts/verify-session-ledger.mjs --scan <host task artifact dir> --primary <coordinator session id>
```

`--ledger` prints `{ok, violations, peak_children, peak_sessions, census_cross_check}` and exits 1 on any violation, 2 on usage error. `--scan` prints a dispatch census as JSON on **stdout** and its one-line verdict on **stderr**, so the JSON stays parseable when redirected; it exits 1 if any dispatch burst exceeded `max_children`.

`--census` is optional: when omitted, the validator auto-loads `dispatch_census.source` from the ledger itself, so the default invocation enforces the undocumented-child clause. `census_cross_check` reports `on` or `off` so a reader can never mistake an uncross-checked pass for a cross-checked one. Paths resolve against the repository root, the same convention `roles.json` already uses.

Limits are read from `docs/agents/roles.json` at run time. The validator never hard-codes 4 or 5, so tightening the contract in one place tightens enforcement everywhere.

## Ledger schema (`rustwake.session-ledger.v1`)

| Field | Meaning |
|---|---|
| `main_sha` | Full 40-character main SHA the wave was coordinated against. |
| `window` | `{from, to}` ISO clocks bounding the observation. A running child is treated as live until `window.to`. |
| `coordinator_session` | The one primary session id. |
| `sessions[]` | `{id, role, agent_type, kind, spawned_by, started_at, finished_at, status, outcome, tool_uses, leases, browser, port}`. `kind` is `primary` or `child`. `role` must exist in `roles.json`. |
| `*_basis` | Free-text provenance for a clock that was derived rather than read. Required in spirit whenever a timestamp is not a direct observation. |
| `dispatch_census` | Summary of the `--scan` output, with `source` naming the committed full census. |
| `honest_limits` | What this receipt does **not** prove. Mandatory. |

## Violation codes

| Code | Contract clause |
|---|---|
| `E_PRIMARY_COUNT` | Exactly one primary. A second forever-coordinator is the failure this catches. |
| `E_PRIMARY_ROLE` | The primary must hold the `coordinator` role. |
| `E_UNKNOWN_ROLE` | A role absent from `roles.json` is a fabricated capability. |
| `E_NO_START` | Every session needs a start clock. |
| `E_RECURSIVE_SPAWN` | Every child's `spawned_by` must be the primary. Children may not dispatch. |
| `E_NO_FINISH` | A `finished` child needs both `finished_at` and `outcome`. |
| `E_STATUS_CONTRADICTION` | A `running` child may not carry a finish clock. |
| `E_TIME_ORDER` | Finish may not precede start. |
| `E_CHILD_CAP` | More than `max_children` children alive at one instant. |
| `E_SESSION_CAP` | More than `max_model_sessions` sessions alive at one instant. |
| `E_BROWSER_MULTIPLE` | More than one browser holder alive at one instant. |
| `E_RELEASE_MULTIPLE` | More than one release engineer alive at one instant. |
| `E_LEASE_CONFLICT` | Two live sessions holding the same single-writer `src` lease. |
| `E_DISPATCH_BURST` | More than `max_children` children dispatched inside one 2000 ms burst. |
| `E_UNDOCUMENTED_CHILD` | The census proves a child was dispatched inside `window`, but `sessions[]` omits it. Requires a census. |
| `E_NO_DISPATCH_ARTIFACT` | `sessions[]` claims a child that has no dispatch artifact anywhere in the census. Requires a census. |

Concurrency is computed by a sweep over every start and finish mark, counting sessions live at each mark. The cap is **concurrency, not lifetime total**: eight sequential children pass, five simultaneous children fail. Leases are checked the same way, so the same lease held sequentially by two developers is legal and is the normal serialized-train case.

## Dispatch census

Agent-shaped host artifacts match `/^[0-9a-f]{17}\.output$/`. Nine-character ids are background shell tasks, not model sessions, and are excluded. `scanArtifacts` reads each artifact's `birthtime` as the dispatch instant and groups dispatches within 2000 ms into a burst. Each burst records `first_at` (earliest dispatch in the burst) and `at` (latest), because a burst has width and a window boundary can fall inside it.

**A burst cap is not a concurrency proof.** It bounds how many children were started together, not how many were simultaneously alive. The census is strong supporting evidence across a whole session history; the concurrency proof is the sweep over sessions whose clocks were actually observed. A receipt must say which of the two it is offering.

The census is a **snapshot of the coordinator session's artifact store**, frozen at `scanned_at`. It is not a claim about every session on the host, and it grows with every later dispatch. Tests assert its internal consistency and its agreement with the receipt, never a hard-coded artifact count.

## Undocumented children

A ledger that simply **omits** a child passes every concurrency, lease, browser and role check: the omitted session is invisible, so the peaks look healthier than reality. Issue #328 forbids exactly that ("no undocumented child"), and prose cannot enforce it. The cross-check does, in both directions:

- **Census → ledger.** Every burst overlapping `[window.from, window.to]` must have all of its ids present in `sessions[]`, else `E_UNDOCUMENTED_CHILD`. Overlap is tested as `first_at <= to && at >= from`, so a burst straddling a window boundary is still checked rather than silently skipped.
- **Ledger → census.** Every documented child must appear somewhere in the census, else `E_NO_DISPATCH_ARTIFACT`. This catches the opposite fraud: inventing a session that was never dispatched.

The check is **window-scoped on purpose**. The committed census spans 194 artifacts back to the start of the coordinator session, while the pass receipt documents the six children of one wave. Requiring the ledger to document all 194 would demand finish clocks and roles the 0-byte defect makes unrecoverable — it would force fabrication, which is the opposite of the goal. Artifacts outside the window are therefore not asserted to be children of this ledger, and the receipt says so in `honest_limits`. Widening the window is a deliberate act that carries the obligation to document everything inside it.

## Known observability defect

Every child artifact on the installed host is **0 bytes**, with `mtime` within ~50 ms of `birthtime`. The store therefore records dispatch starts and nothing else: no finish clock, no duration, no exit status, no role. Per-child finish times are recoverable **only** from a host completion notification that supplies `duration_ms`.

Consequences, stated rather than papered over:

- Finish times for earlier waves are unrecoverable. A ledger covering them must leave `finished_at` unset and say so, not interpolate.
- Role attribution for earlier waves is not recoverable from the store either. Only sessions the coordinator dispatched directly can be role-labelled honestly.
- The primary session's own start clock is not exposed. The pass receipt lower-bounds it by the first observable child dispatch and declares that basis.

Tracked in `docs/backlog/GAPS.md`. The fix belongs to the host harness, not to this repo; the repo's obligation is to refuse to fabricate the missing data.

## Cancellation, event-wait and restart recovery

The installed host exposes no cancellation or restart API to a coordinator session, so these clauses cannot be exercised by killing a live child — and killing a child another wave depends on would itself violate the contract. They are enforced at the ledger-contract level instead, where the same failure shapes are representable and testable:

- **Cancellation** → a cancelled child must still record a finish and an outcome (`E_NO_FINISH`), and must not keep holding a lease or a browser after it stops (`E_LEASE_CONFLICT`, `E_BROWSER_MULTIPLE`).
- **Event-wait** → a waiting session is `running` with no finish clock; it may not also carry one (`E_STATUS_CONTRADICTION`), and it still counts against the cap while it waits (`E_CHILD_CAP`).
- **Restart recovery** → a recovered wave must not reintroduce a second primary (`E_PRIMARY_COUNT`) or re-adopt a child under a non-primary parent (`E_RECURSIVE_SPAWN`), and its clocks must stay ordered (`E_TIME_ORDER`).

This is a real limit of the evidence, not a claim that live cancellation was exercised. It is declared in the receipt's `honest_limits`.

## Deliberate negative case

`docs/operations/receipts/328-runtime-ledger-negative-overcap.json` is **synthetic**. Every id is prefixed `NEGATIVE-` and is not a host session id. It encodes a second coordinator, a fifth concurrent child, a child spawning its own worker, two browser holders, two release engineers, two writers on `src/App.jsx`, and a finished child with no finish record. Its captured exit-1 output is committed alongside it as `…-negative-overcap.output.txt`. It must never be cited as runtime evidence.

A second negative, `docs/operations/receipts/328-runtime-ledger-negative-undocumented.json`, is **derived from the real pass receipt** and cross-checked against the **genuine, unmodified** census. It removes one child that the census proves was dispatched inside the window and adds one fabricated child that has no artifact. Every other check still passes — peaks stay at 3 children / 4 sessions — which is precisely the point: the ledger looks healthy while being dishonest. Only `E_UNDOCUMENTED_CHILD` and `E_NO_DISPATCH_ARTIFACT` catch it. Its captured exit-1 output is committed as `…-negative-undocumented.output.txt`. It is a demonstration of the rejector, not runtime evidence of a real violation.

`tests/sessionLedger.test.mjs` asserts the pass receipt validates at its measured peaks **with the cross-check on**, both negative receipts fail with every promised code, each violation code fires in isolation, and the inclusive boundaries pass (4 children + 1 primary = 5 sessions; one browser; disjoint leases; sequential lease reuse). It also asserts the cross-check's own edges: an omission is invisible without a census, out-of-window artifacts are not claimed, a burst straddling the window start is still checked, and `first_at`/`at` really are the earliest/latest dispatch. The suite runs under the existing `pnpm test` glob — no workflow change is needed or made.

## Coordinator obligation

Before dispatching, reconcile live sessions and leases against this contract. After a wave, capture the census and write the receipt with its `honest_limits` filled in. A wave with no ledger is not evidence of a cap obeyed; it is an unmeasured wave.
