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
