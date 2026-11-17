# Resource and currency ledger — normative game systems

The foundation's registry contains **17 categories**; most advanced source/sink loops are not yet complete. Treat a resource identifier as a data definition, not proof that players can acquire or spend it. In-game progress must depend on player decisions about production, road topology, input shortages, truck capacity, energy and meaningful specialization, not repetitive button sequences.

| ID | Category | Current / intended source | Current / intended sink | State |
|---|---|---|---|---|
| credits | commercial | sales/contracts | buildings, roads, research, fees | partial |
| scrap | base material | salvager / wreck | construction, crusher, refining | partial |
| iron | base material | salvage/crusher | furnace/steel | partial |
| copper | base material | salvage/refining | alloys/circuits | partial |
| stone | base material | parcels/quarries | roads/building foundation | starter supply only |
| fuel | utility | salvage/refinery | smelter and vehicles | vehicle consumption missing |
| water | utility | reclamation | refining/cooling | source loop missing |
| steel | manufactured | furnace | advanced buildings/modules | partial |
| alloy | advanced | foundry | structures/defense | partial |
| gears | advanced | fabricator | vehicles/mechanics | partial |
| circuits | advanced | fabricator | research/automation | partial |
| data | research currency | observatory/contracts | tech branches | partial |
| relics | rare | exploration/salvage wrecks | unique blueprints | placeholder |
| influence | diplomatic | contracts/reputation | faction access/trade | placeholder |
| shards | prestige | opt-in run milestones | persistent mastery | placeholder |
| charters | expansion | frontier goals | parcels/outposts | placeholder |
| renown | prestige/faction | faction achievements | doctrine/content | placeholder |

## Ledger model
Keep depot inventory, building input/output stores, reserved resources, each vehicle cargo, overflow and spendable currencies as **distinct** categories. A delivery of 10 iron from depot to furnace should move depot available -10 and reserved +10 at allocation; at actual pickup reserved -10 and vehicle cargo +10; on arrival vehicle cargo -10 and furnace input +10. Never duplicate goods by recording both reserved AND vehicle cargo as spendable. Recipe processing consumes stated inputs and creates only stated outputs; mass conversion is recipe-defined rather than simple same-item equality. Save/reload and interrupted routes must preserve these totals.

## Source/sink acceptance per currency
A complete implementation needs: at least one reachable source, one meaningful sink, pricing/capacity, anti-inflation constraint, save-replay/duplicate-command safety, a player-facing explanation and a real unit/integration test. If a currency is a placeholder, mark its UI as locked/roadmap, not an active feature. No unlimited NPC conversion profit, repeated sell/refund exploit or async raid double payout.

## Meaningful choices
Test same-seed factory strategies: transport-heavy route/fleet investment vs processing-heavy upgrades; both must progress, one must not universally dominate. Compare throughput, road/bay latency, shortages, input utilization, power, fuel, costs and time to first steel. Deep industry adds module builds, research branches, trucks/maintenance and outpost specialization. PvE must use factory-supplied ammunition/repairs; future trade/raid uses server authority, atomic escrow and bounded losses.

## Long-term idle honesty
Current V2 has a short capped offline catch-up and initial research; it is not deterministic multi-month settlement or evidence of years-long fun. G2 needs event-jump equivalence for 1h/12h/day/week, clock rollback, storage full, power loss, traffic and save migration. G5 requires actual player studies and measured economics, not fabricated historical experience from accelerated ticks.
