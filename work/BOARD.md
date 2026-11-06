# Rustwake team board

Generated from `work/backlog.json`; do not edit this view manually. This is a published snapshot, not proof of live sessions.

**SPRINT-002: I choose a plan; my yard comes alive** — proposed
Session cap: **6 total including coordinator**. Runtime: **observation-required**. Snapshot: 2026-11-06T16:18:21+00:00.

[Visual board](board.html) · [Canonical JSON](backlog.json) · [Legacy findings](BOARD-legacy.md) · [Sprint plan](product/SPRINT-002.md)

| ID | Priority | State | Role | Player outcome |
|---|---|---|---|---|
| TEAM-001 | P0 | ready | coordinator | Activate four-slot team and reconcile prior work |
| STRAT-001 | P0 | measured | player | Measure blind tapping versus deliberate plans |
| ART-001 | P1 | accepted | developer | Create and inspect a coherent playable yard style slice |
| RELEASE-001 | P1 | measured | release-engineer | Refresh evidence and keep main/live status current |
| STRAT-002 | P1 | measured | developer | Implement one reversible strategic allocation choice (A1: power-vs-throughput fork) |
| AUDIO-001 | P1 | triaged | reviewer | Assess and improve an actual industrial mix |
| DEF-001 | P2 | inbox | developer | Cached index.html can name removed hashed assets |
| DEF-002 | P3 | measured | developer | favicon request answered by the SPA HTML fallback (no icon file in the release) |
| DEF-003 | P2 | rejected | developer | Candidate motion clip repeats one frame 26 times |
| DEF-004 | P2 | deployed | developer | Drone freezes at one position after a large offline catch-up |
| UI-001 | P2 | triaged | developer | Bring the open research card back inside the coverage band |
| DEF-005 | P3 | deployed | developer | Wrapped drone leg restarts in one drawn frame (no end dwell) |
| RELEASE-002 | P1 | measured | release-engineer | Publish and deploy the merged fork-plus-motion slice |
| PLAY-001 | P1 | measured | player | Make the resting screen answer three questions without a tap |
| CHRM-001 | P2 | measured | developer | Collapse the resting card at 360x640 text scale 2.0 (legend wrap exceeds the recorded cap) |
| STRAT-003 | P1 | deployed | developer | Give the three named plans unequal prices so the tradeoff is readable at rest |
| RELEASE-003 | P1 | measured | release-engineer | Publish and deploy the resting-screen plus harness-v2 slice |
| PLAY-002 | P1 | measured | player | Put the two named plans, the last shortfall and a two-entry tile legend on the resting screen |
| DEF-006 | P3 | measured | developer | The carried last-shortfall segment is replaced but never cleared (QA label N-1) |
| RELEASE-004 | P1 | measured | release-engineer | Publish and deploy the two-plan dock plus shortfall-carried-forward slice |
| RELEASE-005 | P1 | measured | release-engineer | Publish and deploy the priced-fork slice plus its persona A/B |
| CHRM-002 | P2 | measured | developer | Bring the deepest resting cell inside the 42 % chrome cap with one leading value |
| D-1 | P2 | triaged | developer | Card still exceeds the cap in the deepest real cell (44.6 % with one blocked tap) |
| BLD-001 | P1 | measured | developer | Blind tapping parks on the fork row because the leftmost face is the dearer plan |
| RELEASE-006 | P1 | measured | release-engineer | Publish and deploy the css-only chrome-cap slice |
| RELEASE-007 | P1 | measured | release-engineer | Integrate and automatically deliver the cheapest-first dock fork row |
| OPS-101 | P1 | ready | developer | Activate work-conserving dispatch and real session telemetry |
| OPS-102 | P1 | ready | release-engineer | Activate automatic delivery and sanitized live team dashboard |
| OPS-103 | P1 | ready | product-owner | Incorporate sponsor priorities and maintain an estimated parallel-ready queue |
| ART-002 | P1 | triaged | reviewer | Critique actual current scenes against a stunning game standard |
| DEF-007 | P3 | triaged | developer | team-board --check reports the generated views stale on a CRLF working copy while CI passes the same step |
| UI-002 | P2 | triaged | ui-ux | Name the shared power budget at rest, not only after a refusal |
| UI-003 | P3 | triaged | reviewer | Close the missing UI capture set: rest-state yard coverage, mature-cell boxes, phone interaction series |

## Team efficiency (last 24 hours)

Published tickets: **8** · Deployed tickets: **8** · Prospectively estimated points published: **unknown**
Median implementation-to-publication: **2.7 h** · Tickets returned to rework: **0**
Observed child-slot utilization: **unknown** over 0 min sampled (0% window coverage). Runtime telemetry: **unknown / stale**.
8 published ticket(s) have no valid pre-work estimate; no retrospective points are fabricated.
Published and deployed counts are distinct ticket transitions, not commits. Points count once at first publication only if estimated before implementation. Zero-duration/backfilled lifecycle pairs are excluded from cycle time. Utilization excludes unsampled gaps; no data is unknown.

## Release evidence

Last inspected source: `12cc0e242bc2038be26ef7334ec1a945c3155181`.
Last evidenced deployed source: `12cc0e242bc2038be26ef7334ec1a945c3155181`.
[Play](https://home.darkmatter2222.com/rustwake/) · [Receipt](../work/releases/REL-007-g1.md)
automatic Actions delivery for the pushed main SHA: ci run 42231570081 (run 89, push event) completed success 14:10:33-14:11:14Z with all 15 steps green including "node scripts/team-board.mjs --check"; the delivery run 42231679008 (run 19, workflow_run event) completed success 14:11:17-14:11:45Z, its packaging job 127938856751 building the immutable source and dashboard and its promotion job 127938993734 reporting "Validate and promote through host-owned adapter" and "Publish sanitized receipt" success. Independently re-read by this lane over HTTPS: the served index.html (200, 1262 B) names ./assets/index-CUnHr3Cs.js and all four hashed assets are sha256-equal to the local build of 12cc0e2 (entry 231943 B e369fe9bfe90913d..., css 7474 B d3a995b2c520590a..., tables 9298 B 28bed3b02f2f79cb..., worker 13406 B 0c784f3e68570923...); the previous entry index-DGy53fNu.js still serves 200 at 231878 B, so old clients keep their assets. Served index.html is 28 B shorter than the local file because the working copy is CRLF (core.autocrlf=true, 28 CR in 30 LF).

Every role can submit feedback. Product owns priority; PM owns scheduling; release engineer publishes. Acceptance, publication, deployment and measured outcomes remain distinct.
