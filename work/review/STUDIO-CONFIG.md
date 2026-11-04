# Studio configuration validation

Scope: instructions and role configuration only. No runtime/game code changed.

Passed locally:

- Five role frontmatter files parse as YAML with the inspected HomeAILab `description`, `mode`, `permissions` structure.
- Six prioritized review tasks have unique matching IDs and explicit ready/unassigned state.
- Markdown code fences are balanced.
- New coordinator goal is below MasterGoal's 256,000-byte input ceiling.
- Existing detailed game specification is retained as `docs/GAME_DESIGN.md`; previous README detail is archived with adjusted relative links.

Not verified here:

- Installed OpenCode runtime loading, actual session/task async APIs, parallel execution and stop propagation. ORCH-001 remains open.
- New gameplay behavior, graphics, audio or animation; this commit defines the work and does not implement those improvements.
- Databrick connectivity, credentials, current stack/network/port ownership, DNS/HTTPS route or deployment. OPS-001 remains blocked on local environment access.
- Subjective audio listening and real-device frame/thermal behavior.

Do not turn this configuration validation into a claim that agents are active or the app is deployed.
