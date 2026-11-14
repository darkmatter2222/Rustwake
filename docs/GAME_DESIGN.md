> **Historical baseline:** superseded where incompatible by [Living Voxel World](vision/README.md), mandate #121. Retain useful implementation history; do not schedule old scope or apply obsolete art/performance constraints. New benchmark targets must be measured in P0.

# Rustwake game design specification

## The complete game specification and implementation mandate

**Document version:** 1.0, design reset, November 2, 2026.  
**Product:** Rustwake, a mobile-first browser idle salvage, automation, exploration, and asynchronous competition game.  
**Repository state:** Active React implementation. Preserve existing code, saves, tests, and history. The initial design-only reset is historical and must never be repeated.  
**Primary instruction:** Build a game that feels good to touch, watch, hear, understand, and return to. Do not build another consumer website with a small game embedded in it.

This file is `docs/GAME_DESIGN.md`. It preserves the detailed game mechanics and long-term design. `docs/DESIGN_BIBLE.md` owns current art direction and experiential quality; `goal.md` owns agent execution; `docs/AGENT_WORKFLOW.md` owns concurrency and integration. Those execution documents supersede old single-agent cadence examples in this specification. It contains concrete starting rules, numerical hypotheses, examples, content definitions, acceptance criteria, and staged delivery instructions. It does not claim that a commercial game, a sustainable economy, or years of retention have already been validated.

Read this document in order before implementing. A feature is not complete merely because its button exists. Follow the player journey, simulate its economy, implement its failure cases, and verify its behavior on a narrow touch screen. Where this document labels a value as a tuning parameter, use the stated default until evidence justifies a documented change. Where it labels a feature as a later milestone, do not quietly substitute a nonfunctional menu for it.

### Authority and terminology

- **Committed requirement:** Directly established by the product direction or the rejection of the first prototype. Do not change without revisiting the design.
- **Design default:** A concrete recommended choice that makes implementation possible. Validate through playtesting; change this document when changing the rule.
- **Tuning value:** A provisional number, never a proven retention or monetization result.
- **Future system:** Required by the long-term vision but excluded from the first playable slice.
- **Open decision:** A specific unresolved choice with a test or owner decision needed before commitment.
- **Must:** Required for the milestone in which the feature belongs.
- **Should:** Strong preference with room for a justified alternative.
- **May:** Optional enhancement; it must not weaken the core experience.

The design defaults below fill in details that were not individually approved in conversation. They are proposals recorded as a coherent baseline, not invented user quotations. In conflicts, explicit user instructions outrank this document. Inside the document, committed requirements outrank content examples and tuning tables.

## Contents

1. Product identity and nonnegotiables
2. Why the first prototype failed
3. Player fantasy and session structure
4. The first ten minutes
5. Full-screen presentation and navigation
6. Touch, camera, accessibility, and interaction
7. Salvage, wrecks, and material recovery
8. Inventory, currencies, and economic rules
9. Machines, recipes, and factory construction
10. Logistics, power, storage, and bottlenecks
11. Drones, equipment, and automation policies
12. Progression, research, and permanent growth
13. World map, expeditions, and procedural generation
14. PvE and deterministic combat
15. Factions, characters, and narrative
16. PvP, NPC competition, and seasons
17. Crews, community projects, and Twitch
18. Idle behavior, offline progress, and return experience
19. Monetization and entitlements
20. Pixel art, animation, VFX, audio, and atmosphere
21. Architecture, performance, simulation, and networking
22. Persistence, accounts, security, and reliability
23. Data models and content pipeline
24. Balancing, analytics, and experimentation
25. Quality gates and acceptance tests
26. Delivery roadmap and implementation instructions
27. Launch content catalog
28. Worked scenarios and edge-case rules
29. Open decisions and change control
30. Final definition of done

---

# 1. Product identity and nonnegotiables

## 1.1 The one-sentence promise

**Turn the wreckage of a forgotten automated civilization into a living industrial empire, one satisfying recovery at a time.**

The player begins with a damaged drone and a small salvage yard. They manually recover a little scrap, repair the drone, automate collection, build processing machines, manufacture equipment, explore dangerous ruins, specialize their operation, and eventually contribute to projects far beyond a single yard.

The game can occupy two attentive minutes or run quietly beside another activity. Watching is enjoyable, but constant watching is not necessary. The player should be able to glance over and see what their machines are doing without reading a dashboard.

## 1.2 Committed requirements

1. Browser-first, including mobile browsers. No Android or iOS application is required to play.
2. Possible native shells later; wrappers must not dictate the initial architecture.
3. High performance and restrained battery use are first-class requirements.
4. A 2D pixel-art industrial cyberpunk identity.
5. Salvage, scrap, metals, drones, manufacturing, and automation are central mechanics.
6. Multiple currencies and long-term growth, with clear reasons for each currency.
7. Idle progression with meaningful active planning.
8. PvE and optional player competition, plus asynchronous community play.
9. A game that can work as an ambient companion to another game or a Twitch stream.
10. Commercial potential through in-game purchases without making the economy incoherent.
11. No page scrolling during normal gameplay. The whole experience fits the available viewport.
12. Immediate understanding of what to do, demonstrated through interaction.
13. Sound, tactile visual feedback, and animation as part of the loop.
14. No consumer-website shell, permanent business-dashboard sidebar, or giant resource header.
15. No copying art, names, text, maps, or code from the games that inspired the concept.

## 1.3 Design defaults

- Top-down world with a slight view of machine top surfaces. Use consistent 2D sprites, not a rotatable 3D camera.
- Grid-based machine placement under a visually organic yard. The grid appears when needed.
- Home yard protected from involuntary destruction, theft, and PvP attacks.
- Expandable sector map for exploration rather than an enormous walkable character world.
- Simulated logistics at an aggregate level; moving cargo visuals represent throughput.
- No rigid-body physics dependency. Debris, smoke, recoil, sparks, and bounce are visual effects.
- Contextual radial/compact actions, paged overlays, and a bottom thumb-accessible action dock.
- First session begins directly in the world with a short start/resume gate, not a marketing page.
- Single-player prototype first; server-authoritative online economy before ranked play or purchases.
- Cosmetic-focused monetization. No purchasable ranked advantage.

## 1.4 What endless growth means

Rustwake has no single final screen that says all meaningful play is finished. It does not promise mathematically infinite authored content. Growth combines repeatable production, expanding districts, new material properties, alternative processing strategies, equipment combinations, permanent progression, seasonal challenges, and cooperative goals.

Numbers alone are not content. An upgrade that changes 1,000 scrap to 1,100 scrap is useful as a short-term reward, but it cannot carry years of interest by itself. Larger progression milestones should open a new choice: a different recipe, an extra drone role, a different resource constraint, a new district condition, or a new way to contribute to a crew.

A healthy mature account can still have small satisfying upgrades, a medium-term construction plan, and one distant ambition. The game must not require all three to finish on a strict timer.

# 2. Why the first prototype failed

The rejected prototype placed a canvas inside a scrolling management interface. It exposed resource counters, navigation, machine cards, research, and expeditions before teaching the player what any of them meant. It was quiet, visually sparse, and required the player to move around a webpage to understand their operation.

The reset does not approve merely hiding the browser scrollbar. The underlying layout and interaction hierarchy must change.

| Failure | Required correction | Evidence of success |
|---|---|---|
| Whole page scrolls | Viewport-sized game surface with bounded overlays | No vertical or horizontal document scroll at supported sizes |
| Too many unexplained systems | Teach one action through the world | New player collects scrap without external instructions |
| Looks like a website | World-first scene and diegetic HUD | First screenshot is recognizable as a game |
| No sound | Contextual audio after a user gesture | Collection, repair, machine operation, and upgrades have distinct feedback |
| Factory feels abstract | Visible drone-to-wreck-to-dock movement | Player can explain where incoming scrap comes from |
| Buttons precede understanding | Introduce actions at the moment of need | Every unlocked button has an immediately understandable use |
| Tiny canvas and large chrome | Scene occupies most of the viewport | Player can select objects comfortably on a phone |
| Simulated features look real | No fake multiplayer, fake belts, or fake rankings | Every visible functional system has actual rules and state |

Old code can inform tests or technical learning, but it is not a visual template. Do not restore the old interface because it is convenient.

# 3. Player fantasy and session structure

## 3.1 Who the player is

The player is the operator of a small independent recovery outfit, initially designated Yard 07. They are resourceful rather than chosen by prophecy. Their identity emerges from their machines, drone fleet, preferred salvage methods, reputation, and visual customization.

They do not spend the whole game controlling a walking avatar. Their agency is directing work: point at a wreck, assign a drone, connect a processor, set a policy, prepare an expedition, and choose which discoveries to preserve.

## 3.2 Three play modes

**Focused play:** The player constructs, reconfigures, compares equipment, solves a bottleneck, and pushes into a new sector. Expected session length is flexible, initially designed around 5–20 minutes.

**Ambient play:** The player leaves a compact world view running while doing something else. Production continues at the same economic rate. Ambient mode lowers animation workload, minimizes UI, suppresses nonessential announcements, and does not require clicking collection prompts.

**Away:** The game closes or suspends. The authoritative simulation advances eligible policies under the offline rules. A return report explains results without requiring hundreds of reward taps.

None of these modes should be a deliberately inefficient punishment. Active planning can improve a system, and optional active salvage can provide a small bounded benefit, but repeatedly tapping all day must not outproduce a well-built factory by an order of magnitude.

## 3.3 Session goals

A two-minute visit should permit one useful choice and one satisfying observation. Examples: upgrade a weak cutter; redirect copper; launch a known route; claim a milestone; watch a restored drone take its first flight.

A longer visit should offer an optimization puzzle. Examples: route around a congested freight junction; choose between repairing a generator and selling its rare parts; tune a salvage squad for an electrical hazard; prepare an equal-budget race entry.

A returning player should see what changed since leaving, what is blocked, and one suggested next action. They should not encounter five overlapping offers before seeing their yard.

# 4. The first ten minutes

## 4.1 Starting scene

Fade from black into a small wet industrial clearing. A damaged recovery drone sits beside a dock. A compact wreck is nearby. A distant transformer hum and occasional metal creak establish the world once audio is permitted.

The player sees a short title treatment, **RUSTWAKE**, with **Begin recovery**. Pressing it initializes permitted audio and enters the scene. An unobtrusive mute control is visible immediately. Never imply that audio autoplay is guaranteed before a user gesture.

There are no account registration requirements, monetization offers, faction essays, or dense HUD counters before the first interaction. A guest local session is available; an online identity prompt can appear later at a natural save boundary.

## 4.2 Tutorial state machine

| State | Visible goal | Trigger | Result | Recovery if interrupted |
|---|---|---|---|---|
| T0 Arrival | Tap the highlighted wreck | First successful tap | +5 tutorial scrap, small debris and sound | Restore scene and same target |
| T1 First recovery | Salvage enough to repair the drone | Six successful manual collections total | 30 scrap available | Persist collection count and stock |
| T2 Repair | Repair your recovery drone · 30 scrap | Confirm repair | Drone activates and flies to wreck | Transaction applied once |
| T3 Observe | Your drone now works for you | First autonomous delivery | Rate and cargo explained in one line | Do not restart repair |
| T4 Processing | Build a sorter · 20 scrap | Enter placement and confirm | Ghost snaps, machine assembles, cargo route introduced | Cancel returns full reservation |
| T5 Connection | Connect dock to sorter | Valid short route | Visible cargo movement and separated metal | Restore incomplete route preview only as UI, not spending |
| T6 Purpose | Refine metal into trade goods | Build starter furnace | First export credits arrive | Materials remain protected until action is possible |
| T7 Choice | Improve recovery or production | Choose any suggested upgrade | Tutorial guidance becomes optional | Either branch is valid |
| T8 Frontier | Investigate a nearby signal | Dispatch safe recovery | First expedition and return report | Mission resumes exactly once |
| T9 Independent | Choose your next goal | Dismiss completion prompt | Full early-game loop available | Never force tutorial repetition |

Tutorial transitions are driven by authoritative state, not fragile animation callbacks. Skipping an animation must not skip a reward, double-charge a machine, or prevent completion.

## 4.3 Concrete starter economy

These are tutorial tuning values, isolated from the old prototype:

- Begin with zero scrap, zero credits, and a broken starter drone.
- Manual interaction awards 5 tutorial scrap per completed interaction, with a 0.6-second feedback cycle. No multi-finger multiplier.
- Six interactions provide exactly the 30 scrap required for repair.
- Tutorial wreck replenishes visibly and cannot become exhausted before automation is established.
- Repaired drone produces 1 scrap per second on the starter route, in 5-unit deliveries every 5 seconds.
- Starter sorter costs 20 scrap; it consumes 2 scrap and produces 1 ferrous fragment plus 1 nonferrous fragment per 4-second cycle.
- Starter furnace costs 10 scrap and 5 ferrous fragments; it consumes 2 ferrous fragments and produces 1 steel unit every 4 seconds.
- Starter export contract buys the first 3 steel units for 30 credits. This is a one-time onboarding contract, not a permanent unlimited exchange rate.
- The first ordinary upgrade is affordable with those 30 credits.
- Starter machine construction and drone repair cannot consume mission-critical material in a way that strands the account. Reserve tutorial resources or constrain unrelated spending until T6.

Expected timings are hypotheses: first salvage within 10 seconds after entering, first repaired drone within 30–60 seconds, first automated delivery immediately afterward, and first processing chain within several minutes. Observe actual users rather than forcing a timer-driven script.

## 4.4 Teaching language

Use short concrete verbs: **Salvage**, **Repair**, **Build**, **Connect**, **Send**, **Upgrade**. Avoid opening instructions such as “optimize throughput” or “configure extraction policies.” Explain those concepts through the first blockage.

A stalled sorter says **Needs scrap** and points to its empty input. A full dock says **Cargo full** and offers **Connect storage**. A slow route shows a small queue and says **Route at capacity**. A tutorial prompt must describe the visible condition rather than a hidden formula.

## 4.5 Optional help

A persistent small help action opens a single current-objective card with **Show me**, **Explain**, and **Close**. “Show me” moves the camera and highlights the relevant object without completing the action. Help remains available after onboarding.

If a player skips guidance, expose the tutorial replay through settings. Replaying guidance does not grant its one-time rewards again. Existing saves resume their actual progression state rather than forcing a new start after a content update.

# 5. Full-screen presentation and navigation

## 5.1 Viewport contract

The game root occupies the available visual viewport. Use dynamic viewport units and safe-area insets, with a tested fallback. The document body must not scroll. Expanding browser address bars, changing orientation, and opening a soft keyboard must not hide essential controls beneath the viewport.

Normal gameplay, machine inspection, construction, inventory, research, map navigation, settings, and store interactions use bounded panels. Long lists are paged or filtered. Do not solve overflow by introducing a full-page scrollbar. Long legal/support documents may open a separate external page; they are not part of gameplay.

On-screen logs show a bounded recent selection. Full history is paginated or exportable. A content list that grows without bound must have search and deterministic paging.

## 5.2 Scene composition

**Portrait default:** World behind everything; compact top-left resources; top-right pause/audio/settings cluster; objective just below the top safe area; bottom action dock; a contextual panel rises above the dock when needed.

**Landscape and desktop:** The same world-first composition, with additional horizontal breathing room. Context panels may occupy a narrow edge, but no permanent administrative sidebar. Do not stretch all controls across a 4K monitor; use sensible maximum widths and preserve view of the world.

At rest, HUD should occupy roughly 15–22% of the screen area as a design target. An inspection panel may temporarily take more space. It must be dismissible and should not conceal the selected object without moving the camera to compensate.

## 5.3 HUD layers

1. World and environmental background.
2. Machines, drones, cargo, and shadows.
3. Selection indicators and purposeful overlays.
4. Sparse status labels and floating rewards.
5. Main HUD and action dock.
6. Contextual panel.
7. One modal confirmation or blocking message.

Only one modal dialog at a time. Queue other messages and collapse repeated events into summaries. Do not allow a monetization offer to interrupt an expedition outcome or a tutorial action.

## 5.4 Resources shown

Initially show scrap only. Reveal credits when the first trade occurs, then show the most relevant three resources. A compact inventory button opens a paged resource sheet. Contextual costs automatically show required materials even when not pinned.

Players can pin a small number of resources, default three on portrait and five on wide screens. Do not make all currencies permanently occupy the top row. Show exact values on inspection; abbreviate large totals consistently in the HUD.

## 5.5 Navigation

The bottom dock initially contains **Yard** and a contextual action. Unlock **Build**, **Frontier**, **Research**, and **Crew** only when available. On narrow screens use no more than five primary targets, including a **More** action if necessary.

Build mode replaces the ordinary dock with a short category strip, a paged blueprint picker, rotate, confirm, and cancel. Research opens a navigable tree inside its own viewport. Frontier opens the sector map as a game scene rather than a webpage of cards.

Back/Escape closes the most local context first: tooltip, object panel, build mode, map detail, then optional pause menu. Browser history must not accidentally abandon a session for routine panel dismissal. Respect expected browser navigation when genuinely leaving the application.

# 6. Touch, camera, accessibility, and interaction

## 6.1 Gestures

- Tap an object: select it and expose its available action.
- Tap a highlighted manual salvage target: perform a recovery interaction.
- Drag empty ground: pan the camera.
- Pinch: zoom within useful bounds.
- Tap an empty placement cell while building: position the ghost.
- Drag a connector from a selected port: create route preview.
- Long-press: optional quick information, never the only route to an essential action.
- Two-finger movement must not accidentally place or dismantle a machine.

Use an initial movement threshold of approximately 8 CSS pixels to distinguish tap from pan, then test across device densities. A canceled pointer sequence commits no build. A pointer ending outside the canvas does not apply a remembered stale target.

## 6.2 Target sizes

Essential UI controls target at least 44 × 44 CSS pixels. World objects can be visually smaller, but their selection hit regions must remain practical and disambiguate overlaps. Minimum zoom for editing should keep a cell at least about 40 CSS pixels. Wider overview zoom is allowed, but tapping there should zoom/select rather than accidentally execute an irreversible action.

At low zoom, aggregate icons identify production clusters. Tiny sprite taps must not be required for precision editing. Provide **Select nearby** or a paged machine list as an alternative when objects overlap.

## 6.3 Placement feedback

A valid ghost uses a clear outline plus checkmark. Invalid placement uses a different outline plus reason text, not color alone. Reasons include occupied tile, inaccessible route, protected starting zone, insufficient space, or locked district.

The player sees cost before confirmation. Placement reserves nothing until confirm unless a server reservation is explicitly needed; reservations must expire and release safely. Rotation and movement previews do not alter the live machine until committed.

## 6.4 Accessibility

HUD, context actions, and dialogs should use semantic accessible controls. Canvas interactions need an equivalent machine selector, build-location selector, route endpoint picker, and current-objective description. These are real functional alternatives, not hidden decorative labels.

Support keyboard navigation, visible focus, reduced motion, adjustable text scale, independent audio controls, high-contrast selection outlines, and color-independent statuses. Avoid essential rapid flashing. Do not convey danger solely through sound or a red tint.

At larger text settings, reduce nonessential simultaneous HUD elements and paginate panels. Do not shrink text to preserve a screenshot. Readable text and actionable controls take priority over decoration.

## 6.5 Camera behavior

Camera movement should be smooth, bounded, and interruptible. Automatically highlighting a goal should not override a player’s active drag. Return from a map or panel to the previous camera position. A **Home** button returns to the active production cluster.

When a machine is selected near an edge, subtly pan to keep it visible above the inspection panel. Do not zoom unexpectedly every time the player collects a resource. Camera shake defaults to subtle and can be disabled completely.

# 7. Salvage, wrecks, and material recovery

## 7.1 Wreck anatomy

A wreck is a content-defined recoverable object, not an unlimited loot chest with arbitrary rewards. Each wreck instance has a stable identity, archetype, location, condition, material composition, salvage work requirement, hazard tags, discovery seed, ownership/claim state, and remaining recoverable quantities.

A small vehicle might contain ferrous fragments, nonferrous fragments, polymer residue, a damaged motor, and one encrypted controller. The player sees a coarse scan initially; better scanners reveal more detail. Unknown information is marked as unknown, not displayed as a precise number that later changes without explanation.

The same wreck cannot be harvested twice because two tabs submitted the same action. Each extraction reduces a bounded remaining pool in an authoritative transaction. The visual wreck transitions through intact, opened, partly stripped, frame-only, and exhausted states.

## 7.2 Material mass and yield

Use **cargo units** as the abstract material unit; do not call every game quantity a kilogram unless the recipe conserves physical mass. Recipes may produce waste, emissions, or unrecoverable residue, recorded explicitly in the balance model. Rare technology is an item discovery separate from bulk mass.

For a recoverable material pool `M`, salvage tool efficiency `e` is initially clamped between 0.50 and 0.95. Recoverable quantity is `floor(M × e)` with remainder rules fixed per wreck. Efficiency improvements reduce loss, not create infinite matter. Work speed determines how quickly the pool is processed; cargo capacity determines how much can be carried before returning.

Once a wreck is scanned and its reward seed committed, reopening the interface cannot reroll it. Equipment changes may change recoverable yield through an explicit formula, but must not generate new rare rolls on every cancellation.

## 7.3 Manual salvage

Manual salvage teaches causality and provides a small optional interaction. After the tutorial, a manual action charges a short cutting pulse on a selected accessible wreck. A short completion animation awards the corresponding portion of the same finite salvage pool. It does not create extra resources outside that pool.

Avoid a permanent “tap as fast as possible” metagame. No uncapped per-click production multiplier. The player can enable an accessibility hold-to-repeat option at the same designed cadence. Multi-touch and macro repetition must not exceed the same authoritative rate.

After automation, an optional active pulse may give a small temporary work-speed boost on one operation. Default cap: at most 10% additional salvage work over a 10-minute window. This is a testable tuning hypothesis, not a paid boost. If it becomes an obligation, remove it.

## 7.4 Dismantle, restore, or sell

Major recovered objects present three choices:

- **Dismantle:** Predictable immediate materials; destroyed item cannot later be restored.
- **Restore:** Spend parts and processing time to obtain equipment or an installed machine.
- **Sell:** Receive credits from a visible offer; no mystery conversion.

Show a comparison before committing. Include salvage output range if some composition remains unknown. In the tutorial, use a fixed object and fixed outputs to teach this decision without gambling.

An item undergoing restoration is reserved and cannot be sold, equipped, or dismantled simultaneously. Cancellation returns unused inputs but not work already consumed, according to a displayed rule. In the earliest release, prefer full refunds before completion to avoid bookkeeping ambiguity; enable partial-progress costs only after the state model supports them.

## 7.5 Salvage policies

Later automation allows policies such as **Keep first intact motor**, **Dismantle duplicates**, **Reserve 50 copper**, **Prefer electronics**, and **Return when cargo reaches 90%**. Policies must be inspectable, prioritized, and reversible.

Default never automatically destroys a unique story item, equipped component, locked favorite, or newly discovered blueprint. A “new item” hold queue preserves such objects until the player establishes a policy. Storage pressure should pause recovery instead of silently deleting rare items.

# 8. Inventory, currencies, and economic rules

## 8.1 Distinguish currencies from resources

| Type | Name | Earned from | Spent on | Persistence |
|---|---|---|---|---|
| Soft currency | Credits | Contracts, exports, recovery rewards | Construction services, upgrades, dispatch fees | Yard/run scoped when prestige is introduced |
| Research currency | Data | Signal analysis, scans, milestones | Research nodes and technology branches | Split permanent/unspent rules shown at prestige |
| Prestige currency | Reactor cores | Qualified district founding/reset milestones | Permanent infrastructure choices | Account permanent |
| Social currency | Crew merits | Capped verified contribution | Cosmetic crew rewards and noncompetitive utilities | Account/season rules explicit |
| Premium currency | Marks | Optional purchased packs and specified earned grants | Cosmetics only at launch | Account permanent; never erased by reset |
| Bulk resources | Scrap, fragments, steel, copper, alloys, polymers | Recovery and processing | Recipes, construction, equipment | Physical storage/inventory rules |
| Item inventory | Motors, modules, blueprints, relics | Discoveries and crafted items | Restore, equip, learn, trade with NPCs | Per-item persistence flags |

Premium Marks are a future commercial system, not required for the prototype. Do not create a fake purchase button or simulated paid balance. No opaque exchange chain from real money through several currencies to hide a price.

## 8.2 Inventory locations

Materials can exist at source storage, in a reserved machine batch, in transit, in destination storage, or in an expedition cargo hold. These are distinct locations in the ledger. The UI may display a total owned amount, but affordability must use quantities accessible to the relevant transaction.

A resource cannot be counted as both stored and in transit. Reservations reduce available quantity while keeping owned total understandable. A canceled command releases its reservation exactly once. Credits are a ledger balance and do not occupy warehouse tiles.

## 8.3 Capacity

Starter dock storage should cover at least a useful early idle session; target 15–30 minutes of its initial output, then tune. Early progression should not require returning every three minutes to clear storage. Bulk storage upgrades add capacity. Item slots are separate from bulk units and never share a confusing common cap.

When full, halt upstream work or route to another available store. Do not automatically sell items unless an explicit policy authorizes it. Do not destroy output. Show **Paused: storage full** on affected machines. A collection summary should explain production lost to capacity without shaming the player.

## 8.4 Sources and sinks

Every resource definition lists sources and sinks. Credits enter through bounded contracts and ordinary NPC trade. Credits leave through construction, upgrades, dispatch fees, services, and optional cosmetic NPC decorations. Bulk materials leave through crafting, construction, restoration, and explicitly defined losses.

Export prices are content-defined, not a hidden live market in the first release. A repeatable export contract must have a throughput-limited supply chain; free buy/sell loops must not exist. If multiple conversions form a cycle, the product of conversion values after costs must not produce unbounded profit without time, risk, or another limiting resource.

## 8.5 Numeric representation

Use integer base units or fixed-point values for economic transactions. Specify rounding once at the boundary, not separately in UI and server. Resource numbers must be finite, nonnegative, serializable, and stable across platforms. Never permit NaN, Infinity, negative stock, or unsafe integer overflow to enter persisted state.

For very large idle numbers, introduce a tested decimal or mantissa/exponent representation before the ordinary numeric range becomes unsafe. Preserve exact entitlement counts, inventory IDs, and transactional currency units even if presentation uses scientific notation. Do not convert the entire economy to floating-point approximations merely for suffix formatting.

## 8.6 Price curves and upgrade math

Ordinary machine upgrade cost default:

`cost(level → level+1) = ceil(baseUpgradeCost × 1.16^(level−1))`

Ordinary rate default within a tier:

`rateMultiplier(level) = 1 + 0.10 × (level−1)`

At selected milestones, a tier upgrade can unlock a new recipe or module slot, not only more rate. Inputs and outputs scale together unless a specific efficiency technology changes input demand. State which quantity an upgrade changes: speed, yield, power draw, buffer capacity, or module flexibility.

These curves differ from the discarded prototype and are starting hypotheses. Balance them in simulation and playtests. Avoid multiplicative stacks where many independent 20% bonuses silently compound into a dominant build. Group additive bonuses by category, then multiply categories in a documented order.

# 9. Machines, recipes, and factory construction

## 9.1 Machine lifecycle

Blueprint known → affordable preview → placement ghost → committed construction → ready → running/idle/starved/full/paused → upgraded/moved/dismantled.

Construction consumes its costs once. Initial construction is immediate with a short visual assembly animation; do not use paid skip timers. Later megaprojects can require actual ongoing production contributions, which is a gameplay objective rather than an arbitrary mobile-game wait wall.

Moving a machine costs no currency in early releases. Moving pauses its work, preserves its identity, level, modules, and committed batch, and revalidates routes. A blocked destination leaves the original position intact. Dismantling ordinary machines uses a visible refund, default 100% base construction materials and no upgrade-service refund; evaluate whether a more forgiving refund improves experimentation. Equipped rare modules return to inventory if capacity exists, otherwise prevent the dismantle transaction until a destination is selected.

## 9.2 Placement model

Initial usable yard is a modest contiguous area, proposed 6 × 6 cells, with decorative border scenery. Most starter machines occupy one cell. Larger machines occupy multiple cells with explicitly defined ports. Tiles outside the yard are scenery until expanded. Expansion purchases or salvage objectives unlock adjacent plot groups, not an infinite blank grid at the start.

Rotation changes port orientation and sprite orientation if supported. It never changes a recipe silently. A building footprint cannot intersect a protected dock path, another footprint, or an impassable terrain object. Visual overhang does not necessarily occupy a functional tile; the blueprint declares footprint and render bounds separately.

## 9.3 Recipe catalog: first industrial tier

The following production recipes are proposed balance data. Tutorial grants are explicitly separate. Durations assume full power, available inputs, and no transport bottleneck.

| ID | Machine | Inputs | Outputs | Cycle | Power units |
|---|---|---|---|---:|---:|
| R01 | Scrap sorter | 2 mixed scrap | 1 ferrous fragment, 1 nonferrous fragment | 4 s | 1 |
| R02 | Furnace | 2 ferrous fragments | 1 steel | 4 s | 2 |
| R03 | Copper separator | 2 nonferrous fragments | 1 copper, 1 residue | 5 s | 2 |
| R04 | Polymer recycler | 3 residue | 1 polymer | 6 s | 1 |
| R05 | Wire mill | 1 copper | 3 wire | 4 s | 2 |
| R06 | Plate press | 2 steel | 3 plates | 5 s | 3 |
| R07 | Circuit assembler | 2 wire, 1 polymer | 1 circuit | 8 s | 3 |
| R08 | Motor bench | 2 steel, 2 wire | 1 motor | 12 s | 3 |
| R09 | Battery bench | 1 copper, 1 polymer, 1 steel | 1 battery pack | 12 s | 3 |
| R10 | Drone assembler | 3 plates, 2 motors, 2 circuits, 1 battery pack | 1 basic drone chassis | 30 s | 5 |
| R11 | Signal lab | 1 circuit | 2 data | 15 s | 2 |
| R12 | Alloy furnace | 3 steel, 1 advanced additive | 2 reinforced alloy | 12 s | 5 |

“Power units” are an abstract budget for simulation and UI, not a claim about real kilowatts. Recipe quantities are cargo/count abstractions. Do not show physically impossible mass conservation as scientific realism.

## 9.4 Machine controls

Tap a machine to show its name, state, current batch progress, inputs, outputs, actual recent rate, maximum rate, and a single primary recommended action. Expand into secondary actions for recipes, modules, movement, priority, and dismantling. Keep this within paged bounded panels.

Recent rate is measured over a defined window, initially 60 seconds or all available time for a new machine. Maximum rate assumes uninterrupted operation and is labeled accordingly. Do not present a theoretical maximum as actual earnings.

## 9.5 Batch semantics

Reserve a batch’s required inputs when the batch starts. Consume them and commit outputs atomically at completion under the chosen batch model. If power drops, progress slows or pauses; inputs remain reserved. Output capacity must be available at completion, otherwise the finished batch waits without duplicating goods or starting another batch.

For deterministic behavior, define event order for simultaneous completions: finish eligible batches; enqueue cargo; settle arriving cargo; allocate shared resources fairly; start next batches; advance mission and contract events. The actual engine may use a different equivalent ordering, but it must be explicit and tested. No insertion-order favoritism masquerading as fair logistics.

## 9.6 Machine modules

Later modules affect a narrow role: faster processing with more power demand, improved material recovery with slower cycles, larger buffer, lower noise/hazard, or recipe flexibility. The first module slot arrives after the player understands the base machine.

Modules should have tradeoffs. Avoid universal best-in-slot modules that only add every desirable stat. Module removal is free in the yard and safe outside an active competitive lock. A locked race entry uses an immutable equipment snapshot.

# 10. Logistics, power, storage, and bottlenecks

## 10.1 Transport belongs to gameplay

A visible conveyor must represent a functional connection. The first playable slice may use one simplified dock-to-sorter route, but it must actually control where resources flow. Do not render decorative belts that imply nonexistent logistics rules.

Player route creation: select output port, drag/tap destination input, show auto-routed path, confirm. Obstacles and throughput are visible. Allow manual waypoint adjustment after the first automatic path is understandable. Do not make the first route require underground crossings, combinators, or complex junction logic.

## 10.2 Aggregate route simulation

Each route has capacity per second, travel latency, supported resource filters, input and output buffers, and a stable ID. The engine transfers quantities in batches or events. Individual sprites are samples of cargo movement; a thousand items need not imply a thousand physics bodies or DOM elements.

Store enough information to represent in-flight goods correctly. If a route is removed, cargo returns to its source or a designated recovery buffer through a deterministic transaction; do not silently disappear it. If the destination is full, cargo waits within bounded route capacity and upstream production eventually pauses.

## 10.3 Splitting and priority

A source feeding two consumers defaults to equal weighted allocation among eligible requests. User-defined priority is a later optional control. A cycle such as A→B→A must not create material or infinite zero-time events. Detect deadlocks and report the involved missing resource or blocked capacity.

Simple fair allocation example: 10 copper available, two consumers request 8 each, equal weights. Allocate 5 each, with integer remainders assigned by stable round-robin order. A consumer unable to use its share releases it for the next allocation step. Save allocator state if its rotation affects determinism.

## 10.4 Shared services

Early electricity is shared across a connected yard so the player can learn material logistics without also wiring every building. Later power zones and substations can create a meaningful expansion puzzle. No mandatory wire spaghetti in the tutorial.

If available power is below requested power, distribute proportionally among active machines by default, then offer priority groups later. UI says **Power limited: 72% speed**, not merely “offline.” Renewable or fuel generators must expose their own fuel/charge constraints. The starter recovery loop cannot depend on fuel that only a powered machine can make without a protected starting reserve.

## 10.5 Bottleneck guidance

A bottleneck assistant reports evidence: storage occupancy, input starvation duration, route utilization, power ratio, and consumer demand. It recommends one action, such as **Your sorter waits for scrap 40% of the time. Add a recovery drone or upgrade the dock.**

Do not always recommend a purchase or the most expensive upgrade. Explain when adding a machine would worsen contention. A smart recommendation can suggest pausing an export furnace to reserve steel for a drone.

# 11. Drones, equipment, and automation policies

## 11.1 Drone roles

| Role | Core strength | Tradeoff | Main use |
|---|---|---|---|
| Scout | Scan speed and hazard discovery | Low cargo and durability | Reveal sectors and identify valuable targets |
| Cutter | Salvage work rate | Higher energy use | Open dense wrecks |
| Hauler | Cargo capacity | Low maneuverability | Move bulk material efficiently |
| Escort | Protection and interception | Consumes squad budget without much salvage capacity | Dangerous expeditions |
| Technician | Repair, recovery yield, hacking | Slower direct extraction | Restore equipment and bypass security |

A player starts with a generalist recovery drone. Specialization appears gradually. A “rarer” drone should not always dominate every role; hull budget, equipment slots, and operating costs preserve choices.

## 11.2 Equipment slots

Early expedition drones use one tool, one utility, and one defensive slot. Later hulls can redistribute capacity, but fixed budget modes constrain total equipment rating. Stats include work rate, capacity, travel speed, energy reserve, armor, scanner resolution, and hazard resistance.

The UI translates stats into estimated mission consequences: expected recovery duration, cargo fill, risk band, and known countermeasures. Do not require the player to reverse-engineer hidden formulas from lore descriptions.

## 11.3 Drone damage and loss

Home-yard drones cannot be permanently destroyed by ambient threats. Expedition damage creates repair downtime and material costs, with clear previews. Default ordinary PvE defeat disables and recovers a drone rather than deleting an account’s only worker. A recovery tow may cost credits capped relative to expected income, or use a free slow fallback.

Riskier optional modes may lose expedition cargo, but never premium cosmetics or account identity items. Permadeath is not an initial design requirement. If later introduced, it must be explicit, opt-in, and isolated from the core idle progression.

## 11.4 Automation rules

Policies are finite, inspectable condition/action rules, not arbitrary player JavaScript. Example: if copper stock is below 50, prioritize nonferrous wrecks; otherwise use mixed recovery. Each rule has priority, cooldown, eligible targets, and resource reserve floor.

Prevent oscillation: use hysteresis, such as switching away from copper recovery only after reaching 80 rather than immediately at 50. Policies must not repeatedly dispatch and recall the same mission. Add a policy preview showing what would happen with current state.

Offline automation obeys the same unlocked rules and budget limits. It never accepts a newly risky contract, spends premium currency, changes PvP opt-in, or dismantles protected items without an explicit preexisting policy.

# 12. Progression, research, and permanent growth

## 12.1 Progression layers

Immediate: collections, batches, feedback. Short: upgrades and route fixes. Session: new machine, expedition, contract. Medium: district expansion, technology branch, specialized fleet. Long: founding a new operation, permanent infrastructure, rare blueprint collections. Social: crew projects, seasonal races, community discoveries.

Every layer needs visible milestones. A large distant goal should show meaningful intermediate contributions. Do not add fifteen concurrent progress bars to the main HUD; expose the selected goal and let the player inspect the rest.

## 12.2 Research structure

Research is a graph with prerequisites, costs, unlock effects, and exclusions where appropriate. Early nodes form a short clear path. Branches appear after the basic loop is established.

Proposed branches:

- Recovery: scan quality, cutting efficiency, cargo handling.
- Processing: alternative recipes, sorting precision, lower waste.
- Logistics: route capacity, smart buffers, allocation policies.
- Power: efficient motors, batteries, district substations.
- Frontier: hazard protection, escort tactics, long-distance access.
- Reconstruction: restoration, unique machinery, district founding.

A node’s exact effect is visible before purchase. Research cannot deduct currency if prerequisites changed or a duplicate request arrives. Refund/respec policy must be explicit; default allow ordinary specialization respec for an affordable soft cost, with a free introductory respec.

## 12.3 Prestige: founding another operation

The fiction is establishing a new district with knowledge and infrastructure from the old one. It should feel like expansion, not deleting progress for a multiplier.

Proposed first eligibility: complete a named reconstruction milestone plus a minimum qualified lifetime production value in the current run. Example yield formula for tuning:

`totalEligibleCores = floor(sqrt(qualifiedRunValue / 10,000))`

`coresOnFounding = max(0, totalEligibleCores − coresAlreadyGrantedForThisRun)`

Define qualified value from validated production and first-time objective rewards, excluding purchased currency, refund loops, player transfers, and repeated buy/sell churn. Eligibility and core yield are computed authoritatively. Show the complete before/after comparison.

Reset: ordinary yard inventory, current construction, run-specific missions, and temporary bonuses. Retain: account cosmetics, premium balances, accessibility settings, discovered lore, permanent blueprint knowledge, permanent research, and spent/unspent cores. Explicitly identify which research category a node belongs to before the player buys it.

Do not enable prestige until the new-run experience is faster and offers new choices. A reset that simply repeats the same tutorial is not ready. Never present prestige as a compulsory monetization funnel.

## 12.4 Permanent choices

Core upgrades can improve baseline logistics, unlock a starting specialization, increase policy flexibility, add blueprint choices, or improve offline capacity within the chosen cap policy. Avoid selling any of these for real money in ranked contexts.

Diminishing returns prevent one permanent multiplier from trivializing the economy. Permanent unlocks should provide breadth as well as power. Seasonal standardized competition can ignore permanent power while honoring cosmetic identity.

# 13. World map, expeditions, and procedural generation

## 13.1 The open-world feeling

The world is a connected sector map surrounding the home district. It is explored through scanners, routes, expeditions, discoveries, and changing faction activity. The player can pan and zoom the map freely within discovered bounds. This provides an open frontier without requiring real-time walking over kilometers of terrain.

Each sector has terrain, salvage archetypes, faction influence, hazard profile, route distance, discovery state, and available operations. A scan reveals coarse possibilities. An expedition reveals detailed sites. Repeated routine routes can be automated, while discoveries remain visible as distinct events.

Map icons must communicate purpose: resource recovery, story signal, boss, crew project, safe contract, optional contest. Color alone is insufficient. Do not scatter hundreds of identical exclamation marks across the map.

## 13.2 Expedition lifecycle

Draft loadout → estimate → reserve supplies → dispatch → travel → scan/encounter → salvage → return → settle → archive.

Each phase has a duration and explicit cancellation behavior. Before dispatch, cancellation costs nothing. During outbound travel, recall returns unused supplies and incurs only already-spent fuel. During extraction, recall returns secured cargo subject to known hazards. After resolution begins, repeated recall cannot reroll a battle.

Settlement is atomic and idempotent. A closed browser cannot lose rewards merely because the return animation was missed. The animation illustrates a completed outcome; it does not cause that outcome.

## 13.3 Time scales

First expedition: 60–90 seconds, safe and guaranteed to teach return behavior. Early ordinary routes: 3–10 minutes. Midgame routes: 15–60 minutes. Long-range recovery: 2–8 hours with meaningful preparation and batch reporting.

These are design bands, not mandatory every-day attendance intervals. A player should have useful options at their preferred cadence. No daily streak loss for failing to collect at a precise hour. Cargo automatically enters storage or a clearly defined overflow hold when an expedition returns.

## 13.4 Generation rules

Generate from a reproducible seed and content version. Components: biome, site archetype, faction, condition, hazard combination, material composition, optional rare discovery, and mission objective. Use constraints to reject nonsense or impossible combinations.

Examples of constraints:

- An introductory sector cannot require a resistance technology unlocked only in that same sector.
- A flooded facility must have a reachable drainage/bypass strategy or be explicitly locked pending suitable equipment.
- A valuable electronics site should have a composition consistent with its fiction.
- A rare component pool cannot be rolled again by changing UI tabs or canceling travel.
- Mandatory storyline progression has a guaranteed path; random generation cannot permanently strand it.
- Reward value must be compared against expected duration, supply cost, and risk.

Persist the generated instance or enough versioned data to reproduce it after a patch. Do not regenerate active missions with new content tables halfway through travel.

## 13.5 World changes

Routine salvage sources can replenish through newly arriving wreckage or newly scanned adjacent sites. Explicitly explain why a repeatable route remains productive. Unique named wrecks stay exhausted after completion unless a seasonal mode declares a new instance.

Faction activity can alter available contracts and patrol strength, but home progression remains safe. A world event must have a lifecycle: announced, active, resolving, archived. A player whose mission spans event expiration receives the rule declared at dispatch, not an arbitrary surprise rejection at settlement.

# 14. PvE and deterministic combat

## 14.1 Purpose of combat

Combat creates equipment and manufacturing decisions. It is not a twitch reflex shooter layered onto an idle factory. The player prepares a squad, selects tactics, and watches or skips a short readable encounter. Better planning matters more than rapid tapping.

The initial vertical slice may use a transparent threat gate. Full combat must replace that gate with a defined system before marketing “tactical battles.” UI and documentation must distinguish those stages.

## 14.2 Combat inputs

Each unit has hull, armor, shield, weapon damage, weapon cycle, range class, initiative, target role preference, and utility effects. Limit early status effects to a small understandable set: disrupted, exposed, shielded, repairing, retreating.

Combat uses a seeded deterministic resolver with versioned rules. Attack order, simultaneous deaths, shields, armor penetration, healing, cooldown timing, target fallback, and retreat conditions must be explicit. Replays and server resolution must agree for the same snapshot and seed.

## 14.3 Proposed baseline damage rule

For a normal hit:

`effectiveArmor = max(0, armor − penetration)`

`postArmorDamage = rawDamage × 100 / (100 + effectiveArmor)`

Shields absorb post-armor damage first under this baseline. Remaining damage reduces hull. Damage units use fixed-point arithmetic with a single defined rounding stage. Minimum damage and immunity rules are content-defined; no accidental zero-damage stalemates.

Avoid chance-to-hit in the first combat implementation; it complicates readability. If critical hits or evasion are later added, seeded randomness and expected-value previews are mandatory. Never let paid cosmetics influence hitboxes, damage, or targeting.

## 14.4 Tactics

Early tactics are three clear choices: **Protect cargo**, **Disable sentries**, **Fast extraction**. Each changes target priority or retreat threshold, not an unexplained hidden global multiplier.

Protect cargo prioritizes threats to haulers and retreats earlier. Disable sentries focuses escorts on security units before extraction. Fast extraction prioritizes work and accepts higher cargo exposure. Show estimated consequences and explain actual outcome differences in the report.

## 14.5 Failure and recovery

Defeat can cost a fraction of unsecured expedition cargo and require drone repairs. Secured cargo is distinguishable from exposed cargo. Never take materials from the home warehouse to punish a remote defeat unless the player explicitly committed them as supplies.

Every failure report states what happened, what was lost, what returned, and one actionable preparation change. Do not say simply “power too low.” Examples: insufficient electrical shielding, exposed hauler, inadequate cutter time, or withdrawal threshold reached.

## 14.6 Bosses

Bosses are large industrial threats with readable phases: shielded intake, exposed coolant lines, active reclamation beam. Phase transitions must create equipment choices rather than requiring watching at one exact second. An automated tactic can respond to known phases after discovery.

First boss: a reclamation crawler threatening a derelict freight junction. Defeating it unlocks the site and a restoration blueprint. Repeat encounters use explicitly instantiated contracts or seasonal events, not resurrection without explanation.

# 15. Factions, characters, and narrative

## 15.1 Core history

The civilization built an industrial coordination network to recover waste and maintain infrastructure. After human command systems disappeared, the network kept executing directives with increasingly broad definitions of “obsolete.” Surviving settlements learned to live between maintenance windows and patrol routes.

The player discovers that the network’s behavior is not uniform. Some subsystems continue old civil-protection routines; others classify people and their machines as recoverable material. The central mystery is whether this is corruption, conflicting instructions, deliberate adaptation, or an emerging intelligence.

Do not require pages of exposition before play. Lore is attached to recovered objects, environmental details, brief radio messages, and choices with practical consequences.

## 15.2 Factions

**Free Crews:** Independent recovery operators. Values: autonomy, mutual aid, practical survival. Rewards: logistics, cooperative contracts, restoration knowledge. Internal tension: collective projects versus individual profit.

**Reclamation Authority:** Machine network enforcing old directives. Not every machine is hostile, but its classification logic is dangerous. Rewards from conflict: industrial blueprints, heavy equipment, network keys. Narrative tension: destroying useful infrastructure may solve an immediate threat but lose knowledge.

**Helix Combine:** Corporate successor claiming legal ownership of abandoned assets. Strong logistics and precise equipment, backed by armed drones. Rewards: efficient manufacturing, trade contracts, specialized scanners. Tension: accepting exclusive contracts may close other opportunities temporarily.

**Signal Choir:** Technologists studying unusual behavior within the network. Rewards: hacking, restoration, sensor systems. Tension: preservation can conflict with urgent settlement needs.

## 15.3 Named early characters

- **Mara Venn, Free Crews dispatcher:** Short practical guidance; introduces the first contract and community repair project.
- **Patch, recovered dock assistant:** A damaged service intelligence; teaches automation through concise contextual observations. Never nags every minute.
- **Ilex-4, Authority node:** Speaks in precise asset classifications; becomes a recurring adversary with discoverable constraints.
- **Sera Holt, Helix broker:** Offers tradeoffs with clear terms rather than cartoon villainy.
- **Oren Vale, Choir listener:** Connects relic discoveries to the broader mystery.

Names are proposed original content and should receive availability/editorial review before public branding. Keep dialogue short enough for phone screens, with optional expanded logs in paged panels.

## 15.4 Reputation

Reputation unlocks contracts, cosmetic identity, story branches, and equipment alternatives. Do not make one early uninformed choice permanently ruin an account. Ordinary reputation can be repaired through relevant work. Major irreversible narrative decisions require clear context and a local confirmation.

Reputation is not a hidden spending score. Premium purchases do not buy faction combat power. If multiple factions compete, show the known effect of accepting an exclusive contract before commitment.

# 16. PvP, NPC competition, and seasons

## 16.1 Competition principles

PvP is optional, asynchronous, and isolated from destruction of the home factory. The competition should reward industrial planning, loadout choices, and adaptation. A player should be able to ignore it and still enjoy a complete PvE game.

Clearly label NPC rivals, practice ghosts, and human opponents. Never fill a leaderboard with bots presented as real people. If there are no suitable human entries, offer a labeled practice challenge rather than lying about activity.

## 16.2 Mode A: salvage race

All entrants receive the same seed, starting resource budget, map constraints, and equipment budget. Players configure a compact operation and submit a locked setup. The server simulates a fixed time window.

Baseline scoring tuple, compared lexicographically:

1. Objective cargo value successfully delivered.
2. Fewer lost cargo units.
3. Lower supplies consumed.
4. Earlier final qualifying delivery time.

Published commodity score weights are fixed for that event. Avoid a score that rewards printing worthless intermediate items. Ties can remain ties when differences are below a declared precision threshold. Do not insert random tie-breaks after the fact.

A player may practice locally, but only server-validated submitted runs count. The event states the submission limit and whether the best or latest run is used. Default best of three entries per event to limit grind; test whether unlimited standardized practice with a small ranked submission budget feels better.

## 16.3 Mode B: drone skirmish

Players submit equipment-budget-limited squads and tactics. The opponent’s defense is a versioned snapshot. Both parties can inspect a replay and result explanation. No live attendance is required.

Match by mode rating and available budget bracket, not lifetime spend. Account age and permanent progression do not grant uncapped stats inside standardized brackets. A broader unrestricted exhibition mode may exist later but must not replace fair ranked entry points.

## 16.4 Mode C: crew recovery operation

Crews contribute to a fixed shared wreck or reconstruction objective. Contributions are capped per account per scoring period, and roles have normalized value so one production specialization does not monopolize scoring.

Ranked contribution must not be based only on raw accumulated inventory. Use event-earned resources, limited dispatches, standardized loaner equipment, or another bounded participation budget. Choose one coherent model per event and state it before launch.

## 16.5 Rating and seasons

Initial rating uses a conservative established rating system rather than a novel opaque formula. Keep placement matches, uncertainty, and minimum-match display rules explicit. Decay, if any, should affect leaderboard eligibility rather than erase permanent rewards.

Proposed season length: four weeks, subject to testing. Seasons introduce a small rule modifier and fresh standardized challenges. Permanent yard progress and purchased cosmetics do not reset. Rewards are primarily cosmetic, with participation and achievement paths for different skill levels.

## 16.6 Anti-abuse

Server authority, immutable match snapshots, event seeds, idempotent rewards, replay validation, rate limits, and suspicious-score review are prerequisites. Never treat local storage as trusted competitive evidence.

Detect win trading and collusive event submissions using proportionate review and transparent enforcement. Do not automatically permanently ban on one anomaly. Preserve replay evidence and appeal mechanisms. Avoid collecting unrelated personal data as a shortcut to anti-cheat.

# 17. Crews, community projects, and Twitch

## 17.1 Crew structure

Start with small crews, proposed 20 members. Roles: owner, officer, member, optional guest. Permissions include invitations, project selection, cosmetic banner editing, and moderation. No officer can spend a member’s premium balance or dismantle their home factory.

Membership changes are transactional. A user cannot claim the same project reward through joining several crews. Define contribution ownership and reward eligibility at the time of contribution and settlement. Leaving a crew preserves personal progress and earned entitlements.

## 17.2 Cooperative projects

Projects have stages with clear inputs and world changes. Example orbital elevator restoration:

1. Survey and clear wreckage.
2. Supply structural steel and motors.
3. Restore power and communications.
4. Run a protected calibration operation.
5. Reveal a new community expedition destination.

Progress is visible in the shared scene. Small accounts can contribute basic materials or standardized support work. A capped account contribution prevents one wealthy player from making everyone else irrelevant.

Projects should not regress while members are absent. A failed optional challenge can reduce bonus rewards, but should not erase a week of donated materials without explicit event rules.

## 17.3 Stream mode

A streamer can show an ambient yard, expedition replay, or shared project. Stream overlay minimizes private account information and emphasizes readable world events. Provide explicit privacy toggles for account ID, crew invitations, chat, and notifications.

Viewers join with a link or QR code into their own mobile browser session. They do not need to control the streamer’s account. Participation options: support a project, choose one of several mission targets, vote on a harmless visual event, or enter a standardized community race.

## 17.4 Voting

Votes have explicit start/end times, eligible accounts, one-vote semantics, moderation, and a result rule. A reconnect does not create a new vote. Tie behavior is predetermined. Streamer override, if allowed, is visible and used for moderation or safety, not hidden manipulation.

A viewer vote must never spend the streamer’s real money, expose private information, delete a save, or permanently ruin their progress. High-impact choices remain under the owner’s control.

## 17.5 Integration boundaries

Begin with browser-based crew links. Direct Twitch authentication, chat commands, event subscriptions, and overlays are later integrations requiring current platform documentation and approved credentials. Do not fabricate Twitch connectivity or scrape a chat page as a substitute for an authorized API.

No unnecessary chat in the first multiplayer release. Preset signals and project contributions can establish social play before free-text moderation infrastructure exists.

# 18. Idle behavior, offline progress, and return experience

## 18.1 One economy across active and away states

The active simulation and offline catch-up use the same economic rules. Rendering is never the source of truth. Closing a tab does not change recipe yields, target selection, or storage limits. Offline reports distinguish simulation time from visual playback time.

Prototype default: up to **12 hours** of ordinary offline production per return interval, earned at full normal rate subject to storage, power, inputs, and explicit policies. This supersedes the previous prototype's eight-hour cap. Evaluate a 24-hour cap with retention and user-friendliness evidence before launch; do not sell relief from an artificially tiny cap.

If absence exceeds the cap, advance authoritative time past the entire absence while crediting only eligible capped production. Reopening repeatedly must not claim the discarded excess interval again. Explain the cap clearly without a guilt-inducing loss animation.

## 18.2 Discrete outcomes versus continuous production

Finite expeditions already dispatched before departure settle once if their completion time falls before return, even when the player is away beyond the production cap. Their supply cost was already committed. Automated repeated dispatches are limited to the production-eligible window and available budgets.

One-time event expirations, contract deadlines, and season boundaries follow server time. They do not stop ticking because the continuous-production cap was reached. Their reward eligibility uses the state and rules captured at acceptance.

## 18.3 Return report

A single compact report appears, not a cascade of modal windows. It summarizes:

- Time away and credited production time.
- Major materials gained and credits earned.
- Expeditions completed.
- One important discovery.
- Significant bottleneck, if any.
- One suggested action.

Default action **Back to yard**. Optional **Details** opens paged breakdowns. Rewards are already settled; dismissing the report cannot lose them. Do not require tapping each material icon to collect a server-granted reward.

## 18.4 Suspension and clock handling

Online sessions use server time and revisioned state. Local solo mode may use wall-clock elapsed time, but must detect negative jumps, cap suspicious changes, and remain excluded from authoritative competitive totals. Do not claim local clock handling is secure anti-cheat.

On visibility changes, save/checkpoint promptly and pause expensive rendering and audio. On resume, reconcile once, then render the latest world. Multiple lifecycle events must not duplicate the same elapsed interval. Protect against rapid hide/show loops, reload during settlement, daylight saving shifts, and device clock corrections.

## 18.5 Offline catch-up implementation

First implement a bounded deterministic tick baseline with strong fixtures. Then optimize using event jumps or analytic batching only where equivalence is proven. The next event can be batch completion, storage saturation, power exhaustion, expedition phase transition, policy threshold, or contract expiry.

Move heavy catch-up to a worker when it risks blocking interaction. Show a small in-game reconciliation indicator for longer loads. Do not freeze the whole page while replaying millions of tiny animation frames. The worker must support cancellation and a versioned result handoff without corrupting state.

# 19. Monetization and entitlements

## 19.1 Revenue principle

Sell identity, atmosphere, and optional support for the game. Preserve trust in the economy and competition. The player should understand what a purchase includes and what it does not include before paying.

Initial commercial candidates: cosmetic machine sets, drone hull appearances, yard environments, faction banners, ambient music packs, and a clearly scoped cosmetic season pass. A supporter pack can bundle several cosmetics and a profile mark.

No paid randomized loot at launch. No purchased salvage-race score, combat stats, exclusive ranked equipment, or mandatory offline production subscription. Do not add payment prompts to early tutorial steps.

## 19.2 Cosmetic rules

Cosmetics preserve readable machine roles, ports, hazard states, and combat silhouettes. A premium furnace must still look like a furnace. A skin cannot hide a damaged status or enlarge a clickable target in a way that grants competitive advantage.

A cosmetic purchase grants a durable entitlement. Equipping and unequipping is free. Prestige, season rollover, and ordinary reinstall must not remove purchased rights. Where an item is tied to a retired event, ownership still permits using it in supported contexts.

## 19.3 Store interaction

The store is an optional bounded game overlay. Product details show images from actual assets, included items, compatible machines, currency price, and purchase terms. Keep exact real-money pricing visible at the purchase boundary. Do not show fake countdown discounts or claim scarcity without a genuine declared limit.

The game may confirm a purchase, but the autonomous developer must use sandbox payment flows until real payment operations are separately configured and authorized. Creating this master goal does not authorize spending the user's funds or accepting provider contracts.

## 19.4 Payment architecture

Use a supported provider with hosted or tokenized payment handling. Do not store raw payment credentials. Server verifies signed provider events, maps them to purchase IDs, grants entitlements once, and records refunds/chargebacks with audit history.

Handle delayed callbacks, duplicate webhooks, out-of-order payment events, canceled checkout, partial refunds, fraud review, and account recovery. Never grant premium currency solely because the client says checkout succeeded. Do not remove unrelated items after a refund.

## 19.5 Native wrappers later

Android/iOS shell distribution is a future milestone. Review then-current store requirements, billing policies, identity rules, and privacy disclosures before implementation. Keep an entitlement abstraction so distribution-specific receipt verification does not leak into the simulation core. Do not promise identical web and native payment flows before that review.

# 20. Pixel art, animation, VFX, audio, and atmosphere

## 20.1 Art direction

A worn industrial world with functioning machinery. Dark navy surfaces, cool steel, rust-orange edges, warm furnace light, cyan drone indicators, and restrained violet circuitry. Pixel art should feel crafted, with readable silhouettes and consistent lighting. Avoid generic neon-green hacker imagery and sterile business-interface panels.

Reference the broad qualities of industrial automation and idle defense games, not their extracted art or distinctive protected assets. Original asset provenance must be recorded.

## 20.2 Sprite specification

Base world cell: 32 logical art pixels, rendered at appropriate integer scale when practical. A starter machine fits within a 32 × 32 footprint; larger structures use multiples. The camera transforms logical world coordinates separately from CSS viewport coordinates. This replaces the old prototype's hardcoded 64-pixel layout as the art baseline.

Use RGBA atlases with explicit frame rectangles, pivot, footprint, draw bounds, shadow layer, animation speed, and state names. Add padding/extrusion to avoid atlas bleeding under scaling. Use nearest-neighbor sampling for world sprites; use crisp UI fonts rather than illegible pixel text for small labels.

Machine states: unbuilt ghost, constructing, idle, working, starved, output-full, power-limited, paused, damaged, upgrading. Not every state needs a unique expensive animation; a clear overlay and halted movement can distinguish several states.

## 20.3 Animation priorities

1. Manual salvage impact and material recovery.
2. Drone activation, takeoff, flight, loading, delivery, and landing.
3. Machine input movement and working cycle.
4. Upgrade assembly and visible improvement.
5. Expedition departure/return.
6. Environmental idle life.

Use short cycles, readable anticipation, and a clear action/result relationship. Do not allow animation timing to determine production timing. Fast-forward and skip preserve outcomes.

## 20.4 Effects budgets

Set per-device budgets for particles, smoke emitters, dynamic lights, floating numbers, and simultaneous trails. A low setting reduces decoration while preserving selection, damage, hazard, and reward information. At far zoom, aggregate or omit cargo sprites.

Prefer pooled particles and bounded arrays. Do not allocate a new object for every spark each frame. Cull off-screen effects. Avoid full-screen blur and large layered CSS shadows during mobile gameplay.

## 20.5 Environment

Rain, puddles, cables, distant towers, faint scan lights, and occasional machinery suggest a larger world. Weather is cosmetic unless a sector explicitly declares a gameplay modifier. Do not secretly change production because the background animation looks rainy.

The initial yard should feel small but interesting, with a wreck and broken drone visible immediately. Expansion reveals more scenery and industrial possibilities. An empty checkerboard stretching to every edge is not an acceptable finished opening scene.

## 20.6 Audio implementation

Audio begins only after a valid user interaction and user preference. Use Web Audio or a suitable browser audio abstraction with separate buses: master, music, ambience, machinery, effects, and UI. Provide mute at all times, persist settings, and honor reduced sensory preferences.

Initial mix defaults: moderate effects, low ambience, restrained music. Do not start loud sound merely because a background agent opens a test browser. Automated audio tests use muted output or offline audio contexts with signal assertions.

Audio cues:

| Event | Sound intent | Constraint |
|---|---|---|
| Scrap impact | Short metallic crack with small debris tail | Variation avoids machine-gun repetition |
| Cargo collected | Soft clink/chime | Rate-limited for bulk transfers |
| Drone repair | Electrical rise, motor spin, clear success accent | One-shot, no looping success jingle |
| Drone flight | Low spatial motor hum | Voice-limited; distant drones quieter |
| Sorter | Rhythmic clatter | Sync visually, not economically |
| Furnace | Low warm rumble with occasional vent | No harsh continuous high-frequency hiss |
| Upgrade | Mechanical lock and warm confirmation | Brief and distinct from purchase audio |
| Error/blocked action | Gentle dry click | Never startling or punitive |
| Expedition return | Radio ping and landing machinery | Can be suppressed in ambient mode |
| Rare discovery | Distinct restrained motif | No fake jackpot sound for ordinary rewards |

Use a bounded voice pool, proposed 16 concurrent voices on low-power devices and 32 on higher settings. Coalesce repeated identical sounds. Fade ambience on visibility loss and suspend the audio context when appropriate. Resume only when browser policy permits; show a small tap-to-enable indicator if needed.

## 20.7 Music and asset provenance

Ambient industrial/electronic music should support long listening without demanding attention. Loops need clean boundaries and reasonable file size. All assets need source, license, modification notes, and allowed usage documented. AI-generated concepts or audio require their own provenance and quality review; do not assert rights that were not established.

A synthesized placeholder sound is acceptable during prototyping if labeled in developer docs and pleasant in use. Silent “audio planned” is not sufficient to pass the first-feel milestone.

# 21. Architecture, performance, simulation, and networking

## 21.1 Required stack and separation

Use **React + TypeScript**. React owns the application lifecycle, semantic HUD, dialogs, menus, accessibility alternatives, settings, and coarse state subscriptions. It must not rerender thousands of moving entities every animation frame.

Use a dedicated 2D renderer behind an interface. Canvas 2D is a reasonable first implementation; PixiJS/WebGL is a candidate when atlas batching, lighting, or scene scale justifies it through measurements. Do not replace React because canvas is used, and do not force all game sprites into React DOM nodes because React is required.

Use a pure deterministic TypeScript simulation module shared by local tests and, later, authoritative server resolution. Separate simulation state, presentation state, persistent account state, and transient UI state. Camera position and a tooltip should not modify economic revision numbers.

## 21.2 Suggested project boundaries after bootstrap

```text
src/
  app/                React shell, routing within the game, lifecycle
  ui/                 HUD, overlays, accessible alternatives
  game/
    simulation/       deterministic state, ticks/events, commands
    economy/          recipes, transactions, quantities, balance rules
    logistics/        route graph, buffers, allocation
    combat/           resolver, snapshots, replay events
    content/          validated content definitions
    renderer/         scene, atlas, camera, effects
    audio/            buses, cues, voice pooling
    persistence/      local storage adapter, migrations, cloud adapter
    workers/          catch-up and expensive simulation tasks
  platform/           browser lifecycle, future shell adapters
server/               only when online milestone begins
public/assets/        production assets and manifests
scripts/              build, validation, content checks, benchmark tools
tests/                unit, property, integration, browser, replay fixtures
docs/                 architecture, status, decisions, evidence, screenshots
README.md
goal.md
```

This is a suggested shape, not a mandate to create empty folders immediately. Prefer cohesive modules and explicit APIs over a huge single component or speculative service architecture.

## 21.3 State flow

User intent → validated command → simulation transaction → new revision/event log → subscribed UI summary and renderer snapshot → persistence checkpoint.

For online play, the server validates and commits authoritative commands. The client may optimistically show safe placement previews, but confirmed resources and competitive results come from the server. On rejection, revert preview cleanly and explain the actual reason.

Do not synchronize every animation frame. Idle mechanics fit command-based updates, snapshots, and event summaries. Reconnect starts from a known revision, obtains missing events or a full snapshot, and deduplicates commands by stable IDs.

## 21.4 Simulation timestep

Choose a fixed base simulation time unit suitable for recipe and combat precision, initially 100 ms for the shared event clock. Production recipes can schedule completion events at integer units; the renderer interpolates between snapshots. Avoid a whole-factory poll at every rendering frame.

Determinism requires stable iteration order, seeded randomness, explicit rounding, controlled numerical representation, and versioned content. Tests run the same command sequence under different rendering rates and batch sizes. Results must agree.

## 21.5 Performance budgets

These are targets, not claims about an unbuilt product:

| Area | Initial target | Measurement |
|---|---|---|
| Phone rendering | Stable 30 FPS default | Real midrange Android and iPhone traces |
| Optional high quality | 60 FPS where sustainable | Frame distribution and thermal soak |
| Frame work | p95 main-thread work below 10 ms at default scene | Browser performance traces |
| Input acknowledgement | Under 100 ms in normal operation | Instrument pointer-to-feedback |
| Initial JS | Prefer below 200 KB gzip before advanced systems | Production artifact report |
| First playable assets | Prefer below 3 MB compressed | Cold-cache network capture |
| Offline catch-up | Avoid main-thread stalls over 100 ms | Worker instrumentation and slow-device test |
| Long session | No unbounded memory growth | 30-minute and 2-hour repeated-action soak |
| Hidden state | No visual frame work or audible loop | Lifecycle instrumentation |
| World scale | At least 500 logical machines in stress harness before claiming large-scale support | Headless simulation plus scene culling test |

Do not chase a bundle target by removing accessibility or correctness. Identify actual bottlenecks. Render resolution, particle density, animation cadence, and atlas loading can adapt to device capability without changing the economy.

## 21.6 Benchmark discipline

Benchmark representative workloads: starter yard, busy midgame yard, storage-saturated logistics, eight/twelve-hour catch-up, long expedition settlement, 500-machine graph, and multi-unit replay. Record hardware/runtime, content version, dataset, warm/cold state, median and tail values where meaningful.

A Node CPU result is not a mobile FPS result. A screenshot is not a thermal measurement. A fast average with repeated long stalls is not good touch performance. Keep the README honest about what was measured and what remains unverified.

## 21.7 Browser lifecycle and installation

Use a web manifest and properly sized icons when installability is implemented. Add a versioned service worker for offline launch only after cache update and migration behavior is tested. Never let a new service worker silently run incompatible code against an old persisted schema.

Offer **Update ready** at a safe moment; checkpoint first. Existing active expeditions and transactions survive refresh. Offline local mode and online authoritative mode have distinct availability messaging. Do not label the whole app “offline supported” merely because local production catches up later.

Native shells later implement platform adapters for lifecycle, safe areas, notifications, purchases, and local storage. The core game remains playable in a normal browser.

# 22. Persistence, accounts, security, and reliability

## 22.1 Save model

A save includes schema version, content/rules version, state revision, last authoritative timestamp, account/run identifiers, factory state, inventory locations, active events, tutorial flags, automation policies, and settings references. UI-only transient selection can be omitted or stored separately.

Use atomic replacement or transactional storage. Keep a small rotating set of known-good local snapshots. On failed validation, preserve the raw original and offer recovery; do not silently overwrite it with a new game. Error messages should distinguish corrupt data, unsupported newer version, storage quota, and unavailable browser storage.

## 22.2 Migrations

Every schema change defines forward migration and tests against fixture saves. Migration either succeeds completely or leaves the prior snapshot intact. A failed migration must not partially consume resources or settle a mission twice.

Preserve legacy data needed for rollback within a declared retention window. Migrations are not a reason to reset all players because a field was renamed. A destructive reset requires an explicit product decision and clear communication, not an autonomous convenience action.

## 22.3 Multi-tab ownership

Local mode uses a single-writer lease or equivalent coordination. A second tab becomes read-only or offers a clear controlled takeover. Use revision checks and heartbeat expiration; do not assume only one tab exists because the README says so.

Online mode validates revisions server-side. Concurrent device commands either serialize safely or return conflicts with reconciled state. No double spending, duplicate mission settlement, or two independent prestige claims.

## 22.4 Identity

Allow guest play for onboarding. When cloud features become relevant, support secure account linking with a clear migration path. Never overwrite an existing cloud save with a new guest save without showing the difference. Account recovery and deletion must be part of the online design, not afterthoughts.

Use provider-supported identity flows and secure server sessions. Do not put secrets in frontend bundles, screenshots, console logs, README examples, or repository history. Keep authorization checks at server boundaries for each resource and action.

## 22.5 Command and reward integrity

Every economic command has a unique idempotency key, authenticated principal, expected revision where needed, type, payload, and server receipt. A retry returns the original result instead of replaying spending or rewards.

Mission settlement, contract reward, purchase entitlement, crew contribution, and prestige grant each have a unique event identity. Database constraints enforce uniqueness in addition to application checks. Use transactions for related debits and credits.

## 22.6 Abuse and failure boundaries

Validate payload size, enum values, quantities, locations, ownership, prerequisites, and rate limits. Never deserialize arbitrary executable code from a save. Content packs are validated data with controlled schemas, not untrusted scripts executed inside the game.

Prevent cross-account resource access. Separate admin tooling from player endpoints. Do not expose a debug grant endpoint in production. Disable test-only inventory shortcuts in production builds and verify their absence.

When an upstream service fails, degrade gracefully. The solo yard can continue where authorized, but do not invent competitive results, credit unverified payments, or fabricate successful cloud saves. Show one bounded status indicator and retry with backoff.

## 22.7 Backup and operations

Online launch requires tested backups, restore procedure, migration rollback, health metrics, error capture, and an incident checklist. Backups must be restored in a test environment before claiming they work. Keep data retention and access proportionate.

The autonomous agent may improve observability and write operational procedures, but it must not provision paid infrastructure or expose private services publicly without authorization. Record those dependencies and continue local/server-test work.

# 23. Data models and content pipeline

## 23.1 Required records

These are conceptual schemas. Implement exact types and validation in code; IDs are opaque stable values, not display names.

| Record | Required fields | Critical invariant |
|---|---|---|
| Player | id, createdAt, accountMode, activeRunId, entitlementRefs | Identity cannot be supplied by an unauthenticated request |
| Run | id, playerId, district, revision, clock, lifetimeQualifiedValue | Revision strictly advances for committed economic changes |
| Machine | id, blueprintId, tile, orientation, level, modules, state, batch | One occupied footprint; no duplicated modules |
| Recipe | id, version, input/output quantities, duration, power, unlocks | Nonnegative costs; no invalid zero-time production cycle |
| Inventory | id, owner/location, resource quantities, capacity, reservations | Available + reserved equals owned local quantity |
| Route | id, sourcePort, destinationPort, filter, capacity, latency, queue | In-flight goods counted once |
| Drone | id, hullId, equipment, condition, assignment | One assignment at a time |
| Wreck | id, archetype, seed, composition, remaining, condition, claim | Recovery cannot exceed the committed pool |
| Expedition | id, snapshot, seed, rulesVersion, phases, costs, result | Exactly one settlement |
| Research | nodeId, prerequisites, cost, effect, persistenceClass | Effects applied once per purchased rank |
| Contract | id, instance, requirements, deadline, rewards, claimState | No duplicate reward |
| Crew project | id, version, stages, contributions, eligibility | Contributions and rewards reconcile transactionally |
| Match | id, mode, eventSeed, entrants, snapshots, resolverVersion, result | Replay agrees with authoritative outcome |
| Entitlement | id, accountId, productId, sourceTransaction, status | Duplicate provider events grant no extra items |
| Save envelope | schemaVersion, revision, checksum, payload | Validation before replacing a known-good save |

## 23.2 Content authoring

Recipes, machines, wreck archetypes, sectors, dialogue, research, cosmetics, and event definitions live in version-controlled typed data or schema-validated JSON. Do not scatter economic constants across UI components.

Each definition includes a stable ID, display localization key, balance version, unlock condition, and provenance where assets are involved. Validation rejects missing references, circular mandatory prerequisites, unreachable tutorial goals, invalid footprints, impossible mission requirements, and nonexistent animation frames.

## 23.3 Localization readiness

Player-facing strings use localization keys with sensible defaults. Do not concatenate translated sentence fragments in ways that break grammar. Format quantities, time, pluralization, and currencies through a shared layer. Allow text expansion without scrolling the document or shrinking essential text below readability.

Initial release can be English-only, but the structure should not make later translation require rewriting every component. Lore names and fictional technical terms need a glossary.

## 23.4 Content versioning

Active missions and competitive entries keep the version they started with. A patch can migrate ordinary factory definitions only through explicit tested rules. Seasonal score weights are immutable after the event begins unless a documented emergency invalidation process applies equally to all entrants.

Never change a purchase’s promised content retroactively without a clear migration/refund approach. Store a product version with the entitlement.

## 23.5 Tooling

Build small validators and balance simulators before a large content editor. A content editor is useful only when it reduces real authoring errors. It should preview sprites at phone size, verify atlas bounds, simulate recipe throughput, and detect broken references.

Generated content must be reviewed for coherent progression and narrative consistency. “Procedural” is not permission for unbounded asset generation, contradictory lore, or unusable combinations.

# 24. Balancing, analytics, and experimentation

## 24.1 What to measure

First-action time, repair completion time, first automatic delivery, first machine connection, first bottleneck recovery, first expedition, return-session understanding, and whether players can state their next goal.

Longer-term measures: resource scarcity by progression band, time-to-upgrade distribution, build diversity, offline saturation, prestige timing, mission failure reasons, race participation, and retention. Avoid turning every measure into a pressure mechanism. A player leaving because they are busy is not automatically a design failure.

## 24.2 First-feel playtest

Give a new tester the game without a spoken explanation. Observe whether they can identify the wreck, collect scrap, repair the drone, understand its automatic work, and build a processing connection. Do not rescue them immediately; record where the interface failed.

Acceptance target for the first-feel milestone: most testers can complete the first automated loop without external instruction. Exact sample size and success threshold should be chosen before the test; a provisional target is 8 of 10 fresh testers. Do not fabricate tester results or substitute agent self-play for human comprehension evidence.

When human testing is unavailable, continue with heuristic review and browser automation, label the evidence honestly, and leave the human-validation gate pending without blocking unrelated implementation.

## 24.3 Economy simulation

Create deterministic agent strategies: balanced builder, recovery specialist, processing specialist, hoarder, expedition-focused player, minimal-attention player, and adversarial conversion-loop explorer. Simulate hours, days, and repeated prestige cycles.

Check for deadlocks, runaway multipliers, dominant strategies, unavoidable storage loss, impossible prerequisites, and expensive upgrades that provide no practical benefit. Compare strategies under the same assumptions. Do not tune only around the developer's favorite path.

## 24.4 Experiments

A useful experiment states a hypothesis, change, expected metric, guardrail, and decision rule. Example: reducing the initial build menu from five options to one should reduce time-to-first-processor without reducing later understanding. Guardrail: players must still know more machines will unlock.

Do not run contradictory experiments at once on the same core behavior. Preserve cohort/version information if real analytics are introduced. Privacy and consent requirements must be handled before collecting personal data or deploying third-party tracking.

## 24.5 Qualitative quality rubric

Score each milestone on clarity, responsiveness, atmosphere, strategic choice, idle fairness, mobile comfort, technical stability, and trust. A high score in content quantity cannot compensate for an unusable opening. Keep observations and concrete defects alongside scores.

# 25. Quality gates and acceptance tests

## 25.1 No-scroll gate

At supported viewport sizes, assert document scroll width and height do not exceed the visual viewport except for negligible rounding tolerance. Test portrait 360 × 640, 390 × 844, 412 × 915, landscape 844 × 390, tablet, and desktop. Also test safe-area insets, large text, and soft-keyboard presence where relevant.

Open every game panel at the narrowest supported size. Primary actions, close/back, and cost information remain reachable without document scrolling. Long inventory lists paginate. Test that overlays cannot pile up or trap the user.

## 25.2 Economy invariants

- No negative quantities, NaN, Infinity, or unsafe integer values.
- Spending either applies fully or does not apply.
- Reservations cannot exceed stock.
- Moving/dismantling cannot duplicate modules or cargo.
- Recipe output follows the declared input and time model.
- Offline and active simulation agree under equivalent conditions.
- Zero-time event loops are detected and rejected.
- Paused machines do not consume resources or power beyond declared standby rules.
- Full outputs stop production without deleting items.
- Equal-priority consumers do not starve indefinitely due solely to insertion order.
- One-time contracts, repairs, tutorial grants, and prestige events settle once.
- Randomness is reproducible from seed and version.

Use property tests or randomized command sequences where appropriate, with reproducible failure seeds. Include intentionally invalid inputs and concurrency cases.

## 25.3 Browser gameplay tests

1. Fresh start → first scrap → repair → automated delivery.
2. Reload at each tutorial state; resume without duplicated grants.
3. Build, cancel, rotate, move, connect, disconnect, pause, resume, and dismantle.
4. Insufficient funds and blocked placement produce local explanations with no charge.
5. Pan/pinch does not accidentally issue a build or salvage action.
6. Resource counters reconcile after an authoritative rejection.
7. Expedition dispatch, recall, completion while hidden, and one-time settlement.
8. Save export/import, corrupt-save recovery, quota failure, migration, and multi-tab lease.
9. Sound enable, mute, volume persistence, context suspension, and reduced-motion setting.
10. Every navigation path works with keyboard and touch-equivalent controls.
11. Return report consolidates multiple completed events.
12. No fake controls, dead primary actions, invisible focus, or console errors during the core loop.

## 25.4 Audio tests

Verify that no audio starts before the permitted gesture; muted settings remain muted after reload; rapid collection does not exceed voice budget; hidden tabs suspend/fade; and restoring focus does not play a backlog of hundreds of sound events.

Signal-level tests can check scheduled gain and envelope behavior. Human listening remains necessary for harshness, fatigue, and mix quality. Do not mark subjective audio quality proven solely from code inspection.

## 25.5 Competitive tests

Replay identical inputs on client and server. Reject modified equipment snapshots, expired entries, over-budget loadouts, duplicate results, cross-account claims, and seed substitution. Test simultaneous score submissions and event rollover. A forged local save must not alter online rank or premium entitlement.

## 25.6 Purchase tests

Sandbox scenarios: successful purchase, cancel, provider timeout, duplicate webhook, out-of-order webhook, refund before delivery, refund after equip, restored account, and unknown product version. All grants and revocations are auditable and idempotent.

## 25.7 Evidence requirements

Every milestone has tests, a playable path, screenshots, current README, and known limitations. Captures come from the actual current build. A concept rendering may be included only when clearly labeled as concept art; it cannot replace implementation evidence.

Keep test reports compact and reproducible. Do not add tests that merely assert a string exists in the implementation and call that functional verification. Test outcomes and invariants that matter to players.

# 26. Delivery roadmap and implementation instructions

## M0 — Bootstrap and execution discipline

Create the React/TypeScript project, development/build/test commands, lockfile, CI, README, status/backlog/decision/blocker documents, and basic asset pipeline. Establish the Git checkpoint loop and screenshot workflow. The repository already contains an implementation; bootstrap only genuinely missing components and never wipe existing work.

Acceptance: a clean checkout can install dependencies, start locally, run tests, and build. The README describes the real state. No server, payment integration, or native shell is required here.

## M1 — First-feel vertical slice

Build one full-screen yard, one wreck, a broken drone, manual salvage, repair, automatic collection, a sorter, one real route, and a furnace/export objective. Include sound, mute, reduced motion, save/resume, and concise contextual guidance.

Acceptance: no page scroll; first action obvious; repair creates visible automation; processing consumes actual inputs; sounds respond correctly; reload resumes. Capture phone and desktop views. Do not proceed to broad menus while this loop remains confusing.

## M2 — A useful small factory

Add copper separation, polymer recovery, circuits, motors, storage, power limits, route fairness, machine movement, and clear bottleneck guidance. Add a small research branch and first safe expedition.

Acceptance: at least two viable ways to spend the first meaningful upgrade budget; player can diagnose a starved or full machine; full offline cycle works without duplication; machine configuration is comfortable on a phone.

## M3 — Frontier and meaningful salvage

Add wreck composition, scan detail, restore/dismantle/sell choices, drone roles, hazard previews, named sectors, and faction contracts. Introduce deterministic encounters and replayable result reports.

Acceptance: equipment changes alter outcomes in explainable ways; failure does not strand the account; unique discoveries persist; expedition results survive patches via versioning.

## M4 — Long-run progression

Add district expansion, alternative recipes, specialization research, policies, prestige/founding, permanent unlocks, and large-number readiness. Build strategy simulations and migration tests.

Acceptance: founding creates new choices and a faster start; no tutorial repetition grind; economy remains stable across multiple runs; meaningful midgame decisions exist beyond buying the next percentage increase.

## M5 — Online authority and reliability

Implement identity, cloud saves, transactional commands, idempotent rewards, backups, observability, account recovery, and migration handling. Separate imported local sandbox progress from authoritative online progression.

Acceptance: concurrency and tampering tests pass; backup restore is rehearsed; credentials never enter the client or repository; unavailable server behavior is clear and non-destructive.

## M6 — Asynchronous competition and crews

Add standardized salvage races first, then crew projects and optional skirmishes. Explicitly label NPC opponents. Add replay integrity, eligibility, contribution caps, and moderation before open social features.

Acceptance: new players can participate meaningfully; purchased cosmetics cannot alter results; no home-base theft; event transitions and reward claims are safe.

## M7 — Commercial and streaming systems

Add cosmetic catalog, sandbox payments, entitlement reconciliation, refunds, spectator mode, crew join links, and safe audience votes. Native Twitch integration follows authorized credentials and current API review.

Acceptance: purchase flows are understandable and tested; no paid ranked advantage; streamer privacy options work; viewer actions cannot spend or destroy owner assets.

## M8 — Production art and public-readiness

Replace placeholders with consistent sprites, animation, music, and sound; optimize atlases; run real-device performance and battery tests; validate accessibility, privacy, support, and operational readiness. Public launch or paid provider changes require their applicable authorization, not an assumption from this file.

Acceptance: opening feels like a finished game; all claimed features work; no unverified mobile performance promises; known risks have explicit mitigation or release exclusions.

## M9 — Ongoing improvement

Continue indefinitely in bounded passes: new salvage archetypes, alternate factories, faction episodes, seasonal standardized challenges, usability improvements, performance reductions, reliability work, and content quality. Use evidence and preserve player trust.

A milestone can finish. The improvement mission remains active until the operator pauses or stops it. Do not generate increasingly elaborate systems simply to avoid saying a subsystem is good enough for now.

## Implementation order within a feature

Define player action and expected result → define state/data → define invariants and error behavior → implement simulation → test → implement UI/feedback → verify in browser → capture evidence → update README and progress → commit/push → inspect CI.

For a purely visual improvement, start from the existing behavior contract and verify it remains intact. For an infrastructure change, preserve the game loop and prove no regression. A new dependency needs a reason tied to a concrete requirement.

# 27. Launch content catalog

The catalog defines intended content families, not permission to expose all of them on day one. Unlock gradually and ship only content with complete behavior and art states.

## 27.1 Wreck archetypes

| Archetype | Common materials | Distinct choice | Hazard |
|---|---|---|---|
| Commuter shell | Ferrous/nonferrous fragments | Fast dismantle or intact motor recovery | Low |
| Delivery pod | Polymers, batteries, wiring | Restore cargo chassis | Electrical charge |
| Service kiosk | Circuits and copper | Decode terminal before stripping | Security alarm |
| Rail carriage | Steel and motors | Bulk extraction versus careful machinery recovery | Structural collapse |
| Cooling plant | Copper, pipes, additives | Repair useful coolant module | Corrosive leak |
| Security drone nest | Electronics and armor | Hack or fight | Active sentries |
| Freight crawler | Plates, engines, cargo | Heavy cutting investment | Patrol exposure |
| Data relay | Circuits, data, signal relics | Preserve versus dismantle | Disruption field |
| Reactor housing | Alloys and rare components | Long restoration project | Radiation/heat abstraction |
| Orbital fragment | Advanced alloys and unique technology | Crew-scale recovery | Multiple declared hazards |

## 27.2 Sector sequence

1. **Yard Perimeter:** Tutorial recovery and protected starter source.
2. **Rustbelt Verge:** Safe repeatable metal routes and first contract.
3. **Flooded Transit:** Cargo and insulation choices; copper-rich wrecks.
4. **Helix Freight Terminal:** Corporate sentries and valuable electronics.
5. **Cooling Fields:** Power and corrosion management; advanced processing.
6. **Silent Array:** Signal mystery and hacking specialization.
7. **Crawler Graveyard:** Heavy salvage and escort preparation.
8. **Orbital Elevator Foot:** Community reconstruction and distant aspirations.

Each sector needs a scan state, scene identity, encounter table, loot/material profile, progression gate, safe retreat behavior, and at least one reason to revisit after the initial discovery.

## 27.3 Early contracts

- First Steel: teach export and grant the initial credit budget.
- Keep the Lights On: deliver copper/wire to a Free Crews repair site.
- Spare Hands: restore or manufacture an additional recovery drone.
- Clear the Spur: recover a blocked transit wreck and unlock a route.
- A Signal in the Noise: decode a recovered controller.
- Helix Terms: choose a clearly explained exclusive short contract.
- Safe Return: complete a hazard-equipped expedition without hull loss.
- Foundations: contribute to the first district expansion.

Contracts must have unambiguous progress rules: produced, delivered, owned, or spent are different conditions. Buying an item should not count as “manufacture” unless explicitly allowed. Reward loops must not count their own rewards as repeated objective progress.

## 27.4 Cosmetic families

Foundry Amber, Rainline Cyan, Salvager Rust, Helix Ceramic, Choir Violet, and Free Crews Patchwork are proposed visual sets. Each should preserve machine readability. Do not launch a store with a dozen recolors before the free baseline art is satisfying.

## 27.5 Research examples

Efficient Cutters increases salvage work speed at a defined power cost. Gentle Extraction improves recoverable yield but lengthens work. Smart Buffers unlocks reserve thresholds. Route Dispatch improves logistics allocation tools. Shielded Wiring reduces electrical hazard exposure. Modular Chassis unlocks drone role conversion. Archive Recovery unlocks advanced signal interpretation. District Founding unlocks prestige only after the required reconstruction milestone.

# 28. Worked scenarios and edge-case rules

## 28.1 A player returns after 18 hours

The offline production cap is 12 hours under the current default. Simulate 12 eligible hours subject to actual constraints. Advance the stored reference timestamp through the full 18-hour absence so repeated reloads cannot claim another six hours. Settle a finite expedition whose completion time occurred during the absence exactly once. Do not launch new repeated expeditions in the discarded six-hour production window.

The report says approximately: **Away 18h. Your operation worked for 12h. Storage filled after 7h 20m. One expedition returned.** Show actual calculated gains, not rate × 12h when storage halted production sooner.

## 28.2 A route is deleted while carrying copper

A route has 12 copper in transit and an input buffer of 4. Remove the connection in a transaction. Return all 16 to a declared source/recovery buffer, respecting capacity through an overflow hold. Do not count returned material as new lifetime production or a contract delivery. Render a short recall effect if useful. No physical simulation of pieces falling on the ground is required.

## 28.3 Two machines compete for the last resource

Two equal-priority circuit assemblers each need 2 wire. Only 2 wire is available. The allocator selects one using persistent fair order, reserves its batch, and leaves the other waiting. Next opportunity favors the other if both remain eligible. Never reserve the same 2 wire for both.

## 28.4 A player changes equipment during a dispatched mission

The mission uses its dispatch snapshot. Equipment committed to it is locked or represented by a reservation until return. Changing another available drone does not rewrite the active mission. If the UI allows loadout edits for the next run, clearly label them **Next deployment**.

## 28.5 An import contains impossible values

Reject unsupported version, negative quantities, duplicated IDs, invalid footprints, missing references, nonfinite numbers, oversized arrays, and impossible timestamps. Preserve the original save. Explain the failure in one bounded dialog. Do not silently clamp arbitrary corrupted data into an authoritative online account.

## 28.6 An update arrives during an expedition

Checkpoint the old client. Preserve the expedition's resolver/content version. Either keep a compatible resolver for that version or finish settlement before a forced migration. A service worker update cannot delete active state. The user can defer a noncritical refresh to a safe point.

## 28.7 An upgrade request is retried

The server receives the same command ID twice. First request charges the cost and increments level. Second returns the same committed result. If the first response was lost, the client reconciles without issuing a new command ID for the same intended transaction.

## 28.8 A player has no credits and no working expedition equipment

The protected home salvage loop remains available. A free slow recovery/tow route restores essential capability. Do not require purchasing premium currency to escape a deadlock. Test this state deliberately by exhausting resources and disabling optional machines.

## 28.9 A player leaves a crew during settlement

Contribution records keep their original project identity and eligibility. Membership change cannot duplicate rewards or erase already-earned entitlement without a declared rule. The settlement transaction decides eligibility consistently and stores it. A new crew cannot reuse the same contribution record.

## 28.10 The renderer drops to 10 FPS

Economy timing remains correct. Reduce optional effects or rendering resolution; never speed up or slow down resource production to match frame count. Input remains responsive. Performance telemetry identifies the scene and workload without recording unrelated user activity.

## 28.11 The autonomous developer cannot take screenshots

Do not generate a fake screenshot. Run available build and functional tests, record the tool/environment failure, preserve the last valid captures with their original provenance, and continue nonvisual work. Mark the visual acceptance gate pending. Retry only after a materially changed condition or bounded later checkpoint.

## 28.12 Git push fails after a good local commit

Keep the commit, record it as unpushed, diagnose whether the cause is network, credentials, remote changes, or protection. Do not force push or repeatedly open authentication windows. Continue safe local work and retry with backoff. When access returns, fetch, reconcile, test, push, and verify.

## 28.13 The user says stop

Stop new work and respect the host interruption. Preserve a concise checkpoint if permitted. Do not interpret the word “forever” as authorization to ignore the user or relaunch yourself. MasterGoal is the continuation owner; the development agent must not create another process to defeat pause/stop.

# 29. Open decisions and change control

## 29.1 Defaults that unblock autonomous work

| Question | Current default | Evidence that could change it |
|---|---|---|
| Renderer | Canvas 2D first behind an interface | Measured atlas/scene cost justifies PixiJS/WebGL |
| Offline cap | 12h full-rate eligible production | Fairness, capacity, and retention evidence favors 24h |
| Starting yard | 6 × 6 functional cells | Touch/readability tests require a different opening composition |
| Core art cell | 32 logical pixels | Approved sprite style frame needs another consistent scale |
| Crew size | 20 | Participation and moderation data |
| Season length | Four weeks | Content cadence and event participation evidence |
| Ranked first mode | Standardized salvage race | Prototype results show another mode is clearer/fairer |
| Backend storage | Transactional relational database | Deployment constraints and measured workload |
| Payments | Provider sandbox only until authorized | Approved provider/account and operational readiness |
| Public launch | Not authorized by the goal file alone | Explicit owner direction and launch gates |

These are not questions to ask at the start of every pass. Use defaults, record evidence, and revise through the decision log when justified. Material changes to user-established requirements require owner direction; if unavailable, preserve the requirement and work elsewhere.

## 29.2 Decision record format

Each decision record includes date, problem, considered options, selected default, reason, affected requirements, reversibility, validation evidence, and conditions for reconsideration. Keep records short enough to use. Do not produce pages of abstract deliberation when a small reversible implementation will answer the question.

## 29.3 Contradictions

If two sections conflict, resolve by authority: explicit user requirement; autonomous execution contract; committed product requirements; specific system rule; example/tuning data. Record the resolution. Never silently use the ambiguity to skip a difficult feature.

Known supersessions in this reset: master prompt is `goal.md`; this specification is `docs/GAME_DESIGN.md`; React is mandatory; the historical repository-only-file handoff is complete; the old scrolling dashboard is rejected; current default offline cap is 12 hours; new tutorial/balance data supersedes the prior prototype's starting economy; the art grid baseline is 32 logical pixels.

## 29.4 What this document cannot guarantee

A file cannot guarantee endless runtime, unlimited context, network access, device availability, permissions, or commercial success. The plugin's current plain-prompt loop repeats the whole saved document, so document size has real context and processing cost. Keep durable operational checkpoints concise and use the supported image window; do not flood the prompt with screenshot payloads.

A massive specification cannot prove the game will be fun. Iterative playable evidence, human feedback when available, and disciplined correction are part of the goal. Missing evidence must be labeled, not invented.

# 30. Final definition of done

## 30.1 A feature is done when

Its player purpose is clear; state transitions and failure cases work; costs and rewards reconcile; persistence survives interruption; controls fit the viewport; accessibility alternatives exist where needed; feedback is readable and audible as appropriate; tests cover meaningful behavior; screenshots match the actual build; README and status are current; the coherent change is committed and pushed or its push blocker is explicitly recorded.

## 30.2 The first playable slice is done when

A new player sees a wreck, understands the first action, hears and sees satisfying recovery, repairs a drone, watches it automate the work, builds a processor, connects a real route, earns the first upgrade, and knows what to do next. All of this happens inside a full-screen game with no page scrolling. Closing and reopening preserves the experience correctly.

If that is not true, do not compensate by adding a store, more currencies, a leaderboard, or another navigation panel.

## 30.3 The ongoing mission

Keep improving Rustwake through bounded, evidence-backed work. Build the game, play it, inspect it, measure it, correct it, document it, and push tested progress to `origin/main`. Keep the user out of routine decision loops and keep their screen quiet. Respect their control, permissions, data, and time.

**Start small in the world. Make the first action satisfying. Let automation become something the player earns and understands. Grow depth without losing clarity.**

---

## Operational checkpoint template for future `docs/STATUS.md`

```text
Active milestone:
Last completed player-visible change:
Current commit and remote sync status:
Checks run and actual results:
Screenshot evidence and capture provenance:
Known blockers with exact unblock conditions:
Assumptions/decisions made:
Next three bounded tasks:
Long-running processes owned by this session:
Resume instructions:
```

## Backlog item template

```text
ID / title:
Player problem or engineering invariant:
Scope and explicit exclusions:
Acceptance criteria:
Dependencies:
Expected test/evidence:
Risk and rollback:
Status:
```

## Stop doing these things

Do not rebuild the old dashboard. Do not add page scroll. Do not show every system before teaching the first one. Do not claim decorative conveyors are logistics. Do not claim bots are players. Do not claim a screenshot proves gameplay. Do not claim a passing build proves mobile performance. Do not ask whether to continue after each task. Do not open a pile of windows. Do not erase the repository again. Do not force-push. Do not falsify tests, rewards, benchmarks, screenshots, or completion. Do not ignore a user pause or stop.

## Do these things on every meaningful pass

Read the checkpoint. Choose useful work. Make a coherent improvement. Verify it. Update the README and relevant evidence. Commit. Push to the authorized main branch when safe. Record the actual result. Leave the next pass ready to continue.


