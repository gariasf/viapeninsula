// #828 re-measure on 9debb736 (counts at the first free corner, counts over the Stations' names): the branch alone, as the
// first measure's shoot.mts (main's shots and counts reused from it, same capture, mirror and page-clock seconds), at the
// look's four views, light and dark, 390×844 and 1280×800; each shot's counts to counts.jsonl, now with each count's corner
// (TR, TL, BR, BL), the counts a drawn Station's name meets (station-names, station-badge-names) at the same moment, the
// layers' order, and the page's folds and corners against piles() run in Node on the same pills. At Barcelona z12, light,
// after its shot: how often a count moves corner in 10 s (corners.jsonl). At Passeig de Gràcia z13: a tap on a "+n", one
// elsewhere, shot each time, and on the laptop the pointer over a count (taps.jsonl).
//   cd <SP>/wt-828 && node ../828/measure2/shoot2.mts [devices: phone,laptop] [views: comma ids]
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
const [devicesArg = 'phone,laptop', viewsArg = ''] = process.argv.slice(2);
process.argv.splice(2, process.argv.length, 'branch');
const { CAPTURE, CLEAR_SPOT, MIRROR, scene, T0, TREES, wait } = await import('../measure/shoot.mts');
const { LIVE_URL } = await import('../../wt-828/src/bundle.ts');
const { build, DEVICES, launch, openMap, ready } = await import('../../wt-828/src/page/page.ts');
const { withSlots } = await import('../../wt-828/src/page/slots.ts');
const { boxOf, FOLLOWED_TEXT, nameBoxOf, pillText, SMALL_TEXT } = await import('../../wt-828/src/web/pill.ts');
const { piles } = await import('../../wt-828/src/web/spread.ts');
const { covered } = await import('../../wt-828-main/src/web/spread.ts');
type Device = 'phone' | 'laptop';
type Scene = Awaited<ReturnType<typeof scene>>;
type MapPage = Awaited<ReturnType<typeof openMap>>;

const HERE = path.dirname(new URL(import.meta.url).pathname);
const [SHOTS, COUNTS, TAPS, CORNERS] = [path.join(HERE, 'shots'), path.join(HERE, 'counts.jsonl'), path.join(HERE, 'taps.jsonl'), path.join(HERE, 'corners.jsonl')];
const VIEWS = [
  { id: 'bcn-z12', lat: 41.389, lon: 2.1455, zoom: 12, at: 40 },
  { id: 'bcn-z13-pg', lat: 41.3893, lon: 2.1675, zoom: 13, at: 60 },
  { id: 'bcn-z13-sants', lat: 41.3792, lon: 2.1405, zoom: 13, at: 80 },
  { id: 'mad-z12-sol', lat: 40.4168, lon: -3.7038, zoom: 12, at: 110 },
].filter((v) => !viewsArg || viewsArg.split(',').includes(v.id));
const halo = ([w, h]: [number, number]): [number, number] => [w + 1.5, h + 1.5];
const meets = (a: { at: number[]; box: number[] }, b: { at: number[]; box: number[] }) => Math.abs(a.at[0]! - b.at[0]!) < a.box[0]! + b.box[0]! && Math.abs(a.at[1]! - b.at[1]!) < a.box[1]! + b.box[1]!;
const same = (a: Iterable<string>, b: Iterable<string>) => [...a].sort().join() === [...b].sort().join();
/** A count's corner of its pill, from its offset's signs (main.ts: countAt = corner × the pill's box, in ems). */
const cornerOf = (countAt: number[]) => (countAt[1]! < 0 ? 'T' : 'B') + (countAt[0]! > 0 ? 'R' : 'L');
const append = (file: string, row: object) => fs.appendFileSync(file, JSON.stringify(row) + '\n');

/** A shot's counts, as the first measure's tally(), with each count's corner, and the page's folds and corners against piles(). */
export function tally(s: Scene, kept = new Set<string>()) {
  const all = s.pills.map((p) => ({ ...p, box: halo(boxOf(p.outline as never, p.width, p.followed ? FOLLOWED_TEXT : pillText(p.pillZoom!))), nameBox: nameBoxOf(p.width, pillText(p.pillZoom!)) }));
  const named = (ps: typeof all) => ps.map((p) => ({ id: p.id, at: p.at, box: p.box, name: p.nameBox }));
  const followed = all.find((p) => p.followed)?.id;
  const drawn = all.filter((p) => !p.folded);
  const blank = covered(named(drawn), followed);
  const rule = piles(named(all), followed, kept, halo(boxOf('round', s.widths['+8']!, SMALL_TEXT)));
  const counts = drawn.filter((p) => p.more > 0).map((c) => ({ c, at: [c.at[0] + c.countAt![0] * SMALL_TEXT, c.at[1] + c.countAt![1] * SMALL_TEXT], box: halo(boxOf('round', s.widths[`+${c.more}`]!, SMALL_TEXT)), corner: cornerOf(c.countAt!) }));
  const under = drawn.flatMap((p) => counts.filter(({ c, at, box }) => c.id !== p.id && (!p.followed || c.followed) && meets({ at, box }, { at: p.at, box: p.nameBox })).map(({ c, at }) => `${c.name}+${c.more} on ${p.name} ${Math.round(at[0] - p.at[0])},${Math.round(at[1] - p.at[1])}`));
  const pageFolded = all.filter((p) => p.folded).map((p) => p.id);
  const corners = Object.fromEntries(['TR', 'TL', 'BR', 'BL'].map((k) => [k, counts.filter((c) => c.corner === k).length]));
  return {
    all,
    drawn,
    rule,
    blank,
    counts,
    row: {
      clock: s.clock,
      pills: drawn.length,
      live: drawn.filter((p) => p.live).length,
      blank: blank.size,
      blankLive: drawn.filter((p) => blank.has(p.id) && p.live).length,
      folded: pageFolded.length,
      counted: drawn.flatMap((p) => (p.more > 0 ? [p.more] : [])).sort((a, b) => b - a),
      corners,
      namesUnderCount: new Set(under.map((u) => u.split(' on ')[1])).size,
      underCount: under,
      // The check: the page folds and puts its counts exactly as piles() does here.
      foldsAsRule: same(pageFolded, [...rule.values()].flatMap((p) => p.folded)),
      cornersAsRule: counts.every(({ c, corner }) => rule.get(c.id)?.folded.length === c.more && cornerOf(rule.get(c.id)!.corner) === corner) && rule.size === counts.length,
    },
  };
}

/** The places' names drawn (`station-names`, as the look counted them), and those a drawn pill's box overlaps. */
const NAMES = (boxes: number[][]) => {
  const map = window.map;
  const id = (f: { properties: Record<string, unknown> }) => String(f.properties.id ?? f.properties.name);
  const over = new Set<string>();
  for (const [x, y, w, h] of boxes) for (const f of map.queryRenderedFeatures([[x! - w!, y! - h!], [x! + w!, y! + h!]], { layers: ['station-names'] })) over.add(id(f));
  return { names: new Set(map.queryRenderedFeatures({ layers: ['station-names'] }).map(id)).size, namesOverlapped: over.size };
};
/** Of the counts' boxes, the names of drawn Stations' (`station-names`) and badges' (`station-badge-names`) names each meets. */
const COUNT_NAMES = (boxes: number[][]) => boxes.map(([x, y, w, h]) => window.map.queryRenderedFeatures([[x! - w!, y! - h!], [x! + w!, y! + h!]], { layers: ['station-names', 'station-badge-names'] }).map((f) => String(f.properties.name ?? f.properties.id).replace(/\n/g, ' ')));
/** The layers #828 orders, in the style's order, and whether they're as the picks have them (pills < names < badges' names < counts < the followed Train's). */
const ORDER = () => {
  const ids = window.map.getStyle().layers.map((l) => l.id);
  const want = ['train-pills', 'station-names', 'station-badge-names', 'train-counts', 'train-pills-followed', 'train-counts-followed'];
  const at = want.map((id) => ids.indexOf(id));
  return { order: want.filter((id) => ids.includes(id)).sort((a, b) => ids.indexOf(a) - ids.indexOf(b)).join(' < '), orderAsPicked: at.every((i, n) => i >= 0 && (n === 0 || i > at[n - 1]!)) };
};
/**
 * For `ms`, every frame: the counts drawn in view (top pills with "+n", not folded), by their Trains' IDs, and how often one
 * drawn in two frames running is at another corner in the second (a switch), with its count the same or not.
 */
const CORNER_SWITCHES = (ms: number) =>
  new Promise<object>((done) => {
    const map = window.map;
    type P = { id: string; name: string; pillZoom?: number; folded?: boolean; more?: number; countAt?: [number, number] };
    const corner = (c: [number, number]) => (c[1] < 0 ? 'T' : 'B') + (c[0] > 0 ? 'R' : 'L');
    let last = new Map<string, { corner: string; more: number }>();
    const [seen, switched, examples] = [new Set<string>(), new Map<string, number>(), [] as string[]];
    let [frames, switches, samePile, appeared, gone, changed] = [0, 0, 0, 0, 0, 0];
    let prevData: unknown;
    const end = performance.now() + ms;
    const tick = () => {
      const [bounds, zoom] = [map.getBounds(), map.getZoom()];
      const data = (map.getSource('trains') as import('maplibre-gl').GeoJSONSource).serialize().data as GeoJSON.FeatureCollection<GeoJSON.Point, P>;
      frames++;
      if (data !== prevData) changed++;
      prevData = data;
      const now = new Map<string, { corner: string; more: number }>();
      for (const { properties: p, geometry } of data.features) {
        if (!p.more || p.folded || p.pillZoom == null || zoom < p.pillZoom || !bounds.contains(geometry.coordinates as [number, number])) continue;
        const c = { corner: corner(p.countAt!), more: p.more };
        now.set(p.id, c);
        seen.add(p.id);
        const was = last.get(p.id);
        if (!was) appeared++;
        else if (was.corner !== c.corner) {
          switches++;
          switched.set(p.id, (switched.get(p.id) ?? 0) + 1);
          if (was.more === c.more) samePile++;
          if (examples.length < 12) examples.push(`${p.name}+${was.more} ${was.corner}→${c.corner}${was.more === c.more ? '' : ` +${c.more}`} at ${Math.round(ms - (end - performance.now()))} ms`);
        }
      }
      for (const id of last.keys()) if (!now.has(id)) gone++;
      last = now;
      if (performance.now() < end) requestAnimationFrame(tick);
      else done({ ms, frames, framesWithNewData: changed, counted: seen.size, switches, samePile, countsThatSwitched: switched.size, mostSwitchesOfOne: Math.max(0, ...switched.values()), appeared, gone, examples });
    };
    requestAnimationFrame(tick);
  });

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
  const members = [target.id, ...(t0.rule.get(target.id)?.folded ?? [])];
  const nameOf = new Map(t0.all.map((p) => [p.id, p.name]));
  const countOf = (p: { at: number[]; countAt?: number[] }) => [p.at[0]! + p.countAt![0]! * SMALL_TEXT, p.at[1]! + p.countAt![1]! * SMALL_TEXT];
  row('before', s0, { target: `${target.name}+${target.more}`, corner: cornerOf(target.countAt!), at: target.at, members: members.map((id) => nameOf.get(id)), tapAt: countOf(target), counts: t0.row });
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
    // Spread Trains that took in a Train from outside the pile, shown "+n".
    tookIn: members.filter((id) => by1.get(id) && !by1.get(id)!.folded && by1.get(id)!.more > 0).map((id) => `${nameOf.get(id)}+${by1.get(id)!.more}`),
    followed: t1.all.find((p) => p.followed)?.name ?? null,
    counts: t1.row,
  });
  const spot = (await m.page.evaluate(CLEAR_SPOT, [clear, 30] as [number[], number])) ?? (await m.page.evaluate(CLEAR_SPOT, [clear, 23] as [number[], number]));
  if (!spot) return row('none', s1, { note: 'no clear spot to tap elsewhere' });
  await press(spot);
  await wait(1500);
  await shot('folded');
  const s2 = await scene(m.page);
  const t2 = tally(s2);
  const by2 = new Map(t2.all.map((p) => [p.id, p]));
  row('folded', s2, { spot, target: `${target.name}+${by2.get(target.id)?.more ?? 0}`, refolded: members.slice(1).filter((id) => by2.get(id)?.folded).length, of: members.length - 1, followed: t2.all.find((p) => p.followed)?.name ?? null, counts: t2.row });
  if (device !== 'laptop') return;
  // The pointer over a count: only the cursor changes, as no layer of the Trains' reads a feature's state. The pointer is
  // on the clear spot ("folded" shot, cursor read now), then on the count, shot 0.4 s later.
  const away = await m.page.evaluate(() => window.map.getCanvas().style.cursor);
  const host = t2.drawn.find((p) => p.id === target.id && p.more > 0) ?? t2.drawn.filter((p) => p.more > 0 && inside(p.at))[0];
  if (!host) return row('none', s2, { note: 'no count to point at' });
  await m.page.mouse.move(...(countOf(host) as [number, number]));
  await wait(400);
  await shot('hover');
  const cursor = await m.page.evaluate(() => window.map.getCanvas().style.cursor);
  row('hover', await scene(m.page), { target: `${host.name}+${host.more}`, at: host.at, pointAt: countOf(host), cursorAway: away, cursor });
  await m.page.mouse.move(spot[0], spot[1]);
}

async function shoot(browser: Browser, dist: string, device: Device, scheme: 'light' | 'dark') {
  const first = VIEWS[0]!;
  const m = await openMap(browser, { device, scheme, dist, out: MIRROR, at: CAPTURE, hash: `#map=${first.zoom}/${first.lat}/${first.lon}` });
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
    await m.page.screenshot({ path: path.join(SHOTS, `branch-${view.id}-${device}-${scheme}.png`) });
    const s = await scene(m.page);
    const { drawn, counts, row: counted } = tally(s);
    const [names, onNames, order] = await Promise.all([
      m.page.evaluate(NAMES, drawn.map((p) => [...p.at, ...p.box])),
      m.page.evaluate(COUNT_NAMES, counts.map(({ at, box }) => [...at, ...box])),
      m.page.evaluate(ORDER),
    ]);
    const row = {
      tree: 'branch',
      view: view.id,
      device,
      scheme,
      late: s.clock - (T0 + view.at * 1000),
      ...counted,
      ...names,
      countsOnAName: onNames.filter((n) => n.length).length,
      countsOnANameByCorner: Object.fromEntries(['TR', 'TL', 'BR', 'BL'].map((k) => [k, counts.filter((c, i) => c.corner === k && onNames[i]!.length).length])),
      countsOnANameExamples: counts.flatMap(({ c, corner }, i) => (onNames[i]!.length ? [`${c.name}+${c.more} ${corner} under ${onNames[i]![0]}`] : [])).slice(0, 10),
      ...order,
    };
    append(COUNTS, row);
    console.log(`branch ${view.id} ${device} ${scheme}: ${row.pills} pills, ${row.blank} blank, ${row.folded} folded (as rule ${row.foldsAsRule}, corners ${row.cornersAsRule}), counts ${row.counted.join(' ') || '-'} at ${JSON.stringify(row.corners)}, ${row.countsOnAName} on a name, names ${row.namesOverlapped}/${row.names} overlapped, ${row.namesUnderCount} drawn names under a count, order ${row.orderAsPicked ? 'ok' : row.order}, late ${row.late} ms`);
    if (view.id === 'bcn-z12' && scheme === 'light') {
      const c = await m.page.evaluate(CORNER_SWITCHES, 10_000);
      append(CORNERS, { device, scheme, view: view.id, from: Math.round((Date.now() - 10_000 - T0) / 100) / 10, ...c });
      console.log(`corners ${device}: ${JSON.stringify(c)}`);
    }
    if (view.id === 'bcn-z13-pg') await taps(m, device, scheme);
  }
  const errors = [...new Set(m.errors)];
  console.log(`branch ${device} ${scheme}: errors ${errors.length ? errors.join(' | ') : 'none'}; live files not in the mirror: ${[...missed].join(' ') || 'none'}`);
  await m.close();
}

if (import.meta.main) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const dist = build(TREES.branch);
  await withSlots(1, async () => {
    const browser = await launch();
    try {
      for (const device of devicesArg.split(',') as Device[]) await Promise.all((['light', 'dark'] as const).map((scheme) => shoot(browser, dist, device, scheme)));
    } finally {
      await browser.close();
    }
  });
}
