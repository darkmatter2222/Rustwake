# Rustwake V2 — autonomous studio contract

This repository is a fresh game restart. The old application is archived under archive/legacy-v1-2026-11-15 and must NOT be reintroduced into the V2 source, camera or UI. Read README.md, docs/VISION.md, docs/ROADMAP.md, docs/ACCEPTANCE.md, and the assigned new V2 issue. Archived source is a read-only reference, not a current work ledger.

## Critical player promise
Deliver the approved isometric blocky 3D salvage sandbox from public/reference/approved-yard.png. Live orbital camera, roads, visible transport, modular machinery, ongoing animations, deep idle/industrial progression, multiple currencies, PvE defense and later authoritative asynchronous Rust raids. No old grid/pipes UI, static illustration masquerading as gameplay, or marketing screenshots accepted as implemented.

## Operating model
One primary coordinator, at most FOUR children (five sessions total). On-demand roles: developer, UI/UX, independent reviewer, product, player, release engineer, live verifier. Only one release-engineer lease and one browser process per deployment. Never recursively spawn agents or start a second forever coordinator.
GitHub V2 issues and dependency links are authoritative; old closed issues and old Projects are history. Developers work in isolated rw/ branches and PRs, publish meaningful changes promptly; independent reviewer + product ACCEPT exact immutable head; release engineer merges approved PR to main and verifies main CI -> trusted deployment -> live SHA and browser artifacts. NEVER direct-push main. Do not call branch CI success a production release.
If release verification fails, record exact run/SHA and file a blocking bug. If no safe work, stop polling and wait on documented host event controls. Existing sessions require explicit cutover/reconciliation; GitHub changes do not remotely reload local agents.
No model self-certifies visual fidelity with only numeric pixels. Sponsor visually reviews a real desktop/phone screenshot+motion on the deployed build at G1 before any G2.


## V2 documentation and art authority — all harnesses
Every agent, regardless of model provider or orchestration harness, MUST consult docs/DOCUMENTATION.md when present; docs/design/ART_DIRECTION.md, PALETTE.md, CAMERA.md, UI_DESIGN.md, tokens.json; docs/engineering/ARCHITECTURE.md, ECONOMY.md and RELEASE.md; docs/qa/QUALITY_GATES.md; docs/agents/ROLES.md and roles.json; docs/agents/TASK_PROTOCOL.md; docs/agents/SPONSOR_HANDOFF.md; docs/backlog/GAPS.md and docs/decisions/README.md. Only read issue-relevant sections in routine tasks, but do not violate shared contracts. If a referenced file is absent in current main, file the missing-document blocker rather than inventing contents.

The approved art reference public/reference/approved-yard.png remains the immutable visual style target unless the sponsor explicitly changes it. No developer may turn the game into the old flat 6×6 pipes/grid HUD. V2 uses a real angled 3D voxelcraft industrial yard with recognizably sized machines, actual roads and conserved freight deliveries, warm rusty/steel/amber materials and restrained functional mint signals. Default yaw 45°/elevation 35.264°, continuous camera orbit/tilt/zoom, and ground-point cursor-gripped pan. A green numerical screenshot or data-world3d=ready is not sponsor visual acceptance.

Every material change updates code, tests, visual evidence, relevant canonical docs, ADR if intent changes, and docs/backlog/GAPS.md **in the SAME PR**. Source/issue/PR SHA, commands/exit codes and artifact screenshots/videos are required. No stale file line references or evidence invented from a model's summary. QA/design/release facts take precedence over agent prose.

## Autonomous studio implementation
The durable role catalog is docs/agents/roles.json (20 capability personas). It is NOT permission for 20 concurrent models: one coordinator plus at most four rotating children total. Supported harness role definitions under .qwen/agents and .opencode/agents are adapters, not autonomous new teams. Each role must prove host adoption and session lease reconciliation. A project manager does not direct-push main; production release manager verifies exact main CI, trusted delivery, served manifest and browser capture. One hosted Chromium per deployed SHA; other agents inspect its artifacts instead of launching browsers. Keep separate engineering, product, QA, security, device/accessibility, live-verification and documentation verdicts when applicable.

Current V2 issues: master #253, phase epics #254–259, tasks #260–305 and newer V2 defects. Native GitHub Projects V2 board remains unverified unless #265 has a real Project URL and field/edge evidence; scripts/bootstrap-v2-project.sh is a permission-scoped setup tool, not evidence that the Project exists. No inappropriate project deletion. End-user sponsor visual G1 acceptance is not granted by an accepted engineering PR.

**CI discipline:** PR screenshot/interaction tests, including pointer-grip and Zoom In/Out controls, must be GREEN. Do not bypass a failing browser test to merge. Release engineer should merge accepted work promptly; no self-acceptance or direct-main push. Preserve V1 snapshots and all rollback references.
