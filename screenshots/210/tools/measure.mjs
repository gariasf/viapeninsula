// #210: what the variants do to the heap at zoom 10 and to the names, measured on the dev map with the saved data:
// - z10 over central Barcelona (Sants to the Besòs, Montjuïc to Horta, as #209's heap.mjs): how many Station dots are
//   drawn, how much of the area they cover, and how many Trains' markers touch one;
// - at z12, z13 and z14, how many places' names show, and how many show twice in view (the same name, as at an
//   interchange of the Metro and TRAM), with an interchange's badge's name among them;
// - at z13 and z14, how many Stations' markers lie under a Train's pill.
// `node measure.mjs [label…]`, SCHEMES=light,dark.
import { launch, open } from './lib.mjs';
const only = process.argv.slice(2);
const VARIANTS = [
  ['today', ''],
  ['square', 'square'],
  ['board', 'board'],
  ['sign', 'sign'],
  ['badge', 'badge'],
  ['capsule', 'capsule'],
  ['bar', 'bar'],
  ['snap', 'snap'],
  ['few', 'few'],
  ['small', 'small'],
  ['pick', 'pick'],
].filter(([label]) => !only.length || only.includes(label));
const VIEWS = [
  ['z10', [2.1, 41.45], 10],
  ['z12', [2.165, 41.392], 12],
  ['z13', [2.17, 41.387], 13],
  ['z14', [2.1655, 41.3925], 14],
  ['ref14', [2.1737, 41.3995], 14],
];
const browser = await launch();
const rows = [];
for (const scheme of (process.env.SCHEMES ?? 'light').split(',')) {
  // One page for each basemap, which loads each variant in turn.
  const { ctx, p, ours, jump, load } = await open(browser, { scheme, hash: 'map=13/41.3870/2.1700' });
  for (const [label, query] of VARIANTS) {
    await load(query, 'map=13/41.3870/2.1700');
    for (const [view, center, zoom] of VIEWS) {
      await jump(center, zoom, 2500);
      const row = await p.evaluate(
        ({ query }) => {
          const map = window.__map;
          const zoom = map.getZoom();
          const parts = new Set(query.split(','));
          const has = (part) => parts.has(part) || (parts.has('pick') && ['square', 'sign', 'badge', 'snap', 'few'].includes(part)) || (part === 'sign' && has('badge'));
          const at = (stops, z = zoom) => {
            for (let i = 1; i < stops.length; i++) if (z <= stops[i][0]) return stops[i - 1][1] + ((stops[i][1] - stops[i - 1][1]) * (z - stops[i - 1][0])) / (stops[i][0] - stops[i - 1][0]);
            return stops.at(-1)[1];
          };
          const DOT = has('small') ? [[7, 1], [10, 1.75], [12, 4], [14, 5]] : [[7, 1.5], [14, 5]];
          const RING = [[7, 0.5], [14, 1.5]];
          const ctx2 = document.createElement('canvas').getContext('2d');
          ctx2.font = 'bold 10px "Nunito Sans"';
          const OUT = { round: [15, 9], pointed: [12, 2], badge: [15, 13] };
          const { width, height } = map.getCanvas().getBoundingClientRect();
          const box = zoom < 11 ? (() => {
            const [a, b] = [map.project([2.115, 41.43]), map.project([2.21, 41.36])];
            return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
          })() : { x0: 0, y0: 0, x1: width, y1: height };
          const inside = (x, y) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
          const trains = map.getSource('trains').serialize().data.features.map((f) => {
            const { x, y } = map.project(f.geometry.coordinates);
            const pill = zoom >= f.properties.pillZoom;
            const [ow, across] = OUT[f.properties.outline] ?? OUT.round;
            const half = pill ? [Math.max(ow, ow - across + ctx2.measureText(f.properties.name).width + 4) / 2 + 1.5, 9] : undefined;
            const r = pill ? undefined : at([[7, 2.5], [14, 6]]) + at(f.properties.live ? [[7, 0.5], [14, 1.5]] : [[7, 1.5], [14, 3]]);
            return { x, y, pill, half, r };
          }).filter((t) => inside(t.x, t.y));
          // The Stations' markers drawn: dots below the marks' zoom, or none for a place `few` leaves out; marks from 13.
          const signs = has('sign') && zoom >= 13;
          const fewer = new Set(window.__fewer ?? []);
          const stations = map.getSource('stations').serialize().data.features.map((f) => ({ ...map.project(f.geometry.coordinates), id: f.properties.id, larger: f.properties.larger, r: at(DOT) + f.properties.larger + at(RING) })).filter((s) => inside(s.x, s.y) && !(has('few') && zoom < 11 && fewer.has(s.id))).map((s) => (signs ? { ...s, r: 8 * at([[12.5, 0.75], [13, 0.8], [15, 1]]) } : s));
          const reach = (t, dx, dy) => (t.pill ? Math.hypot(Math.max(0, Math.abs(dx) - t.half[0]), Math.max(0, Math.abs(dy) - t.half[1])) : Math.max(0, Math.hypot(dx, dy) - t.r));
          const touchingStation = trains.filter((t) => stations.some((s) => reach(t, s.x - t.x, s.y - t.y) < s.r)).length;
          const underPill = stations.filter((s) => trains.some((t) => t.pill && reach(t, s.x - t.x, s.y - t.y) < s.r)).length;
          const [w, h] = [Math.ceil(box.x1 - box.x0), Math.ceil(box.y1 - box.y0)];
          const c = new OffscreenCanvas(w, h).getContext('2d');
          c.translate(-box.x0, -box.y0);
          for (const s of stations) {
            c.beginPath();
            c.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
            c.fill();
          }
          const data = c.getImageData(0, 0, w, h).data;
          let n = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 127) n++;
          // The names that show, and those that show twice in view.
          const names = [...map.queryRenderedFeatures({ layers: ['station-names'] }), ...(map.getLayer('v-badges') ? map.queryRenderedFeatures({ layers: ['v-badges'] }) : [])].map((f) => String(f.properties.name).replace(/\n/g, ' '));
          const seen = new Map();
          for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);
          return { trains: trains.length, stations: stations.length, cover: +((100 * n) / (w * h)).toFixed(1), touchingStation, underPill, names: names.length, twice: [...seen].filter(([, k]) => k > 1).map(([name]) => name) };
        },
        { query },
      );
      rows.push({ scheme, label, view, ...row });
      console.log(scheme, label, view, JSON.stringify(row));
    }
    const logs = ours();
    if (logs.length) console.log(logs.join('\n'));
  }
  await ctx.close();
}
await browser.close();
console.log('\n| Basemap | Variant | View | Trains | Station markers | Markers cover | Trains touching one | Markers under a pill | Names | Twice |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.scheme} | ${r.label} | ${r.view} | ${r.trains} | ${r.stations} | ${r.cover}% | ${r.touchingStation} | ${r.underPill} | ${r.names} | ${r.twice.join(', ') || '–'} |`);
