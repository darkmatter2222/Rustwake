# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: B-23, one link per material. `planConnections` now keys a
suggested input on `(destination machine, material)` and an output on `(source machine, material)`
and ignores the far endpoint, so a second parallel link for a material that already arrives cannot
be proposed. Source choice is measured rather than assumed: the store when it holds at least one
whole batch (its pull is window-sized, two ready batches per tap), otherwise the producing machine.
In the 30-minute self-play session the settled yard went from 22 links with 3 at 0 % busy and 7
machines to **18 links with 0 at 0 % busy and 8 machines**, the circuit assembler went from 1 batch
to 38, and the signal lab appeared with `data 20` — which is what let the research panel be
photographed for the first time.

Current commit and remote sync status: this pass's commit is the `origin/main` head after
`git push origin HEAD:main`; `git rev-parse HEAD origin/main` printed the same SHA twice
(`3f078127facdf69cd639c5ae6078d9384763ffec` was the parent, "Pin tsx as a devDependency"). CI
state: still unread in this environment (BL-06: `gh run list` asks for `gh auth login`, the
unauthenticated API 404s for the private repository), so CI is reported as pending, not green.

Checks run and actual results (this pass):
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npx vitest run` — **116 passed / 116** (13 files), no skipped tests, no deleted assertions.
  New `tests/simulation/autoconnect.test.ts` contributes 4 cases (producer link below one batch,
  store link at a full batch, idempotent second call, one link per output material). The three
  `tests/simulation/supply-window.test.ts` cases were restated for the new topology and now pin, at
  every floor, 8 machines / 3 research nodes / ≥ 16 links / **0 links at 0 % busy** / aggregate
  busy ≥ 9 %. One `tests/ui/app.test.tsx` fixture asserts the selected furnace's own
  `inRoutes`/`outRoute` instead of the sorter's `outRoute`, which is what a plan keyed on the
  selected machine produces.
- `npx tsx scripts/probe-supply.mjs` — 4 floors in one process (~4 s). Floors {0, 5, 10, 20} finish
  at 8 machines and 3 nodes each with **1 075 / 1 056 / 1 018 / 1 103** batches and aggregate link
  busy **9.9 / 9.8 / 9.3 / 12.5 %**, all with no idle link. Milestones now printed by the probe:
  last build `signalLab@421 / @421 / @396 / @373`, first research purchase round 460 / 456 / 504 /
  825. Producer-first versus store-first at floor 10: 926 batches with 1 node (producer-first)
  against 1 018 with 3 (store-first, shipped).
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.60 kB (1.53 gzip),
  **JS 205.44 kB (64.90 gzip)**, 50 modules, 476 ms.
- Headless cost (Node 22.18, median of 3, `tests/perf/bench.test.ts`): 12 h 4-machine tick-by-tick
  **42.2 ms** (was 59.3 ms at 22 links); idle event-jump < 1 ms; 500 × 6 000 41.0 ms;
  100 × 10 000 13.7 ms; 50 × 10 000 6.1 ms; 5 × 10 000 1.0 ms; 1 × 10 000 0.8 ms. Only the 12 h
  case moved materially, as expected from 18 links instead of 22 per tick.
- Real Chrome through `scripts/capture.mjs`: mobile absence `tick 1010 → 433 020` with the report
  `Ferrous +110 · Nonferrous +550 · Steel +220 · Deliveries 342 · Batches 774 · Bottleneck
  storage-full`; final mobile yard 4 machines (sorter L6 ×582, furnace L6 ×232, polymer recycler
  L5 ×1, copper separator L6 ×4) on 9 links, 130 credits, HUD `Scrap 10 Ferrous 5 Nonferrous 83
  Credits 130 Store 332/900`; the selected recycler read `Cycle 4.29s · Working 0% · waiting for
  input 100% · output waiting 0% · link 10% busy · power 100%` and named the copper separator as its
  limiter. Desktop context (seeded) reached 8 machines on 18 links with
  `research {cutters, buffers, dispatch}`, `circuits 16, data 20`, tick 454 370, and the research
  panel open showing `Data 20` plus the three known effect lines. Two-page lease: follower
  `Following the other tab` with dock `Take over`; after the owner closed, the lease moved
  `t1-kou8 → t1-7ujv` and the tick advanced 433 640 → 433 669.

Screenshot evidence and capture provenance: five images recaptured 2026-11-03 from this build with
`npm run build` → `npm run preview` → `node scripts/capture.mjs` —
`latest-mobile.png`, `latest-machine-mobile.png`, `latest-multitab.png` (one 390 × 844 @2x context,
three states), `latest-desktop.png` and `latest-research.png` (separate 1440 × 900 @1x context
seeded with `docs/evidence/yard-mature.json` before first paint). The gallery in the README carries
the per-image state lines and the quoted capture-script output. **BL-07 is closed** by
`latest-research.png`; the phone-viewport research image is now B-25.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
- BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
- BL-11 human audio review: needs one listening pass.
  (BL-04 and BL-05 stay resolved; BL-07 closed this pass.)

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-27 as before, plus **D-28** (one link per
material keyed on the endpoint the machine owns, store preferred at ≥ 1 batch; supersedes D-27's
floor-sweep table, not its shipped floor). The reserve floor stays 10 — after the change every floor
reaches the same depth, so it is kept for the sellable-surplus reason. `MachineState.tray`, the saved
`RouteState` shape, and the schema version are unchanged, so no migration is involved.

Next three bounded tasks:
1. B-17 rolling 60 s rate window: per-machine recent rate as spec 9.4 asks, with the window label
   shown in the panel next to the maximum rate, and the lifetime counters kept as a second line.
2. B-16 HUD area share: bounding-box sum of HUD elements as a share of the visual viewport at
   360 × 640, 390 × 844 and 1440 × 900, against the 15–22 % design target.
3. B-13 large-text and contrast audit, then B-25 (raise the mobile tap phase until the phone yard
   buys its first research node, ~round 504, and photograph `latest-research.png` at 390 × 844).

Long-running processes owned by this session: none. The `vite preview` server on port 4173 was
started for the captures and stopped after them.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
`tests/simulation/autoconnect.test.ts` holds the one-link contract, `tests/simulation/chain.test.ts`
the ladder and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep and
utilisation floors. To refresh the README evidence: `npm run build`, start `npm run preview`, then
`node scripts/capture.mjs` (~8 minutes; it prints the session state, the return report, the opened
machine panel's text, the research panel's text, and the two-page lease lines). To regenerate the
headless tables and the desktop seed save: `npx tsx scripts/probe-supply.mjs`.
