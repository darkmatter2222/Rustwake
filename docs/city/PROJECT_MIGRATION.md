# GitHub Projects — V2 Living Industrial City cutover

## Actual status (do not fictionalize)
The connected GitHub issue/PR API allowed creation of Rustwake execution master #310, 15 track umbrellas and 192 granular work issues (#325–525, excluding the nine track parents #393–401). GitHub Projects create/close and native blocker/sub-issue mutations are **not exposed** in this assistant connection; therefore no new Project URL/ID has been verified and old Projects 1 and 2 have **not** been closed from this chat.

A safe idempotent migration utility is staged at scripts/bootstrap-v2-city-project.mjs. It needs a supported authenticated GitHub CLI on the sponsor-controlled developer/agent host with the project scope and repository Issues write permission. The local assistant container lacks the gh executable/credential; never copy or print a GitHub token into a chat.

## One-time operator command after this PR is independently reviewed and merged
Run from the actual repo checkout at the reviewed SHA:

    gh auth status
    gh auth refresh -s project
    node scripts/check-city-manifest.mjs
    node scripts/bootstrap-v2-city-project.mjs
    node scripts/bootstrap-v2-city-project.mjs --apply --native-links --close-legacy

The default script invocation only prints the plan. The mutation command creates (or reuses) the titled native board "Rustwake V2 — Living Industrial City", links the Rustwake repo, creates Phase, Workstream, Execution and Release SHA fields, imports all open v2 GitHub issues, and assigns fields for new granular work. It then creates native sub-issues beneath the 15 workstream trackers and blocked-by relationships from the acyclic manifest. Existing links are read before adding so a stopped/interrupted run can be rerun. Finally it verifies all open V2 issues and each of the 192 concrete tasks exist on the new board before closing old Projects 1 and 2. Existing Projects are closed (reversible), not permanently deleted.

If the old boards are unrelated to Rustwake, the utility **refuses closure**. If a permission/rate/API error occurs, it stops with a reported blocker and retains the old boards. It must print a VERIFIED_PROJECT_RECEIPT with real number, URL, count, new native edges and old closed statuses. Post the exact receipt to #265 and #310; only then mark new Project activation as done.

Official documentation: gh project close is reversible and requires project scope; GitHub issue dependencies and sub-issues use REST Issues write APIs. The utility is a proposed tool until run successfully on the authorized host.

## Issue architecture
- Product vision authority: #253.
- Execution program root: #310.
- Earlier phase scope/acceptance: #254–259 and #262–305. Do not dispatch these as giant issues.
- New execution workstreams: #311–324 and #393–401. These are organization/acceptance umbrellas, not developer tasks.
- Concrete implementation tasks: #325–392 and #402–525, exactly 192 in the current manifest. Each has a bounded outcome and failure case. Issue #266 (re-review/re-merge V2 foundation) was retired as obsolete because PR #306 already shipped.
- In-flight PR #307 is camera/art controls, with a previously failed browser Zoom In smoke; #309 is studio documentation. Do not overwrite their branches or claim they are merged merely because CI ran.

## Dispatch priorities
Only schedule a concrete issue if actual hard_blocker issues are completed and accepted at merged/deployed SHA, external host/permission holds are resolved, and path leases do not collide. See docs/city/execution-manifest.json for a checked DAG with no missing/cyclic task references. Use GitHub native blocker edges when migration completes. If a task body lists old broad capability #267/#271/#283, treat it as a scope reference; the canonical hard blockers for the new task are the manifest's hard_blockers (and later approved native edges), not a requirement to close an umbrella before starting its own children.

The project should support views by Phase (P0–P5), Workstream, Execution state, Role and Release SHA, plus a "Current Sprint" view limited to at most four child agents. The coordinator is accountable; developer/QA/product/release are rotating roles. The whole team remains one coordinator plus a maximum of four concurrent specialist model sessions.

## Required verification
GitHub API item count, actual native subissue relationships, actual blocked_by relations with no cycles, project title and owner, project field names, zero orphan tasks, old board closed statuses and source GitHub credentials/permission caveats. Do not report success from the script's presence or from issue comments alone.
