# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: B-16, the resting HUD's area share is now measured, and two
layout levers brought every phone size into or beside the 15–22 % band of spec 5.2.
`node scripts/measure-hud.mjs` opens the production build in headless Chrome at the six sizes of
spec 25.1 with the mature-yard save installed and unions the painted HUD boxes over the visual
viewport: **22.1 %** at 360 × 640, **14.7 %** at 390 × 844, **13.5 %** at 412 × 915, **21.1 %** at
844 × 390, **7.2 %** at 820 × 1180, **5.4 %** at 1440 × 900 (`docs/evidence/2026-11-03-hud-share.md`).
Before the two levers the narrowest phone read 24.2 % with three wrapped chip rows. Decision D-30:
`hudChipLimit()` budgets four chips at ≤ 420 CSS px and seven above (the credits and Store chips pay
for themselves out of that budget), the dock is capped at `min(100%, 560px)` and centred, chip
padding went 4 → 3 px and `.dock__btn` min-height 48 → 46 px. Visible on a phone now: `Scrap 10 ·
Ferrous 5 · Credits 130 · Store 332/900` instead of five chips over three rows.

Current commit and remote sync status: `266d9d6` ("Measure the HUD area share and cap chips and dock
width (B-16)") is the pushed `origin/main` head after `git push origin HEAD:main` (`fc99db1..266d9d6`,
verified by `git rev-parse HEAD origin/main`, both `266d9d6d958c824cd287fe7eee6d72b7260326d0`); a
documentation-only checkpoint commit (this line) sits on top of it. The previous pushed head was
`fc99db1` ("Record pushed head 4ac39c5 and the pass scope"), before that `4ac39c5` (B-17),
`0506f46`, `57f15af`.
CI state: still unread in this environment (BL-06: `gh run list` asks for `gh auth login`, the
unauthenticated API 404s for the private repository), so CI is reported as pending, not green.

Checks run and actual results (this pass):
- `npm run typecheck` — clean (tsc 5.6.3, strict; it runs as part of `npm run build` too).
- `npx vitest run` — **124 passed / 124** (15 files), no skipped tests, no deleted assertions. New
  `tests/ui/hud-layout.test.ts` contributes 3 cases: the four/seven chip budget at six widths, the
  sell-order cap with the budget arithmetic the HUD uses, and empty stocks producing no chip.
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.65 kB (1.55 gzip),
  **JS 206.35 kB (65.22 kB gzip)**, 50 modules, 470–499 ms (+0.06 kB gzip over `fc99db1`).
- `node scripts/measure-hud.mjs` — the table quoted above, plus build mode (3 dock targets, smallest
  76 × 46 px at 360) and the store-panel state (panel 46–56.6 % of the viewport, which spec 5.2
  allows). **No-scroll gate met in 6/6 sizes in all three states**: `scrollWidth`/`scrollHeight`
  equal the visual viewport exactly, which is real-Chrome evidence for the structural half of BL-01
  (jsdom always reports `scrollHeight` 0, so the suite could not show this).
- Touch geometry: smallest dock target 46.8 × 46 px and smallest icon button 50.3 × 44 px at
  360 × 640, four dock targets at rest and three in build mode (spec 6.2, spec 5.5).
- Headless CPU table unchanged from `4ac39c5` on purpose: this pass touched only `src/ui/*` and CSS,
  no simulation code, so `tests/perf/bench.test.ts` numbers still describe this build.
- Real Chrome through `scripts/capture.mjs` (all five images recaptured from this build): mobile
  absence `tick 1 010 → 433 020` with `Ferrous +110 · Nonferrous +550 · Steel +220 · Deliveries 342 ·
  Batches 774 · Bottleneck storage-full`; final mobile yard 4 machines (sorter L6 ×582, furnace L6
  ×232, polymer recycler L5 ×1, copper separator L6 ×4) on 9 links, 130 credits, tick 433 630, HUD
  `Scrap 10 Ferrous 5 Credits 130 Store 332/900`; the selected recycler still prints the B-17 window
  line. Desktop context (seeded with the probe's save): 8 machines on 18 links, tick 482 901,
  `circuits 16, data 20`, three research nodes, seven chips `Scrap 10 Ferrous 107 Nonferrous 191
  Steel 10 Copper 10 Polymer 10 Store 900/900`, its own absence `tick 50 241 → 482 251` with
  `Deliveries 0 · Batches 0` (store starts at 900/900). Two-page lease `t1-974f → t1-ka9j` with the
  tick advancing 433 640 → 433 671 and the promoted card reading `upgrade Polymer recycler`.

Screenshot evidence and capture provenance: all five images recaptured 2026-11-03 from this build
(`npm run build` → `npm run preview` → `node scripts/capture.mjs`) — `latest-mobile.png`,
`latest-machine-mobile.png`, `latest-multitab.png` (one 390 × 844 @2x context) and
`latest-desktop.png`, `latest-research.png` (separate 1440 × 900 @1x context seeded with
`docs/evidence/yard-mature.json`). The visible difference from the previous set is the HUD: four
chips on the phone images instead of five, and the desktop dock centred at 560 px instead of
spanning 1 420 px. Gallery rows carry the per-image state lines quoted in the README.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace. (The no-scroll
  and target-size parts are now measured in Chrome; frame rate and thermals are not.)
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
- BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
- BL-11 human audio review: needs one listening pass.
  (BL-04, BL-05, BL-07 stay resolved.)

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-29 as before, plus **D-30** (chip budget from
viewport width, 560 px centred dock, 3 px chip padding, 46 px dock buttons), with the rejected
options recorded: leaving 24.2 % as "roughly" in band, shrinking fonts, and merging the Store chip
into the Scrap chip (rejected because `storeUnits` and the scrap quantity are different numbers).
The `Measured` occupancy percentages still stay lifetime-since-built. Save schema is unchanged (1).

Next three bounded tasks:
1. B-13 large-text and contrast audit: the same `scripts/measure-hud.mjs` gains a pass with
   `textScale` 2.0 at 360 × 640 — panel and HUD share, visible focus, high-contrast selection
   outlines, and whether every panel still paginates without document scroll.
2. B-25 organic research unlock on the phone: raise the post-absence tap phase until the mobile yard
   buys its first node (probe: round 504 at floor 10) and photograph `latest-research.png` at
   390 × 844 with its own gallery row.
3. B-26 short-viewport HUD band: the strict row-union measure is still 24 % at 360 × 640 and
   27.9 % at 844 × 390; spend the objective card's third line and re-measure both states.

Long-running processes owned by this session: none. The `vite preview` server on port 4173 was
started for the measurements and the captures and stopped at the end of the pass; nothing else runs.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
`tests/ui/hud-layout.test.ts` holds the chip budget, `tests/simulation/rate-window.test.ts` the rate
window and the advance/advanceTo parity, `tests/simulation/autoconnect.test.ts` the one-link rule,
`tests/simulation/chain.test.ts` the ladder and self-play regression,
`tests/simulation/supply-window.test.ts` the floor sweep. To refresh the layout table: `npm run
build`, start `npm run preview`, then `node scripts/measure-hud.mjs` (~15 s). To refresh the README
evidence: `node scripts/capture.mjs` (~8 minutes; it prints the session state, the return report,
the opened machine panel's text, the research panel's text, and the two-page lease lines). To
regenerate the headless tables and the desktop seed: `npx tsx scripts/probe-supply.mjs`.
