phone, tilted 45°: 18 runs, A, G, GL, against A (main, tilted). ✗: over its limit.

| Check | Scenario | Limit | A median (runs) | G (Δ against A) | GL (Δ against A) |
|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 300 | 1100.4 (949.7–1102.1) ✗ | 1033.6 (-66.8, better) ✗ | 1092.7 (-7.7, better) ✗ |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 600 | 2183.3 (1991–2294.7) ✗ | 2186.5 (+3.2, worse, noise) ✗ | 2083.3 (-100, better) ✗ |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 100 | 116.5 (107.9–234.8) ✗ | 108.6 (-7.9, better) ✗ | 123.5 (+7, worse, noise) ✗ |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 300 | 214 (213–214) | 213 (-1, better) | 214 (0, same) |
| JS heap's peak, garbage included, MB (not budgeted) | S3 |  | 494 (466–563) | 575 (+81, worse, noise) | 499 (+5, worse, noise) |
| A zoom or pan step with no join: longest gap, ms | S4 | ≤ 100 | 17.4 (16.8–24.9) | 18.4 (+1, worse, noise) | 18.5 (+1.1, worse, noise) |
| JS heap's peak, garbage included, MB (not budgeted) | S4 |  | 227 (219–238) | 249 (+22, worse, noise) | 242 (+15, **WORSE**) |

Each round, variant − A, in the batch's order, and the runs:

| Scenario | Metric | Variant | Each round | Variant's runs | A's runs |
|---|---|---|---|---|---|
| S3 | joinMaxGap | G | +61.6 -2.5 -66.8 | 1011.3 1099.6 1033.6 | 949.7 1102.1 1100.4 |
| S3 | joinMaxGap | GL | +143 -86 -1.5 | 1092.7 1016.1 1098.9 | 949.7 1102.1 1100.4 |
| S3 | joinFrozen | G | -38.1 +526.1 +3.2 | 1952.9 2820.8 2186.5 | 1991 2294.7 2183.3 |
| S3 | joinFrozen | GL | +92.3 -212.9 +25.3 | 2083.3 2081.8 2208.6 | 1991 2294.7 2183.3 |
| S3 | stepMaxGap | G | +0.7 -132.9 +166.1 | 108.6 101.9 282.6 | 107.9 234.8 116.5 |
| S3 | stepMaxGap | GL | +47.1 -126.6 +7 | 155 108.2 123.5 | 107.9 234.8 116.5 |
| S3 | heapMB | G | 0 0 -1 | 214 213 213 | 214 213 214 |
| S3 | heapMB | GL | 0 0 0 | 214 213 214 | 214 213 214 |
| S3 | heapPeakMB | G | +109 +61 +13 | 575 555 576 | 466 494 563 |
| S3 | heapPeakMB | GL | +95 +5 -88 | 561 499 475 | 466 494 563 |
| S4 | stepMaxGap | G | +1.6 +0 +0.5 | 18.4 24.9 17.9 | 16.8 24.9 17.4 |
| S4 | stepMaxGap | GL | +1.7 -8 +7.8 | 18.5 16.9 25.2 | 16.8 24.9 17.4 |
| S4 | heapPeakMB | G | +9 +30 +29 | 236 249 267 | 227 219 238 |
| S4 | heapPeakMB | GL | +14 +23 +12 | 241 242 250 | 227 219 238 |

Runs (in order): S3 A #1 load 4.2 5.3 6.0; S3 G #1 load 3.1 4.5 5.6; S3 GL #1 load 4.4 4.6 5.5; S3 A #2 load 5.2 5.1 5.5; S3 G #2 load 3.0 4.3 5.1; S3 GL #2 load 3.9 4.0 4.9; S3 A #3 load 5.9 4.7 5.0; S3 G #3 load 20.6 8.6 6.4; S3 GL #3 load 8.4 8.6 6.8; S4 A #1 load 6.6 8.1 6.7; S4 G #1 load 5.0 7.5 6.5; S4 GL #1 load 4.6 7.1 6.4; S4 A #2 load 4.3 6.8 6.3; S4 G #2 load 4.1 6.4 6.2; S4 GL #2 load 4.0 6.2 6.1; S4 A #3 load 3.3 5.7 6.0; S4 G #3 load 3.5 5.5 5.9; S4 GL #3 load 3.3 5.2 5.8
Errors: none
