# Sponsor intake — preserved text and interpretation

Source file: `SPONSOR_INBOX.md` (root), text below the `<!-- WRITE BELOW THIS LINE -->` marker, read 2026-11-06 with `git status` showing ` M SPONSOR_INBOX.md` (so the local edit is newer than the last published snapshot). No `work/sponsor/intake/*.json` receipt exists on disk yet, so these two requests are **unacknowledged** and remain in the inbox: the release engineer runs `node scripts/sponsor-inbox.mjs snapshot` then `ack` after this decision and the linked tickets are published. Removal from the inbox means "incorporated", not "shipped".

## S-1 — interface overhaul (verbatim)

> I'm overwhelmingly disappointed with the UI. The UI components are extremely ugly. While things are smooth, the animations are terrible, and the UI is basically unusable. The menus are unusable, the game looks like total trash. I think we need a complete rehaul of the entire interface

**Interpretation (reversible, recorded).** Four separable clauses, each with an existing or new ticket:

| Clause | Reading | Ticket |
|---|---|---|
| components extremely ugly / looks like trash | world + component material: flat single-fill bodies, no light direction, no contact shadows, dot grid dominant (`work/review/ART-002/ART-002-g1.md` D1–D3) | **ART-002** (critique, already on file) → new **ART-003** implementation lane |
| animations terrible | the current motion witness (26/26 distinct canvas hashes) proves non-teleport only, not expressive motion; the bible's anticipation/settle/starved-quiet grammar is not yet implemented | ART-003 acceptance rows A3-3/A3-5 |
| menus unusable | no hierarchy (four equal-weight lines in the card, pills/card/dock in two luminance tiers), panels as engineering `dl` dumps, a dock that parks a blind tapper | new **UI-002**, absorbs existing `BLD-001`, `D-1`, `UI-001` |
| complete rehaul of the entire interface | implemented as a layered pass over the same renderer/HUD, not a framework rewrite — see the decision record; the tradeoff is continuity of saves/tests/evidence vs. a cosmetic-only delta | README.md decision record, alternative (b) |

## S-2 — logistics mechanic and facility editing (verbatim)

> Also, I don't know if I like how things are connected by straight lines. I think we should be leveraging a mechanic of drones to move things and conveyor belts to move things between stations, and the user needs to build those. But and we should be able to move facilities around or dec demolish them. There's some type of penalty for that, right, from a cost perspective. But yeah, still the graphics are terrible

**Interpretation.**

1. "not connected by straight lines" + "conveyor belts … the user needs to build those" → a connection becomes a **built, priced, tile-running object** instead of a free abstract line: `new` **BELT-001**. Current state: `RouteState` is an abstract `from/to/filter/latency` pair (`src/game/simulation/types.ts`) painted as one straight segment with amber tokens (`src/game/renderer/scene.ts` `drawRoutes`), created by `route.connect` at no material cost, suggested by `src/game/simulation/autoconnect.ts`.
2. "drones to move things" → the drone already carries wreck → dock (`DroneState`, `fleetUnits`). Keeping both a **drone hop** and a **belt run** as genuinely different cost/latency profiles is the strategic content of BELT-001's B-2 comparison; a third transport class is deferred, not added.
3. "move facilities around or demolish them … some type of penalty" → `machine.move` exists in `src/game/simulation/commands.ts` but is **not reachable from any panel** and is free; `machine.dismantle` refunds 100 % of `buildCost` plus tray and input contents, so there is no opportunity cost at all. New ticket **MOVE-001** (expose both with a stated penalty), sequenced after BELT-001 in the same simulation lane.
4. "still the graphics are terrible" → same reading as S-1 clause 1; ART-003 owns it.

**What stays from the earlier agenda (not replaced).** The strategy hypotheses in `docs/PRODUCT_STRATEGY.md` §Current hypotheses 1–5 remain; S-2's belts are the concrete instance of hypothesis 2 ("automation needs policies and consequences") because tile length now makes the same plan cost differently. `STRAT-002`'s two named priced plans and `PLAY-001/002`'s resting-screen answers stay shipped and are not re-scored. `TEAM-001`, `OPS-101/102/103` (activation, telemetry, automatic delivery) keep their priority with the coordinator/release lanes; this file does not touch them. `AUDIO-001` stays deferred with the trigger in SPRINT-003 §Deferred.
