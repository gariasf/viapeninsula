phone: wt-828-main → wt-828, 24 runs

| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |
|---|---|---|---|---|---|---|
| S5z13 | restMainMsPerS | 815 (766–834) | 844 (805–887) | +29 | +53 +27 +39 +42 +28 +22 | worse, within spread (noise) |
| S5z13 | restFps | 108.8 (103.4–116.2) | 104 (93.1–112.4) | -4.8 | -13.3 -4.9 -3.8 -10.3 -2.1 -2.7 | worse, within spread (noise) |
| S5z13 | restExtraRedrawsPerS | 22.1 (20.5–22.9) | 21.8 (20.3–23) | -0.4 | -0.4 +0.1 +1.2 -2 +0.5 -0.2 | better |
| S5z13 | heapPeakMB | 345.5 (294–354) | 346.5 (302–375) | +1 | +42 +17 +12 -14 +29 -50 | worse, within spread (noise) |
| S5bcn | restMainMsPerS | 459 (443–475) | 466.5 (448–484) | +7.5 | +12 +4 -12 +30 +9 -5 | worse, within spread (noise) |
| S5bcn | restFps | 117 (115.9–118.6) | 116.4 (114.3–118.2) | -0.6 | -0.6 -1 +2.3 -2.6 -2.5 +1.1 | worse, within spread (noise) |
| S5bcn | restExtraRedrawsPerS | 12 (11.2–13.2) | 11.2 (10.3–13.6) | -0.7 | -0.5 -0.6 +1.3 -2.1 -1.8 +0.5 | better |
| S5bcn | heapPeakMB | 374 (351–396) | 303 (293–365) | -71 | -87 -72 -26 -84 -58 +6 | better |

Runs (in order): S5z13 main #1 load 3.5 3.6 5.4; S5z13 branch #1 load 4.2 3.9 5.3; S5z13 main #2 load 3.0 3.7 5.1; S5z13 branch #2 load 3.1 3.5 4.9; S5z13 main #3 load 3.2 3.4 4.8; S5z13 branch #3 load 2.7 3.2 4.6; S5z13 main #4 load 4.2 3.7 4.6; S5z13 branch #4 load 11.9 5.5 5.2; S5z13 main #5 load 20.2 10.5 7.2; S5z13 branch #5 load 14.5 11.2 7.8; S5z13 main #6 load 6.6 9.5 7.4; S5z13 branch #6 load 4.7 8.2 7.1; S5bcn main #1 load 6.7 7.8 7.0; S5bcn branch #1 load 8.7 9.0 7.6; S5bcn main #2 load 4.7 7.6 7.2; S5bcn branch #2 load 2.5 6.3 6.7; S5bcn main #3 load 4.5 5.8 6.5; S5bcn branch #3 load 2.9 5.0 6.1; S5bcn main #4 load 2.8 4.6 5.9; S5bcn branch #4 load 5.3 4.7 5.8; S5bcn main #5 load 11.8 7.4 6.8; S5bcn branch #5 load 5.7 6.7 6.5; S5bcn main #6 load 4.7 6.2 6.4; S5bcn branch #6 load 3.1 5.5 6.1
Errors: none
