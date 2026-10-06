import './theme.prototype.css';
import type { FontFacesSpecification } from '@maplibre/maplibre-gl-style-spec';

/**
 * #211's variants, picked by `?theme=`, comma-separated, each trying one thing on today's map:
 * - `noto` or `inter`: one typeface for the map and the interface. Noto Sans is the one OpenFreeMap
 *   serves the map's glyphs in. No glyphs are served in Inter, so the map letters in it from its font
 *   files, which MapLibre draws itself (`font-faces`).
 * - `ink`: a palette for the interface, navy ink on white, as the places' names are lettered, so that
 *   the Lines and Trains carry all the colour.
 * - `dark`: where the system's setting is dark, OpenFreeMap's dark basemap, the map drawn for it, and
 *   ink's dark side. It brings `ink`.
 * In the query string, as the link's hash holds the map's own state (#208).
 * Throwaway: once the maintainer picks, a build ticket builds the pick, and this goes.
 */
const themeParts = new Set(new URLSearchParams(location.search).get('theme')?.split(','));
const darkScheme = matchMedia('(prefers-color-scheme: dark)');
/** Whether the map is drawn dark. The basemap is set once, so the page reloads as the system's setting changes. */
const dark = themeParts.has('dark') && darkScheme.matches;
if (themeParts.has('dark')) darkScheme.addEventListener('change', () => location.reload());
const typeface = themeParts.has('inter') ? 'Inter' : themeParts.has('noto') ? 'Noto Sans' : undefined;
const classes = { ink: themeParts.has('ink') || themeParts.has('dark'), dark, noto: typeface === 'Noto Sans', inter: typeface === 'Inter' };
for (const [name, on] of Object.entries(classes)) document.documentElement.classList.toggle(name, on);

/** The basemap: OpenFreeMap's positron, or its dark style. */
export const basemap = `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;
/**
 * The map's own colours on each basemap: its paper, the background; what each Line is cased in; the
 * places' names, the halo round them and the Lines' names, and the ring round the places' dots; and
 * what a Scheduled Train is filled with.
 * ponytail: each paper is copied from its style, which isn't versioned, so the casing would stop
 * matching if OpenFreeMap changed it. Take it from the style's background layer if that ever shows.
 */
const COLOURS = {
  light: { paper: '#f2f3f0', casing: '#f2f3f0', names: '#14305a', halo: '#fff', dotRing: '#444', scheduledFill: '#fff' },
  // Cased in a grey a little lighter than the paper, so that the Lines darkest in colour, as FGC's
  // black MM, still show; Scheduled Trains filled with the paper, so that Live ones, filled with their
  // Line's colour, stand out more.
  dark: { paper: '#0c0c0c', casing: '#3a3f48', names: '#e6ecf5', halo: '#0c0c0c', dotRing: '#0c0c0c', scheduledFill: '#0c0c0c' },
};
export const colours = COLOURS[dark ? 'dark' : 'light'];
/** The family names and pills are measured in, as the map letters them. */
export const measuredIn = typeface ? `"${typeface}"` : 'sans-serif';

/** fontsource's files cover Latin, which is every name in Catalonia; the map takes the rest from Noto Sans's glyphs. */
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'.split(',');
/** One of fontsource's Latin font files, as the map's `font-faces` take it. */
const latinFile = (face: string, weight: number, style = 'normal') => [{ url: `https://cdn.jsdelivr.net/npm/@fontsource/${face}@5/files/${face}-latin-${weight}-${style}.woff2`, 'unicode-range': LATIN }];
/**
 * The map's fonts by the names its layers and the basemap's give them, which keep their names: with
 * Inter, every label on the map, ours and the basemap's, is lettered in it.
 */
export const fontFaces: FontFacesSpecification | undefined = typeface === 'Inter' ? { 'Noto Sans Regular': latinFile('inter', 400), 'Noto Sans Bold': latinFile('inter', 700), 'Noto Sans Italic': latinFile('inter', 400, 'italic') } : undefined;
/** The typeface's files in the interface, before names and pills are measured in them. Where they fail to come, they're measured in what the browser falls back to. */
export const fontsReady = typeface ? Promise.all([`400 12px ${measuredIn}`, `700 12px ${measuredIn}`].map((font) => document.fonts.load(font))).catch(() => undefined) : Promise.resolve();

/** A colour's (#rrggbb) red, green and blue, 0–255. */
const channels = (colour: string) => [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));

/**
 * What a Line's colour letters its name, rings its Scheduled Trains and colours their arrows in: on
 * the dark basemap, mixed with white as far as it takes for 4.5:1 against the paper, as WCAG asks of
 * text, for the Lines darkest in colour.
 */
export function lettering(colour: string): string {
  if (!dark) return colour;
  const [rgb, paper] = [channels(colour), channels(colours.paper)];
  for (let white = 0; white < 1; white += 0.05) {
    const mixed = rgb.map((c) => Math.round(c + (255 - c) * white));
    if (contrast(mixed, paper) >= 4.5) return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }
  return '#ffffff';
}

/**
 * Two colours' contrast ratio, by WCAG's relative luminance.
 * ponytail: main.ts's luminance() again, which this can't import without a cycle. A build would share one.
 */
function contrast(a: number[], b: number[]): number {
  const lum = (rgb: number[]) => {
    const [r = 0, g = 0, bl = 0] = rgb.map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl + 0.05;
  };
  return Math.max(lum(a), lum(b)) / Math.min(lum(a), lum(b));
}
