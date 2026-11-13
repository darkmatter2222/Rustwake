# DEFECT #117 — developer evidence (phoneland furnace tap-selection geometry regression)

- **Issue:** https://github.com/darkmatter2222/Rustwake/issues/117 — `[DEFECT] phoneland furnace tap-selection regressed at 7fcaea1c (logistics-59 03-06)`, gate **G4** blocker.
- **Draft PR:** linked on the issue (body `Refs #117`). This file makes **no merge / gate / deployment claim**.
- **Role / persona:** developer | dev-117 (single shared GitHub account `darkmatter2222`; role distinguished by stamped comments, not by account).
- **Branch:** `rw/117-phoneland-tap`
- **Code head under test (src):** `9fa33c674d3753c4c25e0f70bb13044723584753` — **2 commits** (`30d2e72` App.tsx fit override; `9fa33c67` CSS band + zoom) on base `7fcaea1c12a9fa0cd8bc608f5b0ffadf0b903207` (the regressed head named in the issue). `results.json.buildSha == 9fa33c67`.
- **Evidence head:** this commit — an **EVIDENCE-ONLY child of `9fa33c67`** (no src change). `git diff 9fa33c67 <evidence-head> -- src` is empty; the diff adds only `tests/ui/phoneland-117.evidence/`. Mirrors the #66/#65 evidence split.
- **Oracles run VERBATIM (committed blob == file that ran, asserted by `probe.mjs prove`):**
  | Oracle | git blob (ran == committed) |
  | --- | --- |
  | `tests/ui/logistics-59.probe.mjs` | `b333ee6b044ea8f1c8310b451eca44387ed6219c` |
  | `tests/ui/access-66.evidence.mjs` | `06c6f56af991d17c38798b4d49a26d2875d10a51` |
  | `tests/ui/save-63.evidence.mjs` | `b8a393a06b5ba1fa99d630e63d2cb4b58ec7282e` |
- **Served from:** THIS worktree's own `pnpm build` at `9fa33c67` via `vite preview --host 127.0.0.1 --strictPort` (logistics-59 matrix: **http://127.0.0.1:4195/**; access-66 and save-63 each spawn their own 127.0.0.1 preview). **Never** the live deployment — live parity is the coordinator's POST-MERGE job.
- **Browser:** headless Chrome (playwright-core). **Method:** DOM/geometry/computed-style/console + canvas **pixel census** only. **NO vision.** Agent playtests labelled **AGENT** (not human). Headless emulation is **NOT a physical device**.

## Root cause (MEASURED, not blind-fixed)

On `phoneland-dense` (844×390, dsf2) the furnace (tile 1, top row) could not be selected by canvas tap. The logistics-59 `tapTile` searches the ±15-world-unit Chebyshev pick box for a point where `document.elementFromPoint === canvas`; on the regressed head **no such point existed** for the furnace, so 03-select-furnace failed and cascaded into 04 (×2), 05, 06 — **5 deterministic phoneland failures**. Phone + desktop furnace selection PASS at the same head ⇒ the engine/`pickTarget` is **not** implicated; this is a pure phoneland **tap→selection GEOMETRY** regression.

Measurement chain (scratch `measure-117*.mjs`, since removed):

1. **#66 CSS bounded the lead to ~240px tall on phoneland**, leaving only a **~76px world band** between the lead bottom (248) and the dock top (336).
2. The frozen `BAND_MIN_SCALE = 1.1` floor in `scene.ts` forces the 224-world-unit-tall yard to render at ≥1.1 ⇒ **~246px tall**, far larger than the 76px band. The yard therefore **overflowed under the lead/dock chrome**, painting the top-row furnace beneath opaque HUD so `elementFromPoint` returned HUD, never canvas.
3. A second, compounding geometry bug: phoneland matches **both** the column-mode band `(min-width:600px) and (max-width:1199px)` **and** the short-landscape rail band `(min-width:600px) and (max-height:460px)`. Column mode set `.shell-zoom { top:76px }` while rail mode set `bottom:62px`; **both applied**, stretching the zoom cluster to **252px tall** so its faces covered the top-row machines even once the yard fit the band.

The fix is **geometry only** — no sim/engine/command/economy/save change, and **no frozen-path change**.

## Minimal fix (3 files, +48/-2 vs base `7fcaea1c`)

| File | Change | Why |
| --- | --- | --- |
| `src/ui/App.tsx` (+22) | `fitToShell` whole-yard-fit override: when `usableH > 0 && usableH/(WORLD_H+12) < camera.scale`, lower `camera.scale` to fit the whole yard into the band and re-centre `camera.y` on the band centre. | Removes the frozen-floor overflow so the **entire yard (incl. top-row furnace) is painted inside the band and tap-reachable**. Fires **only** on short-band overflow; tall phone/desktop bands are untouched (`chromeInsets`, `pickTarget`, render loop unchanged). |
| `src/ui/styles.css` (+16/-2) | Short-landscape `@media (min-width:600px) and (max-height:460px)` `:root .hud__lead` cap `max-height: calc(100% - 150px)` → `calc(100% - 280px)`. | Enlarges the world band (lead bottom 248 → **118**, band 76 → **218px**) so the fitted yard renders at scale **~0.873** instead of a marginal ~0.32, giving the rail-band pixel census a **robust margin** over `RAIL_DIFF_MIN=10`. The full-height inspector gutter is independent of this lead cap. |
| `src/ui/shell/shell.css` (+12) | Rail-mode `.shell-zoom` adds `top:auto; right:auto;` before its `bottom:` rule. | Un-stretches the zoom cluster (252px → compact **44×44 row**, y284→328, x110→258) so its faces no longer cover the top-row machines. Desktop (≥1200px) never matches column mode ⇒ unchanged. |

**Frozen paths verified UNCHANGED** (`git diff base..codehead` empty): `src/game/renderer/scene.ts`, `src/game/renderer/camera.ts`, and all three oracles. No STOP-AND-REPORT condition was triggered.

### Final phoneland geometry (after, scale 0.873)

camera `x≈224.31, y≈75.34, scale≈0.873`; lead bottom **118**, dock top **336**, worldBand **218**; zoom faces y284→328 (clear of the top row). Sorter (tile 0) and furnace (tile 1) both report `elementFromPoint === canvas` at centre ⇒ tap-reachable.

## Before / after matrix (logistics-59, 228 checks / 54 steps / 108 frames)

| Run | buildSha | failedChecks | console / page / blockers |
| --- | --- | --- | --- |
| **before** (regressed) | `7fcaea1c` | **6** | 0 / 0 / 0 |
| **after** | `9fa33c67` | **0** | 0 / 0 / 0 |
| **after robustness re-run** | `9fa33c67` | **0** | 0 / 0 / 0 |

The 6 before-fails = the **5 deterministic phoneland failures** (03-select-furnace; 04-custom-duplicate-preview ×2; 05-invalid-commit-rejected; 06-invalid-cancel) **plus 1 pre-existing nondeterministic pixel-census timing flake** (`phone-dense 02-show-routes: showing restores cyan rail pixels`). That phone flake is **not part of #117**: it cleared on re-run, and the phone/desktop cameras are **byte-identical before vs after** (the fix only fires on short-band overflow), so this change cannot cause it. After the fix, **all 228 checks pass twice consecutively**.

### The 5 phoneland checks — before FAIL → after PASS

| Step / check | before | after |
| --- | --- | --- |
| 03-select-furnace-dims-unrelated · real tap selects the furnace | FAIL | **PASS** |
| 04-custom-duplicate-preview · inline custom preview flags the duplicate as invalid | FAIL (`Valid — ready to lay`) | **PASS** (`Invalid — an identical belt already runs…`) |
| 04-custom-duplicate-preview · confirm preview repeats the invalid reason with a Cancel | FAIL | **PASS** |
| 05-invalid-commit-rejected · engine rejects the duplicate (no route laid) | FAIL | **PASS** |
| 06-invalid-cancel · cancel laid no belt (routes unchanged) | FAIL | **PASS** |

### Rail-band census margin (why the band was enlarged, not just fit)

`RAIL_DIFF_MIN = 10`. The working-rail ink set-diff must stay ≥10 across sim-state evolution:

| Scale | railRemoved (hide) | railRestored (show) |
| --- | --- | --- |
| before, floor 1.1 | 163 | 28 |
| after, 0.873 — run 1 | 115 | **19** |
| after, 0.873 — run 2 | 115 | **133** |

An App.tsx-only fix rendered the yard at ~0.32 and let `railRestored` dip to **9 < 10** (marginal/flaky). Enlarging the band to scale 0.873 keeps the robust minimum **19 ≥ 10** across runs.

## Regression oracles (no collateral damage)

| Oracle | Result |
| --- | --- |
| **access-66** (`access-66.evidence.mjs`, VERBATIM) | **16 cells, 0 defects**, `defects=[]`, 17 frames. |
| **save-63** (`save-63.evidence.mjs`, VERBATIM) | phone 394/394, phone-landscape 394/394, desktop 394/394, mirror 2/2 ⇒ **1184 assertions, 0 failures**, 48 frames. |

> save-63 overwrites the tracked `tests/ui/save-63.evidence.json`; it was restored (`git checkout`) after the run so the only committed #63 artifact is this evidence dir. (Charter cited "1186"; the probe's actual total is **1184** = 394×3 + 2 mirror; the gate is **0 failures**, which is met.)

## Ladder receipts (code head `9fa33c67`, force-added under `receipts/`)

| Rung | Command | Result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` (`tsc --noEmit`) | **exit 0** (`receipts/typecheck.log`) |
| Content/behaviour | `pnpm validate` | **exit 0**, **0 violations** (`receipts/validate.log`) |
| Unit suite | `pnpm test -- --minWorkers=4 --maxWorkers=4` | **exit 0** — **60 files / 746 tests passed** (`receipts/vitest.log`) |
| Build | `pnpm build` (`tsc --noEmit && vite build`) | **exit 0** — **124 modules** (`receipts/build.log`) |

### Served build entry receipts (ladder build == probed preview)

| Asset | Bytes | SHA256 |
| --- | --- | --- |
| `dist/assets/index-CEQDUmwp.js` | 191098 | `B85367DA838F1BCFA68D432D975035B0049FBF54E2C3A68083D452BE3B304844` |
| `dist/assets/index-ekc2mZk4.css` | 61957 | `FA11D4ED9299A682DBCDAA1E18830FA027F5F74F20367EAFF7FCDD5EFB5F19AF` |
| `dist/index.html` | 1368 | `7F8F45DDED9C5B88B6E322EDED92A62BCB1189788BC2FC6BEB26FFE8B523DAE3` |

The current worktree `dist` reproduces these exact bytes/hashes — the probed preview == the ladder build at code head `9fa33c67`.

## Frames (counted RECURSIVELY: 187)

| Dir | PNGs |
| --- | --- |
| `frames/logistics-59/` (after) | 108 |
| `frames/logistics-59-before-phoneland/` | 14 |
| `frames/access-66/` | 17 |
| `frames/save-63/` | 48 |
| **total** | **187** |

## Acceptance criteria (#117) — VERIFIED programmatically at `9fa33c67`

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| Furnace (and all machines) canvas tap-reachable on phoneland at default fitted camera | **VERIFIED** | 03-select-furnace PASS; sorter+furnace `elementFromPoint===canvas`; whole yard fits band (scale 0.873). |
| logistics-59 03–06 restored, run VERBATIM | **VERIFIED** | 5 phoneland fails → 0; 228/228 twice; oracle blob == ran. |
| No regression to phone/desktop or other gates | **VERIFIED** | access-66 16/0; save-63 1184/0; phone/desktop cams byte-identical before/after. |
| Minimal, in-scope, frozen paths untouched | **VERIFIED** | 3 files +48/-2; scene.ts/camera.ts/3 oracles unchanged. |
| Ladder green | **VERIFIED** | typecheck/validate/vitest(746)/build(124) all exit 0. |

## Limitations (honest)

- All playtests/geometry are **AGENT headless-Chrome** DOM/geometry/computed-style/console + canvas pixel checks — **not human vision**; no visual/aesthetic inspection is claimed.
- **Headless emulation is NOT a physical device**; real-device touch confirmation remains a post-merge coordinator/product step.
- The pre-existing `phone-dense 02` pixel-census timing flake is nondeterministic and unrelated to #117 (cameras byte-identical before/after); it cleared on re-run.
- **No deployment claim:** evidence is against this branch's own local preview only. Project 1 membership is unverifiable with this token (lacks `read:project`); recorded, never invented.
- This developer handoff does **not** merge, declare gates, flip labels, close the issue, or set status:done — those belong to coordinator + product/release.

## Reproduction

1. `pnpm build` in this worktree at code head `9fa33c67` (produces `dist/assets/index-CEQDUmwp.js` / `index-ekc2mZk4.css`).
2. `node tests/ui/phoneland-117.evidence/probe.mjs prove` — asserts each oracle's working-tree blob == committed blob and `results.json.buildSha` == code head (src diff empty). **PROVE PASS**.
3. `node tests/ui/phoneland-117.evidence/probe.mjs run` — re-runs the three oracles against this worktree's build into scratch (does not touch the committed evidence dir).
4. Ladder: `pnpm typecheck`; `pnpm validate`; `pnpm test -- --minWorkers=4 --maxWorkers=4`; `pnpm build`.
