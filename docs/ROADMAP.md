# Rustwake roadmap

This is an ordered product roadmap, not a claim that all planned systems are already implemented. Milestones are gated by evidence rather than invented completion dates.

## M0 — Playable foundation (implemented)

React + TypeScript + Canvas 2D. Five machines, grid placement, automatic production, timed PvE recovery, upgrades, research, contracts, local saves, bounded offline progress, mobile layout, reduced motion and faction introduction. Tests cover economy and save invariants. See VALIDATION.md for checks actually performed and limits.

## M1 — Prove the factory loop

- Onboard the first 10 minutes with contextual goals and clear bottleneck explanations.
- Add machine move/salvage actions with explicit refunds, yard expansion, storage limits and inventory history.
- Prototype meaningful routing: drag a connection between machine ports; validate reachability; aggregate transport capacity rather than simulate every scrap particle.
- Compare routing against shared inventory in mobile usability sessions before committing to conveyor complexity.
- Content: at least 12 useful production chains with alternative inputs and material sinks.
- Versioned save migrations and rollback recovery; IndexedDB storage and single-writer tab ownership.
- Service worker, offline boot, install icons, update notification and cache migration tests.
- Acceptance: a new player can build a functioning research chain unassisted; production bottlenecks are understandable; no resource duplication or loss under suspend/resume/import.

## M2 — Progression that changes decisions

- Expandable districts with environmental modifiers and new processing constraints.
- Salvage items with material composition, damage, size and recoverable technologies.
- Dismantle vs repair vs sell decisions; cargo weight and power budgets.
- Research branches and build specializations; avoid mandatory linear upgrades everywhere.
- Prestige: found a new yard with permanent reactor cores. Show exact losses and retained benefits, preview gains, require confirmation. Never reset purchases.
- Long-run numeric representation: design logarithmic/big-number quantities before balances approach Number precision limits; migrate saves and formatting together.
- Economy model for 1 day / 1 week / 1 month / 1 year; explicit production sources, sinks and inflation limits.
- Acceptance: at least three viable specializations; prestige unlocks strategy instead of repeating the same clicks; automated long-run simulations detect deadlocks and runaway inflation.

## M3 — PvE frontier

- Seeded sector generation from wreck archetype × condition × faction × hazard × discovery.
- Tactical drone equipment with limited budgets and meaningful counters.
- Deterministic combat replays, threat previews, defeat outcomes and protected home progress.
- Named NPC rivals clearly identified as NPCs; faction reputation and branching contracts.
- World bosses and larger wrecks use the same bounded simulation primitives.
- Acceptance: reproducible outcomes from a seed and command log; failure costs are visible; no hidden requirement to stay online.

## M4 — Secure online foundation (before competition or purchases)

- Account identity, recovery, cloud saves and account deletion.
- Server-authoritative economy with server timestamps and versioned commands.
- Idempotent mutations, transactional reward grants, request throttling and audit ledger.
- Never upload local resource totals as trusted progress. Define a separate solo/imported sandbox and a clean online season.
- Postgres (or evaluated transactional equivalent), authenticated API and background job processing; load-test before selecting final hosting topology.
- Privacy/retention policy, observability, backup restoration and incident playbook.
- Acceptance: parallel requests cannot duplicate rewards; retry/replay and clock-tampering tests pass; backup recovery is rehearsed.

## M5 — Asynchronous multiplayer

- Crews, bounded contribution slots, shared dismantling projects and opt-in invitations.
- PvP salvage races with fixed equipment budgets or standardized loaner equipment.
- Matchmaking by progression bracket; seasons, replay verification and anti-collusion controls.
- Protection from paid combat advantage; no home-base looting while players are away.
- NPC practice remains explicitly labeled; never fabricate live players or rankings.
- Acceptance: new players have meaningful contributions; daily participation caps prevent compulsive attendance requirements; authoritative score verification withstands adversarial tests.

## M6 — Sustainable revenue and community

- Direct-purchase cosmetic machine skins, drone styles, yard themes and supporter packs.
- Cosmetic seasonal pass with clear contents, pricing, expiry and claim behavior.
- Payment-provider integration with verified webhooks, idempotent entitlement grants, refunds and reconciliation.
- No paid randomized loot at launch; no paid ranked advantage.
- Streamer spectator layout, crew join links/QR codes and rate-limited audience votes.
- Twitch integration only after authentication, moderation and platform requirement review.
- Acceptance: cosmetics are readable on mobile and cannot disguise opponent equipment; refunds revoke correct entitlements without corrupting progress.

## M7 — Art, scale and distribution

- Production sprite atlas, faction environments, animation and audio pipeline.
- Real Android Chrome and iOS Safari performance matrix, thermal/battery tests and long-session soak testing.
- Profile Canvas 2D. Move renderer behind the same interface to PixiJS/WebGL only if measured constraints justify it.
- Evaluate native web shells after web retention is demonstrated. Keep simulation platform-neutral; expose storage, lifecycle, purchase and notification adapters.
- Review then-current store/payment requirements before native distribution.
- Acceptance: playable without native APIs; no native wrapper is required for web users; purchase/account recovery works across supported distribution channels.

## Highest-priority next work

1. Real-device usability and performance measurements.
2. Onboarding and visible input-starvation status.
3. Save migration, recovery and single-tab ownership.
4. First meaningful routing experiment.
5. Salvage item variety and progression balancing.

Do not start a player market, guild wars or microservices before the solo loop proves fun. Art production can proceed in parallel with gameplay, but atlas dimensions and animation states should follow the art brief.
