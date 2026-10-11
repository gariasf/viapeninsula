# A followed Train's card against the Train drawn on the map

Research for #352, under #234 (part of #1). It builds on [ADR-0002](../adr/0002-timetable-drives-motion.md) (the timetable drives motion, a Train never runs back), #233's audit (its replay method, and its long pins, #233's first follow-up), and #335/#356 (the clock the minutes to go count by). Nothing in the map changed: the measure is `src/cardVsMap.ts` (the yardstick, with tests) and `src/cardVsMapRun.ts` (`npm run card-vs-map -- <dir>...`), as `jumps()` is one for jumps.

- **Base:** origin/main `c97cf8e`, 10 October 2026.
- **Recordings:** the Record workflow's runs 37533038357 (Tue 6 Oct 23:19), 37618244697 (Wed 7 Oct 14:03) and 37646767458 (Wed 7 Oct 17:47), and the three Saturday ones of 10 Oct: 10:38–10:52 and 11:04–11:49 (by hand, #414's two) and run 38047796026 (13:16–14:01). 14,261 s of replay in all, Rodalies, FGC, TRAM, the Metro and the Cercanías núcleos of those days, each recording with that day's whole `bundle.json`; the Networks' live traits are `src/networks.ts`'s now. The six are kept privately, as zips on the maintainer's Mac (#414; [punctuality.md](punctuality.md)'s "Files kept" says where, and what their sources allow), and section 6 says how to replay one.
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
- **After #455** (11 October 2026, section 7): the card says `Arriving at B`, `At B · leaves 10:42`, `Leaving A` or `Between A and B` by how far the Train is drawn from its Stations against the followed pill's reach. Causes 1 and 2's next-call counts are 0 on the six recordings at zoom 13 under the measure as #455 changed it (Stations as the dots the map draws, where 0 follows from the card's rule), and under sections 1 and 2's (each Station by its own coordinates) 0.00 to 0.02% but the Metro's 0.19% and 0.38%. The Delay measures are what they were.
- **After #456** (11 October 2026, section 8): the followed Train's countdown reads whole seconds from 59 s out, and `now` only once its time has come, by the map's time; a board's rows and Nearby's keep their minutes. The minute-reading card's `now` with the Train over 200 m short, 2.7 to 9.6% of Train-seconds, is `in N s` in all but the Delay's 0.00 to 0.12%, which is the ticket's `nowByDelay`: `nowByMinute` is 0 by the rule. What the minute hid shows: the card's time stepping by a new Delay, by more than 10 s every 50 s of TRAM's countdown, 273 s of the Metro's.
- **After #457** (11 October 2026, section 9): where the Train is drawn within the followed pill's reach of a place on the map that none of its Trip's calls is at, nor named as one, and neither Station of its calls is within it, the strip's Train row says `Passing X` in place of `Between A and B`: 2.75% (Rodalies), 0.39% (FGC), 0.11% (TRAM), 0.96% (Metro), 0.02% (Madrid) and 0.44% (other núcleos) of Train-seconds at zoom 13. `4.atNotCall` goes from 1.07 / 1.44 / 2.48 / 2.70 / 0.01 / 0.35% to 0.40 / 1.33 / 2.48 / 2.24 / 0.00 / 0.12%. What is left is the Train at its own Station with another place's dot within 50 m, and, of the seconds it says `Between`, a place named as one of its calls, which it doesn't name by design (0 / 0.12 / 0.34 / 0.18 / 0 / 0%). Most of the places named are another Network's (a Rodalies or Metro Train over a metro or tram stop), which the ticket's words allow. The Delay measures are what they were.

## 1. What is measured, exactly

`differences()` (`src/cardVsMap.ts`) takes one Train at one second. Its card is: `next` the first call with a departure still to come, `standing` when `standsAt`, `lastLeft` the call before it when it doesn't stand (the card's `now · Left A`), and `has` the Station the card has it at, `next` standing, `lastLeft` otherwise. A Station is named by its place (`place`, else its name), as the map shows it.

That is the measure as #352 built it. Since #455 `differences()` takes the card's words from `whereabouts()` and a Station as the place the map shows it as, a dot at the middle of its Stations (section 7). Since #456 it also reads the followed Train's countdown by `countdownTo()`, by the map's time; `readsNow`, `nowFar`, `nowByMinute` and `nowByDelay` stay the minute-reading card's, which is what a board's rows say (section 8).

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
(cd .cache/recordings-2026-10 && shasum -a 256 -c SHA256SUMS)   # the maintainer's zips, gitignored: a clone doesn't have them
mkdir -p rec && unzip -q .cache/recordings-2026-10/recording-2026-10-10-1316.zip -d rec/recording-2026-10-10-1316
npm run card-vs-map -- <dir> [<dir>...]     # a dir with bundle.json and replay.json.gz, as `npm run record` writes (rec/recording-2026-10-10-1316 above)
LIMIT=300 ZOOM=14 npm run card-vs-map -- <dir>
STATIONS=1 npm run card-vs-map -- <dir> [<dir>...]   # each Station by its own coordinates, as sections 1 and 2 had them (#455)
```

It prints one JSON of counts in Train-seconds, by recording and Network, `all` and `live`. `src/cardVsMap.test.ts` pins the definitions on a made-up Trip. A Record run's artifact is a `bundle.json` and a `replay.json.gz`, with the feeds' own `trip_updates.json` and `vehicle_positions.json`. The folder keeps each as the zip Actions served, and the two by hand on Saturday, which Actions never had, zipped the same way, with a `SHA256SUMS`. The six recordings above, replayed together, give section 2's Train-seconds to the unit. `jumps()` and `trainsAt()` on a recording's `replay.json.gz` are in [punctuality.md](punctuality.md)'s "Re-verify quickly".

## 7. After #455 (11 October 2026)

#455 built the first row of section 4's table. `whereabouts()` (`src/web/cards.ts`) says `standing`, `arriving`, `leaving` or `between` from how far the Train is drawn from the Station it comes to and the one it left, against the followed pill's reach (`pillReach()`, `src/web/pill.ts`, which holds `boxOf()` and the pill's sizes now, so the card, the map's pill and this measure go by one definition and the measure's own copy of `boxOf()` is gone). A Station is as far from the Train as the nearer of how far along its Trip it is and how far it's drawn from its place's dot, which at an interchange is the middle of its Stations and not where a Line's Trains stop. Where both Stations are within reach, as on a short leg, it says arriving. The header's next Station is labelled `Arriving at` or `At station`, with `leaves` before its time, and the strip's Train row says `Arriving at B`, `Leaving A` or `Between A and B`.

The measure took two changes, so that it counts what the map draws. A Station is the place the map shows it as, at the middle of its Stations (`places()`; the map draws one dot a place, in its `stations` source), not each Station by its own coordinates; and the arrow, which points ahead, covers no Station the Train has left. Its box and metres per pixel are the card's now, which moves the counts by 0.02 points at most (long-distance Lines' pills are round on the map, and were badges in the measure's own copy of `boxOf()`). Sections 2 to 4's numbers stand as they were (origin/main `833d09a` and `62f065c` reproduce them to the Train-second, jumps and stalls too).

Each change on its own, for causes 1 and 2's next call under the pill, and the pill and arrow (share of Train-seconds, zoom 13, Rodalies / FGC / TRAM / Metro / Madrid / other núcleos). Stations by their own coordinates are sections 1 and 2's, and what `STATIONS=1 npm run card-vs-map` counts (the old card's columns are those sections', from the measure as #352 built it); the dots are the map's. The arrow's filter moves no next-call count:

| | Stations, old card | dots, old card | Stations, new card | dots, new card |
|---|---|---|---|---|
| **1** drawn at B, the card not arriving there | 2.56 / 5.97 / 8.25 / 8.94 / 3.43 / 4.03 | 2.56 / 5.94 / 8.25 / 7.36 / 3.43 / 4.03 | 0.00 / 0.01 / 0.00 / 0.19 / 0.00 / 0.00 | 0 |
| **2** the pill covers the next call, the card doesn't have it | 3.86 / 8.48 / 11.29 / 11.55 / 5.24 / 5.67 | 3.91 / 8.44 / 11.28 / 9.91 / 5.24 / 5.67 | 0.00 / 0.02 / 0.00 / 0.38 / 0.00 / 0.00 | 0 |
| pill and arrow cover the next call | 4.83 / 11.22 / 17.60 / 16.50 / 6.72 / 7.58 | 4.94 / 11.18 / 17.58 / 14.94 / 6.72 / 7.57 | 0.88 / 2.56 / 6.26 / 4.99 / 1.38 / 1.77 | 0.94 / 2.53 / 6.26 / 4.01 / 1.38 / 1.77 |

Under the dots the two 0s are not a finding: the card says arriving where a place's dot is within the pill's reach, and the count asks whether one is. What that column checks is that the code does it, on every Train of every Network. The Stations column is the finding. Its Metro residue is a Train within the pill's reach of another Line's Station of the place it comes to (La Sagrera, Verdaguer, Passeig de Gràcia, Espanya, Diagonal, Maragall), 23 to 58 m from it, with its own platform 100 to 340 m on and the dot 100 to 200 m off, where the map draws no mark; FGC's is the same at Sabadell Nord, where Renfe's Station and FGC's share a place, and the few seconds elsewhere are the 0.1% between the old metres per pixel and the card's. Four recordings the rule was not tried on (6 Oct 17:13, 7 Oct 02:09, 10 Oct 16:34 and 17:57, 999,000 Train-seconds) give 0.19% and 0.36% for the Metro, 0.01% and 0.02% for FGC and 0.00% for the rest.

The same six recordings under the dots, before the card's words and after:

| | Rodalies | FGC | TRAM | Metro | Madrid | other núcleos |
|---|---:|---:|---:|---:|---:|---:|
| **1** drawn at B, card `Left A` | 2.56 → 0 | 5.94 → 0 | 8.25 → 0 | 7.36 → 0 | 3.43 → 0 | 4.03 → 0 |
| header `Next station` while standing | 13.40 → 0 | 21.94 → 0 | 6.75 → 0 | 23.10 → 0 | 11.03 → 0 | 14.23 → 0 |
| **2** pill covers the next call, the card doesn't have it | 3.91 → 0 | 8.44 → 0 | 11.28 → 0 | 9.91 → 0 | 5.24 → 0 | 5.67 → 0 |
| pill and arrow cover it | 4.94 → 0.94 | 11.18 → 2.53 | 17.58 → 6.26 | 14.94 → 4.01 | 6.72 → 1.38 | 7.57 → 1.77 |
| pill covers another call, or the one just left | 0.00 → 0.00 | 0.00 → 0.00 | 0.00 → 0.00 | 0.00 → 0.01 | 0.00 → 0.00 | 0.01 → 0.01 |
| pill covers a Station that isn't a call (#457's) | 3.65 → 3.85 | 3.23 → 3.81 | 3.73 → 4.79 | 4.92 → 5.39 | 0.02 → 0.02 | 0.58 → 0.59 |

(The Station that isn't a call grows because the next call, which came first as the nearest the card hadn't named, is named now, and a count takes the nearest.)

What the card says, of Train-seconds: `Arriving at` 4.07 / 8.70 / 11.58 / 11.89 / 5.34 / 5.85%, `At` 13.40 / 21.94 / 6.75 / 23.10 / 11.03 / 14.23%, `Leaving` 3.79 / 8.86 / 13.31 / 10.23 / 4.68 / 5.50% and `Between` 78.74 / 60.50 / 68.35 / 54.77 / 78.95 / 74.43%. Its words change 0.7 (Rodalies), 1.5 (FGC), 1.9 (TRAM), 2.1 (Metro), 0.9 (Madrid) and 1.0 times a Train-minute. One that comes straight back within 10 s is 15, 10, 4, 78 and 14 times outside the Metro, every one the drawn Train snapping back (the card follows it), and 86 times in the Metro's 52,662 changes, all of them L3's at Passeig de Gràcia, whose Station is 204 m from its place's dot, more than two reaches (146 m for a badge): 35 `Arriving`, `Between`, `Arriving` (5 to 9 s) where the dot is before the platform, 40 `Leaving`, `Between`, `Leaving` (3 to 7 s) where it's after, and 11 `Between` coming back. That is one blink a passage; the platform alone has none, and a pill's reach widened along the track to take in both the dot and the platform has none either, at 12.23% of the Metro's Train-seconds `Arriving` against 11.89%.

The pill alone is what the card goes by, as picked on #352; its arrow stands 7 px further, and covers the next Station's dot while the card says `Between` for the 0.94 to 6.26% above. At zoom 11 the counts of 1 and of the pill on the next call are 0 too (the reach is 4 times as long on the ground, and `Arriving` 10 to 24% of Train-seconds), with the Station just left under the pill, unnamed, for 3.3% of FGC's, 1.1% of the núcleos' and 0.3% of the Metro's. At zoom 15, where the pill reaches 22 to 32 m, `1` is 0.23 to 1.57%, as `AT` is 50 m, 28 px there: the yardstick's, not the card's. The Delay measures are as before, to the second (jumps 831, 347, 98, 32, 2,675 and 490; stalls of 30 s 62, 160, 262, 296, 736 and 86): nothing here reads `place()`.

## 8. After #456 (11 October 2026)

#456 built the second row of section 4's table. `countdownTo()` (`src/web/cards.ts`) gives the followed Train's countdown to its next Station's time as the card shows it, the Delay in, by the map's time (`mapTime()`, #356): whole seconds from 59 s out, rounded up, so that it reads 0, which the card says as `now`, only once the time has come or is past, and before that the whole minutes a board gives for that time (`minutesTo()`), so the card and a board agree to the minute, but for a time 59 s and a part out within one clock minute, which a board reads as `now`. It's the header's next Station row (`in 40 s`; `d'aquí a 40 s`, `en 40 s`, `40 s barru`, `en 40 s`) and, for a Trip still to come (#322), its status line and next Station row too; a board's rows and Nearby's are as they were. A card counting seconds is refreshed as each second of it ends (`untilTick()`), where it was refreshed a second and a frame after its last, which skipped a number about every two minutes. It changes the one text node, in the refresh the panel already has once a second (the one `confirmed 12 s ago` changes in), and wakes nothing on the map: a followed Train keeps the map's loop at every frame anyway, and the panel isn't a live region, so nothing is announced.

The measure keeps #352's column as it was, the minute-reading card's, which is what a board's rows say (`b.nowFar`, `3.nowByMinute`, `5.nowByDelay`: all 4,123 values of the six recordings, the Delay measures among them, are equal on #455's tip and on the branch), and reads the new card by the function the page calls, for the same seconds. It counts by the map's time, as main.ts does since #356; `behind()` is 0 in every second of the six recordings, so that's the device's second there. The real `trainAt()`, with `countdownTo()` and `mapTime()`, was asked for 107,311 sampled Train-seconds of the six: the measure's reading and card's time are the page's in every one.

Share of Train-seconds at zoom 13 (Rodalies / FGC / TRAM / Metro / Madrid / other núcleos; the six recordings, 14,261 s):

| | Rodalies | FGC | TRAM | Metro | Madrid | other núcleos |
|---|---:|---:|---:|---:|---:|---:|
| **3** `now` read by the minute-reading card, the Train over 200 m short (`nowFar`) | 2.66% | 6.57% | 4.56% | 9.61% | 5.01% | 4.58% |
| &nbsp;&nbsp;by the minute alone (`nowByMinute`) | 2.66% | 6.46% | 4.56% | 9.61% | 4.98% | 4.57% |
| &nbsp;&nbsp;by the Delay (`nowByDelay`) | 0.01% | 0.12% | 0.00% | 0.00% | 0.03% | 0.01% |
| the same seconds, the countdown reads `in N s` | 2.65% | 6.45% | 4.56% | 9.60% | 4.98% | 4.57% |
| &nbsp;&nbsp;N of 10 or less / 11–20 / 21–40 / 41–59 | 0.00 / 0.01 / 2.06 / 0.59 | 0.12 / 0.36 / 4.35 / 1.62 | 0.01 / 0.15 / 1.94 / 2.45 | 0.00 / 0.09 / 6.67 / 2.85 | 0.03 / 0.07 / 4.04 / 0.84 | 0.02 / 0.04 / 3.43 / 1.07 |
| the same seconds, it reads `now` | 0.01% | 0.12% | 0.00% | 0.00% | 0.03% | 0.01% |
| the countdown reads `now`, the Train over 200 m short (`s.nowFar`) | 0.01% | 0.12% | 0.00% | 0.00% | 0.03% | 0.01% |
| &nbsp;&nbsp;with the card's time not come (`s.nowByMinute`) | 0 | 0 | 0 | 0 | 0 | 0 |
| `now` is read: the minute-reading card → the countdown | 11.33 → 0.03% | 30.20 → 0.69% | 29.33 → 2.45% | 45.11 → 2.30% | 18.04 → 0.12% | 17.23 → 0.08% |
| the countdown is in seconds, the one text node changing every second | 29.01% | 55.96% | 54.22% | 75.27% | 32.54% | 37.09% |

What each 0 proves. `s.nowByMinute` is 0 because the rule has the countdown read `now` only where the card's time has come: by construction. What it checks is that the measure counts with the card's own function and the card's own time, which the 107,311 Train-seconds above show; `cardVsMap.test.ts` pins a second the minute-reading card read `now` in by the minute, which the countdown reads `in 5 s` in, and `cards.test.ts` the rounding at each edge. The two identities are the rule too: the seconds the minute-reading card read `now` by the minute are those the countdown reads `in N s` in, but for 12, 9, 10, 10, 15 and 14 Train-seconds (0.00% of each Network's), a time 59 s and a part out within one clock minute, which it reads `in 1 min` as it hasn't come (`b.nowFar.reads.minutes`), and those it still reads `now` in are exactly `nowByDelay`. What can't be 0 is `nowFar`, which the ticket has at 0 beside `nowByDelay` at most 0.12%: it holds the Delay's seconds, a Train whose card's time has come while it's drawn short of the Station (cause 5, which no countdown mends), so it is `nowByDelay`: 55, 646, 3, 19, 236 and 64 Train-seconds, FGC's 0.12%.

What the seconds show that the minute hid, neither the countdown's rounding but cause 5 and the Delay's steps:

| | Rodalies | FGC | TRAM | Metro | Madrid | other núcleos |
|---|---:|---:|---:|---:|---:|---:|
| the Train drawn within 50 m of its next Station, not standing there (`s.atNext`) | 2.56% | 5.94% | 8.25% | 7.36% | 3.43% | 4.03% |
| &nbsp;&nbsp;the minute-reading card read `now` | 1.99% | 5.01% | 7.18% | 6.53% | 3.19% | 3.48% |
| &nbsp;&nbsp;the countdown reads `now` | 0.02% | 0.36% | 2.09% | 0.15% | 0.05% | 0.04% |
| &nbsp;&nbsp;it reads over 10 s (braking the last 50 m takes 9 to 10 s) | 0.04% | 0.43% | 1.81% | 0.93% | 0.19% | 0.28% |
| &nbsp;&nbsp;it reads over 20 s | 0.01% | 0.14% | 0.39% | 0.20% | 0.11% | 0.07% |
| of the seconds it counts in seconds, its time stepped by a new Delay, more than 2 s | 0.25% | 0.49% | 3.53% | 1.16% | 0.23% | 0.37% |
| &nbsp;&nbsp;more than 10 s | 0.03% | 0.35% | 1.99% | 0.37% | 0.08% | 0.06% |
| &nbsp;&nbsp;once every ... of countdown, more than 2 s / more than 10 s | 406 s / 3,052 s | 204 s / 284 s | 28 s / 50 s | 86 s / 273 s | 434 s / 1,286 s | 274 s / 1,611 s |

At its Station the card is better than it was. The minute-reading card read `now` in 78% (Rodalies) to 93% (Madrid) of the seconds a Train was drawn within 50 m of its next Station, and a minute or more in the other 7 to 22%, which a Train 10 s from stopping makes up to 50 s wrong. The countdown reads over 20 s in 0.4% (Rodalies), 2.3% (FGC), 4.7% (TRAM), 2.7% (Metro), 3.3% (Madrid) and 1.8% of them: the Train drawn ahead of its Delay, as `drawnAhead20` of section 2 (0.5 to 4.2% of all Train-seconds). And the card's time stepping by a new Delay was always there under the minute: a minute hid it, a second shows it. The drawn Train eases to a new Delay over 20 s (`EASE`) and the card's time goes to it at once, where a number can jump: every 28 s of TRAM's countdown by more than 2 s and every 50 s by more than 10 s, the Metro's every 86 s and 273 s, FGC's every 204 s and 284 s, Rodalies' and Madrid's every 7 minutes by more than 2 s. All but 18 of the Metro's 13,218 steps are Live Trains' (the 18 are Scheduled ones), and every other Network's are all Live Trains'. The Delay measures are what they were, to the second: jumps 831, 347, 98, 32, 2,675 and 490, stalls of 30 s 62, 160, 262, 296, 736 and 86 (nothing here reads `place()`).

## 9. After #457 (11 October 2026)

#457 built the fourth row of section 4's table. `whereabouts()` (`src/web/cards.ts`) has a fifth word, `passing`, and `passedPlace()` picks what it names. The Train is passing a place where it is drawn within the followed pill's reach (#455's `pillReach()`) of the dot of a place on the map that none of its Trip's calls is at, and neither of the Stations the card would name, the one it comes to and the one it left, is within that reach: it is `Between A and B` that becomes `Passing X`, so arriving, standing and leaving are as #455 made them, and the header's next Station, its time and its countdown stay its next call's. The strip's Train row says it (`Passing X`, `Passant per X`, `Pasando por X`, `X geltokitik igarotzen`, `Pasando por X`), as it says `Leaving A`. The place is the nearest of the places the page has, of any Network, by the name the map shows it with, that isn't one of the Trip's calls, as the Train runs it (`cutTrip()`: a Station its operator has said it won't stop at is not one, so it's passed), nor named as one: to a viewer a Station is its name, and the Metro's Glòries and the TRAM's are two places the map shows apart. No build change, no new data.

The measure runs the same functions. The runner picks the place with `passedPlace()` over the places' dots, whichever Stations `4.atNotCall` counts by, and `differences()` names it as the Station the card has the Train at, so a place it names is not counted as one it hasn't. `4.atNotCall` is what #352 counted: the nearest place within 50 m that the card hasn't named and the Trip has no call at, by the place's key; the card's rule has one more exception than that, a place named as a call. Beside it the runner splits what's left by whether the place is one the Train's own Network's Trains stop at (`.own`) or only another Network's (`.other`), by what the card says, and by whether it's named as a call, and counts the card as it was before the place was named in the same run (`.before`), so that the old column stays visible.

Share of Train-seconds at zoom 13 (Rodalies / FGC / TRAM / Metro / Madrid / other núcleos; the six recordings, 14,261 s):

| | Rodalies | FGC | TRAM | Metro | Madrid | other núcleos |
|---|---:|---:|---:|---:|---:|---:|
| the card says `Passing X` | 2.75% | 0.39% | 0.11% | 0.96% | 0.02% | 0.44% |
| &nbsp;&nbsp;a place its own Network's Trains stop at | 0.44% | 0.21% | 0.11% | 0.10% | 0.02% | 0.44% |
| &nbsp;&nbsp;a place only another Network's stop at | 2.30% | 0.18% | 0.00% | 0.86% | 0.00% | 0.00% |
| &nbsp;&nbsp;within 150 m of the dot of one of its Trip's calls (an interchange) | 0.12% | 0.04% | 0.00% | 0.33% | 0.00% | 0.00% |
| &nbsp;&nbsp;passages, and how long each says it | 1,762 × 12.7 s | 255 × 8.4 s | 34 × 9.0 s | 1,557 × 9.2 s | 20 × 6.5 s | 161 × 12.5 s |
| **4** drawn within 50 m of a place its Trip has no call at, the card not naming it (`4.atNotCall`), before → after | 1.07 → 0.40 | 1.44 → 1.33 | 2.48 → 2.48 | 2.70 → 2.24 | 0.01 → 0.00 | 0.35 → 0.12 |
| &nbsp;&nbsp;of those after, while the card says `Between A and B` or `Passing X` | 0 | 0.12 | 0.34 | 0.18 | 0 | 0 |
| &nbsp;&nbsp;of those after, a place named as one of its calls | 0 | 0.14 | 2.16 | 0.99 | 0 | 0 |
| the pill covers a place the card hasn't named (`2.pill.notCall`), before → after | 3.85 → 1.28 | 3.81 → 3.42 | 4.79 → 4.68 | 5.39 → 4.43 | 0.02 → 0.00 | 0.59 → 0.15 |

The same under each yardstick, `4.atNotCall` (the card as #455 and #456 left it against the card with `Passing`; the dots the map draws against each Station by its own coordinates, `STATIONS=1`, #352's):

| | the dots the map draws | each Station by its own coordinates |
|---|---|---|
| the card before #457 | 1.07 / 1.44 / 2.48 / 2.70 / 0.01 / 0.35 | 1.36 / 1.40 / 2.60 / 2.70 / 0.01 / 0.35 |
| the card with `Passing` | 0.40 / 1.33 / 2.48 / 2.24 / 0.00 / 0.12 | 0.56 / 1.29 / 2.60 / 2.24 / 0.00 / 0.12 |

(The note's own column, section 2's, was 1.31 / 1.22 / 2.06 / 2.45 / 0.01 / 0.35% under the card before #455: the first row's differences from it are #455's words, which name the next Station where the old card didn't, so the nearest place the card hadn't named is no longer that one.)

What the 0 is and isn't. **While the card says `Between` or `Passing` nothing is counted but a place it was made not to name**: by construction, as under #455's 0s, since the card names the nearest place within its pill's reach that isn't a call or named as one, which is 73 m or more at zoom 13 and `4.atNotCall` asks whether one is within 50 m. The count finds what is left, and nearly all of it is the card naming the Train's own Station while another place's dot is within 50 m: standing at it (Rodalies 0.21, FGC 0.74, TRAM 0.83, Metro 1.12%), arriving at it (0.09, 0.22, 0.67, 0.55%) or leaving it (0.10, 0.23, 0.64, 0.40%), an interchange where another railway's or another Line's platform is a place of its own: L5 standing at Cornellà beside Rodalies', L1 at Glòries beside the TRAM's, and FGC's own, the funicular within 50 m of Peu del Funicular and S1 and S2 within 50 m of Vallvidrera Inferior. The card is not wrong there, so `4.atNotCall` is not 0 and can't be by words alone; the box's "where the card says it" is. What the card doesn't name, with the Train between its Stations, is a place named as one of its calls: FGC 0.12, TRAM 0.34, Metro 0.18% of Train-seconds, the TRAM's Glòries and Besòs beside the Metro's, which a viewer would take for the Station it calls at (without that exception `Passing` would be 0.62 / 0.97 / 1.27% of FGC's, TRAM's and Metro's seconds, 89% of TRAM's at an interchange). Under each Station's own coordinates (the yardstick the ticket was written with) one more is left: Rodalies' 0.11% of Train-seconds with the Train between its Stations, within 50 m of a Station's platform whose place's dot, which the card and the map go by, is beyond the pill's reach.

What the card says, of Train-seconds: `Passing` is taken out of `Between` alone (`Between` 78.74 / 60.50 / 68.35 / 54.77 / 78.95 / 74.43% under #455 → 75.99 / 60.12 / 68.24 / 53.81 / 78.94 / 73.99% and `Passing` above; arriving, standing and leaving are the same to the second). The words change 0.92 (Rodalies), 1.55 (FGC), 1.94 (TRAM), 2.21 (Metro), 0.89 (Madrid) and 1.02 times a Train-minute against 0.69, 1.50, 1.93, 2.12, 0.89 and 0.98. A place it passes never comes back within 10 s. Of the words that do come straight back (209, 70, 30, 235, 93 and 49 times), all but #455's own (15, 10, 4, 86, 78 and 14: the drawn Train snapping back, and L3's at Passeig de Gràcia) are `Between A and B` returning after a passage of less than 10 s, which is what a passage is. Of the seconds it says `Passing`, a Live Train stands still in that second (the drawn distance changes by less than 0.1 m) in 0.7% (Rodalies), 3% (FGC), 27% (TRAM) and 6% of the Metro's: TRAM's stalls (#343, #344). Of the seconds the card names the Station it comes to or left, a place it could pass is nearer the Train in 0.06 / 0.03 / 0.00 / 0.14% (arriving) and 0.05 / 0.05 / 0.00 / 0.11% (leaving), where the nearer would say `Passing` instead.

Other zooms. At zoom 11 the pill reaches 4 times as far on the ground and the card says `Passing` for 13.32 / 1.77 / 0.83 / 1.91 / 0.95 / 1.98% of Train-seconds (Rodalies' 3,185 passages of 34 s each: the nearest of the dots a 510 m pill is over); `4.atNotCall` is 0.44 / 1.39 / 2.48 / 2.43 / 0.00 / 0.12%, and of it with the card between its Stations only a place named as a call (0 / 0 / 0.04 / 0.06%). At zoom 15, where the pill reaches 22 to 32 m and `AT` is 50 m, the card says `Passing` for 0.27 / 0.03 / 0.00 / 0.12 / 0.00 / 0.08% and `4.atNotCall` is 0.28 / 1.07 / 0.60 / 1.47 / 0.00 / 0.18%, of which, with the card between its Stations and the place not named as a call, 0.24 / 0.01 / 0.00 / 0.22 / 0 / 0.07%: a Train within 50 m of a dot its pill, which follows the zoom, doesn't reach (#455's third follow-up, the yardstick's `AT` in metres). The Delay measures are as before, to the second (jumps 831, 347, 98, 32, 2,675 and 490; stalls of 30 s 62, 160, 262, 296, 736 and 86): nothing here reads `place()`. Of the other counts of the six recordings (6,316 compared) only those the words move differ: `Between`, the words that change, `4.atNotCall`, `2.pill.notCall`, and the arrow's, whose next call, which came after the place now named as the nearest it covered, is counted as it comes first (`2.arrow.next` 0.94 / 2.53 / 6.26 / 4.01 / 1.38 / 1.77 → 0.98 / 2.56 / 6.26 / 4.13 / 1.38 / 1.77%, `2.arrow.notCall` 8.68 / 5.26 / 11.16 / 9.71 / 0.02 / 0.99 → 6.33 / 4.88 / 11.05 / 8.75 / 0.01 / 0.55%), as section 7 had for the pill.

Which places the card names is a pick (picks.md). A Network's own Stations alone would be 0.45 / 0.21 / 0.11 / 0.10 / 0.02 / 0.44% of Train-seconds, since the places a Rodalies or Metro Train's pill covers are mostly another Network's: a Metro Train over a Rodalies Station, a Rodalies Train over a metro station.
