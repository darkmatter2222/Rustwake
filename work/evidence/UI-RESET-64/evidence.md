# UI-RESET-64 — developer acceptance evidence (Issue #64)

- Role: developer (resume chain dev-64 -> dev-64b -> dev-64c -> **dev-64d**, this 4th resume)
- Branch: `rw/64-onboard` (worktree `C:/Users/ryans/AppData/Local/Temp/opencode/rw-64`)
- **Code head under test (buildSha): `1b6c99eb739037dd088ae5302423af0c6428a2be`** — the coordinator-authorized collision fix (decision issuecomment-6832499377).
- merge-base with origin/main: `f374d1951f3bf905720c63372cc90e2aa9b5b3ea`
- Implementation commits (dev-64, OnboardCoach mount): `ec895e8`, `296b425`, `cb3f9e8`, `c043be1`. App.tsx onboarding mount is PURELY ADDITIVE; the `showResearch` gate is UNCHANGED.
- **Collision fix commit (dev-64d): `1b6c99e`** — `src/ui/App.tsx` (+9/-1) + `tests/ui/onboard-64-command-id.test.tsx` (+186). These are the ONLY two files changed at the code head.
- Probe stabilization commit (dev-64d): `12fd606` (crash isolation; probe-only). A later probe experiment `3941e76` (mirror-settle + sorter-tile) was MEASURED to regress results (69 -> 81 failedChecks) and REVERTED by `daebbb5`; the committed probe is byte-identical to `12fd606` and to the probe that produced this run.
- `git diff 1b6c99e..HEAD -- src` is **EMPTY**: every commit after the code head is evidence/probe-only. No engine/persistence/simulation file was touched.

## The authorized src fix (command-id collision after reload)

Root cause (coordinator-verified): `src/ui/App.tsx` used a MODULE-LEVEL counter `let commandSeq = 0; nextCommandId = () => \`c${++commandSeq}\`` that resets to `c1` on every page load. `applyCommand` (commands.ts) dedupes via persisted `s.seenCommands[command.id]`, returning `{ok:true, revision:seen}` WITHOUT executing; `seenCommands` is persisted by `encodeSave` and never pruned. So after ANY reload the first N dispatches collide with the save's `c1..cN` and silently no-op.

Fix applied (App.tsx:97-99, the ONLY src change):

```ts
const commandEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let commandSeq = 0;
const nextCommandId = (): string => `${commandEpoch}-${++commandSeq}`;
```

One unique epoch per page load makes every post-reload id distinct from the save's prior ids, so dispatches EXECUTE. Scope compliance (hard constraints honored):
- ONLY `src/ui/App.tsx` (the nextCommandId area) + a regression test under `tests/ui/` were changed. `commands.ts`, `store.ts`, `save.ts`, `types.ts` and every engine/persistence/simulation file are UNTOUCHED.
- The dedup MECHANISM is intact (still `s.seenCommands` in commands.ts); a genuine same-id retry still dedups idempotently within-session AND across the save round-trip (proven below).
- The `showResearch` gate is byte-identical: `App.tsx:1571-1572` `return (state.store.data ?? 0) > 0 || Object.keys(state.research ?? {}).length > 0;` — NOT changed or weakened.

## Collision proof (three independent layers)

1. **jsdom regression test through the REAL App** (`tests/ui/onboard-64-command-id.test.tsx`, 3 tests, all pass; fails on the old counter):
   - (a) "executes the first command after a reload instead of silently deduping it": mounts the real App, dispatches via the real dock primary, simulates a reload (`vi.resetModules()` + fresh dynamic import = fresh epoch over the SAME persisted save, clock past the lease TTL so the new tab is writer and runs the game's own offline catch-up), then asserts the post-reload dispatch advances `revision` and `wreck.pulses` and adds a SECOND distinct seenCommands id. Under the old `c1` counter this returned ok:true at the OLD revision with no change.
   - (b) "still dedups a genuine same-id retry without re-executing (store path)": same id twice -> identical result, pulses/revision unchanged, single seenCommands key.
   - (c) "keeps dedup across the save round-trip while a fresh-epoch id executes": persisted `c1` retry dedups (machines stays 1, scrap 80); a fresh-epoch id executes (machines 2, scrap 60, revision 2).
   - Isolated run: `Test Files 1 passed (1) / Tests 3 passed (3)`.
2. **In-process proof with the game's OWN code, no UI** (`collision-proof.mjs` -> `collision-proof-output.txt`): uses `applyCommand`/`encodeSave`/`decodeSave` directly, setup seeding only (scrap=100/storeUnits=100). Output:
   ```
   pre-reload build c1: {"ok":true,"revision":1} machines= 1 scrap= 80
   same-id retry within session: {"ok":true,"revision":1} DEDUP_IN_SESSION_OK= true
   seenCommands after reload: ["c1"]
   post-reload build OLD id c1: {"ok":true,"revision":1} machines= 1 scrap= 80
   OLD_SCHEME_COLLISION_NOOP= true (control: the pre-existing bug reproduces)
   post-reload build NEW epoch id: {"ok":true,"revision":2} machines= 2 scrap= 60
   COLLISION_NOOP_CONFIRMED= false
   same-id retry across reload: {"ok":true,"revision":2} DEDUP_CROSS_RELOAD_OK= true
   PROOF_PASS: collision fixed, dedup preserved
   ```
   **COLLISION_NOOP_CONFIRMED=false** (fix executes post-reload) AND dedup preserved both within-session and across reload; the old scheme is kept as a control that still reproduces the bug.
3. **In-browser through the real UI** (this probe run): the `progressLoop` reload steps and the `earntrapLoop` dedup/refusal steps pass with **0 failedChecks on ALL THREE form factors** (see Results). Specifically `04-reload-persist`, `05-show-after-reload` (post-reload command executes) and `06-reader-yields` pass on phone/phoneland/desktop; `02-blind-confirm-refusal` (dedup intact) passes on all three.

## Method (no vision)

`probe.mjs` drives THIS BRANCH'S own build through the real UI with `playwright-core` + local Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`), headless. Every visual claim is a programmatic assertion, never an eyeballed screenshot:

- DOM assertions on the onboarding surfaces (`.onboard` coach, dock, rail, place-strip, catalog, panels, resource chips).
- Geometry (coach rect, canvas camera, viewport, no horizontal overflow).
- Persisted-state mirror read through the game's OWN `decodeSave` (repair + validate) on every step.
- Canvas pixel-color census (cyan/orange/amber/ink, sampled every 2px) corroborating that the yard paints behind the DOM coach.
- Screenshots are hashed mirrors only (sha256 + dimensions audited; distinct-frame check per form).

Form factors (all four loops run on each): phone 390x844 dpr2 (portrait, dock not rail; frames 780x1688), phoneland 844x390 dpr2 (rail; 1688x780), desktop 1920x1080 dpr1 (rail; 1920x1080).

Run invocation (against the branch's OWN preview, never the live site):

```
pnpm build
pnpm preview --port 4164 --strictPort --host 127.0.0.1   # background, cwd=worktree
BASE_URL='http://127.0.0.1:4164/' RW64_SHA='1b6c99eb739037dd088ae5302423af0c6428a2be' \
  RW64_EVID='work/evidence/UI-RESET-64' pnpm exec tsx work/evidence/UI-RESET-64/probe.mjs
```

## Fixtures and scrutiny (task a-d)

- (a) The only state mutation is SETUP seeding, done in probe code with the game's OWN `encodeSave` (FNV-1a checksum, `lastSeenMs=Date.now()`).
  - `fresh` = `createInitialState()` verbatim (tutorial 0, 0 machines, 0 data).
  - `earntrap` = `createInitialState()` with tutorial=4, drone.repaired=true, drone.deliveries=1, wreck={remaining:30,generation:2,pulses:6,nextPulseTick:0}, store.scrap=5, storeUnits=5 (a blind place-mode player who cannot afford the 20-scrap sorter). `drone.nextDeliveryTick=1_000_000_000`, `drone.inFlight=null` PAUSE the repaired drone's auto-delivery for the short loop so the player stays at 5 scrap. Tutorial 4 requires drone.repaired=true + deliveries>=1 (engine.ts), so those are kept; only the next delivery is deferred. No action is faked — passive income is paused, the blind affordability refusal is real.
  - `progress` / `jargon` = the repo's `docs/evidence/yard-mature.json` `payload.sim` verbatim (8 machines, 18 routes, tutorial 9, data 76, furnace starved).
  - All set reducedMotion=true for stable pixels. Time advance (`advanceTime`) is a PROBE-ONLY `lastSeenMs` rewind + reload that runs the game's OWN inline offline catch-up (<=18000 ticks); it never edits sim fields.
- (b) This file + `results.json` document the method, fixtures and derivations.
- (c) Validation is NOT weakened: every seeded envelope is round-tripped through the game's full `decodeSave`/`repairRegistration`/`validateSim` IN-PROCESS before use, and `readSim` reads the persisted mirror through `decodeSave`. The 00-open steps assert the loaded mirror matches the seed. No invariant bypassed.
- (d) No action is faked by state injection. localStorage is read ONLY as the game's own persistence mirror; the guarded init script seeds once so reloads preserve live state. Selection is a real canvas gesture; every mutation flows through a real button -> dispatch -> applyCommand. The probe's `safeClick` evaluated fallback (`node.click()`) is a real DOM click on the real button (used when the zoom overlay intercepts a bounded normal click), NOT state injection.

## Acceptance criteria -> loops (per-criterion status)

1. **Teach salvage/build/connect/storage/trade/upgrades/research contextually** -> `freshLoop` (tutorial 0..9 via real dock primaries, asserting the OnboardCoach lesson topic at each stage). PARTIAL: the coach lesson topics and the early salvage/build/connect state assertions pass; the late fresh-loop tutorial-value assertions and the tutorial-9 upgrade/data-chain stages are blocked by pre-existing probe-harness issues (tutorial mirror timing + zoom-overlay dock-click interception), NOT by the collision fix. See Limitations.
2. **Respect progress + skip/revisit** -> `progressLoop` (mature save; no reset across skip/show/reload; second-tab reader lease yields the coach). **PASS — 0 failedChecks on all 3 forms**, including `04-reload-persist` and `05-show-after-reload` (the post-reload command-execution criterion the collision fix targets).
3. **Consistent vocabulary, jargon -> concise copy + expandable detail** -> `jargonLoop` (furnace constraint headline + detail, coach glossary, catalog/resource/research vocabulary parity). PARTIAL: coach glossary and most vocabulary pass; residual failures are the budget-limited resource-chip Data visibility (a design finding, not a bug) and form-specific furnace/catalog geometry. See Limitations.
4. **Earn-trap recovery for a blind 1-tap place-mode player** -> `earntrapLoop` (arm placement, blind affordability refusal, recover via coach "Earn scrap now"/"Trade at the store", complete the build). **PASS — 0 failedChecks on all 3 forms**, including `02-blind-confirm-refusal` (dedup intact) and `09-build-recovered`.
5. **FRESH-PLAYER SCRIPTED WALKTHROUGH to first Data** -> `freshLoop` continues past tutorial 9 to build the full Data chain through the real catalog, wire it via the dock Connect primary, and advance time until the FIRST Data lands so Research unlocks — honoring the fresh-yard finding (6821970539) WITHOUT weakening the `showResearch` gate. BLOCKED in the probe by the same pre-existing fresh-loop harness issues as criterion 1 (the Build dock button / research rail slot are intercepted by the zoom overlay at tutorial 7-9, so the chain build/research-open clicks do not land). The collision fix itself is proven (criteria 2/4 reload loops + regression test + in-process proof); the gate is byte-identical and never weakened.

## Results

<!-- RESULTS_BLOCK -->
Run against the branch's OWN preview at code head `1b6c99eb739037dd088ae5302423af0c6428a2be` (buildSha recorded in results.json). Committed probe == `12fd606` == this run.

```
frames= 294  auditOk= false  distinct= all 12 loop-runs true
steps= 147  checks= 435  failedChecks= 69
consoleErrors= 0  pageErrors= 0  blockers= 10  clickFallbacks= 14
```

Per-form failedChecks / steps:

```
desktop-earntrap:   0 / 10      desktop-fresh: 18 / 25     desktop-jargon: 1 / 7     desktop-progress: 0 / 7
phone-earntrap:     0 / 10      phone-fresh:   19 / 25     phone-jargon:   7 / 7     phone-progress:   0 / 7
phoneland-earntrap: 0 / 10      phoneland-fresh:18 / 25    phoneland-jargon:6 / 7    phoneland-progress:0 / 7
```

- **Collision-relevant loops are CLEAN on every form**: all `earntrap` (3 x 10 steps) and all `progress` (3 x 7 steps) = 0 failedChecks. This is the in-browser proof that post-reload dispatches execute (`05-show-after-reload`) and dedup is preserved (`02-blind-confirm-refusal`).
- **No renderer crash**: 0 consoleErrors, 0 pageErrors; all 12 loop-runs (4 loops x 3 forms) ran to completion with a fresh browser per loop-run and tolerant context/page cleanup (stabilization `12fd606`). 14 bounded-click fallbacks were used where the zoom overlay intercepted a normal click (real evaluated `node.click()` on the real button).
- The 69 failedChecks are confined to `fresh` (55) and `jargon` (14) loops; root causes in Limitations. `auditOk=false` reflects those residual check failures, not a crash or a collision-fix regression.
<!-- /RESULTS_BLOCK -->

## RESOLVED — former BLOCKER (command-id collision) and probe crash

- **Command-id collision: RESOLVED** by the authorized App.tsx epoch fix (`1b6c99e`), proven three ways above (regression test, in-process `COLLISION_NOOP_CONFIRMED=false` with dedup preserved, and clean in-browser progress/earntrap reload loops on all 3 forms). The earlier dev-64c BLOCKER (recorded at code head c043be1 when App.tsx was mount-only) no longer applies: the coordinator authorized the one-line uniqueness change (decision 6832499377) and dev-64d applied it within the exact assigned scope.
- **Probe renderer crash: RESOLVED** by stabilization `12fd606` (fresh browser per loop-run, context/page closed in `finally`, bounded 6s normal click with evaluated `node.click()` fallback for zoom-overlay-intercepted buttons, bounded screenshot timeout). This run completed all 12 loop-runs with 0 console/page errors and no crash.

## Full ladder (dev-64d, this worktree, code head 1b6c99e)

- `pnpm exec tsc --noEmit`: exit 0 (`ladder-tsc.txt`).
- `pnpm validate`: exit 0, 0 violations — 15 resources, 8 blueprints, 12 recipes, 3 research nodes; behaviour firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3 (`ladder-validate.txt`).
- `pnpm exec vitest run --minWorkers=4 --maxWorkers=4` (BOTH flags required on this 32-CPU host): **59 files, 737 tests passed** (`ladder-vitest.txt`), including the 3 new UI-RESET-64 regression tests.
- `pnpm build`: exit 0; 124 modules; entry **`dist/assets/index-DOVS8-GJ.js` 190482 bytes (190.33 kB, gzip 56.61 kB)** (`ladder-build.txt`). Also catchup.worker-G_Jyr7uh.js, index-BcGsrB4w.css, tables-B9sEqhLW.js, vendor-Bt4lNSbZ.js.

## Served-entry three-way parity

The preview (port 4164, cwd=rw-64) serves `dist/` from disk. The served entry bytes were downloaded and hash-compared to `dist/` and to the evidence copy:

- `dist/assets/index-DOVS8-GJ.js` sha256 = `dabd620377d133d97dc60f238b7851eadaf3c2fffe01044a5e4626ae56250781`
- served `http://127.0.0.1:4164/assets/index-DOVS8-GJ.js` sha256 = `dabd620377d133d97dc60f238b7851eadaf3c2fffe01044a5e4626ae56250781`
- `work/evidence/UI-RESET-64/served-entry/index-DOVS8-GJ.js` sha256 = `dabd620377d133d97dc60f238b7851eadaf3c2fffe01044a5e4626ae56250781`

Three-way MATCH (190482 bytes). The served bundle contains the epoch fix (`toString(36)` present). `served-index.html` is byte-identical to `dist/index.html` AND to the live served index, and references `index-DOVS8-GJ.js`. The served bundle is retained under `served-entry/`.

## Limitations and blockers (honest)

The collision fix (the assigned deliverable) is fully proven and the ladder is green. The probe is NOT fully clean: 69 failedChecks / 10 blockers remain, ALL confined to the `fresh` and `jargon` loops and ALL independent of the collision fix (the collision-relevant progress/earntrap loops are clean on every form). They are pre-existing probe-harness measurement/geometry issues, not onboarding defects introduced by this change:

1. **Fresh-loop tutorial mirror timing (steps 07/11/17/18 tutorial-value checks).** `tutorial` is advanced by `syncTutorial` inside `stepTick` (engine.ts), NOT by `applyCommand`, and the store writes the localStorage mirror only on its `PERSIST_MS=1000` cadence (store.ts). The probe reads the persisted mirror after a fixed ~350ms wait, so a just-mutated machine state can appear with the tutorial still one stage behind (e.g. step 10 sorter built `machines=1` but mirror `tutorial=4`). The surrounding state assertions (sorter-built, scrap-income, coach topics) pass. A bounded mirror-settle experiment was tried and REVERTED because it regressed results (it returned on the first barely-advanced persist, catching staler tutorial); a correct fix needs a tick-aware settle keyed to the tutorial transition, which is a probe redesign out of this assignment's scope. These engine/persistence files are forbidden to modify.
2. **Fresh-loop zoom-overlay dock/catalog click interception (steps 18, 20-24 cascade).** At tutorial 7-9 the Build dock button, catalog cards and the research rail slot are intercepted by the canvas zoom overlay or absent in the expected form-specific geometry. Observed: step 17 sell-steel leaves `steel=1->1, credits=0->0` and step 18 upgrade leaves `sorter lv1->lv1` (the panel-primary click never lands), and step 20 `dock button not found: "Build"`, step 23 `.panel--research`/research-rail timeout. `safeClick`'s evaluated fallback fires (clickFallbacks: dock:Build x4, research slot x2, catalog card x1) but the dock/rail elements are not reliably hittable in this state. This cascades through the data-chain build/connect/first-Data/research-open/buy-cutters checks (criteria 1 and 5). It is a probe navigation/geometry limitation, NOT a collision-fix or gate regression.
3. **Jargon resource-vocab-data (phone/phoneland/desktop step 05).** The resource chip row is budget-limited: `Hud.tsx` `visibleResources(state, hudChipLimit() - 2)` paints Scrap first then SELL_ORDER resources with qty>0 up to the limit; Data legitimately falls outside the budget when other resources dominate and is surfaced via the AllResources drawer (UI-RESET-51 / spec 5.4). The probe's expectation that Data appears in the chip row is flawed; this is a design finding, not an app bug, and cannot be "fixed" in src without changing forbidden UI budget behavior.
4. **Jargon form-specific geometry (phone-jargon 04/05/06 catalog/dock/research; phoneland-jargon 01/02 furnace tap + `.inspector-constraint__summary`).** Phone-portrait dock/catalog and landscape-rail furnace-inspector geometry differ from the probe's selectors; these are probe-side form-geometry races, not gate or collision defects.
5. **This is a DRAFT PR with honest evidence; it is NOT ready for merge.** Independent QA/product verdict at the immutable head SHA and release-engineer review are required. The collision fix is proven and within scope; the residual fresh/jargon probe failures are documented above for coordinator/QA triage (probe-harness follow-up), not claimed as passing. No gate was weakened, no forbidden file was modified, no assertion was relaxed to force a pass.