# #599: L1's and R4's 36 m stroke at Auditori/Teatre Nacional taken into their curves, and what else the same rule changes, before and after

19 places at zoom 12 to 16: two sheets and the 38 tiles they are made of. Each tile is the dev map (origin/main's `src/web` at d5b44d5f, as the
page draws it) reading a dry run's bundle from disk at 1280 × 800 and 2×, cut to the middle 360 × 270 CSS px (720 × 540 px) around the change,
with the clock fixed at 03:40 Madrid time on 13 Oct 2026, between the last Train of the 12th and the first of the 13th, so that the Lines drawn
are the track's:

- **before**: main's bundle, **after**: this branch's (#599). Both from the review's two dry runs, in series on the same cached feeds (Renfe's,
  FGC's, TMB's and TRAM's timetables of 11 Oct 2026, days 12 to 14 Oct), main at 34391e47 (#651). The ship's pair on 9a566d5b, the merge base the PR
  went in on (12 Oct, 13:00), draws the same strokes: the 23 of Catalonia's, 5 of Bilbao's and 48 of long distance's that change are, as canonical
  strokes and curve shapes, the review's own on 114b2381 (#704); and on 114b2381 every Line within 250 m of Auditori and of Glòries is drawn as in
  these tiles, to 0.6 m, and Bilbao's and long distance's track files are byte for byte the same.
- A tile is `<NN>-<place>-z<zoom>-main.png` and `-branch.png`. A zoom 16 tile is the band of zoom 14's Lines, drawn on the rails the map shows from
  zoom 15 in, which this doesn't touch.
- On `sheet-599.jpg` a place is its before (main) and after (branch, a ring at the change), two places to a row (1,484 × 3,280 px); on
  `sheet-599-closeups.jpg` eight of them are the middle 120 × 90 CSS px at 3×.
- "Differ" counts the pixels that differ between the two tiles, of 388,800 in a tile and 43,200 in its middle 120 × 90 CSS px. They include the
  basemap's labels and the Lines' names, which the map places again on each load: further out than the change they are those alone.

| File | What it shows |
|---|---|
| `sheet-599.jpg` | the 19 places below, before and after |
| `sheet-599-closeups.jpg` | 8 of them close up: Auditori at zoom 13 and 14, Glòries and Muskiz at 14, long distance's `:198` at 14, Atocha at 14, `:255` at 13 and `:54` at 14 |

## The 19 places

| # | Tiles | Region, Lines | Where | Zoom | What changes | Differ: tile / middle |
|---|---|---|---|---|---|---|
| 1 | `01-auditori-z12` | Catalonia, L1, R4 (R1) | Auditori/Teatre Nacional, 41.39818, 2.18688 | 12 | the 36 m is 2.5 px long at this zoom: nothing to see on the sheet | 11,904 / 593 |
| 2 | `02-auditori-z13` | the same | the same | 13 | R4's (orange) and L1's (red) 36 m stubs beside the bundle by the Station's name are gone; R1's (light blue) is on its own stroke and stays | 766 / 335 |
| 3 | `03-auditori-z14` | the same | the same | 14 | the same, larger | 1,058 / 856 |
| 4 | `04-auditori-z16` | the same | the same | 16 | nothing in the middle: the map draws the rails | 3,604 / 0 |
| 5 | `05-glories-z12` | Catalonia, T5 | stub by Glòries, 41.40235, 2.18700 | 12 | T5's 49 m turn-back between its two tracks, not drawn on main, is drawn through to the Station | 648 / 562 |
| 6 | `06-glories-z13` | the same | the same | 13 | the same | 769 / 385 |
| 7 | `07-glories-z14` | the same | the same | 14 | the same (thin on main) | 801 / 238 |
| 8 | `08-glories-z16` | the same | the same | 16 | identical | 0 / 0 |
| 9 | `09-muskiz-z13` | Cercanías Bilbao, C2 | Muskiz, 43.32134, −3.11221 | 13 | no Line is drawn there at this zoom (the dashed rail is the basemap's): identical | 0 / 0 |
| 10 | `10-muskiz-z14` | the same | the same | 14 | the green line reaches the stop (a few pixels short on main) | 101 / 101 |
| 11 | `11-muskiz-z16` | the same | the same | 16 | identical | 0 / 0 |
| 12 | `12-ld198-z13` | Long distance, AVE, Avlo (Alvia, Intercity) | `long-distance:198`, Venta de Baños, 41.92142, −4.49146 | 13 | Alvia's line merges into the AVE trunk (a hooked stub on main) | 125 / 125 |
| 13 | `13-ld198-z14` | the same | the same | 14 | the same | 299 / 299 |
| 14 | `14-ld206-z13` | Long distance, Alvia, AVE, Avlo | by Madrid-Atocha, 40.40095, −3.68353 | 13 | subtle: the curves of Alvia, AVE and Avlo go through the 43 m Stretch `long-distance:206`, now cut whole | 1,836 / 299 |
| 15 | `15-ld206-z14` | the same | the same | 14 | the same, larger | 850 / 850 |
| 16 | `16-ld255-z12` | Long distance, Alvia | `long-distance:255`, `240`, `241`, Medina del Campo, 41.29058, −4.91787 | 12 | subtle | 521 / 324 |
| 17 | `17-ld255-z13` | the same | the same | 13 | the jog of Alvia's line is gone | 550 / 306 |
| 18 | `18-ld54-z13` | Long distance, Alvia, Intercity | `long-distance:54`, Miranda de Ebro, 42.68955, −2.9459 | 13 | Alvia's and Intercity's curves reach the terminus (43 m more): subtle | 170 / 170 |
| 19 | `19-ld54-z14` | the same | the same | 14 | the same | 346 / 346 |

Console and `pageerror` read on both sides: no `pageerror`, no `console.error`; the warnings are the base map's own style's.
