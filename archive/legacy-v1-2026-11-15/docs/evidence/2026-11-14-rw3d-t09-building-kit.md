# RW3D T09 (#136): five production buildings + wreck from approved kit

- Role: developer (Qwen Code runtime, commissioned per #128)
- Issue: [#136](https://github.com/darkmatter2222/Rustwake/issues/136) — [RW3D][P1][T09]
- Branch: `rw/136-building-kit`, base `origin/main` at `a51c4a6df970154aea810d4d865471603d08b3c5` (G0 passed; T04 kit merged at `4acf7efb`)
- Date: 2026-11-14
- Acceptance: V01 (gameplay scale), V06 (kit validation). **Capable visual inspection PENDING** — open gate at G1 (#151). This document claims numeric/pixel verification only, never visual fidelity acceptance.
- Immutable head SHA and draft PR number: recorded in the role-stamped developer handoff comment on the PR (this doc is committed on the same branch).

## Scope delivered

Additive authoring from the approved kit's 10-token palette and spatial grammar (Y-up RH, +Z frontage, 1 cell = 1 unit, detail quantum 0.125, footprint centered at ground). All 12 baseline recipes keep their validated contracts (validator S7 pins baseline part/group/socket/animation names; the seven untouched assets are pinned exactly). Palette unchanged (deep-equal check).

| Asset | Added parts | Added pivots | Added clips | Sockets (kind) | Rest envelope (min → max) |
| --- | --- | --- | --- | --- | --- |
| warehouse | ventHousing, ventAxle, ventBladeX, ventBladeZ, liftPlatform, liftPallet | ventFan (roof), palletLift | vent_fan (13 s loop), pallet_lift (3 s) | bay0/bay1 (truck) | [-3.05, 0, -2.05] → [3.05, 3.0125, 2.05] |
| depot | doorPanel, ventHousing, ventAxle, ventBladeX, ventBladeZ | door, ventFan (roof) | door_open (1.2 s), vent_fan (17 s loop) | serviceBay (truck) | [-2.05, 0, -2.05] → [2.05, 3.0125, 2.05] |
| sorter | rollerMesh2, gantryPostL/R, gantryBar, magnetBody, magnetTip | roller2, magnet | roller2_work (2 s loop), magnet_sweep (4 s loop) | output (belt) | [-1.3, 0, -1.3] → [1.3, 2, 1.9] |
| furnace | fanHousing, fanBladeY, fanBladeZ, spout, puff | fan, pourSpout, ventPuff | fan_work (1.7 s loop), pour (2.4 s), vent_puff (11 s loop) | input (pallet) | [-1.5, 0, -1.5] → [1.5, 3.625, 1.5] |
| generator | shaftBar | shaft | shaft_drive (1.7 s loop), fan_idle (3.4 s), fan_load_high (0.85 s), fan_start (3.6 s), fan_spin_down (3.6 s) | — (baseline contract) | [-0.85, 0, -0.8] → [0.85, 1.3, 1] |
| wreckSections (NEW) | 11 parts, footprint [3,3] | sectionHull, sectionCab, sectionBed, sectionDebris | none (static; reveal stages owned by #169) | salvage (pallet, approach +Z) | [-1.5, 0, -1.375] → [1.4375, 1.0625, 1.5] |

Product ruling d (verdict 6871139430 on PR #188): the depot door pivot sample-coverage gap is closed here. `doorPanel` (3.2 × 1.625 × 0.25, steel) hangs from the `door` group at [0, 1, 1.875]; `door_open` translates it to [0, 2.625, 1.875]. Closed top 1.8125 ≥ 1.8 lintel; fully-open bottom 1.8125 ≥ 1.8; panel width 3.2 is clearance-locked to `serviceBay.clearanceWidth` (the one verified quantum exception, checked explicitly by S7); bay zone unobstructed through the full travel.

Motion inventory per ART_AND_MOTION: independent vent periods (warehouse 13 s, depot 17 s — no global sync), 1.7 s fans (furnace fan_work, generator fan_powered/shaft_drive), 5 s assembly preserved, generator load response (load_high 0.85 s < idle 3.4 s) plus start/spin-down with strictly increasing/decreasing deg/s profiles ending at 360°, furnace pour +30° about X (spout tip lowers to y = −0.25 local, verified numerically), magnet sweep 0→45→0→315→0°, sparse vent puff scale loop.

## Commands, expected/actual, exit codes

All commands run in the isolated worktree `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-136` (Windows, Git Bash; node v22.18.0, pnpm 10.31.0, Python 3.13.7).

| Command | Expected | Actual | Exit |
| --- | --- | --- | --- |
| `python scripts/build-vision-assets.py` + manifest post-patch | 13 glTFs regenerated; manifest: 6 production/pending, 6 blockout, 26 additionalRequired | as expected (see workflow note below) | 0 |
| `node scripts/rw3d-kit-validate.mjs --json /tmp/rw136-validate.json` | all checks pass, real exit code | total=1147 pass=1147 fail=0 findings=25 (baseline at a51c4a6: 875/875/17) | 0 |
| `pnpm install` in `prototypes/rw3d-buildings` (NODE_EXTRA_CA_CERTS set) | three 0.187.0 EXACT + playwright-core; lockfile committed | three 0.187.0, playwright-core 1.49.1 | 0 |
| `node prototypes/rw3d-buildings/capture.mjs` | all numeric/pixel checks pass | total=47 pass=47 fail=0; THREE.REVISION "187"; Chrome headless SwiftShader, 1600×900 DSF 1 | 0 |
| `npm ci` (worktree root) | root deps from tracked package-lock.json | 161 packages | 0 |
| `npm test` | baseline 63 files / 768 tests + new T09 file green | 64 files / 774 tests passed | 0 |
| `npm run typecheck` | 0 errors | 0 errors | 0 |
| `npm run validate` | 0 violations | content 0, behaviour 0 | 0 |
| `npm run build` | build succeeds | tsc + vite build OK | 0 |

kit.json sha256 `6ab465385e61250aa7e9c16fec7117b4d8cd9786eda886e7423f988e5cde0b82`; asset-manifest.json sha256 `8a75a95cb5ba5c536213ea46d3e1b3d6ac7d14b782d325b91e67dad79aafa4e6` (identical in validator and capture reports).

### Final gate re-verification (handoff)

All five gates re-run on the final working tree (2026-11-14, after WIP checkpoint `f22bcce`): kit validator exit 0 (total=1147 pass=1147 fail=0 findings=25), `npm test` exit 0 (64 files / 774 tests), `npm run typecheck` exit 0, `npm run validate` exit 0 (content 0, behaviour 0), `npm run build` exit 0. Results identical to the table above; kit/manifest sha256 unchanged. `git diff --name-only a51c4a6..HEAD` confirms only allowed write paths changed; `tests/legacy/**` and all forbidden paths untouched.

Capture checks (47): three revision; 0 page errors (×2); per asset: scene AABB vs independent Node AABB, silhouette bounds ±2 px in front/side/iso (expected = union of projected part-box corners, computed Node-side without three.js), ground contact minY=0 in front/side; 8 motion strips with per-frame transforms vs an independent clip sampler (max delta < 1e-6). Mask binarization uses the 50% coverage midpoint (>128) so antialiased iso corners stay within ±1 px.

## Rendered evidence (running build, headless)

46 files under `docs/evidence/`, prefix `2026-11-14-rw3d-t09-`:
- `{id}-{front|side|iso}.png` + `{id}-{view}-mask.png` for all six assets (36), each staged with worker (0.85) and truck (1.18 × 1.25 × 2.5) references at actual gameplay scale.
- `yard-iso.png` — all six authored assets plus worker/truck in one overview.
- 8 motion frame strips: depot door_open (front), warehouse vent_fan (iso) and pallet_lift (side), sorter magnet_sweep (front), furnace pour (side) and vent_puff (iso), generator fan_spin_down and fan_start (front).
- `checks.json` — full expected/actual record, hashes, camera params, per-frame transforms.

These are style-target-quality blockout renders of production geometry for the capable reviewer at G1; they are not visual acceptance.

## Design refinements and fixes during authoring (expected → actual)

1. Sorter roller2 initially planned at (0, 0.625, 0.75) would be fully embedded in the belt box (invisible). Moved to (0, 0.5, 1.375) as a visible exit roller protruding 0.0625 below the belt bottom. Documented refinement, not a baseline change.
2. Gantry z = 1.1 was off-quantum; my new S7 quantum check caught it on first run (1146/1147, exit 1). Fixed four values to 1.125 (gantryPostL/R centers, gantryBar center, magnet position); 45° sweep envelope z-max 1.3902 < 1.5 and x ±0.2652 clears posts at ±0.625. Re-ran green.
3. Capture expected-bounds first used asset AABB corners: correct for front/side, but iso AABB corners are empty space (6 false FAILs). Fixed to union of projected part boxes. Then furnace/iso exceeded ±2 px by 0.15 px due to >250 mask threshold eroding pointy corners; switched to the 50% midpoint. Final 47/47.
4. New vitest file initially used `import.meta.url` (not file-scheme under vitest transform) and node builtins (root tsconfig has no @types/node; root deps are out of scope). Fixed with `__dirname` and a minimal ambient shim `tests/content/rw3d-t09-node.d.ts` (pattern: `tests/simulation/probe-belt.d.ts`). No root config or dependency changes.

## Limitations / open gates

- **Capable visual inspection PENDING** (mandatory at G1 #151). Non-vision authoring: numeric/pixel checks only; no visual fidelity acceptance claimed.
- `scripts/build-vision-assets.py` (outside #136 write paths) hardcodes glTF root `extras.status='reference-blockout-not-production-accepted'` and rewrites manifest status to `blockout` on every run. Workflow: post-patch the manifest after every regeneration (documented in `docs/vision/assets/README.md`); manifest is authoritative. Validator records this as a finding with the actual runtime value.
- Furnace emissive variation: kit schema v1 has no emissive channel; the amber `glow` part is the palette-level representation. Recorded as a validator finding for the renderer/material issue.
- Entity-level inventory sequences (warehouse forklift service, depot chassis assembly/vehicle departure) are represented by vehicle assets and entity transforms, not building clips (finding).
- Production clearance margins and occupancy refinements remain #142/#164; inferred overhangs stay accepted for blockout (sorter output chute z-max 1.9 is baseline geometry). Wreck reveal stages are #169. Crane swing remains clearance, not occupancy; wall_gate 0.05 u blockout rest margin untouched.
- Validator findings total 25 (17 baseline + 8 T09 informational); none failing.

## Save / migration impact

None. Assets are content, not save state. `kit.schemaVersion` stays 1; all schema usage is additive (new parts/groups/animations/sockets within existing fields; manifest gains `status: "production"` + `visualReview`, both accepted additively by the validator). No save format, approval settings, cancellation or security changes. No root dependency, lockfile, permission or configuration changes; root `pnpm-lock.yaml` (untracked) never committed; CRLF phantoms excluded.

## Scope compliance

Write paths used: `docs/vision/assets/**`, `scripts/rw3d-kit-validate.mjs`, new `tests/content/rw3d-t09-*`, `docs/evidence/2026-11-14-rw3d-t09-*`, new `prototypes/rw3d-buildings/**` (own package.json, three 0.187.0 EXACT per ADR-0001, committed pnpm-lock.yaml). Forbidden paths untouched. No direct main pushes, no merges, no self-acceptance; draft PR for independent QA and product verdict.