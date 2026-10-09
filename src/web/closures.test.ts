import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ALERTS_START, readAlerts } from '../fetcher/alerts.ts';
import { APART, atZoom, BANDS, beside, DEGREE, inBand, onStroke, pixelMetres, zones, type Line, type Shape, type Stroke } from '../bundle.ts';
import { sideBySide } from '../build/sideBySide.ts';
import { closureStrokes, closuresAt, placeOn, stretchesIn } from './closures.ts';

/** Some of Rodalies' and TRAM's Stations, as the bundle names them. */
const R1 = [
  { id: 'adif:72305', name: "L'Hospitalet de Llobregat" },
  { id: 'adif:79606', name: 'Blanes' },
  { id: 'adif:79600', name: 'Tordera' },
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

test('joins a stretch\'s Stations with a dash too, and finds a Station\'s whole name within a longer one, but not a Station of another Line', () => {
  // AVISO_518337: R3's Trains run from La Garriga, and buses run between Ripoll and Puigcerdà, and
  // between Fabra i Puig, an R4 Station, and Puigcerdà, joined by a Catalan "i".
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

test("matches a name within a Station's name, where it's within one Station's only, and a Station's name with a joining word in it", () => {
  // Made up, on Rodalies' Stations.
  const stations = [
    ...R1,
    { id: 'adif:79009', name: 'Barcelona-El Clot' },
    { id: 'adif:78806', name: 'Fabra i Puig' },
    { id: 'adif:71700', name: 'Vilanova i la Geltrú' },
    { id: 'adif:71701', name: 'Sitges' },
    { id: 'adif:77106', name: 'La Garriga' },
  ];
  expect(stretchesIn('Servicio alternativo por carretera entre Blanes y Maçanet.', stations)).toEqual([{ stations: ['adif:79606', 'adif:79200'], says: 'closed' }]);
  expect(stretchesIn('Circulación interrumpida entre Fabra i Puig y El Clot.', stations)).toEqual([{ stations: ['adif:78806', 'adif:79009'], says: 'closed' }]);
  expect(stretchesIn('Circulación por vía única entre Vilanova i la Geltrú e Sitges.', stations)).toEqual([{ stations: ['adif:71700', 'adif:71701'], says: 'single' }]);
  // "la" is within two of their names, and too short to tell.
  expect(stretchesIn('Servicio alternativo por carretera entre Blanes y la estación.', stations)).toEqual([]);
});

test('finds stretches "de X a Y" and "desde X hasta Y", and one whose words say nothing of it, with nothing said', () => {
  expect(stretchesIn('No presta servicio de Blanes a Tordera.', R1)).toEqual([{ stations: ['adif:79606', 'adif:79600'], says: 'closed' }]);
  expect(stretchesIn('Servicio alternativo por carretera desde Tordera hasta Maçanet-Massanes.', R1)).toEqual([{ stations: ['adif:79600', 'adif:79200'], says: 'closed' }]);
  expect(stretchesIn('Obras entre Blanes y Tordera.', R1)).toEqual([{ stations: ['adif:79606', 'adif:79600'] }]);
});

test("reads the words that say what a stretch is from those last before it in its sentence", () => {
  const text = "Se mantiene el servicio entre L'Hospitalet de Llobregat y Blanes, y servicio alternativo por carretera entre Blanes y Maçanet-Massanes. Entre Tordera y Blanes, circulación interrumpida.";
  expect(stretchesIn(text, R1)).toEqual([
    { stations: ['adif:72305', 'adif:79606'], says: 'running' },
    { stations: ['adif:79606', 'adif:79200'], says: 'closed' },
    { stations: ['adif:79600', 'adif:79606'] },
  ]);
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

// alerts.json as the fetcher writes it from Renfe's alerts of 11:39 on Wednesday 7 October 2026, cut
// down to Rodalies' 9, and TRAM's of 12:35 (#339's first comment), read at 12:35.
const recorded = (file: string) => ({ status: 200, body: { text: readFileSync(new URL(`../fetcher/fixtures/alerts/${file}`, import.meta.url), 'utf8') } });
const READ = Date.parse('2026-10-07T12:35:22+02:00');
const ALERTS = readAlerts(ALERTS_START, { renfe: { alerts: recorded('renfe.json') }, tram: { 'TBX GtfsRealtimeAlerts': recorded('tram-tbx.json'), 'TBS GtfsRealtimeAlerts': recorded('tram-tbs.json') } }, READ).file ?? {};

/** The Stations each Line's Trips call at, some of them, as the bundle of 7 Oct names them: T6's only at Can Jaumandreu of the two, as TRAM's timetable leaves out Glòries – Can Jaumandreu. */
const CALLING: Record<string, { id: string; name: string }[]> = {
  'rodalies:R1': R1,
  'rodalies:R2': [
    { id: 'adif:71600', name: 'Sant Vicenç de Calders' },
    { id: 'adif:71603', name: 'Cunit' },
  ],
  'rodalies:R2S': [
    { id: 'adif:71600', name: 'Sant Vicenç de Calders' },
    { id: 'adif:71603', name: 'Cunit' },
    { id: 'adif:79400', name: 'Barcelona Estació de França' },
  ],
  'rodalies:R3': [
    { id: 'adif:77102', name: 'La Garriga' },
    { id: 'adif:77200', name: 'Ripoll' },
    { id: 'adif:77309', name: 'Puigcerdà' },
  ],
  'rodalies:R13': [
    { id: 'adif:73100', name: 'La Plana-Picamoixons' },
    { id: 'adif:73003', name: 'Les Borges Blanques' },
  ],
  ...Object.fromEntries(['T1', 'T2', 'T3'].map((name) => [`tram:${name}`, [{ id: 'tram:ST-172', name: 'Francesc Macià' }, { id: 'tram:ST-188', name: 'Montesa' }]])),
  'tram:T5': [
    { id: 'tram:ST-206', name: 'Glòries' },
    { id: 'tram:ST-208', name: 'Can Jaumandreu' },
  ],
  'tram:T6': [{ id: 'tram:ST-208', name: 'Can Jaumandreu' }],
};
const calling = (line: string) => CALLING[line] ?? [];
/** 7 Oct's service day, with no Closures of its own. */
const DAY = { noonMinus12h: Date.parse('2026-10-07T00:00:00+02:00'), closures: [] };

test("on 7 Oct, closes R1 Blanes – Maçanet-Massanes and R3 Ripoll – Puigcerdà, R2 Sant Vicenç de Calders – Cunit to a single track, and TRAM's T1–T3 Francesc Macià – Montesa and T5 Glòries – Can Jaumandreu, from their Alerts, newest first", () => {
  const renfe = (id: string, from: string) => ({ alert: { feed: 'renfe', id }, from: Date.parse(`2026-10-07T${from}:00+02:00`) });
  const sc280 = { alert: { feed: 'tram', id: 'sc-280' }, from: Date.parse('2026-10-01T07:00:05+02:00') };
  expect(closuresAt(ALERTS, DAY, calling, READ)).toEqual([
    { line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'], kind: 'closed', ...renfe('AVISO_518337', '09:23') },
    { line: 'rodalies:R1', stations: ['adif:79606', 'adif:79200'], kind: 'closed', ...renfe('AVISO_518348', '08:38') },
    { line: 'rodalies:R2', stations: ['adif:71600', 'adif:71603'], kind: 'single', ...renfe('AVISO_518332', '08:30') },
    ...['T2', 'T3', 'T1'].map((name) => ({ line: `tram:${name}`, stations: ['tram:ST-172', 'tram:ST-188'], kind: 'closed', ...sc280 })),
    { line: 'tram:T5', stations: ['tram:ST-206', 'tram:ST-208'], kind: 'closed', alert: { feed: 'tram', id: 'sc-279' }, from: Date.parse('2026-10-01T02:05:27+02:00') },
  ]);
});

test("shows a Closure within its Alert's active period: TRAM's from their start to their end, and Renfe's, which have no end, while they're in the file", () => {
  const lines = (now: string) => closuresAt(ALERTS, DAY, calling, Date.parse(now)).map((c) => c.line);
  // sc-280's period ends at 01:00:05 on 13 Oct; sc-279's runs to 30 April 2027.
  expect(lines('2026-10-13T01:00:05+02:00')).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T2', 'tram:T3', 'tram:T1', 'tram:T5']);
  expect(lines('2027-01-13T01:00:06+01:00')).toEqual(['rodalies:R3', 'rodalies:R1', 'rodalies:R2', 'tram:T5']);
  // sc-279's begins at 02:05:27 on 1 Oct, and AVISO_518332 at 08:30 on 7 Oct.
  expect(lines('2026-10-01T02:05:26+02:00')).toEqual([]);
  expect(lines('2026-10-07T08:30:00+02:00')).toEqual(['rodalies:R2', 'tram:T2', 'tram:T3', 'tram:T1', 'tram:T5']);
});

test("shows the timetable's Closures on their day from the first bus to the last, and a part an Alert closes too once, with the Alert's words", () => {
  // 9 Oct's: R13's, from 05:33 to 22:41, and made up, one of R3's between Ripoll and Puigcerdà, which AVISO_518337 closes too.
  const day = {
    noonMinus12h: Date.parse('2026-10-09T00:00:00+02:00'),
    closures: [
      { line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'] as [string, string], from: 19980, to: 81660, kind: 'buses' as const },
      { line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'] as [string, string], from: 18000, to: 88680, kind: 'buses' as const },
    ],
  };
  const at = (time: string) => closuresAt(ALERTS, day, calling, Date.parse(`2026-10-09T${time}+02:00`)).filter((c) => c.line === 'rodalies:R13' || c.line === 'rodalies:R3');
  expect(at('05:32:59')).toEqual([{ line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'], kind: 'closed', alert: { feed: 'renfe', id: 'AVISO_518337' }, from: Date.parse('2026-10-07T09:23:00+02:00') }]);
  expect(at('05:33:00').map((c) => [c.line, c.alert?.id])).toEqual([
    ['rodalies:R3', 'AVISO_518337'],
    ['rodalies:R13', undefined],
  ]);
  expect(at('22:41:00')[1]).toEqual({ line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'], kind: 'closed', from: Date.parse('2026-10-09T05:33:00+02:00') });
  expect(at('22:41:01').map((c) => c.line)).toEqual(['rodalies:R3']);
  // Without the Alert, the timetable's own, until its last bus, past midnight.
  const timetable = closuresAt({}, day, calling, Date.parse('2026-10-10T00:38:00+02:00'));
  expect(timetable).toEqual([{ line: 'rodalies:R3', stations: ['adif:77200', 'adif:77309'], kind: 'closed', from: Date.parse('2026-10-09T05:00:00+02:00') }]);
});

test('a day file built before #340 has no Closures', () => {
  expect(closuresAt({}, { noonMinus12h: DAY.noonMinus12h }, calling, READ)).toEqual([]);
});

/** A shape through points given in metres east and north of 0°, 0°, as a degree is DEGREE metres there both ways. */
const metres = (id: string, ...points: [number, number][]): Shape => {
  let along = 0;
  const dist = points.map(([x, y], i) => (along += Math.hypot(x - (points[i - 1]?.[0] ?? x), y - (points[i - 1]?.[1] ?? y))));
  return { id, coords: points.map(([x, y]) => [x / DEGREE, y / DEGREE]), dist };
};
/** A point given in metres east and north of 0°, 0°. */
const at = (x: number, y: number): [number, number] => [x / DEGREE, y / DEGREE];

test("places a Closure along the Line's shape that passes both its Stations, where they are along it, the shortest way between them", () => {
  // A Line's three shapes: 10 km east, back west, and a loop that leaves it at 2 km and comes back at 6 km.
  const east = metres('east', [0, 0], [10000, 0]);
  const west = metres('west', [10000, 0], [0, 0]);
  const loop = metres('loop', [0, 0], [2000, 0], [2000, 3000], [6000, 3000], [6000, 0], [10000, 0]);
  // Its Stations at 3 and 5 km, 40 m off the track, where the build puts calls within 300 m.
  const place = (shapes: Shape[]) => placeOn([at(5000, 40), at(3000, -40)], shapes);
  expect(place([loop, east, west])).toEqual({ shape: 'east', from: 3000, to: 5000 });
  expect(place([loop, west])).toEqual({ shape: 'west', from: 5000, to: 7000 });
  // The loop passes both a kilometre away; and a Station 400 m off the track is off it.
  expect(place([loop])).toBeUndefined();
  expect(placeOn([at(5000, 40), at(3000, -400)], [east])).toBeUndefined();
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
});
