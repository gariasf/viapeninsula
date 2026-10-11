# #266 shots

Main's page and the page of branch `266-regions-in-view`, each served locally by vite and reading its own dry run of 10 Oct 2026, both on the same cached feeds. The four `main-*` and `branch-*` shots are the review's, for the PR. The three `pick1-*` shots are the build's, for PICK 1.

## The PR's four

Main at 62f065c, and the branch with the review's final code on it. Saturday 10 Oct 12:00, with the clock fixed there and running on. A 1280×800 window at pixel ratio 1, light theme, English. Each shot was taken once the view's files had come and the map had then stood still for 45 s. `snapshot.json` is refused, as in #93, so every Train is Scheduled and the "Live data unavailable" banner shows. None of the four had a `pageerror` or anything of ours in the console, only the basemap's own `highway-shield-*` warnings, as on main.

| File | View | Files asked for | What it shows |
|---|---|---|---|
| `main-spain-z6.png` | Spain, zoom 6 (`#map=6/40.2/-3.7`) | 30, 1,516 KB brotli | Every region's tracks, with every place's Station dot over them. The legend reads "0 live, 313 scheduled". |
| `branch-spain-z6.png` | The same | 1, 24.3 KB: the file below zoom 7 | Every region's tracks, with no Station dots (PICK 1). The legend has no numbers ("Live", "Scheduled") and the die is off, as no region is loaded (PICK 2). Every region's credits show. |
| `main-barcelona-z12.png` | Barcelona, zoom 12 (`#map=12/41.39/2.17`) | 30, 1,516 KB | 313 Trains in the legend. |
| `branch-barcelona-z12.png` | The same | 3, 853 KB: the file below zoom 7, and Catalonia's track and Trips | 183 Trains in the legend, Catalonia's. The Lines, Stations and pills are as on main. |

## PICK 1: Station dots below zoom 7

These are the build's comparison shots, on the dry runs of d2ba3e2: main on the left and the branch on the right. Each is a 1280×800 window at pixel ratio 1, with the map alone: its controls and cards are hidden.

| File | View | What it shows |
|---|---|---|
| `pick1-z6-spain-main-then-branch.png` | Spain, zoom 6 (`#map=6/40.2/-3.5`), each window scaled to 800×500 | Main draws every place's dot over the tracks. The branch draws each Network's track alone, from the file below zoom 7. |
| `pick1-z6.9-catalonia-main-then-branch.png` | Catalonia, zoom 6.9 (`#map=6.9/41.5/1.5`), scaled the same | Just below zoom 7, where main's dots round Barcelona run into one blot. |
| `pick1-z6.9-crop-main-then-branch.png` | The same view at 1:1, cropped to 640×400 of each | The same, pixel for pixel. |

On 11 Oct the maintainer answered PICK 1 with A, no Station dots below zoom 7, and PICK 2 with A, the legend's count, the die and About's pills covering the loaded regions. Both were already built that way.
