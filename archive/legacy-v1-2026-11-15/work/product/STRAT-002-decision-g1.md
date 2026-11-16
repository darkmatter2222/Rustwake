# STRAT-002 generation 1 — product decision (one reversible fork, fixed before code)

Base SHA `24daf0e4d5d27000ab9b0841fa8a2d236aefa045`. Inputs: `docs/PRODUCT_STRATEGY.md`, `docs/DESIGN_BIBLE.md`, `work/feedback/STRAT-001-g1.md` (strat001-player worktree), coordinator-reproduced census. No new runs; no invented user studies. One simulated persona per run, labelled as such.

## 1. Chosen experiment (option a) — the upgrade names WHICH quantity improves

At the first machine upgrade the player picks one of three named outcomes for the same credit price: **faster batches** (the existing scalar), **holds more input** (buffer), or **uses less power** (draw). One branch per level; the price is paid once.

- Player-visible difference, one sentence: at the fork the dock shows one price and three named outcomes, and whichever is chosen moves exactly one different counter on the resting screen — batches/min, that machine's input-buffer line, or the yard power ratio — while the other two stay put.
- What the player gives up: the speed branch throttles deeper under the 8-unit budget (naive min ratio 0.615), the buffer branch never raises the peak rate, the low-draw branch buys no rate for its own machine. Only one is taken, so two are visibly forgone.
- Why this one and not (b)/(c): the diagnosed cause is a single scalar in `upgradeMachine` (`src/game/simulation/commands.ts:213-222`) feeding one ladder in `nextYardStep` (`src/game/simulation/plan.ts:87-124`). Turning that scalar into a named quantity is the smallest change that can produce two non-dominated plans. (b) allocator weights and (c) power priority groups change engine arithmetic without adding a costed choice to the dock, so they are deferred (§5).

## 2. Two conditions each plan wins — partly nameable today, the rest needs one measurement

Regimes are already in the recorded data; branch-leads claims are **not**, because today one scalar means no per-branch numbers exist.

| Regime (measured, exists today) | Predicted leader | Evidence in hand |
|---|---|---|
| R1 throttled — power-limited rounds ≥ 100/1800 **and** min ratio < 0.90 | power-draw branch | naive: 386/1800 power-limited, min 0.615, 8 machines |
| R2 unthrottled but starved — min ratio 1.0 **and** ≥ 1 stage starved ≥ 60 % of its own ticks | buffer branch | throughput-first: ratio 1.0, polymer recycler and wire mill 100 % starved, 0 batches, 4 machines |
| R3 unthrottled and fed — ratio 1.0 **and** every stage < 60 % starved (the drone-fed sorter is the ceiling) | speed branch | naive sorter 100 % busy; no clean ratio-1.0 run exists, so this cell is **unmeasured** |

Statement of the gap: from current data I can name the two *conditions* (R1, R2) and one uncontested lead; I cannot yet name which branch wins inside each. Minimum extra measurement, one run per branch on the same seed/budget/18 000 ticks: batches, taps, rejected commands, machine count, power-limited rounds, min power ratio, per-stage starved %, branch taken per level, plus the same two-regime probes. **If no branch leads on at least one metric the others do not, the experiment has failed** (PRODUCT_STRATEGY: a single dominant order is a failed experiment).

## 3. Acceptance criteria — version tag `STRAT-002/A1`, fixed now

The recorded `4 / 4 / 2` fork census stays on file as the **failed baseline** and is never re-tuned to make a candidate pass. A criterion edited after a failure produces a new version tag and a retest, never a retroactive pass.

- **A1-1 ambiguity rises.** Rounds with two cost-bearing options both affordable rise materially above `4/1800`; pass at **≥ 120/1800** (the level the census already reaches for "exactly two kinds"), on the naive line.
- **A1-2 no weakly dominated plan.** Each of the three branches must lead on at least one recorded metric that neither other branch matches (batches, starved %, min power ratio, taps-to-next-milestone), and the naive ladder must no longer tie a deliberate plan within 1 batch the way 2175 vs 2174 does with +451 taps, +389 rejects and 3 → 0 research nodes.
- **A1-3 both costed options visible on the dock at the fork.** Same price line per option, one tap commits the chosen branch, no Build-then-Place pair for the branch choice, and blind tapping must not silently pick it.
- **A1-4 the power budget is nameable on the resting screen.** Capacity, requested and ratio legible without opening a panel (e.g. `Power 8 · 9 requested · 62 %`), so the 386 power-limited rounds become something the player can point at.
- **A1-5 comprehension.** One labelled simulated persona states, unprompted, which quantity it bought and which two it gave up; before the fork, both costs are visible.
- **A1-6 layout floor.** All branch targets ≥ 44 CSS px, no page scroll at 360 × 640, longest label legible at text scale 2.0, entry chunk inside the 233000 B line.

## 4. Constraints the implementation must respect

- **Save compatibility:** `schemaVersion` stays `1`; the naive ladder must still reproduce behaviour fixture checksum `eede3c4f` (tick 18298, 8/18/5/1902/82/3). Store the branch as an **optional** field left `undefined` when untaken, so `JSON.stringify` drops it and `checksum(body)` (`src/game/persistence/save.ts:61`) is unchanged for pre-fork state. Once a branch is taken the checksum legitimately changes and needs a new labelled fixture, not a silent re-baseline.
- **Reversible:** respec/re-choose with no cost penalty and no state loss; offline catch-up and reload preserve the chosen branch.
- **Budget:** entry chunk measured `227875 B` against the pinned `233000 B` line → **5125 B** headroom; the tables chunk is reported separately and still counts toward the total.
- **Layout:** 44 px touch floor, no page scroll, dock row height stays ≈ ≤ 21 % of a 360 × 640 viewport (the four-word-label precedent in `src/ui/text.ts:158-168`).
- **No new currency. No audio work.** No new machine, no new recipe, no research-tree edit.

## 5. Non-goals, keep/revise/revert, dissent, revisit

- **Non-goals:** allocator weights (GAME_DESIGN 10.3), power priority groups (10.4), a second resource pool, tier-unlock modules, more than one fork per level, art or audio passes, offline-window changes.
- **Keep** when A1-1 … A1-6 all pass at the exact candidate SHA with independent QA. **Revise** once inside the sprint if only A1-1 or A1-3 misses. **Revert** to base `24daf0e` if two consecutive candidates fail A1-2, if the naive ladder and one deliberate plan tie again within 1 batch, or if `eede3c4f` moves without an explicit new fixture.
- **Deferred alternatives with triggers:** (b) equal-weight allocation between two consumers — revisit when the harness shows one stage starved ≥ 60 % in every plan while ratio is 1.0 (i.e. allocation, not power, is the ceiling); (c) power priority groups — revisit only after A1-4 ships and the power ratio is legible, so the control has something to name.
- **Dissent (mine, one line):** a three-way branch on one machine may still collapse to one dominant order if the power capacity stays 8 and the drone-fed sorter remains the ceiling, in which case the fork is cosmetic and A1-2 is the check that proves it.
- **Revisit trigger:** two unproductive rounds on this hypothesis or three releases, whichever first; also the first harness run where any branch is weakly dominated, or any owner report that the dock now reads as three buttons instead of a plan.

## Appendix — figures relied on (coordinator-reproduced, base `24daf0e`)

| Policy | batches | machines | credits | nodes | notes |
|---|---|---|---|---|---|
| naive ladder | 2175 | 8 | 49 | 3 | 386/1800 power-limited, min ratio 0.615 |
| efficiency-first | 2174 | 7 | 9 | 0 | weakly dominated: Δ1 batch, +451 taps, +389 rejects, 3 → 0 nodes |
| throughput-first | 816 | 4 | 8203 | 0 | 0 power-limited rounds, min ratio 1.0 |

- Census, 1800 naive rounds: exactly one kind 293, exactly two 1387, three or more 120, derived ≥ 2 = 1507; **build AND upgrade both affordable in 4 rounds** (4 / 4 / 2 across the three policies) — the failed baseline.
- Real browser, 200 taps at 360 × 640: one primary whose label is the next scripted step, 23 labels, never two competing primaries, each build costs two taps.
- Source cause: `upgradeMachine` changes one scalar (`level`, then `batchMilli`), cost `ceil(base × 1.16^n)`; the dock primary comes from `nextYardStep`. Power capacity `yardPowerCapacity: 8` (`src/game/content/defs.ts:357`), ratio set in `allocatePower` (`src/game/simulation/engine.ts:397-404`).
- Evidence types here: numerical analysis (harness), actual browser interaction, source inspection, simulated-persona inference for A1-5. Audio and human comprehension remain explicitly unverified.
- Repro for the new runs: reuse `strat001-harness.mjs` boot and cadence, add one policy per branch; no new harness framework.
