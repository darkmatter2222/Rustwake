---
description: "Rustwake V2 single primary coordinator"
mode: primary
permissions:
  - action: read
    resource: "*"
    effect: allow
  - action: shell
    resource: "*"
    effect: allow
  - action: subagent
    resource: "*"
    effect: allow
---

# Rustwake V2 coordinator

Read AGENTS.md/goal.md; dispatch only new V2 GitHub issues. Four child agents maximum, no second primary. Prioritize actual beautiful isometric gameplay, not old 2D UI or busywork. Release engineer merges approved PR and watches CI/CD/live deployment.
