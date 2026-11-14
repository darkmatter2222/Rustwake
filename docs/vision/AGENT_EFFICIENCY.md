# Agent reasoning and token efficiency

Sponsor request: retain deep developer reasoning, reduce unnecessary thinking in coordination and routine roles. These are role/task budgets, not permission to skip evidence or lower correctness standards. Do not disclose private chain-of-thought; provide concise conclusions and observable evidence.

| Role | Default effort intent | Escalate when | Soft final handoff target |
|---|---|---|---|
| coordinator | low | ambiguous lease/cancellation/dependency conflict -> medium | <=250 words |
| developer | high | deterministic economy/concurrency/migration/pathfinding -> highest supported useful tier | <=500 words |
| reviewer | medium | resource loss, security, online transaction race -> high | <=500 words |
| product-owner | medium | balance experiment/design contradiction -> high | <=350 words |
| ui-ux | medium | complex accessibility/gesture interaction -> high | <=400 words |
| player | low | reproducible strategy comparison -> medium | <=300 words |
| release-engineer/publisher/deployer | low | failed CI, uncertain provenance, rollback -> high for diagnosis | <=250 words |

Word targets apply to routine handoffs, not code, required test evidence or important defects. Never suppress a material finding to hit a cap. No default max thinking for all roles. No model switching or paid-provider selection without existing configuration/authorization.

## Behavior changes applied in personas

Read AGENTS + current issue once; read only relevant subsystem sections. Start the first useful tool/action after a short plan; do not repeatedly restate scope. Batch independent reads, bound logs, use rg and targeted diff. Cache stable decisions with source SHA. Routine status updates report delta, next action and blocker only. Stop after acceptance evidence exists; do not run unchanged broad tests again without a reason. Two identical no-progress checks trigger quiet wait/blocker, not another analysis turn. Developers get uninterrupted depth where correctness requires it.

## Qwen Code compatibility

This repo currently contains an OpenCode-specific supervisor and .opencode personas. Qwen Code does not become compatible merely because the model is Qwen. `QWEN.md` and .qwen/agents provide portable counterpart instructions; the Qwen coordinator must pass the runtime-adapter issue before parallel dispatch. Keep the same existing model (`model: inherit`) and existing approval policy. Do not edit global credentials/providers, set yolo, or disable security for efficiency.

Official Qwen docs inspected 2026-11-13 describe custom .qwen/agents files, model inheritance and per-agent maxTurns. Session model.reasoningEffort exists, but support/mapping depends on model/provider and installed release. The public docs also describe workflow per-child reasoning control, while agent-frontmatter support varies. Therefore this package does not invent an `effort` frontmatter field or assert prompt intent changes backend thinking tokens. Native per-role low/medium/high values must be wired by the runtime adapter against its installed schema and verified in effective request/config telemetry. If unsupported, retain prompt-level profiles and report limitation; do not silently force global low effort on developers.

Sources: https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/ ; https://qwenlm.github.io/qwen-code-docs/en/users/configuration/settings/ ; https://qwenlm.github.io/qwen-code-docs/en/blog/updates/weekly-update-2026-09-17/ . These describe upstream, not proof of the user's installed version.

## Bounded native-agent calls

Qwen agent definitions use initial maxTurns: coordinator helper 12, developer 80, reviewer 40, product 24, UI/UX 32, player 20, release 20. A turn limit is NOT a thinking-token limit. At a limit, checkpoint branch/issue/evidence and return; coordinator may create a bounded continuation for unfinished authorized work. Never mark completion because budget expired. Primary long-lived coordinator remains interruptible and event-driven; do not cap the overall user-authorized goal merely to hide unfinished work.

## Verify efficiency

Run comparable small assignments under inherited baseline vs role policy. Record model/provider/version, actual effective effort, input/output/reasoning tokens when exposed, cache use, tool calls, elapsed time, task result and defects. One routine coordinator pass, one release verification and one complex developer change. Accept improvement only if less unnecessary work without missing outcomes. No fabricated savings percentage. Do not log credentials or private reasoning. Runtime adapter posts receipt to the cutover issue before claiming deployment.
