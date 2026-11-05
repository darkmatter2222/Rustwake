# Rustwake team board

Generated from `work/backlog.json`; do not edit this view manually. This is a published snapshot, not proof of live sessions.

**SPRINT-002: I choose a plan; my yard comes alive** — proposed
Session cap: **4 total including coordinator**. Runtime: **activation-required**. Snapshot: 2026-11-05T09:22:00+00:00.

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
| DEF-002 | P3 | inbox | developer | favicon request answered by the SPA HTML fallback (no icon file in the release) |
| DEF-003 | P2 | rejected | developer | Candidate motion clip repeats one frame 26 times |
| DEF-004 | P2 | deployed | developer | Drone freezes at one position after a large offline catch-up |
| UI-001 | P2 | triaged | developer | Bring the open research card back inside the coverage band |
| DEF-005 | P3 | deployed | developer | Wrapped drone leg restarts in one drawn frame (no end dwell) |
| RELEASE-002 | P1 | measured | release-engineer | Publish and deploy the merged fork-plus-motion slice |
| PLAY-001 | P1 | deployed | player | Make the resting screen answer three questions without a tap |
| CHRM-001 | P2 | triaged | developer | Collapse the resting card at 360x640 text scale 2.0 (legend wrap exceeds the recorded cap) |
| STRAT-003 | P1 | ready | developer | Give the three named plans unequal prices so the tradeoff is readable at rest |
| RELEASE-003 | P1 | measured | release-engineer | Publish and deploy the resting-screen plus harness-v2 slice |

## Release evidence

Last inspected source: `8a06e9debf7ff345681979cd6f731b24b2b5d581`.
Last evidenced deployed source: `8a06e9debf7ff345681979cd6f731b24b2b5d581`.
[Play](https://home.darkmatter2222.com/rustwake/) · [Receipt](../work/deployments/OPS-010-g1.json)
OPS-010-g1, 2026-11-05 09:22 UTC: deployed as the labelled preview rustwake-8a06e9d; served index.html names assets/index-CJfGk59d.js (231520 B) and 5/5 served sha256 == the isolated SHA build over HTTPS and loopback; the previous entry name assets/index-Br0Eyz3s.js now 404s and rustwake-c2842e1 is retained as the rollback resource. Integrated 8a06e9d = PLAY-001 g1 (487d3ca) + STRAT-002 g2 (88167c7) per file; 268 tests across 27 files, behaviour line and save checksum eede3c4f unchanged, entry 1480 B under the 233000 ceiling. Live smoke on the deployed artifact: toast 'Need 20 scrap · have 0', resting 'Drones 1 · Power 8 · 0 requested · 100 %' with machines 0, three named fork options at 30 credits each, one tap commits and the legend reads 'Batch pips · Scrap sorter 1/5 · Furnace 1/5 · Polymer recycler 0/5 +1'. Remote CI status unreadable (gh unauthenticated, anonymous API 404) -> remote-CI-unverified.

Every role can submit feedback. Product owns priority; PM owns scheduling; release engineer publishes. Acceptance, publication, deployment and measured outcomes remain distinct.
