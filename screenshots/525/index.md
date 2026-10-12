# #525: the basemap's cities' labels over the Lines' names from zoom 7 to 10

## The dev map, before the merge: main against the branch (and the literal variant)

Taken on 12 Oct 2026. Page of origin/main 3208d9a5 (**main**) against `525-city-name-over-label` at 95a8fa18 (**branch**, on the same 3208d9a5; the
branch's tip when merged is on origin/main 4051501e, the same code), and
for PICK 2 the branch with its one `, 'stations'` removed (**literal**, `tools/variant-525-literal-above.patch`: the copies placed
above everything, with no `before`). The bundle of a dry build of 3208d9a5 on 12 Oct (16 regions: the 15 núcleos and long distance's,
which #262 put on the map), the page's clock at Tue 13 Oct 12:00, the basemap on (OpenFreeMap, positron and the dark one), no Live
Trains (`tools/shots.mjs`, `tools/specs-525.json`). Console and `pageerror` read on every shot: none (but Chrome's own `GL Driver
Message ... GPU stall` on the first). 1280 x 800 unless it says phone (390 x 844 at x2). The Santander shots were taken with software GL
(SwiftShader), the Barcelona, Madrid and Sevilla ones with the Mac's GPU (Metal): a page differs between them in anti-aliasing only, and
the sides of one pair share a backend.

Each `<name>-z<zoom>-<light|dark>-<main|branch|literal>.jpg` is one page. `cmp-main-branch/<name>.jpg` puts main (left) and the
branch (right) side by side, captioned; `cmp-branch-literal/` the branch (left) and the literal variant (right). `crop/` has
close-ups at x3 of the places named below.

| pair | view | what it shows |
|---|---|---|
| `cmp-main-branch/santander-z8-light` | `#map=8/43.44/-3.84`, the ticket's view | **box 1.** Main: no "Santander" by its Station (nor "El Astillero"). Branch: "Santander" is drawn above-left of its Station, at the bay's head, and "El Astillero" below it. `crop/santander-z8-light-main-branch-literal.jpg` |
| `cmp-main-branch/santander-z8-dark` | the same, dark basemap | **box 1, dark.** Main: no "SANTANDER" ("EL ASTILLERO" is there). Branch: "SANTANDER" is drawn. `crop/santander-z8-dark-main-branch-literal.jpg` |
| `cmp-main-branch/santander-phone-z8-light` | the same, 390 x 844 at x2 | **box 1, the phone.** Main: no "Santander". Branch: "Santander" over its Station, "El Astillero" under it. |
| `cmp-main-branch/santander-z9-light` | the same at zoom 9 | **box 1 at 9.** Main: no "Santander" ("San Román de la Llanilla", a village's label, is drawn at its place). Branch: "Santander" is drawn and that village's label is not. |
| `cmp-main-branch/santander-z7-light` | the same at zoom 7, the whole Cantabrian coast | **box 2's pattern.** Santander is drawn on both. Branch: "Oviedo / Uviéu" is drawn where main has none (`crop/asturias-z7-light-main-branch.jpg`: main draws "La Pola Llaviana / Pola de Laviana", a town's, over the Asturian dots, which the branch loses to Oviedo's), and "Burgos" is drawn where main has the Line name "Alvia" (`crop/burgos-z7-light-main-branch.jpg`). |
| `crop/vitoria-z8-light-main-branch.jpg` | zoom 8, Vitoria-Gasteiz (the same page as the z8 pair, bottom right) | the cost: main draws the Line name "Alvia" beside the Station, branch "Vitoria-Gasteiz" and no "Alvia" there. Long distance's Lines are all one colour, so their names are what tells Alvia from Intercity and AVE; each Line's name is drawn where it fits along it (the z7 pair shows them). |
| `cmp-main-branch/madrid-z8-light`, `cmp-main-branch/sevilla-z8-light` | `#map=8/40.4169/-3.7034` and `#map=8/37.3887/-5.9954` | **box 2.** Main has no "Madrid" and no "Sevilla" at zoom 8 (it draws "Majadahonda" and "Alcalá de Guadaíra" where they would be). Branch: "Madrid" (and Alcobendas, Móstoles, Guadalajara), "Sevilla" (and Dos Hermanas); "Majadahonda" is the one lost. |
| `cmp-main-branch/barcelona-z9-light` | `#map=9/41.3825/2.177` | **box 2's exception.** "Barcelona" is drawn on neither (nor on the literal variant): the tier names (Barcelona-Sants, Barcelona - Plaça Catalunya, Barcelona Estació de França) are there, but the literal variant places its copies before them and still doesn't draw it. Badalona's and Rubí's labels are drawn on the branch and not on main. |
| `cmp-branch-literal/barcelona-z9-light` | the same | **PICK 2.** Literal: "L'Hospitalet de Llobregat" (a city's label) is drawn over the place of the tier names Barcelona-Sants and Estació de França, which are not drawn; "Barcelona" is not drawn either. |
| `cmp-main-branch/barcelona-z10-light`, `santander-z10-light` (and `cmp-branch-literal/`) | zoom 10 | **box 3.** The three pages are pixel for pixel the same at zoom 10 (a compare of main, the branch and the literal variant: 0 pixels differ). |
| `cmp-branch-literal/santander-z7-light`, `crop/bilbao-z7-main-branch-literal.jpg` | zoom 7, Bilbao | **PICK 2.** Main and branch: "Bilbao" lies under the Cercanías dots and the Trains' pills (the basemap's own order). Literal: "Bilbao" is drawn over the dots, fully readable, its letters covering the dots' rings. |
| `cmp-branch-literal/santander-z8-light`, `-z8-dark`, `-z9-light`, `-phone-z8-light` | the same views | **PICK 2.** The branch and the literal variant look the same at Santander at zoom 8 and 9: the difference is where a city's label falls on a Station's dot, a Train's pill or a tier name, which this view hasn't many of. |

What to look at: that "Santander" is by its Station on all three (light, dark, phone), and the cost rows: a Line's name or a town's
label lost where a city's is drawn (Alvia at Burgos and Vitoria, La Pola de Laviana at Oviedo). Counts for all núcleos are in
`picks.md`, `pr-525.md` and `wrapup-525.md`.
