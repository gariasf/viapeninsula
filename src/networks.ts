// Each Network, as plain data: how its Trains run and are drawn, which of OpenStreetMap's rails they
// run on, where its operator's timetables are and how to read them, who to credit, and how its live
// data reads. The daily build reads its Networks from here alone, and the map what it needs of them
// from the bundle (docs/research/network-config.md). The fetcher reads its live sources from here too.

import type { Credit, Kind, Network } from './bundle.ts';

/** One Network: what the daily build needs to know of it, and through the bundle, the map. */
export interface NetworkConfig extends Omit<Network, 'credit'> {
  /** Its source's credit: the day it was last updated comes from its timetable (Timetable's `updated`). */
  credit: Omit<Credit, 'updated'>;
  rails: Rails;
  /** Its operator's timetables, each a GTFS feed: TRAM has two. */
  timetables: [Timetable, ...Timetable[]];
  /** Its Lines: what they run as, and where its timetables name or colour them otherwise than the public knows them. */
  lines: {
    /** What its Lines run as, but for those `kinds` names. */
    kind: Kind;
    /** What each of its Lines that doesn't run as `kind` runs as, by the Line's name. */
    kinds?: Record<string, Kind>;
    /** The Line each route runs on, by the route's name, where a timetable names some of a Line's Trips apart (#29). */
    names?: Record<string, string>;
    /** Colours for the Lines a timetable gets wrong, by the Line's name, written as `colour` is. */
    colours?: Record<string, string>;
  };
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
  /** Which of its rail routes are this Network's, where not all are: those whose route_id starts so. */
  routes?: { idPrefix: string };
  /** A Trip's Train number, where the operator publishes one: what this pattern first matches in its trip_id after the service_id. */
  number?: string;
  /** Its terms ask the map to show the day it was last updated, in its credit: its feed's start date. */
  updated?: true;
}

/** OpenStreetMap's names for FGC, as the operator of its rails. */
const FGC_OPERATOR = ['FGC', 'Ferrocarrils de la Generalitat de Catalunya'];

/** TMB's app ID and key, which its APIs take in the query, by the secrets holding them. */
const TMB_APP = { app_id: 'TMB_APP_ID', app_key: 'TMB_APP_KEY' };

export const RODALIES: NetworkConfig = {
  id: 'rodalies',
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
      // Renfe's Cercanías GTFS, of which Rodalies, including its regional lines, is núcleo 51. Its Stations are Adif's.
      url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
      prefix: 'rodalies',
      operator: 'adif',
      routes: { idPrefix: '51' },
      // A trip_id is the service_id, then the Train number's five digits, then the Line.
      number: '^\\d{5}',
    },
  ],
  // Renfe's open data is CC BY 4.0, which asks for its source to be named, and the licence.
  credit: { text: 'Renfe', url: 'https://data.renfe.com/', licence: 'CC BY 4.0' },
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
  // Geotren has a Train standing at a Station where it puts it near one.
  live: { delay: 'operator', near: 'standing' },
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
  live: { delay: 'operator', near: 'standing' },
  lines: { kind: 'tram' },
};

export const METRO: NetworkConfig = {
  id: 'metro',
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

/** Every Network, in the order the bundle lists them. */
export const NETWORKS = [RODALIES, FGC, TRAM, METRO];

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
  /** Which Network each of its Trains is, by the longest start of the ID it gives the Train named here, as Renfe's trip_ids start with their núcleo: '' for all of them. */
  networks: Record<string, string>;
} & (
  | { format: 'renfe'; urls: { positions: string; updates: string } }
  | { format: 'fgc'; urls: { positions: string; lookup: string } }
  | { format: 'tram'; urls: { token: string; positions: string; updates: string } }
  | { format: 'tmb'; urls: { predictions: string } }
);

/** FGC's open data. */
const FGC_API = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets';

/** Every live source, in the order the snapshot lists their reports. */
export const LIVE_SOURCES: LiveSource[] = [
  {
    // Renfe's Cercanías live data, as JSON, which has every núcleo's Trains in it: Rodalies' trip_ids
    // start with its own, 51.
    id: 'renfe',
    format: 'renfe',
    urls: { positions: 'https://gtfsrt.renfe.com/vehicle_positions.json', updates: 'https://gtfsrt.renfe.com/trip_updates.json' },
    // Every run.
    every: 20_000,
    networks: { '51': RODALIES.id },
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
