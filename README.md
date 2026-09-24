# Via Península

A live map of passenger trains moving on real track across Spain, starting with Catalonia: [viapeninsula.gariasf.com](https://viapeninsula.gariasf.com).

The domain language is in [CONTEXT.md](CONTEXT.md), the decisions in [docs/adr](docs/adr), and the v1 spec in [issue #1](https://github.com/gariasf/viapeninsula/issues/1).

## Working on it

You need Node 24 or later and the `unzip` command.

```sh
npm install
npm run dev                  # the site at http://localhost:5173, reading data from viapeninsula-live.gariasf.com
npm test
npm run check                # typecheck
npm run daily -- --dry-run   # build today's bundle into out/ without publishing it
npm run daily                # build it and publish it to R2
npm run deploy               # build the site and deploy it
```

## Cloudflare setup

Done once. The R2 bucket that serves the data, its custom domain and its CORS policy:

```sh
npx wrangler r2 bucket create viapeninsula-live
npx wrangler r2 bucket domain add viapeninsula-live --domain viapeninsula-live.gariasf.com --zone-id f6becb73149a3725d72afa19c9478eb5
npm run cors
```

A Cache Rule in the dashboard caches viapeninsula-live.gariasf.com at the edge for as long as each file's `Cache-Control` says, ignoring query strings.

## Licence

The code is AGPL-3.0. Timetables come from Renfe under CC BY 4.0, and the basemap from OpenFreeMap, © OpenStreetMap contributors.
