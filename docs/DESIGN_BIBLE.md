> **Historical baseline:** superseded where incompatible by [Living Voxel World](vision/README.md), mandate #121. Retain useful implementation history; do not schedule old scope or apply obsolete art/performance constraints. New benchmark targets must be measured in P0.

# Rustwake — spirit, style and experiential quality

## Product authority

Read TEAM_CHARTER and PRODUCT_STRATEGY. Owner feedback OWNER-002 reopens overall strategy and visual appeal. Historical scoped approvals remain evidence only. Product owner may evolve this bible with a decision and prospective acceptance; numeric proxy compliance cannot establish polish. Inspect the current immutable build before diagnosing defects from old screenshots.

## North star

A small, beautiful industrial world that gradually comes alive under the player's care. Start with a broken recovery drone and a wreck. Recover material, repair the drone, watch it take over, then turn that flow into machines, equipment and expeditions. It should feel satisfying to touch, watch and hear before it becomes large.

Mobile browser first; React/TypeScript interface; dedicated 2D world renderer; deterministic economy. No page scrolling. No consumer dashboard framing. No dominant neon-green palette. No required live attendance. PvE and optional asynchronous competition give manufacturing a purpose while protecting the home yard.

`GAME_DESIGN.md` contains the detailed systems. This bible defines what their presentation must feel like. A functional implementation may still fail this quality bar.

## Historical baseline (not a current-build diagnosis)

Reviewed source/evidence is anchored to Rustwake `6f42c2faff72e85e08dfb924cf50ad7f1153ef5c` (refresh before implementation if main advances). Repository captures include `latest-mobile.png` and `latest-research-phone.png`. The current rendered world uses geometric primitives and sparse scenery; machine identity relies heavily on similar rectangular bodies. A phone research capture has one node squeezed into a narrow wrapping column. Current `src/game/audio/audio.ts` defines oscillator frequency sweeps; this is functional placeholder audio, not proof of a rich industrial mix. No listening verdict is implied by source review.

The status file's completed M1 label does not override the owner's rejection. Reopen experiential acceptance. Preserve the useful economy, persistence and regression coverage while replacing weak presentation.

## Art direction

Industrial cyberpunk after the collapse: navy concrete, chipped blue-gray steel, warm rust, amber furnace cores, cyan utility light, occasional violet circuitry. Ground, objects, effects and HUD need distinct luminance ranges. Avoid uniformly dim navy-on-navy assets and uniform neon outlines.

Use intentional composition: foreground framing, playable middle ground, distant structures. A salvage yard is a place with perimeter fences, drainage, worn paths, crates, power equipment, cables, shadows, puddles and wreck fragments. These details support navigation and scale; they must not obscure hit areas. The scene must look authored even at the initial three-object stage.

Hide the construction grid at rest. Reveal relevant cells and connection affordances during placement/routing. Do not let the grid become the most visually dominant object. Do not fill empty space with random debris noise; compose a clear focal path from wreck to drone to dock to first machine.

## Actual assets, not indefinite placeholders

Produce consistent sprite assets or comparably deliberate pixel artwork with editable source and export metadata. Canvas rectangles may be scaffolding, not the final acceptance target. Code-generated art is allowed only if it meets the same visual standard; “procedural” is not a quality exemption. Do not merely recolor the existing blocks and mark the art pass done.

First art set: one recognizable vehicle wreck with stripping stages; broken/repaired cargo drone; salvage dock with landing pad; sorter with moving rollers; furnace with readable intake/vent/glow; copper separator, recycler, wire mill, signal lab; floor/perimeter kit; resource icons; compact control icons. Preserve footprint and state schemas while swapping presentation.

Machines must be distinguishable by silhouette in grayscale at normal phone zoom without labels. Furnace: squat thermal chamber and chimney. Sorter: horizontal roller intake and split chutes. Wire mill: paired reels and tension arm. Lab: taller scanner/antenna assembly. Dock: landing outline and loading arm. Drones must have a body, propulsion, cargo attachment and visible orientation; a lone triangle is not accepted final art.

Assets need consistent perspective, light direction, pixel density, palette and shadows. Inspect atlas transparency, seams, padding, pivot, orientation and scaling. Keep a provenance manifest with creator/source/license and export pipeline. Use available image-generation/art tools when they improve the result, but inspect outputs and do not require unavailable paid services to continue. Do not extract art from inspiration games.

## First approved style slice

Build a single representative scene containing the opening wreck, dock, two machines, moving drone, resource collection, build preview and one contextual panel. Reviewer records pass/rework on phone and desktop. Extend the style only after this slice passes; do not generate fifty inconsistent assets first. The slice becomes a reference image set with immutable build provenance, not a permanent substitute for later review.

## Animation grammar

Motion communicates work and cause. A drone has takeoff anticipation, acceleration, banking/heading, controlled landing, loading pause, heavier cargo return and delivery release. Idle hovering alone is not enough. A cutter shows brief anticipation, contact flash, material separation and settling. A working furnace has a bounded pulse/vent cycle; a paused furnace visibly quiets. A sorter stops when starved rather than endlessly pretending to work.

Initial timing experiments: selection feedback within 100 ms; impact 80–140 ms; settle 120–250 ms; compact panel transition 140–220 ms; upgrade assembly 400–800 ms and skippable. These are tuning ranges, not forced delays. Reduced motion removes camera shake, decorative drift and elaborate transitions while preserving state changes.

Rendering interpolates visual motion independently of simulation ticks. Follower tabs must not visibly teleport drones at snapshot cadence. Particle lifetimes and counts are bounded. At least one short real capture of the interaction sequence is required for motion approval; a still screenshot cannot pass this gate.

## Sound direction

Use layered restrained industrial sound: metallic impact plus debris tail for cutting; cargo clink; mechanical repair lock plus motor spin-up; quiet drone motor bed; sorter clatter; furnace rumble/vent; subtle UI clicks and distinct discovery accents. Provide several variations with bounded pitch/gain differences for repetitive cues. Avoid high-pitched pure-tone beeps as the dominant identity.

Build a real bus graph: sources → category bus → master bus → output. In the reviewed code every bus connects directly to destination, so master bus control is not actually a parent mixer. Correct this before claiming independent master mixing. Use envelopes with short attack/decay, rate limits, voice priorities, distance/zoom attenuation and interruption cleanup. Start gesture, mute persistence and hidden-tab suspension remain required.

Ambience and music need actual implemented content and routing; creating empty named buses is not implementation. Quiet rain/room tone and a restrained evolving musical bed should avoid fatigue. No loud auto-playing audio during unattended development. Use offline rendering/loopback capture for technical tests. Listening approval is recorded only when someone or a supported audio-review mechanism actually listened; otherwise label it pending and still improve measurable defects.

## Menus and navigation

The world is primary. Context menus answer: what is this, what is it doing, what can I do next, what does it cost? Use a readable hierarchy, consistent spacing, deliberate icons, clear selected/disabled states and one obvious primary action. Avoid cramming engineering logs into player-facing menus.

The research panel needs full-width node cards or a controlled paged/tree layout with no one-word columns. Do not use a definition-list grid that accidentally treats each research node as a separate alternating cell. Inspect longest labels at 360px, larger text and landscape.

Primary controls remain stable enough for muscle memory. Do not replace every dock action on each resource fluctuation. Recommendations can change in a separate hint; explicit Build, Fleet, Research and Yard contexts remain predictable after unlock. Explain unavailable actions locally. Back/Escape closes the nearest context; all overlays have a visible dismiss target and no popup pile-up.

No document scrolling. Content-heavy overlays paginate or use a deliberate navigable tree. Never satisfy no-scroll by clipping useful content or shrinking text below readability. Minimum essential touch target 44 CSS px; prioritize larger thumb actions. Test both a clean first-time session and mature crowded yard.

## Independent acceptance rubric

Score each category 0–4: 0 broken/absent; 1 placeholder/crude; 2 coherent prototype with obvious defects; 3 polished and consistent in tested contexts; 4 exceptional, validated detail. A numeric score must have evidence and concrete observations.

| Category | Evidence | Rejection examples |
|---|---|---|
| Scene composition | phone/desktop first-frame and mature yard | mostly blank grid; unclear focal action |
| Asset identity | normal zoom, grayscale/silhouette comparison | machines indistinguishable without labels |
| Readability | 360px and enlarged text, all primary panels | one-word columns, clipping, tiny controls |
| Interaction | recorded first-minute path and back navigation | hidden action, shifting control target, unclear cost |
| Motion | real short video/frame sequence | teleporting drones, work animation while blocked |
| Audio | rendered cues + mix graph tests + honest listening status | beep-only identity, harsh overlap, ineffective master |
| State fidelity | running/starved/paused/full examples | decorative animation contradicts economy |
| Performance/accessibility | traces and reduced-motion/keyboard checks | polish breaks touch response or hides essential feedback |

First-feel acceptance requires each observed category ≥3, no critical defect, and reviewer evidence for the actual candidate SHA. Audio listening/real-device/human comprehension may remain explicitly unverified; do not pretend those gates passed. Technical deployment eligibility and complete quality acceptance are separate so useful safe previews can be released while polish continues.

## Reviewer output standard

Describe what is seen/heard/experienced, why it harms the player, the proposed change, measurable acceptance, evidence path and candidate SHA. Reject generic “make it better” tasks. Propose at least one bounded experiment when uncertain. Recheck the result independently; a developer's completion statement is not acceptance.

Do not loop forever on ratings. Once a task passes its scoped criteria, accept it and move to the next highest-value gap. After style is coherent, preserve it as the mechanics grow.


