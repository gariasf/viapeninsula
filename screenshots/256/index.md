# #256 sign-off shots

Main's page (47f0070) and the page of branch `256-bundle-by-region` (rebased onto 47f0070, #423), each built for the web and served locally, each reading its own build's `out/`: the dry runs of 10 Oct 2026 on the same cached feeds and the same OpenStreetMap download, main's one bundle and the branch's 15 regions. Both serve one saved snapshot (generated 12:28:13 UTC on 10 Oct, 340 reports) with the clock fixed 5 s after it, so Live Trains stand still. Light theme, English, pixel ratio 1, 9 s after the hash, one page at a time. In a `main-then-branch` image, **main is on the left and the branch on the right**: two 1280×800 windows (wide, 2560×800) or two 390×844 phones (780×844).

No `pageerror` and nothing of ours in the console on the 44 pages of the comparison; the basemap style's `highway-shield-*` filter warnings, 3 a page, are the same on both sides.

Pixels that differ, of 1,024,000 (wide) and 329,160 (phone), by `magick a b -compose difference -composite -colorspace Gray -threshold 0`:

| File | View | Wide | Phone | What it shows |
|---|---|---|---|---|
| `pr-wide-sants-z14-main-then-branch.png`, `pr-phone-sants-z14-…` | Barcelona-Sants, zoom 14 (41.3792, 2.1405) | 0 | 0 | Catalonia's four Networks, which are one region: pixel for pixel main's. |
| `pr-wide-sants-z16-main-then-branch.png`, `pr-phone-sants-z16-…` | Barcelona-Sants, zoom 16 | 0 | 0 | The same, closer in. |
| `pr-wide-atocha-z14-main-then-branch.png`, `pr-phone-atocha-z14-…` | Madrid-Atocha, zoom 14 (40.4066, −3.6895) | 103 | 66 | The same Lines in the same order; at the fork south-east of the station they cross a little differently. |
| `pr-phone-atocha-z14-crop-main-then-branch.png` | The phone's Atocha at zoom 14, cropped to that fork, main then branch | | | The pixels in question, at 1:1. |
| `pr-wide-atocha-z12-main-then-branch.png`, `pr-phone-atocha-z12-…` | Madrid-Atocha, zoom 12 | 1,728 | 1,729 | The same Lines in the same order, a few pixels shifted along the junction curves, where a curve between Stretches is made from its other end in the region's own graph (#448). |
| `pr-wide-atocha-z12-differences-in-red.png` | The same view, wide | | | The pixels that differ between the two marked in red, drawn thicker than they are. They lie along the junction curves round Atocha and nowhere else. |
| `pr-wide-leon-z12-main-then-branch.png`, `pr-phone-leon-z12-…` | La Asunción Universidad, León, zoom 12 (42.5985, −5.5660) | 2,077 | 2,270 | León's C1 and Bilbao's C4 share 117.6 km of FEVE's track north of the city (#368). As two regions they're drawn over each other there, each in the middle of the track, where main drew them side by side. |
| `pr-wide-leon-z12-differences-in-red.png` | The same view, wide | | | The differences in red: that track. |
| `smoke-old-page.png` | Main's page reading the branch's manifest, Barcelona-Sants zoom 14, 1280×800 | | | What a page opened in the gap between the daily build's publish and the deploy shows: the basemap, the header pill and the credit, and no Lines, Stations or Trains. `pageerror: Cannot read properties of undefined (reading 'find')`; no bundle file asked. |
| `smoke-no-madrid-atocha.png` | The branch's page with Madrid's track file answered 404, Madrid-Atocha zoom 14, 1280×800 | | | The region whose file fails is left out and the rest drawn: 272 Trains in the banner (202 live, 70 scheduled), nothing of Madrid's, a 404 warning in the console and no page error. The next look asks for it again. |

Not kept here, and 0 px on both widths: Madrid-Atocha at zoom 16, Plaça de Catalunya at zoom 7.3 (where Catalonia's six strokes are in another order, under a pixel: #447) and Spain at zoom 6. Atocha at zoom 8, 11 and 13 differ by 238, 796 (2,665 wide) and 463 px, along the same curves.
