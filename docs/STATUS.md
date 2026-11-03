# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: B-17, the machine panel's rate is now a measured window.
`Actual rate` reads the last complete 60 s window, or all available time while the machine is
younger than one window, and the line names the span it used — the real-Chrome capture shows
`Actual rate 0.00 batches/s · 60s window` directly above `Max rate 0.23 batches/s at full power`.
Each machine carries two `(age, batchesDone)` samples on a fixed 600-tick grid, rolled once a minute
from the tick loop and from the event-jump branch, so the whole `machines` array still serialises
identically under `advance` and `advanceTo` (decision D-29). Schema version is unchanged.

Current commit and remote sync status: `4ac39c5` ("Measure machine rate over a 60 s window (B-17)")
is the pushed `origin/main` head after `git push origin HEAD:main`; a documentation-only checkpoint
commit (this line) sits on top of it. The previous pushed head was `0506f46` ("Record pushed head
57f15af and the pass scope").
CI state: still unread in this environment (BL-06: `gh run list` asks for `gh auth login`, the
unauthenticated API 404s for the private repository), so CI is reported as pending, not green.

Checks run and actual results (this pass):
- `npm run typecheck` — clean (tsc 5.6.3, strict).
- `npx vitest run` — **121 passed / 121** (14 files), no skipped tests, no deleted assertions.
  New `tests/simulation/rate-window.test.ts` contributes 5 cases: a young machine uses all
  available time (window 30 s at 300 ticks), the first full window reads 60 s, a starved tail reads
  0.00 batches/s while the lifetime average is positive, byte parity of the machine array between
  the two advance paths, and a save written without the four fields still yields a finite reading.
  `tests/ui/app.test.tsx` gained 2 assertions: the panel contains `s window` and the rate equals
  `batchesDone / 30` for the 300-tick fixture.
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.60 kB (1.53 gzip),
  **JS 206.21 kB (65.16 kB gzip)**, 50 modules, 473 ms (+0.26 kB gzip over `0506f46`).
- Headless cost (Node 22.18, median of 3, unchanged harness): 12 h 4-machine tick-by-tick
  **41.2 ms**; idle event-jump < 1 ms; 500 × 6 000 41.7 ms; 100 × 10 000 13.4 ms; 50 × 10 000
  6.4 ms; 5 × 10 000 0.97 ms; 1 × 10 000 0.71 ms — every row inside the previous pass's spread
  (42.2 / < 1 / 41.0 / 13.7 / 6.1 / 1.0 / 0.76), so the window is unmeasurably cheap.
- `npx tsx scripts/probe-supply.mjs` — identical output to the previous pass (floors {0, 5, 10, 20}
  at 8 machines and 3 nodes with 1 075 / 1 056 / 1 018 / 1 103 batches and aggregate link busy
  9.9 / 9.8 / 9.3 / 12.5 %), which is the behaviour-neutrality check for the new counters.
- Real Chrome through `scripts/capture.mjs`: mobile absence `tick 1 020 → 433 030` with the report
  `Ferrous +110 · Nonferrous +549 · Steel +219 · Deliveries 342 · Batches 773 · Bottleneck
  storage-full`; final mobile yard 4 machines (sorter L6 ×582, furnace L6 ×232, polymer recycler
  L5 ×1, copper separator L6 ×4) on 9 links, 130 credits, HUD `Scrap 10 Ferrous 5 Nonferrous 83
  Credits 130 Store 332/900`, tick 433 640. The selected recycler's panel printed the new rate line
  and the lifetime `Measured` line together. Desktop context (seeded with the probe's save) reached
  8 machines on 18 links, `research {cutters, buffers, dispatch}`, `circuits 16, data 20`, tick
  454 259, research panel open on `Data 20`; its own absence read `tick 21 599 → 453 609` with
  `Nonferrous +16 · Plates +12 · Deliveries 4 · Batches 39` (storage-limited, as before).
  Two-page lease: `t1-7by6 → t1-7eik` with the tick advancing 433 650 → 433 679.

Screenshot evidence and capture provenance: all five images recaptured 2026-11-03 from this build
(`npm run build` → `npm run preview` → `node scripts/capture.mjs`) — `latest-mobile.png`,
`latest-machine-mobile.png`, `latest-multitab.png` (one 390 × 844 @2x context) and
`latest-desktop.png`, `latest-research.png` (separate 1440 × 900 @1x context seeded with
`docs/evidence/yard-mature.json`). The machine-panel image is the one whose text changed: it now
carries the window label. Gallery rows carry the per-image state lines quoted above.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace.
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
- BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
- BL-11 human audio review: needs one listening pass.
  (BL-04, BL-05, BL-07 stay resolved.)

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-28 as before, plus **D-29** (two samples on a
600-tick grid for the measured window, with the single-sample sawtooth and a completion-tick ring
recorded as the rejected options). The `Measured` occupancy percentages deliberately stay
lifetime-since-built, so the panel shows two different windows and labels each. Saved shape: four
new integers per machine, schema 1, forward-filled by `migrate` and validated by `validateSim`.

Next three bounded tasks:
1. B-16 HUD area share: bounding-box sum of the resting HUD's elements as a share of the visual
   viewport at 360 × 640, 390 × 844 and 1440 × 900, against the 15–22 % design target.
2. B-13 large-text and contrast audit: panel and HUD at 360 × 640 with `textScale` 2.0, visible
   focus, high-contrast selection outlines, with pagination behaviour recorded.
3. B-25 organic research unlock on the phone: raise the post-absence tap phase until the mobile yard
   buys its first node (probe: round 504 at floor 10) and photograph `latest-research.png` at
   390 × 844 with its own gallery row.

Long-running processes owned by this session: none. The `vite preview` server on port 4173 was
started for the captures and stopped after them.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
`tests/simulation/rate-window.test.ts` holds the window contract and the advance/advanceTo parity
for it, `tests/simulation/autoconnect.test.ts` the one-link rule, `tests/simulation/chain.test.ts`
the ladder and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep. To
refresh the README evidence: `npm run build`, start `npm run preview`, then `node scripts/capture.mjs`
(~8 minutes; it prints the session state, the return report, the opened machine panel's text, the
research panel's text, and the two-page lease lines). To regenerate the headless tables and the
desktop seed: `npx tsx scripts/probe-supply.mjs`.
