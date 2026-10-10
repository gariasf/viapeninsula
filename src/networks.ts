// Each Network, as plain data: how its Trains run and are drawn, which of OpenStreetMap's rails they
// run on, where its operator's timetables are and how to read them, who to credit, and how its live
// data reads. The daily build reads its Networks from here alone, and the map what it needs of them
// from the bundle (docs/research/network-config.md). The fetcher reads its live sources from here too.

import type { Credit, Kind, LineProfile, Network } from './bundle.ts';

/** One Network: what the daily build needs to know of it, and through the bundle, the map. */
export interface NetworkConfig extends Omit<Network, 'credit'> {
  /** Its source's credit: the day it was last updated comes from its timetable (Timetable's `updated`). */
  credit: Omit<Credit, 'updated'>;
  /**
   * The region it's built and loaded in, with every other Network that names it: Networks whose Lines
   * share Stretches, so that they're drawn side by side, as Catalonia's four (ADR-0014). Its own ID
   * where it names none (regionOf()). Long distance's Networks, once they're on the map, are a region
   * of their own too, which every view loads (#259).
   */
  region?: string;
  rails: Rails;
  /** Its operator's timetables, each a GTFS feed: TRAM has two. */
  timetables: [Timetable, ...Timetable[]];
  /** Its Lines: what they run as, and where its timetables name or colour them otherwise than the public knows them. */
  lines: {
    /** What its Lines run as, but for those `kinds` names. */
    kind: Kind;
    /** What each of its Lines that doesn't run as `kind` runs as, by the Line's name. */
    kinds?: Record<string, Kind>;
    /** The Line each route runs on, by the route's name, where a timetable names some of a Line's Trips apart (#29), or a Line otherwise than the public does, as Renfe's long-distance one writes ALVIA (#258). */
    names?: Record<string, string>;
    /** Colours for the Lines a timetable gets wrong, by the Line's name, written as `colour` is. */
    colours?: Record<string, string>;
    /** The colour of every other Line, where its timetables give none of their own, as Renfe's long-distance one gives every route F2F5F5. */
    colour?: string;
    /** How the Trains of each of its Lines that don't run as its profile has them run, by the Line's name: only what differs, as AVE's top speed is above Alvia's (#260). */
    profiles?: Record<string, LineProfile>;
    /** The rails each of its Lines runs on, by the Line's name, where its timetables have no shapes to trace (#259). */
    gauges?: Record<string, Gauges>;
  };
  /**
   * The Stations its timetables put where their Trains don't stop, by ID, as Renfe's put Asturias' El
   * Entrego at a FEVE station 0.4 km from Adif's (#367), with where they do stop and the source that
   * says so: the URL of an OpenStreetMap node, or of the operator's own map. The daily build lists those
   * it applies. A Station two Networks list is one Station, as the first of them has it (stationsOf()),
   * so it goes in each Network that lists it. A timetable's `points` (#259) put a Station elsewhere the
   * same way, by stop_id, with no source and no line in the log, and these win where both name one.
   */
  stations?: Record<string, { lon: number; lat: number; source: string }>;
}

/**
 * The ways a Network runs on in OpenStreetMap: those whose `railway` is one of these and, where they're
 * given, whose gauge is one of these (a way with three rails has two, as `1435;1668`), whose operator is
 * one of these, and whose operator is none of these.
 */
export interface Rails {
  railway: string[];
  gauge?: string[];
  operator?: string[];
  notOperator?: string[];
}

/**
 * The rails a Line runs on where its timetable has no shapes, as Renfe's long-distance one hasn't (#259):
 * the ways whose `railway` is one of these, and whose gauge is one of `gauges`, or that have no gauge tag,
 * as a way with three rails has two gauges, as `1435;1668`. On two gauges, its Trains change from one to
 * the other only at a railway=gauge_conversion node. A run of its Trips with a stretch with no path on
 * `gauges` is traced on `orElse`'s too, all the way, changing to them only at such a node.
 */
export interface Gauges {
  railway: string[];
  gauges: string[];
  orElse?: string[];
}

/** One of a Network's timetables: where its GTFS feed is, and how to read it. */
export interface Timetable {
  url: string;
  /** The secrets its URL's query needs, by parameter: the environment variable holding each. */
  query?: Record<string, string>;
  /** What its Trips' and shapes' IDs start with, as in `rodalies:<trip_id>`. */
  prefix: string;
  /** What its Stations' IDs start with: whoever runs them, as in `adif:<stop_id>` for Renfe's. */
  operator: string;
  /** A stop's Station is its parent station, where the feed makes each platform a stop of its own. */
  parents?: true;
  /**
   * Which of its rail routes are this Network's, where not all are: those whose route_id starts so, and
   * whose route_short_name is one of these. And the rails those whose route_id ends so run on, whatever
   * their Line runs on (`lines.gauges`), as the ex-FEVE regionals', which are Regional (#259).
   */
  routes?: { idPrefix?: string; names?: string[]; gauges?: Record<string, Gauges> };
  /**
   * A Trip's Train number, where the operator publishes one: what this pattern first matches in its
   * trip_id after the service_id, or in its trip_short_name where `shortNames`.
   */
  number?: string;
  /** Its Trips' Train numbers are in their trip_short_names, as Renfe's long-distance timetable has them, not in their trip_ids. */
  shortNames?: true;
  /** It lists a Train as several Trips, one for each part of its run it sells, which are made one (joinParts()). */
  parts?: true;
  /** It has no shapes, as Renfe's long-distance timetable hasn't: any other that loses its shapes.txt is read from its copy. */
  shapeless?: true;
  /** Its terms ask the map to show the day it was last updated, in its credit: its feed's start date. */
  updated?: true;
  /** Where some of its Stations are, by stop_id, where it has them too far from their rails to trace (#259). */
  points?: Record<string, [lon: number, lat: number]>;
}

/** OpenStreetMap's names for FGC, as the operator of its rails. */
const FGC_OPERATOR = ['FGC', 'Ferrocarrils de la Generalitat de Catalunya'];

/** Renfe's Cercanías GTFS, with a núcleo for each of its Networks. Its Stations are Adif's. */
const RENFE_CERCANIAS = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';

/**
 * Renfe's open data is CC BY 4.0, which asks for its source to be named, and the licence. Every
 * Network of Renfe's credits it in these words, so the map credits Renfe once (ADR-0010).
 */
const RENFE = { text: 'Renfe', url: 'https://data.renfe.com/', licence: 'CC BY 4.0' } as const;

/** TMB's app ID and key, which its APIs take in the query, by the secrets holding them. */
const TMB_APP = { app_id: 'TMB_APP_ID', app_key: 'TMB_APP_KEY' };

export const RODALIES: NetworkConfig = {
  id: 'rodalies',
  region: 'catalonia',
  name: 'Rodalies de Catalunya',
  // Every stretch between Stations in Renfe's timetable of 24 September 2026 fits 1 m/s² (138 don't
  // fit 0.7), and the fastest Units on the regional lines run at 160 km/h. Small Stations get half a minute.
  profile: { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 },
  // Catalonia's lines came from MZA, which ran on the right, but for Manresa–Barcelona, a Norte line
  // run on the left until December 1971 (García Álvarez, "La vía doble en España y el sentido de
  // circulación de los trenes por ella", FFE, 2010, table 3). OpenStreetMap agrees: its
  // railway:preferred_direction tags have Trains on the right on 94% of the 268 km of Adif's
  // Iberian-gauge double track they cover (seen 2026-09-26).
  runningSide: 'right',
  // Near Rodalies' orange, as the maintainer chose it by its logo: no source publishes one (#190).
  colour: '#F26E21',
  // Main-line Trains are pills before metros' and trams', as railisland shows them (#90).
  pillZoom: 10,
  // Iberian-gauge rails, which keeps it off the standard-gauge high-speed line.
  rails: { railway: ['rail'], gauge: ['1668'] },
  timetables: [
    {
      // Rodalies, including its regional lines, is núcleo 51.
      url: RENFE_CERCANIAS,
      prefix: 'rodalies',
      operator: 'adif',
      routes: { idPrefix: '51' },
      // A trip_id is the service_id, then the Train number's five digits, then the Line.
      number: '^\\d{5}',
    },
  ],
  credit: RENFE,
  // Renfe's own Delay moves in whole minutes and is often minutes off, so a Train carries on from the
  // last Delay its GPS gave it (#33). And Renfe pins Trains coming into a Station to it too, and late.
  live: { delay: 'gps', near: 'pinned' },
  lines: {
    // R1–R8, RG1, RT1, RT2, RL3 and RL4 are commuter Lines, and R11–R17 regional ones.
    kind: 'commuter',
    kinds: { R11: 'regional', R12: 'regional', R13: 'regional', R14: 'regional', R15: 'regional', R16: 'regional', R17: 'regional' },
    // Renfe's feed gives two Lines the wrong colour on the routes their Trips run on (seen 2026-09-24).
    // R7's carry R2's green, though Renfe's other R7 routes say B57CBB. R13's carry R2S's green, but R13
    // is pink (Wikidata Q6018166).
    colours: { R7: '#B57CBB', R13: '#E52E87' },
  },
};

export const FGC: NetworkConfig = {
  id: 'fgc',
  region: 'catalonia',
  name: 'Ferrocarrils de la Generalitat de Catalunya',
  // FGC's timetable is in quarter minutes, so a tenth of the stretches it runs on 1 October 2026 fit
  // no train at 1 m/s², such as Baixador de Vallvidrera to Les Planes, 933 m in 30 s: those Trains
  // accelerate and brake harder. Its fastest Units, on the line to La Pobla, run at 120 km/h. Most of
  // its Stations get half a minute.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  // OpenStreetMap has FGC's Trains on the right on 99% of the 93 km of its double track it tags
  // (seen 2026-09-26), and so does Geotren: of 61 FGC positions within a metre of one track of a
  // double track, 56 were on the right one (25 September).
  runningSide: 'right',
  // Near FGC's green, as the maintainer chose it by its logo: no source publishes one (#190).
  colour: '#8BB83E',
  pillZoom: 10,
  // Rails of its own, of three gauges.
  rails: { railway: ['rail', 'narrow_gauge', 'subway', 'funicular'], operator: FGC_OPERATOR },
  // FGC's feed makes each platform a stop of its own; its Stations go by FGC's codes.
  timetables: [{ url: 'https://www.fgc.cat/google/google_transit.zip', prefix: 'fgc', operator: 'fgc', parents: true }],
  // FGC's open data is CC BY 4.0.
  credit: { text: 'FGC', url: 'https://dadesobertes.fgc.cat/', licence: 'CC BY 4.0' },
  // Geotren has a Train standing at a Station where it puts it near one. And it names Trips long after
  // they ended: at 13:46 on 4 October 2026, 12 of its 14 reports for the rack line named Trips that had
  // ended 38 minutes to 5 hours before (#232).
  live: { delay: 'operator', near: 'standing', lingers: true },
  lines: {
    // Its S and L Lines are commuter ones, and R5, R50, R6, R60, RL1 and RL2 regional. MM is
    // Montserrat's rack railway, and FV the Vallvidrera funicular.
    kind: 'commuter',
    kinds: { R5: 'regional', R50: 'regional', R6: 'regional', R60: 'regional', RL1: 'regional', RL2: 'regional', MM: 'rack', FV: 'funicular' },
    // R53 and R63 are FGC's names for R5's and R6's late Trips, which call at every Station: Martorell
    // Vila and Colònia Güell too, and Santa Coloma de Cervelló on R53. The public knows them as R5 and
    // R6: their route URLs point to R5's and R6's pages (seen 2026-09-25).
    names: { R53: 'R5', R63: 'R6' },
  },
};

export const TRAM: NetworkConfig = {
  id: 'tram',
  region: 'catalonia',
  name: 'TRAM',
  // Every stretch TRAM runs on 1 October 2026 fits 1.2 m/s² (312 don't fit 1), and its Units, Citadis
  // trams, run at 70 km/h. It gives every Station 10 seconds.
  profile: { acceleration: 1.2, braking: 1.2, topSpeed: 70 / 3.6, dwell: 10 },
  // As the traffic beside it does: OpenStreetMap has TRAM's Trains on the right on 99% of the 32 km
  // of its double track it tags.
  runningSide: 'right',
  // Near TRAM's teal, as the maintainer chose it by its logo: no source publishes one (#190).
  colour: '#00A99D',
  // Metros' and trams' Trains are pills only from where they're far enough apart to read (#90).
  pillZoom: 12,
  rails: { railway: ['tram'] },
  // TRAM publishes a feed for each of its halves, Trambaix (T1–T3) and Trambesòs (T4–T6), and their
  // shapes' IDs clash. Each feed makes each platform a stop of its own.
  timetables: [
    { url: 'https://opendata.tram.cat/GTFS/zip/TBX.zip', prefix: 'tram:TBX', operator: 'tram', parents: true },
    { url: 'https://opendata.tram.cat/GTFS/zip/TBS.zip', prefix: 'tram:TBS', operator: 'tram', parents: true },
  ],
  // TRAM's terms ask for these words, and a link.
  credit: { text: 'Powered by TRAM Barcelona', url: 'https://www.tram.cat/' },
  // TRAM names the stop a Train is at or has just left, not one it stands at: its distance reads a
  // Station's for about 40 s as the Train reaches it, and then 0 until it reaches the next. Held at that
  // Station, a Train would stand there 40–80 s and then jump a whole stretch, so it isn't, even where
  // TRAM's number for the platform is mapped to its Station: TRAM's Delay has most such Trains on their
  // way (#42).
  live: { delay: 'operator', near: 'pinned' },
  lines: { kind: 'tram' },
};

export const METRO: NetworkConfig = {
  id: 'metro',
  region: 'catalonia',
  name: 'Metro de Barcelona',
  // Every stretch the Metro runs on 1 October 2026 fits 1.3 m/s² (689 don't fit 1.2), but for one L1
  // Trip's 894 m from Santa Coloma to Fondo in 30 s. Its Units run at 80 km/h. TMB gives each Station
  // about 20 seconds.
  profile: { acceleration: 1.3, braking: 1.3, topSpeed: 80 / 3.6, dwell: 20 },
  // OpenStreetMap has the Metro's Trains on the right on 96% of the 116 km of its double track it
  // tags. Most of the rest is L2 between Tetuan and Paral·lel, which runs on the left, and where
  // its tags say so, the trace follows them.
  runningSide: 'right',
  // Near the Metro's red, as the maintainer chose it by its logo: no source publishes one (#190).
  colour: '#E2001A',
  pillZoom: 12,
  // Underground, but for the Montjuïc funicular, on rails that aren't FGC's.
  rails: { railway: ['subway', 'funicular'], notOperator: FGC_OPERATOR },
  timetables: [
    {
      // TMB's feed, whose metro and funicular are the Metro's. Its Stations are TMB's stops, one for
      // each Line calling there: the stations TMB groups them in can hold Lines 270 m apart, as at
      // Passeig de Gràcia, too far from some of their rails for one place to stand for them all (ADR-0005).
      url: 'https://api.tmb.cat/v1/static/datasets/gtfs.zip',
      query: TMB_APP,
      prefix: 'metro',
      operator: 'tmb',
      // TMB's terms ask for it.
      updated: true,
    },
  ],
  credit: { text: 'TMB', url: 'https://www.tmb.cat/' },
  // TMB runs the Metro by headway, and its timetable names no Blocks, so a Metro Train's Delay is only
  // against whichever Trip its Block runs, which can be minutes off its own time (#103).
  live: { delay: 'none', near: 'standing' },
  // FM is the Montjuïc funicular.
  lines: { kind: 'metro', kinds: { FM: 'funicular' } },
};

export const CERCANIAS_MADRID: NetworkConfig = {
  id: 'cercanias-madrid',
  name: 'Cercanías Madrid',
  // Renfe's timetable for Madrid is in whole minutes, so 496 of the 18,853 stretches its Trains run on
  // 5 October 2026 fit no train at 1 m/s², such as Villalba to San Yago, 2.2 km in a minute: those
  // Trains accelerate and brake harder. Its fastest Units, the 450s, run at 140 km/h. Small Stations
  // get half a minute, as Rodalies' do.
  profile: { acceleration: 1, braking: 1, topSpeed: 140 / 3.6, dwell: 30 },
  // Madrid's lines run on the right, but for the old Norte line beyond Pinar de las Rozas, km 18.5
  // from Príncipe Pío, on to Villalba and El Escorial: from Príncipe Pío to there it changed to the
  // right in November 1988, and from there on it still runs on the left (García Álvarez, "La vía
  // doble en España y el sentido de circulación de los trenes por ella", FFE, 2010, table 3 and p. 24).
  // There the trace follows OpenStreetMap's railway:preferred_direction tags, where they say so.
  runningSide: 'right',
  // The red of Cercanías' logo, as Wikimedia Commons has it (the logo Wikidata gives for Cercanías Madrid, Q1054785).
  colour: '#EF2C30',
  pillZoom: 10,
  rails: { railway: ['rail'], gauge: ['1668'] },
  timetables: [
    {
      // Madrid is núcleo 10. Its C9, Cercedilla–Cotos, which runs on metre gauge, has no Trips by train
      // in núcleo 10 or 90, while buses run it during works (5 October 2026): once its Trains come back,
      // Madrid's rails need metre gauge too (ADR-0010).
      url: RENFE_CERCANIAS,
      prefix: 'cercanias-madrid',
      operator: 'adif',
      routes: { idPrefix: '10' },
      // A trip_id is the service_id, then the Train number's five digits, then the Line, as Rodalies' are.
      number: '^\\d{5}',
    },
  ],
  credit: RENFE,
  // As Rodalies': Renfe's own Delay for Madrid's Trains moves in whole minutes, and it pins Trains
  // coming into a Station too.
  live: { delay: 'gps', near: 'pinned' },
  // C1–C10 are commuter Lines.
  lines: { kind: 'commuter' },
};

/**
 * What every other Cercanías núcleo shares with Madrid: the red of Cercanías' logo, pills from zoom
 * 10, Renfe's credit, and Renfe's live data, which reads as Madrid's: on 30 fetches on the evening of
 * 7 October 2026, every Delay was whole minutes, and 75–100% of each núcleo's Trains coming into a
 * Station were pinned within 50 m of one.
 */
const CERCANIAS = { colour: CERCANIAS_MADRID.colour, pillZoom: 10, credit: RENFE, live: CERCANIAS_MADRID.live } as const;

/** Núcleo `code` of Renfe's Cercanías timetable, whose trip_ids read as Madrid's. */
function núcleo(code: string, prefix: string): Timetable {
  return { url: RENFE_CERCANIAS, prefix, operator: 'adif', routes: { idPrefix: code }, number: '^\\d{5}' };
}

// As Madrid's, these núcleos' Trains accelerate and brake at 1 m/s² and stand half a minute at
// small Stations. Each one's top speed covers the fastest stretch its Trips run on 7 October 2026,
// as the build measures it along their track, but for a stretch no train could run, whose Trips it
// leaves out: Asturias' C4 from Candás to Candás-Apeadero, which Renfe times at the same minute at
// both (#253). Their fastest Units run at 120 km/h, Civias on Adif's lines and 2700s on FEVE's
// metre-gauge ones. A núcleo runs on the left where all its double track keeps left: Adif's lines
// that García Álvarez lists as running on the left ("La vía doble en España y el sentido de
// circulación de los trenes por ella", FFE, 2010, table 4 and p. 25), and FEVE's, which keep left
// too. OpenStreetMap's railway:preferred_direction tags say which way Trains run on only 3.6 km of
// these núcleos' double track, in Santander (seen 7 October 2026).

export const CERCANIAS_ASTURIAS: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-asturias',
  name: 'Cercanías Asturias',
  // Its fastest stretch is one C3 Trip's Avilés to La Rocica, 2.4 km in a minute, 142 km/h: a top
  // speed under it would leave that Trip out.
  profile: { acceleration: 1, braking: 1, topSpeed: 150 / 3.6, dwell: 30 },
  // Adif's Pola de Lena–Gijón, which C1–C3 run on, and Villabona–Cancienes keep left, and so do FEVE's
  // lines. But OpenStreetMap gives six ways of the left-hand track between Villallana and Mieres no
  // gauge, so kept to the left, C1's trace north turns back to Pola de Lena from Villallana and comes
  // out 8.6% longer than the feed's shape, which fails the build: it keeps right until they have one (#253).
  runningSide: 'right',
  // Adif's Iberian gauge for C1–C3, and FEVE's metre gauge for C4–C8, which OpenStreetMap tags
  // narrow_gauge or rail (ADR-0010).
  rails: { railway: ['rail', 'narrow_gauge'], gauge: ['1668', '1000'] },
  // Asturias is núcleo 20.
  timetables: [núcleo('20', 'cercanias-asturias')],
  // C1–C8 and C5a are commuter Lines.
  lines: { kind: 'commuter' },
  // Renfe's timetable of 10 October 2026 puts three Stations on the track of a line beside the one
  // their Trains run on, so every Trip that calls there is left out as calling at a Station off its
  // track (#367): C2's El Entrego at FEVE's El Entrego-La Oscura (05433), 0.4 km from Adif's, where C2
  // ends, and C2's Sama beside FEVE's Langreo line, 0.8 km from Adif's, and C5's Tremañes-Langreo at
  // C4's Tremañes Carreño (05203), 0.4 km from its own station on the Langreo line.
  stations: {
    'adif:16011': { lon: -5.6451861, lat: 43.2871373, source: 'https://www.openstreetmap.org/node/12702395582' },
    'adif:16009': { lon: -5.6797817, lat: 43.2918595, source: 'https://www.openstreetmap.org/node/5315743121' },
    'adif:05403': { lon: -5.6906116, lat: 43.5272283, source: 'https://www.openstreetmap.org/node/30548853' },
  },
};

export const CERCANIAS_SEVILLA: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-sevilla',
  name: 'Cercanías Sevilla',
  // Its fastest stretch is Utrera to Las Cabezas de San Juan, 24 km in 13 minutes, 111 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'right',
  rails: { railway: ['rail'], gauge: ['1668'] },
  // Sevilla is núcleo 30.
  timetables: [núcleo('30', 'cercanias-sevilla')],
  // C1–C5 are commuter Lines.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_CADIZ: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-cadiz',
  name: 'Cercanías Cádiz',
  // Its fastest stretch is Las Aletas to Valdelagrana, 5.1 km in 3 minutes, 101 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'right',
  // The T1 is a tram-train: on Adif's line from Cádiz to Río Arillo, and on through San Fernando to
  // Chiclana on its own track, which OpenStreetMap tags tram in the streets and light_rail between,
  // all of Iberian gauge.
  rails: { railway: ['rail', 'tram', 'light_rail'], gauge: ['1668'] },
  // Cádiz is núcleo 31.
  timetables: [núcleo('31', 'cercanias-cadiz')],
  // C1 and C1a are commuter Lines, and the T1, which runs as a tram through San Fernando and Chiclana, a tram.
  lines: { kind: 'commuter', kinds: { T1: 'tram' } },
};

export const CERCANIAS_MALAGA: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-malaga',
  name: 'Cercanías Málaga',
  // Its fastest stretch is Cártama to Campanillas, 6.6 km in 4 minutes, 99 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'right',
  rails: { railway: ['rail'], gauge: ['1668'] },
  // Málaga is núcleo 32.
  timetables: [núcleo('32', 'cercanias-malaga')],
  // C1 and C2 are commuter Lines.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_VALENCIA: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-valencia',
  name: 'Cercanías Valencia',
  // Its fastest stretch is Torreblanca to Orpesa, 14.4 km in 8 minutes, 108 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'right',
  rails: { railway: ['rail'], gauge: ['1668'] },
  // Valencia is núcleo 40.
  timetables: [núcleo('40', 'cercanias-valencia')],
  // C1–C6 are commuter Lines.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_MURCIA_ALICANTE: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-murcia-alicante',
  name: 'Cercanías Murcia/Alicante',
  // Its fastest stretch is Elche/Elx-Parc to Sant Gabriel, 18.8 km in 14 minutes, 81 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'right',
  rails: { railway: ['rail'], gauge: ['1668'] },
  // Murcia/Alicante is núcleo 41.
  timetables: [núcleo('41', 'cercanias-murcia-alicante')],
  // C1–C3 are commuter Lines.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_CARTAGENA: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-cartagena',
  name: 'Cercanías Cartagena',
  // Its fastest stretch is La Esperanza to Alumbres, 2.2 km in 2 minutes, 65 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'left',
  // FEVE's metre gauge alone (ADR-0010).
  rails: { railway: ['rail', 'narrow_gauge'], gauge: ['1000'] },
  // Cartagena is núcleo 45.
  timetables: [núcleo('45', 'cercanias-cartagena')],
  // C1 is a commuter Line.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_FERROL: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-ferrol',
  name: 'Cercanías Ferrol',
  // Its fastest stretch is San Clodio to Ponte Mera, 2.7 km in 3 minutes, 54 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'left',
  // FEVE's metre gauge alone (ADR-0010).
  rails: { railway: ['rail', 'narrow_gauge'], gauge: ['1000'] },
  // Ferrol is núcleo 46.
  timetables: [núcleo('46', 'cercanias-ferrol')],
  // C1 is a commuter Line.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_LEON: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-leon',
  name: 'Cercanías León',
  // Its fastest stretch is Pedrún to Matueca, 2.2 km in 2 minutes, 66 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'left',
  // FEVE's metre gauge alone (ADR-0010).
  rails: { railway: ['rail', 'narrow_gauge'], gauge: ['1000'] },
  // León is núcleo 47.
  timetables: [núcleo('47', 'cercanias-leon')],
  // C1 is a commuter Line.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_BILBAO: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-bilbao',
  name: 'Cercanías Bilbao',
  // Its fastest stretch is Basurto Hospital to Zorrotza Zorrozgoiti, 2.5 km in 2 minutes, 76 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  // Adif's Orduña–Bilbao-Abando and Bilbao-Abando–Santurtzi, and Bilbao's links between them, keep
  // left, and so do FEVE's lines.
  runningSide: 'left',
  // Adif's Iberian gauge for C1–C3, and FEVE's metre gauge for C4 and C5 (ADR-0010), whose traces
  // keep off Euskotren's metre-gauge rails beside them (7 October 2026).
  rails: { railway: ['rail', 'narrow_gauge'], gauge: ['1668', '1000'] },
  // Bilbao is núcleo 60. Renfe files FEVE's train a day each way between Bilbao and León under C4,
  // so C4 is drawn on to León.
  timetables: [núcleo('60', 'cercanias-bilbao')],
  // C1–C5 are commuter Lines.
  lines: { kind: 'commuter' },
  // Renfe's timetable of 10 October 2026 puts Dosante Cidad at 43.00125, -3.74525, a round figure
  // 1.4 km from its halt on the La Robla line, so its two Bilbao–León Trips a day were left out (#367).
  stations: {
    'adif:05736': { lon: -3.7558646, lat: 43.0113013, source: 'https://www.openstreetmap.org/node/12495839165' },
  },
};

export const CERCANIAS_SAN_SEBASTIAN: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-san-sebastian',
  name: 'Cercanías San Sebastián',
  // Its fastest stretch is Billabona-Zizurkil to Andoain-Centro, 4.5 km in 3 minutes, 90 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  // C1 runs on Adif's Madrid–Hendaya, which keeps left from Pinar de las Rozas on to Irun.
  runningSide: 'left',
  rails: { railway: ['rail'], gauge: ['1668'] },
  // San Sebastián is núcleo 61.
  timetables: [núcleo('61', 'cercanias-san-sebastian')],
  // C1 is a commuter Line.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_SANTANDER: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-santander',
  name: 'Cercanías Santander',
  // Its fastest stretch is Guarnizo to Parbayón, 3.3 km in 2 minutes, 99 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  // C1 runs on Adif's Palencia–Santander, which keeps right, but C2 and C3 on FEVE's lines, which keep
  // left: there the trace follows OpenStreetMap's railway:preferred_direction tags, where they say so.
  runningSide: 'right',
  // Adif's Iberian gauge for C1, and FEVE's metre gauge for C2 and C3 (ADR-0010).
  rails: { railway: ['rail', 'narrow_gauge'], gauge: ['1668', '1000'] },
  // Santander is núcleo 62.
  timetables: [núcleo('62', 'cercanias-santander')],
  // C1–C3 are commuter Lines.
  lines: { kind: 'commuter' },
};

export const CERCANIAS_ZARAGOZA: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-zaragoza',
  name: 'Cercanías Zaragoza',
  // Its fastest stretch is Utebo to Zaragoza Delicias, 9.3 km in 7 minutes, 80 km/h.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
  runningSide: 'right',
  rails: { railway: ['rail'], gauge: ['1668'] },
  // Zaragoza is núcleo 70.
  timetables: [núcleo('70', 'cercanias-zaragoza')],
  // C1 is a commuter Line.
  lines: { kind: 'commuter' },
};

/** Every Network, in the order the bundle lists them. */
export const NETWORKS = [
  RODALIES,
  FGC,
  TRAM,
  METRO,
  CERCANIAS_MADRID,
  CERCANIAS_ASTURIAS,
  CERCANIAS_SEVILLA,
  CERCANIAS_CADIZ,
  CERCANIAS_MALAGA,
  CERCANIAS_VALENCIA,
  CERCANIAS_MURCIA_ALICANTE,
  CERCANIAS_CARTAGENA,
  CERCANIAS_FERROL,
  CERCANIAS_LEON,
  CERCANIAS_BILBAO,
  CERCANIAS_SAN_SEBASTIAN,
  CERCANIAS_SANTANDER,
  CERCANIAS_ZARAGOZA,
];

/** The region a Network is built and loaded in: the one its config names, or else a region of its own, its ID (ADR-0014). */
export function regionOf({ id, region }: Pick<NetworkConfig, 'id' | 'region'>): string {
  return region ?? id;
}

/** Networks by region, each region at the first of its Networks, so that the regions list their Networks as `networks` does where each region's are together. */
export function regionsOf<N extends Pick<NetworkConfig, 'id' | 'region'>>(networks: N[]): { id: string; networks: N[] }[] {
  const regions = new Map<string, N[]>();
  for (const n of networks) regions.set(regionOf(n), [...(regions.get(regionOf(n)) ?? []), n]);
  return [...regions].map(([id, own]) => ({ id, networks: own }));
}

/**
 * Renfe's timetable of AVE, long distance and Media Distancia, under CC BY 4.0 as its Cercanías one
 * is. It has no shapes (docs/research/high-speed.md). Its Stations are Adif's, as the Cercanías
 * file's are, but for those in France and Portugal, which go by their UIC codes.
 */
const RENFE_LONG_DISTANCE = 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip';

// Renfe's long-distance timetable makes two Networks, as Renfe's own maps divide it (ADR-0010): each
// takes the routes named as its Lines are. Their Lines are the names the timetable gives its Trips, as
// it names no others, but written as Renfe writes them in public, rather than in the feed's capitals,
// and their colours are their config's, as the feed gives every route F2F5F5. Their Trains are read and
// traced (#259), but not on the map until they're drawn (#262, #263), so each has only what reading them,
// tracing them and running their Trains needs: how they run (#260), with the rest to come with those. As
// the timetable has no shapes, each Line runs on the rails of its gauge (#259, docs/research/high-speed.md):
// standard gauge is 1435 mm, Iberian 1668 and metre 1000.

/**
 * How the engine reads Renfe's long-distance live data (#260), by what #260's triage found of it on 4
 * October 2026. A Train carries on from its last GPS Delay, as Rodalies' do: of 125 GPS fixes within
 * 400 m of a Station their Train calls at, Renfe's own figure was within a minute of the GPS's for 73,
 * and over two minutes off for 14, up to 7.5, and it moves in whole minutes. Positions freeze: 44% of
 * consecutive polls repeat one, and 177 holds of a minute or more ended in jumps of over a kilometre,
 * up to 73 km, so a position unchanged since the Train's report before counts as none. A `STOPPED_AT`
 * position isn't at its Station (6 of 177 were within 500 m of it), so no position holds a Train there.
 * And a position has no time of its own: the feed's header time stands for it, though the visor, which
 * has one, puts a position a median 9 s older than the file's, and 35 s at the 90th percentile. A
 * kilometre at 300 km/h is 12 s, so a Train jumps for being a minute off, as JUMP_TIME has it.
 */
const RENFE_LONG_DISTANCE_LIVE = { delay: 'gps', near: 'pinned', snap: 60 } as const;

/** AVE's, Avlo's and AVE Int's top speed, on the high-speed lines, above the Network's 250 km/h. */
const HIGH_SPEED = { topSpeed: 300 / 3.6 };

/** AVE's rails: standard gauge, and Iberian gauge too, through a changer, for a run with a stretch with no path on standard gauge alone. */
const STANDARD: Gauges = { railway: ['rail'], gauges: ['1435'], orElse: ['1668'] };
/** The rails of the Trains that change gauge, as Alvia's: both gauges, changing at a changer. */
const BOTH: Gauges = { railway: ['rail'], gauges: ['1435', '1668'] };
const IBERIAN: Gauges = { railway: ['rail'], gauges: ['1668'] };
/** FEVE's lines, which OpenStreetMap tags narrow_gauge almost everywhere, and rail on 111 km in Spain (seen 4 Oct 2026). */
const METRE: Gauges = { railway: ['rail', 'narrow_gauge'], gauges: ['1000'] };

/**
 * Renfe has Antequera AV 430 m north of its platforms, beyond the 200 m a Station's rails may be: it's
 * at their middle, on the high-speed line to Granada, and 25 m from its Iberian-gauge tracks.
 */
const RENFE_LONG_DISTANCE_POINTS: Timetable['points'] = { '02030': [-4.56158, 37.02951] };

export const AVE_LARGA_DISTANCIA: Pick<NetworkConfig, 'id' | 'name' | 'profile' | 'live' | 'runningSide' | 'timetables' | 'lines'> = {
  id: 'ave-larga-distancia',
  name: 'AVE y Larga Distancia',
  // Fitted by #260's triage to the hops of Monday 5 October 2026's Trips as traced along OpenStreetMap's
  // rails: 300 km/h at 0.5 m/s² fits all 442 of AVE's, Avlo's and AVE Int's, and 250 fits all of Alvia's
  // and Euromed's and 99% of Intercity's. So the Network's Lines run at 250, but those three at 300
  // (below). A copy of the build's own tracing, run crudely on 10 October 2026's timetable, finds 99.6%
  // of AVE's 507 hops fit 300 km/h at 0.5 m/s² (95.3% fit 250) and all of Avlo's 154 and AVE Int's 41,
  // and that 250 fits all of Alvia's 410 and Euromed's 32 and 99.2% of Intercity's 122. Renfe's times
  // are whole minutes and the shortest stop it gives a time at is a minute (10 October 2026), so a call
  // it gives none at is a stop of under a minute: half of one, as Rodalies'.
  profile: { acceleration: 0.5, braking: 0.5, topSpeed: 250 / 3.6, dwell: 30 },
  live: RENFE_LONG_DISTANCE_LIVE,
  // As the high-speed lines keep right (docs/research/high-speed.md). Its Trains on the old Norte lines
  // keep left, which one side for a Network can't say, but where OpenStreetMap tags which way Trains run
  // a track, a trace follows it (ADR-0004).
  runningSide: 'right',
  timetables: [
    {
      url: RENFE_LONG_DISTANCE,
      prefix: 'ave-larga-distancia',
      operator: 'adif',
      routes: { names: ['AVE', 'AVLO', 'ALVIA', 'EUROMED', 'Intercity', 'AVE INT', 'TRENCELTA'] },
      // A Trip's trip_short_name is its Train number's five digits.
      number: '^\\d{5}',
      shortNames: true,
      parts: true,
      shapeless: true,
      points: RENFE_LONG_DISTANCE_POINTS,
    },
  ],
  lines: {
    kind: 'long-distance',
    names: { AVLO: 'Avlo', ALVIA: 'Alvia', EUROMED: 'Euromed', 'AVE INT': 'AVE Int', TRENCELTA: 'Trencelta' },
    // Renfe's purple, AVE's since 2022 and on renfe.com, rather than the magenta of Renfe's 2025 AVE
    // map, which can't be told from Ouigo's (#262).
    colour: '#81005E',
    // High speed's 300 km/h, where the Network's 250 is Alvia's, Euromed's, Intercity's and Trencelta's.
    profiles: { AVE: HIGH_SPEED, Avlo: HIGH_SPEED, 'AVE Int': HIGH_SPEED },
    // AVE Int, AVE's trains to France, as AVE. The rest change gauge.
    gauges: { AVE: STANDARD, Avlo: STANDARD, 'AVE Int': STANDARD, Alvia: BOTH, Euromed: BOTH, Intercity: BOTH, Trencelta: BOTH },
  },
};

/** Avant's and Avant Exp's: high speed on the same track as AVE's, at 250 km/h and 0.5 m/s². */
const AVANT = { acceleration: 0.5, braking: 0.5, topSpeed: 250 / 3.6 };

export const MEDIA_DISTANCIA_AVANT: Pick<NetworkConfig, 'id' | 'name' | 'profile' | 'live' | 'runningSide' | 'timetables' | 'lines'> = {
  id: 'media-distancia-avant',
  name: 'Media Distancia y Avant',
  // Rodalies' 160 km/h at 1 m/s², which #260's triage found fits 99% of MD's hops on Monday 5 October
  // 2026, as traced, the misses being road legs. The ex-FEVE regionals, which the feed names REGIONAL
  // too, stay on it. Avant's and Avant Exp's hops fit 250 km/h at 0.5 m/s² (below), as run crudely on
  // 10 October 2026's timetable by a copy of the build's own tracing: all 350 of Avant's and 14 of
  // Avant Exp's, where 68% and 86% fit 160 at 1; and 99.8% of MD's 1,942 hops, 99.3% of Regional's
  // 3,128, 99.8% of Reg.Exp.'s 1,950 and all of Proximidad's 298 fit 160 at 1. Its dwell is half a
  // minute, as above.
  profile: { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 },
  live: RENFE_LONG_DISTANCE_LIVE,
  // As AVE y Larga Distancia's, though its Trains on FEVE's lines keep left too.
  runningSide: 'right',
  // The ex-FEVE regionals, whose route IDs end VRFV, are named REGIONAL too, but run on metre gauge.
  timetables: [
    {
      url: RENFE_LONG_DISTANCE,
      prefix: 'media-distancia-avant',
      operator: 'adif',
      routes: { names: ['AVANT', 'AVANT EXP', 'MD', 'REGIONAL', 'REG.EXP.', 'PROXIMDAD'], gauges: { VRFV: METRE } },
      number: '^\\d{5}',
      shortNames: true,
      parts: true,
      shapeless: true,
      points: RENFE_LONG_DISTANCE_POINTS,
    },
  ],
  lines: {
    kind: 'regional',
    names: { AVANT: 'Avant', 'AVANT EXP': 'Avant Exp', REGIONAL: 'Regional', 'REG.EXP.': 'Reg.Exp.', PROXIMDAD: 'Proximidad' },
    // As MD's lines are on Renfe's own map ("mapa general", May 2024): Avant's plum there would read as
    // AVE y Larga Distancia's purple on the high-speed track they share (#263).
    colour: '#000000',
    profiles: { Avant: AVANT, 'Avant Exp': AVANT },
    gauges: { Avant: STANDARD, 'Avant Exp': STANDARD, MD: IBERIAN, Regional: IBERIAN, 'Reg.Exp.': IBERIAN, Proximidad: IBERIAN },
  },
};

/** The Networks of Renfe's long-distance timetable, whose Trains the daily build reads, but doesn't draw yet (#258). */
export const LONG_DISTANCE = [AVE_LARGA_DISTANCIA, MEDIA_DISTANCIA_AVANT];

/**
 * A source of live data, read in the fetcher by the adapter for its format: its files, by what that
 * adapter calls them, the Worker secrets it needs, how often it's fetched, and which Network each of
 * its Trains is. One source can feed many Networks, as Renfe's Cercanías files have every núcleo's
 * Trains in them.
 */
export type LiveSource = {
  /** What the fetcher keeps its state under. */
  id: string;
  /** The Worker secrets its requests need, by the parameter each goes in: the secret's name. */
  secrets?: Record<string, string>;
  /**
   * How often it's fetched, in ms, as its freshness says: on the fetcher's first run of 20 s after
   * that long. Its adapter may slow it down, as FGC's does near its quota, or hold it back, as TRAM's
   * does after a refusal.
   */
  every: number;
  /**
   * Which Network each of its Trains is, by the longest start of the ID it gives the Train named here,
   * as Renfe's trip_ids start with their núcleo: '' for all of them. Its freshness is each of theirs.
   */
  networks: Record<string, string>;
  /** Its operator's Alerts, where the fetcher reads them, as GTFS-RT in JSON (ADR-0012): where they are, and how often they're fetched, in ms. */
  alerts?: { url: string; every: number };
} & (
  | {
      format: 'renfe';
      urls: { positions: string; updates: string };
      /**
       * Its files name any part of a Train's run, by a trip_id that picks no day, as Renfe's
       * long-distance ones do: each report names its Train by its Train number instead, and the
       * engine finds its Trip by that, in any Network (#261). They give a Train's GPS whatever its
       * currentStatus says, and a trip update for each of its parts, of which some can be CANCELED
       * while it runs.
       */
      numbers?: true;
    }
  | { format: 'fgc'; urls: { positions: string; lookup: string } }
  | { format: 'tram'; urls: { token: string; positions: string; updates: string } }
  | { format: 'tmb'; urls: { predictions: string } }
);

/** FGC's open data. */
const FGC_API = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets';

/** Every live source, in the order the snapshot lists their reports. */
export const LIVE_SOURCES: LiveSource[] = [
  {
    // Renfe's Cercanías live data, as JSON, which has every núcleo's Trains in it: their trip_ids start
    // with their núcleo's code, as Rodalies' with 51.
    id: 'renfe',
    format: 'renfe',
    urls: { positions: 'https://gtfsrt.renfe.com/vehicle_positions.json', updates: 'https://gtfsrt.renfe.com/trip_updates.json' },
    // Every run.
    every: 20_000,
    networks: {
      '51': RODALIES.id,
      '10': CERCANIAS_MADRID.id,
      '20': CERCANIAS_ASTURIAS.id,
      '30': CERCANIAS_SEVILLA.id,
      '31': CERCANIAS_CADIZ.id,
      '32': CERCANIAS_MALAGA.id,
      '40': CERCANIAS_VALENCIA.id,
      '41': CERCANIAS_MURCIA_ALICANTE.id,
      '45': CERCANIAS_CARTAGENA.id,
      '46': CERCANIAS_FERROL.id,
      '47': CERCANIAS_LEON.id,
      '60': CERCANIAS_BILBAO.id,
      '61': CERCANIAS_SAN_SEBASTIAN.id,
      '62': CERCANIAS_SANTANDER.id,
      '70': CERCANIAS_ZARAGOZA.id,
    },
    // Every run too: Renfe answers a conditional request with 304 and no body while its file is
    // unchanged, as it was for hours on 7 October 2026 (docs/research/alerts.md).
    alerts: { url: 'https://gtfsrt.renfe.com/alerts.json', every: 20_000 },
  },
  {
    // Renfe's live data of its long-distance timetable's Trains, as JSON, which has no Alerts file
    // (docs/research/alerts.md).
    id: 'renfe-long-distance',
    format: 'renfe',
    urls: { positions: 'https://gtfsrt.renfe.com/vehicle_positions_LD.json', updates: 'https://gtfsrt.renfe.com/trip_updates_LD.json' },
    numbers: true,
    // Every other run: their headers advance every 14–30 s, so a try 20 s after the last could find
    // them not updated since, and fail (docs/research/live-at-scale.md).
    every: 40_000,
    // A Train number starts with neither, so the step sends none of its Trains to these, nor keeps
    // their SKIPPED Stations, which it keeps by Trip: they're the Networks its freshness is given to,
    // as the engine finds each Train's Trip in any Network.
    networks: { [AVE_LARGA_DISTANCIA.id]: AVE_LARGA_DISTANCIA.id, [MEDIA_DISTANCIA_AVANT.id]: MEDIA_DISTANCIA_AVANT.id },
  },
  {
    // Geotren, where FGC's Trains are, with only what the fetcher reads, and where to look up its
    // trip-updates file. Its GTFS-RT vehicle positions, when not empty, are Geotren's of minutes
    // before, so they're never fetched.
    id: 'fgc',
    format: 'fgc',
    urls: {
      positions: `${FGC_API}/posicionament-dels-trens/records?limit=100&select=id,lin,geo_point_2d,estacionat_a,tipus_unitat,record_timestamp`,
      lookup: `${FGC_API}/trip-updates-gtfs_realtime/records?limit=1`,
    },
    // Every 2 minutes, about as often as FGC updates its live data.
    every: 120_000,
    networks: { '': FGC.id },
  },
  {
    // TRAM's open data, which issues access tokens for an hour to the client its credentials name.
    id: 'tram',
    format: 'tram',
    urls: {
      token: 'https://opendata.tram.cat/connect/token',
      positions: 'https://opendata.tram.cat/api/v1/activevehicles',
      updates: 'https://opendata.tram.cat/api/v1/gtfsrealtime',
    },
    secrets: { client_id: 'TRAM_CLIENT_ID', client_secret: 'TRAM_CLIENT_SECRET' },
    // Every run, but after TRAM refuses a try, as its adapter waits.
    every: 20_000,
    networks: { '': TRAM.id },
    // Every 5 minutes, for each half, as GTFS-RT in JSON, with the access token its adapter keeps.
    alerts: { url: 'https://opendata.tram.cat/api/v1/GtfsRealtimeAlerts', every: 300_000 },
  },
  {
    // TMB's predictions for every Station of the Metro, from iTransit, in one call, with its app's ID
    // and key in the query.
    id: 'tmb',
    format: 'tmb',
    urls: { predictions: 'https://api.tmb.cat/v1/itransit/metro/estacions' },
    secrets: TMB_APP,
    // Every other run, as often as keeps to the one request every 30 s declared to TMB.
    every: 40_000,
    networks: { '': METRO.id },
  },
];
