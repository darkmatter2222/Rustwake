# RW3D T05 (#132) — integration architecture, obsolete-art retirement, P0 gate evidence

- Role: developer (implementation author; NOT an independent review or gate verdict)
- Issue: [#132](https://github.com/darkmatter2222/Rustwake/issues/132) — [RW3D][P0][T05] Approve integration architecture and replace obsolete art constraints (parent #122, master #121, Project 2)
- Branch: `rw/132-architecture`, worktree `C:/Users/ryans/AppData/Local/Temp/rw-qwen/132-dev`, base main at `1b83c58bd103a1a4a0f4529e820a7e4409685def` (PR #189 merge)
- PR / immutable head SHA: recorded on the linked draft PR and its `role=developer` evidence comment (this document is committed inside that head; checks below ran on the working tree identical to it — docs-only, verified clean `git status` after commit)
- Acceptance IDs: G0/P0 integration — R02, V06, V03 (prototype), E01/E08 (baseline), P01 (initial measurement); issue #132 acceptance criteria (architecture approval, explicit art retirement, accepted-SHA publication, reproducible checks, save/migration impact documented)
- Evidence template: [ACCEPTANCE.md](../vision/ACCEPTANCE.md)

## 1. Deliverables (owned write paths, exact)

| # | Path | Content |
|---|---|---|
| A | `docs/vision/architecture/README.md` (new) | Integration architecture: renderer/state boundary per T02 inventory; E01 conservation baseline (fixtures retained); content-table seed with `contentVersion` branching for #148 G4; save/migration boundary with #191 precondition before #151 G1/P1 and #148 T21, G2+G4 → #148; instancing-first plan for P1 population + P02 memory loop; kit occupancy rules per product rulings a–g (crane swing = clearance not occupancy; wall_gate effective margin 0.05 u blockout, ≥0.15 u production) |
| B | `docs/vision/architecture/adr-0001-renderer.md` (new) | three.js `0.187.0` EXACT pin project-wide, no floating ranges, bump = issue + re-benchmark; alternatives from T03 ADR; **ruling: ALIGN the 0.160.0 scale fixture (re-pin + re-bench), tracked follow-up named for the coordinator**; cites product merge condition 6871124473 on PR #187 |
| C | `docs/vision/architecture/p0-gate-evidence.md` (new) | Integrated G0 evidence table (R02/V06/V03/E01+E08/P01) at accepted merged SHAs with reviewer+product comment IDs and CI/delivery run IDs from release receipts; P0 gate checklist including #190; explicit gaps (visual inspection PENDING, phone evidence via #190, #191 before G1/P1) |
| D | `docs/evidence/2026-11-14-rw3d-t05-architecture.md` (new) | This receipt |
| E | `docs/vision/TECHNICAL_CONTRACT.md` (surgical amendment) | "Retain and replace deliberately" section only: exact-pin policy + ADR pointer; explicit retirement table for the six Canvas 2D pixel/paint test files and the 233000 B ceiling; retained-test list (`tests/legacy/**` from #129 stays). No other section touched |

Peer #190 paths (`docs/vision/devices/**`, `docs/evidence/*t03a*`) untouched; no `src/`, `tests/`, `package.json`, lockfile or infrastructure changes.

## 2. Scenario, seed, save

Docs-only architecture/evidence change. No save is read or written; save hash N/A. "Seed" = repository at base SHA `1b83c58bd103a1a4a0f4529e820a7e4409685def`; the only executable state exercised is the standard content gate and test suite (deterministic; no RNG/wall-clock in simulation). No new benchmark or render was produced — this issue compiles already-accepted evidence at merged SHAs (T01 `8b78d09`, T03 `262829e`, T04 `4acf7ef`, T02 `1b83c58`).

## 3. Device / browser / quality

Windows 10.0.26200 x64, Node v26.3.0, pnpm 10.31.0, vitest 2.1.8 (jsdom). Headless characterization only — no device/browser/quality-tier claims, no visual evidence produced (none required for a docs-only architecture issue). Referenced renders/benchmarks are the merged T03/T04 artifacts, cited not re-produced. Author is a non-vision agent; visual fidelity is NOT self-certified anywhere in this PR.

## 4. Checks (real exit codes, worktree root)

| # | Command | Expected | Actual | Exit |
|---|---|---|---|---|
| 1 | `pnpm install` (NODE_EXTRA_CA_CERTS=C:/Users/ryans/node-extra-ca.pem; node_modules absent in fresh worktree) | deps resolve | Done in 3.3 s, pnpm v10.31.0 | 0 |
| 2 | `pnpm validate` | content/behaviour gate clean | 15 resources / 8 blueprints / 12 recipes / 3 research nodes; 0 content + 0 behaviour violations | 0 |
| 3 | `pnpm typecheck` | strict tsc clean | clean (no output) | 0 |
| 4 | `pnpm test` (run ONCE) | unchanged baseline: 63 files / 768 tests green (docs-only change) | **63 files / 768 tests passed**, 18.94 s; no failures, nothing skipped | 0 |
| 5 | Markdown link check over the 5 owned files (node script, relative targets resolved against each file's directory) | every added relative link resolves | all relative links resolve; GitHub issue/PR links point to entities verified live via `gh` (issues 132/148/151/190/191; PRs 186/187/188/189) | 0 |
| 6 | `git status --short` + staged-diff scope check | only owned paths changed; no pnpm-lock.yaml, no CRLF-phantom files | 4 new files + 1 amended file, all inside owned paths; `pnpm-lock.yaml` untracked and NOT committed | 0 |

Legacy baseline cross-check (not re-run here; accepted at `1b83c58`, independently reproduced by reviewer 6871145575): `tests/legacy` 3 files / 22 tests; fixture regeneration byte-identical.

## 5. Fixture align/quarantine recommendation (deliverable B summary)

**ALIGN**: re-pin `prototypes/rw3d-scale-fixture/` from three `0.160.0` to exact `0.187.0` and re-run capture + 103 numeric checks with unchanged tolerances; disclose any version-induced pixel finding, never relax thresholds. Justification: the fixture is a living V06 tool that #136/#142/#164 must re-run; quarantine would orphan it and force a duplicate at the production pin; no accepted claim is invalidated meanwhile (V06 accepted scoped at `4acf7ef`, visual withheld). **Follow-up task for the coordinator to file**: "[RW3D][P1] Align rw3d-scale-fixture to three 0.187.0 and re-run V06 capture (T05/ADR-0001 follow-up)" — blocked-by #132 acceptance, scheduled before #142 T15 re-runs the fixture. Full ruling: [ADR-0001 §4](../vision/architecture/adr-0001-renderer.md).

## 6. Obsolete art retirement (deliverable E summary)

Grep results: `docs/vision/BACKLOG.md` contains **no** pixel-exact/old-byte art constraints (it is the issue crosswalk; nothing to retire there). `docs/vision/EXECUTIVE_CONTRACT.md` acceptance-hierarchy clause already mandates deliberate replacement of "old tests pinning exact artwork, old 233000-byte caps or single-next-action behavior". Retired explicitly in TECHNICAL_CONTRACT.md (from T02 audit §6): `silhouette.test.ts` (28 its incl. 233000 B ceiling → re-declare against ≤8 MB compressed budget), `scene-draw.test.ts` (43), `world-60.test.ts` (16), `belt-extent.test.ts` (4), `drone-leg.test.ts` (5), `camera-50.test.ts` (18, retarget). Retained: `tests/legacy/**` (#129), all economic invariants, `gestures-50` (retarget), UI command/settings/save tests, perf bench (re-baseline), historical art evidence. **Retirement is policy effective when the 3D renderer lands; this PR deletes no tests.**

## 7. Save / migration / recovery impact

**None directly** (docs-only). Recorded boundary decisions: G1 fix [#191](https://github.com/darkmatter2222/Rustwake/issues/191) is a precondition before the G1/P1 gate [#151](https://github.com/darkmatter2222/Rustwake/issues/151) and before [#148](https://github.com/darkmatter2222/Rustwake/issues/148) T21 migration; G2 size cap + G4 contentVersion branching assigned to #148 (design seed in architecture README §3); G3 cooperative lease acceptable locally, revisit at P4. Existing saves, cancellation, approval settings and security untouched.

## 8. Capability gaps and limitations

1. **Capable visual inspection PENDING.** Non-vision author; numeric/geometry evidence only. A vision-capable reviewer is owed at art acceptance and mandatory at G1 (#151). This PR does not certify any visual fidelity.
2. **Real-phone evidence owed via [#190](https://github.com/darkmatter2222/Rustwake/issues/190)** (in flight, peer-owned). Desktop emulation is NOT phone evidence; no handset claim is made. #190 is on the P0 gate checklist.
3. **G1 (#191) must merge before G1/P1** — gate evidence states this explicitly; G0 may pass with G1 filed per product ruling 6871192050.
4. No new measurements: P01/V03 numbers are compiled from accepted T03 evidence at `262829e` (single-asset blockout; P1 populations and P02 memory loop unmeasured, owner #151).
5. Scale-fixture alignment is a recommendation + named follow-up, not performed here (fixture is outside this issue's write paths).
6. All GitHub posts share one account; role stamps are not independent review by username. Reviewer/product verdicts must come from separate role passes on this PR's immutable head.
7. `pnpm-lock.yaml` is a local install artifact, deliberately untracked and NOT committed (repo tracks `package-lock.json`). No CRLF-phantom empty-diff files staged.

## 9. Verdict and stop condition

Developer delivery complete for the scoped outcomes; **handed off for independent QA + product decision on the immutable PR head** — no self-acceptance, no merge, no label edits. Release engineer merges; main CI/CD verifies. P1 unblocks only after genuine gate evidence is accepted. Stop condition met at: draft PR + one `role=developer` evidence comment (head SHA, deliverables, checks+exit codes, fixture recommendation, limitations).