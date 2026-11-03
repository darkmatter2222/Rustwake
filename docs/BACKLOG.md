# BACKLOG

Rolling, prioritised. IDs are stable within this file.

| ID | Title | Player problem / invariant | Acceptance criteria | Status |
| --- | --- | --- | --- | --- |
| B-01 | Multi-tab single-writer lease | Two tabs can both mutate the local save and double-settle progress | Lease with owner id + heartbeat; second tab becomes read-only with a visible notice; revision-checked takeover; tests for both paths | Done (2026-11-03) |
| B-02 | Worker catch-up | 12 h catch-up can exceed the 100 ms main-thread stall target on low-end phones | Off-main-thread catch-up with cancellation and versioned result; measured stall histogram in a trace | Todo |
| B-03 | Bottleneck assistant | Starved/full/power-limited machines are visible but not explained | One evidence line per machine with the measured occupancy/starvation percentage and one recommendation; no purchase forced | Done (2026-11-03) |
| B-04 | Copper + polymer chain | First meaningful choice of where to spend an upgrade budget | R03/R04/R05 reachable with two viable upgrade targets; throughput verified in a fixture | Done (2026-11-03) |
| B-05 | Small research branch | Session-length goal beyond machine count | Three-node branch with visible exact effects, purchasable with data, effects applied once | Done (2026-11-03) |
| B-06 | Store export/import | Players cannot move a yard between devices | Versioned JSON export, validated import, corrupt file keeps the previous state | Todo |
| B-07 | Wreck scan detail | Yield is opaque once machines exceed the starter two | Coarse then fine scan, seed committed once, remaining pool shown exactly | Todo |
| B-08 | Real-device performance trace | 30/60 FPS and thermal claims are unverified | Trace from a midrange Android and an iPhone with p95 main-thread work < 10 ms at default scene | Blocked (needs device) |
| B-09 | Human first-feel playtest | Comprehension of the opening loop is unproven by humans | 8 of 10 fresh testers complete the automated loop unaided; raw observations recorded | Blocked (needs testers) |
| B-10 | Localization readiness | English literals block later translation | Keys with defaults, shared number/time formatting, expansion without scrolling | Todo |
| B-11 | Audio human review | Harshness/fatigue of synthesised cues unknown | Listening pass recorded with per-cue notes and gain adjustments | Blocked (needs listener) |
| B-12 | Content validator in CI | Broken references surface late | Typed-content validation runs in CI, rejecting missing ids, invalid footprints, zero-time cycles | Todo |
| B-13 | High-contrast + text-scale audit | Readability at large text on narrow screens | Panels paginate without document scroll at 360 × 640 and 2.0 text scale | Todo |
| B-14 | Prestige readiness | Large numbers and founding require safe arithmetic | Documented qualified-value definition, mantissa/exponent helper tested at 1e12+ | Later |
| B-15 | Reserve-floor tuning | The 10-unit floor measurably caps the wire mill: 12 batches against the separator's 23 in the 1 200-tick fixture | Floor swept over {0, 5, 10, 20} with the chain fixture, one table in docs, chosen value documented | Done (2026-11-03): 30-minute sweep gives machines 4/5/7/8 and batches 670/1152/1196/1137 for floors 0/5/10/20, so 10 stays; table in `docs/evidence/2026-11-03-supply-window.md` |
| B-16 | HUD area measurement | The 15–22 % HUD target is currently eyeballed from screenshots | Bounding-box sum of HUD elements as a share of the visual viewport at 360 × 640, 390 × 844, and 1440 × 900 | Todo |
| B-17 | Rolling 60 s rate window | The panel's "Actual rate" divides by total elapsed time, but spec 9.4 asks for a 60 s window (or all time for a new machine) | Per-machine batch-completion ring or tick-pair snapshot; panel shows window and both rates; test compares against a fixture at 300 and 1 200 ticks | Todo |
| B-18 | Follower-tab smoothness | A mirrored tab updates on the 10 Hz adopt cadence, so cargo motion reads steppier than in the owner tab | Interpolate follower sprites between the last two adopted snapshots, or raise the cadence with a measured cost; one trace at 390 × 844 | Todo |

| B-19 | Input pulls sized to the need | The yard stops at three machines: `pullFromStore` moved everything above the floor into a 12-unit input buffer at once, so the store showed `ferrous 1, nonferrous 1` while the prices of the next machines (5-12 units) are read from the store only | Pull only what the running and next batch need plus one buffer tranche; chain fixture keeps its throughput numbers, the store keeps an affordable balance, and the scripted session's machine count is re-measured | Done (2026-11-03): 3 machines → 7 in the 30-minute self-play driver, sorter batches 29 → 439 |
| B-20 | Research-panel screenshot | The panel is asserted in jsdom but has no image, so the visual gate for B-05 stays open | Either the capture session reaches `data > 0` or a second context seeds a save produced by the engine; gallery entry with dimensions, tick, and node state | Todo |
| B-21 | Build-versus-upgrade cadence | The 30-minute headless self-play builds seven machines and leaves every one at level 1, while the shorter real-Chrome session reaches L7/L7/L7; the ladder's build-before-upgrade order is therefore unmeasured against batches per minute | One fixture comparing "build first" against "upgrade first" at 1 800 rounds: batches per minute, credits, and machine count in one table, then keep the better order with a D-note | Todo |
| B-22 | Dead-link audit | Per-material routing leaves room for links that never carry anything, which spec 10.1 forbids as decorative belts | Report each link's busy ratio from the 30-minute self-play session; any link at 0 % busy is either removed by the plan or explained in the panel; one test asserts no 0 %-busy link in a settled yard | Done (2026-11-03): 22 links at 16.6 % aggregate busy, 19 carrying cargo, and exactly three idle ones - all on the last-built machine (link 19 `machine3>machine7:polymer`, 20 `machine7>store0:circuits`, 21 `store0>machine7:wire`); tables in `docs/evidence/2026-11-03-supply-window.md`, asserted in `tests/simulation/supply-window.test.ts`. The three idle links become B-23 |
| B-23 | Collapse duplicate input links | The last-built machine gets a second link for a material already carried into it (`store0>machine7:polymer` while `machine3>machine7:polymer` exists), so the yard pays for a link that never moves: 3 of 22 links at 0 % busy, the assembler at 0.6 % busy with 16 ready units | `planConnections` treats an input as covered by `(to, filter)` regardless of source, so at most one link per material per machine plus one store fallback; link count drops from 22 to 19 in the same session with the same or better batch total; test pins the link count and the 0 %-busy count | Todo |

## Notes

- B-08/B-09/B-11 are labelled blocked rather than skipped: they need hardware, people, or
  a listening pass that an autonomous code pass cannot substitute.
- Numbered milestones (M2-M9) live in `goal.md`; this table is the working order within
  and across them.
