# Rustwake V2 — autonomous studio contract

This repository is a fresh game restart. The old application is archived under archive/legacy-v1-2026-11-15 and must NOT be reintroduced into the V2 source, camera or UI. Read README.md, docs/VISION.md, docs/ROADMAP.md, docs/ACCEPTANCE.md, and the assigned new V2 issue. Archived source is a read-only reference, not a current work ledger.

## Critical player promise
Deliver the approved isometric blocky 3D salvage sandbox from public/reference/approved-yard.png. Live orbital camera, roads, visible transport, modular machinery, ongoing animations, deep idle/industrial progression, multiple currencies, PvE defense and later authoritative asynchronous Rust raids. No old grid/pipes UI, static illustration masquerading as gameplay, or marketing screenshots accepted as implemented.

## Operating model
One primary coordinator, at most FOUR children (five sessions total). On-demand roles: developer, UI/UX, independent reviewer, product, player, release engineer, live verifier. Only one release-engineer lease and one browser process per deployment. Never recursively spawn agents or start a second forever coordinator.
GitHub V2 issues and dependency links are authoritative; old closed issues and old Projects are history. Developers work in isolated rw/ branches and PRs, publish meaningful changes promptly; independent reviewer + product ACCEPT exact immutable head; release engineer merges approved PR to main and verifies main CI -> trusted deployment -> live SHA and browser artifacts. NEVER direct-push main. Do not call branch CI success a production release.
If release verification fails, record exact run/SHA and file a blocking bug. If no safe work, stop polling and wait on documented host event controls. Existing sessions require explicit cutover/reconciliation; GitHub changes do not remotely reload local agents.
No model self-certifies visual fidelity with only numeric pixels. Sponsor visually reviews a real desktop/phone screenshot+motion on the deployed build at G1 before any G2.
