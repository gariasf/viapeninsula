import { expect, test } from 'vitest';
import type { Shape, Station, Trip } from '../bundle.ts';
import { collect, type Found } from './report.ts';
import { placeDays, placeRuns, placeTrips, unserved, type FeedTrip } from './trips.ts';

// Track drawn in metres east (x) and north (y) of a point near L'Aldea.
const M = (6_371_008.8 * Math.PI) / 180; // metres in a degree of latitude
const LON = 0.62;
const LAT = 40.75;
const COS = Math.cos((LAT * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [LON + x / (M * COS), LAT + y / M];

/** A shape through corners given in metres, with the distance along it at each. */
function shape(id: string, ...corners: [x: number, y: number][]): Shape {
  let along = 0;
  const dist = corners.map(([x, y], i) => {
    const [px, py] = corners[i - 1] ?? [x, y];
    return (along += Math.hypot(x - px, y - py));
  });
  return { id, coords: corners.map(([x, y]) => at(x, y)), dist };
}

const station = (id: string, x: number, y: number): Station => {
  const [lon, lat] = at(x, y);
  return { id, name: id, lon, lat };
};

/** A Trip calling at the named Stations, ten minutes apart, a minute at each. */
const trip = (id: string, line: string, shape: string, stations: string): FeedTrip => ({
  id,
  line,
  shape,
  headsign: stations.split(' ').at(-1) ?? '',
  calls: stations.split(' ').map((station, i) => ({ station, arrival: i * 600, departure: i * 600 + 60 })),
});

/** R2N's track through Barcelona, which Estació de França is off. */
const R2N: [Shape[], Station[]] = [
  [shape('R2N', [0, 0], [10000, 0])],
  [station('Sants', 0, 0), station('Gràcia', 2500, 40), station('França', 3000, 1800)],
];

/** Rodalies' fastest Trains run at 160 km/h, on every Line. */
const TOP_SPEED = () => 160 / 3.6;

function place(shapes: Shape[], stations: Station[], ...trips: FeedTrip[]) {
  const [log, found]: [string[], Found[]] = [[], []];
  const placed = placeTrips(trips, shapes, stations, TOP_SPEED, (l) => log.push(l), (f) => found.push(f));
  /** How far along its track each of a Trip's Stations is placed, in metres. */
  const dist = (id: string) => placed.find((t) => t.id === id)?.calls.map((c) => c.dist);
  return { placed, log, found, dist };
}

test('places each Station a Trip calls at where it is along its track, whichever way the Trip runs it', () => {
  const { placed, dist, log } = place(
    [shape('east', [0, 0], [10000, 0])],
    [station('A', 0, 20), station('B', 4000, -30), station('C', 10000, 10)],
    trip('out', 'R1', 'east', 'A B C'),
    trip('back', 'R1', 'east', 'C B A'),
  );
  expect(placed[0]).toEqual({
    id: 'out',
    line: 'R1',
    shape: 'east',
    headsign: 'C',
    calls: [
      { station: 'A', arrival: 0, departure: 60, dist: 0 },
      { station: 'B', arrival: 600, departure: 660, dist: 4000 },
      { station: 'C', arrival: 1200, departure: 1260, dist: 10000 },
    ],
  });
  expect(dist('back')).toEqual([10000, 4000, 0]);
  expect(log).toEqual([]);
});

test("where its track passes a Station twice, places it where the Trip passes it, as at L'Aldea on the way to and from Tortosa", () => {
  // R16's track runs out to Tortosa and back to L'Aldea before it carries on south, to Ulldecona.
  const { dist } = place(
    [shape('R16', [-5000, 0], [0, 0], [12000, 0], [0, 0], [0, -20000])],
    [station('Camarles', -5000, 10), station("L'Aldea", 0, 30), station('Tortosa', 12000, 25), station('Ulldecona', 20, -20000)],
    trip('from Tortosa', 'R16', 'R16', "Tortosa L'Aldea Ulldecona"),
    trip('to Tortosa', 'R16', 'R16', "Ulldecona L'Aldea Tortosa"),
    trip('via Tortosa', 'R16', 'R16', "Camarles L'Aldea Tortosa L'Aldea Ulldecona"),
  );
  expect(dist('from Tortosa')).toEqual([17000, 29000, 49000]);
  expect(dist('to Tortosa')).toEqual([49000, 29000, 17000]);
  expect(dist('via Tortosa')).toEqual([0, 5000, 17000, 29000, 49000]);
});

test('follows a Trip that turns back at a Station, as R11 Trips do at Cerbère', () => {
  const { dist } = place(
    [shape('R11', [0, 0], [20000, 0], [22000, 0])],
    [station('Figueres', 0, 15), station('Portbou', 20000, -10), station('Cerbère', 22000, 30)],
    trip('turns back', 'R11', 'R11', 'Figueres Portbou Cerbère Portbou'),
  );
  expect(dist('turns back')).toEqual([0, 20000, 22000, 20000]);
});

test("leaves out and reports a Trip calling at a Station off its track, as Estació de França is off R2N's", () => {
  const { placed, log, found } = place(...R2N, trip('to França', 'R2N', 'R2N', 'Sants Gràcia França'), trip('to Gràcia', 'R2N', 'R2N', 'Sants Gràcia'));
  expect(placed.map((t) => t.id)).toEqual(['to Gràcia']);
  expect(log).toEqual(['to França is left out: França is 1.8 km off its track']);
  expect(found).toMatchObject([{ kind: 'trip', why: 'off', trip: 'to França', line: 'R2N', stations: [{ id: 'França' }], text: log }]);
});

test('reports a Trip left out on more than one day as one spot, counting the most Trips left out on any one day', () => {
  const report = collect();
  // A Trip that runs every day, as TMB's do, and one with an ID of its own each day, as Renfe's do.
  for (const [day, trips] of [['to França', 'Mon to França later'], ['to França', 'Tue to França later']].entries()) {
    placeTrips(trips.map((id) => trip(id, 'R2N', 'R2N', 'Sants Gràcia França')), ...R2N, TOP_SPEED, () => {}, (f) => report.add({ ...f, network: 'rodalies', day }));
  }
  const [lon = NaN, lat = NaN] = at(3000, 1800);
  expect(report.spots()).toEqual([
    {
      kind: 'trip',
      key: 'trip R2N off França',
      network: 'rodalies',
      line: 'R2N',
      stations: [{ id: 'França', name: 'França' }],
      point: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5],
      zoom: 15,
      text: [
        'to França is left out: França is 1.8 km off its track',
        'Mon to França later is left out: França is 1.8 km off its track',
        'Tue to França later is left out: França is 1.8 km off its track',
      ],
      numbers: { trips: 2 },
    },
  ]);
});

test("leaves out and reports a Trip that would have to run faster than its Network's top speed, as R16's past Tortosa", () => {
  // R16's track from Tortosa to Ulldecona comes back no nearer than a kilometre to L'Aldea, where its
  // Trains turn back, so a Trip from Tortosa would have to run past Tortosa again on its way south.
  const { placed, log, found } = place(
    [shape('R16', [0, 0], [12000, 0], [1000, -1000], [1000, -20000])],
    [station("L'Aldea", 0, 30), station('Tortosa', 12000, 25), station('Ulldecona', 1000, -20000)],
    {
      id: 'from Tortosa',
      line: 'R16',
      shape: 'R16',
      headsign: 'Ulldecona',
      calls: [
        { station: 'Tortosa', arrival: 0, departure: 0 },
        { station: "L'Aldea", arrival: 720, departure: 1020 },
        { station: 'Ulldecona', arrival: 1860, departure: 1920 },
      ],
    },
  );
  expect(placed).toEqual([]);
  expect(log).toEqual(["from Tortosa is left out: it would run L'Aldea → Ulldecona at 180 km/h along its track"]);
  expect(found).toMatchObject([{ kind: 'trip', why: 'fast', trip: 'from Tortosa', stations: [{ id: "L'Aldea" }, { id: 'Ulldecona' }], text: log }]);
});

test("checks each Trip against its own Line's top speed, as an AVE's 300 km/h is above AVE y Larga Distancia's 250, which an Alvia's is (#260)", () => {
  // 100 km in 21 minutes, 286 km/h, along a straight track.
  const stations = [station('Madrid', 0, 0), station('Zaragoza', 100_000, 0)];
  const calls = [
    { station: 'Madrid', arrival: 0, departure: 0 },
    { station: 'Zaragoza', arrival: 1260, departure: 1260 },
  ];
  const [log, found]: [string[], Found[]] = [[], []];
  const topSpeed = (line: string) => (line === 'AVE' ? 300 : 250) / 3.6;
  const placed = placeTrips(
    [{ id: 'ave', line: 'AVE', shape: 'line', headsign: 'Zaragoza', calls }, { id: 'alvia', line: 'Alvia', shape: 'line', headsign: 'Zaragoza', calls }],
    [shape('line', [0, 0], [100_000, 0])],
    stations,
    topSpeed,
    (l) => log.push(l),
    (f) => found.push(f),
  );
  expect(placed.map((t) => [t.id, t.calls.map((c) => c.dist)])).toEqual([['ave', [0, 100_000]]]);
  expect(log).toEqual(['alvia is left out: it would run Madrid → Zaragoza at 286 km/h along its track']);
  expect(found).toMatchObject([{ kind: 'trip', why: 'fast', trip: 'alvia', line: 'Alvia' }]);
});

/**
 * A trace through Sants, Gràcia and Estació de França, which the Trips that don't fit R2N's shape take
 * (#280): R2N's track, and out from Gràcia to França, which is off it.
 */
const OWN = shape('own', [0, 0], [2500, 40], [3000, 1800]);

/**
 * Places the days' Trips, those that don't fit their shape on OWN, which is what the retrace gives, less the
 * Trips `left` says it leaves out. `asked` is what it was asked to trace, by day.
 */
function placeOnOwn(days: FeedTrip[][], stations = R2N[1], left: (day: number, id: string) => boolean = () => false) {
  const [log, found, asked]: [string[], Found[], string[][][]] = [[], [], []];
  const placed = placeDays(
    days,
    R2N[0],
    stations,
    TOP_SPEED,
    (unfit) => {
      asked.push(unfit.map((day) => day.map((t) => t.id)));
      return { shapes: [OWN], days: unfit.map((day, i) => day.filter((t) => !left(i, t.id)).map((t) => ({ ...t, shape: OWN.id }))) };
    },
    (l) => log.push(l),
    (f) => found.push(f),
  );
  return { ...placed, log, found, asked, ids: placed.days.map((day) => day.map((t) => `${t.id} on ${t.shape}`)) };
}

test("places a Trip that calls at a Station off its shape on a trace of its own through its Stations, as R2N's to Estació de França, and the others where they were", () => {
  const { ids, shapes, asked, log, found } = placeOnOwn([[trip('to França', 'R2N', 'R2N', 'Sants Gràcia França'), trip('to Gràcia', 'R2N', 'R2N', 'Sants Gràcia')]]);
  // Each where it came, the one that didn't fit on the trace: only that one was asked for.
  expect(ids).toEqual([['to França on own', 'to Gràcia on R2N']]);
  expect(asked).toEqual([[['to França']]]);
  expect(shapes.map((s) => s.id)).toEqual(['own']);
  expect(log).toEqual([]);
  expect(found).toEqual([]);
});

test("places the last call of a Trip that turns back at the far end of its trace at the trace's end, not back where it came, as R15's from Ulldecona by Tortosa to L'Aldea again", () => {
  // Out to França and back by a track a few metres beside, to Sants again: its two passes of Sants are as far from
  // França as each other, and the way out's is nearer by a few metres of track, so least travel alone runs it back.
  const there = shape('there and back', [0, 0], [3000, 1800], [3000, 1810], [0, 10]);
  const { days, shapes } = placeDays(
    [[trip('there and back', 'R2N', 'R2N', 'Sants França Sants')]],
    R2N[0],
    R2N[1],
    TOP_SPEED,
    (unfit) => ({ shapes: [there], days: unfit.map((day) => day.map((t) => ({ ...t, shape: there.id }))) }),
  );
  expect(shapes.map((s) => s.id)).toEqual(['there and back']);
  expect(days[0]?.[0]?.calls.map((c) => c.dist)).toEqual([0, 3499, 7007]);
});

test("places a call after the last of a trace that turns back at a Station short of it where the Trip comes to it on the way back, though the way out's pass is nearer", () => {
  // A spur, off R2N's track, out to 1,000 m and back, Z 100 m short of its end and S 350 m: the way out passes S 250 m
  // before Z, the way back 455 m after it, and the Trip, at Z and then at S, has been to the end and is on its way back.
  const spur = shape('spur', [2000, 1800], [3000, 1800], [3000, 1805], [2000, 1805]);
  const { days } = placeDays(
    [[trip('turned back', 'R2N', 'R2N', 'Z S')]],
    R2N[0],
    [...R2N[1], station('Z', 2900, 1800), station('S', 2650, 1800)],
    TOP_SPEED,
    (unfit) => ({ shapes: [spur], days: unfit.map((day) => day.map((t) => ({ ...t, shape: spur.id }))) }),
  );
  expect(days[0]?.[0]?.calls.map((c) => c.dist)).toEqual([900, 1355]);
});

test("places a Trip that would have to run faster than its Network's top speed along its shape on a trace of its own, as R16's from Tortosa past L'Aldea would", () => {
  // R16's track from Tortosa to Ulldecona comes back a kilometre from L'Aldea: along it, L'Aldea → Ulldecona is 180 km/h.
  const stations = [station("L'Aldea", 0, 30), station('Tortosa', 12000, 25), station('Ulldecona', 1000, -20000)];
  const R16 = shape('R16', [0, 0], [12000, 0], [1000, -1000], [1000, -20000]);
  const calls = [
    { station: 'Tortosa', arrival: 0, departure: 0 },
    { station: "L'Aldea", arrival: 720, departure: 1020 },
    { station: 'Ulldecona', arrival: 1860, departure: 1920 },
  ];
  const own = shape('own', [12000, 0], [0, 0], [1000, -20000]);
  const [log, found]: [string[], Found[]] = [[], []];
  const { days } = placeDays(
    [[{ id: 'from Tortosa', line: 'R16', shape: 'R16', headsign: 'Ulldecona', calls }]],
    [R16],
    stations,
    TOP_SPEED,
    (unfit) => ({ shapes: [own], days: unfit.map((day) => day.map((t) => ({ ...t, shape: 'own' }))) }),
    (l) => log.push(l),
    (f) => found.push(f),
  );
  expect(days[0]?.map((t) => [t.id, t.shape, t.calls.map((c) => c.dist)])).toEqual([['from Tortosa', 'own', [0, 12000, 32025]]]);
  expect([log, found]).toEqual([[], []]);
});

test("leaves out and reports a Trip that fits its own trace no better, as placeTrips() does, on its day, and drops a trace no Trip is placed on", () => {
  // A minute from Sants to Gràcia, 2.5 km, is faster than Rodalies' top speed on any trace.
  const usual = trip('usual', 'R2N', 'R2N', 'Sants Gràcia França');
  const quick = { ...usual, id: 'quick', calls: usual.calls.map((c, i) => ({ ...c, arrival: i * 60, departure: i * 60 + 10 })) };
  const { ids, shapes, log, found } = placeOnOwn([[], [quick]]);
  expect(ids).toEqual([[], []]);
  expect(shapes).toEqual([]);
  expect(log).toEqual(['quick is left out: it would run Sants → Gràcia at 180 km/h along its track']);
  expect(found).toMatchObject([{ kind: 'trip', why: 'fast', trip: 'quick', line: 'R2N', stations: [{ id: 'Sants' }, { id: 'Gràcia' }], text: log, day: 1 }]);
});

test("leaves a Trip out without a word where retrace() has left it out and said so, and keeps each day's other Trips in the order they came", () => {
  const trips = ['a', 'b', 'c'].map((id) => trip(id, 'R2N', 'R2N', 'Sants Gràcia França'));
  const { ids, log, found } = placeOnOwn([trips, [...trips, trip('d', 'R2N', 'R2N', 'Sants Gràcia')]], R2N[1], (day, id) => day === 0 && id === 'b');
  expect(ids).toEqual([
    ['a on own', 'c on own'],
    ['a on own', 'b on own', 'c on own', 'd on R2N'],
  ]);
  expect([log, found]).toEqual([[], []]);
});

test("doesn't trace a Trip that calls at fewer than two Stations, or whose shape has no track, nor ask for anything where each fits its own", () => {
  const { ids, asked, log, found } = placeOnOwn([
    [trip('fits', 'R2N', 'R2N', 'Sants Gràcia'), trip('one', 'R2N', 'R2N', 'Sants'), trip('no shape', 'R2N', 'none', 'Sants Gràcia')],
  ]);
  expect(ids).toEqual([['fits on R2N']]);
  expect(asked).toEqual([]);
  expect(log).toEqual(['one is left out: it calls at fewer than two Stations', 'no shape is left out: its shape none has no track']);
  expect(found).toMatchObject([{ why: 'fewer', trip: 'one' }, { why: 'notrack', trip: 'no shape' }]);
});

// The Trips of a timetable with no shapes, as Renfe's long-distance one, each on the trace of its run, made
// through its Stations (traceRuns(), #259).

test("places a Trip of a timetable with no shapes on its run's trace from the trace's start to its end, as a Trip on a trace of its own is (#280), so that one back at its first Station ends at the trace's end", () => {
  // As 'places the last call of a Trip that turns back at the far end of its trace…': its run is out to França and back to Sants.
  const run = shape('AVE:1', [0, 0], [3000, 1800], [3000, 1810], [0, 10]);
  const { days, shapes } = placeRuns({ shapes: [run], days: [[trip('there and back', 'AVE', 'AVE:1', 'Sants França Sants')]] }, R2N[1], TOP_SPEED);
  expect(days[0]?.map((t) => [t.id, t.shape, t.calls.map((c) => c.dist)])).toEqual([['there and back', 'AVE:1', [0, 3499, 7007]]]);
  expect(shapes.map((s) => s.id)).toEqual(['AVE:1']);
});

test("leaves out and reports on its day a Trip of a timetable with no shapes that doesn't fit its run's trace, and drops a trace no Trip is placed on", () => {
  // A minute from Sants to Gràcia, 2.5 km, is faster than the Line's top speed.
  const usual = trip('usual', 'AVE', 'AVE:1', 'Sants Gràcia');
  const quick = { ...trip('quick', 'AVE', 'AVE:2', 'Sants Gràcia França'), calls: usual.calls.map((c, i) => ({ ...c, arrival: i * 60, departure: i * 60 + 10 })) };
  const [log, found]: [string[], Found[]] = [[], []];
  const { days, shapes } = placeRuns({ shapes: [shape('AVE:1', [0, 0], [2500, 40]), { ...OWN, id: 'AVE:2' }], days: [[usual], [quick]] }, R2N[1], TOP_SPEED, (l) => log.push(l), (f) => found.push(f));
  expect(days.map((day) => day.map((t) => t.id))).toEqual([['usual'], []]);
  expect(shapes.map((s) => s.id)).toEqual(['AVE:1']);
  expect(log).toEqual(['quick is left out: it would run Sants → Gràcia at 180 km/h along its track']);
  expect(found).toMatchObject([{ kind: 'trip', why: 'fast', trip: 'quick', line: 'AVE', stations: [{ id: 'Sants' }, { id: 'Gràcia' }], text: log, day: 1 }]);
});

// The branches the trace of a shape leaves out, which a Trip's trace of its own through its Stations serves (#601).

test("keeps a branch reported unless every Station of it is called at by a Trip of its Line placed on a trace of its own, on any of the days, and none that's on the feed's shape or of another Line", () => {
  const spot = (line: string, ...ids: string[]): Found => ({ kind: 'branch', line, shape: `${line}:shape`, stations: ids.map((id) => station(id, 0, 0)), text: [''] });
  const placedOn = (id: string, line: string, shape: string, stations: string): Trip => ({
    id,
    line,
    shape,
    headsign: '',
    calls: stations.split(' ').map((s, i) => ({ station: s, arrival: i * 600, departure: i * 600 + 60, dist: i * 1000 })),
  });
  const traces = [shape('C3:1', [0, 0], [10000, 0]), shape('C1:1', [0, 0], [10000, 0])];
  const days = [
    // On a trace of its own, calling at A and B, on the first day, and at C and D on the second.
    [placedOn('one', 'C3', 'C3:1', 'A B')],
    [placedOn('two', 'C3', 'C3:1', 'C D')],
    // On the feed's shape, whose Stations a trace of a Trip's own doesn't make served, and on another Line's trace.
    [placedOn('feed', 'C3', 'C3', 'E F'), placedOn('other', 'C1', 'C1:1', 'G H')],
  ];
  const [served, apart, some, feed, other, none] = [spot('C3', 'A', 'B'), spot('C3', 'A', 'B', 'X'), spot('C3', 'C'), spot('C3', 'E', 'F'), spot('C3', 'G'), { ...spot('C3'), stations: [] }];
  // A and B by the first Trip, C by the second's, on another day; X by none; E and F only by a Trip on the feed's shape; G only by another Line's; and a branch with no Station is none's.
  expect(unserved([served, apart, some, feed, other, none], days, traces)).toEqual([apart, feed, other, none]);
});
