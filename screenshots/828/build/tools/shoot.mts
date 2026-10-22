// #828 measure: the picks as built (branch 828-busy-cores) against main, at the look's four views and page-clock seconds, at
// 21 Oct 2026 08:30:19 CEST's peak (the fetcher's capture, through the harness's `at`), with that day's live files from the
// look's mirror, light and dark, 390×844 and 1280×800; each shot's counts to counts.jsonl. On the branch, at Passeig de
// Gràcia z13, a tap on a "+n" pill, then one elsewhere, shot each time, and on the laptop the pointer over a "+n" pill (taps.jsonl).
//   node <SP>/828/measure/shoot.mts <main|branch> [devices: phone,laptop] [views: comma ids]
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { LIVE_URL } from '../../wt-828/src/bundle.ts';
import { build, captured, DEVICES, launch, openMap, ready, type Device, type MapPage } from '../../wt-828/src/page/page.ts';
import { withSlots } from '../../wt-828/src/page/slots.ts';
import { boxOf, FOLLOWED_TEXT, nameBoxOf, pillText, SMALL_TEXT, type Outline } from '../../wt-828/src/web/pill.ts';
import { piles } from '../../wt-828/src/web/spread.ts';
import { covered } from '../../wt-828-main/src/web/spread.ts';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SP = path.resolve(HERE, '../..');
export const [CAPTURE, MIRROR] = [path.join(SP, '828/capture/0630.ndjson.gz'), path.join(SP, '828/look/live')];
// TAG: another run's counts apart, as a re-run of the taps alone (`TAG=-pg … branch phone,laptop bcn-z13-pg`).
const [SHOTS, COUNTS, TAPS] = [path.join(HERE, 'shots'), path.join(HERE, `counts${process.env.TAG ?? ''}.jsonl`), path.join(HERE, 'taps.jsonl')];
export const TREES = { main: path.join(SP, 'wt-828-main'), branch: path.join(SP, 'wt-828') };
const [tree = 'main', devicesArg = 'phone,laptop', viewsArg = ''] = process.argv.slice(2) as [keyof typeof TREES, string, string];
if (!TREES[tree]) throw new Error(`No tree ${tree}`);
export const T0 = captured(CAPTURE).clock;
const PILL_HALO = 1.5;

/** The look's views, and the page-clock second after T0 each is shot at. */
const VIEWS = [
  { id: 'bcn-z12', lat: 41.389, lon: 2.1455, zoom: 12, at: 40 },
  { id: 'bcn-z13-pg', lat: 41.3893, lon: 2.1675, zoom: 13, at: 60 },
  { id: 'bcn-z13-sants', lat: 41.3792, lon: 2.1405, zoom: 13, at: 80 },
  { id: 'mad-z12-sol', lat: 40.4168, lon: -3.7038, zoom: 12, at: 110 },
].filter((v) => !viewsArg || viewsArg.split(',').includes(v.id));

type Scene = Awaited<ReturnType<typeof scene>>;
/** In the page: each Train drawn as a pill whose point is in view, in trains()' order, as covered() and piles() take them, with its name's width at PILL_TEXT, as pillOf() measures it. */
export const SCENE = () => {
  const map = window.map;
  const ctx = document.createElement('canvas').getContext('2d')!;
  const width = (t: string) => ((ctx.font = 'bold 10px "Nunito Sans"'), ctx.measureText(t).width);
  const [bounds, zoom] = [map.getBounds(), map.getZoom()];
  type P = { id: string; name: string; outline: string; pillZoom?: number; followed: boolean; live: boolean; covered?: boolean; folded?: boolean; more?: number; countAt?: [number, number] };
  const features = ((map.getSource('trains') as import('maplibre-gl').GeoJSONSource).serialize().data as GeoJSON.FeatureCollection<GeoJSON.Point, P>).features;
  return {
    clock: Date.now(),
    hash: location.hash,
    popup: !!document.querySelector('.maplibregl-popup'),
    widths: Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`+${i + 1}`, width(`+${i + 1}`)])),
    pills: features.flatMap(({ properties: p, geometry }) => {
      if (p.pillZoom == null || zoom < p.pillZoom || !bounds.contains(geometry.coordinates as [number, number])) return [];
      const { x, y } = map.project(geometry.coordinates as [number, number]);
      return [{ id: p.id, at: [x, y] as [number, number], name: p.name, outline: p.outline, pillZoom: p.pillZoom, followed: p.followed, live: p.live, width: width(p.name), covered: !!p.covered, folded: !!p.folded, more: p.more ?? 0, countAt: p.countAt }];
    }),
  };
};
export const scene = (page: Page) => page.evaluate(SCENE);

const halo = ([w, h]: [number, number]): [number, number] => [w + PILL_HALO, h + PILL_HALO];
const meets = (a: { at: number[]; box: number[] }, b: { at: number[]; box: number[] }) => Math.abs(a.at[0]! - b.at[0]!) < a.box[0]! + b.box[0]! && Math.abs(a.at[1]! - b.at[1]!) < a.box[1]! + b.box[1]!;
const same = (a: Iterable<string>, b: Iterable<string>) => [...a].sort().join() === [...b].sort().join();

/** Each pill's box with its edge, and its name's, as trains() makes them for covered() (main) and piles() (the branch). */
function boxed(s: Scene) {
  return s.pills.map((p) => ({ ...p, box: halo(boxOf(p.outline as Outline, p.width, p.followed ? FOLLOWED_TEXT : pillText(p.pillZoom!))), nameBox: nameBoxOf(p.width, pillText(p.pillZoom!)) }));
}

/**
 * A shot's counts: the pills drawn; those blank by #513's rule (covered(), main's), run on the pills drawn, which main draws
 * blank and which the branch should leave none of; the Trains folded and the counted pills; the drawn pills' names a "+n"
 * count lies on (its box, round, "+n" at SMALL_TEXT with its edge, at its pill's top right corner); and, as checks of the boxes
 * here, main's own blanks and the branch's own folds against the rules run on the same pills.
 */
export function tally(s: Scene, kept = new Set<string>()) {
  const all = boxed(s);
  const named = (ps: typeof all) => ps.map((p) => ({ id: p.id, at: p.at, box: p.box, name: p.nameBox }));
  const followed = all.find((p) => p.followed)?.id;
  const drawn = all.filter((p) => !p.folded);
  const blank = covered(named(drawn), followed);
  const rule = piles(named(all), followed, kept, halo(boxOf('round', s.widths['+8']!, SMALL_TEXT)));
  const counts = drawn.filter((p) => p.more > 0).map((c) => ({ c, at: [c.at[0] + c.countAt![0] * SMALL_TEXT, c.at[1] + c.countAt![1] * SMALL_TEXT], box: halo(boxOf('round', s.widths[`+${c.more}`]!, SMALL_TEXT)) }));
  const under = drawn.flatMap((p) => counts.filter(({ c, at, box }) => c.id !== p.id && (!p.followed || c.followed) && meets({ at, box }, { at: p.at, box: p.nameBox })).map(({ c, at }) => `${c.name}+${c.more} on ${p.name} ${Math.round(at[0] - p.at[0])},${Math.round(at[1] - p.at[1])}`));
  const pageFolded = all.filter((p) => p.folded).map((p) => p.id);
  return {
    all,
    drawn,
    rule,
    blank,
    counts: {
      clock: s.clock,
      pills: drawn.length,
      live: drawn.filter((p) => p.live).length,
      blank: blank.size,
      blankLive: drawn.filter((p) => blank.has(p.id) && p.live).length,
      blankNames: drawn.filter((p) => blank.has(p.id)).map((p) => p.name),
      folded: pageFolded.length,
      counted: drawn.flatMap((p) => (p.more > 0 ? [p.more] : [])).sort((a, b) => b - a),
      namesUnderCount: new Set(under.map((u) => u.split(' on ')[1])).size,
      underCount: under,
      // The checks: main draws blank exactly what covered() finds here; the branch folds exactly what piles() finds here.
      pageBlank: all.filter((p) => p.covered).length,
      blankAsPage: same(all.filter((p) => p.covered).map((p) => p.id), tree === 'main' ? blank : []),
      foldsAsRule: tree === 'main' || same(pageFolded, [...rule.values()].flat()),
    },
  };
}

/** The places' names drawn (`station-names`, the badges' aside, as the look counted them), and those a drawn pill's box overlaps. */
const NAMES = (boxes: number[][]) => {
  const map = window.map;
  const id = (f: { properties: Record<string, unknown> }) => String(f.properties.id ?? f.properties.name);
  const over = new Set<string>();
  for (const [x, y, w, h] of boxes) for (const f of map.queryRenderedFeatures([[x! - w!, y! - h!], [x! + w!, y! + h!]], { layers: ['station-names'] })) over.add(id(f));
  return { names: new Set(map.queryRenderedFeatures({ layers: ['station-names'] }).map(id)).size, namesOverlapped: over.size };
};

/** A spot in `clear` (x0, y0, x1, y1) with nothing of the page's own drawn within `r` px, so that a tap there names no Line and opens no board. */
export const CLEAR_SPOT = ([clear, r]: [number[], number]) => {
  const map = window.map;
  const ours = new Set(['lines', 'rails', 'tracks', 'station-names', 'stations', 'places', 'interchanges', 'station-links', 'closures', 'closure-rails', 'trains', 'mark']);
  const layers = map.getStyle().layers.flatMap((l) => ('source' in l && ours.has(l.source as string) ? [l.id] : []));
  const [x0, y0, x1, y1] = clear as [number, number, number, number];
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const spots: [number, number][] = [];
  for (let y = y0; y <= y1; y += 10) for (let x = x0; x <= x1; x += 10) spots.push([x, y]);
  spots.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  return spots.find(([x, y]) => !map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers }).length);
};

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const append = (file: string, row: object) => fs.appendFileSync(file, JSON.stringify(row) + '\n');

/** On the branch, at Passeig de Gràcia z13: the largest count in the map's clear middle tapped, a tap elsewhere, and on the laptop the pointer over a count. */
async function taps(m: MapPage, device: Device, scheme: string) {
  const { width: W, height: H } = DEVICES[device].viewport;
  const clear = device === 'phone' ? [30, 120, W - 30, H - 170] : [140, 90, W - 70, H - 100];
  const inside = ([x, y]: number[]) => x! > clear[0]! && y! > clear[1]! && x! < clear[2]! && y! < clear[3]!;
  const mid = [(clear[0]! + clear[2]!) / 2, (clear[1]! + clear[3]!) / 2];
  const press = ([x, y]: number[]) => (device === 'phone' ? m.page.touchscreen.tap(x!, y!) : m.page.mouse.click(x!, y!));
  const shot = (state: string) => m.page.screenshot({ path: path.join(SHOTS, `tap-${state}-${device}-${scheme}.png`) });
  const row = (state: string, s: Scene, more: object) => append(TAPS, { device, scheme, state, late: s.clock - (T0 + 60_000), hash: s.hash, popup: s.popup, ...more });
  // The shot first, then the pills read and the tap at once, so that the pile tapped is the one read (piles change as Trains pass).
  await shot('before');
  const s0 = await scene(m.page);
  const t0 = tally(s0);
  const target = t0.drawn.filter((p) => p.more > 0 && inside(p.at)).sort((a, b) => b.more - a.more || Math.hypot(a.at[0] - mid[0]!, a.at[1] - mid[1]!) - Math.hypot(b.at[0] - mid[0]!, b.at[1] - mid[1]!))[0];
  if (!target) return row('none', s0, { note: 'no counted pill in the clear middle' });
  const members = [target.id, ...(t0.rule.get(target.id) ?? [])];
  const nameOf = new Map(t0.all.map((p) => [p.id, p.name]));
  const countOf = (p: { at: number[]; countAt?: number[] }) => [p.at[0]! + p.countAt![0]! * SMALL_TEXT, p.at[1]! + p.countAt![1]! * SMALL_TEXT];
  row('before', s0, { target: `${target.name}+${target.more}`, at: target.at, members: members.map((id) => nameOf.get(id)), tapAt: countOf(target), counts: t0.counts });
  await press(countOf(target));
  await wait(1500);
  await shot('spread');
  const s1 = await scene(m.page);
  const t1 = tally(s1, new Set(members));
  const by1 = new Map(t1.all.map((p) => [p.id, p]));
  const was = new Map(t0.all.map((p) => [p.id, p]));
  row('spread', s1, {
    target: `${target.name}+${by1.get(target.id)?.more ?? 0}`,
    members: members.map((id) => `${nameOf.get(id)}${by1.get(id)?.folded ? ' folded' : ''}${by1.get(id)?.more ? `+${by1.get(id)!.more}` : ''} moved ${Math.round(Math.hypot(by1.get(id)!.at[0] - was.get(id)!.at[0], by1.get(id)!.at[1] - was.get(id)!.at[1]))}px`),
    drawn: members.filter((id) => by1.get(id) && !by1.get(id)!.folded).length,
    // A spread Train under another pill keeps its name, over that pill (held, never folded): those #513's rule finds.
    namesOverAPill: members.filter((id) => t1.blank.has(id)).map((id) => nameOf.get(id)),
    followed: t1.all.find((p) => p.followed)?.name ?? null,
    counts: t1.counts,
  });
  const spot = (await m.page.evaluate(CLEAR_SPOT, [clear, 30] as [number[], number])) ?? (await m.page.evaluate(CLEAR_SPOT, [clear, 23] as [number[], number]));
  if (!spot) return row('none', s1, { note: 'no clear spot to tap elsewhere' });
  await press(spot);
  await wait(1500);
  await shot('folded');
  const s2 = await scene(m.page);
  const t2 = tally(s2);
  const by2 = new Map(t2.all.map((p) => [p.id, p]));
  row('folded', s2, { spot, target: `${target.name}+${by2.get(target.id)?.more ?? 0}`, refolded: members.slice(1).filter((id) => by2.get(id)?.folded).length, of: members.length - 1, followed: t2.all.find((p) => p.followed)?.name ?? null, counts: t2.counts });
  if (device !== 'laptop') return;
  // The pointer over the count: only the cursor changes, as no layer of the Trains' reads a feature's state.
  const host = t2.drawn.find((p) => p.id === target.id && p.more > 0) ?? t2.drawn.filter((p) => p.more > 0 && inside(p.at))[0];
  if (!host) return row('none', s2, { note: 'no count to point at' });
  await m.page.mouse.move(...(countOf(host) as [number, number]));
  await wait(400);
  await shot('hover');
  const cursor = await m.page.evaluate(() => window.map.getCanvas().style.cursor);
  row('hover', await scene(m.page), { target: `${host.name}+${host.more}`, at: host.at, pointAt: countOf(host), cursor });
  await m.page.mouse.move(spot[0], spot[1]);
}

async function shoot(browser: Browser, dist: string, device: Device, scheme: 'light' | 'dark') {
  const first = VIEWS[0]!;
  const m = await openMap(browser, { device, scheme, dist, out: MIRROR, at: CAPTURE, hash: `#map=${first.zoom}/${first.lat}/${first.lon}` });
  // The live files the mirror lacks, which would come from today's bucket.
  const missed = new Set<string>();
  m.page.on('request', (q) => {
    const url = new URL(q.url());
    if (url.origin === LIVE_URL && url.pathname !== '/snapshot.json' && !fs.existsSync(path.join(MIRROR, url.pathname))) missed.add(url.pathname);
  });
  await m.go();
  await ready(m.page, 0);
  for (const view of VIEWS) {
    if (view !== first) await m.page.evaluate(({ lat, lon, zoom }) => window.map.jumpTo({ center: [lon, lat], zoom }), view);
    await m.page.waitForFunction((t) => Date.now() >= t, T0 + view.at * 1000, { timeout: 200_000, polling: 200 });
    await m.page.screenshot({ path: path.join(SHOTS, `${tree}-${view.id}-${device}-${scheme}.png`) });
    const s = await scene(m.page);
    const { drawn, counts } = tally(s);
    const names = await m.page.evaluate(NAMES, drawn.map((p) => [...p.at, ...p.box]));
    const row = { tree, view: view.id, device, scheme, late: s.clock - (T0 + view.at * 1000), ...counts, ...names };
    append(COUNTS, row);
    console.log(`${tree} ${view.id} ${device} ${scheme}: ${row.pills} pills, ${row.blank} blank (page ${row.pageBlank}, as rule ${row.blankAsPage}), ${row.folded} folded (as rule ${row.foldsAsRule}), counts ${row.counted.join(' ') || '-'}, names ${row.namesOverlapped}/${row.names} overlapped, ${row.namesUnderCount} under a count, late ${row.late} ms`);
    if (tree === 'branch' && view.id === 'bcn-z13-pg') await taps(m, device, scheme);
  }
  const errors = [...new Set(m.errors)];
  console.log(`${tree} ${device} ${scheme}: errors ${errors.length ? errors.join(' | ') : 'none'}; live files not in the mirror: ${[...missed].join(' ') || 'none'}`);
  await m.close();
}

if (import.meta.main) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dist = build(TREES[tree]);
  await withSlots(1, async () => {
    const browser = await launch();
    try {
      for (const device of devicesArg.split(',') as Device[]) await Promise.all((['light', 'dark'] as const).map((scheme) => shoot(browser, dist, device, scheme)));
    } finally {
      await browser.close();
    }
  });
}
