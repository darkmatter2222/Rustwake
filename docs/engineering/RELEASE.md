# Rustwake CI/CD, artifact provenance, promotion and rollback

## Trust boundaries
Developer work runs in isolated rw/ branch/worktree. GitHub-hosted CI runs untrusted repository build/test code; its artifact must be immutable and refer to the exact source SHA. Trusted self-hosted Databrick runner downloads static artifact and invokes its root-owned deploy adapter. Do not checkout arbitrary PRs or execute repository scripts on the privileged runner. Do not change existing ingress, secrets, release mount or runner permissions as an optimization.

## OPS-12 (#336) supply-chain hardening audit — 2026-11-17, base main b56fded0f0bbe6d038c353399d6f353419ceded4; TRAIN-TURN REBASE re-verified 2026-11-18 onto main 7856771597d1b69af4d404cc5ff9af1b0c56034a

Rebase receipts (report.json `train_turn_rebase`): the ONLY conflict was docs/backlog/GAPS.md, resolved by STRICT UNION (47 rows = 46 main + OPS-12 at top, zero rows dropped, main rows byte-identical). Main b56fded0..7856771 touched NEITHER .github/workflows/ NOR tests/deliveryAlert.test.mjs, and `git diff 514b80e0..newHead -- .github/workflows/` is EMPTY — the hardening is byte-preserved. `git diff main..newHead -- src scripts` is EMPTY. Rebased hardening code head: 9f15b96a93f39be9765df960fb6675091c95f201 (evidence refreshed in descendant commits; code/tests/workflows unchanged between them). Pins re-resolved via the API at rebase time: moving v4 tags still equal the pinned SHAs. Settings re-audited READ-ONLY: unchanged. Prior reviewer ACCEPT 6952171042 + product ACCEPT 6952308794 are SUPERSEDED by the base move; delta re-gates requested.

In-repo hardening + READ-ONLY settings audit. No GitHub repository setting was mutated; host-side recommendations are tracked in #561 (sponsor authorization required). Evidence receipts: `docs/evidence/336-ops-12/` (settings-audit.json, pin-provenance.json, mutation-results.json, dist-identity.json, report.json).

### Token scopes actually in use
- Repository default workflow token (`GET actions/permissions/workflow`): **read**, `can_approve_pull_request_reviews: false`. ci.yml formerly had NO `permissions:` block and inherited this default — a LATENT least-privilege gap (a future default flip to write would have granted PR jobs write). Now explicit: ci.yml top-level `permissions: contents: read` (checkout is the only GITHUB_TOKEN consumer; npm cache and artifact upload use the runtime token).
- delivery.yml top-level `contents: read, actions: read` — audited, kept unchanged. `actions: read` is retained because the deploy step passes `github.token` to the host-owned adapter (`RUSTWAKE_GITHUB_TOKEN`) whose full scope consumption cannot be audited from the repository; narrowing it risks a silent non-deploy. Host-side scoping of that token is a #561 recommendation.
- delivery-alert.yml: workflow `contents: read`; only the `alert` job escalates to `issues: write` (gh issue list/create/comment) + `actions: read` (gh run list lookup) — exactly what `scripts/delivery-alert.mjs` uses. No other job-level permissions exist anywhere.
- Secrets: the only `secrets.*` reference in any workflow is `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` passed as `env:` to the alert step. Guard-enforced: secrets never appear in `run:` interpolation, no `set -x`/`printenv`/bare `env`/credential echo anywhere.

### Branch protection state (measured, not changed)
`GET branches/main/protection` → **404 Branch not protected**. "Never direct-push main" is currently convention-only. Required reviews MUST NOT be enabled as a reflex: the release token is the same account as the PR author, so GitHub rejects self-approval and the release train would deadlock. Options (ruleset with required checks but no required reviews; independent approver identity; `sha_pinning_required: true`; `allowed_actions: selected` allowlist) are recorded in #561 for sponsor decision. Also measured: `allowed_actions: "all"`, `sha_pinning_required: false`, public repo with forking allowed.

### Hosted PR jobs vs trusted runner separation (guard-enforced)
- ci.yml triggers are exactly `push` + `pull_request` (NEVER `pull_request_target`): PR code runs only on unprivileged `ubuntu-latest` with a read-only token.
- delivery.yml triggers are exactly `workflow_run` (ci, completed, main) + `workflow_dispatch`. The `package` gate requires ALL of: CD variable enabled, upstream conclusion `success`, upstream event `push`, upstream head branch `main`, and `head_repository.full_name == github.repository` (fork exclusion), OR dispatch on `refs/heads/main`. The exact expression is test-pinned; a 1485-case mirror truth table proves every fork/PR/non-main/disabled/unknown-conclusion shape fails closed.
- The ONLY self-hosted job is `deploy` (`[self-hosted, Linux, X64, rustwake-deploy]`, environment `rustwake-databrick`), `needs: package`, no checkout, no npm — it only downloads the static artifact and invokes the host-owned adapter. `verify-live` and `hosted-browser` need the full upstream chain and run on hosted runners; no job-level `if: always()` can bypass a skipped `package`.
- `workflow_run` checkout provenance: delivery checkouts bind to the immutable source SHA validated `^[a-f0-9]{40}$` by the identity step (a `workflow_run` payload can predate the fix, but delivery MUST build the exact concluded SHA, so SHA-pinning is correct there). delivery-alert reads the run PAYLOAD, not the checkout, so it pins `ref: main` — the #549 house precedent. Both rationales are now test-asserted; all delivery/alert checkouts use `persist-credentials: false`.
- The only `rm -rf` is `rm -rf -- "$CANDIDATE"` with `CANDIDATE` always `${{ runner.temp }}/rustwake-<run_id>-<run_attempt>` — quoted, `--`-terminated, non-empty literal prefix, scoped inside runner.temp. Test-pinned.

### Action pinning table (provenance in pin-provenance.json)
Every `uses:` (16 total) is pinned to the full commit SHA of the SAME major version in use; the moving `v4` tag was verified via `gh api repos/actions/<a>/git/ref/tags/v4` + `tags?per_page=100` to point at exactly the newest v4.x tag commit, so the pins are behaviour-identical to floating `@v4` at base main.

| Action | Pin | Version comment |
|---|---|---|
| actions/checkout | 11d5960a326750d5838078e36cf38b85af677262 | v4.4.0 |
| actions/setup-node | 49933ea5288caeca8642d1e84afbd3f7d6820020 | v4.4.0 |
| actions/upload-artifact | ea165f8d65b6e75b540449e92b4886f43607fa02 | v4.6.2 |
| actions/download-artifact | d3f86a106a0bac45b974a628896c90dbdf5c8093 | v4.3.0 |

Upgrades require re-resolving via the API and updating `PINS` in `tests/workflowSupplyChain.test.mjs` in the same PR; a floating tag, unknown action, SHA drift or missing version comment fails CI.

### #549 freeze supersession (deliberate, documented)
#549 froze delivery.yml/ci.yml byte-identical to base main 680c0156 (review condition, hash-guarded). #336 explicitly requires changing those files (permissions + pinning), so the freeze is superseded: `tests/deliveryAlert.test.mjs` test 7 is re-baselined to sha256 pins of the hardened content (ci 4212ae96…, delivery 675320f9…) — the drift-guard substance is kept, the retired git-diff-vs-680c0156 proof served only the old freeze. Gate semantics, needs chain, runner labels, concurrency and job order are unchanged; dist byte-identity (18/18 files) proves no game change.

### Negative proof (mutation-results.json)
Seven insecure mutations each ran the FULL suite and broke their named guards, then were restored with sha256 identity verified: fork-exclusion removal, action un-pinning, `pull_request_target` introduction, `write-all` permissions, secret echo, deploy `needs` removal, unquoted `rm -rf`. Every mutation also trips the re-baselined drift guard. All seven were RE-RUN at the rebased head (code head 9f15b96): each ran the full 477-test suite and broke exactly the same named guards as the original proof, then restored sha256-identical. Local suite at the rebased head: 477 = 466 current-main (7856771) + 11 new, 476 pass; the single failure is main's OWN Windows-only deliveryAlert :253 CRLF regex defect, reproduced identically on clean main (465/466); Linux CI unaffected. (Original pre-rebase measurement at b56fded0: 370 = 359 + 11, 369 pass.)

## Pipeline — mandatory for every accepted PR
1. Developer publishes draft PR. Independent QA and product-owner role comments approve exact current PR head; a changed head invalidates previous verdicts. No author self-acceptance.
2. Release engineer checks GitHub branch/PR identity, conflict status, approvals, CI, active leases and exact expected-head SHA, then merges via PR to main (never direct pushes). Record previous main SHA as rollback.
3. Watch the **main** CI run for merge SHA, not just branch PR CI. Failed main CI prevents ordinary delivery; fix via reviewed PR.
4. Watch matching workflow_run delivery triggered by successful main CI. Package, trusted deploy and sanitized receipt must all succeed. Receipt distinguishes actual game promotion from dashboard-only.
5. Read live HTTPS release-manifest.json and compare source_sha to the merged SHA; independently retrieve served JS/CSS/public assets and verify their SHA256 and byte sizes. Successful CI or deployment receipt alone is not enough to claim user-visible latest app. Since OPS-08 (#332) the delivery workflow automates this as the `verify-live` job: after the trusted deploy succeeds, a GitHub-hosted runner (never the privileged deploy runner) executes `scripts/verify-live-release.mjs <promoted-sha>` against public HTTPS, records the previous-main rollback target (`git rev-parse HEAD^`), main CI run and delivery run, and uploads the `rustwake-live-verification-<sha>` receipt artifact. PASS exit 0; FAILED (wrong source_sha, stale/altered asset checksum or bytes, index.html referencing uncovered assets) exit 1; UNKNOWN (network/TLS/404/malformed manifest) exit 2 — both fail the delivery run. Deterministic offline negative-case tests live in `tests/verify-live-release.test.mjs` (part of `npm test`). The release engineer still confirms the receipt at the exact SHA; automation does not replace the role-stamped release comment.
6. Since OPS-09 (#333) the delivery workflow automates the browser proof as the additive `hosted-browser` job: after `package`, trusted `deploy` and `verify-live` all succeed, an UNPRIVILEGED GitHub-hosted runner (never the privileged deploy runner) executes `scripts/capture-live.mjs <promoted-sha>` — one serialized Chromium per SHA (workflow + per-SHA concurrency groups), sequential fresh desktop 1440x900 and phone-sized 390x844 contexts against the LIVE public site, refusing a manifest source_sha mismatch. It proves canvas first frame, advancing animation, working controls with synchronous camera stamps, exactly one WebGL context, zero page errors/failed requests, no document scroll, and uploads screenshots + report.json as `rustwake-hosted-browser-<sha>`. A FAILED smoke fails the delivery run (no continue-on-error): the release stays UNVERIFIED even when the deployment receipt succeeded. The release receipt must cite hosted-browser PASS at the exact deployed SHA to retire the PASS_NUMERIC_ONLY local-preview caveat; local preview captures alone never retire it. Inspect the report for blank canvas, page errors, old shell, cache mismatch and broken controls. A separate physical phone check and sponsor visual G1 approval remain owed.
7. Post a role-stamped release issue comment: reviewed head, merge SHA, main CI run ID, delivery run ID, deployment receipt SHA/status, served manifest proof, hosted-browser PASS report + screenshot artifact (`rustwake-hosted-browser-<sha>`), rollback ref, and outstanding defects. Only then mark deployment verified.

## Current V2 foundation baseline
PR #306 merged SHA 258fce59755c4c07aabed0c6925a0757f0e4cc24. Main CI run 43782503007 and delivery run 43782537468 both succeeded; sanitized receipt says deployed. Its initial V2 production preview browser artifacts passed on desktop/phone-emulated sizes; that is not a physical handset or product-level art acceptance. PR #307 (camera/design) has failing PR capture as of 2026-11-15 local evening, even though push CI passed. Release engineer must resolve current PR CI failure before merging its newer head. Do not assume this historical statement remains true: refresh GitHub state each task.

## Incident categories
- Wrong served source SHA or hash: **not verified**; investigate CDN/cache, release adapter and manifest, preserve previous release.
- PR capture red: block PR merge; inspect exact failing browser assertion, not generic screenshots.
- Blank/old world or broken camera: player-visible P0/P1 bug; product/QA REWORK.
- Save/ledger corruption or online security risk: stop promotion and preserve evidence, revert via reviewed/authorized release procedure, never silently wipe storage.
- Deployer error: check receipt and host lock; do not manually overwrite protected symlink or modify Portainer behind its back.
- No browser access from GitHub-hosted worker: report verification UNKNOWN rather than pass; diagnose network separately.

## Release frequency and sessions
Promptly merge accepted PRs through one release lease to avoid an unmerged backlog. Team max = one coordinator + four rotating child model sessions. Browser automation is not a model child and should use one serialized browser process per actual release. Avoid launching local browsers in every agent. Keep complete rollback and audit history.

## PR-body closing-verb hygiene (issue 587) — durable rule, all roles

GitHub's closing-keyword parser is context-free. A closing verb (`close`/`closes`/`closed`/`closing`, `fix`/`fixes`/`fixed`, `resolve`/`resolves`/`resolved`/`resolving`) adjacent to an issue reference ANYWHERE in a PR description auto-closes that issue when the PR lands on the default branch — even inside a negation, a checklist item, a quoted product condition, or "next steps" prose. The prose written to prevent premature closure is precisely the string that causes it. This fired twice in this repository: the historical body line from issue 552 (PR 582, body line 4) and the checklist line from issue 567 (PR 573, body line 97). Both PRs carried the correct `Refs` convention on line 1; a second, later mention was the trigger. Both issues were reopened by the coordinator; a parser accident is not a product ruling and neither issue earned closure.

Binding rule for every role:

1. A closing verb must NEVER appear adjacent to an issue reference anywhere in a PR description — including negations, checklists, quoted product conditions, and "next steps" prose.
2. Write `Refs #NNN` on body line 1. Everywhere else refer to "issue NNN" WITHOUT the `#`, or rephrase to "issue NNN stays OPEN".
3. Brief templates must carry this rule explicitly, because the natural way to write "this PR does not close the issue" with a `#` reference is precisely the string that closes it.
4. The same parser reads commit messages, so the rule applies there too. Keep the structurally safe subject convention `feat(NNN):` / `fix(NNN):` — parentheses never form a closing pair, and a trailing bare `(#PR)` reference has no preceding verb.
5. Closure authority stays with product after merge + verification. Do not write "in flight" or "pending" status prose about work that has shipped; state what landed at which SHA.

### Pre-merge audit — mandatory release-engineer step (part of Pipeline step 2)

Before merging any PR, the release engineer runs the read-only guard against the LIVE PR body and requires zero hits:

    node scripts/check-pr-body.mjs --pr <number>

Equivalent file form (fetch first, then audit):

    gh api repos/darkmatter2222/Rustwake/pulls/<number> --jq .body > pr-body.txt
    node scripts/check-pr-body.mjs pr-body.txt

Predicate (case-insensitive): `(close[sd]?|closing|fix(es|ed)?|resolve[sd]?|resolving)[[:space:]]*:?[[:space:]]*#[0-9]+`

Exit 0 = clean; exit 1 = hits found (each reported with its line number and matched text); exit 2 = error (an empty or whitespace-only body is an error, never a vacuous pass). Any hit blocks the merge: fix the wording (a body edit does not change the head and does not void gates) or product explicitly owns the intended closure. Record the command and its exit code in the release receipt. Re-run at merge time on the live body — bodies are editable, so an earlier scan is a lower bound, not a substitute. The guard is read-only: it never edits a PR, never posts, never merges.

Known limitation (disclosed): the predicate is lexical and does not model GitHub's full grammar (e.g. keyword lists or markdown emphasis between verb and reference). It is a conservative superset for the studio's convention — it may flag prose GitHub would not act on, and that is the safe direction. Falsifiable tests: `tests/prBodyHygiene.test.mjs` (both real historical offending lines are fixtures there; tracked file contents are safe — the parser reads PR descriptions and commit messages, not files). Evidence: `docs/evidence/587-prbody/`.
