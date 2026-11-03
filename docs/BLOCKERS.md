# BLOCKERS

Each entry: exact blocker, evidence, unblock condition, work that continues meanwhile.

## BL-01 Real-device performance traces

- Blocked: 30/60 FPS stability, p95 main-thread work under 10 ms, thermal soak, battery
  use on midrange Android and iPhone.
- Evidence: only Node CPU medians exist (`tests/perf/bench.test.ts`); jsdom has no
  compositor. The README lists Node numbers as Node numbers.
- Unblock: a connected device with USB debugging, or a hosted trace service with an
  authorized token. Then run the 30-minute and 2-hour repeated-action soak.
- Meanwhile: keep the frame loop allocation-light, keep effects pooled, prefer integer
  draw math, and add instrumentation counters that a trace can read.

## BL-02 Human first-feel validation

- Blocked: the 8-of-10 comprehension gate for the opening loop.
- Evidence: jsdom tests prove state transitions and button wiring, not understanding.
- Unblock: at least ten fresh human testers with the running build and no spoken hints.
- Meanwhile: heuristic review of objective wording, hit-target sizes, and contrast; keep
  one primary action per screen so a tester has exactly one thing to try.

## BL-03 Server authority and payments

- Blocked: cloud saves, ranked modes, entitlements, provider webhooks.
- Evidence: no provisioned database, no provider account, no authorized deployment; the
  goal file does not authorize spending or public launch.
- Unblock: owner authorization plus provider credentials and a staging deploy target.
- Meanwhile: keep the simulation pure and deterministic so an authoritative server can
  replay the same command list, and keep idempotency keys on every command.

## BL-04 Screenshot capture on a headless-only host

- Status: working with `playwright-core` against the installed Chrome binary; no browser
  download is required because `executablePath` points at it.
- Evidence: `scripts/capture.mjs` produced 390 × 844 @2x and 1440 × 900 captures from the
  preview build.
- Unblock: not needed while Chrome remains present. If it disappears, keep the last
  captures with their original provenance and record the tool failure rather than
  fabricating replacements.

## BL-05 Multi-tab write coordination

- Blocked on nothing, but deliberately not yet implemented: two tabs currently both own
  their in-memory state and the last writer wins the local save.
- Evidence: no lease module exists; `app/store.ts` writes on each commit and cadence tick.
- Unblock: implement B-01 (lease with heartbeat and revision checks) with tests.
- Risk note: with one tab open, the behaviour is already correct and deterministic.
