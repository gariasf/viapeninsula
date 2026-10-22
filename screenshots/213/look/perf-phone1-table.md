phone, tilted 45°: 36 runs, A, G, L, GL, against A (main, tilted). ✗: over its limit.

| Check | Scenario | Limit | A median (runs) | G (Δ against A) | L (Δ against A) | GL (Δ against A) |
|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 300 | 1059 (1025.7–1091.7) ✗ | 1084 (+25, worse, noise) ✗ | 1075.4 (+16.4, worse, noise) ✗ | 1075 (+16, worse, noise) ✗ |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 600 | 2834.4 (2751.4–3276.3) ✗ | 3534.4 (+700, worse, noise) ✗ | 2984.2 (+149.8, worse, noise) ✗ | 3028.5 (+194.1, worse, noise) ✗ |
| Cold load: the first Lines, ms | S2 | ≤ 1500 | 2906 (2877–3033) ✗ | 3051 (+145, worse, noise) ✗ | 2927 (+21, worse, noise) ✗ | 3014 (+108, worse, noise) ✗ |
| Cold load: the first Trains, ms | S2 | ≤ 2500 | 2622 (2581–2718) ✗ | 2759 (+137, worse, noise) ✗ | 2588 (-34, better) ✗ | 2683 (+61, worse, noise) ✗ |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 300 | 1059 (1025.7–1091.7) ✗ | 1084 (+25, worse, noise) ✗ | 1075.4 (+16.4, worse, noise) ✗ | 1075 (+16, worse, noise) ✗ |
| JS heap's peak, garbage included, MB (not budgeted) | S2 |  | 304 (301–309) | 315 (+11, worse, noise) | 346 (+42, worse, noise) | 320 (+16, worse, noise) |
| At rest: main thread, ms/s | S5bcn | ≤ 400 | 902 (828–957) ✗ | 878 (-24, better) ✗ | 844 (-58, better) ✗ | 833 (-69, better) ✗ |
| At rest: MapLibre's redraws beyond the Trains' draws, /s | S5bcn | ≤ 2 | 16.4 (12.7–16.9) ✗ | 15.5 (-0.9, better) ✗ | 14 (-2.4, better) ✗ | 14.5 (-1.9, better) ✗ |
| JS heap's peak, garbage included, MB (not budgeted) | S5bcn |  | 377 (321–394) | 290 (-87, better) | 392 (+15, worse, noise) | 355 (-22, better) |
| Following a Train: main thread, ms/s | S8 | ≤ 700 | 994 (994–995) ✗ | 995 (+1, worse, noise) ✗ | 994 (0, same) ✗ | 995 (+1, worse, noise) ✗ |
| Following a Train: fps | S8 | ≥ 55 | 29.2 (23.5–36.3) ✗ | 25.9 (-3.3, worse, noise) ✗ | 28.1 (-1.1, worse, noise) ✗ | 24.7 (-4.5, worse, noise) ✗ |
| JS heap's peak, garbage included, MB (not budgeted) | S8 |  | 528 (437–530) | 501 (-27, better) | 569 (+41, worse, noise) | 432 (-96, better) |

Each round, variant − A, in the batch's order, and the runs:

| Scenario | Metric | Variant | Each round | Variant's runs | A's runs |
|---|---|---|---|---|---|
| S2 | joinMaxGap | G | +133 +25 -58.3 | 1158.7 1084 1033.4 | 1025.7 1059 1091.7 |
| S2 | joinMaxGap | L | -8.7 +16.4 +41 | 1017 1075.4 1132.7 | 1025.7 1059 1091.7 |
| S2 | joinMaxGap | GL | +149.4 -1.2 -16.7 | 1175.1 1057.8 1075 | 1025.7 1059 1091.7 |
| S2 | joinFrozen | G | +1067.9 +700 -375.5 | 3819.3 3534.4 2900.8 | 2751.4 2834.4 3276.3 |
| S2 | joinFrozen | L | +33.4 +149.8 +719.9 | 2784.8 2984.2 3996.2 | 2751.4 2834.4 3276.3 |
| S2 | joinFrozen | GL | +608.1 +43 -247.8 | 3359.5 2877.4 3028.5 | 2751.4 2834.4 3276.3 |
| S2 | firstLines | G | +292 +145 -99 | 3169 3051 2934 | 2877 2906 3033 |
| S2 | firstLines | L | -57 +21 +189 | 2820 2927 3222 | 2877 2906 3033 |
| S2 | firstLines | GL | +659 +108 -85 | 3536 3014 2948 | 2877 2906 3033 |
| S2 | firstTrains | G | +308 +137 -71 | 2889 2759 2647 | 2581 2622 2718 |
| S2 | firstTrains | L | -43 -34 +137 | 2538 2588 2855 | 2581 2622 2718 |
| S2 | firstTrains | GL | +574 +61 -85 | 3155 2683 2633 | 2581 2622 2718 |
| S2 | gapAfterLines | G | +133 +25 -58.3 | 1158.7 1084 1033.4 | 1025.7 1059 1091.7 |
| S2 | gapAfterLines | L | -8.7 +16.4 +41 | 1017 1075.4 1132.7 | 1025.7 1059 1091.7 |
| S2 | gapAfterLines | GL | +149.4 -1.2 -16.7 | 1175.1 1057.8 1075 | 1025.7 1059 1091.7 |
| S2 | heapPeakMB | G | -32 +11 +73 | 269 315 382 | 301 304 309 |
| S2 | heapPeakMB | L | +45 +87 -6 | 346 391 303 | 301 304 309 |
| S2 | heapPeakMB | GL | -22 +16 +19 | 279 320 328 | 301 304 309 |
| S5bcn | restMainMsPerS | G | -29 -75 +50 | 928 827 878 | 957 902 828 |
| S5bcn | restMainMsPerS | L | -24 -58 +3 | 933 844 831 | 957 902 828 |
| S5bcn | restMainMsPerS | GL | -102 -69 -43 | 855 833 785 | 957 902 828 |
| S5bcn | restExtraRedrawsPerS | G | +0.2 -3.3 +2.8 | 16.6 13.6 15.5 | 16.4 16.9 12.7 |
| S5bcn | restExtraRedrawsPerS | L | -1.1 -2.9 +0.2 | 15.3 14 12.9 | 16.4 16.9 12.7 |
| S5bcn | restExtraRedrawsPerS | GL | -1.4 -4 +1.8 | 15 12.9 14.5 | 16.4 16.9 12.7 |
| S5bcn | heapPeakMB | G | -46 -31 -129 | 331 290 265 | 377 321 394 |
| S5bcn | heapPeakMB | L | +39 +71 -89 | 416 392 305 | 377 321 394 |
| S5bcn | heapPeakMB | GL | -22 -40 +22 | 355 281 416 | 377 321 394 |
| S8 | followMainMsPerS | G | 0 +1 +1 | 995 995 995 | 995 994 994 |
| S8 | followMainMsPerS | L | 0 -1 0 | 995 993 994 | 995 994 994 |
| S8 | followMainMsPerS | GL | -1 +1 +1 | 994 995 995 | 995 994 994 |
| S8 | followFps | G | -5.9 +1.9 -3.3 | 30.4 25.4 25.9 | 36.3 23.5 29.2 |
| S8 | followFps | L | -4.2 +4.6 -1.3 | 32.1 28.1 27.9 | 36.3 23.5 29.2 |
| S8 | followFps | GL | -14.5 +1.2 -4.5 | 21.8 24.7 24.7 | 36.3 23.5 29.2 |
| S8 | heapPeakMB | G | +9 -95 +64 | 539 433 501 | 530 528 437 |
| S8 | heapPeakMB | L | +75 -22 +132 | 605 506 569 | 530 528 437 |
| S8 | heapPeakMB | GL | -72 -126 -5 | 458 402 432 | 530 528 437 |

Runs (in order): S2 A #1 load 11.5 10.7 9.9; S2 G #1 load 9.0 10.2 9.7; S2 L #1 load 7.7 9.8 9.6; S2 GL #1 load 7.4 9.5 9.5; S2 A #2 load 7.3 9.3 9.4; S2 G #2 load 6.8 8.9 9.3; S2 L #2 load 9.4 9.3 9.4; S2 GL #2 load 7.7 8.9 9.3; S2 A #3 load 5.7 8.3 9.0; S2 G #3 load 6.0 8.1 8.9; S2 L #3 load 7.1 8.2 9.0; S2 GL #3 load 7.4 8.2 8.9; S5bcn A #1 load 6.8 7.9 8.8; S5bcn G #1 load 5.6 7.4 8.5; S5bcn L #1 load 6.7 7.6 8.5; S5bcn GL #1 load 7.1 7.4 8.3; S5bcn A #2 load 5.2 6.8 8.0; S5bcn G #2 load 5.8 6.6 7.8; S5bcn L #2 load 5.6 6.4 7.6; S5bcn GL #2 load 6.8 6.4 7.5; S5bcn A #3 load 7.9 6.8 7.6; S5bcn G #3 load 5.8 6.5 7.4; S5bcn L #3 load 6.6 6.6 7.3; S5bcn GL #3 load 6.2 6.5 7.2; S8 A #1 load 6.4 6.5 7.2; S8 G #1 load 6.1 6.4 7.1; S8 L #1 load 5.9 6.2 6.9; S8 GL #1 load 18.2 9.2 8.0; S8 A #2 load 12.8 9.6 8.2; S8 G #2 load 8.5 9.1 8.1; S8 L #2 load 8.7 9.0 8.2; S8 GL #2 load 6.1 8.1 7.9; S8 A #3 load 4.4 7.2 7.6; S8 G #3 load 5.9 7.1 7.5; S8 L #3 load 6.8 7.0 7.4; S8 GL #3 load 6.3 7.0 7.4
Errors: none
