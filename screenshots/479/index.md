# #479 and #370: the moved shapes on the map, before and after

Each pair is the dev map (this branch's `src/web`, as the page draws it) with two bundles routed in for the live one, from dry runs on
the same frozen inputs (OpenStreetMap's copy of 9 Oct, Renfe's, FGC's, TMB's and TRAM's feeds of 10 Oct 22:35):

- **before**: origin/main 7fefeb7; **after**: this branch (#479). The left half of each pair is `…-before.jpg`, the right `…-after.jpg`.
- **variant B** (the pick: untagged `service=*` ways skipped) is a third image where it differs from the branch (`…-A-B.jpg`).
- `1280` = 1280×800 at 2×, cropped to the middle 800×500 CSS px; `390` = 390×844 at 3×, cropped to 390×540. Clock fixed at 03:30 Madrid
  time on 12 Oct, when no Trips run, so that no Train covers a Line, but for the Trains pairs (their time is in the table). Basemap
  OpenFreeMap's, as the page draws it. Console and `pageerror` read on every page: nothing but the 404s of the `snapshot.json` and
  `alerts.json` I don't serve and OpenFreeMap's own style warnings (`highway-shield` filters); no `pageerror`.
- The metres are the largest distance between the two traces there, checked by brute force against a second implementation.
- Several moves are of **which track of a double track** a direction runs, and both directions are drawn in the Line's colour, so a swap
  of tracks does not show: the pair reads the same (`asturias-c1-caudalia`). That is a metre-scale move you can't see at any zoom.

## 1. Cercanías Asturias, C1 and C3 between Villallana and Mieres, and Ujo (#370's last box)

| Pair | Where | Shape, metres | What to see |
|---|---|---|---|
| `asturias-c1-villallana-ujo-1280` / `-390` | 43.193, −5.796, z14.6 | C1's way back (`20_C1_INV`): up to 527 m (526.6 at 43.18816,−5.79612; 485.6 at 43.18743,−5.79879; 325.3 at 43.19299,−5.79770; 192.7 at 43.19747,−5.79103); the trace is 484 m shorter (74,732 → 74,248 m) | Before: both directions of C1 on the road-side (AS-375) alignment between Villallana and Ujo, the other alignment (the grey dashes through El Pedriscu and El Riquixu) undrawn. After: the way back on that other alignment, the way out (`20_C1`) on the road-side one. That alignment was cut off at both ends by six ways with no gauge tag: 12528312 (65 m) at Villallana and, at Ujo, 12528311 (183 m, 143 m run) and 428597896 (526 m); 428597897 (626 m, 595 m run) is the way out's. The crossover 1471639294 and 1075571037 (north of Mieres-Puente) are on no trace |
| `asturias-lines-z13-villallana-ujo-1280` | 43.195, −5.795, z13 | the same, from further away | Villallana's station dot and Ujo's, with the second alignment between them |
| `asturias-lines-z11-oviedo-mieres-1280` / `-390` | 43.28, −5.80, z11 | the Lines side by side, Oviedo to Pola de Lena | nothing broken; C1 and C8 (orange) by Mieres del Camín are drawn apart where they lay on each other before |
| `asturias-c1-villallana-526m-1280` / `-390` | 43.18816, −5.79612, z16 | C1 way back, 526.6 m | the 527 m place, 1.3 km south of Ujo Taruelo |
| `asturias-c1-villallana-485m-1280` | 43.18743, −5.79879, z16 | C1 way back, 485.6 m | just north of Villallana: the trace leaves the road-side alignment by 12528312 and runs the other |
| `asturias-c1-ujo-south-325m-1280` / `-390` | 43.19299, −5.79770, z16 | C1 way back, 325.3 m | two alignments of their own, 100–500 m apart from 200 m south of Ujo on (main: 0.0 m from 250 m south of it) |
| `asturias-c1-ujo-south-193m-1280` | 43.19747, −5.79103, z16 | C1 way back, 192.7 m (and 188 m 400 m on) | the left-hand alignment comes back to Ujo |
| `asturias-c1-ujo-station-1280` / `-390` | Ujo (adif:15200) 43.2047, −5.7926, z17 | C1: both traces 20 m apart at the Station; the Station is 10.0 m from the nearest trace on main (C1) and 5.2 m on the branch (C1's way back) | After: C1 on two tracks both north and south of the Station, one running straight past the Station's dot on the left-hand alignment, the other curving east. Before: both on the east pair, the left-hand track undrawn |
| `asturias-c1-ujo-north-1280` / `-390` | 43.2085, −5.7919, z17 | C1 up to 16.6 m (43.2069,−5.7922); the two traces 9–19 m apart 500–50 m north of the Station (main 5–12 m) | two tracks north of Ujo before and after; 2 km to 600 m north they are 3.3–4.0 m apart on both |
| `asturias-c1-caudalia-1280` | 43.2333, −5.7834, z17 | C1 and C1's way back 4.9 m | the other track of the double track: nothing to see (both directions are red) |
| `asturias-trains-northbound-0810-1280` / `-390` | 43.1945, −5.7955, z14.4, 08:10:30 on Mon 12 Oct | C1's Train 2083L22007C1 (Villallana 08:09, Ujo 08:12) | the Train's pill: before on the road-side alignment, after on the left-hand one |
| `asturias-trains-ujo-0811-1280` / `-390` | Ujo 43.2047, −5.7926, z16, 08:11:40 | the northbound Train 20 s before Ujo | before: on the east pair, 20 m from the Station's dot; after: on the track beside it |

## 2. Other Asturias shapes the move reaches (all 23 of its shapes move; none of the C4–C8 by an untagged way)

| Pair | Where | Shape, metres | What to see |
|---|---|---|---|
| `asturias-c1-lugones-1280` | 43.3973, −5.8221, z17 | C1, C3 and their way backs, up to 22.4 m | the other track of a double track kept to the left |
| `asturias-c3-lugo-de-llanera-1280` | 43.4519, −5.8175, z16 | C1 and C3, up to 19 m (43.44937,−5.81774) | the two traces are 5–19 m apart there (the labels C1 and C3 trade sides) |
| `asturias-c5a-el-berron-1280` | 43.38232, −5.70222, z16 | C5a and its way back, 88.4 m | the junction at El Berrón: the way through it differs (a connecting curve against the straight; no untagged way) |
| `asturias-c3-san-juan-de-nieva-1280` | 43.58958, −5.93221, z17 | C3's way back, 48.8 m | the trace starts at another point of the terminus' rails, 41 m south; the Station is 28.2 → 35.2 m from C3 |
| `asturias-c1-gijon-sanz-crespo-1280` | 43.53778, −5.67599, z17 | C1's way back 43.0 m, C5/C5a 32 m | both C1 strokes run to the terminus on two tracks; the Station is 50.8 → 15.9 m from the nearest C1 trace |
| `asturias-c4-cudillero-1280` | 43.55091, −6.15218, z17 | C4's way back and C7's own trace of a Trip, 40.1 m | the terminus: one of the two traces ends 40 m short of the other |

## 3. The other Networks #479's second box names

| Pair | Where | Shape, metres | Ways, what to see |
|---|---|---|---|
| `madrid-c4b-colmenar-viejo-1280` / `-390` (`-A-B`) | 40.64495, −3.77662, z17 | Madrid C4b's way back, 34.1 m, 31 m shorter | way 199211030, `service=siding`, no gauge tag, 286 m (track 4): after, the way back runs the lowest of the tracks drawn, from the west of the Station on; variant B (and main) the upper pair |
| `madrid-c8b-los-molinos-1280` | 40.70422, −4.06554, z17 | Madrid C8b, 4.3 m | way 756111094 (69 m, no service tag) in place of the track beside it |
| `santander-c1-nueva-montana-1280` | 43.42684, −3.84821, z15 | Santander C1's way back, 27.3 m over 4.4 km, 22 m shorter | the two main-line ways with no gauge tag 2.4 and 2.9 km to the north-east, 1289845869 (853 m) and 1289843498 (758 m), both usage=main, which the trace runs (0.0 m) where main's runs the track 2.5–4 m beside them; the 4.4 km is how far the two traces keep apart |
| `santander-c1-barcena-1280` / `-390` (`-A-B`) | 43.12857, −4.05745, z17 | Santander C1 (`62_C1:back`), 5.2 m | after (A), a second stroke 5 m beside the first: the crossover 1281414183 (39 m, `service=crossover`, 600 m east) takes the trace to the other track, which B can't; main and B have one |
| `santander-c1-reinosa-1280` (`-A-B`) | 42.99515, −4.13971, z17 | Santander C1's way back, 6.2 m (A against B) | the untagged yard ways 787079222 and 787079223 (5 and 8 m away) are in A's rails and not B's, and the trace runs the track 9 m from them, where B's runs through their junction |
| `murcia-alicante-c1-elche-1280` | 38.27241, −0.69374, z17 | Murcia-Alicante C1, 10.8 m | way 569284153 (no gauge tag, 139 m run of 360): a second C1 stroke on the northern track, where there was one |
| `murcia-alicante-c1-elche-east-1280` (`-A-B`) | 38.2789, −0.65259, z17 | Murcia-Alicante C1, 5.7 m (A against B) | crossover 445030477 (6 m run), siding 445030635 and the untagged 554011284 (715 m) |
| `sevilla-c3-villanueva-del-rio-1280` / `-390` (`-A-B`) | 37.66058, −5.71138, z17 | Sevilla C3's way back, 4.3 m | the untagged yard 295279883 (`service=yard`, 167 m away) is in A's rails and not B's: A's trace runs 9 m from it, B's 25 m, as main's; B leaves this shape as main has it |

## 4. Variant B, where it differs from the branch

`-A-B` files: Madrid C4b's way back (34.1 m: A moves it, B and main don't), Sevilla C3's way back (4.3 m, same), Santander C1's way
out and back (5.2 and 6.2 m), Murcia-Alicante C1 (5.7 m of its 10.8). **Asturias' 23 shapes are the same under B**: C1 and C1_INV each
lose one point (≤ 0.2 m), no shape moves; B changes no spot of the build report.
