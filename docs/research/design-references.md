# Design references, and how to try looks out

Research for #208, the first step of #141's design pass. What to look at before #209–#212, how to try looks out, and in which order.

- **Date:** 2026-10-04, a Sunday, about 10:20 in Barcelona and 16:20 in Taipei, so both maps had Trains running.
- **Method:** one browser, pages visited in series. The live map and railisland at a phone's 390×844, the rest on a 1280×800 desktop. The operators' maps are their own PDFs and images, rasterised.
- **Images:** on branch `screenshots-208`, under `screenshots/208/`, 15 JPEGs.

## TL;DR

- **Way of working: a mix.** Trains, Stations, and type, colour and the dark theme are tried as variants by URL parameter on the real map, as #90 and #144 did. The cards are tried as one throwaway HTML mockup page with all of them on it, at phone width.
- **Order:** #211 (type, colour, dark) first, then #209 (Trains), #210 (Stations), and #212 (the cards) last.
- **The strongest references:** railisland for the Trains and the cards; TMB's and FGC's own maps for Stations and interchanges; SBB's map for Live and Scheduled.

## 1. The live map today

[viapeninsula.gariasf.com](https://viapeninsula.gariasf.com), main as deployed on 4 Oct.

| Zoom 13, Plaça de Catalunya | Zoom 10, Barcelona | Following a Train | A Station's board |
| --- | --- | --- | --- |
| ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/viapeninsula-z13-phone.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/viapeninsula-z10-phone.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/viapeninsula-follow-phone.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/viapeninsula-board-phone.jpg?raw=true) |

What shows on a phone:

- **Trains:** the pills read well at zoom 13. At zoom 10 central Barcelona is a heap of dots, pills and arrows, and Live and Scheduled are hard to tell apart in it.
- **Stations:** every Station is the same white dot ringed in grey, whatever Networks call there. The bold names (#144) stand out from positron's labels.
- **Type and colour:** three looks side by side: Noto Sans on the map, the browser's `sans-serif` in the interface, and MapLibre's own controls. The interface is white boxes with a 2 px grey ring, and the TRAM banner is yellow.
- **The cards:** the legend and the banner take the top fifth of the screen. On the board, "10:23 AM" fills its 3.5em column, so the Line's badge touches the time. The status line ("Scheduled · no live data for this train") repeats on every row. The panel's heading is 15 px, and the rest 13 px.
- **Dark:** there's none. `style.css` has `forced-colors` rules (#116) but no `prefers-color-scheme` theme, and the basemap is always positron.

## 2. railisland

[railisland.tw](https://railisland.tw/), the live site, replayed with `?g=all&at=25.0478,121.5170&z=13`. The study's section 4 has the code behind it; this is how it looks on a phone.

| Zoom 13, Taipei | Following a Train | The system's dark setting |
| --- | --- | --- |
| ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/railisland-z13-phone.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/railisland-follow-phone.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/railisland-dark-phone.jpg?raw=true) |

- **Trains:** the same pills as ours, but the followed Train is a different thing: a ringed target over the track, with its colour pulsing out from it. In dark mode every marker glows.
- **Stations:** the top class is a rounded square ringed in red. When following, the next Station shows as a nameboard over the map: the name, and ◀ ▶ for the Stations either side, as on Taiwan's platform signs. The site's logo is the same nameboard.
- **Type and colour:** one look across the map and the interface: a cream paper colour, navy ink, red for actions, and thick rounded outlines on every box. It follows the system's dark setting, with a dark basemap, and the cards and buttons turn navy with it. Line colours hold up on it, and the glow helps.
- **Cards:** the followed Train's card leads with what changes: the speed, large and red, and the next Station with its time and minutes to go. Then a progress bar along the Trip, the history of its delays, and the Units. Dashed rules split it into parts. The clock and "LIVE" sit in one pill at the top, and the tabs at the bottom are a phone app's.
- **Fits us:** the nameboard for the followed Train's next Station, the one-look interface, and the dark theme. A tab bar and a welcome dialog don't: the map has few screens.

## 3. The operators' own maps and signs

None of the four publishes photos of its signs on its own site; FGC's Station pages have one photo each, of a platform with no sign in view. Their maps and Line strips carry the same badges and colours as the signs, so they stand in here.

| Rodalies, the network map | FGC, Barcelona–Vallès scheme |
| --- | --- |
| ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/rodalies-network-map.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/fgc-barcelona-valles-scheme.jpg?raw=true) |

| TMB, the Metro map | TMB, L3's Line strip | TRAM, Trambaix |
| --- | --- | --- |
| ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/tmb-metro-map.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/tmb-l3-line-strip.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/tram-trambaix-map.jpg?raw=true) |

- **Rodalies** ([network map PDF](https://rodalies.gencat.cat/web/.content/00_home/04_mapes/mapa_xarxa_rodalies_catalunya.pdf), 10/2025):
  - Line badges are squares with rounded corners, the Line's code in white bold on its colour, with "Nord" or "Sud" small under R2's. That's what riders read on platforms and trains.
  - Stations are white ticks across the Line, and the bigger ones' names are bold. Interchanges with the Metro, FGC and TRAM are the operators' own small logos beside the name.
  - Lines run side by side in a fixed order through Barcelona, each in its colour, with no casing.
- **FGC** ([Barcelona–Vallès scheme PDF](https://www.fgc.cat/wp-content/uploads/2017/11/planol-2017_barcelona-valles.pdf), 2017):
  - A Station where every Train stops is a black bar across all the Lines side by side. One where only some stop is a dot on just those Lines. That reads as one place on a bundle, which is what #210 asks for below z15.
  - Line badges are rounded pills (S1, S2) or squares (L6, L7), in the Line's colour.
- **TMB** ([Metro map](https://www.tmb.cat/en/barcelona-transport/map/metro), March 2025, and its [Line strips](https://www.tmb.cat/en/barcelona-transport/map/metro)):
  - Stations are white dots ringed in black. An interchange is two or three such dots joined by a white capsule, ringed in black, across the Lines. A terminus is a bar across the Line's end.
  - Termini and big interchanges have their names reversed out, white on a black box. That's TMB's nameboard, and the closest thing in Barcelona to railisland's rounded square.
  - The Line strip draws each Station as a ring on the Line and lists the connections under it as small badges, one per Line. A board could do the same.
  - Badges are rounded squares, white on the Line's colour, as Rodalies'.
- **TRAM** ([lines and timetables](https://tram.cat/ca/linies-i-horaris)): a turquoise Line with a white dot ringed in it at each stop, names set at an angle, and connections as badges under. Plain, and the same family as TMB's.

**Fits us:**

- The four agree on one badge: a rounded square or pill, white bold code on the Line's colour. The cards' Line names should be it (#122 started this).
- FGC's bar and TMB's capsule both say "one place, several Lines". Either suits a place on a band.
- TMB's reversed names suit the top tier, in our own colours rather than black.

## 4. Other live train maps

| SBB, punctuality map, Zürich | Mini Tokyo 3D | traintimes.org.uk, the Tube |
| --- | --- | --- |
| ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/sbb-trafimage.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/minitokyo3d.jpg?raw=true) | ![](https://github.com/gariasf/viapeninsula/blob/3afa70d6c69d488808b32deca76f8e086e76fa01/screenshots/208/traintimes-tube.jpg?raw=true) |

- **SBB** ([maps.trafimage.ch](https://maps.trafimage.ch/ch.sbb.netzkarte), the punctuality layer):
  - Each Train is a round badge with its Line's name (S12, IC3), filled by how late it is: green on time, yellow late. A Train with no live data is grey, ringed in a dashed line. That's our Live and Scheduled, said by fill *and* by the ring's dash, so it reads in greyscale too.
  - Stations are small dots, with bold names for the big ones. Lines are dark grey, so the Trains carry all the colour.
  - It offers a dark basemap among its backgrounds.
- **Mini Tokyo 3D** ([minitokyo3d.com](https://minitokyo3d.com/)):
  - Trains are boxes in their Line's colour, in 3D, on a pale basemap.
  - An interchange is one white capsule ringed in black across all its Lines, as TMB's map draws them, but on the real geography.
  - Its 3D is for #213, after v1.
- **traintimes.org.uk** ([the Tube's live map](https://traintimes.org.uk/map/tube/)):
  - Trains are yellow dots with a bite showing their heading, the same for every Line. Stations are the Underground's roundel.
  - It's on OpenStreetMap's standard tiles, and the streets, labels and roundels drown the Lines and Trains. It shows why a quiet basemap, as positron is, matters more than any marker.

Not tried: Zugfinder, ÖBB's and NS's maps and the Transit app. Three maps loaded and were enough.

## 5. How to try looks out

**Variants by URL parameter on the real map**, for #209, #210 and #211:

- The map's look depends on what screenshots can't fake: the zoom, how dense Barcelona is, labels giving way, Trains moving and standing. #90's prototype showed it: its variant B looked fine on paper and buried central Barcelona at zoom 10.
- It's already how this repo works. #90 put three variants in one throwaway file (`markers.prototype.ts`), picked by `?variant=A|B|C` and a bar with ← → at the bottom of the map, on branch `90-pills-prototype`. #144 picked by `?names=` on its PR, and dropped the losers before merging.
- Variants go in the query string, not the hash. The hash holds the map's own state (`#map=…&train=…&station=…`), so a link with both keeps its view.
- One parameter per ticket (say `?trains=`, `?stations=`, `?theme=`), so the maintainer can try one ticket's variants on top of another's pick.
- Each variant is screenshotted at the same spots: the four in section 1 (Plaça de Catalunya z13, Barcelona z10, a followed Train, Sants' board) at 390×844, and on both basemaps once #211 has a dark one. One browser, in series.

**One HTML mockup page**, for #212:

- The cards are plain HTML and CSS, and they're best judged side by side: the followed Train, a board, Nearby, About, the legend, the banner and the buttons, all on one page, at 390 px wide, with real content copied from the live map.
- A mockup is faster to change than four code paths, and needs no live Trains to show a Cancelled departure or a long Station name.
- It's a throwaway page on the ticket's branch, not served by the Worker. The pick then builds into `style.css`.
- Figma isn't needed: the page uses the real fonts and colours from #211, which a Figma file would have to copy.

## 6. Order

1. **#211, type, colour and a dark theme.** Every other section draws in its typeface and palette, and has to hold up on the dark basemap if there is one. Deciding them first saves trying each Train and Station variant twice. Its variants are few: a basemap, a typeface, a palette.
2. **#209, Trains.** The biggest thing on the map, and what people look at. It needs #211's basemaps, as railisland's glow is for dark only.
3. **#210, Stations.** It sits under the Trains and has to give way to them, so it follows their pick. The interchange look shares the Line badge with #212.
4. **#212, the cards.** Last, as it takes #211's type and colours and the Line badge, and a mockup is quick once those are set.

#213, 3D, waits for v1 (#1).

## 7. Per ticket

**For #209 (Trains):**

- railisland's followed Train, a ringed target with its colour pulsing out, against ours drawn larger (section 2).
- SBB's Scheduled Train: grey, ringed in a dash (section 4). A dashed ring would tell Scheduled from Live without colour, and at zoom 10 where the fill is too small to see.
- The heap at zoom 10 (section 1): try the dots and halos smaller, or the halo only on Live.
- The glow and trails railisland draws only on a dark basemap (study section 4): a variant once #211 has one.
- #156's note on #141: a new design could keep one Train's arrow off another's pill.
- Trains drawn to length need Units we mostly lack (study section 4); leave them out.

**For #210 (Stations):**

- FGC's black bar across a bundle, and TMB's and Mini Tokyo 3D's white capsule, for one place served by several Lines (sections 3, 4).
- TMB's reversed-out names and railisland's red-ringed square for the top tier (sections 2, 3).
- railisland's nameboard, with ◀ ▶, for the followed Train's next Station.
- TMB's Line strip: connections as badges under a Station, for the board's heading.

**For #211 (type, colour, dark):**

- Today's three looks on one screen (section 1), and railisland's one look (section 2).
- OpenFreeMap serves a `dark` style beside `positron`; its glyphs are Noto Sans, so a typeface the map can letter in needs our own glyphs, or Noto Sans in the interface too.
- `PAPER` in `main.ts` is copied from positron's background, and every Line is cased in it; a dark basemap needs its own.
- railisland's dark theme follows the system's setting, and turns the cards and buttons with it (section 2).
- Keep the forced-colours rules from #116 working under any palette.

**For #212 (the cards):**

- The operators' one badge, white bold code on the Line's colour (section 3), for every Line name in a card.
- railisland's card: what changes first (speed, next Station, minutes to go), then a progress bar, split by rules (section 2).
- The board's narrow time column and repeated status line (section 1).
- The legend and banner taking a fifth of a phone's screen (section 1); railisland folds its clock and "LIVE" into one pill.

## Sources

- **Ours:** [the live map](https://viapeninsula.gariasf.com), main on 4 Oct 2026; `src/web/style.css`, `src/web/main.ts`; [railisland-trains-on-track.md](railisland-trains-on-track.md), section 4; #90 and branch `90-pills-prototype` (`c346f94`); #144 and its PR #157; #141 and #156.
- **railisland:** [railisland.tw](https://railisland.tw/), 4 Oct 2026.
- **Rodalies:** [network map](https://rodalies.gencat.cat/web/.content/00_home/04_mapes/mapa_xarxa_rodalies_catalunya.pdf), [Lines](https://rodalies.gencat.cat/ca/linies_estacions_i_trens/index.html).
- **FGC:** [Barcelona–Vallès scheme](https://www.fgc.cat/wp-content/uploads/2017/11/planol-2017_barcelona-valles.pdf), [Barcelona - Plaça Catalunya](https://www.fgc.cat/xarxa-fgc/l-barcelona-valles/placa-catalunya/).
- **TMB:** [Metro map](https://www.tmb.cat/en/barcelona-transport/map/metro), with its map image and L3's Line strip.
- **TRAM:** [lines and timetables](https://tram.cat/ca/linies-i-horaris), with its Trambaix image.
- **Other maps:** [SBB trafimage](https://maps.trafimage.ch/ch.sbb.netzkarte), [Mini Tokyo 3D](https://minitokyo3d.com/), [traintimes.org.uk](https://traintimes.org.uk/map/tube/).
