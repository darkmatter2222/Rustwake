# RW3D T07 (#134) — Orthographic camera and reliable selection: developer evidence

- Issue: #134 (T07, Project 2 / Living Voxel World mandate #121)
- Role: developer (non-vision agent; numeric checks only)
- Date: 2026-11-14
- Branch: `rw/134-camera-selection` (worktree `rw-134`), base `a51c4a6d`
- Code SHA stamped in both evidence JSONs: `ebf9b5414ace35014a18b7f9ca410bf37a1d1191`
  (all renderer/harness code; the final commit adds only evidence artifacts under `docs/evidence/`)
- capable visual inspection PENDING (mandatory at G1 #151)

## Scope delivered

- `src/game/renderer/three/cameraRig.ts` (new): orthographic rig sync (`syncOrthoCamera`),
  NDC/pick rays (`castPick`, `castGround`), `projectToScreen`; radius 1024, near 0.1, far 4096.
- `src/game/renderer/three/{index,worldRenderer}.ts`: yaw/elev-aware world sync, raycast
  picking (`pickWorld3D`), context-loss/restore handling, `preserveDrawingBuffer` blit.
- `src/game/renderer/{camera,projection,scene}.ts`: camera math carries yaw/elev through
  pan/zoom/quarter-turn/clamp/refit; `drawScene` composites the three.js world blit + 2D
  information overlay; 2D fallback retained on context loss/unavailable probe.
- `three@0.187.0` pinned EXACT in `package.json` and `package-lock.json`
  (`@types/three@0.187.0` dev); lockfile integrity sha512 recorded. No caret/tilde.
- Tests: six Canvas2D-era suites retired, three numeric 3D suites added, gestures suite
  retargeted to the production reducer + raycast boundary.

## Commands, expected vs actual, real exit codes

All commands run in the `rw-134` worktree on Windows Git Bash, Node v26.3.0,
`NODE_EXTRA_CA_CERTS=C:/Users/ryans/node-extra-ca.pem` exported for the gates.

| Command | Expected | Actual | Exit |
| --- | --- | --- | --- |
| `node tests/renderer/rw3d-t07/bench.mjs` | 14/14 checks, determinism across two 600-frame runs | 14/14 PASS | 0 |
| `node tests/renderer/rw3d-t07/capture.mjs` | 22/22 checks, 8 actual renders | 22/22 PASS | 0 |
| `npm test` | all suites green | 60 files, 693 tests passed | 0 |
| `npm run typecheck` | `tsc --noEmit` clean | clean | 0 |
| `npm run validate` | 0 content/behaviour violations | 0 violations (15 resources, 8 blueprints, 12 recipes, 3 research; behaviour sim 18298 ticks) | 0 |
| `npm run build` | `tsc --noEmit && vite build` succeeds | built in 1.29s; pre-existing-style chunk-size warning (index 730.64 kB, gzip 192.50 kB — three.js weight) | 0 |

## Bench (seed `rw3d-t07-bench-v1`) — `2026-11-14-rw3d-t07-benchmark.json`

Real engine (`decodeSave` + `migrate` of `tests/legacy/fixtures/deep-yard.modern.json`,
7 machines, 2 drones, tick 11704 start), fixed dt = 1 tick/frame, 600-frame scripted
timeline (quarter turns every 150 frames, anchored zoom pulses every 200), run TWICE
from a fresh fixture decode. No RNG, no wall clock in the state path.

- Determinism: final state identical (`tick 12304, machines 7, credits 1437`) and final
  pixel hash identical (`cc383fb2` / `cc383fb2`).
- Frame time (CPU-side render submission): p50 0.1 ms, p95 0.2 ms, p99 0.5 ms, max 1 ms
  (bar: p95 <= 250 ms software tolerance).
- Real pointer clicks through the production gesture reducer + raycast: 5/5 machine-centre
  clicks select the aimed machine; 5/5 empty-corner clicks clear selection.
- Input-to-selection latency (pointerdown -> tap commit, in-page): 10 samples,
  p50 0.3 ms, p95 2.4 ms, max 2.4 ms (bar: p95 <= 250 ms).
- Gesture safety via the real reducer: drag round-trip commits 0 taps; cancelled pinch
  commits 0 taps; fresh gesture after cancel taps exactly once.
- Rasterizer actually used: `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0, D3D11)`
  — real GPU path, SwiftShader NOT forced. Headless Chrome 157, viewport 1440x900 @1x.

## Capture (seed `rw3d-t07-capture-v1`) — `2026-11-14-rw3d-t07-pixels.json`

Actual renders of the production `drawScene` composite (three.js blit + 2D overlay).
Numeric pixel sanity only; no visual-fidelity claim.

| Shot | Result |
| --- | --- |
| `open.png` | 1440x900; stddev 32.49, background fraction 0.4673, amber ink 1256 px, 59 unique colors (flat top-down palette, see calibration note) |
| `orbit.png` | yaw 45 / elev 35.264 / scale 3; 603 colors, stddev 24.49; orbit-vs-top-down pixel diff 0.6264 (> 0.005) |
| `selected.png` | real click at projected machine centre selects machine 1 (raycast); selection ink 642 px (> 50) |
| `quarter.png` | quarter turn yaw 45 -> 135 exact; 996 colors, not blank |
| `inspector-resize.png` | resize to 1000x900 with band {top 64, bottom 96}; player intent survives (scale 3, yaw 135, elev 35.264); dimensions exact |
| `context-lost.png` | `WEBGL_lose_context` -> status `lost`, 2D fallback + banner paints (682 colors); save bytes identical before/after |
| `restored.png` | status back to `ready`, 1030 colors, not blank |
| `phone-emulation.png` | 390x844 @2x desktop emulation -> 780x1688 exact; NOT real phone evidence |

Also numeric: real drag round-trip keeps selection (1 -> 1); hidden tab paints nothing
(diff 0); reduced-motion two sub-tick phases paint identically (diff 0) while full motion
phases differ (diff 0.0024 > 0).

## Suite delta

Baseline at `a51c4a6d`: 768 tests. Retired 114 Canvas2D-era tests:
silhouette 28, scene-draw 43, drone-leg 5, world-60 16 (+ its `world-60.evidence.mjs`),
belt-extent 4, camera-50 18. Added/retargeted 39:
`boundary-3d.test.ts` 9 (new), `camera-3d.test.ts` 16 (new), `raycast-3d.test.ts` 8 (new),
`gestures-50.test.ts` 16 -> 22 (+6, retargeted to reducer + raycast boundary).
768 - 114 + 39 = **693** — matches `npm test` exactly (60 files).

## Harness fixes made during the evidence pass (honest record)

1. `harness.mjs` read `state.drones.length`; the real `SimState` stores `drone` + `spares`.
   Fixed to `fleetUnits(state).length` (first bench run exited 1 on this TypeError).
2. First capture run exited 1 with 21/22: `open not blank` required >200 unique colors but
   the top-down blockout-flat view measured 59 (flat top faces, no shadows, limited palette;
   bench final frame independently measured 62). The color-count heuristic was calibrated on
   orbit views. Recalibrated the OPEN shot only to stddev > 10 AND background fraction < 0.9
   AND amber yard ink > 500 px; orbit/quarter/restored shots keep the >200-color bar.
   Independent evidence the open frame is a genuine 3D composite: status `ready`, raycast
   clicks aligned 5/5, orbit-vs-open diff 0.6264. Both harnesses then re-run clean at
   `ebf9b54` so the stamped SHA contains the exact harness code that produced the evidence.

## Write-path confinement (verified via `git diff --name-status a51c4a6d..HEAD`)

Only: `src/game/renderer/**`, `tests/renderer/**`, `package.json`, `package-lock.json`,
and `docs/evidence/2026-11-14-rw3d-t07-*`. `tests/legacy` untouched (fixture read-only).
No `src/ui` / `src/app` edits. Root `pnpm-lock.yaml` not touched. No CRLF phantom commits.

## Save impact

None. Persistence modules unchanged; fixture round-trips through the existing
`decodeSave`/`migrate`/`encodeSave`; save bytes verified identical across WebGL context
loss/restore. Cancellation, approval settings and security paths untouched.

## Wiring deltas owed to #135 (shell)

- Rendering needs no shell change: `drawScene` already composites the 3D blit + overlay.
- Selection: `src/ui/App.tsx` (~line 950) still resolves taps via `screenToWorld` -> tile.
  Under yaw/elev that ground-plane projection no longer matches rendered bodies; #135 must
  route taps through `pickWorld3D(sx, sy)` (raycast, returns `{ id, point }`) as the harness does.
- Resize: pass inspector band insets through `fitCamera`/`refitCamera` (keep-intent semantics
  demonstrated by the harness `resize(1000, 900, {top:64,bottom:96}, true)`).
- `cameraRig.projectToScreen` is available for anchoring DOM overlays to world points.

## Limitations

- capable visual inspection PENDING (mandatory at G1 #151). Developer is a non-vision agent;
  all image checks are numeric. No visual-fidelity claim is made or implied.
- Full V03 resize coverage (all breakpoint/orientation/inspector combinations) is owed at #151;
  this pass covers one representative inspector resize with intent preservation.
- `renderMs` measures CPU-side render submission; WebGL completion is asynchronous. Real GPU
  (RTX 5090) ran here, but GPU frame pacing on other devices remains unverified.
- Bounded 7-machine yard: P1 population-stress targets are NOT measured here.
- Desktop only; `phone-emulation.png` is desktop emulation, not real-phone evidence (#190 rig).
- Latency excludes compositor present time.
- Build chunk-size warning (index 730.64 kB raw / 192.50 kB gzip) reflects three.js weight;
  code-splitting is a follow-up optimization, not a gate failure.
- Independent QA and product verdict on the immutable PR head SHA are required before merge;
  this handoff is not self-acceptance.