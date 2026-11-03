# Supply-window probe — reserve floor (B-15) and link utilisation (B-25)

Command: `npx tsx scripts/probe-supply.mjs`. Runtime: Node v22.18.0. Each floor is scripted exactly like the 30-minute self-play driver in `tests/simulation/chain.test.ts`: tutorial completed, then 1800 rounds at one ladder command per second (18000 ticks = 30 minutes of active play). Busy % is `busyTicks / ageTicks`, the same counters the bottleneck assistant reads (spec 10.5).

## Reserve-floor sweep (B-15)

| Floor | Machines | Total batches | Credits | Research nodes | Store at end | Aggregate link busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 4 | 670 | 0 | 0 | scrap=242 nonferrous=437 steel=221 | 12.0 |
| 5 | 5 | 1152 | 0 | 0 | scrap=18 nonferrous=5 ferrous=5 steel=215 copper=5 polymer=71 wire=581 | 11.2 |
| 10 | 7 | 1196 | 0 | 0 | scrap=16 nonferrous=10 ferrous=10 steel=20 copper=10 polymer=66 wire=542 plates=225 circuits=1 | 16.6 |
| 20 | 8 | 1137 | 0 | 0 | scrap=41 nonferrous=20 ferrous=20 steel=20 wire=493 polymer=62 plates=243 circuits=1 | 13.8 |

## Floor 0

After 798 ticks, 6 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 16.1 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 7.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 13.5 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 12.5 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.2 |
| 6 | store0 | machine2 | ferrous | 24 | 0 | 2.2 |

After 18298 ticks, 8 links and 4 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 12.6 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 41.5 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 8.5 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 8.8 |
| 5 | machine2 | store0 | steel | 24 | 0 | 20.9 |
| 6 | store0 | machine2 | ferrous | 24 | 0 | 3.9 |
| 7 | machine3 | store0 | polymer | 24 | 0 | 0 |
| 8 | machine4 | store0 | wire | 24 | 0 | 0 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 99.9 | 449 | running | 4 | 0 |
| 2 | furnace | 1 | 49.9 | 221 | running | 0 | 0 |
| 3 | polymerRecycler | 1 | 0 | 0 | starved | 0 | 0 |
| 4 | wireMill | 1 | 0 | 0 | starved | 0 | 0 |

Aggregate link utilisation 12.0 %; dead links: machine3>store0:polymer, machine4>store0:wire.

## Floor 5

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 13.3 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 6.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 11.4 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 12.6 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.3 |

After 18298 ticks, 14 links and 5 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 12.5 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 3.6 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 3.6 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 9.3 |
| 5 | machine2 | store0 | steel | 24 | 1 | 32.9 |
| 6 | store0 | machine2 | ferrous | 24 | 0 | 3.3 |
| 7 | machine3 | store0 | polymer | 24 | 0 | 12.1 |
| 8 | machine4 | machine3 | residue | 24 | 0 | 6.4 |
| 9 | machine1 | machine4 | nonferrous | 24 | 0 | 9.8 |
| 10 | machine4 | store0 | copper | 24 | 0 | 1.7 |
| 11 | store0 | machine4 | nonferrous | 24 | 0 | 2.9 |
| 12 | machine4 | machine5 | copper | 24 | 0 | 4.9 |
| 13 | machine5 | store0 | wire | 24 | 24 | 52.2 |
| 14 | store0 | machine5 | copper | 24 | 0 | 1.6 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 99.6 | 448 | running | 2 | 0 |
| 2 | furnace | 1 | 48.7 | 216 | starved | 1 | 0 |
| 3 | polymerRecycler | 1 | 24.6 | 71 | starved | 2 | 0 |
| 4 | copperSeparator | 1 | 63.8 | 215 | running | 0 | 0 |
| 5 | wireMill | 1 | 49.7 | 202 | outputFull | 8 | 1 |

Aggregate link utilisation 11.2 %; dead links: none.

## Floor 10

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 11.2 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 5.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 9.2 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 12.8 |
| 5 | machine2 | store0 | steel | 24 | 0 | 2.8 |

After 18298 ticks, 22 links and 7 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 12.2 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 3.7 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 3.7 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 9 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.5 |
| 6 | store0 | machine2 | ferrous | 24 | 0 | 2.8 |
| 7 | machine3 | store0 | polymer | 24 | 0 | 11.6 |
| 8 | machine4 | machine3 | residue | 24 | 0 | 6.1 |
| 9 | machine1 | machine4 | nonferrous | 24 | 0 | 9.4 |
| 10 | machine4 | store0 | copper | 24 | 0 | 1.7 |
| 11 | store0 | machine4 | nonferrous | 24 | 0 | 2.9 |
| 12 | machine4 | machine5 | copper | 24 | 0 | 4.6 |
| 13 | machine5 | store0 | wire | 24 | 24 | 48 |
| 14 | store0 | machine5 | copper | 24 | 0 | 1.5 |
| 15 | machine2 | machine6 | steel | 24 | 0 | 4.3 |
| 16 | machine6 | store0 | plates | 24 | 24 | 48.1 |
| 17 | store0 | machine6 | steel | 24 | 0 | 1.3 |
| 18 | machine5 | machine7 | wire | 24 | 1 | 97.7 |
| 19 | machine3 | machine7 | polymer | 24 | 0 | 0 |
| 20 | machine7 | store0 | circuits | 24 | 0 | 0 |
| 21 | store0 | machine7 | wire | 24 | 0 | 0 |
| 22 | store0 | machine7 | polymer | 24 | 2 | 92 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 98 | 439 | running | 4 | 0 |
| 2 | furnace | 1 | 45.3 | 200 | starved | 1 | 0 |
| 3 | polymerRecycler | 1 | 24.1 | 69 | starved | 1 | 0 |
| 4 | copperSeparator | 1 | 61.8 | 208 | running | 0 | 0 |
| 5 | wireMill | 1 | 48 | 195 | running | 2 | 0 |
| 6 | platePress | 1 | 27 | 84 | outputFull | 12 | 3 |
| 7 | circuitAssembler | 1 | 0.6 | 1 | starved | 16 | 0 |

Aggregate link utilisation 16.6 %; dead links: machine3>machine7:polymer, machine7>store0:circuits, store0>machine7:wire.

## Floor 20

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 9.2 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 5.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 7.1 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 15 |
| 5 | machine2 | store0 | steel | 24 | 0 | 0 |

After 18298 ticks, 23 links and 8 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 11.9 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 3.7 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 3.7 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 8.7 |
| 5 | machine2 | store0 | steel | 24 | 0 | 1.4 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 9.7 |
| 7 | store0 | machine2 | ferrous | 24 | 0 | 2.2 |
| 8 | machine4 | store0 | wire | 24 | 24 | 43.1 |
| 9 | machine5 | machine3 | residue | 24 | 0 | 6 |
| 10 | machine5 | machine4 | copper | 24 | 0 | 6.8 |
| 11 | machine1 | machine5 | nonferrous | 24 | 0 | 9.2 |
| 12 | store0 | machine5 | nonferrous | 24 | 0 | 2.7 |
| 13 | machine2 | machine6 | steel | 24 | 1 | 4.2 |
| 14 | machine6 | store0 | plates | 24 | 0 | 38.1 |
| 15 | store0 | machine6 | steel | 24 | 0 | 0.9 |
| 16 | machine4 | machine7 | wire | 24 | 1 | 95.9 |
| 17 | machine3 | machine7 | polymer | 24 | 0 | 0 |
| 18 | machine7 | store0 | circuits | 24 | 0 | 0 |
| 19 | store0 | machine7 | wire | 24 | 0 | 0 |
| 20 | store0 | machine7 | polymer | 24 | 2 | 70 |
| 21 | machine7 | machine8 | circuits | 24 | 0 | 0 |
| 22 | machine8 | store0 | data | 24 | 0 | 0 |
| 23 | store0 | machine8 | circuits | 24 | 0 | 0 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 95.8 | 429 | running | 4 | 0 |
| 2 | furnace | 1 | 42 | 184 | starved | 1 | 0 |
| 3 | polymerRecycler | 1 | 22.7 | 65 | running | 7 | 0 |
| 4 | wireMill | 1 | 42.4 | 179 | outputFull | 12 | 1 |
| 5 | copperSeparator | 1 | 59.7 | 198 | running | 0 | 0 |
| 6 | platePress | 1 | 25.9 | 81 | starved | 1 | 0 |
| 7 | circuitAssembler | 1 | 0.5 | 1 | starved | 16 | 0 |
| 8 | signalLab | 1 | 0 | 0 | starved | 0 | 0 |

Aggregate link utilisation 13.8 %; dead links: machine3>machine7:polymer, machine7>store0:circuits, store0>machine7:wire, machine7>machine8:circuits, machine8>store0:data, store0>machine8:circuits.

