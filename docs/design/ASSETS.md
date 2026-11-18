# Rustwake visual asset ownership, import and maintenance

The visual benchmark is public/reference/approved-yard.png; the secondary original style sheet is public/reference/asset-style-sheet.png. These are *references*, not textures rendered as gameplay. The original geometry corpus lives in public/assets/blockouts (13 reproducible glTF assets). Source recipes are docs/asset-kit/kit.json; docs/design/asset-manifest.json enumerates every retained file and its intent. Existing production renderer in src/world.js constructs distinct blocky machines from Three.js Box/Cylinder primitives. Old blockouts do not automatically appear in the new game.

## Asset scale and composition
Use a right-handed X east / Y up / Z south world; starting logical parcel is 24×24 cells, CELL 3.5 world units. A freight truck must look small but readable next to a warehouse and crane; a worker remains visibly human-scale. Machines are built from large matte surfaces, few voxel-like fine steps, shared geometry/materials and named mechanical pivot groups. Keep recognizability at 96px silhouette, not dense microscopic polygons or large Minecraft chunks. Each asset has a footprint, height, facing, loading/bay entrances, camera silhouette and world collision/picking contract; visual dressing must not block build cells or freight routes.

## Style rules
Use approved dusty rust/amber/steel/sand/charcoal palette with restrained mint status lamps, not neon cyan. Compare actual CSS tokens from src/styles.css and renderer material tokens from src/world.js with docs/design/PALETTE.md and docs/design/tokens.json (when merged). Material states correspond to actual power/stock/production; an idle machine must not fake active throughput. Lighting: warm directional key, soft cool ambient, restrained emissive furnace/lamps, no photoreal dirt texture, volumetric cinematic bloom or massive game-dark overlays that hide the yard.

## Mechanical rig standards
Every vehicle/machine should expose named, testable pivots for hoist, door, crane arm, wheel, conveyor, fan or pistons; animation must be conditional on actual game state. Construction stages: 0–0.6 foundation; 0.6–1.6 frame; 1.6–2.8 walls; 2.8–3.8 roof/machinery; 3.8–4.5 doors; 4.5–5 lights/activation. Components move independently and with fixed geometry, not by enlarging the complete building. Paused/starved/unpowered machinery must not animate false production. Reduced-motion mode shows discrete accessible states without changing economic timing. Reload mid-construction resumes stage exactly and spends material once.

## Civic rig pivots and the lift vocabulary (ART-04 #350)
The pivot motion vocabulary in src/voxelSchema.js is spin | oscillate | lift. A `lift` pivot declares a positive numeric `travel` (vertical world units) AND a non-empty string `drive` naming the real simulation signal that drives it — the validator rejects a lift without both (src/voxelSchema.js:481–483). A lift is never a wall-clock timer. The four civic rigs (docs/design/CIVIC_RIGS.md, geometry_schema.civic_rigs in docs/design/asset-manifest.json) declare:
- depot `pivot:door` roll-up shutter — y-lift @ [0, 0.76, 1.08], travel 0.8, drive "nearest-truck-bay-distance": a pure piecewise function of the nearest REAL freight truck's distance to the depot bay approach cell (ART04_DOCK near 2.5 fully open / far 7 closed, linear between); reduced motion parks it closed.
- market `pivot:scale` balance beam — z @ [0, 2.95, 0.72], oscillate amplitude 0.45 speed 1.3, and `pivot:awning` — x @ [0, 1.95, 0.72], oscillate amplitude 0.25 speed 2.6 (exact 2:1 second harmonic, phase 2·id). Both DECLARED ambient civic decoration, drive "ambient-elapsed", no production authority (#274).
- research `pivot:dish` azimuth dish — y @ [0, 3.55, −0.2], spin 0.5, carrying nested `pivot:feed` horn — x, oscillate amplitude 0.16 speed 0.7; working-only off the wrap-aware sim-timer work clock.
- fabricator `pivot:gear` — z spin 1.6, `pivot:pinion` — z spin −3.2 (2:1 counter-rotation), `pivot:hammer` — x oscillate amplitude 0.45 speed 1.1; working-only off real sim timers.
Per-rig budgets are 38/460 (depot), 36/480 (market), 28/460 (research), 40/540 (fabricator) meshes/triangles; the GLOBAL caps stay unchanged at 60 meshes / 1600 triangles per machine. Footprints 1×1, +Z bay port 1.22×0.42, status light (1.28, 0.95, 1.25) unchanged.
Documentation discrepancy (coordinator RULING 2): the comment at src/voxelSchema.js:147–149 claims "Vocabulary extension documented in docs/design/ASSETS.md + GAPS.md" — that documentation did not exist when the ART-04 code landed. Correcting the comment would be a src change voiding the numeric evidence bound to head d6ee7f3ca42777c516314551ff75d7e95cdc69a0, so the comment is left byte-identical and this section plus the ART-04 GAPS row discharge the claim instead.

## Asset pipeline
1. Author textual recipe/meshes with footprint and ports, original license/provenance and budget.
2. Capture front/side/45-degree isometric at full size and 96px; compare against approved reference and actual placed truck/worker.
3. Validate bounding boxes, pivot origins, orientation, optional glTF part hierarchy, accessibility selection proxy and LOD; avoid duplicate geometry/materials and overdraw.
4. Implement in src/world.js or refactored src/art/** with real state input; preserve deterministic placement and ray-pick identity.
5. Verify no rogue resource movement, actual cargo visual status, active/blocked/under-construction variants, screenshot parity at desktop/phone and performance at declared tier.
6. Update docs/design/asset-manifest.json, design tokens, quality gate, ADR if style changes, and docs/backlog/GAPS.md IN SAME PR. Product/art reviewer independently inspects captured game images; sponsor accepts G1 whole scene.

## Missing art work
Complete more distinctive conveyor/vehicle/bay rigs, physical loading animations, genuine modular building variants, idle/working/starved states, night/mute/reduced-motion alternatives, worker/forklift rigs, frontier environmental LOD, sound cues and gameplay-context camera occlusion. These are not done merely because a glTF file exists. See #262, #270, #273, #274, #276 and later phase issues.
