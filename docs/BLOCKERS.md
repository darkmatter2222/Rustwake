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

- Status: resolved with B-01 (2026-11-03). `game/persistence/lease.ts` stores
  `{owner, heartbeatMs, revision}` under `rustwake.lease.v1`; only the holder ticks and
  writes, extra tabs adopt whole checkpoints, and promotion requires the lease to be absent,
  own, or older than the 1.5 s TTL.
- Evidence: `tests/persistence/lease.test.ts` (7 cases) plus the two-page real-Chrome session
  printed by `scripts/capture.mjs`, where the lease id changes only after the owner closes.
- Risk note: with one tab open, the behaviour is the same single-writer path.

## BL-07 Research-panel visual gate

- Blocked: no photograph of the research panel yet, so B-05's visual acceptance stays open
  while its behaviour is covered by tests.
- Evidence: after B-19 the scripted capture session ends with `research: {}` and no `data`;
  the headless 30-minute driver reaches the circuit assembler at batch ×1 and does not buy the
  signal lab, so the dock target (which needs `data > 0`) never unlocks inside the window.
  The floor sweep confirms it: every floor of `npx tsx scripts/probe-supply.mjs` ends with
  `research=0`, because the ladder spends its credits on the seven earlier blueprints before
  `signalLab` becomes affordable.
- Unblock: give the capture session a third click phase long enough to build the signal lab
  (50 scrap + 12 ferrous), or seed a second capture context with an engine-produced save whose
  `store.data` is already positive.
- Meanwhile: `tests/ui/app.test.tsx` asserts the panel's exact strings and the one-purchase
  ledger change; the gallery records the gap instead of reusing an older image.

## BL-06 CI result read-back

- Blocked: the GitHub Actions run for `origin/main` cannot be inspected from this session,
  so its outcome is recorded as pending rather than green.
- Evidence: `gh run list` reports "To get started with GitHub CLI, please run: gh auth
  login"; the unauthenticated `api.github.com` lookup for the private repository returns
  404. The workflow file itself (`.github/workflows/ci.yml`) is present and identical in
  content to the one that ran previously.
- Unblock: an authenticated `gh` on this machine (`gh auth login`) or an exported
  `GH_TOKEN`, then `gh run list --repo darkmatter2222/Rustwake`.
- Meanwhile: run the same steps locally in the documented order — `npm run typecheck`,
  `npx vitest run`, `npm run build` — and record those three results as the effective
  gate, with the CI badge kept as pending.
