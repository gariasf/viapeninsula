# A build report that shows only what changed

Design note for #219, under #214. Today the daily build logs every trace problem it meets, every day. Across Spain that list gets long, and the same lines come back daily. This note proposes a report that shows only what's new against the last build, with a link to the map at each spot, so a person reviews only that.

- **Date:** 2026-10-04, a Sunday.
- **Method:** read the build's log calls in `src/build/`, the workflows in `.github/workflows/`, and the logs of the daily runs of 2, 3 and 4 Oct (runs 36946354294, 37082392426, 37165189561). Read how the page reads its link in `src/web/main.ts`. Took the trace log of #217 (all of Renfe's Cercanías on the peninsula's rails, `viapeninsula-217-osm/trace-all.log`) as a sample of a Spain-wide report. No code changed.

## TL;DR

- **Where:** the report goes to R2 as `report.json`, next to the manifest, and the next build diffs against it. A person reads the diff in the run's job summary. A comment on one standing issue, only when something is new, is a later step.
- **Links:** `https://viapeninsula.gariasf.com/#map=<zoom>/<lat>/<lon>` already works, with no code. Each spot also links to OpenStreetMap there. A highlight ring (`&mark=<lat>,<lon>`) is a small, separate page ticket.
- **Keys:** a spot is keyed by its kind, its Line and its Stations' IDs, never by a Trip's or a shape's ID, and never by a date. Consecutive stretches of one Line with one cause are one spot.
- **Fails:** nothing new fails the build by itself. What fails today stays. One new guard: a Network losing more than a quarter of today's Trips against the last build.
- **Upstream:** each spot links to OpenStreetMap's editor and names the OSM ways there. Fix the map, not the code, where the map is wrong. A small script cuts the cached rails around a spot into a fixture, and a test traces it.
- **Tickets:** six, in order, at the end. The first two are the report itself.

## What the build reports today

All of it is `console.log` or `console.warn` in the daily run's log. Nothing is kept between runs.

| What | Where in the code | Fails the build? |
|---|---|---|
| A shape's length, traced against the feed's | `traceShapes()`, `track.ts` | yes, if more than 5% off (or 2 × `BAND` on short shapes) |
| A stretch that keeps the feed's shape: a Station off the network, or no path along the rails | `traceShape()`, `track.ts` | no |
| A trace that turns back on the way between two Stations | `traceShape()` | no |
| A Station left out, off the feed's shape on a branch | `traceShape()` | no |
| A shape whose Trips serve fewer than two Stations | `traceShape()` | no |
| A Trip left out: fewer than two Stations, no track, a Station too far off its track, too fast | `placeTrips()`, `trips.ts` | no |
| A feed shape with no points | `readFeed()`, `networks.ts` | no |
| A Network with no Trips on a day | `build()`, `daily.ts` | yes for today, a warning for later days |
| Overpass mirrors failing, or an old copy used | `osm.ts` | only with no copy at all |
| The line measures (#160, #186), with the largest nodes at each zoom | `summary()`, `measures.ts` | no |
| Each file written, with its size | `write()`, `daily.ts` | no |

`traceShapes()` and `placeTrips()` already take a `log` function, which the tests replace. That is the seam the report needs.

### How long it is

- Catalonia, 4 Oct: 441 lines in the whole job log. The build's own part is about 185: 132 length lines, 41 problem lines, 10 lines of measures, the file sizes.
- Day to day, the 41 problem lines hardly change. From 3 to 4 Oct two lines were new: R2N's reversed `:back` shape came back with its França line, and a Rodalies "no Trips" line moved on a day. From 2 to 3 Oct three FGC Stations (Les Planes, Baixador de Vallvidrera, Peu del Funicular) dropped out of the log, and a Metro Trip's ID changed for the same spot, Santa Coloma → Fondo at 107 km/h.
- The measures did move: 175 breaks on 3 Oct, 167 on 4 Oct. A diff should show that as one line.
- #217's sample, all Cercanías on Spain's rails, traces only: 256 lines. 170 are lengths. 87 are problems, 81 of them outside Catalonia.
- Those 81 are 42 spots once a shape and its reversed copies count once, and a stretch counts once each way. Grouped by Line and cause they are about twelve places to look, on ten Lines: Cádiz T1's fourteen stretches are one tram-train section, Santander C3's eleven Stations one branch.
- Not in the sample: Trips left out, high speed and long distance (#216), metros and trams beyond Catalonia (#215). So a first build for all of Spain would list some hundreds of lines. That first one is the hand hunt #214 expects. After it, a quiet day should show nothing.

## 1. Where the report lives

Options:

- **The run's job summary** (`$GITHUB_STEP_SUMMARY`). Markdown on the run's page, written by the build. Free, no permission. But nobody is told, and it goes with the run (runs are kept 90 days by default).
- **An issue comment.** It notifies the maintainer, and links stay. It needs `issues: write` in `daily.yml`, and a daily comment would be noise.
- **A GitHub Actions artifact.** A file on the run. It could be the baseline, but the next run must find the last good run and download it through the API.
- **An artifact page, a published web page.** A nicer view, but CI can't publish one, and it would be one more thing to keep.
- **R2.** The build already writes there, and already reads the last build's `manifest.json` back from `LIVE_URL` to name yesterday's bundle. A `report.json` beside it is the same step. It lasts until replaced, and it's public, like the bundles it describes.

**Recommendation:** two places, for two readers.

- **R2 holds the baseline.** The build writes `out/report.json`, with every spot it found, not just the new ones. It publishes it after the manifest, with a short cache like the manifest's. The next build fetches it as it fetches the manifest. With none to fetch, every spot is new.
- **The job summary holds the diff,** for a person: new spots first, then gone ones, then changed numbers, each with its links. Empty when nothing changed, apart from one line saying so. A dry run prints the same diff to the terminal.
- **Later, an issue comment** on one standing "Build report" issue, only when a spot is new. That's the notification. It can wait until the summary has run for a week and the noise is known.

A deploy whose build changed runs the daily build too. Its report then diffs against the last day's, so it shows what the code change did to the map. That's the review #160's measures were made for.

## 2. How a spot links to the map

The page lets MapLibre keep the view in its link as `#map=<zoom>/<lat>/<lon>` (`hash: 'map'` in `main.ts`). `writeLink()` adds `train=` and `station=` beside it, and `openLink()` opens them. So a view link works today. R16 turning back at L'Aldea:

```
https://viapeninsula.gariasf.com/#map=16/40.75356/0.61431
```

Where each kind of spot points:

| Spot | Point | Zoom |
|---|---|---|
| Stretch that keeps the feed's shape | halfway between its two Stations, or the middle of the run of stretches | fit the run, at most 15 |
| Turns back | the Station it turns at | 16 |
| Station left out on a branch | that Station | 15 |
| Trip left out | the Station named in the reason, or its first | 15 |
| Length drift | the shape's middle | fit the shape |
| A largest node (measures) | the node, as `summary()` already prints it | the zoom it was found at |

Each spot also gets:

- `https://www.openstreetmap.org/#map=17/<lat>/<lon>`, to see the rails as mapped;
- `https://www.openstreetmap.org/edit#map=18/<lat>/<lon>`, to fix them;
- the IDs of the OSM ways next to it, as `https://www.openstreetmap.org/way/<id>` links. The graph knows them; the log doesn't print them yet.

Two limits:

- The link shows the published bundle. For a spot the map draws (a Line keeping its feed's shape, a turn-back), it shows the spot once the daily build has published. For a dry run, use the local preview with a local bundle, as before.
- A spot that is left out (a Station, a Trip) isn't drawn. The view shows where it should be. That is enough to judge it.

**Recommendation:** ship `#map=` links now, with the OSM links beside them. A highlight is a small page change in its own ticket: `&mark=<lat>,<lon>` draws a ring at that point until the next tap, and `openLink()` reads it as it reads `station=`. Nothing in the report waits for it.

## 3. Stable keys to diff against the last build

The 2–4 Oct logs show what can't be a key:

- **Trip IDs.** The Metro's Trip left out at Santa Coloma → Fondo was `1.1.11828892` on 2 Oct and `1.1.11828731` on 3 Oct. Renfe's IDs carry its feed's version too.
- **Dates.** "No Trips on 2026-10-05" is a new line every day.
- **Shape IDs alone.** R2N's `:back` copy comes and goes with the days in the feed. A shape and its `_INV` and `:back` copies are one Line's problem.

**Recommendation:** a spot's key is its kind, its Network, its Line, and the IDs of the Stations it names, in a fixed order:

| Kind | Key |
|---|---|
| keeps the feed's shape | `kept <line> <first station> <last station> <why>`, the two Stations sorted, a run of consecutive stretches with one cause merged into one |
| turns back | `turn <line> <station>` |
| left out on a branch | `branch <line> <station>`, a run of consecutive Stations merged |
| Trip left out | `trip <line> <reason> <station…>`, with a count of Trips, not their IDs |
| no Trips on a day | `notrips <network> <days ahead>`: 0, 1 or 2 |
| length drift | `length <line> <shape without :back>`, with its percentage |
| a largest node | `node <zoom> <lat> <lon>`, the point rounded to 3 decimals, about 100 m |
| measures | one record, `measures`, with each number |

- Station IDs come from the feeds. They can change too, but much less often than Trip IDs. Where one does, the spot shows as gone and new on the same day, with the same names, and is easy to read.
- **The diff:** a key in today's report and not the last is new; one in the last and not today's is gone. For records with numbers (length, Trip counts, measures), the record shows as changed when a number moves past a threshold: length by more than 1 point, a Trip count by any, a measure by any.
- **Dedup across days:** a Trip left out on two of the three days is one record. Today's log prints such a Trip twice.
- A spot that flickers, as R2N's `:back` does, would show on and off. Keying by Line, not shape, already absorbs that one. If others flicker, a spot can count as gone only after two builds without it. That waits until it's seen.
- **No list of accepted spots.** A spot shows once, the day it's new. A real turn-back, like R16's at L'Aldea (#63), then stays in `report.json` and never shows again. Keeping a reviewed list in the repo would be one more file to keep in step.

The record also holds what the summary prints: the text the log prints today, the Station names, the point and the OSM way IDs. `report.json` is then a full list for anyone who wants it, and the summary only the diff.

## 4. What fails the build, and what only reports

A failed daily build leaves the days already in R2. They last three days, so a failure is safe for a day or two, and it stops a wrong map going out. But a failure on every new spot would stop the map for a tram-train stop mapped as `tram`.

Today these fail:

- a traced shape more than 5% longer or shorter than the feed's, where the feed has the track (ADR-0004);
- a Network with no Trips today;
- no OSM rails at all, cached or fresh.

**Recommendation:**

- **Keep those three.** They catch a broken download or a map wrong enough to mislead.
- **Everything new only reports.** Missing rails, turn-backs, branches, Trips left out, changed measures. A person reads them in the summary and decides.
- **Add one guard:** fail when a Network's Trips for today drop by more than a quarter against the last report's count for the same weekday kind. At Spain's scale one feed's bad day, or a half-empty OSM download, would leave out thousands of Trips without failing anything today. A quarter is a guess: tune it after a week of reports.
- **Don't fail on the number of new spots.** The first build of a new Network (#218) is all new, by design. That report is its review.

## 5. How fixes go upstream, and how a real snippet becomes a test

### Upstream to OpenStreetMap

ADR-0004 already says OpenStreetMap can be wrong. Most of #217's spots are OSM's to fix, not ours: a missing link near Los Rosales, a branch not joined at Gandia, a tram-train mapped as `tram`.

The steps for each new spot:

1. Open its map link and its OSM link.
2. If OSM is wrong (a gap, a wrong tag, a wrong alignment), fix it in OpenStreetMap, with a changeset comment naming the spot, like "Join the branch to Platja i Grau de Gandia, for viapeninsula #219". Tell the local mappers if it's more than a gap.
3. If OSM is right and the build's rule is wrong, file a ticket here, with the spot's key and links.
4. If both are right, as at L'Aldea, do nothing: the spot won't show again.

The fix shows in the next build once the rails are fetched again. With Overpass that's up to a week, with the week-old copy (`FRESH`). With Geofabrik's extracts (#217's recommendation) it's the day after, within the same rule. Then the spot shows as gone in the report. That's the check that the fix worked.

### A real snippet becomes a test

`track.test.ts` draws its rails by hand, in metres. That's right for rules. A real trap is better kept as it was: the rails, the Stations and the feed's shape around one spot.

- A script, run by hand: `npm run snippet -- <spot key or lat,lon> <name>`. It reads the cached rails (`.cache`, or #217's filtered file), keeps the ways within about 2 km of the spot, and the feed's shape and Stations of that Line there. It writes `src/build/fixtures/osm/<name>.json`, with the OSM data's date and an ODbL credit in a `source` field.
- Cut it before fixing OSM upstream, so the test holds the broken data.
- A test in `track.test.ts` traces it and checks the log line the spot made, or, after a fix in our code, that it no longer makes it.
- Keep each snippet small, a few tens of KB. Cut only the spots that show a new kind of trap, not every spot.
- The first one: R16's turn-back at L'Aldea (#63), a known trap whose rule must keep holding.

## Proposed tickets

Not filed. In order:

1. **The build collects what it reports.** `traceShapes()`, `placeTrips()` and `build()` hand records to the report as well as log lines: kind, key, Network, Line, Station IDs and names, point, OSM way IDs, text, numbers. Consecutive stretches with one cause merge into one record; a Trip left out on more than one day is one record. The daily build writes `out/report.json`. The log stays as it is.
2. **Diff against the last build, in the job summary.** The daily build fetches `report.json` from `LIVE_URL`, as it does the manifest, and writes new, gone and changed spots to `$GITHUB_STEP_SUMMARY` with map and OSM links, or one line when nothing changed. It publishes `report.json` after the manifest. A dry run prints the diff. With no last report, all spots are new.
3. **A real snippet becomes a test.** `npm run snippet` cuts a spot's rails, Stations and feed shape into `src/build/fixtures/osm/`, and a test in `track.test.ts` traces it. First snippet: L'Aldea (#63). A short "review a build report" section, with the upstream steps above, goes in the README or `docs/`.
4. **Fail when a Network loses many Trips.** More than a quarter of today's Trips against the last report's count fails the daily build. Depends on 2.
5. **A spot's ring on the map.** `#map=…&mark=<lat>,<lon>` draws a ring there until the next tap. The summary's links add `mark=`. A page change, independent of the rest.
6. **Tell the maintainer when something is new.** The daily build comments on one standing "Build report" issue, only when the diff has new spots. Needs `issues: write`. After a week of 2's summaries.

1 and 2 are the report. 3 is worth doing before the first region outside Catalonia (#218). 4 to 6 can wait for the first Spain-wide build.
