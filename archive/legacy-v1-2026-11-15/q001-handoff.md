# Q-001 handoff ??? readable phone research cards

- Assignment: `q001-g1` (Q-001, P0, generation 1)
- Worktree: `C:\Users\ryans\.local\share\opencode\worktree\fe4e05\q001-dev`, branch `q001-dev`
- Base: `a8fb14a1fdd073723f67d3524a4b261013651019`
- Candidate commit: `24429e1a1d5135dc5b989f44767353512c4702b0`
- Quality verdict: pending independent reviewer (developer self-report is not acceptance)

## Q-001r addendum (rework, assignment q001-g2, branch q001-rework from e35a642)

- R-11: the title is its own `h3` row; the cost moved into a boxed chip
  (`.node__cost`: padding 1px 6px, 1px amber border, radius 6px); the foot gap
  uses the existing 6 px token (`gap: 6px 6px`). Real-browser check: smallest
  title-bottom -> cost-top gap over the 36 cases = 38.8 px (> 0).
- R-12: one own `<p class="node__state">` line per card under the effect, exact
  strings: "Known" (known) / "Needs X first" (locked) / "Buy · N Data" (open),
  asserted per state in the new jsdom test.
- R-13: the exact cost text ("4/8/12 Data") is a DOM node in every state
  (the chip), regex `^\d+ Data$` per card; the button label is unchanged.
- R-14: the dot grid (`.resources`) column-gap is 1 px at the base and widened
  to 2 px inside the `@media (max-height: 460px)` band, so the first row of the
  landscape strip carries about seven dots instead of twelve.
- Harness: `capture-research.mjs` now records per-card `titleCostGap`,
  `ownStateLine`, `stateText`, `costText` + a per-case `rPass`; `compare.mjs`
  prints the aggregate line (and two pre-existing `after.summary` crashes on
  the Map were fixed to `afterDoc.summary`).
- Checks: vitest 21 files / 173 passed (172 existing + 1 new, no existing
  assertion edited); typecheck/validate/build clean; JS 225.42 kB gzip 70.42.
- Evidence: `q001-evidence/research-after.json` + 39 after PNGs regenerated;
  compare prints `Q-001r (R-11..R-13): pass 36/36 cases`; purchase sequence
  still moves ranks/data (8 then 12 bought, no double-charge).
- Candidate: this commit; listening/motion gates unchanged (still pending).

## What changed

`src/ui/Panels.tsx` ??? `ResearchPanel` renders one full-width `<article class="node">` card per
research node inside a single-column `.nodes` list, replacing the `auto 1fr` definition-list grid
that made each node `<div>` another alternating cell. Each card carries all five decision fields:
title (`node__name`), exact effect (`node__effect`, the `ResearchDef.effect` string verbatim),
cost (`node__cost`, `4/8/12 Data`), prerequisite (`node__state`, `Needs {node} first`), and its own
state ??? `Known` badge, an inert (`disabled`) buy target while the prerequisite is missing, or a
live target. The data total moved to a `.panel__lead` row. The `research.buy` command, its id
sequence, rank/cost/prerequisite rules and the `Close` target's position as the panel's first
`.icon-btn` are unchanged.

`src/ui/styles.css` ??? added `.panel__lead*`, `.nodes` (one-column grid), `.node`, `.node__title`,
`.node__state`, `.node__effect`, `.node__foot`, `.node__cost`, `.node__buy`, per-state card borders
(`known` cyan, `open` amber, `locked` dashed), `.icon-btn:disabled { opacity: .55 }`,
`.panel__body { touch-action: pan-y }`, `.text-large` card compaction, and inside the short-viewport
query (??? 460 px height) `.panel--research { max-height: 66dvh }` plus tighter `.nodes`/`.node`
chrome. No other panel's rules were touched; the shared `.panel dl` grid is untouched, so the
machine, store, yard-record, import and return-report panels keep their layout.

## Checks on this candidate (exact results)

| Command | Result |
| --- | --- |
| `npx vitest run` | 21 files, 172 tests passed, 0 failed (identical counts to the pre-change baseline; no test file edited) |
| `npm run typecheck` (`tsc --noEmit`) | clean, no diagnostics |
| `npm run validate` | `content: 0 violation(s)`, `behaviour: ??? nodes=3 \| 0 violation(s)`, `validated: no violations` |
| `npm run build` | OK, 52 modules, `index-*.css` 7.00 kB, `index-*.js` 225.45 kB |

Research-relevant regression coverage that still passes unchanged:
`tests/ui/app.test.tsx` "adds a Research target to the dock once data exists" (effect +
`Buy ?? 4 Data` + `Needs Efficient Cutters first` visible before purchase, `store.research.cutters
??? 1`, data 6 ??? 2, `Known` before `Buy ?? 8 Data`) and `tests/ui/i18n.test.tsx` research lines 319???323.

## Evidence (all in `q001-evidence/`, 84 files: 2 scripts, 2 JSON, 80 PNG)

- `capture-research.mjs` ??? focused headless capture of the research screen only. Matrix:
  360??640, 390??844, 412??915, landscape 844??390 ?? text scale 1 / 1.5 / 2 ?? three seeded state sets
  (`all-known`, `mixed` = known + buyable + prereq-locked, `fresh` = nothing bought) = 36 cases,
  plus 1 after-buy and 3 scrolled frames per pass. Identical script and identical seed
  (`docs/evidence/yard-mature.json`, research ranks and `data` overridden per set) for both passes;
  the 17-minute `scripts/capture.mjs` gallery was deliberately not re-run.
- `research-before.json` / `research-after.json` ??? per case: document `scrollWidth??scrollHeight`
  vs visual viewport, the panel's contained body scroll, every painted text block with its line-box
  count, card boxes with `data-state`, and every button with size, `disabled` flag and viewport
  containment.
- `compare.mjs` ??? side-by-side verdict table (printed below), reachability per control after its own
  `scrollIntoView`, and the purchase sequence transcript.
- PNG naming: `research-{before|after}-{phone-360x640|phone-390x844|phone-412x915|landscape-844x390}-s{1|1.5|2}-{all-known|mixed|fresh}.png`,
  plus `???-s2-???-scrolled.png` (worst case at 360) and `???-phone-390x844-s1-after-buy.png`.
- Repo reference for the defect before this change: `docs/screenshots/latest-research-phone.png`
  (Smart Buffers in a one-word column).

## Measured results

One-word columns gone ??? tallest text block per case, before ??? after (line boxes):

| Scale | 360 | 390 | 412 | landscape |
| --- | --- | --- | --- | --- |
| 1.0 | 10 ??? 3 | 10 ??? 3 | 8 ??? 3 | 2 ??? 3 |
| 1.5 | 10 ??? 3 | 10 ??? 2 | 10 ??? 2 | 8 ??? 2 |
| 2.0 | 10 ??? 3 | 10 ??? 3 | 10 ??? 3 | 10 ??? 2 |

Card geometry after the change (each card is exactly the `.panel__body` content width, all three
cards share x, so the list is one full-width column at every size): 314 px @360, 344 px @390,
366 px @412, 534 px @landscape. Independent inspection of the longest node at 360 px:
`Smart Buffers` / "Every machine holds 6 more units of input, so short gaps do not halt it."
measured 314 px wide over 2 line boxes, with `Needs Efficient Cutters first` 143.6 px on 1 line and
the cost chip `8 Data` on 1 line. Before the change the same node measured 27.6 px over 12 lines at
360 px and 46 px over 16 lines at 360 px / scale 1.5.

Gates: no document scroll in 36/36 cases (`scrollWidth??scrollHeight` equals the visual viewport);
horizontally clipped text blocks in 0 cases (`scrollWidth ??? clientWidth ??? 1`); smallest painted
control 44.0 px on both axes (unchanged, spec 6.2); every buy/close target reported inside the
viewport once its own line is brought into view; no case lost its panel.

Contained panel-body scroll (`panel__body.scrollHeight ??? clientHeight`), before ??? after, worst per
scale: scale 1 ??? 360 15???0 / 52???44 / 66???72 px, 390 and 412 0???0 px, landscape 0???54 / 17???110 / 0???138 px;
scale 1.5 ??? 360 194???134 / 248???200 / 314???290 px, 390 49???0 / 103???56 / 126???102 px, 412 8???0 / 62???15 /
85???61 px, landscape 237???176 / 265???216 / 313???237 px; scale 2 ??? 360 439???337 / 595???446 / 625???523 px,
390 237???135 / 357???208 / 387???254 px, 412 196???94 / 302???153 / 332???199 px, landscape 503???349 / 625???424 /
690???471 px. The contained scroller is smaller than before in 30 of 36 cases.

Buy / disabled / known states, real taps at 390??844 scale 1 (seed `mixed`):

| Frame | `sim.research` | data | card states | disabled targets | enabled targets |
| --- | --- | --- | --- | --- | --- |
| opened | `{cutters:1}` | 40 | known / open / locked | `Buy ?? 12 Data` | `Close`, `Buy ?? 8 Data` |
| tap `Buy ?? 8 Data` | `{cutters:1, buffers:1}` | 32 | known / known / open | none | `Close`, `Buy ?? 12 Data` |
| tap `Buy ?? 12 Data` | `{cutters:1, buffers:1, dispatch:1}` | 20 | known / known / known | none | `Close` |
| retap `Buy ?? 8 Data` | unchanged | 20 | known / known / known | none | `Close` |

Data 40 ??? 32 ??? 20 is exactly the shipped 8 and 12 data costs; a `Known` card renders no target, so a
repeat tap cannot double-charge (no 5th frame change). The prerequisite card is inert while its
prerequisite is missing and opens in the same frame the prerequisite becomes `Known`.

## Known limitations

1. Text scale 2.0 on the shortest portrait needs 337???523 px of contained list travel (???1.5???2 thumb
   flicks). The document itself never scrolls (36/36). This is the intended contained scroller for a
   content-heavy overlay, not clipped content; the alternative (side-by-side cards) would re-narrow
   the text columns.
2. Landscape at scale 1.0 gained contained scroll relative to the old two-column grid
   (0???54, 17???110, 0???138 px): the old grid placed two nodes side by side, the accepted card layout is
   one column, so the list is taller. At 2.0 in landscape the card list gets 104???190 px of height
   because the resting HUD band already takes 42.8 % of a 390 px-tall viewport
   (`docs/evidence/2026-11-03-hud-share.md`).
3. `.icon-btn` keeps its 44 px minimum at every text scale, so a buy row costs 44 px regardless of
   scale (behaviour unchanged from base).
4. Evidence uses the seeded mature yard with research ranks and `data` overridden per state set ???
   a labelled seeded fixture for panel geometry, not organic progression. The organic 17-minute
   gallery refresh of `docs/screenshots/latest-research-phone.png` is left to the release/milestone
   cadence, so the tracked gallery image still shows the old layout.
5. `disabled` on the prerequisite-blocked target is new at the DOM level. The engine's rejection
   path is untouched (`prereq` / `insufficient` still produce the same toast), and an unaffordable
   but unlocked node keeps a live target so the local explanation still appears.
6. Not re-run for this change: full `scripts/capture.mjs` gallery, long soak, real-device, audio and
   human-comprehension gates. Keyboard focus still lands on dock buttons per the existing audit; no
   focus-order test was added for the new cards.

## Reproduction

```powershell
cd C:\Users\ryans\.local\share\opencode\worktree\fe4e05\q001-dev
npm install
npm run validate ; npm run typecheck ; npx vitest run ; npm run build
# after pass (background server, then the focused capture)
npm run preview -- --port 4183 --strictPort      # background
$env:RUSTWAKE_URL = "http://localhost:4183/"
node q001-evidence/capture-research.mjs q001-evidence after
node q001-evidence/compare.mjs
# before pass, same instrumented script and seed
git stash push -- src/ui/Panels.tsx src/ui/styles.css
npm run build
node q001-evidence/capture-research.mjs q001-evidence before
git stash pop ; npm run build
```

`compare.mjs` prints the 36-row before/after table, the gate summary line and the purchase table
above; the JSON files carry the raw per-case measurements.

