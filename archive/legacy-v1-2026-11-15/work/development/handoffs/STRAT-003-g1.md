# STRAT-003 g1 — the two live plans get their own prices (plus DEF-006 / DEF-002)

Role: developer. Candidate: branch `strat003-g1`, worktree `play001-dev`, base `7d7e05c7124722857ba9828cff5dbd49df5ab04f` (= RELEASE-003 g1, which already carries PLAY-002 g1 and the STRAT-002 g3 harness). Ticket: STRAT-003 g1 — the two fork faces that ship must not print one price. Evidence types: automated tests, deterministic harness, own automated chromium measurement (two passes, plus an A/B against the base build), source inspection. No new playtest, no human-enjoyment claim.

## Verdict (one line)

**The dock's two faces now carry two different numbers — `Faster batches · 40 credits` and `Less power · 30 credits` at the first rank of a base-30 ladder — the engine charges exactly the number the tapped face printed, the unnamed ladder still pays the plain price so every golden value is unmoved, and both defect notes from the g1 QA pass close: the `Last …` segment retires on the first accepted tap (DEF-006) and the tab stops fetching `/favicon.ico` (DEF-002).**

## 1. The price table, and what each price buys

Shared ladder unchanged: `upgradeCost(base, level) = ceil(base x 1.16^n)` (`src/game/simulation/commands.ts`). Per plan one integer premium, `BRANCH_PRICE_OFFSET`, derived from the rank's own first-step quantity, not fitted:

| plan | first quantity the rank moves | premium | sorter rank 1 (base 30) | furnace rank 1 (base 40) |
|---|---|---|---|---|
| `speed` | batch-clock denominator `progressDen` 10 → 11 = +1 of 10 = **+10 % throughput** | +10 | **40 credits** | **50 credits** |
| `draw` | power line: −1 of the 8 units of `TUNING.yardPowerCapacity` = the **baseline unit step** | +0, keeps the plain ladder as its reference price | **30 credits** | **40 credits** |
| `buffer` | off the dock since the A1-2v3 drop; still decodes from saves | +0 | 30 | 40 |

The two visible prices differ, and both stay inside `unnamed + 10` (speed exactly +10, draw exactly the plain price). `branchPrice(base, level, branch)` is the single source: `commands.ts` charges it in `upgradeMachine` when the command carries a branch, `src/ui/text.ts` `branchOptions` prints it per face. An unnamed `machine.upgrade` still pays `upgradeCost`, so the pre-fork ladder and every golden value derived from it cannot move — and did not (§4).

The objective card keeps the plain-ladder number (`describeStep` / `step.fork`, which equals the `draw` face here): zero new string keys, and the card's wrapped length is unchanged against the base build in the same measurement (§5, pass A A/B).

## 2. What changed

| path | change |
|---|---|
| `src/game/simulation/commands.ts` | `BRANCH_PRICE_OFFSET`, `branchPrice`, branch-aware charge in `upgradeMachine` |
| `src/ui/text.ts` | `branchOptions` prints a per-option `cost` from `branchPrice` (2 faces, 2 numbers) |
| `src/ui/App.tsx` | DEF-006: `setLastReject(null)` on an accepted command, inside the existing `dispatch` wrapper |
| `index.html` | DEF-002: inline `<link rel="icon" href="data:image/svg+xml,…">` (night `#0b1220` square, amber `#ffb765` core) |
| `work/feedback/strat002-harness.mjs` | price table printed per ladder, the new `priced` policy row (§6), `leadersTwoPlans` per ladder, `policyMix`, per-row pick attribution |
| `work/feedback/strat002-harness.json` | regenerated on this tree; sha256 `2758058327621F06C856BCCFBC9166CFE1D199D7C0CF13694BA1894164C58F17` on both writes |
| `tests/simulation/fork.test.ts` | 6 new cases, 1 restated (§3) |
| `tests/ui/fork-ui.test.tsx` / `app.test.tsx` / `resting-screen.test.tsx` | 1 new case each (§3) |
| `scripts/measure-strat003.mjs` | new: the four chromium cells, two passes (§5) |

No other `src/` file changed; `styles.css` is untouched, which is why the css chunk keeps its base hash (`index-mmTSZ7Fz.css`, 7,474 B in both builds).

## 3. The ticket's assertions, and where each one lives

| claim | case | reading |
|---|---|---|
| the two options carry different prices | `tests/ui/fork-ui.test.tsx` `shows two named outcomes at one price and commits on one tap` | `branchOptions → ["40 credits","30 credits"]`; faces `["Faster batches40 credits","Less power30 credits"]`; each `.dock__cost` its own |
| the sum of a chosen option equals the sim's charge | `tests/simulation/fork.test.ts` `charges exactly the price the tapped option printed, for both plans` | speed: printed 40, purse 40 → 0, `level 2`, `branch ["speed"]`; draw: printed 30, purse 40 → 10, `branch ["draw"]` |
| the same in the wired UI | `tests/ui/fork-ui.test.tsx` `refuses the dearer plan below its own price and states that shortfall` | purse 34: `Faster batches` → toast `Need 40 credits · have 34`, level stays 1; then `Less power` → `level 2`, purse 4 |
| `lastReject` clears on success | `tests/ui/resting-screen.test.tsx` `DEF-006 a successful tap retires the stale Last-shortfall segment` | segment `Last need 25 scrap · have 13` on screen, yard funded (60 scrap / 500 credits), acceptance tap: `revision` +1, `scrap 60 → 10` (the printed 25-scrap build price), and the same read shows the `Last …` segment gone; 900 further taps never resurrect that pair |
| pre-fork and three-branch saves still decode | `tests/simulation/fork.test.ts` `decodes a save whose machine names all three plans` (plus the unchanged pre-fork fixture case) | `branch: ["speed","buffer","draw"]` round-trips, `validateSim` null, re-encode byte-identical |
| the unnamed ladder stays plain beside the priced faces | `…/fork.test.ts` `keeps the unnamed ladder at the plain price beside the priced options`, `keeps the unnamed ladder exact and lets the price difference bite (R3 restated, STRAT-003)` | rank 1 plain 30 / speed 40 / draw 30, rank 2 35 / 45 / 35, rank 3 41 / 51 / 41 |
| the pair census still separates the plans | `…/fork.test.ts` `keeps the two live plans leading different columns under the pair census` | §6 table |
| the tab stops fetching `/favicon.ico` | `tests/ui/app.test.tsx` `DEF-002 index.html ships a real inline icon…` | `href^="data:image/svg+xml,"`, exactly 1 icon link, 0 occurrences of `favicon.ico` in `dist/index.html` |

Test inventory: **283 passed / 283 total, 27 files** (`npm test`, exit 0). Against the recorded baseline 275/27 that is +9 new cases and 1 restated (`reports the unnamed row as the speed twin on every scored column (R3)` → `keeps the unnamed ladder exact and lets the price difference bite`, because with two prices the unnamed row is no longer the speed twin by construction: `equalsSpeed: false`, differing columns printed).

## 4. Golden values and gates (real exit codes, this tree)

| gate | exit | reading |
|---|---|---|
| `npm run typecheck` | 0 | `tsc --noEmit`, no output |
| `npm test` | 0 | 283 passed / 283 (27 files), 4.56 s |
| `npm run validate` | 0 | `tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes`; `content: 0 violation(s) in 3 ms`; `behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)` — **verbatim the recorded line** |
| `npm run build` | 0 | `assets/index-Cmh4A1Sb.js` **231,878 B** vs base `index-Bi7lF9Yv.js` **231,706 B** = **+172 B**, ceiling 233,000 B (1,122 B headroom left); css 7,474 B and tables 9,298 B and worker 13,406 B identical to base |

Unmoved golden values: the behaviour line above (the unnamed ladder pays the plain price), `schemaVersion 1`, and the pre-fork fixture checksum `eede3c4f` (asserted by the unchanged `tests/persistence/save.test.ts` fixture case, still green; the ladder carries no branch keys). `dist/index.html` grows 778 B → 1,290 B (the inline icon).

## 5. Chromium, four cells, two passes

`npx tsx scripts/measure-strat003.mjs`, Chrome `C:\Program Files\Google\Chrome\Application\chrome.exe`, headless through `playwright-core`, every cell a fresh context with `deviceScaleFactor 2`, `isMobile`, `hasTouch`, served by `vite preview` on its own port. Frame: 2 machines, links settled, fork open, purse 34 credits (covers the 30 face, not the 40 face).

**Pass A — deterministic seeded frame** (the save is written by the engine in the same process, `encodeSave`, installed into `localStorage["rustwake.save.v1"]` before boot; `settings.textScale` per cell). Printed per cell: every dock face with its own price, each face box, `hudContentBox.height` = `document.querySelector(".hud").clientHeight`, the `.objective` box and its per-line boxes, the `.objective` bottom → `.dock` top gap, `documentElement.scroll*` against the visual viewport, page errors, `/favicon.ico` responses, the icon link.

| cell | hudContentBox | card px | card / hudContentBox | `.objective` bottom → `.dock` top | scroll vs viewport | faces (w×h) | smallest face | pageerror | `/favicon.ico` |
|---|---|---|---|---|---|---|---|---|---|
| 360×640 ts 1.0 | 640 | 107 | **16.7 %** | 169 → 586 = **417 px** | 360×640 = inner, no scroll | 176.8×46, 157.3×46 | **46 px** | 0 | 0 |
| 360×640 ts 2.0 | 640 | 274.4 | **42.9 %** | 385.3 → 586 = **200.7 px** | 360×640 = inner, no scroll | 182.7×46, 155.3×46 | **46 px** | 0 | 0 |
| 390×844 ts 1.0 | 844 | 89.2 | **10.6 %** | 151.2 → 790 = **638.8 px** | 390×844 = inner, no scroll | 191.8×46, 172.3×46 | **46 px** | 0 | 0 |
| 390×844 ts 2.0 | 844 | 274.4 | **32.5 %** | 385.3 → 790 = **404.7 px** | 390×844 = inner, no scroll | 197.7×46, 170.3×46 | **46 px** | 0 | 0 |

Face text in all four cells: `"Faster batches40 credits"` (`.dock__cost` = `40 credits`, min-height 46 px, font 13.2 px at ts 1.0 / 18.6 px at ts 2.0) and `"Less power30 credits"` (`.dock__cost` = `30 credits`); card primary line `Choose what improves on the Scrap sorter · 30 credits`; every `.status-line` box has `overflowX = overflowY = 0` (no clipped text). Frame line: `machines=2 [sorter#1:1@0, furnace#2:1@1] links=5 tick=899 credits=34 store={"scrap":9} plain=30 prices={"speed":"40 credits","draw":"30 credits"} step="upgrade"`.

**A/B against the base build (same script, same seed).** `npx vite build` of the pristine base tree (its entry is `index-Bi7lF9Yv.js`, 231,706 B, and its `dist/index.html` is exactly **778 B** — the same 778 B `text/html` the g1 QA recorded as the `/favicon.ico` fallback) served on its own port: card **107 / 274.4 / 89.2 / 274.4 px**, faces 176.8×46 / 157.3×46 etc., i.e. **every box identical to the candidate**, with both faces reading `30 credits` and `icon link: none`. So the price change moves no layout pixel, and the 360×640 ts 2.0 reading of 42.9 % is a pre-existing property of this frame, not something this slice introduced: the same number in both builds (the g1 QA's own open note calls it the pre-existing card length; its 41.3 % control was a different frame content, whose middle line carried an extra `Last …` tail).

**Pass B — the recorded control method** (`qa-p2-fork.mjs`: gate button, primary taps to 2 machines, `Text size` taps, then the first frame whose dock carries the fork; 250 ms cadence). All four cells: 2 faces, prices `40` / `30` credits, smallest face **46 px**, no page scroll, `pageerror` 0, `/favicon.ico` requests 0, `icon link` = the inline data URI (207 chars). The yard had reached 4 machines when the fork frame appeared (345-348 taps), the same depth g1's own fork capture reported; at that depth this frame measures **42.9 %** at 360×640 ts 2.0 against g1's recorded **46.9 %**, −4.0 pp, and the middle status line now reads `Drones 1 · Power 8 · 1 requested · 100 %` with no `· Last need 3 steel · have 2` tail: DEF-006 retires that pair on the next accepted tap, so the line wraps one box shorter.

Favicon, both states measured: before = the 778 B `text/html` fallback (the base `dist` ships only `assets/` + `index.html`, no icon file, so the tab's `/favicon.ico` is answered with the SPA document); after = one inline `data:image/svg+xml,…` link (207 chars) and **0** `/favicon.ico` requests in all 8 sessions (4 pass A + 4 pass B).

## 6. Harness — the price difference as an input, and the leaders

`npx tsx work/feedback/strat002-harness.mjs`, 1800 rounds per ladder, consecutive runs: stdout sha256 `F572B8B0F89A0514EDA87B41EF9C24792610D5E062D9886A3D9140002BBAB72E` on both runs (byte-identical stdout), JSON sha256 `2758058327621F06C856BCCFBC9166CFE1D199D7C0CF13694BA1894164C58F17` on both writes. Prices printed per ladder straight from `branchPrice`: `{"sorterL1":{"speed":40,"draw":30},"furnaceL1":{"speed":50,"draw":40}}`.

The `priced` row's purchase policy, stated in code (`policyPick`): **PRIMARY** = the resting power line the player sees — `powerRatio < 1` → `draw`, otherwise `speed`; **SECONDARY** fallback = the cheapest remaining plan the purse covers, by price, ties broken in dock order (`UPGRADE_BRANCHES`: `speed` before `draw`); if neither is affordable the preferred plan is attempted anyway, so the round counts like every other row. Cheapest-first alone is explicitly not the only tie-breaker.

| ladder | row | batches | powerLimited | minPower | starvedMax | starvedMean | inputStallPct | purchased levels | mix |
|---|---|---|---|---|---|---|---|---|---|
| irregular | speed | 2267 | 272 | 0.667 | 81 | 54 | 128.8 | 105 | 105 × speed |
| irregular | buffer | 1160 | 232 | 0.727 | 84 | 57 | 186.9 | 100 | 100 × buffer |
| irregular | draw | 1191 | 0 | 1.0 | 85 | 58 | 138.4 | 101 | 101 × draw |
| irregular | **priced** | **1465** | 0 | 1.0 | 84 | 57 | 160.9 | 101 | `{"draw":73,"speed":28}` |
| gap6 | speed | 2193 | 425 | 0.615 | 81 | 53 | 138 | 103 | 103 × speed |
| gap6 | buffer | 1176 | 127 | 0.727 | 84 | 58 | 181.5 | 98 | 98 × buffer |
| gap6 | draw | 1191 | 0 | 1.0 | 85 | 58 | 123.3 | 94 | 94 × draw |
| gap6 | **priced** | **1400** | 0 | 1.0 | 84 | 58 | 184.8 | 102 | `{"draw":77,"speed":25}` |

The `priced` row is a third trajectory, not a copy of either plan: 1465 / 1400 batches sits between `speed` (2267 / 2193) and `draw` (1191 / 1191), and both names appear in its mix. Pick attribution reconciles per row: `kinds.upgrade = sum(level-1) = branchByLevel.length` for every named and priced row (R4), and the mix sums to the row's purchased levels (73+28 = 101, 77+25 = 102). The unnamed twin keeps its old semantics (regular: 160 attempts against 97 levels) and reproduces the g3 rows exactly — irregular 2286 batches / 115.5 inputStallPct / 6810.586, gap6 2305 / 140.5 / 7377.874, the g3 tables verbatim — while `equalsSpeed: false` now lists the columns the premium moves.

Leaders under the per-column MMG, **the two live plans only** (`leadersTwoPlans`, gap against the other live plan):

| column | irregular | gap6 |
|---|---|---|
| inputStallPct | speed (128.8 vs 138.4, 9.6 ≥ 3) | draw (123.3 vs 138, 14.7 ≥ 3) |
| starvedMax | speed (81 vs 85, 4 ≥ 3) | speed (81 vs 85, 4 ≥ 3) |
| starvedMean | speed (54 vs 58, 4 ≥ 3) | speed (53 vs 58, 5 ≥ 3) |
| batches | speed (2267 vs 1191, **1076 ≥ 900**) | speed (2193 vs 1191, **1002 ≥ 900**) |
| powerLimitedRounds | draw (0 vs 272, 272 ≥ 200) | draw (0 vs 425, 425 ≥ 200) |
| minPowerRatio | draw (1.0 vs 0.667, 0.333 ≥ 0.25) | draw (1.0 vs 0.615, 0.385 ≥ 0.25) |
| creditsPer1000Batches | draw (12775.819 vs 7857.08) | draw (10735.516 vs 7884.633) |

Against the recorded g3 table: **the two headline leaders are unchanged** — `speed` owns `batches` on both scored ladders (1076 / 1002 where g3 had 1095 / 1114: the 10-credit premium trims 19 / 103 batches off the throughput plan and the 900-unit floor is still cleared), `draw` owns `powerLimitedRounds` + `minPowerRatio` on both, `inputStallPct` is speed on irregular and draw on gap6 exactly as recorded. The columns that got tighter are `starvedMax` / `starvedMean`: with `buffer` counted as a rival the lead is **exactly the 3-point floor** on irregular (84 − 81 and 57 − 54) and 3 / 5 on gap6, so they still name `speed` under the MMG, but with the least margin of any column.

Stated plainly, the gaps that do **not** clear their MMG (and so name no leader):

- non-scored `regular` table, `batches`: speed 1881 vs draw 1191 → **690 < 900**, no leader there (the same column names speed on both scored ladders);
- `gap6`, `powerLimitedRounds` over the best *named* rival: draw 0 vs buffer 127 → **127 < 200** → null (same reading as g3);
- `irregular`, `creditsPer1000Batches` under the named-rows census: `buffer` leads at 12798.276, only **22.457** above the best live plan → the 100-unit term is not met → null (same reading as g3);
- `regular`, `creditsPer1000Batches` under the named-rows census: draw 7779.177 vs buffer 7570.812 → 208.365 units clears the 100-unit term but **2.75 % < 3 %** fails the relative term → null; the two-live-plan reading of that column does name draw (7779.177 vs 4923.977).

The A1-2v3 `autoExec` question is re-answered with the same shape as g3 (`irregular: false`, `gap6: false`, `bothPatterns: false` → the drop stands: two plans).

## 7. Not proved / limits of this candidate

- No human playtest; every chromium number is this developer's own run of `scripts/measure-strat003.mjs`, one frame per cell, per-combo contexts (no session is shared). Audio not listened to; enjoyment and retention not inferred.
- `hudContentBox.height` is read as `.hud.clientHeight` (640 / 844), the same base the recorded percentages divide by. The 42 % cap is met in three of the four cells and exceeded by 0.9 pp at 360×640 ts 2.0 **in the base build too** (42.9 % both), so it stays the open pre-existing card-length note rather than a new regression; the fix would be a css-line-height change, deliberately not folded into this slice.
- The card ratio is frame-content sensitive: the seeded pass A frame and the tap-driven pass B frame are both reported, and the A/B against the base build is the regression statement (identical boxes).
- Pass B's frame is 4 machines deep when the fork first appears (as in g1's own capture), so its card (42.9 %) is not the 2-machine 41.3 % control; both are labelled with their machine count in the script's output.
- The 10-credit premium is a rank-1 derivation (`+1 of 10` on the clock denominator, `1 of 8` on the power line); the offsets stay constant at higher ranks — the ladder's own 1.16 growth carries the rest. No independent per-rank elasticity measurement.
- `policyMix` is one policy on one cadence (one command per round, 10 ticks apart); it is not claimed to be the best achievable mixing of the two plans.

## 8. Rollback / save impact

`schemaVersion` still 1. No field added to `SimState`: the price is computed at charge time (`branchPrice`) and `lastReject` remains component state, never serialized, so a save written by this build is byte-identical to the base build for the same tick and the same command list, and old saves load unchanged (the three-branch and pre-fork decode cases are green). The price is a *charge*, so a mid-session reload replays levels already bought from `machine.level`/`branch` and cannot re-price them. Rollback = revert the single commit: both faces return to one price, the `Last …` segment returns to replace-but-never-clear, the tab returns to the `/favicon.ico` fallback, and `scripts/measure-strat003.mjs` disappears with it. No migration, no persisted-shape change, no asset-name dependency beyond the normal entry/css hash reference in `dist/index.html`.

Receipts (scratch, outside the repo): `npx tsx scripts/measure-strat003.mjs` stdout for both passes on the candidate (port 8451) and on the base build (port 8452); harness stdout/JSON sha256 above.
