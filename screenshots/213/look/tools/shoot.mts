// #213 look-measure: shoots #213's variants tilted 45° at one spot, each from a cold page, at this morning's peak, light
// and dark side by side, each in a context of its own, in the harness's one browser slot.
//   cd <SP>/wt-213 && node ../213/measure/tools/shoot.mts <spot> <variants: A,G,L,GL,GLh> [devices: laptop,phone] [--no-build]
// Each page: the fetcher's capture of 22 Oct 08:30 CEST (`--at`: its first snapshot on every poll, the clock 5 s after it
// was made), the live files from the mirror ../213/measure/live (`--out`), and a shot at a fixed second of the page's
// clock, the same for every variant at a spot, once the map is idle and every tile in view has come, the ground's too.
// One line per shot in ../213/measure/shots.jsonl. Keep a call under the slot's 10 min: one spot, or one spot and device.
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { LIVE_URL } from '../../../wt-213/src/bundle.ts';
import { build, captured, launch, openMap, ready, type Device } from '../../../wt-213/src/page/page.ts';
import { withSlots } from '../../../wt-213/src/page/slots.ts';

const MEASURE = path.resolve(import.meta.dirname, '..');
const [TREE, LIVE, CAPTURE, SHOTS, LOG] = [path.resolve(MEASURE, '../../wt-213'), path.join(MEASURE, 'live'), path.resolve(MEASURE, '../capture/0630.ndjson.gz'), path.join(MEASURE, 'shots'), path.join(MEASURE, 'shots.jsonl')];
/**
 * The spots (look-build-report.md), and the second of the page's clock each is shot at: before 55 s, when the capture's
 * snapshot, served on every poll, is three of Renfe's 20 s updates old, and Rodalies' and Cercanías' live data turn
 * unavailable (engine.ts's works()); LD's, MD's, FGC's and the Metro's at 95 s.
 */
const SPOTS: Record<string, { hash: string; at: number }> = {
  bcn: { hash: '#map=13/41.3874/2.1686/0/45', at: 40 },
  mad: { hash: '#map=13/40.4168/-3.7038/0/45', at: 40 },
  viaduct: { hash: '#map=14/40.74818/-3.74047/48/45', at: 40 },
  mouth: { hash: '#map=15/41.2538/1.9031/-20/45', at: 40 },
};
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [spot, variants, devices] = [args[0]!, args[1]!.split(','), (args[2] ?? 'laptop,phone').split(',') as Device[]];
const { hash, at } = SPOTS[spot]!;
/** The page's clock as navigation starts: the capture's first snapshot's `generated` + 5 s. */
const T0 = captured(CAPTURE).clock;
const dist = process.argv.includes('--no-build') ? path.join(TREE, '.cache/page', `dist-${path.basename(TREE)}`) : build(TREE);
fs.mkdirSync(SHOTS, { recursive: true });

async function shoot(browser: Browser, variant: string, device: Device, scheme: 'light' | 'dark') {
  const m = await openMap(browser, { device, scheme, dist, hash, out: LIVE, at: CAPTURE, v213: variant === 'A' ? undefined : variant });
  // The live files asked for that the mirror lacks, which would come from the bucket.
  const missing = new Set<string>();
  m.page.on('request', (q) => {
    const url = new URL(q.url());
    if (url.origin === LIVE_URL && !url.pathname.endsWith('/snapshot.json') && !fs.existsSync(path.join(LIVE, url.pathname))) missing.add(url.pathname);
  });
  await m.go();
  await ready(m.page, 0);
  // When the map was last idle, and when a tile of a source other than the GeoJSON ones (the Trains', set as they move) last came.
  await m.page.evaluate(() => {
    const map = window.map;
    const s = ((window as unknown as { __s: { idle: number; tile: number } }).__s = { idle: map.loaded() ? Date.now() : 0, tile: Date.now() });
    map.on('idle', () => (s.idle = Date.now()));
    map.on('sourcedata', (e) => e.tile && map.getSource(e.sourceId)?.type !== 'geojson' && (s.tile = Date.now()));
  });
  // From 5 s before the shot's second, settled; then the shot at its second, or as soon after as the map settles.
  const due = T0 + at * 1000;
  await m.page.waitForFunction((t) => Date.now() >= t, due - 5000, { timeout: (at + 60) * 1000, polling: 200 });
  await m.page.waitForFunction(() => {
    const [map, s] = [window.map, (window as unknown as { __s: { idle: number; tile: number } }).__s];
    return map.areTilesLoaded() && !map.isMoving() && s.idle > s.tile && Date.now() - s.tile > 2000;
  }, null, { timeout: 60_000, polling: 100 }).catch(() => m.errors.push('never settled'));
  await m.page.waitForFunction((t) => Date.now() >= t, due, { timeout: 60_000, polling: 50 });
  const clock = await m.page.evaluate(() => Date.now());
  const file = path.join(SHOTS, `${spot}-${variant}-${device}-${scheme}.png`);
  await m.page.screenshot({ path: file });
  const seen = await m.page.evaluate(() => {
    const map = window.map;
    const layers = (ids: string[]) => ids.filter((id) => map.getLayer(id));
    const ids = (ls: string[]) => [...new Set(map.queryRenderedFeatures({ layers: layers(ls) }).map((f) => String(f.properties.id)))].sort();
    const at = (ls: string[]) => map.queryRenderedFeatures({ layers: layers(ls) }).map((f) => {
      const c = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.type === 'Polygon' ? f.geometry.coordinates[0]![0]! : [NaN, NaN];
      const p = map.project(c as [number, number]);
      return [Math.round(p.x), Math.round(p.y)];
    });
    const lines = window.__p.setData.filter(([, id]) => id === 'lines');
    return {
      settledAtTiles: map.areTilesLoaded(),
      zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), terrain: !!map.getTerrain(),
      centre: [Math.round(map.project(map.getCenter()).x), Math.round(map.project(map.getCenter()).y)],
      trains: ids(['trains', 'train-pills']),
      decks: layers(['decks']).length ? map.queryRenderedFeatures({ layers: ['decks'] }).length : undefined,
      mouths: layers(['mouths']).length ? at(['mouths']) : undefined,
      firstLines: lines[0]?.[0], linesSet: lines.length,
      files: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.name.includes('viapeninsula-live') && !e.name.endsWith('/snapshot.json')).map((e) => e.name.split('/').pop()).sort(),
    };
  });
  const row = { spot, hash, variant, device, scheme, at, late: clock - due, clock, ...seen, trainsN: seen.trains.length, missing: [...missing], errors: [...new Set(m.errors)] };
  fs.appendFileSync(LOG, JSON.stringify(row) + '\n');
  console.log(`${spot} ${variant} ${device} ${scheme}: late ${row.late} ms, tiles ${seen.settledAtTiles}, ${row.trainsN} Trains, decks ${seen.decks ?? '-'}, mouths ${seen.mouths?.length ?? '-'}, terrain ${seen.terrain}, pitch ${seen.pitch}${row.missing.length ? `, missing ${row.missing.join(' ')}` : ''}${row.errors.length ? `\n  ${row.errors.join('\n  ')}` : ''}`);
  await m.close();
}

await withSlots(1, async () => {
  const browser = await launch();
  try {
    for (const device of devices) for (const v of variants) await Promise.all((['light', 'dark'] as const).map((scheme) => shoot(browser, v, device, scheme)));
  } finally {
    await browser.close();
  }
});
