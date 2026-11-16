# STRAT-002 generation 1 — developer handoff (candidate)

Role: developer (pragmatic craftsperson). Task: STRAT-002 g1, decision `STRAT-002/A1`.
Base SHA `24daf0e4d5d27000ab9b0841fa8a2d236aefa045`. Worktree `strat002-dev`. Evidence type: automated gates (real exit codes), deterministic harness runs (numerical analysis), jsdom DOM/style assertions, source inspection. No human playtest, no audio claim.

## 1. What the player gets

At a machine's first paid level the dock stops offering one unnamed "Upgrade" and shows **three named outcomes at one price**: `Faster batches`, `More input`, `Less power`. One tap commits that branch; the price is paid once. Whichever is tapped moves exactly one counter — the batch clock, that machine's input buffer line, or the yard power ratio — and the other two stay put (proved per branch in `tests/simulation/fork.test.ts`). The resting HUD now carries `Power 8 · N requested · P %`, so a throttled round is something a player can point at.

## 2. Gate results (this candidate, measured, exit codes as printed)

| gate | command | exit |
|---|---|---|
| typecheck | `npm run typecheck` | **0** |
| content+behaviour | `npm run validate` | **0** |
| unit/integration | `npm test` | **0** (254 tests, 25 files) |
| build | `npm run build` | **0** |

Behaviour line, verbatim after the change (identical to base):

```
behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)
```

Content line: `content: 0 violation(s)`; `tables: 15 resources, 8 blueprints, 12 recipes, 3 research nodes`.

Emitted entry chunk (my tree, art lane **not** merged): `dist/assets/index-7328OjsX.js` = **229546 B**; `tables-CUbg8a0k.js` 8407 B; `index-DpiCrzhv.css` 7403 B; `catchup.worker-G_Jyr7uh.js` 13406 B. Baseline at base SHA was `index-D14MbFT6.js` 226977 B → **delta +2569 B**. Against the coordinator's art-merged entry 227910 B: `227910 + 2569 = 230479 B ≤ 233000` → fits with 2521 B spare (my own tree is 3454 B under the ceiling). `tables` is unchanged at 8407 B, so the art lane's +891 B is independent of this change.

## 3. Save compatibility (both cases are automated tests)

`tests/simulation/fork.test.ts`:
- **"keeps a pre-fork save byte-identical"** — loads `docs/evidence/yard-mature.json`: `decodeSave` ok, `schemaVersion` 1, `checksum(JSON.stringify(payload)) === "eede3c4f"`, every machine's `branch` is `undefined`, and `encodeSave(sim, lastSeenMs, settings)` reproduces the file **byte for byte**. The field is optional and `undefined` drops out of `JSON.stringify`, so old saves are unchanged.
- **"omits the branch key entirely while no branch is named"** — an unnamed `machine.upgrade` leaves `branch === undefined`, `JSON.stringify(state)` contains no `"branch"`, and `batchMilli` equals `batchMilliFor(blueprint, level)`: the legacy scalar is reproduced exactly.
- **"keeps the chosen branch across a save round trip"** — encode→decode preserves `branch: ["buffer"]`, the level, and the checksum; offline catch-up after the reload reads the same ranks.
- **"refuses a damaged branch list"** — `["nope"]` and an over-length list are rejected by `validateSim` rather than renumbered.
- **respec, unpunished and reversible** — `machine.respec` re-chooses the newest pick: `credits` and `level` unchanged, ranks shift, and tapping back restores the machine record byte-for-byte.

`schemaVersion` stays `1`; no new currency, no new machine/recipe, no research edit, no audio change.

## 4. The per-branch measurement A1-2 asked for (it did not exist before)

`work/feedback/strat002-harness.mjs` (pattern reused from `strat001-harness.mjs`): identical boot, identical ladder, **1800 rounds × 10 ticks = 18 000 ticks**, one named outcome per run. Output `work/feedback/strat002-harness.json`; per-policy totals are in `rows[]`, the `>=2 affordable` count is `rows[].pricedGe2`, the recorded 4/1800 definition is `rows[].legacyAmbiguous`, per-stage detail in `stages[]`, and every branch choice per level in `branchByLevel[]`.

| policy (branch) | batches | taps | rejects | machines | power-limited rounds | min power ratio | max starved % | mean starved % | firstDrone | firstResearch | nodes | credits | ≥2 affordable /1800 | picks recorded |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| naive (unnamed) | 2175 | 1983 | 249 | 8 | 386 | 0.615 | 80 | 51 | 62 | 386 | 3 | 49 | **121** | 160 |
| speed | 2175 | 1983 | 249 | 8 | 386 | 0.615 | 80 | 51 | 62 | 386 | 3 | 49 | 121 | 160 |
| buffer | 1158 | 2046 | 625 | 8 | 234 | 0.727 | 84 | 57 | 62 | 482 | 3 | **190** | 101 | 453 |
| draw | 1191 | 2045 | 318 | 8 | **0** | **1.0** | 85 | 58 | 62 | 479 | 3 | 49 | 107 | 150 |

Branch taken per level (final ladder, one entry per purchased level, from `stages[].branch`): `speed` → sorter L16 = 15×speed, furnace L14 = 13×speed, polymer recycler L13, wire mill L13, copper separator L14, plate press L12, circuit assembler L12, signal lab L11 — all `speed`; `buffer` → 13/11/10/9/10/9/8/7 buffer picks at L14/12/11/10/11/10/9/8; `draw` → 13/10/9/10/11/8/8/7 draw picks at L14/12/11/11/12/9/9/8. Every level in a branch run carries that one name; the unnamed run carries `undefined` and reads as all-speed.

**`speed` is identical to the unnamed default by construction**: `upgradeRanks()` treats a level bought without a name as a speed rank (that is what the old scalar was), so the naive line and the speed line are the same plan, not two plans that happen to tie. The honest comparison is therefore **speed 2175 / buffer 1158 / draw 1191** with `draw` owning the power metrics (0 power-limited rounds, ratio 1.0) and `speed` owning batches, starved % and taps.

## 5. Criteria verdict — measured, with the exact numbers

- **A1-1 ambiguity — MET.** Rounds with ≥2 simultaneously payable cost-bearing options on the naive line: **121 / 1800** (target ≥ 120, recorded pre-fork baseline 4). Same definition asserted in `tests/simulation/fork.test.ts` ("widens the costed-choice census"). Counting the same way, `buffer` = 101 and `draw` = 107. The old census definition (build AND upgrade both affordable) is reported unchanged at 4/1800 for every row, so the two readings are never confused.
- **A1-2 no weakly dominated plan — NOT MET.** `draw` leads alone on min power ratio (1.0 vs 0.727/0.615) and power-limited rounds (0 vs 234/386). `speed` leads alone on batches (2175 vs 1158/1191), max/mean starved % (80/51 vs 84/57 and 85/58), taps (1983 vs 2046/2045) and rejects. **`buffer` leads none of the four listed metrics; its only solo lead in the whole table is credits: 190 against 49 for all three other rows.** So one of three branches is weakly dominated on the listed metric set, which is exactly the collapse the product owner's dissent predicted. Not smoothed over: A1-2 fails as written; it passes only if `credits` is admitted as a recorded metric.
- The old 2175-vs-2174 near-tie does not recur: the measured gaps are 2175 vs 1191 vs 1158 (Δ984 and Δ1017 batches), and the naive/speed equality is the by-construction identity above rather than a coincidence.
- **A1-3 fork on the dock — MET** (jsdom, `tests/ui/fork-ui.test.tsx`): at the fork the dock holds exactly three `.dock__btn` targets labelled `Faster batches`, `More input`, `Less power`, each with its own `30 credits` cost node; one tap on `More input` produced `machines[0].branch === ["buffer"]`, `level` 2, credits 34 → 4, and the row returned to its usual targets — no Build-then-Place pair, and every tap is a named option.
- **A1-4 power budget on the resting screen — MET**: `.objective` text matches `Power 8 · \d+ requested · \d+ %` at text scale 1 **and** 2.0 without opening a panel.
- **A1-5 comprehension — NOT RUN here.** No simulated-persona session was executed in this lane; it needs the product/player lane's labelled run.
- **A1-6 layout floor — PARTIALLY MET (jsdom only).** Every dock target's computed `min-height` is ≥ 44 CSS px at text scale 1 and 2.0, and `document.documentElement.scrollHeight ≤ window.innerHeight + 1` with the extra power line present, at both scales. jsdom's viewport is 1024 × 768, so the **360 × 640 no-scroll figure and the longest-label legibility at 2.0 are unverified** — the coordinator's chromium numbers for base `24daf0e` (`.dock [10,790,370,46]`, `scrollHeight == clientHeight == 844`) still need re-measuring on this candidate.

## 6. Known limitations and next measurement

1. A1-2 fails on the listed metrics because the buffer branch's only advantage is credit accumulation; the branch is weakly dominated as measured.
2. Diagnosis, one line, from the same data: in every plan several stages are starved ≥ 60 % while the `draw` plan runs at ratio 1.0, i.e. the ceiling is material allocation between consumers, not power and not buffer size — that is the recorded trigger for deferred alternative (b), equal-weight allocation, and the reason a larger input buffer buys so little here.
3. The fork is per level and the ladder spends on the same machine repeatedly, so the "level N of which machine" pattern dominates the metric spread; a mixed-branch policy (e.g. speed then draw) is not yet measured.
4. jsdom has no real layout; A1-6's pixel numbers are the computed-style floor plus the no-scroll gate, not a chromium capture.

Files changed for this candidate: `src/game/simulation/types.ts`, `src/game/simulation/engine.ts`, `src/game/simulation/commands.ts`, `src/game/persistence/save.ts`, `src/game/content/strings.ts`, `src/game/content/validate.ts`, `src/ui/text.ts`, `src/ui/App.tsx`, `src/ui/Hud.tsx`, `src/ui/Panels.tsx`; new `tests/simulation/fork.test.ts`, `tests/ui/fork-ui.test.tsx`, `work/feedback/strat002-harness.mjs` + `.json`. Release-owned files untouched.
