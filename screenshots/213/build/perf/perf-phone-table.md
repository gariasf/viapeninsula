phone, flat: 24 runs, main (c9046fb5) against the branch (213-3d). ✗: over its limit. Gate: no budgeted check worse beyond the spread.

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | |
|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 300 | 967.2 ✗ | 949.8–1025.8 | 1008.2 ✗ | 1000.7–1008.4 | +41 | worse, within the spread |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 600 | 2442.4 ✗ | 2383.8–2967.3 | 2516.8 ✗ | 2466.8–2532.3 | +74.4 | worse, within the spread |
| Cold load: the first Lines, ms | S2 | ≤ 1500 | 2439 ✗ | 2418–2540 | 2401 ✗ | 2303–2841 | -38 | better |
| Cold load: the first Trains, ms | S2 | ≤ 2500 | 2197 | 2170–2229 | 2172 | 2089–2537 | -25 | better |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 300 | 967.2 ✗ | 949.8–1025.8 | 1008.2 ✗ | 1000.7–1008.4 | +41 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 355 | 327–382 | 308 | 294–324 | -47 | better |
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 300 | 1007.5 ✗ | 966.7–1008.1 | 967.5 ✗ | 959.1–1083.4 | -40 | better |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 600 | 1999.9 ✗ | 1941.6–2306.3 | 2133.1 ✗ | 1909.1–2292.4 | +133.2 | worse, within the spread |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 100 | 142.6 ✗ | 115.7–191.6 | 100.9 ✗ | 100–150 | -41.7 | better |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 300 | 207 | 207–207 | 207 | 207–207 | 0 | same |
| JS heap's peak, garbage included, MB (not budgeted) | S3 |  | 510 | 479–558 | 541 | 514–563 | +31 | worse, within the spread |
| At rest: main thread, ms/s | S5bcn | ≤ 400 | 470 ✗ | 460–515 | 478 ✗ | 438–508 | +8 | worse, within the spread |
| At rest: MapLibre's redraws beyond the Trains' draws, /s | S5bcn | ≤ 2 | 11.9 ✗ | 7.9–12.7 | 11.2 ✗ | 10.7–11.8 | -0.7 | better |
| JS heap's peak, garbage included, MB (not budgeted) | S5bcn |  | 373 | 346–399 | 309 | 298–309 | -64 | better |
| Following a Train: main thread, ms/s | S8 | ≤ 700 | 995 ✗ | 995–995 | 995 ✗ | 995–995 | 0 | same |
| Following a Train: fps | S8 | ≥ 55 | 37.9 ✗ | 35.8–42.2 | 38.6 ✗ | 34.9–39.6 | +0.7 | better |
| JS heap's peak, garbage included, MB (not budgeted) | S8 |  | 606 | 605–619 | 643 | 613–651 | +37 | worse, within the spread |

Each round, branch − main, and the runs:

| Scenario | Metric | Each round | Main's runs | Branch's runs |
|---|---|---|---|---|
| S2 | joinMaxGap | +41.2 +58.4 -25.1 | 967.2 949.8 1025.8 | 1008.4 1008.2 1000.7 |
| S2 | joinFrozen | +89.9 +133 -500.5 | 2442.4 2383.8 2967.3 | 2532.3 2516.8 2466.8 |
| S2 | firstLines | -136 -17 +301 | 2439 2418 2540 | 2303 2401 2841 |
| S2 | firstTrains | -81 -25 +308 | 2170 2197 2229 | 2089 2172 2537 |
| S2 | gapAfterLines | +41.2 +58.4 -25.1 | 967.2 949.8 1025.8 | 1008.4 1008.2 1000.7 |
| S2 | heapPeakMB | -31 -88 -19 | 355 382 327 | 324 294 308 |
| S3 | joinMaxGap | +116.7 -40 -49 | 966.7 1007.5 1008.1 | 1083.4 967.5 959.1 |
| S3 | joinFrozen | +191.5 -397.2 +292.5 | 1941.6 2306.3 1999.9 | 2133.1 1909.1 2292.4 |
| S3 | stepMaxGap | -91.6 +7.4 -14.8 | 191.6 142.6 115.7 | 100 150 100.9 |
| S3 | heapMB | 0 0 0 | 207 207 207 | 207 207 207 |
| S3 | heapPeakMB | -17 +84 +4 | 558 479 510 | 541 563 514 |
| S5bcn | restMainMsPerS | -7 +8 -22 | 515 470 460 | 508 478 438 |
| S5bcn | restExtraRedrawsPerS | +2.8 -0.7 -0.9 | 7.9 11.9 12.7 | 10.7 11.2 11.8 |
| S5bcn | heapPeakMB | -64 -48 -90 | 373 346 399 | 309 298 309 |
| S8 | followMainMsPerS | 0 0 0 | 995 995 995 | 995 995 995 |
| S8 | followFps | -2.6 -0.9 +0.7 | 42.2 35.8 37.9 | 39.6 34.9 38.6 |
| S8 | heapPeakMB | +38 +32 +7 | 605 619 606 | 643 651 613 |

Load averages (1, 5, 15 min), in order: S2 main #1 4.7 4.9 4.7; S2 branch #1 3.9 4.7 4.6; S2 main #2 4.6 4.8 4.7; S2 branch #2 4.2 4.7 4.6; S2 main #3 10.0 5.9 5.1; S2 branch #3 9.5 6.2 5.2; S3 main #1 5.6 5.7 5.1; S3 branch #1 3.5 4.9 4.9; S3 main #2 4.3 4.7 4.8; S3 branch #2 4.4 4.5 4.7; S3 main #3 3.3 4.2 4.5; S3 branch #3 3.7 3.9 4.4; S5bcn main #1 5.7 4.5 4.5; S5bcn branch #1 7.5 5.3 4.9; S5bcn main #2 6.6 6.1 5.2; S5bcn branch #2 5.0 5.7 5.1; S5bcn main #3 3.0 4.9 4.9; S5bcn branch #3 4.4 5.0 5.0; S8 main #1 3.1 4.5 4.8; S8 branch #1 2.9 4.2 4.6; S8 main #2 3.5 4.1 4.6; S8 branch #2 6.5 4.9 4.8; S8 main #3 4.7 4.6 4.7; S8 branch #3 4.8 4.7 4.7

Errors: none
