# Supply-window probe — reserve floor (B-15) and link utilisation (B-25)

Command: `npx tsx scripts/probe-supply.mjs`. Runtime: Node v22.18.0. Each floor is scripted exactly like the 30-minute self-play driver in `tests/simulation/chain.test.ts`: tutorial completed, the onboarding export contract claimed on the first round three steel exist (T7's one press, which is what opens the repeatable market), then 1800 rounds at one ladder command per second (18000 ticks = 30 minutes of active play). Busy % is `busyTicks / ageTicks`, the same counters the bottleneck assistant reads (spec 10.5).

## Reserve-floor sweep (B-15)

| Floor | Machines | Total batches | Credits | Research nodes | Store at end | Aggregate link busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 5 | 1456 | 67 | 0 | scrap=1 ferrous=5 | 11.7 |
| 5 | 7 | 1457 | 84 | 0 | scrap=7 nonferrous=5 ferrous=11 steel=5 copper=5 polymer=5 plates=5 circuits=3 | 20.2 |
| 10 | 8 | 1757 | 25 | 3 | scrap=10 nonferrous=10 ferrous=10 steel=10 copper=10 polymer=10 wire=10 plates=10 circuits=10 data=10 | 7.6 |
| 20 | 8 | 1677 | 84 | 3 | scrap=20 nonferrous=20 ferrous=20 steel=20 wire=20 polymer=20 plates=20 circuits=20 data=20 | 7.0 |

## Floor 0

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 16.1 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 6.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 13.5 |
| 4 | machine1 | machine2 | ferrous | 24 | 1 | 13.8 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.2 |

After 18298 ticks, 11 links and 5 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 4 | 22.6 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 12.3 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 25.1 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 12.4 |
| 5 | machine2 | store0 | steel | 24 | 0 | 2.6 |
| 6 | store0 | machine3 | nonferrous | 24 | 0 | 23.4 |
| 7 | machine3 | store0 | copper | 24 | 0 | 11.7 |
| 8 | machine3 | store0 | residue | 24 | 0 | 13.7 |
| 9 | machine2 | machine4 | steel | 24 | 0 | 2.9 |
| 10 | machine4 | store0 | plates | 24 | 0 | 1.5 |
| 11 | machine5 | store0 | circuits | 24 | 0 | 0 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 15 | 99 | 819 | running | 0 | 0 |
| 2 | furnace | 13 | 25.3 | 188 | running | 0 | 0 |
| 3 | copperSeparator | 13 | 70.2 | 402 | running | 0 | 0 |
| 4 | platePress | 11 | 9.7 | 47 | starved | 0 | 0 |
| 5 | circuitAssembler | 10 | 0 | 0 | starved | 0 | 0 |

Aggregate link utilisation 11.7 %; dead links: machine5>store0:circuits.

## Floor 5

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 13.3 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 6.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 11.4 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 12.6 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.3 |

After 18298 ticks, 15 links and 7 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 3 | 20.6 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 11.2 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 22.7 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 11.4 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.8 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3.2 |
| 7 | machine4 | machine3 | residue | 24 | 1 | 10.1 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 20.1 |
| 9 | machine4 | store0 | copper | 24 | 1 | 10 |
| 10 | store0 | machine5 | steel | 24 | 0 | 4.7 |
| 11 | machine5 | store0 | plates | 24 | 0 | 2.3 |
| 12 | store0 | machine6 | polymer | 24 | 2 | 85.6 |
| 13 | machine6 | store0 | circuits | 24 | 0 | 0.1 |
| 14 | machine7 | machine6 | wire | 24 | 24 | 95.9 |
| 15 | store0 | machine7 | copper | 24 | 0 | 0.7 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 14 | 98.9 | 746 | starved | 1 | 0 |
| 2 | furnace | 12 | 25.2 | 171 | starved | 1 | 0 |
| 3 | polymerRecycler | 10 | 25.9 | 111 | starved | 2 | 0 |
| 4 | copperSeparator | 11 | 65.7 | 336 | starved | 1 | 0 |
| 5 | platePress | 9 | 16.2 | 74 | starved | 1 | 0 |
| 6 | circuitAssembler | 9 | 1.6 | 3 | starved | 16 | 0 |
| 7 | wireMill | 10 | 4.4 | 16 | outputFull | 2 | 2 |

Aggregate link utilisation 20.2 %; dead links: none.

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
| 1 | store0 | machine1 | scrap | 24 | 5 | 11.8 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 10.3 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 20.8 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 10.5 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.4 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3 |
| 7 | machine4 | machine3 | residue | 24 | 0 | 9.4 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 18.6 |
| 9 | machine4 | store0 | copper | 24 | 0 | 9.3 |
| 10 | store0 | machine5 | copper | 24 | 0 | 8.6 |
| 11 | machine5 | store0 | wire | 24 | 0 | 8.6 |
| 12 | store0 | machine6 | steel | 24 | 0 | 4.4 |
| 13 | machine6 | store0 | plates | 24 | 0 | 2.2 |
| 14 | store0 | machine7 | wire | 24 | 0 | 3.2 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 3 |
| 16 | machine7 | store0 | circuits | 24 | 0 | 3 |
| 17 | store0 | machine8 | circuits | 24 | 0 | 3.1 |
| 18 | machine8 | store0 | data | 24 | 0 | 3.1 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 13 | 97.2 | 681 | powerLimited | 4 | 0 |
| 2 | furnace | 12 | 25.5 | 155 | powerLimited | 0 | 0 |
| 3 | polymerRecycler | 10 | 25.5 | 104 | starved | 2 | 0 |
| 4 | copperSeparator | 11 | 67.1 | 314 | powerLimited | 1 | 0 |
| 5 | wireMill | 10 | 53.1 | 280 | powerLimited | 0 | 0 |
| 6 | platePress | 9 | 18 | 68 | starved | 1 | 0 |
| 7 | circuitAssembler | 8 | 39.6 | 89 | starved | 10 | 0 |
| 8 | signalLab | 8 | 68.7 | 66 | powerLimited | 0 | 0 |

Aggregate link utilisation 7.6 %; dead links: none.

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
| 1 | store0 | machine1 | scrap | 24 | 5 | 9.9 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 9.9 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 20.1 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 10.2 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.3 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 2.9 |
| 7 | machine4 | store0 | wire | 24 | 0 | 8.9 |
| 8 | machine5 | machine3 | residue | 24 | 0 | 9.1 |
| 9 | machine5 | machine4 | copper | 24 | 0 | 10.7 |
| 10 | store0 | machine5 | nonferrous | 24 | 1 | 18.2 |
| 11 | store0 | machine6 | steel | 24 | 0 | 3.9 |
| 12 | machine6 | store0 | plates | 24 | 0 | 1.9 |
| 13 | store0 | machine7 | wire | 24 | 0 | 2.4 |
| 14 | store0 | machine7 | polymer | 24 | 0 | 2.3 |
| 15 | machine7 | store0 | circuits | 24 | 0 | 1.1 |
| 16 | machine7 | machine8 | circuits | 24 | 0 | 1.2 |
| 17 | machine8 | store0 | data | 24 | 0 | 1.2 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 13 | 94 | 658 | powerLimited | 3 | 0 |
| 2 | furnace | 11 | 24.4 | 150 | powerLimited | 0 | 0 |
| 3 | polymerRecycler | 10 | 25.1 | 100 | starved | 2 | 0 |
| 4 | wireMill | 9 | 54.6 | 301 | powerLimited | 0 | 0 |
| 5 | copperSeparator | 10 | 65.9 | 302 | powerLimited | 0 | 0 |
| 6 | platePress | 9 | 15.9 | 62 | starved | 1 | 0 |
| 7 | circuitAssembler | 8 | 28.9 | 70 | starved | 10 | 0 |
| 8 | signalLab | 8 | 28.1 | 34 | powerLimited | 0 | 0 |

Aggregate link utilisation 7.0 %; dead links: none.

