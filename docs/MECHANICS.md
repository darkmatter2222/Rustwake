# Mechanics, currency design, and expansion contract

## Real V2 foundation
- Hidden 24x24 buildable parcel in a real rendered voxel 3D environment; road graph and 3 starter haulers.
- Starter yard includes a scrapyard extractor, depot, generator, furnace, market and crane. Physical vehicles reserve cargo at dispatch, drive to source/destination along connected road cells and deposit at the actual endpoint; no magical global output claim.
- Producers and processors have localized input/output inventory; depots hold global sellable materials. Different machines have distinct build costs, recipes, power, visual state and output limits. Player chooses structure, location and roads, not a prescribed pipe chain.
- Functional current currencies: credits, scrap, ferrous, copper, aggregate, diesel, water, steel, and data. Additional registered categories: alloys, gears, circuits, relics, influence, echo shards, charters, renown. Future tiers have explicitly incomplete sources/sinks.
- Research choices and tech tiers are scaffolding; improve balance and implement actual long-tail decisions.

## Desired progression
Tier 0: scrapyard, roads, trucks, active salvage and steel.
Tier 1: refined fuels, copper, foundry, player trade contracts, warehouse capacity, modular attachments.
Tier 2: circuits/gears, programmable dispatch, specialist vehicles, drones, forklifts, research branches.
Tier 3: sectors and outposts, contracts, risk and logistics network.
Tier 4: independent factory-supplied PvE defense and expeditions.
Tier 5: authoritative multiplayer realms, market escrow, asynchronous raids, co-op and protected reserves.
Tier 6: optional prestige, echo shards, land charter reset choices, faction collection, seasons and years-long progression.

For EACH currency identify earning actions, limiting constraints, sinks, inflation defenses, refund and duplicate command behavior. Never add icons for fake currencies without tracked mechanics. Long absences need deterministic jump settlement and save migration, not 12,000 recursive ticks or fabricated proofs.

## Invariants
No repeated build double charge, no cargo duplication, no resources created by a move/undo/reload loop, no illegal road through occupied building, no stuck vehicles silently losing cargo. Every hard failure offers a recoverable solution. Engines are time-independent from renderer FPS. A real-device UI pass is a separate gate.
