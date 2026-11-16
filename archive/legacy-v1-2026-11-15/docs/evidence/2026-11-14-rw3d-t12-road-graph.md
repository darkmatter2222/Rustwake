# RW3D T12 (#139) — road graph, loading sockets, atomic road tool

Role: developer. Issue: #139 (parent #123, master #121). Specs: GAME_SYSTEMS.md
(road network, cargo movement), EXECUTIVE_CONTRACT.md, ACCEPTANCE.md E04
(transaction integrity) and U01 (shell usability). Branch: `rw/139-road-graph`.
Draft PR: linked on issue #139.

## Heads

| What | SHA |
| --- | --- |
| Base (origin/main) | `66f5fc29efa09ae22b4a6241cb13f6af9f5908e2` |
| Commit 1 — road graph, bay sockets, atomic core | `276f1a3d527ef59c552e3a632d921534fcdd7bb1` |
| Commit 2 — cargo paths + topology invalidation | `98f1e7ba4fb4debb7777c30bf402633b35fcb1dc` |
| Commit 3 — session-only store road slice | `e05d500b3021a32fbba4e0d5e35a98810382982f` |
| Commit 4 — road tool UI panel | `e9e0fe183b2dd2334f6151541436f702f0733626` |
| Head (code + tests) | `7823cf0e25d2dd212e8244cb68fdec1933499ad0` |

All four gates below were run at code head `7823cf0` after a conflict-free rebase
onto `66f5fc2`. This evidence document is a docs-only commit on top of that head;
it cannot affect gate results. The PR handoff SHA is the final head including
this document.

## Implementation summary

- **`src/game/world/roadGraph.ts`** — road cells keyed `x,y`, 1|2 lane widths,
  edge graph between orthogonally adjacent cells, `roadFingerprint` checksum for
  topology revisions. Pure functions; no persistence imports.
- **`src/game/world/roadSockets.ts`** — `RoadSocketLink` records connecting
  building bay approach sockets to adjacent road cells (asset, socket, kind,
  approach direction, connected flag). Socket adjacency is derived from the
  declared bay geometry, not hand-placed.
- **`src/game/world/roadTool.ts`** — atomic place/remove. Pure previews
  (`previewRoadPlace`, `previewRoadRemove`) compute route, new/reused/upgraded
  cells, cost (5 scrap per new or lane-upgraded cell, reuse free), crossings and
  sockets before any mutation. Commit applies one validated transaction via
  `applyRoadTransaction`; idempotent by command id; revision bumps only on real
  change (free reuse is a no-op and keeps the revision). Dismantle refunds
  `floor(paidScrap * 80 / 100)` = 4 scrap per paid cell and reports disconnected
  bays. Rejections are typed (`RoadRejection` union) with machine-readable
  fields; land law is checked before terrain.
- **`src/game/simulation/roadPaths.ts`** — cargo batches path over the road
  graph. A topology revision invalidates only affected paths: batches hold with
  a reason (`no-route`, `road-removed at (x, y)`) and resume when a route
  returns; cargo is never deleted. Deterministic given seed/state.
- **`src/app/store.ts` (additive only)** — `RoadApi` kept off `GameStore` (G1
  additive pattern): `createStore` returns `GameStore & SaveRecoveryApi &
  RoadApi`. World/road network/cargo are session-only, rebuilt from seed 139
  each session. `commitRoad` is writer-gated (reader tabs get `read-only`
  rejection), reconciles and notifies. `tickRoadCargo` joins `tickLoop`/`step`.
  No save-envelope, SAVE_KEY or migration change; #205 recovery
  (`clearRecoverySlot`) verified intact after rebase.
- **`src/ui/RoadTool.tsx` (new)** — panel `PANEL_ROAD = -10` in the #135 single
  panel stack (negative sentinel, `hostKey` unchanged). Geometric SVG ghost
  minimap in grid space (terrain, existing roads, ghost route green/red, socket
  dots) — no three.js/renderer imports in `src/ui`. Rows show route, new/reused/
  upgraded cells, cost, crossings, bay sockets (place) or cut cells, edges,
  refund, disconnected bays (remove). Confirm/cancel with human-readable typed
  rejections, repeated-placement chaining (`from := last`, delta preserved),
  read-only banner, live cargo list with phase and held reason.
- **`src/ui/App.tsx` (additive only)** — one lead-block entry button ("Open
  road tool", `icon-btn`) and one panel registration casting
  `store as GameStore & RoadApi`; six fixed toolbar slots untouched; census and
  legibility tests unaffected.
- **Tests (all new files, existing assertions untouched)** —
  `tests/game/roadGraph.test.ts` (11), `roadSockets.test.ts` (11),
  `roadTool.test.ts` (20), `tests/game/roadPaths.test.ts` (18),
  `tests/ui/roadTool.test.tsx` (11) = **71 tests / 5 files**.

Round fix recorded at head: `orthogonalRoute` initially duplicated the corner
cell on pure horizontal/vertical routes (previews rejected `invalid-path`,
React duplicate-key warning). Fixed by seeding the route with the from-cell and
guarding both legs with `step !== 0`; horizontal/vertical unit assertions added.

## Acceptance criteria mapping (#139)

| AC | Where satisfied |
| --- | --- |
| 1. Preview orthogonal route, cost and crossings before atomic commit | `previewRoadPlace` pure; UI rows + SVG ghost; UI tests "preview purity", "atomic confirm", "cancel purity" (fingerprint-stable, no spend on preview/cancel) |
| 2. Road lanes connect declared bay approach sockets | `roadSockets.ts` adjacency links; place/remove previews report sockets/bays; `roadSockets.test.ts` 11 tests |
| 3. Topology revisions invalidate affected paths without deleting cargo | `roadPaths.ts` hold/resume with reasons; `roadPaths.test.ts` 18 tests incl. dismantle-hold-rebuild-resume; UI cargo inspectability test |
| 4. Reproducible seed/state, expected/actual, real exit codes | Seed 139 session rebuild; gates table below with process exit codes; per-test expected/actual in suites |
| 5. Independent reviewer/product verdict at immutable PR head | Pending handoff — draft PR posted for QA/product; no self-acceptance, no merge by developer |
| 6. Save/migration/recovery impact + limitations documented, no unrelated infra | Section below; diff confined to write paths (`git diff --name-only origin/main HEAD` outside allowed paths is empty) |

E04: previews pure, commit atomic + idempotent, writer-gated, revision only on
real change, refund floor math tested. U01: single panel stack sentinel, one
additive entry button, labelled controls, `role="status"` feedback, reader mode
visible-but-disabled.

## Gates at head 7823cf0 (real exit codes)

| Gate | Command | Exit | Result |
| --- | --- | --- | --- |
| Typecheck | `pnpm typecheck` | 0 | clean |
| Validate | `pnpm validate` | 0 | tables 15 resources / 8 blueprints / 12 recipes / 3 research; behaviour firstDrone=379, firstResearch=527, tick=18298, machines=8, links=18, drones=4, batches=1838, credits=157, nodes=3; 0 violations |
| Test | `pnpm test` | 0 | **80 files / 1062 tests passed** |
| Build | `pnpm build` | 0 | index 761.90 kB (gzip 202.73), vendor 141.66 kB, tables 26.65 kB, css 60.48 kB, worker 13.41 kB; 1.32 s; chunk-size warning advisory only |

Baseline delta vs origin/main `66f5fc2`: **75 files / 991 tests** (derived from
the proven purely-additive diff: 80−5 files, 1062−71 tests). Delta: **+5 test
files, +71 tests, 0 failures**. `git diff --stat origin/main HEAD -- tests/`
shows only the 5 new road files (+1353 lines); no existing test assertion was
modified.

## Save / migration / recovery impact

- Road world state, network and cargo are **session-only**: not added to the
  save envelope; persistence is owned by #148. Rebuilt deterministically from
  seed 139 per session.
- `SAVE_KEY` unchanged; **no migration needed**; no persistence files touched
  (`src/game/persistence/**` diff empty).
- #205 save-recovery behavior preserved: `clearRecoverySlot` call sites intact
  in store.ts after rebase; recovery test suite green within the 1062.

## Limitations

1. Ghost preview is a geometric SVG minimap in grid space, not a 3D-canvas
   projection (boundary-3d: no renderer imports in `src/ui`). Visual fidelity
   of the ghost in-scene is for a vision-capable reviewer; the scene bridge is
   unused this round.
2. Route endpoints are entered numerically (X/Y inputs), not canvas
   click-routing; the orthogonal route between them is previewed and validated.
3. Cargo spawning is a store API (`spawnRoadCargo`) exercised by tests; no
   cargo-order UI this round (out of #139 scope).
4. Entry is an additive lead-block button because the six toolbar slots are
   fixed by #135; panel uses negative sentinel −10.
5. Road state does not survive reload until #148 persistence lands; documented
   above, intentional.
6. Entrance corridors are not blockers per the PR #188 ruling.