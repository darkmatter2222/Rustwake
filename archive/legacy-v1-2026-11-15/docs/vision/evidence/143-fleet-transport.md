# #143 — T16 fleet transport adapter: real cargo jobs drive carrier animation

- Issue: [#143](https://github.com/darkmatter2222/Rustwake/issues/143) (RW3D T16)
- Role: developer (non-vision)
- Branch: `rw/143`
- Implementation head at capture: `183ae7b706f39f1d9780e874c493fca97acfaff4`
- Base: `origin/main` `4cb479f715673e9082cd9628e62c5b0157a37bcc`
- Acceptance: **E05** (truck travel length, speed, load/unload and bay contention affect measured throughput; decorative vehicles alone fail) and **V04** (independently timed mechanisms and event-driven cargo; paused/starved/unpowered machines do not fake production).

## Scope of this change

Renderer-side, session-only, additive. Three implementation files (committed at
`183ae7b`):

- `src/game/renderer/fleet.ts` (new, 279 lines) — the pure derivation adapter.
- `src/game/renderer/three/scene.ts` (+47) — Canvas2D `drawFleet` mapping.
- `src/game/renderer/three/worldRenderer.ts` (+154) — three.js `updateFleet` mapping.

No store slice, no mutation, no command dispatch, no persisted-state change.
`src/app/store.ts`, `src/game/simulation/logistics.ts`,
`src/game/simulation/traffic.ts`, `src/game/content/defs.ts`,
`src/game/world/types.ts` were read-only. `App.tsx` and `src/ui/*` were not
touched (#145/#147 scope). three.js stays pinned `0.187.0` exact. The frozen
`tests/renderer/boundary-3d.test.ts` was not modified.

## Real-job binding (not decorative)

The adapter derives every visible unit strictly from the real simulation state:

- `fleet.ts:181` iterates `logistics.jobs`; `fleet.ts:183` iterates
  `logistics.carriers`; `fleet.ts:198` reads `traffic.trucks[carrier.id]`.
- `fleet.ts:226` `cargo: job ? job.inTransit : 0` — the cargo box is drawn from
  `job.inTransit` only; `fleet.ts:227` sets `cargoType` only when `inTransit > 0`.
- `fleet.ts:131` a carrier with no job returns `stage: "parked"` — no fake
  delivery loop.
- No `Math.random`, `Date.now`, `performance.now`, clock or storage in the
  adapter. Interpolation is backward-looking (slides from the previous tick's
  cell toward the authoritative current cell); `phase = 0` freezes completely.

Conservation (`amount = atSource + inTransit + delivered + returned`) and the
`logisticsFingerprint` / `trafficFingerprint` byte-identity are asserted every
tick in both test layers.

## Gates (real exit codes, run in `rw-143` at the final head)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| typecheck | `npm run typecheck` (`tsc --noEmit`) | 0 | clean |
| validate | `npm run validate` (`tsx scripts/validate-content.mjs`) | 0 | 15 resources / 8 blueprints / 12 recipes / 3 research; 0 violations |
| test | `npm test` (`vitest run`) | 0 | **90 files / 1232 tests passed** |
| build | `npm run build` (`tsc --noEmit && vite build`) | 0 | vite 5.4.11, 154 modules, built in 1.39s |

Baseline at `main` was 88 files / 1210 tests; this change adds 2 test files /
22 tests → 90 / 1232, exactly as expected. No `tests/perf/bench.test.ts:87`
flake occurred; the gate was not tuned. The build chunk-size (>500 kB) warning
is pre-existing and not a failure.

An initial typecheck pass flagged three unused bindings in the new test files
(`fleet-motion.test.ts:306`, `fleet.test.ts:36`, `fleet.test.ts:422`); these were
removed (the side-effecting `observe` call was kept) and typecheck re-run clean.

## Numeric motion tests (node vitest, seed 143)

`tests/renderer/fleet.test.ts` (15 tests) and
`tests/renderer/fleet-motion.test.ts` (7 tests) — **22 tests, all passing**
(included in the 1232 above; `vitest run` exit 0). They exercise the pure
adapter against the real #140 logistics + #141 traffic engine:

- Full lifecycle stage map tick-by-tick:
  `1:move-empty 2:load 3:load 4:load 5:move-loaded 6:depart 7:move-loaded
  8:align 9:unload 10:unload 11:unload 12:parked`.
- Every visible load bound to a real job (`cargo === job.inTransit`,
  `cargoType` match; `cargo === 0 ⇒ cargoType null`); conservation every tick.
- **E05 throughput**: longer corridor costs more ticks (5→6 vs 9→10, diff 4);
  speed 2 halves travel; L3U3 profile adds 6 ticks; bay cap 1 makespan 11 vs
  cap 2 makespan 8 (queue ticks [2,3,4], diff 3); junction cap 1 makespan 8 vs
  unlimited 6 (queue [4,5], diff 2). Decorative-only motion would not move these
  numbers.
- **V04 clip** (600 frames): independently timed carriers first load on
  different ticks (c1=4, c2=8); ≥6 load and ≥6 delivery events; 60 paused
  frames freeze cargo/delivery/progress; ≥1 starvation rejection
  (`insufficient-stock`); 540 engine ticks.
- Pause / held / queue freezes: phase sweeps never drift position, cargo or
  ledgers; wheels only finish the walked window, bounded `[w0, w1]`.

## Running-build capture (real WebGL, numerical checks only)

Harness mirrors the QA-accepted #137 (`rw3d-t10`) house pattern:
`tests/renderer/rw3d-t16/{harness.html,harness.mjs,capture.mjs}`. A vite dev
server (`:4318`) serves the harness, which drives the **real** `YardWorld` +
#140 logistics + #141 traffic through `publishFleetFrame`, with scripted
fixed-dt frames. `playwright-core` drives system Chrome; checks read
`world.fleetReport()` plus PNG pixel-diffs. Reproducible seed 143.

- Command: `node tests/renderer/rw3d-t16/capture.mjs` → **45/45 checks passed,
  exit 0**.
- Captured: `2026-11-14T16:35:22.273Z`, head `183ae7b7…`.
- Browser: `C:\Program Files\Google\Chrome\Application\chrome.exe`,
  renderer `ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 (0x00002B85) Direct3D11
  vs_5_0 ps_5_0, D3D11)`, `swiftshaderForced: false` (real GPU, no fallback).

Scenario coverage (all pass):

- **S0 empty-bridge parity**: bridge empty by default → 0 rigs; reset keeps the
  frame byte-identical (3342B); idle carriers park with zero cargo/motion;
  ledgers untouched.
- **S1 lifecycle**: real stage sequence; cargo box only while `inTransit > 0`;
  conservation total 100; lift rides real load/unload timers; all seven stages;
  job completes with 12 delivered.
- **S2 pause**: cargo/delivery/progress frozen; wheels bounded [1,2];
  fingerprints stable across the phase sweep.
- **S3 bay contention**: one loads while the other queues `bay-full`; queued
  carrier frozen; firstDone 8 / makespan 11; queue ticks [2,3,4]; free-bay
  control makespan 8 → contention costs exactly 3 ticks.
- **S4 held**: `road-removed` and `no-route` holds freeze with cargo intact;
  road repair recovers the job to complete (12 delivered).
- **S5 reduced motion**: discrete lift (=1) vs full-motion fraction (0.667);
  economy unchanged; reduced-motion pixels identical across phase and rest on
  the cell centre; full-motion pixels differ (3663B vs 3407B) and `pos.x`
  slides 1.63→2.37 over the walked cell.
- **S6 V04 clip** (60 frames): independent timers c1=4 / c2=8; 7 loads /
  5 deliveries; 10 paused frames freeze; starvation rejected
  (`insufficient-stock`); all lifecycle stages; starved/idle carriers park
  frozen. **Z**: no page errors.

### Evidence artifacts

- `docs/evidence/2026-11-14-rw3d-t16-motion.json` (45 checks + scenario samples)
- 15 PNGs: `…-s0-after-reset`, `…-s0-empty-bridge`, `…-s0-idle-parked`,
  `…-s1-load`, `…-s1-move-loaded`, `…-s1-unload`, `…-s2-paused`,
  `…-s3-queue-bay`, `…-s4-held`, `…-s5-full-a`, `…-s5-full-b`, `…-s5-rm-a`,
  `…-s5-rm-b`, `…-s6-clip-load`, `…-s6-clip-move` (all
  `docs/evidence/2026-11-14-rw3d-t16-*.png`).

## Session-only / additive confirmation

The fleet bridge is **empty by default**: with no `publishFleetFrame` call the
frame is the frozen `EMPTY_FRAME` and the rendered scene is pixel-identical to
the pre-change build (S0 reset parity, 3342B). There is **no persisted-state
change and no default-off fingerprint-parity change** — `logisticsFingerprint`
and `trafficFingerprint` are stable across every phase sweep and the motion
setting never alters the economy. The production store→publish feed is owed to
the **#148 cutover** (same precedent as the QA-accepted #137 assembly view); the
harness drives the bridge from the real engine to prove the derivation now.

## Limitations

- **Non-vision agent**: numerical stage / transform / pixel-diff checks only.
  **Capable visual inspection PENDING at G1 #151.** No claim of unverified
  visual fidelity is made.
- `YardWorld` requires a real WebGL context, so it is exercised in the browser
  harness; the pure adapter is additionally covered by the 22 node vitest tests.
- Top-down pinned camera (yaw 0 / elev 90): vertical lift projects to zero
  screen displacement, so pixel-diff motion evidence uses a horizontal travel
  window. Isometric art orientation is a shell/art decision for G1.
- Session-only/additive: production store→publish feed deferred to #148.

## Handoff

Draft PR linked to #143 (`Closes #143`, base `main`). Independent QA and product
verdict on the immutable head SHA, then release-engineer merge and main CI/CD
verification, per the delivery contract. No self-acceptance or merge.
