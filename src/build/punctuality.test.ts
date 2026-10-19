import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import type { Bundle, Snapshot, Trip } from '../bundle.ts';
import { KEEP, trainAt, type Received } from '../engine.ts';
import { EUSKOTREN, METRO, NETWORKS } from '../networks.ts';
import { joinParts, partsOf, recorded, recordDay, runsOf, type Day } from './punctuality.ts';

/** A fixture of src/fixtures/, its Networks' live data read as src/networks.ts has it now: a bundle from before #241 carries none. */
function fixture(name: string): { bundle: Bundle; received: Received[] } {
  const recorded = JSON.parse(gunzipSync(readFileSync(new URL(`../fixtures/${name}`, import.meta.url))).toString());
  for (const network of recorded.bundle.networks) network.live = NETWORKS.find((n) => n.id === network.id)?.live;
  return recorded;
}

// 45 minutes of production snapshots of Rodalies, FGC, TRAM and the Metro as the map received them, every 20 s
// from 15:57 to 16:42 on Friday 25 September 2026, and that day's bundle cut to the Trips they could name, which
// stands for the day's Trips file here.
const RECORDED = fixture('replay-2026-09-25.json.gz');

/** The day of a bundle whose Trips are its own, as the job hands recordDay() its Trips file, stamped. */
const dayOf = (bundle: Bundle): Day => ({
  date: bundle.serviceDay,
  noonMinus12h: bundle.noonMinus12h,
  trips: bundle.trips,
  files: (network) => ({ trips: `days/${bundle.serviceDay}-${network}.json`, track: `days/track-${network}.json` }),
  commit: 'c0ffee',
  rules: 'engine-hash',
});

/** The snapshots the map keeps as the one at `i` arrives, which it draws by until the next. */
const kept = (received: Received[], i: number) => received.slice(0, i + 1).filter((r) => r.at > (received[i]?.at ?? NaN) - KEEP);

test("replaying 25 September's 45 minutes keeps each Call's Delay as the follow panel had it as the Train reached the Call, and where it came from", () => {
  const { bundle, received } = RECORDED;
  const records = recordDay(bundle, dayOf(bundle), received);
  // A Call's Delay and its byte, by its Trip and Station: its Trip is the one at that index of its Network's
  // Trips in the day's file, and the Call is the Trip's at that index.
  const call = (network: string, id: string, station: string) => {
    const trips = bundle.trips.filter((t) => bundle.lines.find((l) => l.id === t.line)?.network === network);
    const [i, trip] = [trips.findIndex((t) => t.id === id), trips.find((t) => t.id === id) as Trip];
    const c = trip.calls.findIndex((x) => x.station === station);
    const record = records.get(network);
    return [record?.delays[i]?.[c], record?.from[i]?.[c]];
  };
  // The Train's Delay as the follow panel shows it, as the snapshot at `i` arrives.
  const card = (id: string, i: number) => Math.round(trainAt(bundle, received[i]?.at ?? NaN, kept(received, i), id)?.delay ?? NaN);
  const report = (id: string, i: number) => received[i]?.snapshot.reports.find((r) => r.trip === id);

  // One of FGC's Trains on the Llobregat–Anoia line reaches Sant Boi at 15:57:11, the first snapshot, 4 s late by its
  // GPS: measured.
  const S = 'fgc:625cdae21f726b1bb950|612dc4e706';
  expect(report(S, 0)?.position).toHaveProperty('lon');
  expect(call('fgc', S, 'fgc:BO')).toEqual([4, 1]);
  expect(card(S, 0)).toBe(4);
  // One that FGC has at Provença, with no position of its own, reaches Plaça de Catalunya, its last Call,
  // 128 s late by FGC's time for it: the operator's.
  const toPC = 'fgc:6c4bdae202757640fd55c1|6f2dc7eb04';
  expect(report(toPC, 0)?.position).toEqual({ near: 'fgc:PR' });
  expect(call('fgc', toPC, 'fgc:PC')).toEqual([128, 3]);
  expect(card(toPC, 0)).toBe(128);
  // TRAM's: one whose report says how far along its Trip it is, measured, and one TRAM names at a Station, its figure.
  const [along, atStop] = ['tram:TBX:2579_0455', 'tram:TBX:2579_0359'];
  expect(report(along, 0)?.position).toEqual({ along: 3583 });
  expect(call('tram', along, 'tram:ST-180')).toEqual([card(along, 0), 1]);
  expect(report(atStop, 0)?.position).toEqual({ near: 'tram:1012' });
  expect(call('tram', atStop, 'tram:ST-182')).toEqual([card(atStop, 0), 3]);

  // R3 77304, 270 s late by its GPS until Renfe pins it to Sant Martí de Centelles at 15:57:46 with its own figure of
  // 6 minutes, reaches the Station at 15:58:32 carrying on its GPS Delay, as the map draws it (#33).
  const R3 = 'rodalies:5166V77304R3';
  expect(report(R3, 4)?.position).toEqual({ near: 'adif:77104' });
  expect(report(R3, 4)?.delay).toBe(360);
  expect(call('rodalies', R3, 'adif:77104')).toEqual([270, 2]);
  expect(card(R3, 4)).toBe(270);
  // R8 78650 reaches Sant Cugat Coll Favà at the first snapshot by its first GPS fix, which no report before it
  // confirms: measured, and flagged (pick 5).
  const R8 = 'rodalies:5166V78650R8';
  expect(call('rodalies', R8, 'adif:72502')).toEqual([card(R8, 0), 1 + 8]);
  // R2N 28440's last report, at 16:00:46, has it at El Prat Aeroport, its last Station, which the map has it
  // reach at 16:02:16, Scheduled by then, a minute after live data last placed it: its last-known Delay, marked so (pick 4).
  const R2N = 'rodalies:5166V28440R2N';
  expect(received.slice(13, 16).some((r) => r.snapshot.reports.some((x) => x.trip === R2N))).toBe(false);
  expect(call('rodalies', R2N, 'adif:72400')).toEqual([363, 4]);
  expect(card(R2N, 15)).toBe(363);
}, 60_000);

test("a day's record counts apart the Trips its operator Cancelled, those live data never named and the reports of Trips the day hasn't, and leaves the Metro out", () => {
  const { bundle: recorded, received } = RECORDED;
  // A TRAM Trip that no snapshot names, as a Train live data never reported would be: the fixture's own are each named.
  const tram = recorded.trips.find((t) => t.id.startsWith('tram:')) as Trip;
  const bundle = { ...recorded, trips: [...recorded.trips, { ...tram, id: 'tram:TBX:unnamed' }] };
  const records = recordDay(bundle, dayOf(bundle), received);
  expect([...records.keys()]).toEqual(['rodalies', 'fgc', 'tram']);
  const indexIn = (network: string, id: string) => bundle.trips.filter((t) => t.id.startsWith(`${network}:`)).findIndex((t) => t.id === id);
  // Renfe flags 15 Rodalies Trips CANCELED over the 45 minutes, R1 25757 among them. Nine never run while it does.
  // The other six, all R4's, it reports running between its flags, as R4 77640, 26 and 29 minutes late at L'Hospitalet
  // de Llobregat and Barcelona-Sants: they keep the Delays they had, and aren't Cancelled.
  const rodalies = records.get('rodalies');
  expect(rodalies?.cancelled).toHaveLength(9);
  expect(rodalies?.cancelled).toContain(indexIn('rodalies', 'rodalies:5166V25757R1'));
  expect(rodalies?.cancelled.map((i) => rodalies.delays[i])).toEqual(Array(9).fill(null));
  const R4 = indexIn('rodalies', 'rodalies:5166V77640R4');
  expect(rodalies?.cancelled).not.toContain(R4);
  expect(rodalies?.delays[R4]?.filter((delay) => delay !== null)).toEqual([1548, 1760]);
  expect(records.get('tram')?.unreported).toEqual([indexIn('tram', 'tram:TBX:unnamed')]);
  expect(rodalies?.unreported).toEqual([]);
  // FGC names six Trips of another service that the day's Trips haven't, in 35 reports, each counted once however
  // many snapshots repeat it (unmatched()).
  expect(records.get('fgc')?.unmatched).toEqual({ reports: 35, trips: 6 });
  expect(rodalies?.unmatched).toEqual({ reports: 0, trips: 0 });
}, 60_000);

test("Euskotren's Trips are recorded though the map shows no Delay for them, and the Metro's aren't (#825)", () => {
  expect(EUSKOTREN.live?.delay).toBe('none');
  expect([recorded(EUSKOTREN), recorded(METRO)]).toEqual([true, false]);
});

test("a Call at a Station its operator has said the Train won't stop at holds no Delay, and is marked so", () => {
  // 7 October 2026, 13:00 to 13:45: Renfe cuts R4 77424 from Sant Vicenç de Calders to Manresa short at
  // Barcelona-Sants, skipping its 22 Stations from Barcelona Plaça de Catalunya on (#346). The map has it come to
  // Plaça de Catalunya at 13:03:12, Live, running through as it runs its Trip on past where it ends.
  const { bundle, received } = fixture('replay-2026-10-07.json.gz');
  const rodalies = recordDay(bundle, dayOf(bundle), received).get('rodalies');
  const i = bundle.trips.filter((t) => t.id.startsWith('rodalies:')).findIndex((t) => t.id === 'rodalies:5178X77424R4');
  expect(received[9]?.snapshot.skipped?.find((s) => s.trip === 'rodalies:5178X77424R4')?.stations).toHaveLength(22);
  expect([rodalies?.delays[i]?.[18], rodalies?.from[i]?.[18]]).toEqual([null, 0]);
}, 60_000);

test("a day's record carries its stamp, the runs it saw of the fetcher's 4,320 and the minutes of the 1,440 each Network's feed worked", () => {
  const { bundle } = RECORDED;
  // A run every 20 s from the day's 00:00, and the hour before and after it, but for an hour the fetcher stopped,
  // from 03:00, with TRAM's feed failing from 10:00 to 10:30, as when it backs off (#128): its last success stays.
  const hour = 3600_000;
  const at = (h: number) => bundle.noonMinus12h + h * hour;
  const runs: Received[] = [];
  for (let t = at(-1); t < at(25); t += 20_000) {
    if (t >= at(3) && t < at(4)) continue;
    const feed = (lastSuccess: number) => ({ lastSuccess, lastAttempt: t, status: 'ok', every: 20_000 });
    runs.push({ at: t, snapshot: { generated: t, reports: [], feeds: { rodalies: feed(t), fgc: feed(t), tram: feed(t >= at(10) && t < at(10.5) ? at(10) : t) } } });
  }
  const records = recordDay(bundle, dayOf(bundle), runs);
  expect(records.get('tram')).toMatchObject({ day: '2026-09-25', trips: 'days/2026-09-25-tram.json', track: 'days/track-tram.json', commit: 'c0ffee', rules: 'engine-hash', runs: 4320 - 180 });
  // TRAM's last success 60 s old, three of its updates, is a failing feed's (the engine's): from 10:01 to 10:29.
  expect(Object.fromEntries([...records].map(([network, { feeds }]) => [network, feeds]))).toEqual({ rodalies: { rodalies: 1380 }, fgc: { fgc: 1380 }, tram: { tram: 1380 - 29 } });
  expect(Object.keys(records.get('tram') ?? {})).toEqual(['day', 'trips', 'track', 'commit', 'rules', 'runs', 'feeds', 'cancelled', 'unreported', 'unmatched', 'delays', 'from']);
}, 60_000);

test('replaying a day again, in another run, gives the same bytes', () => {
  const { bundle, received } = RECORDED;
  const bytes = (snapshots: Received[]) => JSON.stringify([...recordDay(bundle, dayOf(bundle), snapshots)]);
  // As another run of the job reads them: the same snapshots, parsed anew, which the engine has never seen.
  expect(bytes(received)).toBe(bytes(structuredClone(received)));
}, 60_000);

test("a run's snapshot is compacted as a part for each Network, TRAM's holding only TRAM's, and its parts make it again", () => {
  const feed = { lastSuccess: 1792238410869, lastAttempt: 1792238410869, status: 'ok', every: 20_000 };
  const [rodalies, byNumber, tram, metro, rack, cancelled] = [
    { trip: 'rodalies:5166V77304R3', at: 1792238389000, delay: 240, position: { lon: 2.2426898, lat: 41.783157 } },
    { number: '03933', at: 1792238389000, delay: 1740, position: { lon: 0.5629774, lat: 41.62272 } },
    { trip: 'tram:TBX:2549_0365', at: 1792238410869, position: { near: 'tram:1029' }, delay: 102 },
    { block: { line: 'metro:L1', number: '105' }, headsign: 'Fondo', at: 1792238390826, position: { next: { station: 'tmb:1.113', at: 1792238486000 } } },
    { trip: 'fgc:6350da917476|652dc7e005', line: 'fgc:MM', at: 1792238286386, position: { lon: 1.837584, lat: 41.611957 } },
    { trip: 'rodalies:5166V25757R1', at: 1792238389000, cancelled: true as const },
  ];
  const [skips, skipsByNumber] = [{ trip: 'rodalies:5178X77424R4', stations: ['adif:78805'], since: 1792225493000 }, { number: '03933', stations: ['adif:71801'], since: 1792225691000 }];
  const snapshot: Snapshot = {
    generated: 1792238410869,
    feeds: { rodalies: feed, 'ave-larga-distancia': feed, 'media-distancia-avant': feed, fgc: feed, tram: feed, metro: feed },
    reports: [rodalies, byNumber, rack, tram, metro, cancelled],
    skipped: [skips, skipsByNumber],
  };
  const parts = partsOf(snapshot);
  // By the Networks' IDs. A report by Train number, as Renfe's long-distance live data makes, names no Network, and
  // goes with AVE y Larga Distancia's, the first whose live data names Trains by number, as the engine has it.
  expect(parts.map(([network]) => network)).toEqual(['ave-larga-distancia', 'fgc', 'media-distancia-avant', 'metro', 'rodalies', 'tram']);
  const part = new Map(parts);
  expect(part.get('tram')).toEqual({ generated: snapshot.generated, feeds: { tram: feed }, reports: [tram] });
  expect(part.get('ave-larga-distancia')).toEqual({ generated: snapshot.generated, feeds: { 'ave-larga-distancia': feed }, reports: [byNumber], skipped: [skipsByNumber] });
  expect(part.get('media-distancia-avant')).toEqual({ generated: snapshot.generated, feeds: { 'media-distancia-avant': feed }, reports: [] });
  expect(part.get('rodalies')).toEqual({ generated: snapshot.generated, feeds: { rodalies: feed }, reports: [rodalies, cancelled], skipped: [skips] });
  // Its parts in that order make the snapshot again, each Network's reports in their own order, and so do the parts
  // of that: a day replayed from its compacted files is the day replayed from its chunks.
  const joined = joinParts(parts.map(([, p]) => p));
  expect(joined).toEqual({ ...snapshot, feeds: { 'ave-larga-distancia': feed, fgc: feed, 'media-distancia-avant': feed, metro: feed, rodalies: feed, tram: feed }, reports: [byNumber, rack, metro, rodalies, cancelled, tram], skipped: [skipsByNumber, skips] });
  expect(joinParts(partsOf(joined).map(([, p]) => p))).toEqual(joined);
});

test("a day's compacted files make its runs again, so that it's worked out again from them, to the byte, once its chunks have gone", () => {
  const { bundle, received } = RECORDED;
  // As the job replays a day from its chunks: each run's parts joined again, and each part a line of its Network's file.
  const files = new Map<string, string[]>();
  const replayed = received.map(({ snapshot }) => {
    const parts = partsOf(snapshot);
    for (const [network, part] of parts) files.set(network, [...(files.get(network) ?? []), JSON.stringify(part)]);
    return { snapshot: joinParts(parts.map(([, part]) => part)), at: snapshot.generated };
  });
  // Read back as the job reads a compacted day, a file for each Network in order of their IDs.
  const runs = [...runsOf([...files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, lines]) => lines))];
  expect(runs).toEqual(replayed.map((r) => r.snapshot));
  const bytes = (snapshots: Received[]) => JSON.stringify([...recordDay(bundle, dayOf(bundle), snapshots)]);
  expect(bytes(runs.map((snapshot) => ({ snapshot, at: snapshot.generated })))).toBe(bytes(replayed));
}, 60_000);
