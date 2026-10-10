import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import type { AlertFeed, Alerts, Bundle, Call, Line, Trip } from '../bundle.ts';
import type { Pass } from '../engine.ts';
import { cardAlerts, inNameOrder, linesCallingAt, minutesTo, nearbyRows, progress } from './cards.ts';

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

test("a board's Lines are those whose Trips call at any of its place's Stations, in the order the days list them", () => {
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
  const { lines } = RECORDED.bundle;
  const [before, named] = [lines.map((l) => l.id), inNameOrder(lines)];
  expect(named).toHaveLength(lines.length);
  // Each Network starts one run of Lines, none of its Lines among another's.
  expect(named.flatMap((l, i) => (l.network === named[i - 1]?.network ? [] : [l.network]))).toEqual(['rodalies', 'fgc', 'tram', 'metro']);
  expect(lines.map((l) => l.id)).toEqual(before);
});

test("digits count as numbers, and a letter after them sorts after that number and before the next: C4, C4a, C4b, C5 … C8b, C10", () => {
  // Cercanías Madrid's Lines, as 10 Oct 2026's track lists them.
  const madrid = ['C1', 'C10', 'C2', 'C3', 'C4', 'C4a', 'C4b', 'C5', 'C8a', 'C7', 'C8b'].map((name) => ({ network: 'cercanias-madrid', name }));
  expect(inNameOrder(madrid).map((l) => l.name)).toEqual(['C1', 'C2', 'C3', 'C4', 'C4a', 'C4b', 'C5', 'C7', 'C8a', 'C8b', 'C10']);
});

test("a board at Montesa names T1, T2 and T3 in that order, though TRAM's timetable lists them T2, T3, T1 (#399)", () => {
  const { lines, trips } = RECORDED.bundle;
  // tram:ST-188, as 10 Oct's track names Montesa: this recording's Stations are cut down to its replay's.
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
