import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { ALERTS_START, readAlerts } from '../fetcher/alerts.ts';
import { APART, atZoom, BANDS, beside, DEGREE, inBand, onStroke, pixelMetres, zones, type Alert, type Alerts, type Bundle, type Line, type Shape, type Stroke } from '../bundle.ts';
import { parseLine } from '../build/gtfs.ts';
import { sideBySide } from '../build/sideBySide.ts';
import { joinDays } from '../engine.ts';
import { inNameOrder } from './cards.ts';
import { closureKey, closureStrokes, closuresAt, hiding, liftedSince, placeOn, stretchesIn, tappedRows, type Shown } from './closures.ts';

/** Some of Rodalies' and TRAM's Stations, as the bundle names them. */
const R1 = [
  { id: 'adif:72305', name: "L'Hospitalet de Llobregat" },
  { id: 'adif:79606', name: 'Blanes' },
  { id: 'adif:79607', name: 'Tordera' },
  { id: 'adif:79200', name: 'Maçanet-Massanes' },
];

test("finds the stretches in Renfe's Spanish, each with what the words before it say of it", () => {
  // AVISO_518348, 7 Oct 2026: R1's Trains run to Blanes, and buses on to Maçanet-Massanes.
  const text = "Circulación ferroviaria entre L'Hospitalet de Llobregat y Blanes fuera de su horario habitual. Se establece un servicio alternativo por carretera entre Blanes y Maçanet-Massanes";
  expect(stretchesIn(text, R1)).toEqual([
    { stations: ['adif:72305', 'adif:79606'], says: 'running' },
    { stations: ['adif:79606', 'adif:79200'], says: 'closed' },
  ]);
});

test("joins a stretch's Stations with a dash too, and finds a Station's whole name within a longer one", () => {
  // AVISO_518337: R3's Trains run from La Garriga, and buses run between Ripoll and Puigcerdà, and
  // between Fabra i Puig and Puigcerdà, joined by a Catalan "i" with no "entre" of its own to read.
  const R3 = [
    { id: 'adif:77102', name: 'La Garriga' },
    { id: 'adif:77200', name: 'Ripoll' },
    { id: 'adif:77309', name: 'Puigcerdà' },
  ];
  const text = 'Circulación ferroviaria entre La Garriga - Puigcerdà/La Tor de Querol con afectaciones. Servicio alternativo por carretera entre Ripoll - Puigcerdà i Fabra i Puig - Puigcerdà.';
  expect(stretchesIn(text, R3)).toEqual([
    { stations: ['adif:77102', 'adif:77309'], says: 'running' },
    { stations: ['adif:77200', 'adif:77309'], says: 'closed' },
  ]);
});

test('reads a single track, and leaves a stretch whose Station is none of the Line\'s', () => {
  // AVISO_518332: R2's Trains run on one track to Cunit, and R2 doesn't call at Estació de França.
  const R2 = [
    { id: 'adif:71600', name: 'Sant Vicenç de Calders' },
    { id: 'adif:71603', name: 'Cunit' },
  ];
  const text =
    'Circulación por vía única entre Sant Vicenç de Calders y Cunit por una incidencia en la infraestructura derivada de las intensas lluvias de ayer. Se mantiene el servicio ferroviario entre Cunit y Barcelona Estació de França.';
  expect(stretchesIn(text, R2)).toEqual([{ stations: ['adif:71600', 'adif:71603'], says: 'single' }]);
});

/** Made up, on Rodalies' Stations: some with their names cut or joined otherwise than the bundle has them. */
const MADE_UP = [
  ...R1,
  { id: 'adif:79009', name: 'Barcelona-El Clot' },
  { id: 'adif:78802', name: 'Fabra i Puig' },
  { id: 'adif:71700', name: 'Vilanova i la Geltrú' },
  { id: 'adif:71701', name: 'Sitges' },
  { id: 'adif:77102', name: 'La Garriga' },
];

test("matches a name within a Station's name, where it's within one Station's only, and a Station's name with a joining word in it", () => {
  const stations = MADE_UP;
  expect(stretchesIn('Servicio alternativo por carretera entre Blanes y Maçanet.', stations)).toEqual([{ stations: ['adif:79606', 'adif:79200'], says: 'closed' }]);
  expect(stretchesIn('Circulación interrumpida entre Fabra i Puig y El Clot.', stations)).toEqual([{ stations: ['adif:78802', 'adif:79009'], says: 'closed' }]);
  expect(stretchesIn('Circulación por vía única entre Vilanova i la Geltrú e Sitges.', stations)).toEqual([{ stations: ['adif:71700', 'adif:71701'], says: 'single' }]);
  // "la" is within two of their names, and too short to tell.
  expect(stretchesIn('Servicio alternativo por carretera entre Blanes y la estación.', stations)).toEqual([]);
  // "Sant Vicenç" is within two of their names, so it's neither's, nor Sant Celoni's, whose name holds
  // only "Sant" of it.
  const sants = [...stations, { id: 'adif:79104', name: 'Sant Celoni' }, { id: 'adif:71600', name: 'Sant Vicenç de Calders' }, { id: 'adif:78604', name: 'Sant Vicenç de Castellet' }];
  expect(stretchesIn('Servicio alternativo por carretera entre Blanes y Sant Vicenç.', sants)).toEqual([]);
});

test('finds stretches "de X a Y" and "desde X hasta Y", and one whose words say nothing of it, with nothing said', () => {
  expect(stretchesIn('No presta servicio de Blanes a Tordera.', R1)).toEqual([{ stations: ['adif:79606', 'adif:79607'], says: 'closed' }]);
  expect(stretchesIn('Servicio alternativo por carretera desde Tordera hasta Maçanet-Massanes.', R1)).toEqual([{ stations: ['adif:79607', 'adif:79200'], says: 'closed' }]);
  expect(stretchesIn('Obras entre Blanes y Tordera.', R1)).toEqual([{ stations: ['adif:79606', 'adif:79607'] }]);
});

test("reads the words that say what a stretch is from those last before it in its clause", () => {
  const text = "Se mantiene el servicio entre L'Hospitalet de Llobregat y Blanes, y servicio alternativo por carretera entre Blanes y Maçanet-Massanes. Entre Tordera y Blanes, circulación interrumpida.";
  expect(stretchesIn(text, R1)).toEqual([
    { stations: ['adif:72305', 'adif:79606'], says: 'running' },
    { stations: ['adif:79606', 'adif:79200'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79606'] },
  ]);
  // A clause with none of those words says nothing of its stretch, though one before it does.
  expect(stretchesIn('Servicio alternativo por carretera entre Blanes y Maçanet-Massanes, y con normalidad entre Tordera y Blanes.', R1)).toEqual([
    { stations: ['adif:79606', 'adif:79200'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79606'] },
  ]);
});

test('goes on with what a clause says into the next, after a comma, where that has only a "y" before its stretch, and not where it has none, or words of its own, or after a full stop (#396)', () => {
  // Made up, on R1's words of 7 Oct (AVISO_518348), as none of the Alerts recorded has a comma there.
  const buses = 'Se establece un servicio alternativo por carretera entre Blanes y Tordera';
  expect(stretchesIn(`${buses}, y entre Tordera y Maçanet-Massanes.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'], says: 'closed' },
  ]);
  // Each after the one before it, whatever they say, but not after a comma alone.
  expect(stretchesIn("Se mantiene el servicio entre L'Hospitalet de Llobregat y Blanes, y entre Blanes y Tordera, y entre Tordera y Maçanet-Massanes.", R1)).toEqual([
    { stations: ['adif:72305', 'adif:79606'], says: 'running' },
    { stations: ['adif:79606', 'adif:79607'], says: 'running' },
    { stations: ['adif:79607', 'adif:79200'], says: 'running' },
  ]);
  expect(stretchesIn(`${buses}, entre Tordera y Maçanet-Massanes.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'] },
  ]);
  // Words of its own say their own, and none of the words that say what it is leave it saying nothing.
  expect(stretchesIn(`${buses}, y se mantiene el servicio entre Tordera y Maçanet-Massanes.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'], says: 'running' },
  ]);
  expect(stretchesIn(`${buses}, y con normalidad entre Tordera y Maçanet-Massanes.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'] },
  ]);
  // A full stop ends it: Sevilla's C3 has its plan, and in the next sentence the Trains that run beside it.
  expect(stretchesIn(`${buses}. Entre Tordera y Maçanet-Massanes el recorrido se realiza con trenes.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'] },
  ]);
  // Words of its own say their own after its stretch too, and those before an opening word that isn't its first.
  expect(stretchesIn(`${buses}, y entre Tordera y Maçanet-Massanes se mantiene el servicio.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'] },
  ]);
  expect(stretchesIn('Entre Blanes y Tordera queda interrumpida la circulación, y entre Tordera y Maçanet-Massanes se mantiene el servicio.', R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'] },
    { stations: ['adif:79607', 'adif:79200'] },
  ]);
  expect(stretchesIn(`${buses}, y de forma normal entre Tordera y Maçanet-Massanes.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'] },
  ]);
  // So does a semicolon, and a clause that says nothing between, though a comma ends both.
  expect(stretchesIn(`${buses}; y entre Tordera y Maçanet-Massanes, y entre Maçanet-Massanes y L'Hospitalet de Llobregat.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'] },
    { stations: ['adif:79200', 'adif:72305'] },
  ]);
  expect(stretchesIn(`${buses}, con normalidad, y entre Tordera y Maçanet-Massanes.`, R1)).toEqual([
    { stations: ['adif:79606', 'adif:79607'], says: 'closed' },
    { stations: ['adif:79607', 'adif:79200'] },
  ]);
});

test('opens a stretch only at its opening words, not at one every object has a property of, as "constructor"', () => {
  expect(stretchesIn('Obras del constructor Blanes entre Blanes y Tordera.', R1)).toEqual([{ stations: ['adif:79606', 'adif:79607'] }]);
});

test("finds the stretches in TRAM's Catalan and English", () => {
  const T1 = [
    { id: 'tram:ST-172', name: 'Francesc Macià' },
    { id: 'tram:ST-188', name: 'Montesa' },
  ];
  // sc-280's words, in TRAM's Catalan, and its English.
  expect(stretchesIn('Els dies 10, 11 i 12 d’octubre, per obres de renovació de via, sense servei entre Francesc Macià i Montesa.', T1)).toEqual([{ stations: ['tram:ST-172', 'tram:ST-188'], says: 'closed' }]);
  expect(stretchesIn('On October 10, 11 and 12, due to track renewal works, there will be no service between Francesc Macià and Montesa.', T1)).toEqual([{ stations: ['tram:ST-172', 'tram:ST-188'], says: 'closed' }]);
});

test('goes on after a comma with TRAM\'s own "i" and English "and" as with Renfe\'s "y" (#396)', () => {
  const T = [
    { id: 'tram:ST-172', name: 'Francesc Macià' },
    { id: 'tram:ST-188', name: 'Montesa' },
    { id: 'tram:ST-206', name: 'Glòries' },
    { id: 'tram:ST-208', name: 'Can Jaumandreu' },
  ];
  // Made up, on sc-280's and sc-279's words, as none of TRAM's has a comma there.
  const closed: { stations: [string, string]; says: 'closed' }[] = [
    { stations: ['tram:ST-172', 'tram:ST-188'], says: 'closed' },
    { stations: ['tram:ST-206', 'tram:ST-208'], says: 'closed' },
  ];
  expect(stretchesIn('Sense servei entre Francesc Macià i Montesa, i entre Glòries i Can Jaumandreu.', T)).toEqual(closed);
  expect(stretchesIn('There will be no service between Francesc Macià and Montesa, and between Glòries and Can Jaumandreu.', T)).toEqual(closed);
});

/**
 * alerts.json as the fetcher wrote it at 23:20 on Friday 9 October 2026, as it was: 68 of Renfe's
 * Alerts across Spain and 3 of TRAM's (#396). And the Stations of the Networks those Alerts are of that
 * any of their words could name, as 10 Oct's bundle names them: no other Station can be read from them.
 */
const NIGHT: Alerts = JSON.parse(readFileSync(new URL('../fetcher/fixtures/alerts/alerts-2026-10-09.json', import.meta.url), 'utf8'));
const NIGHT_STATIONS: { id: string; name: string; networks: string[] }[] = JSON.parse(readFileSync(new URL('../fetcher/fixtures/alerts/stations-2026-10-09.json', import.meta.url), 'utf8'));
/** What an Alert of that file says in the language its feed gives first, which is what the reader reads. */
const said = (id: string) =>
  Object.values(NIGHT)
    .flatMap((feed) => feed.alerts)
    .find((a) => a.id === id)?.description[0]?.text ?? '';
const stationsOf = (network: string) => NIGHT_STATIONS.filter((s) => s.networks.includes(network));
/** The Lines those Alerts are on, with their Networks, as a bundle of that day would name them. */
const NIGHT_LINES = [...new Set(Object.values(NIGHT).flatMap((feed) => feed.alerts.flatMap((a) => a.lines)))].map((id) => ({ id, network: id.split(':')[0] ?? '' }));

test("reads Sevilla's C3 plan, 'entre las estaciones de X y Y' under 'Plan Alternativo de Transporte por carretera', as closed, and the sentence after it, that Trains run, as nothing (#396)", () => {
  // AVISO_512188, since 8 Sep 2026: "Se establece un Plan Alternativo de Transporte por carretera entre las
  // estaciones de Los Rosales y Cazalla-Constantina. Entre Los Rosales y Sevilla Santa Justa el recorrido
  // se realiza con trenes de la línea C1."
  expect(stretchesIn(said('AVISO_512188'), stationsOf('cercanias-sevilla'))).toEqual([
    { stations: ['adif:50700', 'adif:40113'], says: 'closed' },
    // Its words come after its stretch, which the reader doesn't read.
    { stations: ['adif:50700', 'adif:51003'] },
  ]);
  // The same with a comma where Renfe has its full stop: the Trains that run are still not its plan's.
  const joined = said('AVISO_512188').replace('.\r\nEntre', ', y entre');
  expect(joined).not.toBe(said('AVISO_512188'));
  expect(stretchesIn(joined, stationsOf('cercanias-sevilla'))).toEqual([
    { stations: ['adif:50700', 'adif:40113'], says: 'closed' },
    { stations: ['adif:50700', 'adif:51003'] },
  ]);
});

test("reads TRAM's \"Servei alternatiu entre X i Y\" as closed, its \"Estació de Sant Adrià\" as the bundle's \"Estació St.Adrià\", and its Line's \"no donarà servei\" as no stretch (#396)", () => {
  // sc-286, for 14 and 15 Oct 7:30–14:30: "…la línia T6 no donarà servei per tasques de manteniment de l’arbrat
  // a la Rambla de la Mina. Es reforçarà el servei de la línia T5. Servei alternatiu entre Estació de Sant
  // Adrià i Parc del Besòs: Bus H14." It names T6 in the first sentence, and its stretch in the last.
  expect(stretchesIn(said('sc-286'), stationsOf('tram'))).toEqual([{ stations: ['tram:ST-229', 'tram:ST-213'], says: 'closed' }]);
});

test("matches a Station's name without or with link words its Alert has or hasn't, as Adif's \"València-La Font de Sant Lluís\" is Renfe's \"Valencia Font de Sant Lluis\", and reads \"servicio alternativo por autobús\" as closed (#396, #552)", () => {
  // AVISO_512648, Valencia's C3, since 10 Sep 2026: "#LÍNEA C3. SERVICIO ALTERNATIVO POR AUTOBÚS entre las estaciones de
  // Valencia Font de Sant Lluis y Valencia Sant Isidre por obras de mejora en la infraestructura desde el 13 de septiembre."
  expect(stretchesIn(said('AVISO_512648'), stationsOf('cercanias-valencia'))).toEqual([{ stations: ['adif:65002', 'adif:66212'], says: 'closed' }]);
  // Its other two words for buses name no stretch: C3's and C5's "SERVICIO POR AUTOBÚS: Plan alternativo de transporte por carretera".
  for (const id of ['AVISO_442947', 'AVISO_470390']) {
    expect(said(id)).toContain('SERVICIO POR AUTOBÚS');
    expect(stretchesIn(said(id), stationsOf('cercanias-valencia'))).toEqual([]);
  }
});

test("reads no stretch in words that name none: Renfe's bare \"Sin servicio ferroviario\", TRAM's \"no donarà servei\", and the streets of Bilbao's Alert (#396)", () => {
  // AVISO_518352, R2's of 7 Oct, and sc-286's first sentence, as it came.
  expect(stretchesIn(said('AVISO_518352'), stationsOf('rodalies'))).toEqual([]);
  expect(stretchesIn(said('sc-286').split('\n')[0] ?? '', stationsOf('tram'))).toEqual([]);
  // INFO_508393: "…el acceso a la estación se realizará por la plaza situada entre Av. Agirre Lehendariak y Calle Fauste."
  expect(stretchesIn(said('INFO_508393'), stationsOf('cercanias-bilbao'))).toEqual([]);
  // Nor do they say what a stretch after them is, which is what keeps them out of the words that do (made up, on theirs).
  expect(stretchesIn('Sin servicio ferroviario entre Blanes y Tordera.', R1)).toEqual([{ stations: ['adif:79606', 'adif:79607'] }]);
  expect(stretchesIn('La línia T6 no donarà servei entre Estació de Sant Adrià i Parc del Besòs.', stationsOf('tram'))).toEqual([{ stations: ['tram:ST-229', 'tram:ST-213'] }]);
});

// alerts.json as the fetcher writes it from Renfe's alerts of 11:39 on Wednesday 7 October 2026, cut
// down to Rodalies' 9, and TRAM's of 12:35 (#339's first comment), read at 12:35.
const recorded = (file: string) => ({ status: 200, body: { text: readFileSync(new URL(`../fetcher/fixtures/alerts/${file}`, import.meta.url), 'utf8') } });
const READ = Date.parse('2026-10-07T12:35:22+02:00');
const ALERTS = readAlerts(ALERTS_START, { renfe: { alerts: recorded('renfe.json') }, tram: { 'TBX GtfsRealtimeAlerts': recorded('tram-tbx.json'), 'TBS GtfsRealtimeAlerts': recorded('tram-tbs.json') } }, READ).file ?? {};

/**
 * TRAM's Alerts as the fetcher had them at 23:10 on 10 Oct 2026, read from its two feeds at 23:10:14, as
 * alerts.json holds them (#397): sc-280 listed again for the works' own days, from 03:05 on 10 Oct to
 * 01:00 on 13 Oct, in the place of sc-287 of 9 Oct, which ended at 03:00; sc-286, and sc-279.
 */
const TRAM_10: Alerts = JSON.parse(readFileSync(new URL('../fetcher/fixtures/alerts/tram-2026-10-10.json', import.meta.url), 'utf8'));

/**
 * TRAM's Trips of T1–T3, T5 and T6 on 7, 9, 10, 11 and 12 Oct 2026 and 14 Oct, by service day, cut to
 * each Trip's first and last calls and its calls at the six Stations TRAM's Alerts name, as the daily
 * build had them (#397): the day files the CDN served on 7, 9, 10 and 11 Oct, a dry run of main on
 * 10 Oct at 15:34 for 12 Oct, and for 14 Oct, whose file the build hadn't made yet, TRAM's two
 * timetables of 10 Oct as the build reads them (readFeed(): TBS's service 2001, which has no T6 Trip
 * from 07:36 to 14:20, and 35 more of T5's), whose Trips for 10–12 Oct are the day files' to the second.
 */
const TRAM_TRIPS: Record<string, { noonMinus12h: number; trips: { line: string; calls: { station: string; arrival: number; departure: number }[] }[] }> = JSON.parse(
  gunzipSync(readFileSync(new URL('../fixtures/tram-trips-2026-10.json.gz', import.meta.url))).toString(),
);

/**
 * 7 Oct's service day, with no Closures of its own: Rodalies' and TRAM's Lines the Alerts name, and
 * some of their Stations, by the Networks whose Trains stop there, as the bundle names them, and TRAM's
 * Trips of that day, which run across Francesc Macià – Montesa.
 */
const DAY = {
  noonMinus12h: Date.parse('2026-10-07T00:00:00+02:00'),
  closures: [],
  trips: TRAM_TRIPS['2026-10-07']?.trips ?? [],
  lines: [
    ...['R1', 'R2', 'R2S', 'R3', 'R4', 'R8', 'R13'].map((name) => ({ id: `rodalies:${name}`, network: 'rodalies' })),
    ...['T1', 'T2', 'T3', 'T5', 'T6'].map((name) => ({ id: `tram:${name}`, network: 'tram' })),
  ],
  stations: [
    ...[
      ...R1,
      { id: 'adif:71600', name: 'Sant Vicenç de Calders' },
      { id: 'adif:71603', name: 'Cunit' },
      { id: 'adif:79400', name: 'Barcelona Estació de França' },
      { id: 'adif:77102', name: 'La Garriga' },
      { id: 'adif:77200', name: 'Ripoll' },
      { id: 'adif:77309', name: 'Puigcerdà' },
      { id: 'adif:78802', name: 'Barcelona Fabra i Puig' },
      { id: 'adif:73100', name: 'La Plana-Picamoixons' },
      { id: 'adif:73003', name: 'Les Borges Blanques' },
    ].map((s) => ({ ...s, networks: ['rodalies'] })),
    ...[
      { id: 'tram:ST-172', name: 'Francesc Macià' },
      { id: 'tram:ST-188', name: 'Montesa' },
      { id: 'tram:ST-206', name: 'Glòries' },
      { id: 'tram:ST-208', name: 'Can Jaumandreu' },
    ].map((s) => ({ ...s, networks: ['tram'] })),
    // The Metro's Glòries, another Network's.
    { id: 'tmb:1.130', name: 'Glòries', networks: ['metro'] },
  ],
};

/**
 * Each Station's name by ID as the bundle has it: those of 10 Oct's bundle that the Alerts' words could name
 * (NIGHT_STATIONS), and Renfe's own rows in the build's fixtures, which the bundle takes its names from.
 */
const BUNDLE_NAMES = new Map<string, string>([
  ...NIGHT_STATIONS.map((s) => [s.id, s.name] as [string, string]),
  ...['rodalies', 'rodalies-buses'].flatMap((dir) =>
    readFileSync(new URL(`../build/fixtures/${dir}/stops.txt`, import.meta.url), 'utf8')
      .split('\n')
      .slice(1)
      .filter((row) => row.trim())
      .map((row): [string, string] => {
        const [id = '', name = ''] = parseLine(row);
        return [`adif:${id}`, name];
      }),
  ),
]);

test("gives each Station of DAY, R1's among them, the ID and the name the bundle has, and each made-up one an ID whose name has its own within it, so that a test that copies a wrong ID fails here (#554)", () => {
  // Names only are read, so a wrong ID passes the tests that expect it back, and only this tells it. Neither
  // of those two sources has Tordera (adif:79607) or the Metro's Glòries, which the bundle has as tmb:1.130:
  // the Stations of either list that they lack are those two, so that a third fails here.
  const given = DAY.stations;
  expect([...new Set([...given, ...MADE_UP].filter((s) => !BUNDLE_NAMES.has(s.id)).map((s) => s.id))]).toEqual(['adif:79607', 'tmb:1.130']);
  for (const s of given) expect([s.id, s.name]).toEqual([s.id, BUNDLE_NAMES.get(s.id) ?? s.name]);
  // A made-up name is the bundle's cut, or joined otherwise: its words are within the bundle's name.
  const plain = (name: string) => name.toLowerCase().replace(/-/g, ' ');
  for (const s of MADE_UP) expect([s.id, plain(BUNDLE_NAMES.get(s.id) ?? s.name)]).toEqual([s.id, expect.stringContaining(plain(s.name))]);
});

/** One of TRAM's service days in the fixture, with DAY's Lines and Stations, as a page that has loaded only that day has it. */
function tramDay(date: string) {
  const day = TRAM_TRIPS[date];
  if (!day) throw new Error(`No fixture of ${date}`);
  return { ...DAY, noonMinus12h: day.noonMinus12h, trips: day.trips };
}
/** 10 Oct, the first of the works' days: TRAM's Trips of T1–T3 turn back at Montesa, and it's noon (12:00), where all of T1–T3's, T5's and T6's have one within the hour. */
const [WORKS, NOON] = [tramDay('2026-10-10'), Date.parse('2026-10-10T12:00:00+02:00')];

test("on 7 Oct, closes R1 Blanes – Maçanet-Massanes and R3 Ripoll – Puigcerdà, R2 Sant Vicenç de Calders – Cunit to a single track, and TRAM's T5–T6 Glòries – Can Jaumandreu, but not T1–T3 Francesc Macià – Montesa, whose trams ran across it, from their Alerts, newest first (#397)", () => {
  const renfe = (id: string, from: string) => ({ alert: { feed: 'renfe', id, said: expect.any(String) }, from: Date.parse(`2026-10-07T${from}:00+02:00`) });
  const sc279 = { alert: { feed: 'tram', id: 'sc-279', said: expect.any(String) }, from: Date.parse('2026-10-01T02:05:27+02:00') };
  expect(closuresAt(ALERTS, DAY, READ)).toEqual([
    { line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'], kind: 'closed', ...renfe('AVISO_518337', '09:23') },
    { line: 'rodalies:R1', stations: ['adif:79606', 'adif:79200'], kind: 'closed', ...renfe('AVISO_518348', '08:38') },
    { line: 'rodalies:R2', stations: ['adif:71600', 'adif:71603'], kind: 'single', ...renfe('AVISO_518332', '08:30') },
    ...['T5', 'T6'].map((name) => ({ line: `tram:${name}`, stations: ['tram:ST-206', 'tram:ST-208'], kind: 'closed', ...sc279 })),
  ]);
});

test("on 10 Oct, the first of TRAM's works, also closes T1–T3 Francesc Macià – Montesa, from sc-280 as TRAM listed it on 7 Oct, where the day's file turns them back (#397)", () => {
  // Its period then, from 1 Oct 07:00 to 13 Oct 01:00, holds the works' three days.
  const sc280 = { alert: { feed: 'tram', id: 'sc-280', said: expect.any(String) }, from: Date.parse('2026-10-01T07:00:05+02:00') };
  expect(closuresAt(ALERTS, WORKS, NOON).filter((c) => c.alert?.id === 'sc-280')).toEqual(
    ['T2', 'T3', 'T1'].map((name) => ({ line: `tram:${name}`, stations: ['tram:ST-172', 'tram:ST-188'], kind: 'closed', ...sc280 })),
  );
});

test("closes TRAM's T1–T3 from Francesc Macià to Montesa, together, only where the day's timetable turns them back, not for as long as its Alert shows (#397)", () => {
  // Each day's own Alerts: sc-280 as listed on 7 Oct, from 1 Oct 07:00 to 13 Oct 01:00; sc-287, in its place
  // in the file of 9 Oct 23:20, from 1 Oct 05:00 to 10 Oct 03:00; and sc-280 as listed for the works' days.
  // With `turnedBack`, the Trips' calls at Francesc Macià are taken from them, as 10 Oct's don't have them.
  const closed = (alerts: Alerts, date: string, moment: string, turnedBack = false) => {
    const day = tramDay(date);
    const trips = turnedBack ? day.trips.map((t) => ({ ...t, calls: t.calls.filter((c) => c.station !== 'tram:ST-172') })) : day.trips;
    return closuresAt(alerts, { ...day, trips }, Date.parse(moment))
      .filter((c) => c.alert?.id === 'sc-280' || c.alert?.id === 'sc-287')
      .map((c) => c.line.slice('tram:'.length));
  };
  // 7 and 9 Oct: every one of T1–T3's Trips (160 + 154 + 154, and 159 + 166 + 163) calls at both. It's
  // that which keeps their Closures out, not that the fixture has none of their Trips: turned back at
  // Montesa, the same moments have all three.
  for (const [alerts, date] of [[ALERTS, '2026-10-07'], [NIGHT, '2026-10-09']] as const) {
    for (const time of ['04:40', '05:30', '08:15', '12:00', '17:45', '22:00', '23:20']) {
      expect(closed(alerts, date, `${date}T${time}+02:00`)).toEqual([]);
      expect(closed(alerts, date, `${date}T${time}+02:00`, true).toSorted()).toEqual(['T1', 'T2', 'T3']);
    }
  }
  // 10 Oct: T2's 159 and T3's 160 Trips call at Montesa and none at Francesc Macià; T1's 5 (06:42, 06:58, 12:00,
  // 17:03 and 02:27 the next morning) go no further than Montesa. T1 has none within the hour of 05:30 or 09:00,
  // and its Closure is in force with T2's and T3's, as the Alert's Lines' Trips are together.
  for (const time of ['05:30', '09:00', '12:00']) expect(closed(TRAM_10, '2026-10-10', `2026-10-10T${time}:00+02:00`)).toEqual(['T2', 'T3', 'T1']);
  // 11 and 12 Oct: T1's 1 and 2 Trips are all after midnight, at 02:24, and 00:34 and 00:48, and it's in force at noon.
  for (const date of ['2026-10-11', '2026-10-12']) expect(closed(TRAM_10, date, `${date}T12:00:00+02:00`)).toEqual(['T2', 'T3', 'T1']);
  expect(closed(TRAM_10, '2026-10-11', '2026-10-12T02:30:00+02:00')).toEqual(['T2', 'T3', 'T1']);
  // Till its Alert ends, at 01:00:05 on the 13th, though 12 Oct's last Trips run to 00:58.
  expect(closed(TRAM_10, '2026-10-12', '2026-10-13T01:00:05+02:00')).toEqual(['T2', 'T3', 'T1']);
  expect(closed(TRAM_10, '2026-10-12', '2026-10-13T01:00:06+02:00')).toEqual([]);
});

test("doesn't close T6 from Estació St.Adrià to Parc del Besòs, sc-286's stretch, on 9 Oct, where its Alert shows from and every T6 Trip crosses it, nor on 14 Oct, or 15, which TRAM gives the same service, whose timetable has no T6 Trip from 07:36 to 14:20 (#397)", () => {
  // sc-286 as of 9 Oct at 23:20: its period runs from 9 Oct 05:00 to 15 Oct 14:30. With `turnedBack`, the
  // Trips' calls at Parc del Besòs are taken from them, so that none crosses the stretch.
  const on = (date: string, time: string, alert: string, turnedBack = false) => {
    const day = TRAM_TRIPS[date];
    if (!day) throw new Error(`No fixture of ${date}`);
    const trips = turnedBack ? day.trips.map((t) => ({ ...t, calls: t.calls.filter((c) => c.station !== 'tram:ST-213') })) : day.trips;
    const shown = closuresAt(NIGHT, { noonMinus12h: day.noonMinus12h, closures: [], lines: NIGHT_LINES, stations: NIGHT_STATIONS, trips }, Date.parse(`${date}T${time}+02:00`));
    return shown.filter((c) => c.alert?.id === alert).map((c) => c.line);
  };
  // 9 Oct: all of T6's 85 Trips call at both, from 05:44 to 22:35. It's that which keeps the Closure out,
  // not that the fixture has none of them: without their calls at Parc del Besòs, it's in force at the
  // moments one runs within the hour, and not at 23:20, where none does.
  for (const time of ['05:30', '06:00', '12:00', '18:00', '22:00', '22:35', '23:20']) expect(on('2026-10-09', time, 'sc-286')).toEqual([]);
  for (const time of ['05:30', '06:00', '12:00', '18:00', '22:00', '22:35']) expect(on('2026-10-09', time, 'sc-286', true)).toEqual(['tram:T6']);
  expect(on('2026-10-09', '23:20', 'sc-286', true)).toEqual([]);
  // 14 Oct, from TRAM's timetable (service 2001, 15 Oct's too): T6's 50 Trips call at both too, and none runs
  // between 07:36 and 14:20, the hours of the works: from half an hour on from 07:36 to half an hour before
  // 14:20 the Line has none within the hour, and before and after those, those that run cross it, so
  // sc-286's Closure is in force at no moment.
  for (const time of ['05:30', '07:00', '07:36', '07:50', '08:10', '10:00', '12:00', '13:45', '14:05', '14:25', '18:00']) expect(on('2026-10-14', time, 'sc-286')).toEqual([]);
  // That's the gap and the crossing, both: turned back at Parc del Besòs, the same Trips have it in force
  // within the hour of one, until 08:06 and from 13:50, and not in between.
  for (const time of ['05:30', '07:00', '07:36', '07:50', '14:05', '14:25', '18:00']) expect(on('2026-10-14', time, 'sc-286', true)).toEqual(['tram:T6']);
  for (const time of ['08:10', '10:00', '12:00', '13:45']) expect(on('2026-10-14', time, 'sc-286', true)).toEqual([]);
  // sc-279, Glòries – Can Jaumandreu, names T5 and T6, whose Trips run to Can Jaumandreu and no further, and its
  // Closure is T6's with T5's, which run through T6's gap.
  for (const time of ['07:50', '10:00', '14:05']) expect(on('2026-10-14', time, 'sc-279')).toEqual(['tram:T5', 'tram:T6']);
});

test("a TRAM Closure is in force from half an hour before the first of its Alert's Lines' Trips that turn back to half an hour after the last, and not in the night between (#397)", () => {
  // T1–T3's on 10 Oct: the first, T3's, leaves Montesa at 04:55:00 (T2's at 05:00:00, T1's at 06:42), the last, T1's,
  // gets there at 02:37:00 on the 11th (T3's at 02:26:20, T2's at 02:21:30). The three go together.
  const sc280 = ALERTS.tram?.alerts.find((a) => a.id === 'sc-280') as Alert;
  const lines = (time: string, alerts = ALERTS) => closuresAt(alerts, WORKS, Date.parse(time)).filter((c) => c.alert?.id === 'sc-280').map((c) => c.line);
  const all = ['tram:T2', 'tram:T3', 'tram:T1'];
  expect(lines('2026-10-10T04:24:59+02:00')).toEqual([]);
  expect(lines('2026-10-10T04:25:00+02:00')).toEqual(all);
  expect(lines('2026-10-11T03:07:00+02:00')).toEqual(all);
  expect(lines('2026-10-11T03:07:01+02:00')).toEqual([]);
  // Not before the Alert's period begins, or after it ends, whatever the timetable runs: made up, sc-280 with its period cut to 06:00–18:00.
  const cut: Alerts = { tram: { status: 'ok', alerts: [{ ...sc280, from: Date.parse('2026-10-10T06:00:00+02:00'), to: Date.parse('2026-10-10T18:00:00+02:00') }] } };
  // T1 has no Trip within the hour of 06:00 or 18:00 (its are at 06:42 and 17:03), and is in force with T2's and T3's.
  expect(['05:59:59', '06:00:00', '18:00:00', '18:00:01'].map((time) => lines(`2026-10-10T${time}+02:00`, cut))).toEqual([[], all, all, []]);
});

test("a TRAM Closure isn't in force while any one of its Alert's Lines' Trips within the hour calls at both its Stations, though the others turn back, wherever it comes among them, and a Line the Alert doesn't name doesn't decide (#397)", () => {
  // Made up: one of 10 Oct's T2 Trips that runs at noon, with the call at Francesc Macià that the others haven't, before and after them.
  const t2 = WORKS.trips.find((t) => t.line === 'tram:T2' && t.calls[0] && t.calls[0].departure <= 12 * 3600 && (t.calls.at(-1)?.arrival ?? 0) >= 12 * 3600) as (typeof WORKS.trips)[number];
  const first = t2.calls[0] as (typeof t2.calls)[number];
  const crossing = { ...t2, calls: [{ ...first, station: 'tram:ST-172' }, ...t2.calls] };
  const lines = (trips: typeof WORKS.trips, alerts = ALERTS) => closuresAt(alerts, { ...WORKS, trips }, NOON).map((c) => c.line);
  // T2's, T3's and T1's all go, though the rest of their Trips within the hour turn back: the Alert is one.
  const without = ['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T5', 'tram:T6'];
  expect(lines([...WORKS.trips, crossing])).toEqual(without);
  expect(lines([crossing, ...WORKS.trips])).toEqual(without);
  expect(lines(WORKS.trips)).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T2', 'tram:T3', 'tram:T1', 'tram:T5', 'tram:T6']);
  // But not for a Line it doesn't name: made up, sc-280 naming T2 and T3 only, with the crossing Trip T1's.
  const sc280 = ALERTS.tram?.alerts.find((a) => a.id === 'sc-280') as Alert;
  const two: Alerts = { tram: { status: 'ok', alerts: [{ ...sc280, lines: ['tram:T2', 'tram:T3'] }] } };
  expect(lines([...WORKS.trips, { ...crossing, line: 'tram:T1' }], two)).toEqual(['tram:T2', 'tram:T3']);
  expect(lines([...WORKS.trips, crossing], two)).toEqual([]);
});

test("none of TRAM's Closures is in force where the page has none of its Lines' Trips, as where its region's file failed to come, and Renfe's, which read none, are (#397)", () => {
  const lines = (day: typeof WORKS, now: number) => closuresAt(ALERTS, day, now).map((c) => c.line);
  expect(lines({ ...WORKS, trips: [] }, NOON)).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2']);
  expect(lines(WORKS, NOON)).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T2', 'tram:T3', 'tram:T1', 'tram:T5', 'tram:T6']);
});

test("keeps a Renfe Alert's Closure as it was, in force while its Alert is listed, at night and with no Trips of any Line (#397)", () => {
  const r1 = { line: 'rodalies:R1', stations: ['adif:79606', 'adif:79200'], kind: 'closed', alert: { feed: 'renfe', id: 'AVISO_518348', said: expect.any(String) }, from: Date.parse('2026-10-07T08:38:00+02:00') };
  const moments: [typeof DAY, number][] = [
    [DAY, READ],
    [DAY, Date.parse('2026-10-08T03:30:00+02:00')],
    [{ ...DAY, trips: [] }, READ],
    [WORKS, NOON],
  ];
  for (const [day, now] of moments) expect(closuresAt(ALERTS, day, now).filter((c) => c.line === 'rodalies:R1')).toEqual([r1]);
});

test("keeps a TRAM single track within its Alert's period, as its Trains run through it and the timetable can't tell (#397)", () => {
  // Made up, in TRAM's Catalan, on T1's Stations: an Alert that T1 runs on one track between Francesc Macià and Montesa.
  const alert: Alert = {
    id: 'sc-999',
    lines: ['tram:T1'],
    stations: [],
    from: Date.parse('2026-10-07T07:00:00+02:00'),
    description: [{ language: 'ca', text: 'Circulació per via única entre Francesc Macià i Montesa.' }],
  };
  const single = closuresAt({ tram: { status: 'ok', alerts: [alert] } }, DAY, READ);
  expect(single).toEqual([{ line: 'tram:T1', stations: ['tram:ST-172', 'tram:ST-188'], kind: 'single', alert: { feed: 'tram', id: 'sc-999', said: expect.any(String) }, from: alert.from }]);
});

test("goes by the day before's Trips that still run after midnight, on the new day's clock, as the days the map has joined give them (#397)", () => {
  // Each day's Trips on the last day's clock (joinDays()): 10 Oct's, turned back, run to 02:21 on the 11th.
  const bundle = (date: string): Bundle => {
    const day = TRAM_TRIPS[date];
    if (!day) throw new Error(`No fixture of ${date}`);
    const trips = day.trips.map((t, i) => ({ id: `${date}/${i}`, line: t.line, shape: '', headsign: '', calls: t.calls.map((c) => ({ ...c, dist: 0 })) }));
    return { serviceDay: date, noonMinus12h: day.noonMinus12h, networks: [], lines: [], stations: [], shapes: [], strokes: [], rails: [], slots: [], tracks: [], trips };
  };
  const joined = joinDays([bundle('2026-10-10'), bundle('2026-10-11')]);
  const [both, last] = [{ ...DAY, noonMinus12h: joined.noonMinus12h, trips: joined.trips }, tramDay('2026-10-11')];
  const t2 = (day: ReturnType<typeof tramDay>, time: string) => closuresAt(ALERTS, day, Date.parse(time)).some((c) => c.line === 'tram:T2');
  // 40 minutes after midnight, with only the 11th's Trips there are none around: the day before's are what's running.
  expect(t2(last, '2026-10-11T00:40:00+02:00')).toBe(false);
  expect(t2(both, '2026-10-11T00:40:00+02:00')).toBe(true);
  // Both joined or not, once the day before's have gone, and at noon, where the day before's Trips are a day behind.
  expect(t2(both, '2026-10-11T03:30:00+02:00')).toBe(false);
  expect(t2(both, '2026-10-11T12:00:00+02:00')).toBe(true);
});

test("reads an Alert's words against the Stations of its Lines' Networks, and not another Network's of the same name, as the Metro's Glòries", () => {
  const lines = closuresAt(ALERTS, { ...WORKS, stations: WORKS.stations.filter((s) => s.id !== 'tram:ST-206') }, NOON).map((c) => c.line);
  expect(lines).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T2', 'tram:T3', 'tram:T1']);
});

test("shows a Closure within its Alert's active period: TRAM's from their start to their end, and Renfe's, which have no end, while they're in the file", () => {
  // At noon on the clock of 10 Oct's timetable, where each of TRAM's Lines has Trips within the hour that turn back, whatever the date: these are about the Alerts' periods.
  const lines = (now: string) => closuresAt(ALERTS, { ...WORKS, noonMinus12h: Date.parse(now) - 12 * 3600_000 }, Date.parse(now)).map((c) => c.line);
  // sc-280's period ends at 01:00:05 on 13 Oct; sc-279's runs to 30 April 2027.
  expect(lines('2026-10-13T01:00:05+02:00')).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T2', 'tram:T3', 'tram:T1', 'tram:T5', 'tram:T6']);
  expect(lines('2027-01-13T01:00:06+01:00')).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T5', 'tram:T6']);
  // sc-279's begins at 02:05:27 on 1 Oct, and AVISO_518332 at 08:30 on 7 Oct.
  expect(lines('2026-10-01T02:05:26+02:00')).toEqual([]);
  expect(lines('2026-10-07T08:30:00+02:00')).toEqual(['rodalies:R2', 'tram:T2', 'tram:T3', 'tram:T1', 'tram:T5', 'tram:T6']);
});

test("shows the timetable's Closures on their day from the first bus to the last, and a part an Alert closes too once, with the Alert's words", () => {
  // 9 Oct's: R13's, from 05:33 to 22:41, and made up, one of R3's between Ripoll and Puigcerdà, which AVISO_518337 closes too.
  const day = {
    ...DAY,
    noonMinus12h: Date.parse('2026-10-09T00:00:00+02:00'),
    closures: [
      { line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'] as [string, string], from: 19980, to: 81660, kind: 'buses' as const },
      { line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'] as [string, string], from: 18000, to: 88680, kind: 'buses' as const },
    ],
  };
  const at = (time: string) => closuresAt(ALERTS, day, Date.parse(`2026-10-09T${time}+02:00`)).filter((c) => c.line === 'rodalies:R13' || c.line === 'rodalies:R3');
  expect(at('05:32:59')).toEqual([{ line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'], kind: 'closed', alert: { feed: 'renfe', id: 'AVISO_518337', said: expect.any(String) }, from: Date.parse('2026-10-07T09:23:00+02:00') }]);
  expect(at('05:33:00').map((c) => [c.line, c.alert?.id])).toEqual([
    ['rodalies:R3', 'AVISO_518337'],
    ['rodalies:R13', undefined],
  ]);
  expect(at('22:41:00')[1]).toEqual({ line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'], kind: 'closed', from: Date.parse('2026-10-09T05:33:00+02:00') });
  expect(at('22:41:01').map((c) => c.line)).toEqual(['rodalies:R3']);
  // Without the Alert, the timetable's own, until its last bus, past midnight.
  const timetable = closuresAt({}, day, Date.parse('2026-10-10T00:38:00+02:00'));
  expect(timetable).toEqual([{ line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'], kind: 'closed', from: Date.parse('2026-10-09T05:00:00+02:00') }]);
});

test('a day file built before #340 has no Closures', () => {
  expect(closuresAt({}, { ...DAY, closures: undefined }, READ)).toEqual([]);
});

test("Madrid's AVISO_517064, on C8a and C8b, adds no Closure to the timetable's: C8b's from its replacement buses, once, Villalba de Guadarrama to Cercedilla (#359)", () => {
  // Renfe's six of Madrid's Alerts that name Lines, as the fetcher writes them: AVISO_517064 names C8, which is C8a and C8b.
  const madrid = readAlerts(ALERTS_START, { renfe: { alerts: recorded('renfe-madrid.json') } }, READ).file ?? {};
  const alert = madrid.renfe?.alerts.find((a) => a.id === 'AVISO_517064');
  expect(alert?.lines).toEqual(['cercanias-madrid:C8a', 'cercanias-madrid:C8b']);
  const stations = [
    { id: 'adif:10200', name: 'Villalba de Guadarrama', networks: ['cercanias-madrid'] },
    { id: 'adif:12006', name: 'Cercedilla', networks: ['cercanias-madrid'] },
  ];
  // The Alert's words, "los trenes no prestan servicio entre Villalba de Guadarrama y Cercedilla", name the
  // stretch, but SAYING has "no presta servicio" and not "prestan", so they say nothing of it (no `says`): it's
  // the day the plural is read that this test is for.
  expect(stretchesIn(alert?.description[0]?.text ?? '', stations)).toEqual([{ stations: ['adif:10200', 'adif:12006'] }]);
  // 11 Oct's: C8b's replacement buses, from 06:35 to 24:42, as the build has them (#340). No Closure comes of the Alert for either Line.
  const day = {
    noonMinus12h: Date.parse('2026-10-11T00:00:00+02:00'),
    closures: [{ line: 'cercanias-madrid:C8b', stations: ['adif:10200', 'adif:12006'] as [string, string], from: 23700, to: 88920, kind: 'buses' as const }],
    trips: [],
    lines: ['C8a', 'C8b'].map((name) => ({ id: `cercanias-madrid:${name}`, network: 'cercanias-madrid' })),
    stations,
  };
  expect(closuresAt(madrid, day, Date.parse('2026-10-11T10:00:00+02:00'))).toEqual([
    { line: 'cercanias-madrid:C8b', stations: ['adif:10200', 'adif:12006'], kind: 'closed', from: Date.parse('2026-10-11T06:35:00+02:00') },
  ]);
});

test("an Alert about one Train, or for the Trains to or from a place, makes no Closure of its Line though its words close a stretch, as Sevilla's two C5 Alerts of 7 Oct and its C3 plan for Madrid's do (#396)", () => {
  const sevilla = {
    noonMinus12h: Date.parse('2026-10-09T00:00:00+02:00'),
    closures: [],
    trips: [],
    lines: ['C3', 'C5'].map((name) => ({ id: `cercanias-sevilla:${name}`, network: 'cercanias-sevilla' })),
    stations: stationsOf('cercanias-sevilla'),
  };
  const only = (id: string): Alerts => ({ renfe: { status: 'ok', alerts: NIGHT.renfe?.alerts.filter((a) => a.id === id) ?? [] } });
  // AVISO_518331 and AVISO_518327: "Tren con salida a las 09:27h de la estación de BENACAZÓN y con destino
  // JARDINES DE HÉRCULES, no presta servicio entre las estaciones de SEVILLA SANTA JUSTA y JARDINES DE
  // HERCULES. Los viajeros serán encaminados al siguiente tren de la línea C-5 o C-1 dirección UTRERA."
  // AVISO_512188, since 8 Sep: "Por obras de mejora en la infraestructura y para los trenes con
  // origen/destino Madrid: Se establece un Plan Alternativo de Transporte por carretera entre las
  // estaciones de Los Rosales y Cazalla-Constantina." C3's own Trains ran there on 10 Oct.
  const alerts: [string, [string, string]][] = [
    ['AVISO_518331', ['adif:51003', 'adif:51113']],
    ['AVISO_518327', ['adif:51113', 'adif:51003']],
    ['AVISO_512188', ['adif:50700', 'adif:40113']],
  ];
  for (const [id, stretch] of alerts) {
    // Its words close the stretch, which the reader reads as they say it...
    expect(stretchesIn(said(id), sevilla.stations)).toContainEqual({ stations: stretch, says: 'closed' });
    // ...for those Trains, not its Line's, so the map doesn't draw it.
    expect(closuresAt(only(id), sevilla, Date.parse('2026-10-09T23:20:11+02:00'))).toEqual([]);
  }
});

test("on 9 Oct at 23:20, the file whole, Spain's 68 Renfe Alerts and TRAM's 3, gives the Closures it gave but TRAM's T1–T3, whose trams still ran across theirs that night, and T6's sc-286, which none of T6's ran within the hour of, and San Sebastián's C1 twice, and Valencia's C3 once, and none of Sevilla's C3, C5, Bilbao's streets or elsewhere (#396, #397, #552)", () => {
  const day = { noonMinus12h: Date.parse('2026-10-09T00:00:00+02:00'), closures: [], lines: NIGHT_LINES, stations: NIGHT_STATIONS, trips: TRAM_TRIPS['2026-10-09']?.trips ?? [] };
  const name = new Map(NIGHT_STATIONS.map((s) => [s.id, s.name]));
  const shown = closuresAt(NIGHT, day, Date.parse('2026-10-09T23:20:11+02:00'));
  expect(shown.map((c) => `${c.line} ${c.kind} ${c.stations.map((id) => name.get(id)).join(' – ')} (${c.alert?.id})`)).toEqual([
    // Not TRAM's sc-286, whose Alert shows from 9 Oct for works on 14 and 15 Oct (#397): T6's last Trip of 9 Oct ended at 22:35.
    // As before, from 7 Oct's rains.
    'rodalies:R3 closed Ripoll – Puigcerdà (AVISO_518337)',
    'rodalies:R1 closed Blanes – Maçanet-Massanes (AVISO_518348)',
    'rodalies:R2 single Sant Vicenç de Calders – Cunit (AVISO_518332)',
    // New: "queda interrumpida la circulación entre las estaciones de Brinkola y Zumarraga", of 7 Oct 04:46.
    'cercanias-san-sebastian:C1 closed Brinkola – Zumarraga (AVISO_518303)',
    // Not TRAM's sc-287 for 10–12 Oct, whose period runs to 10 Oct 03:00: 9 Oct's T1–T3 Trips run to 03:12, every one across it.
    // T5's and T6's from Glòries to Can Jaumandreu, which none of their Trips runs, as before: T5's run to 00:26, within the hour, though T6's last was at 22:35.
    'tram:T5 closed Glòries – Can Jaumandreu (sc-279)',
    'tram:T6 closed Glòries – Can Jaumandreu (sc-279)',
    // New: "SERVICIO ALTERNATIVO POR AUTOBÚS entre las estaciones de Valencia Font de Sant Lluis y Valencia Sant Isidre", since 10 Sep (#552).
    'cercanias-valencia:C3 closed València-La Font de Sant Lluís – València-Sant Isidre (AVISO_512648)',
    // New: "se encuentra interrumpida la circulación entre las estaciones de Irun y Hernani", of 14 Aug, which the timetable has too (#340).
    'cercanias-san-sebastian:C1 closed Irun – Hernani (INFO_507703)',
  ]);
});

test("a Closure an Alert closes hides Trains until a Live Train of its Line is seen within it, and then none until its Alert changes, while another Line's on the same Stations still does", () => {
  const lifted = new Map<string, number>();
  const lines = (closures: Shown[]) => closures.map((c) => c.line);
  // On 10 Oct at noon, as T1–T3's Closure is in force then (#397).
  const shown = closuresAt(ALERTS, WORKS, NOON);
  expect(hiding(shown, [], lifted, 0)).toEqual(shown);
  // A T2 tram seen within Francesc Macià – Montesa lifts T2's, and not T1's or T3's there.
  expect(lines(hiding(shown, shown.filter((c) => c.line === 'tram:T2'), lifted, 1000))).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T3', 'tram:T1', 'tram:T5', 'tram:T6']);
  // It stays lifted once the tram has gone, as alerts.json is read again, its Alert unchanged.
  expect(lines(hiding(closuresAt(ALERTS, WORKS, NOON), [], lifted, 2000))).not.toContain('tram:T2');
  // But not once TRAM changes sc-280's period or its words, as by 10 October it had moved its start
  // from 1 October to the works' first day, nor where a new Alert closes that part of T2.
  const tram = (alerts: Alert[]): Alerts => ({ ...ALERTS, tram: { status: 'ok', alerts } });
  const sc280 = ALERTS.tram?.alerts.find((a) => a.id === 'sc-280') as Alert;
  const others = ALERTS.tram?.alerts.filter((a) => a !== sc280) ?? [];
  for (const alerts of [
    [{ ...sc280, from: Date.parse('2026-10-10T03:05:05+02:00') }, ...others],
    [{ ...sc280, description: sc280.description.map((w) => ({ ...w, text: `${w.text} (2)` })) }, ...others],
    [{ ...sc280, id: 'sc-290', from: READ }, sc280, ...others],
  ]) {
    expect(lines(hiding(closuresAt(tram(alerts), WORKS, NOON), [], lifted, 3000))).toContain('tram:T2');
  }
  // The timetable's own, which no Trip of its day runs through, is never lifted.
  const timetable = closuresAt({}, { ...DAY, closures: [{ line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'], from: 0, to: 86400, kind: 'buses' }] }, READ);
  expect(hiding(timetable, timetable, lifted, 4000)).toEqual(timetable);
});

test('a lifted Closure says since when, the first time a Train was seen within it, and an unlifted one or the timetable\'s nothing (#422)', () => {
  const lifted = new Map<string, number>();
  const shown = closuresAt(ALERTS, WORKS, NOON);
  const [t2] = shown.filter((c) => c.line === 'tram:T2');
  const t1 = shown.find((c) => c.line === 'tram:T1') as Shown;
  hiding(shown, [t2 as Shown], lifted, 1000);
  // Seen again later, it keeps the first time.
  hiding(shown, [t2 as Shown], lifted, 5000);
  expect(liftedSince(t2 as Shown, lifted)).toBe(1000);
  expect(liftedSince(t1, lifted)).toBeUndefined();
  const timetable = closuresAt({}, { ...DAY, closures: [{ line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'], from: 0, to: 86400, kind: 'buses' }] }, READ);
  hiding(timetable, timetable, lifted, 6000);
  expect(liftedSince(timetable[0] as Shown, lifted)).toBeUndefined();
  // Not once its Alert has changed.
  expect(liftedSince({ ...(t2 as Shown), alert: { ...(t2 as Shown).alert as NonNullable<Shown['alert']>, said: 'changed' } }, lifted)).toBeUndefined();
});

/** DAY's Lines in the order the cards name them (#399), as the page has them. */
const NAMING = inNameOrder(DAY.lines.map((l) => ({ ...l, name: l.id.split(':')[1] ?? '' }))).map((l) => l.id);

test("a tap on an Alert's Closures names its Lines, and each one's Closure, in the order the cards name Lines, not as the Alert lists them (#399)", () => {
  const shown = closuresAt(ALERTS, WORKS, NOON);
  // TRAM's sc-280 lists T2, T3, T1, as its timetable does.
  expect(shown.filter((c) => c.alert?.id === 'sc-280').map((c) => c.line)).toEqual(['tram:T2', 'tram:T3', 'tram:T1']);
  const rows = tappedRows(shown, shown.map(closureKey), NAMING).filter((r) => r.closure.alert?.id === 'sc-280');
  expect(rows.map((r) => r.on)).toEqual([['tram:T1', 'tram:T2', 'tram:T3']]);
  expect(rows.map((r) => r.all.map((c) => c.line))).toEqual([['tram:T1', 'tram:T2', 'tram:T3']]);
});

test("a tap on Closures of several Alerts has each Alert's row newest first, whatever the order of their Lines (#399)", () => {
  const shown = closuresAt(ALERTS, WORKS, NOON);
  expect(tappedRows(shown, shown.map(closureKey), NAMING).map((r) => r.closure.alert?.id)).toEqual(['AVISO_518337', 'AVISO_518348', 'AVISO_518332', 'sc-280', 'sc-279']);
  // Only the Closures tapped.
  expect(tappedRows(shown, [closureKey(shown[3] as Shown)], NAMING).map((r) => r.on)).toEqual([['tram:T2']]);
});

test("a tap on the timetable's Closures, one row for each part of a Line, names them after the Alerts' in the order of their Lines (#399)", () => {
  // Made up, between two of Rodalies' Stations: buses for R8 and R4, which a timetable lists in that order.
  const buses = (line: string) => ({ line, stations: ['adif:79400', 'adif:77102'] as [string, string], from: 0, to: 86400, kind: 'buses' as const });
  const shown = closuresAt(ALERTS, { ...WORKS, closures: [buses('rodalies:R8'), buses('rodalies:R4')] }, NOON);
  expect(shown.map((c) => c.line).slice(-2)).toEqual(['rodalies:R8', 'rodalies:R4']);
  const rows = tappedRows(shown, shown.map(closureKey), NAMING);
  expect(rows.map((r) => r.on)).toEqual([['rodalies:R3'], ['rodalies:R1'], ['rodalies:R2'], ['tram:T1', 'tram:T2', 'tram:T3'], ['tram:T5', 'tram:T6'], ['rodalies:R4'], ['rodalies:R8']]);
});

/** A shape through points given in metres east and north of 0°, 0°, as a degree is DEGREE metres there both ways. */
const metres = (id: string, ...points: [number, number][]): Shape => {
  let along = 0;
  const dist = points.map(([x, y], i) => (along += Math.hypot(x - (points[i - 1]?.[0] ?? x), y - (points[i - 1]?.[1] ?? y))));
  return { id, coords: points.map(([x, y]) => [x / DEGREE, y / DEGREE]), dist };
};
/** A point given in metres east and north of 0°, 0°. */
const at = (x: number, y: number): [number, number] => [x / DEGREE, y / DEGREE];

test("places a Closure along each of its Line's shapes that passes both its Stations, where they are along it, the shortest way between them first", () => {
  // A Line's four shapes: 10 km east, back west, a loop that leaves it at 2 km and comes back at 6 km, and a long way round, east then back.
  const east = metres('east', [0, 0], [10000, 0]);
  const west = metres('west', [10000, 0], [0, 0]);
  const loop = metres('loop', [0, 0], [2000, 0], [2000, 3000], [6000, 3000], [6000, 0], [10000, 0]);
  const round = metres('round', [0, 0], [3000, 0], [3000, 1000], [9000, 1000], [9000, 0], [5000, 0]);
  // Its Stations at 3 and 5 km, 40 m off the track, where the build puts calls within 300 m.
  const place = (shapes: Shape[]) => placeOn([at(5000, 40), at(3000, -40)], shapes);
  expect(place([loop, west, east])).toEqual([
    { shape: 'west', from: 5000, to: 7000 },
    { shape: 'east', from: 3000, to: 5000 },
  ]);
  // The loop passes both a kilometre away, and the long way round, 12 km from one to the other, is left out.
  expect(place([round, loop, east])).toEqual([{ shape: 'east', from: 3000, to: 5000 }]);
  expect(place([loop])).toEqual([]);
  // A Station 400 m off the track is off it.
  expect(placeOn([at(5000, 40), at(3000, -400)], [east])).toEqual([]);
});

/** A Rodalies Line, in a colour of its own. */
const line = (name: string, ...shapes: string[]): Line => ({ id: name, network: 'rodalies', name, colour: `#${name}`, shapes, kind: 'commuter' });

// Track for the build to draw, in metres east and north of a point in Barcelona, as the build's tests have it.
const [LON, LAT] = [2.17, 41.39];
const COS = Math.cos((LAT * Math.PI) / 180);
/** A shape through corners given in metres, with a point every 10 m between them, as the build's tests draw them. */
function track(id: string, ...corners: [x: number, y: number][]): Shape {
  const points: [number, number][] = corners.slice(0, 1);
  for (const [i, [x, y]] of corners.entries()) {
    const [px, py] = corners[i - 1] ?? [x, y];
    const n = i === 0 ? 0 : Math.max(1, Math.round(Math.hypot(x - px, y - py) / 10));
    for (let k = 1; k <= n; k++) points.push([px + ((x - px) * k) / n, py + ((y - py) * k) / n]);
  }
  let along = 0;
  const dist = points.map(([x, y], i) => Math.round((along += Math.hypot(x - (points[i - 1]?.[0] ?? x), y - (points[i - 1]?.[1] ?? y)))));
  return { id, coords: points.map(([x, y]) => [Math.round((LON + x / (DEGREE * COS)) * 1e5) / 1e5, Math.round((LAT + y / DEGREE) * 1e5) / 1e5]), dist };
}

/**
 * How a Closure along a Line's shape is drawn in each zoom band, with the strokes, slots and
 * centrelines the build draws the Lines with: how far, at most, in metres, it's drawn from the way the
 * Line's Trains go along its stroke between its two Stations (onStroke(), on its middle), and that way
 * from it, each looked at every 2 m, as lines; and the longest gap, in metres along a curve across a
 * node, between the parts of the curve it's drawn on.
 */
async function drawnAlong(lines: Line[], shapes: Shape[], id: string, shape: string, from: number, to: number): Promise<{ off: number; missed: number; gap: number }[]> {
  const { strokes, centrelines, slots } = await sideBySide(lines, shapes);
  const byId = new Map([...shapes, ...centrelines].map((s) => [s.id, s]));
  const [mine, curves] = [slots.filter((s) => s.line === id && s.shape === shape), zones(strokes)];
  const closure = closureStrokes(id, { from, to }, mine, curves);
  const every = (a: number, b: number) => [...Array.from({ length: Math.ceil((b - a) / 2) }, (_, i) => a + 2 * i), b];
  const xy = ([lon, lat]: [number, number]): [number, number] => [(lon - LON) * DEGREE * COS, (lat - LAT) * DEGREE];
  /** How far a point is from a line through these points. */
  const fromLine = ([x, y]: [number, number], line: [number, number][]) =>
    Math.min(...line.slice(1).map(([bx, by], i) => {
      const [ax, ay] = line[i] ?? [bx, by];
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
      return Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y);
    }));
  return BANDS.map((zoom, band) => {
    const width = atZoom(APART, zoom) * pixelMetres(zoom, LAT);
    const mineHere = closure.filter((s: Stroke) => s.band === band);
    const drawn = mineHere.map((s) => every(s.from, s.to).map((d) => xy(beside(inBand(byId, s.shape, band) ?? { coords: [], dist: [] }, d, s.side * width))));
    const way = every(from, to).map((d) => xy(onStroke(mine, byId, d, zoom, 0, curves) ?? [NaN, NaN]));
    const curvesDrawn = [...new Set(mineHere.filter((s) => s.shape.includes('link')).map((s) => s.shape))].map((link) => mineHere.filter((s) => s.shape === link).toSorted((a, b) => a.from - b.from));
    const gaps = curvesDrawn.flatMap((list) => list.flatMap((s, i) => (i ? [s.from - (list[i - 1]?.to ?? s.from)] : [])));
    return {
      off: Math.max(...drawn.flat().map((p) => fromLine(p, way))),
      missed: Math.max(...way.map((p) => Math.min(...drawn.map((line) => (line.length > 1 ? fromLine(p, line) : Math.hypot(p[0] - (line[0]?.[0] ?? 0), p[1] - (line[0]?.[1] ?? 0))))))),
      gap: Math.max(0, ...gaps),
    };
  });
}

test("draws a Closure on its Line's stroke between its two Stations in every zoom band, across a node on the Line's curve, with no gap", async () => {
  // Six Lines share track for 2.5 km; then five turn off north-east, and A goes on alone.
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const shapes = [track('A', [0, 0], [5000, 0]), ...names.slice(1).map((n) => track(n, [0, 0], [2500, 0], [4000, 1500]))];
  const lines = names.map((n) => line(n, n));
  // A's from 1.5 km to 4 km, where it moves over as the others leave it, and B's from 1 km to 3 km along its shape, where it turns off.
  const drawn = [...(await drawnAlong(lines, shapes, 'A', 'A', 1500, 4000)), ...(await drawnAlong(lines, shapes, 'B', 'B', 1000, 3000))];
  for (const [i, { off, missed, gap }] of drawn.entries()) {
    // Within what looking every 2 m leaves room for, or zoomed out, a twentieth of a pixel.
    const near = Math.max(2.5, pixelMetres(BANDS[i % BANDS.length] ?? 0, LAT) / 20);
    expect(off).toBeLessThan(near);
    expect(missed).toBeLessThan(near);
    expect(gap).toBeLessThan(0.01);
  }
  // Drawing six Lines side by side in every band takes about 1.5 s here and over 5 s on CI's runners.
}, 60_000);
