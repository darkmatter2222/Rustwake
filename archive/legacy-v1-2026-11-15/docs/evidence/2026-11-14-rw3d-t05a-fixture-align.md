# RW3D T05a (#194): scale fixture aligned to three 0.187.0 — V06 capture re-run

- Date: 2026-11-14
- Role: developer
- Issue: [#194](https://github.com/darkmatter2222/Rustwake/issues/194) (T05a, P1; parent #122, master #121)
- Acceptance: V06 (asset bounds/sockets/pivots/clearances; scale fixture characterization)
- Policy: [ADR-0001](../vision/architecture/adr-0001-renderer.md) §2 (exact project pin) and §4 (ALIGN ruling, re-pin + re-capture with unchanged tolerances)
- Base SHA: `a51c4a6df970154aea810d4d865471603d08b3c5` (origin/main at dispatch; G0 passed). No rebase performed; PR #196 (kit extension) may land concurrently — counts below are at THIS base.
- Branch/worktree: `rw/194-fixture-three-align` at `C:/Users/ryans/AppData/Local/Temp/rw-qwen/rw-194` (main worktree untouched).

## 1. Version change

| Item | Before (T04, PR #188) | After (this change) |
|---|---|---|
| `prototypes/rw3d-scale-fixture` three pin | `0.160.0` (exact) | `0.187.0` (exact, no `^`/`~`) |
| three revision reported by browser (`THREE.REVISION`) | `160` | `187` |
| Fixture lockfile | `pnpm-lock.yaml` (lockfileVersion 9, three 0.160.0) | `package-lock.json` (lockfileVersion 3, three resolved `https://registry.npmjs.org/three/-/three-0.187.0.tgz`) |
| `playwright-core` (fixture devDependency) | `1.49.1` exact | `1.49.1` exact (unchanged) |
| `@types/three` | not present | not present (nothing to align) |

Lockfile note: the task directs updating the fixture lockfile via npm. The fixture now carries a single npm `package-lock.json`; the stale `pnpm-lock.yaml` (still pinning 0.160.0) was removed so there is one lockfile truth per ADR-0001 §2.1. Root lockfiles were not touched.

## 2. Harness changes (plumbing only — tolerances UNCHANGED)

`prototypes/rw3d-scale-fixture/capture.mjs`, three surgical edits; no check logic, threshold, camera, scene or tolerance was modified (`TOL_PX = 2`, aspect tol `max(0.04, 2/h)`, silhouette threshold `<250` all unchanged):

1. `FIXTURE_PREFIX` env override for the evidence filename prefix (default remains the T04 names). This run used `2026-11-14-rw3d-t05a-fixture` so the prior committed T04 evidence stays intact for byte-compare (T04 evidence paths are outside this issue's write paths).
2. `meta.three` now reports the INSTALLED three version read from `node_modules/three/package.json` (was hardcoded `"0.160.0"`, which would have mislabeled this run), plus a fail-fast guard if the installed version differs from the fixture's exact pin.
3. Usage comment updated `pnpm install && pnpm capture` -> `npm install && npm run capture`.

`main.js`, `index.html`, `scripts/rw3d-kit-validate.mjs` and `docs/vision/assets/**` were NOT modified.

## 3. Method

- Device: Windows 11 Pro build 26200 (declared environment), Node v22.18.0, npm 10.9.3.
- Browser: Google Chrome 157.0.8103.51, headless via playwright-core 1.49.1 with the harness's standard args `--enable-unsafe-swiftshader --use-angle=swiftshader` (SwiftShader software GL — the fixture's established capture path, same as T04; NOT the real-GPU path used by the T03 spike benchmark).
- `npm install` in `prototypes/rw3d-scale-fixture` (NODE_EXTRA_CA_CERTS set) -> installed three 0.187.0, wrote `package-lock.json`.
- Capture: `PORT=4394 FIXTURE_PREFIX=2026-11-14-rw3d-t05a-fixture node capture.mjs` from the fixture dir. Port note: default 4311 was occupied by a concurrent session (EADDRINUSE on first attempt, exit 1 before any check ran); 4394 used instead. The static server is localhost-only; port has no effect on scene, camera or pixels. Canvas 1600x900 @1x, static rest pose, orthographic front/side/iso, 12 kit assets.
- Validator: `node scripts/rw3d-kit-validate.mjs --json docs/evidence/2026-11-14-rw3d-t05a-kit-validate.json` from the worktree root (script unmodified).
- Root gates: `npm ci`, `npm run typecheck`, `npm run validate`, `npm test`, `npm run build` at the worktree root.
- Byte-compare: prior committed T04 PNGs/checks at base SHA copied aside before the run; `cmp` + sha256 against the new captures; checks JSON deep-diffed field-by-field.

## 4. Results

### 4.1 Fixture capture (V06 numeric/pixel checks)

| Run | three | total | pass | fail | exit code |
|---|---|---|---|---|---|
| T04 prior (committed at base) | 0.160.0 | 103 | 103 | 0 | 0 |
| T05a this run | 0.187.0 | 103 | 103 | 0 | 0 |

All 103 checks green with UNCHANGED tolerances: 72 silhouette-bounds checks (12 assets x 3 views x 2 [bounds+aspect] = 72), 24 ground-contact checks (front+side), 6 scale anchors (front 5, side 1), 1 no-page-errors check. Report: [2026-11-14-rw3d-t05a-fixture-checks.json](2026-11-14-rw3d-t05a-fixture-checks.json) (`meta.three = 0.187.0`, `threeRevision = 187`, `tolerancePx = 2`).

### 4.2 Kit validator

| Run | total | pass | fail | findings | exit code |
|---|---|---|---|---|---|
| T04 prior (committed at base) | 875 | 875 | 0 | 17 | 0 |
| T05a this run (at base a51c4a6) | 875 | 875 | 0 | 17 | 0 |

Check arrays are deep-equal between runs and `kitSha256` matches (`552f441f85ae3e55fd13e138a4530c1105a8cb99e73ab9ad3410ccaf6673f1bc`) — expected, since the validator is plain node reading kit.json and is three-version-independent. Report: [2026-11-14-rw3d-t05a-kit-validate.json](2026-11-14-rw3d-t05a-kit-validate.json).

Count reconciliation: 875 is the pre-#196 count at this base. After PR #196 (kit extension) lands on main the validator grows to 1147 checks; this PR does not rebase mid-task, so the reviewer reconciles the count at merge. The 17 findings are the same pre-existing T04 findings (approximate-anchor disclosures and blockout coverage gaps); none are new and none fail the run.

### 4.3 PNG byte-compare (new 0.187.0 captures vs prior committed 0.160.0 captures)

| View | Prior sha256 (T04, 0.160.0) | New sha256 (T05a, 0.187.0) | Bytes (old/new) | Result |
|---|---|---|---|---|
| front | `6f41574e639ff780c9697d4d36887201d2e10cd8044e27ee26d64390e0d81d86` | `6f41574e639ff780c9697d4d36887201d2e10cd8044e27ee26d64390e0d81d86` | 33288 / 33288 | BYTE-IDENTICAL |
| side | `3cf0701ebe430b2b5eabd5268a4388a45b6aff6e9f9df671a8489031458acf72` | `3cf0701ebe430b2b5eabd5268a4388a45b6aff6e9f9df671a8489031458acf72` | 33942 / 33942 | BYTE-IDENTICAL |
| iso | `033091f646edb216dbbc8447eb64182c3f5faf766302a15ef650f403332f6bb1` | `033091f646edb216dbbc8447eb64182c3f5faf766302a15ef650f403332f6bb1` | 173656 / 173656 | BYTE-IDENTICAL |

Delta report: ZERO pixel delta. All three beauty-pass PNGs are byte-for-byte identical across the 0.160.0 -> 0.187.0 bump on this scene (flat-shaded `MeshLambertMaterial` boxes, hemisphere + directional light, orthographic camera, SwiftShader). No tolerance was relaxed; none needed to be. This is disclosed as a measured outcome, not an assumption: had pixels shifted, the deltas would be listed here per ADR-0001 §4.3.

### 4.4 Checks-JSON numeric delta (expected/actual geometry)

- Front and side view reports: deep-equal except the `png` path field (prefix change).
- Iso view: 55 numeric fields differ across `expected` projected corners, `groundPx` and derived `deltas` for all 12 assets. Maximum absolute difference: **2.27e-13 px** (e.g. warehouse `expected.y0` 71.30524451495909 -> 71.30524451495924). This is last-ULP floating-point noise in three's projection math path between r160 and r187, ~11 orders of magnitude below the 2 px tolerance.
- `actual` measured silhouettes: 0 of 36 asset measurements differ in any view. `ppu` identical in all views (iso 31.2747443536306). All pass/fail outcomes identical.

> **Erratum (2026-11-14, applied in the #142 evidence pass; original text preserved above by reference).** The "55 numeric fields" count in the iso bullet covers only the *source* fields: **44 `expected` projected-corner fields + 11 `groundPx` source fields**. The full leaf diff is **84 numeric fields, including 29 derived `deltas` fields** recomputed from those sources; the original wording conflated the source-field count with the full diff. Re-verified for #142 by leaf-comparing the committed [2026-11-14-rw3d-t04-fixture-checks.json](2026-11-14-rw3d-t04-fixture-checks.json) against [2026-11-14-rw3d-t05a-fixture-checks.json](2026-11-14-rw3d-t05a-fixture-checks.json) (iso view): 44 `expected` + 11 `groundPx` + 29 `deltas` = 84 differing numeric leaves, 0 other-field diffs, max |Δ| 2.2737e-13 px. Measured values, tolerances and conclusions are unchanged. Carried obligation from the #194/#200 release (product verdict 6874338930, receipts 6874774272 / 6874774454), authorized by coordinator guidance 6874976933.

### 4.5 Root gates (isolation proof)

| Gate | Command | Result | Exit code |
|---|---|---|---|
| Install | `npm ci` | 161 packages | 0 |
| Typecheck | `npm run typecheck` | clean | 0 |
| Content validate | `npm run validate` | 0 violations | 0 |
| Tests | `npm test` | 63 files / 768 tests passed (matches baseline at this base) | 0 |
| Build | `npm run build` | tsc + vite build OK | 0 |

The fixture is self-contained (own package.json/lockfile/node_modules); root `package.json` and root lockfiles are unchanged in this PR.

## 5. Evidence artifacts

- [2026-11-14-rw3d-t05a-fixture-front.png](2026-11-14-rw3d-t05a-fixture-front.png) (33288 B)
- [2026-11-14-rw3d-t05a-fixture-side.png](2026-11-14-rw3d-t05a-fixture-side.png) (33942 B)
- [2026-11-14-rw3d-t05a-fixture-iso.png](2026-11-14-rw3d-t05a-fixture-iso.png) (173656 B)
- [2026-11-14-rw3d-t05a-fixture-checks.json](2026-11-14-rw3d-t05a-fixture-checks.json) (103 checks, expected/actual per check)
- [2026-11-14-rw3d-t05a-kit-validate.json](2026-11-14-rw3d-t05a-kit-validate.json) (875 checks + 17 findings)
- Prior T04 evidence (`2026-11-14-rw3d-t04-fixture-*`, `2026-11-14-rw3d-t04-kit-validate.json`) preserved unmodified at base for comparison.

## 6. Limitations and findings

1. **Numeric/pixel characterization only.** Non-vision authoring: visual fidelity is NOT certified by this evidence. Capable visual inspection remains PENDING, owed at G1 (#151), consistent with T04 product ruling g (visual acceptance expressly withheld).
2. **SwiftShader software GL**, the fixture's established headless path (same as T04). Real-GPU rendering may differ; the T03 spike benchmark (real RTX 5090, three 0.187.0) remains the project's measured performance basis. This issue is the ADR-0001 §4 capture re-run; the spike's pin was already 0.187.0, so no spike re-benchmark is triggered by this fixture-only alignment (ADR §2.2 applies to bumps of the benchmarked package).
3. **Single device/OS/browser** (declared environment above); no cross-device matrix is claimed.
4. **Validator count is base-relative**: 875 at base a51c4a6 (pre-#196). Reviewer reconciles against 1147 if #196 has landed at merge. No rebase was performed mid-task.
5. **No new findings**: all 17 validator findings are pre-existing T04 disclosures; zero check failures at either version; zero pixel deltas; only sub-ULP projection noise in iso expected values.
6. Fixture remains a blockout-scale characterization tool (V06 scoped acceptance at T04 stands); this alignment removes the "provisionally aligned-pending" caveat of ADR-0001 §4 once merged: new pixel-level V06 claims from this fixture are produced by three 0.187.0, the project pin.

## 7. Handoff

Draft PR linked `Closes #194`; independent QA + product verdict on the immutable head SHA, then release engineer merge and main CI verification. No self-acceptance. Must land before #142 (T15) re-runs the fixture.