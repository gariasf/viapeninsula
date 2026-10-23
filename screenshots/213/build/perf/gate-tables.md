**Desktop 1440×900, tilted 45°**, main (c9046fb5) against the branch, 3 runs each alternated, medians and the runs' range:

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | | Run |
|---|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 100 | 266.7 ✗ | 233.3–517.4 | 241.8 ✗ | 233.3–242.1 | -24.9 | better | ab47758d, 23 Oct 13:43 |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 150 | 524.8 ✗ | 491.6–1101.3 | 508.8 ✗ | 482.4–516.8 | -16 | better | ab47758d, 23 Oct 13:43 |
| Cold load: the first Lines, ms | S2 | ≤ 600 | 1159 ✗ | 1067–1273 | 1074 ✗ | 1057–1094 | -85 | better | ab47758d, 23 Oct 13:43 |
| Cold load: the first Trains, ms | S2 | ≤ 1000 | 998 | 922–1075 | 930 | 916–949 | -68 | better | ab47758d, 23 Oct 13:43 |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 100 | 266.7 ✗ | 233.3–517.4 | 241.8 ✗ | 233.3–242.1 | -24.9 | better | ab47758d, 23 Oct 13:43 |
| Workers busy in a cold load's first 15 s, ms | S2 | ≤ 1500 | 6102 ✗ | 5706–6382 | 5665 ✗ | 5506–5674 | -437 | better | ab47758d, 23 Oct 13:43 |
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 100 | 250.1 ✗ | 242.6–257 | 241.3 ✗ | 233.6–257.5 | -8.8 | better | 4b136473, 23 Oct 13:27 |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 150 | 602.7 ✗ | 581.4–633.2 | 634.6 ✗ | 609.7–658.1 | +31.9 | worse, within the spread | 4b136473, 23 Oct 13:27 |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 34 | 41.9 ✗ | 33.4–67.8 | 42.9 ✗ | 33.4–150.6 | +1 | worse, within the spread | 4b136473, 23 Oct 13:27 |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 500 | 222 | 222–222 | 222 | 222–222 | 0 | same | 4b136473, 23 Oct 13:27 |
| A join: longest gap, ms (S2's is long distance's, S6) | S4 | ≤ 100 | 191.6 ✗ | 191.6–200 | 191.7 ✗ | 191.6–200 | +0.1 | worse, within the spread | 4b136473, 23 Oct 13:27 |
| A join: frozen ms (gaps over 50 ms, summed) | S4 | ≤ 150 | 291.6 ✗ | 275.9–299.5 | 283.1 ✗ | 275–283.4 | -8.5 | better | 4b136473, 23 Oct 13:27 |
| A zoom or pan step with no join: longest gap, ms | S4 | ≤ 34 | 16.7 | 16.7–25 | 16.7 | 16.7–24.9 | 0 | same | 4b136473, 23 Oct 13:27 |
| At rest: main thread, ms/s | S5bcn | ≤ 100 | 323 ✗ | 320–332 | 323 ✗ | 319–324 | 0 | same | 8d8979ce, 23 Oct 12:39 |
| At rest: MapLibre's redraws beyond the Trains' draws, /s | S5bcn | ≤ 2 | 21.3 ✗ | 20.2–21.4 | 21.5 ✗ | 20.3–21.7 | +0.2 | worse, within the spread | 8d8979ce, 23 Oct 12:39 |
| Following a Train: main thread, ms/s | S8 | ≤ 400 | 882 ✗ | 877–914 | 888 ✗ | 888–904 | +6 | worse, within the spread | 8d8979ce, 23 Oct 12:39 |
| Following a Train: fps | S8 | ≥ 110 | 119.6 | 119.6–119.7 | 119.5 | 119.5–119.6 | -0.1 | worse, within the spread | 8d8979ce, 23 Oct 12:39 |

**Phone 390×844, 4× CPU, flat**, main (c9046fb5) against the branch, 3 runs each alternated, medians and the runs' range:

| Check | Scenario | Limit | Main | Main's runs | Branch | Branch's runs | Δ | | Run |
|---|---|---|---|---|---|---|---|---|---|
| A join: longest gap, ms (S2's is long distance's, S6) | S2 | ≤ 300 | 924.2 ✗ | 916.7–942.4 | 949.1 ✗ | 916.7–949.6 | +24.9 | worse, within the spread | 8d8979ce, 23 Oct 13:08 |
| A join: frozen ms (gaps over 50 ms, summed) | S2 | ≤ 600 | 2266.6 ✗ | 2225.1–2267.4 | 2274.4 ✗ | 2225–2333.4 | +7.8 | worse, within the spread | 8d8979ce, 23 Oct 13:08 |
| Cold load: the first Lines, ms | S2 | ≤ 1500 | 2327 ✗ | 2313–2505 | 2300 ✗ | 2258–2404 | -27 | better | 8d8979ce, 23 Oct 13:08 |
| Cold load: the first Trains, ms | S2 | ≤ 2500 | 2076 | 2055–2246 | 2099 | 2042–2143 | +23 | worse, within the spread | 8d8979ce, 23 Oct 13:08 |
| Cold load: longest gap after the first Lines, ms | S2 | ≤ 300 | 924.2 ✗ | 916.7–942.4 | 949.1 ✗ | 916.7–949.6 | +24.9 | worse, within the spread | 8d8979ce, 23 Oct 13:08 |
| A join: longest gap, ms (S2's is long distance's, S6) | S3 | ≤ 300 | 975.5 ✗ | 927.1–1008.6 | 951.7 ✗ | 951.6–1016.8 | -23.8 | better | 8d8979ce, 23 Oct 13:08 |
| A join: frozen ms (gaps over 50 ms, summed) | S3 | ≤ 600 | 1917.3 ✗ | 1885–2041.1 | 1835.2 ✗ | 1818.4–1941.7 | -82.1 | better | 8d8979ce, 23 Oct 13:08 |
| A zoom or pan step with no join: longest gap, ms | S3 | ≤ 100 | 108.9 ✗ | 100.9–166.6 | 91.7 | 90.5–99.9 | -17.2 | better | 8d8979ce, 23 Oct 13:08 |
| JS heap after a forced GC, every region loaded, MB | S3 | ≤ 300 | 207 | 207–207 | 207 | 207–207 | 0 | same | 8d8979ce, 23 Oct 13:08 |
| At rest: main thread, ms/s | S5bcn | ≤ 400 | 470 ✗ | 460–515 | 478 ✗ | 438–508 | +8 | worse, within the spread | 42a349ac, 23 Oct 11:15 |
| At rest: MapLibre's redraws beyond the Trains' draws, /s | S5bcn | ≤ 2 | 11.9 ✗ | 7.9–12.7 | 11.2 ✗ | 10.7–11.8 | -0.7 | better | 42a349ac, 23 Oct 11:15 |
| Following a Train: main thread, ms/s | S8 | ≤ 700 | 995 ✗ | 995–995 | 995 ✗ | 995–995 | 0 | same | 42a349ac, 23 Oct 11:15 |
| Following a Train: fps | S8 | ≥ 55 | 37.9 ✗ | 35.8–42.2 | 38.6 ✗ | 34.9–39.6 | +0.7 | better | 42a349ac, 23 Oct 11:15 |

