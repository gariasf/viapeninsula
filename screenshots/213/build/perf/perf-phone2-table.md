phone, flat: 12 runs, main (c9046fb5) against the branch (213-3d). ✗: over its limit. Gate: no budgeted check worse beyond the spread.

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | |
|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 300 | 924.2 ✗ | 916.7–942.4 | 949.1 ✗ | 916.7–949.6 | +24.9 | worse, within the spread |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 600 | 2266.6 ✗ | 2225.1–2267.4 | 2274.4 ✗ | 2225–2333.4 | +7.8 | worse, within the spread |
| Cold load: the first Lines, ms | S2 | ≤ 1500 | 2327 ✗ | 2313–2505 | 2300 ✗ | 2258–2404 | -27 | better |
| Cold load: the first Trains, ms | S2 | ≤ 2500 | 2076 | 2055–2246 | 2099 | 2042–2143 | +23 | worse, within the spread |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 300 | 924.2 ✗ | 916.7–942.4 | 949.1 ✗ | 916.7–949.6 | +24.9 | worse, within the spread |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 362 | 335–385 | 349 | 343–371 | -13 | better |
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 300 | 975.5 ✗ | 927.1–1008.6 | 951.7 ✗ | 951.6–1016.8 | -23.8 | better |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 600 | 1917.3 ✗ | 1885–2041.1 | 1835.2 ✗ | 1818.4–1941.7 | -82.1 | better |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 100 | 108.9 ✗ | 100.9–166.6 | 91.7 | 90.5–99.9 | -17.2 | better |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 300 | 207 | 207–207 | 207 | 207–207 | 0 | same |
| JS heap's peak, garbage included, MB (not budgeted) | S3 |  | 484 | 482–562 | 550 | 549–579 | +66 | worse, within the spread |

Each round, branch − main, and the runs:

| Scenario | Metric | Each round | Main's runs | Branch's runs |
|---|---|---|---|---|
| S2 | joinMaxGap | 0 +7.2 +24.9 | 916.7 942.4 924.2 | 916.7 949.6 949.1 |
| S2 | joinFrozen | -0.1 +7.8 +66 | 2225.1 2266.6 2267.4 | 2225 2274.4 2333.4 |
| S2 | firstLines | +91 -247 -27 | 2313 2505 2327 | 2404 2258 2300 |
| S2 | firstTrains | +88 -204 +23 | 2055 2246 2076 | 2143 2042 2099 |
| S2 | gapAfterLines | 0 +7.2 +24.9 | 916.7 942.4 924.2 | 916.7 949.6 949.1 |
| S2 | heapPeakMB | +9 +14 -42 | 362 335 385 | 371 349 343 |
| S3 | joinMaxGap | -23.8 +24.5 +8.2 | 975.5 927.1 1008.6 | 951.7 951.6 1016.8 |
| S3 | joinFrozen | -82.1 -66.6 -99.4 | 1917.3 1885 2041.1 | 1835.2 1818.4 1941.7 |
| S3 | stepMaxGap | -74.9 -10.4 -9 | 166.6 100.9 108.9 | 91.7 90.5 99.9 |
| S3 | heapMB | 0 0 0 | 207 207 207 | 207 207 207 |
| S3 | heapPeakMB | +95 -12 +67 | 484 562 482 | 579 550 549 |

Load averages (1, 5, 15 min), in order: S2 main #1 3.2 3.8 4.1; S2 branch #1 5.2 4.2 4.2; S2 main #2 5.5 4.3 4.3; S2 branch #2 4.0 4.1 4.2; S2 main #3 3.1 3.9 4.1; S2 branch #3 2.7 3.7 4.0; S3 main #1 2.5 3.3 3.8; S3 branch #1 1.9 2.8 3.6; S3 main #2 1.6 2.4 3.3; S3 branch #2 2.2 2.4 3.2; S3 main #3 4.6 3.4 3.5; S3 branch #3 3.5 3.3 3.4

Errors: none
