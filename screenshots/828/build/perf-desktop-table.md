desktop: wt-828-main → wt-828, 18 runs

| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |
|---|---|---|---|---|---|---|
| S5bcn | restMainMsPerS | 244 (228–252) | 258 (232–265) | +14 | +4 +6 +21 | worse, within spread (noise) |
| S5bcn | restFps | 120 (120–120) | 120 (119.9–120) | 0 | 0 0 -0.1 | same |
| S5bcn | restExtraRedrawsPerS | 18.7 (18–19) | 19.2 (17–19.6) | +0.5 | -1 +0.2 +0.9 | worse, within spread (noise) |
| S5bcn | heapPeakMB | 347 (335–353) | 376 (351–425) | +29 | +41 +72 +4 | worse, within spread (noise) |
| S5z13 | restMainMsPerS | 374 (368–394) | 374 (374–384) | 0 | -10 0 +6 | same |
| S5z13 | restFps | 120 (120–120) | 120 (120–120) | 0 | 0 0 0 | same |
| S5z13 | restExtraRedrawsPerS | 29 (28.6–29.4) | 29 (29–29.8) | 0 | +0.4 0 +0.4 | same |
| S5z13 | heapPeakMB | 321 (310–326) | 348 (337–398) | +27 | +27 +72 +27 | WORSE, beyond spread |
| S8 | followMainMsPerS | 828 (794–860) | 818 (799–849) | -10 | -29 +55 -42 | better |
| S8 | followFps | 119.7 (119–119.8) | 119.6 (119.4–119.7) | -0.1 | -0.1 -0.1 +0.4 | worse, within spread (noise) |
| S8 | heapPeakMB | 562 (545–563) | 479 (477–561) | -83 | -83 -86 +16 | better |

Runs (in order): S5bcn main #1 load 3.4 4.4 5.0; S5bcn branch #1 load 3.4 4.2 4.9; S5bcn main #2 load 4.4 4.3 4.9; S5bcn branch #2 load 2.7 3.8 4.6; S5bcn main #3 load 3.3 3.8 4.6; S5bcn branch #3 load 3.1 3.6 4.4; S5z13 main #1 load 4.0 3.7 4.4; S5z13 branch #1 load 7.0 4.7 4.7; S5z13 main #2 load 17.6 8.6 6.2; S5z13 branch #2 load 7.8 7.6 6.0; S5z13 main #3 load 5.0 6.8 5.8; S5z13 branch #3 load 4.3 6.2 5.7; S8 main #1 load 5.8 6.1 5.7; S8 branch #1 load 4.1 5.6 5.5; S8 main #2 load 4.2 5.3 5.4; S8 branch #2 load 6.3 5.7 5.5; S8 main #3 load 4.9 5.5 5.5; S8 branch #3 load 5.5 5.7 5.6
Errors: none
