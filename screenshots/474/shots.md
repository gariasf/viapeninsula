# #474 shots (20 Oct, 17:11–17:14, live data)

The branch was 474-now at 705fb0ca, and "before" was main at 9edcf80d. One browser slot, which was free at once: full Chromium 1223 on Metal, a context per page, through `launch()`/`openMap()`/`withSlots()`. The script is `shots474.ts` (on the branch too). The interface was in English unless a name ends `-ca` or `-es`. The page's locale was es-ES, and its time zone Europe/Madrid. There were no console errors or `pageerror`s on live pages. The only errors were the deliberately aborted `snapshot.json` on the clocked pages.

68 shots are in `shots/`. Contact sheets are in `sheets/`: `states-{390,wide}-{light,dark}.png` for every viewport shot, `states-crop-wide-*.png` for the wide hover and focus shots cropped to the sheet, `full-*.png` for the whole sheet and the sheet with every "more" open, and `extras-tops.png` / `extras-full.png` for 375×667, ca, es and the clocked runs.

## Shots
- `edge-before-main-*` and `edge-after-*`: the right edge with no sheet. Main has Tilt, Centre and the die. The branch has Tilt and Centre only, 2 buttons at every size.
- `now-top-*`: Now open, with the moment, the counts and the die row. `now-full-*`: the whole sheet, uncapped by CSS and with a tall viewport, as #472 did it.
- `more-lines-*` and `more-alerts-*`: the first "more" (a Network's Lines) and the last ("18 more alerts") pressed. `more-full-*` has all three open.
- `hover-*` and `focus-*` for `die`, `line-row`, `more` and `notable-row` (the rack railway's row). Focus is keyboard focus, so `:focus-visible` is true. On the phone, hover has no fill: the page is touch and hover is gated.
- `edge-after-375x667-light` and `now-top-375x667-light`: the 190 px cap. The sheet is 413 px tall.
- `now-{top,full}-390-light-{ca,es}`.
- `clock-0740-full-390-light` and `clock-2230-full-390-light`: the harness's `clock` with the snapshot aborted, as perf.ts does it. These show `first leaves` and `last arrives`, `Not running now`, and the stale `Alerts as of 5:10 PM` stamp. The stamp only shows because the clock was moved and the alerts are real ones from 17:10. These pages have no live positions.

## Flaws seen
1. **Raw Station codes.** On Trains to and from France, a Train that hasn't left yet reads `Leaves adif:77310 at 5:13 PM` and `Leaves adif:79316 at 6:04 PM` (and `adif:87374` in ca/es). These are the French border Stations, which aren't in the bundle's Stations. See `now-full-*`, `focus-notable-row-wide-*` and `extras-full.png`. This comes from reusing Search's row, and is new on Now.
2. **Long pills cover their row's words.** `Reg.Exp.`, `Regional`, `Proximidad`, `Euromed`, `AVE Int` and the dotted `Regional` sit over the title. For example `Euromed` hides the "4" of "4 of 4 trains late", and `Proximidad` covers "2 of 10". This is in Media Distancia's and LD's Line rows and on the France rows, at every width and theme. See `now-full-390-dark.png` and `more-full-*`. The row's lead column is likely sized for short pills, so it may predate this branch, but Now is the first sheet to list MD/LD Lines like this.
3. **The Network's counts line doesn't wrap, and is clipped on the right in ca and es.** Catalan FGC reads `48 en directe, 8 programats, 2 programats, sense dades en te|`, and Spanish MD reads `…41 programados, sin datos en tiem|`. See `now-full-390-light-ca.png` and `-es.png`. English fits today only by luck.
4. **The "more" button is a slab, not a pill.** Its hover is a square full-width fill, with radius 0 per the log. Its keyboard focus ring is a square box whose text touches the ring's left edge. See `hover-more-*` and `focus-more-*`, both themes. The `.more` style is shared with older screens (style.css 179/1639), but it is very visible in Now. The die row, Line rows and notable rows are fine: a pill, or 10 px rounded rows, in both themes.
5. **Copy.** `8 scheduled, 2 scheduled, no live data` repeats "scheduled", and reads oddly (FGC and LD meta). The two rack and funicular rows are both titled `Ferrocarrils de la Generalitat de Catalunya`, told apart only by their FV and MM pills.
6. **Minor.** With a long Network name, its chip wraps under the name (FGC at every width, and Rodalies in ca/es). This is intended by flex-wrap and looks fine. A France row's time `7:52` / `AM` broke across lines at 07:40 (`clock-0740`). No dot was seen starting a wrapped line, so the #472 fix holds.
7. **A shot artifact, not the app.** The `more-full-*` images repeat a strip of the map and the sheet's top under the sheet, because the viewport was over-tall.

## Not covered by live data
- **A Network with `Live data unavailable` (`… · all scheduled` plus the chip).** None was down at 17:11. Aborting the snapshot does not produce it either: Networks show `91 trains now · 91 scheduled` with no chip.
- **An honest stale `Alerts as of`.** It appears only on the clocked pages.
- **Dark mode and wide for the 375×667, language and clocked shots.** These were taken in light at 390 only.
