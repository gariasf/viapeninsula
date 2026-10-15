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
   * where it names none (regionOf()). Long distance's Networks are a region of their own too, which
   * every view loads (EVERYWHERE, #266).
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
    /**
     * The rails each of its Lines runs on, by the Line's name: where its timetables have no shapes, to trace
     * its Trips along (#259), and where it runs on two gauges, to trace each Line's shapes along its own
     * gauge's, or with no gauge tag, of the Network's `rails` (#366, #479).
     */
    gauges?: Record<string, Gauges>;
  };
  /**
   * The Stations its timetables put where their Trains don't stop, by ID, as Renfe's put Asturias' El
   * Entrego at a FEVE station 0.4 km from Adif's (#367), with where they do stop and the source that
   * says so: the URL of an OpenStreetMap node, or of a platform way beside it, or of the operator's own
   * map. The daily build lists those it applies. A Station two Networks list is one Station, as the first
   * of them has it, a Scheduled-only Network's after the others (stationsOf()), so it goes in each
   * Network that lists it.
   */
  stations?: Record<string, { lon: number; lat: number; source: string }>;
  /**
   * The Stations whose names its timetables shorten, by ID, as TRAM's write Ciutadella | Vila Olímpica as
   * "Ciutadella|V.O." (#571), with the name as its operator's own site spells them, and the page that
   * does. The daily build lists those it applies. It's the Station's name wherever the build gives one,
   * a Trip's headsign too, where its timetable has none and it's headed for its last Station. A
   * Station two Networks list is one Station, as the first of them has it, a Scheduled-only Network's
   * after the others (stationsOf()), so it goes in each Network that lists it.
   */
  stationNames?: Record<string, { name: string; source: string }>;
  /**
   * Stations beyond it, by ID, where its operator files under one of its Lines a train that runs on
   * into another Network, as Renfe files FEVE's Bilbao–León train under Cercanías Bilbao's C4 (#368). A
   * Trip that calls at one of them isn't the Network's: it's left out, with the Stations and track only
   * such Trips have, and logged and reported, and it's no longer one of the Trains it lists (unlisted()),
   * though another Network may list it too, as León's C1 lists that train's last 17 calls. One Station
   * is enough where every Trip that runs on calls there, as it is for Bilbao's, on all 30 days of Renfe's
   * file of 10 October 2026: a Trip that skipped it would run its Line on beyond the Network again.
   */
  beyond?: string[];
  /**
   * Stations its operator runs by road, by ID, each group with the notice that says so, where its
   * timetable lists the Trains as rail all the same and no Alert informs its Lines, as Renfe's
   * long-distance one does Zaragoza–Teruel–Sagunto's (#562). A Train that calls at one isn't drawn: a
   * bus isn't a Train. It's left out whole, every Trip its timetable lists it in, and logged with the
   * notice and reported, as `beyond`'s are. A group marked `ends` is a road leg at the end of its
   * Trains' runs, as Huércal-Viator–Almería's (#792): a Trip's first or last calls at its Stations, the
   * run of them at that end, are dropped, each logged with the notice and reported, and the Train is
   * kept on rail to the last Station it reaches by rail. A Train that calls at one in the middle of its
   * run is still left out whole.
   */
  byRoad?: { stations: string[]; source: string; ends?: true }[];
  /**
   * Stations its Trains turn back at without calling there, by ID, with where they are and the sources
   * that say so, as Intercity 01460 and 01463 run from Elche into Sant Gabriel, reverse and go on into
   * Alicante/Alacant-Terminal from the west, the coastal line from Sant Gabriel into Alicante being razed
   * (#795). A run's trace can turn back at its own Stations (walk()) and at these, at REVERSE's cost, but
   * at no other: a long-distance run can't turn back wherever it passes a Station. A Network whose
   * timetables have no shapes traces its runs with them (traceRuns()); the daily build lists those it applies.
   */
  turnBacks?: Record<string, { name: string; lon: number; lat: number; source: string }>;
  /**
   * Its region builds without it where its timetables can't be read, nor their copy, or it can't be
   * built from them: it's left out,
   * logged and reported, rather than fail the region, as Ouigo's, behind NAP's key, mustn't keep AVE y
   * Larga Distancia's region on its last build's files (ADR-0010).
   */
  optional?: true;
}

/**
 * The ways a Network runs on in OpenStreetMap: those whose `railway` is one of these and, where they're
 * given, whose gauge is one of these (a way with three rails has two, as `1435;1668`) or that has none
 * (#479), whose operator is one of these, and whose operator is none of these.
 */
export interface Rails {
  railway: string[];
  gauge?: string[];
  operator?: string[];
  notOperator?: string[];
}

/**
 * The rails a Line runs on where its timetable has no shapes, as Renfe's long-distance one hasn't (#259),
 * or where its Network runs on two gauges, as Cercanías Santander does (#366): the ways whose `railway` is
 * one of these, and whose gauge is one of `gauges`, or that have no gauge tag, as a way with three rails
 * has two gauges, as `1435;1668`. A Network's `rails` count a way with no gauge tag as every gauge's too
 * (onRails(), #479). A Line on two gauges, as Alvia's, changes from one to the other only at a
 * railway=gauge_conversion node. A run of its Trips with a stretch with no path on `gauges` is traced on
 * `orElse`'s too, all the way, changing to them only at such a node.
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
  /**
   * Its URL is NAP's downloadLink for its file (Spain's National Access Point, nap.transportes.gob.es),
   * which answers a request with NAP_API_KEY in an ApiKey header with the file's link, as NAP's API
   * marks its one-step /download/ obsolete; and NAP lists the file in its dataset of this ID, which gives
   * the day NAP last updated it, its fechaActualizacion (`updated: 'nap'`).
   */
  nap?: { dataset: number };
  /** What its Trips' and shapes' IDs start with, as in `rodalies:<trip_id>`. */
  prefix: string;
  /** What its Stations' IDs start with: whoever runs them, as in `adif:<stop_id>` for Renfe's. */
  operator: string;
  /**
   * What its stop_ids start with before its Stations' own IDs, which is dropped: Ouigo's MERITS export
   * gives Adif's codes after `0071`, UIC's code for Spain's railways, so that it calls at Renfe's Stations.
   */
  stopPrefix?: string;
  /** A stop's Station is its parent station, where the feed makes each platform a stop of its own. */
  parents?: true;
  /**
   * Which of its rail routes are this Network's, where not all are: those whose route_id starts so, and
   * whose route_short_name is one of these. And the rails those whose route_id ends so run on, whatever
   * their Line runs on (`lines.gauges`), as the ex-FEVE regionals', which are Regional (#259). Renfe's
   * long-distance timetable is divided between its two Networks by these names, and the build reports
   * a name neither has, as its Trips are in neither (#401).
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
  /**
   * Its live data names a stop by its stop_sequence, so that a Trip's call at that number less one is
   * the Station, as TRAM's does (#344): the build reports a Trip whose numbers don't run 1…n (#406).
   */
  stopNumbers?: true;
  /** It has no shapes, as Renfe's long-distance timetable hasn't: any other that loses its shapes.txt is read from its copy. */
  shapeless?: true;
  /**
   * Its terms ask the map to show the day it was last updated, in its credit: its feed's start date
   * (`true`, from its feed_info.txt), or, where its feed has none, as TRAM's hasn't, the day it was read
   * (`'read'`): the day the build downloaded it, or where the Network is built from its copy, the day
   * that was kept, or NAP's own date for its file, its fechaActualizacion (`'nap'`, updatedOn()).
   */
  updated?: true | 'read' | 'nap';
  /**
   * Its shapes leap in a straight line where they haven't the track, and run on from there, as
   * Euskotren's do (#265): a stretch between two Stations across a leap (track.ts's LEAP) isn't one
   * whose traced length is held to the feed's, where the trace, through the Stations, is right.
   */
  leaps?: true;
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
  short: 'Rodalies',
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
  // Iberian-gauge rails, which keeps it off the standard-gauge high-speed line, but for a way of it with
  // no gauge tag, which counts as every gauge's (#479).
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
  // Renfe's timetable of 10 October 2026 puts Rajadell, where R4 and RL4 call, 66 m from Adif's track, so
  // its dot is 18 px from its Line at zoom 14: OpenStreetMap's station node for it (ref 78506) is beside the
  // track, 0.21 km from there (#495). Renfe's long-distance timetable has it at that point too, for Media
  // Distancia y Avant's Regional, so that Network's `stations` is to have it once it's drawn (#263, #476).
  stations: {
    'adif:78506': { lon: 1.6985763, lat: 41.7323609, source: 'https://www.openstreetmap.org/node/1669114248' },
  },
};

export const FGC: NetworkConfig = {
  id: 'fgc',
  region: 'catalonia',
  name: 'Ferrocarrils de la Generalitat de Catalunya',
  short: 'FGC',
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
  // ended 38 minutes to 5 hours before (#232). It names none of FV's Trips: none of the 42,061 FGC
  // reports in the ten recordings of 6, 7 and 10 October 2026 does, nor any of the 1,632 records of
  // Geotren polled once a minute on 10 October from 11:10 to 11:55 (#489).
  live: { delay: 'operator', near: 'standing', lingers: true, unnamed: ['FV'] },
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

/** TRAM's lines page, whose diagrams of each Line's Stations spell them as TRAM does. */
const TRAM_LINES = 'https://www.tram.cat/ca/linies-i-horaris';

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
  // shapes' IDs clash. Each feed makes each platform a stop of its own. TRAM's terms ask for the day its
  // data was last updated (restriction 4), which neither feed says, as neither has a feed_info.txt:
  // the day the build read them (`updated: 'read'`).
  timetables: [
    { url: 'https://opendata.tram.cat/GTFS/zip/TBX.zip', prefix: 'tram:TBX', operator: 'tram', parents: true, stopNumbers: true, updated: 'read' },
    { url: 'https://opendata.tram.cat/GTFS/zip/TBS.zip', prefix: 'tram:TBS', operator: 'tram', parents: true, stopNumbers: true, updated: 'read' },
  ],
  // TRAM's terms ask for these words, and a link, and the day (`updated`).
  credit: { text: 'Powered by TRAM Barcelona', url: 'https://www.tram.cat/' },
  // TRAM names the stop a Train is at or has just left, not one it stands at: its distance reads a
  // Station's for about 40 s as the Train reaches it, and then 0 until it reaches the next. Held at that
  // Station, a Train would stand there 40–80 s and then jump a whole stretch, so it isn't, even where
  // TRAM's number for the platform is mapped to its Station: TRAM's Delay has most such Trains on their
  // way (#42).
  live: { delay: 'operator', near: 'pinned' },
  lines: { kind: 'tram' },
  // TRAM's timetables shorten eight Stations' names (seen 12 October 2026): its own site writes them out,
  // in its lines page's diagrams of each Line's Stations and, for some, the words under them, as the
  // Metro's names for the same places are, Ciutadella | Vila Olímpica and Zona Universitària (#571).
  // T2's end it writes four ways: Llevant - Les Planes in its diagram and the Line's name, Llevant | Les
  // Planes in its description, Llevant-Les Planes in its note of the works of 10 October and Llevant –
  // Les Planes in its Alert sc-287 of 9 October. The bar's is the one the five others that have a bar
  // have, and the Alerts' reader finds it whole as either end of a stretch in the description's and the
  // note's, and as its second end in the diagram's and the Alert's (stretchesIn()).
  stationNames: {
    'tram:ST-178': { name: 'Zona Universitària', source: TRAM_LINES },
    'tram:ST-193': { name: 'Fontsanta | Fatjó', source: TRAM_LINES },
    'tram:ST-197': { name: 'Hospital Sant Joan Despí | TV3', source: TRAM_LINES },
    'tram:ST-201': { name: 'Sant Feliu | Consell Comarcal', source: TRAM_LINES },
    'tram:ST-202': { name: 'Ciutadella | Vila Olímpica', source: TRAM_LINES },
    'tram:ST-203': { name: 'Wellington | UPF', source: TRAM_LINES },
    'tram:ST-229': { name: 'Estació de Sant Adrià', source: TRAM_LINES },
    'tram:ST-230': { name: 'Llevant | Les Planes', source: TRAM_LINES },
  },
};

export const METRO: NetworkConfig = {
  id: 'metro',
  region: 'catalonia',
  name: 'Metro de Barcelona',
  short: 'Metro',
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

// The rails of the Lines of each gauge, for the Lines of a Network of two gauges, each traced on its own
// (#366), and for long distance's, whose timetable has no shapes (#259): standard gauge is 1435 mm,
// Iberian 1668 and metre 1000.

/**
 * AVE's rails: standard gauge, and Iberian gauge too, through a changer, for a run with a stretch with no
 * path on standard gauge alone. The Trains that change gauge, as Alvia's, run on them too, rather than on
 * both gauges at one price, as they did till 15 Oct 2026: then each run took the cheaper of two ways a few
 * hundred metres apart where the high-speed line and the old Iberian-gauge one run side by side, and on
 * 11–13 Oct Alvia Madrid → Santander changed gauge at Villamuriel, between Valladolid and Palencia, but
 * Santander → Madrid between Valladolid and Madrid, and Madrid → Irun's runs one between Segovia and
 * Valladolid, another between Burgos and Miranda de Ebro. Priced as AVE's, a run keeps to high-speed track
 * as far as it can and changes at the last changer it can, the same each way, as the maintainer picked (#667).
 */
const STANDARD: Gauges = { railway: ['rail'], gauges: ['1435'], orElse: ['1668'] };
const IBERIAN: Gauges = { railway: ['rail'], gauges: ['1668'] };
/** FEVE's lines, which OpenStreetMap tags narrow_gauge almost everywhere, and rail on 111 km in Spain (seen 4 Oct 2026). */
const METRE: Gauges = { railway: ['rail', 'narrow_gauge'], gauges: ['1000'] };

// As Madrid's, these núcleos' Trains accelerate and brake at 1 m/s² and stand half a minute at
// small Stations. Each one's top speed covers the fastest stretch its Trips run on 7 October 2026,
// as the build measures it along their track. Asturias' C4 from Candás to Candás-Apeadero, 431 m,
// which Renfe times at the same minute at both (#253), gets half a minute, 52 km/h, as the build
// gives a hop of no time that fits its top speed in it (#600). Their fastest Units run at 120 km/h,
// Civias on Adif's lines and 2700s on FEVE's metre-gauge ones. A núcleo runs on the left where all
// its double track keeps left: Adif's lines that García Álvarez lists as running on the left ("La
// vía doble en España y el sentido de circulación de los trenes por ella", FFE, 2010, table 4 and
// p. 25), and FEVE's, which keep left too. OpenStreetMap's railway:preferred_direction tags say
// which way Trains run on only 3.6 km of these núcleos' double track, in Santander (seen 7 October
// 2026).

export const CERCANIAS_ASTURIAS: NetworkConfig = {
  ...CERCANIAS,
  id: 'cercanias-asturias',
  name: 'Cercanías Asturias',
  // Its fastest stretch is one C3 Trip's Avilés to La Rocica, 2.4 km in a minute, 142 km/h: a top
  // speed under it would leave that Trip out.
  profile: { acceleration: 1, braking: 1, topSpeed: 150 / 3.6, dwell: 30 },
  // Adif's Pola de Lena–Gijón, which C1–C3 run on, and Villabona–Cancienes keep left, and so do FEVE's
  // lines. OpenStreetMap gives six ways of the left-hand track between Villallana and Mieres no gauge
  // (seen 11 October 2026), which rails count as every gauge's (onRails(), #479): left out, as they were
  // till then, C1's trace north turned back to Pola de Lena from Villallana and came out 8.6% longer
  // than the feed's shape, which fails the build, so it kept right (#253, #370).
  runningSide: 'left',
  // Adif's Iberian gauge for C1–C3, and FEVE's metre gauge for C4–C8, which OpenStreetMap tags
  // narrow_gauge or rail (ADR-0010).
  rails: { railway: ['rail', 'narrow_gauge'], gauge: ['1668', '1000'] },
  // Asturias is núcleo 20.
  timetables: [núcleo('20', 'cercanias-asturias')],
  // C1–C8 and C5a are commuter Lines. Each is traced on its own gauge's rails, as C8, on FEVE's, calls
  // at Renfe's La Pereda-Riosa and Ablaña, nearer Adif's track than FEVE's (#366).
  lines: { kind: 'commuter', gauges: { C1: IBERIAN, C2: IBERIAN, C3: IBERIAN, C4: METRE, C5: METRE, C5a: METRE, C6: METRE, C7: METRE, C8: METRE } },
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
  // Bilbao is núcleo 60.
  timetables: [núcleo('60', 'cercanias-bilbao')],
  // C1–C5 are commuter Lines, each traced on its own gauge's rails (#366).
  lines: { kind: 'commuter', gauges: { C1: IBERIAN, C2: IBERIAN, C3: IBERIAN, C4: METRE, C5: METRE } },
  // Renfe files FEVE's train a day each way between Bilbao and León under C4 (10 October 2026): 63 calls
  // from Bilbao in 7 h 47 min and 54 back in 7 h 52 min, on past Balmaseda and La Calzada, where C4's own
  // Trips end, along the La Robla line to León's La Asunción, at 43 Stations no other Trip of núcleo 60
  // calls at, 17 of them León's own, whose calls León's C1 lists as Trips under the same numbers. It's no
  // Trip of Bilbao's, so C4 ends at La Calzada, by Balmaseda: a Trip that calls at Arla Berrón, the first
  // Station the train calls at past La Calzada, is left out (#368).
  beyond: ['adif:05721'],
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
  // C1–C3 are commuter Lines. Each is traced on its own gauge's rails, as Renfe's Santander and Maliaño,
  // where C1 stops, are nearer FEVE's track than Adif's: Maliaño 6 m from FEVE's and 65 m from Adif's (#366).
  lines: { kind: 'commuter', gauges: { C1: IBERIAN, C2: METRE, C3: METRE } },
  // Renfe's timetable of 10 October 2026 puts Maliaño, where C1 stops, 14 m from FEVE's Maliaño Vidriera
  // (05655) on FEVE's line, and 65 m from Adif's, which C1 runs on, so its dot is 19 px from its Line at
  // zoom 14: OpenStreetMap's stop for it is on Adif's track, 0.16 km from there (#494). Renfe's long-distance
  // timetable has it at that point too, for Media Distancia y Avant's Reg.Exp. 18100 to 18105, so that Network's
  // `stations` is to have it once it's drawn (#262, #476).
  stations: {
    'adif:14220': { lon: -3.8420976, lat: 43.4173678, source: 'https://www.openstreetmap.org/node/2337169285' },
  },
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

/** Euskotren's open data, on Moveuskadi, Euskadi's: its timetable each day, and its live data. */
const MOVEUSKADI = 'https://opendata.euskadi.eus/transport/moveuskadi/euskotren';

export const EUSKOTREN: NetworkConfig = {
  id: 'euskotren',
  name: 'Euskotren',
  // Half its stretches in its timetable of 14 October 2026 run at 37 km/h or less, and nine in ten at 54
  // or less, in whole minutes, as its Stations are close: its Units run at 90 km/h. Most Stations get no
  // time of their own in its timetable.
  profile: { acceleration: 1, braking: 1, topSpeed: 90 / 3.6, dwell: 30 },
  // As Bilbao's metre-gauge lines keep left, FEVE's and the Metro's. OpenStreetMap tags no
  // railway:preferred_direction on its trains' ways to measure it by (seen 14 October 2026), only on Vitoria's trams'.
  runningSide: 'left',
  // The blue that leads its logo (#265).
  colour: '#004494',
  pillZoom: 10,
  // Euskal Trenbide Sarea's metre gauge, underground through Bilbao and Donostia too, where OpenStreetMap
  // tags it subway.
  rails: { railway: ['rail', 'narrow_gauge', 'subway'], gauge: ['1000'] },
  timetables: [
    {
      // Moveuskadi's copy, each day, of Euskotren's feed, which makes each platform a stop of its own: its
      // Stations are its StopPlaces, by their numbers, as ES:Euskotren:StopPlace:2597: is euskotren:2597:.
      url: `${MOVEUSKADI}/gtfs_euskotren.zip`,
      prefix: 'euskotren',
      operator: 'euskotren',
      parents: true,
      stopPrefix: 'ES:Euskotren:StopPlace:',
      // Its trains, E1–E4 and E3a, and FCC, as it names the through Trains that run from one of them onto
      // another, such as Bermeo–Lezama. Not L3, Bilbao's metro line, nor its trams or the funicular
      // (ADR-0010).
      routes: { names: ['E1', 'E2', 'E3', 'E3a', 'E4', 'FCC'] },
      // Its timetable of 14 October 2026 has E3's shapes leap 4 km from Sondika to Lutxana and run back
      // along E3a's track, and others 0.8–1 km at Donostia and by Durango: traced through their Stations,
      // they're 6–42% shorter there, and right.
      leaps: true,
      // Euskadi's open-data terms ask for the day it was last updated: its feed's start date, the day
      // Moveuskadi wrote it.
      updated: true,
    },
  ],
  // Moveuskadi's dataset is CC BY 4.0, and its timetable's attributions.txt names Eusko Trenbideak.
  credit: { text: 'Eusko Trenbideak', url: 'https://opendata.euskadi.eus/catalogo/-/moveuskadi-datos-de-la-red-de-transporte-publico-de-euskadi-operadores-horarios-paradas-calendario-tarifas-etc/', licence: 'CC BY 4.0' },
  // Its live data is trip updates alone, so its Trains are Live by the Station they come to next, as
  // the Metro's are, and late by when they're expected there.
  live: { delay: 'operator', near: 'standing' },
  lines: { kind: 'commuter' },
};

/**
 * The region every view loads, wherever the map is and at every zoom (ADR-0014), as AVE y Larga
 * Distancia's Trains show at every zoom (ADR-0010): long distance's, whose Networks name it (#262). The
 * manifest gives it no extent, which is what the map loads it by (#266).
 */
export const EVERYWHERE = 'long-distance';

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
// and their colours are their config's, as the feed gives every route F2F5F5. As the timetable has no
// shapes, each Line runs on the rails of its gauge, STANDARD, IBERIAN or METRE above (#259,
// docs/research/high-speed.md). Both are on the map: AVE y Larga Distancia at every view (#262), and
// Media Distancia y Avant from zoom 7, where the view reaches it (#263).

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
 * kilometre at 300 km/h is 12 s, so a Train jumps for being a minute off, as JUMP_TIME has it. It names
 * each Train by its Train number alone (#261), and is these Networks' own feed (#262).
 */
const RENFE_LONG_DISTANCE_LIVE = { delay: 'gps', near: 'pinned', snap: 60, numbers: true } as const;

/** AVE's, Avlo's and AVE Int's top speed, on the high-speed lines, above the Network's 250 km/h. */
const HIGH_SPEED = { topSpeed: 300 / 3.6 };

/**
 * Renfe's purple, AVE's since 2022 and on renfe.com, for AVE y Larga Distancia's track below zoom 7 and its
 * Lines, rather than the magenta of Renfe's 2025 AVE map, about #DA055C, which can't be told from Ouigo's
 * #E50A70 (#262).
 */
const AVE_PURPLE = '#81005E';

/**
 * Huércal-Viator–Almería, by road since 5 March 2024 for every Train Renfe's long-distance timetable lists
 * to or from Almería, which it lists as calling there all the same, as Alvia 02087's 7:54 to Huércal-Viator's
 * 8:25 on 14 Oct 2026: the line into Almería is shut while Adif builds its underground line and station,
 * planned for 2026–27 (#792). Each of the timetable's Networks has it.
 */
const ALMERIA_BY_ROAD: NonNullable<NetworkConfig['byRoad']>[number] = {
  stations: ['adif:56312'],
  source: 'https://www.adifaltavelocidad.es/w/hu%C3%A9rcal-viator-se-convierte-en-punto-de-transferencia-de-viajeros-desde-el-5-de-marzo-para-los-trenes-con-origen-y-destino-almer%C3%ADa',
  ends: true,
};

export const AVE_LARGA_DISTANCIA: NetworkConfig = {
  id: 'ave-larga-distancia',
  name: 'AVE y Larga Distancia',
  short: 'Larga Distancia',
  // Built and loaded on its own, at every view, as its Trains show at every zoom (ADR-0010, ADR-0014).
  region: EVERYWHERE,
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
  colour: AVE_PURPLE,
  // Its Trains are drawn at every zoom, as dots below 7 and pills from 7, where the Lines are (ADR-0010).
  pillZoom: 7,
  // Its Lines' runs are traced on the rails of their gauges (`lines.gauges`), and a way with no gauge tag
  // is every gauge's for them (#259): these are only the ways the report names a Station on.
  rails: { railway: ['rail'] },
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
    },
  ],
  // Renfe's, as every Network of Renfe's credits it, so that the map credits Renfe once (ADR-0010).
  credit: RENFE,
  // Renfe's long-distance timetable of 14 October 2026 lists Intercity 11092, 11093, 11182 and 11183,
  // Albacete–Cartagena by Hellín, Cieza and Archena-Fortuna, the only Trains calling at Archena, as rail.
  // But Adif has the Chinchilla line shut to Trains between Murcia Mercancías and Murcia del Carmen for the
  // high-speed works at Murcia's station (the second source, Adif's reply of May 2026), which OpenStreetMap
  // tags railway=construction (way 922727787), and Renfe has run them by road from Cartagena to Albacete
  // since September 2022 (the first): no path along the rails (#478). And it has Alvia 02087 and 02366
  // start and end at Almería, from and to Huércal-Viator, 6 km out, where no Train has reached Almería
  // since 5 March 2024, Huércal-Viator being the transfer point while Adif builds the city's underground
  // line and station (Adif's notice, ALMERIA_BY_ROAD), and every track into it OpenStreetMap has is
  // railway=construction: their calls at Almería are dropped, the Trains kept to Huércal-Viator (#792).
  byRoad: [
    {
      stations: ['adif:61015'],
      source:
        'https://www.orm.es/informativos/noticias-2022/renfe-suprime-los-trenes-por-archena-y-habilita-autobuses-hasta-albacete/, https://televisionhellin.com/2026/05/07/adif-contradice-su-version-sobre-la-linea-de-tren-y-confirma-que-esta-operativa/',
    },
    ALMERIA_BY_ROAD,
  ],
  lines: {
    kind: 'long-distance',
    names: { AVLO: 'Avlo', ALVIA: 'Alvia', EUROMED: 'Euromed', 'AVE INT': 'AVE Int', TRENCELTA: 'Trencelta' },
    colour: AVE_PURPLE,
    // High speed's 300 km/h, where the Network's 250 is Alvia's, Euromed's, Intercity's and Trencelta's.
    profiles: { AVE: HIGH_SPEED, Avlo: HIGH_SPEED, 'AVE Int': HIGH_SPEED },
    // AVE Int, AVE's trains to France, as AVE. The rest change gauge, and keep to standard gauge as AVE does (#667).
    gauges: { AVE: STANDARD, Avlo: STANDARD, 'AVE Int': STANDARD, Alvia: STANDARD, Euromed: STANDARD, Intercity: STANDARD, Trencelta: STANDARD },
  },
  // Renfe's long-distance timetable of 14 October 2026 lists Intercity 01460 and 01463, Cartagena–València,
  // as calling at Elche/Elx-Parc and then at Alicante/Alacant-Terminal. OpenStreetMap has the coastal line
  // from Sant Gabriel into Alicante razed (way 403284480), its rails ending in buffers 780 m short of the
  // terminal, and so has it right: Trains from Elche run into Sant Gabriel, reverse and go north onto the
  // Madrid line into Alicante from the west, as Alicante Plaza says ("terminar con la inversión de la
  // marcha en San Gabriel") and Cercanías' C1 does (its shape 41_C1 of Renfe's Cercanías timetable
  // reverses there). The Intercity doesn't call at Sant Gabriel, so the trace had no path: 2 Trips a day
  // left out (#478, #795). Its point is Renfe's, of Cercanías' timetable.
  turnBacks: {
    'adif:62109': {
      name: 'Sant Gabriel',
      lon: -0.5086866,
      lat: 38.3290647,
      source: `https://alicanteplaza.es/alicanteplaza/podem-insta-a-los-ayuntamientos-a-reivindicar-inversiones-en-el-cercanias-entre-alicante-y-murcia, ${RENFE_CERCANIAS} (shape 41_C1)`,
    },
  },
  // Renfe's long-distance timetable of 10 October 2026 has Medina del Campo AV at the old Medina del Campo
  // station, 2 m from its Iberian-gauge tracks and 1.5 km from any standard-gauge one, where it's 3.1 km
  // south-west, on the high-speed line to Zamora: Avlo's and Alvia's Trips from Zamora had no path to it, 5
  // to 7 a day left out, and Alvia's to Salamanca were traced through the old station (#476). And it has
  // Antequera AV 430 m north of its platforms, beyond the 200 m a Station's rails may be: it's at their
  // middle, between platform ways 1144921235 and 1144921236, on the high-speed line to Granada, and 25 m
  // from its Iberian-gauge tracks (#259, #496).
  stations: {
    'adif:08240': { lon: -4.9229291, lat: 41.2912358, source: 'https://www.openstreetmap.org/node/6329564866' },
    'adif:02030': { lon: -4.56158, lat: 37.02951, source: 'https://www.openstreetmap.org/way/1144921235' },
  },
};

/** Avant's and Avant Exp's: high speed on the same track as AVE's, at 250 km/h and 0.5 m/s². */
const AVANT = { acceleration: 0.5, braking: 0.5, topSpeed: 250 / 3.6 };

/**
 * Black, as MD's lines are on Renfe's own map ("mapa general", May 2024), for Media Distancia y Avant's
 * track below zoom 7 and its Lines: Avant's plum there, about #66145E, would read as AVE y Larga
 * Distancia's purple on the high-speed track they share (#263).
 */
const MD_BLACK = '#000000';

export const MEDIA_DISTANCIA_AVANT: NetworkConfig = {
  id: 'media-distancia-avant',
  name: 'Media Distancia y Avant',
  short: 'Media Distancia',
  // A region of its own, its ID, loaded once the view reaches it from zoom 7, as a núcleo's is, and
  // not long distance's, which every view loads: its Trains show only from zoom 7, and its files are
  // 2.3–2.7 times AVE y Larga Distancia's (#263, ADR-0014).
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
  colour: MD_BLACK,
  // Its Trains are drawn from zoom 7, as pills, where its region loads and its Lines are (ADR-0010).
  pillZoom: 7,
  // Its Lines' runs are traced on the rails of their gauges, as AVE y Larga Distancia's are.
  rails: { railway: ['rail', 'narrow_gauge'] },
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
    },
  ],
  lines: {
    kind: 'regional',
    names: { AVANT: 'Avant', 'AVANT EXP': 'Avant Exp', REGIONAL: 'Regional', 'REG.EXP.': 'Reg.Exp.', PROXIMDAD: 'Proximidad' },
    // As MD's lines are on Renfe's own map ("mapa general", May 2024): Avant's plum there would read as
    // AVE y Larga Distancia's purple on the high-speed track they share (#263).
    colour: MD_BLACK,
    profiles: { Avant: AVANT, 'Avant Exp': AVANT },
    gauges: { Avant: STANDARD, 'Avant Exp': STANDARD, MD: IBERIAN, Regional: IBERIAN, 'Reg.Exp.': IBERIAN, Proximidad: IBERIAN },
  },
  // Renfe's, as every Network of Renfe's credits it, so that the map credits Renfe once (ADR-0010).
  credit: RENFE,
  // A Station two Networks list is one Station, as the first has it, so those another Network puts
  // elsewhere go here too (#367): Medina del Campo AV and Antequera AV as AVE y Larga Distancia has them
  // (#476, #496), Maliaño as Cercanías Santander has it (#494), and Dosante Cidad, which Renfe has 614 m
  // from FEVE's track, where the Bilbao–León train stops, at OpenStreetMap's stop 2 m from it (#368, #547).
  // And its own, from Renfe's long-distance timetable of 14 October 2026 (#476): Callosa de Segura-Cox,
  // which it has at the old Callosa de Segura station, on Iberian-gauge track 1 km from the high-speed
  // line Avant Alicante–Murcia calls on, 1.6 km north; El Carrión, 313 m from its line; and Los Rosales,
  // which it has on the Sevilla–Córdoba line's platforms, 0.2 km from the Mérida line's, where MD and
  // Reg.Exp. from Tocina call (#493).
  stations: {
    'adif:08240': AVE_LARGA_DISTANCIA.stations!['adif:08240']!,
    'adif:02030': AVE_LARGA_DISTANCIA.stations!['adif:02030']!,
    'adif:03412': { lon: -0.8750933, lat: 38.1370147, source: 'https://www.openstreetmap.org/node/11393157285' },
    'adif:14117': { lon: -4.4958622, lat: 42.1167509, source: 'https://www.openstreetmap.org/node/1732357750' },
    'adif:50700': { lon: -5.7282079, lat: 37.5903189, source: 'https://www.openstreetmap.org/node/7758141441' },
    'adif:14220': { lon: -3.8420976, lat: 43.4173678, source: 'https://www.openstreetmap.org/node/2337169285' },
    'adif:05736': { lon: -3.7558646, lat: 43.0113013, source: 'https://www.openstreetmap.org/node/12495839165' },
  },
  // Renfe's long-distance timetable of 14 October 2026 lists these Trains as rail, though Renfe runs them
  // by road, and no Alert informs its Lines: on 14 Oct, Zaragoza–Teruel–Sagunto's MD 18502, 18504,
  // 18506, 18511, 18515, 18523 and Regional 18500 and 18517, at the Stations only they call at (#562);
  // Madrid–Jaén's MD 18030 to 18037 between Almuradiel and Jaén since 6 Sep 2026, at Vilches, which only
  // they and two Alvias call at, Linares-Baeza and Jaén having other Trains; and Sevilla–Mérida's MD
  // 35807 and 35902 and Reg.Exp. 18773 and 18779 between Los Rosales and Cazalla-Constantina, at Tocina
  // and Pedroso (AVISO_512188, whose words name only Cercanías Sevilla's C3). The same notice as
  // Almuradiel–Jaén's has Linares-Baeza–Almería by road since 6 Sep 2026: MD 35276 and 35279, at Jódar-Úbeda,
  // Cabra del Santo Cristo y Alicún and Moreda, which only they call at. And Córdoba–Jaén has been by road
  // since 26 Jan 2026, until autumn 2027, with Córdoba–Villa del Río's Proximidad too: MD 13001 to 13083,
  // 13331, 13337 and 35001 to 35083, which Renfe lists as Trains from Córdoba to Jaén, direct or by
  // Villa del Río and Andújar, and the Proximidad Trains to Villa del Río, at Jaén, Andújar and Villa del Río,
  // which no Train by rail calls at on 14 Oct. Each Train is left out whole, its stretches by rail too, as
  // Bilbao's beyond its `beyond` are (#263).
  byRoad: [
    {
      stations: ['67004', '67007', '67009', '67010', '67011', '67013', '67014', '67015', '67016', '67017', '67018', '67019', '67020', '67021', '67100', '67101', '67103', '67105', '67107', '67113', '67200', '67203', '67205', '67206', '67207', '67208', '67215'].map((id) => `adif:${id}`),
      source: 'https://www.grupo.renfe.com/es/es/sala-de-prensa/avisos/2026/febrero/pat-zaragoza-teruel-sagunto-y-c5-valencia',
    },
    { stations: ['adif:50207', 'adif:03100', 'adif:56004', 'adif:56009', 'adif:56100'], source: 'https://www.horajaen.com/2026/09/07/renfe-autobuses-alternativos-jaen-linares-baeza/' },
    { stations: ['adif:03100', 'adif:50403', 'adif:50407'], source: 'https://andaluciainforma.eldiario.es/?p=34775' },
    { stations: ['adif:40122', 'adif:40115'], source: 'AVISO_512188' },
    // Granada–Almería's MD 13940 to 13957, 37087 and 37366, kept to Huércal-Viator, as AVE y Larga
    // Distancia's Alvias are (#792).
    ALMERIA_BY_ROAD,
  ],
};

/**
 * Ouigo's timetable on NAP, file 1766, a MERITS export, which is all Ouigo publishes: no live data
 * (ADR-0010). The Mobility Database's keyless mirror of it, mdb-2785, was byte-identical on 4 Oct 2026,
 * and the tests read it (fixtures/ouigo), but the build reads NAP's, as its licence asks for the data
 * "siempre actualizada" (#264).
 */
const OUIGO_TIMETABLE = 'https://nap.transportes.gob.es/api/Fichero/downloadLink/1766';

export const OUIGO: NetworkConfig = {
  id: 'ouigo',
  name: 'Ouigo',
  // Built and loaded with AVE y Larga Distancia, at every view, as its Trains show at every zoom (ADR-0010,
  // ADR-0014), but left out where its timetable can't be read, nor its copy, rather than fail that region.
  region: EVERYWHERE,
  optional: true,
  // AVE's, as it runs on the same high-speed lines, at 300 km/h (AVE y Larga Distancia's `profiles`).
  profile: { acceleration: 0.5, braking: 0.5, topSpeed: 300 / 3.6, dwell: 30 },
  runningSide: 'right',
  // Ouigo's pink, its logo's (#264): AVE y Larga Distancia's purple is Renfe's rather than the magenta of
  // Renfe's AVE map so that the two can be told apart (#262).
  colour: '#E50A70',
  // Its Trains are drawn at every zoom, as AVE y Larga Distancia's are (ADR-0010).
  pillZoom: 7,
  rails: { railway: ['rail'] },
  timetables: [
    {
      url: OUIGO_TIMETABLE,
      // NAP's dataset Ouigo, 1515, has the one file, 1766.
      nap: { dataset: 1515 },
      prefix: 'ouigo',
      operator: 'adif',
      // Its stops are Adif's Stations after UIC's 0071, as 007160000 is Madrid-Puerta de Atocha, 60000.
      // Their stop_timezone is Europe/Amsterdam, and its agency's Europe/Paris, both Madrid's offset, so its
      // times are read as Madrid's, as every timetable's are.
      stopPrefix: '0071',
      // A Trip's trip_short_name is "TGV" and its Train number, as TGV 6477.
      number: '\\d+',
      shortNames: true,
      // It has no shapes.txt.
      shapeless: true,
      updated: 'nap',
    },
  ],
  // As NAP's licence asks (nap.transportes.gob.es/licencia-datos): "Powered by MITRAMS", linking the
  // ministry, whether the data is raw or processed ("explotados", as the map's are), the licence, and
  // the day NAP last updated the file.
  credit: { text: 'Powered by MITRAMS (datos explotados)', url: 'https://www.transportes.gob.es/', licence: 'LDA MITRAMS' },
  lines: {
    kind: 'long-distance',
    // Its timetable names every route TGV, route type 101, high-speed rail: its one Line is OUIGO.
    names: { TGV: 'OUIGO' },
    colour: '#E50A70',
    gauges: { OUIGO: STANDARD },
  },
};

/** The Networks of Renfe's long-distance timetable, whose routes they take between them by name (#401). */
export const LONG_DISTANCE = [AVE_LARGA_DISTANCIA, MEDIA_DISTANCIA_AVANT];

/**
 * Every Network, in the order the bundle lists them, which is the order below zoom 7 draws their track
 * in, each over those before it: the file below zoom 7 has each region's Network tracks, and each
 * region's own, in this order (zoomedOut(), #262). So AVE y Larga Distancia is last, its track over every
 * other Network's, and its region, built last, finds every Train a Network before it lists too
 * (unlisted()). Media Distancia y Avant goes before it, its track under AVE y Larga Distancia's and over
 * the Cercanías Networks' and Catalonia's (#263), and Ouigo, in AVE y Larga Distancia's region, between
 * them, its track under AVE y Larga Distancia's (#264). A Station two Networks list is the first's, but
 * for a Scheduled-only Network's, as Ouigo's, which goes after any other's (stationsOf()).
 */
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
  EUSKOTREN,
  MEDIA_DISTANCIA_AVANT,
  OUIGO,
  AVE_LARGA_DISTANCIA,
];

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
  /**
   * Its operator's Alerts, where the fetcher reads them, as GTFS-RT in JSON (ADR-0012): where they are,
   * how often they're fetched, in ms, by Network the language of an Alert's second entry, where its
   * feed tags it as the first, though it's in another (`secondEntry`), and which Lines an Alert that
   * names one the bundle has none of is shown on (`lines`).
   */
  alerts?: {
    url: string;
    every: number;
    /**
     * The language the second entry of an Alert's words is in, by the ID of the Network its Lines are
     * of, where its feed tags it as it does the first, es, as Renfe tags every entry. Only an Alert that
     * names Lines has a Network: one on a Station alone, as a stop_id doesn't say its núcleo, is kept as
     * the feed tags it, and so is one on Lines of Networks this gives different languages, or none.
     * ponytail: every Alert of a Network with a second entry is taken to give it so, though Murcia's one
     * repeats its Spanish and one of San Sebastián's has a blank second: a Network that mixes them would
     * need a check that the second has words of its own.
     */
    secondEntry?: Record<string, string>;
    /**
     * Where an Alert that names a Line the bundle has none of is shown, by the ID of the Network the
     * Line is of, then the Line's name as the feed gives it, then the names of the Lines it's shown on
     * instead, as Renfe names Madrid's C8, whose Trips its timetable runs as C8a and C8b (#359). A
     * name that isn't listed stays as the feed gives it: the bundle's Line of that name shows the
     * Alert, and where it has none, as for Madrid's C9, Valencia's C5 and Murcia–Alicante's C2, which
     * only buses run, the Alert is shown nowhere.
     * ponytail: it replaces the name, so a Line that gets Trips under it needs it in its own list.
     * ponytail: an Alert that names a listed Line is shown on all it's listed as, though Madrid's
     * AVISO_517064 is tagged "#MadC8b" and C8a doesn't run to Cercedilla: telling a branch's Alerts
     * apart takes reading their words.
     */
    lines?: Record<string, Record<string, string[]>>;
  };
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
  /**
   * GTFS-RT's trip updates, as protocol buffers, as Euskotren's: their Trips' Network is by the start of
   * each Trip's route_id, and a Trip that isn't running when the file was written, as most it lists
   * haven't started yet, gets no report.
   */
  | {
      format: 'gtfs-rt';
      urls: { updates: string };
      /** The Station each of its stops is at, as the bundle names it: the stop_ids this matches, made over by String's replace(). */
      stations: [RegExp, string];
    }
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
    // unchanged, as it was for hours on 7 October 2026 (docs/research/alerts.md). It tags every entry
    // es, but Rodalies' Alerts give their second in Catalan and Valencia's in Valencian, both ca: the
    // page picks an entry by the viewer's language as it's tagged, and the interface has no Valencian.
    // Bilbao's and San Sebastián's give Basque and Spanish in one entry, which no tag can split.
    // It names Lines that have no Trips of their own (docs/research/alerts.md). `lines` says where an
    // Alert on Madrid's C8, whose Trips its timetable runs as C8a and C8b, and on Rodalies' R3a, as R3,
    // is shown. Not Madrid's C9, Valencia's C5 and Murcia–Alicante's C2, which only buses run, nor
    // Bilbao's C4A, whose run to Karrantza has no Trips in its timetable of 10 Oct 2026 and which no
    // Alert of its file of 7 Oct names without C4: they stay as named, on no Line of theirs.
    alerts: {
      url: 'https://gtfsrt.renfe.com/alerts.json',
      every: 20_000,
      secondEntry: { [RODALIES.id]: 'ca', [CERCANIAS_VALENCIA.id]: 'ca' },
      lines: { [CERCANIAS_MADRID.id]: { C8: ['C8a', 'C8b'] }, [RODALIES.id]: { R3a: ['R3'] } },
    },
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
    // A Train number starts with neither, so the step sends none of its Trains to these: they're the
    // Networks its freshness is given to, as the engine finds each Train's Trip, and the Trip its
    // SKIPPED Stations are kept for by number (#426), in any Network.
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
  {
    // Euskotren's trip updates, on Moveuskadi, with no rate limit stated, which have its trams' and the
    // funicular's too: only its trains' routes are its Network's (EUSKOTREN). Its positions file is empty.
    id: 'euskotren',
    format: 'gtfs-rt',
    urls: { updates: `${MOVEUSKADI}/gtfsrt_euskotren_trip_updates.pb` },
    // Its stops are platforms, each of a StopPlace, as its timetable has them (EUSKOTREN's `parents`):
    // ES:Euskotren:Quay:2597_Plataforma_Q1: is at ES:Euskotren:StopPlace:2597:, euskotren:2597: in the bundle.
    stations: [/^ES:Euskotren:Quay:(\d+)_.*$/, 'euskotren:$1:'],
    // Every sixth run: its header moves every 2 minutes exactly (4 October 2026), so a try sooner would
    // find it not updated since, and fail, as every other one would every third run.
    every: 120_000,
    // Its trains' routes: E1, E2, E3, E3a, E4 and FCC.
    networks: Object.fromEntries(['11', '12', '8', '44', '10', 'Inf-56'].map((line) => [`ES:Euskotren:Line:${line}:`, EUSKOTREN.id])),
  },
];
