# The line graph's nodes grow with the scale it's drawn at

The line graph (ADR-0006) is built once, in metres, and drawn at every zoom, where a line width on the ground is 14 m at zoom 14, 147 m at zoom 10 and 687 m at zoom 7. A node needs room for its curves: a Line moving over *k* line widths takes a curve LENGTH × *k* widths long (#178). Where a Stretch is shorter than the room its two nodes need, it can't be drawn: its strokes are squeezed into kinks, or its Lines change side along a length too short to show it, and weave. At Auditori/Teatre Nacional L1 joins R1 and R4 for 140 m, over Stretches of 90 m and 51 m, and L1 and R4 change side three times. On the day's track of 2026-10-01 curves were capped by a stroke too short for them 28 times at zoom 13 and 79 at zoom 10. Zoomed out to Spain, nearly every Stretch in Barcelona is that short, and tracks hundreds of metres apart, which NEAR (45 m) keeps on Stretches of their own, are drawn over each other. A threshold in metres can't be right at every zoom.

LOOM, which ADR-0006 follows, builds its line graph once and draws it at each zoom level with each node's fronts pushed back along its edges "until they do not overlap anymore", joining each line across the freed node with a Bézier curve (Brosi and Bast, "Large-Scale Generation of Transit Maps from OpenStreetMap Data", The Cartographic Journal, 2024). Its merge threshold is fixed, and it notes that where tracks into a large station run far apart it "was sometimes not large enough". So, for each zoom band:

- **A node takes the room its curves need.** Its room on each Stretch is the more of its curves' (LENGTH × the side change × the band's line width, half from each Stretch) and its fronts' clearance: how far back the bundles' fronts go before they stop overlapping, at the angle they meet. Against a bundle it goes on overlapping, running side by side rather than parting, a front goes back only as far as they part: otherwise, as at Clot along Meridiana, a node absorbs the whole run (#196).
- **A Stretch too short for its nodes' room is absorbed.** Its two nodes become one node in that band, until every Stretch left is long enough for its nodes. Each Line crossing a node, however many Stretches it absorbed, is drawn across it on one curve, from where it leaves one Stretch to where it comes onto the next: along the chain of centrelines inside the node, smoothed as #164 smooths them, with its offset eased along it, or a cubic Bézier where that chain runs straight, which is today's curve. A Line that leaves a node at the side it came in on runs straight through it. Lines may cross inside a node, drawn in the Stretches' order. This replaces TAKE.
- **One order for every band from zoom 10 up.** The Stretches' order (#162) stays the same at each zoom, so Lines don't swap as the map zooms; crossings that were on an absorbed Stretch happen inside its node.
- **A band for each whole zoom, from zoom 7 to 14.** A band's curves, smoothed centrelines and absorbed nodes are written only where they differ from the next band's.
- **Below zoom 10, Stretches are built for each band.** Tracks within about one line width of each other at the band's zoom, running alongside, take one Stretch, so that they aren't drawn over each other; each such graph has its order of its own. From zoom 10 up the graph is today's.
- **Below zoom 7, each Network's track is drawn once,** in its colour, along the zoom 7 band's centrelines, with no Lines side by side and no Trains.

## Considered Options

- **Tune SHORT, NEAR or TAKE.** Rejected: the right length depends on the zoom; a value right at zoom 13 is wrong at zoom 10 and far wrong at zoom 7.
- **A Bézier across every node, from port to port, as LOOM does.** Rejected for nodes the size of a few hundred metres to kilometres, which zoomed out are many: it cuts corners off the geography. Kept for nodes whose chain of centrelines runs straight.
- **An order for each band.** Rejected from zoom 10 up: Lines would change places as the map zooms. Below zoom 10, where the graph itself changes, each graph has its own.
- **Don't absorb a Stretch a Station is on.** Rejected: it keeps the weaves. A Station on an absorbed Stretch keeps its dot on the rails, and a Train there rides the Line's curve, as across any node (#176), within a line width of the dot.
- **Forbid crossings inside nodes.** Rejected: that's an ordering problem of its own, which LOOM doesn't attempt either.

## Consequences

- #160's measures gain, in each band, kinks (curves shorter than LENGTH × their side change), weaves (side changes on a Stretch shorter than its nodes' room), both to be zero, and metres drawn off a Line's own track inside nodes, reported, which grows as the map zooms out.
- A Line strays from its track inside a node by up to about the node's size, a line width or so at the band's zoom.
- The bundle carries more bands, each only where it differs.
- The slots (#176) put a Train crossing a node on its curve, however many Stretches the node absorbed.
- The work goes in slices, each reporting the measures before and after: the measures; absorbing nodes in today's bands (zoom 10 to 13); a band for each zoom down to 7; Stretches for each band below zoom 10; the Networks' track below zoom 7.
