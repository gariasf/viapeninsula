# OpenStreetMap's rails for all of Spain: Geofabrik extracts or Overpass

Research for #217, under #214: how the build should get OpenStreetMap's rails once the map goes beyond Catalonia. It compares Geofabrik's extracts, filtered with osmium, against the Overpass queries the build sends today, and measures how `railGraph` and `traceShapes` scale on the result. #220 reuses the filtered extract (see Files kept).

- **Date:** 2026-10-04, a Sunday, 10:15–10:30 CEST.
- **Machine:** the maintainer's Mac (Apple silicon, 8+ cores), on a home connection. Times on a GitHub runner will differ; see CI.
- **Method:** downloaded the extracts, filtered them with osmium-tool 1.19.1 (libosmium 2.23.1, from Homebrew), converted the result to the JSON the build reads, and compared it way by way with Overpass answers. Then ran the build's own `fine`, `railGraph` and `traceShapes` on it from a copy of `src/` outside the repo, with `railGraph` exported. Memory is peak resident set size from `/usr/bin/time -l`.

## TL;DR

- **Geofabrik + osmium is fast and small.** Spain's extract is 1.49 GB and took 4 min to download here. osmium cut it to Spain's rails in 4 s, at 2.0 GB of memory, into a 4.4 MB file. With Portugal and three French regions for the borders: 2.85 GB downloaded, 7.5 MB of rails.
- **It matches Overpass exactly.** Every one of the 9,786 ways Overpass returned for Catalonia (2 Oct), and the 1,182 beyond its border (4 Oct), is in the extract, with the same nodes, positions and tags.
- **Overpass failed today.** All three mirrors the build uses answered 504 to the Catalonia query, after 15 s, 119 s and 100 s. A query for all of Spain would be about 4.5 times as big.
- **Tracing scales.** All of Renfe's Cercanías (15 núcleos, 170 shapes, 879 Stations) traced on the peninsula's rails in 3.1 s, at 1.5 GB for the whole run. The graph is 278k vertices. Every shape came within 5% of the feed's length. The traps are elsewhere: ten Lines outside Catalonia need a look (see Tracing).
- **CI can do it daily.** A public repo's `ubuntu-latest` has 4 CPUs, 16 GB of memory and 14 GB of disk. The heaviest step needs 2 GB and 3 GB of disk.
- **Recommendation:** Geofabrik + osmium, with Overpass dropped. Keep the filtered file as the cache, as `.cache` keeps Overpass's answers today, and fall back to the last copy when a download fails. Details at the end. The ADR waits for the maintainer's pick.

## How the build gets rails today

- `osmRails()` in [`src/build/osm.ts`](../../src/build/osm.ts) sends two Overpass queries:
  - ways whose `railway` is `rail`, `narrow_gauge`, `subway`, `tram` or `funicular`, in the area `ISO3166-2=ES-CT`;
  - the same ways within 10 km (`MARGIN`) of Catalonia's land border with Aragon, Valencia, France and Andorra (#62).
- Both ask `out body geom`: each way's tags, node ids and node positions. No Station nodes come from OpenStreetMap: Stations come from the feeds.
- `catalonia()` asks for the border itself, as the ways of the `ES-CT` relation. `crop()` cuts the Lines there.
- [`daily.ts`](../../src/build/daily.ts) passes all those rails to each Network, which keeps its own kind (`onRodaliesRails` keeps `railway=rail` with gauge 1668), simplifies them with `fine()`, and traces with `traceShapes()`, which builds a `railGraph()`.
- `parse()` drops ways with an `opening_date` after today.

### Today's fallback

- `overpass()` keeps each answer in `.cache/osm-<hash>.json`. A copy less than 7 days old (`FRESH`) is used without asking.
- Otherwise it tries overpass-api.de, then kumi, then private.coffee, each with a 200 s timeout.
- If all fail it uses the old copy, however old, with a warning. With no copy at all, the build fails. A failed build leaves the days it published before in R2.
- The daily workflow saves `.cache` with `actions/cache` under a new key each run and restores the newest ([`daily.yml`](../../.github/workflows/daily.yml)).

## Measured

### Geofabrik downloads

The `-latest` URLs redirect to dated files: these are `*-261003.osm.pbf`, from data of 3 Oct 20:20 UTC, published from 23:52 UTC that night.

| Extract | Size | Download here | Filter time | Filter memory | Rails out | Why |
|---|---|---|---|---|---|---|
| Spain | 1,488 MB | 243 s | 4.05 s (25 s CPU) | 2.01 GB | 4.4 MB, 44,542 ways | everything |
| Portugal | 425 MB | 74 s | 1.28 s | 2.07 GB | 0.97 MB | Lines into Portugal |
| France: Languedoc-Roussillon | 270 MB | 40 s | 0.88 s | 1.92 GB | 0.68 MB | Portbou–Cerbère, Puigcerdà–La Tor de Querol |
| France: Midi-Pyrénées | 362 MB | 47 s | 1.20 s | 1.91 GB | 0.61 MB | Catalonia's margin near the Val d'Aran |
| France: Aquitaine | 296 MB | 35 s | 1.00 s | 1.99 GB | 0.70 MB | Irun–Hendaye, Canfranc–Pau |
| Andorra | 3.5 MB | 1 s | 0.03 s | 37 MB | 2 ways | not needed |
| **All merged** | **2,844 MB** | **~440 s** | **~8 s** + 0.14 s merge | **2.07 GB** | **7.5 MB, 70,649 ways, 621,740 nodes** | |

- The Spain extract alone reaches 5.1° E: Geofabrik's boundary takes in "a little more of a neighbouring country if this greatly simplifies the polygon" ([technical page](https://download.geofabrik.de/technical.html), read 2026-10-04). It still missed 579 of the 1,182 ways Overpass finds beyond Catalonia, all in France. Languedoc-Roussillon and Midi-Pyrénées bring all of them.
- The rails: 28,310 km of mapped track in Spain (each track of a double track counted), 41,231 km with the borders' extracts. Catalonia's is 4,004 km.

Commands:

```sh
osmium tags-filter -O -o spain-rails.osm.pbf spain-latest.osm.pbf w/railway=rail,narrow_gauge,subway,tram,funicular
osmium merge -O -o peninsula-rails.osm.pbf spain-rails.osm.pbf portugal-rails.osm.pbf ...
osmium add-locations-to-ways -O -f opl -o peninsula-rails.opl peninsula-rails.osm.pbf   # 0.09 s, 117 MB
```

`tags-filter` keeps the nodes the ways reference, reading the input "up to three times", and "only keeps tables of object IDs it needs in main memory" ([osmium-tags-filter](https://docs.osmcode.org/osmium/latest/osmium-tags-filter.html), read 2026-10-04). `add-locations-to-ways` writes each node's position onto its way, so one line of OPL holds a whole way.

### Into the build's format

The build reads `OsmWay`s: `id`, `nodes`, `geometry` and `tags`, as Overpass's `out body geom` gives them. This turns the OPL into that, in 0.57 s at 545 MB for the peninsula:

```js
// osmium add-locations-to-ways -f opl ... | node opl2json.mjs > rails.json
import { createInterface } from 'node:readline';
const un = (s) => s.replace(/%([0-9a-f]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const elements = [];
for await (const line of createInterface({ input: process.stdin })) {
  if (line[0] !== 'w') continue;
  const f = Object.fromEntries(line.split(' ').map((p) => [p[0], p.slice(1)]));
  const tags = Object.fromEntries((f.T ? f.T.split(',') : []).map((kv) => kv.split('=').map(un)));
  const nodes = [], geometry = [];
  for (const n of f.N.split(',')) {
    const m = n.match(/^n(\d+)x([-\d.]+)y([-\d.]+)$/);
    if (m) nodes.push(+m[1]), geometry.push({ lat: +m[3], lon: +m[2] });
  }
  elements.push({ type: 'way', id: +f.w, nodes, geometry, tags });
}
process.stdout.write(JSON.stringify({ elements }));
```

The build could instead read the OPL straight from `osmium`'s output, the way `gtfs.ts` streams `unzip -p`. Either way `railGraph` and `traceShapes` don't change.

### Against Overpass

All three mirrors answered 504 to today's Catalonia query: overpass-api.de after 15 s, private.coffee after 119 s, kumi after 100 s. So the comparison uses the build's own cached answers, from the main checkout's `.cache`:

- Catalonia (`osm-c63c56b3c453.json`, data of 2 Oct 13:38 UTC): 10.6 MB, 9,786 ways, 62,992 nodes.
- Beyond the border (`osm-cf566ad564ee.json`, data of 4 Oct 05:57 UTC): 1.4 MB, 1,182 ways.

| | Overpass (today's build) | Geofabrik + osmium |
|---|---|---|
| Area | Catalonia + 10 km | Spain, Portugal, 3 French regions |
| Download | 12 MB of JSON, two queries | 2.85 GB of PBF, six files |
| Time | "over a minute" when it answers (#217); 504 from all three mirrors today | ~440 s download here + ~9 s filter, merge and convert |
| Memory | none locally | 2.07 GB peak (osmium) |
| Output | 12 MB JSON | 7.5 MB PBF; 60 MB JSON, 30 MB OPL |
| Freshness | live on overpass-api.de; kumi's was 28 Jul on a copy fetched this morning | once a day, data of ~20:20 UTC the day before |
| All of Spain | one query ~4.5× Catalonia's; not tried | measured above |
| Catalonia's 9,786 ways | | all present; same nodes, positions and tags |
| Beyond's 1,182 ways | | all present; same nodes, positions and tags |

The extract's data is a day and a half newer than the Catalonia answer, and no rail way in Catalonia changed in between.

One trap: cutting the extract to Catalonia with `osmium extract -p` and the `ES-CT` relation kept only 9,060 of Overpass's 9,786 ways, losing 729 inside Barcelona, Girona and Manresa. I didn't find why. The build doesn't need that cut, since `crop()` cuts at the border itself, but don't trust it without checking.

## Tracing at the scale of Spain

`fine()` then `railGraph()` on every rail, no Stations:

| Rails | Ways | Nodes | `fine` | `railGraph` | Vertices | Edges | Peak memory |
|---|---|---|---|---|---|---|---|
| Catalonia + 10 km (Overpass) | 10,446 | 68,700 | 0.1 s | 0.3 s | 52,756 | 54,046 | 0.38 GB |
| Spain | 44,536 | 371,988 | 0.3 s | 2.1 s | 294,746 | 301,023 | 0.92 GB |
| Spain + Portugal + France's 3 | 70,643 | 621,431 | 0.4 s | 3.3 s | 474,561 | 484,588 | 1.28 GB |

Renfe's Cercanías feed (`fomento_transit.zip`, 1 Oct) covers every núcleo in Spain, so `traceShapes` could run on all of it. The script reads the feed for Monday 5 Oct with every route, not just núcleo 51's, keeps the Iberian and metre gauges (núcleos 45–47 are ex-FEVE), and traces with the build's own code:

| Traced | Rails | Shapes | Stations | Graph | `traceShapes` | Whole run | Peak memory |
|---|---|---|---|---|---|---|---|
| Rodalies (núcleo 51) | Catalonia + 10 km | 50 | 197 | 28,538 vertices | 0.4 s | 3.9 s | 0.62 GB |
| Rodalies | Spain | 50 | 197 | 182,425 | 1.6 s | 6.2 s | 1.09 GB |
| Rodalies | peninsula | 50 | 197 | 231,600 | 2.1 s | 7.2 s | 1.20 GB |
| All Cercanías | peninsula | 170 | 879 | 277,804 | 3.1 s | 9.6 s | 1.49 GB |

- The whole run includes reading the feed (about 3 s) and the JSON.
- Every shape came within 5% of the feed's length: from −3.2% to +3.6%, median 0.0%.
- On Spain's rails, R15 traces on to Caspe and Zaragoza, where on Catalonia's it keeps the feed's shape past Nonaspe.
- Ten Lines outside Catalonia (with their reverse shapes) log a problem, the hand hunt #214 expects:
  - no path along the rails: Sevilla C3 (Los Rosales–Tocina), Asturias C2 and C8, Santander C1;
  - Stations left out as on a branch: Asturias C2, C5 and C7, Valencia C1 (Gandia), Santander C3 (eleven Stations);
  - off the network: Cádiz T1 (a tram-train, on `tram` rails the script didn't keep), Bilbao C4.
- 879 Stations made only 35 Lines: names like C1 repeat across núcleos. That's for #218.
- Not measured: high speed and long distance, which have no feed shapes (#216), and metros and trams beyond Catalonia (#215). `sideBySide` and the line-order solver at this size are #220's.

So tracing time and memory grow about with the rails, and stay small. What grows is the list of spots to check.

## CI

A public repo's `ubuntu-latest` runner has 4 CPUs, 16 GB of memory and 14 GB of disk ([GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), read 2026-10-04). A job can run 6 hours ([limits](https://docs.github.com/en/actions/reference/limits)). The daily job's own timeout is 60 minutes.

- **Memory:** osmium peaks at 2.1 GB, tracing all Cercanías at 1.5 GB. Fine.
- **Disk:** 2.85 GB of downloads, which can be deleted once filtered. Fine.
- **Time:** the filter used 25 s of CPU for Spain here, so on 4 slower cores expect well under a minute. The download is the cost: 7 min on a home line; a runner's line may be faster, unmeasured.
- **osmium:** Ubuntu 24.04 has `osmium-tool` 1.16.0 in universe ([packages.ubuntu.com](https://packages.ubuntu.com/noble/osmium-tool), read 2026-10-04): one `apt-get install` step. Unmeasured on a runner: its install time, and whether 1.16 behaves as 1.19 did here.

So yes, a runner can do it daily. It needn't: rails change slowly, and today's rule of a week-old copy fits here too.

## What to cache, and how a failed download falls back

- **The filtered rails, not the raw extracts.** 7.5 MB of PBF, against 2.85 GB raw. `actions/cache` allows 10 GB a repo and drops entries not used in 7 days ([dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching), read 2026-10-04). A daily run keeps it alive, as it keeps `.cache` today.
- **Daily diffs don't help.** Geofabrik publishes one diff per extract per day, `spain-updates/000/004/9xx.osc.gz`, 1.1–3.2 MB each this week ([technical page](https://download.geofabrik.de/technical.html); [spain-updates](https://download.geofabrik.de/europe/spain-updates/)). But `osmium apply-changes` updates a data file sorted by type and id, and change files from extracts must go in oldest first ([osmium-apply-changes](https://docs.osmcode.org/osmium/latest/osmium-apply-changes.html), read 2026-10-04). Applied to the filtered file, a way newly tagged as rail would reference nodes the file doesn't have. So diffs mean keeping the whole 2.85 GB in the cache, and restoring that costs about what downloading it does.
- **A pinned copy in R2.** The build could also put the filtered file in R2 next to the bundles. It outlives `actions/cache`'s 7 days and survives a cache wipe. A small extra.
- **Fallback, as today:** use a copy less than 7 days old without downloading. Otherwise download; if Geofabrik fails, use the last copy, however old, with a warning; with none, fail and leave the published days in R2. Geofabrik is one host, where Overpass had three mirrors, but each extract also has dated files to fall back to.
- **Freshness of a fix:** an edit fixed upstream in OpenStreetMap shows in the next day's extract, against minutes on overpass-api.de. With the week-old rule, up to a week, as now.

## Recommendation

Geofabrik's extracts, filtered with osmium, for all of Spain, Portugal and the French regions the borders need. Drop Overpass for rails.

- It answered in seconds when Overpass answered nothing, and it matches Overpass way for way.
- It needs one `apt-get` step and about 30 lines of build code: download, filter, merge, read the OPL.
- Keep the week-old rule, `actions/cache` of the filtered file, and the stale-copy fallback.
- Catalonia's border (`catalonia()`) also comes from Overpass today. The same extract has the `ES-CT` relation: `osmium tags-filter r/ISO3166-2=ES-CT` took 5 s at 1.96 GB. Turning it into the border's ways wasn't tried.
- Download only what the Lines reach. For today's Catalonia that's Spain plus Languedoc-Roussillon and Midi-Pyrénées. Portugal and Aquitaine come with the Lines that cross there.

## Files kept

Outside the repo, in `/Users/guillem.arias/Documents/gariasf/viapeninsula-217-osm/` (the raw extracts are deleted):

- `peninsula-rails.osm.pbf` (7.5 MB) and `peninsula-rails.json` (60 MB): Spain, Portugal, Andorra and the three French regions, filtered. **#220 should use this.**
- `spain-rails.osm.pbf` (4.4 MB) and `spain-rails.json` (34 MB): Spain alone. Each region's `*-rails.osm.pbf` too.
- `overpass-ct-1002.json`, `overpass-beyond-1004.json`: the Overpass answers compared against.
- `renfe-cercanias.zip`: the Renfe feed traced (1 Oct).
- `code/trace.ts` with its copy of `src/` (only change: `railGraph` exported), `s/` (the shell scripts, `opl2json.mjs`, `compare.mjs`), and `trace-all.log`, the log of tracing all Cercanías.
