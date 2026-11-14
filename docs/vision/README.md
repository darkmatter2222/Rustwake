# Rustwake: Living Voxel World

**Executive sponsor: Ryan. Planning partner: ChatGPT. Approved direction: 2026-11-13 America/New_York.**

Canonical mandate: [#121](https://github.com/darkmatter2222/Rustwake/issues/121). Delivery board: [Project 2](https://github.com/users/darkmatter2222/projects/2). This package supersedes #43's UI-only scope and earlier art constraints. Rustwake is the product name; raiding is a system, not a rename.

## Read only what the assignment needs

1. [Executive contract](EXECUTIVE_CONTRACT.md): non-negotiables, phases, authority and boundaries.
2. [Game systems](GAME_SYSTEMS.md): placement, simulation, logistics, economy, defense and realms.
3. [UI contract](UI_CONTRACT.md): exact screen structure, controls and failure states.
4. [Art and motion](ART_AND_MOTION.md): palette, scale, lighting, asset construction and animation.
5. [Technical contract](TECHNICAL_CONTRACT.md): simulation boundary, saves, server authority and performance.
6. [Acceptance](ACCEPTANCE.md): reproducible scenarios and release gates.
7. [Execution](EXECUTION.md): roles, dependency semantics and commissioning.
8. [Agent efficiency](AGENT_EFFICIENCY.md): role budgets and Qwen/OpenCode boundaries.
9. [Backlog](BACKLOG.md) and `backlog.json`: immutable planning seed and issue crosswalk; live GitHub wins for status.
10. [Assets](assets/README.md): text-readable recipes and generated glTF blockouts.

The approved image is `reference/approved-yard.png`. It establishes style, not literal road geometry or proof of a working game. The asset sheet is supplementary. Text recipes and contracts make the concept implementable by a non-vision model. Production release still requires an actual visual inspection by a capable reviewer; a blind model must not certify beauty from counts.

## First playable outcome

Place a sorter and furnace; route a truck between loading bays; manufacture steel; choose transport capacity or processing capacity; see a new building mechanically assemble; close and reopen without losing cargo. The scene must look like the approved simple voxel world. No generic dashboard shell, universal next-action button, or cinematic asset escalation.

## Delivery phases

| Phase | Outcome | Unlock condition |
|---|---|---|
| P0 | Runtime cutover, architecture proof, asset import and canonical benchmark | Sponsor publication verified |
| P1 | Beautiful playable salvage/logistics yard | P0 gate accepted |
| P2 | Deep industry, research, contracts, fleet upgrades and outposts | P1 gate accepted |
| P3 | PvE expeditions and factory-supplied tower defense | P2 gate accepted |
| P4 | Authoritative realms, trade, co-op and asynchronous player raids | P3 gate and backend integrity gate accepted |
| P5 | Seasonal frontier, collection and sustained content operations | P4 integrated gate accepted |

No calendar dates are promised by phase names. All later systems are committed roadmap scope; they are not permission to skip the first playable yard.
