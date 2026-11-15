# GitHub delivery workflow

Follow AGENTS.md and [execution contract](vision/EXECUTION.md). Current master #121, Project 2, cutover #128. This supersedes prior #43/Project 1 scheduling. Keep unresolved defects visible; reconcile their relevance during P0 rather than deleting them.

1. Coordinator checks live issue, role, blockers, phase gate and path leases. Assign issue URL and bounded outcome.
2. Developer uses isolated `rw/` branch/worktree, publishes checkpoint and linked draft PR. Existing `scripts/publish-feature.mjs --issue <url> ...` may be used when compatible with commissioned host.
3. QA independently tests exact immutable PR head and posts ACCEPT/REWORK. Product verifies player outcomes and art contract. Changed head invalidates stale acceptance.
4. Release engineer verifies evidence and required CI, resolves conflicts through author, merges via PR. Shared account cannot supply independent-account approvals; role evidence is explicit.
5. Verify main CI/deployment; link release, SHA, deploy receipt and rollback. Only then claim deployment. Issue completion requires accepted merged scope.

Five sessions total, no recursive spawning. No competing work/backlog ledger. Runtime adoption must be observed after host reload. Preserve dirty work and leases. Initial sponsor-requested planning package has a one-time direct-main exception; it does not authorize future direct pushes or bypassed review.


## End-to-end publication is mandatory (#248)
The developer publishes a useful isolated rw/ branch/linked draft PR. Once independent QA and product approve the exact current head, release engineering merges THAT PR to main (no direct main push). Immediately track the precise main CI run, its triggered delivery run, and the subsequent verify-live job in the same workflow; collect deployed manifest source_sha, asset SHA256 verification, live screenshots and browser errors. A completed PR with no verified deployment is INTEGRATED/NOT VERIFIED, not done. A green branch PR CI is never deployment evidence. Failed, missing or unreachable live checks are failure/unknown and must be investigated or turned into blocking issues rather than ignored. Record rollback target. Release work is prioritized to avoid accumulating finished-but-unmerged feature branches.

Verify-live runs one Chromium process on a GitHub-hosted worker after deployment, not on developer machines or the trusted self-hosted deploy runner. The verifier role analyzes its artifact, does not spawn additional browsers, uses one of the existing four child slots and never claims screenshot beauty or G1 acceptance from test counts. Follow docs/LIVE_VERIFICATION.md and retain sponsor visual approval for the actual #244-#247 isometric sandbox.
