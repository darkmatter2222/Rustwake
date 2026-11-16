# Game systems and initial tuning

All numeric balance values here are explicit prototype defaults, not measured retention results. Product may tune them through recorded experiments without changing the sponsor's core systems. Never treat the concept screenshot's counters as an economic fixture.

## Core loops

Seconds: observe machinery, transport and construction. Minutes: choose a bottleneck, place infrastructure, assign a route, fulfill a contract. Hours: unlock a capability, specialize a yard, prepare a convoy or defense. Days: establish an outpost, rebuild infrastructure, discover equipment. Months: realm specialization, shared projects, collection and optional seasonal frontier. Automation executes player policies; repeated clicking is neither required production nor a hidden optimal strategy.

## World and placement

P1 starts with owned 24x24-cell flat land; expansion buys contiguous 8x8 parcels after milestones. Seed determines salvage locations, not arbitrary inaccessible starting layouts. Land, footprint, terrain support, road/belt socket, clearance and construction reservation validations run in the simulation transaction. A building may be placed without a route only if the UI explicitly warns that it will await service and a feasible route remains possible. Never silently rotate/move another building. Buildings occupy integer cell rectangles, rotate by quarter turns; decorations use finer visual placement but cannot obstruct invisible navigation. Roads are an independent graph with turns, lanes and loading-bay connectors. Terrain ramps/bridges and elevated belts arrive in P2; arbitrary sculpting and multistory factories are deferred beyond this roadmap.

## Construction, movement and upgrades

Reserve complete cost on confirmed placement. Create construction entity with start/completion tick; consume/reserve materials in one ledger entry, never again on animation completion. P1 assembly finishes in five simulated seconds; later major projects can have meaningful build work supplied by crews. Cancel before completion returns unused/reserved material according to displayed formula; initial default 100% if no work began, 90% after beginning. Completion after reload/offline settles once.

Building upgrades: base levels 1-5 with modest throughput gains (initial +10% additive per level) and increased demand. At levels 3 and 5 choose modules: throughput, efficiency or buffer capacity. Initial branch tradeoffs: throughput +25% processing with +35% power; efficiency -25% power with -10% speed; buffer +50% input/output capacity with no speed gain. Show net values after all modifiers. Respec at depot/workshop consumes a modest declared material fee; no irreversible early trap.

Vehicle upgrades occur parked at depot after cargo settles: cargo rack +50% payload/-15% speed; engine +20% speed/+25% fuel; armor +40% hull/-15% payload; battery +50% range/+10% service time. These are starting hypotheses; equipment slots prevent stacking every upside. A vehicle assigned to a dispatched mission is locked to its dispatch snapshot. Repair uses parts and credits; an essential slow recovery/tow path is always available without premium currency.

Move costs a displayed service charge (initial 10% original build cost, rounded up per material, waived during first teaching placements). Drain/recall in-flight cargo to declared recovery storage before topology changes. Dismantle refunds 80% build materials, returns all inventories/reservations exactly once, and lists lost installed consumables before confirmation. Overflow is a non-spend-duplicating ledger with visible recovery, not deleted material. Upgrade/refund formulas are versioned so older purchases cannot be exploited under new values.

## P1 playable economic seed

Start with functional warehouse, generator, recovery crane and one utility hauler, plus scrap 120, ferrous 12, steel 12, credits 60. Seeded exposed scrap reserve 240; free slow manual recovery yields 2 scrap per completed 2s interaction and cannot be boosted by click spam. Automated crane recovery yields 1 scrap/s when haul/storage available. Reserve a reachable replenishing low-yield salvage source so spending everything cannot deadlock the yard. Starter funds deliberately buy both first processors, then a scarce-steel choice appears.

| Structure | Build cost | Function | Power request |
|---|---|---|---|
| Sorter | 30 scrap, 4 steel | 2 scrap -> 1 ferrous + 1 nonferrous / 4s | 1 |
| Furnace | 35 scrap, 4 steel | 2 ferrous -> 1 steel / 4s | 2 |
| Warehouse expansion | 30 scrap, 8 steel, 20 credits | +200 cargo units; bay sold separately | 0 |
| Depot | 45 scrap, 8 steel, 30 credits | Vehicle building/service | 1 while active |
| Extra hauler | 12 steel, 30 credits | Payload 12; speed 2 world units/s | Fuel in P2 |
| Furnace module | 12 steel, 30 credits | Selected branch comparison | Derived |
| Generator expansion | 20 scrap, 8 steel, 25 credits | +4 supply | Producer |

Warehouse starts at 300 units, one usable bay (second visible bay may be locked, clearly marked). Initial generator supplies 6. First sale contract: 10 steel -> 50 credits, repeatable baseline buyer later with lower reward. First real choice is another hauler versus furnace investment; compare in two layouts with different travel bottlenecks. Do not claim balance valid until scenarios are measured. P1 does not require fuel before fuel production and emergency reserves exist.

## Resources and currencies

Physical material families: scrap, ferrous, nonferrous, residue; steel, copper, polymer, wire, plates; circuits, motors, batteries, alloys, chassis; fuel, ammunition and repair kits. Every physical quantity lives in exactly one stock/buffer/batch/cargo/reservation/overflow container. Currency ledger is separate from cargo.

| Currency | Source | Sink | Introduced |
|---|---|---|---|
| Credits | NPC sales/contracts, later player orders | Vehicle/service/building costs and trade fees | P1 |
| Research Data | Signal lab and archive recovery | Tech branches and doctrine research | P2 |
| Salvage Cores | Rare PvE wreck components | Major machine/vehicle conversions | P3 |
| Faction Scrip | Specific faction contracts | Faction modules and blueprint access | P3 |
| Charter Marks | Reconstruction milestone achievements | New outpost charters/region capacity | P2 |
| Defense Merits | First-clear and scored PvE defense challenges | Defense doctrine unlocks and cosmetic records | P3 |

Defense Merits are account-bound, not obtained by farming a friend's raid. Research Data and marks are not tradable. No premium currency, loot boxes or payment system in this plan. Do not split credits into meaningless synonyms. Show a currency only after its source and sink are taught. Late currencies need repeatable meaningful sinks; model circulation and stockpiles before adding more.

Power is capacity allocated per tick, not inventory money. Fuel is cargo consumed by travel/work; batteries are physical items/capacity for electric equipment. Reputation is faction standing, not another spendable wallet unless explicitly designed later. Non-tradable progression is never laundered through crafted items without a reviewed rule.

## Production and research

Retain useful existing recipes and integer accounting; extend with motors/batteries/chassis and defense supply. Suggested starting formulas: 2 steel + 2 wire -> motor; copper + polymer + steel -> battery; 3 plates + 2 motors + 2 circuits + battery -> chassis; 2 steel -> 12 kinetic ammunition; plate + polymer -> repair kit. Exact cycle/power and market values must be in content data with provenance. No lossless conversion cycles or NPC buy/sell arbitrage.

Alternate recipes exchange time, power, yield or byproduct handling. Gentle salvage yields intact components but takes longer; crushing produces bulk scrap quickly. Specializations: recycler, precision manufacturer, freight operator, expedition supplier. All remain viable solo; trade accelerates specialization later without making single-player progression impossible.

Research branches: Logistics (dispatch, bays, rails), Power (storage, electric fleet), Processing (recipes/modules), Exploration (scanner/convoy equipment), Defense (targeting/ammo/repair doctrine). Unlock capabilities before piling on percentages. Show prerequisites, sources and costs; never auto-spend data. Research follows deterministic completion and survives offline/save changes.

## Logistics simulation

Job lifecycle: request -> reserve source stock and destination room -> assign compatible carrier -> travel to source -> load -> travel -> unload -> settle -> release reservations. Reservation IDs prevent double assignment. Cargo cannot exist simultaneously at source and carrier. Partial unload retains remaining cargo; a blocked job reports reason. Deleting a route cancels only unstarted jobs and safely recalls active cargo. Vehicle destruction in risky combat moves cargo to explicit wreck/loss ledger according to mission rules, not generic disappearance.

Dispatch score uses player priority, starvation age, distance and capacity; ties are deterministic by job ID. Reserve floors, filter lists and minimum fill govern job creation. Dynamic topology version invalidates affected routes; unreachable jobs back off and remain inspectable. Use bay reservations and safe intersection occupation, bounded queues and yielding. No free-form rigid-body traffic pileups. Congestion is a recoverable strategic constraint; stuck jobs surface after a defined timeout with safe reroute/recall.

Transport roles: workers carry 1 unit short distance; forklifts move 4-unit pallets locally; haulers carry 12 units flexibly; later trucks carry 24-48; drones carry 2-4 expensive urgent units; trains carry bulk between outposts. Values tune through tests. Loading time and bay capacity are separate from road speed. Drone flight still reserves cargo/destination and consumes energy; air travel is not instant teleportation. Cars serve scouting/maintenance, not mandatory decorative loops. Only a bounded representative population is rendered at far zoom; all simulation jobs remain accounted for.

## Contracts and outposts

Contracts specify exact goods, reward, deadline, delivery destination, optional reputation and failure policy. Reserve commitments explicitly; partial deliveries settle by contract ID. Never silently sell protected factory inputs. NPC baseline buyer and slow salvage keep recovery possible. Market prices are capped/content-defined until a server market exists. Outposts have distinct resource niches, local buffers and transport links; UI switches detailed scenes while background simulation continues. Chartered expansion consumes marks only once, not on reopening a scene.

## PvE tower defense

Industrial activity raises a visible local threat budget. Start defense only after player unlocks and builds the first defense capability; protected home never suffers unbounded destruction while absent. Scouted waves have route, arrival window, composition hints and reward preview. Early enemies: scavenger (fast/light), armored crawler (slow/armor), sapper (targets exposed power). Later air threats require forecast and available counters, never surprise hard-lock.

Defense assets: kinetic turret consumes ammunition, arc turret consumes large power, mortar handles clustered slow targets with travel delay, walls shape routes, gates preserve friendly transport, repair station consumes kits. Initial kinetic tuning: 6-unit range, 1 shot/s, 5 damage, magazine 20; armored enemy applies a documented armor reduction with minimum 1 damage. All target priorities and projectile resolution deterministic. Enemy navigation cannot be invalidated by sealing every path: preview illegal seal or define siege behavior explicitly. No arbitrary teleporting enemies through walls.

Player priorities: nearest/core threat/armored/air, ammo reserve allocation, power priority and repair budget. Wave auto-defense policy reserves supplies and maximum exposure before idle settlement. Without opt-in, queued assaults wait or resolve in a protected mode with no structural loss; finite opted-in defense resolves once. Failure damages repairable facilities and loses exposed mission/defense cargo up to shown cap; essential recovery loop remains.

Defense challenge maps provide opt-in longer wave runs with escalating compositions. Rewards emphasize first-clear, efficiency and diverse viable builds; diminishing repeat returns prevent a single trivial farm. Merits buy doctrines, not raw paid dominance. End a run at a deliberate extraction checkpoint; permanent home progression remains.

## Expeditions and player raids

PvE missions use scouting -> loadout -> reserve equipment/supplies -> dispatch snapshot -> seeded resolution with bounded interventions -> return -> settlement. Fast extraction, careful dismantling and assault differ in risk/yield. Recover intact machines, unlock sections of wrecks, restore bridges and power stations. Retreat returns remaining equipment/cargo under declared rules. Duplicate result delivery cannot grant twice.

P4 asynchronous player raids target explicitly exposed outpost cargo/convoys, not unlimited home destruction. Defender configures layout and reserve; server snapshots and locks the affected exposed pool for the raid settlement window. Attacker scouts approximate defenses, selects loadout, sees maximum stake, then commits. Deterministic server resolver produces signed/versioned replay events; clients animate but cannot award resources. Defender upgrades during a raid affect future snapshots only.

Prototype fairness defaults: newcomer protection until explicit PvP opt-in; at most 10% of exposed outpost stock can be lost per successful raid, protected minimum unaffected; one settled hostile raid per target per 12h plus post-loss protection; 24h same attacker-target reward cooldown; attacker equipment risk shown and capped by committed convoy. Tune caps with abuse tests and product decision, never hidden. Reward cannot exceed actual removed exposed stock plus bounded NPC-authored challenge reward. Pair farming, alts, collusion and repeated targeting require server controls and economy telemetry. No chat/private-data collection necessary for first online version.

## Realms, trade and longevity

Permanent home + shared realm market + cooperative projects. Server owns inventory, trade escrow, orders, realm membership, raid resolution and entitlement. Buy order reserves currency; sell order reserves goods; atomic fill transfers exactly once; cancel releases remaining escrow. Shipping reserves physical cargo and schedules arrival; fees are disclosed. Client offline imports cannot mint online wealth. Existing local saves remain local or enter a noncompetitive legacy mode; trusted online progression starts from server-established state.

Co-op projects record immutable individual contribution IDs and fair settlement even if membership changes. Visits are read-only by default; blueprint sharing transfers layout instructions, never unlocks/materials. Collections preserve discoveries, names and cosmetics. Optional seasonal frontier adds regions and constraints while permanent home stays intact. New content uses versioned recipes/mission resolvers, migrations and rollback. No daily-login punishment, forced home wipe or manufactured scarcity to sell relief.
