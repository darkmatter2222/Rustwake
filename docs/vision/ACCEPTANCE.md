# Acceptance and evidence matrix

These are required future checks, not assertions that the rebuilt game already passes. Each issue lists relevant IDs. Reviewer must record exact build SHA, seed/save, command sequence, expected/actual result, environment and artifacts. Automated geometry cannot certify art. Tests that merely mirror a function's implementation are insufficient.

| ID | Scenario and expected outcome |
|---|---|
| V01 | Opening scene matches approved simple voxel style: legible warehouse/sorter/furnace/depot/generator, coherent scale/palette, no cinematic detail creep. Actual desktop and phone views inspected by vision-capable reviewer. |
| V02 | Mature scene remains readable at default zoom with 20 buildings and 30 units; entrances/cargo remain identifiable; text is not painted into world textures. |
| V03 | 360-degree orbit, resize, inspector opening and camera reset preserve accurate selection and placement projection; no unreachable edge cells. |
| V04 | 60s activity clip shows independently timed mechanisms and event-driven cargo; paused/starved/unpowered machines do not fake production. |
| V05 | Construction clip at 0/1/2/3/4/5s shows base/frame/walls/roof/activation; reload mid-build resumes correct stage and charges once. |
| V06 | Asset bounds, sockets, pivots and door clearances conform to recipes. Truck fits warehouse/depot; four rotated footprints match occupancy. |
| U01 | Fresh user can select/place/rotate/cancel building without accidental charge. Occupied/outside/no-frontage/poor-terrain/insufficient-resource states explain recovery. |
| U02 | Mouse drag, pinch, twist and canceled pointer gestures never place/salvage/purchase unintentionally. Focused inputs suppress shortcuts. |
| U03 | 360x640,390x844,412x915,844x390,768x1024,1366x768,1920x1080,2560x1440 plus 200% text: no document scroll, clipped core action or sub-44px target. Long panels scroll internally. |
| U04 | Keyboard-only and screen-reader entity list can build, inspect, upgrade, trade, save and close dialogs; focus returns; status not color-only. |
| U05 | Research/upgrade comparisons show actual before/after cost/power/rate; two deliberate strategies and blind prominent-action policy tested from same seed. No universal auto-choice. |
| U06 | Storage full, vehicle stuck and power shortage each provide focus-and-fix path without requiring reset; offline report doesn't obstruct a short tab return. |
| U07 | Reduced motion/mute preserve all actionable information and simulation; audio permission gesture honored, no forced playback. |
| E01 | Resource conservation across stock/input/batch/output/cargo/reserved/overflow before/after every lifecycle command; currencies reconcile to ledger. |
| E02 | Duplicate command IDs and rapid double presses charge/grant once, including build/upgrade/contract/import/raid settlement. |
| E03 | Source competition: two carriers request last pallet; exactly one reserves it. Fair ordering prevents starvation over repeated opportunities. |
| E04 | Full destination, deleted road, moved building and recalled carrier preserve cargo/reservations and eventually recover or display exact blocker. |
| E05 | Truck travel length, speed, load/unload and bay contention affect measured throughput; decorative vehicles alone fail. |
| E06 | Automated policy respects reserve floors and filters; no deadlock after consuming all discretionary funds; slow recovery remains available. |
| E07 | Equivalent tick batches and offline event jumps produce identical ledgers/mission results for 1h/12h/18h absences, including capacity halt and clock rollback. |
| E08 | Save migration preserves old balances/progression or retains explicit legacy slot. Invalid/oversized/partial/duplicate-ID save changes nothing. Two tabs retain one writer. |
| E09 | Upgrade/respec/dismantle cannot generate resources through rounding, old-version refunds or repeated cancellation. |
| E10 | Every currency has reachable source/sink; no unlimited NPC conversion loop; new tiers create decisions rather than unexplained balances. |
| E11 | Fuel-empty fleet, power failure and no service parts recover via declared emergency route without premium purchases. |
| E12 | Different contract types support different production strategies under the same resources; deadline/partial settlement/retry behavior reconciles. |
| D01 | Seeded encounter replay matches damage, ammo, power and loot ledger exactly regardless of renderer FPS. |
| D02 | Wall placement cannot trap all enemies/friendly cargo without declared siege/invalid-placement behavior; target selection and ranges are deterministic. |
| D03 | Ammunition starvation, power brownout and repair-kit exhaustion visibly affect defenses; supply rerouting can recover. |
| D04 | Failure respects protected reserves/loss cap; no unattended permanent-home wipe; newcomer and opt-in rules tested. |
| D05 | Retreat/reload/disconnect/update during expedition locks loadout snapshot and settles remaining cargo exactly once. |
| D06 | At least two defensive compositions succeed under different wave mixes; single turret spam is not universally dominant. |
| N01 | Forged client inventory, imported local save, ownership spoof and altered replay cannot mint online assets. |
| N02 | Concurrent order fills/cancel, retries, dropped responses and server restart yield one atomic escrow result; no negative balances. |
| N03 | Raid defender changes after snapshot cannot change active battle; simultaneous attacks cannot exceed reserved exposed stock or loss cap. |
| N04 | Same-target cooldown/newcomer protection/opt-out rules and collusive reward loops tested. Server authority verified, not mocked as full integration evidence. |
| N05 | Co-op contribution after leave/join retains correct reward entitlement and cannot be duplicated. |
| N06 | Backup restoration plus content/resolver migration preserves trade/mission IDs; rolled-back client cannot replay rewards. |
| P01 | Defined normal/stress/battle benchmark reports p50/p95 frame/input times, draw calls, memory, device and quality tier. No actual phone claim from emulation. |
| P02 | Warmed repeated operation shows bounded memory/object counts; hidden-tab rendering and context-loss recovery retain save integrity. |
| P03 | Cold transfer/load and quality fallback meet prospectively recorded budgets; missing hardware evidence remains explicit blocker. |
| R01 | Issue/PR/current-SHA QA/product verdict and CI all linked; deployment separately verified against served SHA. |
| R02 | New runtime reads #121/Project2/current role and respects 5-session cap, cancellation, nonoverlapping worktrees and quiet wait. |
| R03 | Measured token/tool counts on comparable assignments show role budgets loaded; savings never claimed from prompt edits alone. |

## Release fixtures

OPENING: starter seed and economic state in GAME_SYSTEMS. CHOICE-LOCAL: short transport route, processing bottleneck. CHOICE-REMOTE: long route, hauling bottleneck. BLOCKED: full storage plus occupied bay. MATURE: 20 buildings/30 units/200 cargo representations. STRESS: 100 buildings/100 units/1000 jobs. DEFENSE: three documented enemy mixes with equal spending. ONLINE: concurrent trade/raid fixtures using actual staging database. Fix seed and time before before/after captures; preserve raw logs and raw captures with metadata.

## Gates

- G0/P0: R02, V06, V03 prototype, E01/E08 baseline, P01 initial measurement; architecture and renderer selected after bounded spike.
- G1/P1: V01-06, U01-07, E01-09, P01-03, R01. First playable loop complete. Vision-capable review mandatory.
- G2/P2: E10-12, expanded E03-09, U05 and outpost/contract/research walkthrough; multi-day simulated progression and at least two useful strategies.
- G3/P3: D01-06, stress P01/P02, risk UI and finite offline defense. Industry visibly supplies battle.
- G4/P4: N01-06 and real staging operational drill, D04/D05, R01. Public launch requires actual environment authorization and release decision.
- P5: all affected migration/economy checks plus repeatable content pipeline and permanent-home preservation.

## Evidence template

Role / issue / PR / immutable SHA; scenario+seed+save hash; device/browser/quality; commands; expected and actual; tests with exit codes; screenshot paths; motion/audio evidence; capability gaps; ACCEPT or REWORK with actionable defects. Distinguish simulated agent usability from human research. Reviewer cannot be the implementation author, even though all GitHub posts share one account. No one must expose private reasoning; report decisions, evidence and outcomes.
