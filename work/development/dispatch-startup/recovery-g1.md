# Recovery and reconciliation list (startup-code-audit, generation 1)

Everything here was observed with `git status --porcelain`, `git log`, `git diff --stat`, `git merge-base --is-ancestor`, `git apply --check` and two `npm` runs in the main checkout at `b4e8321`. Nothing was committed, pushed or deleted by this audit.

## R-1 Code that exists but is not on `main`

| Branch | Tip | State | Action |
|---|---|---|---|
| `bld001-g1` | `6b5cee4` | **not an ancestor of main** (verified: `merge-base --is-ancestor` exits 1). Contains the cheapest-first dock ordering plus `scripts/measure-bld001.mjs` and `scripts/probe-save-bld001.mjs`. My runs: 284 tests / 27 files green in `…/fe4e05/polish001-dev`; `git apply --check --3way` of its `format-patch` onto main = exit 0 | The **only** real unrecovered code change. Fold into the UI lane (it owns `src/ui/text.ts`) or let the release engineer cherry-pick it; do not re-author it |
| `strat003-g1` | `43cf3ac` | not an ancestor, but **content already published**: `git diff main 43cf3ac -- src tests` is empty except `src/ui/styles.css` (the later CHRM-002 css), i.e. every other blob equals main's; `work/releases/RELEASE-005.md` records the per-file integration | No action; keep the branch as provenance |
| `strat002-g3` | `d836a7a` | not an ancestor, content integrated via `7d7e05c` (`work/releases/RELEASE-004.md` lists it as the parent chain); later main work supersedes its files | No action |
| `art002-g1` | `d7af68a` | **is an ancestor of main** (`merge-base --is-ancestor` exit 0) — this is the RELEASE-006 integration commit, also the deployed SHA | No action; the branch name is stale (it points at a release commit), consider deleting the ref after the next integration |
| `audio-fixes` | `0d37b0c` | not an ancestor; integrated except its **last commit only**: `git diff main 0d37b0c -- tests/renderer/scene-draw.test.ts` = +165 lines, the `L-5 (ruling 1)` per-pixel census case (main has 43 `it(`, the branch 44). Measurement-only | Optional: cherry-pick `0d37b0c` on the next test-touching slice (it will conflict-free add one case). Not urgent |

## R-2 Untracked / modified files in the main checkout (the release engineer owns tracked state)

`git status --porcelain` at this audit:

```
 M SPONSOR_INBOX.md                      # new sponsor text (see R-3), not yet acknowledged
 M work/review/rev-q002-g1.md            # reviewer rewrote the Q-002 receipt in place (150 -> 134 lines)
?? opencode.json                         # local plugin mount (tools/team-supervisor), 3 lines
?? work/review/ART-002/                 # 43 files: ART-002-g1.md, appendix-g1.md, 36 captures, 3 tooling scripts
?? work/review/_qa_s3g1_hash.mjs
?? work/review/_qa_s3g1_probe.mjs
?? work/review/_qa_s3g1_save.mjs
?? work/development/dispatch-startup/   # this audit (developer lane)
?? work/product/dispatch-startup/      # product-owner intake + SPRINT-003 (sibling lane)
?? work/review/dispatch-startup/      # QA/ds captures from the sibling lane (ds-capture.mjs + 13 PNGs + ds-measure.json)
```

Why it matters: `work/review/ART-002/ART-002-g1.md` is the **only** copy of the current visual critique and the only source of the E1 experiment that SPRINT-003 ranks first; if the checkout is cleaned, that critique and its 36 captures are lost. It is also the evidence the board cannot reference while untracked. Recommended: one docs-only publication by the release engineer that adds `work/review/ART-002/**`, the three `work/review/_qa_s3g1_*.mjs` probes, both `dispatch-startup` folders, `work/review/rev-q002-g1.md`, `SPONSOR_INBOX.md` and `opencode.json` (or an explicit decision to keep `opencode.json` local-only, since it contains a machine-specific absolute path).

## R-3 Sponsor text waiting for intake

`SPONSOR_INBOX.md` currently holds one line below the marker (`Please make sure we are making feature branches, merging on mina via github.`); the earlier UI critique that was present at the start of this audit has been moved into `work/product/dispatch-startup/sponsor-intake.md` (S-1/S-2 verbatim) by the product-owner lane, but no `work/sponsor/intake/*.json` receipt exists on disk yet. Per the intake protocol the removal is only valid **after** the snapshot + `ack` run, so that pair is still owed (`node scripts/sponsor-inbox.mjs snapshot` then `ack`, release-engineer lease). The branch/PR directive is already how the lanes work (each lane has its own branch, e.g. `bld001-g1`), so it needs one line in the published README rather than a ticket.

## R-4 Ticket reconciliation the board still owes

- `ART-002` is `triaged` with `candidate_sha: null` although `work/review/ART-002/ART-002-g1.md` carries a complete REWORK verdict, three named defects and experiment E1 — the verdict just never reached the ledger.
- `BLD-001` is `triaged`, `product_approved: true`, and its candidate (`6b5cee4`) already exists — status should read `implementing` with that SHA once the UI lane adopts it.
- `D-1` (44.6 % blocked-tap cell) and `UI-001` (panel coverage) are both still `triaged`; `work/product/dispatch-startup/assignments.md` folds them into UI-002 rows U-1/U-4, which the board should reflect so nobody re-implements them separately.
- New items this audit found, for triage: **UI-002 N-1** the `dl` grid row-alignment defect (with the `ds-360-ts2-panel-store.png` capture as its reproduction), **N-2** duplicated capacity fact in the store panel, **N-3** two dock faces labelled `Build`, **MOVE-001** (expose `machine.move`, which already has no call site and no test) and the named `dismantleRefundPct`.
- `DEF-001` (cached `index.html` naming removed hashed assets, no `Cache-Control`) is still `inbox` — it is an infrastructure-side fix in `deploy/nginx.conf`, unrelated to the three lanes, and should keep its own small ticket.
