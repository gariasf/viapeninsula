desktop, tilted 45°: 18 runs, A, G, GL, against A (main, tilted). ✗: over its limit.

| Check | Scenario | Limit | A median (runs) | G (Δ against A) | GL (Δ against A) |
|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 100 | 259.1 (250.7–275.8) ✗ | 249.1 (-10, better) ✗ | 258.4 (-0.7, better) ✗ |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 150 | 617.6 (591.7–625.8) ✗ | 608.3 (-9.3, better) ✗ | 592.1 (-25.5, better) ✗ |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 34 | 33.4 (33.3–74) | 66.6 (+33.2, worse, noise) ✗ | 33.3 (-0.1, better) |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 500 | 222 (222–223) | 225 (+3, **WORSE**) | 225 (+3, **WORSE**) |
| JS heap's peak, garbage included, MB (not budgeted) | S3 |  | 510 (470–686) | 705 (+195, **WORSE**) | 724 (+214, worse, noise) |
| A join: longest gap, ms (S2's is long distance's, S6) | S4 | ≤ 100 | 183.4 (182.7–191.6) ✗ | 175.1 (-8.3, better) ✗ | 175.6 (-7.8, better) ✗ |
| A join: frozen ms (gaps over 50 ms, summed) | S4 | ≤ 150 | 266.6 (266–284.6) ✗ | 266.1 (-0.5, better) ✗ | 258.9 (-7.7, better) ✗ |
| A zoom or pan step with no join: longest gap, ms | S4 | ≤ 34 | 16.7 (16.6–16.8) | 16.6 (-0.1, better) | 17.1 (+0.4, worse, noise) |
| JS heap's peak, garbage included, MB (not budgeted) | S4 |  | 298 (294–406) | 334 (+36, worse, noise) | 324 (+26, worse, noise) |

Each round, variant − A, in the batch's order, and the runs:

| Scenario | Metric | Variant | Each round | Variant's runs | A's runs |
|---|---|---|---|---|---|
| S3 | joinMaxGap | G | -8.3 -1.6 -42.5 | 250.8 249.1 233.3 | 259.1 250.7 275.8 |
| S3 | joinMaxGap | GL | +16 +7.7 -42.5 | 275.1 258.4 233.3 | 259.1 250.7 275.8 |
| S3 | joinFrozen | G | +41.9 -17.5 -8.6 | 659.5 608.3 583.1 | 617.6 625.8 591.7 |
| S3 | joinFrozen | GL | +116.4 -33.7 -0.7 | 734 592.1 591 | 617.6 625.8 591.7 |
| S3 | stepMaxGap | G | +1.1 +33.3 -0.2 | 75.1 66.6 33.2 | 74 33.3 33.4 |
| S3 | stepMaxGap | GL | +1.6 +0 -0.4 | 75.6 33.3 33 | 74 33.3 33.4 |
| S3 | heapMB | G | +3 +2 +3 | 225 225 225 | 222 223 222 |
| S3 | heapMB | GL | +3 +2 +3 | 225 225 225 | 222 223 222 |
| S3 | heapPeakMB | G | +19 +187 +236 | 705 697 706 | 686 510 470 |
| S3 | heapPeakMB | GL | -14 +214 +313 | 672 724 783 | 686 510 470 |
| S4 | joinMaxGap | G | -8.4 +0.1 -16.5 | 175 182.8 175.1 | 183.4 182.7 191.6 |
| S4 | joinMaxGap | GL | -0.3 -7.8 -16 | 183.1 174.9 175.6 | 183.4 182.7 191.6 |
| S4 | joinFrozen | G | +8.6 +0.1 -26.1 | 275.2 266.1 258.5 | 266.6 266 284.6 |
| S4 | joinFrozen | GL | -0.2 -7.1 -33.8 | 266.4 258.9 250.8 | 266.6 266 284.6 |
| S4 | stepMaxGap | G | -0.1 -6.4 +1.2 | 16.6 10.4 17.8 | 16.7 16.8 16.6 |
| S4 | stepMaxGap | GL | -0.1 +0.3 +0.7 | 16.6 17.1 17.3 | 16.7 16.8 16.6 |
| S4 | heapPeakMB | G | +36 +63 -79 | 334 357 327 | 298 294 406 |
| S4 | heapPeakMB | GL | +26 +49 -105 | 324 343 301 | 298 294 406 |

Runs (in order): S3 A #1 load 9.9 7.2 5.6; S3 G #1 load 7.7 7.2 5.7; S3 GL #1 load 5.8 6.8 5.7; S3 A #2 load 7.0 6.9 5.8; S3 G #2 load 12.5 10.0 7.2; S3 GL #2 load 5.7 8.3 6.8; S3 A #3 load 11.8 9.4 7.3; S3 G #3 load 6.6 8.4 7.2; S3 GL #3 load 4.6 7.3 6.9; S4 A #1 load 4.4 7.0 6.8; S4 G #1 load 3.4 6.4 6.6; S4 GL #1 load 2.8 5.9 6.3; S4 A #2 load 5.2 6.1 6.4; S4 G #2 load 3.7 5.6 6.2; S4 GL #2 load 5.6 5.8 6.2; S4 A #3 load 8.4 6.6 6.5; S4 G #3 load 6.3 6.3 6.4; S4 GL #3 load 5.2 6.0 6.3
Errors: Failed to load resource: the server responded with a status of 404 ()
