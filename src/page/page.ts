// The page harness every browser check goes through (#729): a short-lived Chromium on the Mac's GPU,
// in a browser slot (slots.ts), a context per page, and the page built from a tree and served by
// routes at the site's own address, so that the live bucket's CORS lets it read the live files.
//   npm run page -- [<hash>] [--out [dir]] [--at <capture>] [--slow] [--wait <s>] [--tree <dir>]
// shoots the map at 390×844 and 1280×800, light and dark, into .cache/page/shots/, prints the console's
// errors, and exits 1 on a `pageerror`. `--at` replays a moment the fetcher captured (Open's `at`), with
// `--out` a mirror of that day's live files. Scripts of a ticket's own import launch() and openMap() from here.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright-core';
import { LIVE_URL } from '../bundle.ts';
import { withSlots } from './slots.ts';

export const SITE = 'https://viapeninsula.gariasf.com';
/** The cached Chromium that pairs with playwright-core 1.60.0. Never `npx playwright install`: it prunes the cache other projects use. */
const CHROMIUM = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

export const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, cpu: 1 },
  laptop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, cpu: 1 },
  // CDP slows the page's main thread 4×, as a mid-range phone.
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, cpu: 4 },
};
export type Device = keyof typeof DEVICES;

/** The slow link of #721's review: each request 400 ms before its first byte, and 50 KB/s. */
const SLOW = { latency: 400, bytesPerS: 50 * 1024 };

/**
 * Chromium on the M4's GPU (Metal), headless. It fails where WebGL renders in software (SwiftShader),
 * which one map page takes 8 cores for.
 */
export async function launch(): Promise<Browser> {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext();
  const renderer = await (await context.newPage()).evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    return gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) as string | undefined;
  });
  await context.close();
  if (!renderer || /swiftshader|software|llvmpipe/i.test(renderer)) {
    await browser.close();
    throw new Error(`WebGL renders in software (${renderer ?? 'no WebGL'}), not on the GPU`);
  }
  console.log(`WebGL: ${renderer}`);
  return browser;
}

/**
 * Builds a tree's page into its .cache/page/dist-<tree's name>, which openMap() serves: a worktree's .cache is the main
 * checkout's, linked, so one dist would be every tree's, each build emptying another's, as a before's and an after's.
 */
export function build(tree: string): string {
  const dist = path.join(tree, '.cache/page', `dist-${path.basename(path.resolve(tree))}`);
  execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], { cwd: tree, stdio: 'inherit' });
  return dist;
}

export interface Open {
  device: Device;
  /** The page's hash, as `#map=12/41.3874/2.1686`. */
  hash?: string;
  scheme?: 'light' | 'dark';
  /** The built page (build()). */
  dist: string;
  /** A local bundle (`npm run daily -- --dry-run`'s out/), served for the live files it has; the rest come from the bucket. */
  out?: string;
  slow?: boolean;
  /** The page's clock, from this moment (ms since 1970); performance.now() and rAF stay real. */
  clock?: number;
  /** Requests to abort, as the snapshot where the clock is faked: a real one pulls the map's clock back. */
  abort?: RegExp[];
  /**
   * A moment to replay, as a weekday's peak (#828): a fetcher's capture (`history/<date>/<hour>.ndjson.gz`), whose first
   * snapshot is served for every poll, the page's clock 5 s after it was made, unless `clock` says.
   */
  at?: string;
  /** Slows the main thread as the device says (perf runs; shots leave it). */
  throttle?: boolean;
}

export interface MapPage {
  page: Page;
  context: BrowserContext;
  cdp: CDPSession;
  /** The console's errors and failed requests, and `pageerror ...` for each uncaught one. */
  errors: string[];
  close(): Promise<void>;
}

/** A map page in a context of its own (pages that share one crawl unless in front), not yet navigated: go() loads it. */
export async function openMap(browser: Browser, o: Open): Promise<MapPage & { go(): Promise<void> }> {
  const { cpu, ...device } = DEVICES[o.device];
  const context = await browser.newContext({ ...device, colorScheme: o.scheme ?? 'light', locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const capture = o.at === undefined ? undefined : captured(o.at);
  const clock = o.clock ?? capture?.clock;
  if (clock !== undefined) await context.addInitScript(SHIFT_CLOCK, clock);
  await context.addInitScript(PROBE);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${String(e)}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (q) => !/net::ERR_ABORTED/.test(q.failure()?.errorText ?? '') && errors.push(`failed ${q.url()} ${q.failure()?.errorText}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (o.throttle && cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (o.slow) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: SLOW.latency, downloadThroughput: SLOW.bytesPerS, uploadThroughput: SLOW.bytesPerS });
  for (const re of o.abort ?? []) await page.route(re, (r) => r.abort());
  // The site's own files come at once, as from the cache, whatever the link.
  await page.route(`${SITE}/**`, async (route) => {
    const file = path.join(o.dist, new URL(route.request().url()).pathname.replace(/\/$/, '/index.html'));
    if (!file.startsWith(o.dist) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
    const body = fs.readFileSync(file);
    await route.fulfill({ body: /\/assets\/index-[^/]*\.js$/.test(file) ? hookMap(body.toString()) : body, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' });
  });
  if (o.out) {
    const out = path.resolve(o.out);
    await page.route(`${LIVE_URL}/**`, async (route) => {
      const file = path.join(out, new URL(route.request().url()).pathname);
      if (!file.startsWith(out) || !fs.existsSync(file)) return route.continue();
      const body = fs.readFileSync(file);
      // The network's throttle passes over a response fulfilled here, so a slow link delays it as it would.
      if (o.slow) await new Promise((r) => setTimeout(r, SLOW.latency + (1000 * body.length) / SLOW.bytesPerS));
      await route.fulfill({ body, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
    });
  }
  // Over the bundle's route and an abort, as Playwright tries the last route added first.
  if (capture) await page.route(`${LIVE_URL}/snapshot.json`, (route) => route.fulfill({ body: capture.snapshot, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
  return {
    page,
    context,
    cdp,
    errors,
    go: async () => void (await page.goto(`${SITE}/${o.hash ?? ''}`, { waitUntil: 'commit', timeout: 60_000 })),
    close: () => context.close(),
  };
}

/** A fetcher's capture's first snapshot, as it was served, and the page's clock 5 s after it was made. */
export function captured(file: string): { snapshot: string; clock: number } {
  const [snapshot = ''] = zlib.gunzipSync(fs.readFileSync(file)).toString().split('\n', 1);
  return { snapshot, clock: (JSON.parse(snapshot) as { generated: number }).generated + 5000 };
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/**
 * The built page's script with `window.map` set the moment the map is made, before the cold load's
 * first `setData`, never in main.ts: its `new <Map>({container:"map"` makes the map a subclass's.
 */
export function hookMap(js: string): string {
  const hooked = js.replace(/new ([\w$]+)\(\{container:([`"'])map\2/, 'new (window.__hookMap($1))({container:$2map$2');
  if (hooked === js) throw new Error("The map hook found no `new <Map>({container:'map'` in the page's script: main.ts makes its map otherwise");
  return hooked;
}

/** Waits until the map has its Trains' source, then `settle` ms more. */
export async function ready(page: Page, settle: number) {
  await page.waitForFunction(() => typeof window.map?.getSource === 'function' && window.map.getSource('trains'), null, { timeout: 60_000 });
  await page.waitForTimeout(settle);
}

declare global {
  interface Window {
    /** The map, set by hookMap(), else the #map div by its id. */
    map: import('maplibre-gl').Map;
    __hookMap<C extends new (...a: never[]) => object>(c: C): C;
    __p: Probe;
  }
}

export interface Probe {
  /** rAF timestamps (page ms), from before the page's own scripts run. */
  frames: number[];
  /** Each GeoJSON source's `setData` and `updateData`, and each vector source's `setTiles`: [page ms, source, features (-1 for a URL), or those added]. */
  setData: [number, string, number][];
  /** MapLibre's `render` events (page ms). */
  renders: number[];
}

/** Added before the page's own scripts: a rAF probe, and the map hook's class, which logs what the map draws. */
const PROBE = () => {
  const p: Probe = (window.__p = { frames: [], setData: [], renders: [] });
  const loop = (t: number) => (p.frames.push(t), requestAnimationFrame(loop));
  requestAnimationFrame(loop);
  window.__hookMap = (Map) =>
    class extends (Map as unknown as typeof import('maplibre-gl').Map) {
      constructor(...a: ConstructorParameters<typeof import('maplibre-gl').Map>) {
        super(...a);
        window.map = this;
        this.on('render', () => p.renders.push(performance.now()));
        const addSource = this.addSource.bind(this);
        this.addSource = (id, spec) => {
          const added = addSource(id, spec);
          const source = this.getSource(id);
          if (source?.type === 'geojson') {
            const setData = (source as import('maplibre-gl').GeoJSONSource).setData.bind(source);
            (source as import('maplibre-gl').GeoJSONSource).setData = (d, ...more) => {
              p.setData.push([performance.now(), id, typeof d === 'string' ? -1 : 'features' in d ? d.features.length : 1]);
              return setData(d, ...more);
            };
            // And its `updateData`, by the features it adds, as the Lines go since #733.
            const updateData = (source as import('maplibre-gl').GeoJSONSource).updateData.bind(source);
            (source as import('maplibre-gl').GeoJSONSource).updateData = (diff, ...more) => {
              p.setData.push([performance.now(), id, diff.add?.length ?? 0]);
              return updateData(diff, ...more);
            };
          }
          // The Lines' and rails' tiles since #837, by their new URL once the worker has a join's regions in them (-1, as a URL).
          if (source?.type === 'vector') {
            const setTiles = (source as import('maplibre-gl').VectorTileSource).setTiles.bind(source);
            (source as import('maplibre-gl').VectorTileSource).setTiles = (tiles) => (p.setData.push([performance.now(), id, -1]), setTiles(tiles));
          }
          return added;
        };
      }
    } as never;
};

const SHIFT_CLOCK = (at: number) => {
  const off = at - Date.now();
  const D = Date;
  globalThis.Date = class extends D {
    constructor(...a: []) {
      if (a.length) super(...a);
      else super(D.now() + off);
    }
    static override now() {
      return D.now() + off;
    }
  } as DateConstructor;
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.indexOf(name);
  const value = (name: string, otherwise: string) => (flag(name) >= 0 && args[flag(name) + 1] && !args[flag(name) + 1]!.startsWith('--') ? args[flag(name) + 1]! : otherwise);
  // A hash isn't the bundle's dir that `--out` may take.
  const isHash = (a: string) => /^#?map=/.test(a);
  const hash = args.find((a, i) => !a.startsWith('--') && (isHash(a) || !['--out', '--wait', '--tree', '--at'].includes(args[i - 1] ?? '')));
  const tree = path.resolve(value('--tree', '.'));
  const shots = path.resolve('.cache/page/shots');
  fs.mkdirSync(shots, { recursive: true });
  const dist = build(tree);
  const failed = await withSlots(1, async () => {
    const browser = await launch();
    let failed = false;
    try {
      for (const device of ['phone', 'laptop'] as const)
        for (const scheme of ['light', 'dark'] as const) {
          const m = await openMap(browser, { device, scheme, dist, hash: hash && (hash.startsWith('#') ? hash : `#${hash}`), out: flag('--out') >= 0 ? (isHash(value('--out', 'out')) ? 'out' : value('--out', 'out')) : undefined, slow: flag('--slow') >= 0, at: flag('--at') >= 0 ? path.resolve(value('--at', '')) : undefined });
          await m.go();
          await ready(m.page, Number(value('--wait', '10')) * 1000);
          const { width, height } = DEVICES[device].viewport;
          const file = path.join(shots, `${device}-${width}x${height}-${scheme}.png`);
          await m.page.screenshot({ path: file });
          console.log(`${file}${m.errors.length ? `\n  ${[...new Set(m.errors)].join('\n  ')}` : ''}`);
          failed ||= m.errors.some((e) => e.startsWith('pageerror'));
          await m.close();
        }
    } finally {
      await browser.close();
    }
    return failed;
  });
  process.exit(failed ? 1 : 0);
}
