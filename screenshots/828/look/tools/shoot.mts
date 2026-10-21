// #828 look: shoots one variant (or main, "A") of the pills' piles at this morning's peak snapshot, at four views, light and dark.
//   cd <SP>/wt-828v && node ../828/look/shoot.mts <variant: A|B|C|D|AN|BN…> [devices: phone,laptop] [views: comma ids]
// Each page: the faked clock from the snapshot's `generated` + 5 s, the snapshot fulfilled on every poll, the live files the page
// reads mirrored into ../828/look/live (and served from there), a view at a fixed page-clock time, so every variant's shot is the same moment.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Browser } from 'playwright-core';
import { launch, openMap, ready, type Device } from '../../wt-828v/src/page/page.ts';
import { withSlots } from '../../wt-828v/src/page/slots.ts';

const LOOK = path.dirname(new URL(import.meta.url).pathname);
const [MIRROR, SHOTS, COUNTS] = [path.join(LOOK, 'live'), path.join(LOOK, 'shots'), path.join(LOOK, 'counts.jsonl')];
const LIVE = 'https://viapeninsula-live.gariasf.com';
const dist = path.resolve('.cache/page/dist');
const [variant = 'A', devicesArg = 'phone,laptop', viewsArg = ''] = process.argv.slice(2);
const snapshot = zlib.gunzipSync(fs.readFileSync(path.join(LOOK, '../capture/0630.ndjson.gz'))).toString().split('\n')[0]!;
const T0 = (JSON.parse(snapshot) as { generated: number }).generated + 5000;

/** The views, and the page-clock second after T0 each is shot at. */
const VIEWS = [
  { id: 'bcn-z12', lat: 41.389, lon: 2.1455, zoom: 12, at: 40 },
  { id: 'bcn-z13-pg', lat: 41.3893, lon: 2.1675, zoom: 13, at: 60 },
  { id: 'bcn-z13-sants', lat: 41.3792, lon: 2.1405, zoom: 13, at: 80 },
  { id: 'mad-z12-sol', lat: 40.4168, lon: -3.7038, zoom: 12, at: 110 },
].filter((v) => !viewsArg || viewsArg.split(',').includes(v.id));

/** What's drawn, counted in the page: pills, blank ones, piles (boxes touching, chained), names a pill or dot overlaps. */
const COUNT = () => {
  type P = { id: string; at: [number, number]; box: [number, number] };
  const { inView, propsOf, aside } = (window as unknown as { __v828: { inView: P[]; propsOf: Map<string, Record<string, unknown>>; aside: Map<string, number> } }).__v828;
  const props = (p: P) => propsOf.get(p.id) ?? {};
  const drawn = inView.filter((p) => !props(p).hidden);
  const dots = inView.filter((p) => props(p).dot);
  const blank = drawn.filter((p) => props(p).covered);
  const touches = (a: P, b: P) => Math.abs(a.at[0] - b.at[0]) < a.box[0] + b.box[0] && Math.abs(a.at[1] - b.at[1]) < a.box[1] + b.box[1];
  const pilesOf = (list: P[]) => {
    const parent = list.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (touches(list[i]!, list[j]!)) parent[root(j)] = root(i);
    const by = new Map<number, P[]>();
    list.forEach((p, i) => by.set(root(i), [...(by.get(root(i)) ?? []), p]));
    return [...by.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  };
  const piles = pilesOf(drawn);
  const boxOf = (g: P[]) => [Math.min(...g.map((p) => p.at[0] - p.box[0])), Math.min(...g.map((p) => p.at[1] - p.box[1])), Math.max(...g.map((p) => p.at[0] + p.box[0])), Math.max(...g.map((p) => p.at[1] + p.box[1]))].map(Math.round);
  const map = window.map;
  const nameOf = (f: { properties: Record<string, unknown> }) => String(f.properties.id ?? f.properties.name);
  const over = new Set<string>();
  for (const p of drawn) for (const f of map.queryRenderedFeatures([[p.at[0] - p.box[0], p.at[1] - p.box[1]], [p.at[0] + p.box[0], p.at[1] + p.box[1]]], { layers: ['station-names'] })) over.add(nameOf(f));
  for (const p of dots) for (const f of map.queryRenderedFeatures([[p.at[0] - 5, p.at[1] - 5], [p.at[0] + 5, p.at[1] + 5]], { layers: ['station-names'] })) over.add(nameOf(f));
  const names = new Set(map.queryRenderedFeatures({ layers: ['station-names'] }).map(nameOf));
  return {
    clock: Date.now(),
    pills: drawn.length,
    live: drawn.filter((p) => props(p).live).length,
    blank: blank.length,
    blankLive: blank.filter((p) => props(p).live).length,
    piles: piles.length,
    inPiles: piles.reduce((n, g) => n + g.length, 0),
    sizes: piles.map((g) => g.length),
    largest: piles[0]?.length ?? 0,
    largestBox: piles[0] ? boxOf(piles[0]) : undefined,
    largestNames: piles[0]?.map((p) => `${props(p).name}${props(p).covered ? '·' : ''}`),
    pilesBefore: pilesOf(inView).map((g) => g.length),
    pileBoxes: piles.slice(0, 12).map((g) => [g.length, ...boxOf(g)]),
    // D: dots wholly under a pill drawn, partly under one, or clear, by the dot's radius at the zoom (TRAIN_DOT).
    dotsSeen: (() => {
      const r = 2.5 + ((map.getZoom() - 7) / 7) * 3.5;
      const seen = { under: 0, partly: 0, clear: 0 };
      for (const d of dots) {
        const near = drawn.filter((p) => Math.abs(p.at[0] - d.at[0]) < p.box[0] + r && Math.abs(p.at[1] - d.at[1]) < p.box[1] + r);
        seen[near.some((p) => Math.abs(p.at[0] - d.at[0]) <= p.box[0] - r && Math.abs(p.at[1] - d.at[1]) <= p.box[1] - r) ? 'under' : near.length ? 'partly' : 'clear']++;
      }
      return seen;
    })(),
    moved: (() => {
      const px = [...aside.values()].map(Math.abs).sort((a, b) => a - b);
      return px.length ? { n: px.length, median: Math.round(px[px.length >> 1]!), max: Math.round(px.at(-1)!) } : undefined;
    })(),
    hidden: inView.length - drawn.length,
    dots: dots.length,
    counted: drawn.flatMap((p) => (Number(props(p).more) > 0 ? [Number(props(p).more)] : [])),
    names: names.size,
    namesOverlapped: over.size,
    overlappedNames: [...over],
  };
};

async function shoot(browser: Browser, device: Device, scheme: 'light' | 'dark') {
  const first = VIEWS[0]!;
  const m = await openMap(browser, { device, scheme, dist, out: MIRROR, clock: T0, hash: `#map=${first.zoom}/${first.lat}/${first.lon}` });
  await m.context.addInitScript((v) => {
    try {
      localStorage.setItem('v828', v);
    } catch {}
  }, variant === 'A' ? '' : variant);
  await m.page.route('**/snapshot.json', (r) => r.fulfill({ body: snapshot, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
  m.page.on('response', async (res) => {
    const url = new URL(res.url());
    if (url.origin !== LIVE || url.pathname.endsWith('/snapshot.json') || res.status() !== 200) return;
    const file = path.join(MIRROR, url.pathname);
    if (fs.existsSync(file)) return;
    try {
      const body = await res.body();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
    } catch {}
  });
  await m.go();
  await ready(m.page, 0);
  for (const view of VIEWS) {
    if (view !== first) await m.page.evaluate(({ lat, lon, zoom }) => window.map.jumpTo({ center: [lon, lat], zoom }), view);
    await m.page.waitForFunction((t) => Date.now() >= t, T0 + view.at * 1000, { timeout: 200_000, polling: 200 });
    const file = path.join(SHOTS, `${variant}-${view.id}-${device}-${scheme}.png`);
    await m.page.screenshot({ path: file });
    const counts: Record<string, unknown> & ReturnType<typeof COUNT> = await m.page.evaluate(COUNT);
    // Over 10 s, how often what a Train shows changes by itself as Trains move: C's slides aside and back, and every
    // variant's pills turning blank or named (A), folded or shown and counts changing (B), or dot or pill (D).
    counts.changes = await m.page.evaluate(async () => {
      type V = { aside: Map<string, number>; propsOf: Map<string, Record<string, unknown>>; inView: { id: string }[] };
      const v = () => (window as unknown as { __v828: V }).__v828;
      const state = () => new Map(v().inView.map(({ id }) => { const p = v().propsOf.get(id) ?? {}; return [id, `${p.hidden ? 'h' : p.dot ? 'd' : p.covered ? 'c' : 'p'}${Number(p.more) || ''}`]; }));
      let [aside, shown] = [new Set(v().aside.keys()), state()];
      const n = { slidOut: 0, slidBack: 0, shows: 0, counts: 0, trains: shown.size };
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const [nowAside, nowShown] = [new Set(v().aside.keys()), state()];
        n.slidOut += [...nowAside].filter((id) => !aside.has(id)).length;
        n.slidBack += [...aside].filter((id) => !nowAside.has(id)).length;
        for (const [id, s] of nowShown) {
          const was = shown.get(id);
          if (was === undefined || was === s) continue;
          if (was[0] !== s[0]) n.shows++;
          else n.counts++;
        }
        [aside, shown] = [nowAside, nowShown];
      }
      return n;
    });
    fs.appendFileSync(COUNTS, JSON.stringify({ variant, view: view.id, device, scheme, late: counts.clock - (T0 + view.at * 1000), ...counts }) + '\n');
    console.log(`${variant} ${view.id} ${device} ${scheme}: ${counts.pills} pills, ${counts.blank} blank, ${counts.piles} piles (largest ${counts.largest}), names ${counts.namesOverlapped}/${counts.names} overlapped, late ${counts.clock - (T0 + view.at * 1000)} ms`);
  }
  const errors = [...new Set(m.errors)];
  if (errors.length) console.log(`  errors ${device} ${scheme}:\n  ${errors.join('\n  ')}`);
  await m.close();
}

await withSlots(1, async () => {
  const browser = await launch();
  try {
    for (const device of devicesArg.split(',') as Device[]) await Promise.all((['light', 'dark'] as const).map((scheme) => shoot(browser, device, scheme)));
  } finally {
    await browser.close();
  }
});
