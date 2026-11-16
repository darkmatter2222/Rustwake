# Rustwake visual asset ownership, import and maintenance

The visual benchmark is public/reference/approved-yard.png; the secondary original style sheet is public/reference/asset-style-sheet.png. These are *references*, not textures rendered as gameplay. The original geometry corpus lives in public/assets/blockouts (13 reproducible glTF assets). Source recipes are docs/asset-kit/kit.json; docs/design/asset-manifest.json enumerates every retained file and its intent. Existing production renderer in src/world.js constructs distinct blocky machines from Three.js Box/Cylinder primitives. Old blockouts do not automatically appear in the new game.

## Asset scale and composition
Use a right-handed X east / Y up / Z south world; starting logical parcel is 24×24 cells, CELL 3.5 world units. A freight truck must look small but readable next to a warehouse and crane; a worker remains visibly human-scale. Machines are built from large matte surfaces, few voxel-like fine steps, shared geometry/materials and named mechanical pivot groups. Keep recognizability at 96px silhouette, not dense microscopic polygons or large Minecraft chunks. Each asset has a footprint, height, facing, loading/bay entrances, camera silhouette and world collision/picking contract; visual dressing must not block build cells or freight routes.

## Style rules
Use approved dusty rust/amber/steel/sand/charcoal palette with restrained mint status lamps, not neon cyan. Compare actual CSS tokens from src/styles.css and renderer material tokens from src/world.js with docs/design/PALETTE.md and docs/design/tokens.json (when merged). Material states correspond to actual power/stock/production; an idle machine must not fake active throughput. Lighting: warm directional key, soft cool ambient, restrained emissive furnace/lamps, no photoreal dirt texture, volumetric cinematic bloom or massive game-dark overlays that hide the yard.

## Mechanical rig standards
Every vehicle/machine should expose named, testable pivots for hoist, door, crane arm, wheel, conveyor, fan or pistons; animation must be conditional on actual game state. Construction stages: 0–0.6 foundation; 0.6–1.6 frame; 1.6–2.8 walls; 2.8–3.8 roof/machinery; 3.8–4.5 doors; 4.5–5 lights/activation. Components move independently and with fixed geometry, not by enlarging the complete building. Paused/starved/unpowered machinery must not animate false production. Reduced-motion mode shows discrete accessible states without changing economic timing. Reload mid-construction resumes stage exactly and spends material once.

## Asset pipeline
1. Author textual recipe/meshes with footprint and ports, original license/provenance and budget.
2. Capture front/side/45-degree isometric at full size and 96px; compare against approved reference and actual placed truck/worker.
3. Validate bounding boxes, pivot origins, orientation, optional glTF part hierarchy, accessibility selection proxy and LOD; avoid duplicate geometry/materials and overdraw.
4. Implement in src/world.js or refactored src/art/** with real state input; preserve deterministic placement and ray-pick identity.
5. Verify no rogue resource movement, actual cargo visual status, active/blocked/under-construction variants, screenshot parity at desktop/phone and performance at declared tier.
6. Update docs/design/asset-manifest.json, design tokens, quality gate, ADR if style changes, and docs/backlog/GAPS.md IN SAME PR. Product/art reviewer independently inspects captured game images; sponsor accepts G1 whole scene.

## Missing art work
Complete more distinctive conveyor/vehicle/bay rigs, physical loading animations, genuine modular building variants, idle/working/starved states, night/mute/reduced-motion alternatives, worker/forklift rigs, frontier environmental LOD, sound cues and gameplay-context camera occlusion. These are not done merely because a glTF file exists. See #262, #270, #273, #274, #276 and later phase issues.
