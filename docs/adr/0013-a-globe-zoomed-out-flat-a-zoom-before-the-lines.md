# A globe zoomed out, flat a zoom before the Lines

The maintainer asked, 7 Oct 2026, for the map to be a round Earth zoomed out, as Google Maps is. MapLibre GL JS draws a globe since v5 (the map runs 6.11), set by the style's projection, and its `globe` preset is a globe that flattens into Web Mercator from zoom 10 to 12. While the map is even part globe, MapLibre pans it as one, nudging the zoom as the centre moves north or south to keep the planet one size, where a flat map's zoom holds; and the bands (ADR-0007), the places' names laid out at whole zooms (#154) and the Trains' pills go by the zoom, laid out for a flat map. Built in #374, 8 Oct 2026:

- **A globe below zoom 6, flat from 6** (`FLAT`, a zoom short of the first band, at 7). The projection goes from `vertical-perspective` at zoom 5 to `mercator` at 6. Below 7 the map draws each Network's track once and no Lines (ADR-0007), so nothing the bands lay out is ever drawn on a globe, and flat a zoom before them, no pan nudges the map into the Lines.
- **Space round the globe,** in the light theme's ink on both themes (`--space`), only below `FLAT`, so that a flat map that's loading doesn't flash it.
- **MapLibre's atmosphere, and no sky.** The sky's other colours are transparent, as MapLibre draws a style with none, so a tilted flat map is drawn as before. The atmosphere fades as the globe flattens.
- **A view far out opens where it was left (ADR-0010) or linked.** Until its style comes, the map is flat, and a flat map zoomed far out holds the world over the screen: linked to `0.6/40.2/-3.7`, a phone opened at the equator, and linked to zoom 1, a 1280×800 window at 36.6°N. Until the style has made it a globe, the map holds the view nowhere (`transformConstrain`), and from then on as MapLibre does.

## Considered Options

- **MapLibre's `globe` preset.** Rejected: from zoom 7 to 12 it pans the bands as a globe, nudging the zoom across one now and then (a 300 px drag north at zoom 9.5 moved it by −0.005), and draws a globe where its curve can't be seen.
- **Flat from zoom 7, where the Lines show.** Rejected: from 6.95, a 300 px drag towards the equator took the zoom to 6.978, and a few more would take the map into the Lines.
- **The bare page round the globe, or black on the dark theme.** Rejected: positron's land nearly vanishes on the light page, and the dark basemap's land, near black, on a dark one.
- **Jumping back to the view the map was opened on, once the style comes,** as #374 first did. Rejected: it read the link a second time, as MapLibre's hash reads it. Lifting the constraint leaves MapLibre's hash and `openingView()` to open the view, as before.
- **The style in the map's constructor, with a `globe` projection,** which MapLibre waits for before it holds the view. Rejected: it waits only for a projection of `globe` itself, not an expression, and the constructor takes no `transformStyle`.

## Consequences

- `FLAT` is `linesZoom - 1`: if the first band moves, the globe still stops a zoom short of it.
- Near the globe's edge, names stand partly over space: MapLibre places a label anywhere on the planet's visible side, however near its edge.
- ADR-0010 has long distance's Trains show at every zoom: zoomed out, they'll run on the globe, along each Network's track drawn once.
