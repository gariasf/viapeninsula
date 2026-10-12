# #541: Madrid's C8a and C8b, 33 m longer at their start, before and after

Cercanías Madrid's C8a and C8b on `stretch:cercanias-madrid:0`, at Madrid-Chamartín–Clara Campoamor (40.4709, −3.6837). `split()` makes a
stroke's first piece where the stroke starts, so that what `together()` moves back of a start (33 m here, 7,482 → 7,449 m, for each of
the two Lines) is drawn: 9 px at zoom 14, 4.5 px at zoom 13.

Each tile is the dev map (origin/main's `src/web`, as the page draws it) reading a dry run's bundle from disk, 360 × 270 CSS px at 2×
(720 × 540 px) around the middle of the added 33 m, with the clock fixed at 04:05 Madrid time on 12 Oct 2026, when no Train runs, so that
the Lines drawn are the track's:

- **before**: main's bundle, **after**: this branch's (#541). From the first dry run, in series on the same cached feeds (Renfe's, FGC's,
  TMB's and TRAM's timetables of 11 Oct 2026, days 11 to 13 Oct), main at 8f3cd23. Cercanías Madrid's track file of each is the same, byte
  for byte, in the run at the merge base db04029 (days 12 to 14 Oct): `track-cercanias-madrid-d0f6c13eaac3.json` on main and
  `track-cercanias-madrid-4601d34c105a.json` on the branch.
- A pair (`541-c8-pair-z14.jpg`, `541-c8-pair-z13.jpg`) is the two tiles and the pixels that differ in red over a faded main, in the
  middle 120 × 90 CSS px only: further out they are the basemap's labels and the Lines' names, placed again on each load.

| File | What it shows |
|---|---|
| `541-c8-pair-z14.jpg` | zoom 14: before (main), after (branch, a ring at the added 33 m), 1,132 pixels differ in the middle (95 at the ring) |
| `541-c8-pair-z13.jpg` | zoom 13: the same, 1,027 pixels differ (66 at the ring) |
| `541-c8-z14-main.png`, `541-c8-z14-branch.png`, `541-c8-z13-main.png`, `541-c8-z13-branch.png` | the tiles the pairs are made of |

## The live site, after the deploy of 7c267e1 (#650)

The same page (origin/main's `src/web` at 7c267e1, on a port of its own) reading the deployed bundle from the CDN instead of a dry run's:
12 Oct 2026, at 04:02 and again at 08:50 CEST, with the same fixed clock (04:05), empty snapshot and alerts and the same 360 × 270 CSS px
tile at 2× as above; the analytics beacon aborted, so it wasn't a visit. The live manifest names `track-cercanias-madrid-b902d58fdc3d.json`
for 12, 13 and 14 Oct, where C8a's and C8b's first piece is 7,449–7,714 m (`track-cercanias-madrid-d1ff9b4e805d.json`, the previous build's,
still has 7,482 for 11 Oct).

| File | What it shows |
|---|---|
| `541-c8-z14-live.png`, `541-c8-z13-live.png` | the live site's tiles: byte for byte (SHA-256) the branch's tiles above and, both times, 0 pixels from the branch's render of the dry run; 1,132 (zoom 14) and 1,023 (zoom 13) pixels differ from main's in the middle 120 × 90 CSS px, 1,247 and 2,149 in the whole tile |
| `541-live-c8-pair-z14.jpg`, `541-live-c8-pair-z13.jpg` | before (main's bundle), after (the live site, a ring at the added 33 m) and the pixels that differ in red, as the pairs above: 1,132 (95 at the ring) and 1,027 (66 at the ring) |

Console and `pageerror` read on both runs: no `pageerror`, no `console.error`, no request that wasn't a 200 (6 requests to the CDN). The warnings
are OpenFreeMap's own style's (`highway-shield` filters) and the headless GPU's "GPU stall due to ReadPixels".
