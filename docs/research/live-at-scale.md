# Live data at the scale of Spain

Research for #221, part of #214 (beyond Catalonia). It feeds the grill in #222. It builds on #215's list of feeds ([spain-feeds.md](spain-feeds.md)) and on ADR-0003.

- **Date:** Sunday 4 October 2026, 10:45–10:55 CEST.
- **Weekend caveat:** every live count below was taken on a Sunday morning. Weekday counts are Sunday's scaled by #215's ratios of Trips per day (Monday 5 Oct over Sunday 4 Oct). They are estimates, and a weekday peak will be higher still.
- **Method:** the public snapshot the page polls (`viapeninsula-live.gariasf.com/snapshot.json`) and Renfe's five live feeds were fetched read-only, Renfe's Cercanías feeds 26 times in all, mostly 20 s apart, from 10:49 to 10:58. The fetcher's own step (`src/fetcher/step.ts`) was timed in Node on those files, unchanged, once as it is and once with every Trip kept. Euskotren's trip updates were decoded with `pbf`, as the step decodes FGC's and TRAM's. Cloudflare's limits are from its docs, read the same morning. Nothing was deployed. Scripts are in a scratch dir, not in the repo.
- **Not run:** the Worker under `wrangler dev`. Local workerd doesn't meter CPU as Cloudflare bills it, so ADR-0003's 12 ms per run stays the production figure, and Node's timings say only how much Spain adds to it.

## TL;DR

- **Spain adds three requests a run.** Renfe's two long-distance feeds, and Euskotren's trip updates once a minute. Renfe's Cercanías feeds, fetched today for Rodalies, already hold every núcleo: the step throws the rest away.
- **Cloudflare's limits are far off.** About 15 subrequests a run against 10,000; well under a second of wall time against 15 minutes; CPU, Durable Object time and R2 writes all inside the $5 plan's included amounts. One fetcher Durable Object still does it.
- **The snapshot grows about seven times.** From 12.5 KB (101 Trains, Sunday) to an estimated 65 KB of JSON for about 700 Trains on a weekday morning, about 8 KB compressed on the wire.
- **Keep one snapshot for now.** Split it by region when the page loads its bundles by region (#220), and not before.
- **Renfe's Cercanías files drop Madrid whole** in about one fetch in five, once twice in a row. Madrid's Trains are 40% of the file. The page's three-misses rule absorbs that today, but only just: the step should hold a Network's last reports for a run or two where it vanishes from a feed that still answers, in the ticket that adds Madrid.
- **ADR-0003 needs an amendment, not a new decision:** its list of feeds and rates, Freshness for many Networks from one feed, and the one-file snapshot.

## 1. Feeds, rates, keys and quotas

Today's feeds, and what #215 adds. "Requests a day" is at the fetcher's rate, in a full day of 20 s runs.

| Feed | Networks | Requests a run | Rate | Requests a day | Key | Quota | Size (JSON unless said) |
|---|---|---|---|---|---|---|---|
| Renfe Cercanías positions + trip updates | Rodalies today; every núcleo | 2 | every run (20 s); header advances every 17–23 s | 8,640 | none | none stated; `Cache-Control: max-age=30` | 74 KB + 79 KB (192 Trains); 9.5 KB + 7.9 KB as `.pb` |
| Renfe LD positions + trip updates (**new**) | AVE, Avlo, Alvia, Avant, Intercity, Euromed, MD, Regional, ex-FEVE regionals | 2 | every other run (40 s): header advances every 14–30 s (#215) | 4,320 | none | none stated | 44 KB + 59 KB (127 positions, 205 trip updates) |
| Renfe alerts | – | 0 | not fetched | – | none | – | 90 KB |
| Euskotren trip updates via Moveuskadi (**new**) | Euskotren trains, Bilbao and Vitoria trams, funicular | 1 | every third run (60 s): Moveuskadi's index updates each minute, header 81–121 s old when fetched | 1,440 | none | not checked | 220 KB `.pb`, 242 Trips, 28 of them running |
| FGC Geotren + trip updates (+ lookup) | FGC | 2–3 | every 2 min, 5 min under 1,000 left | about 1,440 | none (anonymous) | 5,000 a day per IP, shared with Cloudflare's other users | as today |
| TRAM activevehicles + gtfsrealtime, ×2 halves (+ token) | TRAM | 4–5 | every run, backoff to 30 min on a refusal (#43, #51, #128) | about 17,300 | OAuth client | not stated | as today |
| TMB iTransit | Metro | 1 | every other run (one per 30 s, as declared to TMB) | 2,160 | app ID + key | as declared | as today |

- **No other source in #215 has live data** for the map: Ouigo and FGV and SFM have timetables only, and Iryo has nothing. Metro Bilbao's GTFS-RT positions (keyless, ~60 s) would be one more request when metros come (#222).
- **Euskotren's file is mostly the future.** Of 242 trip updates at 10:5x, 209 were for Trips not yet started and 5 for ones finished. The step should keep only the running ones, as it keeps only Rodalies' today.
- **Renfe LD and Cercanías overlap** on Regionals a núcleo also runs (#215). Both feeds may report the same Train under two Trips; the bundle's dedupe by Train number (#216) decides which one the map draws.
- **JSON or protobuf:** Renfe's JSON is about 8 times its `.pb`. Download size costs the Worker nothing, and parsing both is well under a millisecond, so it stays JSON.

## 2. The Worker's limits against the load

From Cloudflare's docs, Workers Paid, which the fetcher is on (ADR-0003).

| Limit | Cloudflare (Paid) | Today | Spain |
|---|---|---|---|
| Subrequests per invocation ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) | 10,000 (Free: 50) | 11 at most, + the R2 write | about 15 |
| Connections waiting for headers at once ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) | 6 | 11 requests queue through 6 | 15 queue through 6; each answers in 0.1–0.3 s |
| CPU per alarm ([Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)) | 30 s default, up to 5 min; the fetcher caps itself at 1 s (`cpu_ms`) | about 12 ms (ADR-0003) | about 13 ms (below) |
| Alarm wall time ([Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)) | 15 min | 1.0–2.2 s (spike); 20 s at worst, a lookup and a fetch that both time out at 10 s | same: no feed of Spain's needs two steps |
| Memory ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) | 128 MB | small | Euskotren's 220 KB is the largest file |
| Stored value ([Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)) | 2 MB, key and value (SQLite) | the state, with every feed's last good reports, about 12 KB | about 65–100 KB |
| R2 writes to one key ([R2 limits](https://developers.cloudflare.com/r2/platform/limits/)) | 1 a second | 1 every 20 s | same |

**CPU.** In Node, the step takes 0.28 ms on today's Renfe files (12 Rodalies Trains kept), 0.34 ms with every núcleo kept (192 Trains), and 0.25 ms on the LD files (198 Trains). Euskotren's 220 KB decodes in 0.19 ms. So Spain adds about 0.5 ms in Node to a run that measured 12 ms on Cloudflare, most of it the requests and the R2 write. Even five times that on Cloudflare stays far under the 1 s cap.

**A month,** at 129,600 runs (one every 20 s), against Workers Paid's included amounts ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/)):

| Item | Included | Today | Spain, one snapshot | Spain, split in 8 files |
|---|---|---|---|---|
| Worker CPU | 30 M ms | 1.6 M ms | about 1.7 M ms | about 1.7 M ms |
| Durable Object requests (alarms + the minute cron's `start()`) | 1 M | about 175 k | same | same |
| Durable Object duration | 400 k GB-s | about 35 k GB-s (2.2 s × 128 MB) | same | same |
| SQLite rows written | 50 M | about 260 k | same | same |
| R2 Class A (writes) | 1 M (free tier) | 130 k | 130 k | 1.04 M: about $0.20 over |
| R2 Class B (CDN misses) | 10 M (free tier) | one per PoP with viewers per 15 s | same | 8 times that |

Nothing here needs a second Worker. A second Durable Object, writing a file of its own, makes sense only for a feed that has to run somewhere else (the home-server fallback in ADR-0003) or one slow enough to hold up the others: today a run waits for its slowest answer, up to 10 s, and the next is set 20 s after it starts, so it never slips.

## 3. The snapshot

**Today, measured:** 12,512 bytes of JSON for 101 Trains at 10:49 Sunday (Rodalies 14, FGC 48, TRAM 1, Metro 38), 1,475 bytes as served brotli'd by the CDN (`cf-cache-status: HIT`, `age` up to 14 s). The spike on a Thursday at 09:18 had about 190 Trains in 15 KB. A Renfe report is about 95–100 bytes; a Metro one about 155.

**Spain, estimated for a weekday morning:**

| Part | Sunday 10:5x | Weekday ratio (#215) | Weekday | Bytes |
|---|---|---|---|---|
| Catalonia, as today | 101 | measured in the spike | 190 | 15 KB |
| Other Cercanías núcleos | 179 | 3,599 / 2,650 = 1.36 | 245 | 24 KB |
| Renfe LD, positions and trip updates merged | 198 | 1,588 / 1,341 = 1.18 | 235 | 22 KB |
| Euskotren, running Trips only | 28 | 1,203 / 936 = 1.29 | 36 | 4 KB |
| **Total** | 506 | | **about 700** | **about 65 KB** |

At today's compression (8.5 to 1), that's about 8 KB a poll on the wire, or 1.4 MB an hour for a viewer with the tab open. A weekday peak may be half as much again ([live-data-sources.md](live-data-sources.md) counted 339 Cercanías Trains nationwide at 06:55 on Thursday 24 September, against 179 + 14 this Sunday): about 1,000 Trains, 100 KB, 12 KB on the wire. Both fit one file.

**Split it?** Three options:

| Option | Page polls | Cost | Gain |
|---|---|---|---|
| **A. One file, as today** | `snapshot.json` | none | nothing to build |
| B. One file per region, in the same run | the files of the regions in view, or all of them zoomed out | R2 writes × regions; the page merges `feeds` and `reports` from several files, and a region whose file fails turns only its own Trains Scheduled | the page downloads and replays only what it shows |
| C. One file per feed, from its own Durable Object | every file, always | as B, plus a Durable Object each | a slow feed can't hold the others up |

The cost that grows is on the page, not the wire. The map keeps every snapshot for 35 minutes (`KEEP`, about 105 of them) and replays them each time it places Trains, so seven times the reports is about seven times that work. That's the place to watch once Spain's Trains are in, and it can be cut on the page (replay only the Networks the bundle has, or keep the replay between snapshots) without touching the fetcher.

**Pick A.** Split along B's lines when the page loads its bundles by region (#220), so the page fetches live data for what it loads. C solves a problem we don't have.

## 4. Backoff and "degrade honestly" across many feeds

What holds already:

- **Each feed fails on its own.** Every request catches its own error, a failed feed keeps its last good reports, and its Freshness says why (#9). One feed down never blanks another.
- **Each feed backs off on its own terms.** FGC by its quota counter, TRAM after a refusal (#43, #51, #128). Renfe and Euskotren have no key and no stated quota, so they need none: a failed try is just tried again on the next run.
- **One bad fetch is absorbed.** A Live Train turns Scheduled only after three missed updates (`MISSES`), and a Network's banner only after three updates empty with at least 5 of its Trains due (#124).

What changes:

- **Freshness is keyed by Network,** and the page reads `feeds[network.id]`. One Renfe fetch now feeds 15 or more Networks (each núcleo, and the long-distance ones #216 settles on). The step should write the same Freshness under each Network that feed covers, so the page and the engine don't change. When Renfe fails, every Renfe Network's banner shows, which is honest: they share the outage.
- **Madrid vanishes from whole fetches.** In 5 of 26 fetches this morning (10:49, 10:51:44, 10:53:46, 10:54:06, 10:57:41), both Cercanías files came back with a fresh header and every núcleo but Madrid: 103–113 Trains against 183–196. Two of them came in a row. #215 saw the same once in four. The "not updated since" rule (#35) can't catch it, as the header advances. Each costs Madrid's 80 Trains an update; three in a row would turn them all Scheduled for a moment. So where a Network vanishes from a feed that still answers, the step should keep its last reports for up to two runs. A few lines in `refresh()`, in the ticket that adds Madrid.
- **Mind the "stuck" rule with slower feeds.** The step fails a try whose file has the same header time as the last try. Renfe LD's header advanced only every 14–30 s and Euskotren's is 1–2 minutes old, so fetching them every 20 s would fail tries that are fine. Fetch each no faster than it updates: LD every other run, Euskotren every third, as in section 1, and check after a day.
- **Shared IPs, shared quotas.** FGC's 5,000 a day per IP is the only per-IP quota we know of. Nothing in #215's list adds one.

## 5. Recommendation

1. **One fetcher, one Durable Object, one run every 20 s,** as today. Keep every Renfe núcleo from the files it already fetches, add Renfe's two LD feeds every other run and Euskotren's trip updates every third run, keeping only its running Trips. About 15 requests a run, all inside Workers Paid.
2. **One snapshot.** About 65 KB for a weekday morning, 8 KB on the wire. Split by region with #220, not before.
3. **Freshness per Network, filled per feed.** A feed that covers many Networks writes the same Freshness under each.
4. **Hold a vanished Network for two runs.** Renfe drops Madrid from one Cercanías fetch in five. Put the hold in the ticket that adds Madrid, and count the drops for a week after.
5. **Watch the page, not the Worker.** The replay over 35 minutes of snapshots is what grows with Spain. Measure it with the perf harness when the first new núcleo goes in.

## 6. ADR-0003

It needs an amendment, not a new ADR. The decision holds: one fetcher, a snapshot on R2, viewers through the CDN, no Worker on their path. What's out of date or missing:

- Its list of feeds and rates (Renfe "every time", nothing on LD or Euskotren).
- That the snapshot is one file for all of Spain until the bundles split by region, and then splits the same way.
- That Freshness is per Network, and one feed can fill many.

To write after the maintainer's pick in #222.

## Re-verify quickly

```sh
# The snapshot: bytes, Trains per Network
curl -s https://viapeninsula-live.gariasf.com/snapshot.json | tee /tmp/s.json | wc -c
jq '[.reports[] | (.trip // .block.line) | split(":")[0]] | group_by(.) | map({(.[0]): length}) | add' /tmp/s.json
# Renfe Cercanías: Trains per núcleo (a missing "10" is a partial file)
curl -s https://gtfsrt.renfe.com/vehicle_positions.json | jq '[.entity[].vehicle.trip.tripId[:2]] | group_by(.) | map({(.[0]): length}) | add'
# Euskotren's trip updates: size
curl -sL -o /dev/null -w '%{size_download}\n' https://opendata.euskadi.eus/transport/moveuskadi/euskotren/gtfsrt_euskotren_trip_updates.pb
```
