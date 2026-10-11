# #465: a Live Train's pill, before and after (12 Oct 2026)

Before = origin/main b3869ef. After = branch `465-pill-ink` at 8f9ee8e, the final code (rebased afterwards onto 6248714, #631,
which changes no `src/web` file; the tips are now 3109b7c, 83e69e6 and cc27f45): its `src/web/colour.ts` and `main.ts` are byte for
byte those of 996e60b, which the build's first shots (11 Oct) were taken on. Both sides read the same bytes: the live CDN's files as
kept on disk, the live snapshot frozen at 11 Oct 15:20:44 (168 Live, 35 Scheduled Trains), the page's clock held at 15:20:54
(`Date`). So every Train is where the snapshot puts it in both, and the only difference between a before and an after is the
lettering. These are 11 Oct's Trains, not live now.

One headless Chromium (Playwright 1.60 on the cached `chromium_headless_shell-1223`), launched once another session's browser had
gone, one page at a time, a fresh context per page, 390×844 and 1280×800 at 2×, light and dark (`colorScheme`, so the dark basemap
and the dark cards). The console and `pageerror` were read on every page, 52 of them: no page failed; the only console lines are the
basemap's own warnings (highway-shield, road_shield, `circle-11`) and the GL driver's, the same on both sides; no `pageerror`.
Counted by an audit script (`audit.txt`) and, for the map's own pixels, by a pixel read of the frames.

## Pills on the map, enlarged 3×, before above after (phone)

| File | Shows |
| --- | --- |
| `pill-R2N-light.png`, `pill-R2N-dark.png` | R2N (#D0DF00: white 1.48:1, ink 12.80:1), a Train north of Barcelona (map-north) |
| `pill-R1-light.png`, `pill-R1-dark.png` | R1 (#7DBCEC: 2.04:1, ink 9.24:1), a Train on the map north of Barcelona (map-north) |
| `pill-T2-light.png`, `pill-T2-dark.png` | T2 (#80FF80: 1.27:1, ink 14.87:1), TRAM's Baix Llobregat (map-t2) |

## Cards, before left, after right (phone, the sheet cut out of the frame)

| File | Shows |
| --- | --- |
| `board-sants-light.png`, `board-sants-dark.png` | Barcelona-Sants's board: the Lines that call in its nameboard (R1 R2 R2N R4 R13 R15 R17 go to ink; R2S R11 R14 R16 stay white) and its next departures, Live: R2S stays white, R4, R15 and R1 go to ink |
| `board-t2-light.png`, `board-t2-dark.png` | Fontsanta \| Fatjó's board: T1 (#FF0D0D: 3.95:1, ink 4.78:1) and T2 in the nameboard, and the Live T2 row first, with Scheduled ones under it that don't change |
| `card-r2n-light.png`, `card-r2n-dark.png` | A followed R2N's card: its pill in the title |
| `card-t2-light.png`, `card-t2-dark.png` | A followed T2's card |
| `about-light.png`, `about-dark.png` | About's key: the Live pill and the three shapes (R1 to ink, R11 and MM white), the Scheduled one as it was |
| `tap-r2n-light.png`, `tap-r2n-dark.png` | A tap on R2N's stroke: R2 and R2N to ink, R11 white |
| `nearby-light.png`, `nearby-dark.png` | Nearby at Sants: R4, L3, R6, R15 to ink; R2S, L1, L5 white |

## Whole frames, before left, after right (`pair-<scheme>-<size>-<spot>.jpg`)

On phone and on the 1280 px window for the first four, phone only for the rest:

- `map-north`: zoom 12 over Barcelona's north: 4 Live R1 and 1 Live R2N among R4, R11, R15, R2S, S1, the Metro's and T4, T5.
- `map-t2`: zoom 13.2, TRAM's Baix Llobregat: 2 Live T2 (and T3, L5, which stay white).
- `board-sants`: Barcelona-Sants's board pulled up (on phone).
- `board-t2`: Fontsanta | Fatjó's board pulled up (on phone): a Live T2 row first.
- phone only: `card-r2n`, `card-t2` (a followed Train's card), `about`, `tap-r2n`, `nearby`.

The build's own set (30 pages a side, with `map-sants` too, 11 Oct 15:29) read the same: 812 Live map pills, 158 card pills.

## What every Live pill read (`audit.txt`, `report-<side>-<chunk>.json`)

For each Live pill on the 26 pages of a side: on the map, the Train's feature `dark` and `colour`; on a card, the computed `color`
and the pill's `--line`. A pill is right if it letters in `#111` exactly where `darkInk()` of its Line's colour is true, and in white
otherwise.

|  | Map pills (Live, per page) | Card pills (Live) | Wrong |
| --- | --- | --- | --- |
| Before (b3869ef) | 654, all white | 158, all white (board 92, card title 4, About 8, tap popup 6, Nearby 48) | 318 map and 118 card pills white where ink reads better |
| After (8f9ee8e) | 654: 318 ink, 336 white | 158: 118 ink, 40 white (board 72 of 92, title 4 of 4, About 4 of 8, tap 4 of 6, Nearby 34 of 48) | none |

24 distinct Lines are drawn Live on the map pages. The `dark` property is not the glyph, so the map's pills were also read off the
frames' pixels (a box inside each Live R1, R2N and T2 pill's fill, near-black pixels off the fill or none): of the 28 such pills a
side on the map spots (5 a page on map-north, 2 on map-t2, four pages each: light and dark, phone and wide), 26 can be read, and all
26 are white before and near-black after; the other 2 are the third R1 of the two 1280 px map-north pages, which the credits box
covers (its visible "R" is white before, ink after).

Scheduled pills (ringed, lettered in `lettering()`) are the same before and after: the audit skips them, and the pairs show them
unchanged.

## Not shown

- A physical phone, and Windows' forced colours (`.pill.live { color: Canvas }` overrides `--lettering` there, untouched by this
  change).
- Bilbao's C2 (#0F8C2D, 4.37:1 white, 4.32:1 ink): not running in a view I took. It stays white by `darkInk()`; `colour.test.ts` pins
  it (and #632 asks whether an ink of `#0a0a0a` should take it).
