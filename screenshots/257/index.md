# #257 shots

Main's page and bundle (`before-*`) against the branch's (`after-*`), each built from its own tree, served locally and reading its own build's `out/`: the dry runs of 10 Oct 2026 on the same cached feeds (main on 3b0317d, the branch rebased onto it), a made-up snapshot, the clock fixed at Saturday 10 Oct 12:00 (318 Trains, all Scheduled), light, at the spots of #417's shots: Glòries–Marina (41.3985, 2.1867) at zoom 12, 13 and 14 and Barcelona-Sants (41.3799, 2.1410) at 13 and 14, at 1280×800 (`desktop`) and 390×844 (`phone`).

The ten pairs are pixel for pixel the same, but for two single pixels in two shots, one level off in 255, as they are between two runs of main (main against main: 2 pixels in one shot). The JPEGs, at quality 84, are byte for byte the same. No `pageerror` and no console error but the 404s of files the harness doesn't serve. Each GeoJSON source the map is handed hashes the same at all ten spots: lines 30,685 features, rails 3,233, tracks 465, stations 1,173, station names 1,173, Trains 318, Closures 167 (70 of 70).

| File | What it shows |
|---|---|
| `before-<view>-light-<spot>-z<zoom>.jpg` | Main's page and bundle (3b0317d). |
| `after-<view>-light-<spot>-z<zoom>.jpg` | The branch's page and bundle: the track file as pieces and chains, read back by the page. |
| `cmp-<view>-<spot>-z<zoom>.jpg` | Before, then after, side by side at half size. |

## Live, after the deploy

`live-*`: the deployed map, https://viapeninsula.gariasf.com, loaded as a visitor on 10 Oct 2026 between 21:29 and 21:36 UTC, once the deploy of 1770cc0 (PR #526) and one later deploy that includes it were up. Playwright's Chromium, light, device pixel ratio 2, one page at a time; the files are the JPEGs of the page after it stopped changing, at quality 84.

| File | Spot and view | Legend |
|---|---|---|
| `live-desktop-gm-z13.jpg` | Glòries–Marina, zoom 13, 1280×800 | 160 live, 41 scheduled |
| `live-desktop-sants-z14.jpg` | Barcelona-Sants, zoom 14, 1280×800 | 159 live, 35 scheduled |
| `live-phone-gm-z13.jpg` | Glòries–Marina, zoom 13, 390×844 | 155 live, 39 scheduled |
| `live-phone-sants-z14.jpg` | Barcelona-Sants, zoom 14, 390×844 | 158 live, 33 scheduled |

No `pageerror`. The console held one `net::ERR_CONNECTION_REFUSED` on a resource per view (the harness did not record its URL; Cloudflare's analytics beacon host does not answer from this Mac either), the GL "GPU stall due to ReadPixels" notice, and three basemap-style warnings about `highway-shield-*` filters. Each view fetched all 15 track files (200, brotli, 1,071,620 bytes in all, 1,046.5 KB) and the manifest.
