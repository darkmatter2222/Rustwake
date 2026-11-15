# #237 — §5.7 (R) context-aware decoded-byte budget RE-DECLARATION

Role: developer (non-vision). Branch `rw/237`, base `origin/main`
`083242a3b1fc0fa634306d931801bd941378a5c7` (the #236 squash merge,
MERGED+DEPLOYED+live-verified). Measurement head SHA:
`5f50d961160f59ddffe7c6b157fa20d168b25083` (budget re-declaration + mapping +
PERF_BUDGETS.md; no `src/` change — the production bundle is byte-identical to the
base main build, verified by SHA256 inventory below). The commits after the
measurement head are evidence-only (docs/frames; no `src/`, `budgets.json` or
harness change); the immutable PR head is recorded in the draft PR and the #237
developer handoff. three stays pinned `0.187.0`.
No build-plugin/vite/sourcemap/package.json change; saves/cancellation/approval/
security paths untouched. FILTER-SAFE numeric-only measurement throughout.

**This is the sanctioned §5.7 re-declaration — NOT a silent lift.** Authority:
`docs/vision/architecture/README.md:98` (§5 item 7 "Budget discipline"),
`docs/vision/TECHNICAL_CONTRACT.md:9/:15` ("byte ceiling re-declared against the
≤8 MB compressed first-playable budget, never silently lifted"), #230 product
ruling comment 6900038312 (commissioned (R)#237), and the operative #236 product
verdict comment 6901199383 on PR #239 (ground against MEASURED; ~1.1x tighter than
1.2x; retire the dead HOLD branch openly). PM scope decision (delegated authority):
re-declare BOTH contexts; app+sim entry diet deferred as a non-blocking P3 follow-up.

## 1. Measured baseline re-confirmed at this head (P03, before re-declaration)

`npx tsx tests/perf/perf-151.evidence.mjs --mode p03`, self-managed vite preview
(port 4167; ports 4173/4175 untouched), real per-context
`PerformanceResourceTiming.decodedBodySize` sums, headless Chromium SwiftShader,
phone 390x844@2 / desktop 1920x1080@1, 6x CPU throttle low-end pass. Run at the
base working tree (source identical to measurement head 5f50d96):

| Context | entry decoded | total cold decoded | cold gzip | binary media |
| --- | --- | --- | --- | --- |
| phone-MATURE | 324689 B | 1106322 B | 301735 B | 0 |
| desktop-MATURE | 324689 B | 1106322 B | 301735 B | 0 |
| desktop-STRESS | 324689 B | 1106322 B | 301735 B | 0 |
| phone-FALLBACK-2D | 324689 B | 561642 B | 164570 B | 0 |
| desktop-FALLBACK-2D | 324689 B | 561642 B | 164570 B | 0 |

Exact match to the pre-verified post-#236 baseline (324689 / 1106322 / 561642).
Verdict at the OLD global ceilings (240000 / 520000): **40 met / 6 unmet / 0
unknown (total 46), 0 hard failures, pass=true**. The 6 UNMET:

- entryDecodedBytes phone-MATURE 324689 > 240000
- entryDecodedBytes desktop-MATURE 324689 > 240000
- totalColdDecodedBytes phone-MATURE 1106322 > 520000
- totalColdDecodedBytes desktop-MATURE 1106322 > 520000
- fallbackTotalColdDecodedBytes phone-FALLBACK-2D 561642 > 520000
- fallbackTotalColdDecodedBytes desktop-FALLBACK-2D 561642 > 520000

(FALLBACK entry is not a separately checked metric — unchanged.)

## 2. Re-declared context-aware ceilings (grounded, ~1.1x, tighter than 1.2x)

`tests/perf/budgets.json` `budgets.transferred` is now context-aware:

| Context key | Metric | Ceiling | Measured | Ratio | Headroom |
| --- | --- | --- | --- | --- | --- |
| mature3d | entryDecodedBytes | 360000 B | 324689 B | 1.109x | 35311 B |
| mature3d | totalColdDecodedBytes | 1220000 B | 1106322 B | 1.103x | 113678 B |
| fallback2d | totalColdDecodedBytes | 620000 B | 561642 B | 1.104x | 58358 B |
| (global) | imageAudioBinaryCount | 0 (unchanged) | 0 | — | — |

Tightest round ~1.1x headroom that passes with margin, per the product directive
to force genuine future reductions. `_meta.redeclaration` records the authority,
measured grounding, scene, tradeoff, retirement and reduction history. **All
experience budgets (coldLoad / interaction / frame / memory) are UNCHANGED.**

**Scene:** pinned three.js 0.187.0 WebGLRenderer voxel world at first playable
paint (gate paints a live yard preview); MATURE release fixture 20 machines / 30
units / 200 cargo; entry = app+sim module script (three excluded by the #236
probe-gated lazy import); FALLBACK-2D = same app+sim entry, three chunk never
fetched without WebGL (measured).

**Tradeoff:** decoded-byte ceilings are secondary proxies; the player-facing
guardrails are the unchanged experience budgets and the <=8 MB compressed
first-playable budget (measured ~0.30 MB gzip MATURE / ~0.16 MB FALLBACK, all MET).
The 2D-era #67 global ceilings (240000/520000, grounded in the 190898/422552
pre-rw3d baseline) are structurally incompatible with the 3D app — the non-three
app+sim entry alone is 324689 B — and are retired for it by this documented
re-declaration.

## 3. Mapping change (transparent; no check removed or weakened)

- `perf-151.evidence.mjs` `evaluateBudgets`: MATURE/STRESS 3D contexts read
  `transferred.mature3d.{entryDecodedBytes,totalColdDecodedBytes}`; FALLBACK-2D
  reads `transferred.fallback2d.totalColdDecodedBytes`. Same metrics, same
  `check()` calls, same dir=max, same UNKNOWN-never-MET semantics (a missing
  ceiling yields limit=null -> UNKNOWN, never MET). The report `protocol` string
  documents the re-declaration and the new mapping.
- `perf-67.evidence.mjs` (legacy harness): its mature-context byte checks map to
  `transferred.mature3d` so they do not silently degrade to UNKNOWN under the new
  structure. Same metrics/checks.
- No vitest test asserts the old ceilings (verified by grep: no `*.test.ts`
  references `budgets.json`, `evaluateBudgets` or the transferred keys); no test
  assertion or floor was weakened.

## 4. OPEN retirement of the dead "HOLD FALLBACK" branch

The #230 ruling's pre-measurement branch — "FALLBACK-2D: HOLD the 2D-appropriate
ceilings (entry <=240000, total cold <=520000) and CLOSE them via genuine
reduction (A), NOT by lifting" — is measurably DEAD: #236 landed FALLBACK cold at
561642 > 520000 and entry at 324689 > 240000; the residual is structural (the
app+sim entry itself exceeds the 2D-era ceilings), so (A) alone cannot close it.
Retired OPENLY in `docs/PERF_BUDGETS.md` (new CURRENT section) per product verdict
6901199383 — never silently. Reduction history recorded: (C)#235 tree-shake = 0 B
(exhausted); (A)#236 lazy-load = FALLBACK cold 1105441 -> 561642 (-49.2% genuine),
MATURE entry 868488 -> 324689 (-62.6%), MATURE cold +881 B relocation only.
A genuine app+sim entry diet is a valid FUTURE optimization, filed as a separate
P3 follow-up issue — NOT a G1 blocker.

## 5. After re-declaration — re-measured at head 5f50d96 (official run)

Official P03 run bound to `sha 5f50d961160f59ddffe7c6b157fa20d168b25083`
(generated 2026-11-15T21:14:15Z), report committed at
`docs/evidence/151-p03-coldload.json` (+ refreshed P03 frames). A prior
cross-check run at the identical source gave the same verdict.

**Budget verdict: 46 met / 0 unmet / 0 unknown (total 46), allMet=true,
0 hard failures, pass=true.** The 6 previously-UNMET are now MET by actual
measurement at the re-declared ceilings:

| Metric | Scope | Measured | Ceiling | Verdict |
| --- | --- | --- | --- | --- |
| entryDecodedBytes | phone-MATURE | 324689 B | 360000 B | MET |
| entryDecodedBytes | desktop-MATURE | 324689 B | 360000 B | MET |
| totalColdDecodedBytes | phone-MATURE | 1106322 B | 1220000 B | MET |
| totalColdDecodedBytes | desktop-MATURE | 1106322 B | 1220000 B | MET |
| fallbackTotalColdDecodedBytes | phone-FALLBACK-2D | 561642 B | 620000 B | MET |
| fallbackTotalColdDecodedBytes | desktop-FALLBACK-2D | 561642 B | 620000 B | MET |

Before -> after tally: **40/6/0 -> 46/0/0** (same 46 checks; no check added,
removed or weakened; no UNKNOWN existed or was promoted).

**Experience budgets — UNCHANGED ceilings, all MET (official run):**

| Context | FCP | load | idle P95 / drop | menu / tap | thr menu / tap | thr idle P95 | heap / growth |
| --- | --- | --- | --- | --- | --- | --- | --- |
| phone-MATURE | 76 ms | 34.6 ms | 16.8 / 0% | 10.9 / 13 ms | 17.3 / 125 ms | 16.8 ms | 11.63 / −0.33 MB |
| desktop-MATURE | 88 ms | 39 ms | 16.8 / 0% | 9.2 / 10 ms | 15.4 / 60 ms | 16.8 ms | 11.65 / −0.43 MB |
| desktop-STRESS | 80 ms | 36.8 ms | 16.8 / 0% | — | — | — | 9.68 / — |
| phone-FALLBACK-2D | 88 ms | 38.9 ms | 16.8 / 0% | — | — | — | 8.91 / — |
| desktop-FALLBACK-2D | 84 ms | 37.7 ms | 16.8 / 0% | — | — | — | 6.02 / — |

All far inside the unchanged ceilings (FCP ≤1500/1000 ms; load ≤2500/1800 ms;
idle P95 ≤20 ms, drop ≤2%; menu ≤100 ms, tap ≤120 ms; throttled menu ≤200 ms,
tap ≤250 ms, idle ≤33 ms; heap ≤64 MB, growth ≤16 MB). Panel-open/stress frame
checks and binaryMediaCount=0 also MET (full verdict list in the report JSON).
Compressed first playable: 301735 B (~0.30 MB) MATURE / 164570 B (~0.16 MB)
FALLBACK ≪ 8 MB. world3d=ready on both MATURE contexts; world3d=unavailable on
both FALLBACK contexts (the three chunk is never fetched there).

**Bundle identity:** the production build is byte-identical to the base main
build (no `src/` change). SHA256 inventory match across all 6 chunks verified
numerically between the before/after reports: entry `index-BgVhHfeK.js` 324689 B,
async three chunk `index-C09_CvPm.js` 544680 B, vendor 141658 B, tables 27054 B,
CSS 66873 B, lazy worker 13430 B.

## 6. Gates (at measurement head 5f50d96, all green, first pass)

| Gate | Command | Result |
| --- | --- | --- |
| Unit/behavior suite | `npx vitest run` (plain; no --maxWorkers) | **113 files / 1523 tests passed**, 0 failed, 0 skipped; no bench.test.ts:87 flake occurred (no rerun needed) |
| Types | `npx tsc --noEmit` | clean (exit 0, no output) |
| Content/behavior invariants | `npx tsx scripts/validate-content.mjs` | 0 content + 0 behaviour violations |
| Production build | `npm run build` | built OK; rebuilt `dist/assets` SHA256-identical to the measured inventory (all 6 chunks) — the re-declaration changes no shipped bytes |

No NON-budget test broke; no test asserts the old ceilings (grep-verified), so no
test update was required. No gate, floor or assertion was weakened.

## 7. Limitations (explicit)

1. Headless Chromium SwiftShader emulation on a fast desktop host with local
   preview — necessary-but-not-sufficient floor, NOT real-phone proof (#190 owed).
   CPU/GPU/thermal/real-touch/mobile-network are not emulated.
2. Non-vision: no visual-fidelity certification; G1 visual ACCEPT is
   sponsor-reserved at https://home.darkmatter2222.com/rustwake/.
3. Frame time sits at the 60 Hz vsync floor (16.8 ms) on this host even at 6x
   throttle; throttled interaction latency is the sensitive rerender-cost signal.
4. Memory is host-relative (Chromium-only `performance.memory`, GC-dependent).
5. This re-declaration does not pass G1/P1 by itself and does not merge; it
   requires independent QA + product APPROVE on the immutable head, then release
   merge + main CI/CD verification.