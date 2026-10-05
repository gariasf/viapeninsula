# Via Península

A live map of passenger trains moving on real track across Spain, starting with Catalonia: [viapeninsula.gariasf.com](https://viapeninsula.gariasf.com).

The domain language is in [CONTEXT.md](CONTEXT.md), the decisions in [docs/adr](docs/adr), and the v1 spec in [issue #1](https://github.com/gariasf/viapeninsula/issues/1).

## Working on it

You need Node 24 or later, the `unzip` command and osmium-tool (`brew install osmium-tool`). The daily build reads TMB's timetable with TMB's key: copy `.env.example` to `.env.local` and fill in `TMB_APP_ID` and `TMB_APP_KEY`, which `npm run daily` loads from there.

```sh
npm install
npm run dev                  # the site at http://localhost:5173, reading data from viapeninsula-live.gariasf.com
npm test
npm run check                # typecheck
npm run daily -- --dry-run   # build today's bundle into out/ without publishing it
npm run daily                # build it and publish it to R2
npm run deploy               # typecheck, build the site, and deploy it and the fetcher
```

The daily build reads the timetables of the Networks in `src/networks.ts`, Rodalies and Cercanías Madrid (both from Renfe's Cercanías feed), FGC, TRAM and the Metro (TMB's), and keeps their Trains: trams, metros, trains and funiculars, and no buses. It traces each Line along OpenStreetMap's rails of its Network's own kind (ADR-0004), and reports any stretch it can't trace. It filters the rails, and Spain's border, where it cuts the Lines (ADR-0010), out of Geofabrik's extracts of Spain and of the French regions along Catalonia's border with osmium (ADR-0009), keeps them in `.cache/` for a week, and fails if a traced shape's length strays more than 5% from the feed's (100 m on shapes under 2 km, such as funiculars). It then places each of the day's Trips on its track, and reports and leaves out any it can't: one calling at a Station off its track, or one that would have to run faster than its Network's top speed. What it reports, and the line measures (#160), it also writes to `out/report.json`: each spot once however many of a Line's shapes or days name it, keyed as `docs/research/build-report.md` sets out, so that the next build names it the same, and never by a Trip's ID or a date. It publishes `report.json` after the manifest, and the next build diffs its own against it: the spots new since, then those gone, then those whose numbers moved (a length by more than a point, a Trip count or a measure by any), each with links to the map at the spot and to OpenStreetMap, to see it, edit it and open the ways its Stations are on. It prints the diff, or one line where nothing changed, and in Actions writes it to the run's job summary. Where a problem spot is new (a run of legs that keeps the feed's shape, a turn-back, a branch, Trips left out, or a Network with no Trips on a day, but never a length, a node or the measures), it also comments on the standing [Build report](https://github.com/gariasf/viapeninsula/issues/290) issue once it has published, with the new spots, their links and the run's link. [docs/review-a-build-report.md](docs/review-a-build-report.md) says what to do with a new spot, and how `npm run snippet` cuts one into a test's fixture.

The fetcher is a Durable Object in a Worker of its own, with no routes (ADR-0003). It reads its live feeds from `LIVE_SOURCES` in `src/networks.ts`, each with the adapter for its format in `src/fetcher/step.ts`. A feed can serve several Networks, as Renfe's Cercanías files have every núcleo's Trains: each Train goes to the Network its feed's config names for how its ID starts, and the feed's freshness is each of those Networks'. About every 20 s it fetches Renfe's and TRAM's live data, every other time the Metro's, which TMB asks for no more than every 30 s, and every 2 minutes FGC's, and writes `snapshot.json` to R2 with a 15 s cache lifetime. FGC's API allows 5,000 requests a day to each IP, and a refresh takes 2: while fewer than 1,000 are left the fetcher slows FGC to every 5 minutes, and once none are, it waits for 00:00 UTC. TRAM's API wants an access token, which the fetcher asks for with TRAM's credentials and keeps for the hour it lasts. TMB's predictions name each metro train by its Block rather than its Trip and say only when it's expected at its next Stations, so the map runs each as the Trip on its Line headed its way whose timetable has it at its next Station closest to then, and keeps it on that Trip while the Trip still calls at the Station it comes to next. The site fetches the snapshot about every 20 s while its tab is visible. A fetch that fails, comes back empty, or finds data that says it hasn't been updated since the last try leaves that feed's last good reports in the snapshot, and the feed's freshness there says what went wrong. Where a feed that covers several Networks works but has none of one Network's Trains, as Renfe's Cercanías files drop Madrid's now and then, that Network's last reports stay for two tries more, and each try that finds it missing, up to the one that drops them, goes in the fetcher's logs, which Workers Logs keeps for 7 days. On the map, a Train that live data stops reporting stays Live through two of its feed's updates and turns Scheduled at the third, keeping its last Delay for 30 minutes, as a metro Train does at once when its Block goes on to run another Trip. A banner names each Network whose feed has missed three, or works but has had none of its Trains in it for three (five, where its feed covers other Networks too) while its timetable has at least 5 of them on the map. Its Worker's cron trigger starts it every minute, unless it's running already. To run it locally, writing to a local copy of the bucket, with TRAM's credentials and TMB's key in `src/fetcher/.dev.vars`, which git ignores:

```sh
npx wrangler dev -c src/fetcher/wrangler.jsonc --test-scheduled
curl 'http://localhost:8787/__scheduled'   # start it
npx wrangler r2 object get viapeninsula-live/snapshot.json --local -c src/fetcher/wrangler.jsonc --pipe
```

The site speaks Catalan, Spanish and English. Every string it shows is in `src/web/i18n.ts`, in all three, except names: Stations and Lines are shown as the operators publish them, and the credits name their sources as those sources do. The basemap names countries, regions, seas, rivers and airports in the viewer's language, and everything else, from towns to streets, as its signs do.

## Cloudflare setup

Done once. The R2 bucket that serves the data, its custom domain and its CORS policy:

```sh
npx wrangler r2 bucket create viapeninsula-live
npx wrangler r2 bucket domain add viapeninsula-live --domain viapeninsula-live.gariasf.com --zone-id f6becb73149a3725d72afa19c9478eb5
npm run cors
```

A Cache Rule in the dashboard caches viapeninsula-live.gariasf.com at the edge for as long as each file's `Cache-Control` says, ignoring query strings.

TRAM's credentials and TMB's key, as the fetcher's secrets, fed from `.env.local` without being printed:

```sh
for name in TRAM_CLIENT_ID TRAM_CLIENT_SECRET TMB_APP_ID TMB_APP_KEY; do
  node --env-file=.env.local -e "process.stdout.write(process.env.$name)" | npx wrangler secret put $name -c src/fetcher/wrangler.jsonc
done
```

## The daily build in Actions

`.github/workflows/daily.yml` runs `npm run daily` in GitHub Actions and publishes to R2. The fetcher's Worker starts it at 00:30 UTC through GitHub's workflow dispatch, GitHub's own schedule starts it at 03:30 UTC in case that one doesn't come, and the Run workflow button in the Actions tab starts it whenever it's wanted. Running it again for the same days publishes the same files, so the second run each day is harmless. Its secrets, fed from `.env.local` without being printed: TMB's key and the R2 token as Actions secrets, the R2 token under the name Wrangler reads there, and the dispatch token as the fetcher's secret:

```sh
for name in TMB_APP_ID TMB_APP_KEY; do
  node --env-file=.env.local -e "process.stdout.write(process.env.$name)" | gh secret set $name
done
node --env-file=.env.local -e "process.stdout.write(process.env.R2_API_TOKEN)" | gh secret set CLOUDFLARE_API_TOKEN
node --env-file=.env.local -e "process.stdout.write(process.env.GITHUB_DISPATCH_TOKEN)" | npx wrangler secret put GITHUB_DISPATCH_TOKEN -c src/fetcher/wrangler.jsonc
```

## Licence

The code is AGPL-3.0. Timetables come from Renfe and FGC under CC BY 4.0, as does their live data, from TRAM (Powered by TRAM Barcelona) and from TMB, whose terms ask for the day its data was last updated to be shown with it. The track follows OpenStreetMap's rails and the basemap comes from OpenFreeMap, both © OpenStreetMap contributors under the ODbL.
