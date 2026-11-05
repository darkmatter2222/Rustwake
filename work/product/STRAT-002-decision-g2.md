# STRAT-002 - product decision for generation 2, plus this sprint's player triage

Role: product owner. Candidate `4b6e32c` (g1), base `24daf0e`. My own read of `work/feedback/strat002-harness.json` (rows, stages, leads) and `work/development/handoffs/STRAT-002-g1.md`. Simulated-persona and automated-harness evidence types; no human study. QA's independent gates for this candidate run in another lane and are not re-run here.

## 1. Fork decision: option (b) - revise the acceptance metric set prospectively

**Decision: (b).** The g1 `A1-2` failure stands on the record unsmoothed; a new criteria version (`A1-2v2`) governs g2 onward, per AGENT_WORKFLOW ("a criterion changed after failure produces a new version and retest, never a retroactive pass"). Not (a): as measured the shipped claim would be a two-plan fork while the ticket claims three, which is a false metric, not a weaker one. Not (c): every safety gate is green, the pre-fork save is byte-identical (`schemaVersion` 1, checksum `eede3c4f`), the merged size fits (`228,014 + 2,569 = 230,583 B` under the 233,000 B ceiling, 2,417 B spare), and the `>=2 affordable` census is genuinely met (121/1800 against a target of 120).

### 1.1 What the numbers say, in my own reading

| named branch | batches | rejects | taps | powerLimitedRounds | minPowerRatio | starvedMax/Mean | credits (residual) | >=2 affordable | sum(level-1) |
|---|---|---|---|---|---|---|---|---|---|
| speed | 2175 | 249 | 1983 | 386 | 0.615 | 80 / 51 | 49 | 121 | 97 |
| buffer | 1158 | 625 | 2046 | 234 | 0.727 | 84 / 57 | 190 | 101 | 77 |
| draw | 1191 | 318 | 2045 | 0 | 1.0 | 85 / 58 | 49 | 107 | 80 |

- The harness's own `leads` block has **no key for `credits`**, and `buffer` is absent from all nine leads lists it does compute. So "buffer owns only the residual credit balance" is correct and is not even scored by the instrument.
- `speed` is the unnamed default by construction: the two rows are identical on every scalar and on all six `kinds` counters (2175/49/1983/249/386/0.615/121/4, `build` 175, `sell` 1396, `upgrade` 160, `connect` 9, `drone` 3, `research` 3). Two distinguishable plans plus one documented twin.
- `buffer` does not even deliver its own mechanism: with a larger input buffer it should reduce starvation, and it does not (starvedMax 84 / mean 57 vs speed's 80 / 51). Under a one-command-per-round serial ladder the binding constraint is material allocation between consumers, not buffer capacity - that is the recorded negative result, and it is the reason a third branch is currently decorative.

### 1.2 A1-2v2 - machine-checkable, prospective

Table = the three named rows only (`rows[].policy` in `{speed, buffer, draw}`); the unnamed row is reported as the `speed` twin and is excluded from dominance scoring.

Primary column set, named by exact field:
1. `rows[].batches` (higher wins)
2. `rows[].powerLimitedRounds` (lower wins)
3. `rows[].minPowerRatio` (higher wins)
4. `rows[].rejects` (lower wins)
5. `rows[].taps` (lower wins)
6. `rows[].milestones.firstResearch` (lower wins)
7. `rows[].starvedMax`, 8. `rows[].starvedMean` (lower wins) - currently only derivable from `stages.<policy>[].starved`; g2 must promote them into `rows[]`
9. `rows[].creditsEarned`, 10. `rows[].creditsPer1000Batches` - new; the residual `rows[].credits` stays a reported column and cannot satisfy the rule

Rules:
- **R1** every named branch leads at least one primary column, judged by the recomputed `leads` map restricted to named branches; `speed`'s lead must not be credited from the unnamed row.
- **R2** the residual `rows[].credits` alone cannot satisfy R1.
- **R3** the twin identity is asserted in `tests/simulation/fork.test.ts`: the `speed` row equals the unnamed row on all scalar and `kinds` fields, so a future divergence is caught rather than silently absorbed.
- **R4** pick attribution is stated: `kinds.upgrade` (160/453/150) is command attempts, `sum(level-1)` over `rows[].levels` (97/77/80) is purchased levels; a criterion must name one of them. Today neither is reconcilable with the other, so `branchByLevel` length is a third number and is reported, not scored.

Numeric gap each branch must own (from g1 measurements; g2 must hold or improve):
- **speed** owns throughput: `batches` lead by >= 900 over each other named branch (measured 984 over `draw`, 1017 over `buffer`).
- **draw** owns the power budget: `powerLimitedRounds` = 0 with both others >= 200, and `minPowerRatio` gap >= 0.25 (measured 0 vs 234/386, 1.0 vs 0.727/0.615).
- **buffer** must own one mechanism-adjacent column by >= 5 % relative or >= 10 absolute: `starvedMax` / `starvedMean` preferred, else `creditsPer1000Batches`. Measured today it owns none. If after the ladder change in 1.4 it still owns none, buffer is dropped and the fork ships as two plans - recorded as a negative result, never re-scored.
- Census note: `>=2 affordable` >= 120/1800 is met by `naive`/`speed` (121) but not by `buffer` (101) or `draw` (107). g2 must state which row the 120 applies to; today it is the unnamed row.

### 1.3 What QA's outstanding numbers must show, per option

- **(a) keep as-is** needs: chromium 360 x 640 with the power line present (`scrollHeight <= innerHeight + 1`, every dock target >= 44 CSS px, longest label `Faster batches`/`More input`/`Less power` legible at text scale 2.0), a persona comprehension run naming the tradeoff, and the merged-entry receipt <= 233,000 B. Then the shipped claim is stated as a **two-plan fork (speed, draw)** with `buffer` recorded as dominated.
- **(b) chosen** needs all of (a)'s numbers **plus** the g2 harness re-run producing the new `rows[]` columns, the recomputed `leads`, the R3 identity assertion and the R4 reconciliation. (b) is final when each named branch leads something under R1 and the A1-5/A1-6 numbers pass; otherwise the buffer-drop clause listed under the numeric gaps executes and (b) lands as (a).
- **(c) revert to `24daf0e`** needs no new numbers; it is justified if the merged entry exceeds 233,000 B, or at 360 x 640 the three named targets plus the power line cause scrolling or overlap, or the persona still cannot name a tradeoff after the primary label is stabilised.

### 1.4 Switch conditions

- (b) -> (a): g2 re-run still leaves `buffer` leading nothing after the ladder change below. Action: ship two plans, drop `buffer`, record the negative result. Revert trigger: none needed; `speed` is the unnamed default, so two plans already improve on the pre-fork census (4 -> 121).
- (b) -> (c): any of the three (c) triggers. One slice, one revert, no partial merge chasing.
- (a) -> (b): a later run shows `buffer` leading a mechanism-adjacent column after the ladder change.
- Ladder change to try first (bounded, one experiment): make supply irregular for 300 rounds (a starved upstream stage) and re-measure. If `buffer` still leads nothing under irregular supply, the mechanism is not worth a third name on the dock.

## 2. Player evidence triage (this sprint, shared across lanes)

Source: three fresh-storage naive runs on the live base build `24daf0e` (served `index-D14MbFT6.js`), 250 ms sampling x 40 taps, byte-identical runs. Simulated-persona inference, not a human study.

| id | observation | severity | disposition |
|---|---|---|---|
| PL-1 | 6 of 40 taps registered a change (taps 1,4,7,10,13,16, period ~790 ms). 34 taps are non-events. | **high** - blocks the charter test "I can explain what I chose" | accepted, in the next experiment |
| PL-2 | From tap 18 the screen cycles among 3 states with one toast `Not enough material` and 0 machines; a deliberate pass reaches 1 machine at ~27 s. Power is not on the resting screen (`hasPower:false`) and only appears one tap deeper as `0 of 8 units requested` while a machine is `waiting for input`. | **high** - the informative state is deeper than the resting screen | accepted, in the next experiment |
| PL-3 | The primary label mutates five ways for one continuing choice (`Salvage` -> `Repair drone 30 scrap` -> `Build sorter 20 scrap` -> `Place Scrap sorter 20 scrap` -> `Connect dock to sorter`), so the next tap's effect is not predictable from the label. | **high** - this is the legibility failure, not a cosmetic one | accepted, in the next experiment |
| PL-4 | `Not enough material` never states the shortfall (measured 5 of 20 against a cost of 20). | medium | accepted, in the next experiment |
| PL-5 | Idle production is invisible and inaudible: 0 audio nodes in 3x3 s idle windows, output shows only as `Scrap` stepping +5 every ~5.1 s; `A 1` and `Home` carry no value hint; drone count is never numeric. | medium | accepted as one numeric-idle/beat item; the audio beat itself stays in the rotating review lane |
| PL-6 | Agent's own words: the opening minute reads as "a counter I am decrementing, not a machine I am setting up". | diagnosis, not a separate fix | tracked as the hypothesis the experiment tests |
| PL-7 | Glyph/mask polish, extra currencies, more panels, comment arithmetic. | low | deferred (revisit after PL-1..PL-5 are measured) |
| PL-8 | Add more taps to make progress visible. | - | **rejected**: more taps is not a tradeoff; PL-1 shows taps are already mostly non-events |

### 2.1 The one next playable outcome experiment (PLAY-001)

**"The resting screen answers three questions without a tap."** One merged build (art `87ee90b` + fork g2), one resting-HUD slice, three changes only: a primary label that stays fixed while the underlying choice is the same; shortfall numbers inside the toast (`Need 15 more scrap` style, i.e. `have` and `need`); and a resting line that states power and drone count numerically plus one visible idle-output beat per production cycle. Non-goals: no new currency, no new machine, no new panel, no second screen, no audio work.

**Plain-language acceptance check (one persona, no census).** On a fresh start, tap ~20 times at 250 ms, stop, and without opening any panel the persona writes three sentences: (1) what my next tap will do; (2) how much scrap I was short on my last failed tap; (3) whether the yard is producing anything right now and what. **Pass = all three sentences match the sim state read from the same build**, and the primary label string did not change while the underlying choice stayed the same. Fail example already on record: today answer (2) is unanswerable from the toast and (3) is only "Scrap went up".

**Negative control, same sprint:** the identical three-sentence run on `24daf0e`. The candidate must be strictly better than its own base; if it is not, the slice is reverted and (c) applies.

## 3. The two independent challenges, ruled

1. **Is residual `credits` a legitimate strategic metric for a 60-second opening? Rejected as a metric, accepted as a reported column.** It is an unspent balance, close to the inverse of purchases: `buffer` holds 190 against 49 for all three other rows because it bought 77 level increments where `speed` bought 97. On a 60-second clock that is "I bought less", not "I earned more" - and it is nearly constant across two of three plans, so it cannot separate them. It counts only in earned form (`creditsEarned`, `creditsPer1000Batches`).
2. **Is a by-construction twin a real branch? No.** `upgradeRanks` reads an unnamed level as a speed rank, so `speed` and the unnamed default are one plan; I verified equality on every scalar and all six `kinds` counters. Honest count: two distinguishable plans plus one documented twin. A third name on the dock must earn its place on a mechanism-adjacent column (R1/R3 above), not by being present.
3. Kept from the same read, as an instrument condition: pick counts disagree (`kinds.upgrade` 160/453/150 vs `sum(level-1)` 97/77/80 vs `branchByLevel` length 160/453/150), so any criterion that counts picks must name the field it reads.

## 4. Scope, dissent, revisit

**Deliverables for the next sprint (cap three):** D1 merged build with size and gate receipts; D2 the PLAY-001 resting-HUD slice; D3 the g2 evidence set (harness v2 columns + 360 x 640 captures + one persona comprehension run). **Ready items (cap five):** R1 merge and size receipt; R2 stable primary label; R3 toast shortfall numbers; R4 resting power line with numeric drones and one idle beat; R5 harness v2 columns plus `leads` recomputation and the R3/R4 identity-and-attribution assertions in tests. Deferred with revisit trigger: audio beat (after R4's idle beat is measured), mixed-branch policy measurement, `droneTravelTicks` phase retune, legacy glyph items.

**Dissent on record.** Developer position: two plans is enough and the ladder is not the interesting part. Player-researcher position: wants the idle output to have a sound. QA position: jsdom is not a viewport and the 360 x 640 numbers are still missing. I accept all three: the ladder change is capped at one experiment, the audio beat stays deferred behind the numeric idle line, and no visual acceptance is granted without the chromium capture.

**Revisit trigger for this decision.** Any of: the g2 harness run lands and a named branch leads nothing under A1-2v2 (-> ship two plans); chromium 360 x 640 shows scrolling or a < 44 px target with the power line present (-> revert, option c); the merged entry exceeds 233,000 B (-> revert, option c); one human first-feel run replaces the simulated persona and reports the same three-sentence failure (-> PL-1..PL-4 keep priority, PLAY-001 stays the single experiment).
