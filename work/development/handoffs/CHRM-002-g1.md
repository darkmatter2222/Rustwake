# CHRM-002 g1 — close the 0.9 pp chrome-cap miss with one leading value

Role: developer. Task: CHRM-002 g1 (chrome cap). Candidate: branch `chrm002-g1`, worktree `polish001-dev`, base `0c03572fa654388b52e023f72f4c47037a3aa42e` (= `origin/main`, deployed as `rustwake-0c03572`). Evidence types: own automated chromium measurement (three passes, eight cells plus one organic control), automated gates, source inspection, visual inspection of the affected screen. No new playtest, no human-enjoyment claim.

## Verdict (one line)

**One value, `line-height: 1.2` → `1.1` on `.text-large .status-line`, takes the binding cell from 42.9 % to 40.8 % of the `.hud` content box; every one of the eight cells (two depths × four viewport/text-scale combinations) is now ≤ 42 %, the status line stays readable at text scale 2.0 (21.6 px on 23.8 px leading, 1.8 px of white between wrapped rows), and the entry chunk is byte-identical at 231,878 B while the css chunk keeps its size at 7,474 B.**

## 1. The exact diff (only `src/ui/styles.css` changes)

```diff
--- a/src/ui/styles.css
+++ b/src/ui/styles.css
@@ -603,9 +603,16 @@ body {
    `scrollHeight == clientHeight` (no clipping). 41.3 % is the binding cell; the other three
    are 16.4 / 12.4 / 31.4 %. One step down in size is what buys the band back after the
    73-character shortfall segment joins the power line at its third wrapped box. */
+/* CHRM-002: the leading steps 1.2 → 1.1, the value `.text-large .dock__btn` already uses.
+   Each secondary line wraps to two boxes at 360 × 640 text scale 2.0, so one tenth of the
+   21.6 px font buys back 2.16 px per box: the card measures 261.4 px = **40.8 %** of the
+   640 px `.hud` content box instead of 274.4 px = 42.9 %. All four cells at both depths now
+   read 16.7 / 40.8 / 10.6 / 31.0 %, so the 42 % chrome cap holds everywhere. Legibility at
+   scale 2.0: 21.6 px text on 23.76 px leading keeps 1.8 px of white between a descender and
+   the next ascent (from the text-metrics engine), `scrollWidth == clientWidth` per line, and
+   the card still clears the dock by 213.7 px. On the two-box lines `scrollHeight` is 1 px
+   taller than `clientHeight` at this leading; that extra pixel sits inside the card's own
+   6 px bottom padding, where `overflow` is visible, so nothing is cut off. */
 .text-large .status-line {
   font-size: 0.72rem;
-  line-height: 1.2;
+  line-height: 1.1;
   margin-top: 0;
 }
```

The minified chunk confirms the change is exactly one character: the built css differs from the base build at **one byte position** (offset 7209, `…line-height:1.2;…` → `…line-height:1.1;…`) and keeps length 7,474 B. `font-size` and `margin-top` are untouched, and no other rule was touched — one lever, no restyle cascade.

## 2. Method

`npx tsx scripts/measure-chrm002.mjs` (new, `scripts/measure-chrm002.mjs`), Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe` through `playwright-core`, one fresh context per cell with `deviceScaleFactor 2`, `isMobile`, `hasTouch`, served by `npx vite preview --port 8461` from the built `dist/`. The same script ran against the base build and the candidate build (two builds, `--outDir dist-base` / `dist-after`, then the final `npm run build`).

Three passes, so each depth is read twice — once deterministically, once with the recorded tap method:

- **pass A — depth "2 machines"**: the engine writes the save (`encodeSave`, the recorded `fund(60, 20)` funding pattern of `scripts/measure-strat003.mjs`), `localStorage["rustwake.save.v1"]` is installed before boot, `settings.textScale` per cell. Frame line: `machines=2 [sorter#1:1@0, furnace#2:1@1] links=5 tick=899 credits=34 store={"scrap":9} plain=30 prices={"speed":"40 credits","draw":"30 credits"} step="upgrade"`. This reproduces the recorded `16.7 / 42.9 / 10.6 / 32.5 %` digit for digit on the base build.
- **pass C — depth "4 machines", fork row open**: same builder, four machines (`sorter, furnace, copperSeparator, polymerRecycler`, `links=10 tick=1499`), same purse so the fork still prints `40` / `30`; the pip line grows its `+2` tail, which is what makes this depth the deeper card.
- **pass B — the recorded organic control**: gate button, `Text size` taps, primary taps until the fork row first appears; reached **4 machines at 345–348 taps** in every cell, i.e. the same frame the recorded 4-machine capture describes, with the `+2` pip tail (`Batch pips · Scrap sorter #8 5/5 · Furnace #9 0/5 +2`).

Per cell the script prints `hudContentBox.height` (`.hud` clientHeight), the `.objective` box and ratio, `.objective` bottom → `.dock` top, `documentElement.scroll*` vs the visual viewport, the dock faces with their smallest dimension, and per card row: computed `font-size`/`line-height` in px, wrapped line-box count (`Range.getClientRects()`), the painted ink rect, `scrollWidth`/`clientWidth`, `scrollHeight`/`clientHeight`, the ink→dock clearance and the box overlap area against the dock rect.

## 3. The eight cells, before → after

`hudContentBox.height` is 640 / 640 / 844 / 844 in every pass (the `.hud` column is bottom-anchored and never moves). Cap = 42 %; smallest face floor = 46 px measured against the 44 px spec floor; no page scroll anywhere (`scrollWidth × scrollHeight == innerWidth × innerHeight`), `pageerror` 0 in all 12 sessions (4 × 3 passes, base and candidate alike).

**Depth 2-machine (pass A, seeded frame)**

| cell | card px before → after | card / hudContentBox before → after | `.objective`→`.dock` gap before → after | smallest face | page scroll | pageerror |
|---|---|---|---|---|---|---|
| 360×640 ts 1.0 | 107 → 107 | 16.7 % → **16.7 %** | 417 → 417 px | 46 px | none | 0 |
| 360×640 ts 2.0 | 274.4 → 261.4 | **42.9 % → 40.8 %** | 200.7 → 213.7 px | 46 px | none | 0 |
| 390×844 ts 1.0 | 89.2 → 89.2 | 10.6 % → **10.6 %** | 638.8 → 638.8 px | 46 px | none | 0 |
| 390×844 ts 2.0 | 274.4 → 261.4 | 32.5 % → **31.0 %** | 404.7 → 417.7 px | 46 px | none | 0 |

**Depth 4-machine, fork row open (pass C, seeded frame)**

| cell | card px before → after | card / hudContentBox before → after | `.objective`→`.dock` gap before → after | smallest face | page scroll | pageerror |
|---|---|---|---|---|---|---|
| 360×640 ts 1.0 | 107 → 107 | 16.7 % → **16.7 %** | 417 → 417 px | 46 px | none | 0 |
| 360×640 ts 2.0 | 274.4 → 261.4 | **42.9 % → 40.8 %** | 200.7 → 213.7 px | 46 px | none | 0 |
| 390×844 ts 1.0 | 89.2 → 89.2 | 10.6 % → **10.6 %** | 638.8 → 638.8 px | 46 px | none | 0 |
| 390×844 ts 2.0 | 274.4 → 261.4 | 32.5 % → **31.0 %** | 404.7 → 417.7 px | 46 px | none | 0 |

**Organic control at the 4-machine depth (pass B, the recorded tap method)** reads the same eight numbers as the seeded frames: before `16.7 / 42.9 / 10.6 / 32.5 %`, after `16.7 / 40.8 / 10.6 / 31.0 %`, gaps 417 / 213.7 / 638.8 / 417.7 px, smallest face 46 px, no scroll, 0 pageerror. The card text in the binding cell is `Choose what improves on the Scrap sorter · 30 credits` + the three secondary lines, last one `Batch pips · Scrap sorter #8 5/5 · Furnace #9 0/5 +2`.

**Every cell is ≤ 42 %** — the binding cells move 42.9 % → 40.8 % (−2.1 pp, exactly 13.0 px of card) and 32.5 % → 31.0 % (−1.5 pp); the ts 1.0 cells are unchanged because `.text-large .status-line` only matches at `--text-scale: 2` (`styles.css:34-35` scales the root font, so the same 1.1 unit is 23.76 px at scale 2.0 and 12.87 px at scale 1.0). The arithmetic agrees with the measurement: three secondary lines × two wrapped boxes × 2.16 px = 12.96 px ≈ the 13.0 px observed.

The 46.9 % figure recorded in the ticket belongs to the pre-DEF-006 capture; on this base (`0c03572`, which already carries DEF-006) the same organic method reads 42.9 %, and the candidate reads 40.8 %. Both directions are toward the cap; nothing regressed.

## 4. Legibility guard at text scale 2.0

Printed per status line, all four ts 2.0 cells at both depths (and identical between the seeded and organic passes):

| reading | 360×640 ts 2.0 | 390×844 ts 2.0 |
|---|---|---|
| computed `font-size` | 21.6 px | 21.6 px |
| computed `line-height` | 23.8 px (1.1 × 21.6 = 23.76) | 23.8 px |
| wrapped line boxes per line | 2, 2, 2 | 2, 2, 2 |
| glyph ink (canvas `actualBoundingBox`) | ascent 17 px + descent 5 px | 17 + 5 |
| white between a wrapped pair of rows | **1.8 px** (`23.76 − (17 + 5)`) | 1.8 px |
| per-row horizontal clip `scrollWidth − clientWidth` | 0 (290 / 290) | 0 (317 / 317) |
| card-row ↔ dock rect overlap | 0 px² for every row | 0 px² |
| nearest painted ink → `.dock` top | 218.4 px | 422.4 px |
| `.objective` bottom → `.dock` top | 213.7 px | 417.7 px |
| `documentElement.scroll` vs viewport | 360×640 = inner | 390×844 = inner |

So: no overlap with the dock (both by box and by ink, far above the 8 px floor), no horizontal clipping on any row, and a 1.8 px gap of true white between the descender of one wrapped row and the ascent of the next — the rows do not touch at 2.0 text scale. The 1.10 leading ratio is the same one `.text-large .dock__btn` already carries (`styles.css:265`), which is the coherence argument for the value: two numeric readout styles in the same column, one leading.

One honest rounding note: on the two-box lines at ts 2.0, `scrollHeight` = 49 against `clientHeight` = 48 (the font's content area is 24.84 px per line, so two lines ink 49.68 px inside a 47.52 px content box). `overflow` is visible on these spans, and the check that the last row's ink (`bottom` 367.6) stays inside the card box (`bottom` 372.3) passes, so nothing is cut off; the extra pixel lands in the card's own 6 px bottom padding. At `line-height: 1.2` the same lines read `sh52/ch52`; the 1 px is the cost of the last tenth of leading, and it is inside the card, not outside it.

Visual inspection of the affected screen: `chrm002-{2m,4m}-{360x640,390x844}-{ts1,ts2}.png` in the scratch dir (real Chromium captures of the candidate build, dpr 2, mobile+touch). At 360×640 ts 2.0 the card ends a hand's width above the dock, the three secondary lines are three clearly separated grey rows under a two-word-per-line amber-titled card, and the fork faces still read `Faster batches · 40 credits` and `Less power · 30 credits` at 46 px height. No row collides, nothing is cut at the card edge, and the world keeps the middle band.

## 5. Gates (real exit codes, this tree)

| gate | exit | reading |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit`, no output |
| `npm test` | 0 | **283 passed / 283, 27 files**, 4.61 s — unchanged |
| `npm run validate` | 0 | `tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes`; `content: 0 violation(s) in 3 ms`; `behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 \| 0 violation(s)` — **verbatim the recorded line** |
| `npm run build` | 0 | `assets/index-DGy53fNu.js` **231,878 B** (≤ 233,000 ceiling, 1,122 B spare), `assets/index-9FriNULu.css` **7,474 B**, `tables-BB2NPvQ2.js` 9,298 B, `catchup.worker-G_Jyr7uh.js` 13,406 B |

`schemaVersion` stays 1 and the pre-fork fixture checksum stays `eede3c4f` (asserted by the unchanged `tests/persistence/save.test.ts`); the whole suite is green, and the behaviour line above is the same 10 quantities as recorded.

**Asset names/sizes.** Entry: `index-DGy53fNu.js`, **231,878 B** — byte-identical content to the base `index-Cmh4A1Sb.js` (same sha256, same 231,839-character/231,878-byte size, 0 differing positions), its *name* changes only because Vite folds the css chunk's name into the entry chunk's hash. CSS: `index-9FriNULu.css`, **7,474 B** (was `index-mmTSZ7Fz.css`, 7,474 B) → **css delta 0 bytes**, one character different. `dist/index.html` stays 1,290 B with both new names in it; tables and worker chunks are byte-identical. The ceiling applies to the entry only and is unmoved.

## 6. Rollback / save impact

No `SimState` or save-schema change: one css declaration. `schemaVersion` 1, checksum `eede3c4f`, and a save written by this build is byte-identical to one written by `0c03572` for the same tick and command list (nothing in the layout touches the engine; the harness/behaviour line is verbatim unchanged). Rollback = revert the single commit: the leading returns to 1.2, the card returns to 274.4 px (42.9 %) at 360×640 ts 2.0, the entry/chunk names return to `index-Cmh4A1Sb.js` / `index-mmTSZ7Fz.css`. Promotion keeps the old asset names fetchable only from the old release directory, as before — the pair (entry, css) is replaced together inside one `index.html`, so there is no mixed-generation window beyond the existing one.

## 7. Not proved / limits

- No human playtest and no independent QA verdict on this candidate; every chromium number is this developer's own run of `scripts/measure-chrm002.mjs`, one frame per cell, fresh context per cell.
- The card ratio is frame-content sensitive: the seeded frames and the organic frame are both reported, and the before/after pair for each is the regression statement (identical boxes except the 13.0 px the leading buys back).
- The 4-machine seeded frame is *a* 4-machine frame (four named blueprints, `links=10`), not a byte-copy of the organic one (`links` and tile numbers differ), which is why both are printed with their own labels; their measured cells agree.
- Unverified dimensions: real-device rendering (dpr 2 headless only), audio (not listened to), and the 1 px `scrollHeight`/`clientHeight` rounding at 1.1 is stated from the layout engine, not from a pixel-level ink diff.
- `scripts/measure-chrm002.mjs` ships as the measurement harness for this cap; `work/development/handoffs/CHRM-002-g1.json`-style raw stdout is in the scratch dir (`chrm002-base-ac.txt`, `chrm002-base-b.txt`, `chrm002/after-ac.txt`, `chrm002/after-b.txt`) together with the eight PNGs.
