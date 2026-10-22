// #828 re-measure, a diagnosis: on the phone a tap on the followed Train's pill, after a drag let it go, neither took it back
// nor left its count (taps2.jsonl). Here, at Passeig de Gràcia z13 from +60 s, light, two phone pages: once a followed Train
// has a count and moves, a drag (DRAG: a finger's by CDP touch events, or the mouse's), then a tap on its pill; with what
// the tap point hits (topmost first), the Centre button's state (shown while the map has let go, #325), and what's drawn.
//   cd <SP>/wt-828 && node ../828/measure2/diag-followed.mts → diag-followed.jsonl
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
const { tally } = await import('./shoot2.mts');
const { CAPTURE, CLEAR_SPOT, MIRROR, scene, T0, TREES, wait } = await import('../measure/shoot.mts');
const { build, DEVICES, launch, openMap, ready } = await import('../../wt-828/src/page/page.ts');
const { withSlots } = await import('../../wt-828/src/page/slots.ts');
const { SMALL_TEXT } = await import('../../wt-828/src/web/pill.ts');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, 'diag-followed.jsonl');
type XY = number[];
const far = (a: XY, b: XY) => Math.round(Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!));

async function run(browser: Browser, dist: string, how: 'touch' | 'mouse', tapBy: 'touch' | 'mouse') {
  const device = 'phone';
  const { width: W, height: H } = DEVICES[device].viewport;
  const clear = [30, 120, W - 30, 480];
  const inside = ([x, y]: XY) => x! > clear[0]! && y! > clear[1]! && x! < clear[2]! && y! < clear[3]!;
  const m = await openMap(browser, { device, scheme: 'light', dist, out: MIRROR, at: CAPTURE, hash: '#map=13/41.3893/2.1675' });
  const press = ([x, y]: XY, by: 'touch' | 'mouse' = 'touch') => (by === 'touch' ? m.page.touchscreen.tap(x!, y!) : m.page.mouse.click(x!, y!));
  const countOf = (p: { at: XY; countAt?: XY }) => [p.at[0]! + p.countAt![0]! * SMALL_TEXT, p.at[1]! + p.countAt![1]! * SMALL_TEXT];
  const now = async () => tally(await scene(m.page));
  const fabs = () => m.page.evaluate(() => [...document.querySelectorAll('button.fab')].map((b) => `${(b as HTMLButtonElement).title || b.getAttribute('aria-label')}:${(b as HTMLButtonElement).hidden ? 'hidden' : 'shown'}`).join(' '));
  const hits = ([x, y]: XY) => m.page.evaluate(([x, y]) => window.map.queryRenderedFeatures([x!, y!], { layers: ['train-counts-followed', 'train-pills-followed', 'train-counts', 'train-pills'] }).map((f) => `${f.layer.id} ${f.properties.name}`), [x!, y!]);
  const elsewhere = async () => {
    const spot = (await m.page.evaluate(CLEAR_SPOT, [clear, 30] as [number[], number])) ?? (await m.page.evaluate(CLEAR_SPOT, [clear, 23] as [number[], number]));
    if (spot) await press(spot);
    await wait(1200);
    return spot;
  };
  const drag = async (from: XY, by: XY) => {
    if (how === 'mouse') {
      await m.page.mouse.move(from[0]!, from[1]!);
      await m.page.mouse.down();
      await m.page.mouse.move(from[0]! + by[0]!, from[1]! + by[1]!, { steps: 10 });
      await m.page.mouse.up();
      return;
    }
    const cdp = await m.page.context().newCDPSession(m.page);
    const at = (k: number) => [{ x: from[0]! + by[0]! * k, y: from[1]! + by[1]! * k }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let k = 1; k <= 10; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(k / 10) });
      await wait(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
  await m.go();
  await ready(m.page, 0);
  await m.page.waitForFunction((t) => Date.now() >= t, T0 + 60_000, { timeout: 200_000, polling: 200 });
  const row: Record<string, unknown> = { device, drag: how, tapBy };
  const where = () => m.page.evaluate(() => ((window.map.getSource('trains') as import('maplibre-gl').GeoJSONSource).serialize().data as GeoJSON.FeatureCollection<GeoJSON.Point>).features.find((f) => f.properties?.followed)?.geometry.coordinates.join());
  for (let tries = 0; tries < 10 && !row.followed; tries++) {
    const list = (await now()).drawn.filter((p) => p.more > 0 && inside(p.at)).sort((a, b) => b.more - a.more);
    const target = list[tries % Math.max(1, list.length)];
    if (!target) break;
    await press(countOf(target));
    await wait(1200);
    const spread = (await now()).all.find((p) => p.id === target.id)!;
    await press([spread.at[0]!, spread.at[1]! + (spread.more ? 3 : 0)]);
    await wait(2500);
    row[`elsewhere${tries}`] = await elsewhere();
    await wait(1500);
    const [a, b] = [await where(), (await wait(2000), await where())];
    const f = (await now()).all.find((p) => p.followed);
    if (f && f.more > 0 && a !== b) Object.assign(row, { followed: `${f.name}+${f.more}`, tries });
  }
  if (row.followed) {
    let f = (await now()).all.find((p) => p.followed)!;
    const centreAt = f.at;
    row.before = { at: f.at.map(Math.round), box: f.box.map((v) => Math.round(v * 10) / 10), countAt: f.countAt?.map((v) => Math.round(v * SMALL_TEXT)), fabs: await fabs() };
    await drag([W / 2, 200], [90, 60]);
    await wait(800);
    f = (await now()).all.find((p) => p.followed)!;
    row.dragged = { off: far(f.at, centreAt), more: f.more, countAt: f.countAt?.map((v) => Math.round(v * SMALL_TEXT)), fabs: await fabs() };
    // Its pill: its centre, and 4 px below it, away from a count at a top corner.
    const spot = [f.at[0]!, f.at[1]! + (f.countAt && f.countAt[1]! < 0 ? 4 : -4)];
    row.spot = { at: spot.map(Math.round), hits: await hits(spot) };
    const pile = (await now()).rule.get(f.id)?.folded ?? [];
    await press(spot, tapBy);
    await wait(2000);
    const after = (await now()).all;
    const g = after.find((p) => p.followed);
    row.pillTap = { stillFollowed: g?.id === f.id, back: g ? far(g.at, centreAt) : null, more: g?.more ?? null, pileDrawn: pile.filter((id) => after.find((p) => p.id === id && !p.folded)).length, of: pile.length, fabs: await fabs(), hash: (await scene(m.page)).hash.includes('train=') };
  }
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log(JSON.stringify(row));
  console.log(`${how}/${tapBy} errors: ${[...new Set(m.errors)].join(' | ') || 'none'}`);
  await m.close();
}

const dist = build(TREES.branch);
await withSlots(1, async () => {
  const browser = await launch();
  try {
    await Promise.all([run(browser, dist, 'touch', 'touch'), run(browser, dist, 'mouse', 'touch')]);
  } finally {
    await browser.close();
  }
});
