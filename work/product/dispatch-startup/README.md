# dispatch-startup — product-owner intake and next implementation brief

Role: product owner (simulated persona, not human research). Base for all three lanes: `b4e8321e782a4debc55e58a6c7b123e86dd1047a` (local `main` == `origin/main`, 2026-11-05T20:51:19-05:00).
Last evidenced deployed artifact: `d7af68a1df31d6b0cb5e313330f7cb5853d74a32` (labelled preview `rustwake-d7af68a`, receipt `work/deployments/OPS-013-g1.json`).

Files in this assignment:

| File | Purpose |
|---|---|
| [sponsor-intake.md](sponsor-intake.md) | Verbatim sponsor text preserved, interpretation, ticket links |
| [SPRINT-003.md](SPRINT-003.md) | Outcome, at most 3 deliverables, 5-item ready queue, metric challenges, deferred/rejected |
| [assignments.md](assignments.md) | Three independent assignments with exact non-overlapping file scopes, acceptance fixed in advance, estimates |

## PM integration summary (bounded)

Baseline verified by this pass at `b4e8321`: 283 tests / 27 files green, entry chunk 231878 B (1122 B spare under the 233000 B ceiling), and `src` identical to the deployed artifact `rustwake-d7af68a`.

1. Dispatch three parallel developers on non-overlapping ownership: **ART-003** (renderer), **UI-002** (React HUD + strings), **BELT-001 g1** (simulation + content tables). Full path lists are in `assignments.md`; no path appears in two lanes.
2. Each lane returns a candidate SHA, its own entry-chunk byte delta, and one handoff file. Independent QA reviews each immutable candidate in its own receipt file; the product owner then makes a keep/revise/revert call per lane.
3. The release engineer integrates per file after at least one lane holds a QA verdict (3–5 min target after readiness), and owns `work/backlog.json` plus generated board. This lane writes none of those shared files.
4. Merged entry chunk must stay ≤ 233000 B. Currently 231878 B (1122 B spare). If the merged total exceeds the ceiling, trim in this order: facet/prop detail (ART-003) → secondary HUD chips (UI-002) → keep the belt model (BELT-001) intact.
5. Only BELT-001 may restate the `npm run validate` behaviour-line pins and the ladder-fixture numbers, because only it changes simulation numbers. ART-003 and UI-002 must assert the behaviour line is unchanged; a moved behaviour line in those lanes is a scope violation, not a re-pin.
6. Blocked/unverified set stays visible and is not silently passed: human listening, real-device p95, one human first-feel run, remote CI status if `gh` remains unauthenticated.

## Decision record (one entry)

- **Context.** The sponsor again rejects the interface ("extremely ugly … animations terrible … menus unusable … complete rehaul") and adds a mechanic request (drone/belt movement built by the player, plus move/demolish with a cost penalty). Independent review `work/review/ART-002/ART-002-g1.md` on the deployed artifact returns REWORK with three named visible defects: no composition (dot grid dominant), one machine silhouette with surface glyphs, HUD text outranking the world with flat single-fill materials. Six releases shipped in ~12 h, most of them instrument work (42 % card cap decimals, one-byte css deltas).
- **Alternatives considered.**
  - (a) Continue the chrome-cap decimal series (`D-1`, `UI-001`) — **rejected**: the reviewer's own noise list says the cap now reads 40.8 % and further decimal chasing changes no player experience.
  - (b) Rewrite the interface (new renderer or a non-React HUD) — **rejected**: no real tradeoff is bought; save compatibility (`schemaVersion 1`, ladder fixture `eede3c4f`), 283 tests and every existing receipt lose continuity for no player-visible gain.
  - (c) Ship a PNG sprite atlas first, then fix layout — **deferred**: an atlas without a light direction, composition and hierarchy still reads as a demo. Revisit trigger: the silhouette test below fails.
  - (d) **Chosen**: one layered pass per lane — world (silhouettes + one light + contact shadows + work-communicating motion), interface hierarchy (world-first, one primary action, blind-tap unparked), logistics (a belt the player pays for, with real placement costs and removal penalties).
- **Role positions and dissent.** developer-sim offered a cheaper belt variant (price folded into `latency`, no tile run) at 2 points and challenged 5; accepted as the fallback inside BELT-001, not as the first attempt. QA noted blind naming has rater variance and requires a committed crop manifest; accepted, it is now an evidence row. Player persona asked for a numbered pipeline legend, a second wreck and audio in the same sprint; declined (one plan-decision per lane, no new panels). No manufactured conflict — every position above changes a named artifact.
- **Decision owner.** Product owner, reversible per lane: each lane is one candidate commit chain, revertible without touching the other two.
- **Criteria version.** Fixed before implementation in `assignments.md` (ART-003 A\*, UI-002 U\*, BELT-001 B\*). No criterion may be re-scored retroactively; a failed row stays on the record and a new criterion applies prospectively only.
- **Revisit triggers.** (i) If blind naming fails (<4/5 on any of furnace/sorter/wire mill), switch to the authored atlas hypothesis next planning pass. (ii) If BELT-001's B-2 shows no per-column lead, close belts as a cost-only change and return the slot to the presentation track. (iii) If a supported listening mechanism or a connected device appears, AUDIO-001 and the real-device gate each get one bounded pass. (iv) If `main` advances past `b4e8321` before a lane's review, that lane rebases and is re-measured on the new SHA.
