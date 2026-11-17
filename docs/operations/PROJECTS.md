# Native GitHub V2 Project bootstrap and issue truth

Current GitHub connector provides repository/issue/PR/actions APIs but **not** Projects V2 create/delete or field mutation. A collection of linked issues and epics is not automatically a native Project board. Do not report it created unless verified with a project number and URL.

## Current authority
Master #253, epics #254–259, issues #260–305 plus later V2 defects. Old V1 issues were closed/superseded; their PR and GitHub history are retained. GitHub Projects 1/2 are old historical boards until explicitly verified deleted. No destructive deletion during unverified runtime cutover.

## Project creation when an approved host has GitHub CLI permissions
Use scripts/bootstrap-v2-project.sh with authenticated owner permissions including project scope. Before running: gh auth status; gh project list --owner darkmatter2222; check current V2 board name/number for idempotency. Run bootstrap; verify printed new URL, membership of #253–305 and fields/permissions. Configure views by priority, phase, owner role, status, blockers and release evidence. Record project number and status in master #253 and #265. Cross-check dependencies; issue body alone may not create native blocker edges. Do not mark #265 done until native board and relationships are demonstrably real.

## Deletion safety
The sponsor previously asked to delete old Projects 1/2. This is irreversible organizational metadata destruction. Confirm replacement board and all dependencies/notes preserved, export any irreplaceable old board details, then invoke explicit authorized deletion in the UI or owner-scoped CLI and record receipts. Normal GitHub API does not delete merged PRs; retain PR history, close superseded work. Never claim a bulk delete succeeded without API evidence.

## Autonomous issue discipline
Every new implementation issue contains outcome, acceptance, dependencies (including native edges), owned paths, review evidence and done definition. Blocked tasks cannot be dispatched by a status:ready label alone if prerequisite merges are missing. Subagents shall not self-schedule. Release engineer and verification status are distinct from developer's finished code.
