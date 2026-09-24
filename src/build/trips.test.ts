import { expect, test } from 'vitest';
import type { Line, Shape, Station } from '../bundle.ts';
import { placeTrips, type FeedTrip } from './trips.ts';

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

const line = (id: string, ...shapes: string[]): Line => ({ id, network: 'rodalies', name: id, colour: '#000', shapes });

/** A Trip calling at the named Stations, ten minutes apart, a minute at each. */
const trip = (id: string, line: string, shape: string, stations: string): FeedTrip => ({
  id,
  line,
  shape,
  headsign: stations.split(' ').at(-1) ?? '',
  calls: stations.split(' ').map((station, i) => ({ station, arrival: i * 600, departure: i * 600 + 60 })),
});

/** Rodalies' fastest Trains run at 160 km/h. */
const TOP_SPEED = 160 / 3.6;

function place(lines: Line[], shapes: Shape[], stations: Station[], ...trips: FeedTrip[]) {
  const log: string[] = [];
  const placed = placeTrips(trips, lines, shapes, stations, TOP_SPEED, (l) => log.push(l));
  /** How far along its track each of a Trip's Stations is placed, in metres. */
  const dist = (id: string) => placed.find((t) => t.id === id)?.calls.map((c) => c.dist);
  return { placed, log, dist };
}

test('places each Station a Trip calls at where it is along its track, whichever way the Trip runs it', () => {
  const { placed, dist, log } = place(
    [line('R1', 'east')],
    [shape('east', [0, 0], [10000, 0])],
    [station('A', 0, 20), station('B', 4000, -30), station('C', 10000, 10)],
    trip('out', 'R1', 'east', 'A B C'),
    trip('back', 'R1', 'east', 'C B A'),
  );
  expect(placed[0]).toEqual({
    id: 'out',
    line: 'R1',
    shape: 'east',
    direction: 0,
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

test("tells a Line's two directions apart by which way they run along its first shape", () => {
  // As with RL4, whose Trips both ways share one shape, a Trip can run its own shape backwards.
  const { placed } = place(
    [line('R4', 'R4', 'R4_INV')],
    [shape('R4', [0, 0], [10000, 0]), shape('R4_INV', [10000, 0], [0, 0])],
    [station('A', 0, 0), station('C', 10000, 0)],
    trip('east', 'R4', 'R4', 'A C'),
    trip('west', 'R4', 'R4_INV', 'C A'),
    trip('east on R4_INV', 'R4', 'R4_INV', 'A C'),
    trip('west on R4', 'R4', 'R4', 'C A'),
  );
  expect(placed.map((t) => [t.id, t.direction])).toEqual([
    ['east', 0],
    ['west', 1],
    ['east on R4_INV', 0],
    ['west on R4', 1],
  ]);
});

test("tells them apart beyond the end of the Line's first shape too, as between Manresa and Rajadell", () => {
  // R4_INV's track runs on from Manresa, where R4's first shape ends, to Rajadell.
  const { placed } = place(
    [line('R4', 'R4', 'R4_INV')],
    [shape('R4', [0, 0], [10000, 0]), shape('R4_INV', [20000, 0], [0, 0])],
    [station('Manresa', 10000, 12), station('Rajadell', 20000, 0)],
    trip('on to Rajadell', 'R4', 'R4_INV', 'Manresa Rajadell'),
    trip('from Rajadell', 'R4', 'R4_INV', 'Rajadell Manresa'),
  );
  expect(placed.map((t) => [t.id, t.direction])).toEqual([
    ['on to Rajadell', 0],
    ['from Rajadell', 1],
  ]);
});

test("where its track passes a Station twice, places it where the Trip passes it, as at L'Aldea on the way to and from Tortosa", () => {
  // R16's track runs out to Tortosa and back to L'Aldea before it carries on south, to Ulldecona.
  const { dist } = place(
    [line('R16', 'R16')],
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
    [line('R11', 'R11')],
    [shape('R11', [0, 0], [20000, 0], [22000, 0])],
    [station('Figueres', 0, 15), station('Portbou', 20000, -10), station('Cerbère', 22000, 30)],
    trip('turns back', 'R11', 'R11', 'Figueres Portbou Cerbère Portbou'),
  );
  expect(dist('turns back')).toEqual([0, 20000, 22000, 20000]);
});

test("leaves out and reports a Trip calling at a Station off its track, as Estació de França is off R2N's", () => {
  const { placed, log } = place(
    [line('R2N', 'R2N')],
    [shape('R2N', [0, 0], [10000, 0])],
    [station('Sants', 0, 0), station('Gràcia', 2500, 40), station('França', 3000, 1800)],
    trip('to França', 'R2N', 'R2N', 'Sants Gràcia França'),
    trip('to Gràcia', 'R2N', 'R2N', 'Sants Gràcia'),
  );
  expect(placed.map((t) => t.id)).toEqual(['to Gràcia']);
  expect(log).toEqual(['to França is left out: França is 1.8 km off its track']);
});

test("leaves out and reports a Trip that would have to run faster than its Network's top speed, as R16's past Tortosa", () => {
  // R16's track from Tortosa to Ulldecona comes back no nearer than a kilometre to L'Aldea, where its
  // Trains turn back, so a Trip from Tortosa would have to run past Tortosa again on its way south.
  const { placed, log } = place(
    [line('R16', 'R16')],
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
});
