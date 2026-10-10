# The map's Trains against reality: phantom, doubled, missing and misplaced

Research for #233, under #234 (part of #1). It builds on [ADR-0002](../adr/0002-timetable-drives-motion.md) (the timetable drives motion), [ADR-0003](../adr/0003-live-data-snapshot-on-r2.md) (live data is a snapshot file on R2), [ADR-0010](../adr/0010-beyond-catalonia-cercanias-first-then-long-distance.md) (open feeds only), [ADR-0012](../adr/0012-alerts-in-the-operators-words-and-closures-only-where-the-map-can-place-them.md) (Closures), [punctuality.md](punctuality.md), whose replay method it copies, [live-data-sources.md](live-data-sources.md) and [alerts.md](alerts.md); [card-against-map.md](card-against-map.md) (#352) sets a followed Train's card against the Train drawn on the same recordings, and its cause 6 is this note's long pins from the card's side. It answers the ticket's five boxes in order, and #232's question about FGC's `ENDED` rule. Nothing in `src/` changed. The scripts that made the numbers were throwaway and are not in the repo: section 1's definitions are exact enough to re-derive each figure, and "Files kept" and "Re-verify quickly" say where the recordings are and what the replay does.

- **Date:** Saturday 10 October 2026.
- **Base:** `c97cf8e`, origin/main on the afternoon of 10 October, after #345 (PR #423: no Scheduled Train drawn inside a closed Closure, which a Live Train seen within lifts for its Line), #261 (PR #430: Renfe's long-distance feeds, whose reports name a Train by its number, which the engine matches to that number's Trip in any Network, its own Network's feed first) and #260 (PR #446: long-distance Trains' own speed and snaps, for those two Networks only). The note was first measured on `b3c07a8`, before them; section 11 says what they changed. `src/engine.ts`, `src/jumps.ts` and the fetcher haven't changed since `c97cf8e`, and the four recordings were replayed again on origin/main at `4d7aa1f` (16:31 CEST, after #256's bundle by region, #356 and #352): every Train every second the same. What lands after is pending and not counted; #344's TRAM hold, which waits for Tuesday 13 October's recordings, is the one known (section 11).
- **Recordings:** the Record workflow's, each 45 minutes of the production snapshots as the map received them, one every 20 s, with that day's whole `bundle.json`: run 37533038357 (Tuesday 6 Oct 23:19–00:04, late evening, as units park), 37618244697 (Wednesday 7 Oct 14:03–14:48, midday), 37646767458 (Wednesday 7 Oct 17:47–18:32, the weekday peak) and 38047796026 (Saturday 10 Oct 13:16–14:01, weekend midday). The Saturday's is the first with TRAM's `standing` (#344) and Renfe's `skipped` (#346) in every snapshot, and with every núcleo's Trains on the map.
- **Method:** a copy of `src/engine.ts` outside the repo, with its internals exported and a few probes that only record. Each recording is replayed through it as the Metro measures are (not [punctuality.md](punctuality.md)'s one `onMap()` a snapshot): every second from the first snapshot's arrival to the last (2,681 to 2,699 samples), `onMap(bundle, at, received.filter((r) => r.at <= at), closures).of(trip)` for every Trip of the day that can be on the map or that a report names, as the browser's `trainsAt()` asks. A Train-minute is 60 such seconds. The Networks' live traits are those of `src/networks.ts` now, since the 6 and 7 Oct bundles carry TRAM's `near: standing`, which #343 replaced.
- **Closures:** the page's, as `main.ts` has them: `closuresAt()` of `src/web/closures.ts` once a minute by the map's time, from the bundle's own Closures and the Alerts of 10 October 12:45 UTC, then `hiding()` after each snapshot, with `seenWithin()`'s lift and its memory (`lifted`) empty at the recording's first snapshot (#345).
- **Checked against the repo:** the copy's Train-seconds drawn and Live equal those of the repo's own `trainsAt()` over each recording's whole bundle, Network by Network and FGC Line by Line, in all four and in the weekdays' with their first frames' skipped lists, with no Closure handed to both, with every one shown, and with the page's lift; and its jumps equal `jumps()`'s. With no Closure handed to it, `c97cf8e`'s engine draws what `b3c07a8`'s did in all seven runs (the four, and the three weekdays' again with their first frames' skipped lists), every Train every second: #261 and #260 change nothing here, as no snapshot of these recordings has a report by Train number.
- **Caveats on the days:**
  - 7 October was a day of rain. Renfe flagged 109 (Tuesday), 1,508 and 1,353 (Wednesday) Train-minutes of Rodalies' Trips Cancelled while named, 2 to 34 Trips at a time, none on Saturday. Wednesday's Rodalies figures are a bad day's, and Saturday's are the only ordinary Rodalies sample.
  - The three weekday recordings predate #346's fetcher part, so no snapshot of theirs carries `skipped`: Renfe's cut-short and late-starting Trains are drawn on their whole Trips. Section 6 counts what that changes, with the Stations the first frame of Renfe's trip updates (`trip_updates.json`, which each recording keeps) lists SKIPPED put in every snapshot, as the fetcher's `skippedIn()` makes of one frame.
  - Tuesday's recording crosses midnight with that day's bundle alone, so the 31 Trips Madrid names after 00:00 (its 7 Oct service day) match none (#411). The map joins the days; the replay didn't.
  - The Closures come from the bundle's own (Saturday's bundle only: the 6 and 7 Oct ones predate #340) and from the Alerts of 10 October 12:45 UTC, `alerts.json` read once. Renfe's have no end, and its file hasn't changed since Wednesday 7 October at 09:32 CEST (#390), so what it lists is what the map had on both Wednesdays' recordings and on Saturday's: the Closures that matter are in the repo, in `src/fetcher/fixtures/alerts/renfe.json` (a cut of that file: R1's `AVISO_518348`, R3's `AVISO_518337`, R2's single track `AVISO_518332`). Tuesday night's recording is before it, and is taken to have had what the file lists with a start by then. TRAM's `sc-279` (T5 and T6, Glòries – Can Jaumandreu, which has no track to place it on) is on all four and `sc-280` (T1–T3, Francesc Macià – Montesa) on Saturday's: neither hides a Train in any run.

## TL;DR

- **The map is mostly right about which Trains run.** 163 to 382 Trains are on the map at a time across the four recordings, 76 to 85% of the Train-minutes of them Live. At nine Stations on Saturday at 15:03–15:04, Renfe's own boards list 85 departures from three to 45 minutes ahead and the map's 83; 80 are on both, 76 of those within a minute of each other (section 10).
- **A Train drawn where none runs is rare now.** After #232 the rack has 1.1 to 1.8 Trains Live at a time where it runs, none parked, and only two Trains in the four recordings stand at their last Station beyond their Trip's own dwell there and two minutes, both Madrid's: a C8a at El Escorial, 23.5 minutes against the 15 its Trip gives it, and a C2, 5.7 against 3 (7.2 Train-minutes in all). One TRAM Train, T5 `1987_0384`, was named for the whole of Tuesday night's recording though its 7-minute Trip ended at 23:25, at `along` 574 m in 128 of its 132 reports, and drawn Live and still for 37 minutes (the one #329 saw).
- **The Scheduled Trains no report names are the largest group that may be phantoms, and most of them may not be.** Rodalies draws 146 to 524 Train-minutes of them (3 to 12 Trains at a time), FGC 57 to 130 (its funicular, FV, which Geotren never names, and RL1 and RL2 on some days) and TRAM 0 to 63. On Saturday 135 of Rodalies' 146 are runs that Renfe's long-distance timetable lists call for call, at the same minutes, under another Train number: R15's `30550` is long distance's 17050, `30501` its 17501, R11's `15862` its 15892, and Valencia's C6 `24331` (45 of the other núcleos' 50) its 14461. So they probably run, and Renfe's long-distance feeds (#261) name them by a number the engine can't join them by; those feeds aren't in the recordings, so nothing is counted (section 3). Renfe's boards, read at nine Stations at 15:03 on Saturday, list 10 of the 14 Rodalies Trains the map then drew with no live Train, 6 with a Station-level location; its visor lists none.
- **#345 took one Trip out of the four recordings:** R3's `5178X35534` on Wednesday's midday, 20.6 of the 38.7 Train-minutes of Scheduled Trains the map would have drawn inside a Closure (Renfe pinned it at Puigcerdà, the Closure's end, for 23 minutes, then stopped naming it, and the map drew it Live on into the closed part of the Line for 7 minutes and Scheduled for 21 more). The rest stays because a Closure's lift has it: R1's is lifted from the first snapshot in all three recordings that list it, R3's in two, and without the lift #345 would hide 15.6, 3.6 and 0.7 Train-minutes more. No Live Train is hidden, and nothing else in these recordings moved (section 11).
- **Doubled is the Metro's alone, and small:** a Block's earlier Trip kept drawn beside the Trip it runs now is 0.06 to 1.0% of Live Block-minutes (31 minutes of L4's Block 408 on Saturday). No Train number is drawn twice, and no snapshot has two reports on one Trip.
- **Missing:** #232's `ENDED` rule dropped a real Train once in the four recordings: RL1's 15:52 from Lleida, named 17:46–18:02 on 7 Oct moving along its Trip at the timetable's pace, a steady 100 minutes late (17.8 report-minutes). Its other drops are one parked rack Unit, named by the same Trip all day in both Wednesday recordings. Of the reports that name no Trip, 21 of 25 on Saturday are buses; the rest are 4 rail Trips in Renfe's file that the day's bundle lacks (Cercanías Sevilla's C4 has none), and on each Wednesday one Madrid C2 Train in no timetable the build had, moving. Trains that go quiet and come back Live are 36 to 255 Train-minutes a recording on Rodalies, 57 to 114 on Madrid.
- **Misplaced: Rodalies' long pins and Madrid's GPS.** A Renfe report that names one Station for 10 minutes or more while the Train is drawn more than 3 km from it is 29, 70, 224 and 27 Live Train-minutes of Rodalies' a recording (109 on Wednesday's peak once the Trains Renfe cut short are cut). Cercanías Madrid's GPS fixes snap a Train 24 to 26% of the time, against 7 to 8% on Rodalies and 1 to 2% on FGC, and its Trains jump 0.17 to 0.23 times a Live Train-minute, against 0.07 to 0.08 on Rodalies, 0.09 on the other núcleos and 0.03 to 0.04 on FGC. A snap is a jump, so accuracy and smoothness agree because the same fixes make both: the Network whose Trains are most often moved by their reports is the one that jumps most.
- **Seven rules are worth a ticket**, drafted as `needs-triage` sub-issues of #234 (the PR carries them), in this order: long pins, Madrid's fixes and jumps, `ENDED`'s exception for a Unit moving along its Trip, Trips that long distance's timetable runs under another number, FV's and the Lleida lines' "no live Train", the Metro's Block ghosts, and a TRAM Train named long after its Trip. Two findings are comments on tickets that exist: on #412, which Trips Renfe names that the day lacks, and on #442, the Train numbers that two Networks have. The rest is fine, or can't be fixed from open data.

## 1. What is measured, exactly

A **Train** is drawn at a second when `of(trip).train` exists; it's **Live** when `train.live`, and **Scheduled** otherwise. A Trip is **named** at a second when the latest snapshot the map had by then holds a report that `reportsByTrip()` matched to it (a report names its Trip by ID, a rack Trip by its Line and the part after `|`, and a Metro Block is matched by the engine). Every figure is Train-minutes, seconds drawn over 60, unless it says reports or Trips; "Trains at a time" is those over the minutes sampled; a **report-minute** is a second sampled in which the latest snapshot holds the report, over 60. A Scheduled Train is counted once, in the first group of section 2's columns, left to right, that holds: named now, quiet, unreported, no live for its Line, feed down (a Train both quiet and with its feed down is quiet: 24 Train-minutes of Rodalies' and 88 of Madrid's on Tuesday night).

| Rule | Counted as |
|---|---|
| **named now** | Scheduled, and named now: a report with no position, or the same GPS as its report before, which the engine takes as none (#33). |
| **quiet** | Scheduled, not named now, and its last report is under 30 minutes old (`recent()`): it carries its last Delay (CARRY). |
| **unreported** | Scheduled with `train.unreported`: its Network's live data is available and has no word on it. Of these, **never named** are Trips that no report of the recording, as the engine matched them, names (a report it dropped aside, section 5), **named elsewhere** the rest (drawn before the first report or after the last, or in a gap). Not told apart for the Metro, which names Blocks, not Trips. |
| **no live for its Line** | Scheduled where the Network's feed names Blocks for other Lines but not this one (the Metro's L9 and L10 both ways and the funicular de Montjuïc). |
| **feed down** | Scheduled while its Network's feed is unavailable (#124's rule), and none of the above. |
| **Phantom, parked** | A Train, Live or Scheduled, standing at its Trip's last Station for longer than its Trip's own dwell there (its last call's departure less its arrival, or the Network's profile dwell where they're equal) and 120 s: the seconds past that, in each stay (an unbroken run of seconds standing there). |
| **Phantom, Live, unmoving** | A Live Train whose drawn distance moved under 0.1 m in a second, more than 20 m from every call, in runs of 600 s or more (the Metro measures' stalls). |
| **Phantom, Scheduled** | Unreported and never named, as above; and drawn inside a Closure the map would show, between its two Stations along its Line's shapes, the Stations themselves included (`closuresAt()` and `placeOn()` of `src/web/closures.ts`): with #345 the engine leaves out those of a closed Closure that no Live Train was seen within, so what's counted is what the map still draws there. A never-named Trip with a **long-distance twin**, a run of Renfe's long-distance timetable (10 October's file) that calls at the same Stations within a minute of the same times for 80% or more of its calls, at least 6, under another Train number, is counted apart (section 3). |
| **Doubled** | A Metro Block with two or more of its Trips drawn at a second while a Trip of it is Live (the Metro measures' "twice"); two drawn Trains of one Network with one Train number (Renfe's Trips carry it); two reports on one Trip in a snapshot. |
| **Missing** | A report that names no Trip, or is dropped (by reason: no Trip, `ENDED`, a Block that no Trip takes); a Trip named now and not drawn that should be: not Cancelled, from its first call's arrival less the Network's dwell to its last call's departure, so off its track; drawn Scheduled though named now; a Train **quiet, then Live again**, a run of consecutive seconds drawn Scheduled and quiet with the Train drawn Live the second after (**not back**: the run reaches the recording's last two seconds); a Metro Block with Live data and no Trip drawn ("nowhere"). A no-Trip report's Trip **moved** if its reports name more than one position. |
| **Misplaced** | **Folds:** at each report that measures a Delay of a Train that was Live as the snapshot arrived (not the first snapshot): a GPS fix that puts it between Stations and isn't a repeat of the report before, TRAM's distance, or the Metro's ETA at the Station it comes to next, the metres between where the Train was drawn as the snapshot arrived and where the report puts it (`off` in `replay()`), and whether that **snaps** it (more than 60 s or 1 km, the engine's own line). **Long pin:** a Live Train drawn more than 3 km (along its Trip's shape, from the Station's call) from a Station its reports have named, unchanged, for 10 minutes or more: a run of one Trip's consecutive reports that name that Station as `near`, a report of another kind between two ending it, the first to the last 10 minutes or more apart; every Live second within that span, by the fetcher's clock, counts, the span's first 10 minutes too. **GPS far:** a GPS report 500 m or more from its Trip's own track, its shape between its first and last call, as `placedBy()` takes it, counted for each snapshot that holds it. |
| **Jumps, stalls, ahead** | `jumps()`'s: a move in 1 s longer than line speed plus 5%, for a Train Live in both seconds; a stall as above, in runs of 30 s and 3 minutes, and the stalled Train-minutes every second of one; a Live Train drawn 20 s or more ahead of where its own Delay puts it (`time` against `now − ease.delay`), which the engine then holds still or slows (ADR-0002). |

Not drawn and rightly so, kept out of "Missing": a Trip flagged Cancelled (Rodalies' 109 to 1,508 Train-minutes on 6 and 7 October, none on the 10th; Madrid's 13 to 75); named before its first Station (Renfe names Madrid's Trips 45 minutes or more ahead: 270 to 1,678 Train-minutes a recording); named after its last (FGC's units, 242 to 513); a Scheduled Train inside a closed Closure (#345: 20.6 Train-minutes, section 11).

## 2. What the map draws

**Tue 6 Oct 23:19** (44.7 min)

| Network | Trains at a time | Live | Scheduled | named now | quiet | unreported | no live for its Line | feed down |
|---|---|---|---|---|---|---|---|---|
| Rodalies | 18.6 | 363 (44%) | 470 | 8 | 124 | 333 | 0 | 5 |
| Cercanías Madrid | 39.4 | 1482 (84%) | 282 | 46 | 235 | 1 | 0 | 0 |
| FGC | 19.1 | 793 (93%) | 61 | 0 | 0 | 61 | 0 | 0 |
| FGC: S, L, R lines | 17.8 | 793 (100%) | 3 | 0 | 0 | 3 | 0 | 0 |
| FGC: funicular (FV) | 1.3 | 0 (0%) | 57 | 0 | 0 | 57 | 0 | 0 |
| TRAM | 10.5 | 426 (91%) | 42 | 0 | 5 | 37 | 0 | 0 |
| Metro | 75.9 | 2495 (74%) | 899 | 0 | 5 | 62 | 833 | 0 |

**Wed 7 Oct 14:03** (44.7 min)

| Network | Trains at a time | Live | Scheduled | named now | quiet | unreported | no live for its Line | feed down |
|---|---|---|---|---|---|---|---|---|
| Rodalies | 53.2 | 1497 (63%) | 881 | 15 | 413 | 454 | 0 | 0 |
| Cercanías Madrid | 75.8 | 3108 (92%) | 280 | 53 | 219 | 7 | 0 | 0 |
| FGC | 54.5 | 2316 (95%) | 119 | 4 | 0 | 115 | 0 | 0 |
| FGC: S, L, R lines | 50.2 | 2222 (99%) | 22 | 4 | 0 | 18 | 0 | 0 |
| FGC: rack (MM) | 1.1 | 50 (100%) | 0 | 0 | 0 | 0 | 0 | 0 |
| FGC: RL1, RL2 | 1.8 | 45 (55%) | 37 | 0 | 0 | 37 | 0 | 0 |
| FGC: funicular (FV) | 1.4 | 0 (0%) | 60 | 0 | 0 | 60 | 0 | 0 |
| TRAM | 28.0 | 1146 (92%) | 103 | 0 | 4 | 100 | 0 | 0 |
| Metro | 124.4 | 4620 (83%) | 937 | 0 | 13 | 40 | 884 | 0 |

**Wed 7 Oct 17:47** (44.7 min)

| Network | Trains at a time | Live | Scheduled | named now | quiet | unreported | no live for its Line | feed down |
|---|---|---|---|---|---|---|---|---|
| Rodalies | 68.8 | 1920 (62%) | 1156 | 2 | 452 | 701 | 0 | 0 |
| Cercanías Madrid | 72.7 | 2987 (92%) | 261 | 23 | 203 | 36 | 0 | 0 |
| FGC | 62.3 | 2597 (93%) | 190 | 14 | 7 | 169 | 0 | 0 |
| FGC: S, L, R lines | 57.5 | 2518 (98%) | 54 | 14 | 0 | 39 | 0 | 0 |
| FGC: rack (MM) | 1.9 | 79 (92%) | 7 | 0 | 7 | 0 | 0 | 0 |
| FGC: RL1, RL2 | 1.5 | 0 (0%) | 69 | 0 | 0 | 69 | 0 | 0 |
| FGC: funicular (FV) | 1.4 | 0 (0%) | 60 | 0 | 0 | 60 | 0 | 0 |
| TRAM | 34.5 | 1383 (90%) | 159 | 0 | 7 | 152 | 0 | 0 |
| Metro | 144.1 | 5393 (84%) | 1048 | 0 | 26 | 59 | 962 | 0 |

**Sat 10 Oct 13:16** (45.0 min)

| Network | Trains at a time | Live | Scheduled | named now | quiet | unreported | no live for its Line | feed down |
|---|---|---|---|---|---|---|---|---|
| Rodalies | 71.5 | 2453 (76%) | 763 | 4 | 407 | 352 | 0 | 0 |
| Cercanías Madrid | 58.5 | 2433 (92%) | 198 | 22 | 171 | 4 | 0 | 0 |
| The other 12 núcleos | 72.2 | 2214 (68%) | 1033 | 21 | 212 | 113 | 0 | 686 |
| FGC | 30.9 | 1302 (94%) | 87 | 0 | 0 | 87 | 0 | 0 |
| FGC: S, L, R lines | 26.1 | 1152 (98%) | 20 | 0 | 0 | 20 | 0 | 0 |
| FGC: rack (MM) | 1.8 | 81 (100%) | 0 | 0 | 0 | 0 | 0 | 0 |
| FGC: RL1, RL2 | 1.6 | 69 (94%) | 4 | 0 | 0 | 4 | 0 | 0 |
| FGC: funicular (FV) | 1.4 | 0 (0%) | 62 | 0 | 0 | 62 | 0 | 0 |
| TRAM | 13.8 | 594 (95%) | 28 | 0 | 7 | 21 | 0 | 0 |
| Metro | 92.3 | 3187 (77%) | 963 | 0 | 33 | 37 | 894 | 0 |

**Saturday, núcleo by núcleo**

| núcleo | Trains at a time | Live | Scheduled | quiet | unreported | feed down |
|---|---|---|---|---|---|---|
| asturias | 15.3 | 0 (0%) | 686 | 0 | 0 | 686 |
| bilbao | 11.7 | 493 (93%) | 35 | 34 | 0 | 0 |
| cadiz | 4.0 | 176 (98%) | 4 | 0 | 0 | 0 |
| cartagena | 1.4 | 60 (96%) | 3 | 2 | 0 | 0 |
| ferrol | 1.2 | 40 (74%) | 14 | 4 | 10 | 0 |
| leon | 2.1 | 64 (66%) | 33 | 32 | 1 | 0 |
| malaga | 6.2 | 234 (83%) | 47 | 25 | 23 | 0 |
| murcia-alicante | 1.8 | 65 (81%) | 15 | 5 | 1 | 0 |
| san-sebastian | 3.1 | 135 (97%) | 4 | 1 | 3 | 0 |
| santander | 7.0 | 248 (79%) | 65 | 47 | 17 | 0 |
| sevilla | 4.8 | 197 (92%) | 18 | 9 | 9 | 0 |
| valencia | 12.7 | 469 (82%) | 101 | 53 | 47 | 0 |
| zaragoza | 0.9 | 33 (82%) | 7 | 0 | 1 | 0 |

The Metro's "no live for its Line" is L9, L10 and the funicular de Montjuïc: TMB publishes no predictions for them. The engine named three Networks unavailable (#124): Asturias for the whole of Saturday, as Renfe's Cercanías file has none of that núcleo's Trains that day (15 Trains at a time drawn Scheduled; #409), and Madrid and Rodalies for 3.1 and 2.4 minutes from 00:01 on Tuesday night, when Renfe's file had none of their Trains for three updates. FGC's FV is the funicular de Vallvidrera: Geotren names none of its Trips, on any day recorded.

## 3. Phantom

| Recording | Network | Parked at its last Station beyond its Trip's own dwell there and 2 min (Live or Scheduled) | Live, unmoving 10 min or more between Stations | Scheduled, unreported, Trip never named | Scheduled, unreported, all | Scheduled inside a Closure, after #345 |
|---|---|---|---|---|---|---|
| Tue 6 Oct 23:19 | Rodalies | 0.0 | 0.0 | 332 | 333 | 0.0 |
| Tue 6 Oct 23:19 | Cercanías Madrid | 6.5 | 0.0 | 0 | 1 | 0.0 |
| Tue 6 Oct 23:19 | FGC | 0.0 | 0.0 | 57 | 61 | 0.0 |
| Tue 6 Oct 23:19 | TRAM | 0.0 | 37.2 | 19 | 37 | 0.0 |
| Tue 6 Oct 23:19 | Metro | 0.0 | 0.0 | n/a | 62 | 0.0 |
| Wed 7 Oct 14:03 | Rodalies | 0.0 | 0.0 | 336 | 454 | 18.1 |
| Wed 7 Oct 14:03 | Cercanías Madrid | 0.0 | 0.0 | 0 | 7 | 0.0 |
| Wed 7 Oct 14:03 | FGC | 0.0 | 0.0 | 97 | 115 | 0.0 |
| Wed 7 Oct 14:03 | TRAM | 0.0 | 0.0 | 27 | 100 | 0.0 |
| Wed 7 Oct 14:03 | Metro | 0.0 | 0.0 | n/a | 40 | 0.0 |
| Wed 7 Oct 17:47 | Rodalies | 0.0 | 0.0 | 524 | 701 | 4.6 |
| Wed 7 Oct 17:47 | Cercanías Madrid | 0.7 | 0.0 | 30 | 36 | 0.0 |
| Wed 7 Oct 17:47 | FGC | 0.0 | 0.0 | 130 | 169 | 0.0 |
| Wed 7 Oct 17:47 | TRAM | 0.0 | 0.0 | 63 | 152 | 0.0 |
| Wed 7 Oct 17:47 | Metro | 0.0 | 0.0 | n/a | 59 | 0.0 |
| Sat 10 Oct 13:16 | Rodalies | 0.0 | 0.0 | 146 | 352 | 3.1 |
| Sat 10 Oct 13:16 | Cercanías Madrid | 0.0 | 0.0 | 0 | 4 | 0.0 |
| Sat 10 Oct 13:16 | The other 12 núcleos | 0.0 | 0.0 | 50 | 113 | 0.0 |
| Sat 10 Oct 13:16 | FGC | 0.0 | 0.0 | 64 | 87 | 0.0 |
| Sat 10 Oct 13:16 | TRAM | 0.0 | 0.0 | 0 | 21 | 0.0 |
| Sat 10 Oct 13:16 | Metro | 0.0 | 0.0 | n/a | 37 | 0.0 |

**FGC, Scheduled and unreported, by Lines (Train-min; Trip never named / named elsewhere)**

| Recording | S, L, R lines | RL1, RL2 | FV | rack |
|---|---|---|---|---|
| Tue 6 Oct 23:19 | 0 / 3 | 0 / 0 | 57 / 0 | 0 / 0 |
| Wed 7 Oct 14:03 | 0 / 18 | 37 / 0 | 60 / 0 | 0 / 0 |
| Wed 7 Oct 17:47 | 1 / 39 | 69 / 0 | 60 / 0 | 0 / 0 |
| Sat 10 Oct 13:16 | 2 / 19 | 0 / 4 | 62 / 0 | 0 / 0 |

**Live.** `ENDED` (#232) did its job: the rack, which had seven Trains drawn at Montserrat where two ran, has 1.1 to 1.8 Live at a time where it runs, and of 1,377 stays at a last Station in the four recordings only two are longer than their Trip's own dwell there and two minutes, both Madrid's. C8a `1077M21049` stood at El Escorial from 23:19 to 23:43 on Tuesday night, 635 s Live and 775 s Scheduled, 23.5 minutes against the 15 its Trip gives the Train there (22:40–22:55): Renfe's delay for it grew from 2,340 to 2,880 s while it stood, so the engine held it there as long as Renfe kept naming it, and then to its timetable's departure shifted by that figure (6.5 Train-minutes past its dwell and two minutes). C2 `1078X21549` on Wednesday's peak stood 342 s against 180 (0.7). One Live Train was drawn when nothing ran:

- **TRAM's T5 `1987_0384`**, Glòries 23:18 → Ciutadella|V.O. 23:25, named in all 132 snapshots, 23:19:30 to 00:04:13, at `along` 574 m in 128 of them, with TRAM's delay at 22 s (the other four: 568 m at 11 s, and three `near` stop 2003 at the start, 39 to 49 s). It was drawn Live for 2,684 s between 231 and 716 m along its Trip, and still from 23:27:02 to the end: 2,232 s, 37 minutes. TRAM's reports carry no time of their own, so nothing marks it stale. It is the only run of 10 minutes or more of any Network.

Live Trains drawn more than 30 minutes after their Trip's timetable ended are not phantoms: they are Rodalies' late Trains moving, as the rains had them (81, 143, 37 and 20 Train-minutes moving against 14, 27, 7 and 2 standing at a Station); the longest, R2S `5177M25558`, was drawn moving for 15 minutes, up to 131 minutes after its Trip ended. FGC's reports are older than 5 minutes, and none than 10, for 3 to 5% of its Live Train-minutes (24, 91, 109 and 67): lag, not a phantom.

**Scheduled.** Unreported and never named is the largest group, and Rodalies' on every day: 332, 336, 524 and 146 Train-minutes, 4.5% of the Network's drawn Train-minutes on Saturday and 17% of Wednesday's peak. FGC's are 57, 97, 130 and 64 (the funicular, FV, and the Lleida lines, below), TRAM's 19, 27, 63 and 0, and the other núcleos' 50 on Saturday. Saturday's Rodalies Trips, each drawn the whole 45 minutes but the last, with the run of Renfe's long-distance timetable (as downloaded on 10 October) that calls at the same Stations at the same minutes under another Train number, a **twin**:

| Trip | Line | From → to | Timetable | Long-distance twin |
|---|---|---|---|---|
| `5181S30550R15` | R15 | Quinto → Capçanes | 11:56–14:50 | 17050, Zaragoza Delicias 11:21 → Barcelona Estació de França 17:24 (all 12 calls) |
| `5181S30501R15` | R15 | Ascó → Quinto | 12:19–14:24 | 17501, Barcelona Estació de França 8:45 → Zaragoza Delicias 14:59 (all 10) |
| `5181S15862R11` | R11 | Portbou → Barcelona-Sants | 12:35–15:10 | 15892, the same run (all 27) |
| `5181S33502R13` | R13 | Lleida-Pirineus → Les Borges Blanques | 13:07–13:27 (11 minutes drawn) | none |
| `4081S24331C6` (Valencia) | C6 | Castelló de la Plana → València-Estació del Nord | 13:05–14:38 | 14461, Vinaròs 12:20 → València-Estació del Nord 14:55 (14 of 19 calls) |

The first three are 135 of Rodalies' 146 Train-minutes, and the C6 45 of the other núcleos' 50. So most of what the map drew with "no live Train" on Saturday were Trains that run, which Renfe's long-distance live data (#261) names by long distance's own number. The engine finds a report's Trip by that number, and the number differs: a report by 17501, 15892 or 14461 matches no Trip in the bundle (long distance's own Trips aren't on the map yet) and is dropped, and one by 17050 goes to R15's own `5181S17050R15` (Reus 15:06 → França 16:54), a part of the run it isn't on (#442). Long distance's files weren't in these recordings, so how many of them it named then isn't counted; read once at 15:48, its two files have 17050 (section 10). On the weekdays the same match, against that file (it has no 6 or 7 October service, so a proxy), finds 35, 97 and 182 of the 332, 336 and 524: R15's `30550`, `30501` and `30556`, R16's `18098`, RL3's `33546` and `33548`, RL4's `33526` and `33527`, R2S `30518`. What has none is local: on Wednesday's peak R4's `77444`, `77446`, `77546` and `77548` (between Manresa and Sant Vicenç de Calders or Vilafranca del Penedès, 40 to 45 minutes each) and R1's `25769`; on Tuesday evening R1's `25689` to `25698` and R4's `77464` and `77466`. The map flags each "no live Train". FGC's S, L and R lines have next to none (0 to 2 Train-minutes); FV is 57 to 62 a recording, all of it never named, and RL1 and RL2 are 69 and 37 on Wednesday's peak and midday. TRAM's never named are T5 on Tuesday (19) and midday (27), and T3 (46), T2 and T4 (8 each) on the peak. The rest of the unreported minutes are Trips named elsewhere in the recording, drawn Scheduled before their first report or after their last, and running: 18 of TRAM's 37 on Tuesday, 73 of 100, 89 of 152 and all 21 on Saturday, and 206 of Rodalies' 352 on Saturday.

**Closures.** #345 is in the base, so these are the Trains the map draws now. Scheduled Trains still drawn inside a Closure's span are few: 18.1 Train-minutes at Wednesday's midday (R1's), 4.6 at its peak and 3.1 on Saturday, all in R1's Closure lifted by Live Trains, or standing for 30 s at a Closure's end Station, where #345 draws a Train up to the edge. Before it, Wednesday's midday had 38.7, R3's 20.6 more: section 11 has the before and after by Closure. The Closures the map would show, and what is inside them now, by the span between their Stations:

| Recording | Line | Between | from | Scheduled (min) | Live (min) | Trains |
|---|---|---|---|---|---|---|
| Wed 7 Oct 14:03 | R3 | Ripoll – Puigcerdà | Alert AVISO_518337 | 0.0 | 7.5 | 2 |
| Wed 7 Oct 14:03 | R1 | Blanes – Maçanet-Massanes | Alert AVISO_518348 | 18.1 | 21.3 | 4 |
| Wed 7 Oct 17:47 | R3 | Ripoll – Puigcerdà | Alert AVISO_518337 | 0.0 | 89.4 | 2 |
| Wed 7 Oct 17:47 | R1 | Blanes – Maçanet-Massanes | Alert AVISO_518348 | 4.6 | 17.0 | 4 |
| Sat 10 Oct 13:16 | R3 | Ripoll – Puigcerdà | Alert AVISO_518337 | 0.5 | 25.4 | 3 |
| Sat 10 Oct 13:16 | R1 | Blanes – Maçanet-Massanes | Alert AVISO_518348 | 2.0 | 20.3 | 3 |
| Sat 10 Oct 13:16 | R13 | Les Borges Blanques – La Plana-Picamoixons | timetable | 0.5 | 0.0 | 1 |
| Sat 10 Oct 13:16 | C8b | Villalba de Guadarrama – Cercedilla | timetable | 0.0 | 0.5 | 1 |
| Sat 10 Oct 13:16 | C1 | Hernani – Irun | timetable | 0.0 | 1.0 | 2 |

Not in the table, with no Train inside in any recording: TRAM's T5 and T6 Glòries – Can Jaumandreu (Alert sc-279, on all four, with no track to place it on), TRAM's T1–T3 Francesc Macià – Montesa on Saturday (Alert sc-280: the timetable of the 10th no longer runs a Trip through it, as #345 found) and R2's single track, which hides nothing. R3's Ripoll – Puigcerdà and R1's Blanes – Maçanet-Massanes are Alerts of 7 October that Renfe still listed on the 10th while Live Trains ran through both (R3 25.4 Train-minutes Live inside on Saturday, R1 20.3): the Closure is stale, not the Trains, and Renfe's alerts file hadn't changed since 7 October at 09:32 (#390).

## 4. Doubled

| Recording | Metro Live Block-min | Blocks on 2+ Trips drawn, all | of which runs of 60 s or more (runs; min) | Same Train number drawn twice | Two reports on one Trip |
|---|---|---|---|---|---|
| Tue 6 Oct 23:19 | 2506 | 2.7 | 1; 1.1 | 0 | 0 |
| Wed 7 Oct 14:03 | 4639 | 13.6 | 1; 11.0 | 0 | 0 |
| Wed 7 Oct 17:47 | 5408 | 3.3 | 0; 0.0 | 0 | 0 |
| Sat 10 Oct 13:16 | 3192 | 32.9 | 2; 31.3 | 0 | 0 |

- **No Train number is drawn twice at once, on any Network, and no snapshot has two reports on one Trip.** Pairs of Trains of one Line within 100 m along one shape for a minute or more, not both standing at a Station, are 5 runs on Wednesday's midday (Rodalies' R8 `78614` and `78616` for 122 s and R2S `25530` and `25532` for 101 s, and two TRAM pairs, one of them twice, 88 to 204 s), one on its peak (R2S `5178X25549` and `25551`, 99 s) and none on the others: Trains close together on a day of disruption, with no report in common.
- **The Metro's Blocks twice** are 0.06 to 1.0% of Live Block-minutes. Most of the minutes on Tuesday and the peak are the seconds a Block shows its last Trip and its next at a terminus. The runs of a minute or more are ghosts, the Trip a Block has left kept drawn Scheduled beside the one it runs now: Saturday's L4 Block 408 from 13:29:39 to 14:01:05, Trip `1.4.11842489` (La Pau 13:31 → Trinitat Nova) drawn Scheduled, carrying a Delay of −294 s, one headway ahead of `1.4.11842517` (13:37 → 14:12), to which the Block was matched from 13:31:41 and which was Live; Wednesday midday's L3 Block 308, `1.3.11797375` and `1.3.11797470`, 11 minutes. Whether the earlier Trip has a train of its own that TMB doesn't list can't be told: no Block was matched to it in either.
- **FGC:** the snapshot keeps no Unit id (Geotren's own `ut` isn't carried), so one Unit named by two Trips can't be told from two Units. Two Trips of one unit type stand near one Station in 51, 100, 100 and 87% of the snapshots, at its termini (Plaça Catalunya, Plaça Espanya, Europa\|Fira) and the rack's two ends, as two Units on two platforms would.

## 5. Missing

| Recording | Network | Reports naming no Trip, Renfe's Networks: buses / rail Trip not in the bundle / in neither the bundle nor Renfe's file (Trips; moved) | Dropped as ended (Trips; report-min; moved) | Scheduled though named now (min) | Quiet, then Live again (runs; min) | Named, off its track (min) | Live Block drawn nowhere (min) |
|---|---|---|---|---|---|---|---|
| Tue 6 Oct 23:19 | Rodalies | 0 / 0 / 0 | 0; 0.0; 0 | 8.2 | 6; 36 | 0.0 | 0.0 |
| Tue 6 Oct 23:19 | Cercanías Madrid | 0 / 0 / 31; 23 | 0; 0.0; 0 | 45.7 | 20; 57 | 0.0 | 0.0 |
| Tue 6 Oct 23:19 | FGC | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 0; 0 | 0.0 | 0.0 |
| Tue 6 Oct 23:19 | TRAM | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 0; 0 | 0.0 | 0.0 |
| Tue 6 Oct 23:19 | Metro | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 1; 2 | 0.0 | 12.2 |
| Wed 7 Oct 14:03 | Rodalies | 0 / 0 / 0 | 0; 0.0; 0 | 14.6 | 18; 84 | 3.1 | 0.0 |
| Wed 7 Oct 14:03 | Cercanías Madrid | 2 / 0 / 1; 1 | 0; 0.0; 0 | 53.4 | 32; 114 | 0.0 | 0.0 |
| Wed 7 Oct 14:03 | FGC | 0 / 0 / 0 | 1; 44.7; 0 | 3.7 | 0; 0 | 0.0 | 0.0 |
| Wed 7 Oct 14:03 | TRAM | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 1; 0 | 0.0 | 0.0 |
| Wed 7 Oct 14:03 | Metro | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 0; 0 | 0.0 | 19.0 |
| Wed 7 Oct 17:47 | Rodalies | 0 / 0 / 0 | 0; 0.0; 0 | 1.7 | 28; 179 | 0.0 | 0.0 |
| Wed 7 Oct 17:47 | Cercanías Madrid | 3 / 0 / 1; 1 | 0; 0.0; 0 | 22.5 | 30; 90 | 0.0 | 0.0 |
| Wed 7 Oct 17:47 | FGC | 0 / 0 / 0 | 2; 62.5; 1 | 14.4 | 0; 0 | 0.0 | 0.0 |
| Wed 7 Oct 17:47 | TRAM | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 2; 1 | 0.0 | 0.0 |
| Wed 7 Oct 17:47 | Metro | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 1; 0 | 0.0 | 16.1 |
| Sat 10 Oct 13:16 | Rodalies | 0 / 0 / 0 | 0; 0.0; 0 | 4.1 | 53; 255 | 1.1 | 0.0 |
| Sat 10 Oct 13:16 | Cercanías Madrid | 12 / 0 / 0 | 0; 0.0; 0 | 22.0 | 26; 70 | 0.0 | 0.0 |
| Sat 10 Oct 13:16 | The other 12 núcleos | 9 / 4; 2 / 0 | 0; 0.0; 0 | 21.3 | 45; 98 | 0.0 | 0.0 |
| Sat 10 Oct 13:16 | FGC | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 0; 0 | 0.0 | 0.0 |
| Sat 10 Oct 13:16 | TRAM | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 1; 7 | 0.0 | 0.0 |
| Sat 10 Oct 13:16 | Metro | 0 / 0 / 0 | 0; 0.0; 0 | 0.0 | 1; 1 | 0.0 | 5.8 |

**Reports that name no Trip**, and what they are (the first question of #412), by Renfe's own timetable file as downloaded on 10 October (`routes.txt`'s `route_type` 3, or a Train number beginning with 8, is a bus):

| Recording | Buses | Rail Trips in the file, not in the bundle | In neither the bundle nor the file |
|---|---|---|---|
| Tue 6 Oct 23:19 | 0 | 0 | 31 Madrid Trips of 7 Oct's service day (23 moving: the bundle is the 6th's alone) |
| Wed 7 Oct 14:03 | 2 (C9, Madrid) | 0 | 1: Madrid C2 `1078X35986` (moving, 38 report-min) |
| Wed 7 Oct 17:47 | 3 (C9, Madrid) | 0 | 1: Madrid C2 `1078X35988` (moving, 36 report-min) |
| Sat 10 Oct 13:16 | 21: Madrid's C8b and C9 at Cercedilla and Villalba de Guadarrama during the works of 10–12 Oct (12), Murcia/Alicante (5), Valencia (2), San Sebastián (2); each stands at one Station | 4: Sevilla C4 `3081S23631` (moving) and `23633`, Santander C3 `6281S71853` (moving), Bilbao C4 `6081S71891` | 0 |

A bus is not a Train (CONTEXT), so a bus is not Missing: #412's 12 of Madrid's on Saturday 11:04–11:49 (`1081S80680C9`, `1081S80685C9`, `1081S800xxC8b`) are buses of the same kind (numbers 8xxxx, `route_type` 3) as this recording's 12, and its 3 to 4 of 7 October's are 2 to 3 of them and the C2 Train below. The four rail Trips are Renfe's own, in its file with `route_type` 2: Cercanías Sevilla's C4 is a Line of the bundle with no Trips on 10 Oct, though Renfe's file has its Trips and its shape (`30_C4`), which #365's circle trace explains; Bilbao's `6081S71891` looks like the Bilbao–León train of #368, whose Dosante Cidad stop #367 has the build leave out; and Santander's `71853` and Bilbao's `71891` share their numbers with a Bilbao C5 and a León C1 Trip the bundle has, which is #442's matter for a report by number. The two Madrid C2 Trains of 7 October are in neither the day's bundle nor Renfe's file of 10 October, which has no 7 October service to say what they are: nothing could draw them (ADR-0002: no timetable to move them by).

**Dropped as ended (FGC's `lingers` rule).** Over the four recordings it dropped 2 Units, section 8: the rack Unit `652dc7e100` standing at Montserrat (MM) for the whole of both Wednesday recordings (132 and 131 reports), and RL1's `1f28c4e706`, 52 reports moving. The rack Trip `655cc7e103` on Wednesday and `655cc7e20b` on Saturday, which Geotren names standing at Monistrol-Vila (MP) in every snapshot, is in no timetable (44.7, 44.7 and 45.0 report-minutes; FGC's own map lists it too, section 10), so its reports match no Trip and are dropped too: they are not in the Renfe columns above.

**Metro.** Reports of a Block that no Trip took, though Trips are headed its way (it matches none within half an hour of TMB's ETA, or another Block takes its Trip): 56.0 report-minutes of 12 Blocks on Tuesday evening, and 6.8 (14 Blocks), 10.3 (24) and 1.4 (4) on the others, against 2,439 to 5,310 report-minutes of Blocks that kept their Trip. A Live Block with no Trip drawn ("nowhere") is 12.2, 19.0, 16.1 and 5.8 Block-minutes (0.2 to 0.5% of Live Block-minutes), in runs of up to 104 s.

**Scheduled though named now** is Madrid's 22 to 53 Train-minutes (a GPS position unchanged since the report before, which counts as none: runs of 20 s to 9 minutes, a median of 20 s to a minute), FGC's 4 and 14 on the Wednesdays (reports from trip updates alone) and Rodalies' 2 to 15. **Quiet, then Live again** is larger: Rodalies 36, 84, 179 and 255 Train-minutes (6, 18, 28 and 53 runs), Madrid 57, 114, 90 and 70, the other núcleos 98: a Train that live data stopped naming for three updates or more and then named again, drawn Scheduled in between, along its timetable shifted by its last Delay. Quiet and not back by the recording's end: Rodalies 81, 249, 127 and 98 Train-minutes (Wednesday's midday was 270 before #345 hid one R3 Trip's 20.6), Madrid 93, 9, 15 and 2, the Metro 25 to 29 on Wednesday's peak and Saturday.

**Named and off its track:** R3's Trains where the shape and the Trip's calls part: `5178X35534` before the shape's start (its first call, `adif:77310`, is 1.6 km before it), 3.1 Train-minutes on Wednesday midday, and `5181S35541` past its end (its last call is 1.6 km after it), 66 s on Saturday.

## 6. Misplaced

| Recording | Network | Measuring folds into a Train already drawn (GPS; TRAM's distance; Metro's ETA) | median (m) | p90 (m) | 1 km or more | snapped | GPS reports 500 m+ from their Trip's own track | Live Train-min 3 km+ from a 10-min pin (of Live while pinned) |
|---|---|---|---|---|---|---|---|---|
| Tue 6 Oct 23:19 | Rodalies | 342 | 30 | 428 | 22 (6%) | 26 (8%) | 0 of 398 | 28.6 of 63 |
| Tue 6 Oct 23:19 | Cercanías Madrid | 812 | 113 | 1389 | 163 (20%) | 215 (26%) | 5 of 1480 | 8.9 of 59 |
| Tue 6 Oct 23:19 | FGC | 1401 | 0 | 134 | 7 (0%) | 20 (1%) | 0 of 1432 | 0.0 of 1 |
| Tue 6 Oct 23:19 | TRAM | 501 | 100 | 139 | 0 (0%) | 4 (1%) | - | - |
| Tue 6 Oct 23:19 | Metro | 7158 | 0 | 146 | 19 (0%) | 25 (0%) | - | - |
| Wed 7 Oct 14:03 | Rodalies | 1349 | 36 | 545 | 88 (7%) | 106 (8%) | 3 of 1503 | 70.4 (67.5) of 173 |
| Wed 7 Oct 14:03 | Cercanías Madrid | 1888 | 102 | 1438 | 358 (19%) | 461 (24%) | 8 of 3087 | 5.7 of 102 |
| Wed 7 Oct 14:03 | FGC | 4173 | 0 | 142 | 18 (0%) | 40 (1%) | 0 of 4284 | 0.0 of 1 |
| Wed 7 Oct 14:03 | TRAM | 1114 | 83 | 168 | 11 (1%) | 13 (1%) | - | - |
| Wed 7 Oct 14:03 | Metro | 13458 | 0 | 135 | 0 (0%) | 61 (0%) | - | - |
| Wed 7 Oct 17:47 | Rodalies | 1642 | 34 | 465 | 102 (6%) | 122 (7%) | 6 of 1732 | 223.6 (108.7) of 346 |
| Wed 7 Oct 17:47 | Cercanías Madrid | 2127 | 107 | 1379 | 415 (20%) | 530 (25%) | 9 of 2835 | 0.1 of 107 |
| Wed 7 Oct 17:47 | FGC | 4415 | 0 | 133 | 24 (1%) | 70 (2%) | 0 of 4547 | 0.0 of 3 |
| Wed 7 Oct 17:47 | TRAM | 1362 | 82 | 166 | 6 (0%) | 17 (1%) | - | - |
| Wed 7 Oct 17:47 | Metro | 15573 | 0 | 145 | 0 (0%) | 58 (0%) | - | - |
| Sat 10 Oct 13:16 | Rodalies | 2386 | 36 | 489 | 135 (6%) | 178 (7%) | 4 of 2514 | 27.3 of 79 |
| Sat 10 Oct 13:16 | Cercanías Madrid | 1811 | 115 | 1416 | 366 (20%) | 468 (26%) | 8 of 2440 | 0.0 of 64 |
| Sat 10 Oct 13:16 | The other 12 núcleos | 1792 | 53 | 647 | 117 (7%) | 174 (10%) | 5 of 1992 | 10.8 of 80 |
| Sat 10 Oct 13:16 | FGC | 2291 | 0 | 153 | 18 (1%) | 34 (1%) | 0 of 2328 | 0.0 of 2 |
| Sat 10 Oct 13:16 | TRAM | 546 | 76 | 164 | 0 (0%) | 0 (0%) | - | - |
| Sat 10 Oct 13:16 | Metro | 9285 | 0 | 127 | 0 (0%) | 27 (0%) | - | - |

- **Rodalies' long pins are the largest.** A Renfe report that names one Station is STOPPED_AT or INCOMING_AT it, which the snapshot doesn't tell apart (`near`): the engine takes it as a sighting, so the Train stays Live, and draws it by its carried Delay, as ADR-0002 has it (holding a pinned Train at its Station made its jumps worse, 115 against 85: #8). When one Station has been named for 10 minutes or more and the Train is drawn more than 3 km from it, one of the two is wrong, and the viewer can't tell which. Where a GPS fix follows within 15 minutes (28 runs in the four recordings, the Train read where it was drawn at the report's own time; 26 where it was drawn as the snapshot reached the map), it is at the pin, within 2 km, in 17 (14), near where the map had drawn the Train in 8 (10), and at neither in 3 (2): more often it was the Train that stood, and the fix is a real one, not the Station's own point (none of the 185 fixes that follow a long pin is within a metre of it, 68 within 50 m). On Wednesday's peak that is 224 Live Train-minutes of Rodalies' 346 in such runs, in 25 of 43 runs: the three R4s `77552`, `77554` and `77556` were pinned at Barcelona-Sants for 43–45 minutes and drawn up to 68 km away. Many are Trains Renfe cuts short and the recording predates #346: with the Stations the first frame lists SKIPPED applied, it's 109 of 216. Saturday has no such cause: 27 of 79, in 9 of 15 runs, and Bilbao's C5 `6081S71587` 9 Train-minutes of the núcleos' 11. At 5 minutes and 2 km the Rodalies figures are 46, 183, 340 and 150 Train-minutes; at 10 minutes and 5 km, 17, 26, 171 and 11. Madrid's are not: 9, 6, 0 and 0 of 59 to 107 in such runs, though 23 to 55 at 5 minutes and 2 km. The card's side of the same pins is cause 6 of [card-against-map.md](card-against-map.md) (#352).
- **Madrid's GPS fixes snap its Trains a quarter of the time.** 19–20% of them move the Train 1 km or more, a median of 102–115 m and a p90 of 1.4 km, against Rodalies' 30–36 m and 428–545 m. Renfe pins 73 to 80% of Madrid's reports (`near`) and gives 1,500 to 3,100 GPS reports a recording: a Train is carried between fixes. The snaps cluster in fixes that follow another fix of the Train's by 40 s to 2 minutes: 58% of those snap (55 to 64% a recording; 1,358 fixes in all), and 18% of those 20 s after one (17 to 21%; 3,413), against Rodalies' 13% (8 to 36% a recording, 14 to 77 fixes) and 6% (5 to 7%); the other núcleos, with as many pinned reports, snap 10% in all. Which of the engine's rules does it is partly told by whether the fix agrees with the one before it: of Madrid's 1,674 snaps by a fix that measures a Delay (25% of its 6,638), 331 (20%) are by a fix whose Delay no report before it supported within `CONFIRM`'s 120 s, the kind #410 counts; the other 1,343 are fixes that agree with the one before, and 31% of Madrid's 4,367 such fixes snap, against 6% of Rodalies' 4,902: 560 by distance (the Train drawn 1 km or more from where the fix puts it, within a minute of it: a median 1,321 m, p90 1,685 m), 588 by 61 to 120 s, which `CONFIRM` takes and `JUMP_TIME`'s 60 s sends the Train to, and 195 by more than 120 s. Which rule moves a Delay by a minute or two between fixes a minute apart (`passing()` at a Station, the carry) wasn't looked at.
- **GPS far from the Trip.** 5 to 9 of 1,500 to 3,100 GPS reports a recording on Madrid, 0 to 6 of 400 to 2,500 on Rodalies and none of 1,400 to 4,500 on FGC lie 500 m or more from their Trip's own track, up to 85 km (R15 `5181S15010` on Saturday; Madrid's C7 `1077M21870` 28 km): each is drawn Live where it isn't, and 5 on Saturday's other núcleos' 1,992 (Sevilla's C2 `3081S23013` 29.8 km, Ferrol's C1 `4681S70055` 19.4, Bilbao's C3 `6081S26536` 16.3, San Sebastián's C1 `6181S32775` 5.9).
- **TRAM's median correction is 76 to 101 m**, FGC's and the Metro's 0 (p90 126 to 155 m).
- **What the weekday recordings' missing `skipped` list changes** (as recorded; with the first frame's lists in parentheses):

| Recording | Rodalies drawn (Train-min) | Rodalies Live | pinned 3 km+ | Madrid drawn |
|---|---|---|---|---|
| Tue 6 Oct 23:19 | 833 (831) | 363 (363) | 28.6 (28.6) | 1,764 (1,750) |
| Wed 7 Oct 14:03 | 2,378 (2,334) | 1,497 (1,481) | 70.4 (67.5) | 3,387 (3,375) |
| Wed 7 Oct 17:47 | 3,075 (2,907) | 1,920 (1,781) | 223.6 (108.7) | 3,248 (3,248) |

  2, 6 and 9 Trips' lists were applied, from the three first frames; a Train whose list begins later isn't cut, so the figures in parentheses are an upper bound on what #346 leaves.

## 7. Smoothness against accuracy

| Recording | Network | Live Train-min | jumps | per Live Train-min | stalls of 30 s+ | of 3 min+ | longest (s) | stalled Train-min | drawn 20 s or more ahead of its report (Train-min) |
|---|---|---|---|---|---|---|---|---|---|
| Tue 6 Oct 23:19 | Rodalies | 363 | 28 | 0.08 | 1 | 0 | 40 | 2 | 3 |
| Tue 6 Oct 23:19 | Cercanías Madrid | 1482 | 246 | 0.17 | 70 | 0 | 102 | 55 | 59 |
| Tue 6 Oct 23:19 | FGC | 793 | 28 | 0.04 | 5 | 0 | 41 | 15 | 13 |
| Tue 6 Oct 23:19 | TRAM | 426 | 2 | 0.00 | 15 | 1 | 2232 | 96 | 30 |
| Tue 6 Oct 23:19 | Metro | 2495 | 7 | 0.00 | 38 | 2 | 244 | 111 | 76 |
| Wed 7 Oct 14:03 | Rodalies | 1497 | 122 | 0.08 | 8 | 0 | 40 | 8 | 9 |
| Wed 7 Oct 14:03 | Cercanías Madrid | 3108 | 547 | 0.18 | 157 | 0 | 101 | 124 | 125 |
| Wed 7 Oct 14:03 | FGC | 2316 | 75 | 0.03 | 48 | 0 | 40 | 69 | 53 |
| Wed 7 Oct 14:03 | TRAM | 1146 | 25 | 0.02 | 74 | 0 | 162 | 193 | 45 |
| Wed 7 Oct 14:03 | Metro | 4620 | 0 | 0.00 | 78 | 0 | 161 | 175 | 107 |
| Wed 7 Oct 17:47 | Rodalies | 1920 | 133 | 0.07 | 15 | 0 | 61 | 14 | 14 |
| Wed 7 Oct 17:47 | Cercanías Madrid | 2987 | 619 | 0.21 | 189 | 0 | 101 | 140 | 148 |
| Wed 7 Oct 17:47 | FGC | 2597 | 110 | 0.04 | 45 | 0 | 41 | 77 | 59 |
| Wed 7 Oct 17:47 | TRAM | 1383 | 31 | 0.02 | 97 | 0 | 123 | 251 | 54 |
| Wed 7 Oct 17:47 | Metro | 5393 | 3 | 0.00 | 77 | 0 | 162 | 234 | 144 |
| Sat 10 Oct 13:16 | Rodalies | 2453 | 188 | 0.08 | 16 | 0 | 40 | 18 | 13 |
| Sat 10 Oct 13:16 | Cercanías Madrid | 2433 | 549 | 0.23 | 131 | 0 | 100 | 94 | 110 |
| Sat 10 Oct 13:16 | The other 12 núcleos | 2214 | 189 | 0.09 | 36 | 0 | 101 | 35 | 33 |
| Sat 10 Oct 13:16 | FGC | 1302 | 51 | 0.04 | 30 | 0 | 40 | 38 | 29 |
| Sat 10 Oct 13:16 | TRAM | 594 | 0 | 0.00 | 38 | 0 | 141 | 115 | 25 |
| Sat 10 Oct 13:16 | Metro | 3187 | 0 | 0.00 | 34 | 0 | 121 | 99 | 53 |

A snap is a jump, so accuracy and smoothness agree because the same fixes make both: stalls and drawn-ahead are the other side of them. Madrid is the least accurate by the fold measures (24–26% of its GPS fixes snap, p90 1.4 km) and the jumpiest: 0.17 to 0.23 jumps a Live Train-minute, 2 to 3 times Rodalies' 0.07 to 0.08 (the 0.081 of #100's morning, under its 0.1) and the other núcleos' 0.09. FGC's are 0.03 to 0.04, TRAM's 0 to 0.02 and the Metro's 0 to 0.003, as #100's were (Rodalies 0.075 and 0.081, FGC 0.03 to 0.05, TRAM 0.002 to 0.013, the Metro 0.002), Madrid and the other núcleos having had no baseline. Where Renfe pins a Network's Trains and its GPS is sparse, the carried Delay drifts, and a fix snaps it.

- **Stalls of 3 minutes or more:** the TRAM Train's 2,232 s, and two of the Metro's on Tuesday evening (184 and 244 s). The longest others are 162 s (TRAM and the Metro) and 102 s (Madrid). Stalled Train-minutes count every second of a stall, of any length.
- **Ahead of its report:** 0.5 to 7% of Live Train-minutes are drawn 20 s or more ahead: Madrid 59 to 148 Train-minutes (4 to 5%), TRAM 25 to 54 (4 to 7%), the Metro 53 to 144 (1.6 to 3.1%), FGC 13 to 59 (about 2%), Rodalies 3 to 14 (under 1%).

## 8. RL2's question (#232)

*Do `ENDED`'s drops ever drop a real late Train?* #232 found one on Friday 25 September's recording: RL2's 13:39 from Lleida, named 40 to 84 minutes after it ended, a Unit whose GPS ran from Lleida to past Balaguer at the timetable's pace, 134–136 minutes late. The four recordings have it three times:

| Recording | Trip | Reports dropped | Where the Unit was | Verdict |
|---|---|---|---|---|
| Wed 7 Oct 14:03 | rack `652dc7e100` (ended 134–178 min before) | 132, all of them | `near` Montserrat (MM) in each | parked |
| Wed 7 Oct 17:47 | the same Trip (358–402 min after its end) | 131 | `near` Montserrat (MM) in each | parked |
| Wed 7 Oct 17:47 | **RL1 `1f28c4e706`**, Lleida 15:52 → Balaguer 16:18 (88–104 min after its end) | 52, 17:46:00–18:02:02 | GPS: 13,472 m along its shape at 17:46, 25,695 m of 26,025 at 17:58 and the same at 18:02 | **moving at the timetable's pace, then standing at Balaguer** |

The RL1 Unit covered 12.2 km in 12 minutes (61 km/h), the Trip's timetable 26.0 km in 26 (60 km/h), 100 minutes late at both ends of that run (104 at 18:02, standing at Balaguer), and no other RL1 Trip had a Train there by the timetable at those times. Without the rule it is drawn Live along its Trip for 684 s, from 15.0 km at 17:47 to 25.3 km at 17:57, as its reports have it, a minute or two behind them (FGC's data's age); with it, no Train is drawn there. So: **yes, once in the four, a real Train for 17.8 report-minutes** (a report-minute is a second sampled in which the latest snapshot holds the report, over 60), and the rule drops a parked rack Unit, the same one in both Wednesday recordings, 44.7 report-minutes each, which without the rule would be a Live Train standing at Montserrat. The Tuesday evening and the Saturday dropped none (Saturday's rack Units, `652dc7e000`, `001` and `004` to `007`, were named within 30 minutes of their Trips' ends and are drawn). #232's own Friday count was 1 of 1; here it is 1 of 2 Units, 17.8 of 107.2 report-minutes. Both kinds exist, and the reports tell them apart: a position that moved along the Trip, or one that didn't (a draft ticket).

## 9. Worst spots

| What | Where | When | Trip |
|---|---|---|---|
| Live, unmoving 37 min | TRAM T5 Glòries → Ciutadella\|V.O., `along` 574 m | Tue 23:27–00:04 | `tram:TBS:1987_0384` |
| Live drawn up to 18 km from its pin, 13 of 14 min | R15 Reus → França, pinned at Vilanova i la Geltrú | Wed 18:10–18:24 | `5178X15018R15` |
| Live drawn up to 22 km from its pin, 18 of 25 Live min | R2N Sant Celoni → El Prat, pinned at Granollers Centre | Wed 17:52–18:31 | `5178X28454R2N` (18:07–19:26) |
| Live drawn up to 9 km from its pin, 6 of 9 Live min | R15 Reus → Barcelona Estació de França, pinned at Reus | Sat 13:21–13:44 | `5181S15012R15` |
| Live drawn up to 9 km from its pin, 9 of 17 min | Bilbao C5 Karrantza → Aranguren, pinned at Villaverde de Trucios | Sat 13:18–13:35 | `6081S71587C5` |
| Snapped 18.5 km by one GPS fix | Madrid C10 Villalba de Guadarrama → Chamartín | Tue 23:21:59 | `1077M21170C10` |
| Snapped 17.9 km | Madrid C5 Fuenlabrada → Móstoles-El Soto | Wed 17:49:45 | `1078X20885C5` |
| Snapped 24.7 km | Rodalies R2 Castelldefels → Granollers Centre | Wed 18:09:44 | `5178X28536R2` |
| Scheduled the whole window, never named | R15 Quinto → Capçanes; R15 Ascó → Quinto; R11 Portbou → Sants | Sat 13:16–14:01 | `5181S30550R15`, `5181S30501R15`, `5181S15862R11` |
| Scheduled the whole window, never named | R4 Sant Vicenç de Calders ↔ Manresa, four Trips | Wed 17:47–18:32 | `5178X77444R4`, `77446`, `77546`, `77548` |
| Parked at its last Station 23.5 min against a 15-minute dwell | Madrid C8a Chamartín → El Escorial | Tue 23:19–23:43 | `cercanias-madrid:1077M21049C8a` (21:47–22:40) |
| Dropped by `ENDED`, a real late Unit | RL1 Lleida → Balaguer, 100 min late, moving | Wed 17:46–18:02 | `624ddab200727612a612\|1f28c4e706` |
| Ghost beside its Block's Live Trip, 31 min | Metro L4 Block 408 | Sat 13:29:39–14:01:05 | `metro:1.4.11842489` beside `…517` |
| Named, moving, no Trip in the day's bundle or the file | Madrid C2 | Wed 14:03–14:48; 17:47–18:32 | `1078X35986C2`, `1078X35988C2` |
| Named, moving, rail Trip not in the bundle | Cercanías Sevilla C4 | Sat 13:16–14:01 | `3081S23631C4`, `3081S23633C4` |
| Live 7 min into a closed part of the Line from a pin at its end, then Scheduled 21 min and hidden by #345 | R3 from `adif:77310` (past Puigcerdà, a Station the bundle has no entry for) → La Garriga, pinned at Puigcerdà, drawn up to 5 km towards Ripoll | Wed 14:20–14:48 | `rodalies:5178X35534R3` |

## 10. Spot checks

Against the operators' public maps and boards, as far as a check made today can say anything about a recording's past: it can't, so what it checks is whether the same rules, on today's feeds, agree with what the operators publish. No browser was driven: each operator's page loads data files, and I read those once, 36 requests between 14:44 and 15:06 CEST on Saturday 10 October (25 to Renfe's hosts, 6 to FGC's, 5 to our CDN), and Renfe's two long-distance files once at 15:48; nothing from them is in the map (ADR-0010). Section 9's worst spots are in the recordings' past or in Trains no board names, so none could be checked at its own spot.

- **Renfe's visor** (tiempo-real.renfe.com, "Iniciativa GTFS Tiempo Real: RENFE – LOGIRAIL"): its `flota.json`, 217 Trains at 15:01:08, carries the same `tripId`s as the open feed. 126 of the feed's 128 positioned Trains are in it, so it can't confirm a Train the feed lacks. At that moment the open feed's positions had none of Madrid's 90 Trains (the drop ADR-0003 holds for two tries) and the visor had them. Of the 14 unreported Rodalies Trains the map drew then, none is in the visor (R1 `25643`, `25652`; R2N `25436`; R2S `25536`, `25535`, `28363`; R11 `15862`, `15866`, `15812`; R14 `15052`; R16 `18126`, `18127`; R15 `15012`, `30514`).
- **Renfe's boards** (the visor's "salidas": `/renfe-json-cutter/write/salidas/estacion/<code>.json`, which gives each departure its planned and its expected time and, for some, a Station-level location): nine Stations at 15:02–15:04, against the engine's departures from each at the same moment (what `boardAt()` lists, which shows ten rows), each Trip with a call there still to leave and expected from 3 to 45 minutes after the board's own time:

| Station | Renfe's | the map's | on both | within 1 min |
|---|---|---|---|---|
| Barcelona-Sants | 26 | 26 | 24 | 22 |
| Barcelona Estació de França | 4 | 4 | 4 | 4 |
| Granollers Centre | 4 | 4 | 4 | 4 |
| Mataró | 5 | 5 | 4 | 4 |
| Reus | 2 | 1 | 1 | 1 |
| Lleida-Pirineus | 2 | 1 | 1 | 1 |
| Madrid-Atocha Cercanías | 35 | 35 | 35 | 33 |
| València-Estació del Nord | 3 | 3 | 3 | 3 |
| Bilbao-Abando | 4 | 4 | 4 | 4 |
| **All** | **85** | **83** | **80** | **76** |

  On both lists, 52 of the 80 are Live on the map and 7 Scheduled and unreported, 4 of which Renfe's board gives a Station-level location for (R15 `15012` and `30514`, R16 `18126`, C3 `27047`). The 5 only on Renfe's are Lleida's R13 `85012`, a bus; Reus' R15 `15014`, due out at 15:06, the window's edge; and three R1 and R2S Trains whose expected time is 9 to 21 minutes before the timetable's (R1 `25824`, `25656`, R2S `28364`), none of which the open feed has a report on. The 3 only on the map's are Live Trains due within five minutes of the window's start (R16 `18129`, R2S `28298`, R1 `25650`). One Train on both lists differs by more than 3 minutes: R2N `25438` at Sants, planned 15:31, Renfe's expected 15:19, the map's 15:31. At the first look at 15:03, R2S `25532` was planned 15:06, Renfe's 15:19, the map's 15:06; 74 seconds later Renfe's was 15:06. Renfe's boards hold expected times for Trains the open feed has no report on; the map draws them on the timetable.

  The boards list 10 of the 14 unreported Rodalies Trains of 15:01, 6 of them with a Station-level location (R2N `25436`, R2S `25536` and `28363`, R15 `15012` and `30514`, R16 `18126`): so Renfe has a position for Trains the open feed gives none for, which the visor, reading the open feed, lacks. The other 4 (R2S `25535`, R11 `15862` and `15812`, R16 `18127`) are on none of the nine boards.
- **FGC's Geotren** (`geotren.fgc.cat/tracker/trens.geojson`, FGC's own map and the snapshot's source, so this checks the fetch's freshness and not the data's truth; read once at 15:05:39 against the snapshot of 15:05:34): 33 of its 36 units are among the snapshot's 40 FGC reports. The 3 it has and the snapshot hasn't are inside FGC's two-minute fetch, and 5 of the 7 the snapshot has and it hasn't are reports with no position. Geotren lists 3 rack units, as the snapshot does, one of them (`655cc7e20b`, M2, standing at Monistrol-Vila, MP) the Trip no timetable has.
- **Renfe's long-distance feeds** (`gtfsrt.renfe.com/vehicle_positions_LD.json` and `trip_updates_LD.json`, which #261 fetches from 13:25 UTC, 15:25 CEST), read once at 15:48 CEST, their header 13:47:50 UTC: 122 Train numbers with a position, 131 with a trip update, 30 of which have a Trip in 10 Oct's bundle (Rodalies' R11, R13 and R14–R17 15; Zaragoza's 4, Ferrol's 3, San Sebastián's 2, Madrid's C8a, Asturias' C1, Bilbao's C5 2, and two numbers that Asturias' C6 and Santander's C2 both have). Of the 14 unreported Rodalies Trains of 15:01, four are in them: R11 `15812`, R14 `15052`, R16 `18126` and `18127`, 18 to 40 minutes late, so the map now names Trains that were "no live Train" at 15:01. That is all this read can say of the Trips this note finds never named: Saturday's had ended by 15:48 (13:27 to 15:10 by timetable, `30556` starts at 16:37) and the weekdays' are of other days. What it does have is 17050, the long-distance run of which R15's `30550` is the first part to the minute (section 3), in both files.
- **Not checkable:** TRAM and TMB publish no board beyond the feeds the map reads; Rodalies' app wasn't reachable.

## 11. What #345 changed, and which rules need a fix

### What #345 changed

#345 (PR #423) stops drawing a Scheduled Train inside a closed Closure, standing at a Station between its two, running a leg within it or along its shape between them, and goes on drawing a Live one. A Closure an Alert makes is lifted for its whole Line, until the Alert changes, once a report puts a Live Train of the Line within it: pinned at a Station between its two, or by its GPS or TRAM's distance more than 200 m in from either (`seenWithin()`). The timetable's Closures are never lifted and have no Scheduled Train to hide, a single-track one hides nothing, and the page keeps the lifts for as long as it lives; the replay keeps them from each recording's first snapshot.

Scheduled Train-minutes drawn inside the Closures the map would show, by the span between their Stations on their Lines' shapes (section 1), before #345 and as the page has them now, and what its lift is worth:

| Recording | Line | Between | from | Scheduled inside before (min) | hidden by #345, with its lift (min) | hidden without the lift (min) | Scheduled inside after (min) | Live inside (min) | lifted |
|---|---|---|---|---|---|---|---|---|---|
| Wed 7 Oct 14:03 | R3 | Ripoll – Puigcerdà | Alert AVISO_518337 | 20.6 | 20.6 | 20.6 | 0.0 | 7.5 | no |
| Wed 7 Oct 14:03 | R1 | Blanes – Maçanet-Massanes | Alert AVISO_518348 | 18.1 | 0.0 | 15.6 | 18.1 | 21.3 | from 0:00 |
| Wed 7 Oct 17:47 | R3 | Ripoll – Puigcerdà | Alert AVISO_518337 | 0.0 | 0.0 | 0.0 | 0.0 | 89.4 | from 0:00 |
| Wed 7 Oct 17:47 | R1 | Blanes – Maçanet-Massanes | Alert AVISO_518348 | 4.6 | 0.0 | 3.6 | 4.6 | 17.0 | from 0:00 |
| Sat 10 Oct 13:16 | R3 | Ripoll – Puigcerdà | Alert AVISO_518337 | 0.5 | 0.0 | 0.0 | 0.5 | 25.4 | from 0:00 |
| Sat 10 Oct 13:16 | R1 | Blanes – Maçanet-Massanes | Alert AVISO_518348 | 2.0 | 0.0 | 0.7 | 2.0 | 20.3 | from 0:00 |
| Sat 10 Oct 13:16 | R13 | Les Borges Blanques – La Plana-Picamoixons | timetable | 0.5 | 0.0 | 0.0 | 0.5 | 0.0 | never (timetable) |
| Sat 10 Oct 13:16 | C8b | Villalba de Guadarrama – Cercedilla | timetable | 0.0 | 0.0 | 0.0 | 0.0 | 0.5 | never (timetable) |
| Sat 10 Oct 13:16 | C1 | Hernani – Irun | timetable | 0.0 | 0.0 | 0.0 | 0.0 | 1.0 | never (timetable) |

- **Before** is the same replay with no Closure handed to the engine, as `b3c07a8` drew these recordings; **hidden without the lift** is #345 as first built, a closed Closure hiding for as long as its Alert is listed. Only closed Closures are in the table: R2's single track hides nothing, and TRAM's T5, T6 and T1–T3 have no Train inside.
- **What it took out is one Trip,** R3 `5178X35534`, on Wednesday's midday: from the Line's northern end at 14:14, past Puigcerdà, to La Garriga at 17:06. Renfe named it in 69 snapshots, from the recording's start to 23 minutes in, every one `near` Puigcerdà with a Delay of 0, and then stopped. The map drew it Live from Puigcerdà on its timetable, into the part of the Line Renfe's Alert closes and up to 5 km along it, for 7.1 minutes, and Scheduled for the 20.6 to the recording's end. #345 hides the 20.6. It can't hide the 7.1 Live, and its lift doesn't see the Train within, its one pin being at the Closure's end Station: it is a long pin (the first ticket below) that happens to be in a Closure.
- **What the lift does here.** It lifts R1's Closure from the first snapshot in all three recordings that list it, by Trains Renfe pins between Blanes and Maçanet-Massanes or its GPS puts inside it, and R3's from the first on Wednesday's peak and Saturday's, where R3's Live Trains ran 89.4 and 25.4 Train-minutes inside; on Wednesday's midday no report put a Train within it in 45 minutes. Without the lift #345 would hide R1's 15.6 Train-minutes on Wednesday's midday, 3.6 on its peak and 0.7 on Saturday, Trips of a Line whose Live Trains ran through that part in the same minutes: R1 `5178X25650`, which Renfe names and loses, was Live inside it for 7.5 minutes and Scheduled for 18.1, 15.6 of them strictly inside.
- **What is left drawn inside.** R1's Scheduled Trains in its lifted Closure, 18.1, 4.6 and 2.0 Train-minutes (on Saturday three Trips: `5181S25629` running through it for 41 s, `5181S25646` and `5181S25648` standing at its end Station for 50 s and 30 s); R3's 0.5 on Saturday (`5181S77330`, 30 s at its end Station, its Closure lifted too); and R13's `5181S33502`, 30 s at the end Station of the timetable's Closure to La Plana-Picamoixons, which no lift reaches: a Train standing at an end Station isn't between its two, and #345 draws it. The Live "inside" the timetable's C8b and C1 Closures on Saturday (0.5 and 1.0) are 30 s stands at their ends too: no Train runs inside either.
- **Against #345's own count** (7 October 13:00–13:45, with that day's bundle and Renfe's feeds stepped through the fetcher's adapter): R1 two Trains, 18.8 Train-minutes hidden, as first built and with the lift, since its one report within was a Cancelled Train's, which lifts nothing; R3 none, lifted at 13:00:12; one T2 tram for 20 s. At 14:03 R1 is lifted at once, as Live R1 Trains were seen within: what the lift does depends on the quarter-hour, and on where Renfe pins. #345's boards ("Doesn't stop here") are not measured here.

### What #261 and #260 changed

Nothing on these recordings: none of their snapshots has a report by Train number, as the fetcher began carrying them at 13:25 UTC on 10 October, after the last of the four, and replayed with no Closure the engine of `c97cf8e` draws what `b3c07a8`'s did in all seven runs. From that hour the engine matches a report that names a Train number to that number's Trip in any Network, on the day nearest in time, its own Network's feed going first (CONTEXT's Train number). What that changes can be read off Renfe's two files once, at 15:48 (section 10): they have positions for 122 Train numbers and updates for 131; 30 have a Trip in 10 Oct's bundle; four of the 14 unreported Rodalies Trains of 15:01 are among them, R11 `15812`, R14 `15052`, R16 `18126` and `18127`, so the map names those now. A recording of the hours since is needed to count the rest, and `npm run record` must first keep the Trips a report names by number (#427). Two things the matching can't do that this note can show but not count. A Train whose number differs between a Cercanías timetable and long distance's has no Trip for its report to find (section 3's twins: 17501, 15892, 14461), or finds another part of its run (R15's 17050, #442). And of 10 Oct's 3,079 Train numbers, 9 are in two Networks: four (`30501`, `30503`, `30550`, `30556`) are one Train in R15's and Zaragoza's C1's timetables, which long distance's feed numbers otherwise (17501, 17505, 17050, 17056), so a report by number never meets them; five are namesakes a report by number can meet, FEVE's four reused by Asturias' C6 and Santander's C2 (133 to 138 minutes apart) and R16's and Valencia's C6 `18094` (78 minutes apart), which the nearest time tells apart unless a Train runs that far off its timetable.

### Landed since, and still to land

Read from each branch's diff against main at 15:54 CEST on 10 October, and from origin/main at 16:31.

- **#256** (the bundle by region; PR #453, merged 16:17) landed with #356 (minutes to go by the map's time) and #352 (the card against the map, [card-against-map.md](card-against-map.md)). The four recordings were replayed again on origin/main at `4d7aa1f`: every Train every second the same, in all 15 runs, and the copy still equal to `trainsAt()` and `jumps()`.
- **#344, TRAM's hold** (`344-tram-hold`; its `standing` field is in the base, #407): engine and fetcher, TRAM only. A Train whose trip update has it at a stop it has reached, and is still to leave, stands there until it's due out. It waits for Tuesday 13 October's 07:47 and 12:47 recordings (#408), and will change TRAM's stalls (96 to 251 stalled Train-minutes a recording, of which this note's 37 minutes are one Train; #405) and its drawn-ahead. It is the one that will move numbers of this note.
- **#259** (`259-gauge-traces`): the daily build traces long distance's runs along the rails of each Line's gauge, and logs what it finds; nothing in the report or the bundle till #262 and #263 draw them. No Network on the map changes.
- **#260 landed at 15:46,** while this was being re-run, and was replayed: it is for the two long-distance Networks (`live.snap`, a Line's own `profile`), and all seven runs came out as they did on `e14713d` (#326's merge, the base before it), byte for byte.
- **Anything on main after `4d7aa1f`** is not counted.

### Which rules need a fix

Seven are drafted as `needs-triage` tickets under #234, each with its evidence, and filed when this merges (the PR carries them); two findings are comments on tickets that exist, and the rest is fine or can't be fixed from open data. Their order is the table's:

| Rule | Needs a fix? | Because |
|---|---|---|
| 1. A Renfe report pinned to one Station takes the Train as confirmed and draws it by its carried Delay | **Yes** | 29 to 224 Live Train-minutes of Rodalies' a recording, and 11 of the núcleos', drawn more than 3 km from a Station named for 10 minutes or more; in a Closure, 7.1 of R3 `5178X35534`'s. ADR-0002's #8 (holding pinned Trains made their jumps worse, 115 against 85) is what a fix for long pins would reopen, for pins that don't change |
| 2. Delay from a GPS fix (Madrid) | **Yes** | 24 to 26% of fixes snap; 0.17 to 0.23 jumps a Train-minute; 331 of 1,674 snaps (20%) are by a GPS Delay no report supported, #410's kind |
| 3. FGC's `ENDED` | **Yes, an exception** | dropped a Unit moving at the timetable's pace, 100 minutes late |
| 4. A Cercanías Trip that long distance's timetable runs under another number is drawn Scheduled, "no live Train" | **Yes** | 135 of Saturday's 146 never-named Rodalies Train-minutes; 35, 97 and 182 on the weekdays (a proxy) |
| 5. `unreported` for a Line the feed never names (FV; RL1, RL2 on some days) | **Yes** | "no live Train" all day on FV |
| 6. A Metro Block's earlier Trip carried beside the Trip its Block runs | **Small** | 0.06 to 1.0% of Live Block-minutes; 31 minutes once |
| 7. A TRAM Train named long after its Trip | **Small** | one Train, 37 minutes still, in four recordings |
| A Train number that two Networks have, which #261 matches by | **A comment on #442** | 9 of 10 Oct's 3,079 numbers; four are one Train in R15's and Zaragoza's C1's timetables that long distance numbers otherwise, five are namesakes a report by number can meet (FEVE's four, R16's and Valencia's `18094`); none seen drawn wrong, and not countable before #427 |
| Rail Trips of Renfe's file the bundle leaves out | **A comment on #412**, and tickets already | #365 (Sevilla's C4), #367 and #368 (Bilbao's C4), #412 (Trips Renfe names that the day lacks); Santander's C3 `6281S71853` is none of them |
| Quiet, then Live again | Fine, by design | 36 to 255 Train-minutes a recording on Rodalies, 57 to 114 on Madrid: a Train live data stopped naming for three updates is drawn on its timetable by its last Delay until it's named again, as CONTEXT's Scheduled has it; the jumps and stalls it costs are section 7's |
| Scheduled though named now (Madrid's 22 to 53) | Fine, by design | a GPS position unchanged since the report before counts as none (#33) |
| A Metro Block drawn nowhere | Fine | 5.8 to 19.0 Block-minutes (0.2 to 0.5% of Live Block-minutes), in runs of up to 104 s |
| A Scheduled Train inside a closed Closure | Done (#345) | 20.6 Train-minutes hidden in four recordings; 18.1, 4.6 and 3.1 left inside lifted Closures or at their ends |
| A Cancelled Trip, the rack, a bus | Fine | no Cancelled Trip and no bus is drawn; the rack is 1.1 to 1.9 Trains at a time (Live 1.1 to 1.8) |
| A Train number twice, two reports on one Trip | Fine | none; none |
| A Train parked at its last Station past its Trip's own dwell | Small, no ticket | two stays in 1,377, 7.2 Train-minutes; Renfe's delay for the C8a kept growing while it stood |

## Picks for the maintainer

The note takes the first of each; none blocks anything, and each takes a word.

1. **Is a Rodalies Trip no report names a phantom?** Counted as one, "never named": 332, 336, 524 and 146 Train-minutes. Without those that have a long-distance twin (section 3): 297, 239, 342 and 11. Counting every unreported Scheduled Train: 333, 454, 701 and 352; counting none (all may run, with no report): 0. *All, without twins, or none.*
2. **What a long pin is.** 10 minutes and 3 km: 29, 70, 224 and 27 Rodalies Train-minutes (29, 67, 109 and 27 once the weekdays' first frames cut Trains short). At 5 minutes and 2 km: 46, 183, 340 and 150; at 10 minutes and 5 km: 17, 26, 171 and 11; at 15 minutes and 3 km: 23, 57, 184 and 18. *Keep, or name another.*
3. **How long a parked stay is allowed.** Beyond the Trip's own dwell and 2 minutes, as counted: 6.5 and 0.7 Train-minutes, both Madrid's (Live and Scheduled). With no allowance for the dwell, Live seconds only, past 2 minutes: 8.6 and 2.1; past 5: 5.6 and 0; past 10: 0.6. *Keep, or another allowance.*
4. **The weekday recordings as recorded, or with the first frame's `skipped` lists** (section 6): the tables take them as recorded and put the other in parentheses where it differs. *Recorded, or listed.*
5. **Should a lifted Closure's Scheduled Trains that live data hasn't named go too?** #345 made its pick on 10 October (a Scheduled Train inside a closed Closure goes until a Live Train of its Line is seen within it) and the lift is the one question left: R1's 18.1 Train-minutes at Wednesday's midday are one Trip that Renfe names and loses, `5178X25650`, Live for 7.5 minutes inside the Closure and Scheduled for 18.1 (15.6 strictly inside); counted as drawn, as #345 has it. *Hide, or as built.*

## Not measured

- **The truth for a Train no feed names.** Renfe's visor reads Renfe's feed; Adif's and Rodalies' apps weren't reachable, and no one was at a platform. A Scheduled Train that's never named is a phantom only where it doesn't run, which only the platform tells; Renfe's boards locate 6 of the 14 unreported Trains of 15:01 with a Station-level position the open feed lacks, and a Trip's long-distance twin (section 3) is a reason to think it runs, not proof.
- **Rodalies on an ordinary weekday.** 7 October is the rains' and the Tuesday evening the night before; Saturday is the only ordinary Rodalies sample, and a weekend's.
- **The Alerts as the map had them.** `alerts.json` is one file the fetcher overwrites, read once. Renfe's has stood since 7 October 09:32 (#390), so it is what the map had on the 7th and the 10th; Tuesday night's is the 10th's Alerts with a start by then, and TRAM's, which change, are the 10th's. What was listed and taken off since isn't in it.
- **Cloudflare's CPU or the browser's frames:** only the engine's counts, on the Mac's Node.
- **Long distance's reports by Train number (#261, from 13:25 UTC on 10 October):** no recording has them, so what they change in these Networks is read off Renfe's two files once (section 10), not replayed, and the twins of section 3 are by Renfe's timetable of 10 October (which has no 6 or 7 October service: the weekdays' are a proxy), not by what its feeds named then. `npm run record` cuts a bundle without the Trips a report names by number (#427), so a recording with them is replayed on its run's whole `bundle.json`. Euskotren and Ouigo aren't on the map. Asturias' and León's Trains have no or little live data on the Saturday (#409).
- **Skipped Stations on the weekdays**, but for the first frame's lists (section 6), and FGC's quota-out days.
- **Why Madrid's fixes snap:** the numbers say where, not which of the engine's rules.
- **The Metro measures that check one rule each:** Blocks drawn out too soon (#107), Scheduled running in (#108), lag leaving and hidden snaps. Blocks drawn nowhere and twice, stalls and jumps are here.
- **Boards:** #345's ("Doesn't stop here" for a Scheduled Train at a Station inside a closed Closure, and no departure from the Closure's Stations into it) and #346's. The replay samples Trains, not boards.
- **The daily build's report** of the Trips it leaves out, for Santander's C3 `6281S71853` and Madrid's two C2 Trains in no timetable: Sevilla's C4 is #365's, Bilbao's C4 #367's and #368's, and the rest #412's.

## Files kept

Nothing of this is in the repo but this note. The scripts that made its numbers were throwaway, in a scratch directory that the end of the session clears: a copy of `src/engine.ts` with its internals exported and two probes, a sampler that replays a recording a second at a time and writes what each Train drawn was, and the scripts that count its rows into the tables above. They aren't needed to repeat it: section 1 defines every figure, and "Re-verify quickly" says how to get the inputs and what the replay does. What does stay is elsewhere: the four runs' artifacts (Actions keeps them 30 days, to 5, 6, 6 and 9 November, which #414 is to extend), each with its day's whole `bundle.json`; Renfe's Alerts of the Closures, in `src/fetcher/fixtures/alerts/renfe.json`; and `src/fixtures/replay-2026-10-07-closures.json.gz`, #345's own cut of 45 minutes of 7 October's rains, which a replay like this one reads as it is. What isn't kept anywhere is Renfe's long-distance timetable of 10 October, behind section 3's twins: the file at its address is replaced each day.

## Re-verify quickly

```sh
# The four recordings of the Record workflow (artifacts kept 30 days: to 5 November for Tuesday's, 9 for Saturday's; #414)
gh run download 38047796026 -R gariasf/viapeninsula -D rec/38047796026   # also 37533038357, 37618244697, 37646767458
# Each has the day's whole bundle.json, replay.json.gz (the snapshots as the map received them, with `at`),
# and the feeds' own trip_updates.json and vehicle_positions.json.
#
# The replay, per recording and in one process (the engine's `matched` and `last` caches key on the bundle object), on c97cf8e, and again on 4d7aa1f:
#   1. copy src/engine.ts, export its internals (matched, onMap, place, recent, delayBy, reportsByTrip, ...) and add
#      `probe.drops`, pushed where reportsByTrip() drops a report (no Trip, ENDED, a Block no Trip takes), and
#      `probe.folds`, pushed in replay() just before eases.set (what was drawn, `there`, `off`, `far`, the report's position kind);
#   2. set each network's `live` from src/networks.ts (the 6 and 7 Oct bundles carry TRAM's `near: standing`, which #343 replaced);
#   3. for the weekday runs, to put in what #346's fetcher part would have: in every snapshot
#      `skipped: [{ trip, stations: <the stops trip_updates.json lists SKIPPED>, since: <its header's time> }]`, as skippedIn() makes of one frame;
#   4. each second from the first snapshot's arrival to the last, closures = hiding(closuresAt(alerts, bundle, mapTime(at, received)),
#      seenWithin(bundle, at, received, shown), lifted) as main.ts does after each poll, shown from the minute's, `lifted` empty at the
#      first snapshot (none for the runs without Closures), then
#      onMap(bundle, at, received.filter((r) => r.at <= at), closures).of(trip) for every Trip of the day that can be on the map or that a report names;
#   5. count what section 1 defines from each second's Trains.
# Check the copy against the repo's own: its Train-seconds drawn and Live by Network equal trainsAt(bundle, at, received, closures)'s
# over the whole bundle, and its jumps equal jumps(bundle, received)'s (src/jumps.ts).
# The Alerts: src/fetcher/fixtures/alerts/renfe.json has Renfe's (unchanged since 7 October 09:32 CEST, #390).
#
# Renfe's visor, and a board:
curl -s https://tiempo-real.renfe.com/renfe-visor/flota.json | jq '.trenes | length'
curl -s https://tiempo-real.renfe.com/renfe-json-cutter/write/salidas/estacion/71801.json | jq '.estacion.salidas | length'
# FGC's own map:
curl -s https://geotren.fgc.cat/tracker/trens.geojson | jq '.features | length'
# Renfe's long-distance feeds (#261): Train numbers with a position, and with an update
curl -s https://gtfsrt.renfe.com/vehicle_positions_LD.json | jq '[.entity[].vehicle.trip.tripId[0:5]] | unique | length'
curl -s https://gtfsrt.renfe.com/trip_updates_LD.json | jq '[.entity[].tripUpdate.trip.tripId[0:5]] | unique | length'
# Renfe's long-distance timetable (a Cercanías Trip's twin: the same calls at the same minutes under another Train number)
curl -sO https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip   # trips.txt's trip_short_name is the Train number; stop_times.txt has the calls
```
