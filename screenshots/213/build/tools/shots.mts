// #213 ship: box 3's shots on the page harness, from the look's shoot.mts and probe.mts and the build's smoke-decks.ts.
//   cd <SP>/wt-213b && node ../213/ship/tools/shots.mts <job,...> [--no-build]
// Every page: 22 Oct's 08:30 capture (`at`), the branch's dry run of 22 Oct served to both trees (`out`), and its shot
// at second AT of the page's clock once the map is settled, the same second for both trees. Jobs, each one slot batch:
// - main, branch: the five views, laptop 1280×800, tilted 45°, light and dark side by side; the branch's L'Hospitalet
//   light then gets the pointer over a deck and a tap on it;
// - probe: the branch at L'Hospitalet, light, every 3 s of the first 50 s, the Trains on a deck, shot when one is;
//   then the phone, 390×844 flat at Barcelona z13, light, main and branch side by side, with the decks files asked for.
// One line per page in ../213/ship/shots.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { build, captured, launch, openMap, ready, type Device } from '../../../wt-213b/src/page/page.ts';
import { withSlots } from '../../../wt-213b/src/page/slots.ts';

const SHIP = path.resolve(import.meta.dirname, '..');
const SP = path.resolve(SHIP, '../..');
const TREES = { main: path.join(SP, 'wt-main'), branch: path.join(SP, 'wt-213b') };
const [OUT, CAPTURE, SHOTS, LOG] = [path.join(SP, 'wt-213b/out'), path.join(SP, '213/capture/0630.ndjson.gz'), path.join(SHIP, 'shots'), path.join(SHIP, 'shots.jsonl')];
// The second each shot is at; the job train's is the probe's second with a Train on L'Hospitalet's bridge.
let AT = 40;
const VIEWS: Record<string, string> = {
  viaduct: '#map=14/40.74818/-3.74047/48/45',
  garraf: '#map=15/41.2538/1.9031/-20/45',
  hospitalet: '#map=14/41.3365/2.1035/-23/45',
  bcn: '#map=13/41.3874/2.1686/0/45',
  mad: '#map=13/40.4168/-3.7038/0/45',
};
const T0 = captured(CAPTURE).clock;
const dists = Object.fromEntries(Object.entries(TREES).map(([k, t]) => [k, process.argv.includes('--no-build') ? path.join(t, '.cache/page', `dist-${path.basename(t)}`) : build(t)])) as Record<keyof typeof TREES, string>;
fs.mkdirSync(SHOTS, { recursive: true });
const DECK_LAYERS = () => window.map.getStyle().layers.filter((l) => l.type === 'fill-extrusion').map((l) => l.id);

async function open(browser: Browser, tree: keyof typeof TREES, device: Device, scheme: 'light' | 'dark', hash: string) {
  const m = await openMap(browser, { device, scheme, dist: dists[tree], hash, out: OUT, at: CAPTURE });
  const asked: string[] = [];
  m.page.on('request', (q) => asked.push(q.url()));
  await m.go();
  await ready(m.page, 0);
  return { ...m, asked };
}

/** What the map draws now: Trains in view, decks and mouths drawn, and the decks files and chunks asked for so far. */
async function state(m: Awaited<ReturnType<typeof open>>) {
  const s = await m.page.evaluate(() => {
    const map = window.map;
    const ids = map.getStyle().layers.map((l) => l.id);
    const n = (re: RegExp) => map.queryRenderedFeatures({ layers: ids.filter((id) => re.test(id)) }).length;
    return {
      clock: Date.now(), zoom: map.getZoom(), pitch: map.getPitch(), decksSource: !!map.getSource('decks'),
      trains: [...new Set(map.queryRenderedFeatures({ layers: ['trains', 'train-pills'].filter((id) => map.getLayer(id)) }).map((f) => String(f.properties.id)))].sort(),
      decks: ids.some((id) => /decks/.test(id)) ? n(/decks/) : undefined,
      mouths: map.getLayer('mouths') ? n(/^mouths$/) : undefined,
    };
  });
  return { ...s, decksAsked: m.asked.filter((u) => /decks|deckLayers/.test(u)).map((u) => u.replace(/^.*\//, '')), errors: [...new Set(m.errors)] };
}

/** Shoots a view at second AT, settled from 5 s before, as the look's shoot.mts. */
async function shoot(browser: Browser, tree: keyof typeof TREES, view: string, hash: string, device: Device, scheme: 'light' | 'dark', after?: (m: Awaited<ReturnType<typeof open>>, file: string) => Promise<object>) {
  const m = await open(browser, tree, device, scheme, hash);
  await m.page.evaluate(() => {
    const map = window.map;
    const s = ((window as unknown as { __s: { idle: number; tile: number } }).__s = { idle: map.loaded() ? Date.now() : 0, tile: Date.now() });
    map.on('idle', () => (s.idle = Date.now()));
    map.on('sourcedata', (e) => e.tile && map.getSource(e.sourceId)?.type !== 'geojson' && (s.tile = Date.now()));
  });
  const due = T0 + AT * 1000;
  await m.page.waitForFunction((t) => Date.now() >= t, due - 5000, { timeout: (AT + 60) * 1000, polling: 200 });
  await m.page.waitForFunction(() => {
    const [map, s] = [window.map, (window as unknown as { __s: { idle: number; tile: number } }).__s];
    return map.areTilesLoaded() && !map.isMoving() && s.idle > s.tile && Date.now() - s.tile > 2000;
  }, null, { timeout: 60_000, polling: 100 }).catch(() => m.errors.push('never settled'));
  await m.page.waitForFunction((t) => Date.now() >= t, due, { timeout: 60_000, polling: 50 });
  const file = path.join(SHOTS, `${view}-${tree}-${device}-${scheme}.png`);
  await m.page.screenshot({ path: file });
  const s = await state(m);
  const extra = after ? await after(m, file) : {};
  const row = { view, tree, device, scheme, hash, late: s.clock - due, ...s, trainsN: s.trains.length, ...extra };
  fs.appendFileSync(LOG, JSON.stringify(row) + '\n');
  console.log(`${view} ${tree} ${device} ${scheme}: late ${row.late} ms, ${row.trainsN} Trains, decks ${s.decks ?? '-'}, mouths ${s.mouths ?? '-'}, decks asked ${s.decksAsked.length}${s.errors.length ? `\n  ${s.errors.join('\n  ')}` : ''}`);
  await m.close();
}

/** The pointer over a deck near the middle, then a tap on it, as smoke-decks.ts. */
async function hoverTap(m: Awaited<ReturnType<typeof open>>, file: string) {
  const on = await m.page.evaluate((layersOf) => {
    const map = window.map;
    const layers = (0, eval)(layersOf)() as string[];
    const { width, height } = map.getCanvas().getBoundingClientRect();
    for (let y = height * 0.3; y < height * 0.7; y += 2) for (let x = width * 0.3; x < width * 0.7; x += 8) if (map.queryRenderedFeatures([x, y], { layers }).some((f) => f.properties.kind === 'deck')) return [x, y] as [number, number];
    return undefined;
  }, `(${DECK_LAYERS})`);
  if (!on) return { hover: 'no deck found' };
  await m.page.mouse.move(...on);
  await m.page.waitForTimeout(300);
  const cursor = await m.page.evaluate(() => window.map.getCanvas().style.cursor);
  await m.page.screenshot({ path: file.replace('.png', '-hover.png') });
  await m.page.mouse.click(...on);
  await m.page.waitForTimeout(800);
  const card = await m.page.evaluate(() => document.querySelector('.maplibregl-popup')?.textContent?.slice(0, 160) ?? '');
  await m.page.screenshot({ path: file.replace('.png', '-tap.png') });
  return { hover: { at: on.map(Math.round), cursor, card } };
}

/** The branch at L'Hospitalet: every 2 s of the first 50 s, the Trains whose ground point is within 6 px of a deck's footprint. */
async function probe(browser: Browser) {
  const m = await open(browser, 'branch', 'laptop', 'light', VIEWS.hospitalet!);
  const seen: string[] = [];
  let shots = 0;
  while ((await m.page.evaluate(() => Date.now())) < T0 + 50_000) {
    const on = await m.page.evaluate((layersOf) => {
      const map = window.map;
      const layers = (0, eval)(layersOf)() as string[];
      const rings = map.queryRenderedFeatures({ layers }).filter((f) => f.properties.kind === 'deck' && f.geometry.type === 'Polygon').map((f) => (f.geometry as GeoJSON.Polygon).coordinates[0]!.map((c) => map.project(c as [number, number])));
      const near = (p: { x: number; y: number }, ring: { x: number; y: number }[]) => {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [a, b] = [ring[i]!, ring[j]!];
          if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
          const [dx, dy] = [b.x - a.x, b.y - a.y];
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 6) return true;
        }
        return inside;
      };
      // A Train is a dot below its pillZoom and a pill from it (main.ts's AS_DOT, AS_PILL): both, as the look's probe.
      return map.queryRenderedFeatures({ layers: ['trains', 'train-pills'].filter((id) => map.getLayer(id)) }).flatMap((f) => {
        const p = map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
        return rings.some((r) => near(p, r)) ? [`${f.properties.id}@${Math.round(p.x)},${Math.round(p.y)}`] : [];
      });
    }, `(${DECK_LAYERS})`);
    const s = Math.round(((await m.page.evaluate(() => Date.now())) - T0) / 1000);
    seen.push(`${s}s ${[...new Set(on)].join(' ')}`);
    if (on.length && shots++ < 4) await m.page.screenshot({ path: path.join(SHOTS, `hospitalet-branch-laptop-light-train-${s}s.png`) });
    await m.page.waitForTimeout(2000);
  }
  fs.writeFileSync(path.join(SHIP, 'probe-hospitalet.txt'), seen.join('\n') + '\n');
  console.log('probe:', seen.filter((l) => l.includes('@')).join(' | ') || 'no Train on a deck');
  fs.appendFileSync(LOG, JSON.stringify({ view: 'probe', ...(await state(m)), seen }) + '\n');
  await m.close();
}

/** The fix's gate (#213, 8d8979ce): the branch at L'Hospitalet z12, which adds no decks' layers nor asks for their chunk, then zoomed to 14, which draws its decks. */
async function gate(browser: Browser) {
  const m = await open(browser, 'branch', 'laptop', 'light', '#map=12/41.3365/2.1035/-23/45');
  await m.page.waitForTimeout(15_000);
  const before = await state(m);
  await m.page.evaluate(() => void window.map.zoomTo(14, { duration: 1000 }));
  await m.page.waitForTimeout(12_000);
  const after = await state(m);
  await m.page.screenshot({ path: path.join(SHOTS, 'gate-hospitalet-z12-to-z14-branch-laptop-light.png') });
  fs.appendFileSync(LOG, JSON.stringify({ view: 'gate', before, after }) + '\n');
  console.log(`gate: z${before.zoom.toFixed(1)} decks source ${before.decksSource}, decks ${before.decks ?? '-'}, asked ${before.decksAsked.join(' ')} -> z${after.zoom.toFixed(1)} decks source ${after.decksSource}, decks ${after.decks}, mouths ${after.mouths}, asked ${after.decksAsked.join(' ')}; errors ${after.errors.join(' | ') || 'none'}`);
  await m.close();
}

const jobs = process.argv[2]!.split(',');
for (const job of jobs)
  await withSlots(1, async () => {
    const browser = await launch();
    try {
      if (job === 'main' || job === 'branch')
        for (const [view, hash] of Object.entries(VIEWS))
          await Promise.all((['light', 'dark'] as const).map((scheme) => shoot(browser, job, view, hash, 'laptop', scheme, job === 'branch' && view === 'hospitalet' && scheme === 'light' ? hoverTap : undefined)));
      if (job.startsWith('train@')) {
        AT = Number(job.slice(6));
        await shoot(browser, 'branch', `hospitalet-train-${AT}s`, VIEWS.hospitalet!, 'laptop', 'light');
      }
      if (job === 'gate') await gate(browser);
      if (job === 'hlt') await Promise.all((['light', 'dark'] as const).map((scheme) => shoot(browser, 'branch', 'hospitalet-gate', VIEWS.hospitalet!, 'laptop', scheme, scheme === 'light' ? hoverTap : undefined)));
      if (job === 'probe' || job === 'probe-only') await probe(browser);
      if (job === 'probe') {
        await Promise.all((['main', 'branch'] as const).map((tree) => shoot(browser, tree, 'phone-bcn', '#map=13/41.3874/2.1686', 'phone', 'light')));
      }
    } finally {
      await browser.close();
    }
  });
