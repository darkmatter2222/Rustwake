# Supply-window probe — reserve floor (B-15) and link utilisation (B-25)

Command: `npx tsx scripts/probe-supply.mjs`. Runtime: Node v22.18.0. Each floor is scripted exactly like the 30-minute self-play driver in `tests/simulation/chain.test.ts`: tutorial completed, the onboarding export contract claimed on the first round three steel exist (T7's one press, which is what opens the repeatable market), then 1800 rounds at one ladder command per second (18000 ticks = 30 minutes of active play). Busy % is `busyTicks / ageTicks`, the same counters the bottleneck assistant reads (spec 10.5).

## Reserve-floor sweep (B-15)

| Floor | Machines | Drones | Total batches | Credits | Research nodes | Store at end | Aggregate link busy % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 6 | 4 | 1533 | 10 | 0 | scrap=30 ferrous=4 steel=4 copper=2 residue=1 plates=3 | 10.4 |
| 5 | 8 | 5 | 2028 | 250 | 3 | scrap=22 nonferrous=5 ferrous=15 steel=5 copper=5 polymer=5 wire=6 plates=5 circuits=5 data=85 | 9.2 |
| 10 | 8 | 5 | 1902 | 82 | 3 | scrap=18 nonferrous=10 ferrous=21 steel=10 copper=11 polymer=10 wire=13 plates=103 circuits=40 data=76 | 8.5 |
| 20 | 8 | 4 | 1792 | 165 | 3 | scrap=23 nonferrous=20 ferrous=30 steel=20 wire=50 polymer=21 plates=161 circuits=44 data=62 | 7.9 |

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
| 1 | store0 | machine1 | scrap | 24 | 0 | 24.1 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 13 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 26.3 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 13.2 |
| 5 | machine2 | store0 | steel | 24 | 0 | 2.8 |
| 6 | store0 | machine3 | nonferrous | 24 | 1 | 24.7 |
| 7 | machine3 | store0 | copper | 24 | 0 | 12.3 |
| 8 | machine3 | store0 | residue | 24 | 0 | 14.5 |
| 9 | machine2 | machine4 | steel | 24 | 0 | 2.9 |
| 10 | machine4 | store0 | plates | 24 | 0 | 1.5 |
| 11 | machine5 | store0 | circuits | 24 | 0 | 0 |
| 12 | machine5 | machine6 | circuits | 24 | 0 | 0 |
| 13 | machine6 | store0 | data | 24 | 0 | 0 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 17 | 99.9 | 863 | running | 4 | 0 |
| 2 | furnace | 15 | 25.3 | 197 | starved | 1 | 0 |
| 3 | copperSeparator | 14 | 70.7 | 424 | starved | 1 | 0 |
| 4 | platePress | 12 | 9.2 | 49 | starved | 0 | 0 |
| 5 | circuitAssembler | 12 | 0 | 0 | starved | 0 | 0 |
| 6 | signalLab | 11 | 0 | 0 | starved | 0 | 0 |

Aggregate link utilisation 10.4 %; dead links: machine5>store0:circuits, machine5>machine6:circuits, machine6>store0:data.

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
| 1 | store0 | machine1 | scrap | 24 | 0 | 20.3 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 11.4 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 23 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 11.5 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.9 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3.4 |
| 7 | machine4 | machine3 | residue | 24 | 0 | 10.8 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 21.4 |
| 9 | machine4 | store0 | copper | 24 | 0 | 10.7 |
| 10 | store0 | machine5 | copper | 24 | 0 | 10.9 |
| 11 | machine5 | store0 | wire | 24 | 0 | 10.9 |
| 12 | store0 | machine6 | steel | 24 | 1 | 5.1 |
| 13 | machine6 | store0 | plates | 24 | 0 | 2.5 |
| 14 | store0 | machine7 | wire | 24 | 2 | 3.9 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 3.7 |
| 16 | machine7 | store0 | circuits | 24 | 0 | 3.7 |
| 17 | store0 | machine8 | circuits | 24 | 0 | 4 |
| 18 | machine8 | store0 | data | 24 | 0 | 3.9 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 15 | 99.7 | 754 | running | 10 | 0 |
| 2 | furnace | 14 | 26.2 | 173 | starved | 0 | 0 |
| 3 | polymerRecycler | 12 | 26.8 | 119 | starved | 1 | 0 |
| 4 | copperSeparator | 13 | 71.4 | 358 | running | 0 | 0 |
| 5 | wireMill | 12 | 60.7 | 347 | running | 0 | 0 |
| 6 | platePress | 11 | 19 | 79 | starved | 1 | 0 |
| 7 | circuitAssembler | 11 | 44.8 | 112 | running | 8 | 0 |
| 8 | signalLab | 11 | 79.5 | 86 | running | 0 | 0 |

Aggregate link utilisation 9.2 %; dead links: none.

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
| 6 | machine3 | store0 | polymer | 24 | 0 | 3.3 |
| 7 | machine4 | machine3 | residue | 24 | 0 | 10.3 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 20.3 |
| 9 | machine4 | store0 | copper | 24 | 0 | 10.2 |
| 10 | store0 | machine5 | copper | 24 | 0 | 10.2 |
| 11 | machine5 | store0 | wire | 24 | 0 | 10.2 |
| 12 | store0 | machine6 | steel | 24 | 0 | 4.9 |
| 13 | machine6 | store0 | plates | 24 | 0 | 2.4 |
| 14 | store0 | machine7 | wire | 24 | 0 | 3.6 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 3.4 |
| 16 | machine7 | store0 | circuits | 24 | 0 | 1.7 |
| 17 | machine7 | machine8 | circuits | 24 | 0 | 1.8 |
| 18 | machine8 | store0 | data | 24 | 0 | 1.8 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 14 | 98 | 718 | running | 8 | 0 |
| 2 | furnace | 13 | 25.7 | 164 | starved | 0 | 0 |
| 3 | polymerRecycler | 11 | 27.1 | 114 | starved | 2 | 0 |
| 4 | copperSeparator | 12 | 70.7 | 344 | starved | 1 | 0 |
| 5 | wireMill | 11 | 59.8 | 333 | starved | 0 | 0 |
| 6 | platePress | 10 | 18.9 | 75 | starved | 1 | 0 |
| 7 | circuitAssembler | 10 | 41.5 | 103 | running | 10 | 0 |
| 8 | signalLab | 10 | 40.7 | 51 | starved | 0 | 0 |

Aggregate link utilisation 8.5 %; dead links: none.

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
| 1 | store0 | machine1 | scrap | 24 | 2 | 17.9 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 10.3 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 20.8 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 10.5 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.4 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3.1 |
| 7 | machine4 | store0 | wire | 24 | 0 | 9.5 |
| 8 | machine5 | machine3 | residue | 24 | 1 | 9.8 |
| 9 | machine5 | machine4 | copper | 24 | 1 | 11.5 |
| 10 | store0 | machine5 | nonferrous | 24 | 0 | 19.6 |
| 11 | store0 | machine6 | steel | 24 | 0 | 4.1 |
| 12 | machine6 | store0 | plates | 24 | 0 | 2.1 |
| 13 | store0 | machine7 | wire | 24 | 0 | 3 |
| 14 | store0 | machine7 | polymer | 24 | 0 | 2.9 |
| 15 | machine7 | store0 | circuits | 24 | 0 | 1.4 |
| 16 | machine7 | machine8 | circuits | 24 | 0 | 1.5 |
| 17 | machine8 | store0 | data | 24 | 0 | 1.5 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 13 | 94.9 | 683 | running | 8 | 0 |
| 2 | furnace | 11 | 24.9 | 156 | starved | 1 | 0 |
| 3 | polymerRecycler | 10 | 26 | 108 | starved | 0 | 0 |
| 4 | wireMill | 10 | 58.1 | 324 | starved | 0 | 0 |
| 5 | copperSeparator | 11 | 69.4 | 325 | starved | 1 | 0 |
| 6 | platePress | 9 | 16.7 | 66 | starved | 1 | 0 |
| 7 | circuitAssembler | 8 | 36.3 | 87 | starved | 10 | 0 |
| 8 | signalLab | 8 | 36.1 | 43 | starved | 0 | 0 |

Aggregate link utilisation 7.9 %; dead links: none.

