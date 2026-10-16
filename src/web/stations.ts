// How the map draws the places (#210's pick, built by #572): which make an interchange, and what it's named.
import { APART, bandAt, direction, drawnIn, inBand, pointAt, slotAt, type Place, type Point, type Shape, type Slot } from '../bundle.ts';

/** A place as the map tiers it: named from `nameZoom`, the lower the higher its tier. */
export type Tiered = Pick<Place, 'id' | 'name' | 'networks' | 'stations' | 'lon' | 'lat'> & { nameZoom: number };

/**
 * An interchange (CONTEXT.md, ADR-0005): places of other Networks that people change between on foot, or one
 * place several Networks serve, drawn as one badge and sharing one board. Its places by their IDs, its Networks
 * in their marks' order (ORDER), its point their places' middle, and how it was made, for the build's log.
 */
export interface Interchange {
  id: string;
  name: string;
  /** The place named for it all, below SIGN_ZOOM and on the rails. */
  named: string;
  places: string[];
  networks: string[];
  lon: number;
  lat: number;
  how: 'rule' | 'hand' | 'one place';
}

/** How near, in metres, places of other Networks are, sharing a word of their names, to make one interchange. */
const NEAR = 350;
/** Words that don't make two places' names one interchange's. */
const COMMON = new Set(['barcelona', 'de', 'del', 'la', 'el', 'les', 'els', 'i', 'estacio', 'placa', 'pl', 'sant', 'santa', 'av', 'avinguda']);
/** The order Networks' marks go in, side by side: these first, then the rest by their IDs. */
export const ORDER = ['rodalies', 'fgc', 'metro', 'tram'];

/**
 * The interchanges the rule misses, those it makes that aren't, and the names it gets wrong, by place ID, as the
 * maintainer picked them (#572): `join` pairs of places it misses, as they go by other names; `apart` pairs it
 * shouldn't join; `names` an interchange's name, by any of its places.
 * ponytail: by ID, as main.ts's TIERS, so a place an operator renumbers drops out unnoticed. Warn of an ID not
 * found among the places if that happens.
 */
export const INTERCHANGES: { join: [string, string][]; apart: [string, string][]; names: Record<string, string> } = {
  join: [
    ['fgc:PR', 'tmb:P.6660328'], // Provença with Diagonal, 286 m
    ['adif:72305', 'tmb:P.6660114'], // L'Hospitalet de Llobregat with Rambla Just Oliveras, 98 m
    ['adif:79400', 'tmb:P.6660422'], // Estació de França with Barceloneta, 301 m
  ],
  apart: [
    ['adif:05451', 'euskotren:2577:'], // Bilbao la Concordia with Zazpikaleak/Casco Viejo, 340 m, across the river
  ],
  names: {
    'adif:71708': 'Bellvitge - Gornal', // the rule's is FGC's "Gornal"
  },
};

/** A place's name's words that can make it one interchange's with another's: no accents, capitals or COMMON ones. */
const wordsOf = (name: string) =>
  new Set(
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !COMMON.has(w)),
  );

/** Where a Network's mark goes among others, by ORDER, then by its ID. */
const rank = (network: string) => (ORDER.includes(network) ? ORDER.indexOf(network) : ORDER.length);
/** Networks in their marks' order. */
export const inOrder = (networks: string[]) => networks.toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b));

/**
 * The interchanges among these places: places of other Networks within NEAR of each other that share a word of
 * their names, and those `hand` joins, but not those it keeps apart; and each place of several Networks' Stations. Each
 * named as `hand` names it, or by its place of the highest tier, then of most Stations, then of the shortest name,
 * without "Barcelona", as people say it.
 * ponytail: every pair, about 130,000 for Catalonia's 518 places, once per track. File them by cell if Spain's are many more.
 */
export function interchangesOf(places: Tiered[], hand = INTERCHANGES): Interchange[] {
  const parent = new Map(places.map((p) => [p.id, p.id]));
  const root = (id: string): string => {
    const up = parent.get(id) ?? id;
    return up === id ? id : root(up);
  };
  const byHand = new Set<string>();
  const apart = new Set(hand.apart.flatMap(([a, b]) => [`${a} ${b}`, `${b} ${a}`]));
  const words = places.map((p) => wordsOf(p.name));
  const metres = (a: Tiered, b: Tiered) => Math.hypot((a.lon - b.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111_195);
  places.forEach((a, i) => {
    for (let j = i + 1; j < places.length; j++) {
      const b = places[j] as Tiered;
      if (apart.has(`${a.id} ${b.id}`) || a.networks.some((n) => b.networks.includes(n)) || metres(a, b) > NEAR || ![...(words[i] ?? [])].some((w) => words[j]?.has(w))) continue;
      parent.set(root(a.id), root(b.id));
    }
  });
  for (const [a, b] of hand.join) {
    if (!parent.has(a) || !parent.has(b)) continue;
    parent.set(root(a), root(b));
    byHand.add(a);
  }
  const groups = new Map<string, Tiered[]>();
  for (const p of places) groups.set(root(p.id), [...(groups.get(root(p.id)) ?? []), p]);
  return [...groups.values()].flatMap((group) => {
    const networks = inOrder([...new Set(group.flatMap((p) => p.networks))]);
    const [named] = group.toSorted((a, b) => a.nameZoom - b.nameZoom || b.stations.length - a.stations.length || a.name.length - b.name.length);
    // One place is one only where it's several Stations, as Martorell Central's two: a Station that several Networks'
    // Trains call at, as FEVE's that Cercanías León and Bilbao share, is one place, one board, its marks side by side.
    if (!named || networks.length < 2 || (group.length === 1 && named.stations.length < 2)) return [];
    const ids = group.map((p) => p.id).sort();
    const name = ids.map((id) => hand.names[id]).find((n) => n !== undefined) ?? named.name.replace(/^Barcelona\s*-?\s*/, '');
    const how = group.length === 1 ? 'one place' : group.some((p) => byHand.has(p.id)) ? 'hand' : 'rule';
    return [{ id: `interchange:${ids[0]}`, name, named: named.id, places: ids, networks, lon: group.reduce((s, p) => s + p.lon, 0) / group.length, lat: group.reduce((s, p) => s + p.lat, 0) / group.length, how }];
  });
}

/**
 * The Networks whose marks a place is drawn with, and which make it an interchange: its own but those drawn at every
 * zoom (`everywhere`, long distance's and Media Distancia's, drawnFrom(), #781), whose Trains call at Rodalies' Stations
 * up and down Catalonia and would make each one an interchange; those where they're all it has, as Camp de Tarragona.
 */
export function markedNetworks(networks: string[], everywhere: (network: string) => boolean): string[] {
  const local = networks.filter((n) => !everywhere(n));
  return local.length ? local : networks;
}

/** Where a Station's Trips call, by Line and shape, and how far along the shape. */
export type Call = { line: string; shape: string; dist: number };

/**
 * Where a Station's dot goes in a zoom band: on the centreline most of its own Lines are drawn along there, its point
 * and heading (degrees clockwise from north), and how far right of it the middle of those Lines' strokes is, in line
 * widths, as onStroke() draws a Line (#572). None where its Lines aren't drawn in the band.
 * ponytail: by the centreline's point, not where a node's curve takes a Line across it (zones()), so in a node a
 * Station's dot can be up to a line width off its Lines (ADR-0007). Take the curve's point there if that shows.
 */
export function onLines(calls: Call[], slots: Map<string, Slot[]>, shapes: Map<string, Shape>, band: number): { point: Point; heading: number; side: number } | undefined {
  const found = calls.flatMap(({ line, shape, dist }) => {
    const slot = slots.get(`${line} ${shape}`)?.find((s) => s.from <= dist && dist <= s.to && drawnIn(s, band));
    return slot ? [{ slot, at: slotAt(slot, dist).at }] : [];
  });
  const counts = new Map<string, number>();
  for (const { slot } of found) counts.set(slot.on, (counts.get(slot.on) ?? 0) + 1);
  const on = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const centre = on === undefined ? undefined : inBand(shapes, on, band);
  if (!centre) return undefined;
  const here = found.filter(({ slot }) => slot.on === on);
  const at = here.reduce((sum, h) => sum + h.at, 0) / here.length;
  const [e, n] = direction(centre, Math.max(0, at - 30), at + 30);
  const sides = here.map(({ slot }) => slot.side);
  return { point: pointAt(centre, at), heading: (Math.atan2(e, n) * 180) / Math.PI, side: (Math.min(...sides) + Math.max(...sides)) / 2 };
}

/** The zoom the marks and badges show from, fading in over the half zoom before it as the dots fade out. */
export const SIGN_ZOOM = 13;
/** The zoom the Lines are back on their rails at, where each Station's mark goes on its own track. */
export const RAILS = APART.at(-1)?.[0] ?? 15;
/** Below this zoom, where the dots have faded half out and the marks half in, a tap takes a dot, and from it a mark. */
const SWITCH = SIGN_ZOOM - 0.25;
/** From this zoom the places of `fewer()` fade in, drawn by FEW_ZOOM + 1. */
export const FEW_ZOOM = 11;

/**
 * The places in neither tier whose Networks' Trains are all dots till zoom 12 (Network's `pillZoom`), the Metro's and
 * TRAM's, by their IDs: drawn from FEW_ZOOM only, fading in by 12, as their Trains turn into pills (#572).
 */
export function fewer(places: { id: string; larger: number; networks: string[] }[], pillZoom: Map<string, number>): Set<string> {
  return new Set(places.filter((p) => p.larger === 0 && p.networks.length && p.networks.every((n) => (pillZoom.get(n) ?? 0) >= 12)).map((p) => p.id));
}

/** One of what draws a place: a Station's dot on its Lines in a zoom band, its mark on its track, a place's mark, an interchange's badge. */
export type Drawn = { kind: 'dot'; band: number; few?: boolean } | { kind: 'rails' } | { kind: 'mark'; railed: boolean } | { kind: 'badge' };

/**
 * Whether it's drawn at a zoom, and so takes a tap and shows the pointer: the map's layers span whole zooms, and cut it
 * to its own zooms by its opacity, which MapLibre's queries don't heed. A dot in its own band below the marks, but for
 * fewer()'s below FEW_ZOOM; a mark or badge from then, and on the rails, a place's mark only where none of its Stations
 * has its own on its track, and each Station's there.
 */
export function drawnAt(drawn: Drawn, zoom: number): boolean {
  switch (drawn.kind) {
    case 'dot':
      return zoom < SWITCH && bandAt(zoom) === drawn.band && !(drawn.few && zoom < FEW_ZOOM);
    case 'rails':
      return zoom >= RAILS;
    case 'mark':
      return zoom >= SWITCH && (!drawn.railed || zoom < RAILS);
    case 'badge':
      return zoom >= SWITCH && zoom < RAILS;
  }
}
