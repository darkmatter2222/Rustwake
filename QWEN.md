# Rustwake in Qwen Code

Read AGENTS.md, goal.md and the assigned issue. Active mandate #121, first commissioning task #128, Project 2. Native agent roles are in `.qwen/agents`. Keep configured model inherited. Developer effort intent high; coordinator/player/release low; reviewer/product/UI medium. Escalation rules and verification are in docs/vision/AGENT_EFFICIENCY.md.

The existing supervisor uses OpenCode-specific RPC. Do not launch it in Qwen Code and assume compatibility. Before any parallel dispatch, #128 must prove a Qwen-compatible adapter with exclusive checkout/leases/cancellation/wait and five-session cap. Until then the primary may commission the adapter serially; no duplicate workers. Existing .opencode profiles remain compatibility definitions, not a second team.

Do not invent reasoning-effort frontmatter. Inspect installed Qwen version and model/provider controls; verify effective per-role reasoning settings. If only a global setting is supported, preserve developer depth and use prompt-level bounded routine passes rather than globally forcing low reasoning. maxTurns caps tool/assistant turns, not thinking tokens. No yolo, credentials or approval-policy changes for efficiency.

Always use feature branches/PRs after the one-time sponsor planning publication. Do not run stale #43/Project 1 delivery priorities. At task boundaries read GitHub deltas, not the entire repository. Checkpoint unresolved work and wait for meaningful events.


## Live release verification (issue #248)
After an approved feature PR is merged by the release engineer, main CI must pass, delivery must succeed and the same delivery workflow's verify-live job must report observed served SHA/asset integrity and browser evidence. The release engineer owns this chain and links specific runs/receipt; no agent pushes to main directly. The verifier role is defined at .qwen/agents/rustwake-live-verifier.md and is rotated through an existing child slot, not a sixth session. A running Qwen host may require agent-definition refresh before it can invoke this role. Do not launch additional local browsers: the workflow's GitHub-hosted single-browser job collects evidence. Smoke PASS is not G1 visual acceptance. Sponsor corrective mandate #244-#247 remains blocking.
