# Technical contract

## Retain and replace deliberately

React/TypeScript remains UI. Preserve useful deterministic economy, command idempotency, resource invariants, content tables, save management and offline settlement. Replace Canvas 2D world presentation behind a renderer boundary with real WebGL 3D. Default candidate: Three.js with simple procedural/glTF assets; do a bounded P0 import/camera/performance spike and record the selected version after checking current official docs. A different engine requires evidence against the same scene, not a prolonged engine debate. Do not add a heavyweight full physics engine before a measured need.

Renderer dependency policy (settled by #132/T05): three.js is pinned exactly to `0.187.0` project-wide. No floating ranges (`^`, `~`, `*`, `latest`); every package that depends on three.js declares the exact version with a committed lockfile. Any version bump requires a tracked issue and a re-benchmark (cold-load, frame/input timings, deterministic capture on the declared device) before merge. Decision record and scale-fixture alignment ruling: [architecture ADR-0001](architecture/adr-0001-renderer.md); integration boundary and conservation baseline: [architecture README](architecture/README.md).

The existing renderer's exact pixel-count and paint-operation tests are historical characterization, not a mandate for the 3D renderer. Keep economic conservation, gesture correctness and migration coverage. New performance tests measure frame time, memory, draw calls and actual interaction under declared hardware. Do not merely lift failing budgets without documenting the scene and tradeoff.

Obsolete art assumptions retired by #132/T05 (enumerated from the T02 audit §6; retirement takes effect when the 3D renderer lands — the architecture issue itself deletes no tests):

| Retired pin | Where | Disposition |
|---|---|---|
| ART-003…007 silhouette distinctness, ink shares, contact shadows, paint-op counts, rasterized pixel rows; 233000 B entry-chunk ceiling | `tests/renderer/silhouette.test.ts` (37 its) | Retire with Canvas 2D art; byte ceiling re-declared against the ≤8 MB compressed first-playable budget, never silently lifted |
| drawScene paint-operation/pixel characterization | `tests/renderer/scene-draw.test.ts` (46 its) | Retire |
| World paint pinning (apron/palette/part tuples) + capture tooling | `tests/renderer/world-60.test.ts` (16 its), `world-60.evidence.mjs` | Retire |
| 2D belt extent line drawing | `tests/renderer/belt-extent.test.ts` (4 its) | Retire; belt economics stay in simulation tests |
| Drawn-leg parameter (DEF-004) | `tests/renderer/drone-leg.test.ts` (11 its) | Retire; stale-anchor behavior stays in `tests/simulation/fleet.test.ts` |
| 2D camera clamp/zoom math bound to WORLD_W/H | `tests/renderer/camera-50.test.ts` (18 its) | Retarget to the 3D camera contract |

Retained (explicitly not retired): `tests/legacy/**` from #129 (22 byte-pinned characterization tests — the conservation/migration baseline), all economic invariants (`tests/simulation/**`, `tests/persistence/**`, `tests/content/validate.test.ts`), `tests/renderer/gestures-50.test.ts` (retarget inputs to the 3D view, keep the contract), UI command/settings/save-flow tests (retarget with the UI), `tests/perf/bench.test.ts` (re-baseline with declared 3D scene/hardware). Historical art evidence (`docs/evidence/*art*`, art scripts, renderer PROVENANCE) stays preserved. A grep of `docs/vision/BACKLOG.md` found no pixel-exact/old-byte art constraints (it is the issue crosswalk); the executive contract's acceptance-hierarchy clause already requires this deliberate replacement with outcome-based checks.

## Modules and command contracts

Simulation: integer/fixed-point state and deterministic PRNG; no DOM, WebGL, wall-clock reads or unseeded randomness inside a tick. World: owned parcels, occupancy, road graph and sockets. Logistics: reservations/jobs/carriers. Economy: recipes, prices/currencies/contracts. Combat: seeded encounters, target selection, damage/loot ledger. Persistence: migrations/checkpoint/catch-up. Renderer: reads immutable snapshots and interpolates; owns camera/visual time. UI dispatches named commands with commandId, expected revision where needed and validated payload.

Retain 100ms economy tick as initial default. Visual interpolation runs independently. Durations use integer ticks, distances use fixed-point or quantized navigation lengths. Each transaction either validates/reserves/commits fully or changes nothing. Events include entity IDs, tick, event ID, cause and content version. Example commands: building.place/move/upgrade/dismantle; road.commit; route.policy.set; fleet.build/assign/upgrade/recall; research.start; contract.accept/deliver; expedition.dispatch/retreat; defense.policy.set. Server-authenticated trade/raid commands are separate from local debug/import commands.

## Navigation and physical presentation

Grid A* or equivalent deterministic routing over a versioned graph, stable tie breaks, cached paths invalidated by topology version. Roads declare lane and intersection occupancy; bay slots use leases/reservations with release on every terminal path. Vehicles follow splines/interpolated path segments visually but economic arrival is tick-based. Simple collision envelopes and scripted suspension/hoist/debris motion provide physical feel. No per-crate rigid-body physics in the authoritative economy. Particle/debris lifetime and pools are bounded.

## Saves and migration

Version schema and content separately. Before importing/migrating, validate bounded sizes, finite nonnegative integers, entity references, duplicate IDs, occupancy, cargo ownership and timestamps. Snapshot old save before any replacement. Existing 2D saves: preserve resource balances, research and machine levels; map machines to valid nonoverlapping 3D plots with deterministic mapping, retain overflow; if exact mapping unavailable keep legacy playable slot and offer explicit conversion preview. Never silently discard or reset. Migration must be idempotent and tested using checked-in old fixtures. Two tabs retain one writer; interrupted writes recover last complete checkpoint.

Offline: P1 cap 12h eligible production, stored timestamp advances across full absence. Economy and transport continue only within actual inputs, power, fuel and capacity. Event-jump optimization must equal tick-by-tick results for the same commands and eligible duration. No renderer required. Finite missions settle once when due; repeated jobs require explicit policy and cannot run in discarded cap time. Clock rollback yields zero extra production; large jumps are capped and reported. Online time is server-owned.

## Performance targets to validate, not claimed results

| Scenario | Entities | Target |
|---|---|---|
| P1 normal | 20 buildings, 30 moving units, 200 visible cargo representations | desktop p95 frame <=16.7ms; target phone p95 <=33.3ms |
| P2 stress | 100 buildings, 100 moving units, 1000 jobs (not all rendered individually) | responsive camera/input, bounded memory, no cargo loss |
| P3 battle | P2 scene + 100 enemies + pooled projectiles | quality fallback maintains phone target or documented lower population limit |

Declare actual tested device/OS/browser/resolution and quality tier; desktop emulation is not real handset evidence. P0 must select a named available reference phone before claiming handset pass. Initial delivery targets: first playable transferred payload <=8MB compressed excluding optional later content; cold interaction <=5s under a documented 20Mbps/50ms simulation; p95 input-to-feedback <=100ms; no accumulating memory growth >10% after three warmed identical 10-minute loops. Targets can be revised prospectively with measured rationale and product acceptance, not to conceal regression.

Use shared meshes/materials, instancing, LOD, capped device pixel ratio, shadow quality tiers and culling. Do not render every resource unit as a unique object. Cargo visualization must truthfully represent aggregate quantities. Pause/reduce rendering when hidden while simulation catches up correctly. Handle WebGL context loss with recoverable UI and unchanged save. No GPU support yields honest capability message plus save export, not corrupt progress.

## Online authority and operations

Before multiplayer: transactional persistent storage, authenticated ownership, command deduplication, rate limits, server time, fixed resolver/content version, scoped logs, backups and restoration drill. Do not accept client-reported balances/damage/rewards. Market escrow and raid settlements need atomic transactions and unique settlement keys. Network retries/reordering, two concurrent fills, disconnect mid-commit, server restart, stale snapshot and replay tampering are mandatory tests. Keep credentials outside repo. Establish staging before public deployment; online launch remains a separate release decision with real operational readiness.

## Rollout

Implement 3D in an isolated feature route/flag with compatible state adapters, then migrate once P1 acceptance passes. Preserve current production during development. Existing CI/CD remains authoritative; do not change server infrastructure for a design-only task. Feature branches -> independent review -> main CI -> verified served revision. A released screenshot must include source SHA in evidence metadata outside the normal player HUD.
