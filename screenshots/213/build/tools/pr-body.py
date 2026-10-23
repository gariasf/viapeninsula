# #213 ship: the PR's body, the build's pr.md brought up to the ship: the decks' gate, the sizes, the checks, box 3's sheets
# and box 5's tables (gate-tables.py's output, its first argument), and what's left.
#   python3 -I pr-body.py <tables.md> <pr.md> <out>
import sys

tables, src, out = sys.argv[1:4]
s = open(src).read()
SHEETS = 'https://github.com/gariasf/viapeninsula/blob/screenshots-213/screenshots/213/build/sheets'
reps = [
    ("For #213. This builds the maintainer's picks of 22 Oct for a desktop (acceptance boxes 3 and 4). Box 5's perf gate and the sign-off come later.",
     "For #213. This builds the maintainer's picks of 22 Oct for a desktop (acceptance boxes 3 to 5). The sign-off is the maintainer's."),
    ("- **A phone's code grows 1,326 B brotli** (`vite build`s of 23 Oct, against main's): the page's file +633 B, the Lines' worker +594 B, MapLibre's worker +97 B, the names' worker +2 B.",
     "- **A phone's code grows 1,486 B brotli** (`vite build`s of 23 Oct, against main's): the page's file +787 B, the Lines' worker +600 B, MapLibre's worker +97 B, the names' worker +2 B."),
    ("3,122 B (`decks.js` 2,445 B, `deckLayers.js` 677 B)", "3,120 B (`decks.js` 2,443 B, `deckLayers.js` 677 B)"),
    ("## The harness\n",
     """## The decks begin at zoom 13

The first perf gate failed on S3's join, where eight Cercanías regions join as the map zooms in through zoom 6. Its longest frame was 283–292 ms against main's 241–268.
- **A CPU profile** of that frame showed the same work on both trees, about 10% slower on the branch, and no decks code in it. The frame is `show()` laying out the joined Lines and Stations, MapLibre parsing the towns' filter, and its posts to its workers.
- **With the decks off,** the branch's frame was 242–250 ms, as main's.

A desktop now **begins its decks the first time its map reaches zoom 13**, the mouths' zoom, in an idle callback (`decksGate()`, ADR-0016).
- Until then, it asks for no decks file, its Lines' worker cuts no stroke at a bridge, and the decks' layers aren't added. No deck is drawn further out.
- Then it asks for the decks files of the tracks it has and keeps each with its track (`keepDecks()`). The worker loads its decks module, and makes those regions' Lines again with them (`handAgain()`, a file handed again under its key).
- A later look asks for its tracks' decks files beside them, as before.

Three commits, each re-gated:
- `8d8979ce` held back the worker's decks and their layers. S3 was still +17 ms, two frames.
- `4b136473` held back the decks files too. S3 went to −9 ms.
- `ab47758d` held back the worker's decks module, which a cold load's first join had waited for. S2's frozen frames had been +25 ms, beyond the spread, in that batch.

## The harness
"""),
    ("- **`npm run check`, and `npx vitest run --dir src`:** 56 files, 1,305 tests. New tests cover:",
     "- **`npm run check`, and `npx vitest run --dir src`:** 56 files, 1,309 tests. New tests cover:"),
    ("  - the worker drawing the Lines on the ground when the decks' module fails to load.",
     "  - the worker drawing the Lines on the ground when the decks' module fails to load;\n  - the decks begun the first time the map reaches zoom 13, a decks file kept with a track read before it, and the worker's Lines made again with it."),
    ("## Left for the sign-off\n\n- **Box 5's perf:** `npm run perf -- S2 S3 S4 S5bcn S8 --pitch 45`, on a desktop and a phone, against main.\n- **The full shot set** at the sheet's views, light and dark, with hover and focus.\n",
     f"""## Shots (box 3)

The page harness, 22 Oct's 08:30 capture through `--at`, the branch's dry run of 22 Oct served to both trees. Each view was shot at second 40 of the page's clock, laptop 1280×800, tilted 45°, light and dark.
- [the viaduct]({SHEETS}/viaduct.jpg), [Garraf]({SHEETS}/garraf.jpg), [L'Hospitalet]({SHEETS}/hospitalet.jpg), [Barcelona]({SHEETS}/bcn.jpg) and [Madrid]({SHEETS}/mad.jpg), with main and the branch as rows;
- [L'Hospitalet's pointer, tap and a Train on its bridge]({SHEETS}/hospitalet-hover-tap-train.jpg);
- [the phone, flat, against main]({SHEETS}/phone-bcn.jpg): 0.63% of pixels differ, all at moving Trains, and no decks file is asked for.

## Perf (box 5)

{open(tables).read().strip()}

## Left for the sign-off

"""),
    ("- **The phone's +1,326 B of code,** the maintainer's call.", "- **The phone's +1,486 B of code,** the maintainer's call."),
]
for a, b in reps:
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
open(out, 'w').write(s)
print(out, len(s))
