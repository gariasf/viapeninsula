# A followed Train's card against the Train drawn on the map

Research for #352, under #234 (part of #1). It builds on [ADR-0002](../adr/0002-timetable-drives-motion.md) (the timetable drives motion, a Train never runs back), #233's audit (its replay method, and its long pins, #233's first follow-up), and #335/#356 (the clock the minutes to go count by). Nothing in the map changed: the measure is `src/cardVsMap.ts` (the yardstick, with tests) and `src/cardVsMapRun.ts` (`npm run card-vs-map -- <dir>...`), as `jumps()` is one for jumps.

- **Base:** origin/main `c97cf8e`, 10 October 2026.
- **Recordings:** the Record workflow's runs 37533038357 (Tue 6 Oct 23:19), 37618244697 (Wed 7 Oct 14:03) and 37646767458 (Wed 7 Oct 17:47), and the three Saturday ones of 10 Oct: 10:38–10:52 and 11:04–11:49 (by hand, #414's two) and run 38047796026 (13:16–14:01). 14,261 s of replay in all, Rodalies, FGC, TRAM, the Metro and the Cercanías núcleos of those days, each recording with that day's whole `bundle.json`; the Networks' live traits are `src/networks.ts`'s now.
- **Method:** each second from the first snapshot's arrival to the last, every Trip of the day that can be on the map, through the engine's own `onMap()` (a copy of `src/engine.ts` with it exported, made in a temporary directory at the run). For each Train drawn, the card is worked out as `trainAt()` and `strip()` work it out (`upcoming`, `standsAt`, `delay`, minutes to go by `Date.now()`) and set against the drawn position, the Stations near it, and the followed pill's reach. Every Train drawn counts as if it were the one followed, so a figure is a share of Train-seconds, and the chance a followed Train's card and pill disagree in a second. No Closure is applied, so a Scheduled Train #345 hides within one is counted as drawn.
- **Same Delay measures as before the ticket:** jumps and stalls are counted in the same pass (the `jumps()` rule: Live in both seconds, more than line speed plus 5%; the stalls: a Live Train still, more than 20 m from every call).

## TL;DR

- **The card and the drawn Train never disagree about which leg the Train is on.** Both come from one `time` in `onMap()`, and `upcoming`, `standsAt` and the drawn distance agree by construction, whatever the easing. What differs is what the words say, how near a Station the pill is drawn, and when `now` reads.
- **The most common mismatch is cause 1, the words,** and it's all there is to it: a Train drawn within 50 m of B, before it has arrived, while the card says `now · Left A` and the next Station B. It's 2.6% of Rodalies' Train-seconds, 6.0% of FGC's, 8.3% of TRAM's, 8.9% of the Metro's, 3.4% of Madrid's; and the header says *Next station* for the 7 to 23% of Train-seconds a Train stands at it.
- **The followed pill covers a Station the card doesn't have the Train at** (cause 2) for 10 to 16% of Train-seconds at zoom 13 (5% in Madrid), and 15 to 27% with its arrow; 14 to 39% at zoom 11 (Rodalies, FGC, Madrid's; TRAM's and the Metro's pills start at 12), 3 to 8% at zoom 15. In 33% (Rodalies) to 99% (Madrid) of those, the Station is the next call, within braking distance of it, where `Arriving at B` would be true; the rest are Stations it passes.
- **`now` reads while the Train is more than 200 m short** (cause 3) 2.7% of Rodalies' Train-seconds, 6.6% of FGC's, 4.6% of TRAM's, 9.6% of the Metro's, 5.0% of Madrid's, and in 98 to 100% of those it's the minute alone: the card's time has not come yet. The Train is 20 to 40 s from the Station in 70 to 78% of them, 40 to 60 s in 22 to 25% (a few more in FGC and TRAM), and 20 s or less in 4% of FGC's, none in Rodalies'.
- **Stations passed without stopping** (cause 4) are 1.3% (Rodalies), 1.2% (FGC), 2.1% (TRAM), 2.5% (Metro) and 0.0% (Madrid) of Train-seconds drawn at a Station the card doesn't name, 3 to 6.5% under the pill. 227 of 950 Rodalies Trips on 7 October pass one (the ticket's figure, reproduced), 120 of FGC's R5, R6, R50 and R60 Trips.
- **Times against the drawn Train** (cause 5) are small. A card's time is more than 20 s later than the drawn Train's arrival (drawn ahead of its Delay) for 0.5 to 4.2% of Train-seconds, more than 20 s earlier (drawn behind) for 0.2 to 1.3%, and more than a minute for none but the Metro's 0.04%. The card reads `now` by the Delay with the Train far short in 0.00 to 0.12% of Train-seconds.
- **Renfe's pins** (cause 6): 21% of Rodalies' Live seconds and 26% of Madrid's carry a pin confirmed within 30 s, and in 39% of those (Rodalies; 57% of Madrid's) the Train is drawn more than 200 m short of the pinned Station, in 32% (20% in Madrid) beyond it. It's the engine's Delay, not the card's words, and #233's long pins.
- **None of the card-only fixes touches the drawn Trains,** so the Delay measures stay what they are, to the second (below).

## 1. What is measured, exactly

`differences()` (`src/cardVsMap.ts`) takes one Train at one second. Its card is: `next` the first call with a departure still to come, `standing` when `standsAt`, `lastLeft` the call before it when it doesn't stand (the card's `now · Left A`), and `has` the Station the card has it at, `next` standing, `lastLeft` otherwise. A Station is named by its place (`place`, else its name), as the map shows it.

| Measure | A second counts when |
|---|---|
| **1** `atNextBeforeArriving` | the Train isn't standing and is drawn within 50 m (`AT`: about 7 px at zoom 13) of `next`: the card says `Left A`, the header `Next station B`. |
| **a** `at` | it is drawn within 50 m of any Station that isn't `has`, by kind: the next call, another call, or **not a call** (cause 4). |
| **2** `pill`, `arrow` | a Station that isn't `has` is within the followed pill's reach along its track (`boxOf()`'s half-length at 12 px lettering, in metres at the zoom and latitude; 11 to 18 px), alone or with its arrow's `ARROW_GAP` (7 px) as well; by kind. `graced`: it's the next call and within `topSpeed² / 2·braking` (the speed model's most): where `Arriving at B` is true. |
| **b** `readsNow`, `nowFar` | the countdown reads 0 minutes (`minutesTo()` of the time the card gives, against the device clock): of all Train-seconds, and while the Train is more than 200 m (`FAR`) short of the Station it counts to. `toGo` is how many seconds the drawn Train has to it. |
| **3** `nowByMinute` | of `nowFar`, the card's time is still ahead of the clock: only the minute reads 0. |
| **5** `timeOff`, `nowByDelay` | the card's time for the next Station, less when the drawn Train gets there (`delay − (now − time)`): positive when it's drawn ahead of its Delay. And of `nowFar`, the card's time has come by the clock with the Train short of it. |
| **6** `pinnedAway` | the Train is Live, its last report is a pin (`near`) of a Station of its Trip, confirmed within 30 s (the card's `confirmed N s ago`), and it's drawn more than 200 m along its Trip from that Station: short of it, or past it. TRAM's `near` is a platform number, not a Station, so none count. |

The yardsticks are in `AT`, `FAR`, `OFF` of the module: 50 m is a dot, 200 m is what `now` should never read at (12 to 20 s at line speed); the pill's reach is as the code has it, with no browser measure of the name's width (the fallback 6 px a letter, as `textWidth()` has it where there's no canvas).

## 2. What the card and the map say in each Network

Share of Train-seconds drawn (Live and Scheduled), the six recordings together; zoom 13, the followed zoom's floor (`Math.max(zoom, 13)`).

| | Rodalies | FGC | TRAM | Metro | Madrid | other núcleos |
|---|---:|---:|---:|---:|---:|---:|
| Train-seconds | 814,758 | 554,936 | 275,597 | 1,487,585 | 864,173 | 456,039 |
| standing | 13.40% | 21.94% | 6.75% | 23.10% | 11.03% | 14.23% |
| **1** drawn at B, card `Left A` | 2.56% | 5.97% | 8.25% | 8.94% | 3.43% | 4.03% |
| **a** drawn at a Station the card hasn't | 3.85% | 7.18% | 10.20% | 11.22% | 3.44% | 4.37% |
| &nbsp;&nbsp;**4** of which not a call | 1.31% | 1.22% | 2.06% | 2.45% | 0.01% | 0.35% |
| **2** pill covers one | 10.36% | 11.64% | 15.33% | 16.23% | 5.26% | 6.26% |
| &nbsp;&nbsp;not a call | 6.50% | 3.16% | 4.04% | 4.68% | 0.02% | 0.58% |
| **2** pill and arrow cover one | 14.83% | 15.40% | 27.33% | 24.68% | 6.75% | 8.54% |
| &nbsp;&nbsp;next call | 4.83% | 11.22% | 17.60% | 16.50% | 6.72% | 7.58% |
| &nbsp;&nbsp;next call within braking distance | 4.83% | 11.22% | 17.60% | 16.06% | 6.72% | 7.58% |
| &nbsp;&nbsp;not a call | 9.99% | 4.18% | 9.73% | 8.18% | 0.02% | 0.95% |
| `now` reads | 11.33% | 30.20% | 29.33% | 45.11% | 18.04% | 17.23% |
| **b** `now`, Train more than 200 m short | 2.66% | 6.57% | 4.56% | 9.61% | 5.01% | 4.58% |
| &nbsp;&nbsp;**3** by the minute alone | 2.66% | 6.46% | 4.56% | 9.61% | 4.98% | 4.57% |
| &nbsp;&nbsp;**5** by the Delay | 0.01% | 0.12% | 0.00% | 0.00% | 0.03% | 0.01% |
| **5** drawn ahead of its Delay by more than 20 s | 0.46% | 2.09% | 3.94% | 1.85% | 4.17% | 1.09% |
| **5** drawn behind it by more than 20 s | 0.34% | 1.05% | 1.33% | 0.15% | 0.61% | 0.54% |
| **5** either, more than 60 s | 0.00% | 0.00% | 0.00% | 0.04% | 0.00% | 0.00% |

Of the Live Train-seconds, a pin as `confirmed N s ago` names (cause 6):

| | Rodalies | FGC | TRAM | Metro | Madrid | other núcleos |
|---|---:|---:|---:|---:|---:|---:|
| Live Train-seconds | 565,608 | 521,033 | 254,392 | 1,182,909 | 785,783 | 304,268 |
| pinned, confirmed within 30 s | 21.20% | 0.22% | 0.00% | 0.00% | 25.48% | 32.19% |
| &nbsp;&nbsp;within 200 m of it | 6.18% | 0.14% | | | 5.91% | 10.37% |
| &nbsp;&nbsp;200–500 m | 2.43% | 0.07% | | | 2.97% | 5.08% |
| &nbsp;&nbsp;500 m–1 km | 3.23% | 0.01% | | | 4.50% | 5.62% |
| &nbsp;&nbsp;1–2 km | 4.46% | 0.00% | | | 6.46% | 5.52% |
| &nbsp;&nbsp;more than 2 km | 4.91% | 0.00% | | | 5.64% | 5.59% |
| &nbsp;&nbsp;drawn short of it by 200 m or more | 8.33% | 0.00% | | | 14.55% | 12.30% |
| &nbsp;&nbsp;drawn past it by 200 m or more | 6.69% | 0.08% | | | 5.02% | 9.51% |

How soon, of those `now` seconds with the Train more than 200 m short, the drawn Train gets there: 20 s or less 0.00 to 0.27% of Train-seconds, 20–40 s 1.9 to 6.8%, 40–60 s 0.6 to 2.7%, over 60 s 0 to 0.2%. The weekday and Saturday recordings differ little in 1 to 5 (1: 2.5/6.0/8.3/9.0/3.5% against 2.7/6.0/8.2/8.9/3.4%; 3: 2.3/6.8/4.7/9.6/5.0% against 3.0/6.1/4.1/9.6/5.0%); the pins differ a lot, 7% of Live seconds against 31% (Rodalies) and 15% against 40% (Madrid), which this doesn't explain: the pin figures are the Saturday's more than the weekdays'.

At other zooms, pill and arrow cover a Station the card doesn't have the Train at, for each Network at zoom 11 / 13 / 15: Rodalies 39 / 15 / 3%, FGC 53 / 15 / 6%, Madrid 21 / 7 / 3%, and those not a call 28 / 10 / 0.7% (Rodalies), 21 / 4 / 1.0% (FGC), 2.7 / 0.0 / 0.0% (Madrid). TRAM's and the Metro's pills start at zoom 12, so 11 isn't theirs; at 15, 6% and 8%, those not a call 0.5% and 1.5%.

## 3. Each cause on its own

### 1. No grace in the words

By construction a card says `Left A` from A's departure to B's arrival, the whole leg. It's a mismatch only near B: 50 m is about 10 s of braking (the Network's `braking` 1 to 1.3 m/s²), so each stop costs one such stretch, and 2.5 to 9% of Train-seconds follow. For 7 to 23% of Train-seconds a Train stands at a Station while the header says *Next station* with the departure time beside it: not wrong, but the label lags what the strip's `train` mark says. Fix: words from the drawn motion, card only (a threshold in metres or seconds, below).

### 2. The pill reaches a Station before the Train does

At zoom 13 the followed pill is 11 to 18 px either side of the Train, 80 to 130 m on the ground, 180 m with its arrow. Of the Train-seconds it covers a Station the card doesn't have the Train at, the Station is the next call in 33% (Rodalies, where most of the rest is a Station it passes), 73% (FGC), 64% (TRAM), 67% (Metro) and 99% (Madrid), and 97 to 100% of those are within braking distance of it, which is a kilometre for Rodalies' 160 km/h and 156 m for TRAM's 70. So the same words as 1 cover it, if the threshold is the pill's reach and not the braking distance: at zoom 13, 130 m or about 15 s. That a pill is drawn over a Station a viewer then reads as `Left A` is 4.8% (Rodalies) to 17.6% (TRAM) of Train-seconds with its arrow.

### 3. `now` early by up to a minute

The countdown floors by the clock's minute (`minutesTo()`: a time that is 16:42 reads `now` from 16:42:00, as the time beside it does). 98 to 100% of `nowFar` is that alone, and it is 20–40 s early in 70 to 78% (the leg's last 200 m at line speed is 10 to 20 s), 40–60 s in 22 to 25%. The Delay is not what makes `now` early (cause 5, 0.12% at most). Fix: a countdown in seconds for the followed Train from the last minute, or the words of 1.

### 4. Stations passed without stopping

227 of 950 of Rodalies' Trips on 7 October pass within 30 m of a Station they don't call at, between their first call and last (R11 46 of 48, R15 39 of 40, R16 20 of 22, R17 6 of 6, R2S 66 of 143, R4 33 of 156), 590 of 2,043 of FGC's (S1 and S2 all 235 each, passing the funicular's Vallvidrera Inferior; R5, R6, R50 and R60 120 of 135), 448 of Metro's 4,366 and 19 of Madrid's 1,280. The drawn Train is at one for 1.2 to 2.5% of Train-seconds (not Madrid's), and under its pill for 3 to 6.5%; words from the motion can't say it, since the Train doesn't brake. A strip can't name a Station that isn't a call, but the engine has `passes()` at build and the page has each Station's place and the Trip's calls: a card can say `Passing X` where the Train is within the pill's reach of a Station not among its calls (card only, runtime, no new data).

### 5. Times follow the Delay, the drawn Train eases to it

The engine's `delay` (`OnMap.delay`, `src/engine.ts:370`) is only an output: `trainAt()`, `comingAt()`, `boardAt()` and `nearbyAt()` read it, the drawn position doesn't (`timeAt`/`place` don't), so what a card's time says and where the Train is drawn can differ by how far the eased `time` is from `now − delay`. It does for 0.5 to 4.2% of Train-seconds by more than 20 s, and less than 0.1% by more than a minute. Why isn't measured here: the easing is short (EASE 20 s) and ADR-0002 keeps a Train from running back, so a Train drawn ahead of its Delay would wait where it is while its Delay catches up. `max(delay, now − time)` for every Train (the body's option) removes the drawn-behind seconds and leaves the ahead ones: `nowFar` 2.66 to 2.64% in Rodalies, 9.61 to 9.29% in the Metro, so it's not worth a ticket alone.

### 6. Live data's Station against the drawn one

A report that pins a Train to a Station (Renfe's `STOPPED_AT` and `INCOMING_AT`, Geotren's standing) counts as confirmed and doesn't hold the Train there (ADR-0002, `live.near: 'pinned'`). It's 21 to 32% of Renfe's Networks' Live seconds. Of those the Train is drawn within 200 m of it in 29% (Rodalies), 23% (Madrid) and 32% (the other núcleos); in 71%, 77% and 68% it's more than 200 m, and in about a third of those more than 2 km. Where the card says `confirmed 5 s ago`, it's confirming a Station the Train is not drawn at. The engine moves a Train by a pin's Delay only until its next GPS (`delayOf()`, `near !== 'pinned'`); no words can make that right. FGC's Geotren pins (standing) are 0.22% of Live seconds, and 35% of those are away. TRAM's pins are platform numbers and aren't counted.

## 4. What each fix costs, and what it does to the Delay measures

Nothing below changes where a Train is drawn: a card's words, its countdown and a mark on the map read `trainAt()`, never feed `place()`. The drawn Trains are the same second by second, so jumps, stalls and drawn-ahead stay as they are (#46's lesson holds where a rule changes *when a Train leaves*; none here does). The baseline in the same pass, on the six recordings, Live Trains in both seconds:

| | Rodalies | FGC | TRAM | Metro | Madrid | other núcleos |
|---|---:|---:|---:|---:|---:|---:|
| jumps per Live Train-minute | 0.088 | 0.040 | 0.023 | 0.002 | 0.204 | 0.097 |
| Live Train-seconds still more than 20 m from a call | 0.71% | 2.86% | 18.19% | 3.89% | 4.26% | 1.75% |
| stalls of 30 s or more | 62 | 160 | 262 | 296 | 736 | 86 |

(TRAM's stalls are #343 and #344's; Madrid's jumps #410's GPS.)

| Fix | Covers | Leaves | Cost |
|---|---|---|---|
| **Words from the drawn motion:** `Arriving at B` within the pill's reach or a number of seconds of B, `At B · leaves 10:42` standing, `Leaving A` within as far after A, `Between A and B` otherwise. | Cause 1 (2.5 to 9% of Train-seconds) and the next-call part of 2 (33 to 99% of it). | Passed Stations (4), `now` (3), pins (6). | Card only: `strip()`'s `left` and the next row's label, five languages (#299), tests on `cards.ts`. The threshold is a pick: the speed model's braking distance (97 to 100% of the next-call part of 2, but a kilometre for Rodalies, so `Arriving` for a minute) or the pill's own reach (130 m at 13; follows the zoom) or 15–20 s. |
| **A countdown in seconds for the followed Train,** from its last minute (`in 40 s`), the board's minutes unchanged. | Cause 3 (2.7 to 9.6%) and with it `nowFar` to 0.01 to 0.12% (5). | | Card only: `countdown()`'s phrase and a once-a-second refill (already there). |
| **`max(delay, now − time)` for every Train.** | The drawn-behind seconds of 5 (0.15 to 1.3% more than 20 s). | The drawn-ahead ones (0.5 to 4.2%): the card's time is later than the Train's. Boards use the same Delay, so a board's times move with it. | One line in `onMap()`. The numbers say it isn't worth a ticket by itself. |
| **Name the Stations passed without stopping:** `Passing X` where the Train is within reach of a Station not among its Trip's calls. | Cause 4 (1.2 to 2.5%; 3 to 6.5% under the pill). | | Card only, at runtime (Stations are on the page already); or at the build, `passes()` marking a Trip's. |
| **The card's next Station marked on the map** (a ring at B). | Where the pill covers B's dot: the Station is named in the card and found on the map. | The pill still covers it. | Map code: a layer, a style expression, #254's ring; a runtime check at the follow zoom. |
| **A pin's Station named as Renfe's**, or `confirmed` dropped from a pinned report. | The card agreeing with the pin's meaning (6). | The Train is drawn where its Delay has it. | Words only. Moving the Train to the pin is #233's long-pin ticket and an engine change that moves jumps and stalls. |

## 5. Picks for the maintainer

1. **How near is `Arriving at B`?** Braking distance by the speed model (every pill-covered B, but up to 1 km for Rodalies), the followed pill's reach (about 130 m at zoom 13: it matches what the eye sees), or a time (15–20 s, the leg's last stretch)? The least surprising default is the pill's reach: `Arriving` exactly where the pill is on B's dot.
2. **Is `now` early by the minute a bug or the clock's rule?** The followed Train's countdown could read `in 40 s` from 59 s out and keep minutes for a board. Or only the words of 1 (`Arriving at B` replaces `now` while the Train isn't there).
3. **Name the Stations a Train passes without stopping?** `Passing X` in the card (where the Train is within reach), told apart in the strip, or not at all (1.2 to 2.5% of Train-seconds; most of the Metro's and Rodalies' R11, R15, R16).
4. **Cause 6: let it be, or reword?** The pins are the engine's (ADR-0002 draws the Train by its Delay, not at the pin); the card says `confirmed` for them. Say `Renfe: at B` or drop the `confirmed` for a pinned report, or leave it for #233's long-pin ticket.
5. **Whether any of it is built before #356.** #356 changes `now` that `countdown()` counts to (the map's time, `mapTime()`); every fix above takes `at`, as `Moment.at` does, so either order works. The followed Train's seconds countdown should take the map's time too.

## 6. How to replay one

```
npm run card-vs-map -- <dir> [<dir>...]     # a dir with bundle.json and replay.json.gz, as `npm run record` writes
LIMIT=300 ZOOM=14 npm run card-vs-map -- <dir>
```

It prints one JSON of counts in Train-seconds, by recording and Network, `all` and `live`. `src/cardVsMap.test.ts` pins the definitions on a made-up Trip. A Record run's artifact is a `bundle.json` and a `replay.json.gz`; the same line is in #414's release notes.
