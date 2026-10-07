# Lines are named by badges where they join and leave, and on tap

**Only the tap is built (#193).** The maintainer closed the badges, #191, as not planned on 7 Oct 2026: built in PR #201, they crowded in among the Trains' pills at zooms 10 to 12. The PR is closed unmerged, and its branch `191-badges` is kept. Until they're taken up again, Lines keep their names along their strokes.

Each Line's name is laid along its own stroke, in its colour, haloed white. Where Lines run side by side the names come in a row, MapLibre leaves many out, and it isn't clear which name is which stroke's. The names should be there to find, without being what the map is about.

So the map names Lines by badges, small pills in each Line's colour as its Trains' (#90) and the legend's (#122), stacked in the Stretch's order (ADR-0006):

- at each node where Lines come onto a Stretch or leave it, and at the Lines' termini;
- along a long Stretch, now and then;
- zoomed right in, along a track Lines share, drawn grey (#139), about a screen apart, so that it still names its Lines.

Tapping a Line's stroke names the Lines drawn there. The names along each stroke go.

## Considered Options

- **One label per Stretch** listing its Lines. Rejected: a long row of names, apart from the strokes it names.
- **Names only on tap.** Rejected alone: a map whose Lines aren't named anywhere can't be read at a glance. Kept as well as the badges.
- **Today's names, smaller and fainter.** Rejected: they would still crowd and drop out where Lines run side by side.

## Consequences

- Badges go at the nodes ADR-0007 makes for each zoom band, so they follow its slices.
- #139's names along a shared grey track become badges along it.
