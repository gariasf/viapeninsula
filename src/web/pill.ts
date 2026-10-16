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
