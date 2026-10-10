// Review of #209: the heap at zoom 10, measured from what MapLibre draws, not from a model of it. With every layer
// but the Trains' hidden, the canvas's own pixels over central Barcelona (Sants to the Besòs, Montjuïc to Horta:
// 2.115,41.43 to 2.21,41.36), read in the render event: the share with a Train's marker (dot, ring, pill, dashes;
// arrows apart), and with the halos too, as discs (blur 0, opacity 1) and as drawn (alpha ≥ 10%). And how many
// Trains touch a Station's dot, by MapLibre's own query of the stations layer over each Train's marker.
import { launch, open, jump } from './common.mjs';
const browser = await launch();
const rows = [];
for (const colorScheme of (process.env.SCHEMES ?? 'light,dark').split(',')) {
  for (const [label, query] of [['today', ''], ['small', 'small'], ['halo', 'halo'], ['pick', 'pick']]) {
    const { ctx, page } = await open(browser, { query, colorScheme });
    await jump(page, [2.1, 41.45], 10);
    const row = await page.evaluate(async () => {
      const map = window.__map;
      const ids = map.getStyle().layers.map((l) => l.id);
      const MARKERS = ['trains', 'train-pills', 'train-pills-followed', 'train-dot-dashes', 'train-pill-dashes', 'train-pill-dashes-followed'].filter((id) => ids.includes(id));
      const [a, b] = [map.project([2.115, 41.43]), map.project([2.21, 41.36])];
      const dpr = devicePixelRatio;
      const canvas = map.getCanvas();
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const [x0, y0, w, h] = [Math.round(a.x * dpr), Math.round(a.y * dpr), Math.round((b.x - a.x) * dpr), Math.round((b.y - a.y) * dpr)];
      // The share of the box's pixels whose alpha is at least `min` (0–255), with only `layers` shown.
      const share = async (layers, min) => {
        for (const id of ids) map.setLayoutProperty(id, 'visibility', layers.includes(id) ? 'visible' : 'none');
        // Past symbols' fade in and any paint transition, so that what's read is what stands.
        await new Promise((r) => setTimeout(r, 800));
        const pixels = await new Promise((done) => {
          map.once('render', () => {
            const buf = new Uint8Array(w * h * 4);
            gl.readPixels(x0, canvas.height - y0 - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            done(buf);
          });
          map.triggerRepaint();
        });
        let n = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= min) n++;
        return +((100 * n) / (w * h)).toFixed(1);
      };
      // Settle a frame or two with the layers as they'll be read.
      const markers = await share(MARKERS, 128);
      const arrows = await share([...MARKERS, 'train-arrows'], 128);
      const drawn = await share([...MARKERS, 'train-halos'], 26);
      const [blur, opacity] = [map.getPaintProperty('train-halos', 'circle-blur'), map.getPaintProperty('train-halos', 'circle-opacity')];
      for (const p of ['circle-blur-transition', 'circle-opacity-transition']) map.setPaintProperty('train-halos', p, { duration: 0, delay: 0 });
      map.setPaintProperty('train-halos', 'circle-blur', 0);
      map.setPaintProperty('train-halos', 'circle-opacity', 1);
      const discs = await share([...MARKERS, 'train-halos'], 128);
      map.setPaintProperty('train-halos', 'circle-blur', blur);
      map.setPaintProperty('train-halos', 'circle-opacity', opacity);
      // Touching: each Train in the box, its marker's box on screen (a dot's radius and ring, a pill's box from
      // the halo radius main.ts gives it, Math.hypot(...box) + 4, half as high as its name's line and edge), and
      // the Stations' dots MapLibre finds drawn over it.
      for (const id of ids) map.setLayoutProperty(id, 'visibility', 'visible');
      await new Promise((r) => setTimeout(r, 500));
      const zoom = map.getZoom();
      const at = (stops) => {
        for (let i = 1; i < stops.length; i++) if (zoom <= stops[i][0]) return stops[i - 1][1] + ((stops[i][1] - stops[i - 1][1]) * (zoom - stops[i - 1][0])) / (stops[i][0] - stops[i - 1][0]);
        return stops.at(-1)[1];
      };
      const features = map.getSource('trains').serialize().data.features;
      const inBox = features.map((f) => ({ f, p: map.project(f.geometry.coordinates) })).filter(({ p }) => p.x >= a.x && p.x <= b.x && p.y >= a.y && p.y <= b.y);
      const radius = map.queryRenderedFeatures({ layers: ['trains'] }).reduce((m, f) => {
        const r = Number(f.layer.paint?.['circle-radius']) + Number(f.layer.paint?.['circle-stroke-width'] ?? 0);
        return Number.isFinite(r) ? m.set(f.properties.id, r) : m;
      }, new Map());
      let touching = 0;
      const sizes = [];
      for (const { f, p } of inBox) {
        const pill = zoom >= f.properties.pillZoom;
        // Today's halo radius from the box: its haloRadius (unscaled by small/halo below 12 only in those variants).
        const halfH = 1.5 + (1.2 * 10) / 2;
        const scale = /small|halo|pick/.test(location.search) && zoom < 12 ? 0.6 : 1;
        const hyp = f.properties.haloRadius / scale - 4;
        const [hw, hh] = pill ? [Math.sqrt(Math.max(0, hyp * hyp - halfH * halfH)), halfH] : [radius.get(f.properties.id) ?? at([[7, 2.5], [14, 6]]), radius.get(f.properties.id) ?? at([[7, 2.5], [14, 6]])];
        sizes.push(pill ? `${hw.toFixed(1)}x${hh}` : hw.toFixed(2));
        const found = map.queryRenderedFeatures([[p.x - hw, p.y - hh], [p.x + hw, p.y + hh]], { layers: ['stations'] });
        if (found.length) touching++;
      }
      const stations = map.queryRenderedFeatures([[a.x, a.y], [b.x, b.y]], { layers: ['stations'] }).length;
      return { zoom: +zoom.toFixed(2), box: `${Math.round(b.x - a.x)}x${Math.round(b.y - a.y)} px`, trains: inBox.length, pills: inBox.filter(({ f }) => zoom >= f.properties.pillZoom).length, stations, markers, arrows, discs, drawn, touching, dot: sizes.find((s) => !s.includes('x')) };
    });
    rows.push({ colorScheme, label, ...row });
    console.log(colorScheme, label, JSON.stringify(row));
    await ctx.close();
  }
}
await browser.close();
console.log('\n| Basemap | Variant | Trains (pills) | Stations | Markers | + arrows | + halos as discs | + halos as drawn | Touch a Station |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.colorScheme} | ${r.label} | ${r.trains} (${r.pills}) | ${r.stations} | ${r.markers}% | ${r.arrows}% | ${r.discs}% | ${r.drawn}% | ${r.touching} |`);
