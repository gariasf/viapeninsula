desktop, tilted 45°: 18 runs, main (c9046fb5) against the branch (213-3d). ✗: over its limit. Gate: 1 budgeted check(s) worse beyond the spread.

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | |
|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 100 | 233.4 ✗ | 233.3–233.6 | 234.8 ✗ | 225–241.7 | +1.4 | worse, within the spread |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 150 | 466.7 ✗ | 458.6–476.4 | 492 ✗ | 491.6–506.8 | +25.3 | **WORSE, beyond the spread** |
| Cold load: the first Lines, ms | S2 | ≤ 600 | 1060 ✗ | 1041–1095 | 1100 ✗ | 1082–1118 | +40 | worse, within the spread |
| Cold load: the first Trains, ms | S2 | ≤ 1000 | 909 | 883–950 | 961 | 943–962 | +52 | worse, within the spread |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 100 | 233.4 ✗ | 233.3–233.6 | 234.8 ✗ | 225–241.7 | +1.4 | worse, within the spread |
| Workers busy in a cold load's first 15 s, ms | S2 | ≤ 1500 | 5503 ✗ | 5368–6265 | 5804 ✗ | 5460–5838 | +301 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 422 | 398–425 | 383 | 346–434 | -39 | better |
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 100 | 250.1 ✗ | 242.6–257 | 241.3 ✗ | 233.6–257.5 | -8.8 | better |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 150 | 602.7 ✗ | 581.4–633.2 | 634.6 ✗ | 609.7–658.1 | +31.9 | worse, within the spread |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 34 | 41.9 ✗ | 33.4–67.8 | 42.9 ✗ | 33.4–150.6 | +1 | worse, within the spread |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 500 | 222 | 222–222 | 222 | 222–222 | 0 | same |
| JS heap's peak, garbage included, MB (not budgeted) | S3 |  | 620 | 477–639 | 676 | 638–697 | +56 | worse, within the spread |
| A join: longest gap, ms (S2's is long distance's, S6) | S4 | ≤ 100 | 191.6 ✗ | 191.6–200 | 191.7 ✗ | 191.6–200 | +0.1 | worse, within the spread |
| A join: frozen ms (gaps over 50 ms, summed) | S4 | ≤ 150 | 291.6 ✗ | 275.9–299.5 | 283.1 ✗ | 275–283.4 | -8.5 | better |
| A zoom or pan step with no join: longest gap, ms | S4 | ≤ 34 | 16.7 | 16.7–25 | 16.7 | 16.7–24.9 | 0 | same |
| JS heap's peak, garbage included, MB (not budgeted) | S4 |  | 305 | 304–311 | 314 | 303–407 | +9 | worse, within the spread |

Each round, branch − main, and the runs:

| Scenario | Metric | Each round | Main's runs | Branch's runs |
|---|---|---|---|---|
| S2 | joinMaxGap | -8.4 +8.4 +1.2 | 233.4 233.3 233.6 | 225 241.7 234.8 |
| S2 | joinFrozen | +33 +40.1 +15.6 | 458.6 466.7 476.4 | 491.6 506.8 492 |
| S2 | firstLines | +41 +5 +58 | 1041 1095 1060 | 1082 1100 1118 |
| S2 | firstTrains | +60 +11 +53 | 883 950 909 | 943 961 962 |
| S2 | gapAfterLines | -8.4 +8.4 +1.2 | 233.4 233.3 233.6 | 225 241.7 234.8 |
| S2 | workerFirst15s | +335 +92 -461 | 5503 5368 6265 | 5838 5460 5804 |
| S2 | heapPeakMB | -39 -52 +9 | 422 398 425 | 383 346 434 |
| S3 | joinMaxGap | -1.3 -23.4 +7.4 | 242.6 257 250.1 | 241.3 233.6 257.5 |
| S3 | joinFrozen | +31.9 +28.3 +24.9 | 602.7 581.4 633.2 | 634.6 609.7 658.1 |
| S3 | stepMaxGap | -34.4 +1 +117.2 | 67.8 41.9 33.4 | 33.4 42.9 150.6 |
| S3 | heapMB | 0 0 0 | 222 222 222 | 222 222 222 |
| S3 | heapPeakMB | +199 -1 +77 | 477 639 620 | 676 638 697 |
| S4 | joinMaxGap | -8.3 +0 +8.4 | 200 191.6 191.6 | 191.7 191.6 200 |
| S4 | joinFrozen | -24.5 -8.5 +7.5 | 299.5 291.6 275.9 | 275 283.1 283.4 |
| S4 | stepMaxGap | 0 +8.2 -8.3 | 16.7 16.7 25 | 16.7 24.9 16.7 |
| S4 | heapPeakMB | -1 +96 +9 | 304 311 305 | 303 407 314 |

Load averages (1, 5, 15 min), in order: S2 main #1 5.4 7.5 5.5; S2 branch #1 7.7 7.9 5.7; S2 main #2 6.2 7.5 5.7; S2 branch #2 5.5 7.2 5.6; S2 main #3 17.5 9.9 6.7; S2 branch #3 12.9 9.5 6.6; S3 main #1 8.6 9.1 6.8; S3 branch #1 6.6 8.5 6.7; S3 main #2 5.8 7.8 6.6; S3 branch #2 3.4 6.6 6.3; S3 main #3 4.3 6.3 6.2; S3 branch #3 4.7 6.0 6.1; S4 main #1 6.6 6.2 6.1; S4 branch #1 6.6 6.4 6.2; S4 main #2 5.9 6.2 6.1; S4 branch #2 5.0 6.0 6.1; S4 main #3 5.3 5.9 6.0; S4 branch #3 4.1 5.5 5.9

Errors: none
