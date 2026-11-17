# Rustwake V2 — Documentation authority and maintenance charter

This is the navigation and decision hierarchy for EVERY AI agent, independent of model provider, orchestration harness, runtime, context length, or tool selection. The user is the executive sponsor. Developers and reviewers may not reinterpret accepted art direction without a recorded sponsor decision.

## Canonical reading order
1. Root AGENTS.md: enforceable cross-harness engineering and release policy.
2. This DOCUMENTATION.md: authority, document index, update requirements and known limits.
3. docs/design/ART_DIRECTION.md: approved screenshot, geometric and animation identity.
4. docs/design/tokens.json and PALETTE.md: exact palette, typography, lighting, spacing and semantic use.
5. docs/design/CAMERA.md: pointer grip, ray/ground projection, zoom and orbit contract.
6. docs/design/UI_DESIGN.md: complete game-first responsive interaction specification.
7. docs/design/ASSETS.md: all primitive/rig families, import and LOD rules. docs/design/VOXEL_GEOMETRY.md: canonical voxel scale, pivot, pick and material schema (#347, rustwake.voxel.geometry.v1).
8. docs/engineering/ARCHITECTURE.md: runtime and module/data boundaries.
9. docs/engineering/ECONOMY.md: inventory, currencies, production, physical shipping and missing sinks.
10. docs/engineering/RELEASE.md: main CI/CD, trust boundaries, rollback and live evidence.
11. docs/qa/QUALITY_GATES.md: independent test, mobile, visual and production acceptance.
12. docs/agents/ROLES.md and roles.json: responsibilities, read/write boundaries, role authority, limits.
13. docs/agents/TASK_PROTOCOL.md: Github issue/branch/PR/release flow and blockers.
14. docs/agents/SPONSOR_HANDOFF.md: reusable handoff prompt for the next primary AI.
15. docs/backlog/GAPS.md: factual built/partial/missing inventory and prioritized work.
16. docs/decisions/: immutable architectural/product decision records and supersession.

## Precedence of intent
Latest explicit sponsor direction > root AGENTS.md policy > canonical product/design contracts > approved ADR > live V2 issue acceptance and exact dependency > task-specific plan. Archived V1 code and docs are reference, never active authority. A generic model guideline or previous agent claim cannot silently weaken this chain. Contradictions must be filed and resolved; do not invent agreement.

## Precedence of evidence
Production artifact/actual running UI at exact served SHA > independent reproduction on PR head > source code at exact SHA > automated test/probe > written plan or generated image. Unit tests prove their asserted conditions, not player enjoyment, art quality, physical mobile performance, network readiness or long-term retention. Use PASS, FAIL, BLOCKED, UNKNOWN, PARTIAL, PENDING-VISUAL precisely.

## Sources of truth
- Player visual benchmark: public/reference/approved-yard.png. Supplementary: public/reference/asset-style-sheet.png.
- CSS semantic palette: src/styles.css root variables. Source world materials: src/world.js. tokens.json mirrors audited values; planned future consolidation must remove redundant literals.
- Camera projection and clamps: src/camera.js, shared with src/cameraInput.js, src/world.js.
- Content/currencies/recipes: src/content.js.
- Simulation/save/routing: src/simulation.js.
- UI and actual controls: src/App.jsx and src/styles.css.
- Agent roster: docs/agents/roles.json; generate Qwen/OpenCode persona files via scripts/generate-agent-personas.mjs.
- Live backlog: GitHub V2 issues #253–305 and later V2-labeled issues; native GitHub Project when verified. No parallel internal Jira.
- Release proof: merged main SHA, main CI, trusted delivery receipt, served manifest SHA/asset hashes and one browser capture.
- Sponsor G1 visual acceptance: explicit judgment of real integrated app, never assumed from green CI.

## Documentation updates are part of the code change
- Changing colors/fonts/world materials/lighting: update palette contract and tokens.json, source, new screenshot and contrast check in same PR.
- Changing camera input: update CAMERA.md, camera unit+browser tests, on-screen controls and device matrix.
- Changing buildings/road/currencies/production: update ASSETS.md, ECONOMY.md, source/sink invariants, save schema and game tests.
- Changing UI interaction: update UI_DESIGN.md, accessibility state transitions and phone screenshots.
- Changing an agent role or harness instructions: update roles.json, regenerate persona files and verify --check; no duplicated drifting copies.
- Changing a workflow/permissions: update RELEASE.md, CI smoke/rollback tests and exact run receipt.
- Changing product scope: issue + explicit ADR + backlog and updated player outcome.
- Changing issue/task dependencies: reconcile native GitHub issue blocker edges, not just Markdown.

## Required documentation quality
Every substantive spec names: current status (implemented, partial, proposed), purpose, source paths, interfaces/units, failure and recovery behavior, tests, required artifacts, owner and upstream/downstream dependencies. Explain what is NOT implemented. Attach exact SHA to evidence; avoid fabrication of metrics, role independence, time estimates, real-phone proof or live account/project permissions.

Preserve old decisions as ADRs. Rewrite the current canonical doc when a decision supersedes it rather than adding contradictory appendices. Keep role prompts short by pointing to canonical documents, avoiding endless repeated tokens.
