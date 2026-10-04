# Adding a Network as configuration only

Research for #218, under #214: what is per-Network in the code today, a config shape that covers today's four Networks and Spain's candidates, what still needs code, and how a new Network is tried before it ships. It feeds the grill in #222.

- **Date:** 2026-10-04, a Sunday.
- **Code read:** `main` at d1cf921. Line numbers below are from that commit.
- **Inputs:** #215's note on Spain's feeds ([spain-feeds.md](spain-feeds.md)) and #217's on OpenStreetMap's rails for Spain ([osm-rails-spain.md](osm-rails-spain.md)).
- **Words:** "module", "interface", "seam" and "adapter" as in the codebase-design vocabulary. An adapter is code that fills a slot at a seam. A seam with one adapter is only a guess; one with two or more is real.

## TL;DR

- **Most of what differs per Network is already data**, just written as code: rail filters as functions, Line rules as regexes in the web app, credits keyed by Network id, three `network.id === …` checks in the engine. All of it fits one plain config object per Network.
- **One config module, `src/networks.ts`, read by the build and the fetcher.** The web app and the engine get what they need through the bundle, as they get `runningSide` and `colour` today. No `network.id` check is left in the engine or the web app.
- **One Network per Cercanías núcleo.** #217 found Line names like C1 repeat across núcleos (879 Stations, 35 Lines). A Line's id is already `<network>:<name>`, so a Network per núcleo keeps every Line apart with no new rule. It also matches the public brand: "Cercanías Madrid", "Rodalies de Catalunya".
- **What stays code: a live format of its own.** The seam is a live adapter in the fetcher, keyed by format. Today there are four adapters (Renfe, FGC, TRAM, TMB). Spain adds one more, generic GTFS-RT, for Euskotren. Renfe's other núcleos and its long-distance feeds reuse Renfe's adapter. FGV, SFM and Ouigo have no live data and need no adapter.
- **Two small things stay code, once:** a Station shared by several Networks (all of Renfe's run on Adif's), and cropping each Network to its own area instead of Catalonia.
- **A new Network is tried with `trial: true`:** the daily dry run builds it, #219's report lists its spots, and the preview recipe screenshots it, all without publishing it.
- **Nine tickets**, in order, at the end. The first three move today's four Networks into config with no change to the map, checked by an identical bundle and unchanged tests.

## What differs per Network today

"Data" means a value or a rule that could be written as a value. "Behaviour" means code that reads a format or keeps state.

### The daily build

| What | Where | Rodalies | FGC | TRAM | Metro | Data or behaviour |
|---|---|---|---|---|---|---|
| Name, id | `src/build/networks.ts:9`, `:44`, `:81`, `:105` | `rodalies` | `fgc` | `tram` | `metro` | data |
| Speed profile | `networks.ts:14`, `:51`, `:86`, `:111` | 1 m/s², 160 km/h, 30 s | 1, 120, 30 | 1.2, 70, 10 | 1.3, 80, 20 | data |
| Running side | `networks.ts:20`, `:55`, `:89`, `:115` | right | right | right | right | data |
| Colour of its track below z7 | `networks.ts:22`, `:57`, `:91`, `:117` | `#F26E21` | `#8BB83E` | `#00A99D` | `#E2001A` | data |
| Its rails in OpenStreetMap | `networks.ts:26`, `:61`, `:94`, `:121` | `railway=rail`, gauge has 1668 | rail, narrow_gauge, subway or funicular, operated by FGC | `railway=tram` | subway or funicular, not FGC's | data, written as functions |
| Timetable URL | `src/build/daily.ts:42`–`46` | Renfe Cercanías zip | FGC zip | two zips, TBX and TBS | TMB zip, key in the query | data |
| Timetable credentials | `daily.ts:46`, `:126` | none | none | none | `TMB_APP_ID`, `TMB_APP_KEY` | data (names of secrets) |
| Which routes are its | `networks.ts:35` | route_id starts `51` | all rail routes | all | all | data, written as a function |
| Trip and shape id prefix | `networks.ts:33`, `:72`, `:102`–`103`, `:130` | `rodalies` | `fgc` | `tram:TBX`, `tram:TBS` | `metro` | data |
| Station id prefix (who runs them) | `networks.ts:34`, `:73`, `:102`, `:130` | `adif` | `fgc` | `tram` | `tmb` | data |
| A platform's Station is its parent | `networks.ts:74`, `:102`–`103` | no | yes | yes | no (ADR-0005) | data |
| Train number | `networks.ts:37` | 5 digits after the service_id in trip_id | none | none | none | data, written as a function |
| Line colours the feed gets wrong | `networks.ts:41` | R7, R13 | none | none | none | data |
| Line variants joined (#29) | `networks.ts:78` | none | R53 → R5, R63 → R6 | none | none | data |
| "Updated" date its terms ask for | `daily.ts:50`, `:56` | no | no | no | the feed's start date | data (a flag) |
| Rail kinds asked of OpenStreetMap | `daily.ts:51` | union of all four, written by hand | | | | data, derivable |
| Area its Lines are cropped to | `daily.ts:51`, `src/build/osm.ts:41`–`46`, `:54` | Catalonia, plus 10 km of rails beyond | same | same | same | data (one region for all, today) |
| Route types that are Trains | `networks.ts:152` | 0, 1, 2, 7 for all | | | | shared, not per Network |

### The fetcher

| What | Where | Rodalies | FGC | TRAM | Metro | Data or behaviour |
|---|---|---|---|---|---|---|
| Live URLs | `src/fetcher/worker.ts:9`–`29` | Renfe GTFS-RT JSON, two files | Geotren JSON, and a lookup for the trip-updates file | activevehicles JSON and GTFS-RT per half | iTransit JSON | data |
| Credentials | `worker.ts:31`–`42`, `:116`, `:134` | none | none | OAuth client id and secret, token kept for an hour | app id and key in the query, scrubbed from errors | behaviour, with secret names as data |
| How often | `src/fetcher/step.ts:19`–`25`, `:185`–`189` | every run (20 s) | 2 min, 5 min under 1,000 requests left, none at 0 until 00:00 UTC | every run, backoff up to 30 min after a refusal | every other run | behaviour, with the periods as data |
| State kept between runs | `step.ts:68`–`86` | none | file address, written, stalled, requests left | token, expiry, backoff | none | behaviour |
| Which Trains are this Network's | `step.ts:271`, `:278` | trip_id starts `51` | all | all | all | data |
| Report ids | `step.ts:274`, `:325`, `:414`, `:457` | `rodalies:<trip>` | `fgc:<trip>` | `tram:<half>:<trip>` | Block `metro:<line> <number>` | data (the prefixes) |
| Station named in a position | `step.ts:292`, `:324`, `:413`, `:460` | `adif:<stopId>`, `00000` is none | `fgc:` + platform less its digits | `tram:<platform number>` | `tmb:1.<code>` | data for the prefixes, behaviour for each format's parse |
| Line variants in live data | `step.ts:334` | none | Geotren's M1, M2 → MM | none | none | data |
| Parsing | `step.ts:266`, `:320`, `:405`, `:441` | GTFS-RT as JSON | Geotren JSON + GTFS-RT protobuf | activevehicles + GTFS-RT protobuf | iTransit JSON | behaviour |
| The list of feeds | `step.ts:34`, `:96`, `worker.ts:61`–`67` | | | | | written by hand |

### The engine

| What | Where | Rule | Data or behaviour |
|---|---|---|---|
| No Delay shown | `src/engine.ts:208` | `network.id === 'metro'`: TMB runs by headway, its timetable names no Blocks (#103) | a trait of the Network's live data |
| Operator's Delay is minutes off; carry the GPS Delay | `engine.ts:573`, `:455`–`467` | `network.id === 'rodalies'` | a trait of the Network's live data |
| `near` means standing, not pinned while coming in | `engine.ts:888` | `id !== 'rodalies'`: Renfe pins Trains coming into a Station too | a trait of the Network's live data |
| Blocks, Live, Scheduled, holds | throughout | driven by what reports carry (`block`, `along`, `next`) and by the profile | already generic |

### The web app

| What | Where | Rule | Data or behaviour |
|---|---|---|---|
| Kind of service, pill outline | `src/web/main.ts:1019`–`1026` | Metro and TRAM badges; Rodalies `R1\d` and FGC `R5`, `R50`, `R6`, `R60`, `RL1`, `RL2` pointed; `MM`, `FV` badges; the rest round | data, written as regexes by Network id |
| Zoom pills show from | `main.ts:1020`, `:1026` | 12 for Metro and TRAM, 10 for the rest | data |
| Credit | `main.ts:270`–`277` | by Network id: Renfe and FGC CC BY 4.0, TRAM's own words, TMB with its date | data, written as functions |
| A place's own Network | `src/web/names.ts:44` | by Station prefix: `adif` → Rodalies, `fgc`, `tram`, `tmb` → Metro | data, and breaks once two Networks share `adif` |
| Tiers and bold names | `main.ts:119`, `:210` | Station ids the maintainer picks | data; a new Network's places fall to UNTIERED, which works |
| Running side, colours | `main.ts:772`, `:818` | from the bundle | already generic |
| About and legend copy | `src/web/i18n.ts:79`–`81` | names TMB, TRAM, the rack and funiculars | copy, edited by hand |

## The config shape

One module, `src/networks.ts`, exports a list of plain objects. It's TypeScript, not JSON, so each number keeps the comment that says where it came from, as `networks.ts` does now. It holds no functions, so the build and the fetcher can both import it, and a test can check it.

```ts
/** One Network: everything the build, the fetcher and, through the bundle, the map need to know of it. */
export interface NetworkConfig {
  id: string;                      // 'rodalies', 'cercanias-madrid', 'euskotren'
  name: string;                    // 'Cercanías Madrid'
  profile: SpeedProfile;           // as bundle.ts has it
  runningSide: 'left' | 'right';
  colour: string;                  // its track below z7 (#190)
  /** Where its Lines are cut: an ISO 3166-2 region, as 'ES-CT' or 'ES-MD'. */
  area: string;
  /** Its rails in OpenStreetMap: any of these `railway` values, and where given, a gauge or operator among these. */
  rails: { railway: string[]; gauge?: string[]; operator?: string[]; notOperator?: string[] };
  /** Its timetables: TRAM has two. */
  timetables: Timetable[];
  /** How its Trains are drawn and named on the map. */
  lines: LineRules;
  credit: Credit;
  /** Its live data, if it has any: a Network without it is Scheduled only. */
  live?: LiveTraits;
  /** Built and reported by a dry run, but never published (see Trying a Network). */
  trial?: true;
}

export interface Timetable {
  url: string;
  /** Secrets that go in the URL's query, by parameter: { app_id: 'TMB_APP_ID' }. */
  query?: Record<string, string>;
  /** What its Trips' and shapes' ids start with: 'rodalies', 'tram:TBX'. */
  prefix: string;
  /** Who runs its Stations, as their ids start: 'adif', 'fgc', 'tmb', 'euskotren'. */
  operator: string;
  /** A platform's Station is its parent station. */
  parents?: true;
  /** Which routes are this Network's, where not all are: route_id prefix, or route_short_name pattern. */
  routes?: { idPrefix?: string; shortName?: string };
  /** A Trip's Train number: the first match of `pattern` in a column, as Renfe's after the service_id, or Ouigo's trip_short_name. */
  number?: { from: 'trip_id_after_service' | 'trip_short_name'; pattern: string };
}

export interface LineRules {
  /** Line names the public uses, by the feed's route name (#29): { R53: 'R5' }. */
  names?: Record<string, string>;
  /** Colours for Lines the feed gets wrong: { R7: 'B57CBB' }. */
  colours?: Record<string, string>;
  /** Each Line's kind of service: the first pattern its name matches, else `kind`. */
  kind: Kind;
  kinds?: { name: string; kind: Kind }[];
  /** The zoom its pills show from: 10 for main-line Networks, 12 for metros and trams. */
  pillZoom: number;
}

export type Kind = 'commuter' | 'regional' | 'long-distance' | 'high-speed' | 'metro' | 'tram' | 'rack' | 'funicular';

export interface Credit {
  /** Who to credit, and where: 'Renfe', 'https://data.renfe.com/'. */
  text: string;
  url: string;
  licence?: 'CC BY 4.0';
  /** Words its terms ask for instead, as TRAM's "Powered by TRAM Barcelona", or NAP's "Powered by MITRAMS". */
  words?: string;
  /** Its terms ask the map to show when its timetable was last updated, as TMB's do: the feed's start date. */
  updated?: true;
}

/** How the engine reads this Network's live data, where it differs from the plain case. */
export interface LiveTraits {
  /** Which fetcher source reports its Trains. Several Networks can share one, as Renfe's núcleos do. */
  source: string;
  /** 'operator': trust its figure. 'gps': carry the GPS Delay, as for Renfe (engine.ts:573). 'none': show none, as for the Metro (engine.ts:208). */
  delay: 'operator' | 'gps' | 'none';
  /** 'standing': a Train `near` a Station stands there, as FGC's. 'pinned': it may be coming in too, as Renfe's (engine.ts:888). */
  near: 'standing' | 'pinned';
}

/** A live source: one adapter in the fetcher, with what it needs as data. */
export interface LiveSource {
  id: string;                         // 'renfe', 'renfe-ld', 'fgc', 'tram', 'tmb', 'euskotren'
  format: 'renfe' | 'fgc' | 'tram' | 'tmb' | 'gtfs-rt';
  urls: Record<string, string>;
  /** Worker secrets it reads, by what the adapter calls them. */
  secrets?: Record<string, string>;
  /** How often to fetch it, in ms: a multiple of the fetcher's 20 s. Its adapter may slow down, as FGC's does near its quota. */
  every: number;
  /** Which Network a Trip is, by what its trip_id starts with: { '51': 'rodalies', '10': 'cercanias-madrid' }, or { '': 'fgc' } for all. */
  networks: Record<string, string>;
  /** Line names its live data uses for Lines the timetable names otherwise: { M1: 'MM', M2: 'MM' }. */
  lines?: Record<string, string>;
}
```

### How today's four fit

```ts
{
  id: 'rodalies', name: 'Rodalies de Catalunya', area: 'ES-CT', runningSide: 'right', colour: '#F26E21',
  profile: { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 },
  rails: { railway: ['rail'], gauge: ['1668'] },
  timetables: [{
    url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
    prefix: 'rodalies', operator: 'adif', routes: { idPrefix: '51' },
    number: { from: 'trip_id_after_service', pattern: '^\\d{5}' },
  }],
  lines: { colours: { R7: 'B57CBB', R13: 'E52E87' }, kind: 'commuter', kinds: [{ name: '^R1\\d$', kind: 'regional' }], pillZoom: 10 },
  credit: { text: 'Renfe', url: 'https://data.renfe.com/', licence: 'CC BY 4.0' },
  live: { source: 'renfe', delay: 'gps', near: 'pinned' },
}
```

- **FGC:** `rails: { railway: ['rail', 'narrow_gauge', 'subway', 'funicular'], operator: ['FGC', 'Ferrocarrils de la Generalitat de Catalunya'] }`, `parents`, `names: { R53: 'R5', R63: 'R6' }`, `kinds` for `R5`, `R50`, `R6`, `R60`, `RL1`, `RL2` (regional), `MM` (rack), `FV` (funicular). Live: `{ source: 'fgc', delay: 'operator', near: 'standing' }`.
- **TRAM:** `rails: { railway: ['tram'] }`, two timetables (`tram:TBX`, `tram:TBS`), `kind: 'tram'`, `pillZoom: 12`, credit `words`. Live: `{ source: 'tram', delay: 'operator', near: 'standing' }`.
- **Metro:** `rails: { railway: ['subway', 'funicular'], notOperator: [the two FGC names] }`, the TMB URL with `query: { app_id: 'TMB_APP_ID', app_key: 'TMB_APP_KEY' }`, `kind: 'metro'`, Montjuïc `funicular`, `pillZoom: 12`, `credit.updated`. Live: `{ source: 'tmb', delay: 'none', near: 'standing' }`.
- The `notOperator` field exists only for the Metro. It's cheaper than a rule for "not another Network's rails", which would make one Network's config depend on another's.

### How Spain's candidates fit

| Candidate (#215) | Networks | Timetable | Rails | Live | New code |
|---|---|---|---|---|---|
| Renfe Cercanías, 14 other núcleos | one per núcleo: `cercanias-madrid`, `cercanias-valencia`, … | Renfe's Cercanías zip, `routes.idPrefix` = núcleo code | rail, gauge 1668; Asturias, Bilbao, Santander add 1000 | `renfe`, núcleo codes in `networks` | none |
| Renfe ex-FEVE commuter (45, 46, 47) | one per núcleo, as above | same zip | rail or narrow_gauge, gauge 1000 | `renfe` | none |
| Renfe AVE, LD, MD, Regional | #216 decides how many | Renfe's LD zip, no shapes (#216) | rail, both gauges; high speed 1435 | `renfe-ld`: same format, other URLs, no per-vehicle time | none in config; #216's traces without feed shapes, and the Regional overlap, are their own |
| Ouigo | one | NAP or the Mobility Database mirror; `operator: 'adif'` only after dropping the `0071` prefix | 1435 | none | a stop-id rewrite: `stops.idPrefix: '0071'` to strip, one more config field once Ouigo comes |
| Euskotren | one, or trains and trams apart (#222) | Moveuskadi zip, `parents` | `operator: ['Euskotren', 'Eusko Trenbideak']` | `gtfs-rt` (trip updates only) | the `gtfs-rt` adapter |
| FGV Metrovalencia, TRAM d'Alacant | one each | operator zips | operator FGV | none | none; Metrovalencia's shapes are coarse, so tracing leans on OpenStreetMap |
| SFM | one | TIB's island zip, `routes` by agency or names | operator SFM | none | `routes.agency`, one more config field |

- **The núcleo answer to C1.** #217 traced all Cercanías as one set: 879 Stations, 35 Lines, as every núcleo's C1 merged. With a Network per núcleo the Line ids are `cercanias-madrid:C1` and `cercanias-sevilla:C1`, and nothing else changes. The fetcher already reads every núcleo's Trains in one request; `LiveSource.networks` sends each to its Network by the trip_id's first two digits, as `startsWith('51')` does now.
- **The cost:** each núcleo's Network reads Renfe's 225 MB `stop_times.txt` again, for each of three days. Fifteen Networks is about 45 reads, unmeasured; #217 read the whole feed for one day in about 3 s. The maintainer said performance can wait. When it can't, the build reads each URL once and splits it by `routes`, which needs no config change. Mark it `ponytail:` where it lands.

## What still needs code

### A live format of its own: the live adapter seam

The step today is one function with a block per feed (`step.ts:131`–`183`) and per-feed state fields (`State.fgc`, `State.tram`, `State.tramBackoff`). The seam goes there:

```ts
/** One live format: what to fetch, and how to read what came back. Its own state is opaque to the step. */
interface LiveAdapter<Own = unknown> {
  /** The requests this run makes, from its config, its state and the Worker's secrets. */
  fetch(source: LiveSource, own: Own | undefined, env: Secrets): Promise<Responses>;
  /** Its Trains' reports, the files' times for the stuck check, its next state, and whether it's due next run. */
  read(source: LiveSource, responses: Responses, own: Own | undefined, now: number): {
    reports: Report[]; said: [file: string, at: number][]; own: Own; due: (at: number) => boolean; status?: string;
  };
}
```

- The step keeps what's common to all: freshness, keeping the last good reports, the stuck-file check, writing the snapshot. Each adapter keeps its own: FGC's file lookup and quota, TRAM's token and backoff, the Metro's every-other-run.
- It writes each source's freshness under every Network the source feeds, so `snapshot.feeds[network.id]` keeps working for the engine and the banner with no change.
- Adapters: `renfe`, `fgc`, `tram`, `tmb` today, and `gtfs-rt` for Euskotren. That's five, so the seam is real. Each adapter's tests are today's step tests, replaying the same fixtures.
- The protobuf reader (`gtfsRt`, `step.ts:469`) is shared by FGC, TRAM and the new `gtfs-rt` adapter.
- A source with a format no adapter reads, like SFM's socket.io boards or FGV's HTML, stays Scheduled until someone writes one. That's the only case where adding a Network is more than config.

### Once, before a second Network on Adif's Stations

- **A Station shared by several Networks.** Every Renfe Network's Stations are `adif:<code>`. Today `track.stations` is each Network's Stations flattened (`daily.ts:68`), so `adif:18000` would come twice. And `NETWORK_OF` (`names.ts:44`) gives a place one Network by its prefix. The fix: one Station per id, merged across Networks, and a place's own Networks from the Lines that call there, which the bundle already has. This is code, once.
- **An area per Network.** Every Network is cropped to Catalonia today (`daily.ts:51`, `osm.ts:54`). `area` in the config names the region; the build crops each Network to its own and fetches rails for the union. Where the rails come from (Overpass or #217's extract) is #217's and #220's choice; this only needs a border per region. Whether Networks are cropped at all once all of Spain is in is #222's.
- **Kinds of service in the bundle.** The bundle gets `Line.kind` and `Network.pillZoom`, `credit` and `live` traits. Then `pillOf` (`main.ts:1019`), `CREDITS` (`main.ts:270`) and the engine's three id checks read them, and their Network names go. CONTEXT.md's "Kind of service" says the bundle names none and the map tells it by Network and name; that line changes with the ticket.

### What doesn't need code

- **Running side, profile, colour.** Already data in the bundle.
- **Blocks, `along`, `next`.** The engine reads what a report carries, whichever Network sent it.
- **Scheduled-only Networks.** `unavailable()` (`engine.ts:366`) lists only Networks in the snapshot's feeds, so one with no live source is never "unavailable". About should say it has no live data: that's copy.
- **Tiers and bold names.** A new Network's places start UNTIERED. The maintainer picks tiers later, as now.

## Trying a Network before it ships

A Network can be merged as config with `trial: true`. It's then built, reported and previewed, but never published.

1. **Dry run.** `npm run daily -- --dry-run --only <id>` builds that Network alone (and `--with <id>` builds it beside the shipped ones, to see it on shared track). It writes `out/` as the dry run does today. A trial Network is skipped by the published build, so main stays deployable.
2. **Report (#219).** The dry run writes #219's report for the Network: where a trace keeps the feed's shape or turns back, which Stations and Trips are left out, length drift, the line measures. A new Network has no last build, so every spot is new; that list is the hand hunt #214 expects, and #217 found ten Lines with problems outside Catalonia. Each spot links to the map view.
3. **Screenshots.** Load `out/` on the dev map with Playwright request interception (the "preview a local bundle" recipe, as for every line change since #138), one shot per report spot plus a zoom ladder at the Network's busiest Station. Live data on the preview needs a same-day bundle.
4. **Live.** Record its live feed with a `record` run for that source, and replay it through its adapter's tests. For a new adapter, `wrangler dev --test-scheduled` and `/__scheduled` run it locally against the real feed.
5. **Ship.** Drop `trial`, add its credit and copy, and merge. The next deploy runs the daily build first, as it does for every change to the build.

## Proposed tickets

Listed here only. Each is a vertical slice: it changes what it touches end to end and leaves main deployable. They're filed `needs-triage` once the maintainer has read this.

1. **The build reads today's Networks from config.** `src/networks.ts` with the four Networks; `readFeed` and the rail filter read `Timetable` and `rails`; `daily.ts` loops over the list and asks OpenStreetMap for the union of their railway kinds. Done when a dry run's track and day files hash the same as main's, and `networks.test.ts` passes unchanged.
2. **The bundle names what the map guesses by Network.** `Line.kind`, `Network.pillZoom`, `credit` and `live` traits go in the bundle; `pillOf`, `CREDITS`, `shown()`, `hear()` and `delayOf()` read them; no `network.id === '…'` is left in `src/engine.ts` or `src/web/`. Done when the engine tests pass unchanged and the map looks the same (screenshots at the pill spots of #90). CONTEXT.md's "Kind of service" updated.
3. **The fetcher reads its sources from config, through live adapters.** `renfe`, `fgc`, `tram`, `tmb` behind `LiveAdapter`; per-adapter state; `LiveSource.networks` routes Renfe's Trips by trip_id prefix. Done when the step tests replay the same fixtures to the same snapshots, and a deploy shows the four feeds `ok`.
4. **One Station per id across Networks.** Merge shared Stations; a place's own Networks from its Lines, replacing `NETWORK_OF`. Done when a test with two Networks on `adif:` ids gives one place, named beside the right track.
5. **Each Network cropped to its own area.** `area` per Network, a border per region, rails for the union. Done when today's four, all `ES-CT`, build the same bundle, and a test Network in another region keeps its Lines.
6. **Trial Networks.** `trial: true`, `--only` and `--with`, and #219's report for one Network. Done when a trial Network is in the dry run's `out/` and its report, and absent from a published build. Needs #219's report to exist; without it, the dry run's logs stand in.
7. **First Network by config only: one Cercanías núcleo.** Whichever #222 picks first; Madrid is half the live Cercanías Trains outside Catalonia (#215). Its config, credit and copy; its spots from the report fixed upstream in OpenStreetMap or noted; screenshots. Done when the diff touches only `src/networks.ts`, copy and tests, and its Trains are Live through the `renfe` adapter.
8. **A generic GTFS-RT adapter, and Euskotren.** `gtfs-rt` for trip updates (and positions, where a feed has them); Euskotren as config, trial first. Only if #222 puts Euskotren in scope.
9. **A Scheduled-only Network.** FGV, SFM or Ouigo, as #222 picks: config with no `live`, About saying it has no live data. Ouigo needs the stop-id rewrite and NAP's credit; SFM needs `routes.agency`. Done when it's on the map, Scheduled, and the banner never names it.

Tickets 1–3 change nothing anyone sees, and can go in any order after 1. Tickets 4 and 5 block any Network outside Catalonia. Ticket 6 can go any time after 1.

## Open, for #222

- Is each Cercanías núcleo a Network of its own, as this note assumes? The alternative, one "Cercanías" Network with Lines named `Madrid C1`, keeps one credit and one colour but breaks the brand and the names the public uses.
- Is a Network still cropped to its area once all of Spain is in, or only to Spain? Lines like R15 to Caspe (#217) cross from Catalonia into Aragon.
- The ex-FEVE núcleos: Networks of their own (Cercanías Ferrol), or part of the Renfe brand per region?
- Euskotren's trains, Bilbao's L3 and its trams: one Network, as its feed has them, or apart, as the public knows them?
