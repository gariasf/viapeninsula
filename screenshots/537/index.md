# #537 shots

The live page, `viapeninsula.gariasf.com`, on 12 Oct 2026: TRAM's credit with the day its timetables were read, as PR #663 gives it. The page's code is as it was (`creditOf()` prints any credit's `updated`), so the only change is the credit in Catalonia's track file.

Each shot is a headless Chrome at pixel ratio 1, light theme, the view `#map=11/41.42/2.12` (Barcelona), the analytics beacon blocked, and each was taken once Catalonia's track had come and TRAM's credit was in the strip. The console and `pageerror` were read on every page: nothing of ours in any, only the basemap's own warnings, which are filtered, and the blocked beacon's failed request.

| File | Window, language | What it shows |
|---|---|---|
| `before-ca-390-about.png` | 390×844, Catalan | About's credits at 12:45 CEST, before the deploy: "Powered by TRAM Barcelona" with no date, "TMB, actualitzat el 6 d'oct. 2026". |
| `before-en-1280-strip.png` | 1280×800, English | The strip the same way: "Powered by TRAM Barcelona | TMB, updated Oct 6, 2026". |
| `after-ca-390-about.png` | 390×844, Catalan | About's credits at 13:07 CEST, after the deploy (run 38237626866): "Powered by TRAM Barcelona, actualitzat el 12 d'oct. 2026", TMB's as before. |
| `after-ca-390-credits.png` | 390×844, Catalan | The © button's popover open. |
| `after-es-390-about.png`, `after-es-390-credits.png` | 390×844, Spanish | "Powered by TRAM Barcelona, actualizado el 12 oct 2026", in About and in the popover. |
| `after-en-1280-about.png`, `after-en-1280-strip.png` | 1280×800, English | "Powered by TRAM Barcelona, updated Oct 12, 2026 | TMB, updated Oct 6, 2026", in About and in the strip, which wraps to two lines at the bottom right. |
| `after-ca-1280-about.png`, `after-ca-1280-strip.png` | 1280×800, Catalan | The same in Catalan. |
