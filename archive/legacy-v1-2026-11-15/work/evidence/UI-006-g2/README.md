# UI-006-g2 - chip label/value space and equal chip heights at 390 px

Issue: <https://github.com/darkmatter2222/Rustwake/issues/30>
Branch: `rw/ui006-g1` · base `origin/main` = `56105287bc9468a95cdd15d54bc9aa4fccdae415`
Instrument: `measure-ui006-g2.mjs` (same W-3 window and contrast method as `../UI-004-g2/measure-ui004-g2-a2.mjs`)

Window W-3: 390 x 844, dpr 2, `isMobile` + `hasTouch`, fresh storage, 12 taps at 1/s on the
accent-filled primary, then the in-game `A` control three times -> text scale 1 -> 1.25 -> 1.5 -> 2.
Served by `npx vite preview --port 4192` from this worktree; the served `index.html` hash was
checked against `dist/index.html` before each run (`match=True` for both runs, so no stale build).

## 1. What the two defects were, in ink numbers

| Reading, per A step | before (5610528) | after (this head) |
| --- | --- | --- |
| Store chip label -> value ink gap | **0 px** (`"Store"` ink ends at 50.88, `"5/900"` ink starts at 50.88 - butted) | **4 px** (47.17 -> 51.17), identical to `Scrap 5` / `Credits 0` |
| Store chip ink runs | 4 bare text nodes: `Store` `5` `/` `900`, gaps `[0,0,0]` | 2 flex items: text `Store` + `<strong>5/900</strong>`, gaps `[4]` |
| `Sound ✓` face line boxes | **2** at A 1 (`Sound` @T13.2 w 35 px over `✓` @T29 w 9 px) and 2 at A 1.25 | **1** at every step |
| `A 1.25` / `A 1.5` / `A 2` face line boxes | 2 / 2 / 2 (the scale face wrapped too) | 1 / 1 / 1 |
| cluster chip box heights | 44 / 44 / **49.38** / **65.19** px | 44 / 44 / **44** / **44** px |
| resource chip box heights | 23 / 27.25 / 23.73 / 30.97 px | 23 / 27.25 / 23.73 / 30.97 px (unchanged) |

Both families are single-line and equal-height at every scale after the change. The cluster row
also stops eating vertical space at the two large steps: 65.19 px -> 44 px, i.e. 21 px of the top
block returned to the world at A 2, with `.objective` share of `.hud` still 19.5 % of 42 % allowed.

Full per-chip rows (height, width, top, px, leading, scroll/client, row count, ink runs) are in
`run-before-2026-11-08.txt` / `run-after-2026-11-08.txt` and in machine form in
`ladder-before.json` / `ladder-after.json`.

## 2. Still (rest-state) images, 390 x 844 dpr2

| step | before | after |
| --- | --- | --- |
| A 1.0 | `captures/before-A1-390x844-dpr2.png` | `captures/after-A1-390x844-dpr2.png` |
| A 1.25 | `captures/before-A1.25-390x844-dpr2.png` | `captures/after-A1.25-390x844-dpr2.png` |
| A 1.5 | `captures/before-A1.5-390x844-dpr2.png` | `captures/after-A1.5-390x844-dpr2.png` |
| A 2.0 | `captures/before-A2-390x844-dpr2.png` | `captures/after-A2-390x844-dpr2.png` |

(A 1.5 is included because `.text-large` turns on exactly there; the ladder needs all four steps
to keep the non-decreasing check from `UI-004-g2` comparable.)

## 3. Witness set, per step - unchanged by this patch

| witness | A 1 | A 1.25 | A 1.5 | A 2 | limit |
| --- | --- | --- | --- | --- | --- |
| `clipped` | `[]` | `[]` | `[]` | `[]` | false |
| min tap target | 44 px | 44 px | 44 px | 44 px | >= 44 px |
| `scrollHeight == innerHeight` | true (844/844) | true | true | true | equal |
| `.objective` share of `.hud` | 9.571 % | 11.378 % | 10.791 % | 19.542 % | <= 42 % |
| page errors | 0 | 0 | 0 | 0 | 0 |

All five readings are identical before and after (the cluster shrinking never touches the card).

## 4. Build and tests at this head

- `npm run build` (`tsc --noEmit && vite build`): clean, 53 modules.
  Entry chunk `dist/assets/index-B1-fEleB.js` = **232 822 B** against the 233 000 B cap
  (178 B of headroom left; at base 5610528 the same file was 232 792 B, so the `<strong>` in
  `Hud.tsx` cost 30 B). Sheet `dist/assets/index-BQX-FOQv.css` = 8 158 B (was 8 092 B; the cap is
  on the entry chunk, and CSS ships as its own file).
- `npm test`: **32 files, 325 tests passed**, 0 failed (4.66 s).
- Save/migration impact: none. Only the chip markup and two CSS declarations changed; no
  simulation, price or save field was touched.

## 5. Known residuals (reported, not fixed in this slice)

1. **Chip box height is non-monotonic across the A ladder**: 27.25 px at A 1.25 vs 23.73 px at
   A 1.5. Mechanism is the `.text-large` block (`line-height: 1.15`, `padding: 0 5px`) tightening
   the box at exactly the step where the glyph grows from 15.75 px to 18.9 px, so one unitless
   multiplier is not held across the ladder. Unchanged before/after (identical in both tables).
2. **`scrollHeight = clientHeight + 1` on every resource chip from A 1.5 up** (23/22 at A 1.5,
   30/29 at A 2, both before and after): a 1 px overflow of the leading inside the border box,
   not a wrap - the ink runs show one line box. Not visible in the stills.
3. `A 1` cluster face is `min-width: 44px`-bound (w 44.00) while its content is 18 px wide; that
   is the 44 px tap floor, not a wrap, and it is what keeps the min-target witness at 44 px.
