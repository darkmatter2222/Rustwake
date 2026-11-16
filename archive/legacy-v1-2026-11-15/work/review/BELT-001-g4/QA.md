# QA-BELT-001-g4 - cost-only candidate `fb0dca0` + the 3-way merge for `REL-010`

- Reviewer: QA role, session `ses_e4a0c2a97ffeN6wxhwbl3qSrl0`, 2026-11-07. Deltas only - my g3 rows for `8102ac4` (`work/review/BELT-001-g2/QA.md`) stay valid and are not repeated.
- Certified object: `fb0dca0f3acd81e1cd13eb5f4b89b1577baa4b4d` (`git cat-file -t` -> `commit`; `git ls-remote origin` -> `refs/heads/rw/belt001-g2`). `fb0dca0` = `5d5238b` (code) + docs-only: `git diff --stat 5d5238b fb0dca0` = `work/development/BELT-001-g2/HANDOFF.md | 129 +`, nothing else.
- My own worktrees (not the dev lanes): `C:/Users/ryans/AppData/Local/Temp/opencode/rev-belt001-g4` @ `fb0dca0` (install: **real `npm ci`, exit 0**, not a copied `node_modules`), `.../rev-belt001-g4-merged` @ my merge `2daa24c` (node_modules as a junction to the candidate install - `package.json`/`package-lock.json` are the **same blob** in all three trees: `2c18800d...` / `60394cab...`), `.../rev-belt001-g4-main` @ `a551794` (control).
- My own instruments: `qa-own-g4.mjs` (own Manhattan walk, own `round(price x 0.9)`), `qa-panel-g4.mjs`, `qa-dismantle-g4.mjs`, `qa-geom-g4.mjs` (own Chromium at 390 x 844, dsf 2).
- Toolchain: node 22.18.0, npm 10.9.3, vitest 2.1.8, Windows.

## Headline for the player

The cost-only connection is what ships and it behaves exactly as claimed: a link costs 1 scrap per tile it crosses and hands back 90 % when dropped - I recomputed the ladder myself (3 / 6 / 7 tiles -> 3 / 6 / 7 paid -> 3 / 5 / 6 back) and a link from an old save returns 0. The clock did not move: every fresh link still waits 5 ticks, so batch timing is unchanged for an old yard - the mature fixture replays to the same 1 902 batches and 82 credits. All four gates are green on the SHA that is on the remote, with 86 B of headroom. The three-way merge with UI-002 g3 is one line away from green: the same `i18n` substring collision as last generation, and the fix makes all 309 tests pass.

## Verdict

**RECOMMEND** - no technical veto on `fb0dca0f3acd81e1cd13eb5f4b89b1577baa4b4d`. Every Part A row is green or restated with my own numbers. For `REL-010`: **the one-line `i18n` fix is required**, not optional - without it the merged tree is red (1 failed / 309). Conflicts: none in either merge step.

## Part A - the cost-only candidate (my runs at `fb0dca0`)

| # | Row | Verdict | My measurement |
|---|---|---|---|
| 1a | `npm run typecheck` | **PASS** | exit **0**, 0 diagnostics |
| 1b | `npx vitest run` | **PASS** | exit **0**; `Test Files 28 passed (28)`, `Tests 301 passed (301)`, **0 failed**. `tests/simulation/belt.test.ts` executes **18 cases** (15 in g3), all green |
| 1c | `npm run validate` | **PASS** | exit **0**. `tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes`; `content: 0 violation(s) in 3 ms`; **behaviour line**: `firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3 \| 0 violation(s)` |
| 1d | `npm run build` | **PASS** | exit **0**; entry `dist/assets/index-DIxzqgyG.js` = **232 914 B** vs 233 000 -> **86 B spare** (lane's figure reproduced exactly). Others: `index-9FriNULu.css` 7 474 B, `tables-BB2NPvQ2.js` 9 298 B, `catchup.worker-G_Jyr7uh.js` 13 406 B |
| 2 | Accepted variant + my own ladder | **PASS** | Committed tree: `src/game/simulation/commands.ts:415` -> `latency: TUNING.routeLatencyTicks`; `src/game/content/defs.ts:362` -> `routeLatencyTicks: 5` (`beltCostPerTile: 1`, `beltLatencyPerTile: 2`, `dismantleRefundPct: 90`). `beltLatencyPerTile` appears **only in a comment** -> the per-tile clock really is deferred. `tests/simulation/belt.test.ts` asserts `latency).toBe(5)` **and** `latency).toBe(TUNING.routeLatencyTicks)`, plus the deferred reading `beltLatencyPerTile x run.length -> 6 / 18` |
| 3 | Save parity + harness cleanliness | **PASS** (file: OPS-107 row) | below |
| 4 | Probe determinism | **PASS** | below |

### My own ladder (row 2), `qa-own-g4.mjs` with the source's own geometry constants

Independent walk written by me (row-first then column, `YARD_COLS = 6`, `DOCK_TILE = 2`), price as `1 x tiles`, refund as `Math.round(price x 90 / 100)`. Paid and refunded amounts are read off `state.store["scrap"]`, not from a helper.

| tile | distance | engine `run` | my walk | `run.length` | charged | my price | refunded | my refund | `latency` |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 2 | `2,3,4` | identical | 3 | **3** | 3 | **3** | 3 | 5 |
| 27 | 5 | `2,8,14,20,26,27` | identical | 6 | **6** | 6 | **5** | 5 | 5 |
| 31 | 6 | `2,8,14,20,26,32,31` | identical | 7 | **7** | 7 | **6** | 6 | 5 |

So distance 2/5/6 -> run/price **3/6/7** and refund `round(price x 0.9)` = **3/5/6** (5.4 -> 5, 6.3 -> 6), exactly as the ticket states; my walk is byte-equal to the engine's `run` in all three. `latency` is the constant 5 on all three: the extent is a price difference, not yet a timing one. Extra confirmations: a `run`-less route (I deleted `run` after connect) returns **0** and keeps its stored `latency` 5; refusal at purse `price - 1` gives `{ok:false, reason:"insufficient", need:3|6|7, have:2|5|6, word:"scrap"}` with `JSON.stringify(state)` **byte-identical** and `routes.length` unmoved.

### Save parity (row 3)

`docs/evidence/yard-mature.json`: `checksum` field **`eede3c4f`** = my own recomputed FNV-1a over `JSON.stringify(payload)` -> **`eede3c4f`**; `schemaVersion` **1**; `decodeSave -> {ok:true}`; `validateSim -> null`; re-encode **26 114 B -> 26 114 B byte-identical**; **18 routes, 0 carrying `run`**, one distinct latency `[5]`; at decode tick **18298**: batches **1902**, credits **82**, scrap 18 - the pinned figures exactly. Forward replay of that old-format save (+1 800 ticks): tick 20 098, batches 2 158, credits 82. So the price changes a fresh yard's purse, not an old save's record.

`work/feedback/belt001-harness.json` after a test run: **not clean** - `git status --porcelain` = ` M work/feedback/belt001-harness.json`, while `git hash-object` of the regenerated file = **`36c7909aa3cc1636b1b54d68bb2ad310fedfeeb5`** = the committed blob (11 052 B) and `git diff` is empty. `fb0dca0` has **no `.gitattributes`** and `core.autocrlf=true` -> exactly **OPS-107's `.gitattributes` row** (`*.json text eol=lf`); no content damage.

### Probe determinism (row 4)

`npx tsx scripts/probe-belt.mjs`, twice, same tree: stdout identical both times - `probe-belt checksum 7fe91647` and `wrote work/feedback/belt001-harness.json (11052 B)`, exit **0** both. SHA-256 of the joined stdout, both runs: **`8EE8CFF80E50CDCF12A9636925C72AAA927E98459569F2F7B549156171526F5C`** -> deterministic. (The harness checksum moved `52a20c95 -> 7fe91647` because the cost-only variant changes the printed rows; the regenerated file equals the committed blob.)

## Part B - the 3-way merge (`REL-010` integration gate)

Exact merge SHAs and parent order (both `--no-ff`, my own merges, no rebase):

1. `af6b156b018764e80f152a3efc0512274a26fdf0` = merge(`a5517948046f1327cb92cf35a9a02be53345f72f` **main**, 1st parent; `bab14dbd98f58002c87a63e9b6d217caedc76c3b` **rw/ui002-g1**, 2nd parent) - exit 0.
2. `2daa24cbbeb826a61334a7694fe4911d7f77b2c8` = merge(`af6b156...`, `fb0dca0f3acd81e1cd13eb5f4b89b1577baa4b4d` **belt tip**) - exit 0. Merged tree **`5e75e2e91a58bb74deb4bf87da78f4e4b70dcb94`**.

**Zero conflicted paths** in either step, so no stage-blob table is needed this generation.

| # | Row | Verdict | My measurement |
|---|---|---|---|
| 5 | `npx vitest run` before any fix | **REPRODUCES** | exit **1** - `Test Files 1 failed \| 29 passed (30)`, `Tests 1 failed \| 308 passed (309)`. The failure is `tests/ui/i18n.test.tsx > string table (B-10) > phrases every panel from the table`, `expect(machineText).not.toContain("1 units")` at **`tests/ui/i18n.test.tsx:301`**. **Yes, it still reproduces against `bab14db`**: that file's blob `3e27c8fae242281a9cf1506986b09cf90ed4dafc` is identical in `main`, `bab14db` and the merge, so UI-002 g3 did not touch it |
| 6 | The proposed fix | **REQUIRED, and sufficient** | Applied **only in the merge worktree**: line 301 -> `expect(machineText).not.toMatch(/(^\|[^0-9])1 units\b/);` (`git diff --numstat` = `1 1`). Result: exit **0**, `Test Files 30 passed (30)`, `Tests 309 passed (309)`, **0 failed**. **No other test is affected** - the total is 309 before and after (309 = 301 from the belt tree + 8 net from UI-002 g3). `npm run typecheck` on the fixed merge: exit **0**. Regex semantics checked standalone: `21 units` / `11 units` / `Power 1 unit` -> no match; `1 units` and `Store 1 units left` -> match. A strict improvement, not a suppression |
| 7 | Merged `build` + `validate` | **PASS** | `npm run build` exit **0**, entry **`dist/assets/index-BFr2GU0i.js` = 232 364 B** <= 233 000 -> **636 B spare** (my g3 figure was 232 353 with the older UI tip; re-measured as instructed). CSS is now `index-DbNBovuF.css` **8 091 B** (was 7 849), tables 9 298 B, catchup worker 13 406 B. `npm run validate` exit **0**, behaviour line `379 / 527 / 18298 / 8 / 18 / 4 / 1838 / 157 nodes=3` |

**Does the merged behaviour line still match the integrated base `268/478/5/1902/82 nodes=3`?** No - and I confirmed the base reading myself: my `a551794` control prints `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3`. With the belt in, five quantities move (`firstDrone 268 -> 379`, `firstResearch 478 -> 527`, `drones 5 -> 4`, `batches 1902 -> 1838`, `credits 82 -> 157`) while `tick 18298`, `machines 8`, `links 18`, `nodes=3`, `0 violation(s)` and the fixture checksum are unmoved. Same reading as g3: the pinned line is the **pre-change base** line, not this candidate's, and the old-save replay (`1902 / 82`) is the parity proof. Against my g3 candidate the numbers moved again (`314/498/4/1932/93 -> 379/527/4/1838/157`) because dropping the per-tile latency changes batch timing - expected for this variant, not drift.

### Why the merged failure happens (measured, so the fix is not a guess)

Same state, two trees, my own script:

| tree | `trayUnits` | `inBufUnits` | panel figure `buildCost 20 + tray + inBuf` | face text | engine's actual return |
|---|---|---|---|---|---|
| `a551794` (main) | 0 | 3 | 23 | `Dismantle · +23 units` | 25 |
| `2daa24c` (merged) | 0 | 1 | 21 | `Dismantle · +21 units` | 23 |

`"23 units"` has no `"1 units"` substring, `"21 units"` does. The pluralisation is correct in both (`unit()` -> `plural()`), so the red is an assertion artifact of the combination, not a defect in either lane. The 2-unit gap between the printed face and what the same tap returns exists **identically on both trees** (23 -> 25 on main, 21 -> 23 merged), i.e. it is pre-existing bookkeeping, not a belt regression: `Panels.tsx:106` sums `buildCost.qty + tray + inBuf`, while `commands.ts:339-342` returns `tray + inBuf + sum refundOf(buildCost) + sum beltRefund`.

## What I looked at with my own eyes (phone size, the merged build)

My own captures from `npm run preview` (my port 4211; 4183 and 4197 were already held by other lanes) of the **fixed merge** build, 390 x 844 CSS, dsf 2, **organic** session (no seeded state), 2 machines / 4 routes: `qa-g4-phone-rest.png` (64 725 B), `qa-g4-phone-machine.png` (154 822 B), `qa-g4-phone-machine2.png` (154 882 B), all in `.../rev-belt001-g4-merged/`. The model change is visible in the live DOM: `{"tick":760,"machines":2,"routes":4,"runsPresent":4,"latencies":[5]}` - every fresh link carries a `run` and the constant clock. Non-blank, no page error, `ERRORS []`.

Three most harmful visible defects in this merged build, with numbers:

1. **Three of six machine-panel faces sit under the fold.** At 390 x 844: panel `top 442 / bottom 790 / height 348`; `Close` 453-497 visible; row 1 `Connect` + `Upgrade · 30 credits` at 754-798 (bottom **8 px below the panel's own 790 edge**, so it is cropped by the card); `Move · cell 0 · 0 credits` + **`Dismantle · +24 units`** at 806-850 and `Recipe` at 858-902 are **outside** the panel box; the only scroller is `.panel__body` (`scrollHeight 397` vs `clientHeight 272`, `overflow-y: auto`). So the refund figure the belt just made dynamic is invisible without an inner scroll, and the visible action row is 8 px short. Fix (UI-002's file): lift the action row out of `.panel__body` or trim two measured rows (`Measured`, `Next step` are the tallest); the arithmetic says about 125 px must come back.
2. **The priced extent is still not drawn and still not printed.** `src/game/renderer/scene.ts` has **no** `.run` reference (`git grep` at this tree): each route is one `moveTo -> lineTo` chord between endpoint centres with the cargo dot interpolated linearly on that chord, so a 7-tile link and a 3-tile link render as the same chord and the tile count appears nowhere on screen - after a tap the only feedback is the `Scrap` chip. In my session the machine panel's `Next link scrap sorter to dock carries Nonferrous` row carries no `N tiles · N scrap`. The model is ready; this is renderer plus one panel row.
3. **Chip typography is still uneven**: `Scrap 18`, `Nonferrous 6`, `Credits 0` carry a space before the value, `Store24/900` does not - the same one-character mismatch as g3, on the most-looked-at row. Also visible: the yard is painted between the objective block (bottom 128) and the dock row (top 790), leaving a wide unused band of canvas above the dock at this camera fit.

## Three most valuable follow-ups

1. **Land the merge with the one-line `i18n` fix and re-measure the entry once** (integration, about a minute): `tests/ui/i18n.test.tsx:301` -> `not.toMatch(/(^|[^0-9])1 units\b/)`; my green numbers are `exit 0 / 30 files / 309 tests`, entry `index-BFr2GU0i.js` **232 364 B** (636 B spare). Reproduction: `git merge --no-ff bab14db` on `a551794`, then `git merge --no-ff fb0dca0`, junction the candidate's `node_modules`, `npx vitest run`. Also pin the new refund reading explicitly (`toContain("Dismantle · +21 units")`) so the 90 % ladder is asserted on-screen, and keep exactly one role (release engineer) owning the byte ceiling after each further lane lands.
2. **Close the visible loop on the priced link** (renderer plus one panel row): walk `route.run` as a polyline in `scene.ts` (today one `moveTo/lineTo` chord with the dot interpolated on it), move the cargo dot by cumulative run length, print `N tiles · N scrap` beside the fresh connection and a `Link N tiles · N scrap` row where `link 13 % busy` already lives. Then one device-side clip at 390 x 844, because the headless bench cannot show whether the elbow reads as a price.
3. **Fix the panel fold and the two bookkeeping items**: (a) the 8 px crop plus three faces below the fold in the machine panel (measured above, UI-002's file), (b) the `Store24/900` spacing, (c) OPS-107 - add `.gitattributes` with `*.json text eol=lf` so `npm test` stops leaving `work/feedback/belt001-harness.json` as ` M` (content identical, `git diff` empty, `core.autocrlf=true`). Restate the bench from an interleaved pair at this SHA; my g3 medians (committed bench 42.86 vs 41.45 ms = +3.4 %) still stand and the unreproduced `17.619 %` should be dropped.

## Unverified dimensions

- Audio: untouched by this lane; not listened to (no audio artifact in this candidate).
- Real-handset frame timing: headless node only; the `g2` renderer change will need a device clip.
- Human comprehension of the priced connection (does a phone player understand why `Scrap` fell by 6?) - untested; only in-test literals cover the number's survival.
- My visual evidence for this generation is **phone-size only** (390 x 844). The repo's `scripts/capture.mjs` did not finish inside my budget (its organic session is about 15 minutes of real-time waits: 60 x 1 100 ms plus up to 1 000 x 900 ms), so my own instrument replaced it; the 1 440 x 900 desktop stage is not covered by this review.
- `work/feedback/belt001-harness.json`'s `layouts.patterns` ladder (B-2) is covered by the candidate's own in-process test, not re-derived independently by me.
- The published `rw/belt001-g2` receipt (02:55:16Z) and the UI lane's receipt (06:37:45Z) are taken as given; I verified the objects on `origin`, not the receipts themselves.