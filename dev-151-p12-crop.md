# Dev handoff — #151 G1/P1 first-playable gate, pass 12 (crop-framing fix)

Role: developer (child session 1 of 1; coordinator + developer = 2/5; no delegation).
Worktree: `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-151` — branch `rw/151` — draft PR #227 ("Part of #151").

## Final head (triple-verified)
`cdd87e26b5917a71ed21117bda733251575e4787`
- local HEAD == origin/rw/151 == PR #227 head.sha == cdd87e2 (PR draft:true, state:open).
- Commits this pass:
  - `e745595e75bb3b67eddde2318de95980f11e535f` fix(151): tight constant per-device V05 crop window from projected bbox (scripts/capture-g1-151.mjs ONLY).
  - `cdd87e26b5917a71ed21117bda733251575e4787` test(151): regenerate G1 captures at e745595 (79 files: 4 evidence JSON + 75 PNG).
- Starting head 5705c7b was triple-verified before work. Artifacts stamped at e745595 (the fix-containing head), committed in cdd87e2; both immutable on rw/151. No src/ gameplay, renderer, economy, or test expectation changed.

## The one defect fixed (instrument, NOT renderer)
`v05-desktop: crop hash distinct across all five stages` was the ONLY failing check at 5705c7b
(desktop modeByStage 0/1/2 all be6c0645 -> 3 distinct of 5; phone already 5 distinct).

### Step 1 — empirical desktop probe (before any code change)
Desktop 1440x900 dpr1, warehouse projected REST bbox = [715.0,374.5 .. 888.7,491.2] = **173.7 x 116.7 CSS px**,
center (801.8,432.8). Old fixed 92x92 window (x755.8,y386.8) covered only the center:
- old per-stage first-seen hashes: 0:be6c0645 1:be6c0645 2:be6c0645 3:6afa5571 4:28aa4696 -> **3 distinct of 5** (reproduces the defect exactly).
- tight constant 187x130 window (x708,y368): 0:5712a727 1:cc1d67d0 2:fbe9bfcd 3:2aa6c279 4:dd0e0a05 -> **5 distinct**.
Scene graph advances (atomic stage/visibleParts PASS) => CROP-FRAMING instrument defect, not a rendering defect. Renderer (assemblyView.ts/assembly.ts) left untouched.

### Step 2 — fix (scripts/capture-g1-151.mjs only)
- `readLiveAssembly` now also returns the target group's projected screen bbox: every kit mesh's 8 unit-box world corners (shared 1x1x1 geometry; matrixWorld carries scale/pose) projected through the LIVE camera, min/max CSS px. Read-only (temporary vector clone/set/applyMatrix4/project; no scene/economy/state/clock writes). ALL meshes included — partAssemblyPose leaves future-stage parts at REST (HIDDEN sy=1, no offset), so the union is the full rest extent regardless of stage = a stable reference.
- `observe` derives a tight per-device window from bbox + CROP_MARGIN(6px), clamped to canvas, computed ONCE and FROZEN in `cropState.rect`, reused for every stage. CONSTANT across stages => distinct hashes come from genuine pixel change, never per-stage resizing/reposition.
- `cropPixelHash` backing-store FNV method UNCHANGED. The "5 distinct stage hashes" check UNCHANGED (`stageModes.length >= 5 && new Set(stageModes).size === stageModes.length`). Bucketing by `liveObs.stage` (pass-10 atomic time base) and `liveProgressTicks` auditing UNCHANGED. No floor/threshold/budget relaxed; nothing deleted/skipped.
- Added served-bundle identity hard check (strengthens provenance).

## Step 3 — empirical verification at e745595 (full capture to completion)
`npx tsx scripts/capture-g1-151.mjs` exit 0. **Overall pass:true, 104/104 hard checks, 0 failed, 1 finding** (the V05 MET finding).
- v05-desktop crop distinct: **5 stages, 5 distinct, 11 total unique**. modeByStage {0:5712a727, 1:cc1d67d0, 2:10daddd7, 3:2aa6c279, 4:dd0e0a05}. Constant window {x:708,y:368,w:187,h:130}.
- v05-phone crop distinct: **5 stages, 5 distinct, 12 total unique**. modeByStage {0:a4ff6f6e, 1:26b5cf8e, 2:7dd1e745, 3:2667d7ef, 4:53c77c08}. Constant window {x:172,y:419,w:116,h:82}.
- Both devices: live stage == pure stage (atomic live tick) PASS (21 samples desktop); live visibleParts == pure PASS; stage sequence [0,1,2,3,4]; visibleParts monotone; completes exactly once; world ledger conserved (single charge); steel committed exactly once (8, stock 4); sim store steel/scrap unchanged.
- Roundtrip invalid-import: economy byte-identical PASS, tick drift 0 (<=2) PASS; roundtrip section 10/10.
- V04 motion both devices: 113/120 unique, maxRun 1, hidden 8/8 frozen, sim tick delta 600, ready 120/120. Context-loss green.
- Hashes deterministic across two full runs (5705c7b working-tree run and e745595 run produced identical modeByStage).

### Build / served-bundle provenance
- `npm run build` green. Entry `dist/assets/index-Cvl4BdAr.js`: raw **868472 B**, gzip **232129 B**, sha256 `8c25322cd871fe0426df1f8b0eaa9efb094fc3cbb1c62aac88ad8d6793b95118`. index.html 1.37 kB / gzip 0.72 kB.
- Port :4168 verified free (no fallback; --strictPort). :4173 held by rw-217 PID 10320 — NOT touched; only own preview killed.
- Served-bundle identity hard check PASS: served index.html byte-identical to this worktree dist/index.html; served entry chunk sha256 == on-disk dist asset (`8c25322c…`, 868472 B both). recorded in 151-g1-captures.json `servedBundle`.

### typecheck / vitest
- `npm run typecheck` (tsc --noEmit) exit **0**.
- PLAIN `npx vitest run` exit **0**: **112 test files passed, 1517 tests passed** (0 failed). No --maxWorkers; no OOM fallback needed; no bench flake (no rerun). jsdom getContext warnings are expected (canvas pkg absent; real-browser renderer evidence is the capture harness).

## Residual defect
None numeric. All 104 hard checks green; the single previously-failing desktop crop check now passes via tight constant framing. No genuine rendering defect remains (probe + full capture confirm pixel change is real).

## Limitations
- NON-VISION numeric evidence only (sha256/FNV hashes, dataset stamps, decoded save fields, projected bbox). No visual-fidelity claim; visual ACCEPT reserved for the sponsor at the live URL (G1 #151).
- HEADLESS CHROME EMULATION on a desktop host, NOT a physical phone (#190 blocker): viewport/dpr/isMobile/hasTouch emulated; CPU/GPU/thermal/real-touch/mobile-network NOT.
- Frame-time/memory host-relative; a concurrent P02 background loop may add host contention.
- P03 byte ceiling is a product ruling — untouched.

## Status
PR #227 stays DRAFT, "Part of #151". No merge, no ready-for-review, no main push, no ACCEPT/REWORK verdict from this session. Independent QA + product verdict on immutable head cdd87e2 reserved for the coordinator/release engineer.