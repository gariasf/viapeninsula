# #257 shots

Main's page and bundle (`before-*`) against the branch's (`after-*`), each built from its own tree, served locally and reading its own build's `out/`: the dry runs of 10 Oct 2026 on the same cached feeds (main on 3b0317d, the branch rebased onto it), a made-up snapshot, the clock fixed at Saturday 10 Oct 12:00 (318 Trains, all Scheduled), light, at the spots of #417's shots: Glòries–Marina (41.3985, 2.1867) at zoom 12, 13 and 14 and Barcelona-Sants (41.3799, 2.1410) at 13 and 14, at 1280×800 (`desktop`) and 390×844 (`phone`).

The ten pairs are pixel for pixel the same, but for two single pixels in two shots, one level off in 255, as they are between two runs of main (main against main: 2 pixels in one shot). The JPEGs, at quality 84, are byte for byte the same. No `pageerror` and no console error but the 404s of files the harness doesn't serve. Each GeoJSON source the map is handed hashes the same at all ten spots: lines 30,685 features, rails 3,233, tracks 465, stations 1,173, station names 1,173, Trains 318, Closures 167 (70 of 70).

| File | What it shows |
|---|---|
| `before-<view>-light-<spot>-z<zoom>.jpg` | Main's page and bundle (3b0317d). |
| `after-<view>-light-<spot>-z<zoom>.jpg` | The branch's page and bundle: the track file as pieces and chains, read back by the page. |
| `cmp-<view>-<spot>-z<zoom>.jpg` | Before, then after, side by side at half size. |
