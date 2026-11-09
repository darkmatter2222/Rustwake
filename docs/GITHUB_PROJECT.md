# GitHub Project and release operations

## Canonical links

- Project: https://github.com/users/darkmatter2222/projects/1
- Issues: https://github.com/darkmatter2222/Rustwake/issues
- Pull requests: https://github.com/darkmatter2222/Rustwake/pulls
- Current goal: https://github.com/darkmatter2222/Rustwake/issues/43
- Release scope: https://github.com/darkmatter2222/Rustwake/milestone/1
- Release acceptance: https://github.com/darkmatter2222/Rustwake/issues/69
- Actions: https://github.com/darkmatter2222/Rustwake/actions
- Releases: https://github.com/darkmatter2222/Rustwake/releases

## One system, different responsibilities

Issues hold requirements, role ownership, priority, eligibility, dependencies and decisions. Native parent/sub-issues group outcomes; native blocking relationships express execution order. The Project is the planning board and roadmap over those same issues/PRs, not a second set of tickets. Milestones collect a release's accepted scope. PRs hold changes and exact-SHA review. Actions and deployments provide execution evidence. GitHub Releases record a reviewed tagged version and its delivered outcome. Discussions may explore ideas, but actionable work must become an Issue before dispatch; Wiki or local Markdown never overrides live work status.

All open issues and PRs belong to Project 1, including deferred items. UI restart work belongs to milestone 1. New open repository issues/PRs are auto-added by the Project workflow. Auto-add sub-issues is enabled. Closing an issue or merging a PR updates Project status; moving a card to Done must NOT automatically close an issue. The coordinator verifies automation results rather than assuming eventual updates already happened.

Issue labels are authoritative for priority (`priority:P0`–`P3`), role (`role:*`), gate (`gate:G0`–`G4`) and dispatch eligibility (`status:*`). Project Priority mirrors labels; Project Status is a planning summary. Reconcile disagreement before dispatch. Backlog covers triage/blocked/deferred; Ready covers dependency-accepted ready work; In progress covers claimed implementation; In review covers current PR review; Done covers accepted completion. A Done implementation is not a deployed release. Keep blockers and deferrals visibly labeled even if both use Backlog. No fabricated dates or estimates: roadmap dates/iteration reflect a real product plan, not guesses to fill columns.

Use the prioritized backlog, status board, roadmap and In review views. The default current-release view should filter `label:ui-reset`; retain a separate all-work/deferred view. Display labels, milestone, parent/sub-issue progress and linked PRs. The same GitHub account serves every persona, so assignee identity cannot identify a worker. Use `Role`, Issue URL, branch, head SHA and actual runtime lease in comments.

## Coordinator intake and fail-closed behavior

Read Project 1, issue body/labels/comments, native blockers and linked PRs before selecting work. A queued task must reference an existing open canonical issue URL. Blocked, deferred, superseded and untriaged issues are not implementation-ready. Resolve dependencies and update labels before queueing; a local prompt cannot override them. The dispatcher rechecks live issue labels immediately before launch. A missing label set or GitHub access failure blocks launch. The ignored runtime queue carries issue URLs and execution scope only; it cannot create product priority or acceptance.

Use the host's authenticated `gh` for Projects where connector tools are insufficient. Verify with `gh project view 1 --owner darkmatter2222` and `gh project item-list 1 --owner darkmatter2222 --format json --limit 1000`; do not request, print, or store credentials in repository files. A token unable to access the private Project is an explicit access blocker, not authorization to create a local replacement board. Report exact denied operation and continue independent already-authorized work where safe. No silent permission changes.

## Delivery and release linkage

1. Product links the issue to its parent goal, blockers, Project and milestone, with acceptance and owner role.
2. Developer claims in an issue comment and creates `rw/<issue>-<slug>` worktree/branch. First publication creates/reuses a draft PR with `Closes #N`. Add the same milestone to the PR; verify Project auto-add.
3. QA independently reviews the actual head and records ACCEPT/REWORK with evidence. Product records outcome decision. Changed heads invalidate prior acceptance.
4. Release engineer checks these comments, actual diff, CI, scope and links; merges via PR only. No self-review presented as independent GitHub account approval.
5. Main Actions/CI and deployment receipts establish what is served. Keep the release-tracking issue open until validation is complete even if component issues close on merge.
6. Prepare a draft GitHub Release for the milestone. Only select/create a tag on an existing reviewed main commit when the version is known. Do not invent a release tag, publish unbuilt work, or mark a plan as shipped.
7. Release notes must link Project, milestone, parent goal, release issue, included PRs, exact tag/full SHA, CI and deployment runs, actual verification, limitations, save/migration impact and rollback version. Generated notes are a starting point; verify included scope.
8. After the accepted build is verified, publish the Release, link it back from the release issue and parent, then close the milestone if all scope is done or explicitly rescheduled. A milestone is scope; a tag is code identity; a Release is the publication record. GitHub does not automatically make these the same object.

Release note skeleton:

```markdown
## Outcome
<Player-visible change and known limits>
Project: https://github.com/users/darkmatter2222/projects/1
Milestone: <URL>
Goal / release issue: <URLs>
Tag / full SHA: <verified values>
Included PRs: <links>
CI / deployment / smoke evidence: <links>
Save impact / rollback: <verified details>
```

## Retired local planning

`work/backlog.json`, `work/BOARD.md`, `work/board.html`, docs/BACKLOG.md and historical sprint reports are archival only. Do not regenerate them as current work or dispatch their tickets. Legacy scheduler/checkpoint CLIs refuse to run. Their pure helpers remain only for historical tests; no current agent may invoke them for planning. The public team page links GitHub instead of publishing stale local ticket status. Optional evidence files remain allowed through normal PRs, linked from the canonical issue. Process any preexisting sponsor inbox request into an Issue once, preserving it until acknowledged; new sponsor work starts in GitHub.

## Runtime adoption

Merge policy changes through the normal reviewed PR path. Safely checkpoint local workers, pull the merged revision, reload/reinstall the team plugin as required by docs/START_TEAM.md, then restart with fresh sessions. Record loaded revision and a real dispatch receipt in #44. Repository changes alone do not stop existing sessions or prove adoption. Preserve all in-flight branches and uncommitted work.
