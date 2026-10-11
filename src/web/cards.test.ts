import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import type { AlertFeed, Alerts, Bundle, Call, Line, Trip } from '../bundle.ts';
import type { Pass } from '../engine.ts';
import { ALERTS_START, readAlerts } from '../fetcher/alerts.ts';
import { cardAlerts, inNameOrder, linesCallingAt, linesOnBoard, minutesTo, nearbyRows, progress } from './cards.ts';

/** A time of day in Barcelona on Wednesday 7 Oct 2026, in summer time, in ms since 1970. */
const at = (hours: number, minutes: number, seconds = 0) => Date.UTC(2026, 9, 7, hours - 2, minutes, seconds);
/** 8:12:30. */
const NOW = at(8, 12, 30);

test("counts the minutes to a time as a clock reads them, as a board shows a Train's time", () => {
  // Shown at 8:15, at 8:12.
  expect(minutesTo(at(8, 15, 40), NOW)).toBe(3);
  expect(minutesTo(at(8, 13, 1), NOW)).toBe(1);
  expect(minutesTo(at(9, 12), NOW)).toBe(60);
});

test('a time this minute, or past, is no minutes away', () => {
  expect(minutesTo(at(8, 12, 50), NOW)).toBe(0);
  expect(minutesTo(at(8, 10), NOW)).toBe(0);
});

/** A Train passing nearby on a Line, headed somewhere, at a time of day, Live or Scheduled. */
const pass = (id: string, line: string, headsign: string, when: number, live: boolean, delay?: number): Pass => {
  const trip: Trip = { id, line, shape: line, headsign, calls: [] };
  return { trip, at: when, live, ...(delay !== undefined && { delay }) };
};

test("Nearby has a row for each Line and destination, in the order of each one's next Train, with that Train", () => {
  const passes = [
    pass('a', 'R2S', 'Barcelona Estació de França', at(8, 12, 50), true, 29 * 60),
    pass('b', 'L7', 'Barcelona - Plaça Catalunya', at(8, 14), true, 5 * 60),
    pass('c', 'R2S', 'Barcelona Estació de França', at(8, 16, 10), false),
    pass('d', 'R2S', 'Vilanova i la Geltrú', at(8, 20), true, 0),
  ];
  const rows = nearbyRows(passes, NOW);
  expect(rows.map((row) => row.next.trip.id)).toEqual(['a', 'b', 'd']);
});

test("a row's next three passes count down in minutes, Live or Scheduled, and passes in the same minute count once", () => {
  const passes = [
    pass('a', 'R2S', 'Barcelona Estació de França', at(8, 12, 50), true),
    pass('c', 'R2S', 'Barcelona Estació de França', at(8, 16, 10), false),
    pass('e', 'R2S', 'Barcelona Estació de França', at(8, 16, 40), true),
    pass('f', 'R2S', 'Barcelona Estació de França', at(8, 31), true),
    pass('g', 'R2S', 'Barcelona Estació de França', at(8, 40), true),
  ];
  expect(nearbyRows(passes, NOW)[0]?.passes).toEqual([
    { minutes: 0, live: true },
    { minutes: 4, live: false },
    { minutes: 19, live: true },
  ]);
});

/** A Trip's calls, at Stations these many metres along its shape. */
const calls = (...dists: number[]): Call[] => dists.map((dist, i) => ({ station: `s${i}`, arrival: 60 * i, departure: 60 * i, dist }));

test("a Train's way along its Trip adds up its legs from Station to Station, as far as it's drawn", () => {
  // Between its second and third Stations, with the third and fourth still to leave.
  expect(progress(calls(0, 1000, 3000, 6000), 2000, 2)).toEqual({ done: 2000, length: 6000 });
});

test('a Trip that runs back along its track adds up both ways', () => {
  // Out 4 km and back 1.5 km, and 1 km into its way back.
  expect(progress(calls(0, 4000, 2500), 3000, 1)).toEqual({ done: 5000, length: 5500 });
});

test('a Train at its first Station has gone nowhere, and one with no Station left to leave has gone the whole way', () => {
  expect(progress(calls(0, 1000, 3000), 0, 3).done).toBe(0);
  expect(progress(calls(0, 1000, 3000), 3000, 0).done).toBe(3000);
});

/** A Trip on a Line, calling at these Stations. */
const trip = (line: string, ...stations: string[]): Trip => ({ id: `${line} ${stations.join()}`, line, shape: line, headsign: '', calls: stations.map((station, i) => ({ station, arrival: 60 * i, departure: 60 * i, dist: 1000 * i })) });

test("a board's Lines are those whose Trips call at any of its place's Stations, in the order of the Lines it's given", () => {
  // Sants, Rodalies' and the Metro's Stations, from their Trips.
  const trips = [trip('R2', 'adif:71801', 'adif:71802'), trip('L3', 'tmb:1.326'), trip('R1', 'adif:79400', 'adif:71801'), trip('R4', 'adif:78805'), trip('R2', 'adif:72305', 'adif:71801')];
  expect(linesCallingAt(trips, ['adif:71801', 'tmb:1.326'], ['R1', 'R2', 'R4', 'L3'])).toEqual(['R1', 'R2', 'L3']);
});

/**
 * 25 Sep 2026's recording, whose bundle lists the Lines as their timetables do: Rodalies' R1, R2N, R2S,
 * R2, R3, R4, R8, R7, RL4, R11 …, TRAM's T2, T3, T1 …, and has real Trips of T1, T2 and T3 at Montesa.
 */
const RECORDED: { bundle: Bundle } = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/replay-2026-09-25.json.gz', import.meta.url))).toString());

/** A Network's Lines' names, in the order they come. */
const namesIn = (lines: Pick<Line, 'network' | 'name'>[], network: string) => lines.filter((l) => l.network === network).map((l) => l.name);

test("a Network's Lines are named in the order of their names, digits as numbers, not as its timetable lists them (#399)", () => {
  const { lines } = RECORDED.bundle;
  // As the timetables list them.
  expect(namesIn(lines, 'tram')).toEqual(['T2', 'T3', 'T1', 'T4', 'T5', 'T6']);
  expect(namesIn(lines, 'rodalies').slice(0, 10)).toEqual(['R1', 'R2N', 'R2S', 'R2', 'R3', 'R4', 'R8', 'R7', 'RL4', 'R11']);
  const named = inNameOrder(lines);
  expect(namesIn(named, 'tram')).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
  // R2 before R2N and R2S, R11 after R8, and RL4 after R11 and R16.
  expect(namesIn(named, 'rodalies')).toEqual(['R1', 'R2', 'R2N', 'R2S', 'R3', 'R4', 'R7', 'R8', 'R11', 'R13', 'R14', 'R15', 'R16', 'RG1', 'RL4']);
  expect(namesIn(named, 'fgc')).toEqual(['L6', 'L7', 'L8', 'L12', 'R5', 'R6', 'RL2', 'S1', 'S2', 'S3', 'S4', 'S8']);
  expect(namesIn(named, 'metro')).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L11']);
});

test("Networks stay in the order the track lists them, each one's Lines together, and the track's own order is left alone", () => {
  // With a Line only a later day has, which the days joined put last (joinDays()): made up, as R17 is on 10 Oct.
  const lines = [...RECORDED.bundle.lines, { id: 'rodalies:R17', network: 'rodalies', name: 'R17' }];
  const [before, named] = [lines.map((l) => l.id), inNameOrder(lines)];
  expect(named).toHaveLength(lines.length);
  // Each Network starts one run of Lines, none of its Lines among another's.
  expect(named.flatMap((l, i) => (l.network === named[i - 1]?.network ? [] : [l.network]))).toEqual(['rodalies', 'fgc', 'tram', 'metro']);
  expect(namesIn(named, 'rodalies').slice(-4)).toEqual(['R16', 'R17', 'RG1', 'RL4']);
  expect(lines.map((l) => l.id)).toEqual(before);
});

test("digits count as numbers, and a letter after them sorts after that number and before the next: C4, C4a, C4b, C5 … C8b, C10", () => {
  // Cercanías Madrid's Lines, as 10 Oct 2026's track lists them.
  const madrid = ['C1', 'C10', 'C2', 'C3', 'C4', 'C4a', 'C4b', 'C5', 'C8a', 'C7', 'C8b'].map((name) => ({ network: 'cercanias-madrid', name }));
  expect(inNameOrder(madrid).map((l) => l.name)).toEqual(['C1', 'C2', 'C3', 'C4', 'C4a', 'C4b', 'C5', 'C7', 'C8a', 'C8b', 'C10']);
});

test("a board at Montesa names T1, T2 and T3 in that order, though TRAM's timetable lists them T2, T3, T1 (#399)", () => {
  const { lines, trips } = RECORDED.bundle;
  // tram:ST-188, as 10 Oct's track names Montesa: this recording's bundle has no Stations, but its Trips call at it.
  const montesa = ['tram:ST-188'];
  // Given the track's order, a board names them as it has them.
  expect(linesCallingAt(trips, montesa, lines.map((l) => l.id))).toEqual(['tram:T2', 'tram:T3', 'tram:T1']);
  expect(linesCallingAt(trips, montesa, inNameOrder(lines).map((l) => l.id))).toEqual(['tram:T1', 'tram:T2', 'tram:T3']);
});

/**
 * alerts.json at 8:12 on 7 Oct 2026, cut down: Renfe's Alerts on R3, R2, and R1, R2 and R4 together,
 * read at 8:11, and TRAM's on T1–T3, read at 8:10, each feed's newest first; and one made up, on a
 * lift at Barcelona-Sants, by its Station.
 */
const ALERTS: Alerts = {
  renfe: {
    read: at(8, 11, 40),
    status: 'ok',
    alerts: [
      {
        id: 'AVISO_518337',
        lines: ['rodalies:R3'],
        stations: [],
        from: at(7, 23),
        description: [
          { language: 'es', text: 'Circulación ferroviaria entre La Garriga - Puigcerdà/La Tor de Querol con afectaciones.' },
          { language: 'ca', text: 'Circulació ferroviària entre la Garriga i Puigcerdà/La Tor de Querol amb afectacions.' },
        ],
      },
      {
        id: 'AVISO_518352',
        lines: ['rodalies:R2'],
        stations: [],
        from: at(7, 2),
        description: [
          { language: 'es', text: 'Sin servicio ferroviario.' },
          { language: 'ca', text: 'Sense servei ferroviari.' },
        ],
      },
      { id: 'INFO_SANTS', lines: [], stations: ['adif:71801'], from: at(6, 50), description: [{ language: 'es', text: 'Ascensor de la vía 5 fuera de servicio.' }] },
      {
        id: 'AVISO_518298',
        lines: ['rodalies:R1', 'rodalies:R2', 'rodalies:R4'],
        stations: [],
        from: at(5, 42),
        description: [
          { language: 'es', text: 'Por causas ajenas a Rodalies no se puede garantizar la prestación del servicio.' },
          { language: 'ca', text: 'Per causes alienes a Rodalies no es pot garantir la prestació del servei.' },
        ],
      },
    ],
  },
  tram: {
    read: at(8, 10, 5),
    status: 'ok',
    alerts: [
      {
        id: 'sc-287',
        lines: ['tram:T3', 'tram:T1', 'tram:T2'],
        stations: [],
        from: at(7, 0),
        to: at(23, 0),
        effect: 'MODIFIED_SERVICE',
        header: [
          { language: 'ca', text: 'Afectació T1, T2 i T3' },
          { language: 'es', text: 'Afectación T1, T2 y T3' },
          { language: 'en', text: 'T1, T2 and T3 affected' },
        ],
        description: [
          { language: 'ca', text: 'Sense servei entre Francesc Macià i Montesa.' },
          { language: 'es', text: 'Sin servicio entre Francesc Macià y Montesa.' },
          { language: 'en', text: 'No service between Francesc Macià and Montesa.' },
        ],
      },
    ],
  },
};

test("a followed Train's card has its Line's Alerts, and a board those naming its place's Stations and those of the Lines that call there", () => {
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R2'], stations: [] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518352', 'AVISO_518298']);
  expect(cardAlerts(ALERTS, { lines: ['tram:T1'], stations: [] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['sc-287']);
  // Sants, where R2 and R4 call: an Alert on both of them shows once.
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R2', 'rodalies:R4'], stations: ['adif:71801', 'tmb:1.326'] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518352', 'INFO_SANTS', 'AVISO_518298']);
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R8'], stations: ['adif:79400'] }, 'en', NOW).alerts).toEqual([]);
});

test("a board also names a Line of its Stations' timetable that no Trip of calls that day, where there's an Alert on it, and no other (#392)", () => {
  // Made up, as San Sebastián's on 10 Oct: no Trip calls at Martutene that day, its Lines' timetable does, and both have Alerts.
  const order = ['rodalies:R1', 'rodalies:R2', 'rodalies:R4', 'tram:T1'];
  const martutene = { stations: ['adif:11509'], lines: ['rodalies:R1', 'rodalies:R2'] };
  // R4 has an Alert too, and neither calls nor is in its timetable: no Alert is made up for it.
  expect(linesOnBoard([], martutene, order, ALERTS)).toEqual(['rodalies:R1', 'rodalies:R2']);
  // A Line with no Alert isn't named.
  expect(linesOnBoard([], { ...martutene, lines: ['rodalies:R8', 'tram:T1'] }, [...order, 'rodalies:R8'], { renfe: { status: 'ok', alerts: [] } })).toEqual([]);
  // Those that call and those Alerted, each once, in the order's.
  expect(linesOnBoard([trip('rodalies:R4', 'adif:11509')], { stations: ['adif:11509'], lines: ['rodalies:R2', 'tram:T1'] }, order, ALERTS)).toEqual(['rodalies:R2', 'rodalies:R4', 'tram:T1']);
  // A Line that calls is named with no Alert on it, as before: an Alert is only what names one that doesn't.
  expect(linesOnBoard([trip('rodalies:R7', 'adif:11509')], { stations: ['adif:11509'], lines: ['rodalies:R7'] }, [...order, 'rodalies:R7'], ALERTS)).toEqual(['rodalies:R7']);
  // A track that names no Lines gives the Lines that call, as before.
  expect(linesOnBoard([trip('rodalies:R4', 'adif:11509')], { stations: ['adif:11509'] }, order, ALERTS)).toEqual(['rodalies:R4']);
});

test("a board's Alert names the Lines it's on of those that call there, in the board's order, as Rodalies' words don't, and its Station's none", () => {
  const sants = cardAlerts(ALERTS, { lines: ['rodalies:R4', 'rodalies:R2'], stations: ['adif:71801'] }, 'en', NOW).alerts;
  expect(sants.map(({ id, lines }) => [id, lines])).toEqual([
    ['AVISO_518352', ['rodalies:R2']],
    ['INFO_SANTS', []],
    ['AVISO_518298', ['rodalies:R4', 'rodalies:R2']],
  ]);
});

test("a card's Alerts are newest first, whichever operator's they are, and one that doesn't say when it began goes last", () => {
  // Made up: a place where R2 and T1 both call, and an Alert of TRAM's with no start.
  const tram = ALERTS.tram as AlertFeed;
  const alerts = { ...ALERTS, tram: { ...tram, alerts: [...tram.alerts, { id: 'sc-1', lines: ['tram:T1'], stations: [], description: [{ language: 'ca', text: 'Avís' }] }] } };
  expect(cardAlerts(alerts, { lines: ['rodalies:R2', 'tram:T1'], stations: [] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518352', 'sc-287', 'AVISO_518298', 'sc-1']);
});

test("an Alert is in the viewer's language where its feed has it, or else in its feed's own, with its language and whose words they are, and when it began", () => {
  const R2 = { lines: ['rodalies:R2'], stations: [] };
  expect(cardAlerts(ALERTS, R2, 'ca', NOW).alerts[0]).toEqual({ id: 'AVISO_518352', lines: ['rodalies:R2'], description: { language: 'ca', text: 'Sense servei ferroviari.' }, from: at(7, 2), by: 'Renfe' });
  // An English-speaking viewer reads Renfe's in Spanish.
  expect(cardAlerts(ALERTS, R2, 'en', NOW).alerts[0]).toEqual({ id: 'AVISO_518352', lines: ['rodalies:R2'], description: { language: 'es', text: 'Sin servicio ferroviario.' }, from: at(7, 2), by: 'Renfe' });
  // TRAM's title and words both, in English, and a Basque-speaking viewer's in TRAM's own Catalan.
  const T1 = { lines: ['tram:T1'], stations: [] };
  expect(cardAlerts(ALERTS, T1, 'en', NOW).alerts[0]).toEqual({
    id: 'sc-287',
    lines: ['tram:T1'],
    header: { language: 'en', text: 'T1, T2 and T3 affected' },
    description: { language: 'en', text: 'No service between Francesc Macià and Montesa.' },
    from: at(7, 0),
    by: 'TRAM',
  });
  expect(cardAlerts(ALERTS, T1, 'eu', NOW).alerts[0]).toMatchObject({ header: { language: 'ca', text: 'Afectació T1, T2 i T3' }, description: { language: 'ca', text: 'Sense servei entre Francesc Macià i Montesa.' } });
});

test("a Catalan viewer reads Valencia's Alert in its second entry, in Valencian, and a Spanish viewer in its first, as the fetcher tags the file Renfe gave on 7 Oct", () => {
  // Renfe's Alerts of Valencia, Bilbao, San Sebastián and Murcia with a second entry, as the fetcher writes them (#371).
  const text = readFileSync(new URL('../fetcher/fixtures/alerts/renfe-second-entries.json', import.meta.url), 'utf8');
  const renfe = readAlerts(ALERTS_START, { renfe: { alerts: { status: 200, body: { text } } } }, NOW).file ?? {};
  const C2 = { lines: ['cercanias-valencia:C2'], stations: [] };
  const first = { language: 'es', text: "Línea C2. Tren con salida prevista a las 08:30h de la estación de València Nord con destino l'Alcúdia, efectúa su salida con 17 minutos de retraso. Incidencia operativa." };
  const second = { language: 'ca', text: "Línia C2. Tren amb eixida prevista a les 08:30h de l'estació de València Nord amb destinació l'Alcúdia, efectua la seua eixida amb 17 minuts de retard. Incidència operativa." };
  expect(cardAlerts(renfe, C2, 'ca', NOW).alerts[0]).toMatchObject({ id: 'AVISO_518349', description: second, by: 'Renfe' });
  expect(cardAlerts(renfe, C2, 'es', NOW).alerts[0]).toMatchObject({ id: 'AVISO_518349', description: first, by: 'Renfe' });
  // An English-speaking viewer, as for Rodalies', reads Renfe's own first entry, in Spanish, which the card names as its language.
  expect(cardAlerts(renfe, C2, 'en', NOW).alerts[0]).toMatchObject({ id: 'AVISO_518349', description: first });
  // A Station's Alert, which names no Line, stays Spanish for a Catalan viewer: Carcaixent's lift gives its second entry tagged es.
  const lift = cardAlerts(renfe, { lines: [], stations: ['adif:64103'] }, 'ca', NOW).alerts.find((a) => a.id === 'AVISO_518170');
  expect(lift?.description).toEqual({ language: 'es', text: 'Ascensor de la estación de Carcaixent, sentido Xàtiva de vía 2, se encuentra fuera de servicio. Disculpen las molestias.' });
});

/** What the fetcher writes from Renfe's six Alerts of Madrid that name Lines, of 7 October, whole and as Renfe gave them (#359). */
const MADRID: Alerts = readAlerts(ALERTS_START, { renfe: { alerts: { status: 200, body: { text: readFileSync(new URL('../fetcher/fixtures/alerts/renfe-madrid.json', import.meta.url), 'utf8') } } } }, NOW).file ?? {};

test("a C8a or a C8b Train's card shows Madrid's AVISO_517064, which Renfe names for C8, as the fetcher writes it, and a board where both call shows it once (#359)", () => {
  const [C8a, C8b, C4] = ['cercanias-madrid:C8a', 'cercanias-madrid:C8b', 'cercanias-madrid:C4'];
  // Newest first: 517064 from 1 Oct, and 467462, Cercedilla's toilets, which names C8 and C9, from 12 Dec 2025.
  for (const line of [C8a, C8b]) {
    expect(cardAlerts(MADRID, { lines: [line], stations: [] }, 'es', NOW).alerts.map(({ id, lines }) => [id, lines])).toEqual([
      ['AVISO_517064', [line]],
      ['AVISO_467462', [line]],
    ]);
  }
  expect(cardAlerts(MADRID, { lines: [C8a, C8b], stations: [] }, 'es', NOW).alerts.map(({ id, lines }) => [id, lines])).toEqual([
    ['AVISO_517064', [C8a, C8b]],
    ['AVISO_467462', [C8a, C8b]],
  ]);
  // None of C4's, whose own Alerts are on it as before.
  expect(cardAlerts(MADRID, { lines: [C4], stations: [] }, 'es', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518335', 'AVISO_518347']);
});

test("a board at Cercedilla, where no Trip of C8b calls on the days on the map, as AVISO_517064 says, but its timetable does, names C8b and shows that Alert, which names C8 (#359)", () => {
  // As the track names it (#392): Cercedilla is on C8b's shapes, and on none of C8a's.
  const cercedilla = { stations: ['adif:12006'], lines: ['cercanias-madrid:C8b'] };
  const lines = linesOnBoard([], cercedilla, ['cercanias-madrid:C8a', 'cercanias-madrid:C8b'], MADRID);
  expect(lines).toEqual(['cercanias-madrid:C8b']);
  expect(cardAlerts(MADRID, { lines, stations: cercedilla.stations }, 'es', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_517064', 'AVISO_467462']);
});

test("a card says when its Alerts were read where that's over 15 minutes ago, by the feed read longest ago of those whose Alerts it shows", () => {
  const on = (...lines: string[]) => ({ lines, stations: [] });
  const [R2, T1, both] = [on('rodalies:R2'), on('tram:T1'), on('rodalies:R2', 'tram:T1')];
  // Renfe's were read at 8:11:40, and TRAM's at 8:10:05. TRAM's, read every 5 minutes into a file
  // written every 5, can be 12 minutes old by the time the page has the file, while all works (#339).
  expect(cardAlerts(ALERTS, both, 'en', NOW).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, T1, 'en', at(8, 22, 5)).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, T1, 'en', at(8, 25, 5)).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, T1, 'en', at(8, 25, 6)).asOf).toBe(at(8, 10, 5));
  expect(cardAlerts(ALERTS, R2, 'en', at(8, 25, 6)).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, both, 'en', at(8, 25, 6)).asOf).toBe(at(8, 10, 5));
  // A card with no Alerts says nothing.
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R8'], stations: [] }, 'en', at(9, 0)).asOf).toBeUndefined();
});

test("a card says when a feed's file last changed where that's over 24 hours before the map's time, for each feed whose Alerts it shows, and nothing where it's no longer ago or the feed says none (#390)", () => {
  const on = (...lines: string[]) => ({ lines, stations: [] });
  const [renfe, tram] = [ALERTS.renfe as AlertFeed, ALERTS.tram as AlertFeed];
  // Made up: Renfe's file as it stood on the 4th at 9:32, nearly 3 days before the map's time, and TRAM's, as TRAM writes its files when asked, 2 hours before it.
  const stood = Date.UTC(2026, 9, 4, 7, 32, 52);
  const feeds: Alerts = { renfe: { ...renfe, changed: stood }, tram: { ...tram, changed: at(6, 12) } };
  expect(cardAlerts(feeds, on('rodalies:R2'), 'en', NOW).changed).toEqual([{ by: 'Renfe', at: stood }]);
  // TRAM's is within the day, as is where it's alone on a card; and a card with none of Renfe's Alerts says nothing of its file.
  expect(cardAlerts(feeds, on('tram:T1'), 'en', NOW).changed).toEqual([]);
  expect(cardAlerts(feeds, on('rodalies:R8'), 'en', NOW).changed).toEqual([]);
  // A board where both call says it of Renfe's, once, though Renfe has two Alerts on its Lines.
  expect(cardAlerts(feeds, on('rodalies:R1', 'rodalies:R2', 'rodalies:R4', 'tram:T1'), 'en', NOW).changed).toEqual([{ by: 'Renfe', at: stood }]);
  // Both, where both are old, Renfe's first as the feeds are.
  const both: Alerts = { ...feeds, tram: { ...tram, changed: at(8, 0) - 2 * 24 * 3_600_000 } };
  expect(cardAlerts(both, on('rodalies:R2', 'tram:T1'), 'en', NOW).changed).toEqual([
    { by: 'Renfe', at: stood },
    { by: 'TRAM', at: at(8, 0) - 2 * 24 * 3_600_000 },
  ]);
  // Over 24 hours: a file changed exactly that long before is no older than a day, and one second more is.
  const changedAt = (changed: number) => cardAlerts({ renfe: { ...renfe, changed } }, on('rodalies:R2'), 'en', NOW).changed;
  expect(changedAt(NOW - 24 * 3_600_000)).toEqual([]);
  expect(changedAt(NOW - 24 * 3_600_000 - 1000)).toHaveLength(1);
  // None, from a feed whose file says none, or from one that changed after the map's time, as a device's clock can be behind.
  expect(cardAlerts(ALERTS, on('rodalies:R2'), 'en', at(8, 12) + 5 * 24 * 3_600_000).changed).toEqual([]);
  expect(changedAt(NOW + 60_000)).toEqual([]);
});

test("a card says the same of a feed's file beside when its Alerts were read, and not instead of it (#390)", () => {
  const renfe = ALERTS.renfe as AlertFeed;
  // Made up: Renfe's file as it stood on the 4th at 9:32.
  const stood = Date.UTC(2026, 9, 4, 7, 32, 52);
  // 8:27 is over 15 minutes after Renfe's were read, at 8:11:40.
  const card = cardAlerts({ renfe: { ...renfe, changed: stood } }, { lines: ['rodalies:R2'], stations: [] }, 'en', at(8, 27));
  expect(card.asOf).toBe(at(8, 11, 40));
  expect(card.changed).toEqual([{ by: 'Renfe', at: stood }]);
});
