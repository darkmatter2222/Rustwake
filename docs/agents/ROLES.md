# Rustwake V2 autonomous studio roles

Roles are capabilities, not permanent agents. One primary coordinator plus at most four children (five model sessions total). All roles inherit AGENTS.md and docs/DOCUMENTATION.md and the GitHub issue. The same GitHub account may be used, but separate role-stamped immutable-SHA QA and product verdicts are mandatory. No code author self-accepts. One release engineer lease; one browser process per deployed SHA in GitHub Actions, never an extra browser per agent.

| Role | Effort intent | Mission |
|---|---|---|
| coordinator | low | Single accountable primary, issue DAG, agent leases and dispatch; never implement/merge. |
| product-owner | medium | Own strategic game requirements, currency sources/sinks and player outcomes. |
| project-manager | low | Milestones, blockers, risk register and delivery sequencing. |
| technical-architect | high | Module boundaries, ADRs, security and save/migration architecture. |
| ui-ux | medium | World-first desktop/mobile UX, discoverability, focus and touch behavior. |
| art-director | medium | Approval reference, visual proportions, material/lighting and motion fidelity. |
| developer | high | Scoped isolated code, tests, evidentiary PR and reproducible handoff. |
| gameplay-engineer | high | Simulation, deterministic economy, construction and idle mechanics. |
| fleet-engineer | high | Road topology, loading sockets, pathfinding and conserved cargo. |
| economy-analyst | medium | 17 currency source/sink ledger, pacing and non-exploit progression. |
| backend-engineer | high | Authoritative multiplayer identity, trade, raid and idempotency. |
| qa-reviewer | medium | Independent PR head reproduction, negative tests and explicit verdict. |
| accessibility-tester | medium | Keyboard, 200% text, 44px touch, reduced motion and real-device checks. |
| player-tester | low | Fresh player, optimizer and returning player scenario walkthroughs. |
| security-reviewer | high | Server trust, injection, privileges, escrow replay and anti-collusion. |
| performance-analyst | medium | Cold load, FPS, P95, GPU memory and device-specific performance. |
| telemetry-bi | medium | Meaningful event taxonomy, consent-aware metrics and data quality. |
| documentation-steward | low | Maintain source-linked contracts, diagrams, ADRs, runbooks and gap ledger. |
| release-engineer | low | Merge accepted PR to main; watch CI/CD and exact SHA deployment. |
| live-verifier | low | One preexisting browser artifact, live source verification and runtime defects. |

## Authority
The executive sponsor owns aesthetic and first-playable visual acceptance. Coordinator plans but does not merge. Developer authors PR but does not self-approve. QA independently reproduces the exact PR head and marks APPROVE/REWORK with real tests. Product judges player intent and strategic choice. Release engineer merges current accepted SHA, verifies main CI, trusted CD and served source hashes. Live verifier checks actual site/artifact. Documentation steward keeps architectural/design/economy/operational documents accurate in the same PR as relevant changes. Security reviewer may block online releases for authority/escrow defects.

## Runtime and permissions
Only the coordinator dispatches; worktrees and active session IDs must be reconciled before replacement. Role definitions can be implemented with verified installed OpenCode/Qwen profiles or a bounded coordinator assignment; files do not remotely provision new agents. Keep narrow scoped write paths and explicit role/effort/task timeout; low coordinator/release effort and high developer/modeling effort are guidance, not invented provider reasoning controls. No recursive spawn, second forever goal, credential changes, direct main push or unreviewed main merge.

The cap in `roles.json` is machine-checkable, not merely prose. `scripts/verify-session-ledger.mjs` validates a wave's session ledger against these limits and rejects a duplicate coordinator, a recursive spawn, an over-cap concurrency, a second browser holder, a second release engineer, two writers on one `src` lease, and a finished child with no finish record. The cap is **concurrency, not lifetime total**. See `docs/ops/SESSION_LEDGER.md` for the schema, the violation codes and the host's known observability limits; a coordinator attestation without a validated ledger is a claim, not evidence.

## Required output for every role
GitHub issue and PR URL; source SHA; exact changed paths; expected and observed behavior; test command/result and real screenshot/clip if visual; issue dependencies, limitations and next accountable owner. An automated numeric screenshot-color test cannot certify the visual style of the README art. Real-device evidence remains distinct from phone viewport emulation.


## Additional production and non-production responsibilities
- **cicd-engineer** (medium): Maintain GitHub-hosted builds, tests, artifact provenance and trusted runner boundaries without deploying unreviewed code.
- **production-release-manager** (low): Coordinate approved releases, go/no-go and incidents; release engineer remains sole merge integrator.
- **staging-verifier** (medium): Independently validate PR preview built source, desktop/phone screenshots, functional regressions and environment parity.
- **site-reliability-engineer** (medium): Observe live health, deployment provenance, rollback readiness and incidents without privileged improvisation.

Staging verification works against immutable PR preview SHA and is not permission to visit live production. Production live verification works against deployed main SHA and an existing serialized browser artifact. The release engineer alone executes reviewed main merges; the production release manager coordinates go/no-go, risk and rollback communication rather than introducing a competing merge lease. Site reliability preserves host protections and audits deployment receipts. Every additional role consumes one of the same four child slots when active.
