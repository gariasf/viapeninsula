desktop, tilted 45°: 6 runs, main (c9046fb5) against the branch (213-3d). ✗: over its limit. Gate: no budgeted check worse beyond the spread.

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | |
|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 100 | 266.7 ✗ | 233.3–517.4 | 241.8 ✗ | 233.3–242.1 | -24.9 | better |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 150 | 524.8 ✗ | 491.6–1101.3 | 508.8 ✗ | 482.4–516.8 | -16 | better |
| Cold load: the first Lines, ms | S2 | ≤ 600 | 1159 ✗ | 1067–1273 | 1074 ✗ | 1057–1094 | -85 | better |
| Cold load: the first Trains, ms | S2 | ≤ 1000 | 998 | 922–1075 | 930 | 916–949 | -68 | better |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 100 | 266.7 ✗ | 233.3–517.4 | 241.8 ✗ | 233.3–242.1 | -24.9 | better |
| Workers busy in a cold load's first 15 s, ms | S2 | ≤ 1500 | 6102 ✗ | 5706–6382 | 5665 ✗ | 5506–5674 | -437 | better |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 337 | 333–429 | 410 | 344–423 | +73 | worse, within the spread |

Each round, branch − main, and the runs:

| Scenario | Metric | Each round | Main's runs | Branch's runs |
|---|---|---|---|---|
| S2 | joinMaxGap | +8.5 -33.4 -275.3 | 233.3 266.7 517.4 | 241.8 233.3 242.1 |
| S2 | joinFrozen | +25.2 -42.4 -592.5 | 491.6 524.8 1101.3 | 516.8 482.4 508.8 |
| S2 | firstLines | -102 +7 -179 | 1159 1067 1273 | 1057 1074 1094 |
| S2 | firstTrains | -82 +8 -126 | 998 922 1075 | 916 930 949 |
| S2 | gapAfterLines | +8.5 -33.4 -275.3 | 233.3 266.7 517.4 | 241.8 233.3 242.1 |
| S2 | workerFirst15s | -32 -437 -876 | 5706 6102 6382 | 5674 5665 5506 |
| S2 | heapPeakMB | -6 +11 +73 | 429 333 337 | 423 344 410 |

Load averages (1, 5, 15 min), in order: S2 main #1 6.5 5.5 5.8; S2 branch #1 5.8 5.5 5.7; S2 main #2 7.4 6.0 5.9; S2 branch #2 6.4 5.9 5.9; S2 main #3 6.5 6.0 5.9; S2 branch #3 5.0 5.6 5.8

Errors: none
