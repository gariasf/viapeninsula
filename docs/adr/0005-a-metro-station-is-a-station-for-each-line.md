# A metro station is a Station for each Line calling there

TMB publishes a metro station served by several Lines as a stop for each Line, grouped under a parent station whose point sits at one Line's platforms: at Passeig de Gràcia it's 270 m from L3's. Tracing a Line through its Stations (ADR-0004) and placing its Trips on its track need each Station on that Line's own rails, so each Line's stop is a Station of its own, known by TMB's ID for it: `tmb:1.327` is L3 at Passeig de Gràcia. FGC's and TRAM's feeds make each platform a stop of its own too, but their parent stations sit on the platforms, so there the parent station is the Station.

## Considered Options

- **TMB's parent stations as Stations**, one for each place, as people know them. Rejected: the parent's point lies off some of its Lines' rails, too far for those Lines to be traced through it.

## Consequences

- A metro station served by several Lines is that many Stations with the same name, up to a few hundred metres apart: two Sants Estació (L3 and L5), three Passeig de Gràcia (L2, L3 and L4). Each keeps the parent station TMB groups it in as its place, and the map draws each place as one dot and one name, at the middle of its Lines' Stations rather than at the parent's own point, which lies off some Lines' rails (#27). As the map shows the place as one dot, tapping it opens one Station board listing every one of its Lines' departures (#17); a railway Station beside it is a place of its own, with a board of its own.
- Anything that names a Station, such as a share link (#19) or the Metro's live data (#12), names one Line's stop.
