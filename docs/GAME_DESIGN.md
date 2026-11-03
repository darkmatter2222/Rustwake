# Game design

## Player promise

Start with a broken drone. Reclaim an industrial world. Your factory does useful work while you live your life; active play changes what it can accomplish.

Portrait mobile web is the primary surface. Desktop doubles as an ambient second-screen and future streaming view. No precision platforming, object physics or mandatory synchronous raids.

## World

An autonomous industrial network outlived its human operators. Its reclamation directive now threatens the settlements surviving between its factories. Wrecks contain resources, forgotten technology and evidence about why the network changed.

Free Crews are the player's independent community. Reclamation Authority is the hostile machine network. Helix Combine enforces exclusive corporate salvage rights. Signal Choir believes the emerging signal may be an intelligence worth protecting. These are initial fictional concepts, not yet a completed narrative campaign.

## Core loop

Recover wreckage → separate materials → manufacture equipment → equip expeditions → discover new salvage → improve the factory.

Short visit: inspect bottlenecks, commission an upgrade, dispatch a recovery team. Longer visit: reconfigure production and experiment with loadouts. Away: bounded automatic production, with a clear return report.

## Prototype balance

Starting funds: 180 credits. Three running machines: dock, sorter, furnace. Starting materials prevent an empty-screen stall.

| Machine | Credit cost | Inputs per second | Outputs per second |
|---|---:|---|---|
| Salvage dock | 45 | None | 1.5 scrap |
| Scrap sorter | 65 | 2 scrap | 0.65 steel + 0.35 copper |
| Alloy furnace | 95 | 0.5 steel | 2.5 credits |
| Circuit press | 140 | 0.25 steel + 0.5 copper | 0.2 circuits |
| Signal lab | 170 | 0.1 circuits | 0.15 research |

Inputs and outputs scale with machine level and research. A machine throttles to available input; displayed output is capacity, not a guaranteed rate. Ordering and shared inventory are prototype simplifications. Upgrades cost floor(base cost × 0.8 × 1.65^(level−1)), capped at level 25 for this build. These numbers are starting hypotheses, not a validated multi-year economy.

Credits fund construction and expeditions. Research funds technology. Scrap, steel, copper and circuits are production resources. Reactor cores are reserved for future prestige and not currently earnable. No premium wallet or purchase flow exists yet.

## Competitive principles

Protect the permanent home factory. Risk expedition supplies and optional rewards. Rank salvage races using comparable equipment budgets, not cumulative spending. Long-term progression opens choices, cosmetics and specialization. Clearly label NPC rivals. Add social moderation before public chat, trading or user-generated names.

## Monetization direction

Sell identity: machine skins, drones, yard themes, supporter packs and cosmetic passes. Never tie basic offline collection to a paid subscription in the foundation. No payments until accounts, entitlement reconciliation and refund handling exist. Pricing and provider selection need separate market and compliance review at implementation time.

## Long-run depth

Expand via alternative recipes, material traits, equipment budgets, faction specialization, district modifiers, prestige choices and community projects. Procedural combinations need constraints so variation creates decisions rather than arbitrary stat inflation. Retention is not guaranteed by endless numbers; validate the first hour and repeat visits before optimizing for years.
