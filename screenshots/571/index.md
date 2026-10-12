# #571: TRAM's eight spelt-out Stations

Taken on 12 Oct 2026 at about 03:35: the dev map of origin/main 7c267e1's page code, on the bundle of a dry run of main (`main-*`) and of the branch (`branch-*`), the page's clock at the live snapshot's of 03:33, one headless browser, no console or page errors in the 16 views. The page code is the same in both; only the bundle's names differ. Each file is 390×844 (`-390`) or 1280×800 (`-1280`).

| file | shows |
|---|---|
| `main-ciutadella-board-390.png`, `branch-ciutadella-board-390.png` | the board of TRAM's Ciutadella (`#station=tram:ST-202`) and the names round it: title `Ciutadella\|V.O.` → `Ciutadella \| Vila Olímpica`, map labels `Wellington\|UPF` → `Wellington \| UPF`, `Ciutadella\|V.O.` → `Ciutadella \| Vila Olímpica` |
| `main-ciutadella-board-1280.png`, `branch-ciutadella-board-1280.png` | the same at 1280×800 |
| `main-ciutadella-names-390.png`, `branch-ciutadella-names-390.png` | the names there with no board (zoom 15.5) |
| `main-ciutadella-names-1280.png`, `branch-ciutadella-names-1280.png` | the same at 1280×800 |
| `main-sant-adria-board-390.png`, `branch-sant-adria-board-390.png` | the board of Estació St.Adrià (`#station=tram:ST-229`): title → `Estació de Sant Adrià`, beside Rodalies' `Sant Adrià de Besòs` |
| `main-sant-adria-board-1280.png`, `branch-sant-adria-board-1280.png` | the same at 1280×800 |
| `main-sant-adria-names-390.png`, `branch-sant-adria-names-390.png` | the names there with no board |
| `main-sant-adria-names-1280.png`, `branch-sant-adria-names-1280.png` | the same at 1280×800 |
| `pairs/<view>.png` | each of the eight views side by side, main left, branch right |
| `said-main.json`, `said-branch.json` | what each page said: the board's title and rows, the names on the map |

At Ciutadella two labels now read `Ciutadella | Vila Olímpica`, TRAM's and the Metro's L4, about 140 m apart: that is #572's interchange naming, which this is before.

## `live/`: the deployed site, after #677

Taken on 12 Oct 2026 at 11:41 by one headless browser on the site as served (Deploy run 38228605628, the daily build first), the real clock, in Catalan, the analytics beacon blocked. `pages.json` has what each page said (the board's title and first rows), the console and `pageerror`: no `pageerror`; the one console error on each page is the blocked beacon (`static.cloudflareinsights.com/beacon.min.js`, `net::ERR_FAILED`).

| file | shows |
|---|---|
| `live/tram-ciutadella-board-390.png`, `live/tram-ciutadella-board-1280.png` | the board of TRAM's Ciutadella (`#station=tram:ST-202`), 390×844 and 1280×800: title `Ciutadella \| Vila Olímpica`, with the map's labels `Wellington \| UPF` and TRAM's and the Metro's `Ciutadella \| Vila Olímpica` |
| `live/tram-sant-adria-board-390.png`, `live/tram-sant-adria-board-1280.png` | the board of Estació de Sant Adrià (`#station=tram:ST-229`): title `Estació de Sant Adrià`, beside Rodalies' `Sant Adrià de Besòs` |
| `live/tram-llevant-board-1280.png` | the board of T2's end (`#station=tram:ST-230`): title `Llevant \| Les Planes` |
| `live/data-before.json`, `live/data-after.json` | the published Catalonia track file's eight names and the count of each of TRAM's headsigns in its day files, read from the manifest at 11:00 (before the deploy) and at 11:30 (after): 12, 13 and 14 Oct go from 314, 444 and 426 Trips with the short forms to the same counts with the spelt-out ones, and none of the short forms; 11 Oct's file is yesterday's and isn't rebuilt |
