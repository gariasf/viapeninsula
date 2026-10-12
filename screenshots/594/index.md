# Screenshots for #594 (built with #593 and #529)

Onze de Setembre's board at 390x844 (2x), in English, on a slow 3G link: headless Chrome for Testing 148, the page's files from a local HTTP/2 server that sends the live CDN's files of 10 to 13 Oct through one link of 50 KB/s and 400 ms a request, the page's clock at 00:20 on 11 Oct, the board opened by its link (`#station=tmb:1.932`). Main and the branch are each on their own Vite, both with #470's tab bar.

| file | what it shows |
|---|---|
| `594-slow3g-onze-de-setembre-main-label-alone-390x844.png` | main at the same point of the run as the next shot (4 s after the branch's pills came), before its Trips have come: the board's name over "Next departures" alone, 145 px high, with no Line named until its Trips come at 34.7 s. |
| `594-slow3g-onze-de-setembre-pills-before-rows-390x844.png` | the branch at the same moment, before its rows: L9N and L10N named under the board's name from 19.3 s, the label alone beneath (161 px), 8.3 s before its rows. This is the third box of #594. |
| `594-slow3g-onze-de-setembre-rows-390x844.png` | the branch with its rows (27.6 s): 12:21 L10N La Sagrera, 12:24 L9N Can Zam and 12:25 L9N La Sagrera, the same three that main has at 35.2 s and that the join of the 11th's Trips at 34.6 s leaves as they were; 83 scheduled in the legend. |

## The deployed site, after the merge (12 Oct 2026, 15:00 CEST, unthrottled)

Headless Chrome for Testing, the live site at `assets/index-B7dsOFrv.js` (byte for byte the `vite build` of the merged tree b1509dae) and the real CDN, the analytics beacon blocked. The legend's counts are nonzero and the console and `pageerror` have nothing but the basemap's own warnings.

| file | what it shows |
|---|---|
| `594-live-onze-de-setembre-390x844.png` | Onze de Setembre's board by its link at 390x844: L9N and L10N named from 1.5 s (161 px, the label alone), its rows at 3.0 s (353 px). Legend 166 live, 31 scheduled. |
| `594-live-onze-de-setembre-1280x800.png` | the same at 1280x800: pills at 1.1 s (147 px), 10 rows at 2.1 s (616 px). |
| `529-live-martutene-390x844.png` | #529: Martutene (`#station=adif:11509`), a place no Trip of 12 Oct calls at (C1's service is cut between Brinkola and Zumarragako): its board names C1 from 3.9 s and, from 6.1 s, the next day's rows, "Doesn't stop here" within the Closure. |
