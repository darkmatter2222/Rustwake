# RW3D integration architecture (T05, issue #132)

- Role: developer (architecture proposal; NOT an acceptance verdict). Independent QA + product decision on the immutable PR head is required; release engineer merges.
- Issue: [#132](https://github.com/darkmatter2222/Rustwake/issues/132) — P0 integration gate. Parent #122, master #121, Project 2.
- Base: main at `1b83c58bd103a1a4a0f4529e820a7e4409685def` (PR #189 merge).
- Companion documents: [ADR-0001 renderer](adr-0001-renderer.md) · [P0 gate evidence](p0-gate-evidence.md) · [T05 evidence receipt](../../evidence/2026-11-14-rw3d-t05-architecture.md).

## Accepted inputs (merged SHAs, not proposals)

| Input | Merged SHA | PR | Verdicts |
|---|---|---|---|
| T01 runtime commissioning (R02) | `8b78d09f6a1227916fede780eb1682969c49ff1e` | #186 | reviewer 6870458592, product 6870438134 |
| T02 simulation audit + legacy fixtures (E01/E08) | `1b83c58bd103a1a4a0f4529e820a7e4409685def` | #189 | reviewer ACCEPT 6871145575, product ACCEPT 6871192050 |
| T03 renderer spike + ADR + benchmark (V03/P01/P03) | `262829e63fec570f732677d4bf24c634cf8d3ede` | #187 | reviewer ACCEPT 6871074468, product ACCEPT 6871124473 (merge conditions) |
| T04 kit validation + scale fixture (V06) | `4acf7efb4c615e59087402ed6ed9ee1c19d698f5` | #188 | reviewer ACCEPT 6871049307, product ACCEPT (scoped) 6871139430, rulings a–g |

Primary sources: [T02 audit](../../evidence/2026-11-14-rw3d-t02-simulation-audit.md), [T03 evidence](../../evidence/2026-11-14-rw3d-t03-evidence.md) + [T03 ADR](../../evidence/2026-11-14-rw3d-t03-renderer-adr.md), [T04 kit validation](../../evidence/2026-11-14-rw3d-t04-kit-validation.md), [T01 receipt](../../evidence/2026-11-13-rw3d-t01-runtime-commissioning.md). Contracts: [TECHNICAL_CONTRACT](../TECHNICAL_CONTRACT.md), [EXECUTIVE_CONTRACT](../EXECUTIVE_CONTRACT.md), [ACCEPTANCE](../ACCEPTANCE.md).

## 1. Renderer / state boundary

Decision: keep the T02-audited simulation core as the single authority and put three.js behind a renderer module that only reads immutable snapshots. This adopts T03 ADR integration implication 1 and the technical contract's module split.

```
React UI ──named command {commandId, expectedRevision?, payload}──▶ app store (single writer via lease)
   ▲                                                                 │
   │ HUD/inspector read snapshots                                    ▼
   │                                          applyCommand: validate → reserve → commit, all-or-nothing
   │                                          (13 commands; idempotent by command.id via seenCommands;
   │                                           revision increments only on success)
   │                                                                 ▼
   │                                          SimState: integer/fixed-point, no DOM/WebGL/wall-clock in tick
   │                                            │                       │
   │                                            │ checkpoint ≤1 s       │ absence ≥ 20000 ticks
   │                                            ▼                       ▼
   │                                     save envelope            catch-up worker (protocol 1,
   │                                     (schema+content version,  2 s timeout → identical inline
   │                                      FNV-1a checksum)         fallback; cancel() invalidates)
   │                                                                 │
   └────────── immutable snapshot + getFramePhase() ────────────────┘
                                       ▼
                    renderer module: three.js scene graph, camera, visual time,
                    interpolation only. No economy logic, no state writes.
                    Simulation and UI never import THREE objects.
```

Boundary rules (from the T02 inventory at `1b83c58`):

1. **Simulation core retained unchanged**: `engine.ts` (`advance`/`advanceTo`, fixed phase order, event-jump ≡ tick-by-tick), `commands.ts` (13 named commands mapping onto the contract's building/route/contract/research/fleet families), `types.ts` (`SCHEMA_VERSION 1`, `CONTENT_VERSION 1`, integer state, exact milli-ticks), `invariants.ts`, `offline.ts` (12 h cap, rollback → 0), content/economy tables, quantity math.
2. **Store loop retained**: two clocks (epoch `now` for absence/lease; monotonic `frameClock` for interpolation), `PERSIST_MS 1000`, `RECONCILE_MS 100`, `MAX_TICKS_PER_FRAME 20` (accumulator clamp 40), typed command queue ≤32 replayed in order after worker-handoff snapshot adoption, atomic `importSave` whole-yard swap. `getFramePhase()` is the renderer's only interpolation input — the renderer never reads clocks.
3. **Replace, do not extend**: `src/game/renderer/{scene,camera,gestures,motion,sprites}.ts` (Canvas 2D) is replaced behind this boundary by the three.js module. Gesture correctness and economic coverage are retained; `gestures-50` retargets to the 3D view (T02 §6).
4. **3D plot mapping input**: 2D `machine.tile` integers + deterministic `manhattanRun` are the inputs a 3D plot mapping must consume (nonoverlapping plots, deterministic mapping, overflow retained, explicit conversion preview when exact mapping is unavailable — technical contract "Saves and migration").
5. **Renderer responsibilities** (T03 ADR): camera + visual time, quality tiers (spike baseline `blockout-flat`: no shadows, DPR cap 2, ambient-dominant fill calibrated 1.0 → 1.6 so palette tokens read near authored sRGB), context-loss message with unchanged save, hidden-tab render pause while simulation catches up, reduced-motion discrete stages. Deterministic bench/capture mode (fixed dt, scripted timeline, `window.__RW3D__` API) is the evidence pattern for all future V03/P01 runs.

## 2. Conservation baseline (E01) — retained, not renegotiated

The T02 legacy characterization at `1b83c58` is the conservation baseline for the whole rebuild:

- `tests/legacy/**` (22 tests: fixtures 10, conservation 3, migration 9) plus 11 checked-in fixtures + `manifest.json` + `artifacts.json`, all produced by the real command/engine/save path; regeneration is byte-identical (verified, T02 §3–4).
- Conserved quantity `unitTotal − netRecipeUnits − fleetAccumulated` holds across pure advance for all 5 save fixtures at steps [1, 9, 90, 400, 1500]; every quantity a safe nonnegative integer; per-command deltas exactly table-derived (sell/build/connect/upgrade/remove/dismantle/research/drone.add/manual.salvage); command-id retry is a byte-identical no-op.
- **The checked-in bytes are a contract**: any engine/content/save change that alters these envelopes fails `tests/legacy`. The voxel rebuild must keep `decodeSave` + `migrate` accepting them unchanged. New 3D fields are additive through the existing optional-field seam (`run`/`branch` precedent); untouched v1 saves stay byte fixed points.
- Full suite baseline: 63 files / 768 tests green at `1b83c58` (independently reproduced by reviewer 6871145575).

## 3. Content-table architecture seed (contentVersion branching, gap G4 → #148)

Today `CONTENT_VERSION = 1` is stored in every sim but never branched on (T02 gap G4). Seed design for the 3D content tables, to be implemented in [#148](https://github.com/darkmatter2222/Rustwake/issues/148) (T21) per product ruling on PR #189 (6871192050):

1. **Versioned table sets**: content tables (`content/defs.ts`: 15 resources, 8 blueprints, 12 recipes, `TICK_MS 100`, `TUNING`; `content/research.ts`: 3 nodes) become an immutable set keyed by `contentVersion`. A resolver selects the table set from the save's stored `contentVersion`; a running sim never mixes table versions mid-tick.
2. **Branch point in `migrate`**: `migrate` gains an explicit `contentVersion` branch (schema migration stays separate, per technical contract "Version schema and content separately"). A bump backfills/converts additively through the optional-field seam; it never renumbers entities, discards units, or invents pre-feature arithmetic. Idempotent, fixture-tested; untouched saves at the old version remain byte fixed points until an explicit conversion.
3. **Events carry content version** (technical contract command/event clause), so replays and offline settlement resolve against the same table set that produced them.
4. **3D additions are new table entries** (plots, sockets, rigs, clearance rules from §6), authored under a bumped `contentVersion` with a migration branch and new fixtures — not silent edits to v1 tables. `pnpm validate` remains the shared content+behaviour gate.
5. **Deadline**: G4 must be designed with the 3D content tables (this document is the design coordination point) and implemented before the first content-table version bump (P5). G2 (payload size cap) is in the same #148 scope; an oversized-rejection test is required before G1/P1.

## 4. Save / migration boundary and preconditions

Retained persistence (T02 §1): `SAVE_KEY rustwake.save.v1`, envelope `{schemaVersion, checksum, payload{sim,lastSeenMs,settings}}`, FNV-1a; decode order empty → parse → schema → checksum → `repairRegistration` → `validateSim` → `sanitizeSettings`; `LEASE_KEY rustwake.lease.v1`, TTL 1500 ms, one writer; interrupted writes recover the last complete checkpoint (≤~1 s loss, characterized by `bad-truncated`).

Gate-relevant gap rulings (product ACCEPT on PR #189, comment 6871192050):

| Gap | Ruling | Owner / precondition |
|---|---|---|
| **G1** corrupt boot silently falls back to a fresh yard (no legacy slot) | Conflicts with executive "never silently discard or reset". G0/P0 may pass with G1 **filed**; **G1/P1 must NOT pass until G1 is fixed and tested** | [#191](https://github.com/darkmatter2222/Rustwake/issues/191) (filed). **#191 must merge before the G1/P1 gate [#151](https://github.com/darkmatter2222/Rustwake/issues/151) and before [#148](https://github.com/darkmatter2222/Rustwake/issues/148) T21 migration ships** — the rollout migrates existing saves once P1 acceptance passes |
| **G2** no payload size cap before `JSON.parse` (E08 "oversized" unmet) | Assigned to #148 T21; oversized-rejection test required before G1/P1 | #148 developer |
| **G3** cooperative single-writer lease | Acceptable for single-device P0/P1 local multi-tab; revisit at P4 online authority (N01–06), server-owned writes replace it | coordinator, scheduled at P4 |
| **G4** `contentVersion` never branched on | Assigned to #148 T21, design coordinated with this document (§3); required before first content bump (P5) | #148 developer |

Migration rules for the 2D → 3D cutover (technical contract + T02 §5): preserve resource balances, research and machine levels; deterministic nonoverlapping plot mapping with overflow retained; explicit conversion preview and a playable legacy slot when exact mapping is unavailable; snapshot the old save before any replacement; idempotent migration tested against the checked-in fixtures. Still owed at the G1/P1 cutover: real-player export/import round-trip evidence, or an explicit no-corpus limitation recorded in gate evidence (product ruling 6871192050).

## 5. Instancing-first plan (P1 population, P02 memory loop)

T03 measured a single-asset blockout (11 draw calls, 98 triangles, 59.87 fps). P1 targets are 20 buildings / 30 moving units / 200 visible cargo representations; P2/P3 scale further. Plan before any scale-up (product merge condition 2 on PR #187, comment 6871124473):

1. **Shared meshes/materials from the kit**: reuse the kit's shared glTF materials/meshes (T03 ADR implication 2). One geometry/material per kit part archetype.
2. **Instanced buildings**: `InstancedMesh` per building archetype (per kit part where transforms differ), instance transforms driven by plot placement + orientation from the world grid (#133). Construction stages swap instance visibility/animation, not unique meshes.
3. **Aggregate cargo, never per-unit objects**: cargo visualization truthfully represents aggregate quantities (contract). One representation per machine buffer / route load / pile, scaled or staged by integer quantity — not 200 unique crate objects for 200 units. Moving units (30 at P1) are individual entities with shared geometry; cargo on them is an aggregate child.
4. **Bounded pools**: particle/debris lifetimes and pools bounded (contract); no per-crate rigid-body physics in the authoritative economy.
5. **Quality tiers and culling**: `blockout-flat` baseline → soft-shadow tier later per ART_AND_MOTION; capped DPR, LOD and culling as population grows; simplified contact shadows at low quality.
6. **P02 measurement loop**: three warmed identical 10-minute loops on the declared device; heap growth ≤10%, bounded `renderer.info` geometry/texture/object counts; hidden-tab render pause with correct simulation catch-up; WebGL context-loss recovery with unchanged save. Harness: the spike's deterministic bench pattern (fixed dt, scripted timeline, `window.__RW3D__`), extended to the MATURE release fixture (20/30/200).
7. **Budget discipline**: P1 normal desktop p95 frame ≤16.7 ms, target phone p95 ≤33.3 ms (phone only after #190 names a real reference device); first playable ≤8 MB compressed, cold interaction ≤5 s @20 Mbps/50 ms, input-to-feedback p95 ≤100 ms. Do not lift failing budgets without documenting scene and tradeoff.

## 6. Kit occupancy rules (product rulings a–g, comment 6871139430 on PR #188)

Binding for world-grid occupancy (#133 T06), placement controls (#138 T11) and rig authoring (#142 T15, #164 T37):

| Rule | Decision |
|---|---|
| Crane swing (r = 2.508 u, diameter 5.016) | **Clearance/spacing, NOT occupancy.** Occupancy = the 3×3 footprint. Keep-out implementation → #133 T06 + #138 T11; radius reconfirm vs crane rig → #142 T15 |
| `wall_gate` vertical margin | **Effective rest-pose margin = 0.05 u at blockout** (1.35 clear − 1.25 truck − 0.05 truck float), not the nominal 0.10 u. Blockout accepted; **≥0.15 u effective vertical margin required at production**. Kit fix → #164 T37 (gate) + #142 T15 (truck) |
| Inferred overhangs | Accepted for blockout: forklift forks +0.45 (+Z), turret barrel reach 1.605 > footprint half-extent 1.0, truck wheels widen 1.0 → 1.18 (≤ lane 1.25), drone rotor span airborne over 1×1 landing footprint. No `kit.json` edit now; production confirm → #142 T15 / #164 T37 |
| Depot door pivot / forklift wheels | Sample-coverage gaps, not T04 failures. Depot → #136 T09; forklift wheels → #142 T15 |
| 27 `additionalRequired` assets | Backlog scope → later authoring (T09/T12/T15/T25–T30/T37); V06 currently covers the 12 delivered blockout recipes only |
| three 0.160.0 in scale fixture | Not a T04 defect; alignment decided in [ADR-0001](adr-0001-renderer.md) |
| Capable visual inspection | **PENDING — explicit open gate.** Visual fidelity NOT accepted; blocks visual acceptance and G1. Owner: vision-capable reviewer (coordinator assigns) |

Clearance checks use ACTUAL authored geometry (required width = max(nominal, actual) + 2×0.15), so gates remain safe with the as-authored truck; four yaw rotations (0/90/180/270) are hard-checked for occupancy cell sets, socket permutation and frontage.

## 7. Renderer pin and obsolete art constraints

- three.js exact pin policy and the 0.160.0 fixture ruling: [ADR-0001](adr-0001-renderer.md).
- Retirement of pixel-exact / old-byte art assumptions (six Canvas 2D test files, 233000 B ceiling) with the retained-test list: [TECHNICAL_CONTRACT §Retain and replace deliberately](../TECHNICAL_CONTRACT.md) as amended by this issue, enumerated from T02 audit §6. `tests/legacy/**` from #129 stays.

## 8. Open gates carried forward (honest gaps)

1. Capable visual inspection PENDING (non-vision agents cannot self-certify visual fidelity); owed at art acceptance, **mandatory at G1 #151**.
2. Real-phone evidence owed via [#190](https://github.com/darkmatter2222/Rustwake/issues/190) (re-homed from #130 per product merge condition on PR #187). Desktop emulation is NOT phone evidence.
3. G1 fix [#191](https://github.com/darkmatter2222/Rustwake/issues/191) must merge before G1/P1 (#151) and before #148 T21 migration.
4. Scale-fixture three.js alignment follow-up (ADR-0001 §5) — coordinator to file.
5. P1 population / P02 memory loop unmeasured (owner #151); full V03 resize coverage owed at #151.

Integrated G0 evidence and the gate checklist: [p0-gate-evidence.md](p0-gate-evidence.md).