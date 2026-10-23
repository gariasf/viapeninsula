// The Lines' and rails' features MapLibre draws, made once for each region's track, in the Lines' worker, which cuts them
// into tiles (lineTiles.ts), so that a region joining costs its own Lines, not every region's loaded (#733, #837).

import type { StoredTrack } from '../pieces.ts';
import { along, BANDS, coveredIn, cutIn, GRAPH_BAND, inBand, pieces, smoothId, type Kind, type Line, type Point, type Shape, type Stroke, type Track } from '../bundle.ts';

/**
 * How much a region's place in the manifest raises its Lines in MapLibre's `line-sort-key` (`sort`), over a Line's
 * `above`, whose steps are whole: so that, as when every region's Lines were one list in the manifest's order, a
 * region's are drawn over those of the regions before it, whichever joined first. But Media Distancia y Avant's and long
 * distance's, though last, go a whole step down, still in the manifest's order: under every other region's Lines where
 * they share track, but over those in tunnels (#736, #787, ADR-0014).
 * ponytail: under 1 for up to 63 regions, the manifest has 17; past that, a smaller step.
 */
export const RANK_STEP = 1 / 64;

/** The kinds of service a Network runs country-wide, and those it runs only within a city. */
const [COUNTRY_WIDE, IN_A_CITY] = [new Set<Kind>(['long-distance', 'regional']), new Set<Kind>(['metro', 'tram', 'funicular'])];

/**
 * The zoom each Network's track, Lines, Trains and Stations are drawn from, by its Lines' kinds of service (#781, the
 * maintainer's pick of 14 Oct 2026): a Network whose Lines all run long distance or regional, as AVE y Larga Distancia,
 * Ouigo and Media Distancia y Avant, at every zoom; one whose Lines all run in a city, as the Metro and TRAM, from zoom
 * 10, where the bands share one graph (GRAPH_BAND); every other, as Rodalies, FGC and the Cercanías, from zoom 7, where
 * the Lines start.
 */
export function drawnFrom(lines: Iterable<Pick<Line, 'network' | 'kind'>>): Map<string, number> {
  const kinds = new Map<string, Kind[]>();
  for (const { network, kind } of lines) kinds.set(network, [...(kinds.get(network) ?? []), kind]);
  const all = (of: Kind[], set: Set<Kind>) => of.every((kind) => set.has(kind));
  return new Map([...kinds].map(([network, of]) => [network, all(of, COUNTRY_WIDE) ? 0 : all(of, IN_A_CITY) ? (BANDS[GRAPH_BAND] ?? 10) : (BANDS[0] ?? 7)]));
}

/** The parts of a region's track file its Lines are made from, which the Lines' worker is handed (packFile(), #837). */
export const LINE_PARTS: (keyof StoredTrack)[] = ['traced', 'shapes', 'lines', 'strokes', 'rails'];

/**
 * The features MapLibre draws strokes as, of a region's track: a stroke cut back for curves, or along a centreline
 * smoothed for a zoom band, once for each band it's drawn in, as it is there, or once for them all where it's alike in
 * each; a curve in its pieces. `rank` is the region's place in the manifest (RANK_STEP), `under` whether it's Media
 * Distancia y Avant's or long distance's, drawn under the others' (#736, #787), `shownFrom` the zoom each Network's Lines are
 * drawn from (drawnFrom()), and `round` rounds a Line's bends where it's on its own rails (#203).
 */
export function drawnLines(
  strokes: Stroke[],
  { shapes, lines, lettering, rank, under: below = false, shownFrom }: { shapes: Map<string, Shape>; lines: Map<string, Line>; lettering: (line: string) => string | undefined; rank: number; under?: boolean; shownFrom?: Map<string, number> },
  round?: (coordinates: Point[]) => Point[],
): GeoJSON.Feature[] {
  return strokes
    .flatMap((s) => {
      const bands = s.band !== undefined ? [s.band] : BANDS.flatMap((_, band) => (band >= GRAPH_BAND ? [band] : []));
      if (!s.covered && !bands.some((band) => shapes.has(smoothId(s.shape, band)))) {
        if (!s.cut) return pieces(s);
        // Cut back alike in every band it's drawn in, it goes once, as one without a band does, which each band from
        // GRAPH_BAND draws: long distance's Lines went once a band, 1.67M points, and go as 0.58M (#734).
        const [[start, end] = [0, 0], ...others] = bands.map((band) => cutIn(s, band));
        if (others.every(([a, b]) => a === start && b === end)) return start + end >= s.to - s.from ? [] : [{ ...s, from: s.from + start, to: s.to - end }];
      }
      // Not in a band where a node absorbed its Stretch (ADR-0007). Where a Line above one in a tunnel
      // lies within the band's line width, its part is drawn narrower and fainter (#417).
      return bands.flatMap((band) => {
        const [start, end] = cutIn(s, band);
        if (start + end >= s.to - s.from) return [];
        const there = { ...s, from: s.from + start, to: s.to - end, band };
        return s.covered ? coveredIn(there, band).map((part) => ({ ...part, band })) : [there];
      });
    })
    .flatMap(({ line: id, shape: shapeId, from, to, side, band, shared, under, covered, crowded, curve, deck }): GeoJSON.Feature[] => {
      const [line, shape] = [lines.get(id), band === undefined ? shapes.get(shapeId) : inBand(shapes, shapeId, band)];
      if (!line || !shape) return [];
      if (band !== undefined && (BANDS[band] ?? 0) < (shownFrom?.get(line.network) ?? 0)) return [];
      const properties = {
        // Which Lines a tap on it names (linesAt()).
        line: id,
        shape: shapeId,
        from,
        to,
        name: line.name,
        colour: line.colour,
        lettering: lettering(id),
        // Zoomed right in, where Lines share track, Barcelona's commuter lines (R1–R8) are drawn over the regional ones.
        // And those in tunnels below the rest, the deeper the lower (#178).
        sort: (/^R\d[NS]?$/.test(line.name) ? 1 : 0) - 2 * (under ?? 0) + (below ? rank - 1 / RANK_STEP : rank) * RANK_STEP,
        // Its names are placed in the manifest's order (RANK_STEP).
        rank,
        side,
        ...(band !== undefined && { band }),
        ...(shared && { shared }),
        ...(under && { under }),
        ...(covered && { covered: true }),
        ...(crowded && { crowded }),
        // A curve's pieces go in layers of their own, with butt ends (#620).
        ...(curve && { curve }),
        // On a desktop, on a bridge: drawn as a deck from DECKS_FROM (ADR-0016).
        ...(deck && { deck }),
      };
      const coordinates = along(shape, from, to);
      return [{ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: round ? round(coordinates) : coordinates } }];
    });
}
