# Via Península

A live map of passenger trains moving on real track across Spain, starting with Catalonia: [viapeninsula.gariasf.com](https://viapeninsula.gariasf.com).

The domain language is in [CONTEXT.md](CONTEXT.md), the decisions in [docs/adr](docs/adr), and the v1 spec in [issue #1](https://github.com/gariasf/viapeninsula/issues/1).

## Working on it

You need Node 24 or later and the `unzip` command. The daily build reads TMB's timetable with TMB's key: copy `.env.example` to `.env.local` and fill in `TMB_APP_ID` and `TMB_APP_KEY`, which `npm run daily` loads from there.

```sh
npm install
npm run dev                  # the site at http://localhost:5173, reading data from viapeninsula-live.gariasf.com
npm test
npm run check                # typecheck
npm run daily -- --dry-run   # build today's bundle into out/ without publishing it
npm run daily                # build it and publish it to R2
npm run deploy               # typecheck, build the site, and deploy it and the fetcher
```

The daily build reads the timetables of Rodalies (Renfe's Cercanías feed), FGC, TRAM and TMB, and keeps their Trains: trams, metros, trains and funiculars, and no buses. It traces each Line along OpenStreetMap's rails of its Network's own kind (ADR-0004), and reports any stretch it can't trace. It keeps the rails it downloads from Overpass in `.cache/` for a week, and fails if a traced shape's length strays more than 5% from the feed's (100 m on shapes under 2 km, such as funiculars). It then places each of the day's Trips on its track, and reports and leaves out any it can't: one calling at a Station off its track, or one that would have to run faster than its Network's top speed.

The fetcher is a Durable Object in a Worker of its own, with no routes (ADR-0003). About every 20 s it fetches Renfe's and TRAM's live data, every other time the Metro's, which TMB asks for no more than every 30 s, and every 2 minutes FGC's, and writes `snapshot.json` to R2 with a 15 s cache lifetime. FGC's API allows 5,000 requests a day to each IP, and a refresh takes 2: while fewer than 1,000 are left the fetcher slows FGC to every 5 minutes, and once none are, it waits for 00:00 UTC. TRAM's API wants an access token, which the fetcher asks for with TRAM's credentials and keeps for the hour it lasts. TMB's predictions name each metro train by its Block rather than its Trip and say only when it's expected at its next Stations, so the map runs each as the Trip on its Line headed its way whose timetable has it at its next Station closest to then. The site fetches the snapshot about every 20 s while its tab is visible. A fetch that fails, comes back empty, or finds data that says it hasn't been updated since the last try leaves that feed's last good reports in the snapshot, and the feed's freshness there says what went wrong. On the map, a Train that live data stops reporting stays Live through two of its feed's updates and turns Scheduled at the third, keeping its last Delay for 30 minutes, and a banner names each Network whose feed has missed three. Its Worker's cron trigger starts it every minute, unless it's running already. To run it locally, writing to a local copy of the bucket, with TRAM's credentials and TMB's key in `src/fetcher/.dev.vars`, which git ignores:

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
