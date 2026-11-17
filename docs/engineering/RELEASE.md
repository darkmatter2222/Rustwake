# Rustwake CI/CD, artifact provenance, promotion and rollback

## Trust boundaries
Developer work runs in isolated rw/ branch/worktree. GitHub-hosted CI runs untrusted repository build/test code; its artifact must be immutable and refer to the exact source SHA. Trusted self-hosted Databrick runner downloads static artifact and invokes its root-owned deploy adapter. Do not checkout arbitrary PRs or execute repository scripts on the privileged runner. Do not change existing ingress, secrets, release mount or runner permissions as an optimization.

## Pipeline — mandatory for every accepted PR
1. Developer publishes draft PR. Independent QA and product-owner role comments approve exact current PR head; a changed head invalidates previous verdicts. No author self-acceptance.
2. Release engineer checks GitHub branch/PR identity, conflict status, approvals, CI, active leases and exact expected-head SHA, then merges via PR to main (never direct pushes). Record previous main SHA as rollback.
3. Watch the **main** CI run for merge SHA, not just branch PR CI. Failed main CI prevents ordinary delivery; fix via reviewed PR.
4. Watch matching workflow_run delivery triggered by successful main CI. Package, trusted deploy and sanitized receipt must all succeed. Receipt distinguishes actual game promotion from dashboard-only.
5. Read live HTTPS release-manifest.json and compare source_sha to the merged SHA; independently retrieve served JS/CSS/public assets and verify their SHA256 and byte sizes. Successful CI or deployment receipt alone is not enough to claim user-visible latest app.
6. Inspect one GitHub-hosted browser report for the actual public site (desktop and emulated phone sequentially); verify no blank canvas, page errors, old shell, cache mismatch, broken controls, and no document scrolling. A separate physical phone check and sponsor visual G1 approval remain owed.
7. Post a role-stamped release issue comment: reviewed head, merge SHA, main CI run ID, delivery run ID, deployment receipt SHA/status, served manifest proof, browser screenshot artifact, rollback ref, and outstanding defects. Only then mark deployment verified.

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
