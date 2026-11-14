# rw3d-renderer-spike (issue #130, RW3D T03)

Self-contained P0 renderer proof. Isolated from the root app: own package.json
and lockfile, no root/src/test changes, no save or migration impact.

- Renderer: three.js 0.187.0 (pinned). ADR: docs/evidence/2026-11-14-rw3d-t03-renderer-adr.md
- Asset: one reference blockout copied from docs/vision/assets/generated/crane.gltf
  (public/assets/crane.gltf). Named pivot "hoist", authored clip bounds y 0.4..1.2.
- Orthographic camera (yaw 45, elevation 35.264), orbit/pan/zoom, raycast
  selection with amber box + text (not color-only), state-driven bounded hoist
  cycle, reduced-motion discrete stages, DPR cap 2, no shadows (blockout-flat).

## Commands (pnpm only; ports 4300 dev / 4310 preview)

    pnpm install        # NODE_EXTRA_CA_CERTS=C:/Users/ryans/node-extra-ca.pem
    pnpm test           # node --test: pivot invariants + palette guard
    pnpm dev            # interactive at http://localhost:4300
    pnpm bench          # builds, previews on 4310, 900-frame bounded run,
                        # cold load @20Mbps/50ms; writes docs/evidence/2026-11-14-rw3d-t03-benchmark.json
    pnpm capture        # headless screenshots + numeric pixel checks; writes
                        # docs/evidence/2026-11-14-rw3d-t03-{open,interactive,phone-emulation}.png and -pixels.json

Bench/capture need system Chrome or Edge (house pattern from scripts/capture.mjs).
Headless may rasterize via SwiftShader; the actual GL renderer is recorded in
the JSON evidence. phone-emulation.png is desktop emulation, not phone evidence.
