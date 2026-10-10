# Punctuality statistics and Delay history, from daily files

Research for #329, under #318 (more than a map). It builds on [ADR-0003](../adr/0003-live-data-snapshot-on-r2.md) (live data is a snapshot file on R2), [ADR-0011](../adr/0011-more-than-a-map-the-map-first-and-viewer-data-in-the-browser.md) (history reaches viewers only as static files), [live-at-scale.md](live-at-scale.md), [live-data-sources.md](live-data-sources.md) and [bundle-at-scale.md](bundle-at-scale.md). It answers the ticket's six boxes in order. Nothing in `src/` changed; the throwaway scripts are in a scratch directory, not in the repo.

- **Date:** Saturday 10 October 2026, 10:15 to 12:10 CEST.
- **Recordings:** the Record workflow's three of 45 minutes, each the production snapshots as the map received them, with that day's whole `bundle.json`: run 37533038357 (Tuesday 6 Oct 23:19–00:04, late evening), 37618244697 (Wednesday 7 Oct 14:03–14:48, midday) and 37646767458 (Wednesday 7 Oct 17:47–18:32, the weekday peak). A fourth and a fifth, by hand, on Saturday 10 Oct, 10:38–10:52 and 11:04–11:49, with today's bundle, which has every núcleo, and FGC's own on-time flag polled once a minute beside the second. And the fixtures of 25 and 28 Sep in `src/fixtures/`, for ordinary weekdays.
- **Days' Trips:** the live manifest's bundles for Friday 9 to Monday 12 Oct, and the Wednesday 7 and Tuesday 6 bundles of the recordings. Renfe's long-distance and Euskotren's timetables, downloaded on 10 Oct, for their Calls.
- **Method:** a copy of `src/engine.ts` outside the repo, with a few internals exported, run in Node 24 on the maintainer's Mac (M4 Pro). Each recording's snapshots go in in order, with the last 35 minutes of them (`KEEP`) as the browser keeps them. For each Trip live data has named, the Calls its drawn time crosses between two snapshots take the Train's Delay then, as `onMap()` has it, with where it came from. A Call is a Trip's call at a Station, as the bundle has it; a Trip is **named** while some snapshot's report is about it, and **unreported** if none is. Timings are Node's, not Cloudflare's.
- **A caveat on the days.** 7 October was a day of rain and disruption in Catalonia: Renfe flagged 56% (midday) and 31% (peak) of the Rodalies Trips its timetable had running in the two windows of that day as cancelled, and 13% on the Tuesday evening. Rodalies' figures below are a bad day's. A normal weekday of Rodalies hasn't been recorded; the Saturday morning's 59 minutes are the only ordinary Rodalies sample.

## TL;DR

- **A day's record is small however it's cut.** A Delay for each Call is 60 KB brotli'd for Catalonia on a weekday as JSON in seconds, 109 KB for every Cercanías núcleo, about 134 KB with long distance and Euskotren's trains, on a synthetic day. The values real Trains give compress worse (60–85 KB, 109–158 KB), and the byte for where each Delay came from adds 0.5–0.7 B a Delay (Catalonia's weekday: 80–110 KB). A byte of minutes is about a third of the seconds. A year of the seconds alone is 18–43 MB, up to twice that with real values and where each came from; 5–14 MB as bytes of minutes. The three aggregates for 30 days are tens of KB each, Spain's Stations file the largest at about 150 KB.
- **Work it out in a daily job, from snapshots the fetcher keeps.** The fetcher keeps each run's snapshot and writes each 5 minutes' to a bucket of its own; a GitHub Actions job replays a day of them through `src/engine.ts` with that day's bundle. On this Mac a day takes 25–30 seconds of CPU for the Trips live data names, and one to two minutes if every Trip is asked about. The Worker's bill is 8,640 more R2 writes a month, under 1% of the free million. Loading the day's Trips in the fetcher would fit the plan's CPU too, on Node's numbers and if the engine's state is kept between runs (replayed cold, the last 35 minutes took 0.5 s a run), but puts the engine in the live path and keeps nothing to work out again. A 128 MB isolate holds Catalonia's and the núcleos' Trips and shapes parsed whole (25–53 MB); long distance's 115 MB of track it would have to read as rows.
- **Only the capture can't wait.** Every day the fetcher doesn't keep its snapshots is a day of history that never exists. It's a few lines in `worker.ts` and one lifecycle rule, and it can ship before any pick on screens.
- **The Delay at a Call is seldom measured at the Call.** Of the Calls Trains live data names cross, 42% are measured from the Train's own position, 22% carried on from its last GPS Delay, 31% the operator's figure and 5% a Scheduled Train's last known. Renfe pins a Train coming into a Station, so its Calls are carried on: 58–65% of Madrid's and 44–47% of Rodalies' in the weekday windows, 51–58% and 56–60% on the Saturday (all Calls to mid-route ones).
- **Trust differs by Network.** TRAM's own figure agrees with its own distance in 97–100% of reports. FGC's data is a median 83–153 s old at write and up to 6 minutes at p90. Renfe's figure and its GPS part by more than 5 minutes in 3–24% of reports, for a whole Trip at a time. In a 10-minute stretch live data names 97–100% of FGC's, TRAM's and Madrid's running Trips, and 75% of Rodalies' (85% on the Saturday). The Metro, FGC's funicular and Asturias' and León's Trains have none, and FGC's own on-time flag agrees with the record's Delay on all 1,236 readings compared, of which 14 were late, all one Train.
- **Identity is a key, not an id.** Renfe's Train number holds for a timetable edition: Madrid's held 99.6–100% weekday to weekday over the file's 30 days. FGC's and TRAM's trip_ids changed between 7 and 9 Oct (3% and 0% kept) while their slot, Line + headsign + first departure, held 98% and 81%. Madrid's weekend Trains are other numbers, Rodalies' partly. History is worked out again, as far as snapshots are kept, when a Delay rule changes.
- **A Train's on-time share is a coarse number.** At 30 days seen it is still ±14 points. Show nothing under 5 days, as railisland does, counts of days up to about 20 (railisland shows a percentage from 5 days, and ranks from 20), and a percentage after.
- **Recommendation:** capture first, replay daily, three files by Line, Train and Station, and screens later. Build tickets, the maintainer's picks and ADR-0003's amendment are at the end.

## 1. The record

### What is kept

| Question | Rule | Evidence |
|---|---|---|
| Which Delay | The Train's Delay as the map has it (`delay` from `onMap()`, the number `shown()` gives the card, the boards and Nearby), in seconds, early negative, when its drawn time reaches the Call. | Not Renfe's figure and not the raw GPS one: a Train carries on from its last GPS Delay through the Stations (#33), so only this number is what a viewer saw. |
| Arrival or departure | On arrival, and at a Trip's first Call on departure. | Across a dwell the Delay is the same in 77–85% of Calls, within 20 s in 88–95% and within a minute in 96–99% (n = 375, 1,012, 1,174, 188, 653 in the five windows). The engine's Delay is one number for the Train, and moves over a dwell only where a Train is held or catching up. FGC's and TRAM's timetable has a dwell at 83% and 86% of Calls, Rodalies' at 39%. |
| Only while Live | A Call's Delay is kept only if the Train was Live as it crossed. | A Scheduled Train keeps its last Delay for up to 30 minutes, then 0, which reads as on time. That's 3% of the Calls crossed mid-route and 26% of last Calls. It is not recorded, but see "The last Call" below. |
| Cancelled | Counted apart, for each Line and day: Trips Cancelled over Trips run. Their Calls hold no Delay. | Renfe flags CANCELED in its trip updates: 4 of 31 Rodalies Trips its timetable had running in the Tuesday window, 65 of 117 and 39 of 126 on the Wednesday (midday, peak); none in the Saturday's 45 minutes. FGC and TRAM flag none: their cancelled Trains can't be told from unreported. |
| Unreported | Counted apart too: Trips the timetable has running that live data never names. Never counted as on time. | See section 4: in the weekday windows Rodalies had 25% of its Trip-stretches unnamed, 15% on the Saturday morning, FGC 2–3%, TRAM 0–2%, Madrid 0%. |
| Unmatched | Counted apart: a report naming a Trip the day's file hasn't, as Renfe's added Trains. The engine drops it, so it has no Call to hold a Delay. | 12 of Madrid's 139 Trips reported on the Saturday (9%), 3–4 of about 160 on 7 Oct; 3 of Murcia/Alicante's 6. |
| Skipped Stations | Calls at a Station Renfe says a Train won't stop at carry none, and are counted apart (#346). | Hardly measurable here. The three weekday recordings predate #346's fetcher part (deployed on the night of 7 Oct), so none of their snapshots carries `skipped`. The Saturday's two do: 12 Trips in the second, 40 of their Calls, one of them crossed in its 45 minutes. |
| The Metro | Left out (#103). | `live.delay: 'none'`. Its Calls are 85,839 of 191,086 on Friday 9 Oct, 45%, so leaving it out halves the record. |
| Where it came from | One byte a Call: measured, carried on, operator's, last known. | +0.5–0.7 B per Delay brotli'd (2.4–2.6 B against 1.7–1.9 B for the seconds alone, on the real windows). It keeps the statistics honest and lets the screens say which. |

**The last Call.** A Train's Delay at its terminus is the one operators report, and it's the least often Live: of the last Calls of Trains live data named, 70% are Live and 29% are last known. Madrid's are 81% last known, because Renfe drops a Trip once its Train has ended its run (`KEEP_SKIPPED`'s comment in `step.ts`). The last Live Delay is 3 minutes old at the median (180 s) and 7 at p90 (420 s), and 204 of the 211 are within 10 minutes. So the record keeps a last Call's last-known Delay where the Train was placed within 10 minutes, and marks it so. That lifts last Calls from 70% to 98%. It's a pick, in section 7.

### Sizes

A day's record lines up with the day's Trips file: for each Trip, in the file's order, a Delay for each Call, `null` where there is none.

```json
{ "day": "2026-10-09", "trips": "days/2026-10-09-ff5eaa4b8a0b.json", "track": "days/track-20648a0bc2e2.json",
  "rules": "<hash of src/engine.ts>", "runs": 4301, "feeds": { "rodalies": 0.998, "fgc": 0.91 },
  "cancelled": [12, 40],
  "delays": [null, [0, 12, 18, null, 30], null],  // seconds, a Call each, Trips in the file's order
  "from":   [null, [3, 1, 1, null, 2], null] }    // 1 measured, 2 carried on, 3 operator's, 4 last known
```

Calls a day, from the bundles and timetables:

| | Weekday (Fri 9 Oct) | Saturday 10 Oct | Sunday 11 Oct |
|---|---|---|---|
| Catalonia: Rodalies, FGC, TRAM | 58,426 | 32,742 | 32,254 |
| + Cercanías Madrid | 78,596 | 48,644 | 48,130 |
| + the other 13 núcleos (every núcleo in today's bundle) | 105,247 | 68,373 | 67,327 |
| + long distance and Euskotren's trains (not built; their GTFS of 10 Oct, with Euskotren's E1–E4 and E3a, not its L3, a metro line, nor its information line) | about 129,300 | about 85,600 | about 85,100 |
| The Metro, left out | 85,839 | 61,249 | 59,732 |

Sizes of a day's file of Delays alone, each Call's in whole seconds as JSON (the record's `delays`; `from` is below), and as a byte of whole minutes (the compact one). The windows are 135 minutes of live data, so a day is **built from what they saw**: each Trip is named or not with the share of its Network's Trips that were in the windows, and each Call has a Delay with the share the windows had by position along the Trip, its values walking along the Trip by the steps the windows saw. Brotli is quality 11, as `daily.ts` writes it, and gzip level 9. 30 days is 22 weekdays, 4 Saturdays and 4 Sundays; a year 261, 52 and 52. A Sunday is within 2% of the Saturday.

| | | JSON seconds: raw | gzip | brotli | Bytes of minutes: brotli |
|---|---|---|---|---|---|
| **Catalonia** | weekday | 190 KB | 66 KB | **60 KB** | 17 KB |
| | Saturday | 104 KB | 36 KB | 32 KB | 10 KB |
| | 30 days | 4.9 MB | 1.7 MB | 1.5 MB | 451 KB |
| | a year | 58.9 MB | 20.5 MB | 18.5 MB | 5.3 MB |
| **All Cercanías** (today's bundle) | weekday | 363 KB | 123 KB | **109 KB** | 36 KB |
| | Saturday | 237 KB | 80 KB | 71 KB | 24 KB |
| | 30 days | 9.6 MB | 3.3 MB | 2.9 MB | 974 KB |
| | a year | 116.5 MB | 39.5 MB | 35.0 MB | 11.5 MB |
| **Spain**, with long distance and Euskotren's trains | weekday | 446 KB | 151 KB | **134 KB** | 44 KB |
| | Saturday | 297 KB | 100 KB | 88 KB | 30 KB |
| | 30 days | 11.9 MB | 4.0 MB | 3.6 MB | 1.2 MB |
| | a year | 143.8 MB | 48.7 MB | 43.1 MB | 14.2 MB |

- **A day's own values compress worse than the synthetic's.** The real windows, kept as the same sparse file, cost 1.75–1.94 B a Delay brotli'd against 1.34–1.37 B in the synthetic day. At the windows' rate Catalonia's weekday is 76–84 KB and all Cercanías' 142–158 KB, so read the JSON rows as 60–85 KB and 109–158 KB. The ticket's 113 KB for 76,796 Calls (1.47 B a Call) is inside that.
- **With `from`**, which the proposed record has, a day is 2.4–2.6 B a Delay on the real windows against 1.7–1.9 B for the seconds alone. Catalonia's weekday is then 80 KB on the synthetic day and up to 110 KB on real values, all Cercanías' 150–205 KB, Spain's 185–255 KB, and a year of Catalonia's 25–35 MB (Spain's 58–80 MB). Still far under R2's free 10 GB-month, for 400 days or for ever.
- **Seconds cost 3× minutes** and buy thresholds nobody has yet picked: Renfe's own on-time count is 3 minutes at each Station of the run, as Catalan press reads its monthly reports, and the commonly quoted one is 5. A byte of minutes can't give a 3-minute line back. The record isn't read by viewers, so keep seconds.
- **Long distance's Live share is unknown:** its feeds aren't fetched yet, and its Calls are scaled at Cercanías' share.

### What the aggregates hold, and how big

All viewer-facing, static JSON on R2, rewritten by the daily job from the last 30 days of records, so a weekday and a weekend day don't differ here. Each cell is raw / gzip / brotli. The entities are those of Friday 9 Oct's bundle without the Metro. The values are synthetic, so the sizes are about right and the numbers in them are not.

| File | One entry holds | Catalonia | All Cercanías |
|---|---|---|---|
| **Lines**, 30 days | for each Line and day: Trips run, Cancelled, Trips reported, Calls with a Delay within 1, 3, 5 and 15 min and over | 43 Lines: 32 / 11.6 / **9.7 KB** | 90 Lines: 71 / 25.7 / **21.5 KB** |
| Lines, a year of days | the same for 365 days | 359 / 75 / 55 KB | 785 / 162 / 116 KB |
| **Trains**, a file for each Network | for a Train number, or a slot: days seen, mean of its day figures in minutes, % of days on time | 5,993 keys: 174 / 37 / **30 KB**; the largest Network 13 KB brotli'd | 10,265 keys: 257 / 61 / **50 KB** |
| Trains, with each day's figure | the same and 30 figures | 399 / 107 / 96 KB | 680 / 201 / 182 KB |
| **Stations**, 30 days | for each Station and day: Calls with a Delay, within 5 min, mean | 353 Stations: 130 / 36 / **30 KB** | 961: 348 / 97 / **82 KB** |
| A board's "usually", by (Line, Station, headsign) | the 30-day mean and days at a Station | 1,951 entries: 92 / 13 / 10 KB | 4,293: 224 / 29 / 23 KB |
| By (Train, Station), every Call | the same for each Call, split by Station | 2,429 / 292 / 234 KB | 3,687 / 507 / 418 KB |

A Train's day figure is its Delay at its last Call with a Delay, as railisland's is its "final delay" (its source, `index.html` at 65a7adc: on time is a final delay of 5 minutes or less; the card shows "average delay, on time %, days" from 5 days). Per-Network files keep a followed Train's card to ≤ 13 KB.

**For Spain**, long distance adds 12 products and Euskotren's trains 5 Lines, and on a weekday 1,646 and 658 Trips and about 760 more Stations (by Adif's codes and Euskotren's, from their GTFS of 10 Oct). Scale the All Cercanías column by 1.2 for Lines, 1.3 for Trains and 1.8 for Stations, which makes about 26, 65 and 147 KB brotli'd for 30 days. An estimate: none of it is built.

## 2. Where a Delay per Call comes from

Nothing in the fetcher's output has a Delay per Call, and none can come from the snapshot alone: a Delay at a Call needs the Trip's timetable (the Call's time), the Trip's shape (for a position's Delay) and the engine's rules (the carry-on, the confirmation, the standing hold). Four ways:

| | How | |
|---|---|---|
| **A** | The fetcher loads the day's Trips and shapes, from R2 or from rows in its storage, and works each Call's Delay out as it runs, writing the day's file at midnight. | Fits the plan's CPU if the engine's state is kept between runs; the rest is against it. |
| **B** | The fetcher keeps each run's snapshot, in its storage, and writes each 5 minutes' as one object to a bucket of its own; a daily job replays the day through `src/engine.ts` with that day's bundle, as `src/record.ts` does. | **Recommended.** |
| C | The viewer's browser reports its Delays. | Rejected: nothing run for viewers, and every viewer would be a writer (ADR-0003, ADR-0011). |
| D | A database written every run. | Rejected in ADR-0011. |

A variant of A, a second Durable Object that reads each snapshot and holds the Trips, would keep the engine out of the snapshot's path, and has A's CPU, memory and keeps-nothing objections below; it isn't weighed apart.

### Measured against Workers Paid

Today's use is from [live-at-scale.md](live-at-scale.md) (129,600 runs a month), with what #339 added since (an `alerts.json` write and a put of its state); the plan's amounts from Cloudflare's pricing pages, read on 10 Oct ([Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/)), and the 128 MB and 2 MB from [Workers' limits](https://developers.cloudflare.com/workers/platform/limits/) and [Durable Objects' limits](https://developers.cloudflare.com/durable-objects/platform/limits/). An alarm is a request, and a `setAlarm()` and a delete are each a row written. Node's timings for A are from loading Friday's files in Node on the Mac; Cloudflare's CPU for them isn't measured (local workerd doesn't meter CPU as Cloudflare bills it, as #221 found).

| Item a month | Included | Today | **B**, an object each 5 minutes | B, an object each run | **A** |
|---|---|---|---|---|---|
| Worker CPU | 30 M ms | 1.6 M | +0.1–0.3 M (a run's string held, a chunk gzipped: about 1–2 ms a run; not measured) | +0.1–0.2 M (a second `put`) | +3.5–9 M of Node's ms: 24–65 ms to parse the Trips and shapes, 3–6 ms of engine, each run, with the engine's state kept between runs. Replaying the last 35 minutes cold each run took 0.46–0.57 s: about 65 M, over the 30 M |
| Durable Object requests | 1 M | about 175 k | same | same | same |
| Durable Object duration | 400 k GB-s | about 35 k | same | same | more: the run is longer |
| SQLite rows written | 50 M | about 390 k (an alarm and two puts a run) | +260 k (a row a run, and its delete at the slot's end) | same | +130–260 k (the engine's state) |
| R2 Class A writes | 1 M free | about 140 k (130 k snapshots, 8.6 k or more of alerts.json) | +8.6 k | +130 k = 270 k, 27% (and 150 lists) | +30 (the day's file, a day) |
| R2 Class B reads | 10 M free | CDN misses | +8.6 k: the job reads each chunk once | +130 k, 1.3% | +130 k, 1.3%: the Worker reads the day's files each run |
| R2 storage | 10 GB-month free | about 0.1 GB | 19 MB a day gzipped, 7 days standing 0.13 GB; 1.8–2.1 GB a year compacted | raw 1.3 GB standing, or the same gzipped | the day's file only |
| Memory | 128 MB | small | none | none | +25 MB (slim) to +53 MB (whole) of parsed JSON, and the engine's state |

- **Chunks, because the job can't list.** `wrangler r2 object` has `get`, `put` and `delete` and no list (wrangler 4.137, which `package.json` has), and wrangler is what the daily build publishes with. An object for each run is named by its `generated`, which the job can't know, so reading a day would mean the S3 API: the job's token can sign for it without a new secret, as [Cloudflare's docs](https://developers.cloudflare.com/r2/api/tokens/) have it, but not without signing code the repo doesn't have. One for each 5-minute slot has a name the job does know, `history/<UTC day>/<hhmm>.ndjson.gz`, in UTC so that the night the clocks change (25 Oct) doesn't have two 02:30s: 288 `get`s a day, about 10 minutes by wrangler in a row, fewer in parallel. The fetcher puts a slot at the first run after it ends, since a run can't know it's the slot's last.
- **B's storage:** a snapshot is 20 KB raw at night and 52 KB at the peak, 2.0–4.3 KB brotli'd on its own, 0.5–1.5 KB kept together (about 130 snapshots as NDJSON: 71–195 KB). A chunk of 15 runs is 306 KB raw at night and 785 KB at the peak: 17–87 KB gzipped, which is the safe choice in a Worker (the standard `CompressionStream` formats are gzip and deflate), and 10–26 KB brotli'd by the job. A day is 180 MB raw, 19 MB gzipped, about 5 MB brotli'd, and 0.7 of that without the Metro. Spain's 700–1,000 Trains make it 12–14 MB a day, 4.5–5 GB a year: under R2's free 10 GB, and $0.015 a GB-month beyond.
- **A's load:** Friday's track file is 12.6 MB raw and parses in 28–42 ms to 36 MB of heap, its Trips file 14.3 MB in 23 ms to 17 MB. Cut to the non-Metro Trips and the 224 shapes they run on (of 4,098), 12.8 MB raw, 899 KB brotli'd, 24 ms and 25 MB. The Durable Object is evicted between alarms (ADR-0003), so every run would parse them again.
- **A with the Trips in SQLite.** Held in the Durable Object's storage as a row for each Trip and each shape, instead of parsed whole each run, a run reads the 400 or so Trips it names and their shapes, 1–2 MB, and the parse goes: A's CPU is then the engine's 3–6 ms and the reads, which is cheap, with the engine's fold kept between runs: it lives in memory (`last` in `engine.ts`), so a Durable Object evicted between alarms would keep it in rows too, or replay the last 35 minutes each run, 0.46–0.57 s in Node. The Durable Object's rows are 2 MB at most each, so about 7,500 Trip rows and 224 shape rows a day, written once: 230,000 a month, 0.5% of the included 50 M. What's left against A isn't cost: the engine in the live path, a bundle the Worker must build for each day, and nothing kept to work a day out again.

### Why B

- **The fetcher stays thin.** ADR-0003: the fetcher never loads the timetable, and matching reports to Trips is the engine's work. With A, a bad Trips file, a rule's bug, or an isolate out of memory stops the snapshot every viewer reads. With B, the job fails alone and runs again. B's one part in the live path is the flush, which goes after the snapshot's own write and in a `try`, so that a history write that fails or hangs never holds the snapshot back.
- **It's the map's engine, not a port.** A needs `onMap()` in the Worker with a bundle cut to what a run needs, and `onMap()` counts every Trip of a Network to say its live data is unavailable (#124). B runs `src/engine.ts` unchanged, over the same day file the page loads.
- **Spain strains A.** Long distance's track as built is 115 MB raw (bundle-at-scale.md), 54 MB of it the traced shapes a GPS Delay needs, which parsed whole is more than a 128 MB isolate has. Only the rows variant above fits, with a copy of the day's Trips and shapes cut into rows in the Worker's storage each day. A job on a runner has 16 GB and reads the day's files as they are.
- **History can be worked out again.** B keeps the input. A keeps only what it computed.
- **The aggregates need a daily job anyway:** a 30-day window rewritten once a day. A would end in one.

A's one advantage is time: today's figures would exist as the day goes, a "today so far" for a Line. B has the days before; for today the page has what its engine has from the snapshots it holds (35 minutes): the Trains running now, which is what "Now" shows (section 6). railisland does the same: its 30-day figures are of the days before, aggregated each morning, and its "today" is live. If "today so far" is wanted, the job can run hourly on the day's history, which A would need a job for anyway.

## 3. The throwaway replay

Each recording's snapshots, in order, through the engine copy: a Delay for each Call each Train live data named crossed, with where it came from. Nothing is merged. "Trips named" counts those named in the last 35 minutes; "Delays written" the Calls crossed with a Live Delay (not Cancelled, not last known).

| Recording | Snapshots | Reports a snapshot (the Metro's too) | Trips named (mean) | Delays written | Trips with one |
|---|---|---|---|---|---|
| Tue 6 Oct 23:19–00:04 | 132 | 148 | 146 | 1,017 | 151 |
| Wed 7 Oct 14:03–14:48 | 133 | 381 | 387 | 2,602 | 381 |
| Wed 7 Oct 17:47–18:32 | 132 | 412 | 397 | 2,856 | 397 |
| Sat 10 Oct 10:38–10:52 | 42 | 341 | 299 | 791 | 254 |
| Sat 10 Oct 11:04–11:49 | 134 | 337 | 360 | 2,457 | 388 |

What it wrote for one Trip of Wednesday 7 Oct's peak, from each of two Networks (the Calls it crossed in the window; the rest are before it was named or after it was last reported):

| FGC S2 to Plaça Catalunya | Due | Delay | From | | Madrid C5 to Fuenlabrada | Due | Delay | From |
|---|---|---|---|---|---|---|---|---|
| Sabadell Parc del Nord | 17:47:00 | 0 s | operator's | | Alcorcón | 17:46:00 | 60 s | operator's |
| Can Feu - Gràcia | 17:54:30 | −10 s | measured | | San José de Valderas | 17:49:00 | −95 s | measured, unconfirmed |
| Universitat Autònoma | 18:01:00 | 27 s | operator's | | Cuatro Vientos | 17:52:00 | 177 s | carried on |
| Sant Cugat Centre | 18:12:00 | −7 s | measured | | Aluche | 17:57:00 | 186 s | measured |
| Les Planes | 18:19:30 | 88 s | measured | | Madrid-Atocha Cercanías | 18:08:00 | 238 s | carried on |
| Baixador de Vallvidrera | 18:22:30 | 98 s | measured | | Puente Alcocer | 18:18:00 | 303 s | carried on |
| Les Tres Torres | 18:30:30 | 28 s | operator's | | Zarzaquemada | 18:24:00 | 326 s | carried on |

**Time**, per snapshot on the Mac, mean over each recording's snapshots, and a full day of them (4,320 runs). The first measurement of each of the weekday windows was on a quiet Mac; the second, of all four, with other sessions' jobs running (load average 8–11), best of three. The Saturday's bundle is every núcleo's: 18 Networks, 8,810 Trips, 5,356 of them not the Metro's.

| | night | midday | peak | Saturday | a day |
|---|---|---|---|---|---|
| Only the Trips live data has named (`heard`), quiet | 2.8 ms | 5.5 ms | 5.9 ms | | 25 s at the peak's |
| the same, loaded | 3.2 ms | 6.0 ms | 6.1 ms | 6.6 ms | 29 s at the slowest |
| Every non-Metro Trip asked about, quiet | 11.0 ms | 13.2 ms | 13.6 ms | | 59 s |
| the same, loaded | 22.2 ms | 24.0 ms | 23.8 ms | 23.5 ms | 104 s |
| Every Trip, the Metro's too, as the browser does, quiet | 21.8 ms | 26.8 ms | 25.1 ms | | 108 s |
| the same, loaded | 44.0 ms | 47.7 ms | 48.7 ms | 43.1 ms | 211 s |

- **The job needs only the first row:** a Train live data hasn't named has no Delay to record. The three agree on every Call of a named Trip, bar a 1–2% where a Train first named long after its timetable has passed a Call crosses it on first sight in one and at the start in the other. Asking about every Trip is what slows with the Mac's load; `heard` hardly does, so the job's number is the first row's.
- **The rest of a day's job** is reading 4,320 snapshots (180 MB of JSON, parsed at about 0.6 GB/s, as Friday's Trips file was), parsing the day's bundle (65 ms), and the downloads. A GitHub runner is slower per core than this Mac; call it 2 to 3 minutes for a day. A year of days to work out again is 12–18 hours of runner time, a matrix of ten under two hours.
- **Spain's size:** cloning the peak's Trains and Trips ×2, ×3 and ×4 gave 8.5, 14.0 and 19.6 ms a snapshot against 4.5 for ×1, near linear. About 1,000 Trains at a weekday peak is ×2.5: 10–11 ms a snapshot, a day 35–50 s. The Saturday's bundle, with every núcleo's Trips and 360 Trains named, took 6.6 ms loaded.
- **Memory:** the replay's resident set peaked at 417 MB for the 20 MB bundle, fine on a runner.
- **`at` need not be kept.** The page records when each snapshot arrived on its own clock; a batch has only `generated`. Replaying the peak with `at = generated` agreed on 99% of the Calls, within 10 s on 92% and within a minute on 99%.
- **Midnight:** a job for a service day needs the day before's and after's Trips joined, as `joinDays()` does for the map: a report after midnight names the day it ran on, which the first recording's bundle lacked (287 of Madrid's reports in the last minutes of the Tuesday window matched no Trip).

## 4. Trust, Network by Network

### Where the Delay at a Call came from

The Calls that Trains live data named crossed, non-Metro, mid-route and the ends together. Shares are of the Calls not Cancelled; Cancelled is of all; "Live of the rest" is what's left once last known is out. Window by window the numbers move by a few points, except Rodalies'.

| Weekday windows, 7 and 6 Oct | Calls | Cancelled | measured | carried on | operator's | last known | Live of the rest |
|---|---|---|---|---|---|---|---|
| Rodalies | 1,382 | 45% | 12% | 44% | 25% | 17% | 82% |
| Cercanías Madrid | 2,049 | 0% | 25% | 58% | 8% | 8% | 92% |
| FGC | 2,364 | 0% | 53% | 0% | 46% | 0% | 100% |
| TRAM | 1,626 | 0% | 60% | 0% | 40% | 0% | 100% |
| All four | 7,421 | 8% | 42% | 22% | 31% | 5% | 95% |

| Saturday 10 Oct, 59 minutes | Calls | Cancelled | measured | carried on | operator's | last known | Live of the rest |
|---|---|---|---|---|---|---|---|
| Rodalies | 695 | 0% | 17% | 56% | 18% | 9% | 91% |
| Cercanías Madrid | 851 | 0% | 31% | 51% | 10% | 8% | 92% |
| The other 12 núcleos with Trains | 860 | 0% | 19% | 53% | 19% | 8% | 92% |
| FGC | 686 | 0% | 50% | 0% | 50% | 0% | 100% |
| TRAM | 362 | 0% | 62% | 0% | 38% | 0% | 100% |
| All | 3,454 | 0% | 32% | 37% | 25% | 6% | 94% |

And the fixtures' two ordinary weekdays, 25 Sep afternoon and 28 Sep morning (cut bundles: only the Trips that were named): FGC 53% measured, 44% operator's; Rodalies 17% measured, 51% carried on, 13% operator's, 16% Cancelled; TRAM 48% measured, 35% operator's, and on 28 Sep 18% last known, as TRAM's feed was out for part of that window (#128).

By position, all four Networks, weekday windows: first Calls are 18% measured and 81% the operator's, since a Train is named only once it's out; mid-route 44% measured, 25% carried on, 27% the operator's and 3% last known; last Calls 28%, 9%, 37% and 25% last known, 75% Live. On the Saturday: first 16% and 80%; mid-route 34%, 42%, 20% and 3%; last 16%, 13%, 33% and 37% last known.

- **At a Station the position is gone.** Renfe reports a Train stopped at or coming into a Station by the Station's name, not its coordinates, and it pins those late. So a Call's Delay on Renfe is the last in-transit GPS Delay carried on: the fix is 180–200 s old at the median and 520–560 s at p90.
- **Rodalies' unreported Calls can't be read off the Calls.** Counting Calls scheduled in a window as not crossed is biased by Trains running late, which cross them after it ends. Trip-wise it's cleaner:

| Trips the timetable has running through a 10-minute stretch, named in it | Weekday windows | Saturday morning, 45 minutes |
|---|---|---|
| Rodalies | 75% named, 49% with a position, 34% flagged Cancelled | 85%, all with a position, none Cancelled |
| Cercanías Madrid | 100% | 100% |
| FGC | 97% | 98% |
| TRAM | 98% | 100% (29 Trips) |
| Sevilla, Málaga, Valencia | not in those bundles | 86%, 83%, 79% |
| Cádiz, Murcia/Alicante, Cartagena, Ferrol, Bilbao, San Sebastián, Santander | not in those bundles | 100% each |
| **Asturias, León** | not in those bundles | **0** of 82 and of 10 |

Asturias' núcleo (20) has no Trains in Renfe's Cercanías file this morning, though #215 saw 27 there on Sunday 4 Oct, and León's (47) has one in 45 minutes. FV, FGC's funicular, is unnamed in every window (60 Calls on 6–7 Oct, 26 on the Saturday), and RL2 and RL1 were named for 29% and none of their Calls on 6–7 Oct (RL1 for 5 of 6 on the Saturday). And Renfe names Trips the day's timetable lacks: 12 of Madrid's 139 Trips on the Saturday (9%), 3 of Murcia/Alicante's 6, 2 of Sevilla's 11, against 3–4 of about 160 on 7 Oct. The engine drops them.

### Renfe's figure against GPS (#33)

For each Renfe report with a GPS position and a figure, the Delay the engine measures from the position against Renfe's own, which moves in whole minutes. Distinct reports: Rodalies', then Madrid's (the only núcleo in the weekday bundles) and, on the Saturday, every other núcleo's:

| | Reports | Median figure − GPS | Within 1 min | Over 5 min apart | Side of 3 / 5 min differs |
|---|---|---|---|---|---|
| Rodalies, Tue evening | 391 | −15 s | 72% | 24% | 3.1% / 1.0% |
| Rodalies, Wed midday | 1,462 | −5 s | 84% | 12% | 1.5% / 5.2% |
| Rodalies, Wed peak | 1,719 | +2 s | 92% | 4% | 0.5% / 2.3% |
| Madrid, Tue evening | 1,304 | +1 s | 85% | 7% | 14.7% / 9.7% |
| Madrid, Wed midday | 2,694 | +4 s | 92% | 3% | 14.1% / 8.1% |
| Madrid, Wed peak | 2,802 | +4 s | 92% | 3% | 12.9% / 7.4% |
| Rodalies, Saturday | 2,435 | −3 s | 92% | 5% | 5.0% / 1.4% |
| Madrid and the other núcleos, Saturday | 4,249 | +1 s | 90% | 3% | 9.2% / 6.6% |

- **Where they part they part for a Trip.** One R2 Sud (5177M25559) had Renfe's figure 984 s under its GPS Delay on 21 reports in a row, both 2 hours late. The figure is the lower far more often (9% of Rodalies' reports in the weekday windows over 5 minutes under, 0.6% over; 7% and 0.5% with the Saturday's). Which is right can't be told without a time at a Station that isn't Renfe's.
- **Madrid's 3-minute line flips on 9–15% of reports**, for whole minutes. That's inside Renfe's own rounding, and it says a 3-minute count of Madrid's is soft by about 1 in 8.
- **The unconfirmed ones are the worst:** a GPS Delay the Train's report before doesn't support is 3–5% of all the Calls, but 8% of Renfe's (12% with those carried on from one; Madrid's 10% and 14%), and 65 of the 359 (18%) are 10 minutes or more early, as against 7 of 6,201 confirmed ones (0.1%; p10 −1,316 s on the Tuesday). A statistic should flag them or leave them out; whether the map should use them is a follow-up.
- **A figure of 0 is weak evidence.** Of the Calls whose Delay is Renfe's own figure, because no GPS Delay was known for the Train in the last 30 minutes, 44% of Rodalies', 58% of Madrid's and 65% of the other núcleos' are exactly 0 s, where a Delay measured from GPS is exactly 0 on 0–1%. A Train Renfe reports at no delay may be on time, or one it has no position for. FGC's expected time is 0 s on 28%, TRAM's on 1%.
- Renfe's levels aren't the question here: the feed's own trip-level delay was 5 minutes or more on 28 of Madrid's 101 running Trains at 17:47 on 7 Oct.

### FGC, TRAM, the rack and the Metro

| | Evidence |
|---|---|
| **FGC's data age** | A report's age when the snapshot was written: median 83–153 s, p90 260–356 s, and one record 5½ hours old on the Saturday. The fetcher fetches every 2 minutes, and Geotren's own refresh is about as often: gaps between successful tries p50 120 s, p90 121–240 s. Geotren was "not updated" on 8–14% of tries. (#10 found positions 10–20 s older than FGC's stamp.) |
| **FGC's own flag** | Geotren's `en_hora`, polled once a minute for 45 minutes beside the Saturday recording: 1,632 Train-readings, 1,618 True and 14 False (one RL1 Train, for 7 minutes). Against the record's Delay for the same Train in the snapshot just after, for the 1,236 readings with a Live Delay: every True one is 351 s late or less (median 28 s, 97% within 3 minutes), every False one 351 s or more (to 631 s; that Train's last True and first False readings share one figure, 351 s). The flag's line is about 6 minutes, and it agrees with the Delay without a miss. Only one Train was late, so it says little of the middle: 97% of the readings are within 3 minutes, where a flag set at 6 can't tell them apart. |
| **FGC's two sources** | 50–58% of mid-route Calls are measured from Geotren's GPS, 41–50% FGC's expected time at a Station, from its trip updates: the Delay it says is against the Station the Train stands at or comes to next. |
| **The rack (MM)** | 4 Trips at a time: 449 and 526 report-snapshots in two windows, 71–72% standing at a Station, 28–29% GPS. 32 Calls in the five windows (17 measured, 14 the operator's, 1 last known), too few to rate. `lingers` (#232) drops a report that names a Trip ended more than 30 minutes before. |
| **FGC's funicular (FV), RL1 and RL2** | FV has no live data (86 of 86 Calls unnamed on 6–7 Oct and the Saturday). RL2 was named on 29% and RL1 on none on 6–7 Oct. |
| **TRAM's distance and figure** | In 97–100% of 1,124, 1,392 and 474 reports in the three daytime windows TRAM's own delay is within 60 s of the Delay from its distance along the Trip (median −1 to +2 s: as #42 found). At night 22% were off by 5 minutes or more, from two trams of 25: a T5 tram on a 7-minute Trip reported 574 m along it in 128 of its 132 reports over 45 minutes, with TRAM's own delay at 22 s throughout. |
| **TRAM's age** | Unknown: its figures carry no time of their own, so the report is stamped with the fetch. The trip updates' header was 10–15 s old in #11. `vehiclePosition` reads a Station's distance only for about 40 s as a tram reaches it, then 0 (#42, #343): it's a stop the tram has just left, not one it stands at. At its Calls TRAM is 60–66% measured. |
| **TRAM standing** | A tram standing past its timetable's 10 s keeps the Delay it arrived with (#344). That's right on arrival, which the record takes, and wrong for the departure a board shows. |
| **The Metro** | TMB runs it by headway: its timetable names no Blocks, so a Train's Delay is only against whichever Trip its Block runs, minutes off its own (#103). Leave it out. |

### Ratings

A rubric of four things: the share of Calls with a Live Delay, what it rests on, how old that is, and whether Cancelled Trains can be told apart.

| Network | Rating | Why | A screen must say |
|---|---|---|---|
| TRAM | **Good** | 98% of running Trips named, and every Call a named tram crosses is Live; 60–66% measured; its figure agrees with its distance. No time of its own and no Cancelled flag. | The Delay's definition and the days; nothing else. |
| FGC (S, L, R lines) | **Good, with its age** | 97–98% of running Trips named, every Call a named Train crosses Live; 45–56% measured, 41–55% the trip updates'; its own on-time flag agrees. Median 1½ to 2½ minutes old, up to 6. FGC's own punctuality is reported over 99% across its lines ([3Cat](https://www.3cat.cat/324/fgc-renovara-la-flota-de-trens-de-la-linia-llobregat-anoia-la-que-viu-mes-incidencies/noticia/3327209/); its own index, with the definition, not read here), so a minute can't be told from this data. | "FGC's live data is up to 6 minutes old"; count within 3 or 5 minutes, not 1. |
| FGC rack, funicular, RL1, RL2 | **Not rated** | Too few Calls, or none. | Show no figure. |
| Cercanías Madrid, other núcleos | **Fair** | 92% Live, but 51–65% carried on from a GPS fix 3 minutes old, Renfe's figure and GPS differ by 5 minutes in 3–7% of reports, and its figure alone is 0 s on 58–65% of its uses. 81% of Madrid's last Calls last known. The other núcleos read as Madrid's (92% Live on the Saturday), but Asturias and León have none and Valencia, Málaga and Sevilla are named for 79–86% of their Trips. | "Renfe's Trains report their position only between Stations; a Station's Delay is the one measured just before." Line averages are fine; a Train's own figure is weaker. |
| Rodalies | **Fair on a good day, poor on a bad one** | 91% Live of the Calls named Trains cross on the Saturday, 82% on 7 Oct; 44–56% carried on, 18–25% the operator's; Renfe's figure and GPS parted by 5 minutes in 4–24% of reports (5% on the Saturday). 25% of Trips unnamed on 7 Oct and 34% Cancelled; 15% unnamed on the Saturday. | The same, and "Trains with no live data aren't counted: n of m Trains". Cancelled counted apart. |
| The Metro | **None** | #103. | "No punctuality for the Metro: TMB runs it by headway." |

## 5. Identity and keeping

### Matching a Train across days

| Network | Key | Evidence |
|---|---|---|
| Rodalies, Cercanías | **Train number**, five digits, with the Line (the same number stands for two Trips of a day 4–5 times) | `trip_id` leads with a service_id that changes daily: 0% of ids match from day to day. Numbers: 100% Tue→Wed→Fri for Madrid and Rodalies; Sat→Sun 99–100%; Friday's numbers run again on the Saturday for 11% of Madrid's and 68% of Rodalies': Madrid's weekend is other Trains, Rodalies' partly. Over the Cercanías file's 30 days (9 Oct–7 Nov), Madrid's weekday numbers stayed 99.6–100% against the day before or the first Friday, Saturdays 87–100% and Sundays 77–100% against the weekend before, and a Monday after a holiday ran a weekend's (14%). |
| FGC | **Slot**: Line, headsign, first departure | A trip_id is a service id, a vertical bar and a suffix. Tue→Wed 100%, Wed→Fri **3%** (59 of 2,043): its timetable changed between 7 and 9 Oct. The slot held 98%. |
| TRAM | **Slot** | Tue→Wed 100%, Wed→Fri **0%**; the slot 81%. |
| The Metro | none | #103. |

- **A key holds for a timetable edition and a day type.** A change of edition that retimes a Train starts its history again, which the days count shows. No attempt to join across: a Train that moves 5 minutes is a different slot.
- **Number reuse across editions** can join two Trains under one number. A 30-day window ages it out.
- **A Train is per Network:** a number isn't unique across Spain (CONTEXT.md), so the key leads with the Network.
- **The key is computed from Trip fields the bundle already has** (`number`, `line`, `headsign`, the first Call's departure): no new field, and the page and the job share one function.

### Keeping

| What | Kept | Why | Size |
|---|---|---|---|
| `snapshot.json` | overwritten each run, as now | | 20–52 KB |
| History objects | a lifecycle rule expires them after 7 days; the job compacts each day into one brotli'd file kept for 400 days (a pick, section 7) | to work a day out again; a year and a month of margin | 5 MB a day; 2 GB for 400 days |
| The day's bundle files | as now: nothing deletes them (the 6 Oct track is still served); the day's record names its track and Trips files | to replay with the Trips the map had | 0.5–0.8 MB a day brotli'd, 2.2 MB on a day the track changes (1.4 MB) |
| The day's record | forever | it's the history | 25–255 KB a day (section 1) |
| Aggregates | rewritten each day: 30 days; Lines also a year | | tens of KB |

R2's lifecycle rules delete by prefix and age, up to 1,000 a bucket, typically within a day of their time ([docs](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)). Keeping 400 days of the history is 2 GB for Catalonia and Madrid, 5 GB for Spain: R2's free tier is 10 GB-month.

### When the Delay rules change

Yes, worked out again, as far as snapshots are kept. A day's record is stamped with the commit and a hash of `src/engine.ts` it was replayed at. A ticket that changes a Delay rule (#33, #39 and #232 each did) re-runs the last 30 days, in the Actions matrix: 30 days at 2–3 minutes is about an hour of runner. Older days keep their stamp, and the aggregates say which they were worked out at. Without that, a rules change opens a seam in every figure. What can't be recomputed is anything a rule needs that the snapshot lacks: a time a Train was placed is in it, but not a viewer's clock.

### Gaps

A day's file carries its own coverage: the runs seen of the 4,320, and for each Network the minutes its feed was working (the snapshot's `feeds`). A day where FGC's quota ran out, TRAM backed off (#128), or the fetcher stopped reads as unreported Trips, which is not the Trains not running. The aggregates leave a Network's day out under 90% of its minutes, and say so.

## 6. What the screens could show, and from when

| Screen | Could show | From | History needed |
|---|---|---|---|
| **Now** (#318) | The Trains running now by Delay, most late first, by Network | The map's engine: `Followed.delay` for each Train | None |
| Now | The 10 most punctual Trains of 30 days, as railisland's: lowest worst day among Trains with 20 days (its `s.d >= 20`) | Trains file | 20 days seen: 4 weeks of weekdays, more where a Train isn't named every day |
| **A Line's screen** | Now: its Trains running, how many within 5 minutes, mean Delay, Cancelled | The engine, over the snapshots the page holds | None |
| A Line's screen | Last 30 days as a bar for each day, and the mean | Lines file | 3 days for a number, 7 for the bars |
| A Line's screen, on its Station strip | "Usually +2 min here" by (Line, Station) | Board file | 7 days |
| **A Station's sheet** | "Trains here: 82% within 5 min over 30 days (n days)" | Stations file | 3 days |
| A Station's board, each row | "Usually 3 min late", by (Line, Station, headsign) or the Train | Board file | 5 days a Train |
| **A followed Train's card** | "Average delay 8.4 min, on time 78% (18 days)", its worst day | Trains file | 5 days seen to show anything, a percentage from 20 |
| A followed Train's card | The day-by-day strip of its last 30 or 90 days | Trains file with the figures | 5 days; more than 30 only for weekday Trains |

**From when.** There's no backfill: the record starts the night the job first runs. Day 1: yesterday's Lines and Stations. Day 3: the Line and Station means. Day 7: weekday Trains named every day they run, as FGC's, TRAM's and Madrid's nearly are, have 5 days seen, and day 28: 20. Rodalies' are named on about four days in five (75–85% of its Trips in a stretch), so about day 9 and day 33–37. A weekend Train, which runs 4 or 5 days in 30, reaches 5 at week 5, and its card says "(4 days)".

**How many days are too few.** A Train's on-time share is a binomial: with a share near 80%, the 95% interval (Wilson) is 38–96% at 5 days, 49–94% at 10, 58–92% at 20 and 63–90% at 30. For FGC's kind, 5 of 5, 10 of 10 and 28 of 30 days on time give 57–100%, 72–100% and 79–98%. For 2 of 5, 5 of 10 and 15 of 30 it's 12–77%, 24–76% and 33–67%. "78% (18 days)" is a number with a ±15–18 point band, and two Trains 10 points apart can't be told apart.

- **Under 5 days seen: show nothing.** railisland gates its line at 5 days, as its source has it (`s.d >= 5`), and its history card says "accumulating" until then.
- **5 to 19 days: counts, not percentages:** "within 5 minutes on 14 of 17 days, worst +11 min".
- **20 days or more: a percentage**, with the count beside it, as railisland's "(18 days)".
- **The ranking is by worst day, not percentage,** as railisland's is: with 20 days a Train is at 100% or not, and ties are the rule. It says "no more than x min late on any of its n days", never "never late".
- **A Line or a Station:** a day is hundreds of Calls, so one day is a sample. Show a day's figure from day 1 and a mean from 3.
- **What it counts.** Every figure says "Delay against the timetable from live data; Trains with no live data aren't counted". Renfe counts a Train on time at 3 minutes at each Station of its run ([Catalan press](https://ebredigital.cat/?p=309109) on its monthly reports) and has quoted 90% under 5 minutes counting only the delays it attributes to itself and 16% counting every cause ([Ara](https://es.ara.cat/sociedad/movilidad/renfe-dice-trenes-iban-2-5-minutos-tarde-pleno-caos-cercanias_1_5705509.html), February 2026). An independent tracker, as [Puntual.cat](https://www.diaridetarragona.com/tarragona/238538/puntual-cat-nueva-web-usuarios-conocer-retrasos-tren_amp.html), puts figures on delays from the live data (its method wasn't read here), and so would this, against the timetable and whatever the cause: say it.

## 7. Recommendation, and the build tickets it suggests

**One recommendation: capture now, replay daily, publish three files, show it on the screens #318 and #328 pick.**

A list for the maintainer to pick from. None is filed.

1. **Keep each run's snapshot.** In `worker.ts`, after the snapshot's own write and inside a `try`, hold the run's snapshot string in the Durable Object's storage, a row a run, and at the first run after each 5-minute slot put the slot's, gzipped, as `history/<UTC day>/<hhmm>.ndjson.gz` in a bucket of its own (no public domain), with a 7-day lifecycle rule, and delete its rows. The bucket has to exist before the fetcher is deployed, as its binding names it. Hold no more than two slots' rows, so that a bucket that refuses writes can't grow the Durable Object's storage for ever, and keep the compacted days under a prefix that rule doesn't cover. ADR-0003's amendment is below. A pick first: a bucket of its own, or the same one (public), given TRAM's terms (see "Not measured"). *Small.* **First: nothing else can bring a past day back.**
2. **Replay a day into its record.** `src/build/punctuality.ts` and a workflow dispatched after the daily build: read a day's history objects, replay them through the engine (`heard` only), write `punctuality/<day>.json` and the day's compacted history. A test over a fixture in `src/fixtures/`, as the engine's are (`replay-2026-09-25.json.gz` has 923 Trips). *Medium.* Blocked by 1 for real days; it can be built against the recordings.
3. **The aggregates: Lines, Trains and Stations** from the last 30 days of records, with the key function in `bundle.ts`. *Medium.* Blocked by 2.
4. **Say what a Delay is** in About's "Reading the map", in five languages (#327): the definition, "within 5 minutes", unreported and Cancelled apart, the Renfe and FGC lines of section 4. *Small.* With 5.
5. **Show it:** Now's most punctual, a Line's 30 days, a Station's, a Train's card, each its own ticket after #328's pick and #321. Blocked by 3 and by the days of history of section 6.
6. **Check the record against a real time at a Station** before a percentage shows (research, no code): Renfe's own monthly report, Adif or Puntual.cat for a Rodalies Line over a few days, and FGC's published punctuality. Section 4's level isn't validated.
7. **Rerun on a normal weekday of Rodalies**, with a weekend midday if the Record cron's Saturday run turns up (see "Not measured"): the weekday shares come from 7 Oct's rains, and the Saturday's from a morning.
8. **Cancelled for FGC and TRAM from their Alerts** (#279, #339): today they can't be told from unreported.

### Picks for the maintainer

Each with the recommendation the note makes; the build tickets wait for them.

1. **Where the history goes:** a bucket of its own with no public domain (recommended), or `viapeninsula-live` under `history/`, which the CDN serves to anyone. TRAM's terms (content not altered, kept up to date) and TMB's (cited, not altered) weren't read against keeping a copy or publishing figures from it.
2. **How long:** 7 days of chunks and 400 days of compacted days (recommended), or for ever, or 35 days, which loses the year's worth of working a day out again.
3. **What "on time" is on screens:** within 5 minutes (recommended: railisland's, and FGC's own flag is at about 6), with Renfe's own 3 minutes said for Rodalies. The record keeps seconds either way.
4. **A last Call's last-known Delay:** counted where the Train was placed within 10 minutes, marked (recommended: last Calls from 70% to 98%), or Live only.
5. **Unconfirmed GPS Delays:** kept flagged in the record and left out of the aggregates (recommended); whether the map should stop drawing by them is a follow-up.
6. **Days:** nothing under 5, counts from 5 to 19, a percentage from 20 (recommended), or railisland's percentage from 5.
7. **Where the job runs:** GitHub Actions after the daily build (recommended), or a Worker on a cron, which needs the engine in a Worker.
8. **When the capture starts:** now, once pick 1 is made, without waiting for #328's (recommended).

## 8. ADR-0003's amendment, drafted

ADR-0011 expects it. For the maintainer to put in ADR-0003 once a pick is made, as a consequence and a considered option:

> **The fetcher also keeps what it writes, for history.** Each run's snapshot, unchanged, is also held in its storage, and each 5 minutes' of them go as one gzipped object, `history/<UTC day>/<hhmm>.ndjson.gz`, to a bucket of its own with no public domain, which a lifecycle rule empties after 7 days. A daily GitHub Actions job replays a service day's snapshots through `src/engine.ts` with that day's bundle, as `src/record.ts` does for a fixture, and writes the day's Delay for each Call and its aggregates by Line, Train and Station as static files beside the bundles. Viewers read them through the CDN as they read the snapshot, so nothing runs for a viewer and cost doesn't grow with viewers (ADR-0011). The fetcher still never loads the timetable: matching reports to Trips and the Delay stay the engine's work, in the browser for the map and in the job for the record. It costs 8,640 more Class A writes a month, under 1% of the free million, and an estimated 1–2 ms of Worker CPU a run.
>
> **Considered:** the fetcher loading the day's Trips and working each Call's Delay out in its run. Rejected: it puts the engine and a 12.8 MB parse in the path of every viewer's snapshot, needs the engine's state kept between runs to fit the plan's CPU, can hold long distance's shapes in a 128 MB isolate only as rows, and keeps nothing to work a day out again when a Delay rule changes.

## Not measured

- **A normal weekday of Rodalies.** The two daytime windows are 7 Oct's rains, and the night window the evening before. The Saturday's 59 minutes of a morning are the only ordinary sample. The Record workflow's Saturday 12:47 cron had not run when this was written, so there is no weekend midday.
- **Cloudflare's CPU for any of it.** Node's M4 Pro timings only; the production figure is ADR-0003's 12 ms for a run with the requests.
- **A real day's record.** The synthetic days are drawn from the three weekday windows (the Saturday's two only check them: 1.81 B a Delay brotli'd, inside the 1.75–1.94 B range), and Delays along a real Trip are smoother than the synthetic walk.
- **The truth.** There is no time at a Station that isn't the operator's feed's or the engine's. Renfe's figure against GPS says which parts, not which is right; the levels in section 4 aren't validated.
- **Skipped Stations (#346):** one Call crossed in the Saturday's 45 minutes; the weekday recordings predate the fetcher's part of it.
- **Long distance's and Euskotren's live data** (not fetched yet), and the other núcleos beyond 59 minutes of a Saturday morning.
- **Timings on a quiet Mac for the Saturday's bundle.** The Mac's load changed between measurements: asking about every Trip took twice as long loaded (section 3). `heard`, which the job needs, moved by 10–15%.
- **Weekend Delay levels, FGC's quota-out days, and the CDN's and browser's added lag** (the page's `LAG`).
- **How a Train's day figures vary from day to day**, which sets the days a mean needs. The first two weeks of the record answer it.
- **The history bucket's terms:** TRAM's say its content may not be altered and must be kept up to date (live-data-sources.md); whether keeping a copy and publishing statistics from it is within them wasn't checked.

## Files kept

Not in the repo, and not durable: the session's scratch directory (`scratchpad/329/`), which the system may clear. `tools/` (`mkengine.mjs` and `engine-x.ts`, a copy of the engine with internals exported; `replay.ts`, `analyse2.ts`, `trust.ts`, `synth.ts`, `aggr.ts`, `parse.ts` and the rest), `recordings/` (the three runs, the Saturday's two, and the fixtures unpacked), `days/` (the live bundles of 9–12 Oct), `out/` (events and tables). Copy it somewhere before the replay is wanted again. What stays: the three runs' artifacts until 5–6 November (Actions keeps them 30 days); the bundles, which nothing deletes; and in the repo the fixtures of 25 and 28 Sep and one of 7 Oct 13:00–13:45 (16 Trips, #346's), cut to the Trips they name, which are other windows.

## Re-verify quickly

```sh
# A recording of the Record workflow: the whole day's bundle, and snapshots
# (its artifacts expire 30 days after the run, 5–6 November for the three used here)
gh run list --workflow record.yml --limit 10
gh run download 37646767458 -D /tmp/rec
# Trips named in Renfe's Cercanías feed, by núcleo (a missing "20" is Asturias)
curl -s https://gtfsrt.renfe.com/vehicle_positions.json | jq '[.entity[].vehicle.trip.tripId[:2]] | group_by(.) | map({(.[0]): length}) | add'
# The snapshot's reports, by Network
curl -s https://viapeninsula-live.gariasf.com/snapshot.json | jq '[.reports[] | (.trip // .block.line) | split(":")[0]] | group_by(.) | map({(.[0]): length}) | add'
# Does an old track file still serve? (none is ever deleted)
curl -sI https://viapeninsula-live.gariasf.com/days/track-6f8807f61320.json | head -1
```
