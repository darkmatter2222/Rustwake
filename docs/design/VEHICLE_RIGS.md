# ART-05 vehicle rigs — trucks, forklift, drone, workers (#351)

Status: ART-05 rigs shipped on `rw/v2-art-05-vehicle-rigs` (capture head `1f571918ab8fdeb76cdafe97079acbdf7b58f212`); yard life (#590, PR #593) merged to main at `f7f32911f689824c150dd1a47375fbce5e6bc158` — the crew now WALKS, the forklift DRIVES and the drone flies CONTINUOUSLY. This doc describes that merged state; the crowd motion model is specified in `docs/design/YARD_LIFE.md` and cross-referenced here, not duplicated.
Numeric validation only (`PASS_NUMERIC_ONLY`); not art acceptance. Sponsor G1 visual review (#276) is open and the sponsor has REJECTED the current build; the collision-avoidance follow-up (#589) is in flight.
Builds on ART-01 geometry schema (#347, `src/voxelSchema.js`) and LOG-04 freight ledgers (#384, `src/simulation.js`).

## Provenance

All rig geometry is original, authored in code in `src/world.js` (shared unit `BoxGeometry` + 8-segment cylinders, shared `mats` pool, flat shading). No external or downloaded models; the `public/assets/blockouts/*.gltf` entries in `asset-manifest.json` remain reference-only per `import_policy`. Approved style/scale reference: `public/reference/approved-yard.png`, `docs/design/tokens.json`, canonical worker height 1.7 and truck envelope 2.05 × 1.2 × 1.35 (length × width × height, world units; cell = 3.5).

## Authority split (honesty contract)

| Rig | Authority | Decorative? | What it may show |
|---|---|---|---|
| Truck (3 haulers) | `simulation.js` freight ledger (reserve → pickup → arrive) | No | Cargo crates ONLY while `v.cargo` is onboard (`toDest`); crate count `max(1, min(3, ceil(amount/5)))`, tinted `RESOURCE_BY_ID` color. Empty tray shows nothing. |
| Forklift | none — decorative yard crew (#274) | Yes | Drives a decorative bay-apron shuttle (post → one cell west at 0.9 u/s, yields to trucks and crew; parks at `FORKLIFT_POST` when the shuttle is blocked). Fork lift height remains a pure function of the nearest real truck's world distance to the depot bay post. Never carries a load mesh (forks = exactly 3 meshes). |
| Drone | none — decorative yard crew (#274) | Yes | Flies CONTINUOUSLY (velocity-limited follow, no teleport) to the roof of the building whose real cycle timer advanced frame-over-frame (`activeCycleAnchor`); parks on `DRONE_PAD` when no cycle is active. Cruises at y ≥ 9.0 while in transit. |
| Workers (10) | none — decorative yard crew (#274) | Yes | Walking patrols on six seeded maintenance-alley segments; limb swing is a pure function of travelled distance (frozen at dt=0 and under reduced motion). Same canonical 1.7-unit rig with added hip pivots — no longer static scale references. |

Decorative rigs carry `userData.decorative=true` and the exact authority string `"none — decorative yard crew (#274)"` (enforced by `validateRig` in `src/voxelSchema.js`). They report no freight, production or crew capacity, occupy no build sites (forklift post sits inside the depot bay cell (13,10), which `checkSite` already rejects for machines), and are excluded from picking (`pick:volume` only on machines/trucks). No new vehicle types, no save/cost/output changes; `src/simulation.js` and `src/gridOccupancy.js` untouched. Moving is not authority: the #590 crowd sim (`src/crowd.js`) is pure data — no THREE, no timers, no DOM — and the economy never reads it (byte-identical economy output with the crowd present vs absent, `tests/yardLife.test.mjs` honesty gate; see `docs/design/YARD_LIFE.md`).

## Truck identities (deterministic, keyed off real vehicle id)

`truckIdentity(v)`: index `((v.id % 3) + 3) % 3` into `RIGS.truck.identities`. This preserves the original per-id liveries exactly:

| id % 3 | Variant | Livery (material key) | Wheels | Signature parts |
|---|---|---|---|---|
| 1 | AMBER STAKE-BED | `orange` | 4 (front steerable) | stake rails, exhaust stack, roof light bar + rotating beacon |
| 2 | TEAL TIPPER | `body` | 6 (dual rear axles) | tipper walls, hydraulic ram |
| 0 | RUST FLATBED | `rust` | 4 (front steerable) | headboard slats, round headlamps |

All variants share chassis/cab/glass/bumper/tray/tail lamps and the exact envelope x ±0.6, y −0.05…1.30, z −0.95…1.10 (1.2 × 1.35 × 2.05). Named pivots: `wheel:steer:*` (steer group) → `wheel:spin:*` (spin group), `pivot:beacon`, `cargo` group.

## Motion (pure functions, shared by runtime and tests)

- `wheelSpin(distance) = distance / TRUCK_WHEEL_RADIUS` (0.3). Distance integrates real sim movement: `hypot(v.x − lastX, v.z − lastZ) * CELL` per frame — no free-running decorative spin.
- `steerTarget(prevHeading, heading)`: wrap-aware route-heading delta clamped ±0.45 rad; decays `*= max(0, 1 − dt*2.5)` when heading is steady.
- `suspensionBob(speed, time, id)`: `sin(time*9 + id) * 0.012 * min(1, speed/2.2)` when speed > 1e-4, else exactly 0. Applied to the `lod:detail` group only (root y stays 0.22).
- Beacon rotation = distance × 2 (stake variant).
- `syncTruckCargo(truck, v)`: rebuilds crates only on cargo-signature transition (`resource:amount`), idempotent otherwise; hidden at LOD tier 2.
- `forkliftLift(distance, reduced)`: reduced → 0; ≤2 → 0.75; ≥6 → 0; else linear `0.75*(6−distance)/4` (unchanged by #590). Post: `FORKLIFT_POST` x 4.05, z −5.05, rotY 0, bay cell (13,10) from the starter depot (13,9) rot 0. NEW in #590: the forklift also DRIVES — `stepCrowd` shuttles it post → one cell west along the bay apron at 0.9 u/s, yielding to trucks and walkers, and parks it at the post when the shuttle corridor is blocked (`src/crowd.js`, `src/world.js` update loop; model in `docs/design/YARD_LIFE.md`).
- `droneHover(simTime, reduced)`: reduced → `{bob:0, rotor:0, reduced:true}`; else bob `sin(t*1.3)*0.18`, rotor `t*22`. The pure function is retained and unit-tested, but the runtime no longer calls it: `stepCrowd` produces the same bob/rotor on the crowd sim clock and flies the drone CONTINUOUSLY — speed `min(6.5, distance×2.2)`, cruise altitude `max(9.0, target.y+1.2)` blended in over horizontal distance, every step (including the arrival commit) capped at 0.5 u. Anchor roof target = building `bounds.height + 1.4`; hover bob applies only while hovering at an anchor. Pad `{x:−47.5, y:5.9, z:−23}` (exterior service-shed roof; the −30 pad in the pre-#590 doc predates the ART-07 shed move).
- #590 crowd motion (`src/crowd.js`, pure seeded data; full model and measured clearance in `docs/design/YARD_LIFE.md`): 10 walkers ping-pong six maintenance-alley segments at 1.15 u/s ±8% per-seed jitter; `workerPose(dist)` swings legs ±0.5 rad and arms ±0.4 rad at 7.5 rad per world unit travelled, arms opposite phase to legs, frozen when distance is constant. Clearance is enforced every step against the live truck envelope (radius 1.2), the forklift (0.75) and other walkers (0.5) with margin 0.12; lower-index right-of-way at crossings. Declared per-step bounds at the App dt clamp ≤0.07 s: walker 0.09, forklift 0.07, drone 0.5.

## Reduced motion

`prefers-reduced-motion: reduce` (matchMedia + change listener) parks wheel angle, steer, bob, beacon, fork lift and drone rotors at constant poses; distance still accrues and truck positions still follow the sim (economic timing untouched). Observable stamps stay constant: `truck1Wheel=0.000`, `forkliftLift=0.000`, `rigReducedMotion=1`. #590 addition: `stepCrowd` returns early at dt≤0 or reduced motion — walkers and the forklift hold position (limbs frozen because travelled distance is constant), and the drone holds position with rotor/bob zeroed (from a fresh start it stays parked on the pad). Stamp `crewReducedMotion=1`.

## LOD

`rigLodTier(zoom, viewportHeight)` from projected cell px `= CELL * h * zoom / 80`: tier 0 (detail + greeble) ≥ 26 px, tier 1 (detail, no greeble) ≥ 12 px, tier 2 (single-box proxy in the rig's livery, cargo culled) below. Every rig is a `rigShell` with named groups `lod:detail`, `lod:greeble`, `lod:proxy`; `applyRigLod` toggles visibility only (no rebuilds). Desktop 900 px: tier1 at zoom 0.5 (19.69 px), tier2 at 0.2 (7.875 px). Phone 844 px: tier1 at 0.35 (12.92 px), tier2 at 0.2 (7.385 px).

## Budgets and measured cost (re-measured headlessly at `f7f32911`; guarded by `tests/yardLife.test.mjs`)

| Rig | Meshes (loaded, tier 0) | Triangles | Budget meshes/tris | Envelope L×W×H |
|---|---|---|---|---|
| Truck stake (id 1) | 27 | 424 | 40 / 700 | 2.05 × 1.2 × 1.35 |
| Truck tipper (id 2) | 30 | 500 | 40 / 700 | 2.05 × 1.2 × 1.35 |
| Truck flatbed (id 3) | 24 | 408 | 40 / 700 | 2.05 × 1.2 × 1.35 |
| Truck empty | 24 | 388 | 40 / 700 | same |
| Forklift | 20 | 320 | 28 / 450 | 1.3 × 0.8 × 1.1 |
| Drone | 19 | 308 | 22 / 400 | 1.0 × 1.0 × 0.3 |
| Worker | 11 | 132 | 16 / 250 | 0.34 × 0.62 × 1.7 |

Per-rig counts are unchanged by #590 (the worker rig is count-identical to the ART-05 base — pivot GROUPS add no geometry). Scene-level delta: makeTerrain now places 10 patrol walkers instead of 3 static scale references ⇒ +77 meshes / +924 triangles (7 × 11 / 7 × 132). No budget was raised.

Scale ratios vs the 1.7-unit worker: truck height 1.35 (0.79×), forklift 1.1 (0.65×), drone 0.3 (0.18×). All rig lengths ≤ CELL (3.5); trucks fit one cell footprint. Materials only from the legal `MATERIALS` pool; cargo tints only from `RESOURCE_BY_ID`.

## Observability stamps (additive; camera stamps untouched)

`rigLod`, `rigReducedMotion`, `truck1Dist`, `truck1Wheel`, `truck1Cargo` (lead truck = id 1 or first), `forkliftLift`, `droneAnchor` — plus existing `freightLoaded`/`freightOnboard`. #590 adds yard-life stamps: `crewWalkers` (visible walker count), `crew1Dist`, `crew1X`, `crew1Z` (lead visible walker), `forkliftDist`, `forkliftX`, `droneX`, `droneY`, `droneZ`, `droneMode` (`parked`/`flying`/`hovering`), `crewReducedMotion`. Camera invariants (#307) preserved byte-identical: `applyCamera` sha256-16 `f3afa5479a66b97e`, `stampCamera` `691b3c0a3480e97b` (hash-guarded in tests and capture script).

## Evidence

- `tests/vehicleRigs.test.mjs` — 16 tests: identity determinism, envelopes, scale coherence, wheel/steer/bob math against 400 real `advanceGame` ticks, full cargo lifecycle with per-tick conservation, negative cases (empty truck no crate; decorative rigs never report freight; reduced motion constant stamps), LOD thresholds/visibility/proxy livery, budgets/materials, forklift bay occupancy + `checkSite` rejection, drone anchor pure + real-sim cases, picking/footprint, camera hash guard.
- #590 yard life: `tests/crowd.test.mjs` — 11 tests; `tests/yardLife.test.mjs` — 8 tests (incl. the economy byte-identity honesty gate and the base-drone anti-teleport negative control). Full map and measured clearance/step tables in `docs/design/YARD_LIFE.md`.
- Full-suite totals are measured by main CI, not pinned here: at base `f7f32911f689824c150dd1a47375fbce5e6bc158`, CI run 44433180170 reports **615 tests / 615 pass / 0 fail across 46 test files**, plus 1/1/0 for `scripts/package-dashboard.test.mjs`. (The former "184/184; baseline 168" line was stale by hundreds of tests.)
- `scripts/capture-rigs.mjs` → `docs/evidence/351-art-05/` — ART-05-era capture (predates #590; the walking/driving/flying evidence is in `docs/design/YARD_LIFE.md`), production-preview desktop 1440×900 + phone 390×844: 20 PNGs, `report.json` (`PASS_NUMERIC_ONLY`, `source_sha 1f571918ab8fdeb76cdafe97079acbdf7b58f212`), `nonblank.json` (full-frame decode: min 9954 unique colors, min luminance stddev 29.567). Wheel tracking max err 0.002 rad over 197 samples / 198.207 world units; cargo cycle none → iron:10 → none; parked reduced-motion constants with sim still running; LOD tier stamps at computed zooms; depot selection intact; one WebGL context; zero page errors.

## Remaining debt

Sponsor G1 visual acceptance (#276) on the deployed build — the sponsor has REJECTED the current build, so this is owed, not pending rubber-stamp; collision-avoidance follow-up (#589) is in flight. Physical handset (#268/#275); hosted-browser receipt at deployment (#333). Worker arm/leg animation shipped in #590/#593 (distance-driven `workerPose`); any real crew GAMEPLAY remains #274 — decorative animation is not a completed mechanic, and the crew still has zero economy authority.
