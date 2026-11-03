# Supply-window probe — reserve floor (B-15) and link utilisation (B-25)

Command: `npx tsx scripts/probe-supply.mjs`. Runtime: Node v22.18.0. Each floor is scripted exactly like the 30-minute self-play driver in `tests/simulation/chain.test.ts`: tutorial completed, then 1800 rounds at one ladder command per second (18000 ticks = 30 minutes of active play). Busy % is `busyTicks / ageTicks`, the same counters the bottleneck assistant reads (spec 10.5).

## Reserve-floor sweep (B-15)

| Floor | Machines | Total batches | Credits | Research nodes | Store at end | Aggregate link busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 8 | 1075 | 0 | 3 | scrap=148 ferrous=104 nonferrous=91 wire=275 plates=210 data=72 | 9.9 |
| 5 | 8 | 1056 | 0 | 3 | scrap=152 nonferrous=94 ferrous=108 steel=5 copper=5 polymer=5 wire=270 plates=204 circuits=5 data=52 | 9.8 |
| 10 | 8 | 1018 | 0 | 3 | scrap=182 nonferrous=93 ferrous=107 steel=10 copper=10 polymer=10 wire=259 plates=193 circuits=16 data=20 | 9.3 |
| 20 | 8 | 1103 | 0 | 3 | scrap=95 nonferrous=20 ferrous=99 steel=20 wire=428 polymer=20 plates=168 circuits=8 data=42 | 12.5 |

## Floor 0

After 798 ticks, 5 links:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 2 | 16.1 |
| 2 | machine1 | store0 | ferrous | 24 | 0 | 6.1 |
| 3 | machine1 | store0 | nonferrous | 24 | 1 | 13.5 |
| 4 | machine1 | machine2 | ferrous | 24 | 1 | 13.8 |
| 5 | machine2 | store0 | steel | 24 | 0 | 4.2 |

After 18298 ticks, 18 links and 8 machines:

| Link | From | To | Filter | Cap | In flight | Busy % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | store0 | machine1 | scrap | 24 | 0 | 12.2 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 37.8 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 9 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 8.7 |
| 5 | machine2 | store0 | steel | 24 | 1 | 19 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 3.2 |
| 7 | machine4 | machine3 | residue | 24 | 24 | 34.1 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 8.9 |
| 9 | machine4 | store0 | copper | 24 | 0 | 3.8 |
| 10 | store0 | machine5 | copper | 24 | 0 | 3.9 |
| 11 | machine5 | store0 | wire | 24 | 0 | 4.6 |
| 12 | store0 | machine6 | steel | 24 | 0 | 4.3 |
| 13 | machine6 | store0 | plates | 24 | 3 | 18 |
| 14 | store0 | machine7 | wire | 24 | 0 | 1.7 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 1.7 |
| 16 | machine7 | store0 | circuits | 24 | 0 | 3.6 |
| 17 | store0 | machine8 | circuits | 24 | 0 | 1.5 |
| 18 | machine8 | store0 | data | 24 | 0 | 2.5 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 99.9 | 431 | running | 10 | 0 |
| 2 | furnace | 1 | 34.1 | 143 | starved | 1 | 0 |
| 3 | polymerRecycler | 1 | 17.5 | 48 | starved | 22 | 0 |
| 4 | copperSeparator | 1 | 51.1 | 159 | outputFull | 10 | 1 |
| 5 | wireMill | 1 | 34.2 | 127 | starved | 0 | 0 |
| 6 | platePress | 1 | 25.3 | 71 | starved | 0 | 0 |
| 7 | circuitAssembler | 1 | 29.5 | 48 | starved | 10 | 0 |
| 8 | signalLab | 1 | 56.4 | 48 | starved | 0 | 0 |

Aggregate link utilisation 9.9 %; dead links: none.

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
| 1 | store0 | machine1 | scrap | 24 | 0 | 12.1 |
| 2 | machine1 | store0 | ferrous | 24 | 2 | 38.7 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 8.3 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 8.7 |
| 5 | machine2 | store0 | steel | 24 | 1 | 19.6 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 2.8 |
| 7 | machine4 | machine3 | residue | 24 | 24 | 33.5 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 8.9 |
| 9 | machine4 | store0 | copper | 24 | 0 | 3.8 |
| 10 | store0 | machine5 | copper | 24 | 0 | 3.7 |
| 11 | machine5 | store0 | wire | 24 | 0 | 3.8 |
| 12 | store0 | machine6 | steel | 24 | 0 | 4.2 |
| 13 | machine6 | store0 | plates | 24 | 0 | 17.4 |
| 14 | store0 | machine7 | wire | 24 | 0 | 1.5 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 1.4 |
| 16 | machine7 | store0 | circuits | 24 | 0 | 3 |
| 17 | store0 | machine8 | circuits | 24 | 0 | 1.3 |
| 18 | machine8 | store0 | data | 24 | 0 | 3.4 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 99.5 | 435 | running | 10 | 0 |
| 2 | furnace | 1 | 33.7 | 143 | starved | 1 | 0 |
| 3 | polymerRecycler | 1 | 17.4 | 48 | starved | 22 | 0 |
| 4 | copperSeparator | 1 | 49.8 | 159 | outputFull | 10 | 1 |
| 5 | wireMill | 1 | 31.8 | 122 | starved | 0 | 0 |
| 6 | platePress | 1 | 24 | 68 | starved | 1 | 0 |
| 7 | circuitAssembler | 1 | 25.2 | 43 | starved | 10 | 0 |
| 8 | signalLab | 1 | 43.5 | 38 | starved | 0 | 0 |

Aggregate link utilisation 9.8 %; dead links: none.

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
| 1 | store0 | machine1 | scrap | 24 | 0 | 12 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 37.3 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 8.3 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 8.7 |
| 5 | machine2 | store0 | steel | 24 | 0 | 18.6 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 2.9 |
| 7 | machine4 | machine3 | residue | 24 | 24 | 31.8 |
| 8 | store0 | machine4 | nonferrous | 24 | 0 | 9.1 |
| 9 | machine4 | store0 | copper | 24 | 0 | 3.7 |
| 10 | store0 | machine5 | copper | 24 | 0 | 3.5 |
| 11 | machine5 | store0 | wire | 24 | 0 | 3.8 |
| 12 | store0 | machine6 | steel | 24 | 0 | 4.1 |
| 13 | machine6 | store0 | plates | 24 | 2 | 16.5 |
| 14 | store0 | machine7 | wire | 24 | 0 | 1.3 |
| 15 | store0 | machine7 | polymer | 24 | 0 | 1.3 |
| 16 | machine7 | store0 | circuits | 24 | 0 | 0.5 |
| 17 | machine7 | machine8 | circuits | 24 | 0 | 0.8 |
| 18 | machine8 | store0 | data | 24 | 0 | 3.9 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 97.6 | 431 | running | 10 | 0 |
| 2 | furnace | 1 | 32.9 | 141 | running | 0 | 0 |
| 3 | polymerRecycler | 1 | 16.9 | 48 | starved | 22 | 0 |
| 4 | copperSeparator | 1 | 48.4 | 158 | outputFull | 10 | 1 |
| 5 | wireMill | 1 | 29 | 115 | starved | 0 | 0 |
| 6 | platePress | 1 | 22.2 | 65 | starved | 1 | 0 |
| 7 | circuitAssembler | 1 | 21.5 | 38 | starved | 10 | 0 |
| 8 | signalLab | 1 | 24.5 | 22 | starved | 0 | 0 |

Aggregate link utilisation 9.3 %; dead links: none.

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
| 1 | store0 | machine1 | scrap | 24 | 0 | 11.4 |
| 2 | machine1 | store0 | ferrous | 24 | 1 | 37.6 |
| 3 | machine1 | store0 | nonferrous | 24 | 0 | 7.8 |
| 4 | machine1 | machine2 | ferrous | 24 | 0 | 8.3 |
| 5 | machine2 | store0 | steel | 24 | 0 | 26.8 |
| 6 | machine3 | store0 | polymer | 24 | 0 | 8.3 |
| 7 | machine4 | store0 | wire | 24 | 24 | 41.5 |
| 8 | machine5 | machine3 | residue | 24 | 0 | 5.6 |
| 9 | machine5 | machine4 | copper | 24 | 0 | 6.6 |
| 10 | store0 | machine5 | nonferrous | 24 | 0 | 9.6 |
| 11 | store0 | machine6 | steel | 24 | 1 | 3.8 |
| 12 | machine6 | store0 | plates | 24 | 0 | 28.4 |
| 13 | store0 | machine7 | wire | 24 | 2 | 1.4 |
| 14 | store0 | machine7 | polymer | 24 | 0 | 1.4 |
| 15 | machine7 | store0 | circuits | 24 | 0 | 0.3 |
| 16 | machine7 | machine8 | circuits | 24 | 0 | 1.2 |
| 17 | machine8 | store0 | data | 24 | 0 | 12.6 |

| Machine | Blueprint | Level | Busy % | Batches | Status | Input buffer | Tray |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sorter | 1 | 95.4 | 409 | powerLimited | 10 | 0 |
| 2 | furnace | 1 | 33.7 | 134 | powerLimited | 0 | 0 |
| 3 | polymerRecycler | 1 | 22.2 | 62 | starved | 0 | 0 |
| 4 | wireMill | 1 | 46 | 182 | powerLimited | 3 | 0 |
| 5 | copperSeparator | 1 | 59.9 | 186 | powerLimited | 3 | 0 |
| 6 | platePress | 1 | 21.5 | 56 | starved | 1 | 0 |
| 7 | circuitAssembler | 1 | 25 | 41 | powerLimited | 8 | 0 |
| 8 | signalLab | 1 | 37.9 | 33 | starved | 0 | 0 |

Aggregate link utilisation 12.5 %; dead links: none.

