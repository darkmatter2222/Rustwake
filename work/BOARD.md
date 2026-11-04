# Rustwake studio board

This is the initial published queue, not proof that agents are running. The coordinator owns live assignment state; publisher materializes updates here. All initial tasks are unassigned. Preserve the existing mechanics backlog in `docs/BACKLOG.md`; presentation quality is the immediate critical path.

| ID | Priority | State | Owner | Outcome | Dependencies |
|---|---|---|---|---|---|
| ORCH-001 | P0 | accepted-published | coordinator | Verify agent loading and asynchronous dispatch/poll/cancel canary on local OpenCode — receipt `work/review/CAPABILITY.md` | local runtime |
| Q-001 | P0 | implementing | developer (ses_e5c04ffbeffed38Ir78EbqIVPT, worktree q001-dev, base a8fb14a) | Repair research cards and readable mobile navigation | none |
| Q-002 | P1 | ready | unassigned | Approved style slice: composed world and distinct machine sprites | none |
| Q-003 | P1 | ready | unassigned | Clamp high-level indicators to bounds | none |
| Q-004 | P1 | ready | unassigned | Interpolated drone/machine motion and salvage feedback | coordinate with Q-002 |
| Q-005 | P1 | ready | unassigned | Real master mix, layered varied cues and ambience | none |
| Q-006 | P1 | ready | unassigned | Stable game destinations and visual blueprint picker | coordinate with Q-001 |
| REV-BASE | P1 | accepted | reviewer (ses_e5c04ffbdffedFAAymfdVAdGbI) | Independent baseline rubric review of a8fb14a; verdict `rework` — receipt `work/review/REV-BASE.md` | none |
| OPS-001 | P1 | discovery-complete/ready | deployer (ses_e5bff86deffegs755kGIkp3IAs) | Discovery receipt `work/deployments/OPS-001-g1.md`; adoption pending `VITE-BASE` | VITE-BASE; local HomeAILab/live server |
| VITE-BASE | P1 | ready | unassigned | Set Vite `base: './'` so path-route assets resolve | none |
| ENG-001 | P1 | ready | unassigned | Fast focused capture fixtures alongside full organic capture suite | none |
| ENG-002 | P2 | ready | unassigned | Re-verify polled session status and explicit cancel propagation when team MCP is healthy | none |

## Handoff discipline

A ready task becomes assigned only with session/worktree/base SHA/lease. Candidate completion is review-ready, not accepted. Reviewer acceptance cites an immutable candidate. Publisher records integration and remote verification. Deployer records independent live verification. No all-worker barrier.

Use `work/review/inbox/` for tracked task specifications, `work/development/handoffs/` for sanitized implementation receipts, `work/releases/` for publishing receipts, and `work/deployments/` for sanitized deployment receipts. Local transient traffic belongs in the ignored spool described in AGENT_WORKFLOW.md. No secrets or raw credential dumps.
