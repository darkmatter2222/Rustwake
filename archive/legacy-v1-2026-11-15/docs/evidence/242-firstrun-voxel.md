# 242 — First-run yard reads as the Living Voxel World on arrival

- Role: developer (darkmatter2222, Qwen Code runtime, coordinator-dispatched)
- Issue: #242 (mandate #121, Project 2)
- PR: #243 (draft) — https://github.com/darkmatter2222/Rustwake/pull/243
- Branch: `rw/242-firstrun-voxel` from origin/main `03eef6ccf1a562bcac3eb770deb858ccf47c708f`
- Code head SHA (all measurements below): `6f76748285ec0f460cf34778a97b0a11a0a43705`
- Final PR head: evidence-only commit on top of the code SHA (no source change; see PR comment for the immutable final SHA)
- Verdict status: developer evidence complete. Independent QA + product verdict required. Visual fidelity ACCEPT is reserved to the sponsor. Not merged, not self-accepted.

## Change summary

Renderer-only static voxel dressing in the lazy three.js layer
(`src/game/renderer/three/yardDressing.ts`, wired in `worldRenderer.ts`):
site office, wreck-cluster hulls, three bale rows, two container rows,
perimeter fence with gate gap, corner scrap piles in grid-intersection
gaps, sparse stones, darker surround terrain, mottled ground.
Deterministic mulberry32 seed 242 (no clocks); one InstancedMesh per tone
(<= 7 batches) sharing the existing unitBox; nothing pickable. Dock tile,
drone corridor, wreck highlight radius (>= 24u for structures) and every
placeable cell preserved. Tutorial objective, economy, progression,
saves, cancellation and approval settings untouched. Sorter/furnace NOT
pre-built; no intro, no next-action button, no dashboard shell.

## Fresh-yard pixel census (800 samples, 824x1830, running build)

Protocol: fresh context, enter gate, dismiss return-resume, Recenter,
5s settle, 20x40 grid over the visible 2D canvas
(`tests/perf/first-run-242.probe.mjs`). structurePinned = exact
"117,138,147" / "94,120,130"; structureFamily = ±2 per channel around
those tones. Before build reproduced the live entry hash
`index-BgVhHfeK.js` (parity proof).

| metric | before | after |
|---|---|---|
| structureFamily | 8 | 45 |
| structurePinned | 4 | 28 |
| uniqueColors | 5 | 28 |
| nonDominantPct | 23% | 60% |
| dominant bg 8,13,24 | 618 | 320 |
| surround 18,31,39 | 0 | 264 |
| data-world3d | ready | ready |
| page errors | 0 | 0 |
| objective | Tap the highlighted wreck to salvage scrap. | unchanged |
| machines / tutorial (fresh save) | 0 / 0 | 0 / 0 |
| reload round-trip (settings + stable sim) | intact | intact |

Raw: `docs/evidence/242/before/{census.json,fresh-yard.png}`,
`docs/evidence/242/after/{census.json,fresh-yard.png}`.

## Tests

- `npx vitest run` (plain, no worker flags): 114 files / 1531 tests
  passed, exit 0, single run (no bench flake, nothing weakened).
- New `tests/renderer/yard-dressing-242.test.ts` (8 tests, node env):
  determinism, shared unitBox + <= 7 batches + pickId null,
  placeable-grid safety, dock tile clearance, drone corridor tops <= 5,
  wreck highlight radius, surround placement, mottle range.

## §5.7 cold-load budget (p03 at code SHA 6f76748)

`npx tsx tests/perf/perf-151.evidence.mjs --mode p03`: PASS,
46 met / 0 unmet / 0 unknown, hard failures 0. Budgets file untouched.

| metric | before (03eef6cc) | after (6f76748) | ceiling |
|---|---|---|---|
| entry decoded bytes | 324689 | 324689 | 360000 |
| mature3d cold decoded | 1106322 | 1110608 (+4286) | 1220000 |
| fallback2d cold decoded | 561642 | 561642 | 620000 |
| mature transfer (compressed) | 301735 | 303348 | — |
| binaryMediaCount | 0 | 0 | 0 |

All added dressing is code inside the existing lazy three chunk
(+4286 decoded B); no new asset fetches; FALLBACK-2D never loads three
and is byte-identical. Raw:
`docs/evidence/242/before/151-p03-coldload.json`,
`docs/evidence/242/after/151-p03-coldload.json`.
Tracked `docs/evidence/151-p03-*` files were restored to their committed
state after local probe runs.

## Limitations

- Numeric census is not visual certification. Headless Chrome +
  SwiftShader software GL may differ subtly from real GPUs; sponsor
  visual ACCEPT on the running/live build is still owed.
- Default camera is top-down (fitCamera frozen); layout targets the
  verified visible margins at 824x1830. Other aspect ratios not censused.
- p03 and census measured at code SHA 6f76748; the final PR head adds
  only this evidence doc and the archived after p03 report.
- No deployment performed; done != deployed. Release engineer merges
  after independent QA and product verdict; main CI/CD verification and
  live re-census follow release.
