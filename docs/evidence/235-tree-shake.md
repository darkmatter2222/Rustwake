# #235 — Named-import three.js tree-shake: MEASURED result (genuine-reduction option C)

role=developer · issue #235 · branch `rw/235` · base SHA `c9ab52365aae12670285e21e3e78de7b1e10f03f` (= origin/main).
Commissioned by the #230 §5.7 ruling (product comment 6900038312). Implements option (C): convert the 3
namespace three.js imports to named imports of exactly the 24 used members, then MEASURE the real
entry + total-cold decoded-byte saving. three stays pinned **0.187.0**; `three.module.js` kept
(WebGLRenderer required; `three.core.js` is NOT a substitute).

## Disposition — EVIDENCE-ONLY (product ruling 6900438083, measured head 421d1cff)

Per the §5.7 product disposition ruling (comment **6900438083**, bound to the measured refactor head
`421d1cffa98ede7c4de7f5662bb604b464152eaf`), option (C) achieved **0 B** of its commissioned reduction
objective. The durable deliverable is this honest measurement: it supersedes the #230 §3 ESTIMATE
(~30–130 KB) and hands #237 a hash-anchored baseline — the documented scene+tradeoff input §5.7
(architecture/README.md:98) and TECHNICAL_CONTRACT:9/:15 require. The byte-neutral 3-file named-import
refactor (`worldRenderer.ts`, `cameraRig.ts`, `assemblyView.ts`) was **REVERTED** to base `c9ab523`;
merging it would be cosmetic drift ("not a byte-shaving contest", PERF_BUDGETS:12–13). This PR therefore
lands **evidence-only**: the net diff vs `main` is this document; the 3 src files match base exactly
(0 diff). (C) is **EXHAUSTED** as a reduction lever (0 headroom); no further named-import/tree-shake
work is commissioned against this bundle.

- BEFORE measurement head: base `c9ab52365aae12670285e21e3e78de7b1e10f03f`.
- AFTER (refactor) measurement head: `421d1cffa98ede7c4de7f5662bb604b464152eaf` (reverted; the bundle
  was byte-for-byte identical, so the measurement is unchanged at this evidence-only head).

## Headline (honest, measured)

**The real measured saving is 0 bytes — for BOTH metrics, in ALL contexts.** The production bundle is
**byte-for-byte identical** before and after the change (identical content hashes and sizes for every
cold asset). Rollup already fully tree-shakes the static `THREE.X` namespace access at this head, so
converting to named imports removes no additional bytes. The #230 §3 ESTIMATE (~30–130 KB, central
~80 KB) was **NOT realized**; it is now superseded by this measurement. UNKNOWN → MEASURED = 0.

This is real byte removal attempted, not relocation — there was simply nothing left to shake. No budget
or ceiling was lifted; both operative ceilings remain **UNMET**.

## Experiment (measured at 421d1cff, then reverted per disposition)

`import * as THREE from "three"` → named imports; every `THREE.X` → `X`:

- `src/game/renderer/three/worldRenderer.ts` (23 members; `Material`, `Object3D` are type-only → `import type`).
- `src/game/renderer/three/cameraRig.ts` (5 members; `Object3D`, `OrthographicCamera`, `Raycaster` type-only; `Vector2`, `Vector3` values).
- `src/game/renderer/three/assemblyView.ts` (4 members; all values).

Imported member union verified = **24** (exactly the brief/§3 set): BoxGeometry, BufferGeometry, Color,
DirectionalLight, DynamicDrawUsage, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh,
LineBasicMaterial, LineSegments, Material, Matrix4, Mesh, MeshLambertMaterial, Object3D,
OrthographicCamera, PlaneGeometry, Quaternion, Raycaster, Scene, Vector2, Vector3, WebGLRenderer.
`grep -rn 'import \* as THREE' src` → 0 remaining at the refactor head. No budget/ceiling/test/config/
version/build-plugin edits; no sourcemaps. Legacy 2D fallback boundary (`blitWorld3D`/`getWorld3D`)
untouched. Residual `THREE.` mentions are **3 comments** (`scene.ts:93`, `three/index.ts:132`,
`worldRenderer.ts:9`), **0 code references** (tsc exit 0 corroborates); benign, no action required.

## Measurement method (FILTER-SAFE, numeric only)

`npm run build` (tsc --noEmit && vite build) at base head (BEFORE) and at the changed head (AFTER);
`wc -c dist/assets/* dist/index.html`; node `crypto` sha256 (single hex per file). No raw bundle /
minified vendor / source-map content was read. totalCold = entry + vendor + tables + CSS + HTML
(worker `catchup.worker-*.js` excluded, per #230 §1).

## BEFORE (MEASURED at base c9ab523)

| asset | bytes | sha256 |
|---|---|---|
| entry `assets/index-Cvs8KQfj.js` | 868488 | `357857e41e5b57308b5845c945dadc46a60be72547f4f1f711b44a33493ae87e` |
| vendor `assets/vendor-Bt4lNSbZ.js` | 141658 | `a58625f8076320045a88e2acaa800218823508f519a191c9bcce8466767ca0d0` |
| tables `assets/tables-DbUfDFRZ.js` | 27054 | `024fef7eaf4aa5ba4171072889cf8cda3ec755d9cdf82eddd4db6cec4ba832ab` |
| CSS `assets/index-BVohK8qu.css` | 66873 | `55ecfe0d08ecd86df1c6f66ba398e9abc6f8c880884f713cc97dcca75dfd9635` |
| HTML `index.html` | 1368 | `ffd95dd517055d99e25d1e1209e0b891dd6989e44d225831207f738b7f60bc20` |
| worker (excluded) | 13430 | — |

- **entryDecodedBytes = 868488**
- **totalColdDecodedBytes = 1105441** (868488+141658+27054+66873+1368)

## AFTER (MEASURED at refactor head 421d1cff — byte-for-byte identical)

| asset | bytes | sha256 |
|---|---|---|
| entry `assets/index-Cvs8KQfj.js` | 868488 | `357857e41e5b57308b5845c945dadc46a60be72547f4f1f711b44a33493ae87e` |
| vendor `assets/vendor-Bt4lNSbZ.js` | 141658 | `a58625f8076320045a88e2acaa800218823508f519a191c9bcce8466767ca0d0` |
| tables `assets/tables-DbUfDFRZ.js` | 27054 | `024fef7eaf4aa5ba4171072889cf8cda3ec755d9cdf82eddd4db6cec4ba832ab` |
| CSS `assets/index-BVohK8qu.css` | 66873 | `55ecfe0d08ecd86df1c6f66ba398e9abc6f8c880884f713cc97dcca75dfd9635` |
| HTML `index.html` | 1368 | `ffd95dd517055d99e25d1e1209e0b891dd6989e44d225831207f738b7f60bc20` |
| worker (excluded) | 13430 | — |

- **entryDecodedBytes = 868488**
- **totalColdDecodedBytes = 1105441**

Every cold asset hash is identical BEFORE/AFTER → the bundle is byte-for-byte unchanged.

## Real saving (both metrics, all contexts)

| metric | context | BEFORE | AFTER | saving |
|---|---|---|---|---|
| entryDecodedBytes | 3D MATURE (phone+desktop, WebGL) | 868488 | 868488 | **0** |
| entryDecodedBytes | FALLBACK-2D (no WebGL) | 868488 | 868488 | **0** |
| totalColdDecodedBytes | 3D MATURE | 1105441 | 1105441 | **0** |
| totalColdDecodedBytes | FALLBACK-2D | 1105441 | 1105441 | **0** |

The three module remains a **static** import (no dynamic `import()` added), so it downloads cold in
every context exactly as before; `fallbackTotalColdDecodedBytes` still equals `totalColdDecodedBytes`.

## Budget verdict (operative ceilings unchanged — NOT lifted)

`tests/perf/budgets.json`: entryDecodedBytes ≤ 240000, totalColdDecodedBytes ≤ 520000.

- entryDecodedBytes 868488 > 240000 → **UNMET** (unchanged).
- totalColdDecodedBytes 1105441 > 520000 → **UNMET** (unchanged), all contexts.

Option (C) genuinely reduces both metrics in principle, but at this head the measured reduction is 0,
so it cannot meet either ceiling. Meeting total cold ≤ 520000 still requires removing 585441 B —
implausible while keeping a working WebGLRenderer 3D world (per #230 §5c/§6). This honestly informs
#237 (budget revision): named-import tree-shaking yields no headroom here; the 3D MATURE ceiling must
ground in measured totalCold 1105441 / entry 868488 + (A)/#236's genuine FALLBACK-2D fix.

## Gates (PLAIN, all green first run — no rerun needed)

- `npx tsc --noEmit` → exit 0.
- `npx tsx scripts/validate-content.mjs` → exit 0; content 0 violations, behaviour 0 violations.
- `npm run build` → exit 0 (163 modules transformed; built in ~1.4 s).
- `npx vitest run` → **Test Files 113 passed (113); Tests 1523 passed (1523)** (matches baseline; no
  bench flake occurred, no rerun used, no test edited).

## Limitations

- Measured saving is **0 B**; the #230 §3 ESTIMATE is not promoted to a measured result. The bundle is
  byte-identical, so there is no decoded-byte win to claim in any context.
- Non-vision: only numeric/geometric parity was checked (identical hashes ⇒ identical renderer code;
  full frozen renderer/shell/economy/gesture/migration suite green). **Visual fidelity is NOT
  self-certified** — sponsor-reserved.
- No dynamic-import/code-split was attempted (out of scope for option C); the static-module crux
  (#230 §4/§6) is unchanged.
- Independent QA + product APPROVE on the immutable head SHA, release merge, and main CI/CD
  verification are still required; this draft PR is not self-accepted.

## Citations

#235 (issue body), #230 §3/§4/§5c/§6 (`docs/evidence/230-bundle-plan.md`), §5.7 ruling (product
comment 6900038312), disposition ruling (product comment 6900438083), TECHNICAL_CONTRACT:7 (three
pinned 0.187.0), `tests/perf/budgets.json`, `docs/PERF_BUDGETS.md`.