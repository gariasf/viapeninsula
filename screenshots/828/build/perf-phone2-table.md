phone: wt-828-main → wt-828, 12 runs

| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |
|---|---|---|---|---|---|---|
| S5z13 | restMainMsPerS | 854 (834–886) | 870 (841–881) | +16 | -5 +16 +7 | worse, within spread (noise) |
| S5z13 | restFps | 101.9 (88.3–108.6) | 94 (90.8–106.3) | -7.9 | +2.5 -7.9 -2.3 | worse, within spread (noise) |
| S5z13 | restExtraRedrawsPerS | 22.7 (22.5–23.6) | 23.4 (23–23.6) | +0.7 | +0.5 +0.9 -0.2 | worse, within spread (noise) |
| S5z13 | heapPeakMB | 347 (273–353) | 364 (350–367) | +17 | +94 -3 +17 | worse, within spread (noise) |
| S5bcn | restMainMsPerS | 485 (480–500) | 492 (491–499) | +7 | -8 +6 +19 | worse, within spread (noise) |
| S5bcn | restFps | 116.1 (115.5–116.5) | 115 (114.8–115.7) | -1.1 | -0.4 -1.7 -0.5 | worse, within spread (noise) |
| S5bcn | restExtraRedrawsPerS | 11.9 (11–12) | 10.2 (9.6–12.1) | -1.7 | -1.8 -2.3 +1.1 | better |
| S5bcn | heapPeakMB | 321 (311–368) | 390 (287–394) | +69 | -81 +69 +83 | worse, within spread (noise) |

Runs (in order): S5z13 main #1 load 6.1 5.4 6.1; S5z13 branch #1 load 6.2 6.1 6.3; S5z13 main #2 load 4.0 5.4 6.0; S5z13 branch #2 load 3.7 5.1 5.9; S5z13 main #3 load 4.5 5.1 5.8; S5z13 branch #3 load 4.4 4.9 5.7; S5bcn main #1 load 4.4 4.8 5.5; S5bcn branch #1 load 4.4 4.7 5.5; S5bcn main #2 load 4.6 4.7 5.4; S5bcn branch #2 load 3.7 4.4 5.2; S5bcn main #3 load 4.0 4.4 5.1; S5bcn branch #3 load 7.8 5.7 5.6
Errors: none
