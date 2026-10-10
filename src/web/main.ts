import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { BackgroundLayerSpecification, ExpressionFilterSpecification, ExpressionSpecification, FontFacesSpecification, LineLayerSpecification, ProjectionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { MapLibreMap, Popup, setWorkerUrl, type GeoJSONSource, type LngLat } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import nunitoSans from '@fontsource/nunito-sans/files/nunito-sans-latin-400-normal.woff2?url';
import nunitoSansBold from '@fontsource/nunito-sans/files/nunito-sans-latin-700-normal.woff2?url';
import nunitoSansItalic from '@fontsource/nunito-sans/files/nunito-sans-latin-400-italic.woff2?url';
import { along, APART, atZoom, BANDS, bandZooms, cutIn, GRAPH_BAND, STRETCH, smoothId, inBand, onStroke, pieces, zones, type Zone, daysNeeded, EARTH, LIVE_URL, madridDate, places, type Alerts, type Bundle, type Credit, type Place, type DayTrips, type Kind, type Line, type Manifest, type Network, type Point, type Shape, type Slot, type Snapshot, type Stroke, type Track, type Trip, type Words, WIDTH } from '../bundle.ts';
import { boardAt, comingAt, joinDays, KEEP, mapTime, nearbyAt, seenWithin, trainAt, trainsAt, unavailable, type Coming, type Departure, type Followed, type Received } from '../engine.ts';
import { alertCount, basemapLabel, busesReplace, earlierStations, language, LANGUAGES, liveUnavailable, locale, MACHINE_TRANSLATED, moreDepartures, moreStations, setLanguage, t, toGo, trainCounts, unlocated, type Language, type Unlocated } from './i18n.ts';
import { rounded } from './curve.ts';
import { linesAt, popupRoom } from './tap.ts';
import { alongside, namedTwice, nameOffset, nearestSide, rightOf, underName, type Side, type Spot } from './names.ts';
import { groupOf, spreading, toEdge, type Drawn, type Group } from './spread.ts';
import { atMostEvery, drifted, letsGo } from './centre.ts';
import { keepView, lastView, markOf, openingView, toggledPitch } from './view.ts';
import { bannerNetworks, type Banner, type NetworkTrack } from './banner.ts';
import { contrast, lettering } from './colour.ts';
import { cardAlerts, linesCallingAt, minutesTo, nearbyRows, progress, type CardAlert } from './cards.ts';
import { closureKey, closureStrokes, closuresAt, hiding, placeOn, type Shown } from './closures.ts';

// MapLibre looks for its worker next to its own file, which bundling moves.
setWorkerUrl(workerUrl);

/**
 * Whether the system's setting is dark, where the map is drawn on OpenFreeMap's dark basemap, as
 * style.css draws the interface. The basemap is set once, so the page reloads as the setting changes,
 * and its link and the view kept (#245) bring the map back as it was.
 */
const darkScheme = matchMedia('(prefers-color-scheme: dark)');
const darkBasemap = darkScheme.matches;
darkScheme.addEventListener('change', () => location.reload());

/** The map's lettering, by the basemap's own font names, which FONT_FACES letters in Nunito Sans. */
const FONT = ['Noto Sans Regular'];
/** The typeface the map letters in, as style.css names it, which names and pills are measured in once it has loaded (textWidth()). */
const TYPEFACE = '"Nunito Sans"';
/**
 * The characters fontsource's Latin files cover, which take in every name in Catalonia. The map takes
 * the rest from the basemap's glyphs, in Noto Sans.
 * ponytail: copied from fontsource's CSS for these files, so were a new version to cover fewer, the
 * browser would draw what they lack in a fallback font of its own, not Noto Sans. Read it from the
 * package's CSS if fontsource ever changes its Latin subset.
 */
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'.split(',');
/**
 * The map's fonts, by the names the basemap's layers and ours give them, in Nunito Sans: every label on
 * the map, the basemap's too. OpenFreeMap serves glyphs in Noto Sans only, so MapLibre draws these from
 * the font files the site serves (#211).
 */
const FONT_FACES: FontFacesSpecification = {
  'Noto Sans Regular': [{ url: nunitoSans, 'unicode-range': LATIN }],
  'Noto Sans Bold': [{ url: nunitoSansBold, 'unicode-range': LATIN }],
  'Noto Sans Italic': [{ url: nunitoSansItalic, 'unicode-range': LATIN }],
};
const NAME_SIZE = 12;
/** The size of a Line's name on its Trains' pills, in px, and on the followed Train's, which is larger. */
const [PILL_TEXT, FOLLOWED_TEXT] = [10, 12];
/** How far a pill reaches beyond its Line's name either side, and above and below the name's line, in px. */
const [PILL_PADDING, PILL_EDGE] = [2, 1.5];
/** How wide the edge drawn round a pill is, in px. */
const PILL_HALO = 1.5;
/** MapLibre's `text-line-height`, in ems: the height of a line of text, as of the Line's name a pill fits or of a place's name. */
const LINE_HEIGHT = 1.2;
/** How far outside its pill's outline the middle of a Train's arrow is, in px. */
const ARROW_GAP = 7;
/** The dark lettering for a Line's colour that white doesn't read on. */
const INK = '#111';
/**
 * A Live Train's halo (#91): how many times its dot's radius it reaches, how far beyond the corners of
 * its pill's box, in px, how softly it fades out, from blurred through to its middle (1), and how
 * strongly it's coloured.
 */
const [HALO_DOT, HALO_BEYOND, HALO_BLUR, HALO_OPACITY] = [2, 4, 0.6, 0.6];
/**
 * The outlines a Train is drawn with, `w`×`h` px around their middles: how far `outside` each a point
 * is, in px (x right, y down), or inside where negative. A pill's outline stretches across its middle
 * 2 px both ways to fit its Line's name over its middle `across` px, and all but PILL_EDGE of its
 * height. The arrow points up.
 */
const OUTLINES: Record<Pill['outline'] | 'arrow', { w: number; h: number; across?: number; outside: (x: number, y: number) => number }> = {
  // A square with corners so round it's nearly a circle.
  round: { w: 15, h: 15, across: 9, outside: roundedSquare(7.5, 6.5) },
  // Its ends 5 px long, to a point 2 px across.
  pointed: { w: 12, h: 15, across: 2, outside: (x, y) => Math.max(Math.abs(y) - 7.5, Math.abs(x) - 6, 0.7926 * (Math.abs(x) - 6) + 0.6097 * (Math.abs(y) - 1)) },
  // A square with corners rounded 3 px, which a name of two letters leaves nearly square, like the Metro's and TRAM's Line badges.
  badge: { w: 15, h: 15, across: 13, outside: roundedSquare(7.5, 3) },
  // Its tip 4.5 px ahead of its middle, and its base 2.25 px behind and 6 px across.
  arrow: { w: 12, h: 12, outside: (x, y) => Math.max(y - 2.25, (6.75 * Math.abs(x) - 3 * (y + 4.5)) / Math.hypot(3, 6.75)) },
};
/**
 * Each kind of service's pills: rounded for commuter and suburban Lines, pointed at both ends for
 * regional ones, and badges for metros and trams, as their operators badge their Lines, and for rack
 * railways and funiculars (#90). Long-distance Lines get theirs once they're on the map (#262): till
 * then they'd be round, as the Lines of a track that names no kinds are, and tsc asks every other kind
 * for its own.
 */
const OUTLINES_OF: Partial<Record<Kind, Pill['outline']>> = { commuter: 'round', regional: 'pointed', metro: 'badge', tram: 'badge', rack: 'badge', funicular: 'badge' } satisfies Record<Exclude<Kind, 'long-distance'>, Pill['outline']>;
/**
 * The cards' icons, drawn in the colour of the text around them, which a forced-colours theme sets
 * too (#116): a close cross, a chevron down and up, the die that follows a random Train, Nearby's
 * radius round a dot, the tilted plane of the tilt button, About's ⓘ, the credits' © and a warning.
 */
const ICONS = {
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  die: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="9" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="9" cy="15" r="1.3"/><circle cx="15" cy="15" r="1.3"/></svg>',
  tilt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 6h8l5 12H3L8 6z"/><path d="M5.5 12h13"/></svg>',
  nearby: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 3.1"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  centre: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  copyright: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M14.9 9.4a4 4 0 1 0 0 5.2"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>',
};
/** How many departures a board shows peeking on a phone, and Nearby rows (#321). */
const PEEK = 3;
/** How far a finger moves the top of a sheet, in px, before it drags it rather than taps. */
const SLOP = 6;
/** What measures names for textWidth(), and reads colours for hex(). */
const measuring = document.createElement('canvas').getContext('2d');
/** How many times the map looks for live data, never getting any, before it says live data is unavailable. */
const EMPTY_POLLS = 3;
/** How near the viewer, in metres, and how soon, in ms, a Train passes to be one of their nearby Trains. The panel's strings say so too. */
const [NEARBY, SOON] = [1500, 60 * 60_000];
/** How long after a service day's last Train is due off the map the map keeps its bundle, for Trains running late, in ms. */
const LATE = 60 * 60_000;
/**
 * How often Trains move, in ms. As often as the fastest of them moves a quarter of a pixel, which
 * nobody sees in between (quarterPixel()): about 12 times a second at zoom 12, and every frame zoomed
 * right in. Every frame while the map zooms or turns, which moves them beside their Lines and turns
 * their arrows, or follows a Train. Once the map has stood for MOVED, while the viewer is likely still
 * looking closely, no more often than every IDLE_EVERY, about 30 times a second, which leaves a phone
 * headroom and battery and is a little under 1/30 s, so that at 60 or 120 Hz it's every other or every
 * fourth frame. And never less often than every IDLE_MOST, so that the legend's count and the panels
 * keep up by the second.
 */
const [MOVED, IDLE_EVERY, IDLE_MOST] = [1500, 30, 250];

/**
 * How far from a Line's stroke a tap still names its Lines, in px: a target 44 px across. Strokes
 * within STROKE_NEAREST of it, if any, are taken first, so that one beside another is the one named.
 */
const [STROKE_NEAREST, STROKE_TAP] = [5, 22];
/** A place's dot's radius, in px at each zoom, for a place in neither tier. */
const DOT: [zoom: number, px: number][] = [[7, 1.5], [14, 5]];
/** The width of the ring round a place's dot, in px at each zoom. */
const RING: [zoom: number, px: number][] = [[7, 0.5], [14, 1.5]];
/** A Train's dot's radius, in px at each zoom, and the followed Train's, which is larger. */
const TRAIN_DOT: [zoom: number, px: number, followed: number][] = [[7, 2.5, 5], [14, 6, 10]];
/** How long a line of a place's name can be, in ems, as MapLibre wraps names. */
const PLACE_WRAP = 10;
/** How a place's name is lettered: bold (BOLD) or regular, and how large, in px, by its tier (TIERS). */
interface NameStyle {
  bold: boolean;
  size: number;
}
/** How wide the halo round places' names is, in px (#144). */
const NAME_HALO = 2.5;
/** How far a place's name stays clear of its dot and of the Trains drawn along its track, in px: its halo and half a px. */
const NAME_GAP = NAME_HALO + 0.5;

/** The colour of a track Lines share, zoomed right in, where their strokes lie one over another: their names along it and their Trains tell them apart (#139). */
const SHARED = '#9a9b9e';
/**
 * The layers a Closure is drawn in over its Line's stroke, as the maintainer picked them (#341): closed,
 * its Line's stroke hatched across, in stripes of the colour its Lines are cased in on the basemap; down
 * to a single track, its Line's colour narrowed to half its width, its casing either side. Each for one
 * kind of Closure, in its Line's colour or its casing's, as wide as the Line's stroke times `width`, and
 * `more` px. Dashes are taken: they're a tunnel's covered part (#178).
 */
const CLOSURE_COATS: { kind: Shown['kind']; colour: 'line' | 'casing'; width: number; more?: number; hatched?: true }[] = [
  { kind: 'closed', colour: 'casing', width: 1, hatched: true },
  { kind: 'single', colour: 'casing', width: 1, more: 1 },
  { kind: 'single', colour: 'line', width: 0.5 },
];
/**
 * Zooming in, the Lines don't jump from their stretches to their rails at once: they cross-fade over
 * FADE zooms either side of the zoom they go back on the rails at (#205). The rest still switches at
 * that zoom: the Lines' names, the Trains, and the Lines a tap names.
 */
const FADE = 0.5;
// Below the first band's zoom, Lines side by side can't be read: each Network's track is drawn once
// instead, in its colour, and no Trains (#190).
const linesZoom = BANDS[0] ?? 7;
/**
 * Zoomed out, where it draws each Network's track once and no Lines, the map is a globe, and it
 * flattens into Web Mercator over the zoom before FLAT, a zoom short of the Lines: from FLAT in, it's
 * flat as it always was. While the map is even part globe, MapLibre pans it as one, nudging the zoom as
 * the centre moves north or south to keep the planet one size, and the Lines, their Trains and the
 * places' names are laid out for a flat map, band by band (ADR-0007): flat a zoom before them, no pan
 * takes the map into the Lines, nor across a band. MapLibre's own `globe` flattens only from zoom 10 to
 * 12: it would pan the bands as a globe, now and then across one, and draw a globe where its curve
 * can't be seen (ADR-0013).
 */
const FLAT = linesZoom - 1;
const PROJECTION: ProjectionSpecification = { type: ['interpolate', ['linear'], ['zoom'], FLAT - 1, 'vertical-perspective', FLAT, 'mercator'] };

/**
 * The places drawn larger than the rest and named from further out, by their IDs in places(), as the
 * maintainer picks them: each tier's dots are `larger` px larger in radius than a place's in neither,
 * and its names show from zoom `nameZoom`, before a lower tier's where they collide, `size` px large,
 * a little larger by tier, as railisland's (TIER_STYLE). A place in
 * neither, as every Metro and TRAM place is and one that opens later will be, is drawn as UNTIERED
 * says.
 * ponytail: by ID, so a listed place whose operator renumbers it drops to UNTIERED unnoticed. Have
 * show() warn of a listed ID it doesn't find among the places if that ever happens.
 */
const TIERS: { nameZoom: number; larger: number; size: number; places: string[] }[] = [
  {
    nameZoom: 9,
    larger: 2,
    size: 12,
    places: [
      // Barcelona's main Stations, where the most Lines call or end.
      'adif:71801', // Barcelona-Sants
      'adif:71802', // Barcelona-Passeig de Gràcia
      'fgc:PC', // Barcelona - Plaça Catalunya
      'fgc:PE', // Barcelona - Plaça Espanya
      'adif:79400', // Barcelona Estació de França
      // Where Lines meet and part beyond it.
      'adif:71600', // Sant Vicenç de Calders
      'adif:72209', // Martorell Central
      'adif:79100', // Granollers Centre
      // Each city's main Station.
      'adif:71500', // Tarragona
      'adif:71400', // Reus
      'adif:78400', // Lleida-Pirineus
      'adif:79300', // Girona
      'adif:79309', // Figueres
      'adif:78600', // Manresa
      'adif:77109', // Vic
      'adif:65400', // Tortosa
    ],
  },
  {
    nameZoom: 11,
    larger: 1,
    size: 11.5,
    places: [
      // Barcelona's other main Stations, and where its Lines part and end.
      'adif:78805', // Barcelona Plaça de Catalunya
      'adif:79009', // Barcelona El Clot
      'adif:72305', // L'Hospitalet de Llobregat
      'adif:71707', // El Prat de Llobregat
      'adif:72400', // El Prat Aeroport
      'fgc:GR', // Gràcia
      'fgc:SR', // Sarrià
      // Where FGC's Lines part and end.
      'fgc:SC', // Sant Cugat Centre
      'fgc:NA', // Terrassa Nacions Unides
      'fgc:PN', // Sabadell Parc del Nord
      'fgc:ME', // Martorell Enllaç
      'fgc:OL', // Olesa de Montserrat
      'fgc:MO', // Monistrol de Montserrat
      'fgc:MB', // Manresa-Baixador
      'fgc:IG', // Igualada
      'fgc:BG', // Balaguer
      'fgc:PS', // La Pobla de Segur
      // Where Rodalies' Lines meet, part and end.
      'adif:78800', // Montcada-Bifurcació
      'adif:72503', // Cerdanyola Universitat
      'adif:79006', // Mollet-Sant Fost
      'adif:72210', // Castellbisbal
      'adif:79200', // Maçanet-Massanes
      'adif:79104', // Sant Celoni
      'adif:79606', // Blanes
      'adif:79315', // Portbou
      'adif:77200', // Ripoll
      'adif:77309', // Puigcerdà
      'adif:71705', // Castelldefels
      'adif:71700', // Vilanova i la Geltrú
      'adif:71401', // Vila-seca
      'adif:73100', // La Plana-Picamoixons
      'adif:65411', // Salou-Port Aventura
      'adif:65402', // L'Aldea-Amposta-Tortosa
      'adif:78500', // Cervera
      // Each other town's main Station.
      'adif:79404', // Badalona
      'adif:79500', // Mataró
      'adif:78700', // Terrassa Estació del Nord
      'adif:78704', // Sabadell Centre
      'fgc:BO', // Sant Boi
      'adif:71701', // Sitges
      'adif:72204', // Vilafranca del Penedès
      'adif:65422', // Cambrils
      'adif:76004', // Valls
      'adif:78408', // Tàrrega
      'adif:71300', // Móra la Nova
    ],
  },
];
/** How a place in neither tier is drawn: named from zoom 12, and in the smallest size. */
const UNTIERED = { nameZoom: 12, larger: 0, size: 11 };
/**
 * The places whose names are in bold, as the maintainer picks them, by their IDs in places():
 * the biggest, Barcelona's main Stations and the largest cities', which the rest are Regular beside.
 * ponytail: by ID, as TIERS are.
 */
const BOLD = new Set([
  'adif:71801', // Barcelona-Sants
  'adif:71802', // Barcelona-Passeig de Gràcia
  'fgc:PC', // Barcelona - Plaça Catalunya
  'adif:78805', // Barcelona Plaça de Catalunya
  'fgc:PE', // Barcelona - Plaça Espanya
  'adif:79400', // Barcelona Estació de França
  'adif:71500', // Tarragona
  'adif:78400', // Lleida-Pirineus
  'adif:79300', // Girona
]);
/**
 * The whole zooms a place's name is laid out at, as MapLibre offsets names by whole zoom levels: from
 * the first a tier's names show at to NAME_ZOOM_MAX. Its offset is in px, so laid out at one zoom only,
 * a name moved half as far from its dot at the next, onto a track that crosses its own (#154).
 * ponytail: past NAME_ZOOM_MAX, where a px is under half a metre, a name keeps its layout there. Lay
 * names out further in if one lies across a track zoomed in that far.
 */
const NAME_ZOOM_MAX = 18;
const NAME_ZOOMS: number[] = [];
for (let zoom = Math.min(...TIERS.map((tier) => tier.nameZoom)); zoom <= NAME_ZOOM_MAX; zoom++) NAME_ZOOMS.push(zoom);

/** How many metres wide a pixel is at a zoom, at the equator: MapLibre's tiles are 512 px. */
const pixelMetres = (zoom: number) => (2 * Math.PI * EARTH) / (512 * 2 ** zoom);

/** An expression that takes `value` at each of these zooms, and goes smoothly from one to the next. */
const byZoom = (stops: [zoom: number, px: number][], value: (px: number, zoom: number) => number | ExpressionSpecification): ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...stops.flatMap(([zoom, px]) => [zoom, value(px, zoom)]),
];

/** Whether a Train is drawn as a dot, zoomed out from its Line's pill zoom (pillOf()), or as a pill. */
const [AS_DOT, AS_PILL]: [ExpressionSpecification, ExpressionSpecification] = [['<', ['zoom'], ['get', 'pillZoom']], ['>=', ['zoom'], ['get', 'pillZoom']]];

/** An expression that takes one value for a Live Train and another for a Scheduled one. */
const byLive = (live: string | number | ExpressionSpecification, scheduled: string | number | ExpressionSpecification): ExpressionSpecification => [
  'case',
  ['get', 'live'],
  live,
  scheduled,
];

/** Each licence a source's data can be under, with the link to its text that it asks for. */
const LICENCES: Record<NonNullable<Credit['licence']>, string> = {
  'CC BY 4.0': '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank">CC BY 4.0</a>',
};

/**
 * The page's link as it was opened, or last pasted into the tab, even while the map loads, which
 * openLink() opens: MapLibre puts the view in the link as soon as the map opens, so whether the link
 * named one is read from this (#292).
 */
let openedLink = location.hash;
addEventListener('hashchange', () => (openedLink = location.hash));
/** The point the page's link has the map ring (markOf()), until the next tap (#254). */
let marked: Point | undefined;
const map = new MapLibreMap({
  container: 'map',
  ...openingView(openedLink, lastView()),
  attributionControl: false,
  // The view goes in the page's link, as `#map=<zoom>/<lat>/<lon>`, beside what writeLink() adds.
  hash: 'map',
  // Until its style comes, the map is flat, and a flat map zoomed far out holds the world over the
  // screen: nearer the equator, and where the world is shorter than the screen, at the zoom that fills
  // it. Until the style makes it a globe, it holds the view nowhere, so that it opens where it was left
  // or linked (ADR-0013).
  transformConstrain: (center, zoom) => ({ center, zoom }),
});
/** Keeps the map's view on the device, for the map to open on next time. */
const keepShownView = () => keepView({ center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
// As the map opens, so that a link's view is kept too, and after each move, at most once a second, as
// the map pans with a Train it follows (#325).
keepShownView();
map.on('moveend', atMostEvery(1000, keepShownView));
// And as the page hides, so that a move within the last second isn't lost when a phone's tab is closed.
document.addEventListener('visibilitychange', () => document.hidden && keepShownView());
/** The basemap's place labels, by their layers' IDs, with the filters it gives them, which show() adds to. */
const placeLabels = new Map<string, ExpressionFilterSpecification | undefined>();
// OpenFreeMap's positron, or its dark basemap where the system's setting is dark.
map.setStyle(`https://tiles.openfreemap.org/styles/${darkBasemap ? 'dark' : 'positron'}`, {
  transformStyle: (_, style) => {
    style['font-faces'] = FONT_FACES;
    // A globe zoomed out (PROJECTION), with MapLibre's atmosphere round it, which fades as the globe
    // flattens. No sky besides, as MapLibre draws a style with none.
    style.projection = PROJECTION;
    style.sky = { 'sky-color': 'transparent', 'horizon-color': 'transparent', 'fog-color': 'transparent', 'atmosphere-blend': 1 };
    // The dark basemap's woods are patterned with an image OpenFreeMap's sprite lacks, so they draw
    // nothing and only log a warning: they go. It names water under its buildings and roads under its
    // borders: its labels go over everything else, as positron's are, so that the Lines go under them all.
    const layers = style.layers.filter((l) => !(l.type === 'fill' && l.paint?.['fill-pattern'] === 'wood-pattern'));
    style.layers = [...layers.filter((l) => l.type !== 'symbol'), ...layers.filter((l) => l.type === 'symbol')];
    // OpenFreeMap's credit ends "Data from OpenStreetMap", in English, and the ODbL asks for the
    // contributors, so showLanguage() credits the basemap itself, in the viewer's language.
    if (style.sources.openmaptiles) Object.assign(style.sources.openmaptiles, { attribution: '' });
    // Its labels give each feature's English name, where the tiles have one. They give basemapLabel()'s
    // instead, by the language showLanguage() sets.
    style.state = { language: { default: language() } };
    for (const layer of style.layers) {
      if (layer.type !== 'symbol' || !layer.layout) continue;
      // ponytail: takes the place labels' filters to be expressions, as all 9 of positron's are, which
      // show() can add to. MapLibre would refuse a legacy one's with ours, and that label would stay
      // beside its place's name. Convert it with the style spec's convertFilter() if one comes.
      if (layer['source-layer'] === 'place') placeLabels.set(layer.id, layer.filter as ExpressionFilterSpecification | undefined);
      const text = JSON.stringify(layer.layout['text-field']);
      if (!text?.includes('"name_en"')) continue;
      const own = JSON.parse(text.replaceAll('"name_en"', '"name"'));
      layer.layout['text-field'] = basemapLabel(own);
    }
    return style;
  },
});
const styleLoaded = map.once('style.load');
/**
 * Round the globe the map is transparent, and the page shows through, as space (style.css), which both
 * basemaps stand out on: only zoomed out, so that the page doesn't flash it while a flat map loads.
 */
const showSpace = () => map.getContainer().classList.toggle('globe', map.getZoom() < FLAT);
showSpace();
map.on('zoom', showSpace);
// Once the style has made the map a globe zoomed out, it holds the view as MapLibre does.
styleLoaded.then(() => map.setTransformConstrain(null));

// The language switch: a chip with the language's code, and over it, transparent, the platform's own
// list of the languages, each named in itself (#321).
const languageSwitch = document.createElement('select');
for (const [code, name] of Object.entries(LANGUAGES)) {
  const option = new Option(name, code, false, code === language());
  option.lang = code;
  languageSwitch.add(option);
}
languageSwitch.addEventListener('change', () => {
  setLanguage(languageSwitch.value as Language);
  showLanguage();
});
const languageCode = el('span', { className: 'code' });
const languageChip = el('div', { className: 'maplibregl-ctrl card lang' }, languageCode, icon('chevron'), languageSwitch);
map.addControl({ onAdd: () => languageChip, onRemove: () => languageChip.remove() }, 'top-right');
// The legend, top left, where nothing covers it: a pill, which showLegend() fills, of how many Trains on
// the map are Live and how many Scheduled, beside the markers they're drawn with. It's the button that
// opens About, which says what they mean.
const legend = el('button', {
  type: 'button',
  className: 'maplibregl-ctrl card legend',
  onclick: () => {
    showAbout();
    about.showModal();
  },
});
map.addControl({ onAdd: () => legend, onRemove: () => legend.remove() }, 'top-left');
/** How many Trains on the map are Live and how many Scheduled, which showCount() works out once their Trips have come. */
let counts: [live: number, scheduled: number] | undefined;
// The banner under it, which showBanner() fills: a pill for each Network whose live data is unavailable
// while its Trains are in view, or with no Trips today while its track is (bannerNetworks()).
const banner = el('div', { className: 'maplibregl-ctrl banner' });
banner.setAttribute('role', 'status');
map.addControl({ onAdd: () => banner, onRemove: () => banner.remove() }, 'top-left');
// The panel, which showPanel() fills while the map follows a Train, or shows a Station's board or the
// viewer's nearby Trains: on a phone a sheet docked to the bottom, which peeks or is pulled up, and on
// a wide window a card at the bottom left (#321).
const panel = el('section', { className: 'sheet', hidden: true });
// The buttons that ride on its top edge on a phone, where a thumb reaches them and the sheet never
// covers them, labelled by showLanguage(): the credits bottom left, and bottom right the one that shows
// the viewer's nearby Trains, with the one that follows a random Train over it, both once the map can
// move Trains. The random follow is disabled while there's no Train on the map but the one the map
// follows. On a wide window they go bottom right, over the credits' strip.
const nearbyLabel = el('span');
const nearbyButton = el('button', { type: 'button', className: 'card fab nearby', onclick: showNearby }, icon('nearby'), nearbyLabel);
const followRandomButton = el('button', { type: 'button', className: 'card fab', disabled: true, onclick: followRandom }, icon('die'));
// The Centre button over them, shown while the map has let go of the Train it follows (#325).
const centreButton = el('button', { type: 'button', className: 'card fab', hidden: true, onclick: centre }, icon('centre'));
// The tilt button over it: it eases the map's pitch between flat and tilted, pressed while it's tilted (#326).
const tiltButton = el('button', { type: 'button', className: 'card fab', onclick: () => map.easeTo({ pitch: toggledPitch(map.getPitch()) }) }, icon('tilt'));
const showTilt = () => tiltButton.setAttribute('aria-pressed', String(map.getPitch() > 0));
map.on('pitch', showTilt);
showTilt();
const trainButtons = el('div', { className: 'fabs', hidden: true }, tiltButton, centreButton, followRandomButton, nearbyButton);
// The credits, which showCredits() fills: behind the © button on a phone, and a strip on a wide window.
const creditsButton = el('summary', { className: 'card' }, icon('copyright'));
const creditsText = el('div', { className: 'card credits-text' });
const creditsStrip = el('div', { className: 'card credits-strip' });
const riders = el('div', { className: 'riders' }, el('details', { className: 'credits' }, creditsButton, creditsText), trainButtons, creditsStrip);
document.body.append(el('div', { className: 'dock' }, riders, panel));
// The About dialog, opened from the legend, which showAbout() fills: on a phone, a sheet of its own,
// nearly the full height. Tapping outside it closes it too, in browsers that can.
const about = el('dialog', { className: 'about' });
about.setAttribute('closedby', 'any');
document.body.append(about);
/** The About dialog's credits, which showCredits() fills. */
const aboutCredits = el('ul');
/** Whether the window is wide, where the panel is a card at the bottom left and About a dialog: as style.css has it. */
const wide = matchMedia('(min-width: 640px)');
/** Whether the viewer prefers less motion, where a sheet changes state without moving. */
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
/** The Train the viewer's hand took the map off, as followKey() names it, which the map pans with no more (#325). */
let released: string | undefined;
/** Whether the wheel and a pinch zoom about the middle now, as the map pans with the Train (showCentring()). */
let centring = false;
/** Whether the sheet is pulled up on a phone, rather than peeking. Each opening starts afresh (openPanel()). */
let pulledUp = false;
/** Whether a finger is dragging the sheet, which shows all it has meanwhile. */
let dragging = false;
/** Whether the followed Train's strip shows the Stations it has left, which its fold hides. Each opening starts afresh (openPanel()). */
let showPast = false;
/** Whether the panel shows its Alerts, which their fold hides (#342). Each opening starts afresh (openPanel()). */
let showAlerts = false;
// A finger drags the sheet by its top, and lets it go peeking or pulled up, whichever it's nearer.
grab(
  panel,
  () => {
    if (wide.matches) return undefined;
    const at = panel.offsetHeight;
    const heights: [number, number] = [measurePanel(false), measurePanel(true)];
    dragging = true;
    panel.style.height = `${at}px`;
    showPanel();
    return heights;
  },
  (up, at) => {
    dragging = false;
    setPulledUp(up, at);
  },
);
// And About down, to close it.
grab(about, () => (wide.matches ? undefined : [0, about.offsetHeight]), (up, at) => (up ? slide(about, at) : about.close()));
about.addEventListener('close', () => {
  about.classList.remove('sliding');
  about.style.height = '';
});
// The panel's layout changes as the window crosses from a phone's to a wide one's.
wide.addEventListener('change', () => {
  panel.classList.remove('sliding');
  panel.style.height = '';
  showPanel();
  map.easeTo({ padding: panelPadding() });
});
/**
 * The Train the map follows, by its service day and its Trip as its operator names it, so that it
 * stays followed as the days joined change around midnight, and where it's drawn.
 */
let following: { day: string; trip: string; at?: Point } | undefined;
/** Whether the panel shows a Trip still to come, as its Train isn't on the map yet (#322): so that the map doesn't stop following it. */
let waiting = false;
/**
 * Where Back goes (#322): the panel this one was opened from, by a departure or a Station, as it was,
 * peeking or pulled up and scrolled to `scroll`. One level: the panel it returns to has none of its own.
 */
let back: { to: 'train'; day: string; trip: string; headsign: string; up: boolean; scroll: number } | { to: 'board'; place: string; up: boolean; scroll: number } | { to: 'nearby'; near: Point; up: boolean; scroll: number } | undefined;
/** The place whose board the panel shows, by its ID in places(), while the map follows no Train. */
let boardPlace: string | undefined;
/** The last date, by the map's time (mapTime()), that a Station board had no departures left, when the map needs the next day's Trips for it. */
let emptyBoard: string | undefined;
/**
 * Where the viewer is, while the panel shows their nearby Trains instead, or that the browser is
 * still finding out, or why it couldn't (unlocated()). It's never sent anywhere, nor put in the page's link.
 */
let nearMe: Point | Unlocated | undefined;
/** How many times Nearby has asked the browser where the viewer is, so that only the last ask's answer shows (locate()). */
let asks = 0;
/** When the panel was last filled, by performance.now(). */
let panelShown = 0;
/** When the legend's count was last filled, by performance.now(). */
let countShown = -Infinity;
/** When the Networks the banner names were last worked out, by performance.now(). */
let bannerChecked = -Infinity;
/** The Networks on the map, whose data the credits name, and whose names the banner shows. */
let credited: Network[] = [];
/** The Networks with no Trips today, by their ids, as the manifest names them (#226). */
let noTripsIds: string[] = [];
/** The Networks the banner names, by their ids (bannerNetworks()). */
let bannerIds: Banner = { unavailable: [], noTrips: [] };
// Live data: the fetcher's snapshot, about every 20 s while the tab is visible (ADR-0003). The
// engine replays what the map had each time it looked, over the last KEEP, which also corrects the device's clock.
let received: Received[] = [];
/** How many times the map has looked for live data before its first snapshot. A hidden tab doesn't look. */
let emptyPolls = 0;
/** The operators' Alerts, as the map last got alerts.json: about once a minute while the tab is visible, as long as the file is cached for (ADR-0012). */
let alerts: Alerts = {};
/**
 * Draws the Closures shown now on their Lines (showClosures()), once the map has their layers, as
 * alerts.json comes and each minute goes by (#341). Until then, nothing: getAlerts() first runs before
 * what showClosures() reads is declared, and calling it then would throw.
 */
let drawClosures = () => {};
/**
 * Lifts the Closures each snapshot has a Live Train of their Line within, as it comes (hideClosures(),
 * #345). Until then, nothing, as for drawClosures: poll() first runs before what hideClosures() reads
 * is declared.
 */
let liftClosures = () => {};
/** The Lines of the days on the map, by their IDs, which the cards name as pills from the start (pill()). */
let lines = new Map<string, Line>();
/** How each Line's Trains are drawn as pills, by the Line's ID. */
let pills = new Map<string, Pill>();
/** The cards' colour, style.css's --card, which a Scheduled Train's pill letters its Line's colour against (pill()). */
const cardColour = hex(getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff');
/** The Lines that call at the last place whose board the panel showed, for the days on the map then (servedBy()). */
let served: { place?: string; days?: Bundle; lines: string[] } = { lines: [] };
showLanguage();

/** The manifest as the map last got it. */
let manifest: Manifest | undefined;
/** Each file of the service days' bundles the map has fetched, or is fetching: their track and Trips. */
const fetched = new Map<string, Promise<unknown>>();
/** The files of the days' bundles on the map, and whether the map is looking for the days it needs. */
let [shown, looking] = ['', false];
/** The Stations of the track on the map, which come with its Lines. */
let shownStations: Track['stations'] | undefined;

let nextPoll: ReturnType<typeof setTimeout> | undefined;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return clearTimeout(nextPoll);
  poll();
  refreshDays();
  getAlerts();
});
if (!document.hidden) poll();
getAlerts();
setInterval(getAlerts, 60_000);

// Names and pills are measured in the typeface, so it loads first. Where it fails to, they're measured in what the browser falls back to.
const typefaceLoaded = Promise.all(['400', '700'].map((weight) => document.fonts.load(`${weight} 12px ${TYPEFACE}`))).catch(() => undefined);
const [needed] = await Promise.all([neededDays().then((n) => n ?? Promise.reject(new Error('No service day to show'))), map.once('load'), typefaceLoaded]);
/**
 * The basemap's paper, its background's colour: what the Lines are cased in on positron, and on the
 * dark basemap what their colours are lettered against (lettering()).
 * ponytail: a background that changes with the zoom, as neither basemap's does, is taken as white.
 * Read it at the zoom if one ever does.
 */
const background = map.getStyle().layers.find((l): l is BackgroundLayerSpecification => l.type === 'background')?.paint?.['background-color'];
const paper = hex(typeof background === 'string' ? background : '#fff');
/**
 * The map's own colours on each basemap: what each Line is cased in; places' names, in a dark blue of
 * their own or a light one, which with each tier's lettering sets them apart from the basemap's labels,
 * the Lines' names and the pills' lettering (#144); the halo round names and arrows; what a Scheduled
 * Train is filled with; and the ring round a place's dot. On the dark one, the Lines are cased in a grey
 * a little lighter than its paper, so that the Lines darkest in colour, as FGC's black MM, still show,
 * and the rest is its paper, so that Live Trains, filled with their Line's colour, stand out more.
 */
const { casing, nameColour, halo, scheduledFill, dotRing } = darkBasemap
  ? { casing: '#3a3f48', nameColour: '#e6ecf5', halo: paper, scheduledFill: paper, dotRing: paper }
  : { casing: paper, nameColour: '#14305a', halo: '#fff', scheduledFill: '#fff', dotRing: '#444' };
/** The days on the map, whose Trains move, once their Trips have come. */
let bundle: Bundle | undefined;
let stationNames = new Map<string, string>();
/** Where the map shows the Stations, by their IDs in places(). */
let shownPlaces = new Map<string, Place>();
/** Each Station's place in shownPlaces, for the buttons that open its board (#322). */
let placeOfStation = new Map<string, Place>();
/**
 * What places each Line's Trains on its stroke zoomed out: the shapes, its slots by `<line> <shape>`,
 * its curves (zones()), and which side its Trains keep to, 1 right and -1 left; and where each Closure
 * shown on the track goes, along its stretches and on its rails, by closureKey(), once worked out (#341).
 */
let placing = { shapes: new Map<string, Shape>(), slots: new Map<string, Slot[]>(), curves: new Map<string, Zone[]>(), keep: new Map<string, number>(), closures: new Map<string, [GeoJSON.Feature[], GeoJSON.Feature[]]>() };
/** The Closures the map shows now (closuresAt()), which a tap on one names. */
let shownClosures: Shown[] = [];
/** Those of them that hide Trains (hiding(), #345): within whose closed ones Scheduled Trains aren't drawn, and boards show them not stopping. */
let hidingClosures: Shown[] = [];
/**
 * The Closures live data has lifted (hiding(), #345), for the page's life.
 * ponytail: the page's memory, so a page opened while a stale Alert's Closure has its Line's Trains
 * running hides them until one is seen within it again. The fetcher keeping where each Line's Trains
 * were last seen, and publishing it beside alerts.json, would lift it from the first. It keeps every
 * Alert it has lifted, so one changed and then changed back is lifted again without a Train seen since.
 */
const lifted = new Set<string>();
/** The Lines' strokes along their Stretches, which a tap on one names (linesAt()). */
let shownStrokes: Stroke[] = [];
/** Each Network's track, drawn once zoomed out (#190), which the banner goes by for a Network with no Trips today (bannerNetworks()). */
let shownTracks: NetworkTrack[] = [];
/** What moves a tapped group of Trains standing together at a Station apart (#129). */
const spread = spreading();
/**
 * The group of Trains a tap spread, until a tap elsewhere, a zoom out from their pills, or once fewer
 * than two of them stand at their Station; the Trains it moves aside, eased or easing, and by how
 * far, in px; and whether they're still easing.
 */
let spreadState: { group?: Group; moved: Map<string, number>; easing: boolean } = { moved: new Map(), easing: false };
/** The Trains last drawn as pills standing at a Station, where they're drawn before any moves aside, which a tap on one spreads (groupOf()). */
let standingPills: { id: string; at: Point; heading: number; box: [number, number]; standsAt: string }[] = [];
/**
 * Each place's name: its dot, the sides of its track it can go, once the map's bearing is known, broken
 * into its lines, how wide and high those are, in px, the zoom it shows from, how much larger its dot is, and how it's lettered.
 */
let names: { dot: Point; sides: (bearing: number) => Side[]; name: string; size: [width: number, height: number]; nameZoom: number; larger: number; style: NameStyle }[] = [];
/** The map's bearing when the names were last put beside their tracks. */
let namesBearing = NaN;
map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
// Simplified less than MapLibre's default 0.375 px, which would facet their curves again (#203).
map.addSource('rails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, tolerance: 0.1 });
map.addSource('tracks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addSource('station-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
// Today's Lines and Stations are drawn as soon as its track comes, before the Trips, which are most of the bundle.
needed.days.then(show, (error: unknown) => console.error(error));
show(await needed.track);
// Around midnight the days the map needs change, and each day's build names three more.
setInterval(refreshDays, 60_000);

// Track goes under the basemap's labels; Stations and names go on top of everything.
const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
/** How each Line's stroke is laid out, and its casing alike, so that MapLibre builds their geometry once. */
const lineLayout: LineLayerSpecification['layout'] = { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'above'] };
/** The colour each Line's stroke is drawn in. */
const lineColour: ExpressionSpecification = ['case', ['to-boolean', ['get', 'shared']], SHARED, ['get', 'colour']];
/** How far right of its track each Line's stroke is drawn, and its casing: `side` line widths, zoomed out. */
const lineOffset = byZoom(APART, (px) => ['*', ['get', 'side'], px]);
// The casing sets each Line off the basemap's roads and rivers, 1 px either side of it. It's one layer
// under every Line, so none shows between Lines side by side on shared track, and where Lines cross it
// cuts no gap, nor where a Line goes into a tunnel. The Lines in tunnels go below the rest, the deeper
// the lower, and where one above covers one, it shows through, dashed (#178). The Lines are drawn
// along their stretches until they're back on the rails, and then each on its own track (ADR-0006).
// Along their stretches, each zoom band has layers of its own, for its curves across the nodes and
// its strokes cut back to make room for them (#163), and below GRAPH_BAND, for its own line graph's
// strokes (ADR-0007). Either side of the zoom they go back on the rails at, their strokes along their
// stretches fade out over their rails as those fade in (FADE). The rails go under the stretches'
// layers: where Lines share a track, their rails lie one over another, so faded alike they'd show
// nearly whole long before the stretches' strokes go.
const railsZoom = APART.at(-1)?.[0] ?? 15;
const stretchesFade = byZoom([[railsZoom - FADE, 1], [railsZoom + FADE, 0]], (opacity) => opacity);
const railsFade = byZoom([[railsZoom - FADE, 0], [railsZoom + FADE, 1]], (opacity) => opacity);
/** Along their stretches, Lines are shown through neither while they slide onto the rails nor while they fade. */
const stretchesThrough = byZoom([[14, 1], [14.1, 0]], (opacity) => opacity);
map.addLayer(
  { id: 'tracks', type: 'line', source: 'tracks', maxzoom: linesZoom, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'colour'], 'line-width': atZoom(WIDTH, linesZoom) } },
  firstLabel,
);
const layered = [
  ...BANDS.map((_, band) => {
    const [minzoom, maxzoom] = bandZooms(band);
    const filter: ExpressionFilterSpecification = band < GRAPH_BAND ? ['==', ['get', 'band'], band] : ['any', ['!', ['has', 'band']], ['==', ['get', 'band'], band]];
    const zooms = { minzoom: Math.max(minzoom, linesZoom), maxzoom: Math.min(maxzoom, railsZoom + FADE), filter };
    return { source: 'lines', id: band ? `lines-${band}` : 'lines', prefix: band ? `line-${band}` : 'line', zooms, nameZooms: { maxzoom: Math.min(maxzoom, railsZoom) }, opacity: stretchesFade, throughOpacity: stretchesThrough, below: firstLabel };
  }),
  // Under the first band's casing, the lowest of the stretches' layers.
  { source: 'rails', id: 'rails', prefix: 'rail', zooms: { minzoom: railsZoom - FADE, filter: true as ExpressionFilterSpecification }, nameZooms: { minzoom: railsZoom }, opacity: railsFade, throughOpacity: railsFade, below: 'line-casing' },
];
for (const { source, id, prefix, zooms, nameZooms, opacity, throughOpacity, below } of layered) {
  map.addLayer(
    {
      id: `${prefix}-casing`,
      type: 'line',
      source,
      ...zooms,
      layout: lineLayout,
      paint: { 'line-color': casing, 'line-width': byZoom(WIDTH, (px) => px + 2), 'line-offset': lineOffset, 'line-opacity': opacity },
    },
    below,
  );
  map.addLayer(
    {
      id,
      type: 'line',
      source,
      ...zooms,
      layout: lineLayout,
      paint: {
        'line-color': lineColour,
        'line-width': byZoom(WIDTH, (px) => px),
        'line-offset': lineOffset,
        'line-opacity': opacity,
      },
    },
    below,
  );
  // Over its own stroke, in its own colour, it doesn't show: only where another Line covers it. Not
  // where Lines on one level cover each other: crowded, or sliding onto the rails.
  map.addLayer(
    {
      id: `${id}-through`,
      type: 'line',
      source,
      ...zooms,
      filter: ['all', zooms.filter, ['has', 'under'], ['!', ['has', 'crowded']]],
      layout: { ...lineLayout, 'line-cap': 'butt' },
      paint: { 'line-color': lineColour, 'line-width': byZoom(WIDTH, (px) => px / 2), 'line-offset': lineOffset, 'line-dasharray': [2, 2], 'line-opacity': throughOpacity },
    },
    below,
  );
  // The Lines' names switch at once, where they go back on the rails.
  map.addLayer({
    id: `${prefix}-names`,
    type: 'symbol',
    source,
    ...zooms,
    ...nameZooms,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': NAME_SIZE,
      'text-offset': byZoom(APART, (_, zoom) => ['array', 'number', 2, ['get', `textOffset${zoom}`]]),
    },
    paint: {
      'text-color': ['get', 'lettering'],
      'text-halo-color': halo,
      'text-halo-width': 2,
      // MapLibre offsets names by whole zoom levels, so while the Lines slide onto the rails, names hide.
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 14, 1, 14.1, 0, 14.9, 0, 15, 1],
    },
  });
}
// The Closures (#341), over their Lines' strokes in each band, and zoomed right in over their rails,
// in their coats (CLOSURE_COATS), faded as the Lines are. The rails' are simplified as theirs.
map.addSource('closures', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addSource('closure-rails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, tolerance: 0.1 });
map.addImage('closure-hatch', hatching(casing), { pixelRatio: 2 });
/** The layers the Closures are drawn in, along the stretches below railsZoom and on the rails from it, as the Lines' strokes (strokeLayers). */
const closureLayers = layered.flatMap(({ id, zooms, opacity, below }) =>
  CLOSURE_COATS.map((coat, i) => {
    const rails = id === 'rails';
    const layer: LineLayerSpecification = {
      id: `${id}-closures-${i}`,
      type: 'line',
      source: rails ? 'closure-rails' : 'closures',
      ...zooms,
      filter: ['all', zooms.filter, ['==', ['get', 'kind'], coat.kind]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': coat.colour === 'line' ? ['get', 'colour'] : casing,
        'line-width': byZoom(WIDTH, (px) => px * coat.width + (coat.more ?? 0)),
        'line-offset': lineOffset,
        'line-opacity': opacity,
        ...(coat.hatched && { 'line-pattern': 'closure-hatch' }),
      },
    };
    // Over the band's Lines, under the basemap's labels; on the rails, over them, under the stretches'.
    map.addLayer(layer, below);
    return layer.id;
  }),
);
drawClosures = showClosures;
liftClosures = hideClosures;
drawClosures();
// A tier's dots are larger than the rest, and drawn over them where they meet.
map.addLayer({
  id: 'stations',
  type: 'circle',
  source: 'stations',
  layout: { 'circle-sort-key': ['get', 'larger'] },
  paint: {
    'circle-radius': byZoom(DOT, (px) => ['+', px, ['get', 'larger']]),
    'circle-color': '#fff',
    'circle-stroke-color': dotRing,
    'circle-stroke-width': byZoom(RING, (px) => px),
  },
});
/** A Train's dot's radius at a zoom, in px (TRAIN_DOT), or the followed Train's. */
const dotAt = (zoom: number, followed: boolean) => atZoom(TRAIN_DOT.map(([z, px, larger]) => [z, followed ? larger : px]), zoom);
/** A Train's dot's radius, in px, as an expression (TRAIN_DOT). */
const trainDot: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], ...TRAIN_DOT.flatMap(([zoom, px, followed]): (number | ExpressionSpecification)[] => [zoom, ['case', ['get', 'followed'], followed, px]])];
// Zoomed out, Trains are dots over the Stations they stand at, under the Stations' names.
map.addSource('trains', { type: 'geojson', data: trains() });
map.addLayer({
  id: 'trains',
  type: 'circle',
  source: 'trains',
  minzoom: linesZoom,
  filter: AS_DOT,
  // A Live Train is filled with its Line's colour; a Scheduled one is only ringed with it.
  layout: { 'circle-sort-key': ['case', ['get', 'followed'], 1, 0] },
  // The Train the map follows is drawn larger, over the rest.
  paint: {
    'circle-radius': trainDot,
    'circle-color': byLive(['get', 'colour'], scheduledFill),
    'circle-stroke-color': byLive('#fff', ['get', 'lettering']),
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, byLive(0.5, 1.5), 14, byLive(1.5, 3)],
  },
});
// A Live Train has a soft halo in its Line's colour under its marker, dot or pill, which says again
// that it's Live and sets it further apart from a Scheduled one, which has none (#91). It grows with
// the marker, the followed Train's too, as trains() works its radius out for the zoom: a plain
// number for each Train is quicker for the map to draw with, each time it draws Trains, than an
// expression of the zoom. It lies under the Lines' names, which it would veil, and the places' dots,
// which it would blur. On a tilted map it keeps its size, as a pill does more than a circle.
// ponytail: a circle, so under a long pill it reaches further above and below it than past its ends,
// whatever its outline. Blur each outline, drawn larger, if that shows.
map.addLayer(
  {
    id: 'train-halos',
    type: 'circle',
    source: 'trains',
    minzoom: linesZoom,
    filter: ['get', 'live'],
    paint: { 'circle-radius': ['get', 'haloRadius'], 'circle-color': ['get', 'colour'], 'circle-blur': HALO_BLUR, 'circle-opacity': HALO_OPACITY, 'circle-pitch-scale': 'viewport' },
  },
  'line-names',
);
// Each place's name beside its track (showNames()), from its tier's zoom, and where names collide, the
// one named from further out. Right of a track, a name's lines line up along the track's side.
map.addLayer({
  id: 'station-names',
  type: 'symbol',
  source: 'station-names',
  filter: ['>=', ['zoom'], ['get', 'nameZoom']],
  layout: {
    'symbol-sort-key': ['get', 'nameZoom'],
    'text-field': ['get', 'name'],
    'text-font': ['case', ['get', 'bold'], ['literal', ['Noto Sans Bold']], ['literal', FONT]],
    'text-size': ['get', 'size'],
    // Each name comes in the lines nameLines() breaks it into, which MapLibre keeps to when lines can be this long.
    'text-max-width': 1000,
    'text-anchor': ['step', ['zoom'], ...NAME_ZOOMS.flatMap((zoom, i) => [...(i ? [zoom] : []), ['get', `anchor${zoom}`]])] as ExpressionSpecification,
    'text-justify': 'auto',
    'text-offset': byZoom(
      NAME_ZOOMS.map((zoom) => [zoom, 0]),
      (_, zoom) => ['array', 'number', 2, ['get', `offset${zoom}`]],
    ),
  },
  paint: { 'text-color': nameColour, 'text-halo-color': halo, 'text-halo-width': NAME_HALO },
});
// The point a link names, as a build report's do, ringed 40 px across in the colour of the places'
// names: over the Lines, their names and the places' and Trains' dots, and under the places' names
// and the Trains' pills (#254).
map.addSource('mark', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addLayer({ id: 'mark', type: 'circle', source: 'mark', paint: { 'circle-radius': 20, 'circle-opacity': 0, 'circle-stroke-width': 3, 'circle-stroke-color': nameColour } }, 'station-names');
// Zoomed in (pillOf()), each Train is a pill with its Line's name, over the Stations' names too,
// outlined by its Line's kind of service: a Live one's filled with its Line's colour and edged in
// white, a Scheduled one's white, or the dark basemap's paper, ringed and lettered in its Line's colour
// (Pill's `lettering`). Just outside it, an arrow points the way the Train runs, and turns with the
// map. The Train the map follows has its own pill and arrow, larger, over every other Train's:
// MapLibre draws a layer's names after all its pills.
for (const [id, outline] of Object.entries(OUTLINES)) addOutline(id, outline);
for (const [suffix, followed, size] of [['', false, PILL_TEXT], ['-followed', true, FOLLOWED_TEXT]] as const) {
  const filter: ExpressionSpecification = ['all', AS_PILL, ['==', ['get', 'followed'], followed]];
  map.addLayer({
    id: `train-pills${suffix}`,
    type: 'symbol',
    source: 'trains',
    filter,
    layout: {
      'icon-image': ['concat', 'train-', ['get', 'outline']],
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [0, PILL_PADDING, 0, PILL_PADDING],
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': size,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'icon-color': byLive(['get', 'colour'], scheduledFill),
      'icon-halo-color': byLive('#fff', ['get', 'lettering']),
      'icon-halo-width': PILL_HALO,
      'text-color': byLive(['case', ['get', 'dark'], INK, '#fff'], ['get', 'lettering']),
    },
  });
  map.addLayer({
    id: `train-arrows${suffix}`,
    type: 'symbol',
    source: 'trains',
    filter,
    layout: {
      'icon-image': 'train-arrow',
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      // `reach` px ahead of the Train.
      'icon-offset': ['interpolate', ['linear'], ['get', 'reach'], 0, ['literal', [0, 0]], 100, ['literal', [0, -100]]],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': ['get', 'lettering'], 'icon-halo-color': halo, 'icon-halo-width': 1 },
  });
}

// Tapping a Train follows it, and tapping a Station shows its board. Both are small, so a tap near one
// will do, and a Train standing at a Station is the one tapped. A tap nothing else takes, on a Line's
// stroke or within STROKE_TAP of one, names the Lines drawn there, by their pills (#193), the strokes
// nearest the tap first, and their Alerts, folded away; or on a Closure drawn over them, shows what
// closes it (#341): but not on a place's name, which takes no tap. Any tap clears the ring a link
// drew (#254).
// ponytail: so a double-click or double-tap that zooms clears it too, its first tap being a tap,
// though a wheel, a pinch or a drag keeps it. Clear it only once no second tap follows if the ring's
// missed after one.
/** The layers the Lines' strokes are drawn in. A tap names the Lines of those along their stretches below railsZoom, and of the rails from it. */
const strokeLayers = layered.map((l) => l.id);
/** Where a tap names the Lines drawn there, or what closes a Closure. Each tap closes the last one's. */
const linesPopup = new Popup({ closeButton: false, closeOnClick: false, className: 'lines-at', maxWidth: 'none' });
/** How far in from the map's sides the tap's popup keeps, and from the cards over the map's top and the buttons over its bottom, in px (fitPopup()). */
const GUTTER = 16;
/** The Lines a tap names, and whether their Alerts are shown, which their fold hides, until the next tap (#341). */
let tappedLines = { lines: [] as string[], open: false };
/** What the popup shows of the Lines a tap names, which changes in place as its fold turns (patch()). */
const tappedBox = el('div');
map.on('click', ({ point: { x, y }, lngLat }) => {
  linesPopup.remove();
  if (marked) {
    showMark(undefined);
    writeLink();
  }
  const within = (r: number, layers: string[]) => map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers });
  const near = (layer: string): unknown => within(10, [layer])[0]?.properties.id;
  // Where pills overlap, the one under the tap, the topmost, before one near it.
  const under: unknown = within(0, ['train-pills-followed', 'train-pills'])[0]?.properties.id;
  const [train, place] = [under ?? near('train-pills-followed') ?? near('train-pills') ?? near('trains'), near('stations')];
  // A tap on a pill standing over others spreads them, and while they're spread, any tap but on one of them folds them (#129).
  const { group } = spreadState;
  const inGroup = typeof train === 'string' && group?.ids.has(train);
  const spreads = typeof train === 'string' && !group ? groupOf(standingPills.map((p) => ({ ...p, at: projected(p.at) })), train) : undefined;
  if (spreads || (group && !inGroup)) {
    spreadState.group = spreads;
    trainSource?.setData(trains());
  }
  if (spreads) return;
  if (typeof train === 'string') follow(train);
  else if (typeof place === 'string') showBoard(place);
  else if (!within(0, ['station-names']).length) {
    // As the Lines' names switch, though both show while they fade: the Closures' over the strokes they're on.
    const drawing = [...strokeLayers, ...closureLayers].filter((layer) => layer.startsWith('rails') === map.getZoom() >= railsZoom);
    const tapped = [STROKE_NEAREST, STROKE_TAP].map((r) => within(r, drawing)).find((hits) => hits.length) ?? [];
    const onClosures = tapped.some((f) => closureLayers.includes(f.layer.id));
    const shown = onClosures
      ? closuresTapped(tapped.flatMap((f) => (closureLayers.includes(f.layer.id) ? [String(f.properties.key)] : [])))
      : linesTapped(linesAt(tapped.map((f) => ({ line: String(f.properties.line), shape: String(f.properties.shape), from: Number(f.properties.from), to: Number(f.properties.to) })), shownStrokes));
    if (shown) {
      fitPopup(lngLat);
      linesPopup.setLngLat(lngLat).setDOMContent(shown).addTo(map);
    }
  }
});
// Where the map moves under the tap's popup, by a drag, a pan or the panel's padding, it's fitted again
// once it stops (#341).
// ponytail: not as it moves, so a drag can carry it over an edge till then. Fit it on `move` too if
// that's missed.
map.on('moveend', () => {
  if (linesPopup.isOpen()) fitPopup(linesPopup.getLngLat());
});
// ponytail: while the Lines fade, the pointer shows over the strokes of both drawings, though a tap
// names only one's. Check the zoom on mouseenter if that ever misleads.
// Over a Closure too, from its Line's stroke under it: each layer here queries the map on every move
// of the mouse, a drag's too, and the Closures have 27.
for (const layer of ['trains', 'train-pills', 'train-pills-followed', 'stations', ...strokeLayers]) {
  map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
}
// Escape closes the About dialog on its own, if it's open.
document.addEventListener('keydown', (e) => e.key === 'Escape' && !about.open && (following || boardPlace || nearMe) && closePanel());

// Moves the Trains as often as MOVED says, and once a second works out which Networks the banner
// names. The browser stops asking while the tab is hidden.
const trainSource = map.getSource<GeoJSONSource>('trains');
// The map can move Trains now, so Nearby and the random follow can show them.
trainButtons.hidden = false;
/** When the map last moved, as a drag, a zoom or an easing, or followed a Train, and when its Trains were last drawn, by performance.now(), and at which zoom and bearing. */
let [moved, drawn, drawnAt] = [-Infinity, -Infinity, ''];
requestAnimationFrame(function move(now) {
  if (following || map.isMoving()) moved = now;
  const view = `${map.getZoom()} ${map.getBearing()}`;
  // ponytail: no more often than IDLE_EVERY once the map stands, so zoomed right in, at 18, a Train at
  // 110 km/h then steps about 4.5 px at a time. Let the rate rise with the zoom there too if that shows.
  const every = following || spreadState.easing || view !== drawnAt ? 0 : Math.min(IDLE_MOST, now - moved > MOVED ? Math.max(IDLE_EVERY, quarterPixel()) : quarterPixel());
  if (now - drawn < every) return requestAnimationFrame(move);
  [drawn, drawnAt] = [now, view];
  const drawing = trains();
  trainSource?.setData(drawing);
  // The legend's count changes by the second, once the Trips have come, and with it whether there's a
  // Train to follow at random: one the map doesn't follow already.
  if (bundle && performance.now() - countShown > 1000) {
    showCount(drawing.features);
    followRandomButton.disabled = drawing.features.every((f) => f.properties?.followed);
  }
  if (following) {
    // A Train that has left the map, reaching its last Station or cancelled, is followed no more.
    if (!following.at && !waiting) closePanel();
    else if (following.at) {
      // Under reduced motion, today's steps (keepInView()); otherwise the map pans with the Train until the viewer lets go.
      if (lessMotion.matches) keepInView(following.at);
      else if (!letGo()) centreOn(following.at);
    }
  }
  showCentring();
  // The panel's times and ages change by the second.
  if ((following || boardPlace || nearMe) && performance.now() - panelShown > 1000) showPanel();
  // Which Networks the banner names changes as Trains and the view move, and the banner with it.
  // Zoomed out, where no Trains are drawn, none of them is in view.
  // ponytail: in view by the map's bounds, which on a turned or tilted map take in some of the map
  // around the view too, as followRandom()'s do. Test where each Train and stretch of track is on
  // screen, as keepInView() does, if a banner for a Network just out of view ever shows.
  if (now - bannerChecked > 1000) {
    bannerChecked = now;
    const drawnTrains = map.getZoom() < linesZoom ? [] : drawing.features.map((f) => ({ network: f.properties?.network, at: f.geometry.coordinates as Point }));
    const followedNetwork = drawing.features.find((f) => f.properties?.followed)?.properties?.network;
    const named = bannerNetworks({ unavailable: unavailable(bundle, Date.now(), received), noTrips: noTripsIds }, { trains: drawnTrains, followedNetwork, tracks: shownTracks }, map.getBounds().toArray());
    if (JSON.stringify(named) !== JSON.stringify(bannerIds)) {
      bannerIds = named;
      showBanner();
    }
  }
  requestAnimationFrame(move);
});

// A name goes beside its track as the track lies on screen, so once the map has turned, names move.
// ponytail: only once it stops, so while it turns, names keep their offsets and can cross their
// tracks. Put them beside their tracks on 'rotate' too, a few times a second, if that shows.
map.on('moveend', () => map.getBearing() !== namesBearing && showNames());

// The link the map is opened with, and one pasted into the tab later: MapLibre moves the view, or
// openLink() moves the map to the Station where the link names none.
openLink();
addEventListener('hashchange', openLink);

/**
 * Draws the Lines and Stations of the days on the map, and credits their Networks and names them in
 * the banner, where they've changed, and once their Trips have come, moves their Trains.
 */
function show(days: Track | Bundle) {
  if ('trips' in days) bundle = days;
  // A day's Trips come after its track, which is drawn already, unless the days joined bring more than one.
  if (days.stations === shownStations) return drawClosures();
  shownStations = days.stations;
  lines = new Map(days.lines.map((l) => [l.id, l]));
  stationNames = new Map(days.stations.map((s) => [s.id, s.name]));
  shownPlaces = new Map(places(days.stations).map((p) => [p.id, p]));
  placeOfStation = new Map([...shownPlaces.values()].flatMap((p) => p.stations.map((station): [string, Place] => [station, p])));
  const shapes = new Map(days.shapes.map((s) => [s.id, s]));
  const slots = new Map<string, Slot[]>();
  // A track built before #176 has none: its Trains go on their own track.
  for (const s of days.slots ?? []) slots.set(`${s.line} ${s.shape}`, [...(slots.get(`${s.line} ${s.shape}`) ?? []), s]);
  const keep = new Map(days.networks.map((n) => [n.id, n.runningSide === 'left' ? -1 : 1]));
  placing = { shapes, slots, curves: zones(days.strokes), keep: new Map(days.lines.map((l) => [l.id, keep.get(l.network) ?? 1])), closures: new Map() };
  // A track built before #241 names no kinds of service and no pill zooms: its Trains are round pills from zoom 10.
  const pillZoom = new Map(days.networks.map((n) => [n.id, n.pillZoom]));
  pills = new Map(days.lines.map((l) => [l.id, pillOf(l, pillZoom.get(l.network) ?? 10)]));
  shownStrokes = days.strokes;
  // Zoomed in, on its own rails, a Line's bends are rounded (#203).
  const drawn = (strokes: Stroke[], round = false): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    // A stroke cut back for curves, or along a centreline smoothed for a zoom band, once for each band
    // it's drawn in, as it is there; a curve in its pieces.
    features: strokes.flatMap((s) => {
      const bands = s.band !== undefined ? [s.band] : BANDS.flatMap((_, band) => (band >= GRAPH_BAND ? [band] : []));
      if (!s.cut && !bands.some((band) => shapes.has(smoothId(s.shape, band)))) return pieces(s);
      // Not in a band where a node absorbed its Stretch (ADR-0007).
      return bands.flatMap((band) => {
        const [start, end] = cutIn(s, band);
        return start + end < s.to - s.from ? [{ ...s, from: s.from + start, to: s.to - end, band }] : [];
      });
    }).flatMap(({ line: id, shape: shapeId, from, to, side, band, shared, under, crowded }): GeoJSON.Feature[] => {
      const [line, shape] = [lines.get(id), band === undefined ? shapes.get(shapeId) : inBand(shapes, shapeId, band)];
      if (!line || !shape) return [];
      const properties = {
        // Which Lines a tap on it names (linesAt()).
        line: id,
        shape: shapeId,
        from,
        to,
        name: line.name,
        colour: line.colour,
        lettering: pills.get(id)?.lettering,
        // Zoomed right in, where Lines share track, Barcelona's commuter lines (R1–R8) are drawn over the regional ones.
        // And those in tunnels below the rest, the deeper the lower (#178).
        above: (/^R\d[NS]?$/.test(line.name) ? 1 : 0) - 2 * (under ?? 0),
        side,
        ...(band !== undefined && { band }),
        ...(shared && { shared }),
        ...(under && { under }),
        ...(crowded && { crowded }),
        // Each Line's name goes on its own stroke: text-offset is in ems.
        ...Object.fromEntries(APART.map(([zoom, px]) => [`textOffset${zoom}`, [0, (side * px) / NAME_SIZE]])),
      };
      const coordinates = along(shape, from, to);
      return [{ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: round ? rounded(coordinates) : coordinates } }];
    }),
  });
  map.getSource<GeoJSONSource>('lines')?.setData(drawn(days.strokes));
  map.getSource<GeoJSONSource>('rails')?.setData(drawn(days.rails, true));
  // A track built before #190 has none.
  const colours = new Map(days.networks.map((n) => [n.id, n.colour]));
  shownTracks = (days.tracks ?? []).flatMap(({ line: id, shape: shapeId, from, to }) => {
    const [line, shape] = [lines.get(id), shapes.get(shapeId)];
    return line && shape ? [{ network: line.network, coordinates: along(shape, from, to) }] : [];
  });
  map.getSource<GeoJSONSource>('tracks')?.setData({
    type: 'FeatureCollection',
    features: shownTracks.map(({ network, coordinates }) => ({ type: 'Feature', properties: { colour: colours.get(network) }, geometry: { type: 'LineString', coordinates } })),
  });
  const tiered = [...shownPlaces.values()].map((p) => {
    const { nameZoom, larger, size } = TIERS.find((tier) => tier.places.includes(p.id)) ?? UNTIERED;
    return { ...p, nameZoom, larger, style: { bold: BOLD.has(p.id), size } };
  });
  // Where a place is named after its town, the town's label goes once the place's name shows (#121).
  const once: ExpressionSpecification = ['!', namedTwice(tiered)];
  for (const [id, filter] of placeLabels) map.setFilter(id, ['all', filter ?? true, once]);
  map.getSource<GeoJSONSource>('stations')?.setData({
    type: 'FeatureCollection',
    features: tiered.map(({ id, larger, lon, lat }) => ({ type: 'Feature', properties: { id, larger }, geometry: { type: 'Point', coordinates: [lon, lat] } })),
  });
  // Names go beside the track, not the stretches' centrelines, clear of the Trains on their Lines' strokes along those.
  const [track, centrelines] = [days.shapes.filter((s) => !s.id.startsWith(STRETCH)), days.shapes.filter((s) => s.id.startsWith(STRETCH))];
  const spots = alongside(track, (days.slots ?? []).filter((s) => s.band === undefined), (line) => placing.keep.get(line) ?? 1, days.lines, new Map(centrelines.map((c) => [c.id, c])));
  // A track built before #243 names no Station's Networks: its names go beside the nearest track of any.
  names = tiered.map(({ name, networks, nameZoom, larger, style, lon, lat }) => {
    const rows = nameLines(name, style);
    return { dot: [lon, lat], sides: spots([lon, lat], networks), name: rows.join('\n'), size: [Math.max(...rows.map((row) => placeWidth(row, style))), rows.length * LINE_HEIGHT * style.size], nameZoom, larger, style };
  });
  showNames();
  credited = days.networks;
  showCredits();
  showBanner();
  drawClosures();
}

/**
 * Draws the Closures shown now, by the map's time (closuresAt()), on their Lines' strokes in each zoom
 * band, and on their rails, where one of the Line's shapes runs by both their Stations (placeOn()); where
 * none does, as none of T5's does from Glòries to Can Jaumandreu, they're words only (ADR-0012). Where
 * each goes is worked out once for the track on the map.
 */
function showClosures() {
  shownClosures = bundle ? closuresAt(alerts, bundle, mapTime(Date.now(), received)) : [];
  hideClosures();
  const drawn = shownClosures.map((closure) => {
    const key = closureKey(closure);
    const features = placing.closures.get(key) ?? placeClosure(closure);
    placing.closures.set(key, features);
    return features.map((list) => list.map((f) => ({ ...f, properties: { ...f.properties, key, kind: closure.kind } })));
  });
  map.getSource<GeoJSONSource>('closures')?.setData({ type: 'FeatureCollection', features: drawn.flatMap(([stretches = []]) => stretches) });
  map.getSource<GeoJSONSource>('closure-rails')?.setData({ type: 'FeatureCollection', features: drawn.flatMap(([, rails = []]) => rails) });
}

/**
 * Which of the Closures shown hide Trains (hiding(), #345), once those the latest snapshot has a Live
 * Train of their Line within are lifted (seenWithin()): the same list while they're the same, as the
 * engine works out each list's once (6 ms on 10 Oct's bundle).
 */
function hideClosures() {
  const hides = hiding(shownClosures, bundle ? seenWithin(bundle, Date.now(), received, shownClosures) : [], lifted);
  if (hides.length !== hidingClosures.length || hides.some((c, i) => c !== hidingClosures[i])) hidingClosures = hides;
}

/**
 * Where a Closure goes on the track on the map: along its Line's stretches, in each band, from the
 * shortest of its shapes between its Stations; and on its rails, rounded as they are (#203), on each of
 * them, as the Line's Trains each way can have a track of their own. Nowhere where none of the Line's
 * shapes runs by both its Stations.
 */
function placeClosure({ line: id, stations }: Shown): [GeoJSON.Feature[], GeoJSON.Feature[]] {
  const line = lines.get(id);
  const [a, b] = stations.map((station) => shownStations?.find((s) => s.id === station)).flatMap((s): Point[] => (s ? [[s.lon, s.lat]] : []));
  const placed = line && a && b ? placeOn([a, b], line.shapes.flatMap((shape) => placing.shapes.get(shape) ?? [])) : [];
  const feature = (coordinates: Point[], properties: object): GeoJSON.Feature => ({ type: 'Feature', properties: { ...properties, colour: line?.colour }, geometry: { type: 'LineString', coordinates } });
  const [first] = placed;
  const strokes = first ? closureStrokes(id, first, placing.slots.get(`${id} ${first.shape}`) ?? [], placing.curves) : [];
  return [
    strokes.flatMap(({ shape: on, from, to, side, band = GRAPH_BAND }) => {
      const centreline = inBand(placing.shapes, on, band);
      return centreline ? [feature(along(centreline, from, to), { side, band })] : [];
    }),
    placed.flatMap(({ shape: own, from, to }) => {
      const shape = placing.shapes.get(own);
      return shape ? [feature(rounded(along(shape, from, to)), { side: 0 })] : [];
    }),
  ];
}

/**
 * Every Train on the map now, in its Line's colour, Live or Scheduled, but for a Scheduled one within
 * a closed Closure that hides Trains (trainsAt(), hiding(), #345). Zoomed out, until the Lines
 * are back on the rails, each sits on its Line's stroke, half a line width to the side its Network's
 * Trains keep to, so that Trains going opposite ways show apart (onStroke()). A tapped group of
 * Trains standing together at a Station goes side by side across their track (spreading()), so that
 * each can be seen and tapped (#129).
 */
function trains(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const zoom = map.getZoom();
  const [followed, bearing] = [followedId(), map.getBearing()];
  if (following) following.at = undefined;
  const placed = (bundle ? trainsAt(bundle, Date.now(), received, hidingClosures) : []).map((train) => {
    const { trip, dist, lon, lat, heading, standsAt } = train;
    // ponytail: takes the Network's running side, so L2's Trains between Tetuan and Paral·lel, and
    // Cercanías Madrid's beyond Pinar de las Rozas, which keep left, sit half a line width to the wrong
    // side zoomed out. Publish each shape's side of its double track from the trace if that ever shows.
    const on = zoom < railsZoom ? onStroke(placing.slots.get(`${trip.line} ${trip.shape}`), placing.shapes, dist, zoom, placing.keep.get(trip.line) ?? 1, placing.curves) : undefined;
    const pill = pills.get(trip.line);
    const box = pill && (trip.id === followed ? pill.followedBox : pill.box);
    // As a pill, with its edge, on screen.
    const asPill = pill && box && zoom >= pill.zoom ? { id: trip.id, heading: heading - bearing, box: [box[0] + PILL_HALO, box[1] + PILL_HALO] as [number, number], standsAt } : undefined;
    return { train, pill, box, asPill, at: on ?? ([lon, lat] as Point) };
  });
  standingPills = placed.flatMap(({ asPill, at }) => (asPill?.standsAt ? [{ ...asPill, standsAt: asPill.standsAt, at }] : []));
  // A spread group folds once fewer than two of its Trains stand at its Station drawn as pills, as zoomed out.
  const { group } = spreadState;
  if (group && standingPills.filter((p) => group.ids.has(p.id) && p.standsAt === group.station).length < 2) spreadState.group = undefined;
  // Only the group's Trains, and those moved aside, easing back, are put on screen.
  const spreadable = placed.flatMap(({ asPill, at }): Drawn[] => (asPill && (spreadState.group?.ids.has(asPill.id) || spreadState.moved.has(asPill.id)) ? [{ ...asPill, at: projected(at) }] : []));
  const aside = spread(spreadable, performance.now(), spreadState.group);
  spreadState = { group: spreadState.group, moved: aside, easing: [...aside].some(([id, px]) => spreadState.moved.get(id) !== px) || aside.size !== spreadState.moved.size };
  return {
    type: 'FeatureCollection',
    features: placed.map(({ train: { trip, heading, live }, pill, box, at }) => {
      const [out, onScreen] = [aside.get(trip.id), spreadable.find((d) => d.id === trip.id)?.at];
      const right = rightOf(heading, bearing);
      const coordinates: Point = out && onScreen ? (map.unproject([onScreen[0] + out * right[0], onScreen[1] + out * right[1]]).toArray() as Point) : at;
      if (following && trip.id === followed) following.at = coordinates;
      const line = lines.get(trip.line);
      return {
        type: 'Feature',
        properties: {
          id: trip.id,
          colour: line?.colour,
          lettering: pill?.lettering,
          // Which Network's banner it shows (bannerNetworks()).
          network: line?.network,
          live,
          followed: trip.id === followed,
          heading,
          name: pill?.name,
          outline: pill?.outline,
          dark: pill?.dark,
          pillZoom: pill?.zoom,
          reach: box && reach(box, heading - bearing),
          // Its halo's radius: HALO_DOT times its dot's, or from its Line's pill zoom, out to the corners of its pill's box and HALO_BEYOND beyond.
          haloRadius: pill && box && zoom >= pill.zoom ? Math.hypot(...box) + HALO_BEYOND : HALO_DOT * dotAt(zoom, trip.id === followed),
        },
        geometry: { type: 'Point', coordinates },
      };
    }),
  };
}

/**
 * Puts each place's name beside its own Networks' track (alongside()) as the track lies on screen now, at each of
 * NAME_ZOOMS on the side nearestSide() takes, as far out from its dot as clearance() says, and off any track
 * crossing its own there (underName()).
 * ponytail: tries a name under a crossing track at the zoom and the next, not in between, and as far
 * out at the next as at this one. Try more steps if a name lies across one mid-zoom.
 * ponytail: laid out flat, so on a tilted map a name sits a little nearer its track or further than
 * NAME_GAP. Work each normal out on screen with map.project() if that shows.
 */
function showNames() {
  namesBearing = map.getBearing();
  map.getSource<GeoJSONSource>('station-names')?.setData({
    type: 'FeatureCollection',
    features: names.map(({ dot, sides, name, size, nameZoom, larger, style }): GeoJSON.Feature => {
      const at = sides(namesBearing);
      const properties = NAME_ZOOMS.flatMap((zoom) => {
        // MapLibre lays names out at whole zooms, so a track crossing its own lies under one from this zoom to the next, at half the metres a px.
        const metresPerPx = pixelMetres(zoom) * Math.cos((dot[1] * Math.PI) / 180);
        // The Lines whose strokes lie under a name, or within `gap` px of it, at this zoom's Lines' spacing and width and the next's.
        const underAt = (s: Spot, far: number, gap: number) =>
          [0, 1].reduce((sum, step) => sum + underName(s, far, size, metresPerPx / 2 ** step, atZoom(APART, zoom + step), gap + atZoom(WIDTH, zoom + step) / 2), 0);
        // Below the zoom it shows from, no name lies anywhere; from it, fewest under it first, then fewest within NAME_GAP.
        const under = (s: Spot, far: number) => (zoom < nameZoom ? 0 : 1000 * underAt(s, far, 0) + underAt(s, far, NAME_GAP));
        const { spot, far } = nearestSide(at, (s) => clearance(s, larger, zoom), under);
        // MapLibre offsets names in ems.
        return [
          [`anchor${zoom}`, spot.anchor],
          [`offset${zoom}`, nameOffset(spot, far, size).map((px) => px / style.size)],
        ];
      });
      return { type: 'Feature', properties: { name, nameZoom, ...style, ...Object.fromEntries(properties) }, geometry: { type: 'Point', coordinates: dot } };
    }),
  });
}

/**
 * How far out from its dot a place's name goes at a zoom, in px: NAME_GAP clear of the dot, `larger`
 * px larger than the smallest, and of each Train drawn along its tracks there, as a pill, or below its
 * Line's pill zoom a dot about as large as the place's, beside its Line's stroke zoomed out; or, for
 * a Line the spot marks `stroke`, of its stroke. MapLibre lays names out at whole zooms, so it's as far out as the map needs until the
 * next, where the Lines are drawn furthest apart and dots largest.
 * ponytail: clear of every Train but the followed one, which is drawn larger. Take in its pill too if
 * the names it covers show.
 */
function clearance({ from: [, lat], normal: [x, y], dot: dotBehind, lines: drawn }: Spot, larger: number, zoom: number): number {
  const metresPerPx = pixelMetres(zoom) * Math.cos((lat * Math.PI) / 180);
  const dot = atZoom(DOT, zoom + 1) + larger + atZoom(RING, zoom + 1);
  const apart = Math.max(atZoom(APART, zoom), atZoom(APART, zoom + 1));
  const reaches = drawn.map(({ line, toward, behind, stroke }) => {
    const pill = pills.get(line);
    const across = stroke ? atZoom(WIDTH, zoom + 1) / 2 : pill && zoom >= pill.zoom ? pill.box[0] * Math.abs(x) + pill.box[1] * Math.abs(y) + PILL_HALO : dot;
    return toward * apart + across - behind / metresPerPx;
  });
  return Math.max(dot - dotBehind / metresPerPx, ...reaches) + NAME_GAP + dotBehind / metresPerPx;
}

/**
 * A place's name broken into lines as MapLibre breaks names (determineLineBreaks()): after a space, a
 * hyphen, a slash or a middle dot, into lines as near as can be to the mean of as few as fit PLACE_WRAP
 * ems, their squared differences from it least, a last line better short than long. MapLibre measures
 * a line without its spaces to break it.
 */
function nameLines(name: string, style: NameStyle): string[] {
  const words = name.match(/[^ /·-]+[ /·-]*/g) ?? [name];
  const width = (from: number, to: number) => placeWidth(words.slice(from, to).join('').replaceAll(' ', ''), style);
  const even = placeWidth(name, style) / Math.max(1, Math.ceil(placeWidth(name, style) / (PLACE_WRAP * style.size)));
  // The least ragged lines up to each word, and the word the last of them starts with.
  const [ragged, starts] = [[0], [0]];
  for (let end = 1; end <= words.length; end++) {
    ragged[end] = Infinity;
    for (let start = 0; start < end; start++) {
      const off = width(start, end) - even;
      const total = (ragged[start] ?? 0) + (end < words.length ? off ** 2 : off < 0 ? off ** 2 / 2 : 2 * off ** 2);
      if (total <= (ragged[end] ?? Infinity)) [ragged[end], starts[end]] = [total, start];
    }
  }
  const lines: string[] = [];
  for (let end = words.length; end > 0; end = starts[end] ?? 0) lines.unshift(words.slice(starts[end], end).join('').trimEnd());
  return lines;
}

/** How long the fastest Train, at its Network's top speed, takes to move a quarter of a pixel where the map is, in ms. */
function quarterPixel(): number {
  const fastest = Math.max(...credited.map((n) => n.profile.topSpeed));
  const pixel = pixelMetres(map.getZoom()) * Math.cos((map.getCenter().lat * Math.PI) / 180);
  return (1000 * pixel) / 4 / fastest;
}

/**
 * How a Line's Trains are drawn as pills: its name, the outline for its kind of service, whether its
 * name is lettered dark on its colour, the zoom its Trains are pills from, and how far a pill reaches
 * either side of its Train and above and below it, in px, and the followed Train's.
 */
interface Pill {
  name: string;
  outline: 'round' | 'pointed' | 'badge';
  dark: boolean;
  /** What its Line's colour letters its name in, rings its Scheduled Trains and colours its Trains' arrows in: on the dark basemap, lettering(). */
  lettering: string;
  zoom: number;
  box: [number, number];
  followedBox: [number, number];
}

/** How a Line's Trains are drawn as pills from a zoom, its Network's, outlined by its kind of service. */
function pillOf({ name, colour, kind }: Line, zoom: number): Pill {
  const outline = OUTLINES_OF[kind] ?? 'round';
  const width = textWidth(name, `bold ${PILL_TEXT}px ${TYPEFACE}`);
  return { name, outline, dark: darkInk(colour), lettering: darkBasemap ? lettering(colour, paper) : colour, zoom, box: boxOf(outline, width, PILL_TEXT), followedBox: boxOf(outline, width, FOLLOWED_TEXT) };
}

/** How far a pill reaches either side of its Train and above and below it, in px, with its outline, around a name `width` px wide at PILL_TEXT, lettered at `size` px. */
function boxOf(outline: Pill['outline'], width: number, size: number): [number, number] {
  const { w, across = 0 } = OUTLINES[outline];
  return [Math.max(w, w - across + (width * size) / PILL_TEXT + 2 * PILL_PADDING) / 2, PILL_EDGE + (LINE_HEIGHT * size) / 2];
}

/** Whether INK reads better on a colour than white does, by WCAG's contrast ratio. */
function darkInk(colour: string): boolean {
  return contrast(colour, INK) > contrast(colour, '#ffffff');
}

/** How wide a place's name, or a line of it, is, in px, in its style. */
function placeWidth(text: string, { bold, size }: NameStyle): number {
  return textWidth(text, `${bold ? 'bold ' : ''}${size}px ${TYPEFACE}`);
}

/** How wide a text is in a font, in px: a Line's name on its Trains' pills, or a place's name, in the typeface the map letters them in. */
function textWidth(text: string, font: string): number {
  if (!measuring) return text.length * 6;
  measuring.font = font;
  return measuring.measureText(text).width;
}

/** An opaque CSS colour as #rrggbb, as a canvas reads it. */
function hex(colour: string): string {
  if (!measuring) return colour;
  measuring.fillStyle = colour;
  return String(measuring.fillStyle);
}

/**
 * How far ahead of its Train an arrow goes, in px: just outside a pill reaching `box` px either side
 * and above and below, where the Train's heading leaves it on screen, `angle` degrees clockwise from
 * straight up, as the pill stays level while the map turns (toEdge()).
 * ponytail: laid out flat, so on a tilted map an arrow sits nearer its pill's far side. Aim at the
 * outline tilted with the pill if that shows.
 */
function reach(box: [number, number], angle: number): number {
  return toEdge(box, angle) + ARROW_GAP;
}

/** Where a point is on screen, in px, x right and y down. */
function projected(point: Point): [number, number] {
  const { x, y } = map.project(point);
  return [x, y];
}

/** How far outside a square `half` px either side of its middle, with its corners rounded `r` px, a point is, in px. */
function roundedSquare(half: number, r: number) {
  return (x: number, y: number) => {
    const [qx, qy] = [Math.abs(x) - half + r, Math.abs(y) - half + r];
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

/**
 * Stripes at 45° across a line, a line width apart and 3/8 of one wide, in a colour (#rrggbb), clear
 * between, for a closed Line's stroke (#341): MapLibre fits a line pattern's height to the line's width.
 */
function hatching(colour: string) {
  const [width, height] = [32, 16];
  const data = new Uint8ClampedArray(width * height * 4);
  const rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  for (let i = 0; i < width * height; i++) if (((i % width) + Math.floor(i / width)) % height < 6) data.set([...rgb, 255], i * 4);
  return { width, height, data };
}

/**
 * Adds an outline to the map as the image `train-<id>`, as a signed distance field, which MapLibre
 * colours, edges and sizes sharp: 3 px bigger each way for its edge, at 2 texture px a px. MapLibre
 * draws where the field reads 0.75, and takes a px as 1/8 of it.
 */
function addOutline(id: string, { w, h, across, outside }: (typeof OUTLINES)[keyof typeof OUTLINES]) {
  const [width, height] = [(w + 6) * 2, (h + 6) * 2];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) data[(row * width + col) * 4 + 3] = 255 * (0.75 - outside((col + 0.5 - width / 2) / 2, (row + 0.5 - height / 2) / 2) / 8);
  }
  const [x, y, high] = [width / 2, height / 2, h - 2 * PILL_EDGE];
  const fit = across === undefined ? {} : { stretchX: [[x - 2, x + 2]] as [number, number][], stretchY: [[y - 2, y + 2]] as [number, number][], content: [x - across, y - high, x + across, y + high] as [number, number, number, number] };
  map.addImage(`train-${id}`, { width, height, data }, { sdf: true, pixelRatio: 2, ...fit });
}

/** Shows the interface in the viewer's language: on start, and again each time they switch it. */
function showLanguage() {
  document.documentElement.lang = language();
  languageCode.textContent = language().toUpperCase();
  languageSwitch.title = t('language');
  languageSwitch.setAttribute('aria-label', t('language'));
  legend.title = t('about');
  nearbyLabel.textContent = t('nearbyButton');
  nearbyButton.title = t('nearby');
  tiltButton.title = t('tilt');
  tiltButton.setAttribute('aria-label', t('tilt'));
  followRandomButton.title = t('followRandom');
  followRandomButton.setAttribute('aria-label', t('followRandom'));
  centreButton.title = t('centre');
  centreButton.setAttribute('aria-label', t('centre'));
  creditsButton.title = t('showCredits');
  creditsButton.setAttribute('aria-label', t('showCredits'));
  // MapLibre reads its own strings as it builds each part, and has no way to change them after: the
  // parts it builds from now on read this, and the canvas is relabelled.
  Object.assign(map._locale, { 'Map.Title': t('map') });
  map.getCanvas().setAttribute('aria-label', t('map'));
  // The basemap can relabel itself once its style has loaded, and loads in the language set by then.
  styleLoaded.then(() => map.setGlobalStateProperty('language', language()));
  showLegend();
  showBanner();
  showCredits();
  showPanel();
}

/**
 * Fills the legend, in the viewer's language: how many Trains on the map are Live and how many
 * Scheduled, once their Trips have come, beside the markers they're drawn with, and that it opens About.
 */
function showLegend() {
  const [live, scheduled] = counts ? trainCounts(...counts) : [t('live'), t('scheduled')];
  legend.replaceChildren(
    el('span', { className: 'marker live' }),
    el('span', { className: 'caps' }, ...bold(live, counts ? String(counts[0]) : '')),
    el('span', { className: 'marker scheduled' }),
    el('span', { className: 'caps' }, ...bold(scheduled, counts ? String(counts[1]) : '')),
    icon('info'),
    el('span', { className: 'sr-only', textContent: `. ${t('about')}` }),
  );
}

/** Counts the Trains on the map for the legend, every one and not only those in view, Live and Scheduled. */
function showCount(features: GeoJSON.Feature[]) {
  countShown = performance.now();
  const live = features.filter((f) => f.properties?.live).length;
  counts = [live, features.length - live];
  showLegend();
}

/** Follows a Train picked at random but for the one the map follows: a Live one in view, else a Live one anywhere on the map, else any. */
function followRandom() {
  const followed = followedId();
  const others = (bundle ? trainsAt(bundle, Date.now(), received, hidingClosures) : []).filter((t) => t.trip.id !== followed);
  const live = others.filter((t) => t.live);
  // ponytail: in view by the map's bounds, which take in what's under the panel too, and on a rotated
  // map the corners around the view. Test where each Train is on screen above the panel, as
  // keepInView() does, if picks out of sight ever show.
  const bounds = map.getBounds();
  const pool = [live.filter((t) => bounds.contains([t.lon, t.lat])), live, others].find((p) => p.length) ?? [];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick) follow(pick.trip.id);
}

/** Follows a Trip's Train, by its ID in the days on the map: brings it into view, beside the panel, and keeps it there. */
function follow(id: string, up = false) {
  const [, day, trip] = /^(\d{4}-\d{2}-\d{2})\/(.*)$/.exec(id) ?? [];
  following = day && trip ? { day, trip } : { day: bundle?.serviceDay ?? '', trip: id };
  // A Train followed again, by a tap on it too, is taken back (#325).
  released = undefined;
  [boardPlace, nearMe, back] = [undefined, undefined, undefined];
  trainSource?.setData(trains());
  openPanel(up);
  writeLink();
  if (following.at) easeOnto(following.at);
  // A Trip still to come, its Train not on the map yet: to its first Station, which it leaves from (#322).
  else if (waiting) {
    const at = startOf();
    if (at) easeOnto(at);
  }
}

/** The Station a Trip still to come leaves from, where the map eases onto (#322). */
function startOf(): Point | undefined {
  const first = bundle?.trips.find((t) => t.id === followedId())?.calls[0]?.station;
  const at = shownStations?.find((s) => s.id === first);
  return at && [at.lon, at.lat];
}

/** What the panel shows now, to go Back to (#322): none while it shows no Train, board or Nearby that's found the viewer. */
function here(): NonNullable<typeof back> | undefined {
  const [up, scroll] = [pulledUp, panel.querySelector('.sheet-body')?.scrollTop ?? 0];
  if (following) return { to: 'train', day: following.day, trip: following.trip, headsign: bundle?.trips.find((t) => t.id === followedId())?.headsign ?? '', up, scroll };
  if (boardPlace) return { to: 'board', place: boardPlace, up, scroll };
  return nearMe && typeof nearMe !== 'string' ? { to: 'nearby', near: nearMe, up, scroll } : undefined;
}

/** Opens another panel from this one, by a departure or a Station, which has a Back to this one (#322). */
function openFrom(open: () => void, at?: Point) {
  const [was, keyboard] = [here(), panel.contains(document.activeElement)];
  open();
  back = was;
  showPanel();
  // The Back row makes the header taller, so the map's padding and where it eases to are worked out again.
  const to = at ?? following?.at ?? (waiting ? startOf() : undefined);
  if (to) easeOnto(to);
  else map.easeTo({ padding: panelPadding() });
  if (keyboard) focusTitle();
}

/** Puts the keyboard's focus on the panel's title, where the button it was on has gone with the panel it opened (#322), as Nearby's does after a Try again. */
function focusTitle() {
  panel.querySelector<HTMLElement>('.title')?.focus();
}

/** Goes back to the panel this one was opened from, as it was (#322): a Train is followed again and the map eases onto it, a board or Nearby leaves the map where it is. */
function goBack() {
  const [to, keyboard] = [back, panel.contains(document.activeElement)];
  if (!to) return;
  if (to.to === 'train') follow(`${to.day}/${to.trip}`, to.up);
  else {
    [following, boardPlace, nearMe, back] = [undefined, to.to === 'board' ? to.place : undefined, to.to === 'nearby' ? to.near : undefined, undefined];
    trainSource?.setData(trains());
    openPanel(to.up);
    writeLink();
    map.easeTo({ padding: panelPadding() });
  }
  panel.querySelector('.sheet-body')?.scrollTo(0, to.scroll);
  if (keyboard) focusTitle();
}

/** Brings `at` into the middle of the map beside the panel, at zoom 13, or closer if the map already is: a Train the map follows, or a Station whose link names no view (#292). */
function easeOnto(at: Point) {
  map.easeTo({ center: at, zoom: Math.max(map.getZoom(), 13), padding: panelPadding() });
}

/** Shows a place's board, by its ID in places(), following no Train. */
function showBoard(place: string) {
  [following, boardPlace, nearMe, back] = [undefined, place, undefined, undefined];
  trainSource?.setData(trains());
  openPanel(false);
  writeLink();
  map.easeTo({ padding: panelPadding() });
}

/**
 * Shows the viewer's nearby Trains, following no Train, once the browser says where they are. Where
 * it won't, as when they decline, the panel says so, and the rest of the map carries on. The map
 * stays where it is: the basemap's tiles for where they are would tell OpenFreeMap.
 */
function showNearby() {
  [following, boardPlace, nearMe, back] = [undefined, undefined, 'locating', undefined];
  trainSource?.setData(trains());
  openPanel(true);
  writeLink();
  map.easeTo({ padding: panelPadding() });
  locate();
}

/** Nearby's Try again: asks the browser again where the viewer is, as Nearby's button does, saying meanwhile that it's finding out, under which the button stays, and the keyboard's focus on it (#324). */
function askAgain() {
  nearMe = 'retrying';
  showPanel();
  locate();
}

/**
 * Asks the browser where the viewer is, for their nearby Trains. A position or failure that comes
 * after the viewer has moved on to something else, or asked again, is dropped. A failure shows half
 * a second after asking at the soonest: a refusal can come straight back, and the panel would say
 * what it said before, too soon for the eye or a screen reader to tell that the browser was asked (#324).
 */
function locate() {
  const [asked, ask] = [performance.now(), ++asks];
  const found = (where: Point | Unlocated) => {
    if (!nearMe || ask !== asks) return;
    const focused = document.activeElement;
    nearMe = where;
    showPanel();
    // A try that finds the viewer takes Try again away, and with it the keyboard's focus, which goes to the panel's title rather than the page.
    if (focused?.isConnected === false) panel.querySelector<HTMLElement>('.title')?.focus();
    map.easeTo({ padding: panelPadding() });
  };
  const failed = (why: Unlocated) => setTimeout(() => found(why), asked + 500 - performance.now());
  // Some browsers have no geolocation at all, as over plain http.
  if (!('geolocation' in navigator)) return failed('unsupported');
  // A refusal is told from a timeout or no fix by its error's code alone.
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => found([coords.longitude, coords.latitude]),
    (error) => failed(error.code === error.PERMISSION_DENIED ? 'refused' : 'failed'),
    { maximumAge: 60_000, timeout: 30_000 },
  );
}

/** Stops following a Train, or closes a Station's board or the nearby Trains. */
function closePanel() {
  [following, boardPlace, nearMe, back] = [undefined, undefined, undefined, undefined];
  showPanel();
  writeLink();
  map.easeTo({ padding: panelPadding() });
}

/** Shows the panel afresh: a followed Train and a board peeking on a phone, Nearby pulled up, with its body scrolled to the top (#321), and the Stations a followed Train has left folded away (#349), and its Alerts (#342). */
function openPanel(up: boolean) {
  [pulledUp, showPast, showAlerts] = [up, false, false];
  panel.classList.remove('sliding');
  panel.style.height = '';
  showPanel();
  panel.querySelector('.sheet-body')?.scrollTo(0, 0);
}

/**
 * Opens what the page's link names besides the view: a point to ring (#254), a Station's board, or
 * once its Trips have come, a Train to follow, which the map stops following straight away if it's
 * no longer running. A Station the map doesn't know goes from the link. Where the link names no
 * view, the map goes to the Station, by follow()'s rule (#292).
 */
function openLink() {
  showMark(markOf(openedLink));
  const link = new URLSearchParams(openedLink.slice(1));
  const [station, train] = [link.get('station'), link.get('train')];
  const place = station && [...shownPlaces.values()].find((p) => p.stations.includes(station));
  if (place) {
    showBoard(place.id);
    // ponytail: eased before the board's departures come on a page just opened, so on a phone the
    // Station then sits just above the board, not mid-way above it; ease again as they come if that
    // shows. A `map=` MapLibre won't open (zoom 99) counts as a view too, so the board opens over
    // Barcelona; check it as MapLibre's Hash does if such links show.
    if (!link.has('map')) easeOnto([place.lon, place.lat]);
  } else if (station) writeLink();
  // Trips that fail to come are logged where show() gets them.
  else if (train) needed.days.then(() => follow(train), () => {});
}

/**
 * Puts what the panel shows in the page's link, beside the view, so that sharing the page shares it:
 * `train=<service day>/<Trip>`, the Train by its service day and its Trip as its operator names it,
 * whose ID leads with its Network, or `station=<Station>`, one of the place's Stations, which opens the
 * place's board. It keeps the link's `mark=` while the map rings its point, and drops it while the
 * map rings none, as after a tap (#254). Written as MapLibre writes the view, which undoes any
 * escaping each time it does.
 * ponytail: so an ID with `&`, `=`, `#`, `+` or `%` in it would break its link. None has one yet
 * (only `:._|@-`); escape them both ways, instead of MapLibre's hash, if an operator's ever does.
 */
function writeLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  params.delete('train');
  params.delete('station');
  if (!marked) params.delete('mark');
  if (following) params.set('train', `${following.day}/${following.trip}`);
  const station = boardPlace && shownPlaces.get(boardPlace)?.stations[0];
  if (station) params.set('station', station);
  history.replaceState(history.state, '', `#${decodeURIComponent(params.toString())}`);
}

/** Rings a point on the map, or none (#254). */
function showMark(at: Point | undefined) {
  marked = at;
  map.getSource<GeoJSONSource>('mark')?.setData({ type: 'FeatureCollection', features: at ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: at }, properties: {} }] : [] });
}

/** The Train the map follows, by its day and Trip, to tell it from another. */
function followKey(): string | undefined {
  return following && `${following.day}/${following.trip}`;
}

/** The ID of the Trip the map follows in the days on the map, which lead an earlier day's Trips with that day (joinDays()). */
function followedId(): string | undefined {
  if (!following || !bundle) return undefined;
  return following.day === bundle.serviceDay ? following.trip : `${following.day}/${following.trip}`;
}

/** Whether the map has let go of the Train it follows, which a drag or an arrow key does, so that it's no more kept in the middle (#325). */
function letGo() {
  return !!following && released === followKey();
}
for (const type of ['dragstart', 'movestart'] as const) {
  map.on(type, (e) => {
    if (following && !lessMotion.matches && letsGo(e)) released = followKey();
  });
}
/** Shows the Centre button while the map has let go, and has the wheel and a pinch zoom about the middle while it pans with the Train, where the Train is (#325). */
function showCentring() {
  centreButton.hidden = lessMotion.matches || !letGo();
  const now = !lessMotion.matches && !!following?.at && !letGo();
  if (now === centring) return;
  centring = now;
  for (const handler of [map.scrollZoom, map.touchZoomRotate]) {
    handler.disable();
    handler.enable(now ? { around: 'center' } : undefined);
  }
}

/** Takes the Train the map follows back, easing onto it, and the map pans with it again (#325). */
function centre() {
  released = undefined;
  if (following?.at) map.easeTo({ center: following.at, padding: panelPadding() });
  showCentring();
}

/**
 * Jumps the map to the Train it follows, in the middle of the map beside the panel, once it's a quarter
 * pixel off it, at the viewer's zoom and bearing (#325). Not while the map moves, as jumpTo() would stop
 * it, so it never fights the viewer's hand or an ease.
 */
function centreOn(at: Point) {
  if (map.isMoving()) return;
  const [from, to] = [map.project(map.getCenter()), map.project(at)];
  if (drifted(to.x - from.x, to.y - from.y)) map.jumpTo({ center: at });
}

/**
 * Brings the Train the map follows back into view where it's about to leave it, or the viewer has
 * moved the map off it: where it's outside the middle 60% of the map beside the panel. Not while the
 * map moves, so it never fights the viewer's hand.
 */
function keepInView(at: Point) {
  if (map.isMoving()) return;
  const { x, y } = map.project(at);
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const padding = panelPadding();
  const outside = (v: number, from: number, to: number) => v < from + 0.2 * (to - from) || v > from + 0.8 * (to - from);
  if (outside(x, padding.left, width - padding.right) || outside(y, padding.top, height - padding.bottom)) map.easeTo({ center: at, duration: 1000, padding });
}

/**
 * The map's padding that keeps its middle clear of the panel, which grows and shrinks with what it
 * shows: on a phone, the sheet's top edge, as it's drawn or `height` px high; on a wide window, the
 * card's right edge (#321). None while the panel is closed.
 */
function panelPadding(height?: number) {
  const padding = { top: 0, right: 0, bottom: 0, left: 0 };
  if (panel.hidden) return padding;
  const [box, mapBox] = [panel.getBoundingClientRect(), map.getContainer().getBoundingClientRect()];
  return wide.matches ? { ...padding, left: box.right - mapBox.left } : { ...padding, bottom: mapBox.bottom - box.bottom + (height ?? box.height) };
}

/** What the panel shows: its header, which stays put on a phone, and its body, which scrolls under it. */
interface Panel {
  header: HTMLElement;
  body: Node[];
}

/**
 * Fills the panel, in the viewer's language, with the Train the map follows, the Station board it
 * shows, or the viewer's nearby Trains: on a phone pulled up, as `up` says, or peeking. Hides it while
 * there's none. It changes in place, so that its refresh every second never takes the keyboard's
 * focus or a screen reader's place (patch()).
 */
function showPanel(up = wide.matches || pulledUp || dragging) {
  panelShown = performance.now();
  const shown = following ? followedPanel(up) : boardPlace ? boardPanel(boardPlace, up) : nearMe ? nearbyPanel(nearMe, up) : undefined;
  panel.hidden = !shown;
  panel.classList.toggle('up', up);
  patch(panel, shown ? [el('div', { className: 'sheet-top' }, handle(up), shown.header), el('div', { className: 'sheet-body' }, ...shown.body)] : []);
  // Where the Train followed has changed, so that the Centre button doesn't wait for the next draw.
  showCentring();
}

/** Shows what the panel shows pulled up, or peeking, and gives how high it is then, in px. */
function measurePanel(up: boolean): number {
  panel.style.height = '';
  showPanel(up);
  return panel.offsetHeight;
}

/** Pulls the sheet up on a phone, or lets it down to peek, easing it there from `from` px high, and the map's padding with it. */
function setPulledUp(up: boolean, from = panel.offsetHeight) {
  pulledUp = up;
  showPanel();
  map.easeTo({ padding: panelPadding(slide(panel, from)) });
}

/** Eases a sheet from `from` px high to the height it takes now, unless the viewer prefers less motion, and gives that height. */
function slide(sheet: HTMLElement, from: number): number {
  sheet.classList.remove('sliding');
  sheet.style.height = '';
  const to = sheet.offsetHeight;
  if (lessMotion.matches || Math.abs(to - from) < 1) return to;
  sheet.style.height = `${from}px`;
  // Laid out at `from` first, so that it eases from there.
  void sheet.offsetHeight;
  sheet.classList.add('sliding');
  sheet.style.height = `${to}px`;
  const done = (e: TransitionEvent) => {
    if (e.target !== sheet) return;
    sheet.removeEventListener('transitionend', done);
    sheet.classList.remove('sliding');
    sheet.style.height = '';
  };
  sheet.addEventListener('transitionend', done);
  return to;
}

/**
 * Lets a finger drag a sheet on a phone by its top, its handle and its header, between the heights
 * `range` gives as the drag starts, if it can be dragged then; on release, `release` is told whether
 * it's nearer the higher, and how high it was let go. A finger that moves less than SLOP taps, and
 * the click a drag ends in is dropped, but not a key's.
 */
function grab(sheet: HTMLElement, range: () => [low: number, high: number] | undefined, release: (high: boolean, at: number) => void) {
  let held: { id: number; y: number; height: number; range?: [number, number] } | undefined;
  let dragged = false;
  sheet.addEventListener('pointerdown', (e) => {
    dragged = false;
    if (e.isPrimary && e.target instanceof Element && e.target.closest('.sheet-top')) held = { id: e.pointerId, y: e.clientY, height: sheet.offsetHeight };
  });
  sheet.addEventListener('pointermove', (e) => {
    if (held?.id !== e.pointerId) return;
    if (!held.range) {
      if (Math.abs(e.clientY - held.y) < SLOP) return;
      held.range = range();
      if (!held.range) return void (held = undefined);
      dragged = true;
      sheet.setPointerCapture(e.pointerId);
    }
    const [low, high] = held.range;
    sheet.style.height = `${Math.min(high, Math.max(low, held.height + held.y - e.clientY))}px`;
  });
  const letGo = (e: PointerEvent) => {
    if (held?.id !== e.pointerId) return;
    const { range: [low, high] = [NaN, NaN] } = held;
    held = undefined;
    const at = sheet.offsetHeight;
    if (!Number.isNaN(low)) release(high - at < at - low, at);
  };
  sheet.addEventListener('pointerup', letGo);
  sheet.addEventListener('pointercancel', letGo);
  sheet.addEventListener(
    'click',
    (e) => {
      if (dragged && e.detail) {
        e.stopPropagation();
        e.preventDefault();
      }
      dragged = false;
    },
    true,
  );
}

/** The sheet's handle on a phone: a button that pulls it up or lets it down, which a finger can drag too (grab()). */
function handle(up: boolean) {
  const button = el('button', { type: 'button', className: 'handle', onclick: () => setPulledUp(!pulledUp) }, el('span'));
  button.setAttribute('aria-expanded', String(up));
  button.setAttribute('aria-label', t(up ? 'showLess' : 'showMore'));
  return button;
}

/** The button a peeking sheet ends in, saying how much more it has, which pulls it up. */
function moreButton(text: string) {
  const pullUp = () => {
    setPulledUp(true);
    // It goes as the sheet's pulled up, so the keyboard's focus goes to the handle, which lets it down again.
    panel.querySelector<HTMLElement>('.handle')?.focus();
  };
  const button = el('button', { type: 'button', className: 'more', onclick: pullUp }, el('span', { textContent: text }), icon('up'));
  button.setAttribute('aria-expanded', 'false');
  return button;
}

/**
 * The followed Train's panel: its Line's pill and where it's headed; Live or Scheduled, how long ago
 * live data last placed it, its modelled speed, and its Unit type where its operator reports one; its
 * next Station, when it's expected there, with its Delay but for a Metro Train's, and the minutes to
 * it; how far along its Trip it is; and its Line's Alerts, folded away (#342). Peeking, it ends in how
 * many Stations it has still to come; pulled up, it shows them, from the Train to its Trip's last
 * Station (#321), after a fold that shows those it has left (#349).
 */
function followedPanel(up: boolean): Panel | undefined {
  const now = Date.now();
  waiting = false;
  const train = bundle && trainAt(bundle, now, received, followedId() ?? '', hidingClosures);
  // Its Trip still to come, where its Train isn't on the map yet (#322).
  const coming = bundle && !train ? comingAt(bundle, now, received, followedId() ?? '') : undefined;
  waiting = !!coming;
  if (coming) return comingPanel(coming, up, now);
  if (!train) return undefined;
  const { trip, live, unreported, since, speed, unitType, upcoming } = train;
  const last = upcoming.at(-1);
  const status: (Node | string)[] = [t(live ? 'live' : 'scheduled')];
  if (unreported) status.push(t('noLiveTrain'));
  else if (since !== undefined) status.push(t(live ? 'confirmed' : 'lastConfirmed').replace('{ago}', ago(since)));
  status.push(el('span', {}, el('span', { className: 'sr-only', textContent: `${t('speed')} ` }), `~${Math.round(speed * 3.6)} km/h`));
  if (unitType) status.push(`${t('unit')} ${unitType}`);
  return {
    header: el('header', {}, ...backButton(), el('h2', { className: 'title', tabIndex: -1 }, pill(trip.line, { live, train: true }), ` ${trip.headsign}`), closeButton(t('stopFollowing'))),
    body: [
      el('p', { className: 'meta status-line' }, el('span', { className: `dot ${live ? 'live' : 'scheduled'}` }), ...status.flatMap((part, i) => (i ? [' · ', part] : [part]))),
      ...nextStation(train, now),
      tripBar(train),
      alertsOn({ lines: [trip.line], stations: [] }),
      ...(up
        ? [el('hr', { className: 'dash' }), ...strip(train)]
        : last && upcoming.length > 1
          ? [moreButton(moreStations(upcoming.length - 1, trip.headsign, clock().format(last.arrival)))]
          : []),
    ],
  };
}

/**
 * The panel of a Trip still to come (#322), as a Train comes onto the map only seconds before it
 * leaves: where and when it leaves, and its Stations, as the followed Train's have them.
 */
function comingPanel({ trip, live, delay, upcoming }: Coming, up: boolean, now: number): Panel {
  const [first, last] = [upcoming[0], upcoming.at(-1)];
  const leaves = first && t('leavesAt').replace('{station}', stationName(first.station)).replace('{time}', clock().format(first.departure));
  return {
    header: el('header', {}, ...backButton(), el('h2', { className: 'title', tabIndex: -1 }, pill(trip.line, { live, train: true }), ` ${trip.headsign}`), closeButton(t('stopFollowing'))),
    body: [
      el('p', { className: 'meta status-line' }, el('span', { className: `dot ${live ? 'live' : 'scheduled'}` }), leaves ?? '', ...(first ? countdown(first.departure, now, 'inMinutes').flatMap((n) => [' · ', n]) : [])),
      ...nextStation({ upcoming, standsAt: undefined, delay, live }, now),
      alertsOn({ lines: [trip.line], stations: [] }),
      ...(up ? [el('hr', { className: 'dash' }), ...strip({ trip, upcoming, standsAt: undefined })] : last && upcoming.length > 1 ? [moreButton(moreStations(upcoming.length - 1, trip.headsign, clock().format(last.arrival)))] : []),
    ],
  };
}

/** The button in a header that goes Back (#322), naming where it goes: none where there's none, or the Train it would follow has left the map, as within a closed Closure that hides Trains (#345). */
function backButton(): Node[] {
  // ponytail: two engine passes a second while Back goes to a Train; cache the check if a phone shows it.
  if (!back) return [];
  const where = back.to === 'train' ? undefined : back.to === 'board' ? shownPlaces.get(back.place)?.name : t('nearby');
  if (back.to === 'train' ? !(bundle && (trainAt(bundle, Date.now(), received, back.day === bundle.serviceDay ? back.trip : `${back.day}/${back.trip}`, hidingClosures) || comingAt(bundle, Date.now(), received, back.day === bundle.serviceDay ? back.trip : `${back.day}/${back.trip}`))) : !where) return [];
  const label = back.to === 'train' ? t('backToTrain').replace('{headsign}', back.headsign) : t('backTo').replace('{place}', where ?? '');
  return [el('button', { type: 'button', className: 'back', onclick: goBack }, icon('back'), el('span', { textContent: label }))];
}

/** When a followed Train's expected at a Station it has still to come to: at the one it stands at, when it leaves. */
function due(call: Followed['upcoming'][number], standing: boolean): number {
  return standing ? call.departure : call.arrival;
}

/** A followed Train's next Station: its name, when the Train's expected there, with its status beside it, and the minutes to it within the hour. */
function nextStation({ upcoming: [next], standsAt, delay, live }: Pick<Followed, 'upcoming' | 'standsAt' | 'delay' | 'live'>, now: number): Node[] {
  if (!next) return [];
  const at = due(next, !!standsAt);
  return [
    el(
      'div',
      { className: 'next-station' },
      el('div', {}, el('p', { className: 'label', textContent: t('nextStation') }), stationLink(next.station, el('strong', { className: 'next-name', textContent: stationName(next.station) }))),
      el('div', { className: 'next-when' }, el('span', { className: 'at' }, el('time', {}, ...timeOfDay(at)), status({ delay, live })), ...countdown(at, now, 'inMinutes')),
    ),
  ];
}

/** How far a followed Train is along its Trip, as a bar from its first Station to its last, by distance (progress()), with the Trip's length. */
function tripBar({ trip, dist, upcoming }: Followed) {
  const { done, length } = progress(trip.calls, dist, upcoming.length);
  const share = length ? (100 * done) / length : 0;
  const bar = el('div', { className: 'bar' }, el('i'));
  bar.style.setProperty('--done', `${share.toFixed(1)}%`);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuenow', String(Math.round(share)));
  bar.setAttribute('aria-valuetext', `${kilometres(done)} / ${kilometres(length)} km`);
  const shown = el(
    'div',
    { className: 'progress' },
    bar,
    el('div', { className: 'ends' }, el('span', { textContent: stationName(trip.calls[0]?.station ?? '') }), el('span', { textContent: `${trip.headsign}, ${kilometres(length)} km` })),
  );
  shown.style.setProperty('--line', lines.get(trip.line)?.colour ?? '');
  return shown;
}

/**
 * The Stations a followed Train has still to come to, as a strip in its Line's colour: from the
 * Train, now, which has left the Station before them or stands at the first, to its Trip's last
 * Station, where the strip ends in a bar across it, as the operators' maps end a Line. The next and
 * the last are in bold. Once it has left a Station, the fold before the strip (foldButton()) shows
 * those it has already left at its top, greyed, by name only, as the map has no time it passed them
 * but its timetable's, and the Train then as a compact mark after them (#349).
 */
function strip({ trip, upcoming, standsAt }: Pick<Followed, 'trip' | 'upcoming' | 'standsAt'>): Node[] {
  // How many Stations it has already left, and the last of them, before those it has still to leave.
  const earlier = trip.calls.length - upcoming.length;
  const lastLeft = trip.calls[earlier - 1];
  const past = earlier > 0 && showPast;
  const station = (className: string, time: (Node | string)[], ...name: (Node | string)[]) => el('li', { className }, el('time', {}, ...time), el('span', { className: 'mark' }), el('span', {}, ...name));
  const list = el(
    'ol',
    { className: past ? 'strip past' : 'strip' },
    ...(past ? trip.calls.slice(0, earlier).map((call, i) => station(i ? 'passed soft' : 'passed soft origin', [], stationName(call.station), el('span', { className: 'sr-only', textContent: `, ${t('passed')}` }))) : []),
    ...(lastLeft && !standsAt ? [past ? station('train soft compact', [t('now')]) : station('train soft', [t('now')], t('left').replace('{station}', stationName(lastLeft.station)))] : []),
    ...upcoming.map((call, i) =>
      station([i === 0 && standsAt ? 'train' : '', i === 0 ? 'next' : '', i === upcoming.length - 1 ? 'terminus' : ''].filter(Boolean).join(' '), timeOfDay(due(call, i === 0 && !!standsAt)), stationLink(call.station, stationName(call.station))),
    ),
  );
  list.setAttribute('aria-label', t(past ? 'stations' : 'nextStations'));
  list.style.setProperty('--line', lines.get(trip.line)?.colour ?? '');
  // The fold before the strip: how many Stations it has already left, outside the strip's list, so that
  // a screen reader doesn't count it as a Station. It's there from the start, hidden until the Train has left one.
  const fold = foldButton([earlierStations(earlier, showPast)], showPast, () => (showPast = !showPast));
  fold.hidden = !earlier;
  return [fold, list];
}

/**
 * A Station a followed Train has still to come to, as a button that opens its place's board (#322),
 * the map no longer following the Train and easing onto the Station (easeOnto()): its `name` as
 * it's written there, or just that where no place on the map has it.
 */
function stationLink(station: string, name: Node | string) {
  const place = placeOfStation.get(station);
  if (!place) return el('span', {}, name);
  const open = () => openFrom(() => showBoard(place.id), [place.lon, place.lat]);
  return el('button', { type: 'button', className: 'station-link', onclick: open }, name);
}

/**
 * A fold, the whole row a button: what it folds away, as `says` words it, which it shows, and once
 * shown hides, as `open` says and `toggle` turns it, in a variable that keeps it through the panel's
 * refresh (#349). It stays put as it opens and closes, so that the refresh never takes the keyboard's
 * focus or a screen reader's place (patch()). A peeking sheet grows and shrinks with it, and the map's
 * padding with the sheet; or else what `after` shows again with it, as a tap's popup (#341).
 */
function foldButton(says: (Node | string)[], open: boolean, toggle: () => void, after: () => void = () => map.easeTo({ padding: panelPadding() })) {
  const onclick = () => {
    toggle();
    showPanel();
    after();
  };
  const button = el('button', { type: 'button', className: 'fold', onclick }, el('span', {}, ...says, icon(open ? 'up' : 'chevron')));
  button.setAttribute('aria-expanded', String(open));
  return button;
}

/**
 * A card's Alerts (cardAlerts()), behind a fold that counts them in words, newest first (#342). Each is
 * in its operator's words: its title, where it has one, and its words, in the viewer's language where its
 * feed has it, else in the feed's own, marked with theirs; then when it began, whose words they are, and
 * their language, where it isn't the viewer's (ADR-0012). Over them, when they were read, where that's
 * long ago. It's there from the start, hidden while there's none, and its list is there while it's
 * folded away, so that a new Alert never takes the keyboard's focus or a screen reader's place.
 */
function alertsOn(on: { lines: string[]; stations: string[] }, open = showAlerts, toggle = () => (showAlerts = !showAlerts), after?: () => void) {
  const now = mapTime(Date.now(), received);
  const { alerts: shown, asOf } = cardAlerts(alerts, on, language(), now);
  return el(
    'div',
    { className: 'alerts', hidden: !shown.length },
    foldButton([icon('warning'), alertCount(shown.length)], open, toggle, after),
    el('div', { hidden: !open }, readAt(asOf, now), el('ol', {}, ...shown.map((alert) => alertRow(alert, on.lines.length > 1)))),
  );
}

/** When the Alerts a card or a tap shows were read, where that's long ago (cardAlerts()'s `asOf`), with their day, where they were read on another than the map's: hidden where it isn't. */
function readAt(asOf: number | undefined, now: number) {
  return el('p', { className: 'meta', hidden: asOf === undefined, textContent: asOf === undefined ? '' : t('alertsAsOf').replace('{time}', clock(madridDate(new Date(asOf)) !== madridDate(new Date(now))).format(asOf)) });
}

/** What a tap on Lines' strokes shows (#193): the Lines drawn there, by their pills, and their Alerts under them, folded away (alertsOn(), #341); or none, where it names no Line on the map. */
function linesTapped(named: string[]) {
  tappedLines = { lines: named.filter((id) => lines.has(id)), open: false };
  showTapped();
  return tappedLines.lines.length ? tappedBox : undefined;
}

/** Fills the popup of the Lines a tap names, as it opens, and again as its fold turns, in place, fitted again to the room round it. */
function showTapped() {
  const toggle = () => (tappedLines.open = !tappedLines.open);
  const after = () => {
    showTapped();
    fitPopup(linesPopup.getLngLat());
  };
  patch(tappedBox, [el('div', { className: 'pills' }, ...tappedLines.lines.map((id) => pill(id))), alertsOn({ lines: tappedLines.lines, stations: [] }, tappedLines.open, toggle, after)]);
}

/**
 * Fits the tap's popup to the room round the point it points from, `at`, and places it there again
 * where it's open (#341): GUTTER in from the map's sides, and as far from the corners' cards over the
 * map's top, the buttons riding on the sheet over its bottom, and on a wide window the panel's card at
 * its left, as the map's own padding is (panelPadding()). MapLibre puts it above the point, or below or
 * beside it where it doesn't fit, by those insets (`padding`), and popupRoom() keeps it small enough
 * for one of those to fit: no wider than its most width, nor higher than `--popup-room` in the CSS.
 */
function fitPopup(at: LngLat) {
  const box = map.getContainer().getBoundingClientRect();
  const inset = {
    top: Math.max(box.top, ...[legend, banner, languageChip].map((card) => card.getBoundingClientRect().bottom)) - box.top + GUTTER,
    bottom: box.bottom - Math.min(box.bottom, riders.getBoundingClientRect().top) + GUTTER,
    left: GUTTER + panelPadding().left,
    right: GUTTER,
  };
  const room = popupRoom(map.project(at), box, inset);
  map.getContainer().style.setProperty('--popup-room', `${room.height}px`);
  linesPopup.setPadding(inset);
  linesPopup.setMaxWidth(`${room.width}px`);
}

/**
 * What a tap on Closures shows (#341), by closureKey(): for each Alert that closes them, its words
 * (cardAlerts()), or for each the timetable's buses do, that buses replace trains between its two
 * Stations, in the interface's words; each under the pills of the Closures' Lines, in the order a board
 * names them, with when it began. Over them, when the Alerts were read, where that's long ago. None,
 * where none of them is shown now.
 */
function closuresTapped(keys: string[]) {
  const now = mapTime(Date.now(), received);
  const rows = new Map<string, { closure: Shown; on: string[] }>();
  for (const closure of shownClosures.filter((c) => keys.includes(closureKey(c)))) {
    const by = closure.alert ? `${closure.alert.feed} ${closure.alert.id}` : closureKey(closure);
    rows.set(by, { closure, on: [...(rows.get(by)?.on ?? []), closure.line] });
  }
  // In the order the days on the map list the Lines, as a board's are (servedBy()), not the feed's.
  const order = [...lines.keys()];
  for (const row of rows.values()) row.on = order.filter((id) => row.on.includes(id));
  const said = [...rows.values()].flatMap(({ closure: { alert, stations: [a = '', b = ''], from }, on }): CardAlert[] => {
    if (alert) return cardAlerts(alerts, { lines: on, stations: [] }, language(), now).alerts.filter((c) => c.id === alert.id);
    return [{ id: `${on.join()} ${a} ${b}`, lines: on, description: { language: language(), text: busesReplace(stationName(a), stationName(b)) }, ...(from !== undefined && { from }), by: '' }];
  });
  const { asOf } = cardAlerts(alerts, { lines: [...rows.values()].flatMap(({ closure, on }) => (closure.alert ? on : [])), stations: [] }, language(), now);
  return said.length ? el('div', { className: 'alerts' }, readAt(asOf, now), el('ol', {}, ...said.map((row) => alertRow(row, true)))) : undefined;
}

/**
 * An Alert on a card, as alertsOn() has it, after the Lines it's on as pills, `byLine`, where the card
 * has more than one, as a board can: Rodalies' words don't name theirs. Or a Closure the timetable's
 * buses make, in the interface's words, whose they are unsaid (#341).
 */
function alertRow({ lines: named, header, description, from, by }: CardAlert, byLine: boolean) {
  // In an unknown language, lang="", where its feed doesn't say, rather than the viewer's.
  const words = (tag: 'strong' | 'p', said?: Words) => (said ? [el(tag, { textContent: said.text, lang: said.language ?? '' })] : []);
  const other = description?.language && description.language !== language() ? description.language : undefined;
  const about: (Node | string)[] = [
    ...(from === undefined ? [] : [t('since').replace('{date}', clock(true).format(from))]),
    ...(by ? [by] : []),
    // By its own name, as the language switch names it.
    ...(other ? [el('span', { lang: other, textContent: LANGUAGES[other as Language] ?? other })] : []),
  ];
  return el(
    'li',
    {},
    ...(byLine && named.length ? [el('div', { className: 'served' }, ...named.map((line) => pill(line, { small: true })))] : []),
    ...words('strong', header),
    ...words('p', description),
    el('p', { className: 'meta' }, ...about.flatMap((part, i) => (i ? [' · ', part] : [part]))),
  );
}

/**
 * A place's board: its nameboard, with the Lines that call there; the Alerts on its Stations and on
 * those Lines, folded away (#342); then its next departures from each of its Stations, each with when
 * it's expected to leave, its Train's pill, where it's headed and its status. Peeking, the next PEEK
 * of them, and how many more.
 */
function boardPanel(id: string, up: boolean): Panel | undefined {
  const place = shownPlaces.get(id);
  if (!place) return undefined;
  const now = Date.now();
  const departures = bundle ? boardAt(bundle, now, received, place.stations, hidingClosures) : [];
  // With none left today, the next day's first are to come; refreshDays() runs again within a minute if it's busy now.
  const date = madridDate(new Date(mapTime(now, received)));
  if (bundle && !departures.length && emptyBoard !== date) {
    emptyBoard = date;
    refreshDays();
  }
  const shown = up ? departures : departures.slice(0, PEEK);
  return {
    header: el(
      'header',
      { className: 'nameboard' },
      ...backButton(),
      el('div', {}, el('h2', { className: 'title', textContent: place.name, tabIndex: -1 }), el('div', { className: 'served' }, ...servedBy(place).map((line) => pill(line, { small: true })))),
      closeButton(t('closeBoard')),
    ),
    body: [
      alertsOn({ lines: servedBy(place), stations: place.stations }),
      el('h3', { className: 'label', textContent: t('nextDepartures') }),
      departures.length ? el('ol', { className: 'rows' }, ...shown.map((departure) => departureRow(departure, now))) : el('p', { textContent: t('noDepartures') }),
      ...(shown.length < departures.length ? [moreButton(moreDepartures(departures.length - shown.length))] : []),
    ],
  };
}

/** The Lines whose Trips call at a place, by their IDs, in the order the days on the map list them: for the last place asked about, until the days change. */
function servedBy(place: Place): string[] {
  if (served.place !== place.id || served.days !== bundle) served = { place: place.id, days: bundle, lines: linesCallingAt(bundle?.trips ?? [], place.stations, [...lines.keys()]) };
  return served.lines;
}

/**
 * A departure on a board: when it's expected to leave, with the minutes to go under a time within the
 * hour, its Train's pill, where it's headed, and its status. One Cancelled, or at a Station its Train
 * won't stop at (#346), as one within a closed Closure that hides Trains but for one Live within it (#345), shows when its
 * timetable has it leave, struck through, and says so.
 */
function departureRow({ trip, departure, delay, live, unreported, cancelled, skipped }: Departure, now: number) {
  const off = cancelled ? 'cancelled' : skipped ? 'skipped' : '';
  const cells = [
    el('time', {}, ...timeOfDay(departure), ...(off ? [] : countdown(departure, now, 'minutes'))),
    pill(trip.line, { live, train: true }),
    el('span', { className: 'dest', textContent: trip.headsign }),
    off ? el('span', { className: `status ${off}`, textContent: t(cancelled ? 'cancelled' : 'notStopping') }) : status({ delay, live, unreported }),
  ];
  // A Cancelled one has no Train to follow (#322).
  return el('li', { className: off }, ...(cancelled ? cells : followButton(trip, departure, cells)));
}

/** A row that's a button following a Trip's Train, which a screen reader hears as its Line, where it's headed and when (#322): the cells that are its row, as it spreads them. */
function followButton(trip: Trip, at: number, cells: Node[]) {
  const label = t('followDeparture').replace('{line}', lines.get(trip.line)?.name ?? '').replace('{headsign}', trip.headsign).replace('{time}', clock().format(at));
  const button = el('button', { type: 'button', className: 'row', onclick: () => openFrom(() => follow(trip.id)) }, ...cells);
  // With what the row says at its end, its Delay or that it isn't stopping, which the label would drop.
  const says = cells.at(-1)?.textContent?.trim();
  button.setAttribute('aria-label', says ? `${label}, ${says}` : label);
  return [button];
}

/**
 * What a row says at its end, and the followed Train beside its next time: its Delay as a chip, or
 * no live data, for a Scheduled Train whose Network has live data, or on time, for a Live one;
 * nothing for a Metro Train, which has no Delay to show.
 */
function status({ delay, live, unreported = false }: { delay?: number; live: boolean; unreported?: boolean }) {
  return delayChip(delay) ?? el('span', { className: 'status soft', textContent: unreported ? t('noLiveTrain') : live && delay !== undefined ? t('onTime') : '' });
}

/** The minutes to go until `at`, under a time within the hour, as `phrase` words them, or now. */
function countdown(at: number, now: number, phrase: 'minutes' | 'inMinutes'): Node[] {
  const minutes = minutesTo(at, now);
  return minutes < 60 ? [el('span', { className: 'in', textContent: toGo(minutes, phrase) })] : [];
}

/**
 * The viewer's nearby Trains: a row for each Line and destination that passes within NEARBY of them
 * within SOON, soonest first, with its next Train's pill and its Delay but for a Metro Train's, and
 * its next passes in minutes to go, a Live one's bold (nearbyRows()). Peeking, the first PEEK rows.
 * Until the browser says where the viewer is, what it says instead, and Try again where it follows
 * (unlocated()). What it says first is a status, which a screen reader hears each time it changes, as
 * each try of the browser's ends, and which patch() keeps in place, as it does Try again (#324).
 */
function nearbyPanel(near: Point | Unlocated, up: boolean): Panel {
  // The title takes the keyboard's focus as a Try again gives way to what the try found (locate()).
  const header = el('header', {}, ...backButton(), el('h2', { className: 'title', textContent: t('nearby'), tabIndex: -1 }), closeButton(t('closeNearby')));
  const said = el('div');
  said.setAttribute('role', 'status');
  if (typeof near === 'string') {
    const { says, tryAgain } = unlocated(near);
    said.append(...says.map((line) => el('p', { textContent: line })));
    return { header, body: [said, ...(tryAgain ? [el('button', { type: 'button', className: 'card try-again', onclick: askAgain }, tryAgain)] : [])] };
  }
  const now = Date.now();
  const rows = nearbyRows(bundle ? nearbyAt(bundle, now, received, near, NEARBY, SOON, hidingClosures) : [], now);
  said.append(el('p', { className: 'subtitle', textContent: t('passingNearby') }));
  // Where no Train passes, saying so is what a try found too, so the status says it, for a screen reader to
  // hear; but only once the Trips have come, which can be after the viewer is found, as the map can't tell before.
  // ponytail: a screen reader hears the status again whenever a refresh empties the list, and maybe its
  // heading alone as the list fills; keep the status to what the try found if that's too chatty.
  if (!rows.length) {
    if (bundle) said.append(el('p', { textContent: t('noneNearby') }));
    return { header, body: [said] };
  }
  return {
    header,
    body: [
      said,
      el(
        'ol',
        { className: 'rows groups' },
        ...(up ? rows : rows.slice(0, PEEK)).map(({ next, passes }) =>
          el(
            'li',
            {},
            // Each row follows its next Train, the one its pill and Delay belong to (#322).
            ...followButton(next.trip, next.at, [
              pill(next.trip.line, { live: next.live, train: true }),
              el('span', { className: 'dest', textContent: next.trip.headsign }),
              el(
                'span',
                { className: 'when' },
                el(
                  'span',
                  { className: 'times' },
                  // now · 3 · 9 min
                  ...passes.flatMap(({ minutes, live }, i) => [
                    ...(i ? [' · '] : []),
                    el('span', { className: live ? 'live' : 'soft', textContent: i === passes.length - 1 ? toGo(minutes, 'minutes') : minutes ? String(minutes) : t('now') }),
                  ]),
                ),
                delayChip(next.delay) ?? '',
              ),
            ]),
          ),
        ),
      ),
    ],
  };
}

/**
 * Makes `parent`'s children like `children`, keeping each of its elements that's still the same tag
 * in the same place, with its attributes, what a click on it does and its text brought up to date,
 * and replacing the rest. So the panel's refresh every second never takes the keyboard's focus or a
 * screen reader's place, nor a scrolled body's scroll (#321).
 * ponytail: by place, not by what each shows, so a focused row stays focused as the rows move up
 * under it. Key the rows by their Trip if a refresh ever moves a viewer's place off their Train.
 */
function patch(parent: Element, children: Node[]) {
  children.forEach((child, i) => {
    const old = parent.childNodes[i];
    if (!old) parent.append(child);
    else if (old.nodeName !== child.nodeName) old.replaceWith(child);
    else if (old instanceof Element && child instanceof Element) {
      for (const { name } of [...old.attributes]) if (!child.hasAttribute(name)) old.removeAttribute(name);
      for (const { name, value } of [...child.attributes]) if (old.getAttribute(name) !== value) old.setAttribute(name, value);
      if (old instanceof HTMLElement && child instanceof HTMLElement) old.onclick = child.onclick;
      patch(old, [...child.childNodes]);
    } else if (old.nodeValue !== child.nodeValue) old.nodeValue = child.nodeValue;
  });
  while (parent.childNodes.length > children.length) parent.lastChild?.remove();
}

/** An element, with its properties and what goes in it. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** One of the cards' icons, which a screen reader leaves out, hearing its button's label. */
function icon(name: keyof typeof ICONS) {
  const span = el('span', { className: 'icon', innerHTML: ICONS[name] });
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/** A text with a part of it in bold, the first time it's there: a count, or a Network's name. */
function bold(text: string, part: string): (Node | string)[] {
  const at = part ? text.indexOf(part) : -1;
  return at < 0 ? [text] : [text.slice(0, at), el('b', { textContent: part }), text.slice(at + part.length)];
}

/** A card's button that closes it, or does what `onclick` does. */
function closeButton(label: string, onclick = closePanel) {
  const close = el('button', { type: 'button', className: 'close', title: label, onclick }, icon('close'));
  close.setAttribute('aria-label', label);
  return close;
}

/**
 * A Line's name as its Trains' pill on the map, outlined by its kind of service (pillOf()): filled
 * with its colour and lettered as on the map, or for a Scheduled Train ringed in it and lettered in
 * it, as it reads on the card (lettering()). A Train's tells a screen reader which it is too, as its
 * fill says it. A pill naming a Line, not a Train, is filled, as operators' badges are.
 */
function pill(id: string, { live = true, train = false, small = false } = {}) {
  const [line, drawn] = [lines.get(id), pills.get(id)];
  const name = el('span', { className: `pill ${drawn?.outline ?? 'round'} ${live ? 'live' : 'scheduled'}${small ? ' small' : ''}`, textContent: line?.name ?? '' });
  if (line) {
    name.style.setProperty('--line', line.colour);
    name.style.setProperty('--lettering', live ? (drawn?.dark ? INK : '#fff') : lettering(line.colour, cardColour));
  }
  if (train) name.append(el('span', { className: 'sr-only', textContent: `, ${t(live ? 'live' : 'scheduled')}` }));
  return name;
}

/** A Delay as a chip, +16 min, amber when late, which a screen reader reads as late or early: none under half a minute, or for a Train with no Delay to show, as a Metro Train. */
function delayChip(delay: number | undefined) {
  const minutes = Math.round(Math.abs(delay ?? 0) / 60);
  if (!minutes || delay === undefined) return undefined;
  const late = delay > 0;
  const shown = el('span', { textContent: `${late ? '+' : '−'}${minutes} min` });
  shown.setAttribute('aria-hidden', 'true');
  return el('span', { className: `delay ${late ? 'late' : 'early'}` }, shown, el('span', { className: 'sr-only', textContent: t(late ? 'late' : 'early').replace('{n}', String(minutes)) }));
}

/** A time of day as the viewer's language writes it, in Barcelona, with its AM or PM, where it has one, small. */
function timeOfDay(ms: number): (Node | string)[] {
  const parts = clock().formatToParts(ms);
  const at = parts.findIndex((p) => p.type === 'dayPeriod');
  const text = (from: number, to?: number) => parts.slice(from, to).map((p) => p.value).join('');
  return at < 0 ? [text(0)] : [text(0, at).trimEnd(), el('small', { textContent: parts[at]?.value ?? '' }), text(at + 1)];
}

/** A Station's name, by its ID, as the days on the map have it. */
function stationName(station: string): string {
  return stationNames.get(station) ?? station;
}

/** A length in metres, in km to a tenth, as the viewer's language writes numbers. */
function kilometres(metres: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(metres / 1000);
}

/** Formats times of day as the viewer's language does, in Barcelona, after their day where `day` says. */
function clock(day = false) {
  return new Intl.DateTimeFormat(locale(), { dateStyle: day ? 'medium' : undefined, timeStyle: 'short', timeZone: 'Europe/Madrid' });
}

/** How long a number of ms is, to the second under a minute and to the minute after. */
function ago(ms: number): string {
  return ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`;
}

/**
 * Names each Network whose live data is unavailable while its Trains are in view, or the map follows
 * one of them, in the viewer's language (bannerNetworks()), each in a pill of its own. Once the map
 * has looked EMPTY_POLLS times and never got a snapshot, it says live data is unavailable instead,
 * naming no Network. Names too each Network with no Trips today while its track is in view (#226).
 * Hides the banner while there's none of these.
 */
function showBanner() {
  const neverLive = !received.length && emptyPolls >= EMPTY_POLLS;
  const rows: (Node | string)[][] = [
    ...(neverLive ? [[t('noLive')]] : credited.filter((n) => bannerIds.unavailable.includes(n.id)).map((n) => bold(liveUnavailable(n.name), n.name))),
    ...credited.filter((n) => bannerIds.noTrips.includes(n.id)).map((n) => [el('b', { textContent: n.name }), `: ${t('noTimetable')}`]),
  ];
  banner.hidden = !rows.length;
  banner.replaceChildren(...rows.map((row) => el('div', { className: 'card warning' }, icon('warning'), el('span', {}, ...row))));
}

/**
 * Fills the About dialog, in the viewer's language, as it opens: in a machine-translated language, that
 * it is (#327); what the map shows and that its positions are estimates; Reading the map, with the pills
 * a Train is drawn as, Live and Scheduled, and its outlines, drawn with the first of the map's Lines of
 * each kind of outline; the credits showCredits() lists there; the code and its licence; and privacy.
 */
function showAbout() {
  const machineTranslated = MACHINE_TRANSLATED[language()];
  const [round, pointed, badge] = (['round', 'pointed', 'badge'] as const).map((outline) => [...pills].find(([, p]) => p.outline === outline)?.[0]);
  // On a phone, About's handle closes it, as dragging it down does: a pointer's, as its close button is the keyboard's.
  const aboutHandle = el('button', { type: 'button', className: 'handle', tabIndex: -1, onclick: () => about.close() }, el('span'));
  aboutHandle.setAttribute('aria-hidden', 'true');
  about.setAttribute('aria-label', t('about'));
  about.replaceChildren(
    el('div', { className: 'sheet-top' }, aboutHandle, el('header', {}, el('h2', { className: 'title', textContent: t('about') }), closeButton(t('close'), () => about.close()))),
    el(
      'div',
      { className: 'sheet-body' },
      ...(machineTranslated ? [el('p', { className: 'subtitle' }, ...linked(machineTranslated, 'GitHub', 'https://github.com/gariasf/viapeninsula/issues'))] : []),
      el('p', { textContent: t('estimates') }),
      el('h3', { className: 'label', textContent: t('readingTheMap') }),
      el(
        'ul',
        { className: 'keys' },
        el('li', {}, round ? pill(round) : '', el('span', {}, el('b', { textContent: t('live') }), `: ${t('liveMeans')}`)),
        el('li', {}, round ? pill(round, { live: false }) : '', el('span', {}, el('b', { textContent: t('scheduled') }), `: ${t('scheduledMeans')}`)),
      ),
      el('p', { className: 'shapes' }, ...[round, pointed, badge].flatMap((line) => (line ? [pill(line)] : []))),
      el('p', { textContent: t('outlines') }),
      el('h3', { className: 'label', textContent: t('credits') }),
      aboutCredits,
      el('h3', { className: 'label', textContent: t('sourceCode') }),
      el(
        'p',
        {},
        el('a', { href: 'https://github.com/gariasf/viapeninsula', target: '_blank', textContent: 'github.com/gariasf/viapeninsula' }),
        ', ',
        el('a', { href: 'https://www.gnu.org/licenses/agpl-3.0.html', target: '_blank', textContent: 'AGPL-3.0' }),
      ),
      el('h3', { className: 'label', textContent: t('privacy') }),
      el('p', { textContent: t('noCookies') }),
      // Cloudflare's own pages on the data and metrics Web Analytics collects.
      el('p', {}, ...linked(t('visitsCounted'), 'Cloudflare Web Analytics', 'https://developers.cloudflare.com/web-analytics/data-metrics/')),
    ),
  );
}

/**
 * A sentence of About's, with a link to `href` round where it names `name`.
 * ponytail: every language names it so, once, as tests check. A language that words it otherwise needs
 * a placeholder in its string instead.
 */
function linked(text: string, name: string, href: string): (Node | string)[] {
  const [before = '', after = ''] = text.split(name);
  return [before, el('a', { href, target: '_blank', textContent: name }), after];
}

/** Credits the basemap and each Network's data, in the viewer's language: behind the © button on a phone, in a strip on a wide window, and in the About dialog. */
function showCredits() {
  const html = [
    '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
      '<a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> ' +
      `<a href="https://www.openstreetmap.org/copyright" target="_blank">${t('osmContributors')}</a>`,
    // Each source's once, however many Networks it feeds and credit it alike (ADR-0010). A track built
    // before #241 has no credits: its Networks get their names.
    ...new Set(credited.map((network) => (network.credit ? creditOf(network.credit) : network.name))),
  ];
  // The credits go in as they are, which is safe while they're all ours: these constants, t(), and the
  // credits and Network names the daily build publishes.
  creditsText.innerHTML = creditsStrip.innerHTML = html.join(' | ');
  aboutCredits.replaceChildren(...html.map((credit) => el('li', { innerHTML: credit })));
}

/** A source's credit, as its terms ask. */
function creditOf({ text, url, licence, updated }: Credit): string {
  return (
    `<a href="${url}" target="_blank">${text}</a>` +
    (licence ? `, ${LICENCES[licence]}` : '') +
    (updated ? `, ${t('updated')} ${new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(updated))}` : '')
  );
}

/**
 * The service days the map needs now, by the map's time (mapTime(), daysNeeded()), joined, where
 * they aren't the ones it shows. A day whose bundle fails to come is left out, and fetched again
 * next time.
 * Today's track comes on its own first, so the map can draw it before the Trips come. Notes today's
 * Networks with no Trips, which the banner names.
 * ponytail: the map's time is the device's until a snapshot corrects it, and the days follow a
 * correction only at the next refreshDays(), so for up to a minute after one, a device whose clock is
 * hours off can have the wrong days, and no Trains. Refresh them from poll() as a snapshot moves the
 * map's date, if that shows.
 */
async function neededDays(): Promise<{ track: Promise<Track>; days: Promise<Bundle> } | undefined> {
  try {
    manifest = await getJson<Manifest>(`${LIVE_URL}/manifest.json`);
  } catch (error) {
    if (!manifest) throw error;
    console.warn(error);
  }
  // The next day's first Trains come SOON before they're on the map, so they're among the nearby Trains.
  const needed = daysNeeded(manifest.days, mapTime(Date.now(), received), { early: SOON, late: LATE, emptyBoard });
  if (!needed) throw new Error('The manifest names no service day');
  const { today, days } = needed;
  noTripsIds = today.noTrips ?? [];
  const keys = days.flatMap((d) => [d.track, d.trips]);
  if (keys.join() === shown) return undefined;
  for (const key of fetched.keys()) if (!keys.includes(key)) fetched.delete(key);
  const get = <T>(key: string) => {
    const file = fetched.get(key) ?? getJson<T>(`${LIVE_URL}/${key}`);
    fetched.set(key, file);
    file.catch(() => fetched.delete(key));
    return file as Promise<T>;
  };
  const joined = async () => {
    // Each day's Trips are fetched once its track has come, so the track isn't slowed by them.
    const got = await Promise.allSettled(days.map((d) => get<Track>(d.track).then((track) => Promise.all([track, get<DayTrips>(d.trips)]))));
    // Without today's bundle there's nothing to draw; without another day's, the map does without it until next time.
    const failed = got.flatMap((g, i) => (g.status === 'rejected' ? [[days[i], g.reason] as const] : []));
    for (const [day, reason] of failed) if (day === today) throw reason;
    if (failed.length) console.warn(...failed.map(([, reason]) => reason));
    const bundles = got.flatMap((g) => (g.status === 'fulfilled' ? [{ ...g.value[0], ...g.value[1] }] : []));
    shown = failed.length ? '' : keys.join();
    return joinDays(bundles);
  };
  return { track: get<Track>(today.track), days: joined() };
}

/** Shows the days the map needs now, where they've changed. The Trains keep to the days shown meanwhile. */
async function refreshDays() {
  if (looking || document.hidden) return;
  looking = true;
  try {
    const needed = await neededDays();
    if (needed) show(await needed.days);
  } catch (error) {
    console.warn(error);
  } finally {
    looking = false;
  }
}

/** Fetches the live snapshot, and again 20 s later if the tab is still visible. */
async function poll() {
  let snapshot: Snapshot | undefined;
  try {
    // One that hangs gives up well before the next is due.
    snapshot = await getJson<Snapshot>(`${LIVE_URL}/snapshot.json`, AbortSignal.timeout(10_000));
  } catch (error) {
    // The map has nothing newer than its last snapshot, which the Trains keep to until the next comes.
    console.warn(error);
    snapshot = received.at(-1)?.snapshot;
  }
  const at = Date.now();
  if (snapshot) received = [...received.filter((r) => r.at > at - KEEP), { snapshot, at }];
  else emptyPolls++;
  liftClosures();
  showBanner();
  clearTimeout(nextPoll);
  if (!document.hidden) nextPoll = setTimeout(poll, 20_000);
}

/** Fetches the operators' Alerts while the tab is visible, and draws the Closures shown then. Where that fails, the cards keep those the map last got, which say when they were read. */
async function getAlerts() {
  if (document.hidden) return;
  try {
    alerts = await getJson<Alerts>(`${LIVE_URL}/alerts.json`, AbortSignal.timeout(10_000));
  } catch (error) {
    console.warn(error);
  }
  // And a minute on, the Closures within their hours then.
  drawClosures();
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
