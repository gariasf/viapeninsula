// The Lines' and rails' features the map hands MapLibre, made once for each region's track and handed over once,
// so that a region joining costs its own Lines, not every region's loaded (#733).

import { along, APART, BANDS, coveredIn, cutIn, GRAPH_BAND, inBand, pieces, smoothId, type Line, type Point, type Shape, type Stroke, type Track } from '../bundle.ts';

/**
 * How much a region's place in the manifest raises its Lines in MapLibre's `line-sort-key`, over a Line's `above`,
 * whose steps are whole: so that, as when every region's Lines were one list in the manifest's order, a region's are
 * drawn over those of the regions before it, and long distance's, the last, over every other's where they share
 * track (ADR-0014), whichever joined first.
 * ponytail: under 1 for up to 63 regions, the manifest has 16; past that, a smaller step.
 */
export const RANK_STEP = 1 / 64;

/** A region's Lines' and rails' features, with IDs unique among those the map makes, which MapLibre takes them off by. */
export interface Drawing {
  lines: GeoJSON.Feature[];
  rails: GeoJSON.Feature[];
}

/**
 * The features MapLibre draws strokes as, of a region's track: a stroke cut back for curves, or along a centreline
 * smoothed for a zoom band, once for each band it's drawn in, as it is there; a curve in its pieces. `rank` is the
 * region's place in the manifest (RANK_STEP), and `round` rounds a Line's bends where it's on its own rails (#203).
 */
export function drawnLines(
  strokes: Stroke[],
  { shapes, lines, lettering, rank, nameSize }: { shapes: Map<string, Shape>; lines: Map<string, Line>; lettering: (line: string) => string | undefined; rank: number; nameSize: number },
  round?: (coordinates: Point[]) => Point[],
): GeoJSON.Feature[] {
  return strokes
    .flatMap((s) => {
      const bands = s.band !== undefined ? [s.band] : BANDS.flatMap((_, band) => (band >= GRAPH_BAND ? [band] : []));
      if (!s.cut && !s.covered && !bands.some((band) => shapes.has(smoothId(s.shape, band)))) return pieces(s);
      // Not in a band where a node absorbed its Stretch (ADR-0007). Where a Line above one in a tunnel
      // lies within the band's line width, its part is drawn narrower and fainter (#417).
      return bands.flatMap((band) => {
        const [start, end] = cutIn(s, band);
        if (start + end >= s.to - s.from) return [];
        const there = { ...s, from: s.from + start, to: s.to - end, band };
        return s.covered ? coveredIn(there, band).map((part) => ({ ...part, band })) : [there];
      });
    })
    .flatMap(({ line: id, shape: shapeId, from, to, side, band, shared, under, covered, crowded }): GeoJSON.Feature[] => {
      const [line, shape] = [lines.get(id), band === undefined ? shapes.get(shapeId) : inBand(shapes, shapeId, band)];
      if (!line || !shape) return [];
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
        above: (/^R\d[NS]?$/.test(line.name) ? 1 : 0) - 2 * (under ?? 0),
        rank,
        side,
        ...(band !== undefined && { band }),
        ...(shared && { shared }),
        ...(under && { under }),
        ...(covered && { covered: true }),
        ...(crowded && { crowded }),
        // Each Line's name goes on its own stroke: text-offset is in ems.
        ...Object.fromEntries(APART.map(([zoom, px]) => [`textOffset${zoom}`, [0, (side * px) / nameSize]])),
      };
      const coordinates = along(shape, from, to);
      return [{ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: round ? round(coordinates) : coordinates } }];
    });
}

/**
 * Each region's drawing made once, by its track, which the days joined from it share (ADR-0014), and what MapLibre is
 * to add and take off for the drawings of the regions joined now to be those it draws. MapLibre's index takes the
 * Lines in the order they're added, so a region's place in the manifest orders them (RANK_STEP).
 */
export function byRegion() {
  const made = new WeakMap<Track, Drawing>();
  let [shown, next] = [new Set<Drawing>(), 0];
  return {
    made(track: Track, make: () => Drawing): Drawing {
      let drawing = made.get(track);
      if (!drawing) {
        drawing = make();
        for (const f of [...drawing.lines, ...drawing.rails]) f.id = next++;
        made.set(track, drawing);
      }
      return drawing;
    },
    handOver(drawings: Drawing[]): { add: Drawing[]; remove: Drawing[] } {
      const now = new Set(drawings);
      const change = { add: [...now].filter((d) => !shown.has(d)), remove: [...shown].filter((d) => !now.has(d)) };
      shown = now;
      return change;
    },
  };
}
