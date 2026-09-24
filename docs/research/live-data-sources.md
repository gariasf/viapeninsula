# Live rail data for Catalonia and Spain

Research for **Via Península** (working title): a map of trains, metros and trams running on real track in Spain, in the style of railisland.tw (軌島, [siriushsu/taiwan-rail-live](https://github.com/siriushsu/taiwan-rail-live)). Catalonia first.

- **Date:** 2026-09-24, a Thursday. Samples taken 06:55–07:15 CEST, the start of the morning peak. It was also La Mercè, a Barcelona public holiday, so TMB and TRAM ran their Sunday timetables: their figures below are holiday figures (see Scale).
- **Method:** every endpoint below was requested directly unless marked *(docs)* or *(second-hand)*. Counts come from those samples. They are snapshots, not averages.

## TL;DR

- **Feasible.** Catalonia has more live data than railisland uses. railisland simulates every train from timetables along OSM track, and only TRA gets live delays (its README, "已知限制"). Here, Renfe and FGC publish real GPS, TRAM publishes each tram's position along its line, and TMB publishes per-train metro predictions.
- **No feed is smooth enough to draw raw.** Renfe Cercanías snaps stopped and arriving trains to station coordinates, and FGC refreshes only every ~2 min. Keep railisland's timetable engine and use live data as a correction layer.
- **Everything joins.** Every open feed matches its static GTFS at ~100%, once Renfe's space-padded fields are stripped.
- **Gaps:** Iryo (no public data), Ouigo (timetable only), TMB buses (per-stop predictions only), freight (nothing).
- **Needs a small server-side proxy** (a Cloudflare Worker). Renfe and TRAM send no CORS headers, and the TMB key and TRAM OAuth secret must stay private.
- **Rest of Spain is thinner.** Renfe covers every Cercanías region. Beyond that, the only open metro GTFS-RT with positions is Metro Bilbao, and its positions are station-snapped. Tenerife's tram has GPS behind an undocumented API. Most other metros and trams give arrivals only, and Madrid Metro's GTFS is expired. So Catalonia first is the natural v1.

## The bar: how railisland works

From its [README](https://github.com/siriushsu/taiwan-rail-live):

- **Frontend:** one `index.html` with no build step, data in `data/*.json`, and fetch/build scripts in `scripts/` (Python + Node). Hosted as Cloudflare Workers static assets.
- **Positions:** driven by the timetable along OSM track, with an acceleration model per train type. 1× is real time. TRA applies per-minute delays from TDX. High-speed rail, metros and light rail run on timetables or official headways, with no live data.
- **Features:** follow a train (speed curve, progress, stops), station boards, level-crossing pass predictions, a "nearby trains" pin (1.5 km radius, next 60 min), passport and badges, share deep links, PWA, power-save mode.
- **Geometry pipeline:** OSM via Overpass → remove spikes → repair holes → project stations onto track distance.

## Summary: Catalonia

| System | Timetable (GTFS) | Track shapes | Live data | What "position" means | Refresh | Auth / CORS | Licence |
|---|---|---|---|---|---|---|---|
| Rodalies + all Renfe Cercanías | daily zip | yes, dense | GTFS-RT positions + delays + alerts | GPS while moving; station coords when stopped or arriving | ~20 s | none / no CORS | CC-BY 4.0 |
| Renfe AVE/LD/MD/Regional | daily zip | **no** → OSM | GTFS-RT positions + delays; web visor JSON | GPS | 15–30 s (fix ~45 s old) | none / no CORS | CC-BY 4.0 (visor not in catalog) |
| FGC | zip + Opendatasoft | yes | GTFS-RT positions/predictions/alerts + Geotren (occupancy per car) | GPS-like | ~120 s (data 2–4 min old) | none, 5000 req/day/IP / CORS `*` | CC-BY 4.0 |
| TRAM (Trambaix, Trambesòs) | 2 zips | yes | REST `activevehicles` + GTFS-RT trip updates | metres since trip origin (0 at stops) + delay | TU header 10–15 s old | OAuth2 (free signup) / no CORS | TRAM terms |
| TMB Metro | zip (key) | yes | iTransit arrivals, whole network in one call (L1–L5, L11) | inferred from per-train countdowns | on request | app_id/app_key / echoes Origin | TMB terms: cite TMB and update date, don't alter |
| TMB Bus | zip (key) | yes | iBus, per stop | — | — | key | — |
| Ouigo | national access point *(second-hand)* | no | none | — | — | — | — |
| Iryo | none (only an ATM stub) | — | none | — | — | — | — |

## Sources in detail

### Renfe Cercanías (incl. Rodalies de Catalunya)

**Static:** `https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip` ([catalog](https://data.renfe.com/dataset/horarios-cercanias), CC-BY 4.0)

- **Contents:** 14 MB zip, 266 MB unzipped. agency, calendar, routes, **shapes** (144 shapes, 124k points, median spacing 36 m), stops, stop_times (244 MB), transfers, trips.
- **Span:** 30 days (2026-09-23 → 2026-10-22), with one `service_id` per núcleo (Cercanías region) per day. Example: `1065J` = núcleo 10, Thursday 24 Sep.
- **One day:** 4,907 trips and 66k stop_times nationwide. Rodalies alone: 1,312 trips and 15k stop_times.
- **Every field is space-padded** (a fixed-width export). Headers too: `end_date` has trailing spaces. Strip everything, or the real-time join drops to 76%.
- **`trip_id`** = `service_id` (5 chars) + train number (5) + line, e.g. `5165J28268R2S`. The first two digits are the núcleo.
- **Shapes** are per line (`51_R2S`, `51_R2S_INV`), not per stopping pattern.

**Real time:** `https://gtfsrt.renfe.com/{vehicle_positions,trip_updates,alerts}.{pb,json}` ([positions](https://data.renfe.com/dataset/ubicacion-vehiculos), [trip updates](https://data.renfe.com/dataset/horarios-viaje-cercanias), [alerts](https://data.renfe.com/dataset/incidencias-avisos))

- **Headers:** `ETag`, `Last-Modified`, `Cache-Control: max-age=30`. No gzip, no CORS. Positions are 30 KB as protobuf vs 132 KB as JSON.
- **Refresh:** the header timestamp advances every 18–22 s, and per-vehicle timestamps step 20 s.
- **Volume at 06:55:** 339 vehicles nationwide, 50 of them in Rodalies (núcleo 51).
- **Núcleo codes seen:** 10 Madrid, 20 Asturias, 30 Sevilla, 31 Cádiz, 32 Málaga, 40 Valencia, 41 Murcia/Alicante, 45–47 ex-FEVE lines (Cartagena, Ferrol and León, going by coordinates), 51 Rodalies, 60 Bilbao, 61 San Sebastián, 62 Santander, 70 Zaragoza.
- **Vehicle label** = `LINE-TRAIN`, sometimes with a platform attached: `R15-15002-PLATF.(3)`.
- **Joins:** `tripId` matches static at 100% after stripping. `stopId` matches 342/343 (`00000` = unknown).
- **Position semantics (important):**
  - `IN_TRANSIT_TO`: real GPS. Median 547 m from the nearest station; the position changed in 546 of 753 polls.
  - `STOPPED_AT` / `INCOMING_AT`: coordinates snapped to a station. 121 coordinates were shared by different trains, and `INCOMING_AT` positions stayed frozen in 772 of 922 polls.
  - As a result, 36% of consecutive distinct positions implied >180 km/h. Example: R2S train 28268 sat "incoming" on one station coordinate for 2 min, then reappeared 2 km behind it and moved forward normally.
- **Trip updates:** one entity per running trip, with a trip-level `delay` (s) and a single `stopTimeUpdate` for the next stop. 341 entities at 06:55.
- **Alerts:** 60 entities, Spanish text, targeted by `routeId`.

### Renfe AVE / Larga Distancia / Media Distancia / Regional

**Static:** `https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip` ([catalog](https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia), CC-BY 4.0)

- No `shapes.txt`. Uses `calendar` plus `calendar_dates` (11 MB). Space-padded too.
- **`trip_id`** = train number (5) + `1` + validity start date, e.g. `0806212026-09-23`.
- **Thursday 24 Sep:** 1,588 trips. MD 343, Regional 255, AVE 236, Avant 229, Reg.Exp. 167, Proximidad 140, Alvia 111, Intercity 39, Avlo 37, Euromed 15, AVE Int 10, Trencelta 4, Avant Exp 2.

**Real time, official:** `https://gtfsrt.renfe.com/vehicle_positions_LD.{pb,json}` and `trip_updates_LD.{pb,json}` ([positions](https://data.renfe.com/dataset/posicion-vehiculos-av-ld-md), [trip updates](https://data.renfe.com/dataset/horarios-viaje-alta-velocidad-larga-media-distancia))

- 140 vehicles and 160 trip updates at 06:55.
- Positions carry **no per-vehicle timestamp**.
- Join to static: 140/140.

**Real time, Renfe's web visor (not in the catalog):** `https://tiempo-real.largorecorrido.renfe.com/renfe-visor/flotaLD.json`

- **Volume:** 111–116 trains.
- **Fields:**
  - `codComercial`: train number
  - `codProduct`: product code (mapping below)
  - `codEstAnt` / `codEstSig`: previous and next station
  - `horaSalidaEstAnterior`, `horaLlegadaSigEst`: departure from previous, arrival at next
  - `codOrigen`, `codDestino`: origin and destination
  - `ultRetraso`: delay in minutes, negative = early
  - `latitud`, `longitud`, `time`
  - `mat`: rolling-stock unit, e.g. `598008`
  - also `accesible`, `p`, `corr`
- **Station codes** are Adif 5-digit codes, the same as GTFS `stop_id` (166/167 matched).
- **`codProduct`:** 2 AVE, 3 Avant, 10 Euromed/Avant, 11 Alvia, 13 Intercity, 16 MD (+ Avant Exp, some Regional), 18 Regional/Proximidad, 19 Reg.Exp. (+ some MD), 28 Avlo.
- **Quality:** continuous GPS. 19 of 775 transitions implausible (2.5%). Per-train position age: median 45 s, p90 67 s. Refresh 15–30 s. Same caching headers as gtfsrt.renfe.com.

**Overlap with Cercanías:** Catalan regionals (R11, R15 and R16 were seen) appear in both the Cercanías feed and the LD feeds. Dedupe on the 5-digit train number.

### FGC

**Static:** `https://www.fgc.cat/google/google_transit.zip`, also available file by file in the [gtfs_zip dataset](https://dadesobertes.fgc.cat/explore/dataset/gtfs_zip/). CC-BY 4.0.

- Includes shapes (44 shapes, 11.6k points). Uses `calendar_dates` only.
- **Thursday:** 1,820 trips:
  - Barcelona–Vallès: L6, L7, L12, S1, S2
  - Llobregat–Anoia: L8, S3, S4, S8, S9, R5, R6, R50, R60…
  - Lleida–La Pobla: RL1, RL2
  - FV and MM: funicular/rack lines

**Real time:** Opendatasoft datasets on [dadesobertes.fgc.cat](https://dadesobertes.fgc.cat): `vehicle-positions-gtfs_realtime`, `trip-updates-gtfs_realtime`, `alerts-gtfs_realtime`, `posicionament-dels-trens`.

- **Fetching:** the GTFS-RT files are attachments. Fetch `.../catalog/datasets/<id>/records?limit=1`, take `results[0].file.url`, then download the protobuf from it. The file ID can change, so resolve it every time.
- **Access:** CORS `*` on both the API and the files. Anonymous quota is **5000 requests/day per IP** (`x-ratelimit-*` headers, resets 00:00 UTC).
- **Refresh:** about every 120 s. Data was 131–237 s old when fetched.
- **Positions:** 50 vehicles at ~07:00, with `occupancyStatus`, `currentStatus` and `stopId`. `route_id` is empty. At 09:05 the same day the file was empty (0 bytes, several tries over a minute) while Geotren listed 60 trains, so don't rely on it alone.
- **Trip updates:** predicted arrival and departure times per stop, 58 trips.
- **Alerts:** 186. Many are per-trip notes, e.g. bus connections.
- **Joins:** positions 50/50, trip updates 58/58.
- **Geotren** (`posicionament-dels-trens/records?limit=100`), 50–57 trains:
  - line, direction, origin/destination codes
  - `properes_parades` (upcoming stops), `estacionat_a` (parked at), `en_hora` (on-time flag)
  - `tipus_unitat` (series, e.g. 112), `ut` (hashed unit ID)
  - occupancy % per car (`ocupacio_mi/ri/m1/m2_percent`)
  - Positions changed once per ~2 min, with no implausible jumps.

### TRAM Barcelona (Trambaix T1–T3, Trambesòs T4–T6)

**Static:** `https://opendata.tram.cat/GTFS/zip/TBX.zip` and `TBS.zip`, no key. Shapes included. Thursday 24 Sep: 319 trips (TBX) + 465 (TBS), the Sunday timetable because of La Mercè; a normal Thursday (1 Oct) has 468 + 741.

**Real time:** the TRAM Open Data API ([manual](https://opendata.tram.cat/manual_en.pdf), 2017).

- **Auth:**
  1. Register at opendata.tram.cat; `client_id` and `client_secret` arrive by email.
  2. `POST /connect/token` with `grant_type=client_credentials`.
  3. Use the bearer token it returns, valid 1 h.
- **Networks:** `1` TRAMBAIX, `2` TRAMBESÒS.
- **`GET /api/v1/activevehicles?networkId=`**, per vehicle:
  - `lineName`, `originStopCode/Name`, `nextStopCode/Name`
  - `vehiclePosition`: **metres travelled since the trip's origin stop** while moving (`vehicleStatus: LIGN`), and `0` while standing at a stop (`TARR`, `inStop: true`). `originStopCode` → `nextStopCode` is the segment the tram is on. *(Verified 2026-09-24 with OAuth credentials.)*
  - `inStop`, `delay` (s, negative = early)
  - `destinationStopName`, `courseDirection`, `vehicleStatus`
  - Out-of-service vehicles show `lineName: "0"`. Around 07:05: 10 of 22 in service on TBX, 8 of 22 on TBS.
- **`GET /api/v1/gtfsrealtime?networkId=`**: GTFS-RT protobuf. Only trip updates were observed (7 TBX, 5 TBS). The manual says Trambesòs also has vehicle positions, but none were seen. Trip updates match static at 100%.
- **Also documented:** alerts, occupancy by network/vehicle, timetables, trips.
- **Open door:** on 2026-09-24 these endpoints answered **without a token**. The terms still require registration for "dynamic data", so don't build on that.
- No CORS headers.
- **Terms** ([PDF](https://opendata.tram.cat/assets/pdf/condicions_en.pdf)):
  - attribution "Powered by TRAM Barcelona", with a link to tram.cat
  - "content may not be altered"
  - keep the data up to date
  - TRAM monitors access and can revoke identifiers
  - one-year agreement, auto-renewing

### TMB (Metro de Barcelona, buses)

- **Auth:** everything needs `app_id` + `app_key` query params from [developer.tmb.cat](https://developer.tmb.cat). Signup is free; the docs are behind the login. Unauthenticated calls return `401 Authentication failed. Authentication parameters missing`. CORS echoes the request Origin, but a key shipped to the browser is public, so proxy anyway.
- **Static:** `https://api.tmb.cat/v1/static/datasets/gtfs.zip`, updated weekly. A keyless mirror for inspection is [Mobility Database mdb-2359](https://files.mobilitydatabase.org/mdb-2359/latest.zip).
  - Metro: L1–L5, L9N, L9S, L10N, L10S, L11, plus FM (Montjuïc funicular).
  - Shapes on all 29,319 metro trips; `frequencies.txt` and `pathways.txt` included.
  - Thursday 24 Sep (La Mercè, Sunday timetable): 3,270 metro trips, 7,446 bus trips. A normal Thursday (1 Oct) has 4,193 metro trips.
  - No `block_id` on metro trips, and no metro `frequencies.txt`.
- **Metro live** *(verified 2026-09-24 with a key; first described in [MiniBarcelona3D's plan](https://github.com/FabianUB/minibarcelona3d/blob/main/specs/007-tmb-realtime-integration/plan.md))*:
  - `GET /v1/itransit/metro/estacions` returns the whole network in one call (~97 KB JSON): for every station and direction, the next 2 trains. 472 arrivals at 08:50.
  - Fields: `codi_servei` (train number; it persists across turnarounds, so it names a block, not a trip), `temps_arribada` (epoch ms, to the second), `codi_estacio`, `id_sentit`, `codi_via`, `desti_trajecte`, and a top-level `timestamp`.
  - Generated on request: `timestamp` is 0.3–3 s after the call. Over 3 minutes of 15 s polls, ~60% of predictions moved by a few seconds each time; countdowns track real time and pause while a train dwells. No quota headers.
  - Predictions exist for L1–L5 and L11 only. L9, L10 and the Montjuïc funicular have none.
- **Bus live:** `/v1/ibus/stops/{code}` or `/v1/itransit/bus/parades/{code}`, one stop per call, ~2,600 stops. Out of scope.
- **Quotas:** not published.
- Several public repos embed TMB keys. Don't use them.

### Other Catalan sources checked

- **ATM integrated GTFS** (national access point files [2060 full](https://nap.transportes.gob.es/api/Fichero/download/2060) / 2059 simplified; Mobility Database mdb-2826):
  - Every Catalan operator in one feed: TMB, FGC, TRAM, Rodalies, Renfe regionals, buses, plus GTFS-Fares v2.
  - IDs are ATM's own, so they don't join the operators' real-time feeds.
  - Its only Iryo data is a Barcelona–Camp de Tarragona stub (12 trips).
- **AMB buses:** GTFS-RT trip updates + alerts at `ambmobilitat.cat/transit/...`. Buses, out of scope.
- **Rodalies app:** launched Aug 2026 with a live map. No public API found.
- **Adif:** its app API (`circulacion.api.adif.es`) is the only source with Iryo/Ouigo delays. Projects such as [Adif_Unofficial](https://github.com/iscle/Adif_Unofficial) call it with signing keys extracted from the official app. Unofficial; not for a public site.
- **Iryo:** no public timetable or live data. **Ouigo:** timetable via the national access point, no live data. Both from [treneamos](https://www.treneamos.com/fuentes-de-datos/).

### Track geometry

- **Cercanías, FGC, TRAM, TMB:** GTFS shapes.
- **AVE/LD/MD:** none, so use OSM like railisland. Overpass sample (Barcelona–Tarragona box, 3,250 non-service rail ways):
  - `gauge` on every way: `1668` 1,994, `1435` 1,052, `1435;1668` 197, rest mixed
  - `usage` on 99.6%
  - `highspeed=yes` on 833
  - That's enough to keep AVE trains on standard gauge and conventional trains off it.
- overpass-api.de returned `406` without a User-Agent; send one.

## Live-tracking fidelity (measured)

| Feed | Refresh | Position age | Semantics | Jumps |
|---|---|---|---|---|
| Renfe Cercanías positions | ~20 s | ~20–26 s | GPS in transit; station-snapped when stopped/arriving | 36% of transitions >180 km/h |
| Renfe LD visor | 15–30 s | median 45 s | GPS | 2.5% >330 km/h |
| Renfe LD positions | 13–30 s | unknown (no timestamps) | GPS | not measured |
| FGC positions / Geotren | ~120 s | 2–4 min | GPS-like | none |
| TRAM activevehicles | ~10 s | — | metres since trip origin; 0 at stops | small backward jitter (2–30 m) |
| TMB iTransit metro | on request | 0.3–3 s | per-train countdown to each upcoming station | none seen |

## Implications for the build

1. **Keep railisland's core:** timetable simulation along shapes, with 1× = real time.
2. **The live layer corrects; it never drives:**
   - Apply delays (Renfe trip updates / visor `ultRetraso`, FGC trip updates, TRAM `delay`) to shift the timetable.
   - Project GPS onto the trip's shape to get a distance along the track. Only let it move trains forward, and ease toward it.
   - Treat Renfe `STOPPED_AT` / `INCOMING_AT` as "at or near station X", not as coordinates.
3. **One Cloudflare Worker:**
   - fetches upstream feeds: Renfe protobuf, the visor, FGC, TRAM (with OAuth), TMB (with key)
   - caches 15–20 s at the edge
   - decodes, dedupes, and returns one compact JSON
   - That covers CORS, secrets, FGC's per-IP quota and Renfe's missing gzip.
4. **Daily static build** (a GitHub Action):
   - Slice today's trips from each GTFS into compact JSON, a few hundred KB gzipped.
   - Strip Renfe's padding.
   - Build LD shapes from OSM.
5. **Dedupe** regionals across the two Renfe feeds by train number.

## Scale (Thursday 24 Sep 2026)

- **Trips per day:** Rodalies 1,312 · Cercanías nationwide 4,907 · AVE/LD/MD/Regional 1,588 · FGC 1,820 · TMB metro 3,270 · TRAM 784.
- **Live vehicles around 07:00:** Renfe Cercanías 339 (Rodalies 50), Renfe LD 111–140, FGC 50, TRAM 18.
- **La Mercè:** 24 Sep was a Barcelona public holiday, so the TMB and TRAM numbers above are Sunday-timetable numbers. A normal Thursday (1 Oct) has 4,193 metro and 1,209 TRAM trips; the metro ran 7–8 minutes apart at 08:50 that day.

## Cloudflare spike (measured)

On 2026-09-24, 09:18–09:24 CEST, a throwaway Durable Object fetched every Catalan feed every 20 s (17 runs) and wrote a snapshot to R2 behind `tram-live.gariasf.com`. It was deleted afterwards.

- **Feed access:** every feed answered 200 from Cloudflare: Renfe, FGC, TRAM (OAuth) and TMB. FGC's anonymous quota counter started at 4,999 of 5,000 and fell by about 3 per run, so that outgoing IP wasn't shared with other FGC users that morning.
- **CPU:** 8–23 ms per run (median 12 ms; 15 of 17 runs over 10 ms), decoding every feed with protobufjs on every run. The free plan's documented limit is 10 ms, but no run was cut off. Wall time 1.0–2.2 s.
- **The Durable Object doesn't stay in memory between 20 s alarms.** It was rebuilt on every run, so in-memory throttles, the TRAM token and last-good bodies were lost each time, and FGC got fetched every run instead of every 2 minutes.
- **CDN cache:** with a Cache Rule (hostname `tram-live.gariasf.com`, eligible for cache, edge TTL from `Cache-Control`) and `Cache-Control: public, max-age=15` on the object, Cloudflare served cache hits for 15 s and then refetched (`EXPIRED`, or `REVALIDATED` when unchanged). Query strings didn't bypass the cache. As served, the snapshot was 15–25 s old, about 35 s at worst.
- **Snapshot size:** about 15 KB of JSON for about 190 trains (Rodalies 62, FGC 55 from Geotren, TRAM 16, Metro 54), 2.2 KB gzipped.
- FGC's GTFS-RT vehicle-positions file stayed empty (0 bytes) for the whole run.

## Prior art

- **[MiniBarcelona3D](https://minibarcelona3d.com)** ([repo](https://github.com/FabianUB/minibarcelona3d); MIT per its README; last push 2026-03): a Mini Tokyo 3D clone.
  - Live: Rodalies GPS, TMB metro from iMetro.
  - Timetable-only: bus, TRAM, FGC.
  - Stack: React + Three.js + Mapbox, Go API + SQLite + a poller.
- **[Temps Real Cat](https://github.com/yopaseopor/tempsrealcat):** Leaflet markers for Renfe and FGC positions plus TMB arrivals, through a Vercel proxy.
- **[treneamos.com](https://treneamos.com), [radardetrenes.com](https://radardetrenes.com/docs) (public API), [trafico.live/trenes](https://trafico.live/trenes), [Renfetraso](https://github.com/ComputingVictor/Renfetraso):** national GPS/delay trackers built on the Renfe feeds.
- **The gap:** nobody does railisland's smooth along-track motion, follow mode, crossings and nearby trains for Catalonia, or puts FGC/TRAM live data into a map like this.

## Rest of Spain

Surveyed 2026-09-24, 07:00–07:30, by a subagent; **V** = endpoint hit, **D** = docs/search only. Metro Bilbao, Tenerife and Zaragoza were then re-checked independently. Renfe covers all Cercanías regions, ex-FEVE lines and the Cádiz tram-tren (see above).

**Short version:** outside Renfe and FGC, only **Metro Bilbao** has an open, keyless GTFS-RT feed with vehicle positions, and those are snapped to stations. **Tenerife** exposes real moving tram GPS through an undocumented API. Almost everything else gives arrival times only, so positions would have to be inferred between stations.

| System | Static GTFS | Live data | Positions | Auth / CORS | Notes | Checked |
|---|---|---|---|---|---|---|
| Metro de Madrid | CRTM / national access point 1134, shapes, CRTM licence ("Powered by CRTM") | `serviciosapp.metromadrid.es/servicios/rest/teleindicadores`: whole network in one call (508 platform rows, next 2 trains) | infer from arrivals; CRTM `GetLineLocation` is roughly station-level | none (F5 bot protection) / none | **GTFS expired 2026-05-27, headway-only**; you'd have to build trips yourself | V |
| Madrid Metro Ligero ML1–ML4 | CRTM, shapes, valid to 2027-07 | CRTM widgets API (`crtm.es/widgets/api/GetStopsTimes.php`, `GetLineLocation.php`), undocumented | ML1, ML4 yes; **ML2/ML3 no** | none / none | one call per line and stop; saw a 502 | V |
| Metro Bilbao | `ctb-gtfs.s3.eu-south-2.amazonaws.com/metrobilbao.zip`, shapes, CC-BY 4.0 | GTFS-RT positions + trip updates + alerts: `ctb-gtfs-rt.s3.eu-south-2.amazonaws.com/metro-bilbao-{vehicle-positions,trip-updates,service-alerts}.pb` | **yes**, but station coordinates with `IN_TRANSIT_TO` + next stop | none / none | ~60 s refresh; 18 vehicles at 07:3x | V ×2 |
| Euskotren (trains, Bilbao + Vitoria trams) | Open Data Euskadi zip, shapes, CC-BY 4.0 | GTFS-RT trip updates; official host now behind an F5 login (401); mirror has **0 positions** | no | locked | Euskadi "Moveuskadi" aggregate (28 operators) was stalled 8 h+ | V |
| Metrovalencia / TRAM d'Alacant (FGV) | operator zips, shapes (Valencia's coarse), Alacant space-padded | WordPress `admin-ajax.php` returns HTML next departures, one station per call | infer | none / **broken header** (the CORS header contains a CSP string) | scraping-grade | V |
| Tranvía de Zaragoza | national access point 1687 / Mobility Database mdb-2801, shapes; track JSON also published | official `zaragoza.es/.../parada-tranvia.json?rows=100`: all 50 platforms, next 2 trams | infer | none / **`*`** | cleanest arrivals API found | V ×2 |
| Metro de Sevilla | no shapes, headway-only | `metro-sevilla.es/v1/proxy/GetEstimacionHoraria/{station}`, next 2 trains **with unit numbers** | infer, but trains can be tracked | bearer token generated by the site's JS / `*` | 200 requests per window | V |
| Metrocentro Sevilla (TUSSAM T1) | TUSSAM GTFS, no shapes | `reddelineas.tussam.es`, returns 429 easily | no | ? | | D |
| Metro de Málaga | operator zip, shapes, ~2-month validity windows | GTFS-RT from its CBTC signalling system, **app + Google only** | exists, not public | – | worth asking the operator | D |
| Metro de Granada | national access point 1568, coarse shapes | `POST metropolitanogranada.es/MGhorariosreal.asp` returns one HTML table (all stops, next 2) | infer | none / none | ~30 s | V |
| Tranvía de Murcia | national access point 1569, shapes | GTFS-RT exists (press 2026-03), no public URL | not public | – | ask | D |
| Metrotenerife | public GTFS **expired 2025-07**, headway-only | undocumented `tranviaonline.metrotenerife.com/api/infoStops/vehicleLocation` (+ `infoPanel`, `cargaVehiculo` occupancy) | **yes, moving GPS** + next stop | none / none | <15 s; 14 trams at 07:3x | V ×2 |
| SFM Mallorca (trains + Palma M1) | TIB zip, shapes, CC-BY 4.0 | station boards over socket.io at `info.trensfm.com` | not public (app has a map) | none / none | | V/D |

**Gotchas:**

- **The national access point** (nap.transportes.gob.es) is not a real-time source. Its 36 "GTFS RT" entries are just links to operator endpoints. Static downloads need a free API key; Mobility Database mirrors them keyless at `files.mobilitydatabase.org/mdb-{id}/latest.zip` (keep the NAP attribution).
- **Only Zaragoza, Sevilla (with its token) and EMT Madrid alerts are browser-friendly.** Everything else needs the same proxy as Catalonia.
- **Several sources are undocumented, bot-protected or rate-limited** (Madrid F5, CRTM, Sevilla token, TUSSAM 429s). They are fine for a prototype but a grey zone for a public site. CRTM and NAP licences allow reuse with attribution but reserve the right to block heavy use.
- **Expired or headway-only timetables** (Madrid Metro, Tenerife, Sevilla) mean building trips from headways, the way railisland does for lines without published trips.
- **Ouigo and Iryo** high-speed trains are not in Renfe's feeds. Ouigo has static GTFS only (NAP / mdb-2785); no live data for either.

**Sources:**

- Data portals: [CTB Bizkaia CKAN](https://data.ctb.eus/api/3/action/package_search), [Moveuskadi](https://opendata.euskadi.eus/catalogo/-/moveuskadi-datos-de-la-red-de-transporte-publico-de-euskadi-operadores-horarios-paradas-calendario-tarifas-etc/), [Zaragoza tram dataset](https://datos.gob.es/en/catalogo/l01502973-tranvia-de-zaragoza), [TIB open data](https://www.tib.org/es/sobre-ctm/portal-de-transparencia/datos-abiertos)
- Operator pages: [Granada next trains](https://metropolitanogranada.es/horariosreal), [TranvíaOnline Tenerife](https://tranviaonline.metrotenerife.com/)
- Madrid: [CRTM portal](https://datos-movilidad.crtm.es/), [CRTM licence](https://www.crtm.es/licencia-de-uso), [CRTM widgets API notes (b4us)](https://github.com/ErCharles/b4us)
- Community wrappers: [Metrovalencia-API](https://github.com/GarriguesN/Metrovalencia-API), [TUSSAM API](https://tussam.686f6c61.dev/)
- Press: [Málaga GTFS-RT](https://www.juntadeandalucia.es/presidencia/portavoz/infraestructuras/216332/MetrodeMalaga/digitalizacion/informacionreal/ubicacion/trenes), [Murcia GTFS-RT](https://tranviademurcia.es/tranvia-de-murcia-integra-informacion-en-tiempo-real-de-sus-horarios-de-paso/)
- National access point: [NAP listing](https://nap.transportes.gob.es/ConjuntoDato/List), [NAP API](https://nap.transportes.gob.es/Account/InstruccionesAPI), [NAP licence](https://nap.transportes.gob.es/licencia-datos)
- Catalogs: [Mobility Database catalog](https://share.mobilitydata.org/catalogs-csv), [Transitland atlas](https://github.com/transitland/transitland-atlas)

## Open questions (for /grill-with-docs)

- Scope for v1: Catalonia only, or Catalonia plus national AVE/LD?
- Which systems in v1: Rodalies + FGC only, or also TRAM and TMB metro?
- Stack: a railisland-style single `index.html` + static JSON, or a Vite/TS app?
- 2D (MapLibre) or 3D (Three.js or deck.gl, Mini Tokyo 3D style)?
- Hosting: Cloudflare Workers static assets plus one Worker for live data?
- How strongly should GPS correct the simulation, and what happens when live data and timetable disagree?
- Which railisland features: follow mode, station boards, level crossings (OSM `railway=level_crossing`), nearby trains, share links, PWA?
- Registrations needed: TMB key, TRAM OAuth.
- Attribution: CC-BY for Renfe and FGC, "Powered by TRAM Barcelona".
- Name and domain ("Via Península" is a working title).

## Re-verify quickly

```sh
curl -s https://gtfsrt.renfe.com/vehicle_positions.json | jq '.entity | length'
curl -s https://tiempo-real.largorecorrido.renfe.com/renfe-visor/flotaLD.json | jq '.trenes | length'
curl -s 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens/records?limit=100' | jq .total_count
curl -s 'https://opendata.tram.cat/api/v1/activevehicles?networkId=1' | jq 'map(select(.lineName != "0")) | length'
```
