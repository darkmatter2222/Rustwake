# QA-BELT-001-g3 — independent review of the pushed candidate `8102ac4`

- Reviewer session: `ses_e4ceac41dffey6dO0MpOhH57Hu` (QA role), 2026-11-06/07
- Certified object: `8102ac4a89eb5a7abbf07a99b9e26cde6fb6ebe7` (`git cat-file -t` → `commit`; `git ls-remote origin` → `refs/heads/rw/belt001-g2`), helper receipt `.git/rustwake-publication/rw_belt001-g2.json` (`verified_push_at 2026-11-06T22:40:29.911Z`)
- Branch head at review time is `8f4a4059129db896acf4f96546017b975712b824` = `8102ac4` + one **docs-only** commit (`work/development/BELT-001-g1/HANDOFF.md`). The code tree is identical, so every gate reading below also holds for the head.
- Control tree: `b4e8321e782a4debc55e58a6c7b123e86dd1047a` (merge-base with `main` = `8d8d2ad7f83beefe3ee24a3f465ca392d5ac9848`)
- Worktrees (mine): `…/rev-belt001-g3` (candidate, `npm ci`, exit 0 — a real install, not a copy), `…/rev-belt001-g1-base` (base `b4e8321`, reused from my g1 run, `src/tests/scripts` clean), `…/rev-belt001-g3-merged` (my `merge-tree` result of `main` + belt + `rw/ui002-g1`, node_modules as a junction), `…/rev-belt001-g3-main` (`main`, for the i18n control)
- My own harness: `qa-own-g3.mjs` (identical file in both trees, SHA printed per run)
- Toolchain: node 22.18.0, npm 10.9.3, vitest 2.1.8, vite 5.4.11, tsc 5.6.3, Windows, Chromium via playwright-core

## Headline for the player

The three g1 blockers are gone: the gates are green on the SHA that is actually on the remote, and the entry chunk fits under the ceiling with 31 B to spare. A connection really costs scrap per tile and really returns 90 % of what was paid — I re-derived every number myself (2 → 2, 5 → 5, 6 → 5), and a blocked tap leaves the save byte-for-byte identical. Old saves are untouched: the mature fixture replays to the same tick, the same 2 667 batches and the same 82 credits on both trees. What the player still cannot see is the thing they paid for: the 6-tile link is drawn as one straight chord, so the price is legible only as a smaller `Scrap` chip.

## Verdict

**RECOMMEND** main integration of `8102ac4a89eb5a7abbf07a99b9e26cde6fb6ebe7` (= branch head `8f4a405`, docs-only delta). No technical veto: all nine rows are green or restated with evidence. Two conditions and one polish gap are at the end; the only red I produced is in the **merged** tree (`tests/ui/i18n.test.tsx`, one substring assertion), and both merge orders give the same tree, so it is a named one-line integration fix rather than a blocker on this candidate.

## Per-row verdicts — my own runs against `8102ac4`

| # | Row | Verdict | My measurement at `8102ac4` (vs `5eb4be6`) |
|---|---|---|---|
| 1 | `npm run typecheck` | **PASS — changed** | **exit 0, 0 diagnostics** (was exit 2 / 23 diagnostics). The six broken import/shape rules in `tests/simulation/belt.test.ts` are fixed |
| 2 | `npx vitest run` | **PASS — changed** | **exit 0, `Test Files 28 passed (28)`, `Tests 298 passed (298)`, 0 failed** (was 28 files / 1 failed / 283). `tests/simulation/belt.test.ts` now **executes** with **15 cases** (the ticket said 9 — actual is 15), all ✓. The save case is `B-3 … decodes the v1 fixture with no run, validates and re-encodes byte-identically` (`tests/simulation/belt.test.ts:397-403`: `decodeSave(raw)`, then `encodeSave(sim, lastSeenMs, settings) === raw`). My own `encodeSave → decodeSave` on a live priced state keeps `run` (lengths 2 / 5 / 6) and the recomputed price is unchanged |
| 3 | `npm run validate` | **PASS on the gate; the pinned line is the base reading** | **exit 0**, `content: 0 violation(s)`, `behaviour: firstDrone=314 firstResearch=498 tick=18298 machines=8 links=18 drones=4 batches=1932 credits=93 nodes=3`. The pinned `268 / 478 / … / drones=5 / batches=1902 / credits=82` is **not** this line — it is the pre-change `b4e8321` reading, and my candidate line is identical to my g1 measurement, i.e. **unchanged between `5eb4be6` and `8102ac4`**. Five quantities moved (+46 / +20 ticks, drones 5→4, batches 1902→1932, credits 82→93) because the purse now pays per tile; `tick 18298`, `machines 8`, `links 18`, `nodes 3` and the fixture checksum are unmoved. The old-save replay (row 8) still reads exactly `1902 / 82`, which is the parity proof |
| 4 | `npm run build` | **PASS — changed** | **exit 0**; entry `dist/assets/index-jp4qHb0Z.js` = **232 969 B** vs the 233 000 B ceiling → **31 B spare** (was 233 175 B, over by 175). Others: `index-9FriNULu.css` 7 474 B, `tables-BB2NPvQ2.js` 9 298 B, `catchup.worker-G_Jyr7uh.js` 13 406 B |
| 5 | B-1 price / refund / refusal, recomputed | **PASS** | My `qa-own-g3.mjs b1`, dock tile 2 → tile 1 / 16 / 17. Extent: engine `run` = `[2,1]` / `[2,8,14,15,16]` / `[2,8,14,15,16,17]` = **2 / 5 / 6 tiles**, byte-equal to my own independently written walk. Charged scrap **2 / 5 / 6** = `beltCostPerTile × tiles`; latency **4 / 10 / 12** = `beltLatencyPerTile × tiles`. After `encodeSave → decodeSave`: `run` intact, price 2 / 5 / 6 intact, removal returned **2 / 5 / 5** = `round(price × 90 / 100)` → **the `DEF-008` claim holds at this SHA**. Refusal at purse `n-1`: `{ok:false, reason:"insufficient", need:n, have:n-1, word:"scrap"}` for n = 2 / 5 / 6, and in all three `JSON.stringify(state)` is **byte-identical**, `revision` unmoved, `routes.length` unmoved |
| 6 | 12 h bench, my own interleaved measurement | **PASS on ≤10 %; the 17.619 % reading not reproduced** | Committed bench (`npx vitest run tests/perf/bench.test.ts`, trees alternating, SHA printed per run, 3 passes): `8102ac4` **41.82 / 42.86 / 45.28 ms** (median 42.86, mean 43.32) vs `b4e8321` **41.77 / 41.45 / 40.72 ms** (median 41.45, mean 41.31) → **+3.4 % (median pair), +4.9 % (means)**. My own harness (5 reps per pass × 3 interleaved passes, SHA per run): (A) cost-only 4-machine yard, 12.374 vs 12.031 ms mean = **+2.85 %**; (B) fixture with stored `latency 5`, 220.796 vs 225.386 ms = **−2.04 %**; (C) per-tile latency forced to `2 × tiles` by my own walk, identical input in both trees, 216.120 vs 222.980 ms = **−3.07 %**. So the priced model sits inside ±5 % and is *faster* than base on the linked yard; the lane's `38.408 → 40.264 = +4.83 %` matches my cost-only delta, the `17.619 %` figure does not reproduce. Absolute ms differ from the handoff's 43.89 / 42.75 because my instrument is a bare script, not the vitest wrapper — the deltas are the comparable part |
| 7 | `npx tsx scripts/probe-belt.mjs` determinism | **PASS** | Three runs: stdout identical every time — `probe-belt checksum 52a20c95`, `wrote work/feedback/belt001-harness.json (11063 B)`, exit 0. File `SHA256 = 58F8BCBC1ED1EA46EA88818581B2E2AB35B9BB478A0938ADDFAC3D52491D7514`, 11 063 B; `git hash-object` of the regenerated file = `56db7e01544524e6a568f4a6887eeff5adf3e305` = **the committed blob**, so the stored evidence is reproducible from source. (`git status` shows `M` on that file only because `core.autocrlf=true` with no `.gitattributes`; `git diff` is empty) |
| 8 | Save compatibility | **PASS** | `docs/evidence/yard-mature.json`: `envelope.checksum = eede3c4f`, my recomputed `checksum(JSON.stringify(payload)) = eede3c4f`, `schemaVersion = 1`, `decodeSave` ok, `validateSim → null`, re-encode **26 114 B → 26 114 B byte-identical**; 18 routes, **0 with `run`**, one distinct latency (5); at decode tick 18298, `batchesDone` sum **1902**, **credits 82**, scrap 18 — the pinned figures exactly. Old-format replay, same script in both trees, 2 rounds each: tick **450 298**, batches **2667**, credits **82**, scrap 10, store digest `7d8a1456`, full-state digest `f50e5fcd` — **all four runs identical**, so the price does not move an old save |
| 9 | `tests/ui/resting-screen.test.tsx` vs main | **RESTATED (claim wrong, merge harmless)** | Blob at `8102ac4` (and at head `8f4a405`) = **`3c5dcfdf3400567a3315d344bc4fbf9935befb40`**, whereas `main` (`8d8d2ad`) and the merge-base both hold **`7fb91a1d4cb83da1b999fbdd143cbfd3e8ae03a9`**; the claimed `50032291…` **is not a valid object** (`git cat-file -t 50032291` → "Not a valid object name"). The file is main's plus **exactly one** changed assertion (`Last need 25 scrap` → `Last need 3 scrap`) and its comment. `rw/ui002-g1` (`588c1fa`) holds a third version `c56a9f6b…`. Merge order is a non-issue: `git merge-tree` yields the **same tree `9ba0deb…` in both orders** with no conflict, and the auto-merged file `3d778256` keeps UI-002's `pipLine` structure **and** the belt's `Last need 3 scrap` — and that merged file passes |

## Merged-tree check (what the release engineer will actually ship)

My own `merge-tree` of `main` + `8102ac4` + `rw/ui002-g1` (`588c1fa`), both orders, tree `9ba0deb…`:

| gate | result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npx vitest run` | **exit 1** — `Test Files 1 failed \| 28 passed (29)`, `Tests 1 failed \| 301 passed (302)` |
| `npm run validate` | exit 0, same behaviour line (`314 / 498 / 18298 / 8 / 18 / 4 / 1932 / 93`) |
| `npm run build` | exit 0, entry `index-zUB9QJ9F.js` = **232 353 B** ≤ 233 000 (**647 B spare**), css `index-B1FOV2xO.css` 7 849 B |

The single merged failure: `tests/ui/i18n.test.tsx > string table (B-10) > phrases every panel from the table` — `expect(machineText).not.toContain("1 units")` (`tests/ui/i18n.test.tsx:301`) fails because the belt's 90 % refund makes the dismantle button read **`Dismantle · +21 units`**, and `"21 units"` contains the substring `"1 units"`. Control: that file is **green on `main` alone (9/9)** and green inside the belt candidate's own 298 — a three-way interaction, not a defect in either lane's artifact. Reproduction: `git merge-tree --write-tree` the three SHAs, `npm ci` (or a junction), `npx vitest run tests/ui/i18n.test.tsx`.

## What I looked at with my own eyes (phone size)

Captured by me from this build with `node scripts/capture.mjs` against `npm run preview` (390 × 844 CSS, device scale 2, **organic** session, no seeded state, source SHA `8102ac4`):

- `docs/screenshots/latest-mobile.png` (74 629 B) — resting screen: chips `Scrap 7 · Ferrous 111 · Credits 30 · Store900/900`; two-tier card (`Build Copper separator · 25 scrap + 5 ferrous` / `A machine waits for input; check its empty side.` / `Drones 1 · Power 8 · 0 requested · 100 %` / `Batch pips · Scrap sorter #8 0/5 · Furnace #9 0/5 +1`); two fork faces `Faster batches 40 credits` / `Less power 30 credits`; accent primary `Build Copper separator 25 scrap + 5 ferrous` between `Store` and `Build`. Non-blank, no page error, and the three built machines now show **elbowed** cyan links rather than one straight chord.
- `docs/screenshots/latest-machine-mobile.png` (165 574 B) — machine panel at phone size: `Status Needs input`, `Batch 0 %`, `Cycle 6.00s`, `Actual rate 0.00 batches/s · 60s window`, `Max rate 0.17 batches/s at full power`, `Power 1 unit`, `Measured Working 0 % · waiting for input 100 % · output waiting 0 % · link 0 % busy · power 100 %`, `Next step Storage is full at 100 %…`, `Next upgrade 6.00s → 5.45s · 50 credits`, `Needs 3 Residue`, then `Upgrade · 50 credits / Recipe / Dismantle` at comfortable 46-px faces with the primary row below. No overflow, no clipped faces, singular correct (`1 unit`).
- `docs/screenshots/latest-multitab.png` (70 359 B) also refreshed. The script's fourth stage (desktop, 1 440 × 900) timed out waiting for `.dock__btn--primary` after the multi-tab lease handover — a capture-tool flake in my run, not a build failure: the phone session completed.

Candid commercial-quality read: the chrome holds at phone size and the model change is real, but **nearly invisible** there. The three most harmful visible defects in this lane, in order:

1. **The priced extent has no silhouette.** `src/game/renderer/scene.ts:517-540` still interpolates the cargo dot between the two endpoint centres (`a` → `b`) over `route.latency`; the renderer never reads `route.run`. The link priced at 6 tiles draws as one straight chord whose screen length is neither 6 nor comparable to the 2-tile link beside it. Fix: walk `route.run` — `lineTo` through `endpointPosition(tile)` for every index, dot position by cumulative segment length. The model already carries the data, so this is renderer-only.
2. **The price never reaches the screen.** After the tap the only change is `Scrap 10 → 7` in a chip. Nothing beside the connection or in the machine panel says `6 tiles · 6 scrap`. One line under the connection, or a `Link 6 tiles · 6 scrap` row in the panel where `link 0 % busy` already lives, closes the loop the player is being charged for.
3. **Chip typography is uneven**: `Scrap 7`, `Ferrous 111`, `Credits 30` have a space before the value; `Store900/900` does not. It is the most-looked-at row on the resting screen and the mismatch is visible side by side — a one-character fix in the chip template (UI-002's file). Also visible: a ~215 CSS-px dead band between the canvas bottom and the dock row at 390 × 844 (layout, UI-002's lane).

## Reconciliation with the lane's claimed numbers

| Claimed (handoff / ticket) | My measurement at `8102ac4` | Status |
|---|---|---|
| typecheck exit 0 | exit 0, 0 diagnostics | confirmed |
| vitest 298 passed / 28 files | 298 passed / 28 files, exit 0 | confirmed |
| belt file has 9 cases | 15 cases, all green | **restated** (more than claimed) |
| validate 0 violations, after-line `314 / 498 / 18298 / … / 4 / 1932 / 93` | identical | confirmed |
| pinned "before" line `268 / 478 / … / 5 / 1902 / 82` | equals `b4e8321` only | confirmed as the *base* line, not this candidate's |
| build exit 0, entry `index-jp4qHb0Z.js` 232 969 B | exit 0, 232 969 B | confirmed |
| probe `52a20c95`, file sha256 `58F8BCBC…`, no diff | identical, blob `56db7e01…` | confirmed |
| bench −2.6 % (43.89 → 42.75) | +4.9 % (means, committed bench) / −2.0 % (my linked yard) | inside tolerance; **not reproduced as a speed-up**, both inside ±10 % |
| ticket's `+4.83 %` cost-only | my +4.9 % | confirmed |
| ticket's `17.619 %` with per-tile latency forced | my −3.1 % | **not reproduced** |
| fixture checksum `eede3c4f`, byte-identical round-trip, old save `1902 / 82` | identical | confirmed |
| `resting-screen.test.tsx` = main's version, blob `50032291…` | `3c5dcfdf` ≠ main's `7fb91a1d`; `50032291` is not an object | **refuted**, harmless: both merge orders give one clean tree |

## Three most valuable follow-ups

1. **Make the merged tree green with one line** (integration, ~1 min): in `tests/ui/i18n.test.tsx:301` replace `expect(machineText).not.toContain("1 units")` with a digit-aware match, e.g. `expect(machineText).not.toMatch(/(^|[^0-9])1 units\b/)`, and pin the new refund line explicitly (`expect(machineText).toContain("Dismantle · +21 units")`). Reproduction is in the table above. Nothing else in the 3-way merge is red.
2. **Ship the visible extent in `g2`** (renderer, model already ready): draw `route.run` as the polyline it is (`scene.ts:517-540`), move the cargo dot along cumulative run length, and print `N tiles · N scrap` beside the fresh connection plus a `Link N tiles · N scrap` row in the machine panel. With the straight chord, the printed tile count will not match the drawn segment — that mismatch is the defect, not a rounding note.
3. **Keep two numbers owned through integration**: (a) the entry ceiling — 31 B spare on this candidate alone, 647 B in today's 3-way merge, so the release engineer re-measures after each additional lane lands and exactly one role owns the trims; (b) the bench claim — restate it from an interleaved pair (my medians: committed bench 42.86 vs 41.45 ms = +3.4 %) and drop or re-derive the unreproduced `17.619 %`. Housekeeping worth one line: add `.gitattributes` with `*.json text eol=lf` so `npm test` no longer leaves `work/feedback/belt001-harness.json` showing as modified (content identical, `git diff` empty, `core.autocrlf=true`).

## Unverified dimensions

- Audio: nothing in this lane touches it; not listened to (no audio artifact in this candidate).
- Real-handset frame timing: the 12 h bench is headless node, not device rAF. The `g2` renderer change will need a device-side clip.
- Human comprehension of the priced connection (does a phone player understand why `Scrap` fell by 6?) — untested; only the simulated literal in `tests/ui/resting-screen.test.tsx` covers the number's survival.
- The desktop capture stage (1 440 × 900, fourth session) did not complete in my run, so this review's visual evidence is phone-size only; the g1 desktop captures remain the last desktop capture.
- `work/feedback/belt001-harness.json`'s `layouts.patterns` ladder (B-2 rows) was re-checked by the candidate's own in-process test, not re-derived independently by me in this generation.
