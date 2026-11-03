# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: multi-tab behaviour (spec 22.3). The first tab owns
the yard; a second tab shows `Following the other tab` with a **Take over** action, mirrors
the owner's checkpoint, and writes nothing. Closing the owner hands the lease to the
follower within about one second and production continues from the same ledger. Along the way
the save reference moved to an absolute wall clock, which also fixed a reopened tab crediting
zero offline production.

Current commit and remote sync status: the previous pushed head was `fb28325` (docs
checkpoint after `70c360f`). This pass adds one commit: the lease plus the two-clock fix and
its tests, documentation, and refreshed captures. After pushing, `git log --oneline
origin/main -1` is the verification line recorded in the commit message below. CI state:
still unread in this environment (BL-06: `gh` unauthenticated, the unauthenticated API 404s
for the private repository), so CI is reported as pending rather than green; the three local
checks plus a real-Chrome session are this pass's gate.

Checks run and actual results:
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npx vitest run` — 88 passed / 88 (9 files: economy, logistics, offline, chain,
  diagnostics, persistence ×2, ui, perf). No skipped tests, no deleted assertions. New:
  7 cases in `tests/persistence/lease.test.ts`, 1 in `tests/persistence/save.test.ts`
  (epoch-shaped `lastSeenMs`), 1 in `tests/ui/app.test.tsx` (mirror plus handover in the
  shell).
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.60 kB (1.53 gzip),
  JS 199.30 kB (63.04 gzip), 49 modules, ~479 ms.
- Headless simulation cost (Node 22.18, median of 3): 12 h tick-by-tick 4-machine 41.9 ms;
  idle event-jump < 1 ms; 500 machines × 6 000 ticks 24.8 ms; 100 × 10 000 7.0 ms;
  50 × 10 000 3.8 ms; 5 × 10 000 0.7 ms; 1 machine 0.5 ms. The 12 h case reads a few ms
  higher than the previous pass on the same code path, which is this machine's run-to-run
  spread; treat the table as bands.
- Real Chrome (two pages, one context) through `scripts/capture.mjs`: follower card
  `Following the other tab`, dock `Take over`, HUD identical to the owner
  (`Scrap 10 Ferrous 1 Nonferrous 1 Credits 39 Store 13/900`, tick 1040) while the lease read
  `{"owner":"t1-iur","heartbeatMs":1793689386491,"revision":28}`. After the owner page closed,
  one **Take over** press produced `{"owner":"t1-5atq","heartbeatMs":1793689389781,
  "revision":28}`, tick 1040 → 1050, scrap 10 → 11, and the card returned to the yard ladder
  (`Sell 1 Scrap for 1 credits.` / `A machine waits for input; check its empty side.`).
  The stored `lastSeenMs` is now a 13-digit epoch value (`1793689384704`).
- Machine panel still reads `Working 0% · waiting for input 100% · output waiting 0% · link
  0% busy · power 100%` with `Needs 3 residue, which nothing in the yard makes yet.`

Screenshot evidence and capture provenance: `docs/screenshots/latest-mobile.png` and
`latest-desktop.png` (scripted sessions at tick 1030, 3 machines — sorter ×15, furnace ×4,
polymer recycler — 6 routes, 39 credits; 390 × 844 @2x and 1440 × 900 @1x),
`latest-machine-mobile.png` (same mobile session, panel open) and the new
`latest-multitab.png` (second page while the first owns the lease), all recaptured
2026-11-03 from this build via `node scripts/capture.mjs` against `npm run preview`.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner
  authorization.
- BL-06 CI status read-back: needs an authenticated `gh` (`gh auth login`) or a readable
  status check; until then the badge is reported as pending.
- BL-11 human audio review: needs one listening pass.

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-19 as before, plus D-20 (one writer
per yard: owner id, 1.5 s heartbeat TTL, whole-snapshot adoption, controlled takeover) and
D-21 (two clocks: `Date.now` for the ledger and lease, `performance.now` for frame deltas;
older envelopes get exactly one capped window on their first load). Follower smoothness is
tracked as B-18.

Next three bounded tasks:
1. B-05 small research branch: three nodes with exact visible effects, bought with `data`,
   each applied exactly once. Needs the signal lab (R11) to produce `data`, so that blueprint
   arrives with the same pass.
2. B-15 reserve-floor sweep: {0, 5, 10, 20} through the chain fixture, one table in docs,
   chosen value documented.
3. B-17 rolling 60 s rate window: per-machine recent rate as spec 9.4 asks, with the window
   label next to the maximum rate.

Long-running processes owned by this session: the `vite preview` server on port 4173 was
started for the capture and stopped (pid 53652 released); nothing else is running.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before
editing; `tests/persistence/lease.test.ts` is the contract for the lease roles, TTL boundary,
non-writing follower, and handover/demotion; `tests/simulation/diagnostics.test.ts` for the
measured counters and the advance/advanceTo parity; `tests/simulation/chain.test.ts` for
chain throughput and sell behaviour. To refresh the README evidence: `npm run build`, start
`npm run preview`, then `node scripts/capture.mjs` (it prints the session state, the opened
machine panel's text, and the two-page lease lines; allow about three minutes).
