phone: wt-828-main → wt-828, 18 runs

| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |
|---|---|---|---|---|---|---|
| S5bcn | restMainMsPerS | 469 (454–486) | 488 (482–502) | +19 | +13 +48 +2 | worse, within spread (noise) |
| S5bcn | restFps | 117.5 (117.3–118.1) | 117.2 (116.5–117.8) | -0.3 | +0.3 -1.6 -0.1 | worse, within spread (noise) |
| S5bcn | restExtraRedrawsPerS | 12.9 (12.6–13.2) | 12.4 (12.2–13) | -0.5 | +0.4 -0.7 -0.8 | better |
| S5bcn | heapPeakMB | 308 (287–373) | 398 (380–402) | +90 | +115 +90 +7 | WORSE, beyond spread |
| S5z13 | restMainMsPerS | 870 (856–932) | 905 (902–947) | +35 | +46 +35 +15 | worse, within spread (noise) |
| S5z13 | restFps | 92.6 (76.4–98.7) | 79.9 (72.9–81.6) | -12.7 | -18.8 -11 -3.5 | worse, within spread (noise) |
| S5z13 | restExtraRedrawsPerS | 22.6 (21.1–23) | 22.7 (21.1–23.4) | +0.1 | +0.8 -0.3 0 | worse, within spread (noise) |
| S5z13 | heapPeakMB | 344 (302–358) | 355 (292–368) | +11 | +66 -52 -3 | worse, within spread (noise) |
| S8 | followMainMsPerS | 996 (995–996) | 996 (995–996) | 0 | 0 0 0 | same |
| S8 | followFps | 37.2 (35.9–37.8) | 36.5 (34.9–37.8) | -0.7 | +1.9 -2.3 -1.3 | worse, within spread (noise) |
| S8 | heapPeakMB | 758 (614–783) | 643 (600–784) | -115 | +26 -183 +29 | better |

Runs (in order): S5bcn main #1 load 3.4 8.5 7.9; S5bcn branch #1 load 3.5 7.3 7.5; S5bcn main #2 load 4.8 6.8 7.3; S5bcn branch #2 load 6.0 6.9 7.3; S5bcn main #3 load 4.6 6.2 7.0; S5bcn branch #3 load 3.8 5.6 6.7; S5z13 main #1 load 5.0 5.5 6.6; S5z13 branch #1 load 3.2 4.9 6.3; S5z13 main #2 load 6.9 5.9 6.5; S5z13 branch #2 load 4.5 5.4 6.3; S5z13 main #3 load 9.1 6.3 6.5; S5z13 branch #3 load 15.3 8.9 7.5; S8 main #1 load 8.3 8.2 7.3; S8 branch #1 load 4.8 7.3 7.0; S8 main #2 load 4.2 6.6 6.8; S8 branch #2 load 3.8 6.0 6.6; S8 main #3 load 4.9 5.9 6.5; S8 branch #3 load 5.4 5.8 6.4
Errors: none
