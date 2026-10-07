# Alerts in the operators' own words, and Closures only where the map can place them

#279 has the map say what's gone wrong: part of a Line closed, buses in place of Trains, a single track. Its research note ([docs/research/alerts.md](../research/alerts.md), 7 Oct 2026) found that Renfe's alerts name Lines or a Station, never a stretch, with a start, no end and a text, Spanish but for Rodalies' second entry in Catalan; that TRAM's name Lines, with dates, the stretch in their text, in Catalan, Spanish and English; and that TMB's and TRAM's terms forbid altering what they publish. Decided with the maintainer in #279's grill, 7 Oct 2026:

- **Sources:** Renfe's alerts and TRAM's. TMB's, all about getting into a Station, and FGC's, notes on single Trips, can come later, each in a ticket of its own.
- **The operators' own words, never translated.** An Alert shows in the viewer's language where its feed has it, and otherwise in the feed's own, marked with its language and whose words they are. An English-speaking viewer reads Renfe's in Spanish.
- **All of them, as given.** Every Alert on a Line or a Station shows, newest first, with when it began. None is hidden for its age or its kind, and Live Trains don't overrule one: they already show what runs beside an Alert gone stale.
- **The map draws only the Closures it can place:** where an Alert's words, read with their verb, or the timetable's replacement buses put a Line's Trains out of two of its Stations on its track, or down to a single track between them. Every other Alert is text: on a tap on a Closure or a stroke, in a followed Train's card, on a Station's board, and in #318's Now.
- **Alerts are a file of their own on R2,** `alerts.json`, which the fetcher writes when it changes, beside the snapshot (ADR-0003).

## Considered Options

- **Machine-translating Renfe's Alerts**, which its CC BY 4.0 licence allows. Rejected: TMB's and TRAM's terms forbid it for theirs, a closure translated wrong misleads, and the operator's words are what a viewer can check.
- **A mark on the map for every Alert**, at its Station or along its Line. Rejected: most Alerts name no place, and the map already carries Trains, names and badges.
- **Hiding Alerts older than some days, or letting Live Trains overrule a Line-wide one.** Rejected: guesses that could hide a real closure.
- **Alerts in the snapshot.** Rejected: they rarely change, and the page keeps every snapshot for 35 minutes.
- **A pill under the legend counting the Alerts in view.** Rejected: the banner pill is for live data's state, and the list is Now's.

## Consequences

- ADR-0003 is amended when the fetcher writes `alerts.json`.
- Where no Train of a Line runs the closed part in the whole timetable, as on R3 south of La Garriga on 7 Oct, the map has no track to draw its Closure on, and the Alert stays text.
- Long distance has no alerts feed (Renfe's `alerts_LD` answers 404), so its road sections inside a run (#269) wait for long distance (#258).
