# UI-004 g2 — amber strings at 4.5:1 with monotonic text scaling (Issue #19, PR #29)

Window **W-3**: 390x844, `deviceScaleFactor` 2, `isMobile` + `hasTouch`, fresh storage, 12 taps at
1/s on the accent-filled primary, then the `A` control twice (`1 → 1.25 → 1.5`). Live artifact
built from this branch (`npm run build`), served by `vite preview`, measured by
`work/evidence/UI-004-g2/measure-ui004-g2.mjs`. Machine-readable census: `ui004-g2-census.json`;
instrument stdout: `run-2026-11-07.txt`; the card-fill five cells:
`run-ui002-cardfill-2026-11-07.txt`; stills: `captures/`.

Base for this slice: `e82d6d35c028f15d1bd3dc6bc08a798e8d0e8b69` = `rw/ui004-g1` (g1 head
`e58b18bff8db31359bb18247e02481bf1330a0cc`) with `origin/main`
`6e0dce90f6e21a2e0f6107437055aa42739ec77f` merged in (plain merge, no force push).

## 1. What changed in `src/ui/styles.css` in g2 (two declarations)

| Rule | Before | After | Why |
|---|---|---|---|
| `.dock__btn:disabled` | `opacity: 0.55` | `opacity: 0.8` | the element's own opacity is part of its contrast: `--night` ink at alpha 0.55 over the composited amber fill measures **2.93:1**, at 0.8 **4.87:1** |
| `.icon-btn:disabled` | `opacity: 0.55` | `opacity: 0.8` | same pair on the accent-filled `.node__buy` (the research buy target), the only string still under the floor |

The g1 slice already moved the four size/fill declarations (`.dock__cost` `0.8rem`,
`.text-large .dock__cost` `0.72rem`, `.text-large .dock__btn` `0.74rem`, opaque `rgb(201, 113, 58)`
fill with `--night` ink); g2 keeps those and lifts the two dim levels. No new line, panel or face,
no objective/status tier rescore, no card-cap work.

Contrast method (unchanged from g1, so the baseline numbers reproduce exactly): `ratio` = WCAG
relative luminance of the resolved ink over the nearest resolved `background-color` with the alpha
dropped; `ratioComposited` = the same pair with every layer painted down over `--night-deep`
(`#080d18`), gradient stops included; **`ratioEffective`** (new in g2) = the same arithmetic with
the element's own `opacity` chain folded into the ink alpha — the column a disabled control has to
be scored on. All three columns are printed per row in `ui004-g2-census.json`.

## 2. Acceptance row 1 — `.dock__cost` ≥ 12.0 px at ≥ 4.50:1 at every A step

| A step | root font | `.dock__cost` px (plain / amber) | `ratio` | `ratioComposited` | `ratioEffective` | ≥ 12.0 px |
|---|---|---|---|---|---|---|
| `A 1` | 15 px | 12.0 / 12.0 | 5.27 | 6.46 | 6.46 | yes |
| `A 1.25` | 18.75 px | 15.0 / 15.0 | 5.27 | 6.46 | 6.46 | yes |
| `A 1.5` | 22.5 px | 16.2 / 16.2 | 5.27 | 6.46 | 6.46 | yes |

Baseline was 10.8 / 13.5 / 11.25 px at 2.67:1 (`priceFloorPass: true`, `aaPass: true` on both price
rows in the JSON).

## 3. Acceptance row 2 — the amber face label and every visible string ≥ 4.50:1

Amber face label (`dock face label (amber fill)`): **5.27:1** declared, **6.46:1** composited at
all three steps (baseline 3.31:1). The full HUD/panel sweep (every element that paints its own
text, not only the 13 named selectors) prints **0 strings under 4.50:1** at every step and in every
panel state:

| state | strings swept | lowest `ratioEffective` | lowest px |
|---|---|---|---|
| rest `A 1` | 15 | 5.77 | 10.8 |
| rest `A 1.25` | 15 | 5.77 | 13.5 |
| rest `A 1.5` | 15 | 5.77 | 16.2 |
| `A 1` Store / Yard / Research | 34 / 18 / 37 | 5.77 / 5.77 / **4.87** | 10.8 |
| `A 1.5` Store / Yard / Research | 32 / 16 / 35 | 5.77 / 5.77 / **4.87** | 16.2 |

The 4.87:1 rows are the two dimmed research buy targets ("Buy · 8 Data", "Buy · 12 Data",
`opacity: 0.8`), i.e. the two declarations this slice lifted from 2.93:1.

## 4. Acceptance row 3 — monotonic px across the A ladder (per named element)

`px` at `A 1` / `A 1.25` / `A 1.5`; `monotonic` is the instrument's own column
(`px[1] >= px[0] && px[2] >= px[1]`). **0 non-monotonic named elements.**

| element | px @ A 1 / A 1.25 / A 1.5 | monotonic |
|---|---|---|
| objective primary #0 | 14.25 / 17.81 / 21.38 | yes |
| objective status line #0, #1 | 10.8 / 13.5 / 16.2 | yes |
| dock face label (plain fill) #0, #1, #2 | 13.2 / 16.5 / 16.65 | yes |
| dock face label (amber fill) #0 | 13.2 / 16.5 / **16.65** | yes (baseline 13.2 → 16.5 → **13.95**) |
| dock price (plain fill) #0 | 12 / 15 / **16.2** | yes (baseline 10.8 → 13.5 → **11.25**) |
| dock price (amber fill) #0 | 12 / 15 / **16.2** | yes |
| resource chip #0, #1, #2 | 12.6 / 15.75 / 18.9 | yes |
| cluster button #0, #1, #2 | 11.7 / 14.63 / 17.55 | yes |

Per-row `ratio` / `ratioComposited` / `ratioEffective` triples for all 15 census rows are in
`ui004-g2-census.json` (`census[]`), one bucket of exactly three readings per named element.

## 5. Acceptance row 4 — witnesses, re-measured on this artifact

| witness | `A 1` | `A 1.25` | `A 1.5` | floor |
|---|---|---|---|---|
| `clipped` (named rows and full sweep) | false | false | false | false |
| min tap dimension (dock faces, cluster, buy targets) | 44 px | 44 px | 44 px | ≥ 44 px |
| `scrollHeight == innerHeight` and `scrollWidth == innerWidth` | 844/844, 390/390 | same | same | no page scroll |
| `pageerror` | 0 | 0 | 0 | 0 |
| `.objective` share of the `.hud` column | 9.6 % | 11.4 % | 10.8 % | ≤ 42 % |
| entry chunk `index-DqPdBnot.js` | 232 365 B | — | — | < 233 000 B |

Five recorded card-fill cells at text scale 2.0, from the unmodified `scripts/measure-ui002.mjs`
(`UI002_PASS=rest,fork`) against this build — every cell under the 42 % cap:

```
[360x640 ts1 8-machine] .objective  66.22 px => 10.3 %  (cap 42 %)
[360x640 ts2 8-machine] .objective 175.38 px => 27.4 %  (cap 42 %)
[390x844 ts1 8-machine] .objective  66.22 px =>  7.8 %  (cap 42 %)
[390x844 ts2 8-machine] .objective 175.38 px => 20.8 %  (cap 42 %)
[360x640 ts2 fork-open + refused tap] .objective 175.38 px => 27.4 % (cap 42 %)
```

Same run: `U-2 tiers … = 1.32x (floor 1.25x)` unchanged, `smallest face 46 px`, `no page scroll`,
`pageerrors 0` in every cell.

## 6. Checks (real exit codes, this worktree)

| command | exit |
|---|---|
| `node scripts/team-board.mjs --check` | 0 |
| `node --test scripts/team-*.test.mjs … tools/team-supervisor/*.test.mjs` | 0 — 59 pass, **0 fail** (the pre-merge `# fail 1` is gone) |
| `npm run typecheck` | 0 |
| `npm run validate` | 0 — `no violations` |
| `npm test` | 0 — 31 files, 314 tests passed |
| `npm run build` | 0 — entry `index-DqPdBnot.js` 232 365 B |
| `npx tsx work/evidence/UI-004-g2/measure-ui004-g2.mjs` | 0 |
| `UI002_PASS=rest,fork npx tsx scripts/measure-ui002.mjs` | 0 |

## 7. Limitations / notes for the ledger

1. The `0.8` dim levels are **not pinned by a unit test**: `tests/` is outside this assignment's
   `write_paths`, so the two values are pinned here and in `ui004-g2-census.json` (rows
   `research buy target#29/#30`, `opacity: 0.8`, `ratioEffective: 4.87`). A one-line pin in
   `tests/ui/legibility.test.tsx` is the natural follow-up.
2. `ratioEffective` is analytic, not a pixel-sampled screenshot diff: it paints the ancestor
   `background-color` stack and the accent gradient stops over `#080d18` and folds the `opacity`
   chain into the ink alpha. The `+1 px` `scrollHeight` readings on the 1.1-leading rows are the
   documented line-box rounding (`UI-004-D1`), not cut text: horizontal `clipped` is false on every
   row and the 46/44 px boxes are unchanged.
3. The `A` ladder tops out at 1.5 in this instrument (the control's 4th step is 2.0, where
   `.text-large` rules also apply); the scale-2.0 witnesses are the `measure-ui002.mjs` cells above.
4. Save format and deterministic simulation untouched: CSS-only change, `schemaVersion 1`, no
   engine, string or table file edited. Rollback: `git revert` the g2 commit restores the four g1
   declarations plus the two opacity levels.

## 8. Addendum — the ladder extended to `A 2` and the per-chip height table (published separately)

Instrument `measure-ui004-g2-a2.mjs`, output `ladder-A2.0.json`, still
`captures/ladder-A2-390x844-dpr2.png`, stdout `run-a2-2026-11-08.txt`. Same W-3 window; the `A`
control is pressed three times, so the ladder is the control's own four steps
(`App.tsx` cycles `[1, 1.25, 1.5, 2]`). This closes the gap where the card-fill witnesses were
taken at text scale 2.0 but this ladder stopped at 1.5: **the two witnesses now overlap on one
artifact**, and the per-chip heights double as the before-state baseline for Issue #30. The two
`opacity: 0.8` declarations are untouched by this addendum.

| A step | `--text-scale` | `text-large` | root font | `.dock__cost` px | price `ratioEffective` | `.objective` share of `.hud` | min tap | page scroll |
|---|---|---|---|---|---|---|---|---|
| `A 1` | 1 | false | 15 px | 12.0 | 6.46 | 9.6 % | 44 px | none |
| `A 1.25` | 1.25 | false | 18.75 px | 15.0 | 6.46 | 11.4 % | 44 px | none |
| `A 1.5` | 1.5 | true | 22.5 px | 16.2 | 6.46 | 10.8 % | 44 px | none |
| `A 2` | 2 | true | 30 px | **21.6** | **6.46** | **19.5 %** | **44 px** | none |

Price string at `A 2`: `"20 scrap"` at 21.6 px, declared 5.27:1, composited and effective 6.46:1,
box 23.75 x 219.67 px inside the 46 px-class face, `clipped` false, 0 pageerror. Every named
element stays non-decreasing in px across all **four** readings (0 violations).

Per-chip table (the three `.resources__item` chips of the top row; `h/w/top` in CSS px, `runs` are
the ink boxes of the child nodes — the dot and the value — as Issue #30 reads them):

| chip | `A 1` | `A 1.25` | `A 1.5` | `A 2` |
|---|---|---|---|---|
| distinct chip box heights in the step | 23 px | 27.25 px | **23.73 px** | 30.97 px |
| `"Scrap5"` h / w | 23 / 68.48 | 27.25 / 78.34 | 23.73 / 86.22 | 30.97 / 105.95 |
| `"Credits0"` h / w | 23 / 77.13 | 27.25 / 89.16 | 23.73 / 99.19 | 30.97 / 123.25 |
| `"Store 5/900"` h / w | 23 / 81.23 | 27.25 / 98.03 | 23.73 / 112.84 | 30.97 / 146.44 |
| chip `top` (row layout) | 8, 8, 33 (two lines) | 8, 8, 37.25 (two lines) | 8, 8, 33.73 (two lines) | 8, 40.97, 73.94 (**three lines**) |
| chip font px / line-height | 12.6 / 17.01 px | 15.75 / 21.26 px | 18.9 / **21.74 px** | 25.2 / 28.98 px |

Two observations the #30 baseline needs stated: inside one step the three chips are **equal height**
(one distinct value per step), and the *box* height is **not** monotonic across steps — 27.25 px at
`A 1.25` vs 23.73 px at `A 1.5`, because `.text-large .resources__item` tightens `line-height` to
1.15 and the padding to `0 5 px` at that step (the font size itself stays monotonic, 15.75 → 18.9).
From `A 1.5` up, `scrollHeight` exceeds `clientHeight` by 1 px on the chips (the documented
line-box rounding), and at `A 2` the top row wraps to one chip per line, which is what pushes the
`.objective` card to 19.5 % of the column. All 44 px/46 px tap floors and the 42 % card cap hold at
`A 2`.
