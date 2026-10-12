# #465 on production: the live check (12 Oct 2026, after the deploy of aad955c)

The production page `https://viapeninsula.gariasf.com` (bundle `assets/index-DFYd7akz.js`, which holds the `#rgb` doubling
and `#111`), the CDN's own files, with 11 Oct's frozen snapshot (15:20:44) and the page's clock held 10 s after it, so Live
Trains exist at night. One headless Chromium, a fresh context per page, 390×844 and 1280×800 at 2×, light and dark
(`colorScheme`). `live.mjs` took them: a board's Live pills by `getComputedStyle(pill).color` against `darkInk()` of the
pill's `--line`; the map's Live pills (WebGL, the page has no `window.map`) by the pixels in a box inside each pill's
fill at the pins the review's dev run recorded for the same camera (near-black off the fill = ink, near-white = white).

| page | size | scheme | Live pills in the DOM | ink | white | wrong | map pills read | pageerror |
|---|---|---|---|---|---|---|---|---|
| [board-sants](live-dark-phone-board-sants.jpg) | phone | dark | 20 | 15 | 5 | 0 | – | 0 |
| [board-t2](live-dark-phone-board-t2.jpg) | phone | dark | 3 | 3 | – | 0 | – | 0 |
| [map-north](live-dark-phone-map-north.jpg) | phone | dark | – | – | – | – | R1:INK R1:INK R1:INK R1:INK R2N:INK | 0 |
| [map-t2](live-dark-phone-map-t2.jpg) | phone | dark | – | – | – | – | T2:INK T2:INK | 0 |
| [board-sants](live-light-phone-board-sants.jpg) | phone | light | 20 | 15 | 5 | 0 | – | 0 |
| [board-t2](live-light-phone-board-t2.jpg) | phone | light | 3 | 3 | – | 0 | – | 0 |
| [map-north](live-light-phone-map-north.jpg) | phone | light | – | – | – | – | R1:INK R1:INK R1:INK R1:INK R2N:INK | 0 |
| [map-t2](live-light-phone-map-t2.jpg) | phone | light | – | – | – | – | T2:INK T2:INK | 0 |
| [map-north](live-dark-wide-map-north.jpg) | wide | dark | – | – | – | – | R1:INK R1:INK R1:n/a R1:INK R2N:INK | 0 |
| [board-sants](live-light-wide-board-sants.jpg) | wide | light | 20 | 15 | 5 | 0 | – | 0 |
| [map-north](live-light-wide-map-north.jpg) | wide | light | – | – | – | – | R1:INK R1:INK R1:n/a R1:INK R2N:INK | 0 |

`wrong` = a Live pill whose computed colour is not `rgb(17, 17, 17)` where `darkInk(--line)` is true, or not
`rgb(255, 255, 255)` where it is false. On Barcelona-Sants's board the white ones are R2S (`#146520`), R11 (`#0069AA`), R14
(`#6C60A8`) and R16 (`#B52B46`); R2N (`#D0DF00`), R1 (`#7DBCEC`), R4, R15, R2, R13 and R17 are ink. On Fontsanta | Fatjó's, T1
(`#FF0D0D`) and T2 (`#80FF80`) are ink. One R1 on the wide map reads `n/a`: under 45% of its box was the pill's fill (a neighbouring pill or
label covers it), so it is not read; the other four pills of that frame read INK. The board of the wide window is taken in light only, as in the review's frames.

The crops are 3× enlargements of each Live pill read on the map (`…-pinN-<Line>.png`).

## Console

No `pageerror` on any of the 11 pages. One line per page that is not the basemap's usual noise:
`error: Failed to load resource: net::ERR_CONNECTION_REFUSED`. It is Cloudflare's Web Analytics beacon
(`static.cloudflareinsights.com/beacon.min.js`, injected into the HTML by the edge), which the DNS of the Mac that took the
frames resolves to `::` (`curl` cannot connect to it either). The review's local runs, which have no beacon, had none.
