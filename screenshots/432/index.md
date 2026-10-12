# #432: a double-click or double-tap zooms about the middle while the map pans with a Train

The dev map (the branch's `src/web`, as the page draws it) in headless Chromium with the live CDN's bundle and snapshot routed in,
12 Oct 2026 09:11 to 09:45 (CEST), a Mac at a load average of 20 to 50 (other sessions' work). The shots are the review's, taken by
`check-432.mjs` at the end of each run, so they show the state after it; the numbers are the script's. `rmain` = main 7c267e1 (no
change), `rfix3` = the branch (the review's tree of the time, on 0292a30e's page). A Train is followed at zoom 15 (`ZOOM0=17` for
the `17` runs); the double-click is 286 px (260 right, 120 down) from the padded middle at 1280×800, the double-tap 156 px off at
390×844 ×3. `N` = `NODBL=1`: the `dblclick` a touch makes in headless Chromium is dropped, as on iOS Safari it is taken to be
(not tried on a device), so only MapLibre's own tap recogniser can zoom.

| File | Run | What to see |
|---|---|---|
| `desktop-rmain-zoom.jpg` / `desktop-rfix3-zoom.jpg` | `desktop … zoom` | a double-click zoom 15 → 16: main ends it with the Train 289.1 px off the middle (about the cursor) and jumps it back in one frame; the branch 10.8 px, the Train's own movement in 300 ms |
| `phone-rmain-zoom.jpg` / `phone-rfix3-zoom.jpg` | `phone … zoom` | a double-tap with the browser's own `dblclick`: main zooms about the point, 149.6 px off, jumped back; the branch zooms by `touchend` (once), 17.3 px worst, 11.0 at the end |
| `phone-rmainN-zoom.jpg` / `phone-rfix3N-zoom.jpg` | `NODBL=1 phone … zoom` | with no `dblclick`: main does not zoom at all (`NO ZOOM`, 15 jumps meanwhile: every jump resets MapLibre's recogniser); the branch zooms by `touchend`, 17.8 px worst, 10.9 at the end |
| `desktop-rmain-out.jpg` / `desktop-rfix3-out.jpg` | `desktop … out` | shift + double-click, the zoom out: main 139.3 px off at the end and jumped back, the branch 9.7 px |
| `phone-rmainN-out.jpg` / `phone-rfix3N-out.jpg` | `NODBL=1 phone … out` | a two-finger tap: main `NO ZOOM` (95 jumps), the branch zooms out by `touchend`, a 4.5 px jump at the end |
| `desktop-rfix3-letgo.jpg` | `desktop rfix3 letgo` | after a drag has let go of the Train the ease reaches MapLibre with its `around`: its own zoom about the point, as now |
| `desktop-rfix3-reduced.jpg` | `desktop rfix3 reduced` | under reduced motion: likewise, `around` kept |
| `phone-rmain-tap.jpg` / `phone-rfix3-tap.jpg` | `phone … tap` | ONE tap, no second, zoom 15: the cost of the half second the map stands after a short touch (#680). Main: the Train stays in the middle (an FGC S2 Live, 0.0 px). Branch (an R1 Live at 30.3 m/s): off the middle by 6.7 px at most, the map jumps back by 6.7 px |
| `phone-rmain17-tap.jpg` / `phone-rfix317-tap.jpg` | `ZOOM0=17 phone … tap` | the same at zoom 17: main 0.0 px; the branch 3.9 px at most with an FGC S2 Live that was moving at about 3.5 m/s then (the 34 px of #680 is worked out for 110 km/h, not seen) |

## Live look of the merged code, 12 Oct 2026 12:13 to 12:15 (CEST): `live/`

The dev map on origin/main 4219f633, the deployed code of #581, #432 and #586, on the live site's bundle and snapshot, a Mac at a load
average of 12 to 22; shots at the end of each `check-432.mjs` run on the final tree. An R2N Live is followed at zoom 15; the double-click
is 286 px (260 right, 120 down) from the padded middle, the double-tap 156 px off.

| File | Run | What to see |
|---|---|---|
| `live/desktop-live-zoom.jpg` | `desktop live zoom` | the ease reaches MapLibre as `{ duration: 300, zoom: 16 }` with no `around`; the Train 9.4 px off the middle at worst, 9.1 px at the zoom's end (its own movement), against 289 px on main in the review's run |
| `live/phone-live-zoom.jpg` | `phone live zoom` | a double-tap with the browser's own `dblclick`: zooms by `touchend`, once, `around` dropped; 15.0 px at worst, 9.7 px at the end |
| `live/phone-liveN-zoom.jpg` | `NODBL=1 phone liveN zoom` | with no `dblclick` from the touch: MapLibre's own recogniser zooms by `touchend`; 15.7 px at worst, 9.2 px at the end |
| `live/desktop-live-letgo.jpg` | `desktop live letgo` | after a drag has let go of the Train: the ease keeps its `around`, MapLibre's own zoom about the point |
| `live/desktop-live-reduced.jpg` | `desktop live reduced` | under reduced motion: `around` kept |
