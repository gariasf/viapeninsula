phone: wt-828-main → wt-828, 30 runs

| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |
|---|---|---|---|---|---|---|
| S5bcn | restMainMsPerS | 482.5 (454–500) | 491.5 (482–502) | +9 | +13 +48 +2 -8 +6 +19 | worse, within spread (noise) |
| S5bcn | restFps | 116.9 (115.5–118.1) | 116.1 (114.8–117.8) | -0.8 | +0.3 -1.6 -0.1 -0.4 -1.7 -0.5 | worse, within spread (noise) |
| S5bcn | restExtraRedrawsPerS | 12.3 (11–13.2) | 12.1 (9.6–13) | -0.2 | +0.4 -0.7 -0.8 -1.8 -2.3 +1.1 | better |
| S5bcn | heapPeakMB | 316 (287–373) | 392 (287–402) | +76 | +115 +90 +7 -81 +69 +83 | worse, within spread (noise) |
| S5z13 | restMainMsPerS | 863 (834–932) | 891.5 (841–947) | +28.5 | +46 +35 +15 -5 +16 +7 | worse, within spread (noise) |
| S5z13 | restFps | 95.7 (76.4–108.6) | 86.2 (72.9–106.3) | -9.5 | -18.8 -11 -3.5 +2.5 -7.9 -2.3 | worse, within spread (noise) |
| S5z13 | restExtraRedrawsPerS | 22.7 (21.1–23.6) | 23.2 (21.1–23.6) | +0.6 | +0.8 -0.3 0 +0.5 +0.9 -0.2 | worse, within spread (noise) |
| S5z13 | heapPeakMB | 345.5 (273–358) | 359.5 (292–368) | +14 | +66 -52 -3 +94 -3 +17 | worse, within spread (noise) |
| S8 | followMainMsPerS | 996 (995–996) | 996 (995–996) | 0 | 0 0 0 | same |
| S8 | followFps | 37.2 (35.9–37.8) | 36.5 (34.9–37.8) | -0.7 | +1.9 -2.3 -1.3 | worse, within spread (noise) |
| S8 | heapPeakMB | 758 (614–783) | 643 (600–784) | -115 | +26 -183 +29 | better |

Runs (in order): S5bcn main #1 load 3.4 8.5 7.9; S5bcn branch #1 load 3.5 7.3 7.5; S5bcn main #2 load 4.8 6.8 7.3; S5bcn branch #2 load 6.0 6.9 7.3; S5bcn main #3 load 4.6 6.2 7.0; S5bcn branch #3 load 3.8 5.6 6.7; S5z13 main #1 load 5.0 5.5 6.6; S5z13 branch #1 load 3.2 4.9 6.3; S5z13 main #2 load 6.9 5.9 6.5; S5z13 branch #2 load 4.5 5.4 6.3; S5z13 main #3 load 9.1 6.3 6.5; S5z13 branch #3 load 15.3 8.9 7.5; S8 main #1 load 8.3 8.2 7.3; S8 branch #1 load 4.8 7.3 7.0; S8 main #2 load 4.2 6.6 6.8; S8 branch #2 load 3.8 6.0 6.6; S8 main #3 load 4.9 5.9 6.5; S8 branch #3 load 5.4 5.8 6.4; S5z13 main #1 load 6.1 5.4 6.1; S5z13 branch #1 load 6.2 6.1 6.3; S5z13 main #2 load 4.0 5.4 6.0; S5z13 branch #2 load 3.7 5.1 5.9; S5z13 main #3 load 4.5 5.1 5.8; S5z13 branch #3 load 4.4 4.9 5.7; S5bcn main #1 load 4.4 4.8 5.5; S5bcn branch #1 load 4.4 4.7 5.5; S5bcn main #2 load 4.6 4.7 5.4; S5bcn branch #2 load 3.7 4.4 5.2; S5bcn main #3 load 4.0 4.4 5.1; S5bcn branch #3 load 7.8 5.7 5.6
Errors: none
