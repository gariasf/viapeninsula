import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { BackgroundLayerSpecification, CircleLayerSpecification, ExpressionFilterSpecification, ExpressionSpecification, FontFacesSpecification, LineLayerSpecification, ProjectionSpecification, StyleSpecification, SymbolLayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { addProtocol, MapLibreMap, Popup, setWorkerUrl, type GeoJSONSource, type LngLat, type VectorTileSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import nunitoSans from '@fontsource/nunito-sans/files/nunito-sans-latin-400-normal.woff2?url';
import nunitoSansBold from '@fontsource/nunito-sans/files/nunito-sans-latin-700-normal.woff2?url';
import nunitoSansItalic from '@fontsource/nunito-sans/files/nunito-sans-latin-400-italic.woff2?url';
import { along, APART, atZoom, BANDS, bandZooms, GRAPH_BAND, STRETCH, inBand, onStroke, pointAt, profiled, zones, type Zone, daysNeeded, daysOf, SOON, DEGREE, EARTH, joinTracks, LATE, LIVE_URL, madridDate, networkTracks, places, type Alerts, type Bundle, type Credit, type Call, type DayFiles, type Place, type Line, type Manifest, type Network, type Point, type Shape, type Slot, type Snapshot, type Stroke, type Track, type Trip, type Words, WIDTH, type ZoomedOut } from '../bundle.ts';
import { boardAt, comingAt, KEEP, lastDays, mapTime, nearbyAt, seenWithin, trainAt, trainsAt, tripsAt, unavailable, type Coming, type Departure, type Followed, type Received, type Train, type TripNow } from '../engine.ts';
import { alertCount, alertsChanged, arrivingAt, backTo, backToTrain, basemapLabel, betweenStations, branchOff, busesReplace, cancelledCount, earlierStations, endsHere, followDeparture, goOn, starLabel, lateCount, standingAt, worstLate, trainsNow, turnsHere, language, LANGUAGES, leavesAt, leavingStation, liveUnavailable, locale, MACHINE_TRANSLATED, moreDepartures, moreNumbers, moreStations, nextAt, notRunning, passingStation, placedBy, setLanguage, setNameLanguages, t, toGo, trainCounts, trainsRunHere, trainTo, unlocated, type Language, type Unlocated } from './i18n.ts';
import { rounded } from './curve.ts';
import { getJson, lookAgainSoon, RETRY, STALL } from './files.ts';
import { daysAsTheyCome, firstLook, forgetJoined, joinedFrom, regionLoader, regionsCame, regionsNeeded, trackFileOf } from './regions.ts';
import { drawnFrom, LINE_PARTS } from './lines.ts';
import type { lineWork, LinesAsk, LineSource } from './lineTiles.ts';
import { linesAt, popupRoom } from './tap.ts';
import { drawnAt as placeShownAt, FEW_ZOOM, fewer, interchangesOf, markedNetworks, onLines, RAILS, readOf, SIGN_ZOOM, type LineCall, type Drawn as PlaceDrawn, type Interchange } from './stations.ts';
import { callsIn, fileShapes, hidesTowns, nameSort, rightOf, splitBy } from './names.ts';
import type { StoredTrack } from '../pieces.ts';
import { namePlacer, packFile, type NamePlace, type NamesAsk, type Packed, type Sizes, type Where } from './placeNames.ts';
import { covered, groupOf, spreading, toEdge, type Drawn, type Group, type Named } from './spread.ts';
import { atMostEvery, drifted, fitPadding, letsGo, outsideMiddle, pointersDown, tapZooms } from './centre.ts';
import { fastestInView } from './pace.ts';
import { keepView, lastView, markOf, openingView, tiltPressed, toggledPitch } from './view.ts';
import { bannerNetworks, type Banner, type NetworkTrack } from './banner.ts';
import { darkInk, INK, lettering, standIn } from './colour.ts';
import { ago, boardAsks, boardList, cardAlerts, countdownTo, due, inNameOrder, linesOnBoard, linkedTrip, linkedWords, minutesTo, nearbyRows, nextOnItsWay, passedPlace, progress, tripsState, untilTick, whereabouts, type CardAlert, type Whereabouts } from './cards.ts';
import { ARROW_GAP, boxOf, nameBoxOf, DASHED_RING, dashedDot, dashedOutline, dashesAcross, field, fitOf, FOLLOWED_TEXT, haloScale, LINE_HEIGHT, LOCAL_PILL_ZOOM, OUTLINE_SIZES, outlineOf, PILL_PADDING, PILL_TEXT, pillReach, pillText, pulse, SMALL_TEXT, TARGET, targetRings, type Outline } from './pill.ts';
import { closureKey, closureStrokes, closuresAt, hiding, liftedSince, placeOn, tappedRows, type Shown } from './closures.ts';
import { currentTab, type Tab } from './tabs.ts';
import { favouriteRows, favourites, type Favourite } from './favourites.ts';
import { keyboardRise, networkNames, numbered, numberQuery, results, searchPlaces, type Found, type FoundLine } from './search.ts';
import { cancelledNow, lineState, lineStrip, onStrip, type StripStation } from './line.ts';
import { opensInNewTab, putHtml } from './newTab.ts';

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
/** A file as it comes, with its Networks' and Lines' stand-ins on the dark basemap (standIn(), #263). */
const inScheme = <T>(file: T): T => (darkBasemap ? standIn(file) : file);

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
/** How wide the edge drawn round a Live pill is, in px; a Scheduled one's dashed ring is DASHED_RING. */
const PILL_HALO = 1.5;
/**
 * A Live Train's halo (#91): how many times its dot's radius it reaches, how far beyond the corners of
 * a two-letter round pill's box, in px (HALO_PILL), how softly it fades out, from blurred through to its middle (1), and how
 * strongly it's coloured.
 */
const [HALO_DOT, HALO_BEYOND, HALO_BLUR, HALO_OPACITY] = [2, 4, 0.6, 0.6];
/** On the dark basemap, the halo is a glow, as railisland's: blurred right through, and stronger (#519). */
const [GLOW_BLUR, GLOW_OPACITY] = [1, 0.95];
/** The radius of the dot a Scheduled Train's dashed ring is drawn round (dashedDot()), in px, the largest a dot is (#519). */
const DOT_RADIUS = 10;
/** A pill's halo's radius, every pill's whatever its Network or name (#780): a two-letter round pill's, as C5's, its name 12 px wide, HALO_BEYOND beyond the corners of its box, 17.3 px. */
const HALO_PILL = Math.hypot(...boxOf('round', 12, PILL_TEXT)) + HALO_BEYOND;
/**
 * The outlines a Train is drawn with, as pill.ts sizes them, `w`×`h` px around their middles: how far
 * `outside` each a point is, in px (x right, y down), or inside where negative. A pill's outline
 * stretches across its middle 2 px both ways to fit its Line's name over its middle `across` px, and all
 * but PILL_EDGE of its height. The arrow points up.
 */
const OUTLINES: Record<Outline | 'arrow', { w: number; h: number; across?: number; outside: (x: number, y: number) => number }> = {
  // A square with corners so round it's nearly a circle.
  round: { ...OUTLINE_SIZES.round, outside: roundedSquare(7.5, 6.5) },
  // Its ends 5 px long, to a point 2 px across.
  pointed: { ...OUTLINE_SIZES.pointed, outside: (x, y) => Math.max(Math.abs(y) - 7.5, Math.abs(x) - 6, 0.7926 * (Math.abs(x) - 6) + 0.6097 * (Math.abs(y) - 1)) },
  // Its ends cut slanting the same way, 6 px across its height, leaning forward as italics do.
  slanted: { ...OUTLINE_SIZES.slanted, outside: (x, y) => Math.max(Math.abs(y) - 7.5, (Math.abs(x + 0.4 * y) - 4.5) / Math.hypot(1, 0.4)) },
  // A square with corners rounded 3 px, which a name of two letters leaves nearly square, like the Metro's and TRAM's Line badges.
  square: { ...OUTLINE_SIZES.square, outside: roundedSquare(7.5, 3) },
  // Its tip 4.5 px ahead of its middle, and its base 2.25 px behind and 6 px across.
  arrow: { ...OUTLINE_SIZES.arrow, outside: (x, y) => Math.max(y - 2.25, (6.75 * Math.abs(x) - 3 * (y + 4.5)) / Math.hypot(3, 6.75)) },
};
/**
 * The cards' icons, drawn in the colour of the text around them, which a forced-colours theme sets
 * too (#116): a close cross, a chevron down, up and right, the die that follows a random Train, Nearby's
 * radius round a dot and Search's lens, the tilted plane of the tilt button, About's ⓘ, the credits' ©,
 * a warning, and the ring Search marks a Station with (#471).
 */
const ICONS = {
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  die: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="9" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="9" cy="15" r="1.3"/><circle cx="15" cy="15" r="1.3"/></svg>',
  tilt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 6h8l5 12H3L8 6z"/><path d="M5.5 12h13"/></svg>',
  nearby: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 3.1"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
  centre: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  copyright: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M14.9 9.4a4 4 0 1 0 0 5.2"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>',
  star: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1 6.6 19.9l1.1-6.1L3.2 9.6l6.1-.8L12 3.2z"/></svg>',
  starOn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1 6.6 19.9l1.1-6.1L3.2 9.6l6.1-.8L12 3.2z"/></svg>',
  station: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="6.5"/></svg>',
};
/** How many departures a board shows peeking on a phone, and Nearby rows (#321). */
const PEEK = 3;
/** What Search's hints give as examples, which read the same in every language: names of Stations, and a Train number (#471). */
const SEARCH_EXAMPLES = { line: 'rodalies:R4', lines: 'R4, S1, L3, T4', stations: 'Barcelona-Sants, Terrassa, Mataró', number: '77428' };
/** The zoom the map eases to, to bring a Train it follows or a Station into view, where it's further out (easeOnto()). */
const FOLLOW_ZOOM = 13;
/** How long the map takes to bring the Train it follows back into the middle of the map beside the panel, in ms (easeIn()). */
const EASE_IN = 1000;
/** How long MapLibre's own ease takes, in ms, where it's given none: the Centre button's and a follow's (#682). */
const EASE = 500;
/** How far a finger moves the top of a sheet, in px, before it drags it rather than taps. */
const SLOP = 6;
/** What measures names for textWidth(), and reads colours for hex(). */
const measuring = document.createElement('canvas').getContext('2d');
/** How many times the map looks for live data, never getting any, before it says live data is unavailable. */
const EMPTY_POLLS = 3;
/** How many times a look tries the manifest while the map has none, as on the page's first, RETRY apart (neededDays(), #658). */
const MANIFEST_TRIES = 3;
/** How near the viewer, in metres, a Train passes to be one of their nearby Trains, and as soon as the next day's first come onto the map (SOON). The panel's strings say so too. */
const NEARBY = 1500;
/**
 * How often Trains move, in ms. As often as the fastest of them moves a quarter of a pixel, which
 * nobody sees in between (quarterPixel()), the fastest in view: at zoom 12 about 12 times a second, as Rodalies' 160 km/h asks, or 23 with an AVE's 300 km/h, and every frame zoomed
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
/** How large a Network's mark is drawn at each zoom, of its full size (#572): 0.8 at SIGN_ZOOM, full at 15. */
const SIGN_SIZE: [zoom: number, size: number][] = [[12.5, 0.75], [SIGN_ZOOM, 0.8], [15, 1]];
/** A mark's height, its ring's width and its letters' size, in px at its full size; and a badge's padding and ring. */
const [MARK, MARK_RING, MARK_TEXT, BADGE_PAD, BADGE_RING] = [16, 2, 9.5, 2.5, 1.5];
/** How large an interchange's name under its badge is, in px: the top tier's names' size. */
const BADGE_TEXT = 12;
/** The device pixels a px of the places' images is drawn at. */
const IMAGE_RATIO = Math.max(2, Math.ceil(devicePixelRatio));
/** The images drawn so far, by ID, with how to draw each, to draw the marks again once their font has come. */
const painted = new Map<string, [w: number, h: number, paint: (c: CanvasRenderingContext2D) => void]>();
// The marks' font, Nunito Sans Bold, which a canvas draws in only once it has come: the marks drawn before, again.
void document.fonts.load(`bold ${MARK_TEXT}px "Nunito Sans"`).then(() => {
  for (const [id, [w, h, paint]] of painted) map.updateImage(id, canvasImage(w, h, paint));
});
/** Each Network's mark, by its ID: our own plain letters, not the operators' logos (#20). Others take their name's first letter. */
const MARKS: Record<string, string> = { metro: 'M', fgc: 'FGC', tram: 'T', rodalies: 'R' };
/** A Network's mark: its letters (lettersOf()) and its colour. */
type Mark = { letters: string; colour: string };
/** The colour of a Network's mark that names none. */
const NO_COLOUR = '#666666';
/** How much larger the top tier's dots are (TIERS), which are drawn as squares. */
const TOP = 2;
/** How many times as large as its dot with its ring the top tier's square is drawn: railisland's, a fifth larger (#572). */
const SQUARE = 1.2;
/** The nameboard's ink (#212), which rings the top tier's square on both basemaps, as the board's heading is in it. */
const BOARD_INK = '#14305a';
/** How wide the white of the link between an interchange's Stations on the rails is, in px, inside its ring. */
const LINK_WIDTH = 2;
/** The top tier's square's size at a zoom, of its image's: SQUARE times its dot with its ring, which the image's 18 px stand for. */
const squareSize = (zoom: number) => (SQUARE * (2 * (atZoom(DOT, zoom) + 2) + 2 * atZoom(RING, zoom))) / 18;
/** A Network's mark's letters. */
const lettersOf = (network: string, names: Map<string, string>) => MARKS[network] ?? (names.get(network) ?? network).charAt(0).toUpperCase();
/** How wide a mark is, in px at its full size: a disc for one letter, longer for more. */
const markWidthOf = (letters: string) => MARK + (letters.length - 1) * 6;
/** How wide these marks are side by side, in px at their full size. */
const marksWidth = (letters: string[]) => letters.reduce((sum, l, i) => sum + markWidthOf(l) + (i ? 2 : 0), 0);
/** A Train's dot's radius, in px at each zoom, and the followed Train's, which is larger. */
const TRAIN_DOT: [zoom: number, px: number, followed: number][] = [[7, 2.5, 5], [14, 6, 10]];
/** How long a line of a place's name can be, in ems, as MapLibre wraps names. */
const PLACE_WRAP = 10;
/** How a place's name is lettered: bold (BOLD) or regular, and how large, in px, by its tier (TIERS). */
interface NameStyle {
  bold: boolean;
  size: number;
  /** An interchange's place's, which gives way to its badge's from SIGN_ZOOM till the rails (#572). */
  badged?: boolean;
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
// instead, in its colour (#190), only long distance's and Media Distancia's (drawnFrom(), #781), and only
// long distance's Trains, as dots (ADR-0010, #262).
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
 * a little larger by tier, as railisland's (TIER_STYLE). Where two of a tier's names collide, the one it
 * lists first wins (nameSort(), #424). A place in
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
      // Cercanías Madrid's and the 13 other núcleos', by núcleo: where the most Lines call or end, and each main city's Station (#424).
      // Cercanías Madrid
      'adif:18000', // Madrid-Atocha Cercanías
      'adif:17000', // Madrid-Chamartín-Clara Campoamor
      'adif:18002', // Madrid-Nuevos Ministerios
      'adif:10000', // Madrid-Príncipe Pío
      'adif:37001', // Madrid-Villaverde Alto
      'adif:10200', // Villalba de Guadarrama
      'adif:70103', // Alcalá de Henares
      'adif:70200', // Guadalajara
      'adif:60200', // Aranjuez
      // Asturias
      'adif:15211', // Oviedo
      'adif:15410', // Gijón-Sanz Crespo
      'adif:16403', // Avilés
      // Bilbao
      'adif:13200', // Bilbao-Intermod. Abando Indalecio Prieto
      'adif:13400', // Desertu-Barakaldo
      // Cádiz
      'adif:51405', // Cádiz
      'adif:51300', // Jerez de la Frontera
      // Cartagena
      'adif:05951', // Cartagena-Plaza Bastarreche
      // Ferrol
      'adif:21010', // Ferrol
      // León
      'adif:05803', // La Asunción Universidad
      // Málaga
      'adif:54500', // Málaga M.Z. Cercanías
      'adif:54516', // Fuengirola
      // Murcia/Alicante
      'adif:60911', // Alicante/Alacant-Terminal
      'adif:61200', // Murcia del Carmen
      'adif:62103', // Elche/Elx-Parc
      // San Sebastián
      'adif:11511', // San Sebastián-Donostia
      'adif:11600', // Irun
      'adif:11400', // Zumarraga
      // Santander
      'adif:14223', // Santander
      'adif:05621', // Torrelavega-Centro
      // Sevilla
      'adif:51003', // Sevilla-Santa Justa
      'adif:51200', // Utrera
      // Valencia
      'adif:65000', // València-Estació del Nord
      'adif:65300', // Castelló de la Plana
      'adif:69110', // Gandia
      // Zaragoza
      'adif:04040', // Zaragoza Delicias
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
      // Cercanías Madrid's and the 13 other núcleos', by núcleo: their other main Stations, where their Lines part and end, and each other town's main Station (#424).
      // Cercanías Madrid
      'adif:18101', // Sol
      'adif:18003', // Méndez Álvaro P.V.
      'adif:60100', // Madrid-Villaverde Bajo
      'adif:10100', // Pinar de las Rozas
      'adif:10005', // Las Rozas
      'adif:97100', // Pitis
      'adif:98003', // Fuente de la Mora
      'adif:17009', // Universidad-Cantoblanco
      'adif:35002', // Fuenlabrada
      'adif:35607', // Móstoles-El Soto
      'adif:35012', // Humanes
      'adif:37012', // Parla
      'adif:98305', // Madrid-Aeropuerto T4
      'adif:19003', // Alcobendas-San Sebastián de los Reyes
      'adif:17005', // Colmenar Viejo
      'adif:10203', // El Escorial
      'adif:12006', // Cercedilla
      'adif:37002', // Getafe-Centro
      'adif:35001', // Leganés
      // Asturias
      'adif:15217', // La Corredoria
      'adif:15301', // Villabona de Asturias
      'adif:15400', // Veriña
      'adif:05509', // El Berrón
      'adif:15208', // Soto de Rey
      'adif:15205', // Ablaña
      'adif:05325', // Pravia
      'adif:15203', // Mieres-Puente
      'adif:15122', // Pola de Lena
      'adif:16011', // El Entrego
      'adif:05443', // Laviana
      'adif:16405', // San Juan de Nieva
      'adif:05245', // Cudillero
      'adif:05389', // Collanzo
      'adif:05534', // Infiesto Apeadero
      // Bilbao
      'adif:13206', // Ametzola
      'adif:05451', // Bilbao la Concordia
      'adif:05473', // Aranguren
      'adif:13405', // Santurtzi
      'adif:13506', // Muskiz
      'adif:13100', // Orduña
      'adif:13106', // Llodio
      'adif:05485', // La Calzada
      'adif:05497', // Karrantza
      // Cádiz
      'adif:51419', // Río Arillo
      'adif:51415', // Las Aletas
      'adif:51416', // Universidad de Cádiz
      'adif:51450', // Pelagatos
      'adif:51400', // Puerto de Santa María
      'adif:51406', // San Fernando-Bahía Sur
      'adif:51205', // Aeropuerto de Jerez
      // Cartagena
      'adif:05977', // Los Nietos
      'adif:05965', // La Unión
      // Ferrol
      'adif:05139', // Ortigueira
      'adif:05115', // San Sadurniño
      // León
      'adif:05770', // Matallana
      'adif:05761', // Cistierna
      'adif:05753', // Guardo Apeadero
      // Málaga
      'adif:54517', // Málaga-Centro Alameda
      'adif:54501', // Victoria Kent
      'adif:54505', // Málaga-Aeropuerto
      'adif:54509', // Torremolinos
      'adif:54511', // Benalmádena-Arroyo de la Miel
      'adif:54405', // Álora
      // Murcia/Alicante
      'adif:60913', // Sant Vicent Centre
      'adif:60914', // Universidad de Alicante
      'adif:62002', // Orihuela-Miguel Hernández
      'adif:62003', // Callosa de Segura
      // San Sebastián
      'adif:11305', // Brinkola
      'adif:11500', // Tolosa
      'adif:11404', // Beasain
      'adif:11505', // Andoain
      'adif:11508', // Hernani
      'adif:11515', // Pasaia
      // Santander
      'adif:05602', // Valdecilla la Marga
      'adif:05663', // Orejo
      'adif:05671', // Liérganes
      'adif:05658', // La Cantábrica
      'adif:05623', // Puente San Miguel
      'adif:05637', // Cabezón de la Sal
      'adif:14213', // Torrelavega
      'adif:14210', // Los Corrales de Buelna
      'adif:14202', // Reinosa
      // Sevilla
      'adif:51100', // San Bernardo
      'adif:51110', // Virgen del Rocío
      'adif:51113', // Jardines de Hércules
      'adif:51103', // Dos Hermanas
      'adif:50700', // Los Rosales
      'adif:43000', // San Jerónimo
      'adif:51050', // Cartuja
      'adif:50600', // Lora del Río
      'adif:43005', // Benacazón
      'adif:51203', // Lebrija
      // Valencia
      'adif:64100', // Xàtiva
      'adif:64200', // Silla
      'adif:65002', // València-La Font de Sant Lluís
      'adif:64006', // L'Alcúdia de Crespins
      'adif:66206', // Buñol
      'adif:66212', // València-Sant Isidre
      'adif:65312', // Vinaròs
      'adif:65200', // Sagunt
      'adif:64104', // Alzira
      'adif:69104', // Cullera
      // Zaragoza
      'adif:70806', // Zaragoza-Portillo
      'adif:71100', // Zaragoza-Miraflores
      'adif:70800', // Casetas
    ],
  },
];
/** How a place in neither tier is drawn: named from zoom 12, in the smallest size, and after every tier's where names collide, by its calls a day (nameSort(), #372). */
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

/**
 * Below this zoom, the basemap's cities' labels are placed before the Lines' names, which give way where one
 * falls on a city's: below zoom 12 a city's name is the only name of most places, as TIERS names only the main
 * Stations before it, and a Line is told by its colour where its name goes. The map's own layers are above the basemap's, so MapLibre places
 * their names first. From this zoom the cities' labels are the basemap's, under the Lines' names. The zoom is
 * the ticket's (#525).
 */
const CITY_ZOOM = 10;

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
/** Whether a Train is drawn at all: from the zoom its Line's Trains are drawn from (pillOf()). */
const DRAWN: ExpressionSpecification = ['>=', ['zoom'], ['get', 'dotZoom']];

/** An expression that takes one value for a Live Train and another for a Scheduled one. */
const byLive = (live: string | number | ExpressionSpecification, scheduled: string | number | ExpressionSpecification): ExpressionSpecification => [
  'case',
  ['get', 'live'],
  live,
  scheduled,
];

/** Each licence a source's data can be under, with the link to its text that it asks for. */
const LICENCES: Record<NonNullable<Credit['licence']>, string> = {
  'CC BY 4.0': '<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>',
  // NAP's: the Ministry of Transport's open-data licence, LDA (#264).
  'LDA MITRAMS': '<a href="https://nap.transportes.gob.es/licencia-datos">LDA MITRAMS</a>',
};

/**
 * The page's link as it was opened, or last pasted into the tab, even while the map loads, which
 * openLink() opens: MapLibre puts the view in the link as soon as the map opens, so whether the link
 * named one is read from this (#292). Or the link of a Station alone, as a Search row opens it (#471).
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
  // Names placed again, as each time the Trains move, show and hide at once, not fading over 300 ms,
  // which had MapLibre redraw every frame at rest (#666).
  fadeDuration: 0,
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
/** Sets placeLabels' filters, at a join where the places change (#778). */
const hideTowns = hidesTowns((id, filter, options) => map.setFilter(id, filter, options));
/** The basemap's layers of cities' labels, as its style gives them, which are drawn again over the Lines' names below CITY_ZOOM (#525). */
const cityLabels = new Map<string, SymbolLayerSpecification>();
// OpenFreeMap's positron, or its dark basemap where the system's setting is dark, fetched here rather than by
// MapLibre: the page waits for it (map.once('load')), so one that fails to come, or stalls, as where OpenFreeMap
// answers with an error a moment, is asked for again, RETRY on, until it comes (#658). MapLibre itself, given another
// style with transformStyle, waits for the one that failed to load first, which is for good.
const basemap = `https://tiles.openfreemap.org/styles/${darkBasemap ? 'dark' : 'positron'}`;
/** Sets the basemap's style, as it came. */
const setBasemap = (basemapStyle: StyleSpecification) => map.setStyle(basemapStyle, {
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
      // Positron's two layers of cities and the dark basemap's both say `class == city` in their filters.
      // ponytail: finds them by the text of that filter as both write it. A basemap that wrote it another way would leave no
      // copy, and the Lines' names placed first as they were. Walk the expression if one does.
      if (layer['source-layer'] === 'place' && JSON.stringify(layer.filter)?.includes('["==",["get","class"],"city"]')) cityLabels.set(layer.id, layer);
      const text = JSON.stringify(layer.layout['text-field']);
      if (!text?.includes('"name_en"')) continue;
      const own = JSON.parse(text.replaceAll('"name_en"', '"name"'));
      layer.layout['text-field'] = basemapLabel(own);
    }
    return style;
  },
});
void (async () => {
  for (;;) {
    try {
      return setBasemap(await getJson<StyleSpecification>(basemap, { stall: STALL }));
    } catch (error) {
      console.warn(error);
      await new Promise((resolve) => setTimeout(resolve, RETRY));
    }
  }
})();
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
// On a wide window the rail goes under it while it's up, however far down it reaches (style.css's --banner, #470).
new ResizeObserver(() => document.documentElement.style.setProperty('--banner', `${banner.getBoundingClientRect().bottom}px`)).observe(banner);
// The panel, which showPanel() fills while the map follows a Train, or shows a Station's board, the
// viewer's nearby Trains or Search: on a phone a sheet docked to the bottom, over the tab bar, which
// peeks or is pulled up, and on a wide window a card at the bottom left, beside the rail (#321, #470).
const panel = el('section', { className: 'sheet', hidden: true });
// The buttons that ride on its top edge on a phone, where a thumb reaches them and the sheet never
// covers them, labelled by showLanguage(): the credits bottom left, and bottom right the one that
// follows a random Train, once the map can move Trains, till Now has it (#474). The random follow is
// disabled while there's no Train on the map but the one the map follows. On a wide window they go
// bottom right, over the credits' strip.
const followRandomButton = el('button', { type: 'button', className: 'card fab', disabled: true, onclick: followRandom }, icon('die'));
// The Centre button over it, shown while the map has let go of the Train it follows (#325).
const centreButton = el('button', { type: 'button', className: 'card fab', hidden: true, onclick: centre }, icon('centre'));
// The tilt button over them: it eases the map's pitch between flat and tilted, pressed from half the tilt
// up, so that a slight tilt by touch reads flat and the press tilts it (#326, #440). Another easing that
// starts meanwhile, a panel's padding, stops it short, so it's started again (a few times at most) unless
// the viewer tilts it themselves.
let tiltTo: number | undefined;
/** How many times more the tilt is started again. */
let tiltTries = 0;
const tiltButton = el(
  'button',
  {
    type: 'button',
    className: 'card fab tilt',
    onclick: () => {
      tiltTries = 3;
      map.easeTo({ pitch: (tiltTo = toggledPitch(map.getPitch())) });
    },
  },
  icon('tilt'),
);
const showTilt = () => tiltButton.setAttribute('aria-pressed', String(tiltPressed(map.getPitch())));
map.on('pitch', showTilt);
map.on('pitchstart', (e) => e.originalEvent && (tiltTo = undefined));
map.on('moveend', () => {
  if (tiltTo === undefined || map.getPitch() === tiltTo || !tiltTries--) tiltTo = undefined;
  // After the easing that stopped it has begun, which this moveend came in the middle of.
  else setTimeout(() => tiltTo !== undefined && map.easeTo({ pitch: tiltTo, padding: panelPadding() }));
});
showTilt();
const trainButtons = el('div', { className: 'fabs', hidden: true }, tiltButton, centreButton, followRandomButton);
// The credits, which showCredits() fills: behind the © button on a phone, and a strip on a wide window.
const creditsButton = el('summary', { className: 'card' }, icon('copyright'));
const creditsText = el('div', { className: 'card credits-text' });
const creditsStrip = el('div', { className: 'card credits-strip' });
const riders = el('div', { className: 'riders' }, el('details', { className: 'credits' }, creditsButton, creditsText), trainButtons, creditsStrip);
// The tab bar, under the sheet on a phone, and a rail down the left edge on a wide window (#470), labelled
// by showLanguage(): each tab opens its screen's sheet, as #321's are, and is current while it shows
// (showPanel()). After the corners and before the credits, as the keyboard goes. Its tabs open nothing
// till the map can move Trains, as Nearby's button didn't show till then.
const tabs: Record<Tab, HTMLButtonElement> = {
  search: el('button', { type: 'button', className: 'tab', disabled: true, onclick: showSearch }),
  nearby: el('button', { type: 'button', className: 'tab', disabled: true, onclick: showNearby }),
  favourites: el('button', { type: 'button', className: 'tab', disabled: true, onclick: showFavourites }),
};
const nav = el('nav', { className: 'card tabs' }, ...Object.values(tabs));
const dock = el('div', { className: 'dock' }, riders, panel);
document.body.append(nav, dock);
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
/** Whether the wheel, a pinch and a double-click or a double-tap zoom about the middle now, as the map pans with the Train (showCentring(), the easeTo() wrapped below it). */
let centring = false;
/** The pointers down on the map, which hold it where it is as a move of it does (holding(), #581). */
const pressed = pointersDown();
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
// Search's sheet rises over the on-screen keyboard as it comes up, and back down as it goes (#471).
visualViewport?.addEventListener('resize', riseOverKeyboard);
visualViewport?.addEventListener('scroll', riseOverKeyboard);
/**
 * The Train the map follows, by its service day and its Trip as its operator names it, so that it
 * stays followed as the days joined change around midnight, and where it's drawn, at which zoom.
 */
let following: { day: string; trip: string; at?: Point; zoom?: number } | undefined;
/**
 * The Trip the panel shows while its Train isn't on the map: yet to start (#322), or within a closed
 * Closure that hides Trains (#420), so that the map doesn't stop following it, and the Station it comes
 * onto the map at (startOf()).
 */
let waiting: Coming | undefined;
/** Whether the panel shows a Train within a closed Closure, whose Alerts open as it goes within one, on a wide window or a sheet pulled up, and fold as it comes out (followedPanel(), #420). */
let showsWithin = false;
/**
 * Where Back goes (#322): the panel this one was opened from, by a departure or a Station, as it was,
 * peeking or pulled up and scrolled to `scroll`. One level: the panel it returns to has none of its own.
 */
let back:
  | { to: 'train'; day: string; trip: string; headsign: string; up: boolean; scroll: number }
  | { to: 'board'; place: string; up: boolean; scroll: number }
  | { to: 'nearby'; near: Point; up: boolean; scroll: number }
  | { to: 'line'; line: string; up: boolean; scroll: number }
  | undefined;
/** The place whose board the panel shows, by its ID in places(), while the map follows no Train. */
let boardPlace: string | undefined;
/** The Line whose screen the panel shows, by its ID, while the map follows no Train (#473). */
let lineShown: string | undefined;
/** Whether a Line's screen shows its Cancelled Trains above its strip, which its chip opens and closes, as its Alerts' (`showAlerts`, #473). */
let showCancelled = false;
/** A Line's strip, for the Line and the days on the map it was made from (lineStrip()), as they change only as the days do. */
let stripOf: { line?: string; days?: Bundle; trips: Trip[]; strip: StripStation[] } = { trips: [], strip: [] };
/** The Line the map shows by its glow, the Line whose screen it is (#473), by its ID, or none (showLook()). */
let lookOf: string | undefined;
/** The last day, by the date of the day that stood for today (`serviceToday`), that a Station board had no departures left, when the map needs the next day's Trips for it. */
let emptyBoard: string | undefined;
/** The date of the day that stands for today in the days the map last needed (daysNeeded()): the day before, after midnight, until today's first Train is SOON (#659). */
let serviceToday: string | undefined;
/**
 * Where the viewer is, while the panel shows their nearby Trains instead, or that the browser is
 * still finding out, or why it couldn't (unlocated()). It's never sent anywhere, nor put in the page's link.
 */
let nearMe: Point | Unlocated | undefined;
/** Whether the panel shows Search, its tab's sheet (#470). */
let searching = false;
/** Whether the panel shows Favourites, its tab's sheet (#472). */
let favouritesShown = false;
/** The Stations and Lines the viewer keeps in Favourites, in their browser's storage only (ADR-0011). */
const kept = favourites(() => localStorage);
/** What's typed in Search's field (#471), which starts afresh each time Search opens: never stored, nor put in the link (ADR-0011). */
let query = '';
/** How many times Nearby has asked the browser where the viewer is, so that only the last ask's answer shows (locate()). */
let asks = 0;
/** When the panel was last filled, by performance.now(), and how long after that it is next due, in ms: a second, or as a followed Train's countdown next changes (Panel's `changes`). */
let [panelShown, panelDue] = [0, 1000];
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
/**
 * The Lines of the days on the map, by their IDs, which the cards name as pills from the start (pill()),
 * in the order they name them (inNameOrder(), #399). Only naming reads that order, in servedBy() and
 * closuresTapped(): what's drawn looks Lines up by their IDs, and `days.lines` stays as the track has it.
 */
let lines = new Map<string, Line>();
/** How each Line's Trains are drawn as pills, by the Line's ID. */
let pills = new Map<string, Pill>();
/** Each Line's top speed, of the days on the map, in m/s, by the Line's ID: worked out as they come. */
let topSpeeds = new Map<string, number>();
/**
 * The top speed of the fastest Line with a Train in view, in m/s, which quarterPixel() goes by: worked
 * out as the map stops and once a second (paceInView()), not each frame, so that at Barcelona with no AVE
 * in view Trains move every 81 ms, as Rodalies' 160 km/h asks, not every 43 ms, as AVE's 300 km/h (#666).
 */
let fastest = 0;
/** The Trains last drawn, with their Lines, where whereDrawn() had them, which paceInView() looks in. */
let placedTrains: { train: { trip: Trip }; at: Point }[] = [];
/** The days shown whose places' names, and where Lines were drawn already their Lines, are still to be handed to MapLibre a frame on (show()). */
let namesDue: Track | Bundle | undefined;
/** The cards' colour, style.css's --card, which a Scheduled Train's pill letters its Line's colour against (pill()). */
const cardColour = hex(getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#fff');
/** The Lines the last place whose board the panel showed names, for the days on the map then (servedBy()). */
let served: { place?: Place; days?: Bundle; lines: string[] } = { lines: [] };
/** The manifest as the map last got it. */
let manifest: Manifest | undefined;
/**
 * Whether the last try of the manifest failed, or stalled: a look that had it fail is followed by another
 * soon (looked(), #657), and the banner says, while the map has none, that the timetable is on its way
 * (showBanner(), #658). Up here, as showLanguage() shows the banner.
 */
let manifestFailed = false;
showLanguage();
/** Each file of the service days' bundles the map has fetched, or is fetching: their track and Trips. */
const fetched = new Map<string, Promise<unknown>>();
/** Each set of regions' tracks joined, by the files it's from, so that looking again where one came again or failed again draws nothing again. */
const joinedTracks = new Map<string, Track>();
/** The files of the days' bundles on the map, and whether the map is looking for the days it needs. */
let [shown, looking] = ['', false];
/** Whether the map is to look for the days it needs again once it has, as a look was asked for meanwhile, as when the map comes onto a region. */
let lookAgain = false;
/** Whether the map has looked for the days it needs yet: a region with no extent, long distance's, and Media Distancia y Avant's come at its second look (firstLook()). */
let lookedOnce = false;
/**
 * Whether the last look for the days the map needs had a region's file fail to come, which the map looks
 * for again once 5 to 10 s on and then each minute (looked(), #657): a board whose regions' Trips haven't
 * come then says that none can be had, rather than showing its label alone for good, as it does while they're on their way (#379). Up
 * here, as neededDays() sets it, and first runs before the module is past its top-level await. A file
 * that stalls fails as one that errs does, once no bytes have come for STALL (getJson(), #595).
 * ponytail: one flag and one wait for every region loaded or needed, so a board with none left, of a region
 * that came, has its label alone while another region's Trips are on their way, and a region new to the map,
 * asked for after a look that failed, says that none can be had while its Trips come, as Nearby does where
 * its viewer's regions are new (#592). Keep both by the board's own regions (come()) if that shows.
 */
let tripsFailed = false;
/**
 * Whether the map has looked again soon, for what failed, for the run of looks that have had a file fail
 * (looked(), #657): once, and the looks after it are the minute's, until one has no file fail.
 */
let failedRetried = false;
/** The Stations of the track on the map, which come with its Lines. */
let shownStations: Track['stations'] | undefined;
/**
 * The regions the map loads, by their IDs (#266): each once it comes into view from zoom 7, or once a
 * link or Nearby needs it (regionsNeeded()), and never let go of, so that a followed Train's region,
 * loaded as its Train was drawn or its link named it, stays loaded wherever the map goes.
 * ponytail: never let go of, so a viewer who pans across Spain ends with every region loaded, as the
 * map loaded them all before #266. Let go of those out of view that no link, Nearby or followed Train
 * needs if a long session's memory shows.
 */
const loaded = new Set<string>();
/** Which of them every day the map needs has, once their files have come: Nearby says no Train passes only once the viewer's have come, and a board that none can be had only once its own. */
let shownRegions = new Set<string>();
/**
 * Which of them the days on the map have, as each day's files come and join the others' (#593): a link
 * waits for its own, so that it opens with the first day's Trips, not once the last day's have come.
 * `shownRegions` where every day has.
 */
let joinedRegions = new Set<string>();
/** Whether the map shows some of the days its last look is for, with the others' Trips still to come (#593). */
let daysComing = false;
/** The bundle each service day on the map is, by its date, which the map keeps for a day while the files it's looking for again come (daysAsTheyCome()). */
let shownDays = new Map<string, Bundle>();
/** The file below zoom 7 (ZoomedOut) as the map last got it, and the key of the one it has or is getting, which the manifest names. */
let [zoomedOut, zoomedOutKey]: [ZoomedOut | undefined, string | undefined] = [undefined, undefined];
/** The places Search finds Stations in, every region's, and the Lines it names at them, by their IDs, from the file below zoom 7, once it has come (#471). */
let [searched, searchedLines]: [Found[], Map<string, NonNullable<ZoomedOut['lines']>[number]>] = [[], new Map()];
/** Whether the page's link names a Station or a Train whose regions are still to come, which openLink() opens once they have. */
let linkWaits = false;
/** Each Network's track, drawn once zoomed out (#190), which the banner goes by for a Network with no Trips today (bannerNetworks()). */
let shownTracks: NetworkTrack[] = [];
/** The zoom each of those Networks' tracks is drawn from (drawnFrom()), which the banner names one with no Trips today from (#781). */
let tracksFrom = new Map<string, number>();

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
// None, where the map opens with no region in view or needed, as zoomed out: it loads them as they come
// into view (#266). Its first look for them is one as refreshDays() makes, which waits for it.
looking = true;
// And the regions it needs as the map moves, from the start, as the map can be moved while it opens: a look
// asked for meanwhile follows the first (#266).
map.on('moveend', want);
// A first look that fails, as where every try of the manifest has, leaves the map with no days, which the looks after it
// look for (looked(), #658): the page goes on, and doesn't stop here for good.
const [needed] = await Promise.all([neededDays().catch((error: unknown) => void console.warn(error)), map.once('load'), typefaceLoaded]);
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
/** The interchanges among them (interchangesOf()). */
let interchanges: Interchange[] = [];
/** The places they were made of, each by what interchangesOf() reads of it, as show() last made them. */
let interchangesFrom = '';
/** Each interchange's board, by its ID: one place of all its places' Stations (ADR-0005). */
let boards = new Map<string, Place>();
/** Each of an interchange's places' interchange, by their IDs, whose board a tap on it or a link to its Stations opens. */
let boardOfPlace = new Map<string, string>();
/** What drawPlaces() draws: the places as tiered, with their marks' Networks (`marked`), the Networks, and fewer()'s places. */
let drawnPlaces: { tiered: (Place & { larger: number; from: number; marked: string[] })[]; networks: Map<string, Network>; few: Set<string> } = { tiered: [], networks: new Map(), few: new Set() };
/** Each Station's place in shownPlaces, for the buttons that open its board (#322). */
let placeOfStation = new Map<string, Place>();
/**
 * What places each Line's Trains on its stroke zoomed out: the shapes, its slots by `<line> <shape>`,
 * its curves (zones()), and which side its Trains keep to, 1 right and -1 left; and where each Closure
 * shown on the track goes, along its stretches and on its rails, by closureKey(), once worked out (#341).
 */
let placing = { shapes: new Map<string, Shape>(), slots: new Map<string, Slot[]>(), curves: new Map<string, Zone[]>(), keep: new Map<string, number>(), from: new Map<string, number>(), closures: new Map<string, [GeoJSON.Feature[], GeoJSON.Feature[]]>() };
/** The Closures the map shows now (closuresAt()), which a tap on one names. */
let shownClosures: Shown[] = [];
/** Those of them that hide Trains (hiding(), #345): within whose closed ones Scheduled Trains aren't drawn, and boards show them not stopping. */
let hidingClosures: Shown[] = [];
/**
 * The Closures live data has lifted (hiding(), #345), for the page's life, with when a Live Train was
 * first seen within each (ms since 1970, by the map's time), which a tap on it says (#422).
 * ponytail: the page's memory, so a page opened while a stale Alert's Closure has its Line's Trains
 * running hides them until one is seen within it again. The fetcher keeping where each Line's Trains
 * were last seen, and publishing it beside alerts.json, would lift it from the first. It keeps every
 * Alert it has lifted, so one changed and then changed back is lifted again without a Train seen since.
 */
const lifted = new Map<string, number>();
/** The Lines' strokes along their Stretches, which a tap on one names (linesAt()). */
let shownStrokes: Stroke[] = [];
/** The sizes the places' names clear (namePlacer()'s clearance()). */
const NAME_SIZES: Sizes = { dot: DOT, ring: RING, pillHalo: PILL_HALO, nameGap: NAME_GAP, nameZooms: NAME_ZOOMS, top: TOP, signSize: SIGN_SIZE, signZoom: SIGN_ZOOM };
/**
 * Where the places' names are put beside their tracks and laid out (namePlacer()): in a worker of their own, as on a
 * phone they froze a join for 0.85 to 1.55 s on the page (#777).
 */
const namesWorker = new Worker(new URL('./namesWorker.ts', import.meta.url), { type: 'module' });
/** And on the page, for a track whose regions the worker can't be handed (handable()), or once it has failed. */
const pageNames = namePlacer(NAME_SIZES);
/** Which of them has the names last put beside their tracks (putNames()), and so lays them out (showNames()). */
let namesOn: 'worker' | 'page' = 'worker';
/** Whether the worker has failed, so that the page puts and lays out the names from then on. */
let namesWorkerFailed = false;
/** The names last put in the worker, as the page would put them, should it fail. */
let putOnPage: (() => void) | undefined;
/** The regions' tracks the worker holds: each handed over once, for as long as the joins name it. */
let handedNames = new Set<Track>();
/** Each region's track's key, which names it to the worker once it holds it, and how many have been given. */
const trackKeys = new WeakMap<Track, number>();
let trackKeyCount = 0;
/** Asks the worker (NamesAsk), moving what `transfer` holds rather than copying it. */
const askNames = (ask: NamesAsk, transfer: Transferable[] = []) => namesWorker.postMessage(ask, transfer);
/** A region's track's key, given once (trackKeys). */
const keyOf = (track: Track) => trackKeys.get(track) ?? (trackKeys.set(track, ++trackKeyCount), trackKeyCount);
/**
 * Where the Lines and rails are made, once for each region's track, and cut into the tiles MapLibre draws them from
 * (lineWork()): handed MapLibre as GeoJSON, it serialised their 54k features for its worker on the page's thread, 3.1 s
 * of a phone's long-distance join, after the page took 0.89 s to make them (#837). MapLibre asks for the tiles through
 * a protocol of their own (LINE_TILES), which hands it the worker's bytes.
 */
const linesWorker = new Worker(new URL('./linesWorker.ts', import.meta.url), { type: 'module' });
/** The tiles' URLs' protocol, and their URL for MapLibre, which the version of the regions in them makes new for each join. */
const LINE_TILES = 'viapeninsula-lines';
const lineTilesUrl = (source: LineSource, version: number) => `${LINE_TILES}://${source}/{z}/{x}/{y}?${version}`;
/** The regions' tracks the worker holds, the regions joined at the last hand-over, the version of the last, and of the last in the tiles. */
let [handedLines, linesVersion, linesIn] = [new Set<Track>(), 0, 0];
/** The tiles asked of the worker and not yet come, by their ask's number. */
const tilesDue = new Map<number, { resolve: (data: ArrayBuffer) => void; reject: (error: unknown) => void }>();
let tileAsks = 0;
const askLines = (ask: LinesAsk, transfer: Transferable[] = []) => linesWorker.postMessage(ask, transfer);
// ponytail: a tile MapLibre no longer wants is still cut, as its abort isn't passed on. Pass it on if the worker lags behind a pan.
addProtocol(LINE_TILES, ({ url }) => {
  const [, source, z, x, y] = /^[^:]+:\/\/(lines|rails)\/(\d+)\/(\d+)\/(\d+)/.exec(url) ?? [];
  if (!source) return Promise.reject(new Error(`Not a Lines' tile: ${url}`));
  const ask = ++tileAsks;
  askLines({ tile: { source: source as LineSource, z: Number(z), x: Number(x), y: Number(y), ask } });
  return new Promise<ArrayBuffer>((resolve, reject) => tilesDue.set(ask, { resolve, reject })).then((data) => ({ data }));
});
// A join's regions in the tiles: MapLibre is given their new URL, and asks for the tiles in view again.
linesWorker.onmessage = ({ data }: MessageEvent<ReturnType<ReturnType<typeof lineWork>>>) => {
  if ('data' in data) {
    tilesDue.get(data.ask)?.resolve(data.data);
    tilesDue.delete(data.ask);
  } else {
    linesIn = data.shown;
    for (const source of ['lines', 'rails'] as const) map.getSource<VectorTileSource>(source)?.setTiles([lineTilesUrl(source, data.shown)]);
  }
};
// ponytail: where the worker fails, the map goes without Lines, as the page did where making them threw. Make them on the page then if a worker ever fails where the page wouldn't.
linesWorker.onerror = linesWorker.onmessageerror = (error: Event) => {
  console.error(error);
  for (const due of tilesDue.values()) due.reject(error);
  tilesDue.clear();
  // Whatever it held when it threw, the next join hands it every region's file again, and onScreen() waits no more.
  [handedLines, linesIn] = [new Set(), linesVersion];
};
askNames({ sizes: NAME_SIZES });
// A layout asked for names, pills or a bearing that have changed since is left for the one asked last, and once the
// worker has failed, any it still sends.
namesWorker.onmessage = ({ data }: MessageEvent<{ ask: number; where: Where[] }>) => {
  if (namesWorkerFailed || !askedNames || data.ask !== askedNames.ask) return;
  laidOut = { of: askedNames, where: data.where };
  drawNames();
};
// Where the worker fails, or a layout it sends can't be read, the page puts and lays out the names as it did before
// #777, and the worker is let go of, with the tracks it holds.
const namesFailed = (error: Event) => {
  console.error(error);
  namesWorker.terminate();
  namesWorkerFailed = true;
  if (namesOn !== 'worker') return;
  putOnPage?.();
  namesOn = 'page';
  askedNames = undefined;
  showNames();
};
namesWorker.onerror = namesWorker.onmessageerror = namesFailed;

/** The track files of a join's regions, where the worker can be handed them: each read from pieces (decodeTrack()). */
function handable(regions: Track[] | undefined): StoredTrack[] | undefined {
  if (namesWorkerFailed) return undefined;
  const files = regions?.map(trackFileOf);
  return files?.every((f) => f && 'traced' in f) ? (files as StoredTrack[]) : undefined;
}
/** A region's track as the Lines' worker is handed it: its file packed, or where it wasn't stored as pieces (before #257), the track itself, copied. */
function linesFile(track: Track): Packed {
  const file = trackFileOf(track);
  if (file && 'traced' in file) return packFile(file, LINE_PARTS);
  // ponytail: copied whole, a structured clone of every point on the page's thread, as #775 measured for the names. Pack
  // it as the pieces' files are if a bundle without them is ever served again.
  const { shapes, lines, strokes, rails } = track;
  return { rest: { shapes, lines, strokes, rails }, numbers: new Float64Array(), lengths: new Int32Array() };
}
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
 * Each place's name: its place's ID, whose board a tap on it opens (#618), its dot, broken into its lines, the zoom it
 * shows from, where its tier lists it, its Stations, and how it's lettered. Where it goes is worked out apart (namesWorker).
 */
let names: { id: string; dot: Point; name: string; nameZoom: number; listed?: number; stations: string[]; style: NameStyle }[] = [];
/** The map's bearing when the names were last put beside their tracks. */
let namesBearing = NaN;
/**
 * How many times Trains call at each Station in the Trips of the days shown (callsIn()), once they've
 * come: those of places in no tier rank their names where they collide, the busier's first (#372).
 * Counted here, not by the build into each region's track, where the count changes with the day of the
 * week and would make Catalonia's 615 KB track a new file in each daily build, for 6 KB of brotli.
 */
let calls = new Map<string, number>();
/** The names, pills and bearing the names' layout was last asked for (showNames()). */
let askedNames: { names: typeof names; pills: typeof pills; bearing: number; ask: number } | undefined;
/** Where the names were last laid out, as asked (`of`): each one's anchor and offset at each of NAME_ZOOMS. */
let laidOut: { of: NonNullable<typeof askedNames>; where: Where[] } | undefined;
// Cut as MapLibre's GeoJSON sources were, 512 px tiles to zoom 18 (lineWork()).
for (const source of ['lines', 'rails'] as const) map.addSource(source, { type: 'vector', tiles: [lineTilesUrl(source, 0)], maxzoom: 18 });
map.addSource('tracks', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
for (const id of ['stations', 'places', 'interchanges', 'station-links']) map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addSource('station-names', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
// Today's Lines and Stations are drawn as soon as its track comes, before the Trips, which are most of the bundle.
// Where no region's track comes, as where the one region in view fails to, the map opens without, and the next
// look fetches it again. The days that have come are shown from there on, once the module is through: a day can
// have come before today's track has (#593), and showing it needs what's declared below. The second look, for
// long distance's region (firstLook()), once what the first brought is on screen.
show((await needed?.track) ?? joinTracks([]));
void Promise.resolve(needed && showArrivals(needed.arrivals)).catch((error: unknown) => console.error(error)).finally(() => onScreen(looked));
// Around midnight the days the map needs change, and each day's build names three more.
setInterval(refreshDays, 60_000);

// Track goes under the basemap's labels; Stations and names go on top of everything.
const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
/** How each Line's stroke is laid out, and its casing alike, so that MapLibre builds their geometry once. */
const lineLayout: LineLayerSpecification['layout'] = { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'sort'] };
/** The colour each Line's stroke is drawn in. */
const lineColour: ExpressionSpecification = ['case', ['to-boolean', ['get', 'shared']], SHARED, ['get', 'colour']];
/** How far right of its track each Line's stroke is drawn, and its casing: `side` line widths, zoomed out. */
const lineOffset = byZoom(APART, (px) => ['*', ['get', 'side'], px]);
/**
 * Where a Line in a tunnel has a Line above it within a line width (`covered`, #417), it's drawn at
 * COVERED_WIDTH of its width and COVERED_OPACITY of its opacity, with its casing, so that the Line above
 * reads as the one on the street and this as the one under it. Its opacity takes the layer's `fade`.
 */
const COVERED_WIDTH = 0.6;
const COVERED_OPACITY = 0.45;
const isCovered: ExpressionSpecification = ['has', 'covered'];
/** A Line's width in px by zoom, and `extra` more for its casing: a covered part's is COVERED_WIDTH of it before that. */
const lineWidth = (extra = 0) => byZoom(WIDTH, (px) => ['+', ['*', px, ['case', isCovered, COVERED_WIDTH, 1]], extra]);
/** An opacity that goes from one value to another by zoom, and for a covered part is COVERED_OPACITY of it. */
const fadedBy = (stops: [zoom: number, opacity: number][]) => byZoom(stops, (opacity) => ['case', isCovered, opacity * COVERED_OPACITY, opacity]);
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
const stretchesFade = fadedBy([[railsZoom - FADE, 1], [railsZoom + FADE, 0]]);
const railsFade = fadedBy([[railsZoom - FADE, 0], [railsZoom + FADE, 1]]);
/** How much wider than its stroke the glow under the Line whose screen it is is, in px, and how opaque (#473). */
const [GLOW_WIDTH, GLOW] = [12, 0.45];
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
/**
 * The suffix of a band's layers for a curve's pieces, drawn with butt ends: round ends overlapping at part opacity
 * showed a bead at every joint while the band faded out, from zoom 14.5 to 15.5 (#620, the maintainer's pick of
 * 19 Oct 2026). Their casing goes over the band's own and under its strokes, so it cuts no gap where a curve meets a
 * stroke, and their strokes over the band's. Outside a sharp turn, a butt end leaves a speck of a px.
 */
const CURVE = '-curve';
const isCurve: ExpressionFilterSpecification = ['has', 'curve'];
/**
 * A side further off its track's middle than any Line's is, in strokes, for the names' text-offset.
 * ponytail: a name further off than this would stop at it. Raise it if a corridor ever draws more than 64 Lines to one side.
 */
const FAR_SIDE = 64;
for (const { source, id, prefix, zooms, nameZooms, opacity, throughOpacity, below } of layered) {
  // The rails have no curves.
  for (const curve of source === 'lines' ? [false, true] : [false]) {
    const suffix = curve ? CURVE : '';
    const filter: ExpressionFilterSpecification = source === 'rails' ? zooms.filter : ['all', zooms.filter, curve ? isCurve : ['!', isCurve]];
    const layout: LineLayerSpecification['layout'] = curve ? { ...lineLayout, 'line-cap': 'butt' } : lineLayout;
    map.addLayer(
      {
        id: `${prefix}-casing${suffix}`,
        type: 'line',
        source,
        'source-layer': source,
        ...zooms,
        filter,
        layout,
        paint: { 'line-color': casing, 'line-width': lineWidth(2), 'line-offset': lineOffset, 'line-opacity': opacity },
      },
      curve ? id : below,
    );
    map.addLayer(
      {
        id: `${id}${suffix}`,
        type: 'line',
        source,
        'source-layer': source,
        ...zooms,
        filter,
        layout,
        paint: {
          'line-color': lineColour,
          'line-width': lineWidth(),
          'line-offset': lineOffset,
          'line-opacity': opacity,
        },
      },
      below,
    );
  }
  // The glow under the Line whose screen it is (#473), under every band's casing, of none till one is shown (showLook()).
  map.addLayer(
    {
      id: `${id}-glow`,
      type: 'line',
      source,
      'source-layer': source,
      ...zooms,
      filter: ['all', zooms.filter, ['==', ['get', 'line'], '']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'colour'], 'line-width': lineWidth(GLOW_WIDTH), 'line-blur': GLOW_WIDTH / 2, 'line-offset': lineOffset, 'line-opacity': byZoom(source === 'rails' ? [[railsZoom - FADE, 0], [railsZoom + FADE, GLOW]] : [[railsZoom - FADE, GLOW], [railsZoom + FADE, 0]], (o) => o) },
    },
    `${prefix}-casing`,
  );
  // Over its own stroke, in its own colour, it doesn't show: only where another Line covers it. Not
  // where Lines on one level cover each other: crowded, or sliding onto the rails.
  map.addLayer(
    {
      id: `${id}-through`,
      type: 'line',
      source,
      'source-layer': source,
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
    'source-layer': source,
    ...zooms,
    ...nameZooms,
    layout: {
      'symbol-placement': 'line',
      // Placed in the manifest's order of their regions, as when every region's Lines were one list (RANK_STEP).
      'symbol-sort-key': ['get', 'rank'],
      'text-field': ['get', 'name'],
      'text-font': FONT,
      'text-size': NAME_SIZE,
      // Each Line's name on its own stroke, `side` strokes off the middle (text-offset is in ems): a vector tile holds no
      // arrays, so the offset goes linearly from one far side to the other, through [0, 0] at the middle (#837).
      'text-offset': byZoom(APART, (px) => ['interpolate', ['linear'], ['get', 'side'], -FAR_SIDE, ['literal', [0, (-FAR_SIDE * px) / NAME_SIZE]], FAR_SIDE, ['literal', [0, (FAR_SIDE * px) / NAME_SIZE]]]),
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
/** An opacity as each part has it at these zooms and a few more, multiplied, going linearly between: ['zoom'] can't be inside a feature's value. */
function placeOpacity(parts: ((zoom: number) => number | ExpressionSpecification)[], zooms: number[] = []): ExpressionSpecification {
  const all = [...new Set([0, 10, FEW_ZOOM, FEW_ZOOM + 1, SIGN_ZOOM - 0.5, SIGN_ZOOM, 14, RAILS - 0.01, RAILS, 22, ...zooms])].sort((a, b) => a - b);
  return ['interpolate', ['linear'], ['zoom'], ...all.flatMap((zoom) => [zoom, ['*', 1, 1, ...parts.map((part) => part(zoom))] as ExpressionSpecification])];
}
/**
 * The zooms a band's dots are drawn over, `from` to `to`, below SIGN_ZOOM, where the marks take over, and the whole zooms
 * their layer spans (placeLayers): none for a band from SIGN_ZOOM on.
 */
function dotBand(band: number): { from: number; to: number; minzoom: number; maxzoom: number; zooms: number[] } | undefined {
  const [from, to] = [bandZooms(band)[0], Math.min(bandZooms(band)[1], SIGN_ZOOM)];
  if (from >= to) return undefined;
  const [minzoom, maxzoom] = [Math.max(linesZoom, Math.floor(from)), Math.ceil(to)];
  return { from, to, minzoom, maxzoom, zooms: Array.from({ length: maxzoom - minzoom + 1 }, (_, i) => minzoom + i) };
}
/** A value going linearly from `a` at `from` to `b` at `to`, held either side. */
function ramp(zoom: number, from: number, a: number, to: number, b: number): number {
  return zoom <= from ? a : zoom >= to ? b : a + ((b - a) * (zoom - from)) / (to - from);
}
/** The marks fading in over the half zoom before SIGN_ZOOM, as the dots fade out. */
function signIn(zoom: number): number {
  return ramp(zoom, SIGN_ZOOM - 0.5, 0, SIGN_ZOOM, 1);
}
/** The rails' marks and links, in at RAILS at once, as the Trains go back on their rails there and the Lines' names switch: a Train standing at a Station stays on its mark. */
function onRails(zoom: number): number {
  return ramp(zoom, RAILS - 0.01, 0, RAILS, 1);
}
/** fewer()'s places, from FEW_ZOOM, fading in by the next zoom. */
function fewIn(zoom: number): number {
  return ramp(zoom, FEW_ZOOM, 0, FEW_ZOOM + 1, 1);
}
// The places as #210's pick has them (#572): below zoom 13, each Station's dot in the middle of its own Lines' strokes in
// each zoom band, a tier's larger than the rest and the top tier's a square, over them where they meet, the Metro's and
// TRAM's places in neither tier only from zoom 11 (fewer()); from 13, each place as its Networks' marks, and an
// interchange as one badge of them; from 15, each Station's own mark on its own track, linked to its place's and its
// interchange's others. Not below zoom 7, where the map draws each Network's track alone, every region's, as it loads
// none there for the view (#266). Each is a symbol layer over whole zooms, cut to its own by its opacity: MapLibre lays
// a symbol layer out in the tiles of the whole zoom its bounds fall in without placing it there, so icons allowed to
// overlap seemed to come and go at each placement, and the map faded them, drawing every frame (#210's review).
const placeLayers = (() => {
  const symbol = { 'icon-allow-overlap': true, 'icon-ignore-placement': true } as const;
  const layers: string[] = [];
  // The links between an interchange's Stations, and a place's several, on the rails: white, ringed as the dots are.
  for (const [id, colour, more] of [['station-links-casing', dotRing, 2], ['station-links', '#fff', 0]] as const) {
    map.addLayer({ id, type: 'line', source: 'station-links', minzoom: RAILS - 1, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colour, 'line-width': byZoom(RING, (px) => LINK_WIDTH + more * px), 'line-opacity': placeOpacity([onRails]) } });
    layers.push(id);
  }
  BANDS.forEach((_, band) => {
    const span = dotBand(band);
    if (!span) return;
    const { from, to, minzoom, maxzoom, zooms } = span;
    const inside = (zoom: number) => (zoom >= from && zoom < to ? 1 : 0);
    // The rest as circles, which MapLibre doesn't place, so their layers can start and end where the band does; fewer()'s
    // in layers of their own, in the bands from FEW_ZOOM, so that no layer's opacity is a feature's.
    for (const few of to > FEW_ZOOM ? [false, true] : [false]) {
      const id = few ? `stations-${band}-few` : `stations-${band}`;
      map.addLayer({
        id,
        type: 'circle',
        source: 'stations',
        minzoom: Math.max(linesZoom, from, few ? FEW_ZOOM : 0),
        maxzoom: to,
        filter: ['all', ['==', ['get', 'band'], band], ['!=', ['get', 'larger'], TOP], ['==', ['get', 'few'], few], ['>=', ['zoom'], ['get', 'from']]],
        layout: { 'circle-sort-key': ['get', 'larger'] },
        paint: {
          'circle-radius': byZoom(DOT, (px) => ['+', px, ['get', 'larger']]),
          'circle-color': '#fff',
          'circle-stroke-color': dotRing,
          'circle-stroke-width': byZoom(RING, (px) => px),
          'circle-opacity': placeOpacity([few ? fewIn : () => 1, (zoom) => 1 - signIn(zoom)]),
          'circle-stroke-opacity': placeOpacity([few ? fewIn : () => 1, (zoom) => 1 - signIn(zoom)]),
        },
      });
      layers.push(id);
    }
    // Over them, the top tier's squares, offset feature by feature, as a symbol layer over whole zooms cut to the band by its opacity.
    map.addLayer({
      id: `stations-${band}-squares`,
      type: 'symbol',
      source: 'stations',
      minzoom,
      maxzoom,
      // Only from the zoom its first Network is drawn from (show(), #781).
      filter: ['all', ['==', ['get', 'band'], band], ['==', ['get', 'larger'], TOP], ['>=', ['zoom'], ['get', 'from']]],
      layout: {
        ...symbol,
        'icon-image': ['get', 'image'],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-size': ['interpolate', ['linear'], ['zoom'], ...zooms.flatMap((zoom) => [zoom, squareSize(zoom)])] as ExpressionSpecification,
        'icon-offset': ['interpolate', ['linear'], ['zoom'], ...zooms.flatMap((zoom) => [zoom, ['array', 'number', 2, ['get', `o${zoom}`]]])] as ExpressionSpecification,
      },
      paint: { 'icon-opacity': placeOpacity([(zoom) => 1 - signIn(zoom), inside], [from - 0.01, from, to - 0.01, to].filter((zoom) => zoom > 0)) },
    });
    layers.push(`stations-${band}-squares`);
  });
  // Each Station's own mark on its own track, from RAILS, as the Trains go back on their rails there.
  map.addLayer({ id: 'stations-rails', type: 'symbol', source: 'stations', minzoom: RAILS - 1, filter: ['==', ['get', 'band'], -1], layout: { ...symbol, 'icon-image': ['get', 'image'], 'icon-size': byZoom(SIGN_SIZE, (px) => px) }, paint: { 'icon-opacity': placeOpacity([onRails]) } });
  layers.push('stations-rails');
  return layers;
})();
/** A Train's dot's radius at a zoom, in px (TRAIN_DOT), or the followed Train's. */
const dotAt = (zoom: number, followed: boolean) => atZoom(TRAIN_DOT.map(([z, px, larger]) => [z, followed ? larger : px]), zoom);
/** A Train's dot's radius, in px, as an expression (TRAIN_DOT). */
const trainDot: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], ...TRAIN_DOT.flatMap(([zoom, px, followed]): (number | ExpressionSpecification)[] => [zoom, ['case', ['get', 'followed'], followed, px]])];
// Zoomed out, Trains are dots over the Stations they stand at, under the Stations' names.
// Below linesZoom, only long distance's (`dotZoom`, pillOf()).
// With no buffer: MapLibre draws a dot or a pill only from the tile its Train is in, so a copy of a Train
// near a tile's side in the next tile's buffer is only more for its worker to cut, which had a draw's tiles
// come back over two frames, each one drawn (#747).
map.addSource('trains', { type: 'geojson', data: trains(), buffer: 0 });
map.addLayer({
  id: 'trains',
  type: 'circle',
  source: 'trains',
  filter: ['all', DRAWN, AS_DOT],
  // A Live Train is filled with its Line's colour and edged in white; a Scheduled one is filled with the paper, and train-dot-dashes rings it.
  layout: { 'circle-sort-key': ['case', ['get', 'followed'], 1, 0] },
  // The Train the map follows is drawn larger, over the rest.
  paint: {
    'circle-radius': trainDot,
    'circle-color': byLive(['get', 'colour'], scheduledFill),
    'circle-stroke-color': '#fff',
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, byLive(0.5, 0), 14, byLive(1.5, 0)],
  },
});
// A Scheduled Train's dot is ringed in dashes of its Line's lettering (#519), as wide as a solid ring
// was, half the dot's radius (dashedDot()), sized with the dot.
map.addImage('train-dot-dashed', dashedDot(DOT_RADIUS), { sdf: true, pixelRatio: 2 });
map.addLayer({
  id: 'train-dot-dashes',
  type: 'symbol',
  source: 'trains',
  filter: ['all', DRAWN, AS_DOT, ['!', ['get', 'live']]],
  layout: {
    'icon-image': 'train-dot-dashed',
    'icon-size': ['interpolate', ['linear'], ['zoom'], ...TRAIN_DOT.flatMap(([zoom, px, followed]): (number | ExpressionSpecification)[] => [zoom, ['/', ['case', ['get', 'followed'], followed, px], DOT_RADIUS]])],
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
  paint: { 'icon-color': ['get', 'lettering'] },
});
// A Live Train has a soft halo in its Line's colour under its marker, dot or pill, which says again
// that it's Live and sets it further apart from a Scheduled one, which has none (#91): on the dark
// basemap, as a glow (GLOW_BLUR), and on the light one only round the followed Train, where every other's read as a smudge
// larger than its pill (#780). A dot's grows with the dot, the followed Train's too, and every pill's
// is one size, HALO_PILL, so a long name glows no more than a short one, all smaller zoomed out from
// 12, where they heap up, and larger from it on dark (haloScale(), #519). trains() works its radius out
// for the zoom: a plain number for each Train is quicker for the map to draw with, each time it draws
// Trains, than an expression of the zoom. It lies under the Lines' names, which it would veil, and the
// places' dots, which it would blur. On a tilted map it keeps its size, as a pill does more than a circle.
// ponytail: a circle, so under a pill longer than a two-letter one it shows above and below it and not
// past its ends, whatever its outline, and round an 8 px pill (pillText()) further than round a local one.
// Blur each outline, drawn larger, if that shows.
map.addLayer(
  {
    id: 'train-halos',
    type: 'circle',
    source: 'trains',
    filter: ['all', DRAWN, ['get', 'live'], darkBasemap || ['get', 'followed']],
    paint: { 'circle-radius': ['get', 'haloRadius'], 'circle-color': ['get', 'colour'], 'circle-blur': darkBasemap ? GLOW_BLUR : HALO_BLUR, 'circle-opacity': darkBasemap ? GLOW_OPACITY : HALO_OPACITY, 'circle-pitch-scale': 'viewport' },
  },
  'line-names',
);
// Each place's name beside its track (showNames()), from its tier's zoom, and where names collide, the
// one named from further out, of a tier's, the one it lists first (#424), and of those in no tier, the
// one with more calls a day (#372). Right of a track, a name's lines line up along the track's side.
map.addLayer({
  id: 'station-names',
  type: 'symbol',
  source: 'station-names',
  // An interchange's places' names give way to its badge's from SIGN_ZOOM till the rails (#572).
  filter: ['all', ['>=', ['zoom'], ['get', 'nameZoom']], ['any', ['!', ['to-boolean', ['get', 'badged']]], ['<', ['zoom'], SIGN_ZOOM], ['>=', ['zoom'], RAILS]]],
  layout: {
    'symbol-sort-key': ['get', 'sort'],
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
// A city's name is drawn once more over the Lines' names and under their Stations' dots and Trains, and so placed
// after the Stations' names and before the Lines' (CITY_ZOOM), from where the Lines begin: the basemap's own label
// under it is then placed after it, collides with it, and isn't drawn.
for (const layer of cityLabels.values()) {
  const over = `${layer.id}-over`;
  // With the filter show() has put on the original by now, as it ran above, and the original's own kept in placeLabels for it to do the same again.
  map.addLayer({ ...structuredClone(layer), id: over, minzoom: Math.max(layer.minzoom ?? 0, linesZoom), maxzoom: Math.min(layer.maxzoom ?? CITY_ZOOM, CITY_ZOOM), filter: map.getFilter(layer.id) ?? undefined }, placeLayers[0]);
  // Where a place is named after its town, the town's label goes (#121), the copy's too: show() adds its filter to both from here on.
  placeLabels.set(over, layer.filter as ExpressionFilterSpecification | undefined);
}
// The point a link names, as a build report's do, ringed 40 px across in the colour of the places'
// names: over the Lines, their names and the places' and Trains' dots, and under the places' names
// and the Trains' pills (#254).
map.addSource('mark', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addLayer({ id: 'mark', type: 'circle', source: 'mark', paint: { 'circle-radius': 20, 'circle-opacity': 0, 'circle-stroke-width': 3, 'circle-stroke-color': nameColour } }, 'station-names');
// Zoomed in (pillOf()), each Train is a pill with its Line's name, over the Stations' names too,
// outlined by its Line's kind of service: a Live one's filled with its Line's colour and edged in
// white, a Scheduled one's white, or the dark basemap's paper, ringed in a dash and lettered in its
// Line's lettering (Pill's `lettering`, #519). Under it, so that no Train's arrow lies on another's
// pill, an arrow points the way the Train runs, just outside it, and turns with the map. The Train the
// map follows has its own pill and arrow, larger, over every other Train's, ringed as a target
// (targetRings()): MapLibre draws a layer's names after all its pills. Each outline is a signed
// distance field, which MapLibre fits to the name and edges: a Scheduled pill's has its dashes in it, as
// a field's edge can't be dashed, and as many whole dashes along its sides as its name takes
// (dashedOutline()), each made the first time the map asks for it. Each a handful of images for every
// Line, as the map sends each image it draws to its worker each time it draws the Trains.
for (const [id, outline] of Object.entries(OUTLINES)) addOutline(id, outline);
map.setMissingStyleImageResolver((id) => {
  const [, outline, n] = /^train-(\w+)-dashed-(\d+)$/.exec(id) ?? [];
  if (!outline || !n || !(outline in OUTLINE_SIZES)) return;
  const { width, height, data, ...fit } = dashedOutline(outline as Outline, Number(n));
  map.addImage(id, { width, height, data }, { sdf: true, pixelRatio: 2, ...fit });
});
for (const [suffix, followed, size] of [['', false, PILL_TEXT], ['-followed', true, FOLLOWED_TEXT]] as const) {
  const filter: ExpressionSpecification = ['all', AS_PILL, ['==', ['get', 'followed'], followed]];
  if (followed) {
    // The target: two rings round the followed Train, dot or pill, in its Line's lettering, and its colour pulsing out from the outer one (pulse()).
    const ring = (id: string, radius: ExpressionSpecification, width: number, opacity: number | ExpressionSpecification): CircleLayerSpecification => ({
      id,
      type: 'circle',
      source: 'trains',
      filter: ['all', DRAWN, ['get', 'followed']],
      paint: { 'circle-radius': radius, 'circle-opacity': 0, 'circle-stroke-width': width, 'circle-stroke-color': ['get', 'lettering'], 'circle-stroke-opacity': opacity, 'circle-pitch-scale': 'viewport' },
    });
    map.addLayer(ring('train-pulse', ['get', 'pulseRadius'], TARGET.outer.width, ['get', 'pulseOpacity']));
    map.addLayer(ring('train-target-outer', ['get', 'outerRing'], TARGET.outer.width, TARGET.outer.opacity));
    map.addLayer(ring('train-target', ['get', 'innerRing'], TARGET.inner.width, TARGET.inner.opacity));
  }
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
  map.addLayer({
    id: `train-pills${suffix}`,
    type: 'symbol',
    source: 'trains',
    filter,
    layout: {
      'icon-image': byLive(['concat', 'train-', ['get', 'outline']], ['get', 'dashed']),
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [0, PILL_PADDING, 0, PILL_PADDING],
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      // Which pill is drawn over which is MapLibre's own, the one lower on screen, as covered() has it (#513). Not by a sort key,
      // which MapLibre draws a key at a time: with a key for each pill, 17% more main thread at rest.
      // ponytail: ranked within a tile, so of two pills either side of a tile's edge, its tile decides. Fine while no name shows over one there.
      // Long distance's, Ouigo's and Media Distancia's smaller, as pillText() has them, but the followed Train's (#780).
      'text-size': followed ? size : ['case', ['<', ['get', 'pillZoom'], LOCAL_PILL_ZOOM], SMALL_TEXT, size],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'icon-color': byLive(['get', 'colour'], scheduledFill),
      'icon-halo-color': byLive('#fff', ['get', 'lettering']),
      'icon-halo-width': byLive(PILL_HALO, DASHED_RING),
      'text-color': byLive(['case', ['get', 'dark'], INK, '#fff'], ['get', 'lettering']),
      // A pill whose name another drawn over it meets shows none, which MapLibre would draw over that pill (#513): unseen, as an empty name would shrink the outline fitted to it.
      'text-opacity': ['case', ['get', 'covered'], 0, 1],
    },
  });
}

// Tapping a Train follows it, and tapping a Station shows its board. Both are small, so a tap near one
// will do, and a Train standing at a Station is the one tapped. A place's name shows its board too,
// where it's drawn under the tap, after a Train or a dot near it (#618). A tap nothing else takes, on a
// Line's stroke or within STROKE_TAP of one, names the Lines drawn there, by their pills (#193), the
// strokes nearest the tap first, and their Alerts, folded away; or on a Closure drawn over them, shows
// what closes it (#341). Any tap clears the ring a link drew (#254).
// ponytail: a name takes only a tap on its own box, where a dot takes one within 10 px, so a tap just
// beside a name is a stroke's. Give names a few px more if taps on them miss.
// ponytail: so a double-click or double-tap that zooms clears it too, its first tap being a tap,
// though a wheel, a pinch or a drag keeps it. Clear it only once no second tap follows if the ring's
// missed after one.
/** The layers the Lines' strokes are drawn in. A tap names the Lines of those along their stretches below railsZoom, and of the rails from it. */
const strokeLayers = layered.flatMap(({ source, id }) => (source === 'lines' ? [id, `${id}${CURVE}`] : [id]));
/** Where a tap names the Lines drawn there, or what closes a Closure. Each tap closes the last one's. */
const linesPopup = new Popup({ closeButton: false, closeOnClick: false, className: 'lines-at', maxWidth: 'none' });
// From SIGN_ZOOM, each place's marks, over the Trains' dots, which are pills by then, and under the names, but where
// its Stations' own go on their tracks, on the rails. An interchange's badge, from SIGN_ZOOM to the rails, with its name in
// bold under it, over the places' names, so that MapLibre places it first, as an interchange's ranks with its highest
// tier's (#119): under them, Plaça Catalunya's gave way to Universitat's at zoom 13 (#210's review). Its name only from
// SIGN_ZOOM's tiles, where the badge is drawn whole: hidden, it would still push the places' names aside.
// Those whose Stations have their own marks on their tracks in a layer of their own, which ends at the rails, so that
// neither layer's opacity is a feature's: one of the zoom alone is quicker for the map to draw with, each time it draws.
for (const [id, railed] of [['station-marks', false], ['station-marks-railed', true]] as const) {
  map.addLayer(
    {
      id,
      type: 'symbol',
      source: 'places',
      minzoom: SIGN_ZOOM - 1,
      ...(railed && { maxzoom: RAILS }),
      filter: ['all', ['!', ['get', 'inBadge']], ['==', ['get', 'railed'], railed]],
      layout: { 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-image': ['get', 'image'], 'icon-size': byZoom(SIGN_SIZE, (px) => px) },
      paint: { 'icon-opacity': placeOpacity([signIn]) },
    },
    'station-names',
  );
}
map.addLayer(
  {
    id: 'station-badges',
    type: 'symbol',
    source: 'interchanges',
    minzoom: SIGN_ZOOM - 1,
    maxzoom: RAILS,
    layout: {
      // ponytail: its icon isn't placed, so another place's name can lie over a badge, as over a dot: placed, following a
      // Train at zoom 14 on the phone drew 8–12% fewer frames than main's. Place it if that shows more than its cost.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-image': ['get', 'image'],
      'icon-size': byZoom(SIGN_SIZE, (px) => px),
      'text-field': ['step', ['zoom'], '', SIGN_ZOOM, ['get', 'name']],
      'text-font': ['Noto Sans Bold'],
      'text-size': BADGE_TEXT,
      'text-anchor': 'top',
      'text-offset': byZoom(SIGN_SIZE, (px) => ['literal', [0, (px * (MARK + 2 * BADGE_PAD)) / 2 / BADGE_TEXT + 0.15]]),
      'text-max-width': PLACE_WRAP,
      'text-optional': true,
    },
    paint: { 'icon-opacity': placeOpacity([signIn]), 'text-opacity': placeOpacity([signIn]), 'text-color': nameColour, 'text-halo-color': halo, 'text-halo-width': NAME_HALO },
  },
  'train-pills',
);
/** The layers that draw the places, which take a tap and the pointer where they're drawn (placeShownAt()): the badges first, over the rest. */
const placeTaken = ['station-badges', 'station-marks', 'station-marks-railed', ...placeLayers.filter((id) => id.startsWith('stations'))];
/** Of the places' drawings within a box, those drawn at the zoom, by their place's or interchange's ID, topmost first. */
function placesDrawn(box: [[number, number], [number, number]] | [number, number]): string[] {
  const zoom = map.getZoom();
  return map.queryRenderedFeatures(box, { layers: placeTaken }).flatMap(({ properties: p, layer }) => {
    const drawn: PlaceDrawn =
      layer.id === 'station-badges' ? { kind: 'badge' } : layer.id.startsWith('station-marks') ? { kind: 'mark', railed: layer.id === 'station-marks-railed' } : p.band === -1 ? { kind: 'rails' } : { kind: 'dot', band: Number(p.band), few: !!p.few };
    return placeShownAt(drawn, zoom) && typeof p.id === 'string' ? [p.id] : [];
  });
}
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
  // A place's dot near the tap, or failing that its name under it.
  const [train, place] = [under ?? near('train-pills-followed') ?? near('train-pills') ?? near('trains'), placesDrawn([[x - 10, y - 10], [x + 10, y + 10]])[0] ?? within(0, ['station-names'])[0]?.properties.id];
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
  else {
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
      // MapLibre focuses the first link or button in a popup as it opens, which scrolls a long one to it: a
      // Closure's Alert that ends in an address opened at its end, its Lines' pills and title out of sight. Back to the top (#391).
      linesPopup.getElement().querySelector('.maplibregl-popup-content')?.scrollTo(0, 0);
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
// names only one's. Check the zoom on each move if that ever misleads.
// Over a Closure too, from its Line's stroke under it. One query of them all on every move of the
// mouse, a drag's too, not a `mouseenter` and a `mouseleave` for each layer: those ran in the order
// the layers were added, so a pointer moving onto a layer added before the one it left, as onto a
// name from a stroke, had its pointer taken off again by the `mouseleave` that came after (#618).
// The places' only where they're drawn (placesDrawn()), as their layers span whole zooms.
const pointed = ['trains', 'train-pills', 'train-pills-followed', 'station-names', ...strokeLayers];
map.on('mousemove', ({ point }) => (map.getCanvas().style.cursor = map.queryRenderedFeatures(point, { layers: pointed }).length || placesDrawn([point.x, point.y]).length ? 'pointer' : ''));
// Escape closes the About dialog on its own, if it's open.
document.addEventListener('keydown', (e) => e.key === 'Escape' && !about.open && (following || boardPlace || lineShown || nearMe || searching || favouritesShown) && closePanel());

// Moves the Trains as often as MOVED says, and once a second works out which Networks the banner
// names. The browser stops asking while the tab is hidden.
const trainSource = map.getSource<GeoJSONSource>('trains');
// MapLibre draws a frame for each of the Trains' tiles that comes back from its worker in a frame of its
// own, so each draw of the Trains (move()) cuts them in tiles two zooms out from the map's, a sixteenth
// as many: at Barcelona z12, 2 on a desktop rather than 12. A tile holds a Train's place to 1/8192 of
// its side, a quarter to half a pixel at those (#747).
const trainTileZoom = () => Math.min(18, Math.max(0, Math.floor(map.getZoom()) - 2));
// And as the Trains' pills are names, MapLibre marks the names' placement it has just made stale each time
// the Trains' tiles come, and draws another frame to place them again. With fadeDuration 0 it places them
// all again each frame it draws anyway, so that frame is let go (#747). With a fade, which MapLibre then
// goes on drawing frames for, the frame stays.
// ponytail: MapLibre's own Style._updatePlacement() (6.11), whose result with no fade is only that stale
// mark. Drop this once MapLibre leaves a placement it has just made in full alone.
const updatePlacement = map.style._updatePlacement.bind(map.style);
map.style._updatePlacement = (...args) => {
  const again = updatePlacement(...args);
  const [, , fadeDuration] = args;
  if (!again || fadeDuration !== 0 || !map.style.pauseablePlacement.isDone()) return again;
  map.style.placement.stale = false;
  return false;
};
// The map can move Trains now, so the tabs, Nearby's among them, and the random follow can show them.
trainButtons.hidden = false;
for (const tab of Object.values(tabs)) tab.disabled = false;
/** When the map last moved, as a drag, a zoom or an easing, or followed a Train, and when its Trains were last drawn, by performance.now(), and at which zoom and bearing. */
let [moved, drawn, drawnAt] = [-Infinity, -Infinity, ''];
requestAnimationFrame(function move(now) {
  if (following || map.isMoving()) moved = now;
  const view = `${map.getZoom()} ${map.getBearing()} ${map.getPitch()}`;
  // ponytail: no more often than IDLE_EVERY once the map stands, so zoomed right in, at 18, a Train at
  // 110 km/h then steps about 4.5 px at a time. Let the rate rise with the zoom there too if that shows.
  const every = following || spreadState.easing || view !== drawnAt ? 0 : Math.min(IDLE_MOST, now - moved > MOVED ? Math.max(IDLE_EVERY, quarterPixel()) : quarterPixel());
  if (now - drawn < every) return requestAnimationFrame(move);
  [drawn, drawnAt] = [now, view];
  const drawing = trains();
  if (trainSource) {
    // ponytail: MapLibre 6.11 reads a source's maxzoom afresh for each tile it asks for; one that read it
    // only once would keep the Trains' tiles at the map's zoom, 12 at Barcelona again.
    trainSource.maxzoom = trainTileZoom();
    trainSource.setData(drawing);
  }
  // The legend's count changes by the second, once the Trips have come, and with it whether there's a
  // Train to follow at random: one the map doesn't follow already.
  if (bundle && performance.now() - countShown > 1000) {
    showCount(drawing.features);
    paceInView();
    followRandomButton.disabled = drawing.features.every((f) => f.properties?.followed);
  }
  if (following) {
    // A Train that has left the map, reaching its last Station or cancelled, is followed no more, but
    // one that has gone within a closed Closure that hides Trains is still a Trip to come out of it (#420):
    // the panel works out which, which the second's refresh would not have by now.
    if (!following.at && !waiting) showPanel();
    if (!following.at && !waiting) closePanel();
    else if (following.at) {
      // Under reduced motion, today's steps (keepInView()); otherwise the map pans with the Train until the viewer lets go.
      if (lessMotion.matches) keepInView(following.at);
      else if (!letGo()) centreOn(following.at);
    }
  }
  showCentring();
  // The panel's times and ages change by the second, a followed Train's countdown as each second of it ends, and
  // where Search finds Train numbers, where their Trains are (#471).
  if ((following || boardPlace || lineShown || nearMe || favouritesShown || (searching && numberQuery(query))) && performance.now() - panelShown > panelDue) showPanel();
  // Which Networks the banner names changes as Trains and the view move, and the banner with it.
  // Zoomed out, only those drawn there, long distance's, can be in view (#247), and a Network with no Trips today only
  // where its track is drawn: long distance's and Media Distancia's below zoom 7, the Metro's and TRAM's from zoom 10 (#781).
  // ponytail: in view by the map's bounds, which on a turned or tilted map take in some of the map
  // around the view too, as followRandom()'s do. Test where each Train and stretch of track is on
  // screen, as keepInView() does, if a banner for a Network just out of view ever shows.
  if (now - bannerChecked > 1000) {
    bannerChecked = now;
    const drawnTrains = drawing.features.filter((f) => map.getZoom() >= f.properties?.dotZoom).map((f) => ({ network: f.properties?.network, at: f.geometry.coordinates as Point }));
    const followedNetwork = drawing.features.find((f) => f.properties?.followed)?.properties?.network;
    const named = bannerNetworks({ unavailable: unavailable(bundle, Date.now(), received), noTrips: noTripsIds }, { trains: drawnTrains, followedNetwork, tracks: shownTracks.filter(({ network }) => map.getZoom() >= (tracksFrom.get(network) ?? 0)) }, map.getBounds().toArray());
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
// And the pace the Trains move at, by those now in view (#666).
map.on('moveend', paceInView);

// The link the map is opened with, and one pasted into the tab later: MapLibre moves the view, or
// openLink() moves the map to the Station where the link names none.
openLink();
addEventListener('hashchange', () => openLink());

/**
 * Draws the Lines and Stations of the days on the map, and each Network's track below zoom 7, with
 * the Networks credited and named in the banner (showZoomedOut()), where they've changed, and once
 * their Trips have come, moves their Trains. With `tripsOnly`, the days that have come before the
 * others' (#593), it puts their Trips on the track the map has drawn and lays nothing out again.
 */
function show(days: Track | Bundle, tripsOnly = false) {
  if ('trips' in days) {
    bundle = days;
    calls = callsIn(days.trips);
  }
  // A day's Trips come after its track, which is drawn already, unless the days joined bring more than one:
  // the names' ranks by calls come with them. And the Trips of the days that have come, before the others' (#593),
  // go on the track the map has, which the track of another day, built earlier, is not drawn over: unless it
  // has none (today's failed to come, and an empty one was drawn in its place), where the first day's is drawn.
  // ponytail: so a Line or Station only the earlier build of a day has isn't drawn, and its Trains are drawn with
  // no colour, until the last step lays the days out. Lay the day that came out as well if that shows.
  if (days.stations === shownStations || (tripsOnly && shownStations?.length)) {
    // The Stations' dots go on their Lines once their Trips say where they call (drawPlaces()).
    if ('trips' in days) drawPlaces();
    if ('trips' in days && !namesDue) showNames();
    return drawClosures();
  }
  shownStations = days.stations;
  // In the order the cards name them, not the track's, which `days.lines` stays in (#399).
  lines = new Map(inNameOrder(days.lines).map((l) => [l.id, l]));
  stationNames = new Map(days.stations.map((s) => [s.id, s.name]));
  // The language each is named in, which the sentences that name them write their articles by (#673).
  setNameLanguages(days.stations, days.networks);
  shownPlaces = new Map(places(days.stations).map((p) => [p.id, p]));
  placeOfStation = new Map([...shownPlaces.values()].flatMap((p) => p.stations.map((station): [string, Place] => [station, p])));
  const shapes = new Map(days.shapes.map((s) => [s.id, s]));
  const slots = new Map<string, Slot[]>();
  // A track built before #176 has none: its Trains go on their own track.
  for (const s of days.slots ?? []) {
    const known = slots.get(`${s.line} ${s.shape}`);
    if (known) known.push(s);
    else slots.set(`${s.line} ${s.shape}`, [s]);
  }
  const keep = new Map(days.networks.map((n) => [n.id, n.runningSide === 'left' ? -1 : 1]));
  // Each Network's Lines, Trains, Stations and Closures from the zoom its Lines' kinds of service have them drawn from (#781).
  const shownFrom = drawnFrom(days.lines);
  placing = { shapes, slots, curves: zones(days.strokes), keep: new Map(days.lines.map((l) => [l.id, keep.get(l.network) ?? 1])), from: shownFrom, closures: new Map() };
  // A track built before #241 names no kinds of service and no pill zooms: its Trains are round pills from zoom 10.
  const pillZoom = new Map(days.networks.map((n) => [n.id, n.pillZoom]));
  pills = new Map(days.lines.map((l) => [l.id, pillOf(l, pillZoom.get(l.network) ?? 10, shownFrom.get(l.network) ?? linesZoom)]));
  const networks = new Map(days.networks.map((n) => [n.id, n]));
  topSpeeds = new Map(days.lines.map((l) => [l.id, profiled(networks.get(l.network), l)?.profile.topSpeed ?? 0]));
  // Lines drawn already, as at the map's second look: the new ones are handed over a frame later (below).
  const again = shownStrokes.length > 0;
  shownStrokes = days.strokes;
  // Each region's Lines and rails are made once, for its track, and handed over once (#733); a region's place in the
  // manifest keeps them in its order, but long distance's and Media Distancia's under the others' (RANK_STEP). Zoomed in, on
  // its own rails, a Line's bends are rounded (#203).
  const lettering = (line: string) => pills.get(line)?.lettering;
  const regions = joinedFrom(days) ?? [{ id: '', track: days }];
  // The Lines are made in the worker, which is handed each region's track file once, as typed arrays (packFile()), and
  // cuts them into tiles (#837). Where Lines are drawn already, it's a frame later (below); the first go at once, which
  // onScreen() waits for. Only the regions new to the worker go, and those no longer joined come off, worked out as
  // they're handed over, as a frame on other days may have been shown.
  const handOver = () => {
    if (regions.length === handedLines.size && regions.every((r) => handedLines.has(r.track))) return;
    const transfer: Transferable[] = [];
    const handed = regions.map(({ id, track }) => {
      // ponytail: the region's place in the manifest when its Lines are made, kept for as long as the worker holds its
      // track. A manifest that reorders the regions under a track the map keeps leaves them in the old order; make them
      // again if it does. Long distance's and Media Distancia y Avant's by their IDs, not long distance's missing extent,
      // which no region has in a manifest from before #266 (#736, #787).
      const how = { rank: Math.max(0, manifest?.regions?.findIndex((r) => r.id === id) ?? 0), under: id === 'long-distance' || id === 'media-distancia-avant', lettering: track.lines.map((l): [string, string | undefined] => [l.id, lettering(l.id)]), shownFrom: [...shownFrom] };
      if (handedLines.has(track)) return { key: keyOf(track), how };
      const file = linesFile(track);
      transfer.push(file.numbers.buffer, file.lengths.buffer);
      return { key: keyOf(track), file, how };
    });
    askLines({ show: { regions: handed, version: ++linesVersion } }, transfer);
    handedLines = new Set(regions.map((r) => r.track));
  };
  if (!again) handOver();
  showZoomedOut(zoomedOut ?? { networks: days.networks, tracks: networkTracks(days), lines: days.lines });
  // A place's marks are its own Networks', but long distance's and Media Distancia's where it has others (markedNetworks()).
  const everywhere = (network: string) => (shownFrom.get(network) ?? linesZoom) < linesZoom;
  const ranked = [...shownPlaces.values()].map((p) => {
    const tier = TIERS.find((t) => t.places.includes(p.id));
    const { nameZoom, larger, size } = tier ?? UNTIERED;
    // A place's dot and name from the zoom the first of its Networks is drawn from: one only the Metro or TRAM serve from zoom 10 (#781).
    const from = p.networks.length ? Math.min(...p.networks.map((n) => shownFrom.get(n) ?? linesZoom)) : linesZoom;
    return { ...p, from, nameZoom: Math.max(nameZoom, from), listed: tier?.places.indexOf(p.id), larger, marked: markedNetworks(p.networks, everywhere), style: { bold: BOLD.has(p.id), size } as NameStyle };
  });
  // Made again only where the places or their marks have changed since show() last made them (#838).
  const marked = ranked.map((p) => ({ ...p, networks: p.marked }));
  const madeOf = readOf(marked);
  if (madeOf !== interchangesFrom) [interchanges, interchangesFrom] = [interchangesOf(marked), madeOf];
  // Every interchange made, for the sign-off of a change to the rule or the hand list (INTERCHANGES).
  if (import.meta.env.DEV) console.debug('interchanges', interchanges.map((i) => `${i.name} (${i.how}): ${i.places.join(' ')}`));
  const byId = new Map(ranked.map((p) => [p.id, p]));
  // One board for each interchange, as one place of all its places' Stations (ADR-0005).
  boards = new Map(
    interchanges.map((i) => {
      const of = i.places.flatMap((id) => byId.get(id) ?? []);
      const all = (key: 'stations' | 'networks' | 'lines') => [...new Set(of.flatMap((p) => p[key]))];
      return [i.id, { id: i.id, name: i.name, stations: all('stations'), networks: all('networks'), lines: all('lines').sort(), lon: i.lon, lat: i.lat }];
    }),
  );
  boardOfPlace = new Map(interchanges.flatMap((i) => i.places.map((id): [string, string] => [id, i.id])));
  // An interchange is named once, by its name, where its highest tier's place is, and from SIGN_ZOOM by its badge till the
  // rails, where that one name goes beside its track again: its places' names give way to it (`badged`), the others' for good.
  const named = new Map(interchanges.map((i) => [i.named, i]));
  const letters = networkNames(days.networks);
  const tiered = ranked.map((p) => {
    const i = named.get(p.id);
    const of = i?.places.flatMap((id) => byId.get(id) ?? []) ?? [];
    const marks = marksWidth(p.marked.map((n) => lettersOf(n, letters)));
    if (i) return { ...p, marks, name: i.name, nameZoom: Math.min(...of.map((q) => q.nameZoom)), style: { bold: of.some((q) => q.style.bold), size: Math.max(...of.map((q) => q.style.size)), badged: true } };
    if (boardOfPlace.has(p.id)) return { ...p, marks, nameZoom: 99, style: { ...p.style, badged: true } };
    return { ...p, marks };
  });
  // Where a place is named after its town, the town's label goes once the place's name shows (#121).
  hideTowns(placeLabels, tiered);
  drawnPlaces = { tiered, networks: new Map(days.networks.map((n) => [n.id, n])), few: fewer(tiered, new Map(days.networks.map((n) => [n.id, n.pillZoom ?? 10]))) };
  drawPlaces();
  drawClosures();
  // The places' names a frame after the Lines are handed over: for a large track, putting them beside their tracks
  // takes about as long as making the Lines, and in one task with those the page drew no frame for 2 s at Barcelona at
  // zoom 12 (#262).
  namesDue = days;
  // A frame on, unless other days are shown meanwhile, which hand over their own.
  const later = (then: () => void) => requestAnimationFrame(() => setTimeout(() => namesDue === days && then()));
  const putNames = (regions: Track[] | undefined) => {
    namesDue = undefined;
    const rows = tiered.map(({ name, style }) => nameLines(name, style));
    const sizes = tiered.map(({ style }, i): [number, number] => [Math.max(...(rows[i] ?? []).map((row) => placeWidth(row, style))), (rows[i]?.length ?? 0) * LINE_HEIGHT * style.size]);
    const placed = tiered.map(({ id, networks, lon, lat, nameZoom, larger, marks, style }, i): NamePlace => ({ id, dot: [lon, lat], served: networks, size: sizes[i] ?? [0, 0], nameZoom, larger, marks, type: style.size }));
    const files = handable(regions);
    if (regions && files) {
      // Each region's track file the worker doesn't hold, handed over (packFile()), and the others by their keys.
      const transfer: Transferable[] = [];
      const handed = regions.map((track, i) => {
        const key = keyOf(track);
        if (handedNames.has(track)) return { key };
        const file = packFile(files[i] as StoredTrack);
        transfer.push(file.numbers.buffer, file.lengths.buffer);
        return { key, file };
      });
      askNames({ put: { regions: handed, keep: [...placing.keep], places: placed } }, transfer);
      [handedNames, namesOn] = [new Set(regions), 'worker'];
      const { keep } = placing;
      putOnPage = () => pageNames.put(regions, false, keep, placed);
    } else {
      pageNames.put(regions ?? [days], !regions, placing.keep, placed);
      namesOn = 'page';
    }
    names = tiered.map(({ id, nameZoom, listed, stations, style, lon, lat }, i) => ({ id, dot: [lon, lat], name: (rows[i] ?? []).join('\n'), nameZoom, listed, stations, style }));
    showNames();
  };
  // Worked out a region at a time, and at a join only for the places it can move (#733): in the worker, which files a
  // region's shapes as it's handed them (#777), or on the page from the regions' shapes filed a frame before, as long
  // distance's alone take some 0.15 s (#770).
  const fileNames = () => {
    const regions = splitBy(days, joinedFrom(days)?.map((r) => r.track));
    if (handable(regions)) return putNames(regions);
    for (const track of regions ?? [days]) fileShapes(track.shapes);
    later(() => putNames(regions));
  };
  if (again) {
    later(() => {
      handOver();
      later(fileNames);
    });
  } else later(fileNames);
}

/**
 * Draws the places (#572): each Station's dot in each zoom band in the middle of its own Lines' strokes (onLines()), or
 * where none of its place's is, as before their Trips have come or for a place with none, a dot at the place; from the
 * rails, each Station's own mark where its Trips call on its own track, the one nearest its own point, linked to its
 * place's and interchange's others; each place's marks at its point, and each interchange's badge at its places' middle.
 */
function drawPlaces() {
  const { tiered, networks, few: fewOnes } = drawnPlaces;
  const began = performance.now();
  // Where each Station's Trips call along their shapes, once for each Line and shape.
  const calls = new Map<string, Map<string, LineCall>>();
  for (const trip of bundle?.trips ?? []) {
    for (const { station, dist } of trip.calls) {
      const of = calls.get(station) ?? new Map<string, LineCall>();
      of.set(`${trip.line} ${trip.shape}`, { line: trip.line, shape: trip.shape, dist });
      calls.set(station, of);
    }
  }
  const stations = new Map((shownStations ?? []).map((s) => [s.id, s]));
  const short = networkNames([...networks.values()]);
  const marksOf = (of: string[]): Mark[] => of.map((n) => ({ letters: lettersOf(n, short), colour: networks.get(n)?.colour ?? NO_COLOUR }));
  const markOf = (of: string[]) => markImage(marksOf(of));
  const { slots, shapes } = placing;
  const railsAt = new Map<string, Point>();
  const features: GeoJSON.Feature[] = [];
  for (const p of tiered) {
    const props = { id: p.id, larger: p.larger, from: p.from, few: fewOnes.has(p.id), ...(p.larger === TOP && { image: squareImage() }) };
    const own = p.stations.map((id) => ({ id, calls: [...(calls.get(id)?.values() ?? [])] }));
    BANDS.forEach((_, band) => {
      const zooms = dotBand(band)?.zooms;
      if (!zooms) return;
      const placed = own.flatMap(({ calls: c }) => onLines(c, slots, shapes, band) ?? []);
      for (const { point, heading, side } of placed.length ? placed : [{ point: [p.lon, p.lat] as Point, heading: 0, side: 0 }]) {
        if (p.larger === TOP) {
          // How far right of its centreline, in the image's px, which its size scales.
          const offsets = Object.fromEntries(zooms.map((zoom) => [`o${zoom}`, [(side * atZoom(APART, zoom)) / squareSize(zoom), 0]]));
          features.push({ type: 'Feature', properties: { ...props, band, heading, ...offsets }, geometry: { type: 'Point', coordinates: point } });
          continue;
        }
        // A dot's a circle, which can't be offset feature by feature: its point is as far right of its centreline, in
        // metres, as the middle of its Lines' strokes is at its band's own zoom.
        // ponytail: so half a zoom either side, it's up to a third of that off the middle of its Lines' strokes, about a px
        // beside four Lines. Lay each band's dots out at its half zooms too if that shows.
        const zoom = BANDS[band] ?? 10;
        const metres = side * atZoom(APART, zoom) * pixelMetres(zoom) * Math.cos((point[1] * Math.PI) / 180);
        const h = (heading * Math.PI) / 180;
        const at: Point = [point[0] + (metres * Math.cos(h)) / (DEGREE * Math.cos((point[1] * Math.PI) / 180)), point[1] - (metres * Math.sin(h)) / DEGREE];
        features.push({ type: 'Feature', properties: { ...props, band }, geometry: { type: 'Point', coordinates: at } });
      }
    });
    for (const { id, calls: c } of own) {
      const at = stations.get(id);
      const near = (q: Point) => (at ? Math.hypot(q[0] - at.lon, q[1] - at.lat) : 0);
      const rails = c.flatMap(({ shape, dist }) => {
        const on = shapes.get(shape);
        return on ? [pointAt(on, dist)] : [];
      }).filter((q) => q.every(Number.isFinite)).sort((a, b) => near(a) - near(b))[0];
      if (!rails) continue;
      railsAt.set(id, rails);
      features.push({ type: 'Feature', properties: { id: p.id, band: -1, image: markOf(markedNetworks(at?.networks ?? p.marked, (n) => !p.marked.includes(n))) }, geometry: { type: 'Point', coordinates: rails } });
    }
  }
  map.getSource<GeoJSONSource>('stations')?.setData({ type: 'FeatureCollection', features });
  const inBadge = new Set(interchanges.flatMap((i) => i.places));
  map.getSource<GeoJSONSource>('places')?.setData({
    type: 'FeatureCollection',
    features: tiered.map((p) => ({ type: 'Feature', properties: { id: p.id, inBadge: inBadge.has(p.id), railed: p.stations.some((s) => railsAt.has(s)), image: markOf(p.marked) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
  });
  map.getSource<GeoJSONSource>('interchanges')?.setData({
    type: 'FeatureCollection',
    features: interchanges.map((i) => ({ type: 'Feature', properties: { id: i.id, name: i.name, image: badgeImage(marksOf(i.networks)) }, geometry: { type: 'Point', coordinates: [i.lon, i.lat] } })),
  });
  // On the rails, an interchange's Stations linked, and a place's several, in a line along the two furthest apart.
  const groups = [...interchanges.map((i) => tiered.filter((p) => i.places.includes(p.id))), ...tiered.filter((p) => p.stations.length > 1 && !inBadge.has(p.id)).map((p) => [p])];
  map.getSource<GeoJSONSource>('station-links')?.setData({
    type: 'FeatureCollection',
    features: groups.flatMap((g) => {
      const points = g.flatMap((p) => p.stations.flatMap((s): Point[] => { const at = railsAt.get(s); return at ? [at] : []; }));
      return points.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: inLine(points) } }] : [];
    }),
  });
  // For the measures' scripts: how long each drawing took the main thread.
  if (import.meta.env.DEV) performance.measure('places-draw', { start: began });
}

/** Points in the order they lie along the line joining the two furthest apart, for a link along them. */
function inLine(points: Point[]): Point[] {
  let [a, b]: [Point, Point] = [points[0] ?? [0, 0], points[1] ?? [0, 0]];
  for (const p of points) for (const q of points) if (Math.hypot(p[0] - q[0], p[1] - q[1]) > Math.hypot(a[0] - b[0], a[1] - b[1])) [a, b] = [p, q];
  const along = (p: Point) => (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  return points.toSorted((p, q) => along(p) - along(q));
}

/** An image `w`×`h` px, drawn at the screen's pixel ratio. */
function canvasImage(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): ImageData {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [Math.ceil(w * IMAGE_RATIO), Math.ceil(h * IMAGE_RATIO)];
  const c = canvas.getContext('2d');
  if (!c) return new ImageData(canvas.width, canvas.height);
  c.scale(IMAGE_RATIO, IMAGE_RATIO);
  paint(c);
  return c.getImageData(0, 0, canvas.width, canvas.height);
}
/** Adds an image to the map as `id`, once. */
function image(id: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): string {
  if (map.hasImage(id)) return id;
  painted.set(id, [w, h, paint]);
  map.addImage(id, canvasImage(w, h, paint), { pixelRatio: IMAGE_RATIO });
  return id;
}
/** The top tier's square, railisland's, white, ringed in the nameboard's ink on both basemaps, as #212's board heading is. */
function squareImage(): string {
  return image('place-square', 20, 20, (c) => {
    c.beginPath();
    c.roundRect(2, 2, 16, 16, 4);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = BOARD_INK;
    c.stroke();
  });
}
/** Draws Networks' marks side by side from `x`, their middles at `y`: white, ringed and lettered in their colour darkened to read on white (lettering()). */
function paintMarks(c: CanvasRenderingContext2D, marks: Mark[], x: number, y: number) {
  for (const { letters, colour } of marks) {
    const [w, ink] = [markWidthOf(letters), lettering(colour, '#ffffff')];
    c.beginPath();
    c.roundRect(x + MARK_RING / 2, y - MARK / 2 + MARK_RING / 2, w - MARK_RING, MARK - MARK_RING, (MARK - MARK_RING) / 2);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = MARK_RING;
    c.strokeStyle = ink;
    c.stroke();
    c.fillStyle = ink;
    c.font = `bold ${letters.length > 1 ? MARK_TEXT - 1 : MARK_TEXT + 0.5}px "Nunito Sans"`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(letters, x + w / 2, y + 0.5);
    x += w + 2;
  }
}
/** A place's marks, its Networks' side by side. */
function markImage(marks: Mark[]): string {
  const w = marksWidth(marks.map((m) => m.letters));
  return image(`place-mark-${marks.map((m) => m.letters + m.colour).join('+')}`, w + 2, MARK + 2, (c) => paintMarks(c, marks, 1, (MARK + 2) / 2));
}
/** An interchange's badge: its Networks' marks side by side in a white rounded box ringed as the dots are. */
function badgeImage(marks: Mark[]): string {
  const [w, h] = [marksWidth(marks.map((m) => m.letters)) + 2 * BADGE_PAD, MARK + 2 * BADGE_PAD];
  return image(`place-badge-${marks.map((m) => m.letters + m.colour).join('+')}`, w + 2, h + 2, (c) => {
    c.beginPath();
    c.roundRect(1, 1, w, h, h / 2);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = BADGE_RING;
    c.strokeStyle = dotRing;
    c.stroke();
    paintMarks(c, marks, 1 + BADGE_PAD, 1 + h / 2);
  });
}

/**
 * Draws long distance's and Media Distancia's tracks below zoom 7 (#190, #781), and credits the Networks and names them in the
 * banner: every region's, from the file below zoom 7 (#266), so that zoomed out the map needs no region
 * loaded, or until that file has come, or where the manifest names none, the days on the map's.
 */
function showZoomedOut({ networks, tracks, lines }: Pick<ZoomedOut, 'networks' | 'tracks' | 'lines'>) {
  const colours = new Map(networks.map((n) => [n.id, n.colour]));
  // Only the Networks drawn at every zoom, long distance's and Media Distancia's, or, from a file that names no Lines, every one (#781).
  tracksFrom = drawnFrom(lines ?? []);
  shownTracks = tracks;
  map.getSource<GeoJSONSource>('tracks')?.setData({
    type: 'FeatureCollection',
    features: tracks.filter(({ network }) => (tracksFrom.get(network) ?? 0) < linesZoom).map(({ network, coordinates }) => ({ type: 'Feature', properties: { colour: colours.get(network) }, geometry: { type: 'LineString', coordinates } })),
  });
  credited = networks;
  showCredits();
  showBanner();
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
  const hides = hiding(shownClosures, bundle ? seenWithin(bundle, Date.now(), received, shownClosures) : [], lifted, mapTime(Date.now(), received), alerts);
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
  // Not in the bands below its Network's zoom, where its Line isn't drawn (#781).
  const strokes = first && line ? closureStrokes(id, first, placing.slots.get(`${id} ${first.shape}`) ?? [], placing.curves).filter(({ band = GRAPH_BAND }) => (BANDS[band] ?? 0) >= (placing.from.get(line.network) ?? 0)) : [];
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
 * Where a Train is drawn at a zoom: zoomed out, until the Lines are back on the rails, on its Line's
 * stroke, half a line width to the side its Network's Trains keep to, so that Trains going opposite
 * ways show apart (onStroke()); from there, on its rails. Far out a stroke lies kilometres from the
 * rails, and differently in each zoom band, so where it's drawn at one zoom is not where it is at
 * another (#378).
 * ponytail: takes the Network's running side, so L2's Trains between Tetuan and Paral·lel, and
 * Cercanías Madrid's beyond Pinar de las Rozas, which keep left, sit half a line width to the wrong
 * side zoomed out. Publish each shape's side of its double track from the trace if that ever shows.
 */
function whereDrawn({ trip, dist, lon, lat }: Pick<Train, 'trip' | 'dist' | 'lon' | 'lat'>, zoom: number): Point {
  const on = zoom < railsZoom ? onStroke(placing.slots.get(`${trip.line} ${trip.shape}`), placing.shapes, dist, zoom, placing.keep.get(trip.line) ?? 1, placing.curves) : undefined;
  return on ?? [lon, lat];
}

/**
 * Every Train on the map now, in its Line's colour, Live or Scheduled, where whereDrawn() has it, but
 * for a Scheduled one within a closed Closure that hides Trains (trainsAt(), hiding(), #345). A tapped
 * group of Trains standing together at a Station goes side by side across their track (spreading()),
 * so that each can be seen and tapped (#129).
 */
function trains(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const zoom = map.getZoom();
  const [followed, bearing] = [followedId(), map.getBearing()];
  if (following) following.at = undefined;
  const placed = (bundle ? trainsAt(bundle, Date.now(), received, hidingClosures) : []).map((train) => {
    const { trip, heading, standsAt } = train;
    const pill = pills.get(trip.line);
    const box = pill && (trip.id === followed ? pill.followedBox : pill.box);
    // As a pill, with its edge, on screen.
    const asPill = pill && box && zoom >= pill.zoom ? { id: trip.id, heading: heading - bearing, box: [box[0] + PILL_HALO, box[1] + PILL_HALO] as [number, number], standsAt } : undefined;
    return { train, pill, box, asPill, at: whereDrawn(train, zoom) };
  });
  placedTrains = placed;
  standingPills = placed.flatMap(({ asPill, at }) => (asPill?.standsAt ? [{ ...asPill, standsAt: asPill.standsAt, at }] : []));
  // A spread group folds once fewer than two of its Trains stand at its Station drawn as pills, as zoomed out.
  const { group } = spreadState;
  if (group && standingPills.filter((p) => group.ids.has(p.id) && p.standsAt === group.station).length < 2) spreadState.group = undefined;
  // Only the group's Trains, and those moved aside, easing back, are put on screen.
  const spreadable = placed.flatMap(({ asPill, at }): Drawn[] => (asPill && (spreadState.group?.ids.has(asPill.id) || spreadState.moved.has(asPill.id)) ? [{ ...asPill, at: projected(at) }] : []));
  const aside = spread(spreadable, performance.now(), spreadState.group);
  spreadState = { group: spreadState.group, moved: aside, easing: [...aside].some(([id, px]) => spreadState.moved.get(id) !== px) || aside.size !== spreadState.moved.size };
  // Each pill in view where it's drawn, in trains()' order, for those whose names a pill over them covers (covered(), #513).
  // ponytail: in view by its Train's point, so a pill reaching in from just off the map's edge covers nothing. Pad the bounds by a pill if a name shows on one there.
  const [bounds, inView] = [map.getBounds(), [] as Named[]];
  const features = placed.map(({ train: { trip, heading, live }, pill, box, asPill, at }): GeoJSON.Feature<GeoJSON.Point> => {
    const [out, onScreen] = [aside.get(trip.id), spreadable.find((d) => d.id === trip.id)?.at];
    const right = rightOf(heading, bearing);
    const coordinates: Point = out && onScreen ? (map.unproject([onScreen[0] + out * right[0], onScreen[1] + out * right[1]]).toArray() as Point) : at;
    if (following && trip.id === followed) [following.at, following.zoom] = [coordinates, zoom];
    if (pill && asPill && bounds.contains(coordinates)) inView.push({ id: trip.id, at: projected(coordinates), box: asPill.box, name: pill.nameBox });
    const line = lines.get(trip.line);
    const isFollowed = trip.id === followed;
    // The followed Train's target, out from its pill's box or its dot (targetRings()), and where its pulse is now, which stands still where the viewer prefers less motion.
    const [innerRing, outerRing] = isFollowed ? targetRings(pill && box && zoom >= pill.zoom ? Math.hypot(...box) : dotAt(zoom, true)) : [];
    const [pulseRadius, pulseOpacity] = outerRing === undefined ? [] : lessMotion.matches ? [outerRing, 0] : pulse(outerRing, Date.now());
    return {
      type: 'Feature',
      properties: {
        id: trip.id,
        colour: line?.colour,
        lettering: pill?.lettering,
        // Which Network's banner it shows (bannerNetworks()).
        network: line?.network,
        live,
        followed: isFollowed,
        heading,
        name: pill?.name,
        outline: pill?.outline,
        // A Scheduled pill's dashed outline (dashedOutline()).
        dashed: pill && box && !live ? `train-${pill.outline}-dashed-${dashesAcross(pill.outline, box)}` : undefined,
        dark: pill?.dark,
        pillZoom: pill?.zoom,
        dotZoom: pill?.dotZoom ?? linesZoom,
        reach: box && reach(box, heading - bearing),
        // Its halo's radius: HALO_DOT times its dot's, or from its Line's pill zoom, every pill's HALO_PILL, by the zoom (haloScale()).
        haloRadius: (pill && zoom >= pill.zoom ? HALO_PILL : HALO_DOT * dotAt(zoom, isFollowed)) * haloScale(zoom, darkBasemap),
        innerRing,
        outerRing,
        pulseRadius,
        pulseOpacity,
        covered: false,
      },
      geometry: { type: 'Point', coordinates },
    };
  });
  const under = covered(inView, followed);
  for (const f of features) if (f.properties && under.has(f.properties.id)) f.properties.covered = true;
  return { type: 'FeatureCollection', features };
}

/**
 * Puts each place's name beside its own Networks' track as the track lies on screen now (namePlacer()'s lay(), in the
 * worker, or on the page), once the names, the pills it clears or the bearing have changed since it was asked, and
 * sorts them for where they collide (nameSort(), #372): the calls that come with the Trips rank them again without
 * laying them out.
 */
function showNames() {
  namesBearing = map.getBearing();
  if (askedNames?.names !== names || askedNames.pills !== pills || askedNames.bearing !== namesBearing) {
    askedNames = { names, pills, bearing: namesBearing, ask: (askedNames?.ask ?? 0) + 1 };
    if (namesOn === 'page') laidOut = { of: askedNames, where: pageNames.lay(pills, namesBearing) };
    else askNames({ lay: { pills: [...pills].map(([line, { zoom, box }]) => [line, { zoom, box }]), bearing: namesBearing, ask: askedNames.ask } });
  }
  drawNames();
}

/** The names where they were laid out, once they have been as last asked (showNames()). */
function drawNames() {
  if (!laidOut || laidOut.of !== askedNames) return;
  const { where } = laidOut;
  const shown = laidOut.of.names;
  map.getSource<GeoJSONSource>('station-names')?.setData({
    type: 'FeatureCollection',
    features: shown.map(({ id, dot, name, nameZoom, listed, stations, style }, i): GeoJSON.Feature => {
      const sort = nameSort({ nameZoom, listed, stations }, calls);
      return { type: 'Feature', properties: { id, name, nameZoom, sort, ...style, ...where[i] }, geometry: { type: 'Point', coordinates: dot } };
    }),
  });
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

/**
 * Works out the pace Trains move at, from the fastest Line with a Train in view (fastestInView()). None
 * where there's no Train in view, as where the map opens before the Trips have come: then quarterPixel()
 * is endless, and Trains move as seldom as IDLE_MOST lets them.
 * ponytail: the view's bounding box, by each Train's point, so a pill reaching in from just off its edge
 * keeps the pace in view, and, the map turned, its corners count, and tilted, all up to its horizon. A Train
 * coming into a still view, or days that come, set it at the next second's (move()). Pad the box by a pill
 * if that steps visibly.
 */
function paceInView() {
  const bounds = map.getBounds();
  fastest = fastestInView(placedTrains.map(({ train, at }) => ({ line: train.trip.line, at })), (at) => bounds.contains(at), topSpeeds);
}

/** How long the fastest Train in view, at its Line's top speed, takes to move a quarter of a pixel where the map is, in ms. */
function quarterPixel(): number {
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
  outline: Outline;
  dark: boolean;
  /** What its Line's colour letters its name in, rings its Scheduled Trains, colours its Trains' arrows and letters its name along its stroke in: lettered to read at 4.5:1 on a Scheduled Train's fill, the dark basemap's paper or white (lettering(), #519). */
  lettering: string;
  zoom: number;
  /** The zoom its Trains are drawn from, as dots: a long-distance Line's at every zoom, as ADR-0010 has AVE y Larga Distancia's (#262), and every other's from linesZoom, where the Lines are, or from its Network's zoom where that's later, as the Metro's and TRAM's (drawnFrom(), #781). */
  dotZoom: number;
  box: [number, number];
  followedBox: [number, number];
  /** How far its name reaches either side of its Train and above and below it, in px, on a pill not followed (covered(), #513). */
  nameBox: [number, number];
}

/** How a Line's Trains are drawn as pills from a zoom, its Network's, outlined by its kind of service and lettered as large as pillText() has it for that zoom. */
function pillOf({ name, colour, kind }: Line, zoom: number, shownFrom: number): Pill {
  const outline = outlineOf(kind);
  const width = textWidth(name, `bold ${PILL_TEXT}px ${TYPEFACE}`);
  return { name, outline, dark: darkInk(colour), lettering: lettering(colour, scheduledFill), zoom, dotZoom: kind === 'long-distance' ? 0 : Math.max(linesZoom, shownFrom), box: boxOf(outline, width, pillText(zoom)), followedBox: boxOf(outline, width, FOLLOWED_TEXT), nameBox: nameBoxOf(width, pillText(zoom)) };
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
  const image = field(w, h, outside);
  map.addImage(`train-${id}`, { width: image.width, height: image.height, data: image.data }, { sdf: true, pixelRatio: 2, ...(across === undefined ? {} : fitOf(image, h, across)) });
}

/** Shows the interface in the viewer's language: on start, and again each time they switch it. */
function showLanguage() {
  document.documentElement.lang = language();
  languageCode.textContent = language().toUpperCase();
  languageSwitch.title = t('language');
  languageSwitch.setAttribute('aria-label', t('language'));
  legend.title = t('about');
  // Each tab's label is its name, under its icon.
  nav.setAttribute('aria-label', t('tabBar'));
  tabs.search.replaceChildren(icon('search'), t('search'));
  tabs.nearby.replaceChildren(icon('nearby'), t('nearbyButton'));
  tabs.favourites.replaceChildren(icon('star'), t('favourites'));
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

/**
 * Counts the Trains on the map for the legend, every one and not only those in view, Live and Scheduled.
 * Not none while another day's Trips are still to come, which could have some: the legend keeps to its words
 * until they have, as a board's and Nearby's "none" do (#593).
 */
function showCount(features: GeoJSON.Feature[]) {
  countShown = performance.now();
  if (daysComing && !features.length) return;
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
  [boardPlace, lineShown, nearMe, searching, favouritesShown, back] = [undefined, undefined, undefined, false, false, undefined];
  trainSource?.setData(trains());
  openPanel(up);
  writeLink();
  const at = followedAt();
  if (at) easeOnto(at, true);
  // A Trip still to come, its Train not on the map yet: to its first Station, which it leaves from (#322),
  // or where it comes out of the Closure it's within (#420).
  else if (waiting) {
    const first = startOf();
    if (first) easeOnto(first);
  }
}

/**
 * Where the Train the map follows is drawn at the zoom easeOnto() takes the map to, so that the ease
 * ends with it in the middle and no second move brings it there (#378). Not where it was last drawn,
 * which, zoomed out, is on its stroke there, kilometres from where it's drawn at the zoom eased to,
 * and under reduced motion, where the first ease has jumped the map to that zoom already, is from the
 * one before. Where it was drawn at that zoom already, as it was drawn, spread aside with its group
 * as it may be (#129); otherwise where it's drawn at that zoom, as far aside as its group put it, in px.
 * ponytail: that distance aside taken as if the map were flat, so on a tilted map the Train ends a
 * little off the middle of the map, and centreOn() jumps the rest. Unproject it at the zoom eased to
 * if that shows.
 */
function followedAt(): Point | undefined {
  const [at, drawn] = [following?.at, following?.zoom];
  const zoom = Math.max(map.getZoom(), FOLLOW_ZOOM);
  if (!at || drawn === undefined || zoom === drawn) return at;
  const train = bundle && trainAt(bundle, Date.now(), received, followedId() ?? '', hidingClosures);
  if (!train) return at;
  // A px is 2 ** (drawn - zoom) of the distance it was at the zoom it was drawn at.
  const [was, now, scale] = [whereDrawn(train, drawn), whereDrawn(train, zoom), 2 ** (drawn - zoom)];
  return [now[0] + (at[0] - was[0]) * scale, now[1] + (at[1] - was[1]) * scale];
}

/**
 * The Station the Trip the panel shows, whose Train isn't on the map, comes onto it at, where the map
 * eases onto (#322): the first Station a Trip still to come leaves from, or where a Train within a
 * closed Closure comes out of it, the first it has still to leave that it stops at (#420).
 */
function startOf(): Point | undefined {
  const first = waiting?.upcoming.find((c) => !c.skipped)?.station;
  const at = shownStations?.find((s) => s.id === first);
  return at && [at.lon, at.lat];
}

/** What the panel shows now, to go Back to (#322): none while it shows no Train, board, Line's screen (#473) or Nearby that's found the viewer. */
function here(): NonNullable<typeof back> | undefined {
  const [up, scroll] = [pulledUp, panel.querySelector('.sheet-body')?.scrollTop ?? 0];
  if (following) return { to: 'train', day: following.day, trip: following.trip, headsign: bundle?.trips.find((t) => t.id === followedId())?.headsign ?? '', up, scroll };
  if (boardPlace) return { to: 'board', place: boardPlace, up, scroll };
  if (lineShown) return { to: 'line', line: lineShown, up, scroll };
  return nearMe && typeof nearMe !== 'string' ? { to: 'nearby', near: nearMe, up, scroll } : undefined;
}

/** Opens another panel from this one, by a departure, a Station or a Search row, which has a Back to this one, but to Search, which here() doesn't name (#322, #471). */
function openFrom(open: () => void, at?: Point) {
  const [was, keyboard] = [here(), panel.contains(document.activeElement)];
  open();
  back = was;
  showPanel();
  // The Back row makes the header taller, so the map's padding and where it eases to are worked out again.
  const train = at ? undefined : followedAt();
  const to = at ?? train ?? (waiting ? startOf() : undefined);
  if (to) easeOnto(to, to === train);
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
    [following, boardPlace, lineShown, nearMe, searching, favouritesShown, back] = [undefined, to.to === 'board' ? to.place : undefined, to.to === 'line' ? to.line : undefined, to.to === 'nearby' ? to.near : undefined, false, false, undefined];
    trainSource?.setData(trains());
    openPanel(to.up);
    writeLink();
    map.easeTo({ padding: panelPadding() });
  }
  panel.querySelector('.sheet-body')?.scrollTo(0, to.scroll);
  if (keyboard) focusTitle();
}

/**
 * Brings `at` into the middle of the map beside the panel, at FOLLOW_ZOOM, or closer if the map already is: a Train
 * the map follows (followedAt()), where it will be once the ease ends (`train`, ahead(), #682), or a Station whose
 * link names no view (#292).
 */
function easeOnto(at: Point, train = false) {
  const zoom = Math.max(map.getZoom(), FOLLOW_ZOOM);
  map.easeTo({ center: train ? ahead(at, EASE, zoom) : at, zoom, padding: panelPadding() });
}

/** The place whose board this is, by its ID in places(), or the interchange, as one place of all its places' Stations. */
function boardOf(id: string): Place | undefined {
  return boards.get(id) ?? shownPlaces.get(id);
}

/** Shows a place's board, by its ID in places() or its interchange's, following no Train. */
function showBoard(place: string) {
  // An interchange's place's is the interchange's (ADR-0005).
  [following, boardPlace, lineShown, nearMe, searching, favouritesShown, back] = [undefined, boardOfPlace.get(place) ?? place, undefined, undefined, false, false, undefined];
  trainSource?.setData(trains());
  openPanel(false);
  writeLink();
  map.easeTo({ padding: panelPadding() });
}

/**
 * Shows a Line's screen (#473), by its ID, following no Train, over the map fitted to it above the sheet
 * (fitLine()), its body scrolled to two rows before its first Train, which it opens at.
 */
function showLine(line: string) {
  const keyboard = panel.contains(document.activeElement);
  [following, boardPlace, lineShown, nearMe, searching, favouritesShown, back] = [undefined, undefined, line, undefined, false, false, undefined];
  trainSource?.setData(trains());
  openPanel(false);
  writeLink();
  const rows = [...panel.querySelectorAll<HTMLElement>('.line-strip > li')];
  const first = rows.findIndex((row) => row.classList.contains('train'));
  panel.querySelector('.sheet-body')?.scrollTo(0, first > 0 ? (rows[Math.max(0, first - 2)]?.offsetTop ?? 0) : 0);
  fitLine();
  if (keyboard) focusTitle();
}

/**
 * Fits the map to the Line whose screen it is, by its Stations, above or beside the panel and clear of the
 * cards over the map (clearOfCards()), as a tap's popup is: flat, as tilted, its far end would lie
 * small at the top, or the map zoom out further for it.
 */
function fitLine() {
  const at = new Set(stripOf.strip.map((s) => s.station));
  const points = (shownStations ?? []).filter((s) => at.has(s.id)).map((s): Point => [s.lon, s.lat]);
  const padding = panelPadding();
  if (!points.length) return void map.easeTo({ padding });
  const [lons, lats, box] = [points.map((p) => p[0]), points.map((p) => p[1]), map.getContainer().getBoundingClientRect()];
  // Over the sheet on a phone, or the credits' strip on a wide window, not over the buttons riding on them, which a tap's popup keeps clear of.
  const want = { ...clearOfCards(), bottom: box.bottom - Math.min(box.bottom, (wide.matches ? creditsStrip : panel).getBoundingClientRect().top) + GUTTER };
  const fit = map.cameraForBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding: fitPadding(want, map.getPadding(), padding), maxZoom: FOLLOW_ZOOM },
  );
  // With the map's padding the Line's sheet's, not Search's, as the panel's other screens have theirs, fitted or not.
  if (fit) map.flyTo({ ...fit, pitch: 0, padding });
  else map.easeTo({ padding });
}

/** Shows the Line whose screen it is on the map, or none (#473): its glow under it in every band and on the rails. */
function showLook(line: string | undefined) {
  lookOf = line;
  for (const { id, zooms } of layered) map.setFilter(`${id}-glow`, ['all', zooms.filter, ['==', ['get', 'line'], line ?? '']]);
}

/**
 * Shows Search, its tab's sheet (#470), pulled up, following no Train: afresh, as a press on its tab again
 * opens it, its field emptied and focused, which on a phone brings up the keyboard (#471).
 */
function showSearch() {
  [following, boardPlace, lineShown, nearMe, searching, favouritesShown, back, query] = [undefined, undefined, undefined, undefined, true, false, undefined, ''];
  trainSource?.setData(trains());
  openPanel(true);
  writeLink();
  map.easeTo({ padding: panelPadding() });
  // The field the panel kept, where it showed Search already.
  const field = panel.querySelector<HTMLInputElement>('.search-field');
  if (field) field.value = '';
  field?.focus();
}

/**
 * Shows the viewer's nearby Trains, following no Train, once the browser says where they are. Where
 * it won't, as when they decline, the panel says so, and the rest of the map carries on. The map
 * stays where it is: the basemap's tiles for where they are would tell OpenFreeMap.
 */
function showNearby() {
  [following, boardPlace, lineShown, nearMe, searching, favouritesShown, back] = [undefined, undefined, undefined, 'locating', false, false, undefined];
  trainSource?.setData(trains());
  openPanel(true);
  writeLink();
  map.easeTo({ padding: panelPadding() });
  locate();
}

/** Shows Favourites, its tab's sheet (#472), pulled up, following no Train, and loads the regions of what it keeps, wherever the map is. */
function showFavourites() {
  [following, boardPlace, lineShown, nearMe, searching, favouritesShown, back] = [undefined, undefined, undefined, undefined, false, true, undefined];
  trainSource?.setData(trains());
  openPanel(true);
  writeLink();
  map.easeTo({ padding: panelPadding() });
  want();
}

/** Nearby's Try again: asks the browser again where the viewer is, as Nearby's tab does, saying meanwhile that it's finding out, under which the button stays, and the keyboard's focus on it (#324). */
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
    // The regions round the viewer load, wherever the map is (#266).
    want();
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

/**
 * Stops following a Train, or closes a Station's board, the nearby Trains or Search, and a board a Search row
 * is opening once its region has come opens no more (#471). The keyboard's focus, where it was in the panel,
 * goes back to the tab whose sheet it was, as the close button goes with the panel, rather than to the page (#470).
 */
function closePanel() {
  const [tab, keyboard] = [currentTab({ following, boardPlace, lineShown, nearMe, searching, favouritesShown }), panel.contains(document.activeElement)];
  [following, boardPlace, lineShown, nearMe, searching, favouritesShown, back, linkWaits] = [undefined, undefined, undefined, undefined, false, false, undefined, false];
  showPanel();
  writeLink();
  map.easeTo({ padding: panelPadding() });
  if (keyboard && tab) tabs[tab].focus();
}

/**
 * Shows the panel afresh: a followed Train and a board peeking on a phone, Nearby pulled up, with its
 * body scrolled to the top (#321), and the Stations a followed Train has left folded away (#349), and
 * its Alerts (#342). A link still waiting for its regions opens no more: the viewer has opened another.
 */
function openPanel(up: boolean) {
  [pulledUp, showPast, showAlerts, showCancelled, showsWithin, linkWaits] = [up, false, false, false, false, false];
  panel.classList.remove('sliding');
  panel.style.height = '';
  showPanel();
  panel.querySelector('.sheet-body')?.scrollTo(0, 0);
}

/**
 * Opens what the page's link names besides the view: a point to ring (#254), a Station's board, or
 * once its Trips have come, a Train to follow, which the map stops following straight away if it's
 * no longer running. A Station the map doesn't know goes from the link. Where the link names no
 * view, the map goes to the Station, by follow()'s rule (#292). A Station or a Train opens once its
 * regions have come, which load meanwhile (#266), with the first day's Trips where more days are to come,
 * and a Train once its Trip is on the map or every day has (#593); those whose Trips fail to come are
 * logged where show() gets them, and looked for again; opened then, it doesn't ring its point again, which
 * a tap may have cleared meanwhile. A Search row opens a Station's board as a link that names it alone (openStation()).
 * A Line (`line=`) opens its screen once its region's Trips have come, wherever the map is (#473), as a Search row does.
 */
function openLink(ring = true) {
  if (ring) showMark(markOf(openedLink));
  const link = new URLSearchParams(openedLink.slice(1));
  const [station, train, line] = [link.get('station'), link.get('train'), link.get('line')];
  // A Line's screen waits for its region's Trips, its strip being made of them, and for its Line (#473).
  if (line && !station && !train) {
    linkWaits = !(come({ line }, joinedRegions) && lines.has(line) && !!bundle);
    if (linkWaits) want();
    else showLine(line);
    return;
  }
  const place = station && [...shownPlaces.values()].find((p) => p.stations.includes(station));
  // A Station or a Train waits for its regions, which load meanwhile, wherever the map is (#266), and a
  // Station for the file below zoom 7 to say which those are. A Train too for its Trip, while days are still
  // to come, as the map stops following a Train that isn't on it (#593); and one named with no day, which is
  // the last day's, for that day, as follow() binds it to the day the map has last.
  const tripComing = !station && !!train && daysComing && (!/^\d{4}-\d{2}-\d{2}\//.test(train) || !tripOnMap(train));
  linkWaits = !place && (!!station || !!train) && !(come({ station, train }, joinedRegions) && !tripComing);
  if (linkWaits) want();
  else if (place) {
    const keyboard = panel.contains(document.activeElement);
    showBoard(place.id);
    // The keyboard's focus, where it was in the panel, as on the Search row that opened the board (#471), to its title, as what it was on has gone.
    if (keyboard) focusTitle();
    // ponytail: eased before the board's departures come on a page just opened, so on a phone the
    // Station then sits just above the board, not mid-way above it; ease again as they come if that
    // shows. A `map=` MapLibre won't open (zoom 99) counts as a view too, so the board opens over
    // Barcelona; check it as MapLibre's Hash does if such links show.
    if (!link.has('map')) easeOnto([place.lon, place.lat]);
  } else if (station) writeLink();
  else if (train) follow(train);
}

/**
 * Puts what the panel shows in the page's link, beside the view, so that sharing the page shares it:
 * `train=<service day>/<Trip>`, the Train by its service day and its Trip as its operator names it,
 * whose ID leads with its Network, `station=<Station>`, one of the place's Stations, which opens the
 * place's board, or `line=<Line>`, a Line's screen (#473), by its ID, which leads with its Network too. It keeps the link's `mark=` while the map rings its point, and drops it while the
 * map rings none, as after a tap (#254). Written as MapLibre writes the view, which undoes any
 * escaping each time it does.
 * ponytail: so an ID with `&`, `=`, `#`, `+` or `%` in it would break its link. None has one yet
 * (only `:._|@-`); escape them both ways, instead of MapLibre's hash, if an operator's ever does.
 */
function writeLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  params.delete('train');
  params.delete('station');
  params.delete('line');
  if (!marked) params.delete('mark');
  if (following) params.set('train', `${following.day}/${following.trip}`);
  const station = boardPlace && boardOf(boardPlace)?.stations[0];
  if (station) params.set('station', station);
  if (lineShown) params.set('line', lineShown);
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

/** Whether the days on the map have the Trip a link names, by its service day and its ID as its operator names it (linkedTrip()). */
function tripOnMap(link: string): boolean {
  const id = linkedTrip(link, bundle?.serviceDay);
  return !!bundle?.trips.some((trip) => trip.id === id);
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
// A press on the map is seen before MapLibre sees it, and a lift anywhere after it, a frame later: a drag's
// first move and its lift can come in one frame (a flick, or a frame that takes long), and MapLibre applies
// the move only once the frame loop has run, so a lift seen at once leaves that frame's centreOn() free to
// jump, which drops the move it has not applied yet and the drag with it.
map.getCanvasContainer().addEventListener('pointerdown', (e) => pressed.press(e.pointerId, performance.now(), e.pointerType === 'touch'));
addEventListener('pointerup', (e) => requestAnimationFrame(() => pressed.lift(e.pointerId, performance.now())), true);
addEventListener('pointercancel', (e) => requestAnimationFrame(() => pressed.lift(e.pointerId)), true);
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

// MapLibre zooms a double-click and a double-tap about the point they're at, and has no `around:
// 'center'` for them, as it has for the wheel and a pinch (showCentring()). While the map pans with the
// Train, the ease its handlers start for them is about the Train instead, which the middle is, so that it
// stays there (#432). Not about where the map's middle is: the map stands while a second tap may come
// (holding()), and a click may come as the map eases onto a Train, so the Train may have gone off it by then.
// ponytail: wraps MapLibre's easeTo(), which every `map.easeTo()` of the app's goes through now, telling its
// handlers' ease by what they pass (tapZooms()). Where a release changes that, the zoom is about the point
// again, as it was, and centreOn() jumps at its end: look at a double-click's zoom after an upgrade. Have the
// handlers take `around` instead if they grow the option.
const easeTo = map.easeTo.bind(map);
map.easeTo = (options, eventData) => {
  const at = centring ? following?.at : undefined;
  return easeTo(at && tapZooms(options, eventData) ? { ...options, around: undefined, center: ahead(at, options.duration ?? EASE, options.zoom) } : options, eventData);
};

/** Takes the Train the map follows back, easing onto where it will be as the ease ends (ahead(), #682), and the map pans with it again (#325). */
function centre() {
  released = undefined;
  if (following?.at) map.easeTo({ center: ahead(following.at, EASE), padding: panelPadding() });
  showCentring();
}

/**
 * Whether the map is held where it is: it moves, which a jumpTo() or an easeTo() of the app's would stop,
 * or a pointer is down on it, whose drag they would end before it began, MapLibre having seen the press
 * but not yet a move past its click tolerance (#581), or a tap has just lifted, whose second a jump would
 * make a first again (#432).
 */
function holding() {
  return map.isMoving() || pressed.holds(performance.now());
}

/**
 * Jumps the map to the Train it follows, in the middle of the map beside the panel, once it's a quarter
 * pixel off it, at the viewer's zoom and bearing (#325). Where it's outside the middle 60% of that part
 * of the map, as one that comes out of a Closure is, or one the map missed while the tab was hidden, it
 * eases to it over a second, as keepInView() does, rather than jump across the map in a frame (#586).
 * Not while the map is held (holding()), so it never fights the viewer's hand or an ease.
 */
function centreOn(at: Point) {
  if (holding()) return;
  const [from, to] = [map.project(map.getCenter()), map.project(at)];
  if (!drifted(to.x - from.x, to.y - from.y)) return;
  if (outside(to)) easeIn(ahead(at));
  else map.jumpTo({ center: at });
}

/**
 * Brings the Train the map follows back into view where it's about to leave it, or the viewer has
 * moved the map off it: where it's outside the middle 60% of the map beside the panel. Not while the
 * map is held (holding()), so it never fights the viewer's hand.
 */
function keepInView(at: Point) {
  if (holding()) return;
  if (outside(map.project(at))) easeIn(at);
}

/** Whether a point on the map, in px, is outside the middle 60% of the map beside the panel (outsideMiddle()). */
function outside(at: { x: number; y: number }) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  return outsideMiddle(at, { width, height }, panelPadding());
}

/** Eases the map over EASE_IN to a point, into the middle of the map beside the panel. */
function easeIn(at: Point) {
  map.easeTo({ center: at, duration: EASE_IN, padding: panelPadding() });
}

/**
 * Where the Train the map follows will be drawn once an ease of `ms` ends, EASE_IN by default, at `zoom`, the
 * zoom it eases to, so that the ease ends with it in the middle, not trailing it by what it goes meanwhile: 68 px
 * at zoom 17 and 136 px at 18 for a Train at 110 km/h, where a phone's middle 60% reaches only 117 px each way, so
 * that an ease to where it was would be followed by another, and another (#586); and for the Centre button's, a
 * follow's and a tap's zoom, which centreOn() then jumped, 16 px at zoom 16 for an R2S at 31.5 m/s (#682, #679).
 * `at`, which is where it is drawn now, spread aside with its group as it may be (#129), moved on by what the
 * engine has it go in that time; `at` where the engine has none, or under reduced motion, where an ease is a jump.
 */
function ahead(at: Point, ms = EASE_IN, zoom = map.getZoom()): Point {
  if (lessMotion.matches) return at;
  const [now, then] = [0, ms].map((ms) => bundle && trainAt(bundle, Date.now() + ms, received, followedId() ?? '', hidingClosures));
  if (!now || !then) return at;
  const [was, will] = [whereDrawn(now, zoom), whereDrawn(then, zoom)];
  return [at[0] + will[0] - was[0], at[1] + will[1] - was[1]];
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
  /** How long until what it shows next changes of itself, in ms, where that's within a second: a followed Train's countdown (untilTick(), #456). */
  changes?: number;
}

/**
 * Fills the panel, in the viewer's language, with the Train the map follows, the Station board it
 * shows, the viewer's nearby Trains or Search: on a phone pulled up, as `up` says, or peeking. Hides it
 * while there's none. It changes in place, so that its refresh every second never takes the keyboard's
 * focus or a screen reader's place (patch()). And marks the tab whose sheet it is current (#470).
 */
function showPanel(up = wide.matches || pulledUp || dragging) {
  panelShown = performance.now();
  const shown = following ? followedPanel(up) : boardPlace ? boardPanel(boardPlace, up) : lineShown ? linePanel(lineShown) : nearMe ? nearbyPanel(nearMe, up) : searching ? searchPanel() : favouritesShown ? favouritesPanel() : undefined;
  panelDue = shown?.changes ?? 1000;
  panel.hidden = !shown;
  panel.classList.toggle('up', up);
  patch(panel, shown ? [el('div', { className: 'sheet-top' }, handle(up), shown.header), el('div', { className: 'sheet-body' }, ...shown.body)] : []);
  const current = currentTab({ following, boardPlace, lineShown, nearMe, searching, favouritesShown });
  for (const [tab, button] of Object.entries(tabs)) {
    if (tab === current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  // Where the Train followed has changed, so that the Centre button doesn't wait for the next draw.
  showCentring();
  if (lineShown !== lookOf) showLook(lineShown);
  riseOverKeyboard();
}

/**
 * Raises Search's sheet over the on-screen keyboard while it's up, as it covers the bottom of the page the
 * sheet docks to, up to the top of what's on screen, the visual viewport, and lets it back down as the
 * keyboard goes (keyboardRise(), #471): the keyboard is up while Search's field has the focus, and goes as
 * the field loses it, or a phone's back button puts it away. The map's padding stays as it was: what's under
 * the keyboard can't be seen anyway.
 */
function riseOverKeyboard() {
  const rise = searching && visualViewport ? keyboardRise(innerHeight, visualViewport) : undefined;
  dock.classList.toggle('risen', !!rise);
  dock.style.setProperty('--risen-bottom', rise ? `${rise.bottom}px` : '');
  dock.style.setProperty('--risen-height', rise ? `${rise.height}px` : '');
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
 * next Station, as it's arriving at it or stands at it by how it's drawn (#455), when it's expected
 * there, with its Delay but for a Metro Train's, and the time to it, in seconds in its last minute
 * (#456), which it stays while the Train passes a Station it doesn't call at (#457); how far along its
 * Trip it is; and its Line's Alerts, folded away (#342). Peeking, it ends
 * in how many Stations it has still to come; pulled up, it shows them, from the Train to its Trip's
 * last Station (#321), after a fold that shows those it has left (#349). Its Stations within a closed
 * Closure that hides Trains are marked as not stopped at in the strip, and not counted in how many it
 * has to come (#420). Where its Train is within one, it's the panel of a Trip still to come
 * (comingPanel()). Where its time to go is in seconds, `changes` says when it next does, so that it's
 * refreshed then.
 */
function followedPanel(up: boolean): Panel | undefined {
  const now = Date.now();
  // The time to go counts by the map's time, as the times it counts to are the fetcher's (#356).
  const mapNow = mapTime(now, received);
  const train = bundle && trainAt(bundle, now, received, followedId() ?? '', hidingClosures);
  // Its Trip still to come, where its Train isn't on the map yet (#322), or within a closed Closure that hides Trains (#420).
  waiting = bundle && !train ? comingAt(bundle, now, received, followedId() ?? '', hidingClosures) : undefined;
  // Its Alerts, which say why, open of themselves as it goes within a Closure where the panel has the room, or stay open if the viewer opened them, and fold as it comes out.
  const within = !!waiting?.within;
  if (within !== showsWithin) [showsWithin, showAlerts] = [within, within && (showAlerts || up)];
  if (waiting) return comingPanel(waiting, up, mapNow);
  if (!train) return undefined;
  const { trip, live, unreported, since, speed, unitType, upcoming } = train;
  // The Stations it stops at, which it has still to come, the next of them first.
  const running = upcoming.filter((c) => !c.skipped);
  const last = running.at(-1);
  // Where it is by how it's drawn: how near its pill reaches its Stations (#455), and the place it passes without stopping, if one (#457).
  const reach = followedReach(train);
  const where = whereabouts(trip.calls, train.dist, upcoming.length, !!train.standsAt, reach, dotOf(train), passedBy(train, reach));
  const status: (Node | string)[] = [t(live ? 'live' : 'scheduled')];
  if (unreported) status.push(t('noLiveTrain'));
  else if (since !== undefined) status.push(placedBy(live, ago(since), train.pinnedAt && stationName(train.pinnedAt)));
  status.push(el('span', {}, el('span', { className: 'sr-only', textContent: `${t('speed')} ` }), `~${Math.round(speed * 3.6)} km/h`));
  if (unitType) status.push(`${t('unit')} ${unitType}`);
  // Where it has no countdown, at its Trip's last Station or held (#607, #689), the panel waits on none either.
  const next = upcoming[0] && due(upcoming[0], !!train.standsAt, upcoming.length === 1, train.held);
  return {
    changes: next?.countdown ? untilTick(next.at, mapNow) : undefined,
    header: el('header', {}, ...backButton(), el('h2', { className: 'title', tabIndex: -1 }, pill(trip.line, { live, train: true }), ` ${trip.headsign}`), closeButton(t('stopFollowing'))),
    body: [
      el('p', { className: 'meta status-line' }, el('span', { className: `dot ${live ? 'live' : 'scheduled'}` }), ...status.flatMap((part, i) => (i ? [' · ', part] : [part]))),
      ...nextStation(train, mapNow, where),
      tripBar(train),
      alertsOn({ lines: [trip.line], stations: [] }),
      ...(up
        ? [el('hr', { className: 'dash' }), ...strip(train, where)]
        : last && running.length > 1
          ? [moreButton(moreStations(running.length - 1, trip.headsign, clock().format(last.arrival)))]
          : []),
    ],
  };
}

/**
 * The panel of a Trip still to come (#322), as a Train comes onto the map only seconds before it
 * leaves: where and when it leaves, and its Stations, as the followed Train's have them. Or of a Train
 * within a closed Closure that hides Trains, which the map doesn't draw there: that it doesn't run
 * between the Closure's Stations, with the Line's Alerts, which say why, its next Station the one it
 * comes out at, until it's drawn again (#420).
 */
function comingPanel({ trip, live, delay, upcoming, within }: Coming, up: boolean, now: number): Panel {
  const running = upcoming.filter((c) => !c.skipped);
  const [first, last] = [upcoming[0], running.at(-1)];
  const leaves = first && leavesAt(stationName(first.station), clock().format(first.departure));
  // The Closure's Stations in the order its Trip meets them, as they are where it calls at neither.
  const order = (station: string) => trip.calls.findIndex((c) => c.station === station);
  const [a = '', b = ''] = within?.stations.toSorted((x, y) => order(x) - order(y)).map(stationName) ?? [];
  const says = within ? [notRunning(a, b)] : [leaves ?? '', ...(first ? followedCountdown(first.departure, now).flatMap((n) => [' · ', n]) : [])];
  return {
    changes: running[0] && untilTick(running[0].arrival, now),
    header: el('header', {}, ...backButton(), el('h2', { className: 'title', tabIndex: -1 }, pill(trip.line, { live, train: true }), ` ${trip.headsign}`), closeButton(t('stopFollowing'))),
    body: [
      el('p', { className: 'meta status-line' }, el('span', { className: `dot ${live ? 'live' : 'scheduled'}` }), ...says),
      ...nextStation({ upcoming, standsAt: undefined, delay, live }, now),
      alertsOn({ lines: [trip.line], stations: [] }),
      ...(up ? [el('hr', { className: 'dash' }), ...strip({ trip, upcoming, standsAt: undefined })] : last && running.length > 1 ? [moreButton(moreStations(running.length - 1, trip.headsign, clock().format(last.arrival)))] : []),
    ],
  };
}

/** The button in a header that goes Back (#322), naming where it goes: none where there's none, or the Train it would follow has left the map and has no Trip to come (#345, #420). */
function backButton(): Node[] {
  // ponytail: two engine passes a second while Back goes to a Train; cache the check if a phone shows it.
  if (!back) return [];
  const where = back.to === 'train' ? undefined : back.to === 'board' ? boardOf(back.place)?.name : back.to === 'line' ? lines.get(back.line)?.name : t('nearby');
  if (back.to === 'train' ? !(bundle && (trainAt(bundle, Date.now(), received, back.day === bundle.serviceDay ? back.trip : `${back.day}/${back.trip}`, hidingClosures) || comingAt(bundle, Date.now(), received, back.day === bundle.serviceDay ? back.trip : `${back.day}/${back.trip}`, hidingClosures))) : !where) return [];
  const label = back.to === 'train' ? backToTrain(back.headsign) : backTo(where ?? '');
  return [el('button', { type: 'button', className: 'back', onclick: goBack }, icon('back'), el('span', { textContent: label }))];
}

/**
 * A followed Train's next Station: its name, labelled as the Train is arriving at it or stands at it,
 * where `where` says so (#455); when the Train's expected there, with its status beside it, and the
 * time to it within the hour, in seconds in its last minute (followedCountdown(), #456). Standing,
 * that time is when it leaves, which it says unless that's its Trip's last Station, where the Train
 * doesn't leave: there it's when it arrived, with no time to it (due(), #607). Held there, that it's
 * waiting to leave, with neither (#689). The first it stops at, not one within a closed Closure that
 * hides Trains (#420).
 */
function nextStation({ upcoming, standsAt, delay, live, held }: Pick<Followed, 'upcoming' | 'standsAt' | 'delay' | 'live' | 'held'>, now: number, where?: Whereabouts<Call, Place>): Node[] {
  const next = upcoming.find((c) => !c.skipped);
  if (!next) return [];
  const waits = !!held && next === upcoming[0];
  const { at, countdown } = due(next, !!standsAt && next === upcoming[0], next === upcoming.at(-1), waits);
  const label = where?.at === 'arriving' ? 'nextStationArriving' : where?.at === 'standing' ? 'nextStationStanding' : 'nextStation';
  const leaves = where?.at === 'standing' && upcoming.length > 1 ? [el('span', { className: 'soft', textContent: t('leaves') })] : [];
  const when = waits ? [el('span', { className: 'soft', textContent: t('waiting') })] : [...leaves, el('time', {}, ...timeOfDay(at))];
  return [
    el(
      'div',
      { className: 'next-station' },
      el('div', {}, el('p', { className: 'label', textContent: t(label) }), stationLink(next.station, el('strong', { className: 'next-name', textContent: stationName(next.station) }))),
      el('div', { className: 'next-when' }, el('span', { className: 'at' }, ...when, status({ delay, live })), ...(countdown ? followedCountdown(at, now) : [])),
    ),
  ];
}

/** How far a followed Train's pill reaches either side of it along its track now, in metres, as the map draws it at its zoom (pillReach()), and none where its Line has no pill, as every Line of a Train on the map has. */
function followedReach({ trip, lat }: Followed): number {
  const pill = pills.get(trip.line);
  return pill ? pillReach(pill.followedBox, map.getZoom(), pill.zoom, lat) : 0;
}

/**
 * How far a followed Train is drawn from the dot of the place a call's Station is shown in, in metres,
 * and how far that dot is from the Station itself (whereabouts()'s `dot`, #455, #609): none of the
 * first where no place on the map has the Station.
 * ponytail: flat, from where the engine draws it on its shape, though zoomed out, it sits on its Line's
 * stroke, up to half a line width to the side. Go by where the map draws it if that shows.
 */
function dotOf({ lon, lat }: Followed): (call: Call) => { away: number; offset: number } {
  const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
  const apart = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * DEGREE);
  return ({ station }) => {
    const [place, own] = [placeOfStation.get(station), shownStations?.find((s) => s.id === station)];
    return place ? { away: apart(place, { lon, lat }), offset: own ? apart(place, own) : 0 } : { away: Infinity, offset: 0 };
  };
}

/**
 * The place on the map a followed Train passes without stopping, where its pill, which reaches `reach`
 * metres, is on its dot (passedPlace(), #457): of the Stations the page has that its own Network's Trains
 * stop at, one its Trip has no call at, by Station or by the name it's shown with. None where its Line,
 * and so its Network, isn't known.
 */
function passedBy({ trip, lon, lat }: Followed, reach: number): { place: Place; away: number } | undefined {
  return passedPlace(shownPlaces.values(), { lon, lat }, trip.calls.map(({ station }) => ({ station, name: stationName(station) })), reach, lines.get(trip.line)?.network ?? '');
}

/**
 * What a followed Train's strip says of where it is by how it's drawn (whereabouts(), #455), by the
 * Stations' names: that it's arriving at its next Station, leaving the one it left, passing a place it
 * doesn't call at (#457), a place of its own Network's by the name the map shows it with, or between the two Stations. Standing, it
 * says nothing there: its Train's mark is on its Station's row.
 */
function whereIs(where: Whereabouts<Call, Place>): string {
  const name = ({ station }: Call) => stationName(station);
  if (where.at === 'arriving') return arrivingAt(name(where.next));
  if (where.at === 'leaving') return leavingStation(name(where.last));
  if (where.at === 'passing') return passingStation(where.place.name);
  return where.at === 'between' ? betweenStations(name(where.last), name(where.next)) : '';
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
 * Train, now, which is arriving at the first, leaving the Station before them, passing a place its Trip
 * has no call at (#457) or between the two, as it's drawn (`where`, #455), or stands at the first, to
 * its Trip's last Station, where the strip ends in a bar across it, as the operators' maps end a Line.
 * The next, the first it stops at, and the last are in bold; one it doesn't stop at, within a closed
 * Closure that hides Trains, has its time struck through and says so, as a board's row does (#420).
 * Once it has left a Station, the fold before the strip (foldButton()) shows those it has already left
 * at its top, greyed, by name only, as the map has no time it passed them but its timetable's, and the
 * Train then as a compact mark after them (#349). Held at the first, that one has no time (#689).
 */
function strip({ trip, upcoming, standsAt, held }: Pick<Followed, 'trip' | 'upcoming' | 'standsAt' | 'held'>, where?: Whereabouts<Call, Place>): Node[] {
  // How many Stations it has already left, and the last of them, before those it has still to leave.
  const earlier = trip.calls.length - upcoming.length;
  const lastLeft = trip.calls[earlier - 1];
  // The first of them it stops at is its next.
  const next = upcoming.findIndex((c) => !c.skipped);
  const past = earlier > 0 && showPast;
  const station = (className: string, time: (Node | string)[], ...name: (Node | string)[]) => el('li', { className }, el('time', {}, ...time), el('span', { className: 'mark' }), el('span', {}, ...name));
  const list = el(
    'ol',
    { className: past ? 'strip past' : 'strip' },
    ...(past ? trip.calls.slice(0, earlier).map((call, i) => station(i ? 'passed soft' : 'passed soft origin', [], stationName(call.station), el('span', { className: 'sr-only', textContent: `, ${t('passed')}` }))) : []),
    ...(lastLeft && !standsAt ? [past ? station('train soft compact', [t('now')]) : station('train soft', [t('now')], where ? whereIs(where) : '')] : []),
    ...upcoming.map((call, i) => {
      const classes = [i === 0 && standsAt ? 'train' : '', i === next ? 'next' : '', i === upcoming.length - 1 ? 'terminus' : '', call.skipped ? 'skipped' : ''].filter(Boolean).join(' ');
      const link = stationLink(call.station, stationName(call.station));
      // Not stopping, within a closed Closure that hides Trains, as a board's row says it (#345, #420).
      const says = call.skipped ? [' ', el('span', { className: 'status skipped', textContent: t('notStopping') })] : [];
      // Held at it, no time: one its operator keeps moving or that has come already (#689).
      return station(classes, i === 0 && held ? [] : timeOfDay(due(call, i === 0 && !!standsAt, i === upcoming.length - 1).at), link, ...says);
    }),
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
 * long ago, and when each feed's file last changed, where that's over a day ago (readAt()). It's there
 * from the start, hidden while there's none, and its list is there while it's folded away, so that a
 * new Alert never takes the keyboard's focus or a screen reader's place.
 */
function alertsOn(on: { lines: string[]; stations: string[] }, open = showAlerts, toggle = () => (showAlerts = !showAlerts), after?: () => void) {
  const now = mapTime(Date.now(), received);
  const { alerts: shown, asOf, changed } = cardAlerts(alerts, on, language(), now);
  return el(
    'div',
    { className: 'alerts', hidden: !shown.length },
    foldButton([icon('warning'), alertCount(shown.length)], open, toggle, after),
    el('div', { hidden: !open }, readAt(asOf, changed, now), el('ol', {}, ...shown.map((alert) => alertRow(alert, on.lines.length > 1)))),
  );
}

/**
 * What a card or a tap says over the Alerts it shows, in one paragraph, a line each, hidden where it
 * says nothing (cardAlerts()): when they were read, where that's long ago (`asOf`), with their day,
 * where they were read on another than the map's; and, beside it, when each feed's file last changed
 * (`changed`, #390), always with its day, as that's over a day ago.
 */
function readAt(asOf: number | undefined, changed: { by: string; at: number }[], now: number) {
  const says = [
    ...(asOf === undefined ? [] : [t('alertsAsOf').replace('{time}', clock(madridDate(new Date(asOf)) !== madridDate(new Date(now))).format(asOf))]),
    ...changed.map(({ by, at }) => alertsChanged(by, clock(true).format(at))),
  ];
  return el('p', { className: 'meta', hidden: !says.length }, ...says.flatMap((line, i) => (i ? [el('br'), line] : [line])));
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
 * its left, as the map's own padding is (panelPadding()), or the rail where the card's closed (#470).
 * MapLibre puts it above the point, or below or beside it where it doesn't fit, by those insets
 * (`padding`), and popupRoom() keeps it small enough for one of those to fit: no wider than its most
 * width, nor higher than `--popup-room` in the CSS.
 */
function fitPopup(at: LngLat) {
  const box = map.getContainer().getBoundingClientRect();
  const inset = clearOfCards();
  const room = popupRoom(map.project(at), box, inset);
  map.getContainer().style.setProperty('--popup-room', `${room.height}px`);
  linesPopup.setPadding(inset);
  linesPopup.setMaxWidth(`${room.width}px`);
}

/**
 * How far in from the map's edges what's clear of the cards over it lies, in px, and GUTTER more: the corners' cards
 * over its top, the buttons riding on the sheet over its bottom, and on a wide window the panel's card at its left,
 * as the map's own padding is (panelPadding()), or the rail where the card's closed (#470).
 */
function clearOfCards() {
  const box = map.getContainer().getBoundingClientRect();
  return {
    top: Math.max(box.top, ...[legend, banner, languageChip].map((card) => card.getBoundingClientRect().bottom)) - box.top + GUTTER,
    bottom: box.bottom - Math.min(box.bottom, riders.getBoundingClientRect().top) + GUTTER,
    left: GUTTER + Math.max(panelPadding().left, wide.matches ? nav.getBoundingClientRect().right - box.left : 0),
    right: GUTTER,
  };
}

/**
 * What a tap on Closures shows (#341), by closureKey(): for each Alert that closes them, its words
 * (cardAlerts()), or for each the timetable's buses do, that buses replace trains between its two
 * Stations, in the interface's words; each under the pills of the Closures' Lines, in the order a board
 * names them, with when it began (tappedRows()). Over them, when the Alerts were read, where that's
 * long ago, and when each feed's file last changed, where that's over a day ago (readAt()). None,
 * where none of them is shown now.
 */
function closuresTapped(keys: string[]) {
  const now = mapTime(Date.now(), received);
  // Their Lines in the order the cards name Lines, as a board's are (servedBy()), not the feed's.
  const rows = tappedRows(shownClosures, keys, [...lines.keys()]);
  // Under an Alert's words, where Live Trains of a Line have run within its Closure since (#422).
  const said = rows.flatMap(({ closure: { alert, stations: [a = '', b = ''], from }, on, all }): { row: CardAlert; ran: string[] }[] => {
    if (alert) {
      const ran = all.flatMap((c) => {
        const [since, name] = [liftedSince(c, lifted), lines.get(c.line)?.name];
        return since === undefined || !name ? [] : [trainsRunHere(name, clock().format(since))];
      });
      return cardAlerts(alerts, { lines: on, stations: [] }, language(), now).alerts.filter((c) => c.id === alert.id).map((row) => ({ row, ran }));
    }
    return [{ row: { id: `${on.join()} ${a} ${b}`, lines: on, description: { language: language(), text: busesReplace(stationName(a), stationName(b)) }, ...(from !== undefined && { from }), by: '' }, ran: [] }];
  });
  const { asOf, changed } = cardAlerts(alerts, { lines: rows.flatMap(({ closure, on }) => (closure.alert ? on : [])), stations: [] }, language(), now);
  return said.length ? el('div', { className: 'alerts' }, readAt(asOf, changed, now), el('ol', {}, ...said.map(({ row, ran }) => alertRow(row, true, ran)))) : undefined;
}

/**
 * An Alert on a card, as alertsOn() has it, after the Lines it's on as pills, `byLine`, where the card
 * has more than one, as a board can: Rodalies' words don't name theirs. Or a Closure the timetable's
 * buses make, in the interface's words, whose they are unsaid (#341). Each `http://` or `https://`
 * address in a title or in words is a link, opening in a new tab and saying so to a screen reader
 * (opensInNewTab()), in the words as they were (#391).
 */
function alertRow({ lines: named, header, description, from, by }: CardAlert, byLine: boolean, ran: string[] = []) {
  // In an unknown language, lang="", where its feed doesn't say, rather than the viewer's. Each address in
  // them is a link, in a new tab as About's are (opensInNewTab()), among their text: built as nodes,
  // never as HTML (#391).
  const words = (tag: 'strong' | 'p', said?: Words) => {
    if (!said) return [];
    const parts = linkedWords(said.text).map((part) => (typeof part === 'string' ? part : opensInNewTab(el('a', { href: part.address, textContent: part.address }))));
    return [el(tag, { lang: said.language ?? '' }, ...parts)];
  };
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
    ...ran.map((textContent) => el('p', { className: 'meta', textContent })),
    el('p', { className: 'meta' }, ...about.flatMap((part, i) => (i ? [' · ', part] : [part]))),
  );
}

/**
 * A place's board: its nameboard, with the Lines of its timetable there, as they are before its Trips
 * have come (servedBy(), #594); the Alerts on its Stations and on those Lines, folded away (#342); then
 * its next departures from each of its Stations, each with when it's expected to leave, its Train's pill,
 * where it's headed and its status. Peeking, the next PEEK of them, and how many more. Until the Trips of
 * the regions the map has loaded or needs have come, as it needs long distance's from its first look (#739), only
 * its label, as Nearby's heading stands alone (boardList(), #379), and with none left today, until the next
 * day's, which it asks for once its own regions' have come, have (#597, #596).
 */
function boardPanel(id: string, up: boolean): Panel | undefined {
  const place = boardOf(id);
  if (!place) return undefined;
  const now = Date.now();
  const mapNow = mapTime(now, received);
  const departures = bundle ? boardAt(bundle, now, received, place.stations, hidingClosures) : [];
  const trips = tripsState(loaded, manifest ? neededRegions(manifest) : [], shownRegions, tripsFailed);
  // With none left today, the next day's first are to come; refreshDays() runs again within a minute if it's busy now.
  // Only once the Trips of its own regions have come (#597): before that it has none because they haven't. Where
  // they failed, the map looks again for them soon, as it does for every file that fails (looked(), #657).
  const date = serviceToday ?? madridDate(new Date(mapNow));
  if (bundle && !departures.length && boardAsks(place.stations.every((station) => come({ station })), emptyBoard === date)) {
    emptyBoard = date;
    refreshDays();
  }
  const shown = up ? departures : departures.slice(0, PEEK);
  // Neither rows nor "none" while the Trips of a region the map has loaded or needs are on their way, as the bundle has the
  // others' already (#266): it can't tell that none are to come, and says that only once they've come or a file has failed to.
  // Nor while the next day's, which a board with none left asks for, are on their way (#596): the map is looking and they're
  // not on it yet, as the last day of its bundle is the day after today once they are.
  // ponytail: a next day the manifest doesn't name, where a build has left the map without one, is looked for by
  // no look, so a board that asked has its label alone for the second or so each minute's look takes. Go by the
  // manifest's days if that shows.
  const next = nextOnItsWay(looking, emptyBoard === date, bundle?.serviceDay, date);
  const list = boardList(trips, departures.length, next);
  return {
    header: el(
      'header',
      { className: 'nameboard' },
      ...backButton(),
      el('div', {}, el('h2', { className: 'title', textContent: place.name, tabIndex: -1 }), el('div', { className: 'served' }, ...servedBy(place).map((line) => pill(line, { small: true })))),
      ...starOf(place),
      closeButton(t('closeBoard')),
    ),
    body: [
      alertsOn({ lines: servedBy(place), stations: place.stations }),
      el('h3', { className: 'label', textContent: t('nextDepartures') }),
      ...(list === 'label' ? [] : [list === 'rows' ? el('ol', { className: 'rows' }, ...shown.map((departure) => departureRow(departure, mapNow))) : el('p', { textContent: t('noDepartures') })]),
      ...(shown.length < departures.length ? [moreButton(moreDepartures(departures.length - shown.length))] : []),
    ],
  };
}

/**
 * The Lines a place's board names, by their IDs, in the order the cards name Lines: those of its timetable,
 * wherever its Trips are, on their way or no Trip of them calling that day (linesOnBoard(), #392, #529, #594).
 * For the last place asked about, until the days or its track change.
 */
function servedBy(place: Place): string[] {
  if (served.place !== place || served.days !== bundle) served = { place, days: bundle, lines: linesOnBoard(bundle?.trips ?? [], place, [...lines.keys()]) };
  return served.lines;
}

/**
 * A Line's screen (#473, #328's pick): its header, with its pill and name, its first and last Station on its strip,
 * and under it its Network, how many of its Trains are on the map and the worst Delay of those 5 minutes late or
 * more, or that all are Scheduled, as where its Network's live data is unavailable, whose banner the map shows
 * (lineState()); then chips of how many are late, and of its Cancelled Trains and its Alerts, which open them above
 * the strip. Then the strip: every Station of the Line in order in its colour, each opening its board, and its Trains
 * as rows between them, each following its Train (lineRows()). None for a Line the map hasn't got.
 */
function linePanel(id: string): Panel | undefined {
  const line = lines.get(id);
  if (!line || !bundle) return undefined;
  if (stripOf.line !== id || stripOf.days !== bundle) {
    const trips = bundle.trips.filter((trip) => trip.line === id);
    // One day's Trips, as two on the map about midnight would count each Station's twice (#473's review).
    stripOf = { line: id, days: bundle, trips, strip: lineStrip(trips.filter(lastDays)) };
  }
  const now = Date.now();
  const mapNow = mapTime(now, received);
  const { trains, cancelled, state } = lineNow(bundle, stripOf.trips, now, mapNow);
  const shown = cardAlerts(alerts, { lines: [id], stations: [] }, language(), mapNow);
  const ends = stripOf.strip.filter((s) => s.mark === 'end');
  const name = ends.length ? ends.map((s) => stationName(s.station)).join(' – ') : line.name;
  const network = bundle.networks.find((n) => n.id === line.network)?.name ?? line.network;
  const chip = (className: string, says: (Node | string)[], open: boolean, toggle: () => void) => {
    const button = el('button', { type: 'button', className: `chip-button ${className}`, onclick: () => (toggle(), showPanel(), map.easeTo({ padding: panelPadding() })) }, el('span', {}, ...says), icon(open ? 'up' : 'chevron'));
    button.setAttribute('aria-expanded', String(open));
    return button;
  };
  const chips = [
    ...(state.late ? [el('span', { className: 'delay late', textContent: lateCount(state.late) })] : []),
    ...(cancelled.length ? [chip('cancelled', [cancelledCount(cancelled.length)], showCancelled, () => (showCancelled = !showCancelled))] : []),
    ...(shown.alerts.length ? [chip('warn', [icon('warning'), alertCount(shown.alerts.length)], showAlerts, () => (showAlerts = !showAlerts))] : []),
  ];
  const { noonMinus12h } = bundle;
  return {
    header: el(
      'header',
      { className: 'line-head' },
      ...backButton(),
      el('h2', { className: 'title', tabIndex: -1 }, pill(id), ` ${name}`),
      starButton({ kind: 'line', id, name: line.name }),
      closeButton(t('closeLine')),
      el(
        'div',
        { className: 'line-state' },
        el('p', { className: 'meta status-line parts' }, el('span', { className: `dot ${state.live ? 'live' : 'scheduled'}` }), ...parts([network, ...stateWords(state)])),
        el('div', { className: 'state-chips', hidden: !chips.length }, ...chips),
      ),
    ),
    body: [
      el(
        'div',
        { className: 'line-details', hidden: !((showCancelled && cancelled.length) || (showAlerts && shown.alerts.length)) },
        el('div', { hidden: !(showCancelled && cancelled.length) }, el('h3', { className: 'label', textContent: t('cancelled') }), el('ol', { className: 'rows' }, ...cancelled.map(({ trip }) => departureRow({ trip, station: trip.calls[0]?.station ?? '', departure: noonMinus12h + (trip.calls[0]?.departure ?? 0) * 1000, live: false, unreported: false, cancelled: true, skipped: false }, mapNow)))),
        el('div', { className: 'alerts', hidden: !(showAlerts && shown.alerts.length) }, readAt(shown.asOf, shown.changed, mapNow), el('ol', {}, ...shown.alerts.map((alert) => alertRow(alert, false)))),
      ),
      el('h3', { className: 'label', textContent: t('stations') }),
      lineRows(id, stripOf.strip, trains, mapNow),
    ],
  };
}

/** A Line's Trains on the map now, of `trips`, its Trips, its Cancelled Trains whose runs haven't ended, and its state (lineState()), as its screen and Favourites show them (#473, #472). */
function lineNow(days: Bundle, trips: Trip[], now: number, mapNow: number) {
  const nows = tripsAt(days, now, received, trips, hidingClosures);
  const trains = nows.flatMap((n) => ('train' in n ? [n.train] : []));
  return { trains, cancelled: cancelledNow(nows, days.noonMinus12h, mapNow), state: lineState(trains) };
}

/** How many of a Line's Trains are on the map, and the worst Delay of those 5 minutes late or more, or that all are Scheduled (#473). */
function stateWords(state: ReturnType<typeof lineState>): string[] {
  const how = state.trains ? [state.worst !== undefined ? worstLate(state.worst) : '', state.live ? '' : t('allScheduled')].filter(Boolean) : [];
  return [trainsNow(state.trains), ...how];
}

/** `words` as parts that don't break, each after the first led by a dot that `.parts` hides where the part starts a line, so no dot starts or ends one (#472). */
function parts(words: string[]) {
  return words.flatMap((word, i) => [...(i ? [' '] : []), el('span', { className: 'part', textContent: word })]);
}

/**
 * The star that keeps `f` in Favourites, or removes it (#472): filled while it's kept, and labelled by what a
 * press does, which says whether it's kept, so it isn't `aria-pressed` too, or a screen reader would say it twice.
 */
function starButton(f: Favourite) {
  const on = kept.has(f);
  const label = starLabel(f.name, on);
  const toggle = () => {
    // The star pressed, as the page has it: patch() keeps the old button and gives it this one's onclick, so this `star` may never be on the page.
    const focused = document.activeElement;
    kept.toggle(f);
    showPanel();
    // A row removed in Favourites takes its star, and the keyboard's focus, with it: to the panel's title, rather than the page.
    if (focused?.isConnected === false) focusTitle();
  };
  const star = el('button', { type: 'button', className: 'star', title: label, onclick: toggle }, icon(on ? 'starOn' : 'star'));
  star.setAttribute('aria-label', label);
  return star;
}

/**
 * A board's star (#472): kept by any of its places, as an interchange's board is opened by any of its places' (showBoard()),
 * or else to keep by the place of its first Station.
 */
function starOf(board: Place): Node[] {
  const places = new Set(board.stations.map((station) => placeOfStation.get(station)?.id));
  const station = board.stations[0];
  const own = station && placeOfStation.get(station);
  const f = kept.all().find((k) => k.kind === 'station' && places.has(k.id)) ?? (own && { kind: 'station' as const, id: own.id, station, name: board.name });
  return f ? [starButton(f)] : [];
}

/** Each Line's Trips, by its ID, of the days on the map, which Favourites' Lines find theirs in each second (#472). */
let tripsOfLine: { days?: Bundle; of: Map<string, Trip[]> } = { of: new Map() };

/**
 * Favourites' sheet (#472, #328's pick): kept Stations, then kept Lines, in the order kept. A Station with its name,
 * which opens its board, and its next two departures, as a board's rows; a Line with its pill, its Network and its
 * state now, as its screen says it, and how many of its Trains are late, or none, which opens its screen. Each with
 * its star, which removes it. One whose regions are still to come says `Loading…`, and one the map no longer has
 * says so, with its kept name (favouriteRows()). With none kept, how to keep one; under the list, that Trains aren't.
 */
function favouritesPanel(): Panel {
  const header = el('header', {}, el('h2', { className: 'title', textContent: t('favourites'), tabIndex: -1 }), closeButton(t('closeFavourites')));
  if (!kept.all().length) {
    return { header, body: [el('div', { className: 'empty-state' }, el('span', { className: 'empty-star' }, icon('star')), el('p', {}, el('b', { textContent: t('nothingKept') })), el('p', { textContent: t('howToKeep') }))] };
  }
  const now = Date.now();
  const mapNow = mapTime(now, received);
  const has = (f: Favourite) => (f.kind === 'station' ? shownPlaces.has(f.id) : lines.has(f.id));
  const rows = favouriteRows(kept.all(), (f) => !!bundle && come(f.kind === 'station' ? { station: f.station } : { line: f.id }), has);
  const trips = tripsState(loaded, manifest ? neededRegions(manifest) : [], shownRegions, tripsFailed);
  const date = serviceToday ?? madridDate(new Date(mapNow));
  if (tripsOfLine.days !== bundle) {
    tripsOfLine = { days: bundle, of: new Map() };
    for (const trip of bundle?.trips ?? []) {
      const of = tripsOfLine.of.get(trip.line);
      if (of) of.push(trip);
      else tripsOfLine.of.set(trip.line, [trip]);
    }
  }
  const said = (state: 'loading' | 'gone') => el('p', { className: 'meta', textContent: t(state === 'loading' ? 'loading' : 'noLongerOnMap') });
  const station = (f: (typeof rows.stations)[number]) => {
    const board = f.state === 'shown' ? boardOf(boardOfPlace.get(f.id) ?? f.id) : undefined;
    if (!board || !bundle) return el('li', { className: 'fav' }, el('div', { className: 'fav-head' }, el('span', { className: 'fav-name', textContent: f.name }), starButton(f)), said(f.state === 'shown' ? 'loading' : f.state));
    const departures = boardAt(bundle, now, received, board.stations, hidingClosures).slice(0, 2);
    // With none left today, the next day's first are asked for, as a board's (#597).
    if (!departures.length && boardAsks(board.stations.every((station) => come({ station })), emptyBoard === date)) {
      emptyBoard = date;
      refreshDays();
    }
    // Neither rows nor "none" while the Trips of a region the map has loaded or needs, or the next day's, are on their way, as a board's (boardList()).
    const list = boardList(trips, departures.length, nextOnItsWay(looking, emptyBoard === date, bundle.serviceDay, date));
    return el(
      'li',
      { className: 'fav' },
      el('div', { className: 'fav-head' }, el('button', { type: 'button', className: 'fav-name', onclick: () => openStation(f.station) }, board.name), starButton(f)),
      ...(list === 'label' ? [] : [list === 'rows' ? el('ol', { className: 'rows' }, ...departures.map((departure) => departureRow(departure, mapNow))) : el('p', { className: 'meta', textContent: t('noDepartures') })]),
    );
  };
  const line = (f: (typeof rows.lines)[number]) => {
    if (f.state !== 'shown' || !bundle) return el('li', { className: 'fav fav-line' }, el('div', { className: 'fav-row' }, el('span', { className: 'what' }, el('span', { className: 'what-title', textContent: f.name }), said(f.state === 'shown' ? 'loading' : f.state))), starButton(f));
    const { state, cancelled } = lineNow(bundle, tripsOfLine.of.get(f.id) ?? [], now, mapNow);
    const network = bundle.networks.find((n) => n.id === lines.get(f.id)?.network);
    const end = state.late ? el('span', { className: 'delay late', textContent: lateCount(state.late) }) : el('span', { className: 'status soft', textContent: state.trains ? t('noneLate') : '' });
    return el(
      'li',
      { className: 'fav fav-line' },
      el(
        'button',
        { type: 'button', className: 'fav-row', onclick: () => openLine(f.id) },
        pill(f.id),
        el('span', { className: 'what' }, el('span', { className: 'what-title', textContent: network?.name ?? '' }), el('span', { className: 'what-under parts' }, ...parts([...stateWords(state), ...(cancelled.length ? [cancelledCount(cancelled.length)] : [])]))),
        el('span', { className: 'end' }, end),
      ),
      starButton(f),
    );
  };
  return {
    header,
    body: [
      ...(rows.stations.length ? [el('h3', { className: 'label', textContent: t('stations') }), el('ol', { className: 'favs' }, ...rows.stations.map(station))] : []),
      ...(rows.lines.length ? [el('h3', { className: 'label', textContent: t('lines') }), el('ol', { className: 'favs' }, ...rows.lines.map(line))] : []),
      el('p', { className: 'meta keep', textContent: t('keptNote') }),
    ],
  };
}

/**
 * A Line's strip (#473): each Station a row along its colour, its whole row a button that opens its board, as a
 * followed Train's strip has them (stationLink()), marked as lineStrip() has it, with what the mark means under its
 * name; and each Train on the map a row after the Station it stands at or is between it and the next (onStrip()):
 * an arrow the way it goes along the strip, filled Live and ringed Scheduled, its pill, where it's headed, its
 * Delay or status, and under them its next Station it stops at and when it's due, or the one it stands at, the
 * whole row a button following it (#322).
 */
function lineRows(id: string, strip: StripStation[], trains: Followed[], now: number) {
  const rows = onStrip(strip, trains);
  const note = (s: StripStation) =>
    s.goOn ? goOn(s.goOn.n, stationName(s.goOn.to)) : s.branchOff ? branchOff(s.branchOff.n, stationName(s.branchOff.to)) : s.endsHere !== undefined ? endsHere(s.endsHere) : s.mark === 'turn' ? turnsHere(s.turns, s.calls) : '';
  const list = el(
    'ol',
    { className: 'strip line-strip' },
    ...strip.flatMap((s, i) => {
      const classes = ['stop', i === 0 ? 'origin' : '', i === strip.length - 1 ? 'terminus' : '', s.mark ?? ''].filter(Boolean).join(' ');
      const says = note(s);
      const label = [el('span', { className: 'stop-name', textContent: stationName(s.station) }), ...(says ? [el('span', { className: 'stop-note', textContent: says })] : [])];
      const station = el('li', { className: classes }, el('span', { className: 'mark' }), stationLink(s.station, el('span', {}, ...label)));
      const after = rows.filter((r) => r.after === i).map(({ train, way }) => {
        const { trip, live, delay, unreported, standsAt, upcoming } = train;
        const next = upcoming.find((c) => !c.skipped);
        const said = standsAt ? standingAt(stationName(standsAt)) : next ? nextAt(stationName(next.station), clock().format(due(next, false, next === upcoming.at(-1)).at)) : '';
        const cells = [
          pill(trip.line, { live, train: true }),
          el('span', { className: 'dest', textContent: `${way > 0 ? '↓' : '↑'} ${trip.headsign}` }),
          el('span', { className: 'end' }, status({ delay, live, unreported })),
          el('span', { className: 'sub', textContent: said.charAt(0).toLocaleUpperCase(locale()) + said.slice(1) }),
        ];
        const [button] = followButton(trip, next ? due(next, !!standsAt && next === upcoming[0], next === upcoming.at(-1)).at : now, cells);
        button?.classList.replace('row', 'train-row');
        return el('li', { className: `train ${live ? 'live' : 'scheduled'} ${way > 0 ? 'down' : 'up'}${i === strip.length - 1 ? ' beyond' : ''}${s.mark === 'spur' ? ' spur' : ''}` }, el('span', { className: 'mark' }, el('i')), ...(button ? [button] : []));
      });
      return [station, ...after];
    }),
  );
  list.setAttribute('aria-label', t('stations'));
  list.style.setProperty('--line', lines.get(id)?.colour ?? '');
  list.style.setProperty('--lettering', lettering(lines.get(id)?.colour ?? NO_COLOUR, cardColour));
  return list;
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
    el('time', {}, ...timeOfDay(departure), ...(off ? [] : countdown(departure, now))),
    pill(trip.line, { live, train: true }),
    el('span', { className: 'dest', textContent: trip.headsign }),
    off ? el('span', { className: `status ${off}`, textContent: t(cancelled ? 'cancelled' : 'notStopping') }) : status({ delay, live, unreported }),
  ];
  // A Cancelled one has no Train to follow (#322).
  return el('li', { className: off }, ...(cancelled ? cells : followButton(trip, departure, cells)));
}

/** A row that's a button following a Trip's Train, which a screen reader hears as its Line, where it's headed and when (#322): the cells that are its row, as it spreads them. */
function followButton(trip: Trip, at: number, cells: Node[]) {
  const label = followDeparture(lines.get(trip.line)?.name ?? '', trip.headsign, clock().format(at));
  const button = el('button', { type: 'button', className: 'row', onclick: () => openFrom(() => follow(trip.id)) }, ...cells);
  // With what the row says at its end, its Delay or that it isn't stopping, which the label would drop.
  const says = cells.at(-1)?.textContent?.trim();
  button.setAttribute('aria-label', says ? `${label}, ${says}` : label);
  return [button];
}

/**
 * What a row says at its end, and the followed Train beside its next time: its Delay as a chip, or
 * no live data, for a Scheduled Train its Network's live data leaves out (Train.unreported), or on
 * time, for a Live one; nothing for a Metro Train, which has no Delay to show.
 */
function status({ delay, live, unreported = false }: { delay?: number; live: boolean; unreported?: boolean }) {
  return delayChip(delay) ?? el('span', { className: 'status soft', textContent: unreported ? t('noLiveTrain') : live && delay !== undefined ? t('onTime') : '' });
}

/** The minutes to go until `at`, under a time within the hour, as a board's row words them, or now. */
function countdown(at: number, now: number): Node[] {
  const minutes = minutesTo(at, now);
  return minutes < 60 ? [el('span', { className: 'in', textContent: toGo(minutes, 'minutes') })] : [];
}

/**
 * The followed Train's time to go until `at`, its next Station's time: in seconds in its last minute, and before
 * that the minutes a board shows for it, within the hour, or now (countdownTo(), #456). One for its next Station's
 * row and for the status line of a Trip still to come.
 */
function followedCountdown(at: number, now: number): Node[] {
  const { n, unit } = countdownTo(at, now);
  return n < 60 ? [el('span', { className: 'in', textContent: toGo(n, unit === 'seconds' ? 'inSeconds' : 'inMinutes') })] : [];
}

/**
 * Search's sheet (#470, #471): its field at its top, which showSearch() focuses, with a clear button once
 * something's typed, under a heading for a screen reader; and under it, while it's empty, what it finds
 * (searchHints()), or what it finds for what's typed, section by section (results()), or that it finds
 * nothing: Lines and Stations from the file below zoom 7, every region's, and Train numbers from the Trips of the
 * regions the map has loaded, with where each one's Train is now (tripsAt()).
 */
function searchPanel(): Panel {
  // Not by el(), whose Partial<HTMLInputElement> is a union too large for tsc, with an input's `autocomplete`.
  const field = document.createElement('input');
  [field.type, field.className, field.placeholder, field.spellcheck] = ['search', 'search-field', t('searchPlaceholder'), false];
  field.oninput = () => search(field.value);
  field.setAttribute('aria-label', t('searchLabel'));
  field.setAttribute('autocomplete', 'off');
  // Names of Stations, which a phone's keyboard would otherwise correct to words it knows as a space follows them.
  field.setAttribute('autocorrect', 'off');
  field.setAttribute('enterkeyhint', 'search');
  const clearField = () => {
    const shown = panel.querySelector<HTMLInputElement>('.search-field');
    if (shown) shown.value = '';
    shown?.focus();
    search('');
  };
  const clear = el('button', { type: 'button', className: 'clear', title: t('clearSearch'), hidden: !query, onclick: clearField }, icon('close'));
  clear.setAttribute('aria-label', t('clearSearch'));
  // Its Enter, a phone keyboard's Search, puts the keyboard away, over what's found already.
  const submitted = (e: SubmitEvent) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const form = el('form', { className: 'card field', onsubmit: submitted }, icon('search'), field, clear);
  form.setAttribute('role', 'search');
  const header = el('header', {}, el('h2', { className: 'sr-only', textContent: t('search') }), form, closeButton(t('closeSearch')));
  if (!query.trim()) return { header, body: searchHints() };
  const trips = bundle ? numbered(bundle.trips, query) : [];
  const sections = results(query, searched, bundle && trips.length ? tripsAt(bundle, Date.now(), received, trips, hidingClosures) : [], [...searchedLines.values()]);
  if (!sections.length) return { header, body: [el('p', { className: 'empty', textContent: t('nothingFound').replace('{query}', query.trim()) })] };
  return { header, body: sections.flatMap((section) => ('lines' in section ? lineResults(section.lines) : 'places' in section ? stationResults(section.places) : trainResults(section))) };
}

/** Shows what Search finds for `text`, typed in its field, from the top (#471). */
function search(text: string) {
  query = text;
  showPanel();
  panel.querySelector('.sheet-body')?.scrollTo(0, 0);
}

/** What Search says it finds while its field is empty (#471): a Line, with its screen (#473), and a Station, beside examples of their names, and a Train number, which only Renfe's Trains have, of the parts of the map loaded. */
function searchHints(): Node[] {
  const hint = (lead: Node, what: string, under: string) =>
    el('li', {}, el('span', { className: 'lead' }, lead), el('span', { className: 'what' }, el('span', { className: 'what-title', textContent: what }), el('span', { className: 'what-under', textContent: under })));
  return [
    el('h3', { className: 'label', textContent: t('find') }),
    el('ul', { className: 'hints' }, hint(pill(SEARCH_EXAMPLES.line), t('aLine'), SEARCH_EXAMPLES.lines), hint(icon('station'), t('aStation'), SEARCH_EXAMPLES.stations), hint(el('b', { className: 'num', textContent: SEARCH_EXAMPLES.number }), t('aTrainNumber'), t('renfeOnly'))),
  ];
}

/**
 * Search's Lines (#473): a row for each Line it finds, with its pill and its Network, by its short name where it has
 * one (networkNames()), each a button that opens the Line's screen (openLine()).
 */
function lineResults(found: FoundLine[]): Node[] {
  const networks = networkNames(zoomedOut?.networks ?? []);
  const row = (line: FoundLine) =>
    el(
      'button',
      { type: 'button', className: 'result', onclick: () => openLine(line.id) },
      el('span', { className: 'lead' }, pill(line.id)),
      el('span', { className: 'what' }, el('span', { className: 'what-title', textContent: networks.get(line.network) ?? line.network })),
      el('span', { className: 'end' }, icon('right')),
    );
  return [el('h3', { className: 'label', textContent: t('lines') }), el('ol', { className: 'results' }, ...found.map((f) => el('li', {}, row(f))))];
}

/**
 * Search's Stations (#471): a row for each place it finds, with its name and its Lines' pills, and where another
 * it finds reads alike, its Networks, by their short names where they have them (networkNames()), each a button
 * that opens the place's board (openStation()).
 */
function stationResults(found: { place: Found; alike: boolean }[]): Node[] {
  const networks = networkNames(zoomedOut?.networks ?? []);
  const row = ({ place, alike }: { place: Found; alike: boolean }) =>
    el(
      'button',
      { type: 'button', className: 'result', onclick: () => openStation(place.stations[0] ?? '') },
      el('span', { className: 'lead' }, icon('station')),
      el(
        'span',
        { className: 'what' },
        el('span', { className: 'what-title' }, place.name, ...(alike ? [el('span', { className: 'soft', textContent: ` · ${place.networks.map((n) => networks.get(n) ?? n).join(', ')}` })] : [])),
        el('span', { className: 'what-under served' }, ...place.lines.map((line) => pill(line, { small: true }))),
      ),
      el('span', { className: 'end' }, icon('right')),
    );
  return [el('h3', { className: 'label', textContent: t('stations') }), el('ol', { className: 'results' }, ...found.map((f) => el('li', {}, row(f))))];
}

/**
 * Search's Train numbers (#471): a row for each Trip it shows (trainResult()), and how many more it found, whose
 * numbers start with what's typed.
 */
function trainResults({ trains, more }: { trains: TripNow[]; more: number }): Node[] {
  return [
    el('h3', { className: 'label', textContent: t('trainNumbers') }),
    el('ol', { className: 'results' }, ...trains.map((now) => el('li', {}, trainResult(now)))),
    ...(more ? [el('p', { className: 'meta more-results', textContent: moreNumbers(more, numberQuery(query) ?? '') })] : []),
  ];
}

/**
 * One of Search's Train rows (#471): its Line's pill, which tells a screen reader Live or Scheduled, as a
 * board's rows' do (#321), its number and where it's headed, and where its Train is now: Live or Scheduled, its
 * next Station it stops at and when it's due there, as the follow panel says it (due(), #607), with its Delay at
 * the row's end, as a board's; where and when it leaves; Cancelled; or when it ended. One running, on the map or
 * within a closed Closure that hides Trains, or still to leave is a button that follows its Train (#322), and one
 * Cancelled or ended follows nothing.
 */
function trainResult(now: TripNow): HTMLElement {
  const { trip } = now;
  const row = (live: boolean, follows: boolean, under: (Node | string)[], end: Node[] = []) => {
    const cells = [
      el('span', { className: 'lead' }, pill(trip.line, { live, train: follows })),
      el('span', { className: 'what' }, el('span', { className: 'what-title', textContent: trainTo(trip.number ?? '', trip.headsign) }), el('span', { className: 'what-under' }, ...under)),
      el('span', { className: 'end' }, ...end, ...(follows ? [icon('right')] : [])),
    ];
    return follows ? el('button', { type: 'button', className: 'result', onclick: () => openFrom(() => follow(trip.id)) }, ...cells) : el('div', { className: 'result' }, ...cells);
  };
  if ('cancelled' in now) return row(false, false, [el('span', { className: 'status cancelled', textContent: t('cancelled') })]);
  if ('ended' in now) return row(false, false, [t('endedAt').replace('{time}', clock().format(now.ended))]);
  const { upcoming, delay, live } = 'train' in now ? now.train : now.coming;
  if ('coming' in now && !now.coming.within) {
    const first = upcoming[0];
    return row(live, true, [first ? leavesAt(stationName(first.station), clock().format(first.departure)) : ''], [status({ delay, live })]);
  }
  const next = upcoming.find((c) => !c.skipped);
  const standing = 'train' in now && !!now.train.standsAt && next === upcoming[0];
  // Its pill says it to a screen reader already.
  const said = el('span', { textContent: `${t(live ? 'live' : 'scheduled')} · ` });
  said.setAttribute('aria-hidden', 'true');
  const where = next ? nextAt(stationName(next.station), clock().format(due(next, standing, next === upcoming.at(-1)).at)) : '';
  return row(live, true, [said, where], [status({ delay, live, unreported: 'train' in now && now.train.unreported })]);
}

/**
 * Opens a place's board from a Search row, by one of its Stations, as a link that names that Station alone
 * does (openLink(), #292): at once where its region is on the map, or once it has come, which loads meanwhile
 * wherever the map is (#266), Search's sheet showing till then; and the map eases onto it (#471).
 */
function openStation(station: string) {
  openedLink = `#station=${station}`;
  openLink(false);
}

/** Opens a Line's screen from a Search row, as a link that names it alone does (openLink(), #473): once its region's Trips have come, which load meanwhile wherever the map is, Search's sheet showing till then. */
function openLine(line: string) {
  openedLink = `#line=${line}`;
  openLink(false);
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
  const rows = nearbyRows(bundle ? nearbyAt(bundle, now, received, near, NEARBY, SOON, hidingClosures) : [], mapTime(now, received));
  said.append(el('p', { className: 'subtitle', textContent: t('passingNearby') }));
  // Where no Train passes, saying so is what a try found too, so the status says it, for a screen reader to
  // hear; but only once the Trips of the regions round the viewer have come (#266), which can be after the
  // viewer is found, as the map can't tell before: at once where no region is, though the map has loaded none.
  // Or the last look had a file fail, which the map looks for again soon and then each minute, as a board says
  // that none can be had then (#592), not its heading alone for as long as they fail.
  // ponytail: a screen reader hears the status again whenever a refresh empties the list, and maybe its
  // heading alone as the list fills; keep the status to what the try found if that's too chatty.
  if (!rows.length) {
    if (come({ nearby: { at: near, metres: NEARBY } }) || tripsFailed) said.append(el('p', { textContent: t('noneNearby') }));
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
 * fill says it. A pill naming a Line, not a Train, is filled, as operators' badges are. A Line of a
 * region the map hasn't loaded, as Search names at a Station, as the file below zoom 7 has it (#471).
 */
function pill(id: string, { live = true, train = false, small = false } = {}) {
  const line = lines.get(id) ?? searchedLines.get(id);
  const name = el('span', { className: `pill ${line ? outlineOf(line.kind) : 'round'} ${live ? 'live' : 'scheduled'}${small ? ' small' : ''}`, textContent: line?.name ?? '' });
  if (line) {
    name.style.setProperty('--line', line.colour);
    name.style.setProperty('--lettering', live ? (darkInk(line.colour) ? INK : '#fff') : lettering(line.colour, cardColour));
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
    ...(!manifest && manifestFailed ? [[t('timetableComing')]] : []),
    ...(neverLive ? [[t('noLive')]] : credited.filter((n) => bannerIds.unavailable.includes(n.id)).map((n) => bold(liveUnavailable(n.name), n.name))),
    ...credited.filter((n) => bannerIds.noTrips.includes(n.id)).map((n) => [el('b', { textContent: n.name }), `: ${t('noTimetable')}`]),
  ];
  banner.hidden = !rows.length;
  banner.replaceChildren(...rows.map((row) => el('div', { className: 'card warning' }, icon('warning'), el('span', {}, ...row))));
}

/**
 * Fills the About dialog, in the viewer's language, as it opens: in a machine-translated language, that
 * it is (#327); what the map shows and that its positions are estimates, that Iryo's Trains aren't
 * on it, as Iryo publishes nothing, and that Ouigo's are only Scheduled (ADR-0010); Reading the map, with the pills
 * a Train is drawn as, Live and Scheduled, and its outlines, drawn with the first of the map's Lines of
 * each kind of outline; the credits showCredits() lists there; the code and its licence; and privacy.
 */
function showAbout() {
  const machineTranslated = MACHINE_TRANSLATED[language()];
  const [round, pointed, slanted, square] = (['round', 'pointed', 'slanted', 'square'] as const).map((outline) => [...pills].find(([, p]) => p.outline === outline)?.[0]);
  // On a phone, About's handle closes it, as dragging it down does: a pointer's, as its close button is the keyboard's.
  const aboutHandle = el('button', { type: 'button', className: 'handle', tabIndex: -1, onclick: () => about.close() }, el('span'));
  aboutHandle.setAttribute('aria-hidden', 'true');
  // The dialog focuses its first focusable descendant as it opens unless one asks, and WebKit and Chromium
  // count the handle's tabindex -1: the close button asks (#382).
  const aboutClose = closeButton(t('close'), () => about.close());
  aboutClose.autofocus = true;
  about.setAttribute('aria-label', t('about'));
  about.replaceChildren(
    el('div', { className: 'sheet-top' }, aboutHandle, el('header', {}, el('h2', { className: 'title', textContent: t('about') }), aboutClose)),
    el(
      'div',
      { className: 'sheet-body' },
      ...(machineTranslated ? [el('p', { className: 'subtitle' }, ...linked(machineTranslated, 'GitHub', 'https://github.com/gariasf/viapeninsula/issues'))] : []),
      el('p', { textContent: t('estimates') }),
      el('p', { textContent: t('noIryo') }),
      el('p', { textContent: t('noLiveOuigo') }),
      el('h3', { className: 'label', textContent: t('readingTheMap') }),
      el(
        'ul',
        { className: 'keys' },
        el('li', {}, round ? pill(round) : '', el('span', {}, el('b', { textContent: t('live') }), `: ${t('liveMeans')}`)),
        el('li', {}, round ? pill(round, { live: false }) : '', el('span', {}, el('b', { textContent: t('scheduled') }), `: ${t('scheduledMeans')}`)),
      ),
      el('p', { className: 'shapes' }, ...[round, pointed, slanted, square].flatMap((line) => (line ? [pill(line)] : []))),
      el('p', { textContent: t('outlines') }),
      el('h3', { className: 'label', textContent: t('credits') }),
      aboutCredits,
      el('h3', { className: 'label', textContent: t('sourceCode') }),
      el(
        'p',
        {},
        opensInNewTab(el('a', { href: 'https://github.com/gariasf/viapeninsula', textContent: 'github.com/gariasf/viapeninsula' })),
        ', ',
        opensInNewTab(el('a', { href: 'https://www.gnu.org/licenses/agpl-3.0.html', textContent: 'AGPL-3.0' })),
      ),
      el('h3', { className: 'label', textContent: t('privacy') }),
      el('p', { textContent: t('noCookies') }),
      // Cloudflare's own pages on the data and metrics Web Analytics collects.
      el('p', {}, ...linked(t('visitsCounted'), 'Cloudflare Web Analytics', 'https://developers.cloudflare.com/web-analytics/data-metrics/')),
    ),
  );
}

/**
 * A sentence of About's, with a link to `href`, which opens in a new tab, round where it names `name`.
 * ponytail: every language names it so, once, as tests check. A language that words it otherwise needs
 * a placeholder in its string instead.
 */
function linked(text: string, name: string, href: string): (Node | string)[] {
  const [before = '', after = ''] = text.split(name);
  return [before, opensInNewTab(el('a', { href, textContent: name })), after];
}

/** Credits the basemap and each Network's data, in the viewer's language: behind the © button on a phone, in a strip on a wide window, and in the About dialog. */
function showCredits() {
  const html = [
    '<a href="https://openfreemap.org">OpenFreeMap</a> ' +
      '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> ' +
      `<a href="https://www.openstreetmap.org/copyright">${t('osmContributors')}</a>`,
    // Each source's once, however many Networks it feeds and credit it alike (ADR-0010). A track built
    // before #241 has no credits: its Networks get their names.
    ...new Set(credited.map((network) => (network.credit ? creditOf(network.credit) : network.name))),
  ];
  // The credits go in as they are, which is safe while they're all ours: these constants, t(), and the
  // credits and Network names the daily build publishes. Their links are written with no target: putHtml()
  // makes each open in a new tab as it's in, as every link on the page does (#585).
  const line = html.join(' | ');
  putHtml(creditsText, line);
  putHtml(creditsStrip, line);
  aboutCredits.replaceChildren(...html.map((credit) => putHtml(el('li'), credit)));
}

/** A source's credit, as its terms ask. */
function creditOf({ text, url, licence, updated }: Credit): string {
  return (
    `<a href="${url}">${text}</a>` +
    (licence ? `, ${LICENCES[licence]}` : '') +
    (updated ? `, ${t('updated')} ${new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(updated))}` : '')
  );
}

/**
 * The service days the map needs now, by the map's time (mapTime(), daysNeeded()), joined, where
 * they aren't the ones it shows: as each day's files come, the days that have, so that the map has the
 * first day's Trips when they come and the others' join as theirs do (daysAsTheyCome(), #593). A day's
 * bundle is its regions' (ADR-0014), those the map loads (`loaded`, #266), joined (joinTracks()), and a
 * day with none of them isn't loaded, as where the map opens zoomed out. A region whose file fails to
 * come is left out of its day, and a day whose bundle fails to come is left out; they're fetched again
 * next time. Today's track comes on its own first, so the map can draw it before the Trips come, or none
 * where no region's came, as the days then fail with why, and their Trips go on it as they come, until
 * every day's have, which are joined as they are. Notes today's Networks with no Trips, every region's,
 * which the banner names.
 * ponytail: the map's time is the device's until a snapshot corrects it, and the days follow a
 * correction only at the next refreshDays(), so for up to a minute after one, a device whose clock is
 * hours off can have the wrong days, and no Trains. Refresh them from poll() as a snapshot moves the
 * map's date, if that shows.
 */
async function neededDays(): Promise<{ track: Promise<Track | undefined>; arrivals: AsyncGenerator<Arrival> } | undefined> {
  // Until the map has one, it's tried MANIFEST_TRIES times, RETRY apart, as the banner says that the timetable is on
  // its way, and then by the looks after (#658); once it has one, a manifest that fails leaves it with the last.
  for (let tries = 1; ; tries++) {
    try {
      manifest = await getJson<Manifest>(`${LIVE_URL}/manifest.json`, { stall: STALL });
      if (manifestFailed) {
        manifestFailed = false;
        showBanner();
      }
      break;
    } catch (error) {
      manifestFailed = true;
      if (!manifest) showBanner();
      if (!manifest && tries === MANIFEST_TRIES) throw error;
      console.warn(error);
      if (manifest) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY));
    }
  }
  getZoomedOut(manifest);
  const wanted = neededRegions(manifest);
  for (const id of lookedOnce ? wanted : firstLook(manifest.regions ?? [], wanted)) loaded.add(id);
  if (!lookedOnce && wanted.some((id) => !loaded.has(id))) lookAgain = true;
  lookedOnce = true;
  // The next day's first Trains come SOON before they're on the map, so they're among the nearby Trains.
  // The days of the regions the map has loaded, by their own first and last Trains, not another region's (#659): one
  // set of days for all of them, so that each day has the same track; every region's where none is loaded, for their date.
  const [at, hours, every] = [mapTime(Date.now(), received), { early: SOON, late: LATE, emptyBoard }, daysOf(manifest)];
  const needed = daysNeeded(daysOf(manifest, loaded), at, hours) ?? daysNeeded(every, at, hours);
  if (!needed) throw new Error('The manifest names no service day');
  serviceToday = needed.today.date;
  noTripsIds = every.find((d) => d.date === serviceToday)?.noTrips ?? [];
  const days = needed.days.map((d): DayFiles => ({ ...d, regions: d.regions.filter((r) => loaded.has(r.id)) })).filter((d) => d.regions.length);
  const today = days.find((d) => d.date === serviceToday);
  const keys = days.flatMap((d) => d.regions.flatMap((r) => [r.track, r.trips]));
  if (!keys.length || keys.join() === shown) return undefined;
  for (const key of fetched.keys()) if (!keys.includes(key)) fetched.delete(key);
  forgetJoined(joinedTracks, keys);
  // A file of the look fails once no bytes of any of them have come for STALL, not of its own: one asked behind others waits its turn while theirs come (getJson(), #721).
  const progress = { at: 0 };
  const get = <T>(key: string) => {
    const file = fetched.get(key) ?? getJson<T>(`${LIVE_URL}/${key}`, { stall: STALL, progress }).then(inScheme);
    fetched.set(key, file);
    file.catch(() => fetched.delete(key));
    return file as Promise<T>;
  };
  // A region whose file fails to come is left out of its day, and fetched again next time.
  const load = regionLoader(get, joinedTracks);
  const cameOf = (done: DayFiles[]) => regionsCame(loaded, days, done, (file) => fetched.has(file));
  // Every day's files are asked for at once, here, as they were, and not when the first step is read, which comes
  // after today's track has been drawn: the other days' would then be asked for a round trip later.
  const steps = daysAsTheyCome(days, load.bundleOf, shownDays);
  const arrivals = (async function* () {
    for await (const { bundle: joined, came, lost, byDate, complete } of steps) {
      if (complete) {
        tripsFailed = load.failed();
        // Without today's bundle the days that came are on the map already, as they came, and the look ends here, to be
        // looked for again; without another day's, the map does without it until next time.
        for (const [day, reason] of lost) if (day === today) throw reason;
        if (lost.length) console.warn(...lost.map(([, reason]) => reason));
        shown = load.failed() || lost.length ? '' : keys.join();
      }
      if (!joined) throw new Error('No service day to show');
      shownDays = byDate;
      yield { days: joined, regions: cameOf(complete ? days : came), complete };
    }
  })();
  // Settled at once, as the map's first look awaits it only once the map has loaded.
  return { track: today ? load.trackOf(today).then((t) => t.track, () => undefined) : Promise.resolve(undefined), arrivals };
}

/** What a look for the days the map needs found as its files came: the days that had joined (daysAsTheyCome()), the regions with their Trips in them, and whether that's every day. */
interface Arrival {
  days: Bundle;
  regions: string[];
  complete: boolean;
}

/**
 * Shows the days the map needs now, where they've changed, a region new to it as its track comes,
 * before its Trips, as the map draws the first (#266). The Trains keep to the days shown meanwhile. One
 * look at a time: one asked for meanwhile, as the map comes onto a region, follows it (looked()).
 */
async function refreshDays() {
  if (document.hidden) return;
  if (looking) return void (lookAgain = true);
  looking = true;
  try {
    const needed = await neededDays();
    if (needed) {
      const track = await needed.track;
      if (track) show(track);
      await showArrivals(needed.arrivals);
    }
  } catch (error) {
    console.warn(error);
  } finally {
    looked();
  }
}

/**
 * Ends a look for the days the map needs, and looks again where one was asked for meanwhile; and, where it had
 * a file fail, once more 5 to 10 s on, for every viewer, before the minute's look takes over (#657).
 */
function looked() {
  [looking, daysComing] = [false, false];
  const soon = lookAgainSoon(tripsFailed || manifestFailed, failedRetried);
  failedRetried = soon.retried;
  if (soon.in !== undefined) setTimeout(refreshDays, soon.in);
  if (!lookAgain) return;
  lookAgain = false;
  refreshDays();
}

/**
 * Calls `then` once what the map has is on screen: the file below zoom 7, where the manifest names one, the tiles of the
 * Lines and the Network tracks, and any of the days' Trains in view, by what MapLibre renders; or after 5 s at most, as
 * where none is in view. The map's second look brings long distance's region (firstLook()), whose 1.5 MB track is read
 * and drawn on the page's one thread, which would hold back drawing the first's for seconds: its file came before
 * MapLibre had drawn them (#262).
 */
function onScreen(then: () => void) {
  const done = () => {
    map.off('render', check);
    clearTimeout(cap);
    then();
  };
  const check = () => {
    const trains = !bundle || map.queryRenderedFeatures({ layers: ['trains', 'train-pills'] }).length > 0;
    // The Lines' sources hold the tiles of the regions in the worker before its answer (linesIn), loaded but without them.
    if ((zoomedOut || !manifest?.zoomedOut) && trains && linesIn === linesVersion && ['lines', 'tracks'].every((id) => map.isSourceLoaded(id))) done();
  };
  const cap = setTimeout(done, 5000);
  map.on('render', check);
}

/** Shows each step of a look as it comes: the days that have, as the map's first day comes and the others join (neededDays(), #593). */
async function showArrivals(arrivals: AsyncIterable<Arrival>) {
  for await (const { days, regions, complete } of arrivals) showDays(days, regions, complete);
}

/**
 * Shows days that have come, with the regions whose files have (neededDays()), and opens a link that waited
 * for them. `complete` where every day the look is for has: the regions then are those whose Trips are all in,
 * which a board's and Nearby's saying that none can be had wait for, as another day's could add some.
 */
function showDays(days: Bundle, regions: string[], complete: boolean) {
  // Before every day has come, their Trips go on the track the map has.
  show(days, !complete);
  daysComing = !complete;
  joinedRegions = new Set(regions);
  if (complete) shownRegions = joinedRegions;
  openWaitingLink();
}

/**
 * The regions the map needs now (regionsNeeded(), #266): those in view, those every view loads, the
 * page's link's, as it was opened or pasted, or as the last Search row that opened a Station's board made it (#471),
 * those round the viewer, where Nearby has found them, and those of what Favourites keep, while it shows (#472). A link's region stays needed till the link changes,
 * after its board has closed too.
 */
function neededRegions({ regions = [] }: Manifest): string[] {
  const link = new URLSearchParams(openedLink.slice(1));
  const nearby = nearMe && typeof nearMe !== 'string' ? { at: nearMe, metres: NEARBY } : undefined;
  // What Favourites keep, while it shows (#472).
  const favs = favouritesShown ? kept.all() : [];
  const keptIds = { stations: favs.flatMap((f) => (f.kind === 'station' ? [f.station] : [])), lines: favs.flatMap((f) => (f.kind === 'line' ? [f.id] : [])) };
  return regionsNeeded(regions, { bounds: map.getBounds().toArray(), zoom: map.getZoom() }, { train: link.get('train'), line: link.get('line'), station: link.get('station'), stations: zoomedOut?.stations, nearby, kept: keptIds });
}

/** Looks for the days the map needs again where it needs a region it hasn't loaded (neededRegions()), as it comes into view. */
function want() {
  if (manifest && !neededRegions(manifest).every((id) => loaded.has(id))) refreshDays();
}

/**
 * Whether the days on the map have every region a link's Station or Train, or Nearby, needs
 * (regionsNeeded()): a Station's once the file below zoom 7 has said which they are, where the
 * manifest names one. By `regions` that have their Trips from every day the look is for (shownRegions),
 * which what a board and Nearby say of none being had wait for, as another day's could add some, or,
 * for a link, from the days that have come so far (joinedRegions, #593).
 */
function come(needs: { station?: string | null; train?: string | null; line?: string | null; nearby?: { at: Point; metres: number } }, regions = shownRegions): boolean {
  if (needs.station && !zoomedOut && manifest?.zoomedOut) return false;
  return regionsNeeded(manifest?.regions ?? [], undefined, { ...needs, stations: zoomedOut?.stations }).every((id) => regions.has(id));
}

/** Opens the page's link where it waited for its regions (openLink()), or a Search row's Station (openStation()), as the viewer hasn't opened another panel meanwhile (openPanel()), nor closed it (closePanel()). */
function openWaitingLink() {
  if (linkWaits) openLink(false);
}

/**
 * Gets the file below zoom 7 the manifest names (ZoomedOut, #266), where it's another than the map
 * has, and draws it as it comes, which opens a link whose Station waited for it to say where it is, and
 * gives Search its Stations (#471). Where it fails to come, it's got at the next look.
 */
function getZoomedOut({ zoomedOut: key }: Manifest) {
  if (!key || key === zoomedOutKey) return;
  zoomedOutKey = key;
  getJson<ZoomedOut>(`${LIVE_URL}/${key}`, { stall: STALL }).then(inScheme).then(
    (file) => {
      if (zoomedOutKey !== key) return;
      zoomedOut = file;
      [searched, searchedLines] = [searchPlaces(file), new Map((file.lines ?? []).map((l) => [l.id, l]))];
      showZoomedOut(file);
      openWaitingLink();
      // Search finds the Stations in it from now on, and their Lines (#471).
      if (searching) showPanel();
      // Favourites' kept Stations' regions are found in it (#472).
      if (favouritesShown) want();
    },
    (error: unknown) => {
      if (zoomedOutKey === key) zoomedOutKey = undefined;
      console.warn(error);
    },
  );
}

/** Fetches the live snapshot, and again 20 s later if the tab is still visible. */
async function poll() {
  let snapshot: Snapshot | undefined;
  try {
    // One that hangs gives up well before the next is due.
    snapshot = await getJson<Snapshot>(`${LIVE_URL}/snapshot.json`, { signal: AbortSignal.timeout(10_000) });
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
    alerts = await getJson<Alerts>(`${LIVE_URL}/alerts.json`, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    console.warn(error);
  }
  // And a minute on, the Closures within their hours then.
  drawClosures();
}
