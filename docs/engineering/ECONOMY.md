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

## Construction ledger (#370, implemented)
`game.ledger` (capped at the last 64 entries, persisted in the v2 save) records every construction transaction with exact deltas:
- `build`: `cost` = full blueprint cost, spent exactly once after `checkSite` returns OK; `refund` = {}.
- `reject`: failed confirmation (collision, unsurveyed, parcel, terrain, slope, bay, frontage, funds, …) carries the exact `code`/`reason` with `cost` = {} and `refund` = {} — a rejected attempt never moves stock.
- `cancel`: mid-assembly cancellation refunds the FULL blueprint cost (`refund` equals the originating `build.cost`); the bank returns to its exact pre-build state.
- `salvage`: completed-machine dismantling refunds floor(40% of each cost) plus the machine's actual inventory; `refund` matches the deposited amounts.
Conservation acceptance: free hover/selection is pure (whole-grid `checkSite` leaves a deep snapshot unchanged); duplicate placement is refused without a second charge; build→cancel is bank-neutral; ledger build.cost == cancel.refund. Tests: tests/gridOccupancy.test.mjs (same-seed determinism, exact reasons, fixture replay) and tests/fixtures/save-v2-occupancy.json (generated through the real public API, replay-conserved). The live-preview capture (scripts/capture-v2.mjs) proves reject-with-zero-spend, single-charge build and full-refund cancel on desktop with screenshots.

## Freight ledger (#384 LOG-04, implemented)
`game.freightLedger` (capped at the last 128 entries, persisted in the v2 save) is separate from the construction `game.ledger` and never touches finance (sales/credits) or occupancy (#370). Source stock (depot = bank, building inventories), reserved load, actual onboard truck cargo and destination stock are **distinct** ledgers; the normative example above is now the implemented behavior:
- `reserve`: allocation takes units from the source bag exactly once into a `toSource` job (depot available -10, reserved +10). The truck carries NO cargo yet.
- `pickup`: at the source, the validated reservation becomes onboard cargo (reserved -10, vehicle cargo +10); phase flips to `toDest`. Pickup refuses a stale phase, an already-loaded truck or an empty job.
- `arrive`: at the destination, cargo must exactly match the job (resource AND amount) before it is deposited (vehicle cargo -10, destination input +10). A mismatched load or vanished destination returns the freight to its source instead of teleporting goods into the bank.
- `return`: cancel (`CANCELLED`), severed route (`ROUTE_BLOCKED`), vanished source/destination (`SOURCE_MISSING`/`DEST_MISSING`), invalid pickup/arrival (`PICKUP_INVALID`/`ARRIVAL_INVALID`) or runtime job loss (`JOB_MISSING`) returns whichever SINGLE ledger holds the units — onboard cargo if picked up, otherwise the reservation — to the source bag (bank if the source is gone). Never both.
- `reconcile`: on reload, before offline catch-up, inconsistent saves are repaired cargo-authoritatively (`PHASE_STALE`, `JOB_MISSING`, `CARGO_MISSING`, `CARGO_MISMATCH`); excess fleet beyond 12 trucks returns its freight (`FLEET_CAP`) before the trucks are dropped.
Conservation acceptance: `freightTotals(g)` sums bank + building inventories + reserved (`toSource` jobs only) + onboard cargo per resource without double counting, and is asserted constant at EVERY tick in tests/freight.test.mjs (13 tests: exact reserve/pickup/arrive deltas, mid-haul and toSource route severance, cancel/restart without duplication, vanished source/destination, tampered-cargo arrival refusal, save/reload round-trip, corrupt-save reconcile, fleet cap, multi-carrier conservation). `freightManifest(g)` exposes the four ledgers for UI/audit. Visual load: world.js renders resource-tinted crates derived ONLY from `v.cargo` (count clamp(ceil(amount/5),1,3)) and stamps `freightLoaded`/`freightOnboard` on the canvas dataset; scripts/capture-freight.mjs proves stamps + fleet panel + bank strip + persisted ledger agree on the production preview (docs/evidence/384-log-04/, PASS_NUMERIC_ONLY — sponsor G1 #276 visual review still required).

## Source/sink acceptance per currency
A complete implementation needs: at least one reachable source, one meaningful sink, pricing/capacity, anti-inflation constraint, save-replay/duplicate-command safety, a player-facing explanation and a real unit/integration test. If a currency is a placeholder, mark its UI as locked/roadmap, not an active feature. No unlimited NPC conversion profit, repeated sell/refund exploit or async raid double payout.

## Meaningful choices
Test same-seed factory strategies: transport-heavy route/fleet investment vs processing-heavy upgrades; both must progress, one must not universally dominate. Compare throughput, road/bay latency, shortages, input utilization, power, fuel, costs and time to first steel. Deep industry adds module builds, research branches, trucks/maintenance and outpost specialization. PvE must use factory-supplied ammunition/repairs; future trade/raid uses server authority, atomic escrow and bounded losses.

## Long-term idle honesty
Current V2 has a short capped offline catch-up and initial research; it is not deterministic multi-month settlement or evidence of years-long fun. G2 needs event-jump equivalence for 1h/12h/day/week, clock rollback, storage full, power loss, traffic and save migration. G5 requires actual player studies and measured economics, not fabricated historical experience from accelerated ticks.
