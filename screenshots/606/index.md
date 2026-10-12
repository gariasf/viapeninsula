# #606: a Station's name after a, de, per, fins a and cap a in Catalan and Galician

## `live/`: the deployed site, after #676, which has the maintainer's pick of lower case

Taken on 12 Oct 2026 at 11:01 by one headless browser on the site as served, the real clock, the analytics beacon blocked, in Catalan (`ca-ES`) and Galician (`gl-ES`). `live606.json` has what each page said (the board's follow buttons, the Back button, the card's text), the console and `pageerror`: no `pageerror`; the one console error on each page is the blocked beacon (`static.cloudflareinsights.com/beacon.min.js`, `net::ERR_FAILED`), and the Galician page's three tiles dropped as the view moved.

| file | shows |
|---|---|
| `live/ca-masnou-board-1280.png` | El Masnou's board's first Train opened, 1280×800: Back `Torna al Masnou`, and its follow buttons `Segueix el tren R1 cap a l'Hospitalet de Llobregat` (in `live606.json`); the title, a name on its own, is `L'Hospitalet de Llobregat` |
| `live/ca-hospitalet-board-390.png` | L'Hospitalet de Llobregat's board's first Train opened, 390×844: `Surt de l'Hospitalet de Llobregat a les 11:03`, Back `Torna a l'Hospitalet de Llobregat`, strip `14 estacions més, fins a Mataró (11:59)` |
| `live/gl-ponto-board-390.png` | O Ponto's board's first Train opened, Galician, 390×844: Back `Volver ao Ponto`, `Sae de Ferrol ás 13:45`, strip `11 estacións máis, ata San Sadurniño (14:10)` |

## `dev/`: the review's page check, before the maintainer's pick

Taken on 12 Oct 2026 at about 10:12–10:29 by the review: the dev map of the branch's code, before its last commit (La, Les and L' in lower case), on the bundle of a dry run of origin/main 3208d9a5, the page's clock fixed at the time in each file's name in `check606-rv*.json`. So where a text has `L'Hospitalet` or `La Garriga` after a preposition, it's as published there, and lower case since.

| file | shows |
|---|---|
| `dev/ca-escorial-follow-390.png` | a C8a Train followed to El Escorial, Catalan: `1 estació més, fins a El Escorial (6:52)` (El before a vowel, as published) |
| `dev/ca-hospitalet-back-390.png` | the Back button of a Train opened from L'Hospitalet's board, Catalan: `Torna a L'Hospitalet de Llobregat` (before the pick), and `fins a Sant Vicenç de Calders` |
| `dev/ca-oviedo-board-390.png` | Oviedo's board in Catalan: the rows' headsign `El Berrón` (its follow button reads `cap al Berrón`) |
| `dev/gl-cuqueira-back-390.png` | the Back button of a Train opened from A Cuqueira's board, Galician: `Volver á Cuqueira`, and `7 estacións máis, ata Ortigueira (10:52)` |
| `dev/ca-masnou-arriving-1280.png` | a Train 30 s from El Masnou, Catalan, at zoom 11: the strip's row `Entre Ocata i El Masnou` (between) |
| `dev/ca-masnou-arriving-z9-1280.png` | the same Train with the map zoomed out to 9: the card's label `ARRIBANT A` / `El Masnou` and the strip's row `Arribant al Masnou` |
| `dev/check606-rv.json`, `check606-rv2.json`, `check606-rv3.json` | what each of the 20 pages said (12, 4 and 4): the board's rows, the Back button, the card's text, the console and `pageerror` (no `pageerror`; the four zoomed-out visits of `-rv3` each logged `TimeoutError: signal timed out`, a file given up after 20 s of silence, #595's limit, with the Mac at load 40–120) |
