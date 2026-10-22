desktop: wt-828-main → wt-828, 18 runs

| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |
|---|---|---|---|---|---|---|
| S5bcn | restMainMsPerS | 240 (240–266) | 264 (250–268) | +24 | +24 +28 -16 | worse, within spread (noise) |
| S5bcn | restFps | 120 (119.7–120) | 120 (120–120) | 0 | 0 +0.3 0 | same |
| S5bcn | restExtraRedrawsPerS | 18.8 (18.3–20.1) | 19.3 (18.8–19.6) | +0.5 | +1.3 +0.5 -1.3 | worse, within spread (noise) |
| S5bcn | heapPeakMB | 336 (332–390) | 355 (292–392) | +19 | +56 -98 +23 | worse, within spread (noise) |
| S5z13 | restMainMsPerS | 368 (364–389) | 385 (384–391) | +17 | +21 -5 +23 | worse, within spread (noise) |
| S5z13 | restFps | 120 (120–120) | 120 (119.9–120) | 0 | 0 0 -0.1 | same |
| S5z13 | restExtraRedrawsPerS | 29.4 (28.4–29.6) | 29.9 (29.4–31) | +0.5 | +1 +0.3 +1.6 | worse, within spread (noise) |
| S5z13 | heapPeakMB | 333 (326–376) | 362 (320–396) | +29 | -56 +70 +29 | worse, within spread (noise) |
| S8 | followMainMsPerS | 823 (807–829) | 827 (812–848) | +4 | +4 +19 +5 | worse, within spread (noise) |
| S8 | followFps | 119.8 (119.5–119.9) | 119.7 (118.4–119.8) | -0.1 | -0.1 -1.1 -0.1 | worse, within spread (noise) |
| S8 | heapPeakMB | 568 (512–587) | 572 (540–575) | +4 | +28 +7 -15 | worse, within spread (noise) |

Runs (in order): S5bcn main #1 load 4.7 5.2 5.9; S5bcn branch #1 load 2.7 4.6 5.6; S5bcn main #2 load 2.8 4.2 5.4; S5bcn branch #2 load 2.8 3.9 5.2; S5bcn main #3 load 2.4 3.6 4.9; S5bcn branch #3 load 26.2 9.3 6.9; S5z13 main #1 load 24.2 12.2 8.2; S5z13 branch #1 load 12.4 11.3 8.2; S5z13 main #2 load 6.1 9.7 7.9; S5z13 branch #2 load 2.9 7.8 7.3; S5z13 main #3 load 2.5 6.5 6.8; S5z13 branch #3 load 23.4 12.9 9.3; S8 main #1 load 13.8 12.3 9.4; S8 branch #1 load 7.6 10.8 9.0; S8 main #2 load 7.8 10.2 8.9; S8 branch #2 load 11.3 10.4 9.1; S8 main #3 load 11.0 11.0 9.4; S8 branch #3 load 7.3 9.9 9.1
Errors: none
