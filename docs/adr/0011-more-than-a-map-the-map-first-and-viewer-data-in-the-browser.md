# More than a map: the map first, and the viewer's data in their browser

#318 makes the site more than a map, after railisland's ([railisland.tw](https://railisland.tw)), whose tab bar opens sheets over its live map: Lookup, Highlights, Favourites, Passport and More. railisland keeps its favourites and passport in the browser, and its statistics in a database that a Worker writes every minute. Decided with the maintainer in #318's grill, 7 Oct 2026:

- **For whom:** commuters and railfans alike.
- **The map stays the first screen.** Every visit and every link opens on the map, and every other screen opens over it, as #321's sheet does.
- **The screens:** Search, for Stations, Lines and Train numbers; Favourites, Stations and Lines; a Line's own screen, its Stations as a strip with its Trains on it now; Now, what's wrong and what's notable on the map at this moment; and after those, a Passport of stamps (#332). A Station's and a Train's screens are #321's sheets.
- **The viewer's data stays in their browser.** Favourites and the Passport are kept in the browser's storage, with no account and no API that runs for each viewer. Viewers still read only cached files (ADR-0003).
- **The past comes as files.** History, such as punctuality statistics (#329), reaches viewers only as static files that the fetcher or the daily build writes to R2.
- **Links:** what can be shared is what the map shows: a view, a followed Train, a Station's board, a Line's screen (`line=`) and Now (`now`). Search, Favourites and the Passport are passing or personal, and put nothing in the link. The link is rewritten in place, so Back doesn't step through screens (#322).

## Considered Options

- **Accounts, so that Favourites and the Passport follow the viewer to another device**, as railisland's paid pass does. Rejected: a server for each viewer, costs that grow with viewers, and personal data to keep, against v1's no cookies and no tracking (#1).
- **A database written every minute, for Delay history and statistics**, as railisland's is. Rejected: daily files on R2 give the same numbers with nothing run for each viewer.
- **A start screen before the map**, with Search and Favourites. Rejected: the moving map is what the site is, and every shared link opens on it.
- **Screens of their own for a Station and a Train.** Rejected: #321's sheets, pulled up, are those.
- **A share button, a switch between light and dark, and a welcome card.** Rejected: the browser shares the link, dark follows the system's setting (#316), and About's "Reading the map" (#321) explains the map.
- **A search field across the top,** with Now and Nearby as buttons under the die (#328's B). Rejected (the maintainer, 10 Oct 2026): it takes about the room a tab bar does, but its column of three buttons, with the map's own Tilt and Centre (#326, #325), doesn't fit between the corners and an open sheet, and the Passport would have no place. Its field can still be added to the Search tab's sheet.
- **A chip for each run of a Line, instead of one strip.** Rejected (the maintainer, 10 Oct 2026): it hides the other runs' Stations and Trains behind a choice, and R4 alone has nine. It can be added over the same strip later.
- **Time travel and playback.** Rejected for now: it's the map's, not a screen, and stays on #1's Later list.

## Consequences

- A viewer who clears their browser's data, or changes device, loses their Favourites and Passport.
- The screens are reached by a tab bar on a phone, Search · Nearby · Now · Favourites, and a rail down the left edge on a wide window, with the Passport (#332) as a fifth tab. It was tried in a mockup first (#328), as the cards were in #212, and picked on 10 Oct 2026. Each tab opens a sheet over the map exactly as #321's do, the legend and the language stay in #321's corners, and the die moves into Now.
- A Line's screen is one strip, marked where a day's Trips start or end and where a spur goes on, with each Train a row on it. Now shows only what's true at this moment: the first and last Trains near their time, Trains to and from France running or leaving within the hour, and funiculars while running.
- v1's Later list (#1) no longer has passport and badges, now #318's. Stored history and punctuality statistics become #329, which has the fetcher write more files, and amends ADR-0003 when it lands.
