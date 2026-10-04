# The track file and Trips at the scale of Spain: how big, and how to load them

Research for #220, under #214: how big the bundle gets for all of Spain, what the build costs at that size, what the page costs with many more Trains, and how the page should load it. It builds on #217's note ([osm-rails-spain.md](osm-rails-spain.md)) and #215's ([spain-feeds.md](spain-feeds.md)).

- **Date:** 2026-10-04, a Sunday.
- **Machine:** the maintainer's Mac (Apple M4 Pro, 12 cores, 24 GB). A GitHub runner is slower (#217: 4 CPUs, 16 GB).
- **Method:** the daily build's own code, from a copy of `src/` outside the repo, with timing lines added to `sideBySide()` and `order()`, run by a scratch script in place of `daily.ts`. Rails are #217's filtered extract (Spain, Portugal, Andorra and three French regions). Memory is peak resident set size from `/usr/bin/time -l`. Sizes are `JSON.stringify` raw, gzip level 9, and brotli quality 11, as `daily.ts` writes them.
- **Days:** Renfe's Cercanías file (1 Oct) has no Rodalies Trips after Sunday 4 Oct (#226), so Renfe's Trips are Thursday 1 Oct's. Renfe's long-distance file starts on 3 Oct, and FGC's, TRAM's and TMB's feeds have no Trips on 1 Oct, so theirs are Monday 5 Oct's. Both are weekdays; each bundle puts them on one service day.
- **Not changed:** nothing in `src/` on the branch, nothing published.

## TL;DR

- **All of Renfe's Cercanías is easy.** Today's four Networks plus the other 14 núcleos: a track of 1,345 KB brotli (Catalonia's is 569 KB) and Trips of 732 KB (548 KB). `sideBySide` takes 20.5 s (11.0 s), the line-order solver 0.1 s a graph, the whole build 162 s at 3.4 GB.
- **Long distance is the hard part.** Renfe's AVE, Alvia, MD and Regional Trips, traced along the rails (the feed has no shapes):
  - With a Line for each product and pair of ends ("AVE Madrid–Barcelona", 322 Lines), the solver can't be built: up to 61 Lines on a Stretch, 140k pair variables and 2.4M ordering rows, and Node runs out of room in a `Map` before HiGHS starts.
  - With a Line for each product (AVE, MD…, 13 Lines), the build finishes: the track is 115.5 MB raw and **8.1 MB brotli**, `sideBySide` takes 366 s, the whole build 760 s at 5.3 GB. The page crashed loading it, twice.
  - Most of that is the long-distance Trips' shapes: 861 of them, one for each pattern of stops, with 1.76M points of which only 161k differ.
- **The page's cost grows with every Train, not only those in view.** At #93's setup, today's Catalonia (351 Trains) uses 497 ms of each second of a slowed main thread. Adding the other núcleos (576 Trains, the same 132 in view) takes it to 630 ms. Three times Catalonia's Trains (1,052) drops it to 48 fps, at 795 ms.
- **Spain, everything in:** about 9–10 MB brotli of track and 1–1.5 MB of Trips a day, as the build writes them today, and about 1,000–1,200 Trains at a weekday peak.
- **Recommendation:** split by region, as a manifest entry per region with its own track and Trips files, and load the regions in view. Build each region on its own. Keep long distance out until #216 settles its Lines and its shapes come in shared pieces. Then cull the Trains to the view in the engine. Details at the end; the ADR waits for the maintainer's pick.

## Measured

### The builds

Three builds, each as `daily.ts` builds today but for one day of Trips:

- **ct:** today's Networks: Rodalies, FGC, TRAM and the Metro, cut at Catalonia's border.
- **es:** ct, plus each of the other 14 Cercanías núcleos as a Network of its own, not cut.
- **ld:** es, plus Renfe's long-distance, MD and Regional Trips, not cut.

| | ct | es | ld (Lines by product) |
|---|---|---|---|
| Networks / Lines / Stations | 4 / 54 / 509 | 18 / 103 / 1,208 | 19 / 116 / 2,207 |
| Traced shapes | 134 | 254 | 1,115 |
| Trips | 8,549 | 11,878 | 13,464 |
| Pieces walked (`walk`) | 61,079 | 151,054 | 548,104 |
| Stretches, main graph | 115 | 283 | 1,932 |
| Track raw / gzip / brotli | 5,890 / 1,393 / **569 KB** | 12,549 / 3,079 / **1,345 KB** | 115,527 / 29,030 / **8,135 KB** |
| Trips raw / gzip / brotli | 10,476 / 1,126 / **548 KB** | 14,426 / 1,481 / **732 KB** | 15,626 / 1,621 / **809 KB** |
| `sideBySide` | 11.0 s | 20.5 s | 366 s |
| Whole build | 63 s | 162 s | 760 s |
| Peak memory | 2.0 GB | 3.4 GB | 5.3 GB |

- ct matches what the build published on 4 Oct: a 577 KB brotli track. The ticket's 13 s for `sideBySide` was on 2 Oct's track.
- Rodalies has 1,486 Trips on 1 Oct in the feed: 527 are buses, and 26 of the 959 by train are left out as the build leaves them out today, which leaves 933.
- es's whole build is mostly reading the feed: each núcleo reads Renfe's 245 MB of `stop_times.txt` again, about 4.7 s each, 66 s of the 162.
- ld's 760 s break down as 96 s reading and tracing, 366 s `sideBySide`, 175 s `onOwnTrack()` (each Station against each shape), and 122 s writing, of which brotli takes 97 s for the track.
- #160's `measures()` took 40 s on es. On ld it hadn't finished after 45 min of CPU and was stopped.

### The track, field by field

Brotli, each field squeezed on its own:

| Field | ct | es | ld |
|---|---|---|---|
| Traced shapes (the Trips' track) | 224 KB | 547 KB | 3,638 KB |
| Centrelines | 175 KB | 446 KB | 1,983 KB |
| Smoothed centrelines | 19 KB | 41 KB | 261 KB |
| Curves (links) | 39 KB | 88 KB | 509 KB |
| Strokes | 43 KB | 82 KB | 602 KB |
| Slots | 57 KB | 110 KB | 1,059 KB |
| Rails, Stations, Lines, tracks | 23 KB | 44 KB | 148 KB |

- Shapes are three quarters of the file in every build. Slots grow fastest: 8,513 in ct, 224,742 in ld, one set for every shape a Line has.
- ld's traced shapes are 54 MB raw. Its 861 long-distance shapes run 261,824 km between them, over the same rails again and again: 1.76M points, 161k of them distinct. Cercanías' 254 shapes have 186k points, 73k distinct.

### Line names across núcleos

C1 is a Line in nine núcleos. In the scratch build each núcleo is a Network of its own, `cercanias-<code>`, with the routes whose `route_id` starts with its code, so its Lines are `cercanias-10:C1`, its shapes and Trips `cercanias-10:<id>`. Stations stay `adif:<code>`, as Rodalies' are: Adif's codes are unique, and 640 are shared with the long-distance file, which makes the Station one Station across Networks. That's for #218 to settle; it needs no change to the bundle's format.

Trips the build left out, by núcleo (Thursday's feed against Trips placed): Madrid 1,301 → 1,285, Asturias 472 → 400, Sevilla 169 → 154, Valencia 389 → 318, Murcia/Alicante 107 → 70, León 61 → 31, San Sebastián 75 → 59, Santander 226 → 218. These are #217's spots to check, and the bundle sizes above are a little short for them.

### The line-order solver (#162)

HiGHS on each graph `sideBySide` builds (the main graph, then one for each band below zoom 10):

| Build | Lines a Stretch (max / p90 / median) | Binaries | Rows | Model | HiGHS |
|---|---|---|---|---|---|
| ct | | 572–1,197 | 4,264–9,490 | 0.3–0.6 MB | 0.1 s |
| es | 11–13 / 5–6 / 2 | 991–1,650 | 6,908–12,386 | 0.4–0.8 MB | 0.1 s |
| ld, Lines by product | 21 / 8 / 3–4 | 17,099–21,056 | 163,722–209,838 | 11–14 MB | 5.8–8.0 s |
| ld, Lines by product and ends | 61 / 24 / 8 | 139,946 pairs | 2,431,432 ordering rows alone | – | never built |

- With 322 long-distance Lines the process stopped with "invalid table size" after 156 s, at 7.2 GB: the separation terms make a variable for each pair of Lines on a Stretch and each Line between them, and a JavaScript `Map` holds at most 2^24 entries. HiGHS never got the model.
- The ordering rows alone grow with the cube of the Lines on a Stretch. Madrid–Atocha and the high-speed line out of Madrid carry dozens of origin–destination pairs. However #216 names the long-distance Lines, the solver as written takes about 20 Lines a Stretch, not 60.
- In ld by product, the solver is a small part: HiGHS takes 27 s of the 366. The rest is `stretches()` (8–12 s a graph), strokes and smoothing (13–37 s), and curves and slots (18–37 s), each about linear in the pieces and the shapes.

### The engine (#93's harness)

#93's setup: a 390×844 phone at pixel ratio 3, CPU slowed 4×, `Date` faked to Thursday 1 Oct 08:15, `/snapshot.json` blocked, so every Train is Scheduled. Each build was served from `vite preview` with the bundle's files routed to it. Three runs each, medians; one Madrid run where the view moved off Madrid mid-run was dropped and run again. Main thread is ms busy for each second of wall time.

| Bundle, view | Trains | In view | Idle: main ms/s, fps, p95 | Moving: main ms/s, fps | First Trains after load |
|---|---|---|---|---|---|
| ct, Barcelona z12 | 351 | 132 | 497, 60, 17.6 ms | 509, 60 | 4.1 s |
| es, Barcelona z12 | 576 | 132 | 630, 59.4, 17.6 ms | 651, 60 | 6.2 s |
| es, Madrid z12 | 576 | 30 | 538, 60, 17.6 ms | 534, 60 | 6.0 s |
| ct ×3, Barcelona z12 | 1,052 | 395 | 795, 47.6, 33.9 ms | 852, 47.2 | 4.1 s |
| ld, Barcelona z12 | – | – | the tab crashed before the first Train, twice | | |

- "ct ×3" is Catalonia's Trips copied twice more, 3 and 6 minutes later, on the same track: a synthetic stand-in for many more Trains, in view and out.
- "Moving" pans the map out and back with `panBy`, 10 s. A mouse drag, as #93 used, zoomed the phone emulation out to zoom 7.75 in the first run, so it was replaced.
- Every Train costs, in view or not: es adds 225 Trains, none in view at Barcelona, and 133 ms/s. `trains()` positions every Train each frame and `setData` hands them all to MapLibre.
- At zoom 12 the map redrew 57–60 times a second standing still, so idle is near the moving figure. #93's cap mostly shows zoomed out.
- From about 1,000 Trains the slowed phone drops frames: p95 34 ms is every other frame missed.
- First Trains takes 50% longer with es's 12.5 MB track and 14.4 MB of Trips than ct's 5.9 MB and 10.5 MB: JSON parsing and building the GeoJSON in the page.

### Vector tiles for the track

What MapLibre's GeoJSON source does in the page, done in Node: the features the page draws at each zoom (each Network's track below zoom 7, the strokes of that zoom's band from 7 to 14, each Line's rails from 15), cut by `@maplibre/geojson-vt` (tolerance 3, buffer 64), encoded with `@maplibre/vt-pbf`, gzipped tile by tile.

| | ct | es | ld |
|---|---|---|---|
| Tiles, zooms 5–15 | 3,460 | 9,248 | 37,349 |
| All tiles, gzipped | 1,040 KB | 2,497 KB | 12,450 KB |
| Median tile at z12 / z14 | 0.33 / 0.21 KB | 0.33 / 0.21 KB | 0.40 / 0.23 KB |
| Largest tile | 15 KB | 15 KB | 45 KB |

A phone's view takes about 6 tiles, so tens of KB, against the whole file today. But tiles only draw the Lines. To place a Train the engine needs its shape, its slots and the centrelines they name, and those are over 80% of the track file. So tiles would add a copy of the drawn geometry, not replace the file.

### Split by region

Each region's own track holds its Networks' Lines, strokes, rails, slots and tracks, every shape those name (with their smoothed copies), and the Stations its Trips call at. Brotli:

| Region | Track (es) | Track (ld) | Trips |
|---|---|---|---|
| Catalonia (today's four Networks) | 569 KB | 690 KB | 548 KB |
| Madrid (10) | 160 KB | 178 KB | 72 KB |
| Bilbao (60) | 165 KB | 180 KB | 23 KB |
| Asturias (20) | 148 KB | 175 KB | 24 KB |
| Valencia (40), Santander (62), Sevilla (30) | 69, 75, 57 KB | 90, 91, 82 KB | 16, 12, 8 KB |
| The other eight núcleos | 4–37 KB each | 6–48 KB each | 2–8 KB each |
| Long distance, all of Spain | – | 7,100 KB | 82 KB |
| **Sum of regions** | **1,405 KB** (whole: 1,345) | **8,798 KB** (whole: 8,135) | 737 / 819 KB |

- Splitting costs 4–8% more in all, for the shapes two regions share and brotli's smaller windows.
- In ld, a region's track grows by 10–60% (Catalonia's by 21%): long-distance Lines that share its track change its Stretches.
- Every region but long distance loads in under 0.7 MB.

## Spain's totals, estimated

Measured: Renfe's Cercanías and long distance, and Catalonia's other three. Not measured, from #215's counts:

| Adds | Trips a weekday | Track, brotli | Trips, brotli |
|---|---|---|---|
| Euskotren (trains, two trams, a funicular) | 1,203 | ~150 KB, like Bilbao's núcleo | ~60 KB |
| FGV: Metrovalencia, TRAM d'Alacant | 2,174 | ~200 KB | ~100 KB |
| SFM Mallorca | 247 | ~50 KB | ~10 KB |
| Ouigo | 37 | on Renfe's high-speed track | ~2 KB |
| Other metros and trams (Madrid, Bilbao, Sevilla, Málaga, Zaragoza…) | maybe 10,000+ (Madrid's GTFS has expired) | ~500 KB | ~500 KB |

- **Track:** about 9–10 MB brotli in one file, 8.1 MB of it the long-distance build as it stands. With long distance's shapes in shared pieces (161k points, not 1.76M) and fewer slots, maybe 3 MB.
- **Trips:** about 1–1.5 MB brotli a day.
- **Trains at a weekday peak:** 576 at 08:15 for Renfe's Cercanías with Catalonia's others; long distance, Euskotren, FGV and SFM add a few hundred; metros elsewhere more. About 1,000–1,200, the "ct ×3" row.
- **Build:** Cercanías alone stays near 3 minutes and 3.4 GB. With long distance by product, about 13 minutes and 5.3 GB here; a 4-CPU runner is slower, still well inside the daily job's 60 minutes and 16 GB.

## Ways to split, compared

| | One file (today) | By region | By tiles | Region in view + high speed everywhere | Vector tiles for the track |
|---|---|---|---|---|---|
| What loads | everything | the regions in view | the tiles in view, track and Trips | the regions in view, plus a Spain-wide long-distance file | tiles for drawing; shapes and slots still whole |
| Cercanías + Catalonia | 1.3 MB + 0.7 MB | 0.6 MB + 0.5 MB for Catalonia; 0.2 + 0.1 for Madrid | tens of KB | as by region | +2.5 MB of tiles on the server, tens of KB a view |
| With long distance | 8.1 MB + 0.8 MB; the tab crashed | as above, long distance 7.1 MB | tens of KB | 7.7 MB for Catalonia | as above |
| The build | one graph, one solve | a graph per region, each on its own, in parallel | as by region, then cut | by region, plus long distance's graph | as today, then tile |
| The engine | every Train | the loaded regions' Trains | a Trip crosses tiles: its shape and slots cut or repeated | as by region, plus every long-distance Train | unchanged |
| Lines side by side across a cut | – | none: a region's track is its own | a Stretch, curve or slot cut at each tile edge | long distance and Cercanías on the same track in two graphs: drawn over each other | unchanged |
| Work | none | manifest by region; page loads what's in view; build loops regions | cut shapes, slots and Trips; page joins them | as by region, plus merging two graphs on shared track | tile in the build, a vector source, Trains still need the shapes |

- **One file** is fine for all of Cercanías, at 2 MB brotli and 6 s to first Trains on the slowed phone. It can't take long distance as built.
- **By region** keeps today's format and page code for each file. Regions don't share track much, but for long distance, which runs through all of them.
- **By tiles** cuts what the engine needs whole: a Trip's shape and slots run hundreds of km.
- **Region in view + high speed everywhere** is where the map wants to end up, but long distance's file has to shrink first, and it and the regions' Lines share Stretches.
- **Vector tiles** shrink drawing, not placing Trains, which is most of the file. Worth it later for the track below zoom 10, where the whole of Spain is in view.

## Recommendation

Split by region now: a manifest entry per region (a Network or a group of them, such as Catalonia's four), each with its track and Trips files as today, and the page loading the regions its view touches.

- It moves forward today. Catalonia's files stay as they are. Each núcleo adds 4–180 KB of track and 2–72 KB of Trips, loaded only near it.
- The build runs each region's `sideBySide` on its own: small graphs, a quick solve, and a failure in one region leaves the others built. Regions can run in parallel.
- The engine moves only the loaded regions' Trains, which keeps it near today's 351 at a time, where the slowed phone holds 60 fps.
- Long distance waits for #216: which Lines it has (the solver takes about 20 a Stretch), and shapes made of shared pieces, so its file is near 1 MB, not 7. Then it can join each region's graph where it runs there, and come as its own file between regions.
- Open for #222: what the page shows zoomed out to all of Spain. A region-at-a-time map needs each region's track below zoom 7 (`tracks`, 2–15 KB each) in one small file.

## Performance ideas for later

- **Engine:** position only the Trains in or near the view, and the followed one. Today every Train costs every frame.
- **Engine:** update only Trains that moved, or draw them in a custom WebGL layer, instead of `setData` with all of them.
- **Bundle:** shapes as lists of shared track pieces, not points: long distance's 1.76M points are 161k distinct.
- **Bundle:** fewer slots, or slots computed in the page from the Stretches a shape runs: ld has 224,742.
- **Bundle:** a binary encoding (`pbf` is already a dependency), with coordinates as integer deltas, parsed in a worker.
- **Build:** read each GTFS file once for every núcleo and day: es reads Renfe's 245 MB 14 more times, 66 s.
- **Build:** split the solver's model by connected component, and above about 20 Lines on a Stretch fall back to the prior order or a heuristic, as LOOM's papers do for large instances.
- **Build:** `onOwnTrack()` with a spatial index: 175 s for 2,207 Stations against 1,115 shapes.
- **Build:** `measures()` by region, or only for regions that changed (#219): over 45 min on ld.
- **Build:** `sideBySide` takes its metres from the first shape's latitude (`lat`, `kx`). Spain runs from 36° to 44°, where a degree of longitude is 10% shorter: take each region's own.
- **Track below zoom 10:** vector tiles, so all of Spain draws from a few small tiles.

## Not measured

- Euskotren, FGV, SFM, Ouigo and metros elsewhere: estimated above from #215's counts, not built.
- Long distance with Lines as #216 will name them: built by product and by product with ends, the two bounds.
- Long distance traced right: its shapes are the Stations' sequence, traced along the rails between them, so 148 legs kept a straight line, 74 of them because the trace found no path. Sizes are about right; the track is not.
- The page loading a split bundle: it loads one file today. The regions' sizes are measured, not their load in the page.
- The page on a real phone, or on the ld bundle (it crashed, so no figures), or with live data.
- A GitHub runner's times.

## Files kept

Outside the repo, in `/Users/guillem.arias/Documents/gariasf/viapeninsula-220-bundle/`:

- `spain.ts` (the build, modes `ct`, `cer`, `es`, `ld`; `LD_LINES=product` for Lines by product, `NO_THROW=1` to keep shapes off the feed's length), `ld.ts` (Renfe's long-distance feed as a Network), `split.ts` (by region), `tiles.ts` (vector tiles), `serve.ts` and `measure-220.template.js` (the page runs), `count.ts` (Trips by núcleo and day).
- `src/`: a copy of `src/` with timing lines in `sideBySide.ts` and `order.ts`, and `traceShapes` able to log rather than throw.
- `out-ct/`, `out-es/`: the bundles. `logs/`: each run's output, `/usr/bin/time` and trace log.
- Rails and the Renfe Cercanías feed are #217's, in `viapeninsula-217-osm/`; the long-distance feed is #215's, in `$TMPDIR/viapeninsula-215/ld.zip`.
