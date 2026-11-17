# Rustwake V2 factual implementation and gap ledger

This is an **evidence inventory**, not a parallel status board. GitHub master #253, epics #254–259, scoped #260–305 and new defects are authoritative. Every release updates this table with exact main SHA and supported tests/screenshots. Do not turn a placeholder currency or prototype into a completed feature merely because code exists.

| Capability | V2 foundation 258fce59 | Gap and issue |
|---|---|---|
| Real 3D isometric industrial terrain | Foundation shipped | Art parity/LOD/scale #262, #270, G1 #276 |
| Camera orbit/drag/zoom | Basic; cursor grip incorrect | #267, camera PR #307 browser check failing at last review |
| Phone and desktop game HUD | Foundation | Full UX/physical handset #268, #275, #276 |
| Voxel machine and animated crane | Partial procedural kit | Functional animation pivots, real production status #274 |
| Placeable buildings | Partial | Rotate/move/dismantle and staged reload #269, #273 |
| Roads and pathfinding | Basic | Real frontage/bays, intersections and recoverability #271 |
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
| Sponsor G1 visual acceptance | Not granted | #276 |

## Maintenance rules
Whenever implementation, design, release or role governance changes, update relevant row with source SHA, issue, observed state, evidence URL and remaining debt IN THE SAME PR. Never close a row from a screenshot of a prototype. The team must reconcile issue/Project state, not edit this file as an alternate Jira. Sponsor and release statuses are separate: deployed foundation does not mean completed game.
