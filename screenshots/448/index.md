# #448: the curves that change when `across()` compares a way's stroke numbers as numbers, before and after

Five sheets and the tiles they are made of. Each tile is the dev map (origin/main's `src/web`, as the page draws it) reading a dry run's
bundle from disk, with the clock fixed at 04:05 Madrid time on 12 Oct 2026, when no Train runs, so that the Lines drawn are the track's:

- **before**: main's bundle, **after**: this branch's (#448). Both from the first dry run, in series on the same cached feeds (Renfe's,
  FGC's, TMB's and TRAM's timetables of 11 Oct 2026, days 11 to 13 Oct), main at 8f3cd23. The review's second run, on 308c1f2 and days 12 to
  14 Oct, has the track files of Catalonia, Madrid, Asturias, Valencia and Bilbao byte for byte the first run's, on both sides; Sevilla's and
  Santander's differ (Sevilla's C4 has a traced shape of its own on the later days: 138 curves where it had 146), which the PR's numbers say.
- A tile is 360 × 270 CSS px at 2× (720 × 540 px) around the curve's middle, `<set>-NN-<region>-<Line>-z<zoom>-main.png` and `-branch.png`.
  The `-x.png` tiles of the 14 are 120 × 90 CSS px at 4× (480 × 360 px): the map's own resolution four times over. The curves that move
  under a pixel are shown half a zoom further in, within their band, to make the most of it.
- A sheet row is before (main's bundle), after (this branch's, a ring at the curve's middle) and the pixels that differ in red, **in the
  middle of the view only**: further out they are the basemap's labels and the Lines' names, placed again on each load.

| File | What it shows |
|---|---|
| `sheet-1-side-changes.jpg` | the 14 curves that are drawn at another side, at zoom 7 and 8, at 4× (`side-NN-…-x.png`): the sign-off and the pick of the PR |
| `sheet-1b-side-changes-pixels.jpg` | the same 14 as they come on the map (`side-NN-….png`, 360 × 270 CSS px at 2×) |
| `sheet-2-catalonia-a.jpg`, `sheet-3-catalonia-b.jpg` | Catalonia's other 37 curves that draw differently, zoom 7 to 13 (`catalonia-NN-….png`) |
| `sheet-4-other-regions.jpg` | Madrid's largest 10 and the 4 of Sevilla, Valencia (2) and Santander, zoom 7 to 12 (`others-NN-….png`) |

## The 14 (side in main's drawing → in this branch's, both in the way main draws the Line; metres is the change of side times a line width, 688 m at zoom 7 and 426 m at zoom 8)

| # | Region, Line | zoom | side | m | px | where |
|---|---|---|---|---|---|---|
| 1, 2 | Madrid C4a, C4b | 7 | −1.5 → −0.5 | 688 | 1.5 | 40.4545, −3.6958 |
| 3 | Madrid C3 | 7 | 0 → 0.5 | 344 | 0.74 | 40.4533, −3.6852 |
| 4 | Madrid C4 | 7 | −1 → −0.5 | 344 | 0.74 | 40.4545, −3.6932 |
| 5, 6 | Madrid C4a, C4b | 8 | −1.5 → −0.5 | 426 | 1.8 | 40.4539, −3.6941 |
| 7 | Madrid C3 | 8 | 0 → 0.5 | 213 | 0.92 | 40.4536, −3.6876 |
| 8 | Madrid C4 | 8 | −1 → −0.5 | 213 | 0.92 | 40.4541, −3.6927 |
| 9 | Catalonia T6 | 7 | −1 → 0.5 | 1,032 | 2.3 | 41.4185, 2.2143 |
| 10 | Catalonia L1 | 7 | −0.5 → 0.5 | 688 | 1.5 | 41.4102, 2.1887 |
| 11 | Catalonia R4 | 7 | 1 → 0 | 688 | 1.5 | 41.4398, 2.1825 |
| 12 | Catalonia T5 | 7 | 0 → −0.5 | 344 | 0.75 | 41.4186, 2.2143 |
| 13 | Catalonia T6 | 7 | 0.5 → 0 | 344 | 0.75 | 41.4178, 2.2202 |
| 14 | Asturias C1 | 7 | 1 → −0.5 | 1,032 | 2.3 | 43.5358, −5.6844 |

Madrid's 8 and Asturias' C1 change pixels at the curve (107 to 852 at 4×). Catalonia's T6 (twice), L1 and T5 are curves of 1 to 5 px at
zoom 7 under their stations' discs: 3 to 5 pixels differ within 15 px of them, and R4's, of 10 px, 78. Of Catalonia's 42 that draw
differently, 37 are within 17 m (0.5 px at the most) and can't be told apart on a screen: sheets 2 to 4 are mostly the numbers' evidence.
