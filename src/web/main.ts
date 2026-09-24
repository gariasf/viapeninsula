import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { LIVE_URL, madridDate, type Bundle, type Manifest } from '../bundle.ts';

// MapLibre looks for its worker next to its own file, which bundling moves.
setWorkerUrl(workerUrl);

const FONT = ['Noto Sans Regular'];

const map = new MapLibreMap({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/positron',
  center: [2.17, 41.39], // Barcelona, with the rest of Catalonia a zoom away
  zoom: 11,
  attributionControl: {
    // OpenFreeMap's own credit says "Data from OpenStreetMap"; the ODbL asks for the contributors.
    customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
  },
});

const [bundle] = await Promise.all([loadBundle(), map.once('load')]);
const coords = new Map(bundle.shapes.map((s) => [s.id, s.coords]));

map.addSource('lines', {
  type: 'geojson',
  attribution: 'Rodalies: <a href="https://data.renfe.com/" target="_blank">Renfe</a>, CC BY 4.0',
  data: {
    type: 'FeatureCollection',
    features: bundle.lines.flatMap((line) =>
      line.shapes.flatMap((id): GeoJSON.Feature[] => {
        const coordinates = coords.get(id);
        if (!coordinates) return [];
        // Where Lines share track, Barcelona's commuter lines (R1–R8) are drawn over the regional ones.
        const properties = { name: line.name, colour: line.colour, above: /^R\d[NS]?$/.test(line.name) ? 1 : 0 };
        return [{ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }];
      }),
    ),
  },
});
map.addSource('stations', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: bundle.stations.map((s) => ({
      type: 'Feature',
      properties: { name: s.name },
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    })),
  },
});

// Track goes under the basemap's labels; Stations and names go on top of everything.
const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
map.addLayer(
  {
    id: 'lines',
    type: 'line',
    source: 'lines',
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'above'] },
    paint: { 'line-color': ['get', 'colour'], 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 14, 4] },
  },
  firstLabel,
);
map.addLayer({
  id: 'line-names',
  type: 'symbol',
  source: 'lines',
  layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12 },
  paint: { 'text-color': ['get', 'colour'], 'text-halo-color': '#fff', 'text-halo-width': 2 },
});
map.addLayer({
  id: 'stations',
  type: 'circle',
  source: 'stations',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 14, 5],
    'circle-color': '#fff',
    'circle-stroke-color': '#444',
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 14, 1.5],
  },
});
map.addLayer({
  id: 'station-names',
  type: 'symbol',
  source: 'stations',
  minzoom: 12,
  layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.7] },
  paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
});

async function loadBundle(): Promise<Bundle> {
  const manifest = await getJson<Manifest>(`${LIVE_URL}/manifest.json`);
  const today = madridDate(new Date());
  const day = manifest.days.find((d) => d.date === today) ?? manifest.days.at(-1);
  if (!day) throw new Error('The manifest names no service day');
  return getJson<Bundle>(`${LIVE_URL}/${day.bundle}`);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
