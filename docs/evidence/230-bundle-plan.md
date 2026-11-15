# #230 — Bundle-size / code-split feasibility PLAN (G1 P03 byte-budget miss)

role=developer · issue [#230](https://github.com/darkmatter2222/Rustwake/issues/230) · branch `rw/230` · base SHA `e2eccee19b682681833ef487f7f17a3ec05ed7e3`

**This is a MEASURED, NON-runtime feasibility plan. It implements nothing.** Zero `src/`, budget, ceiling or build-config edits; no build plugins; no sourcemaps enabled. The product owner makes the explicit §5.7 tradeoff ruling *after* this plan; QA reviews measurement honesty; release merges. No self-acceptance. Every composition/savings figure below is labelled **MEASURED** or **ESTIMATE**; no UNKNOWN is promoted to MET; no budget is lifted.

---

## 1. Reproduced measurement (MEASURED)

Clean `npm run build` at `e2eccee` (exit 0, 0 `error TS`, 163 modules transformed, built 1.39 s). Per-chunk decoded bytes = filesystem size (`wc -c` / `fs.statSync`), which equals `PerformanceResourceTiming.decodedBodySize`.

| Chunk | Role | Decoded bytes | gzip (vite summary) |
| --- | --- | --- | --- |
| `assets/index-Cvs8KQfj.js` | entry | **868488** | 232.14 kB |
| `assets/vendor-Bt4lNSbZ.js` | vendor (react/react-dom/scheduler) | **141658** | 45.37 kB |
| `assets/tables-DbUfDFRZ.js` | tables (audio/sprites/strings/defs/research) | **27054** | 9.92 kB |
| `assets/index-BVohK8qu.css` | CSS | **66873** | 11.28 kB |
| `index.html` | HTML | **1368** | 0.72 kB |
| `assets/catchup.worker-B2acSi-4.js` | lazy worker (**excluded from cold**) | 13430 | — |

- **entry SHA256 = `357857e41e5b57308b5845c945dadc46a60be72547f4f1f711b44a33493ae87e`** — byte-identical to the coordinator's deployed ground truth.
- **totalColdDecodedBytes = 868488 + 141658 + 27054 + 66873 + 1368 = 1105441 B** (worker excluded) — matches ground truth.
- Cold gzip over the wire ≈ **299.43 kB** (sum of the gzip column, worker excluded). The budgets are **decoded** payload, not transferred; felt load is fast (issue #230: FCP 112–116 ms, idle P95 16.8 ms, 0 dropped frames — all MET).

### Budget verdict (operative ceilings, `tests/perf/budgets.json` + `docs/PERF_BUDGETS.md:90–91`)

| Metric | Ceiling | Actual (MEASURED) | Over by | Ratio | Verdict |
| --- | --- | --- | --- | --- | --- |
| `entryDecodedBytes` | ≤ 240000 B | 868488 | 628488 | 3.62× | **UNMET** |
| `totalColdDecodedBytes` | ≤ 520000 B | 1105441 | 585441 | 2.13× | **UNMET** |

These 2 byte ceilings (× phone/desktop MATURE + FALLBACK-2D contexts = the 6 UNMET in #230) are **PRE-EXISTING at the rw3d baseline** (pinned three.js), **not a #231 regression**. Playability is not defeated; this is a tracked performance-budget deferral. The issue's probe numbers (entry 843492 / total 1080407) were captured at the earlier #151 P03 head; the current `e2eccee` rebuild is 868488 / 1105441 (+24996 / +25034 from subsequent rw3d work, e.g. #228 assembly). The reproduced current numbers are authoritative for this plan.

### Gates (PLAIN, all green first run — no rerun needed)

- `npx tsc --noEmit` → exit 0
- `npx tsx scripts/validate-content.mjs` → exit 0, `validated: no violations`
- `npm run build` → exit 0
- `npx vitest run` → exit 0, **113 test files / 1523 tests passed** (no `bench.test.ts:87` wall-clock flake occurred)

---

## 2. Entry composition (MEASURED signatures + ESTIMATE ranges)

**Three.js is in the ENTRY, not vendor (MEASURED, occurrence counts via `grep -o … | wc -l`):**

| Signature | entry `index-Cvs8KQfj.js` | vendor `vendor-Bt4lNSbZ.js` |
| --- | --- | --- |
| `WebGLRenderer` | 37 | 0 |
| `BufferGeometry` | 17 | 0 |
| `ShaderMaterial` | 16 | 0 |
| `InstancedMesh` | 19 | 0 |
| `OrthographicCamera` | 4 | 0 |
| `Raycaster` | 1 | 0 |

`manualChunks` (vite.config.ts) splits out **only** `tables` and `vendor`; everything else (three.js + rw3d renderer + 2D shell + game logic) returns `null` → lands in the entry.

**Unminified source anchors (MEASURED, `wc -c`):** `node_modules/three/build/three.module.js` = 658900 B; `three.core.js` = 1474799 B. `three.module.js` imports a named set from `three.core.js` (line 6) and re-exports a named set from it (line 7), then adds the WebGL renderer. So the unminified ESM graph actually pulled in is **≈ 2133699 B** (module + core), *not* 658900 alone. `three.tsl.js` / `three.webgpu*.js` are separate builds and are **not** imported (already excluded). three version = **0.187.0** (pinned, TECHNICAL_CONTRACT:7).

**Three.js minified in-entry portion — ESTIMATE ≈ 600000–680000 B (central ~640000 B, ~70–78 % of the entry).** No sourcemaps exist (`build.sourcemap` unset) and reading the minified bundle is forbidden, so composition is reasoned numerically, two independent ways:

1. **Subtraction from the historical 2D entry.** The pre-rw3d 2D entry was 190898 B (`PERF_BUDGETS.md:113`) to 222690 B (`BACKLOG.md` B-10), React already in vendor. The rw3d entry adds three.js + the 3D glue (`src/game/renderer/three/*.ts` = 49644 B unminified TS → ESTIMATE ~18–25 KB minified). 868488 − (~190000–230000 non-three shell/logic) − (~20000 glue) ≈ **~618000–658000 B** of three.
2. **gzip cross-check.** Entry gzip 232.14 kB; historical 2D entry gzip ~69.44 kB. Non-three gzip ≈ ~75 kB → three gzip ≈ ~157 kB; three minified:gzip ≈ 4.1:1 → **~640 KB**. Converges with (1).

**Non-three entry — ESTIMATE ≈ 188000–268000 B.** Note the upper range already straddles the 240000 entry ceiling on its own; the *measured* historical 2D entry (190898 B) met it. Exact composition is **UNKNOWN** without a sourcemap build or a controlled tree-shake experiment (both out of scope here).

---

## 3. Tree-shake feasibility (MEASURED import patterns)

- **3 of 3** three-importing files use namespace imports: `import * as THREE from "three"` in `worldRenderer.ts:29`, `cameraRig.ts:17`, `assemblyView.ts:16`. **0 named imports, 0 subpath (`three/…`) imports.**
- **24 distinct `THREE.*` members** used (all static member access): BoxGeometry, BufferGeometry, Color, DirectionalLight, DynamicDrawUsage, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, LineBasicMaterial, LineSegments, Material, Matrix4, Mesh, MeshLambertMaterial, Object3D, OrthographicCamera, PlaneGeometry, Quaternion, Raycaster, Scene, Vector2, Vector3, WebGLRenderer.

Namespace imports *can* defeat Rollup tree-shaking when the namespace object escapes or is accessed dynamically; here all access is static `THREE.X`, so Rollup may already shake some, but `WebGLRenderer` transitively pulls the full WebGL backend + shader-chunk library + material system, which is the bulk and is **required** by a 3D voxel world. Converting to named imports of the 24 members is the clean lever to *enable* maximal static shaking.

**`three.core.js` is NOT a drop-in smaller substitute (honest correction).** `three.core.js` *excludes* `WebGLRenderer` (that lives in `three.module.js`). The game uses `WebGLRenderer`, so importing from `three.core.js` alone would drop the renderer and break 3D. Subsetting must keep `three.module.js` (or core + an explicit renderer); "switch to three.core.js" is not a viable saving on its own.

**Realistic saving from named-import tree-shaking — ESTIMATE ~30–130 KB (central ~80 KB)** of unused subsystems (animation mixers, audio, loaders, XR, unused geometries/materials/helpers), bounded by WebGLRenderer's required backend. Exact saving is **UNKNOWN** until a build experiment is run (implementation, out of scope).

---

## 4. Renderer boundary facts that govern feasibility (MEASURED from source)

- `src/game/renderer/scene.ts:62` imports `{ blitWorld3D, getWorld3D, world3DStatus } from "./three"` — a **static** import. **Zero `import()` dynamic imports exist anywhere in `src`** (grep empty).
- `three/index.ts`: `blitWorld3D` renders the yard into an **offscreen WebGL canvas** and `drawImage`-blits it into the caller's 2D context; returns `false` (no context writes) when WebGL is unavailable so the **legacy 2D paint runs byte-for-byte**. `getWorld3D()` is a **runtime-lazy singleton** (constructs `YardWorld` only on first call after a WebGL probe passes).
- **Crux:** the *instance* is lazy, but the *module* is static — so the three.js **code downloads cold even in the no-WebGL FALLBACK-2D context**. That is exactly why the issue's `fallbackTotalColdDecodedBytes` (1080407) equals `totalColdDecodedBytes`.
- The gate paints a **live yard preview** at boot (`PERF_BUDGETS.md:66`); in a real browser that preview is the blitted 3D world → **three.js is needed at first playable paint** in the primary 3D contexts.

---

## 5. Three options — estimated cold-load BEFORE/AFTER for BOTH metrics

BEFORE (MEASURED, all contexts): entry **868488**, total cold **1105441**. All AFTER figures are **ESTIMATE** (central ~640 KB three portion; ranges per §2). "3D MATURE" = phone+desktop with WebGL; "FALLBACK-2D" = no-WebGL context.

### (a) Lazy-load the 3D renderer via dynamic `import("./three")`, gated behind the WebGL probe

- **entryDecodedBytes:** 868488 → **~210000** (range ~190000–270000). Likely **MET** ≤240000 centrally, borderline at the upper range.
- New async chunk `three-world` ≈ **~660000 B** (three + glue).
- **totalColdDecodedBytes — 3D MATURE:** **UNCHANGED ~1105441 → UNMET.** The gate's live 3D preview resolves the dynamic import at first paint, so the bytes still load cold; they merely move from entry to an async chunk.
- **totalColdDecodedBytes — FALLBACK-2D:** 1105441 → **~445000** (range ~405000–485000) → **MET** ≤520000. This is a **genuine** reduction (3D truly unused there), not cost-moving.
- Feasibility **HIGH** (boundary already isolates 3D behind `blitWorld3D`/`getWorld3D`). Risk **MEDIUM**: first-paint timing (gate preview must await the async chunk; may show one 2D-only frame first), must preserve the byte-for-byte 2D fallback and the frozen shell tests that mock `getContext`. Effort **MEDIUM** (src boundary change + async loading state + tests). **Does not meet the primary 3D total-cold budget.**

### (b) Split three.js into its own vendor chunk

- **(b-static) `manualChunks` returns `"three"` for `node_modules/three` only:** entry → **~210000** (MET *letter*), three becomes a **preloaded sibling** (~640000 B). **totalColdDecodedBytes UNCHANGED ~1105441 in ALL contexts (even FALLBACK-2D, because a static manual chunk is still preloaded cold) → UNMET.** This is **pure relocation** — the exact "move work elsewhere to hide cost" anti-pattern `PERF_BUDGETS.md:13` warns against. Feasibility HIGH (config-only), technical risk LOW, **policy risk HIGH**, effort LOW. **Not a fix.**
- **(b-async)** dynamic-import variant → identical to **(a)**.

### (c) Tree-shake / subset three.js (named imports; §3)

- Convert 3× `import * as THREE` → named imports of the 24 members; keep `three.module.js` (WebGLRenderer required).
- **entryDecodedBytes:** 868488 → **~788000** (range ~738000–838000) → **UNMET**.
- **totalColdDecodedBytes:** 1105441 → **~1025000** (range ~975000–1075000) → **UNMET**, in **all** contexts.
- This is the **only** option that genuinely reduces **both** metrics everywhere (real byte removal, not relocation), but it is **insufficient**: meeting total cold ≤520000 requires removing **585441 B** — more than the entire estimated three portion minus ~55 KB — implausible while keeping a working WebGLRenderer 3D world. Feasibility **MEDIUM**, risk **LOW–MEDIUM** (verify all 24 members + transitive deps resolve; frozen tests), effort **MEDIUM**. Exact saving **UNKNOWN** until measured.

---

## 6. The honest crux (must surface)

The game **is** a 3D voxel world; the renderer is needed at first playable paint (the gate paints a live 3D preview). Therefore:

- **(a)/(b) reduce `entryDecodedBytes` but NOT `totalColdDecodedBytes` in the primary 3D contexts** — the bytes still load cold, just from a different chunk. A pure relocation can meet the entry *letter* while violating the budget's *spirit* (`PERF_BUDGETS.md:13`: "do not micro-trim bytes merely to hide cost or move work elsewhere").
- **Nuance in favour of (a):** lazy-load *does* genuinely reduce the **FALLBACK-2D** total cold (3D never imported there) — a legitimate win for that context, currently UNMET only because three is statically bundled.
- **Only (c) reduces BOTH metrics in ALL contexts**, but cannot reach the prospective 2D ceilings.
- **No feasible code-split or tree-shake meets `totalColdDecodedBytes ≤ 520000` for a real pinned-three.js 3D world needed at first paint.** The 520000 / 240000 ceilings are the **prospective 2D budgets from #67 (CLOSED)**, physically incompatible with the rw3d 3D bundle.

---

## 7. Recommendation to product (the ruling input — NOT a lift)

**Recommend an explicit §5.7 3D-aware budget ruling, optionally paired with genuine reductions — not a relocation dressed as a fix.**

1. **Primary: explicit executive/product tradeoff ruling.** Document the scene (pinned three.js 0.187.0 `WebGLRenderer` voxel world, needed at first playable paint; gate live preview; zero binary media; felt FCP/load/frame all MET) and the tradeoff, then set **3D-realistic decoded-byte ceilings** grounded in the measured numbers below. **Never a silent lift** (`TECHNICAL_CONTRACT.md:9`, `PERF_BUDGETS.md:13`, issue #230). The literal "§5.7" header was **not located by grep** in this tree; the issue references it as "architecture §5.7" — the operative anti-silent-lift clauses are `TECHNICAL_CONTRACT.md:9` ("Do not merely lift failing budgets without documenting the scene and tradeoff") and `PERF_BUDGETS.md:13`, plus the #230 body.
2. **Optional genuine reduction (minimises the new ceiling): (c) named-import tree-shaking** — real bytes removed from both metrics in all contexts (ESTIMATE ~30–130 KB). Measure the actual saving in a tracked implementation issue before claiming it.
3. **Optional legitimate fallback fix: (a) lazy-load gated behind the WebGL probe** — genuinely fixes the FALLBACK-2D total cold (ESTIMATE ~445000, MET) and the entry letter; must **not** be presented as meeting the 3D-context total-cold budget.
4. **Reject (b-static) as a "fix"** — pure relocation, zero total-cold reduction anywhere, violates `PERF_BUDGETS.md:13`.

**Measured numbers product needs to rule:** entry **868488 B** (3.62× the 240000 ceiling; +628488); total cold **1105441 B** (2.13× the 520000 ceiling; +585441); three.js in-entry portion **ESTIMATE ~600–680 KB (~70–78 %)**; non-three entry **ESTIMATE ~188–268 KB**; cold gzip ≈ **299.43 kB**; felt load/frame/heap budgets **MET**. The decoded-byte ceilings — not playability or felt latency — are what fail.

---

## 8. Limitations (explicit)

1. **Composition is ESTIMATE, not exact.** No sourcemaps (`build.sourcemap` unset); source-map-explorer is not viable and was not run; the minified bundle was never read (filter-safe numeric method only: `wc -c`, `fs.statSync`, `grep -o … | wc -l`, node crypto hash). Exact three/non-three split is **UNKNOWN** until a sourcemap build or controlled tree-shake experiment (out of scope).
2. **All AFTER figures are ESTIMATE** with stated ranges; none is a measured post-change result. No split was implemented.
3. **No visual-fidelity claims.** Non-vision numeric/geometric analysis only.
4. **No budget/ceiling lifted; no UNKNOWN promoted to MET; no src/budget/config edits.** This plan is the sole deliverable.
5. **§5.7 literal header not located**; governing clauses cited by file:line instead (§7).
6. CRLF "modified" phantoms are benign (autocrlf). Ports :4173 / :4175 left untouched.

## 9. Citations

- `docs/PERF_BUDGETS.md:13` (233000 not hard; no cost-moving), `:90` (entry ≤240000), `:91` (total cold ≤520000), `:66` (gate live preview), `:113` (historical 2D entry 190898).
- `docs/vision/TECHNICAL_CONTRACT.md:7` (three pinned 0.187.0), `:9` (no silent budget lift).
- `tests/perf/budgets.json` (`transferred.entryDecodedBytes=240000`, `transferred.totalColdDecodedBytes=520000`).
- `vite.config.ts` (`manualChunks` tables+vendor only; `base:"./"`; target es2022; no sourcemap).
- `src/game/renderer/scene.ts:62`, `src/game/renderer/three/index.ts`, `worldRenderer.ts:29`, `cameraRig.ts:17`, `assemblyView.ts:16`.
- Issue #230 body (product verdict 6889305033 on #151; P03 `pass:false`; architecture §5.7 bars silent lifts).
