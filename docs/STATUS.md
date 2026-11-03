# STATUS

Active milestone: M2 (a useful small factory). M0 and M1 complete.

Last completed player-visible change: B-13, the large-text and contrast audit, plus the layout
work it found. Panels are now in-flow flex columns with a non-scrolling head, so at 2.0 text scale
the store panel no longer overflows its own box and its Close button stays on screen; one cluster
button changes the text size; contrast and keyboard focus are measured in real Chrome.
`node scripts/measure-hud.mjs` now runs six sizes of spec 25.1 × three text scales (1.0 / 1.5 / 2.0)
× three states in one Chrome instance and writes `docs/evidence/2026-11-03-hud-share.md`:

- Resting painted-HUD share at the default scale: **21.6 %** at 360 × 640, **14.3 %** at 390 × 844,
  **13.0 %** at 412 × 915, **20.2 %** at 844 × 390, **6.9 %** at 820 × 1180, **5.1 %** at 1440 × 900.
  At 1.5 the peak is 32.7 % (360 × 640) and at 2.0 it is 57.4 %, which is what 30 px labels cost on
  that screen (recorded as B-27 rather than hidden).
- Panel geometry problems (outside the viewport, Close clipped, dock covered): **none in 18/18**;
  the store panel reports **0 px** inner scroll at every size and scale, where the previous build
  reported 105 px at 360 × 640 and 165 px in landscape with the Close button pushed out of view.
- No document scroll in **18/18** contexts; smallest dock target 46.8 × 46 px and smallest icon
  button 44 × 44 px at 360 × 640 (spec 6.2), four dock targets at rest and three in build mode
  (spec 5.5).
- Contrast: 10 text pairs composed over the real page background, minimum **5.77:1** (the objective
  hint) at all three scales, every pair at or above its AA threshold.
- Keyboard: `Tab` from the first dock button lands on the next target with the new
  `:focus-visible` ring `solid 2px rgb(95, 216, 232)`; a scripted `focus()` still reports
  `outline: none`, which is why the real key press is the one that counts.

Current commit and remote sync status: `808dbc8` ("Fit panels at large text and add one
text-scale control (B-13)") is the pushed `origin/main` head after `git push origin HEAD:main`
(`0a4964e..808dbc8`, verified by `git rev-parse HEAD origin/main`, both
`808dbc80b3debc7856e0b4899c7459ad0de4e70d`); a documentation-only checkpoint commit (this line)
sits on top of it. `docs/DECISIONS.md` D-31 is the design record of this pass. The
previous pushed head was `0a4964e` ("Record pushed head 266d9d6 and the B-16 pass scope"), before
that `266d9d6` (B-16), `fc99db1`, `4ac39c5`, `0506f46`, `57f15af`.
CI state: still unread in this environment (BL-06: `gh run list` asks for `gh auth login`, the
unauthenticated API 404s for the private repository), so CI is reported as pending, not green.

Checks run and actual results (this pass):
- `npx vitest run` — **127 passed / 127** (15 files), no skipped tests, no deleted assertions.
  Two new cases in `tests/ui/app.test.tsx`: the `A {scale}` button cycling 1 → 1.25 → 1.5 → 2 → 1
  through the persisted `textScale` with the `.text-large` class following it, and Escape leaving
  build mode without building anything. `tests/ui/hud-layout.test.ts` gained the scale-aware chip
  budget (four chips at ≤ 420 px, three from 1.5; seven above, six from 1.5).
- `npm run build` — succeeded: `index.html` 0.68 kB (0.38 gzip), CSS 4.89 kB (**1.62 kB gzip**),
  **JS 207.57 kB (65.61 kB gzip)**, 50 modules, 486 ms. `tsc --noEmit` runs inside `npm run build`
  and is clean.
- `node scripts/measure-hud.mjs` — the numbers quoted above, regenerated after the final build.
- The `findButton` helper in `tests/ui/app.test.tsx` now matches the accessible name
  (`aria-label` first, then text), which is why the sound button reads `Sound ✓` visually while the
  test still finds "Sound on".
- Headless CPU table unchanged on purpose: this pass touched only `src/ui/*` and CSS, no
  simulation code, so `tests/perf/bench.test.ts` numbers still describe this build.

Screenshot evidence and capture provenance: all five images recaptured 2026-11-03 from this build
(`npm run build` → `npm run preview` → `node scripts/capture.mjs`) — `latest-mobile.png`,
`latest-machine-mobile.png`, `latest-multitab.png` (one 390 × 844 @2x context) and
`latest-desktop.png`, `latest-research.png` (separate 1440 × 900 @1x context seeded with
`docs/evidence/yard-mature.json`). What is new in them relative to the previous set: the top-right
cluster has three buttons (`Sound ✓`, `A 1`, `Home`), the chip row is two lines of two at 390 px
with tighter padding, and the selected-machine image shows the panel head row
(`Polymer recycler` beside `Close`) with the body scrolling under it. Capture log for this build:
mobile absence `tick 1 010 → 433 020` (`Ferrous +110 · Nonferrous +550 · Steel +220 · Deliveries
342 · Batches 774 · Bottleneck storage-full`), final mobile yard `tick 433 630` with sorter L6 ×582,
furnace L6 ×232, polymer recycler L5 ×1, copper separator L6 ×4 on 9 links and 130 credits, reader
chips `Scrap 10 Ferrous 5 Credits 130 Store 332/900`, lease `t1-gfx3 → t1-7pg5` with the tick
433 640 → 433 668 and the owner's store at 336/900 after handover; seeded desktop context absence
`tick 91 547 → 523 557`, `tick 524 207`, 8 machines on 18 links, `circuits 16, data 20`, three
research nodes known.

Known blockers with exact unblock conditions:
- BL-01 real-device frame/thermal traces: needs a connected device or a hosted trace. (The no-scroll,
  target-size, panel-fit and contrast parts are now measured in Chrome; frame rate and thermals are not.)
- BL-02 human first-feel playtest (8 of 10 unaided): needs fresh human testers.
- BL-03 server authority, payments, public launch: needs provisioning and owner authorization.
- BL-06 CI status read-back: needs an authenticated `gh` or a readable status check.
- BL-11 human audio review: needs one listening pass.
  (BL-04, BL-05, BL-07 stay resolved.)

Assumptions/decisions made: `docs/DECISIONS.md` D-01…D-30 as before, plus **D-31** (in-flow panels
with a fixed head, one cycling text-scale control, the reduced-motion read from `matchMedia`, the
Escape order report → panel → build mode, and the explicit `:focus-visible` ring). The measured
occupancy percentages still stay lifetime-since-built. Save schema is unchanged (1); `textScale`
already existed in `DEFAULT_SETTINGS`, so no migration was needed.

Next three bounded tasks:
1. B-25 organic research unlock on the phone: raise the post-absence tap phase until the mobile yard
   buys its first node (probe: round 504 at floor 10) and photograph `latest-research.png` at
   390 × 844 with its own gallery row, so the research image no longer depends on the seed.
2. B-26 short-viewport HUD band: the strict row-union measure is 23 % at 360 × 640 and 26.2 % in
   landscape at the default scale; spend the objective card's third line and re-measure both states.
3. B-27 dock compaction at large text: at 2.0 each dock row is 144.9 px tall at 360 × 640, so the
   resting HUD paints 57.4 % of the viewport; put the cost beside the label (or on the objective
   line) keeping 30 px labels and re-measure the 2.0 table, aiming under ~45 %.

Long-running processes owned by this session: none. The `vite preview` server on port 4173 was
started for the measurements and the two captures and stopped at the end of the pass; nothing else
runs.

Resume instructions: read this file, then `docs/BACKLOG.md`. Run `npx vitest run` before editing;
`tests/ui/hud-layout.test.ts` holds the chip budget at both widths and scales,
`tests/ui/app.test.tsx` the tutorial walk plus the text-scale and Escape cases,
`tests/simulation/rate-window.test.ts` the rate window and the advance/advanceTo parity,
`tests/simulation/autoconnect.test.ts` the one-link rule, `tests/simulation/chain.test.ts` the
ladder and self-play regression, `tests/simulation/supply-window.test.ts` the floor sweep. To
refresh the layout table: `npm run build`, start `npm run preview`, then
`node scripts/measure-hud.mjs` (~70 s, 18 contexts). To refresh the README evidence:
`node scripts/capture.mjs` (~8 minutes; it prints the session state, the return report, the opened
machine panel's text, the research panel's text, and the two-page lease lines). To regenerate the
headless tables and the desktop seed: `npx tsx scripts/probe-supply.mjs`.
