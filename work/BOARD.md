# Rustwake team board

Generated from `work/backlog.json`; do not edit this view manually. This is a published snapshot, not proof of live sessions.

**SPRINT-002: I choose a plan; my yard comes alive** — proposed
Session cap: **4 total including coordinator**. Runtime: **activation-required**. Snapshot: 2026-11-05T13:47:00+00:00.

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
| PLAY-001 | P1 | measured | player | Make the resting screen answer three questions without a tap |
| CHRM-001 | P2 | measured | developer | Collapse the resting card at 360x640 text scale 2.0 (legend wrap exceeds the recorded cap) |
| STRAT-003 | P1 | ready | developer | Give the three named plans unequal prices so the tradeoff is readable at rest |
| RELEASE-003 | P1 | measured | release-engineer | Publish and deploy the resting-screen plus harness-v2 slice |
| PLAY-002 | P1 | deployed | player | Put the two named plans, the last shortfall and a two-entry tile legend on the resting screen |
| DEF-006 | P3 | inbox | developer | The carried last-shortfall segment is replaced but never cleared (QA label N-1) |
| RELEASE-004 | P1 | measured | release-engineer | Publish and deploy the two-plan dock plus shortfall-carried-forward slice |

## Release evidence

Last inspected source: `7d7e05c7124722857ba9828cff5dbd49df5ab04f`.
Last evidenced deployed source: `7d7e05c7124722857ba9828cff5dbd49df5ab04f`.
[Play](https://home.darkmatter2222.com/rustwake/) · [Receipt](../work/deployments/OPS-011-g1.json)
OPS-011-g1, 2026-11-05 13:47 UTC: deployed as the labelled preview rustwake-7d7e05c; served index.html names assets/index-Bi7lF9Yv.js (231706 B) and 5/5 served sha256 equals the isolated SHA build over HTTPS and loopback; the previous entry name assets/index-CJfGk59d.js now 404s and rustwake-8a06e9d is retained as the rollback resource. Integrated 7d7e05c = PLAY-002 g1 (f607ad2b) carrying STRAT-002 g3 (d836a7a) per file; 275 tests across 27 files, behaviour line and save checksum eede3c4f unchanged, entry 1294 B under the 233000 ceiling and its digest equals the independent QA worktree build's. Live smoke on the deployed artifact: resting 'Drones 1 - Power 8 - 0 requested - 100 %' with the trailing 'Last need 20 scrap - have 15'; 2.2 s after one blocked tap the toast is null while that trailing segment is still painted; the fork row is exactly two options 'Faster batches 30 credits' and 'Less power 30 credits' and one tap records branch [speed]; 0 pageerror. Remote CI status unreadable (gh unauthenticated, anonymous API 404) -> remote-CI-unverified.

Every role can submit feedback. Product owns priority; PM owns scheduling; release engineer publishes. Acceptance, publication, deployment and measured outcomes remain distinct.
