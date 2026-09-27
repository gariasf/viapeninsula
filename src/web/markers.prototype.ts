// PROTOTYPE for #90, throwaway: three ways to draw each Train with its Line's name and which way it
// runs, after railisland's markers (docs/research/railisland-trains-on-track.md). Switch with
// `?variant=A|B|C`, or the bar at the bottom of the map and ← →. Dev only; not for main.
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { MapLibreMap } from 'maplibre-gl';
import type { Line } from '../bundle.ts';

const VARIANTS = {
  A: 'Dots, then pills from zoom 12',
  B: 'Pills at every zoom, no names on the Lines',
  C: 'Dot and name, arrow on the rim',
} as const;
type Variant = keyof typeof VARIANTS;
const VARIANT: Variant = ((v) => (v && v in VARIANTS ? (v as Variant) : 'A'))(new URLSearchParams(location.search).get('variant'));

/** From which zoom pills replace dots (A), and arrows and names show (A, B, C). */
const FROM = 12;
/** A pill's height, the gap from its edge to its arrow, and the space each image keeps around its shape for its outline, in px. */
const [HIGH, GAP, EDGE] = [15, 3, 3];

/** One value for a Live Train, another for a Scheduled one. */
const byLive = (live: unknown, scheduled: unknown) => ['case', ['get', 'live'], live, scheduled] as ExpressionSpecification;

/** Rounded for commuter and suburban Lines, pointed at both ends for regional ones, a rounded square for Metro, TRAM, the rack and the funicular. */
type Kind = 'round' | 'pointed' | 'badge';
function kindOf({ network, name }: Line): Kind {
  if (network === 'metro' || network === 'tram' || name === 'MM' || name === 'FV') return 'badge';
  if ((network === 'rodalies' && /^R1\d$/.test(name)) || (network === 'fgc' && /^(R[56]0?|RL[12])$/.test(name))) return 'pointed';
  return 'round';
}

/**
 * Each shape, as MapLibre can colour and outline it: a signed distance field `w`×`h` px at 2 texture
 * px a px, from how far outside the shape each point is, in px from the middle (MapLibre draws where
 * the field reads 0.75, and takes a px as 1/8 of it). The pills stretch across their middle 2 px to
 * fit their text, which goes in `content`, as [left, right] px in from each side.
 */
const SHAPES: Record<Kind | 'arrow', { w: number; h: number; outside: (x: number, y: number) => number; content?: [number, number] }> = {
  round: { w: HIGH + 2 + 2 * EDGE, h: HIGH + 2 * EDGE, outside: (x, y) => Math.hypot(Math.max(Math.abs(x) - 1, 0), y) - HIGH / 2, content: [EDGE + 3, EDGE + 3] },
  pointed: { w: 2 + 10 + 2 * EDGE, h: HIGH + 2 * EDGE, outside: (x, y) => Math.max(Math.abs(y) - HIGH / 2, 0.832 * (Math.abs(x) - 6) + 0.555 * Math.abs(y)), content: [EDGE + 5, EDGE + 5] },
  badge: {
    w: HIGH + 2 * EDGE,
    h: HIGH + 2 * EDGE,
    outside: (x, y) => {
      const [qx, qy] = [Math.abs(x) - HIGH / 2 + 3, Math.abs(y) - HIGH / 2 + 3];
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 3;
    },
    content: [EDGE + 3, EDGE + 3],
  },
  // Pointing up, around its middle: its tip 4.5 px ahead, its base 2.25 px behind and 6 px across.
  arrow: { w: 16, h: 16, outside: (x, y) => Math.max(y - 2.25, (6.75 * Math.abs(x) - 3 * (y + 4.5)) / Math.hypot(3, 6.75)) },
};

function addShapes(map: MapLibreMap) {
  for (const [id, { w, h, outside, content }] of Object.entries(SHAPES)) {
    const [W, H] = [w * 2, h * 2];
    const data = new Uint8ClampedArray(W * H * 4);
    for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) data[(row * W + col) * 4 + 3] = 255 * (0.75 - outside((col + 0.5) / 2 - w / 2, (row + 0.5) / 2 - h / 2) / 8);
    const stretch = content && { stretchX: [[W / 2 - 2, W / 2 + 2]] as [number, number][], content: [content[0] * 2, EDGE * 2, W - content[1] * 2, H - EDGE * 2] as [number, number, number, number] };
    map.addImage(`prototype-${id}`, { width: W, height: H, data }, { sdf: true, pixelRatio: 2, ...stretch });
  }
}

/** How wide a Line's name is, bold at 10 px, measured once. */
const widths = new Map<string, number>();
const measure = document.createElement('canvas').getContext('2d');
function widthOf(name: string) {
  let w = widths.get(name);
  if (w === undefined && measure) {
    measure.font = 'bold 10px "Noto Sans", sans-serif';
    w = measure.measureText(name).width;
    widths.set(name, w);
  }
  return w ?? name.length * 6;
}

/** What each variant draws a Train with, besides what trains() gives: its Line's name, kind, the ink on its fill, and where its arrow goes. */
export function prototypeProperties(map: MapLibreMap, line: Line | undefined, heading: number) {
  if (!line) return {};
  const kind = kindOf(line);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(line.colour.slice(i, i + 2), 16));
  const ink = 0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0) > 150 ? '#111' : '#fff';
  // Where the heading leaves the pill on screen, which stays level as the map turns.
  const half = Math.max(HIGH / 2, widthOf(line.name) / 2 + 2 + (kind === 'pointed' ? 8 : kind === 'badge' ? 3 : 3));
  const a = ((heading - map.getBearing()) * Math.PI) / 180;
  const edge = Math.min(Math.abs(Math.sin(a)) > 1e-3 ? half / Math.abs(Math.sin(a)) : Infinity, Math.abs(Math.cos(a)) > 1e-3 ? HIGH / 2 / Math.abs(Math.cos(a)) : Infinity);
  return { name: line.name, kind, ink, reach: edge + GAP };
}

/** An arrow `reach` px ahead of its Train: GeoJSON arrays reach MapLibre as strings, so the offset is made from the number. */
const ALONG: ExpressionSpecification = ['interpolate', ['linear'], ['get', 'reach'], 0, ['literal', [0, 0]], 100, ['literal', [0, -100]]];

/** Draws the variant's markers over the Trains' dots, and the bar that switches variants. */
export function setUpPrototype(map: MapLibreMap, before: string) {
  addShapes(map);
  const common = { 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'text-allow-overlap': true, 'text-ignore-placement': true, 'symbol-sort-key': ['case', ['get', 'followed'], 1, 0] as ExpressionSpecification };
  const arrow = (minzoom: number, offset: unknown) =>
    map.addLayer(
      {
        id: 'train-arrows',
        type: 'symbol',
        source: 'trains',
        minzoom,
        layout: { ...common, 'icon-image': 'prototype-arrow', 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map', 'icon-offset': offset as ExpressionSpecification },
        paint: { 'icon-color': ['get', 'colour'], 'icon-halo-color': '#fff', 'icon-halo-width': 1 },
      },
      before,
    );
  const pills = (minzoom: number, scale: ExpressionSpecification | number) =>
    map.addLayer(
      {
        id: 'train-pills',
        type: 'symbol',
        source: 'trains',
        minzoom,
        layout: {
          ...common,
          'icon-image': ['concat', 'prototype-', ['get', 'kind']],
          'icon-text-fit': 'width',
          'icon-text-fit-padding': [0, 2, 0, 2],
          'icon-size': scale,
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': typeof scale === 'number' ? 10 * scale : ['interpolate', ['linear'], ['zoom'], 7, 7, FROM, 10],
        },
        // A Live Train's pill is filled with its Line's colour; a Scheduled one's is white, ringed with it.
        paint: {
          'icon-color': byLive(['get', 'colour'], '#fff'),
          'icon-halo-color': byLive('#fff', ['get', 'colour']),
          'icon-halo-width': byLive(1, 1.5),
          'text-color': byLive(['get', 'ink'], ['get', 'colour']),
        },
      },
      before,
    );
  if (VARIANT === 'A') {
    map.setLayerZoomRange('trains', 0, FROM);
    pills(FROM, 1);
    arrow(FROM, ALONG);
  } else if (VARIANT === 'B') {
    map.setLayoutProperty('trains', 'visibility', 'none');
    map.setLayoutProperty('line-names', 'visibility', 'none');
    pills(0, ['interpolate', ['linear'], ['zoom'], 7, 0.7, FROM, 1]);
    arrow(FROM, ALONG);
  } else {
    map.addLayer(
      {
        id: 'train-names',
        type: 'symbol',
        source: 'trains',
        minzoom: FROM,
        layout: { ...common, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-anchor': 'left', 'text-offset': [1.1, 0] },
        paint: { 'text-color': ['get', 'colour'], 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      },
      before,
    );
    // Just outside the dot, whose radius and ring grow from 5 to 7.5 px from zoom 12 to 14.
    arrow(FROM, ['interpolate', ['linear'], ['zoom'], FROM, ['literal', [0, -9]], 14, ['literal', [0, -11.5]]]);
  }
  switcher();
}

/** The bar at the bottom that cycles through the variants, with ← and → too, reloading the page on the new one. */
function switcher() {
  const keys = Object.keys(VARIANTS) as Variant[];
  const go = (step: number) => {
    const url = new URL(location.href);
    url.searchParams.set('variant', keys[(keys.indexOf(VARIANT) + step + keys.length) % keys.length] ?? 'A');
    location.assign(url);
  };
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:10;display:flex;gap:12px;align-items:center;padding:6px 14px;border-radius:999px;background:#111;color:#fff;font:600 13px system-ui;box-shadow:0 2px 8px #0006';
  const button = (text: string, step: number) => Object.assign(document.createElement('button'), { textContent: text, onclick: () => go(step), style: 'all:unset;cursor:pointer;padding:0 6px;font-size:16px' });
  bar.append(button('‹', -1), `${VARIANT} · ${VARIANTS[VARIANT]}`, button('›', 1));
  document.body.append(bar);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable], .maplibregl-map')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') go(e.key === 'ArrowLeft' ? -1 : 1);
  });
}
