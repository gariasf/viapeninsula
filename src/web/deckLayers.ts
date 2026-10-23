// A desktop's decks and tunnels' mouths as the page draws them (#213, ADR-0016), from the `decks` source the Lines'
// worker makes (decks.ts): a module of its own, which a phone never loads, and which imports nothing the page's own code
// does, so that the page's is one file still, as a phone fetches it. Its zooms come from main.ts.

import type { ExpressionSpecification, FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';

/** The zoom the tunnels' mouths are marked from. */
const MOUTHS_FROM = 13;

/**
 * The decks' paint: the decks in their Lines' colours (`lineColour`, as their strokes), the piers in `structure`, and
 * each part's base and top, in metres at the zoom decks are drawn from (`from`), halved for each zoom in, so that it
 * stands as high on the screen at every zoom: exactly so, as MapLibre interpolates a feature's value between two zooms
 * by the curve's.
 */
export function deckPaint(lineColour: ExpressionSpecification, structure: string, from: number) {
  const metres = (key: 'base' | 'top'): ExpressionSpecification => ['interpolate', ['exponential', 0.5], ['zoom'], from, ['get', key], from + 10, ['/', ['get', key], 2 ** 10]];
  return { 'fill-extrusion-color': ['match', ['get', 'kind'], 'pier', structure, lineColour] as ExpressionSpecification, 'fill-extrusion-base': metres('base'), 'fill-extrusion-height': metres('top') };
}

/** A tunnel's mouth's mark: an arch, standing up to the viewer, its bore dark. */
function mouthIcon(dark: boolean): ImageData {
  const [w, h] = [40, 32];
  const g = new OffscreenCanvas(w, h).getContext('2d')!;
  g.fillStyle = dark ? '#a3a9b2' : '#6b7079';
  g.beginPath();
  g.roundRect(2, 2, w - 4, h - 2, [w / 2 - 2, w / 2 - 2, 0, 0]);
  g.fill();
  g.fillStyle = dark ? '#16181c' : '#2b2e33';
  g.beginPath();
  g.roundRect(11, 11, w - 22, h - 11, [w / 2 - 11, w / 2 - 11, 0, 0]);
  g.fill();
  return g.getImageData(0, 0, w, h);
}

/**
 * The decks' source and layers, under the basemap's first label (`before`): a fill-extrusion layer for each of the
 * decks' `steps` along the Stretches, to the zoom the Lines are back on their rails at (`rails`), and one for the rails'
 * decks from there (deckPaint()); and the mouths' arches. Gives the decks' layers, which a tap and the pointer take as
 * the Lines' strokes.
 */
export function addDecks(map: MapLibreMap, { tiles, lineColour, structure, dark, before, steps, rails }: { tiles: string; lineColour: ExpressionSpecification; structure: string; dark: boolean; before?: string; steps: number[]; rails: number }): string[] {
  map.addSource('decks', { type: 'vector', tiles: [tiles], minzoom: MOUTHS_FROM, maxzoom: 18 });
  const paint = deckPaint(lineColour, structure, steps[0] ?? rails);
  const ids = [...steps.map((_, k) => `lines-decks-${k}`), 'rails-decks'];
  ids.forEach((id, k) => {
    const [minzoom, maxzoom] = [steps[k] ?? rails, steps[k + 1] ?? (k < steps.length ? rails : 24)];
    map.addLayer({ id, type: 'fill-extrusion', source: 'decks', 'source-layer': 'decks', minzoom, maxzoom, filter: ['==', ['get', 'step'], k] as FilterSpecification, paint }, before);
  });
  map.addImage('mouth', mouthIcon(dark), { pixelRatio: 2 });
  map.addLayer(
    {
      id: 'mouths',
      type: 'symbol',
      source: 'decks',
      'source-layer': 'decks',
      minzoom: MOUTHS_FROM,
      filter: ['==', ['get', 'kind'], 'mouth'],
      layout: { 'icon-image': 'mouth', 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport' },
    },
    before,
  );
  return ids;
}
