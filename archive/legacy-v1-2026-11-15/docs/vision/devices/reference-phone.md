# RW3D reference phone declaration (T03a)

role=developer | issue [#190](https://github.com/darkmatter2222/Rustwake/issues/190) | release=rw3d | phase=P0
Status: **proposed declaration + real on-device evidence; independent QA and product verdict owed (no self-acceptance).**
Date: 2026-11-14. Base/declaration SHA: `1b83c58bd103a1a4a0f4529e820a7e4409685def` (immutable head of `rw/190-phone-declaration`; see PR for the final committed head).

This document satisfies the P0 contract obligation in [TECHNICAL_CONTRACT.md](../TECHNICAL_CONTRACT.md): *"P0 must select a named available reference phone before claiming handset pass"* and *"Declare actual tested device/OS/browser/resolution and quality tier; desktop emulation is not real handset evidence."* Gate context: [ACCEPTANCE.md](../ACCEPTANCE.md) P01/P03 and G0; device honesty: [EXECUTIVE_CONTRACT.md](../EXECUTIVE_CONTRACT.md).

> **Dispatch-premise correction (read first).** The dispatch brief assumed *"this runtime is a Windows desktop with NO physical handset attached"* and asked for a no-hardware limitation receipt. That premise is **false for this runtime**: a physical **Google Pixel 8 Pro** is attached over adb (serial `37260DLJG003LN`, PnP device "Pixel 8 Pro", `adb devices` = `device`). Issue #190 itself instructs: *"Attempt real on-device renderer evidence using prototypes/rw3d-renderer ... If no physical handset is available ... record the exact limitation."* Because a handset **is** available, this delivery produces **real on-device evidence** rather than fabricating a no-hardware limitation. The brief also *preferred* a mid-range primary; this declaration instead names the **available** Pixel 8 Pro as primary (the contract requires a *named available* phone, and the issue requires evidence *at the declared device*), and declares a mid-range floor and an iOS secondary as **owed** verification tiers. Both divergences are flagged for the product owner at verdict.

## 1. Primary reference phone — Google Pixel 8 Pro (declared, available, measured)

Chosen because it is the handset physically available to this runtime, so it can be **named, declared, and actually measured** in one pass — exactly what the P0 contract and issue #190 require. It is a 2023 flagship; it is **not** a mid-range phone, and its results do **not** establish mid-range compliance (see §2).

| Attribute | Value | Authority |
|---|---|---|
| Model / codename | Pixel 8 Pro / `husky` (models GC3VE, G1MNW) | measured `ro.product.model`/`ro.product.device`; spec sheet |
| SoC | Google Tensor G3 (4 nm), nona-core (1×Cortex-X3 2.91 GHz + 4×A715 2.37 GHz + 4×A510 1.70 GHz) | measured `ro.soc.model=Tensor G3`; spec sheet |
| GPU | Mali-G715 MP7 (spec); **measured in-browser: `ANGLE (ARM, Mali-G715, OpenGL ES 3.2)`**, vendor `Google Inc. (ARM)`, WebGL 2.0 | measured `WEBGL_debug_renderer_info`; spec sheet |
| RAM | 12 GB variant; measured `MemTotal: 11850652 kB` (≈11.3 GiB). `navigator.deviceMemory` reports 8 (Chrome caps this API at 8) | measured `/proc/meminfo`; spec sheet |
| Display (panel) | 6.7" LTPO OLED, 120 Hz, HDR10+, native **1344×2992** (~489 ppi), 2400 nits peak | spec sheet |
| Display (active test config) | **1008×2244** @ density **360 dpi** → `devicePixelRatio` **2.25**, app-effective DPR **2** (cap). CSS viewport **448×867**; drawing buffer **896×1734** | measured `wm size`/`wm density` + in-page probe |
| OS | **Android 16**, SDK **36**, build **CP1A.260505.005**, security patch **2026-05-05** (launch Android 14; up to 7 major OS updates per spec) | measured `ro.build.*`; spec sheet |
| Browser | **Chrome 157.0.8103.48** (Android). `navigator.userAgent` is reduced/frozen to "Android 10; K"; authoritative OS/build are the adb props above | measured `dumpsys package` + CDP `/json/version` |
| CPU threads exposed | `navigator.hardwareConcurrency` = 9 | measured in-page |
| Battery | 5050 mAh; at census 25.5 °C, 75 % | spec sheet; measured `dumpsys battery` |
| Quality tier tested | `blockout-flat`: no shadows, DPR cap 2, shared glTF materials, antialias on | spike config |

### 1.1 Rationale against the P01/P02/P03 budgets (measured margins)

Real on-device run: [benchmark JSON](../../evidence/2026-11-14-rw3d-t03a-phone-benchmark.json), [receipt](../../evidence/2026-11-14-rw3d-t03a-phone-declaration.md). Seed `rw3d-t03-bench-v1`, scripted 900-frame timeline, fixed dt=1/60, static crane blockout on a 12×12 sand patch (no economy simulation). Input = real CDP touch (`Input.dispatchTouchEvent` → `pointerdown`/`pointerup`).

| Budget (contract) | Target | Measured on Pixel 8 Pro | Margin |
|---|---|---|---|
| Cold interaction (P03) | ≤ 5 s @ documented 20 Mbps / 50 ms | cold first frame **453.6 ms** (warm 404.1 ms) | ~11× under |
| Transferred payload (P03) | ≤ 8 MB compressed | **173,591 B** (~169.5 KB; nav 1,297 + resources 172,294) | ~48× under |
| p95 input-to-feedback (P01) | ≤ 100 ms | **22.1 ms** (p50 12.4 ms; 10 real touch samples) | ~4.5× under |
| Sustained frame (P1 normal phone) | p95 frame ≤ 33.3 ms (≥ 30 fps) | rAF p95 **16.8 ms**, p50 16.7 ms → **59.97 fps** (vsync-capped ~60 Hz); render p95 **1.2 ms**, p50 0.7 ms | ~2× under frame budget |
| Draw calls / triangles (spike sanity) | ≤ 32 / ≤ 5000 | max **9** calls / **86** tris (7 geometries, 1 texture) | well under |
| Bounded memory (P02) | no >10% growth after three warmed 10-min loops | **NOT measured here** — deferred to [#151](https://github.com/darkmatter2222/Rustwake/issues/151) per accepted product deferral. Object counts stable (7 geometries / 1 texture). Android Chrome `performance.memory` is coarse/quantized (10 MB buckets), so JS-heap growth needs a finer method on-device | owed |

All ten pre-registered harness checks (identical thresholds to `prototypes/rw3d-renderer/scripts/bench.mjs`, **not relaxed**) passed with exit code 0. These are **P01 initial measurement + P03 cold load** on real hardware — sufficient for G0's *"P01 initial measurement"* requirement; they are **not** a P1 population pass, **not** a P02 warmed-memory pass, and **not** art certification.

### 1.2 Why a flagship primary is honest but incomplete

The Pixel 8 Pro's Mali-G715 is a high-tier GPU. Passing here proves the spike's render/input/load path works on a real Android handset and that the budgets are met on capable hardware; it does **not** prove the mid-range floor. The contract's *"target phone p95 ≤ 33.3 ms"* must eventually be demonstrated on a mid-range device. That obligation is declared in §2 and carried as an explicit limitation into G0 gate evidence and #151. The product owner may re-designate a mid-range phone as primary at verdict; the available-device evidence here remains valid as a real-handset data point regardless.

## 2. Mid-range floor — Samsung Galaxy A54 (declared required secondary; measurement OWED)

Declared to honor the dispatch's mid-range intent and to guard against a flagship-only blind spot. **Not attached to this runtime; no measurement produced.** Public spec sheet only; no benchmark numbers are claimed for it.

| Attribute | Value | Authority / assumption |
|---|---|---|
| SoC / GPU | Exynos 1380 (5 nm) / **Mali-G68 MP5** | spec sheet |
| Display | 6.4" Super AMOLED, 1080×2340, 120 Hz (~403 ppi) | spec sheet |
| RAM | 4 / 6 / 8 GB options; **assume 8 GB** for the floor test | spec sheet; variant is an **assumption** |
| OS | Android 13 launch, 4 major OS updates (One UI 8.5) | spec sheet |
| Reference GPU throughput | GFXBench 25 fps (ES 3.1 onscreen) — published synthetic, **not** a Rustwake measurement | spec sheet |
| Models | SM-A546B/U/etc. | spec sheet |

Rationale: Mali-G68 MP5 is a representative mid-range ARM GPU roughly an order of magnitude below the G715 in published synthetic throughput; if the spike holds 30 fps and the load/input budgets here, the phone target is credible for the broad Android middle. **Owed:** run the same harness (§5) on a physical A54 (or equivalent Mali-G68/Adreno-600-class device) before any mid-range handset pass is claimed.

## 3. iOS compatibility secondary — Apple iPhone 13, Safari (declared; measurement OWED)

Declared for iOS Safari compatibility (WebKit WebGL, different memory/GPU behavior). **Not attached; requires a macOS host with Safari/WebDriver or an attached iPhone; no measurement produced.**

| Attribute | Value | Authority / assumption |
|---|---|---|
| SoC / GPU | A15 Bionic (5 nm) / Apple GPU 4-core | spec sheet |
| Display | 6.1" OLED, 1170×2532 (~460 ppi); **60 Hz (non-ProMotion) — assumption** | spec sheet; refresh rate marked **assumption** |
| RAM | 4 GB | spec sheet |
| OS | iOS 15 launch, up to iOS 27.2 | spec sheet |
| Reference GPU throughput | GFXBench 59 fps (ES 3.1 onscreen) — published synthetic, **not** a Rustwake measurement | spec sheet |

**Owed:** cold-load + input + frame measurement in mobile Safari on a physical iPhone (macOS host), including Safari-specific `performance.memory` absence and WebGL context-loss behavior.

## 4. Desktop benchmark host — T03 (separated; NOT a phone)

The desktop reference from T03 is the **benchmark host**, kept strictly separate from the phone declaration. It is **not** handset evidence and is never counted as such.

- Host: Windows 11 Pro 10.0.26200, AMD Ryzen 9 9950X (16C/32T), NVIDIA RTX 5090 (driver 32.0.15.9186) + AMD iGPU, 64 GB RAM.
- Browser: headless Chrome 157, ANGLE/D3D11 (not SwiftShader).
- T03 result: 59.87 fps, render p50 0.2 / p95 0.4 ms, rAF p95 16.8 ms, 11 draw calls, 98 tris, input p95 1.3 ms, cold 333 ms / 173,582 B @20 Mbps/50 ms.
- The T03 `phone-emulation.png` (390×844@2x) is **explicitly labeled NOT phone evidence**.
- Source: [T03 evidence](../../evidence/2026-11-14-rw3d-t03-evidence.md), [T03 device census](../../evidence/2026-11-14-rw3d-t03-device.json).

## 5. Harness steps to (re-)measure on a declared phone

The spike harness (`prototypes/rw3d-renderer`) targets a local headless browser by default; this delivery added a **remote-CDP adapter** as an evidence artifact (no `prototypes/` edits): [2026-11-14-rw3d-t03a-phone-bench.mjs](../../evidence/2026-11-14-rw3d-t03a-phone-bench.mjs). It reuses `scripts/lib.mjs` helpers and the in-page `window.__RW3D__` API, connects with `chromium.connectOverCDP`, drives **real touch**, and mirrors `bench.mjs` checks without relaxing thresholds.

Reproduce on the attached Android phone (host):

```bash
pnpm --dir prototypes/rw3d-renderer install --frozen-lockfile
pnpm --dir prototypes/rw3d-renderer build
# preview MUST bind IPv4 127.0.0.1: adb reverse forwards to host 127.0.0.1, not [::1]
pnpm --dir prototypes/rw3d-renderer exec vite preview --host 127.0.0.1 --port 4310 --strictPort
adb reverse tcp:4310 tcp:4310
adb shell input keyevent KEYCODE_WAKEUP && adb shell svc power stayon true && adb shell wm dismiss-keyguard
adb shell am start -a android.intent.action.VIEW -d http://localhost:4310/ com.android.chrome
adb forward tcp:9222 localabstract:chrome_devtools_remote
node docs/evidence/2026-11-14-rw3d-t03a-phone-bench.mjs   # exits 0/1 on pre-registered checks
```

For the owed mid-range/iOS tiers, repeat on the target hardware (iOS needs a macOS Safari host), and additionally run the **P02** protocol at #151: three warmed identical 10-minute loops asserting <10% heap/object growth, plus hidden-tab rendering pause and WebGL context-loss save integrity. On Android, prefer CDP `HeapProfiler`/`Runtime.getHeapUsage` or `renderer.info.memory` over the coarse `performance.memory` API.

### What must be re-measured on each declared phone (checklist)

- Sustained fps and p50/p95/p99 frame time under normal/stress/battle populations (P1; not just the blockout).
- Draw calls / triangles / geometries / textures at those populations.
- Cold load + transferred payload under the documented 20 Mbps / 50 ms simulation, on a real network path.
- p95 input-to-feedback with real touch (and a presentation-latency-aware method, not only the handler metric).
- Bounded memory across three warmed 10-minute loops (P02), with a device-appropriate heap probe.
- Thermal throttle under sustained load (this run started cool at 25.5 °C and was short; throttling unverified).
- Hidden-tab pause/resume and WebGL context-loss recovery with save integrity (P02).

## 6. Assumptions register (spec vs measured vs assumed)

- **Measured (authoritative for the attached device):** model/codename, SoC, GPU renderer string, RAM (`MemTotal`), active resolution/density/DPR, OS/build/patch, Chrome version, CPU threads, battery temp/level, all benchmark numbers. Source: adb + in-browser probes at run time.
- **Public spec sheet (cited, not measured here):** panel native resolution/refresh/size, GPU core count (MP7), launch OS and update policy, battery capacity, model numbers; Galaxy A54 and iPhone 13 entire rows.
- **Explicit assumptions:** Galaxy A54 test variant = 8 GB RAM; iPhone 13 = 60 Hz non-ProMotion; sustained-phone target interpreted as p95 frame ≤ 33.3 ms (≥30 fps) per P1 normal; mid-range GPU class equivalence (Mali-G68/Adreno-600) as the floor. These are flagged for product confirmation.
- **Not claimed:** any benchmark number for Galaxy A54 or iPhone 13; any mid-range or iOS handset pass; P1 population pass; P02 warmed-memory pass; visual fidelity (this runtime is non-vision — see receipt).

## 7. Sources (public spec sheets; access date 2026-11-14)

- Google Pixel 8 Pro — https://www.gsmarena.com/google_pixel_8_pro-12545.php (accessed 2026-11-14). Used for panel/SoC/GPU-core/RAM/launch-OS/battery/models. (Note: `-12546` is the Pixel 8, not Pro; the Pro is `-12545`.)
- Samsung Galaxy A54 — https://www.gsmarena.com/samsung_galaxy_a54-12070.php (accessed 2026-11-14).
- Apple iPhone 13 — https://www.gsmarena.com/apple_iphone_13-11103.php (accessed 2026-11-14).
- Attached-device authority: adb `getprop`/`wm`/`/proc/meminfo`/`dumpsys` and in-browser `WEBGL_debug_renderer_info`, captured at run time in the [benchmark JSON](../../evidence/2026-11-14-rw3d-t03a-phone-benchmark.json) `device`/`gl`/`display` blocks.

GSMArena publishes a disclaimer that it cannot guarantee 100% correctness; spec-sheet values are cited as reference, and the measured adb/in-browser values are authoritative for the attached device. No phone benchmark numbers were fabricated; the only measured numbers are from the attached Pixel 8 Pro run.
