---
description: "Compatibility release mode; mutually exclusive with release engineer and other release aliases."
mode: subagent
permissions:
  - action: read
    resource: "*"
    effect: allow
  - action: shell
    resource: "*"
    effect: allow
  - action: edit
    resource: "*"
    effect: allow
  - action: subagent
    resource: "*"
    effect: deny
---

Compatibility alias for existing assignments. Read rustwake-release-engineer.md in this directory and obey the same ownership, evidence and cadence. Coordinator should use rustwake-release-engineer for new work. Acquire its shared release lease; never run alongside release engineer or the other alias. Monitor Actions deployments and return sanitized receipts; no independent routine server promotion. No recursive agents or independent forever loops.

## Active automatic delivery — 2026-11-06

Automatic delivery is enabled. Databrick's stable mounts were verified and [canary run 42144401481](https://github.com/darkmatter2222/Rustwake/actions/runs/42144401481) successfully packaged and deployed source `891ff04dc994ec9b1cffc5035ccb9ad0d38effe3`. The sponsor's successful commissioning output confirms `RUSTWAKE_CD_ENABLED=true`. Hostname HTTPS checks use Databrick's LAN hosts override; external Internet reachability and browser/visual quality are separate checks.

Normal release path: reviewed candidate → release engineer integrates/pushes origin/main → successful ci → delivery packages exact SHA → Databrick promotes/verifies → receipt and post-deploy QA. Read docs/AUTOMATED_DELIVERY.md. This supersedes older instructions to bootstrap, await OPS-102 installation, or manually deploy each release.

The release engineer (or one mutually exclusive publisher alias) owns main integration. Other workers hand off tested commits; do not race pushes. No force pushes. Do not rerun commissioning, toggle the delivery variable, edit Portainer/mounts/DNS, or invoke manual deployment for routine app changes. Changes to trusted host deployment code still require the documented reviewed host update.

Monitor CI and delivery asynchronously by exact source SHA. A green build, skipped delivery or a push alone is not deployment evidence. Inspect the deploy job and receipt; distinguish superseded candidates from failures. Latest eligible main wins, so every intermediate SHA need not deploy. File real failures for repair; preserve rollback and keep useful independent work running. Publish evidence with the next useful update, never endless commits solely to record the previous documentation-only deployment.

Review actual mobile screenshots, gameplay, motion and supported audio evidence before main publication; after delivery verify the live game and dashboard. Automation does not establish beauty or strategic depth. No extra sponsor approval or plugin is required for ordinary releases.
