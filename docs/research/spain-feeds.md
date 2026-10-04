# Timetables and live feeds for the rest of Spain

Research for #215, part of #214 (beyond Catalonia). It feeds the grill in #222. It builds on [live-data-sources.md](live-data-sources.md), which covers Catalonia in depth and surveyed the rest of Spain's metros and trams on 24 Sep. This note doesn't repeat that. It re-checks it where that was cheap.

- **Date:** Sunday 4 October 2026, 10:15–10:30 CEST. Every claim below was checked that morning unless it says otherwise.
- **Weekend caveat:** live samples were taken on a Sunday morning, so vehicle counts are well below a weekday's. Trips per day come from the timetables, for Monday 5 October (a weekday) and Sunday 4 October.
- **Method:** every feed marked **V** was downloaded and counted (files in a scratch dir, not in the repo). **D** means docs or a catalogue page only. Mobility Database (`files.mobilitydatabase.org/mdb-{id}/latest.zip`) was used as a keyless mirror where the national access point needs a key. Its `Last-Modified` is when it last mirrored, not when the operator published.

## TL;DR

- **Renfe alone covers almost all of it.** Its two GTFS files and five GTFS-RT feeds cover Cercanías in every núcleo, Media Distancia, Regional, AVE, Avlo, Alvia, Avant, Intercity, Euromed and the ex-FEVE metre-gauge lines. All CC-BY 4.0, keyless, every Trip joins its static file at 100%. The fetcher already reads all five feeds for Catalonia, so the rest of Spain costs no new source.
- **Station codes are Adif's everywhere Renfe runs**, metre gauge included (`05xxx`). Ouigo uses the same codes behind a UIC prefix (`0071` + Adif's five digits). Euskotren, FGV and SFM run their own networks with their own codes.
- **High speed has two holes:** Ouigo has a static timetable only (37 Trips on a weekday), and Iryo publishes nothing at all.
- **Other regional rail:** Euskotren has a daily GTFS and live trip updates (no positions). FGV and SFM have timetables only; live data is web-page grade.
- **A surprise for v1:** today's Cercanías file has **no Rodalies Trips after Sunday 4 October**, while every other núcleo runs to 30 October. The file is dated Thursday 1 October and hasn't changed since. Worth a look on Monday (Gaps).

## Summary

| Operator | Timetable | Live | Positions | Key / CORS | Licence | Station codes |
|---|---|---|---|---|---|---|
| Renfe Cercanías, all 14 other núcleos | GTFS, shapes, 30 days | GTFS-RT positions + trip updates + alerts, ~20 s | GPS in transit, station-snapped otherwise | none / none | CC-BY 4.0 | Adif |
| Renfe AVE / LD / MD / Regional | GTFS, no shapes, ~16 weeks | GTFS-RT positions + trip updates, 15–30 s; web visor JSON | GPS | none / none | CC-BY 4.0 (visor not in catalogue) | Adif |
| Renfe ancho métrico (ex-FEVE) | in both Renfe files | in both Renfe feeds | as above | none / none | CC-BY 4.0 | Adif (`05xxx`) |
| Ouigo | GTFS (MERITS export) via NAP | **none** | – | NAP key, or mirror | NAP licence, "Powered by MITRAMS" | UIC = `0071` + Adif |
| Iryo | **none** | **none** | – | – | – | – |
| Euskotren (trains, Bilbao and Vitoria trams, funicular) | GTFS, shapes, daily, ~40 days | GTFS-RT trip updates + alerts | **none** (empty file) | none / not checked | CC-BY 4.0 | own (NeTEx-style) |
| FGV Metrovalencia | GTFS, coarse shapes | none official | – | none | not stated | own |
| FGV TRAM d'Alacant | GTFS, shapes | none official | – | none | not stated | own |
| SFM Mallorca (T1–T3, M1) | in TIB's island GTFS | none official; station boards over socket.io | – | none | CC-BY 4.0 | own |

## Renfe Cercanías (the other núcleos)

| | |
|---|---|
| **Format** | GTFS `https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip` (V). GTFS-RT `https://gtfsrt.renfe.com/{vehicle_positions,trip_updates,alerts}.{pb,json}` (V). Same files as Rodalies. |
| **Licence** | CC-BY 4.0 on every dataset ([data.renfe.com CKAN](https://data.renfe.com/api/3/action/package_show?id=horarios-cercanias)). Credit Renfe. |
| **Size** | 13.2 MB zip, 245 MB unzipped (`stop_times.txt` 225 MB). 841 routes, 1,139 stops, 104,896 Trips over the span. Space-padded, as before. |
| **Cadence and horizon** | File `Last-Modified` Thu 1 Oct 08:55 UTC, unchanged by Sunday. Span 1–30 Oct (30 days), one `service_id` per núcleo per day. Not daily this week, against the "daily zip" in the Catalan note. |
| **Shapes** | Every núcleo has shapes. 898 of 104,896 Trips have none. |
| **Live** | Header advanced every 17–21 s over four fetches 20 s apart. Per-vehicle timestamps median 5 s older than the header. `Cache-Control: max-age=30`, no CORS, no key, no rate-limit headers. The catalogue says trip updates and alerts refresh every 20 s. |
| **Live sample** | 10:17 Sunday: 194 positions, 197 trip updates. Status: 88 `STOPPED_AT`, 65 `INCOMING_AT`, 41 `IN_TRANSIT_TO`, so only a fifth carry real GPS at any moment. One of four fetches held only 109 entities against ~190 either side: a **partial file**. |
| **Joins** | Positions 194/194 and trip updates 196/197 to static `trip_id`. The odd one is `SPECIAL_10_91944C4A`, an added Madrid Trip. |
| **Station codes** | Adif's 5-digit codes, as in Rodalies. 642 of 1,139 are also in Renfe's station list (`estaciones.csv`, 1,035 rows); the rest are Cercanías-only halts. 640 codes are shared with the LD file, so one Station has one code across both. |

Per núcleo, from the timetable (Trips per day) and the 10:17 Sunday positions:

| Núcleo (code) | Lines | Stations | Trips Mon 5 Oct | Trips Sun 4 Oct | Live Sun 10:17 |
|---|---|---|---|---|---|
| Madrid (10) | C1, C2, C3, C4a/b, C5, C7, C8a/b, C9, C10 | 95 | 1,302 | 1,105 | 85 |
| Asturias (20) | C1–C3 (Iberian), C4–C8 (metre gauge) | 148 | 472 | 306 | 27 |
| Sevilla (30) | C1–C5 | 33 | 165 | 113 | 8 |
| Cádiz (31) | C1, C1a, T1 (tram-tren) | 30 | 146 | 70 | 4 |
| Málaga (32) | C1, C2 | 23 | 136 | 118 | 6 |
| Valencia (40) | C1–C6 | 71 | 389 | 245 | 10 |
| Murcia/Alicante (41) | C1–C3 | 23 | 107 | 69 | 3 |
| Cartagena (45, metre) | C1 | 15 | 44 | 26 | 1 |
| Ferrol (46, metre) | C1 | 24 | 34 | 15 | 1 |
| León (47, metre) | C1 (+ a bus) | 44 | 61 | 36 | 2 |
| Bilbao (60) | C1–C3 (Iberian), C4, C4A, C5 (metre) | 112 | 360 | 258 | 13 |
| San Sebastián (61) | C1 | 30 | 77 | 96 | 7 |
| Santander (62) | C1 (Iberian), C2, C3, R3 (metre) | 77 | 226 | 132 | 8 |
| Zaragoza (70) | C1 | 6 | 80 | 61 | 2 |
| *Rodalies (51), for scale* | | 210 | **0** | 1,251 | 17 |
| **Total without Rodalies** | | | **3,599** | 2,650 | 177 |

- Núcleo `90` has one route, C9 Cercedilla–Cotos, with no Trips.
- Madrid alone is 36% of the other núcleos' Trips and 48% of their live Trains.

## Renfe AVE / Larga Distancia / Media Distancia / Regional

| | |
|---|---|
| **Format** | GTFS `https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip` (V). GTFS-RT `vehicle_positions_LD` and `trip_updates_LD` (V). Web visor `https://tiempo-real.largorecorrido.renfe.com/renfe-visor/flotaLD.json` (V, not in the catalogue). |
| **Licence** | CC-BY 4.0 ([catalogue](https://data.renfe.com/api/3/action/package_show?id=horarios-de-alta-velocidad-larga-distancia-y-media-distancia)). The visor has no stated licence. |
| **Size** | 0.78 MB zip, 37 MB unzipped. 656 routes, 1,006 stops, 7,283 Trips. No shapes, so track comes from OSM (#216, #217). |
| **Cadence and horizon** | Rebuilt nightly (`Last-Modified` Sat 3 Oct 23:06 UTC, files stamped 01:06). Span 3 Oct 2026 → 24 Jan 2027, but it thins out: 1,588 Trips on Mon 5 Oct, 1,245 on Tue 1 Dec. Treat the weeks ahead as provisional. |
| **Trips per day** | Mon 5 Oct: **1,588**: MD 335, Regional 255, AVE 243, Avant 229, Reg.Exp. 167, Proximidad 140, Alvia 112, Intercity 39, Avlo 37, Euromed 15, AVE Int 10, Trencelta 4, Avant Exp 2. Sun 4 Oct: 1,341. Same mix as 24 Sep. |
| **Live sample** | 10:17 Sunday: 135 positions (61 `IN_TRANSIT_TO`, 74 `STOPPED_AT`), 211 trip updates, visor 108 trains. Header advanced every 14–30 s, though the catalogue says positions refresh "every 15 minutes". Positions carry no per-vehicle timestamp, as before. |
| **Joins** | Positions 135/135, trip updates 211/211. |
| **Visor changes since 24 Sep** | New fields `codCirculacion` (a second train number; `18774` for commercial `18775`) and `umov` (same as `time`). A new `codProduct` 21 was seen once (train 35414). |
| **Station codes** | Adif 5-digit. All 1,006 stops are in Renfe's `estaciones.csv`. |
| **Overlap** | Regionals that a núcleo also runs are in both feeds, as in Catalonia. Dedupe by Train number. |

## Renfe ancho métrico (ex-FEVE)

There is no separate live feed, and the separate timetable is stale. The lines sit inside the two Renfe files.

| | |
|---|---|
| **Commuter lines** | In the Cercanías file: Asturias C4–C8, Bilbao C4/C4A/C5 (from La Concordia), Santander C2/C3/R3, and the núcleos 45 Cartagena, 46 Ferrol, 47 León. |
| **Regional lines** | In the LD file, as `REGIONAL` with route IDs ending `VRFV`: 12 routes, such as Ferrol–Ribadeo–Oviedo, Oviedo–Llanes–Santander, Santander–Bilbao, Bilbao–Guardo/León (Trains 718xx). This is despite the catalogue saying the file excludes "Cercanías ni FEVE". |
| **Live** | In the same feeds: four 718xx Trains were in `vehicle_positions_LD` at 10:17. |
| **Separate FEVE GTFS** | NAP file 1131 ([Mobility Database mdb-2717](https://files.mobilitydatabase.org/mdb-2717/latest.zip)): span 13 Apr–13 May 2026, no shapes, 83 stops. **Expired.** Don't use. |
| **Station codes** | Adif, `05xxx`. Renfe also lists them separately ([listado-estaciones-feve](https://data.renfe.com/api/3/action/package_show?id=listado-estaciones-feve), last changed 2021). |

## Ouigo

| | |
|---|---|
| **Format** | GTFS, NAP file 1766, mirrored as [mdb-2785](https://files.mobilitydatabase.org/mdb-2785/latest.zip) (V). Its `licences_and_sources.txt` is the generic MERITS (UIC) file, listing other countries' operators, so this is a MERITS export rather than Ouigo's own. |
| **Licence** | NAP's [licence](https://nap.transportes.gob.es/licencia-datos): reuse allowed, cite the ministry with "Powered by MITRAMS" and a link to transportes.gob.es, keep the data current, keep the update date. |
| **Size and span** | 7.6 KB. 11 routes, 16 Stations, no shapes. Span 26 Jun → 12 Dec 2026. Mirror last refreshed 3 Jul. |
| **Trips per day** | 37 on Mon 5 Oct, 40 on Sun 4 Oct. Routes: Madrid–Barcelona, –Sevilla, –Málaga, –Valencia, –Alicante, –Murcia; Barcelona–Sevilla, –Córdoba; Valladolid–Valencia, –Alicante, –Murcia. |
| **Train numbers** | `trip_short_name` like `TGV 10465`: a 5-digit number in Adif's range, so it could join Adif data one day. |
| **Live** | None public. Only Adif's app API has Ouigo delays (unofficial; see the Catalan note). |
| **Station codes** | `stop_id` = `0071` + Adif's code: all 16 match a Renfe LD stop. `stop_timezone` is `Europe/Amsterdam`, a MERITS quirk (same offset as Madrid). |

## Iryo

| | |
|---|---|
| **Timetable** | None. Not in the NAP or the Mobility Database catalogue (3,517 feeds, checked). A [datos.gob.es request](https://datos.gob.es/es/solicitud-de-datos/horarios-de-servicios-de-tren-en-formato-gtfs) for every operator's GTFS (22 Jan 2023) is still "Asignado"; a comment from 29 Mar 2024 says all are on the NAP "excepto los de Iryo". |
| **Live** | None public. Adif's app API only (unofficial). |
| **Station codes** | – |

## Euskotren

| | |
|---|---|
| **Format** | GTFS from Moveuskadi, `https://opendata.euskadi.eus/transport/moveuskadi/euskotren/gtfs_euskotren.zip` (V, 1.7 MB). GTFS-RT `.../euskotren/gtfsrt_euskotren_{trip_updates,vehicle_positions,alerts}.pb` (V). Indexes: [GTFS](https://opendata.euskadi.eus/transport/moveuskadi/data-index-gtfs.json), [GTFS-RT](https://opendata.euskadi.eus/transport/moveuskadi/data-index-gtfs-rt.json). |
| **Official host** | `gtfs.euskotren.eus` (listed on [data.ctb.eus](https://data.ctb.eus/api/3/action/package_search?q=euskotren), last edited 2019) still redirects to an F5 login. Use Moveuskadi. |
| **Licence** | CC-BY 4.0 ([Moveuskadi dataset](https://opendata.euskadi.eus/catalogo/-/moveuskadi-datos-de-la-red-de-transporte-publico-de-euskadi-operadores-horarios-paradas-calendario-tarifas-etc/)). `attributions.txt` names Eusko Trenbideak. |
| **Cadence and horizon** | Daily: `feed_version` 20261004043431, span 4 Oct → 13 Nov (about 40 days). |
| **Contents** | 12 routes: trains E1–E4, E3a, L3 (Bilbao's metro line 3), the Bilbao tram, Vitoria's TG1/TG2, the Larreineta funicular. 801 stops, 128 of them Stations (`location_type=1`). Shapes (66k points), pathways, levels, translations. Language `eu`. |
| **Trips per day** | Mon 5 Oct: trains 692, Vitoria tram 269, Bilbao tram 166, funicular 76 (1,203). Sun 4 Oct: 480, 260, 130, 66 (936). |
| **Live** | Trip updates: 242 at 10:20, a median 16 stop updates each, header 81 s old when fetched; 242/242 join the static file. Vehicle positions: **an empty file** (15 bytes, header only). Alerts listed. The index updates each minute. |
| **Moveuskadi health** | Healthy this morning (index stamped 10:20:31). It had stalled for 8 h+ on 24 Sep (Catalan note). |
| **Station codes** | Own NeTEx-style IDs (`ES:Euskotren:Place:…`), not Adif's. Euskotren runs its own network (ETS). |

## FGV (Metrovalencia, TRAM d'Alacant)

| | Metrovalencia | TRAM d'Alacant |
|---|---|---|
| **Format** | GTFS `https://www.metrovalencia.es/google_transit_feed/google_transit.zip` (V) | GTFS `https://www.tramalacant.es/google_transit_feed/google_transit.zip` (V; `tramalicante.es` redirects) |
| **Size** | 0.90 MB, 113 routes (Lines 1–10), 144 stops | 0.16 MB, 51 routes (Lines 1–5, 9), 70 stops |
| **Span** | 5 Sep → 27 Dec 2026 | 14 Feb → 31 Dec 2026 |
| **Trips per day** | Mon 5 Oct 1,714 (metro 860, tram 854); Sun 1,154 | Mon 460; Sun 442 |
| **Shapes** | 900 points for the whole network: too coarse to draw | 2,719 points |
| **Licence** | Not stated on the files. NAP mirror (1168 / 1167) carries the NAP licence. | same |
| **Live** | No official feed found. The Catalan note found next departures as HTML per station, through WordPress `admin-ajax.php`. | same |
| **Station codes** | Own numbers. FGV's own network. | same |

No `Last-Modified` header, so the publish cadence is unknown. The Mobility Database mirror of the Valencia file changed on 3 Oct; the Alacant mirror (mdb-2829) is from 23 Dec 2025, while the operator's file now starts 14 Feb 2026, so read FGV from the operator, not the mirror.

## SFM (Serveis Ferroviaris de Mallorca)

| | |
|---|---|
| **Format** | Inside the island-wide TIB GTFS (`ctm-mallorca-es.zip`, 6.4 MB), linked from [TIB's open-data page](https://www.tib.org/es/sobre-ctm/portal-de-transparencia/datos-abiertos) (V via mdb-2766). Agency `55` "SFM R4". |
| **Licence** | CC-BY 4.0 (TIB page). |
| **Cadence and horizon** | `feed_version` 2026.10.02, span to 2 Apr 2027. |
| **Lines** | T1 Palma–Inca, T2 Palma–sa Pobla, T3 Palma–Manacor (trains), M1 Palma–UIB–ParcBit (metro). No M2 in the file. |
| **Trips per day** | Mon 5 Oct: trains 149, metro 98. Sun 4 Oct: trains 65, metro 0. |
| **Live** | No feed on TIB's page. `info.trensfm.com` answers socket.io (EIO 4) and pushes station boards (Catalan note); not documented. |
| **Station codes** | TIB's own stop IDs. |

## Other regional rail

| Operator | Timetable | Live | Note | Checked |
|---|---|---|---|---|
| Funicular de Artxanda (Bilbao) | GTFS (Moveuskadi, NAP 1264 / mdb-2680), 148–156 Trips a day | none | 2 stops, funicular | V |
| Ferrocarril de Sóller | none found (not in NAP listing seen or Mobility Database) | none | heritage line | D |
| FGC | see the Catalan note | | | |

## National portals and Adif

| Source | What it gives | Access | Checked |
|---|---|---|---|
| [data.renfe.com](https://data.renfe.com/api/3/action/package_list) | CKAN, 44 datasets: both GTFS files, the five GTFS-RT feeds, station lists (all, per núcleo, FEVE), passenger counts by hour. All CC-BY 4.0. | keyless; CKAN API works | V |
| [NAP](https://nap.transportes.gob.es/) (Punto de Acceso Nacional) | Catalogue of operators' GTFS (Renfe ×2, Ouigo, Euskotren, Metro Bilbao, FGV, TIB, …). Downloads need a free key in an `ApiKey` header; without one the API answers `401 Api Key was not provided`. The old `Files/Detail/{id}` pages now 404; datasets live under `ConjuntoDato/Detail/{id}`. | key ([API instructions](https://nap.transportes.gob.es/Account/InstruccionesAPI)) | V |
| Mobility Database | Keyless mirror of NAP files and operators' URLs. Its GTFS-RT entries for Spain: only Renfe Cercanías and Metro Bilbao. | keyless | V |
| datos.gob.es | A catalogue that points back to the above. Adif's only rail dataset is the INSPIRE rail network geometry, "Versión actual: Julio 2024" ([record](https://datos.gob.es/apidata/catalog/dataset/e0dat0002-red-de-transporte-ferroviario-de-adif1.json)). | keyless | V |
| Adif | **No open station-code list or circulation data found.** Its codes reach us through Renfe's files. Live circulations exist only behind its app API (`circulacion.api.adif.es`, signed requests; unofficial), the only source with Iryo and Ouigo delays. | – | D |

## Metros and trams elsewhere (short)

The spec puts these later. The Catalan note's table stands; re-checked this morning:

| System | Timetable | Live | Re-check 4 Oct |
|---|---|---|---|
| Metro de Madrid | CRTM GTFS **expired 27 May 2026**, headway-only | arrivals API | still expired (`feed_version` 20250527) |
| Metro Ligero Madrid | CRTM GTFS (mdb-2802, mirrored 30 Jul) | CRTM widgets API | – |
| Metro Bilbao | GTFS, CC-BY 4.0 | GTFS-RT positions (station-snapped) + trip updates | 8 vehicles at 10:20, header 60 s old |
| Euskotren trams | in Euskotren's GTFS | trip updates only | above |
| Metrovalencia, TRAM d'Alacant | FGV GTFS | HTML next departures | above |
| Tranvía de Zaragoza | NAP 1687 (mdb mirrored 8 Jul) | arrivals JSON, CORS `*` | 50 platforms, CORS `*` |
| Metro de Sevilla | NAP 1583, headway-only | token-gated arrivals | – |
| Metro de Málaga | operator GTFS | GTFS-RT, not public | – |
| Metro de Granada | NAP 1568 | HTML table | – |
| Tranvía de Murcia | NAP 1569 | GTFS-RT, not public | – |
| Metrotenerife | GTFS expired 2025-07 | undocumented GPS API | 9 trams at 10:2x |
| SFM M1 | TIB GTFS | none | above |

## Gaps

- **Rodalies stops on 4 October in today's Cercanías file.** Núcleo 51 has 1,251 Trips on Sun 4 Oct and none from Mon 5 Oct; every other núcleo runs to 30 Oct. `calendar.txt` still lists Rodalies service days to 30 Oct; no Trips use them. Unchanged since Thu 1 Oct. The Catalan note's 23 Sep file spanned 30 days. If it isn't fixed by Monday's file, v1's daily build has no Rodalies Trips. Worth checking first thing Monday, outside this ticket.
- **Cercanías file not daily.** Unchanged Thursday to Sunday, so a núcleo's timetable change can lag days.
- **Cercanías positions are mostly station-snapped.** On Sunday 79% of Trains were `STOPPED_AT` or `INCOMING_AT`, worse than Rodalies' weekday mix.
- **A partial Cercanías file** (109 entities against ~190) came once in four fetches. The fetcher should treat a sudden drop as a bad fetch, not as Trains gone.
- **Iryo:** no timetable, no live data.
- **Ouigo:** timetable only, from a MERITS export last mirrored in July; no live data.
- **AVE/LD/MD:** no shapes, and the horizon past a few weeks is thinner than the real service.
- **Euskotren:** live trip updates only; the positions file is empty.
- **FGV, SFM:** no official live data at all.
- **Separate FEVE GTFS (NAP 1131):** expired since May; the Renfe files cover the lines instead.
- **Adif:** no open station list or live circulations.
- **Licences unstated** for FGV's own files.
- **Not checked:** NAP's own file dates (needs a key), Euskotren GTFS-RT CORS headers, rate limits on Moveuskadi, weekday live counts outside Catalonia (Catalan note has 339 Cercanías Trains nationwide at 06:55 on 24 Sep).

## Questions for #222

- High speed without Iryo, and with Ouigo Scheduled only: show Ouigo at all? Say Iryo is missing in About?
- Metre gauge: are the ex-FEVE lines part of Renfe's Networks (Cercanías per núcleo, Regional), or a Network of their own?
- Euskotren (Live by trip updates only), FGV and SFM (Scheduled only): in scope with Renfe's núcleos, or later with the metros?
- Credits: CC-BY for Renfe, Euskotren and TIB; "Powered by MITRAMS" for anything taken from the NAP (Ouigo). One credits line, or per Network?
- Madrid is half the live Cercanías Trains outside Catalonia. Is it the first núcleo?
- Basque: Euskotren's feed is in Basque (`feed_lang eu`) with translations. Does the map take Basque names?

## Re-verify quickly

```sh
# Cercanías: Trips per núcleo over the whole file. On 4 Oct Rodalies (51) had 5,474, four days' worth, against Madrid's (10) 37,118
curl -sO https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip && unzip -p fomento_transit.zip trips.txt | tail -n +2 | cut -c1-2 | sort | uniq -c
curl -s https://gtfsrt.renfe.com/vehicle_positions.json | jq '[.entity[].vehicle.trip.tripId[:2]] | group_by(.) | map({(.[0]): length}) | add'
curl -s https://gtfsrt.renfe.com/vehicle_positions_LD.json | jq '.entity | length'
curl -sL https://opendata.euskadi.eus/transport/moveuskadi/data-index-gtfs-rt.json | jq '.data.Euskotren'
curl -s -o /dev/null -w '%{http_code}\n' https://nap.transportes.gob.es/api/Fichero/GetList   # 401 without ApiKey
```
