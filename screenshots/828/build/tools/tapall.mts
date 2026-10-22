// #828 measure, after the tap shots left some of a tapped pile folded: on the branch, at Passeig de Gràcia z13 from the same
// page-clock second (+60 s), light, phone and laptop, a tap on each counted pill in the map's clear middle in turn (largest
// first, up to 8), then one elsewhere; for each, which of its pile's Trains are drawn after the tap, and of those that aren't,
// whether their pill touched another of the pile's where drawn (held(): a pile's Train is held apart only while it touches
// another, or stands at the tapped pill's Station) and whether a pill or only a "+n" count lay on their name (the count rule).
// On the laptop, last, the pointer on a count: a shot just before and just after it moves there.
//   cd <SP>/wt-828 && node ../828/measure/tapall.mts → tapall.jsonl, shots/hover-{away,on}-laptop-light.png
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
process.argv[2] = 'branch';
const { CAPTURE, CLEAR_SPOT, MIRROR, scene, T0, tally, TREES, wait } = await import('./shoot.mts');
const { build, DEVICES, launch, openMap, ready } = await import('../../wt-828/src/page/page.ts');
const { withSlots } = await import('../../wt-828/src/page/slots.ts');
const { covered } = await import('../../wt-828-main/src/web/spread.ts');
const { SMALL_TEXT } = await import('../../wt-828/src/web/pill.ts');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, 'tapall.jsonl');
const touches = (a: { at: number[]; box: number[] }, b: { at: number[]; box: number[] }) => Math.abs(a.at[0]! - b.at[0]!) < a.box[0]! + b.box[0]! && Math.abs(a.at[1]! - b.at[1]!) < a.box[1]! + b.box[1]!;

async function run(browser: Browser, dist: string, device: 'phone' | 'laptop') {
  const { width: W, height: H } = DEVICES[device].viewport;
  const clear = device === 'phone' ? [30, 120, W - 30, H - 170] : [140, 90, W - 70, H - 100];
  const inside = ([x, y]: number[]) => x! > clear[0]! && y! > clear[1]! && x! < clear[2]! && y! < clear[3]!;
  const press = ([x, y]: number[]) => (device === 'phone' ? m.page.touchscreen.tap(x!, y!) : m.page.mouse.click(x!, y!));
  const countOf = (p: { at: number[]; countAt?: number[] }) => [p.at[0]! + p.countAt![0]! * SMALL_TEXT, p.at[1]! + p.countAt![1]! * SMALL_TEXT];
  const m = await openMap(browser, { device, scheme: 'light', dist, out: MIRROR, at: CAPTURE, hash: '#map=13/41.3893/2.1675' });
  await m.go();
  await ready(m.page, 0);
  await m.page.waitForFunction((t) => Date.now() >= t, T0 + 60_000, { timeout: 200_000, polling: 200 });
  const tapped = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const s0 = await scene(m.page);
    const t0 = tally(s0);
    const target = t0.drawn.filter((p) => p.more > 0 && inside(p.at) && !tapped.has(p.id)).sort((a, b) => b.more - a.more)[0];
    if (!target) break;
    tapped.add(target.id);
    const ids = [target.id, ...(t0.rule.get(target.id) ?? [])];
    const by0 = new Map(t0.all.map((p) => [p.id, p]));
    const members = ids.map((id) => by0.get(id)!);
    // Whose name a pill over it meets, of all the pills in view (#513's rule), rather than only a count.
    const underAPill = covered(t0.all.map((p) => ({ id: p.id, at: p.at, box: p.box, name: p.nameBox })), undefined);
    await press(countOf(target));
    await wait(1500);
    const s1 = await scene(m.page);
    const by1 = new Map(tally(s1).all.map((p) => [p.id, p]));
    const row = {
      device,
      late: s0.clock - (T0 + 60_000),
      target: `${target.name}+${target.more}`,
      followed: [...by1.values()].find((p) => p.followed)?.name ?? null,
      drawn: ids.filter((id) => by1.get(id) && !by1.get(id)!.folded).length,
      of: ids.length,
      members: members.map((p) => ({
        name: p.name,
        drawn: !!by1.get(p.id) && !by1.get(p.id)!.folded,
        count: by1.get(p.id)?.more ?? 0,
        moved: by1.get(p.id) ? Math.round(Math.hypot(by1.get(p.id)!.at[0] - p.at[0], by1.get(p.id)!.at[1] - p.at[1])) : null,
        touchesAnother: members.some((o) => o !== p && touches(p, o)),
        nameUnderAPill: underAPill.has(p.id),
      })),
    };
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
    console.log(`${device} ${row.target}: ${row.drawn} of ${row.of} drawn after the tap, followed ${row.followed}; not drawn: ${row.members.filter((x) => !x.drawn).map((x) => `${x.name} (touches ${x.touchesAnother}, under a pill ${x.nameUnderAPill})`).join(', ') || 'none'}`);
    const spot = (await m.page.evaluate(CLEAR_SPOT, [clear, 30] as [number[], number])) ?? (await m.page.evaluate(CLEAR_SPOT, [clear, 23] as [number[], number]));
    if (!spot) break;
    await press(spot);
    await wait(1200);
  }
  if (device === 'laptop') {
    // The pointer away (on a clear spot), then on a count, the shots ~0.2 s apart.
    const spot = (await m.page.evaluate(CLEAR_SPOT, [clear, 30] as [number[], number]))!;
    await m.page.mouse.move(spot[0], spot[1]);
    await wait(300);
    const host = tally(await scene(m.page)).drawn.filter((p) => p.more > 0 && inside(p.at)).sort((a, b) => b.more - a.more)[0]!;
    await m.page.screenshot({ path: path.join(HERE, 'shots/hover-away-laptop-light.png') });
    const away = await m.page.evaluate(() => window.map.getCanvas().style.cursor);
    await m.page.mouse.move(...(countOf(host) as [number, number]));
    await m.page.screenshot({ path: path.join(HERE, 'shots/hover-on-laptop-light.png') });
    const on = await m.page.evaluate(() => window.map.getCanvas().style.cursor);
    fs.appendFileSync(OUT, JSON.stringify({ device, hover: `${host.name}+${host.more}`, at: host.at, pointAt: countOf(host), cursorAway: away, cursorOn: on }) + '\n');
    console.log(`laptop hover on ${host.name}+${host.more}: cursor '${away}' → '${on}'`);
  }
  console.log(`${device} errors: ${[...new Set(m.errors)].join(' | ') || 'none'}`);
  await m.close();
}

const dist = build(TREES.branch);
await withSlots(1, async () => {
  const browser = await launch();
  try {
    await Promise.all((['phone', 'laptop'] as const).map((device) => run(browser, dist, device)));
  } finally {
    await browser.close();
  }
});
