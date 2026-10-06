# Review a build report

Each daily build, and each deploy whose build changed, diffs its report against the last one published and writes the diff to the run's job summary (#250): the spots new since the last build, those gone, and those whose numbers moved. Each spot comes with its key, its lines of the log, and links to the map there, to OpenStreetMap there, to edit OpenStreetMap there, and to the ways its Stations are on. On most days it's one line: nothing changed. Why it's built this way is in `docs/research/build-report.md`.

Where a problem spot is new (a run of legs that keeps the feed's shape, a turn-back, a branch, Trips left out, or a Network with no Trips on a day), the build also comments on the standing [Build report](https://github.com/gariasf/viapeninsula/issues/290) issue, which notifies the maintainer: the new problem spots, with their links, and the run's link (#255). It never comments for a length, a node or the measures, which move with any change to the map, nor for a Network's Trips, so those are only in the summary.

## A new spot

1. Open its map link and its OpenStreetMap link.
2. If OpenStreetMap is wrong there (a gap in the rails, a wrong tag, a line on an old alignment), fix it in OpenStreetMap, with a changeset comment naming the spot, as "Join the branch to Platja i Grau de Gandia, for viapeninsula #219". Tell the local mappers if it's more than a gap. If it shows a new kind of trap, cut it into a test first (below).
3. If OpenStreetMap is right and the build's rule is wrong, file an issue here with the spot's key and links.
4. If both are right, as at L'Aldea, where R16's Trains do turn back (#63), do nothing: the spot stays in `report.json` and won't show again.

A fix in OpenStreetMap reaches the map when the build next downloads Geofabrik's extracts, which it keeps for a week. The spot then shows as gone: that's the check that the fix worked.

## A Network with fewer Trips

A Network shows as changed when it has more than a quarter fewer Trips today than the last report has for the same day of the week (#252). The build keeps them all. A holiday runs a Sunday's timetable, so on one there's nothing to do. Otherwise, look in the same summary for Trips left out, as a gap in the rails leaves them, then at the operator's timetable, which may have lost them.

## A spot as a test

`track.test.ts` draws its rails by hand, which suits a rule. A real trap is better kept as it was: OpenStreetMap's rails, the feed's shapes and the Stations around the spot. Cut one only for a spot that shows a new kind of trap, not for every spot, and before fixing OpenStreetMap, so that the test keeps the broken data.

1. `npm run daily -- --dry-run`, for the rails, timetables and `out/report.json` the snippet is cut from.
2. `npm run snippet -- "<spot key>" <name> [km]`. It writes `src/build/fixtures/osm/<name>.json`, with the day OpenStreetMap's data was downloaded and the credits. It holds every way that comes within that many km of the spot (2 unless given), whole, and the spot's Line's shapes there, with the Stations there that their Trips serve. Give a `<lat,lon>` in place of the key to cut round another point, with every Line's shapes there.
3. In `track.test.ts`, trace it along `ownRails()`, as the build does, and check the lines the spot logged, or, after a fix in our code, that it no longer logs them.

A trace needs the Stations either side of the spot: R16 turns back at L'Aldea on its way from Camp-redó, 5 km off, to Ulldecona, 22 km off. A cut too small to hold them keeps the feed's shape instead, or fails on a shape's length. So cut as little as still traces the spot as the build did, round a point between those Stations if that needs less than round the spot, and aim for a few tens of KB. L'Aldea's, 14 km round a point between Tortosa and Ulldecona, is 72 KB.
