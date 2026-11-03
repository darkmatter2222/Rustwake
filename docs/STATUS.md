# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: **B-26 and B-27, the HUD density pass.** Every objective
sentence from the yard ladder now fits one line at 360 px, the dock's primary button carries the
verb plus its price while the card above names the machine, the chip budget knows the viewport
height, and a landscape phone gets a one-row chip block plus narrower card and dock columns. The
strict row-union measure is inside the 15–22 % band of spec 5.2 at the default and 1.5 text scales
(20.6 % at 360 × 640, 21.9 % in landscape), and at text scale 2.0 the resting HUD paints 40.5 % of
a 360 × 640 screen instead of 57.4 %. `node scripts/measure-hud.mjs` gained a fourth gate — the
furthest painted right/bottom edge per state — which found and now pins a real clip: the previous
build's fourth dock target hung 21 px past a 360 px screen at scale 2.0, hidden by `overflow:
hidden`; all 18 contexts now report none. Measured table:
`docs/evidence/2026-11-03-hud-share.md`.

- Resting painted share at scale 1.0: **19.2 %** at 360 × 640, **14.3 %** at 390 × 844,
  **13.0 %** at 412 × 915, **15.9 %** at 844 × 390, **6.9 %** at 820 × 1180, **5.1 %** at
  1440 × 900. Peak across the six sizes: **19.5 %** at scale 1.5, **40.5 %** at 2.0.
- Row-union `band` at scale 1.0: **20.6 %** (360 × 640), 15.7 % (390 × 844), 14.5 % (412 × 915),
  **21.9 %** (844 × 390), 8.8 % tablet, 8.4 % desktop. At 1.5 the peak is 24 %.
- Touch and structure unchanged in the good sense: smallest dock target 46.8 × 46 px at scale 1.0
  and 94.6 × 46 px at 2.0, smallest icon button 44 × 44 px (44 × 65.2 px at 2.0), four dock targets
  at rest, three in build mode (spec 6.2, spec 5.5); no document scroll in 18/18; every panel still
  0 px inner scroll with Close inside; minimum contrast unchanged at **5.77:1** over 10 text pairs.
- Objective card height at scale 1.0: 49.6 px portrait (one text line plus the hint) and **29.8 px**
  in landscape, where the hint line steps back for the vertical budget.

Current commit and remote sync status: `5c95e33` ("Fit the HUD band and compact the dock at large
text (B-26, B-27)") is the pushed `origin/main` head after `git push origin HEAD:main`
(`5753efc..5c95e33`, verified by `git rev-parse HEAD origin/main`, both
`5c95e33018cfec17ef71f0c170731d25acf5dfa3`); this documentation-only checkpoint sits on top of it.
Before that: `5753efc` / `808dbc8` (the B-13 pass), `0a4964e`, `266d9d6`, `fc99db1`, `4ac39c5`,
`0506f46`, `57f15af`. `docs/DECISIONS.md` **D-32** is the design record of this pass. CI remains
unread in this environment (BL-06: `gh run list` asks for `gh auth login`, the unauthenticated API
404s for the private repository), so CI is reported as pending, not green.

Checks run and actual results (this pass):
- `npx vitest run` — **129 passed / 129** (15 files), no skipped tests, no deleted assertions.
  Two new cases: `tests/ui/hud-layout.test.ts` pins the height-aware budget (5 chips at 844 × 390
  and at the 460 px boundary, 7 at 461 px), and `tests/ui/app.test.tsx` pins the card at ≤ 48
  characters with the same leading verb as the dock's primary button. Two existing assertions were
  updated with the shortened strings, not removed: `chain.test.ts` now expects the dock label
  `Upgrade` while the card still contains `Furnace`, and `research.test.ts` expects the exact
  one-line card `Research Efficient Cutters · 4 Data` (the effect sentence stays asserted in the
  research-panel case in `app.test.tsx`).
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 5.15 kB (**1.69 kB gzip**),
  **JS 207.60 kB (65.64 kB gzip)**, 50 modules, 473 ms. `tsc --noEmit` runs inside `npm run build`
  and is clean. Artifacts `index-BONbSNIw.js` and `index-BTmHMPUU.css` are what the screenshots
  below were taken from.
- `node scripts/measure-hud.mjs` — the numbers quoted above, regenerated after the final build
  (18 contexts: six sizes of spec 25.1 × three text scales × three states, one Chrome instance).
- `node scripts/capture.mjs` — all five images recaptured from this build; the printed session
  state is `tick 433 630`, 4 machines, 9 links, 130 credits, `research: {}` on the phone, and the
  seeded desktop context reads `tick 555 015`, 8 machines, 18 links, `circuits 16, data 20`.
- Headless CPU table unchanged on purpose: this pass touched only `src/ui/*`, CSS and the audit
  script, no simulation code, so `tests/perf/bench.test.ts` numbers still describe this build.

Screenshot evidence and capture provenance: all five images recaptured 2026-11-03 from this build
(`npm run build` → `npm run preview` → `node scripts/capture.mjs`). `latest-mobile.png` and
`latest-machine-mobile.png` at 10:04:48, `latest-multitab.png` at 10:04:49, `latest-desktop.png`
and `latest-research.png` at 10:08:30, from artifacts `index-BONbSNIw.js` / `index-BTmHMPUU.css`;
the last two came back byte-identical to the previous capture (the seeded context renders the same
8-machine yard at the same animation phase), so three image files changed in this commit.
What is new in them relative to the previous set: the objective card is one line
(`Upgrade the Polymer recycler.` after the handover, logged verbatim by the script), the dock's
primary is `Upgrade` over `92 credits`, and the chip block in the mobile shots is unchanged at four
chips in two rows. Capture log for this build: mobile absence `tick 1 010 → 433 020`
(`Ferrous +110 · Nonferrous +550 · Steel +220 · Deliveries 342 · Batches 774 · Bottleneck
storage-full`), final mobile yard `tick 433 630` with sorter L6 ×582, furnace L6 ×232, polymer
recycler L5 ×1, copper separator L6 ×4 on 9 links and 130 credits, reader chips `Scrap 10 Ferrous 5
Credits 130 Store 331/900`, lease `t1-d6l3 → t1-ip27` with the tick 433 640 → 433 668 and the
promoted owner at `Scrap 13 Ferrous 5 Credits 130 Store 335/900`; seeded desktop absence
`tick 122 355 → 554 365`, `tick 555 015`, three research nodes known.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace. (The
  no-scroll, target-size, panel-fit, clip and contrast parts are now measured in Chrome; frame rate
  and thermals are not.)
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
- BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
- BL-11 human audio review: needs one listening pass.
  (BL-04, BL-05, BL-07 stay resolved.)

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-31 as before, plus **D-32** (one-line card
sentences, verb-plus-price dock, height-aware chip budget, the `.text-large` and
`@media (max-height: 460px)` density rules, the glyph sound button at ≥ 1.5, and the clip gate in
the audit). The measured occupancy percentages still stay lifetime-since-built. Save schema is
unchanged (1); no migration was needed.

Next three bounded tasks:
1. **B-25** organic research unlock on the phone: raise the post-absence tap phase until the mobile
   yard buys its first node (the probe says round 504 at floor 10) and photograph
   `latest-research.png` at 390 × 844 with its own gallery row, so that image no longer depends on
   the seeded desktop context.
2. **B-06** save export/import: versioned JSON export, validating import, corrupt file keeps the
   previous state (spec 25.3 case 8).
3. **B-21** build-versus-upgrade cadence: one fixture comparing "build first" against "upgrade
   first" over 1 800 rounds, batches per minute, credits and machine count in one table, then keep
   the better order with a D-note.

Long-running processes owned by this session: the `vite preview` server on port 4173 (started for
the measurements and the captures). Stop it at the end of the pass; nothing else runs.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
`tests/ui/hud-layout.test.ts` holds the chip budget at both widths, scales and now heights,
`tests/ui/app.test.tsx` the tutorial walk, the text-scale cycle, the Escape case and the card/dock
pairing, `tests/simulation/rate-window.test.ts` the rate window and the advance/advanceTo parity,
`tests/simulation/autoconnect.test.ts` the one-link rule, `tests/simulation/chain.test.ts` the
ladder and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep. To
refresh the layout table: `npm run build`, start `npm run preview`, then
`node scripts/measure-hud.mjs` (~70 s, 18 contexts; it prints the box geometry for 360 × 640 and
844 × 390 at each scale). To refresh the README evidence: `node scripts/capture.mjs` (~8 minutes;
it prints the session state, the return report, the opened machine panel's text, the research
panel's text, and the two-page lease lines). To regenerate the headless tables and the desktop
seed: `npx tsx scripts/probe-supply.mjs`.
