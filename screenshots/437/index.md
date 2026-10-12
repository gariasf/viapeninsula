# #437: the tilt button's pressed state under forced colours

Closed as completed with these shots and no code: under Chromium's forced-colours emulation the pressed tilt button still differs from the
flat one, by its plane filled, at rest, on hover and on keyboard focus, on the light and the dark theme, at 1280 × 800 and at 390 × 844.

Taken on 12 Oct 2026, 14:19 to 14:21, by one headless Chromium (the headless shell, 1223, software GL) on the dev page of #440's branch
(origin/main e0a8b4cb and #440's rule, which is all the branch adds to the button), with the live bundle and snapshot of that moment.
`forcedColors: 'active'` and `colorScheme: 'light'` or `'dark'` are the context's options, which is what
`emulateMedia({ forcedColors: 'active' })` sets. Console and `pageerror` read on every page: none.

- **flat** is pitch 0 (the button reads not pressed), **tilted** is pitch 45 (pressed). **hover** is the pointer on the button (desktop only,
  a touch screen has none); **focus** is the keyboard's: `focus()` and a key, so that `:focus-visible` matches.
- `desktop-…` is 1280 × 800 at ×2, `phone-…` is 390 × 844 with touch at ×3. The plain file is the corner's column of buttons with 14 px
  round it; `-button` is the tilt button alone with 10 px round it. `page-tilted-<light|dark>.png` is the whole desktop page, tilted
  (2560 × 1600).
- Names: `<desktop|phone>-<flat|tilted>-<light|dark>[-hover|-focus][-button].png`.
- `contact-forced.jpg` has the button alone side by side: rows desktop light, desktop dark, phone light, phone dark; columns flat then
  tilted, each at rest, hover (desktop only) and keyboard focus. **Flat is an outlined plane, pressed is a solid one**, in all of them.

## What differs (forced colours)

Computed in the page, at rest:

| theme | button | face / text / border | the plane's two paths |
|---|---|---|---|
| light | flat | `rgb(255, 255, 255)` / `rgb(0, 0, 0)` / `rgb(0, 0, 0)` | `fill: none`, `fill: none` |
| light | tilted, pressed | the same | `fill: rgb(0, 0, 0)`, `fill: none` |
| dark | flat | `rgb(0, 0, 0)` / `rgb(255, 255, 255)` / `rgb(255, 255, 255)` | `fill: none`, `fill: none` |
| dark | tilted, pressed | the same | `fill: rgb(255, 255, 255)`, `fill: none` |

The card's inversion (`background: var(--ink)`) is gone under forced colours, as the theme sets its own face, so the filled plane is the whole
difference, which is what the comment over `.fab.tilt[aria-pressed='true']` in `style.css` says.

- **Pixels that differ**, flat against tilted, in the 30 px inside the button: 370 of 3,600 on the desktop (×2) and 732 of 8,100 on the
  phone (×3), counted from the RGB bytes of the `-button` crops: the same at rest, hover and keyboard focus, on both themes.
- **Hover** (desktop): the theme's own cue, the border turning `rgba(5, 0, 73, 0.8)` on light and `rgba(26, 235, 255, 0.8)` on dark, on
  both buttons alike; the face and the plane stay as at rest. `desktop-<flat|tilted>-<light|dark>-hover.png`.
- **Keyboard focus**: `2px solid` in the same colour, a double ring with the border, on both buttons and both themes.
  `desktop-…-focus.png`, `phone-…-focus.png`.

This is Chromium's emulation, which has its own palette (black on white, navy and cyan for hover and focus), not a real contrast theme on a
device: that is the ticket's own sentence, and nothing here says otherwise.

## `shots-normal/`: the same, with the colours as they are

The same pages with `forcedColors` off (`-normal` in the names, `contact-normal.jpg` beside them). They are the evidence of the follow-up the
shots turned up, which is not this ticket's: **the pressed button's keyboard ring is its card's colour.**
`:is(button, summary, a):focus-visible` draws `outline: 2px solid currentColor`, and the pressed button is `color: var(--card)` on
`background: var(--ink)`.

| theme | pressed button: face / text | its focus ring | against the sea behind it | the unpressed button's ring |
|---|---|---|---|---|
| light | `rgb(20, 48, 90)` / `rgb(255, 255, 255)` | `rgb(255, 255, 255)` | `rgb(194, 200, 202)`: 1.7:1 | `rgb(0, 0, 0)`: 12.4:1 |
| dark | `rgb(230, 236, 245)` / `rgb(21, 27, 36)` | `rgb(21, 27, 36)` | `rgb(27, 27, 29)`: 1.0:1 | `rgb(255, 255, 255)`: 17.2:1 |

`desktop-tilted-dark-normal-focus.png` and `phone-tilted-dark-normal-focus.png` show a pressed button with no ring to see; the light ones
(`…-tilted-light-normal-focus.png`) show a white ring on a light grey. Under forced colours it is not an issue: the theme draws the ring in its
own colour (`…-focus.png` above).
