# ART-07 yard terrain, roadsides and landmarks (#353)

Decorative, occupancy-safe salvage-yard dressing for the V2 isometric sandbox.
All geometry is original procedural code (shared unit BoxGeometry + 8-segment
cylinders, shared MATERIALS pool, flat shading, seeded LCG). No external models
or textures; every hex is already in the token-derived MATERIALS pool.

Authority: `SCENERY_AUTHORITY = "none — decorative yard scenery (#274)"`
(src/voxelSchema.js). Scenery has no pick volumes, never blocks routes, and is
never raycast — picking stays cell-based (`screenToCell`).

## Terrain authority vs dressing

- The BUILD validator's terrain is `terrainFor(seed)` in src/gridOccupancy.js
  (read-only lease): rock h=2, bench h=1, pad h=0, graded around INITIAL_ROADS
  Manhattan neighbors and starter footprints. Those heights are validator-only;
  they are not rendered as raised ground meshes.
- The VISIBLE relief is dressing placed to MATCH that authority: volumetric
  props (wreck/barrel) and rubble (scrapPile/outcrop) sit only on surveyed rock
  cells, so every cell they cover already rejects `checkSite` with TERRAIN.
  Grading guarantees props can never touch a legal route or a legal pad.

## Zones (src/voxelSchema.js SCENERY, src/world.js yardSceneryPlan)

- Interior: props + rubble on surveyed rock cells outside starter footprints
  and bays; bench tints on bench cells.
- Exterior landmark belt: containers/sheds/silos/pipeRacks/floodlights/
  gatePosts/fence/boulders on a SQUARE belt beyond the parcel edge
  (|coord| > 42; boulder perpendicular offset >= 43.5, conservative rotated
  AABB radius <= 1.247). Building there is BOUNDS/UNSURVEYED; the belt is
  immune to any legal road network.
- Decals: flush instanced quads, top <= `decalMaxHeight` 0.06 (below road top
  `roadTop` 0.185), never on road cells: pad dust, maintenance alleys, tire
  tracks, bay chevrons (intentional on bays), oil stains, gate stripes.

## Dynamic occupancy safety

`sceneryConflicts(plan, g)` hides props/rubble whose cells are covered by
`g.roads`, `footprintCells` or `bayCells`. Applied ONLY in `rebuild()` (never
per-frame) via zero-scale instance matrices with byte-exact restore from
`rubbleBase`. A fresh save hides nothing (`sceneryHidden = "0"`); building a
legal machine never hides scenery because legal sites carry no scenery.
Seed change rebuilds scenery and preserves the decorative crew.

## Build ghost decal contract (buried-ghost fix)

`drawGhost` derives each cell's top surface from the SAME plan data that builds
the meshes:

- `surfaceTopFor(plan, x, z, hidden)` — max over decal tops (h/2 + .002),
  rubble tops (y + h/2) and prop kind scale heights, skipping occupancy-hidden
  instances.
- `ghostTop(x, z)` — also raises for live roads (`roadTop`) and machine
  footprints (`machineDescriptor(type).pick.size[1]`).
- `ghostLift(top, thickness) = top + thickness/2 + .02` — thin decal rides
  above the dressing; no hardcoded heights remain.

Slab opacity .7 (valid `#7ed4b3`, invalid `#ee8263`), bay overlay opacity .3.
Regression tests prove the old .2/.16/.22 heights were below the rendered rock
tops and that hidden scenery stops lifting the ghost.

## Rendering budget (seed 4073 measured)

27 props / 177 rubble instances / 233 decal instances; 177 prop meshes /
2824 prop triangles / 4 point lights. Budgets: 260 meshes / 4200 tris /
420 rubble / 700 decals / 4 lights. Rubble + decals are exactly 2
InstancedMeshes (white-base MeshStandardMaterial + setColorAt,
frustumCulled=false; decals castShadow=false). Props are static seeded groups
named `scenery:<kind>` with userData.decorative/authority/sceneryKind.
Validated seeds: 4073, 1, 777, 9999, 12345, 2026, 31337.

## Observability

Dataset stamps on `.world-canvas`: `scenerySeed`, `sceneryProps`,
`sceneryRubble`, `sceneryDecals`, `sceneryHidden`. Camera invariants #307
untouched: `applyCamera` sha256-16 `f3afa5479a66b97e` (len 602), `stampCamera`
`691b3c0a3480e97b` (len 252), hash-guarded in tests and the capture script.

## Evidence and limits

tests/yardScenery.test.mjs (19 tests) + scripts/capture-terrain.mjs ->
docs/evidence/353-art-07/ (PASS_NUMERIC_ONLY; desktop 1440x900 + emulated
phone 390x844 dpr2; fresh-save stills, TERRAIN-rejection negative and valid-pad
positive with real validator verdict stamps and region-chroma ghost proofs).
On compact layouts the capture collapses the build catalog sheet through the
real UX-07 toggle before ground taps (camera untouched); this is a player
action, not a gate relaxation.

Numeric proofs are NOT visual acceptance: sponsor G1 review #276 is reserved;
physical handset verification #268/#275; hosted-browser receipt at deployment
#333. Inhabited-yard dressing is not a completed environmental gameplay
mechanic (#274). ART-05 forklift near-static debt (maxLift 0.037) is unchanged.
