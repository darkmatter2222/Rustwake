# STRAT-002 generation 2 — developer handoff (harness upgrade that makes the fork checkable)

Role: developer (pragmatic craftsperson). Task: STRAT-002 g2, criterion `A1-2v2` (`work/product/STRAT-002-decision-g2.md` 1.2 / 1.4). Base SHA `c2842e1c853a146f22afda5667e7410253f88ddf` (`origin/main`, already carries the g1 fork). Worktree `strat002-dev`, branch `strat002-g2`. Evidence type: automated gates (real exit codes), deterministic harness runs (numerical analysis), source inspection. No new playtest, no visual claim in this slice.

## 1. What changed (two files, no `src/` change)

- `work/feedback/strat002-harness.mjs` — A1-2v2 instrument. `rows[]` now carry the primary columns named by the decision plus the two new credit readings: `rows[].batches`, `rows[].powerLimitedRounds`, `rows[].minPowerRatio`, `rows[].rejects`, `rows[].taps`, `rows[].milestones.firstResearch`, `rows[].starvedMax`, `rows[].starvedMean` (promoted out of `stages[]`), `rows[].creditsEarned`, `rows[].creditsPer1000Batches`; the residual `rows[].credits` is still printed and is **not** in the scored set (R2). `leads` is recomputed **over named branches only** (`{speed, buffer, draw}`), with `leadsIncludingTwin` kept beside it so the twin's contribution is visible and clearly unscored. Per-branch verdicts (own-at-least-one-column-by-the-required-gap) and the R4 pick attribution are printed and stored.
- `work/feedback/strat002-harness.json` — regenerated: `{baseSha, method, criteria, primaryColumns, mechanismColumns, gaps, regular{...}, irregular{...}}`, each block holding `rows / stages / branchByLevel / leads / leadsIncludingTwin / attribution / verdicts`.
- `tests/simulation/fork.test.ts` — three new cases (below).
- Runner note: **the harness needs `npx tsx`** — plain `node work/feedback/strat002-harness.mjs` dies with `ERR_MODULE_NOT_FOUND` on the extensionless `src/**.ts` imports; `npx tsx work/feedback/strat002-harness.mjs` exits 0.

## 2. Table 1 — regular supply (g1 cadence: one command per round, 10 ticks apart, 1800 rounds)

| row (scored?) | batches | powerLimitedRounds | minPowerRatio | rejects | taps | firstResearch | starvedMax | starvedMean | creditsEarned | creditsPer1000Batches | credits (residual, unscored) | ≥2 affordable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| naive (unnamed) — twin, excluded | 2175 | 386 | 0.615 | 249 | 1983 | 386 | 80 | 51 | 13662 | 6281.379 | 49 | 121 |
| **speed** | 2175 | 386 | 0.615 | 249 | 1983 | 386 | 80 | 51 | 13662 | 6281.379 | 49 | 121 |
| **buffer** | 1158 | 234 | 0.727 | 625 | 2046 | 482 | 84 | 57 | 8767 | 7570.812 | 190 | 101 |
| **draw** | 1191 | **0** | **1.0** | 318 | 2045 | 479 | 85 | 58 | 9265 | 7779.177 | 49 | 107 |

Twin identity as printed: `{"twin":"naive (unnamed)","equalsSpeed":true,"differingScalarColumns":[],"kindsEqual":true,"levelsEqualIgnoringBranchAnnotation":true}`. Every g1 figure reproduced unchanged, so the "must hold or improve" numbers hold.

**Verdicts (regular):** speed **PASS** (`batches` sole lead, gap 984 ≥ 900 over the next best named row); draw **PASS** (`powerLimitedRounds` 0 vs 234/386, both ≥ 200; `minPowerRatio` gap 0.273 ≥ 0.25); buffer **FAIL** — it leads none of the ten primary columns (starvedMax 84 vs 79-rival 80, starvedMean 57 vs 51, creditsPer1000Batches 7570.812 vs 7779.177). This is the g1 negative result, now machine-checked. Census note the decision asked for: the ≥120 figure is the **speed** row's (121), which is the same plan as the unnamed twin.

## 3. Table 2 — irregular-supply ladder (the one bounded experiment from 1.4)

Pattern chosen, and why it is the smallest change: the wreck pulse is **gated** instead of firing freely — `manual.salvage` is issued only while `round % 9 < 5`, so 1800 rounds hold exactly 200 whole periods of 5 pulsed + 4 silent rounds (1000 pulsed rounds recorded as `rows[].pulses=1000`). During a pulse round the store gains `TUNING.manualSalvagePerPulse` = 5 scrap; during the 4 silent rounds the only inflow is the fleet's own delivery (5 units per `TUNING.droneDeliveryTicks` = 50 ticks per unit). One added line inside the existing round loop: same 1800 rounds, same `advance(state, 10)` per round, same `tick=18298` end, same boot, no engine or content change. It is the smallest change that can make the input buffer bite because the buffer ranks only buy something where the store's own pull is throttled: `pullNeed` in `engine.ts` tops a machine up to `perBatch * (PULL_LOOKAHEAD_BATCHES + bufferRanks) + bonus`, and `pullFromStore` draws only `store − TUNING.reserveFloor`, so in a gap the machine runs on what it already holds in hand. The measured gap is real: `scrapMin` 8 (speed) / 0 (buffer) / 1 (draw) against `scrapMax` 230, with 319–570 of 1800 rounds at or below the reserve floor.

| row (scored?) | batches | powerLimitedRounds | minPowerRatio | rejects | taps | firstResearch | starvedMax | starvedMean | creditsEarned | creditsPer1000Batches | credits (residual) | drones | ≥2 affordable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| naive (unnamed) — twin, excluded | 2286 | 480 | 0.615 | 173 | 2952 | 370 | 79 | 50 | 15569 | 6810.586 | 47 | 5 | 129 |
| **speed** | 2286 | 480 | 0.615 | 173 | 2952 | 370 | 79 | 50 | 15569 | 6810.586 | 47 | 5 | 129 |
| **buffer** | 1160 | 232 | 0.727 | 246 | 3007 | 480 | 84 | 57 | 14846 | **12798.276** | 334 | 4 | 125 |
| **draw** | 1191 | **0** | **1.0** | 232 | 3007 | 477 | 85 | 58 | 15216 | 12775.819 | 7 | 5 | 126 |

`leads` (named rows only): batches/rejects/taps/firstResearch/starvedMax/starvedMean/creditsEarned → `speed`; powerLimitedRounds/minPowerRatio → `draw`; creditsPer1000Batches → `buffer`.

**Verdicts (irregular):** speed **PASS** (batches 2286, gap 1095 ≥ 900); draw **PASS** (0 vs 232/480, ratio gap 0.273); buffer **PASS** — sole lead on `creditsPer1000Batches`, absolute gap **22.457** credits per 1000 batches over the nearest rival (`draw` 12775.819), relative 0.18 %. As printed:

```
buffer: leads=[creditsPer1000Batches] r1=pass gap={"own":12798.276,"rival":12775.819,"absolute":22.457,"relative":0.0018} -> owns creditsPer1000Batches [leads one mechanism-adjacent column by >= 5 % relative or >= 10 absolute] PASS
```

**Answer to the fork question: buffer survives as a third branch — yes — on `creditsPer1000Batches`, by 22.457 credits per 1000 batches (absolute clause; ≥ 10) over the next named row.** Honest qualification for the record: the two preferred starvation columns still do not lead under either pattern (84 / 57 against speed's 79 / 50), so the survival rests on the decision's fallback column, not on the buffer mechanism itself. The gap between buffer and draw is 0.18 % relative, i.e. it is carried by the "≥ 10 absolute" clause of A1-2v2 alone.

## 4. Assertions added (`tests/simulation/fork.test.ts`, new describe "STRAT-002/A1-2v2 the scored table and the pick counts")

- **"reports the unnamed row as the speed twin on every scored column (R3)"** — the ladder is re-run in-test for `null` and `speed` under both supply patterns; the rows are deep-equal on all scalar columns and all six `kinds` counters. The one field the twin cannot share is asserted explicitly and is by construction, not a drift: the unnamed machine records no branch list (`picksRecorded` 0) while `sum(level-1)` matches at 97. Non-vacuity is asserted against `buffer` and `draw`.
- **"separates upgrade attempts from purchased levels, so a criterion names its field (R4)"** — with credits 87 on one furnace the prices are 40 / 47 / 55, so 4 taps buy 2 levels: `kinds.upgrade`-style attempt count 4 ≠ purchased levels 2 = `branch.length` = `upgradeRanks().buffer`, and attempts − rejects = purchased. At ladder scale the same split is asserted for `buffer` irregular: 118 attempts vs 100 purchased levels.
- **"keeps buffer on one mechanism-adjacent column under irregular supply, and only one"** — pins the surviving verdict in CI: `creditsPer1000Batches` gap ≥ 10, `starvedMax`/`starvedMean` still behind speed (the negative result), draw's `powerLimitedRounds` = 0, speed's batches gap ≥ 900.

## 5. Gates (this candidate, real exit codes as printed)

| gate | command | exit | result |
|---|---|---|---|
| typecheck | `npm run typecheck` | **0** | clean |
| tests | `npm test` | **0** | **262 tests, 26 files** (base 259/26 + the 3 cases named above) |
| content + behaviour | `npm run validate` | **0** | `behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)` — byte-identical to base; `content: 0 violation(s)` |
| build | `npm run build` | **0** | entry `dist/assets/index-Br0Eyz3s.js` = **230,583 B** |

Entry asset check: `index-Br0Eyz3s.js` 230,583 B, SHA256 `50DB27A20679B84F4A7A913A5058090EAE1144E034A8C2990AF2DED07EB17CEE`, identical between the build taken before my edits and the rebuild after them, and the content-hash filename matches the base build's, so the entry is **byte-identical to the base build** (the harness files are not bundled: `creditsPer1000Batches` and `starvedMax` appear 0 times in the entry chunk). `tables-BB2NPvQ2.js` 9298 B, `index-DpiCrzhv.css` 7403 B, `catchup.worker-G_Jyr7uh.js` 13406 B, unchanged. 230,583 B stays under the 233,000 B ceiling with 2,417 B spare.

## 6. Determinism (byte-identity checks)

Two consecutive `npx tsx work/feedback/strat002-harness.mjs` runs, both exit 0:

- stdout run 1 = run 2 = SHA256 `B27A41DC8ACD34B8F1D6D7A08F92D85CD2F16581CC1CE4420C7C5CADD3E437C1` → **byte-identical**;
- `work/feedback/strat002-harness.json` run 1 = run 2 = SHA256 `EF3C2442CCC8C1B9FF9AF8CE0DC10C396F33CE68BD40611750D777EB4D36F481` (124,353 B) → **byte-identical**.

No `Math.random`, no clock read in the harness; the only inputs are the shared boot prefix and the per-row branch name.

## 7. Save / rollback impact, limitations

- No `src/` file touched: `schemaVersion` stays `1`, the pre-fork save checksum stays `eede3c4f`, and the behaviour line is unchanged, so saves from `24daf0e`/`c2842e1` load unchanged and rollback of this slice is a plain file revert of two harness files plus one test file.
- Limitation 1: buffer's survival is on the fallback column; `starvedMax`/`starvedMean` are the same under both patterns (84 / 57), so the input-buffer mechanism is still not visible in the starvation counters. If the product owner wants the mechanism itself to carry the branch, the next measurement is a shorter gap (period 3–4) or a per-stage feed imbalance, not more rounds.
- Limitation 2: `creditsPer1000Batches` mixes two effects — the buffer plan's higher `machineInputDemand` floor leaves more material unsold per tranche, and it buys fewer levels for the same credit income. The column is a ratio, so both show up; the raw `creditsEarned` / `batches` pair is kept in `rows[]` for anyone who wants them separately.
- Limitation 3: the irregular ladder is one hand-shaped pattern (5-on/4-off, 200 periods), not a sweep; the pattern parameters are in `irregular.supply` so a re-run with a different period is a two-line change.
- Limitation 4: the A1-5/A1-6 numbers (persona run, chromium 360 × 640) are still the other lanes' and are not covered here.

Files changed for this candidate: `work/feedback/strat002-harness.mjs`, `work/feedback/strat002-harness.json`, `tests/simulation/fork.test.ts`, `work/development/handoffs/STRAT-002-g2.md`. Release-owned files (`work/backlog.json`, `work/BOARD.md`, `work/board.html`, `docs/screenshots/**`, `docs/evidence/2026-11-0*`) untouched.
