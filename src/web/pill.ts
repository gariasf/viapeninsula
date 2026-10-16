// How big a Train's pill is on the map: what the map draws it by, and what a followed Train's card goes by in saying where the Train is (#455).
// Pure, with nothing from the page, as the measure of the card against the map (src/cardVsMap.ts) runs it under Node.

import { pixelMetres, type Kind } from '../bundle.ts';

/** The size of a Line's name on its Trains' pills, in px, on the followed Train's, which is larger, and on long distance's, Ouigo's and Media Distancia's (pillText()). */
export const [PILL_TEXT, FOLLOWED_TEXT, SMALL_TEXT] = [10, 12, 8];
/** The zoom the local Lines' Trains are pills from, Cercanías', Rodalies' and FGC's (networks.ts's `pillZoom`). */
export const LOCAL_PILL_ZOOM = 10;

/**
 * The size of a Line's name on its Trains' pills but the followed Train's, in px, by the zoom its Network's
 * Trains are pills from: a Network's that are pills before the local Lines', long distance's, Ouigo's
 * and Media Distancia's from zoom 9, are lettered at SMALL_TEXT, so that they give way to the local Lines' where those
 * are read (#780).
 */
export function pillText(pillZoom: number): number {
  return pillZoom < LOCAL_PILL_ZOOM ? SMALL_TEXT : PILL_TEXT;
}
/** How far a pill reaches beyond its Line's name either side, and above and below the name's line, in px. */
export const [PILL_PADDING, PILL_EDGE] = [2, 1.5];
/** MapLibre's `text-line-height`, in ems: the height of a line of text, as of the Line's name a pill fits or of a place's name. */
export const LINE_HEIGHT = 1.2;
/** How far outside its pill's outline the middle of a Train's arrow is, in px. */
export const ARROW_GAP = 7;

/** How a Line's Trains are outlined: rounded, pointed at both ends, slanted at both ends, or a rounded square. */
export type Outline = 'round' | 'pointed' | 'slanted' | 'badge';

/**
 * The outlines' sizes, `w`×`h` px around their middles, and for a pill's the `across` px of its middle
 * that fits its Line's name, which its outline stretches 2 px both ways to fit (main.ts's OUTLINES).
 */
export const OUTLINE_SIZES = {
  round: { w: 15, h: 15, across: 9 },
  pointed: { w: 12, h: 15, across: 2 },
  slanted: { w: 15, h: 15, across: 3 },
  badge: { w: 15, h: 15, across: 13 },
  arrow: { w: 12, h: 12 },
} satisfies Record<Outline | 'arrow', { w: number; h: number; across?: number }>;

/**
 * Each kind of service's pills: rounded for commuter and suburban Lines, pointed at both ends for
 * regional ones, slanted at both ends for long-distance ones (#262), and badges for metros and trams, as
 * their operators badge their Lines, and for rack railways and funiculars (#90).
 */
export const OUTLINES_OF: Record<Kind, Outline> = { commuter: 'round', regional: 'pointed', 'long-distance': 'slanted', metro: 'badge', tram: 'badge', rack: 'badge', funicular: 'badge' };

/** How a Line's Trains are outlined: by its kind of service, and round where a track built before #241 names none. */
export function outlineOf(kind: Kind): Outline {
  return OUTLINES_OF[kind] ?? 'round';
}

/** How far a pill reaches either side of its Train and above and below it, in px, with its outline, around a name `width` px wide at PILL_TEXT, lettered at `size` px. */
export function boxOf(outline: Outline, width: number, size: number): [number, number] {
  const { w, across } = OUTLINE_SIZES[outline];
  return [Math.max(w, w - across + (width * size) / PILL_TEXT + 2 * PILL_PADDING) / 2, PILL_EDGE + (LINE_HEIGHT * size) / 2];
}

/**
 * How far a followed Train's pill reaches either side of it along its track, in metres, given the
 * pill's `box` (boxOf(), at FOLLOWED_TEXT), the map's zoom, the zoom its Line's Trains are drawn as
 * pills from and the latitude it's at. It follows the zoom, so that the Stations the pill covers on the
 * map are those a card says its Train is arriving at. Short of the zoom its Trains are pills from, none
 * is drawn, so it reaches as far as it does at that zoom.
 * ponytail: the pill's half-length, its longest reach, whichever way the track runs, though the pill is
 * level on the screen and reaches only its 8.7 px of height up a north–south track. Turn it with
 * toEdge(box, heading − bearing) if `Arriving` is found early there, which would change the words as
 * the viewer turns the map.
 */
export function pillReach([halfWidth]: [number, number], zoom: number, pillZoom: number, lat: number): number {
  return halfWidth * pixelMetres(Math.max(zoom, pillZoom), lat);
}

/** How wide a Scheduled Train's dashed ring is, just outside its pill's outline, and its dashes and the gaps between them, in px (#519). */
export const [DASHED_RING, DASH, GAP] = [2, 3, 2];

/** The outlines' corners, as main.ts's OUTLINES draws them `w`×`h` px: the rounded ones' radii, and the rest's corners clockwise from the top left. */
const CORNERS: Record<Outline, number | [number, number][]> = {
  round: 6.5,
  badge: 3,
  // Its ends 5 px long, to a point 2 px across.
  pointed: [[-1, -7.5], [1, -7.5], [6, -1], [6, 1], [1, 7.5], [-1, 7.5], [-6, 1], [-6, -1]],
  // Its ends cut slanting the same way, 6 px across its height.
  slanted: [[-1.5, -7.5], [7.5, -7.5], [1.5, 7.5], [-7.5, 7.5]],
};

/**
 * A pill's outline round its middle, clockwise, in px (x right, y down), stretched to its `box` as
 * MapLibre fits main.ts's outline to the name: across its middle, and above and below it, or squeezed
 * there where the name is lower than the outline, as an 8 px one (pillText()).
 * ponytail: squeezes the slanted ends' slant too, as MapLibre leaves an outline's fixed part as it is.
 * Within a pixel, under the dashes.
 */
export function outlinePath(outline: Outline, [halfWidth, halfHeight]: [number, number]): [number, number][] {
  const { w, h } = OUTLINE_SIZES[outline];
  const corners = CORNERS[outline];
  const path: [number, number][] =
    typeof corners === 'number'
      ? [
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ].flatMap(([sx = 0, sy = 0], quarter) =>
          Array.from({ length: 7 }, (_, i): [number, number] => {
            const angle = ((quarter - 1 + i / 6) * Math.PI) / 2;
            return [sx * (w / 2 - corners) + corners * Math.cos(angle), sy * (h / 2 - corners) + corners * Math.sin(angle)];
          }),
        )
      : corners;
  const [across, up] = [halfWidth - w / 2, halfHeight - h / 2];
  return path.map(([x, y]) => [x + Math.sign(x) * across, up < 0 ? (y * halfHeight) / (h / 2) : y + Math.sign(y) * up]);
}

/** How far out the followed Train's target rings it, its inner ring and its outer, in px from its middle, given how far its pill's box reaches to its corners, or its dot's radius (#519). */
export function targetRings(reach: number): [number, number] {
  return [reach + 11, reach + 17];
}

/** How long the target's pulse takes to go out, in ms, and how much further out it goes from its outer ring, in px. */
const [PULSE, PULSE_OUT] = [1600, 11];

/** Where the target's pulse is at a time, in ms: its radius, from its outer ring's `outer` px, and its opacity, fading out from 35%. */
export function pulse(outer: number, time: number): [radius: number, opacity: number] {
  const phase = (time % PULSE) / PULSE;
  return [outer + PULSE_OUT * phase, 0.35 * (1 - phase)];
}

/** How large a Live Train's halo is drawn at a zoom, against its size (#519): 0.6 of it below zoom 12, where halos heap up, and from 12 as large, or on the dark basemap 1.6 times, as a glow. */
export function haloScale(zoom: number, dark: boolean): number {
  return zoom < 12 ? 0.6 : dark ? 1.6 : 1;
}

/** How many whole dashes, DASH and GAP long, a Scheduled pill's straight sides hold, above and below its name, given its `box` (boxOf()): the straight sides of its dashed outline (dashedOutline()), which MapLibre stretches the rest of the way. */
export function dashesAcross(outline: Outline, [halfWidth]: [number, number]): number {
  return Math.max(0, Math.floor((2 * halfWidth - OUTLINE_SIZES[outline].w) / (DASH + GAP) + 1e-9));
}

/** An image MapLibre reads as a signed distance field, `width`×`height` texels at 2 a px, its field in each texel's alpha, 0.75 at its edge and 1/8 less a px out (main.ts's addOutline()). */
export interface Field {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  stretchX?: [number, number][];
  stretchY?: [number, number][];
  content?: [number, number, number, number];
}

/** A field `w`×`h` px round its middle, 3 px more each way, from how far outside its shape each point is, in px (x right, y down), or where `clear` says, clear. */
function field(w: number, h: number, outside: (x: number, y: number) => number): Field {
  const [width, height] = [(w + 6) * 2, (h + 6) * 2];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) data[(row * width + col) * 4 + 3] = 255 * (0.75 - outside((col + 0.5 - width / 2) / 2, (row + 0.5 - height / 2) / 2) / 8);
  }
  return { width, height, data };
}

/**
 * A Scheduled pill's outline as a field (#519): filled within, and just outside, as far as the halo
 * MapLibre draws DASHED_RING px wide, its ring in DASH px dashes and GAP px gaps along it, a gap at the
 * middle of its top and of its bottom, where MapLibre stretches it to the pill's box, and the dashes
 * from there meeting at its ends. Its straight sides are `n` dashes longer than its outline's
 * (dashesAcross()), so that it's stretched by less than a dash.
 * ponytail: stretched in one gap, which grows by up to a dash's step on a pill wider than its whole dashes.
 */
export function dashedOutline(outline: Outline, n: number): Field {
  const { w, h, across = 0 } = OUTLINE_SIZES[outline];
  const longer = n * (DASH + GAP);
  const path = outlinePath(outline, [(w + longer) / 2, h / 2]);
  // Each point of the path's distance along it, round from its first.
  const along = path.map((_, i) => path.slice(0, i).reduce((sum, p, j) => sum + Math.hypot(path[j + 1]![0] - p[0], path[j + 1]![1] - p[1]), 0));
  const perimeter = along[path.length - 1]! + Math.hypot(path[0]![0] - path[path.length - 1]![0], path[0]![1] - path[path.length - 1]![1]);
  /** The nearest point of the path to a point: how far it is, and how far round the path. */
  const nearest = (x: number, y: number) => {
    let best = { d: Infinity, s: 0 };
    path.forEach(([ax, ay], i) => {
      const [bx, by] = path[(i + 1) % path.length]!;
      const [dx, dy] = [bx - ax, by - ay];
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
      if (d < best.d) best = { d, s: along[i]! + t * Math.hypot(dx, dy) };
    });
    return best;
  };
  const [top, bottom] = [nearest(0, -h / 2).s, nearest(0, h / 2).s];
  const round = (a: number, b: number) => Math.min(Math.abs(a - b), perimeter - Math.abs(a - b));
  // Whether a point is inside the path, by the crossings of a ray to its right.
  const inside = (x: number, y: number) => path.reduce((odd, [ax, ay], i) => {
    const [bx, by] = path[(i + 1) % path.length]!;
    return (ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay) ? !odd : odd;
  }, false);
  const image = field(w + longer, h, (x, y) => {
    const { d, s } = nearest(x, y);
    if (inside(x, y)) return -d;
    // From the nearer middle, a gap GAP / 2 either side, then dashes and gaps.
    const from = Math.min(round(s, top), round(s, bottom));
    return (from - GAP / 2) % (DASH + GAP) < DASH && from >= GAP / 2 ? d : 8;
  });
  const [x, y, high] = [image.width / 2, image.height / 2, h - 2 * PILL_EDGE];
  return { ...image, stretchX: [[x - 2, x + 2]], stretchY: [[y - 2, y + 2]], content: [x - across - longer, y - high, x + across + longer, y + high] };
}

/** How many dashes ring a Scheduled Train's dot, and how much of each step round they take (#519). */
export const [DOT_DASHES, DOT_DASH] = [8, 0.6];

/** A Scheduled dot's ring as a field: DOT_DASHES dashes, the first straddling its top, round a dot `radius` px across, from its edge to half its radius out, and nothing within. */
export function dashedDot(radius: number): Field {
  const step = (2 * Math.PI) / DOT_DASHES;
  const side = 3 * radius;
  return field(side, side, (x, y) => {
    const r = Math.hypot(x, y);
    // How far round from the middle of the nearest dash, in px along the ring's middle.
    const turn = Math.atan2(x, -y);
    const off = Math.abs(turn - step * Math.round(turn / step)) * 1.25 * radius;
    return Math.max(radius - r, r - 1.5 * radius, off - (step * DOT_DASH * 1.25 * radius) / 2);
  });
}
