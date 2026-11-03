# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: the machine panel now explains itself. Each machine
shows one measured line (`Working 62% · waiting for input 38% · output waiting 0% · link
55% busy · power 100%`) computed from counters the simulation itself keeps, plus one
**Next step** sentence chosen from the strongest evidence — sometimes "no purchase needed",
sometimes naming the supplier machine as the limiter. The store panel carries the yard-level
version (storage %, power %, busiest link, machines waiting).

Current commit and remote sync status: `70c360f` ("Resolve one selection-aware yard step so
the card and dock always match") is the pushed `origin/main` head, verified by
`git log --oneline origin/main -3` after a fast-forward push from `be57a5b` (which
`git fetch` confirmed was still the remote head immediately before pushing). The measured-
counters commit `f7d120a` is its parent. CI state: still unread in this environment
(BL-06: `gh` unauthenticated, the unauthenticated API 404s for the private repository), so
CI is reported as pending rather than green; the three local checks are this pass's gate.

Checks run and actual results:
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npx vitest run` — 79 passed / 79 (8 files: economy, logistics, offline, chain,
  diagnostics, persistence, ui, perf). No skipped tests, no deleted assertions.
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.60 kB (1.53 gzip),
  JS 197.40 kB (62.31 gzip), 48 modules, ~459 ms.
- Headless simulation cost (Node 22.18, median of 3): 12 h tick-by-tick catch-up with
  4 machines 29.9 ms; idle-yard event jump < 1 ms; 500 machines × 6 000 ticks 21.8 ms;
  100 × 10 000 ticks 6.6 ms; 50 × 10 000 ticks 3.5 ms; 1 machine 0.5 ms. The counters added
  about 1.9–2.8 ms at 500 machines and about 2 ms on the 12 h case.
- New behaviour tests: advance vs advanceTo produce identical `machines`, `routes`, and
  `store` serialisations; a 900-tick jumped window reports `ageTicks` 900 and
  `starvedTicks` 900 with 0 busy ticks; a legacy save with the counters stripped loads, gets
  zero-filled, and still renders percentage lines with no NaN; the card sentence and the dock
  label name the same machine when one is selected.
- Browser behaviour exercised in real Chrome through `scripts/capture.mjs`, which now also
  taps a grid until a panel opens and prints its text. The rendered mobile panel read:
  `Working 0% · waiting for input 100% · output waiting 0% · link 0% busy · power 100%` and
  `Needs 3 residue, which nothing in the yard makes yet. Build the machine that outputs it,
  then connect.` With that panel open, the card and the dock both read
  `Build Copper separator · 25 Scrap + 5 Ferrous`.

Screenshot evidence and capture provenance: `docs/screenshots/latest-mobile.png` and
`docs/screenshots/latest-desktop.png` (both scripted sessions at tick 1006, 3 machines,
6 routes, 39 credits; 390 × 844 @2x and 1440 × 900 @1x) plus
`docs/screenshots/latest-machine-mobile.png` (same mobile session, machine panel open), all
recaptured 2026-11-03 from the current production preview build. Earlier pairs are
superseded, not relabelled.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner
  authorization.
- BL-06 CI status read-back: needs an authenticated `gh` (`gh auth login`) or a readable
  status check; until then the badge is reported as pending.
- BL-11 human audio review: needs one listening pass.

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-16 as before, plus D-17 measured
occupancy counters in the simulation state, D-18 the jump path accounts for idle time and
steps the last tick, and D-19 one selection-aware yard step per screen. Percentages are
lifetime-since-built (see B-17 for the 60 s window).

Next three bounded tasks:
1. B-01 multi-tab single-writer lease: owner id plus heartbeat, read-only second tab,
   revision-checked takeover, tests for both paths.
2. B-05 small research branch: three nodes with exact visible effects, purchased with data,
   each effect applied exactly once.
3. B-15 reserve-floor sweep {0, 5, 10, 20} through the chain fixture, one table in docs,
   chosen value documented.

Long-running processes owned by this session: the `vite preview` server on port 4173 was
started for capture and stopped (pid 48540 released); nothing else is running.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before
editing; `tests/simulation/diagnostics.test.ts` is the contract for the measured counters
and the advance/advanceTo parity, `tests/simulation/chain.test.ts` for chain throughput and
sell behaviour, `tests/simulation/logistics.test.ts` for routes and power. To refresh the
README evidence: `npm run build`, start `npm run preview`, then `node scripts/capture.mjs`
(it prints the session state and the opened machine panel's text).
