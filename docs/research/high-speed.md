# High speed and long distance: data, track, engine and map

Research for #216, under #214. It feeds the grill in #222. It builds on #215's note, [spain-feeds.md](spain-feeds.md) (PR #224), for which feeds exist, and on #217's note, [osm-rails-spain.md](osm-rails-spain.md), for the rails. Neither is repeated here.

- **Date:** Sunday 4 October 2026, 10:45–11:05 CEST.
- **Weekend caveat:** live samples are from a Sunday morning. Trips per day are from the timetable for Monday 5 October.
- **Method:** downloaded Renfe's AVE/LD/MD GTFS (`google_transit.zip`, `Last-Modified` Sat 3 Oct 23:06 UTC) and its two LD live feeds and the web visor, eight snapshots 10:48–10:58. Counted with scratch scripts outside the repo. Traced eleven Trips on #217's peninsula rails (data of 3 Oct) with a copy of the build's `fine` and `traceShapes`, its 5% check turned into a log line.
- **Terms:** as in CONTEXT.md. "LD file" is the AVE/LD/MD GTFS. "Long distance" below means AVE, Avlo, Alvia, Euromed, AVE Int, Intercity and Trencelta; Avant and MD are the file's regional high speed and regional trains.

## TL;DR

- **One Train is many Trips.** The LD file lists a Train once for each part of its run it sells: Alvia 00622 Barcelona–Vigo is six Trips. Of Monday's 1,588 Trips, 223 repeat a Train number. Live data names whichever part, so 15 of 125 positions sat over 20 km off the Trip they named. v1 would draw these Trains two or three times. Trains must be keyed by Train number, as CONTEXT.md already defines it.
- **Stations join.** Every LD Station is an Adif code, shared with the Cercanías file (Sants is 71801 in both). Abroad they are UIC codes: 87xxx in France, 94xxx and 96xxx in Portugal. Ouigo uses the same codes (#215). 102 Train numbers are in both the LD file and Rodalies on Sunday, so Catalonia's regionals need deduping across feeds.
- **Track is there.** OpenStreetMap has 5,932 km of standard-gauge running track in Spain, 363 km of dual gauge, and 29 `railway=gauge_conversion` nodes. Traced on standard gauge only, AVE Madrid–Sevilla came out at 470 km and Madrid–Barcelona at 627 km, close to the real lines. Traced on every gauge, AVEs ran through gauge changers and took detours. So each kind of service needs its own rails.
- **The feed has no shapes,** so the build's 5% check has nothing to compare with. A trace came out 12–29% longer than the straight line between its Stations.
- **The engine mostly holds.** Midnight is fine: six Trips run past 24:00, the latest to 24:52. What breaks is speed: AVE hops average up to 242 km/h, and the Delay rule that snaps a Train over 1 km off is only 12 s at 300 km/h. And `STOPPED_AT` in the LD feed doesn't mean standing: only 6 of 177 such positions were within 500 m of their Station.
- **Zoomed out, there are few Trains.** At most 97 long-distance Trains run at once on Monday (116 with Avant). That's few enough to draw at every zoom, with Lines as one class colour.

## Data

### What's open

From #215: Renfe's LD file and its two LD live feeds (positions and trip updates) are CC-BY 4.0, keyless, and join their Trips at 100%. Ouigo has a timetable only. Iryo has nothing. Nothing new was found for Ouigo or Iryo.

### One Train, many Trips

| Monday 5 Oct | |
|---|---|
| Trips | 1,588 |
| Train numbers | 1,365 |
| Numbers with more than one Trip | 145: AVE 42, MD 41, Alvia 32, Avlo 9, Regional 6, Intercity 5, AVE Int 4, Euromed 3, Reg.Exp. 3 |
| Trips beyond each number's longest | 223: 162 a part of it with the same times, 56 not a part of it, 5 a part with other times |
| Identical twins (same calls, same times, same calendar) | 13 numbers, e.g. Alvia 00190 Madrid–Badajoz as `0019012026-10-04` and `0019022026-10-04` |

- **Parts of a run.** Alvia 00622 Barcelona–Vigo comes as Barcelona–Vigo, Barcelona–Ourense, Lleida–Vigo, Barcelona–León, Barcelona–Zaragoza and Vitoria–León. AVE 03309 comes as Madrid–Figueres and Madrid–Barcelona. Times can differ by a minute or two at the last Station of a part (00622: Ourense 20:59 against 21:01). That's arrival against departure.
- **Joining and splitting.** Intercity 01460 is three Trips: Cartagena–València, Lorca–València and Murcia–València. Two Units join at Murcia. Intercity 01463 splits there the other way. CONTEXT.md already allows one Train as several coupled Units.
- **Odd ones.** Reg.Exp. 17307 Soria–Madrid has a part that reaches Baides at 20:30 and another leaving Baides at 19:55. Not explained.

Live data names any of the parts:

| Sunday 10:48 | Positions | Trip updates |
|---|---|---|
| Entities | 125 | 203 |
| Join a Trip | 125 | 203 |
| On a number with several Trips | 39 | 50 |
| Of those, naming the longest Trip | 16 | 19 |
| Numbers listed twice in one file | 15 (same coordinates every time) | 24 |
| Over 20 km off the straight lines between the named Trip's Stations | 15 | – |
| … of which within 20 km of another Trip of that number | 10 | – |

- Example: AVE Int 09730 was named on its Barcelona–Madrid Trip while at 43.06° N 3.02° E, in France, on the part of its run from Marseille.
- The vehicle's `label` is always the Train number (125 of 125). The `vehicle.id` is `VP_` plus it.
- Trip updates for the several Trips of one number never disagreed on Delay (105 numbers).
- 70 of 203 trip updates were `CANCELED`, all for other Train numbers than the 133 running: 35 Reg.Exp., 13 Regional, and a few AVE, Alvia, Avant and Euromed. Not looked into.

So the build should merge a number's Trips into one Train: the union of their calls where one is part of another, and one Train per branch where they split or join. Live data then joins by Train number, not `trip_id`.

### Stations

- All 1,006 stops are 5-digit codes. Inside Spain they are Adif's, 240 of them metre-gauge `05xxx` (#215).
- Abroad: Perpignan, Narbonne, Montpellier, Nîmes, Avignon TGV, Aix TGV, Marseille, Valence TGV and Lyon as `87xxx` (SNCF's UIC prefix). Viana do Castelo, Barcelos, Nine and Porto Campanhã as `94xxx`/`96xxx` (Portugal's).
- Codes match the Cercanías file's: Sants 71801, Girona 79300, França 79400, same name and coordinates. v1's Rodalies Stations are `adif:` plus that code, so a long-distance Train at Sants stops at the same Station as Rodalies.
- Ouigo's are `0071` plus the Adif code (#215). So Ouigo joins too, by stripping the prefix.
- **Rodalies overlap.** On Sunday 4 Oct, 102 Train numbers are in both the LD file and Rodalies (núcleo 51): 54 Reg.Exp., 30 Regional, 18 MD. They are Catalonia's regional lines, R11–R17. Dedupe by Train number and overlapping stops, as CONTEXT.md says, and keep Rodalies', which has shapes.

### Live

- **Positions are real GPS.** None of 177 `STOPPED_AT` positions was at its Station's point. Unlike Cercanías, Renfe doesn't pin LD Trains to Stations.
- **But `STOPPED_AT` doesn't mean standing.** Only 6 of 177 were within 500 m of the `stopId`, and the median was 16 km. Against the visor, `stopId` was the next Station for 26 of 55 `STOPPED_AT` and 63 of 76 `IN_TRANSIT_TO`.
- **No timestamp per position** in the GTFS-RT feed (#215). The visor (`flotaLD.json`) has the same positions (131 of 131 identical) and a `time` for each Train: a median 9 s older than the file, p90 35 s, max 234 s.
- **Delays agree.** The visor's `ultRetraso` matched the trip updates' Delay within a minute for 101 of 101 Trains. Both are Renfe's, so this doesn't say they're right.
- The visor's `mat` field looks like a Unit number (e.g. `120058`, a class 120). Not checked.

## Track

### Gauges and high speed in OpenStreetMap

Spain alone (`spain-rails.json`, #217), `railway=rail` running track (no `service` tag), each track counted:

| Gauge | Running km | Service km |
|---|---|---|
| 1668 (Iberian) | 14,340 | 3,149 |
| 1435 (standard) | 5,932 | 424 |
| 1435;1668 and 1668;1435 (dual) | 373 | 105 |
| 1000 | 111 | 7 |
| none | 66 | 90 |

- **`highspeed=yes`:** 5,727 km of standard gauge, 1,243 km of Iberian gauge, 12 km dual. The Iberian ones are lines built for high speed and opened on Iberian gauge (not looked into one by one).
- **`maxspeed` on standard gauge:** 4,442 km at 250 km/h or more, 920 km at 200–249, 776 km under 200, 171 km untagged.
- **`usage`:** 5,822 km of standard gauge are `main`.
- **Metre gauge** is `railway=narrow_gauge` almost everywhere: only 111 km is `rail`. The ex-FEVE Lines in the LD file need `narrow_gauge` rails.
- **Gauge changers:** 29 nodes tagged `railway=gauge_conversion` (about 20 sites; some have one node per track). Named ones include Zaragoza Delicias, Plasencia de Jalón, Valencia, Albacete, Burgos, Villamuriel, Vilecha, León Clasificación, Campomanes, Taboadela and La Boella. The wiki has no page for this tag (`Tag:railway=gauge_change` is a 404, 4 Oct). It is in use, not documented.
- **`railway:preferred_direction`:** only 260 km of the 6,300 km of standard and dual gauge carry it (4%).

### Running side

- García Álvarez (FFE, 4th ed., August 2010, [PDF](https://vialibre-ffe.com/pdf/ViaDoble_Espa%C3%B1a_21092010.pdf), read 4 Oct) lists the high-speed lines of the time (Madrid–Sevilla, Córdoba–Málaga, Madrid–Barcelona, Madrid–Valladolid, Madrid–Valencia, Figueres–Perpignan to km 13) with the right-hand lines. On high-speed lines both tracks are signalled both ways, and the usual way is the "sentido preferente" (p. 20).
- At Figueres–Perpignan the tracks cross on a flyover at km 13 from Perpignan, to change to France's left (p. 22).
- The same book argued in 2010 for the left on the lines north of Madrid (p. 43). Whether lines opened since (Galicia, Asturias, León, Burgos, the Basque Y works) run right was not checked.
- OpenStreetMap agrees where tagged: of 121 km of `preferred_direction` standard-gauge track with a partner track 3–8 m away, 120 km run on the right. But only about 22 km of that is on high-speed lines, all in Catalonia.
- Live GPS can't tell: of 86 positions within 3 m of a standard-gauge track with a partner, 46 were on the right and 40 on the left. GPS error is bigger than the 4.3–4.7 m between tracks (García Álvarez, p. 19).

### A trial trace

Eleven Monday Trips, the one with most calls for each pair of Stations, traced with the build's code. Each "feed shape" is the straight line through its Stations, as the feed has none. Running side right.

| Trip | Standard gauge only | Every gauge |
|---|---|---|
| AVE 03309 Madrid Atocha → Barcelona-Sants | 627.2 km | 627.2 km |
| AVE 02070 Madrid Atocha → Sevilla | 470.4 | 470.4 |
| AVE 02162 Madrid Atocha → Málaga | 512.9 | **527.9** |
| AVE 05100 Madrid Chamartín → València JS | 397.2 | 397.2 |
| AVE 04345 Madrid Chamartín → Ourense | 461.6 | 461.6 |
| AVE 04149 Madrid Chamartín → León | 344.8 | **350.5** |
| AVE 03940 Barcelona → Sevilla | 1,077.2 | 1,077.2 |
| AVE Int 09725 Madrid → Marseille | 1,026.8 km traced, then Avignon TGV off the network | same |
| Alvia 04261 Madrid → Gijón | stops at León: Pola de Lena off the network | 483.4, through Vilecha, León Clasificación and Campomanes changers |
| Alvia 04073 Madrid → Santander | stops at Palencia | 445.5 |
| Euromed 01101 Figueres → Alicante | no path past Camp de Tarragona | 702.6, through La Boella changer |

- **Lengths look right.** Madrid–Sevilla is a 471 km line and Madrid–Barcelona 621 km to Sants (Adif, figures from memory, not checked today). The trace on standard gauge took 1.4 s for all eleven, on 22,007 ways.
- **Against the straight line** the traces are 11.6% to 29.1% longer (Madrid–Valencia, by Cuenca, the most). So the build's 5% check against feed shapes can't apply. A bound on the straight line, say 1.4×, plus the "turns back" and "off the network" logs, would catch a wrong trace.
- **Every gauge is wrong for AVE.** Málaga gained 15 km and León 5.7 km by leaving the high-speed line. So AVE, Avlo and Avant keep to standard gauge.
- **Alvia, Euromed and Intercity need both gauges,** and only change at a changer. On every gauge, Alvia Gijón ran through the changers at León and Campomanes, and Euromed through La Boella, which fits how they run (not checked against Adif). A trace that changes gauge anywhere else should be reported.
- **Passing a changer node isn't changing gauge.** Standard-gauge-only AVE traces also passed changer nodes at Zaragoza, Valencia, Córdoba and Sevilla, where the changer sits on the standard-gauge track.
- **France beyond Perpignan** isn't in #217's extracts: AVE Int to Lyon and Marseille needs Geofabrik's Rhône-Alpes and Provence-Alpes-Côte d'Azur too, or cropping at a border as Catalonia's Lines are cropped today. The French part also runs on the left (above).
- **Avant and MD** weren't traced.

## Engine

### Midnight (#14)

- Monday: 6 of 1,588 Trips run past 24:00, the latest MD 13946 Granada–Almería to 24:52. AVE 03309 Madrid–Figueres arrives 24:02.
- No Trip starts after midnight on the day before. No night trains are in the file.
- The longest Trip is Alvia 00621 Vigo–Barcelona, 07:32–21:40, 14.1 h. It's inside one service day.
- On 25 October (clocks go back): no Trip calls between 02:00 and 03:00.
- So #14's three days and the day before in the manifest already cover it.

### Stations far apart

| Monday | Trips | Median length | Median calls | Median gap between Stations | p90 gap | Longest gap | Median average speed, straight line |
|---|---|---|---|---|---|---|---|
| AVE | 243 | 2.9 h | 4 | 118 km | 296 km | 502 km | 153 km/h |
| Avlo | 37 | 2.9 h | 6 | 69 | 157 | 208 | 148 |
| Alvia | 112 | 4.5 h | 7 | 53 | 119 | 465 | 90 |
| Euromed | 15 | 5.4 h | 5 | 76 | 174 | 174 | 101 |
| Avant | 229 | 1.0 h | 3 | 59 | 118 | 159 | 128 |
| MD | 335 | 2.6 h | 10 | 16 | 46 | 120 | 68 |

On the traced track, 42 AVE hops averaged a median 179 km/h. The fastest was Cuenca–Requena, 133 km in 33 min, 242 km/h. Then Madrid–Zamora 221, Zaragoza–Camp de Tarragona 212, Segovia–Valladolid 208.

What that does to ADR-0002's rules:

- **Speed profile.** `run()` cruises at the lowest speed that arrives on time, so a 300 km/h top speed with gentler acceleration fits these averages. Today's profile is one per Network. The LD file mixes AVE at 300 km/h with MD at 160, so it needs a profile per kind of service (or a Network per kind).
- **Snaps.** `JUMP_DIST` is 1 km and `JUMP_TIME` 60 s. At 300 km/h a kilometre is 12 s. Positions without a timestamp can be 35 s old (the visor's p90): 3 km. So many corrections would snap where on Rodalies they ease. The thresholds should be in time, or scale with speed.
- **Holding at Stations (#39).** Not for LD: `STOPPED_AT` doesn't mean standing (Data). The hold rule would stop Trains 16 km short of the Station.
- **Delay from GPS.** As for Rodalies, the Delay can come from the position while Live and moving. Long gaps between Stations make that more useful, not less: a Train an hour from its next Station isn't otherwise placed. Tunnels such as Guadarrama (28 km) and Pajares (25 km) will hide Trains for minutes; `CARRY` (30 min) covers it.
- **Position age.** Take it from the visor's `time` where possible, or the file's header. The visor isn't in Renfe's catalogue, and has no stated licence (#215).

## Map

### How others show it

| Map | High speed zoomed out | Trains zoomed out |
|---|---|---|
| OpenRailwayMap standard style ([standard.mss](https://raw.githubusercontent.com/OpenRailwayMap/OpenRailwayMap-CartoCSS/master/standard.mss), read 4 Oct) | One class colour: `highspeed=yes` is red `#ff0c00`, other main lines orange `#ff8100`, from zoom 6, all the same width at zooms 6–8 | none |
| Renfe's AVE and LD line map ([renfe.com](https://www.renfe.com/es/es/viajar/informacion-util/mapas-y-lineas/ave-y-larga-distancia), read 4 Oct) | AVE in purple, Larga Distancia in grey: by class, not by Line | – |
| Renfe's live visor ([tiempo-real.largorecorrido.renfe.com](https://tiempo-real.largorecorrido.renfe.com/), [press release](https://grupo.renfe.com/es/es/sala-de-prensa/noticias/2026/03/renfe-estrena-web-tiempo-real-trenes-alta-velocidad-larga-media-distancia), read 4 Oct) | A switch between high-speed and conventional lines | "Each train is a circular icon that moves as it goes", icons by class (AVE, Avlo, LD, Avant, MD), coloured by delay (under 15, 15–60, over 60 min) from the legend text. Not opened in a browser. |
| ÖBB Zugradar, SNCF, DB, geOps, NS | not confirmed: JS-only pages, not opened | – |

Every source read draws high speed by class colour, not per Line. None names Lines zoomed out. Nobody publishes AVE "Lines": the LD file's `route_short_name` is the product (AVE, ALVIA, …), and its 656 routes are pairs of Stations.

### Today's map

Below zoom 7 each Network's track is drawn once, in its colour, with no Trains (ADR-0007, #190). That was for Barcelona's 40 Lines in a few pixels. Spain's long-distance Trains are few and far apart: at most 97 at once on Monday at 18:05 (116 with Avant at 19:10, 263 with MD and regionals at 19:45). At zoom 5 a pixel is about 3.7 km, so a Train at 300 km/h moves a pixel every 45 s. Drawing them costs little.

### Options

1. **One Network for long distance, one class colour, Trains at every zoom.** The track drawn once below zoom 7, as #190 does, in one colour (Renfe's purple, or a high-speed red as OpenRailwayMap does), and long-distance Trains as dots on it. Lines side by side only from zoom 7, as today. Moves forward with the least new work. Rodalies keeps its zoom rules.
2. **Classes as Lines.** AVE, Avlo, Alvia, Euromed, Avant, Intercity as the Lines of one Network, each in a class colour, side by side from zoom 7 through ADR-0006's graph. Badges (ADR-0008) would name classes, not routes. Nearer Renfe's own map. More strokes on the Madrid–Zaragoza corridor (AVE, Avlo, Alvia, Ouigo, Iryo would be five).
3. **Operators' colours.** Renfe, Ouigo and Iryo each in its brand colour. Honest about who runs what, but Iryo has no data and Ouigo is Scheduled only, so it would show two thirds of one corridor's operators.
4. **Corridors as Lines** (Madrid–Barcelona, Madrid–Sevilla, …), invented by the project. Reads like a transit map, but nobody publishes them, and many Trains run across two (Barcelona–Sevilla).

For Trains zoomed out, under any option: dots below zoom 7, pills from 7, as Renfe's visor shows dots. No Line names below zoom 7.

## Recommendations

- **Data:** read the LD file and its two live feeds, which the fetcher already gets for Catalonia. Merge each Train number's Trips into one Train, one per branch where Units split or join. Join live data by Train number. Drop LD Trains that Rodalies (and later each núcleo) already has. Take Ouigo Scheduled from the NAP; say in About that Iryo publishes nothing.
- **Track:** rails per kind of service: standard and dual gauge for AVE, Avlo and Avant; both gauges, changing only at a `gauge_conversion` node, for Alvia, Euromed and Intercity; Iberian and `narrow_gauge` for MD and ex-FEVE. Running side right in Spain. Check traces against the straight line between Stations, not feed shapes. Crop at the French and Portuguese borders for now.
- **Engine:** a speed profile per kind of service. Jump thresholds in time. No hold at Stations for LD. Position age from the visor. Midnight needs nothing.
- **Map:** option 1 first: one long-distance Network in one colour, Trains drawn at every zoom. Option 2 later if the maintainer wants classes. Performance can be looked at once it draws.

## Questions for #222

- Is long distance one Network ("Renfe long distance", as CONTEXT.md has it), or one per class (AVE, Alvia, …), or per operator?
- One colour for high speed, or a colour per class? Renfe's purple, or a high-speed red?
- Do long-distance Trains show below zoom 7, where Rodalies' don't?
- Are Avant and MD long distance, regional, or a Network each? MD alone is 335 Trips a day.
- Ouigo: draw it, Scheduled only, from a MERITS export last mirrored in July? In the same Network as Renfe's?
- Iryo: leave it out and say so in About?
- AVE Int to Lyon and Marseille: stop the track at the border (Figueres or Perpignan), or trace into France?
- Trencelta to Porto: stop at Tui, or trace into Portugal?
- When one Train splits (Intercity 01460 at Murcia), one Train on the map with two ends, or two?
- Use the visor (`flotaLD.json`) for position age, though it isn't in Renfe's open-data catalogue?
- Which long-distance first: Catalonia's (Madrid–Barcelona–Figueres, Euromed), the whole AVE network, or everything in the LD file?

## Unverified

- Real lengths of the lines (471 km, 621 km) are from memory, not a source read today.
- That Alvia Gijón and Euromed really change gauge at the changers the trace used.
- Running side on high-speed lines opened after 2010.
- What `mat` and `p` are in the visor.
- Why 70 trip updates were `CANCELED`.
- How the other national maps (ÖBB, SNCF, DB, geOps, NS) draw high speed: their pages need a browser.
- A weekday live sample: all live numbers here are Sunday's.

## Re-verify quickly

The scratch scripts are in `$TMPDIR/viapeninsula-216/code/` (not kept). Two of the counts:

```sh
# Positions naming the same Train twice
curl -s https://gtfsrt.renfe.com/vehicle_positions_LD.json | jq '[.entity[].vehicle.vehicle.label] | group_by(.) | map(select(length > 1)) | length'
# Gauge changers in #217's extract
osmium tags-filter -o - -f opl peninsula-rails.osm.pbf n/railway=gauge_conversion | wc -l
```
