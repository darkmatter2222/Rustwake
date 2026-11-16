# UI-004 g1 — S1 legibility evidence (PROD-TRIAGE-004 row 3)

Window **W-3**: 180 s wall cadence, 1 tap/s on the accent-filled primary, 390x844, dpr 2,
`isMobile` + `hasTouch`, fresh storage. Base `1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2`.
Instrument `scripts/measure-legibility.mjs` (method copied from the player lane's
`work/feedback/PLAYER-004-g1/legibility.mjs`, kept here as `legibility.mjs`, and extended with a
composited column, per-node census keys and the witness block).
Machine-readable census: `legibility-census.json`; stills: `captures/legibility-{A1,A125,A15}-390x844-dpr2.png`.

Contrast method: `ratio` = WCAG relative luminance of the resolved ink over the resolved
`background-color` with the alpha dropped — the player lane's own method, which reproduces every
recorded baseline number exactly (`#ffd9a8` on `rgb(201,113,58)` = 2.67, `#f4f7fb` on it = 3.31,
`#f4f7fb` on `rgb(11,18,32)` = 17.42). `ratioComposited` = the same pair with every alpha painted
down over `--night-deep`, gradient stops included; both columns must clear 4.50.

## Changed declarations (`src/ui/styles.css`, 4 rules)

| Rule | Before | After | Why |
|---|---|---|---|
| `.dock__cost` | `0.72rem` (10.8 px @ A1) | `0.8rem` (12.0 px @ A1) | absolute 12.0 px floor at step 1 |
| `.text-large .dock__cost` | `0.5rem` (11.25 px @ A1.5) | `0.72rem` (16.2 px @ A1.5) | floor + monotonicity |
| `.text-large .dock__btn` | `0.62rem` (13.95 px @ A1.5) | `0.74rem` (16.65 px @ A1.5) | monotonicity (needs ≥ 16.5 px) |
| `.dock__btn--primary, …` | `background-color: rgba(201,113,58,.65)`, `color: var(--paper)` | `rgb(201,113,58)` (opaque), `color: var(--night)` | AA on the amber fill |
| `.dock__btn--primary .dock__cost` | `#ffd9a8` | `var(--night)` | AA on the amber fill |

No new hex values: the ink is the existing `--night` token (`#0b1220`), and the fill keeps its
own `rgb(201, 113, 58)` channels — only its alpha went to 1. A light ink cannot reach 4.50:1 on
that fill at all: `(1 + 0.05) / (0.2454 + 0.05) = 3.55` is the ceiling for pure white.

## Row 1 — `.dock__cost` ≥ 12.0 px at ≥ 4.50:1 at every step

| A step | px (before → after) | ratio (before → after) | composited | ≥ 12.0 px | ≥ 4.50 |
|---|---|---|---|---|---|
| `A 1` | 10.8 → **12.0** | 2.67 → **5.27** | 6.46 | yes | yes |
| `A 1.25` | 13.5 → **15.0** | 2.67 → **5.27** | 6.46 | yes | yes |
| `A 1.5` | 11.25 → **16.2** | 2.67 → **5.27** | 6.46 | yes | yes |

Both the plain-fill and the amber-fill price line print the same triple (`priceFloorPass: true`,
`aaPass: true` on all rows in `legibility-census.json`).

## Row 2 — amber-fill face label contrast ≥ 4.50:1

Before 3.31:1 → after **5.27:1** (`ratioComposited` 6.46:1, top-of-gradient 6.46 / bottom 6.75).
`#0b1220` on `rgb(201, 113, 58)`: L 0.00607 vs 0.2454 → 5.27. With the old `0.65` alpha the same
pair composited to 2.79:1, below the floor, which is why the fill is opaque now; the bucket
separation the UI-002 census uses widened from 2 to 4 buckets against the pill row.

## Row 3 — monotonicity (the `monotonic` column)

Every element named in the census carries `monotonic: true` — px at `A 1.25` ≥ px at `A 1` and px
at `A 1.5` ≥ px at `A 1.25`:

| element | px @ A1 / A1.25 / A1.5 | monotonic |
|---|---|---|
| objective primary | 14.25 / 17.81 / 21.38 | yes |
| objective status line | 10.8 / 13.5 / 16.2 | yes |
| dock face label (plain, ×3 faces) | 13.2 / 16.5 / 16.65 | yes |
| dock face label (amber fill) | 13.2 / 16.5 / 16.65 | yes (was 13.2 / 16.5 / **13.95**) |
| dock price (plain + amber) | 12 / 15 / 16.2 | yes (was 10.8 / 13.5 / **11.25**) |
| resource chip (×3) | 12.6 / 15.75 / 18.9 | yes |
| cluster button (×3) | 11.7 / 14.63 / 17.55 | yes |

Multi-node selectors are keyed `… #0/#1/#2` so each ladder is exactly three readings (one per
step); an earlier run concatenated the nodes into one bucket and printed a six-entry array.

## Row 4 — witnesses that already pass, re-printed, unchanged

| witness | A 1 | A 1.25 | A 1.5 | floor |
|---|---|---|---|---|
| `clipped` (player test: `scrollWidth > ceil(width)+0.5`) | false everywhere | false everywhere | false everywhere | false |
| min tap target (dock faces + cluster) | 44 px | 44 px | 44 px | 44 px |
| `scrollHeight == innerHeight` and `scrollWidth == innerWidth` | 844/844, 390/390 | same | same | no page scroll |
| pageerror | 0 | 0 | 0 | 0 |
| `.objective` fill of the `.hud` column (bounding box) | 9.6 % | 11.4 % | 10.8 % | ≤ 42 % |

The five recorded card-fill cells, re-printed from `scripts/measure-ui002.mjs` (unmodified) against
this build — deepest is still **41.8 %**, the recorded 0.2 pp margin:

```
[360x640 ts1 2-machine]      .objective 83.31 px  => 13.0 %   (cap 42 %)
[360x640 ts2 2-machine]     .objective 243.75 px  => 38.1 %   (cap 42 %)
[390x844 ts1 4-machine]      .objective 83.31 px  =>  9.9 %   (cap 42 %)
[390x844 ts2 4-machine]     .objective 209.56 px  => 24.8 %   (cap 42 %)
[360x640 ts2 4-machine fork-open + refused tap] .objective 267.5 px => 41.8 % (cap 42 %)
```
Same run: `U-2 tiers … = 1.32x (floor 1.25x)` unchanged, `smallest face 46–50.2 px`, `no page
scroll`, `pageerrors 0` in all five cells. The `42 %` number is a **cap** on the card's bounding
box (`card.getBoundingClientRect().height / hud.clientHeight`), not an ink-area fill and not a
floor; the W-3 A-ladder readings (9.6–11.4 %) are smaller because that ladder tops out at 1.5,
while the recorded five cells are measured at text scale 2.0.

Entry chunk: `index-C-cyFQu5.js` **231 262 B** (ceiling 233 000 B, 1 738 B of headroom — the entry
bytes are unchanged from base, the sheet grew 7 849 → 7 852 B). `tables-BB2NPvQ2.js` 9 298 B.
Save untouched: `schemaVersion 1`, fixture checksums `12078145 / 32eef588 / d71d96cd / d313b145 /
c04162ef` as printed, `eede3c4f` not regenerated.

## Checks (real exit codes)

| command | exit |
|---|---|
| `npm run typecheck` | 0 |
| `npx vitest run` | 0 — 29 files, 292 tests passed |
| `npm run validate` | 0 — `no violations` |
| `npm run build` | 0 |
| `npx tsx scripts/measure-legibility.mjs` | 0 |
| `npx tsx scripts/measure-ui002.mjs` (`UI002_PASS=rest,fork`) | 0 |

New test `tests/ui/legibility.test.tsx` (5 tests) pins, from the shipped sheet text plus WCAG
arithmetic: the `0.8rem`/`0.72rem` price pair, the `0.74rem` label pair, the monotone ladder of all
six named selectors, the two AA pairs (`#0b1220` on `#c9713a` = 5.27; the old `#ffd9a8` = 2.67 and
`--paper` = 3.31 kept as explicit values so a rollback fails), and the 44 px target declarations.

## Limitations / notes for the ledger

1. **Two literals in `tests/ui/app.test.tsx` moved** (L-3 test, lines 614 and 617): `0.62rem` →
   `0.74rem`, `0.5rem` → `0.72rem`. They are value pins on exactly the two rules UI-004 is
   chartered to move, so the pin had to follow; the same numbers are now pinned in
   `tests/ui/legibility.test.tsx`. Nothing else in that file was touched.
2. **`UI-004-D1`** — at `line-height: 1.1` four rows report `scrollHeight = clientHeight + 1`
   (`objective status line`, `dock price`, `resource chip`). It is the +1 px line-box rounding the
   CHRM-002 note in `styles.css` already documents, it is present at `A 1` as well (where
   `objective primary` shows it and none of these rules changed), `overflow` is visible inside the
   card's own 6 px padding, and the horizontal `clipped` witness is `false` everywhere. Nothing is
   cut. Not introduced by this slice; id'd for the ledger.
3. `ratioComposited` models the fill as background-colour + the gradient's stops over
   `--night-deep`; the canvas underneath is not sampled per pixel, so it is an analytic second
   column, not a screenshot diff.
4. Follow-up candidate (not in S1's owned paths): with the fill opaque, the cheapest further gain
   is darkening the gradient's top stop so the composited column rises above 6.46; one-line CSS,
   same bucket identity.

## Rollback

`git revert` of the `rw/ui004-g1` candidate restores the four declarations and both test pins; the
save format, checksums and deterministic simulation are untouched by this slice (CSS-only change,
no engine or string file edited).
