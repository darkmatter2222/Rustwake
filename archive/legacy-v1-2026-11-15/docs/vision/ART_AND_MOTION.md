# Art, scale and motion contract

## Exact starting palette (sRGB)

| Token | Hex | Use |
|---|---|---|
| sand | #BA8054 | Terrain base |
| sandLight | #D3A16D | Sparse terrain variation |
| oxide | #A34F32 | Roofs, cargo beds, structural accents |
| oxideLight | #C47746 | Lit trim and construction accents |
| cream | #D6C7A3 | Warehouse walls and vehicle cabs |
| charcoal | #292C29 | HUD and mechanical recesses |
| steel | #7C8078 | Cargo and machinery |
| olive | #777746 | Generator and defensive machinery |
| yellow | #C99A35 | Cranes, forklifts and safety trim |
| amber | #FFB348 | Selection, furnace light and positive action |
| rubber | #33332F | Tires and belts |
| text | #F4EBD8 | Main HUD text |
| muted | #C0B69F | Secondary text on dark panels |
| danger | #CB4D40 | Damage and invalid actions; always add icon/text |
| success | #88A66B | Valid placement; always add shape/text |

Colors are starting material tokens, not a pixel-count contract. Validate UI contrast in actual combinations. Do not use muted terrain colors as small text on transparent scenery. Aim for 4.5:1 ordinary text and 3:1 large text/control boundaries. Selection must not rely on color alone.

## Spatial grammar

Right-handed world: Y up; X east; Z south. One grid cell = 1 world unit, conceptual 2 meters. Fine detailing quantum = 0.125 world units. Asset local origin is footprint center at ground level. Default frontage points +Z. All dimensions in recipes are world units. 90-degree yaw rotates footprint, ports and clearances together. Do not infer simulation dimensions from raster pixels.

Worker height 0.85 units. Small truck envelope approximately 1.0 wide x 2.5 long x 1.15 high. One lane = 1.25 wide; two-way road corridor = 3 cells. Building gates require vehicle envelope plus at least 0.15 clearance each side. Warehouse 6x4 footprint; garage 4x4; sorter 3x3 plus external belt connection; furnace 3x3; generator 2x2; crane 3x3 plus swing clearance. Gate collision tests use actual geometry bounds.

Buildings are assembled from large matte surfaces and a few fine steps, not millions of voxel cubes. Prefer merged static geometry, repeated shared meshes, vertex or material color. No photoreal dirt maps, dense beveling, ray tracing, volumetric clouds or cinematic bloom. A warehouse should remain recognizable in a 96px-wide screen projection. At far zoom show a simple silhouette and relevant state marker, not unreadable microdetail.

## Scene composition and lighting

Default yaw 45 degrees, elevation 35.264 degrees, orthographic camera. Starting 24x24-cell yard with expansion rings; active industrial cluster occupies approximately 65-80% of usable world region at fit view. Frame around useful entities, not the full empty plot. One directional sun from upper-left of default view plus ambient fill; soft shadow at high quality, simplified contact shadows at low quality. Terrain is mostly flat with sparse low-poly shrubs and stones. No mandatory day/night cycle in P1. Keep entrances and moving cargo visible from standard camera angles; fade occluding roofs locally if needed.

## Assembly timeline

Five-second default presentation after the simulation reserves materials and commits placement. 0.0-0.6s foundation settles; 0.6-1.6s columns rise; 1.6-2.8s wall modules unfold/translate; 2.8-3.8s roof and machinery settle; 3.8-4.5s doors align; 4.5-5.0s lights and idle mechanisms activate. Do not scale people or whole buildings like balloons. Use separate pivot groups with fixed geometry. In reduced motion show static discrete stages or an immediate completed model; economic completion time remains unchanged. Fast-forward/reload renders the correct current stage without replaying material charges.

## Animation inventory

| Asset | Continuous when powered | Event/state-driven | Paused/damaged |
|---|---|---|---|
| Warehouse | Small ventilation fan | Doors, pallet lift, forklift service | No loading when unavailable; repair marker |
| Depot | Slow vent fan | Door opening, chassis assembly, vehicle departure | Closed service bay |
| Sorter | Rollers during processing | Magnet sweep every batch | Belt stops with cargo retained |
| Furnace | Fan, subtle emissive variation | Intake door, pour, sparse vent puff | Furnace light fades; no fake production |
| Generator | Fan/shaft | Load response and start/stop | Spin-down |
| Crane | None required while waiting | Slew, hoist, grip, place | Safe suspended load state |
| Truck | Wheels only while moving | Steering, suspension, loading | Brake lights/idle pose |
| Forklift | None required | Mast lift, forks, wheel turns | Parked forks lowered |
| Drone | Rotor while airborne | Cargo attach, takeoff, landing | Lands/parks, not endlessly hovering |
| Worker | None required | Walk, carry, operate, weld | Rest/task waiting |
| Turret | Optional scan when powered | Aim, fire, reload | Distinct empty/unpowered state |

Continuous loops use smooth periodic transforms. Event delays may vary within authored ranges using stable entity seed; variation never changes production rates. Independent channels: e.g. fan 1.7s, loader batch-driven, vent 11-19s, worker job-driven. Avoid synchronized global resets. Do not promise imperceptible loops; acceptance is absence of obvious whole-yard synchronization in a 60s clip. Stop invisible animation updates or lower update frequency at distance. Pool particles, never spawn permanent objects per tick.

## Asset deliverables and non-vision implementation

`assets/kit.json` is the authoring source: named box parts, parent groups, center/size, material token, footprint, sockets and bounds. `assets/generated/*.gltf` are original procedural blockouts using embedded buffers and named groups. They demonstrate scale, pivots and palette, not production-ready art parity. `scripts/build-vision-assets.py` regenerates them without external libraries. `assets/asset-manifest.json` states every required asset, stage and completion status. Reference PNGs are generated concepts, never gameplay evidence.

An agent without vision implements from these numbers and must emit front/side/isometric renders and a motion clip for a capable reviewer. Numerical checks prove scale and completeness only. A vision-capability blocker cannot be laundered into an ACCEPT; continue independent simulation work while visual review waits. Do not endlessly generate replacement concept sheets.
