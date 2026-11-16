# V2 vision and uncompromising art contract

## The game
Rustwake is a sandbox industrial idle strategy game, combining factory automation, physical shipping, salvage, deep tech research, The Tower-style long progression, and optional async Rust raids. The player's choices in placement, layout, dispatch, resources, prestige and defense must change outcomes. Avoid idle progress based solely on repeated button pressing.

## What the player sees
The approved reference is public/reference/approved-yard.png, with an original supplementary asset-style-sheet.png. It is an inviting, small-voxel, primitive industrial world (not large Minecraft-scale blocks): angled buildings with recognizable silhouettes, salvage cranes, vehicles transporting cargo on roads, smokestacks, forklifts, people, steel, rust orange, sand, charcoal, dusty teal. The imagery is a style requirement, not a literal road map or playable background. A real Three.js game must render it.

Default camera: 45 degrees yaw, elevation 35.264 degrees, orthographic. Full 360 orbit, tilt, wheel/pinch zoom, one-finger pan, right-drag/Q/E/touch twist. First frame must present a busy yard; no overhead flat 6x6 grid.

## Visual asset principles
Use reusable real 3D geometry, not billboard PNGs. Kit recipes and glTF blockouts are carried in docs/asset-kit/kit.json and public/assets/blockouts for reference; v2 world.js currently generates a new procedural industrial kit. Add LOD, optimized instancing, clear footprint/loading socket, and real animation pivots for moving parts. Controlled palette (warm rust/amber industrial with restrained teal status, dark steel terrain), matte large surfaces, no overglow. Buildings should mechanically rise in 5-second staged assembly like Command & Conquer / Tiberian Sun, rather than scale balloons.

World elements must move and respond to simulation: pickups and deliveries change truck cargo, belts spin only when active, cranes lift loads, fires/power indicate production, little workers/forklifts roam. Visual-only decoration is permissible if never falsely claims resource transport.

## Sandbox and UX
Freeform-looking terrain on a deterministic discrete placement grid; hidden grid for logic is allowed. Roads have real material costs, topology, lanes, loading bays, traffic and routing. Mobile-first full-viewport React game HUD with compact top currency rail, contextual build palette, non-blocking inspector and tool dock, no browser scroll, pointer-cancel safety and accessibility targets.

## Future systems
17 material/currency categories currently registered; establish genuine sources/sinks and progression for rare factions and prestige. Interlocking tiers, modules, outposts, large map expansion, contracts, expeditions and PvE factory-supplied defense. Multiplayer trade/raids require a server authoritative economy, replay, escrow, bounded losses and anti-collusion. No data exploitation or fake long-run retention claims.

## Actual acceptance
One integrated production build, side-by-side approved art reference vs real phone/desktop screenshots and 60-second motion clip. First user can orbit, place a machine, road-connect a depot, watch a physical freight trip, manufacture steel, research, and safely reload. Sponsor must visually approve; passing CI or screenshots from standalone prototypes do not count.
