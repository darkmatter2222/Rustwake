# Capability receipt: ORCH-001 runtime concurrency canary

- Result: **supported** (asynchronous dispatch plus independent, out-of-order result arrival)
- Runtime: OpenCode v2.2.5
- Base: `main` at `a8fb14a`
- When: 2026-11-03, canary pass 1
- Scope: this machine's local OpenCode install with the five Rustwake role definitions

## Verified

1. **Agent loading.** All five `.opencode/agents/*.md` roles registered as selectable subagent types; the coordinator was the selected primary.
2. **Async dispatch.** `canary-a-1` and `canary-b-1` were dispatched in one background batch; both calls returned immediately with distinct session ids.
3. **Overlap, no barrier.** `canary-b-1` ran 19:32:28-19:32:36 while `canary-a-1` ran 19:32:31-19:32:46 (overlapping). The `canary-b-1` result was processed before `canary-a-1` finished, with no all-worker barrier.
4. **Isolation.** Both children were read-only and the repository stayed clean after they completed.
5. **No fallback required.** A serial fallback was not needed.

## Caveats and open items

- Team MCP status polling returned "no healthy opencode service found"; results still arrived through completion notifications.
- Cancel propagation was not exercised in pass 1.
- Proposed follow-up (ENG-002): re-verify polled session status and explicit cancel/pause propagation once the team MCP service is healthy.

The reviewer image-capability check is a separate assignment under `REV-BASE`; it is not covered by this receipt.
