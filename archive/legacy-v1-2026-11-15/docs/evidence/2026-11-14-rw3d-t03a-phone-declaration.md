# RW3D T03a — reference phone declaration + real on-device evidence receipt

role=developer | issue [#190](https://github.com/darkmatter2222/Rustwake/issues/190) | release=rw3d | phase=P0 | key=T03a
PR: draft, base `main`, branch `rw/190-phone-declaration` (PR URL + final immutable head SHA recorded in the issue's developer evidence comment on creation).
Measurement SHA (prototype code under test): `1b83c58bd103a1a4a0f4529e820a7e4409685def`. This is a **docs-only** change; the measured `prototypes/rw3d-renderer` code is unchanged from that base, so the measurement SHA equals the base. The committed PR head (docs added on top) is reported in the PR comment.
Date: 2026-11-14. Declaration: [docs/vision/devices/reference-phone.md](../vision/devices/reference-phone.md).

**Evidence class: REAL physical handset** (Google Pixel 8 Pro) over adb + Chrome remote CDP. **Not desktop emulation.** The page rendered in Chrome on the phone, input was real CDP touch events, and the GPU is the phone's own (verified via `WEBGL_debug_renderer_info`).

## 1. Scenario + seed + save hash

- Scenario: static crane blockout on a 12×12 sand patch; scripted 900-frame timeline, fixed dt=1/60; no economy simulation. Single asset `crane.gltf` (8 box meshes).
- Seed/state: `rw3d-t03-bench-v1` (same scripted timeline as T03).
- Save hash: **N/A** — the spike holds no save data (its WebGL context-loss handler states "this spike holds no save data"). Save-integrity testing belongs to P02 at [#151](https://github.com/darkmatter2222/Rustwake/issues/151).

## 2. Device / browser / quality (measured at run time)

| Field | Value |
|---|---|
| Device | Google Pixel 8 Pro (`husky`), serial `37260DLJG003LN`, SoC Tensor G3 |
| GPU (in-browser) | `ANGLE (ARM, Mali-G715, OpenGL ES 3.2)`; vendor `Google Inc. (ARM)`; WebGL 2.0 (OpenGL ES 3.0 Chromium) |
| RAM | `MemTotal 11850652 kB` (≈11.3 GiB, 12 GB variant); `navigator.deviceMemory`=8 (Chrome cap) |
| OS / build | Android 16, SDK 36, `CP1A.260505.005`, security patch 2026-05-05 |
| Browser | Chrome 157.0.8103.48 (Android); `hardwareConcurrency`=9 |
| Active display | `wm size` 1008×2244, density 360 dpi → `devicePixelRatio` 2.25, app-effective DPR 2 (cap) |
| Viewport / buffer | CSS 448×867; drawing buffer 896×1734; `screen` 448×998 |
| Battery at census | 25.5 °C, 75 % |
| Quality tier | `blockout-flat`: no shadows, DPR cap 2, shared glTF materials, antialias on |
| Renderer | three.js revision 187 (pinned 0.187.0) |

Honesty note: Android Chrome `navigator.userAgent` is reduced/frozen to "Android 10; K"; the authoritative OS/build are the adb `getprop` values above, not the UA string.

## 3. Commands (host)

```bash
pnpm --dir prototypes/rw3d-renderer install --frozen-lockfile   # exit 0
pnpm --dir prototypes/rw3d-renderer build                       # exit 0
pnpm --dir prototypes/rw3d-renderer exec vite preview --host 127.0.0.1 --port 4310 --strictPort
adb reverse tcp:4310 tcp:4310
adb shell input keyevent KEYCODE_WAKEUP; adb shell svc power stayon true; adb shell wm dismiss-keyguard
adb shell am start -a android.intent.action.VIEW -d http://localhost:4310/ com.android.chrome
adb forward tcp:9222 localabstract:chrome_devtools_remote
node docs/evidence/2026-11-14-rw3d-t03a-phone-bench.mjs         # exit 0 (all checks pass)
pnpm validate                                                   # exit 0
pnpm typecheck                                                  # exit 0
```

The remote-CDP runner ([2026-11-14-rw3d-t03a-phone-bench.mjs](2026-11-14-rw3d-t03a-phone-bench.mjs)) reuses `prototypes/rw3d-renderer/scripts/lib.mjs` and the in-page `window.__RW3D__` API **without modifying `prototypes/`**, and mirrors `scripts/bench.mjs` with **identical, unrelaxed** thresholds. Raw result: [2026-11-14-rw3d-t03a-phone-benchmark.json](2026-11-14-rw3d-t03a-phone-benchmark.json).

Setup gotcha found and fixed: `vite preview` defaulted to IPv6 `[::1]:4310`, but `adb reverse` forwards to host **127.0.0.1** (IPv4); the phone got `ERR_EMPTY_RESPONSE` until the preview was rebound with `--host 127.0.0.1`. Recorded for reproducibility.

## 4. Expected vs actual

| Budget (contract) | Expected | Actual (Pixel 8 Pro) | Result |
|---|---|---|---|
| Cold interaction (P03) | ≤ 5000 ms @20 Mbps/50 ms | 453.6 ms (warm 404.1 ms) | PASS |
| Transferred payload (P03) | ≤ 8,388,608 B | 173,591 B (nav 1,297 + res 172,294; encoded 171,694; 2 resources) | PASS |
| p95 input-to-feedback (P01) | ≤ 100 ms | 22.1 ms (p50 12.4; 10 real touch samples) | PASS |
| p95 rAF delta (not frozen) | ≤ 250 ms | 16.8 ms (p50 16.7; max 25) → 59.97 fps | PASS |
| Render time | report | p50 0.7 / p95 1.2 / p99 1.9 / max 25.1 ms | reported |
| Max draw calls (spike sanity) | ≤ 32 | 9 (min 7) | PASS |
| Max triangles (spike sanity) | ≤ 5000 | 86 (min 50) | PASS |
| Frames completed | 900 | 900 | PASS |
| Page errors | 0 | 0 | PASS |
| Selection samples | ≥ 10 | 10 | PASS |
| Warm startup first frame | ≤ 5000 ms | 404.1 ms (gltfLoad 43 ms) | PASS |

Memory: geometries 7, textures 1 (stable). `performance.memory` reported 10,000,000 B before and after — Android Chrome quantizes this API to coarse buckets, so it is **not** a precise heap-growth signal here (see gaps). P02 bounded-memory loops are **not** run (deferred to #151).

## 5. Tests with exit codes (real)

| Check | Command | Exit |
|---|---|---|
| On-device benchmark (10 pre-registered checks) | `node docs/evidence/2026-11-14-rw3d-t03a-phone-bench.mjs` | **0** |
| Prototype build | `pnpm --dir prototypes/rw3d-renderer build` | **0** |
| Prototype install | `pnpm --dir prototypes/rw3d-renderer install --frozen-lockfile` | **0** |
| Root install (for validate/typecheck) | `pnpm install --no-frozen-lockfile` | **0** |
| Content validate | `pnpm validate` | **0** |
| Typecheck (docs-only change) | `pnpm typecheck` | **0** |
| Markdown local-link check (both new docs) | ad-hoc node link resolver | **0** |

Root `pnpm-lock.yaml` is not tracked in this repo; the install generated an untracked lockfile that is **not committed**. No `prototypes/`, `src/`, `tests/`, `docs/vision/architecture/**`, `TECHNICAL_CONTRACT.md`, or `*t05*` files were touched. T03 evidence artifacts were not overwritten (all outputs use the `t03a-phone` prefix).

## 6. Screenshot paths (real device framebuffer)

- [2026-11-14-rw3d-t03a-phone-open.png](2026-11-14-rw3d-t03a-phone-open.png) — initial render.
- [2026-11-14-rw3d-t03a-phone-selected.png](2026-11-14-rw3d-t03a-phone-selected.png) — after real touch interactions.

Both are **1008×2131** PNGs (the phone's actual framebuffer width, not a 390×844 emulation). Numerical non-blank verification (this runtime is non-vision): inflated IDAT = 6,446,275 B = 1008×2131×3 + 2131 filter bytes (genuine 8-bit RGB), 256/256 distinct byte values, Shannon entropy 0.551 / 0.554 bits/byte, ~256 KB compressed — a real non-uniform render, not a blank/error page. Active-scene counters corroborate: 9 draw calls, 86 triangles, 7 geometries, 1 texture.

**Visual-fidelity gap:** per [AGENTS.md](../../AGENTS.md), a non-vision agent cannot self-certify visual fidelity. A **vision-capable reviewer must confirm** the images show the crane blockout and selection box. Numeric proxies suffice for a spike (consistent with the accepted T03 deferral), but visual confirmation is owed at #132/art acceptance and mandatory at G1 (#151).

## 7. Motion / audio evidence

- Motion: the scripted 900-frame hoist/orbit timeline was exercised via `runBench`; post-run pivot state `idle`, y=1.2, `reducedMotion=false`. Real touch selection registered (10 latency samples).
- Audio: none — the spike has no audio.

## 8. Capability gaps / limitations (honest)

1. **Flagship, not mid-range.** Primary declared device is a Pixel 8 Pro (Tensor G3 / Mali-G715). These numbers do **not** establish mid-range (Galaxy A54 / Mali-G68) compliance. Mid-range floor measurement is **owed** (declaration §2).
2. **iOS not measured.** iPhone 13 Safari secondary is declared but **owed**; requires a macOS host (declaration §3).
3. **Single-asset blockout.** P1 normal/stress/battle population targets (20/100 buildings etc.) are **not** measured.
4. **P02 not run.** Warmed three-10-minute bounded-memory loops and hidden-tab/context-loss save integrity are deferred to #151 per the accepted product deferral; G0 requires P01 initial measurement only.
5. **Input metric scope.** Input-to-feedback is the app's pointerup-handler metric (`performance.now() - event.timeStamp`); it excludes display scan-out/compositor presentation latency.
6. **Active resolution.** Device display was set to 1008×2244, not the panel's native 1344×2992; results reflect the active setting.
7. **Thermal not stressed.** Short 900-frame run from a cool start (25.5 °C); sustained-load throttling unverified.
8. **Coarse heap API.** Android Chrome `performance.memory` is quantized; precise on-device heap growth needs CDP `HeapProfiler`/`Runtime.getHeapUsage` or `renderer.info.memory`.
9. **Network shaping is CDP emulation on the real device.** The renderer/GPU/input are real; the 20 Mbps/50 ms condition is CDP-emulated (the contract's documented simulation), not a cellular field test.
10. **Non-vision runtime.** Visual fidelity not self-certified (see §6).

## 9. Dispatch-premise correction (transparency)

The dispatch brief stated the runtime had **no physical handset** and asked for a no-hardware limitation receipt, and *preferred* a mid-range primary. Both premises are corrected here:

- A **Pixel 8 Pro is attached** (serial `37260DLJG003LN`; `adb devices` = `device`; PnP "Pixel 8 Pro"). Issue #190 instructs to attempt real on-device evidence first and only record a limitation *if no handset is available*. Accordingly this receipt records **real on-device evidence**, not a fabricated limitation. No emulation is passed off as phone evidence.
- The **available** Pixel 8 Pro is declared primary because the contract requires a *named available* reference phone and the issue requires evidence *at the declared device* — both satisfied with real data. A mid-range floor (Galaxy A54) and iOS secondary (iPhone 13) are declared as **owed** tiers to honor the mid-range intent. The product owner may re-designate a mid-range primary at verdict; this real-handset data point remains valid regardless.

## 10. Proposed gate decision (for the product owner — NOT self-acceptance)

**Proposal: ACCEPT the reference-phone declaration and the real-device P01 initial measurement + P03 cold load for G0**, with the following explicit, tracked limitations carried into G0 gate evidence:

- The P0 *"select a named available reference phone"* obligation is **met** (Pixel 8 Pro, named + available + measured). G0's *"P01 initial measurement"* is **met on real hardware** (all 10 checks pass, exit 0).
- **Owed before any mid-range/iOS handset pass:** measure Galaxy A54 (Mali-G68 floor) and iPhone 13 (Safari) per declaration §5; until then, no mid-range or iOS pass is claimed.
- **Owed at #151 (G1):** P1 population benchmarks, P02 warmed three-10-minute bounded-memory loops, hidden-tab pause + context-loss save integrity, and vision-capable visual review.
- **Alternative for product:** if a mid-range primary is required, re-designate Galaxy A54 as primary and schedule a sponsor hardware session for it; the Pixel 8 Pro evidence here remains a valid real-handset data point and the declaration structure already supports the swap.

Re-measurement checklist and harness steps are in [declaration §5](../vision/devices/reference-phone.md). No benchmark numbers were fabricated for any phone; the only measured numbers are from the attached Pixel 8 Pro.

## 11. Handoff / stop condition

Issue #190 → isolated `rw/190-phone-declaration` worktree → linked draft PR → **independent QA + product verdict on immutable head SHA (owed)** → release engineer merge → main CI/CD verification. Reviewer cannot be the implementation author. **No self-acceptance, no merge, no label edits.** Developer evidence complete; stopping at bounded handoff.
