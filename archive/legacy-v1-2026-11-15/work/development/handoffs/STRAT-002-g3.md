# STRAT-002 g3 — the A1-2v3 harness run that decides `More input`

Role: developer. Candidate: branch `strat002-g3` in worktree `strat002-dev`, base `8a06e9debf7ff345681979cd6f731b24b2b5d581` (= `origin/main`, RELEASE-002 g2, which already carries the g2 harness and the g2 addendum). Binding criterion: `work/product/STRAT-002-decision-g2.md` → `## g2 addendum` (**A1-2v3**). Evidence types: automated harness (numerical analysis of deterministic simulation), automated tests, source inspection. No new playtest, no visual claim.

## Verdict (one line)

**No — `buffer` does not lead `inputStallPct` by >= 3 points under either gap ladder (irregular 5-on/4-off: 186.9 vs best rival 115.5, lead -71.4; gap6 3-on/3-off: 181.5 vs best rival 123.3, lead -58.2), so the drop executes and the fork ships two plans (`speed`, `draw`); negative result recorded, never re-scored.**

Plainly: not three plans. Two.

## What changed (harness-only slice)

| path | change |
|---|---|
| `work/feedback/strat002-harness.mjs` | new `rows[].inputStallTicks` / `rows[].inputStallPct`; OR-disjunction replaced by the per-column MMG (`gaps.mmg`), printed per pattern and named per column under MMG; second ladder `gap6`; `autoExec` block answers the addendum's question in the JSON |
| `work/feedback/strat002-harness.json` | regenerated from base `8a06e9d` (`baseSha` field), sha256 `a01ba70d6c91c0af792f0d8acffb5dbf4cc8228c736c86491d22781f65c81958`, byte-stable across runs |
| `tests/simulation/fork.test.ts` | mirror instrument extended to the three ladders with the stall counter; MMG read from the harness JSON `gaps` block and asserted; 4 new cases (below); the old OR-disjunction case rewritten to the MMG numbers |
| `work/development/handoffs/STRAT-002-g3.md` | this file |

No `src/` file changed: the entry asset is byte-identical (below).

## The column, as the addendum defines it

`rows[].inputStallTicks` = sum over machines of ticks in which that machine was not busy (engine `measure` saw `progress === 0`, so `busyTicks` did not increment that tick) while `store.scrap <= TUNING.reserveFloor` (10) — input demand, store could not supply. Counted per tick inside each round's 10 steps (`advance(state, 1)` x 10 is the same `stepTick` calls as `advance(state, 10)`, so every g2 column keeps its exact recorded values — verified: the `regular` and `irregular` rows differ from the committed JSON **only** by the two new fields per row). `rows[].inputStallPct = inputStallTicks / tick`, reported on the 0-100 points scale (x 100, one decimal), the same unit as `starvedMax`/`starvedMean`, so the addendum's "3 percentage points" is the integer `3` in `gaps.mmg`.

## The two supply ladders, 1800 rounds each, same boot

- (a) `irregular` — unchanged g2 predicate: `manual.salvage` fires only while `round % 9 < 5` (5 pulsed / 4 silent, 200 periods).
- (b) `gap6` — new period-6 predicate: `manual.salvage` fires only while **`round % 6 < 3`** (3 pulsed / 3 silent, 300 periods, 900 pulsed rounds x 5 scrap = 4500 pulsed scrap; the silent 3 rounds run on fleet deliveries alone).
- The `regular` g1 table is also printed, unchanged.

## Table — irregular (5-on/4-off, `round % 9 < 5`)

| named row | batches | taps | rejects | powerLimited | minPower | starvedMax | starvedMean | inputStallTicks | inputStallPct | creditsPer1000Batches | >=2 affordable |
|---|---|---|---|---|---|---|---|---|---|---|---|
| speed | 2286 | 2952 | 173 | 480 | 0.615 | 79 | 50 | 21138 | **115.5** | 6810.586 | 129 |
| buffer | 1160 | 3007 | 246 | 232 | 0.727 | 84 | 57 | 34190 | **186.9** | 12798.276 | 125 |
| draw | 1191 | 3007 | 232 | 0 | 1.0 | 85 | 58 | 25328 | **138.4** | 12775.819 | 126 |

Full printed row (speed): `tick=18298 machines=8 links=17 drones=5 batches=2286 credits=47 creditsEarned=15569 creditsPer1000Batches=6810.586 nodes=3 taps=2952 rejects=173 pulses=1000 powerLimited=480 minPower=0.615 starvedMax=79 starvedMean=50 inputStallTicks=21138 inputStallPct=115.5 scrapMin=8 scrapMax=230 atFloor=319 >=2affordable=129 legacyAmbiguous=4 firstDrone=60 firstResearch=370` — buffer and draw carry the same tick/machines/links shape with the values above; the unnamed twin equals speed on every scalar and kinds counter (`equalsSpeed: true`).

## Table — gap6 (3-on/3-off, `round % 6 < 3`)

| named row | batches | taps | rejects | powerLimited | minPower | starvedMax | starvedMean | inputStallTicks | inputStallPct | creditsPer1000Batches | >=2 affordable |
|---|---|---|---|---|---|---|---|---|---|---|---|
| speed | 2305 | 2846 | 165 | 514 | 0.615 | 79 | 51 | 25704 | **140.5** | 7377.874 | 131 |
| buffer | 1176 | 2916 | 250 | 127 | 0.727 | 84 | 58 | 33219 | **181.5** | 11994.048 | 126 |
| draw | 1191 | 2907 | 225 | 0 | 1.0 | 85 | 58 | 22569 | **123.3** | 10735.516 | 120 |

Full printed row (speed): `tick=18298 machines=8 links=17 drones=5 batches=2305 credits=45 creditsEarned=17006 creditsPer1000Batches=7377.874 nodes=3 taps=2846 rejects=165 pulses=900 powerLimited=514 minPower=0.615 starvedMax=79 starvedMean=51 inputStallTicks=25704 inputStallPct=140.5 scrapMin=6 scrapMax=230 atFloor=421 >=2affordable=131 legacyAmbiguous=4 firstDrone=60 firstResearch=364`.

## gaps block (printed per ladder; one declaration in the JSON)

```
gaps (A1-2v3 per-column MMG, one declaration read by fork.test.ts): {"inputStallPct":{"absolute":3},"starvedMax":{"absolute":3},"starvedMean":{"absolute":3},"batches":{"absolute":900},"powerLimitedRounds":{"absolute":200},"minPowerRatio":{"absolute":0.25},"creditsPer1000Batches":{"relative":0.03,"absolute":100}}
```

Rule: absolute in each column's own scale; `creditsPer1000Batches` needs 3 % relative AND >= 100 units; where the rival value is exactly 0 the absolute term applies alone. The retired form is stated verbatim in `gaps.criteria`.

Leaders under MMG, named rows only (sole best value whose gap clears the column's MMG):

| column | irregular | gap6 |
|---|---|---|
| inputStallPct | speed (115.5, gap 22.9) | draw (123.3, gap 17.2) |
| starvedMax | speed (79, gap 5) | speed (79, gap 5) |
| starvedMean | speed (50, gap 7) | speed (51, gap 7) |
| batches | speed (2286, gap 1095) | speed (2305, gap 1114) |
| powerLimitedRounds | draw (0, gap 232) | null (draw leads by 127 < 200 — buffer sits at 127) |
| minPowerRatio | draw (1.0, gap 0.273) | draw (1.0, gap 0.273) |
| creditsPer1000Batches | null (buffer leads by 22.457 < 100 units) | buffer (gap 1258.532 and 11.7 % — clears both terms; reported, cannot satisfy R1) |

## A1-2v3 verdicts printed per ladder

```
irregular: speed -> owns batches [>= 900] PASS (gap 1095) | buffer -> owns inputStallPct [>= 3 points] FAIL (gap -71.4) | draw -> owns powerLimitedRounds + minPowerRatio PASS (232 / 0.273)
gap6:      speed -> owns batches [>= 900] PASS (gap 1114) | buffer -> owns inputStallPct [>= 3 points] FAIL (gap -58.2) | draw -> owns powerLimitedRounds + minPowerRatio FAIL (the 200 floor: rival 127)
auto-exec: {"question":"does buffer lead inputStallPct by >= 3 points over the best named rival under BOTH gap ladders?","irregular":false,"gap6":false,"bothPatterns":false,"outcome":"the drop executes: the fork ships two plans (speed, draw); negative result recorded, never re-scored"}
```

Reading: under both ladders the `buffer` rank leaves the machine with the **largest** input stall (186.9 / 181.5 vs 115.5 / 123.3 for the leaders) — the developer's dissent in the addendum is confirmed by the instrument: with the `pullNeed` window already topping machines up to `perBatch * (2 + bufferRanks) + bonus`, a bigger in-hand buffer does not remove store-floor stalls at this cadence; it just slows the purchase clock (batches 1160/1176 vs 2286/2305).

## Determinism

`npx tsx work/feedback/strat002-harness.mjs`, consecutive runs, stdout SHA256 identical: `2546ad2e4650249e01c1a28ce9f67e50aaa6fe829d1cb1365059c779877b18e8` (runs 1 and 2; a third run reproduced the same stdout and JSON hashes). JSON sha256 `a01ba70d6c91c0af792f0d8acffb5dbf4cc8228c736c86491d22781f65c81958` on both writes.

## Gates on the candidate tree (real exit codes)

| gate | exit | reading |
|---|---|---|
| `npm run typecheck` | **0** | no output |
| `npm test` | **0** | **272 passed / 27 files** = 268 (base `8a06e9d`) + **4 new** in `tests/simulation/fork.test.ts` (below), no existing case lost |
| `npm run validate` | **0** | behaviour line verbatim: `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 \| 0 violation(s)`; ladder fixture `schemaVersion 1`, checksum `eede3c4f` (asserted by the passing fork test) |
| `npm run build` | **0** | entry `dist/assets/index-CJfGk59d.js` = **231,520 B**, sha256 `ffafb1d93d2ca9ee2f50d96183e202563ef58cd532d14f6ddcab45c19682f344` — **identical to the published build** (OPS-010-g1 digest for `rustwake-8a06e9d`); css/tables/worker unchanged |

New test cases (all in `STRAT-002/A1-2v3`, so 268 + 4 = 272):

1. `declares the MMG once in the harness gaps block and reads it back exactly` — the addendum's table per column, including the two-term `creditsPer1000Batches {relative: 0.03, absolute: 100}` and the zero-rival clause;
2. `reproduces the stored inputStall columns on both gap ladders, non-vacuously` — the in-test mirror equals every stored `inputStallTicks`/`inputStallPct` tick-for-tick on 4 rows x 2 ladders, all > 0;
3. `names the leading branch per column under MMG, named rows only, on both ladders` — recomputed leaders equal the harness maps and the exact expectations above (including the two `null`s and `creditsPer1000Batches: buffer` on gap6 only);
4. `executes the drop clause: buffer leads inputStallPct on neither gap ladder` — the numbers (-71.4 / -58.2 points), `autoExec.bothPatterns === false`, and `verdicts.buffer.pass === false` on all three tables.

Also updated in place (count unchanged): the R3 twin identity now runs all three ladders and checks the new pair; the old OR-disjunction case is rewritten to the MMG numbers (irregular: buffer `inputStallPct` 186.9 with lead < 3 asserted as the negative result).

## What the release engineer touches if the drop is applied (per the addendum, it executes)

- UI option list: `src/ui/text.ts` — `branchOptions()` returns the three entries; remove `{ id: "buffer", label: t("btn.branchBuffer"), cost }` so the dock shows `Faster batches` / `Less power`. The label `"btn.branchBuffer": "More input"` goes with it in `src/game/content/strings.ts`.
- `upgradeRanks` (in `src/game/simulation/types.ts`): the decoder keeps mapping `"buffer"` picks to ranks so pre-drop saves (`branch: ["buffer", ...]`) still decode; the unnamed-level semantics (unnamed = speed) are unchanged.
- Both receipts stay unchanged: save checksum `eede3c4f` (the seed carries no branch keys) and the validate behaviour line `firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)` — the unnamed ladder is unaffected by removing a named option, and this candidate already reproduces both verbatim.

## Limitations

1. `inputStallPct` is a sum over machines (max = machines x tick), so on 8 machines it runs to ~100s of points; the 3-point MMG applies on that stated scale, consistent with `starvedMax`/`starvedMean`.
2. The per-tick store sample is taken after each `stepTick` (end-of-tick state); within-tick ordering of store writes vs the measure phase is fixed by the engine's phase order, so the column is deterministic, but it is an end-of-tick reading.
3. The g2 `>=2 affordable` census note still applies: the named `draw` row shows 120 on gap6 (at target), speed 131, buffer 126 — census breadth comes from the fork's priced options, not from a third mechanism.
4. jsdom is not a viewport; the 360 x 640 captures remain owed by the QA lane and are unaffected by this slice (entry byte-identical).
5. One experiment per the decision's cap: the two predicates are fixed before the run (5/4 and 3/3); no period sweep was fit.

## Rollback / save impact

Harness, test and handoff only: `work/feedback/strat002-harness.{mjs,json}`, `tests/simulation/fork.test.ts`, this file. Saves untouched — `schemaVersion 1`, checksum `eede3c4f` reproduced in the passing suite; entry byte-identical, so deployment of the integrated result serves the same asset graph. Rollback = revert the candidate commit; no state to unwind.
