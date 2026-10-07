# Alerts: what each feed says, and how it could go on the map

Research for #279 (show incidents on the map where they happen), under #234. It comes before #279's grill. It builds on [live-data-sources.md](live-data-sources.md), [live-at-scale.md](live-at-scale.md) and [spain-feeds.md](spain-feeds.md), and doesn't repeat them.

- **Date:** Wednesday 7 October 2026, 11:39–12:35 CEST. It was the morning after heavy rain in Catalonia: several Rodalies Lines were cut or run by bus.
- **Method:** Renfe's alerts were fetched at 11:39 as JSON and as protobuf, and then polled every 2 minutes from 11:46 to 12:32 to see how often the file changes. The protobuf was decoded with `pbf`, as the fetcher decodes FGC's trip updates. FGC's alerts file was fetched once, in three requests to its portal (the dataset, the lookup, the file). Renfe's Cercanías GTFS of 7 October (written 02:08 UTC) was downloaded for its route IDs, Station names and bus Trips. Lines, Stations, Trips and slots come from a dry-run bundle of 6 October (`out/`), FGC's timetable from the build's cache (2 October). Scripts are in a scratch dir, not in the repo.
- **TMB and TRAM:** their alerts were fetched once each at 12:35, with the keys the fetcher already holds, with the maintainer's OK. TMB's API docs need a login, so its endpoint comes from public code.
- **One morning:** every count is from one fetch on one day, and a day of disruption at that.

## TL;DR

- **Renfe's alerts are the only feed with the day's incidents in it.** 69 alerts across every Cercanías núcleo, 9 of them Rodalies'. They name Lines, never stretches: each alert names every route of its Lines, rail and bus alike, so a route_id says no more than the Line's name. Where the trouble is, only the text says.
- **Each alert has a start and a text, and nothing else.** No end, no cause, no effect, no header, no link field. Planned works give their dates in the text only. Alerts linger: the oldest started in June 2025. One from 17:13 the evening before still said buses ran in place of every Rodalies Line, beside newer ones saying R1, R3 and R8 Trains ran, while 42 Rodalies Trains were live.
- **The text can be read, but only with its verb.** In today's Rodalies alerts a reader finds 7 stretches. A simple pattern finds 6 of them, and matches both ends to Rodalies Stations for all 6. But 3 of the 7 are where Trains *run*, 1 is single-track working, and only 3 are closed.
- **Planned closures are in the timetable, Station by Station.** Renfe lists its replacement buses as bus Trips (route_type 3) under the Line's name, at the Stations' own codes, with their dates: R3 and R13 today, Madrid's C8 on 10–12 October, as its alert says in words. Incidents aren't: R1 had buses from Blanes to Maçanet-Massanes today by its alert, while the timetable still had 34 R1 Trains through Tordera.
- **FGC's alerts carry no incidents today.** 333 notes, each on one Trip at one Station: cars reserved for school groups, connections with the Montserrat rack railway, late bus links. Catalan, with no language tag.
- **TMB's and TRAM's alerts sit behind their keys,** in Catalan, Spanish and English, with dates. TMB's 12 each named a Station, often an entrance, and all were about getting in: closed entrances, lifts, escalators, passages. TRAM's 2 named Lines, and both were closures, the stretch given in the text: T1–T3 between Francesc Macià and Montesa on 10–12 October, and T5–T6 between Glòries and Can Jaumandreu until spring 2027. Both sets of terms forbid altering what they publish.
- **A timetable carries some closures, not all.** TRAM's already leaves out T5–T6's closed stretch. But its file of 6 October still runs every T1–T3 Trip through Francesc Macià–Montesa on 10–12 October, so the map would draw 855 Trips that won't run, Scheduled.
- **The fetcher can take Renfe's alerts cheaply.** The file stood unchanged for three hours and answers a conditional request with 304. But it must skip the "not updated since" rule, and it fits a file of its own on R2 better than the snapshot.

## The feeds at a glance

| Feed | Endpoint | Key | Licence | Size | Updates | What it named today |
|---|---|---|---|---|---|---|
| Renfe Cercanías | `https://gtfsrt.renfe.com/alerts.json` (and `.pb`) | none | CC BY 4.0 ([dataset](https://data.renfe.com/dataset/incidencias-avisos)) | 99.7 KB JSON, 42.8 KB protobuf, no gzip | "every 20 seconds" says the catalogue; the file stood unchanged from 09:32:52 to at least 12:32 CEST | 69 alerts: Lines (45), Stations (24) |
| FGC | `alerts-gtfs_realtime` on [dadesobertes.fgc.cat](https://dadesobertes.fgc.cat/explore/dataset/alerts-gtfs_realtime/), a file looked up each time | none (5,000 requests a day per IP) | CC BY 4.0 | 50.3 KB protobuf | header 2 minutes old when fetched; no frequency stated | 333 notes, each on a Trip at a Station |
| TMB | `https://api.tmb.cat/v1/alerts/metro/channels/WEB` (from public code; `/v1/alerts/metro` answers 403) | app ID + key | TMB's terms | 16.7 KB JSON | not stated | 12 alerts, each a Line and a Station, often an entrance |
| TRAM | `https://opendata.tram.cat/api/v1/Alterations`, and `/api/v1/GtfsRealtimeAlerts?networkId=1` and `=2` (documented) | OAuth client | TRAM's terms | 2.4 KB JSON; 1.3 and 1.9 KB | not stated; the GTFS-RT form is written on request | 2 alterations, by Line |

Renfe's long-distance feeds have no alerts: `alerts_LD.json` and `alerts_LD.pb` answer 404, and Renfe's catalogue lists only the Cercanías file, "incidencias o avisos del servicio de cercanías".

## Renfe

### What the file held at 11:39

| | Count |
|---|---|
| Alerts | 69 entities, 68 IDs: `AVISO_518187` comes twice, with different Lines |
| By Line (route_ids) | 45 alerts, 1,316 route_ids |
| By Station (stop_id) | 24 alerts, one stop_id each |
| By agency, Trip or route_type | none |
| Active periods | one each, a start and no end (69 of 69) |
| Cause, effect, header, link | none (0 of 69) |
| Text | `descriptionText` only: 26 alerts with one entry, 43 with two, all 112 entries tagged `es` |
| Links | none as a field; 4 texts hold a renfe.com address (Valencia 3, Murcia 1) |

The protobuf says exactly what the JSON does. Per núcleo: Valencia 17, Madrid 15, Bilbao 11, Rodalies 9, Sevilla 6, San Sebastián 5, Málaga 3, Cádiz, Murcia and Cartagena 1 each.

**What they're about**, read one by one:

| Kind | Alerts | Rodalies |
|---|---|---|
| A Station's lifts, escalators, access or toilets | 42 (24 by stop_id, 18 by Line) | 0 |
| A change to service: closed, buses, single track, reopened | 17 | 7 |
| One Train: late, cut short, change at a Station | 5 | 0 |
| A warning with no place: service not guaranteed, or frequencies coming back | 3 | 2 |
| Tickets and bikes | 1 | 0 |
| A test ("Pruebas, disculpen las molestias", Cartagena) | 1 | 0 |

Station alerts aren't always named by Station: Bilbao names all six of its Lines for a lift at San Mamés, and gives the Station in the text.

**When they started:** 18 that morning, 11 in the week before, 11 in the month before, 20 one to six months before, and 9 over six months before. The oldest, Valencia's C3 bus plan and Sevilla's C3 ticket rules, date from 9 June 2025.

**A route_id is a Line.** All 45 Line alerts name every route_id their Lines have in Renfe's timetable, the bus routes too. R3's alert names 76 route_ids: 22 rail and 54 bus. Of Renfe's 828 routes, only 247 carry Trips, and of the 1,316 route_ids in the alerts only 434 do. Every route_id is the núcleo, `T`, four digits and the Line's name (828 of 828, as in `51T0146R1`), so the fetcher can name an alert's Lines without the timetable. Three of the names have no Trips of their own: Madrid's `C8`, whose Trips run as C8a and C8b; Rodalies' `R3a`; Bilbao's `C4A`.

### Rodalies

Nine alerts, all by Line, none by Station:

| Alert | Lines | Started (CEST) | Says |
|---|---|---|---|
| `AVISO_518337` | R3 | 7 Oct 09:23 | Trains between La Garriga and Puigcerdà/La Tor de Querol, with disruption. Buses between Ripoll and Puigcerdà, and between Fabra i Puig and Puigcerdà. |
| `AVISO_518352` | R2 | 7 Oct 09:02 | No rail service. |
| `AVISO_518348` | R1 | 7 Oct 08:38 | Trains between L'Hospitalet de Llobregat and Blanes, outside their usual timetable. Buses between Blanes and Maçanet-Massanes. |
| `AVISO_518332` | R2 | 7 Oct 08:30 | Single track between Sant Vicenç de Calders and Cunit, after the infrastructure was damaged by the rain. Trains kept between Cunit and Barcelona Estació de França. |
| `AVISO_518345` | R8 | 7 Oct 08:29 | Trains over the whole route. |
| `AVISO_518298` | R1, R2, R4, R7, R8 | 7 Oct 07:42 | For reasons beyond Rodalies' control, service can't be guaranteed: find another way. |
| `AVISO_518323` | 11 other Lines | 7 Oct 07:41 | The same, for R11, R13–R17, RG1, RL3, RL4, RT1 and RT2. |
| `AVISO_518187` | R8 | 6 Oct 17:13 | Buses over the whole route. |
| `AVISO_518187` | all 20 Rodalies Lines | 6 Oct 17:13 | Buses over the whole route. |

- **They contradict each other.** R8's newest alert says its Trains run the whole route. Its alert of the evening before, still in the file, says buses do. The second copy of that alert says buses run every Line's whole route. Renfe's positions at 11:56 had 42 Rodalies Trains: R2S 11, R4 8, R1 7, R3 5, R2N 3, R15 2, R16 2, and R7, R8, R17 and RL4 one each. None was on R2, whose alert says it has no rail service, and none of R1's was beyond Blanes, one standing there. So live Trains can disprove a stale closure, and agree with a fresh one.
- **Every Rodalies alert has a second entry in Catalan,** also tagged `es`.

### Against 5 October

| | 5 Oct, 07:40 (#279) | 7 Oct, 11:39 |
|---|---|---|
| Alerts | 72 | 69 |
| route_ids / stop_ids | 988 / 26 | 1,316 / 24 |
| Languages | "Spanish only" | every entry tagged `es`, but 43 alerts carry a second entry in Catalan, Valencian or Basque |
| End times | none | none |
| Effects | one, `MODIFIED_SERVICE` | none |

### Examples

- **`AVISO_518348`** (R1, 38 route_ids: 34 rail, 4 bus): Trains run from L'Hospitalet de Llobregat to Blanes outside their usual timetable; buses run on from Blanes to Maçanet-Massanes. Catalan below the Spanish.
- **`AVISO_518337`** (R3, 76 route_ids, 54 of them bus routes): Trains between La Garriga and Puigcerdà/La Tor de Querol with disruption; buses between Ripoll and Puigcerdà, and between Fabra i Puig and Puigcerdà.
- **`AVISO_517064`** (Madrid, `C8`, 12 route_ids, none with Trips): planned works from 10 to 12 October, no Trains between Villalba de Guadarrama and Cercedilla, buses calling at the Stations between. It started on 1 October and has no end: the dates are in the words only.
- **`INFO_518355`** (stop_id 70100, Vicálvaro, Madrid): the lift to tracks 1 and 3 is out of order.
- **`AVISO_518303`** (San Sebastián, C1): no power, so no Trains between Brinkola and Zumarraga. Basque, then `//`, then Spanish, in one entry.

## FGC

- **The file:** 50,327 bytes of protobuf, GTFS-RT 1.0, written at 11:45:01, fetched at 11:47:02. Anonymous, CORS `*`, `Cache-Control: no-cache`. CC BY 4.0. The dataset gives no update frequency; its `data_processed` was 11:46:02.
- **333 alerts, all alike.** Each is one Trip at one Station: an informed entity with a `trip_id`, its `start_date` and a `stop_id`. No route, agency or route_type. Cause `UNKNOWN_CAUSE`, effect `UNKNOWN_EFFECT`, on all of them. A `header_text` only, with no description or link, and no language tag. One active period each, the service day, from about 03:00 to 03:00 the next morning. Their IDs are `OBSERVATIONS_<code>_<station>`.
- **They're the timetable's notes, not incidents.** 333 notes on 26 Trips, each repeated at every Station the Trip calls at:

| Note | Alerts | Lines |
|---|---|---|
| Connection with the Montserrat rack railway at Monistrol | 121 | R5 |
| First two, last one, last two or second car reserved for school groups | 166 | S1, S2, L6 |
| Connection with a bus to Igualada or Manresa-Baixador | 44 | S8, its last two Trips, at 23:15 and 23:30 |
| The first three cars | 2 | S4, R5 |

- **Everything joins.** All 26 Trips are in the bundle's Trips for 7 October, and all 54 Stations are FGC Stations in the bundle.
- **Against 24 September,** when the Catalan note counted 186 alerts, "many of them per-trip notes": more of the same. This is one fetch, so FGC may still publish incidents here on a bad day. Its timetable has an empty route for them: `BusBV`, "Servei substitutori bus BV", route_type 3, with no Trips in the file of 2 October.

These notes would suit a Train's card (#321) better than the map.

## TMB

- **Fetched** at 12:35, with the app ID and key the fetcher already holds for iTransit. [developer.tmb.cat](https://developer.tmb.cat)'s API docs need a login (`/api-docs/v1` redirects to TMB's sign-in), and only its [terms](https://developer.tmb.cat/docs/terms-conditions) are public. The endpoint comes from two public apps, [sandaun/moubcn](https://github.com/sandaun/moubcn) (`services/api/src/tmb/alerts-client.ts`) and [taichikuji/trmnl-tmb-plugin](https://github.com/taichikuji/trmnl-tmb-plugin), which also call `/bus/`. `https://api.tmb.cat/v1/alerts/metro/channels/WEB` answered 200, with 16.7 KB of JSON. Without the channel, `/v1/alerts/metro` answered 403.
- **12 alerts, all about getting into and around a Station:** closed entrances (`NP8`, `PP7`), escalators (`PP9`), lifts (`PP8`), and closed passages between Lines (`PP2`), each with `effect.type` `INFRASTRUCTURE` and status `WARNING`. None was about service on a Line. A Line's partial service would be `NP3`, "Linia amb Servei Parcial", by moubcn's code; none today.
- **Each names its place:** `entities[]` give the Line (`line_code` 3, `line_name` L3), the Station (`station_code` 314, Zona Universitària), and the entrance and direction where it's one (`entrance_name` "Lindavista", otherwise `ALL`). The Station code is our Station's: `tmb:1.314` is Zona Universitària on L3 in the bundle (ADR-0005).
- **Dates as fields:** `disruption_dates[]`, a begin and an end in ms. 11 of 12 have an end, from 9 October 2026 to 27 March 2027, and one has none. The text often says them again ("Des del dia 04/10/2026 fins al dia 24/10/2026").
- **Text:** `publications[]`, with `headerCa`, `headerEs`, `headerEn`, `textCa`, `textEs` and `textEn`. 11 of 12 are translated; one gives its Catalan in all three.
- **GTFS-RT:** none found. The Mobility Database's catalogue and Transitland's TMB record list TMB's static GTFS only. In Barcelona, the catalogue's GTFS-RT feeds are Renfe's and AMB's buses'.
- **Terms:** cite TMB and the date of the last update, and "no alterar ni desnaturalitzar els continguts".

## TRAM

- **Fetched** at 12:35, with the OAuth client the fetcher already holds: a token from `/connect/token`, then three requests. TRAM's [API manual](https://opendata.tram.cat/manual_en.pdf) (made 23 December 2025) documents both endpoints.
- **`GET /api/v1/Alterations`** answered 200, with 2.4 KB of JSON: "current service alterations (active and scheduled)". Two today, each with an `id`, a `title` and a `description` in `ca`, `es` and `en`, a `type` (0 for both), and the `lines` by name. No dates or Stations as fields.
  - `280P`, T1, T2 and T3: on 10, 11 and 12 October, for track renewal, no service between Francesc Macià and Montesa, with buses in their place.
  - `279P`, T5 and T6: from 1 October until spring 2027, for doubling works on the Gran Via, no service between Glòries and Can Jaumandreu, with the H12 and N2 buses instead.
- **`GET /api/v1/GtfsRealtimeAlerts?networkId=1`** (Trambaix) **and `=2`** (Trambesòs) answered 200, with 1.3 and 1.9 KB: GTFS-RT in its JSON form, not protobuf, written on request. The same two alerts, one per half, with what `Alterations` lacks: an active period (1 October 07:00 to 13 October 01:00; 1 October to 30 April 2027), informed entities by TRAM's `routeId` (1–3; 5 and 6), effect `MODIFIED_SERVICE`, no cause, and the texts tagged `ca`, `es` and `en`.
- **The stretch is in the text only,** in all three languages ("entre Francesc Macià i Montesa", "between Glòries and Can Jaumandreu"). All four names are Stations in the bundle.
- **GTFS-RT:** only inside that API. The Mobility Database lists none for TRAM.
- **Terms** ([PDF](https://opendata.tram.cat/assets/pdf/condicions_en.pdf)): "The content of the information may not be altered", its meaning may not be distorted, and it must be kept up to date.

## Placing an alert on the map

### (a) The text

A pattern looked for "entre X y Y" (and `i`, `e`, or ` - `), "de X a Y", "desde X hasta Y", and "hasta X" or "inicia su recorrido en X" for one end, in the Spanish entry. It then matched each name to the Stations of the alert's Lines, lower case, without accents or punctuation, whole names or names inside names. It also read the clause before each stretch for what it says: closed ("servicio alternativo por carretera", "no presta servicio", "interrumpida", "suspendido"), single track ("vía única"), or running ("circulación ferroviaria", "se mantiene").

**Rodalies, 7 October:**

| Stretch, as a reader finds it | Found by the pattern | Says | Both ends Stations of the Line | On the map today |
|---|---|---|---|---|
| R3 La Garriga – Puigcerdà/La Tor de Querol | yes | running, with disruption | yes | 116 km along R3 |
| R3 Ripoll – Puigcerdà | yes | closed, buses | yes | 48.2 km along R3 |
| R3 Fabra i Puig – Puigcerdà | no | closed, buses | no: Fabra i Puig is an R4 Station and an R3 bus stop | no R3 track south of La Garriga |
| R1 L'Hospitalet de Llobregat – Blanes | yes | running, off timetable | yes | 69.9 km along R1 |
| R1 Blanes – Maçanet-Massanes | yes | closed, buses | yes | 15.2 km along R1 |
| R2 Sant Vicenç de Calders – Cunit | yes | single track | yes | 9.0 km along R2, which runs one Trip there today; R2 Sud runs 68 |
| R2 Cunit – Barcelona Estació de França | yes | running | only on R2 Sud: the alert names R2 | 58.0 km along R2S |

- **6 of 7 found, and both ends matched for all 6,** 5 of them on the Line the alert names.
- **The one missed** has no "entre": "entre Ripoll - Puigcerdà i Fabra i Puig - Puigcerdà" joins two stretches with a Catalan `i` inside a Spanish sentence, and "Fabra i Puig" has an `i` of its own. No pattern can be sure of that.
- **The verb before a stretch says what it is.** Without it, every stretch would look closed, and the map would mark as closed the stretches where Trains run.
- **Six of the nine alerts name no stretch:** R2's "no rail service", R8's two "whole route" alerts, the alert that covers every Line, and the two warnings. Those are Line-wide only.

**Across Spain, the same pattern** found 17 phrases in 13 alerts of six núcleos. 15 matched both ends once a Line's branches counted (Madrid's `C8` as C8a and C8b, Rodalies' R2 with R2 Sud). One failed on a spelling, "Valencia Font de Sant Lluis" against "València-La Font de Sant Lluís". One was a false hit, two streets at Bidebieta-Basauri ("entre Av. Agirre Lehendakaria y Calle Fauste"). It missed Madrid's "entre las estaciones de Cercedilla-Puerto de Navacerrada-Los Cotos", three Stations joined by hyphens. And one-Train notes ("tren con salida de Colmenar Viejo a las 09:05h … inicia su recorrido en Tres Cantos") come named by Line, so read as stretches they would mark a whole Line for one Train.

### (b) The timetable's bus Trips

- **Renfe's Cercanías GTFS lists its planned replacement buses as Trips** on bus routes (route_type 3, never 714) under the Line's own name. The file of 7 October has 11,176 of them over its 30 days (7 October to 5 November), 687 on 7 October, on 11 Lines in 8 núcleos.
- **Rodalies, 7 October:** 527 bus Trips (R3 503, R13 24) beside 959 rail Trips, in 27 stop patterns. Rodalies' Trips run to 18 October in this file. Their 41 stops are the Stations' own codes: 28 of them have Rodalies Trains too, and 13 have only buses in all 12 days (R3's Montcada-Ripollet to Les Franqueses del Vallès, R13's La Riba to La Floresta), so the bundle has none of those 13.
- **They are the planned closures, Station by Station:**

| Stretch | Rail Trips calling there, 7 Oct | Bus Trips | Alert |
|---|---|---|---|
| R3 Fabra i Puig – La Garriga (at Granollers-Canovelles) | 0 | 183 | named in `AVISO_518337` |
| R3 Ripoll – Puigcerdà (at La Molina) | 10 | 32 | `AVISO_518337`: closed today |
| R13 La Plana-Picamoixons – Lleida (at Montblanc) | 0 | 24 | none |
| R1 Blanes – Maçanet-Massanes (at Tordera) | 34 | 0 | `AVISO_518348`: closed today |
| Madrid C8b Villalba – Cercedilla | – | 66 a day on 10–12 Oct | `AVISO_517064`, dates in the text |
| San Sebastián C1 Irun – Hernani | – | 16–44 a day | `INFO_507703` |

- **So the two sources split the work.** The timetable has planned works, with their Stations and dates. The alerts have the day's incidents, and repeat the planned works in words with no end. Today's R1 closure is in the alerts only, and the timetable still runs 34 R1 Trains through Tordera: the map would draw them, Scheduled (#233's phantoms).
- **FGC** lists a replacement-bus route, `BusBV`, with no Trips today. TMB's and TRAM's timetables list no replacement buses: TMB's 104 bus routes are its city buses.
- **TRAM's timetable leaves one closure out, and not the other.** On 7 October no T5 or T6 Trip calls at both Glòries and Can Jaumandreu: T5's 407 Trips reach one or the other (246 and 161), and T6's 85 only Can Jaumandreu, as `279P` says. But in TRAM's Trambaix file of 6 October, every T1–T3 Trip on 10, 11 and 12 October still runs through Francesc Macià and Montesa (335, 268 and 252 Trips), where `280P` says there's no service. Unless a later file drops them, the map will draw them, Scheduled, on the day of #233's weekend recording too.

### (c) Stations named by stop_id

- **Renfe's stop_id is our Station's ID:** `adif:<stop_id>`. All 9 Madrid stop alerts are Stations in the bundle. The other 15 are in núcleos not on the map yet. All 24 are about lifts or access.
- **FGC's stop_ids are its Stations' codes,** `fgc:<stop_id>`: 54 of 54 in the bundle. But they're Trip notes.
- So stop_ids give the map a mark at a Station for access problems, not for closures.

### (d) What the map would draw

- **A closed stretch:** the Line's stroke between two Stations. The bundle has what it takes. A Trip's calls give each Station's distance along the Trip's shape. The Line's slots (#176) map each length of that shape onto the centreline of the Stretch it's drawn along, with its side, in each zoom band. Zoomed right in, the Line's `rails` strokes are on its own shape. So the page can find the stroke between two Stations from the bundle it has, with no change to the build, wherever a Trip of the Line calls at both, and across a node as `onStroke()` does for Trains. For 6 of today's 7 Rodalies stretches, a Trip of 7 October calls at both ends, and the Line's slots cover the length in every band.
- **Where it can't:** a stretch no Train of the Line runs in the whole timetable. The build traces a shape only between the Stations its Trips serve, so R3's track starts at La Garriga, although Renfe's shape for R3 runs from L'Hospitalet to La Tor de Querol. Drawing R3 to Fabra i Puig would need the build to trace through the bus Trips' Stations too.
- **A mark at a Station,** for an alert with a stop_id, or one whose text names one Station.
- **A Line-wide note,** on its legend entry, its card, its Line screen, and #318's Now (ADR-0011).
- **When nothing matches:** Line-wide only. That's most alerts: 6 of Rodalies' 9 today, and all 5 one-Train notes in Spain.
- **The Trains on a closed stretch** are still in the timetable unless the closure was planned. Whether the map hides or marks them is #279's question. Live data helps either way: no live R1 Train was beyond Blanes at 11:56.

## The fetcher (ADR-0003)

- **Renfe:** one more request each run is cheap. The file stood unchanged from 09:32:52 to at least 12:32 CEST, three hours on a morning of disruption, though the catalogue says it's updated every 20 seconds. Renfe answers `If-None-Match` and `If-Modified-Since` with 304 and no body, so a conditional request each run costs nothing while it doesn't change. Every third run, once a minute, would do as well.
- **It must skip the "not updated since" rule** (#35). The step fails a try whose file has the same time as the try before, and the alerts file keeps its time for hours.
- **The step stays clear of the timetable:** a route_id ends with its Line's name, so the fetcher can name Lines itself, and keep only the Networks the bundle has.
- **In the snapshot, or a file of its own?** Kept to the Networks on the map, with Lines in place of route_ids, Rodalies' 9 alerts are 3.3 KB of JSON (0.9 KB gzipped), Rodalies and Madrid's 24 are 7.2 KB (2.0 KB), all of Spain's 29 KB (6.4 KB). The snapshot is 12.5–15 KB, the page fetches it every 20 s, and it keeps every snapshot for 35 minutes (`KEEP`), so alerts in it would be kept 105 times over, or stripped on arrival. A file of its own fits better: `alerts.json` on R2, written only when it changes, cached for a minute, and fetched by the page once a minute, as it fetches the manifest. It needs a freshness of its own, so the page doesn't show alerts from a feed that's gone quiet. ADR-0003 would need an amendment for it, as #329's files will.
- **FGC:** two requests a refresh (the lookup and the file), or one while its address holds, as for its trip updates. Every 2 minutes, that's 720–1,440 more requests a day against the 5,000 FGC allows each IP, where the fetcher already uses about 1,440. Today its alerts hold nothing for the map, so leave them out until FGC is seen to publish incidents there.
- **TMB:** one more keyed request, to add to the one every 30 s declared to TMB. Every few minutes would do: today's 12 began days or months ago.
- **TRAM:** one more request for `Alterations`, which covers both halves but gives no dates, with the token the adapter keeps; or two for `GtfsRealtimeAlerts`, one per half, which give them. A refusal there shouldn't back off TRAM's positions.
- **Nothing rides along for free.** The GTFS-RT files the fetcher already reads from FGC and TRAM hold trip updates only: the repo's recordings of 25 September have no alert in them.

## Languages

| Feed | Languages | Tagged |
|---|---|---|
| Renfe | Spanish everywhere. A second entry in Catalan for all 9 Rodalies alerts, and in Valencian for Valencia's 17; Murcia's one repeats its Spanish. Basque and Spanish in one entry, split by `//`, in Bilbao's 11 and San Sebastián's 5, mostly given twice. Madrid, Sevilla, Málaga, Cádiz and Cartagena: Spanish only. | every entry `es` |
| FGC | Catalan only | no tag |
| TMB | Catalan, Spanish and English; 11 of 12 translated, one in Catalan throughout | by field: `headerCa`, `textEs`… |
| TRAM | Catalan, Spanish and English, both endpoints | by field in `Alterations`, `language` in the GTFS-RT form |

The interface speaks Catalan, Spanish and English. Renfe's Catalan entry could serve the Catalan interface only by its place, second, as its tag says Spanish too. And a second entry isn't always the first in another language: in Bilbao, at Desertu-Barakaldo and Abaroa-San Miguel, it tells of another lift at the same Station. No feed in reach gives Renfe's alerts in English. Translating them is allowed under CC BY 4.0, as long as the map says so; TMB's and TRAM's terms forbid altering theirs.

## What it means for #279

1. **Renfe's alerts are where the day's incidents are,** and most of them are Line-wide. Show them on the Line: its legend entry, its card, its Line screen, and Now. TRAM's add planned closures with dates and Lines, the stretch in the text; TMB's are a Station's access, by our Station's code.
2. **Draw a stretch only when the text says it's closed and both ends are Stations on the Line's track.** Today that's 2 of Rodalies' 7 stretches (Ripoll–Puigcerdà, Blanes–Maçanet-Massanes), plus single track as a third kind. A stretch where the text says Trains run stays as it is.
3. **Take planned closures from the timetable's bus Trips where it has them, not the text.** They give the Stations and the dates. The build drops them today, as buses aren't Trains (CONTEXT.md), so they'd come into the bundle as closures, not Trips. Where no Train runs in the whole timetable, as on R3 south of La Garriga, the build would also have to trace the Line's track through them. But a timetable can lag: TRAM's still runs T1–T3 through 10–12 October's closure, which only its alert's dates and text give.
4. **Stale alerts need a rule.** None has an end. Options: show each with its start ("since 6 Oct, 17:13"), drop one older than some days unless it gives dates, and let live Trains on a Line outweigh a Line-wide "no Trains" alert.
5. **The Trains on a closed stretch:** hide them or mark them (#233), now that alerts say where.
6. **Which alerts count:** Renfe's mix today is 42 Station access, 17 service changes, 5 one-Train notes, 3 warnings, one about tickets and one test; TMB's 12 are all access, and TRAM's 2 both closures. Access suits a Station's card; FGC's notes a Train's; service changes the map and Now.
7. **Languages:** Spanish, and Catalan by position for Rodalies; nothing in English. Show the viewer's language where there is one, and say whose words they are.
8. **The fetcher:** Renfe's alerts in a file of their own, every run with a conditional request or once a minute, skipping the stuck rule. FGC's not yet. TMB's and TRAM's once the grill wants them, with the keys the fetcher has.
9. **A word for CONTEXT.md:** it has no term for these yet. "Alert", an operator's notice about a Line, a Station or a Train, would do, with "closed stretch" for the part of a Line its Trains don't run.

## Re-verify quickly

```sh
# Renfe: alerts, route_ids and stop_ids, and when the file last changed
curl -s https://gtfsrt.renfe.com/alerts.json | jq '{alerts: (.entity|length), routes: ([.entity[].alert.informedEntity[]|select(.routeId)]|length), stops: ([.entity[].alert.informedEntity[]|select(.stopId)]|length)}'
curl -sI https://gtfsrt.renfe.com/alerts.json | grep -i last-modified
# Rodalies' alerts, in Spanish and Catalan
curl -s https://gtfsrt.renfe.com/alerts.json | jq -r '.entity[] | select(.alert.informedEntity[0].routeId // "" | startswith("51")) | .id + ": " + ([.alert.descriptionText.translation[].text] | join(" / "))'
# FGC: where its alerts file is (one request of its 5,000 a day)
curl -s 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/alerts-gtfs_realtime/records?limit=1' | jq -r '.results[0].file.url'
```
