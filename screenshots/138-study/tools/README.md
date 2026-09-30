# Tools for the line-drawing study (#138)

Scratch tools, kept as run for the study in `docs/research/lines-side-by-side.md`. `<repo>` is the checkout and `<scratch>` a scratch folder; the track files are `days/track-5d4012e1d2a7.json` as served on 2026-09-30 (`track-before.json`) and the same Lines and shapes through PR #159's `sideBySide()` (`track-after.json`).

- `fold.ts`: predicts where MapLibre's `line-offset` folds a stroke back, per zoom, after geojson-vt's simplification.
- `double.ts`: metres where a Line's strokes on two of its shapes lie within 30 m but are drawn apart.
- `alone.ts`: metres where a Line is drawn off a track no other Line is beside (needs an instrumented copy of `sideBySide.ts`, made in the script).
- `width.ts`: how far off their track Lines are drawn, per zoom.
- `steps.ts`: every change of side, by size and place, and runs that end mid-shape.
- `spots.json`, `sweep.js`, `compose.sh`, `detail.sh`, `ladder.sh`: the screenshot sweep (Playwright `browser_run_code_unsafe`, with a temporary `window.map` line in `main.ts` and Vite serving the track files).
