# Safe autonomous host/harness commissioning

The repository contains durable Qwen and OpenCode role files and roles.json. That is a source artifact only; it does NOT mean your local Qwen Code/OpenCode process has reloaded them, GitHub Projects permissions exist, or old workers stopped. Startup must produce an observable host receipt.

## Safe cutover
1. Identify currently running coordinator/children and exact worktrees/issue leases. Do not start a second forever loop or kill an unknown release mid-deploy.
2. Ask current coordinator to checkpoint all work in isolated branches/PRs and retire old V1 sessions; preserve dirty worktrees, active PRs and issued review comments.
3. Fast-forward a clean working copy to reviewed main SHA; never reset/stash peer edits just to force cutover. Verify GitHub auth and any native Project scope.
4. Read AGENTS.md, goal.md, QWEN.md and docs/agents/ROLES.md + roles.json. Start one primary coordinator; inspect installed custom-agent support and effective model/provider/permissions before registering specialist profiles.
5. Spawn at most four child model tasks only via proven runtime dispatch; role registry describes capabilities, not 20 concurrent sessions. No duplicate scheduled polling or browser swarm; release browser is GitHub-hosted one-per-SHA.
6. Post commissioning receipt to V2 runtime issue #263: host version, source SHA, model/provider if safely available, coordinator ID, actual launched child IDs/roles, active leases, GitHub/Project API access, permission limitations, event-wait/cancel behavior and next eligible issue.

## Qwen Code
Use .qwen/agents/rustwake-*.md only through installed supported agent invocation. Do not assume old OpenCode RPC/dispatcher works in Qwen. maxTurns is a turn ceiling, not reasoning-token quota. model: inherit retains provider/model. If native independent per-role efforts are unsupported, preserve developer depth and use short routine prompts; note limitation.

## OpenCode
Use .opencode/agents/rustwake-*.md and the host's supported session/delegation tools. The archived V1 team-supervisor may not exist in active V2 root; never silently install/run archived supervisor as a second runtime. Confirm actual supported plugin and one coordinator, reconciled leases and explicit issue-scoped worktrees before child creation.

## Any other harness
Translate docs/agents/roles.json into native roles with equivalent permissions, cap and issue handoff. Use AGENTS.md / docs/agents/TASK_PROTOCOL.md, not framework-specific private syntax, as normative behavior. Record a mapping table and host version, supported cancellation/wait and missing capabilities. No arbitrary credentials, broad system writes or direct main push.

## GitHub Project
New native Project has not been verified; #265 remains blocked until authenticated GitHub Projects write access is available. scripts/bootstrap-v2-project.sh is a proposed setup command after auth; it should be checked against installed gh version and actual repo membership, then record a real Project URL and blocker edges. Do not assume old Projects 1/2 are deleted.

## Runtime health
Report durable outcomes (PR, tests, merges, deployment) rather than token usage or CPU liveness. At two identical no-progress checks checkpoint+event-wait, do not generate planning noise. If a child is ambiguous/untracked, preserve its lease and stop replacements until reconciled.
