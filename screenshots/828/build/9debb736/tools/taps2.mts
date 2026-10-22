// #828 re-measure on 9debb736: the tap check, as the fix's check.mts MODE=taps, at Passeig de Gràcia z13 from +60 s, light,
// phone and laptop. Each counted pill in the clear middle tapped in turn (largest first, up to 8): how many of its pile's
// Trains are drawn after (a full spread), which spread Trains took in a Train from outside the pile, shown "+n", and a tap on
// such a count, which adds its pile to the group (joined()); a tap elsewhere after each. Then the followed Train, once one
// followed has a count and is moving: dragged off, a tap on its pill (takes it back, re-centred, as on main, #325), a tap on
// its count (spreads its pile); shot each time on the phone (shots/followed-*.png).
//   cd <SP>/wt-828 && node ../828/measure2/taps2.mts → taps2.jsonl
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
const { tally } = await import('./shoot2.mts');
const { CAPTURE, CLEAR_SPOT, MIRROR, scene, T0, TREES, wait } = await import('../measure/shoot.mts');
const { build, DEVICES, launch, openMap, ready } = await import('../../wt-828/src/page/page.ts');
const { withSlots } = await import('../../wt-828/src/page/slots.ts');
const { boxOf, SMALL_TEXT } = await import('../../wt-828/src/web/pill.ts');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, process.env.OUT ?? 'taps2.jsonl');
const append = (row: object) => fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
type XY = number[];
const meets = (a: { at: XY; box: XY }, b: { at: XY; box: XY }) => Math.abs(a.at[0]! - b.at[0]!) < a.box[0]! + b.box[0]! && Math.abs(a.at[1]! - b.at[1]!) < a.box[1]! + b.box[1]!;
const far = (a: XY, b: XY) => Math.round(Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!));

async function taps(browser: Browser, dist: string, device: 'phone' | 'laptop', tag = '') {
  const { width: W, height: H } = DEVICES[device].viewport;
  const clear = device === 'phone' ? [30, 120, W - 30, H - 170] : [140, 90, W - 70, H - 100];
  const inside = ([x, y]: XY) => x! > clear[0]! && y! > clear[1]! && x! < clear[2]! && y! < clear[3]!;
  const m = await openMap(browser, { device, scheme: 'light', dist, out: MIRROR, at: CAPTURE, hash: '#map=13/41.3893/2.1675' });
  const press = ([x, y]: XY) => (device === 'phone' ? m.page.touchscreen.tap(x!, y!) : m.page.mouse.click(x!, y!));
  const countOf = (p: { at: XY; countAt?: XY }) => [p.at[0]! + p.countAt![0]! * SMALL_TEXT, p.at[1]! + p.countAt![1]! * SMALL_TEXT];
  const now = async () => tally(await scene(m.page));
  const shot = (state: string) => (device === 'phone' ? m.page.screenshot({ path: path.join(HERE, 'shots', `followed-${state}-${device}-light${tag}.png`) }) : undefined);
  // What a point hits, topmost first, and the Centre button's state (shown while the map has let go of the followed Train, #325).
  const hits = (p: XY) => m.page.evaluate(([x, y]) => window.map.queryRenderedFeatures([x!, y!], { layers: ['train-counts-followed', 'train-pills-followed', 'train-counts', 'train-pills'] }).map((f) => `${f.layer.id} ${f.properties.name}`), [p[0]!, p[1]!]);
  const centring = () => m.page.evaluate(() => [...document.querySelectorAll('button.fab')].map((b) => `${(b as HTMLButtonElement).title}:${(b as HTMLButtonElement).hidden ? 'hidden' : 'shown'}`).join(' '));
  const elsewhere = async () => {
    const spot = (await m.page.evaluate(CLEAR_SPOT, [clear, 30] as [number[], number])) ?? (await m.page.evaluate(CLEAR_SPOT, [clear, 23] as [number[], number]));
    if (spot) await press(spot);
    await wait(1200);
    return spot;
  };
  /** A drag of the map by `by` px from `from`: the mouse's on the laptop, a finger's on the phone (CDP touch events, as MapLibre's touch pan takes them). */
  const drag = async (from: XY, by: XY) => {
    if (device === 'laptop') {
      await m.page.mouse.move(from[0]!, from[1]!);
      await m.page.mouse.down();
      await m.page.mouse.move(from[0]! + by[0]!, from[1]! + by[1]!, { steps: 8 });
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
  const tapped = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const t0 = await now();
    const target = t0.drawn.filter((p) => p.more > 0 && inside(p.at) && !tapped.has(p.id)).sort((a, b) => b.more - a.more)[0];
    if (!target) break;
    tapped.add(target.id);
    const members = [target.id, ...(t0.rule.get(target.id)?.folded ?? [])];
    const was = new Map(t0.all.map((p) => [p.id, p]));
    await press(countOf(target));
    await wait(1500);
    const s1 = await scene(m.page);
    const t1 = tally(s1, new Set(members));
    const by1 = new Map(t1.all.map((p) => [p.id, p]));
    const took = members.filter((id) => by1.get(id) && !by1.get(id)!.folded && by1.get(id)!.more > 0);
    const row: Record<string, unknown> = {
      device,
      late: s1.clock - (T0 + 60_000),
      target: `${target.name}+${target.more}`,
      drawn: members.filter((id) => by1.get(id) && !by1.get(id)!.folded).length,
      of: members.length,
      tookIn: took.map((id) => `${by1.get(id)!.name}+${by1.get(id)!.more}`),
      moved: members.map((id) => (by1.get(id) ? far(by1.get(id)!.at, was.get(id)!.at) : null)),
      followed: t1.all.find((p) => p.followed)?.name ?? null,
      train: s1.hash.includes('train='),
    };
    // A tap on the count of a spread Train that took one in: it adds that pile to the group, following nothing.
    const host = took.map((id) => by1.get(id)!).find((p) => inside(p.at));
    if (host) {
      const more = t1.rule.get(host.id)?.folded ?? [];
      await press(countOf(host));
      await wait(1500);
      const s2 = await scene(m.page);
      const by2 = new Map(tally(s2).all.map((p) => [p.id, p]));
      Object.assign(row, { extended: `${host.name}+${host.more}`, extendedDrawn: [...members, ...more].filter((id) => by2.get(id) && !by2.get(id)!.folded).length, extendedOf: members.length + more.length, extendedFollowed: [...by2.values()].find((p) => p.followed)?.name ?? null, extendedTrain: s2.hash.includes('train=') });
    }
    append(row);
    console.log(`${device} ${JSON.stringify(row)}`);
    if (!(await elsewhere())) break;
  }
  // The followed Train: a counted pile spread, a tap on its top pill follows it, a tap elsewhere folds the group; until one
  // followed has a count and is moving, as one standing with others touching spreads them on a tap, as on main (#129).
  const row: Record<string, unknown> = { device, check: 'followed' };
  const where = () => m.page.evaluate(() => ((window.map.getSource('trains') as import('maplibre-gl').GeoJSONSource).serialize().data as GeoJSON.FeatureCollection<GeoJSON.Point>).features.find((f) => f.properties?.followed)?.geometry.coordinates.join());
  for (let tries = 0; tries < 8 && !row.followedCount; tries++) {
    const list = (await now()).drawn.filter((p) => p.more > 0 && inside(p.at)).sort((a, b) => b.more - a.more);
    const target = list[tries % Math.max(1, list.length)];
    if (!target) break;
    await press(countOf(target));
    await wait(1200);
    const spread = (await now()).all.find((p) => p.id === target.id)!;
    await press([spread.at[0]!, spread.at[1]! + (spread.more ? 3 : 0)]);
    await wait(2500);
    row[`elsewhere${tries}`] = await elsewhere();
    // Moving: not where it was 2 s before, once it has eased back from the group's spread.
    await wait(1500);
    const [a, b] = [await where(), (await wait(2000), await where())];
    const f = (await now()).all.find((p) => p.followed);
    if (f && f.more > 0 && a !== b) Object.assign(row, { followed: f.name, followedCount: f.more, tries, moving: true });
    else row[`skipped${tries}`] = `${f?.name}+${f?.more} ${a === b ? 'standing' : 'moving'}`;
  }
  if (row.followedCount) {
    let f = (await now()).all.find((p) => p.followed)!;
    const centreAt = f.at;
    await shot('0-followed');
    // Let go by a drag, so that the tap on its pill has to take it back (#325): from a spot clear of the panels.
    await drag(device === 'laptop' ? [W / 2, H / 2] : [W / 2, 200], device === 'laptop' ? [120, 60] : [90, 60]);
    await wait(800);
    f = (await now()).all.find((p) => p.followed)!;
    const draggedAt = f.at;
    row.draggedOff = far(f.at, centreAt);
    await shot('1-dragged');
    // Its pill, clear of its count.
    const count = { at: countOf(f), box: [boxOf('round', 12, SMALL_TEXT)[0] + 1.5, boxOf('round', 12, SMALL_TEXT)[1] + 1.5] };
    // SPOT=probe: the point of its pill nearest its centre where the pill, not its count, is the topmost thing a tap hits.
    const spot =
      process.env.SPOT === 'probe'
        ? await m.page.evaluate(
            ([x, y, w, h]) => {
              const spots: [number, number][] = [];
              for (let dy = -h! + 2; dy <= h! - 2; dy += 1) for (let dx = -w! + 2; dx <= w! - 2; dx += 1) spots.push([x! + dx, y! + dy]);
              spots.sort((a, b) => Math.hypot(a[0] - x!, a[1] - y!) - Math.hypot(b[0] - x!, b[1] - y!));
              return spots.find(([sx, sy]) => window.map.queryRenderedFeatures([sx, sy], { layers: ['train-counts-followed', 'train-pills-followed', 'train-counts', 'train-pills'] })[0]?.layer.id === 'train-pills-followed')!;
            },
            [f.at[0]!, f.at[1]!, f.box[0]!, f.box[1]!],
          )
        : [[0, 0], [0, 3], [0, -3], [-5, 0], [5, 0], [-5, 3], [5, 3], [-5, -3], [5, -3]].map(([dx, dy]) => [f.at[0]! + dx!, f.at[1]! + dy!]).find((p) => meets({ at: p, box: [0, 0] }, { at: f.at, box: f.box }) && !meets({ at: p, box: [1, 1] }, count))!;
    row.centreHits = await hits(f.at);
    const pileBefore = (await now()).rule.get(f.id)?.folded ?? [];
    Object.assign(row, { draggedCount: `${f.name}+${f.more}`, countAt: f.countAt?.map((v) => Math.round(v * SMALL_TEXT)), box: f.box.map(Math.round), spot: spot.map(Math.round), spotHits: await hits(spot), centreDragged: await centring() });
    await press(spot);
    await wait(2000);
    const all2 = (await now()).all;
    const h = all2.find((p) => p.followed);
    row.pillTap = { stillFollowed: h?.id === f.id, countAfter: h?.more ?? null, back: h ? far(h.at, centreAt) : null, at: h?.at.map(Math.round), pileDrawn: pileBefore.filter((id) => all2.find((p) => p.id === id && !p.folded)).length, of: pileBefore.length, centre: await centring() };
    await shot('2-pill');
    const t = await now();
    const g = t.all.find((p) => p.followed);
    if (g && g.more > 0) {
      const pile = t.rule.get(g.id)?.folded ?? [];
      const hits = await m.page.evaluate(([x, y]) => window.map.queryRenderedFeatures([x!, y!], { layers: ['train-counts-followed', 'train-pills-followed', 'train-counts', 'train-pills'] }).map((f) => `${f.layer.id} ${f.properties.name}`), countOf(g));
      await press(countOf(g));
      await wait(1500);
      const after = (await now()).all;
      const k = after.find((p) => p.followed);
      row.countTap = { count: `${g.name}+${g.more}`, hits, stillFollowed: k?.id === f.id, countAfter: k?.more ?? null, pileDrawn: pile.filter((id) => after.find((p) => p.id === id && !p.folded)).length, of: pile.length, moved: pile.map((id) => { const [p0, p1] = [t.all.find((p) => p.id === id), after.find((p) => p.id === id)]; return p0 && p1 ? far(p0.at, p1.at) : null; }) };
      await shot('3-count');
    } else row.countTap = { note: `no count on the followed Train after the pill tap (${g?.name}+${g?.more})` };
    Object.assign(row, { centreAt, draggedAt });
  }
  append(row);
  console.log(`${device} ${JSON.stringify(row)}`);
  console.log(`${device} errors: ${[...new Set(m.errors)].join(' | ') || 'none'}`);
  await m.close();
}

fs.mkdirSync(path.join(HERE, 'shots'), { recursive: true });
const dist = build(TREES.branch);
await withSlots(1, async () => {
  const browser = await launch();
  try {
    const devices = (process.env.DEVICES ?? 'phone,laptop').split(',') as ('phone' | 'laptop')[];
    await Promise.all(devices.map((device, i) => taps(browser, dist, device, devices.length > 2 || devices[0] === devices[1] ? `-${i}` : '')));
  } finally {
    await browser.close();
  }
});
