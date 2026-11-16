# RW3D T15 (#142): unit rigs — truck, forklift, crane, drone, worker — V04/V06 evidence

- Date: 2026-11-14
- Role: developer
- Issue: [#142](https://github.com/darkmatter2222/Rustwake/issues/142) (T15, P1; parent #123, master #121)
- Acceptance: V06 (asset bounds/sockets/pivots/clearances), V04 (motion)
- Base SHA: `fee1595547a88a6200ec66ef5ab8a04501b32918` (origin/main at dispatch, post-#200; baseline suite 68 files / 880 tests, validator 1147 checks). No rebase performed. Main advanced during the task via #201 (store/persistence) and #204 (renderer assembly, merge `9a31ffc`); the only path interaction is `kitGeometry.ts`, handled by generator regeneration in §7.
- Branch/worktree: `rw/142-unit-rigs` at `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-142` (main worktree untouched).
- Implementation head: `143711cd536eae82ba1162275c69861a855ef35f` (4 commits: rig kit data/manifest/gltf `28caea4`; geometry fixes `58e3d35`; validator S8 + content tests `bc1c8db`; fixture motion pass `143711c`).
- Gate head: `f28ec77d04a2b959ce7c38cd3ad15a38b2472596` (implementation + validator report + §4.4 erratum + generator/kitGeometry). Final head adds only this document (docs-only); the exact final SHA is stamped in the PR/issue handoff comments.

## 1. What was authored

Five unit rigs re-authored from T04 blockout pivots to production geometry in the single authoring source `docs/vision/assets/kit.json` (detail quantum 0.125; 1 unit = 1 cell, conceptual 2 m). T09 buildings + wreckSections retained unchanged; turret/wall_gate remain references.

| Rig | Footprint | Parts | Pivot groups | Clips | Mechanism groups |
|---|---|---|---|---|---|
| truck | 1×3 | 17 | 11 | 13 | cargo, 6 wheel pivots, body, door-1 / door1 / tailgate (parent body) |
| forklift | 1×2 | 19 | 8 | 8 | lift, tilt (parent lift), forkL / forkR (parent tilt), 4 wheel pivots |
| crane | 3×3 | 11 | 4 | 5 | slew, hoist (parent slew), clawL / clawR (parent hoist) |
| drone | 1×1 | 14 | 5 | 5 | rotor0…rotor3, load |
| worker | 1×1 | 13 | 4 | 8 | leg-1 / arm-1 / leg1 / arm1 |
| **Total** | | **74** | **32** | **39** | |

- Every mechanism has a dedicated pivot group carrying its own geometry (validator `t15:mechanisms`, 37 checks). T04 baseline pivot positions are preserved and pinned (`t15:baseline`, 18 checks); geometry around them is re-authored quantum-clean (`t15:reauthored`, 13 checks).
- Geometry fixes (`58e3d35`): door hinges/panels quantum-clean, forks spread outward, hoist cable attached boom-to-claw, skid struts quantum-clean.
- Disclosed exceptions (validator findings, not silent): worker boots/vest/torch are sub-quantum personal-scale detail by verified exception matching the grandfathered T04 worker (grounding/mirroring checked instead of quantum snap); forklift forkL/forkR pivot offsets are the relocated T04 fork part centers (sub-quantum y=-0.05 / z=0.4 inherited), world geometry preserved and pinned exactly.
- Manifest (`docs/vision/assets/asset-manifest.json`): all five rigs `status: "production"`, `visualReview: "pending"`; committed post-patch for a reproducible pipeline (§4).

## 2. Separately animatable groups — isolation proof

Acceptance criterion: doors/wheels/forks/rotors/hoist groups separately animatable. Proven twice, independently:

**Validator S8 scene-graph proof** (`scripts/rw3d-kit-validate.mjs`, `t15:independence`, 78 checks = 39 clips × {mid, end}): playing any single clip moves only its target subtree; every non-subtree pivot is bit-stable. Channel semantics pinned by `t15:motion` (24 checks): continuous channels loop (wheel rolls, rotor spins, walk, operate/weld), event channels hold (doors, tailgate, lift, hoist, grip, cargo_attach, carry); door yaw ±60°, panels swing outward (tips ∓0.433), tailgate −90° X fold, steer −30° paired, suspension −0.125 dip-and-return, full 360° wheel/rotor turns (identity → on-axis 180° → ±identity quaternions), fork spread ±0.125, mast tilt +10°, slew 0/90/90/0, hoist travel 0.125 (one quantum), grip ±0.125, contralateral walk, carry −68.7549°.

**Fixture motion pass** (`143711c`, running build, three 0.187.0 rev 187): `prototypes/rw3d-scale-fixture/main.js` plays glTF channels with REPLACE local-TRS / LINEAR=slerp semantics; `capture.mjs` samples every clip at mid and end (78 samples):

- Target moves > 1e-6 (pos or rad) at mid, or — for the 18 returning clips (loop rolls/spins, slew return, suspension, load_pallet) — matches rest ≤ 1e-9 at end; the other 21 clips stay displaced > 1e-6 at end.
- **Every non-subtree pivot group: max deviation 0 across all 78 samples** (bit-stable; `isolation[].samples[].maxDev = 0`, `fixedPass = true` throughout).
- Clip inventory vs kit.json: 39/39 clips + 5/5 clip-set checks pass (no missing/extra, target/path/times/loop/duration exact).

Report: [2026-11-14-rw3d-t15-fixture-motion.json](2026-11-14-rw3d-t15-fixture-motion.json) — 260/260 pass, exit 0 (§6).

**Posed renders** (2 composed poses × 3 views, all five rigs moving simultaneously; silhouette bounds + aspect per rig per frame, 60/60 pass):

| Pose | truck | forklift | crane | drone | worker |
|---|---|---|---|---|---|
| a | door_open-1 @ t=0.8 | lift_pallet @ t=1.4 | hoist_place @ t=1.8 | cargo_attach @ t=1.0 | carry_arm1 @ t=0.5 |
| b | tailgate_open @ t=0.9 | fork_spread_R @ t=0.6 | slew_rotate @ t=2.5 | rotor1_spin @ t=0.075 | walk_leg @ t=0.35 |

- [motion-a-front](2026-11-14-rw3d-t15-fixture-motion-a-front.png) / [motion-a-side](2026-11-14-rw3d-t15-fixture-motion-a-side.png) / [motion-a-iso](2026-11-14-rw3d-t15-fixture-motion-a-iso.png)
- [motion-b-front](2026-11-14-rw3d-t15-fixture-motion-b-front.png) / [motion-b-side](2026-11-14-rw3d-t15-fixture-motion-b-side.png) / [motion-b-iso](2026-11-14-rw3d-t15-fixture-motion-b-iso.png)

## 3. Cargo envelopes fit bays and worker scale (numeric)

All values from the committed validator report (`t15:cargo` 9 checks, `scale:*` 6, `clearance:*`), measured against ACTUAL rig bounds:

| Check | Expected | Actual |
|---|---|---|
| Pallet rests on bed (pallet bottom == bed top) | 0.75 | 0.75 |
| Pallet footprint inside bed XZ | pallet [[−0.4,−1],[0.4,0.1]] ⊂ bed [[−0.5,−1],[0.5,0.25]] | inside |
| Pallet width ≤ cargo socket clearanceWidth | 0.8 | 0.8 |
| Pallet longest dim ≤ truck nominal length | 2.5 | 1.1 |
| Drone crate worker-scale (≤ workerHeight 0.85) | 0.85 | 0.45 |
| Drone crate ≤ hook clearanceWidth | 0.45 | 0.45 |
| Full-spread fork outer edge ≥ pallet half-width | 0.4 | 0.435 |
| Crane cable reaches boom underside at lowest hoist | ≥ 2.45 | 2.675 |
| Claw clears loaded pallet top at lowest hoist | ≥ 1.25 | 1.3625 |

- `load_pallet` lowers the pallet 0.75 (6 quanta) from [0, 1.55, −0.45] onto the cargo rest [0, 0.8, −0.45]; cargo socket == cargo pivot position exactly.
- Drone hook at y=−0.15 hangs below body underside 0.275; `cargo_attach` lowers the load 0.5.
- Bay fit: warehouse bay0/bay1 clearanceWidth 2.2 and depot serviceBay 3.2 verified at all four rotations (validator clearance sections); truck envelope 1.18 × 2.5 × 1.25 fits.
- wall_gate passage: gap 1.8 ≥ envelope 1.18 + 0.15/side = 1.48; open clear height 1.35 ≥ actual truck height 1.25 (margin 0.10 — tight, product to confirm); closed gate ground-reaching panel blocks the truck.
- Worker scale: height 0.88 vs nominal 0.85 ± 0.0625 (helmet top +0.03, within half-quantum); feet grounded at 0.000.
- Truck envelope: width 1.18 wheel-inclusive (body excl. wheels exactly 1.0), length 2.5 exact, height 1.25 cab roof (nominal 1.15, within spec "approximately" tol 0.25). Clearance checks use ACTUAL bounds, not nominal.

## 4. Original editable recipes + regenerated gltf pipeline

- Editable recipe: `docs/vision/assets/kit.json` — single authoring source (parts, groups, pivots, sockets, animations, palette). No binary assets; every part is a parametric box recipe.
- Rendered output: `docs/vision/assets/generated/{truck,forklift,crane,drone,worker}.gltf` regenerated from the recipe.
- Reproducible pipeline (manifest committed post-patch at `58e3d35`):
  1. `python scripts/build-vision-assets.py` — regenerates every glTF from kit.json; rewrites manifest status to "blockout" (generator behavior, outside this issue's write paths).
  2. `node docs/vision/assets/postpatch-manifest.mjs` — deterministic policy layer restoring `status: "production"` + `visualReview: "pending"` for the 11 production assets (T09 six + T15 five) and the authoritative status note.
- Known limitation (validator finding): the python generator hardcodes glTF root `extras.status='undefined'`; the manifest is authoritative for acceptance status. Generator wording fix is outside #136/#142 write paths.

## 5. Validator S8 contracts + content tests

`scripts/rw3d-kit-validate.mjs` extended by #142 (`extendedBy: [136, 142]`): **1524/1524 pass, 0 fail, 30 findings, exit 0** (base 1147 → +377; CI `total >= 1147` stays true). Report: [2026-11-14-rw3d-t15-validator.json](2026-11-14-rw3d-t15-validator.json), `kitSha256 e27cd00f52644454785f4f5b39fe5ec82f5729b14adf4684b8a82c1c070f42c5`, `manifestSha256 1dd57e08e65ac41bf4b789605d8d82efc18d27c95d49ade1009aa4cf11f8f43c` (both re-verified against the working tree at gate head).

T15 contract sections (208 checks): `t15:authored` 29 (production status/counts per rig), `t15:baseline` 18 (T04 pivot inheritance), `t15:reauthored` 13 (quantum-clean re-authored geometry), `t15:mechanisms` 37 (mechanism→pivot coverage), `t15:independence` 78 (scene-graph motion isolation), `t15:motion` 24 (direction/loop/travel semantics), `t15:cargo` 9 (envelope fit). Plus `scale:truck` 5, `scale:worker` 1, `clearance:truck.cargo` 1, `clearance:drone.hook` 1.

Content tests: `tests/content/rw3d-t15-rigs.test.ts` — 10 tests (production/visual-pending marking; part/group/clip count pins; mechanism pivot coverage; separate animatability; T04 baseline pivots; cargo envelope fit; worker grounding/scale; channel well-formedness; loop-vs-event semantics; authoring constants). The T09 test hands rig counts to the T15 test (no duplicate pinning).

Findings (30): 11 "capable visual inspection PENDING" notices (one per production asset), 17 carried findings retained with their owners (not absorbed), 2 new T15 disclosures (worker sub-quantum detail exception; forklift fork pivot inheritance). Key product-facing items: crane swing radius 2.508 (diameter 5.016) needs an occupancy rule; drone rotor span 1.7×1.4 over 1×1 footprint is an inferred airborne allowance; wall_gate margin 0.10 is tight; truck floats 0.05 (≤ one quantum, blockout artifact).

## 6. Fixture re-run against the ACTUAL current kit (carried #194/#200 obligation)

Base-relative re-run of the scale fixture against the actual 13-asset kit (13 assets incl. the five T15 rigs; `kitSha256` identical to the validator report). Rigged against ACTUAL bounds, real counts:

- Environment: three **0.187.0 exact** (browser `THREE.REVISION` 187, fail-fast pin guard), playwright-core 1.49.1, installed Chrome headless, canvas 1600×900, port 4312, `TOL_PX=2`, mask silhouette threshold <250, hoverUnits 1. Fixture is self-contained (own package.json + package-lock.json; root package/lockfiles untouched).
- **Rest pass: 111/111, exit 0** = 39 silhouette-bounds + 39 aspect (13 assets × 3 views) + 26 ground-contact (front/side) + 6 scale anchors (front 5, side 1; worker height 0.88 u etc.) + 1 no-page-errors. Report: [2026-11-14-rw3d-t15-fixture-checks.json](2026-11-14-rw3d-t15-fixture-checks.json). Renders: [front](2026-11-14-rw3d-t15-fixture-front.png), [side](2026-11-14-rw3d-t15-fixture-side.png), [iso](2026-11-14-rw3d-t15-fixture-iso.png).
- **Motion pass: 260/260, exit 0** = 44 inventory (39 clips + 5 sets) + 156 isolation (78 samples × {non-subtree fixed, target moves/returns}) + 60 posed-frame checks (6 frames × 5 rigs × {bounds, aspect}). Report: [2026-11-14-rw3d-t15-fixture-motion.json](2026-11-14-rw3d-t15-fixture-motion.json).
- **Combined 371/371, exit 0; byte-identical across two runs** (deterministic: static rest pose, fixed camera fit/canvas/clip sample times, no RNG, no clock-dependent scene state).
- Fit ppu: rest front 25.0584, side 26.2181, iso 28.7123 (T05a iso was 31.2747 — the larger rig envelopes lowered the global fit ~8.2%; pose-b iso 28.5317 with slew rotated).
- Harness correction (disclosed, not a tolerance relaxation): aspect tolerance now propagates the same ±2 px corner budget as the bounds check, `(TOL_PX/h)(1+w/h)`; the old `TOL_PX/h` ignored width error and under-bound small silhouettes after the ppu drop (turret/wreckSections failed aspect on the first run while bounds passed). Same 2 px budget, correctly propagated.
- Reproduce: `cd prototypes/rw3d-scale-fixture && npm install && FIXTURE_PREFIX=2026-11-14-rw3d-t15-fixture PORT=4312 npm run capture` (exit 0 iff every rest AND motion check passes).

## 7. Kit parity / #204 interaction (deviation disclosure)

At base `fee1595` (pre-#204) neither `src/game/renderer/kitGeometry.ts` nor `tests/renderer/generate-kit-geometry.mjs` existed in this worktree; the prior session deferred regeneration while #204 was unmerged. #204 merged to main at `9a31ffc` during this task. Per dispatch, **no rebase** was performed. Instead:

1. Extracted `tests/renderer/generate-kit-geometry.mjs` **byte-identical** from origin/main (blob `94ab443e3402e40a38c955f464065d16d1f66e30`, verified via `git hash-object`) — identical content on both sides merges cleanly.
2. Ran `node tests/renderer/generate-kit-geometry.mjs` twice against the T15 kit.json: outputs **byte-identical (idempotent)**. The generator is the only sanctioned writer; no hand edits.
3. Delta vs main's embedded table: **crane-only additions** — 2 groups (clawL/clawR under hoist) + 6 parts (counterweight, supportArm, cab, cabWindow, clawLBlade, clawRBlade). Palette (10 tokens) and the other seven placeables unchanged; `src/game/world/kit.ts` is identical between base and main, so the generated module typechecks at this base.
4. Merge note: `kitGeometry.ts` is an add/add at merge (main embedded the pre-T15 crane). Resolution is this regenerated version — equivalently, re-run the generator post-merge; `tests/renderer/assembly-kit-parity.test.ts` (from #204) enforces parity either way. The generator embeds only the eight placeable assets; truck/forklift/drone/worker are mobile units outside `WorldAssetId` and reach the renderer via entity transforms, not the embedded table.

## 8. Gates (real exit codes, run once at gate head f28ec77)

| Gate | Command | Result | Exit code |
|---|---|---|---|
| Typecheck | `npm run typecheck` | clean (incl. regenerated kitGeometry.ts) | 0 |
| Content validate | `npm run validate` | 0 violations (15 resources, 8 blueprints, 12 recipes, 3 research; behaviour sim clean) | 0 |
| Kit validator | `node scripts/rw3d-kit-validate.mjs` | SUMMARY total=1524 pass=1524 fail=0 findings=30 | 0 |
| Tests | `npm test` | **69 files / 890 tests passed** (9.71 s) | 0 |
| Build | `npm run build` | tsc + vite build OK (pre-existing >500 kB chunk warning, unchanged) | 0 |

Baseline delta at base `fee1595`: **68 files / 880 tests → 69 files / 890 tests (+1 file / +10 tests**, `tests/content/rw3d-t15-rigs.test.ts`); validator **1147 → 1524 (+377)**. The final head adds only this evidence document on top of the gate head (docs-only, no code delta); the handoff comments stamp the final SHA.

Carried §4.4 erratum applied by reference in [2026-11-14-rw3d-t05a-fixture-align.md](2026-11-14-rw3d-t05a-fixture-align.md) §4.4: "55 fields" = 44 `expected` + 11 `groundPx` source fields; full leaf diff 84 incl 29 derived `deltas` (re-verified from the committed T04/T05a checks JSONs; max |Δ| 2.2737e-13 px). Original text preserved.

## 9. Limitations, save/migration impact, findings ownership

1. **Non-vision authoring: capable visual inspection PENDING — owed at G1 (#151).** All renders/motion frames are numerical/geometric evidence from the running build, not visual acceptance. All 11 production assets carry `visualReview: "pending"`; generated references elsewhere remain style targets, not implementation proof.
2. Crane swing radius 2.508 units (diameter 5.016) about footprint center: spec grants swing clearance without a numeric radius — product must fix the occupancy rule.
3. Drone airborne rotor span 1.7×1.4 exceeds the 1×1 landing footprint; flight height is entity transform per README — inferred allowance, product confirmation needed.
4. wall_gate open clearance margin over actual truck height is only 0.100 (1.35 vs 1.25) — tight; confirm against production truck art.
5. Truck floats 0.050 above ground (blockout artifact ≤ one quantum); wheel-inclusive width 1.18 vs nominal 1.0 and cab roof 1.25 vs 1.15 are within "approximately" tolerance; clearances use ACTUAL bounds.
6. Worker helmet top 0.880 vs nominal 0.85 (+0.030, within half-quantum); boots/vest/torch sub-quantum by verified exception; forklift fork pivots inherit sub-quantum T04 offsets, pinned exactly.
7. glTF root `extras.status` wording is generator-hardcoded; manifest is authoritative (§4). Furnace emissive variation and entity-level inventory sequences remain deferred per carried findings.
8. **Save/migration/recovery: no impact.** kit.json is authoring data; no persistence schema, save format, or migration change; the renderer embeds geometry via the regenerated table and never reads docs at runtime. No unrelated infrastructure changes: root package.json/lockfiles untouched; fixture keeps three 0.187.0 exact + its own package-lock.json; write paths confined to the dispatch grant.
9. The 17 carried validator findings stay with their owners; none were silently absorbed or resolved here.
10. `kitGeometry.ts` add/add merge resolution documented in §7 (parity test enforces correctness post-merge).

## 10. Acceptance mapping

| Issue criterion | Evidence |
|---|---|
| Doors/wheels/forks/rotors/hoist separately animatable | §2: 37 mechanism + 78 independence validator checks; 156 fixture isolation checks, non-subtree deviation 0; 39 clips inventory-exact |
| Cargo envelopes fit bays and worker scale | §3: 9 cargo + 6 scale + clearance checks, numeric expected/actual |
| Original editable recipes + rendered fixture | §4 recipe/pipeline; §6 rest + posed PNGs from the running build |
| Reproducible seed/state, expected/actual, real exit codes | §6 deterministic fixture (no RNG) + repro command; §5/§8 expected/actual JSONs and exit codes |
| Independent review at immutable head; actual renders/motion + capable inspection | Renders/motion committed; review owed at PR head; **capable visual inspection PENDING (G1 #151)** |
| Save/migration/recovery impact + limitations; no unrelated infra | §9 |

## 11. Evidence artifacts (all committed)

- Rest: [front](2026-11-14-rw3d-t15-fixture-front.png), [side](2026-11-14-rw3d-t15-fixture-side.png), [iso](2026-11-14-rw3d-t15-fixture-iso.png), [checks.json](2026-11-14-rw3d-t15-fixture-checks.json) (111 checks)
- Motion: [a-front](2026-11-14-rw3d-t15-fixture-motion-a-front.png), [a-side](2026-11-14-rw3d-t15-fixture-motion-a-side.png), [a-iso](2026-11-14-rw3d-t15-fixture-motion-a-iso.png), [b-front](2026-11-14-rw3d-t15-fixture-motion-b-front.png), [b-side](2026-11-14-rw3d-t15-fixture-motion-b-side.png), [b-iso](2026-11-14-rw3d-t15-fixture-motion-b-iso.png), [motion.json](2026-11-14-rw3d-t15-fixture-motion.json) (260 checks)
- Validator: [t15-validator.json](2026-11-14-rw3d-t15-validator.json) (1524 checks + 30 findings)
- Erratum: [t05a-fixture-align.md](2026-11-14-rw3d-t05a-fixture-align.md) §4.4 (by reference)