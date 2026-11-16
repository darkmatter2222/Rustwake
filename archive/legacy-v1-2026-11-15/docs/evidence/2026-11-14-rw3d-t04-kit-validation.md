# RW3D T04 — procedural asset kit validation + scale fixture (V06)

## Evidence header

- **Role:** developer (implementation author; cannot accept own work)
- **Issue:** [#131](https://github.com/darkmatter2222/Rustwake/issues/131) — RW3D T04 (P0): validate procedural asset kit and author scale fixture
- **PR:** [#188](https://github.com/darkmatter2222/Rustwake/pull/188) (draft)
- **Branch:** `rw/131-kit-scale-fixture` (worktree `rw-qwen/131-dev`, base `main`)
- **Immutable head SHA (validated implementation + evidence):** `6e89f0b2dda9d83e5f7ee608e2e934d32fa7c8cd` (this report is the follow-up commit on the same branch; final PR head is recorded in the issue evidence comment)
- **Prerequisite:** #128 accepted at merged SHA `8b78d09f6a1227916fede780eb1682969c49ff1e`
- **Acceptance ID:** V06 — "Asset bounds, sockets, pivots and door clearances conform to recipes. Truck fits warehouse/depot; four rotated footprints match occupancy."
- **QA / product verdict:** PENDING — independent review on the immutable head SHA required; no self-acceptance.

## Scenario, seed, save

- **Scenario:** static validation of the authored kit at rest pose; no simulation, no RNG, no clock-dependent state. Fully deterministic: same inputs → same checks, same pixels (fixed 1600×900 canvas, fixed camera fit).
- **Seed / input hashes:**
  - `docs/vision/assets/kit.json` sha256 `552f441f85ae3e55fd13e138a4530c1105a8cb99e73ab9ad3410ccaf6673f1bc`
  - `docs/vision/assets/asset-manifest.json` sha256 `667c54287cff821ea934e3fa38824dddba9c4658ff571f0dafab347cbc775b76`
  - 12 blockout glTF files under `docs/vision/assets/` (node/hierarchy/animation parity checked per asset).
- **Save hash:** N/A — no save is read or written.
- **Save / migration impact: NONE.** All changes are new files (validator script, self-contained prototype, evidence). No `src/`, root package/lockfile, existing tests, or `docs/vision/assets/*` modifications; no save schema or migration touched.

## Device / browser / quality

- Windows 10.0.26200 x64, Node v22.18.0, pnpm 10.31.0 (npm unusable behind MITM proxy; `NODE_EXTRA_CA_CERTS=C:/Users/ryans/node-extra-ca.pem`).
- Google Chrome 157.0.8103.51 headless (SwiftShader ANGLE), playwright-core 1.49.1, deviceScaleFactor 1, canvas 1600×900.
- Fixture deps pinned in `prototypes/rw3d-scale-fixture/package.json` + own `pnpm-lock.yaml`: three 0.160.0, playwright-core 1.49.1 (fixture-local because the main repo's `node_modules/playwright-core` is an incomplete install — `lib/` only, no package.json; root left untouched).
- Quality: blockout boxes, kit palette, Lambert lighting; orthographic front (+Z), side (+X), iso (yaw 45°, elevation 35.264°) per ART_AND_MOTION default camera. No cinematic replacement art.

## Commands and results (real exit codes)

1. Kit validator (plain node, no new root deps):

   ```sh
   node scripts/rw3d-kit-validate.mjs --json docs/evidence/2026-11-14-rw3d-t04-kit-validate.json
   ```

   **Exit 0 — 875 PASS / 0 FAIL, 17 findings.** Coverage: schema (palette, unique ids/names, integer footprints, +Z frontage, group order/acyclicity, part sizes/materials, socket approach axes, animation targets/arity/strictly-increasing times/unit quaternions, every pivot carries geometry); manifest parity (ids, footprints, part/clip counts, blockout status); glTF parity (2.0, embedded buffers, node names/hierarchy/translation/scale/materials, root extras footprint+sockets, animation channels); bounds (ground float ≤ 0.125 quantum, footprint containment with documented overhang allowances, foundation plates == footprint, crane swing radius, truck width ≤ lane); **all four yaw rotations 0/90/180/270** (occupancy cell sets vs rotated footprint, rotated part-corner bounds, socket permutation vs independent trig-matrix cross-check, frontage +Z→+X→−Z→−X, external sockets at/beyond rotated face with clearance zone inside face width); vehicle clearance from **actual geometry** (required width = max(nominal, actual) + 2×0.15; warehouse door panels width==clearanceWidth, centered, closed covers opening, open retracts above lintel bottom 1.8; bay zones unobstructed within truck envelope height; wall_gate physical gap 1.8 == clearanceWidth, closed panel ground-reaching blocks, open clear 1.35 ≥ truck 1.25; rotated truck cross-sections fit all four rotations; sorter belt socket on belt; truck cargo socket == lift pivot; drone hook below body); scale anchors (worker 0.85 ±0.0625, truck ≈1.0×2.5×1.15 ±0.25, body width 1.0 and length 2.5 exact).

2. Scale fixture capture + numeric pixel checks:

   ```sh
   cd prototypes/rw3d-scale-fixture
   NODE_EXTRA_CA_CERTS=C:/Users/ryans/node-extra-ca.pem pnpm install
   node capture.mjs   # static server 127.0.0.1:4311 (legacy ports avoided)
   ```

   **Exit 0 — 103 PASS / 0 FAIL.** Per asset × view: mask-pass silhouette bounds vs projection of every part's 8 corners through the same orthographic camera (±2 px), aspect (tol max(4%, 2 px)), ground-contact height (front/side). Scale anchors: worker height 0.840 u → 23.2 px expected / 24 px actual; truck height 1.250 u → 34.5 / 35 px; truck length 2.500 u → 72.0 / 73 px; warehouse width 6.100 u → 168.1 / 168 px; depot 4.100 u → 113.0 / 114 px; wall_gate 3.000 u → 82.7 / 83 px. Pixels-per-unit: front 27.56, side 28.80, iso 31.27. No page errors.

## Expected vs actual — notable deviations (findings, not failures)

All 17 findings are recorded verbatim in `2026-11-14-rw3d-t04-kit-validate.json`. Summary:

- Roof overhangs +0.05 (≤ quantum) warehouse/depot; sorter belt +0.4 (+Z, spec-granted); crane swing radius **2.508 u (diameter 5.016)** — spec grants swing clearance without a numeric radius; **product must fix the occupancy rule**.
- Inferred allowances needing product confirmation: forklift forks +0.45 (+Z); turret barrel reach 1.605 > footprint half-extent 1.0; truck wheels widen body 1.0 → 1.18 (still ≤ lane 1.25); drone rotor span 1.7×1.4 over 1×1 landing footprint (airborne; flight height is entity transform per README).
- Blockout floats: truck 0.05, worker 0.04 (≤ quantum).
- Scale anchors vs nominal: worker helmet top 0.880 vs 0.85 (+0.030, within half-quantum); truck wheel-inclusive width 1.180 vs ≈1.0 (+0.180) and cab roof 1.250 vs ≈1.15 (+0.100), within "approximately" tolerance ±0.25. Clearance checks use ACTUAL bounds, so gates remain safe with the as-authored truck.
- **wall_gate open clearance margin only 0.100 u** (1.35 clear vs 1.25 truck height) — tight; product should confirm against production truck art.
- Inventory coverage gaps (kit.json is NOT a T04 write path — owner decision): depot recipe has no door pivot although ART_AND_MOTION lists depot door opening; forklift has no wheel parts although inventory lists wheel turns.

## Screenshots (running build, headless)

- `docs/evidence/2026-11-14-rw3d-t04-fixture-front.png`
- `docs/evidence/2026-11-14-rw3d-t04-fixture-side.png`
- `docs/evidence/2026-11-14-rw3d-t04-fixture-iso.png`

Scale references in frame: 1-unit grid, 5-unit scale bar ("1 cell = 2 m conceptual"), per-asset id/footprint labels, worker as 0.85 u reference. Drone rendered at 1.0 u hover (documented assumption). Front/side rows re-laid along X/Z per view so assets never overlap; iso reuses the X row.

## Motion / audio evidence

None. Rest-pose fixture by design; animation clips validated statically (targets, arity, times, quaternion norms, door end-states) but not played. Motion evidence belongs to later RW3D issues. No audio in scope.

## Capability gaps and limitations

- **Capable visual inspection PENDING.** Non-vision developer: geometric recipes and numeric pixel checks only; visual fidelity (palette feel, readability, silhouette quality) is NOT self-certified. A vision-capable reviewer must inspect the three PNGs from the running build.
- Tolerances are judgment calls where the spec says "approximately" (truck ±0.25 = two quanta; worker ±0.0625 = half quantum); exact expected/actual printed per check so product can tighten.
- Overhang allowances marked "inferred" (forklift forks, turret barrel, truck wheels, drone airborne) are permissive interpretations pending product confirmation; everything else is hard-checked within footprint.
- Pixel checks tolerance ±2 px (antialiasing erosion < 1 px at threshold 250); worker silhouette is ~24 px tall, so small-asset relative precision is limited.
- Kit is blockout status: 27 `additionalRequired` assets in the manifest are not yet authored; V06 here covers the 12 delivered recipes only.
- Fixture renders kit.json recipes directly; glTF delivery parity is covered separately by the validator (both passed).
- Environment deviation: fixture-local playwright-core 1.49.1 because the root install is incomplete; root files untouched.

## Verdict

Developer delivery complete for the scoped outcomes; **ACCEPT/REWORK decision reserved for independent QA + product** on the final immutable PR #188 head SHA (implementation + evidence validated at `6e89f0b2dda9d83e5f7ee608e2e934d32fa7c8cd`; final head recorded in the issue evidence comment). Release engineer merges; no self-acceptance, no direct main push.
