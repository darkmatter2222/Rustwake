# STRAT-004 generation 1 — the pressed face names what it is waiting for

- **Task / role / generation:** STRAT-004-g1, developer, 2026-11-07.
- **Base:** `main = 1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2`; the base artifact served for the "before"
  readings is that commit's `npm run build` output (entry `index-C_K4oMJ5.js` 231262 B — the same bytes as
  the deployed `a551794…` build).
- **Candidate:** branch `rw/strat004-g1`, SHA at the end of this note.
- **Window:** W-3 exactly as PLAYER-004 g1 ran it — 180 s wall, 1 tap/s, 390x844 dpr2, `isMobile`+`hasTouch`,
  fresh storage per context, final tick 1800 = 3.00 simulated minutes. **One named denominator for every
  share: `taps` = the total taps the policy issued = 177** (this is the fix for the 176-vs-178 note in
  DECISIONS row 1).
- **Evidence type:** actual browser interaction (chromium), plus automated tests, byte checks and visual
  inspection of the stills. Simulated-persona policies, not human research.

## 1. What changed for the player

The pressed face now prints its own pending number as a third painted line, in the face's own `dock__cost`
type:

```
Build Furnace
10 scrap + 5 ferrous        <- the price line, unchanged
waits 10 scrap · have 5     <- new: the first item the price is still short of, and what the yard holds
```

Both figures are read, not computed twice: `need` is the quantity the content table asks for that step,
`have` is the same `state.store[resource]` (or `state.credits`) entry the Store panel and the `Need N · have k`
toast read. A covered price adds no line; a `+N …` gain (a sale) is not a price and never blocks. The
`Last need …` tail in the status line is untouched and still prints.

**Same tap index 33, same protocol, two artifacts** (`stills/base-blind-tap033.png`,
`stills/candidate-blind-tap033.png`, both 390x844 dpr2, both with the chip reading `Scrap 5`):

| | the pressed face | status tail |
|---|---|---|
| base | `Build Furnace` / `10 scrap + 5 ferrous` | `… · Last need 10 scrap · have 4` |
| candidate | `Build Furnace` / `10 scrap + 5 ferrous` / `waits 10 scrap · have 5` | `… · Last need 10 scrap · have 4` |

**What a returning player can tell apart now:** during the ~33 s wait the face under the thumb counts —
`have 1` → `have 4` → `have 5` — so "the drone is bringing the scrap, 5 of 10 landed" is readable without
looking away from the button, and the moment `have` reaches the need the next press lands. Before, those
33 taps printed letter-identical words and the only moving figure sat two lines above the dock (or in a
1.8 s toast). **What is still invisible:** no time-to-arrive, the second short item when two are short, and
nothing new on the two named fork faces (they keep exactly their two lines, so the fork row is unchanged).

## 2. The four acceptance rows (W-3, `policy-census.json`, `census-run.log`)

Bucket precedence, printed with the numbers: `refused-shortfall` (a `Need N · have k` toast) first, then
`inert-label` (no toast, the pressed face's own text identical to the previous tap), then `unknown`.

| row | criterion | base (measured here) | candidate | verdict |
|---|---|---|---|---|
| 1 | three named buckets, one denominator, summing to the total no-ops | 62 + 69 + 10 = **141** = `noopTaps` | 52 + 68 + 21 = **141** (blind), 49 + 68 + 24 = **141** (v2) | **pass** |
| 2 | `inert-label` ≤ 20.0 % of `taps` | 62/177 = **35.0 %** | 52/177 = **29.4 %** blind, 49/177 = **27.7 %** v2 | **FAIL** (as measured) |
| 3 | longest identical-label stall ≤ 16, pending number on the face | **34** (35 taps, taps 34–68), 0 face lines carrying it | **9** (10 taps, taps 38–47), **10/10** stall taps carry `waits … · have …`, 10/10 still carry the `Last need` tail | **pass** on the named criterion |
| 4 | applied ≥ 37, machines ≥ 5, batches ≥ 51, credits ≥ 8 | 37 · 5 · 47 · 8 | **37 · 5 · 51 · 8** (both policies) | **pass** |

Row 2 in full: the gain against the base is **5.6 pp (blind) / 7.3 pp (v2)** and its mechanism is exactly
one thing — the new suffix changes the printed string on 11 (blind) / 14 (v2) otherwise-identical taps, which
moves them from `inert-label` into `unknown` (`buckets.unknownSplit.faceChangedOnlyInPendingSuffix`). The
`unknown` rise 10 → 21 is that, and nothing else: `distinctPrimaryLabels` 14 → 45 while
`distinctPrimaryLabelsWithoutSuffix` stays **14** — more distinct strings, not more distinct outcomes. Cut the
suffix and the bucket is **63/177 = 35.6 %** (`bucketsSuffixIndependent`), i.e. the base's shape. To reach
20 % the face would need a digit that moves every tap; the yard's own delivery cadence moves the pending
number only every 2–4 taps, which caps this counter near 30 % at the 1 tap/s protocol. Reported as a fail;
the follow-up decision (per-tick digit vs a re-derived floor) is the product owner's.

Row 3, the honest companion readings, printed side by side in `policy-census.json`:

| stall reading (same run, same timeline) | base | candidate |
|---|---|---|
| `stallPrinted` — PLAYER-004 g1 counter over the whole face text the player reads | 34 | **9** |
| `stallSuffixIndependent` — same counter over label + price only (the base's own strings) | 34 (35 taps, 17 refusal toasts, 0 commands) | 32 (33 taps, taps 31–63, **16 refusal toasts, 0 commands**) |
| `stallByPressedIndex` — consecutive non-applied taps on one pressed face index (no strings) | 36 taps | **34 taps** (16 refusals, 2 commands) |

So: the *engine* still waits the same ~33 s on the same 5-unit drone delivery (32–34 taps on both string-free
readings); the *perceptible* stall is 9 taps because the face's own number now moves. Both numbers are in the
json; neither replaces the other.

Aggregate no-op share is unchanged at **141/177 = 79.7 %** on both artifacts (1 tap/s against 10 ticks/s:
most taps land between state changes — a property of the instrument, as DECISIONS row 1 says).

## 3. Witnesses

| witness | candidate | limit |
|---|---|---|
| entry chunk | `index-Bzroy-nV.js` **232175 B** (base 231262 B, +913 B) | < 233000 B pass, 825 B headroom |
| `npm run typecheck` / `npx vitest run` / `npm run validate` / `npm run build` | exit 0 / 0 / 0 / 0 (28 files, 287 tests) | all 0 |
| `validate` behaviour line | `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 \| 0 violation(s)` | identical to the pre-change line: the sim did not move |
| tap targets, 8 cells (`layout-witness.json`) | smallest face 44 / 44.4 / 45 / 46 / 47.8 / 48.5 px | ≥ 44 px pass |
| page scroll | `scrollHeight == innerHeight` in all 8 cells (360x640 and 390x844, text scale 1 and 2) | pass |
| card fill at text scale 2.0 | 32.8 % (360x640), 20.8 % (390x844), 24.8 % (fork row) — **identical to base in every cell** | ≤ 42 % pass |
| dock rows / clipping / pageerror / stray panel | 1 row, none clipped, 0 pageerror, no panel opened | pass |
| save | `schemaVersion 1`, fixture `eede3c4f` untouched (no `tests/` or `src/game/persistence/` file is in this lane's paths) | pass |

**Measured layout price of the third line:** the dock row is 46 px → 50.9 px at text scale 1 and 46 px →
55.5 px at text scale 2.0 (390x844); at 360x640 text scale 2.0, where the labels already wrap, 59.4 px →
75.9 px. The canvas keeps its full box and the yard is re-fitted into the smaller band, so the world loses
that much column. This is the ART lane's denominator (DEF-011 / ART-003), so `space.json` should be
re-printed by whoever holds that lease after integration.

## 4. Limitations

1. The W-3 window is bounded by wall-clock cadence, so it is reproducible only to ±2 taps and ±4 batches:
   the same base artifact printed 47 batches here and 51 in PLAYER-004 g1, and the same candidate printed
   `inert-label` 50 in one run and 52 in the next. Both readings of every row are in `policy-census.json`.
   There is no tick-locked instrument yet.
2. `inert-label` is a *string* counter: the same physical tap can move between `inert-label` and `unknown`
   purely because a line was added. Both readings are printed for exactly that reason.
3. `have` on the face is the live state; the `Last need …` tail is the last refusal, so they can differ by
   one delivery within a second (visible in the tap-33 pair above: face `have 5`, tail `have 4`). The face is
   the fresher of the two; neither is computed twice.
4. The fork faces keep two lines by design, so a credit shortfall at the fork is still only in the status
   line; and the second short item is not named when both are short.

## 5. Rollback

Revert `src/ui/text.ts` and `src/ui/Hud.tsx` to `1573ac1`. No engine, price, save-shape or string-table file
is touched, so any save written by either artifact loads unchanged on the other.

## 6. Files here

`policy-census.mjs` (+ `policy-census.json`, `census-run.log`, `stills/`) — the W-3 instrument, both artifacts,
both policies, three stall readings, 12 stills at taps 33/40/48; `layout-witness.mjs` (+ `layout-witness.json`,
`layout-witness.log`, `layout-table.mjs`, 8 layout stills) — the 44 px / 42 % / no-scroll witnesses;
`face-line-check.mjs` — the two derivations of the pending line agree on 8 engine-written frames;
`baseline-census.mjs` — the PLAYER-004 g1 timeline re-printed in these buckets (63 / 68 / 10 of 141, stall 32);
`inert-runs.mjs` — the per-run listing of the inert taps; `checks.txt` — gate exit codes and asset bytes.

## 7. Integration note for the release engineer (measured at `965b304`)

`git merge-base 1573ac1 bcb3d1cdefdc9f84108b8bb91cd95e2736853618` = `1573ac107acc3c9c0bed8e9eafffbd1b9ea3bca2`:
this lane's base **is** the merge-base with `rw/belt001-g4` (`--is-ancestor` exit 0), so no rebase is required.

Exact-match hunks of this branch, in base line numbers (`git diff -U3 1573ac1..HEAD`), all insert-only:

| file | hunk | what it does |
| --- | --- | --- |
| `src/ui/text.ts` | `@@ -19,6 +19,7 @@` | `plural,` added to the `./strings` import braces (old 19-24) |
| `src/ui/text.ts` | `@@ -77,6 +78,7 @@` | `rememberSpoken(state);` as first statement of `objectiveFor` (old 77-82) |
| `src/ui/text.ts` | `@@ -146,6 +148,7 @@` | same, in `primaryFor` (old 146-151) |
| `src/ui/text.ts` | `@@ -284,6 +287,7 @@` | same, in `restingLine` (old 284-289) |
| `src/ui/text.ts` | `@@ -293,6 +297,131 @@` | the STRAT-004 block appended after `restingLine` (old 293-298) |
| `src/ui/text.ts` | `@@ -331,6 +460,7 @@` | same `rememberSpoken`, in `visibleResources` (old 331-336) |
| `src/ui/Hud.tsx` | `@@ -3,7 +3,7 @@`, `@@ -162,6 +162,8 @@`, `@@ -170,12 +172,15 @@`, `@@ -189,6 +194,12 @@`, `@@ -227,6 +238,7 @@` | import gains `pendingFromCost`; two third-line spans |

`rw/belt001-g4` edits only two places in `text.ts` — `@@ -3,13 +3,14 @@` (`beltCost,` in the `commands` braces,
`RouteState` in the `import type` line; old 3-15) and `@@ -382,3 +383,17 @@` (`beltExtentLine` appended at end of
file; old 382-384) — and zero lines in `Hud.tsx`. Those old-side ranges are disjoint from every range above
(tightest pair: belt ends at old 15, this lane starts at old 19), every hunk on both sides is insert-only, and
no identifier is introduced twice (`beltExtentLine` vs `face.waits`/`spokenState`/`pendingForStep`/
`pendingFromCost`/`shortfallForStep`/`heldAmount`/`faceWaitLine`).

Mechanical check, no working-tree change: `git merge-tree --write-tree 965b304… bcb3d1c…` exits 0 with one tree,
`3ad3b8844b0213d0af340abd26179081b88d7c59`, and no conflict section. That merged `text.ts` (493 lines) carries
both sides — `"face.waits": "waits {need} · have {have}"`, `plural,`, `import type { RouteState, … }` and
`export function beltExtentLine(route: RouteState)` — and the merged `Hud.tsx` carries all three
`pendingFromCost` call sites plus both `dock__wait` spans. A straight 3-way merge or a rebase of `3cdc055` then
`965b304` onto `bcb3d1c` therefore needs no manual resolution, and the entry-chunk figure in `checks.txt` stays
valid because these two files are the only shipped-code edits on this lane.

---

# STRAT-004 generation 2 — the tail counts, and the no-op row is three named kinds

- **Tree:** `rw/strat004-g1` on top of `origin/main`, merge commits `4edb4f8` (onto `6e0dce9`, BELT-001) and
  `5e5e35b` (onto `5610528`, UI-004); shipped code `96a5428`, byte trims `5b91587` (shared `DOT` const) and
  `4a19157` (shared dock class consts); this note and the witnesses land in the doc-only commit on top.
  Measured entry chunk on this head: `index-BjqNquCb.js` **233145 B** (main alone 232792 B, ceiling
  233000 B — see sec. 10).
- **Window:** W-3 unchanged — 180 s wall, 1 tap/s, 390x844 dpr2, `isMobile`+`hasTouch`, fresh storage, final
  tick 1800 = 3.00 simulated minutes, both policies, both artifacts, one instrument
  (`policy-census.mjs` → `policy-census.json`, `census-run.log`). **One named denominator for every share:
  `taps`** = 178 on both artifacts in this run (the earlier run at `5e5e35b` printed 177 on the base, the ±1
  wall-clock drift limitation 1 names); every share below is over that artifact's own `taps`.

## 8. What changed for the player (g2)

One line, still inside the face's own `dock__cost` type — the pending tail and a whole-seconds countdown are
appended to the price line, so the face is one string in three parts instead of two spans:

```
Build Plate press
35 scrap + 8 ferrous · waits 35 scrap · have 15 · in 4s
```

Read from the painted stills (`stills/candidate-*-tap0{33,40,48}.png`, all four faces legible, one dock row;
the `timeline` rows of `policy-census.json` carry the same strings per tap):

| tap | the pressed face, as painted | what it shows |
|---|---|---|
| 33 | `Connect dock to sorter` / — | a covered step: no price, so no tail, still two lines tall |
| 40 | `Build Furnace` / `10 scrap + 5 ferrous · waits 10 scrap · have 6` | short on the first item, no batch in flight → no digit (limitation 7) |
| 48 | `Build Furnace` / `10 scrap + 5 ferrous · waits 5 ferrous · have 0 · in 4s` | scrap landed, now short on the second item, and the yard's next delivery is 4 s out |
| 178 | `Build Plate press` / `35 scrap + 8 ferrous · waits 35 scrap · have 13 · in 4s` | all three parts on one line, 46 px face |

`in Ns` is `Math.ceil((batch.milli - batch.progress) / 10)` of the nearest running batch (1-indexed order,
the same scan `batchProgressLine` makes), printed with the existing `value.dotSeparator`; it is what makes
the label change on **almost every tap** (98–99 of the 178 candidate taps carry a moving digit) and it is the
whole reason rows 2 and 3 now pass. No new string-table keys, no new panel, no fourth dock face, no engine,
price or save change (schema `1`, fixture `eede3c4f` untouched).

## 9. The acceptance rows (g2, `policy-census.json`)

Bucket precedence is unchanged, and the three kinds are named and printed on one denominator:
`refused-shortfall` (a `Need N · have k` toast), `inert-label` (no toast, pressed face's own text identical
to the previous tap), `unknown`.

| row | criterion | base | candidate | verdict |
|---|---|---|---|---|
| 1 | three named buckets on one denominator, summing to the total no-ops | 63 + 69 + 10 = **142** = `noopTaps` (178 taps, both policies) | 14 + 69 + 59 = **142** = `noopTaps` (178 taps), 7.9 % + 38.8 % + 33.1 % of taps | **pass** |
| 2 | `inert-label` ≤ 20.0 % of `taps` | 63/178 = **35.4 %** (both policies) | 14/178 = **7.9 %** — identical in both policies | **pass** |
| 3 | longest identical-label stall ≤ 16 | **34** (35 taps, taps 34–68, 17 refusals, 0 commands) | **4** (5 taps, taps 8–12), **5/5** stall taps carry the tail | **pass** |
| 4 | applied ≥ 37 · machines ≥ 5 · batches ≥ 51 · credits ≥ 8 | 37 · 5 · 47 · 8 | 37 · 5 · **47** · 8 | **partial** — batches 47, see limitation 5 |

Two honesty notes on rows 2 and 3, both printed in the json next to the passing numbers:

- The 7.9 % is a *string* result, and the mechanism is the countdown digit. Cut the tail and recount over the
  base's own strings (`bucketsSuffixIndependent`) and the candidate reproduces the base exactly:
  63 / 69 / 10, inert **35.4 %**, stall **34**. `distinctPrimaryLabels` **102** in both policies vs
  `distinctPrimaryLabelsWithoutSuffix` **14** says the same thing: more distinct strings, not more distinct
  outcomes. `stallByPressedIndex` is **36** taps on both artifacts — the engine still waits the same ~33 s.
- `unknown` 59 is itself partitioned in `buckets.unknownSplit`: **49** taps differ only in the pending tail,
  of which **39** (blind) / **38** (v2) differ only in the countdown digit; **0** non-shortfall toasts;
  **10** rest. No double count: 49 + 10 = 59, and the digit-only taps are a subset of the 49.

Per-tap coverage (same runs): the tail is on the pressed face for **135** of the 178 candidate taps in both
policies; the countdown digit for **98** (blind) / **99** (v2). Aggregate no-op share barely moves —
**142/178 = 79.8 %** on both artifacts — which is the 1 tap/s instrument, not the face.

## 10. Witnesses and bytes (g2)

| witness | candidate | limit |
|---|---|---|
| entry chunk | `index-BjqNquCb.js` **233145 B** (main alone on this head 232792 B) | < 233000 B → **145 B over**, see the ceiling call below |
| typecheck / validate / vitest / `node --test` / build | 0 / 0 / 0 (32 files, 325 tests) / 0 (59/59) / 0 | all 0 |
| `validate` behaviour line | `firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3 \| 0 violation(s)` | identical on base and candidate: the sim did not move |
| tap targets, 16 cells (`layout-witness.json`) | **44 px** in the six tail-carrying/short cells, 46 px at text scale 1, 46.5 px (360x640) and 50.2 px (390x844, and the fork row which shares its height) at text scale 2 | ≥ 44 px pass |
| dock rows / page scroll / pageerror | 1 row everywhere; `scrollHeight == innerHeight` in all 16 cells (360x640 and 390x844, text scale 1 and 2, `isMobile` on and off); 0 | pass |
| card fill at text scale 2.0 | 32.8 % (360x640), 20.8 % (390x844), 24.8 % (fork row) | ≤ 42 % pass |
| save | `schemaVersion 1`, fixture `eede3c4f` byte-identical (no `tests/`, no `src/game/persistence/` file in this lane) | pass |

Byte arithmetic for the **+353 B** this lane adds over main, so the next lane can price the same move
(`checks.txt` carries every row; each number is its own clean `npm run build` on this machine): main's two ui
files alone **232792 B**; this lane's shipped three-part face at `9d8ff3d` **233418 B**; after trim 1 (the
three repeated `t("value.dotSeparator")` calls share one `DOT` const) **233208 B**; after trim 2 (the dock's
class fragments hoisted into shared consts, rendered `class` attribute identical) **233145 B**. Inside the
lane the countdown digit is worth 113 B (233418 → 233305 at `9d8ff3d`) and the tail without it measures
233201 B; the tail lives in the *same* `dock__cost` span as the price, which is what saved 285 B against the
g1 three-span form (233278 B → 232993 B at the previous merge).

**Ceiling call for the reviewer / product owner (all measured):** main's own build on this merge is
232792 B (208 B of headroom — ART-004's atlas recovery is already inside that column), and **no** form of the
pending tail fits under the pinned 233000 B on top of it: 233145 B shipped, 233201 B with the digit dropped,
232792 B only if the tail goes altogether. So the choice is (a) move the ceiling to 233500 B, (b) land the E3
chunk-split first (STATUS.md: cue/variant/part tables out of the main chunk), or (c) drop the tail and let
W-3 rows 2 and 3 revert to the g1 readings (29 % / stall 9). The digit is the cheap half of the feature and
the only element that changes on 98–99 of the 178 taps.

**Measured layout price of the third part (16-cell witness, this head):** faces sit at 46 px in the plain
cells; with the tail they are **46.5 px** at 360x640 text scale 2 and **50.2 px** at 390x844 text scale 2
(and in the fork row, which shares the row height), while **text scale 1 stays at 46 px** — the tail fits the
existing line there. In the seeded short-price cells, where the tail is definitely printed, the face is
**44 px** on both artifacts, i.e. exactly on the floor. Card fill peaks at 32.8 % (cap 42 %), dock stays one
row and `scrollHeight == innerHeight` in all 16 cells, so the world loses about 4 px of column at text
scale 2 and nothing at text scale 1. The ART lane's `space.json` should be re-printed by whoever holds that
lease after integration.

## 11. Limitations (g2)

4. The g1 limitations 1–4 all still apply (±1 tap / ±4 batches wall-clock drift; `inert-label` is a string
   counter; face `have` and the status tail can differ by one delivery; the fork faces still keep two lines).
5. **batches 47 vs the 51 floor is an instrument-baseline artefact, not a regression.** On this tree the
   deterministic `validate` total is 1838 batches where g1 measured 1902 at `1573ac1` (BELT-001 moved the
   belt), and the same protocol banks 47 in-window on **both** artifacts with the identical behaviour line,
   identical applied/machines/credits. There is no in-run difference to fix; the floor needs a tick-locked
   baseline before it can be asserted again.
6. The countdown digit is the *nearest* running batch in 1-indexed order, not the batch that carries the
   pressed face's own item. When several batches run, `in Ns` answers "when does something land next", which
   is the question the stall asks; a per-item arrival time would need a second scan and ~120 B this budget
   does not have.
7. `in Ns` is only printed while a batch runs, so a tap in the gap between a completion and the next
   assignment prints the two-part form; that is 79–80 of the 178 taps (178 − 99 and 178 − 98), which is why
   the inert share lands at 7.9 % and not near 0.

## 12. Files added by g2

`frame-probe.mjs` (+ `frame-probe.log`) — one frame printed from the engine plus both derivations of the
painted face string, so the shipped `priceLine` output can be checked line by line (`waits 25 scrap · have 6 ·
in 1s`); `face-line-check.mjs` re-run, the two derivations still agree on all 8 frames; `checks.txt` carries
the gate exit codes and the byte table above. Rollback is unchanged: revert `src/ui/text.ts` and
`src/ui/Hud.tsx` to `1573ac1`; saves interoperate between both artifacts.

## 13. g3 — the same two files re-measured on the integrated tree (2026-11-08)

- **Tree:** `5e5e35b4c20370777ee2fafb94af61d4795a8fc7` = `merge(96a5428, origin/main 5610528)`, so this lane
  now sits on top of ART-004 (`49d170b`, whose build already carries the 520 B atlas/table recovery and
  prints 232792 B) and UI-004 (`5610528`). Zero conflicted paths; `src/ui/text.ts` and `src/ui/Hud.tsx` are
  byte-identical to `96a5428`, so the shipped face is exactly the artifact the g2 census measured.
- **Gates on this merged tree, one clean run each:** typecheck exit 0; `npm test` **32 files / 325 tests**
  passed (main gained two files, this lane adds none); the script suite 59/59; validate exit 0 with the
  behaviour line still `firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4
  batches=1838 credits=157 nodes=3 | 0 violation(s)`; build exit 0; `face-line-check.mjs` 8/8 frames agree;
  `frame-probe.mjs` prints `waits 25 scrap · have 6 · in 1s` for the short frame.
- **Entry chunk on this merged tree: `assets/index-DIzqhO3V.js` 233418 B** against the pinned 233000 B
  ceiling → **over by 418 B**. The lane's own price is still the measured +628 B (232365 → 232993 at
  `4edb4f8`); main 5610528 leaves 233418 − 628 = 232790 B, i.e. 210 B of headroom, so the overage is
  sum-of-lanes arithmetic against a nearly exhausted ceiling — the call already written in section 10 —
  and not a second regression inside this lane. Trims available if the product owner keeps the ceiling:
  drop `in Ns` (−113 B, measured 233305 B, but rows 2 and 3 fall back to the g1 shape 29 %/stall 9).
- **Witnesses unchanged** (committed `layout-witness.json` / `policy-census.json`, 16 cells + 4 census runs):
  smallest face **44 px** (≥ 44), no page scroll in 16/16 cells, **0 pageerror**, nothing clipped, 1 dock
  row, card fill max 32.8 % (≤ 42 %); census candidate row on both policies: 178 taps, 142 no-ops =
  **69 refused-shortfall + 14 inert-label + 59 unknown**, inert-label **14/178 = 7.9 %** (≤ 20.0 %), longest
  identical-label stall **4** (≤ 16), applied **37**, machines **5**, credits **8**.
- **Two numbers do not meet the Issue #18 acceptance rows on this tree**, so the PR stays draft:
  `batches 47` against the ≥ 51 floor (limitation 5: the deterministic total itself moved 1902 → 1838 with
  BELT-001 and base and candidate bank the identical 47 in-window) and `entry 233418 B` against 233000 B
  (a ceiling decision, with the trim options priced above).
