# Supply-window probe — reserve floor (B-15) and link utilisation (B-25)

Command: `npx tsx scripts/probe-supply.mjs`. Runtime: Node v22.18.0. Each floor is scripted exactly like the 30-minute self-play driver in `tests/simulation/chain.test.ts`: tutorial completed, the onboarding export contract claimed on the first round three steel exist (T7's one press, which is what opens the repeatable market), then 1800 rounds at one ladder command per second (18000 ticks = 30 minutes of active play). Busy % is `busyTicks / ageTicks`, the same counters the bottleneck assistant reads (spec 10.5).

## Reserve-floor sweep (B-15)

| Floor | Machines | Drones | Total batches | Credits | Research nodes | Store at end | Aggregate link busy % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 6 | 5 | 1558 | 1 | 0 | scrap=25 steel=1 copper=1 residue=1 | 10.5 |
| 5 | 8 | 4 | 1949 | 194 | 3 | scrap=13 nonferrous=5 ferrous=5 steel=5 copper=5 polymer=5 plates=134 wire=8 circuits=5 data=153 | 8.8 |
| 10 | 8 | 4 | 1864 | 165 | 3 | scrap=13 nonferrous=10 ferrous=11 steel=10 copper=10 polymer=10 wire=13 plates=133 circuits=10 data=106 | 8.6 |
| 20 | 8 | 4 | 1753 | 78 | 3 | scrap=23 nonferrous=20 ferrous=20 steel=20 wire=20 polymer=20 plates=134 circuits=41 data=56 | 7.6 |

## Floor 0

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 16.1 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 6.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 13.5 |
| 4 | machine1 | machine2 | ferrous | 24 | 1 | 13.8 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.2 |

After 18298 ticks, 13 links and 6 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 24.2 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 13.2 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 26.7 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 13.4 |
| 5 | machine2 | store0 | steel | 24 | 0 | 2.8 |
| 6 | store0 | machine3 | nonferrous | 24 | 0 | 25.1 |
| 7 | machine3 | store0 | copper | 24 | 0 | 12.5 |
| 8 | machine3 | store0 | residue | 24 | 0 | 14.6 |
| 9 | machine2 | machine4 | steel | 24 | 0 | 3 |
| 10 | machine4 | store0 | plates | 24 | 0 | 1.5 |
| 11 | machine5 | store0 | circuits | 24 | 0 | 0 |
| 12 | machine5 | machine6 | circuits | 24 | 0 | 0 |
| 13 | machine6 | store0 | data | 24 | 0 | 0 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 17 | 99.9 | 877 | running | 2 | 0 |
| 2 | furnace | 15 | 25.3 | 201 | starved | 1 | 0 |
| 3 | copperSeparator | 14 | 70.1 | 430 | running | 1 | 0 |
| 4 | platePress | 13 | 9.2 | 50 | starved | 0 | 0 |
| 5 | circuitAssembler | 12 | 0 | 0 | starved | 0 | 0 |
| 6 | signalLab | 11 | 0 | 0 | starved | 0 | 0 |

Aggregate link utilisation 10.5 %; dead links: machine5>store0:circuits, machine5>machine6:circuits, machine6>store0:data.

## Floor 5

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 13.3 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 6.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 11.4 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 12.6 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.3 |

After 18298 ticks, 18 links and 8 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 19.8 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 11.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 22.4 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 11.2 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.7 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3.3 |
| 7 | machine4 | machine3 | residue | 24 | 0 | 10.3 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 20.4 |
| 9 | machine4 | store0 | copper | 24 | 0 | 10.2 |
| 10 | store0 | machine5 | steel | 24 | 0 | 4.9 |
| 11 | machine5 | store0 | plates | 24 | 0 | 2.4 |
| 12 | store0 | machine6 | copper | 24 | 0 | 10.3 |
| 13 | machine6 | store0 | wire | 24 | 0 | 10.2 |
| 14 | store0 | machine7 | wire | 24 | 0 | 3.6 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 3.5 |
| 16 | machine7 | store0 | circuits | 24 | 1 | 3.5 |
| 17 | store0 | machine8 | circuits | 24 | 0 | 3.6 |
| 18 | machine8 | store0 | data | 24 | 0 | 3.6 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 14 | 99.7 | 736 | running | 8 | 0 |
| 2 | furnace | 13 | 26.2 | 168 | starved | 1 | 0 |
| 3 | polymerRecycler | 11 | 26.5 | 113 | starved | 2 | 0 |
| 4 | copperSeparator | 12 | 70.7 | 341 | running | 0 | 0 |
| 5 | platePress | 10 | 19.6 | 76 | starved | 0 | 0 |
| 6 | wireMill | 11 | 59.8 | 315 | running | 0 | 0 |
| 7 | circuitAssembler | 9 | 45.1 | 106 | starved | 10 | 0 |
| 8 | signalLab | 9 | 79.7 | 94 | starved | 0 | 0 |

Aggregate link utilisation 8.8 %; dead links: none.

## Floor 10

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 11.2 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 5.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 9.2 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 12.8 |
| 5 | machine2 | store0 | steel | 24 | 0 | 2.8 |

After 18298 ticks, 18 links and 8 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 19.8 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 10.8 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 21.9 |
| 4 | machine1 | machine2 | ferrous | 24 | 1 | 11 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.6 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3.1 |
| 7 | machine4 | machine3 | residue | 24 | 0 | 9.9 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 19.6 |
| 9 | machine4 | store0 | copper | 24 | 0 | 9.7 |
| 10 | store0 | machine5 | copper | 24 | 0 | 9.6 |
| 11 | machine5 | store0 | wire | 24 | 0 | 9.6 |
| 12 | store0 | machine6 | steel | 24 | 0 | 4.7 |
| 13 | machine6 | store0 | plates | 24 | 0 | 2.3 |
| 14 | store0 | machine7 | wire | 24 | 0 | 3.4 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 3.2 |
| 16 | machine7 | store0 | circuits | 24 | 0 | 3.2 |
| 17 | store0 | machine8 | circuits | 24 | 0 | 3.8 |
| 18 | machine8 | store0 | data | 24 | 0 | 3.8 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 14 | 98 | 716 | running | 8 | 0 |
| 2 | furnace | 12 | 25.3 | 163 | starved | 1 | 0 |
| 3 | polymerRecycler | 11 | 25.8 | 109 | running | 0 | 0 |
| 4 | copperSeparator | 11 | 67.1 | 330 | running | 0 | 0 |
| 5 | wireMill | 10 | 55.4 | 313 | running | 0 | 0 |
| 6 | platePress | 10 | 17.9 | 72 | starved | 1 | 0 |
| 7 | circuitAssembler | 9 | 39.6 | 96 | starved | 10 | 0 |
| 8 | signalLab | 8 | 80.8 | 65 | running | 0 | 0 |

Aggregate link utilisation 8.6 %; dead links: none.

## Floor 20

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 9.2 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 5.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 7.1 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 15 |
| 5 | machine2 | store0 | steel | 24 | 0 | 0 |

After 18298 ticks, 17 links and 8 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 15.2 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 10.2 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 20.6 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 10.4 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.4 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3 |
| 7 | machine4 | store0 | wire | 24 | 3 | 9.3 |
| 8 | machine5 | machine3 | residue | 24 | 0 | 9.5 |
| 9 | machine5 | machine4 | copper | 24 | 0 | 11.3 |
| 10 | store0 | machine5 | nonferrous | 24 | 0 | 19.1 |
| 11 | store0 | machine6 | steel | 24 | 0 | 4.1 |
| 12 | machine6 | store0 | plates | 24 | 3 | 2 |
| 13 | store0 | machine7 | wire | 24 | 0 | 2.9 |
| 14 | store0 | machine7 | polymer | 24 | 0 | 2.7 |
| 15 | machine7 | store0 | circuits | 24 | 0 | 1.3 |
| 16 | machine7 | machine8 | circuits | 24 | 0 | 1.4 |
| 17 | machine8 | store0 | data | 24 | 0 | 1.4 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 13 | 94.1 | 675 | running | 8 | 0 |
| 2 | furnace | 12 | 24.7 | 154 | starved | 1 | 0 |
| 3 | polymerRecycler | 10 | 25.2 | 105 | starved | 1 | 0 |
| 4 | wireMill | 10 | 56.5 | 316 | starved | 0 | 0 |
| 5 | copperSeparator | 11 | 67.2 | 316 | running | 1 | 0 |
| 6 | platePress | 9 | 16.2 | 65 | starved | 0 | 0 |
| 7 | circuitAssembler | 8 | 33.7 | 82 | running | 10 | 0 |
| 8 | signalLab | 8 | 33.7 | 40 | running | 0 | 0 |

Aggregate link utilisation 7.6 %; dead links: none.

