# RW3D T17 — Starter economy, processors and first steel choice (#144)

- Issue: [#144](https://github.com/darkmatter2222/Rustwake/issues/144) `[RW3D][P1][T17]`
- Role: developer (one of three parallel children; confined to assigned write paths)
- Base: `480722b58e541a6324238e331bdb307984930423` (`origin/main`, accepted #140 logistics)
- Implementation head: `1b896e6` (helpers `7370200` + seeded suite `1b896e6`); final PR head adds this doc.
- Dependencies accepted: #133 world grid `ad8cde3`; #140 logistics `480722b5` (conservation precedent: every cargo unit in exactly one container; currencies reconcile to the ledger).
- Specs: `GAME_SYSTEMS.md`, `EXECUTIVE_CONTRACT.md`, `ACCEPTANCE.md` (E01/E06/U05), `AGENT_EFFICIENCY.md`.

## 1. Design decision and scope

The legacy simulation **is** the live game (`src/app/store.ts` imports `advance` /
`applyCommand` / `createInitialState`). The starter economy, the two first processors
(sorter, furnace), the first-steel export contract, the named upgrade fork
(speed/buffer/draw, STRAT-002/003) and the free slow recovery pulse (`manual.salvage`)
are **already implemented and accepted** under #140 and earlier milestones. The U05
before/after comparison surface also already exists (`src/ui/upgrade/model.ts`
`branchCards` + `UpgradeCompare.tsx`, which starts with `selected = null`).

Per `EXECUTIVE_CONTRACT.md` ("Preserve legacy evidence and reusable simulation"; "Never
simply delete failing correctness tests"), this issue is delivered as **additive,
cycle-free sim-layer helpers + a deterministic seeded evidence suite** that proves the
live starter economy meets E01/E06/U05, rather than a retune of the accepted economy.

### What changed (assigned OWN paths only)

- `src/game/simulation/commands.ts`
  - `upgradeComparison(s, machineId, branch?)` and `upgradePlans(s, machineId)`: actual
    before/after **cost / power / batch rate / input capacity** for one candidate level,
    computed from the same price ladder (`upgradeCost`/`branchPrice`) and the same
    `batchMilliOf`/`powerOf`/`inputCapacityOf` the engine runs. Reports only; selects nothing.
  - **Plan-selection guard** in `upgradeMachine`: a branch outside `UPGRADE_BRANCHES` is
    refused (`not-found`) before any credit moves. One command selects at most one named
    plan; the unnamed ladder selects none. Valid commands are byte-for-byte unchanged.
- `src/game/content/research.ts`
  - `researchComparison(s, node)`: actual before/after pulse scrap / input buffer / route
    capacity from `researchBonus`, plus price and gate status. Reports only; spends nothing.
- `tests/simulation/starter-economy.test.ts` (NEW): 33 seeded tests (section 3).

No change to `createInitialState`, `TUNING`, `BLUEPRINTS` costs, `RECIPES`, `plan.ts`,
`store.ts`, or any UI/shell/renderer file. No new `Command` variant (no store/UI ripple).

## 2. Acceptance mapping

| Criterion | Where proven |
| --- | --- |
| Starting seed buys first processors, leaves meaningful later fork | `starter affordance` describe: empty seed → sorter+furnace via free recovery; priced speed/draw fork with no dominating pick |
| Sorter/furnace power and buffers reconcile | `processor power and buffers reconcile` (power 1/2, buffers 12/12, sum ≤ yard capacity 8, `powerRatio` 1) |
| Free slow recovery prevents bankrupt deadlock; clicking cannot auto-select every plan | `E06` describe (zero-credit empty-store recovery + sell-back, wreck regen, reserve floor, filters) and `U05 clicking` describe (≤1 plan/command, unnamed selects 0, unknown branch refused) |
| Reproducible seed/state, expected/actual, real exit codes | every test boots `createInitialState()` + fixed script; vitest exit 0 (section 4) |
| Save/migration/recovery impact documented | section 5 |
| Independent reviewer + product on immutable head; visual inspection | handoff stamps PR head; non-vision role — numeric only, U05 visual fidelity PENDING at #151 (section 6) |

- **E01** (conservation across stock/input/batch/output/cargo/reserved/overflow; currencies
  reconcile): `expectConserved` snapshots `unitTotal` + `credits` before/after each of the 13
  lifecycle commands and asserts the delta equals the command's documented external
  source/sink. Cargo that only moves container (machine→store, route→store) nets to zero.
- **E06** (reserve floors + filters; no deadlock after discretionary funds consumed; slow
  recovery available): bankrupt-corner test drains credits and store, then free salvage +
  scrap sell-back restores `credits > 0`; `sellableAmount` keeps `reserveFloor` +
  `machineInputDemand`; route items always match their filter.
- **U05** (actual before/after cost/power/rate; two deliberate strategies + blind
  prominent-action from one seed; no universal auto-choice): speed-vs-draw dynamic divergence
  (rate vs power), blind unnamed characterization, and `upgradeComparison`/`researchComparison`
  numeric parity with the applied command.

## 3. Seed / state and expected / actual (representative)

All seeds boot from `createInitialState()` (`store {}`, `credits 0`, `wreck.remaining 30`).
`bootstrapChain()` = 6 free pulses (5 scrap each, 6-tick cooldown) → repair (30 scrap) →
advance 262 → build sorter (20 scrap, tile 8) + routes → advance 400 → build furnace
(10 scrap + 5 ferrous, tile 9) + routes → advance 900. `bootstrapToExport()` adds the export.

| Check | Expected | Actual |
| --- | --- | --- |
| 6 pulses → store scrap | 30 | 30 |
| first export credits | `exportContractCredits` = 30 | 30 |
| sorter / furnace power | 1 / 2 | 1 / 2 |
| E01 `machine.build` sorter Δunits | −20 | −20 |
| E01 `contract.export` Δunits / Δcredits | −3 / +30 | −3 / +30 |
| E01 `machine.upgrade` furnace speed Δcredits | −50 | −50 |
| E01 `machine.dismantle` spare Δunits | +`refundOf(20)` = +18 | +18 |
| E06 bankrupt corner after salvage | scrap 5, credits 0 | scrap 5, credits 0 |
| E06 after sell-back | credits > 0 | credits > 0 |
| U05 furnace speed before→after batch s | 4 → `ceil(40·10000/11)/10000` = 3.6364 | 3.6364 |
| U05 furnace draw before→after power | 2 → 1 | 2 → 1 |
| U05 sorter buffer Δinput | +6 | +6 |
| U05 speed vs draw batches (800 ticks, fed) | speed > draw | speed > draw |
| U05 unnamed branch after blind tap | `undefined` (0 named plans) | `undefined` |
| U05 cutters before→after pulseScrap | 0 → 2 | 0 → 2 |

Full per-command expected/actual is asserted in `tests/simulation/starter-economy.test.ts`.

## 4. Gate counts (real exit codes)

Baseline at `480722b5` and head at `1b896e6` (Windows Git Bash, `NODE_EXTRA_CA_CERTS` set):

| Gate | Baseline | Head | Exit |
| --- | --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | pass | pass | 0 |
| `npm run validate` (`tsx scripts/validate-content.mjs`) | 0 violations; behaviour tick 18298, machines 8, links 18, drones 4, batches 1838, credits 157 | identical (0 violations) | 0 |
| `npm test` (`vitest run`) | 83 files / 1114 tests | 84 files / 1147 tests (+1 file, +33) | 0 |
| `npm run build` (`tsc --noEmit && vite build`) | pass | pass (built 1.38s) | 0 |

The validate behaviour ladder is byte-identical to baseline, confirming the plan-selection
guard changed no valid-command trajectory. The frozen STRAT-002/003 and BELT-001 golden
mirrors (`tests/simulation/fork.test.ts` vs `work/feedback/*.json`) stay green.

## 5. Save / migration / recovery impact

- `SimState` shape is **unchanged**; `SCHEMA_VERSION` unchanged. No migration needed.
- `createInitialState`, `TUNING`, processor costs and recipes are byte-identical, so the
  pre-fork save checksum (`docs/evidence/yard-mature.json`, `eede3c4f`) and every existing
  save replay unchanged.
- The new helpers are pure readers; they add no persisted fields. The guard only rejects an
  invalid branch that no legitimate save or UI can produce (`UpgradeBranch` is a closed union).
- Recovery: the corrupt-boot / retry path (#191/#202/#203) is untouched.

## 6. Limitations and owed work

- **Non-vision role**: numeric checks only. The U05 comparison UI already renders
  before/after; any visual-fidelity certification is **PENDING at #151** (capable inspection).
  No UI file was modified, so no new visual surface is introduced by this PR.
- **Full `GAME_SYSTEMS.md` numeric alignment is blocked within the assigned write paths.**
  The spec's target starter seed (scrap 120 / ferrous 12 / steel 12 / credits 60, wreck 240,
  pulse 2-per-2s, dock 300, power 6, sorter 30 scrap + 4 steel, furnace 35 scrap + 4 steel,
  contract 10 steel → 50 credits) cannot be adopted here without editing non-owned gates and
  frozen evidence:
  1. `src/game/content/validate.ts` check #7 forbids steel in sorter/furnace `buildCost`
     (first processors must be payable from scrap/early outputs); check #10 requires
     `dockCapacity ≥ 900` (spec 300 impossible). `validate.ts` is a non-owned gate.
  2. `tests/simulation/plan.test.ts` (non-owned) pins an empty starting store via `yard()`
     adding to `createInitialState`.
  3. `tests/simulation/fork.test.ts` reproduces frozen STRAT/BELT golden rows
     (`work/feedback/*.json`) from `createInitialState` + current `TUNING`/costs; the fixtures
     **and** their generator scripts (`scripts/*.mjs`) are outside the write paths. Seeding any
     resource/credit/wreck diverges the mirrors.
  4. ~52 test files consume `createInitialState`.
  Adopting the spec numbers therefore needs a coordinated retune of `validate.ts`, `plan.ts`,
  the golden fixtures + generators, and the non-owned tests — a separate scoped issue. This PR
  preserves the accepted #140 economy and proves its starter guarantees, per the Executive
  Contract's evidence-preservation mandate.
- The prominent-action **connect** loop in `src/ui/App.tsx` (`runStep` commits every plan in
  one tap) is UI-layer, owned by peer #210, outside these write paths. The sim-layer guard and
  tests prove a single `machine.upgrade` command can never select more than one plan; the
  connect-loop UX is left to #210.

## 7. Reproduce

```bash
cd C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-144
export NODE_EXTRA_CA_CERTS=C:/Users/ryans/node-extra-ca.pem
npm run typecheck && npm run validate && npm test && npm run build
npx vitest run tests/simulation/starter-economy.test.ts   # 33 tests, exit 0
```
