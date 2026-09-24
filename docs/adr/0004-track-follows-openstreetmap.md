# Track follows OpenStreetMap's rails, not the feeds' shapes

The operators' shapes don't sit on the rails the map draws. Between Terrassa and Manresa, Renfe's run about 1.5 m off OpenStreetMap's rails (up to about 5 m), with a point every 46 m or so. Each Line is traced separately, so R4 and RL4 weave around each other on the track they share, and some shapes are coarse: RT2's has 19 points. The basemap is drawn from OpenStreetMap, so the daily build traces each shape along OpenStreetMap's rail network instead. It snaps the Stations the shape's Trips serve to the network, in order, and takes the shortest path between consecutive ones over the Network's own kind of rails. Lines that share track then share one geometry, on the rails people see. This replaces the v1 spec's plan (issue #1) to use the shapes and borrow missing sections from other Lines. railisland traces Taiwan's railways the same way; we take the idea only (ADR-0001).

## Considered Options

- **Keep the feeds' shapes.** Rejected: the offsets only show zoomed right in, but that's where people follow a Train, and Lines on shared track would still weave.
- **Move each shape point to the nearest OpenStreetMap rail.** Rejected: at junctions, and where lines run side by side, the nearest rail is often another line's, and the feeds' gaps and coarse stretches stay.

## Consequences

- The daily build downloads OpenStreetMap's rails for Catalonia from Overpass. The map already credits OpenStreetMap contributors.
- Trips keep their shapes and only the geometry changes, so the bundle format doesn't.
- A stretch that can't be traced keeps the feed's shape, and the build reports it. OpenStreetMap can be wrong too (railisland found a stretch mapped on an old alignment 800 m away), so a traced shape much longer or shorter than the feed's fails the build.
