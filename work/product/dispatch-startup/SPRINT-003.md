# SPRINT-003 — "I build the lines, and the yard looks like a place"

Status: proposed by the product owner on 2026-11-06 from `SPONSOR_INBOX.md` S-1/S-2 plus `work/review/ART-002/ART-002-g1.md`. Supersedes SPRINT-002's next-task order; SPRINT-002's shipped outcomes stay on the record. Base `b4e8321`.

## Outcome (one sentence, player-observable)

A player on a phone sees an authored salvage yard whose machines are recognisable by shape alone, can say what each of their two plans costs, and has personally paid for the belts that carry material — so a longer route is a decision with a price, not a line.

## Deliverables (at most three)

| # | Deliverable | Player-visible delta | Lane | Est. |
|---|---|---|---|---|
| 1 | **ART-003** silhouette-first world pass (composition, one light direction, contact shadows, work-communicating motion) | machines distinguishable without labels; the dot grid stops being the focal object; machines sit on the ground instead of floating | developer-art | 5 |
| 2 | **UI-002** world-first HUD and menus (hierarchy tiers, one primary action per context, dismissable panels, unparked blind tap, move/dismantle with costs) | the first read is the yard, not the text; every tap has a stated price and an effect | developer-ui | 3 |
| 3 | **BELT-001 g1** player-built priced connections | a connection now consumes scrap and its price rises with tile distance; two layouts produce measurably different plans | developer-sim | 5 |

Anything beyond these three is a new planning pass, not an extension of this one.

## Ready queue (prospectively estimated, 1/2/3/5/8; five items, three workers)

| Rank | ID | Points | Role | Depends on | Why this rank |
|---|---|---|---|---|---|
| 1 | **ART-003** | 5 | developer-art | — | The single highest-leverage visible defect set (ART-002 D1/D2/D3) and the owner's first named complaint. |
| 2 | **UI-002** | 3 | developer-ui | — | Independent files; carries `BLD-001` (blind tap lands 0 commands in 31 taps), which is the most concrete "unusable" evidence on file. |
| 3 | **BELT-001 g1** | 5 | developer-sim | — | The sponsor's mechanic request and the only candidate for real strategic expression; model + tests only this generation. |
| 4 | **BELT-001 g2** (belt presentation) | 2 | developer-art | ART-003 merged (needs `scene.ts`) | Same file owner, next generation: run the belt sprite after the art lane releases `scene.ts`. |
| 5 | **MOVE-001** (move/dismantle penalties exposed) | 2 | developer-sim | BELT-001 g1 | Small, mechanical follow-on in the same lane once `TUNING` has the penalty rows. |

Follow-on, not a child slot now: **RELEASE-007** per-file integration of the first QA-accepted lanes (release-engineer lease, 2 points, due within 3–5 min of readiness, investigated if >10 min).

## Acceptance intent (full rows in [assignments.md](assignments.md))

- ART-003: grayscale pairwise silhouette separation above the recorded baseline, blind naming ≥4/5 for furnace/sorter/wire mill from labelled-free 390 px crops, ≥3 luminance bands inside one machine box plus a contact shadow under every footprint, grid hidden at rest, and the four existing witnesses unchanged (no scroll, ≥44 px faces, 26/26 distinct 250 ms clip frames, 0 pageerror).
- UI-002: card ≤42 % of the `.hud` content box in **five** cells including the 44.6 % blocked-tap sub-state (that closes `D-1`), exactly one primary action per context, computed-style hierarchy tiers, the leftmost dock face payable at the current purse, no one-word wrapping in the research panel at 360 px ts2.0.
- BELT-001: a connection has a named scrap price that scales with tile count; two layouts diverge on at least one acceptance column each under the `STRAT-002` A1-2v3 per-column minimum-meaningful-gap convention, with the drop clause armed (no lead → ship as a cost-only change and record the negative result).

## Metric challenges (numbers that do not predict player experience)

Keeping as regression guards, no longer as goals: 26/26 distinct clip hashes at 250 ms, no page scroll, ≥44 CSS px minimum face, 0 pageerror, entry chunk ≤233000 B, save `schemaVersion 1` + fixture `eede3c4f`, per-column MMG on the harness table.

Demoted to noise per ART-002 §"Numeric gates: keep vs noise" and this pass: the twelve-case `C1..C5` contrast set (identical by construction), exact-pixel sample-point scans, 3-decimal step means, further decimals on the 42 % card cap, mask/Hamming distance as a polish proxy, and raw test counts. A distinct-frame count proves the renderer is not teleporting; it does not prove motion is good, so ART-003 additionally requires named per-status motion states.

## Deferred / rejected (with reasons and triggers)

| Item | Disposition | Reason / revisit trigger |
|---|---|---|
| `AUDIO-001` | deferred | No supported listening path in this runtime (`ART-002` reports wave-form inspection only). Trigger: a supported listening or loopback-capture mechanism exists → one bounded mix pass, still labelled separately from structural checks. |
| `D-1` (44.6 % cell), `UI-001` (panel coverage) | folded into UI-002 rows U-1/U-4 | One denominator, five cells, printed; stop separate decimal chasing after this slice. |
| Authored PNG sprite atlas | deferred | After code-authored silhouettes either pass the blind-naming test or fail it; a failure is the trigger to try the atlas with the same footprints. |
| Third transport class (dedicated drone lane between machines), splitter/merger/inserter, second wreck, second resource, expeditions/defense, PvP/backend, monetization | deferred | Not needed to prove this sprint's outcome; each keeps a backlog home in `docs/BACKLOG.md` / legacy findings. |
| Interface rewrite / new rendering framework | rejected | No player-visible tradeoff, breaks save/test/evidence continuity. |
| More chrome-cap decimal work as its own ticket | rejected | Two consecutive instrument-only slices already; the charter returns to a playable outcome after two metric-only slices. |

## Honest unverified set (carried, not hidden)

Simulated personas are not human research (BL-02 open). Audio subjective quality unverified (BL-11). Real-device p95/thermal unverified (BL-01). Remote CI status may again read `remote-CI-unverified` if `gh` stays unauthenticated (BL-06) — pending/unavailable is never reported as passed.
