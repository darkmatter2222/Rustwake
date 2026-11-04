# Rustwake studio board

This is the initial published queue, not proof that agents are running. The coordinator owns live assignment state; publisher materializes updates here. All initial tasks are unassigned. Preserve the existing mechanics backlog in `docs/BACKLOG.md`; presentation quality is the immediate critical path.

| ID | Priority | State | Owner | Outcome | Dependencies |
|---|---|---|---|---|---|
| ORCH-001 | P0 | accepted-published | coordinator | Verify agent loading and asynchronous dispatch/poll/cancel canary on local OpenCode — receipt `work/review/CAPABILITY.md` | local runtime |
| Q-001 | P0 | accepted | reviewer (g4 + g5) + developer (ses_e5c04ffbeffed38Ir78EbqIVPT, branch q001-rework) | Both passes accept — `24429e1` (`work/review/REV-Q001.md`) and rework `8cfc172` integrated as `8eb720c` (`work/review/REV-Q001R.md`); evidence `q001-evidence/` | none |
| Q-002 | P1 | implemented-awaiting-independent-review (quality-review pending) | developer (branch `style-slice`, base `ade4b60`) | Style slice integrated: phase A `10bde02` (sprite part table, layered scene painters, palette mirror) + phase C `7861926` (deterministic draw-bound tests A1-A4, B2-B7, D1-D9, E6) + evidence `aaa3a4e`, so the review candidate is this published head; publisher-measured at this head: 23 files / **206 tests** passed (the 13 new cases are `tests/renderer/scene-draw.test.ts` on top of the 193), typecheck/build/validate clean, built JS 232754 B (+2727 B over the parent build's 230027 B), CSS 7224 B (+75 B), worker unchanged at 13015 B. The developer handoff states 221 tests and JS 231892 B (+1865 B); those were measured at its own base `ade4b60`, which predates `4319104` (VITE-BASE) and `8eb720c` (Q-001r), hence the offset — the head numbers above are the ones to check against; captures `docs/screenshots/slice-*.png`, pixel receipt `docs/evidence/2026-11-03-style-slice-pixels.json`; note: the `REV-Q2SPEC` E3 ceiling 229000 B is stale (measured pre-audio at 224968 B, the audio build already reads 230027 B); proposed restatement **232800 B** — the 232000 B draft is already below this head's measured 232754 B — pending reviewer concurrence, so E3 is currently unevaluated rather than failed | `work/review/REV-Q2SPEC.md` |
| Q-003 | P1 | ready | unassigned | Clamp high-level indicators to bounds | none |
| Q-004 | P1 | ready | unassigned | Interpolated drone/machine motion and salvage feedback | coordinate with Q-002 |
| Q-005 | P1 | structural half **accepted**, listening half pending (B-11) | reviewer (ses_e5bb7ff1affeQ6bSyyzfPex6xj) + developer (ses_e5c04ffbeffed38Ir78EbqIVPT, branch q005-audio, base a8fb14a) | Audio mix-graph restructure `S-00..S-22` — candidate `ade4b60`, integrated `6ff436f`, accepted at `6ff436f`/head `72736ba` per `work/review/rev-q005-g1.md` (15 of 16 REV-AUD1 defects closed, A-11 improved, A-9 partial); listening half pending B-11; follow-ups filed as ordered rows A-25/A-31/A-24 then A-26/A-29/A-17/A-18 | none |
| Q-006 | P1 | ready | unassigned | Stable game destinations and visual blueprint picker | coordinate with Q-001 |
| Q-007 | P2 | ready | unassigned | Distinct `powerLimited` world accent token | none |
| Q-008 | P2 | ready | unassigned | Keyboard selection for world targets | none |
| Q-009 | P2 | ready | unassigned | `Store 118/900` chip separator | none |
| R-15 | P2 | ready | unassigned | Portrait `.resources` column-gap is 1 px with no measured benefit | `work/review/REV-Q001R.md` |
| R-16 | P1 | ready | unassigned | Landscape at text scale 2 is still a header-only strip | `work/review/REV-Q001R.md` |
| R-17 | P2 | ready | unassigned | One card per screenful at scale 2 (contained list travel) | `work/review/REV-Q001R.md` |
| R-18 | P3 | ready | unassigned | Handoff numbers need the harness line reference with each | `work/review/REV-Q001R.md` |
| R-19 | P3 | ready | unassigned | Capture harness cannot fail a build (half-fixed: exit codes) | `work/review/REV-Q001R.md` |
| A-25 | P2 | ready | unassigned | Unmute must restart both beds: `setMuted(false)` also calls `startBeds` (one guarded line) | `work/review/rev-q005-g1.md` |
| A-31 | P2 | ready | unassigned | Aperiodic deterministic bed fill (coprime periods) + loop-seam assertion, length a multiple of the period | `work/review/rev-q005-g1.md` |
| A-24 | P2 | ready | unassigned | `dispose()` resets `bedsStarted` so a remount does not lose room tone and music bed | `work/review/rev-q005-g1.md` |
| A-26 | P3 | ready | unassigned | Add the two missing jsdom cases for S-17/S-18 (mute after toggle, mute after save import) | `work/review/rev-q005-g1.md` |
| A-29 | P3 | ready | unassigned | Assert exact `distanceGain` values in the S-16 case instead of a variant-contaminated ratio | `work/review/rev-q005-g1.md` |
| A-17 | P3 | ready | unassigned | Derive snapshot `inputIds`/`outputId` from observed `connect()` calls so mis-wiring turns the test red | `work/review/rev-q005-g1.md` |
| A-18 | P3 | ready | unassigned | Read snapshot levels back from the gain nodes instead of the mute flag | `work/review/rev-q005-g1.md` |
| REV-BASE | P1 | accepted | reviewer (ses_e5c04ffbdffedFAAymfdVAdGbI) | Independent baseline rubric review of a8fb14a; verdict `rework` — receipt `work/review/REV-BASE.md` | none |
| REV-AUD1 | P1 | accepted | reviewer (ses_e5bd1dd86ffeLYB8p74g5E9Pv1) | Audio review of 3f1b4ac: defects `A-1..A-16`, acceptance spec `S-00..S-22`; verdict `rework` (structural), listening blocked B-11 — receipt `work/review/REV-AUD1.md` | none |
| OPS-001 | P1 | discovery-complete/ready | deployer (ses_e5bff86deffegs755kGIkp3IAs) | Discovery receipt `work/deployments/OPS-001-g1.md`; adoption round pending, `VITE-BASE` integrated | local HomeAILab/live server |
| OPS-002 | P0 | superseded by OPS-003 | deployer (ses_e5bff86deffegs755kGIkp3IAs) | First adoption: release `rustwake-14b6ea1` at `https://home.darkmatter2222.com/rustwake/` — receipt `work/deployments/OPS-002-g1.json` | local HomeAILab/live server |
| OPS-003 | P0 | superseded by OPS-004 | deployer (ses_e5bff86deffegs755kGIkp3IAs) | Release `rustwake-c241ab7` was live (source `c241ab7`, code `6ff436f`) — receipt `work/deployments/OPS-003-g2.json` | local HomeAILab/live server |
| OPS-004 | P0 | deployed + verified (external) | deployer (ses_e5bff86deffegs755kGIkp3IAs) | Release `rustwake-7f82bec` live at `https://home.darkmatter2222.com/rustwake/` (source `7f82bec`, code `8eb720c` — Q-001r build): container `cc90cf77c6c8` healthy, 4/4 served files sha256 == local build, HTTPS 200 without `-k`, 45/48 check-host.net nodes 200 — receipt `work/deployments/OPS-004-g3.json` | local HomeAILab/live server |
| VITE-BASE | P1 | integrated | developer (ses_e5c04ffbeffed38Ir78EbqIVPT, branch vite-base) | Set Vite `base: './'` so path-route assets resolve — candidate `bbf58e4`, integrated `4319104` | none |
| ENG-001 | P1 | ready | unassigned | Fast focused capture fixtures alongside full organic capture suite | none |
| ENG-002 | P2 | ready | unassigned | Re-verify polled session status and explicit cancel propagation when team MCP is healthy | none |

## Handoff discipline

A ready task becomes assigned only with session/worktree/base SHA/lease. Candidate completion is review-ready, not accepted. Reviewer acceptance cites an immutable candidate. Publisher records integration and remote verification. Deployer records independent live verification. No all-worker barrier.

Use `work/review/inbox/` for tracked task specifications, `work/development/handoffs/` for sanitized implementation receipts, `work/releases/` for publishing receipts, and `work/deployments/` for sanitized deployment receipts. Local transient traffic belongs in the ignored spool described in AGENT_WORKFLOW.md. No secrets or raw credential dumps.
