phone: wt-828-main → wt-828, 6 runs

| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |
|---|---|---|---|---|---|---|
| S8 | followMainMsPerS | 996 (995–996) | 996 (995–997) | 0 | 0 -1 +2 | same |
| S8 | followFps | 33.3 (32.1–36.5) | 38 (33.5–39.5) | +4.7 | -3 +5.9 +6.2 | better |
| S8 | heapPeakMB | 663 (591–762) | 525 (508–707) | -138 | -55 -138 -83 | better |

Runs (in order): S8 main #1 load 3.3 5.3 6.8; S8 branch #1 load 4.3 5.3 6.7; S8 main #2 load 4.3 5.2 6.5; S8 branch #2 load 3.2 4.6 6.2; S8 main #3 load 3.8 4.6 6.1; S8 branch #3 load 3.5 4.3 5.9
Errors: none
