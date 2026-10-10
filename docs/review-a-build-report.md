# Review a build report

Each daily build, and each deploy whose build changed, diffs its report against the last one published and writes the diff to the run's job summary (#250): the spots new since the last build, those gone, and those whose numbers moved. Each spot comes with its key, its lines of the log, and links to the map there, which rings it until the next tap, to OpenStreetMap there, to edit OpenStreetMap there, and to the ways its Stations are on. On most days it's one line: nothing changed. Why it's built this way is in `docs/research/build-report.md`.

Where a problem spot is new (a run of legs that keeps the feed's shape, a turn-back, a branch, Trips left out, a Network with no Trips on a day, one built from its copy, or a region whose build failed), the build also comments on the standing [Build report](https://github.com/gariasf/viapeninsula/issues/290) issue, which notifies the maintainer: the new problem spots, with their links, and the run's link (#255). It never comments for a length, a node or the measures, which move with any change to the map, nor for a Network's Trips or Closures, nor for buses where their Line has no track, which no fix upstream can draw (ADR-0012), so those are only in the summary.

## A new spot

1. Open its map link and its OpenStreetMap link.
2. If OpenStreetMap is wrong there (a gap in the rails, a wrong tag, a line on an old alignment), fix it in OpenStreetMap, with a changeset comment naming the spot, as "Join the branch to Platja i Grau de Gandia, for viapeninsula #219". Tell the local mappers if it's more than a gap. If it shows a new kind of trap, cut it into a test first (below).
3. If OpenStreetMap is right and the build's rule is wrong, file an issue here with the spot's key and links.
4. If both are right, as at L'Aldea, where R16's Trains do turn back (#63), do nothing: the spot stays in `report.json` and won't show again.

A fix in OpenStreetMap reaches the map when the build next downloads Geofabrik's extracts, which it keeps for a week. The spot then shows as gone: that's the check that the fix worked.

## A Network with fewer Trips

A Network shows as changed when it has more than a quarter fewer Trips today than the last report has for the same day of the week (#252). The build keeps them all. A holiday runs a Sunday's timetable, so on one there's nothing to do. Otherwise, look in the same summary for Trips left out, as a gap in the rails leaves them, then at the operator's timetable, which may have lost them.

## A Network built from its copy

A Network one of whose timetables can't be downloaded or read, or gives it no Lines, is built from the copy of them that last built it, which the build keeps in `.cache` (#286). Its `copy <network>` spot gives the day the copy was kept and why, and stays until a new timetable gives the Network Lines again, when it shows as gone. A server that's down for a morning needs nothing. If it lasts, open the timetable's URL: a Network with no Lines, as Rodalies in Renfe's file of 5 Oct 2026, needs a new source; a moved file, a new URL in `src/networks.ts`.

## A region whose build failed

The bundle is built by region (ADR-0014), and a region whose build throws goes without new files: the manifest names those of its last build, from the day before today on, and its `region <id>` spot gives why, in one line, with the whole error in the run's log. Its Networks' other spots are carried over from the last report, so they don't show as gone. The other regions are built and published as ever, so the map is whole, but for the failed region's Trains and Lines running out of days: it names at most three, so a failure that lasts takes the region off the map. A region with no copy of a timetable, as once the Actions cache is lost, fails so; so does a trace that strays more than 5% from its feed's shape, or a solver that finds no order (`src/build/order.ts`). Read the run's log for the stack, fix what it names, and run the build again: the spot shows as gone once the region builds. The one build that first publishes a manifest by region, and a build that couldn't read the last manifest, have no files of a last build to keep for a region that fails: the build fails as a whole instead, with the region's name in the error, and nothing publishes or deploys.

## A spot as a test

`track.test.ts` draws its rails by hand, which suits a rule. A real trap is better kept as it was: OpenStreetMap's rails, the feed's shapes and the Stations around the spot. Cut one only for a spot that shows a new kind of trap, not for every spot, and before fixing OpenStreetMap, so that the test keeps the broken data.

1. `npm run daily -- --dry-run`, for the rails, timetables and `out/report.json` the snippet is cut from.
2. `npm run snippet -- "<spot key>" <name> [km]`. It writes `src/build/fixtures/osm/<name>.json`, with the day OpenStreetMap's data was downloaded and the credits. It holds every way that comes within that many km of the spot (2 unless given), whole, and the spot's Line's shapes there, with the Stations there that their Trips serve. Give a `<lat,lon>` in place of the key to cut round another point, with every Line's shapes there.
3. In `track.test.ts`, trace it along `ownRails()`, as the build does, and check the lines the spot logged, or, after a fix in our code, that it no longer logs them.

A trace needs the Stations either side of the spot: R16 turns back at L'Aldea on its way from Camp-redó, 5 km off, to Ulldecona, 22 km off. A cut too small to hold them keeps the feed's shape instead, or fails on a shape's length. So cut as little as still traces the spot as the build did, round a point between those Stations if that needs less than round the spot, and aim for a few tens of KB. L'Aldea's, 14 km round a point between Tortosa and Ulldecona, is 72 KB.
