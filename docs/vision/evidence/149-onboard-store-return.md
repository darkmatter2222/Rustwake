# #149 — Contextual onboarding, storage trade and return summary (U05 / U06 / E12)

- **Issue:** [#149](https://github.com/darkmatter2222/Rustwake/issues/149) `[RW3D][P1][T22]`
- **Role:** developer (one child under the coordinator; no delegation)
- **Branch:** `rw/149`
- **Base:** `origin/main` = `e6e7abf44c29e270830352f10cfec5ec6067d269` (the #214 starter-economy retune; built ON TOP, not reverted)
- **Implementation head (gated):** `f9787eb43af645c85d2ef682beb760e331394be0` — the 3 test files + relocated probe. Gates were run once on this tree.
- **Evidence commit / PR head:** adds this file only (`docs/vision/evidence/`, outside every gate input — tsc / vitest / build / validate-content do not read it), so the gated tree and the final PR head are gate-identical. The full PR-head SHA is recorded in the role-stamped PR/issue comment.
- **Retuned #214 seed used by every fixture:** `createInitialState()` = store `{ scrap: 120, ferrous: 12, steel: 12 }`, `credits 60`, `storeUnits 144`, `reserveFloor 10`, `sellBatchCap 60`, `exportContractSteel 10`, `exportContractCredits 50`.

## Owned paths

| Path | Change |
| --- | --- |
| `tests/ui/store-149.test.tsx` | NEW — 9 tests. U06 storage trade over the opening seed. |
| `tests/ui/onboard-149.test.tsx` | NEW — 7 tests. U05 contextual lesson ladder + characterized #214 vacuity. Removed an unused `memoryStorage` helper that broke `tsc` (TS6133); **no assertion or behavior changed**. |
| `tests/ui/return-149.test.tsx` | NEW — 11 tests. U06 return summary (pure `deriveReturn` + painted `ReturnReportPanel`). |
| `tests/ui/return-149.probe.mts` | NEW — committed evidence tooling, relocated from root scratch `probe-149b.mts`; imports fixed `./src/...` → `../../src/...` (matches `return-61.probe.mjs`). Prints each fixture's settled bottleneck + resolved label + reconciled deltas. |
| `docs/vision/evidence/149-onboard-store-return.md` | NEW — this file. |

**Save / migration / recovery impact = NONE.** This change is tests + probe + evidence only — **zero `src/` edits** (`git diff --stat -- src/` empty). Every surface was verified already-correct against the engine's own commands and the read-only catch-up; no product code, save schema, migration or recovery path was touched. `src/game/simulation/engine.ts` is **read-only and unchanged**: the inherited #214 trade-lesson gate vacuity (below) is shared core, escalated at #214, not a #149 defect, so the minimal-fix allowance was not exercised.

## Gates (run once at the implementation head above)

| Gate | Command | Exit |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | **0** |
| Content | `npx tsx scripts/validate-content.mjs` | **0** |
| Suite | `npx vitest run` | **0** — 106 test files / **1438 tests** passed |
| Build | `npm run build` | **0** — built in 1.61s (pre-existing >500 kB chunk-size warning, not an error) |

No perf-flake: `tests/perf/bench.test.ts:87` passed on the single run; the pre-authorized rerun was not needed. No assertion was weakened, skipped or deleted.

**#149 test counts:** `store-149` 9 · `onboard-149` 7 · `return-149` 11 = **27** new tests, all green.

## Acceptance clause map

### U05 — contextual onboarding tied to the real objective (`onboard-149`, 7 tests)

| Clause | Seed / state | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| Lesson ladder follows the engine-driven journey | `createInitialState()` then only engine commands (6 manual pulses → repair → first delivery → build sorter → connect) | `lessonFor` paints tutorial-0…5 in step with the real objective; never a forced counter | tutorial-0/1/2 salvage → 3 storage → 4 build → 5 connect → 8 upgrade, each at the real stage | PASS |
| One goal, two surfaces | every stage above | `lessonFor(s).what === objectiveFor(s)` verbatim | equal at every tutorial-N / yard-* stage | PASS |
| No universal next/advance button | opening-seed coach + progressed-yard coach (painted `App`) | only action face is Skip; "next" is a `<p>`, never a ladder control | `coachButtons() === [skipAria]`; no /next\|advance\|continue\|forward/; `.onboard__next` is `P` | PASS |
| Progressed yard led by current state | mature yard, then `tutorial=9`, then `data:12` | research-path lesson while Research locked; yard-* ladder once Data unlocks | `research-path` (what = `ONBOARD_COPY.researchGoal`) → `yard-*` (what = `objectiveFor`) | PASS |
| #214 trade-lesson vacuity characterized | opening seed, steel held 0 then first steel | gates 6→7→8 collapse in one sync pass; tutorial-7 never paints naturally | rests at 6 with steel 0; first steel jumps straight to 8 (truthful pin); purse can't reach 0 (upgrade 30+35=65>60, drone 45>30) | PASS (characterized) |
| Trade lesson correct & reachable | save held at `tutorial=7`, `credits=0` | `lessonFor` paints tutorial-7 / trade, what = export objective | tutorial-7 / trade, `researchPath=false`, what = `objectiveFor` | PASS |

### U06 — storage trade desk (`store-149`, 9 tests)

| Clause | Seed / state | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| Dearest-first faces, engine ceilings | opening seed, `exportClaimed=true` | faces steel/scrap/ferrous; sellable 2/60/2; price 4/1/1 | `tradeFaces` = [steel,scrap,ferrous], sellable [2,60,2], price [4,1,1]; `sellableAmount` scrap 60 (capped), ferrous/steel 2 (reserve 10) | PASS |
| Exact proceeds painted | opening seed | sell labels 2×4=8, 60×1=60, 2×1=2; preview/facts lines | painted labels/previews/facts equal `proceedsLine`/`factsLine` | PASS |
| Reserve floor protects yard | ferrous held 12, request 12 then 2 | clamp to 2, refuse 12; valid sell leaves reserve 10 | over-request `data-valid=false`, disabled, 0 sent; sell 2 → ferrous 10, credits 62 | PASS |
| Batch cap 60 | scrap held 120, request 999 then 60 | clamp to one 60 batch | 999 refused; sell 60 → scrap 60, credits 120 | PASS |
| `selectQty` reasons | sellable 2 / 0 | ok/empty/nan/low/high classification | every entry matches (`undefined→ok`, `""→empty`, `abc/-1/3.5→nan`, `0→low`, `5→high`, `2→ok`; zero ceiling `→low/high`) | PASS |
| Locked yard gate | `tutorial=9`, `exportClaimed=false` | no trade cards, gate note | `tradeFaces=[]`, no card, `STORE_COPY.tradeLocked` shown | PASS |
| First-steel contract gate | opening seed, `contract.export` | pays 50, spends 10 steel, unlocks selling | credits 110, steel 2, `exportClaimed=true`; faces drop steel (2<10) | PASS |
| Exactly-once payment | replayed `contract.sell` id | deduped, paid once | first credits 68 / steel 10; replay `ok` no-op, credits 68 / steel 10 | PASS |

### U06 — return summary (`return-149`, 11 tests; probe `return-149.probe.mts`)

Reproducible seeds = the probe fixtures, settled with `catchUp(s, T0, T0 + 600*TICK_MS)` (`T0 = 1_700_000_000_000`), a brief 600-tick window (fully credited, uncapped). `deriveReturn` resolves each bottleneck via `t(\`bottleneck.${id}\`)`; the painted `ReturnReportPanel` shows the label + one focus-and-fix sentence and a single resume action, never a reset/claim.

| Fixture (seed) | Bottleneck | Expected label | Actual label | Deliveries | Batches | Gains | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| storage-full: `store{scrap:300}`, units 300 | `storage-full` | Storage full | Storage full | 0 | 0 | {} | PASS |
| power-limited: 4 furnaces, `store{scrap:200,ferrous:200,steel:40}`, advance 120 | `power-limited` | Power limited | Power limited | 0 | 44 | {steel:44} | PASS |
| starved: sorter, no scrap, `wreck.remaining=0`, advance 120 | `starved` | Waiting for input | Waiting for input | 0 | 0 | {} | PASS |
| null-idle: opening seed, `tutorial=9` | `null` | null (No bottleneck) | null | 0 | 0 | {} | PASS |
| producing: 6 pulses→repair→sorter+furnace, advance 300 | `null` | null (No bottleneck) | null | 12 | 22 | {scrap:30,steel:8,nonferrous:15} | PASS |

| Clause | Expected | Actual | Result |
| --- | --- | --- | --- |
| Resolved label, never raw key | `model.bottleneckLabel === t(\`bottleneck.${id}\`)`, null when clean; `!== id` | equal for all 5; starved resolves to "Waiting for input" (not the key) | PASS |
| Gains/deliveries/batches reconcile to the settled report | `model.{deliveries,batchesDone,creditsGained} === report.*`; `report.gains[id] === store delta`; `report.deliveries === fleet delta`; `report.batchesDone === batch delta`; `totalUnits === Σ gains` | all equal for every fixture (report is a receipt of real sim deltas) | PASS |
| Painted bottleneck + focus-and-fix recovery, no reset | `.return-bottleneck[data-bottleneck]`, `__label`, `__advice === BOTTLENECK_ADVICE[id]` (or `noBottleneckAdvice`); one `.return-resume` = "Back to yard" closes once; recovery footer = export/import + copy-report; buttons = [Back to yard, Copy report]; no /reset\|claim\|restart\|wipe/; `.return-applied` role=status "nothing to claim" | all painted as expected for all 5 fixtures; resume click → `onClose` once | PASS |
| Painted record reconciles | `.return-detail` deliveries/batches rows = report values; `.return-gain` rows = `gainLines` order/amounts; credits row = `+creditsGained` | rows match the settled report exactly | PASS |
| Brief-tab-switch non-obstruction | a credited brief return must not clobber an open panel or block the brief tab switch | **REFERENCED, not rebuilt** (see below); one focused panel assertion: producing brief return is `role="group"`, `data-state="earned"`, one resume, no `role="dialog"`, no reset/claim, 12 deliveries / 22 batches reconciled | PASS (existing + 1 focused) |

**Brief-tab-switch non-obstruction — referenced authority (no fragile wall-clock App test rebuilt):**
- `tests/ui/shell-report-135.test.tsx` — the #199 auto-open race rework: `App.tsx` opens `PANEL_REPORT` only while the panel stack is untouched, so a credited brief return never clobbers an already-open panel or obstructs the brief tab switch.
- `tests/ui/return-61.test.tsx` (store parity) — a reload at the same clock credits nothing; a real gap credits exactly once; the panel is an inline `role="group"` receipt with one resume and no dialog, so dismiss/re-open cannot double-apply gains.
- `return-149` adds one focused, clock-free panel assertion tying the #149 brief-return window to that guarantee (inline group receipt, single resume, no dialog/claim/reset). No genuine #149 gap was found in the auto-open path, so no duplicate App test was added.

## Probe stdout (`npx tsx tests/ui/return-149.probe.mts`, exit 0)

```
storage-full {"bottleneck":"storage-full","bottleneckLabel":"Storage full","units":300,"cap":300,"powerRatio":1,"statuses":[],"deliveries":0,"batches":0,"dDelta":0,"bDelta":0,"gains":{},"credits":0,"credited":600}
power-limited {"bottleneck":"power-limited","bottleneckLabel":"Power limited","units":188,"cap":300,"powerRatio":0.75,"statuses":["powerLimited","powerLimited","powerLimited","powerLimited"],"deliveries":0,"batches":44,"dDelta":0,"bDelta":44,"gains":{"steel":44},"credits":0,"credited":600}
starved {"bottleneck":"starved","bottleneckLabel":"Waiting for input","units":20,"cap":300,"powerRatio":1,"statuses":["starved"],"deliveries":0,"batches":0,"dDelta":0,"bDelta":0,"gains":{},"credits":0,"credited":600}
null-idle {"bottleneck":null,"bottleneckLabel":null,"units":144,"cap":300,"powerRatio":1,"statuses":[],"deliveries":0,"batches":0,"dDelta":0,"bDelta":0,"gains":{},"credits":0,"credited":600}
producing {"bottleneck":null,"bottleneckLabel":null,"units":136,"cap":300,"powerRatio":1,"statuses":["running","running"],"deliveries":12,"batches":22,"dDelta":12,"bDelta":22,"gains":{"scrap":30,"steel":8,"nonferrous":15},"credits":0,"credited":600}
```

## Inherited #214 trade-lesson vacuity — characterized, NOT a #149 defect

Under the retuned #214 opening seed (steel 12 / credits 60), the tutorial gates 6→7→8 collapse in a single sync pass: gate 6→7 fires on `steel > 0` and gate 7→8 fires on `credits > 0` in the same tick, so **tutorial-7 (the trade lesson) never paints on the natural journey**. No credit sink reachable before the first sale can zero the 60-credit purse (first upgrade 30, second 35 → 65 > 60 refused; spare drone 45 > 30 refused; any sale only adds credits), so gate 7 cannot be held open. `onboard-149` pins this truthfully (tutorial rests at 6 with steel 0; first steel jumps to 8) and proves the lesson itself is correct and reachable from a save held at `tutorial=7` with `credits=0` (paints trade, shares the export objective verbatim).

The gate lives in shared core `src/game/simulation/engine.ts`, which is **read-only for #149**. This is the inherited #214 starter-economy issue (see `docs/vision/evidence/214-starter-economy.md`), **escalated at [#214](https://github.com/darkmatter2222/Rustwake/issues/214)** — not a #149 defect and not patched here. #149's U05 deliverable (contextual lesson tied to the real objective, no universal advance button) is fully met and verified.

## Limitations

- **E12 full contract-type deadline / partial-settlement / retry is G2/P2** (`docs/vision/ACCEPTANCE.md:59`). #149 covers the first-steel export contract gate and exactly-once `contract.sell` payment under the opening seed; the broader contract-type deadline / partial-settlement / retry matrix is deferred to G2/P2 and is not claimed here.
- **Visual / audio / economic-play fidelity is owed at G1 [#151](https://github.com/darkmatter2222/Rustwake/issues/151).** This is a non-vision agent: the painted-panel assertions are DOM/label/reconciliation contracts, not visual-fidelity certification. No screenshot, audio or economic-play feel is self-certified; that verdict belongs to G1 #151 with the running build.
- The return fixtures are deterministic 600-tick brief windows; long-absence / cap day-precision behavior is owned by `return-61` (referenced), not re-derived here.

## Handoff

Draft PR `Closes #149`, label `rw3d`. Role-stamped developer comment on the PR and on issue #149. **No self-acceptance, no ready-for-review, no merge** — independent QA + product verdict on the immutable head SHA, then release engineer merges.
