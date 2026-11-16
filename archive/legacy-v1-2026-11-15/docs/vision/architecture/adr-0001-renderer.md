# ADR-0001: three.js exact pin project-wide; scale-fixture alignment

- Status: proposed (developer decision record for #132; independent QA + product verdict on the immutable PR head required). Adopts and extends the T03 ADR, which product accepted with merge conditions (PR #187 comment 6871124473).
- Date: 2026-11-14
- Role: developer
- Issue: [#132](https://github.com/darkmatter2222/Rustwake/issues/132) (T05, P0 integration gate)
- Acceptance IDs: V03 (prototype), P01 (initial measurement), P03 (cold load); settles the version-policy merge condition on PR #187.

## 1. Context

T03 (#130) delivered a bounded renderer spike, merged at `262829e63fec570f732677d4bf24c634cf8d3ede` (PR #187; reviewer ACCEPT 6871074468, product ACCEPT 6871124473). Its ADR ([T03 renderer ADR](../../evidence/2026-11-14-rw3d-t03-renderer-adr.md)) proposed three.js pinned exactly to `0.187.0` inside `prototypes/rw3d-renderer/`. Product's merge condition requires #132 to settle **one exact project pin** and to rule on the `0.160.0` pin in T04's scale fixture (`prototypes/rw3d-scale-fixture/`, merged `4acf7efb4c615e59087402ed6ed9ee1c19d698f5`, PR #188; product ruling f in comment 6871139430: "Not a T04 defect; self-contained prototypes. Alignment -> #132 T05").

Measured basis (T03 benchmark, seed `rw3d-t03-bench-v1`, declared device Windows 11 Pro 26200 / Ryzen 9 9950X / RTX 5090 driver 32.0.15.9186, headless Chrome 157 on real GPU `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 ... Direct3D11)`, not SwiftShader; quality `blockout-flat`, 1440×900 @1x): 59.87 fps, render p50 0.2 / p95 0.4 ms, rAF p95 16.8 ms, 11 draw calls, 98 triangles, input-to-feedback p95 1.3 ms, warm first frame 116.3 ms, cold first frame 333 ms with 173,582 B transferred @20 Mbps/50 ms cache-disabled; bundle 657.13 kB minified / 166.40 kB gzip. Raw: [benchmark.json](../../evidence/2026-11-14-rw3d-t03-benchmark.json), [device census](../../evidence/2026-11-14-rw3d-t03-device.json).

## 2. Decision

**three.js is pinned EXACTLY to `0.187.0` project-wide.**

1. Every package in this repository that depends on three.js — the root app when the 3D renderer lands (P1, isolated feature route/flag per technical contract "Rollout") and every prototype that renders production content — declares `"three": "0.187.0"` with **no floating range** (no `^`, `~`, `*`, `latest`, or range specifiers), plus a committed lockfile for that package.
2. **Any version bump requires a tracked issue and a re-benchmark** before merge: the spike's `pnpm bench` cold-load check (P03 budgets), frame/input timings and deterministic capture re-run on the declared device, with results recorded as evidence. Never a floating range, never a silent bump (T03 ADR consequence; product merge condition 6871124473).
3. Addons (`GLTFLoader`, `OrbitControls`) come from the same pinned three.js release; addon API drift across minors is a re-benchmark trigger, not an independent pin.
4. This policy is recorded surgically in [TECHNICAL_CONTRACT.md](../TECHNICAL_CONTRACT.md) ("Retain and replace deliberately") so future issues inherit it without re-reading this ADR.

The root `package.json` has no three.js dependency today (the spike is isolated); the pin applies when the renderer integration issue adds it. `prototypes/rw3d-renderer/` already complies (`0.187.0` + own lockfile).

## 3. Alternatives (from the T03 ADR, unchanged assessment)

| Option | Assessment against TECHNICAL_CONTRACT | Outcome |
|---|---|---|
| three.js 0.187.0 | Contract's default candidate. ESM, tree-shakeable; glTF import, orthographic camera, orbit/pan/zoom, raycasting covered by core + addons. Measured 166.4 kB gzip — far inside the 8 MB first-playable budget. No physics engine pulled in. | **Chosen** |
| Babylon.js | Fuller engine (larger core payload, inspector/physics ecosystem); contract forbids heavyweight machinery before measured need; nothing in P0 requires what Babylon adds. Would need same-scene evidence to justify switching. | Rejected for P0 |
| PlayCanvas | Engine + editor-centric; entity-component model duplicates structure the contract already assigns to the simulation/renderer boundary. No P0 requirement needs it. | Rejected for P0 |
| Raw WebGL2 | Zero dependency, but re-implements glTF parsing, camera math, controls, picking — cost and correctness risk with no measured benefit at this scene size (11 draw calls / 98 triangles). | Rejected |

A different engine later requires evidence against the same scene (technical contract), not a prolonged engine debate.

## 4. Ruling on the 0.160.0 scale fixture: ALIGN (re-pin + re-bench), tracked task

**Decision: align `prototypes/rw3d-scale-fixture/` to `0.187.0` and re-run its capture + numeric checks. Do not quarantine.**

Justification:

1. **The fixture is a living V06 conformance tool, not a one-off artifact.** Later kit-authoring issues (#136 T09 buildings, #142 T15 rigs, #164 T37 defense kit) must re-run kit validation and the scale fixture as assets are added or fixed (e.g. the production `wall_gate` ≥0.15 u margin fix). Quarantining it at 0.160.0 would orphan the tool and force a duplicate fixture at the production pin — more work, two sources of truth.
2. **One project pin means one rendering truth.** V06 claims about bounds/sockets/clearance are geometry-level and version-stable, but the fixture's pixel checks (silhouette bounds ±2 px, scale anchors, pixels-per-unit) are renderer-dependent. Keeping a second three.js version alive invites silent divergence between what the fixture certifies and what the game renders.
3. **Alignment cost is bounded and honest.** One re-pin + one capture re-run (103 numeric checks) on the same headless setup. three.js lighting/BRDF behavior can shift pixel outcomes across versions (T03 disclosed the irradiance/PI calibration); the follow-up must re-run with unchanged tolerances, disclose any check that fails at 0.187.0 as a real finding, and re-pin expectations only with documented rationale — never relax thresholds to force green (same discipline as T03's disclosed calibration failure).
4. **No accepted claim is invalidated meanwhile.** V06 was accepted (scoped) at `cfed0c1d` / merged `4acf7ef` as blockout geometry characterization with visual acceptance expressly withheld (ruling g). The 0.160.0 fixture remains valid evidence of what was measured at that SHA until the alignment lands; this ADR does not retroactively change it.

**Follow-up task for the coordinator to file** (developer does not dispatch):

> **[RW3D][P1] Align rw3d-scale-fixture to three 0.187.0 and re-run V06 capture (T05/ADR-0001 follow-up)** — re-pin `prototypes/rw3d-scale-fixture/package.json` + lockfile to `three 0.187.0` (exact), re-run `node capture.mjs` with unchanged tolerances, record expected/actual + exit codes and any pixel-expectation re-pin rationale as evidence; blocked-by #132 acceptance; schedule before #142 T15 rig authoring re-runs the fixture. Write paths: `prototypes/rw3d-scale-fixture/**`, `docs/evidence/*t05a*` (or coordinator-assigned equivalent).

Until that task merges, the fixture is **provisionally aligned-pending**: it may be re-run for geometry checks, but any new pixel-level V06 claim must state which three.js version produced it.

## 5. Consequences

- Positive: single measured pin; reproducible evidence pipeline already in repo; large payload headroom (166.4 kB gzip today); kit tooling stays usable for production authoring.
- Negative: three.js releases frequently — exact pin + lockfile + re-benchmark discipline is mandatory overhead; addon API drift possible across minors; one bounded re-capture owed (follow-up above).
- Not decided here: final art parity, LOD authoring, reference phone (owed via [#190](https://github.com/darkmatter2222/Rustwake/issues/190)), P1 population targets (owner #151).

## 6. Citations

- Product merge condition on PR #187: comment **6871124473** ("Version policy #132 must settle: one exact project pin, expected 0.187.0 ... PR #188's scale fixture pins 0.160.0; #132 aligns it (re-pin + re-bench) or explicitly quarantines it as legacy characterization with a tracked task. No floating ranges; any bump needs issue + re-benchmark per ADR.").
- T03 ADR: [2026-11-14-rw3d-t03-renderer-adr.md](../../evidence/2026-11-14-rw3d-t03-renderer-adr.md), merged `262829e63fec570f732677d4bf24c634cf8d3ede`.
- T04 product rulings (f: alignment -> #132; g: visual inspection pending): comment **6871139430** on PR #188, merged `4acf7efb4c615e59087402ed6ed9ee1c19d698f5`.
- T02 boundary inventory: [2026-11-14-rw3d-t02-simulation-audit.md](../../evidence/2026-11-14-rw3d-t02-simulation-audit.md), merged `1b83c58bd103a1a4a0f4529e820a7e4409685def`.