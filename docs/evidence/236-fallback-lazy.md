# #236 — Probe-gated lazy three.js: genuine FALLBACK-2D cold reduction (option A)

Role: developer (non-vision). Branch `rw/236`, base `origin/main`
`e60c8ea2d9952b87647a920884ff08e2eda53a13`. Evidence head SHA:
`861e2f2f13fde133e58992b9276b29306b6c4a1b` (bundle bytes identical to
`76669f0548433a8ff9dbffd64c0ca11c98420177`; the final commit is a comment-only
correction plus the numeric first-paint probe — esbuild strips comments, verified by
re-hash below). three stays pinned at `0.187.0`. No budget, ceiling, gate, version or
build-plugin edits; no sourcemaps; saves/cancellation/approval/security paths untouched.

## 1. Boundary change (both static edges removed)

The cold graph held `renderer/three` through TWO static edges in `scene.ts`:

1. `scene.ts:62` — `import { blitWorld3D, getWorld3D, world3DStatus } from "./three"`
   replaced by `import { probeWebGL } from "./webglProbe"` plus
   `import type { PickResult } from "./three"` (type-only, erased at compile time —
   no runtime edge).
2. `scene.ts:86` — `export { pickWorld3D, world3DStatus } from "./three"` (a static
   re-export alone keeps the module in the cold graph) replaced by
   `export type { PickResult } from "./three"` and delegating wrappers:
   - `pickWorld3D(sx, sy)` → `threeModule?.pickWorld3D(sx, sy) ?? null`
   - `world3DStatus()` → `threeModule?.world3DStatus() ?? "unavailable"`
   - `projectWorld3D(x, y, z)` → `null` until resolved/context-lost, else
     `w.projectWorld(x, y, z)` (same cameraRig projection as before).

   Pre-resolution answers are exactly the legacy no-WebGL answers (`null` /
   `"unavailable"`), so the shell's `screenToWorld + pickTarget` fallback and the
   `worldToScreen` anchor fallback are byte-identical in behavior.

New module `src/game/renderer/webglProbe.ts`: `probeWebGL` moved VERBATIM out of
`three/index.ts` into a THREE-free module (gating must not load the gated chunk).
Single-sourced once-only cache `glAvailable`; rejects jsdom `null` contexts and the
camera-50 write-only Proxy (`getParameter(VERSION)` must return a string). Exports
`resetWebGLProbe()` / `markWebGLUnavailable()`; `three/index.ts` delegates
(`resetWorld3DProbe`, `getWorld3D` catch) — all other three-side behavior/exports
unchanged.

## 2. Async loading state (scene.ts)

```
drawScene → loadThreeOnce():
  if (threeModule || threeLoad || !probeWebGL()) return;   // probe false ⇒ NEVER import
  threeLoad = import("./three").then(m => threeModule = m).catch(() => null);
drawScene → threeModule ? threeModule.blitWorld3D(...) : false  // else legacy 2D paint
```

- Probe unavailable (jsdom null / write-only Proxy / forced-null harness / real
  no-WebGL): the dynamic import is never fired; legacy 2D fallback byte-for-byte.
- Probe available: import kicked exactly once; until it resolves the caller keeps
  painting the legacy 2D frame (no blank); a rejected import leaves `threeModule`
  null → permanent legacy 2D, never a throw across the boundary.
- Context-loss banner unchanged (`world3DStatus() === "lost"`, now the local wrapper).
- No clock, no storage in `scene.ts` (frozen `boundary-3d.test.ts` contract):
  resolution is the browser's own promise.

First-paint measurement (`tests/perf/perf-236-firstpaint.mjs`, headless SwiftShader,
phone viewport, gate overlay up — numeric, non-vision):

| context | first world3d stamp | first "ready" stamp | async chunk requested |
|---|---|---|---|
| MATURE | `unavailable` frame 3 @211 ms (gate=true) | frame 6 @483 ms (gate=true) | YES (`index-C09_CvPm.js`) |
| FALLBACK-2D | `unavailable` frame 3 @59 ms (gate=true) | never (35 frames observed) | NO — only entry+vendor+tables |

So the gate's live first-paint yard preview is preserved (stamps occur with the gate
still up) and the 2D-only interval is 3 frames (~272 ms) under headless SwiftShader —
the scene.ts comment states this measured value honestly (an earlier "one frame"
claim was corrected; comment-only, bundle bytes re-verified identical). Real GPUs
resolve faster; FALLBACK-2D never fetches the chunk. Probe exit: `FIRSTPAINT: PASS`.

## 3. Static build inventory (wc -c + node crypto sha256; filter-safe, no bundle reads)

BEFORE @ `e60c8ea2d9952b87647a920884ff08e2eda53a13`:

| asset | bytes | sha256 |
|---|---|---|
| dist/assets/index-Cvs8KQfj.js (entry) | 868488 | 357857e41e5b57308b5845c945dadc46a60be72547f4f1f711b44a33493ae87e |
| dist/assets/vendor-Bt4lNSbZ.js | 141658 | a58625f8076320045a88e2acaa800218823508f519a191c9bcce8466767ca0d0 |
| dist/assets/tables-DbUfDFRZ.js | 27054 | 024fef7eaf4aa5ba4171072889cf8cda3ec755d9cdf82eddd4db6cec4ba832ab |
| dist/assets/index-BVohK8qu.css | 66873 | 55ecfe0d08ecd86df1c6f66ba398e9abc6f8c880884f713cc97dcca75dfd9635 |
| dist/assets/catchup.worker-B2acSi-4.js | 13430 | aa7ed1e5851b2d87965a2af80d59468c0ff449de08c1b1cf7ed35f1d61a8382f |
| dist/index.html | 1368 | ffd95dd517055d99e25d1e1209e0b891dd6989e44d225831207f738b7f60bc20 |

AFTER @ `861e2f2f13fde133e58992b9276b29306b6c4a1b` (re-hashed after the comment-only
rebuild — entry/async shas identical to `76669f0`):

| asset | bytes | sha256 |
|---|---|---|
| dist/assets/index-BgVhHfeK.js (entry) | 324689 | 084e12540af76c2865b7c5e1aee5ee7c2f00f53929875a01eff3a027fa6aaf51 |
| dist/assets/index-C09_CvPm.js (async three chunk) | 544680 | 690e0bf698be543a919dbfa56b3fc4739e85bf6fcb5316ceb55b01a00f7d7f6d |
| dist/assets/vendor-Bt4lNSbZ.js | 141658 | a58625f8076320045a88e2acaa800218823508f519a191c9bcce8466767ca0d0 |
| dist/assets/tables-BO6NIz7N.js | 27054 | aa4dde34aa71d31be79e39ac47133adbc14667e6a6c938c1632a7a966912cd02 |
| dist/assets/index-BVohK8qu.css | 66873 | 55ecfe0d08ecd86df1c6f66ba398e9abc6f8c880884f713cc97dcca75dfd9635 |
| dist/assets/catchup.worker-B2acSi-4.js | 13430 | aa7ed1e5851b2d87965a2af80d59468c0ff449de08c1b1cf7ed35f1d61a8382f |
| dist/index.html | 1368 | b1d84e10193ce690ef9ba534dfd536a69b152938e4a1d9d02864c2a773e0c94c |

vendor / css / worker are byte-identical (same shas). tables is unchanged in size
(27054 B) but re-emitted under a new content hash: no tables source file changed
(`git diff --name-only base..head` lists only scene.ts, three/index.ts, webglProbe.ts
and the two perf scripts), so the hash delta is Rollup re-emission under the split
module graph, not a data edit. The async chunk is
emitted as a second `index-*.js` (three is not in `manualChunks`); Vite/Rollup naming,
not a `three-*.js` file.

## 4. REAL per-context cold decoded bytes (PerformanceResourceTiming)

P03 harness `npx tsx tests/perf/perf-151.evidence.mjs --mode p03` (vite preview port
4167, headless Chromium SwiftShader). Cold read at gate pre-start (`goto`
networkidle + 350 ms); per-context sums of actually-fetched resources'
`decodedBodySize` + navigation document bytes. FALLBACK contexts force
`getContext("webgl"|"webgl2"|"experimental-webgl") → null` via init script
(NO_WEBGL_INIT). The catch-up worker is NOT fetched cold (fixture
`lastSeenMs = Date.now()`). Report: `docs/evidence/151-p03-coldload.json`
(+ 5 PNGs), regenerated at the evidence head SHA.

BEFORE (all five contexts identical — static graph):

| context | entryJs | vendorJs | tablesJs | css | otherJs | doc | totalCold | world3d |
|---|---|---|---|---|---|---|---|---|
| phone-MATURE | 868488 | 141658 | 27054 | 66873 | 0 | 1368 | 1105441 | ready |
| desktop-MATURE | 868488 | 141658 | 27054 | 66873 | 0 | 1368 | 1105441 | ready |
| desktop-STRESS | 868488 | 141658 | 27054 | 66873 | 0 | 1368 | 1105441 | (not sampled) |
| phone-FALLBACK-2D | 868488 | 141658 | 27054 | 66873 | 0 | 1368 | 1105441 | unavailable |
| desktop-FALLBACK-2D | 868488 | 141658 | 27054 | 66873 | 0 | 1368 | 1105441 | unavailable |

AFTER:

| context | entryJs | vendorJs | tablesJs | css | otherJs (async three) | doc | totalCold | world3d | console errors |
|---|---|---|---|---|---|---|---|---|---|
| phone-MATURE | 324689 | 141658 | 27054 | 66873 | 544680 | 1368 | 1106322 | ready | 0 |
| desktop-MATURE | 324689 | 141658 | 27054 | 66873 | 544680 | 1368 | 1106322 | ready | 0 |
| desktop-STRESS | 324689 | 141658 | 27054 | 66873 | 544680 | 1368 | 1106322 | (not sampled) | 0 |
| phone-FALLBACK-2D | 324689 | 141658 | 27054 | 66873 | ABSENT (never fetched) | 1368 | 561642 | unavailable | 0 |
| desktop-FALLBACK-2D | 324689 | 141658 | 27054 | 66873 | ABSENT (never fetched) | 1368 | 561642 | unavailable | 0 |

Deltas (measured, not estimated):

- entryDecodedBytes: 868488 → 324689 = **−543799 B (−62.6 %)**.
- 3D MATURE totalCold: 1105441 → 1106322 = **+881 B (+0.08 %)** — relocation only
  (async chunk wrapper + probe module + delegating wrappers), as predicted.
- FALLBACK-2D totalCold: 1105441 → 561642 = **−543799 B (−49.2 %)** — a GENUINE
  per-context reduction: the 544680 B three chunk is never requested without WebGL.

Harness change (the ONLY one, documented precisely — not a ceiling lift): `cat()` in
`readColdLoad` now attributes `entryJs` to the basename of the
`script[type="module"][src]` in index.html; any other `index-*.js` lands in `otherJs`.
BEFORE has a single `index-*.js`, so its classification is provably identical; the
fix only prevents the async three chunk from being miscounted as entry in AFTER.
No budget, floor or assertion changed (protocol string in the report records this).

## 5. Honest budget verdict (no lift; §5.7 ruling stands)

P03 AFTER: **PASS, 0 hard failures; budgets 40 met / 6 unmet / 0 unknown (46)**.
The 6 unmet are exactly the byte ceilings, same categories as BEFORE:

| check | scope | measured | ceiling | verdict |
|---|---|---|---|---|
| entryDecodedBytes | phone-MATURE | 324689 | 240000 | UNMET |
| entryDecodedBytes | desktop-MATURE | 324689 | 240000 | UNMET |
| totalColdDecodedBytes | phone-MATURE | 1106322 | 520000 | UNMET |
| totalColdDecodedBytes | desktop-MATURE | 1106322 | 520000 | UNMET |
| fallbackTotalColdDecodedBytes | phone-FALLBACK-2D | 561642 | 520000 | UNMET |
| fallbackTotalColdDecodedBytes | desktop-FALLBACK-2D | 561642 | 520000 | UNMET |

The commission's EST ~445000 B for FALLBACK-2D was NOT realized: the measured value
is 561642 B, still 41642 B over the 520000 ceiling. Per the brief, UNKNOWN never
becomes MET and the check **stays UNMET until measured passing** — this PR does not
claim a budget win. All 40 timing/heap/idle/interaction checks remain met (fcp 76–80
ms, idleP95 16.8 ms, heap ≤ 11.95 MB, growth ≤ 0.43 MB, binaryMediaCount 0).

This is genuine reduction, not relocation: FALLBACK-2D sheds 49.2 % of its cold
bytes while 3D MATURE is unchanged within +881 B. The residual gap is structural
(2D-era ceilings vs pinned-three app+sim entry of 324689 B) and is input for the
(R) #237 re-declaration path, which remains blocked on #235/#236 per §5.7. No
ceiling was lifted, no check weakened, no anti-pattern relocation performed.

## 6. Gates (plain, at evidence head 861e2f2)

- `npx tsc --noEmit` → exit 0 (re-run after the comment-only correction; final
  re-run at 861e2f2 alongside the vitest receipt below, exit 0).
- `npx tsx scripts/validate-content.mjs` → 0 violations.
- `npm run build` → exit 0 (re-run; entry/async shas verified identical).
- `npx vitest run` → 113 files / 1523 tests passed, exit 0 (first run at 76669f0;
  final re-run at 861e2f2: 113 passed (113), 1523 passed (1523), exit 0, no flake,
  no rerun needed, no test edits). Frozen
  shell tests green: `tests/renderer/boundary-3d.test.ts` (no bare three imports, no
  clock/storage in renderer modules), `tests/ui/camera-50.test.tsx` (write-only Proxy
  rejected by the probe), `tests/ui/shell-wiring-135.test.tsx` (vi.mock spreads the
  actual scene module — compatible with the delegating wrappers).

## 7. Limitations

- Non-vision developer: geometric/numeric checks only. Visual fidelity of the gate
  preview and the 3D world is sponsor-reserved (G1); this PR cannot self-certify it.
- Headless Chromium + SwiftShader emulation, not physical phone hardware; the
  3-frame (~272 ms) 2D-only interval is a local-preview measurement and will differ
  on real GPUs/networks.
- The P03 report's `issue` metadata field remains `151` (harness reuse; the harness
  belongs to the #151 program). The #236-specific probe is
  `tests/perf/perf-236-firstpaint.mjs` (port 4169; does not touch 4173/4175).
- No self-acceptance/merge: draft PR for independent QA + product verdict on the
  immutable head SHA, then release engineer.
