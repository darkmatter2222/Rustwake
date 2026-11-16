# Executive contract

## Product promise

Build a living, rotatable, small-voxel salvage settlement with physical cargo and meaningful planning. The player watches people and machines carry out a plan, improves the plan, explores dangerous sites, supplies defenses, and eventually participates in a persistent realm economy. The goal is months/years of changing choices, mastery and attachment, not inflated timers or compulsory clicking.

Inspirations describe desired qualities: SimCity's place-making, classic RTS mechanical building deployment, Factorio's interconnected production and defense, and incremental games' durable progression. Use original names, art, audio, UI and balance. Do not copy proprietary assets, exact layouts or formulas. The Tower inspires layered progression, not a requirement to reproduce its economy.

## Non-negotiables

- Name: Rustwake. Approved primitive voxel image is the visual anchor. Reject cinematic realism, giant Minecraft terrain cubes, neon dashboard blue, or escalating asset complexity.
- Real 3D orthographic presentation with pan/zoom/orbit; React/TypeScript UI retained. No image used as a fake playable world. Asset sheet is not a texture atlas.
- Buildings have grid footprints, orientation, access requirements and readable function. Players choose locations and plans within land, terrain, collision and research constraints.
- Cargo moves through real transport jobs; decorative vehicles cannot substitute for logistics. No teleporting output through a connect button.
- Self-assembly, working motion, loading/unloading, power-off and damage states use simple named components. Motion reflects state and remains bounded.
- Production and research enable expeditions, defensive equipment and later player trade/raids. At least two contextually useful early strategies; guidance does not choose all purchases.
- First-class mobile and desktop; no document scrolling; accessible targets, text, focus, motion and mute alternatives.
- Preserve history and existing saves through tested migration or an explicit parallel legacy slot. Never erase the repository or silently reset a player's yard.
- Deterministic conserved resources, idempotent transactions, reliable offline calculation; render FPS and particle physics never determine rewards.
- Player raids have explicit exposure and bounded losses. Permanent protected home progress cannot be erased by offline harassment.
- GitHub is the work ledger. One coordinator and at most four child sessions; one active runtime. Future implementation follows branch/PR/independent QA/product/release gates.

## Scope and autonomy

This publication defines the plan, procedural reference assets, validation utilities and agent instructions. It does not implement the complete game or claim local team activation. Ryan expressly authorized this planning package on main; that is a one-time sponsor-directed publication, not a standing bypass for future agents. Branch protections remain in force.

Agents may make reversible implementation and tuning decisions consistent with this package, with concise rationale in the relevant issue. They may not reopen the selected art direction, rename the game, remove later defense/realm scope, lower evidence standards or add paid dependencies to escape hard work. Public multiplayer launch, spending, new external accounts and secrets remain separately controlled. Code and local/staging validation for roadmap systems are authorized.

## Acceptance hierarchy

Current explicit sponsor instructions > this contract and linked live master issue > approved subsystem contracts > current issue acceptance > runtime conventions > historical design. Existing economy invariants stay; old tests pinning exact artwork, old 233000-byte caps or single-next-action behavior must be deliberately replaced when they conflict. Document which obsolete assumption is retired and add outcome-based checks. Never simply delete failing correctness tests.

## Stage gates

P0 proves one reusable asset can load, animate, rotate and select with deterministic state and device measurements. P1 proves one coherent playable yard and the two-truck decision loop. P2 proves meaningful alternate factory plans and multi-day/offline resilience. P3 proves industrially supplied defense and reproducible expedition combat. P4 proves transactional online ownership, fair asynchronous raids and resilient trade. P5 proves repeatable content updates without save or economy corruption.

Every gate requires real build SHA, relevant automated tests, actual opening/mature screenshots, motion clip when applicable, input walkthrough and honest capability gaps. A passing build, generated image, geometry census, agent enthusiasm or closed issue is insufficient. No need for routine sponsor approval between accepted gates; the team must perform actual review, not invent it.
