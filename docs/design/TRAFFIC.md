# Freight traffic separation (#589)

Status: implemented on `rw/589-traffic` (base main `956a47066b227140431e0e33046b0683eb5be40e`), draft→ready PR #592. Evidence suite head `4f2281a93722bef34a865c5535fada5fdb95dc6c`; the gate binds the FINAL head recorded in PR #592 and the DEV handoff on issue #589. **Branch evidence is not a production release.** Sponsor G1 visual acceptance (#276) is owed on the deployed build; #276, #567 and #552 stay OPEN.

## Why this exists

The sponsor visually REJECTED the deployed build: freight movers interpenetrated ("It's really nasty"). The defect was structural — `moveVehicle` interpolated every truck along road-cell CENTRES and never read another vehicle, so any two trucks sharing a cell rendered inside each other. Measured at the base `956a4706` with the square-envelope ruler (`traffic.js envelopeGapWorld`): a zero-input fresh yard reaches **-2.05 world** pairwise gap (full envelope coincidence) at tick 102, pair [1,3]. The overlap was not an edge case; it was the default.

This doc describes the model honestly, including where the original deadlock argument was WRONG and what recovery can and cannot prove.

## The model (src/traffic.js + src/simulation.js)

1. **Right-hand lane offset.** Each cell-centre route is rebuilt as a miter-joined offset polyline, `LANE_OFFSET_CELLS = 0.35` to the truck's right of travel. Axis-aligned 90° turns use the exact miter point `P + (r_prev + r_next) * L`; straights keep the single offset. Opposing traffic passes on its own side: lane centres 0.7 cells = 2.45 world apart. The offset is sized for the SQUARE envelope below (needs 2·HALF_LONG + GAP = 0.6714 cells), margin 0.1 world. The earlier 0.25 offset falsely queued opposing traffic (measured 1 arrival / 200 s vs 4 at base).
2. **Square conservative envelope.** Half-extents `HALF_LONG = 1.025 / CELL` on BOTH axes, containing the real oriented 2.05 × 1.2 body. An oriented envelope swaps its long axis at every corner, so "clear now" can become "interpenetrating" when a parked truck's heading flips (measured 0.125 world near-miss). The square never changes with heading or progress: clear now stays clear. Conservative: square-gap ≥ MIN_GAP implies the visible bodies keep ≥ MIN_GAP.
3. **Ordered current-envelope clamp.** `advanceGame` integrates the fleet in deterministic ASCENDING id order. Before committing a substep, `separationClamp` analytically clamps progress along the motion axis against every other truck's CURRENT envelope inflated by `GAP = MIN_GAP_WORLD / CELL` (`MIN_GAP_WORLD = 0.3`). A lower-id blocker has already moved; a higher-id blocker's own clamp keeps it out of our envelope. End-of-substep pairwise gap ≥ GAP in either case. Sweeping the blocker by a full step (the earlier design) inflated following distance ~16× and gridlocked the sparse network (measured 92% throughput loss) — do not reintroduce it.
4. **Corner turn gate.** Before flipping heading at a corner, `turnClear` probes the outgoing envelope against every neighbour; the truck waits at the corner in its proven-clear incoming orientation until the turn clears.
5. **Join hold + reservation.** Starting a route snaps the truck to the lane start; that snap is not integrated motion and can land inside a neighbour (measured -1.61 world overlap). `joinBlocker` gates the snap: the truck HOLDS (waiting/blockedBy) until the start is clear. Freight is nonetheless RESERVED at `assignJob` (see C-2 below).
6. **Honest queue state.** A clamped truck records `v.waiting` / `v.blockedBy` / `v.waitTime`; it resumes from its clamped progress when the blocker clears — no reset, no lost cargo. Idle trucks clear these flags so stale waitTime cannot fire premature recovery on the next job.
7. **Bounded recovery.** Continuously blocked past `WAIT_TIMEOUT_SECONDS = 10`, a truck attempts `rerouteAroundBlocker`: obstacle BFS around the blocker's cell, new lane start separation-checked against EVERY truck before commit. Freight (source/dest/phase/cargo) is untouched; only `j.route` changes. Last resort for a jobless bay blocker: after the same timeout, a `toDest` mover within 2 cells of the route end whose idle blocker is within 1 cell of it completes the position-independent, fully validated ARRIVAL ledger transition at the clamped position (the bay-queue rule; deliberately NOT applied to pickup, whose phase flip re-joins the departure lane at the blocker's parked position — measured -1.61 world overlap + thrash).

## The deadlock argument was FALSE as originally stated

The original claim — "forward-only yielding is acyclic, therefore deadlock-free" — holds ONLY for same-direction following edges (they run downstream along a lane). Perpendicular CROSSING traffic at a saturated intersection can form a mixed following/mutual wait-for cycle: following edges feed into mutual conflicts that id tie-breaks order but do not dissolve when every truck in the cycle is blocked. Measured by the predecessor: three trucks gridlocked the depot approach. The id tie-break gives right of way, not progress: the winner can itself be blocked downstream.

Recovery is therefore REQUIRED, not optional. Proof it is load-bearing (tests/trafficSeparation.test.mjs, detour fixture): a dry yard gives the dispatcher no candidates, so an idle truck parked mid-route never moves; the loaded mover clamps behind it. With recovery disabled in a scratch copy (`WAIT_TIMEOUT_SECONDS = 1e9`, instrumentation only, repo src untouched): **0 arrivals / 0 delivered, mover stalled at (7.329, 8.35), waitTime 60 s, blockedBy 2 — permanent starvation.** With recovery: exactly 1 reroute, 1 arrival, 5 delivered, conservation every tick.

## The C-2 storage-4 latch (measured CI failure and fix)

At intermediate head `36e3fb5`, ubuntu CI run `44431585810` FAILED gate C-2: `storage-4 latched on the untouched yard (pre-fix fired from t=45)`. Cause: deferring the freight reservation until the lane start was physically clear left full bays with no committed truck, so `storageAlarms` saw an unserved bay and latched. Fix (checkpoint `90a98d6`): reserve at `assignJob` immediately — the reservation is what storageAlarms reads — while the physical join HOLDS in `moveVehicle` until the start is clear; the bay-queue early arrival is timeout-gated (early arrival on continuous-work yards perturbed dispatch timing and re-latched the alarm); idle flags cleared on job loss. Push CI run `44433701174` at `90a98d6`: SUCCESS. `tests/dispatchGate567.test.mjs` thresholds were never touched.

## Measured evidence (numeric; NOT visual acceptance)

Ruler: this checkout's `envelopeGapWorld` for both revisions. Base = `git archive 956a4706 src` extracted to scratch, identical fixtures via `scripts/measure-589-traffic.mjs` (modes collision / fresh / multi / detour). Raw outputs: `docs/evidence/589-traffic/`.

| Fixture | Base min gap | Head min gap | Base arrivals / delivered | Head arrivals / delivered |
|---|---|---|---|---|
| collision (head-on, 10 s) | **-2.05 world** (tick 5, full coincidence at x=12) | **+0.4 world** | 2 / 10 | 2 / 10 |
| fresh yard, zero input, 660 s | **-2.05 world** (tick 102, pair [1,3]) | **0.3000000023** (tick 100, pair [1,2]) | 43 / 2778 | 42 / 2639 (95.0%) |
| multi-carrier, 200 s | **-2.05 world** (tick 15) | **0.3000000035** | 4 / 47 | 4 / 47 |
| detour gridlock, 60 s | no recovery: 0 arrivals, permanent stall | **0.3000000035** | — | 1 / 5, exactly 1 reroute |

### #596 density + origin rows (base = `63b9f405`, head = `40becd4d`)

The four rows above use base `956a4706` (pre-#589). The #596 rows below use base origin/main `63b9f405` (already carries #589 separation, 3 hardcoded trucks, NO origin recovery) vs PR #608 head `40becd4d`; ruler = HEAD `envelopeGapWorld` for BOTH revisions (same protocol as #592). Raw outputs: `docs/evidence/596-fleet/`. Byte-identity proof that the extended measure script did not drift the legacy four modes: `ruler-proof.txt` (main unmodified script vs extended, identical fixtures, identical bytes).

| Fixture | Base min gap | Head min gap | Base arrivals / delivered | Head arrivals / delivered |
|---|---|---|---|---|
| fleet L1 (3 trucks), 200 s | **0.3000000035** | **0.3000000035** | 4 / 47 | 4 / 47 |
| fleet L4 (6 trucks), 200 s | **0.3000000035** (1 truck starves, waitTime 179.5 s, blockedBy 5) | **0.3000000035** (0 waiting) | 3 / 42 | 4 / 47, 1 sidestep |
| fleet L10 (12 trucks, cap), 200 s | **0.3000000035** (1 truck starves) | **0.3000000035** (0 waiting) | 3 / 42 | 4 / 47, 1 sidestep |
| origin-cell join-hold, 60 s | 0.225 held pair; **0 arrivals**, waitTime 60, blockedBy 2 | 0.225 held pair; post-commit ≥ 0.3 | 0 / 0 | 1 / 5, 1 sidestep (1.680029761641144 cells) |

- **No overlap regression at density:** min gap is 0.3000000035 (≥ `MIN_GAP_WORLD` 0.3) at 3, 6 AND 12 trucks in BOTH revisions. A higher fleet does not reintroduce the sponsor's overlap.
- The 0.225-world origin pair is the pre-existing HELD park pair (limitation 3), present at tick 0 in both revisions — NOT a density regression and NOT repaired by #596.
- Negative control (`origin-norecovery.json`): head src with `WAIT_TIMEOUT_SECONDS = 1e9` reproduces the base stall (0 arrivals, recoveryCommits 0, waitTime 60, blockedBy 2); `origin-control-failure.txt` captures the B1 assertion failing `head dissolves the origin hold` 0 !== 1 (exit 1, non-vacuous).
- Timing (µs/step, single-run wall clock, O(n²) shape for #514): 3 trucks base 50.299 / head 55.762; 6 base 154.782 / head 105.139; 12 base 298.481 / head 183.763.
- The collision and fresh-yard gap assertions FAIL at the base numbers — the tests are not vacuous.
- Throughput does not collapse: 42 vs 43 arrivals, 2639 vs 2778 units (95.0%) over 660 s; multi identical.
- Determinism: same seed ⇒ byte-identical trajectories AND queue attribution every tick for 120 s, including across `persist`/`readGame` at t=60 s.
- Freight integrity: per-tick conservation in collision/multi/detour; ROUTE_BLOCKED / SOURCE_MISSING / JOB_MISSING guards return units exactly once under the new integrator.
- Reroute displacement: largest single-tick relocation measured **0.7732782 cells = 2.706 world** (clamped position (7.3286, 8.35) → detour lane start (7, 7.65), tick 19). Test bound ≤ 1.0 cell (3.5 world). It is a recovery snap, not integrated motion, and is separation-checked before commit (the gap invariant holds on the reroute tick). No oscillation: exactly 1 commit, then flow; fresh/multi yards commit 0 reroutes in 660 s / 200 s.

## Known limitations (honest, unresolved)

1. **Origin-cell blocker recovery is BOUNDED, not universal (repaired in #596, PR #608).** If an idle blocker sits on the route's ORIGIN cell, `cur === avoid cell` and the obstacle BFS cannot route around it; the join-hold then starves the mover. #596 adds `originSidestep` (departure) and `recoverDeparture` (pickup-flip): enumerate road cells at Manhattan distance 1..R (`ORIGIN_RECOVERY_RADIUS_CELLS = 3`) in deterministic (distance, x, z) order, skip the idle-park avoid set, and commit the FIRST route whose lane start clears every envelope by `MIN_GAP_WORLD`. The physical snap is bounded to R+1 = 4 cells; the attempt is gated behind `waitTime >= WAIT_TIMEOUT_SECONDS = 10` and a per-job budget of `ORIGIN_RECOVERY_MAX_TRIES = 3` tries reset by `assignJob`. The commit is ROUTE-ONLY — freight/phase/endpoints untouched (the pickup flip snaps to the new lane start via `pickupCargo`, never teleports on the commit itself). MEASURED (origin mode, base origin/main `63b9f405` vs head `40becd4d`, ruler = HEAD `envelopeGapWorld` for both): base **0 arrivals / 60 s, waitTime 60, blockedBy 2**, mover frozen at the bay (7, 9); head **1 arrival / 5 delivered**, exactly 1 sidestep commit at t=10 s, displacement **1.680029761641144 cells = 5.880104 world** (≤ R+1). Negative control: head src with `WAIT_TIMEOUT_SECONDS = 1e9` reproduces the base stall exactly (0 arrivals, waitTime 60, blockedBy 2); the B1 head assertion fails `head dissolves the origin hold` 0 !== 1 (`docs/evidence/596-fleet/origin-control-failure.txt`). **This is bounded effort, NOT universal deadlock-freedom** — the original acyclicity claim was FALSE (see above); perpendicular crossing traffic can still form a wait-for cycle (test B9 pins a 3-truck ring that STILL deadlocks at head, 0 arrivals, budget exhausted at 3). The pre-existing 0.225-world park pair in the origin fixture stays HELD, not repaired (limitation 3). Rare in play: it requires a job to persist while the yard has NO dispatch candidates (candidates are global, so a dispatchable yard frees the blocker). Evidence: `docs/evidence/596-fleet/`.
2. **Displacement bound is empirical.** 0.7733 cells is the measured worst across these fixtures, not an exhaustive supremum; `nearestRoad` rounding could in principle produce a larger snap. The separation check before commit bounds the SAFETY of any snap regardless of size; the ≤ 1.0 cell test bound covers the exercised paths.
3. **The clamp prevents new overlap; it does not push apart pre-existing overlap.** Manually constructed sub-gap initial states (e.g. the origin-cell fixture above parks 0.225 world apart) are held, not repaired. Normal play never produces them: fresh-yard spawns are 1 cell apart and every join/reroute/arrival is gated; the 660 s zero-input sweep confirms min 0.3000000023.
4. **Fleet grows via a depot-only capacity sink (#596, PR #608), no longer hardcoded.** `createGame` still ships exactly 3 trucks and a legacy level-1 save reloads with exactly the same 3; `readGame` NEVER spawns — it sanitizes depot `level` to 1..`DEPOT_MAX_LEVEL` (10) and `v.recoveryTries` to 0..3, and clamps an over-cap fleet to 12 (returning freight exactly once). The cap derives from persisted `b.level`, no new ledger: `fleetCapOf(level) = min(3 + (level - 1), 12)` — 12 at level 10. `upgradeDepot` is the ONLY spawn transaction, one atomic idempotent kind-tagged command (`depotUpgrade`) with snapshot/rollback at four fault seams; every reject path moves no stock, no level, no fleet. Costs (`depotUpgradeCost`): L2 {credits 600, steel 30}, L3 {credits 1100, steel 55, gears 15}, L4+ linear ladder credits `600+500*(L-2)`, steel `30+25*(L-2)`, gears `15*(L-2)` from L3 (L10 = credits 4600 / steel 230 / gears 120). This is a CAPACITY sink, NOT production: the depot outputs `{}` and level 1 vs level 10 yards deposit IDENTICAL totals over the same run (test B2 tripwire in `tests/fleetExpansion.test.mjs`). Spawn clearance is re-validated at commit: first road cell within `ROAD_REACH` (3) of the bay in (Manhattan distance, key) order whose centre clears every live envelope by `MIN_GAP_WORLD`, else `NO_SPACE` with zero spend. MEASURED density (fleet mode, 200 s, base `63b9f405` vs head `40becd4d`, identical fixture construction, ruler = HEAD `envelopeGapWorld` for both): min gap stays **0.3000000035 >= 0.3 at 3, 6 AND 12 trucks in BOTH revisions — a higher fleet does NOT reintroduce overlap** (no regression against the sponsor's complaint). Base starves one truck at L4 (6) / L10 (12): waitTime 179.5 s, blockedBy 5, phase toSource, 3 arrivals / 42 delivered; head recovers with ONE bounded sidestep: 4 / 47, maxWait 0, waitingAtEnd 0, displacement 2.0303940504246953 cells = 7.106379 world (≤ R+1 = 4). Timing quantifies the O(n²) pairwise clamp (#514, still OPEN): mean ~50.3 (base) / 55.8 (head) µs/step at 3 trucks, ~154.8 / 105.1 at 6, ~298.5 / 183.8 at 12 — single-run wall clock, a growth SHAPE, not a perf budget. Honest open items: truck MANUFACTURING #280 (sequenced BEHIND this capacity sink — #596 buys fleet CAPACITY from existing depot levels, it does NOT add a truck-production building or duplicate #280), spatial partition #514 (the O(n²) clamp above), pedestrians/forklift/drone #590 (merged separately). Evidence: `docs/evidence/596-fleet/`.
5. **Numbers are not pixels.** Nothing here certifies the sponsor's on-screen overlap complaint is settled. That is G1 (#276) on the deployed build, reviewed by the sponsor, after release-engineer merge and live SHA verification.

## Reproduce

```
node --test tests/trafficSeparation.test.mjs tests/trafficLiveness.test.mjs
node scripts/measure-589-traffic.mjs src 10 collision
git archive 956a4706 src | tar -x -C <scratch>     # base extraction
node scripts/measure-589-traffic.mjs <scratch>/src 10 collision   # BEFORE value
node scripts/measure-589-traffic.mjs src 660 fresh
node scripts/measure-589-traffic.mjs src 60 detour

# #596 density + origin (base = git archive 63b9f405 src; ruler = HEAD traffic.js)
node scripts/measure-589-traffic.mjs src 200 fleet 1            # 3 trucks
node scripts/measure-589-traffic.mjs src 200 fleet 4            # 6 trucks
node scripts/measure-589-traffic.mjs src 200 fleet 10           # 12 trucks (cap)
node scripts/measure-589-traffic.mjs src 60 origin              # origin join-hold
node scripts/measure-589-traffic.mjs <scratch>/src 200 fleet 4  # BEFORE value
node scripts/measure-589-traffic.mjs src 200 multi 4 timing     # µs/step opt-in
node --test tests/fleetExpansion.test.mjs tests/trafficOriginRecovery.test.mjs
```

Ruler-drift guard: with no `fleetLevel`/`timing` argument the four legacy modes emit byte-identical JSON to the unmodified main script (`docs/evidence/596-fleet/ruler-proof.txt`). The base for #596 rows is extracted with `git archive 63b9f405 src | tar -x -C <scratch>` and measured with THIS checkout's `envelopeGapWorld` (place the main script under `<scratch>/scripts/` with `<scratch>/src/` = head src so both resolve the identical ruler).
