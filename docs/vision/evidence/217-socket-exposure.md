# #217 — Expose completed building sockets to the bay editor (session-only)

- **Issue:** [#217](https://github.com/darkmatter2222/Rustwake/issues/217) `[RW3D][T20]` — `getRoadSockets()` is empty in production (G1-blocking, `gate:G1`).
- **Role:** developer (finish pass after turn-cap interruption; no delegation).
- **Branch:** `rw/217`
- **Base:** `origin/main` = `dc6bd3e96aaea2aaa572b1ed22b92ad374039a63` (#149 merge). The WIP commit was rebased cleanly from `e6e7abf` — #149 touched `tests/offline` + a `save.ts` comment, disjoint from every file here. No conflict, no force-resolve.
- **Implementation head (gated):** `960c098a450c22185f3dc576babf177c8717f936` — the rebase result. All four gates were run ONCE on this tree.
- **Evidence commit / PR head:** adds this file only (`docs/vision/evidence/`, outside every gate input — tsc / vitest / build / validate-content do not read it), so the gated tree and the final PR head are gate-identical. The full PR-head SHA is recorded in the role-stamped PR/issue comment.

## Owned paths

| Path | Change |
| --- | --- |
| `src/app/store.ts` | +61/−8 — `getRoadSockets` projects from `buildWorld`; `settleBuildWorld` completion hook wired into the live tick loop AND `step()`; MOVE retargets the logistics registration to the socket approach cell. |
| `src/game/world/roadSockets.ts` | +31/−1 — new pure helpers `buildingLogisticsCell` (first road-taking socket approach, footprint-origin fallback) and `buildingTakesRoadLane`. |
| `tests/simulation/socket-exposure-store.test.ts` | NEW — 345 lines, **9 tests**: pure-helper geometry, store projection, numerical bay gating, MOVE/DISMANTLE lifecycle, session-only save invariance. |
| `docs/vision/evidence/217-socket-exposure.md` | NEW — this file. |

**Save / migration / recovery impact = NONE.** No `save.ts`, schema, migration or recovery edit. The logistics ledger, traffic bay capacities and both session worlds stay disjoint from `SAVE_KEY` (#148 owns the cutover); the session-only test below pins byte-identical persistence.

## Design choice and justification

**Projection from `buildWorld`, not injection into `roadWorld`.** The issue's finding is correct: `roadWorld` (seed 139) only ever receives `road.place | road.remove` commands, so `roadSocketLinks(roadNet, roadWorld)` was always empty. The fix reads the COMPLETED buildings of `buildWorld` (seed 138) — the world `world.place` actually commits to (#138):

- `roadSocketLinks` reads only `world.buildings`, so projecting it over `buildWorld` is safe and reuses the #139 derivation unchanged (approach cells, `connected` flags, kit-socket order).
- **`roadTool` world semantics are deliberately untouched.** `roadWorld` carries the terrain/occupancy/scrap ledger that road placement law validates against; injecting player buildings into it would silently change placement legality, occupancy and scrap accounting — a redesign the issue explicitly rules out ("no silent redesign"). The issue's ask permits "earlier via a writer-gated session API"; this is the read-side equivalent: a pure projection plus session-only auto-registration, with road placement still previewing/committing against `roadWorld`.

**Completion auto-registration at the socket approach cell.** `settleBuildWorld(ticks)` wraps `advanceWorld` in both authoritative tick paths (live loop and `step()`). When a site settles into a completed building it registers with the logistics ledger IF `buildingTakesRoadLane(building)`, at `buildingLogisticsCell(building)` — the approach cell of the FIRST road-taking socket in kit-socket order (deterministic for multi-socket assets like the warehouse's bay0/bay1), falling back to the footprint-origin cell for socket-less assets. The scan is bounded (runs only on a tick that grew `buildings.length`), idempotent (already-registered buildings are skipped, preserving manual capacity), and never persisted. `DEFAULT_BUILDING_LOGISTICS_CAPACITY = 50` matches the #146 session-fixture placeholder because the kit declares no per-building storage field yet; #148 owns real capacity and persistence. Socket-less completed buildings (e.g. generator) stay on manual registration — the #146 convention is preserved, not replaced.

**MOVE retargets; DISMANTLE drops out.** MOVE re-registers the moved building at its new socket approach cell (same rule as completion), preserving capacity; a socket-less moved building keeps the footprint-origin convention. DISMANTLE needs no new code path: the building leaves `buildWorld` (projection drops its sockets) and the existing lifecycle ledger removal deletes the registration; ghost jobs are refused.

## Cell-coherence finding

Before #217 there were two stacked gaps: (1) the socket list was always empty, and (2) the #146 convention registered logistics buildings at the **footprint-origin** cell while the #147 bay editor writes capacity at **socket approach cells** — the exact cells #141 jobs lease (`sourceCell`/`destCell`). Even with sockets exposed, capacity at an approach cell would have gated a cell no job leases.

#217 closes both: the registered cell now EQUALS the first road-taking socket's approach cell, derived purely from kit geometry on every read (never stored, so move/rotation cannot leave a stale cell). Hand-derived geometry used by the tests: warehouse 6×4, footprint-center origin, bay0 local (−1.55, 2.15), bay1 (1.55, 2.15), approach = `floor(worldMu/1000)`; a warehouse at (7,8) rot0 has bay0 approach **(8,12)** and bay1 approach **(11,12)**, both on the owned start-parcel corridor row y=12.

**What the bay-gating test proves (numerical, no wall-clock):** two carriers, two concurrent 5-scrap jobs source(2)@(12,12) → warehouse(1)@(8,12), speed 1, `unloadTicks 2`, five-cell corridor. The store asserts `logistics.buildings[1].cell === (8,12)` (the leased cell) before capping. With `setTrafficBayCapacity((8,12), 1)`, the hand-derived timeline (dispatch 1, load 2, moves 3–6, arrive 6; A unloads 7–8, B queues until A releases, unloads 9–11) yields **5 delivered at a fixed 9-tick budget vs 10 unlimited** — capacity at the approach cell measurably serializes unloads. The capped bay then drains to 10 by tick 14, cargo is conserved (`logisticsTotals = { scrap: 10 }`), and `bayLeases` is empty (released on the terminal path). Projection tests additionally pin: sites excluded (no sockets/registration before completion), both bays surface in kit order, `connected` flips true when the corridor covers the approach and false again when the road under bay0 is removed (derived, never stale).

## Gates (run once at the implementation head above)

| Gate | Command | Exit |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | **0** |
| Content | `npx tsx scripts/validate-content.mjs` | **0** — 0 violations (content: 15 resources / 8 blueprints / 12 recipes / 3 research; behaviour: firstDrone=7 firstResearch=705 tick=18382 machines=8 links=18 drones=5 batches=1910 credits=75 nodes=3) |
| Suite | `npx vitest run` | **0** — **107 test files / 1447 tests passed**, duration 10.61s |
| Build | `npm run build` | **0** — built in 1.34s (pre-existing >500 kB chunk-size warning, not an error) |

**Exact vitest invocation: plain `npx vitest run`** (the package `test` script). The interrupted session's `npx vitest run --maxWorkers=4` threw a Tinypool worker error before any test ran; `vite.config.ts` has no `test.pool` override, so the project's own invocation was used. No `--maxWorkers`, no OOM retry needed. The jsdom `act(...)` / canvas `getContext` warnings in the log are pre-existing environment noise, not failures.

No perf-flake: `tests/perf/bench.test.ts:87` passed on the single run; the pre-authorized rerun was not needed. No assertion was weakened, skipped or deleted. No existing test pinned the old empty-socket behavior (the only other consumer, `tests/ui/road-147.helpers.ts`, uses a documented read-only projection double and is unaffected).

**#217 test counts:** pure helpers 3 · store projection 2 · bay gating 1 · lifecycle 2 · session-only 1 = **9** new tests, all green (suite 1438 → 1447, files 106 → 107 vs the #149 baseline).

## Acceptance map (issue ask: declared sockets reach the bay UI, session-only, no save-shape change)

| Clause | Evidence | Result |
| --- | --- | --- |
| Completed road-taking buildings surface declared sockets | projection test: warehouse bays at hand-derived (8,12)/(11,12), kit order, sites excluded | PASS |
| `connected` reflects the road network | corridor connects both bays; removing the road under bay0 disconnects it | PASS |
| Bay capacity gates the cell jobs lease | registered cell == bay0 approach; capacity 1 → 5 vs 10 delivered at fixed budget; drains, conserves, releases leases | PASS |
| MOVE / DISMANTLE lifecycle | MOVE retargets registration + socket approach, preserves capacity 50; DISMANTLE clears both ledgers, refuses ghost jobs | PASS |
| Session-only, NO save-shape change | `SAVE_KEY` + `exportSave()` byte-identical across capacity/topology mutations; envelope carries no `buildWorld/roadWorld/roadNet/logistics/traffic/roadCargo/bayCapacity/terrain` keys, no `completedTick`/`bayCapacity` substrings; fresh store over the same storage recomputes empty (0 buildings, 0 sockets, `{}` ledger, traffic off, `{}` bayCapacity) | PASS |

## Limitations

- **No visual self-certification.** This is a non-vision agent: the evidence is store/geometry/numerical contracts, not pixels. UI proof (bay editor listing real bays, capacity writes gating jobs in the running build) comes from the running build at independent QA; the visual-fidelity verdict belongs to G1 (#151). The editor's own DOM coverage remains #147's (projection double).
- **Placeholder capacity.** Auto-registration uses the session placeholder 50; real per-building storage capacity and persistence are owned by the #148 cutover. Nothing here is serialized.
- **First road-taking socket only.** Multi-socket buildings register one logistics cell (bay0); bay1's approach is exposed and connectable in the editor, but per-bay registration/capacity semantics are deferred to #148.
- Socket-less assets keep manual registration (#146 convention); no automatic economy wiring for them is claimed.

## Handoff

Draft PR `Closes #217`, label `rw3d`. Role-stamped developer comment on the PR and on issue #217. **No self-acceptance, no ready-for-review, no merge** — independent QA + product verdict on the immutable head SHA, then release engineer merges.
