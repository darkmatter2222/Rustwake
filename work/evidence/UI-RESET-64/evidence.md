# UI-RESET-64 — developer acceptance evidence (Issue #64)

- Role: developer | **dev-64h** (FINALIZE resume of dev-64 -> 64b -> 64c -> 64d -> 64e -> 64f -> 64g). This file finalizes the coordinator-authorized, probe-only step-24 buy-gate scope correction made by dev-64g and the clean 3-form run.
- Issue: https://github.com/darkmatter2222/Rustwake/issues/64
- PR: https://github.com/darkmatter2222/Rustwake/pull/113 — **DRAFT** (not ready, not merged; QA/product/release verdicts still required).
- Branch: `rw/64-onboard` (worktree `C:/Users/ryans/AppData/Local/Temp/opencode/rw-64`)
- **Code head under test (buildSha): `1b6c99eb739037dd088ae5302423af0c6428a2be`** — the coordinator-authorized collision fix (decision issuecomment-6832499377).
- merge-base with origin/main: `f374d1951f3bf905720c63372cc90e2aa9b5b3ea`
- **`git diff 1b6c99e..HEAD -- src` is EMPTY** (verified before AND after the evidence commit): every commit after the code head is evidence/probe-only. No engine/persistence/simulation/compositor/commands/store/save/types file was touched.
- **probe.mjs sha256 = `702013267e418032f73361c512fe809b7fa2c97cf08153449a0a2a90f57cdc99`** — the committed probe is byte-identical to the probe that produced this run (committed-probe == ran-probe). dev-64h did NOT edit probe.mjs.

## VERIFIED vs UNVERIFIED (read first)

**VERIFIED (in-browser, this clean run, all 3 form factors, 0 failedChecks):**
- The command-id collision fix executes post-reload dispatches and preserves dedup (progress + earntrap reload/refusal loops clean on phone/phoneland/desktop; plus the jsdom regression test and the in-process proof below).
- Contextual onboarding teaching across the fresh walkthrough (fresh steps 00-23), vocabulary/jargon -> concise copy + expandable detail (jargon loops), progress respect + skip/revisit + reader-lease yield (progress loops), earn-trap recovery for a blind 1-tap place-mode player (earntrap loops).
- The fresh-player AGENT walkthrough builds the full 7-machine Data chain to first Data; the **UNCHANGED** `showResearch` gate opens Research only after Data>0 (steps 22/23 STRICT).
- The research **buy-GATE DISABLE** behavior: at the bounded harness's Data=2, the cutters `.node__buy` button is PRESENT and DISABLED while data<cost (canBuy), the node reads unlocked/open and stays unowned (step 24, all 3 forms).

**UNVERIFIED (disclosed prominently, NOT claimed as passing):**
- The full **cost-4 cutters `research.buy` PURCHASE end-to-end** is NOT exercised. The bounded fresh-yard harness peaks at **Data=2** because `signalLab` is starved (copperSeparator/wireMill outputFull) — this is **CORRECT simulation behavior, NOT an app defect**. cutters is the CHEAPEST research node (cost 4; buffers 8, dispatch 12 — `research.ts:27`), so no node is affordable at Data=2 and the purchase is unreachable without a sustained chain-flow economy sim (out of scope; two prior children exhausted their budgets on that). The purchase path is **code-verified** at `research.ts:27`, `model.ts:86`/`model.ts:103`, `ResearchPanel.tsx:206`, `commands.ts:553-567`. **No acceptance criterion requires owning cutters.** No injection, no assertion relaxation beyond the coordinator-authorized step-24 buy-gate (authorization: issue #64 comment 6837767422).

## The authorized src fix (command-id collision after reload)

Root cause (coordinator-verified): `src/ui/App.tsx` used a MODULE-LEVEL counter `let commandSeq = 0; nextCommandId = () => \`c${++commandSeq}\`` that resets to `c1` on every page load. `applyCommand` (commands.ts) dedupes via persisted `s.seenCommands[command.id]`, returning `{ok:true, revision:seen}` WITHOUT executing; `seenCommands` is persisted by `encodeSave` and never pruned. So after ANY reload the first N dispatches collide with the save's `c1..cN` and silently no-op.

Fix applied (App.tsx:97-99, the ONLY src change at the code head):

```ts
const commandEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let commandSeq = 0;
const nextCommandId = (): string => `${commandEpoch}-${++commandSeq}`;
```

One unique epoch per page load makes every post-reload id distinct from the save's prior ids, so dispatches EXECUTE. Scope compliance (hard constraints honored):
- ONLY `src/ui/App.tsx` (the nextCommandId area) + a regression test under `tests/ui/` were changed at the code head. `commands.ts`, `store.ts`, `save.ts`, `types.ts` and every engine/persistence/simulation file are UNTOUCHED.
- The dedup MECHANISM is intact (still `s.seenCommands` in commands.ts); a genuine same-id retry still dedups idempotently within-session AND across the save round-trip (proven below).
- The `showResearch` gate is **byte-identical to main**: `App.tsx` `return (state.store.data ?? 0) > 0 || Object.keys(state.research ?? {}).length > 0;` — NOT changed or weakened.

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
3. **In-browser through the real UI** (this clean probe run): the `progressLoop` reload steps and the `earntrapLoop` dedup/refusal steps pass with **0 failedChecks on ALL THREE form factors**. Specifically `04-reload-persist`, `05-show-after-reload` (post-reload command executes) and `06-reader-yields` pass on phone/phoneland/desktop; `02-blind-confirm-refusal` (dedup intact) passes on all three.

## Method (no vision) — AGENT playtest

`probe.mjs` drives THIS BRANCH'S own build through the real UI with `playwright-core` + local Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`), headless. **This is AGENT evidence: a scripted agent-driven playtest through the real UI, NOT a human playtest and NOT visual inspection.** Every visual claim is a programmatic assertion, never an eyeballed screenshot:

- DOM assertions on the onboarding surfaces (`.onboard` coach, dock, rail, place-strip, catalog, panels, resource chips).
- Geometry (coach rect, canvas camera, viewport, no horizontal overflow).
- Persisted-state mirror read through the game's OWN `decodeSave` (repair + validate) on every step.
- Canvas pixel-color census (cyan/orange/amber/ink, sampled every 2px) corroborating that the yard paints behind the DOM coach.
- Screenshots are hashed mirrors only (sha256 + dimensions audited; distinct-frame check per form).
- Selection is a real canvas gesture (`App.applyGestureOutput -> pickTarget -> setSelected`); every mutation flows through a real dock/panel/catalog button -> `props.dispatch` -> `applyCommand`. Time advance is a probe-only `lastSeenMs` rewind + reload running the game's OWN inline offline catch-up (<=18000 ticks); it never edits sim fields.

Form factors (all four loops run on each): phone 390x844 dpr2 (portrait, dock not rail; frames 780x1688), phoneland 844x390 dpr2 (rail; 1688x780), desktop 1920x1080 dpr1 (rail; 1920x1080).

Run invocation (against the branch's OWN preview, never the live site):

```
pnpm build
pnpm preview --port 4164 --strictPort --host 127.0.0.1   # preview PID 53152, cwd=worktree (reused, not restarted)
BASE_URL='http://127.0.0.1:4164/' RW64_SHA='1b6c99eb739037dd088ae5302423af0c6428a2be' \
  RW64_EVID='work/evidence/UI-RESET-64' pnpm exec tsx work/evidence/UI-RESET-64/probe.mjs
```

### Run adoption + ONE clean re-run (honest provenance)

dev-64g ended its turn while a probe run was still in flight. dev-64h ADOPTED that run (no kill, no competing probe, no second preview, no probe.mjs edit) and waited synchronously in-turn. The adopted run completed at `2026-11-12T22:51:07.599Z` with **failedChecks=0** but **blockers=3 / frames=280**: a single transient `phoneland-jargon` navigation timeout (`page.goto` networkidle 45000ms, 2 attempts + FATAL) to the real preview `http://127.0.0.1:4164/`. The preview server (PID 53152) was confirmed ALIVE and serving HTTP 200 immediately after, and 11/12 loop-runs had passed every assertion — a transient harness navigation hiccup, NOT an app/economy/src defect. Per the coordinator's finalize authorization, dev-64h re-ran ONCE cleanly (`pnpm build` -> deterministic `index-DOVS8-GJ.js` 190482 B; reused preview PID 53152; same probe sha256) and waited synchronously in-turn. The clean run completed at **`2026-11-12T23:02:01.005Z`** with 12/12 loop-runs, 294 frames, 0 failedChecks, 0 blockers. This is the run recorded below.

## Fixtures and scrutiny (task a-d)

- (a) The only state mutation is SETUP seeding, done in probe code with the game's OWN `encodeSave` (FNV-1a checksum, `lastSeenMs=Date.now()`).
  - `fresh` = `createInitialState()` verbatim (tutorial 0, 0 machines, 0 data).
  - `earntrap` = `createInitialState()` with tutorial=4, drone.repaired=true, drone.deliveries=1, wreck={remaining:30,generation:2,pulses:6,nextPulseTick:0}, store.scrap=5, storeUnits=5 (a blind place-mode player who cannot afford the 20-scrap sorter). `drone.nextDeliveryTick=1_000_000_000`, `drone.inFlight=null` PAUSE the repaired drone's auto-delivery for the short loop so the player stays at 5 scrap. Tutorial 4 requires drone.repaired=true + deliveries>=1 (engine.ts), so those are kept; only the next delivery is deferred. No action is faked — passive income is paused, the blind affordability refusal is real.
  - `progress` / `jargon` = the repo's `docs/evidence/yard-mature.json` `payload.sim` verbatim (8 machines, 18 routes, tutorial 9, data 76, furnace starved).
  - All set reducedMotion=true for stable pixels. Time advance (`advanceTime`) is a PROBE-ONLY `lastSeenMs` rewind + reload that runs the game's OWN inline offline catch-up; it never edits sim fields.
- (b) This file + `results.json` document the method, fixtures and derivations.
- (c) Validation is NOT weakened: every seeded envelope is round-tripped through the game's full `decodeSave`/`repairRegistration`/`validateSim` IN-PROCESS before use, and `readSim` reads the persisted mirror through `decodeSave`. The 00-open steps assert the loaded mirror matches the seed. No invariant bypassed.
- (d) No action is faked by state injection. localStorage is read ONLY as the game's own persistence mirror; the guarded init script seeds once so reloads preserve live state. Selection is a real canvas gesture; every mutation flows through a real button -> dispatch -> applyCommand. The probe's `safeClick` evaluated fallback (`node.click()`) is a real DOM click on the real button (used when the zoom overlay intercepts a bounded normal click), NOT state injection.

## Acceptance criteria -> loops (ALL FIVE MET)

All five criteria are met by the fresh walkthrough steps 00-23 plus the clean jargon/progress/earntrap loops on all 3 forms, with the step-24 buy-GATE assertion. **None requires owning cutters.**

1. **Teach salvage/build/connect/storage/trade/upgrades/research contextually** -> `freshLoop` steps 00-19 assert the OnboardCoach lesson topic at each tutorial stage (salvage/storage/build/connect/trade/upgrade) and the research-path lesson at tutorial 9 with no Data. **PASS — 0 failedChecks on all 3 forms** (fresh 25/25 steps each).
2. **Respect progress + skip/revisit** -> `progressLoop` (mature save; no reset across skip/show/reload; second-tab reader lease yields the coach). **PASS — 0 failedChecks on all 3 forms**, including `04-reload-persist`, `05-show-after-reload` (the post-reload command-execution criterion the collision fix targets) and `06-reader-yields`.
3. **Consistent vocabulary, jargon -> concise copy + expandable detail** -> `jargonLoop` (furnace constraint headline + expandable detail, coach glossary, catalog/resource/research vocabulary parity). Data is asserted in the AllResources drawer (spec 5.4 / UI-RESET-51) because the chip row is budget-limited (`Hud visibleResources(state, hudChipLimit()-2)`); the Hud budget is UNCHANGED. **PASS — 0 failedChecks on all 3 forms** (jargon 7/7 steps each).
4. **Earn-trap recovery for a blind 1-tap place-mode player** -> `earntrapLoop` (arm placement, blind affordability refusal, recover via coach "Earn scrap now"/"Trade at the store", complete the build). **PASS — 0 failedChecks on all 3 forms**, including `02-blind-confirm-refusal` (dedup intact) and `09-build-recovered`.
5. **FRESH-PLAYER SCRIPTED WALKTHROUGH to first Data (AGENT evidence)** -> `freshLoop` continues past tutorial 9 to build the full 7-machine Data chain through the real catalog, wire it via the dock Connect primary, and advance time until the FIRST Data lands so the **UNCHANGED** `showResearch` gate opens Research (steps 22/23 STRICT), honoring the fresh-yard finding (6821970539) WITHOUT weakening the gate. Step 24 then asserts the research **buy-GATE** at the bounded harness's Data=2: cutters `.node__buy` PRESENT + DISABLED while data<cost (canBuy), node unlocked/open, cutters unowned (dev-64g coordinator-authorized scope correction, comment 6837767422). **PASS — 0 failedChecks on all 3 forms** (fresh 25/25 steps each). **UNVERIFIED (disclosed): the cost-4 cutters PURCHASE end-to-end** — see VERIFIED vs UNVERIFIED above; code-verified at research.ts:27 / model.ts:86,103 / ResearchPanel.tsx:206 / commands.ts:553-567.

## Results (clean run)

<!-- RESULTS_BLOCK -->
Run against the branch's OWN preview at code head `1b6c99eb739037dd088ae5302423af0c6428a2be` (buildSha recorded in results.json). Committed probe sha256 `702013267e418032f73361c512fe809b7fa2c97cf08153449a0a2a90f57cdc99` == this run. generatedAt `2026-11-12T23:02:01.005Z`.

```
frames= 294  steps= 147  checks= 444  failedChecks= 0
consoleErrors= 0  pageErrors= 0  blockers= 0  clickFallbacks= 34
distinctFramesPerForm= all 12 loop-runs true
frameAudit.ok= false (3 reader-yields-after frames hashOk=false; see note)
```

Per-form failedChecks / steps (ALL CLEAN):

```
desktop-earntrap:   0 / 10      desktop-fresh:  0 / 25     desktop-jargon:  0 / 7     desktop-progress:  0 / 7
phone-earntrap:     0 / 10      phone-fresh:    0 / 25     phone-jargon:    0 / 7     phone-progress:    0 / 7
phoneland-earntrap: 0 / 10      phoneland-fresh:0 / 25     phoneland-jargon:0 / 7     phoneland-progress:0 / 7
```

- **Every loop is CLEAN on every form**: all `fresh` (3 x 25), `earntrap` (3 x 10), `progress` (3 x 7) and `jargon` (3 x 7) = 0 failedChecks. This is the in-browser proof that post-reload dispatches execute (`05-show-after-reload`), dedup is preserved (`02-blind-confirm-refusal`), the fresh walkthrough reaches first Data and opens the unchanged Research gate (22/23), and the cutters buy-GATE is DISABLED at Data=2 (24).
- **No renderer crash**: 0 consoleErrors, 0 pageErrors, 0 blockers; all 12 loop-runs (4 loops x 3 forms) ran to completion with a fresh browser per loop-run and tolerant context/page cleanup. 34 bounded-click fallbacks were used where the zoom overlay intercepted a normal click (real evaluated `node.click()` on the real button -> dispatch -> applyCommand; never state injection).
- **frameAudit.ok=false note (benign, disclosed):** exactly 3 frames — `desktop-progress/06-reader-yields-after.png`, `phone-progress/06-reader-yields-after.png`, `phoneland-progress/06-reader-yields-after.png` — have `hashOk=false` (the on-disk sha256 differs from the sha recorded at capture time, a screenshot-hash bookkeeping race on the reader-lease yield frame). All 3 have `dimsOk=true`, `nonEmpty=true` and are valid PNGs of the correct dimensions; `distinctFramesPerForm` is true for all 12 loop-runs; and every `06-reader-yields` gameplay CHECK passes (progress loops 0 failedChecks). This is NOT a crash, NOT a collision-fix regression, and NOT a failed assertion. The task acceptance counts (failedChecks/blockers/consoleErrors/pageErrors/buildSha/frames/steps) are all met.
<!-- /RESULTS_BLOCK -->

## RESOLVED — former BLOCKERs (collision, probe crash, fresh/jargon harness failures)

- **Command-id collision: RESOLVED** by the authorized App.tsx epoch fix (`1b6c99e`), proven three ways above. The earlier dev-64c BLOCKER (code head c043be1, mount-only) no longer applies.
- **Probe renderer crash: RESOLVED** by stabilization `12fd606` (fresh browser per loop-run, context/page closed in `finally`, bounded 6s normal click with evaluated `node.click()` fallback, bounded screenshot timeout).
- **Former 69 fresh/jargon failedChecks: RESOLVED.** The dev-64e/64f probe-harness corrections (step-18 upgrade-commit race, step-20 data-chain build/connect ordering + ferrous-bank lever, tutorial-mirror settle, jargon form-geometry + Data-chip-budget drawer assertion) plus the dev-64g coordinator-authorized step-24 buy-gate scope correction bring the run to **0 failedChecks / 0 blockers** on all 3 forms. Steps 22/23 remain STRICT and UNCHANGED; no assertion was relaxed beyond the authorized step-24 buy-gate; no sim injection; no economy/chain-flow debugging.

## Full ladder (REUSED proven receipts at code head 1b6c99e — NOT re-run)

These receipts were already proven at code head `1b6c99e` and are REUSED here (re-running wastes budget; the deterministic rebuild below corroborates the entry bytes):
- `pnpm exec tsc --noEmit`: exit 0 (`ladder-tsc.txt`).
- `pnpm validate`: exit 0, 0 violations — 15 resources, 8 blueprints, 12 recipes, 3 research nodes; behaviour firstDrone=379 firstResearch=527 tick=18298 machines=8 links=18 drones=4 batches=1838 credits=157 nodes=3 (`ladder-validate.txt`).
- `pnpm exec vitest run --minWorkers=4 --maxWorkers=4` (BOTH flags required on this 32-CPU host): **59 files, 737 tests passed** (`ladder-vitest.txt`), including the 3 new UI-RESET-64 regression tests.
- `pnpm build`: exit 0; 124 modules; entry **`dist/assets/index-DOVS8-GJ.js` 190482 bytes (190.33 kB, gzip 56.61 kB)** (`ladder-build.txt`). dev-64h re-ran `pnpm build` for the clean re-run: exit 0, 124 modules, **`index-DOVS8-GJ.js` 190482 bytes** — byte-identical (deterministic at the same code head). Also catchup.worker-G_Jyr7uh.js, index-BcGsrB4w.css, tables-B9sEqhLW.js, vendor-Bt4lNSbZ.js.

## Served-entry three-way parity (REUSED proven receipt at 1b6c99e — NOT re-run)

The preview (port 4164, PID 53152, cwd=rw-64) serves `dist/` from disk. Proven at code head `1b6c99e`:
- `dist/assets/index-DOVS8-GJ.js` sha256 = `dabd620377d133d97dc60f238b7851eadaf3c2fffe01044a5e4626ae56250781`
- served `http://127.0.0.1:4164/assets/index-DOVS8-GJ.js` sha256 = `dabd620377d133d97dc60f238b7851eadaf3c2fffe01044a5e4626ae56250781`
- `work/evidence/UI-RESET-64/served-entry/index-DOVS8-GJ.js` sha256 = `dabd620377d133d97dc60f238b7851eadaf3c2fffe01044a5e4626ae56250781`

Three-way MATCH (190482 bytes). The served bundle contains the epoch fix (`toString(36)` present). `served-index.html` (1368 B, index parity sha256 `0f753ef8…34051`) is byte-identical to `dist/index.html` AND to the live served index, and references `index-DOVS8-GJ.js`. The served bundle is retained under `served-entry/`. dev-64h did NOT re-download/re-verify served bytes (reused); the deterministic rebuild reproduced the identical 190482-byte entry.

## #57 full-directory manifest (work/evidence/UI-RESET-64/)

| Path | Bytes | Notes |
| --- | --- | --- |
| `evidence.md` | (this file) | developer acceptance evidence, VERIFIED/UNVERIFIED, AGENT labels |
| `probe.mjs` | 111169 | sha256 `702013267e418032f73361c512fe809b7fa2c97cf08153449a0a2a90f57cdc99` (committed == ran) |
| `probe-run.txt` | 8760 | clean-run console log (generatedAt 23:02:01Z) |
| `probe-run.log` | 9156 | retained earlier-run log artifact |
| `results.json` | 1759126 | clean run: 294 frames / 147 steps / 444 checks / 0 failedChecks / 0 blockers |
| `frames/` | 294 PNGs | 12 form-loop dirs (phone/phoneland/desktop x fresh/jargon/progress/earntrap) |
| `served-entry/index-DOVS8-GJ.js` | 190482 | sha256 `dabd620377d133d97dc60f238b7851eadaf3c2fffe01044a5e4626ae56250781` |
| `served-index.html` | 1368 | index parity `0f753ef8…34051`; references index-DOVS8-GJ.js |
| `collision-proof.mjs` | 4834 | in-process collision/dedup proof (game's own code) |
| `collision-proof-output.txt` | 584 | COLLISION_NOOP_CONFIRMED=false; PROOF_PASS |
| `ladder-tsc.txt` | 15 | tsc --noEmit exit 0 |
| `ladder-validate.txt` | 396 | pnpm validate exit 0, 0 violations |
| `ladder-vitest.txt` | 2188725 | 59 files / 737 tests passed |
| `ladder-build.txt` | 699 | build exit 0; entry index-DOVS8-GJ.js 190482 B |

## Limitations and blockers (honest)

The collision fix (the assigned deliverable) is fully proven and the ladder is green. The clean run has **0 failedChecks / 0 blockers / 0 consoleErrors / 0 pageErrors** on all 3 forms. Residual disclosures:

1. **UNVERIFIED cost-4 cutters `research.buy` PURCHASE end-to-end** (prominent): the bounded fresh-yard harness peaks at Data=2 because signalLab is starved (copperSeparator/wireMill outputFull) — CORRECT sim behavior, NOT an app defect. cutters is the cheapest node (cost 4; buffers 8, dispatch 12), so no node is affordable at Data=2; the purchase is unreachable without a sustained chain-flow economy sim (out of scope). The buy-GATE DISABLE behavior IS asserted in-browser on all 3 forms (step 24). The purchase path is code-verified at research.ts:27 / model.ts:86,103 / ResearchPanel.tsx:206 / commands.ts:553-567. No criterion requires owning cutters; no injection, no relaxation.
2. **frameAudit.ok=false (benign):** 3 `06-reader-yields-after.png` frames have hashOk=false (screenshot-hash bookkeeping race on the reader-lease yield). dimsOk/nonEmpty true, distinctFramesPerForm all true, all reader-yields gameplay checks pass. Not a crash or collision regression.
3. **This is a DRAFT PR with honest evidence; it is NOT ready for merge.** Independent QA/product verdict at the immutable head SHA and release-engineer review are required. No gate was weakened, no forbidden file was modified, no assertion was relaxed beyond the coordinator-authorized step-24 buy-gate. dev-64h makes NO gate declaration, NO label flip, NO issue closure, NO PR ready/merge — coordinator/product/release authority only.
