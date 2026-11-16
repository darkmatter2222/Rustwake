# MASTER GOAL — Rustwake V2 living-world sandbox

Build the approved smaller-than-Minecraft isometric voxelcraft salvage/factory playground from public/reference/approved-yard.png and docs/VISION.md: a free orbit/tilt/zoom 3D world, roads, warehouses, loading bays, trucks, cranes, drones, industrial assembly and idle automation; lots of meaningful currencies, research, factions, defense, expeditions, optional raids and years of fair progression.

Prioritize the actual visual game and first-player behavior above adding documentation or performance vanity metrics. A player should see a beautiful working industrial 3D world immediately, build roads and factories, and observe genuine truck cargo and production. The legacy code lives ONLY in archive/; never restore its HUD/flat grid layout.

GitHub issues and dependencies define the work. Developers push rw/ feature branches, QA/product independently approve at exact head, release engineer merges into main and watches CI, delivery and exact live SHA/browser verification. No direct main pushes or six-agent team. Sponsor visual G1 ACCEPT required; later phases remain blocked until then.


## Durable autonomy and documentation goal
Maintain Rustwake as a living, self-documenting product. Every agent must be able to rebuild its understanding from AGENTS.md, docs/DOCUMENTATION.md, docs/design, docs/engineering, docs/agents, docs/qa, docs/backlog and docs/decisions without prior chat history. Treat the code and actual deployed build as factual evidence; keep missing/partial mechanics explicit. Follow master #253, active V2 scoped issues and GitHub Project only when its actual ID/authorization is verified.

Do not allow the old top-down interface to return. Fix world-camera pointer anchoring so a dragged ground point stays under the pointer, expand usable zoom in/out and provide actual mobile controls while preserving ray picking, no accidental buy, save semantics and performance. Require CI browser motion/camera traces, not only unit tests. Maintain exact art tokens, original voxelcraft industrial style, gameplay/physical freight/economy constraints and all risk/release docs in each PR. Preserve one coordinator + four children, single release engineer, reviewed main merges, CI/CD/served-SHA proof and sponsor visual G1 acceptance.
