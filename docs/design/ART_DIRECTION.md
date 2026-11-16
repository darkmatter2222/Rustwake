# Living Industrial World — definitive art direction

## Executive benchmark
The approved visual reference is public/reference/approved-yard.png. Its world is not a background illustration. All first-playable visual work must converge on a real, navigable 3D environment with this image's visual grammar: modest voxel scale, visible roofs and sides, layered factory structures, cranes, roads and haulers, dusty earth and steel, warm amber machinery and restrained mint signals. Supplementary historical artifact: public/reference/asset-style-sheet.png. Original 13 glTF blockouts remain under public/assets/blockouts/ and detailed old recipes under docs/asset-kit/kit.json.

Current V2 is a real Three.js scene with procedural box/cylinder construction and partially animated buildings. It is a foundation, NOT full visual parity, complete construction rigging or a production asset library.

## Player experience and emotional intent
A salvage basin that the player can turn into a sprawling, automated industrial settlement. It should feel engineered, inhabited, tactile, purposeful, warm, kinetic and understandable. The player should want to orbit, zoom into a furnace, trace a freight route and place a new structure. Industrial wonder, not horror or photorealism.

Avoid: old 6x6 pipes/dashboard language; giant Minecraft blocks; huge noisy textures; unlicensed assets; unreadable greebles; neon cyan everywhere; cinematic bloom; a flat orthographic screenshot masquerading as interaction; vehicles moving without corresponding economic jobs.

## Camera and composition
Orthographic 45 degree yaw, 35.264 degree elevation by default, both roof and walls visible. Full 360 orbit, pitch 20–80, zoom 0.20–12. Camera target and cursor-grip defined in CAMERA.md. First frame shows the useful factory cluster and multiple visual-depth layers, not a giant empty board. Terrain may be deterministic grid-addressed, but no grid lines dominate the picture. Clear foreground roads, middle-ground depots/manufacturers, background props and environment. Roads are recognizable as ground-level transport infrastructure; not arbitrary wires or pipes.

## Geometry and scale
Right-handed 3D world (X east, Y up, Z south); 24x24 initial hidden logical cells, 3.5 world units per cell. Primitive blocky factories must remain identifiable at the strategic zoom, scale coherently against a truck and worker, and present a silhouette before micro detail. Use shared BoxGeometry and reusable materials, restrained cylinders for tanks/chimneys/axles, structured machine parts and named pivots. Larger buildings need frontage, loading docks, doors, roofs, emissions and service activity.

Prototype families in src/world.js: salvager/extractor with rocker arm, depot and market with signage, generator with fan, furnace and foundry with hot process window, crusher/refinery rollers, articulated crane, watchtower, fabricator, observatory. Each asset should eventually ship with: footprint, unit scale, pick/collision mesh, bay socket(s), pivot/rig map, production/state variants, LOD, and real animation cues.

## Palette and light
See tokens.json and PALETTE.md. Primary environmental earth #756b55, dark asphalt #283840, stone #91806b, steel #b2bfbd, rust #c78355, roof #70888b; hazard accent orange #e7a25d; restrained operating mint #86d5c5; furnace active #f98b50. UI background #0e1b21. Strong silhouettes through warm sun and cool/fill light, not overprocessed graphics. Use large flat/matte faces with one material family per large component; highlight functional machinery and cargo.

Current renderer uses ACES Filmic exposure 1.9, hemisphere 2.5, warm sun 3.65 at (-45,90,38), restrained exponential fog. Performance and color calibration on physical handset are outstanding. New lighting must be measured and compared at all quality tiers.

## Animation language
Time and state-driven mechanisms: turret rotates only when active/targeting, generator fan responds to operation, crane carries actual loads once integrated, furnace hot glow reflects processing, trucks track physically reserved cargo and roads. Decorative scene props cannot be presented as economic transport. Each subassembly must articulate with physical pivots, not uniform mesh enlargement.

Future mandated five-second mechanical build:
0.0–0.6s settle foundation; 0.6–1.6 columns rise; 1.6–2.8 walls unfold; 2.8–3.8 roof and machinery settle; 3.8–4.5 doors/ports; 4.5–5.0 activation lights and idle. Save mid-build resumes exactly; charge once. Reduced motion renders understandable discrete stages, never a broken activity signal. V2 currently has only simple remaining-time staging; full staged mechanical animation is open task #273.

## Depth, gameplay readability and quality
At far zoom: clear landmark silhouettes, freight lanes and production categories. At intermediate zoom: loading sockets, cargo carriers, operating state markers. At close zoom: machine pivots, panels, rig mechanisms, character scale. Do not hide vital interaction under roofs; consider transparent/cutaway roofs only when selecting the occupant, preserving visual consistency.

Instancing/static batching for repeated props. Load optional detailed glTF rig assets lazily. Keep one dominant shadow source; avoid overdraw, excessive point lights and high-DPR performance failures on phone. A stylized low-quality tier must preserve interactions and silhouette, not silently drop machines.

## Visual decision gate
Review actual production screenshots desktop 1440x900, phone 390x844, landscape 844x390, and detailed near zoom. Include one 60s real interaction/animation capture. A capable reviewer compares the reference against the actual V2 build: occupancy, ground cover, machine density, amber/teal balance, road legibility, truck scale, animation and visual hierarchy. Numeric pixel tests are supporting only; sponsor approval remains a separately recorded decision. If visually wrong, REWORK regardless of green tests.
