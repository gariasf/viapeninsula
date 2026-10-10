// #209: the heap at zoom 10 over Barcelona, measured: how much of central Barcelona the Trains' markers cover, with
// and without their halos, and how many Train markers touch another Train's or a Station's dot, per variant.
import { chromium } from '/Users/guillem.arias/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const snapshot = JSON.parse(readFileSync(`${here}live/snapshot.json`, 'utf8'));
const time = snapshot.generated + 5000;
const LIVE = 'https://viapeninsula-live.gariasf.com/';
const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
for (const scheme of ['light', 'dark']) {
  // Each variant's Train dots' radius by zoom, as trains.prototype.ts's trainDot() has it.
  const TODAY = [[7, 2.5], [14, 6]];
  const SMALL = [[7, 1.75], [10, 2.75], [12, 4], [14, 6]];
  for (const [label, query, stops] of [['today', '', TODAY], ['small', 'small', SMALL], ['halo', 'halo', TODAY], ['pick', 'pick', TODAY]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', colorScheme: scheme });
    await ctx.route(`${LIVE}**`, (r) => r.fulfill({ path: `${here}live/${r.request().url().replace(LIVE, '').split('?')[0]}`, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } }));
    await ctx.addInitScript((target) => {
      const D = Date;
      globalThis.Date = class extends D {
        constructor(...a) {
          if (a.length) super(...a);
          else super(target);
        }
        static now() {
          return target;
        }
      };
      const later = globalThis.setTimeout;
      globalThis.setTimeout = (f, ms, ...a) => (ms === 20000 ? 0 : later(f, ms, ...a));
    }, time);
    const p = await ctx.newPage();
    // Barcelona at zoom 10, as the z10 shots.
    await p.goto(`http://localhost:5209/${query ? `?trains=${query}` : ''}#map=10/41.4500/2.1000`);
    await p.waitForFunction(() => typeof window.__map?.getSource === 'function' && window.__map.getSource('trains')?.serialize().data.features.length > 20, null, { timeout: 90000, polling: 250 });
    await p.waitForTimeout(3000);
    const row = await p.evaluate((stops) => {
      const map = window.__map;
      const zoom = map.getZoom();
      const at = (stops) => {
        for (let i = 1; i < stops.length; i++) if (zoom <= stops[i][0]) return stops[i - 1][1] + ((stops[i][1] - stops[i - 1][1]) * (zoom - stops[i - 1][0])) / (stops[i][0] - stops[i - 1][0]);
        return stops.at(-1)[1];
      };
      const dotRadius = at(stops);
      const [liveRing, scheduledRing] = [at([[7, 0.5], [14, 1.5]]), at([[7, 1.5], [14, 3]])];
      const ctx2 = document.createElement('canvas').getContext('2d');
      ctx2.font = 'bold 10px "Nunito Sans"';
      const OUT = { round: [15, 9], pointed: [12, 2], badge: [15, 13] };
      // Central Barcelona: Sants to the Besòs and Montjuïc to Horta, on screen.
      const [a, b] = [map.project([2.115, 41.43]), map.project([2.21, 41.36])];
      const box = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      const inside = (x, y) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
      const trains = map.getSource('trains').serialize().data.features.map((f) => {
        const { x, y } = map.project(f.geometry.coordinates);
        const pill = zoom >= f.properties.pillZoom;
        const [ow, across] = OUT[f.properties.outline] ?? OUT.round;
        const half = pill ? [Math.max(ow, ow - across + ctx2.measureText(f.properties.name).width + 4) / 2 + 1.5, 9] : undefined;
        const r = pill ? undefined : dotRadius + (f.properties.live ? liveRing : scheduledRing);
        return { x, y, pill, half, r, halo: f.properties.live ? f.properties.haloRadius : 0 };
      }).filter((t) => inside(t.x, t.y));
      const stations = map.getSource('stations').serialize().data.features.map((f) => ({ ...map.project(f.geometry.coordinates), r: at([[7, 1.5], [14, 5]]) + f.properties.larger + at([[7, 0.5], [14, 1.5]]) })).filter((s) => inside(s.x, s.y));
      // Whether two markers touch: circles, or a pill's box against a circle or another box.
      const reach = (t, dx, dy) => (t.pill ? Math.hypot(Math.max(0, Math.abs(dx) - t.half[0]), Math.max(0, Math.abs(dy) - t.half[1])) : Math.max(0, Math.hypot(dx, dy) - t.r));
      const touch = (s, t) => {
        if (!s.pill && !t.pill) return Math.hypot(s.x - t.x, s.y - t.y) < s.r + t.r;
        if (s.pill && t.pill) return Math.abs(s.x - t.x) < s.half[0] + t.half[0] && Math.abs(s.y - t.y) < s.half[1] + t.half[1];
        const [p, c] = s.pill ? [s, t] : [t, s];
        return reach(p, c.x - p.x, c.y - p.y) < c.r;
      };
      const touchingTrain = trains.filter((t) => trains.some((u) => u !== t && touch(t, u))).length;
      const touchingStation = trains.filter((t) => stations.some((s) => touch(t, { ...s, pill: false }))).length;
      // How much of the box the markers cover, alone and with their halos, counted on a canvas at 1 px a px.
      const [w, h] = [Math.ceil(box.x1 - box.x0), Math.ceil(box.y1 - box.y0)];
      const cover = (halos) => {
        const c = new OffscreenCanvas(w, h).getContext('2d');
        c.translate(-box.x0, -box.y0);
        for (const t of trains) {
          c.beginPath();
          if (t.pill) c.rect(t.x - t.half[0], t.y - t.half[1], 2 * t.half[0], 2 * t.half[1]);
          else c.arc(t.x, t.y, t.r, 0, 2 * Math.PI);
          if (halos && t.halo) c.arc(t.x, t.y, t.halo, 0, 2 * Math.PI);
          c.fill();
        }
        const data = c.getImageData(0, 0, w, h).data;
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 127) n++;
        return +((100 * n) / (w * h)).toFixed(1);
      };
      return { trains: trains.length, stations: stations.length, dotRadius: +dotRadius.toFixed(2), markers: cover(false), withHalos: cover(true), touchingTrain, touchingStation };
    }, stops);
    rows.push({ scheme, label, ...row });
    console.log(scheme, label, JSON.stringify(row));
    await ctx.close();
  }
}
await browser.close();
console.log('\n| Basemap | Variant | Trains in the box | Dot radius px | Markers cover | With halos | Touch a Train | Touch a Station |\n| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.scheme} | ${r.label} | ${r.trains} | ${r.dotRadius} | ${r.markers}% | ${r.withHalos}% | ${r.touchingTrain} | ${r.touchingStation} |`);
