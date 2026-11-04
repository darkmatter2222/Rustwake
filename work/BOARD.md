# Rustwake studio board

This is the initial published queue, not proof that agents are running. The coordinator owns live assignment state; publisher materializes updates here. All initial tasks are unassigned. Preserve the existing mechanics backlog in `docs/BACKLOG.md`; presentation quality is the immediate critical path.

| ID | Priority | State | Owner | Outcome | Dependencies |
|---|---|---|---|---|---|
| ORCH-001 | P0 | accepted-published | coordinator | Verify agent loading and asynchronous dispatch/poll/cancel canary on local OpenCode — receipt `work/review/CAPABILITY.md` | local runtime |
| Q-001 | P0 | accepted | reviewer (g4 + g5) + developer (ses_e5c04ffbeffed38Ir78EbqIVPT, branch q001-rework) | Both passes accept — `24429e1` (`work/review/REV-Q001.md`) and rework `8cfc172` integrated as `8eb720c` (`work/review/REV-Q001R.md`); evidence `q001-evidence/` | none |
| Q-002 | P1 | implementation started (style-slice) | developer | Approved style slice: composed world and distinct machine sprites; scored against gates 3A-3E with captures E1-E8 | `work/review/REV-Q2SPEC.md` |
| Q-003 | P1 | ready | unassigned | Clamp high-level indicators to bounds | none |
| Q-004 | P1 | ready | unassigned | Interpolated drone/machine motion and salvage feedback | coordinate with Q-002 |
| Q-005 | P1 | implemented (structural half), quality-review pending | developer (ses_e5c04ffbeffed38Ir78EbqIVPT, worktree q001-dev, branch q005-audio, base a8fb14a) | Audio mix-graph restructure `S-01..S-22` — candidate `ade4b60`, integrated `6ff436f`; handoff `work/evidence/q005-handoff.md`; listening half blocked B-11 | none |
| Q-006 | P1 | ready | unassigned | Stable game destinations and visual blueprint picker | coordinate with Q-001 |
| Q-007 | P2 | ready | unassigned | Distinct `powerLimited` world accent token | none |
| Q-008 | P2 | ready | unassigned | Keyboard selection for world targets | none |
| Q-009 | P2 | ready | unassigned | `Store 118/900` chip separator | none |
| R-15 | P2 | ready | unassigned | Portrait `.resources` column-gap is 1 px with no measured benefit | `work/review/REV-Q001R.md` |
| R-16 | P1 | ready | unassigned | Landscape at text scale 2 is still a header-only strip | `work/review/REV-Q001R.md` |
| R-17 | P2 | ready | unassigned | One card per screenful at scale 2 (contained list travel) | `work/review/REV-Q001R.md` |
| R-18 | P3 | ready | unassigned | Handoff numbers need the harness line reference with each | `work/review/REV-Q001R.md` |
| R-19 | P3 | ready | unassigned | Capture harness cannot fail a build (half-fixed: exit codes) | `work/review/REV-Q001R.md` |
| REV-BASE | P1 | accepted | reviewer (ses_e5c04ffbdffedFAAymfdVAdGbI) | Independent baseline rubric review of a8fb14a; verdict `rework` — receipt `work/review/REV-BASE.md` | none |
| REV-AUD1 | P1 | accepted | reviewer (ses_e5bd1dd86ffeLYB8p74g5E9Pv1) | Audio review of 3f1b4ac: defects `A-1..A-16`, acceptance spec `S-00..S-22`; verdict `rework` (structural), listening blocked B-11 — receipt `work/review/REV-AUD1.md` | none |
| OPS-001 | P1 | discovery-complete/ready | deployer (ses_e5bff86deffegs755kGIkp3IAs) | Discovery receipt `work/deployments/OPS-001-g1.md`; adoption round pending, `VITE-BASE` integrated | local HomeAILab/live server |
| OPS-002 | P0 | superseded by OPS-003 | deployer (ses_e5bff86deffegs755kGIkp3IAs) | First adoption: release `rustwake-14b6ea1` at `https://home.darkmatter2222.com/rustwake/` — receipt `work/deployments/OPS-002-g1.json` | local HomeAILab/live server |
| OPS-003 | P0 | deployed + verified (external) | deployer (ses_e5bff86deffegs755kGIkp3IAs) | Release `rustwake-c241ab7` live (source `c241ab7`, code `6ff436f`): container `9bd718e7eae0` healthy, 4/4 served files sha256 == local build, HTTPS 200 without `-k`, 44/47 external check-host.net nodes 200 — receipt `work/deployments/OPS-003-g2.json` | local HomeAILab/live server |
| VITE-BASE | P1 | integrated | developer (ses_e5c04ffbeffed38Ir78EbqIVPT, branch vite-base) | Set Vite `base: './'` so path-route assets resolve — candidate `bbf58e4`, integrated `4319104` | none |
| ENG-001 | P1 | ready | unassigned | Fast focused capture fixtures alongside full organic capture suite | none |
| ENG-002 | P2 | ready | unassigned | Re-verify polled session status and explicit cancel propagation when team MCP is healthy | none |

## Handoff discipline

A ready task becomes assigned only with session/worktree/base SHA/lease. Candidate completion is review-ready, not accepted. Reviewer acceptance cites an immutable candidate. Publisher records integration and remote verification. Deployer records independent live verification. No all-worker barrier.

Use `work/review/inbox/` for tracked task specifications, `work/development/handoffs/` for sanitized implementation receipts, `work/releases/` for publishing receipts, and `work/deployments/` for sanitized deployment receipts. Local transient traffic belongs in the ignored spool described in AGENT_WORKFLOW.md. No secrets or raw credential dumps.
