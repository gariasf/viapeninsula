# #501: another place's dot near a name costs it Lines under it

## The dev map, before the merge: main against the branch

Taken on 12 Oct 2026. Page of origin/main 3208d9a5 (**main**) against `501-name-over-dot` at a75d5283 (**branch**, on the same 3208d9a5; the
branch's tip when merged is on origin/main 4051501e, the same code), on the
bundle of a dry build of 3208d9a5 on 12 Oct (16 regions: the 15 núcleos and long distance's, which #262 put on the map), the page's
clock at Tue 13 Oct 12:00, the basemap on (OpenFreeMap), no Live Trains (`tools/shots.mjs`, `tools/specs-501.json` and
`specs-501b.json`, in the builder's scratchpad, not in the repo), with the Mac's GPU (Metal). Console and `pageerror` read on every shot: none.
1280 x 800 unless it says phone (390 x 844 at x2). The review's earlier set (the page of 7c267e1) is not on this branch.

Each `<name>-z<zoom>-<light|dark>-<main|branch>.jpg` is one page; `cmp/<name>-z<zoom>-<scheme>.jpg` puts main (left) and the branch
(right) side by side, captioned. `crop/` has close-ups at x3 of a pair, main left and branch right.

| pair (`cmp/`) | view | what it shows |
|---|---|---|
| `abando-z15-light`, `abando-z15-dark`, `abando-phone-z15-light` | Bilbao, zoom 15, Abando in the middle (and the phone) | **box 3.** Main: La Concordia's name starts directly over Abando's dot, so the two names make one row over the two dots. Branch: La Concordia's name is below and right of its own dot, clear of Abando's. `crop/abando-z15-pair.jpg` |
| `abando-z12-light`, `abando-z12-dark`, `abando-phone-z12-light` | Bilbao, zoom 12 | **box 3.** Main: Abando's name lies over San Mamés' dot; San Mamés and Olabeaga have no name. Branch: San Mamés and Olabeaga are named, and Abando's name is right of its dot; the cost is that La Concordia's and Zabalburu's names are not drawn (their collision lost). `crop/abando-z12-pair.jpg` |
| `madrid-atocha-z12-light`, `madrid-atocha-z12-dark` | Madrid, zoom 12 | **The ticket's second case doesn't show on today's base.** Atocha's name doesn't lie over Embajadores' dot on main (the sweep finds no dot under a name there on either page); what differs is Embajadores' own name, which goes from below its dot to above it. `crop/atocha-z12-pair.jpg` |
| `barcelona-pg-z12-light` | Barcelona's core, zoom 12 | the cost: Passeig de Gràcia's tier name (bold) goes from below-right of its dot to above-left of it and lies over the dots of Provença and Diagonal, which main's didn't; many more names are drawn (the 54 gained against 26 lost at zoom 12). |
| `barcelona-gracia-z12-light` | Barcelona, Gràcia and Sant Gervasi, zoom 12 | the same core, 1.3 km north |
| `sant-josep-z12-light` | L'Hospitalet, zoom 12 | the name that goes over most Lines more (Sant Josep +21, 2 to 23): on the branch it is then not drawn, and Can Serra is |
| `universitat-urgell-z12-light` | Barcelona, zoom 12 | Universitat +9 and Urgell +8 Lines more (the sweep's names over 8 or more Lines more), in the core |
| `verdaguer-z13-light` | Barcelona, zoom 13 | Verdaguer +8 Lines at zoom 13, with El Prat Estació and La Sagrera-Meridiana +9 |

What to look at: whether the names that moved read better than they did (Abando and La Concordia at 15 are the ticket's case), and
which went over more Lines (the last four rows). Numbers for each are in `picks.md` and the PR. Long distance's Lines (Intercity
and Alvia names along the C1 and C4 tracks at Abando, AVE at Barcelona-Sants) are on these pages and weren't on the review's.
