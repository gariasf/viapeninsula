// #213 look-measure, the bytes re-checked with look-build's look.ts, logging to ../bytes.jsonl: open the map cold at a spot, as a variant, on a device and scheme; shoot it; and log every request it
// made (when it started, page ms, and its bytes over the wire, as Playwright has them) and when the first Lines came.
//   node look.ts <spot,...> <variant,...> [--devices laptop,phone] [--schemes light,dark] [--shots <dir>] [--no-build]
// Each run is a line of SP/213/data/loads.jsonl. One batch in the harness's slot per call: keep a call under 10 min.
import fs from 'node:fs';
import path from 'node:path';
import { build, launch, openMap, ready, type Device } from '../../../wt-213/src/page/page.ts';
import { withSlots } from '../../../wt-213/src/page/slots.ts';

const SP = path.resolve(import.meta.dirname, '../../..');
const TREE = path.join(SP, 'wt-213');
export const SPOTS: Record<string, string> = {
  bcn: '#map=13/41.3874/2.1686/0/45',
  mad: '#map=13/40.4168/-3.7038/0/45',
};
const extra = fs.existsSync(path.join(SP, '213/data/spots.json')) ? JSON.parse(fs.readFileSync(path.join(SP, '213/data/spots.json'), 'utf8')) : {};
Object.assign(SPOTS, extra);

const args = process.argv.slice(2);
const opt = (name: string, otherwise: string) => (args.includes(name) ? args[args.indexOf(name) + 1]! : otherwise);
const [spots, variants] = [args[0]!.split(','), args[1]!.split(',')];
const devices = opt('--devices', 'laptop').split(',') as Device[];
const schemes = opt('--schemes', 'light').split(',') as ('light' | 'dark')[];
const shots = args.includes('--shots') ? path.resolve(opt('--shots', '')) : undefined;
const settle = Number(opt('--settle', '8')) * 1000;
const dist = args.includes('--no-build') ? path.join(TREE, '.cache/page', 'dist-wt-213') : build(TREE);
const log = path.join(SP, '213/measure/bytes.jsonl');

await withSlots(1, async () => {
  const browser = await launch();
  try {
    for (const spot of spots)
      for (const v of variants)
        for (const device of devices)
          for (const scheme of schemes) {
            const m = await openMap(browser, { device, scheme, dist, hash: SPOTS[spot], v213: v === 'main' ? undefined : v });
            if (args.includes('--hill')) await m.context.addInitScript(() => localStorage.setItem('v213hill', '1'));
            // Playwright's, which takes in the requests of MapLibre's worker, where it fetches the basemap's tiles, as the
            // page's resource timing and its CDP session don't.
            const bytes: { url: string; wall: number; bytes: number; status?: number }[] = [];
            m.page.on('requestfinished', async (q) => {
              const [sizes, response] = await Promise.all([q.sizes().catch(() => undefined), q.response().catch(() => null)]);
              bytes.push({ url: q.url(), wall: q.timing().startTime, bytes: (sizes?.responseBodySize ?? 0) + (sizes?.responseHeadersSize ?? 0), status: response?.status() });
            });
            const t0 = Date.now();
            await m.go();
            await ready(m.page, 0);
            await m.page.waitForFunction(() => window.map.loaded() && !window.map.isMoving(), null, { timeout: 60_000, polling: 250 }).catch(() => m.errors.push('never idle'));
            await m.page.waitForTimeout(settle);
            const seen = await m.page.evaluate(() => ({
              origin: performance.timeOrigin,
              firstLines: window.__p.setData.find(([, id]) => id === 'lines')?.[0],
              pitch: window.map.getPitch(),
              terrain: !!window.map.getTerrain(),
              bounds: window.map.getBounds().toArray(),
            }));
            const name = `${spot}-${v}-${device}-${scheme}${args.includes('--hill') ? '-hill' : ''}${args.includes('--credits') ? '-credits' : ''}`;
            // The credits, opened behind their © where they don't show as a strip.
            if (args.includes('--credits')) {
              await m.page.click('details.credits > summary');
              await m.page.waitForTimeout(500);
            }
            if (shots) {
              fs.mkdirSync(shots, { recursive: true });
              await m.page.screenshot({ path: path.join(shots, `${name}.png`) });
            }
            const resources = bytes.filter((b) => !b.url.startsWith('data:') && !b.url.startsWith('blob:')).map((b) => ({ url: b.url, start: Math.round(b.wall - seen.origin), bytes: b.bytes, status: b.status }));
            const run = { spot, hash: SPOTS[spot], v213: v, ...(args.includes('--hill') && { hill: true }), ...(args.includes('--credits') && { credits: true }), device, scheme, at: new Date(t0).toISOString(), ms: Date.now() - t0, firstLines: seen.firstLines, pitch: seen.pitch, terrain: seen.terrain, bounds: seen.bounds, errors: [...new Set(m.errors)], resources };
            fs.appendFileSync(log, JSON.stringify(run) + '\n');
            console.log(`${name}: firstLines ${Math.round(seen.firstLines ?? -1)} ms, ${run.resources.length} requests, pitch ${seen.pitch}, terrain ${seen.terrain}${run.errors.length ? `\n  ${run.errors.join('\n  ')}` : ''}`);
            await m.close();
          }
  } finally {
    await browser.close();
  }
});
