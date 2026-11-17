# Motion, sounds and simulated truth

Rustwake's machines should feel tactile, mechanical and alive rather than cinematic or cartoonishly inflated. A physical action must be linked to a real simulation event if it visually implies production or delivery.

## Motion grammar
- Construction: foundation settles at 0–0.6s; frame rises 0.6–1.6s; walls unfold 1.6–2.8s; roof/machinery 2.8–3.8s; doors 3.8–4.5s; lights/status activate 4.5–5.0s. Use rigid pivots and separate elements, not uniform whole-building growth. Save/reload resumes exact assembly stage.
- Crane (ART-06 #352): deterministic 25.2 s mechanical lift cycle on named pivots — slew (`pivot:crane`), trolley travel along the boom (`pivot:crane:trolley`), hoist cable payout (`pivot:crane:hoist`) and hook (`pivot:crane:hook`): travel-out → lower → dwell → raise → travel-in → slew-to-drop → lower → release dwell → raise → slew-back, smoothstep eased with zero end velocity, no endless sinusoidal spin. The hook runs EMPTY: decorative autonomous motion may not represent moving actual inventory or imply production; a visible load must synchronize with a reserved shipment from the simulation authority (#274). prefers-reduced-motion parks the crane in a static minimal pose (slew 0, trolley in, hook up). Contract: `docs/design/VOXEL_GEOMETRY.md` § ART-06; pose source `cranePose`/`applyCranePose` in `src/world.js`.
- Truck: wheels turn with speed, vehicle rotates toward path tangent, load visibly appears on pickup and disappears on unload, pauses at bay/traffic. Transport conservation governs the visual state.
- Furnace: heat/glow/fan depends on real fuel/input/power and production. Idle/starved/power-off must differ. Generator responds to load and has spin-down, not perpetual full-power rotation.
- Conveyors/worker/forklift/drone: different motions for working, waiting, blocked, recovering. All pivot dimensions scale against player truck and machine footprint.

## Audio contract
Optional, muted by default until permitted user gesture (browser audio policy). Short restrained industrial cues: weld/bolt during assembly, motor start/stop, truck idle/drive/load, furnace blast, sale/research confirmation, blocked action warning, raid alarm. Mix as low-loop layers controlled by visible machine state; avoid loud continuous drones and repeated notifications. Separate global volume from effects/ambient in future settings. Actual audio files must have documented origin/license and tested resource budgets, not invented names.

## Accessibility and performance
Reduced motion preserves state and economic timing with discrete visual stages and text; do not remove essential information. Mute and audio permission do not change game rules. Hidden-tab rendering should throttle/pause GPU while simulation maintains deterministic time. Mobile thermal and GPU budgets require measured tier options; instanced geometry, shared materials, capped device pixel ratio and texture lazy-loads. Screenshot/video evidence must come from running production source, not image-generated marketing footage.

## QA evidence
Capture 60 seconds with cargo travel, at least one building stage sequence and a power/input state change, binding source SHA/seed/viewport/GPU/browser. Audio verification requires an actual listening-capable reviewer; non-audio agent can verify signal routing/mute graph only. No static visual/audio mockup constitutes a working system.
