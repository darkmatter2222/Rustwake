# BACKLOG

Rolling, prioritised. IDs are stable within this file.

| ID | Title | Player problem / invariant | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| B-01 | Multi-tab single-writer lease | Two tabs can both mutate the local save and double-settle progress | Lease with owner id + heartbeat; second tab becomes read-only with a visible notice; revision-checked takeover; tests for both paths | Todo |
| B-02 | Worker catch-up | 12 h catch-up can exceed the 100 ms main-thread stall target on low-end phones | Off-main-thread catch-up with cancellation and versioned result; measured stall histogram in a trace | Todo |
| B-03 | Bottleneck assistant | Starved/full/power-limited machines are visible but not explained | One evidence line per machine with the measured occupancy/starvation percentage and one recommendation; no purchase forced | Todo |
| B-04 | Copper + polymer chain | First meaningful choice of where to spend an upgrade budget | R03/R04/R05 reachable with two viable upgrade targets; throughput verified in a fixture | Done (2026-11-03) |
| B-05 | Small research branch | Session-length goal beyond machine count | Three-node branch with visible exact effects, purchasable with data, effects applied once | Todo |
| B-06 | Store export/import | Players cannot move a yard between devices | Versioned JSON export, validated import, corrupt file keeps the previous state | Todo |
| B-07 | Wreck scan detail | Yield is opaque once machines exceed the starter two | Coarse then fine scan, seed committed once, remaining pool shown exactly | Todo |
| B-08 | Real-device performance trace | 30/60 FPS and thermal claims are unverified | Trace from a midrange Android and an iPhone with p95 main-thread work < 10 ms at default scene | Blocked (needs device) |
| B-09 | Human first-feel playtest | Comprehension of the opening loop is unproven by humans | 8 of 10 fresh testers complete the automated loop unaided; raw observations recorded | Blocked (needs testers) |
| B-10 | Localization readiness | English literals block later translation | Keys with defaults, shared number/time formatting, expansion without scrolling | Todo |
| B-11 | Audio human review | Harshness/fatigue of synthesised cues unknown | Listening pass recorded with per-cue notes and gain adjustments | Blocked (needs listener) |
| B-12 | Content validator in CI | Broken references surface late | Typed-content validation runs in CI, rejecting missing ids, invalid footprints, zero-time cycles | Todo |
| B-13 | High-contrast + text-scale audit | Readability at large text on narrow screens | Panels paginate without document scroll at 360 × 640 and 2.0 text scale | Todo |
| B-14 | Prestige readiness | Large numbers and founding require safe arithmetic | Documented qualified-value definition, mantissa/exponent helper tested at 1e12+ | Later |
| B-15 | Reserve-floor tuning | The 10-unit floor measurably caps the wire mill: 12 batches against the separator's 23 in the 1 200-tick fixture | Floor swept over {0, 5, 10, 20} with the chain fixture, one table in docs, chosen value documented | Todo |
| B-16 | HUD area measurement | The 15–22 % HUD target is currently eyeballed from screenshots | Bounding-box sum of HUD elements as a share of the visual viewport at 360 × 640, 390 × 844, and 1440 × 900 | Todo |

## Notes

- B-08/B-09/B-11 are labelled blocked rather than skipped: they need hardware, people, or
  a listening pass that an autonomous code pass cannot substitute.
- Numbered milestones (M2-M9) live in `goal.md`; this table is the working order within
  and across them.
