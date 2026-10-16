// The map's perf against milestone 1's budget (budget.json), on the page harness (page.ts), from the 12 Oct
// roadmap review's P-1:
//   npm run perf -- <scenario>... [--phone] [--runs <n>] [--tree <dir>]... [--out [dir]] [--slow]
// Each round of a scenario's runs (3 by default), a run of each tree, a before's and an after's alternated,
// is one batch in all three browser slots, so that it keeps under the batch's 10 min; each run has a cold context. It prints each check's median
// against its limit, appends every run to .cache/page/perf/runs.jsonl, and exits 1 on a breach.
// Scenarios, at Barcelona z12 but S4's, each measured over its own window:
// - S2: a cold load, its first 30 s, and long distance's join in it (S6).
// - S3: zoom out to z4 a level at a time, a second apart, then into Madrid z12.
// - S4: drag Madrid to Valencia to Barcelona at z9.5.
// - S5bcn: 60 s at rest; S5z10 and S5z13 the same at z10 and z13 (#572).
// - S7: the next day's join, the clock set 20 s before the map needs it, and the snapshot blocked.
// - S8: following a moving Train at z14 for 30 s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Browser, CDPSession, Page } from 'playwright-core';
import { addDays, daysOf, LIVE_URL, madridDate, type Manifest } from '../bundle.ts';
import budget from './budget.json' with { type: 'json' };
import { build, DEVICES, launch, openMap, ready, type Device } from './page.ts';
import { SLOTS, withSlots } from './slots.ts';

export interface Run {
  scenario: string;
  device: Device;
  tree: string;
  run: number;
  /** The page's clock at navigation, where the scenario fakes it. */
  clock?: number;
  /** Page ms, and the main thread's busy seconds so far (CDP's TaskDuration). */
  marks: { name: string; t: number; task: number }[];
  frames: number[];
  setData: [number, string, number][];
  renders: number[];
  /** The live files the page read, by their path, with when each came (page ms). */
  files: { file: string; end: number }[];
  /** The JS heap at S3's end after a full GC, MB: what the page holds (#779). */
  heapMB?: number;
  /** The JS heap's peak over the run, read each second, garbage V8 hasn't collected yet included, MB: reported, not budgeted. */
  heapPeakMB?: number;
  /** The workers' busy ms in the first 15 s, from the trace (S2). */
  workerMs?: number;
  errors: string[];
  load?: string;
}

type Mark = (name: string) => Promise<void>;
const at = (z: number, [lat, lon]: readonly number[]) => `#map=${z}/${lat}/${lon}`;
/** 60 s at rest at Barcelona at a zoom, after 20 s to load. */
const rest = (zoom: number) => ({ view: at(zoom, BCN), window: ['idleStart', 'end'] as [string, string], act: async (_: Page, mark: Mark) => (await sleep(20_000), await mark('idleStart'), await sleep(60_000), mark('end')) });
const [BCN, MAD, VLC] = [[41.3874, 2.1686], [40.4168, -3.7038], [39.4699, -0.3763]] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Scenario {
  view: string;
  /** The marks its window is between. */
  window: [string, string];
  act(page: Page, mark: Mark, device: Device): Promise<void>;
  /** The live files whose coming is a join, measured over the 5 s after. */
  joins?: (run: Run) => RegExp;
  /** The page's clock, from the manifest the page reads. */
  clock?: (manifest: Manifest) => number;
  trace?: boolean;
}

const SCENARIOS: Record<string, Scenario> = {
  S2: { view: at(12, BCN), window: ['nav', 'end'], act: async (_, mark) => (await sleep(30_000), mark('end')), joins: () => /track-long-distance/, trace: true },
  S3: {
    view: at(12, BCN),
    window: ['zoomStart', 'end'],
    act: async (page, mark, device) => {
      await sleep(15_000);
      await mark('zoomStart');
      await zoomSteps(page, device, 12, 4, mark);
      await page.evaluate(([lat, lon]) => (location.hash = location.hash.replace(/map=([\d.]+)\/[^/]+\/[^&]+/, `map=$1/${lat}/${lon}`)), MAD);
      await sleep(1000);
      await mark('madrid');
      await zoomSteps(page, device, 4, 12, mark);
      await sleep(4000);
      await mark('end');
    },
    joins: () => /^days\//,
  },
  S4: {
    view: at(9.5, MAD),
    window: ['panStart', 'end'],
    act: async (page, mark, device) => {
      await sleep(15_000);
      await mark('panStart');
      await panTo(page, device, MAD, VLC, 9.5, mark);
      await panTo(page, device, VLC, BCN, 9.5, mark);
      await sleep(4000);
      await mark('end');
    },
    joins: () => /^days\//,
  },
  S5bcn: rest(12),
  S5z10: rest(10),
  S5z13: rest(13),
  // The map looks for the days it needs each minute, so it joins the next day within ~60 s of the clock passing its moment.
  S7: {
    view: at(12, BCN),
    window: ['joinWatch', 'end'],
    act: async (_, mark) => (await sleep(45_000), await mark('joinWatch'), await sleep(50_000), mark('end')),
    joins: (run) => new RegExp(`^days/${addDays(madridDate(new Date(run.clock!)), 1)}-`),
    clock: (manifest) => secondDayAt(manifest, Date.now()),
  },
  S8: {
    view: at(12, BCN),
    window: ['followStart', 'end'],
    act: async (page, mark) => {
      await ready(page, 15_000);
      // A Train that moves in 4 s near Barcelona, long distance's first, as P-1 picked.
      const read = () => page.evaluate(() => Object.fromEntries(((window.map.getSource('trains') as import('maplibre-gl').GeoJSONSource).serialize().data as GeoJSON.FeatureCollection<GeoJSON.Point>).features.map((f) => [f.properties!.id as string, f.geometry.coordinates])));
      const before = await read();
      await sleep(4000);
      const after = await read();
      const moved = Object.keys(after).filter((id) => before[id] && Math.hypot(before[id]![0]! - after[id]![0]!, before[id]![1]! - after[id]![1]!) > 2e-4 && Math.abs(after[id]![1]! - BCN[0]) < 0.4 && Math.abs(after[id]![0]! - BCN[1]) < 0.6);
      const id = moved.find((i) => i.startsWith('ave-larga-distancia:')) ?? moved[0];
      if (!id) throw new Error(`No Train moved near Barcelona, of ${Object.keys(after).length}`);
      await page.evaluate(([id, [lon, lat]]) => (location.hash = `map=14/${lat}/${lon}&train=${id}`), [id, after[id]!] as const);
      await sleep(15_000);
      await mark('followStart');
      await sleep(30_000);
      await mark('end');
    },
  },
};

/**
 * A trackpad's scroll, a zoom level a step, then a second's pause, so that the regions in view load.
 * MapLibre takes a wheel delta of ±3 for a trackpad's, and how far one zooms is learnt from each step.
 */
async function zoomSteps(page: Page, device: Device, from: number, to: number, mark: Mark) {
  const { width, height } = DEVICES[device].viewport;
  await page.mouse.move(width / 2, height / 2);
  const zoomNow = async () => parseFloat(/map=([\d.]+)/.exec(await page.evaluate(() => location.hash))?.[1] ?? 'NaN');
  const dir = Math.sign(to - from);
  let perEvent = 0.0108;
  for (let z = from; z !== to; z += dir) {
    const z0 = await zoomNow();
    const n = Math.round(Math.min(1.5, Math.max(0.2, Math.abs(z + dir - z0))) / perEvent);
    for (let i = 0; i < n; i++) {
      await page.mouse.wheel(0, dir < 0 ? 3 : -3);
      await sleep(12);
    }
    await sleep(1000);
    const moved = Math.abs((await zoomNow()) - z0);
    if (moved > 0.3 && moved < 3) perEvent = moved / n;
    await mark(`z${z + dir}`);
  }
}

/** Mouse drags of at most 600 px, each held still before its release, so there's no inertia, from one place to another. */
async function panTo(page: Page, device: Device, from: readonly number[], to: readonly number[], z: number, mark: Mark) {
  const { width, height } = DEVICES[device].viewport;
  const px = ([lat, lon]: readonly number[]) => {
    const w = 512 * 2 ** z, r = (lat! * Math.PI) / 180;
    return [((lon! + 180) / 360) * w, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * w];
  };
  const [a, b] = [px(from), px(to)];
  const [dx, dy] = [a[0]! - b[0]!, a[1]! - b[1]!];
  const n = Math.ceil(Math.hypot(dx, dy) / 600);
  for (let i = 0; i < n; i++) {
    const [cx, cy, sx, sy] = [width / 2 - dx / n / 2, height / 2 - dy / n / 2, dx / n / 30, dy / n / 30];
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let s = 1; s <= 30; s++) await page.mouse.move(cx + s * sx, cy + s * sy), await sleep(16);
    await sleep(150);
    await page.mouse.up();
    await sleep(600);
    await mark(`drag${i}`);
  }
}

/** When the next day starts to be needed, less 20 s: its earliest Trains' `from` less the hour main.ts's SOON gives them. */
export function secondDayAt(manifest: Manifest, now: number): number {
  const next = addDays(madridDate(new Date(now)), 1);
  const day = daysOf(manifest).find((d) => d.date === next);
  if (!day) throw new Error(`The manifest has no ${next}`);
  return day.from - 60 * 60_000 - 20_000;
}

/** The gaps between frames, each in the window its later frame is in, (from, to]. */
const gapsIn = (frames: number[], from: number, to: number) => frames.slice(1).flatMap((t, i) => (t > from && t <= to ? [t - frames[i]!] : []));
const frozen = (gaps: number[]) => gaps.filter((g) => g > 50).reduce((a, g) => a + g, 0);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);
const within = <T>(xs: T[], at: (x: T) => number, from: number, to: number) => xs.filter((x) => at(x) > from && at(x) <= to);

/** A run's numbers for the budget's checks, over its scenario's window. */
export function metrics(run: Run): Record<string, number | undefined> {
  const sc = SCENARIOS[run.scenario]!;
  const mark = (name: string) => run.marks.find((m) => m.name === name)!;
  const [a, b] = sc.window.map(mark) as [Run['marks'][0], Run['marks'][0]];
  const secs = (b.t - a.t) / 1000;
  const out: Record<string, number | undefined> = {};
  // Joins: the 5 s after each of the scenario's files came; the steps of a zoom or pan that none overlaps have none.
  const joins = sc.joins ? run.files.filter((f) => sc.joins!(run).test(f.file) && f.end >= a.t && f.end <= b.t).map((f) => [f.end, f.end + 5000] as const) : [];
  if (joins.length) {
    out.joinMaxGap = max(joins.map(([s, e]) => max(gapsIn(run.frames, s, e)) ?? 0));
    out.joinFrozen = max(joins.map(([s, e]) => frozen(gapsIn(run.frames, s, e))));
  }
  if (run.scenario === 'S3' || run.scenario === 'S4') {
    const steps = run.marks.slice(run.marks.indexOf(a), run.marks.indexOf(b) + 1);
    // A step ends at its own mark (zoomSteps()'s z<n>, panTo()'s drag<n>), not at the jump to Madrid nor the wait before `end`.
    out.stepMaxGap = max(steps.slice(1).flatMap((m, i) => (!/^(z|drag)\d/.test(m.name) || joins.some(([s, e]) => s < m.t && e > steps[i]!.t) ? [] : gapsIn(run.frames, steps[i]!.t, m.t))));
  }
  if (run.scenario === 'S2') {
    const first = (source: string) => run.setData.find(([, id, n]) => id === source && n !== 0)?.[0];
    const [lines, trains] = [first('lines'), first('trains')];
    // From navigation's start, the page's time origin, as P-1's were.
    out.firstLines = lines === undefined ? undefined : Math.round(lines);
    out.firstTrains = trains === undefined ? undefined : Math.round(trains);
    out.gapAfterLines = lines === undefined ? undefined : max(gapsIn(run.frames, lines, b.t));
    out.workerFirst15s = run.workerMs;
  }
  if (run.scenario === 'S3') [out.heapMB, out.heapPeakMB] = [run.heapMB, run.heapPeakMB];
  const mainMsPerS = Math.round(((b.task - a.task) * 1000) / secs);
  const fps = +(within(run.frames, (t) => t, a.t, b.t).length / secs).toFixed(1);
  if (run.scenario.startsWith('S5')) {
    [out.restMainMsPerS, out.restFps] = [mainMsPerS, fps];
    const trainDraws = within(run.setData, ([t]) => t, a.t, b.t).filter(([, id]) => id === 'trains').length;
    out.restExtraRedrawsPerS = +((within(run.renders, (t) => t, a.t, b.t).length - trainDraws) / secs).toFixed(1);
  }
  if (run.scenario === 'S8') [out.followMainMsPerS, out.followFps] = [mainMsPerS, fps];
  return out;
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : undefined;
};

export interface Check {
  check: string;
  metric: string;
  scenarios: string[];
  desktop: number | null;
  phone: number | null;
  atLeast?: boolean;
}

/** Each check of the budget that a scenario's medians have a number for, held to its limit for the device. */
export function compare(checks: Check[], device: 'desktop' | 'phone', medians: Record<string, Record<string, number | undefined>>) {
  return checks.flatMap((c) => {
    const limit = c[device];
    return limit === null ? [] : c.scenarios.flatMap((scenario) => {
      const value = medians[scenario]?.[c.metric];
      return value === undefined ? [] : [{ ...c, scenario, value, limit, breach: c.atLeast ? value < limit : value > limit }];
    });
  });
}

/** The workers' busy ms between two page times, from a trace's top-level tasks, tied to page time by the `perf:nav` mark. */
function workerBusy(trace: { traceEvents: { name: string; ph: string; pid: number; tid: number; ts: number; dur?: number; cat: string; args?: { name?: string } }[] }, navAt: number, from: number, to: number) {
  const events = trace.traceEvents;
  const nav = events.find((e) => e.name === 'perf:nav');
  if (!nav) return undefined;
  const workers = new Set(events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === nav.pid && /DedicatedWorker/.test(e.args?.name ?? '')).map((e) => e.tid));
  const [a, b] = [nav.ts + (from - navAt) * 1000, nav.ts + (to - navAt) * 1000];
  let busy = 0;
  for (const tid of workers) {
    // A thread's top-level tasks can nest: their union.
    const spans = events.filter((e) => e.ph === 'X' && e.pid === nav.pid && e.tid === tid && e.dur && e.cat.split(',').includes('toplevel')).map((e) => [e.ts, e.ts + e.dur!]).sort((x, y) => x[0]! - y[0]!);
    let end = -Infinity;
    for (const [s, f] of spans as [number, number][]) {
      const [cs, cf] = [Math.max(s, end, a), Math.min(f, b)];
      if (cf > cs) busy += cf - cs;
      end = Math.max(end, f);
    }
  }
  return Math.round(busy / 1000);
}

/** The JS heap after a full GC, MB, rather than as it stands, which is mostly garbage V8 hasn't collected yet (#775, #779). */
export async function heapAfterGC(cdp: Pick<CDPSession, 'send'>) {
  await cdp.send('HeapProfiler.collectGarbage');
  return Math.round((await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'JSHeapUsedSize')!.value / 1e6);
}

async function measure(browser: Browser, name: string, o: { device: Device; dist: string; tree: string; out?: string; slow: boolean; run: number }): Promise<Run> {
  const sc = SCENARIOS[name]!;
  const manifest = sc.clock && ((o.out ? JSON.parse(fs.readFileSync(path.join(o.out, 'manifest.json'), 'utf8')) : await (await fetch(`${LIVE_URL}/manifest.json`)).json()) as Manifest);
  const clock = manifest ? sc.clock!(manifest) : undefined;
  const m = await openMap(browser, { device: o.device, dist: o.dist, hash: sc.view, out: o.out, slow: o.slow, clock, abort: clock ? [/\/snapshot\.json/] : [], throttle: true });
  const run: Run = { scenario: name, device: o.device, tree: o.tree, run: o.run, clock, marks: [], frames: [], setData: [], renders: [], files: [], heapPeakMB: 0, errors: m.errors };
  const metric = async (key: string) => (await m.cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === key)!.value;
  const mark = async (n: string) => void run.marks.push({ name: n, t: await m.page.evaluate((n) => (performance.mark(`perf:${n}`), performance.now()), n), task: await metric('TaskDuration') });
  const heap = setInterval(() => metric('JSHeapUsedSize').then((h) => (run.heapPeakMB = Math.max(run.heapPeakMB!, Math.round(h / 1e6))), () => {}), 1000);
  try {
    if (sc.trace) await browser.startTracing(m.page, { categories: ['toplevel', 'blink.user_timing'] });
    await m.go();
    await mark('nav');
    await sc.act(m.page, mark, o.device);
    Object.assign(
      run,
      await m.page.evaluate((live) => ({
        frames: window.__p.frames,
        setData: window.__p.setData,
        renders: window.__p.renders,
        files: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.name.startsWith(live)).map((e) => ({ file: e.name.slice(live.length + 1), end: e.responseEnd })),
      }), LIVE_URL),
    );
    if (sc.trace) run.workerMs = workerBusy(JSON.parse((await browser.stopTracing()).toString()), run.marks[0]!.t, run.marks[0]!.t, run.marks[0]!.t + 15_000);
    clearInterval(heap);
    // Only S3's is budgeted; a GC of a heap near 1 GB on the phone would only lengthen the others' runs.
    if (name === 'S3') run.heapMB = await heapAfterGC(m.cdp).catch((e) => void run.errors.push(`heapAfterGC ${String(e)}`));
  } finally {
    clearInterval(heap);
    await m.close();
  }
  return run;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const after = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] && !args[i + 1]!.startsWith('--') ? [args[i + 1]!] : []));
  const scenarios = args.filter((a, i) => !a.startsWith('--') && (SCENARIOS[a] || !['--runs', '--tree', '--out'].includes(args[i - 1] ?? '')));
  const unknown = scenarios.filter((s) => !SCENARIOS[s]);
  if (!scenarios.length || unknown.length) {
    console.error(`npm run perf -- <${Object.keys(SCENARIOS).join('|')}>... [--phone] [--runs <n>] [--tree <dir>]... [--out [dir]] [--slow]${unknown.length ? `\nNo scenario ${unknown.join(', ')}` : ''}`);
    process.exit(2);
  }
  const device = args.includes('--phone') ? 'phone' : 'desktop';
  const runs = Number(after('--runs')[0] ?? 3);
  const trees = (after('--tree').length ? after('--tree') : ['.']).map((t) => path.resolve(t));
  const out = args.includes('--out') ? path.resolve(after('--out').find((d) => !SCENARIOS[d]) ?? 'out') : undefined;
  const dists = trees.map(build);
  const log = path.resolve('.cache/page/perf/runs.jsonl');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const all: Run[] = [];
  for (const name of scenarios)
    for (let r = 1; r <= runs; r++)
      await withSlots(SLOTS, async () => {
        const browser = await launch();
        try {
          for (const [i, tree] of trees.entries()) {
            const run = await measure(browser, name, { device, dist: dists[i]!, tree, out, slow: args.includes('--slow'), run: r });
            run.load = os.loadavg().map((l) => l.toFixed(1)).join(' ');
            fs.appendFileSync(log, JSON.stringify(run) + '\n');
            all.push(run);
            const pageerrors = run.errors.filter((e) => e.startsWith('pageerror'));
            console.log(`${new Date().toTimeString().slice(0, 8)} ${name} ${device} ${path.basename(tree)} run ${r}: load ${run.load}${pageerrors.length ? `, ${pageerrors.join('; ')}` : ''}`);
          }
        } finally {
          await browser.close();
        }
      });
  let breached = false;
  for (const tree of trees) {
    const medians: Record<string, Record<string, number | undefined>> = {};
    for (const name of scenarios) {
      const ms = all.filter((r) => r.scenario === name && r.tree === tree).map(metrics);
      medians[name] = Object.fromEntries([...new Set(ms.flatMap(Object.keys))].map((k) => [k, median(ms.flatMap((m) => (m[k] === undefined ? [] : [m[k]!])))]));
    }
    console.log(`\n${tree}, ${device}, median of ${runs}:\n| check | scenario | median | limit | |\n|---|---|---|---|---|`);
    for (const c of compare(budget, device, medians)) {
      console.log(`| ${c.check} | ${c.scenario} | ${Math.round(c.value * 10) / 10} | ${c.atLeast ? '≥' : '≤'} ${c.limit} | ${c.breach ? 'BREACH' : 'ok'} |`);
      breached ||= c.breach;
    }
    for (const name of scenarios) if (medians[name]!.heapPeakMB !== undefined) console.log(`| JS heap's peak, garbage included, MB (not budgeted) | ${name} | ${medians[name]!.heapPeakMB} | | |`);
  }
  process.exit(breached ? 1 : 0);
}
