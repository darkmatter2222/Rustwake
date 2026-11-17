# Rustwake V2 factual implementation and gap ledger

This is an **evidence inventory**, not a parallel status board. GitHub master #253, epics #254–259, scoped #260–305 and new defects are authoritative. Every release updates this table with exact main SHA and supported tests/screenshots. Do not turn a placeholder currency or prototype into a completed feature merely because code exists.

| Capability | V2 foundation 258fce59 | Gap and issue |
|---|---|---|
| Real 3D isometric industrial terrain | Foundation shipped | Art parity/LOD/scale #262, #270, G1 #276 |
| Camera orbit/drag/zoom | Cursor grip fixed and merged via #307 (main 006b5e8); CAM-01 #337 regression matrix: 6480-case math pan matrix + 1008 wheel ticks + golden snapshots ≤1.32e-13 px, production browser gestures (6 quadrant poses, 13 drags, 6 wheels) max 1.005e-13 px, raycast cross-check SITE 13.9 at yaw225, exact negative controls 25.003235/380.160000 px; docs/qa/CAMERA_MATRIX.md | Remaining: height-aware mesh picking, world-edge (±90 clamp) communication, physical-handset touch verification #268/#275, G1 visual #276 |
| Phone and desktop game HUD | Foundation | Full UX/physical handset #268, #275, #276 |
| Voxel machine and animated crane | Partial procedural kit | Functional animation pivots, real production status #274 |
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
| Automated post-promote live manifest/checksum proof | Implemented on rw/v2-ops-08-live-release-proof: delivery `verify-live` job + `scripts/verify-live-release.mjs`; 13 offline tests incl. negative cases green; real public-HTTPS PASS receipt at main 94e74083 (rollback 006b5e8d, CI run 43996906181, delivery run 43996966371) in docs/operations/receipts/ | #332: first automated Actions receipt owed on the NEXT deployment after merge; hosted-browser smoke separate #333 |
| Sponsor G1 visual acceptance | Not granted | #276 |

## Maintenance rules
Whenever implementation, design, release or role governance changes, update relevant row with source SHA, issue, observed state, evidence URL and remaining debt IN THE SAME PR. Never close a row from a screenshot of a prototype. The team must reconcile issue/Project state, not edit this file as an alternate Jira. Sponsor and release statuses are separate: deployed foundation does not mean completed game.
