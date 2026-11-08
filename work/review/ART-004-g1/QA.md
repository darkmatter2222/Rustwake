# ART-004 g1 - independent QA, delta review (generation 1)

Reviewer session ses_e48ffbb7affe7K9h3jFX5KF5ol. Candidate c30c07d15800ae2bec562fd7aa00795c24a6da66
(refs/heads/rw/art004-g1 tip; d4f8932 verified ancestor; merge-base with main = 887b5bc). Worktree
rev-art004-g1 (detached at c30c07d), merge worktree rev-art004-g1-merged (branch qa-merge-art004-g1).
node_modules COPIED from worktree/fe4e05/polish-g1 (robocopy, 4815 files, exit 1) - legitimate because
package.json / package-lock.json blob ids are identical in all five trees (60394ca / 2c18800). Dev server:
my vite on 4391. My instruments: qa-census2.mjs (+ qa-census2-fs1.mjs variant), qa-shadow-box.mjs; the
shipped scripts/art003-census.mjs, art003-silhouette.mjs, capture-clip.mjs were also run and their outputs
kept here as qa-repo-*.json. Numbers are mine unless a row says "committed".

## 0. Verdict

* Technical gates at c30c07d: PASS (typecheck 0; vitest 28 files / 294 tests / 0 failed; validate 0;
  build 0, entry index-NaDxD6XG.js 232825 B <= 233000). The four vitest failures recorded at 6a25c97 close.
* D1 as recorded: NOT MET - 4 of 8 bands above 70 %, both outer bands still exactly 0 %. Improved, not met.
* 4-way merge: BLOCKED on the byte ceiling - entry index-B2O0cMhZ.js = 233311 B, 311 B over 233000.
  Exactly one merge-only test fix is required (i18n:301) to reach 320/320.

Player-visible deltas measured at 390x844: painted plate 154-715 = 66.6 % of the canvas (was 179-641 =
54.9 % at 6a25c97), +57 px of ink height; every machine sits on a visible shadow ellipse including the
assembler; both gutters gained dash rail. Still: a bright machine strip inside a large flat navy field,
the two level digits "10" on the lattice glyphs are still the primary identity cue.

## A - gates at c30c07d (real exit codes)

| gate | exit | result |
| --- | --- | --- |
| npm run typecheck | 0 | clean |
| npx vitest run | 0 | **28 files passed / 294 tests passed / 0 failed** (lane claim 294/28 reproduces; the 4 failures at 6a25c97 are closed) |
| npm run validate | 0 | behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 - byte-identical to the 6a25c97 row, 0 violations |
| npm run build | 0 | assets/**index-NaDxD6XG.js = 232825 B** (ceiling 233000, headroom 175 B); also catchup.worker-G_Jyr7uh.js 13406 B, index-9FriNULu.css 7474 B, tables-BitCvnlB.js 9760 B |

Committed-tree confirmations (source inspection):
* tests/renderer/silhouette.test.ts:24 - SCALE = 390 / (192 + 8); // 1.95 - **reproduced**
* src/game/renderer/sprites.ts:171 - circuitAssembler bar [-12, 9, 24, 3, 3] (mask row 6), with the
  contact ellipse [-11, 12, 22, 3, 15, 1] in the same row list - **reproduced**
* docs/evidence present and non-empty: 2026-11-06-art003-silhouette.json 10424 B,
  2026-11-06-art003-clip.json 59537 B, 2026-11-06-art003-census-after.json 7100 B (+ afterfleet 9595 B)

Evidence freshness, my own runs of the shipped instruments:
* census-after.json **non-stale**: fresh run reproduces every key row exactly -
  luminanceBuckets8 [94.8,0.5,2.5,1.6,0.3,0,0,0.2], twoDarkest 95.3, twoTop 82.1, gridInk 0.13
  (39 + 404 px), bandFit.scale 1.95, plateCssPx [204.6,641.4], gaps 148.6/148.6, cell ink
  sorter@8 63.9/63.13, furnace@14 61/61.15, dock@2 67/66.13, wreck 99.9/149.52, minFacePx 44,
  scrollHeight 844 = innerHeight 844, pageErrors 0
* 2026-11-06-art003-clip.json **reproduces** by behaviour: fresh capture-clip.mjs exit 0, 26 frames,
  26 distinct PNG hashes, 26 distinct drone positions, **0 null droneBodyCssPx** (the scale-relative
  tolerance fix works at 1.95), stepMax 113.5 (committed 113.5), stepMean 83.14 (committed 85.68 -
  organic rAF phase noise)
* **2026-11-06-art003-silhouette.json IS STALE - 9 numeric rows** versus the committed census it
  aggregates (regenerated with npx tsx, diff taken, tracked file restored): furnace14 buckets 7 -> **6**,
  machineInk 452 -> **453**, gridInk 0.14 -> **0.13**, machineRowInkPx 7290 -> **7414**,
  machineRowInkShare 62.9 -> **63.9**, cellInk sorter8 62.95 -> **63.13** and furnace14 58.14 -> **61.15**,
  twoDarkest 95.4 -> **95.3**, bucket0 94.9 -> **94.8**. The a3_1 matrix rows are unaffected. Same defect
  class as my prior defect 2, now only in the aggregator file: it was generated before the last census
  regeneration.

## B - the D1 row, one instrument, both arrays side by side

Instrument for the D1 row: qa-census2.mjs › bandInkPct - 8 equal-height horizontal spatial bands
(y0 = floor(b*h/8), y1 = floor((b+1)*h/8), h = 844), per-band share of pixels that are NOT the
night background (11,18,32 +/- 2). Identical function, identical page setup, both field states.

| index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **D1 8 spatial bands, c30c07d, FS-1 field** | **0** | **27** | **96.2** | **96.2** | **96.2** | **95.8** | **19.6** | **0** |
| **D1 8 spatial bands, c30c07d, mature 8-machine field** | **0** | **27** | **96.2** | **96.2** | **96.2** | **95.8** | **19.6** | **0** |
| D1 8 spatial bands, 6a25c97 (recorded row) | 0 | 18.8 | 96.2 | 96.2 | 96.2 | 95.8 | 7.7 | 0 |
| lane's array = whole-canvas luminanceBuckets8, FS-1 (committed, reproduced by my fresh census run) | 94.8 | 0.5 | 2.5 | 1.6 | 0.3 | 0 | 0 | 0.2 |
| lane's array, mature field (committed census-afterfleet, my fresh run identical) | 92.5 | 0.7 | 3.2 | 2.6 | 0.7 | 0 | 0 | 0.4 |

**Judgement on the criterion exactly as recorded** (>= 5 of 8 bands above 70 %, outer bands non-zero):
* bands above 70 %: indices 2, 3, 4, 5 only = **4 bands**, not 5 -> first condition **not met**
* outer bands: index 0 = 0 %, index 7 = 0 % -> second condition **not met**
* verdict: **D1 NOT MET** at c30c07d. Which bands the lane's lever moved: band 1: 18.8 -> 27 (+8.2);
  band 6: 7.7 -> 19.6 (+11.9). Bands 0 and 7 did not move at all. Identical on both field states.

Why the lane's own array is not the D1 row: the 8-number array printed in the handoff is the
whole-canvas **luminance** histogram (identical to the committed census key luminanceBuckets8), whose
index is a tone level, not a screen row. Its b7 moving 0 -> 0.2 is the lit bank line entering the
brightest tone bucket; it does not mean the top or bottom eighth of the screen gained ink.

Second instrument note, so "uniform after 15 %" is checkable:
* painted-ink extent (my plateExtent, non-night rows): **154-715** = 562 px = 66.6 % of 844, versus
  179-641 = 54.9 % at 6a25c97 (+57 px). The module fit is narrower because it is the floor rect only:
  plateCssPx [204.6, 641.4] = 436.8 px at scale 1.95, gaps 148.6 + 148.6 = **297.2 px of dead band**
  inside the chrome band, versus base scale 1.8056 / [219.78, 624.22] = 404.44 px and 163.78 + 165.78 =
  329.56 px dead. Rows 0-153 and 716-844 contain the night colour only - that is exactly bands 0 and 7.
* shipped gutters rows cannot see this: in region() the ink test is "!= floor", so both gutters print
  inkSharePct 100 whether or not anything is painted. Only horizonBandPx (4158 above, 0 below) moves.
* per-box luminance buckets (>= 2 % share colours, shipped instrument): committed sorter8 8 /
  furnace14 7 / dock2 5 / wreck 6 versus base 8 / 7 / 5 / 7; my fresh regeneration 8 / **6** / 5 / 6.
  All >= 3 -> ">= 3 luminance bands inside one machine box" is met; versus base, the wreck lost one
  bucket (7 -> 6) and, on the fresh census, the furnace too (7 -> 6).
* my own >= 2 % bucket count per machine, mature field: sorter 5, furnace 4, polymerRecycler 3,
  copperSeparator 3, wireMill 5, platePress 3, circuitAssembler 4, signalLab 4 -> >= 3 everywhere.
* A-3-1 note corrections: unit grid 15/15 pairs above base (a3_1.unitGrid.pairsAboveBase = 15;
  dock/signalLab 70.2 vs base 66.2 is an improvement); the single decline is on the aligned 58x58
  pixel sheet: signalLab/drone 54.7 vs base 54.9 (alignedPixelSheet.pairsImproved = 14).

## C - per-machine contact shadows (my table vs the lane's claim)

Counting rule (same in both instruments): pixels equal to the shadow blend (28,46,62) +/- 3 inside the
machine's own 32-unit cell box; wreck inside its 24x16 box. Column 2 = committed
2026-11-06-art003-census-afterfleet.json (CENSUS_FLEET=template, tick 344); column 3 = my fresh run of
that same shipped script; column 4 = my own independent instrument qa-shadow-box.mjs (mature field,
tick 18298, 3 repeat runs).

| footprint | lane claim | my repo-script run | my own probe | verdict |
| --- | --- | --- | --- | --- |
| sorter@0 | 108 | 108 | 108 (x3 runs) | **reproduced** |
| furnace@1 | 87 | 87 | 87 | **reproduced** |
| polymerRecycler@3 | 104 | 104 | 105 | reproduced (+/- 1 px) |
| copperSeparator@4 | 108 | 108 | 108 | **reproduced** |
| wireMill@5 | 123 | 123 | 123 | **reproduced** |
| platePress@6 | 95 | 95 | 95 | **reproduced** |
| **circuitAssembler@7** | **81** (was 0) | **81** | **81** | **reproduced** - the row-6 bar move works |
| signalLab@8 | 42 | 51 | 55 (56 once) | **not reproduced** - 42 is not stable; I read 51/55/56 |
| dock@2 | 121 | 86 | 114 (x3 runs) | **not reproduced** - 121 is not stable; I read 86/114 |
| wreck | 6 | 6 | 6 | **reproduced** |
| field total | 931 | 940 | 1045 / 1063 / 1095 | **not a stable witness** (see note) |

* Per-box counts are stable to +/- 1 px across my repeat runs; the **global** shadow total is not
  (931 committed / 940 my re-run / 1045-1095 my probe at tick 18298). It counts the whole canvas while
  the drone ellipse and route pips move, and the two runs are at different ticks (344 vs 18298). The
  per-box rows are the certifiable ones; the 931 total should be printed with its tick or dropped.
* FS-1 field (same pair the committed census-after uses): my fresh repo-script run gives
  sorter@8 49, furnace@14 111, dock@2 123, wreck 6, global 435 - the first four match the committed file
  exactly; only the global differs (453 committed, phase noise again).
* Nine of nine machine rows are non-zero, so A3-3's "contact shadow under every footprint" is met on
  both field states; the two unstable rows (signalLab, dock) are non-zero in every one of my runs.

## D - 4-way merge arithmetic (for the release engineer)

Order as instructed: origin/main -> rw/ui002-g1 -> rw/belt001-g2 -> rw/art004-g1. Every merge ran in
rev-art004-g1-merged with --no-edit. **No conflicted paths at any step** (git status clean after each
merge, no stage-1/2/3 entries):

| step | merge commit | parent 1 | parent 2 |
| --- | --- | --- | --- |
| base | 1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2 | - | - |
| 1 | 28dfa9bf39b15f965cac254785d3f37e68ef6d1b | 1573ac1 | 0daab63b2056ebc8733f46d42cb32cd122f7b56d |
| 2 | e6f30d7f170df0ff682403f2fa41c5e1d3a701fe | 28dfa9b | fb0dca0f3acd81e1cd13eb5f4b89b1577baa4b4d |
| 3 | 44c82335a373dc1103d00d626c003c6a6878363e | e6f30d7 | c30c07d15800ae2bec562fd7aa00795c24a6da66 |

Before any fix, at 44c8233 (npx vitest run, exit **1**):
* **1 failed / 319 passed, 1 failed file / 30 passed (31)**
* the failure is the predicted one: tests/ui/i18n.test.tsx:301:29, "string table (B-10) > phrases every
  panel from the table, singular and plural included", AssertionError: expected
  "...Dismantle · +21 units..." not to contain "1 units". Belt's priced dismantle prints "+21 units" and
  the substring "1 units" sits inside it. **The fix was required.**

After applying exactly the one specified line (nothing else; git status shows only
tests/ui/i18n.test.tsx modified, plus work/feedback/belt001-harness.json rewritten by the belt harness):
* expect(machineText).not.toMatch(/(^|[^0-9])1 units\b/);
* npx vitest run, exit **0**: **31 files passed / 320 tests passed / 0 failed**
* npm run typecheck exit 0; npm run build exit 0

Entry asset on the merged tree: **assets/index-B2O0cMhZ.js = 233311 B** -> **OVER the 233000 ceiling by
311 B** (other assets: index-DbNBovuF.css 8091 B, tables-BitCvnlB.js 9760 B, catchup.worker 13406 B).

Per-branch marginal cost, measured on this exact merged line (each intermediate merge built separately):

| tree | entry asset | bytes | marginal |
| --- | --- | --- | --- |
| 1573ac1 (main) | index-C_K4oMJ5.js | 231262 | - |
| + ui002-g1 0daab63 = 28dfa9b | index-JtFswdB-.js | 231328 | **+66** |
| + belt001-g2 fb0dca0 = e6f30d7 | index-BFr2GU0i.js | 232364 | **+1036** |
| + art004-g1 c30c07d = 44c8233 | index-B2O0cMhZ.js | 233311 | **+947** |

231262 + 66 + 1036 + 947 = 233311 exactly, so the three marginals are additive here.
The predicted 232977 is 334 B low because it used belt = +86. Belt's **branch** delta over its own
merge-base (b4e8321, index-DGy53fNu.js 231878 B, both verified by my own build) is
232914 - 231878 = **+1036**; +86 is the last-commit increment inside the belt lane only.

Save parity on the merged tree:
* schemaVersion **1** (unchanged), fixture checksum **eede3c4f** unchanged and it recomputes to eede3c4f
  from the payload, 8 machines, batchesDone sum 1902 in the fixture file itself
* npm run validate exit 0, but the behaviour line is the **belt** line, not the pre-belt line:
  firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 **batches=1838 credits=157**
  nodes=3. Attribution is unambiguous: belt alone prints that line; main, ui, art and main+ui all print
  268/478/18298/8/18/5/1902/82/3. So 1902/82 does not survive the merge - it is belt's intended sim
  change, not a merge interaction (m2 == belt-alone, byte-identical line)
* merged tree test counts for the record: main 287/28, ui 291/29, belt 301/28, art 294/28, merged 320/31

Cheapest byte source for the 311 B, in the three diffs:
1. **The ART pilot atlas** - the lane's own A-1 row prices it at +616 B (232306 -> 232922) and the
   renderer now carries atlasOf/ATLAS_IDS/ATLAS_PLACE plus the drawImage branch. The only CPU witness in
   the suite is blind to it (it is a headless sim bench): 12 h starter yard 40.60 ms at c30c07d versus
   41.36 ms at main - i.e. no measurable gain or loss, so the atlas is currently pure byte cost.
   Dropping the pilot page and keeping the vector path is the cheapest way to clear 311 B.
2. Belt: the four new TUNING keys and their helpers are already minimal; nothing there is worth 300 B.
3. UI: 66 B of JS; its real cost is the separate CSS asset (7474 -> 8091 B), which does not count
   against the entry ceiling.

## E - what the captures show (my own eyes, 390x844)

captures/c30c07d-rest-390-dpr2.png (mature field, 1x FS-1 and the 2x strip and per-glyph crops too):
1. **The two dead bands are still the biggest defect.** Rows 0-153 and 716-844 are one flat navy: the
   new dash rails sit just inside the plate, so the plate reads taller but the frame is still "a bright
   strip inside a dark rectangle". Art direction unchanged from my last pass: raise WORLD_H so the width
   term is no longer the binding constraint, or paint the top gutter with the distant-bank tier
   (path at alpha ~0.5) in 2-3 bands - the 0/7 bands only move if ink lands above row 154 / below row 715.
2. **The lattice family is still one box type.** In the 2x strip, polymerRecycler / copperSeparator /
   platePress / circuitAssembler all read as pale slab + light cap bar + dark slots; the two left-most
   glyphs in the second row are both "H-frame with 10". One shape difference per machine in the existing
   palette (gable, cantilever, toothed comb, chimney) is still the fix, not another tone step.
3. **Digits still do the identity work** (14, 13, 11, 12, 10, 10 legible at 2x while the glyph
   differences are not), and the cyan route beams still out-shine the bodies they connect.

Positive and measurable: the shadow ellipses now read as ground contact under every machine, the sorter's
disc grid and the furnace's rust cap + slots are separable at 1x, and the rest frame does not shimmer
(grid ink 0.13 %, 36 gravel ticks).

## F - three most valuable follow-ups

1. **Clear the byte ceiling on the merged line (blocks the release).** Need >= 311 B at 233311 B.
   Cheapest single lever: drop the pilot atlas page and keep the vector path (-616 B by the lane's own
   price), or fold the atlas behind the existing op-log stub branch. Reproduction: build the merged tree
   (44c8233 + the one-line i18n fix) and print dist/assets/index-*.js.
2. **Make D1's outer bands non-zero.** Band 1 and band 6 already moved (+8.2, +11.9); bands 0 and 7 need
   ink outside the current floor rect: WORLD_H >= 336, or bank tiers at y -26 / -18 extended into rows
   56-153 and a gravel rail under the apron in rows 716-790. Then re-print the spatial band array with
   the same instrument and index order - the luminance array cannot satisfy this row.
3. **Evidence hygiene.** (a) regenerate 2026-11-06-art003-silhouette.json after the last census run
   (9 stale numeric rows today); (b) print the contact-shadow tick with the field total, or drop the
   total in favour of the per-box rows (931 vs 940 vs 1045-1095 at three ticks); (c) the clip files'
   label says "tick 344" while the printed rows carry tick=432404 - pin one or the other.

## G - not verified (these stay unknown, they cannot certify beauty or fun)

* Audio: never heard - no loopback capture in this headless runtime (Sound on, pulse/complete cues).
* Real devices: iOS/Android Chrome, DPR 3, safe areas, warm-up after 60 s - desktop Chromium only,
  deviceScaleFactor 1 and 2.
* Human comprehension: one real rater (me) plus labelled crops whose file names carry the blueprint id.
* Frame pacing on mid-range hardware (26 distinct hashes is not a pacing proof).
* Deployment: this is a source-SHA review; no deployment receipt inspected, live build not re-checked here.

## H - reviewer-owned evidence in this directory

qa-census2.mjs, qa-census2-fs1.mjs, qa-shadow-box.mjs; qa-census-c30c07d.json (mature),
qa-census-c30c07d-fs1.json; qa-repo-census-fs1.json / qa-repo-census-fleet.json (shipped script, fresh),
qa-repo-silhouette-fresh.json, qa-repo-clip-250ms.json, qa-repo-census-{fs1,fleet}.log, qa-repo-clip.log;
captures/ (rest dpr1/dpr2 both states, machine strips, 8 glyph crops, silhouette sheet), clip/ (26 frames).
Both tracked files the instruments rewrote were restored with git checkout; git status in this worktree
shows only work/review/ART-004-g1/.
