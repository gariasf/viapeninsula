# How the map draws Lines side by side, and where it breaks

Research for #138, after PR #159: a sweep of the whole map for faults in how Lines are drawn where they share track or run close together, what causes each, and a way of drawing them that holds for the rest of Spain.

- **Date:** 2026-09-30, a Wednesday.
- **Data:** the live track `days/track-5d4012e1d2a7.json` (54 Lines, 132 shapes, 887 strokes), drawn two ways. **main** is the track as served. **#159** is the same Lines and shapes through PR #159's `sideBySide()`, which re-running on main reproduces byte for byte.
- **Method:**
  - Six measures over every stroke on the map (section 2), each a scratch script. The scripts are kept with the screenshots, on branch `screenshots-138-study` under `screenshots/138-study/tools/`.
  - A screenshot sweep of 45 spots: fault hot spots the measures found, busy Stations, curves, geography, and a zoom ladder at hubs. That's 322 screenshots at 800×560 CSS px, 2× device pixels, with the Trains hidden. Most spots are at zooms 10.5, 12, 13 and 14; the ladders run from 9 to 11.5 in half steps.
  - One experiment on the map's GeoJSON source (section 3.5).
  - The engine was read where it matters: MapLibre 6.11's line shader and GeoJSON source.
- **Images:** every sheet is centre crops of one spot, one per zoom. `after` is #159, `before` is main.

## TL;DR

- **#159 halves the breaks it counts, and adds a fault it doesn't count.** Breaks go from 812 to 355, but Lines drawn off a track they have to themselves go from 0.9 km to about 28 km. `steady()` keeps a Line that leaves a bundle at a fork at its bundle side for up to a couple of kilometres, as R4 north of Sant Vicenç de Calders (3.3) and T3 past its fork. Don't merge #159's `sideBySide()` change as it stands.
- **Nine faults, on main and #159 alike:**
  - Steps and gaps where Lines join or leave.
  - A Line drawn twice, where its two directions have tracks of their own and get different sides: 11 km of it on main.
  - Lines crossing a whole bundle in the middle of a stretch.
  - Folds and slivers on tight curves when zoomed out.
  - A bundle spreading over a neighbouring Line's track.
  - "Lightning" zig-zags, where several steps land within a few px at junctions, zoomed out.
  - Bundles up to 12 Lines wide, drawn as much as 259 m off their tracks at zoom 12.
  - Ragged ends at termini.
  - Lines of different Networks bundled where their tracks are on different levels.
- **Where it's clean:** a Line on its own track, on any curve (Garraf, Montserrat, Vic, the Maresme), and forks of two Lines (Sant Cugat).
- **Most faults have one of three causes.**
  - Each Line is offset from *its own* track, not from one shared centreline.
  - Sides are chosen *per 50 m piece*, a Line at a time, with thresholds.
  - A change of side is drawn as *two round-capped strokes*, never a curve.
  - Tuning thresholds (NEAR, SHORT, #159's ALONG) swaps one fault for another. #159 and SHORT = 800 m both show this.
- **The published answer is a line graph** (LOOM; Bast, Brosi and Storandt):
  - Edges are stretches where one set of Lines takes one course, each with one averaged centreline.
  - Lines have one order per edge, and crossings are pushed to nodes.
  - At nodes, each Line is joined across with a curve.
  - This fixes six of the nine faults by construction, and it makes the others (folds, width and which Networks bundle) one decision each.
- **The way of working:** measure faithfulness alongside smoothness, keep a fixed spot list with a zoom ladder, and add a hub list each time a region is added (section 7).

## 1. How a Line is drawn today

1. **Track** (`src/build/track.ts`): each shape follows OpenStreetMap's rails, one shape per direction where the directions have tracks of their own ([ADR-0004](../adr/0004-track-follows-openstreetmap.md)). Points are rounded to 1e-5° (about 1 m). Half the segments are under 37 m, and a quarter under 19 m.
2. **Sides** (`src/build/sideBySide.ts`):
   - Every shape is cut into pieces of at most 50 m (STEP), and each piece's neighbours within 135 m (WIDE) are found.
   - Lines on a piece, and Lines on tracks within 45 m (NEAR) that run within 30° of it, form its cluster.
   - `turn()` gives every Line a direction so that neighbours agree. `rank()` gives one order of all Lines over the whole map.
   - `side()` puts each piece's cluster in that order, centred on the piece's own track.
   - Runs of equal side become spans, and spans under SHORT (150 m on main) merge into a neighbour, a Line at a time.
   - A Line's pieces are drawn once each ("done"). Its other shapes only draw pieces it hasn't drawn yet, so on double track each direction draws its own track.
3. **Drawing** (`src/web/main.ts`):
   - Each stroke is one GeoJSON feature: `along(shape, from, to)`, with its `side`.
   - `line-offset` is `side × APART(zoom)` px. APART goes from 1.5 px at zoom 7 to 4 px at 14, then to 0 at 15.
   - Caps and joins are round, and a casing layer goes under the Lines.
   - MapLibre simplifies the source by 0.375 px at every zoom (`options.tolerance ?? .375`, with a 128 px buffer). The shader then moves each vertex along *its join's* extrusion: `offset2 = offset * a_extrude * scale * …`. At a join that extrusion is the miter, 1/cos(θ/2) long, and at round joins it fans.
4. **What an offset is on the ground:** side × APART(z) × metres per px. That's about 146 m per line width at zoom 10, 47 m at zoom 12 and 14 m at zoom 14. So the same stroke sits hundreds of metres off its track zoomed out and tens of metres zoomed in, while its geometry, and the Station dots, stay on the rails.

## 2. The measures

| Measure | main | #159 | Tool |
|---|---|---|---|
| Breaks (#138's yardstick): steps / stubs / swaps / joins | 645 / 18 / 65 / 84 = **812** | 323 / 18 / 11 / 3 = **355** | `breaks.ts` (on #159's branch) |
| Changes of side by size, in line widths: 0.5 / 1 / 1.5 / ≥2 | 403 / 158 / 39 / 45 | 209 / 67 / 20 / 27 | `steps.ts` |
| Runs that end mid-shape at a side other than 0 | 87 | 88 | `steps.ts` |
| Lines on one track drawn on top of each other | 176 m | 0 m | instrumented `sideBySide()` |
| **Drawn off a track no other Line is beside** | **≈0.9 km** | **≈28 km** (T3, T2, R4, T6, R8, R16 …) | `alone.ts` |
| **A Line drawn twice** (strokes of two of its shapes within 30 m, drawn ≥ half a width apart) | **11.0 km** (T5, R4, R8, R7, R13 …) | **17.0 km** (R4, R1, R17, R15, R14 …) | `double.ts` |
| Offset folds predicted at zoom 10 / 11 / 12 / 13 | 64 / 51 / 17 / 3 | 83 / 53 / 21 / 0 | `fold.ts` |
| Length drawn ≥1 / ≥2 / ≥4 widths off its track | 45 / 20 / 2.5% | the same | `width.ts` |
| Furthest off its track (side 5.5, at Sants) | 811 m at z10, 259 m at z12, 79 m at z14 | the same | `width.ts` |

What the table says:
- #159's gain is real for the breaks it counts. It cost faithfulness in two measures that `breaks()` can't see.
- A Line drawn twice is a bigger fault than the steps, and it's on main already.
- **Folds come from the zoom, not the shapes.** Without the tiles' simplification the model predicts about 2,100 folds at zoom 10, from the 1 m jitter on short segments. The simplification hides all but about 80, and those sit where bundles are wide and curves tight (3.4).

## 3. The faults, spot by spot

### 3.1 Steps and gaps where Lines join or leave

A change of side is two strokes, the first ending and the second starting beside it, each round-capped. It shows as a jog of 2 px per half width at zoom 14. Where the membership flickers, as tracks run in and out of 45 m of each other, it shows as a gap with overlapping ends.

- **Encants:** R2 and R11 break twice within about 50 m, out 3 widths and back, with a gap. It shows from zoom 13 ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-s-encants.jpg), and again at [El Clot](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-b-clot.jpg)).
- **Sant Vicenç de Calders:** R13 joins the bundle with a gap and a step ([#159](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-f-sant-vicenc.jpg)).
- **Vallvidrera:** the FV funicular, beside FGC's S1/L6 bundle, is drawn in separate pieces, some in the bundle and some not ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-g-vallvidrera.jpg)).
- **Tarragona:** the cyan Line leaves in a pointed stub at the Station, and short orange pieces run along the bundle's lower edge ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/sheet-regional.jpg), bottom left).

![Encants](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-s-encants.jpg)

### 3.2 A Line drawn twice

A Line's two directions have shapes of their own wherever they have tracks of their own. Each draws the pieces the other didn't. Where the two tracks' clusters differ, the two strokes get different sides, and the Line shows twice, often with one copy ending in a stub. 11 km of it on main, 17 km on #159.

- **Urgell–Universitat and Plaça de Catalunya:** R1 and R4 each show twice at zoom 14, one copy on each edge of the bundle, with a detached curve at Aribau ([Urgell](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-s-urgell.jpg), [Catalunya](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-b-catalunya.jpg)).
- **Torrassa:** R4 twice, one copy ending in a stub on the bundle ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-s-torrassa.jpg)).
- **Marina:** L1 twice ([Arc de Triomf](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-b-arc-triomf.jpg), zoom 14).
- **Lleida:** RL4 and R13 twice at zoom 13–14 ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/sheet-regional.jpg), top right).
- **Glòries:** T4 shows as two teal lines at zoom 14. Here the two tracks really are about 20 m apart (5 px at zoom 14), so the geometry is true, but it still reads as two Lines. How to show it is a question in its own right (section 6).

![Urgell–Universitat](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-s-urgell.jpg)

### 3.3 Lines kept beside a bundle they've left (#159 only)

`steady()` judges which Lines are beside a piece over the 2 km of track either way. Near a fork, that stretch reaches back onto the track the leaving Line shared, and the others count as beside it until the window has mostly passed the fork. So the leaving Line stays at its bundle side off its own track. 28 km of it, against 0.9 km on main. The tests in #159 covered a Line on a nearby track, not a Line branching off track it shared.

- **Sant Vicenç de Calders:** north of the fork, one direction of R4 is drawn 3 widths off its track for about 1.3 km, up to 1.4 km from the Station. Next to the other direction, R4 shows twice ([#159](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-f-sant-vicenc.jpg), zoom 12–14). Main has a different fault here: a stray R4 stub lying on the bundle west of the fork ([main](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-before-f-sant-vicenc.jpg)).

![Sant Vicenç de Calders, #159](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-f-sant-vicenc.jpg)

### 3.4 Folds and slivers on tight curves, zoomed out

On the inside of a curve tighter than the offset, the offset polyline turns back on itself, and MapLibre draws the reversed segments. Wide bundles on tight curves fold first. `fold.ts` puts 86 of #159's predicted folds at Can Tries–Gornal, then Martorell Vila (16), Sant Boi (12), Zona Universitària (8) and Besòs (7).

- **Gornal:** FGC's seven-Line bundle makes an S-bend under the Rodalies bundle. At zoom 12 it knots, and at 13 its inner Lines overlap ([crop](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/crop-gornal.jpg): 13 left, 12 right).
- **Martorell Vila:** the inner Line kinks at zoom 13 ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-f-martorell-vila.jpg)).
- **Besòs:** T5 hooks at Parc del Besòs ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-f-besos.jpg)).

![Gornal](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/crop-gornal.jpg)

**Experiment: coarser simplification.**
- The model predicts that a GeoJSON `tolerance` of 1 px cuts the folds at zoom 9–12 by about 80%, and 2 px by about 95%.
- On screen, with 2 px, the S-bend at Gornal turns into sharp polygon corners, and thin slivers appear along the bundle at zoom 11 and 12 ([0.375 px left, 2 px right](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/tol-gornal.jpg); the Trains' pills show in the left-hand shots only, because the step that hid them ran before they were drawn).
- So tolerance isn't the knob: it trades folds for corners and slivers, which the model misses because it ignores round joins. The fix is a centreline smooth at the scale of the offset (section 5).

### 3.5 "Lightning" zig-zags at junctions, zoomed out

Where several Lines leave a bundle within a few hundred metres, each change of side is a separate step. At zoom 9–10.5, a few hundred metres is a few px, so the steps pile up into a Z. The ladders show it at El Prat, where R2N leaves the bundle at Viladecans: it steps out, back and over within a few px ([zoom 9.5, 10 and 10.5, #159](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/zoom-el-prat.jpg)). A smaller jag shows at the Bellvitge corner and where R4 and R8 meet FGC's bundle at Martorell Central, on main and #159 alike. At Sants and Glòries the map is too busy at those zooms to tell. A Line's own curves never zig-zag: the single-Line ladders (Vic, the Maresme, Garraf) are smooth at every zoom. R8's wobble between Castellbisbal and Rubí at zoom 10 follows its track, with no fold or step in it ([ladder](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-z-rubi-r8.jpg)).

![El Prat, zoom 9.5 to 10.5](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/zoom-el-prat.jpg)

### 3.6 Lines crossing a whole bundle mid-stretch

`rank()` gives every Line one place in one order for the whole map. Where a Line's place is on the far side of a bundle from where its track leaves, it crosses the bundle when its cluster changes, which is mid-stretch rather than at a Station or fork.

- **Urgell and Torrassa:** R1 and R4 jump 4.5–5 widths across the bundle (the largest steps on the map).
- **Monumental and Sicília:** T4 and T5 jump 3.

LOOM calls these crossings and restricts them to nodes (section 5).

### 3.7 A bundle spreading over a neighbour's track

Tracks more than 45 m apart are separate, but zoomed out a bundle's width in px is wider than that gap. At zoom 12, five Lines take about 16 px, which is about 235 m.

- **Martorell:** R4 and R8 run on their own track close beside FGC's, but more than 45 m from it,, and FGC's bundle runs over them at zoom 12–13 ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-f-martorell-vila.jpg)).

![Martorell Vila](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-f-martorell-vila.jpg)

### 3.8 Width at hubs, and Lines of different Networks and levels bundled

- **Width:**
  - At Sants, 12 Lines side by side put the outer ones up to 79 m off their track at zoom 14 and 259 m at zoom 12. The Station dots stay on the rails, inside the bundle.
  - Inside the bundle some Lines cross over others near the Station at zoom 14, because each Line is offset from its own track and neighbouring tracks' offsets don't nest ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-b-sants.jpg)).
- **Networks and levels:**
  - Proximity alone decides who is bundled, so a tram can join the Rodalies bundle in the tunnel below. Between Sicília and Glòries, where T4's tracks come within 45 m of the tunnel, a T4 stroke lies over the Rodalies bundle and ends in the middle of it ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-s-sicilia.jpg)).
  - L3 under the Diagonal bundles with T1–T3, and L1 with R1 between Arc de Triomf and Marina. Those read well, so the question is consistency, not whether they may bundle.

### 3.9 Ragged ends at termini

Lines that end together end at different points, because each Line's run ends where its own shape does. FGC's L6/S Lines at Plaça de Catalunya fan out at the end ([Catalunya, zoom 14](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-b-catalunya.jpg)).

### 3.10 Clean

- **A Line on its own track, through any curve:** Garraf, Montserrat's rack and R5, Manresa, the Maresme, Vic ([geography](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/sheet-geo1.jpg), [ladders](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/sheet-ladder.jpg)).
- **Small forks:** S1/S2 at Sant Cugat move over by 2 px and read as one fork ([sheet](https://raw.githubusercontent.com/gariasf/viapeninsula/02dc1e2f511ca2038017b453bebef1cf6c4ed030/screenshots/138-study/detail-after-b-sant-cugat.jpg)).
- **Other clean spots:** Montcada, Girona, Granollers, the airport, Mataró.
- **Improved by #159:** Martorell's FGC bundle, Torrassa and Santa Eulàlia's R1/R4/L1 pieces, and L5 at Sants.

## 4. Root causes

| Cause | Faults |
|---|---|
| **C1. Each Line is offset from its own track.** Neighbouring tracks up to 45 m apart each carry their own geometry and jitter, so their offsets don't nest. | 3.2, 3.7, the crossings inside the bundle at Sants |
| **C2. Sides are chosen per 50 m piece, a Line at a time.** Clusters differ between neighbouring tracks and between a Line's two directions. The fixes are per-Line thresholds: SHORT merges a Line's spans on its own, and #159's ALONG looks at a fixed length of track. | 3.1, 3.2, 3.3 |
| **C3. A change of side is a hard step.** `line-offset` is constant along a feature, so a new side needs a new feature. | 3.1, 3.5, 3.9 |
| **C4. One order for the whole map.** It can't suit every fork, and nothing puts the crossings at Stations or forks. | 3.6 |
| **C5. Offsets in px on geometry in metres.** Nothing smooths a centreline at the scale of its offset, MapLibre offsets each vertex along its miter with no loop removal, and the tiles' simplification changes the corners with each zoom. | 3.4 |
| **C6. Proximity alone decides who is bundled, and how wide a bundle may get.** | 3.7, 3.8 |

Each threshold fix lands on a different fault:
- SHORT = 800 m halves the breaks and draws Lines on top of each other for 3.5 km.
- #159 halves them and drags Lines off their track for 28 km.
- A GeoJSON tolerance of 2 px removes folds and adds corners and slivers.

## 5. How it's done elsewhere, and what fits

**LOOM** (Line-Ordering Optimized Maps; Bast, Brosi and Storandt, "Efficient Generation of Geographically Accurate Transit Maps", [SIGSPATIAL 2018](https://dl.acm.org/doi/10.1145/3274895.3274955), extended in [ACM TSAS 5(4), 2019](https://dl.acm.org/doi/10.1145/3337790); [arXiv:1710.02226](https://arxiv.org/abs/1710.02226); code at [ad-freiburg/loom](https://github.com/ad-freiburg/loom)) draws geographically accurate transit maps from GTFS in three stages:

1. **A line graph.** Each edge is a stretch where "the same set of lines takes the same geographical course (within a certain tolerance)", with a node wherever that set splits. Where two paths share a stretch, the edge's path "is averaged from the shared segments". The sweep that finds shared stretches tolerates short excursions over the threshold, as `steady()` meant to, but on the graph rather than per Line.
2. **One order per edge,** found by an integer linear program that minimises line crossings and "separations", where Lines that run together part. Crossings may happen only at nodes, and weights push them to Station nodes. Lines that always run together are bundled in a fixed order (their Lemma 4.1), and the graph is pruned before solving. New York's subway solved in under a second.
3. **Drawing:**
   - Each Line is offset from its edge's single geometry by its place in that edge's order.
   - Each node is drawn as a polygon, with a "node front" for each edge that meets it. The edges are cut back to make room.
   - Each Line's ports are joined across the node with a cubic Bézier curve.

**railisland** keeps one geometry per track and doesn't offset at all ([its study](railisland-trains-on-track.md), section 1). Our zoomed-out side-by-side look is worth more than that simplicity, but its lesson holds: a drawn Line should be one geometry, not a stack of offsets on different tracks.

**What fits here:**
- **C1, C2:** LOOM's graph gives one centreline per shared stretch and one set of Lines per edge. A Line counts once per edge, whichever direction and whichever track it runs on.
- **C3:** a curve at each node.
- **C4:** one order per edge, with crossings at nodes.
- **What LOOM leaves open for us:**
  - C5, because its renderer draws SVG at one scale while ours offsets in px at every zoom.
  - C6, which is a policy question.
- **What changes for us:**
  - **Offsets vary by zoom.** An edge's order and side are fixed, so MapLibre's `line-offset` can still draw edges, since it's constant along one. Only the curves at nodes depend on the zoom. They are few (a few hundred nodes) and short, so they can be drawn per zoom band from the build, or computed in the page when the zoom settles.
  - **Centrelines need smoothing at the scale of the offset:** an edge drawn up to *k* widths off its centreline at zoom *z* needs curves no tighter than *k* × APART(z) × metres per px. That can be one smoothed centreline per zoom band, or a floor on the bend radius.
  - **Trains:** today `sides` puts each Train on its stroke. It would put them on their edge's slot instead. That's the same idea, with no per-Line `sides` list.

## 6. Decisions for the maintainer

1. **#159:** keep the yardstick, and drop `steady()` (and probably the SHORT change) rather than tune it. Or park all of #159 behind the line graph.
2. **A line graph** in the daily build, as the way Lines are drawn side by side (an ADR, since it replaces how `sideBySide()` works and outlives any one ticket).
3. **Who may bundle:** only Lines on the same level, or of kinds of service that share streets, or anything within NEAR as now. That covers T4 beside the Rodalies tunnel near Glòries, and whether T4's two tracks there show as one Line.
4. **How wide a hub may get:** Sants' 12 Lines are 259 m wide at zoom 12. The options are to cap the width, narrow the spacing in wide bundles, or accept it.
5. **Words:** "bundle" in #138 and the code means Lines side by side, but CONTEXT.md uses it for the data bundle. A term for a shared stretch belongs in CONTEXT.md once the design is picked.

## 7. A way of working for the rest of the map

- **Measure faithfulness next to smoothness.** Every change to how Lines are drawn reports breaks, Lines drawn twice, Lines drawn off a track they have alone, Lines on one track drawn on top of each other, and folds per zoom. #159 improved one of these and worsened two.
- **Keep a spot list and a zoom ladder.** The study's 45 spots (`tools/spots.json`) cover its categories: fault hot spots from the measures, busy Stations, forks, tight curves, terrain, and mixed Networks. Before-and-after sheets at zoom 10.5, 12, 13 and 14, plus the 9–11.5 ladder at hubs, catch what the measures miss. Each new region adds its hubs: for Madrid, Atocha, Chamartín, Nuevos Ministerios and Príncipe Pío.
- **Let the measures pick the spots.** `fold.ts`, `steps.ts`, `double.ts` and `alone.ts` found most of the worst places before any screenshot.
- **Think per zoom.** Anything in px meets geometry in metres, so check it at every zoom band. Folds happen at 10–12 and are gone by 13.
- **Test the shapes that break things:**
  - a fork where the leaving Line shared the others' track;
  - a Line whose two directions have tracks of their own;
  - a tight S-bend in a wide bundle;
  - a tram over a tunnel;
  - two Lines that come in and go out on opposite sides.
- **Change the representation, not the threshold.** When two thresholds each fix one fault and cause another, the model is missing a concept. Here that concept is the shared stretch.

## 8. Tickets this suggests

1. **Measures for drawing Lines:** `breaks()` plus Lines drawn twice, Lines drawn off a track they have alone, Lines on one track drawn over each other, and folds per zoom, run by the daily build and logged. The spot list and sweep go in the repo too.
2. **A line graph in the build** (ADR first): stretches of one set of Lines, each with an averaged centreline, and short stretches merged on the graph. It emits today's `Stroke`s, one per edge per Line, so `main.ts` draws it unchanged. That alone removes 3.2 and 3.3 and most of 3.1.
3. **One order per edge,** with crossings and separations minimised and pushed to Stations and forks (3.6).
4. **Curves at nodes** instead of steps (3.1, 3.5, 3.9).
5. **Centrelines smooth at the scale of their offset,** per zoom band (3.4).
6. **Who may bundle, and how wide** (decisions 3 and 4, then 3.7 and 3.8).

## Appendix: the sweep

All sheets are on branch `screenshots-138-study` under `screenshots/138-study/`:
- `detail-after-<spot>.jpg` and, where main was also shot, `detail-before-<spot>.jpg`: zoom 10.5, 12, 13 and 14.
- `ladder-l-*.jpg`: zoom 9 to 11.5, main above #159.
- `sheet-*.jpg`: several spots at a time.

The spots and their categories:
- **Fold hot spots:** Can Tries–Gornal, Martorell Vila, Sant Boi, Zona Universitària, Besòs, Sant Vicenç de Calders.
- **Step hot spots:** Torrassa, Urgell, Encants, Sicília.
- **Busy Stations:** Sants, Catalunya, Arc de Triomf, El Clot, La Sagrera, Espanya, L'Hospitalet, Cornellà, Montcada, Sant Cugat, Granollers, Girona, Lleida, Tarragona, Reus.
- **Geography:** Garraf, Montserrat, Vallvidrera, the airport, El Prat, the Diagonal, Glòries' trams, Mataró, Manresa.
- **Curve ladders:** R8 at Rubí, Garraf, Montcada, the Llobregat, the Maresme, Vic.
- **Hub ladders:** El Prat, Bellvitge, Sants, Glòries, Martorell.
