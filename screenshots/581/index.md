# #581: a drag that starts while the map follows a Train

The dev map (the branch's `src/web`, as the page draws it) in headless Chromium with the live CDN's bundle and snapshot routed in,
12 Oct 2026 09:20 to 09:30 (CEST), a Mac at a load average of 20 to 40 (other sessions' work). The shots are the review's, taken by
`check-581.mjs` at the end of each run, so they show the state after it; the numbers are the script's. `rmain` = main 7c267e1,
`rfix3` = the branch (the review's tree of the time, on 0292a30e's page). A Train is followed at zoom 17,
where it moves about a pixel a frame. `desktop` = 1280×800 with the mouse, `phone` = 390×844 ×3 with one finger by CDP touch
events. The live look of the merged tree (the deployed code) is under `live/`, if it is there.

| File | Run | What to see |
|---|---|---|
| `desktop-rmain-z17-drag.jpg` | `desktop 6 rmain` | main after the scripted drag of 150 px (the mouse pressed 350 to 600 ms): no Centre button, the map was not let go. 0 of 6 drags started, 30 to 52 `jumpTo()`s a press |
| `desktop-rfix3-z17-drag.jpg` | `desktop 6 rfix3` | the branch after the same: the Centre button shows (the map let go), the Train off the middle. 6 of 6, 0 jumps in the press |
| `phone-rmain-z17-drag.jpg` / `phone-rfix3-z17-drag.jpg` | `phone 6 …` | the same by touch: 0 of 6 on main (14 to 25 jumps a press), 6 of 6 on the branch |
| `desktop-rmain-z17-reduced.jpg` / `desktop-rfix3-z17-reduced.jpg` | `desktop 1 … reduced` | prefers-reduced-motion, where `keepInView()` brings the Train back: with the mouse down and the map put 400 px off the Train, main pulls it back at once (399, 16, 34, 52, 70 px every 250 ms), the branch holds it until the lift (399, 399, 400, 403, 406) |
| `desktop-rfix3-z17-stuck.jpg` | `desktop 6 rfix3 stuck` | a press left with no lift (the right button): the map put 200 px off stays off for 3 s (200 to 273 px) and goes back at 3.2 s; a `pointercancel` with the mouse still down brings it back at once (0 px) |
