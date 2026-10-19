// What the daily build and the fetcher publish, and the web app reads.

/** The R2 bucket, behind the CDN, that serves the daily bundles and the live snapshot. */
export const LIVE_URL = 'https://viapeninsula-live.gariasf.com';

/** The live data, as the fetcher writes it about every 20 s (ADR-0003). */
export interface Snapshot {
  /** When the fetcher wrote it, in ms since 1970. */
  generated: number;
  /** How fresh each Network's live data is. */
  feeds: Record<string, Freshness>;
  /**
   * What the operators report about each Train: for a feed whose last try failed, what it said when it
   * last worked, and for a Network whose Trains have all just vanished from a feed that works and feeds
   * other Networks too, what it last said of them, for two tries (src/fetcher/step.ts).
   */
  reports: Report[];
  /** The Stations Renfe has said Trips won't stop at, where it has said so of any: as it does of the Stations a Train cut short, or that starts late, doesn't run to (#346). */
  skipped?: Skipped[];
}

/** A Trip's Stations its operator has said it won't stop at, where its trip updates list them SKIPPED (#346). */
export interface Skipped {
  /** Its Trip, as the bundle names it; or for a Train its operator names by any part of its run, none. */
  trip?: string;
  /** For a Train its operator names by any part of its run, as Renfe's long-distance live data does: its Train number, the union of every part's Stations (#426). */
  number?: string;
  /** The Stations, by their IDs. */
  stations: string[];
  /** When its operator first said so of any of them, in ms since 1970: Renfe no longer lists a Station its timetable has left, skipped or not. */
  since: number;
}

/** When the fetcher last tried a Network's live data and last got it, in ms since 1970, how the try went, and how often it tries. */
export interface Freshness {
  lastSuccess?: number;
  lastAttempt: number;
  /** `ok`, or what went wrong. */
  status: string;
  /** How long from one try to the next, in ms. Its Trains turn Scheduled once they miss about three. */
  every: number;
}

/** What an operator reports about one Train. */
export interface Report {
  /** Its Trip, as the bundle names it, or for the Metro, whose timetable names no Blocks, none: the engine matches its Block to one. */
  trip?: string;
  /**
   * For a Train its operator names by any part of its run, as Renfe's long-distance live data does: its
   * Train number, which the engine finds its Trip by, in any Network, on the day nearest in time (#261).
   */
  number?: string;
  /**
   * For a Train its operator names by a Trip the bundle doesn't have, as Geotren does Montserrat's
   * rack Trains: its Line, as the bundle names it. The engine matches it to the Line's Trip whose
   * `trip_id` ends as its own does, after the `|`.
   */
  line?: string;
  /** For the Metro, which names each Train by its Block: its Line, as the bundle names it, and TMB's number for it, which another Line's can share. */
  block?: { line: string; number: string };
  /** For the Metro, where it's headed, as its Trip's headsign has it. */
  headsign?: string;
  /** When the operator reported it, in ms since 1970. */
  at: number;
  /**
   * Where it is, in the feed's own terms: its coordinates; at or near a Station, or for TRAM the stop
   * it's at or has just left, by TRAM's number for its platform, which isn't the bundle's; how far it
   * has come along its Trip since its first Station, in metres, as TRAM counts them, which TRAM gives
   * only for about 40 s as it reaches a Station (#42); or for the Metro, the Station it comes to next,
   * and when it's expected there, in ms since 1970.
   */
  position?: { lon: number; lat: number } | Near | { along: number } | { next: { station: string; at: number } };
  /** How late it's running, in seconds, as its operator has it: early where it's negative. */
  delay?: number;
  /** Where its operator gives no Delay, when it expects it at a Station, in ms since 1970, as FGC does. */
  expected?: { station: string; at: number };
  /** Whether its operator has announced that it won't run. */
  cancelled?: true;
  /** The type of Unit it runs as, where its operator publishes it: FGC's series, such as 213x2 for two 213s coupled. */
  unitType?: string;
}

/**
 * A Train at or near a Station, as a report's position names it. For Renfe's Cercanías: when Renfe first
 * named it there, in ms since 1970, as the report's `at` has it, where none of its reports since has
 * named another Station or given GPS, nor has it been left out of Renfe's feeds for 2 minutes or more
 * (`since`); and whether Renfe has it standing there or coming in to it, its `currentStatus` (#670).
 */
export interface Near {
  near: string;
  since?: number;
  status?: 'STOPPED_AT' | 'INCOMING_AT';
}

/**
 * The operators' Alerts, as the fetcher writes them to alerts.json beside the snapshot, when what it
 * holds changes and at least every 5 minutes (ADR-0003, ADR-0012): each feed's, by the ID of the live
 * source it's from (src/networks.ts), such as `renfe`.
 */
export type Alerts = Record<string, AlertFeed>;

/** One operator's Alerts: when the fetcher last read them, when their file last changed, how its last try went, and the Alerts as it last read them, newest first. */
export interface AlertFeed {
  /**
   * When it last read them, in ms since 1970, where it has. It reads Renfe's every 20 s and TRAM's
   * every 5 minutes, and writes this at least every 5 minutes, so while a feed and the fetcher work, it
   * was never more than about 10 minutes ago.
   */
  read?: number;
  /**
   * When the feed's file last changed, in ms since 1970, where its feed says: its Last-Modified, which
   * Renfe sends with its file, or else its header's timestamp, the later of those of a feed's files. Renfe's
   * file stood from 7 October 2026, 09:32 CEST, for days, which `read` can't say, as its 304s are tries
   * that worked (#390).
   */
  changed?: number;
  /** `ok`, or what went wrong. */
  status: string;
  alerts: Alert[];
}

/** What an operator says about Lines or Stations, in its own words (ADR-0012). */
export interface Alert {
  /** The operator's ID for it. */
  id: string;
  /** Its Lines, as the bundle names them, such as `rodalies:R1`. */
  lines: string[];
  /** Its Stations, as the bundle names them, such as `adif:70100`. */
  stations: string[];
  /** When it began, in ms since 1970, where it says. */
  from?: number;
  /** When it ends, in ms since 1970, where it says. */
  to?: number;
  /** What it does to service, where it says, as GTFS-RT names it, such as `MODIFIED_SERVICE`. */
  effect?: string;
  /** Its title, where it has one, and its words: each in the languages it gives them, its feed's own first. */
  header?: Words[];
  description: Words[];
}

/** An Alert's words in one language, by its code, such as `ca`, where its feed says. */
export interface Words {
  language?: string;
  text: string;
}

/**
 * Names each region's bundle for each service day. Cached briefly; the bundles it names never change.
 * The regions are in the order of their first Networks, which is the order the map lists the Networks in.
 */
export interface Manifest {
  regions: ManifestRegion[];
  /** The file below zoom 7 (ZoomedOut, #266), where the build makes one, as a manifest from before #266 doesn't. */
  zoomedOut?: string;
}

/**
 * What the map draws below zoom 7, every region's, in one file of its own, built with the regions
 * (#266): every region's Networks, which the map credits and names in the banner, and Search by their
 * short names where two places read alike (#471), and each Network's track, as the map draws it below
 * zoom 7 (#190), simplified, so that it never loads a region for the view there; and each region's
 * Stations, by their IDs, by the region's, which a link that names a Station finds the regions it loads
 * by, and Search finds every Station in Spain in, with no region loaded (#471).
 */
export interface ZoomedOut {
  networks: Network[];
  /** Each Network's track below zoom 7, as banner.ts's NetworkTrack. */
  tracks: { network: string; coordinates: Point[] }[];
  stations: Record<string, string[]>;
  /**
   * Each region's Stations' names, the places their operators group them in and the Lines whose timetable
   * calls there, in the order `stations` lists their IDs, which Search finds a Station by (#471): none in a
   * file built before #471, nor Lines for a Station of a track built before #392.
   */
  names?: Record<string, Pick<Station, 'name' | 'place' | 'lines'>[]>;
  /** Every region's Lines, which Search names a Station's with, as pills: none in a file built before #471. */
  lines?: Pick<Line, 'id' | 'network' | 'name' | 'colour' | 'kind'>[];
}

/**
 * A region's service days (ADR-0014): the last day before today that its last build named, where it
 * did, and today and the days after. A region whose build failed keeps the days its last build named, so
 * the others publish as ever.
 * ponytail: each day names its region's track again, as it did, and the page reads the manifest every
 * minute: 9.9 KB (1.5 KB brotli) for 15 regions' 3 days, with their Networks and extents (#266), as it
 * names every region whichever the map has in view. Name a region's track once if that grows.
 */
export interface ManifestRegion {
  id: string;
  days: ManifestDay[];
  /** Its Networks, by their IDs, which a link to one of their Trains finds it by (#266). */
  networks?: string[];
  /**
   * Where its Stations and track lie, which the map loads it once it has in view (#266): none for a
   * region every view loads, as long distance's will (EVERYWHERE), as a manifest from before #266 names
   * none for any.
   * ponytail: one box, which takes in places the region's track doesn't reach, so the map loads it there
   * too: Catalonia's, from R15's end at Zaragoza to Portbou, at Huesca. Give a region a box for each part
   * of its track, or test the view against its Network tracks in the file below zoom 7, if that shows.
   */
  extent?: [west: number, south: number, east: number, north: number];
}

/**
 * A region's files for a service day, its track and its Trips, and when its first Train comes onto
 * the map and its last leaves it, on time, in ms since 1970.
 */
export interface ManifestDay {
  date: string;
  track: string;
  trips: string;
  from: number;
  to: number;
  /** The Networks with no Trips that day, by their IDs, where there are any: they're built without them, and the map says so (#226). */
  noTrips?: string[];
}

/**
 * A service day as the map takes it from the manifest, across its regions: when its first Train in any
 * of them comes onto the map and its last leaves it, in ms since 1970 (never, where none has a Train
 * that day), the Networks with no Trips that day in any, and each region's files for it, in the manifest's order.
 */
export interface DayFiles extends Pick<ManifestDay, 'date' | 'from' | 'to' | 'noTrips'> {
  regions: { id: string; track: string; trips: string }[];
}

/**
 * The service days the manifest names, oldest first, each once, joined from its regions' entries for it,
 * or from those of `only` where it's given, as the regions the map has loaded (#659).
 * A region with no Trips that day has no times for it (JSON holds them as null), and the others time it.
 */
export function daysOf({ regions }: Manifest, only?: ReadonlySet<string>): DayFiles[] {
  const found = new Map<string, DayFiles>();
  // A manifest of an older shape has no regions: it names no day the map can read.
  for (const { id, days } of regions ?? []) {
    if (only && !only.has(id)) continue;
    for (const d of days) {
      const day = found.get(d.date) ?? { date: d.date, from: Infinity, to: -Infinity, regions: [] };
      found.set(d.date, day);
      if (Number.isFinite(d.from)) day.from = Math.min(day.from, d.from);
      if (Number.isFinite(d.to)) day.to = Math.max(day.to, d.to);
      if (d.noTrips?.length) day.noTrips = [...new Set([...(day.noTrips ?? []), ...d.noTrips])];
      day.regions.push({ id, track: d.track, trips: d.trips });
    }
  }
  return [...found.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * The regions' tracks as one (ADR-0014), as a build of all their Networks at once would have made it:
 * each region's Networks, Lines, shapes, strokes, rails, slots and Network tracks in turn, and each
 * Station once, as the first region that has it has it, naming every Network whose Trains stop there and
 * the Lines of each that call, as one that two regions serve is built in each, as León's was where
 * Bilbao's C4 ran to it (#368). No other ID is in two regions' tracks: a Line's and a traced shape's
 * start with its Network's, and a Stretch's with its region's.
 */
export function joinTracks(tracks: Track[]): Track {
  const stations = new Map<string, Station>();
  for (const s of tracks.flatMap((t) => t.stations)) {
    const known = stations.get(s.id);
    if (!known) {
      stations.set(s.id, s);
      continue;
    }
    const networks = [...new Set([...(known.networks ?? []), ...(s.networks ?? [])])];
    // And the Lines of both, which a board names (#392), in order as the build's stationsOf() has them.
    const lines = [...new Set([...(known.lines ?? []), ...(s.lines ?? [])])].sort();
    stations.set(s.id, { ...known, ...(networks.length > 0 && { networks }), ...(lines.length > 0 && { lines }) });
  }
  return {
    networks: tracks.flatMap((t) => t.networks),
    lines: tracks.flatMap((t) => t.lines),
    stations: [...stations.values()],
    shapes: tracks.flatMap((t) => t.shapes),
    strokes: tracks.flatMap((t) => t.strokes),
    rails: tracks.flatMap((t) => t.rails),
    slots: tracks.flatMap((t) => t.slots),
    tracks: tracks.flatMap((t) => t.tracks),
  };
}

/** Each Network's track as the map draws it below zoom 7 (#190), from a track's: none from a track built before #190. */
export function networkTracks({ lines, shapes, tracks }: Pick<Track, 'lines' | 'shapes' | 'tracks'>): ZoomedOut['tracks'] {
  const [byLine, byShape] = [new Map(lines.map((l) => [l.id, l])), new Map(shapes.map((s) => [s.id, s]))];
  return (tracks ?? []).flatMap(({ line: id, shape: shapeId, from, to }) => {
    const [line, shape] = [byLine.get(id), byShape.get(shapeId)];
    return line && shape ? [{ network: line.network, coordinates: along(shape, from, to) }] : [];
  });
}

/** The regions' Trips of one service day as one: each region's Trips, and Closures where any has them, in turn. */
export function joinTrips(days: DayTrips[]): DayTrips {
  const first = days[0];
  if (!first) throw new Error('No region has Trips to join');
  const closures = days.flatMap((d) => d.closures ?? []);
  return { serviceDay: first.serviceDay, noonMinus12h: first.noonMinus12h, trips: days.flatMap((d) => d.trips), ...(closures.length > 0 && { closures }) };
}

/**
 * What the map draws before any Train, which it loads first: the Networks, Lines, Stations and track
 * of one region, in one file that every day a build publishes shares (ADR-0014); the map joins the
 * regions' as one (joinTracks()).
 */
export type Track = Pick<Bundle, 'networks' | 'lines' | 'stations' | 'shapes' | 'strokes' | 'rails' | 'slots' | 'tracks'>;

/** A service day's Trips and Closures, which the map loads after its track. */
export type DayTrips = Pick<Bundle, 'serviceDay' | 'noonMinus12h' | 'trips' | 'closures'>;

/** Everything the map needs for one service day: its track, its Trips and its Closures. */
export interface Bundle {
  serviceDay: string;
  /**
   * When the service day's timetable reads 00:00:00, in ms since 1970: noon less 12 hours, as GTFS
   * has it, which on the nights the clocks change is an hour off midnight.
   */
  noonMinus12h: number;
  networks: Network[];
  lines: Line[];
  stations: Station[];
  /** The Lines' track, and the centrelines of the stretches they're drawn along, whose IDs start with STRETCH, some smoothed for a zoom band too (smoothId()). */
  shapes: Shape[];
  /** How the map draws the Lines: each Line once on each stretch it runs along, beside the other Lines on it (ADR-0006). */
  strokes: Stroke[];
  /** How the map draws the Lines zoomed right in, where they're back on the rails: each Line's own track once, marked where Lines share it, which the map draws grey (#139). */
  rails: Stroke[];
  /** Where the map puts each Line's Trains zoomed out: every one of its shapes, all along it, on the Line's stroke (#176). */
  slots: Slot[];
  /** How the map draws the track below zoom 7: each Network's once, in its colour, on the shapes of its Lines that run it (#190). */
  tracks: Stroke[];
  trips: Trip[];
  /** The service day's Closures, where it has any: a day file built before #340 has none. */
  closures?: Closure[];
}

export interface Network {
  id: string;
  name: string;
  /**
   * A shorter name its riders know it by, where its name is long, as `Rodalies`, which Search names it by
   * where two places read alike (#471): given in its config and in the file below zoom 7, not in a track,
   * as the credits and the banner name it in full.
   */
  short?: string;
  profile: SpeedProfile;
  /** Which track of a double track its Trains run on, looking the way they go. */
  runningSide: 'left' | 'right';
  /** The colour its track is drawn in below zoom 7 (#190), near its brand's. */
  colour: string;
  /** The zoom its Trains are drawn as pills from, with their Line's name, and as dots below it (#90). */
  pillZoom: number;
  /** Who its data comes from, credited as their terms ask: the same for each Network a source feeds, which the map credits once (ADR-0010). */
  credit: Credit;
  /** How the engine reads its live data, where it has any. */
  live?: LiveTraits;
}

/** A source's credit: its name, or the words its terms ask for instead, linked to its data. */
export interface Credit {
  text: string;
  url: string;
  /** Its data's licence, where its terms ask for it to be named. */
  licence?: 'CC BY 4.0' | 'LDA MITRAMS';
  /** The day it last updated its timetable (YYYY-MM-DD), where its terms ask the map to show it: its feed's start date, or where its feed has none, the day the build read it, or its copy was kept, or NAP's date for its file. */
  updated?: string;
}

/** How the engine reads a Network's live data. */
export interface LiveTraits {
  /**
   * The Delay a Train carries where its position measures none: its operator's (`operator`); its last
   * GPS Delay, as Renfe's own figure is often minutes off, where GPS unchanged since its report before
   * counts as no position (`gps`, #33); or its operator's, but shown nowhere (`none`), as TMB runs the
   * Metro by headway (#103), and Euskotren's live times are its timetable's (#825).
   */
  delay: 'operator' | 'gps' | 'none';
  /**
   * A Train reported near a Station stands there (`standing`), or may still be coming in or have left
   * (`pinned`), as Renfe pins Trains coming into a Station too, and TRAM names the stop a Train is at or
   * has just left (#42).
   */
  near: 'standing' | 'pinned';
  /**
   * It names Trips long after they ended, as Geotren does Montserrat's rack Trains (#232): a report
   * whose Trip ended more than the engine's ENDED before it is dropped, as one that matches no Trip is,
   * unless it puts the Train more than the engine's MARGIN further along the Trip than the Trip's report
   * before it did, as a Train running late (#487).
   */
  lingers?: true;
  /**
   * The Lines it names none of the Trips of, by their names, as Geotren names none of FV's, the
   * Vallvidrera funicular's (#489): their Trains have no live data, and aren't left out of it, as the
   * Metro's L9's aren't, which TMB publishes no predictions for.
   */
  unnamed?: string[];
  /**
   * Its positions come with no time of their own, as Renfe's long-distance ones, which the feed's
   * header time stands for, and a kilometre is 12 seconds at 300 km/h: a Train is drawn off where they
   * have it by up to this many seconds at its Line's top speed before it jumps there rather than
   * eases, where that's more than a kilometre (#260). A Train a minute off jumps whatever this says
   * (JUMP_TIME), so 60 or more is that time rule alone.
   */
  snap?: number;
  /**
   * It names each Train by its Train number alone, as Renfe's long-distance live data does (#261): a
   * report by number is its feed's for this Network's Trips, which keeps its live data available
   * (#124), where of another Network's Trip, as of an R15 of Rodalies', it says nothing of that one's feed.
   */
  numbers?: true;
}

/** How a Network's Trains run between Stations, in metres and seconds. */
export interface SpeedProfile {
  acceleration: number;
  braking: number;
  topSpeed: number;
  /** How long a Train stands at a Station its timetable gives it no time at. */
  dwell: number;
}

export interface Line {
  id: string;
  network: string;
  name: string;
  colour: string;
  shapes: string[];
  /** What it runs as, which its Trains' pills are outlined by. */
  kind: Kind;
  /**
   * How its Trains run where that isn't as its Network's do, as AVE's are quicker than Alvia's: only what differs (#260), profiled().
   * The engine, jumps(), placeTrips()'s speed check and the page's quarterPixel() go by it (#262).
   */
  profile?: LineProfile;
}

/** What of a Network's SpeedProfile a Line can have its own: not `dwell`, which the manifest goes by for the Network (manifestDay()). */
export type LineProfile = Partial<Omit<SpeedProfile, 'dwell'>>;

/** A Network as one of its Lines runs on it: the Line's own profile over the Network's, where the Line has one (#260). */
export function profiled(network: Network | undefined, line: Pick<Line, 'profile'>): Network | undefined {
  return network && line.profile ? { ...network, profile: { ...network.profile, ...line.profile } } : network;
}

/** A Line's kind of service (CONTEXT.md). */
export type Kind = 'commuter' | 'regional' | 'long-distance' | 'metro' | 'tram' | 'rack' | 'funicular';

/**
 * Part of one of a Line's shapes, from one distance along it to another in metres, drawn `side`
 * line widths to the right of its track, or to the left where negative.
 */
export interface Stroke {
  line: string;
  shape: string;
  from: number;
  to: number;
  side: number;
  /**
   * Only in this zoom band (BANDS): a curve across a node, which is made for each (#163), or below
   * GRAPH_BAND, a stroke on the band's own line graph (ADR-0007).
   */
  band?: number;
  /** A curve's side at its end, which it's eased to from `side` at its start: it's drawn in pieces(). */
  ease?: number;
  /**
   * In each zoom band it's drawn in, from its first (`band`, or else GRAPH_BAND), how many metres less
   * of its shape it's drawn along at its start and at its end, where a curve takes over (#163): cutIn().
   */
  cut?: [start: number, end: number][];
  /** Zoomed right in, on its own track (`rails`): where another Line runs on that track too (#139). */
  shared?: true;
  /**
   * In a tunnel, this many of OpenStreetMap's layers below the ground: the map draws it below the
   * Lines on the street and those less deep, and where one covers it, shows it through (#178).
   */
  under?: number;
  /**
   * Of an `under` stroke, in each zoom band from GRAPH_BAND it's drawn in (#463), from where to where
   * along its shape a Line above it lies within a line width of it, alongside, as the band draws
   * them: the map draws those parts narrower and fainter (#417, picked on #309). A line width is a
   * band's own, so a part is marked for the bands it's covered in. Metres, whole.
   */
  covered?: [band: number, from: number, to: number][];
  /** Along a Stretch with more than CROWD places side by side (#283), closer together than a line width, so that each covers some of the next. */
  crowded?: true;
  /**
   * One of a curve's pieces (pieces()), which the map draws with butt ends rather than round ones: while a band fades
   * out, from zoom 14.5 to 15.5, round ends overlapping at part opacity showed a bead at every joint (#620).
   */
  curve?: true;
  /**
   * A curve's: the centreline it leaves, those of the Stretches its node absorbed, and the one it comes
   * onto, and from how far along each to how far, the way it goes, the Line's strokes there are cut
   * back, or not drawn, to make room for it (#176, ADR-0007).
   */
  across?: [shape: string, start: number, end: number][];
}

/**
 * Where a Line's Trains go zoomed out along part of one of its shapes, from `from` to `to` metres along
 * it: on its stroke there, `side` line widths right of `on`, the centreline of the Stretch it's drawn
 * along, or its own shape where it's drawn on that, from `at[0]` to `at[1]` metres along it (#176).
 */
export interface Slot {
  line: string;
  shape: string;
  from: number;
  to: number;
  side: number;
  on: string;
  at: [from: number, to: number];
  /** Only in this zoom band, below GRAPH_BAND: on the band's own line graph (ADR-0007). */
  band?: number;
}

/** Identified by whoever runs it: `adif:<code>` for Renfe's Stations, one Station however many Networks it serves. */
export interface Station {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** The station its operator groups it in with other Lines' Stations, which the map shows as one place: `tmb:P.6660327` at Passeig de Gràcia (ADR-0005). */
  place?: string;
  /**
   * The Networks whose Trains stop there, by their IDs, as Rodalies' and AVE y Larga Distancia's do at
   * Sants (#243). The build names them once it has every Network's Stations (stationsOf()); a track built before #243 names none.
   */
  networks?: string[];
  /**
   * The Lines whose timetable calls there on any day, by their IDs in order: those a board names,
   * whether or not a Trip of them calls that day, as where works stop them (#392, #529). A track built
   * before #392 names none.
   */
  lines?: string[];
}

/** Where the map shows one or more Stations as one, known by their place, or a lone Station's ID: one Station board lists them all. */
export interface Place {
  id: string;
  name: string;
  stations: string[];
  /** The Networks whose Trains stop at its Stations, by their IDs: its own, whose track its name goes beside (#143). */
  networks: string[];
  /** The Lines whose timetable calls at its Stations on any day, in order (Station's `lines`). */
  lines: string[];
  lon: number;
  lat: number;
}

/** Where the map shows the Stations: those grouped in one place as one, at the middle of theirs, and every other on its own. */
export function places(stations: Station[]): Place[] {
  const groups = new Map<string, Station[]>();
  for (const s of stations) {
    const group = groups.get(s.place ?? s.id);
    if (group) group.push(s);
    else groups.set(s.place ?? s.id, [s]);
  }
  return [...groups].map(([id, group]) => ({
    id,
    name: group[0]?.name ?? '',
    stations: group.map((s) => s.id),
    networks: [...new Set(group.flatMap((s) => s.networks ?? []))],
    lines: [...new Set(group.flatMap((s) => s.lines ?? []))].sort(),
    lon: group.reduce((sum, s) => sum + s.lon, 0) / group.length,
    lat: group.reduce((sum, s) => sum + s.lat, 0) / group.length,
  }));
}

/** A timetable entry: the Stations a Train calls at, in order, when, and where along its shape. */
export interface Trip {
  id: string;
  line: string;
  shape: string;
  /** Where it's headed. */
  headsign: string;
  /** Its Train number, where the operator publishes one. */
  number?: string;
  /**
   * The Train numbers another timetable runs it under, where it makes all of its calls at the same minutes,
   * as Renfe's long-distance one runs R15's 30501 as Reg.Exp. 17501 (#488): live data that names a Train by
   * its number names it by these too.
   */
  twins?: string[];
  /**
   * The IDs of the Trips of its Train that the build made one with it, where they met at a Station in the
   * same minute, as Rodalies' R4 Trip of 33527 meets its RL4 Trip at Rajadell (#467): the operator's live
   * data names the Train by the ID of the Trip it runs, so by each of these as it runs that part.
   */
  joined?: string[];
  calls: Call[];
}

/**
 * What names a Train from one day to the next, as its Trip's ID doesn't (docs/research/punctuality.md, section 5):
 * its Train number with its Line, as the same number stands for two Trips of a day on two Lines, or where its
 * operator publishes none, as FGC and TRAM don't, its slot, its Line, headsign and first departure. Its Line's ID
 * leads with its Network's. It holds for a timetable edition: a Train it retimes is another slot. The Delay history's
 * job keys a Network's Trains file by it (#808), and the page finds a Train there by it.
 */
export function trainKey({ line, number, headsign, calls }: Trip): string {
  return number ? `${line}/${number}` : `${line}/${headsign}/${calls[0]?.departure}`;
}

/**
 * A Trip's call at a Station: arrival and departure in seconds into the service day, and how far
 * along the Trip's shape the Station is, in metres. A Trip can run its shape either way, and turn back.
 */
export interface Call {
  station: string;
  arrival: number;
  departure: number;
  dist: number;
}

/**
 * A part of a Line closed on a service day, with buses in its Trains' place, as the timetable's
 * replacement buses have it (ADR-0012): between two of the Line's Stations on its track that none of
 * its Trains calls at both of that day (closuresOf()), from the first bus's departure from either of
 * them to the last bus's arrival at either, in seconds into the service day, as a Trip's calls are.
 */
export interface Closure {
  line: string;
  /** Its two Stations, in order of ID. */
  stations: [string, string];
  from: number;
  to: number;
  /** What it is: closed, with buses in its Trains' place. */
  kind: 'buses';
}

/** A stretch of track: its points in order, and the distance along it at each point, in metres. */
export interface Shape {
  id: string;
  coords: [lon: number, lat: number][];
  dist: number[];
  /**
   * A traced shape's level, where it isn't all on the ground: from each distance along it on, until
   * the next, as OpenStreetMap tags the track there, `tunnel <layer>`, `bridge <layer>` or
   * `layer <layer>`, or '' on the ground (#165). The map doesn't use it: it's there so that
   * measures.ts can draw a day's track again.
   */
  levels?: [from: number, level: string][];
}

/** A line's points from one distance along it to another, where `dist` gives the distance at each point. */
export function along(line: Pick<Shape, 'coords' | 'dist'>, from: number, to: number): Shape['coords'] {
  // Its points strictly between, found by halving, as `dist` only grows along it (#733): filtering every point for each
  // stroke took 179 ms over Catalonia's and long distance's Lines.
  const [start, end] = [firstBeyond(line.dist, from, true), firstBeyond(line.dist, to, false)];
  return [pointAt(line, from), ...line.coords.slice(start, Math.max(start, end)), pointAt(line, to)];
}

/** The index of the first of distances that only grow that's beyond `d`, where `strictly`, or else at or beyond it. */
function firstBeyond(dist: number[], d: number, strictly: boolean): number {
  let [i, end] = [0, dist.length];
  while (i < end) {
    const mid = (i + end) >> 1;
    const at = dist[mid] ?? 0;
    if (at < d || (strictly && at === d)) i = mid + 1;
    else end = mid;
  }
  return i;
}

/** The point a distance along a line, where `dist` gives the distance at each of its points. */
export function pointAt({ coords, dist }: Pick<Shape, 'coords' | 'dist'>, d: number): [lon: number, lat: number] {
  // The first point at or beyond d, found by halving.
  const i = firstBeyond(dist, d, false);
  const [a, b] = [coords[i - 1], coords[i]];
  if (!b) return coords.at(-1) ?? [NaN, NaN]; // at or beyond the end, give or take rounding
  if (!a) return b;
  const [start = 0, stop = 0] = [dist[i - 1], dist[i]];
  const t = stop > start ? (d - start) / (stop - start) : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** The point a distance along a line, moved so many metres to its right, or its left where negative. */
export function beside(line: Pick<Shape, 'coords' | 'dist'>, d: number, metres: number): [lon: number, lat: number] {
  const [lon, lat] = pointAt(line, d);
  if (!metres) return [lon, lat];
  // Which way the line runs, over the metre either side of d.
  const end = line.dist.at(-1) ?? 0;
  const [dx, dy] = direction(line, Math.max(0, d - 1), Math.min(end, d + 1));
  const length = Math.hypot(dx, dy) || 1;
  const off = metres / DEGREE / length;
  return [lon + (dy * off) / Math.cos((lat * Math.PI) / 180), lat - dx * off];
}

/** Which way a line runs from one distance along it to another, flat around the first: how far east and north the second point is from it, in degrees of latitude. */
export function direction(line: Pick<Shape, 'coords' | 'dist'>, from: number, to: number): [east: number, north: number] {
  const [a, b] = [pointAt(line, from), pointAt(line, to)];
  return [(b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]];
}

export type Point = [lon: number, lat: number];

/** How the IDs of the stretches' centrelines start, among the track's shapes. */
export const STRETCH = 'stretch:';
/** How the IDs of the links start: the curves that join a Line's stroke on one Stretch to its next, one for each zoom band. */
export const LINK = `${STRETCH}link`;

/**
 * The zoom bands the curves across the line graph's nodes are made for, by the zoom each is made at:
 * each shows from halfway between its zoom and the one before to halfway to the next (#163), a band
 * for each whole zoom (ADR-0007).
 */
export const BANDS = [7, 8, 9, 10, 11, 12, 13, 14];

/**
 * The first band drawn on the one line graph every band from zoom 10 up shares, in one order. Each
 * band below draws a graph of its own, where tracks about a line width apart are one Stretch (ADR-0007).
 */
export const GRAPH_BAND = BANDS.indexOf(10);

/** Whether a stroke, or a slot, is drawn in a zoom band: in its own band, or without one, in each from GRAPH_BAND on. */
export function drawnIn({ band: own }: { band?: number }, band: number): boolean {
  return own === undefined ? band >= GRAPH_BAND : own === band;
}

/** How many metres less of its shape a stroke is drawn along in a zoom band, at its start and at its end (Stroke's `cut`). */
export function cutIn(s: Pick<Stroke, 'band' | 'cut'>, band: number): [start: number, end: number] {
  return s.cut?.[band - (s.band ?? GRAPH_BAND)] ?? [0, 0];
}

/** How long a curve across a node is, for each metre a Line moves over on it, half from each stroke it joins (#163). */
export const LENGTH = 4;

/** The zoom a band starts at, and the zoom the next starts at. */
export function bandZooms(band: number): [from: number, to: number] {
  const [zoom = 0, before, next] = [BANDS[band], BANDS[band - 1], BANDS[band + 1]];
  return [before === undefined ? 0 : (before + zoom) / 2, next === undefined ? Infinity : (zoom + next) / 2];
}

/**
 * What a centreline's ID is followed by, and then its band's index, where it's smoothed for the band
 * (#164). The smoothed one's `dist` is the centreline's, not its own, so strokes go as far along it.
 */
export const SMOOTH = '@';

/** A centreline's ID, smoothed for a zoom band. */
export function smoothId(id: string, band: number): string {
  return `${id}${SMOOTH}${band}`;
}

/** The shape a stroke goes along in a zoom band: its centreline smoothed for the band, where it is. */
export function inBand(shapes: Map<string, Shape>, id: string, band: number): Shape | undefined {
  return shapes.get(smoothId(id, band)) ?? shapes.get(id);
}

/** The zoom band a zoom is in. */
export function bandAt(zoom: number): number {
  return BANDS.findIndex((_, band) => zoom < bandZooms(band)[1]);
}

/**
 * Where a Line is drawn on a curve across a node in a zoom band instead of along a centreline (`on`),
 * from `at[0]` to `at[1]` metres along it: on the curve's stroke (`link`), from `along[0]` to
 * `along[1]` metres along it, on its way to or from the centreline `other` (#176).
 */
export interface Zone {
  on: string;
  at: [from: number, to: number];
  link: Stroke;
  along: [from: number, to: number];
  /** The centrelines at the curve's other ends. */
  others: string[];
}

/** Where each Line is drawn on its curves, by `<line> <band>`: each stretch of centreline a curve takes over, and the part of the curve that stands for it, in proportion. */
export function zones(strokes: Stroke[]): Map<string, Zone[]> {
  const found = new Map<string, Zone[]>();
  for (const link of strokes) {
    if (!link.across || link.band === undefined) continue;
    const parts = link.across;
    const total = parts.reduce((sum, [, a, b]) => sum + Math.abs(b - a), 0) || 1;
    const key = `${link.line} ${link.band}`;
    const list = found.get(key) ?? [];
    let gone = 0;
    for (const [i, [on, a, b]] of parts.entries()) {
      const start = gone;
      gone += (link.to * Math.abs(b - a)) / total;
      const others = [parts[0]?.[0] ?? '', parts.at(-1)?.[0] ?? ''].filter((_, k) => (k ? i !== parts.length - 1 : i !== 0));
      list.push({ on, at: [a, b], link, along: [start, gone], others });
    }
    found.set(key, list);
  }
  return found;
}

/** How near, in metres along its shape, a Train's Line goes onto a centreline for it to be on its way there, across a node. */
export const NEXT = 500;

/**
 * Where a Train `dist` metres along its shape is drawn at a zoom, from its Line's slots along that
 * shape drawn in the zoom's band: on the Line's stroke, along the centreline the stroke follows in the zoom's band, at its
 * side, or across a node, on its curve (`zones()`), and half a line width to the side its Network's
 * Trains keep to, 1 right and -1 left, so that Trains going opposite ways show apart (#176). Or
 * nowhere, where the Line has no slot there.
 */
export function onStroke(slots: Slot[] | undefined, shapes: Map<string, Shape>, dist: number, zoom: number, keep: number, curves = new Map<string, Zone[]>()): Point | undefined {
  const band = bandAt(zoom);
  const slot = slots?.find((s) => s.from <= dist && dist <= s.to && drawnIn(s, band));
  const line = slot && inBand(shapes, slot.on, band);
  if (!slot || !line) return undefined;
  const { at, way } = slotAt(slot, dist);
  const width = atZoom(APART, zoom) * pixelMetres(zoom, pointAt(line, at)[1]);
  // On a curve, where the Line is: of those at a fork, the one to or from where the Train goes next or came from.
  const here = (curves.get(`${slot.line} ${band}`) ?? []).filter((z) => z.on === slot.on && Math.min(...z.at) <= at && at <= Math.max(...z.at) && z.at[0] !== z.at[1]);
  const goes = (other: string) => slots?.some((s) => s.on === other && s.from - NEXT <= dist && dist <= s.to + NEXT);
  const zone = here.find((z) => z.others.every(goes)) ?? here.find((z) => z.others.some(goes)) ?? here[0];
  const curve = zone && shapes.get(zone.link.shape);
  if (zone && curve) {
    const [[a0, a1], [x0, x1]] = [zone.at, zone.along];
    // No further than the curve goes: at its very end this can work out a hair past it, in floating point, and so past its last piece (#395).
    const x = Math.min(x0 + ((x1 - x0) * (at - a0)) / (a1 - a0), zone.link.to);
    const side = pieces(zone.link).find((p) => p.from <= x && x <= p.to)?.side ?? zone.link.side;
    // The Train goes along the curve the way it goes along the centreline, or back.
    return beside(curve, x, (side + 0.5 * keep * way * Math.sign((x1 - x0) * (a1 - a0) || 1)) * width);
  }
  // The Train runs its shape forwards: its right is the centreline's where that runs the same way.
  return beside(line, at, (slot.side + 0.5 * keep * way) * width);
}

/** How far along its line a slot puts a distance along its shape, and which way that line runs against the shape, 1 the same way and -1 back. */
export function slotAt({ from, to, at: [start, stop] }: Slot, dist: number): { at: number; way: number } {
  return { at: start + ((stop - start) * (dist - from)) / (to - from || 1), way: stop < start ? -1 : 1 };
}

/** How many line widths a curve moves over from one of its pieces to the next, at most. */
const PIECE = 1 / 8;

/**
 * A stroke as the map draws it: `line-offset` is constant along a feature, so a curve that eases from
 * one side to another goes in pieces, a PIECE of a line width over from each to the next, eased in
 * and out along it, each marked as a curve's (#620).
 */
export function pieces(stroke: Stroke): Stroke[] {
  const { ease, ...rest } = stroke;
  if (ease === undefined) return [stroke];
  const [start, stop, n] = [stroke.side, ease, Math.ceil(Math.abs(ease - stroke.side) / PIECE) + 1];
  const length = stroke.to - stroke.from;
  const cut = (k: number) => (k <= 0 ? 0 : k >= n ? length : (length * Math.acos(1 - (2 * (k - 0.5)) / (n - 1))) / Math.PI);
  return Array.from({ length: n }, (_, k) => ({ ...rest, from: stroke.from + cut(k), to: stroke.from + cut(k + 1), side: n > 1 ? start + ((stop - start) * k) / (n - 1) : start, curve: true }));
}

/**
 * A stroke as drawn in a zoom band, in its pieces, each cut where it's `covered` there (#417): the
 * parts a Line above lies within a line width of, which the map draws narrower and fainter, keep
 * their `covered` as that one run; the rest have none.
 */
export function coveredIn(stroke: Stroke, band: number): Stroke[] {
  const { covered, ...rest } = stroke;
  const runs = (covered ?? []).filter(([b]) => b === band).toSorted((a, b) => a[1] - b[1]);
  return pieces(rest).flatMap((p) => {
    const parts: Stroke[] = [];
    let at = p.from;
    for (const [, from, to] of runs) {
      const [a, b] = [Math.max(from, p.from, at), Math.min(to, p.to)];
      if (b <= a) continue;
      if (a > at) parts.push({ ...p, from: at, to: a });
      parts.push({ ...p, from: a, to: b, covered: [[band, a, b]] });
      at = b;
    }
    return at < p.to ? [...parts, { ...p, from: at, to: p.to }] : parts;
  });
}

/** How many metres on the ground a pixel is at a zoom, at a latitude. */
export function pixelMetres(zoom: number, lat: number): number {
  return (2 * Math.PI * EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** A Line's width, in pixels at each zoom. */
export const WIDTH: [zoom: number, px: number][] = [[7, 1.5], [14, 4]];
/**
 * How far apart Lines that share track are drawn, in pixels at each zoom: a line width apart zoomed
 * out, as on a transit map, and back on the rails zoomed right in, where people follow a Train.
 */
export const APART: [zoom: number, px: number][] = [...WIDTH, [15, 0]];

/** The value at a zoom of these, going smoothly from one zoom's to the next's, as the map's byZoom() does. */
export function atZoom(stops: [zoom: number, px: number][], zoom: number): number {
  const i = stops.findIndex(([z]) => z > zoom);
  if (i < 0) return stops.at(-1)?.[1] ?? 0;
  const [[z0, v0] = [zoom, 0], [z1, v1] = [zoom, 0]] = [stops[Math.max(0, i - 1)], stops[i]];
  return z1 > z0 ? v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0) : v1;
}

/** The Earth's mean radius, and the length of a degree of latitude, in metres. */
export const EARTH = 6_371_008.8;
export const DEGREE = (EARTH * Math.PI) / 180;

/** Where the segment from a to b comes closest to p: a fraction t along it, and how far away, in metres flat around p, where a degree of longitude is kx metres. */
export function closestOnSegment(a: Point, b: Point, p: Point, kx: number): [t: number, metres: number] {
  const [ax, ay] = [(a[0] - p[0]) * kx, (a[1] - p[1]) * DEGREE];
  const [dx, dy] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * DEGREE];
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return [t, Math.hypot(ax + t * dx, ay + t * dy)];
}

/** The date so many days after one (YYYY-MM-DD), or before it where negative. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

/** The date in Spain, as YYYY-MM-DD. */
export function madridDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(at);
}

/**
 * How long before a service day's first Train comes onto the map, and after its last leaves it, the map keeps
 * the day's bundle, in ms, as it hands them to daysNeeded(): the scripts that replay what the map had, as
 * src/record.ts and the Delay history's job do (#807), go by them too.
 */
export const [SOON, LATE] = [60 * 60_000, 60 * 60_000];

/**
 * The manifest's days the map needs at a moment (ms since 1970): each day whose Trains are on the map or
 * come onto it within `early`, or went off it less than `late` ago, as yesterday's last do after midnight;
 * today, whatever the time, once it's within `early` of its first Train, and until then, as after midnight,
 * the day before, which stands for it (#659); and the day after it once a Station board has had no
 * departures left on `emptyBoard`, the date of the day that stands for today (#596). Where the manifest is
 * out of date, its last day stands for today. A day with no Train has no first: it's today from its date on.
 */
export function daysNeeded<D extends Pick<ManifestDay, 'date' | 'from' | 'to'>>(days: D[], at: number, { early, late, emptyBoard }: { early: number; late: number; emptyBoard?: string }): { today: D; days: D[] } | undefined {
  const dated = days.find((d) => d.date === madridDate(new Date(at)));
  const before = dated && days.find((d) => d.date === addDays(dated.date, -1));
  const begun = (d: D) => !Number.isFinite(d.from) || d.from - early <= at;
  const today = (dated && (begun(dated) || !before) ? dated : before) ?? days.at(-1);
  if (!today) return undefined;
  const next = days[days.indexOf(today) + 1];
  return { today, days: days.filter((d) => d === today || (d === next && emptyBoard === today.date) || (d.from - early <= at && at <= d.to + late)) };
}
