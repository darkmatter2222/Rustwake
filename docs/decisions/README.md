# Rustwake product and architecture decision record protocol

Decision records protect the game from losing its original intent across autonomous agents and tool harnesses. Each ADR is immutable once accepted; supersede with a new dated ADR rather than silently rewriting history.

## Template
Filename YYYY-MM-DD-NNN-descriptive-title.md. Include title/status (Proposed, Sponsor accepted, Superseded); sponsor/role/time; problem and player consequence; options and tradeoffs; choice and explicitly rejected paths; source/issue/PR/head SHA; scope/asset/UX/camera/economy/runtime implications; test/performance evidence; save compatibility/security/rollback; documentation and issue follow-up. Contradictions between ADR and sponsor art mandate must be resolved by sponsor, never guessed by a developer.

## Current non-negotiable decisions
- The approved screenshot at public/reference/approved-yard.png is the game-world visual grammar: small primitive 3D factory yard, roads/trucks, warm rusty steel and teal operating accents. It is not a fake playable background.
- Default isometric yaw 45°, elevation 35.264°, real orbit/pan/tilt/zoom, world anchoring under cursor, full-screen world-first mobile/desktop UI; no old V1 grid/pipes look.
- World simulation resources and actual cargo must reconcile; no fake visual delivery or server trust of client online balances.
- Old application is fully archived at archive/legacy-v1-2026-11-15 and archive/rustwake-v1-2026-11-15, never silently restored.
- One coordinator plus max four rotating model agents, issue-scoped branches/PRs, independent QA/product, release engineer merges only approved work, exact main CI/CD and served SHA check, at most one browser instance per release.
- G1 final visual acceptance belongs to executive sponsor. Autonomous model can fix defects and supply evidence but cannot self-certify sponsor aesthetic acceptance.

## Decision change procedure
Record proposed ADR and issue with exact requested deviation, real captured before/after result, consequences and sponsor approval. Update tokens, code, art bible, tests, role protocols and docs/backlog/GAPS.md together with accepted implementation. If no approval, continue within current contract rather than inventing a new style.
