# Rustwake V2 factual implementation and gap ledger

This is an **evidence inventory**, not a parallel status board. GitHub master #253, epics #254–259, scoped #260–305 and new defects are authoritative. Every release updates this table with exact main SHA and supported tests/screenshots. Do not turn a placeholder currency or prototype into a completed feature merely because code exists.

| Capability | V2 foundation 258fce59 | Gap and issue |
|---|---|---|
| Real 3D isometric industrial terrain | Foundation shipped | Art parity/LOD/scale #262, #270, G1 #276 |
| Camera orbit/drag/zoom | Cursor grip fixed and merged via #307 (main 006b5e8); CAM-01 #337 regression matrix: 6480-case math pan matrix + 1008 wheel ticks + golden snapshots ≤1.32e-13 px, production browser gestures (6 quadrant poses, 13 drags, 6 wheels) max 1.005e-13 px, raycast cross-check SITE 13.9 at yaw225, exact negative controls 25.003235/380.160000 px; docs/qa/CAMERA_MATRIX.md | Remaining: height-aware mesh picking, world-edge (±90 clamp) communication, physical-handset touch verification #268/#275, G1 visual #276 |
| Phone and desktop game HUD | Foundation | Full UX/physical handset #268, #275, #276 |
| Voxel machine and animated crane | Procedural kit + canonical geometry schema (PR for #347, branch rw/v2-art-01-voxel-schema; immutable head in PR evidence): 12/12 machines validated vs 24×24 parcel / 3.5-unit cells, named pivots/ports, full-cell pick bounds, worker 1.7 / truck 2.05×1.2×1.35 scale references, desktop+phone captures incl. invalid-placement negative state (docs/evidence/347-art-01/) | Art parity/LOD #262, #270; crew/production-status animation #274; sponsor G1 #276. Schema is numeric validation, not art acceptance |
| Voxel geometry/material/pivot schema | src/voxelSchema.js rustwake.voxel.geometry.v1 + docs/design/VOXEL_GEOMETRY.md + asset-manifest geometry_schema block (PR for #347, pending merge; head SHA recorded in PR) | Contributes to open umbrella #262; phone 44px pick floor needs zoom ≥1.192 at 844px (published minZoomForPick); no WebGL-unavailable guard yet (#268) |
| Placeable buildings | Explicit occupancy shipped: deterministic footprints/rotation, survey ring, tier parcels, terrain/slope, bay clearance, exact reasons, cancel full refund, conserved ledger (#370; tests/gridOccupancy.test.mjs + save fixture + desktop capture construction proof) | Move/dismantle UX and staged reload remain #269, #273 |
| Roads and pathfinding | Frontage rule enforced (bay within 3 road cells); roads refuse every machine footprint cell (#370) | Intersections and recoverability remain #271 |
| Freight/cargo | Early transport | Multi-carrier conservation, bay contention/reload #272 |
| Research/currencies | 17 registry entries, some scaffolding | Sources/sinks, pricing and long-game #277, #281 |
| Power/fuel/water | Partly defined | Real priorities/brownout/consumption #278 |
| Vehicle manufacturing/repair | Missing | #280 |
| Exact multi-day offline | Missing | #283 |
| Region expansion/outposts | Missing | #282 |
| PvE and expeditions | Planned | #286–291 |
| Server authority/trade/co-op/raids | Planned, not implemented | #292–299 |
| Prestige/factions/seasonal longevity | Mostly design | #300–305 |
| Native V2 GitHub Projects board | Unverified | #265, requires project-scoped GitHub auth |
| Qwen/OpenCode host adoption of V2 agents | Definition files, runtime adoption unverified | #263, actual session/lease evidence required |
| Production V2 source promotion | CI and adapter receipt succeeded | #264, independent public manifest and end-user browser evidence |
| Automated post-promote live manifest/checksum proof | Implemented on rw/v2-ops-08-live-release-proof: delivery `verify-live` job + `scripts/verify-live-release.mjs`; 13 offline tests incl. negative cases green; real public-HTTPS PASS receipt at main 94e74083 (rollback 006b5e8d, CI run 43996906181, delivery run 43996966371) in docs/operations/receipts/ | #332: first automated Actions receipt owed on the NEXT deployment after merge; hosted-browser smoke delivered via #333 row below |
| One hosted-browser smoke per deployed SHA (retires PASS_NUMERIC_ONLY) | Implemented on rw/v2-ops-09-hosted-browser-smoke: additive delivery `hosted-browser` job (needs package+deploy+verify-live, unprivileged ubuntu-latest, one Chromium per SHA, sequential fresh desktop 1440x900 + phone 390x844 contexts) + `scripts/capture-live.mjs`; 13 offline tests incl. deliberate failed-smoke negative cases green (57 total); genuine local live-capture PASS at deployed main b363fd07 with desktop/phone screenshots, one WebGL context, synchronous zoom stamps, zero page errors (receipt + screenshots: docs/operations/receipts/333-hosted-browser-b363fd07-*); failed smoke fails the delivery run and leaves the release UNVERIFIED | #333: first automated Actions hosted-browser receipt owed on the NEXT deployment after merge; release receipt must cite hosted-browser PASS to retire PASS_NUMERIC_ONLY; physical handset #268/#275 and sponsor visual G1 #276 remain owed |
| Sponsor G1 visual acceptance | Not granted | #276 |

## Maintenance rules
Whenever implementation, design, release or role governance changes, update relevant row with source SHA, issue, observed state, evidence URL and remaining debt IN THE SAME PR. Never close a row from a screenshot of a prototype. The team must reconcile issue/Project state, not edit this file as an alternate Jira. Sponsor and release statuses are separate: deployed foundation does not mean completed game.
