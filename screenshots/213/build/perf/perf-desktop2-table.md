desktop, tilted 45°: 30 runs, main (c9046fb5) against the branch (213-3d). ✗: over its limit. Gate: 1 budgeted check(s) worse beyond the spread.

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | |
|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 100 | 233.4 ✗ | 232.8–234.1 | 233.5 ✗ | 233.5–259 | +0.1 | worse, within the spread |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 150 | 417.4 ✗ | 416.4–491.7 | 483.4 ✗ | 466.8–550.8 | +66 | worse, within the spread |
| Cold load: the first Lines, ms | S2 | ≤ 600 | 1063 ✗ | 1047–1117 | 1088 ✗ | 1015–2109 | +25 | worse, within the spread |
| Cold load: the first Trains, ms | S2 | ≤ 1000 | 911 | 896–977 | 953 | 870–1945 | +42 | worse, within the spread |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 100 | 233.4 ✗ | 232.8–234.1 | 233.5 ✗ | 233.5–259 | +0.1 | worse, within the spread |
| Workers busy in a cold load's first 15 s, ms | S2 | ≤ 1500 | 5479 ✗ | 5437–5592 | 5500 ✗ | 5400–5537 | +21 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 405 | 390–407 | 327 | 324–407 | -78 | better |
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 100 | 233.2 ✗ | 232.7–241.7 | 249.9 ✗ | 241.7–259.1 | +16.7 | **WORSE, beyond the spread** |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 150 | 608 ✗ | 600.2–625.7 | 608.8 ✗ | 601.7–624.8 | +0.8 | worse, within the spread |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 34 | 33.4 | 33.3–58.3 | 33.3 | 33.3–50 | -0.1 | better |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 500 | 222 | 222–222 | 222 | 222–222 | 0 | same |
| JS heap's peak, garbage included, MB (not budgeted) | S3 |  | 505 | 434–654 | 653 | 602–705 | +148 | worse, within the spread |
| A join: longest gap, ms (S2's is long distance's, S6) | S4 | ≤ 100 | 191.5 ✗ | 183.7–191.7 | 191.7 ✗ | 183.4–200 | +0.2 | worse, within the spread |
| A join: frozen ms (gaps over 50 ms, summed) | S4 | ≤ 150 | 283.3 ✗ | 283.2–291 | 283.2 ✗ | 275.1–291.6 | -0.1 | better |
| A zoom or pan step with no join: longest gap, ms | S4 | ≤ 34 | 17 | 16.8–32.5 | 16.7 | 16.3–16.8 | -0.3 | better |
| JS heap's peak, garbage included, MB (not budgeted) | S4 |  | 320 | 318–403 | 424 | 380–433 | +104 | worse, within the spread |
| At rest: main thread, ms/s | S5bcn | ≤ 100 | 323 ✗ | 320–332 | 323 ✗ | 319–324 | 0 | same |
| At rest: MapLibre's redraws beyond the Trains' draws, /s | S5bcn | ≤ 2 | 21.3 ✗ | 20.2–21.4 | 21.5 ✗ | 20.3–21.7 | +0.2 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S5bcn |  | 424 | 355–436 | 348 | 343–423 | -76 | better |
| Following a Train: main thread, ms/s | S8 | ≤ 400 | 882 ✗ | 877–914 | 888 ✗ | 888–904 | +6 | worse, within the spread |
| Following a Train: fps | S8 | ≥ 110 | 119.6 | 119.6–119.7 | 119.5 | 119.5–119.6 | -0.1 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S8 |  | 499 | 449–501 | 521 | 494–571 | +22 | worse, within the spread |

Each round, branch − main, and the runs:

| Scenario | Metric | Each round | Main's runs | Branch's runs |
|---|---|---|---|---|
| S2 | joinMaxGap | -0.6 +25.6 +0.7 | 234.1 233.4 232.8 | 233.5 259 233.5 |
| S2 | joinFrozen | +66 +134.4 -24.9 | 417.4 416.4 491.7 | 483.4 550.8 466.8 |
| S2 | firstLines | -48 +1062 -29 | 1063 1047 1117 | 1015 2109 1088 |
| S2 | firstTrains | -41 +1049 -24 | 911 896 977 | 870 1945 953 |
| S2 | gapAfterLines | -0.6 +25.6 +0.7 | 234.1 233.4 232.8 | 233.5 259 233.5 |
| S2 | workerFirst15s | +58 -192 +63 | 5479 5592 5437 | 5537 5400 5500 |
| S2 | heapPeakMB | +2 -83 -63 | 405 407 390 | 407 324 327 |
| S3 | joinMaxGap | +9 +16.7 +17.4 | 232.7 233.2 241.7 | 241.7 249.9 259.1 |
| S3 | joinFrozen | +0.8 -0.9 +1.5 | 608 625.7 600.2 | 608.8 624.8 601.7 |
| S3 | stepMaxGap | -25 -0.1 +16.7 | 58.3 33.4 33.3 | 33.3 33.3 50 |
| S3 | heapMB | 0 0 0 | 222 222 222 | 222 222 222 |
| S3 | heapPeakMB | -1 +271 +97 | 654 434 505 | 653 705 602 |
| S4 | joinMaxGap | +8.3 -0.3 +0.2 | 191.7 183.7 191.5 | 200 183.4 191.7 |
| S4 | joinFrozen | +8.3 -7.8 -8.1 | 283.3 291 283.2 | 291.6 283.2 275.1 |
| S4 | stepMaxGap | -15.8 +0 -0.7 | 32.5 16.8 17 | 16.7 16.8 16.3 |
| S4 | heapPeakMB | +115 +104 -23 | 318 320 403 | 433 424 380 |
| S5bcn | restMainMsPerS | -1 -9 +1 | 320 332 323 | 319 323 324 |
| S5bcn | restExtraRedrawsPerS | +0.1 +0.2 +0.3 | 20.2 21.3 21.4 | 20.3 21.5 21.7 |
| S5bcn | heapPeakMB | -13 -81 -7 | 436 424 355 | 423 343 348 |
| S8 | followMainMsPerS | -26 +22 +11 | 914 882 877 | 888 904 888 |
| S8 | followFps | 0 -0.2 -0.1 | 119.6 119.7 119.6 | 119.6 119.5 119.5 |
| S8 | heapPeakMB | +22 +122 -7 | 499 449 501 | 521 571 494 |

Load averages (1, 5, 15 min), in order: S2 main #1 5.5 5.4 5.8; S2 branch #1 5.1 5.3 5.8; S2 main #2 4.7 5.2 5.7; S2 branch #2 4.4 5.1 5.7; S2 main #3 3.9 4.9 5.6; S2 branch #3 3.9 4.8 5.5; S3 main #1 4.2 4.8 5.5; S3 branch #1 4.3 4.6 5.4; S3 main #2 6.6 5.5 5.6; S3 branch #2 4.2 5.0 5.4; S3 main #3 3.1 4.5 5.2; S3 branch #3 3.4 4.3 5.0; S4 main #1 3.2 4.1 4.9; S4 branch #1 3.4 4.0 4.9; S4 main #2 2.8 3.8 4.8; S4 branch #2 3.0 3.7 4.7; S4 main #3 2.8 3.6 4.6; S4 branch #3 2.5 3.4 4.5; S5bcn main #1 3.0 3.4 4.4; S5bcn branch #1 3.0 3.3 4.3; S5bcn main #2 3.4 3.3 4.2; S5bcn branch #2 2.8 3.2 4.1; S5bcn main #3 5.0 3.9 4.2; S5bcn branch #3 4.0 3.8 4.2; S8 main #1 8.4 4.8 4.5; S8 branch #1 5.2 4.5 4.4; S8 main #2 4.1 4.3 4.3; S8 branch #2 3.3 4.0 4.2; S8 main #3 4.7 4.2 4.3; S8 branch #3 3.8 4.0 4.2

Errors: none
