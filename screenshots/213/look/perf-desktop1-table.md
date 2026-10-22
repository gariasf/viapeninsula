desktop, tilted 45°: 36 runs, A, G, L, GL, against A (main, tilted). ✗: over its limit.

| Check | Scenario | Limit | A median (runs) | G (Δ against A) | L (Δ against A) | GL (Δ against A) |
|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 100 | 316.6 (250–350) ✗ | 225 (-91.6, better) ✗ | 350 (+33.4, worse, noise) ✗ | 258.3 (-58.3, better) ✗ |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 150 | 758.4 (508.3–808.2) ✗ | 483.4 (-275, better) ✗ | 758.3 (-0.1, better) ✗ | 500.1 (-258.3, better) ✗ |
| Cold load: the first Lines, ms | S2 | ≤ 600 | 1252 (1160–1297) ✗ | 1041 (-211, better) ✗ | 1665 (+413, worse, noise) ✗ | 1071 (-181, better) ✗ |
| Cold load: the first Trains, ms | S2 | ≤ 1000 | 1082 (981–1134) ✗ | 895 (-187, better) | 1420 (+338, worse, noise) ✗ | 908 (-174, better) |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 100 | 316.6 (250–350) ✗ | 225 (-91.6, better) ✗ | 350 (+33.4, worse, noise) ✗ | 258.3 (-58.3, better) ✗ |
| Workers busy in a cold load's first 15 s, ms | S2 | ≤ 1500 | 7354 (6616–8396) ✗ | 5352 (-2002, better) ✗ | 7613 (+259, worse, noise) ✗ | 5834 (-1520, better) ✗ |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 414 (347–424) | 418 (+4, worse, noise) | 417 (+3, worse, noise) | 411 (-3, better) |
| At rest: main thread, ms/s | S5bcn | ≤ 100 | 325 (321–401) ✗ | 303 (-22, better) ✗ | 334 (+9, worse, noise) ✗ | 318 (-7, better) ✗ |
| At rest: MapLibre's redraws beyond the Trains' draws, /s | S5bcn | ≤ 2 | 21 (20.5–24.9) ✗ | 20.6 (-0.4, better) ✗ | 20.8 (-0.2, better) ✗ | 21.2 (+0.2, worse, noise) ✗ |
| JS heap's peak, garbage included, MB (not budgeted) | S5bcn |  | 346 (329–440) | 414 (+68, worse, noise) | 428 (+82, worse, noise) | 415 (+69, worse, noise) |
| Following a Train: main thread, ms/s | S8 | ≤ 400 | 978 (955–984) ✗ | 994 (+16, worse, noise) ✗ | 987 (+9, worse, noise) ✗ | 995 (+17, **WORSE**) ✗ |
| Following a Train: fps | S8 | ≥ 110 | 116.7 (114.4–118.4) | 111.9 (-4.8, worse, noise) | 114.4 (-2.3, worse, noise) | 110.7 (-6, **WORSE**) |
| JS heap's peak, garbage included, MB (not budgeted) | S8 |  | 568 (524–653) | 1123 (+555, **WORSE**) | 1164 (+596, worse, noise) | 1298 (+730, **WORSE**) |

Each round, variant − A, in the batch's order, and the runs:

| Scenario | Metric | Variant | Each round | Variant's runs | A's runs |
|---|---|---|---|---|---|
| S2 | joinMaxGap | G | -25 -125.4 -91.3 | 225 224.6 225.3 | 250 350 316.6 |
| S2 | joinMaxGap | L | +8.4 +16.6 +33.4 | 258.4 366.6 350 | 250 350 316.6 |
| S2 | joinMaxGap | GL | -0.6 -32.4 -58.3 | 249.4 317.6 258.3 | 250 350 316.6 |
| S2 | joinFrozen | G | -24.9 -324.9 -274.8 | 483.4 483.3 483.6 | 508.3 808.2 758.4 |
| S2 | joinFrozen | L | +50.1 +25.2 -0.1 | 558.4 833.4 758.3 | 508.3 808.2 758.4 |
| S2 | joinFrozen | GL | -8.2 -190.2 -258.4 | 500.1 618 500 | 508.3 808.2 758.4 |
| S2 | firstLines | G | -128 -256 -181 | 1032 1041 1071 | 1160 1297 1252 |
| S2 | firstLines | L | +57 +368 +622 | 1217 1665 1874 | 1160 1297 1252 |
| S2 | firstLines | GL | -89 -158 -210 | 1071 1139 1042 | 1160 1297 1252 |
| S2 | firstTrains | G | -88 -239 -185 | 893 895 897 | 981 1134 1082 |
| S2 | firstTrains | L | +13 +286 +510 | 994 1420 1592 | 981 1134 1082 |
| S2 | firstTrains | GL | -73 -195 -207 | 908 939 875 | 981 1134 1082 |
| S2 | gapAfterLines | G | -25 -125.4 -91.3 | 225 224.6 225.3 | 250 350 316.6 |
| S2 | gapAfterLines | L | +8.4 +16.6 +33.4 | 258.4 366.6 350 | 250 350 316.6 |
| S2 | gapAfterLines | GL | -0.6 -32.4 -58.3 | 249.4 317.6 258.3 | 250 350 316.6 |
| S2 | workerFirst15s | G | -1264 -2839 -2096 | 5352 5557 5258 | 6616 8396 7354 |
| S2 | workerFirst15s | L | +997 +224 -101 | 7613 8620 7253 | 6616 8396 7354 |
| S2 | workerFirst15s | GL | -782 -1154 -1867 | 5834 7242 5487 | 6616 8396 7354 |
| S2 | heapPeakMB | G | -17 +71 0 | 397 418 424 | 414 347 424 |
| S2 | heapPeakMB | L | +23 +70 -8 | 437 417 416 | 414 347 424 |
| S2 | heapPeakMB | GL | +15 +60 -13 | 429 407 411 | 414 347 424 |
| S5bcn | restMainMsPerS | G | -18 -8 -103 | 303 317 298 | 321 325 401 |
| S5bcn | restMainMsPerS | L | -15 +46 -67 | 306 371 334 | 321 325 401 |
| S5bcn | restMainMsPerS | GL | -13 +62 -83 | 308 387 318 | 321 325 401 |
| S5bcn | restExtraRedrawsPerS | G | +0.1 +0.1 -4.6 | 20.6 21.1 20.3 | 20.5 21 24.9 |
| S5bcn | restExtraRedrawsPerS | L | -0.2 +1.8 -4.1 | 20.3 22.8 20.8 | 20.5 21 24.9 |
| S5bcn | restExtraRedrawsPerS | GL | +0.7 +5.3 -3.8 | 21.2 26.3 21.1 | 20.5 21 24.9 |
| S5bcn | heapPeakMB | G | +85 +73 -26 | 414 419 414 | 329 346 440 |
| S5bcn | heapPeakMB | L | +93 +86 -12 | 422 432 428 | 329 346 440 |
| S5bcn | heapPeakMB | GL | +86 +108 -32 | 415 454 408 | 329 346 440 |
| S8 | followMainMsPerS | G | +10 +21 +16 | 994 976 994 | 984 955 978 |
| S8 | followMainMsPerS | L | +3 +18 +15 | 987 973 993 | 984 955 978 |
| S8 | followMainMsPerS | GL | +9 +40 +17 | 993 995 995 | 984 955 978 |
| S8 | followFps | G | -4.8 -2.5 -5.6 | 111.9 115.9 108.8 | 116.7 118.4 114.4 |
| S8 | followFps | L | -2.3 +0.4 -11.6 | 114.4 118.8 102.8 | 116.7 118.4 114.4 |
| S8 | followFps | GL | -3.8 -7.7 -13.4 | 112.9 110.7 101 | 116.7 118.4 114.4 |
| S8 | heapPeakMB | G | +1014 +360 +555 | 1667 884 1123 | 653 524 568 |
| S8 | heapPeakMB | L | +511 -1 +659 | 1164 523 1227 | 653 524 568 |
| S8 | heapPeakMB | GL | +1093 +711 +730 | 1746 1235 1298 | 653 524 568 |

Runs (in order): S2 A #1 load 12.6 10.5 10.1; S2 G #1 load 10.4 10.2 10.1; S2 L #1 load 16.0 12.0 10.7; S2 GL #1 load 13.9 11.9 10.7; S2 A #2 load 14.1 12.2 10.9; S2 G #2 load 11.3 11.7 10.8; S2 L #2 load 10.4 11.4 10.7; S2 GL #2 load 30.2 16.0 12.4; S2 A #3 load 21.7 15.6 12.4; S2 G #3 load 20.8 16.0 12.6; S2 L #3 load 20.2 16.4 12.9; S2 GL #3 load 17.1 16.0 12.9; S5bcn A #1 load 7.8 13.3 12.1; S5bcn G #1 load 10.7 12.7 12.0; S5bcn L #1 load 5.7 10.7 11.3; S5bcn GL #1 load 9.6 11.0 11.4; S5bcn A #2 load 5.9 9.5 10.7; S5bcn G #2 load 6.1 8.7 10.3; S5bcn L #2 load 7.2 8.4 10.1; S5bcn GL #2 load 8.5 8.6 10.0; S5bcn A #3 load 12.7 9.8 10.3; S5bcn G #3 load 7.4 8.9 9.9; S5bcn L #3 load 8.3 8.8 9.8; S5bcn GL #3 load 8.3 8.6 9.6; S8 A #1 load 8.1 8.5 9.5; S8 G #1 load 8.8 8.7 9.5; S8 L #1 load 7.0 8.3 9.3; S8 GL #1 load 6.7 8.0 9.1; S8 A #2 load 10.6 8.6 9.2; S8 G #2 load 10.9 9.1 9.4; S8 L #2 load 8.0 8.6 9.2; S8 GL #2 load 8.7 8.6 9.1; S8 A #3 load 10.0 9.0 9.2; S8 G #3 load 9.8 9.1 9.3; S8 L #3 load 10.3 9.5 9.4; S8 GL #3 load 15.7 11.3 10.1
Errors: none
