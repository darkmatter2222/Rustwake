# BLOCKERS

Each entry: exact blocker, evidence, unblock condition, work that continues meanwhile.

## BL-01 Real-device performance traces

- Blocked: 30/60 FPS stability, p95 main-thread work under 10 ms, thermal soak, battery
  use on midrange Android and iPhone.
- Evidence: only Node CPU medians exist (`tests/perf/bench.test.ts`); jsdom has no
  compositor. The README lists Node numbers as Node numbers.
- Now measured in headless Chrome instead of jsdom (`scripts/measure-hud.mjs`, 2026-11-03): the
  no-scroll gate at six sizes in three HUD states × three text scales (18/18 contexts), the HUD
  area share against the 15–22 % target, the minimum touch-target sizes, panel fit and internal
  scroll at 2.0 text, the WCAG AA contrast of ten text pairs, and the focus ring a real `Tab`
  produces. Those are layout facts a device would not change; frame rate, p95 frame work and
  thermals still are not measured anywhere.
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

- Status: resolved with B-20 (2026-11-03). `docs/screenshots/latest-research.png` shows the panel
  open on a mature yard, and the gallery row names its provenance.
- Evidence: `scripts/probe-supply.mjs` now writes `docs/evidence/yard-mature.json` (the floor-10
  state encoded with the app's own `encodeSave`), and `scripts/capture.mjs` installs it into the
  desktop context with `addInitScript` before first paint. That yard has `data 20`, so the research
  dock target unlocks and the panel prints `Data 20` plus the three known effect lines.
- Remaining gap: the 60-tap mobile session still stops before `data > 0`, so the phone-viewport
  research image is tracked as B-25 rather than claimed here.
- Meanwhile: `tests/ui/app.test.tsx` still asserts the panel's exact strings and the one-purchase
  ledger change, so the behaviour is covered even where an image is not.

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

## BL-11 Human audio review

- Blocked: harshness, fatigue, and mix balance of the synthesised cues are unjudged, which spec
  24.2 does not let code inspection settle.
- Evidence: the audio tests assert scheduling, voice budget, and mute persistence, not timbre; the
  bus table in `game/audio/audio.ts` is a design default that no one has listened to end to end.
- Unblock: one listening pass on the running build with per-cue notes and gain adjustments.
- Meanwhile: keep cues rate-limited and the voice pool bounded, and keep the mute state persisted so
  an automated browser never plays audio on the operator's speakers.
