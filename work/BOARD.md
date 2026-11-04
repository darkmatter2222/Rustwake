# Rustwake studio board

This is the initial published queue, not proof that agents are running. The coordinator owns live assignment state; publisher materializes updates here. All initial tasks are unassigned. Preserve the existing mechanics backlog in `docs/BACKLOG.md`; presentation quality is the immediate critical path.

| ID | Priority | State | Owner | Outcome | Dependencies |
|---|---|---|---|---|---|
| ORCH-001 | P0 | accepted-published | coordinator | Verify agent loading and asynchronous dispatch/poll/cancel canary on local OpenCode — receipt `work/review/CAPABILITY.md` | local runtime |
| Q-001 | P0 | implemented, quality-review pending | developer (ses_e5c04ffbeffed38Ir78EbqIVPT, worktree q001-dev, base a8fb14a) | Full-width research node cards and readable mobile navigation — candidate `24429e1`, integrated `1f0f722`; evidence `q001-evidence/` | none |
| Q-002 | P1 | spec in progress (rev-q2spec-g3) | reviewer | Approved style slice: composed world and distinct machine sprites | none |
| Q-003 | P1 | ready | unassigned | Clamp high-level indicators to bounds | none |
| Q-004 | P1 | ready | unassigned | Interpolated drone/machine motion and salvage feedback | coordinate with Q-002 |
| Q-005 | P1 | spec ready | unassigned | Real master mix, layered cues and ambience: structural half `S-00..S-22` in `work/review/REV-AUD1.md`; listening half blocked B-11 | none |
| Q-006 | P1 | ready | unassigned | Stable game destinations and visual blueprint picker | coordinate with Q-001 |
| Q-007 | P2 | ready | unassigned | Distinct `powerLimited` world accent token | none |
| Q-008 | P2 | ready | unassigned | Keyboard selection for world targets | none |
| Q-009 | P2 | ready | unassigned | `Store 118/900` chip separator | none |
| REV-BASE | P1 | accepted | reviewer (ses_e5c04ffbdffedFAAymfdVAdGbI) | Independent baseline rubric review of a8fb14a; verdict `rework` — receipt `work/review/REV-BASE.md` | none |
| REV-AUD1 | P1 | accepted | reviewer (ses_e5bd1dd86ffeLYB8p74g5E9Pv1) | Audio review of 3f1b4ac: defects `A-1..A-16`, acceptance spec `S-00..S-22`; verdict `rework` (structural), listening blocked B-11 — receipt `work/review/REV-AUD1.md` | none |
| OPS-001 | P1 | discovery-complete/ready | deployer (ses_e5bff86deffegs755kGIkp3IAs) | Discovery receipt `work/deployments/OPS-001-g1.md`; adoption pending `VITE-BASE` | VITE-BASE; local HomeAILab/live server |
| VITE-BASE | P1 | in progress | developer (ses_e5c04ffbeffed38Ir78EbqIVPT, branch vite-base) | Set Vite `base: './'` so path-route assets resolve | none |
| ENG-001 | P1 | ready | unassigned | Fast focused capture fixtures alongside full organic capture suite | none |
| ENG-002 | P2 | ready | unassigned | Re-verify polled session status and explicit cancel propagation when team MCP is healthy | none |

## Handoff discipline

A ready task becomes assigned only with session/worktree/base SHA/lease. Candidate completion is review-ready, not accepted. Reviewer acceptance cites an immutable candidate. Publisher records integration and remote verification. Deployer records independent live verification. No all-worker barrier.

Use `work/review/inbox/` for tracked task specifications, `work/development/handoffs/` for sanitized implementation receipts, `work/releases/` for publishing receipts, and `work/deployments/` for sanitized deployment receipts. Local transient traffic belongs in the ignored spool described in AGENT_WORKFLOW.md. No secrets or raw credential dumps.
