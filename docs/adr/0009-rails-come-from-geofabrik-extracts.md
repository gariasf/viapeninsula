# OpenStreetMap's rails come from Geofabrik's extracts, not Overpass

Beyond Catalonia (#214), the daily build needs OpenStreetMap's rails for all of Spain and the borders its Lines cross. Today it asks Overpass for Catalonia and 10 km beyond (ADR-0004, #62), and on 4 Oct 2026 every mirror it tries answered 504; a query for Spain would be about 4.5 times as big. So the build downloads Geofabrik's extracts instead, for Spain and the neighbouring regions the Lines reach, and filters them with osmium to the kinds of rails it asks Overpass for today (`rail`, `narrow_gauge`, `subway`, `tram`, `funicular`). Measured on 4 Oct 2026 (`docs/research/osm-rails-spain.md`): Spain's extract is 1.49 GB, osmium cuts it to 4.4 MB of rails in 4 s at 2 GB of memory, and the result holds every way Overpass returned for Catalonia and beyond its border, with the same nodes, positions and tags.

## Considered Options

- **Keep Overpass, for a larger area.** Rejected: it already fails for Catalonia when busy, kumi's data is about two months stale, and the build would wait minutes for an answer it may not get.
- **Keep the raw extracts and apply Geofabrik's daily diffs.** Rejected: diffs can't be applied to the filtered file, so the cache would hold 2.85 GB, which costs about as much to restore as to download.

## Consequences

- The daily workflow installs `osmium-tool` and downloads only the extracts the Lines reach: for Catalonia, Spain plus Languedoc-Roussillon and Midi-Pyrénées; Portugal and Aquitaine come with the Lines that cross there.
- The filtered rails are the cache, kept as `.cache` is today: a copy less than 7 days old is used without downloading; if Geofabrik fails, the last copy is used with a warning; with none, the build fails and the days already published stay in R2. Geofabrik is one host, but each extract also has dated files to fall back to.
- An edit fixed upstream in OpenStreetMap reaches the map with the next day's extract, rather than minutes later, and with the week-old rule up to a week later, as now.
- Catalonia's border (`catalonia()`) can come from the same extract, as the `ES-CT` relation; until it does, it stays on Overpass.
- `osmium extract` cut to Catalonia lost ways in a test, so the build filters by tag and crops in its own code (`crop()`), not with osmium's polygons.
