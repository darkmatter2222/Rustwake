# ART-003-r1 — independent QA of PR #25 (rw/art003-g1)

- Role: reviewer
- Verdict: **REWORK**
- PR: https://github.com/darkmatter2222/Rustwake/pull/25 (draft)
- Issue: https://github.com/darkmatter2222/Rustwake/issues/12
- Head SHA reviewed: `7f934cfe5ce540b24710156037e011be5b2323f1`
- Comment: https://github.com/darkmatter2222/Rustwake/pull/25#issuecomment-6716502969
- Checkout: `C:\Users\ryans\AppData\Local\Temp\opencode\rev-art003-g1`, detached at that SHA; merge-base with `main` = `887b5bc` (`main` = `6e0dce9`, branch is 1 commit behind)

## Technical pass (own runs)

| Check | Result |
|---|---|
| `npm test` | 28 files / 294 tests, all pass |
| `npm run build` | OK (tsc + vite), 53 modules |
| Entry chunk bytes | 232337 B, ceiling 233000 B → inside, 663 B headroom |
| `node scripts/art003-census.mjs` (tag `r1`, dpr1 390x844) | grid 0.01 % / gravel 0.1 % / machine body 0.4 %; GRAVEL 36 ticks; contactShadow 444 px; pageErrors 0 |
| Unit-resolution gray matrix (own browser run of the same math) | 15 pairs, min 32.2 %, mean 49.19 vs base 48.69 |
| Lattice family (own extension of that math) | min 27.5 % → under the named 32 % floor |
| Motion, `drawScene` pixels | running 59→79 amber px on frames 2-3; reducedMotion 59/59; starved 27/27 |
| CI at head | `ci`/`build` FAILURE, run 42431661360, one test (`telemetry.test.mjs` "six model sessions") that `main`@`6e0dce9` already fixes |

Media inspected: `docs/screenshots/slice-phone-rest.png` and `-before`, `slice-phone-one-machine{,-before}.png`, `slice-sheet-silhouette{,-before}.png` (780x1688 / 1800x840), plus my own captures in this folder (`sheet-900x420.png`, `scene-phone-rest.png`, `role-*.png`, `cell-*.png`). My own sheet render matches the committed `slice-sheet-silhouette.png`, so that still is current; `docs/screenshots/role-*.png` are unchanged bytes (stale, from the ART-001 lane). Audio not verified (no artifact in this lane).

## Visible verdict at 390x844

The four starter kinds plus the dock are separable by silhouette without reading the digit (disc grid / cap-topped chimney / two rings on stands / mast + scanner bar / ticked plate), the single upper-left light direction is consistent, and the contact ellipses plus the dimmed one-tick dot field make the row sit off the ground. The five lattice buildables (`generic`, `polymerRecycler`, `copperSeparator`, `platePress`, `circuitAssembler`) still read as bars on a frame, separated only by which 3-unit row a bar sits on.

## Rework list

1. `sheet.matrix` in the census artifacts is a geometric invariant, not an art measurement (identical before/after for all 15 pairs; `_geom.mjs` reproduces all 15 values with no pixel read). Compare each role's own 32-unit box in aligned local coordinates — PR #26's census already does this.
2. `ids6` covers only 4 of the 8 machine blueprints (it includes dock and drone). Measure all eight plus `generic`; the four lattice rows sit at 27.5–28.1 % and need a distinct outer element each, not a one-row bar offset.
3. The `output-blocked` settle has 0 px visible amplitude: the static 6-unit accent bar and the 4-unit settle bar share rect and colour, so the rust row stays `11 px` on every frame (rows `326:11, 327:11`, frames 0-5). Paint that bar once with the computed width, or move the settle to its own row (`y + 13*s`) like the `powerLimited` tick. See `_blocked_bar.mjs`.
4. Merge `origin/main` into `rw/art003-g1` to clear the only CI failure.

## Supersession

`git merge-base --is-ancestor 7f934cf 2b343aa` → true: PR #26 (`rw/art004-g1`, head `2b343aa22f9a384f4708c9c40c97f391c25dc606`) contains #25's commit and adds main merged (`87293fb`), the aligned per-cell census matrix, `SHEET_LAYOUT`/`grayStepOf` exports, per-kind gray steps for the two 32.2 pairs, `select` bevel at alpha 1 and the `circuitAssembler` row fix. Recommend the release engineer act on #26 after its own QA at its head; merging #26 lands #25's content, so no double merge. Items 1 and 3 above are still open in `2b343aa`.

## Capture provenance (shared worktree)

The registered worktree is shared: `HEAD` moved to `2b343aa` (PR #26's head) while I worked, because the ART-004 worker runs there too. I re-captured the same crops against that tree (`_cmp/`) to date my own media: only `furnace`, `wireMill`, `signalLab`, `circuitAssembler` (and the composed sheet) differ — exactly the four rows `2b343aa` edits — while dock, sorter, drone, generic, polymerRecycler, copperSeparator, platePress are byte-identical. So the PNGs above belong to `7f934cf`, and the diff doubles as confirmation that #26 = #25 plus those four rows. The `7f934cf` numbers in the table also come from the pre-move tree: my build printed `index-BZYYwOmt.js 232.30 kB` (232337 B) whereas `2b343aa`'s own message reports 232792 B.

Note for the next reviewer in this folder: `node scripts/art003-census.mjs` writes into `docs/evidence/`, which is shared with the ART-004 lane; use a unique `CENSUS_TAG` and delete your file afterwards (mine was `2026-11-06-art003-census-r1.json`, removed; the full JSON is kept in `_census_r1.json.out`).

## Files in this folder

`PR25-comment.md` (posted), `_geom.mjs` (matrix degeneracy proof), `_shots.mjs` + PNGs (own captures), `_matrix_motion.mjs` (full 11-role matrix + motion amplitudes), `_blocked_bar.mjs` (settle-bar measurement), `_census_r1.json.out` (my census run).
