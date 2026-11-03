# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: the copper and polymer chain is playable. The build
picker reveals seven blueprints in five steps, each new machine is linked with one
**Connect** action, a machine panel now shows `4.00s → 3.64s · 45 credits` before an
upgrade is bought, surplus material is sold at published per-unit prices in capped
tranches, and the objective card and the dock button now come from one shared ladder so
they always name the same next step. The action toast now dismisses during the frame loop.

Current commit and remote sync status: the previous pushed head was `9bb6561`
("Record pushed head and CI state for the M1 checkpoint"); this pass adds the M2 chain
work on top of it and is pushed with `git push origin HEAD:main`. `git log --oneline -1`
after the push is the authoritative head for the next pass. CI state: the GitHub
Actions run for the previous push could not be read back — `gh` is unauthenticated in
this environment and the unauthenticated API returns 404 for the private repository
(recorded as BL-06 in `docs/BLOCKERS.md`). Treat CI as pending/unread rather than green.

Checks run and actual results:
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npx vitest run` — 66 passed / 66 (8 files: economy, logistics, offline, chain,
  persistence, ui, perf). No skipped tests, no deleted assertions.
- `npm run build` — succeeded: `index.html` 0.68 kB (0.37 gzip), CSS 4.60 kB (1.53 gzip),
  JS 191.89 kB (60.75 gzip), 46 modules, ~494 ms.
- Headless simulation cost (Node 22.18, median of 3): 12 h tick-by-tick catch-up with
  4 machines 28 ms; idle-yard event jump < 1 ms; 500 machines × 6 000 ticks 19 ms;
  100 machines × 10 000 ticks 6 ms.
- Chain fixture (1 200 ticks, seeded store): sorter 29 and copper separator 23 batches at
  their cycle limits; wire mill 12 and polymer recycler 14 batches at their supply limits;
  per-resource totals reconcile exactly against completed batches.
- Browser behaviour exercised twice: jsdom-driven React tests (gate, salvage, tutorial,
  blocked-action toast plus self-dismissal, store sell, machine Connect) and a real Chrome
  headless session through `scripts/capture.mjs`, which is what surfaced the toast defect.

Screenshot evidence and capture provenance: `docs/screenshots/latest-mobile.png`
(390 × 844 @2x) and `docs/screenshots/latest-desktop.png` (1440 × 900 @1x), recaptured
2026-11-03 from the current production preview build. Both scripted sessions reached
tutorial 8 with three machines (sorter, furnace, polymer recycler), 6 routes, 39 credits,
tick 1008. The 2026-11-02 pair (two machines, tick 750) is superseded, not relabelled.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner
  authorization.
- BL-06 CI status read-back: needs an authenticated `gh` (`gh auth login`) or a readable
  status check; until then the badge is reported as pending.
- BL-11 human audio review: needs one listening pass.

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-12 as before, plus D-13 one-way
export prices with a capped tranche and reserve floor, D-14 one shared yard ladder,
D-15 progressive blueprint reveal, D-16 frame-render-safe timers.

Next three bounded tasks:
1. B-03 bottleneck assistant: measured occupancy, starvation percentage, route utilisation,
   and power ratio per machine, with one recommendation that is not always a purchase.
2. B-01 multi-tab single-writer lease: owner id plus heartbeat, read-only second tab,
   revision-checked takeover, tests for both paths.
3. B-05 small research branch: three nodes with exact visible effects, purchased with data,
   each effect applied exactly once.

Long-running processes owned by this session: the `vite preview` server on port 4173 was
started for capture and stopped (pid 48400 released); nothing else is running.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before
editing; `tests/simulation/chain.test.ts` is the contract for chain throughput and sell
behaviour, and `tests/simulation/logistics.test.ts` for route and power behaviour. To
refresh the README evidence, run `npm run build`, start `npm run preview`, then
`node scripts/capture.mjs` (it prints the resulting session state as a JSON summary).
