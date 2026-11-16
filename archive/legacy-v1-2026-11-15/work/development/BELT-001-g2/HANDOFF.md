# BELT-001 g2/g3 tail — developer handoff (lane `rw/belt001-g2`)

Worktree `C:/Users/ryans/AppData/Local/Temp/opencode/belt001-dev`, sole writer. Base of the lane chain: `b4e8321e782a4debc55e58a6c7b123e86dd1047a`.
Shape shipped = the accepted cost-only variant of `work/product/SPRINT-003-decisions-g1/DECISIONS.md` D-1(a): `beltCostPerTile * run.length` charged on connect, `dismantleRefundPct` on removal, the `run` array carried for the visible extent, **per-tile latency deferred** (the clock stays `routeLatencyTicks` = 5).

## 1. Pushed SHAs (all verified on `origin`)

| sha | content | verified |
| --- | --- | --- |
| `5eb4be6f2c9c661789bf934efb1678202941a7a7` | g1 WIP checkpoint (full variant, per-tile latency) — superseded by D-1(a) | `origin/rw/belt001-g1` |
| `8102ac4a89eb5a7abbf07a99b9e26cde6fb6ebe7` | the tested tree, barrel-free test imports + `tests/simulation/probe-belt.d.ts` + `save.ts`/`commands.ts`/`types.ts` — this is the commit that clears the 23 typecheck diagnostics QA saw at `5eb4be6` | helper receipt + `git ls-remote` |
| `5d5238b5b686d4c52bd6d1fdc8213ecf9f88c5bb` | **candidate**: cost-only variant (constant clock, per-tile latency deferred) + exact price/refund ladder + `DEF-008` round-trip + regenerated harness + the four restated pins | helper receipt + `git ls-remote origin refs/heads/rw/belt001-g2` → `5d5238b5b686d4c52bd6d1fdc8213ecf9f88c5bb` |

Publication receipt: `.git/rustwake-publication/rw_belt001-g2.json`, e.g.
`{"branch":"rw/belt001-g2","sha":"5d5238b5b686d4c52bd6d1fdc8213ecf9f88c5bb","verified_push_at":"2026-11-07T06:29:22.116Z",...}`.

## 2. Gate rows — every command run in a **fresh worktree of the pushed SHA**

`git worktree add …/belt001-g2-verify 5d5238b…` (`HEAD` = `5d5238b5b686d4c52bd6d1fdc8213ecf9f88c5bb`, `git status --porcelain=v1` empty), `node_modules` mounted from the lane:

| gate | command | exit | printed evidence |
| --- | --- | --- | --- |
| typecheck | `npm run typecheck` | **0** | `> tsc --noEmit` with no diagnostics |
| tests | `npx vitest run` | **0** | `Test Files 28 passed (28)` / `Tests 301 passed (301)` / `Duration 4.44s` |
| validate | `npm run validate` | **0** | `content: 0 violation(s) in 3 ms`, `validated: no violations`, behaviour line below |
| build | `npm run build` | **0** | `✓ built in 559ms`, entry `assets/index-DIxzqgyG.js 232.88 kB` = **232914 B** |

Same four gates at `8102ac4` in the same fresh worktree: exit `0 / 0 / 0 / 0`, `28 files / 298 tests`, entry `assets/index-jp4qHb0Z.js` = **232969 B**.
At the pristine `5eb4be6` the reviewer measured `typecheck exit 2` (23 diagnostics, missing barrel `../../src/game/simulation`), `28 files / 1 failed`, entry **233175 B** (over the ceiling). Both are fixed by the two commits above; the barrel imports are gone (`tests/simulation/probe-belt.d.ts` is now a tracked file, and `belt.test.ts` imports `simulation/types`, `simulation/commands`, `simulation/engine`, `simulation/autoconnect`, `persistence/save` directly).

**Entry chunk against the ceiling (233000 B, unchanged this sprint):**

| tree | entry bytes | Δ vs deployed `12cc0e2` (231943) | headroom under 233000 |
| --- | --- | --- | --- |
| `b4e8321` base (product record) | 231878 | −65 | 1122 |
| `12cc0e2` deployed | 231943 | 0 | 1057 |
| `5eb4be6` (full variant, QA) | 233175 | +1232 | **−175 (over)** |
| `8102ac4` (tested tree, full variant) | 232969 | +1026 | 31 |
| `5d5238b` **candidate (cost-only)** | **232914** | **+971** | **86** |

These three lane numbers are measured on one machine, one clean build each, from the pushed trees. 86 B of headroom is thin: the merge projection is the release lane's job (ART-003 +459 / UI-002 −525 per D-1), and on those deltas the merged entry lands ≈ 232848 B — inside, but the first `scene.ts` belt-sprite commit needs its own byte row.

## 3. `DEF-008` — priced refund across a save round-trip (`tests/simulation/belt.test.ts`)

Probe (`work/development/BELT-001-g2/probe-rows.mjs`) on the shipped code:

```
PRE_SAVE_RUN [2,1,0] SCRAP_AT_ENCODE 267
AFTER_LOAD_RUN [2,1,0] LATENCY 5 SCRAP 267 NEUTRAL true
AFTER_LOAD_REFUND 3
RUNLESS_REMOVE 2 refund 0 stateHash 533f5367
```

The test (`refunds the same scrap for a priced link before and after a save round-trip (DEF-008)`, sorter@0 + furnace@8 + one scrap link, 300-scrap purse) asserts, with literals and no tolerance:

- `expect(preSaveRun).toEqual([2, 1, 0])`; after `encodeSave → decodeSave`: `route.run` **toBeDefined**, `toEqual(preSaveRun)`, `toHaveLength(3)`;
- the load is neutral: `expect(loaded.store["scrap"]).toBe(scrapAtEncode)` and `toBe(267)` (= 300 − 20 sorter − 10 furnace − 3 link);
- `expect(afterLoadRefund).toBe(Math.round(TUNING.dismantleRefundPct / 100 * TUNING.beltCostPerTile * runLength))` → literal **3**, and `expect(afterLoadRefund).toBe(inSessionRefund)`;
- run-less fallback on the v1 fixture: an item-free route with `run === undefined` removed via `expect(() => send(...)).not.toThrow()` and `expect(scrapDelta).toBe(0)`, plus `refundOf(beltCost(route.run?.length ?? 0)) === 0`.

Mechanism note kept from D-1: `decodeSave` is `JSON.parse` + `validateSim`, there is no `decodeRoute`, so the defect was the missing coverage, not a dropped field. `8102ac4` is the SHA where the suite carries it.

## 4. Exact price/refund ladder and the direct clock assertion

Distances are `|Δrow| + |Δcol|` from the dock tile 2, so run length = distance + 1. Purse movements are read off `store.scrap`, never from a helper sum (`work/development/BELT-001-g2/probe-rows.mjs`):

| tile | distance | run | price scrap | refund scrap |
| --- | --- | --- | --- | --- |
| 4 | 2 | `[2,3,4]` | 3 | 3 |
| 27 | 5 | `[2,8,14,20,26,27]` | 6 | 5 = `round(5.4)` |
| 31 | 6 | `[2,8,14,20,26,32,31]` | 7 | 6 = `round(6.3)` |

Each row is asserted twice — once derived from the geometry (`TUNING.beltCostPerTile * (distance + 1)`, `Math.round(dismantleRefundPct/100 * beltCostPerTile * tiles)`) and once as a literal integer — and the taps themselves return 3 / 5 / 6 one link at a time.

The clock is asserted directly on a freshly connected pair, not assumed:
`expect(route.latency).toBe(5)` **and** `toBe(TUNING.routeLatencyTicks)` near (3 tiles) and far (9 tiles) pairs, and after `machine.move` the moved link still reads 5 (the move re-walks the extent only). The deferred per-tile reading is asserted as its own number so g2 starts from a value: `expect(TUNING.beltLatencyPerTile).toBe(2)`, `2 × 3 = 6`, `2 × 11 = 22`, `2 × 9 = 18`.

## 5. 12 h bench, per variant (attribution, not assumption)

`npx tsx work/development/BELT-001-g2/bench-variants.mjs` — one built yard (8 machines, 6 priced links), byte-identical JSON clone per variant, `advance(state, 432000)`, median of 5, both run orders:

| variant | forward ms | reversed ms | Δ vs A |
| --- | --- | --- | --- |
| A cost-only (shipped: `run` carried, latency = 5) | 143.59 | 149.74 | — |
| B per-tile latency (deferred: `2 × run.length`) | 143.58 | 149.59 | −0.01 % / −0.10 % |
| C no-run (`run` absent, latency 5) | 149.49 | 148.70 | +4.11 % / −0.70 % |
| D null control (4 machines, **no** links) | 31.92 | 35.30 | −77.8 % / −76.4 % |

Reading: **per-tile latency is not the cost** (B is A to within 0.1 %), and the `run` array is within the ±4 % scatter of this instrument (C). The step that is not noise is A → D: the six links themselves, i.e. the per-tick route loop over `route.items`, which every variant including the base carries. The 17.5 % reading at `5eb4be6` is therefore an ambient-load reading of the suite, not a mechanism — see the matched pairs below.

`tests/perf/bench.test.ts` `bench 12h starter yard (4 machines, tick-by-tick)`, matched alternating pairs on one machine (base = `rev-belt001-g1-base` at `b4e8321`, candidate = fresh worktree at `5d5238b`):

| context | base | candidate | Δ |
| --- | --- | --- | --- |
| single file, pair 1 | 41.97 ms | 43.54 ms | +3.74 % |
| single file, pair 2 | 42.03 ms | 41.20 ms | −1.98 % |
| full suite, pair 1 | 83.07 ms | 80.76 ms | −2.78 % |
| full suite, pair 2 | 72.67 ms | 73.75 ms | +1.49 % |
| **headline (first full-suite pair of the session)** | **85.14 ms** | **84.96 ms (`8102ac4`)** | **−0.21 %** |

**B-5 verdict: PASS** — every reading is inside the pre-armed ±10 %, largest observed +3.74 %. The 17.5 % FAIL for the full variant stays on the record in `DECISIONS.md` D-1; nothing here overwrites it.

## 6. Save-compatibility invariant (unchanged by this slice)

`eede3c4f` / `schemaVersion 1`: `tests/simulation/belt.test.ts` still pins `envelope.schemaVersion === 1`, `envelope.checksum === "eede3c4f"`, `checksum(JSON.stringify(decoded.payload)) === "eede3c4f"`, `encodeSave(...) === raw` (byte-identical), `validateSim(...) === null`, 18 routes with `run === undefined` at `latency === 5`, and the pre-price 1 h replay `{atDecode 1902, tick 21898, links 18, batches 2356, hash "1493c153"}` — all green in the 301-test run. The harness `saves` block prints the same: `{"fixtureChecksum":"eede3c4f","schemaVersion":1,"decodeOk":true,"validateSimNull":true,"byteIdentical":true,"routesWithRunUndefined":18}`.

## 7. Behaviour line (B-5's "before → after", restated on the cost-only tree)

- base `b4e8321` (measured): `behaviour: firstDrone=268 firstResearch=478 tick=18298 machines=8 links=18 drones=5 batches=1902 credits=82 nodes=3 | 0 violation(s)`
- `5eb4be6` / `8102ac4` (per-tile clock): `firstDrone=314 firstResearch=498 tick=18298 machines=8 links=18 drones=4 batches=1932 credits=93`
- **`5d5238b` (candidate, constant clock): `behaviour: firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3 | 0 violation(s)`**

The line is **not** restored to the pre-change values, and that is expected and named: 17–18 priced links take scrap from the same purse the ladder spends on builds and spares, so the purchase order shifts (`drones` 5 → 4, `batches` 1902 → 1838, `credits` 82 → 157). `tick`/`machines`/`links`/`nodes` are unmoved. `tests/content/validate.test.ts` now pins the candidate's numbers with that explanation in the comment; the base line stays the recorded "before".

Restated pins that follow from the same clock choice (all owned by this lane): `tests/simulation/cadence.test.ts` totals 1932 → **1838**, `tests/simulation/supply-window.test.ts` floor-10 totals 1932 → **1838** (sweep now 1978 / 1838 / 1752, still inside ±10 %), `tests/simulation/fork.test.ts` `powerLimitedRounds` rival row 99 → **127** and `buffer.inputStallPct` 209.3 → **136.7**.

## 8. Harness rows for the cost-only tree

`npx tsx scripts/probe-belt.mjs` twice → `probe-belt checksum 7fe91647` both times, `wrote work/feedback/belt001-harness.json (11052 B)` — determinism witness B-4. Prices unchanged: `[3, 2, 2, 4, 9]` scrap for the five tile rows, removal row `9 → 8` at 90 %, refusal row `need 3 / have 2 / scrap` with `revisionMoved 0`.

Layouts B-2 (`leads {compact: 2, spread: 1}`, `dropClause.fired false`): on the primary `irregular` pattern `spread` takes `inputStallPct` (106 vs 120) and `compact` takes `creditsPer1000Batches` (7256.444 vs 6345.575); on `gap6` only `creditsPer1000Batches` has a leader (compact 7445.462 vs 7199.040). Product's D-2 negative reading stands after this slice: 5 of 7 columns are inside their MMG on both patterns, so pricing alone still does not create a second viable plan.

## 9. Remaining gaps (exact)

1. **`g4`** — the priced extent is still **invisible**: `scene.ts` draws one straight 2 px segment between the two endpoint centres regardless of a 2-tile or 7-tile run, so the player cannot see the extent the price is computed from. Polyline-over-`run` + printed price is `BELT-001 g4` (needs `scene.ts`, i.e. after ART-003 releases it).
2. **Per-tile latency** (`beltLatencyPerTile × run.length`) is deferred by D-1(a) and is now asserted only as the deferred reading (6 / 18 / 22 for 3 / 9 / 11 tiles). Arming it will restate the same four timing rows (behaviour line, cadence, supply-window, fork) — the restatement cost is known and is four numbers.
3. **Merge ordering, `tests/ui/resting-screen.test.tsx`**: this branch chain and `rw/ui002-g1` both touch that file, so the release lane must order the merge deliberately (integrate one, then re-run the other's U-1 census on the merged tree; do not let a `-X ours` style resolution silently pick one geometry).
4. **Byte budget**: 86 B of headroom at `5d5238b`. Any `scene.ts` sprite or new string table row needs its own printed byte row in the same commit.
5. Unattributed residual: A/D shows the route loop dominates the 12 h cost (32 → 144 ms for 4 → 8 machines + 6 links); if a future slice needs more headroom, that loop — not the belt fields — is where it is.
