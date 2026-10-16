// #519's follow-up shots, after the maintainer's calls of 16 Oct 2026: the legend's dotted Scheduled marker,
// #208's four spots (with a board's Scheduled row hovered and focused), the followed Train's pulse while it
// stands at a Station, and a pale Line's Scheduled pill on a light card. Adapted from the first pass's tools/shots.ts.
// Run from the worktree: `node <this> <outDir> [tree] [legend|spots|standing|pale ...]`.
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { build, DEVICES, launch, openMap, ready, type Device } from '../../wt-519/src/page/page.ts';
import { withSlots } from '../../wt-519/src/page/slots.ts';

const [out = 'shots', tree = '.', ...only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const dist = build(path.resolve(tree));
const log = (s: string) => (console.log(s), fs.appendFileSync(path.join(out, 'shots.log'), `${s}\n`));
const SCHEMES = ['light', 'dark'] as const;
type Clip = { x: number; y: number; width: number; height: number };
/** The card's words for a Train standing at a Station, in each language (nextStationStanding). */
const STANDING = ["A l'estació", 'En la estación', 'Geltokian', 'Na estación', 'At station'];

/** A part of the shots, in a browser of its own in one slot, so that each keeps under the slots' 10 min cap. */
async function part(name: string, f: (browser: Browser) => Promise<void>) {
  if (only.length && !only.includes(name)) return;
  await withSlots(1, async () => {
    const browser = await launch();
    try {
      await f(browser);
    } catch (e) {
      log(`${name}: ${String(e)}`);
    } finally {
      await browser.close();
    }
  });
}

async function open(browser: Browser, device: Device, scheme: 'light' | 'dark', hash: string) {
  const m = await openMap(browser, { device, scheme, dist, hash });
  await m.go();
  await ready(m.page, 12_000);
  const { width, height } = DEVICES[device].viewport;
  const tag = `${scheme}-${width}x${height}`;
  const settle = async (ms = 2500) => {
    await m.page.waitForFunction(() => window.map.areTilesLoaded(), null, { timeout: 30_000 }).catch(() => {});
    await m.page.waitForTimeout(ms);
  };
  return {
    ...m,
    tag,
    width,
    height,
    settle,
    shot: (name: string, clip?: Clip) => m.page.screenshot({ path: path.join(out, `${name}-${tag}.png`), clip }),
    /** Moves the map, and opens what the hash names, as a link would. */
    go: async (hash: string, ms = 3000) => (await m.page.evaluate((h) => (location.hash = h), hash), await settle(ms)),
    around: ({ x, y }: { x: number; y: number }, r = 80): Clip => ({ x: Math.max(0, Math.min(width - 2 * r, x - r)), y: Math.max(0, Math.min(height - 2 * r, y - r)), width: 2 * r, height: 2 * r }),
    /** Where the followed Train's target is on screen. */
    target: () =>
      m.page.evaluate(() => {
        const f = window.map.queryRenderedFeatures({ layers: ['train-target'] })[0];
        return f?.geometry.type === 'Point' ? window.map.project(f.geometry.coordinates as [number, number]) : undefined;
      }),
    // In any case, as innerText is in the label's capitals.
    standing: () => m.page.evaluate((words) => words.some((w) => document.body.innerText.toLowerCase().includes(w.toLowerCase())), STANDING),
    done: async () => (log(`${tag}: ${[...new Set(m.errors)].join(' | ') || 'no errors'}`), await m.close()),
  };
}

/** The Trains on the map, with the link that follows each (`train=<service day>/<Trip>`) and its Line's contrast on white. */
const trains = (page: import('playwright-core').Page) =>
  page.evaluate(async () => {
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
    const channel = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string) => {
      const h = hex.slice(1).length === 3 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [data, stations] = await Promise.all([(window.map.getSource('trains') as import('maplibre-gl').GeoJSONSource).getData(), (window.map.getSource('stations') as import('maplibre-gl').GeoJSONSource).getData()]);
    const points = (stations as GeoJSON.FeatureCollection).features.map((s) => (s.geometry as GeoJSON.Point).coordinates);
    return (data as GeoJSON.FeatureCollection).features.map((f) => {
      const p = f.properties!;
      const at = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const id = String(p.id);
      return {
        id,
        link: id.includes('/') ? id : `${day}/${id}`,
        name: p.name as string | undefined,
        colour: p.colour as string | undefined,
        live: !!p.live,
        at,
        contrast: p.colour ? 1.05 / (luminance(p.colour) + 0.05) : 21,
        // How far the nearest Station is, in metres.
        station: points.reduce((least, [x = 0, y = 0]) => Math.min(least, Math.hypot((x - at[0]) * 83_500, (y - at[1]) * 111_000)), Infinity),
      };
    });
  });

// 1. The legend after the change, at rest, hovered, focused, and under forced colours, cropped to it.
await part('legend', async (browser) => {
  for (const device of ['phone', 'laptop'] as const)
    for (const scheme of SCHEMES) {
      const m = await open(browser, device, scheme, '#map=13.5/41.3874/2.1686');
      const legend = m.page.locator('button.legend').first();
      const box = (await legend.boundingBox())!;
      const clip = { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 };
      const marker = () =>
        m.page.evaluate(() => {
          const s = getComputedStyle(document.querySelector('.legend .marker.scheduled')!);
          return `${s.width}×${s.height}, ${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}, margin-left ${s.marginLeft}`;
        });
      await m.shot('legend-rest', clip);
      await legend.hover();
      await m.page.waitForTimeout(400);
      await m.shot('legend-hover', clip);
      await m.page.mouse.move(m.width / 2, m.height - 5);
      await legend.focus();
      await m.page.keyboard.press('Shift');
      await m.page.waitForTimeout(400);
      await m.shot('legend-focus', clip);
      await legend.evaluate((e) => (e as HTMLElement).blur());
      log(`${m.tag} legend's Scheduled marker: ${await marker()}`);
      await m.page.emulateMedia({ forcedColors: 'active' });
      await m.page.waitForTimeout(400);
      await m.shot('legend-forced-colours', clip);
      log(`${m.tag} under forced colours: ${await marker()}`);
      await m.page.emulateMedia({ forcedColors: 'none' });
      await m.done();
    }
});

// 2. #208's four spots (docs/research/design-references.md, section 1), at 390×844, as #209 shot them.
await part('spots', async (browser) => {
  for (const scheme of SCHEMES) {
    const m = await open(browser, 'phone', scheme, '#map=13/41.3870/2.1700');
    await m.settle();
    await m.shot('spot-z13-placa-catalunya');
    await m.go('map=10/41.4500/2.1000');
    await m.shot('spot-z10-barcelona');
    // The followed Train, as #209's: the first Live one by ID within 1 km of Paral·lel.
    const near = (await trains(m.page)).filter((t) => t.live && Math.hypot(t.at[0] - 2.1665, (t.at[1] - 41.375) * 1.33) < 0.012).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    if (near) {
      await m.go(`map=13/41.3750/2.1665&train=${near.link}`, 4000);
      await m.shot(`spot-follow-${near.name}`);
      await m.page.keyboard.press('Escape');
    } else log(`${m.tag}: no Live Train within 1 km of Paral·lel`);
    await m.go('map=15/41.3793/2.1404&station=adif:71801', 4000);
    await m.shot('spot-board-sants');
    await scheduledRow(m);
    await m.done();
  }
});

// 2b. A board's Scheduled row hovered on a laptop too, as a phone has no hover.
await part('rows', async (browser) => {
  for (const scheme of SCHEMES) {
    const m = await open(browser, 'laptop', scheme, '#map=15/41.3793/2.1404&station=adif:71801');
    await m.settle(3000);
    await scheduledRow(m);
    await m.done();
  }
});

/** Sants' first Scheduled row, hovered and focused, or where it has none, as every Train may be Live, Passeig de Gràcia's, as the first pass's, by a tap on its dot. */
async function scheduledRow(m: Awaited<ReturnType<typeof open>>) {
  if (await row(m, 'sants')) return;
  await m.page.keyboard.press('Escape');
  await m.go('map=15/41.3918/2.1649', 3000);
  const dot = await m.page.evaluate(() => {
    const c = window.map.project(window.map.getCenter());
    return window.map
      .queryRenderedFeatures({ layers: ['stations'] })
      .map((f) => window.map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]))
      .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
  });
  if (!dot) return;
  await m.page.mouse.click(dot.x, dot.y);
  await m.settle(3000);
  await m.shot('board-passeig-de-gracia');
  await row(m, 'passeig-de-gracia');
}

/** A board's first Scheduled row, hovered by a mouse, and focused by the keyboard; false where it has none. */
async function row(m: Awaited<ReturnType<typeof open>>, board: string) {
  const row = m.page.locator('.rows button.row:has(.pill.scheduled)').first();
  if (!(await row.count())) return log(`${m.tag}: no Scheduled row on ${board}'s board`), false;
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const [x, y] = [Math.max(0, box.x - 24), Math.max(0, box.y - 60)];
  const clip = { x, y, width: Math.min(m.width - x, box.width + 48), height: Math.min(m.height - y, box.height + 120) };
  await m.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await m.page.waitForTimeout(400);
  await m.shot(`board-${board}-row-hover`, clip);
  await m.page.mouse.move(m.width / 2, 40);
  await row.focus();
  await m.page.keyboard.press('Shift');
  await m.page.waitForTimeout(400);
  await m.shot(`board-${board}-row-focus`, clip);
  return true;
}

// 3. The followed Train's pulse while it stands at a Station: the Trains nearest a Station, followed in turn
// until the card says it stands, then its target four times across the pulse's 1.6 s.
await part('standing', async (browser) => {
  for (const scheme of SCHEMES) {
    const m = await open(browser, 'phone', scheme, '#map=12/41.3870/2.1700');
    const tried = new Set<string>();
    let found = false;
    for (let round = 0; round < 3 && !found; round++) {
      const near = (await trains(m.page)).filter((t) => t.name && t.station < 120 && !tried.has(t.id)).sort((a, b) => Number(b.live) - Number(a.live) || a.station - b.station);
      for (const t of near.slice(0, 8)) {
        tried.add(t.id);
        await m.go(`map=15/${t.at[1]}/${t.at[0]}&train=${t.link}`, 3000);
        if (!(await m.standing())) continue;
        await m.shot(`standing-follow-${t.name}`);
        for (let i = 1; i <= 4; i++) {
          const at = await m.target();
          if (at) await m.shot(`standing-pulse-${i}-${t.name}`, m.around(at));
          await m.page.waitForTimeout(250);
        }
        log(`${m.tag}: ${t.live ? 'Live' : 'Scheduled'} ${t.name} ${t.id}, ${Math.round(t.station)} m from a Station, standing after the shots: ${await m.standing()}`);
        found = true;
        break;
      }
      if (!found) await m.go('map=12/41.3870/2.1700', 5000);
    }
    if (!found) log(`${m.tag}: no Train found standing at a Station (${tried.size} tried)`);
    await m.done();
  }
});

// 4. A pale Line's Scheduled pill on a light card: the palest Line on white with a Scheduled Train on the map, followed.
await part('pale', async (browser) => {
  const m = await open(browser, 'phone', 'light', '#map=10/41.4500/2.1000');
  const scheduled = (await trains(m.page)).filter((t) => !t.live && t.name).sort((a, b) => a.contrast - b.contrast);
  const byLine = new Map<string, string>();
  for (const t of scheduled) byLine.set(t.name!, `${t.name} ${t.colour} ${t.contrast.toFixed(2)}:1`);
  log(`Scheduled Trains' Lines, palest first: ${[...byLine.values()].slice(0, 12).join(', ')}`);
  const pale = scheduled.find((t) => t.contrast < 3);
  if (pale) {
    await m.go(`map=14/${pale.at[1]}/${pale.at[0]}&train=${pale.link}`, 4000);
    await m.shot(`pale-follow-${pale.name}`);
    const pill = m.page.locator('.pill.scheduled:visible').first();
    const box = await pill.boundingBox();
    if (box) {
      await m.shot(`pale-card-pill-${pale.name}`, { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: Math.min(m.width - Math.max(0, box.x - 16), 240), height: box.height + 32 });
      log(`${m.tag}: ${pale.name} ${pale.colour} (${pale.contrast.toFixed(2)}:1 on white), the card's pill "${await pill.textContent()}": ${await pill.evaluate((e) => getComputedStyle(e).borderTopColor + ' ' + getComputedStyle(e).borderTopStyle)}`);
    }
    const at = await m.target();
    if (at) await m.shot(`pale-map-pill-${pale.name}`, m.around(at));
  } else log(`${m.tag}: no Scheduled Train of a Line under 3:1 on white on the map`);
  await m.done();
});
