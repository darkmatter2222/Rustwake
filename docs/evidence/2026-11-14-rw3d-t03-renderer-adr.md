# ADR: RW3D renderer selection (issue #130, T03)

- Status: proposed (developer recommendation; independent QA/product verdict pending)
- Date: 2026-11-14
- Role: developer
- PR: #187 (draft), branch `rw/130-renderer-spike`, checkpoint SHA `474e93b0e65a0843c9fd310df9fbfedd682cace3`
- Acceptance IDs: P01, P03, V03 (prototype)

## Decision

Use **three.js, pinned exactly to `0.187.0`** (latest stable release returned by
`pnpm view three version` on 2026-11-14; MIT license), with official addons
`GLTFLoader` and `OrbitControls`. Vite 7.3.8 is the spike's dev/build tool only.
The pin lives in `prototypes/rw3d-renderer/package.json` + `pnpm-lock.yaml`.

## Options considered

| Option | Assessment against TECHNICAL_CONTRACT | Outcome |
|---|---|---|
| three.js 0.187.0 | Contract's default candidate. ESM, tree-shakeable; glTF import, orthographic camera, orbit/pan/zoom and raycasting all covered by core + addons. Measured spike bundle: 657.1 kB minified / 166.4 kB gzip — far inside the 8 MB first-playable budget. No physics engine pulled in. | **Chosen** |
| Babylon.js | Capable, but a fuller engine (larger core payload, inspector/physics ecosystem). Contract says do not add heavyweight machinery before measured need; nothing in P0 requires what Babylon adds over three. Would need the same-scene evidence to justify switching. | Rejected for P0 |
| PlayCanvas | Engine + editor-centric workflow; entity-component model duplicates structure the contract already assigns to our simulation/renderer boundary. No P0 requirement needs it. | Rejected for P0 |
| Raw WebGL2 | Zero dependency, but re-implements glTF parsing, camera math, controls and picking — cost and correctness risk with no measured benefit at this scene size (11 draw calls / 98 triangles). | Rejected |

## Evidence behind the choice (this device, this scene)

Declared reference device: Windows 11 Pro 26200, AMD Ryzen 9 9950X (16C/32T),
NVIDIA GeForce RTX 5090 (driver 32.0.15.9186), 64 GB RAM
(`2026-11-14-rw3d-t03-device.json`). Headless Chrome 157 rasterized on the real
GPU: `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 ... Direct3D11)` — not SwiftShader.

Bounded 900-frame run (fixed dt 1/60, scripted orbit/select/zoom/hoist timeline,
seed `rw3d-t03-bench-v1`): 59.87 fps achieved; render p50 0.2 ms / p95 0.4 ms;
11 draw calls; 98 triangles; input-to-feedback p95 1.3 ms; warm first frame
116.3 ms; cold first frame 333 ms with 173,582 bytes transferred under CDP
20 Mbps / 50 ms, cache disabled. Full numbers and exit codes:
`2026-11-14-rw3d-t03-benchmark.json`. These are single-asset blockout numbers;
P1 population targets (20 buildings / 30 units / 200 cargo) are not yet measured.

## Integration implications for #132 (renderer boundary)

1. Keep three.js behind a renderer module that owns camera + visual time and
   reads immutable snapshots. The spike demonstrates the boundary: `src/main.js`
   holds no economy logic; `src/pivot.js` is a pure, DOM-free state machine fed
   dt by the caller. Simulation/UI must never import THREE objects.
2. Reuse the kit's shared glTF materials/meshes; plan instancing + aggregate
   cargo representation before P1 population scale-up (contract: do not render
   every resource unit as a unique object).
3. Quality tiers: spike runs `blockout-flat` (no shadows, DPR cap 2, ambient-
   dominant fill calibrated so palette tokens read near authored sRGB). Add
   soft-shadow tier later per ART_AND_MOTION; keep simplified contact shadows
   at low quality.
4. Carry forward the spike's context-loss message, hidden-tab render pause and
   reduced-motion discrete stages; they map to contract requirements.
5. Payload headroom is large (166 kB gzip JS today). If the vendor chunk grows,
   split via `manualChunks`; re-run `pnpm bench` cold-load check on any renderer
   version bump. Version changes require an issue + benchmark re-run, never a
   floating range.
6. Deterministic capture/bench mode (fixed dt, scripted timeline, exposed
   `window.__RW3D__` API) is the pattern for future V03/P01 evidence.

## Consequences

- Positive: smallest proven path to the contract's default candidate; measured
  headroom; reproducible evidence pipeline already in repo.
- Negative: three.js releases frequently; exact pin + lockfile + re-benchmark
  discipline required. Addons API drift is possible across minors.
- Not decided here: final art parity, LOD authoring, phone reference device.
