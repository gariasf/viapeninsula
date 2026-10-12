// Search (#471): the places it finds Stations in, from the file below zoom 7, which every view loads, and
// the Trips it finds by Train number, of the regions the map has loaded; and in which order it lists them.
// Pure, with nothing from the page, so that Node tests it.

import { places, type Place, type Station, type Trip, type ZoomedOut } from '../bundle.ts';
import type { TripNow } from '../engine.ts';
import { inNameOrder } from './cards.ts';

/** A place Search finds Stations in: as the map shows one (places()), but with no point, which the file below zoom 7 hasn't got. */
export type Found = Omit<Place, 'lon' | 'lat'>;

/**
 * A text's words as Search compares a name with a query: in lower case, without accents, nor the middle
 * dot of Catalan's l·l, which few type, split at whatever else isn't a letter or a digit, as a space, a
 * hyphen or an apostrophe.
 */
export function words(text: string): string[] {
  return text.normalize('NFKD').replace(/[\p{M}·]/gu, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * The places Search finds Stations in, from the file below zoom 7 (#471): its Stations, region by region,
 * grouped as the map groups them, by the places their operators group them in (places()), each with its
 * Lines in the order the cards name Lines (inNameOrder()) and their Networks. None from a file built before
 * #471, which names no Stations.
 */
export function searchPlaces({ stations, names, lines = [] }: Pick<ZoomedOut, 'stations' | 'names' | 'lines'>): Found[] {
  const networkOf = new Map(lines.map((l) => [l.id, l.network]));
  const order = new Map(inNameOrder(lines).map((l, i) => [l.id, i]));
  const named = Object.entries(stations).flatMap(([region, ids]) =>
    ids.flatMap((id, i): Station[] => {
      const station = names?.[region]?.[i];
      return station ? [{ ...station, id, lon: NaN, lat: NaN, networks: [...new Set((station.lines ?? []).flatMap((l) => networkOf.get(l) ?? []))] }] : [];
    }),
  );
  const rank = (line: string) => order.get(line) ?? lines.length;
  return places(named).map(({ lon, lat, ...place }) => ({ ...place, lines: place.lines.toSorted((a, b) => rank(a) - rank(b)) }));
}

/**
 * The places whose names have a word starting with each word of `query` (words()), in the order of their
 * names so compared, those that read alike in the order given, region by region (#471); each with whether
 * another of them reads as it does, which its row names its Networks for. None for a query of no word.
 */
export function findPlaces<P extends Pick<Place, 'name'>>(found: P[], query: string): { place: P; alike: boolean }[] {
  const asked = words(query);
  if (!asked.length) return [];
  const matched = found
    .flatMap((place) => {
      const own = words(place.name);
      return asked.every((word) => own.some((w) => w.startsWith(word))) ? [{ place, key: own.join(' ') }] : [];
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const read = new Map<string, number>();
  for (const { key } of matched) read.set(key, (read.get(key) ?? 0) + 1);
  return matched.map(({ place, key }) => ({ place, alike: (read.get(key) ?? 0) > 1 }));
}

/** The digits a query finds Trips by, as the start of their Train numbers: two or more, with nothing else but spaces round them (#471). */
export function numberQuery(query: string): string | undefined {
  const digits = query.trim();
  return /^\d{2,}$/.test(digits) ? digits : undefined;
}

/** The Trips whose Train numbers start with a query's digits (numberQuery()), of those given: only Renfe's have numbers. None for any other query. */
export function numbered(trips: Trip[], query: string): Trip[] {
  const digits = numberQuery(query);
  return digits ? trips.filter((t) => t.number?.startsWith(digits)) : [];
}

/** How many of the Trips it finds by Train number Search shows: it says how many more there are. */
const SHOWN = 6;

/** A section of what Search shows for a query: the places it finds Stations in, or the Trips it finds by Train number that it shows, and how many more it found. */
export type Section = { places: { place: Found; alike: boolean }[] } | { trains: TripNow[]; more: number };

/**
 * What Search shows for a query, given the places it finds Stations in and the Trips it finds by Train number,
 * where each one's Train is (#471): a section of each, Stations first, only where it has some, and none where it
 * finds nothing. Lines come first once Search finds them, with a Line's screen (#473).
 */
export function results(query: string, found: Found[], trains: TripNow[]): Section[] {
  const [stations, listed] = [findPlaces(found, query), trains.toSorted(trainOrder)];
  return [...(stations.length ? [{ places: stations }] : []), ...(listed.length ? [{ trains: listed.slice(0, SHOWN), more: Math.max(0, listed.length - SHOWN) }] : [])];
}

/** Where a Trip's Train is in its day, as its row says it, in the order Search lists them: running, on the map or within a closed Closure that hides Trains; still to leave its first Station; Cancelled; or ended. */
const STATES = ['running', 'leaving', 'cancelled', 'ended'] as const;
function stateOf(now: TripNow): (typeof STATES)[number] {
  if ('train' in now) return 'running';
  if ('coming' in now) return now.coming.within ? 'running' : 'leaving';
  return 'cancelled' in now ? 'cancelled' : 'ended';
}

/** The order of Search's Train rows: by where their Trains are (STATES), then by Train number, then by when they leave, as one number can be two days' Trips. */
function trainOrder(a: TripNow, b: TripNow): number {
  return STATES.indexOf(stateOf(a)) - STATES.indexOf(stateOf(b)) || Number(a.trip.number) - Number(b.trip.number) || (a.trip.calls[0]?.departure ?? 0) - (b.trip.calls[0]?.departure ?? 0);
}

/** How much shorter than the layout viewport the visual viewport has to be, in px, for the on-screen keyboard to be up: more than a browser's bars, and less than any keyboard. */
const KEYBOARD = 100;
/** How far Search's sheet keeps from the visual viewport's top and bottom while it's risen, in px, as the corners' cards keep from the screen's edges. */
const RISEN_GAP = 8;

/**
 * Where Search's sheet goes while the on-screen keyboard is up, which covers the bottom of the layout viewport
 * the sheet is docked to (#471): from RISEN_GAP under the top of the visual viewport, what's on screen, to
 * RISEN_GAP over its bottom, the keyboard's top, as how far up from the layout viewport's bottom it ends and how
 * high it is, given the layout viewport's height and the visual viewport, as `visualViewport` has them, in CSS px.
 * None while the keyboard's down, the visual viewport within KEYBOARD of the layout viewport's height, nor where
 * the page is zoomed, which shrinks the visual viewport too.
 */
export function keyboardRise(layout: number, { height, offsetTop, scale }: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'>): { bottom: number; height: number } | undefined {
  if (Math.abs(scale - 1) > 0.01 || layout - height <= KEYBOARD) return undefined;
  return { bottom: layout - offsetTop - height + RISEN_GAP, height: height - 2 * RISEN_GAP };
}
