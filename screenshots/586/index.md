# #586: a followed Train outside the middle 60% is eased to over a second, not jumped to

The dev map (the branch's `src/web`, as the page draws it) in headless Chromium with the live CDN's bundle and snapshot routed in,
12 Oct 2026 09:30 to 09:45 and 10:19 to 10:23 (CEST), a Mac at a load average of 20 to 90 (other sessions' work). The shots are the
review's, taken by `check-586.mjs` at the end of each run, so they show the state after it; the numbers are the script's. `rmain` =
main 7c267e1, `rfix3` = the branch (the review's tree of the time, on 0292a30e's page), `rfix4` = the branch on 3208d9a5's page.
`far` puts the map 1500 px off the followed Train, the same input as a Train drawn again far from where the map stands.

| File | Run | What to see |
|---|---|---|
| `desktop-rmain-far.jpg` / `desktop-rfix3-far.jpg` | `desktop … far`, zoom 16 | main: one `jumpTo()` of 1500 px in one frame; the branch: one `easeTo({ duration: 1000 })` of 1491 px, ending 0.0 px off the middle |
| `phone-rmain-far.jpg` / `phone-rfix3-far.jpg` | `phone … far`, zoom 16 | the same at 390×844: main one jump of 1500 px; the branch one ease of 1000 ms ending 4.4 px off (1.1 the next frame) |
| `phone-rfix3nolead-far.jpg` / `phone-rfix319-far.jpg` | `phone far`, zoom 19, `NOLEAD=1` and not | what `ahead()` is for: with the ease aimed where the Train is, three eases (1,498, 298 and 248 px) and a 149 px jump, ending 140.6 px off the middle; with it one ease, 1.6 px off |
| `phone-rfix3nolead18-far.jpg` / `phone-rfix318-far.jpg` | `phone far`, zoom 18, `NOLEAD=1` and not | the same at zoom 18: one ease ending 110.2 px off and a 125 px jump; with the lead the ease ends 4.5 px off |
| `desktop-rmain-hidden.jpg` / `desktop-rfix3-hidden.jpg` | `desktop … hidden`, zoom 15 | a tab shown again after a minute (frames held, `document.hidden` true): main one jump of 973 px; the branch one ease of 899 px, the Train 876, 699, 416, 243, 113, 33, 6, 1, 0 px off over about a second |
| `desktop-rmainRod-closure.jpg` / `desktop-rfix4Rod-closure.jpg` | `LINE=rodalies: desktop … closure` | a made-up closed Closure that hides Trains put round a Scheduled R11 Train (16.2 km) and lifted after 30 s: main jumps 952 px in one frame; the branch eases 982 px over 1000 ms, ending 0.3 px off the middle |
| `desktop-rfix4c-near.jpg` | `desktop rfix4c near` | the rule's other side: a Train 177 px off the middle, inside the ±264 px band, is jumped to by one `jumpTo()` and no `easeTo()` (one 336 px off was eased to over 1000 ms) |
| `desktop-rfix3-hold.jpg` | `desktop rfix3 hold` | #581 with the ease: a press and drag begun 350 ms into it starts (`dragstart` 1, the map let go) |
| `desktop-rfix3-holdfar.jpg` | `desktop rfix3 holdfar` | a pointer down as the Train comes back holds the ease and the jump for 2 s (0 jumps, 0 eases), then one ease of 1537 px over 1000 ms follows the lift |
| `desktop-rfix3-zoom.jpg` | `desktop rfix3 zoom` | #432 with the ease: a double-click 200 px off the middle after it zooms 16 → 17 with the Train 0.0 px off the middle |
| `desktop-rfix4-centre.jpg` | `desktop rfix4 centre`, zoom 16 | a finding (#682), not a criterion: a drag let go of the Train (205 px away), then the Centre button: its ease of 205 px over 500 ms ends behind the moving Train (an R2S at 31.5 m/s) and `centreOn()` jumps 16 px as it ends |

## Live look of the merged code, 12 Oct 2026 12:14 to 12:18 (CEST): `live/`

The dev map on origin/main 4219f633, the deployed code of #581, #432 and #586, on the live site's bundle and snapshot, a Mac at a load
average of 12 to 22; shots at the end of each `check-586.mjs` run on the final tree.

| File | Run | What to see |
|---|---|---|
| `live/desktop-live-far.jpg` | `desktop live far`, zoom 16 | the map put 1500 px off an R1 Live (32.4 m/s): one `easeTo({ duration: 1000 })` of 1473 px, no jump of 20 px or more by the app, ending 0.0 px off the middle |
| `live/phone-live-far.jpg` | `phone live far`, zoom 16 | the same at 390×844: one ease of 1472 px, ending 0.2 px off |
| `live/desktop-live-hidden.jpg` | `desktop live hidden`, zoom 15 | a tab shown again after 60 s (frames held): the first frame back has the Train 672 px off, one ease of 677 px over 1000 ms, no jump of 2 px or more |
| `live/desktop-liveS-near.jpg` | `STAND=1 desktop liveS near` | a Train standing at a Station, the map put 40 px off it: one `jumpTo()` of 40 px and no `easeTo()`, as before |
| `live/desktop-liveR-closure.jpg` | `LINE=rodalies: desktop liveR closure` | a made-up closed Closure that hides Trains round a Scheduled R15 Train (25.4 km), lifted after 30 s: the Train is drawn again 380 px off the middle and one ease of 380 px over 1000 ms brings the map to it, no jump, ending 0.0 px off |
