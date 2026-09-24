# Via Península

A live map of passenger trains moving on real track across Spain, starting with Catalonia: [viapeninsula.gariasf.com](https://viapeninsula.gariasf.com).

The domain language is in [CONTEXT.md](CONTEXT.md), the decisions in [docs/adr](docs/adr), and the v1 spec in [issue #1](https://github.com/gariasf/viapeninsula/issues/1).

## Working on it

You need Node 24 or later and the `unzip` command. The daily build reads TMB's timetable with TMB's key, from `TMB_APP_ID` and `TMB_APP_KEY` in its environment.

```sh
npm install
npm run dev                  # the site at http://localhost:5173, reading data from viapeninsula-live.gariasf.com
npm test
npm run check                # typecheck
npm run daily -- --dry-run   # build today's bundle into out/ without publishing it
npm run daily                # build it and publish it to R2
npm run deploy               # typecheck, build the site and deploy it
```

The daily build reads the timetables of Rodalies (Renfe's Cercanías feed), FGC, TRAM and TMB, and keeps their Trains: trams, metros, trains and funiculars, and no buses. It traces each Line along OpenStreetMap's rails of its Network's own kind (ADR-0004), and reports any stretch it can't trace. It keeps the rails it downloads from Overpass in `.cache/` for a week, and fails if a traced shape's length strays more than 5% from the feed's (100 m on shapes under 2 km, such as funiculars). It then places each of the day's Trips on its track, and reports and leaves out any it can't: one calling at a Station off its track, or one that would have to run faster than its Network's top speed.

The site speaks Catalan, Spanish and English. Every string it shows is in `src/web/i18n.ts`, in all three, except names: Stations and Lines are shown as the operators publish them, and the credits name their sources as those sources do. The basemap names countries, regions, seas, rivers and airports in the viewer's language, and everything else, from towns to streets, as its signs do.

## Cloudflare setup

Done once. The R2 bucket that serves the data, its custom domain and its CORS policy:

```sh
npx wrangler r2 bucket create viapeninsula-live
npx wrangler r2 bucket domain add viapeninsula-live --domain viapeninsula-live.gariasf.com --zone-id f6becb73149a3725d72afa19c9478eb5
npm run cors
```

A Cache Rule in the dashboard caches viapeninsula-live.gariasf.com at the edge for as long as each file's `Cache-Control` says, ignoring query strings.

## Licence

The code is AGPL-3.0. Timetables come from Renfe and FGC under CC BY 4.0, from TRAM (Powered by TRAM Barcelona) and from TMB, whose terms ask for the day its data was last updated to be shown with it. The track follows OpenStreetMap's rails and the basemap comes from OpenFreeMap, both © OpenStreetMap contributors under the ODbL.
