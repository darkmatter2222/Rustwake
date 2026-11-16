# #214 — Retune starter economy to the GAME_SYSTEMS seed

- Issue: [#214](https://github.com/darkmatter2222/Rustwake/issues/214) (RW3D Round-28 economy retune)
- Role: developer (non-vision), coordinator-integrated
- Branch: `rw/214`
- Implementation head at capture: `c1c257687f1cfeb73f909024452c933a75a41f06`
- Base: `origin/main` `039a6c7addfe174ed1fd32c33d9fc62b78375f6a` (#150)
- Acceptance: **E01** (resource/credit conservation), **E06** (free slow
  recovery prevents bankrupt deadlock, including the spend-all-steel corner),
  and the **§23.2 behavioural ladder** (`validateBehaviour`, rounds=1800) green
  at `yardPowerCapacity` 6. Values-only save change; no schema bump.

This change implements the binding product-owner ADR posted on #214
(role=product-owner, 2026-11-14T15:54:48Z). Every clause below is mapped to the
implemented change and its verification. No clause was silently dropped.

## Scope of this change

Economy/simulation-side retune plus the UI/persistence consumers it touches.
Two disjoint workstreams were developed in parallel and integrated by the
coordinator into one branch before opening a single PR:

- **sim + game** (`rw/214`): seed, costs, prices, tuning, validation ladder,
  behaviour goldens and their generators.
- **UI + persistence** (`rw/214-ui`): `save.ts` progress-marker re-anchor and the
  `build-52` fixture drain that the new seed requires.

The two file sets do not intersect. The UI branch was folded in with
`git merge --squash` (linear history), then the combined branch was rebased onto
`origin/main`. Eight source files changed:

- `src/game/content/defs.ts` — build costs, export prices, TUNING.
- `src/game/content/research.ts` — cutters effect text.
- `src/game/content/validate.ts` — seed-aware checks #7/#10, shared ladder
  recovery helpers, `validateBehaviour` contract.
- `src/game/simulation/types.ts` — `createInitialState` seed.
- `src/game/simulation/commands.ts` — STRAT-003 power comment.
- `src/game/simulation/offline.ts` — `suggestedAction` steel threshold.
- `src/game/persistence/save.ts` — `SEED_CREDITS` progress re-anchor.
- `src/game/world/kit.ts` — C2 seed costs (P3-measured candidates).

Net diff vs base: **74 files, +7153/−5854** (implementation, re-pinned tests,
regenerated behaviour goldens + generators, capture harnesses, evidence).
three.js stays pinned **exactly `0.187.0`**; the frozen
`tests/renderer/boundary-3d.test.ts` is untouched. `runStep` connect logic is
**out of scope** (#210-owned) and unchanged.

## ADR clause mapping

### (a) Exact starter seed table — implemented

`createInitialState()` now seeds `{ scrap: 120, ferrous: 12, steel: 12 }`,
`storeUnits = 144`, `credits = 60` (was empty store / 0 / 0). Build costs and
prices retuned to make the seed meaningful:

| Item | Before | After |
| --- | --- | --- |
| sorter buildCost | 20 scrap | 30 scrap + 4 steel |
| furnace buildCost | 10 scrap + 5 ferrous | 35 scrap + 4 steel |
| EXPORT_PRICES ferrous | 2 | 1 |
| EXPORT_PRICES steel | 10 | 4 |
| manualSalvagePerPulse | 5 | 2 |
| manualPulseTicks | 6 | 20 |
| starterWreckPool | 30 | 240 |
| dockCapacity | 900 | 300 |
| yardPowerCapacity | 8 | 6 |
| exportContractSteel | 3 | 10 |
| exportContractCredits | 30 | 50 |

Preserved (ADR "KEEP"): `droneScrapPerSecond=1`, `droneDeliveryUnits=5`,
`droneDeliveryTicks=5*TICKS_PER_SECOND`, `fleetCap=5`, `droneAddBaseCost=45`,
`repairCostScrap=30`, `routeCapacity=24`, `routeLatencyTicks=5`.

Starter affordability is asserted, not assumed: sorter + furnace = 65 scrap +
8 steel ≤ seed (120 scrap / 12 steel). Verified by validate check #7 and
`tests/simulation/starter-economy.test.ts:150`
(`expect(seed.store).toEqual({ scrap: 120, ferrous: 12, steel: 12 })`).

### (b) CONFLICT 1 — dockCapacity 300, validate #10 seed-fit floor

`dockCapacity` is 300 (not the old 900 floor). Validate check #10 no longer
asserts a hardcoded 900; it asserts a seed-fit floor:
`dockCapacity >= seedUnits + 60 * droneScrapPerSecond` = 144 + 60 = **204**.
300 passes. The dock still holds the seed plus a minute of drone intake.

### (c) CONFLICT 2 — steel costs stay; seed-aware validate #7; price coherence

Steel build costs are retained (sorter/furnace each 4 steel). Validate check #7
seeds `available` from `createInitialState().store` keys (scrap, ferrous, steel)
rather than a hardcoded `["scrap"]`, so starter affordability is measured
against the real seed. Export-price coherence: the contract pays 50 credits for
10 steel = **5 cr/steel**, while the baseline steel export price is **4 < 5**, so
the contract remains the better sink. Ferrous 2→1 keeps it a low-value bulk.

### (d) Consumer audit and golden regeneration

1. **cutters text** — `research.ts` effect now reads "One cutting pulse gives 4
   scrap instead of 2." (cost=4 unchanged; `researchBonus.pulseScrap` stays +2).
2. **offline suggestedAction** — `offline.ts` threshold
   `(s.store["steel"] ?? 0) >= TUNING.exportContractSteel` (was hardcoded `>= 3`).
3. **commands comment** — STRAT-003 comment updated to the yard's 6 power units
   (logic unchanged).
4. **freshYard / fork helpers** — regenerated, not hand-edited.
5. **plan.test emptyYard** — re-pinned to the seeded yard.
6. **fork STRAT/BELT goldens** — regenerated deterministically and their
   generators committed (no hand-edit, no silent delete):
   `scripts/probe-belt.mjs` writes `work/feedback/belt001-harness.json`
   (line 37 `TARGET`, line 519 `writeFileSync`); `scripts/probe-cadence.mjs`
   regenerates `docs/evidence/2026-11-03-cadence.md`;
   `work/feedback/strat002-harness.{json,mjs}` regenerated.
7. **~52 consumers audited (E01/E06/U05)** — including the E06 spend-all-steel
   corner: `tests/simulation/starter-economy.test.ts` builds sorter 4 + furnace 4
   + spare sorter 4 = the seed's entire 12 steel, asserts `refundOf(4) = 4`
   (90% refund rounds back to full 4), dismantles the spare to recover 4 steel,
   and re-earns the 10-steel contract **from ferrous alone — no steel source was
   added**. No true deadlock was found; nothing was escalated.
8. **validateBehaviour ladder green at power 6** — rounds=1800 (not raised);
   power was **never** reverted to 8. Behaviour sim reports 0 violations.
9. **C2 kit costs** (P3-measured tuning candidates, unlocks ratified):
   crane 25scrap+6steel+0cr → **40scrap+10steel+20cr**;
   turret 20scrap+5steel+15cr → **30scrap+6steel+25cr**;
   wall_gate 10scrap+2steel+0cr → **15scrap+3steel+0cr**.
   Warehouse/depot/generator already matched the seed and are unchanged.
10. **runStep connect** — out of scope (#210-owned); untouched.

### (e) Saves — values-only, no schema bump

No save shape or migration change. The pre-fork checksum **`eede3c4f`** stays
green at `belt.test.ts:484`, `fork.test.ts:374`, `registration-100.test.ts:462`.
The ACCEPTANCE **OPENING** fixture (ACCEPTANCE.md:53, "starter seed and economic
state in GAME_SYSTEMS") must equal this seed; that equality is a **G1 #151**
acceptance obligation and is owed to capable review, not self-certified here.

## UI / persistence consumers (second workstream)

- `save.ts:465` `const SEED_CREDITS = createInitialState().credits;` and
  `save.ts:481` `if (Number.isSafeInteger(sim.credits) && sim.credits >
  SEED_CREDITS) return true;` (was `sim.credits > 0`). Re-anchors the credits
  progress marker to the seed (60) so a fresh, seeded yard is no longer read as
  "progressed". This resolves `home-62` (8) and `settings-62` (7) with **zero
  edits to those test files**.
- `tests/ui/build-52.test.tsx:124` `poorMatureStore()` drains the stocked seed
  (`store = { scrap: 0, ferrous: 0, steel: 0 }; storeUnits = 0; advance(state,1)`)
  to preserve the test's "empty-handed" premise. All assertions preserved
  (affordable=false, "Need 30 scrap · have 0", Place disabled, salvage recovery).
  Furnace re-pin: scrap delta 35, steel delta 4. No assertion was weakened.

## B-21 cadence re-characterization (not a weakening)

`tests/simulation/cadence.test.ts` previously pinned "order is immaterial" — an
**emergent characterization** of the old balanced numbers, not a spec acceptance
criterion. Under the retuned seed the two upgrade orders converge to different
credit totals, so the test was re-characterized to the measured behaviour while
**preserving and strengthening reachability**:

- ROUNDS=1800; `runOrder` mirrors the shipped `nextYardStep` (upgradeFirst knob);
  boots at the tutorial milestone; uses the shared ladder-recovery helpers.
- Pins: first.totals=1910 / second.totals=1850; first.credits=75 /
  second.credits=145; first.ambiguous=96 / second.ambiguous=32.
- **Both** first AND second now assert machines===8 / fleet===5 / research===3
  (strengthened — previously only one order was checked for full yard).

Coordinator decision recorded in issue comment 6883973806. No spec mandates
order-independence; both orders still reach the full yard.

## Gates (real exit codes, run in `rw-214` at head `c1c2576`)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| typecheck | `npx tsc --noEmit` | 0 | clean |
| validate | `npx tsx scripts/validate-content.mjs` | 0 | 15 resources / 8 blueprints / 12 recipes / 3 research; content 0 violations; behaviour firstDrone=7 firstResearch=705 tick=18382 machines=8 links=18 drones=5 batches=1910 credits=75 nodes=3 — 0 violations |
| test | `npx vitest run` | 0 | **400 suites / 1376 tests passed, 0 failed** |
| build | `npm run build` | 0 | built in 1.44 s; pre-existing >500 kB chunk warning only (index 839.58 kB, vendor 141.66 kB) |

No gate was tuned, skipped or weakened. The §23.2 behavioural ladder
(`validateBehaviour`, rounds=1800) is green at `yardPowerCapacity` 6.

## Integration and mechanical-rebase proof

The two disjoint green workstreams were integrated with `git merge --squash`
(combined head `4979194`), then rebased onto `origin/main`. Mechanical
equivalence was proven with:

```
git range-diff 89db232..4979194 origin/main..c1c2576
```

All **25 commits report `=`** — each commit's patch is byte-identical across the
rebase (absolute trees differ only because the base advanced, as expected). The
rebase paused once at the final UI pick; the patch was confirmed to apply
cleanly (`git apply --check`, 20 files) and `git rebase --continue` completed it.
No work was lost. Final head `c1c2576` carries the `SEED_CREDITS` fix (verified
present) and all four gates green.

## Save / migration impact

Values-only. No save shape, migration or schema-version change; checksum
`eede3c4f` green. Existing saves, cancellation, approval settings and security
paths are untouched. The only persistence edit re-anchors a progress *marker* to
the seed so a fresh yard is not misread as progressed.

## Limitations / pending review

- Non-vision agent: numerical/conservation/behavioural evidence only. **Capable
  visual + economic-play inspection PENDING at architecture G1 (#151)** — this
  evidence cannot self-certify that the retuned economy *feels* right.
- The ACCEPTANCE OPENING fixture must equal the seed at G1 #151 (owed, not
  self-certified here).
- C2 kit costs are P3-measured tuning candidates (unlocks ratified); final
  balance is owed to P3 measurement.
- Independent QA and product verdict on the immutable PR head `c1c2576` are
  required before merge; no self-acceptance.