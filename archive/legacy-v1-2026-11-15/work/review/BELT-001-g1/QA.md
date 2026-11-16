# QA-BELT-001-g1 — independent review of `rw/belt001-g1`

- Reviewer session: `ses_e4ee05c18ffeLsDkFfVSLkA659` (QA role), 2026-11-06
- Candidate actually inspected: `5eb4be6f2c9c661789bf934efb1678202941a7a7` = `origin/rw/belt001-g1` at fetch time (blob-level re-read twice)
- Control tree: `b4e8321e782a4debc55e58a6c7b123e86dd1047a` (assignment base)
- Worktrees: `C:/Users/ryans/AppData/Local/Temp/opencode/rev-belt001-g1` (candidate), `…/rev-belt001-g1-base` (control), scratch harnesses in `…/rev-belt001-g1-qa/`
- Toolchain: node v22.18.0, npm 10.9.3, vitest 2.1.8, vite 5.4.11, tsc 5.6.3, Windows host, Chromium via `ms-playwright`

## Headline for the player

A connection now costs real scrap and takes real time: the same sorter→furnace pair costs **2** scrap next door and **7** scrap across the yard, and its link goes from 4 to 14 ticks of transit. Dismantling returns 90 % of what was paid, a blocked tap prints the exact shortfall, and old saves run unchanged. That part is solid and measurable.

What is not shippable yet: at the SHA that is actually on the remote, **typecheck and the test suite are red** and the entry chunk is **175 B over the ceiling**, so the artifact the pipeline would build does not exist. The visual layer also still cannot show what the player paid for: the belt is one straight line regardless of its 2- or 7-tile extent (`scene.ts` interpolates over `route.latency` on a straight segment, lines 516-536), so the price is a number with no visible object attached until `BELT-001 g2`.

## Verdict

**VETO** main integration of the reviewed candidate `5eb4be6` (three hard blockers below). The nominal head given in the assignment, `4789d3a4797d9d1f9e328919090f58439e37993e`, **does not exist** in the repository or on `origin` at any point of this review (`git cat-file -t` → "could not get object info"; `git ls-remote origin` listed `refs/heads/rw/belt001-g1 5eb4be6…`, twice, at ~08:58 and ~13:25 local). It therefore cannot be certified; once it is pushed, the gate rows below must be re-run against it by hash.

## Per-row verdicts (my own runs, not the developer's output)

| Row | Verdict | My own evidence |
|---|---|---|
| **B-1a** distance-dependent price, same pair, ≥2 layouts | **PASS** | My `qa-own-belt001.mjs` C1: sorter→furnace at tiles 0→1 = `run [0,1]`, 2 tiles, **2 scrap**, latency 4; same pair at 0→31 = `run [0,6,12,18,24,30,31]`, 7 tiles, **7 scrap**, latency 14. Store↔machine: tile 3 → 2 scrap, tile 33 → 7 scrap. Independent `manhattanRun` recomputation matches the stored `run` in every case |
| **B-1b** removal returns exactly the recorded refund % | **PASS** | C2, six pairs: price 2→2, 2→2, 7→6, 7→6, 5→5, 11→10 returned, each equal to `Math.round(price × 90 / 100)` with `TUNING.dismantleRefundPct = 90`. Machine dismantle (D1) returns 20 scrap = `round(20×0.9)=18` build + `round(2×0.9)=2` belt — no double-count |
| **B-1c** numbered shortfall, no state change | **PASS** | C3: belt refusal `{ok:false, reason:"insufficient", need:7, have:1, word:"scrap"}`; machine refusal `need:20, have:3`. In both, `revision` unchanged, `routes.length` unchanged and `JSON.stringify(state)` byte-equal before/after |
| **B-2** two layouts, per-column MMG, drop clause | **PASS** (with one honest caveat) | My `qa-leads.mjs` recomputes all 14 column readings from the stored rows and reproduces the stored leaders exactly (`compact` 2, `spread` 1 = `layouts.leads`); MMG table is byte-equal to the STRAT-002 A1-2v3 set and the column list is the same 7 (`mmgEqual: true`, **no new column set**). `dropClause: {armed:true, fired:false}` — correctly not fired since `creditsPer1000Batches` and `inputStallPct` clear their gaps. Belt prices are inside the scored set (`beltScrap` 48 vs 72) and all four rows stop at `tick 18298`. Caveat: read **per pattern**, the `spread` layout leads nothing under `irregular`; the "each layout leads a column" reading only holds as the aggregate over both patterns |
| **B-3a** v1 fixture byte-identical round-trip | **PASS** | C4 on my own run: `checksum(JSON.stringify(payload)) = eede3c4f`, `envelope.checksum = eede3c4f`, `schemaVersion = 1`, `decodeSave` ok, `validateSim` null, re-encode 26 114 B = 26 114 B byte-identical; 18 routes, 0 with `run`; tick 18298, `batchesDone` sum 1902, scrap 18 |
| **B-3b** pre-change save reproduces same batch counts | **PASS** | C5 run in both trees: 12 h advance (432 000 ticks) of the fixture gives `batchesDone` sum **2667**, credits 82, store digest `eb791bf9143c1122`, full-save digest `51ab738ce680753b` — identical on `b4e8321` and `5eb4be6`. Pre-price routes keep `latency 5` and refund 0 on removal (D2: +2 scrap is the 2 in-transit units, not a refund) |
| **B-3c** fork saves keep paid ranks | **PASS** | `npx vitest run tests/simulation/offline.test.ts tests/simulation/catchup-worker.test.ts tests/simulation/fork.test.ts tests/persistence/save.test.ts` → 4 files, **41 tests passed**, exit 0 |
| **B-4a** probe determinism, hash printed | **PASS** | `npx tsx scripts/probe-belt.mjs` twice: stdout identical (`probe-belt checksum 52a20c95`, `wrote work/feedback/belt001-harness.json (11063 B)`), both exit 0; regenerated file `git hash-object` = `56db7e01544524e6a568f4a6887eeff5adf3e305` = the committed blob, i.e. the committed evidence is reproducible from source. My own harness is also byte-stable across two runs (`QA_OWN_SHA256 b38a70a2…`) |
| **B-4b** 12 h catch-up equals online within tolerance | **PASS** | `tests/simulation/offline.test.ts` + `catchup-worker.test.ts` green (see B-3c run). Cross-tree note: the same scripted browser session gives the 12 h report `Deliveries 342 / Ferrous +110` on base vs `345 / +113` on the candidate, `Batches 773` in both — the variable latency moves the offline totals, which is the intended effect |
| **B-5a** typecheck exit 0 | **FAIL** | `npm run typecheck` → **exit 2**, 23 diagnostics, all in `tests/simulation/belt.test.ts`, 6 distinct rules (TS2307 ×2, TS2305 ×2, TS6133 ×4, TS7006 ×2, TS2339 ×7, TS7053 ×6) |
| **B-5b** all tests green (283 + new) | **FAIL** | `npx vitest run` → **exit 1**: `Test Files 1 failed \| 27 passed (28)`, `Tests 283 passed (283)`. The new `tests/simulation/belt.test.ts` **exists but never executes** — `Error: Failed to resolve import "../../src/game/simulation"` (no barrel module exists in this tree). Base control: 27 files / 283 tests / exit 0 |
| **B-5c** validate 0 with the behaviour line restated | **PASS on the gate, FAIL on "unchanged"** | `npm run validate` → **exit 0**, `content: 0 violation(s)`, `behaviour: firstDrone=314 firstResearch=498 tick=18298 machines=8 links=18 drones=4 batches=1932 credits=93 nodes=3`. Base under the same command: `firstDrone=268 firstResearch=478 … drones=5 batches=1902 credits=82`. So **five quantities moved** (+46 / +20 ticks, drones 5→4, batches 1902→1932, credits 82→93). The behaviour line quoted in the hand-off (`268 / 478 / 18298`) is the **base** line, not this candidate's |
| **B-5d** build 0, entry inside ceiling | **FAIL** | `npm run build` → **exit 2** (it is `tsc --noEmit && vite build`, and no `dist/` is produced). `npx vite build` alone → exit 0 with `assets/index-C2xYBcTI.js` = **233 175 B**, i.e. **+1 297 B over base** (231 878 B) and **175 B over the 233 000 B ceiling** |
| **B-5e** 12 h tick cost moved < 10 % | **PASS** | `tests/perf/bench.test.ts`, 3 interleaved repeats each: candidate 42.20 / 41.01 / 41.26 ms (median 41.26), base 40.76 / 41.73 / 42.04 ms (median 41.73) → **−1.1 %** (means 41.49 vs 41.51, −0.05 %). A single cold first pair read 48.83 vs 42.97 and is a warm-up artifact; the repeated medians are the reading to trust |
| No renderer / ui / string file touched | **PASS, one note** | `git diff --name-only b4e8321 5eb4be6` = 18 paths; `src/game/renderer/**`, `src/ui/**` and `src/game/content/strings.ts` are absent. Note: `tests/ui/resting-screen.test.tsx` is touched by this branch and is also in the UI-002 ownership list → a real overlap for the release engineer. Three more paths (`tests/simulation/chain.test.ts`, `fleet.test.ts`, `rate-window.test.ts`) are outside the declared Assignment-3 list; all four are expectation restatements, reviewed below |

## Reconciliation with the claimed evidence (confirm / refute)

| Claimed | My measurement at `5eb4be6` | Status |
|---|---|---|
| typecheck clean | exit 2, 23 diagnostics | **refuted** |
| vitest 47 files / 296 tests pass | 28 files / 283 tests, 1 file failed, exit 1 | **refuted** |
| validate 0 violations, behaviour line `firstDrone=268 firstResearch=478 tick=18298` | 0 violations confirmed; line is `314 / 498 / 18298` (268/478 is the base reading) | **partly refuted** |
| build ok | exit 2 (`npm run build`); only `vite build` alone succeeds | **refuted** |
| entry chunk 232 673 B against 233 000 B ceiling | 233 175 B → over ceiling by 175 B | **refuted** |
| head `4789d3a` | not present on `origin` or locally | **refuted / unverifiable** |

The two possibilities that fit: the reviewed evidence was captured on a tree that was never pushed, or it mixes base and candidate readings. Either way the pushed checkpoint is not the tested one.

## DEF-007 — the flagged follow-up

**Not reproducible at `5eb4be6`.** The tree has no `decodeRoute` (nor `decodeSim` / `encodeSim` / `emptyState` / `dismantleCost` / `GameState`); the only save decode is `decodeSave` in `src/game/persistence/save.ts`, which returns the parsed payload untouched, so `run` survives. My own cycle: encode a priced yard (1 762 B, sha `c301ce9b…`) → decode → `run = [0,6,12,18,24,30,31]`, `latency 14`, re-encode byte-identical, and `route.remove` afterwards returns **6** = `round(7 × 0.9)`. The offline worker receives the state by structured clone, so it keeps `run` too. Action: re-check DEF-007 against the real head when it is pushed; if it still stands there, the fix is one line in whatever decode path that head introduces.

## What I inspected with my own eyes

Two PNGs captured by me from this build via `scripts/capture.mjs` (playwright, 390×844 CSS / 410×884 device, organic session, no seeded state, source SHA `5eb4be6`, 2026-11-06):
- `docs/screenshots/latest-mobile.png` (candidate) vs the same instrument on the base tree — resting screen: chips `Scrap 10 · Ferrous 111 · Credits 30 · Store 900/900`, two-tier card, fleet line, two priced fork faces and the accent-filled Build primary. Both non-blank, geometry identical, no page error in either run.
- `docs/screenshots/latest-machine-mobile.png` — machine panel at phone size: `Measured Working 0 % · waiting for input 100 % · … · link 0 % busy`, `Upgrade · 50 credits`, `Dismantle`, 46 px faces, no overflow.

Commercial-quality read, candidly: the chrome still holds up at phone size and the change is invisible there — that is the problem. The priced object has no silhouette: link 1 and link 7 render as the same straight segment, so the 5-scrap difference a player paid is legible only as a smaller `Scrap` chip. The three most harmful visible defects in this lane remain (1) belts as featureless 2 px cyan straights with no tile count, (2) the amber cargo dot's speed changing per link with nothing on screen that explains it, (3) no price line beside the connection during/after the tap. All three are `g2` (presentation) work and none of them can be fixed by the numbers in this lane.

## Three most valuable follow-ups

1. **Make the gates green before anything else** (blockers, ~10 min): in `tests/simulation/belt.test.ts` import from the real modules — `../../src/game/simulation/commands` (`applyCommand`, `beltCost`, `beltRun`, `DOCK_TILE`, `YARD_COLS`), `…/simulation/types` (`createInitialState`, `manhattanRun(a,b,cols)` — 3 args, not 4), `…/simulation/engine` (`advance`), `…/persistence/save` (`encodeSave(sim,lastSeenMs,settings)`, `decodeSave`) — and match the shipped shapes: `SimState` not `GameState`, `applyCommand` returns `{ok, need, have, word}` not `{message, state}`, `route.price` does not exist (use `beltCost(route.run.length)`), `TUNING.linkLatencyTicks` → `routeLatencyTicks`, and the harness JSON is `{generatedBy, tuning, prices, layouts:{patterns:{<p>:{rows[],leaders}},leads,dropClause,mmg}, ladderRows, saves:{…}}` with no `summaries`/`hash`/`sums`.
2. **Recover the 175 B and re-print the delta** (blocker): behaviour-preserving trims that fit — use `manhattanRun` directly at the three call sites instead of the `tileIndexOf` + `beltRun` wrapper pair, collapse `refundOf(beltCost(n))` into one expression inside `dropRoute` (single call site besides `dismantleMachine`), and attach `tiles` inside the existing `dedupe` pass in `autoconnect.ts` instead of a second `plans.map` allocation. Re-measure the entry chunk after, not before.
3. **Then the two things a player can actually notice**: (a) `g2` should draw `route.run` as the polyline it is and print `tiles × beltCostPerTile` beside the connection, using the `tiles` that `planConnections` now carries — with a straight-line render the printed tile count will not match the drawn segment; (b) price the extent on `machine.move` too: today a move re-walks the run and changes latency (`[0,1]`→`[0,…,31]`, 4→14 ticks) while charging only `movePenaltyPct` of the build cost, so lengthening a belt is free and the original price silently goes stale. Also worth one line in the ledger: the 44 px/46 px faces and `scrollHeight == innerHeight` are untouched here (no `src/ui/**` diff), so UI-002's rows stay valid.

## Merge-note for the release engineer

`tests/ui/resting-screen.test.tsx` is modified by `rw/belt001-g1` (literal shortfall line `need 25 scrap` → `need 3 scrap`) **and** by `rw/ui002-g1` (`b5940c8` touches `src/ui/**`, `strings.ts`, `tests/ui/resting-screen.test.tsx`, `tests/ui/fork-ui.test.tsx`, `tests/ui/panel-rows.test.tsx`). Integrate in the order UI → belt or resolve deliberately: the belt assertion assumes the UI-002 card is unchanged in width but the *line content* comes from `strings.ts` keys that UI-002 also renames.

## Unverified dimensions

- Audio: nothing in this lane touches it; not listened to (no audio artifact in this candidate).
- `4789d3a` (claimed head) — unexamined, it does not exist on the remote at review time.
- Human comprehension of the priced connection (does a phone player understand why `Scrap` dropped by 7?) — not tested; only the simulated assertion in `tests/ui/resting-screen.test.tsx` covers the number's survival.
- Wall-clock frame timing on a real handset: the 12 h bench is headless node, not device rAF.
