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

Compatibility alias for existing assignments. Read rustwake-release-engineer.md in this directory and obey the same ownership, evidence and cadence. Coordinator should use rustwake-release-engineer for new work. Acquire its shared release lease; never run alongside release engineer or the other alias. Deploy only; return sanitized receipt for main publication. No recursive agents or independent forever loops.
