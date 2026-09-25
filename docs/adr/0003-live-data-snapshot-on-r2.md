# Live data is a snapshot file on R2, not an API

One Cloudflare Durable Object wakes about every 20 seconds, fetches each live feed as often as its source allows (Renfe and TRAM every time, the Metro every other time, FGC every 2 minutes), and writes one compact JSON snapshot to R2; viewers fetch that file through Cloudflare's CDN on a custom domain. Viewer traffic never runs our code, so cost doesn't grow with viewers and abuse can't raise the bill (the snapshot's cache key ignores query strings).

## Considered Options

- **A Worker that runs on every viewer request, with an edge cache.** Rejected: every poll is billed, cache hits included, the free plan covers only about 23 viewers polling all day, and it would need rate limiting.
- **A fetcher on a home server (Umbrel) or a Hetzner machine.** Kept only as the fallback for any feed that can't be fetched within Cloudflare's limits, for example if Cloudflare's shared outgoing IPs trip FGC's quota of 5,000 requests a day per IP.

## Consequences

- The snapshot records each feed's freshness; that is what turns Trains Scheduled and raises the "live data unavailable" banner.
- It needs a domain on Cloudflare: R2's `r2.dev` URLs aren't cached and are rate-limited.
- It runs on Workers Paid ($5/month): a fetcher run measured about 12 ms of CPU, over the free plan's 10 ms. Viewer traffic never reaches a Worker, so usage stays inside the plan's included amounts.
- The Durable Object is evicted between alarms, so its throttles, tokens and each feed's last good reports live in its storage, not in memory (measured in the Cloudflare spike, see `docs/research/live-data-sources.md`).
- The fetcher runs in a Worker of its own, with no routes, rather than in the site's. A script in the site's Worker would run for every request that matches none of the site's files, and anyone can send those.
