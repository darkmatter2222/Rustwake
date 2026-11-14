# Evidence: RW3D T03 renderer spike and benchmark (issue #130)

- Role: developer (implementation author; NOT an independent review)
- Issue: #130 | PR: #187 (draft) | branch `rw/130-renderer-spike`
- Measurements produced from working tree identical to checkpoint SHA
  `474e93b0e65a0843c9fd310df9fbfedd682cace3`; final immutable PR head is
  recorded in the role=developer issue comment.
- Acceptance IDs: P01 (initial measurement), P03 (cold load), V03 (prototype)
- Verdict: **handoff for independent QA + product review — no self-acceptance.**

## Scenario, seed, state

- Scene: ONE reference blockout `crane.gltf` (copied from
  `docs/vision/assets/generated/`) on a 12x12 sand patch; no economy simulation.
- Bench seed/state: `rw3d-t03-bench-v1` — 900 frames, fixed dt = 1/60, scripted
  timeline (idle; 360-degree orbit + hoist cycle; zoom + select + second cycle;
  zoom out + deselect + camera reset). No save file exists; save hash: n/a.
- Capture seed/state: `rw3d-t03-capture-v1` — open shot; then real click selects
  crane, one lift cycle advanced 60 frames (hoist y = 0.7546), yaw 75.
- Quality tier: `blockout-flat` (no shadows, DPR cap 2, antialias on,
  ambient-dominant fill, shared glTF materials). Viewport 1440x900 @1x.

## Device / browser (declared reference device)

- Windows 11 Pro 10.0.26200 x64; AMD Ryzen 9 9950X 16C/32T; NVIDIA GeForce
  RTX 5090 driver 32.0.15.9186 (+ AMD Radeon iGPU); 64 GB RAM.
  Census: `2026-11-14-rw3d-t03-device.json` (PowerShell Get-CimInstance).
- Headless Chrome 157 via playwright-core 1.65.1 (house executablePath pattern).
  Actual rasterizer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 ... Direct3D11)`,
  WebGL 2.0 — real GPU, NOT SwiftShader (`swiftshaderForced: false`).

## Commands, expected / actual, exit codes

All from `prototypes/rw3d-renderer/` (pnpm 10.31.0, Node 22.18.0;
`NODE_EXTRA_CA_CERTS=C:/Users/ryans/node-extra-ca.pem` for install).

| Command | Expected | Actual | Exit |
|---|---|---|---|
| `pnpm install` | deps resolve, lockfile written | three 0.187.0, vite 7.3.8, playwright-core 1.65.1, pngjs 7.0.0 | 0 |
| `pnpm test` | 7/7 pivot-invariant + palette-guard tests pass | 7 pass / 0 fail | 0 |
| `pnpm build` | production build | 657.13 kB js (166.40 kB gzip) | 0 |
| `pnpm bench` | 900 frames; 10 sanity/contract checks pass | 10/10 pass; 59.87 fps; render p50 0.2 / p95 0.4 ms; rAF p95 16.8 ms; 11 draw calls; 98 tris; input p95 1.3 ms; heap 4.73→6.62 MB (single run); warm first frame 116.3 ms; cold first frame 333 ms; 173,582 B transferred @20 Mbps/50 ms cache-disabled | 0 |
| `pnpm capture` | 3 screenshots; 14 numeric pixel checks pass | 14/14 pass; open 1440x900 (338 unique colors, stddev 35.78, bg fraction 0.3186, sand fraction 0.551, palette-near 0.9917); interactive amber pixels 2178 + "SELECTED: crane" text; diff fraction 0.2153; phone-emulation 780x1688 | 0 |

Raw results: `2026-11-14-rw3d-t03-benchmark.json`, `2026-11-14-rw3d-t03-pixels.json`.

Transparency: the first capture run failed one pre-registered numeric check
(sand-family terrain fraction 0.0095 vs >0.01) because ambient fill was too low
for lit tokens to read near authored sRGB. Hemisphere intensity was calibrated
1.0 → 1.6 (three's BRDF divides irradiance by PI); bench + capture were re-run
and all evidence above is from the passing runs. The first-run failure is not
hidden; no threshold was relaxed.

## Screenshots (committed)

- `2026-11-14-rw3d-t03-open.png` — initial view, default camera.
- `2026-11-14-rw3d-t03-interactive.png` — crane selected (amber box + HUD text),
  hoist mid-cycle, yaw 75.
- `2026-11-14-rw3d-t03-phone-emulation.png` — 390x844 @2x **desktop emulation
  only; NOT real phone evidence.**

## Capability gaps (explicit)

1. **Capable visual inspection pending.** Author is a non-vision agent; numeric
   pixel checks prove scale/completeness proxies only, not art fidelity.
2. **No real phone is attached to this environment.** No handset evidence
   exists; P0 reference-phone selection remains open. Desktop emulation is not
   phone evidence (contract + issue acceptance).
3. Single-asset blockout scene: P1 normal/stress/battle population targets and
   the 10-minute warmed memory-loop check (P02) are NOT measured here.
4. No headed interactive run; GPU evidence is from headless Chrome on the
   declared GPU. Motion evidence is two static states, not a 60s clip (V04
   belongs to a later issue).
5. Blockout asset is reference-only, not production-accepted art.

## Save / migration / recovery impact

**None.** Isolated prototype with its own package.json/lockfile; no root
package.json, lockfile, src/, existing tests, saves or migrations touched.
The spike holds no persistent state.

## Owned paths

- `prototypes/rw3d-renderer/**` (new)
- `docs/evidence/2026-11-14-rw3d-t03-*` (new)
