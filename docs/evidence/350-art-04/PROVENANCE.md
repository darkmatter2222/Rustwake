# ART-04 civic-rig evidence provenance (issue #350, PR #562)

This file is the human-authored disclosure sibling of the harness-generated `report.json`.
`report.json` is NEVER hand-edited; everything a reviewer needs to audit the capture head,
the re-capture decision and the reproduction comparison is recorded here.

## Capture head and commit topology

- Capture head **P = `d6ee7f3ca42777c516314551ff75d7e95cdc69a0`**.
- `report.json.source_sha == P` (harness-stamped, not hand-edited).
- **E1** — the commit that introduces this file and banks the re-captured evidence — has
  **P as its direct parent** (`E1^ == P`) and contains only `docs/evidence/350-art-04/` files.
- `git diff P..E1 -- src scripts tests .github` is **EMPTY (0 bytes, measured)**.

Reviewer re-run commands (from the branch worktree):

```sh
P=d6ee7f3ca42777c516314551ff75d7e95cdc69a0
E1=$(git log --format=%H --diff-filter=A -- docs/evidence/350-art-04/PROVENANCE.md)
git rev-parse "$E1^"                                   # must print P
git diff "$P".."$E1" -- src scripts tests .github | wc -c   # must print 0
node -e "console.log(require('./docs/evidence/350-art-04/report.json').source_sha)"  # must print P
```

## Why a re-capture happened

The prior evidence set was captured at ancestor
`5c1f11ab44fa9aa260058f4641f5d58a41e602b7`, and two **docs-only** commits
(`e7a706a`, then `d6ee7f3c` = P) landed on top, so the declared SHA was not the capture
head. Reviewer condition C1 (comment `6979539973`) and product condition C1 (comment
`6979546818`) both blocked the merge on this. Coordinator ruling `6979802197` chose
**re-capture at P itself** over a docs-only `source_sha` hand-edit: hand-editing
`source_sha` is forbidden by the durable studio rule (ART-03 #349 / UX-06 #364 precedent —
never point the declaration at a tree that did not run the harness). Product explicitly
authorized the re-capture path; it is the intersection of both gates.

## Why no code commit was needed

- `git diff df181678..d6ee7f3c -- src scripts tests` is **EMPTY (0 bytes, measured)**.
  The harness and all game code at P are byte-identical to what produced the prior images
  (the `df181678` variant of `scripts/capture-art04.mjs` already emits `pivotWorld` /
  `swingRadius`). P is therefore already a stable harness head; no rebase was performed
  and main is unchanged at `da76a00c9d73913f72254d14dfafd5e2f20e154e`.
- `scripts/capture-art04.mjs:84` takes `SOURCE_SHA` from `process.env.RUSTWAKE_SOURCE_SHA`
  (operator-supplied, not auto-derived), with a 40-hex guard at `:745`
  (`CAPTURE_SOURCE_SHA_REQUIRED`). The declaration was set to P for a genuine fresh run,
  so `source_sha == P` is true by construction rather than by assertion.
- **Interpretation flagged for the delta reviewer, not silently assumed:** reviewer C1's
  phrase "land the harness change as its own code commit" is satisfied *in substance* —
  the harness IS committed code at P (it landed in `df181678`, an ancestor of P), and E1
  carries zero `src`/`scripts`/`tests` bytes. All three measurable C1 criteria hold
  literally: `E1^ == P`, `source_sha == P`, `git diff P..E1 -- src scripts tests` EMPTY.
  If the delta reviewer requires a literal separate harness commit on top, that reading
  is submitted for adjudication in the delta verdict; it must not be merged on an
  unresolved reading.

## Exact capture run

```sh
RUSTWAKE_SOURCE_SHA=d6ee7f3ca42777c516314551ff75d7e95cdc69a0 \
RUSTWAKE_PREVIEW_PORT=4201 node scripts/capture-art04.mjs
```

- Port **4201** (free at run time; the 4183 leak was not touched).
- Started `2026-11-18T13:25:54.987Z`, completed `2026-11-18T13:30:15.796Z`, exit clean.
- `capture-i.log` (scratch, not committed) contents, verbatim:

```
ART-04 civic-rig production capture: PASS_NUMERIC_ONLY C:\Users\ryans\AppData\Local\Temp\rw-qwen\dev-350\docs\evidence\350-art-04
```

- Result: `status = PASS_NUMERIC_ONLY`, `errors = []`, `issue = 350`.
- Capture output: **65 PNGs + `report.json`** (66 files). Together with the two
  `*mutation-controls.json` files the evidence directory held **68 files** at capture
  completion (those two were still the prior run's; they are refreshed at P by the
  follow-up controls commit E2). This `PROVENANCE.md` is the additional disclosure file.
- Working-tree delta vs the prior evidence: **46 files modified** (45 PNGs + `report.json`);
  20 PNGs byte-identical to the prior capture.
- `sanity`: fileCount **65**, minColors **403**, minSigma **15.239** (both floors met).
- `previewIntegrity.ok = true`: local dist entry `assets/index-Bo5XjHaF.js`, sha256
  `47cf35442613b2c3513ea45af2b79d4b00fc88d309df6903d18f23dc181a543a`.
- `distinctness3d.min = 0.1741` (`fabricator/salvager`); `depot/market` 0.1776;
  **all 15 pairs >= 0.15** (floor unchanged).

## Reproduction comparison vs the prior capture (at 5c1f11ab)

Compared against the prior `report.json` (scratch `report-prior.json`, not committed).

**BYTE-IDENTICAL blocks** (independently re-verified by JSON equality):
`cameraHashes`, `budgets`, `art04Motion`, `art04Dock`, `distinctness3d`, `sites`,
`contactChecks`, `status`, `errors`, `limitations`, `previewIntegrity`.

**Differing blocks are wall-clock / render-timing jitter only**:
`freshLanding`, `views`, `placement`, `picking`, `motion`, `dockingProof`,
`motionDetails`, `homeShutterVisibility`, `sanity`, `negatives`, `legibility`.

Old -> new examples:

| Metric | Prior (5c1f11ab) | Re-capture (P) |
|---|---|---|
| `motion.elapsedSeconds` | 13.618 | 13.637 |
| `dockingProof.bayDist` | 2.145 | 2.101 |
| `dockingProof.doorLift` | 0.8 | 0.8 (unchanged) |
| `motionDetails.research` pair meanAbsDiff | 2.233 | 2.257 |
| `motionDetails.fabricator` pair meanAbsDiff | 1.154 | 1.921 |
| `motionDetails.market` pair meanAbsDiff | 2.151 | 1.538 |
| `motionDetails.depot` pair meanAbsDiff | 3.107 | 3.92 |
| `motionDetails.marketDiag` pair meanAbsDiff | 2.521 | 2.766 |
| `legibility.machines["desktop:depot"].edgeEnergy` | 12.75 | 14.116 |

**Every gate floor still passes**: all full-rig motion pairs >= 1; distinctness min
0.1741 >= 0.15; `art04Dock = {near: 2.5, far: 7, travel: 0.8}` **UNCHANGED — the dock gate
was NOT widened**; budgets unchanged (depot 35/410 cap 38/460, market 32/434 cap 36/480,
research 24/418 cap 28/460, fabricator 37/494 cap 40/540). No distinctness or motion floor
was lowered.

## Known player-facing debt: starter-yard depot shutter never docks (#580)

On the fresh DEFAULT starter yard the depot shutter never opens:

- Gate simulation probe: **0/960 docking steps over 240 sim-seconds**.
- Harness watch (`homeShutterVisibility`, both viewports): `dockingSamples = 0`,
  `maxDoorLift = 0`, `minBayDist = 7.0000`, `shutterEverOpens = false`
  (desktop 61 samples / phone 62 samples over the 15 s wall-clock watch).
- Geometry: depot at (13, 9) **rot 0**, bay cell **(13, 10)**, nearest road stop
  **(13, 8)**, `bayToRoadWorld = 7` — the bay faces away from the road, so trucks never
  come within `ART04_DOCK.near = 2.5` (minBayDist 7 >= far 7).
- The drive is honest piecewise motion: a dockable yard (depot rotated onto the road)
  genuinely reaches `bayDist ~2.1 -> doorLift 0.8` (`dockingProof.bayDist = 2.101`,
  `doorLift = 0.8`; home-camera dockable-yard clips show the shutter travel on screen).
  The defect is **starter-yard geometry, not a fake animation**.
- Filed as **#580** (simulation/content lease, design parent LOG-02 #382, seam #262,
  train placement AFTER #579). The code fix is NOT attempted in this tail and is not
  merge-blocking for #562. **The dock gate was NOT widened to swallow the 7-unit bay.**

## Honesty ceiling (binding)

`PASS_NUMERIC_ONLY` — numeric pixel evidence is **never** visual approval. No model
self-certifies visual fidelity. G1 sponsor visual acceptance **#276** is sponsor-reserved
and **STILL OWED**; physical handsets **#268/#275 STILL OWED**. Phone captures are
EMULATED. Branch CI success is not a production release.

## Windows CRLF disclosure

This worktree has `core.autocrlf = true`. Hashes below were measured with `sha256sum`:

| File | Working-tree sha256 (CRLF checkout) | LF blob sha256 (`git show HEAD:<path>`) |
|---|---|---|
| `src/world.js` | `6652276b088e6ade5f4167d18f28fc7f3e504185bcfd76313d680d1a687cec9a` | `578e52120239c1edb5bdc112575adde3d22d464a6c1c5688211d995cf90fd842` |
| `src/art04.js` | `f276f6358e851c5e91ddbf4ca2ce5b36363dea1bbf9ffdfeaf36afd6e0d86516` | `f276f6358e851c5e91ddbf4ca2ce5b36363dea1bbf9ffdfeaf36afd6e0d86516` |

The working-tree hashes match the coordinator's pre-mutation record exactly. The mutation
control scripts splice `git show origin/main:src/world.js` into temp copies only; `src/`
is restored byte-for-byte and re-hashed after the controls run (see the controls commit).
