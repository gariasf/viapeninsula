desktop, tilted 45°: 30 runs, main (c9046fb5) against the branch (213-3d). ✗: over its limit. Gate: 1 budgeted check(s) worse beyond the spread.

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | |
|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 100 | 233.3 ✗ | 225–233.4 | 233.4 ✗ | 233.3–266.6 | +0.1 | worse, within the spread |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 150 | 466.7 ✗ | 465.9–490.8 | 475.1 ✗ | 475–508.4 | +8.4 | worse, within the spread |
| Cold load: the first Lines, ms | S2 | ≤ 600 | 1081 ✗ | 1071–1109 | 1051 ✗ | 1037–1094 | -30 | better |
| Cold load: the first Trains, ms | S2 | ≤ 1000 | 944 | 923–973 | 886 | 879–934 | -58 | better |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 100 | 233.3 ✗ | 225–233.4 | 233.4 ✗ | 233.3–266.6 | +0.1 | worse, within the spread |
| Workers busy in a cold load's first 15 s, ms | S2 | ≤ 1500 | 5473 ✗ | 5366–5497 | 5588 ✗ | 5478–5598 | +115 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 351 | 336–380 | 413 | 376–428 | +62 | worse, within the spread |
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 100 | 249.6 ✗ | 241.4–267.5 | 290.8 ✗ | 283.3–291.7 | +41.2 | **WORSE, beyond the spread** |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 150 | 616.8 ✗ | 616.5–631.9 | 633.2 ✗ | 593–633.9 | +16.4 | worse, within the spread |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 34 | 66.6 ✗ | 41.5–75.3 | 41.7 ✗ | 32.9–41.8 | -24.9 | better |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 500 | 222 | 222–222 | 222 | 222–223 | 0 | same |
| JS heap's peak, garbage included, MB (not budgeted) | S3 |  | 484 | 449–715 | 662 | 501–662 | +178 | worse, within the spread |
| A join: longest gap, ms (S2's is long distance's, S6) | S4 | ≤ 100 | 191.5 ✗ | 183.4–191.7 | 191.1 ✗ | 183.3–191.6 | -0.4 | better |
| A join: frozen ms (gaps over 50 ms, summed) | S4 | ≤ 150 | 274.8 ✗ | 267.3–275 | 275.5 ✗ | 274.9–283.3 | +0.7 | worse, within the spread |
| A zoom or pan step with no join: longest gap, ms | S4 | ≤ 34 | 17.2 | 16.8–33.8 | 16.7 | 16.6–17.3 | -0.5 | better |
| JS heap's peak, garbage included, MB (not budgeted) | S4 |  | 337 | 318–462 | 384 | 306–455 | +47 | worse, within the spread |
| At rest: main thread, ms/s | S5bcn | ≤ 100 | 332 ✗ | 323–335 | 329 ✗ | 328–332 | -3 | better |
| At rest: MapLibre's redraws beyond the Trains' draws, /s | S5bcn | ≤ 2 | 21.1 ✗ | 20.4–21.2 | 20.8 ✗ | 20.7–21 | -0.3 | better |
| JS heap's peak, garbage included, MB (not budgeted) | S5bcn |  | 349 | 338–437 | 347 | 334–423 | -2 | better |
| Following a Train: main thread, ms/s | S8 | ≤ 400 | 904 ✗ | 900–939 | 930 ✗ | 922–948 | +26 | worse, within the spread |
| Following a Train: fps | S8 | ≥ 110 | 119.3 | 116.9–119.7 | 119 | 118.3–119 | -0.3 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S8 |  | 559 | 468–610 | 596 | 569–601 | +37 | worse, within the spread |

Each round, branch − main, and the runs:

| Scenario | Metric | Each round | Main's runs | Branch's runs |
|---|---|---|---|---|
| S2 | joinMaxGap | 0 0 +41.6 | 233.4 233.3 225 | 233.4 233.3 266.6 |
| S2 | joinFrozen | +9.2 -15.8 +41.7 | 465.9 490.8 466.7 | 475.1 475 508.4 |
| S2 | firstLines | -34 -58 +13 | 1071 1109 1081 | 1037 1051 1094 |
| S2 | firstTrains | -44 -87 -10 | 923 973 944 | 879 886 934 |
| S2 | gapAfterLines | 0 0 +41.6 | 233.4 233.3 225 | 233.4 233.3 266.6 |
| S2 | workerFirst15s | -19 +115 +232 | 5497 5473 5366 | 5478 5588 5598 |
| S2 | heapPeakMB | +77 +48 +25 | 336 380 351 | 413 428 376 |
| S3 | joinMaxGap | +33.7 +50.3 +23.3 | 249.6 241.4 267.5 | 283.3 291.7 290.8 |
| S3 | joinFrozen | +17.1 +1.3 -23.5 | 616.8 631.9 616.5 | 633.9 633.2 593 |
| S3 | stepMaxGap | -33.7 +0.2 -33.5 | 66.6 41.5 75.3 | 32.9 41.7 41.8 |
| S3 | heapMB | 0 +1 0 | 222 222 222 | 222 223 222 |
| S3 | heapPeakMB | +213 -53 +17 | 449 715 484 | 662 662 501 |
| S4 | joinMaxGap | +8.2 -0.4 -8.4 | 183.4 191.5 191.7 | 191.6 191.1 183.3 |
| S4 | joinFrozen | +16 +0.7 -0.1 | 267.3 274.8 275 | 283.3 275.5 274.9 |
| S4 | stepMaxGap | -17.2 -0.5 +0.5 | 33.8 17.2 16.8 | 16.6 16.7 17.3 |
| S4 | heapPeakMB | -156 +47 +137 | 462 337 318 | 306 384 455 |
| S5bcn | restMainMsPerS | +6 0 -7 | 323 332 335 | 329 332 328 |
| S5bcn | restExtraRedrawsPerS | +0.4 -0.1 -0.5 | 20.4 21.1 21.2 | 20.8 21 20.7 |
| S5bcn | heapPeakMB | -103 +9 +74 | 437 338 349 | 334 347 423 |
| S8 | followMainMsPerS | +48 +26 -17 | 900 904 939 | 948 930 922 |
| S8 | followFps | -1 -0.7 +2.1 | 119.3 119.7 116.9 | 118.3 119 119 |
| S8 | heapPeakMB | +133 +10 -14 | 468 559 610 | 601 569 596 |

Load averages (1, 5, 15 min), in order: S2 main #1 3.1 3.6 3.7; S2 branch #1 3.1 3.5 3.7; S2 main #2 6.0 4.1 3.9; S2 branch #2 4.5 4.0 3.9; S2 main #3 6.4 4.5 4.1; S2 branch #3 5.0 4.3 4.0; S3 main #1 4.5 4.3 4.0; S3 branch #1 5.5 4.8 4.2; S3 main #2 5.0 4.8 4.3; S3 branch #2 3.7 4.5 4.2; S3 main #3 4.7 4.7 4.3; S3 branch #3 4.8 4.6 4.3; S4 main #1 4.0 4.5 4.3; S4 branch #1 3.8 4.4 4.2; S4 main #2 3.8 4.3 4.2; S4 branch #2 4.3 4.4 4.2; S4 main #3 3.7 4.2 4.2; S4 branch #3 5.1 4.5 4.3; S5bcn main #1 3.8 4.2 4.2; S5bcn branch #1 4.4 4.2 4.2; S5bcn main #2 6.0 5.0 4.5; S5bcn branch #2 5.6 5.3 4.7; S5bcn main #3 4.7 5.3 4.7; S5bcn branch #3 3.0 4.7 4.6; S8 main #1 4.1 4.8 4.6; S8 branch #1 4.8 4.8 4.6; S8 main #2 4.5 4.6 4.6; S8 branch #2 4.6 4.6 4.6; S8 main #3 5.9 4.9 4.7; S8 branch #3 5.1 5.0 4.7

Errors: none
